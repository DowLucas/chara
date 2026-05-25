package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders_AddsExpectedHeaders(t *testing.T) {
	mw := SecurityHeaders()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	mw(okHandler()).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}

	want := map[string]string{
		"Strict-Transport-Security":    "max-age=63072000; includeSubDomains; preload",
		"X-Content-Type-Options":       "nosniff",
		"Referrer-Policy":              "no-referrer",
		"X-Frame-Options":              "DENY",
		"Cross-Origin-Opener-Policy":   "same-origin",
		"Cross-Origin-Resource-Policy": "same-site",
	}
	for k, v := range want {
		got := rr.Header().Get(k)
		if got != v {
			t.Errorf("header %s: want %q, got %q", k, v, got)
		}
	}
}

func TestInviteLandingCSP_AddsRestrictiveCSP(t *testing.T) {
	mw := InviteLandingCSP()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/i/abc", nil)
	mw(okHandler()).ServeHTTP(rr, req)

	wantCSP := "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'"
	if got := rr.Header().Get("Content-Security-Policy"); got != wantCSP {
		t.Errorf("CSP: want %q, got %q", wantCSP, got)
	}
}
