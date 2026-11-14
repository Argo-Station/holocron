#!/usr/bin/env node
/**
 * sheet_source_vocabulary.cjs — B-58: `sheet.source` is a DECLARED vocabulary, not an inline guess.
 *
 * WRITTEN FROM THE RULING TEXT (R-MEL-1). Ruling `creator-plumbing-census` D-R0-2 ruled the contract
 * half: *"`source` becomes a DECLARED vocabulary with a NAMED predicate … no future producer inherits
 * an affordance by string accident."* Jason answered the product half (2026-07-30): a player may edit
 * the backstory of ANY character on their roster, pregens included.
 *
 * THE DEFECT THIS PINS: `isEditable` was
 *     source === 'FullCreator' || source === 'QuickBuild' || !existingBackstory
 * and every shipped pregen carries a backstory AND a source outside that pair — so backstory was
 * read-only on all 30, by string accident rather than by decision.
 *
 * Run: node test/sheet_source_vocabulary.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const app = fs.readFileSync(path.join(root, 'player/app.jsx'), 'utf8');
const appCode = app.replace(/\/\/.*$/gm, '');

// ── the vocabulary exists and is complete against what producers actually stamp ────────────────
const m = /var SHEET_SOURCES = \[([\s\S]*?)\];/.exec(app);
check('B-58: SHEET_SOURCES is declared', !!m);
const declared = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
check('B-58: it declares the six values producers stamp', declared.length === 6, declared);

// EVERY value any producer can stamp must be declared — the pregen file is the one that bit us.
const pregens = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const shipped = [...new Set(pregens.map((c) => c.source))];
const undeclared = shipped.filter((s) => !declared.includes(s));
check('B-58: every source on a SHIPPED pregen is in the vocabulary', undeclared.length === 0,
  { undeclared, shipped });
check('B-58: the two creator stamps are in it too', declared.includes('FullCreator') && declared.includes('QuickBuild'));

// ── the predicate is NAMED, and the inline comparison is gone ─────────────────────────────────
check('B-58: a NAMED predicate exists (backstoryIsEditable)', /function backstoryIsEditable\(/.test(app));
check('B-58: isEditable calls the predicate, not a source-string comparison',
  /var isEditable = backstoryIsEditable\(sheet\);/.test(appCode));
check('B-58: the old inline source comparison is GONE',
  !/sheet\.source === 'FullCreator'/.test(appCode), 'the inline comparison survives somewhere');

// ── the product answer: permissive, and a PREGEN specifically must pass ───────────────────────
// Drive the real predicate rather than reading it.
const fn = new Function('sheet', /function backstoryIsEditable\(sheet\) \{([\s\S]*?)\n\}/.exec(app)[1]);
const aPregen = pregens[0];
check('B-58 product answer: a shipped PREGEN\'s backstory is editable (the F-62 dependency)',
  fn(aPregen) === true, { name: aPregen.name, source: aPregen.source });
check('B-58: a creator-made character is still editable',
  fn({ source: 'FullCreator', backstory: 'x' }) === true);
check('B-58: a missing sheet is not editable (no crash, no silent true)', fn(null) === false);

console.log('');
if (failures) { console.error('sheet_source_vocabulary: ' + failures + ' FAILED'); process.exit(1); }
console.log('sheet_source_vocabulary: ALL PASS');
