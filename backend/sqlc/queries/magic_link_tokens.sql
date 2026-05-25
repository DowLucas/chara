-- name: CreateMagicLinkToken :one
INSERT INTO magic_link_tokens (id, token_hash, token_type, user_id, email, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetMagicLinkTokenByHash :one
SELECT * FROM magic_link_tokens
WHERE token_hash = $1
  AND used_at IS NULL
  AND expires_at > NOW()
  AND token_type = 'magic_link';

-- name: MarkMagicLinkTokenUsed :exec
UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1;

-- name: ConsumeMagicLinkToken :one
UPDATE magic_link_tokens
   SET used_at = NOW()
 WHERE token_hash = $1
   AND used_at IS NULL
   AND expires_at > NOW()
   AND token_type = 'magic_link'
RETURNING id, email, expires_at;

-- name: DeleteExpiredTokens :exec
DELETE FROM magic_link_tokens WHERE expires_at < NOW();
