ALTER TABLE settlements
    ADD COLUMN method        TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN external_ref  TEXT,
    ADD COLUMN reverted_at   TIMESTAMPTZ;

ALTER TABLE settlements
    ADD CONSTRAINT settlements_method_check
    CHECK (method IN ('manual', 'swish', 'vipps', 'mobilepay'));
