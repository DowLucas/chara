package middleware

import (
	"net"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"golang.org/x/time/rate"
)

// InviteRateLimit is the middleware mounted on the public invite preview
// endpoint. It enforces two independent buckets — per-IP and per-token —
// keyed in-process via sync.Map; if either bucket is exhausted the request
// returns 429.
//
// Defaults from the invite-deep-links spec (decision #17): per-IP 30 req/min,
// per-token 60 req/min. The limiter is in-process; surviving a restart by
// losing state is acceptable for an MVP — buckets refill within seconds. A
// real attacker exhausting memory through sync.Map growth is a Redis problem,
// not a Phase-1 problem.
//
// The token is read from the chi URL param "token"; if absent (route
// misconfiguration) only the IP bucket applies. The IP is extracted via
// net.SplitHostPort against r.RemoteAddr; chi's RealIP middleware is mounted
// upstream, so this sees the trusted client address.
func InviteRateLimit(perIPPerMinute, perTokenPerMinute int) func(http.Handler) http.Handler {
	ipLimiter := newBucketSet(perIPPerMinute)
	tokenLimiter := newBucketSet(perTokenPerMinute)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if ip != "" && !ipLimiter.allow(ip) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			token := chi.URLParam(r, "token")
			if token != "" && !tokenLimiter.allow(token) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// bucketSet is a keyed collection of token-bucket rate limiters. Each key
// gets its own *rate.Limiter sized at perMinute events per minute (with the
// same burst — i.e. you can spend the whole minute's budget in a burst).
type bucketSet struct {
	perMinute int
	buckets   sync.Map // map[string]*rate.Limiter
}

func newBucketSet(perMinute int) *bucketSet {
	return &bucketSet{perMinute: perMinute}
}

func (b *bucketSet) allow(key string) bool {
	lim, _ := b.buckets.LoadOrStore(key, rate.NewLimiter(rate.Limit(float64(b.perMinute)/60.0), b.perMinute))
	return lim.(*rate.Limiter).Allow()
}

// clientIP extracts the host portion of r.RemoteAddr (chi's RealIP middleware
// is expected to have populated RemoteAddr from X-Forwarded-For / X-Real-IP
// already). Falls back to the raw RemoteAddr if SplitHostPort fails (e.g. when
// httptest passes "192.0.2.1:1234" but also accepts a bare IP).
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
