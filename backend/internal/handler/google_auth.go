package handler

import (
	"context"
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

const googleIssuer = "https://accounts.google.com"

// googleAcceptedIssuers are the two iss values Google ships historically.
// We accept both — the verifier itself is configured to skip issuer check
// and we enforce membership in this set manually.
var googleAcceptedIssuers = map[string]struct{}{
	"https://accounts.google.com": {},
	"accounts.google.com":         {},
}

// GoogleAuthHandler verifies Google identity tokens (issued for the web
// OAuth client — that is the audience configured for the iOS SDK via
// webClientId) and exchanges them for Chara JWTs. The verifier is held on
// the handler so the JWKS cache from go-oidc's RemoteKeySet is reused.
type GoogleAuthHandler struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	cfg      *config.Config
	jwt      *auth.JWTService
	verifier *oidc.IDTokenVerifier
}

// NewGoogleAuthHandler builds the production handler. Blocks on initial
// OIDC discovery to Google, so call once at boot. Returns an error if
// discovery fails.
func NewGoogleAuthHandler(ctx context.Context, pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config, jwtSvc *auth.JWTService) (*GoogleAuthHandler, error) {
	if cfg.GoogleClientID == "" {
		return nil, fmt.Errorf("google auth: GoogleClientID is empty")
	}
	provider, err := oidc.NewProvider(ctx, googleIssuer)
	if err != nil {
		return nil, fmt.Errorf("google auth: oidc discovery: %w", err)
	}
	// SkipIssuerCheck because Google ships both "https://accounts.google.com"
	// and "accounts.google.com" historically; we validate the issuer manually
	// against googleAcceptedIssuers in Native().
	verifier := provider.Verifier(&oidc.Config{
		ClientID:             cfg.GoogleClientID,
		SupportedSigningAlgs: []string{"RS256"},
		SkipIssuerCheck:      true,
	})
	return NewGoogleAuthHandlerWithVerifier(pool, queries, cfg, jwtSvc, verifier), nil
}

// NewGoogleAuthHandlerWithVerifier accepts a pre-built verifier — used by
// integration tests to inject a verifier that trusts a locally-generated
// keypair.
func NewGoogleAuthHandlerWithVerifier(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config, jwtSvc *auth.JWTService, verifier *oidc.IDTokenVerifier) *GoogleAuthHandler {
	return &GoogleAuthHandler{
		pool:     pool,
		queries:  queries,
		cfg:      cfg,
		jwt:      jwtSvc,
		verifier: verifier,
	}
}

type googleNativeRequest struct {
	IdentityToken string `json:"identity_token"`
	Name          string `json:"name"`
	// Nonce is the raw nonce the client supplied to Google. Google echoes
	// it back as-is in id_token.nonce. Best-effort: verified when both sides
	// supply one (see Native). The @react-native-google-signin v16 SDK does
	// not surface nonce through its typed JS API, so missing values are
	// logged but not fatal.
	Nonce string `json:"nonce"`
}

// googleClaims is the subset of fields we read off a Google ID token.
// email_verified comes as bool from Google, but we handle the string "true"
// form too to match the Apple-handler defensive parsing.
type googleClaims struct {
	Iss           string          `json:"iss"`
	Email         string          `json:"email"`
	EmailVerified json.RawMessage `json:"email_verified"`
	Sub           string          `json:"sub"`
	GivenName     string          `json:"given_name"`
	FamilyName    string          `json:"family_name"`
	Nonce         string          `json:"nonce"`
}

func (c googleClaims) emailIsVerified() bool {
	if len(c.EmailVerified) == 0 {
		return false
	}
	s := strings.TrimSpace(string(c.EmailVerified))
	return s == "true" || s == `"true"`
}

// Native verifies a Google identity token, upserts the user (capturing the
// optional first-sign-in name — from body, or from given_name/family_name
// claims), and returns a Chara JWT.
func (h *GoogleAuthHandler) Native(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, authMaxBodyBytes)
	var req googleNativeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.IdentityToken) == "" {
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}
	idToken, err := h.verifier.Verify(r.Context(), req.IdentityToken)
	if err != nil {
		slog.Warn("google auth: verify failed", "error", err)
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}

	var claims googleClaims
	if err := idToken.Claims(&claims); err != nil {
		slog.Warn("google auth: claims decode failed", "error", err)
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}

	if _, ok := googleAcceptedIssuers[claims.Iss]; !ok {
		slog.Warn("google auth: unexpected issuer", "iss", claims.Iss)
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}

	// Nonce binding for Google is best-effort: @react-native-google-signin
	// v16 doesn't surface a nonce parameter through its typed JS API, so the
	// client may send an empty nonce or one Google never echoed back. Verify
	// when both sides supply one; otherwise log and continue. Apple stays
	// strict because the iOS SIWA SDK binds nonce correctly.
	if req.Nonce != "" && claims.Nonce != "" && claims.Nonce != req.Nonce {
		slog.Warn("google auth: nonce mismatch")
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}
	if req.Nonce == "" || claims.Nonce == "" {
		slog.Warn("google auth: nonce not bound", "req_nonce_present", req.Nonce != "", "claim_nonce_present", claims.Nonce != "")
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}
	if !claims.emailIsVerified() {
		writeError(w, http.StatusUnauthorized, "invalid google token")
		return
	}
	if claims.Sub == "" {
		// Google always sends sub; warn but don't reject — email is still
		// our join key today.
		slog.Warn("google auth: missing sub claim", "email_hash", redactEmail(email))
	}

	// Lookup-then-upsert: only first-sign-in users get the optional name.
	user, err := h.queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("google auth: user lookup failed", "error", err)
			writeError(w, http.StatusInternalServerError, "user lookup failed")
			return
		}
		displayName := ""
		if n := strings.TrimSpace(req.Name); n != "" {
			if len(n) > maxDisplayNameLen {
				n = n[:maxDisplayNameLen]
			}
			displayName = n
		} else {
			// Fallback to given_name + family_name from the ID token, when
			// the user granted profile scope.
			n := strings.TrimSpace(strings.TrimSpace(claims.GivenName) + " " + strings.TrimSpace(claims.FamilyName))
			if n != "" {
				if len(n) > maxDisplayNameLen {
					n = n[:maxDisplayNameLen]
				}
				displayName = n
			}
		}
		user, err = h.queries.UpsertUser(r.Context(), db.UpsertUserParams{
			ID:          ulid.New(),
			Email:       email,
			DisplayName: displayName,
			AvatarUrl:   pgtype.Text{Valid: false},
			Locale:      "en",
		})
		if err != nil {
			slog.Error("google auth: upsert user failed", "error", err)
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
