import { bossById, enemyById, zoneById } from "./content.js";
import { applyEnemyRarity, rollEnemyRarity, scaleCombatant } from "./enemies.js";
import { rollEncounterTable } from "./encounters.js";
import { applyCampfireRarityToEvent, rollCampfireRarity } from "./campfires.js";
import { clampAdventureDifficultyStars } from "./adventureDifficulty.js";

const DEFAULT_DUNGEON_CONFIG = {
  levelCount: 1,
  minStarts: 3,
  maxStarts: 3,
  minPathLength: 21,
  maxPathLength: 21,
  difficultyCoefficient: 1,
  nodeWeights: { combat: 65, random_event: 20, chest: 15 },
  bossId: "lich",
};

const DUNGEON_MAP_SCHEMA = 11;

const FALLBACK_DUNGEON_ENEMY_IDS = [
  "wolf",
  "blood_rat",
  "crow_swarm",
  "boar",
  "forest_bandit",
  "forest_wisp",
  "forest_spirit",
  "orc_patrol",
  "orc_berserker",
];

const RANDOM_EVENT_WEIGHTS = { combat: 65, chest: 25, shrine: 10 };
const RANDOM_EVENT_TYPES = new Set(["combat", "chest", "shrine", "campfire"]);

function getConfiguredRandomEventType(node) {
  const configured = node?.randomEventType || node?.event?.randomEventType;
  if (!configured || configured === "weighted") return null;
  return RANDOM_EVENT_TYPES.has(configured) ? configured : null;
}

function getNodeEnemyIds(node = {}) {
  const fromObjects = Array.isArray(node.enemies)
    ? node.enemies.map(enemy => enemy?.enemyId || enemy?.id)
    : [];
  const fromIds = Array.isArray(node.enemyIds) ? node.enemyIds : [];
  return [...new Set([...fromObjects, ...fromIds, node.enemyId].filter(Boolean))];
}

function resolveNodeEnemies(node = {}) {
  return getNodeEnemyIds(node).map(id => enemyById[id]).filter(Boolean);
}

const DUNGEON_ICONS = {
  combat: "/assets/structures/Nodes/Node_Battle.png",
  campfire: "/assets/structures/Nodes/Node_Campfire_Transparent.png",
  chest: "/assets/sprites/Chest%20closed.png",
  random_event: "/assets/structures/Nodes/Node_Random_Event_Transparent.png",
  boss: "/assets/structures/Nodes/Node_Battle.png",
};

const DUNGEON_BOSS_SPRITE = "/assets/sprites/encounters/Bosses/Lich_boss.png";

function pickWeighted(weights, rng = Math.random) {
  const entries = Object.entries(weights || {});
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let roll = rng() * total;
  for (const [key, value] of entries) {
    roll -= value;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] || "combat";
}

function getEncounterEntries(ids = []) {
  return ids
    .map(enemyId => {
      const enemy = enemyById[enemyId];
      return enemy ? { enemyId, name: enemy.name, sprite: enemy.sprite } : null;
    })
    .filter(Boolean);
}

function getDungeonEncounters(zone) {
  const ids = Array.isArray(zone?.enemyPool) && zone.enemyPool.length
    ? zone.enemyPool
    : FALLBACK_DUNGEON_ENEMY_IDS;
  const encounters = getEncounterEntries(ids);
  if (encounters.length) return encounters;
  return getEncounterEntries(FALLBACK_DUNGEON_ENEMY_IDS);
}

function pickDungeonEncounter(zone, index = 0, rng = Math.random) {
  const pool = getDungeonEncounters(zone);
  if (!pool.length) return null;
  return pool[(index + Math.floor(rng() * pool.length)) % pool.length] || pool[0];
}

function isSpecialEncounter(enemy) {
  return enemy?.threat === "special" || enemy?.isMiniBoss || enemy?.phases || enemy?.boss;
}

function getDungeonEncounterCopyCount(enemy, rng = Math.random) {
  if (isSpecialEncounter(enemy)) return 1 + (rng() < 0.08 ? 1 : 0);
  return 1 + Math.floor(rng() * 4);
}

