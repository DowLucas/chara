package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/fx"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/summary"
)

// periodPattern matches a calendar month, 'YYYY-MM'. Rejecting '2026-8' and
// '2026-13' at the edge keeps the date arithmetic below total.
var periodPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

type SummaryHandler struct {
	queries *db.Queries
}

func NewSummaryHandler(queries *db.Queries) *SummaryHandler {
	return &SummaryHandler{queries: queries}
}

type summaryCurrencyResponse struct {
	Currency     string `json:"currency"`
	Paid         string `json:"paid"`
	Share        string `json:"share"`
	ExpenseCount int64  `json:"expense_count"`
}

type summaryConvertedResponse struct {
	Currency      string `json:"currency"`
	Paid          string `json:"paid"`
	Share         string `json:"share"`
	Net           string `json:"net"`
	TotalLegs     int    `json:"total_legs"`
	ConvertedLegs int    `json:"converted_legs"`
	EstimatedLegs int    `json:"estimated_legs"`
}

type summaryCountsResponse struct {
	Expenses   int64 `json:"expenses"`
	Groups     int64 `json:"groups"`
	ActiveDays int64 `json:"active_days"`
	// ActiveDates are the days of the month (1-31) the user had spend on.
	// active_days is the tally; the summary screen's day grid needs to know
	// WHICH days, and a count cannot be turned back into a set. Always a
	// list, never null — the app indexes it.
	ActiveDates []int `json:"active_dates"`
}

type summaryCategoryResponse struct {
	Slug  string `json:"slug"`
	Share string `json:"share"`
	Pct   int    `json:"pct"`
}

type summaryBiggestExpenseResponse struct {
	ExpenseID string `json:"expense_id"`
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
	Title     string `json:"title"`
	Share     string `json:"share"`
	Currency  string `json:"currency"`
}

type summaryTopGroupResponse struct {
	GroupID string `json:"group_id"`
	Name    string `json:"name"`
	Share   string `json:"share"`
}

type summaryHighlightsResponse struct {
	BiggestExpense *summaryBiggestExpenseResponse `json:"biggest_expense"`
	TopGroup       *summaryTopGroupResponse       `json:"top_group"`
}

type summaryPreviousResponse struct {
	Paid  string `json:"paid"`
	Share string `json:"share"`
	Net   string `json:"net"`
}

type SummaryResponse struct {
	Period     string                    `json:"period"`
	ByCurrency []summaryCurrencyResponse `json:"by_currency"`
	Converted  summaryConvertedResponse  `json:"converted"`
	Counts     summaryCountsResponse     `json:"counts"`
	Categories []summaryCategoryResponse `json:"categories"`
	Highlights summaryHighlightsResponse `json:"highlights"`
	Previous   *summaryPreviousResponse  `json:"previous"`
	// FirstPeriod is the earliest month with any qualifying expense, so the
	// screen knows when to stop offering "previous month". Empty when the
	// user has never had one.
	FirstPeriod string `json:"first_period"`
}

