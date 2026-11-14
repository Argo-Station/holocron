/**
 * VehicleLibraryController.js — React hook for the sharded vehicle library.
 *
 * Loads public/data/vehicle-library/ (index.json + taxonomy.json + 9 category
 * shards) in parallel, exposes lookup + filter helpers, and manages GM
 * affiliation overrides via localStorage (key: swrpg_gm_vehicle_overrides).
 *
 * Mirrors lib/npc/NpcGeneratorController.js — simpler since vehicles are
 * pure reference data with no per-character state, no history, no editing
 * beyond affiliation overrides.
 *
 * Library spec: Docs/VEHICLE_LIBRARY_SPEC.md
 * ETL: scripts/build_vehicle_library.py
 */

var VEHICLE_SHARDS = [
  'starfighters', 'freighters', 'capital_ships', 'transports',
  'patrol_gunships', 'airspeeders', 'landspeeders', 'walkers_tanks', 'support'
];

var VEHICLE_OVERRIDES_KEY = 'swrpg_gm_vehicle_overrides';

// One-time cache-bust query param. The earlier _headers policy marked
// /public/data/*.json as 1-year immutable, which silently froze the
// vehicle library in returning users' browsers (see _headers and
// Docs/DATA_INVENTORY.md "Migration Notes"). The header is now short-
// cache + must-revalidate, but browsers that already cached the
// immutable response will not re-fetch unless the URL changes. Bump
// this value when the vehicle data shape changes in a way that
// requires breaking those frozen caches out.
var VEHICLE_CACHE_VERSION = '2026-05-25a';


function useVehicleLibraryController() {
  var _React = React;
  var useState = _React.useState;
  var useCallback = _React.useCallback;
  var useMemo = _React.useMemo;
  var useEffect = _React.useEffect;

  var _useState1 = useState(null);
  var libraryIndex = _useState1[0];
  var setLibraryIndex = _useState1[1];

  var _useState2 = useState(null);
  var taxonomy = _useState2[0];
  var setTaxonomy = _useState2[1];

  var _useState3 = useState({});
  var vehiclesByShard = _useState3[0];
  var setVehiclesByShard = _useState3[1];

  var _useState4 = useState(true);
  var loading = _useState4[0];
  var setLoading = _useState4[1];

  var _useState5 = useState(null);
  var error = _useState5[0];
  var setError = _useState5[1];

  // ── Load library on mount ──────────────────────────────────────────────
  // Fetches index.json + taxonomy.json + 9 shard files in parallel. (The
  // archive image manifest is retired: a ship with no picture of its
  // owner's draws its identifier, D-196.) Mirrors the NPC library load pattern at
  // NpcGeneratorController.js:230.
  useEffect(function() {
    var baseUrl = 'public/data/vehicle-library/';
    var bust = '?v=' + VEHICLE_CACHE_VERSION;
    var shardFetches = VEHICLE_SHARDS.map(function(slug) {
      return fetch(baseUrl + slug + '.json' + bust).then(function(r) { return r.json(); });
    });
    Promise.all([
      fetch(baseUrl + 'index.json' + bust).then(function(r) { return r.json(); }),
      fetch(baseUrl + 'taxonomy.json' + bust).then(function(r) { return r.json(); }),
    ].concat(shardFetches)).then(function(results) {
      var idx = results[0];
      var tax = results[1];
      var byShard = {};
      VEHICLE_SHARDS.forEach(function(slug, i) {
        var content = results[2 + i];
        byShard[slug] = (content && content.entries) || [];
      });
      setLibraryIndex(idx);
      setTaxonomy(tax);
      setVehiclesByShard(byShard);
      setLoading(false);
    }).catch(function(err) {
      console.warn('[VehicleLibraryController] Failed to load vehicle library:', err);
      setError(err);
      setLoading(false);
    });
  }, []);

  // ── Flat list of all vehicles across shards ────────────────────────────
  var allVehicles = useMemo(function() {
    var all = [];
    VEHICLE_SHARDS.forEach(function(slug) {
      var entries = vehiclesByShard[slug] || [];
      for (var i = 0; i < entries.length; i++) all.push(entries[i]);
    });
    return all;
  }, [vehiclesByShard]);

  // ── Lookup by canonical key (oggdude Key field, e.g. 'T65BXWING') ──────
  var getVehicleByKey = useCallback(function(key) {
    if (!key) return null;
    for (var i = 0; i < allVehicles.length; i++) {
      if (allVehicles[i].key === key) return allVehicles[i];
    }
    return null;
  }, [allVehicles]);

  // ── Affiliation overrides (localStorage-backed per spec Q2 lock) ───────
  // Schema: { [vehicleKey]: { affiliation: 'rebellion' | ... } }
  // Future GM overrides (rename, hardpoint state) slot into the same
  // value object alongside `affiliation`.
  // B-1732: read at the act, a landing redraws (lib/shared/heldStore.js).
  var heldOverrides = window.SWRPGHeldStore.use({ key: VEHICLE_OVERRIDES_KEY,
    load: function() {
      try {
        var raw = localStorage.getItem(VEHICLE_OVERRIDES_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    },
    persist: function(next) { try { localStorage.setItem(VEHICLE_OVERRIDES_KEY, JSON.stringify(next)); } catch (e) {} },
  });
  var overrides = heldOverrides.state;

  var setAffiliationOverride = useCallback(function(vehicleKey, affiliation) {
    if (!vehicleKey) return;
    heldOverrides.apply(function(prev) {
      var next = Object.assign({}, prev);
      if (affiliation) {
        next[vehicleKey] = Object.assign({}, next[vehicleKey] || {}, { affiliation: affiliation });
      } else if (next[vehicleKey]) {
        var copy = Object.assign({}, next[vehicleKey]);
        delete copy.affiliation;
        if (Object.keys(copy).length === 0) {
          delete next[vehicleKey];
        } else {
          next[vehicleKey] = copy;
        }
      }
      return next;
    });
  }, []);

  var getEffectiveAffiliation = useCallback(function(vehicle) {
    if (!vehicle) return null;
    var override = overrides[vehicle.key];
    return (override && override.affiliation) || vehicle.affiliation || null;
  }, [overrides]);

  return {
    loading: loading,
    error: error,
    libraryIndex: libraryIndex,
    taxonomy: taxonomy,
    vehiclesByShard: vehiclesByShard,
    allVehicles: allVehicles,
    getVehicleByKey: getVehicleByKey,
    overrides: overrides,
    setAffiliationOverride: setAffiliationOverride,
    getEffectiveAffiliation: getEffectiveAffiliation,
  };
}
