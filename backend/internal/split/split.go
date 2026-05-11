package split

import (
	"fmt"
	"sort"

	"github.com/DowLucas/quits/internal/money"
)

// MemberShare associates a split amount with a group member.
type MemberShare struct {
	MemberID string
	Share    money.Amount
}

// MemberPct associates a basis-point percentage (0–10000) with a group member.
type MemberPct struct {
	MemberID    string
	BasisPoints int // 10000 == 100%
}

// Equal splits total evenly across memberIDs. Remainder pennies are distributed
// to members in ascending lexicographic order of their ID.
func Equal(total money.Amount, memberIDs []string) ([]MemberShare, error) {
	if len(memberIDs) == 0 {
		return nil, fmt.Errorf("split: memberIDs must not be empty")
	}
	sorted := make([]string, len(memberIDs))
	copy(sorted, memberIDs)
	sort.Strings(sorted)

	parts := total.SplitEqual(len(sorted))
	result := make([]MemberShare, len(sorted))
	for i, id := range sorted {
		result[i] = MemberShare{MemberID: id, Share: parts[i]}
	}
	return result, nil
}

// Exact validates and returns the caller-supplied shares. Returns an error if
// any share is negative or the shares do not sum to total.
func Exact(total money.Amount, shares []MemberShare) ([]MemberShare, error) {
	var sum money.Amount
	for _, s := range shares {
		if s.Share < 0 {
			return nil, fmt.Errorf("split: negative share for member %q", s.MemberID)
		}
		sum += s.Share
	}
	if sum != total {
		return nil, fmt.Errorf("split: shares sum to %s, expected %s", sum, total)
	}
	return shares, nil
}

// Percentage splits total according to basis points (10000 == 100%). Returns an
// error if the basis points do not sum to 10000 or the slice is empty.
// Remainder pennies go to the member with the largest fractional remainder.
func Percentage(total money.Amount, pcts []MemberPct) ([]MemberShare, error) {
	if len(pcts) == 0 {
		return nil, fmt.Errorf("split: pcts must not be empty")
	}
	var bpSum int
	for _, p := range pcts {
		bpSum += p.BasisPoints
	}
	if bpSum != 10000 {
		return nil, fmt.Errorf("split: basis points sum to %d, must be 10000", bpSum)
	}

	result := make([]MemberShare, len(pcts))
	var assigned money.Amount
	for i, p := range pcts {
		result[i] = MemberShare{
			MemberID: p.MemberID,
			Share:    money.Amount(int64(total) * int64(p.BasisPoints) / 10000),
		}
		assigned += result[i].Share
	}

	// Distribute any remaining pennies to members with the largest remainders.
	remainder := int(total - assigned)
	if remainder > 0 {
		type idx struct {
			i    int
			frac int64
		}
		fracs := make([]idx, len(pcts))
		for i, p := range pcts {
			fracs[i] = idx{i, int64(total)*int64(p.BasisPoints)%10000}
		}
		sort.Slice(fracs, func(a, b int) bool {
			return fracs[a].frac > fracs[b].frac
		})
		for i := 0; i < remainder; i++ {
			result[fracs[i].i].Share++
		}
	}

	return result, nil
}
