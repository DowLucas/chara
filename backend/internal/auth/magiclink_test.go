package auth_test

import (
	"testing"

	"github.com/DowLucas/quits/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateToken_IsHex(t *testing.T) {
	token, err := auth.GenerateToken()
	require.NoError(t, err)
	assert.Regexp(t, `^[0-9a-f]{64}$`, token, "token must be 32-byte hex string")
}

func TestGenerateToken_IsUnique(t *testing.T) {
	a, err := auth.GenerateToken()
	require.NoError(t, err)
	b, err := auth.GenerateToken()
	require.NoError(t, err)
	assert.NotEqual(t, a, b)
}

func TestHashToken_IsDeterministic(t *testing.T) {
	h1 := auth.HashToken("abc123")
	h2 := auth.HashToken("abc123")
	assert.Equal(t, h1, h2)
}

func TestHashToken_DiffersForDiffInput(t *testing.T) {
	assert.NotEqual(t, auth.HashToken("a"), auth.HashToken("b"))
}

func TestHashToken_IsHex(t *testing.T) {
	h := auth.HashToken("any-token-value")
	assert.Regexp(t, `^[0-9a-f]{64}$`, h, "hash must be 64-char hex (SHA-256)")
}
