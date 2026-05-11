CREATE TABLE expense_attachments (
    id         TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    s3_key     TEXT NOT NULL,
    mime_type  TEXT NOT NULL DEFAULT 'image/jpeg',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX expense_attachments_expense_id ON expense_attachments(expense_id);
