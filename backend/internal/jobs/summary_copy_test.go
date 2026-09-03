package jobs

import (
	"strings"
	"testing"

	"github.com/DowLucas/chara/internal/language"
)

// The catalog must cover every code the allowlist admits. Adding a language
// to internal/language without translating the push fails here rather than
// silently delivering English to that user.
func TestSummaryCopyCoversEverySupportedLanguage(t *testing.T) {
	for _, code := range language.Supported() {
		title, body := summaryCopy(code)
		if title == "" || body == "" {
			t.Errorf("summaryCopy(%q) = (%q, %q); want copy for every supported language", code, title, body)
		}
	}
}

// The copy is static by design: Go has no localized month names and applies
// no plural rules, so anything the backend interpolated would come out in
// the wrong language or the wrong plural form.
func TestSummaryCopyInterpolatesNothing(t *testing.T) {
	for _, code := range language.Supported() {
		title, body := summaryCopy(code)
		for _, s := range []string{title, body} {
			for _, marker := range []string{"%", "{", "}", "$"} {
				if strings.Contains(s, marker) {
					t.Errorf("summaryCopy(%q) contains %q in %q; copy must be a fixed string", code, marker, s)
				}
			}
		}
	}
}

func TestSummaryCopyFallsBackToEnglish(t *testing.T) {
	wantTitle, wantBody := summaryCopy("en")
	for _, code := range []string{"", "   ", "xx", "klingon"} {
		title, body := summaryCopy(code)
		if title != wantTitle || body != wantBody {
			t.Errorf("summaryCopy(%q) = (%q, %q), want the English copy", code, title, body)
		}
	}
}

// The device sends the app's own locale names (zh-Hans, nb-NO), and regional
// tags we have no alias for must resolve to their base language.
func TestSummaryCopyResolvesRegionalCodes(t *testing.T) {
	enTitle, _ := summaryCopy("en")
	cases := map[string]string{"zh-Hans": "zh", "nb-NO": "no", "pt-BR": "pt", "SV": "sv"}
	for in, base := range cases {
		gotTitle, gotBody := summaryCopy(in)
		wantTitle, wantBody := summaryCopy(base)
		if gotTitle != wantTitle || gotBody != wantBody {
			t.Errorf("summaryCopy(%q) = (%q, %q), want the %q copy", in, gotTitle, gotBody, base)
		}
		if gotTitle == enTitle {
			t.Errorf("summaryCopy(%q) fell through to English; %q is translated", in, base)
		}
	}
}

// Every locale must be genuinely translated — a copy-pasted English row is
// the failure mode this catalog exists to prevent.
func TestSummaryCopyIsTranslatedPerLanguage(t *testing.T) {
	enTitle, enBody := summaryCopy("en")
	for _, code := range language.Supported() {
		if code == "en" {
			continue
		}
		title, body := summaryCopy(code)
		if title == enTitle || body == enBody {
			t.Errorf("summaryCopy(%q) reuses the English string", code)
		}
	}
}

// Notification shades truncate. Keep both lines short enough to survive a
// lock screen on both platforms.
func TestSummaryCopyFitsANotification(t *testing.T) {
	for _, code := range language.Supported() {
		title, body := summaryCopy(code)
		if n := len([]rune(title)); n > 40 {
			t.Errorf("summaryCopy(%q) title is %d runes, want <= 40", code, n)
		}
		if n := len([]rune(body)); n > 90 {
			t.Errorf("summaryCopy(%q) body is %d runes, want <= 90", code, n)
		}
	}
}
