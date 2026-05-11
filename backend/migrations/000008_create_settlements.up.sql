CREATE TABLE settlements (
    id            TEXT PRIMARY KEY,
    group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_member   TEXT NOT NULL REFERENCES group_members(id),
    to_member     TEXT NOT NULL REFERENCES group_members(id),
    amount        BIGINT NOT NULL,
    currency      TEXT NOT NULL,
    note          TEXT,
    created_by_id TEXT NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX settlements_group_id ON settlements(group_id);
CREATE INDEX settlements_from_member ON settlements(from_member);
CREATE INDEX settlements_to_member ON settlements(to_member);
