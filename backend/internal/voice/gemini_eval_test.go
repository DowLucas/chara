//go:build geminieval

// This file is a manually-run extraction quality eval, not a regular unit
// test. It calls the real Gemini API (real, billed requests) with
// GeminiParser directly — no Postgres, no HTTP server, no auth — because
// the thing under test is basePrompt's behaviour on real speech, not the
// handler plumbing. It is gated behind the "geminieval" build tag so it
// never runs in CI or in a plain `go test ./...`, and each test skips if
// GEMINI_API_KEY is unset or the fixture is missing. Run with:
//
//	cd backend && set -a && . ./.env.local && set +a && \
//	  go test -tags geminieval ./internal/voice/ -run TestVoiceEval -v
//
// FIXTURES ARE NOT IN THE REPO — they are recordings, and they have to be
// made by a person. Record each clip below as mono Opus at ~24 kbps into
// internal/voice/testdata/. Any missing file skips its test rather than
// failing, so a partial set is useful immediately. For example:
//
//	ffmpeg -f pulse -i default -ac 1 -c:a libopus -b:a 24k \
//	  internal/voice/testdata/en_single.ogg
package voice

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// evalContext is the group every eval clip is spoken into. Lucas is the
// speaker; Johan exists for the code-switch clip.
func evalContext() Context {
	return Context{
		GroupID: "g_eval", GroupName: "Eval Trip", Currency: "SEK", Language: "en",
		Categories: []string{"food", "drinks", "groceries", "transport", "travel"},
		Members: []Member{
			{ID: "m1", Name: "Lucas"},
			{ID: "m2", Name: "Anna"},
			{ID: "m3", Name: "Sara"},
			{ID: "m4", Name: "Johan"},
		},
		CallerMemberID: "m1",
		LocalDate:      "2026-08-29",
		Timezone:       "Europe/Stockholm",
	}
}

// evalParse loads a fixture and runs it through the real API. Skips when
// the key or the recording is absent.
func evalParse(t *testing.T, fixture string) *Result {
	t.Helper()
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	path := filepath.Join("testdata", fixture)
	audio, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		t.Skipf("fixture %s not recorded yet — see this file's header", path)
	}
	require.NoError(t, err)

	res, err := NewGemini(key).Parse(context.Background(), audio, "audio/ogg", evalContext(), nil)
	require.NoError(t, err)
	return res
}

// ── Text evals ────────────────────────────────────────────────────────
//
// These need NO recordings: ParseText runs the same prompt through the
// same resolver as the audio path, so they exercise everything except
// transcription. Run them whenever the prompt changes; the audio evals
// below add speech recognition on top.

func evalText(t *testing.T, sentence string) *Result {
	t.Helper()
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	res, err := NewGemini(key).ParseText(context.Background(), sentence, evalContext(), nil)
	require.NoError(t, err)
	return res
}

func TestVoiceEval_Text_SingleExpense(t *testing.T) {
	got := evalText(t, "I paid 480 for dinner with Anna and Sara")

	require.Len(t, got.Drafts, 1)
	d := got.Drafts[0]
	assert.EqualValues(t, 48000, d.AmountMinor)
	assert.Equal(t, "m1", d.PaidByID, `"I paid" must bind to the speaker`)
	assert.Equal(t, "equal", d.SplitMethod)
	assert.Len(t, d.Participants, 3)
	assert.Zero(t, got.UnresolvedMembers)
}

func TestVoiceEval_Text_TwoExpensesDifferentPayers(t *testing.T) {
	got := evalText(t, "I paid 340 for drinks and Anna paid 120 for the taxi")

	require.Len(t, got.Drafts, 2, "one sentence, two expenses")
	byPayer := map[string]int64{}
	for _, d := range got.Drafts {
		byPayer[d.PaidByID] = int64(d.AmountMinor)
	}
	assert.EqualValues(t, 34000, byPayer["m1"])
	assert.EqualValues(t, 12000, byPayer["m2"], "Anna must be the taxi payer")
}

func TestVoiceEval_Text_EveryoneExcept(t *testing.T) {
	got := evalText(t, "Groceries 620, everyone except Johan")

	require.Len(t, got.Drafts, 1)
	assert.EqualValues(t, 62000, got.Drafts[0].AmountMinor)
	assert.NotContains(t, got.Drafts[0].Participants, "m4", "Johan was excluded")
	assert.Len(t, got.Drafts[0].Participants, 3)
}

func TestVoiceEval_Text_ExactSplitFromTwoDishes(t *testing.T) {
	got := evalText(t, "Anna had the steak at 250 and I had the pasta at 180")

	require.Len(t, got.Drafts, 1, "two dishes, one bill")
	d := got.Drafts[0]
	assert.EqualValues(t, 43000, d.AmountMinor)
	assert.Equal(t, "exact", d.SplitMethod)
	assert.Zero(t, got.DegradedSplits, "the model's own arithmetic should validate")
}

func TestVoiceEval_Text_PercentageSplit(t *testing.T) {
	got := evalText(t, "Split the 900 hotel 70/30 between me and Johan")

	require.Len(t, got.Drafts, 1)
	byID := map[string]int64{}
	for _, s := range got.Drafts[0].Shares {
		byID[s.MemberID] = int64(s.Share)
	}
	assert.EqualValues(t, 63000, byID["m1"])
	assert.EqualValues(t, 27000, byID["m4"])
}

