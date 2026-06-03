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
