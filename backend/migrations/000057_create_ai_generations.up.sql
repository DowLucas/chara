-- ai_generations records one row per AI model call, for cost analysis and
-- model-quality tracking. Feature-keyed like usage_counters ('ocr', 'voice').
--
-- usage_counters answers "how many did this user spend this month"; this
-- table answers "what did it cost and was it any good". Deliberately stores
-- NO content: no transcript, no audio, no member names, no amounts.
--
-- degraded_split_count and unresolved_member_count measure the resolver
-- catching the model (shares that did not sum; member ids that did not
-- exist). They are the primary signal that a prompt or model upgrade has
-- drifted.
CREATE TABLE ai_generations (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature                 TEXT        NOT NULL,
    group_id                TEXT        REFERENCES groups(id) ON DELETE SET NULL,
    model                   TEXT        NOT NULL,
    input_tokens            INTEGER,
    output_tokens           INTEGER,
    clip_ms                 INTEGER,
    request_bytes           INTEGER,
    latency_ms              INTEGER     NOT NULL,
    outcome                 TEXT        NOT NULL,
    error_class             TEXT,
    expense_count           INTEGER     NOT NULL DEFAULT 0,
    question_count          INTEGER     NOT NULL DEFAULT 0,
    degraded_split_count    INTEGER     NOT NULL DEFAULT 0,
    unresolved_member_count INTEGER     NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_generations_feature_created_idx ON ai_generations (feature, created_at DESC);
CREATE INDEX ai_generations_user_idx ON ai_generations (user_id);

-- ai_generation_expenses links a generation to the expenses the user
-- actually saved from it, with the fields they changed from the draft.
-- This yields per-field acceptance rates ("payer accepted 82%").
CREATE TABLE ai_generation_expenses (
    generation_id  TEXT   NOT NULL REFERENCES ai_generations(id) ON DELETE CASCADE,
    expense_id     TEXT   NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    changed_fields TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (generation_id, expense_id)
);
