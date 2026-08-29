// Package aiusage records one row per AI model call for cost analysis and
// model-quality tracking.
//
// It is deliberately fire-and-forget: telemetry must never fail a user's
// request, so Record swallows store errors and logs them instead of
// returning them. Callers do not check an error because there is nothing
// useful they could do with one.
//
// Stores NO content — no transcript, no audio, no member names, no
// amounts. See docs/superpowers/specs/2026-08-29-voice-expenses-design.md.
package aiusage

import (
	"context"
	"log/slog"

	"github.com/DowLucas/chara/internal/ulid"
)

// Outcome values for [Record.Outcome].
const (
	OutcomeOK = "ok"
	// OutcomeUnintelligible means the model could not read or hear the
	// input at all. Distinct from OutcomeNoExpense because the two need
	// different copy, and because the ratio between them says whether a
	// capture bug or a prompt problem is to blame.
	OutcomeUnintelligible = "unintelligible"
	OutcomeNoExpense      = "no_expense"
	OutcomeError          = "error"
)

// Record is one model call. Zero values mean "not applicable to this
// feature" — ClipMS is voice-only, and an unreported token count is 0.
type Record struct {
	UserID       string
	Feature      string
	GroupID      string
	Model        string
	InputTokens  int
	OutputTokens int
	ClipMS       int
	RequestBytes int
	LatencyMS    int
	Outcome      string
	ErrorClass   string

	ExpenseCount  int
	QuestionCount int
	// DegradedSplitCount and UnresolvedMemberCount count the resolver
	// catching the model: splits whose numbers did not validate, and
	// member ids that did not exist. They are the drift signal.
	DegradedSplitCount    int
	UnresolvedMemberCount int
}

// Store is the narrow database surface Recorder depends on. The db-backed
// adapter lives in the handler package alongside the other sqlc adapters.
type Store interface {
	Insert(ctx context.Context, id string, rec Record) error
}

// Recorder writes generation records. A nil *Recorder is valid and does
// nothing, which is how self-host and unit tests disable telemetry.
type Recorder struct{ store Store }

// NewRecorder wires a Recorder to the given Store.
func NewRecorder(store Store) *Recorder { return &Recorder{store: store} }

// Record persists rec and returns its generation id.
//
// The id is returned even when the write fails: the client uses it to
// report which draft fields it changed, and losing a telemetry row must
// not break that flow for the user. A nil Recorder, or one with no store,
// returns "" — callers treat that as "telemetry disabled".
func (r *Recorder) Record(ctx context.Context, rec Record) string {
	if r == nil || r.store == nil {
		return ""
	}
	id := ulid.New()
	if err := r.store.Insert(ctx, id, rec); err != nil {
		slog.Error("aiusage: insert failed", "error", err, "feature", rec.Feature)
	}
	return id
}
