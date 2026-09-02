package summary

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// identityConvert treats every currency as 1:1 with home. Keeps tests about
// aggregation logic, not FX arithmetic.
func identityConvert(minor int64, from string, on time.Time) (int64, bool) {
	return minor, true
}

// rateConvert converts at fixed rates and reports failure for anything
// missing, exercising the estimated-leg path.
func rateConvert(rates map[string]int64) ConvertFunc {
	return func(minor int64, from string, on time.Time) (int64, bool) {
		r, ok := rates[from]
		if !ok {
			return 0, false
		}
		return minor * r, true
	}
}

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestBuild_SingleCurrency(t *testing.T) {
	got := Build(Input{
		Home:    "SEK",
		Convert: identityConvert,
		Totals: []CurrencyTotal{
			{Currency: "SEK", PaidMinor: 10000, ShareMinor: 6000, ExpenseCount: 3},
		},
		Counts: Counts{Expenses: 3, Groups: 1, ActiveDays: 2},
		Rows: []ExpenseRow{
			{ExpenseID: "e1", GroupID: "g1", GroupName: "Trip", Currency: "SEK",
				Category: "groceries", Title: "Food", Date: day("2026-08-01"), ShareMinor: 4000},
			{ExpenseID: "e2", GroupID: "g1", GroupName: "Trip", Currency: "SEK",
				Category: "transport", Title: "Taxi", Date: day("2026-08-02"), ShareMinor: 2000},
		},
	})

	require.Equal(t, int64(10000), got.Converted.PaidMinor)
	require.Equal(t, int64(6000), got.Converted.ShareMinor)
	require.Equal(t, int64(4000), got.Converted.NetMinor, "net = paid - share")
	require.Equal(t, 0, got.Converted.EstimatedLegs)
	require.Equal(t, int64(3), got.Counts.Expenses)
	require.Len(t, got.ByCurrency, 1)
}

func TestBuild_MixedCurrenciesRankInConvertedUnits(t *testing.T) {
	// 1 EUR = 11 SEK. The HUF row has the biggest raw number but the
	// smallest converted value; ranking must not be fooled.
	got := Build(Input{
		Home:    "SEK",
		Convert: rateConvert(map[string]int64{"SEK": 1, "EUR": 11, "HUF": 1}),
		Totals: []CurrencyTotal{
			{Currency: "EUR", PaidMinor: 1000, ShareMinor: 1000, ExpenseCount: 1},
			{Currency: "HUF", PaidMinor: 5000, ShareMinor: 5000, ExpenseCount: 1},
		},
		Counts: Counts{Expenses: 2, Groups: 2, ActiveDays: 2},
		Rows: []ExpenseRow{
			{ExpenseID: "eur", GroupID: "g1", GroupName: "Barcelona", Currency: "EUR",
				Category: "lodging", Title: "Hotel", Date: day("2026-08-03"), ShareMinor: 1000},
			{ExpenseID: "huf", GroupID: "g2", GroupName: "Budapest", Currency: "HUF",
				Category: "transport", Title: "Taxi", Date: day("2026-08-04"), ShareMinor: 5000},
		},
	})

	require.NotNil(t, got.Highlights.BiggestExpense)
	require.Equal(t, "eur", got.Highlights.BiggestExpense.ExpenseID,
		"11000 converted beats 5000 converted")
	require.Equal(t, "EUR", got.Highlights.BiggestExpense.Currency,
		"displayed in its native currency, ranked in converted")
	require.NotNil(t, got.Highlights.TopGroup)
	require.Equal(t, "g1", got.Highlights.TopGroup.GroupID)
}

func TestBuild_UnconvertibleLegIsEstimatedNotZeroed(t *testing.T) {
	got := Build(Input{
		Home:    "SEK",
		Convert: rateConvert(map[string]int64{"SEK": 1}), // no XYZ rate
		Totals: []CurrencyTotal{
			{Currency: "SEK", PaidMinor: 1000, ShareMinor: 1000, ExpenseCount: 1},
			{Currency: "XYZ", PaidMinor: 9999, ShareMinor: 9999, ExpenseCount: 1},
		},
		Counts: Counts{Expenses: 2, Groups: 1, ActiveDays: 1},
	})

	require.Equal(t, int64(1000), got.Converted.PaidMinor, "XYZ excluded, not zeroed into the sum")
	require.Equal(t, 1, got.Converted.EstimatedLegs)
	require.Equal(t, 1, got.Converted.ConvertedLegs)
	require.Equal(t, 2, got.Converted.TotalLegs)
	require.Len(t, got.ByCurrency, 2, "raw per-currency truth still reports both")
}

