-- feedback_reports collects bug reports and feature ideas submitted from the
-- in-app "Send feedback" screen. Hosted-only: the endpoint is mounted behind
-- HostedOnly and advertised via features.feedback, so a self-hosted instance
-- never offers the screen and this table simply stays empty there.
--
-- There is no read path in the app. Reports are read with SQL when we want
-- them; no email fan-out, no issue-tracker sync. The client metadata columns
-- (app_version, platform, locale) are what makes a terse report actionable,
-- and are nullable because an older or partial client may omit them.
CREATE TABLE feedback_reports (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    body        TEXT NOT NULL,
    app_version TEXT,
    platform    TEXT,
    locale      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Newest-first is the only way this table is ever read.
CREATE INDEX feedback_reports_created_idx ON feedback_reports (created_at DESC);
