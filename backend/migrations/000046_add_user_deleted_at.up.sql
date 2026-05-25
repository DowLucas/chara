-- Soft-delete for users (Apple Guideline 5.1.1(v) — account self-deletion).
--
-- Hard-delete is not viable: many tables (expenses, settlements, activity,
-- groups, recurring_expenses) have NOT NULL FK references to users(id)
-- without ON DELETE CASCADE, and cascading them would destroy expense
-- history that *other* members of shared groups depend on. Splitwise
-- handles this the same way — a deleted account becomes "Deleted user"
-- but the rows they touched remain so the group's books still balance.
--
-- On delete:
--   * deleted_at is set to NOW()
--   * email is replaced with a 'deleted-<id>@deleted.invalid' sentinel
--     so the (UNIQUE NOT NULL) constraint stays satisfied and the
--     original address can be re-used to create a fresh account
--   * display_name, phone, avatar_url, avatar_object_key are nulled / ''
--   * every group_members row for the user has user_id NULLed and
--     is_ghost flipped to TRUE — the row itself stays so paid_by_id /
--     expense_splits.member_id keep resolving
--   * push_tokens and magic_link_tokens for the user are deleted
--
-- The auth middleware rejects any request whose JWT references a user
-- with deleted_at IS NOT NULL.

ALTER TABLE users
    ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial index on the common path (auth lookups always want non-deleted).
CREATE INDEX users_active ON users(id) WHERE deleted_at IS NULL;
