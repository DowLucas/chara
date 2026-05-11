CREATE TABLE expense_splits (
    id         TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id  TEXT NOT NULL REFERENCES group_members(id),
    share      BIGINT NOT NULL,  -- minor units owed by this member
    UNIQUE(expense_id, member_id)
);

CREATE INDEX expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX expense_splits_member_id ON expense_splits(member_id);
