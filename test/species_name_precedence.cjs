#!/usr/bin/env node
/**
 * species_name_precedence.cjs — a species NAME resolves to the record the browser list shows.
 *
 * THE DEFECT THIS ENDS. `speciesNameIndex` used to be incumbent-wins: with three records named
 * "Ewok" it returned whichever `species.json` listed first. The species browser has always used a
 * different rule — `SWRPGSources.dedupeByName`, lowest `namePrecedenceOf`, official before
 * community. So a legacy save holding a bare name rendered one publisher's stat block while the list
 * offered another's. Ruling `menagerie-rename-name-resolution` §7 (HANDOFF `species-name-precedence`)
 * makes the read paths speak the browser's rule: one rule, one answer, no second opinion.
 *
 * WHY THE OBVIOUS ASSERT IS NOT ENOUGH, and this file exists in the shape it does. At the moment the
 * fix landed, 115 of the 117 shared names ALREADY agreed — registry order happened to coincide with
 * precedence for all but `ewok` and `jawa`. An assert that only compares the two rules is therefore
 * 115/117 green against the unfixed code, and a reviewer reading "115 pass" would conclude the rule
 * was in force. The mutant in leg 5 is what separates "agrees" from "agrees BECAUSE of the rule".
 *
 * WHAT IT CHECKS
 *   1. the fixture is the whole registry and actually contains shared names (non-vacuity, ADR 0035)
 *   2. every SPELLING of every shared name resolves to the browser's winner — both `Pau'an` and
 *      `Pau’an`, because 29 of 532 names carry the typographic apostrophe and a save may hold either
 *   3. the stamped `_name_precedence` equals a fresh derivation for all 532 — this is what catches
 *      `species.json` being regenerated without re-running the stamper
 *   4. the card's named fixtures: the three Ewoks and three Jawas each land on the official record
 *   5. MUTANT — restore registry order and this guard must go RED. Its capability is DERIVED (the
 *      mutation must change the source AND move an answer), never a hard-coded count of call sites:
 *      `csg_import.cjs`'s mutant pins `=== 5` such sites, lap B made it 4, and that mutant has
 *      reported itself inert ever since. A capability check that can rot is not one.
 *   6. a legacy name-only save reads the browser's winner through the species readers
 *      (speciesAbilityGrants, speciesTalentGrants, creationSkillAllowance), not at the index, because the
 *      index is not what a player looks at. A winner with nothing to read is counted, not claimed
 *
 * Run: node test/species_name_precedence.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const R = (p) => path.join(REPO, p);
const load = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8'));

const CR = require(R('lib/shared/charResolve.js'));
const SRC = require(R('lib/shared/sources.js'));

const SPECIES = load('public/data/canonical/species.json').species;
const INDEX = SRC.buildIndex(load('public/data/canonical/books.vocab.json'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('PASS ' + m)) : (fail++, console.log('FAIL ' + m)); };

// The browser's own answer, derived here rather than imported, so the guard compares two
// independently-computed results instead of asking one implementation whether it agrees with itself.
function browserWinner(recs) {
  return recs.slice().sort((a, b) => {
    const ra = SRC.namePrecedenceOf(a, INDEX), rb = SRC.namePrecedenceOf(b, INDEX);
    return ra - rb || String(a.id).localeCompare(String(b.id));
  })[0];
}
function sharedGroups(species) {
  const g = {};
  for (const [id, rec] of Object.entries(species)) {
    const k = SRC.dedupeName(rec.name);
    if (k) (g[k] = g[k] || []).push(Object.assign({ id }, rec));
  }
  return Object.entries(g).filter(([, v]) => v.length > 1);
}
const GROUPS = sharedGroups(SPECIES);
const askIndex = (idx, name) => idx.byName[(idx.key || ((n) => String(n || '').trim().toLowerCase()))(name)];

// ---- 1. the fixture ---------------------------------------------------------------------------
const spellings = GROUPS.reduce((n, [, v]) => n + v.length, 0);
ok(Object.keys(SPECIES).length > 500 && GROUPS.length > 50,
   `the fixture is the whole registry and has shared names to resolve `
   + `(${Object.keys(SPECIES).length} records, ${GROUPS.length} shared names, ${spellings} spellings)`);

// ---- 2. every spelling resolves to the browser's winner --------------------------------------
const idx = CR.speciesNameIndex(SPECIES);
const wrong = [], missing = [];
for (const [, recs] of GROUPS) {
  const want = browserWinner(recs).id;
  for (const rec of recs) {
    const got = askIndex(idx, rec.name);
    if (typeof got !== 'string') missing.push(rec.name);
    else if (got !== want) wrong.push(`${rec.name}: ${got} ≠ ${want}`);
  }
}
ok(wrong.length === 0 && missing.length === 0,
   `all ${spellings} spellings of ${GROUPS.length} shared names resolve to the browser's winner `
   + `(${wrong.length} wrong${wrong.length ? ': ' + wrong.slice(0, 4).join(', ') : ''}`
   + `, ${missing.length} unresolvable${missing.length ? ': ' + missing.slice(0, 4).join(', ') : ''})`);

// ---- 3. the stamp is not stale ----------------------------------------------------------------
const stale = [];
for (const [id, rec] of Object.entries(SPECIES)) {
  const want = SRC.namePrecedenceOf(rec, INDEX);
  if (rec._name_precedence !== want) stale.push(`${id}: ${rec._name_precedence} ≠ ${want}`);
}
ok(stale.length === 0,
   `all ${Object.keys(SPECIES).length} records carry the _name_precedence a fresh derivation `
   + `produces (${stale.length} stale${stale.length ? ': ' + stale.slice(0, 4).join(', ') : ''})`);

// ---- 4. the card's named fixtures --------------------------------------------------------------
for (const [name, want] of [['Ewok', 'ewok_aaa'], ['Jawa', 'jawa_aaa']]) {
  const members = GROUPS.find(([k]) => k === name.toLowerCase());
  const got = askIndex(idx, name);
  ok(members && members[1].length === 3 && got === want,
     `"${name}" — ${members ? members[1].length : 0} records, resolves ${got} `
     + `(want ${want}, the official Allies and Adversaries record)`);
}

// ---- 5. THE MUTANT — registry order restored must redden this guard ----------------------------
(function () {
  const src = fs.readFileSync(R('lib/shared/charResolve.js'), 'utf8');
  // Neuter ONLY the precedence comparison: the first record encountered then keeps the name, which
  // is exactly the incumbent-wins behaviour this lap replaced.
  const NEEDLE = 'if (r < rankOf[n] || (r === rankOf[n] && String(id) < String(byName[n]))) {';
  const mutated = src.replace(NEEDLE, 'if (false) {');
  const applied = mutated !== src;                                     // (1) the mutation LANDED
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'snp-mut-')), 'charResolve.js');
  fs.writeFileSync(tmp, mutated);
  const MUT = require(tmp);                                            // (2) it PARSES and LOADS
  const mutIdx = MUT.speciesNameIndex(SPECIES);
  const moved = GROUPS.filter(([, recs]) => askIndex(mutIdx, recs[0].name) !== browserWinner(recs).id);
  ok(applied && moved.length > 0,
     `MUTATION IS CAPABLE: restoring registry order changes ${moved.length} of ${GROUPS.length} `
     + `shared names (applied=${applied}) — so leg 2's green is an outcome, not an accident of `
     + `registry order`);
})();

// ---- 6. end-to-end: a legacy name-only save still renders a species ----------------------------
const cb = {
  species: SPECIES,
  careers: load('public/data/canonical/careers.json').careers,
  specializations: load('public/data/canonical/specializations.json').specializations,
  talents: load('public/data/canonical/talents.json').talents,
  force_powers: load('public/data/canonical/force_powers.json').force_powers,
};
const sig = (sheet) => JSON.stringify([CR.speciesAbilityGrants(sheet, cb), CR.speciesTalentGrants(sheet, cb), CR.creationSkillAllowance(sheet, cb).speciesGrants]);
const NOTHING = sig({ name: 'Legacy', book: 'eote', species: 'No Such Species' });
const misread = [];
let read = 0;
for (const [, recs] of GROUPS) {
  const want = sig({ name: 'Legacy', book: 'eote', speciesId: browserWinner(recs).id });
  for (const rec of recs) {
    if (want !== NOTHING) read += 1;
    if (sig({ name: 'Legacy', book: 'eote', species: rec.name }) !== want) misread.push(rec.name);
  }
}
ok(read > 0 && misread.length === 0,
   `a legacy save reads its shared name's winner — ${spellings} legacy saves, ${read} with something to read `
   + `(${misread.length} wrong${misread.length ? ': ' + misread.slice(0, 4).join(', ') : ''})`);

console.log(`\nspecies name precedence: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass)`);
process.exit(fail ? 1 : 0);
