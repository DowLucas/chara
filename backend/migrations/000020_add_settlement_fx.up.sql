-- Capture the foreign-currency snapshot for a settlement the user paid in
-- a currency other than the originating balance's currency. The canonical
-- amount and currency (used for balances) stay in the existing `amount`
-- and `currency` columns. The columns below preserve the original-currency
-- view so the settlement record can be aggregated honestly against
-- historical rates (see docs/superpowers/specs/2026-05-24-home-currency-
-- aggregation-design.md).
--
-- Mirrors migration 000016 on the expenses table: all four are nullable
-- because same-currency settlements (the common case) have nothing to
-- store; a CHECK constraint catches partial writes before they pollute
-- the audit trail.
ALTER TABLE settlements
    ADD COLUMN original_amount   BIGINT,
    ADD COLUMN original_currency TEXT,
    ADD COLUMN fx_rate           NUMERIC(20, 10),
    ADD COLUMN fx_as_of          DATE;

ALTER TABLE settlements
    ADD CONSTRAINT settlements_fx_snapshot_complete
    CHECK (
        (original_amount IS NULL AND original_currency IS NULL AND fx_rate IS NULL AND fx_as_of IS NULL)
        OR
        (original_amount IS NOT NULL AND original_currency IS NOT NULL AND fx_rate IS NOT NULL AND fx_as_of IS NOT NULL)
    );
