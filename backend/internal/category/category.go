// Package category is the backend's fixed, code-defined catalog of expense
// category slugs. It intentionally mirrors app/lib/categories.ts
// EXPENSE_CATEGORIES — every slug here MUST have a matching entry (icon +
// every locale's translation key) there. Keep the two lists in sync.
//
// Categories are never free text: a group "configures its categories" by
// choosing which slugs from this fixed catalog are enabled and in what
// order (see groups.category_slugs), never by inventing new labels. That's
// what keeps every category translated correctly for every group member
// regardless of their device language.
package category

import (
	"errors"
	"fmt"
	"strings"
)

// defaultOrder is the full catalog in default display order. "general" is
// the always-present catch-all default; "other" is the always-present
// fallback for anything that doesn't fit — both stay first/last respectively
// so a group that enables a partial set still has sane bookends.
var defaultOrder = []string{
	"general",
	"food",
	"drinks",
	"groceries",
	"transport",
	"rent",
	"utilities",
	"entertainment",
	"travel",
	"shopping",
	"health",
	"kids",
	"pets",
	"gifts",
	"subscriptions",
	"insurance",
	"home",
	"sports",
	"personal_care",
	"electronics",
	"charity",
	"other",
}

var known = func() map[string]bool {
	m := make(map[string]bool, len(defaultOrder))
	for _, s := range defaultOrder {
		m[s] = true
	}
	return m
}()

// Default returns a copy of the full catalog in default display order —
// what a group with no explicit category_slugs configuration uses.
func Default() []string {
	out := make([]string, len(defaultOrder))
	copy(out, defaultOrder)
	return out
}

// IsValid reports whether slug (after trim/lowercase) is a known category.
func IsValid(slug string) bool {
	return known[normalise(slug)]
}

// Validate normalises, dedupes (keeping first occurrence), and validates a
// candidate list of slugs — e.g. a group's requested category_slugs. Returns
// an error naming the first unknown slug, or if the list is empty.
func Validate(slugs []string) ([]string, error) {
	if len(slugs) == 0 {
		return nil, errors.New("category: slugs must not be empty")
	}
	seen := make(map[string]bool, len(slugs))
	out := make([]string, 0, len(slugs))
	for _, raw := range slugs {
		s := normalise(raw)
		if !known[s] {
			return nil, fmt.Errorf("category: unknown slug %q", raw)
		}
		if seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out, nil
}

func normalise(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
