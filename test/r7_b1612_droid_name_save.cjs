#!/usr/bin/env node
/**
 * r7_b1612_droid_name_save.cjs — B-1612 (ruling `release-r7-bug-burndown` ADDENDUM 306, HANDOFF release-r7-droid-save-id):
 * a legacy save that recorded only `species: "Droid"` and no `speciesId` is a droid to the ONE droid test.
 *
 * "Droid" names two records (`droid`, `csg_droid`), so `migrateSheet` — the R-MRN-2 writing seam — stamps no id, and must
 * not. The answer is a READ (R-MRN-3's side): `CharResolve.isDroidSpecies(id, name, reg)` answers a save with no id by its
 * name — a droid when every record so named is a droid. RAW: a droid treats its own injury with Mechanics at +1, not
 * Medicine at +2 (EotE p.220).
 *
 *   A1  migrateSheet on { species: "Droid" } against the shipped registry writes NO speciesId (R-MRN-2 holds).
 *   A2  isDroidSpecies(undefined, "Droid", reg) is true; "droid" and " Droid " too (the seam's own name key).
 *   A3  a name shared with a non-droid record (a pack's "Droid" beside the two) is false; a non-droid name ("Human"),
 *       an unknown name and an empty one are false.
 *   A4  an id still decides when present: `droid`/`csg_droid` true, `human` false — even beside the name "Droid".
 *   A5  ONE droid test: `DROID_SPECIES` is declared once in lib/, player/, gm/; the treat row's `critTreatSkill` passes the
 *       sheet's species NAME to it (lib/shared/diceHub.jsx since D-507; player/app.jsx before).
 *
 * BITE (PRAXIS §6, read by EXIT CODE): B1612_LIB=<dir> points the guard at another lib/shared/charResolve.js — the cut
 * (57ddba080) exits 1 on A2; B1612_APP=<file> points A5 at another file holding critTreatSkill (a past player/app.jsx) — the cut's exits 1 on A5.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB = process.env.B1612_LIB || path.join(ROOT, 'lib/shared');
const CR = require(path.join(LIB, 'charResolve.js'));
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species;

let fail = 0;
function check(label, ok, got) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : ' — got ' + JSON.stringify(got)));
  if (!ok) fail++;
}

console.log('B-1612 — a legacy "Droid" save is a droid to the one droid test');

// A1
const sheet = { species: 'Droid' };
const m = CR.migrateSheet(sheet, { species: REG, careers: {}, specializations: {}, talents: {}, forcePowers: {} });
check('A1 migrateSheet writes no speciesId for the homonym "Droid" (R-MRN-2)', !sheet.speciesId && !m.changed, sheet);

// A2
const isD = CR.isDroidSpecies;
check('A2 isDroidSpecies(no id, "Droid") is true', isD(undefined, 'Droid', REG) === true, isD(undefined, 'Droid', REG));
check('A2 isDroidSpecies(no id, "droid") is true', isD(null, 'droid', REG) === true, isD(null, 'droid', REG));
check('A2 isDroidSpecies(no id, " Droid ") is true', isD('', ' Droid ', REG) === true, isD('', ' Droid ', REG));

// A3
const mixed = Object.assign({}, REG, { pack_droid: { id: 'pack_droid', name: 'Droid' } });
check('A3 a "Droid" name shared with a non-droid record is false', isD(undefined, 'Droid', mixed) === false, isD(undefined, 'Droid', mixed));
check('A3 "Human" is false', isD(undefined, 'Human', REG) === false, isD(undefined, 'Human', REG));
check('A3 an unknown name is false', isD(undefined, 'Not A Species', REG) === false, isD(undefined, 'Not A Species', REG));
check('A3 an empty name is false', isD(undefined, '', REG) === false, isD(undefined, '', REG));

// A4
check('A4 id droid is true', isD('droid') === true, isD('droid'));
check('A4 id csg_droid is true', isD('csg_droid') === true, isD('csg_droid'));
check('A4 id human beside the name "Droid" is false', isD('human', 'Droid', REG) === false, isD('human', 'Droid', REG));

// A5
const decl = [];
['lib', 'player', 'gm'].forEach(function walk(rel) {
  const abs = path.join(ROOT, rel);
  fs.readdirSync(abs, { withFileTypes: true }).forEach((d) => {
    const r = path.join(rel, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') walk(r); return; }
    if (!/\.(js|jsx)$/.test(d.name) || /^(player|gm)\/app\.js$/.test(r)) return;
    if (/\.js$/.test(d.name) && fs.existsSync(path.join(ROOT, r + 'x'))) return; // a built sibling of a .jsx
    if (/var DROID_SPECIES\s*=/.test(fs.readFileSync(path.join(ROOT, r), 'utf8'))) decl.push(r);
  });
});
check('A5 DROID_SPECIES is declared once (lib/shared/charResolve.js)', decl.length === 1 && decl[0] === 'lib/shared/charResolve.js', decl);
// D-507 (handoff `encounters-e3-dicehub-move`): critTreatSkill moved VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx —
// read there by name; B1612_APP may still point A5 at another file (a past player/app.jsx: the cut's exits 1 on A5)
const app = fs.readFileSync(process.env.B1612_APP || path.join(ROOT, 'lib/shared/diceHub.jsx'), 'utf8');
const body = (app.match(/function critTreatSkill\(sheet\) \{[\s\S]*?\n\}/) || [''])[0];
check('A5 critTreatSkill passes the sheet\'s species name to isDroidSpecies',
  /isDroidSpecies\(\(sheet \|\| \{\}\)\.speciesId, \(sheet \|\| \{\}\)\.species\)/.test(body), body.slice(0, 200));

console.log(fail ? '\n✗ ' + fail + ' FAIL' : '\n✓ all pass');
process.exit(fail ? 1 : 0);
