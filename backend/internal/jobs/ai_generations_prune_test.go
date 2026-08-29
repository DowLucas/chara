package jobs

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type fakePruner struct {
	got  pgtype.Timestamptz
	err  error
	call int
}

func (f *fakePruner) DeleteAIGenerationsBefore(_ context.Context, t pgtype.Timestamptz) error {
	f.call++
	f.got = t
	return f.err
}

func TestAIGenerationsPruneDeletesBeforeRetentionWindow(t *testing.T) {
	pruner := &fakePruner{}
	w := &AIGenerationsPruneWorker{
		Queries: pruner,
		Now:     func() time.Time { return time.Date(2026, 8, 29, 0, 0, 0, 0, time.UTC) },
	}

	if err := w.Work(context.Background(), nil); err != nil {
		t.Fatalf("Work returned error: %v", err)
	}
	if pruner.call != 1 {
		t.Fatalf("delete called %d times, want 1", pruner.call)
	}
	want := time.Date(2026, 8, 29, 0, 0, 0, 0, time.UTC).Add(-AIGenerationRetention)
	if !pruner.got.Valid {
		t.Fatal("cutoff timestamp is not valid")
	}
	if !pruner.got.Time.Equal(want) {
		t.Errorf("cutoff = %s, want %s", pruner.got.Time, want)
	}
}

func TestAIGenerationsPruneRetentionIs180Days(t *testing.T) {
	if got := AIGenerationRetention; got != 180*24*time.Hour {
		t.Errorf("AIGenerationRetention = %s, want 4320h", got)
	}
}

func TestAIGenerationsPrunePropagatesErrors(t *testing.T) {
	// Unlike the telemetry write itself, the prune job SHOULD fail loudly:
	// River retries it, and a silently non-pruning table grows forever.
	w := &AIGenerationsPruneWorker{
		Queries: &fakePruner{err: errors.New("boom")},
		Now:     time.Now,
	}
	if err := w.Work(context.Background(), nil); err == nil {
		t.Error("Work returned nil error, want the store's error")
	}
}

func TestAIGenerationsPruneDefaultsNowToWallClock(t *testing.T) {
	pruner := &fakePruner{}
	w := &AIGenerationsPruneWorker{Queries: pruner}
	if err := w.Work(context.Background(), nil); err != nil {
		t.Fatalf("Work returned error: %v", err)
	}
	if pruner.got.Time.After(time.Now().Add(-AIGenerationRetention).Add(time.Minute)) {
		t.Errorf("cutoff %s is not roughly one retention window ago", pruner.got.Time)
	}
}
