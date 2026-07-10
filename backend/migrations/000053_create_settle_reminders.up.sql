-- Tracks the last time each creditor sent a "settle up" reminder in a group,
-- enforcing the 48h server-side cooldown (one reminder button press per
-- group per creditor). Keyed by (group, creditor user).
CREATE TABLE settle_reminders (
    group_id         TEXT        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user_id     TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    last_reminded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, from_user_id)
);
