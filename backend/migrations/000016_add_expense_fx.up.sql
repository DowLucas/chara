-- Capture the foreign-currency snapshot for an expense the user paid in a
-- currency other than the group's currency. The canonical amount and
-- currency (used for splits and balances) stay in the existing `amount`
-- and `currency` columns, in the group's currency. The columns below
-- preserve the original-currency view so the expense detail can show
-- "you paid 5 000 HUF · €12.40 · 1 EUR = 322.58 HUF · 2026-05-21".
--
-- All four are nullable because same-currency expenses (the common case)
-- have nothing to store.
ALTER TABLE expenses
    ADD COLUMN original_amount   BIGINT,
    ADD COLUMN original_currency TEXT,
    ADD COLUMN fx_rate           NUMERIC(20, 10),
    ADD COLUMN fx_as_of          DATE;

-- Either all four are set or none are. The CHECK constraint catches a
-- partial write before it pollutes the audit trail.
ALTER TABLE expenses
    ADD CONSTRAINT expenses_fx_snapshot_complete
    CHECK (
        (original_amount IS NULL AND original_currency IS NULL AND fx_rate IS NULL AND fx_as_of IS NULL)
        OR
        (original_amount IS NOT NULL AND original_currency IS NOT NULL AND fx_rate IS NOT NULL AND fx_as_of IS NOT NULL)
    );
