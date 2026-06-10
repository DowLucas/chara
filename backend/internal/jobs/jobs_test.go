//go:build integration

package jobs_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/testutil"
)

// TestRecurringClientStarts is a smoke test that the River client
// builds and starts successfully against a Postgres with the vendored
// river migrations applied.
func TestRecurringClientStarts(t *testing.T) {
	env := testutil.NewEnv(t)
	workers := jobs.RegisterWorkers(env.Pool, env.Queries)
	rc, err := jobs.New(env.Pool, workers, jobs.PeriodicJobs(true, false))
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	require.NoError(t, rc.Start(ctx))
	stopCtx, stopCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer stopCancel()
	require.NoError(t, rc.Stop(stopCtx))
}

// TestRecurringTick_EnqueuesDueRules verifies that the tick worker
// finds due rules and enqueues a RecurringFireArgs job for each.
func TestRecurringTick_EnqueuesDueRules(t *testing.T) {
	env := testutil.NewEnv(t)

	// Seed two due rules and one rule scheduled for the future.
	owner := testutil.CreateUser(t, env.Pool, "tick-"+ulidSuffix()+"@test", "Owner")
	group, ownerMember := testutil.CreateGroup(t, env.Pool, "Tick", "SEK", owner.ID, "Owner")
	other := testutil.CreateUser(t, env.Pool, "tick2-"+ulidSuffix()+"@test", "Other")
	otherMember := testutil.AddMember(t, env.Pool, group.ID, other.ID, "Other")

	dueRule1 := testutil.SeedRecurringExpense(t, env.Pool, group.ID, owner.ID, ownerMember.ID,
		[]string{ownerMember.ID, otherMember.ID},
		testutil.RecurringSeed{Title: "Due 1", NextFireAt: time.Now().UTC().Add(-time.Hour)})
	dueRule2 := testutil.SeedRecurringExpense(t, env.Pool, group.ID, owner.ID, ownerMember.ID,
		[]string{ownerMember.ID, otherMember.ID},
		testutil.RecurringSeed{Title: "Due 2", NextFireAt: time.Now().UTC().Add(-time.Minute)})
	_ = testutil.SeedRecurringExpense(t, env.Pool, group.ID, owner.ID, ownerMember.ID,
		[]string{ownerMember.ID, otherMember.ID},
		testutil.RecurringSeed{Title: "Future", NextFireAt: time.Now().UTC().Add(time.Hour)})

	// Build a real River client + workers and drive the tick.
	workers := jobs.RegisterWorkers(env.Pool, env.Queries)
	rc, err := jobs.New(env.Pool, workers, jobs.PeriodicJobs(true, false))
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	require.NoError(t, rc.Start(ctx))
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer stopCancel()
		_ = rc.Stop(stopCtx)
	}()

	// The tick periodic job has RunOnStart=true, so it ran on Start.
	// Wait briefly for fire jobs to complete.
	deadline := time.Now().Add(10 * time.Second)
	var dueRule1Fired, dueRule2Fired bool
	for time.Now().Before(deadline) {
		r1, err := env.Queries.GetRecurringExpense(context.Background(), dueRule1.ID)
		require.NoError(t, err)
		r2, err := env.Queries.GetRecurringExpense(context.Background(), dueRule2.ID)
		require.NoError(t, err)
		dueRule1Fired = r1.LastFireAt.Valid
		dueRule2Fired = r2.LastFireAt.Valid
		if dueRule1Fired && dueRule2Fired {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	require.True(t, dueRule1Fired, "due rule 1 should have fired")
	require.True(t, dueRule2Fired, "due rule 2 should have fired")
}

// Keep pgx import alive (used indirectly through env).
var _ pgx.Tx = nil
