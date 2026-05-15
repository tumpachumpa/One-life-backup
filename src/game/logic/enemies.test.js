import { describe, expect, it } from "vitest";
import { bossById, enemyById } from "./content.js";
import { isBleedImmune, isPoisonImmune } from "./combat/combatant.js";
import {
  ADVENTURE_HP_MULT_PER_DEPTH,
  applyEnemyRarity,
  ENEMY_RARITIES,
  getEnemyRarityWeights,
  MONSTER_ARMOR_MULTIPLIER,
  MONSTER_DAMAGE_MULTIPLIER,
  scaleCombatant,
} from "./enemies.js";

describe("enemy scaling", () => {
  it("keeps Crypts tier 2 mobs tuned up for the dungeon", () => {
    expect(enemyById.skeleton.baseStats).toMatchObject({ maxHp: 81, attack: 12 });
    expect(enemyById.skeleton_warrior.baseStats).toMatchObject({ maxHp: 98, attack: 14 });
    expect(enemyById.ghoul.baseStats).toMatchObject({ maxHp: 98, attack: 14 });
    expect(enemyById.wraith.baseStats).toMatchObject({ maxHp: 90, attack: 13 });
    expect(enemyById.wraith.sprite).toBe("/assets/sprites/encounters/Wraith.png");
    expect(enemyById.wraith.abilities.find(ability => ability.id === "shadow_bolt")).toMatchObject({ damage: 31 });
    expect(enemyById.zombie.baseStats).toMatchObject({ maxHp: 81, attack: 12 });
    expect(enemyById.hellhound.baseStats).toMatchObject({ maxHp: 115, attack: 16 });
  });

  it("treats undead enemies as bleed and poison immune", () => {
    const undeadIds = [
      "skeleton",
      "skeleton_warrior",
      "ghoul",
      "wraith",
      "zombie",
      "rootspire_restless_skeleton",
    ];

    undeadIds.forEach(id => {
      expect(enemyById[id].tags).toContain("undead");
      expect(isBleedImmune(enemyById[id])).toBe(true);
      expect(isPoisonImmune(enemyById[id])).toBe(true);
    });

    expect(bossById.lich.tags).toContain("undead");
    expect(isBleedImmune(bossById.lich)).toBe(true);
    expect(isPoisonImmune(bossById.lich)).toBe(true);
  });

  it("uses Orc War Camp custom sprites and keeps Warg Rider as a blank encounter", () => {
    expect(enemyById.warg.sprite).toBe("/assets/sprites/encounters/Warg.png");
    expect(enemyById.cave_troll.sprite).toBe("/assets/sprites/encounters/Cave troll.png");
    expect(enemyById.warg_rider).toMatchObject({
      name: "Warg Rider",
      sprite: "/assets/sprites/encounters/warg_rider.png",
      baseStats: { maxHp: 1, attack: 0, armor: 0 },
      effects: [],
      abilities: [],
    });
  });

  it("keeps Cinder Salamander as a bulky low-armor fire beast", () => {
    expect(enemyById.cinder_salamander.baseStats).toMatchObject({
      maxHp: 150,
      attack: 16,
      armor: 5,
    });
    expect(enemyById.cinder_salamander.effects).toContainEqual(expect.objectContaining({
      type: "burn_on_hit",
      chance: 20,
    }));
  });

  it("adds a Rootspire-only skeleton pack variant with Bonebound Reassembly", () => {
    expect(enemyById.rootspire_restless_skeleton).toMatchObject({
      name: "Restless Skeleton",
      family: "skeleton",
      tier: 4,
      threat: "minor",
      sprite: "/assets/sprites/encounters/Restless skeleton.png",
      baseStats: {
        maxHp: 58,
        attack: 13,
        armor: 4,
      },
      lootTable: "rootspire_basic",
    });
    expect(enemyById.rootspire_restless_skeleton.effects).toContainEqual(expect.objectContaining({
      type: "revive_if_group_alive",
      name: "Bonebound Reassembly",
      group: "rootspire_restless_skeleton",
      delayTicks: 10,
      reviveHpPct: 45,
    }));
  });

  it("uses the custom Rootspire encounter sprites", () => {
    expect(enemyById.gargoyle.sprite).toBe("/assets/sprites/encounters/Gargoyle.png");
    expect(enemyById.gargoyle.tags).toEqual(expect.arrayContaining(["bleed_immune", "poison_immune"]));
    expect(enemyById.fierce_hound.sprite).toBe("/assets/sprites/encounters/Hound.png");
    expect(enemyById.black_knight.sprite).toBe("/assets/sprites/encounters/Black knight.png");
    expect(enemyById.black_knight.tags).toEqual(expect.arrayContaining(["bleed_immune", "poison_immune"]));
    expect(enemyById.oathbound_squire.sprite).toBe("/assets/sprites/encounters/Oath squire.png");
    expect(enemyById.animated_armor.sprite).toBe("/assets/sprites/encounters/Animated armor.png");
    expect(enemyById.ashbound_cultist.sprite).toBe("/assets/sprites/encounters/Cultist.png");
    expect(enemyById.spellbound_sentinel.sprite).toBe("/assets/sprites/encounters/Spellbound sentinel.png");
    expect(enemyById.ash_imp.sprite).toBe("/assets/sprites/encounters/Imp.png");
    expect(enemyById.ash_imp.baseStats.maxHp).toBe(113);
    expect(enemyById.stone_golem.tags).toEqual(expect.arrayContaining(["bleed_immune", "poison_immune"]));
    expect(enemyById.cinder_salamander.sprite).toBe("/assets/sprites/encounters/Salamander.png");
    expect(enemyById.wyvern_whelp.sprite).toBe("/assets/sprites/encounters/Wyvern whelp.png");
    expect(enemyById.abyssal_fiend.sprite).toBe("/assets/sprites/encounters/Riftbound Warden.png");
    expect(enemyById.arcane_wraith.tags).toEqual(expect.arrayContaining(["spirit", "undead"]));
    expect(enemyById.black_banner.sprite).toBe("/assets/sprites/encounters/Banner_blackknight.png");
    expect(enemyById.black_banner.tags).toEqual(expect.arrayContaining(["bleed_immune", "poison_immune"]));
    expect(enemyById.fallen_knight_oath_pillar.sprite).toBe("/assets/sprites/encounters/Bosses/Fallen knight pillar.png");
    expect(enemyById.fallen_knight_oath_pillar.stateCycle.states.map(state => state.id)).toEqual(["blue", "purple"]);
    expect(enemyById.fallen_knight_oath_pillar.stateCycle.hitReactions.purple).toMatchObject({
      type: "shadow_backlash",
      damage: 20,
      element: "shadow",
      dot: {
        type: "shadow_burn",
        damageFlat: 20,
        durationTicks: 3,
        maxStacks: 3,
        element: "shadow",
      },
    });
    expect(enemyById.fallen_knight_test_oath_pillar.stateCycle.hitReactions.purple).toMatchObject({
      type: "shadow_backlash",
      damage: 1,
      element: "shadow",
      dot: {
        type: "shadow_burn",
        damageFlat: 1,
        durationTicks: 3,
        maxStacks: 3,
        element: "shadow",
      },
    });
    expect(enemyById.black_knight.abilities?.find(ability => ability.id === "black_knight_black_banner")?.addSprite).toBe("/assets/sprites/encounters/Banner_blackknight.png");
  });

  it("keeps the Wyvern Whelp tuned as a sturdier tower encounter", () => {
    expect(enemyById.wyvern_whelp.baseStats.maxHp).toBe(136);
  });

  it("adds Wyvern Breath as an interruptible boss channel", () => {
    const breath = bossById.wyvern.abilities?.find(ability => ability.id === "wyvern_breath");
    const tailSwing = bossById.wyvern.abilities?.find(ability => ability.id === "wyvern_tail_swing");

    expect(bossById.wyvern.baseStats.maxHp).toBe(510);
    expect(bossById.wyvern.baseStats.armor).toBe(56);
    expect(breath).toMatchObject({
      type: "channeled_spell",
      castTicks: 3,
      durationTicks: 3,
      cooldownSeconds: 9,
      aiUseChance: 20,
      channeledDamage: true,
      damage: 20,
      element: "fire",
    });
    expect(tailSwing).toMatchObject({
      type: "empowered_attack",
      castTicks: 2,
      cooldownSeconds: 10,
      damageMult: 1.5,
      stunDurationTicks: 2,
      unlocksAfterDodgePhaseId: "wyvern_dodge_tail_1",
    });
    expect(bossById.wyvern.phases.map(phase => phase.stats.armor)).toEqual([56, 50, 42, 30]);
  });

  it("upgrades Fallen Knight into a non-dodge high-end boss with Last Oath", () => {
    const fallenKnight = bossById.fallen_knight;
    const trainingKnight = bossById.fallen_knight_mechanics_dummy;
    const judgment = fallenKnight.phases.find(phase => phase.id === "called_to_judgment");
    const spectral = fallenKnight.phases.find(phase => phase.id === "spectral_intercession");
    const lastOath = fallenKnight.phases.find(phase => phase.id === "last_oath");

    expect(fallenKnight.sprite).toBe("/assets/sprites/encounters/Bosses/Fallen Knight.png");
    expect(fallenKnight.tags).toEqual(expect.arrayContaining(["undead", "oathbound", "bleed_immune", "poison_immune"]));
    expect(fallenKnight.dodgePhaseConfig).toEqual([]);
    expect(fallenKnight.abilities.map(ability => ability.id)).toEqual(expect.arrayContaining([
      "fallen_knight_graveguard_riposte",
      "fallen_knight_lance_of_contrition",
      "fallen_knight_oathguard",
      "fallen_knight_kneel_to_the_oath",
      "fallen_knight_executioners_thrust",
    ]));
    expect(judgment.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "pillar_intermission",
        enemyId: "fallen_knight_oath_pillar",
        count: 4,
        alternateStarts: true,
      }),
    ]));
    expect(spectral.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "boss_shield", id: "fallen_knight_spectral_aegis" }),
      expect.objectContaining({ type: "casted_spell", id: "fallen_knight_spectral_lance", element: "shadow" }),
    ]));
    expect(spectral.thresholdPct).toBe(50);
    expect(lastOath).toMatchObject({
      label: "Last Oath",
      thresholdPct: 20,
      stats: { attack: 58, armor: 8, attackSpeed: 1.18 },
    });
    expect(lastOath.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "attack_mult", value: 1.18 }),
      expect.objectContaining({ type: "crit_chance", value: 15 }),
      expect.objectContaining({ type: "double_attack", chance: 10 }),
    ]));
    expect(trainingKnight.rewards).toEqual({ xp: 0, gold: 0 });
    expect(trainingKnight.lootTable).toBeNull();
    expect(trainingKnight.baseStats.attack).toBe(1);
    expect(trainingKnight.phases.find(phase => phase.id === "called_to_judgment").effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "pillar_intermission",
        enemyId: "fallen_knight_test_oath_pillar",
        count: 4,
      }),
    ]));
    expect(trainingKnight.phases.find(phase => phase.id === "spectral_intercession").effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "casted_spell", damage: 1 }),
    ]));
    expect(trainingKnight.phases.find(phase => phase.id === "spectral_intercession").thresholdPct).toBe(50);
    expect(trainingKnight.phases.find(phase => phase.id === "last_oath")).toMatchObject({ thresholdPct: 20 });
  });

  it("adds only a small HP multiplier from adventure depth", () => {
    const zone = {
      scaling: {
        hpMultPerRoom: 9,
        attackMultPerRoom: 9,
        armorMultPerRoom: 9,
      },
    };

    const shallow = scaleCombatant(enemyById.wolf, 0, zone, false);
    const deep = scaleCombatant(enemyById.wolf, 8, zone, false);

    expect(deep.stats.maxHp).toBe(Math.round(shallow.stats.maxHp * (1 + 8 * ADVENTURE_HP_MULT_PER_DEPTH)));
    expect(deep.stats.attack).toBe(shallow.stats.attack);
    expect(deep.stats.armor).toBe(shallow.stats.armor);
    expect(deep.hp).toBe(deep.stats.maxHp);
    expect(deep.stats.maxHp).toBe(84);
  });

  it("does not apply adventure depth HP scaling to bosses", () => {
    const shallow = scaleCombatant(bossById.elder_stag, 0, {}, false);
    const deep = scaleCombatant(bossById.elder_stag, 8, {}, false);

    expect(deep.stats.maxHp).toBe(shallow.stats.maxHp);
    expect(deep.stats.attack).toBe(shallow.stats.attack);
    expect(deep.stats.armor).toBe(shallow.stats.armor);
    expect(deep.hp).toBe(shallow.hp);
  });

  it("makes monster attack and armor about 15% weaker without lowering HP", () => {
    const monster = {
      id: "balance_dummy",
      name: "Balance Dummy",
      threat: "standard",
      baseStats: { maxHp: 100, attack: 20, armor: 10 },
      rewards: { xp: 0, gold: 0 },
    };

    const scaled = scaleCombatant(monster, 0, {}, false);
    const threatMult = 1.25;

    expect(scaled.stats.maxHp).toBe(Math.round(monster.baseStats.maxHp * threatMult));
    expect(scaled.stats.attack).toBe(Math.round(monster.baseStats.attack * threatMult * MONSTER_DAMAGE_MULTIPLIER));
    expect(scaled.stats.armor).toBe(Math.round(monster.baseStats.armor * threatMult * MONSTER_ARMOR_MULTIPLIER));
  });

  it("scales adventure difficulty stars into enemy stats and rewards", () => {
    const monster = {
      id: "difficulty_dummy",
      name: "Difficulty Dummy",
      threat: "standard",
      baseStats: { maxHp: 100, attack: 20, armor: 10 },
      rewards: { xp: 10, gold: 5 },
    };

    const normal = scaleCombatant(monster, 0, {}, false, { difficultyStars: 0 });
    const difficult = scaleCombatant(monster, 0, {}, false, { difficultyStars: 3 });

    expect(difficult.stats.maxHp).toBe(Math.round(normal.stats.maxHp * 1.3));
    expect(difficult.stats.attack).toBe(Math.round(monster.baseStats.attack * 1.25 * 1.3 * MONSTER_DAMAGE_MULTIPLIER));
    expect(difficult.rewards.xp).toBe(Math.round(monster.rewards.xp * 1.25 * 1.3));
  });

  it("shifts higher difficulty rarity weights away from normal encounters", () => {
    const normalWeights = getEnemyRarityWeights(0);
    const hardWeights = getEnemyRarityWeights(4);

    expect(hardWeights.normal).toBeLessThan(normalWeights.normal);
    expect(hardWeights.raro).toBeGreaterThan(normalWeights.raro);
    expect(hardWeights.epico).toBeGreaterThan(normalWeights.epico);
    expect(hardWeights.legendario).toBeGreaterThan(normalWeights.legendario);
  });

  it("applies rarity after the weaker monster combat stats", () => {
    const monster = {
      id: "rare_balance_dummy",
      name: "Rare Balance Dummy",
      threat: "standard",
      baseStats: { maxHp: 100, attack: 20, armor: 10 },
      rewards: { xp: 4, gold: 2 },
    };

    const scaled = scaleCombatant(monster, 0, {}, false);
    const rare = applyEnemyRarity(scaled, { id: "raro", ...ENEMY_RARITIES.raro });

    expect(rare.stats.attack).toBe(Math.round(scaled.stats.attack * ENEMY_RARITIES.raro.attack));
    expect(rare.stats.armor).toBe(Math.round(scaled.stats.armor * ENEMY_RARITIES.raro.armor));
    expect(rare.stats.maxHp).toBe(Math.round(scaled.stats.maxHp * ENEMY_RARITIES.raro.hp));
  });
});
