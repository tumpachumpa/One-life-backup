-- Add per-slot support to the heroes table.
-- Existing rows (one per user) are treated as slot_1.
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS slot_id TEXT NOT NULL DEFAULT 'slot_1';

-- Drop the old single-hero-per-user unique constraint, replace with per-slot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heroes_user_id_key') THEN
    ALTER TABLE heroes DROP CONSTRAINT heroes_user_id_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heroes_user_id_slot_id_key') THEN
    ALTER TABLE heroes ADD CONSTRAINT heroes_user_id_slot_id_key UNIQUE (user_id, slot_id);
  END IF;
END $$;
