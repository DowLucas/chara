package voice

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// geminiStub replies with one canned generateContent response and records
// the request body it received.
func geminiStub(t *testing.T, payload string) (*httptest.Server, *string) {
	t.Helper()
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen = string(b)
		if got := r.Header.Get("x-goog-api-key"); got != "k" {
			t.Errorf("api key header = %q, want k", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, payload)
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

// wrap embeds inner as the candidate's text part, the way Gemini returns
// structured JSON.
func wrap(inner string) string {
	b, _ := json.Marshal(inner)
	return `{"candidates":[{"content":{"parts":[{"text":` + string(b) + `}]}}],` +
		`"usageMetadata":{"promptTokenCount":1500,"candidatesTokenCount":300}}`
}

const oneExpense = `{"transcript":"I paid 480 for dinner with Anna and Sara",` +
	`"expenses":[{"source_phrase":"I paid 480 for dinner","title":"Dinner","amount":"480.00",` +
	`"currency":"SEK","category":"food","date":"2026-08-29","paid_by_member_id":"m1",` +
	`"split_method":"equal","participant_member_ids":["m1","m2","m3"],"shares":[],"percentages":[]}],` +
	`"questions":[]}`

func TestParseReturnsResolvedDrafts(t *testing.T) {
	srv, seen := geminiStub(t, wrap(oneExpense))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))

	got, err := p.Parse(context.Background(), []byte("audio"), "audio/ogg", testContext(), nil)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if got.Transcript == "" {
		t.Error("transcript is empty")
	}
	if len(got.Drafts) != 1 {
		t.Fatalf("got %d drafts, want 1", len(got.Drafts))
	}
	if got.Drafts[0].AmountMinor != 48000 {
		t.Errorf("AmountMinor = %d, want 48000", got.Drafts[0].AmountMinor)
	}
	if sharesSum(got.Drafts[0].Shares) != 48000 {
		t.Errorf("shares sum to %d, want 48000", sharesSum(got.Drafts[0].Shares))
	}
	if got.Usage.InputTokens != 1500 || got.Usage.OutputTokens != 300 {
		t.Errorf("usage = %+v, want 1500/300", got.Usage)
	}
	// The roster must actually reach the model, or nothing else works.
	if !strings.Contains(*seen, "m2") {
		t.Error("request body does not contain the roster")
	}
	if !strings.Contains(*seen, "audio/ogg") {
		t.Error("request body does not declare the audio mime type")
	}
}

func TestParseSurfacesUnintelligible(t *testing.T) {
	srv, _ := geminiStub(t, wrap(`{"error":"unintelligible"}`))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))
	if _, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil); err != ErrUnintelligible {
		t.Errorf("err = %v, want ErrUnintelligible", err)
	}
}

func TestParseSurfacesNoExpense(t *testing.T) {
	srv, _ := geminiStub(t, wrap(`{"error":"no_expense"}`))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))
	if _, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil); err != ErrNoExpense {
		t.Errorf("err = %v, want ErrNoExpense", err)
	}
}

func TestParseSurfacesSettlement(t *testing.T) {
	// "I paid Anna back 200" must not read as "I heard nothing" — the app
	// points at the settle flow instead.
	srv, _ := geminiStub(t, wrap(`{"error":"settlement"}`))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))
	if _, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil); err != ErrSettlement {
		t.Errorf("err = %v, want ErrSettlement", err)
	}
}

func TestParseTreatsZeroSurvivingDraftsAsNoExpense(t *testing.T) {
	// Well-formed but empty, and "every draft was dropped by the resolver",
	// mean the same thing to a user.
	for name, payload := range map[string]string{
		"empty":        `{"transcript":"nice weather","expenses":[],"questions":[]}`,
		"all-unusable": `{"transcript":"hmm","expenses":[{"title":"X","amount":"0.00","paid_by_member_id":"m1","participant_member_ids":["m1"]}],"questions":[]}`,
	} {
		t.Run(name, func(t *testing.T) {
			srv, _ := geminiStub(t, wrap(payload))
			p := NewGemini("k", WithGeminiBaseURL(srv.URL))
			if _, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil); err != ErrNoExpense {
				t.Errorf("err = %v, want ErrNoExpense", err)
			}
		})
	}
}