function shuffleEntries(entries, rng = Math.random) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function buildDungeonEncounterBag(zone, rng = Math.random) {
  const bag = [];
  for (const encounter of getDungeonEncounters(zone)) {
    const count = getDungeonEncounterCopyCount(enemyById[encounter.enemyId], rng);
    for (let index = 0; index < count; index++) bag.push(encounter);
  }
  return shuffleEntries(bag, rng);
}

function drawDungeonEncounter(bag) {
  return bag.length ? bag.shift() : null;
}

function getCampfireRarityForNode(level, depth, seedId) {
  return rollCampfireRarity(seededRng(level * 3000 + depth * 173 + hashString(seedId)));
}

function makeNode(level, depth, index, type, enemyId, bossId, x, y, zone, options = {}) {
  const id = options.id || `d${level}_${index}`;
  const base = { id, type, x, y, next: [], scaleIndex: depth };
  if (type === "combat") return { ...base, enemyId, secretIndex: depth, sprite: enemyById[enemyId]?.sprite || enemyById[zone?.enemyPool?.[0]]?.sprite };
  if (type === "random_event") return { ...base, secretIndex: depth };
  if (type === "boss") return { ...base, bossId };
  const isCampfire = type === "event" && enemyId === "campfire";
  const isShrine = type === "event" && enemyId === "shrine";
  const event = {
    id: `${id}_${type}`,
    title: isShrine ? "Restorative Shrine" : isCampfire ? "Campfire" : "Chest",
    description: isShrine
      ? "An old shrine hums softly, restoring your health completely."
      : isCampfire
      ? "Recover before moving deeper."
      : "A sealed chest waits here.",
    effects: isShrine
      ? [{ type: "restore_hp_pct", value: 100 }]
      : isCampfire
      ? [{ type: "restore_hp_pct", value: 40 }, { type: "restore_energy", value: 20 }]
      : [{ type: "grant_gold", value: 15 + level * 2 }, { type: "grant_loot", lootTable: "forest_chest_equipment", rolls: 1 }],
  };
  const campfireRarity = isCampfire
    ? options.campfireRarity || getCampfireRarityForNode(level, depth, options.seedId || id)
    : null;
  return {
    ...base,
    type: "event",
    event: isCampfire ? applyCampfireRarityToEvent(event, campfireRarity) : event,
  };
}

function getEnemyId(zone, index, rng) {
  return pickDungeonEncounter(zone, index, rng)?.enemyId || null;
}

function getConfiguredDungeonBossId(zone) {
  const bossId = zone?.levelConfig?.bossId || zone?.boss || DEFAULT_DUNGEON_CONFIG.bossId;
  return bossById[bossId] ? bossId : DEFAULT_DUNGEON_CONFIG.bossId;
}

function getDungeonLevelConfig(zone) {
  return {
    ...DEFAULT_DUNGEON_CONFIG,
    ...(zone?.levelConfig || {}),
    bossId: getConfiguredDungeonBossId(zone),
    nodeWeights: { ...DEFAULT_DUNGEON_CONFIG.nodeWeights, ...(zone?.nodeWeights || {}) },
  };
}

function repairDungeonMapBosses(map, zone) {
  if (!map) return map;
  const bossId = getConfiguredDungeonBossId(zone);
  let changed = map.config?.bossId !== bossId;
  const nodes = (map.nodes || []).map(node => {
    if (node.type !== "boss" || node.bossId === bossId) return node;
    changed = true;
    return { ...node, bossId };
  });
  const repairedBossNode = map.bossNode?.type === "boss" && map.bossNode.bossId !== bossId
    ? { ...map.bossNode, bossId }
    : map.bossNode;
  const bossNode = repairedBossNode
    ? nodes.find(node => node.id === repairedBossNode.id) || repairedBossNode
    : repairedBossNode;
  if (bossNode !== map.bossNode) changed = true;
  if (!changed) return map;
  return {
    ...map,
    nodes,
    bossNode,
    config: { ...(map.config || {}), bossId },
  };
}

