//go:build integration

package jobs_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/testutil"
)

// setupRule is a small helper that creates a group, two members, and a
// recurring rule whose splits cover both members equally.
func setupRule(t *testing.T, env *testutil.Env, seed testutil.RecurringSeed) (db.RecurringExpense, db.Group, db.User, []db.GroupMember) {
	t.Helper()
	owner := testutil.CreateUser(t, env.Pool, "owner-"+ulidSuffix()+"@test", "Owner")
	group, ownerMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", owner.ID, "Owner")
	otherUser := testutil.CreateUser(t, env.Pool, "other-"+ulidSuffix()+"@test", "Other")
	otherMember := testutil.AddMember(t, env.Pool, group.ID, otherUser.ID, "Other")

	rule := testutil.SeedRecurringExpense(
		t, env.Pool, group.ID, owner.ID, ownerMember.ID,
		[]string{ownerMember.ID, otherMember.ID},
		seed,
	)
	return rule, group, owner, []db.GroupMember{ownerMember, otherMember}
}

func ulidSuffix() string {
	// Avoid pulling in ulid here; nanos are unique enough for test emails.
	return time.Now().Format("150405.000000000")
}

func fireOnce(t *testing.T, env *testutil.Env, ruleID string, at time.Time) {
	t.Helper()
	w := &jobs.RecurringFireWorker{Pool: env.Pool, Queries: env.Queries}
	require.NoError(t, jobs.FireForTest(context.Background(), w, jobs.RecurringFireArgs{
		RecurringID: ruleID, FireAt: at,
	}))
}

func TestRecurringFire_HappyPath(t *testing.T) {
	env := testutil.NewEnv(t)
	rule, group, _, _ := setupRule(t, env, testutil.RecurringSeed{
		AmountMinor: 1000,
		Currency:    "SEK",
		FreqUnit:    "month",
		FreqInterval: 1,
		NextFireAt:  time.Now().UTC(),
		StartDate:   time.Now().UTC().AddDate(0, -1, 0),
	})

	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	// Exactly one expense should exist.
	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, int64(1000), rows[0].Amount)

	// source_kind/source_id are written by expense.Create but not
	// returned in ListExpensesByGroup — verify directly.
	var sourceKind, sourceID pgtype.Text
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		`SELECT source_kind, source_id FROM expenses WHERE id = $1`, rows[0].ID,
	).Scan(&sourceKind, &sourceID))
	require.True(t, sourceKind.Valid)
	require.Equal(t, "recurring", sourceKind.String)
	require.Equal(t, rule.ID, sourceID.String)

	// Splits should sum to amount, with non-zero values.
	splits, err := env.Queries.ListSplitsByExpense(context.Background(), rows[0].ID)
	require.NoError(t, err)
	require.Len(t, splits, 2)
	var sum int64
	for _, s := range splits {
		require.Greater(t, s.Share, int64(0), "split must be non-zero")
		sum += s.Share
	}
	require.Equal(t, int64(1000), sum)

	// next_fire_at advanced.
	updated, err := env.Queries.GetRecurringExpense(context.Background(), rule.ID)
	require.NoError(t, err)
	require.True(t, updated.LastFireAt.Valid)
	require.True(t, updated.NextFireAt.Time.After(rule.NextFireAt.Time))
}

func TestRecurringFire_CatchUpWithinCap(t *testing.T) {
	env := testutil.NewEnv(t)
	// Daily rule with last_fire_at 5 days ago. The fire job should
	// materialize 5 expenses to catch up.
	last := time.Now().UTC().Add(-5 * 24 * time.Hour)
	rule, group, _, _ := setupRule(t, env, testutil.RecurringSeed{
		AmountMinor:  900,
		Currency:     "SEK",
		FreqUnit:     "day",
		FreqInterval: 1,
		StartDate:    last,
		NextFireAt:   last.Add(24 * time.Hour),
		LastFireAt:   &last,
	})

	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(rows), 4, "expected catch-up to materialize multiple expenses")
	require.LessOrEqual(t, len(rows), 6, "should not exceed natural catch-up count")
	for _, r := range rows {
		require.Equal(t, int64(900), r.Amount)
	}
}

func TestRecurringFire_CatchUpOverflow(t *testing.T) {
	env := testutil.NewEnv(t)
	// Daily rule with last_fire_at 25 days ago — well past the 20x guard.
	last := time.Now().UTC().Add(-25 * 24 * time.Hour)
	rule, group, _, _ := setupRule(t, env, testutil.RecurringSeed{
		AmountMinor:  500,
		FreqUnit:     "day",
		FreqInterval: 1,
		StartDate:    last,
		NextFireAt:   last.Add(24 * time.Hour),
		LastFireAt:   &last,
	})

	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Empty(t, rows, "catch-up overflow must write zero expenses")

	updated, err := env.Queries.GetRecurringExpense(context.Background(), rule.ID)
	require.NoError(t, err)
	require.Equal(t, "paused", updated.Status)
	require.True(t, updated.PausedReason.Valid)
	require.Equal(t, "catchup_overflow", updated.PausedReason.String)
}

