-- name: CreateActivity :one
INSERT INTO activity (id, group_id, actor_id, event_type, entity_id, entity_type, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListActivityByGroup :many
SELECT * FROM activity
WHERE group_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