func TestParseCarriesQuestionsThrough(t *testing.T) {
	payload := `{"transcript":"Anna paid 120","expenses":[{"source_phrase":"Anna paid 120",` +
		`"title":"Taxi","amount":"120.00","currency":"SEK","paid_by_member_id":"m2",` +
		`"split_method":"equal","participant_member_ids":["m1","m2"]}],` +
		`"questions":[{"id":"q1","text":"Which Anna?","options":[{"member_id":"m2","label":"Anna Lind"}]}]}`
	srv, _ := geminiStub(t, wrap(payload))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))

	got, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if len(got.Questions) != 1 {
		t.Fatalf("got %d questions, want 1", len(got.Questions))
	}
	if got.Questions[0].ID != "q1" || len(got.Questions[0].Options) != 1 {
		t.Errorf("question = %+v, want q1 with one option", got.Questions[0])
	}
}

func TestParseReportsResolverCounters(t *testing.T) {
	// A hallucinated payer and a non-summing exact split must reach the
	// caller as counters, so they land in ai_generations.
	payload := `{"transcript":"x","expenses":[{"source_phrase":"x","title":"Dinner","amount":"430.00",` +
		`"currency":"SEK","paid_by_member_id":"m99","split_method":"exact",` +
		`"participant_member_ids":["m1","m2"],` +
		`"shares":[{"member_id":"m1","amount":"180.00"},{"member_id":"m2","amount":"200.00"}]}],"questions":[]}`
	srv, _ := geminiStub(t, wrap(payload))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))

	got, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if got.UnresolvedMembers != 1 {
		t.Errorf("UnresolvedMembers = %d, want 1", got.UnresolvedMembers)
	}
	if got.DegradedSplits != 1 {
		t.Errorf("DegradedSplits = %d, want 1", got.DegradedSplits)
	}
}

// A clarify re-post carries no audio: it must still work, and must not
// send an empty inline_data part.
func TestParseAcceptsTranscriptOnlyRepost(t *testing.T) {
	srv, seen := geminiStub(t, wrap(oneExpense))
	p := NewGemini("k", WithGeminiBaseURL(srv.URL))

	vc := testContext()
	got, err := p.ParseText(context.Background(), "I paid 480 for dinner", vc,
		[]Answer{{QuestionID: "q1", MemberID: "m2", Text: "Anna Lind"}})
	if err != nil {
		t.Fatalf("ParseText returned error: %v", err)
	}
	if len(got.Drafts) != 1 {
		t.Fatalf("got %d drafts, want 1", len(got.Drafts))
	}
	if strings.Contains(*seen, "inline_data") {
		t.Error("text re-post must not send an inline_data part")
	}
	if !strings.Contains(*seen, "Anna Lind") {
		t.Error("text re-post does not carry the answers")
	}
}

func TestParseRejectsEmptyAudio(t *testing.T) {
	p := NewGemini("k")
	if _, err := p.Parse(context.Background(), nil, "audio/ogg", testContext(), nil); err == nil {
		t.Error("Parse(nil audio) = nil error, want error")
	}
}

func TestParseMapsUpstreamFailureToAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `{"error":{"code":500,"message":"boom","status":"INTERNAL"}}`)
	}))
	defer srv.Close()

	p := NewGemini("k", WithGeminiBaseURL(srv.URL))
	_, err := p.Parse(context.Background(), []byte("a"), "audio/ogg", testContext(), nil)
	if err == nil {
		t.Fatal("Parse returned nil error on a 500")
	}
	if err == ErrUnintelligible || err == ErrNoExpense || err == ErrSettlement {
		t.Errorf("err = %v, want a transport error, not a user-facing sentinel", err)
	}
}
