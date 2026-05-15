import { describe, expect, it } from "vitest";
import { getLevelRewards, initHero, normalizeHeroAttributeAllocations, resetAttributeAllocations, spendAttributePoint, xpToLevel } from "./hero.js";

describe("level progression", () => {
  it("requires 100 XP to reach level 2", () => {
    expect(xpToLevel(99)).toMatchObject({ lvl: 1, xp: 99, needed: 100 });
    expect(xpToLevel(100)).toMatchObject({ lvl: 2, xp: 0 });
  });

  it("grants one stat point and one talent point per character level", () => {
    const rewards = getLevelRewards(0, 100);

    expect(rewards.levelsGained).toBe(1);
    expect(rewards.statPoints).toBe(1);
    expect(rewards.talentPoints).toBe(1);
  });

  it("does not initialize weapon specialization progression", () => {
    const hero = initHero("Tester");

    expect(hero).not.toHaveProperty("weaponSpecializations");
  });

  it("starts new heroes as fighters by default", () => {
    expect(initHero("Tester").heroClass).toBe("fighter");
    expect(initHero("Tester", { heroClass: "fighter" }).heroClass).toBe("fighter");
  });

  it("tracks and refunds spent attribute points without removing level HP", () => {
    const leveled = {
      ...initHero("Tester"),
      xp: 100,
      statPoints: 1,
      baseStats: { ...initHero("Tester").baseStats, maxHp: initHero("Tester").baseStats.maxHp + 5 },
      hp: initHero("Tester").baseStats.maxHp + 5,
    };
    const withStrength = spendAttributePoint(leveled, "str");

    expect(withStrength.statPoints).toBe(0);
    expect(withStrength.attributeAllocations).toEqual({ str: 1 });
    expect(withStrength.baseStats.str).toBe(leveled.baseStats.str + 1);

    const reset = resetAttributeAllocations(withStrength);

    expect(reset.statPoints).toBe(1);
    expect(reset.attributeAllocations).toBeUndefined();
    expect(reset.baseStats.str).toBe(leveled.baseStats.str);
    expect(reset.baseStats.maxHp).toBe(leveled.baseStats.maxHp);
  });

  it("infers old spent attributes so old saves can reset them", () => {
    const base = initHero("Veteran");
    const oldSaveHero = {
      ...base,
      xp: 245,
      statPoints: 0,
      baseStats: {
        ...base.baseStats,
        maxHp: base.baseStats.maxHp + 15,
        dex: base.baseStats.dex + 1,
      },
    };
    const normalized = normalizeHeroAttributeAllocations(oldSaveHero);

    expect(normalized.attributeAllocations).toEqual({ dex: 1, maxHp: 1 });

    const reset = resetAttributeAllocations(normalized);

    expect(reset.statPoints).toBe(2);
    expect(reset.baseStats.dex).toBe(base.baseStats.dex);
    expect(reset.baseStats.maxHp).toBe(base.baseStats.maxHp + 10);
  });
});
