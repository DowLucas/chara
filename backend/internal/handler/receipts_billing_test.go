//go:build integration

package handler_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/billing"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/receipt"
	"github.com/DowLucas/chara/testutil"
)

// fakeReceiptScanner is the integration-test stub. atomic.Int32 lets us
// assert concurrency-correctness without races.
type fakeReceiptScanner struct {
	mu       sync.Mutex
	resp     *receipt.Receipt
	err      error
	callCount atomic.Int32
}

func (f *fakeReceiptScanner) Scan(_ context.Context, _ []byte, _, _ string) (*receipt.Receipt, error) {
	f.callCount.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.resp, f.err
}

// hostedReceiptsRouter mounts /api/receipts/scan with auth + a counter
// backed by the shared test DB. Mirrors what server.New does for hosted
// instances, but lets us inject a fake scanner without changing server
// signatures.
func hostedReceiptsRouter(t *testing.T, env *testutil.Env, scanner receipt.Scanner, freeCap int, now func() time.Time) http.Handler {
	t.Helper()
	counter := billing.NewCounter(env.Queries)
	if now != nil {
		counter = counter.WithNow(now)
	}
	h := handler.NewReceiptHandler(scanner).WithCounter(counter, freeCap)
	mux := http.NewServeMux()
	mux.Handle("/api/receipts/scan", middleware.Authenticate(env.JWT, env.Queries)(http.HandlerFunc(h.Scan)))
	return mux
}

func selfhostReceiptsRouter(t *testing.T, scanner receipt.Scanner) http.Handler {
	t.Helper()
	// No counter, no auth required on selfhost (in production, auth runs
	// upstream; for this test we're verifying the counter is bypassed).
	h := handler.NewReceiptHandler(scanner)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)
	return mux
}

func scanRequestBody(t *testing.T) string {
	t.Helper()
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-jpeg"))
	return fmt.Sprintf(`{"image_base64":%q,"mime_type":"image/jpeg"}`, encoded)
}

func postAuthedScan(t *testing.T, router http.Handler, token string) *httptest.ResponseRecorder {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, "/api/receipts/scan",
		strings.NewReader(scanRequestBody(t)))
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

func successReceipt() *receipt.Receipt {
	return &receipt.Receipt{
		Merchant: "Test Merchant", Currency: "SEK", TotalMinor: 10000,
	}
}

// ── Hosted: cap behavior ──────────────────────────────────────────────────────

func TestReceiptScan_Hosted_FreeUserHits3rdScanThenCapped(t *testing.T) {
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "ocrcap"), "Cap User")
	token := env.MintToken(t, user.ID, user.Email)

	scanner := &fakeReceiptScanner{resp: successReceipt()}
	router := hostedReceiptsRouter(t, env, scanner, 3, nil)

	// First 3 scans succeed and decrement remaining.
	wantRemaining := []int{2, 1, 0}
	for i, want := range wantRemaining {
		rr := postAuthedScan(t, router, token)
		require.Equal(t, http.StatusOK, rr.Code, "scan %d: %s", i+1, rr.Body.String())

		var got map[string]any
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
		assert.Equal(t, "free", got["tier"], "scan %d", i+1)
		assert.EqualValues(t, want, got["remaining"], "scan %d", i+1)
		require.NotEmpty(t, got["period_resets_at"], "scan %d", i+1)
	}

	// 4th scan: cap reached, 429.
	rr := postAuthedScan(t, router, token)
	require.Equal(t, http.StatusTooManyRequests, rr.Code, rr.Body.String())

	var capBody map[string]any
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &capBody))
	assert.Equal(t, "ocr_cap_reached", capBody["code"])
	assert.Equal(t, true, capBody["waitlist_prompt"])
	assert.EqualValues(t, 0, capBody["remaining"])

	// Scanner should have been hit exactly 3 times — the 4th request must
	// short-circuit before Gemini, otherwise we'd be paying for failures.
	assert.EqualValues(t, 3, scanner.callCount.Load())
}

func TestReceiptScan_Hosted_GeminiFailureRefundsTheSlot(t *testing.T) {
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "refund"), "Refund User")
	token := env.MintToken(t, user.ID, user.Email)

	scanner := &fakeReceiptScanner{err: receipt.ErrUnreadable}
	router := hostedReceiptsRouter(t, env, scanner, 3, nil)

	// 5 failed attempts should NOT exhaust the cap because each refunds.
	for i := 0; i < 5; i++ {
		rr := postAuthedScan(t, router, token)
		require.Equal(t, http.StatusUnprocessableEntity, rr.Code,
			"failed scan %d unexpectedly returned %d: %s", i+1, rr.Code, rr.Body.String())
	}

	// Now swap to success: the user should still have 3 fresh scans.
	scanner.mu.Lock()
	scanner.err = nil
	scanner.resp = successReceipt()
	scanner.mu.Unlock()

	for i := 0; i < 3; i++ {
		rr := postAuthedScan(t, router, token)
		require.Equal(t, http.StatusOK, rr.Code, "success scan %d: %s", i+1, rr.Body.String())
	}
	// And the 4th finally caps.
	rr := postAuthedScan(t, router, token)
	require.Equal(t, http.StatusTooManyRequests, rr.Code)
}

