-- name: CreateSettlement :one
INSERT INTO settlements (id, group_id, from_member, to_member, amount, currency, note, method, created_by_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListSettlementsByGroup :many
SELECT * FROM settlements
WHERE group_id = $1
ORDER BY created_at DESC;

-- name: GetSettlement :one
SELECT * FROM settlements WHERE id = $1;

-- name: MarkSettlementReverted :one
-- Soft-revert a settlement. The caller (handler) is expected to have already
-- enforced authorization (caller must be from_member or to_member's user)
-- before calling this query. The query itself enforces the time gate
-- (< 24h since creation) and the "not already reverted" guard, so a race
-- between two reverts loses cleanly with pgx.ErrNoRows.
UPDATE settlements
SET reverted_at = NOW()
WHERE id = $1
  AND created_at > NOW() - INTERVAL '24 hours'
  AND reverted_at IS NULL
RETURNING *;
