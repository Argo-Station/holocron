#!/usr/bin/env node
/* release-r5-crafting-sm C5 · THE WORKSHOP'S OFFERED LIST (card C5 DARK; ADDENDUM 6 Q1 (b)) — RE-POINTED by ruling
 * release-r5-f1-c0 R-R5F1C-1: F1 builds every kind's approved face (D3–D5, A, B) and offers ranged on the melee face, so the
 * list is now EVERY category the registry holds. The ledger below is the history; the legs read the ruled list.
 *
 * The registry holds Special Modifications' ranged, gadget and cybernetic templates, Unlimited Power's potions and
 * talismans (release-r5-crafting-up C5), Endless Vigil's lightsaber hilts (release-r5-crafting-ev C4) and Keeping the
 * Peace's armour (release-r5-crafting-kp C4) and Forged in Battle's fortifications (release-r5-crafting-fib C4); the
 * Workshop offers none of them
 * until the card that builds each approved face adds its category to craftStore's OFFERED_CATEGORIES (R-WS-4, R-MU1).
 *
 *   D1  craftStore.offeredTemplates over the shipped registry is every template id, in registry order (R-R5F1C-1).
 *   D2  every one of the nine categories is offered, and their counts are the registry's own.
 *   D2b (RE-POINTED by ruling release-r6-ui-c0 L37) the droid kinds leave DARK: droid_chassis and droid_directive are
 *       OFFERED, by name, at their registry counts, and no template is left unoffered (card release-r6-ui §2.6).
 *   D3  the face lists templates through that one call: CraftWorkshop calls Craft.offeredTemplates(TPL) once, and no
 *       `Object.keys(TPL)` remains in player/app.jsx.
 *   BITE: a planted craftStore whose OFFERED_CATEGORIES drops `ranged` reds D1; so does one dropping `potion`,
 *   `lightsaber`, `armor`, `fortification`, `droid_chassis` or `droid_directive` (each removed on a COPY).
 *
 * Run: node test/release_r5_crafting_dark.cjs → exit 0 when every leg holds and the bite bites.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Craft = require(path.join(ROOT, 'lib/shared/craftStore.js'));
const TPL = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/crafting_templates.json'), 'utf8')).templates;
// R-R5F1C-1: every template of F1's nine kinds, in registry order — and, since R6's face pass (release-r6-ui-c0 L37), lane B's
// two droid kinds too: the Workshop offers EVERY template the registry holds.
const DROID_KINDS = ['droid_chassis', 'droid_directive'];
const ALL = Object.keys(TPL);

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
};
const d1 = (C) => JSON.stringify(C.offeredTemplates(TPL)) === JSON.stringify(ALL);

check('D1 the Workshop offers every template of the eleven kinds (' + ALL.length + '), in registry order', d1(Craft), Craft.offeredTemplates(TPL));
const OFFERED = { brawl_melee: 6, ranged: 9, gadget: 3, cyber: 3, potion: 9, talisman: 8, lightsaber: 5, armor: 7, fortification: 3, droid_chassis: 5, droid_directive: 7 };
const offBy = {};
Craft.offeredTemplates(TPL).forEach((id) => { offBy[TPL[id].category] = (offBy[TPL[id].category] || 0) + 1; });
const sortKeys = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {}));
check('D2 the eleven categories are offered at their registry counts ' + JSON.stringify(OFFERED),
  sortKeys(offBy) === sortKeys(OFFERED), offBy);
// L37 (release-r6-ui-c0): lane B's droid kinds leave DARK — offered by name, and nothing is left unoffered
const dark = Object.keys(TPL).filter((id) => Craft.offeredTemplates(TPL).indexOf(id) === -1);
check('D2b the droid kinds are offered by name: droid_chassis 5, droid_directive 7, and no template is unoffered',
  DROID_KINDS.every((k) => offBy[k] === OFFERED[k]) && dark.length === 0, { offBy, dark });

const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const face = app.slice(app.indexOf('function CraftWorkshop('));
const calls = (app.match(/Craft\.offeredTemplates\(/g) || []).length;
check('D3 CraftWorkshop lists templates through Craft.offeredTemplates(TPL), once in the app',
  calls === 1 && /var ids = Craft\.offeredTemplates\(TPL\);/.test(face), { calls });
check('D3 no Object.keys(TPL) remains in player/app.jsx', app.indexOf('Object.keys(TPL)') === -1);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5dark-'));
try {
  fs.copyFileSync(path.join(ROOT, 'lib/shared/crafting.js'), path.join(tmp, 'crafting.js'));
  fs.copyFileSync(path.join(ROOT, 'lib/shared/itemResolve.js'), path.join(tmp, 'itemResolve.js'));
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/craftStore.js'), 'utf8');
  ['ranged', 'potion', 'lightsaber', 'armor', 'fortification', 'droid_chassis', 'droid_directive'].forEach((cat) => {
    const cut = src.replace(", '" + cat + "'", '');
    if (cut === src) throw new Error('the bite found no ' + cat + ' in OFFERED_CATEGORIES to drop');
    const f = path.join(tmp, 'craftStore_' + cat + '.js');
    fs.writeFileSync(f, cut);
    if (!d1(require(f))) console.log('  PASS  BITE: OFFERED_CATEGORIES without ' + cat + ' reds D1');
    else { failures += 1; console.error('  FAIL  BITE: OFFERED_CATEGORIES without ' + cat + ' passed D1'); }
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
