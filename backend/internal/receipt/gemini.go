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

	"github.com/DowLucas/chara/internal/language"
	"github.com/DowLucas/chara/internal/money"
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
const extractionPrompt = `You are a receipt parser. The attachment is a receipt, supplied either as a photo or as a PDF document. Extract:
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
- category: your best guess at the expense category, as ONE of these exact lowercase strings: {{CATEGORIES}}. If nothing fits confidently, return "" (empty string) — do not guess.
- date: the transaction date in YYYY-MM-DD form. If the year is missing, infer the current year. Empty string if unreadable.
- currency: the ISO 4217 currency code (e.g. "SEK", "EUR", "USD"). Infer from the currency symbol or country if not explicit.
- total: the final amount paid as a decimal string (e.g. "123.45"). This is the field the user owes.
- subtotal: the pre-tax pre-tip subtotal as a decimal string, or "" if not shown.
- tax: tax/VAT amount as a decimal string, or "" if not shown.
- tip: tip/gratuity amount as a decimal string, or "" if not shown.
- deposit: the total container deposit charged on this receipt — Swedish "pant", bottle/can deposit, crate or keg deposit — as a decimal string, or "" if not shown. Common labels: "Pant", "Pantavgift", "Pant 1kr", "Retur pant", "Panta mera", "Flaskpant", "Burkpant". A deposit is part of the total but is NOT one of the purchased goods, so report its SUM here rather than as an item. Report a deposit REFUND (e.g. "Pantretur", "Pant retur", a bottle-return credit) as a NEGATIVE decimal string.
- items: an ARRAY of the individual purchased line items. Each item is an object with:
    • description: the item name as it appears on the receipt (string).
    • qty: quantity as an integer (defaults to 1 if not shown).
    • unit_price: per-unit price as a decimal string, or "" if not shown — in which case use the line total.
    • total: line total as a decimal string (qty × unit_price). Required.
  All item amounts are in the SAME currency as the "currency" field above (the receipt's currency — NOT translated).
  Rules for items:
    • IGNORE subtotal, tax/VAT, tip, total, change, and rounding lines — those are summary lines, not items.
    • Do NOT list deposit / "pant" / bottle-return rows as items — their sum belongs in the "deposit" field above.
    • OMIT modifiers (e.g. "+ extra cheese", "no onions"); sum any modifier price into the parent line total.
    • If you can't confidently identify the line items, return an EMPTY array []. Do not hallucinate items.
    • Keep item descriptions in the receipt's original language (do NOT translate item names).

Respond with a single JSON object and no other text. Example:
{"title":"Groceries at ICA Maxi","merchant":"ICA Maxi","date":"2026-05-20","currency":"SEK","total":"286.50","subtotal":"227.60","tax":"56.90","tip":"","deposit":"2.00","category":"groceries","items":[{"description":"Mjölk 1L","qty":2,"unit_price":"15.90","total":"31.80"},{"description":"Bröd","qty":1,"unit_price":"32.50","total":"32.50"}]}

Document rules (these matter for PDFs):
- A multi-page document is ONE receipt or invoice. Accumulate line items across every page; do not restart or return only the last page. The "total" is the final amount due for the whole document, not a per-page subtotal.
- If the document is a transaction list rather than a single purchase — a bank or card statement, an account history, a monthly summary listing many separate purchases on different dates at different merchants — it is NOT a receipt. Respond with {"error":"unreadable"}. Do NOT pick one row, and do NOT sum the rows.

If the attachment is not a receipt or you cannot read a total, respond with {"error":"unreadable"}.`

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
	ResponseSchema   any     `json:"response_schema,omitempty"`
}

// responseSchema constrains Gemini's JSON decoding. Without it,
// response_mime_type alone still lets the model emit structurally invalid
// JSON — a missing closing brace, or a stray trailing one after the
// {"error":"unreadable"} sentinel — with finishReason STOP, which surfaces
// to the client as a 502.
//
// "items" must appear in the required list alongside the scalar fields:
// requiring the scalars but not items makes the model drop the array
// entirely. Leaving the list off altogether is worse still — the model then
// omits currency on some receipts, which fails the [currency.Normalize]
// allowlist as an unsupported "".
//
// Requiring the scalars costs nothing on an unreadable image: the model
// returns them empty alongside {"error":"unreadable"}, and an empty total
// already maps to [ErrUnreadable]. Field semantics are carried by
// [extractionPrompt]; this schema only pins the shape.
func responseSchema() map[string]any {
	str := map[string]any{"type": "string"}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title":    str,
			"merchant": str,
			"category": str,
			"date":     str,
			"currency": str,
			"total":    str,
			"subtotal": str,
			"tax":      str,
			"tip":      str,
			"error":    str,
			"items": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"description": str,
						"qty":         map[string]any{"type": "integer"},
						"unit_price":  str,
						"total":       str,
					},
					"required": []string{"description", "total"},
				},
			},
		},
		"required": []string{"title", "merchant", "currency", "total", "items"},
	}
}

