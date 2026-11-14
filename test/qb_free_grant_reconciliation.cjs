#!/usr/bin/env node
/**
 * qb_free_grant_reconciliation.cjs — B-718: Guided's two free-grant tables, reconciled and COUNTED.
 *
 * TWO CURATED TABLES KEYED BY DISPLAY NAME, WITH NOTHING COMPARING THEM (B-60's class, the same shape
 * as B-717's two pregen files):
 *   · `QB_DEFAULT_SKILLS[career]` — the FOUR free career skills Guided elects.
 *   · `QB_AUTO_BUILD[career].specSkills` — the TWO free specialization skills it elects.
 * On NINE of twelve careers they name the same skill, twelve times over: Smuggler CHARM+COOL ·
 * Technician COMP+MECH · Sentinel COMP+PERCEP · Bounty Hunter PERCEP · Hired Gun RANGHVY ·
 * Commander LEAD · Spy STEAL · Mystic CHARM · Seeker PERCEP. Ace, Soldier and Guardian are clean.
 *
 * WHAT ACTUALLY HAPPENS, MEASURED, BECAUSE THE ROW ASSUMED SOMETHING ELSE. B-718 reads "the second
 * grant buys a rank the character already has … THE PLAYER LOSES A FREE RANK". **They do not.** A
 * skill's rank is the SUM of its source flags — `charResolve.skillRankOf` (`lib/shared/charResolve.js`,
 * R-B658-1/2's one home) adds `freeCareer` and `freeSpec` — so an overlapping skill lands at RANK 2 and
 * every career ends with exactly SIX free ranks. What shrinks is the number of DISTINCT trained skills:
 * six on the three clean careers, five where one grant overlaps, FOUR on Smuggler, Technician and
 * Sentinel. Confirmed in a browser end-to-end and not only in this file (the R-B55-1 anti-pattern):
 * a Guided Smuggler persisted `{"ASTRO":1,"ATHL":1,"CHARM":2,"COOL":2,"DECEP":1,"PILSP":1}` —
 * `sheetData.skills` in `swrpg_saved_characters`, ASTRO+ATHL being Human's two bonus picks.
 *
 * AND RAW PERMITS IT. The bar on choosing a skill twice governs each STEP's own picks;
 * nothing bars the specialization's rank from landing on a skill the career already trained, and the
 * career-skill list text explicitly anticipates the overlap ("if they are not already marked")
 * (source: Force and Destiny Core Rulebook p.43-44). Rank 2 is exactly the creation ceiling — no skill
 * goes past rank 2 at creation (source: Age of Rebellion Core Rulebook
 * p.102). So the double grant is legal, lands, and costs nothing.
 *
 * AND THIS IS ALREADY RULED, which is the reason nothing here re-points a table. Ruling
 * `f45-disjoint-picks-correction` Q1: "A skill may absorb ONE career pick AND ONE specialization pick,
 * plus any species grant, bounded by the rank-2 creation cap." B-66 is the row that carries it, and its
 * own history records this exact error once already — it "first claimed the line OVERSTATED and drew the
 * overlap as waste — the exact opposite of the truth", and B-66's ratified copy now markets the overlap
 * ("your 2 free picks can raise them to Rank 2", overlapping pills marked → Rank 2) over a measured
 * 94 of 118 career/spec pairs and 150 overlapping slots. The custom creator's own button says it:
 * "★ Already Rank 1 from career — this grants Rank 2". B-718 reads the GUIDED tables the way B-66 first
 * read the CUSTOM ones, so a fix that removed the nine overlaps would be building against that ruling.
 *
 * WHICH MAKES THE OPEN QUESTION EDITORIAL, NOT ARITHMETIC: does Guided want six trained skills, or six
 * ranks with two of them doubled? Both are legal and neither is free — re-pointing an overlapping
 * specialization skill changes what the character can DO, and choosing which skill is a design call.
 * This guard therefore COUNTS and NAMES, and leaves the nine declared. It does not silently pick.
 *
 * WHY A PENDING LIST RATHER THAN A HARD BAN (the `creator_css_has_emitters` device, as B-717's guard):
 * the nine are named with their measured overlap, so the debt is countable and a TENTH — or a changed
 * ninth — fails immediately. Nothing about it is silent, and it cannot rot: an entry whose overlap has
 * gone, or whose overlap has MOVED, reds.
 *
 * NO NUMBER IN HERE IS TYPED. The four, the two, the overlap, the rank map, the distinct count and the
 * six are all derived — the tables out of `player/app.jsx`, the grant arithmetic out of the REAL
 * reducer in `player/index.html` (brace-matched and run, not re-implemented) through the REAL
 * `skillRankOf`. A lookalike of either would be a second resolution path for the same number.
 *
 * Run: node test/qb_free_grant_reconciliation.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 900)) : '')); }
}

/* DECLARED — a career whose two tables overlap, by name, with the exact skills and its row. This is a
   DECLARED STATE, not a defect ledger: under `f45-disjoint-picks-correction` Q1 the overlap is a legal
   rank-2 election, so what is declared is an EDITORIAL choice, not an error. Removing an entry without
   reconciling that career's tables turns this guard red, and so does the overlap changing — because
   either is a different election from the one on the record here. */
