package handler

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"strings"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/jackc/pgx/v5/pgtype"
)

// WaitlistHandler accepts an email from authenticated users who hit a
// soft gate (e.g. OCR cap). The submission is idempotent on
// (user_id, email, trigger): re-tapping the same gate just bumps
// last_seen_at. This endpoint is the primary willingness-to-pay signal
// during the v1.0/v1.1 free beta.
type WaitlistHandler struct {
	queries *db.Queries
}

func NewWaitlistHandler(queries *db.Queries) *WaitlistHandler {
	return &WaitlistHandler{queries: queries}
}

type waitlistRequest struct {
	Email   string `json:"email"`
	Trigger string `json:"trigger"`
	// Source distinguishes mobile / web for funnel analysis. Optional.
	Source string `json:"source"`
	// Locale is the device locale at submission time. Optional but useful
	// for future localised launch announcements.
	Locale string `json:"locale"`
}

type waitlistResponse struct {
	OK bool `json:"ok"`
}

// allowedWaitlistTriggers limits the trigger string to known surfaces so
// the table doesn't fill up with junk keys typoed by future client code.
// Add new entries here when introducing a new soft gate.
var allowedWaitlistTriggers = map[string]struct{}{
	"ocr_cap":           {},
	"recurring_request": {},
	"export_request":    {},
}

// Submit handles POST /api/waitlist.
func (h *WaitlistHandler) Submit(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || claims.UserID == "" {
		writeError(w, http.StatusUnauthorized, "missing user context")
		return
	}

	var req waitlistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	email := strings.TrimSpace(req.Email)
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "email is not a valid address")
		return
	}

	trigger := strings.TrimSpace(req.Trigger)
	if _, ok := allowedWaitlistTriggers[trigger]; !ok {
		writeError(w, http.StatusBadRequest, "unknown trigger")
		return
	}

	_, err := h.queries.UpsertWaitlistSignup(r.Context(), db.UpsertWaitlistSignupParams{
		ID:      ulid.New(),
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
		Email:   email,
		Trigger: trigger,
		Source:  optionalText(req.Source),
		Locale:  optionalText(req.Locale),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record signup")
		return
	}

	writeJSON(w, http.StatusOK, waitlistResponse{OK: true})
}

func optionalText(s string) pgtype.Text {
	s = strings.TrimSpace(s)
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}
