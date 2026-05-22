package split_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/split"
	"github.com/stretchr/testify/require"
)

// TestSplit_FixtureExport runs the Go split engine on a representative set of
// cases (all three methods, including rounding edges) and writes the inputs +
// outputs to `backend/testdata/split-fixture.json`. The TS test
// `app/lib/__tests__/split-fixture.test.ts` reads this file and asserts the
// TypeScript port produces byte-identical output.
//
// To regenerate the fixture: run `go test ./internal/split -run
// TestSplit_FixtureExport` before running `jest split-fixture`.
func TestSplit_FixtureExport(t *testing.T) {
	type fixtureCase struct {
		Name              string  `json:"name"`
		Method            string  `json:"method"`
		AmountMinor       int64   `json:"amountMinor"`
		Participants      []string `json:"participants,omitempty"`
		ExactShares       []struct {
			MemberID    string `json:"memberId"`
			AmountMinor int64  `json:"amountMinor"`
		} `json:"exactShares,omitempty"`
		PercentageShares []struct {
			MemberID    string `json:"memberId"`
			BasisPoints int    `json:"basisPoints"`
		} `json:"percentageShares,omitempty"`
		Expected []struct {
			MemberID    string `json:"memberId"`
			AmountMinor int64  `json:"amountMinor"`
		} `json:"expected"`
	}

	makeExpected := func(shares []split.MemberShare) []struct {
		MemberID    string `json:"memberId"`
		AmountMinor int64  `json:"amountMinor"`
	} {
		out := make([]struct {
			MemberID    string `json:"memberId"`
			AmountMinor int64  `json:"amountMinor"`
		}, len(shares))
		for i, s := range shares {
			out[i].MemberID = s.MemberID
			out[i].AmountMinor = int64(s.Share)
		}
		return out
	}

	var cases []fixtureCase

	// --- equal split cases ---
	addEqual := func(name string, total int64, ids []string) {
		out, err := split.Equal(money.Amount(total), ids)
		require.NoError(t, err)
		cases = append(cases, fixtureCase{
			Name:         name,
			Method:       "equal",
			AmountMinor:  total,
			Participants: ids,
			Expected:     makeExpected(out),
		})
	}

	addEqual("equal/divisible", 100, []string{"a", "b"})
	addEqual("equal/remainder-one", 100, []string{"user_b", "user_a", "user_c"})
	addEqual("equal/remainder-two", 101, []string{"c", "a", "b"})
	addEqual("equal/zero", 0, []string{"a", "b", "c"})
	addEqual("equal/large", 10_000_00, []string{"alice", "bob", "carol", "dave"})

	// --- exact split cases ---
	addExact := func(name string, total int64, shares []split.MemberShare) {
		out, err := split.Exact(money.Amount(total), shares)
		require.NoError(t, err)
		fc := fixtureCase{
			Name:        name,
			Method:      "exact",
			AmountMinor: total,
			Expected:    makeExpected(out),
		}
		for _, s := range shares {
			fc.ExactShares = append(fc.ExactShares, struct {
				MemberID    string `json:"memberId"`
				AmountMinor int64  `json:"amountMinor"`
			}{s.MemberID, int64(s.Share)})
		}
		cases = append(cases, fc)
	}

	addExact("exact/3-members", 100, []split.MemberShare{
		{MemberID: "a", Share: 50},
		{MemberID: "b", Share: 30},
		{MemberID: "c", Share: 20},
	})
	addExact("exact/2-members-uneven", 9999, []split.MemberShare{
		{MemberID: "x", Share: 3333},
		{MemberID: "y", Share: 6666},
	})

	// --- percentage split cases ---
	addPercentage := func(name string, total int64, pcts []split.MemberPct) {
		out, err := split.Percentage(money.Amount(total), pcts)
		require.NoError(t, err)
		fc := fixtureCase{
			Name:        name,
			Method:      "percentage",
			AmountMinor: total,
			Expected:    makeExpected(out),
		}
		for _, p := range pcts {
			fc.PercentageShares = append(fc.PercentageShares, struct {
				MemberID    string `json:"memberId"`
				BasisPoints int    `json:"basisPoints"`
			}{p.MemberID, p.BasisPoints})
		}
		cases = append(cases, fc)
	}

	addPercentage("percentage/50-50", 100, []split.MemberPct{
		{MemberID: "a", BasisPoints: 5000},
		{MemberID: "b", BasisPoints: 5000},
	})
	addPercentage("percentage/thirds", 100, []split.MemberPct{
		{MemberID: "a", BasisPoints: 3334},
		{MemberID: "b", BasisPoints: 3333},
		{MemberID: "c", BasisPoints: 3333},
	})
	addPercentage("percentage/asymmetric", 10000, []split.MemberPct{
		{MemberID: "a", BasisPoints: 1000},
		{MemberID: "b", BasisPoints: 2500},
		{MemberID: "c", BasisPoints: 6500},
	})

	// Write the fixture. Path: backend/testdata/split-fixture.json
	// We compute the path relative to this test file (CWD is the package dir).
	out := filepath.Join("..", "..", "testdata", "split-fixture.json")
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	buf, err := json.MarshalIndent(cases, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(out, append(buf, '\n'), 0o644))
}
