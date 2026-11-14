/* lib/shared/mechTypeNames.js — an Obligation or Duty type's NAME, resolved at render (B-1605; B-1498's lift).
 *
 * A stored Obligation/Duty `type` is a VOCABULARY KEY when the creator wrote it ("COMBATVICTORY") and a display name when
 * an import or a pregen wrote it (B-289's class). Every face that prints one reads its name here, from the two type
 * registries (`public/data/obligation-types.json`, `duty-types.json`); a type that is no key prints as stored, and
 * nothing here is persisted. ONE resolver (charter §8): the sheet's PROFILE, the creator review and both PDF exporters.
 *
 *   byKey(registry)           → { KEY: name } over the registry's `items` (a row needs both a key and a name)
 *   fromRegistries(obl, duty) → { obligation: {…}, duty: {…} } from registries already in hand (the creator's gameData)
 *   load(fetchJson?)          → Promise of that map, fetched once; null on failure (forgotten, so the next ask retries)
 *   peek()                    → the loaded map, or null
 *   name(names, track, type)  → the name for `type` on `track` ('obligation' | 'duty'), else `type` as stored
 *
 * Classic script → window.SWRPGMechTypeNames; CommonJS for node guards (test/b1605_mech_type_names.cjs).
 */
(function (global) {
  'use strict';
  var BASE = '/public/data/';
  var _names = null, _p = null;

  function byKey(j) {
    var m = {};
    ((j && j.items) || []).forEach(function (t) { if (t && t.key && t.name) m[t.key] = t.name; });
    return m;
  }
  function fromRegistries(obl, duty) { return { obligation: byKey(obl), duty: byKey(duty) }; }
  function defaultFetch(path) {
    return fetch(path).then(function (r) { if (!r.ok) throw new Error('Failed to load ' + path); return r.json(); });
  }
  function load(fetchJson) {
    if (_names) return Promise.resolve(_names);
    if (_p) return _p;
    var f = fetchJson || defaultFetch;
    _p = Promise.all([f(BASE + 'obligation-types.json'), f(BASE + 'duty-types.json')])
      .then(function (a) { _names = fromRegistries(a[0], a[1]); return _names; })
      .catch(function () { _p = null; return null; });
    return _p;
  }
  function peek() { return _names; }
  function name(names, track, type) { return (names && names[track] && names[track][type]) || type; }

  var api = { byKey: byKey, fromRegistries: fromRegistries, load: load, peek: peek, name: name };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGMechTypeNames = api;
})(typeof window !== 'undefined' ? window : this);
