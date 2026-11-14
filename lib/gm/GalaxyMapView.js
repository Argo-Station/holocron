/**
 * GalaxyMapView.js — Leaflet CRS.Simple galaxy map with zoom-based detail tiers.
 *
 * Tier 1 (zoom -3/-2): 12 iconic planets + labels + major route glow
 * Tier 2 (zoom -1):    +14 remaining full-depth + 5 route name labels
 * Tier 3 (zoom 0):     +23 identity-depth + region watermarks
 * Tier 4 (zoom 1+):    +~2,001 nav-only canvas dots with hover tooltips
 *
 * All layers built once on init, toggled with addLayer/removeLayer for smooth zoom.
 */

var TIER_1_PLANETS = [
  'Coruscant', 'Tatooine', 'Corellia', 'Hoth', 'Naboo', 'Mandalore',
  'Kashyyyk', 'Nar Shaddaa', 'Alderaan', 'Endor', 'Kamino', 'Dagobah'
];

var MAJOR_ROUTE_NAMES = [
  'Hydian Way', 'Corellian Run', 'Corellian Trade Spine',
  'Perlemian Trade Route', 'Rimma Trade Route'
];

// Notable nav-only planets that get permanent labels at zoom 1+ (3-5 per region)
var TIER_4_LABEL_PLANETS = [
  // Core
  'Anaxes', 'Brentaal', 'Alsakan', 'Abregado-rae',
  // Colonies
  'Balmorra', 'Carida', 'Castell',
  // Inner Rim
  'Bestine', 'Bilbringi', 'Onderon',
  // Expansion Regions
  'Aquaris', 'Kinyen',
  // Mid Rim
  'Ansion', 'Bothawui', 'Ithor', 'Malastare', 'Taris',
  // Outer Rim
  'Agamar', 'Eriadu', 'Mustafar', 'Mygeeto', 'Utapau', 'Dathomir', 'Dantooine',
  // Hutt Space
  'Ylesia', 'Sleheyron',
  // Deep Core
  'Tython', 'Prakith',
  // Unknown/Wild
  'Ahch-To', 'Exegol', 'Csilla', 'Rakata Prime', 'Lasan'
];

// R-MAP1: shared-system declutter. A few canonical multi-body systems (moons /
// multi-world systems) sit within a handful of map-units of each other and stack
// into an unreadable pile. Below CLUSTER_SEPARATION_ZOOM we render only the system's
// representative body with a "+N" hint; at/above it every member renders normally.
// VISUAL ONLY — search + routing (gm/index.html) run on the full planet/route graph
// and resolve every body independently (Yavin 4 / Nal Hutta / Centerpoint stay
// searchable + routable).
//
// A blind proximity collapse was REJECTED: at the rider's ~15-unit radius the GDR
// placement is dense enough that single-linkage merges most of the Core/Colonies into
// 30-40 body blobs (Coruscant +31, Hoth +43, Tatooine +29). These explicit real
// shared-system groupings are the actual decluttering target. SEPARATION_ZOOM is
// pinned to the tier-4 reveal zoom so navigation-depth members (which only paint as
// dots at that zoom) appear exactly as the "+N" hint drops.
var CLUSTER_SEPARATION_ZOOM = 1;
var BODY_CLUSTERS = [
  { rep: 'Corellia',    members: ['Selonia', 'Drall', 'Talus', 'Tralus', 'Centerpoint Station'] },
  { rep: 'Nar Shaddaa', members: ['Nal Hutta'] },
  { rep: 'Yavin',       members: ['Yavin 4'] }
];

// name -> { role:'rep', base, hidden:N } | { role:'member', rep }
function _buildClusterIndex() {
  var idx = {};
  BODY_CLUSTERS.forEach(function(c) {
    idx[c.rep] = { role: 'rep', base: c.rep, hidden: c.members.length };
    c.members.forEach(function(m) { idx[m] = { role: 'member', rep: c.rep }; });
  });
  return idx;
}

var REGION_STYLES = {
  'Deep Core':         { color: 'rgba(255,215,0,0.18)',   size: 11 },
  'Core':              { color: 'rgba(230,247,255,0.15)',  size: 12 },
  'Colonies':          { color: 'rgba(159,187,211,0.12)',  size: 11 },
  'Inner Rim':         { color: 'rgba(159,187,211,0.12)',  size: 11 },
  'Expansion Regions': { color: 'rgba(159,187,211,0.10)',  size: 10 },
  'Mid Rim':           { color: 'rgba(58,181,255,0.10)',   size: 11 },
  'Outer Rim':         { color: 'rgba(58,181,255,0.10)',   size: 13 },
  'Hutt Space':        { color: 'rgba(255,200,87,0.12)',   size: 11 },
  'Wild Space':        { color: 'rgba(159,187,211,0.08)',  size: 10 },
  'Unknown Regions':   { color: 'rgba(159,187,211,0.07)',  size: 10 }
};

