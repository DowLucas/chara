-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetActiveUserByID :one
-- Used by the auth middleware to reject any JWT whose subject has been
-- soft-deleted via DELETE /api/me. Returns no row → the token is invalid.
SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL;

-- name: SoftDeleteUser :exec
-- Apple Guideline 5.1.1(v) account self-deletion. Marks the user deleted,
-- nulls PII, and rewrites the unique email to a sentinel so the original
-- address is free to be re-registered. group_members rows are NOT touched
-- here — the caller does that explicitly in the same transaction so the
-- balance check and the FK detach stay together.
UPDATE users
SET deleted_at        = NOW(),
    email             = 'deleted-' || id || '@deleted.invalid',
    display_name      = '',
    phone             = NULL,
    avatar_url        = NULL,
    avatar_object_key = NULL,
    avatar_updated_at = NULL,
    updated_at        = NOW()
WHERE id = $1
  AND deleted_at IS NULL;

-- name: GhostifyGroupMembersForUser :exec
-- Detach every group_members row from a deleting user. The row itself
-- stays (so expense.paid_by_id / expense_splits.member_id keep resolving)
-- but user_id is NULLed and is_ghost flips true. The unique partial index
-- (group_id, user_id) WHERE user_id IS NOT NULL keeps this safe.
UPDATE group_members
SET user_id  = NULL,
    is_ghost = TRUE
WHERE user_id = $1;

-- name: DeletePushTokensByUser :exec
DELETE FROM push_tokens WHERE user_id = $1;

-- name: DeleteMagicLinkTokensByEmail :exec
DELETE FROM magic_link_tokens WHERE email = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: UpsertUser :one
INSERT INTO users (id, email, display_name, avatar_url, locale)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (email) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        avatar_url   = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        updated_at   = NOW()
RETURNING *;

-- name: UpdateUser :one
UPDATE users
SET display_name = COALESCE(sqlc.narg(display_name), display_name),
    avatar_url   = COALESCE(sqlc.narg(avatar_url), avatar_url),
    phone        = COALESCE(sqlc.narg(phone), phone),
    locale       = COALESCE(sqlc.narg(locale), locale),
    updated_at   = NOW()
WHERE id = $1
RETURNING *;

-- name: SetUserAvatar :one
UPDATE users
SET avatar_object_key = $2,
    avatar_updated_at = NOW(),
    updated_at        = NOW()
WHERE id = $1
RETURNING *;

-- name: ClearUserAvatar :one
UPDATE users
SET avatar_object_key = NULL,
    avatar_updated_at = NOW(),
    updated_at        = NOW()
WHERE id = $1
RETURNING *;

-- name: UsersShareGroup :one
SELECT EXISTS (
    SELECT 1
    FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = $1
      AND gm2.user_id = $2
      AND gm1.user_id IS NOT NULL
      AND gm2.user_id IS NOT NULL
) AS shares;
