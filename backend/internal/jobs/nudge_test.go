//go:build integration

package jobs_test

import (
	"context"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/push"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/DowLucas/chara/testutil"
)

const nudgeServerURL = "http://localhost:8080"

// fakeSender records Send calls and returns a configurable set of dead
// tokens. Safe for concurrent use (the e2e test drives it from River's
// worker goroutines).
type fakeSender struct {
	mu    sync.Mutex
	calls [][]push.Message
	dead  []string
}

func (f *fakeSender) Send(_ context.Context, msgs []push.Message) (*push.Result, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, msgs)
	return &push.Result{DeviceNotRegistered: f.dead}, nil
}

func (f *fakeSender) allCalls() [][]push.Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([][]push.Message, len(f.calls))
	copy(out, f.calls)
	return out
}

// nudgeFixture is a group where debtor owes creditor 45.00 SEK from a single
// expense backdated 9 days.
type nudgeFixture struct {
	group          db.Group
	creditor       db.User
	creditorMember db.GroupMember
	debtor         db.User
	debtorMember   db.GroupMember
}

func setupNudgeDebt(t *testing.T, env *testutil.Env) nudgeFixture {
	t.Helper()
	creditor := testutil.CreateUser(t, env.Pool, "creditor-"+ulidSuffix()+"@test", "Alice")
	group, creditorMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", creditor.ID, "Alice")
	debtor := testutil.CreateUser(t, env.Pool, "debtor-"+ulidSuffix()+"@test", "Bob")
	debtorMember := testutil.AddMember(t, env.Pool, group.ID, debtor.ID, "Bob")

	testutil.CreateExpense(t, env.Pool, group.ID, "Dinner", 9000, "SEK",
		creditorMember.ID, creditor.ID, []string{creditorMember.ID, debtorMember.ID})
	backdateGroupExpenses(t, env, group.ID, 9)

	return nudgeFixture{
		group:          group,
		creditor:       creditor,
		creditorMember: creditorMember,
		debtor:         debtor,
		debtorMember:   debtorMember,
	}
}

// backdateGroupExpenses rewinds created_at/updated_at on every expense in
// the group — balance_change_events keys staleness off those columns.
func backdateGroupExpenses(t *testing.T, env *testutil.Env, groupID string, days int) {
	t.Helper()
	_, err := env.Pool.Exec(context.Background(),
		`UPDATE expenses
		    SET created_at = NOW() - make_interval(days => $2),
		        updated_at = NOW() - make_interval(days => $2)
		  WHERE group_id = $1`,
		groupID, days)
	require.NoError(t, err)
}

func addPushToken(t *testing.T, env *testutil.Env, userID, token string) {
	t.Helper()
	_, err := env.Queries.UpsertPushToken(context.Background(), db.UpsertPushTokenParams{
		ID: ulid.New(), UserID: userID, Token: token, Platform: "ios",
	})
	require.NoError(t, err)
}

func seedNudge(t *testing.T, env *testutil.Env, userID, groupID string, daysAgo int) {
	t.Helper()
	_, err := env.Pool.Exec(context.Background(),
		`INSERT INTO balance_nudges (user_id, group_id, last_nudged_at)
		 VALUES ($1, $2, NOW() - make_interval(days => $3))
		 ON CONFLICT (user_id, group_id) DO UPDATE SET last_nudged_at = EXCLUDED.last_nudged_at`,
		userID, groupID, daysAgo)
	require.NoError(t, err)
}

func lastNudgedAt(t *testing.T, env *testutil.Env, userID, groupID string) (time.Time, bool) {
	t.Helper()
	var ts time.Time
	err := env.Pool.QueryRow(context.Background(),
		`SELECT last_nudged_at FROM balance_nudges WHERE user_id = $1 AND group_id = $2`,
		userID, groupID).Scan(&ts)
	if err != nil {
		return time.Time{}, false
	}
	return ts, true
}

// selectPairs runs the tick's eligibility query and returns "userID|groupID"
// keys for easy set assertions.
func selectPairs(t *testing.T, env *testutil.Env) map[string]bool {
	t.Helper()
	rows, err := env.Queries.SelectNudgeEligiblePairs(context.Background(), db.SelectNudgeEligiblePairsParams{
		AfterDays: 7, RepeatDays: 7, MaxPairs: 100,
	})
	require.NoError(t, err)
	out := make(map[string]bool, len(rows))
	for _, r := range rows {
		out[r.UserID+"|"+r.GroupID] = true
	}
	return out
}