function buildLevel(level, zone, rng = Math.random) {
  const config = getDungeonLevelConfig(zone);
  const pathCount = Math.max(config.minStarts, Math.min(config.maxStarts, config.minStarts + Math.floor(rng() * (config.maxStarts - config.minStarts + 1))));
  const paths = [];
  const encounterBag = buildDungeonEncounterBag(zone, rng);
  let nodeIndex = 0;
  const bossDepth = config.maxPathLength - 1;
  const nodeDepths = bossDepth;
  const nonBossSlots = pathCount * nodeDepths;
  const specialRatio = 0.2 + rng() * 0.2;
  const specialTarget = Math.max(1, Math.round(nonBossSlots * specialRatio));
  const specialSlots = new Set();
  let specialAttempts = 0;
  while (specialSlots.size < specialTarget && specialAttempts < nonBossSlots * 3) {
    specialSlots.add(Math.floor(rng() * nonBossSlots));
    specialAttempts++;
  }
  for (let fallback = 0; specialSlots.size < specialTarget && fallback < nonBossSlots; fallback++) {
    specialSlots.add(fallback);
  }

  for (let p = 0; p < pathCount; p++) {
    const length = nodeDepths;
    const path = [];
    for (let depth = 0; depth < length; depth++) {
      const pathProgress = depth / Math.max(1, length - 1);
      const laneOffset = p - ((pathCount - 1) / 2);
      const x = 16 + (pathProgress * 70) + (laneOffset * 0.75);
      const y = 14 + ((p + 1) / (pathCount + 1)) * 72 + ((rng() * 5) - 2.5);
      const flatIndex = p * bossDepth + depth;
      let type = "combat";
      let eventKind = null;
      if (specialSlots.has(flatIndex)) {
        type = pickWeighted(config.nodeWeights, rng);
        if (type === "campfire" || type === "chest") {
          eventKind = type;
          type = "event";
        }
      }
      let encounter = null;
      if (type === "combat") {
        encounter = drawDungeonEncounter(encounterBag);
        if (!encounter) type = "random_event";
      }
      path.push(makeNode(level, depth, nodeIndex++, type, type === "event" ? eventKind : encounter?.enemyId || null, config.bossId, Math.round(x), Math.round(y), zone));
    }
    paths.push(path);
  }

  const bossNode = makeNode(level, bossDepth, nodeIndex++, "boss", null, config.bossId, 94, 50, zone);
  connectBranchingPaths(paths, rng);

  const merged = new Map();
  for (const path of paths) {
    for (const node of path) {
      if (!merged.has(node.id)) merged.set(node.id, node);
    }
  }
  merged.set(bossNode.id, bossNode);
  for (const path of paths) {
    const lastNode = path[path.length - 1];
    if (lastNode) lastNode.next = Array.from(new Set([...(lastNode.next || []), bossNode.id]));
  }

  return {
    level,
    nodes: [...merged.values()],
    entryNodes: paths.map(path => path[0]).filter(Boolean),
    bossNode,
    icons: DUNGEON_ICONS,
    start: { x: 7, y: 72 },
    heroStart: { x: 9, y: 72 },
    config,
    schema: DUNGEON_MAP_SCHEMA,
  };
}

export function createDungeonProgress(zoneId = "dungeon", rng = Math.random) {
  const zone = zoneById[zoneId];
  const levelCount = zone?.levelCount || DEFAULT_DUNGEON_CONFIG.levelCount;
  const map = buildLevel(1, zone, rng);
  return {
    zoneId,
    level: 1,
    levelCount,
    maps: { 1: map },
    selectedNodeId: null,
    entered: false,
    unlockedNodes: [],
    completedNodes: [],
    lastWonFightNodeId: null,
    routeChoices: {},
    routeTrail: [],
    lockedRoute: {},
    bossCompleted: false,
    pendingAdvance: false,
  };
}

export function normalizeDungeonProgress(progress) {
  if (!progress) return createDungeonProgress("dungeon");
  const zoneId = progress.zoneId || "dungeon";
  const zone = zoneById[zoneId];
  const level = Math.max(1, progress.level || 1);
  const maps = { ...(progress.maps || {}) };
  let changed = false;
  Object.entries(maps).forEach(([mapLevel, map]) => {
    if (map?.schema !== DUNGEON_MAP_SCHEMA) return;
    const repaired = repairDungeonMapBosses(map, zone);
    if (repaired !== map) {
      maps[mapLevel] = repaired;
      changed = true;
    }
  });
  if (maps[level]?.schema !== DUNGEON_MAP_SCHEMA) {
    maps[level] = buildLevel(level, zone, seededRng(level));
    changed = true;
  }
  const levelCount = zone?.levelCount || DEFAULT_DUNGEON_CONFIG.levelCount;
  if (!changed && progress.zoneId === zoneId && progress.levelCount === levelCount) return progress;
  return {
    ...progress,
    zoneId,
    levelCount,
    maps,
  };
}