func TestRecurringFire_MemberLeftPause(t *testing.T) {
	env := testutil.NewEnv(t)
	rule, group, _, members := setupRule(t, env, testutil.RecurringSeed{
		AmountMinor: 800,
		NextFireAt:  time.Now().UTC(),
	})
	// Mirror the production sequence: handler pauses affected rules
	// in the same tx as the member removal. The recurring_expense_splits
	// row is cascaded on member delete but the pause has already landed.
	_, err := env.Queries.PauseRecurringExpensesAffectedByMember(context.Background(),
		db.PauseRecurringExpensesAffectedByMemberParams{
			GroupID:  group.ID,
			MemberID: members[1].ID,
		})
	require.NoError(t, err)
	require.NoError(t, env.Queries.DeleteGroupMember(context.Background(), members[1].ID))

	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Empty(t, rows)
	updated, err := env.Queries.GetRecurringExpense(context.Background(), rule.ID)
	require.NoError(t, err)
	require.Equal(t, "paused", updated.Status)
	require.Equal(t, "member_left", updated.PausedReason.String)
}

func TestRecurringFire_LockedGroupPause(t *testing.T) {
	env := testutil.NewEnv(t)
	rule, group, _, _ := setupRule(t, env, testutil.RecurringSeed{
		AmountMinor: 700,
		NextFireAt:  time.Now().UTC(),
	})
	// Lock the group via direct query.
	_, err := env.Queries.SetGroupLocked(context.Background(), db.SetGroupLockedParams{
		ID: group.ID, IsLocked: true,
	})
	require.NoError(t, err)

	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Empty(t, rows)
	updated, err := env.Queries.GetRecurringExpense(context.Background(), rule.ID)
	require.NoError(t, err)
	require.Equal(t, "paused", updated.Status)
	require.Equal(t, "group_locked", updated.PausedReason.String)

	// Re-firing the same rule while paused is a clean no-op.
	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)
	rows, err = env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestRecurringFire_RuleDeletedMidTick(t *testing.T) {
	env := testutil.NewEnv(t)
	rule, _, _, _ := setupRule(t, env, testutil.RecurringSeed{
		NextFireAt: time.Now().UTC(),
	})
	require.NoError(t, env.Queries.DeleteRecurringSplits(context.Background(), rule.ID))
	require.NoError(t, env.Queries.DeleteRecurringExpense(context.Background(), rule.ID))

	// Should NOT return an error.
	w := &jobs.RecurringFireWorker{Pool: env.Pool, Queries: env.Queries}
	err := jobs.FireForTest(context.Background(), w, jobs.RecurringFireArgs{
		RecurringID: rule.ID, FireAt: time.Now().UTC(),
	})
	require.NoError(t, err)
}

func TestRecurringFire_ConcurrentIdempotency(t *testing.T) {
	env := testutil.NewEnv(t)
	rule, group, _, _ := setupRule(t, env, testutil.RecurringSeed{
		AmountMinor: 600,
		NextFireAt:  time.Now().UTC(),
	})

	// Fire twice with the same FireAt. Second call should be the
	// idempotency no-op (last_fire_at >= FireAt).
	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)
	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1, "duplicate fire must not create a second expense")
}

func TestRecurringFire_ExactSplits(t *testing.T) {
	// Smoke test for the exact split path. Ensures the worker doesn't
	// only work for "equal".
	env := testutil.NewEnv(t)
	owner := testutil.CreateUser(t, env.Pool, "exact-"+ulidSuffix()+"@test", "Owner")
	group, ownerMember := testutil.CreateGroup(t, env.Pool, "Exact", "SEK", owner.ID, "Owner")
	otherUser := testutil.CreateUser(t, env.Pool, "exact2-"+ulidSuffix()+"@test", "Other")
	otherMember := testutil.AddMember(t, env.Pool, group.ID, otherUser.ID, "Other")

	rule := testutil.SeedRecurringExpense(
		t, env.Pool, group.ID, owner.ID, ownerMember.ID,
		[]string{ownerMember.ID, otherMember.ID},
		testutil.RecurringSeed{
			AmountMinor: 1000,
			SplitMethod: "exact",
			SplitValues: map[string]int64{
				ownerMember.ID: 300,
				otherMember.ID: 700,
			},
			NextFireAt: time.Now().UTC(),
		},
	)

	fireOnce(t, env, rule.ID, rule.NextFireAt.Time)

	rows, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: group.ID, Limit: 10,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	splits, err := env.Queries.ListSplitsByExpense(context.Background(), rows[0].ID)
	require.NoError(t, err)
	got := map[string]int64{}
	for _, s := range splits {
		got[s.MemberID] = s.Share
	}
	require.Equal(t, int64(300), got[ownerMember.ID])
	require.Equal(t, int64(700), got[otherMember.ID])
}

// Silence unused-import lint for pgtype if all references are removed.
var _ = pgtype.Text{}
