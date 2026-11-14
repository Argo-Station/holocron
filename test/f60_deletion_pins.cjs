#!/usr/bin/env node
/**
 * f60_deletion_pins.cjs — F-60 subtraction lap: the dead symbols stay dead.
 *
 * WRITTEN FROM THE RULING TEXT (R-MEL-1). Ruling `creator-plumbing-census` D-R0-3: the dead symbols get
 * "their own SUBTRACTION LAP … deletions want their own diff and a per-symbol grep sweep, never a ride
 * inside a refactor." This is the pin half of that discipline — a DELETION PIN, the B-28 idiom
 * (retired-surface asserts flipped to deletion pins), so a later refactor cannot quietly resurrect any
 * of them.
 *
 * It also pins what was DELIBERATELY KEPT. Half the risk in a deletion lap is over-reach, and three of
 * these four had a live-looking neighbour:
 *   · `IR.weaponDamage`  survives `damageTotal` (public API, and where Brawn is added exactly once)
 *   · `narrative.backstory` + its reducer branch survive the three dead narrative ids
 *   · `sheet.xp` survives `xpLedger` (it is the real creation-XP audit)
 *   · top-level `motivations` survives `narrative.motivationId` — different field, same-ish name
 *
 * Run: node test/f60_deletion_pins.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const app = fs.readFileSync(path.join(root, 'player/app.jsx'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'player/index.html'), 'utf8');

// CODE-only views. A deletion marker that NAMES the thing it removed is this repo's idiom
// (`normalizeOggdude DELETED`, `QUICKBUILD PORTRAITS RETIRED`), so every pin below that asks "is this
// still code?" must read past comments — otherwise documenting a deletion trips the pin that proves it.
// Caught when R-F60-2's own pointer comment, which mentions `xpLedger.push`, reddened that assert.
const appCode = app.replace(/\/\/.*$/gm, '');
const idxCode = idx.replace(/\/\/.*$/gm, '');

// ── the four deletions, pinned as CODE (a comment mentioning the name must not trip these) ────
check('QB_DEFAULT_GEAR is not declared', !/const\s+QB_DEFAULT_GEAR\s*=/.test(appCode));
check('QB_DEFAULT_GEAR is not read', !/QB_DEFAULT_GEAR\s*\[/.test(appCode));

check('damageTotal is not assigned', !/\.damageTotal\s*=/.test(appCode));
check('damageTotal is not read anywhere in the app', !/\.damageTotal\b(?!\s*=)/.test(appCode));

check('xpLedger is not declared in the working character', !/xpLedger\s*:/.test(idxCode));
check('nothing pushes to xpLedger', !/xpLedger\s*\.\s*push/.test(appCode));

['backgroundId', 'hookId', 'motivationId'].forEach(function (f) {
  check('narrative.' + f + ' is not declared', !new RegExp(f + '\\s*:').test(idxCode));
  check('nothing reads narrative.' + f, !new RegExp('narrative\\.' + f).test(appCode));
});
['background', 'hook', 'motivation'].forEach(function (f) {
  check("the dead reducer branch case '" + f + "' is gone",
    !new RegExp("case '" + f + "':[\\s\\S]{0,120}?narrative:").test(idx));
});

// ── OVER-REACH PINS: what the lap deliberately kept ───────────────────────────────────────────
const ctx = { window: {}, module: { exports: {} }, console };
ctx.self = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'lib/shared/itemResolve.js'), 'utf8'), ctx);
const IR = ctx.window.ItemResolve || ctx.module.exports;
check('KEPT: IR.weaponDamage still exists (Brawn lands exactly once lives here)',
  typeof IR.weaponDamage === 'function');
const brawnW = { damage: { base: 'brawn', value: 2 } };
check('KEPT: weaponDamage still adds Brawn exactly once (3 + 2 = 5)',
  IR.weaponDamage(brawnW, { characteristics: { brawn: 3 } }).total === 5,
  IR.weaponDamage(brawnW, { characteristics: { brawn: 3 } }));

// KEPT deliberately, and F-62 (Jason, 2026-07-30) settled WHY creation never writes it: asking for a
// backstory mid-creation costs momentum, so it is the sheet's job. Always-'' here is the design.
check('KEPT: narrative.backstory is still declared (the sheet field is live)',
  /narrative:\s*\{\s*backstory:\s*''\s*\}/.test(idx));
check("KEPT: the reducer's 'backstory' branch survives (its field survives)",
  /case 'backstory':[\s\S]{0,140}?backstory: action\.value/.test(idx));
check('KEPT: top-level motivations survives — a DIFFERENT field from the removed narrative.motivationId',
  /motivations:\s*\{\s*strength:/.test(idx));
// These two were source-greps against player/app.jsx until R-F45-1 moved `normalizeCreated` into the
// shared core. The FACTS they pin are unchanged — the assembly still seeds backstory from the working
// state, and sheet.xp is still the creation-XP audit — but their address was stale. Rather than
// re-point the greps at a new file, they are upgraded to BEHAVIOURAL asserts, which the extraction
// made possible for the first time: drive the real assembly and read what it produces. A grep can go
// stale on a move; this cannot.
const CRcore = (function () {
  const c = { window: {}, module: { exports: {} }, console };
  c.self = c.window; c.globalThis = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'lib/shared/charResolve.js'), 'utf8'), c);
  return c.window.CharResolve || c.module.exports;
})();
const probeChar = {
  gameLine: 'eote', identity: { name: 'Pin Probe' }, narrative: { backstory: 'kept alive' },
  species: null, career: null, specializations: [], talents: {}, skills: {}, forcePowers: {},
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  gearLedger: { inventory: [] }, mechanic: null, motivations: {},
};
const probeSheet = CRcore.normalizeCreated(probeChar, { id: 'human', name: 'Human', starting_xp: 110,
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  wound_threshold_base: 10, strain_threshold_base: 10 }, null, { charbuild: { careers: {}, species: {}, specializations: {}, talents: {} } },   // talents: F-100 R-FEGC-1 (registry required)
  'FullCreator', { registries: {}, activeMods: [], portraitFor: () => null });
check('KEPT: the assembly still seeds sheet.backstory from narrative.backstory (driven, not grepped)',
  probeSheet.backstory === 'kept alive', probeSheet.backstory);
check('KEPT: sheet.xp is still the creation-XP audit (xpLedger never was) — driven',
  probeSheet.xp && probeSheet.xp.total === 110 && typeof probeSheet.xp.spent === 'number'
  && typeof probeSheet.xp.remaining === 'number', probeSheet.xp);

// ── the built bundle carries none of the removed code ─────────────────────────────────────────
// B-139 (ruling release-r7-bug-burndown ADDENDUM 426 §6): the player's built code is THREE files since the split —
// app.js (first paint) + creator.js + sheet.js — and an absence pin over app.js alone would pass vacuously for code
// that now lives in a chunk. Every pin below reads the three together; none is dropped.
const bundles = ['player/app.js', 'player/creator.js', 'player/sheet.js'].map((f) => path.join(root, f));
const missing = bundles.filter((f) => !fs.existsSync(f));
if (missing.length) {
  check('player/app.js, creator.js and sheet.js exist (run `npm run build`)', false, missing);
} else {
  const b = bundles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  // A string literal only present in QB_DEFAULT_GEAR's rows survives minification; its absence is
  // real evidence the table is gone rather than renamed.
  check('the built bundle no longer carries QB_DEFAULT_GEAR (probe: its Heavy Clothing rows)',
    b.indexOf('QB_DEFAULT_GEAR') === -1);
  check('the built bundle does not assign damageTotal', !/\.damageTotal\s*=/.test(b));
  check('the built bundle has no xpLedger push', !/xpLedger\s*\.\s*push/.test(b));
}

console.log('');
if (failures) { console.error('f60_deletion_pins: ' + failures + ' FAILED'); process.exit(1); }
console.log('f60_deletion_pins: ALL PASS');
