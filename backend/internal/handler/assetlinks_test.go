package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DowLucas/chara/internal/config"
)

// The assetlinks handler does not depend on a database, so these run as plain
// unit tests. Mirrors aasa_test.go.

type assetLinkEntry struct {
	Relation []string `json:"relation"`
	Target   struct {
		Namespace    string   `json:"namespace"`
		PackageName  string   `json:"package_name"`
		Fingerprints []string `json:"sha256_cert_fingerprints"`
	} `json:"target"`
}

func newAssetLinksRequest(t *testing.T, cfg *config.Config, method string) *httptest.ResponseRecorder {
	t.Helper()
	h := NewAssetLinksHandler(cfg)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/.well-known/assetlinks.json", nil)
	h.ServeHTTP(rr, req)
	return rr
}

func TestAssetLinks_ReturnsValidJSON(t *testing.T) {
	rr := newAssetLinksRequest(t, &config.Config{
		AndroidPackageName:     "app.chara",
		AndroidCertFingerprint: "AA:BB",
	}, http.MethodGet)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rr.Code)
	}

	var body []assetLinkEntry
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body) != 1 {
		t.Fatalf("entries: want 1, got %d", len(body))
	}
	e := body[0]
	if len(e.Relation) != 1 || e.Relation[0] != "delegate_permission/common.handle_all_urls" {
		t.Errorf("relation: got %v", e.Relation)
	}
	if e.Target.Namespace != "android_app" {
		t.Errorf("namespace: want android_app, got %q", e.Target.Namespace)
	}
	if e.Target.PackageName != "app.chara" {
		t.Errorf("package_name: want app.chara, got %q", e.Target.PackageName)
	}
	if len(e.Target.Fingerprints) != 1 || e.Target.Fingerprints[0] != "AA:BB" {
		t.Errorf("fingerprints: got %v", e.Target.Fingerprints)
	}
}

func TestAssetLinks_ContentTypeStrict(t *testing.T) {
	rr := newAssetLinksRequest(t, &config.Config{}, http.MethodGet)
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: want %q, got %q", "application/json", ct)
	}
}

func TestAssetLinks_NoRedirect(t *testing.T) {
	rr := newAssetLinksRequest(t, &config.Config{}, http.MethodGet)
	if rr.Code >= 300 && rr.Code < 400 {
		t.Errorf("status: got redirect %d, assetlinks must not redirect", rr.Code)
	}
	if loc := rr.Header().Get("Location"); loc != "" {
		t.Errorf("Location header set to %q; assetlinks must not redirect", loc)
	}
}

func TestAssetLinks_HEAD_IsAllowed(t *testing.T) {
	rr := newAssetLinksRequest(t, &config.Config{}, http.MethodHead)
	if rr.Code != http.StatusOK {
		t.Fatalf("HEAD status: want 200, got %d", rr.Code)
	}
	if rr.Body.Len() != 0 {
		t.Errorf("HEAD body: want empty, got %d bytes", rr.Body.Len())
	}
}

func TestAssetLinks_FallsBackToDefaultsWhenConfigEmpty(t *testing.T) {
	rr := newAssetLinksRequest(t, &config.Config{}, http.MethodGet)
	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rr.Code)
	}
	var body []assetLinkEntry
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got := body[0].Target.PackageName; got != "app.chara" {
		t.Errorf("default package: want app.chara, got %q", got)
	}
	want := "00:4C:D1:5B:03:A8:DA:22:CB:49:35:71:82:9B:A5:AE:04:B7:2D:0E:ED:94:F4:9A:1A:4C:09:9D:BA:13:1E:A5"
	if got := body[0].Target.Fingerprints[0]; got != want {
		t.Errorf("default fingerprint: want %q, got %q", want, got)
	}
}
