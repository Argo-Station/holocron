#!/usr/bin/env node
/* F-100 THE SURFACING MISSION — THE ONE PURSE READER (ruling f100-surfacing-creator-concept ADDENDUM 4 FLAG 1 (ii),
 * ADDENDUM 11 R2 / ACCEPTANCE (7) and (9); brief f100-surfacing-creator-build §3.3, ruled ADDENDUM 18; B-1315's reader half).
 * startingCredits(adjust, speciesRec, picks, buyouts) → { purse, after, rows }.
 *
 *   U1  THE SPLIT, by the shipped records: Muun {500, 1000} (Endless Vigil p.21, timed
 *       after_creation), CSG Anomid {1600, 0}, Human {500, 0}, a trade adjustment carried into the purse; the rows name
 *       the owner (Deep Pockets, Muun, after_creation). (The key-OFF leg: RULING-MOVED (release-r7-bug-burndown ADDENDUM 638): the species key is deleted; dropped.)
 *   U2  ONE READER (static): the four app sites call CharResolve.startingCredits with the record (none keeps a `500 +`
 *       or a speciesCreditsDeltaOf of its own); the creator's credits memo reads `purse`; normalizeCreated reads it once.
 *   U3  THE SAVE: normalizeCreated's equipment.credits for a gear-less Muun is 1,500 (the purse 500 + the after 1,000,
 *       added once), the Anomid 1,600. (The key-OFF Muun 500: ADDENDUM 638, dropped.)
 *   U4  0 SAVED NUMBERS MOVE (ACCEPTANCE (9)): for EVERY shipped species, purse + after equals the pre-split figure
 *       500 + adjust + speciesCreditsDeltaOf (the one world).
 *   BITE  `--mutant` drops `after` from normalizeCreated's creditTotal in memory → U3 must go red (exit 1).
 *
 * Exit 0 = every leg green; 1 = a leg red; 2 = an unknown flag.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--mutant')) { console.error('usage: f100_purse_reader.cjs [--mutant]'); process.exit(2); }
const MUTANT = args.includes('--mutant');

const CR_PATH = path.join(ROOT, 'lib/shared/charResolve.js');
let src = fs.readFileSync(CR_PATH, 'utf8');
const TOTAL = 'var creditTotal = __start.purse + __start.after';
if (MUTANT) {
  if (src.split(TOTAL).length !== 2) { console.error('MUTANT NOT PLANTED: the save\'s total moved'); process.exit(1); }
  src = src.replace(TOTAL, 'var creditTotal = __start.purse');
  console.log('MUTANT PLANTED: normalizeCreated drops the after-creation credits');
}
const m = new Module(CR_PATH, module);
m.filename = CR_PATH;
m.paths = Module._nodeModulePaths(path.dirname(CR_PATH));
m._compile(src, CR_PATH);
const CR = m.exports;

let failures = 0, legs = 0;
const check = (ok, label) => { legs++; console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };
const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species;
const sp = (id) => SPECIES[id];

// ── U1 · THE SPLIT ───────────────────────────────────────────────────────────────────────────────────────────────────
const mu = CR.startingCredits(0, sp('muun'), null, null);
check(mu.purse === 500 && mu.after === 1000, `U1 Muun: purse ${mu.purse} (500) · after ${mu.after} (1000)`);
check(mu.rows.length === 1 && mu.rows[0].ability === 'Deep Pockets' && mu.rows[0].species === 'Muun' && mu.rows[0].timing === 'after_creation' && mu.rows[0].amount === 1000,
  'U1 Muun: one row — Deep Pockets (Muun), +1,000, after_creation ' + JSON.stringify(mu.rows));
const an = CR.startingCredits(0, sp('csg_anomid'), null, null);
check(an.purse === 1600 && an.after === 0 && an.rows.length === 1 && an.rows[0].ability === 'Vast Wealth' && an.rows[0].timing === null,
  `U1 CSG Anomid: purse ${an.purse} (1600) · after ${an.after} (0) · ${JSON.stringify(an.rows)}`);
const hu = CR.startingCredits(0, sp('human'), null, null);
check(hu.purse === 500 && hu.after === 0 && hu.rows.length === 0, `U1 Human: purse ${hu.purse} (500) · after ${hu.after} · no rows`);
const tr = CR.startingCredits(250, sp('muun'), null, null);
check(tr.purse === 750 && tr.after === 1000, `U1 a trade adjustment +250 joins the purse: ${tr.purse} (750) · after ${tr.after}`);

// ── U2 · ONE READER (static) ─────────────────────────────────────────────────────────────────────────────────────────
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const calls = app.match(/CharResolve\.startingCredits\(/g) || [];
// RE-POINTED (B-1688, D-449): `QBReviewStep` went with the old Guided steps. KEEPS one reader at every site. DROPS its fallback.
check(calls.length === 4, `U2 the app calls CharResolve.startingCredits at four sites (${calls.length}): buildTestPc, the mechanic step's and QuickBuild's SET_CREDITS, the credits memo`);
check(!/speciesCreditsDeltaOf\(/.test(app), 'U2 no app site sums a species delta of its own (speciesCreditsDeltaOf: 0 calls)');
const memoAt = app.indexOf('var credits = useMemo(');
const memo = memoAt === -1 ? '' : app.slice(memoAt, app.indexOf('}, [', memoAt));
check(/CharResolve\.startingCredits\(/.test(memo) && /start\.purse/.test(memo) && !/var base = 500|\b500\b/.test(memo),
  'U2 the creator\'s credits memo reads the purse (no 500 of its own)');
const crSrc = fs.readFileSync(CR_PATH, 'utf8');
const nc = crSrc.slice(crSrc.indexOf('function normalizeCreated('), crSrc.indexOf('var creditSpent ='));
check((nc.match(/startingCredits\(/g) || []).length === 1 && !/speciesCreditsDeltaOf\(/.test(nc), 'U2 normalizeCreated reads startingCredits once, no species sum of its own');

// ── U3 · THE SAVE ────────────────────────────────────────────────────────────────────────────────────────────────────
const GAMEDATA = { charbuild: { species: SPECIES, careers: {}, specializations: {}, talents: {} } };
const DEPS = { registries: {}, activeMods: [], portraitFor: () => null };
const ch = (rec) => ({
  id: 'x', identity: { name: 'Purse Tester' }, gameLine: 'eote', narrative: { backstory: '' }, appearance: {},
  species: { name: rec.name, key: rec.id }, career: null, specializations: [],
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  skills: {}, talents: {}, forcePowers: {}, mechanic: null,
  gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
  motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' },
});
const saved = (id) => { const s = CR.normalizeCreated(ch(sp(id)), sp(id), null, GAMEDATA, 'test', DEPS); return s.equipment && s.equipment.credits; };
check(saved('muun') === 1500, `U3 a gear-less Muun saves ${saved('muun')} credits (1500: purse 500 + after 1,000, added once)`);
check(saved('csg_anomid') === 1600, `U3 a gear-less CSG Anomid saves ${saved('csg_anomid')} (1600)`);

// ── U4 · 0 SAVED NUMBERS MOVE ────────────────────────────────────────────────────────────────────────────────────────
{   // ADDENDUM 638: the OFF pass dropped with the species key
  const bad = Object.values(SPECIES).filter((rec) => {
    const s = CR.startingCredits(120, rec, null, null);
    return s.purse + s.after !== 500 + 120 + CR.speciesCreditsDeltaOf(rec, null, null);
  }).map((r) => r.id);
  check(bad.length === 0, `U4 the one world: purse + after = 500 + adjust + the species delta on all ${Object.keys(SPECIES).length} species${bad.length ? ' — moved: ' + bad.slice(0, 5) : ''}`);
}

console.log(`\nf100_purse_reader${MUTANT ? ' --mutant' : ''}: ${legs - failures} PASS · ${failures} FAIL`);
process.exit(failures ? 1 : 0);
