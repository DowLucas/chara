CREATE TABLE magic_link_tokens (
    id          TEXT PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,  -- SHA-256 hex of the raw token; never store raw
    token_type  TEXT NOT NULL DEFAULT 'magic_link',  -- 'magic_link' | 'refresh'
    user_id     TEXT REFERENCES users(id),            -- NULL until first verified
    email       TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX magic_link_tokens_hash ON magic_link_tokens(token_hash);
CREATE INDEX magic_link_tokens_expires ON magic_link_tokens(expires_at);
