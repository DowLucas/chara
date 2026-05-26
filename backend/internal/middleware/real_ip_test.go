package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTrustedProxyRealIP(t *testing.T) {
	type tc struct {
		name         string
		remoteAddr   string
		xff          string
		xRealIP      string
		trustedCIDRs string
		wantRemote   string // expected r.RemoteAddr seen by the handler (host portion compared)
	}
	cases := []tc{
		{
			name:         "empty allowlist ignores XFF",
			remoteAddr:   "10.0.0.5:1234",
			xff:          "1.2.3.4",
			trustedCIDRs: "",
			wantRemote:   "10.0.0.5:1234",
		},
		{
			name:         "untrusted peer ignores XFF",
			remoteAddr:   "203.0.113.7:9999",
			xff:          "1.2.3.4",
			trustedCIDRs: "10.0.0.0/8",
			wantRemote:   "203.0.113.7:9999",
		},
		{
			name:         "trusted loopback rewrites RemoteAddr from XFF",
			remoteAddr:   "127.0.0.1:55555",
			xff:          "8.8.8.8",
			trustedCIDRs: "127.0.0.1/32",
			wantRemote:   "8.8.8.8",
		},
		{
			name:         "trusted peer, multi-hop XFF picks leftmost untrusted",
			remoteAddr:   "10.0.0.1:1",
			xff:          "9.9.9.9, 10.0.0.2, 10.0.0.3",
			trustedCIDRs: "10.0.0.0/8",
			wantRemote:   "9.9.9.9",
		},
		{
			name:         "X-Real-IP wins over XFF when peer trusted",
			remoteAddr:   "10.0.0.1:1",
			xff:          "9.9.9.9",
			xRealIP:      "5.5.5.5",
			trustedCIDRs: "10.0.0.0/8",
			wantRemote:   "5.5.5.5",
		},
		{
			name:         "bare-IP allowlist entry parses as /32",
			remoteAddr:   "192.168.1.10:5000",
			xff:          "203.0.113.99",
			trustedCIDRs: "192.168.1.10",
			wantRemote:   "203.0.113.99",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cidrs := ParseTrustedCIDRs(c.trustedCIDRs)
			var seen string
			h := TrustedProxyRealIP(cidrs)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen = r.RemoteAddr
				w.WriteHeader(200)
			}))
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = c.remoteAddr
			if c.xff != "" {
				req.Header.Set("X-Forwarded-For", c.xff)
			}
			if c.xRealIP != "" {
				req.Header.Set("X-Real-IP", c.xRealIP)
			}
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if seen != c.wantRemote {
				t.Fatalf("RemoteAddr seen by handler = %q, want %q", seen, c.wantRemote)
			}
		})
	}
}
