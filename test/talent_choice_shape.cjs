#!/usr/bin/env node
/**
 * talent_choice_shape.cjs — B-181 Tier 1: the talent career-skill choice.
 *
 * Pins the SAVE CONTRACT ruled by `talent-choice-persist-shape` (R-TCP-1..5) and the tier decision of
 * `talent-choice-triage` (R-TCT-1/2/5). The picker UX is NOT in this lap and is not pinned here.
 *
 * WHY EACH LEG EXISTS:
 *  - R-TCP-1 positional address: the choice is keyed by (specId, "row-col") — the SAME address
 *    ownership uses — because a talent can be owned more than once. A talent-id key merges purchases.
 *  - R-TCT-2 scaling FALLS OUT: two owned cells ⇒ two entries ⇒ 4 skills, summed at derive-time and
 *    never stored. Asserted by deriving, not by reading a stored number.
 *  - R-TCP-3 absent-tolerance: no key ⇒ today's behaviour byte-identically.
 *  - R-TCP-3 loud bug path: more picks in ONE entry than the grant allows THROWS (unlike the spec
 *    twin, which truncates old data silently — the difference is ruled, not accidental).
 *  - R-TCP-5 round trip: a save driven creator→sheet→creator keeps its picks, INCLUDING a treeless
 *    entry carrying no convenience label (the C-SPP-1 case).
 *  - R-TCT-5 per-record membership: the pin names records, never a regex count, so the next book
 *    import cannot re-collect the artifacts.
 *
 * THE SINGLE MEMBERSHIP AUTHORITY (ruling `b181-talent-choice-contract` §3, answering the deferred
 * R-PFR2-5/L1cb.opt question): the member list of the 27 lives HERE and nowhere else. The Python
 * validator keeps vocabulary/enum duty (L1cb.6 pins species/spec/talent enums to skills.vocab.json)
 * and deliberately does NOT duplicate the list — two lists of the same 27 in two languages is drift
 * with a schedule. If you came here from the validator looking for the members, this is the file.
 *
 * Run: node test/talent_choice_shape.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib', 'shared', 'charResolve.js'));
const talents = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/talents.json'), 'utf8')).talents;
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8')).specializations;

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

// ── find a real tree cell carrying well_rounded, so the fixture uses SHIPPED data ──────────────
let WR_SPEC = null, WR_POS = null, WR_POS2 = null;
Object.values(specs).forEach(function (sp) {
  (sp.talent_tree || []).forEach(function (row, r) {
    ((row && row.talents) || []).forEach(function (cell, c) {
      if (cell && cell.talent === 'well_rounded') {
        if (!WR_SPEC) { WR_SPEC = sp.id; WR_POS = r + '-' + c; }
        else if (sp.id === WR_SPEC && !WR_POS2) { WR_POS2 = r + '-' + c; }
      }
    });
  });
});
check('fixture is real shipped data: a spec tree carries well_rounded', !!WR_SPEC && !!WR_POS, { WR_SPEC, WR_POS });

// ── 1. the registry structure (R-PFR2-3 extend-never-parallel) ────────────────────────────────
const wr = talents.well_rounded;
check('well_rounded carries career_skill_choice_grants (the field the SPEC registry already uses)',
  Array.isArray(wr.career_skill_choice_grants) && wr.career_skill_choice_grants.length === 1);
check('its grant is {count:2, pool:"any"} — printed "Choose any 2 skills" (FaD p.156 / EotE p.154)',
  wr.career_skill_choice_grants && wr.career_skill_choice_grants[0].count === 2 &&
  wr.career_skill_choice_grants[0].pool === 'any');
// R-TCT-4 DISCHARGED 2026-08-18: Jason read Lead by Example p.36 — WELL READ prints `Ranked: Yes`.
// The HOLD leg that stood here (asserting NO grant until the page was checked) has flipped to assert
// the encoding. Both flags are pinned, because the correction is the WHOLE point: the registry shipped
// `ranked: false` from the OggDude import, the architect's OCR read said otherwise but could not name
// the talent (§2.1, names dropped from the page headers), and a human at the printed page settled it.
// A silent re-flip to `false` by a future re-import must break this.
const wRead = talents.well_read;
check('R-TCT-4: well_read.ranked is TRUE (Lead by Example p.36, Jason-confirmed 2026-08-18)',
  wRead.ranked === true, wRead.ranked);
check('R-TCT-1/2: well_read carries {count:3, pool:"knowledge"} — "Choose any 3 Knowledge skills", per rank',
  Array.isArray(wRead.career_skill_choice_grants) &&
  wRead.career_skill_choice_grants.length === 1 &&
  wRead.career_skill_choice_grants[0].count === 3 &&
  wRead.career_skill_choice_grants[0].pool === 'knowledge', wRead.career_skill_choice_grants);

// ── 2. R-TCP-3 absent-tolerance ───────────────────────────────────────────────────────────────
check('absent: no talentSkillChoices ⇒ no derived skills (today\'s behaviour, byte-identical)',
  CR.talentChoiceSkillsAll([{ id: WR_SPEC, owned: [WR_POS] }], specs, talents, undefined, undefined).length === 0);
check('absent: an owned cell with no entry for it derives nothing',
  CR.talentChoiceSkillsAll([{ id: WR_SPEC, owned: [WR_POS] }], specs, talents, { [WR_SPEC]: {} }, null).length === 0);

// ── 3. R-TCP-1 positional derive + R-TCT-2 scaling that FALLS OUT ─────────────────────────────
const one = CR.talentChoiceSkillsAll(
  [{ id: WR_SPEC, owned: [WR_POS] }], specs, talents,
  { [WR_SPEC]: { [WR_POS]: ['athletics', 'cool'] } }, null);
check('one owned cell ⇒ its 2 chosen skills derive', one.length === 2 && one.indexOf('athletics') >= 0, one);

if (WR_POS2) {
  const two = CR.talentChoiceSkillsAll(
    [{ id: WR_SPEC, owned: [WR_POS, WR_POS2] }], specs, talents,
    { [WR_SPEC]: { [WR_POS]: ['athletics', 'cool'], [WR_POS2]: ['vigilance', 'discipline'] } }, null);
  check('R-TCT-2: TWO owned cells ⇒ 4 skills — scaling SUMMED at derive-time, never stored', two.length === 4, two);
} else {
  // Same claim, proven across two specs — ranks stack across specializations (eote p.102).
  const other = Object.values(specs).find(sp => sp.id !== WR_SPEC && (sp.talent_tree || []).some(
    r => ((r && r.talents) || []).some(c => c && c.talent === 'well_rounded')));
  let opos = null;
  if (other) (other.talent_tree || []).forEach((r, ri) => ((r && r.talents) || []).forEach((c, ci) => {
    if (c && c.talent === 'well_rounded' && !opos) opos = ri + '-' + ci; }));
  const two = CR.talentChoiceSkillsAll(
    [{ id: WR_SPEC, owned: [WR_POS] }, { id: other.id, owned: [opos] }], specs, talents,
    { [WR_SPEC]: { [WR_POS]: ['athletics', 'cool'] }, [other.id]: { [opos]: ['vigilance', 'discipline'] } }, null);
  check('R-TCT-2: two owned cells ACROSS SPECS ⇒ 4 skills (ranks stack across specs, eote p.102)',
    two.length === 4, two);
}

// ── 4. R-TCP-3 loud on the bug path (the ruled difference from the spec twin) ──────────────────
let threw = false;
try {
  CR.talentChoiceSkillsAll([{ id: WR_SPEC, owned: [WR_POS] }], specs, talents,
    { [WR_SPEC]: { [WR_POS]: ['athletics', 'cool', 'vigilance'] } }, null);
} catch (e) { threw = /allows 2 per rank/.test(String(e.message)); }
check('LOUD: 3 picks in ONE entry that allows 2 THROWS (never silently drops a career skill)', threw);

// ── 5. R-TCP-2 (a1) the treeless companion, selected on STRUCTURE not label ────────────────────
const treelessNoLabel = [{ id: 'well_rounded', xp: 10, skillChoices: ['brawl', 'gunnery'] }];  // no `source`
check('treeless entry WITHOUT the convenience label still derives (C-SPP-1\'s exact burn)',
  CR.talentChoiceSkillsAll([], specs, talents, null, treelessNoLabel).length === 2);

// ── 6. R-TCP-5 creator -> sheet, through the REAL transform ───────────────────────────────────
// `normalizeCreated` is the R1 assembly core. Fixture mirrors test/creation_buyout.cjs's known-good creator shape.
function creatorCharacter(extra) {
  return Object.assign({
    id: 'x', identity: { name: 'Choice Tester' }, gameLine: 'eote',
    narrative: { backstory: '' }, appearance: {},
    species: null, career: null, specializations: [],
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {}, talents: {}, forcePowers: {}, mechanic: null,
    gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
    motivations: { strength: null, flaw: null, desire: null, fear: null },
    notes: { personal: '', gm: '' },
  }, extra || {});
}
const GAMEDATA = { charbuild: { species: {}, careers: {}, specializations: specs, talents: talents } };
const DEPS = { registries: {}, activeMods: [], portraitFor: () => null };
const rtChar = creatorCharacter({
  talentSkillChoices: { [WR_SPEC]: { [WR_POS]: ['athletics', 'cool'] } },
  // treeless entry deliberately carries NO `source` label — the C-SPP-1 case
  talents: { k1: { specKey: '__treeless__', talentKey: 'well_rounded', cost: 10, skillChoices: ['brawl', 'gunnery'] } },
});
const rtSheet = CR.normalizeCreated(rtChar, null, null, GAMEDATA, 'test', DEPS);
check('ROUND TRIP fwd: the positional map reaches the sheet',
  !!(rtSheet.talentSkillChoices && rtSheet.talentSkillChoices[WR_SPEC] &&
     rtSheet.talentSkillChoices[WR_SPEC][WR_POS]), rtSheet.talentSkillChoices);
check('ROUND TRIP fwd: the UNLABELLED treeless entry carries its picks (C-SPP-1)',
  !!(rtSheet.treelessTalents && rtSheet.treelessTalents[0] &&
     rtSheet.treelessTalents[0].skillChoices &&
     rtSheet.treelessTalents[0].skillChoices.length === 2), rtSheet.treelessTalents);
check('ROUND TRIP: the picks still DERIVE after the trip (the point of persisting them)',
  CR.talentChoiceSkillsAll([{ id: WR_SPEC, owned: [WR_POS] }], specs, talents,
    rtSheet.talentSkillChoices, rtSheet.treelessTalents).length === 4);

// ── 7. R-TCT-5 per-record membership, never a regex count ─────────────────────────────────────
const TIER1 = ['well_rounded', 'well_read'];
const TIER2 = ['deadly_accuracy', 'knowledge_specialization', 'smooth_talker', 'renegade_form',
  'signature_vehicle', 'pride_and_joy', 'jury_rigged', 'summon_item', 'ichor_blade'];
const EXCLUDED = ['mind_bleed', 'trust_no_one', 'jetpack_expertise', 'consider_our_options_improved', 'push_aside'];
check('membership: all Tier 1 + Tier 2 records still exist by id (a rename must break this, loudly)',
  TIER1.concat(TIER2).every(id => !!talents[id]));
check('R-TCT-5: the 5 excluded records are named, and carry NO structure (they are not in the class)',
  EXCLUDED.every(id => talents[id] && !talents[id].career_skill_choice_grants));
check('R-TCT-5: Tier 2 is OWED, not built — no Tier 2 record carries structure in this lap',
  TIER2.every(id => !talents[id].career_skill_choice_grants));
const strays = Object.values(talents).filter(t => t.career_skill_choice_grants).map(t => t.id);
check('no record outside the ratified class carries the field (' + strays.join(',') + ')',
  strays.every(id => TIER1.indexOf(id) >= 0), strays);
// Tier 1 is now COMPLETE — both records encoded. A leg that would have passed while one was missing
// is not a completeness check, so this asserts the set, not the absence of strangers.
check('Tier 1 is COMPLETE: both well_rounded and well_read carry structure',
  TIER1.every(id => Array.isArray(talents[id].career_skill_choice_grants)), strays);

console.log(failures === 0 ? '\ntalent_choice_shape: ALL PASS' : '\ntalent_choice_shape: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
