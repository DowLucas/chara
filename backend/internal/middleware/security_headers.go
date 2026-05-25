package middleware

import "net/http"

// SecurityHeaders adds a baseline set of hardening headers to every response.
// Mount once near the top of the router chain.
func SecurityHeaders() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
			h.Set("Cross-Origin-Resource-Policy", "same-site")
			next.ServeHTTP(w, r)
		})
	}
}

// InviteLandingCSP applies a strict Content-Security-Policy for the public
// invite landing route. The page is reachable pre-install so it must run
// without app cookies, no scripts, no third-party assets.
func InviteLandingCSP() func(http.Handler) http.Handler {
	const csp = "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'"
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Security-Policy", csp)
			next.ServeHTTP(w, r)
		})
	}
}
