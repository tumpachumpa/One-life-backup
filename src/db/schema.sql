-- OneLife Server Schema

CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  username     VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE heroes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  save_data  JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tile ownership (world map PvP system)
CREATE TABLE tile_claims (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  node_id      VARCHAR(64) NOT NULL,
  ring         INTEGER NOT NULL CHECK (ring IN (0, 1, 2)),
  claimed_at   TIMESTAMPTZ DEFAULT NOW(),
  protected_until TIMESTAMPTZ,
  last_active  TIMESTAMPTZ DEFAULT NOW()
);

-- PvP attack tracking (weekly limit + cooldowns)
CREATE TABLE pvp_attacks (
  id           SERIAL PRIMARY KEY,
  attacker_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  defender_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  result       VARCHAR(8) CHECK (result IN ('win', 'loss')),
  fought_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON pvp_attacks (attacker_id, fought_at);
CREATE INDEX ON pvp_attacks (attacker_id, defender_id, fought_at);
