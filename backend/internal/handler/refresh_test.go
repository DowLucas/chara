//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/DowLucas/chara/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type signInTokens struct {
	Access  string
	Refresh string
}

// signIn runs the magic-link → verify flow and returns the issued access +
// refresh tokens for a freshly created user.
func signIn(t *testing.T, env *testutil.Env, prefix string) signInTokens {
	t.Helper()
	addr := uniqueEmail(t, prefix)

	rr := env.Do(t, mustReq(t, "POST", "/api/auth/magic-link", `{"email":"`+addr+`"}`))
	require.Equal(t, http.StatusOK, rr.Code)
	var ml struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&ml))
	require.NotEmpty(t, ml.Token)

	rr = env.Do(t, mustReq(t, "POST", "/api/auth/verify", `{"token":"`+ml.Token+`"}`))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var v struct {
		Token        string `json:"token"`
		RefreshToken string `json:"refresh_token"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&v))
	return signInTokens{Access: v.Token, Refresh: v.RefreshToken}
}

func postRefresh(t *testing.T, env *testutil.Env, refreshToken string) (int, signInTokens) {
	t.Helper()
	rr := env.Do(t, mustReq(t, "POST", "/api/auth/refresh", `{"refresh_token":"`+refreshToken+`"}`))
	var out struct {
		Token        string `json:"token"`
		RefreshToken string `json:"refresh_token"`
	}
	if rr.Code == http.StatusOK {
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&out))
	}
	return rr.Code, signInTokens{Access: out.Token, Refresh: out.RefreshToken}
}

// Every sign-in flow must return a refresh token alongside the access token.
func TestSignIn_ReturnsRefreshToken(t *testing.T) {
	env := newAuthEnv(t)
	tok := signIn(t, env, "rt-signin")
	assert.NotEmpty(t, tok.Access, "access token must be present")
	assert.NotEmpty(t, tok.Refresh, "refresh token must be present")
}

// A valid refresh token yields a new access token AND a rotated refresh token
// (different from the one presented).
func TestRefresh_RotatesTokens(t *testing.T) {
	env := newAuthEnv(t)
	tok := signIn(t, env, "rt-rotate")

	code, fresh := postRefresh(t, env, tok.Refresh)
	require.Equal(t, http.StatusOK, code)
	assert.NotEmpty(t, fresh.Access, "refresh must return a new access token")
	assert.NotEmpty(t, fresh.Refresh, "refresh must return a rotated refresh token")
	assert.NotEqual(t, tok.Refresh, fresh.Refresh, "refresh token must rotate, not be reused")
}

// Reuse detection: presenting a refresh token that was already rotated out
// (revoked) must 401 AND revoke the whole token family — so the rotated token
// issued in its place also stops working.
func TestRefresh_ReusedOldToken_RevokesFamily(t *testing.T) {
	env := newAuthEnv(t)
	tok := signIn(t, env, "rt-reuse")

	// Rotate once: old → revoked, fresh issued.
	code, fresh := postRefresh(t, env, tok.Refresh)
	require.Equal(t, http.StatusOK, code)

	// Replaying the old (revoked) token is treated as theft.
	code, _ = postRefresh(t, env, tok.Refresh)
	assert.Equal(t, http.StatusUnauthorized, code, "reused old token must be rejected")

	// And the family is nuked: the legitimately rotated token is now dead too.
	code, _ = postRefresh(t, env, fresh.Refresh)
	assert.Equal(t, http.StatusUnauthorized, code, "reuse must revoke the rotated token as well")
}

func TestRefresh_InvalidToken_401(t *testing.T) {
	env := newAuthEnv(t)
	code, _ := postRefresh(t, env, "not-a-real-token")
	assert.Equal(t, http.StatusUnauthorized, code)
}

func TestRefresh_MissingToken_400(t *testing.T) {
	env := newAuthEnv(t)
	rr := env.Do(t, mustReq(t, "POST", "/api/auth/refresh", `{}`))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestRefresh_ExpiredToken_401(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "rt-exp"), "Exp")

	raw, err := auth.GenerateToken()
	require.NoError(t, err)
	_, err = env.Queries.CreateRefreshToken(context.Background(), db.CreateRefreshTokenParams{
		ID:        ulid.New(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(raw),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(-time.Hour), Valid: true},
	})
	require.NoError(t, err)

	code, _ := postRefresh(t, env, raw)
	assert.Equal(t, http.StatusUnauthorized, code)
}

// Logging out with the refresh token in the body must revoke it so it can no
// longer be exchanged.
func TestLogout_RevokesRefreshToken(t *testing.T) {
	env := newAuthEnv(t)
	tok := signIn(t, env, "rt-logout")

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/logout",
		`{"refresh_token":"`+tok.Refresh+`"}`, tok.Access))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	code, _ := postRefresh(t, env, tok.Refresh)
	assert.Equal(t, http.StatusUnauthorized, code, "logged-out refresh token must be dead")
}

// Soft-deleting the account must revoke its refresh tokens (the user row
// survives, so the FK cascade never fires).
func TestDeleteMe_RevokesRefreshTokens(t *testing.T) {
	env := newAuthEnv(t)
	tok := signIn(t, env, "rt-delete")

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/me", "", tok.Access))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	code, _ := postRefresh(t, env, tok.Refresh)
	assert.Equal(t, http.StatusUnauthorized, code, "deleted account's refresh token must be dead")
}
