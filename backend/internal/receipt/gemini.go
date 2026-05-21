package receipt

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/DowLucas/quits/internal/language"
)

// DefaultGeminiModel is Google's current vision-capable Gemini Flash model.
// Flash is the right pick for receipt OCR: low latency, low cost, strong
// vision. Override with [GeminiOption] for testing or model upgrades, or via
// the GEMINI_MODEL env var if [config] is wired to pass it through.
const DefaultGeminiModel = "gemini-3.5-flash"

const defaultGeminiBase = "https://generativelanguage.googleapis.com/v1beta"

// extractionPrompt is sent alongside the image. We instruct the model to
// return JSON-only with explicit field semantics so the response is
// machine-parseable without further structuring.
const extractionPrompt = `You are a receipt parser. Look at the attached receipt image and extract:
- title: a SHORT natural-language description of what this expense was for, written like a friend would label it in a shared-expenses app. Combine the merchant type and the most distinctive line items. 3-6 words, no quotes, no trailing period. Examples:
    • Grocery store with food items     → "Groceries at ICA Maxi"
    • Restaurant with meals             → "Dinner at Café Husaren"
    • Coffee shop with drinks/pastries  → "Coffee and pastries at Espresso House"
    • Pharmacy                          → "Pharmacy run at Apoteket"
    • Gas/fuel                          → "Fuel at Shell"
    • Hardware store                    → "Hardware from Bauhaus"
    • Convenience store snacks          → "Snacks at 7-Eleven"
    • Hotel stay                        → "Hotel — Scandic Stockholm"
    • Taxi/rideshare                    → "Taxi ride"
    • Mixed items, unclear category     → use the merchant name alone, e.g. "Pressbyrån"
  Prefer "<thing> at <merchant>" when one or two item categories dominate; fall back to just the merchant name if items are too varied to summarise. WRITE THIS FIELD IN {{LANGUAGE}} regardless of what language the receipt itself is in — translate item names and connectors but keep the merchant name as printed on the receipt (do not transliterate proper nouns).
- merchant: the business name as it appears on the receipt (string).
- date: the transaction date in YYYY-MM-DD form. If the year is missing, infer the current year. Empty string if unreadable.
- currency: the ISO 4217 currency code (e.g. "SEK", "EUR", "USD"). Infer from the currency symbol or country if not explicit.
- total: the final amount paid as a decimal string (e.g. "123.45"). This is the field the user owes.
- subtotal: the pre-tax pre-tip subtotal as a decimal string, or "" if not shown.
- tax: tax/VAT amount as a decimal string, or "" if not shown.
- tip: tip/gratuity amount as a decimal string, or "" if not shown.

Respond with a single JSON object and no other text. Example:
{"title":"Groceries at ICA Maxi","merchant":"ICA Maxi","date":"2026-05-20","currency":"SEK","total":"284.50","subtotal":"227.60","tax":"56.90","tip":""}

If the image is not a receipt or you cannot read a total, respond with {"error":"unreadable"}.`

// GeminiScanner calls Google's Generative Language API.
type GeminiScanner struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// GeminiOption configures a GeminiScanner.
type GeminiOption func(*GeminiScanner)

// WithGeminiModel overrides the model name. Used in tests and to opt into
// new Gemini releases without code changes.
func WithGeminiModel(model string) GeminiOption {
	return func(s *GeminiScanner) { s.model = model }
}

// WithGeminiBaseURL overrides the API base URL. Used by tests to point at
// an httptest.Server.
func WithGeminiBaseURL(url string) GeminiOption {
	return func(s *GeminiScanner) { s.baseURL = url }
}

// WithGeminiHTTPClient lets callers inject a configured *http.Client (for
// custom timeouts, tracing, etc.).
func WithGeminiHTTPClient(c *http.Client) GeminiOption {
	return func(s *GeminiScanner) { s.client = c }
}

