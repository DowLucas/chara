//go:build integration

package testutil

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

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

	pgContainer, err := tcpostgres.Run(ctx,
		"postgres:16-alpine",
		tcpostgres.WithDatabase("chara_test"),
		tcpostgres.WithUsername("chara"),
		tcpostgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
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
		"group_members",
		"groups",
		"usage_counters",
		"waitlist_signups",
		"users",
		"fx_rates",
	}
	_, err := pool.Exec(context.Background(),
		"TRUNCATE TABLE "+strings.Join(tables, ", ")+" RESTART IDENTITY CASCADE",
	)
	if err != nil {
		t.Fatalf("truncate tables: %v", err)
	}
}
