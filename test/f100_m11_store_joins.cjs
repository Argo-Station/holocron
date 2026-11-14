#!/usr/bin/env node
/**
 * f100_m11_store_joins.cjs — F-100 M11 GATE #2 step 12: `swrpg_mods`' save shape version 2 and "comes on with it"
 * (ruling f100-m11-finish-line ADDENDUM 4, R-M11F-12 the shape, R-M11F-13 this guard; D-147 Q3 (a)).
 *
 * lib/shared/mods.js is loaded as the page loads it (a window global) in a vm context whose window carries a STUBBED
 * localStorage, and active() is read over each stored payload, by EXIT CODE:
 *   J1  version 0 (a bare array) [eote-v2, aor-v2]          → the three (fad-v1 joins)
 *   J2  version 1 [eote-v2, aor-v2]                         → the three
 *   J3  version 1 [eote-v1, aor-v1] (the v1 pair)           → the three (SUPERSEDES, then JOINS)
 *   J4  version 1 [eote-v2] (a single stamp)                → itself only (the prior set is not all present)
 *   J5  version 2 [eote-v2, aor-v2] (FaD switched off alone) → the two, exactly (no join for a version-2 list)
 *   J6  setActive writes {version: 2, mods} and the stored bytes then read back exactly; no read rewrote the stored
 *       bytes in J1–J5 (sync raises no conflict).
 *   J7  JOINS is exported, its keys are OFFERED stamps (SHIPPED_STAMPS) never in SUPERSEDES, and each prior set is offered.
 *
 * Run (argv read by hand; anything else prints usage and exits 2):
 *   node test/f100_m11_store_joins.cjs [--mutant version-gate|joins-empty]
 *     version-gate  mods.js with the version gate removed (JOINS read for every version) — J5 MUST fail.
 *     joins-empty   mods.js with JOINS emptied — J1, J2, J3 MUST fail.
 * Ends `HARVEST: <n>`; exit 1 on any FAIL or a zero harvest.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const USAGE = 'usage: node test/f100_m11_store_joins.cjs [--mutant version-gate|joins-empty]';
const argv = process.argv.slice(2);
let mutant = null;
if (argv.length === 2 && argv[0] === '--mutant' && ['version-gate', 'joins-empty'].includes(argv[1])) mutant = argv[1];
else if (argv.length) { console.error(USAGE); process.exit(2); }

let src = fs.readFileSync(path.join(ROOT, 'lib/shared/mods.js'), 'utf8');
const mutate = (from, to) => {
  if (src.split(from).length !== 2) { console.log('[FAIL] the mutant\'s anchor is gone: ' + from); process.exit(1); }
  src = src.replace(from, to);
};
if (mutant === 'version-gate') mutate('if (env.version < 2) {', 'if (true) {');
if (mutant === 'joins-empty') mutate("'respecialized@fad-v1': ['respecialized@eote-v2', 'respecialized@aor-v2'],", '');

function load(stored) {
  const store = new Map();
  if (stored !== undefined) store.set('swrpg_mods', stored);
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const win = { localStorage };
  vm.runInContext(src, vm.createContext({ window: win, Object, Array, JSON, String, Number, isFinite, Promise }), { filename: 'mods.js' });
  return { M: win.SWRPGMods, store };
}

let harvest = 0, failures = 0;
const check = (ok, m) => { harvest++; if (ok) console.log('  PASS  ' + m); else { failures++; console.log('  FAIL  ' + m); } };
const E = 'respecialized@eote-v2', A = 'respecialized@aor-v2', F = 'respecialized@fad-v1';
const THREE = JSON.stringify([E, A, F]);

const legs = [
  ['J1', 'version 0 (bare array) [eote-v2, aor-v2]', JSON.stringify([E, A]), THREE],
  ['J2', 'version 1 [eote-v2, aor-v2]', JSON.stringify({ version: 1, mods: [E, A] }), THREE],
  ['J3', 'version 1 [eote-v1, aor-v1]', JSON.stringify({ version: 1, mods: ['respecialized@eote-v1', 'respecialized@aor-v1'] }), THREE],
  ['J4', 'version 1 [eote-v2] (a single stamp)', JSON.stringify({ version: 1, mods: [E] }), JSON.stringify([E])],
  ['J5', 'version 2 [eote-v2, aor-v2] (FaD off alone)', JSON.stringify({ version: 2, mods: [E, A] }), JSON.stringify([E, A])],
];
let untouched = true;
legs.forEach(([id, what, stored, want]) => {
  const { M, store } = load(stored);
  const got = JSON.stringify(M.active());
  if (store.get('swrpg_mods') !== stored) untouched = false;
  check(got === want, id + ' ' + what + ' → active() ' + got + ' (want ' + want + ')');
});

// J6 setActive writes version 2, read back exactly; no read rewrote the stored bytes
{
  const { M, store } = load(JSON.stringify([E, A]));
  M.setActive([E, A]);
  const raw = JSON.parse(store.get('swrpg_mods'));
  const back = JSON.stringify(M.active());
  check(raw.version === 2 && JSON.stringify(raw.mods) === JSON.stringify([E, A]) && back === JSON.stringify([E, A]) && M.STORE_VERSION === 2 && untouched,
    'J6 setActive([eote-v2, aor-v2]) stores ' + store.get('swrpg_mods') + ', read back ' + back + ' (the toggle-off holds); STORE_VERSION ' +
      M.STORE_VERSION + '; J1–J5 left the stored bytes untouched: ' + untouched);
}

// J7 the JOINS table's shape
{
  const { M } = load();
  const J = M.JOINS, sup = M.SUPERSEDES || {}, off = M.SHIPPED_STAMPS || [];
  const keys = J ? Object.keys(J) : [];
  check(!!J && keys.length >= 1 && keys.every((k) => off.includes(k) && !(k in sup) && Array.isArray(J[k]) && J[k].length
      && J[k].every((p) => off.includes(p) && p !== k)),
    'J7 JOINS exported ' + JSON.stringify(J) + ': keys offered and never superseded, each prior set offered');
}

console.log('HARVEST: ' + harvest);
if (!harvest) { console.log('[FAIL] zero harvest'); process.exit(1); }
if (failures) { console.log('f100_m11_store_joins: ' + failures + ' FAILED'); process.exit(1); }
console.log('f100_m11_store_joins: all legs pass');
