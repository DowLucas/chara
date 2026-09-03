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
WHERE gm.group_id = $1 AND gm.user_id != $2 AND gm.removed_at IS NULL;

-- name: ListPushTokensByUsers :many
-- Tokens for an explicit set of recipient users (e.g. the debtors a creditor
-- is nudging). Unlike ListPushTokensByGroup this does not exclude an actor —
-- the caller supplies the exact recipient set.
SELECT * FROM push_tokens WHERE user_id = ANY($1::text[]);

-- name: ListAllPushTokens :many
-- Every registered device. Used by the operator broadcast endpoint to fan a
-- release-note notification out to all users.
-- DISTINCT ON (token) because the same raw Expo token may legitimately be
-- owned by several users (see UpsertPushToken) — that is one physical device,
-- and it must not receive the broadcast once per owning account. The most
-- recently used row wins, so the device is attributed to the account actually
-- signed in on it rather than a stale one.
SELECT DISTINCT ON (token) * FROM push_tokens
ORDER BY token, last_used_at DESC NULLS LAST, created_at DESC;
