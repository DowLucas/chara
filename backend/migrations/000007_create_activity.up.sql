CREATE TABLE activity (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    actor_id     TEXT NOT NULL REFERENCES users(id),
    event_type   TEXT NOT NULL,  -- canonical: 'expense_added' | 'expense_edited' | 'expense_deleted' |
                                 --            'settlement_added' | 'settlement_reverted' |
                                 --            'member_joined' |
                                 --            'group_created' | 'group_updated' | 'group_archived' |
                                 --            'invite_link_rotated'
    entity_id    TEXT,           -- expense_id, settlement_id, group_id, member_id
    entity_type  TEXT,           -- 'expense' | 'settlement' | 'group' | 'member'
    payload      JSONB,          -- snapshot of fields needed to render the row without re-querying
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_group_id ON activity(group_id, created_at DESC);
CREATE INDEX activity_actor_id ON activity(actor_id);
