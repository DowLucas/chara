package fx

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/quits/internal/db"
)

// ErrRateUnavailable means we have no rate for at least one leg of the
// requested conversion on or before the requested date. Callers should
// surface this to the UI so the user knows the preview can't be shown
// rather than silently substituting 1:1.
var ErrRateUnavailable = errors.New("fx: rate unavailable")

// Conversion is the result of converting a minor-unit amount from one
// currency to another. Rate is always quoted as "1 from = Rate to", which
// is the convention everyone (including ECB) uses for display strings.
type Conversion struct {
	AmountMinor int64
	Rate        *big.Float
	AsOf        time.Time
	Source      string
}

// Convert converts amount from `from` to `to` using rates as of asOf (or
// the most recent business day before that if the exact day is missing —
// ECB doesn't publish on weekends or TARGET holidays). Both legs are
// resolved against EUR; if either side has no rate, ErrRateUnavailable
// is returned.
//
// Same-currency input is a no-op fast path (rate=1, no DB read).
func Convert(ctx context.Context, q *db.Queries, amount int64, from, to string, asOf time.Time) (*Conversion, error) {
	if from == to {
		return &Conversion{AmountMinor: amount, Rate: big.NewFloat(1), AsOf: asOf, Source: SourceID}, nil
	}

	asOfPg := pgtype.Date{Time: asOf, Valid: true}

	fromRate, fromAsOf, err := lookupEURRate(ctx, q, from, asOfPg)
	if err != nil {
		return nil, err
	}
	toRate, toAsOf, err := lookupEURRate(ctx, q, to, asOfPg)
	if err != nil {
		return nil, err
	}

	// rate(from→to) = rate(EUR→to) / rate(EUR→from). Use big.Float so the
	// division is rounded once at the end rather than accumulating float64
	// drift. ~25 digits of precision is overkill but the ints are tiny.
	rate := new(big.Float).SetPrec(80).Quo(toRate, fromRate)

	amt := new(big.Float).SetPrec(80).SetInt64(amount)
	converted := new(big.Float).SetPrec(80).Mul(amt, rate)

	// Round to nearest minor unit. big.Float→int64 truncates toward zero,
	// so add 0.5 (with the right sign) before converting.
	half := big.NewFloat(0.5)
	if amount < 0 {
		half.Neg(half)
	}
	rounded, _ := new(big.Float).Add(converted, half).Int64()

	// Use the older of the two leg dates so the displayed as_of doesn't
	// claim freshness we don't have.
	effAsOf := fromAsOf
	if toAsOf.Before(effAsOf) {
		effAsOf = toAsOf
	}

	return &Conversion{
		AmountMinor: rounded,
		Rate:        rate,
		AsOf:        effAsOf,
		Source:      SourceID,
	}, nil
}

// lookupEURRate returns rate(EUR→ccy) and the date it actually came from.
// EUR is the implicit identity (rate=1) so we don't need a self-row.
func lookupEURRate(ctx context.Context, q *db.Queries, ccy string, asOf pgtype.Date) (*big.Float, time.Time, error) {
	if ccy == "EUR" {
		return big.NewFloat(1), asOf.Time, nil
	}
	row, err := q.GetClosestFxRate(ctx, db.GetClosestFxRateParams{
		Base:  "EUR",
		Quote: ccy,
		AsOf:  asOf,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, time.Time{}, fmt.Errorf("%w: EUR→%s", ErrRateUnavailable, ccy)
		}
		return nil, time.Time{}, fmt.Errorf("fx: load EUR→%s: %w", ccy, err)
	}
	f, err := row.Rate.Float64Value()
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("fx: decode EUR→%s rate: %w", ccy, err)
	}
	return big.NewFloat(f.Float64), row.AsOf.Time, nil
}
