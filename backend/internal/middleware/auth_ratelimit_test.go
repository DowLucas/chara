package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthRateLimit_PerIP_31stRequestRejected(t *testing.T) {
	mw := AuthRateLimit(30, 5)
	h := mw(okHandler())

	for i := 0; i < 30; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/auth/magic-link", nil)
		req.RemoteAddr = "10.0.0.1:1234"
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: want 200, got %d", i+1, rr.Code)
		}
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/auth/magic-link", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("31st request: want 429, got %d", rr.Code)
	}
}

func TestAuthRateLimit_PerEmail_6thRequestRejected(t *testing.T) {
	mw := AuthRateLimit(1000, 5) // big IP cap so email bucket trips first
	h := mw(okHandler())

	body := `{"email":"alice@example.com"}`
	for i := 0; i < 5; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/auth/magic-link", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		// Spread across IPs so the IP bucket never trips during this loop.
		req.RemoteAddr = "10.1.0." + itoa(i+1) + ":1234"
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("email request %d: want 200, got %d", i+1, rr.Code)
		}
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/auth/magic-link", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.1.0.99:1234"
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("6th email request: want 429, got %d", rr.Code)
	}
}

func TestAuthRateLimit_DifferentEmailsDontShareBucket(t *testing.T) {
	mw := AuthRateLimit(1000, 5)
	h := mw(okHandler())

	for i := 0; i < 5; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/auth/magic-link",
			strings.NewReader(`{"email":"alice@example.com"}`))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.2.0." + itoa(i+1) + ":1234"
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("alice request %d: want 200, got %d", i+1, rr.Code)
		}
	}

	// Bob should still be allowed — different bucket.
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/auth/magic-link",
		strings.NewReader(`{"email":"bob@example.com"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.2.0.200:1234"
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("bob's first request: want 200, got %d", rr.Code)
	}
}

func TestAuthRateLimit_PreservesBodyForHandler(t *testing.T) {
	mw := AuthRateLimit(1000, 1000)
	var seen string
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 1024)
		n, _ := r.Body.Read(buf)
		seen = string(buf[:n])
		w.WriteHeader(http.StatusOK)
	}))

	rr := httptest.NewRecorder()
	body := `{"email":"alice@example.com"}`
	req := httptest.NewRequest("POST", "/api/auth/magic-link", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.3.0.1:1234"
	h.ServeHTTP(rr, req)

	if seen != body {
		t.Fatalf("body not preserved for handler: want %q, got %q", body, seen)
	}
}

func TestAuthRateLimit_NonJSONBody_FallsBackToIPBucketOnly(t *testing.T) {
	mw := AuthRateLimit(1000, 1)
	h := mw(okHandler())

	for i := 0; i < 10; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/auth/magic-link", strings.NewReader("not json"))
		req.RemoteAddr = "10.4.0." + itoa(i+1) + ":1234"
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("non-JSON request %d: want 200, got %d", i+1, rr.Code)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
