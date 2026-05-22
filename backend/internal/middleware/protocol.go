package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
)

// ProtocolVersion enforces the X-Chara-App-Protocol bidirectional compatibility
// contract described in
// docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md §9.
//
// Behaviour:
//   - Missing or non-numeric header → value treated as 0 (legacy app, pre-multi-server).
//   - value < minAppProtocol     → 426 {"error":"app_too_old","min_app_protocol":N}
//   - value > maxAppProtocol     → 426 {"error":"app_too_new","max_app_protocol":N}
//   - otherwise                  → pass through.
//
// Must NOT be mounted on /.well-known/* or /api/health/* — those endpoints
// remain reachable so an out-of-range client can read the current min/max and
// recover.
func ProtocolVersion(minAppProtocol, maxAppProtocol int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get("X-Chara-App-Protocol")
			v, err := strconv.Atoi(raw)
			if err != nil {
				v = 0
			}

			switch {
			case v < minAppProtocol:
				log.Printf("event=protocol_mismatch app_protocol=%d min=%d max=%d path=%s",
					v, minAppProtocol, maxAppProtocol, r.URL.Path)
				writeProtocolError(w, "app_too_old", "min_app_protocol", minAppProtocol)
				return
			case v > maxAppProtocol:
				log.Printf("event=protocol_mismatch app_protocol=%d min=%d max=%d path=%s",
					v, minAppProtocol, maxAppProtocol, r.URL.Path)
				writeProtocolError(w, "app_too_new", "max_app_protocol", maxAppProtocol)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeProtocolError(w http.ResponseWriter, errCode, boundKey string, boundVal int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUpgradeRequired)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":  errCode,
		boundKey: boundVal,
	})
}
