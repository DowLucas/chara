DROP VIEW IF EXISTS member_balances;

DROP INDEX IF EXISTS group_members_group_user;
CREATE UNIQUE INDEX group_members_group_user ON group_members(group_id, user_id)
    WHERE user_id IS NOT NULL;

ALTER TABLE group_members DROP COLUMN removed_at;

CREATE VIEW member_balances AS
WITH expense_balance AS (
    SELECT
        gm.group_id,
        gm.id        AS member_id,
        gm.user_id,
        e.currency,
        COALESCE(SUM(CASE WHEN e.paid_by_id = gm.id THEN e.amount ELSE 0 END), 0)
            - COALESCE(SUM(COALESCE(es.share, 0)), 0) AS expense_net
    FROM group_members gm
    LEFT JOIN expenses e
        ON e.group_id = gm.group_id AND NOT e.is_deleted AND NOT e.is_reimbursement
    LEFT JOIN expense_splits es
        ON es.expense_id = e.id AND es.member_id = gm.id
    GROUP BY gm.group_id, gm.id, gm.user_id, e.currency
),
settlement_out AS (
    SELECT from_member AS member_id, group_id, currency, SUM(amount) AS total
    FROM settlements
    WHERE reverted_at IS NULL
    GROUP BY from_member, group_id, currency
),
settlement_in AS (
    SELECT to_member AS member_id, group_id, currency, SUM(amount) AS total
    FROM settlements
    WHERE reverted_at IS NULL
    GROUP BY to_member, group_id, currency
)
SELECT
    eb.group_id,
    eb.member_id,
    eb.user_id,
    eb.currency,
    (eb.expense_net
        + COALESCE(so.total, 0)
        - COALESCE(si.total, 0))::BIGINT AS net_balance
FROM expense_balance eb
LEFT JOIN settlement_out so
    ON so.member_id = eb.member_id AND so.group_id = eb.group_id AND so.currency = eb.currency
LEFT JOIN settlement_in si
    ON si.member_id = eb.member_id AND si.group_id = eb.group_id AND si.currency = eb.currency;
