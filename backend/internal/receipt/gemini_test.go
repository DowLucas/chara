package receipt

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// geminiTextResponse builds a fake Gemini API response whose first
// candidate's text part is the given JSON string.
func geminiTextResponse(t *testing.T, jsonText string) []byte {
	t.Helper()
	b, err := json.Marshal(geminiResponse{
		Candidates: []struct {
			Content geminiContent `json:"content"`
		}{
			{Content: geminiContent{Parts: []geminiPart{{Text: jsonText}}}},
		},
	})
	require.NoError(t, err)
	return b
}

func TestGeminiScanner_Scan_HappyPath(t *testing.T) {
	var capturedReq geminiRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Contains(t, r.URL.Path, "/models/gemini-3.5-flash:generateContent")
		assert.Equal(t, "test-key", r.URL.Query().Get("key"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &capturedReq))

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(geminiTextResponse(t,
			`{"title":"Groceries at ICA Maxi","merchant":"ICA Maxi","date":"2026-05-20","currency":"sek","total":"284.50","subtotal":"227.60","tax":"56.90","tip":""}`,
		))
	}))
	defer srv.Close()

	s := NewGemini("test-key", WithGeminiBaseURL(srv.URL))

	imgBytes := []byte{0xff, 0xd8, 0xff, 0xe0} // first bytes of a JPEG
	got, err := s.Scan(context.Background(), imgBytes, "image/jpeg", "")
	require.NoError(t, err)

	assert.Equal(t, "Groceries at ICA Maxi", got.Title)
	assert.Equal(t, "ICA Maxi", got.Merchant)
	assert.Equal(t, "2026-05-20", got.Date)
	assert.Equal(t, "SEK", got.Currency)
	assert.EqualValues(t, 28450, got.TotalMinor)
	assert.EqualValues(t, 22760, got.SubtotalMinor)
	assert.EqualValues(t, 5690, got.TaxMinor)
	assert.EqualValues(t, 0, got.TipMinor)

	// Verify the request body shape we sent to Gemini.
	require.Len(t, capturedReq.Contents, 1)
	require.Len(t, capturedReq.Contents[0].Parts, 2)
	assert.NotEmpty(t, capturedReq.Contents[0].Parts[0].Text)
	require.NotNil(t, capturedReq.Contents[0].Parts[1].InlineData)
	assert.Equal(t, "image/jpeg", capturedReq.Contents[0].Parts[1].InlineData.MIMEType)
	decoded, err := base64.StdEncoding.DecodeString(capturedReq.Contents[0].Parts[1].InlineData.Data)
	require.NoError(t, err)
	assert.Equal(t, imgBytes, decoded)
	require.NotNil(t, capturedReq.GenerationConfig)
	assert.Equal(t, "application/json", capturedReq.GenerationConfig.ResponseMIMEType)
}

func TestGeminiScanner_Scan_StripsCodeFence(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			"```json\n{\"merchant\":\"Cafe\",\"date\":\"\",\"currency\":\"EUR\",\"total\":\"5\",\"subtotal\":\"\",\"tax\":\"\",\"tip\":\"\"}\n```",
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/png", "")
	require.NoError(t, err)
	assert.EqualValues(t, 500, got.TotalMinor) // "5" → 5.00 → 500 minor
	assert.Equal(t, "EUR", got.Currency)
}

func TestGeminiScanner_Scan_TitleFallsBackToMerchant(t *testing.T) {
	// Model omits title (older prompt cache, partial response, etc.) — we
	// should still produce a usable form prefill rather than an empty field.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"Pressbyrån","date":"","currency":"SEK","total":"42.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "")
	require.NoError(t, err)
	assert.Equal(t, "Pressbyrån", got.Title)
}

func TestGeminiScanner_Scan_UnreadableErrorPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t, `{"error":"unreadable"}`))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "")
	assert.ErrorIs(t, err, ErrUnreadable)
}

func TestGeminiScanner_Scan_UnknownCurrency(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"ZZZ","total":"10.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported currency")
}

func TestGeminiScanner_Scan_TotalZeroIsUnreadable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"USD","total":"0","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "")
	assert.ErrorIs(t, err, ErrUnreadable)
}

func TestGeminiScanner_Scan_PropagatesUpstreamError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"code":400,"message":"bad","status":"INVALID_ARGUMENT"}}`))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "")
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "400"), "want HTTP status in error, got %v", err)
}

func TestGeminiScanner_Scan_EmptyImageRejected(t *testing.T) {
	_, err := NewGemini("k").Scan(context.Background(), nil, "image/jpeg", "")
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrUnreadable))
}

func TestParseDecimalToMinor(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"", 0},
		{"0", 0},
		{"0.00", 0},
		{"1", 100},
		{"1.5", 150},
		{"12.34", 1234},
		{"12.345", 1234}, // extra digits truncated, not rounded
		{"12.", 1200},
		{"-3.21", -321},
	}
	for _, tc := range cases {
		got, err := parseDecimalToMinor(tc.in)
		require.NoErrorf(t, err, "%q", tc.in)
		assert.EqualValuesf(t, tc.want, got, "%q", tc.in)
	}
}
