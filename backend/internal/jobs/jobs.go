// Package jobs hosts the River-backed background workers for Chara.
// Currently the only resident: the recurring-expense tick + fire workers.
//
// River uses Postgres as the queue (no Redis). The client is bootstrapped
// from cmd/api/main.go behind the RECURRING_ENABLED config flag.
package jobs

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/DowLucas/chara/internal/db"
)

// TickInterval is how often the recurring-tick periodic job runs.
// 5 minutes is fine-grained enough for the daily/weekly/monthly cadence
// the rules support; finer would just busy-wait Postgres.
const TickInterval = 5 * time.Minute

// SummaryTickInterval is how often the monthly-summary tick asks whether
// this is the hour to fan out. Hourly: the job itself decides, and a tick
// that mostly no-ops costs one function call.
const SummaryTickInterval = time.Hour

// MonthlySummaryOptions configures the monthly summary jobs. Passed
// variadically so the existing three-argument call sites keep compiling;
// the zero value leaves the feature off, which is right for self-host.
type MonthlySummaryOptions struct {
	// Enabled adds the hourly tick. Hosted-only — the endpoint the push
	// deep-links to is behind HostedOnly, so a self-host tick would
	// notify users about a page that 404s.
	Enabled bool
	// Location is the zone the 1st-at-09:00 window is judged in. Nil = UTC.
	Location *time.Location
}

func firstSummaryOpts(opts []MonthlySummaryOptions) MonthlySummaryOptions {
	if len(opts) == 0 {
		return MonthlySummaryOptions{}
	}
	return opts[0]
}

// New builds a River client wired up with the recurring workers and the
// periodic tick. The caller owns lifecycle (Start/Stop). Returns nil with
// a non-nil error on misconfiguration so callers can fail-fast at boot.
func New(pool *pgxpool.Pool, workers *river.Workers, opts ...MonthlySummaryOptions) (*river.Client[pgx.Tx], error) {
	if pool == nil {
		return nil, fmt.Errorf("jobs.New: pool is nil")
	}
	if workers == nil {
		return nil, fmt.Errorf("jobs.New: workers is nil")
	}
	periodic := []*river.PeriodicJob{
		river.NewPeriodicJob(
			river.PeriodicInterval(TickInterval),
			func() (river.JobArgs, *river.InsertOpts) {
				return RecurringTickArgs{}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: true},
		),
		// Daily, and deliberately NOT RunOnStart: a prune has no
		// urgency, and running it on every boot would make a crash
		// loop hammer a delete over the whole table.
		river.NewPeriodicJob(
			river.PeriodicInterval(24*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return AIGenerationsPruneArgs{}, nil
			},
			nil,
		),
	}
	// RunOnStart deliberately off: a deploy inside the fire hour would
	// otherwise re-enqueue the fan-out on every restart. The hourly tick
	// still catches the window, and unique-by-args plus the ledger make a
	// second enqueue harmless — but not asking for it is cheaper.
	if firstSummaryOpts(opts).Enabled {
		periodic = append(periodic, river.NewPeriodicJob(
			river.PeriodicInterval(SummaryTickInterval),
			func() (river.JobArgs, *river.InsertOpts) {
				return MonthlySummaryTickArgs{}, nil
			},
			nil,
		))
	}

	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 10},
		},
		Workers:      workers,
		PeriodicJobs: periodic,
	})
	if err != nil {
		return nil, fmt.Errorf("jobs.New: %w", err)
	}
	return client, nil
}

// RegisterWorkers attaches the recurring + push workers to a fresh Workers
// bundle. Split out so tests can build the bundle independently.
func RegisterWorkers(pool *pgxpool.Pool, queries *db.Queries, baseURL string, expo expoSender, opts ...MonthlySummaryOptions) *river.Workers {
	workers := river.NewWorkers()
	river.AddWorker(workers, &RecurringTickWorker{Pool: pool, Queries: queries})
	river.AddWorker(workers, &RecurringFireWorker{Pool: pool, Queries: queries})
	river.AddWorker(workers, &PushNotifyWorker{Pool: pool, Queries: queries, Expo: expo, BaseURL: baseURL})
	river.AddWorker(workers, &SettleReminderWorker{Pool: pool, Queries: queries, Expo: expo, BaseURL: baseURL})
	river.AddWorker(workers, &BroadcastPushWorker{Pool: pool, Queries: queries, Expo: expo})
	river.AddWorker(workers, &AIGenerationsPruneWorker{Queries: queries})
	// Registered unconditionally: an unregistered worker makes River fail
	// any job of that kind still sitting in the queue from before the
	// feature was turned off. Nothing enqueues them unless New adds the
	// tick, so this is inert on self-host.
	river.AddWorker(workers, &MonthlySummaryTickWorker{Location: firstSummaryOpts(opts).Location})
	river.AddWorker(workers, &MonthlySummaryNotifyWorker{Pool: pool, Queries: queries, Expo: expo})
	return workers
}

// txBegin is a tiny shim used by tests that want to drive the workers
// without bringing up the full River client. Production code goes through
// the worker's Work method directly.
func txBegin(ctx context.Context, pool *pgxpool.Pool) (pgxConn, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return tx, nil
}

// pgxConn is the subset of pgx.Tx we use. Defined here to keep the
// pgxpool import sole-property of this file.
type pgxConn interface {
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}
