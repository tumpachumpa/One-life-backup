import { describe, expect, it } from "vitest";
import {
  isAdventureRunLootRef,
  markAdventureRunDrops,
  stripAdventureRunLootFromHero,
  stripAdventureRunLootFromList,
} from "./adventureRunLoot.js";

describe("adventure run loot", () => {
  it("preserves equipped run loot on death while removing run loot from inventory and pending loot", () => {
    const runId = "rootspire-run";
    const [equippedSword, bagDrop, pendingDrop] = markAdventureRunDrops([
      { id: "oathbound_longsword", name: "Relic Oathbound Longsword", type: "gear" },
      { id: "emberglass_ring", name: "Emberglass Ring", type: "gear" },
      { id: "cinderward_amulet", name: "Cinderward Amulet", type: "gear" },
    ], runId);
    const hero = {
      equip: {
        weapon: equippedSword,
        ring: "ring_of_thorns",
      },
      inventory: [
        { itemId: bagDrop, x: 0, y: 0, qty: 1 },
        { itemId: "ration", x: 1, y: 0, qty: 1 },
      ],
    };

    const strippedHero = stripAdventureRunLootFromHero(hero, runId);
    const strippedPending = stripAdventureRunLootFromList([pendingDrop, "campfire"], runId);

    expect(isAdventureRunLootRef(equippedSword, runId)).toBe(true);
    expect(strippedHero.equip.weapon).toBe(equippedSword);
    expect(strippedHero.equip.ring).toBe("ring_of_thorns");
    expect(strippedHero.inventory).toEqual([{ itemId: "ration", x: 1, y: 0, qty: 1 }]);
    expect(strippedPending).toEqual(["campfire"]);
  });
});
