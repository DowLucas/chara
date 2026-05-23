-- name: CreateGroup :one
INSERT INTO groups (id, name, currency, language, created_by, invite_token)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetGroupByID :one
SELECT * FROM groups WHERE id = $1;

-- name: GetGroupByInviteToken :one
SELECT * FROM groups WHERE invite_token = $1 AND NOT is_archived;

-- name: ListGroupsByUserID :many
SELECT g.* FROM groups g
JOIN group_members gm ON gm.group_id = g.id
WHERE gm.user_id = $1 AND NOT g.is_archived
ORDER BY g.updated_at DESC;

-- name: UpdateGroup :one
UPDATE groups
SET name        = COALESCE(sqlc.narg(name), name),
    currency    = COALESCE(sqlc.narg(currency), currency),
    language    = COALESCE(sqlc.narg(language), language),
    is_archived = COALESCE(sqlc.narg(is_archived), is_archived),
    updated_at  = NOW()
WHERE id = $1
RETURNING *;

-- name: RegenerateInviteToken :one
UPDATE groups SET invite_token = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: GetGroupLockState :one
-- Cheap read of just the lock flag. Used by the requireGroupUnlocked
-- write-gate helper before opening a transaction.
SELECT is_locked FROM groups WHERE id = $1;

-- name: SetGroupLocked :one
UPDATE groups SET is_locked = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: GroupStats :one
-- Single-row aggregation for the GET /api/groups/{id}/stats endpoint.
-- Filters out soft-deleted and reimbursement rows so the figures mirror
-- the member_balances view's "what counts as a real expense" rule.
SELECT
    g.created_at,
    (SELECT COUNT(*) FROM group_members WHERE group_id = g.id)::bigint AS member_count,
    (SELECT COUNT(*) FROM expenses
        WHERE group_id = g.id AND NOT is_deleted AND NOT is_reimbursement)::bigint AS expense_count,
    (SELECT MIN(expense_date)::date FROM expenses
        WHERE group_id = g.id AND NOT is_deleted AND NOT is_reimbursement) AS first_expense_at,
    (SELECT MAX(expense_date)::date FROM expenses
        WHERE group_id = g.id AND NOT is_deleted AND NOT is_reimbursement) AS last_expense_at
FROM groups g
WHERE g.id = $1;

-- name: GroupStatsTotalsByCurrency :many
-- One row per currency with the sum of expense amounts in that currency.
-- Filter mirrors GroupStats.
SELECT currency, SUM(amount)::bigint AS total_minor_units
FROM expenses
WHERE group_id = $1 AND NOT is_deleted AND NOT is_reimbursement
GROUP BY currency
ORDER BY currency ASC;

-- name: GroupStatsTopSpender :one
-- The single top-spender row in the group base currency. Joined against
-- group_members so a paid_by row whose member was removed (impossible
-- today, but defensive) doesn't break the query. Tie-break by joined_at
-- then member id so the result is stable.
SELECT gm.id AS member_id,
       gm.user_id,
       gm.name AS display_name,
       SUM(e.amount)::bigint AS minor_units_paid,
       e.currency
FROM expenses e
JOIN group_members gm ON gm.id = e.paid_by_id
WHERE e.group_id = $1
  AND NOT e.is_deleted
  AND NOT e.is_reimbursement
  AND e.currency = $2
GROUP BY gm.id, gm.user_id, gm.name, gm.joined_at, e.currency
ORDER BY SUM(e.amount) DESC, gm.joined_at ASC, gm.id ASC
LIMIT 1;

-- name: HardDeleteGroup :exec
-- Cascade FKs on group_id handle the rest, but we delete in explicit
-- order to make the dependency chain readable and to keep the option of
-- adding non-cascading FKs later.
DELETE FROM groups WHERE id = $1;

-- name: ListMemberBalancesByGroup :many
-- Convenience read for the hard-delete and remove-member preconditions.
-- Returns one row per (member, currency) where net_balance != 0.
SELECT member_id, user_id, currency, net_balance
FROM member_balances
WHERE group_id = $1 AND currency IS NOT NULL AND net_balance != 0;

-- name: ListMemberOpenBalances :many
-- Open (non-zero) balances for a single member, used by leave/kick and
-- can-leave probe.
SELECT currency, net_balance
FROM member_balances
WHERE group_id = $1 AND member_id = $2 AND currency IS NOT NULL AND net_balance != 0;
