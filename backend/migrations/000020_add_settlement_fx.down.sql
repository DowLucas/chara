ALTER TABLE settlements
    DROP CONSTRAINT IF EXISTS settlements_fx_snapshot_complete,
    DROP COLUMN IF EXISTS original_amount,
    DROP COLUMN IF EXISTS original_currency,
    DROP COLUMN IF EXISTS fx_rate,
    DROP COLUMN IF EXISTS fx_as_of;
