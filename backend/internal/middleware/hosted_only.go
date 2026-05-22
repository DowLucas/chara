package middleware

import (
	"net/http"

	"github.com/DowLucas/chara/internal/config"
)

// HostedOnly returns 404 for any request when the instance is in selfhost mode.
func HostedOnly(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !cfg.IsHosted() {
				http.NotFound(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
