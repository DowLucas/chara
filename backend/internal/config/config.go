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

	// Gemini — multimodal receipt OCR. Optional. When unset the OCR feature
	// is hidden (instance advertises features.ocr=false and the /receipts
	// route is not mounted).
	GeminiAPIKey string

	// Protocol bounds — see docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md §9.
	// MinAppProtocol is the minimum X-Chara-App-Protocol header value accepted on
	// authenticated /api/* requests. Defaults to 0 so legacy app builds (which
	// don't send the header) keep working during rollout (§19 step 1).
	// MaxAppProtocol is the upper bound; clients above this get a 426.
	MinAppProtocol int
	MaxAppProtocol int

	// RecurringEnabled gates the River-backed recurring-expense queue.
	// Default off so the API still boots without the River tables present;
	// flipped on in Phase 4 once the schema has rolled out everywhere.
	RecurringEnabled bool
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
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@chara.app"),

		S3Endpoint:  getEnv("S3_ENDPOINT", ""),
		S3Bucket:    getEnv("S3_BUCKET", "chara"),
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

		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),

		MinAppProtocol: getEnvInt("MIN_APP_PROTOCOL", 0),
		MaxAppProtocol: getEnvInt("MAX_APP_PROTOCOL", 1),

		// Default ON: Phase 4 wired the schema, HTTP routes, and the
		// React Native UI. Self-hosters can opt out with RECURRING_ENABLED=false
		// (e.g. to skip the River background job system entirely).
		RecurringEnabled: getEnv("RECURRING_ENABLED", "true") != "false" && getEnv("RECURRING_ENABLED", "true") != "0",
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
	if c.InstanceMode == "selfhost" {
		if c.JWTSecret == "" {
			return fmt.Errorf("config: JWT_SECRET is required for selfhost mode")
		}
		if len(c.JWTSecret) < 32 {
			return fmt.Errorf("config: JWT_SECRET must be at least 32 characters")
		}
	}
	if c.InstanceMode == "hosted" {
		if c.JWTPrivateKeyPEM == "" {
			return fmt.Errorf("config: JWT_PRIVATE_KEY_PEM is required for hosted mode")
		}
		if c.JWTPublicKeyPEM == "" {
			return fmt.Errorf("config: JWT_PUBLIC_KEY_PEM is required for hosted mode")
		}
		if c.DevMode {
			return fmt.Errorf("config: DEV_MODE must be false in hosted mode")
		}
	}
	if c.JWTPrivateKeyPEM != "" && c.JWTPublicKeyPEM == "" {
		return fmt.Errorf("config: JWT_PUBLIC_KEY_PEM is required when JWT_PRIVATE_KEY_PEM is set")
	}
	if c.ResendAPIKey == "" && c.SMTPHost == "" && !c.DevMode {
		return fmt.Errorf("config: at least one of RESEND_API_KEY or SMTP_HOST must be set (or DEV_MODE=true)")
	}
	return nil
}

func (c *Config) IsHosted() bool    { return c.InstanceMode == "hosted" }
func (c *Config) IsSelfHost() bool  { return c.InstanceMode == "selfhost" }
// HasGoogle reports whether Google Sign In is configured. The native ID-token
// flow only needs the client ID for audience verification; the secret is kept
// in the config for the future server-side web OAuth code-exchange flow but
// is not required to enable the native flow.
func (c *Config) HasGoogle() bool   { return c.GoogleClientID != "" }
func (c *Config) HasApple() bool    { return c.AppleBundleID != "" }
func (c *Config) HasOIDC() bool     { return c.OIDCIssuerURL != "" && c.OIDCClientID != "" }
func (c *Config) HasGemini() bool   { return c.GeminiAPIKey != "" }

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
