//go:build integration

package handler_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	testAppleIssuer   = "https://appleid.apple.com"
	testAppleBundleID = "app.chara"
)

// appleTestRig holds a generated RSA keypair, a JWKS HTTP server, and an
// oidc.IDTokenVerifier wired to trust that keypair.
type appleTestRig struct {
	key      *rsa.PrivateKey
	kid      string
	verifier *oidc.IDTokenVerifier
	jwksSrv  *httptest.Server
}

func newAppleTestRig(t *testing.T, audience string) *appleTestRig {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	kid := "test-key-1"

	// Build a JWKS document for the public key.
	nBytes := key.PublicKey.N.Bytes()
	eBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(eBytes, uint64(key.PublicKey.E))
	// Trim leading zero bytes for the exponent.
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
	verifier := oidc.NewVerifier(testAppleIssuer, keySet, &oidc.Config{
		ClientID:             audience,
		SupportedSigningAlgs: []string{"RS256"},
	})

	return &appleTestRig{key: key, kid: kid, verifier: verifier, jwksSrv: srv}
}

// signToken signs a token with the rig's key. claims must include iss/aud/exp/sub/email.
func (r *appleTestRig) signToken(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = r.kid
	signed, err := tok.SignedString(r.key)
	require.NoError(t, err)
	return signed
}

// _ is used to keep imports if unused locally
var _ = sha256.New
var _ = big.NewInt
var _ = fmt.Sprintf

// newAppleEnv builds an integration env, mounts the Apple handler with a
// test verifier (bypassing the real Apple JWKS).
func newAppleEnv(t *testing.T, audience string) (*testutil.Env, *appleTestRig) {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Config.InstanceMode = "hosted"
	env.Config.AppleBundleID = audience
	// Hosted instances normally need an RSA JWT key, but our test JWT
	// service is HS256 — that's fine, the JWT package doesn't care here.

	rig := newAppleTestRig(t, audience)

	// Build the same router as server.New, but with our test-verifier Apple
	// handler mounted in the HostedOnly group. Easiest path: build the base
	// router with server.New, then mount Apple on top by composing a new
	// outer mux. Cleaner: directly construct a chi router that mirrors
	// server.New's hosted block plus delegates everything else to it.
	//
	// In practice the simplest reliable thing is: call server.New (so all
	// other routes exist), then wrap with a handler that intercepts the
	// Apple path. That's what we do here.
	base := server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	appleH := handler.NewAppleAuthHandlerWithVerifier(env.Pool, env.Queries, env.Config, env.JWT, rig.verifier)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/apple/native", appleH.Native)
	mux.Handle("/", base)
	env.Router = mux
	return env, rig
}

// testAppleNonce is the raw client-side nonce we use across the apple tests.
// Apple's id_token.nonce claim contains SHA-256(testAppleNonce) (hex).
const testAppleNonce = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func testAppleNonceHash() string {
	sum := sha256.Sum256([]byte(testAppleNonce))
	return hex.EncodeToString(sum[:])
}

func validAppleClaims(audience, email, sub string) jwt.MapClaims {
	return jwt.MapClaims{
		"iss":            testAppleIssuer,
		"aud":            audience,
		"sub":            sub,
		"email":          email,
		"email_verified": true,
		"nonce":          testAppleNonceHash(),
		"iat":            time.Now().Unix(),
		"exp":            time.Now().Add(10 * time.Minute).Unix(),
	}
}

// appleBodyWithNonce shapes the standard request body — identity_token + nonce.
func appleBodyWithNonce(token, nonce string) string {
	return fmt.Sprintf(`{"identity_token":%q,"nonce":%q}`, token, nonce)
}

