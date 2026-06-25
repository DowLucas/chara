-- Per-user override for the monthly free OCR scan cap (hosted instances).
--
-- NULL  → no override; the user gets the global FreeOCRCap (anti-abuse default).
-- >= 0  → explicit per-user monthly cap (e.g. a paid tier's higher limit).
-- < 0   → unlimited; metering is bypassed entirely for this user.
--
-- The billing.Counter primitive already takes the cap as a per-call argument;
-- this column is the per-user lookup that server.go's hardcoded FreeOCRCap
-- always anticipated ("v1.2 will replace this with a tier-aware lookup").
ALTER TABLE users ADD COLUMN ocr_cap_override INTEGER;