// Galaxy image bounds — widened to fill widescreen displays.
// Image is 3072x1024 (3:1). Planet Y range ~2100, X range ~1820.
// Widen X bounds so image fills a 16:9/16:10 screen at zoom -1.
// Leaflet bounds: [[minY, minX], [maxY, maxX]]  (CRS.Simple: lat=y, lng=x)
// GDR original image bounds — image stretched to fit coordinate space
var GALAXY_IMAGE_BOUNDS = [[-1210, -1420], [890, 1380]];
var MAP_MAX_BOUNDS = [[-1300, -1500], [980, 1460]];

// Inject styles once
(function() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gm-leaflet-css')) return;
  var style = document.createElement('style');
  style.id = 'gm-leaflet-css';
  style.textContent = [
    // B-1157 (b), D-406 item 21 (replaces D-79's rgba(159,187,211,0.7) ink): brighter ink on a dark plate, so a name
    // reads at 4.5:1 whatever part of the art is under it.
    '.galaxy-label{background:rgba(4,8,16,0.72)!important;border:none!important;box-shadow:none!important;',
    "color:rgba(214,230,244,1);font-family:'Orbitron',monospace;font-size:9px;letter-spacing:0.05em;",
    'padding:1px 4px!important;border-radius:2px;white-space:nowrap;pointer-events:none;text-shadow:none}',
    '.galaxy-label::before{display:none}',
    // B-1589, D-408 ("Plate them too"; replaces UXQP-39's halo): the 12 anchor planets keep their larger type
    // and sit on the same dark plate as every other name, so they read at 4.5:1 over the bright galaxy core.
    '.galaxy-label-iconic{background:rgba(4,8,16,0.72)!important;border:none!important;box-shadow:none!important;',
    "color:rgba(235,247,255,0.96);font-family:'Orbitron',monospace;font-size:12px;font-weight:600;letter-spacing:0.08em;",
    'padding:1px 4px!important;border-radius:2px;white-space:nowrap;pointer-events:none;text-shadow:none}',
    '.galaxy-label-iconic::before{display:none}',
    // F-5 MAP PINS — the node badge (concept §3): a STATIC ring in the map accent. It sits in its own
    // pointer-events:none pane so it can never swallow the tap that opens the planet sheet.
    '.gm-pin-badge{pointer-events:none!important}',
    '.leaflet-container{background:#050810!important}'
  ].join('');
  document.head.appendChild(style);
})();

// ── Helpers ──

// Track placed label positions for collision avoidance
var _placedLabels = [];

function _resetLabelTracking() { _placedLabels = []; }

function _pickLabelDirection(planet, size) {
  // Check if any already-placed label is within 20 units
  var CLUSTER_DIST = 20;
  var nearby = [];
  for (var i = 0; i < _placedLabels.length; i++) {
    var dx = planet.x - _placedLabels[i].x;
    var dy = planet.y - _placedLabels[i].y;
    if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_DIST) {
      nearby.push(_placedLabels[i]);
    }
  }

  // Directions in preference order
  var dirs = ['right', 'left', 'top', 'bottom'];
  var offsets = {
    right:  [size / 2 + 3, 0],
    left:   [-(size / 2 + 3), 0],
    top:    [0, -(size / 2 + 6)],
    bottom: [0, size / 2 + 6]
  };

  if (nearby.length === 0) {
    // No neighbors — use position hash for variety
    var hash = (Math.abs(Math.round(planet.x * 7 + planet.y * 13))) % 4;
    var dir = dirs[hash];
    _placedLabels.push({ x: planet.x, y: planet.y, dir: dir });
    return { direction: dir, offset: offsets[dir] };
  }

  // Pick direction least used by neighbors
  var usedDirs = {};
  for (var j = 0; j < nearby.length; j++) { usedDirs[nearby[j].dir] = true; }
  var chosen = 'right';
  for (var k = 0; k < dirs.length; k++) {
    if (!usedDirs[dirs[k]]) { chosen = dirs[k]; break; }
  }

  _placedLabels.push({ x: planet.x, y: planet.y, dir: chosen });
  return { direction: chosen, offset: offsets[chosen] };
}

