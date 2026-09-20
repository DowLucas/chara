//go:build integration

package handler_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

// newFeedbackEnv builds a hosted instance — the endpoint is mounted behind
// HostedOnly, so the selfhost default would 404 every request.
func newFeedbackEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Config.InstanceMode = "hosted"
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	return env
}

func TestFeedback_Submit_InsertsRow(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"kind":"bug","body":"Splitting by shares rounds the last cent wrong.",
	          "app_version":"1.4.3 (52)","platform":"ios 18.2","locale":"sv"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback", body, token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var kind, text, version, platform, locale string
	err := env.Pool.QueryRow(context.Background(),
		`SELECT kind, body, app_version, platform, locale FROM feedback_reports WHERE user_id = $1`,
		user.ID).Scan(&kind, &text, &version, &platform, &locale)
	require.NoError(t, err)
	assert.Equal(t, "bug", kind)
	assert.Equal(t, "Splitting by shares rounds the last cent wrong.", text)
	assert.Equal(t, "1.4.3 (52)", version)
	assert.Equal(t, "ios 18.2", platform)
	assert.Equal(t, "sv", locale)
}

func TestFeedback_Submit_AcceptsIdea(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-idea"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback",
		`{"kind":"idea","body":"Let me pin a group to the top."}`, token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())
}

func TestFeedback_Submit_StoresEachSubmissionSeparately(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-repeat"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	// Same text twice: hitting the same bug twice is itself a signal, so
	// there is deliberately no dedup.
	body := `{"kind":"bug","body":"Crashed on save."}`
	for i := 0; i < 2; i++ {
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback", body, token))
		require.Equal(t, http.StatusCreated, rr.Code, "call %d: %s", i, rr.Body.String())
	}

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM feedback_reports WHERE user_id = $1`, user.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count)
}

func TestFeedback_Submit_OmittedMetadataIsNull(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-nometa"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback",
		`{"kind":"bug","body":"No metadata from this client."}`, token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var version, platform, locale *string
	err := env.Pool.QueryRow(context.Background(),
		`SELECT app_version, platform, locale FROM feedback_reports WHERE user_id = $1`,
		user.ID).Scan(&version, &platform, &locale)
	require.NoError(t, err)
	assert.Nil(t, version)
	assert.Nil(t, platform)
	assert.Nil(t, locale)
}

func TestFeedback_Submit_RejectsUnknownKind(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-badkind"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback",
		`{"kind":"complaint","body":"Something."}`, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestFeedback_Submit_RejectsEmptyBody(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-empty"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback",
		`{"kind":"bug","body":"   "}`, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestFeedback_Submit_RejectsOverlongBody(t *testing.T) {
	env := newFeedbackEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-long"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"kind":"bug","body":"` + strings.Repeat("a", 4001) + `"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback", body, token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestFeedback_Submit_RequiresAuth(t *testing.T) {
	env := newFeedbackEnv(t)

	req, err := http.NewRequest("POST", "/api/feedback", nil)
	require.NoError(t, err)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestFeedback_Submit_NotMountedOnSelfhost(t *testing.T) {
	env := testutil.NewEnv(t) // selfhost default
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, nil)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "fb-self"), "Feedback User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/feedback",
		`{"kind":"bug","body":"Should not reach a handler."}`, token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
}
