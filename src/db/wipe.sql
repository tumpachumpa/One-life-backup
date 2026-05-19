-- ONE LIFE — Full game data wipe
-- Deletes all characters, PvP records, adventure sessions, and game state.
-- User accounts (login credentials) are kept so players can re-register characters.
-- Run with: psql $DATABASE_URL -f src/db/wipe.sql

BEGIN;

-- Adventure sessions
DELETE FROM adventure_sessions;

-- PvP — order matters due to FKs
DELETE FROM pvp_ears;
DELETE FROM pvp_pending_loot;
DELETE FROM pvp_pending_removals;
DELETE FROM pvp_records;
DELETE FROM pvp_challenges;
DELETE FROM pvp_cooldowns;
DELETE FROM pvp_attacks;

-- Camp system
DELETE FROM camps;

-- World state
DELETE FROM tile_claims;
DELETE FROM player_world_state;

-- All hero / character saves (the main wipe)
DELETE FROM heroes;

COMMIT;

-- To also wipe all user accounts (full reset including logins):
-- DELETE FROM users;  -- cascades everything above automatically
