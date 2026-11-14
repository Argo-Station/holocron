/* lib/store/shelfStore.js — STORE-UNIFY GM face: THE SHELVES (named saved stock lists) + the
 * location resolver (planet → RAW world-circumstance + trade lane).
 *
 * THE SHELVES replace the player face's counter/holds for the GM: named lists of item id-refs
 * ("what this planet's market carries"), prepped away from the table and read at it. id-refs ONLY
 * (§8 law) — find-difficulty recomputes at render from the item's rarity + the active location
 * modifier, never persisted. Key: swrpg_store_shelves_v1 (GM-private; separate from the player
 * cart/holds keys). One-time non-destructive migration from the retired swrpg_session_store_config
 * savedShops (D-SU1).
 *
 * THE LOCATION RESOLVER: a planet (from the 2,077-record registry) → its galaxy region → the RAW
 * Table 5-2 world-circumstance (via window.SWRPGRarity), plus primary-trade-lane detection from the
 * great hyperlanes (gdr_routes_final.json, lane_quality 'well_traveled' — RAW "primary trade lane";
 * minor spurs don't qualify). Transplanted + RAW-mapped from the dying generator's region math.
 *
 * Classic script (no framework) → window.SWRPGShelves; loaded before the store view (GM only needs
 * it; the player face never touches it).
 */
