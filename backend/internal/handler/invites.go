package handler

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
)

//go:embed templates/invite.html
var inviteTemplateFS embed.FS

// inviteTemplate is parsed once at package init. html/template auto-escapes
// every {{.Field}} expansion, so user-controlled fields (GroupName,
// InviterName, ServerHost) cannot break out of the surrounding HTML.
var inviteTemplate = template.Must(
	template.ParseFS(inviteTemplateFS, "templates/invite.html"),
)

// InviteHandler serves the two public invite-deep-link endpoints:
//
//   GET /i/{token}                       — HTML landing page (state-aware)
//   GET /api/invites/{token}/preview     — JSON preview (state-aware)
//
// Both are unauthenticated. The token is the bearer credential for joining,
// so anything the join would expose is fair game here (group name, member
// count, inviter display name). All responses set X-Robots-Tag: noindex.
//
// See docs/superpowers/specs/2026-05-24-invite-deep-links-design.md
// "Three landing-page states" and "Preview endpoint response shape".
type InviteHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
	cfg     *config.Config
}

func NewInviteHandler(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config) *InviteHandler {
	return &InviteHandler{queries: queries, pool: pool, cfg: cfg}
}

// invitePreviewState is the in-band discriminator returned by the preview
// endpoint. The landing page also branches on it. "ok" and "locked" carry
// the full preview blob; "archived" and "invalid" are minimal so the landing
// page can render generic copy without leaking which case it is.
type invitePreviewState string

const (
	stateOK       invitePreviewState = "ok"
	stateLocked   invitePreviewState = "locked"
	stateArchived invitePreviewState = "archived"
	stateInvalid  invitePreviewState = "invalid"
)

// previewResolved is the internal struct populated by resolveInvite and
// consumed by both Preview (serialised to JSON) and Landing (rendered into
// the HTML template). Fields that don't apply to a state stay zero — the
// state-aware JSON marshaller and the template's state branch ignore them.
type previewResolved struct {
	State        invitePreviewState
	GroupName    string
	MemberCount  int64
	InviterName  string // empty when invite_token_created_by_user_id is NULL or user lookup failed
	ServerName   string
	ServerHost   string
	Token        string // only set for ok/locked, used by landing-page chara:// link
}

// resolveInvite looks up the group by invite token and returns the resolved
// preview state. Distinguishes invalid (no row) from archived (row exists
// but is_archived=true) by querying with GetGroupByInviteTokenAny rather than
// GetGroupByInviteToken (which filters archived out).
func (h *InviteHandler) resolveInvite(ctx context.Context, token string) (previewResolved, error) {
	out := previewResolved{
		ServerHost: extractHost(h.cfg.BaseURL),
		Token:      token,
	}
	out.ServerName = out.ServerHost // no separate display-name config in v1; the host is the name.

	if token == "" {
		out.State = stateInvalid
		return out, nil
	}

	group, err := h.queries.GetGroupByInviteTokenAny(ctx, token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			out.State = stateInvalid
			return out, nil
		}
		return out, fmt.Errorf("get group by invite token: %w", err)
	}

	if group.IsArchived {
		out.State = stateArchived
		return out, nil
	}

	out.GroupName = group.Name

	count, err := h.queries.CountGroupMembers(ctx, group.ID)
	if err != nil {
		return out, fmt.Errorf("count group members: %w", err)
	}
	out.MemberCount = count

	if group.InviteTokenCreatedByUserID.Valid {
		// Best effort — if the creator has been deleted (ON DELETE SET NULL
		// races with our read, or the column has stale data) we just omit
		// the inviter name. Empty InviterName → template falls back to the
		// generic "You're invited to …" copy.
		if u, uerr := h.queries.GetUserByID(ctx, group.InviteTokenCreatedByUserID.String); uerr == nil {
			out.InviterName = u.DisplayName
		}
	}

	if group.IsLocked {
		out.State = stateLocked
	} else {
		out.State = stateOK
	}
	return out, nil
}

// writeInvitePrivacyHeaders applies the common privacy posture for the
// invite endpoints: never index, never cache.
func writeInvitePrivacyHeaders(w http.ResponseWriter) {
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.Header().Set("Cache-Control", "no-store")
}

// Preview is GET /api/invites/{token}/preview. Always returns HTTP 200 with
// a `state` discriminator; using HTTP error codes for not-ok states would
// force the landing page to swallow the error or do a separate request to
// learn the distinction. Rate-limited by InviteRateLimit middleware.
func (h *InviteHandler) Preview(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	resolved, err := h.resolveInvite(r.Context(), token)
	if err != nil {
		writeInvitePrivacyHeaders(w)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeInvitePrivacyHeaders(w)

	switch resolved.State {
	case stateOK, stateLocked:
		body := map[string]any{
			"state":       string(resolved.State),
			"groupName":   resolved.GroupName,
			"memberCount": resolved.MemberCount,
			"serverName":  resolved.ServerName,
			"serverHost": resolved.ServerHost,
		}
		if resolved.InviterName != "" {
			body["inviterName"] = resolved.InviterName
		} else {
			body["inviterName"] = nil
		}
		writeJSON(w, http.StatusOK, body)
	default:
		writeJSON(w, http.StatusOK, map[string]string{"state": string(resolved.State)})
	}
}

// Landing is GET /i/{token}. Renders the same resolved state into an HTML
// page. No rate limit (HTML is less attractive to scrapers than the JSON
// surface), but the same noindex headers apply so search engines don't pick
// up token-shaped URLs.
func (h *InviteHandler) Landing(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	resolved, err := h.resolveInvite(r.Context(), token)
	if err != nil {
		writeInvitePrivacyHeaders(w)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	view := struct {
		State           string
		GroupName       string
		MemberCount     int64
		InviterName     string
		ServerHost      string
		CharaSchemeHref template.URL // template.URL bypasses html/template's URL re-escaping; we've already done it.
	}{
		State:       string(resolved.State),
		GroupName:   resolved.GroupName,
		MemberCount: resolved.MemberCount,
		InviterName: resolved.InviterName,
		ServerHost:  resolved.ServerHost,
	}
	if resolved.State == stateOK {
		// The app's invite-url parser expects chara://join?invite=<urlencoded
		// https URL>. We build and escape the full href here; template.URL
		// tells html/template to trust the URL as-is so the %XX encoding is
		// not re-escaped into %25XX.
		httpsForm := h.cfg.BaseURL + "/i/" + resolved.Token
		view.CharaSchemeHref = template.URL("chara://join?invite=" + url.QueryEscape(httpsForm))
	}

	var buf bytes.Buffer
	if err := inviteTemplate.Execute(&buf, view); err != nil {
		writeInvitePrivacyHeaders(w)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeInvitePrivacyHeaders(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}

// extractHost pulls the host from cfg.BaseURL ("https://charaapp.lurkhuset.com"
// → "charaapp.lurkhuset.com"). Falls back to the raw string on parse failure
// rather than producing an empty footer.
func extractHost(baseURL string) string {
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" {
		return baseURL
	}
	return u.Host
}
