ALTER TABLE users ADD COLUMN ocr_cap_override INTEGER;

UPDATE users u
SET ocr_cap_override = c.cap
FROM user_feature_caps c
WHERE c.user_id = u.id AND c.feature = 'ocr';

DROP TABLE user_feature_caps;
