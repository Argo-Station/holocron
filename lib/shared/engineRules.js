/* lib/shared/engineRules.js — M12'S ENGINE RULES KEY AND ITS ONE READER (window.SWRPGEngineRules).
 *
 * F-100 M12 (ruling `f100-m12-build-card` R-M12B-2; `f100-m12-finish-line` R-M12F-8). Every arm M12 teaches the engine is
 * built DARK behind ONE key, `swrpg_engine_rules`, and every dark site asks THIS function. A second reader of the key is a
 * defect (test/f100_m12_engine_key.cjs counts the key's string across the source and names its one home: here). The name
 * is domain-neutral because M12's arms span items, careers and abilities. THE ARMS (each asks on()):
 *   - signature-ability rows (sigAbilityRowSources, sigUpgradeCount's `sig_upgrades` count, the activation row);
 *   - the newly MODELLED personal-attachment modification lines (R1's attachment pool_mods carry, MV1–MV4);
 *   - the quality SPEND and TARGET members (QS1–QS3, QT1 / targetRows, QM1) and the ITEM rows (QG1, QK1);
 *   - Career Powers' verbs (career_powers, bonus_career_powers);
 *   - career Attributes effect rows (and xp_adjustment).
 * The LIVE gear fixes of R-M12B-8 (B-1204, B-1230..B-1232, B-1245) and B-1244's import carry are NOT behind it.
 *
 * THE SWITCH — FLIPPED (ruling `f100-surfacing-engine-flip-card` R-EFL-2; D-282 (1): the flip is in 1.0; D-284). ON unless the
 * stored value is exactly '0' — the species reader's mechanism (`lib/shared/speciesRules.js`); a store that THROWS reads ON
 * (it cannot hold the opt-out). `?engine_rules=0` / `?engine_rules=1` is persisted HERE, at script load, before the SPA drops
 * the query: '0' is this release's opt-out lever (R-SRF-6), and it leaves with this reader at the deletion lap (R-EFL-9). A
 * preview lever, not save data (R-CFP-2): no character record carries it, and the stored '0' moves no saved number
 * (test/f100_engine_flip.cjs S2).
 *
 * In node (the guards) there is no storage: the key reads ON; a guard whose premise is OFF says so with setForTest(false) —
 * setForTest(null) returns to the stored value. The shared cores `require` it there when no shell loaded it.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_engine_rules';
  var forced = null;

  (function persistFlag() {
    try {
      var m = /[?&]engine_rules=([01])\b/.exec(root.location && root.location.search || '');
      if (m && root.localStorage) root.localStorage.setItem(KEY, m[1]);
    } catch (e) {}
  })();

  function on() {
    if (forced !== null) return forced;
    try { return !(root.localStorage && root.localStorage.getItem(KEY) === '0'); } catch (e) { return true; }
  }

  function setForTest(v) { forced = (v === null || v === undefined) ? null : !!v; }

  var api = { on: on, setForTest: setForTest };
  if (root) root.SWRPGEngineRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
