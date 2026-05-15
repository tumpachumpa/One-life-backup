-- Camp system replacing tile_claims
-- A camp is created when a player sets camp at an adventure node.
-- One camp per player at a time.

CREATE TABLE IF NOT EXISTS camps (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hero_name       TEXT NOT NULL DEFAULT '',
  hero_level      INTEGER NOT NULL DEFAULT 1,
  adventure_id    TEXT NOT NULL,
  col             INTEGER NOT NULL,
  row             INTEGER NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  protected_until TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'prep', 'fighting', 'done'))
);

-- A challenge queued against a player currently in a dungeon.
-- One active challenge per challenger/defender pair at a time.

CREATE TABLE IF NOT EXISTS pvp_challenges (
  id               SERIAL PRIMARY KEY,
  challenger_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defender_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adventure_id     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'prep', 'cancelled', 'done')),
  queued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prep_started_at  TIMESTAMPTZ,
  winner_id        INTEGER REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pvp_challenges_active_pair
  ON pvp_challenges (challenger_id, defender_id)
  WHERE status IN ('pending', 'prep');

-- Per-pair cooldown after a cancelled or completed fight.

CREATE TABLE IF NOT EXISTS pvp_cooldowns (
  challenger_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cooldown_until TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (challenger_id, defender_id)
);