func newFireWorker(env *testutil.Env, sender push.Sender) *jobs.NudgeFireWorker {
	return &jobs.NudgeFireWorker{
		Pool:    env.Pool,
		Queries: env.Queries,
		Sender:  sender,
		Cfg:     jobs.NudgeConfig{AfterDays: 7, RepeatDays: 7, ServerURL: nudgeServerURL},
	}
}

// ── Tick eligibility selection ────────────────────────────────────────────────

func TestNudgeSelect_EligibleDebtor(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[debtor]")

	pairs := selectPairs(t, env)
	assert.True(t, pairs[fx.debtor.ID+"|"+fx.group.ID], "stale debtor with a push token should be selected")
}

func TestNudgeSelect_CreditorNotSelected(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[debtor]")
	addPushToken(t, env, fx.creditor.ID, "ExponentPushToken[creditor]")

	pairs := selectPairs(t, env)
	assert.False(t, pairs[fx.creditor.ID+"|"+fx.group.ID], "creditor (positive balance) must not be nudged")
	assert.True(t, pairs[fx.debtor.ID+"|"+fx.group.ID])
}

func TestNudgeSelect_RecentBalanceChangeSkipped(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[debtor]")

	// A fresh expense involving the debtor resets the staleness clock.
	testutil.CreateExpense(t, env.Pool, fx.group.ID, "Taxi", 1000, "SEK",
		fx.creditorMember.ID, fx.creditor.ID, []string{fx.creditorMember.ID, fx.debtorMember.ID})

	pairs := selectPairs(t, env)
	assert.False(t, pairs[fx.debtor.ID+"|"+fx.group.ID], "balance changed recently — not yet nudgeable")
}

func TestNudgeSelect_NoPushTokenSkipped(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)

	pairs := selectPairs(t, env)
	assert.False(t, pairs[fx.debtor.ID+"|"+fx.group.ID], "no push tokens — nothing to send to")
}

func TestNudgeSelect_NudgedRecentlySkipped(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[debtor]")
	seedNudge(t, env, fx.debtor.ID, fx.group.ID, 1)

	pairs := selectPairs(t, env)
	assert.False(t, pairs[fx.debtor.ID+"|"+fx.group.ID], "nudged 1 day ago — inside the repeat window")
}

func TestNudgeSelect_RenudgedAfterRepeatWindow(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[debtor]")
	seedNudge(t, env, fx.debtor.ID, fx.group.ID, 8)

	pairs := selectPairs(t, env)
	assert.True(t, pairs[fx.debtor.ID+"|"+fx.group.ID], "last nudge is older than NUDGE_REPEAT_DAYS — eligible again")
}

// ── Fire worker ───────────────────────────────────────────────────────────────

func TestNudgeFire_SendsPushAndUpserts(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[a]")
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[b]")

	fake := &fakeSender{}
	w := newFireWorker(env, fake)
	require.NoError(t, jobs.NudgeFireForTest(context.Background(), w, jobs.NudgeFireArgs{
		UserID: fx.debtor.ID, GroupID: fx.group.ID,
	}))

	calls := fake.allCalls()
	require.Len(t, calls, 1)
	msgs := calls[0]
	require.Len(t, msgs, 2, "one message per token")

	wantURL := "chara://groups/" + url.QueryEscape(nudgeServerURL) + "/" + fx.group.ID
	tokens := map[string]bool{}
	for _, m := range msgs {
		tokens[m.To] = true
		assert.Equal(t, "You owe 45.00 SEK in Trip", m.Title)
		assert.Equal(t, "Outstanding for 9 days — settle up?", m.Body)
		assert.Equal(t, wantURL, m.Data["url"])
	}
	assert.True(t, tokens["ExponentPushToken[a]"])
	assert.True(t, tokens["ExponentPushToken[b]"])

	ts, ok := lastNudgedAt(t, env, fx.debtor.ID, fx.group.ID)
	require.True(t, ok, "balance_nudges row should be upserted")
	assert.WithinDuration(t, time.Now(), ts, time.Minute)
}

