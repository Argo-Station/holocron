/* holdsStore.js — window.SWRPGHolds, the one writer of swrpg_store_holds_v2 { v: 2, holds: [{ id, at, removed? }] } (R-BSBP-4..7).
 * v1 is read in once, then mirrored as the held ids. Guard: test/holds_store.cjs. */
(function (global) {
  'use strict';

  var V2 = 'swrpg_store_holds_v2', V1 = 'swrpg_store_holds_v1', DAYS90 = 90 * 864e5;
  function ls() { try { return global.localStorage || null; } catch (e) { return null; } }
  function get(k) { try { return JSON.parse(ls().getItem(k)); } catch (e) { return null; } }
  function put(k, v) { try { var t = JSON.stringify(v); if (JSON.stringify(get(k)) !== t) ls().setItem(k, t); } catch (e) {} }   // an equal VALUE is not rewritten
  function held(h) { return h.removed == null || h.removed < h.at; }
  function keep(list, now) { return list.filter(function (h) { return held(h) || h.removed > now - DAYS90; }); }
  function save(list, now) {
    list = keep(list, now);
    put(V2, { v: 2, holds: list });
    put(V1, list.filter(held).map(function (h) { return h.id; }));
    return list;
  }
  function load() {
    var s = get(V2), now = Date.now();
    if (s && Array.isArray(s.holds)) return s.holds.filter(function (h) { return h && typeof h.id === 'string'; });
    var v1 = get(V1), list = (Array.isArray(v1) ? v1 : []).filter(function (x) { return typeof x === 'string'; })
      .map(function (id) { return { id: id, at: now }; });
    return list.length ? save(list, now) : [];   // a read writes nothing unless it carries a held v1 id across (771)
  }
  function ids() { return load().filter(held).map(function (h) { return h.id; }); }
  function set(next) {
    var now = Date.now(), want = {}, list = load(), seen = {};
    (next || []).forEach(function (id) { want[id] = 1; });
    list = list.map(function (h) {
      seen[h.id] = 1;
      if (want[h.id] && !held(h)) return { id: h.id, at: now };
      if (!want[h.id] && held(h)) return { id: h.id, at: h.at, removed: now };
      return h;
    });
    (next || []).forEach(function (id) { if (!seen[id]) { seen[id] = 1; list.push({ id: id, at: now }); } });
    var pos = {}; (next || []).forEach(function (id, i) { if (!(id in pos)) pos[id] = i; });   // held in the caller's order, removals after
    list = list.filter(held).sort(function (a, b) { return pos[a.id] - pos[b.id]; }).concat(list.filter(function (h) { return !held(h); }));
    return save(list, now).filter(held).map(function (h) { return h.id; });
  }

  var api = { KEY: V2, V1: V1, load: load, ids: ids, count: function () { return ids().length; }, set: set, held: held, DAYS90: DAYS90 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGHolds = api;
})(typeof window !== 'undefined' ? window : globalThis);
