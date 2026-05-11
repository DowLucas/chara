CREATE TABLE group_members (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    TEXT REFERENCES users(id),     -- NULL for ghost members
    name       TEXT NOT NULL,                 -- display name, copied from user on join
    role       TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
    is_ghost   BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX group_members_group_user ON group_members(group_id, user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX group_members_group_id ON group_members(group_id);
CREATE INDEX group_members_user_id ON group_members(user_id);
