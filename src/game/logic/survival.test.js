import { describe, expect, it } from "vitest";
import { getHungerSummary, getPassiveFatigueRegenFromHunger, getPassiveRegenFromHunger, tickBleeding } from "./survival.js";

describe("passive HP regeneration", () => {
  it("restores more HP when the hero is fed", () => {
    expect(getPassiveRegenFromHunger({ hunger: 75 }, 100)).toBe(4);
    expect(getPassiveRegenFromHunger({ hunger: 50 }, 100)).toBe(2);
    expect(getPassiveRegenFromHunger({ hunger: 49 }, 100)).toBe(0);
  });

  it("tops off HP to max instead of stopping at the old soft cap", () => {
    const result = tickBleeding({ hp: 128, energy: 100, hunger: 100, conditions: {} }, 130);

    expect(result.hero.hp).toBe(130);
    expect(result.notes).toContain("Well-fed recovery: +2 HP.");
  });

  it("recovers fatigue with the same hunger-gated passive rate", () => {
    expect(getPassiveFatigueRegenFromHunger({ hunger: 75 })).toBe(4);

    const result = tickBleeding({ hp: 130, energy: 96, hunger: 100, conditions: {} }, 130);

    expect(result.hero.energy).toBe(100);
    expect(result.notes).toContain("Well-fed fatigue recovery: +4.");
  });

  it("does not recover HP or fatigue while too hungry", () => {
    const result = tickBleeding({ hp: 100, energy: 80, hunger: 49, conditions: {} }, 130);

    expect(result.hero.hp).toBe(100);
    expect(result.hero.energy).toBe(80);
    expect(result.notes).toEqual([]);
  });

  it("shows active crafted food buffs in the hunger summary", () => {
    const summary = getHungerSummary({
      hunger: 80,
      activeBuffs: [
        { name: "Wolf Skewer", stats: { str: 2, dex: 1 }, combatsLeft: 3 },
      ],
    });

    expect(summary.effects).toContain("Wolf Skewer: +2 STR / +1 DEX (3 combats left)");
  });
});
