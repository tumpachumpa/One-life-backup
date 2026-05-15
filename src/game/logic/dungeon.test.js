import { describe, expect, it } from "vitest";
import {
  createDungeonProgress,
  createDungeonEncounter,
  enterDungeon,
  getDungeonMap,
  hasEnteredDungeon,
  isDungeonNodeSelectable,
  normalizeDungeonProgress,
  selectDungeonNode,
} from "./dungeon.js";
import { enemyById } from "./content.js";
import { CAMPFIRE_RARITIES } from "./campfires.js";

describe("dungeon discovery", () => {
  it("starts hidden until the player enters the dungeon", () => {
    const progress = createDungeonProgress("dungeon", () => 0.42);
    const map = getDungeonMap(progress);

    expect(hasEnteredDungeon(progress)).toBe(false);
    expect(map.entryNodes.length).toBeGreaterThanOrEqual(2);
    expect(map.entryNodes.length).toBeLessThanOrEqual(4);
    expect(progress.unlockedNodes).toEqual([]);
  });

  it("reveals starting nodes on enter, then only the next segment after selecting a node", () => {
    let progress = createDungeonProgress("dungeon", () => 0.42);
    const map = getDungeonMap(progress);
    const firstNode = map.entryNodes[0];
    const secondNode = map.nodes.find(node => node.id === firstNode.next[0]);
    const thirdNode = map.nodes.find(node => node.id === secondNode.next[0]);

    progress = enterDungeon(progress);

    expect(hasEnteredDungeon(progress)).toBe(true);
    expect(progress.unlockedNodes).toContain(firstNode.id);
    expect(progress.unlockedNodes).not.toContain(secondNode.id);
    expect(progress.unlockedNodes).not.toContain(thirdNode.id);

    progress = selectDungeonNode(progress, firstNode.id);

    expect(progress.selectedNodeId).toBe(firstNode.id);
    expect(progress.unlockedNodes).toContain(firstNode.id);
    expect(progress.unlockedNodes).toContain(secondNode.id);
    expect(progress.unlockedNodes).not.toContain(thirdNode.id);
    expect(isDungeonNodeSelectable(progress, secondNode.id)).toBe(false);
  });

  it("caps repeated normal mob combat nodes in the generated map", () => {
    const progress = createDungeonProgress("dungeon", () => 0.42);
    const map = getDungeonMap(progress);
    const counts = map.nodes
      .filter(node => node.type === "combat" && node.enemyId)
      .reduce((totals, node) => ({ ...totals, [node.enemyId]: (totals[node.enemyId] || 0) + 1 }), {});

    for (const [enemyId, count] of Object.entries(counts)) {
      const enemy = enemyById[enemyId];
      const limit = enemy?.threat === "special" ? 2 : 4;
      expect(count).toBeLessThanOrEqual(limit);
    }
  });

  it("honors configured random event outcomes", () => {
    const adventure = { zoneId: "dungeon" };
    const dungeonState = { level: 1 };

    const chest = createDungeonEncounter(
      adventure,
      { id: "fixed_chest", type: "random_event", randomEventType: "chest", x: 50, y: 50, scaleIndex: 1 },
      dungeonState,
    );
    const shrine = createDungeonEncounter(
      adventure,
      { id: "fixed_shrine", type: "random_event", randomEventType: "shrine", x: 50, y: 50, scaleIndex: 1 },
      dungeonState,
    );
    const campfire = createDungeonEncounter(
      adventure,
      { id: "fixed_campfire", type: "random_event", randomEventType: "campfire", x: 50, y: 50, scaleIndex: 1 },
      dungeonState,
    );
    const combat = createDungeonEncounter(
      adventure,
      { id: "fixed_combat", type: "random_event", randomEventType: "combat", x: 50, y: 50, scaleIndex: 1 },
      dungeonState,
      () => 0.1,
    );

    expect(chest.type).toBe("event");
    expect(chest.event.title).toBe("Chest");
    expect(shrine.type).toBe("event");
    expect(shrine.event.title).toBe("Restorative Shrine");
    const campfireHeal = campfire.event.effects.find(effect => effect.type === "restore_hp_pct");
    expect(campfire.event.rarity).toBeTruthy();
    expect(campfireHeal.baseValue).toBe(40);
    expect(campfireHeal.value).toBeGreaterThanOrEqual(40);
    expect(campfireHeal.value).toBeLessThanOrEqual(100);
    expect(campfire.event.rarityColor).toBe(CAMPFIRE_RARITIES[campfire.event.rarity].color);
    expect(combat.type).toBe("combat");
    expect(combat.enemy).toBeTruthy();
  });

  it("rolls rarity independently for enemies in the same dungeon encounter", () => {
    const rolls = [0.1, 0.91, 0.1];
    const combat = createDungeonEncounter(
      { zoneId: "dungeon" },
      { id: "dungeon_pack_rarity", type: "combat", enemyIds: ["blood_rat", "crow_swarm"], x: 50, y: 50, scaleIndex: 1 },
      { level: 1 },
      () => rolls.shift() ?? 0.1,
    );

    expect(combat.enemies.map(enemy => enemy.rarity.id)).toEqual(["raro", "normal"]);
  });

  it("uses the Lich as the dungeon boss fallback", () => {
    const boss = createDungeonEncounter(
      { zoneId: "dungeon" },
      { id: "crypt_boss", type: "boss", x: 50, y: 50, scaleIndex: 21 },
      { level: 1 },
      () => 0.1,
    );

    expect(boss.type).toBe("boss");
    expect(boss.enemy).toMatchObject({
      id: "lich",
      name: "Lich",
      sprite: "/assets/sprites/encounters/Bosses/Lich_boss.png",
    });
  });

  it("generates and repairs dungeon maps with Lich boss nodes", () => {
    const progress = createDungeonProgress("dungeon", () => 0.42);
    const map = getDungeonMap(progress);
    const staleBossNode = { ...map.bossNode, bossId: "elder_stag" };
    const staleProgress = {
      ...progress,
      maps: {
        ...progress.maps,
        1: {
          ...map,
          bossNode: staleBossNode,
          config: { ...map.config, bossId: "elder_stag" },
          nodes: map.nodes.map(node => (
            node.type === "boss" ? { ...node, bossId: "elder_stag" } : node
          )),
        },
      },
    };

    expect(map.bossNode.bossId).toBe("lich");

    const repairedMap = getDungeonMap(staleProgress);
    const normalized = normalizeDungeonProgress(staleProgress);
    const boss = createDungeonEncounter({ zoneId: "dungeon" }, repairedMap.bossNode, normalized, () => 0.1);

    expect(repairedMap.bossNode.bossId).toBe("lich");
    expect(normalized.maps[1].bossNode.bossId).toBe("lich");
    expect(boss.enemy.id).toBe("lich");
  });
});
