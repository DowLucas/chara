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
