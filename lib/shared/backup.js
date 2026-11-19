/**
 * backup.js — the whole-save backup: ONE module for both apps (card `release-r3-no-loss-card` §3 R-R3N-2/-3, §4;
 * the drawing approved in D-258, record 3ae8c4aeb; ruling `release-r3-backup-mockup` R-R3NG-2/-4, D-R3NA1/3/4).
 *
 * The file, `holocron-backup/1` (R-R3N-2): { format, made_at, build, local: {key: stored string}, idb: {db: {store:
 * [{key, value}]}}, counts }. A blob is { blob: <base64>, type }. Values are never re-shaped, so the app's own
 * load-time passes run on restore exactly as on a reload. `counts` is for a person reading the file; the summary is
 * always computed from the file.
 *
 * WHAT TRAVELS is the class table's USER and DEVICE rows (Docs/RELEASE_1_0_STORE_CLASSES.md), restated below as
 * LOCAL and IDB and pinned to the table by test/release_backup_core.cjs. Nothing else is ever written: a key outside
 * this build's list is skipped and counted ("parts from a newer version").
 *
 * THE RESTORE (R-R3N-3), from `plan(file, device)`:
 *   (a) it deletes nothing here. The file's tombstones join this device's list only for ids NOT alive here, so a
 *       record this device holds is never deleted by a restore (mergeAdoption alone would union them in and drop it);
 *   (b) a record this device lacks is added;
 *   (c) a record on both sides follows SWRPGSyncMerge.mergeAdoption: the newer wins; a tie or an unstamped pair is a
 *       conflict, this device's copy is kept provisionally and the person is asked (the f34 sheet, S4);
 *   (d) a record whose id this device tombstoned stays deleted and is counted.
 *   IF-EMPTY stores are written only when absent here (D-R3NA1: a fresh device writes neither swrpg_mods nor
 *   swrpg_active_sources before a choice — measured at the lap, gate B — so "empty" is "absent"). BY-KEY IndexedDB rows
 *   are added when their key is missing and kept when present; homebrew goes through SWRPGUserData's own writers, and
 *   the file's EMPTY seeded "My Data" home is never added (R-R3NG-4).
 *   The write is all-or-nothing: a failure partway puts this device back as it was before the restore began.
 *
 * Kinds counted on the screen (D-R3NA3): Characters · Ships · NPCs (the GM's custom NPCs) · Map pins · Homebrew
 * collections · Store counter and shelves (lines + shelves) · Pictures. Bench groups, dispositions, drafts, vehicle
 * edits, the variant and the books travel uncounted.
 */
