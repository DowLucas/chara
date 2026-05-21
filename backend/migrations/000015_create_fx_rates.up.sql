-- FX rate cache. Rates are stored exactly as the upstream source publishes
-- them — one row per (base, quote, as_of). Cross rates (e.g. HUF→SEK when
-- base is EUR for both legs) are computed at read time, not stored, so the
-- audit trail stays minimal and matches what the upstream gives us.
CREATE TABLE fx_rates (
    base       TEXT NOT NULL,
    quote      TEXT NOT NULL,
    rate       NUMERIC(20, 10) NOT NULL CHECK (rate > 0),
    as_of      DATE NOT NULL,
    source     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (base, quote, as_of)
);

CREATE INDEX idx_fx_rates_as_of ON fx_rates (as_of DESC);