// B-1146 (D-406 item 20): no name sits on another name or on a world's dot. Leaflet's tooltips are DOM boxes whose
// screen size does not scale with zoom, so the boxes are compared on screen after every zoom: iconic names first
// (each tries its own side, then the other three), then the rest in tier order. A name that fits on no side is
// hidden; an iconic name never is (it keeps its own side).
function _placeNameBoxes(map) {
  var tips = [];
  map.eachLayer(function(l) {
    var t = l.getTooltip && l.getTooltip();
    if (t && t.options.permanent && map.hasLayer(t) && t.getElement && t.getElement()) tips.push(t);
  });
  var iconic = function(t) { return t.options.className === 'galaxy-label-iconic' ? 1 : 0; };
  tips.sort(function(a, b) { return iconic(b) - iconic(a); });   // stable: tier order is kept inside each group

  var mapEl = map.getContainer();
  var placed = [];
  var dots = mapEl.querySelectorAll('.gm-planet-node > div > div');
  for (var d = 0; d < dots.length; d++) {
    var dr = dots[d].getBoundingClientRect();
    if (dr.width > 0) placed.push(dr);
  }
  function hits(r) {
    for (var i = 0; i < placed.length; i++) {
      var q = placed[i];
      if (r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1) return true;
    }
    return false;
  }

  tips.forEach(function(t) {
    var el = t.getElement();
    if (!t._namePlace) t._namePlace = { dir: t.options.direction, off: L.point(t.options.offset) };
    var home = t._namePlace;
    el.style.visibility = '';
    var h = Math.abs(home.off.x) || Math.abs(home.off.y) - 3;
    var offs = { right: [h, 0], left: [-h, 0], top: [0, -(h + 3)], bottom: [0, h + 3] };
    var order = [home.dir].concat(['right', 'left', 'top', 'bottom'].filter(function(x) { return x !== home.dir; }));
    for (var k = 0; k < order.length; k++) {
      t.options.direction = order[k];
      t.options.offset = k === 0 ? home.off : L.point(offs[order[k]]);
      t.update();
      var r = el.getBoundingClientRect();
      if (!hits(r)) { placed.push(r); return; }
    }
    t.options.direction = home.dir; t.options.offset = home.off; t.update();
    if (iconic(t)) placed.push(el.getBoundingClientRect());
    else el.style.visibility = 'hidden';
  });
}

function _addPlanetMarker(planet, layer, withLabel, onSelect, iconic) {
  var depthColor = { full: '#3AFFA0', identity: '#FFC857', navigation: 'rgba(159,187,211,0.4)' }[planet.record_depth || 'navigation'] || 'rgba(159,187,211,0.4)';
  var size = planet.record_depth === 'full' ? 10 : planet.record_depth === 'identity' ? 8 : 6;
  // 44px transparent hit buffer so 6-10px dots meet the 44px touch minimum (B-1140 / B-1155, R-UMP-7 a: was 40,
  // a box that sat under the floor it claimed; invisible — the dot inside it is unchanged).
  var hit = 44;

  // UXQP-39: the 12 iconic anchor planets get a larger dot, a dark outline ring,
  // and a tighter/brighter glow so they separate from the galaxy art's own bright
  // clusters at far zoom (where they're the orientation anchors).
  var dot;
  if (iconic) {
    var iSize = 14;
    dot = '<div style="width:' + iSize + 'px;height:' + iSize + 'px;border-radius:50%;' +
      'background:' + depthColor + ';border:2px solid rgba(4,8,16,0.92);' +
      'box-shadow:0 0 9px ' + depthColor + ',0 0 3px rgba(0,0,0,0.95)"></div>';
  } else {
    dot = '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
      'background:' + depthColor + ';box-shadow:0 0 ' + size + 'px ' + depthColor + '"></div>';
  }

  var html = '<div style="width:' + hit + 'px;height:' + hit + 'px;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer">' + dot + '</div>';

  // className tags the node markers so a smoke can count NODES specifically (route/region labels are
  // divIcon markers too). It carries no styles — it replaces Leaflet's default `leaflet-div-icon`
  // white box exactly as the previous empty string did.
  var icon = L.divIcon({ html: html, className: 'gm-planet-node', iconSize: [hit, hit], iconAnchor: [hit / 2, hit / 2] });
  var marker = L.marker([planet.y, planet.x], { icon: icon });
  marker.on('click', function() { onSelect(planet); });

  if (withLabel) {
    var lbl = _pickLabelDirection(planet, iconic ? 14 : size);
    marker.bindTooltip(planet.name, {
      permanent: true, className: iconic ? 'galaxy-label-iconic' : 'galaxy-label',
      direction: lbl.direction, offset: lbl.offset
    });
  }

  marker.addTo(layer);
  return marker;
}

