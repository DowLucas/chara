package auth_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"strings"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testIssuer = "https://api.test.example.com"

func TestHS256_RoundTrip(t *testing.T) {
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
		Issuer: testIssuer,
	})
	require.NoError(t, err)

	token, err := svc.Sign("user_01", "test@example.com", "selfhost")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := svc.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "user_01", claims.UserID)
	assert.Equal(t, "test@example.com", claims.Email)
	assert.Equal(t, "selfhost", claims.InstanceMode)
}

func TestHS256_RejectsExpiredToken(t *testing.T) {
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:      "selfhost",
		Secret:    "test-secret-that-is-long-enough",
		Issuer:    testIssuer,
		AccessTTL: -time.Second, // already expired
	})
	require.NoError(t, err)

	token, err := svc.Sign("user_01", "test@example.com", "selfhost")
	require.NoError(t, err)

	_, err = svc.Verify(token)
	assert.Error(t, err)
}

func TestHS256_RejectsTamperedToken(t *testing.T) {
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
		Issuer: testIssuer,
	})
	require.NoError(t, err)

	token, err := svc.Sign("user_01", "test@example.com", "selfhost")
	require.NoError(t, err)

	_, err = svc.Verify(token + "tampered")
	assert.Error(t, err)
}

func TestHS256_RejectsWrongSecret(t *testing.T) {
	signer, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "correct-secret-long-enough-here",
		Issuer: testIssuer,
	})
	require.NoError(t, err)

	verifier, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "wrong-secret-that-is-long-enough",
		Issuer: testIssuer,
	})
	require.NoError(t, err)

	token, err := signer.Sign("user_01", "test@example.com", "selfhost")
	require.NoError(t, err)

	_, err = verifier.Verify(token)
	assert.Error(t, err)
}

func TestNewJWTService_RequiresSecret(t *testing.T) {
	_, err := auth.NewJWTService(auth.JWTConfig{Mode: "selfhost", Secret: ""})
	assert.Error(t, err)
}

// decodeUnverifiedClaims parses a JWT's claims/header without checking the
// signature. Used to inspect the registered claims we set on Sign().
func decodeUnverifiedClaims(t *testing.T, token string) (header, claims map[string]any) {
	t.Helper()
	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)

	hb, err := base64.RawURLEncoding.DecodeString(parts[0])
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(hb, &header))

	pb, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(pb, &claims))
	return header, claims
}

func TestSign_SetsIssuerAndAudience(t *testing.T) {
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
		Issuer: testIssuer,
	})
	require.NoError(t, err)

	token, err := svc.Sign("user_01", "test@example.com", "selfhost")
	require.NoError(t, err)

	_, claims := decodeUnverifiedClaims(t, token)
	assert.Equal(t, testIssuer, claims["iss"])
	// jwt encodes single-element audience as a string or []string; accept both.
	switch aud := claims["aud"].(type) {
	case string:
		assert.Equal(t, "chara-api", aud)
	case []any:
		require.Len(t, aud, 1)
		assert.Equal(t, "chara-api", aud[0])
	default:
		t.Fatalf("unexpected aud type %T", claims["aud"])
	}
	jti, ok := claims["jti"].(string)
	require.True(t, ok, "jti must be set")
	assert.Len(t, jti, 32, "jti is 16 random bytes hex (32 chars)")
}

func TestVerify_RejectsWrongIssuer(t *testing.T) {
	signer, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
		Issuer: "https://attacker.example.com",
	})
	require.NoError(t, err)
	verifier, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
		Issuer: testIssuer,
	})
	require.NoError(t, err)
	token, err := signer.Sign("user_01", "test@example.com", "selfhost")
	require.NoError(t, err)
	_, err = verifier.Verify(token)
	assert.Error(t, err)
}

