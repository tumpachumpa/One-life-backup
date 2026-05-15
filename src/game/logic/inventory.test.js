import { describe, expect, it } from "vitest";
import { CAMPFIRE_CARRY_BASE, INV_BASE, INV_COLS } from "../constants.js";
import { getItem } from "./content.js";
import { collectEffects } from "./effectEngine.js";
import { calcStats, clampHeroHpToStats, initHero } from "./hero.js";
import { rollGeneratedEquipment } from "./equipmentGenerator.js";
import { addToGrid, countInGrid, hasSpaceFor, normalizeGridItems, removeFirstFromGrid, removeFromGrid, removeManyFromGrid, transferGridQuantity, unequipToGrid } from "./inventory.js";
import { applyCampfireRarityToItem } from "./campfires.js";

describe("inventory item refs", () => {
  it("preserves generated combat loot rarity objects in the grid", () => {
    const epicDagger = rollGeneratedEquipment({ baseId: "dagger", materialId: "iron", rarity: "epic", itemLevel: 2 }, () => 0);
    const inventory = addToGrid([], epicDagger, 6);

    expect(inventory).not.toBeNull();
    expect(inventory[0].itemId).toMatchObject({
      uid: epicDagger.uid,
      rarity: "epic",
      generated: true,
      generation: { baseId: "dagger" },
    });
    expect(countInGrid(inventory, epicDagger)).toBe(1);
    expect(hasSpaceFor(inventory, epicDagger, 6)).toBe(true);
    expect(removeFirstFromGrid(inventory, epicDagger)).toEqual([]);
  });

  it("can convert three wood into one campfire through grid operations", () => {
    const withWood = addToGrid([], "wood", 6, 3);
    const withoutWood = removeManyFromGrid(withWood, "wood", 3);
    const withCampfire = addToGrid(withoutWood, "campfire", 6);

    expect(countInGrid(withWood, "wood")).toBe(3);
    expect(countInGrid(withoutWood, "wood")).toBe(0);
    expect(withCampfire).not.toBeNull();
    expect(countInGrid(withCampfire, "campfire")).toBe(1);
  });

  it("adds crafted meal outputs to the inventory when cooking does not burn", () => {
    const recipes = [
      {
        output: "wolf_skewer",
        ingredients: ["wolf_meat", "wild_berries"],
      },
      {
        output: "boar_stew",
        ingredients: ["boar_meat", "wild_mushrooms"],
      },
    ];

    for (const recipe of recipes) {
      let inventory = [];
      for (const ingredient of recipe.ingredients) inventory = addToGrid(inventory, ingredient, 6);
      const afterIngredients = recipe.ingredients.reduce(
        (next, ingredient) => removeManyFromGrid(next, ingredient, 1),
        inventory,
      );
      const afterCraft = addToGrid(afterIngredients, recipe.output, 6);

      expect(afterCraft).not.toBeNull();
      expect(countInGrid(afterCraft, recipe.output)).toBe(1);
      for (const ingredient of recipe.ingredients) {
        expect(countInGrid(afterCraft, ingredient)).toBe(0);
      }
    }
  });

  it("can move one campfire from a stack so extras can be stashed", () => {
    const inventory = [{ itemId: "campfire", x: 0, y: 0, qty: 2 }];
    const stash = addToGrid([], "campfire", 10);
    const nextInventory = removeFromGrid(inventory, 0, 1);

    expect(stash).not.toBeNull();
    expect(countInGrid(nextInventory, "campfire")).toBe(1);
    expect(countInGrid(stash, "campfire")).toBe(1);
  });

  it("transfers a chosen stack quantity between grids", () => {
    const inventory = [{ itemId: "campfire", x: 0, y: 0, qty: 5 }];
    const stash = [];
    const moved = transferGridQuantity(inventory, stash, 0, "campfire", 10, 3);

    expect(moved).not.toBeNull();
    expect(moved.moved).toBe(3);
    expect(countInGrid(moved.source, "campfire")).toBe(2);
    expect(countInGrid(moved.target, "campfire")).toBe(3);
  });

  it("does not remove from the source when the target grid has no space", () => {
    const sword = rollGeneratedEquipment({ baseId: "sword_1h", materialId: "iron", rarity: "rare", itemLevel: 2 }, () => 0);
    const source = [{ itemId: sword, x: 0, y: 0, qty: 1 }];
    let fullTarget = [];
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < INV_COLS; x += 1) {
        fullTarget.push({ itemId: "wood", x, y, qty: 1 });
      }
    }

    const moved = transferGridQuantity(source, fullTarget, 0, sword, 6, 1);

    expect(moved).toBeNull();
    expect(countInGrid(source, sword)).toBe(1);
  });

  it("keeps rare campfires in their own stack instead of merging into normal campfires", () => {
    const rareCampfire = applyCampfireRarityToItem(getItem("campfire"), "rare");
    const secondRareCampfire = { ...rareCampfire, uid: "different_rare_campfire_uid" };
    let inventory = addToGrid([], "campfire", 6);
    inventory = addToGrid(inventory, rareCampfire, 6);

    expect(inventory).not.toBeNull();
    expect(inventory).toHaveLength(2);
    expect(countInGrid(inventory, "campfire")).toBe(1);
    expect(countInGrid(inventory, rareCampfire)).toBe(1);

    const stackedRare = addToGrid(inventory, secondRareCampfire, 6);
    const normalStack = stackedRare.find(entry => entry.itemId === "campfire");
    const rareStack = stackedRare.find(entry => entry.itemId?.rarity === "rare");

    expect(stackedRare).toHaveLength(2);
    expect(normalStack.qty).toBe(1);
    expect(rareStack.qty).toBe(2);
    expect(rareStack.itemId).toMatchObject({ baseId: "campfire", rarity: "rare" });

    const withoutNormal = removeFirstFromGrid(stackedRare, "campfire");
    expect(withoutNormal).toHaveLength(1);
    expect(withoutNormal[0].itemId).toMatchObject({ baseId: "campfire", rarity: "rare" });
    expect(withoutNormal[0].qty).toBe(2);
  });

  it("normalizes old stash entries into valid grid positions", () => {
    const rareSword = rollGeneratedEquipment({ baseId: "sword_1h", materialId: "iron", rarity: "rare", itemLevel: 2 }, () => 0);
    const stash = normalizeGridItems([
      rareSword,
      { itemId: "campfire", x: 99, y: 99, qty: 2 },
    ], 10);

    expect(stash).toHaveLength(2);
    expect(stash[0].itemId).toMatchObject({ uid: rareSword.uid, rarity: "rare", generated: true });
    expect(stash.every(entry => Number.isFinite(entry.x) && Number.isFinite(entry.y))).toBe(true);
    expect(stash.every(entry => entry.x >= 0 && entry.y >= 0 && entry.y < 10)).toBe(true);
    expect(countInGrid(stash, "campfire")).toBe(2);
  });

  it("uses bags for campfire carry limit instead of inventory space", () => {
    const hero = initHero("Tester");
    const withBag = { ...hero, equip: { ...hero.equip, bag: "small_bag" } };
    const oldRolledBag = {
      ...getItem("small_bag"),
      uid: "old_small_bag",
      effects: [{ type: "inventory_slots", value: 10 }],
    };
    const withOldRolledBag = { ...hero, equip: { ...hero.equip, bag: oldRolledBag } };

    expect(calcStats(hero).inventorySlots).toBe(INV_BASE);
    expect(calcStats(withBag).inventorySlots).toBe(INV_BASE);
    expect(calcStats(withOldRolledBag).inventorySlots).toBe(INV_BASE);
    expect(calcStats(hero).campfireCarryLimit).toBe(CAMPFIRE_CARRY_BASE);
    expect(calcStats(withBag).campfireCarryLimit).toBe(CAMPFIRE_CARRY_BASE + 1);
    expect(calcStats(withOldRolledBag).campfireCarryLimit).toBe(CAMPFIRE_CARRY_BASE + 1);
  });

  it("only activates quiver effects while using a ranged weapon", () => {
    const quiver = {
      ...getItem("quiver"),
      uid: "test_quiver",
      baseStats: { armor: 25 },
      effects: [
        { type: "crit_chance", value: 7 },
        { type: "hit_chance", value: 8 },
        { type: "attack_speed", value: 10 },
        { type: "pet_damage_pct", value: 12 },
      ],
    };
    const meleeHero = initHero("Sword", { heroClass: "fighter", weapon: "sword" });
    const rangedHero = initHero("Bow", { heroClass: "archer", weapon: "bow" });
    const meleeBaseline = calcStats({ ...meleeHero, equip: { ...meleeHero.equip, bag: null } });
    const meleeWithQuiver = { ...meleeHero, equip: { ...meleeHero.equip, bag: quiver } };
    const rangedBaseline = calcStats({ ...rangedHero, equip: { ...rangedHero.equip, bag: null } });
    const rangedWithQuiver = { ...rangedHero, equip: { ...rangedHero.equip, bag: quiver } };
    const rangedStats = calcStats(rangedWithQuiver);

    expect(collectEffects(meleeWithQuiver).some(effect => effect.source === "test_quiver")).toBe(false);
    expect(calcStats(meleeWithQuiver).armor).toBe(meleeBaseline.armor);
    expect(calcStats(meleeWithQuiver).critChance).toBe(meleeBaseline.critChance);
    expect(collectEffects(rangedWithQuiver).some(effect => effect.source === "test_quiver")).toBe(true);
    expect(rangedStats.armor).toBe(rangedBaseline.armor + 25);
    expect(rangedStats.critChance).toBe(rangedBaseline.critChance + 7);
    expect(rangedStats.hitChance).toBe(rangedBaseline.hitChance + 8);
  });

  it("does not unequip gear when inventory has no room", () => {
    const hero = initHero("Tester");
    const equippedChest = hero.equip.chest;
    const fullInventory = Array.from({ length: INV_COLS }, (_, x) => ({ itemId: "wood", x, y: 0, qty: 1 }));

    const result = unequipToGrid({ ...hero, inventory: fullInventory }, "chest", 1);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_space");
    expect(result.hero.equip.chest).toBe(equippedChest);
    expect(result.hero.inventory).toEqual(fullInventory);
  });

  it("clamps current HP after removing gear that raised max HP", () => {
    const hero = initHero("Tester");
    const baseMaxHp = calcStats(hero).maxHp;
    const hpChest = {
      ...getItem(hero.equip.chest),
      uid: "hp_chest",
      effects: [
        ...(getItem(hero.equip.chest).effects || []),
        { type: "max_hp", value: 50 },
      ],
    };
    const boosted = {
      ...hero,
      hp: baseMaxHp + 50,
      equip: { ...hero.equip, chest: hpChest },
    };
    const boostedMaxHp = calcStats(boosted).maxHp;
    const removed = {
      ...boosted,
      hp: boostedMaxHp,
      equip: { ...boosted.equip, chest: null },
    };

    expect(boostedMaxHp).toBeGreaterThan(baseMaxHp);
    expect(calcStats(removed).maxHp).toBe(baseMaxHp);
    expect(clampHeroHpToStats(removed).hp).toBe(baseMaxHp);
  });
});
