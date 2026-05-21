package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/quits/internal/currency"
	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/fx"
)

type FxHandler struct {
	queries *db.Queries
}

func NewFxHandler(q *db.Queries) *FxHandler {
	return &FxHandler{queries: q}
}

type fxRateRow struct {
	Quote string `json:"quote"`
	Rate  string `json:"rate"`
}

type fxRatesResponse struct {
	Base   string      `json:"base"`
	AsOf   string      `json:"as_of"`
	Source string      `json:"source"`
	Rates  []fxRateRow `json:"rates"`
}

// Rates ships the most recent ECB snapshot for the default base (EUR). The
// client computes cross rates locally so we don't have to re-derive the
// full N×N matrix in every response — that would balloon the payload from
// ~30 rows to ~900 with no extra information.
//
// Query params (all optional):
//   - base: only EUR is supported for now; anything else returns 400.
//   - as_of: ISO date. Defaults to the latest day we have rates for.
func (h *FxHandler) Rates(w http.ResponseWriter, r *http.Request) {
	base := r.URL.Query().Get("base")
	if base == "" {
		base = "EUR"
	}
	if base != "EUR" {
		writeError(w, http.StatusBadRequest, "only base=EUR is supported")
		return
	}

	var asOf pgtype.Date
	if dateStr := r.URL.Query().Get("as_of"); dateStr != "" {
		t, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "as_of must be YYYY-MM-DD")
			return
		}
		asOf = pgtype.Date{Time: t, Valid: true}
	} else {
		latest, err := h.queries.LatestFxAsOf(r.Context(), base)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not resolve latest rate date")
			return
		}
		if !latest.Valid {
			writeError(w, http.StatusServiceUnavailable, "no fx rates available yet")
			return
		}
		asOf = latest
	}

	rows, err := h.queries.ListFxRatesForDate(r.Context(), db.ListFxRatesForDateParams{
		Base: base,
		AsOf: asOf,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load rates")
		return
	}

	resp := fxRatesResponse{
		Base:   base,
		AsOf:   asOf.Time.Format("2006-01-02"),
		Source: fx.SourceID,
		Rates:  make([]fxRateRow, 0, len(rows)),
	}
	for _, row := range rows {
		f, err := row.Rate.Float64Value()
		if err != nil {
			continue
		}
		resp.Rates = append(resp.Rates, fxRateRow{
			Quote: row.Quote,
			Rate:  strconv.FormatFloat(f.Float64, 'f', -1, 64),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

type fxConvertResponse struct {
	From         string `json:"from"`
	To           string `json:"to"`
	AmountMinor  int64  `json:"amount_minor"`         // input amount
	ResultMinor  int64  `json:"result_minor"`         // converted amount
	Rate         string `json:"rate"`                 // 1 from = Rate to, as a decimal string
	AsOf         string `json:"as_of"`                // rate date actually used
	Source       string `json:"source"`
}

// Convert returns the converted minor-unit amount + the rate used, for one
// specific transaction. Frontend uses this when previewing a non-group
// currency in Add Expense or rendering "≈ pay X in your currency" on the
// settle screen. We let the client do the math too via the /api/fx/rates
// matrix, but this endpoint is the easier integration when the UI only
// needs a single conversion.
//
// Required query params: from, to, amount_minor. Optional: as_of (ISO date).
func (h *FxHandler) Convert(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, fromOK := currency.Normalize(q.Get("from"))
	to, toOK := currency.Normalize(q.Get("to"))
	if !fromOK || !toOK {
		writeError(w, http.StatusBadRequest, "unknown currency code")
		return
	}

	amountStr := q.Get("amount_minor")
	if amountStr == "" {
		writeError(w, http.StatusBadRequest, "amount_minor is required")
		return
	}
	amount, err := strconv.ParseInt(amountStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "amount_minor must be an integer")
		return
	}

	asOf := time.Now().UTC()
	if dateStr := q.Get("as_of"); dateStr != "" {
		t, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "as_of must be YYYY-MM-DD")
			return
		}
		asOf = t
	}

	res, err := fx.Convert(r.Context(), h.queries, amount, from, to, asOf)
	if err != nil {
		if errors.Is(err, fx.ErrRateUnavailable) {
			writeError(w, http.StatusServiceUnavailable, "rate unavailable")
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusServiceUnavailable, "rate unavailable")
			return
		}
		writeError(w, http.StatusInternalServerError, "conversion failed")
		return
	}

	rateStr := res.Rate.Text('f', 8)
	writeJSON(w, http.StatusOK, fxConvertResponse{
		From:        from,
		To:          to,
		AmountMinor: amount,
		ResultMinor: res.AmountMinor,
		Rate:        rateStr,
		AsOf:        res.AsOf.Format("2006-01-02"),
		Source:      res.Source,
	})
}
