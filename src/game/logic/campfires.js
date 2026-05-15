export const CAMPFIRE_RARITIES = {
  normal: { id: "normal", label: "", color: "#aaa", chance: 74, healMult: 1, priceMult: 1 },
  uncommon: { id: "uncommon", label: "Uncommon", color: "#2ecc71", chance: 0, healMult: 1.15, priceMult: 1.18 },
  rare: { id: "rare", label: "Rare", color: "#3498db", chance: 20, healMult: 1.35, priceMult: 1.4 },
  epic: { id: "epic", label: "Epic", color: "#9b59b6", chance: 6, healMult: 1.7, priceMult: 2.2 },
};

const CAMPFIRE_RARITY_PREFIX = /^(Uncommon|Rare|Epic|Legendary|Artifact|Unique)\s+/i;
const CAMPFIRE_RARITY_CAPS = {
  legendary: "epic",
  artifact: "epic",
  unique: "epic",
};

export function getCampfireRarity(rarity = "normal") {
  const id = typeof rarity === "string" ? rarity : rarity?.id;
  return CAMPFIRE_RARITIES[id] || CAMPFIRE_RARITIES[CAMPFIRE_RARITY_CAPS[id]] || CAMPFIRE_RARITIES.normal;
}

export function rollCampfireRarity(rng = Math.random) {
  const entries = Object.values(CAMPFIRE_RARITIES).filter(rarity => rarity.chance > 0);
  const total = entries.reduce((sum, rarity) => sum + rarity.chance, 0);
  let roll = rng() * total;
  for (const rarity of entries) {
    roll -= rarity.chance;
    if (roll <= 0) return rarity;
  }
  return CAMPFIRE_RARITIES.normal;
}

export function isCampfireItem(item) {
  return !!item && (item.id === "campfire" || item.baseId === "campfire" || item.family === "camp_supply" || item.tags?.includes("campfire"));
}

export function isCampfireEvent(event) {
  const title = `${event?.baseTitle || event?.title || ""}`.replace(CAMPFIRE_RARITY_PREFIX, "").trim().toLowerCase();
  return title === "campfire" || event?.kind === "campfire" || `${event?.id || ""}`.toLowerCase().includes("campfire");
}

export function getCampfireHealingPct(baseValue = 40, rarityInput = "normal") {
  const value = Number(baseValue);
  if (!Number.isFinite(value)) return 0;
  const rarity = getCampfireRarity(rarityInput);
  return Math.max(0, Math.min(100, Math.round(value * rarity.healMult)));
}

export function scaleCampfireEffects(effects = [], rarityInput = "normal") {
  const rarity = getCampfireRarity(rarityInput);
  return effects.map(effect => {
    if (effect?.type !== "restore_hp_pct") return { ...effect };
    const baseValue = effect.baseValue ?? effect.value;
    return {
      ...effect,
      baseValue,
      value: getCampfireHealingPct(baseValue, rarity),
    };
  });
}

function campfireBaseName(name = "Campfire") {
  return `${name || "Campfire"}`.replace(CAMPFIRE_RARITY_PREFIX, "").trim() || "Campfire";
}

export function applyCampfireRarityToItem(item, rarityInput = "normal") {
  if (!isCampfireItem(item)) return item;
  const rarity = getCampfireRarity(rarityInput);
  if (rarity.id === "normal") return item;
  const baseName = campfireBaseName(item.name);
  return {
    ...item,
    uid: item.uid || `${item.id}_${rarity.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    baseId: item.baseId || item.id,
    name: `${rarity.label} ${baseName}`,
    rarity: rarity.id,
    rarityColor: rarity.color,
    effects: scaleCampfireEffects(item.effects || [], rarity),
    price: Math.max(1, Math.round((item.price || 10) * rarity.priceMult)),
  };
}

export function applyCampfireRarityToEvent(event, rarityInput = null) {
  if (!isCampfireEvent(event)) return event;
  const rarity = getCampfireRarity(rarityInput || event?.rarity || "normal");
  const baseTitle = campfireBaseName(event?.baseTitle || event?.title);
  return {
    ...event,
    baseTitle,
    title: rarity.label ? `${rarity.label} ${baseTitle}` : baseTitle,
    rarity: rarity.id,
    rarityColor: rarity.color,
    effects: scaleCampfireEffects(event?.effects || [], rarity),
  };
}