function seededRng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function hashString(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getDungeonMap(progress, rng = Math.random) {
  const zone = zoneById[progress?.zoneId || "dungeon"];
  const level = Math.max(1, progress?.level || 1);
  const cached = progress?.maps?.[level];
  if (cached?.schema === DUNGEON_MAP_SCHEMA) return repairDungeonMapBosses(cached, zone);
  return buildLevel(level, zone, seededRng(level));
}

export function hasEnteredDungeon(progress) {
  if (typeof progress?.entered === "boolean") return progress.entered;
  return !!progress?.selectedNodeId || (progress?.completedNodes?.length || 0) > 0 || (progress?.unlockedNodes?.length || 0) > 0;
}

export function enterDungeon(progress) {
  const map = getDungeonMap(progress);
  if (hasEnteredDungeon(progress)) return { ...progress, entered: true };
  return {
    ...progress,
    entered: true,
    unlockedNodes: (map.entryNodes || []).map(node => node.id),
  };
}

function connectBranchingPaths(paths, rng = Math.random) {
  if (!paths.length) return;
  const depthCount = Math.max(...paths.map(path => path.length));
  const layers = Array.from({ length: depthCount }, (_, depth) => paths.map((path, pathIndex) => ({
    node: path[depth] || null,
    pathIndex,
  })).filter(entry => entry.node));

  for (let depth = 0; depth < layers.length - 1; depth++) {
    const currentLayer = layers[depth];
    const nextLayer = layers[depth + 1];
    if (!currentLayer.length || !nextLayer.length) continue;

    const outgoing = new Map(currentLayer.map(entry => [entry.node.id, new Set()]));

    // First guarantee every node in the next layer is reachable from at least one parent.
    nextLayer.forEach((target, targetIndex) => {
      const orderedParents = [...currentLayer].sort((a, b) => {
        const distA = Math.abs(a.pathIndex - target.pathIndex);
        const distB = Math.abs(b.pathIndex - target.pathIndex);
        if (distA !== distB) return distA - distB;
        return Math.abs(currentLayer.indexOf(a) - targetIndex) - Math.abs(currentLayer.indexOf(b) - targetIndex);
      });
      const parentCount = Math.min(
        orderedParents.length,
        1 + (orderedParents.length > 1 && rng() < 0.38 ? 1 : 0),
      );
      for (let index = 0; index < parentCount; index++) {
        outgoing.get(orderedParents[index].node.id)?.add(target.node.id);
      }
    });

    // Then add extra nearby exits so each current node can expose 1-3 decisions.
    currentLayer.forEach((source, sourceIndex) => {
      const preferredTargets = nextLayer
        .filter(target => Math.abs(target.pathIndex - source.pathIndex) <= 1)
        .sort((a, b) => Math.abs(a.pathIndex - source.pathIndex) - Math.abs(b.pathIndex - source.pathIndex));
      const branchTarget = 1 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.22 ? 1 : 0);
      const nextIds = outgoing.get(source.node.id);
      for (const target of preferredTargets) {
        if ((nextIds?.size || 0) >= branchTarget) break;
        nextIds?.add(target.node.id);
      }

      // If the nearby pool was too small, allow one farther branch occasionally.
      if ((nextIds?.size || 0) < branchTarget) {
        const fallbackTargets = nextLayer
          .filter(target => !nextIds?.has(target.node.id))
          .sort((a, b) => Math.abs(a.pathIndex - source.pathIndex) - Math.abs(b.pathIndex - source.pathIndex));
        for (const target of fallbackTargets) {
          if ((nextIds?.size || 0) >= Math.min(3, branchTarget)) break;
          nextIds?.add(target.node.id);
        }
      }

      source.node.next = [...(nextIds || [])];
    });
  }
}

