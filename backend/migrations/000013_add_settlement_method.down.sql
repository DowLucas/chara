ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_method_check;
ALTER TABLE settlements DROP COLUMN IF EXISTS reverted_at;
ALTER TABLE settlements DROP COLUMN IF EXISTS external_ref;
ALTER TABLE settlements DROP COLUMN IF EXISTS method;
