-- name: UpsertPushToken :one
INSERT INTO push_tokens (id, user_id, token, platform)
VALUES ($1, $2, $3, $4)
ON CONFLICT (token) DO UPDATE
    SET user_id      = EXCLUDED.user_id,
        last_used_at = NOW()
RETURNING *;

-- name: DeletePushToken :exec
DELETE FROM push_tokens WHERE token = $1 AND user_id = $2;

-- name: ListPushTokensByUser :many
SELECT * FROM push_tokens WHERE user_id = $1;

-- name: ListPushTokensByGroup :many
SELECT pt.* FROM push_tokens pt
JOIN group_members gm ON gm.user_id = pt.user_id
WHERE gm.group_id = $1 AND gm.user_id != $2;
