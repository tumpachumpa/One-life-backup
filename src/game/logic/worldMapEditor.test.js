import { describe, expect, it } from "vitest";
import { buildMapEditorSavePayload, createRegionCrossroadId, createRegionLocationId } from "./worldMapEditor.js";

describe("world map editor", () => {
  it("creates region-scoped crossroad ids without reusing old session ids", () => {
    const existing = [
      { id: "crossroad_1" },
      { id: "eastern_wilds_crossroad_1" },
      { id: "rootspire_crossroad_1" },
    ];

    expect(createRegionCrossroadId("eastern_wilds", existing)).toEqual({
      id: "eastern_wilds_crossroad_2",
      index: 2,
    });
    expect(createRegionCrossroadId("rootspire", existing)).toEqual({
      id: "rootspire_crossroad_2",
      index: 2,
    });
  });

  it("creates region-scoped ids for custom world map node kinds", () => {
    const existing = [
      { id: "eastern_wilds_random_event_1" },
      { id: "eastern_wilds_random_event_2" },
      { id: "eastern_wilds_combat_1" },
    ];

    expect(createRegionLocationId("eastern_wilds", "random event", existing)).toEqual({
      id: "eastern_wilds_random_event_3",
      index: 3,
    });
    expect(createRegionLocationId("eastern_wilds", "combat", existing)).toEqual({
      id: "eastern_wilds_combat_2",
      index: 2,
    });
  });

  it("removes deleted locations, connected roads, and stale region ids from save payload", () => {
    const payload = buildMapEditorSavePayload({
      allWorldLocations: [
        { id: "camp", regionId: "eastern_wilds", connections: ["gate", "forest"] },
        { id: "gate", regionId: "eastern_wilds", connections: ["camp"] },
        { id: "forest", regionId: "eastern_wilds", connections: ["camp"] },
      ],
      allWorldRoads: [
        { id: "road_camp_gate", regionId: "eastern_wilds", from: "camp", to: "gate" },
        { id: "road_camp_forest", regionId: "eastern_wilds", from: "camp", to: "forest" },
      ],
      worldRegions: {
        regions: [
          { id: "eastern_wilds", locationIds: ["camp", "gate", "forest"] },
        ],
      },
      deletedLocationIds: ["gate"],
    });

    expect(payload.locations.locations.map(location => location.id)).toEqual(["camp", "forest"]);
    expect(payload.roads.roads.map(road => road.id)).toEqual(["road_camp_forest"]);
    expect(payload.locations.locations.find(location => location.id === "camp").connections).toEqual(["forest"]);
    expect(payload.regions.regions[0].locationIds).toEqual(["camp", "forest"]);
  });

  it("persists explicit road deletes and adds pending nodes to the right region once", () => {
    const pendingNode = {
      id: "eastern_wilds_crossroad_1",
      name: "Junction 1",
      regionId: "eastern_wilds",
      connections: [],
    };
    const payload = buildMapEditorSavePayload({
      allWorldLocations: [
        { id: "camp", regionId: "eastern_wilds", connections: ["forest"] },
        { id: "forest", regionId: "eastern_wilds", connections: ["camp"] },
      ],
      allWorldRoads: [
        { id: "road_camp_forest", regionId: "eastern_wilds", from: "camp", to: "forest" },
      ],
      worldRegions: {
        regions: [
          { id: "eastern_wilds", locationIds: ["camp", "forest", "eastern_wilds_crossroad_1"] },
        ],
      },
      pendingNodes: [pendingNode],
      pendingRoads: [
        { id: "road_camp_crossroad", regionId: "eastern_wilds", from: "camp", to: "eastern_wilds_crossroad_1" },
      ],
      deletedRoadIds: ["road_camp_forest"],
    });

    expect(payload.roads.roads.map(road => road.id)).toEqual(["road_camp_crossroad"]);
    expect(payload.locations.locations.find(location => location.id === "camp").connections).toEqual(["eastern_wilds_crossroad_1"]);
    expect(payload.regions.regions[0].locationIds).toEqual(["camp", "forest", "eastern_wilds_crossroad_1"]);
  });

  it("persists edits to existing nodes while preserving regenerated connections", () => {
    const payload = buildMapEditorSavePayload({
      allWorldLocations: [
        { id: "camp", name: "Camp", regionId: "eastern_wilds", type: "location", x: 50, y: 70, connections: ["forest"] },
        { id: "forest", name: "Forest", regionId: "eastern_wilds", type: "location", x: 80, y: 55, connections: ["camp"] },
      ],
      allWorldRoads: [
        { id: "road_camp_forest", regionId: "eastern_wilds", from: "camp", to: "forest" },
      ],
      worldRegions: {
        regions: [
          { id: "eastern_wilds", locationIds: ["camp", "forest"] },
        ],
      },
      updatedNodes: [
        { id: "camp", name: "Base Camp", type: "event", x: 51.5, y: 69.2, event: { id: "camp_event", title: "Camp Event", effects: [] } },
      ],
    });

    const camp = payload.locations.locations.find(location => location.id === "camp");
    expect(camp).toMatchObject({
      id: "camp",
      name: "Base Camp",
      type: "event",
      x: 51.5,
      y: 69.2,
      event: { id: "camp_event", title: "Camp Event", effects: [] },
    });
    expect(camp.connections).toEqual(["forest"]);
  });

  it("persists explicit unlock edits over old locked nodes", () => {
    const payload = buildMapEditorSavePayload({
      allWorldLocations: [
        { id: "future_event", regionId: "eastern_wilds", name: "???", type: "placeholder", locked: true, unlock: { type: "future" }, connections: [] },
      ],
      worldRegions: {
        regions: [
          { id: "eastern_wilds", locationIds: ["future_event"] },
        ],
      },
      updatedNodes: [
        { id: "future_event", name: "Forest Shrine", type: "event", locked: false, unlock: { type: "always" }, event: { id: "future_event_event", title: "Forest Shrine", effects: [] } },
      ],
    });

    expect(payload.locations.locations[0]).toMatchObject({
      id: "future_event",
      name: "Forest Shrine",
      type: "event",
      locked: false,
      unlock: { type: "always" },
    });
  });
});
