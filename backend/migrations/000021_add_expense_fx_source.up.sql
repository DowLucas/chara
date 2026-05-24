-- Distinguish ECB-derived FX snapshots from user-supplied ("manual") rates.
-- ECB snapshots are produced by the backend's fx.Convert path; manual
-- snapshots arrive verbatim from the client (e.g. the user typed a custom
-- rate at the point of sale). The column is nullable for the common case
-- of same-currency expenses.
ALTER TABLE expenses
    ADD COLUMN fx_source TEXT;

-- Backfill BEFORE adding the CHECK constraint so existing FX rows pass.
UPDATE expenses SET fx_source = 'ecb' WHERE fx_rate IS NOT NULL;

ALTER TABLE expenses
    ADD CONSTRAINT expenses_fx_source_chk CHECK (
        (fx_rate IS NULL AND fx_source IS NULL)
        OR (fx_rate IS NOT NULL AND fx_source IN ('ecb', 'manual'))
    );
