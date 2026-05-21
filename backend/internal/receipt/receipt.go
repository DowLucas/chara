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
	"fmt"
	"strconv"
	"strings"

	"github.com/DowLucas/quits/internal/currency"
	"github.com/DowLucas/quits/internal/money"
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
	Title         string       `json:"title"`
	Merchant      string       `json:"merchant"`
	Date          string       `json:"date"` // YYYY-MM-DD, empty if not detected
	Currency      string       `json:"currency"`
	TotalMinor    money.Amount `json:"total_minor"`
	SubtotalMinor money.Amount `json:"subtotal_minor,omitempty"`
	TaxMinor      money.Amount `json:"tax_minor,omitempty"`
	TipMinor      money.Amount `json:"tip_minor,omitempty"`
}

// Scanner takes a raw image and returns a structured receipt.
//
// imageData is the decoded image bytes (not base64). mimeType is the MIME
// type as reported by the client, e.g. "image/jpeg" or "image/png".
// language is an ISO 639-1 code naming the language the AI should generate
// the `title` field in (e.g. "en", "sv"). Empty means "use the receipt's
// own language", which is the historical behaviour.
type Scanner interface {
	Scan(ctx context.Context, imageData []byte, mimeType string, language string) (*Receipt, error)
}

// ErrUnreadable indicates the model could not extract a usable total —
// either the image is not a receipt, is too blurry, or the response failed
// to parse. The handler maps this to 422.
var ErrUnreadable = errors.New("receipt: could not extract structured data from image")

// parseDecimalToMinor converts a decimal string like "12.50" to 1250 minor
// units, assuming a 2-decimal currency. Returns (0, nil) for the empty
// string so that "field absent" stays distinguishable from "field is zero".
//
// Currencies with non-two-decimal minor units (JPY, KRW, BHD, …) are not
// supported in v1; the same constraint exists in [money.Amount].
func parseDecimalToMinor(s string) (money.Amount, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	// Tolerate "12" or "12.5" by normalising to two decimal places.
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	parts := strings.SplitN(s, ".", 2)
	major, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("receipt: invalid major part %q: %w", parts[0], err)
	}
	var minor int64
	if len(parts) == 2 {
		frac := parts[1]
		switch {
		case len(frac) == 0:
			// "12." → minor=0
		case len(frac) == 1:
			n, err := strconv.ParseInt(frac, 10, 64)
			if err != nil {
				return 0, fmt.Errorf("receipt: invalid minor part %q: %w", frac, err)
			}
			minor = n * 10
		case len(frac) >= 2:
			n, err := strconv.ParseInt(frac[:2], 10, 64)
			if err != nil {
				return 0, fmt.Errorf("receipt: invalid minor part %q: %w", frac, err)
			}
			minor = n
		}
	}
	v := major*100 + minor
	if neg {
		v = -v
	}
	return money.Amount(v), nil
}

// normaliseCurrency uppercases and validates against the project allowlist.
// Returns ("", false) if the code is unknown.
func normaliseCurrency(code string) (string, bool) {
	return currency.Normalize(code)
}
