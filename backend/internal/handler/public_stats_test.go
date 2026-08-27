//go:build integration

package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

type publicStatsBody struct {
	Expenses      int64    `json:"expenses"`
	ValueUSD      string   `json:"value_usd"`
	ValueUSDMinor int64    `json:"value_usd_minor"`
	Currencies    []string `json:"currencies"`
	Since         *string  `json:"since"`
	GeneratedAt   string   `json:"generated_at"`
}

func newStatsEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	return env
}

// getStats issues an unauthenticated GET, which is the whole point of the
// endpoint — no Authorization header is ever attached.
func getStats(t *testing.T, env *testutil.Env) (*httptest.ResponseRecorder, publicStatsBody) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	rr := env.Do(t, req)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var body publicStatsBody
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body), rr.Body.String())
	return rr, body
}

// seedRates pins EUR->SEK and EUR->USD so conversions are exact and the
// expected values below are arithmetic, not approximations.
func seedRates(t *testing.T, env *testutil.Env, day time.Time) {
	t.Helper()
	testutil.SeedFxRate(t, env.Pool, "SEK", 10.0, day)
	testutil.SeedFxRate(t, env.Pool, "USD", 1.0, day)
}

func TestPublicStats_RequiresNoAuthAndIsPubliclyCacheable(t *testing.T) {
	env := newStatsEnv(t)
	rr, _ := getStats(t, env)

	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=300", rr.Header().Get("Cache-Control"))
	assert.Equal(t, "*", rr.Header().Get("Access-Control-Allow-Origin"),
		"the marketing site is on a different origin and sends no credentials")
}

func TestPublicStats_EmptyInstanceReportsZeroNotError(t *testing.T) {
	env := newStatsEnv(t)
	_, body := getStats(t, env)

	assert.Zero(t, body.Expenses)
	assert.Equal(t, int64(0), body.ValueUSDMinor)
	assert.Empty(t, body.Currencies)
	assert.Nil(t, body.Since, "no expenses means no since date, not a zero time")
}

func TestPublicStats_ConvertsEveryCurrencyToUSD(t *testing.T) {
	env := newStatsEnv(t)
	day := time.Now().UTC()
	seedRates(t, env, day)

	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stats"), "Stats User")
	group, owner := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", user.ID, "Owner")
	members := []string{owner.ID}

	// 1000.00 SEK at 10 SEK/EUR and 1 USD/EUR => 100.00 USD.
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Hotel", 100000, "SEK", owner.ID, user.ID, members, day)
	// 50.00 USD passes through untouched.
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Taxi", 5000, "USD", owner.ID, user.ID, members, day)

	_, body := getStats(t, env)

	assert.Equal(t, int64(2), body.Expenses)
	assert.Equal(t, int64(15000), body.ValueUSDMinor, "100.00 + 50.00 USD")
	assert.Equal(t, "150.00", body.ValueUSD)
	assert.Equal(t, []string{"SEK", "USD"}, body.Currencies)
	require.NotNil(t, body.Since)
}

func TestPublicStats_OmitsGroupsFlaggedExcludeFromStats(t *testing.T) {
	env := newStatsEnv(t)
	day := time.Now().UTC()
	seedRates(t, env, day)

	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stats-excl"), "Stats User")
	real, realOwner := testutil.CreateGroup(t, env.Pool, "Real", "USD", user.ID, "Owner")
	demo, demoOwner := testutil.CreateGroup(t, env.Pool, "Demo", "USD", user.ID, "Owner")

	testutil.CreateExpenseOn(t, env.Pool, real.ID, "Real", 1000, "USD", realOwner.ID, user.ID, []string{realOwner.ID}, day)
	testutil.CreateExpenseOn(t, env.Pool, demo.ID, "Seed", 999999, "USD", demoOwner.ID, user.ID, []string{demoOwner.ID}, day)

	_, before := getStats(t, env)
	require.Equal(t, int64(2), before.Expenses, "unflagged demo data counts")

	_, err := env.Pool.Exec(t.Context(),
		`UPDATE groups SET exclude_from_stats = TRUE WHERE id = $1`, demo.ID)
	require.NoError(t, err)

	// A fresh router sidesteps the 5-minute in-process cache.
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	_, after := getStats(t, env)

	assert.Equal(t, int64(1), after.Expenses)
	assert.Equal(t, int64(1000), after.ValueUSDMinor,
		"the 9,999.99 seed expense must not reach a publicly advertised total")
}

