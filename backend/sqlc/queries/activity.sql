-- name: CreateActivity :one
INSERT INTO activity (id, group_id, actor_id, event_type, entity_id, entity_type, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListActivityByGroup :many
SELECT * FROM activity
WHERE group_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListActivityByGroupWithActor :many
SELECT a.id, a.group_id, a.actor_id, a.event_type, a.entity_id, a.entity_type, a.payload, a.created_at,
       u.display_name AS actor_name
FROM activity a
JOIN users u ON u.id = a.actor_id
WHERE a.group_id = $1
ORDER BY a.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetRecentExpenseUpdateActivity :one
-- Find a recent expense_edited activity row by the same actor on the same
-- expense within the last 5 minutes. Used to collapse rapid edits into a
-- single feed row.
SELECT id, payload, created_at FROM activity
WHERE actor_id = $1
  AND entity_id = $2
  AND event_type = 'expense_edited'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 1;

-- name: UpdateActivityPayload :exec
-- Replace the payload of an existing activity row and refresh its created_at
-- so the row floats to the top of the feed.
UPDATE activity
SET payload = $2, created_at = NOW()
WHERE id = $1;

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
