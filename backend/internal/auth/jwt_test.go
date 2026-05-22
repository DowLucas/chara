package auth_test

import (
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
