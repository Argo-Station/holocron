/**
 * pathfinding.js — Dijkstra graph + routing for hyperspace navigation.
 * Pure JS. No React. No DOM.
 */

function buildNavGraph(planets, routes) {
  var planetByName = {};
  planets.forEach(function(p) { planetByName[p.name] = p; });

  var graph = new Map();

  planets.forEach(function(p) {
    graph.set(p.name, { planet: p, neighbors: new Map() });
  });

  routes.forEach(function(route) {
    for (var i = 0; i < route.waypoints.length - 1; i++) {
      var nameA = route.waypoints[i];
      var nameB = route.waypoints[i + 1];
      var pA = planetByName[nameA];
      var pB = planetByName[nameB];
      if (!pA || !pB) continue;

      var dist = Math.sqrt(
        Math.pow(pA.x - pB.x, 2) + Math.pow(pA.y - pB.y, 2)
      );

      var nodeA = graph.get(nameA);
      var nodeB = graph.get(nameB);
      if (!nodeA || !nodeB) continue;

      var existingAB = nodeA.neighbors.get(nameB);
      if (!existingAB || dist < existingAB.distance) {
        nodeA.neighbors.set(nameB, { distance: dist, lane: route.name, lane_quality: route.lane_quality });
        nodeB.neighbors.set(nameA, { distance: dist, lane: route.name, lane_quality: route.lane_quality });
      }
    }
  });

  return graph;
}

function findRoute(graph, startName, endName) {
  if (!graph.has(startName) || !graph.has(endName)) return null;
  if (startName === endName) return { path: [startName], lanes: [], totalDistance: 0 };

  var distances = new Map();
  var previous = new Map();
  var laneUsed = new Map();
  var unvisited = new Set();

  graph.forEach(function(_, name) {
    distances.set(name, Infinity);
    unvisited.add(name);
  });
  distances.set(startName, 0);

  while (unvisited.size > 0) {
    var current = null;
    var minDist = Infinity;
    unvisited.forEach(function(name) {
      var d = distances.get(name);
      if (d < minDist) { minDist = d; current = name; }
    });

    if (current === null || current === endName) break;
    if (distances.get(current) === Infinity) break;

    unvisited.delete(current);

    var node = graph.get(current);
    node.neighbors.forEach(function(edge, neighborName) {
      if (!unvisited.has(neighborName)) return;
      var newDist = distances.get(current) + edge.distance;
      if (newDist < distances.get(neighborName)) {
        distances.set(neighborName, newDist);
        previous.set(neighborName, current);
        laneUsed.set(neighborName, edge.lane);
      }
    });
  }

  if (distances.get(endName) === Infinity) return null;

  var path = [];
  var lanes = [];
  var cur = endName;
  while (cur !== undefined) {
    path.unshift(cur);
    var lane = laneUsed.get(cur);
    if (lane) lanes.unshift(lane);
    cur = previous.get(cur);
  }

  return { path: path, lanes: lanes, totalDistance: distances.get(endName) };
}

function snapToLane(x, y, planets, routes) {
  var planetByName = {};
  planets.forEach(function(p) { planetByName[p.name] = p; });

  var nearestPlanet = null;
  var nearestDist = Infinity;

  planets.forEach(function(p) {
    var d = Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2));
    if (d < nearestDist) { nearestDist = d; nearestPlanet = p; }
  });

  if (nearestDist <= 30) return nearestPlanet.name;

  var nearestOnLane = null;
  var nearestOnLaneDist = Infinity;

  routes.forEach(function(route) {
    for (var i = 0; i < route.waypoints.length - 1; i++) {
      var pA = planetByName[route.waypoints[i]];
      var pB = planetByName[route.waypoints[i + 1]];
      if (!pA || !pB) continue;

      var dx = pB.x - pA.x;
      var dy = pB.y - pA.y;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      var t = Math.max(0, Math.min(1, ((x - pA.x) * dx + (y - pA.y) * dy) / lenSq));
      var nearX = pA.x + t * dx;
      var nearY = pA.y + t * dy;
      var d = Math.sqrt(Math.pow(x - nearX, 2) + Math.pow(y - nearY, 2));

      if (d < nearestOnLaneDist) {
        nearestOnLaneDist = d;
        var dA = Math.sqrt(Math.pow(x - pA.x, 2) + Math.pow(y - pA.y, 2));
        var dB = Math.sqrt(Math.pow(x - pB.x, 2) + Math.pow(y - pB.y, 2));
        nearestOnLane = dA < dB ? route.waypoints[i] : route.waypoints[i + 1];
      }
    }
  });

  return nearestOnLane || (nearestPlanet ? nearestPlanet.name : null);
}

