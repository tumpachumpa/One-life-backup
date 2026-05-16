-- Prevent two players from simultaneously holding active challenges against each other.
-- LEAST/GREATEST normalises the pair so (A→B) and (B→A) map to the same index entry.
CREATE UNIQUE INDEX IF NOT EXISTS pvp_challenges_active_normalized_pair
  ON pvp_challenges (LEAST(challenger_id, defender_id), GREATEST(challenger_id, defender_id))
  WHERE status IN ('pending', 'prep');
