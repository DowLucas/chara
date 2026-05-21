package settle_test

import (
	"testing"

	"github.com/DowLucas/quits/internal/settle"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSuggest_Empty(t *testing.T) {
	assert.Empty(t, settle.Suggest(nil))
	assert.Empty(t, settle.Suggest([]settle.Balance{}))
}

func TestSuggest_AllZero(t *testing.T) {
	got := settle.Suggest([]settle.Balance{
		{MemberID: "a", Currency: "SEK", Amount: 0},
		{MemberID: "b", Currency: "SEK", Amount: 0},
	})
	assert.Empty(t, got)
}

func TestSuggest_TwoParty(t *testing.T) {
	// Alice is owed 45.00, Bob owes 45.00 → Bob pays Alice 45.00
	got := settle.Suggest([]settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 4500},
		{MemberID: "bob", Currency: "SEK", Amount: -4500},
	})
	require.Len(t, got, 1)
	assert.Equal(t, settle.Transfer{
		FromMemberID: "bob",
		ToMemberID:   "alice",
		Currency:     "SEK",
		Amount:       4500,
	}, got[0])
}

func TestSuggest_ThreeParty_MinimumTransfers(t *testing.T) {
	// Alice +60, Bob -30, Carol -30 → 2 transfers (n-1 with n=3)
	got := settle.Suggest([]settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 6000},
		{MemberID: "bob", Currency: "SEK", Amount: -3000},
		{MemberID: "carol", Currency: "SEK", Amount: -3000},
	})
	require.Len(t, got, 2)
	assertReconciles(t, got, map[string]int64{"alice": 6000, "bob": -3000, "carol": -3000})
	for _, tr := range got {
		assert.Equal(t, "alice", tr.ToMemberID)
		assert.Equal(t, int64(3000), tr.Amount)
	}
}

func TestSuggest_ThreeParty_OneMatchesExactly(t *testing.T) {
	// Alice +50, Bob +20, Carol -50, Dave -20 → ideally 2 transfers (Carol→Alice, Dave→Bob)
	got := settle.Suggest([]settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 5000},
		{MemberID: "bob", Currency: "SEK", Amount: 2000},
		{MemberID: "carol", Currency: "SEK", Amount: -5000},
		{MemberID: "dave", Currency: "SEK", Amount: -2000},
	})
	assert.LessOrEqual(t, len(got), 3) // n-1 = 3 worst case
	assertReconciles(t, got, map[string]int64{"alice": 5000, "bob": 2000, "carol": -5000, "dave": -2000})
}

func TestSuggest_MultiCurrency_IndependentBuckets(t *testing.T) {
	got := settle.Suggest([]settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 1000},
		{MemberID: "bob", Currency: "SEK", Amount: -1000},
		{MemberID: "alice", Currency: "EUR", Amount: -500},
		{MemberID: "bob", Currency: "EUR", Amount: 500},
	})
	require.Len(t, got, 2)

	bySek, byEur := 0, 0
	for _, tr := range got {
		switch tr.Currency {
		case "SEK":
			assert.Equal(t, "bob", tr.FromMemberID)
			assert.Equal(t, "alice", tr.ToMemberID)
			assert.Equal(t, int64(1000), tr.Amount)
			bySek++
		case "EUR":
			assert.Equal(t, "alice", tr.FromMemberID)
			assert.Equal(t, "bob", tr.ToMemberID)
			assert.Equal(t, int64(500), tr.Amount)
			byEur++
		}
	}
	assert.Equal(t, 1, bySek)
	assert.Equal(t, 1, byEur)
}

func TestSuggest_SkipsZeroBalances(t *testing.T) {
	got := settle.Suggest([]settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 1000},
		{MemberID: "bob", Currency: "SEK", Amount: 0},
		{MemberID: "carol", Currency: "SEK", Amount: -1000},
	})
	require.Len(t, got, 1)
	assert.Equal(t, "carol", got[0].FromMemberID)
	assert.Equal(t, "alice", got[0].ToMemberID)
}

func TestSuggest_OddCentSplit(t *testing.T) {
	// 10.01 split three ways → 4, 3, 4 minor-unit residues etc.
	// Use a realistic odd-cent layout: payer +667, two debtors -334, -333.
	got := settle.Suggest([]settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 667},
		{MemberID: "bob", Currency: "SEK", Amount: -334},
		{MemberID: "carol", Currency: "SEK", Amount: -333},
	})
	assertReconciles(t, got, map[string]int64{"alice": 667, "bob": -334, "carol": -333})
	assert.LessOrEqual(t, len(got), 2)
}

func TestSuggest_Deterministic(t *testing.T) {
	// Same input → same output, irrespective of slice ordering.
	input1 := []settle.Balance{
		{MemberID: "alice", Currency: "SEK", Amount: 3000},
		{MemberID: "bob", Currency: "SEK", Amount: -2000},
		{MemberID: "carol", Currency: "SEK", Amount: -1000},
	}
	input2 := []settle.Balance{
		{MemberID: "carol", Currency: "SEK", Amount: -1000},
		{MemberID: "alice", Currency: "SEK", Amount: 3000},
		{MemberID: "bob", Currency: "SEK", Amount: -2000},
	}
	assert.Equal(t, settle.Suggest(input1), settle.Suggest(input2))
}

func TestSuggest_UpperBoundOnTransferCount(t *testing.T) {
	// Construct n=6 members in one currency, assert ≤ n-1 transfers.
	bals := []settle.Balance{
		{MemberID: "m1", Currency: "SEK", Amount: 10000},
		{MemberID: "m2", Currency: "SEK", Amount: 5000},
		{MemberID: "m3", Currency: "SEK", Amount: 2000},
		{MemberID: "m4", Currency: "SEK", Amount: -3000},
		{MemberID: "m5", Currency: "SEK", Amount: -6000},
		{MemberID: "m6", Currency: "SEK", Amount: -8000},
	}
	got := settle.Suggest(bals)
	assert.LessOrEqual(t, len(got), len(bals)-1)
	assertReconciles(t, got, map[string]int64{
		"m1": 10000, "m2": 5000, "m3": 2000,
		"m4": -3000, "m5": -6000, "m6": -8000,
	})
}

// assertReconciles verifies that applying every transfer to the starting
// balances zeros each member.
func assertReconciles(t *testing.T, transfers []settle.Transfer, starting map[string]int64) {
	t.Helper()
	bal := make(map[string]int64, len(starting))
	for k, v := range starting {
		bal[k] = v
	}
	for _, tr := range transfers {
		require.Positive(t, tr.Amount, "transfer amount must be positive")
		bal[tr.FromMemberID] += tr.Amount
		bal[tr.ToMemberID] -= tr.Amount
	}
	for member, remaining := range bal {
		assert.Zero(t, remaining, "member %s should be settled, has %d left", member, remaining)
	}
}
