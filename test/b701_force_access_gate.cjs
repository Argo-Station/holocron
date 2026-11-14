#!/usr/bin/env node
/**
 * b701_force_access_gate.cjs — STANDING guard for B-701 (lap f100-fix-live-numbers-s; f100-triage-census-card ADDENDUM 8
 * adopted the brief's §2 on paper): `CharResolve.computeDerived` credits a Force Rating talent's `forceRatingBonus` only
 * when the SAVED sheet has Force access — `forceRatingBase > 0 || frFloor > 0 || sheetForceAccess(sheet, charbuild)`,
 * the creator's own predicate (`forceAccessAtCreation`) over the sheet's book, species, career and every owned spec.
 * RAW: FaD p.282 — a non-Force-sensitive character may buy a Force talent but gets no use or
 * benefit from it until Force-sensitive, Force Rating talents included.
 *
 *   1. THE ROW'S SUBJECT: a Smuggler (EotE) with the Nightsister spec and the bought Force Rating talent (r4c0), no
 *      Witchcraft → Force Rating 0 (was 1); the stored bonus is HELD (derivedBonuses untouched); the sheet's Force-power
 *      ADD gate input max(resolved, sensitivity) is 0.
 *   2. The same plus a Force-rated universal spec (Force Sensitive Emergent, base still 0) → 1 (the spec clause).
 *   3. The same on the FaD line → 1 (the book clause).
 *   4. A Force career's pregen (consular) with base 0, no snapshot, one Force Rating rank → 1 (the career clause; B-49's
 *      shape keeps its rating).
 *   5. The subject plus Witchcraft (Nightsister r0c0, a Force Rating FLOOR) → 2, unchanged (the floor is access).
 *   6. No charbuild → ungated, as the floor (no registry to read the predicate from).
 *   7. sheetForceAccess is exported and agrees with forceAccessAtCreation on the subject (false) and case 2 (true).
 *
 * THE BITE: the gate reverted in a mutated copy of the core (its own module scope) → row 1 reads 1 again, exit 1.
 * Run: node test/b701_force_access_gate.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
function core(src, name) {
  const m = new Module(path.join(ROOT, 'lib/shared', name));
  m.paths = Module._nodeModulePaths(path.join(ROOT, 'lib/shared'));
  m._compile(src, m.id);
  return m.exports;
}
const CR = core(SRC, 'charResolve.b701.js');

let failures = 0, rows = 0;
function check(ok, msg, detail) {
  rows += 1;
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const CB = { species: reg('species'), careers: reg('careers'), specializations: reg('specializations'), talents: reg('talents'), forcePowers: reg('force_powers') };
const PREGENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/native/creator_human_smuggler.json'), 'utf8'));

// the row's subject, on the native creator fixture's shape (Human Smuggler, EotE, base 0)
const tree = CB.specializations.nightsister.talent_tree;
const FR_POS = '4-0', WITCH_POS = '0-0';
check(tree[4].talents[0].talent === 'force_rating' && tree[0].talents[0].talent === 'witchcraft',
  'fixture: Nightsister r4c0 is Force Rating and r0c0 is Witchcraft in the shipped registry');
function subject() {
  const s = clone(BASE);
  s.specializations = [{ id: 'pilot', owned: [] }, { id: 'nightsister', owned: [FR_POS] }];
  s.specializationIds = ['pilot', 'nightsister'];
  s.talents = [{ id: 'force_rating', rank: 1 }];
  s.derivedBonuses = Object.assign({}, s.derivedBonuses, { forceRatingBonus: 1 });
  s.forceRatingBase = 0;
  delete s.derived;
  return s;
}
const fr = (C, s, cb) => C.computeDerived(clone(s), [], cb).forceRating;
check(BASE.careerId === 'smuggler' && !CB.careers.smuggler.force_rating && BASE.book === 'eote',
  'fixture: the Smuggler career carries no force_rating and the book is eote');

// 1
const s1 = subject();
const sensitivity = Math.max(Number(s1.forceRatingBase) || 0, (s1.derived && Number(s1.derived.forceRating)) || 0);
check(fr(CR, s1, CB) === 0, '1 non-Force Smuggler + Nightsister + Force Rating r1 → Force Rating 0', fr(CR, s1, CB));
check(s1.derivedBonuses.forceRatingBonus === 1, '1 the bonus is HELD, not lost: derivedBonuses.forceRatingBonus still 1 on the record');
check(Math.max(fr(CR, s1, CB), sensitivity) === 0, '1 the sheet\'s Force-power ADD gate input max(resolved, sensitivity) is 0');
// 2
const s2 = subject();
s2.specializations.push({ id: 'force_sensitive_emergent', owned: [] });
s2.specializationIds.push('force_sensitive_emergent');
check(fr(CR, s2, CB) === 1, '2 + a Force-rated spec (Force Sensitive Emergent), base 0 → 1', fr(CR, s2, CB));
// 3
const s3 = subject(); s3.book = 'fad';
check(fr(CR, s3, CB) === 1, '3 the subject on the FaD line → 1', fr(CR, s3, CB));
// 4
const cons = clone(PREGENS.filter((c) => c.id === 'consular')[0]);
cons.forceRatingBase = 0; delete cons.derived;
cons.talents = (cons.talents || []).concat([{ id: 'force_rating', rank: 1 }]);
cons.derivedBonuses = Object.assign({ soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 }, cons.derivedBonuses || {}, { forceRatingBonus: 1 });
check(CB.careers[cons.careerId || 'consular'].force_rating === 1 && fr(CR, cons, CB) === 1,
  '4 a Force career\'s pregen (consular) with base 0, no snapshot, one rank → 1 (the career clause)', fr(CR, cons, CB));
// 5
const s5 = subject();
s5.specializations[1].owned.push(WITCH_POS);
s5.talents.push({ id: 'witchcraft', rank: 1 });
check(fr(CR, s5, CB) === 2, '5 the subject + Witchcraft (a Force Rating floor) → 2, unchanged', fr(CR, s5, CB));
// 6
check(fr(CR, s1) === 1, '6 no charbuild → ungated (bonus credited), as the floor', fr(CR, s1));
// 7
check(typeof CR.sheetForceAccess === 'function' && CR.sheetForceAccess(s1, CB) === false && CR.sheetForceAccess(s2, CB) === true
  && CR.sheetForceAccess(s1, CB) === CR.forceAccessAtCreation('eote', CB.species.human, CB.careers.smuggler, CB.specializations.nightsister),
  '7 sheetForceAccess exported; false on the subject, true with the Force-rated spec; agrees with forceAccessAtCreation');

// THE BITE
// RE-POINTED (release-r7-creator-review B-1334): the gate moved, verbatim in meaning, into the ONE formula both
// readers call (`forceRatingOf`; computeDerived passes `frAccess`). KEEPS the bite's claim and its one-site count;
// DROPS the old inline expression the site used to be.
const GATE = '((access || base > 0 || floor > 0) ? (Number(bonus) || 0) : 0)';
const nGate = SRC.split(GATE).length - 1;
const MUT = core(SRC.replace(GATE, '(Number(bonus) || 0)'), 'charResolve.b701.bite.js');
check(nGate === 1 && fr(MUT, subject(), CB) === 1,
  'BITE the gate reverted (one site) → the subject reads Force Rating 1 again', { sites: nGate, fr: fr(MUT, subject(), CB) });

console.log(`\nb701_force_access_gate: ${failures} FAIL of ${rows}`);
process.exit(failures ? 1 : 0);
