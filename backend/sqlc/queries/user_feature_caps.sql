-- name: GetFeatureCap :one
-- Per-user, per-feature cap override for hosted metering. No row = use the
-- global default cap; >= 0 = explicit cap; < 0 = unlimited (bypassed).
SELECT cap FROM user_feature_caps
WHERE user_id = $1 AND feature = $2;

-- name: SetFeatureCap :exec
INSERT INTO user_feature_caps (user_id, feature, cap)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, feature) DO UPDATE SET cap = EXCLUDED.cap;
