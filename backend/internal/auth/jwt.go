package auth

import (
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
	Mode      string // "selfhost" | "hosted"
	Secret    string // HS256, selfhost
	AccessTTL time.Duration
}

type JWTService struct {
	cfg    JWTConfig
	method jwt.SigningMethod
	key    any
	verify any
}

func NewJWTService(cfg JWTConfig) (*JWTService, error) {
	if cfg.Mode == "selfhost" {
		if cfg.Secret == "" {
			return nil, fmt.Errorf("jwt: Secret is required for selfhost mode")
		}
		if cfg.AccessTTL == 0 {
			cfg.AccessTTL = defaultAccessTTL
		}
		return &JWTService{cfg: cfg, method: jwt.SigningMethodHS256, key: []byte(cfg.Secret), verify: []byte(cfg.Secret)}, nil
	}
	return nil, fmt.Errorf("jwt: unsupported mode %q (hosted RS256 not yet implemented)", cfg.Mode)
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
