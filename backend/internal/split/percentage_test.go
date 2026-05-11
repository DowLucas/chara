package split_test

import (
	"testing"

	"github.com/DowLucas/quits/internal/money"
	"github.com/DowLucas/quits/internal/split"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPercentage_EvenSplit(t *testing.T) {
	// 50/50 split of 100 minor units
	input := []split.MemberPct{
		{MemberID: "a", BasisPoints: 5000},
		{MemberID: "b", BasisPoints: 5000},
	}
	result, err := split.Percentage(money.Amount(100), input)
	require.NoError(t, err)
	assert.Equal(t, money.Amount(50), result[0].Share)
	assert.Equal(t, money.Amount(50), result[1].Share)
}

func TestPercentage_UnevenSum(t *testing.T) {
	// 1/3 each of 100 — remainder handled deterministically
	input := []split.MemberPct{
		{MemberID: "a", BasisPoints: 3334},
		{MemberID: "b", BasisPoints: 3333},
		{MemberID: "c", BasisPoints: 3333},
	}
	result, err := split.Percentage(money.Amount(100), input)
	require.NoError(t, err)

	var sum money.Amount
	for _, r := range result {
		sum += r.Share
	}
	assert.Equal(t, money.Amount(100), sum, "sum must equal total")
}

func TestPercentage_BasisPointsNot10000(t *testing.T) {
	input := []split.MemberPct{
		{MemberID: "a", BasisPoints: 5000},
		{MemberID: "b", BasisPoints: 4000}, // only 90%
	}
	_, err := split.Percentage(money.Amount(100), input)
	assert.Error(t, err)
}

func TestPercentage_Empty(t *testing.T) {
	_, err := split.Percentage(money.Amount(100), []split.MemberPct{})
	assert.Error(t, err)
}
