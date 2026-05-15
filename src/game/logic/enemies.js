import { DAY_COMBATS, NIGHT_COMBATS } from "../constants.js";
import { enemyById, bossById, zoneById } from "./content.js";
import {
  clampAdventureDifficultyStars,
  getAdventureDifficultyMultiplier,
} from "./adventureDifficulty.js";

export const THREAT_MULTIPLIERS = {
  minor: 1.0,
  standard: 1.25,
  dangerous: 1.55,
};

export const MONSTER_DAMAGE_MULTIPLIER = 0.85;
export const MONSTER_ARMOR_MULTIPLIER = 0.85;
export const ADVENTURE_HP_MULT_PER_DEPTH = 0.02;

export const ENEMY_RARITIES = {
  normal: { label: "", chance: 90, color: "#aaa", hp: 1, attack: 1, armor: 1, xp: 1, gold: 1, lootBonus: 0 },
  raro: { label: "Rare", chance: 7, color: "#3498db", hp: 1.35, attack: 1.15, armor: 1.1, xp: 1.35, gold: 1.25, lootBonus: 15 },
  epico: { label: "Epic", chance: 2.5, color: "#9b59b6", hp: 1.75, attack: 1.3, armor: 1.2, xp: 1.8, gold: 1.6, lootBonus: 35 },
  legendario: { label: "Legendary", chance: 0.5, color: "#f1c40f", hp: 2.4, attack: 1.55, armor: 1.35, xp: 2.75, gold: 2.25, lootBonus: 65 },
};

function scaleMonsterCombatValue(value, multiplier, minPositive = 0) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(minPositive, Math.round(numeric * multiplier));
}

export function scaleMonsterAttack(value) {
  return scaleMonsterCombatValue(value, MONSTER_DAMAGE_MULTIPLIER, 1);
}

export function scaleMonsterArmor(value) {
  return scaleMonsterCombatValue(value, MONSTER_ARMOR_MULTIPLIER, 0);
}

export function scaleMonsterAbilities(abilities = []) {
  return abilities.map(ability => ability?.damage != null
    ? { ...ability, damage: scaleMonsterAttack(ability.damage) }
    : ability);
}

export function getDayNight(totalCombats) {
  const cycle = DAY_COMBATS + NIGHT_COMBATS;
  const pos = totalCombats % cycle;
  return {
    isNight: pos >= DAY_COMBATS,
    dayNumber: Math.floor(totalCombats / cycle) + 1,
    pos,
    cycle,
  };
}

function isBossDefinition(def) {
  return !!(def?.phases || def?.boss || def?.threat === "boss");
}

function getAdventureDepthHpMult(def, roomIndex = 0) {
  if (isBossDefinition(def)) return 1;
  const depth = Math.max(0, Math.floor(Number(roomIndex) || 0));
  return 1 + depth * ADVENTURE_HP_MULT_PER_DEPTH;
}

export function scaleCombatant(def, roomIndex = 0, zone, isNight = false, options = {}) {
  const difficultyStars = clampAdventureDifficultyStars(options?.difficultyStars);
  const difficultyMult = getAdventureDifficultyMultiplier(difficultyStars);
  if (!def?.baseStats) {
    return {
      id: def?.id || "unknown_enemy",
      name: def?.name || "Unknown Enemy",
      family: def?.family || "unknown",
      baseStats: { maxHp: 1, attack: 1, armor: 0 },
      stats: { maxHp: 1, attack: scaleMonsterAttack(1), armor: scaleMonsterArmor(0) },
      hp: 1,
      rewards: def?.rewards || { xp: 0, gold: 0 },
      effects: def?.effects || [],
    };
  }
  const threatMult = THREAT_MULTIPLIERS[def.threat] ?? 1.0;
  const hpMult = (isNight ? 1.1 : 1) * threatMult * getAdventureDepthHpMult(def, roomIndex) * difficultyMult;
  const atkMult = threatMult * difficultyMult;
  const armorMult = threatMult * difficultyMult;
  const rewardMult = threatMult * difficultyMult;

  const scaledDodgePhaseConfig = def.dodgePhaseConfig?.length
    ? def.dodgePhaseConfig.map(phase => {
        const MIN_WARNING_MS = 400;
        const warningReduction = 50 * difficultyStars;
        return {
          ...phase,
          damage: Math.round((phase.damage ?? 0) * difficultyMult),
          ...(phase.warningMs != null ? { warningMs: Math.max(MIN_WARNING_MS, phase.warningMs - warningReduction) } : {}),
          ...(phase.waves ? {
            waves: phase.waves.map(wave => ({
              ...wave,
              ...(wave.warningMs != null ? { warningMs: Math.max(MIN_WARNING_MS, wave.warningMs - warningReduction) } : {}),
            })),
          } : {}),
        };
      })
    : undefined;

  return {
    ...def,
    stats: {
      ...def.baseStats,
      maxHp: Math.round(def.baseStats.maxHp * hpMult),
      attack: scaleMonsterAttack(def.baseStats.attack * atkMult),
      armor: scaleMonsterArmor((def.baseStats.armor || 0) * armorMult),
    },
    hp: Math.round(def.baseStats.maxHp * hpMult),
    rewards: {
      xp: Math.round((def.rewards?.xp || 0) * rewardMult),
      gold: Math.round((def.rewards?.gold || 0) * rewardMult),
    },
    ...(scaledDodgePhaseConfig ? { dodgePhaseConfig: scaledDodgePhaseConfig } : {}),
  };
}

