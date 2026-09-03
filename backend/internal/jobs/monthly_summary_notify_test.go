//go:build integration

package jobs_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/testutil"
)

// summaryPeriod is a month safely in the past, so a fixture expense dated
// inside it can never collide with "now".
const summaryPeriod = "2026-04"

func summaryDay(day int) time.Time {
	return time.Date(2026, 4, day, 12, 0, 0, 0, time.UTC)
}

// summaryUserWithSpend creates a user who qualifies for the push: a group, an
// expense inside the period, and a registered device.
func summaryUserWithSpend(t *testing.T, env *testutil.Env, name, token string) db.User {
	t.Helper()
	u := testutil.CreateUser(t, env.Pool, name+"-"+ulidSuffix()+"@test", name)
	group, member := testutil.CreateGroup(t, env.Pool, name+" Trip", "SEK", u.ID, name)
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Dinner", 4500, "SEK",
		member.ID, u.ID, []string{member.ID}, summaryDay(12))
	testutil.SeedPushToken(t, env.Pool, u.ID, token)
	return u
}

func sentCount(t *testing.T, env *testutil.Env, userID string) int {
	t.Helper()
	var n int
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		`SELECT count(*) FROM monthly_summary_sends WHERE user_id = $1 AND period = $2`,
		userID, summaryPeriod).Scan(&n))
	return n
}

func TestMonthlySummaryNotify_HappyPath(t *testing.T) {
	env := testutil.NewEnv(t)
	u := summaryUserWithSpend(t, env, "spender", "ExponentPushToken[spender]")

	fake := &fakeExpoSender{}
	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}))

	require.True(t, sentTokens(fake)["ExponentPushToken[spender]"])
	require.Equal(t, 1, sentCount(t, env, u.ID), "the send must be recorded in the ledger")

	msg := fake.calls[0][0]
	require.Equal(t, "chara://summary/"+summaryPeriod, msg.Data["url"],
		"the deep link carries no server segment")
	require.NotEmpty(t, msg.Title)
	require.NotEmpty(t, msg.Body)
}

// The ledger is the whole idempotency mechanism: a River retry of a job that
// already completed must be silent, not a second push.
func TestMonthlySummaryNotify_SecondRunSendsNothing(t *testing.T) {
	env := testutil.NewEnv(t)
	u := summaryUserWithSpend(t, env, "twice", "ExponentPushToken[twice]")

	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: &fakeExpoSender{}}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}))

	second := &fakeExpoSender{}
	w2 := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: second}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w2,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}))

	require.Empty(t, second.calls, "a re-run must not push again")
	require.Equal(t, 1, sentCount(t, env, u.ID))
}

func TestMonthlySummaryNotify_SkipsOptedOutUsers(t *testing.T) {
	env := testutil.NewEnv(t)
	optedOut := summaryUserWithSpend(t, env, "optout", "ExponentPushToken[optout]")
	summaryUserWithSpend(t, env, "optin", "ExponentPushToken[optin]")

	_, err := env.Pool.Exec(context.Background(),
		`UPDATE users SET monthly_summary_opt_out = TRUE WHERE id = $1`, optedOut.ID)
	require.NoError(t, err)

	fake := &fakeExpoSender{}
	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}))

	tokens := sentTokens(fake)
	require.True(t, tokens["ExponentPushToken[optin]"])
	require.False(t, tokens["ExponentPushToken[optout]"], "an opted-out user must not be pushed")
	require.Equal(t, 0, sentCount(t, env, optedOut.ID),
		"and must stay out of the ledger, so opting back in still works next month")
}

// A user with no spend in the month has nothing to summarize; pushing them a
// summary of an empty month is the notification nobody wants.
func TestMonthlySummaryNotify_SkipsUsersWithNoSpend(t *testing.T) {
	env := testutil.NewEnv(t)
	idle := testutil.CreateUser(t, env.Pool, "idle-"+ulidSuffix()+"@test", "Idle")
	group, member := testutil.CreateGroup(t, env.Pool, "Idle Trip", "SEK", idle.ID, "Idle")
	// Spend, but in a different month.
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Old", 1000, "SEK",
		member.ID, idle.ID, []string{member.ID}, time.Date(2026, 2, 3, 12, 0, 0, 0, time.UTC))
	testutil.SeedPushToken(t, env.Pool, idle.ID, "ExponentPushToken[idle]")

	fake := &fakeExpoSender{}
	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}))

	require.False(t, sentTokens(fake)["ExponentPushToken[idle]"])
}

// Copy follows users.locale, which is the point of task 7 writing it.
func TestMonthlySummaryNotify_UsesTheRecipientLocale(t *testing.T) {
	env := testutil.NewEnv(t)
	sv := summaryUserWithSpend(t, env, "svuser", "ExponentPushToken[sv]")
	summaryUserWithSpend(t, env, "enuser", "ExponentPushToken[en]")
	_, err := env.Pool.Exec(context.Background(),
		`UPDATE users SET locale = 'sv' WHERE id = $1`, sv.ID)
	require.NoError(t, err)

	fake := &fakeExpoSender{}
	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}))

	bodies := map[string]string{}
	for _, call := range fake.calls {
		for _, m := range call {
			bodies[m.To] = m.Body
		}
	}
	require.NotEqual(t, bodies["ExponentPushToken[sv]"], bodies["ExponentPushToken[en]"],
		"two users with different locales must get different copy")
}

// Expo being down must not cost the user their next month: the job still
// completes, and the ledger still advances so the retry does not re-push.
func TestMonthlySummaryNotify_SendFailureStillCompletes(t *testing.T) {
	env := testutil.NewEnv(t)
	u := summaryUserWithSpend(t, env, "failsend", "ExponentPushToken[failsend]")

	fake := &fakeExpoSender{err: context.DeadlineExceeded}
	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: summaryPeriod}),
		"a send failure is logged, not returned — returning would retry the whole fan-out")
	require.Equal(t, 1, sentCount(t, env, u.ID))
}

// A malformed period is an enqueuer bug, not a transient fault. Returning an
// error would have River retry it until it exhausts its attempts.
func TestMonthlySummaryNotify_BadPeriodIsNotRetried(t *testing.T) {
	env := testutil.NewEnv(t)
	fake := &fakeExpoSender{}
	w := &jobs.MonthlySummaryNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.SummaryNotifyForTest(context.Background(), w,
		jobs.MonthlySummaryNotifyArgs{Period: "not-a-month"}))
	require.Empty(t, fake.calls)
}
