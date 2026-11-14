/* lib/shared/rollOptionsRules.js — THE ROLL-OPTIONS KEY AND ITS ONE TEST (window.SWRPGRollOptionsRules).
 *
 * F-100 THE SURFACING MISSION (card `f100-surfacing-roll-options-card` ADDENDUM 13, ruled at ADDENDUM 14 F1/F2; engine
 * card ADDENDA 28–29, E-SEF-2). The five roll-options data laps (5c–5g) merge DARK: every talent row they add carries the
 * marker `"dark": "roll_options"` (charbuild-common `$defs/dark_key`), and with this key OFF no reader anywhere sees one.
 * The ONE test is `liveTalents`, called where every host gets its talent records — `SWRPGSheetPool.loadCanonicalCharacterBuild`
 * (player and gm: the pristine base, the discovery view and every sheet's stamp view are folded FROM it) and the editor's
 * standalone fallback (`lib/editor/view.jsx` loadBooks). Every reader is downstream of those two calls (brief §3.2). A
 * second reader of the key is a defect (test/f100_roll_options_a.cjs counts the key's string across the source).
 *
 * THE SWITCH. ON unless the stored value is exactly '0' — `engineRules.js`' line; a store that THROWS reads ON.
 * `?roll_options=1` / `?roll_options=0` is persisted HERE, at script load, before the SPA drops the query. A preview lever,
 * not save data: no character record carries it. Read ONCE PER LOAD by the loader's strip (ADDENDUM 14 F1: the lever
 * reloads). The rows are live only when this key AND M12's engine key are ON (asked together; an absent engine module reads
 * OFF). FLIPPED (card ADDENDUM 79, D-362): the one line in `on()` reads ON unless '0', engineRules' line; '0' is the opt-out
 * and gives the dark world back. The key, the marker and the two calls retire at the deletion lap (R-EFL-9 / R-FFL-9).
 *
 * In node (the guards) there is no storage: the key reads ON; setForTest(true|false), setForTest(null) returns to the store.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_roll_options';
  var forced = null;
  var DARK = 'roll_options';
  var ARRAYS = ['pool_mods', 'roll_numbers', 'effects', 'spend', 'target'];

  (function persistFlag() {
    try {
      var m = /[?&]roll_options=([01])\b/.exec(root.location && root.location.search || '');
      if (m && root.localStorage) root.localStorage.setItem(KEY, m[1]);
    } catch (e) {}
  })();

  function on() {
    if (forced !== null) return forced;
    try { return !(root.localStorage && root.localStorage.getItem(KEY) === '0'); } catch (e) { return true; }
  }

  function setForTest(v) { forced = (v === null || v === undefined) ? null : !!v; }

  function _engineOn() {
    var E = (root && root.SWRPGEngineRules) || null;
    if (!E && typeof require === 'function') { try { E = require('./engineRules.js'); } catch (e) { E = null; } }
    return !!(E && typeof E.on === 'function' && E.on());
  }

  function _dark(row) { return !!(row && row.dark === DARK); }

  // liveTalents(talents) → the talent map every reader sees. Both keys ON: `talents` itself. Otherwise a shallow copy in
  // which a talent carrying a marked row is a copy WITHOUT those rows, and an array the strip empties is DELETED, so every
  // `Array.isArray(rec.x) && rec.x.length` test and talentEffectsOf's frozen fallback read as before the data lap. Every
  // other talent passes by reference. Pure; a non-object passes through untouched.
  function liveTalents(talents) {
    if (!talents || typeof talents !== 'object') return talents;
    if (on() && _engineOn()) return talents;
    var out = {}, ids = Object.keys(talents);
    for (var i = 0; i < ids.length; i++) {
      var rec = talents[ids[i]], copy = null;
      if (rec && typeof rec === 'object') {
        for (var j = 0; j < ARRAYS.length; j++) {
          var k = ARRAYS[j], rows = rec[k];
          if (!Array.isArray(rows) || !rows.some(_dark)) continue;
          if (!copy) copy = Object.assign({}, rec);
          var kept = rows.filter(function (r) { return !_dark(r); });
          if (kept.length) copy[k] = kept; else delete copy[k];
        }
      }
      out[ids[i]] = copy || rec;
    }
    return out;
  }

  var api = { on: on, setForTest: setForTest, liveTalents: liveTalents };
  if (root) root.SWRPGRollOptionsRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
