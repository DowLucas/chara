DROP INDEX IF EXISTS expenses_source;
ALTER TABLE expenses DROP COLUMN IF EXISTS source_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS source_kind;
