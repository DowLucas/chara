package jobs

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
)

// AIGenerationRetention is how long per-call AI telemetry is kept. Long
// enough to compare a model upgrade against the previous quarter, short
// enough that the table does not grow without bound on a busy instance.
const AIGenerationRetention = 180 * 24 * time.Hour

// AIGenerationsPruneArgs is the periodic job's payload. Empty — the prune
// has no parameters, it always deletes one retention window back.
type AIGenerationsPruneArgs struct{}

func (AIGenerationsPruneArgs) Kind() string { return "ai_generations_prune" }

// aiGenerationPruner is the narrow query surface the worker needs.
// *db.Queries satisfies it; tests inject a fake.
type aiGenerationPruner interface {
	DeleteAIGenerationsBefore(ctx context.Context, createdAt pgtype.Timestamptz) error
}

// AIGenerationsPruneWorker deletes ai_generations rows past the retention
// window. ai_generation_expenses rows cascade with them.
//
// Unlike the telemetry write, which is fire-and-forget so it can never
// fail a user's request, this job returns its error: River retries it, and
// a prune that fails silently leaves the table growing forever.
type AIGenerationsPruneWorker struct {
	river.WorkerDefaults[AIGenerationsPruneArgs]
	Queries aiGenerationPruner
	// Now is injectable so tests can pin the cutoff. Defaults to time.Now.
	Now func() time.Time
}

func (w *AIGenerationsPruneWorker) Work(ctx context.Context, _ *river.Job[AIGenerationsPruneArgs]) error {
	now := w.Now
	if now == nil {
		now = time.Now
	}
	cutoff := pgtype.Timestamptz{Time: now().Add(-AIGenerationRetention), Valid: true}
	if err := w.Queries.DeleteAIGenerationsBefore(ctx, cutoff); err != nil {
		return fmt.Errorf("ai_generations_prune: delete before %s: %w", cutoff.Time, err)
	}
	return nil
}
