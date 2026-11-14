#!/usr/bin/env node
/**
 * dice_skill_teach.cjs — a skill's teaching text resolves from the registry through ONE shared core.
 *
 * WRITTEN FROM THE RULING TEXT (R-MEL-1). Concept ruling `f58-sheet-skill-description-surface` chose
 * shape (b) — the description renders in the shared roll modal — under C-SDS-1..5. Each assert below
 * names the condition it answers, so a later reader can check the promise, not just the code.
 *
 * R-B55-1: bundle assertions use only what survives minification — the `data-testid` STRING LITERALS
 * and object property names. Never a function name.
 *
 * Run: node test/dice_skill_teach.cjs
 *
 * RE-POINTED (B-1209 retire, D-172; card `paper-n7-b1209-rollwindow-lab-card` ADDENDUM 2 C-4). The shared roll modal
 * this guard's C-SDS-2/3 legs read (`lib/shared/diceUI.jsx`'s builder and its imperative opener) is deleted: its one
 * caller, the crit plate's Medicine, opens the paper dice hub, which draws no skill teaching line (a disclosed loss the
 * retire accepted, ADDENDUM 1). KEEPS C-SDS-1 whole — the shared core resolves the REGISTRY text for every skill,
 * gracefully, and the player's skillDescFor delegates to it (the core's other readers depend on that). DROPS every
 * modal leg: the two openModal call-site pins and the opt-in count (C-SDS-2, red since B-902 — the caller count they
 * pinned is now 0), the modal's preset.skill / text-gate / resolve-through-the-core reads, the clamp and MORE/LESS and
 * ADVANCEMENT pointer (C-SDS-3), and the built vendor.js testid + `SKILL: ` legs.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// ── C-SDS-1: ONE source, driven for real (not a source grep) ─────────────────────────────────
const ctx = { window: {}, module: { exports: {} }, console };
ctx.self = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'lib/shared/charResolve.js'), 'utf8'), ctx);
const CR = ctx.window.CharResolve || ctx.module.exports;

check('C-SDS-1: the shared core exports skillDescription', typeof CR.skillDescription === 'function');

const vocab = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/skills.vocab.json'), 'utf8')).entries;
const sheetKeyOf = (e) => (e.aliases || []).find((a) => /^[A-Z0-9_]+$/.test(a)) || e.id;
const charbuild = { skillDescs: {} };
vocab.forEach((e) => { charbuild.skillDescs[sheetKeyOf(e)] = e.description; });

const mismatched = vocab.filter((e) => CR.skillDescription(sheetKeyOf(e), charbuild) !== e.description)
  .map((e) => e.id);
check('C-SDS-1: it returns the REGISTRY text for all 35 skills', mismatched.length === 0, mismatched);

// GRACEFUL — the dice app and the GM app never load the charbuild registry; a throw there would be a
// crash in a surface that has nothing to do with skills.
check('C-SDS-1 graceful: no registry -> "" (never a throw or a placeholder)',
  CR.skillDescription('ATHL', null) === '' && CR.skillDescription('ATHL', {}) === '');
check('C-SDS-1 graceful: unknown key -> ""', CR.skillDescription('NOPE', charbuild) === '');
check('C-SDS-1 graceful: empty key -> ""', CR.skillDescription('', charbuild) === '');
check('C-SDS-1 graceful: a non-string entry is not returned',
  CR.skillDescription('X', { skillDescs: { X: 42 } }) === '');

// ── one implementation: the player wrapper must DELEGATE, not re-read the map ─────────────────
const app = fs.readFileSync(path.join(root, 'player/app.jsx'), 'utf8');
check('C-SDS-1: player skillDescFor delegates to CharResolve.skillDescription',
  /skillDescFor[\s\S]{0,400}?CharResolve\.skillDescription/.test(app));
check('C-SDS-1: player skillDescFor no longer indexes skillDescs itself (no second implementation)',
  !/function skillDescFor[\s\S]{0,300}?\.skillDescs\s*\[/.test(app));

console.log('');
if (failures) { console.error('dice_skill_teach guard: ' + failures + ' FAILED'); process.exit(1); }
console.log('dice_skill_teach guard: ALL PASS');