function _euclid(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function isOnNetwork(graph, name) {
  var node = graph.get(name);
  return !!(node && node.neighbors && node.neighbors.size > 0);
}

// UXQP-42 — universal routing. Any two valid planets ALWAYS route: an
// off-network endpoint takes an off-lane (wild-space) leg to its nearest lane
// entry node, the lane network in the middle, then an off-lane leg out.
// "No route found" ceases to be a possible outcome. snapToLane (previously
// uncalled) does the entry-node projection, fed ONLY network planets so it
// can never snap to another stranded world.
function routeUniversal(graph, planets, routes, startName, endName) {
  if (!graph || !graph.has(startName) || !graph.has(endName)) return null;

  var planetByName = {};
  planets.forEach(function (p) { planetByName[p.name] = p; });
  var sP = planetByName[startName], eP = planetByName[endName];
  if (!sP || !eP) return null;

  if (startName === endName) {
    return { path: [startName], lanes: [], segments: [], totalDistance: 0, offLane: false, samePlanet: true };
  }

  var startOn = isOnNetwork(graph, startName);
  var endOn = isOnNetwork(graph, endName);
  var networkPlanets = planets.filter(function (p) { return isOnNetwork(graph, p.name); });

  // Degenerate galaxy with no lanes at all — a single wild-space jump.
  if (networkPlanets.length === 0) {
    var seg0 = { from: startName, to: endName, offLane: true, lane: null, quality: 'wild_space', distance: _euclid(sP, eP) };
    return { path: [startName, endName], lanes: [], segments: [seg0], totalDistance: seg0.distance, offLane: true, samePlanet: false };
  }

  var entryStart = startOn ? startName : snapToLane(sP.x, sP.y, networkPlanets, routes);
  var entryEnd = endOn ? endName : snapToLane(eP.x, eP.y, networkPlanets, routes);
  if (!entryStart || !entryEnd) return null;

  var lane;
  if (entryStart === entryEnd) {
    lane = { path: [entryStart], lanes: [], totalDistance: 0 };
  } else {
    lane = findRoute(graph, entryStart, entryEnd);
    // Disconnected lane components — bridge the two entry nodes with a direct
    // wild-space jump rather than failing (the segment loop flags it off-lane).
    if (!lane) lane = { path: [entryStart, entryEnd], lanes: [], totalDistance: 0 };
  }

  // Assemble the full ordered path: off-lane prefix + lane spine + off-lane suffix.
  var path = lane.path.slice();
  if (!startOn && entryStart !== startName) path.unshift(startName);
  if (!endOn && entryEnd !== endName && path[path.length - 1] !== endName) path.push(endName);

  // Segment-level classification: an A→B hop is on-lane only if the graph has
  // that exact edge; everything else (the snapped legs, the disconnected
  // bridge) is wild space.
  var segments = [];
  for (var i = 0; i < path.length - 1; i++) {
    var a = path[i], b = path[i + 1];
    var na = graph.get(a);
    var edge = na && na.neighbors.get(b);
    segments.push({
      from: a, to: b,
      offLane: !edge,
      lane: edge ? edge.lane : null,
      quality: edge ? (edge.lane_quality || 'minor') : 'wild_space',
      distance: _euclid(planetByName[a], planetByName[b]),
    });
  }

  var totalDistance = segments.reduce(function (s, seg) { return s + seg.distance; }, 0);
  var lanes = segments.filter(function (s) { return !s.offLane && s.lane; }).map(function (s) { return s.lane; });
  var offLane = segments.some(function (s) { return s.offLane; });

  return { path: path, lanes: lanes, segments: segments, totalDistance: totalDistance, offLane: offLane, samePlanet: false };
}

if (typeof window !== 'undefined') {
  window.GmPathfinding = {
    buildNavGraph: buildNavGraph,
    findRoute: findRoute,
    snapToLane: snapToLane,
    isOnNetwork: isOnNetwork,
    routeUniversal: routeUniversal,
  };
}
