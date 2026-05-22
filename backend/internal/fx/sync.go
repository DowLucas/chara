package fx

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
)

// Syncer fetches the daily ECB snapshot and writes it to fx_rates. The
// embedded http.Client lets tests inject a stub.
type Syncer struct {
	Pool   *pgxpool.Pool
	Client *http.Client
}

// SyncOnce fetches and ingests one snapshot. Idempotent — running it
// repeatedly the same day is a no-op (upsert on PK).
func (s *Syncer) SyncOnce(ctx context.Context) error {
	snap, err := FetchLatest(ctx, s.Client)
	if err != nil {
		return err
	}
	q := db.New(s.Pool)
	if err := Ingest(ctx, q, snap); err != nil {
		return err
	}
	slog.Info("fx: ingested ECB snapshot", "as_of", snap.AsOf.Format("2006-01-02"), "rates", len(snap.Rates))
	return nil
}

// Run blocks until ctx is cancelled. Syncs immediately on start, then once
// per day. ECB publishes around 16:00 CET; we sync more frequently than
// strictly needed to absorb the publication delay without scheduling
// against the clock.
func (s *Syncer) Run(ctx context.Context) {
	// First-run sync: don't fail the process if ECB is briefly down, just
	// log and continue — the table is populated by subsequent ticks and
	// the API endpoint returns "rate unavailable" until then.
	if err := s.SyncOnce(ctx); err != nil {
		slog.Warn("fx: initial sync failed", "error", err)
	}

	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.SyncOnce(ctx); err != nil {
				slog.Warn("fx: scheduled sync failed", "error", err)
			}
		}
	}
}