func TestPublicStats_IgnoresDeletedExpenses(t *testing.T) {
	env := newStatsEnv(t)
	day := time.Now().UTC()
	seedRates(t, env, day)

	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stats-del"), "Stats User")
	group, owner := testutil.CreateGroup(t, env.Pool, "Trip", "USD", user.ID, "Owner")
	kept := testutil.CreateExpenseOn(t, env.Pool, group.ID, "Kept", 2500, "USD", owner.ID, user.ID, []string{owner.ID}, day)
	gone := testutil.CreateExpenseOn(t, env.Pool, group.ID, "Gone", 7500, "USD", owner.ID, user.ID, []string{owner.ID}, day)
	_ = kept

	_, err := env.Pool.Exec(t.Context(),
		`UPDATE expenses SET is_deleted = TRUE WHERE id = $1`, gone.Expense.ID)
	require.NoError(t, err)

	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	_, body := getStats(t, env)

	assert.Equal(t, int64(1), body.Expenses)
	assert.Equal(t, int64(2500), body.ValueUSDMinor)
}

func TestPublicStats_CountsExpensesWithNoFxRateButOmitsTheirValue(t *testing.T) {
	env := newStatsEnv(t)
	day := time.Now().UTC()
	seedRates(t, env, day)

	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stats-norate"), "Stats User")
	group, owner := testutil.CreateGroup(t, env.Pool, "Trip", "USD", user.ID, "Owner")
	members := []string{owner.ID}

	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Priced", 4200, "USD", owner.ID, user.ID, members, day)
	// ECB publishes no BDT rate, so this expense has no convertible value.
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Unpriced", 5000000, "BDT", owner.ID, user.ID, members, day)

	_, body := getStats(t, env)

	assert.Equal(t, int64(2), body.Expenses, "activity is real even without a rate")
	assert.Equal(t, int64(4200), body.ValueUSDMinor, "an unconvertible amount must not be summed as-is")
	assert.Equal(t, []string{"USD"}, body.Currencies,
		"a currency missing from this list is how an understated total stays visible")
}

func TestPublicStats_ExposesNoPerGroupOrPerUserFields(t *testing.T) {
	env := newStatsEnv(t)
	day := time.Now().UTC()
	seedRates(t, env, day)

	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stats-priv"), "Stats User")
	group, owner := testutil.CreateGroup(t, env.Pool, "Kroatien 2026", "USD", user.ID, "Owner")
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Villa deposit", 1000, "USD", owner.ID, user.ID, []string{owner.ID}, day)

	req := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	rr := env.Do(t, req)
	require.Equal(t, http.StatusOK, rr.Code)

	// The privacy claim is structural: assert the response carries exactly
	// the documented keys, so adding a breakdown dimension fails here first.
	var raw map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &raw))

	keys := make([]string, 0, len(raw))
	for k := range raw {
		keys = append(keys, k)
	}
	assert.ElementsMatch(t,
		[]string{"expenses", "value_usd", "value_usd_minor", "currencies", "since", "generated_at"},
		keys, "the public response shape is a privacy boundary; widen it deliberately")

	assert.NotContains(t, rr.Body.String(), "Kroatien")
	assert.NotContains(t, rr.Body.String(), "Villa deposit")
	assert.NotContains(t, rr.Body.String(), user.Email)
}
