CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
