package handler

import (
	"net/http"
	"strings"

	"github.com/DowLucas/chara/internal/config"
)

// Apple App Site Association (AASA) handler. Serves
// /.well-known/apple-app-site-association so iOS can verify Chara's
// Universal Link claim over api.chara.app.
//
// See docs/superpowers/specs/2026-05-24-invite-deep-links-design.md
// "Phase 2 — Native infrastructure" and decision #10. The components map
// claims only /i/* (invite landing) and explicitly excludes /api/* and
// /.well-known/* so API traffic continues to hit Safari/curl rather than
// being captured by the app.
//
// Apple's CDN validator (https://app-site-association.cdn-apple.com/) is
// strict about the response shape:
//   - Content-Type MUST be exactly application/json (no charset suffix).
//   - No redirects.
//   - HEAD requests should succeed too — Apple sometimes probes with HEAD
//     before GET.
//
// The body is small and lives next to the handler as a tiny []byte literal
// rather than an embed.FS so a reviewer can see the exact JSON Apple will
// receive. The Team ID and bundle ID come from config (reusing the same
// values already wired for Apple Sign In) and fall back to the hosted
// defaults so self-hosters who haven't configured Apple Sign In still
// serve a valid AASA — the hosted Chara iOS build is the only client that
// will ever hit a real /.well-known/apple-app-site-association.

const (
	// Defaults used when cfg.AppleTeamID / cfg.AppleBundleID are unset.
	// These match the hosted Chara iOS build (see CLAUDE.md / memory).
	defaultAASATeamID   = "AV39AJYC85"
	defaultAASABundleID = "app.chara"
)

// aasaTemplate is the AASA JSON body with %s placeholders for the appID.
// Kept as a const so the response shape is obvious at review time.
const aasaTemplate = `{"applinks":{"details":[{"appIDs":["%s"],"components":[{"/":"/i/*"},{"/":"/api/*","exclude":true},{"/":"/.well-known/*","exclude":true}]}]}}`

// NewAppleAppSiteAssociationHandler returns the http.HandlerFunc for
// /.well-known/apple-app-site-association.
func NewAppleAppSiteAssociationHandler(cfg *config.Config) http.HandlerFunc {
	teamID := cfg.AppleTeamID
	if teamID == "" {
		teamID = defaultAASATeamID
	}
	bundleID := cfg.AppleBundleID
	if bundleID == "" {
		bundleID = defaultAASABundleID
	}
	appID := teamID + "." + bundleID

	// Build the body once at construction time. strings.Replace keeps the
	// fmt import out of this file — the template has exactly one placeholder.
	body := []byte(strings.Replace(aasaTemplate, "%s", appID, 1))

	return func(w http.ResponseWriter, r *http.Request) {
		// Strict Content-Type (no "; charset=utf-8") — Apple's validator
		// is picky here.
		w.Header().Set("Content-Type", "application/json")
		// Disable the global chi Compress(5) middleware for this response.
		// chi's compressor skips when Content-Encoding is already set
		// (see go-chi/chi/v5 middleware/compress.go: the check at
		// `cw.Header().Get("Content-Encoding") != ""` bails out). Apple's
		// AASA validator generally handles gzip, but serving identity
		// removes one class of "why won't my Universal Link work" debugging.
		w.Header().Set("Content-Encoding", "identity")
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}
