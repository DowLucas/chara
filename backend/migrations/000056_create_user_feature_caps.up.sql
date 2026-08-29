-- user_feature_caps replaces users.ocr_cap_override with a per-feature row,
-- so a new metered AI feature needs no schema change. Mirrors the shape of
-- usage_counters: TEXT/ULID user_id, TEXT feature, primary key on the pair.
--
-- cap >= 0 is an explicit monthly cap; cap < 0 means unlimited (metering
-- bypassed entirely). Absence of a row means "use the global default cap".
CREATE TABLE user_feature_caps (
    user_id TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature TEXT    NOT NULL,
    cap     INTEGER NOT NULL,
    PRIMARY KEY (user_id, feature)
);

INSERT INTO user_feature_caps (user_id, feature, cap)
SELECT id, 'ocr', ocr_cap_override
FROM users
WHERE ocr_cap_override IS NOT NULL;

ALTER TABLE users DROP COLUMN ocr_cap_override;
