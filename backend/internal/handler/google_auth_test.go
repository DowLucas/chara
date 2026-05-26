//go:build integration

package handler_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/DowLucas/chara/testutil"
)

const (
	testGoogleIssuer   = "https://accounts.google.com"
	testGoogleClientID = "test-google-web-client.apps.googleusercontent.com"
)

// googleTestRig is the same shape as appleTestRig but issuer-specific.
type googleTestRig struct {
	key      *rsa.PrivateKey
	kid      string
	verifier *oidc.IDTokenVerifier
	jwksSrv  *httptest.Server
}

func newGoogleTestRig(t *testing.T, audience string) *googleTestRig {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	kid := "test-google-key-1"

	nBytes := key.PublicKey.N.Bytes()
	eBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(eBytes, uint64(key.PublicKey.E))
	i := 0
	for i < len(eBytes)-1 && eBytes[i] == 0 {
		i++
	}
	eBytes = eBytes[i:]

	jwks := map[string]any{
		"keys": []map[string]any{
			{
				"kty": "RSA",
				"alg": "RS256",
				"use": "sig",
				"kid": kid,
				"n":   base64.RawURLEncoding.EncodeToString(nBytes),
				"e":   base64.RawURLEncoding.EncodeToString(eBytes),
			},
		},
	}
	jwksJSON, err := json.Marshal(jwks)
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(jwksJSON)
	}))
	t.Cleanup(srv.Close)

	keySet := oidc.NewRemoteKeySet(context.Background(), srv.URL)
	// Google ships both "https://accounts.google.com" and "accounts.google.com"
	// as `iss`. The handler accepts both — for tests we sign with the canonical
	// HTTPS form and let the multi-issuer verifier accept it.
	verifier := oidc.NewVerifier(testGoogleIssuer, keySet, &oidc.Config{
		ClientID:             audience,
		SupportedSigningAlgs: []string{"RS256"},
	})

	return &googleTestRig{key: key, kid: kid, verifier: verifier, jwksSrv: srv}
}

func (r *googleTestRig) signToken(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = r.kid
	signed, err := tok.SignedString(r.key)
	require.NoError(t, err)
	return signed
}

func newGoogleEnv(t *testing.T, audience string) (*testutil.Env, *googleTestRig) {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Config.InstanceMode = "hosted"
	env.Config.GoogleClientID = audience
	env.Config.GoogleClientSecret = "test-secret"

	rig := newGoogleTestRig(t, audience)

	base := server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	googleH := handler.NewGoogleAuthHandlerWithVerifier(env.Pool, env.Queries, env.Config, env.JWT, rig.verifier)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/google/native", googleH.Native)
	mux.Handle("/", base)
	env.Router = mux
	return env, rig
}

// testGoogleNonce is the raw client-side nonce we use across the google tests.
// Google echoes it back as-is in id_token.nonce.
const testGoogleNonce = "fedcba9876543210fedcba9876543210"

func validGoogleClaims(audience, email, sub string) jwt.MapClaims {
	return jwt.MapClaims{
		"iss":            testGoogleIssuer,
		"aud":            audience,
		"sub":            sub,
		"email":          email,
		"email_verified": true,
		"nonce":          testGoogleNonce,
		"iat":            time.Now().Unix(),
		"exp":            time.Now().Add(10 * time.Minute).Unix(),
	}
}

func googleBodyWithNonce(token, nonce string) string {
	return fmt.Sprintf(`{"identity_token":%q,"nonce":%q}`, token, nonce)
}

