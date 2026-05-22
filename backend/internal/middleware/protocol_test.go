package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

func TestProtocolVersion_PassesWhenInRange(t *testing.T) {
	mw := ProtocolVersion(0, 1)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("X-Chara-App-Protocol", "1")
	mw(okHandler()).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestProtocolVersion_MissingHeaderTreatedAsZero(t *testing.T) {
	mw := ProtocolVersion(0, 1)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	mw(okHandler()).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("missing header should be treated as 0 → in range [0,1]; got %d", rr.Code)
	}
}

func TestProtocolVersion_NonNumericHeaderTreatedAsZero(t *testing.T) {
	mw := ProtocolVersion(0, 1)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("X-Chara-App-Protocol", "garbage")
	mw(okHandler()).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("non-numeric should be treated as 0; got %d", rr.Code)
	}
}

func TestProtocolVersion_AppTooOld(t *testing.T) {
	mw := ProtocolVersion(2, 5)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("X-Chara-App-Protocol", "1")
	mw(okHandler()).ServeHTTP(rr, req)

	if rr.Code != http.StatusUpgradeRequired {
		t.Fatalf("want 426, got %d", rr.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["error"] != "app_too_old" {
		t.Errorf("error: want app_too_old, got %v", body["error"])
	}
	if body["min_app_protocol"] != float64(2) {
		t.Errorf("min_app_protocol: want 2, got %v", body["min_app_protocol"])
	}
}

func TestProtocolVersion_AppTooNew(t *testing.T) {
	mw := ProtocolVersion(0, 1)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("X-Chara-App-Protocol", "5")
	mw(okHandler()).ServeHTTP(rr, req)

	if rr.Code != http.StatusUpgradeRequired {
		t.Fatalf("want 426, got %d", rr.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["error"] != "app_too_new" {
		t.Errorf("error: want app_too_new, got %v", body["error"])
	}
	if body["max_app_protocol"] != float64(1) {
		t.Errorf("max_app_protocol: want 1, got %v", body["max_app_protocol"])
	}
}

func TestProtocolVersion_MissingHeaderRejectedWhenMinAbove0(t *testing.T) {
	// Once a server raises MIN_APP_PROTOCOL above 0, the legacy "no header"
	// case must be rejected as app_too_old.
	mw := ProtocolVersion(1, 1)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	mw(okHandler()).ServeHTTP(rr, req)

	if rr.Code != http.StatusUpgradeRequired {
		t.Fatalf("want 426, got %d", rr.Code)
	}
}