// NewGemini constructs a scanner. apiKey must be non-empty; callers should
// check [config.HasGemini] before instantiating.
func NewGemini(apiKey string, opts ...GeminiOption) *GeminiScanner {
	s := &GeminiScanner{
		apiKey:  apiKey,
		model:   DefaultGeminiModel,
		baseURL: defaultGeminiBase,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Request/response shapes for the Gemini generateContent endpoint. Only the
// fields we use are modeled.
type geminiInlineData struct {
	MIMEType string `json:"mime_type"`
	Data     string `json:"data"`
}

type geminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *geminiInlineData `json:"inline_data,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiGenerationConfig struct {
	ResponseMIMEType string  `json:"response_mime_type,omitempty"`
	Temperature      float64 `json:"temperature,omitempty"`
}

type geminiRequest struct {
	Contents         []geminiContent         `json:"contents"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

type geminiExtracted struct {
	Title    string `json:"title"`
	Merchant string `json:"merchant"`
	Date     string `json:"date"`
	Currency string `json:"currency"`
	Total    string `json:"total"`
	Subtotal string `json:"subtotal"`
	Tax      string `json:"tax"`
	Tip      string `json:"tip"`
	Error    string `json:"error"`
}

// Scan implements [Scanner].
func (s *GeminiScanner) Scan(ctx context.Context, imageData []byte, mimeType string, langCode string) (*Receipt, error) {
	if len(imageData) == 0 {
		return nil, errors.New("receipt: empty image data")
	}
	if mimeType == "" {
		mimeType = "image/jpeg"
	}

	// Resolve the language label to interpolate into the prompt. Unknown /
	// empty codes fall back to "the receipt's own language" so the title
	// is at least readable rather than wrong.
	langLabel := "the receipt's own language"
	if language.IsSupported(langCode) {
		langLabel = language.Name(langCode)
	}
	prompt := strings.Replace(extractionPrompt, "{{LANGUAGE}}", langLabel, 1)

	reqBody := geminiRequest{
		Contents: []geminiContent{{
			Parts: []geminiPart{
				{Text: prompt},
				{InlineData: &geminiInlineData{
					MIMEType: mimeType,
					Data:     base64.StdEncoding.EncodeToString(imageData),
				}},
			},
		}},
		GenerationConfig: &geminiGenerationConfig{
			ResponseMIMEType: "application/json",
			Temperature:      0,
		},
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("receipt: marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", s.baseURL, s.model, s.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("receipt: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("receipt: gemini request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("receipt: read gemini response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("receipt: gemini returned %d: %s", resp.StatusCode, truncate(string(rawBody), 300))
	}

	var parsed geminiResponse
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return nil, fmt.Errorf("receipt: decode gemini response: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("receipt: gemini error %s: %s", parsed.Error.Status, parsed.Error.Message)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, ErrUnreadable
	}

	// Gemini returns the structured JSON as a string in the first part's Text.
	jsonText := strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text)
	jsonText = stripCodeFence(jsonText)

	var extracted geminiExtracted
	if err := json.Unmarshal([]byte(jsonText), &extracted); err != nil {
		return nil, fmt.Errorf("receipt: decode extraction %q: %w", truncate(jsonText, 200), err)
	}
	if extracted.Error != "" {
		return nil, ErrUnreadable
	}

	curCode, ok := normaliseCurrency(extracted.Currency)
	if !ok {
		return nil, fmt.Errorf("receipt: unsupported currency %q", extracted.Currency)
	}

	total, err := parseDecimalToMinor(extracted.Total)
	if err != nil {
		return nil, fmt.Errorf("receipt: total: %w", err)
	}
	if total <= 0 {
		return nil, ErrUnreadable
	}
	subtotal, err := parseDecimalToMinor(extracted.Subtotal)
	if err != nil {
		return nil, fmt.Errorf("receipt: subtotal: %w", err)
	}
	tax, err := parseDecimalToMinor(extracted.Tax)
	if err != nil {
		return nil, fmt.Errorf("receipt: tax: %w", err)
	}
	tip, err := parseDecimalToMinor(extracted.Tip)
	if err != nil {
		return nil, fmt.Errorf("receipt: tip: %w", err)
	}

	merchant := strings.TrimSpace(extracted.Merchant)
	title := strings.TrimSpace(extracted.Title)
	// Defensive fallback: if the model omitted the title, the merchant name
	// is the next-best label. Better than an empty form field.
	if title == "" {
		title = merchant
	}

	return &Receipt{
		Title:         title,
		Merchant:      merchant,
		Date:          strings.TrimSpace(extracted.Date),
		Currency:      curCode,
		TotalMinor:    total,
		SubtotalMinor: subtotal,
		TaxMinor:      tax,
		TipMinor:      tip,
	}, nil
}

// stripCodeFence removes a leading ```json ... ``` fence if Gemini decides
// to wrap its response despite the JSON response mime type.
func stripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
