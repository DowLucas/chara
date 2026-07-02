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
			Push: cfg.RecurringEnabled,
		},
	}
}
