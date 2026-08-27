DROP INDEX IF EXISTS groups_excluded_from_stats;
ALTER TABLE groups DROP COLUMN IF EXISTS exclude_from_stats;
