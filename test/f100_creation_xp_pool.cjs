#!/usr/bin/env node
/* F-100 B-1264 — THE ONE CREATION XP POOL (ruling f100-surfacing-creator-concept R-SCC-4; ADDENDUM 11 ACCEPTANCE (6);
 * brief f100-surfacing-creator-build §3.2, ruled ADDENDUM 18 with D1). Before this the save (normalizeCreated) and the
 * creator's live bar (useFullCreatorController's xpPool memo) each summed the pool's four terms themselves.
 *
 *   P1  STATIC: normalizeCreated's pool and the creator memo's pool each CALL creationXpPool, and neither keeps a term of
 *       its own (no `careerXpAdjustment(` / `starting_xp` / `speciesOption.xp` beside the call).
 *   P2  THE TERMS, by real records: the species' starting XP; the chosen option's XP (B-22); the trade XP; the career's
 *       `xp_adjustment`; the career found by its NAME when the key misses (careerId's read). (post1-switch-deletion,
 *       ADDENDUM 638: the engine key is gone; its OFF case went with it, table 3.)
 *   P3  THE SAVE READS IT: normalizeCreated's xp.total equals creationXpPool on every P2 case.
 *   BITE  `--mutant` re-inlines the save's pool WITHOUT the B-22 term in memory (the pre-B-1264 class: one summer drops a
 *       term the other keeps) and runs P3 against it — it must go red (exit 1). Read the exit code bare.
 *
 * Exit 0 = every leg green; 1 = a leg red (or the mutant's run); 2 = an unknown flag.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--mutant')) { console.error('usage: f100_creation_xp_pool.cjs [--mutant]'); process.exit(2); }
const MUTANT = args.includes('--mutant');

const CR_PATH = path.join(ROOT, 'lib/shared/charResolve.js');
let src = fs.readFileSync(CR_PATH, 'utf8');
const CALL = 'var xpPool = creationXpPool(character, speciesData, gameData && gameData.charbuild);';
if (MUTANT) {
  if (src.split(CALL).length !== 2) { console.error('MUTANT NOT PLANTED: the call site moved'); process.exit(1); }
  src = src.replace(CALL, 'var xpPool = (speciesData ? speciesEff.starting_xp : 100) + (character.mechanic ? (character.mechanic.xpAdjustment || 0) : 0)'
    + ' + careerXpAdjustment(_creationCareerRec(character, gameData && gameData.charbuild));');
  console.log('MUTANT PLANTED: the save\'s pool re-inlined without the B-22 option term');
}
const m = new Module(CR_PATH, module);
m.filename = CR_PATH;
m.paths = Module._nodeModulePaths(path.dirname(CR_PATH));
m._compile(src, CR_PATH);
const CR = m.exports;

let failures = 0;
const check = (ok, label) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };

// ── P1 · STATIC ──────────────────────────────────────────────────────────────────────────────────────────────────────
const crSrc = fs.readFileSync(CR_PATH, 'utf8');
const code = (t) => t.replace(/\/\/[^\n]*/g, '');   // the code, not its comments (the FORK B note names the old terms)
const nc = crSrc.slice(crSrc.indexOf('function normalizeCreated('), crSrc.indexOf('var xpSpentOnChars = 0;'));
check(nc.includes(CALL) && !/careerXpAdjustment\(|speciesOption\.xp/.test(code(nc.slice(nc.indexOf('// XP')))),
  'P1 normalizeCreated reads creationXpPool and keeps no pool term of its own');
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const memoAt = app.indexOf('var xpPool = useMemo(');
const memo = memoAt === -1 ? '' : app.slice(memoAt, app.indexOf('}, [', memoAt));
check(memo.includes('CharResolve.creationXpPool(') && !/careerXpAdjustment|starting_xp|speciesOption\.xp|xpAdjustment/.test(memo),
  'P1 the creator memo reads CharResolve.creationXpPool and keeps no pool term of its own');

// ── P2 / P3 · the terms by real records, and the save reading them ──────────────────────────────────────────────────
const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species;
const CAREERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/careers.json'), 'utf8')).careers;
const gand = Object.values(SPECIES).find((s) => s.id === 'gand');
const human = SPECIES.human;
const ZZ = Object.assign({}, CAREERS.smuggler, { id: 'zz_career', name: 'Zz Career', xp_adjustment: 15 });
const careers = Object.assign({}, CAREERS, { zz_career: ZZ });
const CB = { species: SPECIES, careers, specializations: {}, talents: {} };
const GAMEDATA = { charbuild: CB };
const DEPS = { registries: {}, activeMods: [], portraitFor: () => null };
const ch = (extra) => Object.assign({
  id: 'x', identity: { name: 'Pool Tester' }, gameLine: 'eote', narrative: { backstory: '' }, appearance: {},
  species: { name: 'Human', key: 'human' }, career: null, specializations: [],
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  skills: {}, talents: {}, forcePowers: {}, mechanic: null,
  gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
  motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' },
}, extra || {});

const CASES = [
  ['Human, no option', ch(), human, human.starting_xp],
  ['Gand, its option banked +10 (B-22)', ch({ species: { name: gand ? gand.name : 'Gand', key: 'gand' }, speciesOption: { xp: 10, picks: {} } }), gand, (gand ? gand.starting_xp : 0) + 10],
  ['Human, trade XP +10', ch({ mechanic: { type: 'obligation', xpAdjustment: 10, creditAdjustment: 0, finalValue: 15 } }), human, human.starting_xp + 10],
  ['Human, a career with xp_adjustment 15', ch({ career: { key: 'zz_career', name: 'Zz Career' } }), human, human.starting_xp + 15],
  ['the career found by NAME when its key misses (careerId\'s read)', ch({ career: { key: 'stale_key', name: 'Zz Career' } }), human, human.starting_xp + 15],
];
check(!!gand && Number.isFinite(gand.starting_xp), 'fixture: the Gand record is shipped (B-22\'s species)');
CASES.forEach(([label, character, rec, want]) => {
  const got = CR.creationXpPool(character, rec, CB);
  check(got === want, `P2 ${label}: creationXpPool ${got} (want ${want})`);
  const saved = CR.normalizeCreated(character, rec, null, GAMEDATA, 'test', DEPS);
  check(saved.xp && saved.xp.total === got, `P3 ${label}: the save's xp.total ${saved.xp && saved.xp.total} = the pool ${got}`);
});

const n = CASES.length * 2 + 3;
console.log(`\nf100_creation_xp_pool${MUTANT ? ' --mutant' : ''}: ${n - failures} PASS · ${failures} FAIL`);
process.exit(failures ? 1 : 0);