(function (root) {
  'use strict';

  var FORMAT = 'holocron-backup/1';
  var FORMAT_RE = /^holocron-backup\/(\d+)$/;

  // The class table's USER/DEVICE rows: [key, RESTORE].
  var LOCAL = [
    ['swrpg_saved_characters', 'MERGE'], ['swrpg_creation_draft', 'MERGE'], ['swrpg_deleted_ids', 'MERGE'],
    ['swrpg_vessels_v1', 'MERGE'], ['swrpg_fleet_units_v1', 'MERGE'], ['swrpg_npc_cast', 'MERGE'],
    ['swrpg_npc_bench', 'MERGE'], ['swrpg_gm_vehicle_overrides', 'MERGE'], ['swrpg_mods', 'IF-EMPTY'],
    ['swrpg_active_sources', 'IF-EMPTY'], ['swrpg_map_pins', 'MERGE'],
    ['swrpg_store_counter_v1', 'IF-EMPTY'], ['swrpg_store_shelves_v1', 'IF-EMPTY'], ['swrpg_store_market_v1', 'IF-EMPTY'],
    ['swrpg_store_holds_v1', 'IF-EMPTY'], ['swrpg_npc_disposition', 'IF-EMPTY'],
    // R6 lane A · the group record (ruling `release-r4-shapes` R-R4S-5 item 2): an id-keyed list, merged by id
    ['swrpg_party_v1', 'MERGE'],
    // E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, C2): the campaign record, an id-keyed list merged by id
    ['swrpg_campaigns', 'MERGE'],
    // lap A (card ADDENDUM 5 row 4; build-paper R-BSBP-4/5): the wish list with stamps, a LIST merged by id in syncMerge
    ['swrpg_store_holds_v2', 'MERGE'],
  ];
  // [database, store, RESTORE] — every IndexedDB store in the backup is BY-KEY
  var IDB = [['swrpg_user_packs', 'collections', 'BY-KEY'], ['swrpg_user_packs', 'versions', 'BY-KEY'],
    ['swrpg_user_packs', 'meta', 'BY-KEY'], ['swrpg_user_art', 'images', 'BY-KEY']];
  var KINDS = [['characters', 'Characters'], ['ships', 'Ships'], ['npcs', 'NPCs'], ['map_pins', 'Map pins'],
    ['homebrew', 'Homebrew collections'], ['store', 'Store counter and shelves'], ['pictures', 'Pictures']];

  var LOCAL_KEYS = LOCAL.map(function (r) { return r[0]; });
  var TOMBS = 'swrpg_deleted_ids';
  // the id-keyed lists a tombstone can name, and the kind each one counts as
  var LISTED = { swrpg_saved_characters: 'characters', swrpg_vessels_v1: 'ships', swrpg_fleet_units_v1: null, swrpg_npc_cast: 'npcs',
    swrpg_party_v1: null, swrpg_campaigns: null };   // E6 C2: campaigns, listed by id under no kind (KINDS unchanged)   // R-R4S-5: the group record — listed by id, counted under no kind (D-R3NA3's kinds unchanged)

  function M() { return root.SWRPGSyncMerge || (typeof require === 'function' ? require('./syncMerge.js') : null); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function parse(s) { if (s == null) return undefined; try { return JSON.parse(s); } catch (e) { return undefined; } }
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // ── reading a state ({ local: {key: string}, idb: {db: {store: [{key, value}]}} }) ─────────────────────────────────
  function listOf(key, v) {
    var d = M().LISTS[key];
    return d ? (d.read(v) || []) : [];
  }
  function idOf(key) { return M().LISTS[key].id; }
  function rows(state, db, st) { return ((state.idb || {})[db] || {})[st] || []; }
  function metaOf(state) {
    var m = rows(state, 'swrpg_user_packs', 'meta').filter(function (r) { return r.key === 'state'; })[0];
    return (m && m.value) || {};
  }
  // the seeded home, still empty: the app's, not something made (every device holds one from its first open)
  function emptyHome(row, meta) {
    var v = row.value || {};
    return v.origin === 'own' && row.key === meta.home && !Object.keys((v.pack || {}).sections || {}).length;
  }
  function madeCollections(state) {
    var meta = metaOf(state);
    return rows(state, 'swrpg_user_packs', 'collections').filter(function (r) { return !emptyHome(r, meta); });
  }

  function counts(state) {
    var L = state.local || {};
    var store = 0;
    var counter = parse(L.swrpg_store_counter_v1), shelves = parse(L.swrpg_store_shelves_v1);
    store += ((counter && counter.lines) || []).length + ((shelves && shelves.shelves) || []).length;
    var pins = parse(L.swrpg_map_pins);
    return {
      characters: listOf('swrpg_saved_characters', parse(L.swrpg_saved_characters)).length,
      ships: listOf('swrpg_vessels_v1', parse(L.swrpg_vessels_v1)).length,
      npcs: listOf('swrpg_npc_cast', parse(L.swrpg_npc_cast)).length,
      map_pins: Object.keys((pins && pins.pins) || {}).length,
      homebrew: madeCollections(state).length,
      store: store,
      pictures: rows(state, 'swrpg_user_art', 'images').length,
    };
  }
  // "Nothing to back up yet" keys on every USER/DEVICE store being empty (D-R3NA3); the seeded home is not something made
  function isEmpty(state) {
    var L = state.local || {};
    if (LOCAL_KEYS.some(function (k) { return L[k] != null; })) return false;
    return !madeCollections(state).length && !rows(state, 'swrpg_user_packs', 'versions').length &&
      !rows(state, 'swrpg_user_art', 'images').length;
  }

  // ── the file ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function makeFile(state, madeAt, build) {
    var local = {}, idb = {};
    LOCAL_KEYS.forEach(function (k) { if (state.local && state.local[k] != null) local[k] = String(state.local[k]); });
    IDB.forEach(function (r) {
      var list = rows(state, r[0], r[1]);
      if (r[0] === 'swrpg_user_packs' && r[1] === 'collections') {
        var meta = metaOf(state);
        list = list.filter(function (x) { return !emptyHome(x, meta); });
      }
      if (!list.length) return;
      (idb[r[0]] = idb[r[0]] || {})[r[1]] = list.map(function (x) { return { key: x.key, value: x.value }; });
    });
    return { format: FORMAT, made_at: madeAt, build: build || null, local: local, idb: idb, counts: counts(state) };
  }
  function fileName(madeAt) {
    var d = new Date(madeAt);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'holocron-backup-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
  }

  // readFile(text) → { ok: true, file } | { ok: false, why: 'not-backup' | 'newer' }. Nothing is written by reading.
  function readFile(text) {
    var f;
    try { f = JSON.parse(text); } catch (e) { return { ok: false, why: 'not-backup' }; }
    if (!isObj(f) || typeof f.format !== 'string') return { ok: false, why: 'not-backup' };
    var m = FORMAT_RE.exec(f.format);
    if (!m) return { ok: false, why: 'not-backup' };
    if (Number(m[1]) > 1) return { ok: false, why: 'newer' };
    if (Number(m[1]) !== 1 || !isObj(f.local) || !isObj(f.idb || {}) || typeof f.made_at !== 'number') return { ok: false, why: 'not-backup' };
    var bad = Object.keys(f.local).some(function (k) { return typeof f.local[k] !== 'string'; }) ||
      Object.keys(f.idb || {}).some(function (db) {
        return !isObj(f.idb[db]) || Object.keys(f.idb[db]).some(function (st) {
          return !Array.isArray(f.idb[db][st]) || f.idb[db][st].some(function (r) { return !isObj(r) || !own(r, 'key') || !own(r, 'value'); });
        });
      });
    if (bad) return { ok: false, why: 'not-backup' };
    return { ok: true, file: f };
  }

  // ── the plan: what a restore would write, and the summary S3 shows ───────────────────────────────────────────────
  // device: the state as read here. Returns { local: {key: string} (the writes), idb: [{db, store, key, value}] (adds),
  // keptIdb, skipped: [names], conflicts: [...], deleted, kinds: {kind: {adds, keeps}}, fileDate }.
  function plan(file, device) {
    var DL = device.local || {}, FL = file.local || {};
    var skipped = [];
    Object.keys(FL).forEach(function (k) { if (LOCAL_KEYS.indexOf(k) === -1) skipped.push(k); });
    Object.keys(file.idb || {}).forEach(function (db) {
      Object.keys(file.idb[db] || {}).forEach(function (st) {
        if (!IDB.some(function (r) { return r[0] === db && r[1] === st; })) skipped.push(db + '/' + st);
      });
    });

    // MERGE keys through the adoption merge — device as local, the file as remote, the file's tombstones held back (a)
    var local = {}, remote = {};
    LOCAL.forEach(function (r) {
      if (r[1] !== 'MERGE' || r[0] === TOMBS) return;
      var d = parse(DL[r[0]]), f = parse(FL[r[0]]);
      if (d !== undefined) local[r[0]] = d;
      if (f !== undefined) remote[r[0]] = f;
    });
    var dTombs = parse(DL[TOMBS]); dTombs = Array.isArray(dTombs) ? dTombs.map(String) : [];
    if (DL[TOMBS] != null) local[TOMBS] = dTombs;
    var result = M().mergeAdoption(local, remote);
    var merged = result.merged;

    // (a) + (d): the file's tombstones join for ids not alive here; a file record this device tombstoned is counted
    var alive = {};
    Object.keys(LISTED).forEach(function (k) { listOf(k, local[k]).forEach(function (rec) { alive[String(rec[idOf(k)])] = true; }); });
    var fTombs = parse(FL[TOMBS]); fTombs = Array.isArray(fTombs) ? fTombs.map(String) : [];
    var tombs = dTombs.slice();
    fTombs.forEach(function (id) { if (!alive[id] && tombs.indexOf(id) === -1) tombs.push(id); });
    var deleted = 0;
    Object.keys(LISTED).forEach(function (k) {
      listOf(k, remote[k]).forEach(function (rec) { if (dTombs.indexOf(String(rec[idOf(k)])) !== -1) deleted += 1; });
    });

    var writes = {};
    Object.keys(merged).forEach(function (k) {
      if (k === TOMBS) return;
      var s = JSON.stringify(merged[k]);
      if (local[k] === undefined || stable(local[k]) !== stable(merged[k])) writes[k] = s;
    });
    if (tombs.length !== dTombs.length) writes[TOMBS] = JSON.stringify(tombs);

    // IF-EMPTY: written only where this device holds nothing
    var ifEmpty = {};
    LOCAL.forEach(function (r) {
      if (r[1] !== 'IF-EMPTY' || FL[r[0]] == null) return;
      if (DL[r[0]] == null) writes[r[0]] = FL[r[0]];
      ifEmpty[r[0]] = DL[r[0]] == null ? 'added' : 'kept';
    });

    // BY-KEY IndexedDB rows: missing → added; present → kept. The file's empty seeded home is never added (R-R3NG-4).
    // Collections are added in the FILE's order (its meta `order`, the person's priority between collections): each
    // writer appends, so the restored ones keep the order they had, after whatever this device already holds (its meta
    // stays this device's, BY-KEY). A row the order does not name goes last, in the file's own row order.
    var adds = [], kept = [];
    var fmeta = ((((file.idb || {}).swrpg_user_packs || {}).meta || []).filter(function (r) { return r.key === 'state'; })[0] || {}).value || {};
    var forder = Array.isArray(fmeta.order) ? fmeta.order.map(String) : [];
    var rank = function (x, i) { var at = forder.indexOf(String(x.key)); return at === -1 ? forder.length + i : at; };
    IDB.forEach(function (r) {
      var have = {};
      rows(device, r[0], r[1]).forEach(function (x) { have[stable(x.key)] = true; });
      var list = ((file.idb || {})[r[0]] || {})[r[1]] || [];
      if (r[1] === 'collections') {
        list = list.map(function (x, i) { return [rank(x, i), x]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (e) { return e[1]; });
      }
      list.forEach(function (x) {
        if (r[1] === 'collections' && emptyHome(x, fmeta)) return;
        var row = { db: r[0], store: r[1], key: x.key, value: x.value };
        (have[stable(x.key)] ? kept : adds).push(row);
      });
    });

    var p = { local: writes, idb: adds, keptIdb: kept, skipped: skipped, conflicts: result.conflicts, deleted: deleted,
      ifEmpty: ifEmpty, fileDate: file.made_at, file: file, device: device };
    p.kinds = summarize(p);
    return p;
  }

  // per kind: adds (what the file brings: new, or a newer copy) and keeps (on both sides, this device's copy stays)
  function summarize(p) {
    var DL = p.device.local || {}, FL = p.file.local || {};
    var out = {};
    KINDS.forEach(function (k) { out[k[0]] = { adds: 0, keeps: 0 }; });
    Object.keys(LISTED).forEach(function (key) {
      var kind = LISTED[key];
      if (!kind) return;
      var id = idOf(key);
      var dev = {}, fin = {};
      listOf(key, parse(DL[key])).forEach(function (r) { dev[String(r[id])] = r; });
      var finalV = own(p.local, key) ? parse(p.local[key]) : parse(DL[key]);
      listOf(key, finalV).forEach(function (r) { fin[String(r[id])] = r; });
      listOf(key, parse(FL[key])).forEach(function (r) {
        var i = String(r[id]);
        if (!fin[i]) return;                                   // tombstoned here: counted as deleted, not here
        if (!dev[i] || stable(dev[i]) !== stable(fin[i])) out[kind].adds += 1;
        else out[kind].keeps += 1;
      });
    });
    // map pins: one WHOLE record, counted in pins
    if (FL.swrpg_map_pins != null) {
      var dp = Object.keys((parse(DL.swrpg_map_pins) || {}).pins || {}).length;
      var fp = Object.keys((parse(FL.swrpg_map_pins) || {}).pins || {}).length;
      if (own(p.local, 'swrpg_map_pins')) out.map_pins.adds += fp; else out.map_pins.keeps += dp;
    }
    // the Store: counter lines and shelves, IF-EMPTY
    [['swrpg_store_counter_v1', 'lines'], ['swrpg_store_shelves_v1', 'shelves']].forEach(function (s) {
      if (FL[s[0]] == null) return;
      if (p.ifEmpty[s[0]] === 'added') out.store.adds += ((parse(FL[s[0]]) || {})[s[1]] || []).length;
      else out.store.keeps += ((parse(DL[s[0]]) || {})[s[1]] || []).length;
    });
    p.idb.forEach(function (r) {
      if (r.store === 'collections') out.homebrew.adds += 1;
      if (r.store === 'images') out.pictures.adds += 1;
    });
    p.keptIdb.forEach(function (r) {
      if (r.store === 'collections') out.homebrew.keeps += 1;
      if (r.store === 'images') out.pictures.keeps += 1;
    });
    return out;
  }

  // answer(p, conflict, side): 'local' keeps this device's copy (what the plan already holds); 'remote' takes the
  // file's. Returns a NEW plan with the summary recomputed.
  function answer(p, c, side) {
    var q = Object.assign({}, p, { local: Object.assign({}, p.local), conflicts: p.conflicts.filter(function (x) { return x !== c; }) });
    if (side === 'remote') {
      if (c.kind === 'envelope') q.local[c.key] = JSON.stringify(c.remote);
      else {
        var d = M().LISTS[c.key];
        var cur = parse(own(q.local, c.key) ? q.local[c.key] : (p.device.local || {})[c.key]);
        var list = d.read(cur).map(function (r) { return String(r[d.id]) === String(c.id) ? c.remote : r; });
        q.local[c.key] = JSON.stringify(d.emit(cur, list));
      }
    }
    q.kinds = summarize(q);
    return q;
  }
  function totals(kinds) {
    var a = 0, k = 0;
    Object.keys(kinds).forEach(function (x) { a += kinds[x].adds; k += kinds[x].keeps; });
    return { adds: a, keeps: k };
  }

  var API = { FORMAT: FORMAT, LOCAL: LOCAL, IDB: IDB, KINDS: KINDS, counts: counts, isEmpty: isEmpty, makeFile: makeFile,
    fileName: fileName, readFile: readFile, plan: plan, answer: answer, totals: totals };

  // ── the browser half: read this device, save a file, restore one (all-or-nothing) ───────────────────────────────
  if (typeof window !== 'undefined') {
    var idbRead = function (db, stores) {
      return new Promise(function (res) {
        var out = {};
        var rq;
        try { rq = indexedDB.open(db); } catch (e) { return res(out); }
        rq.onupgradeneeded = function () { try { rq.transaction.abort(); } catch (e) { /* nothing to read */ } };
        rq.onerror = function () { res(out); };
        rq.onsuccess = function () {
          var d = rq.result;
          var names = stores.filter(function (s) { return d.objectStoreNames.contains(s); });
          if (!names.length) { d.close(); return res(out); }
          var tx = d.transaction(names, 'readonly');
          names.forEach(function (s) {
            var os = tx.objectStore(s), list = out[s] = [];
            var c = os.openCursor();
            c.onsuccess = function () {
              var cur = c.result;
              if (!cur) return;
              list.push({ key: cur.key, value: cur.value });
              cur.continue();
            };
          });
          tx.oncomplete = function () { d.close(); res(out); };
          tx.onerror = function () { d.close(); res(out); };
        };
      });
    };
    var blobTo64 = function (b) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(String(r.result).replace(/^data:[^,]*,/, '')); };
        r.onerror = function () { rej(r.error); };
        r.readAsDataURL(b);
      });
    };
    var b64ToBlob = function (s, type) {
      var bin = atob(s), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type: type || 'application/octet-stream' });
    };
    // values carry Blobs in IndexedDB; the file carries { blob: base64, type }
    var encode = function (v) {
      if (typeof Blob !== 'undefined' && v instanceof Blob) return blobTo64(v).then(function (s) { return { blob: s, type: v.type }; });
      return Promise.resolve(v);
    };

    // readDevice() → the state shape plan() and counts() read, with blobs already encoded
    API.readDevice = function () {
      var local = {};
      LOCAL_KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) local[k] = v; } catch (e) { /* blocked */ } });
      var byDb = {};
      IDB.forEach(function (r) { (byDb[r[0]] = byDb[r[0]] || []).push(r[1]); });
      return Promise.all(Object.keys(byDb).map(function (db) {
        return idbRead(db, byDb[db]).then(function (got) {
          return Promise.all(Object.keys(got).map(function (st) {
            return Promise.all(got[st].map(function (r) {
              return encode(r.value).then(function (v) { return { key: r.key, value: v }; });
            })).then(function (list) { got[st] = list; });
          })).then(function () { return [db, got]; });
        });
      })).then(function (pairs) {
        var idb = {};
        pairs.forEach(function (p) { idb[p[0]] = p[1]; });
        return { local: local, idb: idb };
      });
    };

    var buildId = function () {
      return fetch('/version.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.build) || null; }, function () { return null; });
    };

    // save() → { ok: true, name } | { ok: false } (S7). The browser's download is the save; nothing here is changed.
    API.save = function () {
      return Promise.all([API.readDevice(), buildId()]).then(function (got) {
        var now = Date.now();
        var file = makeFile(got[0], now, got[1]);
        var name = fileName(now);
        var url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
        var a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        return { ok: true, name: name, file: file };
      }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
    };

    // restore(plan) — the plan's writes, all or nothing. IndexedDB first (pictures, then homebrew through
    // SWRPGUserData's own writers), localStorage last; a failure undoes what this run added and puts every key back.
    API.restore = function (p) {
      var UA = window.SWRPGUserArt, UD = window.SWRPGUserData;
      var prevLocal = {}, addedArt = [], addedPacks = [];
      Object.keys(p.local).forEach(function (k) { try { prevLocal[k] = localStorage.getItem(k); } catch (e) { prevLocal[k] = null; } });
      var step = Promise.resolve();
      var fail = function (why) { throw new Error(why); };
      p.idb.forEach(function (r) {
        step = step.then(function () {
          if (r.db === 'swrpg_user_art') {
            var v = r.value || {};
            if (!UA || typeof v.blob !== 'string') fail('picture ' + r.key);
            return UA.setOne(r.key, b64ToBlob(v.blob, v.type)).then(function () { addedArt.push(r.key); });
          }
          if (!UD) fail('homebrew store unavailable');
          if (r.store === 'collections') {
            var row = r.value || {};
            var go = row.origin === 'own' ? UD.receiveOwn(row.pack) : UD.importPack(row.pack);
            return go.then(function (res) {
              if (!res || res.ok === false) fail('collection ' + r.key + ': ' + JSON.stringify(res && (res.reason || res.reasons)));
              addedPacks.push(res.ck || r.key);
            });
          }
          if (r.store === 'versions') {
            var vr = r.value || {};
            return UD.receiveVersion(vr.packId, vr.version, vr.pack).then(function (res) {
              if (!res || res.ok === false) fail('version ' + vr.packId + '@' + vr.version);
            });
          }
          return null;                                       // meta: present on every device, so BY-KEY keeps it
        });
      });
      return step.then(function () {
        Object.keys(p.local).forEach(function (k) { localStorage.setItem(k, p.local[k]); });
      }).then(function () {
        // nothing is pushed from here: a signed-in device's sync watcher sweeps every synced key and runs the pack lane
        // on its own timer, so the restore syncs "as after any local edit" (R-R3N-3); signed out, nothing is sent
        return { ok: true, totals: totals(p.kinds) };
      }).catch(function (e) {
        Object.keys(prevLocal).forEach(function (k) {
          try { if (prevLocal[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, prevLocal[k]); } catch (x) { /* best effort */ }
        });
        var undo = Promise.resolve();
        addedArt.forEach(function (k) { undo = undo.then(function () { return UA.removeOne(k); }).catch(function () {}); });
        addedPacks.forEach(function (ck) { undo = undo.then(function () { return UD.removePack(ck); }).catch(function () {}); });
        return undo.then(function () { return { ok: false, error: String((e && e.message) || e) }; });
      });
    };

    root.SWRPGBackup = API;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
