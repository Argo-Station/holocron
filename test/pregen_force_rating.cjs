#!/usr/bin/env node
/**
 * pregen_force_rating.cjs — the LEGACY-SHAPE guard: B-49 (Force rating) + B-57 (wound/strain).
 *
 * Filename kept deliberately: B-49's board row, STATUS and the Q1 gate all cite it, and a rename
 * would dangle those references for a file that is still doing the same job on a third field.
 *
 * WRITTEN FROM THE RULING TEXT, NOT FROM THE CODE (R-MEL-1 / R-B55-1). The conditions this guard
 * discharges are C-B49-1..4 as extended by `creator-plumbing-census` D-R0-1 ("the C-B49
 * before/after-talent-buy fixture PER THRESHOLD; the pregen guard grown to assert no snapshot value
 * without its matching base — three fields now"). Each assert below names the condition it answers.
 * It drives the REAL shared resolver; it never re-implements the branching it is checking.
 *
 * THE POPULATION THIS FILE WAS WRITTEN FOR IS GONE, AND THE ASSERTS ARE KEPT ANYWAY — read the two
 * paragraphs below in that order, because the history is what makes the current numbers legible.
 *
 * AS WRITTEN (2026-07): all 30 shipped pregens shipped WITHOUT `derivedBonuses`; the 10 Force users
 * among them kept their rating ONLY in the baked `derived` snapshot, with `forceRatingBase: 0`.
 * `buyTalent` writes `derivedBonuses` and never writes `forceRatingBase`, so the first talent
 * purchase flipped computeDerived to its modern branch (R-DAR1 legacy law) and the resolved rating
 * fell to 0 — which REMOVED the FORCE stat from the sheet entirely, since it renders only when the
 * value is > 0. Measured before the fix: FORCE 1 -> absent.
 *
 * AS IT STANDS (2026-09-20, B-735): the roster is EIGHTEEN, not thirty — the twelve beginner-game
 * characters retired 2026-07-30 (R-QSR1) — and ALL EIGHTEEN now carry a `derivedBonuses` block, the
 * fifteen legacy-shape records having been given the all-zeros block their own content implies. So
 * no shipped record is on the fallback branch any more and the flip this file reproduces cannot
 * happen to one. The asserts stay, and are not vacuous: `afterTalentBuy` still exercises the exact
 * transition for the uncountable legacy saves in players' localStorage that the floor exists to
 * serve, and every threshold/base/registry arm below is a live claim about the shipped eighteen.
 * The old sentence ("All 30 shipped pregens ship without `derivedBonuses`") was wrong in BOTH halves
 * and is corrected here rather than deleted, because it is the comment a reader would have trusted
 * while reasoning about which branch these records take (`character-math-audit` §5.8's class).
 *
 * B-41's C1 floor stopped that from BLOCKING purchases. It does not fix the DISPLAY, because every
 * display path reads computeDerived(...).forceRating directly. The real cause is the data: the input
 * of record was wrong. This guard pins the repair.
 *
 * The assertion that matters is the AFTER case — a `forceRatingBase` that only holds up until the
 * character buys a talent is not fixed.
 *
 * Run: node test/pregen_force_rating.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

// Load the SHARED resolver the app uses — not a reimplementation of its branching.
const ctx = { window: {}, module: { exports: {} }, console };
ctx.self = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'lib/shared/charResolve.js'), 'utf8'), ctx);
const CR = ctx.window.CharResolve || ctx.CharResolve || ctx.module.exports;
check('the shared resolver loaded (computeDerived present)', typeof CR.computeDerived === 'function');

const chars = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pregen_sheets.json'), 'utf8')).characters;
check('the shipped roster is present and non-empty', chars.length > 0, chars.length);

// A talent purchase writes derivedBonuses and never touches forceRatingBase. Reproduced faithfully
// rather than approximated — this is the exact transition that exposed the defect.
function afterTalentBuy(c) {
  return Object.assign({}, JSON.parse(JSON.stringify(c)), {
    derivedBonuses: {
      soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0,
      meleeDefenseBonus: 0, rangedDefenseBonus: 0, forceRatingBonus: 0,
    },
  });
}

const forceUsers = chars.filter(function (c) { return ((c.derived || {}).forceRating || 0) > 0; });
// The Force-rating population is now the six FaD archetypes (the twelve FFG characters retired,
// four of which were Force users). Asserted as "the FaD line carries Force ratings" rather than a
// bare count, so the claim survives a roster change instead of needing one.
check('every Force-using archetype carries a Force rating',
  chars.filter((c) => (c.derived || {}).forceRating > 0).length >= 6,
  chars.filter((c) => (c.derived || {}).forceRating > 0).map((c) => c.name));

const broken = [];
forceUsers.forEach(function (c) {
  const snap = (c.derived || {}).forceRating || 0;
  const before = CR.computeDerived(c, null).forceRating || 0;
  const after = CR.computeDerived(afterTalentBuy(c), null).forceRating || 0;
  if (before !== snap || after !== snap) broken.push({ name: c.name, snapshot: snap, before: before, after: after });
});
check('every Force pregen resolves its rating BEFORE a talent buy', !broken.some(function (b) { return b.before !== b.snapshot; }), broken);
check('every Force pregen STILL resolves it AFTER a talent buy (the defect)', !broken.some(function (b) { return b.after !== b.snapshot; }), broken);

// The cause, pinned at the data: a snapshot rating with no matching input of record is the bug shape.
const missingBase = forceUsers
  .filter(function (c) { return (Number(c.forceRatingBase) || 0) !== ((c.derived || {}).forceRating || 0); })
  .map(function (c) { return { name: c.name, base: c.forceRatingBase || 0, snapshot: (c.derived || {}).forceRating }; });
check('no Force pregen carries a snapshot rating without a matching forceRatingBase', missingBase.length === 0, missingBase);

// Non-Force pregens must not have acquired a rating from this repair.
const wrongly = chars
  .filter(function (c) { return ((c.derived || {}).forceRating || 0) === 0 && (Number(c.forceRatingBase) || 0) > 0; })
  .map(function (c) { return c.name; });
check('no NON-Force pregen gained a Force rating', wrongly.length === 0, wrongly);

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   B-57 — THE SAME DEFECT ON THE TWO HEALTH THRESHOLDS (D-R0-1)

   `buyTalent` writes `derivedBonuses` and never writes woundBase/strainBase, so the flip onto the
   modern branch replaced each species' printed base with computeDerived's default of 10. Measured
   before the fix: 6 of 30 pregens moved woundThreshold, 8 moved strainThreshold, union 11 —
   worst Lowhhrick 18 -> 14 wound, 10 -> 12 strain.
══════════════════════════════════════════════════════════════════════════════════════════════ */