export function getEnemyRarityWeights(difficultyStars = 0) {
  const stars = clampAdventureDifficultyStars(difficultyStars);
  if (stars <= 0) return Object.fromEntries(Object.entries(ENEMY_RARITIES).map(([id, rarity]) => [id, rarity.chance]));
  return {
    normal: Math.max(15, ENEMY_RARITIES.normal.chance - stars * 5),
    raro: ENEMY_RARITIES.raro.chance + stars * 2.5,
    epico: ENEMY_RARITIES.epico.chance + stars * 1.7,
    legendario: ENEMY_RARITIES.legendario.chance + stars * 0.8,
  };
}

export function rollEnemyRarity(rng = Math.random, options = {}) {
  const weights = getEnemyRarityWeights(options?.difficultyStars);
  const total = Object.values(weights).reduce((sum, chance) => sum + chance, 0);
  const roll = rng() * total;
  let acc = 0;
  for (const [id, rarity] of Object.entries(ENEMY_RARITIES)) {
    acc += weights[id] ?? rarity.chance;
    if (roll < acc) return { id, ...rarity };
  }
  return { id: "normal", ...ENEMY_RARITIES.normal };
}

export function applyEnemyRarity(enemy, rarity, options = {}) {
  if (!rarity || rarity.id === "normal" || (enemy.phases && !options.allowBossRarity)) return { ...enemy, rarity: { id: "normal", ...ENEMY_RARITIES.normal } };
  return {
    ...enemy,
    name: `${rarity.label} ${enemy.name}`,
    rarity,
    stats: {
      ...enemy.stats,
      maxHp: Math.round(enemy.stats.maxHp * rarity.hp),
      attack: Math.round(enemy.stats.attack * rarity.attack),
      armor: Math.round(enemy.stats.armor * rarity.armor),
    },
    hp: Math.round(enemy.hp * rarity.hp),
    rewards: {
      xp: Math.round((enemy.rewards?.xp || 0) * rarity.xp),
      gold: Math.round((enemy.rewards?.gold || 0) * rarity.gold),
    },
    lootBonus: rarity.lootBonus,
  };
}

export function buildZoneRooms(zoneId, totalCombats = 0, rng = Math.random) {
  const zone = zoneById[zoneId];
  const dn = getDayNight(totalCombats);
  const rooms = [];
  const specialByIndex = new Map((zone.specialRooms || []).map(entry => [entry.at, entry.event]));
  let combatIndex = 0;

  for (let i = 0; i < zone.rooms; i++) {
    const specialEvent = specialByIndex.get(i);
    if (specialEvent) {
      rooms.push({ type: "event", idx: i, event: specialEvent });
      continue;
    }

    const enemyId = zone.enemyPool[combatIndex % zone.enemyPool.length];
    const scaledEnemy = scaleCombatant(enemyById[enemyId], combatIndex, zone, dn.isNight);
    rooms.push({ type: "combat", idx: i, enemy: applyEnemyRarity(scaledEnemy, rollEnemyRarity(rng)) });
    combatIndex++;
  }
  const bossDef = bossById[zone.boss] || enemyById[zone.boss];
  if (bossDef) {
    rooms.push({ type: "boss", idx: zone.rooms, enemy: scaleCombatant(bossDef, zone.rooms, zone, dn.isNight) });
  }
  return rooms;
}

export function getBossPhase(enemy, hpPct) {
  if (!enemy?.phases) return null;
  const sorted = [...enemy.phases].sort((a, b) => a.thresholdPct - b.thresholdPct);
  return sorted.find(phase => hpPct * 100 <= phase.thresholdPct) || enemy.phases[0];
}