func TestNudgeFire_MultiCurrencyTitle(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	// Second debt in EUR: 20.00 paid by creditor, split both ways → 10.00 owed.
	testutil.CreateExpense(t, env.Pool, fx.group.ID, "Museum", 2000, "EUR",
		fx.creditorMember.ID, fx.creditor.ID, []string{fx.creditorMember.ID, fx.debtorMember.ID})
	backdateGroupExpenses(t, env, fx.group.ID, 9)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[a]")

	fake := &fakeSender{}
	require.NoError(t, jobs.NudgeFireForTest(context.Background(), newFireWorker(env, fake), jobs.NudgeFireArgs{
		UserID: fx.debtor.ID, GroupID: fx.group.ID,
	}))

	calls := fake.allCalls()
	require.Len(t, calls, 1)
	require.Len(t, calls[0], 1)
	assert.Equal(t, "You owe 10.00 EUR + 45.00 SEK in Trip", calls[0][0].Title,
		"all owed currencies in one push, joined with ' + ', ordered by currency code")
}

func TestNudgeFire_DropsDeadTokens(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[dead]")
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[alive]")

	fake := &fakeSender{dead: []string{"ExponentPushToken[dead]"}}
	require.NoError(t, jobs.NudgeFireForTest(context.Background(), newFireWorker(env, fake), jobs.NudgeFireArgs{
		UserID: fx.debtor.ID, GroupID: fx.group.ID,
	}))

	remaining, err := env.Queries.ListPushTokensByUser(context.Background(), fx.debtor.ID)
	require.NoError(t, err)
	require.Len(t, remaining, 1)
	assert.Equal(t, "ExponentPushToken[alive]", remaining[0].Token)
}

func TestNudgeFire_SkipsWhenNudgedRecently(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[a]")
	seedNudge(t, env, fx.debtor.ID, fx.group.ID, 1)
	before, ok := lastNudgedAt(t, env, fx.debtor.ID, fx.group.ID)
	require.True(t, ok)

	fake := &fakeSender{}
	require.NoError(t, jobs.NudgeFireForTest(context.Background(), newFireWorker(env, fake), jobs.NudgeFireArgs{
		UserID: fx.debtor.ID, GroupID: fx.group.ID,
	}))

	assert.Empty(t, fake.allCalls(), "re-check must skip a recently nudged pair")
	after, ok := lastNudgedAt(t, env, fx.debtor.ID, fx.group.ID)
	require.True(t, ok)
	assert.True(t, after.Equal(before), "last_nudged_at must not move on a skipped fire")
}

func TestNudgeFire_SkipsWhenNoTokens(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)

	fake := &fakeSender{}
	require.NoError(t, jobs.NudgeFireForTest(context.Background(), newFireWorker(env, fake), jobs.NudgeFireArgs{
		UserID: fx.debtor.ID, GroupID: fx.group.ID,
	}))

	assert.Empty(t, fake.allCalls())
	_, ok := lastNudgedAt(t, env, fx.debtor.ID, fx.group.ID)
	assert.False(t, ok, "no nudge recorded when nothing was sent")
}

// ── End to end: tick enqueues, fire sends ─────────────────────────────────────

func TestNudgeTick_EndToEnd(t *testing.T) {
	env := testutil.NewEnv(t)
	fx := setupNudgeDebt(t, env)
	addPushToken(t, env, fx.debtor.ID, "ExponentPushToken[a]")

	fake := &fakeSender{}
	workers := jobs.RegisterWorkers(env.Pool, env.Queries)
	jobs.RegisterNudgeWorkers(workers, env.Pool, env.Queries, fake, jobs.NudgeConfig{
		AfterDays: 7, RepeatDays: 7, ServerURL: nudgeServerURL,
	})
	rc, err := jobs.New(env.Pool, workers, jobs.PeriodicJobs(false, true))
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	require.NoError(t, rc.Start(ctx))
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer stopCancel()
		_ = rc.Stop(stopCtx)
	}()

	// The nudge periodic job has RunOnStart=true; wait for the fire to land.
	deadline := time.Now().Add(10 * time.Second)
	var nudged bool
	for time.Now().Before(deadline) {
		if _, ok := lastNudgedAt(t, env, fx.debtor.ID, fx.group.ID); ok {
			nudged = true
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	require.True(t, nudged, "tick should enqueue a fire that records the nudge")
	require.NotEmpty(t, fake.allCalls(), "the fire should have sent a push")
}
