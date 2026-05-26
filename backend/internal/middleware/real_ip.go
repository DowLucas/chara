package middleware

import (
	"net"
	"net/http"
	"strings"
)

// TrustedProxyRealIP is a hardened replacement for chi's middleware.RealIP.
//
// chi's RealIP unconditionally honors X-Forwarded-For (and X-Real-IP), which
// is fine when the server is always behind a trusted reverse proxy — but
// Chara may be reached directly (selfhost on a LAN, dev) and the rate-limit
// middleware buckets by remote IP. If we trust XFF unconditionally, any
// caller can spoof it and bypass per-IP rate limits trivially.
//
// This middleware only rewrites r.RemoteAddr from XFF/X-Real-IP when the
// immediate peer (parsed from r.RemoteAddr) is in trustedCIDRs. The empty
// allowlist (default) means "never trust forwarded headers" — safest
// default. When deploying behind a reverse proxy, set TRUSTED_PROXIES to the
// proxy's CIDR (e.g. "10.0.0.0/8" for a Tailscale-or-private network, or
// "127.0.0.1/32" when fronted by a same-host Caddy/nginx).
//
// For multi-hop XFF the leftmost untrusted address wins: we walk the list
// right-to-left, skipping trusted-CIDR addresses, and take the first one we
// can't account for. That's the standard "real client" extraction recipe.
func TrustedProxyRealIP(trustedCIDRs []*net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if ip := realIP(r, trustedCIDRs); ip != "" {
				r.RemoteAddr = ip
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ParseTrustedCIDRs parses a comma-separated list of CIDRs from a config
// string. Invalid entries are silently dropped — misconfigured operators
// fail-closed (we don't trust XFF) rather than fail-open.
func ParseTrustedCIDRs(s string) []*net.IPNet {
	out := make([]*net.IPNet, 0)
	for _, part := range strings.Split(s, ",") {
		p := strings.TrimSpace(part)
		if p == "" {
			continue
		}
		// Bare IP → /32 or /128.
		if !strings.Contains(p, "/") {
			if ip := net.ParseIP(p); ip != nil {
				if ip.To4() != nil {
					p = p + "/32"
				} else {
					p = p + "/128"
				}
			}
		}
		if _, cidr, err := net.ParseCIDR(p); err == nil {
			out = append(out, cidr)
		}
	}
	return out
}

// realIP returns the chosen client IP for the request, or "" to leave
// r.RemoteAddr untouched. The returned string has no port — callers may
// append one if their downstream code expects "ip:port", but the only
// in-tree consumer (rate-limit) treats RemoteAddr as a key prefix so the
// port doesn't matter.
func realIP(r *http.Request, trusted []*net.IPNet) string {
	peer := remoteAddrHost(r.RemoteAddr)
	if peer == "" {
		return ""
	}
	if !ipInAny(net.ParseIP(peer), trusted) {
		// Immediate peer isn't a trusted proxy → ignore forwarded headers.
		return ""
	}

	// X-Real-IP is a single value, trusted only when set by the proxy.
	if xr := strings.TrimSpace(r.Header.Get("X-Real-IP")); xr != "" {
		if ip := net.ParseIP(xr); ip != nil {
			return ip.String()
		}
	}

	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" {
		return ""
	}
	hops := strings.Split(xff, ",")
	// Walk right-to-left: skip any trusted hop, return the first untrusted.
	for i := len(hops) - 1; i >= 0; i-- {
		h := strings.TrimSpace(hops[i])
		ip := net.ParseIP(h)
		if ip == nil {
			continue
		}
		if ipInAny(ip, trusted) {
			continue
		}
		return ip.String()
	}
	// All hops were trusted (unusual) — return the leftmost parseable IP.
	for _, h := range hops {
		if ip := net.ParseIP(strings.TrimSpace(h)); ip != nil {
			return ip.String()
		}
	}
	return ""
}

func remoteAddrHost(addr string) string {
	if addr == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}

func ipInAny(ip net.IP, cidrs []*net.IPNet) bool {
	if ip == nil {
		return false
	}
	for _, c := range cidrs {
		if c.Contains(ip) {
			return true
		}
	}
	return false
}
