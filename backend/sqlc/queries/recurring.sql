-- name: CreateRecurringExpense :one
INSERT INTO recurring_expenses (
    id, group_id, title, amount_minor, currency,
    paid_by_id, split_method, category, notes,
    freq_unit, freq_interval, start_date, end_date,
    timezone, fire_local_time,
    status, next_fire_at, created_by_id
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11, $12, $13,
    $14, $15,
    'active', $16, $17
)
RETURNING *;

-- name: GetRecurringExpense :one
SELECT * FROM recurring_expenses WHERE id = $1;

-- name: ListRecurringExpensesByGroup :many
SELECT * FROM recurring_expenses WHERE group_id = $1
ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
         created_at DESC;

-- name: UpdateRecurringExpense :one
UPDATE recurring_expenses SET
    title = $2, amount_minor = $3, paid_by_id = $4,
    split_method = $5, category = $6, notes = $7,
    freq_unit = $8, freq_interval = $9, end_date = $10,
    timezone = $11, fire_local_time = $12,
    next_fire_at = $13, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: SetRecurringStatus :one
UPDATE recurring_expenses
SET status = $2, paused_reason = $3, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: AdvanceRecurringAfterFire :exec
UPDATE recurring_expenses
SET last_fire_at = $2, next_fire_at = $3, status = $4, updated_at = NOW()
WHERE id = $1;

-- name: DeleteRecurringExpense :exec
DELETE FROM recurring_expenses WHERE id = $1;

-- name: SelectDueRecurringExpenses :many
SELECT id, next_fire_at FROM recurring_expenses
WHERE status = 'active' AND next_fire_at <= NOW()
ORDER BY next_fire_at
LIMIT $1
FOR UPDATE SKIP LOCKED;

-- name: PauseActiveRecurringExpensesByGroup :exec
UPDATE recurring_expenses
SET status = 'paused', paused_reason = $2, updated_at = NOW()
WHERE group_id = $1 AND status = 'active';

-- name: PauseRecurringExpensesAffectedByMember :many
UPDATE recurring_expenses r
SET status = 'paused', paused_reason = 'member_left', updated_at = NOW()
WHERE r.group_id = @group_id
  AND r.status = 'active'
  AND (r.paid_by_id = @member_id
       OR EXISTS (SELECT 1 FROM recurring_expense_splits s
                  WHERE s.recurring_id = r.id AND s.member_id = @member_id))
RETURNING id, created_by_id;

-- name: CreateRecurringSplit :exec
INSERT INTO recurring_expense_splits (recurring_id, member_id, value)
VALUES ($1, $2, $3);

-- name: ListRecurringSplits :many
SELECT * FROM recurring_expense_splits WHERE recurring_id = $1;

-- name: DeleteRecurringSplits :exec
DELETE FROM recurring_expense_splits WHERE recurring_id = $1;

-- name: ResumeAllGroupLockedRecurringByCreator :many
UPDATE recurring_expenses
SET status = 'active', paused_reason = NULL,
    next_fire_at = NOW(), updated_at = NOW()
WHERE group_id = $1
  AND created_by_id = $2
  AND status = 'paused'
  AND paused_reason = 'group_locked'
RETURNING id;
