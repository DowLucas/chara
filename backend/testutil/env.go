//go:build integration

package testutil

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const testJWTSecret = "test-secret-for-integration-tests-only-32b"

// Env is the test environment shared across integration tests in a package.
type Env struct {
	Pool    *pgxpool.Pool
	Queries *db.Queries
	JWT     *auth.JWTService
	Config  *config.Config
	Router  http.Handler // set after server.New is called
}

// NewEnv creates a test environment backed by the shared test DB.
// The router is nil until you call env.SetRouter(server.New(...)).
func NewEnv(t *testing.T) *Env {
	t.Helper()
	pool := SharedDB(t)

	jwtSvc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: testJWTSecret,
		Issuer: "http://localhost:8080",
	})
	require.NoError(t, err)

	cfg := &config.Config{
		InstanceMode: "selfhost",
		JWTSecret:    testJWTSecret,
		BaseURL:      "http://localhost:8080",
		S3Bucket:     "chara",
	}

	return &Env{
		Pool:    pool,
		Queries: db.New(pool),
		JWT:     jwtSvc,
		Config:  cfg,
	}
}

// MintToken returns a signed JWT for the given user.
func (e *Env) MintToken(t *testing.T, userID, email string) string {
	t.Helper()
	token, err := e.JWT.Sign(userID, email, "selfhost")
	require.NoError(t, err)
	return token
}

// AuthRequest builds an HTTP request with a valid Bearer token for userID.
func (e *Env) AuthRequest(t *testing.T, method, path, body, token string) *http.Request {
	t.Helper()
	var req *http.Request
	var err error
	if body != "" {
		req, err = http.NewRequest(method, path, bytes.NewBufferString(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
	} else {
		req, err = http.NewRequest(method, path, nil)
		require.NoError(t, err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}

// Do executes a request against env.Router and returns the recorder.
func (e *Env) Do(t *testing.T, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	require.NotNil(t, e.Router, "env.Router is nil — call env.SetRouter(server.New(...))")
	rr := httptest.NewRecorder()
	e.Router.ServeHTTP(rr, req)
	return rr
}

// Helpers to construct pgtype values cleanly in fixtures.
func pgText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}

func nullText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}
