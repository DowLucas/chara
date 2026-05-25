package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	defaultAccessTTL = 24 * time.Hour
	tokenAudience    = "chara-api"
)

type Claims struct {
	UserID       string `json:"sub"`
	Email        string `json:"email"`
	InstanceMode string `json:"chara_mode"`
	jwt.RegisteredClaims
}

type JWTConfig struct {
	Mode          string // "selfhost" | "hosted"
	Secret        string // HS256, selfhost
	PrivateKeyPEM string // RS256, hosted (PKCS8 or PKCS1 PEM)
	PublicKeyPEM  string // RS256, hosted (PKIX PEM)
	Issuer        string // iss claim — usually cfg.BaseURL
	AccessTTL     time.Duration
}

type JWTService struct {
	cfg    JWTConfig
	method jwt.SigningMethod
	key    any
	verify any
	kid    string // RS256 only; "" otherwise
}

func NewJWTService(cfg JWTConfig) (*JWTService, error) {
	if cfg.AccessTTL == 0 {
		cfg.AccessTTL = defaultAccessTTL
	}
	switch cfg.Mode {
	case "selfhost":
		if cfg.Secret == "" {
			return nil, fmt.Errorf("jwt: Secret is required for selfhost mode")
		}
		return &JWTService{cfg: cfg, method: jwt.SigningMethodHS256, key: []byte(cfg.Secret), verify: []byte(cfg.Secret)}, nil
	case "hosted":
		if cfg.PrivateKeyPEM == "" || cfg.PublicKeyPEM == "" {
			return nil, fmt.Errorf("jwt: PrivateKeyPEM and PublicKeyPEM are required for hosted mode")
		}
		priv, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(cfg.PrivateKeyPEM))
		if err != nil {
			return nil, fmt.Errorf("jwt: parse private key: %w", err)
		}
		pub, err := jwt.ParseRSAPublicKeyFromPEM([]byte(cfg.PublicKeyPEM))
		if err != nil {
			return nil, fmt.Errorf("jwt: parse public key: %w", err)
		}
		spki, err := x509.MarshalPKIXPublicKey(pub)
		if err != nil {
			return nil, fmt.Errorf("jwt: marshal public key: %w", err)
		}
		sum := sha256.Sum256(spki)
		kid := hex.EncodeToString(sum[:])[:16]
		return &JWTService{cfg: cfg, method: jwt.SigningMethodRS256, key: priv, verify: pub, kid: kid}, nil
	default:
		return nil, fmt.Errorf("jwt: unsupported mode %q", cfg.Mode)
	}
}

func (s *JWTService) Sign(userID, email, instanceMode string) (string, error) {
	now := time.Now()
	jtiBytes := make([]byte, 16)
	if _, err := rand.Read(jtiBytes); err != nil {
		return "", fmt.Errorf("jwt: generate jti: %w", err)
	}
	claims := Claims{
		UserID:       userID,
		Email:        email,
		InstanceMode: instanceMode,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.Issuer,
			Audience:  jwt.ClaimStrings{tokenAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AccessTTL)),
			ID:        hex.EncodeToString(jtiBytes),
		},
	}
	tok := jwt.NewWithClaims(s.method, claims)
	if s.kid != "" {
		tok.Header["kid"] = s.kid
	}
	return tok.SignedString(s.key)
}

func (s *JWTService) Verify(tokenStr string) (*Claims, error) {
	parserOpts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{s.method.Alg()}),
		jwt.WithAudience(tokenAudience),
	}
	if s.cfg.Issuer != "" {
		parserOpts = append(parserOpts, jwt.WithIssuer(s.cfg.Issuer))
	}
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != s.method.Alg() {
			return nil, fmt.Errorf("jwt: unexpected signing method %q", t.Method.Alg())
		}
		return s.verify, nil
	}, parserOpts...)
	if err != nil {
		return nil, fmt.Errorf("jwt: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("jwt: invalid claims")
	}
	if token.Method.Alg() != s.method.Alg() {
		return nil, fmt.Errorf("jwt: alg mismatch")
	}
	return claims, nil
}

// PublicKey returns the RS256 public key for JWKS exposure. Returns nil for HS256.
func (s *JWTService) PublicKey() *rsa.PublicKey {
	if k, ok := s.verify.(*rsa.PublicKey); ok {
		return k
	}
	return nil
}

// KID returns the key identifier for the RS256 public key. Returns "" for HS256.
func (s *JWTService) KID() string { return s.kid }
