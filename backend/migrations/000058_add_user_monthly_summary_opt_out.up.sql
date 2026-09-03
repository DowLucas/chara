-- Per-user opt-out for the monthly summary push (hosted tier only). Default
-- FALSE: an existing user is opted in, which is the whole point of the
-- feature. The flag lives on `users` rather than a preferences table because
-- it is the only notification preference today; a table is the right shape
-- once there is a second one.
ALTER TABLE users
    ADD COLUMN monthly_summary_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.monthly_summary_opt_out IS
    'When true, the monthly summary job skips this user. See docs/superpowers/specs/2026-09-02-monthly-summary-design.md.';
