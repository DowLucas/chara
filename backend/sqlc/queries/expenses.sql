-- Explicit column list everywhere to exclude the generated `search_vector` column,
-- which pgx cannot scan into interface{} cleanly.

-- name: CreateExpense :one
INSERT INTO expenses (
    id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
    expense_date, is_reimbursement, created_by_id,
    original_amount, original_currency, fx_rate, fx_as_of
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
RETURNING id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
          expense_date, is_reimbursement, is_deleted, created_by_id, created_at, updated_at,
          original_amount, original_currency, fx_rate, fx_as_of;

-- name: GetExpenseByID :one
SELECT id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
       expense_date, is_reimbursement, is_deleted, created_by_id, created_at, updated_at,
       original_amount, original_currency, fx_rate, fx_as_of
FROM expenses WHERE id = $1 AND NOT is_deleted;

-- name: GetExpenseByIDAndGroup :one
SELECT id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
       expense_date, is_reimbursement, is_deleted, created_by_id, created_at, updated_at,
       original_amount, original_currency, fx_rate, fx_as_of
FROM expenses WHERE id = $1 AND group_id = $2 AND NOT is_deleted;

-- name: ListExpensesByGroup :many
SELECT id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
       expense_date, is_reimbursement, is_deleted, created_by_id, created_at, updated_at,
       original_amount, original_currency, fx_rate, fx_as_of
FROM expenses
WHERE group_id = $1 AND NOT is_deleted
ORDER BY expense_date DESC, created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateExpense :one
-- NOTE: fx columns (original_amount, original_currency, fx_rate, fx_as_of)
-- are intentionally not editable via this query — change-amount or
-- change-currency edits will leave the original snapshot pointing at the
-- old conversion. The simpler v1 behaviour is to require a delete+recreate
-- for foreign-currency expenses; a follow-up can plumb fx recomputation.
UPDATE expenses
SET title        = COALESCE(sqlc.narg(title), title),
    amount       = COALESCE(sqlc.narg(amount), amount),
    currency     = COALESCE(sqlc.narg(currency), currency),
    paid_by_id   = COALESCE(sqlc.narg(paid_by_id), paid_by_id),
    split_method = COALESCE(sqlc.narg(split_method), split_method),
    category     = COALESCE(sqlc.narg(category), category),
    notes        = COALESCE(sqlc.narg(notes), notes),
    expense_date = COALESCE(sqlc.narg(expense_date), expense_date),
    updated_at   = NOW()
WHERE id = $1
RETURNING id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
          expense_date, is_reimbursement, is_deleted, created_by_id, created_at, updated_at,
          original_amount, original_currency, fx_rate, fx_as_of;

-- name: SoftDeleteExpense :exec
UPDATE expenses SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1;

-- name: SearchExpenses :many
SELECT id, group_id, title, amount, currency, paid_by_id, split_method, category, notes,
       expense_date, is_reimbursement, is_deleted, created_by_id, created_at, updated_at,
       original_amount, original_currency, fx_rate, fx_as_of
FROM expenses
WHERE group_id = $1
  AND NOT is_deleted
  AND search_vector @@ plainto_tsquery('simple', $2)
ORDER BY ts_rank(search_vector, plainto_tsquery('simple', $2)) DESC
LIMIT 50;
