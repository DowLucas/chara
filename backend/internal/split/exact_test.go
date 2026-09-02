package split_test

import (
	"testing"

	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/split"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExact_Valid(t *testing.T) {
	input := []split.MemberShare{
		{MemberID: "a", Share: 50},
		{MemberID: "b", Share: 30},
		{MemberID: "c", Share: 20},
	}
	result, err := split.Exact(money.Amount(100), input)
	require.NoError(t, err)
	assert.Equal(t, input, result)
}

func TestExact_DoesNotSumToTotal(t *testing.T) {
	input := []split.MemberShare{
		{MemberID: "a", Share: 50},
		{MemberID: "b", Share: 40},
	}
	_, err := split.Exact(money.Amount(100), input)
	assert.Error(t, err)
}

func TestExact_NegativeShare(t *testing.T) {
	input := []split.MemberShare{
		{MemberID: "a", Share: 110},
		{MemberID: "b", Share: -10},
	}
	_, err := split.Exact(money.Amount(100), input)
	assert.Error(t, err)
}

func TestExact_RejectsOverflowingShares(t *testing.T) {
	// Two shares at the int64 ceiling wrap to exactly `total`, so an unchecked
	// `sum += s.Share` accepts a split that does not sum to the expense.
	const ceiling = money.Amount(9223372036854775807)
	input := []split.MemberShare{
		{MemberID: "a", Share: ceiling},
		{MemberID: "b", Share: ceiling},
		{MemberID: "c", Share: 102},
	}
	_, err := split.Exact(money.Amount(100), input)
	require.Error(t, err, "wrapped shares must not pass the sum check")
}

func TestExact_RejectsShareAboveMax(t *testing.T) {
	input := []split.MemberShare{
		{MemberID: "a", Share: money.MaxAmount + 1},
	}
	_, err := split.Exact(money.MaxAmount+1, input)
	require.Error(t, err)
}
