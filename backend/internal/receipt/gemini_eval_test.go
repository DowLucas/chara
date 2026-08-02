//go:build geminieval

// This file is a manually-run extraction quality eval, not a regular unit
// test. It calls the real Gemini API (real, billed requests) with GeminiScanner
// directly — no Postgres, no HTTP server, no auth — because the thing under
// test is extractionPrompt's behaviour on real PDF/image documents, not the
// handler plumbing. It is gated behind the "geminieval" build tag so it never
// runs in CI or in a plain `go test ./...`, and each test skips if
// GEMINI_API_KEY is unset. Run with:
//
//	cd backend && set -a && . ./.env.local && set +a && \
//	  go test -tags geminieval ./internal/receipt/ -run TestGeminiEval -v
package receipt

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// evalPDFPath returns the path for an eval fixture, defaulting to the
// scratch location the fixtures were generated into, but overridable via env
// so this isn't wired to one session's temp directory.
func evalPDFPath(t *testing.T, envVar, def string) string {
	t.Helper()
	if v := os.Getenv(envVar); v != "" {
		return v
	}
	return def
}

func evalScanner(t *testing.T) *GeminiScanner {
	t.Helper()
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set — skipping manual extraction eval")
	}
	return NewGemini(key)
}

const evalPDFDir = "/tmp/claude-1000/-home-lucas-dev-projects-chara/7c22fb40-8da5-4196-97a3-4ae39bd4c6c1/scratchpad/pdfs"

// TestGeminiEval_SinglePageReceipt: (a) a single-page PDF e-receipt should
// extract the correct merchant, total, and currency.
func TestGeminiEval_SinglePageReceipt(t *testing.T) {
	s := evalScanner(t)
	path := evalPDFPath(t, "EVAL_PDF_SINGLE", evalPDFDir+"/a_single_receipt.pdf")
	data, err := os.ReadFile(path)
	require.NoError(t, err)

	got, err := s.Scan(context.Background(), data, "application/pdf", "", nil)
	require.NoError(t, err)
	t.Logf("single-page receipt result: %+v", got)

	assert.Equal(t, "ICA Maxi Stormarknad", got.Merchant)
	assert.Equal(t, "SEK", got.Currency)
	assert.EqualValues(t, 25446, got.TotalMinor) // 254.46 SEK
}

// TestGeminiEval_MultiPageInvoice: (b) a multi-page PDF invoice (hotel
// folio) must come back as ONE expense whose items are accumulated across
// every page, with total equal to the final amount due — NOT a per-page
// subtotal.
func TestGeminiEval_MultiPageInvoice(t *testing.T) {
	s := evalScanner(t)
	path := evalPDFPath(t, "EVAL_PDF_MULTIPAGE", evalPDFDir+"/b_multipage_invoice.pdf")
	data, err := os.ReadFile(path)
	require.NoError(t, err)

	got, err := s.Scan(context.Background(), data, "application/pdf", "", nil)
	require.NoError(t, err)
	t.Logf("multi-page invoice result: %+v", got)
	for _, it := range got.Items {
		t.Logf("  item: %+v", it)
	}

	assert.Equal(t, "Scandic Stockholm", got.Merchant)
	assert.EqualValues(t, 713000, got.TotalMinor) // 7130.00 SEK, the final amount due — not a ~3000 SEK page subtotal
}

// TestGeminiEval_BankStatement: (c) THE IMPORTANT CASE. A bank/card
// statement — a list of many separate transactions at different merchants —
// is NOT a receipt. The model must refuse rather than confidently returning
// a total lifted from one row (or a sum of rows).
func TestGeminiEval_BankStatement(t *testing.T) {
	s := evalScanner(t)
	path := evalPDFPath(t, "EVAL_PDF_STATEMENT", evalPDFDir+"/c_bank_statement.pdf")
	data, err := os.ReadFile(path)
	require.NoError(t, err)

	got, err := s.Scan(context.Background(), data, "application/pdf", "", nil)
	if err == nil {
		t.Logf("UNEXPECTED: statement was extracted as a receipt: %+v", got)
	}
	assert.ErrorIs(t, err, ErrUnreadable)
}

// TestGeminiEval_PhotoReceiptUnchanged: (d) a photographed (JPEG) receipt
// should extract exactly as it did before the PDF prompt changes — no image
// regression from the wording edits.
func TestGeminiEval_PhotoReceiptUnchanged(t *testing.T) {
	s := evalScanner(t)
	path := evalPDFPath(t, "EVAL_JPEG_PHOTO", evalPDFDir+"/d_photo_receipt.jpg")
	data, err := os.ReadFile(path)
	require.NoError(t, err)

	got, err := s.Scan(context.Background(), data, "image/jpeg", "", nil)
	require.NoError(t, err)
	t.Logf("photo receipt result: %+v", got)

	assert.Equal(t, "Espresso House", got.Merchant)
	assert.Equal(t, "SEK", got.Currency)
	assert.EqualValues(t, 16240, got.TotalMinor) // 162.40 SEK
}
