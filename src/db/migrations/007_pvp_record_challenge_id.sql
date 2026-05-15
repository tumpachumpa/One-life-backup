-- Link camp PvP records to the exact challenge that created them.
-- Existing rows stay nullable; new camp fights write this id.

ALTER TABLE pvp_records
  ADD COLUMN IF NOT EXISTS challenge_id INTEGER REFERENCES pvp_challenges(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pvp_records_challenge_id_unique_idx
  ON pvp_records (challenge_id);
