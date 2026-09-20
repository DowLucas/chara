package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/ulid"
)

// FeedbackHandler accepts bug reports and feature ideas from the in-app
// "Send feedback" screen. Write-only: there is no read path in the app, the
// rows are read with SQL when we want them.
//
// Hosted-only, mounted behind HostedOnly — a self-hosted instance has no one
// to route a Chara bug report to.
type FeedbackHandler struct {
	queries *db.Queries
}

func NewFeedbackHandler(queries *db.Queries) *FeedbackHandler {
	return &FeedbackHandler{queries: queries}
}

type feedbackRequest struct {
	Kind string `json:"kind"`
	Body string `json:"body"`
	// Client metadata. All optional: a partial or older client may omit
	// them, and a report without them is still worth storing.
	AppVersion string `json:"app_version"`
	Platform   string `json:"platform"`
	Locale     string `json:"locale"`
}

type feedbackResponse struct {
	OK bool `json:"ok"`
}

// allowedFeedbackKinds mirrors the two segments of the app's type picker.
var allowedFeedbackKinds = map[string]struct{}{
	"bug":  {},
	"idea": {},
}

// maxFeedbackMetaLen bounds each metadata column. These are machine-supplied
// short strings ("1.4.3 (52)", "ios 18.2", "sv"); anything longer is a client
// bug or an attempt to use the column as storage.
const maxFeedbackMetaLen = 100

// Submit handles POST /api/feedback.
func (h *FeedbackHandler) Submit(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || claims.UserID == "" {
		writeError(w, http.StatusUnauthorized, "missing user context")
		return
	}

	var req feedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	kind := strings.TrimSpace(req.Kind)
	if _, ok := allowedFeedbackKinds[kind]; !ok {
		writeError(w, http.StatusBadRequest, "unknown kind")
		return
	}

	body := strings.TrimSpace(req.Body)
	if body == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}
	if err := validateText(body, maxFeedbackBodyLen, "body"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	for field, value := range map[string]string{
		"app_version": req.AppVersion,
		"platform":    req.Platform,
		"locale":      req.Locale,
	} {
		if err := validateText(strings.TrimSpace(value), maxFeedbackMetaLen, field); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	_, err := h.queries.CreateFeedbackReport(r.Context(), db.CreateFeedbackReportParams{
		ID:         ulid.New(),
		UserID:     claims.UserID,
		Kind:       kind,
		Body:       body,
		AppVersion: optionalText(req.AppVersion),
		Platform:   optionalText(req.Platform),
		Locale:     optionalText(req.Locale),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record feedback")
		return
	}

	writeJSON(w, http.StatusCreated, feedbackResponse{OK: true})
}
