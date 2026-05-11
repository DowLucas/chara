package wellknown

import (
	"encoding/json"
	"net/http"

	"github.com/DowLucas/quits/internal/config"
)

type InstanceInfo struct {
	Mode        string   `json:"mode"`
	Version     string   `json:"version"`
	AuthMethods []string `json:"auth_methods"`
	Features    Features `json:"features"`
}

type Features struct {
	GoogleAuth bool `json:"google_auth"`
	AppleAuth  bool `json:"apple_auth"`
	OCR        bool `json:"ocr"`
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
		Mode:        cfg.InstanceMode,
		Version:     version,
		AuthMethods: methods,
		Features: Features{
			GoogleAuth: cfg.IsHosted() && cfg.HasGoogle(),
			AppleAuth:  cfg.IsHosted() && cfg.HasApple(),
			OCR:        false,
		},
	}
}