const PENDING = {
  // The nine measured at B-718's opening. Each is a legal rank-2 stack that LANDS (see the header's RAW
  // cites and the ruling), so nothing here is a broken character: it is Guided electing depth where it
  // could have elected a sixth skill. Whether Guided means depth or breadth per career is a design call
  // and Jason's, so NOTHING WAS RE-POINTED — the curated tables are untouched. B-718.
  // RULING-MOVED (release-r7-bug-burndown ADDENDUM 77, ASK 4 — B-1504's picks ACCEPTED): eleven careers' tables were
  // re-chosen to be LEGAL (career ranks on the career's own skills, as many as `free_ranks`; spec ranks on the spec's
  // own four — EotE p.35/p.80, FaD p.43). Five of the nine overlaps above (Smuggler CHARM/COOL, Hired Gun RANGHVY,
  // Commander LEAD, Seeker PERCEP, Sentinel COMP/PERCEP) stood only on a career rank in a NON-career skill, so they
  // were never a legal election; three moved to the overlap the legal tables now make. KEEPS the device and every
  // check; DROPS the five illegal entries and the three moved skills.
  'Bounty Hunter': { overlap: ['RANGHVY'], row: 'B-1504' },
  'Technician': { overlap: ['MECH'], row: 'B-1504' },
  'Spy': { overlap: ['DECEP'], row: 'B-1504' },
  'Mystic': { overlap: ['CHARM'], row: 'B-718' },
};

// ── the two tables, out of the source the bundle is built from ────────────────────────────────────────
// `new Function`, not a regex: `r1_guided_xp_solvency`'s own scar is a line-anchored regex that covered
// 14 of 52 rows and still printed PASS. Both blocks are plain data.
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
function objectLiteral(decl) {
  const i = app.indexOf(decl);
  if (i === -1) throw new Error('block not found in player/app.jsx: ' + decl);
  const j = app.indexOf('\n};', i);
  if (j === -1) throw new Error('block terminator not found for: ' + decl);
  return new Function('return ' + app.slice(i + decl.length - 1, j + 2))();
}
const DEFAULT_SKILLS = objectLiteral('const QB_DEFAULT_SKILLS = {');
const AUTO_BUILD = objectLiteral('const QB_AUTO_BUILD = {');

// ── the REAL reducer, out of the shell the browser loads ──────────────────────────────────────────────
// `charReducer` lives in `player/index.html` because it must exist before the bundle loads. It is lifted
// by BRACE MATCHING and executed, so this guard runs the grant arithmetic the product runs; a copy of it
// here would be a second resolution path for the same number (PRAXIS §5) and could drift green.
const shell = fs.readFileSync(path.join(ROOT, 'player/index.html'), 'utf8');
function liftFunction(signature) {
  const i = shell.indexOf(signature);
  if (i === -1) throw new Error('not found in player/index.html: ' + signature);
  let depth = 0, k = shell.indexOf('{', i);
  for (; k < shell.length; k += 1) {
    if (shell[k] === '{') depth += 1;
    else if (shell[k] === '}') { depth -= 1; if (depth === 0) { k += 1; break; } }
  }
  return { src: shell.slice(i, k), fn: new Function('return (' + shell.slice(i, k) + ')')() };
}
const lifted = liftFunction('function charReducer(state, action) {');
const charReducer = lifted.fn;
const skillRankOf = require('../lib/shared/charResolve.js').skillRankOf;

const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/skills.vocab.json'), 'utf8')).entries || [];
const KEY_TO_LABEL = {};
VOCAB.forEach((e) => {
  const up = (e.aliases || []).find((a) => /^[A-Z0-9]+$/.test(a));
  if (up) KEY_TO_LABEL[up] = e.label || e.id;
});

console.log('\n── B-718: Guided\'s four career skills and two specialization skills, reconciled ──');

