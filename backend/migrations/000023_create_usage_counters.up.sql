-- usage_counters tracks per-user, per-feature metered usage on the hosted
-- instance. Anti-abuse only in v1.0 (free 3 OCR/month); becomes the v1.2
-- paywall gate once Chara Hosted launches.
--
-- period_start is always the first of a calendar month, UTC. The handler
-- lazy-resets a stale row on read (cheaper than a sweep job, and self-heals
-- across server downtime). user_id matches users.id (TEXT, ULID).
CREATE TABLE usage_counters (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature      TEXT NOT NULL,
    period_start DATE NOT NULL,
    used         INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
    PRIMARY KEY (user_id, feature)
);
