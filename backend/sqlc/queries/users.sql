-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

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