func postApple(t *testing.T, env *testutil.Env, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("POST", "/api/auth/apple/native", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	rr := env.Do(t, req)
	return rr.Result()
}

func TestAppleNative_NewUserCreatedWithEmptyName(t *testing.T) {
	env, rig := newAppleEnv(t, testAppleBundleID)
	email := uniqueEmail(t, "applenew")
	token := rig.signToken(t, validAppleClaims(testAppleBundleID, email, "apple-sub-1"))

	body := appleBodyWithNonce(token, testAppleNonce)
	resp := postApple(t, env, body)
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

func TestAppleNative_NewUserCapturesNameOnFirstSignIn(t *testing.T) {
	env, rig := newAppleEnv(t, testAppleBundleID)
	email := uniqueEmail(t, "applename")
	token := rig.signToken(t, validAppleClaims(testAppleBundleID, email, "apple-sub-2"))

	body := fmt.Sprintf(`{"identity_token":%q,"name":"  Apple User  ","nonce":%q}`, token, testAppleNonce)
	resp := postApple(t, env, body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.Equal(t, "Apple User", out.User.Name)
}

func TestAppleNative_ExistingUserDoesNotOverwriteName(t *testing.T) {
	env, rig := newAppleEnv(t, testAppleBundleID)
	email := uniqueEmail(t, "appleexist")

	// Pre-seed user with a name.
	_, err := env.Queries.UpsertUser(context.Background(), db.UpsertUserParams{
		ID:          ulid.New(),
		Email:       email,
		DisplayName: "Already Set",
		AvatarUrl:   pgtype.Text{Valid: false},
		Locale:      "en",
	})
	require.NoError(t, err)

	token := rig.signToken(t, validAppleClaims(testAppleBundleID, email, "apple-sub-3"))
	body := fmt.Sprintf(`{"identity_token":%q,"name":"Should Be Ignored","nonce":%q}`, token, testAppleNonce)
	resp := postApple(t, env, body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	assert.Equal(t, "Already Set", out.User.Name)
}

func TestAppleNative_InvalidToken_Returns401(t *testing.T) {
	env, _ := newAppleEnv(t, testAppleBundleID)
	body := appleBodyWithNonce("not-a-real-jwt", testAppleNonce)
	resp := postApple(t, env, body)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAppleNative_WrongAudience_Returns401(t *testing.T) {
	env, rig := newAppleEnv(t, testAppleBundleID)
	email := uniqueEmail(t, "appleaud")
	claims := validAppleClaims("some.other.app", email, "apple-sub-4")
	token := rig.signToken(t, claims)
	body := appleBodyWithNonce(token, testAppleNonce)
	resp := postApple(t, env, body)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAppleNative_MissingNonce_Returns400(t *testing.T) {
	env, rig := newAppleEnv(t, testAppleBundleID)
	email := uniqueEmail(t, "applenonon")
	token := rig.signToken(t, validAppleClaims(testAppleBundleID, email, "apple-sub-nonce-missing"))
	body := fmt.Sprintf(`{"identity_token":%q}`, token)
	resp := postApple(t, env, body)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAppleNative_MismatchedNonce_Returns401(t *testing.T) {
	env, rig := newAppleEnv(t, testAppleBundleID)
	email := uniqueEmail(t, "applewrongnonce")
	// Apple's token has the right nonce claim, but client supplies a different
	// raw nonce — SHA-256(wrong) won't match.
	token := rig.signToken(t, validAppleClaims(testAppleBundleID, email, "apple-sub-nonce-bad"))
	body := appleBodyWithNonce(token, "different-nonce-than-the-one-baked-in")
	resp := postApple(t, env, body)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAppleNative_NotMountedOnSelfhost(t *testing.T) {
	// Build an env explicitly in selfhost mode and mount via server.New
	// (no handler.NewAppleAuthHandlerWithVerifier override). The HostedOnly
	// middleware guarding the route group should yield 404.
	env := testutil.NewEnv(t)
	env.Config.InstanceMode = "selfhost"
	env.Config.AppleBundleID = testAppleBundleID
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)

	req, err := http.NewRequest("POST", "/api/auth/apple/native", strings.NewReader(`{"identity_token":"x","nonce":"y"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}
