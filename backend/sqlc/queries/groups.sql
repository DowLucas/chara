-- name: CreateGroup :one
INSERT INTO groups (id, name, currency, language, created_by, invite_token)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetGroupByID :one
SELECT * FROM groups WHERE id = $1;

-- name: GetGroupByInviteToken :one
SELECT * FROM groups WHERE invite_token = $1;

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
