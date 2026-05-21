// Package language is the project's allowlist of UI / AI-generated content
// languages. Mirrors the locale catalog the mobile app ships
// (app/lib/locales/<code>.json); keep them in sync.
//
// Codes are ISO 639-1 lowercase. We keep the list intentionally short — each
// added code commits us to translating UI strings on the client too, so
// adding a language should be a deliberate ship-feature decision.
package language

import "strings"

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
}

// IsSupported reports whether the code is in the allowlist. Empty / unknown
// returns false — callers should fall back to "en" themselves rather than
// having IsSupported lie about it.
func IsSupported(code string) bool {
	_, ok := supported[strings.ToLower(strings.TrimSpace(code))]
	return ok
}

// Name returns the English display name for a code. Used in AI prompts so
// the model receives "Swedish" rather than the opaque "sv". Returns the
// code unchanged when not found, which is harmless to interpolate into a
// prompt.
func Name(code string) string {
	if n, ok := supported[strings.ToLower(strings.TrimSpace(code))]; ok {
		return n
	}
	return code
}
