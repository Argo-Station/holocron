#!/usr/bin/env node
/* F-100 M12 · sheetPool's provideBase hands the user-data store the ninth applied section's base (ruling
 * `f100-m12-build-card` ADDENDUM 33, R-M12B-112; R-M12B-109: signature_abilities the ninth applied pack section).
 *
 *   PB1  the call in lib/shared/sheetPool.js (sliced from its one home, run against a stub store) passes
 *        `signature_abilities` = the base view's `signatureAbilities`, beside the five it passed before.
 *   PB2  BITE: the same call without that key hands the store no signature_abilities base, and PB1's check refuses it.
 *
 * Run: node test/f100_m12_provide_base.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/sheetPool.js'), 'utf8');
let failures = 0;
const check = (ok, m) => { if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m); } };

const at = SRC.indexOf('if (UD) UD.provideBase(');
const end = at < 0 ? -1 : SRC.indexOf('});', at);
if (at < 0 || end < 0) { console.error('  FAIL  the provideBase call is gone from lib/shared/sheetPool.js — re-point this guard'); process.exit(1); }
const CALL = SRC.slice(at, end + 3);
const KEY = 'signature_abilities: baseView.signatureAbilities';

function handed(call) {
  let got = null;
  const UD = { provideBase: (s) => { got = s; } };
  const baseView = { species: { s: 1 }, careers: { c: 1 }, specializations: { p: 1 }, talents: { t: 1 }, forcePowers: { f: 1 },
    signatureAbilities: { unmatchhero: { id: 'unmatchhero' } } };
  new Function('UD', 'baseView', call)(UD, baseView);
  return { got, baseView };
}
const ok = (r) => !!r.got && r.got.signature_abilities === r.baseView.signatureAbilities
  && ['species', 'careers', 'specializations', 'talents', 'force_powers'].every((k) => r.got[k] !== undefined);

check(ok(handed(CALL)), 'PB1 provideBase hands the store signature_abilities (the view\'s signatureAbilities) beside the five');
const mutant = CALL.replace(/,\s*signature_abilities: baseView\.signatureAbilities/, '');
check(CALL.includes(KEY) && mutant !== CALL && !ok(handed(mutant)), 'PB2 BITE: without that key the store gets no signature_abilities base, and PB1\'s check refuses it');

console.log(failures ? `\nf100_m12_provide_base: ${failures} FAILED` : '\nf100_m12_provide_base: all legs pass');
process.exit(failures ? 1 : 0);
