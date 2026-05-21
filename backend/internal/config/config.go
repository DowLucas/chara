package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	// Server
	Addr    string
	BaseURL string

	// Database
	DatabaseURL string

	// Instance
	InstanceMode string // "hosted" | "selfhost"
	DevMode      bool   // when true, relaxes email requirement and returns magic-link tokens in the API response

	// JWT
	JWTSecret         string // HS256, required for selfhost
	JWTPrivateKeyPEM  string // RS256, required for hosted
	JWTPublicKeyPEM   string // RS256, required for hosted
	MagicLinkTTL      time.Duration

	// Email
	ResendAPIKey string // hosted; takes precedence over SMTP
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPass     string
	SMTPFrom     string

	// Storage (S3-compatible)
	S3Endpoint  string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3Region    string

	// Push
	ExpoAccessToken string // optional

	// Social auth — hosted only
	GoogleClientID     string
	GoogleClientSecret string
	AppleBundleID      string
	AppleTeamID        string
	AppleKeyID         string
	ApplePrivateKeyPEM string

	// OIDC — selfhost only
	OIDCIssuerURL    string
	OIDCClientID     string
	OIDCClientSecret string
}

func Load() (*Config, error) {
	cfg := &Config{
		Addr:         getEnv("ADDR", ":8080"),
		BaseURL:      getEnv("BASE_URL", "http://localhost:8080"),
		DatabaseURL:  mustGetEnv("DATABASE_URL"),
		InstanceMode: getEnv("INSTANCE_MODE", "selfhost"),
		DevMode:      getEnv("DEV_MODE", "") == "true" || getEnv("DEV_MODE", "") == "1",

		JWTSecret:        getEnv("JWT_SECRET", ""),
		JWTPrivateKeyPEM: getEnv("JWT_PRIVATE_KEY_PEM", ""),
		JWTPublicKeyPEM:  getEnv("JWT_PUBLIC_KEY_PEM", ""),
		MagicLinkTTL:     getDuration("MAGIC_LINK_TTL", 15*time.Minute),

		ResendAPIKey: getEnv("RESEND_API_KEY", ""),
		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnvInt("SMTP_PORT", 587),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPass:     getEnv("SMTP_PASS", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@quits.app"),

		S3Endpoint:  getEnv("S3_ENDPOINT", ""),
		S3Bucket:    getEnv("S3_BUCKET", "quits"),
		S3AccessKey: getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey: getEnv("S3_SECRET_KEY", ""),
		S3Region:    getEnv("S3_REGION", "us-east-1"),

		ExpoAccessToken: getEnv("EXPO_ACCESS_TOKEN", ""),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		AppleBundleID:      getEnv("APPLE_BUNDLE_ID", ""),
		AppleTeamID:        getEnv("APPLE_TEAM_ID", ""),
		AppleKeyID:         getEnv("APPLE_KEY_ID", ""),
		ApplePrivateKeyPEM: getEnv("APPLE_PRIVATE_KEY_PEM", ""),

		OIDCIssuerURL:    getEnv("OIDC_ISSUER_URL", ""),
		OIDCClientID:     getEnv("OIDC_CLIENT_ID", ""),
		OIDCClientSecret: getEnv("OIDC_CLIENT_SECRET", ""),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) validate() error {
	if c.InstanceMode != "hosted" && c.InstanceMode != "selfhost" {
		return fmt.Errorf("config: INSTANCE_MODE must be 'hosted' or 'selfhost', got %q", c.InstanceMode)
	}
	if c.InstanceMode == "selfhost" && c.JWTSecret == "" {
		return fmt.Errorf("config: JWT_SECRET is required for selfhost mode")
	}
	if c.InstanceMode == "hosted" && c.JWTPrivateKeyPEM == "" {
		return fmt.Errorf("config: JWT_PRIVATE_KEY_PEM is required for hosted mode")
	}
	if c.ResendAPIKey == "" && c.SMTPHost == "" && !c.DevMode {
		return fmt.Errorf("config: at least one of RESEND_API_KEY or SMTP_HOST must be set (or DEV_MODE=true)")
	}
	return nil
}

func (c *Config) IsHosted() bool    { return c.InstanceMode == "hosted" }
func (c *Config) IsSelfHost() bool  { return c.InstanceMode == "selfhost" }
func (c *Config) HasGoogle() bool   { return c.GoogleClientID != "" && c.GoogleClientSecret != "" }
func (c *Config) HasApple() bool    { return c.AppleBundleID != "" }
func (c *Config) HasOIDC() bool     { return c.OIDCIssuerURL != "" && c.OIDCClientID != "" }

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("config: required environment variable %q is not set", key))
	}
	return v
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
