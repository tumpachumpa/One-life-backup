CREATE TABLE IF NOT EXISTS adventure_sessions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adventure_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  progress     JSONB NOT NULL DEFAULT '{}',
  hero_snap    JSONB,
  run_loot     JSONB NOT NULL DEFAULT '[]',
  run_xp       INTEGER NOT NULL DEFAULT 0,
  run_gold     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adventure_sessions_user_status
  ON adventure_sessions (user_id, status);
