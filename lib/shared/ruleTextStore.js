/* lib/shared/ruleTextStore.js — A5's STORE: the imported rule text, on this browser only (window.SWRPGRuleTextStore).
 *
 * Ruling argo-dataset-import-draft §3 P-4 and the build card ADDENDUM 4 §A4.1 item 2. One IndexedDB database of its own,
 * `swrpg_rule_text`, in lib/store/userArt.js's idiom, holding ONE record: the last import's fills and its report. A
 * new import replaces it; REMOVE IMPORTED TEXT clears it. It is NEVER synced (absent from worker/sync.js SYNC_KEYS),
 * NEVER in a backup file (absent from lib/shared/backup.js's IDB table), never in a record, never committed, never
 * uploaded (G2). It is opened only in a copy whose book text was removed: on holocron.work nothing here runs, and the
 * accessor (sources.js ruleText) is always null.
 *
 * After ready() the fills sit in memory, so the display accessor reads them synchronously. A change broadcasts
 * `swrpg-rule-text-changed`, which each app's root listens to and re-renders on.
 */
(function (root) {
  'use strict';

  var DB_NAME = 'swrpg_rule_text', STORE = 'imports', DB_VERSION = 1, KEY = 'current';
  var _db = null, _fills = null, _report = null, _ready = null;

  function removed() {
    var S = root && root.SWRPGSources;
    return !!(S && typeof S.bookTextRemoved === 'function' && S.bookTextRemoved());
  }
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      if (!root.indexedDB) return reject(new Error('no indexedDB'));
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () { var db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }
  function changed() {
    try { if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('swrpg-rule-text-changed')); } catch (e) { /* non-DOM host */ }
  }

  // ready() → Promise<report | null>: the last import, loaded into memory. Never opens the database on holocron.work.
  function ready() {
    if (!removed()) return Promise.resolve(null);
    if (_ready) return _ready;
    _ready = tx('readonly', function (s) { return s.get(KEY); }).then(function (rec) {
      _fills = (rec && rec.fills) || null; _report = (rec && rec.report) || null; return _report;
    }, function (e) { console.warn('[ruleText] store unavailable — rule text stays blank:', e); _fills = null; _report = null; return null; });
    return _ready;
  }
  // save({fills, report}) replaces the last import (a new import replaces the last one).
  function save(result) {
    if (!removed()) return Promise.resolve(false);
    var rec = { fills: result.fills || {}, report: result.report || null };
    return tx('readwrite', function (s) { return s.put(rec, KEY); }).then(function () {
      _fills = rec.fills; _report = rec.report; _ready = Promise.resolve(_report); changed(); return true;
    });
  }
  // clear(): REMOVE IMPORTED TEXT.
  function clear() {
    if (!removed()) return Promise.resolve(false);
    return tx('readwrite', function (s) { return s.delete(KEY); }).then(function () {
      _fills = null; _report = null; _ready = Promise.resolve(null); changed(); return true;
    });
  }
  // get(address) → the imported text at '<kind>|<id>|<path>', or null.
  function get(addr) {
    if (!_fills || !removed()) return null;
    return Object.prototype.hasOwnProperty.call(_fills, addr) ? _fills[addr] : null;
  }
  function report() { return removed() ? _report : null; }

  var api = { DB_NAME: DB_NAME, ready: ready, save: save, clear: clear, get: get, report: report };
  if (root) root.SWRPGRuleTextStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
