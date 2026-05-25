package auth_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHS256_RoundTrip(t *testing.T) {
	svc, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "test-secret-that-is-long-enough",
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
	})
	require.NoError(t, err)

	verifier, err := auth.NewJWTService(auth.JWTConfig{
		Mode:   "selfhost",
		Secret: "wrong-secret-that-is-long-enough",
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

func TestRS256_RejectsHS256Token(t *testing.T) {
	// A token signed with HS256 must not verify against an RS256 service.
	hs, err := auth.NewJWTService(auth.JWTConfig{Mode: "selfhost", Secret: "secret-long-enough-for-hs256"})
	require.NoError(t, err)
	token, err := hs.Sign("user_01", "t@example.com", "selfhost")
	require.NoError(t, err)

	privPEM, pubPEM := generateRSAKeyPEMs(t)
	rs, err := auth.NewJWTService(auth.JWTConfig{
		Mode:          "hosted",
		PrivateKeyPEM: privPEM,
		PublicKeyPEM:  pubPEM,
	})
	require.NoError(t, err)
	_, err = rs.Verify(token)
	assert.Error(t, err)
}

func TestNewJWTService_HostedRequiresKeys(t *testing.T) {
	_, err := auth.NewJWTService(auth.JWTConfig{Mode: "hosted"})
	assert.Error(t, err)
}
