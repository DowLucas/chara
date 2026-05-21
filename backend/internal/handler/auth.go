package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/quits/internal/auth"
	"github.com/DowLucas/quits/internal/config"
	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/middleware"
	"github.com/DowLucas/quits/internal/ulid"
)

type AuthHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	cfg     *config.Config
	jwt     *auth.JWTService
}

func NewAuthHandler(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config, jwt *auth.JWTService) *AuthHandler {
	return &AuthHandler{pool: pool, queries: queries, cfg: cfg, jwt: jwt}
}

type magicLinkRequest struct {
	Email string `json:"email"`
}

type magicLinkResponse struct {
	OK    bool   `json:"ok"`
	Token string `json:"token,omitempty"` // only set in dev mode
	Link  string `json:"link,omitempty"`  // only set in dev mode
}

type verifyRequest struct {
	Token string `json:"token"`
}

type userResponse struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	Name        string  `json:"name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	SwishNumber *string `json:"swish_number"`
}

// swishNumberRegex mirrors the CHECK constraint in migration 000015.
var swishNumberRegex = regexp.MustCompile(`^\+467[02369]\d{7}$`)

// swishStripRegex matches whitespace and dashes for normalization.
var swishStripRegex = regexp.MustCompile(`[\s\-]`)

// normalizeSwishNumber strips whitespace/dashes and converts a leading 0
// to +46 (SE). Returns the normalized value; it does NOT validate against
// the E.164 regex (caller does that).
func normalizeSwishNumber(input string) string {
	s := swishStripRegex.ReplaceAllString(input, "")
	if strings.HasPrefix(s, "0") {
		s = "+46" + s[1:]
	}
	return s
}

type tokenResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

func userToResponse(u db.User) userResponse {
	r := userResponse{
		ID:    u.ID,
		Email: u.Email,
		Name:  u.DisplayName,
	}
	if u.AvatarUrl.Valid {
		v := u.AvatarUrl.String
		r.AvatarURL = &v
	}
	if u.SwishNumber.Valid {
		v := u.SwishNumber.String
		r.SwishNumber = &v
	}
	return r
}

// MagicLink issues a magic-link token and emails it. In dev mode the token is
// also returned in the response body so the client can verify without email.
func (h *AuthHandler) MagicLink(w http.ResponseWriter, r *http.Request) {
	var req magicLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}

	raw, err := auth.GenerateToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	hash := auth.HashToken(raw)

	_, err = h.queries.CreateMagicLinkToken(r.Context(), db.CreateMagicLinkTokenParams{
		ID:        ulid.New(),
		TokenHash: hash,
		TokenType: "magic_link",
		Email:     email,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(h.cfg.MagicLinkTTL), Valid: true},
	})
	if err != nil {
		slog.Error("magic link: failed to create token", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to issue token")
		return
	}

	link := h.cfg.BaseURL + "/api/auth/verify?token=" + raw
	if h.cfg.DevMode {
		slog.Info("magic link issued (dev mode)", "email", email, "link", link)
		writeJSON(w, http.StatusOK, magicLinkResponse{OK: true, Token: raw, Link: link})
		return
	}
	// TODO: send via SMTP/Resend. For now, log and return generic ok.
	slog.Info("magic link issued", "email", email)
	writeJSON(w, http.StatusOK, magicLinkResponse{OK: true})
}

// Verify exchanges a magic-link token for a JWT.
func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "missing token")
		return
	}
	hash := auth.HashToken(req.Token)

	row, err := h.queries.GetMagicLinkTokenByHash(r.Context(), hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}

	// Upsert user.
	user, err := h.queries.GetUserByEmail(r.Context(), row.Email)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, "user lookup failed")
			return
		}
		user, err = h.queries.UpsertUser(r.Context(), db.UpsertUserParams{
			ID:          ulid.New(),
			Email:       row.Email,
			DisplayName: "",
			Locale:      "en",
		})
		if err != nil {
			slog.Error("verify: upsert user failed", "error", err)
			writeError(w, http.StatusInternalServerError, "user create failed")
			return
		}
	}

	if err := h.queries.MarkMagicLinkTokenUsed(r.Context(), row.ID); err != nil {
		slog.Error("verify: mark used failed", "error", err)
		// non-fatal — continue
	}

	jwtStr, err := h.jwt.Sign(user.ID, user.Email, h.cfg.InstanceMode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to sign token")
		return
	}

	writeJSON(w, http.StatusOK, tokenResponse{Token: jwtStr, User: userToResponse(user)})
}

// Me returns the authenticated user.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}
	user, err := h.queries.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}
	writeJSON(w, http.StatusOK, userToResponse(user))
}

const maxDisplayNameLen = 80

// updateMeRequest uses raw json fields so we can distinguish "key absent"
// from "key present with null value" (needed for swish_number clearing).
type updateMeRequest struct {
	Name        json.RawMessage `json:"name,omitempty"`
	SwishNumber json.RawMessage `json:"swish_number,omitempty"`
}

// UpdateMe updates the authenticated user's profile. The display name is
// propagated to all group_members rows referencing the user. swish_number
// accepts a string (normalized + E.164-SE validated) or null (clears).
func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}

	var req updateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Parse name (if present).
	var (
		hasName bool
		name    string
	)
	if len(req.Name) > 0 {
		hasName = true
		var s string
		if err := json.Unmarshal(req.Name, &s); err != nil {
			writeError(w, http.StatusBadRequest, "name must be a string")
			return
		}
		name = strings.TrimSpace(s)
		if name == "" {
			writeError(w, http.StatusBadRequest, "name must not be empty")
			return
		}
		if len(name) > maxDisplayNameLen {
			writeError(w, http.StatusBadRequest, "name too long")
			return
		}
	}

	// Parse swish_number (if present). May be a JSON string (set) or null (clear).
	var (
		hasSwish        bool
		clearSwish      bool
		normalizedSwish string
	)
	if len(req.SwishNumber) > 0 {
		hasSwish = true
		if string(req.SwishNumber) == "null" {
			clearSwish = true
		} else {
			var s string
			if err := json.Unmarshal(req.SwishNumber, &s); err != nil {
				writeError(w, http.StatusBadRequest, "swish_number must be a string or null")
				return
			}
			normalizedSwish = normalizeSwishNumber(s)
			if !swishNumberRegex.MatchString(normalizedSwish) {
				writeError(w, http.StatusBadRequest, "swish_number must be a valid Swedish mobile number (+46 7X XXX XX XX)")
				return
			}
		}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(r.Context())
	q := db.New(tx)

	// Always fetch current user so we have something to return when no
	// fields were provided.
	user, err := q.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}

	if hasName {
		user, err = q.UpdateUser(r.Context(), db.UpdateUserParams{
			ID:          claims.UserID,
			DisplayName: pgtype.Text{String: name, Valid: true},
		})
		if err != nil {
			slog.Error("update me: update user failed", "error", err)
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		if err := q.UpdateGroupMemberNamesByUserID(r.Context(), db.UpdateGroupMemberNamesByUserIDParams{
			UserID: pgtype.Text{String: claims.UserID, Valid: true},
			Name:   name,
		}); err != nil {
			slog.Error("update me: sync group_members.name failed", "error", err)
			writeError(w, http.StatusInternalServerError, "sync failed")
			return
		}
	}

	if hasSwish {
		params := db.UpdateUserSwishNumberParams{ID: claims.UserID, Clear: clearSwish}
		if !clearSwish {
			params.SwishNumber = pgtype.Text{String: normalizedSwish, Valid: true}
		}
		user, err = q.UpdateUserSwishNumber(r.Context(), params)
		if err != nil {
			slog.Error("update me: update swish_number failed", "error", err)
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, userToResponse(user))
}

