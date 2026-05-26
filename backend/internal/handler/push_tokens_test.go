//go:build integration

package handler_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newPushEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	return env
}

func TestPushToken_Register_Inserts(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push"), "Push User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"token":"ExponentPushToken[abc123]","platform":"ios"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	tokens, err := env.Queries.ListPushTokensByUser(context.Background(), user.ID)
	require.NoError(t, err)
	require.Len(t, tokens, 1)
	assert.Equal(t, "ExponentPushToken[abc123]", tokens[0].Token)
	assert.Equal(t, "ios", tokens[0].Platform)
}

func TestPushToken_Register_IsIdempotent(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push"), "Push User")
	token := env.MintToken(t, user.ID, user.Email)
	body := `{"token":"ExponentPushToken[same]","platform":"android"}`

	for i := 0; i < 3; i++ {
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, token))
		require.Equal(t, http.StatusNoContent, rr.Code, "call %d: %s", i, rr.Body.String())
	}

	tokens, err := env.Queries.ListPushTokensByUser(context.Background(), user.ID)
	require.NoError(t, err)
	assert.Len(t, tokens, 1, "repeated registration must upsert, not duplicate")
}

func TestPushToken_Register_RejectsBadPlatform(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push"), "Push User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"token":"ExponentPushToken[x]","platform":"blackberry"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPushToken_Register_RejectsMissingToken(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push"), "Push User")
	jwt := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", `{"platform":"ios"}`, jwt))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPushToken_Register_RequiresAuth(t *testing.T) {
	env := newPushEnv(t)
	rr := env.Do(t, mustReq(t, "POST", "/api/me/push-token", `{"token":"x","platform":"ios"}`))
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestPushToken_Delete_RemovesRow(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push"), "Push User")
	token := env.MintToken(t, user.ID, user.Email)
	pushTok := fmt.Sprintf("ExponentPushToken[%s]", user.ID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token",
		fmt.Sprintf(`{"token":%q,"platform":"ios"}`, pushTok), token))
	require.Equal(t, http.StatusNoContent, rr.Code)

	body := fmt.Sprintf(`{"token":%q}`, pushTok)
	rr = env.Do(t, env.AuthRequest(t, "DELETE", "/api/me/push-token", body, token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	tokens, err := env.Queries.ListPushTokensByUser(context.Background(), user.ID)
	require.NoError(t, err)
	assert.Len(t, tokens, 0)
}

func TestPushToken_Delete_IsIdempotent(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "push"), "Push User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/me/push-token",
		`{"token":"ExponentPushToken[never-registered]"}`, token))
	assert.Equal(t, http.StatusNoContent, rr.Code, "deleting non-existent token must be 204, not 404")
}

// TestPushToken_Register_DoesNotHijackAcrossUsers verifies that user B
// registering the same raw token as user A does NOT silently reassign that
// token to B. The old behavior — ON CONFLICT (token) DO UPDATE SET user_id —
// let an attacker who learned a victim's Expo token redirect all of the
// victim's pushes to the attacker's device by simply submitting the token.
// The fix scopes the conflict target to (user_id, token), so each user owns
// their own row.
func TestPushToken_Register_DoesNotHijackAcrossUsers(t *testing.T) {
	env := newPushEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_hijack"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_hijack"), "Bob")
	aliceJWT := env.MintToken(t, alice.ID, alice.Email)
	bobJWT := env.MintToken(t, bob.ID, bob.Email)

	sharedTok := "ExponentPushToken[shared-victim-token]"
	body := fmt.Sprintf(`{"token":%q,"platform":"ios"}`, sharedTok)

	// Alice registers first.
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, aliceJWT))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	// Bob submits the same token (attacker scenario).
	rr = env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, bobJWT))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	// Both users must still own their own row — Alice's must NOT have been
	// reassigned to Bob.
	aliceTokens, err := env.Queries.ListPushTokensByUser(context.Background(), alice.ID)
	require.NoError(t, err)
	require.Len(t, aliceTokens, 1, "Alice's push token must not be hijacked by Bob")
	assert.Equal(t, sharedTok, aliceTokens[0].Token)

	bobTokens, err := env.Queries.ListPushTokensByUser(context.Background(), bob.ID)
	require.NoError(t, err)
	require.Len(t, bobTokens, 1, "Bob's own registration must persist independently")
	assert.Equal(t, sharedTok, bobTokens[0].Token)
}

func TestPushToken_Delete_DoesNotTouchOtherUsersTokens(t *testing.T) {
	env := newPushEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	aliceJWT := env.MintToken(t, alice.ID, alice.Email)
	bobJWT := env.MintToken(t, bob.ID, bob.Email)

	aliceTok := fmt.Sprintf("ExponentPushToken[alice-%s]", alice.ID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token",
		fmt.Sprintf(`{"token":%q,"platform":"ios"}`, aliceTok), aliceJWT))
	require.Equal(t, http.StatusNoContent, rr.Code)

	// Bob attempts to delete Alice's token. Should be a no-op (204), not delete Alice's row.
	rr = env.Do(t, env.AuthRequest(t, "DELETE", "/api/me/push-token",
		fmt.Sprintf(`{"token":%q}`, aliceTok), bobJWT))
	require.Equal(t, http.StatusNoContent, rr.Code)

	tokens, err := env.Queries.ListPushTokensByUser(context.Background(), alice.ID)
	require.NoError(t, err)
	require.Len(t, tokens, 1, "Bob must not be able to delete Alice's push token")
	assert.Equal(t, aliceTok, tokens[0].Token)
}
