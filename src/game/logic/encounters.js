import encounterTablesData from "../data/encounterTables.json" with { type: "json" };
import { enemyById } from "./content.js";

export const ENCOUNTER_TABLES = encounterTablesData.tables || {};

let runtimeEncounterTables = null;

export function setRuntimeEncounterTables(tables = null) {
  runtimeEncounterTables = tables;
}

export function getAllEncounterTables() {
  return runtimeEncounterTables || ENCOUNTER_TABLES;
}

export function getEncounterEntryEnemyIds(entry = {}) {
  const fromObjects = Array.isArray(entry.enemies)
    ? entry.enemies.map(enemy => enemy?.enemyId || enemy?.id)
    : [];
  const fromIds = Array.isArray(entry.enemyIds) ? entry.enemyIds : [];
  return [...fromObjects, ...fromIds, entry.enemyId].filter(Boolean);
}

function getWeightedEntries(entries = []) {
  return entries
    .map(entry => ({
      ...entry,
      enemyIds: getEncounterEntryEnemyIds(entry),
      weight: Math.max(0, Number(entry.weight) || 0),
    }))
    .filter(entry => entry.enemyIds.length && entry.weight > 0 && entry.enemyIds.every(id => enemyById[id]));
}

export function getEncounterTable(tableId) {
  return getAllEncounterTables()[tableId] || null;
}

export function getEncounterTableEnemyIds(tableId) {
  const table = getEncounterTable(tableId);
  return [...new Set(getWeightedEntries(table?.entries || []).flatMap(entry => entry.enemyIds))];
}

function buildEncounterRoll(table, entry) {
  const enemies = (entry.enemyIds || getEncounterEntryEnemyIds(entry)).map(id => enemyById[id]).filter(Boolean);
  return {
    table,
    entry,
    enemy: enemies[0] || null,
    enemies,
  };
}

export function rollEncounterTable(tableId, rng = Math.random) {
  const table = getEncounterTable(tableId);
  const entries = getWeightedEntries(table?.entries || []);
  if (!table || !entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return buildEncounterRoll(table, entry);
  }
  const fallback = entries[entries.length - 1];
  return fallback ? buildEncounterRoll(table, fallback) : null;
}
