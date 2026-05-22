package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/ulid"
)

type PushTokenHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewPushTokenHandler(pool *pgxpool.Pool, queries *db.Queries) *PushTokenHandler {
	return &PushTokenHandler{pool: pool, queries: queries}
}

type registerPushTokenRequest struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

type deletePushTokenRequest struct {
	Token string `json:"token"`
}

// validPushPlatforms mirrors the contract in spec §15: the device tells the
// server which Expo channel it lives on so push delivery can pick the right
// transport.
var validPushPlatforms = map[string]struct{}{
	"ios":     {},
	"android": {},
	"web":     {},
}

// Register stores (or refreshes) an Expo push token for the authenticated user.
// Idempotent — the underlying query upserts on (token), so repeated calls just
// bump last_used_at.
func (h *PushTokenHandler) Register(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}

	var req registerPushTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}
	if _, ok := validPushPlatforms[req.Platform]; !ok {
		writeError(w, http.StatusBadRequest, "platform must be one of ios, android, web")
		return
	}

	_, err := h.queries.UpsertPushToken(r.Context(), db.UpsertPushTokenParams{
		ID:       ulid.New(),
		UserID:   claims.UserID,
		Token:    req.Token,
		Platform: req.Platform,
	})
	if err != nil {
		slog.Error("push token: upsert failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "failed to register push token")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Delete removes a push token by (user_id, token). Idempotent — missing rows
// return 204, not 404, so the client can fire-and-forget on sign-out.
// A user attempting to delete another user's token is also a no-op (the
// (user_id, token) filter scopes the DELETE).
func (h *PushTokenHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}

	var req deletePushTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	if err := h.queries.DeletePushToken(r.Context(), db.DeletePushTokenParams{
		Token:  req.Token,
		UserID: claims.UserID,
	}); err != nil {
		slog.Error("push token: delete failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "failed to delete push token")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
