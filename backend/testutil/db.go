//go:build integration

package testutil

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

var (
	dbOnce    sync.Once
	sharedDB  *pgxpool.Pool
	sharedErr error
)

// SharedDB returns a connection pool to a shared Postgres test container.
// Migrations are run once. Each call truncates all tables for test isolation.
func SharedDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbOnce.Do(func() {
		sharedDB, sharedErr = startTestDB()
	})
	if sharedErr != nil {
		t.Fatalf("test db setup: %v", sharedErr)
	}
	TruncateAll(t, sharedDB)
	return sharedDB
}

func startTestDB() (*pgxpool.Pool, error) {
	ctx := context.Background()

	opts := []testcontainers.ContainerCustomizer{
		tcpostgres.WithDatabase("chara_test"),
		tcpostgres.WithUsername("chara"),
		tcpostgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	}

	// Some hosts (notably Docker inside an unprivileged Proxmox LXC) ship an
	// AppArmor profile that blocks the AF_UNIX bind() Postgres needs for its
	// socket, so the container dies on boot with "could not create any
	// Unix-domain sockets". Opt out per-host by setting
	// CHARA_TEST_PG_APPARMOR_UNCONFINED=1 — left unset (e.g. in CI) this is a
	// no-op and the default seccomp/AppArmor profiles stay in force.
	if os.Getenv("CHARA_TEST_PG_APPARMOR_UNCONFINED") != "" {
		opts = append(opts, testcontainers.WithHostConfigModifier(func(hc *container.HostConfig) {
			hc.SecurityOpt = append(hc.SecurityOpt, "apparmor=unconfined")
		}))
	}

	pgContainer, err := tcpostgres.Run(ctx, "postgres:16-alpine", opts...)
	if err != nil {
		return nil, fmt.Errorf("start postgres container: %w", err)
	}

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return nil, fmt.Errorf("get connection string: %w", err)
	}

	if err := runMigrations(connStr); err != nil {
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	return pool, nil
}

func migrationsDir() string {
	// Anchor to this source file so the path works regardless of test cwd.
	_, file, _, _ := runtime.Caller(0)
	return "file://" + filepath.Join(filepath.Dir(file), "..", "migrations")
}

func runMigrations(connStr string) error {
	m, err := migrate.New(migrationsDir(), connStr)
	if err != nil {
		return err
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

// TruncateAll removes all rows from user-data tables in dependency order.
func TruncateAll(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	tables := []string{
		"push_tokens",
		"magic_link_tokens",
		"activity",
		"expense_splits",
		"expense_attachments",
		"expenses",
		"settlements",
		"recurring_expense_splits",
		"recurring_expenses",
		"group_members",
		"groups",
		"usage_counters",
		"waitlist_signups",
		"users",
		"fx_rates",
		// River tables — emptied between tests so leftover jobs don't
		// leak across cases. river_migration is left alone (it's the
		// migration ledger, not user data).
		"river_job",
		"river_leader",
		"river_queue",
		"river_client_queue",
		"river_client",
	}
	_, err := pool.Exec(context.Background(),
		"TRUNCATE TABLE "+strings.Join(tables, ", ")+" RESTART IDENTITY CASCADE",
	)
	if err != nil {
		t.Fatalf("truncate tables: %v", err)
	}
}
