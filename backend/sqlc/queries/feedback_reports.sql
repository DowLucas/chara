-- feedback_reports: bug reports and feature ideas from the in-app feedback
-- screen. Write-only from the app's point of view.

-- name: CreateFeedbackReport :one
-- One row per submission. Deliberately not deduplicated: two reports with the
-- same text minutes apart usually mean the user hit the bug twice, which is
-- itself a signal.
INSERT INTO feedback_reports (id, user_id, kind, body, app_version, platform, locale)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, user_id, kind, body, app_version, platform, locale, created_at;
