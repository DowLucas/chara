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

// TestFeatures_PushReflectsRecurringEnabled pins Features.Push to
// RecurringEnabled, NOT HasExpo() — Expo's push API works without an access
// token, so gating on HasExpo() would wrongly report false on a working
// low-volume self-hosted server. This guards against "fixing" it back to
// HasExpo() by reflexively copying the OCR/HasGemini() pattern.
func TestFeatures_PushReflectsRecurringEnabled(t *testing.T) {
	cases := []struct {
		name             string
		recurringEnabled bool
		expoAccessToken  string
		wantPush         bool
	}{
		{"enabled queue, no expo token", true, "", true},
		{"enabled queue, with expo token", true, "expo-token", true},
		{"disabled queue, with expo token", false, "expo-token", false},
		{"disabled queue, no expo token", false, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &config.Config{
				InstanceMode:     "selfhost",
				RecurringEnabled: tc.recurringEnabled,
				ExpoAccessToken:  tc.expoAccessToken,
			}
			h := Handler(cfg, "0.1.0")

			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/.well-known/chara-instance", nil)
			h.ServeHTTP(rr, req)

			var got map[string]any
			if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
				t.Fatalf("decode: %v", err)
			}
			features, _ := got["features"].(map[string]any)
			if features["push"] != tc.wantPush {
				t.Errorf("features.push: want %v, got %v", tc.wantPush, features["push"])
			}
			// settle_reminders tracks the same job-queue signal as push.
			if features["settle_reminders"] != tc.wantPush {
				t.Errorf("features.settle_reminders: want %v, got %v", tc.wantPush, features["settle_reminders"])
			}
		})
	}
}

// voice_expense must track the Gemini key exactly as ocr does: without a
// key the endpoint cannot work, and the app hides the mic rather than
// offering a button that always fails.
func TestFeatures_VoiceExpenseTracksGeminiKey(t *testing.T) {
	cases := []struct {
		name      string
		geminiKey string
		want      bool
	}{
		{"with key", "test-key", true},
		{"without key", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &config.Config{InstanceMode: "selfhost", GeminiAPIKey: tc.geminiKey}
			h := Handler(cfg, "0.1.0")

			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/.well-known/chara-instance", nil)
			h.ServeHTTP(rr, req)

			var got map[string]any
			if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
				t.Fatalf("decode: %v", err)
			}
			features, _ := got["features"].(map[string]any)
			if features["voice_expense"] != tc.want {
				t.Errorf("voice_expense = %v, want %v", features["voice_expense"], tc.want)
			}
			// It should move in lockstep with ocr — both need the key.
			if features["ocr"] != tc.want {
				t.Errorf("ocr = %v, want %v (sanity)", features["ocr"], tc.want)
			}
		})
	}
}

// The monthly summary needs both halves: the endpoint is hosted-only, and
// without the job queue nothing would ever tell users the page exists.
func TestFeatures_MonthlySummaryHostedAndQueueOnly(t *testing.T) {
	cases := []struct {
		name     string
		mode     string
		queue    bool
		expected bool
	}{
		{"hosted with queue", "hosted", true, true},
		{"hosted without queue", "hosted", false, false},
		{"selfhost with queue", "selfhost", true, false},
		{"selfhost without queue", "selfhost", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &config.Config{InstanceMode: tc.mode, RecurringEnabled: tc.queue}
			info := buildInfo(cfg, "test")
			if info.Features.MonthlySummary != tc.expected {
				t.Errorf("MonthlySummary = %v, want %v", info.Features.MonthlySummary, tc.expected)
			}
		})
	}
}
