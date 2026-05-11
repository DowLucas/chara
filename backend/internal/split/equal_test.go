package split_test

import (
	"testing"

	"github.com/DowLucas/quits/internal/money"
	"github.com/DowLucas/quits/internal/split"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEqual(t *testing.T) {
	memberIDs := []string{"user_b", "user_a", "user_c"} // unsorted on purpose

	result, err := split.Equal(money.Amount(100), memberIDs)
	require.NoError(t, err)
	assert.Len(t, result, 3)

	// sum must equal total
	var sum money.Amount
	for _, s := range result {
		sum += s.Share
	}
	assert.Equal(t, money.Amount(100), sum)

	// remainder goes to lexicographically first member ID
	byID := map[string]money.Amount{}
	for _, s := range result {
		byID[s.MemberID] = s.Share
	}
	assert.Equal(t, money.Amount(34), byID["user_a"]) // first alphabetically gets the extra penny
	assert.Equal(t, money.Amount(33), byID["user_b"])
	assert.Equal(t, money.Amount(33), byID["user_c"])
}

func TestEqual_EmptyMembers(t *testing.T) {
	_, err := split.Equal(money.Amount(100), []string{})
	assert.Error(t, err)
}
