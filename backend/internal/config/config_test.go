package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func baseSelfhost() *Config {
	return &Config{
		InstanceMode: "selfhost",
		JWTSecret:    "this-secret-is-thirty-two-chars!!",
		DevMode:      true, // disables the email-provider requirement
	}
}

func baseHosted() *Config {
	return &Config{
		InstanceMode:     "hosted",
		JWTPrivateKeyPEM: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
		JWTPublicKeyPEM:  "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----",
		ResendAPIKey:     "re_test",
	}
}

func TestValidate_HostedRejectsDevMode(t *testing.T) {
	c := baseHosted()
	c.DevMode = true
	err := c.validate()
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "dev_mode")
}

func TestValidate_PrivateKeyWithoutPublic(t *testing.T) {
	c := baseHosted()
	c.JWTPublicKeyPEM = ""
	err := c.validate()
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "jwt_public_key_pem")
}

func TestValidate_SelfhostJWTSecretTooShort(t *testing.T) {
	c := baseSelfhost()
	c.JWTSecret = "short"
	err := c.validate()
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "32 characters")
}

func TestValidate_SelfhostHappyPath(t *testing.T) {
	c := baseSelfhost()
	assert.NoError(t, c.validate())
}

func TestValidate_HostedHappyPath(t *testing.T) {
	c := baseHosted()
	assert.NoError(t, c.validate())
}

func TestHasGoogle_OnlyRequiresClientID(t *testing.T) {
	c := &Config{GoogleClientID: "client.apps.googleusercontent.com"}
	assert.True(t, c.HasGoogle())
}

func TestHasGoogle_FalseWhenEmpty(t *testing.T) {
	c := &Config{}
	assert.False(t, c.HasGoogle())
}

func TestHasExpo_TrueWhenTokenSet(t *testing.T) {
	c := &Config{ExpoAccessToken: "expo-token"}
	assert.True(t, c.HasExpo())
}

func TestHasExpo_FalseWhenEmpty(t *testing.T) {
	c := &Config{}
	assert.False(t, c.HasExpo())
}

func TestParseEmailList(t *testing.T) {
	assert.Nil(t, parseEmailList(""))
	assert.Nil(t, parseEmailList("   "))
	assert.Equal(t,
		[]string{"a@x.test", "b@x.test"},
		parseEmailList(" A@X.test, b@x.test ,, A@X.test"),
		"trims, lowercases, drops empties, dedupes",
	)
}

func TestIsDemoLogin(t *testing.T) {
	c := &Config{DemoLoginEmails: parseEmailList("appstore-review@getchara.app, playstore-review@getchara.app")}
	assert.True(t, c.IsDemoLogin("appstore-review@getchara.app"))
	assert.True(t, c.IsDemoLogin("  AppStore-Review@GetChara.app "), "case + whitespace insensitive")
	assert.False(t, c.IsDemoLogin("someone@else.test"))
	assert.False(t, (&Config{}).IsDemoLogin("appstore-review@getchara.app"), "empty allowlist matches nothing")
}

func TestValidate_RejectsPlaceholderJWTSecret(t *testing.T) {
	// The shipped .env.example placeholder is long enough to satisfy the
	// length check, so a self-hoster who copies the file verbatim would boot
	// with a publicly known signing key.
	c := baseSelfhost()
	c.DevMode = false
	c.ResendAPIKey = "re_test" // DevMode=false requires an email provider
	c.JWTSecret = "change-me-to-a-long-random-secret-32b"
	err := c.validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "placeholder")
}

func TestValidate_AllowsPlaceholderJWTSecretInDevMode(t *testing.T) {
	// A local dev box running the example secret is harmless; breaking it
	// would just teach people to delete the check.
	c := baseSelfhost() // DevMode: true
	c.JWTSecret = "change-me-to-a-long-random-secret-32b"
	require.NoError(t, c.validate())
}

func TestValidate_RejectsShortAdminToken(t *testing.T) {
	c := baseSelfhost()
	c.AdminAPIToken = "admin"
	err := c.validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ADMIN_API_TOKEN")
}

func TestValidate_AcceptsLongAdminToken(t *testing.T) {
	c := baseSelfhost()
	c.AdminAPIToken = strings.Repeat("a", 32)
	require.NoError(t, c.validate())
}

func TestValidate_EmptyAdminTokenStillAllowed(t *testing.T) {
	// Unset is the normal case: the admin endpoint 404s when it is empty.
	c := baseSelfhost()
	c.AdminAPIToken = ""
	require.NoError(t, c.validate())
}
