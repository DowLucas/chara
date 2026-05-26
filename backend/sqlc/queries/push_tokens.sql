-- name: UpsertPushToken :one
-- Conflict target is (user_id, token), NOT token alone. This prevents the
-- push-token hijack where user B submits user A's token and silently steals
-- A's push delivery. Each user owns their own row; the same raw Expo token
-- may legitimately appear under multiple user_ids (e.g. a shared device or
-- a multi-server-accounts install) without one overwriting the other.
INSERT INTO push_tokens (id, user_id, token, platform)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, token) DO UPDATE
    SET platform     = EXCLUDED.platform,
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
