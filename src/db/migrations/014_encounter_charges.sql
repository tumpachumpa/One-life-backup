CREATE TABLE IF NOT EXISTS encounter_charges (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id        TEXT NOT NULL,
  current_charges  INTEGER NOT NULL DEFAULT 5,
  last_recharge_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, region_id)
);
