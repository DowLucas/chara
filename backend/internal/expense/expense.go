// Package expense holds the single write path for creating an expense row.
// Both the HTTP handler and the recurring-fire River job call Create.
// See docs/superpowers/specs/2026-05-24-recurring-expenses-design.md.
package expense

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/ulid"
)

// Activity event/entity constants. These mirror the canonical strings in
// internal/handler/activity_write.go — kept duplicated (not imported) to
// avoid an import cycle between `expense` and `handler`. The handler
// package's identical constants remain the source-of-truth for the wire
// format; if those ever change, change these too.
const (
	eventExpenseAdded = "expense_added"
	entityExpense     = "expense"
)

// Input is the minimal data needed to create an expense in a single tx.
// Consumed by the HTTP handler (after request parsing) and the
// recurring-fire job (after projecting a Rule into an Input).
//
// Amount/Currency MUST already be the canonical group-currency values —
// the helper does not run FX conversion. FX-snapshot fields are written
// verbatim when set; leave them zero-valued for same-currency expenses.
//
// Splits MUST already be resolved to per-member minor-unit shares that
// sum to AmountMinor — the helper does not run split math. SplitMethod
// is stored on the expense row but not re-applied to Splits.
type Input struct {
	GroupID         string
	Title           string
	AmountMinor     int64
	Currency        string
	PaidByMemberID  string
	SplitMethod     string // 'equal' | 'exact' | 'percentage'
	Splits          []SplitInput
	Category        string
	Notes           *string
	ExpenseDate     time.Time
	IsReimbursement bool
	CreatedByUserID string

	// Optional FX snapshot. All five fields are written together when
	// OriginalCurrency.Valid is true. Leave zero-valued for same-currency
	// expenses.
	OriginalAmount   pgtype.Int8
	OriginalCurrency pgtype.Text
	FxRate           pgtype.Numeric
	FxAsOf           pgtype.Date
	FxSource         pgtype.Text

	// Source pointers for materialized rows. Reserved for Phase 3 once the
	// expenses table grows source_kind/source_id columns — Create currently
	// ignores them so call sites can be wired today without a follow-up
	// patch.
	SourceKind *string // nil for manual; "recurring" for materialized
	SourceID   *string
}

// SplitInput is one row of expense_splits. Value is the resolved share in
// canonical (group-currency) minor units. Splits across one expense must
// sum to Input.AmountMinor.
type SplitInput struct {
	MemberID string
	Value    int64
}

// Created is what Create returns. Row + Splits are the freshly-written
// db rows so callers can build a response without re-querying.
type Created struct {
	ExpenseID string
	Row       db.CreateExpenseRow
	Splits    []db.ExpenseSplit
}

// Create writes one expense + its splits + the activity log row in tx.
// Caller owns tx lifecycle. Caller is responsible for input validation
// beyond shape (membership, group-lock, currency match, etc.) — Create
// trusts its Input.
//
// in.SourceKind / in.SourceID are written when non-nil (e.g. "recurring"
// + rule id for materialized rows). Manual expenses leave them nil.
func Create(ctx context.Context, tx pgx.Tx, q *db.Queries, in Input) (Created, error) {
	qtx := q.WithTx(tx)

	notes := pgtype.Text{Valid: in.Notes != nil}
	if in.Notes != nil {
		notes.String = *in.Notes
	}

	sourceKind := pgtype.Text{}
	if in.SourceKind != nil {
		sourceKind = pgtype.Text{String: *in.SourceKind, Valid: true}
	}
	sourceID := pgtype.Text{}
	if in.SourceID != nil {
		sourceID = pgtype.Text{String: *in.SourceID, Valid: true}
	}

	expense, err := qtx.CreateExpense(ctx, db.CreateExpenseParams{
		ID:               ulid.New(),
		GroupID:          in.GroupID,
		Title:            in.Title,
		Amount:           in.AmountMinor,
		Currency:         in.Currency,
		PaidByID:         in.PaidByMemberID,
		SplitMethod:      in.SplitMethod,
		Category:         in.Category,
		Notes:            notes,
		ExpenseDate:      pgtype.Date{Time: in.ExpenseDate, Valid: true},
		IsReimbursement:  in.IsReimbursement,
		CreatedByID:      in.CreatedByUserID,
		OriginalAmount:   in.OriginalAmount,
		OriginalCurrency: in.OriginalCurrency,
		FxRate:           in.FxRate,
		FxAsOf:           in.FxAsOf,
		FxSource:         in.FxSource,
		SourceKind:       sourceKind,
		SourceID:         sourceID,
	})
	if err != nil {
		return Created{}, err
	}

	splitRows := make([]db.ExpenseSplit, 0, len(in.Splits))
	for _, s := range in.Splits {
		row, err := qtx.CreateExpenseSplit(ctx, db.CreateExpenseSplitParams{
			ID:        ulid.New(),
			ExpenseID: expense.ID,
			MemberID:  s.MemberID,
			Share:     s.Value,
		})
		if err != nil {
			return Created{}, err
		}
		splitRows = append(splitRows, row)
	}

	// Activity row. Snapshot shape matches handler.ExpenseSnapshot — kept
	// inline to avoid the import cycle (see constants block above).
	payload := struct {
		EntityType string `json:"entity_type"`
		Snapshot   struct {
			Title         string `json:"title"`
			Amount        int64  `json:"amount"`
			Currency      string `json:"currency"`
			PayerMemberID string `json:"payer_member_id"`
		} `json:"snapshot"`
	}{
		EntityType: entityExpense,
	}
	payload.Snapshot.Title = expense.Title
	payload.Snapshot.Amount = expense.Amount
	payload.Snapshot.Currency = expense.Currency
	payload.Snapshot.PayerMemberID = expense.PaidByID

	raw, err := json.Marshal(payload)
	if err != nil {
		return Created{}, err
	}
	if _, err := qtx.CreateActivity(ctx, db.CreateActivityParams{
		ID:         ulid.New(),
		GroupID:    in.GroupID,
		ActorID:    in.CreatedByUserID,
		EventType:  eventExpenseAdded,
		EntityID:   pgtype.Text{String: expense.ID, Valid: true},
		EntityType: pgtype.Text{String: entityExpense, Valid: true},
		Payload:    raw,
	}); err != nil {
		return Created{}, err
	}

	return Created{
		ExpenseID: expense.ID,
		Row:       expense,
		Splits:    splitRows,
	}, nil
}
