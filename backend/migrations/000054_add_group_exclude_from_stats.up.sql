-- Lets an operator mark a group as demo/seed data so it never reaches the
-- public aggregate stats endpoint (GET /api/public/stats).
--
-- Default FALSE means a fresh install counts everything; the flag is opt-in
-- and set per-instance. It deliberately lives on `groups` rather than on an
-- env var of group IDs so that excluding a test group is a data change an
-- operator can make without a redeploy.
ALTER TABLE groups
    ADD COLUMN exclude_from_stats BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN groups.exclude_from_stats IS
    'When true, this group''s expenses are omitted from GET /api/public/stats. Used to keep demo/seed data out of publicly advertised totals.';

-- Partial index: the stats query filters on NOT exclude_from_stats, and the
-- excluded set is tiny, so index only the rows that are actually skipped.
CREATE INDEX groups_excluded_from_stats ON groups(id) WHERE exclude_from_stats;
