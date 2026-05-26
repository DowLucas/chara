ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_token_key;
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_token_key UNIQUE (token);