function _buildRouteLabelLayer(routes, planets) {
  var layer = L.layerGroup();
  var planetByName = {};
  planets.forEach(function(p) { planetByName[p.name] = p; });

  routes.filter(function(r) { return MAJOR_ROUTE_NAMES.indexOf(r.name) >= 0; }).forEach(function(route) {
    var coords = route.waypoints.map(function(n) { return planetByName[n]; }).filter(Boolean);
    if (coords.length < 2) return;

    var mid = coords[Math.floor(coords.length / 2)];
    var labelIcon = L.divIcon({
      html: '<div style="font-family:\'Orbitron\',monospace;font-size:10px;color:rgba(220,240,248,0.85);white-space:nowrap;pointer-events:none;user-select:none;letter-spacing:0.12em;text-shadow:0 0 8px rgba(58,181,255,0.4),0 1px 4px rgba(0,0,0,0.95);font-style:italic">' + route.name.toUpperCase() + '</div>',
      className: '', iconSize: [160, 16], iconAnchor: [80, 8]
    });
    L.marker([mid.y, mid.x], { icon: labelIcon, interactive: false, pane: 'routeLabelPane' }).addTo(layer);
  });

  return layer;
}

function _buildRegionLabelLayer(planets) {
  var layer = L.layerGroup();
  var groups = {};
  planets.forEach(function(p) {
    if (!p.region) return;
    if (!groups[p.region]) groups[p.region] = [];
    groups[p.region].push(p);
  });

  Object.keys(groups).forEach(function(region) {
    var rp = groups[region];
    // B-1144 (D-406 item 19): the name sits on the region's medoid world (the own world with the least summed
    // distance to the rest), not the mean — the mean of a ring-shaped region (Outer Rim, Mid Rim, Wild Space)
    // lands hundreds of units from any of its worlds.
    var best = rp[0], bestSum = Infinity;
    rp.forEach(function(a) {
      var sum = 0;
      for (var i = 0; i < rp.length && sum < bestSum; i++) sum += Math.sqrt((a.x - rp[i].x) * (a.x - rp[i].x) + (a.y - rp[i].y) * (a.y - rp[i].y));
      if (sum < bestSum) { bestSum = sum; best = a; }
    });
    var cx = best.x, cy = best.y;
    var st = REGION_STYLES[region] || { color: 'rgba(159,187,211,0.08)', size: 10 };

    var labelIcon = L.divIcon({
      html: '<div style="font-family:\'Orbitron\',monospace;font-size:' + st.size + 'px;color:' + st.color + ';white-space:nowrap;pointer-events:none;user-select:none;letter-spacing:0.2em;text-transform:uppercase;text-shadow:0 2px 8px rgba(0,0,0,0.8)">' + region + '</div>',
      className: '', iconSize: [200, 20], iconAnchor: [100, 10]
    });
    L.marker([cy, cx], { icon: labelIcon, interactive: false, pane: 'regionLabelPane' }).addTo(layer);
  });

  return layer;
}

function _applyZoomTiers(map, zoom, layers) {
  function toggle(layer, minZoom) {
    if (zoom >= minZoom) { if (!map.hasLayer(layer)) map.addLayer(layer); }
    else { if (map.hasLayer(layer)) map.removeLayer(layer); }
  }
  toggle(layers.tier2, -1);
  toggle(layers.routeLabels, -2);
  toggle(layers.tier3, 0);
  toggle(layers.regionLabels, 0);
  toggle(layers.tier4, 1);
  toggle(layers.tier4Labels, 1);
  // R-MAP1: labeled cluster members (e.g. Nal Hutta) reveal with the system at the
  // separation zoom; below it they fold into the representative's "+N" hint.
  if (layers.clusterMembers) toggle(layers.clusterMembers, CLUSTER_SEPARATION_ZOOM);
}

// UXQP-41: close-zoom dark stage. Past zoom 0 the galaxy art exhausts into a
// beige smear that swallows the nav dots/labels. Ramp the art opacity down as we
// push in so the near-black starfield background takes over and the dots read.
function _stageOpacity(zoom) {
  var BASE = 0.85, FLOOR = 0.22;
  if (zoom <= 0) return BASE;
  var t = Math.min(1, zoom / 2);
  return BASE + (FLOOR - BASE) * t;
}

// ── Main Component ──

// F-5 MAP PINS — the node badge, and the "show only pinned" view.
//
// Both are BOLTED ON TOP of the tier machinery rather than woven into it: the layers are built once
// on init and the pin state changes constantly, so a pin must never trigger a map rebuild. The badge
// lives in its own layer over its own pane; the filter hides the node layers and swaps in a small
// pinned-only layer. Route lines and route labels are deliberately NOT in that set — the concept is
// explicit that route drawing is unaffected.
var PINNED_HIDE_LAYERS = ['tier1', 'tier2', 'tier3', 'tier4', 'tier4Labels', 'clusterMembers', 'regionLabels'];

