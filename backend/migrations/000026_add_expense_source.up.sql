ALTER TABLE expenses ADD COLUMN source_kind TEXT;
ALTER TABLE expenses ADD COLUMN source_id   TEXT;
CREATE INDEX expenses_source ON expenses(source_kind, source_id)
    WHERE source_kind IS NOT NULL;