// 0 — the instruments are real and non-vacuous. A lifted function that did not lift, or an empty table,
//     would make every assert below trivially true.
check('the two curated tables parsed, non-empty, over the SAME careers',
  Object.keys(DEFAULT_SKILLS).length > 0
  && Object.keys(DEFAULT_SKILLS).sort().join('|') === Object.keys(AUTO_BUILD).sort().join('|'),
  { defaultSkills: Object.keys(DEFAULT_SKILLS).length, autoBuild: Object.keys(AUTO_BUILD).length,
    onlyInDefaults: Object.keys(DEFAULT_SKILLS).filter((c) => !AUTO_BUILD[c]),
    onlyInAutoBuild: Object.keys(AUTO_BUILD).filter((c) => !DEFAULT_SKILLS[c]) });
check('the REAL charReducer lifted out of player/index.html and answers both grant actions',
  typeof charReducer === 'function'
  && skillRankOf(charReducer(charReducer({ skills: {} }, { type: 'SET_FREE_CAREER_SKILLS', value: ['CHARM'] }),
      { type: 'SET_FREE_SPEC_SKILLS', value: ['CHARM'] }).skills.CHARM) === 2,
  { lifted: lifted.src.length + ' bytes' });

// ── THE MEASUREMENT, per career, through the real reducer ─────────────────────────────────────────────
const careers = Object.keys(DEFAULT_SKILLS);
const rows = careers.map((career) => {
  const four = DEFAULT_SKILLS[career] || [];
  const two = (AUTO_BUILD[career] || {}).specSkills || [];
  const overlap = four.filter((k) => two.includes(k));
  let state = { skills: {} };
  state = charReducer(state, { type: 'SET_FREE_CAREER_SKILLS', value: four });
  state = charReducer(state, { type: 'SET_FREE_SPEC_SKILLS', value: two });
  const ranks = {};
  Object.keys(state.skills).forEach((k) => { ranks[k] = skillRankOf(state.skills[k]); });
  const totalRanks = Object.keys(ranks).reduce((s, k) => s + ranks[k], 0);
  return { career, four, two, overlap, ranks, distinct: Object.keys(ranks).length, totalRanks,
           granted: four.length + two.length,
           over2: Object.keys(ranks).filter((k) => ranks[k] > 2) };
});

// 1 — RAW's INTRA-STEP rule, which is the one rule that IS a hard ban: no step may pick a skill twice
//     (source: Force and Destiny Core Rulebook p.43 for the career step, p.44 for the specialization).
check('no career picks the same skill twice WITHIN one table (RAW: "may not choose the same skill more than once")',
  rows.every((r) => new Set(r.four).size === r.four.length && new Set(r.two).size === r.two.length),
  rows.filter((r) => new Set(r.four).size !== r.four.length || new Set(r.two).size !== r.two.length)
      .map((r) => ({ career: r.career, four: r.four, two: r.two })));

// 2 — every key in either table is a real skill. A typo'd key trains a phantom skill and no other
//     check in the repo would notice.
const unknown = [];
rows.forEach((r) => {
  r.four.concat(r.two).forEach((k) => { if (!KEY_TO_LABEL[k]) unknown.push({ career: r.career, key: k }); });
});
check('every skill key in both tables resolves in the skills vocabulary', unknown.length === 0, unknown);

// 3 — NOTHING IS LOST. The grants are 4 + 2 and the character receives 4 + 2 ranks, overlap or not.
//     This is the leg that falsifies B-718's premise, and it is also the leg that a FUTURE dedupe must
//     not break: a "fix" that dropped the duplicate grant instead of re-pointing it would red here.
check('every career receives exactly as many free RANKS as its two tables grant (nothing is lost to an overlap)',
  rows.every((r) => r.totalRanks === r.granted),
  rows.filter((r) => r.totalRanks !== r.granted)
      .map((r) => ({ career: r.career, granted: r.granted, received: r.totalRanks, ranks: r.ranks })));

// 4 — and no grant breaks the creation ceiling (source: Age of Rebellion Core Rulebook p.102). Two
//     overlapping grants reach exactly 2; a third source on the same skill would not.
check('no free grant puts a skill above the RAW creation cap of rank 2',
  rows.every((r) => r.over2.length === 0),
  rows.filter((r) => r.over2.length).map((r) => ({ career: r.career, over2: r.over2, ranks: r.ranks })));

