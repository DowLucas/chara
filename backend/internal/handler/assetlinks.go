package handler

import (
	"net/http"
	"strings"

	"github.com/DowLucas/chara/internal/config"
)

// Digital Asset Links handler. Serves /.well-known/assetlinks.json so Android
// can verify Chara's App Links claim over api.chara.app and route
// matching https URLs (/i/*) directly to the app — the Android counterpart to
// aasa.go.
//
// See docs/superpowers/specs/2026-05-24-invite-deep-links-design.md
// "Phase 2 — Native infrastructure". Unlike AASA, Android App Links have no
// per-path component map in this file: the path filter lives in the app's
// android.intentFilters (app.config.ts). assetlinks.json only proves that the
// site authorizes the (package, signing cert) pair to handle its links.
//
// The package name and SHA-256 signing-cert fingerprint come from config and
// fall back to the hosted Chara Android build's values, so the hosted instance
// serves a valid file with zero env wiring. Self-hosters who ship their own
// Android build set ANDROID_PACKAGE_NAME / ANDROID_CERT_FINGERPRINT.

const (
	// Defaults match the hosted Chara Android build (Google Play app-signing
	// key fingerprint for the chara.app package). Note the Android package is
	// chara.app while the iOS bundle id is app.chara — they intentionally differ.
	defaultAndroidPackageName     = "chara.app"
	defaultAndroidCertFingerprint = "00:4C:D1:5B:03:A8:DA:22:CB:49:35:71:82:9B:A5:AE:04:B7:2D:0E:ED:94:F4:9A:1A:4C:09:9D:BA:13:1E:A5"
)

// assetlinksTemplate is the Digital Asset Links body with __PACKAGE__ /
// __FINGERPRINT__ placeholders. Kept as a const so the response shape is
// obvious at review time.
const assetlinksTemplate = `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"__PACKAGE__","sha256_cert_fingerprints":["__FINGERPRINT__"]}}]`

// NewAssetLinksHandler returns the http.HandlerFunc for
// /.well-known/assetlinks.json.
func NewAssetLinksHandler(cfg *config.Config) http.HandlerFunc {
	pkg := cfg.AndroidPackageName
	if pkg == "" {
		pkg = defaultAndroidPackageName
	}
	fingerprint := cfg.AndroidCertFingerprint
	if fingerprint == "" {
		fingerprint = defaultAndroidCertFingerprint
	}

	body := []byte(strings.NewReplacer(
		"__PACKAGE__", pkg,
		"__FINGERPRINT__", fingerprint,
	).Replace(assetlinksTemplate))

	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Serve identity for the same debuggability reason as aasa.go: skip
		// chi's Compress(5) middleware, which bails when Content-Encoding is set.
		w.Header().Set("Content-Encoding", "identity")
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}
