CREATE TABLE groups (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'SEK',
    created_by   TEXT NOT NULL REFERENCES users(id),
    invite_token TEXT NOT NULL UNIQUE,  -- shareable link token
    is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
