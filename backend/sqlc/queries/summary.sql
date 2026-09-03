-- Queries behind the monthly summary (GET /api/me/summary) and the monthly
-- push job. Every aggregate derives from the same `mine` CTE: the expenses
-- one user either paid for or holds a split in, over one calendar month.
--
-- The filter mirrors the member_balances view (NOT is_deleted AND NOT
-- is_reimbursement) so "net" on the summary page reconciles with the
-- balances shown everywhere else. Archived groups are included — an
-- archived trip still happened — and group_members.removed_at is ignored,
-- because spend in a group the user has since left was still their spend.
--
-- sqlc cannot return several result sets from one statement, so the CTE is
-- repeated per shape. Do not try to merge them.
--
-- Spec: docs/superpowers/specs/2026-09-02-monthly-summary-design.md

-- name: SummaryTotalsByCurrency :many
-- Per-currency paid/share. No FX: this is the unconverted source of truth
-- the page always renders somewhere.
WITH mine AS (
    SELECT e.id, e.currency,
           CASE WHEN e.paid_by_id = gm.id THEN e.amount ELSE 0 END AS paid,
           COALESCE(es.share, 0)                                   AS share
    FROM expenses e
    JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = @user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.member_id = gm.id
    WHERE NOT e.is_deleted AND NOT e.is_reimbursement
      AND e.expense_date >= @period_start AND e.expense_date < @period_end
      AND (e.paid_by_id = gm.id OR es.id IS NOT NULL)
)
SELECT currency,
       SUM(paid)::bigint  AS paid_minor,
       SUM(share)::bigint AS share_minor,
       COUNT(*)::bigint   AS expense_count
FROM mine
GROUP BY currency
ORDER BY currency ASC;

-- name: SummaryCounts :one
-- Currency-agnostic counts. Separate from the totals query because these
-- must NOT be grouped by currency — a per-currency expense count would
-- double-count a user whose month spans two.
WITH mine AS (
    SELECT e.id, e.group_id, e.expense_date
    FROM expenses e
    JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = @user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.member_id = gm.id
    WHERE NOT e.is_deleted AND NOT e.is_reimbursement
      AND e.expense_date >= @period_start AND e.expense_date < @period_end
      AND (e.paid_by_id = gm.id OR es.id IS NOT NULL)
)
SELECT COUNT(*)::bigint                     AS expense_count,
       COUNT(DISTINCT group_id)::bigint     AS group_count,
       COUNT(DISTINCT expense_date)::bigint AS active_days
FROM mine;

-- name: SummaryRowsForRanking :many
-- One row per qualifying expense. Deliberately NOT pre-aggregated: category
-- totals, "biggest expense" and "top group" all rank across currencies, and
-- that ranking is only meaningful after FX conversion, which happens in Go.
WITH mine AS (
    SELECT e.id, e.group_id, e.currency, e.expense_date, e.category, e.title,
           COALESCE(es.share, 0) AS share
    FROM expenses e
    JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = @user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.member_id = gm.id
    WHERE NOT e.is_deleted AND NOT e.is_reimbursement
      AND e.expense_date >= @period_start AND e.expense_date < @period_end
      AND (e.paid_by_id = gm.id OR es.id IS NOT NULL)
)
SELECT m.id AS expense_id, m.group_id, g.name AS group_name,
       m.currency, m.expense_date, m.category, m.title,
       m.share::bigint AS share_minor
FROM mine m
JOIN groups g ON g.id = m.group_id
ORDER BY m.expense_date ASC, m.id ASC;

-- name: FirstExpenseMonthForUser :one
-- Oldest qualifying expense date for the user, so the screen can stop its
-- "previous month" navigation instead of paging into empty months forever.
-- NULL for a user who has never had a qualifying expense.
SELECT MIN(e.expense_date)::date AS first_expense_date
FROM expenses e
JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = @user_id
LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.member_id = gm.id
WHERE NOT e.is_deleted AND NOT e.is_reimbursement
  AND (e.paid_by_id = gm.id OR es.id IS NOT NULL);

-- name: ListMonthlySummaryRecipients :many
-- Users the monthly push should go to: has a device, not deleted, not opted
-- out, not already notified for this period, and actually had spend. The
-- ledger check is what makes the fan-out job resumable, so callers page by
-- re-running with a fixed offset rather than advancing one.
SELECT u.id, u.locale
FROM users u
WHERE u.deleted_at IS NULL
  AND NOT u.monthly_summary_opt_out
  AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = u.id)
  AND NOT EXISTS (
        SELECT 1 FROM monthly_summary_sends s
        WHERE s.user_id = u.id AND s.period = @period
      )
  AND EXISTS (
        SELECT 1
        FROM expenses e
        JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = u.id
        LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.member_id = gm.id
        WHERE NOT e.is_deleted AND NOT e.is_reimbursement
          AND e.expense_date >= @period_start AND e.expense_date < @period_end
          AND (e.paid_by_id = gm.id OR es.id IS NOT NULL)
      )
ORDER BY u.id
LIMIT @lim OFFSET @off;

-- name: MarkMonthlySummarySent :exec
-- Records that the push for (user, period) has been attempted. ON CONFLICT
-- DO NOTHING so a River retry that races another worker is a no-op rather
-- than a unique violation that fails the whole job.
INSERT INTO monthly_summary_sends (user_id, period)
VALUES (@user_id, @period)
ON CONFLICT (user_id, period) DO NOTHING;
