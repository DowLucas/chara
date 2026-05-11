package split_test

import (
	"testing"

	"github.com/DowLucas/quits/internal/money"
	"github.com/DowLucas/quits/internal/split"
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
