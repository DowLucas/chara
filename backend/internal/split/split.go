package split

import (
	"fmt"
	"sort"

	"github.com/DowLucas/chara/internal/money"
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
// any share is negative, any share exceeds money.MaxAmount, or the shares do
// not sum to total.
//
// The per-share bound is what makes the running sum safe: without it, two
// shares at the int64 ceiling wrap around to any target the caller likes, and
// a split that does not add up to the expense passes the sum check below.
func Exact(total money.Amount, shares []MemberShare) ([]MemberShare, error) {
	if total > money.MaxAmount {
		return nil, fmt.Errorf("split: total %s exceeds the maximum amount", total)
	}
	var sum money.Amount
	for _, s := range shares {
		if s.Share < 0 {
			return nil, fmt.Errorf("split: negative share for member %q", s.MemberID)
		}
		if s.Share > money.MaxAmount {
			return nil, fmt.Errorf("split: share for member %q exceeds the maximum amount", s.MemberID)
		}
		sum += s.Share
		if sum > money.MaxAmount {
			// Shares are non-negative, so the running sum only grows; once it
			// passes the cap it can never come back down to total.
			return nil, fmt.Errorf("split: shares sum above the maximum amount")
		}
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
	// total * basisPoints below must stay inside int64. money.MaxAmount is
	// chosen so that it does; anything larger is rejected rather than wrapped.
	if total < 0 || total > money.MaxAmount {
		return nil, fmt.Errorf("split: total %s is out of range", total)
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
