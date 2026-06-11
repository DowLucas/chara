-- Tracks when a user was last nudged about an unsettled debtor balance in a
-- group, so the nudge job can enforce the NUDGE_REPEAT_DAYS cool-down.
CREATE TABLE balance_nudges (
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id       TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    last_nudged_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, group_id)
);