type geminiRequest struct {
	Contents         []geminiContent         `json:"contents"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	// UsageMetadata is optional — a pointer so "not reported" stays
	// distinguishable from "reported as zero".
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata,omitempty"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

type geminiExtracted struct {
	Title    string                `json:"title"`
	Merchant string                `json:"merchant"`
	Date     string                `json:"date"`
	Currency string                `json:"currency"`
	Total    string                `json:"total"`
	Subtotal string                `json:"subtotal"`
	Tax      string                `json:"tax"`
	Tip      string                `json:"tip"`
	Deposit  string                `json:"deposit"`
	Category string                `json:"category"`
	Items    []geminiExtractedItem `json:"items"`
	Error    string                `json:"error"`
}

type geminiExtractedItem struct {
	Description string `json:"description"`
	Qty         int    `json:"qty"`
	UnitPrice   string `json:"unit_price"`
	Total       string `json:"total"`
}

// Scan implements [Scanner].
func (s *GeminiScanner) Scan(ctx context.Context, imageData []byte, mimeType string, langCode string, allowedCategories []string) (*Receipt, error) {
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

	// The catalog the model is allowed to guess from — the requesting
	// group's configured category_slugs, or the full default catalog.
	categoryCatalog := specificCategoryCatalog(allowedCategories)
	prompt = strings.Replace(prompt, "{{CATEGORIES}}",
		strings.Join(quoteAll(categoryCatalog), ", "), 1)

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
			ResponseSchema:   responseSchema(),
		},
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("receipt: marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/models/%s:generateContent", s.baseURL, s.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("receipt: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// The key travels in a header, never the URL: a transport-level
	// *url.Error embeds the full request URL in err.Error(), which must
	// stay safe to log or surface.
	req.Header.Set("x-goog-api-key", s.apiKey)

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

	total, err := money.ParseDecimal(extracted.Total)
	if err != nil {
		return nil, fmt.Errorf("receipt: total: %w", err)
	}
	if total <= 0 {
		return nil, ErrUnreadable
	}
	subtotal, err := money.ParseDecimal(extracted.Subtotal)
	if err != nil {
		return nil, fmt.Errorf("receipt: subtotal: %w", err)
	}
	tax, err := money.ParseDecimal(extracted.Tax)
	if err != nil {
		return nil, fmt.Errorf("receipt: tax: %w", err)
	}
	tip, err := money.ParseDecimal(extracted.Tip)
	if err != nil {
		return nil, fmt.Errorf("receipt: tip: %w", err)
	}
	// Deposit ("pant") is an optional enhancement like items, so an
	// unparseable value degrades to "not present" rather than failing an
	// otherwise good scan — notably a refund row the parser may render with
	// a leading minus.
	deposit, err := money.ParseDecimal(extracted.Deposit)
	if err != nil {
		deposit = 0
	}

	merchant := strings.TrimSpace(extracted.Merchant)
	title := strings.TrimSpace(extracted.Title)
	// Defensive fallback: if the model omitted the title, the merchant name
	// is the next-best label. Better than an empty form field.
	if title == "" {
		title = merchant
	}

	// Parse items. Skip rows with unparseable totals rather than failing the
	// whole scan — items are an optional enhancement, the headline total is
	// what the user actually needs.
	var items []Item
	for _, raw := range extracted.Items {
		desc := strings.TrimSpace(raw.Description)
		if desc == "" {
			continue
		}
		totalMinor, err := money.ParseDecimal(raw.Total)
		if err != nil || totalMinor <= 0 {
			continue
		}
		qty := raw.Qty
		if qty <= 0 {
			qty = 1
		}
		unitMinor, err := money.ParseDecimal(raw.UnitPrice)
		if err != nil || unitMinor <= 0 {
			// Fall back to total when unit price is missing — single-qty
			// lines often omit it.
			if qty > 0 {
				unitMinor = totalMinor / money.Amount(qty)
			} else {
				unitMinor = totalMinor
			}
		}
		items = append(items, Item{
			Description:    desc,
			Qty:            qty,
			UnitPriceMinor: unitMinor,
			TotalMinor:     totalMinor,
		})
	}

	out := &Receipt{
		Title:         title,
		Merchant:      merchant,
		Date:          strings.TrimSpace(extracted.Date),
		Currency:      curCode,
		Category:      normaliseCategory(extracted.Category, categoryCatalog),
		TotalMinor:    total,
		SubtotalMinor: subtotal,
		TaxMinor:      tax,
		TipMinor:      tip,
		DepositMinor:  deposit,
		Items:         items,
	}
	if parsed.UsageMetadata != nil {
		out.Usage = Usage{
			InputTokens:  parsed.UsageMetadata.PromptTokenCount,
			OutputTokens: parsed.UsageMetadata.CandidatesTokenCount,
		}
	}
	return out, nil
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

// quoteAll wraps each string in double quotes, for interpolating a category
// catalog into the extraction prompt as a human-readable quoted list.
func quoteAll(ss []string) []string {
	out := make([]string, len(ss))
	for i, s := range ss {
		out[i] = `"` + s + `"`
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
