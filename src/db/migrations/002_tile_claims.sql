CREATE TABLE IF NOT EXISTS tile_claims (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_income_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  protected_until TIMESTAMPTZ
);
