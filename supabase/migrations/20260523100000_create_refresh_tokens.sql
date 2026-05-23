/*
  # Refresh token store

  Persists active refresh token JTIs so they can be:
    - validated on each /auth/refresh call
    - revoked immediately on /auth/logout
    - expired automatically via the expires_at column

  In production the application upserts one row per issued refresh token and
  deletes it on logout or rotation.  Expired rows are cleaned up by the
  scheduled function below.

  The InMemoryUserStore (src/auth/store.js) mirrors this interface for tests.
*/

CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti         uuid        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Only the service-role key (backend) touches this table.
-- RLS policies intentionally left absent so no anon/authenticated client can
-- read or mutate tokens directly.

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Convenience function to purge expired tokens (call from a cron job or pg_cron)
CREATE OR REPLACE FUNCTION purge_expired_refresh_tokens()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM refresh_tokens WHERE expires_at < now();
$$;
