// Package receipt extracts structured data from a photographed receipt using
// a multimodal AI provider (currently Google Gemini).
//
// The package is intentionally provider-agnostic at the call site: handlers
// depend on the [Scanner] interface so the implementation can be swapped or
// stubbed in tests.
package receipt

import (
	"context"
	"errors"
	"strings"

	"github.com/DowLucas/chara/internal/category"
	"github.com/DowLucas/chara/internal/currency"
	"github.com/DowLucas/chara/internal/money"
)

// Receipt is the structured result of a single scan.
//
// All monetary values are int64 minor units in the receipt's currency. A
// zero value means "the model did not return this field"; callers should
// treat zeros as "unknown" rather than "0.00".
type Receipt struct {
	// Title is an AI-generated short natural-language description of what
	// the expense is for, combining merchant + line items, e.g. "Groceries
	// at ICA Maxi" or "Lunch at Café Husaren". This is what the mobile app
	// prefills into the expense "what was this for" field.
	Title    string `json:"title"`
	Merchant string `json:"merchant"`
	Date     string `json:"date"` // YYYY-MM-DD, empty if not detected
	Currency string `json:"currency"`
	// Category is one of the fixed expense-category ids the mobile app
	// renders (see app/lib/categories.ts EXPENSE_CATEGORIES — keep the two
	// lists in sync). Empty when the model didn't return a confident guess
	// or returned a value outside the allowlist; callers should treat an
	// empty Category as "no suggestion, leave the default."
	Category      string       `json:"category"`
	TotalMinor    money.Amount `json:"total_minor"`
	SubtotalMinor money.Amount `json:"subtotal_minor,omitempty"`
	TaxMinor      money.Amount `json:"tax_minor,omitempty"`
	TipMinor      money.Amount `json:"tip_minor,omitempty"`
	// DepositMinor is the total container deposit on the receipt — Swedish
	// "pant", bottle/can deposit. It is part of TotalMinor but is never one
	// of the Items, because it belongs to the receipt as a whole rather
	// than to any purchased good. Negative when the receipt records a
	// deposit refund ("pantretur") instead of a charge. Clients surface it
	// as an evenly-shared extra charge, which is what stops it showing up
	// as an unassignable remainder against the total.
	DepositMinor money.Amount `json:"deposit_minor,omitempty"`

	// Items, if present, lists per-line entries extracted from the receipt
	// (in the receipt's currency). Optional — Gemini may return an empty
	// list when items can't be confidently parsed. Mobile clients MUST
	// tolerate a missing/empty array. Modifiers are folded into the parent
	// line; deposit / "pant" rows are reported in DepositMinor instead;
	// subtotal/tax/tip lines are not repeated here.
	Items []Item `json:"items,omitempty"`
}

// Item is a single line on a receipt. All amounts are in the receipt's
// currency (see Receipt.Currency) as int64 minor units.
type Item struct {
	Description    string       `json:"description"`
	Qty            int          `json:"qty"`
	UnitPriceMinor money.Amount `json:"unit_price_minor"`
	TotalMinor     money.Amount `json:"total_minor"`
}

// specificCategoryCatalog returns the AI-guessable category catalog: the
// group's allowed slugs when provided (from groups.category_slugs), or the
// full default catalog otherwise — always minus "general"/"other", the
// catch-all defaults that are never worth the model guessing at.
//
// A group can validly configure category_slugs as exactly ["general",
// "other"] (category.Validate only requires non-empty known slugs). That
// would otherwise strip to an empty catalog here, degenerating the prompt
// and permanently disabling category suggestions for that group with no
// error anywhere — so an empty result after filtering falls back to the
// full default catalog instead.
func specificCategoryCatalog(allowed []string) []string {
	base := allowed
	if len(base) == 0 {
		base = category.Default()
	}
	out := make([]string, 0, len(base))
	for _, c := range base {
		if c == "general" || c == "other" {
			continue
		}
		out = append(out, c)
	}
	if len(out) == 0 {
		return specificCategoryCatalog(nil)
	}
	return out
}

// normaliseCategory lowercases/trims s and validates it against allowed
// (case-normalised). Returns "" for anything outside that set, so an
// unrecognised, hallucinated, or out-of-scope-for-this-group category never
// reaches the client.
func normaliseCategory(s string, allowed []string) string {
	c := strings.ToLower(strings.TrimSpace(s))
	if c == "" {
		return ""
	}
	for _, a := range allowed {
		if a == c {
			return c
		}
	}
	return ""
}

// Scanner takes a raw image and returns a structured receipt.
//
// imageData is the decoded image bytes (not base64). mimeType is the MIME
// type as reported by the client, e.g. "image/jpeg" or "image/png".
// language is an ISO 639-1 code naming the language the AI should generate
// the `title` field in (e.g. "en", "sv"). Empty means "use the receipt's
// own language", which is the historical behaviour.
// allowedCategories restricts the AI's Receipt.Category guess to that set
// (typically the requesting group's configured category_slugs). Empty/nil
// falls back to the full default catalog (see category.Default).
type Scanner interface {
	Scan(ctx context.Context, imageData []byte, mimeType string, language string, allowedCategories []string) (*Receipt, error)
}

// ErrUnreadable indicates the model could not extract a usable total —
// either the image is not a receipt, is too blurry, or the response failed
// to parse. The handler maps this to 422.
var ErrUnreadable = errors.New("receipt: could not extract structured data from image")

// normaliseCurrency uppercases and validates against the project allowlist.
// Returns ("", false) if the code is unknown.
func normaliseCurrency(code string) (string, bool) {
	return currency.Normalize(code)
}