export function isDungeonNodeReachable(progress, nodeId) {
  const currentNode = getDungeonMap(progress).nodes.find(node => node.id === progress?.selectedNodeId);
  if (!currentNode) return false;
  if (progress?.completedNodes?.includes(currentNode.id)) {
    return (currentNode.next || []).includes(nodeId);
  }
  return progress?.completedNodes?.length === 0 && currentNode.id === nodeId;
}

export function isDungeonNodeSelectable(progress, nodeId) {
  if (!hasEnteredDungeon(progress)) return false;
  const map = getDungeonMap(progress);
  const node = map.nodes.find(entry => entry.id === nodeId);
  if (!node) return false;
  const currentNode = map.nodes.find(entry => entry.id === progress?.selectedNodeId);
  const isEntry = (map.entryNodes || []).some(entry => entry.id === node.id);
  if (!progress?.selectedNodeId) return isEntry;
  if (!progress.completedNodes?.includes(progress.selectedNodeId)) {
    return currentNode?.id === node.id;
  }
  const lockedNext = progress?.lockedRoute?.[currentNode?.id];
  if (lockedNext) return node.id === lockedNext;
  const trail = Array.isArray(progress?.routeTrail) ? progress.routeTrail : [];
  const currentIndex = trail.lastIndexOf(currentNode?.id);
  const trailNext = currentIndex >= 0 ? trail[currentIndex + 1] : null;
  if (trailNext) return node.id === trailNext;
  const chosenNext = progress?.routeChoices?.[currentNode?.id];
  if (chosenNext) return node.id === chosenNext;
  return !!currentNode && progress.completedNodes.includes(currentNode.id) && (currentNode.next || []).includes(node.id);
}

export function selectDungeonNode(progress, nodeId) {
  if (!hasEnteredDungeon(progress)) return progress;
  const map = getDungeonMap(progress);
  const node = map.nodes.find(entry => entry.id === nodeId);
  if (!node) return progress;
  const currentNode = map.nodes.find(entry => entry.id === progress?.selectedNodeId) || null;
  const isEntry = (map.entryNodes || []).some(entry => entry.id === node.id);
  const selectedPath = { ...(progress?.routeChoices || {}) };
  const trail = Array.isArray(progress?.routeTrail) ? [...progress.routeTrail] : [];
  const lockedRoute = { ...(progress?.lockedRoute || {}) };
  if (currentNode?.id && currentNode.id !== node.id && (currentNode.next || []).includes(node.id)) {
    selectedPath[currentNode.id] = node.id;
    lockedRoute[currentNode.id] = node.id;
  }
  if (!progress?.selectedNodeId && !isEntry) return progress;
  if (!trail.length || trail[trail.length - 1] !== currentNode?.id) {
    if (currentNode?.id && !trail.includes(currentNode.id)) trail.push(currentNode.id);
  }
  if (!trail.length || trail[trail.length - 1] !== node.id) trail.push(node.id);
  const unlockedNodes = Array.from(new Set([...(progress?.unlockedNodes || []), node.id, ...(node.next || [])]));
  return {
    ...progress,
    entered: true,
    selectedNodeId: node.id,
    unlockedNodes,
    routeChoices: selectedPath,
    routeTrail: trail,
    lockedRoute,
  };
}

export function getDungeonNode(progress, nodeId, rng = Math.random) {
  const map = getDungeonMap(progress, rng);
  return map.nodes.find(node => node.id === nodeId) || null;
}

export function isDungeonAdventure(adventure) {
  return !!adventure?.procedural && adventure.zoneId === "dungeon";
}

