// Package voice turns a spoken sentence about shared expenses into
// validated expense drafts, using a multimodal AI provider (currently
// Google Gemini).
//
// The package is provider-agnostic at the call site: handlers depend on
// the [Parser] interface so the implementation can be swapped or stubbed
// in tests. It mirrors internal/receipt, with one important addition —
// resolve.go is an explicit trust boundary. Nothing the model claims about
// money reaches a caller unchecked.
//
// The package never writes anything. It returns drafts; creating an
// expense still goes through the normal expense endpoint, which validates
// independently.
//
// Spec: docs/superpowers/specs/2026-08-29-voice-expenses-design.md
package voice

import (
	"context"
	"errors"

	"github.com/DowLucas/chara/internal/money"
)

// Member is one current member of the group, as the model sees them.
type Member struct {
	ID      string
	Name    string
	IsGhost bool
}

// Context is everything the parser needs to know about the group, all of
// it assembled server-side from the caller's token. It is never accepted
// from the client: a client-supplied roster would let a caller probe
// another group's membership, and would let them put people who are not
// members onto a split.
type Context struct {
	GroupID   string
	GroupName string
	Currency  string
	// Language is an ISO 639-1 code; generated titles are written in it so
	// every member of a group sees the same wording.
	Language   string
	Categories []string
	Members    []Member
	// CallerMemberID is the member doing the talking. This is what binds
	// "I", "me" and "my" to a real payer.
	CallerMemberID string
	// LocalDate (YYYY-MM-DD) and Timezone come from the client. The server
	// cannot know the user's day, and "yesterday" has to resolve against
	// theirs, not UTC's.
	LocalDate string
	Timezone  string
}

// HasMember reports whether id is a current member. The resolver uses it
// to reject member ids the model invented.
func (c Context) HasMember(id string) bool {
	if id == "" {
		return false
	}
	for _, m := range c.Members {
		if m.ID == id {
			return true
		}
	}
	return false
}

// CallerName is the display name of the member making the request, for
// the prompt. Returns "" if the caller is somehow not on the roster.
func (c Context) CallerName() string {
	for _, m := range c.Members {
		if m.ID == c.CallerMemberID {
			return m.Name
		}
	}
	return ""
}

// MemberShare is one member's validated slice of an expense.
type MemberShare struct {
	MemberID string
	Share    money.Amount
}

// MemberPct is one member's validated percentage, in basis points
// (10000 == 100%), matching internal/split.
type MemberPct struct {
	MemberID    string
	BasisPoints int
}

// Draft is one proposed expense, after resolution. Every field has been
// checked against the group: member ids exist, the currency and category
// are known, and Shares were recomputed by internal/split rather than
// copied from the model.
type Draft struct {
	// SourcePhrase is the words from the transcript that produced this
	// draft. The app shows it against the draft — that traceability is
	// what makes a multi-expense result trustworthy enough to accept
	// without re-checking every field.
	SourcePhrase string
	Title        string
	Currency     string
	Category     string
	Date         string
	AmountMinor  money.Amount
	PaidByID     string
	SplitMethod  string
	Participants []string
	Shares       []MemberShare
	// Percentages is set only for a validated percentage split. Carrying
	// them is what lets the client show "Alex 25%" instead of a bare
	// 250.00 — the amounts alone cannot say whether the user asked for a
	// proportion or typed a number, and re-deriving one from rounded minor
	// units is guesswork the server can avoid, having already validated
	// the real values.
	Percentages []MemberPct
	// LowConfidence names fields the resolver had to guess or fall back
	// on, so the UI can flag them.
	LowConfidence []string
}

// QuestionOption is one answer the user can pick.
//
// Question and Answer cross the wire in BOTH directions — decoded from the
// model, encoded to the app, then decoded back from the app on the clarify
// re-post — so the json tags are load-bearing.
type QuestionOption struct {
	MemberID string `json:"member_id"`
	Label    string `json:"label"`
}

// Question is an ambiguity the model refused to guess at.
type Question struct {
	ID      string           `json:"id"`
	Text    string           `json:"text"`
	Options []QuestionOption `json:"options"`
}

// Answer is the user's reply to a Question, sent back on the clarify
// re-post.
type Answer struct {
	QuestionID string `json:"question_id"`
	MemberID   string `json:"member_id"`
	Text       string `json:"text"`
}

// Usage is the token accounting the provider reports for one call. Zero
// means it was not reported.
type Usage struct {
	InputTokens  int
	OutputTokens int
}

// Result is one parse.
type Result struct {
	Transcript string
	Drafts     []Draft
	Questions  []Question
	Usage      Usage
	// DegradedSplits counts splits whose numbers did not validate and fell
	// back to equal; UnresolvedMembers counts member ids that did not
	// exist. Both measure the resolver catching the model, and are the
	// first signal that a prompt or model upgrade has drifted.
	DegradedSplits    int
	UnresolvedMembers int
}

// Parser extracts drafts from an utterance.
//
// The two methods are separate because the calls differ in more than their
// input: ParseText is the clarify re-post — cheap, no audio, and
// deliberately not metered.
type Parser interface {
	Parse(ctx context.Context, audio []byte, mimeType string, vc Context, answers []Answer) (*Result, error)
	ParseText(ctx context.Context, transcript string, vc Context, answers []Answer) (*Result, error)
}

var (
	// ErrUnintelligible means the model could not make out the speech.
	ErrUnintelligible = errors.New("voice: unintelligible")
	// ErrNoExpense means the speech was clear but contained no expense.
	ErrNoExpense = errors.New("voice: no expense in utterance")
	// ErrSettlement means the speaker described paying someone back.
	// Distinct from ErrNoExpense because the app points at the settle
	// flow rather than claiming it heard nothing.
	ErrSettlement = errors.New("voice: utterance describes a settlement")
)
