//go:build integration

package handler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

func newWaitlistEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	return env
}

func TestWaitlist_Submit_InsertsRow(t *testing.T) {
	env := newWaitlistEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "wait"), "Wait User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"email":"someone@example.com","trigger":"ocr_cap","source":"mobile","locale":"en"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/waitlist", body, token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM waitlist_signups WHERE user_id = $1 AND trigger = $2 AND email = $3`,
		user.ID, "ocr_cap", "someone@example.com").Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

func TestWaitlist_Submit_IsIdempotentOnRepeat(t *testing.T) {
	env := newWaitlistEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "wait-idem"), "Wait User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"email":"same@example.com","trigger":"ocr_cap"}`
	for i := 0; i < 3; i++ {
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/waitlist", body, token))
		require.Equal(t, http.StatusOK, rr.Code, "call %d: %s", i, rr.Body.String())
	}

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM waitlist_signups WHERE user_id = $1`, user.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "repeated submission must upsert, not duplicate")
}

func TestWaitlist_Submit_DistinctTriggersDoNotCollapse(t *testing.T) {
	env := newWaitlistEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "wait-multi"), "Wait User")
	token := env.MintToken(t, user.ID, user.Email)

	// Same email + user, different triggers. Each is its own signal.
	for _, trig := range []string{"ocr_cap", "recurring_request", "export_request"} {
		body := `{"email":"multi@example.com","trigger":"` + trig + `"}`
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/waitlist", body, token))
		require.Equal(t, http.StatusOK, rr.Code, "trigger=%s: %s", trig, rr.Body.String())
	}

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM waitlist_signups WHERE user_id = $1`, user.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 3, count)
}

func TestWaitlist_Submit_RejectsMissingEmail(t *testing.T) {
	env := newWaitlistEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "wait-noemail"), "Wait User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/waitlist", `{"trigger":"ocr_cap"}`, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWaitlist_Submit_RejectsBadEmail(t *testing.T) {
	env := newWaitlistEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "wait-bademail"), "Wait User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"email":"not-an-email","trigger":"ocr_cap"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/waitlist", body, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWaitlist_Submit_RejectsUnknownTrigger(t *testing.T) {
	env := newWaitlistEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "wait-badtrig"), "Wait User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"email":"x@y.com","trigger":"made_up_thing"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/waitlist", body, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWaitlist_Submit_RequiresAuth(t *testing.T) {
	env := newWaitlistEnv(t)

	req, err := http.NewRequest("POST", "/api/waitlist", nil)
	require.NoError(t, err)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