export function createDungeonEncounter(adventure, node, dungeonState, rng = Math.random) {
  if (!adventure || !node) return null;
  const zone = zoneById[adventure.zoneId];
  const mapLevel = dungeonState?.level || 1;
  const depth = node.scaleIndex || mapLevel;
  const roomIndex = Math.max(0, depth - 1);
  const difficultyStars = clampAdventureDifficultyStars(dungeonState?.activeDifficultyStars);
  if (node.type === "boss") {
    const bossId = getConfiguredDungeonBossId(zone);
    const boss = bossById[bossId] || bossById[node.bossId] || bossById[DEFAULT_DUNGEON_CONFIG.bossId];
    if (!boss?.baseStats || !boss.sprite) return { type: "event", idx: roomIndex, event: { id: `${node.id}_fallback`, title: "Empty Room", description: "This room has not been populated yet.", effects: [] }, node };
    const scaled = scaleCombatant(boss, roomIndex, zone, false, { difficultyStars });
    const bossTint = node.bossTint || Math.floor(rng() * 0xffffff) || 0xffffff;
    const dungeonBoss = {
      ...scaled,
      sprite: boss.sprite || DUNGEON_BOSS_SPRITE,
      name: boss.name,
      dungeonLevel: dungeonState?.level || 1,
      difficultyCoefficient: zone?.difficultyCoefficient || 1,
      boss: true,
      bossTint,
      stats: {
        ...scaled.stats,
        maxHp: Math.max(1, Math.round(scaled.stats.maxHp * 0.3)),
        attack: Math.max(1, Math.round(scaled.stats.attack * 0.3)),
        armor: Math.max(0, Math.round(scaled.stats.armor * 0.3)),
      },
      hp: Math.max(1, Math.round(scaled.hp * 0.3)),
    };
    const rolledBoss = applyEnemyRarity(
      dungeonBoss,
      difficultyStars > 0 ? rollEnemyRarity(rng, { difficultyStars, boss: true }) : { id: "normal" },
      { allowBossRarity: difficultyStars > 0 },
    );
    node.bossTint = bossTint;
    return { type: "boss", idx: roomIndex, enemy: rolledBoss, enemies: [rolledBoss], bossDeathEndsFight: true, addsDespawnOnBossDeath: true, node };
  }
  if (node.type === "random_event") {
    const randomType = getConfiguredRandomEventType(node)
      || pickWeighted(RANDOM_EVENT_WEIGHTS, seededRng((dungeonState?.level || 1) * 1000 + (node.scaleIndex || 0) * 97 + hashString(node.id)));
    if (randomType === "shrine" || randomType === "chest" || randomType === "campfire") {
      const eventNode = makeNode(dungeonState?.level || 1, node.scaleIndex || 0, 0, "event", randomType, null, node.x, node.y, zone, { seedId: node.id });
      return { type: "event", idx: roomIndex, event: eventNode.event, node };
    }
  }
  if (node.type === "event") return { type: "event", idx: roomIndex, event: applyCampfireRarityToEvent(node.event, node.campfireRarity || node.event?.rarity), node };
  const encounterPool = getDungeonEncounters(zone);
  const seededEncounterRng = seededRng((dungeonState?.level || 1) * 2000 + (node.scaleIndex || 0) * 131 + hashString(node.id));
  const randomEventEncounter = node.type === "random_event"
    ? pickDungeonEncounter(zone, roomIndex + (node.scaleIndex || 0), seededEncounterRng)
    : null;
  const tableRoll = node.encounterTableId ? rollEncounterTable(node.encounterTableId, seededEncounterRng) : null;
  const nodeEnemies = resolveNodeEnemies(node);
  const resolvedEnemyId = tableRoll?.entry?.enemyId || tableRoll?.entry?.enemyIds?.[0] || node.enemyId || node.enemyIds?.[0] || (node.type === "random_event" ? randomEventEncounter?.enemyId : null);
  const fallbackEncounter = pickDungeonEncounter(zone, roomIndex, rng);
  const fallbackEnemyId = resolvedEnemyId || fallbackEncounter?.enemyId || getEnemyId(zone, roomIndex, rng);
  const encounter = encounterPool.find(entry => entry.enemyId === resolvedEnemyId)
    || encounterPool.find(entry => entry.enemyId === fallbackEnemyId)
    || fallbackEncounter
    || encounterPool[0];
  const enemies = tableRoll?.enemies?.length
    ? tableRoll.enemies
    : nodeEnemies.length
      ? nodeEnemies
      : [enemyById[resolvedEnemyId] || enemyById[fallbackEnemyId] || enemyById[encounter?.enemyId]].filter(Boolean);
  const enemy = tableRoll?.enemy || enemies[0];
  if (!enemy) return { type: "event", idx: roomIndex, event: { id: `${node.id}_fallback`, title: "Empty Room", description: "This room has not been populated yet.", effects: [] }, node };
  const dungeonDepth = (dungeonState?.level || 1) - 1;
  const effectiveIndex = roomIndex + dungeonDepth;
  const scaledEnemies = enemies.map(entry => scaleCombatant(entry, effectiveIndex, zone, false, { difficultyStars }));
  const lootTags = node.type === "combat" || node.type === "random_event" ? (zone?.lootTags || ["weapon", "shield", "ring", "bag", "camp", "food"]) : [];
  const lootChance = Math.max(0.45, Math.min(0.95, 0.55 + (dungeonState?.level || 1) * 0.01 + depth * 0.01));
  const rolledEnemies = scaledEnemies.map((scaled, index) => applyEnemyRarity({
    ...scaled,
    name: index === 0 ? (tableRoll?.enemy?.name || encounter?.name || scaled.name) : scaled.name,
    sprite: index === 0 ? (tableRoll?.enemy?.sprite || encounter?.sprite || scaled.sprite) : scaled.sprite,
    dungeonLevel: dungeonState?.level || 1,
    difficultyCoefficient: zone?.difficultyCoefficient || 1,
    lootTags,
    lootChance,
    lootRolls: index === 0 ? 1 : 0,
    lootBonus: Math.floor((dungeonState?.level || 1) * 1.5 + depth * 0.5),
  }, rollEnemyRarity(rng, { difficultyStars })));
  return {
    type: "combat",
    idx: roomIndex,
    enemy: rolledEnemies[0],
    enemies: rolledEnemies,
    bossDeathEndsFight: node.bossDeathEndsFight ?? tableRoll?.entry?.bossDeathEndsFight ?? (rolledEnemies.length <= 1),
    addsDespawnOnBossDeath: node.addsDespawnOnBossDeath ?? tableRoll?.entry?.addsDespawnOnBossDeath ?? true,
    node,
  };
}