func TestVerify_RejectsWrongAudience(t *testing.T) {
	// Hand-craft a token with the right iss + secret but wrong aud.
	secret := "test-secret-that-is-long-enough"
	claims := jwt.MapClaims{
		"sub":        "user_01",
		"email":      "test@example.com",
		"chara_mode": "selfhost",
		"iss":        testIssuer,
		"aud":        "some-other-api",
		"iat":        time.Now().Unix(),
		"exp":        time.Now().Add(time.Hour).Unix(),
		"jti":        "abcdef0123456789abcdef0123456789",
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	require.NoError(t, err)

	verifier, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: secret,
		Issuer: testIssuer,
	})
	require.NoError(t, err)
	_, err = verifier.Verify(signed)
	assert.Error(t, err)
}

func TestVerify_RejectsAlgNone(t *testing.T) {
	// "alg":"none" is the classic JWT confusion attack — must be rejected.
	header := `{"alg":"none","typ":"JWT"}`
	body := `{"sub":"user_01","email":"a@example.com","chara_mode":"selfhost","iss":"` + testIssuer + `","aud":"chara-api","exp":` +
		strconvI64(time.Now().Add(time.Hour).Unix()) + `}`
	tok := base64.RawURLEncoding.EncodeToString([]byte(header)) + "." +
		base64.RawURLEncoding.EncodeToString([]byte(body)) + "."

	verifier, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
		Issuer: testIssuer,
	})
	require.NoError(t, err)
	_, err = verifier.Verify(tok)
	assert.Error(t, err)
}

func strconvI64(n int64) string {
	// avoid pulling strconv in the test stub: simple decimal encode.
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// generateRSAKeyPEMs returns a fresh RSA private/public PEM pair for tests.
func generateRSAKeyPEMs(t *testing.T) (privPEM, pubPEM string) {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privDER, err := x509.MarshalPKCS8PrivateKey(priv)
	require.NoError(t, err)
	privPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privDER}))
	pubDER, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	require.NoError(t, err)
	pubPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubDER}))
	return
}

func TestRS256_RoundTrip(t *testing.T) {
	privPEM, pubPEM := generateRSAKeyPEMs(t)
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:          "hosted",
		PrivateKeyPEM: privPEM,
		PublicKeyPEM:  pubPEM,
		Issuer:        testIssuer,
	})
	require.NoError(t, err)

	token, err := svc.Sign("user_01", "test@example.com", "hosted")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := svc.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "user_01", claims.UserID)
	assert.Equal(t, "test@example.com", claims.Email)
	assert.Equal(t, "hosted", claims.InstanceMode)
}

func TestRS256_SetsKIDHeader(t *testing.T) {
	privPEM, pubPEM := generateRSAKeyPEMs(t)
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:          "hosted",
		PrivateKeyPEM: privPEM,
		PublicKeyPEM:  pubPEM,
		Issuer:        testIssuer,
	})
	require.NoError(t, err)

	token, err := svc.Sign("user_01", "t@example.com", "hosted")
	require.NoError(t, err)

	header, _ := decodeUnverifiedClaims(t, token)
	kid, ok := header["kid"].(string)
	require.True(t, ok, "kid header must be set")
	assert.Len(t, kid, 16, "kid is first 16 hex chars of SHA-256(spki)")
}

func TestRS256_RejectsHS256Token(t *testing.T) {
	// A token signed with HS256 must not verify against an RS256 service.
	hs, err := auth.NewJWTService(auth.JWTConfig{Mode: "selfhost", Secret: "secret-long-enough-for-hs256", Issuer: testIssuer})
	require.NoError(t, err)
	token, err := hs.Sign("user_01", "t@example.com", "selfhost")
	require.NoError(t, err)

	privPEM, pubPEM := generateRSAKeyPEMs(t)
	rs, err := auth.NewJWTService(auth.JWTConfig{
		Mode:          "hosted",
		PrivateKeyPEM: privPEM,
		PublicKeyPEM:  pubPEM,
		Issuer:        testIssuer,
	})
	require.NoError(t, err)
	_, err = rs.Verify(token)
	assert.Error(t, err)
}

func TestNewJWTService_HostedRequiresKeys(t *testing.T) {
	_, err := auth.NewJWTService(auth.JWTConfig{Mode: "hosted"})
	assert.Error(t, err)
}
