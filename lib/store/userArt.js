/* lib/store/userArt.js — BYOA ("bring your own art", ruling art-byoa-scope): user-supplied item
 * images, stored on-device, rendered as the TOP rung of the store's art ladder.
 *
 * THE LADDER (R-ITM6, now three rungs): USER IMAGE (IndexedDB) → repo art (manifest, empty in
 * prod) → silhouette glyph. Absence at any rung falls through; never a broken image.
 *
 * THE FENCE (R-BYOA2): this rung is prod-safe + repo-invisible BY CONSTRUCTION — images live only
 * in IndexedDB (`swrpg_user_art`), per-browser, never a file tree, never a manifest edit, nothing
 * committable. The app ships NO art and fetches NO art; it renders what the user gives it.
 *
 * THE MATCHER (R-BYOA1 — never guesses): filenames map to items by BOTH keys we carry — the
 * canonical id (`vibro_ax.webp`) AND the OggDude source key (`Weapon12DEFEND.png` → strip
 * Weapon/Armor/Gear prefix, case-fold, drop extension → `_source_key` '12DEFEND'). Only exact
 * normalized matches import; everything else lands in the import report's unmatched list.
 *
 * K7 · A SHIP'S DECK PLANS share this database under their own keyspace (SHIP YARD S4 JOB 3a; ruling
 * `shipyard-s3-contracts` R-S3K-5 K7): `vessel:<vesselId>:deck:<deckId>` → the plan's blob. A deck record carries that
 * key in `decks[].art` and the plan itself never leaves the device (S5's "THE PLAN IS ON ANOTHER DEVICE"). ITEM ART is
 * every key WITHOUT a colon: `count()`, `ids()` and `clearAll()` read and clear item art only, so the store's count and
 * its CLEAR ALL never touch a plan; `listPrefix(prefix)` lists a keyspace (a ship's decks). Canonical item ids carry no
 * colon, and the matcher only ever returns one, so a filename can never import onto a plan's key.
 *
 * Classic script (no JSX) → window.SWRPGUserArt; loaded before the store view.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'swrpg_user_art';
  var STORE = 'images';
  var DB_VERSION = 1;

  var _db = null;
  var _ids = null;              // Set<canonicalId> — loaded once, kept in sync (sync hasArt)
  var _urls = {};              // id → objectURL cache (revoked on remove/clear)
  var _maps = null;            // { idNorm:{norm→id}, skNorm:{norm→id} } from the registries
  var _readyPromise = null;
  var _listeners = [];

  // ── normalization (both key schemes fold to lowercase-alphanumeric) ──────────
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  // K7: a key with a colon is a keyspace entry (a ship's deck plan), never item art
  function isItemKey(k) { return String(k).indexOf(':') === -1; }
  function vesselPrefix(vesselId) { return 'vessel:' + String(vesselId) + ':'; }   // every key one ship keeps here
  function deckKey(vesselId, deckId) { return vesselPrefix(vesselId) + 'deck:' + String(deckId); }
  function basename(name) { return String(name || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, ''); }

  // ── IndexedDB plumbing (promise-wrapped; no dependency) ──────────────────────
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  // ── registry maps for the matcher (fetch-once; shares the store's cache shape) ─
  function loadMaps() {
    if (_maps) return Promise.resolve(_maps);
    // F-100 UD-1f (H6): re-pointed to THE ONE items loader (lib/shared/itemRegistries.js) — this was
    // a third fetch of the same registries.
    var got = global.SWRPGItemRegistries.load();
    return got.then(function (regs) {
      regs = regs || { weapons: {}, armor: {}, gear: {} };
      var idNorm = {}, skNorm = {};
      ['weapons', 'armor', 'gear'].forEach(function (sec) {
        Object.keys(regs[sec] || {}).forEach(function (id) {
          var rec = regs[sec][id];
          idNorm[norm(id)] = id;                              // vibro_ax → vibroax
          if (rec._source_key) skNorm[norm(rec._source_key)] = id;  // 12DEFEND → 12defend
        });
      });
      _maps = { idNorm: idNorm, skNorm: skNorm };
      return _maps;
    });
  }

  // ── ready: open db + load the id-set + build the maps ────────────────────────
  function ready() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = Promise.all([
      tx('readonly', function (store) {
        var out = {};
        var req = store.getAllKeys();
        req.onsuccess = function () { out.result = req.result; };
        return out;
      }),
      loadMaps(),
    ]).then(function (r) {
      _ids = new Set(r[0] || []);
      return null;
    }).catch(function (e) {
      console.warn('[userArt] init failed:', e);
      _ids = new Set();
      return null;
    });
    return _readyPromise;
  }

  function notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // ── the matcher (R-BYOA1): filename → canonical id, or null (never guesses) ───
  function resolveFilename(name) {
    if (!_maps) return null;
    var base = basename(name);
    var n1 = norm(base);
    if (_maps.idNorm[n1]) return _maps.idNorm[n1];            // canonical id scheme
    var stripped = base.replace(/^(weapon|armor|gear)/i, '');  // OggDude Weapon/Armor/Gear prefix
    var n2 = norm(stripped);
    if (_maps.skNorm[n2]) return _maps.skNorm[n2];            // source-key scheme (prefixed)
    if (_maps.skNorm[n1]) return _maps.skNorm[n1];            // source-key scheme (bare)
    return null;
  }

  // ── reads ────────────────────────────────────────────────────────────────────
  function hasArt(id) { return !!(_ids && _ids.has(id)); }
  function ids() { return _ids ? Array.from(_ids).filter(isItemKey) : []; }      // item art only (K7)
  function count() { return ids().length; }
  function listPrefix(prefix) { var p = String(prefix); return _ids ? Array.from(_ids).filter(function (k) { return String(k).indexOf(p) === 0; }) : []; }

  function getUrl(id) {
    if (!hasArt(id)) return Promise.resolve(null);
    if (_urls[id]) return Promise.resolve(_urls[id]);
    return tx('readonly', function (store) {
      var out = {};
      var req = store.get(id);
      req.onsuccess = function () { out.result = req.result; };
      return out;
    }).then(function (blob) {
      if (!blob) return null;
      _urls[id] = URL.createObjectURL(blob);
      return _urls[id];
    }).catch(function () { return null; });
  }

  // ── writes ────────────────────────────────────────────────────────────────────
  function put(id, blob) {
    return tx('readwrite', function (store) { store.put(blob, id); }).then(function () {
      _ids.add(id);
      if (_urls[id]) { URL.revokeObjectURL(_urls[id]); delete _urls[id]; }  // force fresh objectURL
    });
  }

  function setOne(id, file) {
    return ready().then(function () { return put(id, file); }).then(function () { notify(); });
  }

  // K7 · R-S4SH-1: remove a whole keyspace — a DELETED ship's plans ("vessel delete removes their blobs; retire keeps
  // them", shipyard-s3-contracts K7). A prefix without a colon is refused (0), so item art can never go this way.
  function removePrefix(prefix) {
    var p = String(prefix || '');
    if (p.indexOf(':') === -1) return Promise.resolve(0);
    return ready().then(function () {
      var gone = listPrefix(p);
      if (!gone.length) return 0;
      return tx('readwrite', function (store) { gone.forEach(function (k) { store.delete(k); }); }).then(function () {
        gone.forEach(function (k) { _ids.delete(k); if (_urls[k]) { URL.revokeObjectURL(_urls[k]); delete _urls[k]; } });
        notify();
        return gone.length;
      });
    });
  }

  function removeOne(id) {
    return ready().then(function () {
      return tx('readwrite', function (store) { store.delete(id); });
    }).then(function () {
      _ids.delete(id);
      if (_urls[id]) { URL.revokeObjectURL(_urls[id]); delete _urls[id]; }
      notify();
    });
  }

  // item art only (K7): a ship's deck plans are the player's too, and the store's CLEAR ALL is about item art
  function clearAll() {
    var gone = [];
    return ready().then(function () {
      gone = ids();
      return tx('readwrite', function (store) { gone.forEach(function (k) { store.delete(k); }); });
    }).then(function () {
      gone.forEach(function (k) {
        _ids.delete(k);
        if (_urls[k]) { URL.revokeObjectURL(_urls[k]); delete _urls[k]; }
      });
      notify();
    });
  }

  // ── batch import: match each file, store matched blobs, return an HONEST report ─
  // R-BYOA1: only exact-normalized matches import; unmatched files are LISTED, never dropped
  // silently, never guessed onto a nearby item.
  // B-1258: a file that will not decode as an image is left out exactly as a non-image file already is, through the
  // ONE check every picker calls (lib/shared/picture.js `check`, loaded before this file in both hosts).
  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return /^image\//.test(f.type) || /\.(webp|png|jpe?g|gif|avif)$/i.test(f.name);
    });
    var P = global.SWRPGPicture;
    var checked = P ? Promise.all(files.map(function (f) { return P.check(f); })).then(function (rs) {
      return files.filter(function (f, i) { return rs[i].ok; });
    }) : Promise.resolve(files);
    return checked.then(function (ok) { files = ok; return ready(); }).then(function () {
      var matched = {};   // id → file (last-wins on collision, deterministic)
      var unmatched = [];
      files.forEach(function (f) {
        var id = resolveFilename(f.name);
        if (id) matched[id] = f;                             // collision → last file wins
        else unmatched.push(f.name);
      });
      var ids = Object.keys(matched);
      return ids.reduce(function (chain, id) {
        return chain.then(function () { return put(id, matched[id]); });
      }, Promise.resolve()).then(function () {
        notify();
        return {
          total: files.length,
          matched: ids.length,          // unique items now carrying art from this import
          items: ids,
          unmatched: unmatched,
        };
      });
    });
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return function () { _listeners = _listeners.filter(function (x) { return x !== fn; }); };
  }

  global.SWRPGUserArt = {
    ready: ready,
    hasArt: hasArt,
    count: count,
    ids: ids,
    getUrl: getUrl,
    setOne: setOne,
    removeOne: removeOne,
    clearAll: clearAll,
    importFiles: importFiles,
    resolveFilename: resolveFilename,   // exposed for the node guard
    listPrefix: listPrefix,             // K7: a keyspace's keys (a ship's deck plans)
    deckKey: deckKey,                   // K7: vessel:<vesselId>:deck:<deckId>
    vesselPrefix: vesselPrefix,         // K7: vessel:<vesselId>: — every key one ship keeps on this device
    removePrefix: removePrefix,         // K7 · R-S4SH-1: a deleted ship's plans leave with it
    isItemKey: isItemKey,               // K7: a key without a colon is item art
    subscribe: subscribe,
    _norm: norm,                        // guard access
    // Guard hook: build the matcher maps synchronously from registries (no fetch/IndexedDB),
    // so test/user_art_matcher.cjs can exercise resolveFilename in node. Same logic as loadMaps.
    _buildMaps: function (regs) {
      var idNorm = {}, skNorm = {};
      ['weapons', 'armor', 'gear'].forEach(function (sec) {
        Object.keys(regs[sec] || {}).forEach(function (id) {
          var rec = regs[sec][id];
          idNorm[norm(id)] = id;
          if (rec._source_key) skNorm[norm(rec._source_key)] = id;
        });
      });
      _maps = { idNorm: idNorm, skNorm: skNorm };
      return _maps;
    },
  };
})(typeof window !== 'undefined' ? window : this);
