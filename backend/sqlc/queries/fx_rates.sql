-- name: UpsertFxRate :exec
-- Insert or update a single (base, quote, as_of) row. Caller is responsible
-- for batching when ingesting a full daily snapshot — Postgres handles
-- ~30 sequential UPSERTs in well under a second.
INSERT INTO fx_rates (base, quote, rate, as_of, source)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (base, quote, as_of) DO UPDATE
    SET rate = EXCLUDED.rate,
        source = EXCLUDED.source;

-- name: GetFxRate :one
-- Look up a single rate. For cross conversions (base ≠ stored base) callers
-- compose two lookups: get(EUR,HUF,d) and get(EUR,SEK,d), then divide.
SELECT base, quote, rate, as_of, source, created_at
FROM fx_rates
WHERE base = $1 AND quote = $2 AND as_of = $3;

-- name: GetClosestFxRate :one
-- Rate whose as_of is closest to the requested date, in either direction.
-- This is the only lookup used by Convert; it gracefully handles
-- weekends/holidays (no rate that day → picks the nearest business day)
-- and historical receipts older than our oldest snapshot (no rate before
-- that day → picks the freshest forward rate). The actual date used is
-- always returned to the caller for audit display.
SELECT base, quote, rate, as_of, source, created_at
FROM fx_rates
WHERE base = $1 AND quote = $2
ORDER BY ABS(as_of - $3) ASC, as_of DESC
LIMIT 1;

-- name: ListFxRatesForDate :many
-- All quotes for a given base+date — used by GET /api/fx/rates to ship the
-- full daily matrix to the client in one round-trip.
SELECT base, quote, rate, as_of, source, created_at
FROM fx_rates
WHERE base = $1 AND as_of = $2;

-- name: LatestFxAsOf :one
-- Most recent as_of present in the table for a given base. Lets callers
-- ask "what's the freshest day we have rates for?" without specifying a
-- target date.
SELECT MAX(as_of)::date AS as_of
FROM fx_rates
WHERE base = $1;

