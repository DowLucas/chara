-- name: GetMemberBalance :one
SELECT * FROM member_balances
WHERE group_id = $1 AND member_id = $2;

-- name: ListGroupBalances :many
SELECT * FROM member_balances
WHERE group_id = $1 AND currency IS NOT NULL;

-- name: ListUserBalancesAcrossGroups :many
SELECT mb.* FROM member_balances mb
WHERE mb.user_id = $1 AND mb.currency IS NOT NULL;
