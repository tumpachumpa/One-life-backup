import { describe, expect, it } from "vitest";
import {
  applyCampfireRarityToEvent,
  applyCampfireRarityToItem,
  getCampfireHealingPct,
} from "./campfires.js";
import { createLootItem } from "./loot.js";

describe("campfire rarity", () => {
  it("scales campfire item healing with rarity", () => {
    const campfire = {
      id: "campfire",
      name: "Campfire",
      family: "camp_supply",
      type: "consumable",
      price: 60,
      effects: [{ type: "restore_hp_pct", value: 40 }, { type: "restore_energy", value: 25 }],
    };

    const rare = applyCampfireRarityToItem(campfire, "rare");
    const epic = applyCampfireRarityToItem(campfire, "epic");

    expect(rare.name).toBe("Rare Campfire");
    expect(rare.effects.find(effect => effect.type === "restore_hp_pct")).toMatchObject({
      baseValue: 40,
      value: getCampfireHealingPct(40, "rare"),
    });
    expect(epic.name).toBe("Epic Campfire");
    expect(epic.effects.find(effect => effect.type === "restore_hp_pct").value)
      .toBeGreaterThan(rare.effects.find(effect => effect.type === "restore_hp_pct").value);
  });

  it("caps higher item rarity rolls to epic campfires", () => {
    const campfire = {
      id: "campfire",
      name: "Campfire",
      family: "camp_supply",
      type: "consumable",
      effects: [{ type: "restore_hp_pct", value: 40 }],
    };

    const rolled = createLootItem(campfire, "normal", () => 0.999);

    expect(rolled.name).toBe("Epic Campfire");
    expect(rolled.rarity).toBe("epic");
    expect(rolled.effects.find(effect => effect.type === "restore_hp_pct").value)
      .toBe(getCampfireHealingPct(40, "epic"));
  });

  it("lets dropped campfires roll item rarity", () => {
    const campfire = {
      id: "campfire",
      name: "Campfire",
      family: "camp_supply",
      type: "consumable",
      effects: [{ type: "restore_hp_pct", value: 40 }],
    };

    const rolled = createLootItem(campfire, "normal", () => 0.8);

    expect(rolled.rarity).toBe("uncommon");
    expect(rolled.effects.find(effect => effect.type === "restore_hp_pct").value)
      .toBe(getCampfireHealingPct(40, "uncommon"));
  });

  it("lets dropped campfires roll rare item rarity", () => {
    const campfire = {
      id: "campfire",
      name: "Campfire",
      family: "camp_supply",
      type: "consumable",
      effects: [{ type: "restore_hp_pct", value: 40 }],
    };

    const rolled = createLootItem(campfire, "normal", () => 0.85);

    expect(rolled.rarity).toBe("rare");
    expect(rolled.effects.find(effect => effect.type === "restore_hp_pct").value)
      .toBe(getCampfireHealingPct(40, "rare"));
  });

  it("scales campfire event healing without double scaling", () => {
    const event = {
      id: "test_campfire",
      title: "Campfire",
      effects: [{ type: "restore_hp_pct", value: 30 }, { type: "restore_energy", value: 20 }],
    };

    const epic = applyCampfireRarityToEvent(event, "epic");
    const reapplied = applyCampfireRarityToEvent(epic, "epic");

    expect(epic.title).toBe("Epic Campfire");
    expect(epic.effects.find(effect => effect.type === "restore_hp_pct")).toMatchObject({
      baseValue: 30,
      value: getCampfireHealingPct(30, "epic"),
    });
    expect(reapplied.effects.find(effect => effect.type === "restore_hp_pct").value)
      .toBe(epic.effects.find(effect => effect.type === "restore_hp_pct").value);
  });
});
