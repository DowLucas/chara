-- Per-member net balance within a group, per currency.
-- Balances are always derived, never stored. This view is the source of truth.
CREATE VIEW member_balances AS
SELECT
    gm.group_id,
    gm.id        AS member_id,
    gm.user_id,
    e.currency,
    COALESCE(SUM(CASE WHEN e.paid_by_id = gm.id THEN e.amount ELSE 0 END), 0)
        - COALESCE(SUM(es.share), 0)                  AS net_balance
FROM group_members gm
LEFT JOIN expenses e
    ON e.group_id = gm.group_id AND NOT e.is_deleted AND NOT e.is_reimbursement
LEFT JOIN expense_splits es
    ON es.expense_id = e.id AND es.member_id = gm.id
GROUP BY gm.group_id, gm.id, gm.user_id, e.currency;
