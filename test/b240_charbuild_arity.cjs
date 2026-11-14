/**
 * b240_charbuild_arity.cjs — B-240: every `computeDerived` caller must pass the charbuild.
 *
 * WHAT GOES WRONG. `computeDerived(sheet, equipment, charbuild)` consults `speciesTalentBonuses`
 * ONLY when the third argument is present, and that function's sole contribution is bonuses from
 * talents a SPECIES grants. A 2-arg call therefore undercounts by exactly the species-granted
 * portion — silently, because it returns a plausible number rather than throwing.
 *
 * LATENT TODAY, AND THE GUARD SAYS SO (R-BLL-2 / R-BLL-3, ruling `b240-latent-not-live`).
 * Censused over base + every mods overlay, the species-granted talents carrying a derived effect
 * are `enduring` (soakBonus, 43 species) and `superior_reflexes` (meleeDefenseBonus, 1). ZERO
 * species grant `force_rating`, `grit` or `toughened` — and no 2-arg caller read soak or melee
 * defence, so no shipped character ever saw a wrong number. The defect is a code inconsistency
 * that becomes live the moment the DATA changes.
 *
 * SO THE BEHAVIOURAL FIXTURE BELOW IS **SYNTHETIC, DELIBERATELY**: it invents a species that grants
 * `force_rating`, because no real one does. It proves the CODE inconsistency — that the two arities
 * disagree — not a player-visible symptom. §2's call-site census is the part that pins the fix.
 * B-701 (FaD p.282; f100-triage-census-card ADDENDUM 12): a Force Rating grant counts only with Force access, so the
 * synthetic species also carries `force_rating: 1` — the access predicate's species member — and the FR divergence stays.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'player', 'app.jsx'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}
console.log('b240_charbuild_arity — a computeDerived caller that drops the charbuild undercounts');

// ── 1. THE DIVERGENCE, EXECUTED on a SYNTHETIC charbuild (see the header: no real species grants it)
const sandbox = { module: { exports: {} }, console, JSON, Math, Object, Array, String, Number, Boolean, isFinite };
sandbox.window = sandbox; sandbox.global = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8'), sandbox, { filename: 'charResolve.js' });
const CR = sandbox.CharResolve;

const SYNTH_CHARBUILD = {
  species: {
    synth_force_species: {
      id: 'synth_force_species', name: 'Synthetic Force Species',
      force_rating: 1,   // B-701 (ADDENDUM 12): Force access by the predicate's species member, so the grant counts
      // the shape speciesTalentGrants reads: starting_talents[].talent / .ranks
      starting_talents: [{ talent: 'force_rating', ranks: 1 }, { talent: 'enduring', ranks: 2 }],
    },
  },
  // F-100 R-FEGC-1: the resolver reads talent effects from the registry and THROWS without one. An EMPTY
  // registry is the old-data case (no record carries effects[]) → the frozen fallback, same numbers.
  talents: {},
};
const SHEET = {
  speciesId: 'synth_force_species', species: 'Synthetic Force Species',
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  skills: {}, forceRatingBase: 0, woundBase: 10, strainBase: 10,
  derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0,
                    meleeDefenseBonus: 0, rangedDefenseBonus: 0, forceRatingBonus: 0 },
  derivedConditional: [],
};

const twoArg = CR.computeDerived(SHEET, null);
const threeArg = CR.computeDerived(SHEET, null, SYNTH_CHARBUILD);

check('SYNTHETIC: the 2-arg call reports Force Rating 0 — the species grant is invisible to it',
  twoArg.forceRating === 0, JSON.stringify(twoArg.forceRating));
check('SYNTHETIC: the 3-arg call reports Force Rating 1 — the species grant is counted',
  threeArg.forceRating === 1, JSON.stringify(threeArg.forceRating));
check('SYNTHETIC: the two arities DISAGREE — which is the whole defect',
  twoArg.forceRating !== threeArg.forceRating);
check('SYNTHETIC: soak diverges the same way (enduring x2 — the effect real species DO grant)',
  threeArg.soak - twoArg.soak === 2, `2-arg ${twoArg.soak} vs 3-arg ${threeArg.soak}`);

// ── 2. THE CALL-SITE CENSUS — the part that pins the fix (R-BLL-1: all four sites) ────────────
// D-507 (handoff `encounters-e3-dicehub-move`): DiceHub's call moved VERBATIM with its closure to lib/shared/diceHub.jsx — the
// census reads each file on its own and names the file of every site
const HUB = fs.readFileSync(path.join(ROOT, 'lib', 'shared', 'diceHub.jsx'), 'utf8');
const calls = [];
[['player/app.jsx', APP], ['lib/shared/diceHub.jsx', HUB]].forEach(function (fsrc) {
  fsrc[1].split('\n').forEach(function (line, i) {
    const m = line.match(/CharResolve\.computeDerived\(([^)]*)\)/);
    if (!m || /^\s*\/\//.test(line)) return;
    const args = m[1].split(',').length;
    calls.push({ file: fsrc[0], line: i + 1, args: args, text: line.trim().slice(0, 96) });
  });
});
check('every computeDerived call site is found by the census', calls.length >= 8, String(calls.length));
const twoArgSites = calls.filter(function (c) { return c.args < 3; });
check('ZERO 2-arg CharResolve.computeDerived call sites remain in player/app.jsx or lib/shared/diceHub.jsx',
  twoArgSites.length === 0,
  twoArgSites.map(function (c) { return c.file + ':' + c.line + '  ' + c.text; }).join('\n          '));

console.log('\nb240_charbuild_arity: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
