//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newAuthEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Config.DevMode = true // surface magic-link token in response
	env.Config.MagicLinkTTL = 15 * time.Minute
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	return env
}

func mustReq(t *testing.T, method, path, body string) *http.Request {
	t.Helper()
	req, err := http.NewRequest(method, path, strings.NewReader(body))
	require.NoError(t, err)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return req
}

// New users created via magic-link verify must NOT get a derived display_name.
// The display_name must be empty so the client can require onboarding to capture
// a full name.
func TestVerify_NewUserHasEmptyDisplayName(t *testing.T) {
	env := newAuthEnv(t)
	email := uniqueEmail(t, "newuser")

	rr := env.Do(t, mustReq(t, "POST", "/api/auth/magic-link", `{"email":"`+email+`"}`))
	require.Equal(t, http.StatusOK, rr.Code)

	var mlResp struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&mlResp))
	require.NotEmpty(t, mlResp.Token, "dev mode should return token")

	rr = env.Do(t, mustReq(t, "POST", "/api/auth/verify", `{"token":"`+mlResp.Token+`"}`))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var verifyResp struct {
		Token string `json:"token"`
		User  struct {
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&verifyResp))
	assert.Equal(t, "", verifyResp.User.Name, "new user must have empty name until onboarding sets one")
	assert.Equal(t, email, verifyResp.User.Email)
}

func TestUpdateMe_SetsFullName(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "u"), "")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", `{"name":"Alice Andersson"}`, token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp struct {
		Name string `json:"name"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Alice Andersson", resp.Name)

	q := db.New(env.Pool)
	got, err := q.GetUserByID(context.Background(), user.ID)
	require.NoError(t, err)
	assert.Equal(t, "Alice Andersson", got.DisplayName)
}

func TestUpdateMe_RejectsBlank(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "u"), "")
	token := env.MintToken(t, user.ID, user.Email)

	for _, body := range []string{`{"name":""}`, `{"name":"   "}`, `{"name":"\t\n"}`} {
		rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", body, token))
		assert.Equal(t, http.StatusBadRequest, rr.Code, "body=%s", body)
	}
}

func TestUpdateMe_TrimsWhitespace(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "u"), "")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", `{"name":"  Bob Berg  "}`, token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp struct {
		Name string `json:"name"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Bob Berg", resp.Name)
}

// Updating the user's name must sync the name on every group_members row that
// references them, so member lists, expenses and settlements all show the
// updated full name.
func TestUpdateMe_SyncsGroupMemberNames(t *testing.T) {
	env := newAuthEnv(t)
	q := db.New(env.Pool)

	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "A")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	g1, aliceMem1 := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "A")
	_, aliceMem2 := testutil.CreateGroup(t, env.Pool, "Apartment", "SEK", alice.ID, "A")
	bobMem := testutil.AddMember(t, env.Pool, g1.ID, bob.ID, "Bob")

	token := env.MintToken(t, alice.ID, alice.Email)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", `{"name":"Alice Andersson"}`, token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	got1, err := q.GetGroupMember(context.Background(), aliceMem1.ID)
	require.NoError(t, err)
	assert.Equal(t, "Alice Andersson", got1.Name, "group 1 member name should be synced")

	got2, err := q.GetGroupMember(context.Background(), aliceMem2.ID)
	require.NoError(t, err)
	assert.Equal(t, "Alice Andersson", got2.Name, "group 2 member name should be synced")

	gotBob, err := q.GetGroupMember(context.Background(), bobMem.ID)
	require.NoError(t, err)
	assert.Equal(t, "Bob", gotBob.Name, "other users' names must not be touched")
}

func TestUpdateMe_SetsPhone(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "u"), "Carl")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", `{"phone":"+46 70 123 45 67"}`, token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp struct {
		Phone string `json:"phone"`
		Name  string `json:"name"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "+46 70 123 45 67", resp.Phone)
	assert.Equal(t, "Carl", resp.Name, "name must be preserved when only phone is sent")
}

func TestUpdateMe_RejectsBlankPhone(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "u"), "Carl")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", `{"phone":"   "}`, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// Logout is advisory (JWT stays valid until expiry). The handler does nothing
// today but must respond 204 to keep the app's contract stable.
func TestLogout_Returns204WithValidToken(t *testing.T) {
	env := newAuthEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "logout"), "Logout User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/logout", "", token))
	assert.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())
}

func TestLogout_RequiresAuth(t *testing.T) {
	env := newAuthEnv(t)
	rr := env.Do(t, mustReq(t, "POST", "/api/me/logout", ""))
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
