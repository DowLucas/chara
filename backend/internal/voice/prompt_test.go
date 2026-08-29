package voice

import (
	"strings"
	"testing"
)

func TestBuildPromptIncludesRosterAndContext(t *testing.T) {
	p := buildPrompt(testContext(), nil)
	for _, want := range []string{"m1", "Lucas", "m2", "Anna", "m3", "Sara", "SEK", "2026-08-29", "food"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt is missing %q", want)
		}
	}
}

func TestBuildPromptMarksTheSpeaker(t *testing.T) {
	p := buildPrompt(testContext(), nil)
	// The line carrying the caller's id must say they are the speaker,
	// otherwise "I paid" cannot bind to a real member.
	var speakerLine string
	for _, line := range strings.Split(p, "\n") {
		if strings.Contains(line, "SPEAKER") {
			speakerLine = line
		}
	}
	if speakerLine == "" {
		t.Fatal("no line identifies the speaker")
	}
	if !strings.Contains(speakerLine, "m1") {
		t.Errorf("speaker line %q does not carry the caller's member id", speakerLine)
	}
}

func TestBuildPromptDoesNotLeakOtherGroupsCategories(t *testing.T) {
	p := buildPrompt(testContext(), nil)
	// "rent" is a real category the fixture group has NOT enabled.
	if strings.Contains(p, `"rent"`) {
		t.Error("prompt offers a category this group has not enabled")
	}
}

func TestBuildPromptIncludesAnswers(t *testing.T) {
	p := buildPrompt(testContext(), []Answer{
		{QuestionID: "q1", MemberID: "m2", Text: "Anna Lind"},
	})
	if !strings.Contains(p, "Anna Lind") {
		t.Error("prompt does not carry the user's clarification answers")
	}
	if !strings.Contains(p, "q1") {
		t.Error("prompt does not carry the question id the answer belongs to")
	}
}

func TestBuildPromptOmitsAnswerSectionWhenThereAreNone(t *testing.T) {
	if strings.Contains(buildPrompt(testContext(), nil), "ALREADY ANSWERED") {
		t.Error("prompt has an answers section with no answers")
	}
}

func TestBuildPromptLocalisesTitles(t *testing.T) {
	vc := testContext()
	vc.Language = "sv"
	if !strings.Contains(buildPrompt(vc, nil), "Swedish") {
		t.Error("prompt does not ask for titles in the group's language")
	}
}

// The schema is what stops the model dropping fields the resolver needs;
// receipt's own schema comment records that lesson.
func TestResponseSchemaRequiresLoadBearingFields(t *testing.T) {
	s := responseSchema()
	top, _ := s["required"].([]string)
	for _, want := range []string{"transcript", "expenses", "questions"} {
		if !hasStr(top, want) {
			t.Errorf("top-level required is missing %q (got %v)", want, top)
		}
	}

	props := s["properties"].(map[string]any)
	expenses := props["expenses"].(map[string]any)
	item := expenses["items"].(map[string]any)
	req, _ := item["required"].([]string)
	for _, want := range []string{"source_phrase", "amount", "paid_by_member_id", "split_method", "participant_member_ids"} {
		if !hasStr(req, want) {
			t.Errorf("expense required is missing %q (got %v)", want, req)
		}
	}
}

// ── Multilingual guarantees ───────────────────────────────────────────
//
// These pin instructions the resolver depends on. The decimal-separator
// rule in particular is load-bearing: money.ParseDecimal rejects commas,
// so a German or Swedish speaker's "12,50" would be dropped as "no usable
// amount" if the prompt ever stopped demanding a period.

func TestPromptDemandsPeriodDecimalSeparator(t *testing.T) {
	p := buildPrompt(testContext(), nil)
	low := strings.ToLower(p)
	if !strings.Contains(low, "comma") {
		t.Error("prompt does not mention commas; a spoken \"12,50\" would be dropped")
	}
	if !strings.Contains(low, "period") && !strings.Contains(low, "full stop") {
		t.Error("prompt does not demand a period as the decimal separator")
	}
}

