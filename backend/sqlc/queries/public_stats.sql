-- name: PublicExpenseStatsByCurrency :many
-- Aggregates behind GET /api/public/stats. Deliberately returns nothing that
-- identifies a group, a user or an individual expense — only per-currency
-- counts and sums over non-deleted expenses in groups not flagged as demo
-- data. Archived groups ARE included: an archived trip still happened, and
-- excluding them would make the public counter go down over time.
SELECT
    e.currency,
    COUNT(*)::bigint       AS expense_count,
    SUM(e.amount)::bigint  AS total_minor
FROM expenses e
JOIN groups g ON g.id = e.group_id
WHERE NOT e.is_deleted
  AND NOT g.exclude_from_stats
GROUP BY e.currency;

-- name: PublicStatsFirstExpenseDate :one
-- Oldest counted expense, so the site can say "since <month year>" without
-- hardcoding a launch date. NULL on an empty instance.
SELECT MIN(e.created_at)::timestamptz AS first_created_at
FROM expenses e
JOIN groups g ON g.id = e.group_id
WHERE NOT e.is_deleted
  AND NOT g.exclude_from_stats;
