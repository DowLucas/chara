// Package fx pulls and stores daily FX reference rates from the European
// Central Bank. ECB publishes one base (EUR) and ~30 quote currencies; cross
// conversions (e.g. HUF→SEK) are derived at read time via EUR.
//
// Why ECB and not a commercial feed: rates are free, no API key, published
// once per CET business day at ~16:00, and the central bank attribution is
// defensible in audit. Currencies outside the ECB feed (most African and
// some Asian/Middle-Eastern minor codes) are accepted by the app but won't
// have an FX preview — callers must handle missing-rate gracefully.
package fx

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/quits/internal/db"
)

// SourceID is recorded in fx_rates.source for every row we ingest. Bumping
// this requires a follow-up migration to backfill or relabel old rows.
const SourceID = "ECB"

// FeedURL is the ECB's daily-rate XML endpoint. Stable since the early 2000s,
// publicly cacheable, no auth.
const FeedURL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

// Snapshot is one daily set of rates relative to EUR.
type Snapshot struct {
	AsOf  time.Time          // calendar day the rates apply to
	Rates map[string]float64 // quote currency → rate (EUR = 1 implicitly)
}

// ecbEnvelope matches the structure of eurofxref-daily.xml:
//   <gesmes:Envelope>
//     <Cube>
//       <Cube time="2026-05-21">
//         <Cube currency="USD" rate="1.0824"/>
//         …
type ecbEnvelope struct {
	XMLName xml.Name `xml:"Envelope"`
	Cube    struct {
		Cube struct {
			Time  string `xml:"time,attr"`
			Rates []struct {
				Currency string `xml:"currency,attr"`
				Rate     string `xml:"rate,attr"`
			} `xml:"Cube"`
		} `xml:"Cube"`
	} `xml:"Cube"`
}

// FetchLatest pulls the most recent daily snapshot from ECB. Network errors
// and malformed responses are wrapped with context so callers can decide
// whether to retry or fall back.
func FetchLatest(ctx context.Context, client *http.Client) (*Snapshot, error) {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, FeedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("fx: build request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fx: fetch ECB feed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("fx: ECB returned %d: %s", resp.StatusCode, string(body))
	}

	var env ecbEnvelope
	if err := xml.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, fmt.Errorf("fx: decode ECB XML: %w", err)
	}

	day := env.Cube.Cube.Time
	if day == "" {
		return nil, errors.New("fx: ECB response missing date")
	}
	asOf, err := time.Parse("2006-01-02", day)
	if err != nil {
		return nil, fmt.Errorf("fx: parse ECB date %q: %w", day, err)
	}

	out := &Snapshot{AsOf: asOf, Rates: make(map[string]float64, len(env.Cube.Cube.Rates))}
	for _, r := range env.Cube.Cube.Rates {
		f, err := strconv.ParseFloat(r.Rate, 64)
		if err != nil {
			// Skip unparsable rows rather than failing the whole snapshot —
			// the ECB feed is well-formed in practice but we'd rather ingest
			// 29 rates than zero if one row is mangled.
			continue
		}
		out.Rates[r.Currency] = f
	}
	if len(out.Rates) == 0 {
		return nil, errors.New("fx: ECB response had no rates")
	}
	return out, nil
}

// Ingest writes a Snapshot into fx_rates using the provided Queries handle.
// The caller decides whether to wrap this in a transaction; we don't here
// because the upsert is per-row idempotent and a partial ingest is still
// useful (better to have 29 rates than to roll back when row 30 fails).
func Ingest(ctx context.Context, q *db.Queries, snap *Snapshot) error {
	asOf := pgtype.Date{Time: snap.AsOf, Valid: true}
	for quote, rate := range snap.Rates {
		var num pgtype.Numeric
		if err := num.Scan(strconv.FormatFloat(rate, 'f', -1, 64)); err != nil {
			return fmt.Errorf("fx: encode rate for %s: %w", quote, err)
		}
		if err := q.UpsertFxRate(ctx, db.UpsertFxRateParams{
			Base:   "EUR",
			Quote:  quote,
			Rate:   num,
			AsOf:   asOf,
			Source: SourceID,
		}); err != nil {
			return fmt.Errorf("fx: upsert %s: %w", quote, err)
		}
	}
	return nil
}
