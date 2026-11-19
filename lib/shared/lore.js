/* lore.js — window.SWRPGLore, the one loader of public/data/planets|factions (lap A card §3.6). Guard: test/lore_loader.cjs. */
(function (global) {
  'use strict';

  var DIRS = { planets: 'public/data/planets/', factions: 'public/data/factions/' };
  var _cache = {};

  function txt(v) { return v == null || v === '' ? null : String(v); }
  function load(kind, id) {
    if (!DIRS[kind] || !id) return Promise.resolve(null);
    var path = DIRS[kind] + String(id).replace(/\.json$/, '') + '.json';
    return _cache[path] || (_cache[path] = global.fetch(path)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return null; }));
  }
  function isEntry(kind, rec) {
    if (!rec || typeof rec !== 'object' || !rec.id) return false;
    return kind === 'planets' ? !!rec.record_depth : !!rec.name;
  }
  function factions() {
    return load('factions', 'faction_index').then(function (ix) {
      return Promise.all(((ix && ix.factions) || []).map(function (f) { return load('factions', f.file); }));
    }).then(function (list) { return list.filter(function (r) { return isEntry('factions', r); }); });
  }
  function ref(x) {
    var obj = !!x && typeof x === 'object', b = obj ? x.book || x.source || x.title : x;
    if (typeof b !== 'string') return null;
    var m = /^(.*?)\s*pp?\.\s*(\d.*)$/.exec(b), pg = obj && x.pages != null ? x.pages : obj ? x.page : null;
    return { book: txt(m ? m[1] : b), pages: txt(pg != null ? pg : m && m[2]),
      note: obj ? txt(x.detail || x.notes || x.content || x.coverage || x.scope) : null };
  }
  function refs(rec) {
    return (rec && Array.isArray(rec.source_refs) ? rec.source_refs : []).map(ref).filter(function (r) { return r && r.book; });
  }

  var api = { load: load, factions: factions, refs: refs, isEntry: isEntry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGLore = api;
})(typeof window !== 'undefined' ? window : globalThis);
