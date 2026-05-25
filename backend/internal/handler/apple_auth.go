package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/ulid"
)

const appleIssuer = "https://appleid.apple.com"

// AppleAuthHandler verifies Apple identity tokens and exchanges them for
// Chara JWTs. The verifier is held on the handler so the JWKS cache from
// go-oidc's RemoteKeySet is reused across requests.
type AppleAuthHandler struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	cfg      *config.Config
	jwt      *auth.JWTService
	verifier *oidc.IDTokenVerifier
}

// NewAppleAuthHandler builds the production handler. It blocks on the
// initial OIDC discovery to Apple, so it must be called once at boot
// (not per request). Returns an error if discovery fails.
func NewAppleAuthHandler(ctx context.Context, pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config, jwtSvc *auth.JWTService) (*AppleAuthHandler, error) {
	if cfg.AppleBundleID == "" {
		return nil, fmt.Errorf("apple auth: AppleBundleID is empty")
	}
	provider, err := oidc.NewProvider(ctx, appleIssuer)
	if err != nil {
		return nil, fmt.Errorf("apple auth: oidc discovery: %w", err)
	}
	verifier := provider.Verifier(&oidc.Config{
		ClientID:             cfg.AppleBundleID,
		SupportedSigningAlgs: []string{"RS256"},
	})
	return NewAppleAuthHandlerWithVerifier(pool, queries, cfg, jwtSvc, verifier), nil
}

// NewAppleAuthHandlerWithVerifier is the same as NewAppleAuthHandler but
// accepts a pre-built verifier — used by integration tests to inject a
// verifier that trusts a locally-generated keypair.
func NewAppleAuthHandlerWithVerifier(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config, jwtSvc *auth.JWTService, verifier *oidc.IDTokenVerifier) *AppleAuthHandler {
	return &AppleAuthHandler{
		pool:     pool,
		queries:  queries,
		cfg:      cfg,
		jwt:      jwtSvc,
		verifier: verifier,
	}
}

type appleNativeRequest struct {
	IdentityToken string `json:"identity_token"`
	Name          string `json:"name"`
	// Nonce is the raw hex nonce the client generated. Apple's id_token
	// contains SHA-256(nonce) as the nonce claim — we recompute and compare.
	// Required: a missing nonce gets a 400 to make replay impossible.
	Nonce string `json:"nonce"`
}

// appleClaims is the subset of fields we read off an Apple identity token.
// email_verified is sometimes a bool, sometimes the string "true" — handle
// both via json.RawMessage and a manual decode.
type appleClaims struct {
	Email         string          `json:"email"`
	EmailVerified json.RawMessage `json:"email_verified"`
	Sub           string          `json:"sub"`
	Nonce         string          `json:"nonce"`
}

func (c appleClaims) emailIsVerified() bool {
	if len(c.EmailVerified) == 0 {
		return false
	}
	s := strings.TrimSpace(string(c.EmailVerified))
	return s == "true" || s == `"true"`
}

// Native verifies an Apple identity token, upserts the user (capturing the
// optional first-sign-in name), and returns a Chara JWT. Response shape
// matches /api/auth/verify so the mobile client treats both flows the same.
func (h *AppleAuthHandler) Native(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, authMaxBodyBytes)
	var req appleNativeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.IdentityToken) == "" {
		writeError(w, http.StatusUnauthorized, "invalid apple token")
		return
	}
	if strings.TrimSpace(req.Nonce) == "" {
		writeError(w, http.StatusBadRequest, "missing nonce")
		return
	}

	idToken, err := h.verifier.Verify(r.Context(), req.IdentityToken)
	if err != nil {
		slog.Warn("apple auth: verify failed", "error", err)
		writeError(w, http.StatusUnauthorized, "invalid apple token")
		return
	}

	var claims appleClaims
	if err := idToken.Claims(&claims); err != nil {
		slog.Warn("apple auth: claims decode failed", "error", err)
		writeError(w, http.StatusUnauthorized, "invalid apple token")
		return
	}

	// Apple's id_token.nonce claim is SHA-256(client_nonce). Compare in
	// constant-ish time on the hex strings — both are derived, not secrets.
	expected := sha256.Sum256([]byte(req.Nonce))
	if hex.EncodeToString(expected[:]) != claims.Nonce {
		slog.Warn("apple auth: nonce mismatch")
		writeError(w, http.StatusUnauthorized, "invalid apple token")
		return
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		writeError(w, http.StatusUnauthorized, "invalid apple token")
		return
	}
	if !claims.emailIsVerified() {
		writeError(w, http.StatusUnauthorized, "invalid apple token")
		return
	}
	if claims.Sub == "" {
		// Apple should always send sub; warn but don't reject — email is
		// still our join key today.
		slog.Warn("apple auth: missing sub claim", "email_hash", redactEmail(email))
	}

	// Lookup-then-upsert: only first-sign-in users get the optional name.
	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("apple auth: user lookup failed", "error", err)
			writeError(w, http.StatusInternalServerError, "user lookup failed")
			return
		}
		displayName := ""
		if n := strings.TrimSpace(req.Name); n != "" {
			if len(n) > maxDisplayNameLen {
				n = n[:maxDisplayNameLen]
			}
			displayName = n
		}
		user, err = h.queries.UpsertUser(r.Context(), db.UpsertUserParams{
			ID:          ulid.New(),
			Email:       email,
			DisplayName: displayName,
			AvatarUrl:   pgtype.Text{Valid: false},
			Locale:      "en",
		})
		if err != nil {
			slog.Error("apple auth: upsert user failed", "error", err)
			writeError(w, http.StatusInternalServerError, "user create failed")
			return
		}
	}

	jwtStr, err := h.jwt.Sign(user.ID, user.Email, h.cfg.InstanceMode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to sign token")
		return
	}
	writeJSON(w, http.StatusOK, tokenResponse{Token: jwtStr, User: userToResponse(user)})
}
