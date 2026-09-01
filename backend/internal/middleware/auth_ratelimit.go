package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

// AuthRateLimit applies two independent token-bucket limits to auth-adjacent
// POST endpoints: per-IP and per-email (when the JSON body carries an email).
// Defaults from the security review: 30 req/min per IP, 5 req/min per email.
//
// The middleware reads the body into memory and restores it so the downstream
// handler can decode it normally. If the body isn't JSON or has no "email"
// field, the per-email bucket is skipped and only the IP cap applies.
func AuthRateLimit(perIPPerMinute, perEmailPerMinute int) func(http.Handler) http.Handler {
	ipBuckets := newBucketSet(perIPPerMinute)
	emailBuckets := newBucketSet(perEmailPerMinute)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if ip != "" && !ipBuckets.allow(ip) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			email := readEmailFromBody(r)
			if email != "" && !emailBuckets.allow(email) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// maxProbeBodyBytes caps what this middleware will buffer to find the email.
//
// This runs before the handler installs its own http.MaxBytesReader, so
// without a cap here an unauthenticated caller can stream an arbitrarily large
// body into memory on every auth endpoint — one rate-limit token buys as much
// heap as the read timeout allows. Auth payloads are a few hundred bytes; a
// body larger than this is not one, so we stop reading and let the IP bucket
// and the handler's own limit take it from there.
const maxProbeBodyBytes = 64 << 10

// readEmailFromBody drains r.Body, restores it with bytes.NewReader, and
// returns the lowercased email if the body is a JSON object with a string
// "email" field. Returns "" on any failure — the IP bucket is the safety net.
func readEmailFromBody(r *http.Request) string {
	if r.Body == nil {
		return ""
	}
	limited := io.LimitReader(r.Body, maxProbeBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return ""
	}
	if len(body) > maxProbeBodyBytes {
		// Oversized: hand the handler back what we consumed plus the rest of
		// the stream, so its MaxBytesReader produces the 413, and skip the
		// per-email bucket for this request.
		r.Body = io.NopCloser(io.MultiReader(bytes.NewReader(body), r.Body))
		return ""
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	if len(body) == 0 {
		return ""
	}
	var probe struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(probe.Email))
}
