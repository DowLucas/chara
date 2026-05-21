-- name: CreateGroupMember :one
INSERT INTO group_members (id, group_id, user_id, name, role, is_ghost)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetGroupMember :one
SELECT * FROM group_members WHERE id = $1;

-- name: GetGroupMemberByUserAndGroup :one
SELECT * FROM group_members
WHERE group_id = $1 AND user_id = $2;

-- name: ListGroupMembers :many
SELECT * FROM group_members WHERE group_id = $1 ORDER BY joined_at ASC;

-- name: ListGroupMembersWithUser :many
-- Group members joined with each member's user.swish_number for the
-- members API. Ghost members (no user_id) get NULL swish_number.
SELECT gm.id, gm.group_id, gm.user_id, gm.name, gm.role, gm.is_ghost, gm.joined_at,
       u.swish_number
FROM group_members gm
LEFT JOIN users u ON u.id = gm.user_id
WHERE gm.group_id = $1
ORDER BY gm.joined_at ASC;

-- name: UpdateGroupMemberName :one
UPDATE group_members SET name = $2 WHERE id = $1 RETURNING *;

-- name: UpdateGroupMemberNamesByUserID :exec
UPDATE group_members SET name = $2 WHERE user_id = $1;

-- name: DeleteGroupMember :exec
DELETE FROM group_members WHERE id = $1;

-- name: ClaimGhostMember :one
UPDATE group_members
SET user_id  = $2,
    is_ghost = FALSE
WHERE id = $1 AND is_ghost = TRUE
RETURNING *;
