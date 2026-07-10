-- name: TryRecordSettleReminder :one
-- Stamps a settle-up reminder for (group, creditor user), but only when the
-- previous one is older than the 48h cooldown. Returns the row on success;
-- returns no rows when still within the window (the handler reads that as
-- "throttled"). First-ever reminder always inserts.
INSERT INTO settle_reminders (group_id, from_user_id, last_reminded_at)
VALUES ($1, $2, NOW())
ON CONFLICT (group_id, from_user_id) DO UPDATE
    SET last_reminded_at = NOW()
    WHERE settle_reminders.last_reminded_at < NOW() - INTERVAL '48 hours'
RETURNING group_id, from_user_id, last_reminded_at;

-- name: GetSettleReminder :one
SELECT group_id, from_user_id, last_reminded_at
FROM settle_reminders
WHERE group_id = $1 AND from_user_id = $2;
