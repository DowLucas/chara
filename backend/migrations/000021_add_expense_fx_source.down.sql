ALTER TABLE expenses
    DROP CONSTRAINT IF EXISTS expenses_fx_source_chk,
    DROP COLUMN IF EXISTS fx_source;
