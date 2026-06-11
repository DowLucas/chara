package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DowLucas/chara/internal/config"
)

// The AASA handler does not depend on a database, so these tests run as
// plain unit tests (no //go:build integration tag). They construct the
// handler directly and exercise it via httptest.

func newAASARequest(t *testing.T, method string) *httptest.ResponseRecorder {
	t.Helper()
	cfg := &config.Config{
		AppleTeamID:   "AV39AJYC85",
		AppleBundleID: "app.chara",
	}
	h := NewAppleAppSiteAssociationHandler(cfg)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/.well-known/apple-app-site-association", nil)
	h.ServeHTTP(rr, req)
	return rr
}

func TestAASA_ReturnsValidJSON(t *testing.T) {
	rr := newAASARequest(t, http.MethodGet)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rr.Code)
	}

	var body struct {
		Applinks struct {
			Details []struct {
				AppIDs     []string                 `json:"appIDs"`
				Components []map[string]interface{} `json:"components"`
			} `json:"details"`
		} `json:"applinks"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(body.Applinks.Details) != 1 {
		t.Fatalf("details: want 1 entry, got %d", len(body.Applinks.Details))
	}
	d := body.Applinks.Details[0]
	if len(d.AppIDs) != 1 || d.AppIDs[0] != "AV39AJYC85.app.chara" {
		t.Errorf("appIDs: want [AV39AJYC85.app.chara], got %v", d.AppIDs)
	}
	if len(d.Components) != 3 {
		t.Errorf("components: want 3 entries, got %d", len(d.Components))
	}
}

func TestAASA_ContentTypeStrict(t *testing.T) {
	rr := newAASARequest(t, http.MethodGet)

	ct := rr.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type: want exactly %q (no charset suffix), got %q", "application/json", ct)
	}
}

func TestAASA_NoRedirect(t *testing.T) {
	rr := newAASARequest(t, http.MethodGet)

	if rr.Code >= 300 && rr.Code < 400 {
		t.Errorf("status: got redirect %d, AASA must not redirect", rr.Code)
	}
	if loc := rr.Header().Get("Location"); loc != "" {
		t.Errorf("Location header set to %q; AASA must not redirect", loc)
	}
}

func TestAASA_PathExcludesPresent(t *testing.T) {
	rr := newAASARequest(t, http.MethodGet)

	var body struct {
		Applinks struct {
			Details []struct {
				Components []map[string]interface{} `json:"components"`
			} `json:"details"`
		} `json:"applinks"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	foundAPI := false
	foundWellKnown := false
	for _, c := range body.Applinks.Details[0].Components {
		path, _ := c["/"].(string)
		excl, _ := c["exclude"].(bool)
		switch path {
		case "/api/*":
			if !excl {
				t.Errorf("/api/* must have exclude:true, got %v", c)
			}
			foundAPI = true
		case "/.well-known/*":
			if !excl {
				t.Errorf("/.well-known/* must have exclude:true, got %v", c)
			}
			foundWellKnown = true
		}
	}
	if !foundAPI {
		t.Error("components missing /api/* exclude entry")
	}
	if !foundWellKnown {
		t.Error("components missing /.well-known/* exclude entry")
	}
}

func TestAASA_UsesConfiguredTeamID(t *testing.T) {
	cfg := &config.Config{
		AppleTeamID:   "TESTTEAMID",
		AppleBundleID: "com.example.test",
	}
	h := NewAppleAppSiteAssociationHandler(cfg)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/.well-known/apple-app-site-association", nil)
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rr.Code)
	}
	var body struct {
		Applinks struct {
			Details []struct {
				AppIDs []string `json:"appIDs"`
			} `json:"details"`
		} `json:"applinks"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	got := body.Applinks.Details[0].AppIDs[0]
	want := "TESTTEAMID.com.example.test"
	if got != want {
		t.Errorf("appID: want %q, got %q", want, got)
	}
}

func TestAASA_HEAD_IsAllowed(t *testing.T) {
	rr := newAASARequest(t, http.MethodHead)

	if rr.Code != http.StatusOK {
		t.Fatalf("HEAD status: want 200, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("HEAD Content-Type: want %q, got %q", "application/json", ct)
	}
	if rr.Body.Len() != 0 {
		t.Errorf("HEAD body: want empty, got %d bytes", rr.Body.Len())
	}
}

func TestAASA_FallsBackToDefaultsWhenConfigEmpty(t *testing.T) {
	// Self-hosters who haven't configured Apple Sign In should still get
	// the canonical Chara appID baked in — the hosted iOS build is what
	// will hit any real api.chara.app instance.
	cfg := &config.Config{} // both empty
	h := NewAppleAppSiteAssociationHandler(cfg)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/.well-known/apple-app-site-association", nil)
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rr.Code)
	}
	var body struct {
		Applinks struct {
			Details []struct {
				AppIDs []string `json:"appIDs"`
			} `json:"details"`
		} `json:"applinks"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got := body.Applinks.Details[0].AppIDs[0]; got != "AV39AJYC85.app.chara" {
		t.Errorf("default appID: want %q, got %q", "AV39AJYC85.app.chara", got)
	}
}