func TestVoiceEval_Text_ForeignCurrency(t *testing.T) {
	got := evalText(t, "The hotel was 40 euros, just me")

	require.Len(t, got.Drafts, 1)
	assert.Equal(t, "EUR", got.Drafts[0].Currency)
	assert.EqualValues(t, 4000, got.Drafts[0].AmountMinor)
}

func TestVoiceEval_Text_SwedishExactSplit(t *testing.T) {
	got := evalText(t, "Anna tog biffen för 250, jag tog pastan för 180")

	require.Len(t, got.Drafts, 1)
	assert.EqualValues(t, 43000, got.Drafts[0].AmountMinor)
	assert.Equal(t, "exact", got.Drafts[0].SplitMethod)
}

func TestVoiceEval_Text_AmbiguousNameAsksRatherThanGuessing(t *testing.T) {
	// Two Annas: the model must ask, not pick one silently.
	vc := evalContext()
	vc.Members = append(vc.Members, Member{ID: "m5", Name: "Anna Svensson"})
	vc.Members[1].Name = "Anna Lind"

	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	got, err := NewGemini(key).ParseText(context.Background(), "Anna paid 120 for the taxi", vc, nil)
	require.NoError(t, err)
	assert.NotEmpty(t, got.Questions, "an ambiguous name must produce a question")
}

func TestVoiceEval_Text_RepaymentIsASettlement(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	_, err := NewGemini(key).ParseText(context.Background(), "I paid Anna back 200", evalContext(), nil)
	assert.ErrorIs(t, err, ErrSettlement,
		"a repayment must point at the settle flow, not become an expense")
}

func TestVoiceEval_Text_NoExpense(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	_, err := NewGemini(key).ParseText(context.Background(), "the weather is nice today", evalContext(), nil)
	assert.ErrorIs(t, err, ErrNoExpense)
}

// ── Audio evals (need recorded fixtures) ──────────────────────────────

// "I paid four hundred and eighty for dinner with Anna and Sara"
func TestVoiceEval_EnglishSingleExpense(t *testing.T) {
	got := evalParse(t, "en_single.ogg")

	require.Len(t, got.Drafts, 1)
	d := got.Drafts[0]
	assert.EqualValues(t, 48000, d.AmountMinor)
	assert.Equal(t, "m1", d.PaidByID, `"I paid" must bind to the speaker`)
	assert.Equal(t, "equal", d.SplitMethod)
	assert.Len(t, d.Participants, 3)
	assert.NotEmpty(t, d.SourcePhrase)
	assert.Zero(t, got.UnresolvedMembers, "Anna and Sara are on the roster")
}

// "I paid 340 for drinks and Anna paid 120 for the taxi"
func TestVoiceEval_EnglishTwoExpensesDifferentPayers(t *testing.T) {
	got := evalParse(t, "en_multi.ogg")

	require.Len(t, got.Drafts, 2, "one utterance, two expenses")
	byPayer := map[string]int64{}
	for _, d := range got.Drafts {
		byPayer[d.PaidByID] = int64(d.AmountMinor)
	}
	assert.EqualValues(t, 34000, byPayer["m1"])
	assert.EqualValues(t, 12000, byPayer["m2"], "Anna must be the taxi payer")
}

// "Jag betalade 620 för mat, delat på alla"
func TestVoiceEval_SwedishWholeGroup(t *testing.T) {
	got := evalParse(t, "sv_single.ogg")

	require.Len(t, got.Drafts, 1)
	assert.EqualValues(t, 62000, got.Drafts[0].AmountMinor)
	assert.Len(t, got.Drafts[0].Participants, 4, `"delat på alla" is everyone`)
}

// "Anna tog biffen för 250, jag tog pastan för 180"
func TestVoiceEval_SwedishExactSplit(t *testing.T) {
	got := evalParse(t, "sv_exact.ogg")

	require.Len(t, got.Drafts, 1, "two dishes, one bill")
	d := got.Drafts[0]
	assert.EqualValues(t, 43000, d.AmountMinor)
	assert.Equal(t, "exact", d.SplitMethod)
	assert.Zero(t, got.DegradedSplits, "the model's own arithmetic should validate")

	byID := map[string]int64{}
	for _, s := range d.Shares {
		byID[s.MemberID] = int64(s.Share)
	}
	assert.EqualValues(t, 25000, byID["m2"])
	assert.EqualValues(t, 18000, byID["m1"])
}

// "Jag betalade 400 for the hotel, split 70/30 with Johan"
func TestVoiceEval_CodeSwitchedPercentage(t *testing.T) {
	got := evalParse(t, "mixed_code_switch.ogg")

	require.Len(t, got.Drafts, 1)
	d := got.Drafts[0]
	assert.EqualValues(t, 40000, d.AmountMinor)
	assert.Equal(t, "percentage", d.SplitMethod)

	byID := map[string]int64{}
	for _, s := range d.Shares {
		byID[s.MemberID] = int64(s.Share)
	}
	assert.EqualValues(t, 28000, byID["m1"])
	assert.EqualValues(t, 12000, byID["m4"])
}

// "I paid Anna back 200" — a repayment, not an expense.
func TestVoiceEval_RepaymentIsASettlementNotAnExpense(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY not set")
	}
	path := filepath.Join("testdata", "en_settlement.ogg")
	audio, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		t.Skipf("fixture %s not recorded yet — see this file's header", path)
	}
	require.NoError(t, err)

	_, err = NewGemini(key).Parse(context.Background(), audio, "audio/ogg", evalContext(), nil)
	assert.ErrorIs(t, err, ErrSettlement,
		"a repayment must point at the settle flow, not become an expense")
}
