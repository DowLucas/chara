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
	"github.com/DowLucas/chara/internal/email"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/ulid"
)

// authMaxBodyBytes caps every auth-handler request body. 64 KiB is far above
// any legitimate payload (magic-link email + an OIDC identity token under 8 KB)
// and well below an amplification attack.
const authMaxBodyBytes = 64 << 10

type AuthHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	cfg     *config.Config
	jwt     *auth.JWTService
	sender  email.Sender
}

// redactEmail produces a structured-log-safe email fingerprint: first
// character + asterisks + "@" + domain. Never log the full address.
func redactEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return "***"
	}
	local := email[:at]
	domain := email[at:]
	stars := len(local) - 1
	if stars < 1 {
		stars = 1
	}
	return string(local[0]) + strings.Repeat("*", stars) + domain
}

func NewAuthHandler(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config, jwt *auth.JWTService, sender email.Sender) *AuthHandler {
	if sender == nil {
		// Belt-and-braces: never let a nil sender panic the handler.
		// Production wiring always passes a real sender, but a missed
		// constructor in a test would otherwise NPE on the first request.
		sender = email.NoopSender{}
	}
	return &AuthHandler{pool: pool, queries: queries, cfg: cfg, jwt: jwt, sender: sender}
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
	r.Body = http.MaxBytesReader(w, r.Body, authMaxBodyBytes)
	var req magicLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	addr := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(addr); err != nil {
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
		Email:     addr,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(h.cfg.MagicLinkTTL), Valid: true},
	})
	if err != nil {
		slog.Error("magic link: failed to create token", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to issue token")
		return
	}

	link := h.cfg.BaseURL + "/api/auth/verify?token=" + raw

	// Send the email regardless of mode. In dev mode we *also* return the
	// link in the response body so a client can verify without a real
	// inbox — but we still try to send so the SMTP path actually gets
	// exercised in local testing. Send failures never block the response:
	// the token is already minted and (in dev) returned inline.
	expiryMinutes := int(h.cfg.MagicLinkTTL / time.Minute)
	if expiryMinutes < 1 {
		expiryMinutes = 1
	}
	textBody, htmlBody := email.MagicLinkBody(link, expiryMinutes)
	if err := h.sender.Send(r.Context(), email.Message{
		To:       addr,
		Subject:  email.MagicLinkSubject,
		TextBody: textBody,
		HTMLBody: htmlBody,
	}); err != nil {
		// Don't surface to the client — the magic link is minted regardless.
		// In dev mode the client also has the link from the response body
		// so the user can still complete sign-in even with a broken SMTP.
		slog.Error("magic link send failed", "email_hash", redactEmail(addr), "error", err)
	}

	// Surface the token inline for (a) dev mode, or (b) allowlisted demo
	// accounts in any mode — the latter lets App Store / Play Store reviewers
	// sign into a pre-seeded demo account without inbox access. Scoped to the
	// exact configured addresses; all other addresses fall through to the
	// email-only response below.
	if h.cfg.DevMode || h.cfg.IsDemoLogin(addr) {
		slog.Info("magic link issued (inline token)", "email_hash", redactEmail(addr), "dev_mode", h.cfg.DevMode)
		writeJSON(w, http.StatusOK, magicLinkResponse{OK: true, Token: raw, Link: link})
		return
	}
	slog.Info("magic link issued", "email_hash", redactEmail(addr))
	writeJSON(w, http.StatusOK, magicLinkResponse{OK: true})
}

// Verify exchanges a magic-link token for a JWT.
func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, authMaxBodyBytes)
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

	// Atomic single-use consume — the UPDATE … RETURNING flips used_at and
	// returns the row in one statement, so two concurrent verifies of the
	// same token can never both win. Zero rows = already used, expired, or
	// never existed; all three look the same to the caller.
	row, err := h.queries.ConsumeMagicLinkToken(r.Context(), hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusBadRequest, "invalid or expired token")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}

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
	user, err := h.queries.GetActiveUserByID(r.Context(), claims.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "user not found or deleted")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}
	writeJSON(w, http.StatusOK, userToResponse(user))
}