func TestBuild_CategoriesTopFiveThenOther(t *testing.T) {
	rows := []ExpenseRow{}
	// Seven categories with descending shares: 700,600,500,400,300,200,100.
	// Two of them (f, g) must fold — one folding row would not prove the
	// bucket accumulates.
	cats := []string{"a", "b", "c", "d", "e", "f", "g"}
	for i, c := range cats {
		rows = append(rows, ExpenseRow{
			ExpenseID: c, GroupID: "g1", GroupName: "G", Currency: "SEK",
			Category: c, Title: c, Date: day("2026-08-01"),
			ShareMinor: int64(700 - i*100),
		})
	}
	got := Build(Input{
		Home: "SEK", Convert: identityConvert, Rows: rows,
		Counts: Counts{Expenses: 7, Groups: 1, ActiveDays: 1},
		Totals: []CurrencyTotal{{Currency: "SEK", PaidMinor: 2800, ShareMinor: 2800, ExpenseCount: 7}},
	})

	require.Len(t, got.Categories, 6, "top 5 plus the synthetic other")
	require.Equal(t, "a", got.Categories[0].Slug)
	require.Equal(t, "e", got.Categories[4].Slug, "the fifth real category survives")
	require.Equal(t, OtherCategorySlug, got.Categories[5].Slug)
	require.Equal(t, int64(300), got.Categories[5].ShareMinor, "f(200) + g(100) folded")
	var sum int
	for _, c := range got.Categories {
		sum += c.Pct
	}
	require.Equal(t, 100, sum,
		"percentages must sum to exactly 100 — truncation alone would give 97")
}

func TestBuild_PreviousDeltaAndZeroPrior(t *testing.T) {
	base := Input{
		Home: "SEK", Convert: identityConvert,
		Totals: []CurrencyTotal{{Currency: "SEK", PaidMinor: 10000, ShareMinor: 6000, ExpenseCount: 1}},
		Counts: Counts{Expenses: 1, Groups: 1, ActiveDays: 1},
	}

	withPrev := base
	withPrev.Previous = []CurrencyTotal{{Currency: "SEK", PaidMinor: 5000, ShareMinor: 5000}}
	got := Build(withPrev)
	require.NotNil(t, got.Previous)
	require.Equal(t, int64(5000), got.Previous.PaidMinor)

	noPrev := base
	noPrev.Previous = nil
	got2 := Build(noPrev)
	require.Nil(t, got2.Previous, "no prior month means the UI omits the delta entirely")

	zeroPrev := base
	zeroPrev.Previous = []CurrencyTotal{{Currency: "SEK", PaidMinor: 0, ShareMinor: 0}}
	require.NotPanics(t, func() { Build(zeroPrev) }, "a zero prior month must not divide by zero")
}

func TestBuild_EmptyMonth(t *testing.T) {
	got := Build(Input{Home: "SEK", Convert: identityConvert})

	require.Empty(t, got.ByCurrency)
	require.Empty(t, got.Categories)
	require.Nil(t, got.Highlights.BiggestExpense)
	require.Nil(t, got.Highlights.TopGroup)
	require.Equal(t, int64(0), got.Converted.NetMinor)
	require.Equal(t, "SEK", got.Converted.Currency)
}

func TestBuild_CategoryPercentagesAlwaysSumTo100(t *testing.T) {
	// Shares chosen so plain truncation loses points: three-way splits of a
	// total that does not divide evenly by 100.
	cases := [][]int64{
		{100},                 // single bucket takes everything
		{50, 50},              // exact halves
		{1, 1, 1},             // 33/33/33 truncates to 99
		{7, 11, 13, 17, 19},   // primes, nothing divides cleanly
		{1000, 1, 1, 1, 1, 1}, // one dominant bucket plus a folded tail
	}
	for _, shares := range cases {
		rows := make([]ExpenseRow, 0, len(shares))
		for i, sh := range shares {
			slug := string(rune('a' + i))
			rows = append(rows, ExpenseRow{
				ExpenseID: slug, GroupID: "g1", GroupName: "G", Currency: "SEK",
				Category: slug, Title: slug, Date: day("2026-08-01"), ShareMinor: sh,
			})
		}
		got := Build(Input{Home: "SEK", Convert: identityConvert, Rows: rows})
		sum := 0
		for _, c := range got.Categories {
			sum += c.Pct
		}
		require.Equal(t, 100, sum, "shares %v must apportion to exactly 100", shares)
	}
}
