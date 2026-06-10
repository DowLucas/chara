-- name: GetMemberBalance :one
SELECT * FROM member_balances
WHERE group_id = $1 AND member_id = $2;

-- name: ListGroupBalances :many
SELECT * FROM member_balances
WHERE group_id = $1 AND currency IS NOT NULL;

-- name: ListUserBalancesAcrossGroups :many
SELECT mb.* FROM member_balances mb
WHERE mb.user_id = $1 AND mb.currency IS NOT NULL;

-- name: ListUserBalancesWithLastChange :many
-- Cross-group balances for one user, each row annotated with
-- last_balance_change_at: the most recent event that could have changed that
-- member's balance in that group. Events are expenses where the member is the
-- payer or holds a split — GREATEST(created_at, updated_at), so edits and
-- soft-deletes count — and settlements where the member is either side, with
-- reverts counting via reverted_at. Reimbursements are skipped (balance-
-- neutral, same as member_balances). NULL when no such events exist.
--
-- The balance_change_events CTE is the canonical "when did this member's
-- balance last move" definition — reuse it (e.g. for a stale-debt nudge job)
-- instead of re-deriving the rule.
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
    WHERE gm.user_id = $1
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
    WHERE gm.user_id = $1
)
SELECT
    mb.group_id,
    mb.member_id,
    mb.user_id,
    mb.currency,
    mb.net_balance,
    lc.last_change_at::TIMESTAMPTZ AS last_balance_change_at
FROM member_balances mb
LEFT JOIN (
    SELECT group_id, member_id, MAX(changed_at) AS last_change_at
    FROM balance_change_events
    GROUP BY group_id, member_id
) lc ON lc.group_id = mb.group_id AND lc.member_id = mb.member_id
WHERE mb.user_id = $1 AND mb.currency IS NOT NULL;

-- name: ListUserLedgerLegs :many
-- Per-leg ledger entries that contribute to a user's net across every group
-- they're a member of. Each row is denominated in the row's canonical
-- (group) currency — the per-expense fx_rate was already applied
-- server-side at write time, so `signed_minor` is the final number for
-- balance math. The home-currency aggregator converts each leg to home
-- using ECB rates at the leg's `occurred_at` date (never today's rate).
--
-- Expense legs: (amount paid by user, if any) − (user's share). Reimbursements
-- skipped (they're balance-neutral by definition). Reverted settlements
-- skipped. Same convention as `member_balances`.
--
-- Settlement legs: +amount when user is from_member (debt cleared, more
-- owed-to-them); −amount when user is to_member.
SELECT
    'expense'                                    AS source,
    e.id                                         AS leg_id,
    e.group_id                                   AS group_id,
    COALESCE(e.expense_date, e.created_at::date) AS occurred_at,
    (CASE WHEN e.paid_by_id = gm.id THEN e.amount ELSE 0 END
        - COALESCE(es.share, 0))::BIGINT         AS signed_minor,
    e.currency                                   AS currency
FROM group_members gm
JOIN expenses e
    ON e.group_id = gm.group_id
    AND NOT e.is_deleted
    AND NOT e.is_reimbursement
LEFT JOIN expense_splits es
    ON es.expense_id = e.id AND es.member_id = gm.id
WHERE gm.user_id = $1
  AND (e.paid_by_id = gm.id OR es.share IS NOT NULL)

UNION ALL

SELECT
    'settlement'                  AS source,
    s.id                          AS leg_id,
    s.group_id                    AS group_id,
    s.created_at::date            AS occurred_at,
    (CASE WHEN s.from_member = gm.id THEN s.amount
          ELSE -s.amount END)::BIGINT AS signed_minor,
    s.currency                    AS currency
FROM group_members gm
JOIN settlements s
    ON s.group_id = gm.group_id
    AND s.reverted_at IS NULL
    AND (s.from_member = gm.id OR s.to_member = gm.id)
WHERE gm.user_id = $1;
