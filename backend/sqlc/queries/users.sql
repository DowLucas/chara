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
