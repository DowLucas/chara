-- name: CreateExpenseSplit :one
INSERT INTO expense_splits (id, expense_id, member_id, share)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListSplitsByExpense :many
SELECT * FROM expense_splits WHERE expense_id = $1;

-- name: ListSplitsByGroup :many
SELECT es.id, es.expense_id, es.member_id, es.share
FROM expense_splits es
JOIN expenses e ON e.id = es.expense_id
WHERE e.group_id = $1 AND NOT e.is_deleted;

-- name: DeleteSplitsByExpense :exec
DELETE FROM expense_splits WHERE expense_id = $1;
