#!/usr/bin/env node
/**
 * f100_m10_b1222_xp.cjs — GUARD for B-1222 (ruling f100-m10-build-card step 11): a Force power's advancement-bought upgrades
 * are summed by one summer.
 *
 *   X2  ONE summer: normalizeCreated and the creator's live bar (useFullCreatorController) both sum through
 *       CharResolve.forcePowersXp; no basic-cost-only reduce over `forcePowers` is left in either.
 *   X5  A REPEATED upgrade (ruling ADDENDUM 7, R-M10B-13): the n-th buy of one key costs that key's n-th cell. Move (basic
 *       10) with movestrength ×3 sums 45 (10 + 10 + 10 + 15) and ×4 sums 65 (+ 20), through THIS TREE's charResolve.js.
 *
 * Run: node test/f100_m10_b1222_xp.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CR_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
let failures = 0;
const check = (ok, m) => { if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m); } };

const ctrlAt = APP.indexOf('function useFullCreatorController(');
const ctrl = ctrlAt >= 0 ? APP.slice(ctrlAt, APP.indexOf('\nfunction ', ctrlAt + 1)) : '';
const ncAt = CR_SRC.indexOf('function normalizeCreated(');
const nc = ncAt >= 0 ? CR_SRC.slice(ncAt, CR_SRC.indexOf('\nfunction ', ncAt + 1)) : '';
const basicOnly = /\.cost\) \|\| 10\); \}, 0\)|forcePowers\[k\] && character\.forcePowers\[k\]\.cost/;
check(/CharResolve\.forcePowersXp\(character\.forcePowers \|\| \{\}, charbuild \|\| null\)/.test(ctrl) && !basicOnly.test(ctrl)
  && /forcePowersXp\(character\.forcePowers, gameData && gameData\.charbuild\)/.test(nc) && !basicOnly.test(nc)
  && /useFullCreatorController\(resumeDraft, gameData && gameData\.charbuild\)/.test(APP),
  'X2 ONE summer: normalizeCreated and the creator bar both call forcePowersXp (the bar with FullCreator\'s view); no basic-only reduce left');

// X5 — R-M10B-13. Loaded from the TREE (not a copy), so a stroke landed in lib/shared/charResolve.js reaches it.
{
  const vm = require('vm');
  const ctx = { window: {}, module: { exports: {} }, console };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(CR_SRC, ctx);
  const CR = ctx.window.CharResolve || ctx.module.exports;
  const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/' + f), 'utf8'));
  const charbuild = {
    species: J('species.json').species, careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
    talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers,
    skillSheetKeys: (J('skills.vocab.json').entries || []).reduce((m, e) => { m[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; return m; }, {}),
  };
  const strength = [];                                     // Move's movestrength cells, in tree order (rows 1–4)
  ((charbuild.forcePowers.move || {}).tree || []).forEach((row, r) => { if (r > 0) (row.cells || []).forEach((c) => { if (c && c.ability === 'movestrength') strength.push(c.cost); }); });
  check(JSON.stringify(strength) === '[10,10,15,20]', `X5 the data: Move's movestrength cells cost ${JSON.stringify(strength)} ([10,10,15,20])`);
  const times = (n) => Array.from({ length: n }, () => 'movestrength');
  const x3 = CR.forcePowerEntryXp('move', { cost: 10, upgrades: times(3) }, charbuild);
  const x4 = CR.forcePowerEntryXp('move', { cost: 10, upgrades: times(4) }, charbuild);
  check(x3 === 45, `X5 Move + movestrength ×3 = ${x3} (45: 10 + 10 + 10 + 15)`);
  check(x4 === 65, `X5 Move + movestrength ×4 = ${x4} (65: + 20)`);
}

console.log(failures ? `\nf100_m10_b1222_xp: ${failures} FAILED` : '\nf100_m10_b1222_xp: all legs pass');
process.exit(failures ? 1 : 0);
