export function isChestRewardEvent(event = {}) {
  return event.id?.includes("chest")
    || event.id?.includes("cache")
    || event.effects?.some(effect => effect.type === "grant_loot");
}

function isChestRewardPreviewEffect(event, effect) {
  return isChestRewardEvent(event) && (effect.type === "grant_gold" || effect.type === "grant_loot");
}

export function describeEventEffects(event = {}, { revealChestRewards = true, compact = false } = {}) {
  const lines = [];
  for (const effect of event.effects || []) {
    if (effect.hidePreview) continue;
    if (!revealChestRewards && isChestRewardPreviewEffect(event, effect)) continue;
    if (effect.type === "restore_hp_pct") lines.push(compact ? `Heals ${effect.value}% HP` : `Heals ${effect.value}% of your max HP`);
    if (effect.type === "restore_hunger") lines.push(`Restores ${effect.value} hunger`);
    if (effect.type === "restore_energy") lines.push(`Restores ${effect.value} energy`);
    if (effect.type === "grant_gold") lines.push(compact ? `${effect.value} gold` : `Contains ${effect.value} gold`);
    if (effect.type === "grant_loot") lines.push(compact ? `${effect.rolls || 1} loot roll` : `Contains ${effect.rolls || 1} loot item(s)`);
    if (effect.type === "dex_save_damage") lines.push(`Dexterity save to avoid ${effect.damage} damage`);
    if (effect.type === "unlock_node_chance") lines.push(`${effect.chance == null ? 100 : effect.chance}% chance to trigger an encounter`);
    if (effect.type === "enter_adventure") lines.push(`Leads to ${effect.label || effect.adventureId}`);
    if (effect.type === "leave_adventure") lines.push("Returns to the world map");
  }
  return lines;
}
