#!/usr/bin/env node
/**
 * species_variant_resolver.cjs — STANDING guard for FORK B's one resolution point
 * (rulings `csg-v7-subspecies-and-sex`, `csg-v7-option-characteristics-schema`, `csg-option-contract-inert`).
 *
 * WHY THIS GUARD SUPPLIES ITS OWN SPECIES. It was written while NO shipped record carried a variant,
 * so a guard reading only `species.json` would have been green for the wrong reason. The fixtures
 * below were the shape the v7 import was expected to deliver, exercised before it arrived.
 *
 * C-B158G-1 — THAT WINDOW HAS CLOSED, AND THIS PARAGRAPH USED TO DENY IT. It read "No shipped record
 * carries a variant yet: 129 option groups, 0 with `preselect`, 0 options with
 * characteristics/thresholds/starting_xp." Measured on the shipped registry today:
 *
 *     option groups ........................................ 205   (was 129)
 *     groups carrying `preselect` ............................. 0   (still true)
 *     options carrying characteristics/thresholds/starting_xp   43   (was 0)
 *     ...of which sit in a `Subspecies` group ................. 43   (all of them — C-B160-2)
 *
 * The stale half was not cosmetic: this paragraph is the stated JUSTIFICATION for the guard being
 * fixture-only, and a reader deciding whether shipped data can exercise these paths would have read
 * "0" and concluded it cannot, when 43 options now can. Same defect the `"the CSG set is SIX and
 * stays six"` sentence had — a comment outliving the world it described (ruling
 * `b158-b160-guard-anchors` §3, R-B158G-2: a guard's header is part of the guard).
 *
 * THE FIXTURES STAY, and not out of sentiment: they exercise shapes the shipped data still does not
 * carry — `preselect` remains 0 across all 205 groups — and a fixture is the only way to pin a
 * contract for data that has not arrived. What changed is that this file may no longer be described
 * as guarding a latency; the shipped half is pinned by C-B160-2 at the end of this file.
 *
 * WHAT IT PINS:
 *   1. No pick + `preselect` -> the FIRST option (ruling §4-STATES: a legacy sheet predating the
 *      variant still prints a complete stat block).
 *   2. No pick + NO `preselect` -> the BASE record, untouched. Jason 2026-08-10 ("No preselect"):
 *      Gand shows XP 100 until the player chooses, because the app does not pick a drawback.
 *   3. An explicit pick beats the preselect default, on all eight overridable numbers.
 *   4. An unrecognised pick id falls back to the same no-pick rule rather than throwing — the
 *      absent-tolerant discipline `charResolve.js:546` already uses (R-Y2-1).
 *   5. Characteristics replace COMPLETELY, never merge. A variant is a stat block, not a patch.
 *   6. THE XP DIVISION OF LABOUR (Q2 = both forms): `speciesEffective` returns the ABSOLUTE and
 *      never applies `xp_adjustment`, because the delta rides `character.speciesOption.xp` (B-22).
 *      If this ever changes, Gand's +10 double-counts and nothing else would catch it.
 *   7. The real shipped Gand record resolves to its base with no pick — the contract measured
 *      against live data, not only against fixtures.
 *
 * Run:  node test/species_variant_resolver.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CharResolve = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const speciesReg = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species;

let fails = 0;
const check = (label, ok, detail) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || detail === undefined ? '' : '  — ' + JSON.stringify(detail)));
  if (!ok) fails++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const F = { brawn: 2, agility: 1, intellect: 2, cunning: 3, willpower: 2, presence: 2 };
const M = { brawn: 3, agility: 2, intellect: 1, cunning: 2, willpower: 2, presence: 2 };

// v7's Togorian, pre-split: characteristics AND thresholds AND absolute XP all differ by variant.
const TOGORIAN = {
  id: 'fixture_togorian', name: 'Togorian',
  characteristics: M, wound_threshold_base: 14, strain_threshold_base: 8, starting_xp: 90,
  option_choices: [{
    name: 'Sex', display_name: 'Sex', preselect: true,
    options: [
      { id: 'female', name: 'Female', characteristics: F, wound_threshold_base: 12, strain_threshold_base: 10, starting_xp: 95 },
      { id: 'male', name: 'Male', characteristics: M, wound_threshold_base: 14, strain_threshold_base: 10, starting_xp: 90 },
    ],
  }],
};

// v7's H'nemthe: characteristics IDENTICAL, the male option is a printed +15 XP DELTA.
const HNEMTHE = {
  id: 'fixture_hnemthe', name: "H'nemthe",
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 1, willpower: 3, presence: 2 },
  wound_threshold_base: 8, strain_threshold_base: 10, starting_xp: 85,
  option_choices: [{
    name: 'Sex', display_name: 'Sex', preselect: true,
    options: [{ id: 'female', name: 'Female' }, { id: 'male', name: 'Male', xp_adjustment: 15 }],
  }],
};

const E = (rec, picks) => CharResolve.speciesEffective(rec, picks);

// ── 1. no pick + preselect -> first option ──
const d = E(TOGORIAN, null);
check('preselect + no pick resolves to the FIRST option (chars)', eq(d.characteristics, F), d.characteristics);
check('preselect + no pick resolves to the FIRST option (WT/ST/XP)',
  d.wound_threshold_base === 12 && d.strain_threshold_base === 10 && d.starting_xp === 95,
  [d.wound_threshold_base, d.strain_threshold_base, d.starting_xp]);

// ── 2. no pick + NO preselect -> the base record, untouched ──
const noPre = JSON.parse(JSON.stringify(TOGORIAN));
delete noPre.option_choices[0].preselect;
const np = E(noPre, null);
check('no preselect + no pick leaves the BASE record (Jason: "No preselect")',
  eq(np.characteristics, M) && np.wound_threshold_base === 14 && np.strain_threshold_base === 8 && np.starting_xp === 90,
  [np.characteristics, np.wound_threshold_base, np.strain_threshold_base, np.starting_xp]);

// ── 3. an explicit pick beats the default ──
const male = E(TOGORIAN, { sex: 'male' });
check('an explicit pick overrides the preselect default',
  eq(male.characteristics, M) && male.wound_threshold_base === 14 && male.strain_threshold_base === 10 && male.starting_xp === 90,
  [male.characteristics, male.wound_threshold_base, male.starting_xp]);
check('the pick is keyed by the group-name SLUG, not its index', eq(E(TOGORIAN, { sex: 'female' }).characteristics, F));

// ── 4. absent-tolerant: an id nobody recognises does not throw and does not half-apply ──
let threw = null;
let bogus;
try { bogus = E(TOGORIAN, { sex: 'no_such_option' }); } catch (e) { threw = String(e); }
check('an unrecognised pick id does not throw', threw === null, threw);
check('an unrecognised pick id falls back to the no-pick rule (preselect -> first)',
  bogus && eq(bogus.characteristics, F), bogus && bogus.characteristics);

// ── 5. characteristics REPLACE, never merge ──
const partial = JSON.parse(JSON.stringify(TOGORIAN));
partial.option_choices[0].options[0].characteristics = { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 };
const rep = E(partial, { sex: 'female' });
check('characteristics are a complete replacement, not a merge',
  eq(rep.characteristics, { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 }), rep.characteristics);

// ── 6. the XP division of labour — the delta is NOT applied here ──
const hnF = E(HNEMTHE, { sex: 'female' });
const hnM = E(HNEMTHE, { sex: 'male' });
check('an xp_adjustment option leaves starting_xp at the ABSOLUTE (delta rides speciesOption.xp)',
  hnF.starting_xp === 85 && hnM.starting_xp === 85, [hnF.starting_xp, hnM.starting_xp]);
check('identical-characteristic variants do not disturb the six numbers',
  eq(hnM.characteristics, HNEMTHE.characteristics), hnM.characteristics);

// ── 7. the shipped registry, unchanged by the contract ──
const gand = speciesReg.gand;
const g = E(gand, null);
check('shipped gand, no pick: base characteristics', eq(g.characteristics, gand.characteristics), g.characteristics);
check('shipped gand, no pick: XP 100 and no drawback applied',
  g.starting_xp === gand.starting_xp && g.starting_xp === 100, g.starting_xp);
const gLungs = E(gand, { breathing: 'has_lungs' });
check('shipped gand, HAS LUNGS picked: still 100 here — the +10 is B-22\'s delta, banked elsewhere',
  gLungs.starting_xp === 100, gLungs.starting_xp);

// THE HEADER'S CONTRACT HAS TWO ARMS AND THIS LOOP ASSERTED ONLY ONE (B-398; ruling
// `b412-species-parity-gate` A2-1). "No pick + `preselect` -> the FIRST option; no pick + NO
// `preselect` -> the BASE record" — and until B-398 wrote the flag onto 21 groups, no shipped
// species took the first branch, so a loop that checked every record against its BASE was green
// while covering half the claim. Split by the flag, and BOTH ARMS POSITIVE: the population that
// leaves the first assert enters the second, so neither can go quiet by losing its members.
const preselecting = (rec) => (rec.option_choices || []).some((g) => g.preselect);
const overridable = (r, base) => ({
  characteristics: r.characteristics, wt: r.wound_threshold_base,
  st: r.strain_threshold_base, xp: r.starting_xp, base,
});
let drift = [], variantDrift = [], plain = 0, variant = 0;
Object.keys(speciesReg).forEach((id) => {
  const rec = speciesReg[id];
  const r = E(rec, null);
  if (!preselecting(rec)) {
    plain += 1;
    if (!eq(r.characteristics, rec.characteristics) || r.wound_threshold_base !== rec.wound_threshold_base
        || r.strain_threshold_base !== rec.strain_threshold_base || r.starting_xp !== rec.starting_xp) drift.push(id);
    return;
  }
  // ARM 2 — asserted POSITIVELY: with no pick recorded the resolver must land on option[0]'s values
  // for every overridable field that option actually carries, and keep the base's for the rest.
  variant += 1;
  const g = (rec.option_choices || []).find((x) => x.preselect);
  const o = (g.options || [])[0] || {};
  // BOTH FAMILIES, and only where the resolver applies them. An option may carry an ABSOLUTE
  // (`wound_threshold_base`) or a DELTA (`wound_threshold_adjustment`); Vaathkree's Bulky is a
  // delta, base 11 +2 = 13, and an expectation reading only the absolute called it 11 and failed
  // this arm on the resolver's correct answer. `xp_adjustment` is deliberately NOT summed here:
  // charResolve keeps it flowing through `character.speciesOption.xp` at the call site, so summing
  // it in both places would double-count — the expectation mirrors that split rather than tidying it.
  const want = {
    characteristics: o.characteristics || rec.characteristics,
    wt: (o.wound_threshold_base != null ? o.wound_threshold_base : rec.wound_threshold_base)
        + (o.wound_threshold_adjustment || 0),
    st: (o.strain_threshold_base != null ? o.strain_threshold_base : rec.strain_threshold_base)
        + (o.strain_threshold_adjustment || 0),
    xp: o.starting_xp != null ? o.starting_xp : rec.starting_xp,
  };
  if (!eq(r.characteristics, want.characteristics) || r.wound_threshold_base !== want.wt
      || r.strain_threshold_base !== want.st || r.starting_xp !== want.xp) {
    variantDrift.push({ id, got: { wt: r.wound_threshold_base, xp: r.starting_xp },
                        want: { wt: want.wt, xp: want.xp } });
  }
});
check('the ' + plain + ' species with NO preselecting group resolve to their own record with no picks',
  drift.length === 0, drift.slice(0, 5));
// 516 + 21 = 537. The 21 are B-398's write set (ruling `b417-preselect-rule-narrowed` A1-1):
// csg_vaathkree's Variable Forms -> Bulky's WT/XP, csg_xidec's Genders -> its first gender, and the
// nineteen Subspecies groups -> option[0]. Named counts, so a species silently leaving EITHER
// population is a failure rather than a smaller green number.
check('and the ' + variant + ' WITH one resolve, with no picks, to their first option (B-398)',
  variantDrift.length === 0, variantDrift.slice(0, 3));
check('the two arms partition the shelf — ' + plain + ' + ' + variant + ' = '
  + Object.keys(speciesReg).length,
  plain + variant === Object.keys(speciesReg).length, { plain, variant });


// ── 8. C-SVR-1 — a pick that changes nothing resolved must not trigger a re-seed ──
// Ruling `species-variant-resolver` §4: the first cut of C-OCS-4's fix dispatched the characteristics
// seed on EVERY pick change, so flipping Twi'lek's free skill from Charm to Deception reverted XP
// already spent raising Brawn. This pins the deciding predicate, not a copy of it: the creator calls
// the same exported function.
// R-B161G-1 — the sentence that used to sit here ("no shipped option carries `characteristics`, so
// the resolved set IS the base record for all N shipped species") was true when written and FALSE
// since the v7 re-import. It is deleted rather than updated: the shelf's contents are what the
// asserts below MEASURE, and restating a count in a comment creates a second copy that no run
// checks.
const twilek = speciesReg.twi_lek;
check("fixture check: Twi'lek ships a skill-only pick-one (Charm / Deception)",
  !!twilek && (twilek.option_choices || []).length === 1
  && (twilek.option_choices[0].options || []).map((o) => o.id).join(',') === 'charm,deception',
  twilek && (twilek.option_choices || []).map((g) => g.name));

const tCharm = E(twilek, { skills: 'charm' });
const tDecep = E(twilek, { skills: 'deception' });
check('a SKILL pick change resolves identically, so nothing may be re-seeded (C-SVR-1)',
  CharResolve.speciesResolvedEqual(tCharm, tDecep) === true,
  [tCharm.characteristics, tDecep.characteristics]);
check("Twi'lek's resolved characteristics are its own record either way",
  eq(tCharm.characteristics, twilek.characteristics) && eq(tDecep.characteristics, twilek.characteristics));

// the other half: a pick that DOES change the numbers must still be seen as a change
check('a VARIANT pick change is NOT equal, so it still re-seeds',
  CharResolve.speciesResolvedEqual(E(TOGORIAN, { sex: 'female' }), E(TOGORIAN, { sex: 'male' })) === false);
check('the predicate compares every overridable field, not just characteristics',
  CharResolve.speciesResolvedEqual(
    { characteristics: F, wound_threshold_base: 12, strain_threshold_base: 10, starting_xp: 95 },
    { characteristics: F, wound_threshold_base: 12, strain_threshold_base: 10, starting_xp: 90 }) === false);

// EVERY shipped skill-only group: no pick within it may change a resolved value.
let churn = [];
Object.keys(speciesReg).forEach((id) => {
  const rec = speciesReg[id];
  (rec.option_choices || []).forEach((g) => {
    const opts = g.options || [];
    if (opts.length < 2) return;
    const gid = String(g.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const first = E(rec, { [gid]: opts[0].id });
    opts.slice(1).forEach((o) => {
      if (!CharResolve.speciesResolvedEqual(first, E(rec, { [gid]: o.id }))) churn.push(id + '/' + g.name + '/' + o.id);
    });
  });
});
// C-B160-1a/1b (ruling `b158-b160-census-guard-anchors` §3.5) — DELETED, NOT RE-POINTED.
// Two asserts stood here: "no pick in any of the 129 SHIPPED groups changes a resolved value" and
// "speciesReseedNeeded: no shipped species re-seeds on any pick change". Both encoded a LATENCY —
// *no shipped record does this yet* — which `species-variant-resolver-addendum` said in advance the
// v7 import would end, and it has: 24 options across 19 species now move a resolved value. The
// label's own "129 groups" was a third stale literal (205 today), which is further evidence both
// were scaffolding.
// DO NOT RESTORE THEM AS LOST COVERAGE. The subject is pinned better below, by construction on
// fixtures with a mutation behind it — see the C-SVRA-2 block — instead of by counting shipped data,
// which would have meant asserting a permitted-churn roster that every future import lap edits: the
// same defect as B-158, newly created.
// What the deletion WOULD have given up is caught instead by the inverted promise at the end of this
// file (C-B160-2): an overriding field may appear only in a group that means something mechanical.

// The DECISION the creator actually asks, not a lookalike. Pinning only the comparison would leave
// app.jsx free to hardwire its re-seed to true with every check here still green.
check('speciesReseedNeeded: a Twi\'lek skill flip does NOT re-seed (the regression C-SVR-1 names)',
  CharResolve.speciesReseedNeeded(twilek, { skills: 'charm' }, { skills: 'deception' }) === false);
check('speciesReseedNeeded: a Togorian variant flip DOES re-seed',
  CharResolve.speciesReseedNeeded(TOGORIAN, { sex: 'female' }, { sex: 'male' }) === true);
check('speciesReseedNeeded: the confirm path (no previous picks) always seeds',
  CharResolve.speciesReseedNeeded(twilek, undefined, { skills: 'charm' }) === true);

// ---- C-SVRA-2 — THE ACTION COVERS WHAT THE PREDICATE DETECTS, AND NO MORE -------------------
// The predicate fires on ANY resolved change; the creator's re-seed action reset all six
// characteristics whenever it ran. That superset is the defect: an option moving only XP or a
// threshold would reset characteristics for no reason and silently revert the XP a player had
// spent raising them. Latent while no shipped option carried those fields — the v7 import is what
// ends the latency, which is why the condition was bound here.
// The fixture is the one the ruling names: an option carrying `starting_xp` and NO characteristics.
const _mkVariant = (opt) => ({
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  wound_threshold_base: 10, strain_threshold_base: 10, starting_xp: 100,
  option_choices: [{ name: 'Genders', options: [
    { id: 'female', name: 'Female' }, Object.assign({ id: 'male', name: 'Male' }, opt)] }],
});
const XP_ONLY = _mkVariant({ starting_xp: 90 });
const WT_ONLY = _mkVariant({ wound_threshold_base: 12 });
const CHARS_TOO = _mkVariant({
  characteristics: { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 } });
const F2M = [{ genders: 'female' }, { genders: 'male' }];

check('C-SVRA-2: an XP-only variant flip DOES trip the predicate (a value moved)',
  CharResolve.speciesReseedNeeded(XP_ONLY, ...F2M) === true);
check('C-SVRA-2: ...but characteristics DID NOT move, so they must not be re-seeded',
  CharResolve.speciesCharsMoved(XP_ONLY, ...F2M) === false);
check('C-SVRA-2: a threshold-only flip likewise trips the predicate but not the characteristics',
  CharResolve.speciesReseedNeeded(WT_ONLY, ...F2M) === true
  && CharResolve.speciesCharsMoved(WT_ONLY, ...F2M) === false);
check('C-SVRA-2: a flip that DOES move characteristics still re-seeds them',
  CharResolve.speciesCharsMoved(CHARS_TOO, ...F2M) === true);
check('C-SVRA-2: the confirm path with no previous picks still seeds unconditionally',
  CharResolve.speciesCharsMoved(XP_ONLY, undefined, { genders: 'male' }) === true);
// THE OLD RULE, RUN AS A MUTANT — "seed whenever the predicate fires" is what shipped before, and
// it must FAIL the XP-only case. Without this the four checks above pass under the defect too.
const _oldRule = (rec, a, b) => CharResolve.speciesReseedNeeded(rec, a, b);
check('C-SVRA-2 MUTATION: the OLD rule (seed whenever the predicate fires) resets characteristics '
  + 'on an XP-only flip — demonstrated failing, which is why the new rule is not a no-op',
  _oldRule(XP_ONLY, ...F2M) === true && CharResolve.speciesCharsMoved(XP_ONLY, ...F2M) === false);
// C-B160-1a — the second latency assert was here ("no shipped species re-seeds on any pick change")
// and is DELETED for the reasons at its sibling above. Its successor is C-SVRA-2's fixtures.

// ---- C-B160-2 — RE-POINTED TO THE STRUCTURAL PREDICATE (ruling `species-option-multiselect-guard-repoint` R-SGR-1)
// Deleting the two latency asserts gives something up, and not silently: they incidentally caught
// UNINTENDED churn — an import accidentally attaching mechanics to a COSMETIC option. That risk is
// not hypothetical. v7 ships a group named `Castes` whose options `green_eyes` and `brown_scales`
// hand out a free skill rank.
//
// THE OLD TEST WAS A NAME TEST AND IT BROKE ON SOUND STRUCTURE. It read `gname !== 'subspecies'`,
// while THIS FILE'S OWN COMMENT stated the intent as "only a group that MEANS something mechanical
// may override". Vaathkree's `Variable Forms` means something mechanical — its Humanoid form prints
// "Presence 3" — and the name test called it an offender. That is the same label-vs-structure defect
// this file already documents twice in its header (B-158; "the CSG set is SIX and stays six"), and
// the third instance in this programme. **Guards key on structure; names are presentation.**
//
// THE PREDICATE IS NOW Q2'S RULED CONTRACT, STATED AS A GUARD: an OVERRIDING field may appear only
// in a group whose EFFECTIVE bounds are pick-exactly-one (min_picks/max_picks absent, or both 1).
// An absolute cannot combine order-independently, so it is illegal precisely where more than one
// option can be taken at once. This SUBSUMES the old check (every Subspecies group is 1/1), admits
// Variable Forms legitimately, and HARD-GUARDS Droid's 0-3 menu against absolutes forever.
// `xp_adjustment` stays excluded — it is a DELTA and legitimately appears in `Genders`.
const OVERRIDING = ['characteristics', 'wound_threshold_base', 'strain_threshold_base', 'starting_xp'];
const isSinglePick = (g) => {
  const mn = g && g.min_picks != null ? g.min_picks : 1;
  const mx = g && g.max_picks != null ? g.max_picks : 1;
  return mn === 1 && mx === 1;
};
const offenders = [];
for (const [id, rec] of Object.entries(speciesReg)) {
  for (const g of rec.option_choices || []) {
    if (isSinglePick(g)) continue;
    for (const o of g.options || []) {
      const has = OVERRIDING.filter((f) => o[f] !== undefined);
      if (has.length) offenders.push(`${id}/${g.name}/${o.id}: ${has.join(',')}`);
    }
  }
}
check('C-B160-2: an overriding field appears ONLY in a pick-exactly-one group '
  + `(${offenders.length ? offenders.length + ' offender(s)' : 'none'})`,
  offenders.length === 0, offenders.slice(0, 5));

// THE NAMED MUTANT — RE-AIMED (R-SGR-1). The previous mutant planted `characteristics` on
// `caamasi/Skills`, a 1/1 group that the NEW predicate legitimately permits, so it would have gone
// SILENT and the re-point would have deleted this guard behind a green tick. It now targets a
// group that can take MORE THAN ONE option at once, which is exactly where an absolute is illegal.
const _mutant = JSON.parse(JSON.stringify(speciesReg));
let _mutated = null;
for (const [id, rec] of Object.entries(_mutant)) {
  for (const g of rec.option_choices || []) {
    if (isSinglePick(g)) continue;                       // aim at a MULTI-pick group, not a 1/1
    if ((g.options || []).length) {
      g.options[0].characteristics = { brawn: 9 };
      _mutated = `${id}/${g.name}/${g.options[0].id}`;
      break;
    }
  }
  if (_mutated) break;
}
// THE MUTANT MUST HAVE FOUND SOMETHING TO PLANT ON. The re-aimed mutant needs a multi-pick group to
// exist in the shipped registry; today exactly one does (Droid's 0-3 menu, structured this lap). If
// that record were ever reverted the loop above would plant nothing, `_mutantOffenders` would be
// empty, and the MUTATION check below would pass for the wrong reason — a silent mutant, which is
// the failure mode R-SGR-1 was written about one level up. Asserted rather than assumed.
check('C-B160-2 MUTATION: the mutant found a multi-pick group to target (a silent mutant is a '
  + 'deleted guard)', _mutated !== null, _mutated);

const _mutantOffenders = [];
for (const [id, rec] of Object.entries(_mutant)) {
  for (const g of rec.option_choices || []) {
    for (const o of g.options || []) {
      if (OVERRIDING.some((f) => o[f] !== undefined) && !isSinglePick(g)) {
        _mutantOffenders.push(`${id}/${g.name}/${o.id}`);
      }
    }
  }
}
check(`C-B160-2 MUTATION: planting characteristics on ${_mutated || '(none found)'} turns it RED `
  + '— so the assert can catch the thing the deleted census used to catch',
  _mutated !== null && _mutantOffenders.length > 0);

// ── 9. B-147 — re-selecting a species must not wipe the rest of the skills object ──
// `handleSpeciesConfirm` used to dispatch `skills = {species grants only}` and the creator's reducer
// replaces wholesale, so a re-confirm threw away purchased ranks, `bought` entries and the
// freeCareer / freeSpec flags the career and specialisation steps set. Latent forwards, reachable by
// going back. The species grant lands in `purchased`, the same field a bought rank uses, so the fix
// records what it last granted and removes exactly that.
const merge = CharResolve.speciesGrantMerge;

check('B-147: first confirm grants the skill and nothing else',
  eq(merge({}, {}, { charm: 1 }), { charm: { freeCareer: false, freeSpec: false, purchased: 1 } }));

const midSkills = {
  charm:     { freeCareer: false, freeSpec: false, purchased: 1 },               // the species grant
  piloting:  { freeCareer: true,  freeSpec: false, purchased: 0 },               // career free rank
  gunnery:   { freeCareer: false, freeSpec: true,  purchased: 0 },               // spec free rank
  vigilance: { freeCareer: false, freeSpec: false, purchased: 2 },               // bought with XP
  coercion:  { freeCareer: false, freeSpec: false, purchased: 0, bought: [10] }, // a bought entry
};
const after = merge(midSkills, { charm: 1 }, { deception: 1 });
check('B-147: the career free rank survives a re-confirm', after.piloting.freeCareer === true, after.piloting);
check('B-147: the spec free rank survives a re-confirm', after.gunnery.freeSpec === true, after.gunnery);
check('B-147: purchased ranks survive a re-confirm', after.vigilance.purchased === 2, after.vigilance);
check('B-147: bought entries survive a re-confirm', eq(after.coercion.bought, [10]), after.coercion);
check('B-147: the OLD species grant is removed', after.charm === undefined, after.charm);
check('B-147: the NEW species grant is applied', after.deception.purchased === 1, after.deception);
check('B-147: removing the grant leaves ranks the player bought in that same skill',
  merge({ charm: { freeCareer: false, freeSpec: false, purchased: 3 } }, { charm: 1 }, { deception: 1 }).charm.purchased === 2);
check('B-147: a skill carrying a free flag is not deleted when its grant is removed',
  merge({ charm: { freeCareer: true, freeSpec: false, purchased: 1 } }, { charm: 1 }, {}).charm.freeCareer === true);
check('B-147: re-confirming the SAME pick is a no-op', eq(merge(midSkills, { charm: 1 }, { charm: 1 }), midSkills));

// ── R-B161G-2 — A REAL SHIPPED OVERRIDE-BEARING PICK, RESOLVED ────────────────────────────────
// Ruling `b161-narrative-prose-repoint-gate` R-B161G-2, bound at `csg-v7-shelf-write` (C-V7SW-3).
// Everything above proves the override path on FIXTURES. The v7 import puts real options carrying
// characteristics and both thresholds onto the shipped shelf for the first time, so the path a
// player actually walks had never been exercised by an assert — and a regression there would be
// SILENT, which is the whole reason this is a condition.
//
// THE VICTIM IS SELECTED BY THE PREDICATE, NEVER HARD-CODED. An earlier draft of this idea named
// `csg_arkanian`; a re-import that renames or re-ids that species would have un-tested the path
// while still reporting green. So the population is derived here and every member is asserted —
// not the first match (R-UNH-1's first-match corollary: an assert that examines one row of a
// population it claims to cover is presumptively vacuous).
const overrideBearing = [];
Object.keys(speciesReg).sort().forEach((id) => {
  const rec = speciesReg[id];
  (rec.option_choices || []).forEach((g) => {
    const gid = String(g.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    (g.options || []).forEach((o) => {
      if (o.characteristics || o.wound_threshold_base !== undefined || o.strain_threshold_base !== undefined) {
        overrideBearing.push({ id, rec, group: g.name, gid, opt: o });
      }
    });
  });
});
// Non-vacuity FIRST: a population of zero would make every assert below pass while testing nothing.
check('R-B161G-2: the shelf ships override-bearing options at all (count > 0)',
  overrideBearing.length > 0, overrideBearing.length);
console.log('  [R-B161G-2] override-bearing options found: ' + overrideBearing.length
  + ' across ' + new Set(overrideBearing.map((v) => v.id)).size + ' species'
  + ' | groups: ' + [...new Set(overrideBearing.map((v) => v.group))].join(', '));

const badPick = [], badBase = [];
overrideBearing.forEach((v) => {
  const picked = E(v.rec, { [v.gid]: v.opt.id });
  // the pick's resolved values ARE the option's own data, field by field
  if (v.opt.characteristics && !eq(picked.characteristics, v.opt.characteristics)) badPick.push(v.id + '/' + v.opt.id + '/chars');
  if (v.opt.wound_threshold_base !== undefined && picked.wound_threshold_base !== v.opt.wound_threshold_base) badPick.push(v.id + '/' + v.opt.id + '/wt');
  if (v.opt.strain_threshold_base !== undefined && picked.strain_threshold_base !== v.opt.strain_threshold_base) badPick.push(v.id + '/' + v.opt.id + '/st');
  // and WITHOUT a pick the base record is untouched — the override must not leak into the default
  const bare = E(v.rec, {});
  if (!eq(bare.characteristics, v.rec.characteristics)
      || bare.wound_threshold_base !== v.rec.wound_threshold_base
      || bare.strain_threshold_base !== v.rec.strain_threshold_base) badBase.push(v.id);
});
check('R-B161G-2: every override-bearing pick resolves to that option\'s OWN characteristics and both thresholds',
  badPick.length === 0, badPick.slice(0, 5));
check('R-B161G-2: with NO pick, every one of those species still resolves to its BASE record',
  badBase.length === 0, badBase.slice(0, 5));
// THE MUTANT: a resolver that applies an option's characteristics but IGNORES its thresholds —
// the plausible half-implementation, and the one a fixture-only suite would never catch. It is run
// against the same real population and must FAIL the assert above, so the assert is shown capable
// of catching the bug it exists for rather than merely passing.
const mutantEffective = (rec, picks) => {
  const out = Object.assign({}, rec);
  (rec.option_choices || []).forEach((g) => {
    const gid = String(g.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const opt = (g.options || []).find((o) => o.id === picks[gid]);
    if (opt && opt.characteristics) out.characteristics = opt.characteristics;   // thresholds DROPPED
  });
  return out;
};
const mutantMisses = overrideBearing.filter((v) => {
  if (v.opt.wound_threshold_base === undefined) return false;
  return mutantEffective(v.rec, { [v.gid]: v.opt.id }).wound_threshold_base !== v.opt.wound_threshold_base;
});
check('R-B161G-2 MUTATION: a resolver that drops the option\'s thresholds FAILS on real shipped data '
  + '(' + mutantMisses.length + ' options would resolve a wrong threshold)',
  mutantMisses.length > 0, mutantMisses.length);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILURE(S)');
process.exit(fails === 0 ? 0 : 1);
