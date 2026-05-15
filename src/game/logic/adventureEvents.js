function defaultChanceRng() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] / 0x100000000;
  }
  return Math.random();
}

export function rollPercentChance(chanceValue, rng = defaultChanceRng) {
  const chance = chanceValue == null ? 100 : Math.max(0, Math.min(100, chanceValue));
  if (chance <= 0) return { success: false, chance, roll: 100 };
  if (chance >= 100) return { success: true, chance, roll: 1 };
  const roll = Math.floor(Math.max(0, Math.min(0.999999999, rng())) * 100) + 1;
  return { success: roll <= chance, chance, roll };
}

export function resolveUnlockNodeChance(effect = {}, rng = defaultChanceRng) {
  const result = rollPercentChance(effect.chance == null ? 100 : effect.chance, rng);
  const success = result.success;
  const notes = [];
  const unlockNodeIds = [];
  let selectedNodeId = null;

  if (success && effect.targetNodeId) {
    unlockNodeIds.push(effect.targetNodeId);
    if (effect.selectOnSuccess) selectedNodeId = effect.targetNodeId;
    if (effect.successText) notes.push(effect.successText);
  } else if (!success && effect.failureText) {
    notes.push(effect.failureText);
  }

  return {
    success,
    chance: result.chance,
    roll: result.roll,
    notes,
    unlockNodeIds,
    selectedNodeId,
  };
}
