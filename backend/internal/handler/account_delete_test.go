//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newAccountDeleteEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	return env
}

// TestDeleteMe_RequiresAuth ensures the endpoint is gated by the auth middleware.
func TestDeleteMe_RequiresAuth(t *testing.T) {
	env := newAccountDeleteEnv(t)
	req, err := http.NewRequest("DELETE", "/api/me", nil)
	require.NoError(t, err)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// TestDeleteMe_HappyPath_ZeroBalance — a user with no groups can delete and
// /api/me subsequently returns 401.
func TestDeleteMe_HappyPath_ZeroBalance(t *testing.T) {
	env := newAccountDeleteEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "delme"), "Delete Me")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	// Same JWT now references a deleted user → /api/me must return 401.
	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me", "", token))
	assert.Equal(t, http.StatusUnauthorized, rr.Code, "deleted user must not pass auth")

	// User row is soft-deleted (still present, deleted_at set, PII nulled).
	q := db.New(env.Pool)
	got, err := q.GetUserByID(context.Background(), user.ID)
	require.NoError(t, err, "soft-delete should keep the row for FK integrity")
	assert.NotEqual(t, user.Email, got.Email, "email must be replaced with a sentinel")
}

// TestDeleteMe_BlockedByNonZeroBalance — a user with an outstanding balance in
// a group gets 409 and the row + auth survive.
func TestDeleteMe_BlockedByNonZeroBalance(t *testing.T) {
	env := newAccountDeleteEnv(t)

	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_del"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_del"), "Bob")
	g, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, g.ID, bob.ID, "Bob")

	// Alice paid 100 SEK split equally between Alice and Bob. Bob owes 50.
	testutil.CreateExpense(t, env.Pool, g.ID, "Lunch", 10000, "SEK",
		aliceMem.ID, alice.ID, []string{aliceMem.ID, bobMem.ID})

	bobToken := env.MintToken(t, bob.ID, bob.Email)

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", bobToken))
	require.Equal(t, http.StatusConflict, rr.Code, rr.Body.String())

	var resp struct {
		Error    string `json:"error"`
		Balances []struct {
			Currency    string `json:"currency"`
			AmountMinor int64  `json:"amount_minor"`
		} `json:"balances"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "balance_not_zero", resp.Error)
	require.Len(t, resp.Balances, 1, "should report one currency with non-zero balance")
	assert.Equal(t, "SEK", resp.Balances[0].Currency)
	assert.Equal(t, int64(-5000), resp.Balances[0].AmountMinor, "bob owes 50 SEK → -5000 minor")

	// Bob's user row still present; auth still works.
	q := db.New(env.Pool)
	_, err := q.GetUserByID(context.Background(), bob.ID)
	require.NoError(t, err)

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me", "", bobToken))
	assert.Equal(t, http.StatusOK, rr.Code, "auth must still work after blocked delete")
}

// TestDeleteMe_PreservesExpenseHistoryForOtherMembers — after Alice settles up
// and deletes her account, the expense she paid for is still visible to Bob
// and Carl (just attributed to a ghost / deleted-user member).
func TestDeleteMe_PreservesExpenseHistoryForOtherMembers(t *testing.T) {
	env := newAccountDeleteEnv(t)
	q := db.New(env.Pool)

	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_hist"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_hist"), "Bob")
	carl := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carl_hist"), "Carl")

	g, aliceMem := testutil.CreateGroup(t, env.Pool, "Roadtrip", "SEK", alice.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, g.ID, bob.ID, "Bob")
	carlMem := testutil.AddMember(t, env.Pool, g.ID, carl.ID, "Carl")

	// Alice paid 60 SEK split equally three ways — net 0 across each member
	// is impossible without settling. Make Alice the only payee then settle
	// her up so her balance is zero.
	exp := testutil.CreateExpense(t, env.Pool, g.ID, "Gas", 6000, "SEK",
		aliceMem.ID, alice.ID, []string{aliceMem.ID, bobMem.ID, carlMem.ID})
	require.NotEmpty(t, exp.Expense.ID)

	// Bob settles 20 SEK to Alice; Carl settles 20 SEK to Alice → Alice net 0.
	bobToken := env.MintToken(t, bob.ID, bob.Email)
	carlToken := env.MintToken(t, carl.ID, carl.Email)

	settleBody := func(from, to, amountDecimal string) string {
		return `{"from_member_id":"` + from + `","to_member_id":"` + to + `","amount":"` +
			amountDecimal + `","currency":"SEK"}`
	}
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+g.ID+"/settle",
		settleBody(bobMem.ID, aliceMem.ID, "20.00"), bobToken))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+g.ID+"/settle",
		settleBody(carlMem.ID, aliceMem.ID, "20.00"), carlToken))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	// Now Alice should have zero net balance → she can delete.
	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	rr = env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", aliceToken))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	// Alice's group_member row must survive (so expense.paid_by_id still
	// resolves) but its user_id must be NULL (ghost).
	mem, err := q.GetGroupMember(context.Background(), aliceMem.ID)
	require.NoError(t, err, "alice's group_member must still exist for history")
	assert.False(t, mem.UserID.Valid, "alice's group_member.user_id should be NULL after delete")
	assert.True(t, mem.IsGhost, "alice's group_member should now be marked ghost")

	// Bob can still see the expense.
	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+g.ID+"/expenses", "", bobToken))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var expenses []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&expenses))
	require.Len(t, expenses, 1, "the historical expense must remain visible")
	assert.Equal(t, "Gas", expenses[0]["title"])
}

// TestDeleteMe_Idempotency — a second DELETE after a successful one returns
// 401 because the JWT's user is now soft-deleted and auth rejects.
func TestDeleteMe_Idempotency(t *testing.T) {
	env := newAccountDeleteEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "idem"), "Idem")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", token))
	assert.Equal(t, http.StatusUnauthorized, rr.Code, "second DELETE → 401 (user deleted)")
}

// TestDeleteMe_DeletesPushTokens — push tokens are wiped before the user is
// marked deleted so Expo doesn't keep pushing.
func TestDeleteMe_DeletesPushTokens(t *testing.T) {
	env := newAccountDeleteEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push_del"), "Push Del")
	token := env.MintToken(t, user.ID, user.Email)

	// Register a push token.
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token",
		`{"token":"ExponentPushToken[deleteme]","platform":"ios"}`, token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	q := db.New(env.Pool)
	tokens, err := q.ListPushTokensByUser(context.Background(), user.ID)
	require.NoError(t, err)
	require.Len(t, tokens, 1, "precondition: push token registered")

	rr = env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	tokens, err = q.ListPushTokensByUser(context.Background(), user.ID)
	require.NoError(t, err)
	assert.Len(t, tokens, 0, "push tokens must be deleted with the user")
}

// silence unused-import warnings if a refactor drops references temporarily.
var _ = pgx.ErrNoRows
var _ pgtype.Text
