ALTER TABLE users DROP CONSTRAINT IF EXISTS users_swish_number_e164_se;
ALTER TABLE users DROP COLUMN IF EXISTS swish_number;
