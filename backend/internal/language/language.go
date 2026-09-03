// Package language is the project's allowlist of UI / AI-generated content
// languages. Mirrors the locale catalog the mobile app ships
// (app/lib/locales/<code>.json); keep them in sync.
//
// Codes are ISO 639-1 lowercase. We keep the list intentionally short — each
// added code commits us to translating UI strings on the client too, so
// adding a language should be a deliberate ship-feature decision.
package language

import (
	"sort"
	"strings"
)

// supported is the canonical set. Names are kept here only for the picker
// UI on the backend side (none today) and to document intent — the mobile
// app maintains its own user-facing labels.
var supported = map[string]string{
	"en": "English",
	"sv": "Swedish",
	"da": "Danish",
	"no": "Norwegian",
	"fi": "Finnish",
	"de": "German",
	"fr": "French",
	"es": "Spanish",
	"it": "Italian",
	"pt": "Portuguese",
	"nl": "Dutch",
	"pl": "Polish",
	"ja": "Japanese",
	"zh": "Chinese",
	"ko": "Korean",
	"ar": "Arabic",
}

// regionalAliases maps the regional codes the mobile app actually sends
// (its locale files are named zh-Hans.json, nb-NO.json) onto the base code
// this allowlist keeps. Without this the groups handler rejects a language
// the app offers in its own picker, and the user silently gets English
// AI-generated content instead.
var regionalAliases = map[string]string{
	"zh-hans": "zh",
	"zh-hant": "zh",
	"nb":      "no",
	"nb-no":   "no",
	"nn":      "no",
}

// Normalize resolves a code to its canonical allowlist entry, accepting
// regional forms (zh-Hans → zh, nb-NO → no) and any casing or padding.
// Returns ok=false for unknown codes; callers fall back to "en" themselves
// rather than having this lie about it.
//
// Store the normalized value: keeping "zh-Hans" in the database would make
// every later lookup depend on repeating this normalisation.
func Normalize(code string) (string, bool) {
	c := strings.ToLower(strings.TrimSpace(code))
	if c == "" {
		return "", false
	}
	if base, ok := regionalAliases[c]; ok {
		c = base
	} else if i := strings.IndexAny(c, "-_"); i > 0 {
		// A region we have no explicit alias for (en-GB, pt-BR): the base
		// tag is the right answer whenever it is itself supported.
		c = c[:i]
	}
	if _, ok := supported[c]; !ok {
		return "", false
	}
	return c, true
}

// IsSupported reports whether the code resolves to an allowlist entry.
// Empty / unknown returns false.
func IsSupported(code string) bool {
	_, ok := Normalize(code)
	return ok
}

// Name returns the English display name for a code. Used in AI prompts so
// the model receives "Swedish" rather than the opaque "sv". Returns the
// code unchanged when not found, which is harmless to interpolate into a
// prompt.
func Name(code string) string {
	if c, ok := Normalize(code); ok {
		return supported[c]
	}
	return code
}

// Supported returns every allowlist code, sorted. Callers that keep a
// per-locale table (push copy, for one) iterate this in a test so adding a
// language here fails loudly wherever a translation is still missing,
// rather than silently falling back to English in production.
func Supported() []string {
	out := make([]string, 0, len(supported))
	for code := range supported {
		out = append(out, code)
	}
	sort.Strings(out)
	return out
}
