package language

import "testing"

func TestIsSupportedCoversEveryLocaleTheAppShips(t *testing.T) {
	// These are the codes app/lib/i18n.ts registers in SUPPORTED_LANGUAGES.
	// A group's AI-content language cannot be set to a code this package
	// rejects — the groups handler returns 400 — so any drift here means a
	// user with that UI language gets English AI output.
	for _, code := range []string{
		"en", "sv", "de", "fr", "it", "nl", "da", "fi", "ar", "ja", "zh-Hans",
	} {
		if !IsSupported(code) {
			t.Errorf("IsSupported(%q) = false; the app ships this locale", code)
		}
	}
}

func TestNormalizeMapsRegionalCodesToTheirBase(t *testing.T) {
	cases := map[string]string{
		"zh-Hans": "zh",
		"zh-hant": "zh",
		"nb-NO":   "no",
		"nb":      "no",
		"pt-BR":   "pt",
		"en-GB":   "en",
		"SV":      "sv",
		"  fi  ":  "fi",
	}
	for in, want := range cases {
		got, ok := Normalize(in)
		if !ok {
			t.Errorf("Normalize(%q) = not ok, want %q", in, want)
			continue
		}
		if got != want {
			t.Errorf("Normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeRejectsUnknown(t *testing.T) {
	for _, in := range []string{"", "  ", "xx", "klingon", "e"} {
		if got, ok := Normalize(in); ok {
			t.Errorf("Normalize(%q) = %q, true; want not ok", in, got)
		}
	}
}

func TestNameResolvesRegionalCodes(t *testing.T) {
	if got := Name("zh-Hans"); got != "Chinese" {
		t.Errorf("Name(zh-Hans) = %q, want Chinese", got)
	}
	if got := Name("ar"); got != "Arabic" {
		t.Errorf("Name(ar) = %q, want Arabic", got)
	}
	// Unknown stays harmless to interpolate into a prompt.
	if got := Name("klingon"); got != "klingon" {
		t.Errorf("Name(klingon) = %q, want it echoed back", got)
	}
}