// C-B49-2, PER THRESHOLD: both legs, in the legacy shape, driven through the real resolver.
// A threshold is asserted for EVERY pregen, not only the ones that were measurably broken — the
// 19 that happened to match the default are exactly where a regression would hide silently.
[
  { field: 'woundThreshold', base: 'woundBase' },
  { field: 'strainThreshold', base: 'strainBase' },
].forEach(function (t) {
  const moved = [];
  chars.forEach(function (c) {
    const snap = (c.derived || {})[t.field];
    if (typeof snap !== 'number') return;   // nothing to preserve
    const before = CR.computeDerived(c, null)[t.field];
    const after = CR.computeDerived(afterTalentBuy(c), null)[t.field];
    if (before !== snap || after < snap) {
      moved.push({ name: c.name, snapshot: snap, before: before, after: after });
    }
  });
  check('every pregen resolves its ' + t.field + ' BEFORE a talent buy',
    !moved.some(function (m) { return m.before !== m.snapshot; }), moved);
  // "after >= snapshot", not "after === snapshot": the floor is a LOWER bound, so a record whose
  // registry base legitimately resolves HIGHER than its shipped snapshot must be allowed to rise.
  check('no pregen LOSES ' + t.field + ' after a talent buy (B-57, the defect)',
    !moved.some(function (m) { return m.after < m.snapshot; }), moved);

  // C-B49-2's data half, the ruling's own words: no snapshot value without its matching base.
  const missing = chars
    .filter(function (c) { return typeof (c.derived || {})[t.field] === 'number' && typeof c[t.base] !== 'number'; })
    .map(function (c) { return c.name; });
  check('no pregen carries a snapshot ' + t.field + ' without a ' + t.base, missing.length === 0, missing);
});

