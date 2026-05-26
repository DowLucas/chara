-- Push-token security fix: the same raw Expo token must be ownable by more
-- than one user concurrently (different devices, multi-server accounts can
-- share an Expo install ID until the OS rotates it). The previous UNIQUE on
-- token alone, combined with `ON CONFLICT (token) DO UPDATE SET user_id`,
-- let any authenticated caller hijack another user's push delivery by
-- submitting the victim's token.
--
-- The new uniqueness key is (user_id, token): each user owns their own row,
-- and re-registration is idempotent per-user only.

ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_token_key;
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_user_id_token_key UNIQUE (user_id, token);
