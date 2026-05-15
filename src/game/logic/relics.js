// Relic system
// Relics are passive items. A relic is active if it occupies one of the first 5 inventory
// grid positions (sorted left-to-right, top-to-bottom by x+y*INV_COLS order).
// getActiveRelics(hero) -> relic items array (first 5 relics by grid position)
// hasRelic(hero, relicId) -> bool
// getRelicPassive(relicId) -> passive definition
// applyRelicStatBonuses(hero, stats) -> modified stats

import { INV_COLS } from '../constants.js';
import { getItem } from './content.js';

const MAX_ACTIVE_RELICS = 5;
export const MAX_RELIC_SLOTS = 5;

/**
 * Convert a grid position {x, y} to a linear sort index.
 */
function gridPositionIndex(placed) {
  const x = placed.x ?? 0;
  const y = placed.y ?? 0;
  return y * INV_COLS + x;
}

/**
 * Return all relic placed-items in inventory sorted by grid position.
 * Active relics are the first MAX_ACTIVE_RELICS in that list.
 */
function getSortedRelicsInInventory(hero) {
  const inventory = hero?.inventory || [];
  return inventory
    .filter(placed => {
      if (!placed || !placed.itemId) return false;
      const item = getItem(placed.itemId);
      return item?.type === 'relic';
    })
    .slice()
    .sort((a, b) => gridPositionIndex(a) - gridPositionIndex(b));
}

/**
 * Return the up-to-5 active relic item definitions for a hero.
 * Reads from hero.relicSlots when present (new system).
 * Falls back to first 5 relics by grid position for legacy heroes.
 */
export function getActiveRelics(hero) {
  if (Array.isArray(hero?.relicSlots)) {
    return hero.relicSlots
      .filter(Boolean)
      .map(itemId => getItem(itemId))
      .filter(Boolean);
  }
  return getSortedRelicsInInventory(hero)
    .slice(0, MAX_ACTIVE_RELICS)
    .map(placed => getItem(placed.itemId))
    .filter(Boolean);
}

/**
 * Return MAX_RELIC_SLOTS slot entries — each null or { itemId, item }.
 * Used by the relic slots UI panel.
 */
export function getRelicSlots(hero) {
  return Array.from({ length: MAX_RELIC_SLOTS }, (_, i) => {
    const itemId = (hero?.relicSlots || [])[i] || null;
    return itemId ? { itemId, item: getItem(itemId) } : null;
  });
}

/**
 * Migrate a legacy hero (no relicSlots) by populating relicSlots
 * from the first up-to-5 relics found in inventory.
 * Returns the hero unchanged if relicSlots is already set.
 */
export function migrateHeroRelicSlots(hero) {
  if (Array.isArray(hero?.relicSlots)) return hero;
  const sorted = getSortedRelicsInInventory(hero);
  const relicSlots = sorted.slice(0, MAX_RELIC_SLOTS).map(placed => placed.itemId);
  const slotItemIds = new Set(relicSlots.map(id => (typeof id === 'object' ? id.id : id)));
  const inventory = (hero?.inventory || []).filter(placed => {
    const item = getItem(placed.itemId);
    if (item?.type !== 'relic') return true;
    const baseId = typeof placed.itemId === 'object' ? placed.itemId.id : placed.itemId;
    if (slotItemIds.has(baseId)) { slotItemIds.delete(baseId); return false; }
    return true;
  });
  return { ...hero, relicSlots, inventory };
}

/**
 * Return all relic placed-items with their active status (legacy, grid-based).
 * Useful for UI rendering when relicSlots is not set.
 */
export function getRelicsWithStatus(hero) {
  const sorted = getSortedRelicsInInventory(hero);
  return sorted.map((placed, idx) => ({
    placed,
    item: getItem(placed.itemId),
    active: idx < MAX_ACTIVE_RELICS,
  }));
}

/**
 * Check whether a hero already has a specific relic in inventory (any position).
 */
export function hasRelic(hero, relicId) {
  if (!relicId || !hero?.inventory) return false;
  return hero.inventory.some(placed => placed?.itemId === relicId);
}

/**
 * Return the relicPassive definition for a given relic item id.
 */
export function getRelicPassive(relicId) {
  const item = getItem(relicId);
  return item?.relicPassive || null;
}

/**
 * Apply passive stat bonuses from active relics to a stats object.
 * Currently handles:
 *   - max_hp_pct_bonus: adds percentage to maxHp
 *   - (other passive types are handled at combat time)
 *
 * Returns a new stats object with relic bonuses applied.
 */
export function applyRelicStatBonuses(hero, stats) {
  if (!stats) return stats;
  const activeRelics = getActiveRelics(hero);
  let maxHpBonusPct = 0;

  for (const relic of activeRelics) {
    const passive = relic?.relicPassive;
    if (!passive) continue;
    if (passive.type === 'max_hp_pct_bonus') {
      maxHpBonusPct += Number(passive.value || 0);
    }
  }

  if (maxHpBonusPct === 0) return stats;

  return {
    ...stats,
    maxHp: Math.max(1, Math.round((stats.maxHp || 0) * (1 + maxHpBonusPct / 100))),
  };
}

/**
 * Check whether a relic passive type is active for a hero.
 */
export function hasActiveRelicType(hero, passiveType) {
  return getActiveRelics(hero).some(relic => relic?.relicPassive?.type === passiveType);
}

/**
 * Get the first active relic matching a passive type.
 */
export function getActiveRelicByType(hero, passiveType) {
  return getActiveRelics(hero).find(relic => relic?.relicPassive?.type === passiveType) || null;
}