// ── Account self-deletion ────────────────────────────────────────────────────
//
// Apple Guideline 5.1.1(v) requires every iOS app that supports account
// creation to also offer in-app account deletion. We soft-delete the user
// (see migration 000046 for the why — many FKs reference users(id) without
// cascade, and cascading would wipe expense history that *other* members
// of shared groups depend on). The user row stays, PII is nulled, the
// email is rewritten to a sentinel, group_members rows become ghosts, and
// the auth middleware refuses any future request whose JWT references a
// deleted user.
//
// Precondition: every per-currency net balance across the user's groups
// must be zero. Mirrors the group-permanent-delete and member-removal
// gates — destructive ops never silently drop money owed to / from other
// people.

type deleteMeBalanceEntry struct {
	Currency    string `json:"currency"`
	AmountMinor int64  `json:"amount_minor"`
}

type deleteMeConflictResponse struct {
	Error    string                 `json:"error"`
	Balances []deleteMeBalanceEntry `json:"balances"`
}

// DeleteMe soft-deletes the authenticated user (Apple 5.1.1(v) compliance).
// Returns 204 on success, 409 with per-currency balances when blocked, 401
// when unauthenticated.
func (h *AuthHandler) DeleteMe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, authMaxBodyBytes)
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
	// The auth middleware should already have rejected a deleted user, but
	// belt-and-braces here: a re-delete must not silently 204 if a race
	// somehow let one through.
	if user.DeletedAt.Valid {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Per-currency net balance across every group. Mirror the precondition
	// used by /api/groups/{id}/members/{id} removal — non-zero in any
	// currency blocks the destructive op so other members aren't stuck
	// with phantom balances against a deleted ghost.
	rows, err := h.queries.ListUserBalancesAcrossGroups(r.Context(),
		pgtype.Text{String: claims.UserID, Valid: true},
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "balance lookup failed")
		return
	}
	// Sum per currency — the user is on a per-group basis in `rows`, but the
	// contract reports one entry per currency.
	netByCurrency := make(map[string]int64, 4)
	for _, b := range rows {
		netByCurrency[b.Currency.String] += b.NetBalance
	}
	var nonZero []deleteMeBalanceEntry
	for currency, amount := range netByCurrency {
		if amount != 0 {
			nonZero = append(nonZero, deleteMeBalanceEntry{
				Currency:    currency,
				AmountMinor: amount,
			})
		}
	}
	if len(nonZero) > 0 {
		writeJSON(w, http.StatusConflict, deleteMeConflictResponse{
			Error:    "balance_not_zero",
			Balances: nonZero,
		})
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(r.Context())
	q := db.New(tx)

	// Push tokens go first so Expo stops getting hits for this user even if
	// a later step fails (the tx rollback would undo this, but the only
	// realistic failure is a constraint violation we don't have here).
	if err := q.DeletePushTokensByUser(r.Context(), claims.UserID); err != nil {
		slog.Error("delete me: push token wipe failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	// Outstanding magic-link tokens for the original email become irrelevant
	// the moment the email is rewritten to the sentinel, but explicit is
	// cheaper than leaving dead rows in the table.
	if err := q.DeleteMagicLinkTokensByEmail(r.Context(), user.Email); err != nil {
		slog.Error("delete me: magic link wipe failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	// Detach group memberships → ghost rows so paid_by_id / expense_splits
	// still resolve for the group's other members.
	if err := q.GhostifyGroupMembersForUser(r.Context(),
		pgtype.Text{String: claims.UserID, Valid: true},
	); err != nil {
		slog.Error("delete me: ghostify failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	if err := q.SoftDeleteUser(r.Context(), claims.UserID); err != nil {
		slog.Error("delete me: soft delete failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	slog.Info("account self-deleted", "user_id", claims.UserID)
	w.WriteHeader(http.StatusNoContent)
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

