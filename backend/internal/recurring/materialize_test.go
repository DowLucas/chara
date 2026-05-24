package recurring_test

import (
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/recurring"
)

func TestMaterialize_ProjectsRuleIntoExpenseInput(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Stockholm")
	occ := time.Date(2026, 6, 1, 9, 0, 0, 0, loc)

	in := recurring.Materialize(recurring.Materializable{
		RuleID:         "rec_01",
		GroupID:        "grp_01",
		Title:          "Rent",
		AmountMinor:    850000,
		Currency:       "SEK",
		PaidByMemberID: "gm_alice",
		SplitMethod:    "equal",
		Splits: []recurring.SplitDef{
			{MemberID: "gm_alice"},
			{MemberID: "gm_bob"},
		},
		Category:        "housing",
		Notes:           nil,
		CreatedByUserID: "usr_alice",
		Timezone:        "Europe/Stockholm",
	}, occ)

	if in.Title != "Rent" || in.AmountMinor != 850000 || in.Currency != "SEK" {
		t.Fatalf("core fields wrong: %+v", in)
	}
	if in.SourceKind == nil || *in.SourceKind != "recurring" {
		t.Fatalf("source_kind not set to 'recurring'")
	}
	if in.SourceID == nil || *in.SourceID != "rec_01" {
		t.Fatalf("source_id not set")
	}
	if in.ExpenseDate.Format("2006-01-02") != "2026-06-01" {
		t.Fatalf("expense_date wrong (tz issue?): %v", in.ExpenseDate)
	}
}
