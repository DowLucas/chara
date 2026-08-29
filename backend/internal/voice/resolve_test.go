package voice

import "testing"

func sharesSum(shares []MemberShare) int64 {
	var sum int64
	for _, s := range shares {
		sum += int64(s.Share)
	}
	return sum
}

func hasStr(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

func TestResolveEqualSplit(t *testing.T) {
	raws := []rawDraft{{
		SourcePhrase: "I paid 480 for dinner", Title: "Dinner",
		Amount: "480.00", Currency: "SEK", Category: "food",
		Date: "2026-08-28", PaidByMemberID: "m1", SplitMethod: "equal",
		Participants: []string{"m1", "m2", "m3"},
	}}
	got, degraded, unresolved := resolveDrafts(raws, testContext())

	if len(got) != 1 {
		t.Fatalf("got %d drafts, want 1", len(got))
	}
	if degraded != 0 || unresolved != 0 {
		t.Errorf("degraded=%d unresolved=%d, want 0/0", degraded, unresolved)
	}
	d := got[0]
	if d.AmountMinor != 48000 {
		t.Errorf("AmountMinor = %d, want 48000", d.AmountMinor)
	}
	if d.SourcePhrase != "I paid 480 for dinner" {
		t.Errorf("SourcePhrase = %q, want it preserved", d.SourcePhrase)
	}
	if d.Category != "food" {
		t.Errorf("Category = %q, want food", d.Category)
	}
	if d.Date != "2026-08-28" {
		t.Errorf("Date = %q, want 2026-08-28", d.Date)
	}
	if len(d.Shares) != 3 {
		t.Fatalf("got %d shares, want 3", len(d.Shares))
	}
	if sharesSum(d.Shares) != 48000 {
		t.Errorf("shares sum to %d, want 48000", sharesSum(d.Shares))
	}
}

func TestResolveDropsHallucinatedPayer(t *testing.T) {
	raws := []rawDraft{{
		Title: "Taxi", Amount: "120.00", Currency: "SEK",
		PaidByMemberID: "m99", SplitMethod: "equal",
		Participants: []string{"m1", "m2"},
	}}
	got, _, unresolved := resolveDrafts(raws, testContext())

	if unresolved == 0 {
		t.Error("unresolved = 0, want > 0 for an invented payer id")
	}
	if got[0].PaidByID != "m1" {
		t.Errorf("PaidByID = %q, want fallback to the caller m1", got[0].PaidByID)
	}
	if !hasStr(got[0].LowConfidence, "paid_by") {
		t.Errorf("LowConfidence = %v, want it to include paid_by", got[0].LowConfidence)
	}
}

func TestResolveDropsHallucinatedParticipants(t *testing.T) {
	raws := []rawDraft{{
		Title: "Lunch", Amount: "200.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "equal",
		Participants: []string{"m1", "m2", "m77"},
	}}
	got, _, unresolved := resolveDrafts(raws, testContext())

	if unresolved != 1 {
		t.Errorf("unresolved = %d, want 1", unresolved)
	}
	if len(got[0].Participants) != 2 {
		t.Errorf("participants = %v, want only the two real members", got[0].Participants)
	}
	if sharesSum(got[0].Shares) != 20000 {
		t.Errorf("shares sum to %d, want 20000", sharesSum(got[0].Shares))
	}
}

func TestResolveExactSharesThatDoNotSumDegradeToEqual(t *testing.T) {
	// The model's arithmetic is an input, not a fact.
	raws := []rawDraft{{
		Title: "Dinner", Amount: "430.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "exact",
		Participants: []string{"m1", "m2"},
		Shares: []rawShare{
			{MemberID: "m1", Amount: "180.00"},
			{MemberID: "m2", Amount: "200.00"}, // sums to 380, not 430
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	if degraded != 1 {
		t.Errorf("degraded = %d, want 1", degraded)
	}
	if got[0].SplitMethod != "equal" {
		t.Errorf("SplitMethod = %q, want equal after degrading", got[0].SplitMethod)
	}
	if sharesSum(got[0].Shares) != 43000 {
		t.Errorf("shares sum to %d, want 43000", sharesSum(got[0].Shares))
	}
	if !hasStr(got[0].LowConfidence, "split") {
		t.Errorf("LowConfidence = %v, want it to include split", got[0].LowConfidence)
	}
}

func TestResolveExactSharesThatSumAreKept(t *testing.T) {
	raws := []rawDraft{{
		Title: "Dinner", Amount: "430.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "exact",
		Participants: []string{"m1", "m2"},
		Shares: []rawShare{
			{MemberID: "m1", Amount: "180.00"},
			{MemberID: "m2", Amount: "250.00"},
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	if degraded != 0 {
		t.Errorf("degraded = %d, want 0", degraded)
	}
	if got[0].SplitMethod != "exact" {
		t.Errorf("SplitMethod = %q, want exact", got[0].SplitMethod)
	}
	byID := map[string]int64{}
	for _, s := range got[0].Shares {
		byID[s.MemberID] = int64(s.Share)
	}
	if byID["m1"] != 18000 || byID["m2"] != 25000 {
		t.Errorf("shares = %v, want m1=18000 m2=25000", byID)
	}
}

func TestResolveExactSharesNamingANonParticipantDegrade(t *testing.T) {
	raws := []rawDraft{{
		Title: "Dinner", Amount: "430.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "exact",
		Participants: []string{"m1", "m2"},
		Shares: []rawShare{
			{MemberID: "m1", Amount: "180.00"},
			{MemberID: "m3", Amount: "250.00"}, // m3 is not a participant
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	if degraded != 1 || got[0].SplitMethod != "equal" {
		t.Errorf("degraded=%d method=%q, want 1/equal", degraded, got[0].SplitMethod)
	}
}

func TestResolvePercentage(t *testing.T) {
	raws := []rawDraft{{
		Title: "Hotel", Amount: "900.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "percentage",
		Participants: []string{"m1", "m2"},
		Percentages: []rawPercent{
			{MemberID: "m1", Percent: 70},
			{MemberID: "m2", Percent: 30},
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	if degraded != 0 {
		t.Fatalf("degraded = %d, want 0", degraded)
	}
	byID := map[string]int64{}
	for _, s := range got[0].Shares {
		byID[s.MemberID] = int64(s.Share)
	}
	if byID["m1"] != 63000 || byID["m2"] != 27000 {
		t.Errorf("shares = %v, want m1=63000 m2=27000", byID)
	}
}

func TestResolvePercentagesThatDoNotSumTo100DegradeToEqual(t *testing.T) {
	raws := []rawDraft{{
		Title: "Hotel", Amount: "900.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "percentage",
		Participants: []string{"m1", "m2"},
		Percentages: []rawPercent{
			{MemberID: "m1", Percent: 70},
			{MemberID: "m2", Percent: 40},
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	if degraded != 1 || got[0].SplitMethod != "equal" {
		t.Errorf("degraded=%d method=%q, want 1/equal", degraded, got[0].SplitMethod)
	}
	if sharesSum(got[0].Shares) != 90000 {
		t.Errorf("shares sum to %d, want 90000", sharesSum(got[0].Shares))
	}
}

func TestResolveRejectsUnknownCategoryAndCurrency(t *testing.T) {
	raws := []rawDraft{{
		Title: "Thing", Amount: "10.00", Currency: "XYZ", Category: "spaceships",
		PaidByMemberID: "m1", SplitMethod: "equal", Participants: []string{"m1"},
	}}
	got, _, _ := resolveDrafts(raws, testContext())

	if got[0].Category != "" {
		t.Errorf("Category = %q, want empty for an off-catalog guess", got[0].Category)
	}
	if got[0].Currency != "SEK" {
		t.Errorf("Currency = %q, want fallback to the group currency", got[0].Currency)
	}
}

func TestResolveRejectsCategoryOutsideTheGroupCatalog(t *testing.T) {
	// A real category id that this group has not enabled must not be used.
	raws := []rawDraft{{
		Title: "Rent", Amount: "10.00", Category: "rent",
		PaidByMemberID: "m1", SplitMethod: "equal", Participants: []string{"m1"},
	}}
	got, _, _ := resolveDrafts(raws, testContext())

	if got[0].Category != "" {
		t.Errorf("Category = %q, want empty — rent is real but not in this group's catalog", got[0].Category)
	}
}

func TestResolveKeepsForeignCurrency(t *testing.T) {
	raws := []rawDraft{{
		Title: "Hotel", Amount: "40.00", Currency: "EUR",
		PaidByMemberID: "m1", SplitMethod: "equal", Participants: []string{"m1"},
	}}
	got, _, _ := resolveDrafts(raws, testContext())

	if got[0].Currency != "EUR" {
		t.Errorf("Currency = %q, want EUR preserved for the FX path", got[0].Currency)
	}
}

func TestResolveDropsDraftsWithNoUsableAmount(t *testing.T) {
	raws := []rawDraft{
		{Title: "Nothing", Amount: "", PaidByMemberID: "m1", Participants: []string{"m1"}},
		{Title: "Zero", Amount: "0.00", PaidByMemberID: "m1", Participants: []string{"m1"}},
		{Title: "Negative", Amount: "-5.00", PaidByMemberID: "m1", Participants: []string{"m1"}},
		{Title: "Garbage", Amount: "abc", PaidByMemberID: "m1", Participants: []string{"m1"}},
		{Title: "Real", Amount: "50.00", PaidByMemberID: "m1", SplitMethod: "equal", Participants: []string{"m1"}},
	}
	got, _, _ := resolveDrafts(raws, testContext())

	if len(got) != 1 || got[0].Title != "Real" {
		t.Errorf("got %d drafts, want only the one with a usable amount", len(got))
	}
}

func TestResolveEmptyParticipantsFallsBackToWholeGroup(t *testing.T) {
	raws := []rawDraft{{
		Title: "Groceries", Amount: "620.00", PaidByMemberID: "m1",
		SplitMethod: "equal", Participants: nil,
	}}
	got, _, _ := resolveDrafts(raws, testContext())

	if len(got[0].Participants) != 3 {
		t.Errorf("participants = %v, want all three members", got[0].Participants)
	}
	// The model naming nobody is normal ("groceries, split it"), so this
	// is NOT low confidence.
	if hasStr(got[0].LowConfidence, "participants") {
		t.Error("naming nobody should not be flagged low-confidence")
	}
}

func TestResolveAllParticipantsInventedFallsBackAndFlags(t *testing.T) {
	raws := []rawDraft{{
		Title: "Lunch", Amount: "100.00", PaidByMemberID: "m1",
		SplitMethod: "equal", Participants: []string{"m88", "m99"},
	}}
	got, _, unresolved := resolveDrafts(raws, testContext())

	if unresolved != 2 {
		t.Errorf("unresolved = %d, want 2", unresolved)
	}
	if len(got[0].Participants) != 3 {
		t.Errorf("participants = %v, want the whole group as fallback", got[0].Participants)
	}
	// Here the model DID name people and we ignored all of them, so flag it.
	if !hasStr(got[0].LowConfidence, "participants") {
		t.Errorf("LowConfidence = %v, want participants flagged", got[0].LowConfidence)
	}
}

func TestResolveBadDateFallsBackToClientLocalDate(t *testing.T) {
	for _, bad := range []string{"not-a-date", "", "2026-13-45"} {
		raws := []rawDraft{{
			Title: "Lunch", Amount: "50.00", Date: bad,
			PaidByMemberID: "m1", SplitMethod: "equal", Participants: []string{"m1"},
		}}
		got, _, _ := resolveDrafts(raws, testContext())
		if got[0].Date != "2026-08-29" {
			t.Errorf("Date for %q = %q, want the client local date", bad, got[0].Date)
		}
	}
}

func TestResolveUnknownSplitMethodBecomesEqual(t *testing.T) {
	raws := []rawDraft{{
		Title: "Lunch", Amount: "90.00", PaidByMemberID: "m1",
		SplitMethod: "by_vibes", Participants: []string{"m1", "m2", "m3"},
	}}
	got, _, _ := resolveDrafts(raws, testContext())

	if got[0].SplitMethod != "equal" {
		t.Errorf("SplitMethod = %q, want equal", got[0].SplitMethod)
	}
	if sharesSum(got[0].Shares) != 9000 {
		t.Errorf("shares sum to %d, want 9000", sharesSum(got[0].Shares))
	}
}

func TestResolveNoDraftsIsNotAnError(t *testing.T) {
	got, degraded, unresolved := resolveDrafts(nil, testContext())
	if len(got) != 0 || degraded != 0 || unresolved != 0 {
		t.Errorf("got %d/%d/%d, want 0/0/0", len(got), degraded, unresolved)
	}
}

// A percentage split must keep its percentages, not just the amounts they
// produced. The client needs them to show "Alex 25%" rather than a bare
// 250.00, and re-deriving them from rounded minor units is guesswork the
// server can simply avoid — it already validated the real numbers.
func TestResolveKeepsPercentagesOnTheDraft(t *testing.T) {
	raws := []rawDraft{{
		Title: "Delad utgift", Amount: "1000.00", Currency: "SEK",
		PaidByMemberID: "m1", SplitMethod: "percentage",
		Participants: []string{"m1", "m2"},
		Percentages: []rawPercent{
			{MemberID: "m1", Percent: 75},
			{MemberID: "m2", Percent: 25},
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	require := func(cond bool, format string, args ...any) {
		t.Helper()
		if !cond {
			t.Fatalf(format, args...)
		}
	}
	require(degraded == 0, "degraded = %d, want 0", degraded)
	require(len(got) == 1, "got %d drafts, want 1", len(got))

	byID := map[string]int{}
	for _, p := range got[0].Percentages {
		byID[p.MemberID] = p.BasisPoints
	}
	if byID["m2"] != 2500 {
		t.Errorf("m2 basis points = %d, want 2500", byID["m2"])
	}
	if byID["m1"] != 7500 {
		t.Errorf("m1 basis points = %d, want 7500", byID["m1"])
	}
}

// An equal or exact split has no percentages to carry.
func TestResolveLeavesPercentagesEmptyForOtherMethods(t *testing.T) {
	for _, method := range []string{"equal", "exact"} {
		raws := []rawDraft{{
			Title: "Dinner", Amount: "430.00", PaidByMemberID: "m1",
			SplitMethod: method, Participants: []string{"m1", "m2"},
			Shares: []rawShare{
				{MemberID: "m1", Amount: "180.00"},
				{MemberID: "m2", Amount: "250.00"},
			},
		}}
		got, _, _ := resolveDrafts(raws, testContext())
		if len(got[0].Percentages) != 0 {
			t.Errorf("%s split carried percentages %v, want none", method, got[0].Percentages)
		}
	}
}

// A degraded percentage split falls back to equal, so its percentages must
// not survive — they are exactly the numbers that failed to validate.
func TestResolveDropsPercentagesWhenTheyDegrade(t *testing.T) {
	raws := []rawDraft{{
		Title: "Hotel", Amount: "900.00", PaidByMemberID: "m1",
		SplitMethod: "percentage", Participants: []string{"m1", "m2"},
		Percentages: []rawPercent{
			{MemberID: "m1", Percent: 70},
			{MemberID: "m2", Percent: 40},
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())
	if degraded != 1 {
		t.Fatalf("degraded = %d, want 1", degraded)
	}
	if len(got[0].Percentages) != 0 {
		t.Errorf("degraded draft kept percentages %v, want none", got[0].Percentages)
	}
}

// Reasoning is model prose, carried through untouched. It is a review aid
// shown before saving, never persisted with the expense.
func TestResolveCarriesReasoning(t *testing.T) {
	raws := []rawDraft{{
		Title: "Middag", Amount: "1000.00", PaidByMemberID: "m1",
		SplitMethod: "equal", Participants: []string{"m2", "m3"},
		Reasoning: "Delas mellan Anna och Sara — du sa \"resten av gänget\".",
	}}
	got, _, _ := resolveDrafts(raws, testContext())
	if len(got) != 1 {
		t.Fatalf("got %d drafts, want 1", len(got))
	}
	if got[0].Reasoning == "" {
		t.Error("reasoning was dropped")
	}
}

// split.Exact validates only that shares are non-negative and sum to the
// total. It says nothing about WHO they cover, so resolve.go has to.

func TestResolveDegradesWhenExactSharesMissAParticipant(t *testing.T) {
	// Sums to 430 and passes split.Exact, but Sara is on the split and owes
	// nothing — a draft that contradicts itself, with no flag raised.
	raws := []rawDraft{{
		Title: "Dinner", Amount: "430.00", PaidByMemberID: "m1",
		SplitMethod: "exact", Participants: []string{"m1", "m2", "m3"},
		Shares: []rawShare{
			{MemberID: "m1", Amount: "180.00"},
			{MemberID: "m2", Amount: "250.00"},
		},
	}}
	got, degraded, _ := resolveDrafts(raws, testContext())

	if degraded != 1 {
		t.Errorf("degraded = %d, want 1 — shares do not cover every participant", degraded)
	}
	if got[0].SplitMethod != "equal" {
		t.Errorf("SplitMethod = %q, want equal", got[0].SplitMethod)
	}
}

func TestResolveDegradesOnDuplicateExactShares(t *testing.T) {
	// Sums correctly, but the client collapses duplicates last-wins, so the
	// wizard's amounts would no longer total the expense and the save would
	// fail with an error the user cannot act on.
	raws := []rawDraft{{
		Title: "Dinner", Amount: "430.00", PaidByMemberID: "m1",
		SplitMethod: "exact", Participants: []string{"m1", "m2"},
		Shares: []rawShare{
			{MemberID: "m2", Amount: "250.00"},
			{MemberID: "m2", Amount: "180.00"},
		},
	}}
	_, degraded, _ := resolveDrafts(raws, testContext())
	if degraded != 1 {
		t.Errorf("degraded = %d, want 1 — duplicate member in shares", degraded)
	}
}

// split.Percentage checks only that basis points SUM to 10000, so a wild
// pair like 200%/-100% passes and pays one member twice the total.
func TestResolveDegradesOnOutOfRangePercentages(t *testing.T) {
	for _, pcts := range [][]rawPercent{
		{{MemberID: "m1", Percent: 200}, {MemberID: "m2", Percent: -100}},
		{{MemberID: "m1", Percent: -10}, {MemberID: "m2", Percent: 110}},
	} {
		raws := []rawDraft{{
			Title: "Hotel", Amount: "900.00", PaidByMemberID: "m1",
			SplitMethod: "percentage", Participants: []string{"m1", "m2"},
			Percentages: pcts,
		}}
		got, degraded, _ := resolveDrafts(raws, testContext())
		if degraded != 1 || got[0].SplitMethod != "equal" {
			t.Errorf("pcts %v: degraded=%d method=%q, want 1/equal", pcts, degraded, got[0].SplitMethod)
		}
		for _, s := range got[0].Shares {
			if s.Share < 0 {
				t.Errorf("pcts %v produced a negative share %d", pcts, s.Share)
			}
		}
	}
}

func TestResolveDegradesOnDuplicatePercentageMembers(t *testing.T) {
	raws := []rawDraft{{
		Title: "Hotel", Amount: "900.00", PaidByMemberID: "m1",
		SplitMethod: "percentage", Participants: []string{"m1", "m2"},
		Percentages: []rawPercent{
			{MemberID: "m2", Percent: 70},
			{MemberID: "m2", Percent: 30},
		},
	}}
	_, degraded, _ := resolveDrafts(raws, testContext())
	if degraded != 1 {
		t.Errorf("degraded = %d, want 1 — duplicate member in percentages", degraded)
	}
}

// The valid cases must keep working.
func TestResolveKeepsFullyCoveredExactAndPercentageSplits(t *testing.T) {
	exact := []rawDraft{{
		Title: "Dinner", Amount: "430.00", PaidByMemberID: "m1",
		SplitMethod: "exact", Participants: []string{"m1", "m2"},
		Shares: []rawShare{
			{MemberID: "m1", Amount: "180.00"},
			{MemberID: "m2", Amount: "250.00"},
		},
	}}
	if got, degraded, _ := resolveDrafts(exact, testContext()); degraded != 0 || got[0].SplitMethod != "exact" {
		t.Errorf("valid exact split degraded (%d, %q)", degraded, got[0].SplitMethod)
	}

	pct := []rawDraft{{
		Title: "Hotel", Amount: "900.00", PaidByMemberID: "m1",
		SplitMethod: "percentage", Participants: []string{"m1", "m2"},
		Percentages: []rawPercent{
			{MemberID: "m1", Percent: 70},
			{MemberID: "m2", Percent: 30},
		},
	}}
	if got, degraded, _ := resolveDrafts(pct, testContext()); degraded != 0 || got[0].SplitMethod != "percentage" {
		t.Errorf("valid percentage split degraded (%d, %q)", degraded, got[0].SplitMethod)
	}
}