(function (global) {
  'use strict';

  var SHELVES_KEY = 'swrpg_store_shelves_v1';
  var LEGACY_CONFIG_KEY = 'swrpg_session_store_config';   // D-SU1 migration source (read-only)

  // ── shelves persistence ──────────────────────────────────────────────────────
  function loadState() {
    try {
      var raw = localStorage.getItem(SHELVES_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (s && Array.isArray(s.shelves)) return s;
    } catch (e) {}
    return migrateOrEmpty();
  }
  function saveState(s) {
    try { localStorage.setItem(SHELVES_KEY, JSON.stringify(s)); } catch (e) {}
  }
  // D-SU1: one-time, non-destructive import of the retired GM store's savedShops[] into Shelves.
  // savedShops[].curatedItems[].key = the canonical id → Shelf.items[]. The old config key is left
  // untouched as a backup; a missing/empty legacy config just starts clean.
  function migrateOrEmpty() {
    var out = { shelves: [], activeId: null, _migrated: true };
    try {
      var raw = localStorage.getItem(LEGACY_CONFIG_KEY);
      var cfg = raw ? JSON.parse(raw) : null;
      var saved = cfg && Array.isArray(cfg.savedShops) ? cfg.savedShops : [];
      saved.forEach(function (shop) {
        var items = (shop.curatedItems || []).map(function (it) { return it.key || it.id; }).filter(Boolean);
        out.shelves.push({
          id: shop.id || ('shelf_' + out.shelves.length),
          name: shop.name || 'Imported shop',
          items: items,
          note: (shop.shopMeta && shop.shopMeta.planet) ? ('from ' + shop.shopMeta.planet) : '',
          createdAt: shop.savedAt || 0,
        });
      });
      if (out.shelves.length) out.activeId = out.shelves[0].id;
    } catch (e) {}
    saveState(out);
    return out;
  }

  // ── THE MARKET, REMEMBERED (PAPER N5 wave A2, B-1125; ruling `gm-own-screens-concept` R-GOS-30, D-76 "Yes,
  //    remember") ───────────────────────────────────────────────────────────────────────────────────────────────────
  // ONE global record per device — the market is the GM's, not a shelf's. IDENTITY ONLY, never the derived numbers
  // (PRAXIS §5, resolve-at-render): { v: 1, kind: 'world' | 'circumstance', name, region, sector, circumstanceId,
  // tradeLane }. NOT stored: `mod` (re-derived by SWRPGRarity.locationModifier), `routeName` (re-read from the routes
  // registry by name once it is loaded), `circumstance` (re-read from rarity.js by id). A record whose `v` is not 1,
  // or whose circumstanceId no rarity.js row carries, degrades to UNSET (null) — never a guessed modifier (`shopFor`'s
  // idiom, R-SPC-3). A sibling key: swrpg_store_shelves_v1 is untouched. The GM face alone reads and writes it.
  var MARKET_KEY = 'swrpg_store_market_v1';
  function saveMarket(m) {
    if (!m || !m.circumstance) return;
    try {
      localStorage.setItem(MARKET_KEY, JSON.stringify({
        v: 1,
        kind: m.kind === 'circumstance' ? 'circumstance' : 'world',
        name: m.name,
        region: m.region == null ? null : m.region,
        sector: m.sector == null ? null : m.sector,
        circumstanceId: m.circumstance.id,
        tradeLane: !!m.tradeLane,
      }));
    } catch (e) {}
  }
  function loadMarket() {
    var R = global.SWRPGRarity;
    try {
      var m = JSON.parse(localStorage.getItem(MARKET_KEY) || 'null');
      if (!m || m.v !== 1 || !R || !m.name || (m.kind !== 'world' && m.kind !== 'circumstance')) return null;
      var rows = [R.NEUTRAL_CIRCUMSTANCE].concat(R.LOCATION_MODIFIERS || []);
      var circ = null;
      for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id === m.circumstanceId) circ = rows[i];
      if (!circ) return null;   // an id rarity.js does not carry → UNSET, never `circumstanceById`'s neutral fallback
      var lane = !!m.tradeLane;
      return {
        kind: m.kind, name: String(m.name), region: m.region || null, sector: m.sector || null,
        circumstance: circ, tradeLane: lane,
        routeName: (m.kind === 'world' && _laneRoute) ? (_laneRoute[String(m.name).toLowerCase()] || null) : null,
        mod: R.locationModifier ? R.locationModifier(circ, lane) : circ.mod,
      };
    } catch (e) { return null; }
  }

  // ── location resolver (planets + hyperlanes) ─────────────────────────────────
  var _planets = null, _laneSet = null, _laneRoute = null, _loadPromise = null;
  function seq(n) { return 'p' + n; }
  function loadLocationData() {
    if (_planets) return Promise.resolve();
    if (_loadPromise) return _loadPromise;
    _loadPromise = Promise.all([
      fetch('public/data/gdr_planets_mapped.json').then(function (r) { return r.ok ? r.json() : []; }),
      fetch('public/data/gdr_routes_final.json').then(function (r) { return r.ok ? r.json() : []; }),
    ]).then(function (res) {
      _planets = (res[0] || []).filter(function (p) { return p && p.name; });
      _laneSet = {};       // primary-trade-lane planet names (lowercased) → true
      _laneRoute = {};     // planet name (lowercased) → the great-hyperlane route name
      (res[1] || []).forEach(function (route) {
        if (route.lane_quality !== 'well_traveled') return;   // RAW "primary trade lane" = the great hyperlanes
        (route.waypoints || []).forEach(function (wp) {
          var k = String(wp).toLowerCase();
          _laneSet[k] = true;
          if (!_laneRoute[k]) _laneRoute[k] = route.name;
        });
      });
    }).catch(function () { _planets = []; _laneSet = {}; _laneRoute = {}; });
    return _loadPromise;
  }

  function resolvePlanet(planet) {
    var R = global.SWRPGRarity || {};
    var name = (planet && planet.name) || String(planet || '');
    var region = planet && planet.region;
    var circ = R.circumstanceForRegion ? R.circumstanceForRegion(region) : { id: 'settled', label: 'Settled space', mod: 0 };
    var laneKey = name.toLowerCase();
    var onLane = !!(_laneSet && _laneSet[laneKey]);
    return {
      name: name,
      region: region || null,
      sector: (planet && planet.sector) || null,
      circumstance: circ,
      tradeLane: onLane,
      routeName: (_laneRoute && _laneRoute[laneKey]) || null,
      mod: R.locationModifier ? R.locationModifier(circ, onLane) : circ.mod,
    };
  }

  function searchPlanets(query, limit) {
    if (!_planets) return [];
    var q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    var starts = [], contains = [];
    for (var i = 0; i < _planets.length && (starts.length + contains.length) < 60; i++) {
      var nm = _planets[i].name.toLowerCase();
      if (nm.indexOf(q) === 0) starts.push(_planets[i]);
      else if (nm.indexOf(q) > 0) contains.push(_planets[i]);
    }
    return starts.concat(contains).slice(0, limit || 8).map(resolvePlanet);
  }

  global.SWRPGShelves = {
    loadState: loadState,
    saveState: saveState,
    loadLocationData: loadLocationData,
    resolvePlanet: resolvePlanet,
    searchPlanets: searchPlanets,
    SHELVES_KEY: SHELVES_KEY,
    loadMarket: loadMarket,
    saveMarket: saveMarket,
    MARKET_KEY: MARKET_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
