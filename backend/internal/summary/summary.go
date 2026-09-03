// Package summary builds one user's monthly spend summary. It is
// deliberately pure: no database, no HTTP, no clock. The handler fetches
// rows and supplies a ConvertFunc; everything interesting happens here,
// where it can be unit-tested exhaustively.
//
// Spec: docs/superpowers/specs/2026-09-02-monthly-summary-design.md
package summary

import (
	"sort"
	"time"
)

// OtherCategorySlug is the bucket the tail of the category breakdown folds
// into. It is deliberately the catalog's own "other" slug (see
// internal/category) rather than a synthetic sentinel: the two mean the same
// thing to a reader — "not itemised further" — so they are merged into one
// row. Emitting both would render two rows the app labels identically, and
// the screen keys category rows by slug, so it would also collide.
const OtherCategorySlug = "other"

// maxCategories is how many real categories survive before folding.
const maxCategories = 5

type CurrencyTotal struct {
	Currency     string
	PaidMinor    int64
	ShareMinor   int64
	ExpenseCount int64
}

type ExpenseRow struct {
	ExpenseID  string
	GroupID    string
	GroupName  string
	Currency   string
	Category   string
	Title      string
	Date       time.Time
	ShareMinor int64
}

type Counts struct {
	Expenses   int64
	Groups     int64
	ActiveDays int64
}

// ConvertFunc converts `minor` from currency `from` into the home currency,
// at the rate in force on `on`. ok=false means no rate was available: the
// caller counts the leg as estimated and excludes it from the total. It is
// never treated as zero — a silent zero would understate the month.
type ConvertFunc func(minor int64, from string, on time.Time) (int64, bool)

type Input struct {
	Totals   []CurrencyTotal
	Rows     []ExpenseRow
	Counts   Counts
	Previous []CurrencyTotal
	Home     string
	Convert  ConvertFunc
}

type Converted struct {
	Currency      string
	PaidMinor     int64
	ShareMinor    int64
	NetMinor      int64
	TotalLegs     int
	ConvertedLegs int
	EstimatedLegs int
}

type Category struct {
	Slug       string
	ShareMinor int64
	Pct        int
}

type BiggestExpense struct {
	ExpenseID  string
	GroupID    string
	GroupName  string
	Title      string
	ShareMinor int64
	Currency   string
}

type TopGroup struct {
	GroupID    string
	Name       string
	ShareMinor int64
}

type Highlights struct {
	BiggestExpense *BiggestExpense
	TopGroup       *TopGroup
}

type PreviousTotals struct {
	PaidMinor  int64
	ShareMinor int64
	NetMinor   int64
}

type Summary struct {
	ByCurrency []CurrencyTotal
	Converted  Converted
	Counts     Counts
	Categories []Category
	Highlights Highlights
	Previous   *PreviousTotals
}

// Build assembles the summary. Every cross-currency figure goes through
// in.Convert; every per-currency figure is passed through untouched.
func Build(in Input) Summary {
	out := Summary{
		ByCurrency: in.Totals,
		Counts:     in.Counts,
		Converted:  Converted{Currency: in.Home},
	}

	// Converted headline. One leg per currency: the totals are already
	// summed per currency, so converting once per currency is both correct
	// and far cheaper than once per expense. Per-currency totals have no
	// single date, so they are converted with the zero time, which the
	// handler's converter maps onto the period's last day.
	for _, tot := range in.Totals {
		out.Converted.TotalLegs++
		paid, okPaid := in.Convert(tot.PaidMinor, tot.Currency, time.Time{})
		share, okShare := in.Convert(tot.ShareMinor, tot.Currency, time.Time{})
		if !okPaid || !okShare {
			out.Converted.EstimatedLegs++
			continue
		}
		out.Converted.ConvertedLegs++
		out.Converted.PaidMinor += paid
		out.Converted.ShareMinor += share
	}
	out.Converted.NetMinor = out.Converted.PaidMinor - out.Converted.ShareMinor

	// Ranking pass: categories, biggest expense, top group. All three rank
	// in converted units so a large-denomination currency cannot win on
	// digit count alone. Rows that cannot be converted are skipped from
	// ranking entirely — they are already reflected in ByCurrency.
	catTotals := map[string]int64{}
	groupTotals := map[string]int64{}
	groupNames := map[string]string{}
	var (
		biggest        *BiggestExpense
		biggestConv    int64
		topGroupID     string
		topGroupAmount int64
	)
	for _, row := range in.Rows {
		conv, ok := in.Convert(row.ShareMinor, row.Currency, row.Date)
		if !ok {
			continue
		}
		catTotals[row.Category] += conv
		groupTotals[row.GroupID] += conv
		groupNames[row.GroupID] = row.GroupName

		if biggest == nil || conv > biggestConv {
			biggestConv = conv
			r := row
			biggest = &BiggestExpense{
				ExpenseID:  r.ExpenseID,
				GroupID:    r.GroupID,
				GroupName:  r.GroupName,
				Title:      r.Title,
				ShareMinor: r.ShareMinor,
				Currency:   r.Currency,
			}
		}
	}
	for id, amt := range groupTotals {
		// Tie-break on group id so the result is stable across runs; Go map
		// iteration order is randomised and an unstable "top group" would
		// make the page flicker between refreshes.
		if amt > topGroupAmount || (amt == topGroupAmount && (topGroupID == "" || id < topGroupID)) {
			topGroupAmount = amt
			topGroupID = id
		}
	}
	out.Highlights.BiggestExpense = biggest
	if topGroupID != "" {
		out.Highlights.TopGroup = &TopGroup{
			GroupID: topGroupID, Name: groupNames[topGroupID], ShareMinor: topGroupAmount,
		}
	}
	out.Categories = foldCategories(catTotals)

	if in.Previous != nil {
		// Withheld entirely if any leg fails to convert. A partial total is
		// not a smaller month, it is an unknown one, and the screen turns
		// Previous into a percentage — so silently dropping a leg prints
		// "80% less than last month" when all that happened is that last
		// month had a currency with no rate.
		var prev PreviousTotals
		complete := true
		for _, tot := range in.Previous {
			paid, okPaid := in.Convert(tot.PaidMinor, tot.Currency, time.Time{})
			share, okShare := in.Convert(tot.ShareMinor, tot.Currency, time.Time{})
			if !okPaid || !okShare {
				complete = false
				break
			}
			prev.PaidMinor += paid
			prev.ShareMinor += share
		}
		if complete {
			prev.NetMinor = prev.PaidMinor - prev.ShareMinor
			out.Previous = &prev
		}
	}

	return out
}

