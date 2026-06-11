package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/DowLucas/chara/internal/db"
)

// NudgeTickInterval is how often the nudge tick scans for stale debtor
// balances. Six hours: the eligibility windows are measured in days, so
// anything finer would just re-run the same scan.
const NudgeTickInterval = 6 * time.Hour

// NudgeSelectLimit caps how many (user, group) pairs a single tick will
// enqueue. The next tick picks up the remainder.
const NudgeSelectLimit = 500

// NudgeConfig carries the env-derived knobs shared by the nudge workers.
type NudgeConfig struct {
	// AfterDays: a debt must sit unchanged this many days before the
	// first nudge. RepeatDays: minimum gap between nudges per (user, group).
	AfterDays  int
	RepeatDays int
	// ServerURL is this instance's public base URL (cfg.BaseURL). It is
	// embedded in the notification deep link so the multi-server app can
	// route to the right account.
	ServerURL string
}

// NudgeTickArgs is the periodic job's payload. Empty — the tick always
// asks "which stale debtor balances are nudgeable right now?".
type NudgeTickArgs struct{}

func (NudgeTickArgs) Kind() string { return "nudge_tick" }

// NudgeTickWorker selects eligible (user, group) pairs and enqueues one
// NudgeFireArgs per pair. Duplicate enqueues are suppressed by River's
// UniqueOpts; the fire worker re-checks eligibility, so a stray duplicate
// is harmless anyway.
type NudgeTickWorker struct {
	river.WorkerDefaults[NudgeTickArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Cfg     NudgeConfig
}

func (w *NudgeTickWorker) Work(ctx context.Context, _ *river.Job[NudgeTickArgs]) error {
	if w.Cfg.ServerURL == "" {
		slog.Warn("nudge_tick: ServerURL (BASE_URL) is not configured; skipping")
		return nil
	}
	client := river.ClientFromContext[pgx.Tx](ctx)
	if client == nil {
		return fmt.Errorf("nudge_tick: no River client in context")
	}

	pairs, err := w.Queries.SelectNudgeEligiblePairs(ctx, db.SelectNudgeEligiblePairsParams{
		AfterDays:  int32(w.Cfg.AfterDays),
		RepeatDays: int32(w.Cfg.RepeatDays),
		MaxPairs:   NudgeSelectLimit,
	})
	if err != nil {
		return fmt.Errorf("nudge_tick: select eligible: %w", err)
	}

	for _, p := range pairs {
		_, err := client.Insert(ctx, NudgeFireArgs{
			UserID:  p.UserID,
			GroupID: p.GroupID,
		}, &river.InsertOpts{
			UniqueOpts: river.UniqueOpts{
				ByArgs: true,
				ByState: []rivertype.JobState{
					rivertype.JobStateAvailable,
					rivertype.JobStatePending,
					rivertype.JobStateRunning,
					rivertype.JobStateRetryable,
					rivertype.JobStateScheduled,
				},
			},
		})
		if err != nil {
			// Best-effort log + continue: one failing enqueue shouldn't
			// block the rest; the pair stays eligible for the next tick.
			slog.Warn("nudge_tick: enqueue failed",
				"user_id", p.UserID, "group_id", p.GroupID, "err", err)
		}
	}
	return nil
}
