package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/receipt"
)

// fakeScanner is a hand-rolled stub. Tests inject the response or error
// directly instead of mocking the Gemini HTTP boundary (which is covered by
// the receipt package's own tests).
type fakeScanner struct {
	resp *receipt.Receipt
	err  error
	// captured inputs for assertions
	gotBytes      []byte
	gotMIME       string
	gotLang       string
	gotCategories []string
}

func (f *fakeScanner) Scan(_ context.Context, imageData []byte, mimeType, language string, allowedCategories []string) (*receipt.Receipt, error) {
	f.gotBytes = append([]byte(nil), imageData...)
	f.gotMIME = mimeType
	f.gotLang = language
	f.gotCategories = allowedCategories
	return f.resp, f.err
}

// fakeGroupCategories is a hand-rolled stub for GroupCategoriesLookup. A
// missing groupID entry simulates either "unknown group" or "caller isn't a
// member" — both are ErrNoRows in the real adapter and both fail open the
// same way, so the fake doesn't need to model them separately.
type fakeGroupCategories struct {
	slugs      map[string][]string // groupID -> category_slugs
	gotGroupID string
	gotUserID  string
}

func (f *fakeGroupCategories) GetGroupCategorySlugs(_ context.Context, groupID, userID string) ([]string, error) {
	f.gotGroupID = groupID
	f.gotUserID = userID
	slugs, ok := f.slugs[groupID]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return slugs, nil
}

// authedRequest builds a claims-bearing context.Context, mirroring what
// middleware.Authenticate injects in production.
func authedContext(userID string) context.Context {
	return context.WithValue(context.Background(), middleware.ClaimsKey, &auth.Claims{UserID: userID})
}

func newReceiptsRouter(scanner receipt.Scanner) http.Handler {
	h := NewReceiptHandler(scanner)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)
	return mux
}

func postScan(t *testing.T, router http.Handler, body any) *httptest.ResponseRecorder {
	t.Helper()
	return postScanWithContext(t, router, body, context.Background())
}

func postScanWithContext(
	t *testing.T, router http.Handler, body any, ctx context.Context,
) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, json.NewEncoder(&buf).Encode(body))
	req := httptest.NewRequest(http.MethodPost, "/api/receipts/scan", &buf).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

func TestReceiptScan_HappyPath(t *testing.T) {
	want := &receipt.Receipt{
		Merchant: "ICA Maxi", Date: "2026-05-20", Currency: "SEK",
		TotalMinor: 28450, SubtotalMinor: 22760, TaxMinor: 5690,
	}
	fake := &fakeScanner{resp: want}
	router := newReceiptsRouter(fake)

	imgBytes := []byte("fake-jpeg-bytes")
	rr := postScan(t, router, map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString(imgBytes),
		"mime_type":    "image/jpeg",
	})

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var got scanResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	assert.Equal(t, "ICA Maxi", got.Merchant)
	assert.Equal(t, "SEK", got.Currency)
	assert.EqualValues(t, 28450, got.TotalMinor)
	assert.EqualValues(t, 22760, got.SubtotalMinor)
	assert.EqualValues(t, 5690, got.TaxMinor)

	// The handler should have decoded base64 before calling the scanner.
	assert.Equal(t, imgBytes, fake.gotBytes)
	assert.Equal(t, "image/jpeg", fake.gotMIME)
}

func TestReceiptScan_IncludesCategory(t *testing.T) {
	fake := &fakeScanner{resp: &receipt.Receipt{
		Merchant: "ICA Maxi", Currency: "SEK", TotalMinor: 100, Category: "groceries",
	}}
	rr := postScan(t, newReceiptsRouter(fake), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var got scanResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	assert.Equal(t, "groceries", got.Category)
}

func TestReceiptScan_OmitsEmptyCategory(t *testing.T) {
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "USD", TotalMinor: 100}}
	rr := postScan(t, newReceiptsRouter(fake), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.NotContains(t, rr.Body.String(), `"category"`)
}

func TestReceiptScan_ResolvesGroupCategorySlugs(t *testing.T) {
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "SEK", TotalMinor: 100}}
	groups := &fakeGroupCategories{slugs: map[string][]string{"g1": {"food", "drinks"}}}
	h := NewReceiptHandler(fake).WithGroupCategories(groups)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)

	rr := postScanWithContext(t, mux, map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
		"group_id":     "g1",
	}, authedContext("alice"))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, []string{"food", "drinks"}, fake.gotCategories)

	// The authenticated caller's id must reach the lookup — this is what
	// lets a real GroupCategoriesLookup implementation verify membership.
	assert.Equal(t, "g1", groups.gotGroupID)
	assert.Equal(t, "alice", groups.gotUserID)
}

func TestReceiptScan_UnauthenticatedRequestSkipsGroupLookup(t *testing.T) {
	// No claims in context (shouldn't happen in production — this route is
	// always behind middleware.Authenticate — but must not panic, and must
	// not attempt a lookup with an empty caller id).
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "SEK", TotalMinor: 100}}
	groups := &fakeGroupCategories{slugs: map[string][]string{"g1": {"food", "drinks"}}}
	h := NewReceiptHandler(fake).WithGroupCategories(groups)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)

	rr := postScan(t, mux, map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
		"group_id":     "g1",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Empty(t, fake.gotCategories)
	assert.Empty(t, groups.gotGroupID, "lookup should never be attempted without an authenticated caller")
}