// The bases are the SPECIES registry's, never `snapshot - characteristic` — otherwise anything else
// baked into the snapshot (a talent bonus, an authoring slip) would be laundered into a field whose
// name claims to be the printed species base, and a talent counted in derivedBonuses would double.
// A snapshot that legitimately disagrees with registry_base + characteristic + its own declared bonus is
// DECLARED here with its reason; an UNDECLARED one fails, so a new discrepancy can never arrive quietly.
//
// EMPTY SINCE 2026-09-20, ON JASON'S WORD ("Remove the leftovers"), and the two it held are worth
// recording because both had ROTTED into permanent holes under a name:
//   'Dao Jodh'  waived a "published FaD Beginner Game block". Dao Jodh is one of the TWELVE beginner-game
//               pregens RETIRED 2026-07-30 (ruling quick-start-roster-scope, R-QSR1) — he is not among the
//               eighteen this file walks, so the waiver named nobody and excused nothing, while telling every
//               reader that a beginner-game block is grounds for excusing an arithmetic failure here. It is
//               not: `character-math-audit` §0 establishes that no shipped record has a beginner-game
//               ancestor, and the twelve and the eighteen never shared an id or a name.
//   'Wicket'    waived "strain 12 vs registry-derived 13". Measured 2026-09-20: his record reads strain 13 and
//               `ewok_aaa`'s strain_threshold_base 11 + willpower 2 derives 13. The discrepancy is GONE, so
//               the waiver was covering a hole that had closed.
//
// AND THE STALENESS ARMS BELOW EXIST BECAUSE OF THOSE TWO. The sibling guard
// `test/pregen_card_record_parity.cjs` already asserts "no PENDING entry is stale"; this file had no such
// arm, which is exactly how a waiver outlives its subject. A declared name must (a) belong to a record this
// file actually walks and (b) still diverge — otherwise the entry comes off, and a reader can trust that
// every name on the list is doing work.
const DECLARED = {};
const diverges = [];
const speciesReg = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/species.json'), 'utf8')).species;
// F-67 RE-POINT, BY MEASUREMENT. This built a PRIVATE species name index whose collision policy
// ("resolve to nothing") was a third copy of a rule that now lives in exactly one place. The
// Complete Species Guide import puts a second record under ~100 shipped names, so the private copy
// resolved Human, Weequay, Duros and fifteen more to NOTHING and reported them "unresolvable" —
// a red that said nothing about pregens. It now asks THE shared index (C-CSG-6's incumbentWins:
// the record that was already in the catalogue keeps the name), which is the rule the app itself
// resolves a legacy sheet with. Same question, one answer, and the assert below is unchanged.
const spIdx = require('../lib/shared/charResolve.js').speciesNameIndex(speciesReg);
const spByName = {};
Object.keys(speciesReg).forEach(function (id) {
  const n = (speciesReg[id].name || '').trim().toLowerCase();
  if (spIdx.byName[n] === id) spByName[n] = speciesReg[id];
});
const baseMismatch = [], undeclared = [];
check('every pregen carries a speciesId (R-MRN-1 — never findable by display name alone)',
  chars.every(function (p) { return !!p.speciesId; }),
  chars.filter(function (p) { return !p.speciesId; }).map(function (p) { return p.name; }));
chars.forEach(function (c) {
  // R-MRN-1 (ruling `menagerie-rename-name-resolution` §4(ii)): pregens now carry `speciesId`.
  // Resolve by ID and fall back to the name only for a record that has not been stamped — and the
  // assert below FAILS if any pregen still lacks one, because the id is what keeps this guard immune
  // to a display-name collision. Resolving by NAME is how a rename could re-home a shipped character
  // in the first place. THE SUBJECT IS UNCHANGED: every pregen's base must still equal its species
  // registry base, and this guard kept failing until the DATA was fixed rather than being loosened.
  const rec = (c.speciesId && speciesReg[c.speciesId]) || spByName[(c.species || '').trim().toLowerCase()];
  if (!rec) { baseMismatch.push({ name: c.name, species: c.species, why: 'species unresolvable' }); return; }
  if (c.woundBase !== rec.wound_threshold_base || c.strainBase !== rec.strain_threshold_base) {
    baseMismatch.push({ name: c.name, got: [c.woundBase, c.strainBase], registry: [rec.wound_threshold_base, rec.strain_threshold_base] });
  }
  const chs = c.characteristics || {};
  [['woundThreshold', 'wound_threshold_base', 'brawn'], ['strainThreshold', 'strain_threshold_base', 'willpower']]
    .forEach(function (p) {
      const snap = (c.derived || {})[p[0]];
      if (typeof snap !== 'number') return;
      // B-39/B-44: the expectation now includes the character's OWN declared derivedBonuses.
      // Three pregens (Ryn Kessig, Dorn Reva — Toughened; Maro Jinx — Grit) carried a
      // threshold-raising talent while storing the value WITHOUT it and no derivedBonuses at all,
      // so the bonus was never applied at render either. That lap wrote their bonuses from their
      // own talents and raised the snapshots to match. Adding the bonus term here STRENGTHENS the
      // assert — base + characteristic + declared bonus — rather than waiving three names, which is
      // what a DECLARED-list entry would have done.
      const bonusField = p[0] === 'woundThreshold' ? 'woundThresholdBonus' : 'strainThresholdBonus';
      const bonus = ((c.derivedBonuses || {})[bonusField]) || 0;
      if (snap !== rec[p[1]] + (chs[p[2]] || 0) + bonus) {
        // Recorded for EVERY divergence, waived or not — the staleness arm below cannot tell a closed
        // hole from an open one unless the measurement happens independently of the waiver list.
        if (diverges.indexOf(c.name) === -1) diverges.push(c.name);
        if (!DECLARED[c.name]) {
          undeclared.push({ name: c.name, field: p[0], snapshot: snap, expected: rec[p[1]] + (chs[p[2]] || 0) + bonus });
        }
      }
    });
});
check('every pregen base equals its SPECIES REGISTRY base (not snapshot minus characteristic)',
  baseMismatch.length === 0, baseMismatch);
