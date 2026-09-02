package wellknown

import (
	"encoding/json"
	"net/http"

	"github.com/DowLucas/chara/internal/config"
)

// ProtocolVersion is the single wire-protocol the current server build speaks.
// Bump only when adding a required new endpoint or making a breaking shape
// change. Additive/optional changes do not bump — they're advertised via
// instance.features. See
// docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md §9.
const ProtocolVersion = 1

type InstanceInfo struct {
	Mode            string   `json:"mode"`
	Version         string   `json:"version"`
	ProtocolVersion int      `json:"protocol_version"`
	MinAppProtocol  int      `json:"min_app_protocol"`
	MaxAppProtocol  int      `json:"max_app_protocol"`
	AuthMethods     []string `json:"auth_methods"`
	Features        Features `json:"features"`
}

type Features struct {
	GoogleAuth bool `json:"google_auth"`
	AppleAuth  bool `json:"apple_auth"`
	OCR        bool `json:"ocr"`
	Push       bool `json:"push"`
	// SettleReminders advertises the POST /settle-reminders endpoint. Like
	// Push it requires the job queue to be running to actually deliver the
	// nudge, so it tracks RecurringEnabled. Absent on older builds → the app
	// hides the reminder button (version-skew safe).
	SettleReminders bool `json:"settle_reminders"`
	// VoiceExpense advertises POST /api/voice/expenses. Tracks the Gemini
	// key exactly as OCR does: without one the endpoint cannot work, and
	// the app hides the mic rather than offering a button that always
	// fails. Absent on older builds → the app hides it (version-skew safe).
	VoiceExpense bool `json:"voice_expense"`
	// MonthlySummary advertises GET /api/me/summary and the monthly summary
	// push. Hosted-only AND queue-dependent: without the job queue nothing
	// ever notifies, so the app would surface a page nobody is told about.
	// Absent on older builds → the app hides the row (version-skew safe).
	MonthlySummary bool `json:"monthly_summary"`
}

func Handler(cfg *config.Config, version string) http.HandlerFunc {
	info := buildInfo(cfg, version)
	b, _ := json.Marshal(info)

	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}

func buildInfo(cfg *config.Config, version string) InstanceInfo {
	methods := []string{"magic_link"}
	if cfg.IsHosted() {
		if cfg.HasGoogle() {
			methods = append(methods, "google")
		}
		if cfg.HasApple() {
			methods = append(methods, "apple")
		}
	} else if cfg.HasOIDC() {
		methods = append(methods, "oidc")
	}

	return InstanceInfo{
		Mode:            cfg.InstanceMode,
		Version:         version,
		ProtocolVersion: ProtocolVersion,
		MinAppProtocol:  cfg.MinAppProtocol,
		MaxAppProtocol:  cfg.MaxAppProtocol,
		AuthMethods:     methods,
		Features: Features{
			GoogleAuth: cfg.IsHosted() && cfg.HasGoogle(),
			AppleAuth:  cfg.IsHosted() && cfg.HasApple(),
			OCR:        cfg.HasGemini(),
			// Deliberately NOT cfg.HasExpo() — Expo's push API works without
			// an access token, so that would wrongly report false on a
			// working low-volume self-hosted server. The job queue must be
			// running to enqueue notifications at all. See config.HasExpo's
			// doc comment.
			Push:            cfg.RecurringEnabled,
			SettleReminders: cfg.RecurringEnabled,
			VoiceExpense:    cfg.HasGemini(),
			MonthlySummary:  cfg.IsHosted() && cfg.RecurringEnabled,
		},
	}
}
