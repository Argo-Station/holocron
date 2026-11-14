#!/usr/bin/env node
/**
 * b205_encumbrance_resolve_at_render.cjs — B-205 guard.
 *
 * Pins: the persisted sheet has NO encumbrance key in normalizeCreated's return,
 * the PDF export paths call computeEncumbrance, computeWeaponPool adds encumbrance
 * setbacks, and all aim/cover/engaged/prone/disoriented plumbing is deleted.
 *
 * Run: node test/b205_encumbrance_resolve_at_render.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('B-205: encumbrance resolve-at-render + pool-modifier deletions\n');

const crSrc = read('lib/shared/charResolve.js');
const appSrc = read('player/app.jsx');

// 1. normalizeCreated does NOT emit an encumbrance key
const ncStart = crSrc.indexOf('function normalizeCreated');
const ncBody = crSrc.substring(ncStart, ncStart + 5000);
const returnStart = ncBody.indexOf('return {');
const returnBlock = ncBody.substring(returnStart, returnStart + 2000);
check('normalizeCreated return does NOT contain encumbrance key',
  !/\bencumbrance\s*:/.test(returnBlock));

// 2. No `sheet.encumbrance` in PDF export paths
const sheetEncRefs = [];
appSrc.split('\n').forEach(function(line, i) {
  if (/sheet\.encumbrance/.test(line) && !/^\s*\/\//.test(line)) {
    sheetEncRefs.push(i + 1);
  }
});
check('no product code reads sheet.encumbrance (found ' + sheetEncRefs.length + ' refs: ' +
  (sheetEncRefs.length ? 'lines ' + sheetEncRefs.join(',') : 'none') + ')',
  sheetEncRefs.length === 0);

// 3. encCarried variable is gone from normalizeCreated
check('encCarried is not computed in normalizeCreated',
  !/\bencCarried\b/.test(ncBody));

// 4. computeWeaponPool adds encumbrance setbacks
// The body was read as a fixed 2,500-character window, which silently measures the WRONG TEXT the
// moment the function grows: B-207's band-legality work added its RAW citation comment and pushed
// `computeEncumbrance` past the cut-off, so both asserts below went red while the lines they guard
// sat untouched in the function. Brace-matched now, so the window is the function.
// RE-POINTED by name (f100-surfacing-sheet-build): the hub row's builder moved from player/app.jsx's computeWeaponPool (now its
// one-line caller) into lib/shared/sheetPool.js's weaponPoolOf (f100-surfacing-sheet-concept R-SSC-4, ADDENDUM 10 C3 (a)).
// `cwpBody` is the BUILDER's body, so the asserts below keep their subject; their labels keep the old name.
const poolSrc = read('lib/shared/sheetPool.js');
const cwpStart = poolSrc.indexOf('function weaponPoolOf(sheet, weapon, opts)');
const cwpBody = cwpStart < 0 ? '' : (function () {
  let i = poolSrc.indexOf('{', cwpStart), depth = 0, k = i;
  for (; k < poolSrc.length; k++) {
    if (poolSrc[k] === '{') depth++;
    else if (poolSrc[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return poolSrc.substring(cwpStart, k);
})();
check('computeWeaponPool calls computeEncumbrance',
  /computeEncumbrance/.test(cwpBody));
check('computeWeaponPool adds enc.setbacks to setback count',
  /setbacks/.test(cwpBody) && /setback \+= enc/.test(cwpBody));

// 5. One producer: exactly one `5 + brawn` or `brawn + 5` in charResolve.js
const producerCount = (crSrc.match(/brawn\s*\+\s*5|5\s*\+\s*brawn/g) || []).length;
check('exactly 1 encumbrance limit expression in charResolve.js (got ' + producerCount + ')',
  producerCount === 1);

// ── Items 3–4: deletion greps (Amendment 3, acceptance #10) ──

// 6. aimStack deleted from product code
const aimStackCount = (appSrc.match(/\baimStack\b/g) || []).length +
  (crSrc.match(/\baimStack\b/g) || []).length;
check('aimStack deleted (0 refs, got ' + aimStackCount + ')', aimStackCount === 0);

// 7. trueAimBonus deleted from charResolve.js
const tabCount = (crSrc.match(/\btrueAimBonus\b/g) || []).length;
check('trueAimBonus deleted from charResolve.js (0 refs, got ' + tabCount + ')', tabCount === 0);

// 8. trueAimRanks deleted
const tarCount = (crSrc.match(/\btrueAimRanks\b/g) || []).length +
  (appSrc.match(/\btrueAimRanks\b/g) || []).length;
check('trueAimRanks deleted (0 refs, got ' + tarCount + ')', tarCount === 0);

// 9. true_aim talent-effects map entry deleted
check('true_aim map entry deleted from charResolve.js',
  !/\btrue_aim\b/.test(crSrc));

// 10. toggleCondition function deleted
check('toggleCondition function deleted',
  !/\btoggleCondition\b/.test(appSrc));

// 11. conds.disoriented and conds.prone branches deleted from computeWeaponPool
check('conds.disoriented deleted from computeWeaponPool',
  !/conds\.disoriented/.test(cwpBody));
check('conds.prone deleted from computeWeaponPool',
  !/conds\.prone/.test(cwpBody));

// 12. Range-band picker deleted from LOADOUT (no 'Target Range' label in app.jsx)
check('Target Range picker deleted from LOADOUT',
  !/Target Range/.test(appSrc));

// 13. targetRanges state + setTargetRange function deleted (dead after picker removal)
const trCount = (appSrc.match(/\btargetRanges\b/g) || []).length +
  (appSrc.match(/\bsetTargetRange\b/g) || []).length;
check('targetRanges / setTargetRange deleted (0 refs, got ' + trCount + ')', trCount === 0);

// 14. C-ERG-3: AIM control is absent from the render path (proven by a PASS, not a failing test).
// The old code rendered aim via ['aim', 'cover', 'engaged'].map(...) — assert that pattern
// and any standalone 'aim' condition-toggle token are gone from the non-comment render code.
var aimControlRefs = 0;
appSrc.split('\n').forEach(function(line) {
  if (/^\s*\/\//.test(line)) return;
  if (/['"]aim['"]/.test(line)) aimControlRefs++;
});
check('AIM control absent from render path (0 aim-string refs in app.jsx, got ' + aimControlRefs + ')',
  aimControlRefs === 0);

console.log('\nb205_encumbrance_resolve_at_render: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
