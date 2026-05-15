import { afterEach, describe, expect, it } from "vitest";
import { getEncounterTableEnemyIds, rollEncounterTable, setRuntimeEncounterTables } from "./encounters.js";

describe("encounter tables", () => {
  afterEach(() => {
    setRuntimeEncounterTables(null);
  });

  it("supports entries that resolve to multiple enemies", () => {
    setRuntimeEncounterTables({
      forest_pack_test: {
        name: "Forest Pack Test",
        entries: [
          { enemyIds: ["blood_rat", "crow_swarm"], weight: 100 },
        ],
      },
    });

    const roll = rollEncounterTable("forest_pack_test", () => 0);

    expect(getEncounterTableEnemyIds("forest_pack_test")).toEqual(["blood_rat", "crow_swarm"]);
    expect(roll.enemy.id).toBe("blood_rat");
    expect(roll.enemies.map(enemy => enemy.id)).toEqual(["blood_rat", "crow_swarm"]);
  });

  it("preserves duplicate enemy ids for multi-combat groups", () => {
    setRuntimeEncounterTables({
      crypt_skeleton_pair_test: {
        name: "Crypt Skeleton Pair Test",
        entries: [
          { enemyIds: ["skeleton", "skeleton"], weight: 100 },
        ],
      },
    });

    const roll = rollEncounterTable("crypt_skeleton_pair_test", () => 0);

    expect(getEncounterTableEnemyIds("crypt_skeleton_pair_test")).toEqual(["skeleton"]);
    expect(roll.enemies.map(enemy => enemy.id)).toEqual(["skeleton", "skeleton"]);
  });

  it("uses a rare Crypts floor 1 mixed pair instead of a larger pack", () => {
    const roll = rollEncounterTable("crypts_floor_1_multi", () => 0.99);

    expect(roll.enemies.map(enemy => enemy.id)).toEqual(["skeleton", "zombie"]);
  });

  it("keeps giant spider as the Crypts floor 2 fight with a rare skeleton add", () => {
    const spiderOnly = rollEncounterTable("crypts_deep", () => 0);
    const spiderWithSkeleton = rollEncounterTable("crypts_deep", () => 0.9);

    expect(getEncounterTableEnemyIds("crypts_deep")).toContain("giant_spider");
    expect(spiderOnly.enemies.map(enemy => enemy.id)).toEqual(["giant_spider"]);
    expect(spiderWithSkeleton.enemies.map(enemy => enemy.id)).toEqual(["giant_spider", "skeleton"]);
    expect(spiderWithSkeleton.entry.weight).toBe(1);
  });
});