// foldCategories sorts by share descending and folds everything past the
// top five into a synthetic "other" bucket. Percentages are computed against
// the grand total using integer division; the remainder lands nowhere, which
// is why the tests assert 100 ±1 rather than exactly 100.
func foldCategories(totals map[string]int64) []Category {
	if len(totals) == 0 {
		return nil
	}
	type kv struct {
		slug string
		amt  int64
	}
	pairs := make([]kv, 0, len(totals))
	var grand int64
	// The catalog's own "other" never competes for a top-five slot: it is
	// seeded straight into the fold bucket, so however the ranking falls out
	// there is exactly one Other row.
	other := totals[OtherCategorySlug]
	for slug, amt := range totals {
		grand += amt
		if slug == OtherCategorySlug {
			continue
		}
		pairs = append(pairs, kv{slug, amt})
	}
	// Descending by amount, then by slug so equal amounts order stably.
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].amt != pairs[j].amt {
			return pairs[i].amt > pairs[j].amt
		}
		return pairs[i].slug < pairs[j].slug
	})

	out := make([]Category, 0, maxCategories+1)
	for i, p := range pairs {
		if i < maxCategories {
			out = append(out, Category{Slug: p.slug, ShareMinor: p.amt})
			continue
		}
		other += p.amt
	}
	if other > 0 {
		out = append(out, Category{Slug: OtherCategorySlug, ShareMinor: other})
		// Rank it rather than leaving it last. Because the catalog's own
		// "other" is seeded into this bucket it can be larger than rows
		// above it, and the screen renders the slice in order — appending
		// gave percentages that descended and then jumped back up.
		sort.SliceStable(out, func(i, j int) bool {
			return out[i].ShareMinor > out[j].ShareMinor
		})
	}
	apportionPct(out, grand)
	return out
}

// apportionPct fills in Pct so the values sum to exactly 100.
//
// Plain integer division truncates every bucket, and across six buckets the
// lost fractions add up: 700/600/500/400/300/300 of 2800 floors to
// 25/21/17/14/10/10 = 97. A category breakdown that visibly sums to 97%
// reads as a bug. Largest-remainder (Hamilton) apportionment hands the
// leftover points to the buckets with the largest truncated fractions, in
// order, which keeps the total honest and the ordering stable.
func apportionPct(cats []Category, grand int64) {
	if grand <= 0 || len(cats) == 0 {
		return
	}
	type rem struct {
		idx int
		r   int64
	}
	remainders := make([]rem, 0, len(cats))
	assigned := 0
	for i := range cats {
		scaled := cats[i].ShareMinor * 100
		cats[i].Pct = int(scaled / grand)
		assigned += cats[i].Pct
		remainders = append(remainders, rem{idx: i, r: scaled % grand})
	}
	leftover := 100 - assigned
	if leftover <= 0 {
		return
	}
	// Descending remainder; ties keep input order, which is already share
	// order, so the bigger category wins the extra point.
	sort.SliceStable(remainders, func(i, j int) bool { return remainders[i].r > remainders[j].r })
	for i := 0; i < leftover && i < len(remainders); i++ {
		cats[remainders[i].idx].Pct++
	}
}
