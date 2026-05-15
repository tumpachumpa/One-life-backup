CREATE TABLE IF NOT EXISTS player_world_state (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  region_id   TEXT NOT NULL,
  location_id TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