// Summary returns one user's spend summary for one calendar month, across
// every group they belong to on this server.
//
// Hosted-only (see the route registration). Computed live per request: no
// snapshot table, so a back-dated or corrected expense is reflected the next
// time the page is opened. That is a deliberate trade — see §11 of the spec.
//
// Spec: docs/superpowers/specs/2026-09-02-monthly-summary-design.md
func (h *SummaryHandler) Summary(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	period := r.URL.Query().Get("period")
	if !periodPattern.MatchString(period) {
		writeError(w, http.StatusBadRequest, "period must be YYYY-MM")
		return
	}
	home := r.URL.Query().Get("in")
	if !iso4217.MatchString(home) {
		writeError(w, http.StatusBadRequest, "in must be a 3-letter ISO 4217 code")
		return
	}

	start, err := time.Parse("2006-01", period)
	if err != nil {
		writeError(w, http.StatusBadRequest, "period must be YYYY-MM")
		return
	}
	now := time.Now().UTC()
	if start.After(time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)) {
		writeError(w, http.StatusBadRequest, "period is in the future")
		return
	}
	end := start.AddDate(0, 1, 0)
	prevStart := start.AddDate(0, -1, 0)

	in, hardFX, err := h.loadInput(r.Context(), claims.UserID, home, start, end, prevStart)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	built := summary.Build(in)
	// Checked after Build, because the conversions run inside it. A genuine
	// FX failure (not a missing rate) would otherwise ship an understated
	// total dressed up as an estimate.
	if err := hardFX(); err != nil {
		slog.Error("summary: fx conversion failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "fx conversion failed")
		return
	}

	resp := SummaryResponse{
		Period: period,
		Converted: summaryConvertedResponse{
			Currency:      built.Converted.Currency,
			Paid:          money.Amount(built.Converted.PaidMinor).String(),
			Share:         money.Amount(built.Converted.ShareMinor).String(),
			Net:           money.Amount(built.Converted.NetMinor).String(),
			TotalLegs:     built.Converted.TotalLegs,
			ConvertedLegs: built.Converted.ConvertedLegs,
			EstimatedLegs: built.Converted.EstimatedLegs,
		},
		Counts: summaryCountsResponse{
			Expenses:    built.Counts.Expenses,
			Groups:      built.Counts.Groups,
			ActiveDays:  built.Counts.ActiveDays,
			ActiveDates: []int{},
		},
	}
	// Explicit empty slices, not nil: the app reads `by_currency.length`
	// and a JSON null would crash it.
	resp.ByCurrency = make([]summaryCurrencyResponse, 0, len(built.ByCurrency))
	for _, c := range built.ByCurrency {
		resp.ByCurrency = append(resp.ByCurrency, summaryCurrencyResponse{
			Currency:     c.Currency,
			Paid:         money.Amount(c.PaidMinor).String(),
			Share:        money.Amount(c.ShareMinor).String(),
			ExpenseCount: c.ExpenseCount,
		})
	}
	resp.Categories = make([]summaryCategoryResponse, 0, len(built.Categories))
	for _, c := range built.Categories {
		resp.Categories = append(resp.Categories, summaryCategoryResponse{
			Slug: c.Slug, Share: money.Amount(c.ShareMinor).String(), Pct: c.Pct,
		})
	}
	if b := built.Highlights.BiggestExpense; b != nil {
		resp.Highlights.BiggestExpense = &summaryBiggestExpenseResponse{
			ExpenseID: b.ExpenseID, GroupID: b.GroupID, GroupName: b.GroupName,
			Title: b.Title, Share: money.Amount(b.ShareMinor).String(), Currency: b.Currency,
		}
	}
	if g := built.Highlights.TopGroup; g != nil {
		resp.Highlights.TopGroup = &summaryTopGroupResponse{
			GroupID: g.GroupID, Name: g.Name, Share: money.Amount(g.ShareMinor).String(),
		}
	}
	if p := built.Previous; p != nil {
		resp.Previous = &summaryPreviousResponse{
			Paid:  money.Amount(p.PaidMinor).String(),
			Share: money.Amount(p.ShareMinor).String(),
			Net:   money.Amount(p.NetMinor).String(),
		}
	}

	// Day-of-month numbers for the grid. A failure is not worth failing the
	// page over: the grid degrades to "no days marked" while every number on
	// the screen stays right.
	if dates, err := h.queries.SummaryActiveDays(r.Context(), db.SummaryActiveDaysParams{
		UserID:      pgtype.Text{String: claims.UserID, Valid: true},
		PeriodStart: pgtype.Date{Time: start, Valid: true},
		PeriodEnd:   pgtype.Date{Time: end, Valid: true},
	}); err != nil {
		slog.Warn("summary: active days lookup failed", "error", err, "user_id", claims.UserID)
	} else {
		for _, d := range dates {
			if d.Valid {
				resp.Counts.ActiveDates = append(resp.Counts.ActiveDates, d.Time.Day())
			}
		}
	}

	// A failure here is not worth failing the page over — first_period only
	// bounds the screen's "previous month" arrow — but it must not pass
	// silently: an empty value reads as "no earlier month" and hides the
	// arrow, which looks like correct behaviour rather than a fault.
	first, err := h.queries.FirstExpenseMonthForUser(r.Context(),
		pgtype.Text{String: claims.UserID, Valid: true})
	switch {
	case err != nil:
		slog.Warn("summary: first expense month lookup failed",
			"error", err, "user_id", claims.UserID)
	case first.Valid:
		resp.FirstPeriod = first.Time.Format("2006-01")
	}

	writeJSON(w, http.StatusOK, resp)
}

