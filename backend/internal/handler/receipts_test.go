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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/quits/internal/receipt"
)

// fakeScanner is a hand-rolled stub. Tests inject the response or error
// directly instead of mocking the Gemini HTTP boundary (which is covered by
// the receipt package's own tests).
type fakeScanner struct {
	resp *receipt.Receipt
	err  error
	// captured inputs for assertions
	gotBytes []byte
	gotMIME  string
	gotLang  string
}

func (f *fakeScanner) Scan(_ context.Context, imageData []byte, mimeType, language string) (*receipt.Receipt, error) {
	f.gotBytes = append([]byte(nil), imageData...)
	f.gotMIME = mimeType
	f.gotLang = language
	return f.resp, f.err
}

func newReceiptsRouter(scanner receipt.Scanner) http.Handler {
	h := NewReceiptHandler(scanner)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/receipts/scan", h.Scan)
	return mux
}

func postScan(t *testing.T, router http.Handler, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, json.NewEncoder(&buf).Encode(body))
	req := httptest.NewRequest(http.MethodPost, "/api/receipts/scan", &buf)
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
