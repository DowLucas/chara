-- name: InsertAIGeneration :exec
INSERT INTO ai_generations (
    id, user_id, feature, group_id, model,
    input_tokens, output_tokens, clip_ms, request_bytes, latency_ms,
    outcome, error_class,
    expense_count, question_count, degraded_split_count, unresolved_member_count
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12,
    $13, $14, $15, $16
);

-- name: LinkAIGenerationExpense :exec
-- Best-effort link from a saved expense back to the generation that
-- proposed it. ON CONFLICT DO NOTHING because a retry must not error.
--
-- The EXISTS guard scopes the link to the caller's OWN generation. Without
-- it a client could attach its expense to somebody else's row and skew the
-- per-field acceptance rates this table exists to measure. An id that is
-- unknown or belongs to another user inserts nothing, which is exactly the
-- silent no-op the handler already treats as acceptable.
INSERT INTO ai_generation_expenses (generation_id, expense_id, changed_fields)
SELECT @generation_id, @expense_id, @changed_fields::text[]
WHERE EXISTS (
    SELECT 1 FROM ai_generations
    WHERE id = @generation_id AND user_id = @user_id
)
ON CONFLICT (generation_id, expense_id) DO NOTHING;

-- name: DeleteAIGenerationsBefore :exec
DELETE FROM ai_generations WHERE created_at < $1;
