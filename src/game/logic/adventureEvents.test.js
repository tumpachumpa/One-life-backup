import { describe, expect, it } from "vitest";
import { resolveUnlockNodeChance, rollPercentChance } from "./adventureEvents.js";

describe("adventure event effects", () => {
  const whelpAmbushEffect = {
    type: "unlock_node_chance",
    chance: 20,
    targetNodeId: "rootspire_whelp_ambush_3",
    selectOnSuccess: true,
    successText: "The noise carries upward. Three whelps drop into the chamber.",
    failureText: "The nest stirs, then falls quiet.",
  };

  it("rolls 20% chance as rolls 1 through 20 only", () => {
    expect(rollPercentChance(20, () => 0).success).toBe(true);
    expect(rollPercentChance(20, () => 0.19)).toMatchObject({ success: true, roll: 20 });
    expect(rollPercentChance(20, () => 0.2)).toMatchObject({ success: false, roll: 21 });
    expect(rollPercentChance(20, () => 0.99).success).toBe(false);
  });

  it("unlocks and selects the 3-whelp ambush inside the 20% chance window", () => {
    const result = resolveUnlockNodeChance(whelpAmbushEffect, () => 0.19);

    expect(result.success).toBe(true);
    expect(result.roll).toBe(20);
    expect(result.unlockNodeIds).toEqual(["rootspire_whelp_ambush_3"]);
    expect(result.selectedNodeId).toBe("rootspire_whelp_ambush_3");
    expect(result.notes).toEqual(["The noise carries upward. Three whelps drop into the chamber."]);
  });

  it("does not trigger the 3-whelp ambush outside the 20% chance window", () => {
    const result = resolveUnlockNodeChance(whelpAmbushEffect, () => 0.2);

    expect(result.success).toBe(false);
    expect(result.roll).toBe(21);
    expect(result.unlockNodeIds).toEqual([]);
    expect(result.selectedNodeId).toBeNull();
    expect(result.notes).toEqual(["The nest stirs, then falls quiet."]);
  });
});
