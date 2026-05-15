export function createRegionLocationId(regionId, kind = "node", locations = []) {
  const safeKind = String(kind || "node")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "node";
  const prefix = `${regionId}_${safeKind}_`;
  const ids = new Set(locations.map(location => location.id));
  let index = 1;
  let id = `${prefix}${index}`;

  while (ids.has(id)) {
    index += 1;
    id = `${prefix}${index}`;
  }

  return { id, index };
}

export function createRegionCrossroadId(regionId, locations = []) {
  return createRegionLocationId(regionId, "crossroad", locations);
}

export function createRegionWaypointId(regionId, locations = []) {
  return createRegionLocationId(regionId, "waypoint", locations);
}

export function buildMapEditorSavePayload({
  allWorldLocations = [],
  allWorldRoads = [],
  worldRegions = { regions: [] },
  pendingNodes = [],
  pendingRoads = [],
  updatedNodes = [],
  deletedLocationIds = [],
  deletedRoadIds = [],
}) {
  const deletedLocSet = new Set(deletedLocationIds);
  const deletedRoadSet = new Set(deletedRoadIds);
  const updatedNodeList = Array.isArray(updatedNodes) ? updatedNodes : Object.values(updatedNodes || {});
  const updatedNodeMap = new Map(updatedNodeList.filter(node => node?.id).map(node => [node.id, node]));
  const sourceWorldLocations = allWorldLocations.map(location =>
    updatedNodeMap.has(location.id) ? { ...location, ...updatedNodeMap.get(location.id) } : location
  );
  const finalPendingRoads = pendingRoads.filter(road =>
    !deletedRoadSet.has(road.id) &&
    !deletedLocSet.has(road.from) &&
    !deletedLocSet.has(road.to)
  );
  const pendingPairs = new Set(finalPendingRoads.map(road => [road.from, road.to].sort().join("::")));
  const keptExistingRoads = allWorldRoads.filter(road =>
    !deletedRoadSet.has(road.id) &&
    !deletedLocSet.has(road.from) &&
    !deletedLocSet.has(road.to) &&
    !pendingPairs.has([road.from, road.to].sort().join("::"))
  );
  const finalRoads = [...keptExistingRoads, ...finalPendingRoads];
  const deletedRoadPairs = new Set(
    allWorldRoads
      .filter(road => deletedRoadSet.has(road.id))
      .map(road => [road.from, road.to].sort().join("::"))
  );
  const connectionsMap = {};

  sourceWorldLocations
    .filter(location => !deletedLocSet.has(location.id))
    .forEach(location => {
      connectionsMap[location.id] = new Set();
    });

  pendingNodes
    .filter(node => !deletedLocSet.has(node.id))
    .forEach(node => {
      connectionsMap[node.id] = new Set();
    });

  finalRoads.forEach(road => {
    if (!connectionsMap[road.from]) connectionsMap[road.from] = new Set();
    if (!connectionsMap[road.to]) connectionsMap[road.to] = new Set();
    connectionsMap[road.from].add(road.to);
    connectionsMap[road.to].add(road.from);
  });

  // Also preserve connections defined directly on nodes (not backed by road objects)
  [...sourceWorldLocations.filter(l => !deletedLocSet.has(l.id)), ...pendingNodes.filter(n => !deletedLocSet.has(n.id))].forEach(loc => {
    (loc.connections || []).forEach(connId => {
      if (deletedRoadPairs.has([loc.id, connId].sort().join("::"))) return;
      if (connectionsMap[connId] !== undefined && !deletedLocSet.has(connId)) {
        connectionsMap[loc.id]?.add(connId);
        connectionsMap[connId]?.add(loc.id);
      }
    });
  });

  const finalLocations = [
    ...sourceWorldLocations
      .filter(location => !deletedLocSet.has(location.id))
      .map(location => ({ ...location, connections: [...(connectionsMap[location.id] || [])] })),
    ...pendingNodes
      .filter(node => !deletedLocSet.has(node.id))
      .map(node => ({ ...node, connections: [...(connectionsMap[node.id] || [])] })),
  ];

  const finalRegions = {
    ...worldRegions,
    regions: (worldRegions.regions || []).map(region => ({
      ...region,
      locationIds: [
        ...new Set([
          ...(region.locationIds || []).filter(id => !deletedLocSet.has(id)),
          ...pendingNodes
            .filter(node => node.regionId === region.id && !deletedLocSet.has(node.id))
            .map(node => node.id),
        ]),
      ],
    })),
  };

  return {
    locations: { locations: finalLocations },
    roads: { roads: finalRoads },
    regions: finalRegions,
  };
}
