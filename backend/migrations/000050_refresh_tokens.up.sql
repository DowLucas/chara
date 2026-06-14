-- Refresh tokens: long-lived, revocable session credentials. The access JWT
-- stays short (24h) and stateless; the refresh token (default 1y) lets the
-- app silently obtain a fresh access token without forcing the user to
-- re-authenticate. Unlike the JWT, refresh tokens are stateful so they can be
-- rotated and revoked (logout, account removal, reuse detection).
CREATE TABLE refresh_tokens (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,  -- SHA-256 hex of the raw token; never store raw
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,           -- set on rotation, logout, or reuse-detection
    user_agent   TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX refresh_tokens_expires ON refresh_tokens(expires_at);
