#!/usr/bin/env node
/**
 * species_option_multipick.cjs — STANDING guard for the multi-pick save shape
 * (ruling `species-option-menu-multiselect-save-shape` Q1/Q2, LAP B of `species-edge-case-audit-scope`).
 *
 * WHAT IS BEING GUARDED. A species option group used to persist exactly ONE option id. The CSG's
 * Droid entry prints "May choose 0-3 of the following abilities:" — verbatim in both v6 and v7,
 * confirmed by the source read in `Docs/CSG_DROID_VAATHKREE_SOURCE_READ.md` — so one id per group
 * can no longer express every group.
 *
 * THE SHAPE AT REST DID NOT CHANGE FOR ANYTHING ALREADY SAVED, and that is the property most worth
 * a standing guard. A stored SCALAR stays legal forever and is READ as a one-element list; nothing
 * rewrites a saved character. The absent-tolerance half (no key = no pick) is unchanged from B-23.
 *
 * WHY FIXTURES AND NOT SHIPPED DATA — stated because the last guard in this family was caught with
 * a stale justification (R-B158G-2: a guard's header is part of the guard). Measured on the shipped
 * registry AT THE TIME OF WRITING:
 *
 *     option groups ......................................... 205
 *     groups carrying min_picks / max_picks ................... 0   ← this is why fixtures exist
 *     options carrying wound/strain_threshold_adjustment ...... 0   ← and this
 *
 * NO shipped record exercises multi-pick yet: the vocabulary lands in this lap and Droid's rows are
 * structured in the next step, which is the never-ingest-without-consumers rule taken in the safe
 * order — the consumer first, so no field is ever live without something reading it. When Droid
 * ships, ADD a shipped-data leg here rather than replacing these; the fixtures cover shapes the
 * registry may never hold (a 3-pick group, an unknown id inside an array).
 *
 * Run: node test/species_option_multipick.cjs
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CharResolve = require(path.join(ROOT, 'lib/shared/charResolve.js'));

let fails = 0;
const check = (label, ok, detail) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || detail === undefined ? '' : '  — ' + JSON.stringify(detail)));
  if (!ok) fails++;
};

// A Droid-shaped fixture: 0..3 from five modifications, mixing threshold deltas with prose-only
// options. Values are the v7 workbook's, read at source — including the -15 jetpack XP, which is
// v7's revision of v6's -10 (the divergence is recorded in the source-read doc).
const DROIDISH = {
  id: 'fixture_droid', name: 'Droidish',
  characteristics: { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 },
  wound_threshold_base: 10, strain_threshold_base: 10, starting_xp: 190,
  option_choices: [{
    name: 'Modifications', display_name: 'Modifications', min_picks: 0, max_picks: 3,
    options: [
      { id: 'bulky', name: 'Bulky', special_abilities: [{ name: 'Ponderous', description: 'May only spend 1 maneuver moving per turn.' }] },
      { id: 'large', name: 'Large', wound_threshold_adjustment: 2, special_abilities: [{ name: 'Silhouette 2' }] },
      { id: 'limbless', name: 'Limbless', xp_adjustment: 30, special_abilities: [{ name: 'Limbless' }] },
      { id: 'small', name: 'Small', wound_threshold_adjustment: -2, special_abilities: [{ name: 'Silhouette 0' }] },
      { id: 'with_jetpack', name: 'With Jetpack', xp_adjustment: -15, special_abilities: [{ name: 'Flight' }] },
    ],
  }],
};

// A pick-ONE group with no bounds keys at all — i.e. every one of the 205 shipped groups.
const LEGACY = {
  id: 'fixture_legacy', name: 'Legacy',
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  wound_threshold_base: 10, strain_threshold_base: 10, starting_xp: 100,
  option_choices: [{
    name: 'Talents',
    options: [
      { id: 'gearhead', name: 'Gearhead', starting_talents: [{ talent: 'gearhead', ranks: 1 }] },
      { id: 'solid_repairs', name: 'Solid Repairs', starting_talents: [{ talent: 'solid_repairs', ranks: 1 }] },
    ],
  }],
};

const eff = (rec, picks) => CharResolve.speciesEffective(rec, picks);
const abil = (rec, picks) => (CharResolve.speciesAbilitiesResolved(rec, picks) || []).map((a) => a.name);

// ── BACK-COMPAT: the whole point of Q1's lean (c) ────────────────────────────────────────────
check('SCALAR reads as a ONE-ELEMENT list: one option resolves, not zero',
  eff(DROIDISH, { modifications: 'large' }).wound_threshold_base === 12,
  eff(DROIDISH, { modifications: 'large' }));
check('ABSENT key still grants nothing (B-23 absent-tolerance, unchanged)',
  eff(DROIDISH, {}).wound_threshold_base === 10 && abil(DROIDISH, {}).length === 0);
check('EMPTY array is a legal zero-pick — Droid may take 0 of 3',
  eff(DROIDISH, { modifications: [] }).wound_threshold_base === 10);

// ── MULTI-PICK + Q2's summing rule ───────────────────────────────────────────────────────────
check('ARRAY resolves EVERY chosen option, not just the first',
  abil(DROIDISH, { modifications: ['large', 'limbless'] }).join(',') === 'Silhouette 2,Limbless',
  abil(DROIDISH, { modifications: ['large', 'limbless'] }));
check('Q2 DELTAS SUM: Large (+2 WT) and Small (-2 WT) together cancel to the base',
  eff(DROIDISH, { modifications: ['large', 'small'] }).wound_threshold_base === 10,
  eff(DROIDISH, { modifications: ['large', 'small'] }).wound_threshold_base);
check('Q2 DELTAS SUM: Large alone is +2',
  eff(DROIDISH, { modifications: ['large'] }).wound_threshold_base === 12);
check('ORDER-INDEPENDENT: [small,large] resolves identically to [large,small]',
  eff(DROIDISH, { modifications: ['small', 'large'] }).wound_threshold_base
    === eff(DROIDISH, { modifications: ['large', 'small'] }).wound_threshold_base);
check('ORDER-INDEPENDENT for abilities too — resolved in GROUP order, never pick order',
  abil(DROIDISH, { modifications: ['limbless', 'large'] }).join(',')
    === abil(DROIDISH, { modifications: ['large', 'limbless'] }).join(','),
  abil(DROIDISH, { modifications: ['limbless', 'large'] }));
check('THREE picks resolve all three (the group\'s stated maximum)',
  abil(DROIDISH, { modifications: ['bulky', 'large', 'small'] }).length === 3,
  abil(DROIDISH, { modifications: ['bulky', 'large', 'small'] }));

// ── ROBUSTNESS: a stale id inside an array must not poison its siblings ──────────────────────
check('An UNKNOWN id inside an array is dropped, and the valid siblings still resolve',
  eff(DROIDISH, { modifications: ['large', 'no_such_option'] }).wound_threshold_base === 12
    && abil(DROIDISH, { modifications: ['large', 'no_such_option'] }).join(',') === 'Silhouette 2');
check('An array of ONLY unknown ids resolves to nothing, not to the base being replaced',
  eff(DROIDISH, { modifications: ['nope'] }).wound_threshold_base === 10
    && abil(DROIDISH, { modifications: ['nope'] }).length === 0);

// ── XP STAYS OUT OF speciesEffective, deliberately ───────────────────────────────────────────
// The delta families part company on purpose: `xp_adjustment` keeps flowing through
// `character.speciesOption.xp` at the call site (B-22, prod-verified for Gand). Summing it here
// as well would DOUBLE-COUNT it, so this asserts the absence rather than leaving it unstated.
check('xp_adjustment is NOT applied by speciesEffective (it sums at the call site — no double-count)',
  eff(DROIDISH, { modifications: ['limbless'] }).starting_xp === 190,
  eff(DROIDISH, { modifications: ['limbless'] }).starting_xp);

// ── BOUNDS DEFAULT: absence must keep meaning pick-exactly-one ───────────────────────────────
// Every shipped group omits these keys, so if absence ever stopped meaning 1/1, all 205 would
// change meaning silently and at once.
// STATED AS AN ABSENCE, ON PURPOSE: bounds are DECLARED in the schema but NOT YET ENFORCED by the
// resolver — enforcement belongs with the picker that has to refuse a fourth click, which is a
// later step of this lap. A guard that quietly assumed enforcement would go green on a resolver
// that never gained it. This asserts the CURRENT truth and reddens when enforcement lands, which
// is the signal to replace it with the real bound assertion.
check('bounds are declared but NOT yet enforced: a 4-element pick on a max_picks:3 group still ' +
      'resolves all four (RED here means enforcement landed — replace this with the real assertion)',
  abil(DROIDISH, { modifications: ['bulky', 'large', 'small', 'limbless'] }).length === 4,
  abil(DROIDISH, { modifications: ['bulky', 'large', 'small', 'limbless'] }));
check('a default (1/1) group given an ARRAY still resolves it — the reader never sees a raw value, ' +
      'whatever the bounds say',
  abil({ ...LEGACY, option_choices: [{ ...LEGACY.option_choices[0],
        options: LEGACY.option_choices[0].options.map((o) => ({ ...o, special_abilities: [{ name: o.name }] })) }] },
       { talents: ['gearhead', 'solid_repairs'] }).length === 2);


// ── R-B176-2 — BOTH DIRECTIONS, ON SHIPPED DATA ─────────────────────────────────────────────
// Ruling `b176-vaathkree-conditional-rank`. LAP C's conformance guard asks "does the offered thing
// LAND?" and is structurally blind to the mirror: a thing landing that should NOT. B-176 was exactly
// that — the importer hoisted Vaathkree's Resilience rank out of its `Bulky` form and shipped it
// unconditional, so every Vaathkree received a rank the book grants to one form. The repair moved it
// inside the option, and this asserts BOTH halves, because asserting only the positive would have
// been green before the repair too.
const fs = require('fs');
const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species;
const CB = { species: SPECIES };
const grantsFor = (pick) => {
  const sheet = { speciesId: 'csg_vaathkree' };
  if (pick) sheet.speciesOptionPicks = { variable_forms: pick };
  return CharResolve.creationSkillAllowance(sheet, CB).speciesGrants || {};
};

check('R-B176-2 POSITIVE: the Bulky form LANDS its Resilience rank',
  grantsFor('bulky').resilience === 1, grantsFor('bulky'));
check('R-B176-2 NEGATIVE: Extra Limbs lands NO species Resilience',
  grantsFor('extra_limbs').resilience === undefined, grantsFor('extra_limbs'));
check('R-B176-2 NEGATIVE: Humanoid lands NO species Resilience',
  grantsFor('humanoid').resilience === undefined, grantsFor('humanoid'));
check('R-B176-2 NEGATIVE: with NO form chosen, no species Resilience — the unconditional grant is gone',
  grantsFor(null).resilience === undefined, grantsFor(null));
check('R-B176-2 CONTROL: Negotiation stays unconditional on every path (it precedes the choose line)',
  [null, 'bulky', 'extra_limbs', 'humanoid'].every((p) => grantsFor(p).negotiation === 1));

// THE RE-HOIST MUTANT — put the rank back where the importer left it and the NEGATIVE legs must
// redden. Run against a deep copy so the checks above read the real registry.
const _reh = JSON.parse(JSON.stringify(SPECIES));
_reh.csg_vaathkree.starting_skills.push({ skill: 'resilience', rank_start: 1 });
const _rehGrants = (pick) => {
  const sheet = { speciesId: 'csg_vaathkree' };
  if (pick) sheet.speciesOptionPicks = { variable_forms: pick };
  return CharResolve.creationSkillAllowance(sheet, { species: _reh }).speciesGrants || {};
};
check('R-B176-2 MUTATION: re-hoisting the rank to starting_skills makes Humanoid grant Resilience '
  + 'again — so the NEGATIVE legs above can actually catch the defect they describe',
  _rehGrants('humanoid').resilience === 1, _rehGrants('humanoid'));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
