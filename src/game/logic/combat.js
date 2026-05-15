import { applyArmor, getHeroRawDamageBase } from "./hero.js";
import { collectEffects, effectsOfType, maxEffect, sumEffect } from "./effectEngine.js";
import { getBossPhase } from "./enemies.js";
import { getEnemy } from "./content.js";

const BASE_ACTION_DELAY_MS = 1500;

function chance(pct, rng) {
  return rng() * 100 < (pct || 0);
}

function isPhaseEffectHpReady(effect, hp, maxHp) {
  const hpPct = maxHp > 0 ? (hp / maxHp) * 100 : 100;
  if (effect.triggerHpPct != null && hpPct > effect.triggerHpPct) return false;
  if (effect.minTriggerHpPct != null && hpPct < effect.minTriggerHpPct) return false;
  return true;
}

const ARMOR_PENETRATION_EFFECT_TYPES = new Set([
  "armor_penetration",
  "armor_penetration_pct",
  "armor_pen",
  "armor_ignore",
]);

function getArmorPenetrationPct(effects = []) {
  const total = effects.reduce((sum, effect) => {
    if (!ARMOR_PENETRATION_EFFECT_TYPES.has(effect.type)) return sum;
    return sum + (effect.value ?? effect.pct ?? effect.percent ?? effect.armorPenPct ?? effect.penetrationPct ?? 0);
  }, 0);
  return Math.max(0, Math.min(100, total));
}

function toLowerList(values = []) {
  return (Array.isArray(values) ? values : [values])
    .filter(Boolean)
    .map(value => String(value).toLowerCase());
}

function effectMatchesTargetClassifier(effect, target) {
  if (!effect || !target) return false;
  const targetFamily = String(target.family || "").toLowerCase();
  const targetTags = new Set(toLowerList(target.tags || []));
  const families = toLowerList(effect.family || effect.families || effect.targetFamily || effect.targetFamilies);
  const tags = toLowerList(effect.tag || effect.tags || effect.targetTag || effect.targetTags);
  return families.includes(targetFamily) || tags.some(tag => targetTags.has(tag));
}

function getDamageVsTargetPct(effects = [], target = null) {
  return effects.reduce((total, effect) => {
    if (effect.type !== "damage_vs_tag" && effect.type !== "damage_vs_family") return total;
    return effectMatchesTargetClassifier(effect, target)
      ? total + (effect.value || effect.damagePct || 0)
      : total;
  }, 0);
}

function makeLog(round, type, text, heroHp, enemyHp, extra = {}) {
  return {
    round,
    type,
    text,
    heroHp: Math.max(0, Math.floor(heroHp)),
    enemyHp: Math.max(0, Math.floor(enemyHp)),
    ...extra,
  };
}

function statusLabel(status) {
  if (status.type === "bleed") return "Bleed";
  if (status.type === "poison") return "Poison";
  if (status.type === "weaken") return "Weakened";
  if (status.type === "blind") return "Blinded";
  if (status.type === "stun") return "Stunned";
  if (status.type === "daze") return "Dazed";
  return status.type;
}

function normalizeStatus(effect, type) {
  const duration = effect.duration || 1;
  if (type === "bleed" || type === "poison") {
    return {
      type,
      duration,
      stacks: duration,
      maxStacks: effect.maxStacks || 6,
      damagePct: effect.damagePct,
    };
  }
  return {
    type,
    duration,
    stacks: effect.stacks || 1,
    maxStacks: effect.maxStacks || (type === "bleed" || type === "poison" ? 3 : 1),
    damagePct: effect.damagePct,
    damageMult: effect.damageMult,
    hitPenalty: effect.hitPenalty,
    missSpellChance: effect.missSpellChance,
  };
}

