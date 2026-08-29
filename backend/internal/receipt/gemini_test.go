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
		assert.Equal(t, "test-key", r.Header.Get("x-goog-api-key"))

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
	got, err := s.Scan(context.Background(), imgBytes, "image/jpeg", "", nil)
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

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/png", "", nil)
	require.NoError(t, err)
	assert.EqualValues(t, 500, got.TotalMinor) // "5" → 5.00 → 500 minor
	assert.Equal(t, "EUR", got.Currency)
}

func TestGeminiScanner_Scan_ParsesItems(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"title":"Dinner at Café","merchant":"Café","date":"2026-05-20","currency":"SEK","total":"245.00","subtotal":"220.00","tax":"25.00","tip":"",`+
				`"items":[`+
				`{"description":"Burger","qty":1,"unit_price":"120.00","total":"120.00"},`+
				`{"description":"Salad","qty":1,"unit_price":"60.00","total":"60.00"},`+
				`{"description":"Beer","qty":2,"unit_price":"20.00","total":"40.00"}`+
				`]}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	require.Len(t, got.Items, 3)
	assert.Equal(t, "Burger", got.Items[0].Description)
	assert.EqualValues(t, 1, got.Items[0].Qty)
	assert.EqualValues(t, 12000, got.Items[0].UnitPriceMinor)
	assert.EqualValues(t, 12000, got.Items[0].TotalMinor)
	assert.Equal(t, "Beer", got.Items[2].Description)
	assert.EqualValues(t, 2, got.Items[2].Qty)
	assert.EqualValues(t, 4000, got.Items[2].TotalMinor)
}

func TestGeminiScanner_Scan_ItemsOptional(t *testing.T) {
	// Older responses with no `items` field should parse fine with empty
	// Items slice. The mobile app must tolerate this.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Empty(t, got.Items)
}

func TestGeminiScanner_Scan_ItemDefaults(t *testing.T) {
	// Qty defaults to 1 if Gemini omits or sends 0. unit_price defaults to
	// total when unit_price is omitted.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"30.00","subtotal":"","tax":"","tip":"",`+
				`"items":[{"description":"Coffee","total":"30.00"}]}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	require.Len(t, got.Items, 1)
	assert.EqualValues(t, 1, got.Items[0].Qty)
	assert.EqualValues(t, 3000, got.Items[0].TotalMinor)
	assert.EqualValues(t, 3000, got.Items[0].UnitPriceMinor)
}

func TestGeminiScanner_Scan_ParsesValidCategory(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"ICA Maxi","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"groceries"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "groceries", got.Category)
}

func TestGeminiScanner_Scan_DropsUnknownCategory(t *testing.T) {
	// A category the model hallucinates outside the entire catalog should be
	// dropped rather than passed through — the mobile category list is
	// closed, and an unrecognised value would just fail to render an icon.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"spaceship-fuel"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Empty(t, got.Category)
}

func TestGeminiScanner_Scan_CategoryOptional(t *testing.T) {
	// Older/absent category field parses fine with an empty Category —
	// mobile clients already tolerate this and fall back to the default.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Empty(t, got.Category)
}

func TestGeminiScanner_Scan_CategoryCaseInsensitive(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"  Food "}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "food", got.Category)
}

func TestGeminiScanner_Scan_RestrictsCategoryToAllowedList(t *testing.T) {
	// A group that only enabled "food" and "drinks" shouldn't get a
	// "groceries" suggestion back, even though it's a globally valid slug.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"groceries"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", []string{"food", "drinks"})
	require.NoError(t, err)
	assert.Empty(t, got.Category)
}

func TestGeminiScanner_Scan_AllowsCategoryInAllowedList(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"food"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", []string{"food", "drinks"})
	require.NoError(t, err)
	assert.Equal(t, "food", got.Category)
}

func TestGeminiScanner_Scan_EmptyAllowedListUsesFullDefaultCatalog(t *testing.T) {
	// nil/empty allowedCategories means "group has no configuration" — falls
	// back to the full default catalog, not the old narrow 5-value set.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"electronics"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "electronics", got.Category)
}

func TestGeminiScanner_Scan_CatchAllOnlyAllowedListFallsBackToFullCatalog(t *testing.T) {
	// A group whose category_slugs is exactly ["general","other"] passes
	// category.Validate (non-empty, known slugs) but has nothing specific
	// to restrict AI guesses to. Rather than a degenerate empty prompt/
	// allowlist that permanently disables suggestions for that group,
	// this should fall back to the full default catalog.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"electronics"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", []string{"general", "other"})
	require.NoError(t, err)
	assert.Equal(t, "electronics", got.Category)
}

func TestGeminiScanner_Scan_NeverAllowsGeneralOrOtherCatchAlls(t *testing.T) {
	// Catch-alls are never something the AI should guess, even if a caller
	// mistakenly includes them in the allowed list.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":"","category":"general"}`,
		))
	}))
	defer srv.Close()

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", []string{"general", "food"})
	require.NoError(t, err)
	assert.Empty(t, got.Category)
}

func TestGeminiScanner_Scan_PromptListsOnlyAllowedCategories(t *testing.T) {
	var capturedReq geminiRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &capturedReq))
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"SEK","total":"50.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", []string{"food", "drinks"})
	require.NoError(t, err)

	promptText := capturedReq.Contents[0].Parts[0].Text
	assert.Contains(t, promptText, "food")
	assert.Contains(t, promptText, "drinks")
	assert.NotContains(t, promptText, "insurance")
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

	got, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "Pressbyrån", got.Title)
}

func TestGeminiScanner_Scan_UnreadableErrorPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t, `{"error":"unreadable"}`))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	assert.ErrorIs(t, err, ErrUnreadable)
}

