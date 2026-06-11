-- Unsettled-balance nudge job. Eligibility for a (user, group) pair:
--   * the user is a debtor (net_balance < 0) in at least one currency,
--   * the member's balance hasn't changed for at least after_days days
--     (balance_change_events — same definition as in balances.sql),
--   * the user has at least one push token,
--   * the pair was never nudged, or last_nudged_at is at least repeat_days old.

-- name: SelectNudgeEligiblePairs :many
-- Cross-instance scan used by the nudge tick. Returns distinct (user, group)
-- pairs to enqueue a fire job for, capped at max_pairs per tick.
WITH balance_change_events AS (
    SELECT
        gm.group_id,
        gm.id                                AS member_id,
        GREATEST(e.created_at, e.updated_at) AS changed_at
    FROM group_members gm
    JOIN expenses e
        ON e.group_id = gm.group_id AND NOT e.is_reimbursement
    LEFT JOIN expense_splits es
        ON es.expense_id = e.id AND es.member_id = gm.id
    WHERE (e.paid_by_id = gm.id OR es.member_id IS NOT NULL)

    UNION ALL

    SELECT
        gm.group_id,
        gm.id,
        GREATEST(s.created_at, COALESCE(s.reverted_at, s.created_at))
    FROM group_members gm
    JOIN settlements s
        ON s.group_id = gm.group_id
        AND (s.from_member = gm.id OR s.to_member = gm.id)
)
SELECT DISTINCT mb.user_id::TEXT AS user_id, mb.group_id
FROM member_balances mb
JOIN (
    SELECT group_id, member_id, MAX(changed_at) AS last_change_at
    FROM balance_change_events
    GROUP BY group_id, member_id
) lc ON lc.group_id = mb.group_id AND lc.member_id = mb.member_id
WHERE mb.user_id IS NOT NULL
  AND mb.currency IS NOT NULL
  AND mb.net_balance < 0
  AND lc.last_change_at <= NOW() - make_interval(days => sqlc.arg(after_days)::INT)
  AND EXISTS (
      SELECT 1 FROM push_tokens pt WHERE pt.user_id = mb.user_id
  )
  AND NOT EXISTS (
      SELECT 1 FROM balance_nudges bn
      WHERE bn.user_id = mb.user_id
        AND bn.group_id = mb.group_id
        AND bn.last_nudged_at > NOW() - make_interval(days => sqlc.arg(repeat_days)::INT)
  )
LIMIT sqlc.arg(max_pairs);

-- name: SelectNudgeDebts :many
-- Fire-side eligibility re-check for one (user, group) pair. One row per
-- owed currency (net_balance < 0), with the group name and the member's
-- last balance change. Empty result means "no longer eligible" — the
-- balance changed, was settled, or the pair was nudged inside repeat_days.
WITH balance_change_events AS (
    SELECT
        gm.group_id,
        gm.id                                AS member_id,
        GREATEST(e.created_at, e.updated_at) AS changed_at
    FROM group_members gm
    JOIN expenses e
        ON e.group_id = gm.group_id AND NOT e.is_reimbursement
    LEFT JOIN expense_splits es
        ON es.expense_id = e.id AND es.member_id = gm.id
    WHERE gm.user_id = sqlc.arg(user_id)
      AND gm.group_id = sqlc.arg(group_id)
      AND (e.paid_by_id = gm.id OR es.member_id IS NOT NULL)

    UNION ALL

    SELECT
        gm.group_id,
        gm.id,
        GREATEST(s.created_at, COALESCE(s.reverted_at, s.created_at))
    FROM group_members gm
    JOIN settlements s
        ON s.group_id = gm.group_id
        AND (s.from_member = gm.id OR s.to_member = gm.id)
    WHERE gm.user_id = sqlc.arg(user_id)
      AND gm.group_id = sqlc.arg(group_id)
)
SELECT
    g.name                         AS group_name,
    mb.currency,
    mb.net_balance,
    lc.last_change_at::TIMESTAMPTZ AS last_balance_change_at
FROM member_balances mb
JOIN groups g ON g.id = mb.group_id
JOIN (
    SELECT group_id, member_id, MAX(changed_at) AS last_change_at
    FROM balance_change_events
    GROUP BY group_id, member_id
) lc ON lc.group_id = mb.group_id AND lc.member_id = mb.member_id
WHERE mb.user_id = sqlc.arg(user_id)
  AND mb.group_id = sqlc.arg(group_id)
  AND mb.currency IS NOT NULL
  AND mb.net_balance < 0
  AND lc.last_change_at <= NOW() - make_interval(days => sqlc.arg(after_days)::INT)
  AND NOT EXISTS (
      SELECT 1 FROM balance_nudges bn
      WHERE bn.user_id = sqlc.arg(user_id)
        AND bn.group_id = sqlc.arg(group_id)
        AND bn.last_nudged_at > NOW() - make_interval(days => sqlc.arg(repeat_days)::INT)
  )
ORDER BY mb.currency;

-- name: UpsertBalanceNudge :exec
INSERT INTO balance_nudges (user_id, group_id, last_nudged_at)
VALUES ($1, $2, NOW())
ON CONFLICT (user_id, group_id) DO UPDATE SET last_nudged_at = NOW();