check('no UNDECLARED snapshot/registry discrepancy (declared: ' + (Object.keys(DECLARED).join(', ') || 'none') + ')',
  undeclared.length === 0, undeclared);

// THE STALENESS ARMS (2026-09-20). Both fired on the two entries this list used to hold.
const declaredNames = Object.keys(DECLARED);
const walked = chars.map(function (c) { return c.name; });
const orphaned = declaredNames.filter(function (n) { return walked.indexOf(n) === -1; });
check('no DECLARED name is an ORPHAN — a waiver must name a record this file walks (Dao Jodh was not one)',
  orphaned.length === 0, orphaned);
const stale = declaredNames.filter(function (n) { return diverges.indexOf(n) === -1; });
check('no DECLARED entry is STALE — a name whose discrepancy has closed comes off the list (Wicket had)',
  stale.length === 0, stale);
check('the staleness arms are NON-VACUOUS — they read the walked roster (' + walked.length +
  ') and the measured divergences (' + diverges.length + '), so an empty DECLARED list is a fact and not a skip',
  walked.length > 0 && Array.isArray(diverges));

// The floor must be a structural NO-OP for a modern record — nothing writes `sheet.derived` any
// more, and a floor that could reach a modern sheet would be able to pin a stale value.
const modern = {
  characteristics: { brawn: 2, willpower: 2 }, woundBase: 10, strainBase: 10, forceRatingBase: 0,
  derivedBonuses: { woundThresholdBonus: 0, strainThresholdBonus: 0, forceRatingBonus: 0 },
};
const md = CR.computeDerived(modern, null);
check('a modern record (no `derived`) is unfloored: wound 12 / strain 12 / FR 0',
  md.woundThreshold === 12 && md.strainThreshold === 12 && md.forceRating === 0,
  { wound: md.woundThreshold, strain: md.strainThreshold, fr: md.forceRating });

// And growth must still show THROUGH the floor: a bonus lifting the value above the snapshot wins.
const grown = Object.assign({}, modern, {
  derived: { woundThreshold: 12, strainThreshold: 12, forceRating: 0 },
  derivedBonuses: { woundThresholdBonus: 3, strainThresholdBonus: 0, forceRatingBonus: 0 },
});
check('a bonus above the snapshot still raises the value (the floor is a floor, not a clamp)',
  CR.computeDerived(grown, null).woundThreshold === 15, CR.computeDerived(grown, null).woundThreshold);

// soak/defense must NOT be floored: equipped armour is a LIVE input and unequipping it is supposed
// to lower them. A floor there would re-break the very bug class CS-2/R-DAR exists to kill.
const armored = {
  characteristics: { brawn: 2, willpower: 2 }, woundBase: 10, strainBase: 10,
  derived: { soak: 5, meleeDefense: 2, rangedDefense: 2 },
  derivedBonuses: { soakBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
};
const bare = CR.computeDerived(armored, null);
check('soak is NOT floored by the snapshot (unequipping armour must lower it)', bare.soak === 2, bare.soak);
check('melee/ranged defense are NOT floored by the snapshot',
  bare.meleeDefense === 0 && bare.rangedDefense === 0, { md: bare.meleeDefense, rd: bare.rangedDefense });

console.log('');
if (failures) { console.error('pregen legacy-shape guard: ' + failures + ' FAILED'); process.exit(1); }
console.log('pregen legacy-shape guard: ALL PASS');
