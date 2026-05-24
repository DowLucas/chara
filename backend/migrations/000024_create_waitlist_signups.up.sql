-- waitlist_signups collects emails from hosted users who hit a soft gate
-- during the v1.0/v1.1 free beta. The primary trigger is the OCR cap modal
-- ("more capacity coming — drop your email"). This is the WTP-signal proxy
-- the spec calls for; we read it before deciding pricing for v1.2.
--
-- (user_id, email, trigger) is unique so re-submitting the same gate is
-- idempotent (last_seen_at bumps but no duplicate row). user_id is nullable
-- so we can also collect signups from non-authenticated surfaces later
-- without a schema change.
CREATE TABLE waitlist_signups (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    email         TEXT NOT NULL,
    trigger       TEXT NOT NULL,
    source        TEXT,
    locale        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, email, trigger)
);

CREATE INDEX waitlist_signups_email_idx   ON waitlist_signups (email);
CREATE INDEX waitlist_signups_trigger_idx ON waitlist_signups (trigger, created_at);
