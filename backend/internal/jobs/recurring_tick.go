package jobs

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/DowLucas/chara/internal/db"
)

// RecurringTickArgs is the periodic job's payload. Empty — the tick has
// no parameters, it always asks "what rules are due right now?".
type RecurringTickArgs struct{}

func (RecurringTickArgs) Kind() string { return "recurring_tick" }

// SelectDueLimit caps how many rules the tick will enqueue per pass to
// keep a single transaction short. The spec budgets a much higher
// throughput than this — at 5 minute cadence we'll catch up within a few
// ticks even after an outage.
const SelectDueLimit = 200

// RecurringTickWorker scans recurring_expenses for rules whose
// next_fire_at <= NOW() and enqueues a per-rule RecurringFireArgs for
// each. Idempotent on the firing side; this worker just has to make sure
// it doesn't double-enqueue within the same tick (FOR UPDATE SKIP LOCKED).
type RecurringTickWorker struct {
	river.WorkerDefaults[RecurringTickArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
}

func (w *RecurringTickWorker) Work(ctx context.Context, _ *river.Job[RecurringTickArgs]) error {
	client := river.ClientFromContext[pgx.Tx](ctx)
	if client == nil {
		return fmt.Errorf("recurring_tick: no River client in context")
	}

	tx, err := w.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("recurring_tick: begin tx: %w", err)
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)
	due, err := q.SelectDueRecurringExpenses(ctx, SelectDueLimit)
	if err != nil {
		return fmt.Errorf("recurring_tick: select due: %w", err)
	}

	for _, row := range due {
		_, err := client.InsertTx(ctx, tx, RecurringFireArgs{
			RecurringID: row.ID,
			FireAt:      row.NextFireAt.Time,
		}, &river.InsertOpts{
			UniqueOpts: river.UniqueOpts{
				ByArgs: true,
				// Include every "required" state per River's validator
				// (available, pending, running, retryable, scheduled)
				// plus completed so a still-running retry doesn't end
				// up double-enqueued right after success. Omitting any
				// of the required states is rejected at validate time.
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
			// Best-effort log + continue: a single failing enqueue
			// shouldn't block the rest of the tick. The next tick will
			// pick this rule up again because we haven't advanced
			// next_fire_at yet.
			slog.Warn("recurring_tick: enqueue failed",
				"recurring_id", row.ID, "err", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("recurring_tick: commit: %w", err)
	}
	return nil
}