// ONE planet identity (B-1131): GmMapPins.planetKey — mapPins.js loads before this file (gm/index.html).
function _pinKey(p) {
  return GmMapPins.planetKey(p);
}

// The accent is the host's (B-1131: one home, the GM's HOLOCRON_ACCENT, passed as `props.accent`).
function _pinBadgeIcon(accent) {
  return L.divIcon({
    html: '<div style="width:20px;height:20px;border-radius:50%;box-sizing:border-box;' +
      'border:2px solid ' + accent + ';background:transparent;' +
      'box-shadow:0 0 10px ' + accent + 'AA,inset 0 0 6px ' + accent + '55"></div>',
    className: 'gm-pin-badge', iconSize: [20, 20], iconAnchor: [10, 10]
  });
}

function GalaxyMapView(props) {
  var planets = props.planets || [];
  var routes = props.routes || [];
  var accent = props.accent;
  var onPlanetSelect = props.onPlanetSelect;
  var onMapReady = props.onMapReady;
  var showGrid = props.showGrid || false;
  var pinnedIds = props.pinnedIds || [];
  var pinnedOnly = !!props.pinnedOnly;
  // Arrays are fresh objects every render, so effects key off a stable signature instead.
  var pinnedSig = pinnedIds.slice().sort().join('|');

  var mapRef = React.useRef(null);
  var leafletMap = React.useRef(null);
  var layersRef = React.useRef(null);
  var gridLayerRef = React.useRef(null);
  var pinLayerRef = React.useRef(null);
  var pinnedOnlyLayerRef = React.useRef(null);
  // The zoom handler is installed once on init and would otherwise close over a stale `pinnedOnly`,
  // re-adding every tier layer the filter had just hidden on the next zoom.
  var pinnedOnlyRef = React.useRef(false);
  // Same reason for the select handler: the pinned-only layer builds its markers after init.
  var onSelectRef = React.useRef(onPlanetSelect);
  onSelectRef.current = onPlanetSelect;

  // Initialize map + build all layers once planet data arrives
  React.useEffect(function() {
    if (!planets.length || !mapRef.current) return;
    if (leafletMap.current) return; // already initialized

    var map = L.map(mapRef.current, {
      crs: L.CRS.Simple,
      preferCanvas: true,
      minZoom: -3,
      maxZoom: 2,
      zoom: -1,
      center: [0, 0],
      zoomControl: false,
      attributionControl: false,
      maxBounds: MAP_MAX_BOUNDS,
      maxBoundsViscosity: 1.0
    });

    // Create panes for z-ordering
    // B-1139 (D-406 item 18): the galaxy art gets its own pane UNDER the lanes (200), grid (250) and names (300/350);
    // in Leaflet's overlay pane (400) it painted over all of them.
    map.createPane('artPane');         map.getPane('artPane').style.zIndex = 150; map.getPane('artPane').style.pointerEvents = 'none';
    map.createPane('routePane');       map.getPane('routePane').style.zIndex = 200; map.getPane('routePane').style.pointerEvents = 'none';
    map.createPane('regionLabelPane'); map.getPane('regionLabelPane').style.zIndex = 300; map.getPane('regionLabelPane').style.pointerEvents = 'none';
    map.createPane('routeLabelPane');  map.getPane('routeLabelPane').style.zIndex = 350; map.getPane('routeLabelPane').style.pointerEvents = 'none';
    map.createPane('navDotPane');      map.getPane('navDotPane').style.zIndex = 400;
    // F-5: pin badges sit above every node layer and take no pointer events — the node marker
    // underneath still owns the tap.
    map.createPane('pinPane');         map.getPane('pinPane').style.zIndex = 470; map.getPane('pinPane').style.pointerEvents = 'none';

    leafletMap.current = map;

    var imageOverlay = L.imageOverlay('public/Assets/galaxy_map.png', GALAXY_IMAGE_BOUNDS, { opacity: 0.85, zIndex: 100, interactive: false, pane: 'artPane' });
    imageOverlay.addTo(map);

    // UXQP-40: clamp the zoom floor to the artwork so far zoom can't letterbox
    // the galaxy into dead black. The floor is the largest integer zoom at which
    // the whole galaxy image still fits one screenful (getBoundsZoom). Guarded so
    // a bad measurement can never raise the floor above the default view (-1).
    var floorZoom = map.getBoundsZoom(L.latLngBounds(GALAXY_IMAGE_BOUNDS), false);
    if (isFinite(floorZoom)) { map.setMinZoom(Math.min(floorZoom, -1)); }

    if (onMapReady) onMapReady(map);

    var onSelect = onPlanetSelect || function() {};
    var planetByName = {};
    planets.forEach(function(p) { planetByName[p.name] = p; });

    // Reset label collision tracking
    _resetLabelTracking();

    // ── Tier sorting ──
    var tier1Planets = planets.filter(function(p) { return TIER_1_PLANETS.indexOf(p.name) >= 0; });
    var tier2Planets = planets.filter(function(p) { return p.record_depth === 'full' && TIER_1_PLANETS.indexOf(p.name) < 0; });
    var tier3Planets = planets.filter(function(p) { return p.record_depth === 'identity'; });
    var tier4Planets = planets.filter(function(p) { return !p.record_depth || p.record_depth === 'navigation' || p.record_depth === null; });

    // ── Build tier layers ──
    var tier1Layer = L.layerGroup();
    var tier2Layer = L.layerGroup();
    var tier3Layer = L.layerGroup();
    var tier4Layer = L.layerGroup();

    // R-MAP1: cluster-aware placement. A cluster representative is built normally in
    // its tier (and gets its marker captured so its label can carry "+N" at low zoom);
    // a LABELED member is diverted into clusterMembersLayer so it stays hidden until the
    // separation zoom. Navigation-depth members need no diversion — they only paint as
    // tier-4 dots, which already reveal at that same zoom.
    var clusterIdx = _buildClusterIndex();
    var clusterMembersLayer = L.layerGroup();
    var repRefs = [];
    function placeTier(p, layer, iconic) {
      var info = clusterIdx[p.name];
      if (info && info.role === 'member') {
        _addPlanetMarker(p, clusterMembersLayer, true, onSelect, iconic);
        return;
      }
      var m = _addPlanetMarker(p, layer, true, onSelect, iconic);
      if (info && info.role === 'rep') repRefs.push({ marker: m, base: info.base, hidden: info.hidden });
    }

    tier1Planets.forEach(function(p) { placeTier(p, tier1Layer, true); });
    tier2Planets.forEach(function(p) { placeTier(p, tier2Layer, false); });
    tier3Planets.forEach(function(p) { placeTier(p, tier3Layer, false); });

    // Tier 4 label planets — notable nav-only planets that get visible labels at zoom 1+
    var tier4LabelsLayer = L.layerGroup();
    var tier4LabelSet = {};
    TIER_4_LABEL_PLANETS.forEach(function(n) { tier4LabelSet[n] = true; });

    tier4Planets.forEach(function(p) {
      // Visible canvas dot — non-interactive; the hit ring below handles taps.
      // UXQP-41: brighter/larger so nav dots don't vanish against the beige art
      // smear at close zoom (the dark-stage ramp below also helps them read).
      var m = L.circleMarker([p.y, p.x], {
        radius: 2.5, color: 'rgba(205,225,245,0.6)', fillColor: 'rgba(205,225,245,0.6)',
        fillOpacity: 1, weight: 0, interactive: false, pane: 'navDotPane'
      });
      m.addTo(tier4Layer);

      // Invisible 44px canvas hit ring — gives the 4px visible dot a real
      // touch target without paying the DOM cost of 2,000 divIcons.
      // B-1140 / B-1155 (R-UMP-7 a): radius 18 (a 36px ring) → 22, the 44px floor; transparent, so nothing drawn moves.
      var hit = L.circleMarker([p.y, p.x], {
        radius: 22, stroke: false, fill: true,
        fillColor: '#000', fillOpacity: 0,
        interactive: true, pane: 'navDotPane'
      });
      hit.bindTooltip(p.name, { className: 'galaxy-label', direction: 'right', offset: [4, 0], permanent: false, sticky: false });
      hit.on('click', function() { onSelect(p); });
      hit.addTo(tier4Layer);

      // Add permanent label marker for notable nav planets
      if (tier4LabelSet[p.name]) {
        // UXQP-41: nav-tier labels up from 8px + a halo so they read against the
        // beige art at close zoom instead of dissolving into it.
        var labelIcon = L.divIcon({
          html: '<div style="font-family:\'Orbitron\',monospace;font-size:10px;color:rgba(205,225,245,0.78);white-space:nowrap;pointer-events:none;user-select:none;letter-spacing:0.04em;text-shadow:0 0 4px rgba(0,0,0,0.95),0 1px 3px rgba(0,0,0,0.92)">' + p.name + '</div>',
          className: '', iconSize: [80, 10], iconAnchor: [-4, 5]
        });
        L.marker([p.y, p.x], { icon: labelIcon, interactive: false }).addTo(tier4LabelsLayer);
      }
    });

    // ── Route lines (always visible) ──
    var routeGroup = L.layerGroup();
    routes.forEach(function(route) {
      var isMajor = route.lane_quality === 'well_traveled';
      var coords = route.waypoints.map(function(n) { return planetByName[n]; }).filter(Boolean).map(function(p) { return [p.y, p.x]; });
      if (coords.length < 2) return;

      if (isMajor) {
        L.polyline(coords, { pane: 'routePane', color: 'rgba(207,234,242,0.15)', weight: 16, interactive: false }).addTo(routeGroup);
        L.polyline(coords, { pane: 'routePane', color: 'rgba(182,218,227,0.25)', weight: 8, interactive: false }).addTo(routeGroup);
        L.polyline(coords, { pane: 'routePane', color: 'rgba(182,218,227,0.5)', weight: 4, interactive: false }).addTo(routeGroup);
        L.polyline(coords, { pane: 'routePane', color: '#cfeaf2', weight: 1.5, interactive: false }).addTo(routeGroup);
      } else {
        L.polyline(coords, { pane: 'routePane', color: 'rgba(215,236,240,0.1)', weight: 4, interactive: false }).addTo(routeGroup);
        L.polyline(coords, { pane: 'routePane', color: 'rgba(215,236,240,0.2)', weight: 2, interactive: false }).addTo(routeGroup);
        L.polyline(coords, { pane: 'routePane', color: '#D7ECF0', weight: 0.8, interactive: false }).addTo(routeGroup);
      }
    });
    routeGroup.addTo(map);

    // ── Route name labels + region watermarks ──
    var routeLabelsLayer = _buildRouteLabelLayer(routes, planets);
    var regionLabelsLayer = _buildRegionLabelLayer(planets);

    // ── Add tier 1 (always on) ──
    tier1Layer.addTo(map);

    // ── Store refs ──
    var allLayers = {
      tier1: tier1Layer, tier2: tier2Layer, tier3: tier3Layer, tier4: tier4Layer,
      tier4Labels: tier4LabelsLayer, clusterMembers: clusterMembersLayer,
      routes: routeGroup, routeLabels: routeLabelsLayer, regionLabels: regionLabelsLayer
    };
    layersRef.current = allLayers;

    // R-MAP1: swap each cluster representative's label between plain name and
    // "name +N" as we cross the separation zoom.
    function applyClusterLabels(zoom) {
      var collapsed = zoom < CLUSTER_SEPARATION_ZOOM;
      repRefs.forEach(function(r) {
        if (!r.marker || !r.marker.getTooltip()) return;
        r.marker.setTooltipContent(collapsed
          ? r.base + ' <span style="opacity:0.62;font-weight:400">+' + r.hidden + '</span>'
          : r.base);
      });
    }

    // ── Apply initial zoom tiers + dark-stage opacity ──
    _applyZoomTiers(map, map.getZoom(), allLayers);
    applyClusterLabels(map.getZoom());
    imageOverlay.setOpacity(_stageOpacity(map.getZoom()));
    _placeNameBoxes(map);

    // ── Listen for zoom changes ──
    function onZoomEnd() {
      // F-5: while the PINNED filter is on, the tier machinery must not re-add what it hid.
      if (!pinnedOnlyRef.current) _applyZoomTiers(map, map.getZoom(), allLayers);
      applyClusterLabels(map.getZoom());
      imageOverlay.setOpacity(_stageOpacity(map.getZoom()));
      _placeNameBoxes(map);
    }
    map.on('zoomend', onZoomEnd);

    return function() {
      map.off('zoomend', onZoomEnd);
      map.remove();
      leafletMap.current = null;
      layersRef.current = null;
      pinLayerRef.current = null;
      pinnedOnlyLayerRef.current = null;
    };
  }, [planets, routes]);

  // ── F-5: the pin badges ──────────────────────────────────────────────────────────────────────
  // Rebuilt from scratch on every pin change. A handful of markers, so a clear-and-redraw is
  // cheaper to hold in the head than a diff — and it cannot leak a badge for an unpinned world.
  //
  // A pinned id that does not resolve to a planet in this dataset RENDERS NOTHING and is simply
  // skipped here. That is the whole of the "unknown ids are graceful" contract on the view side:
  // the store keeps the entry, the map draws no badge, nothing errors.
  React.useEffect(function() {
    var map = leafletMap.current;
    if (!map || !planets.length) return;
    if (!pinLayerRef.current) pinLayerRef.current = L.layerGroup().addTo(map);
    var layer = pinLayerRef.current;
    layer.clearLayers();

    var byId = {};
    planets.forEach(function(p) { byId[_pinKey(p)] = p; });

    pinnedIds.forEach(function(id) {
      var p = byId[id];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
      L.marker([p.y, p.x], { icon: _pinBadgeIcon(accent), pane: 'pinPane', interactive: false }).addTo(layer);
    });
  }, [pinnedSig, planets, accent]);

  // ── F-5: the PINNED filter ───────────────────────────────────────────────────────────────────
  // ON  — pull the node layers off the map and add a pinned-only layer built the SAME way the tiers
  //       are (`_addPlanetMarker`), so a pinned world looks and taps identically in both views.
  // OFF — drop that layer and hand the map back to the zoom-tier machinery untouched.
  // Route lines, route labels and the grid are never in the hidden set (concept §3).
  React.useEffect(function() {
    var map = leafletMap.current;
    var layers = layersRef.current;
    pinnedOnlyRef.current = pinnedOnly;
    if (!map || !layers) return;

    if (pinnedOnlyLayerRef.current) {
      try { map.removeLayer(pinnedOnlyLayerRef.current); } catch (e) {}
      pinnedOnlyLayerRef.current = null;
    }

    if (pinnedOnly) {
      PINNED_HIDE_LAYERS.forEach(function(k) {
        if (layers[k] && map.hasLayer(layers[k])) map.removeLayer(layers[k]);
      });
      var pinSet = {};
      pinnedIds.forEach(function(id) { pinSet[id] = true; });
      var lg = L.layerGroup();
      // Label collision tracking is module-global and append-only. Give the pinned-only layer its
      // own context and hand the tiers' back: without this, every toggle of the filter would grow
      // `_placedLabels` forever and slowly poison the real map's label placement.
      var savedLabels = _placedLabels;
      _resetLabelTracking();
      planets.forEach(function(p) {
        if (!pinSet[_pinKey(p)]) return;
        _addPlanetMarker(p, lg, true, function(pl) {
          if (onSelectRef.current) onSelectRef.current(pl);
        }, TIER_1_PLANETS.indexOf(p.name) >= 0);
      });
      _placedLabels = savedLabels;
      lg.addTo(map);
      pinnedOnlyLayerRef.current = lg;
    } else {
      // tier1 is always-on and is NOT managed by _applyZoomTiers — restore it by hand.
      if (layers.tier1 && !map.hasLayer(layers.tier1)) map.addLayer(layers.tier1);
      _applyZoomTiers(map, map.getZoom(), layers);
    }
    _placeNameBoxes(map);
  }, [pinnedOnly, pinnedSig, planets]);

  // FFG Grid overlay
  React.useEffect(function() {
    if (!leafletMap.current || !planets.length) return;
    if (gridLayerRef.current) { leafletMap.current.removeLayer(gridLayerRef.current); gridLayerRef.current = null; }
    if (!showGrid) return;

    var map = leafletMap.current;
    var bounds = GmGridRef.deriveGridBounds(planets);

    if (!map.getPane('gridOverlay')) {
      map.createPane('gridOverlay');
      map.getPane('gridOverlay').style.zIndex = 250;
      map.getPane('gridOverlay').style.pointerEvents = 'none';
    }

    var gridGroup = L.layerGroup([], { pane: 'gridOverlay' });
    for (var col = 0; col <= bounds.cols; col++) {
      var x = bounds.minX + col * bounds.cellW;
      L.polyline([[bounds.maxY, x], [bounds.minY, x]], { color: '#C8962D', opacity: 0.75, weight: 1, interactive: false, pane: 'gridOverlay' }).addTo(gridGroup);
    }
    for (var row = 0; row <= bounds.rows; row++) {
      var y = bounds.maxY - row * bounds.cellH;
      L.polyline([[y, bounds.minX], [y, bounds.maxX]], { color: '#C8962D', opacity: 0.75, weight: 1, interactive: false, pane: 'gridOverlay' }).addTo(gridGroup);
    }
    for (var c = 0; c < bounds.cols; c++) {
      for (var r = 0; r < bounds.rows; r++) {
        var cx = bounds.minX + (c + 0.5) * bounds.cellW;
        var cy = bounds.maxY - (r + 0.5) * bounds.cellH;
        var label = String.fromCharCode(65 + c) + '-' + (r + 1);
        var labelIcon = L.divIcon({
          html: '<div style="font-family:\'Orbitron\',monospace;font-size:14px;color:rgba(220,170,50,0.9);white-space:nowrap;pointer-events:none;user-select:none;letter-spacing:0.08em;text-shadow:0 0 8px rgba(200,150,45,0.6),0 0 16px rgba(200,150,45,0.3)">' + label + '</div>',
          className: '', iconSize: [50, 20], iconAnchor: [25, 10]
        });
        L.marker([cy, cx], { icon: labelIcon, interactive: false, pane: 'gridOverlay' }).addTo(gridGroup);
      }
    }
    gridGroup.addTo(map);
    gridLayerRef.current = gridGroup;
  }, [showGrid, planets]);

  return React.createElement('div', { ref: mapRef, style: { position: 'absolute', inset: 0, background: '#050810' } });
}