func TestReceiptScan_NoGroupIDMeansNoAllowlistRestriction(t *testing.T) {
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "SEK", TotalMinor: 100}}
	h := NewReceiptHandler(fake).WithGroupCategories(&fakeGroupCategories{
		slugs: map[string][]string{"g1": {"food", "drinks"}},
	})
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)

	rr := postScan(t, mux, map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Empty(t, fake.gotCategories)
}

func TestReceiptScan_UnknownGroupIDFailsOpenToNoRestriction(t *testing.T) {
	// A stale/deleted group_id shouldn't fail the whole scan — the category
	// suggestion is advisory, not load-bearing.
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "SEK", TotalMinor: 100}}
	h := NewReceiptHandler(fake).WithGroupCategories(&fakeGroupCategories{slugs: map[string][]string{}})
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)

	rr := postScanWithContext(t, mux, map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
		"group_id":     "nonexistent",
	}, authedContext("alice"))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Empty(t, fake.gotCategories)
}

func TestReceiptScan_GroupIDWithoutLookupConfiguredIsHarmless(t *testing.T) {
	// Self-host / test wiring that never calls WithGroupCategories shouldn't
	// panic just because a client sent a group_id.
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "SEK", TotalMinor: 100}}
	rr := postScan(t, newReceiptsRouter(fake), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
		"group_id":     "g1",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Empty(t, fake.gotCategories)
}

func TestReceiptScan_ForwardsLanguageToScanner(t *testing.T) {
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "USD", TotalMinor: 100}}
	rr := postScan(t, newReceiptsRouter(fake), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "image/jpeg",
		"language":     "sv",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, "sv", fake.gotLang)
}

func TestReceiptScan_StripsDataURLPrefix(t *testing.T) {
	imgBytes := []byte{1, 2, 3, 4}
	encoded := base64.StdEncoding.EncodeToString(imgBytes)
	fake := &fakeScanner{resp: &receipt.Receipt{Merchant: "X", Currency: "USD", TotalMinor: 100}}
	router := newReceiptsRouter(fake)

	rr := postScan(t, router, map[string]string{
		"image_base64": "data:image/png;base64," + encoded,
		"mime_type":    "image/png",
	})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, imgBytes, fake.gotBytes)
}

func TestReceiptScan_RejectsInvalidBase64(t *testing.T) {
	rr := postScan(t, newReceiptsRouter(&fakeScanner{}), map[string]string{
		"image_base64": "!!!not base64!!!",
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "base64")
}

func TestReceiptScan_RejectsEmptyImage(t *testing.T) {
	rr := postScan(t, newReceiptsRouter(&fakeScanner{}), map[string]string{
		"image_base64": "",
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestReceiptScan_RejectsUnsupportedMIME(t *testing.T) {
	rr := postScan(t, newReceiptsRouter(&fakeScanner{}), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1, 2}),
		"mime_type":    "application/pdf",
	})
	require.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "mime_type")
}

func TestReceiptScan_RejectsTooLarge(t *testing.T) {
	big := make([]byte, MaxReceiptImageBytes+1)
	rr := postScan(t, newReceiptsRouter(&fakeScanner{}), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString(big),
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusRequestEntityTooLarge, rr.Code)
}

// TestReceiptScan_RejectsHugeRawBody verifies that an outsized HTTP body is
// rejected by MaxBytesReader BEFORE json.Decode buffers the whole payload in
// memory. Without the MaxBytesReader wrap, a 100 MB JSON body would be fully
// read into a string field — a trivial OOM vector. We test the boundary by
// crafting a raw body well past MaxReceiptImageBytes*2 (the base64 cap).
func TestReceiptScan_RejectsHugeRawBody(t *testing.T) {
	// Build a JSON body whose `image_base64` string field is 4x the decoded
	// cap — well past the MaxBytesReader limit of MaxReceiptImageBytes*2.
	huge := strings.Repeat("A", MaxReceiptImageBytes*4)
	body := `{"image_base64":"` + huge + `","mime_type":"image/jpeg"}`
	req := httptest.NewRequest(http.MethodPost, "/api/receipts/scan", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.ContentLength = int64(len(body))
	rr := httptest.NewRecorder()
	newReceiptsRouter(&fakeScanner{}).ServeHTTP(rr, req)
	// MaxBytesReader-induced decode errors today land on the 400 "invalid
	// JSON body" path (json.Decoder surfaces them as a generic error). A
	// stricter 413 would be nicer but matches no existing handler shape;
	// what we care about is that we never read past the cap. Either 400
	// or 413 is acceptable as long as it's NOT 200 / OOM.
	require.True(t,
		rr.Code == http.StatusRequestEntityTooLarge || rr.Code == http.StatusBadRequest,
		"got %d: %s", rr.Code, rr.Body.String(),
	)
}

func TestReceiptScan_UnreadableMaps422(t *testing.T) {
	rr := postScan(t, newReceiptsRouter(&fakeScanner{err: receipt.ErrUnreadable}), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1}),
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusUnprocessableEntity, rr.Code)
}

func TestReceiptScan_UpstreamFailureMaps502(t *testing.T) {
	rr := postScan(t, newReceiptsRouter(&fakeScanner{err: errors.New("gemini down")}), map[string]string{
		"image_base64": base64.StdEncoding.EncodeToString([]byte{1}),
		"mime_type":    "image/jpeg",
	})
	require.Equal(t, http.StatusBadGateway, rr.Code)
}

func TestReceiptScan_RejectsInvalidJSONBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/receipts/scan", strings.NewReader("{not json"))
	rr := httptest.NewRecorder()
	newReceiptsRouter(&fakeScanner{}).ServeHTTP(rr, req)
	require.Equal(t, http.StatusBadRequest, rr.Code)
}
