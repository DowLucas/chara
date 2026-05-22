package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/ulid"
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
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	Name            string     `json:"name"`
	Phone           string     `json:"phone"`
	AvatarURL       *string    `json:"avatar_url,omitempty"`
	AvatarObjectURL *string    `json:"avatar_object_url,omitempty"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at,omitempty"`
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
	if u.Phone.Valid {
		r.Phone = u.Phone.String
	}
	if u.AvatarUrl.Valid {
		v := u.AvatarUrl.String
		r.AvatarURL = &v
	}
	if u.AvatarObjectKey.Valid && u.AvatarObjectKey.String != "" {
		v := avatarURL(u.ID)
		r.AvatarObjectURL = &v
	}
	if u.AvatarUpdatedAt.Valid {
		t := u.AvatarUpdatedAt.Time
		r.AvatarUpdatedAt = &t
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

// Logout is an advisory hook for the future JWT-revocation spec.
//
// The JWT is HMAC-stateless and stays valid until expiry regardless of this
// call — the server does nothing today. The endpoint exists so the app's
// contract (best-effort POST on Remove account / Sign out) stays stable when
// real revocation lands. See spec §16 item 4.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if middleware.ClaimsFromContext(r.Context()) == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

type updateMeRequest struct {
	Name  *string `json:"name"`
	Phone *string `json:"phone"`
}

const (
	maxDisplayNameLen = 80
	maxPhoneLen       = 32
)

// UpdateMe updates the authenticated user's profile. Currently only the
// display name (full name) is editable. The name is required to be a non-empty
// trimmed string and is propagated to all group_members rows that reference
// the user so member lists, expenses, and settlements display the new name.
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
	if req.Name == nil && req.Phone == nil {
		writeError(w, http.StatusBadRequest, "no fields to update")
		return
	}

	var name string
	nameParam := pgtype.Text{}
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "name must not be empty")
			return
		}
		if len(name) > maxDisplayNameLen {
			writeError(w, http.StatusBadRequest, "name too long")
			return
		}
		nameParam = pgtype.Text{String: name, Valid: true}
	}

	phoneParam := pgtype.Text{}
	if req.Phone != nil {
		phone := strings.TrimSpace(*req.Phone)
		if phone == "" {
			writeError(w, http.StatusBadRequest, "phone must not be empty")
			return
		}
		if len(phone) > maxPhoneLen {
			writeError(w, http.StatusBadRequest, "phone too long")
			return
		}
		phoneParam = pgtype.Text{String: phone, Valid: true}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(r.Context())
	q := db.New(tx)

	user, err := q.UpdateUser(r.Context(), db.UpdateUserParams{
		ID:          claims.UserID,
		DisplayName: nameParam,
		Phone:       phoneParam,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "user not found")
			return
		}
		slog.Error("update me: update user failed", "error", err)
		writeError(w, http.StatusInternalServerError, "update failed")
		return
	}

	if nameParam.Valid {
		if err := q.UpdateGroupMemberNamesByUserID(r.Context(), db.UpdateGroupMemberNamesByUserIDParams{
			UserID: pgtype.Text{String: claims.UserID, Valid: true},
			Name:   name,
		}); err != nil {
			slog.Error("update me: sync group_members.name failed", "error", err)
			writeError(w, http.StatusInternalServerError, "sync failed")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, userToResponse(user))
}

