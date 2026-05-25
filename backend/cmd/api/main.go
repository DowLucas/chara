package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/fx"
	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	if err := runMigrations(cfg.DatabaseURL); err != nil {
		slog.Error("migrations failed", "error", err)
		os.Exit(1)
	}

	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	queries := db.New(pool)

	jwtSvc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:          cfg.InstanceMode,
		Secret:        cfg.JWTSecret,
		PrivateKeyPEM: cfg.JWTPrivateKeyPEM,
		PublicKeyPEM:  cfg.JWTPublicKeyPEM,
		Issuer:        cfg.BaseURL,
	})
	if err != nil {
		slog.Error("failed to create JWT service", "error", err)
		os.Exit(1)
	}

	// Object storage is optional in dev (handlers fall through to 503 if
	// the bucket isn't reachable), but should be configured for any real
	// instance. Boot-time fast-fail is acceptable in this dev profile;
	// see /backend/.env.example for the env vars.
	var store *storage.Client
	if cfg.S3Endpoint != "" {
		storeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := storage.New(storeCtx, storage.Config{
			Endpoint:  cfg.S3Endpoint,
			Bucket:    cfg.S3Bucket,
			AccessKey: cfg.S3AccessKey,
			SecretKey: cfg.S3SecretKey,
			Region:    cfg.S3Region,
		})
		cancel()
		if err != nil {
			slog.Error("storage init failed", "error", err)
			os.Exit(1)
		}
		store = s
		slog.Info("storage ready", "bucket", store.Bucket(), "endpoint", cfg.S3Endpoint)
	} else {
		slog.Warn("S3_ENDPOINT not set; receipt attachments will be unavailable")
	}

	// River-backed recurring-expense queue. Bootstrapped behind
	// RECURRING_ENABLED (default off) so the API still starts cleanly on
	// instances that haven't yet rolled out the queue tables.
	if cfg.RecurringEnabled {
		workers := jobs.RegisterWorkers(pool, queries)
		rc, err := jobs.New(pool, workers)
		if err != nil {
			slog.Error("recurring: river client init failed", "error", err)
			os.Exit(1)
		}
		if err := rc.Start(context.Background()); err != nil {
			slog.Error("recurring: river start failed", "error", err)
			os.Exit(1)
		}
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := rc.Stop(ctx); err != nil {
				slog.Warn("recurring: river stop returned error", "error", err)
			}
		}()
		slog.Info("recurring: river queue started")
	}

	srv := &http.Server{
		Addr:         cfg.Addr,
		Handler:      server.New(cfg, pool, queries, jwtSvc, store),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("server starting", "addr", cfg.Addr, "mode", cfg.InstanceMode)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// FX sync runs alongside the HTTP server. Failures are logged but never
	// crash the process — a stale-rate cache is preferable to refusing to
	// serve any request because ECB is down.
	syncerCtx, cancelSyncer := context.WithCancel(context.Background())
	go (&fx.Syncer{Pool: pool}).Run(syncerCtx)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	cancelSyncer()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	slog.Info("shutting down gracefully")
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}

func runMigrations(databaseURL string) error {
	m, err := migrate.New("file://migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("migrate.New: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate.Up: %w", err)
	}
	return nil
}
