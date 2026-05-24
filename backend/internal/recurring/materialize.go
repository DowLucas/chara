package recurring

import (
	"time"

	"github.com/DowLucas/chara/internal/expense"
)

// Materializable is the subset of recurring_expenses fields needed to project
// a firing into an expense.Input. Loaded from DB in the fire job.
type Materializable struct {
	RuleID          string
	GroupID         string
	Title           string
	AmountMinor     int64
	Currency        string
	PaidByMemberID  string
	SplitMethod     string
	Splits          []SplitDef
	Category        string
	Notes           *string
	CreatedByUserID string
	Timezone        string
}

// SplitDef mirrors recurring_expense_splits rows.
type SplitDef struct {
	MemberID string
	Value    int64
}

// Materialize projects a rule firing into expense.Input. Pure function.
// The caller (fire job) passes the occurrence timestamp from next_fire_at.
func Materialize(m Materializable, occurrence time.Time) expense.Input {
	loc, err := time.LoadLocation(m.Timezone)
	if err != nil {
		loc = time.UTC
	}
	localDate := occurrence.In(loc)
	expenseDate := time.Date(
		localDate.Year(), localDate.Month(), localDate.Day(),
		0, 0, 0, 0, loc,
	)

	splits := make([]expense.SplitInput, 0, len(m.Splits))
	for _, s := range m.Splits {
		splits = append(splits, expense.SplitInput{MemberID: s.MemberID, Value: s.Value})
	}

	kind := "recurring"
	id := m.RuleID
	return expense.Input{
		GroupID:         m.GroupID,
		Title:           m.Title,
		AmountMinor:     m.AmountMinor,
		Currency:        m.Currency,
		PaidByMemberID:  m.PaidByMemberID,
		SplitMethod:     m.SplitMethod,
		Splits:          splits,
		Category:        m.Category,
		Notes:           m.Notes,
		ExpenseDate:     expenseDate,
		CreatedByUserID: m.CreatedByUserID,
		SourceKind:      &kind,
		SourceID:        &id,
	}
}
