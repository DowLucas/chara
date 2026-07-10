package handler

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"github.com/DowLucas/chara/internal/jobs"
)

// AdminHandler hosts operator-only endpoints gated by a static bearer token
// (config.AdminAPIToken), not a user JWT — there is no admin-user concept in
// the app. When the token is unset the endpoints report 404 (disabled).
type AdminHandler struct {
	rc    *river.Client[pgx.Tx]
	token string
}

func NewAdminHandler(rc *river.Client[pgx.Tx], token string) *AdminHandler {
	return &AdminHandler{rc: rc, token: token}
}

type broadcastReq struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

// Broadcast fans a single push (e.g. a short release note) out to every
// registered device via the job queue. Operator-only.
//
//	POST /api/admin/notify
//	Authorization: Bearer <ADMIN_API_TOKEN>
//	{ "title": "Chara 1.2.0", "body": "Recurring bills + settle reminders", "url": "" }
func (h *AdminHandler) Broadcast(w http.ResponseWriter, r *http.Request) {
	// Disabled instances don't reveal the endpoint exists.
	if h.token == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if !h.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req broadcastReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Body = strings.TrimSpace(req.Body)
	req.URL = strings.TrimSpace(req.URL)
	if req.Title == "" || req.Body == "" {
		writeError(w, http.StatusBadRequest, "title and body are required")
		return
	}
	// Push UIs truncate hard; keep it short and rule out abuse.
	if len(req.Title) > 100 || len(req.Body) > 240 {
		writeError(w, http.StatusBadRequest, "title must be ≤100 and body ≤240 characters")
		return
	}

	if h.rc == nil {
		writeError(w, http.StatusServiceUnavailable, "job queue is not running")
		return
	}
	if _, err := h.rc.Insert(r.Context(), jobs.BroadcastPushArgs{
		Title: req.Title,
		Body:  req.Body,
		URL:   req.URL,
	}, nil); err != nil {
		writeError(w, http.StatusInternalServerError, "could not enqueue broadcast")
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"status": "queued"})
}

func (h *AdminHandler) authorized(r *http.Request) bool {
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	got := strings.TrimPrefix(header, prefix)
	// Constant-time compare; ConstantTimeCompare already returns 0 on length
	// mismatch, so this doesn't leak the token length via timing.
	return subtle.ConstantTimeCompare([]byte(got), []byte(h.token)) == 1
}
