ALTER TABLE groups
    ADD COLUMN invite_token_created_by_user_id TEXT NULL
    REFERENCES users(id) ON DELETE SET NULL;
