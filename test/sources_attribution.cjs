#!/usr/bin/env node
/**
 * sources_attribution.cjs — THE DRIVEN GUARD for the sources box's DERIVED line (R-FSA-A9-2).
 *
 * The box's whole claim is that its numbers are computed, never typed: "+8 species · +6 careers ·
 * +19 specs" is a live count over `public/data/canonical/`, and the head is the same summed over
 * the books that are ON. A typed number would look identical on the day it was written and would
 * go quietly wrong the first time a registry gained a record — which is precisely what nobody
 * would notice, because a plausible number reads exactly like a correct one.
 *
 * So this guard does not check that the code LOOKS derived. It RUNS the shipped engine over the
 * shipped registries and asserts the figures the approved mockup was signed off on
 * (`Docs/mockups/sources-box.html` @ f566bc0b, R-MU1 approval at ruling A9), plus the four
 * properties that make the line trustworthy rather than merely present.
 *
 * NON-VACUOUS BY CONSTRUCTION (R-CPR-39): leg 0 runs the engine against a MUTANT index whose join
 * is broken, and REQUIRES the figures to move. A guard whose assertions still pass when the thing
 * they measure is broken is furniture, and this project has shipped one of those before.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANON = path.join(ROOT, 'public', 'data', 'canonical');
const S = require(path.join(ROOT, 'lib', 'shared', 'sources.js'));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}   ->   ${JSON.stringify(detail)}`); }
}
function J(f) {
  const p = path.join(CANON, f);
  if (!fs.existsSync(p)) return null;          // report, never throw (A1-2)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

const vocab = J('books.vocab.json');
if (!vocab) {
  console.log('FAIL  books.vocab.json is unreadable — the join has no table');
  process.exit(1);
}
const index = S.buildIndex(vocab);
const SETS = {
  species: (J('species.json') || {}).species,
  careers: (J('careers.json') || {}).careers,
  specializations: (J('specializations.json') || {}).specializations,
  talents: (J('talents.json') || {}).talents,
  force_powers: (J('force_powers.json') || {}).force_powers,
  weapons: (J('weapons.json') || {}).weapons,
  armour: (J('armor.json') || {}).armor,
  gear: (J('gear.json') || {}).gear,
};
const attr = S.attribution(index, SETS);
const text = (id) => S.attributionText(S.attributionParts(attr, id));

// ── 0 · THE DETECTOR BITES ───────────────────────────────────────────────────────────────────
// A mutant index that resolves nothing must produce NO counts. If the figures survive a broken
// join they were never coming from the join.
{
  const mutant = { aliasToId: {}, byId: index.byId, hiddenSourceCodes: {} };
  const dead = S.attribution(mutant, SETS);
  check('0a detector is NOT vacuous — a broken join yields no counts at all',
    Object.keys(dead.byId).length === 0 && text('eote') !== '',
    { mutantBooks: Object.keys(dead.byId).length, liveEote: text('eote') });
  // and a mutant REGISTRY must move the number it feeds
  const short = Object.assign({}, SETS, { species: [] });
  const fewer = S.attribution(index, short);
  check('0b detector is NOT vacuous — emptying a registry moves that registry\'s count',
    (fewer.byId.eote || {}).species === undefined && (attr.byId.eote || {}).species === 8,
    { mutant: (fewer.byId.eote || {}).species, live: (attr.byId.eote || {}).species });
}

// ── 1 · THE APPROVED FIGURES, RECOMPUTED ─────────────────────────────────────────────────────
// Verbatim from the page Jason approved. If a registry legitimately gains records these move, and
// the failure is the POINT: the mockup and the build must not drift apart silently.
const APPROVED = {
  eote: '+8 species · +6 careers · +19 specs · +150 talents · +3 Force powers · +32 weapons · +7 armour · +78 gear',
  aor:  '+8 species · +6 careers · +20 specs · +182 talents · +3 Force powers · +33 weapons · +7 armour · +58 gear',
  // weapons +32 → +33 by f100-m12-build-card R-M12B-48: double_bladed_inquisitorious_lightsaber gains `fad` (FaD p.421,
  // R-M12C-68). The frame draws a derived line; only the data moved.
  fad:  '+8 species · +6 careers · +18 specs · +149 talents · +11 Force powers · +33 weapons · +6 armour · +65 gear',
  the_complete_species_guide: '+408 species',
};
Object.keys(APPROVED).forEach((id) => {
  check(`1 ${id} draws the approved line`, text(id) === APPROVED[id],
    { got: text(id), want: APPROVED[id] });
});

// ── 2 · THE HEAD, SUMMED LIVE OVER THE ACTIVE BOOKS ──────────────────────────────────────────
const ON_GROUPS = { Core: 1, Era: 1, Supplement: 1 };
const activeIds = Object.keys(index.byId).filter((id) => ON_GROUPS[index.byId[id].group]);
const headParts = S.attributionSum(attr, activeIds);
check('2a the head counts the vocabulary\'s own rows, not a typed total',
  Object.keys(index.byId).length === 67 && activeIds.length === 51,
  { books: Object.keys(index.byId).length, on: activeIds.length });
// Re-pointed by f100-m12-build-card R-M12B-48: weapons 455 → 457 (double_bladed_inquisitorious_lightsaber, FaD p.421,
// R-M12C-68; the_darksaber, DoR p.79, R-M12C-65) and armour 127 → 128 (mandalorian_armor_cotr, R-M12C-76). The forsaken
// saber's split (eote+aor → eote, plus forsaken_jedi_lightsaber_aor on aor) nets 0 on both books.
// Re-pointed by release-r5-data C3 (count mover, R-P3S-9): weapons 457 → 460 (spray_rifle, spray_foam_grenade, DoH
// p.42; mk_viii_gravitic_mortar_launcher, Fully Operational p.38). KEEPS every other part; the per-book pins hold.
// Re-pointed by release-r7-bug-burndown ADDENDUM 37 D-R7GD1 (a) (count mover): weapons 460 → 461 (gungan_personal_energy_shield,
// GUNGPES, Nexus of Power p.104, held by B-1429). KEEPS every other part; DROPS nothing; the per-book pins hold.
// Re-pointed by release-r7-bug-burndown ADDENDUM 117 (count mover, B-789): talents 963 → 962 (beast_of_burden's `sources`
// ["stay_on_target"] → [], the honest blank: printed in no corpus book). KEEPS every other part; the per-book pins hold.
check('2b the head sums the active books',
  S.attributionText(headParts) === '+110 species · +20 careers · +135 specs · +962 talents '
    + '· +29 Force powers · +461 weapons · +128 armour · +719 gear',
  { got: S.attributionText(headParts) });

// ── 3 · THE NARROW RULE IS PRIORITY, NOT SIZE (R-FSA-A5-1) ───────────────────────────────────
// The three kept at a cap of 3 must be species · careers · specs — the creator's own categories —
// even though every one of them is a SMALLER number than the talents/weapons/gear it drops. A
// by-count rule passes an "it truncates" test and fails this one.
{
  const narrow = S.attributionText(headParts, 3);
  const kept = narrow.split(' · ').slice(0, 3).map((s) => s.replace(/^\+\d+\s+/, ''));
  const dropped = headParts.slice(3);
  check('3a narrow keeps species · careers · specs and says "+N more"',
    kept.join(',') === 'species,careers,specs' && /\+5 more$/.test(narrow), { narrow });
  // THE SHARP FORM. Size-ordering and priority-ordering both "truncate", so a test that only
  // checks something was dropped passes under either. What separates them is WHICH three survive:
  // by size that is talents · gear · weapons; by the ruled priority it is species · careers ·
  // specs — and every one of those three is a SMALLER number than all three it beat.
  const bySize = headParts.slice().sort((a, b) => b.n - a.n).slice(0, 3).map((d) => d.label);
  check('3b the kept three are NOT the three largest — priority, not size, chose them',
    kept.join(',') !== bySize.join(',')
      && kept.every((k) => headParts.find((p2) => p2.label === k).n
                         < Math.min(...bySize.map((l) => headParts.find((p2) => p2.label === l).n))),
    { kept, bySize: bySize, dropped: dropped.map((d) => `${d.label}:${d.n}`) });
}

// ── 4 · ABSENCE IS NOT ZERO (SHOWS-vs-PRODUCES, R-DRC-1) ─────────────────────────────────────
// `vehicles.json` is not shipped. A box printing "+0 vehicles" would assert a measurement nobody
// made; the engine must report the registry as MISSING and give no book a zero for it.
{
  const partial = S.attribution(index, { species: SETS.species });
  const anyZero = Object.keys(partial.byId).some((id) =>
    Object.keys(partial.byId[id]).some((k) => partial.byId[id][k] === 0));
  check('4a an unpassed registry is reported MISSING, not counted as zero',
    partial.missing.length === 7 && partial.counted.join(',') === 'species' && !anyZero,
    { missing: partial.missing, counted: partial.counted });
  check('4b a zero never renders — the line omits what a book does not add',
    !/\+0 /.test(text('eote')) && S.attributionText(S.attributionParts(partial, 'eote')) === '+8 species',
    { partialEote: S.attributionText(S.attributionParts(partial, 'eote')) });
}

// ── 5 · NO RECORD IS COUNTED INTO A BOOK THAT DOES NOT EXIST ─────────────────────────────────
// An unresolvable source string is REPORTED, never folded into a total — otherwise a new book's
// records vanish into the numbers and the box quietly understates every row.
{
  const bogus = [{ id: 'x', sources: ['A Book We Never Shipped'] }];
  const withBogus = S.attribution(index, { species: bogus });
  check('5a an unmapped source is reported and counted nowhere',
    Object.keys(withBogus.byId).length === 0 && withBogus.unmapped['A Book We Never Shipped'] === 1,
    { byId: Object.keys(withBogus.byId), unmapped: withBogus.unmapped });
  check('5b the SHIPPED registries have no unmapped source strings',
    Object.keys(attr.unmapped).length === 0, { unmapped: attr.unmapped });
}

// ── 6 · THE GREYED FIGURE IS THE REGISTER'S OWN DEDUPE (R-FSA A2's 317) ──────────────────────
// 537 species records are 414 NAMES once the register's own `dedupeName` collapses twins; 97 come
// from official books, so 317 are greyed. The number the box prints must come from the shipped
// rule, not from a constant — a raw distinct-name count gives 319 and was ruled wrong.
{
  const sp = Object.values((J('species.json') || {}).species || {});
  const names = new Set(sp.map((r) => S.dedupeName((r || {}).name)));
  const ready = sp.filter((r) => (r.sources || []).some((s) => {
    const id = index.aliasToId[s]; return id && ON_GROUPS[(index.byId[id] || {}).group];
  })).length;
  check('6 greyed = deduped names − ready, through the register\'s own rule',
    sp.length === 537 && names.size === 414 && ready === 97 && names.size - ready === 317,
    { records: sp.length, names: names.size, ready, greyed: names.size - ready });
}

console.log('');
console.log(`  ${attr.counted.length} registries counted, ${attr.missing.length} absent; `
  + `${Object.keys(attr.byId).length} books carry at least one record`);
console.log('');
console.log(`sources attribution: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
