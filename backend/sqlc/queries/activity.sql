-- name: CreateActivity :one
INSERT INTO activity (id, group_id, actor_id, event_type, entity_id, entity_type, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListActivityByGroup :many
SELECT * FROM activity
WHERE group_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListActivityForUser :many
SELECT a.id, a.group_id, a.actor_id, a.event_type, a.entity_id, a.entity_type, a.payload, a.created_at,
       g.name AS group_name,
       u.display_name AS actor_name
FROM activity a
JOIN group_members gm ON gm.group_id = a.group_id AND gm.user_id = $1
JOIN groups g ON g.id = a.group_id AND NOT g.is_archived
JOIN users u ON u.id = a.actor_id
ORDER BY a.created_at DESC
LIMIT $2 OFFSET $3;
