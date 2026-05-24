-- name: GetMemberBalance :one
SELECT * FROM member_balances
WHERE group_id = $1 AND member_id = $2;

-- name: ListGroupBalances :many
SELECT * FROM member_balances
WHERE group_id = $1 AND currency IS NOT NULL;

-- name: ListUserBalancesAcrossGroups :many
SELECT mb.* FROM member_balances mb
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
