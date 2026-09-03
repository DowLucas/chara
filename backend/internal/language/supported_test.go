package language

import (
	"sort"
	"testing"
)

func TestSupportedListsEveryAllowlistEntryOnce(t *testing.T) {
	got := Supported()
	if len(got) != len(supported) {
		t.Fatalf("Supported() returned %d codes, want %d", len(got), len(supported))
	}
	seen := map[string]bool{}
	for _, c := range got {
		if seen[c] {
			t.Errorf("Supported() repeats %q", c)
		}
		seen[c] = true
		if _, ok := supported[c]; !ok {
			t.Errorf("Supported() returned %q, which is not an allowlist entry", c)
		}
	}
}

// Callers use the list to build per-locale tables and to iterate in tests;
// a stable order keeps those outputs diffable.
func TestSupportedIsSorted(t *testing.T) {
	got := Supported()
	if !sort.StringsAreSorted(got) {
		t.Errorf("Supported() = %v, want sorted", got)
	}
}

// The returned slice must not alias the package state.
func TestSupportedIsACopy(t *testing.T) {
	first := Supported()
	first[0] = "mutated"
	if second := Supported(); second[0] == "mutated" {
		t.Error("Supported() hands out a slice that shares backing state")
	}
}
