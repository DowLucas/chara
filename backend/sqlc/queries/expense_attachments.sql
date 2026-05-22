-- name: CreateExpenseAttachment :one
INSERT INTO expense_attachments (id, expense_id, s3_key, mime_type, size_bytes)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListAttachmentsByExpense :many
SELECT * FROM expense_attachments WHERE expense_id = $1;

-- name: GetExpenseAttachment :one
SELECT * FROM expense_attachments WHERE id = $1;

-- name: DeleteAttachmentsByExpense :exec
DELETE FROM expense_attachments WHERE expense_id = $1;

-- name: DeleteAttachment :exec
DELETE FROM expense_attachments WHERE id = $1;
