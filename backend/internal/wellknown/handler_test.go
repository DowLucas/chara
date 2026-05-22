package wellknown

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DowLucas/chara/internal/config"
)

func TestHandler_AdvertisesProtocolFields(t *testing.T) {
	cfg := &config.Config{
		InstanceMode:   "selfhost",
		MinAppProtocol: 0,
		MaxAppProtocol: 1,
	}
	h := Handler(cfg, "0.1.0")

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/.well-known/chara-instance", nil)
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}

	var got map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if got["protocol_version"] != float64(ProtocolVersion) {
		t.Errorf("protocol_version: want %d, got %v", ProtocolVersion, got["protocol_version"])
	}
	if got["min_app_protocol"] != float64(0) {
		t.Errorf("min_app_protocol: want 0, got %v", got["min_app_protocol"])
	}
	if got["max_app_protocol"] != float64(1) {
		t.Errorf("max_app_protocol: want 1, got %v", got["max_app_protocol"])
	}
}

func TestHandler_ReflectsConfiguredProtocolBounds(t *testing.T) {
	cfg := &config.Config{
		InstanceMode:   "selfhost",
		MinAppProtocol: 1,
		MaxAppProtocol: 3,
	}
	h := Handler(cfg, "0.1.0")

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/.well-known/chara-instance", nil)
	h.ServeHTTP(rr, req)

	var got map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["min_app_protocol"] != float64(1) {
		t.Errorf("min_app_protocol: want 1, got %v", got["min_app_protocol"])
	}
	if got["max_app_protocol"] != float64(3) {
		t.Errorf("max_app_protocol: want 3, got %v", got["max_app_protocol"])
	}
}

func TestProtocolVersion_IsOne(t *testing.T) {
	// Sanity: don't bump ProtocolVersion casually. See spec §9.
	if ProtocolVersion != 1 {
		t.Errorf("ProtocolVersion: want 1, got %d", ProtocolVersion)
	}
}