func TestReceiptScan_Hosted_ConcurrentScansRespectCap(t *testing.T) {
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "race"), "Race User")
	token := env.MintToken(t, user.ID, user.Email)

	scanner := &fakeReceiptScanner{resp: successReceipt()}
	router := hostedReceiptsRouter(t, env, scanner, 3, nil)

	// Fire 10 simultaneous scans. Cap is 3 — exactly 3 must succeed even
	// under contention. PostgreSQL's UPSERT atomicity is what we're
	// actually verifying here.
	const N = 10
	var (
		wg       sync.WaitGroup
		ok2xx    atomic.Int32
		hit429   atomic.Int32
	)
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			rr := postAuthedScan(t, router, token)
			switch rr.Code {
			case http.StatusOK:
				ok2xx.Add(1)
			case http.StatusTooManyRequests:
				hit429.Add(1)
			}
		}()
	}
	wg.Wait()

	assert.EqualValues(t, 3, ok2xx.Load(), "exactly 3 scans should succeed")
	assert.EqualValues(t, 7, hit429.Load(), "remaining 7 should hit cap")
	assert.EqualValues(t, 3, scanner.callCount.Load())
}

// ── Hosted: month-boundary behavior ───────────────────────────────────────────

func TestReceiptScan_Hosted_CrossingMonthBoundaryResetsCounter(t *testing.T) {
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "boundary"), "Boundary User")
	token := env.MintToken(t, user.ID, user.Email)
	scanner := &fakeReceiptScanner{resp: successReceipt()}

	// May 24: scan 3 times to hit the cap.
	mayNow := time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC)
	router := hostedReceiptsRouter(t, env, scanner, 3, func() time.Time { return mayNow })
	for i := 0; i < 3; i++ {
		rr := postAuthedScan(t, router, token)
		require.Equal(t, http.StatusOK, rr.Code, "may scan %d", i+1)
	}
	// 4th hits cap.
	rr := postAuthedScan(t, router, token)
	require.Equal(t, http.StatusTooManyRequests, rr.Code)

	// Jump the clock to June 1. The next Reserve should lazy-reset, and the
	// user gets a fresh 3 scans this period.
	juneNow := time.Date(2026, 6, 1, 0, 5, 0, 0, time.UTC)
	juneRouter := hostedReceiptsRouter(t, env, scanner, 3, func() time.Time { return juneNow })
	for i := 0; i < 3; i++ {
		rr := postAuthedScan(t, juneRouter, token)
		require.Equal(t, http.StatusOK, rr.Code, "june scan %d: %s", i+1, rr.Body.String())
	}
	rr = postAuthedScan(t, juneRouter, token)
	require.Equal(t, http.StatusTooManyRequests, rr.Code, "june 4th must cap")
}

// ── Self-host: no counter, no metering ────────────────────────────────────────

func TestReceiptScan_Selfhost_NoCounterMeansNoCap(t *testing.T) {
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "self"), "Self Host User")
	scanner := &fakeReceiptScanner{resp: successReceipt()}
	router := selfhostReceiptsRouter(t, scanner)

	// 10 scans, all should succeed. No counter, no auth, no cap.
	for i := 0; i < 10; i++ {
		rr := postAuthedScan(t, router, env.MintToken(t, user.ID, user.Email))
		require.Equal(t, http.StatusOK, rr.Code, "selfhost scan %d: %s", i+1, rr.Body.String())

		// Confirm the response omits the billing fields entirely. The
		// client uses their absence to decide whether to show upsells.
		var got map[string]any
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
		assert.NotContains(t, got, "tier", "selfhost must not advertise a tier")
		assert.NotContains(t, got, "remaining", "selfhost must not advertise remaining")
		assert.NotContains(t, got, "period_resets_at")
	}
	assert.EqualValues(t, 10, scanner.callCount.Load())
}

func TestReceiptScan_Selfhost_NoCounterRowsCreated(t *testing.T) {
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "self2"), "Self Host User 2")
	scanner := &fakeReceiptScanner{resp: successReceipt()}
	router := selfhostReceiptsRouter(t, scanner)

	rr := postAuthedScan(t, router, env.MintToken(t, user.ID, user.Email))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	// usage_counters must not have a row — selfhost must never touch it.
	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM usage_counters WHERE user_id = $1`, user.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "selfhost path must not write to usage_counters")
}

// ── Edge cases ────────────────────────────────────────────────────────────────

func TestReceiptScan_Hosted_MissingAuthReturns401(t *testing.T) {
	env := testutil.NewEnv(t)
	scanner := &fakeReceiptScanner{resp: successReceipt()}
	router := hostedReceiptsRouter(t, env, scanner, 3, nil)

	req, err := http.NewRequest(http.MethodPost, "/api/receipts/scan",
		strings.NewReader(scanRequestBody(t)))
	require.NoError(t, err)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.EqualValues(t, 0, scanner.callCount.Load(), "must not reach scanner without auth")
}

func TestReceiptScan_Hosted_CapZeroLockoutImmediately(t *testing.T) {
	// Edge case used by future paywall logic — if we ever lower the cap to
	// 0 at runtime, the very first scan must 429 cleanly.
	env := testutil.NewEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "zerocap"), "Zero Cap User")
	token := env.MintToken(t, user.ID, user.Email)

	scanner := &fakeReceiptScanner{resp: successReceipt()}
	router := hostedReceiptsRouter(t, env, scanner, 0, nil)

	rr := postAuthedScan(t, router, token)
	assert.Equal(t, http.StatusTooManyRequests, rr.Code)
	assert.EqualValues(t, 0, scanner.callCount.Load())
}

// Unused but kept for parity with the pattern in other test files.
var _ = pgtype.Date{}
