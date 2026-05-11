-- name: CreateExpenseSplit :one
INSERT INTO expense_splits (id, expense_id, member_id, share)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListSplitsByExpense :many
SELECT * FROM expense_splits WHERE expense_id = $1;

-- name: DeleteSplitsByExpense :exec
DELETE FROM expense_splits WHERE expense_id = $1;
