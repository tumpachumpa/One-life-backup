-- PvP fight records and loot transfer tables

CREATE TABLE IF NOT EXISTS pvp_records (
  id               SERIAL PRIMARY KEY,
  challenge_id     INTEGER REFERENCES pvp_challenges(id) ON DELETE SET NULL,
  attacker_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defender_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  winner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loot_pool        JSONB NOT NULL DEFAULT '[]',
  loot_picked      JSONB,
  loot_claimed     BOOLEAN NOT NULL DEFAULT FALSE,
  attacker_level   INTEGER NOT NULL DEFAULT 1,
  defender_level   INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pvp_records
  ADD COLUMN IF NOT EXISTS challenge_id INTEGER REFERENCES pvp_challenges(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pvp_records_challenge_id_unique_idx
  ON pvp_records (challenge_id);

-- Item the winner receives (transferred into inventory on next login / on claim)
CREATE TABLE IF NOT EXISTS pvp_pending_loot (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item       JSONB NOT NULL,
  record_id  INTEGER NOT NULL REFERENCES pvp_records(id) ON DELETE CASCADE,
  applied    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item to remove from the loser's inventory/equip on next save
CREATE TABLE IF NOT EXISTS pvp_pending_removals (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry      JSONB NOT NULL,
  record_id  INTEGER NOT NULL REFERENCES pvp_records(id) ON DELETE CASCADE,
  applied    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trophy ears collected by the winner
CREATE TABLE IF NOT EXISTS pvp_ears (
  id                  SERIAL PRIMARY KEY,
  owner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defeated_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defeated_username   TEXT NOT NULL DEFAULT '',
  record_id           INTEGER NOT NULL REFERENCES pvp_records(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
