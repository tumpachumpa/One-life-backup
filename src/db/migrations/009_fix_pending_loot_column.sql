DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pvp_pending_loot' AND column_name = 'claimed'
  ) THEN
    ALTER TABLE pvp_pending_loot RENAME COLUMN claimed TO applied;
  END IF;
END $$;
