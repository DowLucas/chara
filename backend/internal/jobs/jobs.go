// Package jobs hosts the River-backed background workers for Chara:
// the recurring-expense tick + fire workers and the unsettled-balance
// nudge tick + fire workers.
//
// River uses Postgres as the queue (no Redis). The client is bootstrapped
// from cmd/api/main.go behind the RECURRING_ENABLED / NUDGE_ENABLED
// config flags.
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
	"github.com/DowLucas/chara/internal/push"
)

// TickInterval is how often the recurring-tick periodic job runs.
// 5 minutes is fine-grained enough for the daily/weekly/monthly cadence
// the rules support; finer would just busy-wait Postgres.
const TickInterval = 5 * time.Minute

// New builds a River client wired up with the given workers and periodic
// jobs (see PeriodicJobs). The caller owns lifecycle (Start/Stop). Returns
// nil with a non-nil error on misconfiguration so callers can fail-fast at
// boot.
func New(pool *pgxpool.Pool, workers *river.Workers, periodicJobs []*river.PeriodicJob) (*river.Client[pgx.Tx], error) {
	if pool == nil {
		return nil, fmt.Errorf("jobs.New: pool is nil")
	}
	if workers == nil {
		return nil, fmt.Errorf("jobs.New: workers is nil")
	}
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 10},
		},
		Workers:      workers,
		PeriodicJobs: periodicJobs,
	})
	if err != nil {
		return nil, fmt.Errorf("jobs.New: %w", err)
	}
	return client, nil
}

// PeriodicJobs builds the periodic-job schedule, including only the ticks
// whose feature flag is on: recurring → RecurringTickArgs every TickInterval,
// nudge → NudgeTickArgs every NudgeTickInterval. Both run on start so a
// freshly-booted instance doesn't idle for a full interval before its first
// scan. The corresponding workers must be registered (RegisterWorkers /
// RegisterNudgeWorkers) or River will reject the enqueued job kind.
func PeriodicJobs(recurring, nudge bool) []*river.PeriodicJob {
	var jobs []*river.PeriodicJob
	if recurring {
		jobs = append(jobs, river.NewPeriodicJob(
			river.PeriodicInterval(TickInterval),
			func() (river.JobArgs, *river.InsertOpts) { return RecurringTickArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true},
		))
	}
	if nudge {
		jobs = append(jobs, river.NewPeriodicJob(
			river.PeriodicInterval(NudgeTickInterval),
			func() (river.JobArgs, *river.InsertOpts) { return NudgeTickArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true},
		))
	}
	return jobs
}

// RegisterWorkers attaches the two recurring workers to a fresh Workers
// bundle. Split out so tests can build the bundle independently.
func RegisterWorkers(pool *pgxpool.Pool, queries *db.Queries) *river.Workers {
	workers := river.NewWorkers()
	river.AddWorker(workers, &RecurringTickWorker{Pool: pool, Queries: queries})
	river.AddWorker(workers, &RecurringFireWorker{Pool: pool, Queries: queries})
	return workers
}

// RegisterNudgeWorkers attaches the nudge tick + fire workers to an existing
// Workers bundle (built by RegisterWorkers). Kept separate so the nudge
// feature can be wired independently of the recurring one.
func RegisterNudgeWorkers(workers *river.Workers, pool *pgxpool.Pool, queries *db.Queries, sender push.Sender, cfg NudgeConfig) {
	river.AddWorker(workers, &NudgeTickWorker{Pool: pool, Queries: queries, Cfg: cfg})
	river.AddWorker(workers, &NudgeFireWorker{Pool: pool, Queries: queries, Sender: sender, Cfg: cfg})
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
