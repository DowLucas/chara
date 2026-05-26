package middleware

import (
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

// sensitiveQueryParams is the redaction set. Any query parameter whose name
// matches one of these keys (case-insensitive) gets its value replaced with
// "REDACTED" in the request log. Magic-link verification, OAuth code grants,
// and stray bearer-tokens-as-query are the threats we care about — access
// logs are usually retained longer than other surfaces, often shipped to
// third-party log aggregators, so a token leaked into a log is treated as
// breached and forces every magic link to be invalidated.
var sensitiveQueryParams = map[string]struct{}{
	"token":        {},
	"code":         {},
	"access_token": {},
	"id_token":     {},
	"refresh_token": {},
}

// RedactSensitiveQueryParams returns rawURL with the values of any sensitive
// query parameter replaced by "REDACTED". The input is preserved otherwise
// (path, host, fragment, parameter order is best-effort via url.Values
// re-encode which sorts keys — acceptable for log lines).
//
// If the URL fails to parse, the input is returned unchanged with a "?…"
// trailer stripped so a malformed query string never leaks into the log.
func RedactSensitiveQueryParams(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		// Fall back: strip everything from the first "?" if any.
		for i := 0; i < len(rawURL); i++ {
			if rawURL[i] == '?' {
				return rawURL[:i] + "?REDACTED"
			}
		}
		return rawURL
	}
	if u.RawQuery == "" {
		return rawURL
	}
	q := u.Query()
	redacted := false
	for k, vs := range q {
		if _, hit := sensitiveQueryParams[lower(k)]; !hit {
			continue
		}
		for i := range vs {
			vs[i] = "REDACTED"
		}
		q[k] = vs
		redacted = true
	}
	if !redacted {
		return rawURL
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// lower is a tiny ASCII-only tolower so we avoid the unicode tables for what
// is by definition a small set of ASCII query keys.
func lower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

// RequestLogger is a chi-compatible logging middleware that scrubs sensitive
// query parameters from the URL before logging. It replaces chi's default
// middleware.Logger, which logged the full URL including ?token=… — the
// magic-link verify endpoint receives the raw single-use token in the URL,
// and even though the handler is POST-only (a GET click 404s before reaching
// the handler), the access log already captured it.
//
// No headers are logged so bearer tokens in Authorization can't leak via
// this path.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := wrapResponseWriter(w)
		next.ServeHTTP(ww, r)

		uri := r.RequestURI
		if uri == "" {
			uri = r.URL.RequestURI()
		}
		uri = RedactSensitiveQueryParams(uri)

		slog.Info("http",
			"method", r.Method,
			"uri", uri,
			"status", ww.status,
			"bytes", ww.bytes,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote", r.RemoteAddr,
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
	wrote  bool
}

func wrapResponseWriter(w http.ResponseWriter) *statusWriter {
	return &statusWriter{ResponseWriter: w, status: 200}
}

func (s *statusWriter) WriteHeader(code int) {
	if !s.wrote {
		s.status = code
		s.wrote = true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Write(b []byte) (int, error) {
	if !s.wrote {
		s.wrote = true
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}
