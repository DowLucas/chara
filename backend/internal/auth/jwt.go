package auth

import (
	"crypto/rsa"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const defaultAccessTTL = 24 * time.Hour

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
	AccessTTL     time.Duration
}

type JWTService struct {
	cfg    JWTConfig
	method jwt.SigningMethod
	key    any
	verify any
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
		return &JWTService{cfg: cfg, method: jwt.SigningMethodRS256, key: priv, verify: pub}, nil
	default:
		return nil, fmt.Errorf("jwt: unsupported mode %q", cfg.Mode)
	}
}

func (s *JWTService) Sign(userID, email, instanceMode string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:       userID,
		Email:        email,
		InstanceMode: instanceMode,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AccessTTL)),
		},
	}
	return jwt.NewWithClaims(s.method, claims).SignedString(s.key)
}

func (s *JWTService) Verify(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != s.method.Alg() {
			return nil, fmt.Errorf("jwt: unexpected signing method %q", t.Method.Alg())
		}
		return s.verify, nil
	})
	if err != nil {
		return nil, fmt.Errorf("jwt: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("jwt: invalid claims")
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
