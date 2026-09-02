//go:build integration

package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

// hostedEnv builds an env whose instance mode is "hosted". testutil.NewEnv
// defaults to selfhost, where the summary route 404s by design.
func hostedEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Config.InstanceMode = "hosted"
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	return env
}

type summaryResp struct {
	Period     string `json:"period"`
	ByCurrency []struct {
		Currency     string `json:"currency"`
		Paid         string `json:"paid"`
		Share        string `json:"share"`
		ExpenseCount int64  `json:"expense_count"`
	} `json:"by_currency"`
	Converted struct {
		Currency      string `json:"currency"`
		Paid          string `json:"paid"`
		Share         string `json:"share"`
		Net           string `json:"net"`
		EstimatedLegs int    `json:"estimated_legs"`
	} `json:"converted"`
	Counts struct {
		Expenses   int64 `json:"expenses"`
		Groups     int64 `json:"groups"`
		ActiveDays int64 `json:"active_days"`
	} `json:"counts"`
	Categories []struct {
		Slug  string `json:"slug"`
		Share string `json:"share"`
		Pct   int    `json:"pct"`
	} `json:"categories"`
	Highlights struct {
		BiggestExpense *struct {
			ExpenseID string `json:"expense_id"`
			Title     string `json:"title"`
		} `json:"biggest_expense"`
		TopGroup *struct {
			GroupID string `json:"group_id"`
			Name    string `json:"name"`
		} `json:"top_group"`
	} `json:"highlights"`
	Previous *struct {
		Net string `json:"net"`
	} `json:"previous"`
	FirstPeriod string `json:"first_period"`
}

func TestMonthlySummary_HappyPath(t *testing.T) {
	env := hostedEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")
	token := env.MintToken(t, alice.ID, alice.Email)

	// Two expenses in August 2026, split equally between Alice and Bob.
	// Alice pays 100.00 and 60.00; her share of each is half.
	aug := func(d int) time.Time { return time.Date(2026, 8, d, 0, 0, 0, 0, time.UTC) }
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Dinner", 10000, "SEK",
		aliceMem.ID, alice.ID, []string{aliceMem.ID, bobMem.ID}, aug(3))
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "Taxi", 6000, "SEK",
		aliceMem.ID, alice.ID, []string{aliceMem.ID, bobMem.ID}, aug(4))
	// One expense in September — must NOT appear in the August summary.
	testutil.CreateExpenseOn(t, env.Pool, group.ID, "September thing", 5000, "SEK",
		aliceMem.ID, alice.ID, []string{aliceMem.ID, bobMem.ID},
		time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/summary?period=2026-08&in=SEK", "", token))
	require.Equal(t, http.StatusOK, rr.Code)

	var got summaryResp
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	require.Equal(t, "2026-08", got.Period)
	require.Equal(t, "160.00", got.Converted.Paid, "100 + 60, September excluded")
	require.Equal(t, "80.00", got.Converted.Share, "half of each")
	require.Equal(t, "80.00", got.Converted.Net, "paid - share")
	require.Equal(t, int64(2), got.Counts.Expenses)
	require.Equal(t, int64(1), got.Counts.Groups)
	require.Equal(t, int64(2), got.Counts.ActiveDays)
	require.NotNil(t, got.Highlights.BiggestExpense)
	require.Equal(t, "Dinner", got.Highlights.BiggestExpense.Title)
	require.NotNil(t, got.Highlights.TopGroup)
	require.Equal(t, group.ID, got.Highlights.TopGroup.GroupID)
	require.Equal(t, "2026-08", got.FirstPeriod)
}

func TestMonthlySummary_NotFoundOnSelfhost(t *testing.T) {
	env := testutil.NewEnv(t) // selfhost by default
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	u := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "self"), "Self")
	token := env.MintToken(t, u.ID, u.Email)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/summary?period=2026-08&in=SEK", "", token))
	require.Equal(t, http.StatusNotFound, rr.Code)
}

func TestMonthlySummary_RequiresAuth(t *testing.T) {
	env := hostedEnv(t)
	req := env.AuthRequest(t, "GET", "/api/me/summary?period=2026-08&in=SEK", "", "")
	req.Header.Del("Authorization")
	rr := env.Do(t, req)
	require.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMonthlySummary_ValidatesParams(t *testing.T) {
	env := hostedEnv(t)
	u := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "v"), "V")
	token := env.MintToken(t, u.ID, u.Email)

	cases := []struct{ name, query string }{
		{"missing period", "?in=SEK"},
		{"malformed period", "?period=2026-8&in=SEK"},
		{"month 13", "?period=2026-13&in=SEK"},
		{"missing in", "?period=2026-08"},
		{"lowercase in", "?period=2026-08&in=sek"},
		{"future period", fmt.Sprintf("?period=%s&in=SEK", time.Now().AddDate(0, 2, 0).Format("2006-01"))},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/summary"+tc.query, "", token))
			require.Equal(t, http.StatusBadRequest, rr.Code)
		})
	}
}

func TestMonthlySummary_OnlyOwnGroups(t *testing.T) {
	env := hostedEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	stranger := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stranger"), "Stranger")
	// A group Alice is not in at all.
	otherGroup, strangerMem := testutil.CreateGroup(t, env.Pool, "Not Alice's", "SEK", stranger.ID, "Stranger")
	testutil.CreateExpenseOn(t, env.Pool, otherGroup.ID, "Secret", 90000, "SEK",
		strangerMem.ID, stranger.ID, []string{strangerMem.ID},
		time.Date(2026, 8, 5, 0, 0, 0, 0, time.UTC))

	token := env.MintToken(t, alice.ID, alice.Email)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/summary?period=2026-08&in=SEK", "", token))
	require.Equal(t, http.StatusOK, rr.Code)

	var got summaryResp
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	require.Equal(t, int64(0), got.Counts.Expenses, "another user's expenses never leak in")
	require.Equal(t, "0.00", got.Converted.Net)
	require.Nil(t, got.Highlights.BiggestExpense)
}

func TestMonthlySummary_EmptyMonthIsOKNotError(t *testing.T) {
	env := hostedEnv(t)
	u := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "quiet"), "Quiet")
	token := env.MintToken(t, u.ID, u.Email)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/summary?period=2026-08&in=SEK", "", token))
	require.Equal(t, http.StatusOK, rr.Code)

	var got summaryResp
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	require.Empty(t, got.ByCurrency)
	require.Nil(t, got.Previous, "no prior month means no delta, not a zero delta")
}

func TestMonthlySummary_OptOutRoundTrips(t *testing.T) {
	env := hostedEnv(t)
	u := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "opt"), "Opt")
	token := env.MintToken(t, u.ID, u.Email)

	var me struct {
		MonthlySummaryOptOut bool `json:"monthly_summary_opt_out"`
	}
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me", "", token))
	require.Equal(t, http.StatusOK, rr.Code)
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &me))
	require.False(t, me.MonthlySummaryOptOut, "opted in by default")

	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/me",
		`{"monthly_summary_opt_out": true}`, token))
	require.Equal(t, http.StatusOK, rr.Code)

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me", "", token))
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &me))
	require.True(t, me.MonthlySummaryOptOut)

	// And back off again — a one-way switch would strand anyone who
	// changed their mind.
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/me",
		`{"monthly_summary_opt_out": false}`, token))
	require.Equal(t, http.StatusOK, rr.Code)
	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me", "", token))
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &me))
	require.False(t, me.MonthlySummaryOptOut)
}