// loadInput fetches every row the aggregator needs and wraps fx.Convert in
// the ConvertFunc shape. A missing rate becomes ok=false (an estimated leg)
// rather than failing the page — the same posture MyNet takes: degrade one
// leg, not the whole request.
//
// Any OTHER fx error is a real failure (a database problem reading the rate
// table, say) and must not masquerade as a missing rate: doing so renders a
// silently understated total, which is worse than an error the user can
// retry. ConvertFunc has no error channel, so the first hard failure is
// captured in hardErr and the caller turns it into a 500 — matching MyNet,
// which 500s on a non-ErrRateUnavailable error.
func (h *SummaryHandler) loadInput(
	ctx context.Context, userID, home string, start, end, prevStart time.Time,
) (summary.Input, func() error, error) {
	uid := pgtype.Text{String: userID, Valid: true}
	startPg := pgtype.Date{Time: start, Valid: true}
	endPg := pgtype.Date{Time: end, Valid: true}
	prevStartPg := pgtype.Date{Time: prevStart, Valid: true}

	totals, err := h.queries.SummaryTotalsByCurrency(ctx, db.SummaryTotalsByCurrencyParams{
		UserID: uid, PeriodStart: startPg, PeriodEnd: endPg,
	})
	if err != nil {
		return summary.Input{}, nil, err
	}
	counts, err := h.queries.SummaryCounts(ctx, db.SummaryCountsParams{
		UserID: uid, PeriodStart: startPg, PeriodEnd: endPg,
	})
	if err != nil {
		return summary.Input{}, nil, err
	}
	rows, err := h.queries.SummaryRowsForRanking(ctx, db.SummaryRowsForRankingParams{
		UserID: uid, PeriodStart: startPg, PeriodEnd: endPg,
	})
	if err != nil {
		return summary.Input{}, nil, err
	}
	prevTotals, err := h.queries.SummaryTotalsByCurrency(ctx, db.SummaryTotalsByCurrencyParams{
		UserID: uid, PeriodStart: prevStartPg, PeriodEnd: startPg,
	})
	if err != nil {
		return summary.Input{}, nil, err
	}

	// Captured by the ConvertFunc below and checked by the caller. Not a
	// data race: Build calls Convert synchronously on this goroutine.
	var hardErr error

	in := summary.Input{
		Home: home,
		Counts: summary.Counts{
			Expenses:   counts.ExpenseCount,
			Groups:     counts.GroupCount,
			ActiveDays: counts.ActiveDays,
		},
		Convert: func(minor int64, from string, on time.Time) (int64, bool) {
			if on.IsZero() {
				// Per-currency totals have no single date; value them at the
				// last day of the period, the closest thing to "the rate in
				// force while the month happened".
				on = end.AddDate(0, 0, -1)
			}
			conv, err := fx.Convert(ctx, h.queries, minor, from, home, on)
			if err != nil {
				if !errors.Is(err, fx.ErrRateUnavailable) && hardErr == nil {
					hardErr = err
				}
				return 0, false
			}
			return conv.AmountMinor, true
		},
	}
	for _, t := range totals {
		in.Totals = append(in.Totals, summary.CurrencyTotal{
			Currency: t.Currency, PaidMinor: t.PaidMinor,
			ShareMinor: t.ShareMinor, ExpenseCount: t.ExpenseCount,
		})
	}
	for _, t := range prevTotals {
		in.Previous = append(in.Previous, summary.CurrencyTotal{
			Currency: t.Currency, PaidMinor: t.PaidMinor,
			ShareMinor: t.ShareMinor, ExpenseCount: t.ExpenseCount,
		})
	}
	for _, r := range rows {
		in.Rows = append(in.Rows, summary.ExpenseRow{
			ExpenseID: r.ExpenseID, GroupID: r.GroupID, GroupName: r.GroupName,
			Currency: r.Currency, Category: r.Category, Title: r.Title,
			Date: r.ExpenseDate.Time, ShareMinor: r.ShareMinor,
		})
	}
	return in, func() error { return hardErr }, nil
}