export function runCombat(hero, stats, enemy, hungerLevel, options = {}) {
  const rng = options.rng || Math.random;
  const heroEffects = collectEffects(hero);
  const enemyEffects = enemy.effects || [];
  const log = [];
  const statuses = { hero: [], enemy: [] };
  const adds = [];
  const summonCounts = {};
  let heroHp = hero.hp;
  let enemyHp = enemy.hp || enemy.stats.maxHp;
  let round = 1;
  let frenzyStacks = 0;
  let currentPhaseId = null;
  let enemyDamageMult = 1;
  let combatTime = 0;
  let heroNextActionAt = 0;
  let enemyNextActionAt = 0;
  let actionGroup = 0;
  let activeActionGroup = null;
  const startBlockEffect = effectsOfType(heroEffects, "combat_start_block_bonus")[0];
  const shieldChainEffect = effectsOfType(heroEffects, "shield_chain_slam")[0];
  const heroArmorPenPct = getArmorPenetrationPct(heroEffects);
  let startBlockTurns = startBlockEffect?.duration || 0;
  let consecutiveBlocks = 0;

  if (startBlockEffect) {
    log.push(makeLog(round, "skill", `Steadfast Guard: +${startBlockEffect.value || 0}% block for ${startBlockTurns} enemy turns.`, heroHp, enemyHp));
  }
  if (shieldChainEffect) {
    log.push(makeLog(round, "skill", `Shield Chain: after ${shieldChainEffect.blocks || 2} consecutive blocks, an automatic shield slam triggers.`, heroHp, enemyHp));
  }

  function statusFlags(target) {
    const flags = {};
    for (const s of statuses[target]) {
      flags[s.type] = { stacks: s.stacks || 1, duration: s.duration || 1 };
    }
    return flags;
  }

  const push = (type, text, extra = {}) => log.push(makeLog(round, type, text, heroHp, enemyHp, {
    heroStatus: { ...statusFlags("hero"), ...(frenzyStacks > 0 ? { frenzy: { stacks: frenzyStacks } } : {}) },
    enemyStatus: statusFlags("enemy"),
    ...(activeActionGroup ? { actionGroup: activeActionGroup, timeMs: combatTime } : {}),
    ...extra,
  }));

  function aliveAdds() {
    return adds.filter(add => add.hp > 0);
  }

  function activeTarget() {
    return aliveAdds()[0] || enemy;
  }

  function targetHp(target) {
    return target === enemy ? enemyHp : target.hp;
  }

  function setTargetHp(target, hp) {
    if (target === enemy) enemyHp = hp;
    else target.hp = hp;
  }

  function addStatus(target, status) {
    const next = { duration: 1, ...status };
    const existing = statuses[target].find(entry => entry.type === next.type);
    if (existing) {
      const maxStacks = next.maxStacks || existing.maxStacks || 1;
      if (next.type === "bleed" || next.type === "poison") {
        const duration = Math.min(maxStacks, (existing.duration || 0) + (next.duration || 1));
        Object.assign(existing, next, { duration, stacks: duration, maxStacks });
      } else {
        Object.assign(existing, next, {
          duration: Math.max(existing.duration, next.duration),
          stacks: Math.min(maxStacks, (existing.stacks || 1) + (next.stacks || 1)),
          maxStacks,
        });
      }
    } else {
      statuses[target].push(next);
    }
    const targetName = target === "hero" ? hero.name : enemy.name;
    const logType = next.type === "bleed" || next.type === "poison" ? next.type : "debuff";
    const active = statuses[target].find(entry => entry.type === next.type) || next;
    const stackText = active.maxStacks > 1 ? ` x${active.stacks}` : "";
    push(logType, `${targetName} sufre ${statusLabel(active)}${stackText} (${active.duration} turnos).`, { statusTarget: target, statusType: next.type, statusApplied: true });
  }

  function hasStatus(target, type) {
    return statuses[target].some(status => status.type === type);
  }

  function applyOnHitEffects(sourceEffects, target) {
    const legacyTypes = [
      ["bleed_on_hit", "bleed"],
      ["poison_on_hit", "poison"],
      ["weaken_on_hit", "weaken"],
      ["blind_on_hit", "blind"],
      ["stun_on_hit", "stun"],
      ["daze_on_hit", "daze"],
    ];

    for (const [effectType, statusType] of legacyTypes) {
      for (const effect of effectsOfType(sourceEffects, effectType)) {
        if (chance(effect.chance, rng)) addStatus(target, normalizeStatus(effect, statusType));
      }
    }

    for (const effect of effectsOfType(sourceEffects, "apply_status_on_hit")) {
      if (chance(effect.chance, rng)) addStatus(target, effect.status || normalizeStatus(effect, effect.statusType));
    }
  }

  function tickStatuses(target, options = {}) {
    const skipTypes = options.skipTypes || [];
    for (const status of [...statuses[target]]) {
      if (status.type === "bleed" || status.type === "poison") {
        const stackText = (status.maxStacks || 1) > 1 ? ` x${status.stacks || 1}` : "";
        push(status.type, `${statusLabel(status)}${stackText} lingers.`, { statusTarget: target });
      }
      if (!skipTypes.includes(status.type)) status.duration -= 1;
      if (status.type === "bleed") status.stacks = Math.max(0, status.duration);
    }
    statuses[target] = statuses[target].filter(status => status.duration > 0);
  }

  function outgoingDamageMult(actor) {
    return statuses[actor].reduce((mult, status) => {
      if (status.type !== "weaken") return mult;
      return mult * (status.damageMult || 0.8);
    }, 1);
  }

  function hitPenalty(actor) {
    return statuses[actor].reduce((penalty, status) => {
      if (status.type !== "blind") return penalty;
      return penalty + (status.hitPenalty || 15);
    }, 0);
  }

  function rawHeroDamage(mult = 1, target = null) {
    const bonus = 1 + sumEffect(heroEffects, "damage_bonus_pct") / 100;
    const targetBonusPct = getDamageVsTargetPct(heroEffects, target);
    const survivalDamageMult = stats.damageMult || 1;
    const baseWithoutTargetBonus = getHeroRawDamageBase(stats) * hungerLevel.dmgMult * survivalDamageMult * bonus * mult;
    const base = baseWithoutTargetBonus * (100 + targetBonusPct) / 100;
    return Math.max(1, Math.floor(base * outgoingDamageMult("hero")) + Math.floor(rng() * 4));
  }

  function actorSpeed(actor) {
    if (actor === "hero") {
      const weapon = hero.equip?.weapon || {};
      const offhand = hero.equip?.offhand || {};
      const weaponSpeed = weapon.attackSpeed || weapon.baseStats?.attackSpeed || 1;
      const offhandSpeed = offhand.attackSpeed || offhand.baseStats?.attackSpeed || 1;
      const effectSpeed = 1 + sumEffect(heroEffects, "attack_speed") / 100;
      return Math.max(0.35, (weaponSpeed + (hero.equip?.offhand ? offhandSpeed * 0.5 : 0)) * effectSpeed * (stats.attackSpeedMult || 1));
    }
    const phase = getBossPhase(enemy, enemyHp / enemy.stats.maxHp);
    const phaseSpeed = phase?.stats?.attackSpeed ?? phase?.attackSpeed ?? 1;
    const enemySpeed = (enemy.stats?.attackSpeed ?? enemy.baseStats?.attackSpeed ?? enemy.attackSpeed ?? 1) * phaseSpeed;
    return Math.max(0.35, enemySpeed);
  }

  function actionDelay(actor) {
    const speed = actorSpeed(actor);
    return Math.round(BASE_ACTION_DELAY_MS / speed);
  }

  function heroAttack(label = "You hit", mult = 1, subtype = "hit") {
    if (hasStatus("hero", "stun")) {
      push("stun", `${hero.name} is stunned and loses the action.`);
      return;
    }

    const target = activeTarget();
    const targetStats = target.stats;
    const targetName = target.name;
    const targetIsBoss = target === enemy;
    const addHpPayload = () => targetIsBoss ? {} : { addHp: Math.max(0, target.hp), addMaxHp: target.stats.maxHp };

    for (const effect of effectsOfType(heroEffects, "devastate")) {
      if (chance(effect.chance, rng)) {
        const damage = applyArmor(Math.round(rawHeroDamage(effect.damageMult || 2.5, target)), targetStats.armor, heroArmorPenPct);
        setTargetHp(target, targetHp(target) - damage);
        push("devastate", `DEVASTATOR against ${targetName}: ${damage} damage.`, { dmg: damage, targetId: target.id, targetRole: targetIsBoss ? "boss" : "add", ...addHpPayload() });
        if (targetIsBoss) applyOnHitEffects(heroEffects, "enemy");
        if (!targetIsBoss && target.hp <= 0) push("add_kill", `${targetName} cae.`, { addHp: 0, addMaxHp: target.stats.maxHp });
        return;
      }
    }

    if (!chance(Math.max(5, stats.hitChance - hitPenalty("hero")), rng)) {
      frenzyStacks = 0;
      push("miss", `${label} and miss.`);
      return;
    }

    const critVsBleed = targetIsBoss && statuses.enemy.some(status => status.type === "bleed") ? sumEffect(heroEffects, "crit_vs_bleeding") : 0;
    const isCrit = chance(stats.critChance + critVsBleed, rng);
    let raw = rawHeroDamage(mult, target);

    const frenzy = maxEffect(heroEffects, "frenzy_stack");
    if (frenzy) raw = Math.round(raw * (1 + frenzyStacks * frenzy / 100));
    frenzyStacks++;

    const critMult = 1 + (stats.critDamage ?? 75) / 100;
    const damage = applyArmor(isCrit ? Math.round(raw * critMult) : raw, targetStats.armor, heroArmorPenPct);
    setTargetHp(target, targetHp(target) - damage);
    const lifesteal = stats.lifesteal / 100;
    if (lifesteal > 0) heroHp = Math.min(stats.maxHp, heroHp + Math.round(damage * lifesteal));
    push(isCrit ? "crit" : subtype, `${label} ${targetName} for ${damage}${isCrit ? " CRITICAL" : ""}.`, { dmg: damage, isCrit, targetId: target.id, targetRole: targetIsBoss ? "boss" : "add", ...addHpPayload() });
    if (targetIsBoss) applyOnHitEffects(heroEffects, "enemy");
    if (!targetIsBoss && target.hp <= 0) push("add_kill", `${targetName} cae.`, { addHp: 0, addMaxHp: target.stats.maxHp });

    for (const effect of effectsOfType(heroEffects, "stagger_on_hit")) {
      if (chance(effect.chance, rng)) {
        enemyDamageMult = effect.enemyDamageMult || 0.9;
        push("stagger", `${targetName} is staggered.`);
      }
    }
  }

  function summonAdd(effect) {
    const maxAdds = effect.maxAdds || 1;
    const maxSummons = effect.maxSummons || 3;
    const summonKey = effect.id || effect.enemyId || "summon";
    if (aliveAdds().length >= maxAdds) return;
    if ((summonCounts[summonKey] || 0) >= maxSummons) return;
    const def = getEnemy(effect.enemyId);
    if (!def?.baseStats) return;
    const add = {
      ...def,
      stats: { ...def.baseStats },
      hp: def.baseStats.maxHp,
      sprite: effect.addSprite || def.sprite,
    };
    summonCounts[summonKey] = (summonCounts[summonKey] || 0) + 1;
    adds.push(add);
    push("summon", `${enemy.name} summons ${add.name} (${summonCounts[summonKey]}/${maxSummons}).`, {
      addId: add.id,
      addFamily: add.family,
      addSprite: add.sprite,
      addHp: add.hp,
      addMaxHp: add.stats.maxHp,
      pauseMs: effect.pauseMs || 1200,
    });
    return true;
  }

  function tickStartBlockTurn() {
    if (startBlockTurns <= 0) return;
    startBlockTurns -= 1;
    if (startBlockTurns === 0) push("skill", "Steadfast Guard ends.");
  }

  function resolveShieldChain() {
    if (!shieldChainEffect || consecutiveBlocks < (shieldChainEffect.blocks || 2) || enemyHp <= 0) return;
    const damage = applyArmor(rawHeroDamage(shieldChainEffect.damageMult || 2.5, enemy), enemy.stats.armor, heroArmorPenPct);
    enemyHp -= damage;
    consecutiveBlocks = 0;
    push("shield_slam", `Shield Chain: you slam ${enemy.name} for ${damage} and stun it.`, {
      dmg: damage,
      targetId: enemy.id,
      targetRole: "boss",
    });
    if (enemyHp > 0) addStatus("enemy", { type: "stun", duration: shieldChainEffect.stunDuration || 1 });
  }

  function enemyAttack(attacker, attackerEffects, attackValue, armorIgnore = 0, label = null) {
    const hitChance = Math.max(5, 90 + sumEffect(attackerEffects, "enemy_hit_chance") - hitPenalty("enemy"));
    if (attacker === enemy && hasStatus("enemy", "stun")) {
      push("stun", `${attacker.name} is stunned and cannot attack.`);
      for (const status of statuses.enemy) {
        if (status.type === "stun") status.duration -= 1;
      }
      statuses.enemy = statuses.enemy.filter(status => status.duration > 0);
      return;
    }
    if (!chance(hitChance, rng)) {
      push("enemyMiss", `${attacker.name} misses the attack.`);
      if (attacker === enemy) consecutiveBlocks = 0;
      return;
    }

    const startBlockBonus = attacker === enemy && startBlockTurns > 0 ? startBlockEffect?.value || 0 : 0;
    const blockChance = sumEffect(heroEffects, "block_chance") + startBlockBonus;
    const blocked = blockChance > 0 && chance(blockChance, rng);

    if (blocked) {
      const blockDamageMult = maxEffect(heroEffects, "block_damage_taken_mult", 0);
      const blockDamage = blockDamageMult ? Math.round(applyArmor(attackValue, stats.armor) * blockDamageMult) : 0;
      heroHp -= blockDamage;
      push("block", `You block ${attacker.name}.${blockDamage ? ` You take ${blockDamage}.` : ""}`, { dmg: blockDamage });
      if (attacker === enemy) {
        consecutiveBlocks += 1;
        resolveShieldChain();
      }

      const healPct = sumEffect(heroEffects, "heal_on_block_pct");
      if (healPct) {
        const heal = Math.round(stats.maxHp * healPct / 100);
        heroHp = Math.min(stats.maxHp, heroHp + heal);
        push("heal", `You recover ${heal} HP.`, { heal });
      }

      const counterOnBlock = sumEffect(heroEffects, "counter_on_block");
      if (chance(counterOnBlock, rng)) heroAttack("Counter", 0.8, "counter");
      return;
    }

    if (attacker === enemy) consecutiveBlocks = 0;
    const damageToHero = applyArmor(attackValue, stats.armor, armorIgnore);
    heroHp -= damageToHero;
    push("enemyHit", `${label || attacker.name} hits for ${damageToHero}.`, { dmg: damageToHero, attackerId: attacker.id });
    applyOnHitEffects(attackerEffects, "hero");

    const counterChance = sumEffect(heroEffects, "counter_chance");
    if (heroHp > 0 && chance(counterChance, rng)) heroAttack("Counter", 0.8, "counter");
  }

  function performHeroAction(currentPhase) {
    heroAttack();
    if (enemyHp <= 0) return;
    if (stats.doubleHit > 0 && chance(stats.doubleHit, rng)) {
      activeActionGroup = ++actionGroup;
      heroAttack("Second hit", 1, "double");
      activeActionGroup = null;
    }
    tickStatuses("enemy", { skipTypes: ["stun"] });
  }

  function performEnemyAction(currentPhase) {
    const phaseEffects = currentPhase?.effects || [];
    const activeEnemyEffects = [...enemyEffects, ...phaseEffects];
    const phaseStats = { ...enemy.stats, ...(currentPhase?.stats || {}) };
    let bossAttack = phaseStats.attack * enemyDamageMult * outgoingDamageMult("enemy");
    enemyDamageMult = 1;
    const attackMult = phaseEffects.find(e => e.type === "attack_mult");
    if (attackMult) bossAttack *= attackMult.value;

    const ignoreArmor = phaseEffects.find(e => e.type === "armor_ignore")?.value || 0;
    for (const effect of effectsOfType(phaseEffects, "summon_add")) {
      if (!isPhaseEffectHpReady(effect, enemyHp, enemy.stats.maxHp)) continue;
      if (chance(effect.chance, rng)) {
        summonAdd(effect);
        break;
      }
    }

    enemyAttack(enemy, activeEnemyEffects, bossAttack, ignoreArmor);
    tickStartBlockTurn();

    if (enemyHp <= 0 || heroHp <= 0) return { consumed: true };

    for (const add of aliveAdds()) {
      const addAttack = add.stats.attack * outgoingDamageMult("enemy");
      enemyAttack(add, add.effects || [], addAttack, 0);
      if (heroHp <= 0 || enemyHp <= 0) break;
    }

    tickStatuses("hero");
    if (heroHp <= 0) return { consumed: true };

    const reflect = sumEffect(heroEffects, "reflect_damage");
    if (reflect > 0) {
      enemyHp -= reflect;
      push("reflect", `Thorns return ${reflect} damage.`, { dmg: reflect });
    }

    const bossLifesteal = phaseEffects.find(e => e.type === "lifesteal")?.value || 0;
    if (bossLifesteal > 0) {
      const heal = Math.round(phaseStats.attack * bossLifesteal / 100);
      enemyHp = Math.min(enemy.stats.maxHp, enemyHp + heal);
      push("lifesteal", `${enemy.name} steals ${heal} life.`, { heal });
    }

    if (phaseEffects.some(e => e.type === "double_attack" && chance(e.chance, rng))) {
      const damageToHero = applyArmor(phaseStats.attack, stats.armor, ignoreArmor);
      heroHp -= damageToHero;
      push("enemyHit", `${enemy.name} strikes again for ${damageToHero}.`, { dmg: damageToHero });
      applyOnHitEffects(activeEnemyEffects, "hero");
    }
    return { consumed: true };
  }

  while (heroHp > 0 && enemyHp > 0 && round <= 200) {
    const hpPct = enemyHp / enemy.stats.maxHp;
    const phase = getBossPhase(enemy, hpPct);
    if (phase && phase.id !== currentPhaseId) {
      currentPhaseId = phase.id;
      push("phase_change", `${enemy.name}: ${phase.label}.`, { phase: phase.id });
    }

    const nextActor = heroNextActionAt <= enemyNextActionAt ? "hero" : "enemy";
    combatTime = Math.min(heroNextActionAt, enemyNextActionAt);
    round = Math.max(1, Math.ceil(combatTime / 1000));

    if (heroNextActionAt === enemyNextActionAt) {
      const simultaneousPhase = phase;
      activeActionGroup = ++actionGroup;
      performHeroAction(simultaneousPhase);
      const heroActionDelay = actionDelay("hero");
      performEnemyAction(simultaneousPhase);
      activeActionGroup = null;
      heroNextActionAt = combatTime + heroActionDelay;
      enemyNextActionAt = combatTime + actionDelay("enemy");
    } else if (nextActor === "hero") {
      activeActionGroup = ++actionGroup;
      performHeroAction(phase);
      activeActionGroup = null;
      heroNextActionAt = combatTime + actionDelay("hero");
    } else {
      activeActionGroup = ++actionGroup;
      performEnemyAction(phase);
      activeActionGroup = null;
      enemyNextActionAt = combatTime + actionDelay("enemy");
    }

  }

  if (enemyHp <= 0) push("kill", `${enemy.name} has died.`);
  if (heroHp <= 0) push("death", `${hero.name} has fallen.`);

  return {
    won: heroHp > 0 && enemyHp <= 0,
    log,
    hpLeft: Math.max(0, Math.floor(heroHp)),
    rounds: Math.min(round, 200),
    heroConditions: {
      bleeding: statuses.hero.find(status => status.type === "bleed") || null,
      poison: statuses.hero.find(status => status.type === "poison") || null,
    },
  };
}
