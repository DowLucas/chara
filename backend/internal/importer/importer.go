// Package importer turns screenshots of another bill-splitting app's
// standings/balances screen into Chara's normalized import contract.
//
// v1 is standings-only: the extractor reads the *current net balance* per
// person relative to the importing user, not an itemized expense history.
// The pipeline is source-agnostic past extraction: only the extraction prompt
// is keyed by the source app. Member reconciliation and commit are shared.
// See docs/superpowers/specs/2026-05-28-import-from-another-app-design.md.
package importer

import (
	"context"
	"strings"
)

// Direction values for a Standing, relative to the importing ("you") user.
const (
	DirectionOwesYou = "owes_you"
	DirectionYouOwe  = "you_owe"
)

// Normalized is the adapter output returned by an Extractor and surfaced by
// the extract endpoint. Money stays a decimal string on the wire; the commit
// handler parses it to int64 minor units.
type Normalized struct {
	Currency  string     `json:"currency"`
	Standings []Standing `json:"standings"`
}

// Standing is one extracted net balance with a counterparty. Name is matched
// to a group member (or minted as a placeholder) server-side at commit time;
// the client never sees member IDs. Direction is relative to the importing
// user — "owes_you" means the counterparty owes the importer.
type Standing struct {
	Name       string  `json:"name"`
	Direction  string  `json:"direction"` // "owes_you" | "you_owe"
	Amount     string  `json:"amount"`    // canonical 2-decimal string, group currency
	Confidence float64 `json:"confidence"`
}

// Image is one screenshot to extract from.
type Image struct {
	Data     []byte // decoded image bytes (not base64)
	MIMEType string
}

// Extractor turns screenshots into the normalized contract. The seam lets
// handler tests inject a fake and never call a real vision model.
type Extractor interface {
	Extract(ctx context.Context, images []Image, source string) (Normalized, error)
}

// MergeStandings collapses standings that name the same person (case-insensitive,
// trimmed) across screenshots. The first occurrence wins, but a later
// occurrence with strictly higher confidence replaces it. Input order of the
// surviving entries is preserved. Pure: no DB, no model.
func MergeStandings(in []Standing) []Standing {
	idxByName := make(map[string]int, len(in))
	out := make([]Standing, 0, len(in))
	for _, s := range in {
		key := strings.ToLower(strings.TrimSpace(s.Name))
		if key == "" {
			continue
		}
		if i, dup := idxByName[key]; dup {
			if s.Confidence > out[i].Confidence {
				out[i] = s
			}
			continue
		}
		idxByName[key] = len(out)
		out = append(out, s)
	}
	return out
}
