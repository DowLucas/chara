-- name: CreateRefreshToken :one
INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetRefreshTokenByHash :one
SELECT * FROM refresh_tokens WHERE token_hash = $1;

-- name: TouchRefreshToken :exec
UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeAllRefreshTokensForUser :exec
UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredRefreshTokens :execrows
DELETE FROM refresh_tokens WHERE expires_at < NOW();