func TestGeminiScanner_Scan_UnknownCurrency(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(geminiTextResponse(t,
			`{"merchant":"X","date":"","currency":"ZZZ","total":"10.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
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

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	assert.ErrorIs(t, err, ErrUnreadable)
}

func TestGeminiScanner_Scan_PropagatesUpstreamError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"code":400,"message":"bad","status":"INVALID_ARGUMENT"}}`))
	}))
	defer srv.Close()

	_, err := NewGemini("k", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "400"), "want HTTP status in error, got %v", err)
}

// TestGeminiScanner_Scan_APIKeySentViaHeaderNotURL guards against the API
// key leaking: a transport-level *url.Error embeds the full request URL in
// err.Error(), so a `?key=` query param would end up in logs and error
// responses. The key must travel in the x-goog-api-key header instead.
func TestGeminiScanner_Scan_APIKeySentViaHeaderNotURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.NotContains(t, r.URL.String(), "test-key", "API key must not appear in the URL")
		assert.Empty(t, r.URL.Query().Get("key"))
		assert.Equal(t, "test-key", r.Header.Get("x-goog-api-key"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(geminiTextResponse(t,
			`{"title":"T","merchant":"M","date":"2026-05-20","currency":"SEK","total":"10.00"}`,
		))
	}))
	defer srv.Close()

	_, err := NewGemini("test-key", WithGeminiBaseURL(srv.URL)).Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)
}

// Gemini returns structurally invalid JSON — a missing closing brace, or a
// stray trailing one after {"error":"unreadable"} — often enough to matter
// when generationConfig only sets response_mime_type. finishReason is STOP,
// so this is malformed output rather than truncation, and the scan fails as
// a 502. Sending an explicit response_schema constrains decoding and fixes
// it. See the deliberate absence of "required" below.
func TestGeminiScanner_Scan_SendsResponseSchema(t *testing.T) {
	var captured map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &captured))

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(geminiTextResponse(t,
			`{"title":"T","merchant":"M","date":"2026-05-20","currency":"SEK","total":"10.00"}`,
		))
	}))
	defer srv.Close()

	_, err := NewGemini("test-key", WithGeminiBaseURL(srv.URL)).
		Scan(context.Background(), []byte{1}, "image/jpeg", "", nil)
	require.NoError(t, err)

	cfg, ok := captured["generationConfig"].(map[string]any)
	require.True(t, ok, "generationConfig must be present")
	schema, ok := cfg["response_schema"].(map[string]any)
	require.True(t, ok, "response_schema must be sent alongside response_mime_type")
	assert.Equal(t, "object", schema["type"])

	props, ok := schema["properties"].(map[string]any)
	require.True(t, ok)
	for _, k := range []string{
		"title", "merchant", "category", "date", "currency",
		"total", "subtotal", "tax", "tip", "error", "items",
	} {
		assert.Contains(t, props, k, "schema must declare %q", k)
	}

	// "items" must be required alongside the scalars. Requiring the scalars
	// alone makes the model drop the items array; omitting the required list
	// entirely makes it drop currency on some receipts, which then fails the
	// currency allowlist as an unsupported "".
	required := schema["required"].([]any)
	got := make([]string, 0, len(required))
	for _, r := range required {
		got = append(got, r.(string))
	}
	assert.ElementsMatch(t,
		[]string{"title", "merchant", "currency", "total", "items"}, got)

	items, ok := props["items"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "array", items["type"])
	itemSchema, ok := items["items"].(map[string]any)
	require.True(t, ok)
	itemProps, ok := itemSchema["properties"].(map[string]any)
	require.True(t, ok)
	for _, k := range []string{"description", "qty", "unit_price", "total"} {
		assert.Contains(t, itemProps, k, "item schema must declare %q", k)
	}
}

func TestGeminiScanner_Scan_EmptyImageRejected(t *testing.T) {
	_, err := NewGemini("k").Scan(context.Background(), nil, "image/jpeg", "", nil)
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrUnreadable))
}

func TestGeminiScanner_Scan_SendsPDFMimeInline(t *testing.T) {
	var capturedReq geminiRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &capturedReq))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(geminiTextResponse(t,
			`{"title":"Hotel — Scandic Stockholm","merchant":"Scandic","date":"2026-07-02","currency":"SEK","total":"1450.00","subtotal":"","tax":"","tip":""}`,
		))
	}))
	defer srv.Close()

	s := NewGemini("test-key", WithGeminiBaseURL(srv.URL))
	pdfBytes := []byte("%PDF-1.7\nfake pdf body")

	got, err := s.Scan(context.Background(), pdfBytes, "application/pdf", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "Scandic", got.Merchant)
	assert.EqualValues(t, 145000, got.TotalMinor)

	require.Len(t, capturedReq.Contents, 1)
	require.Len(t, capturedReq.Contents[0].Parts, 2)
	require.NotNil(t, capturedReq.Contents[0].Parts[1].InlineData)
	assert.Equal(t, "application/pdf", capturedReq.Contents[0].Parts[1].InlineData.MIMEType)
	assert.Equal(t,
		base64.StdEncoding.EncodeToString(pdfBytes),
		capturedReq.Contents[0].Parts[1].InlineData.Data,
	)
}

// The prompt must carry the two PDF-specific rules. This is a guard against
// someone editing the prompt and silently dropping them — the extraction
// quality itself is verified by the manual eval in the plan, not here.
func TestExtractionPrompt_CoversMultiPageAndStatements(t *testing.T) {
	assert.Contains(t, extractionPrompt, "multi-page")
	assert.Contains(t, extractionPrompt, "statement")
	assert.NotContains(t, extractionPrompt, "attached receipt image and extract")
}
