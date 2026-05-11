CREATE TABLE activity (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    actor_id     TEXT NOT NULL REFERENCES users(id),
    event_type   TEXT NOT NULL,  -- 'expense_added' | 'expense_edited' | 'expense_deleted' | 'settlement_added' | 'member_joined' | 'member_left'
    entity_id    TEXT,           -- expense_id, settlement_id, etc.
    entity_type  TEXT,           -- 'expense' | 'settlement' | 'member'
    payload      JSONB,          -- snapshot of changed fields for audit trail
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_group_id ON activity(group_id, created_at DESC);
CREATE INDEX activity_actor_id ON activity(actor_id);
