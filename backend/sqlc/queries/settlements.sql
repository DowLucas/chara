-- name: CreateSettlement :one
INSERT INTO settlements (id, group_id, from_member, to_member, amount, currency, note, created_by_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListSettlementsByGroup :many
SELECT * FROM settlements
WHERE group_id = $1
ORDER BY created_at DESC;
