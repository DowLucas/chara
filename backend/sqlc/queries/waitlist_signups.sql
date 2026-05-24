-- waitlist_signups: hosted-instance soft-gate email capture during the
-- v1.0/v1.1 free beta. Primary trigger is the OCR cap modal; future triggers
-- (recurring expense tap, export tap) reuse this table.

-- name: UpsertWaitlistSignup :one
-- Idempotent on (user_id, email, trigger) so re-tapping the same gate just
-- bumps last_seen_at instead of duplicating rows. We deliberately don't
-- merge across different triggers — distinct triggers are independent
-- signals about which feature the user wants.
INSERT INTO waitlist_signups (id, user_id, email, trigger, source, locale)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, email, trigger) DO UPDATE
SET last_seen_at = NOW()
RETURNING id, user_id, email, trigger, source, locale, created_at, last_seen_at;

-- name: CountWaitlistByTrigger :one
-- Debugging / dashboard query. Cheap because of the (trigger, created_at)
-- index. Not used on a hot path.
SELECT COUNT(*) AS total
FROM waitlist_signups
WHERE trigger = $1;
