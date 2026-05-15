import { describe, expect, it } from "vitest";
import { describeEventEffects, isChestRewardEvent } from "./eventPreview.js";

describe("event preview descriptions", () => {
  it("hides chest rewards until the chest is opened", () => {
    const chest = {
      id: "mossy_chest",
      effects: [
        { type: "grant_gold", value: 15 },
        { type: "grant_loot", rolls: 1, lootTable: "forest_chest_equipment" },
      ],
    };

    expect(isChestRewardEvent(chest)).toBe(true);
    expect(describeEventEffects(chest, { revealChestRewards: false })).toEqual([]);
    expect(describeEventEffects(chest, { revealChestRewards: true })).toEqual([
      "Contains 15 gold",
      "Contains 1 loot item(s)",
    ]);
  });

  it("continues to preview non-reward event effects", () => {
    const shrine = {
      id: "restorative_shrine",
      effects: [
        { type: "restore_hp_pct", value: 30 },
        { type: "restore_energy", value: 10 },
      ],
    };

    expect(isChestRewardEvent(shrine)).toBe(false);
    expect(describeEventEffects(shrine, { revealChestRewards: false })).toEqual([
      "Heals 30% of your max HP",
      "Restores 10 energy",
    ]);
  });

  it("hides effects marked as hidden from adventure card previews", () => {
    const hiddenAmbushRoll = {
      id: "silent_nest",
      effects: [
        { type: "unlock_node_chance", chance: 20, targetNodeId: "ambush", hidePreview: true },
        { type: "grant_gold", value: 35 },
      ],
    };

    expect(describeEventEffects(hiddenAmbushRoll)).toEqual([
      "Contains 35 gold",
    ]);
  });
});