func postGoogle(t *testing.T, env *testutil.Env, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("POST", "/api/auth/google/native", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	rr := env.Do(t, req)
	return rr.Result()
}

func TestGoogleNative_NewUserCreatedWithEmptyName(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googlenew")
	token := rig.signToken(t, validGoogleClaims(testGoogleClientID, email, "google-sub-1"))

	body := googleBodyWithNonce(token, testGoogleNonce)
	resp := postGoogle(t, env, body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out struct {
		Token string `json:"token"`
		User  struct {
			ID    string `json:"id"`
			Email string `json:"email"`
			Name  string `json:"name"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.NotEmpty(t, out.Token)
	assert.Equal(t, email, out.User.Email)
	assert.Equal(t, "", out.User.Name)
}

func TestGoogleNative_NewUserCapturesNameFromBody(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googlebodyname")
	token := rig.signToken(t, validGoogleClaims(testGoogleClientID, email, "google-sub-2"))

	body := fmt.Sprintf(`{"identity_token":%q,"name":"  Alice  ","nonce":%q}`, token, testGoogleNonce)
	resp := postGoogle(t, env, body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.Equal(t, "Alice", out.User.Name)
}

func TestGoogleNative_NewUserCapturesNameFromIdTokenClaims(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googleclaimname")
	claims := validGoogleClaims(testGoogleClientID, email, "google-sub-3")
	claims["given_name"] = "Bob"
	claims["family_name"] = "Builder"
	token := rig.signToken(t, claims)

	body := googleBodyWithNonce(token, testGoogleNonce)
	resp := postGoogle(t, env, body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.Equal(t, "Bob Builder", out.User.Name)
}

func TestGoogleNative_ExistingUserDoesNotOverwriteName(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googleexist")

	_, err := env.Queries.UpsertUser(context.Background(), db.UpsertUserParams{
		ID:          ulid.New(),
		Email:       email,
		DisplayName: "Already Set",
		AvatarUrl:   pgtype.Text{Valid: false},
		Locale:      "en",
	})
	require.NoError(t, err)

	token := rig.signToken(t, validGoogleClaims(testGoogleClientID, email, "google-sub-4"))
	body := fmt.Sprintf(`{"identity_token":%q,"name":"Should Be Ignored","nonce":%q}`, token, testGoogleNonce)
	resp := postGoogle(t, env, body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.Equal(t, "Already Set", out.User.Name)
}

func TestGoogleNative_InvalidToken_Returns401(t *testing.T) {
	env, _ := newGoogleEnv(t, testGoogleClientID)
	body := googleBodyWithNonce("not-a-real-jwt", testGoogleNonce)
	resp := postGoogle(t, env, body)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestGoogleNative_WrongAudience_Returns401(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googleaud")
	claims := validGoogleClaims("some.other.client.googleusercontent.com", email, "google-sub-5")
	token := rig.signToken(t, claims)
	body := googleBodyWithNonce(token, testGoogleNonce)
	resp := postGoogle(t, env, body)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestGoogleNative_EmailNotVerified_Returns401(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googleunverified")
	claims := validGoogleClaims(testGoogleClientID, email, "google-sub-6")
	claims["email_verified"] = false
	token := rig.signToken(t, claims)
	body := googleBodyWithNonce(token, testGoogleNonce)
	resp := postGoogle(t, env, body)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// Google nonce binding is best-effort because the v16 RN SDK does not
// surface nonce through its typed API; a missing nonce on either side is
// logged but not fatal. Apple's stricter contract is enforced separately.
func TestGoogleNative_MissingNonce_Allowed(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googlenononce")
	token := rig.signToken(t, validGoogleClaims(testGoogleClientID, email, "google-sub-nonce-missing"))
	body := fmt.Sprintf(`{"identity_token":%q}`, token)
	resp := postGoogle(t, env, body)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// The @react-native-google-signin v16 SDK's nonce binding is opaque
// (sometimes raw, sometimes SHA-256 hashed, sometimes neither depending on
// fallback path). We log the discrepancy but accept the sign-in if the
// rest of the token verifies. Apple stays strict.
func TestGoogleNative_MismatchedNonce_Allowed(t *testing.T) {
	env, rig := newGoogleEnv(t, testGoogleClientID)
	email := uniqueEmail(t, "googlewrongnonce")
	token := rig.signToken(t, validGoogleClaims(testGoogleClientID, email, "google-sub-nonce-bad"))
	body := googleBodyWithNonce(token, "a-different-nonce-than-baked-in")
	resp := postGoogle(t, env, body)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGoogleNative_NotMountedOnSelfhost(t *testing.T) {
	env := testutil.NewEnv(t)
	env.Config.InstanceMode = "selfhost"
	env.Config.GoogleClientID = testGoogleClientID
	env.Config.GoogleClientSecret = "test-secret"
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)

	req, err := http.NewRequest("POST", "/api/auth/google/native", strings.NewReader(`{"identity_token":"x","nonce":"y"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}
