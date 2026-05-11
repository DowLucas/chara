package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/DowLucas/quits/internal/auth"
)

type contextKey string

const ClaimsKey contextKey = "claims"

func Authenticate(jwt *auth.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				writeUnauthorized(w, "missing or malformed Authorization header")
				return
			}
			claims, err := jwt.Verify(strings.TrimPrefix(header, "Bearer "))
			if err != nil {
				writeUnauthorized(w, "invalid token")
				return
			}
			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ClaimsFromContext retrieves the JWT claims stored by the Authenticate middleware.
func ClaimsFromContext(ctx context.Context) *auth.Claims {
	c, _ := ctx.Value(ClaimsKey).(*auth.Claims)
	return c
}

func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
