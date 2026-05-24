-- usage_counters: per-user, per-feature metered usage on the hosted instance.
-- v1.0 use case: anti-abuse cap on free OCR (3/month). The hot path is the
-- reserve-and-refund pair; GetUsageCounter exists for the You-tab display.

-- name: GetUsageCounter :one
-- Read current state (used for UI display). Stale period_start means a
-- ReserveUsageSlot call would lazy-reset and return used=1; surfaces of this
-- query MUST account for that themselves (see internal/billing/counter.go).
SELECT user_id, feature, period_start, used
FROM usage_counters
WHERE user_id = $1 AND feature = $2;

-- name: ReserveUsageSlot :one
-- Atomically reserve a slot under the given cap. Combines lazy-reset across a
-- UTC month boundary with the increment, so the whole flow is one round-trip.
--
-- Semantics:
--   - Fresh user (no row) → INSERT used=1, period_start=current. Returns row.
--   - Existing row in current period, used < cap → UPDATE used+1. Returns row.
--   - Existing row in current period, used >= cap → WHERE filters out the
--     UPDATE; no row is returned. Caller treats 0 rows as "cap reached".
--   - Existing row in a *prior* period → period_start advances, used=1.
--     Returns row.
--
-- The WHERE on ON CONFLICT does the gating; PostgreSQL guarantees the
-- INSERT/UPDATE is atomic, so concurrent callers can't both pass the cap.
-- Parameters: user_id, feature, cap, period_start (current 1st-of-UTC-month
-- date, accepted as a parameter so tests can inject month boundaries
-- deterministically without freezing time).
INSERT INTO usage_counters (user_id, feature, period_start, used)
VALUES (sqlc.arg(user_id), sqlc.arg(feature), sqlc.arg(period_start), 1)
ON CONFLICT (user_id, feature) DO UPDATE
SET
    period_start = CASE
        WHEN usage_counters.period_start < EXCLUDED.period_start
            THEN EXCLUDED.period_start
        ELSE usage_counters.period_start
    END,
    used = CASE
        WHEN usage_counters.period_start < EXCLUDED.period_start THEN 1
        ELSE usage_counters.used + 1
    END
WHERE usage_counters.period_start < EXCLUDED.period_start
   OR usage_counters.used < sqlc.arg(cap)::int
RETURNING user_id, feature, period_start, used;

-- name: RefundUsageSlot :exec
-- Decrement after a downstream failure (e.g. Gemini rejected the image).
-- Guarded by period_start = current so a refund attempt that crosses a
-- month boundary doesn't decrement a freshly-reset counter. used > 0 makes
-- the decrement crash-safe under retries.
UPDATE usage_counters
SET used = used - 1
WHERE user_id = $1
  AND feature = $2
  AND period_start = $3
  AND used > 0;