// 5 — THE CONDITION. No career's two tables overlap, except those declared.
const overlapping = rows.filter((r) => r.overlap.length > 0);
const undeclared = overlapping.filter((r) => !PENDING[r.career]);
check('no career grants the same skill from both tables, or the career is DECLARED PENDING by name',
  undeclared.length === 0,
  undeclared.length
    ? 'these careers grant a skill twice and are NOT declared pending:\n'
      + undeclared.map((r) => '          ' + r.career + ' — ' + r.overlap.join(', ')
          + '  (four: ' + r.four.join(' ') + ' · two: ' + r.two.join(' ') + ')').join('\n')
      + '\n        This is not automatically a defect — `f45-disjoint-picks-correction` Q1 makes the stack'
      + '\n        legal and it lands at rank 2. DECLARE the career in PENDING with its row, which puts the'
      + '\n        election on the record; re-point the specialization skill ONLY on a ruling, because WHICH'
      + '\n        skill replaces it is an editorial call and never an implementer\'s.'
    : null);

// 6 — the CLEAN careers really are clean: six grants, six distinct trained skills, each at rank 1.
const clean = rows.filter((r) => !PENDING[r.career]);
check('every career NOT declared pending ends with one distinct skill per grant, all at rank 1',
  clean.every((r) => r.distinct === r.granted && Object.keys(r.ranks).every((k) => r.ranks[k] === 1)),
  clean.filter((r) => r.distinct !== r.granted || Object.keys(r.ranks).some((k) => r.ranks[k] !== 1))
       .map((r) => ({ career: r.career, granted: r.granted, distinct: r.distinct, ranks: r.ranks })));

// 7 — the list cannot rot, in both directions.
const byCareer = {};
overlapping.forEach((r) => { byCareer[r.career] = r; });
const stale = Object.keys(PENDING).filter((c) => !byCareer[c]);
check('no PENDING entry is stale (a declared career whose tables no longer overlap must come off)',
  stale.length === 0,
  stale.length ? 'these no longer overlap, so remove them from PENDING: ' + stale.join(', ') : null);

const moved = Object.keys(PENDING).filter((c) => byCareer[c]
  && byCareer[c].overlap.slice().sort().join(',') !== (PENDING[c].overlap || []).slice().sort().join(','));
check('no PENDING overlap has MOVED (an exemption covers named skills, never a career in perpetuity)',
  moved.length === 0,
  moved.map((c) => c + ' declared [' + PENDING[c].overlap.join(', ') + '] but measures ['
    + byCareer[c].overlap.join(', ') + ']'));

check('every PENDING entry names its board row',
  Object.keys(PENDING).every((c) => /^B-\d+$/.test(PENDING[c].row || '')),
  Object.keys(PENDING).filter((c) => !/^B-\d+$/.test(PENDING[c].row || '')));

// 8 — and the shortfall each declared career carries is exactly its overlap, so the cost of the open
//     question is a number on the page rather than a sentence about it.
const wrongShortfall = Object.keys(PENDING).filter((c) => byCareer[c]
  && byCareer[c].granted - byCareer[c].distinct !== byCareer[c].overlap.length);
check('each declared career is short exactly as many DISTINCT skills as it has overlaps',
  wrongShortfall.length === 0,
  wrongShortfall.map((c) => ({ career: c, granted: byCareer[c].granted, distinct: byCareer[c].distinct,
                               overlap: byCareer[c].overlap })));

// ── the census this guard is also ─────────────────────────────────────────────────────────────────────
console.log('\n  CAREER            FOUR CAREER SKILLS              TWO SPEC SKILLS       OVERLAP            RANKS  DISTINCT');
rows.forEach((r) => {
  console.log('  ' + r.career.padEnd(17)
    + r.four.join(' ').padEnd(32)
    + r.two.join(' ').padEnd(22)
    + (r.overlap.length ? r.overlap.join(' ') : '—').padEnd(19)
    + String(r.totalRanks).padEnd(7)
    + String(r.distinct)
    + (r.overlap.length ? '   (' + r.overlap.map((k) => KEY_TO_LABEL[k] + ' at rank ' + r.ranks[k]).join(', ') + ')' : ''));
});
const totalOverlaps = rows.reduce((s, r) => s + r.overlap.length, 0);
console.log('\n  careers: ' + rows.length + ' · with an overlap: ' + overlapping.length
  + ' · overlapping grants: ' + totalOverlaps
  + ' · declared pending: ' + Object.keys(PENDING).length + ' · undeclared: ' + undeclared.length
  + '\n  free ranks received, every career: ' + [...new Set(rows.map((r) => r.totalRanks))].join('/')
  + ' · distinct trained skills: ' + [...new Set(rows.map((r) => r.distinct))].sort().join('/'));

console.log('\nqb free grant reconciliation: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