func TestPromptAllowsAnySpokenLanguage(t *testing.T) {
	low := strings.ToLower(buildPrompt(testContext(), nil))
	if !strings.Contains(low, "any language") {
		t.Error("prompt does not tell the model the speaker may use any language")
	}
}

func TestPromptKeepsTranscriptInTheSpokenLanguage(t *testing.T) {
	low := strings.ToLower(buildPrompt(testContext(), nil))
	// The user has to be able to read and correct their own words.
	if !strings.Contains(low, "do not translate") {
		t.Error("prompt does not forbid translating the transcript")
	}
}

func TestPromptPinsTitleToTheGroupLanguageRegardlessOfSpeech(t *testing.T) {
	vc := testContext()
	vc.Language = "sv"
	p := buildPrompt(vc, nil)
	if !strings.Contains(p, "Swedish") {
		t.Fatal("prompt does not name the group language")
	}
	if !strings.Contains(strings.ToLower(p), "regardless") {
		t.Error("prompt does not pin the title to the group language regardless of what was spoken")
	}
}

func TestPromptCoversSpokenNumeralsAndColloquialCurrency(t *testing.T) {
	low := strings.ToLower(buildPrompt(testContext(), nil))
	if !strings.Contains(low, "spoken") || !strings.Contains(low, "digits") {
		t.Error("prompt does not require spoken numerals to become digits")
	}
	// A Swede says "spänn"; an American says "bucks". Both mean a currency.
	if !strings.Contains(low, "kronor") && !strings.Contains(low, "colloquial") {
		t.Error("prompt gives no guidance on colloquial currency words")
	}
}

// Arabic is the case that motivated the allowlist fix; the prompt must be
// able to name it rather than falling back to "the speaker's own language".
func TestPromptNamesArabicAsAGroupLanguage(t *testing.T) {
	vc := testContext()
	vc.Language = "ar"
	if !strings.Contains(buildPrompt(vc, nil), "Arabic") {
		t.Error("prompt does not name Arabic as the group language")
	}
}

func TestPromptAsksForReasoningInTheUILanguage(t *testing.T) {
	vc := testContext()
	vc.Language = "en"   // group language — titles
	vc.UILanguage = "sv" // the recorder's own app language — reasoning
	p := buildPrompt(vc, nil)

	if !strings.Contains(p, "reasoning") {
		t.Error("prompt does not ask for a reasoning field")
	}
	if !strings.Contains(p, "Swedish") {
		t.Error("prompt does not name the UI language for the reasoning")
	}
}

// Reasoning explains an interpretation, so the inclusion decision is the
// part that has to be covered — that is where a wrong reading hides.
func TestPromptTellsReasoningToExplainWhoIsIncluded(t *testing.T) {
	low := strings.ToLower(buildPrompt(testContext(), nil))
	if !strings.Contains(low, "who is included") && !strings.Contains(low, "included") {
		t.Error("prompt does not require reasoning to cover who is on the split")
	}
}

func TestPromptFallsBackToTheGroupLanguageForReasoning(t *testing.T) {
	vc := testContext()
	vc.Language = "sv"
	vc.UILanguage = "" // client did not send one
	if !strings.Contains(buildPrompt(vc, nil), "Swedish") {
		t.Error("with no UI language the reasoning should follow the group language")
	}
}

func TestResponseSchemaRequiresReasoning(t *testing.T) {
	props := responseSchema()["properties"].(map[string]any)
	item := props["expenses"].(map[string]any)["items"].(map[string]any)
	if _, ok := item["properties"].(map[string]any)["reasoning"]; !ok {
		t.Fatal("schema has no reasoning property")
	}
	req, _ := item["required"].([]string)
	if !hasStr(req, "reasoning") {
		t.Errorf("reasoning is not required (got %v) — the model will drop it", req)
	}
}
