/* lib/shared/forceRules.js — THE FORCE RULES KEY AND ITS ONE READER (window.SWRPGForceRules).
 *
 * F-100 M10 (ruling `f100-m10-shapes-card` R-M10S-7; `f100-m10-build-card` step 5, on DECISIONS D-137). Every new
 * Force-power arm — an upgrade's rows reaching the sheet and the dice (V1's count of ranks bought, V4's check of one power,
 * V2's dials offered at that check, V3's committed effects and committed count, V5's skill ranks) — is built DARK behind ONE
 * key, `swrpg_force_rules`, and every dark site asks THIS function. A second reader of the key is a defect
 * (test/f100_m10_force_readers.cjs counts the key's string across the source and names its one home: here).
 *
 * THE SWITCH — FLIPPED (ruling `f100-surfacing-force-flip-card` R-FFL-2; D-290: the flip is in 1.0; D-292, D-300). ON unless
 * the stored value is exactly '0' — the species and engine readers' mechanism (`lib/shared/speciesRules.js`,
 * `lib/shared/engineRules.js`); a store that THROWS reads ON (it cannot hold the opt-out). `?force_rules=0` /
 * `?force_rules=1` is persisted HERE, at script load, before the SPA drops the query: '0' is this release's opt-out lever
 * (R-SRF-6), and it leaves with this reader at the deletion lap (R-FFL-9). A preview lever, not save data (R-CFP-2): no
 * character record carries it, and the stored '0' moves no saved number (test/f100_force_flip.cjs S2).
 *
 * In node (the guards) there is no storage: the key reads ON; a guard whose premise is OFF says so with setForTest(false) —
 * setForTest(null) returns to the stored value. CharResolve and SWRPGPoolMods `require` it there when no shell loaded it.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_force_rules';
  var forced = null;

  (function persistFlag() {
    try {
      var m = /[?&]force_rules=([01])\b/.exec(root.location && root.location.search || '');
      if (m && root.localStorage) root.localStorage.setItem(KEY, m[1]);
    } catch (e) {}
  })();

  function on() {
    if (forced !== null) return forced;
    try { return !(root.localStorage && root.localStorage.getItem(KEY) === '0'); } catch (e) { return true; }
  }

  function setForTest(v) { forced = (v === null || v === undefined) ? null : !!v; }

  var api = { on: on, setForTest: setForTest };
  if (root) root.SWRPGForceRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
