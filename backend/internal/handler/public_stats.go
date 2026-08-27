package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/fx"
	"github.com/DowLucas/chara/internal/money"
)

// publicStatsTTL is how long a computed snapshot is reused. The endpoint is
// unauthenticated and linked from the marketing site, so it must not turn a
// traffic spike into a per-request aggregate scan of `expenses`.
const publicStatsTTL = 5 * time.Minute

// publicStatsCurrency is the currency every total is converted into before
// being summed. Chara stores expenses in whatever currency they were entered
// in; a cross-currency sum is meaningless without a common unit.
const publicStatsCurrency = "USD"

// PublicStatsHandler serves GET /api/public/stats: anonymous, aggregate-only
// usage figures intended for publication on the marketing site.
//
// WHAT THIS MAY EXPOSE, and why it is a deliberately short list: a total
// expense count, a total value converted to USD, the set of currencies that
// contributed, and the date of the oldest counted expense. Nothing here is
// per-group, per-user or per-expense, and no field can be narrowed by a query
// parameter — the endpoint takes no input at all. That is the whole privacy
// argument, and it only holds as long as the response struct stays this
// small. Do not add a breakdown dimension (by group, by country, by month)
// without rethinking it: a small instance plus a breakdown re-identifies
// individual households quickly.
//
// Groups flagged `exclude_from_stats` are omitted, which is how demo and seed
// data is kept out of a number the site presents as real.
type PublicStatsHandler struct {
	queries *db.Queries

	// now is a test seam so cache expiry can be exercised without sleeping.
	now func() time.Time

	mu       sync.Mutex
	cached   *publicStatsResponse
	cachedAt time.Time
}

func NewPublicStatsHandler(queries *db.Queries) *PublicStatsHandler {
	return &PublicStatsHandler{queries: queries, now: time.Now}
}

type publicStatsResponse struct {
	// Expenses counts every non-deleted expense in a non-excluded group,
	// including ones whose currency had no FX rate and so contributed no
	// value. Count and value can therefore disagree slightly; that is
	// preferred over dropping real activity from the headline number.
	Expenses int64 `json:"expenses"`

	// ValueUSD is the human string ("13432.51"); ValueUSDMinor is the same
	// figure in cents and is the authoritative one. Clients that round for
	// display should use the minor field and divide, not parse the string.
	ValueUSD      money.Amount `json:"value_usd"`
	ValueUSDMinor int64        `json:"value_usd_minor"`

	// Currencies that actually contributed to ValueUSD, sorted. A currency
	// present in the data but missing an FX rate is absent here, which makes
	// an understated total visible rather than silent.
	Currencies []string `json:"currencies"`

	// Since is the oldest counted expense (RFC3339 date), or null on an
	// instance with no data yet.
	Since *string `json:"since"`

	GeneratedAt time.Time `json:"generated_at"`
}

func (h *PublicStatsHandler) Stats(w http.ResponseWriter, r *http.Request) {
	snapshot, err := h.snapshot(r.Context())
	if err != nil {
		// Only reached when there is no cached value to fall back on.
		slog.ErrorContext(r.Context(), "public stats unavailable", "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "stats unavailable"})
		return
	}

	// Public, non-personalised, and already served from a process-local
	// cache — let the CDN and the browser hold it for the same window.
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	// The data is anonymous aggregate with no credentials attached, so any
	// origin may read it. This is set here rather than by widening the
	// global CORS allowlist, which governs authenticated endpoints.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(snapshot)
}

// snapshot returns a cached response, recomputing when stale. On a recompute
// failure a previously cached snapshot is served rather than an error: a
// marketing page showing five-minute-old numbers is a better outcome than one
// showing a broken widget because the pool was briefly saturated.
func (h *PublicStatsHandler) snapshot(ctx context.Context) (*publicStatsResponse, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.cached != nil && h.now().Sub(h.cachedAt) < publicStatsTTL {
		return h.cached, nil
	}

	fresh, err := h.compute(ctx)
	if err != nil {
		if h.cached != nil {
			slog.WarnContext(ctx, "public stats recompute failed, serving stale", "error", err)
			return h.cached, nil
		}
		return nil, err
	}

	h.cached, h.cachedAt = fresh, h.now()
	return fresh, nil
}

func (h *PublicStatsHandler) compute(ctx context.Context) (*publicStatsResponse, error) {
	rows, err := h.queries.PublicExpenseStatsByCurrency(ctx)
	if err != nil {
		return nil, err
	}

	asOf := h.now().UTC()
	out := &publicStatsResponse{Currencies: []string{}, GeneratedAt: asOf}

	var totalMinor int64
	for _, row := range rows {
		out.Expenses += row.ExpenseCount

		conv, err := fx.Convert(ctx, h.queries, row.TotalMinor, row.Currency, publicStatsCurrency, asOf)
		if err != nil {
			if errors.Is(err, fx.ErrRateUnavailable) {
				// ECB publishes ~30 quotes; anything outside that set (BDT,
				// for one) has no rate. Count the expenses, skip the value,
				// and leave the currency out of Currencies so the omission
				// is visible in the response.
				slog.WarnContext(ctx, "public stats: no FX rate, value omitted", "currency", row.Currency)
				continue
			}
			return nil, err
		}
		totalMinor += conv.AmountMinor
		out.Currencies = append(out.Currencies, row.Currency)
	}
	sort.Strings(out.Currencies)

	out.ValueUSDMinor = totalMinor
	out.ValueUSD = money.Amount(totalMinor)

	first, err := h.queries.PublicStatsFirstExpenseDate(ctx)
	if err != nil {
		return nil, err
	}
	if first.Valid {
		d := first.Time.UTC().Format(time.RFC3339)
		out.Since = &d
	}

	return out, nil
}
