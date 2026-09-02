-- Idempotency ledger for the monthly summary push. One row per user per
-- period; the composite PK is the whole mechanism. The notify job is a
-- single River job that pages over every recipient, so a crash mid-fan-out
-- is retried by River and this table stops the already-notified from being
-- notified twice. Modelled on settle_reminders: tiny, composite PK, no
-- surrogate id.
CREATE TABLE monthly_summary_sends (
    user_id  TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period   TEXT        NOT NULL,          -- 'YYYY-MM'
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, period)
);