export function advanceDungeonProgress(progress, nodeId, node) {
  const zone = zoneById[progress.zoneId || "dungeon"];
  const nextNodes = Array.isArray(node?.next) ? node.next : [];
  const completedNodes = Array.from(new Set([...(progress.completedNodes || []), nodeId]));
  const unlockedNodes = Array.from(new Set([...(progress.unlockedNodes || []), ...nextNodes]));
  const bossCleared = progress.bossCompleted || node?.type === "boss";
  const levelCompleted = node?.type === "boss";
  const currentLevel = progress.level || 1;
  const maxLevel = zone?.levelCount || DEFAULT_DUNGEON_CONFIG.levelCount;
  const nextLevel = levelCompleted ? Math.min(maxLevel, currentLevel + 1) : currentLevel;
  const savedCurrentMap = progress.maps?.[currentLevel];
  const currentMap = savedCurrentMap?.schema === DUNGEON_MAP_SCHEMA
    ? savedCurrentMap
    : buildLevel(currentLevel, zone);
  const nextMap = levelCompleted && nextLevel > currentLevel
    ? buildLevel(nextLevel, zone)
    : progress.maps?.[nextLevel];
  return {
    ...progress,
    level: nextLevel,
    levelCount: maxLevel,
    maps: {
      ...(progress.maps || {}),
      [currentLevel]: currentMap,
      ...(nextMap ? { [nextLevel]: nextMap } : {}),
    },
    completedNodes,
    lastWonFightNodeId: levelCompleted ? null : (node?.type === "combat" ? nodeId : progress.lastWonFightNodeId || null),
    entered: levelCompleted ? false : true,
    unlockedNodes: levelCompleted ? [] : unlockedNodes,
    selectedNodeId: levelCompleted ? null : nodeId,
    routeChoices: levelCompleted ? {} : (progress.routeChoices || {}),
    routeTrail: levelCompleted ? [] : (progress.routeTrail || []),
    lockedRoute: levelCompleted ? {} : (progress.lockedRoute || {}),
    bossCompleted: bossCleared,
    pendingAdvance: levelCompleted,
  };
}

export function revertDungeonOnDeath(progress) {
  const map = getDungeonMap(progress);
  const currentLevelIds = new Set((map.nodes || []).map(n => n.id));
  const lastWon = progress?.lastWonFightNodeId;
  const fallback = (lastWon && currentLevelIds.has(lastWon) ? lastWon : null)
    || map.entryNodes?.[0]?.id
    || null;
  return {
    ...progress,
    selectedNodeId: fallback,
  };
}
