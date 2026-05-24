CREATE TABLE recurring_expenses (
    id                TEXT PRIMARY KEY,
    group_id          TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    amount_minor      BIGINT NOT NULL CHECK (amount_minor > 0),
    currency          TEXT NOT NULL,
    paid_by_id        TEXT NOT NULL REFERENCES group_members(id),
    split_method      TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'general',
    notes             TEXT,
    freq_unit         TEXT NOT NULL,
    freq_interval     INT  NOT NULL CHECK (freq_interval BETWEEN 1 AND 365),
    start_date        DATE NOT NULL,
    end_date          DATE,
    timezone          TEXT NOT NULL,
    fire_local_time   TIME NOT NULL DEFAULT '09:00',
    status            TEXT NOT NULL DEFAULT 'active',
    paused_reason     TEXT,
    last_fire_at      TIMESTAMPTZ,
    next_fire_at      TIMESTAMPTZ NOT NULL,
    created_by_id     TEXT NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recurring_expenses_group_id ON recurring_expenses(group_id);
CREATE INDEX recurring_expenses_due
    ON recurring_expenses(next_fire_at)
    WHERE status = 'active';

CREATE TABLE recurring_expense_splits (
    recurring_id   TEXT NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    member_id      TEXT NOT NULL REFERENCES group_members(id),
    value          BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (recurring_id, member_id)
);
