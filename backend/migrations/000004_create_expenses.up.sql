CREATE TABLE expenses (
    id               TEXT PRIMARY KEY,
    group_id         TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    amount           BIGINT NOT NULL,         -- minor units (öre, cents)
    currency         TEXT NOT NULL,
    paid_by_id       TEXT NOT NULL REFERENCES group_members(id),
    split_method     TEXT NOT NULL,           -- 'equal' | 'exact' | 'percentage'
    category         TEXT NOT NULL DEFAULT 'general',
    notes            TEXT,
    expense_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    is_reimbursement BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_id    TEXT NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX expenses_group_id ON expenses(group_id) WHERE NOT is_deleted;
CREATE INDEX expenses_paid_by_id ON expenses(paid_by_id);
CREATE INDEX expenses_expense_date ON expenses(expense_date DESC);

-- Full-text search index
ALTER TABLE expenses ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || COALESCE(notes, ''))) STORED;
CREATE INDEX expenses_search ON expenses USING GIN(search_vector);
