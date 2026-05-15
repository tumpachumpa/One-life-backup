export function markAdventureRunLoot(drop, runId) {
  if (!drop || !runId || typeof drop !== "object") return drop;
  const baseId = drop.baseId || drop.id;
  const uid = drop.uid || (drop.type === "gear" ? `${baseId}_${runId}_${Math.random().toString(36).slice(2, 8)}` : null);
  return {
    ...drop,
    baseId,
    adventureRunId: runId,
    ...(uid ? { uid } : {}),
  };
}

export function markAdventureRunDrops(drops = [], runId) {
  return drops.map(drop => markAdventureRunLoot(drop, runId));
}

export function isAdventureRunLootRef(ref, runId) {
  return !!runId && !!ref && typeof ref === "object" && ref.adventureRunId === runId;
}

export function stripAdventureRunLootFromGrid(grid = [], runId) {
  if (!runId) return grid;
  return (grid || []).filter(entry => !isAdventureRunLootRef(entry?.itemId, runId));
}

export function stripAdventureRunLootFromList(list = [], runId) {
  if (!runId) return list;
  return (list || []).filter(entry => !isAdventureRunLootRef(entry, runId));
}

export function stripAdventureRunLootFromHero(hero, runId) {
  if (!runId) return hero;
  return {
    ...hero,
    inventory: stripAdventureRunLootFromGrid(hero.inventory || [], runId),
  };
}
