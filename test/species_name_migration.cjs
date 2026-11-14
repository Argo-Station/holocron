/**
 * R-MRN-1/2 — a bare species name must never be written down as a guess.
 *
 * Ruling `menagerie-rename-name-resolution`. The A-MSP-2 renames make 117 display names
 * deliberately ambiguous. Two seams read a species by NAME, and they are NOT the same kind of seam:
 *
 *   · the five READ paths resolve incumbent-wins and are UNCHANGED in this lap (R-MRN-3). A legacy
 *     save may still DISPLAY the incumbent record until `species-name-precedence` lands — wrong, but
 *     unpersisted and reversible.
 *   · `migrateSheet` WRITES its answer onto the player's saved character. A guess there is a silent,
 *     one-way migration of user data onto another publisher's stat block, and it is what this guard
 *     exists to make impossible.
 *
 * THE MUTANT IS THE POINT (C-MRN-2): the "fix" is one option on one call — `buildNameIndex` (strict)
 * instead of `speciesNameIndex` (incumbent-wins). A test that only checks the good path passes just
 * as happily under the old line, so the mutant restoring the guess is run and must fail.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const CR = require(path.join(REPO, 'lib/shared/charResolve.js'));
const SPECIES = JSON.parse(fs.readFileSync(path.join(REPO, 'public/data/canonical/species.json'), 'utf8')).species;
const PREGENS = JSON.parse(fs.readFileSync(path.join(REPO, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const CB = { species: SPECIES, careers: {}, specializations: {}, talents: {}, forcePowers: {} };

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  cond ? (pass++, console.log('PASS ' + msg))
       : (fail++, console.log('FAIL ' + msg + (detail === undefined ? '' : '  — ' + JSON.stringify(detail))));
};

const key = (n) => String(n || '').replace(/’/g, "'").trim().toLowerCase();
const byName = {};
Object.keys(SPECIES).forEach((id) => { (byName[key(SPECIES[id].name)] = byName[key(SPECIES[id].name)] || []).push(id); });
const AMBIGUOUS = Object.keys(byName).filter((k) => byName[k].length > 1);
const UNIQUE = Object.keys(byName).filter((k) => byName[k].length === 1);

// ── the population, derived — a guard over an empty set proves nothing ──────────────────────
ok(AMBIGUOUS.length > 100, `fixture: ${AMBIGUOUS.length} display names are shared by 2+ records`);
ok(UNIQUE.length > 100, `fixture: ${UNIQUE.length} names are carried by exactly one record`);

// ── R-MRN-1 — the eighteen pregens are id-keyed, and the ids are RIGHT ──────────────────────
ok(PREGENS.length === 18, `fixture: 18 shipped pregens (got ${PREGENS.length})`);
const unstamped = PREGENS.filter((c) => !c.speciesId).map((c) => c.name);
ok(unstamped.length === 0, `R-MRN-1: every pregen carries a speciesId (${unstamped.length} without)`, unstamped);
const wrongRecord = PREGENS.filter((c) => {
  const rec = SPECIES[c.speciesId];
  return !rec || rec.wound_threshold_base !== c.woundBase || rec.strain_threshold_base !== c.strainBase;
}).map((c) => c.name);
ok(wrongRecord.length === 0,
   'R-MRN-1: each stamped record is one whose thresholds the sheet already carries — the id changed '
   + 'which RECORD is resolved, never a printed number', wrongRecord);
const wicket = PREGENS.find((c) => c.name === 'Wicket');
ok(wicket && wicket.speciesId === 'ewok_aaa',
   `C-MRN-1: Wicket resolves to ewok_aaa by id (got ${wicket && wicket.speciesId})`);
ok(wicket && SPECIES[wicket.speciesId].wound_threshold_base === 9
   && SPECIES[wicket.speciesId].strain_threshold_base === 11,
   'C-MRN-1: …and that record is the 9/11 Allies and Adversaries Ewok, not the Menagerie 9/10');
const wicketAbilities = CR.speciesAbilityGrants({ speciesId: wicket.speciesId }, CB).map((a) => a.name);
ok(wicketAbilities.length > 0 && !wicketAbilities.includes('Heightened Smell'),
   'R-MRN-1: Wicket derives the A&A Ewok\'s abilities, not the Menagerie\'s', wicketAbilities);

// ── R-MRN-2 — the WRITING seam refuses an ambiguous name ────────────────────────────────────
function migrate(name) {
  return CR.migrateSheet({ species: name, name: 'Legacy Save', talents: [], forcePowers: [] }, CB);
}
const ambName = SPECIES[byName[AMBIGUOUS[0]][0]].name;
const amb = migrate('Ewok');
ok(amb.value.speciesId === undefined,
   'R-MRN-2: a save naming an AMBIGUOUS species acquires NO speciesId', amb.value.speciesId);
ok(amb.changed === false,
   'R-MRN-2: …and reports no change, so nothing is written back', amb.changed);
ok(migrate(ambName).value.speciesId === undefined,
   `R-MRN-2: the same refusal on a second ambiguous name (${ambName})`);
const stillAmbiguous = AMBIGUOUS.filter((k) => migrate(SPECIES[byName[k][0]].name).value.speciesId !== undefined);
ok(stillAmbiguous.length === 0,
   `R-MRN-2: NONE of the ${AMBIGUOUS.length} shared names is stamped (${stillAmbiguous.length} leaked)`,
   stillAmbiguous.slice(0, 5));

// ── …and it still WORKS where the name is unambiguous. Refusing everything would also pass the
//    asserts above, which is why the positive half is not optional.
const uniqName = SPECIES[byName[UNIQUE[0]][0]].name;
const uniq = migrate(uniqName);
ok(uniq.value.speciesId === byName[UNIQUE[0]][0] && uniq.changed === true,
   `R-MRN-2: an UNAMBIGUOUS name still migrates normally (${uniqName} -> ${uniq.value.speciesId})`);
const brokenUnique = UNIQUE.slice(0, 40).filter((k) => migrate(SPECIES[byName[k][0]].name).value.speciesId !== byName[k][0]);
ok(brokenUnique.length === 0,
   `R-MRN-2: 40 sampled unambiguous names all still stamp (${brokenUnique.length} broken)`, brokenUnique);

// ── R-MRN-3 — the READ paths are deliberately unchanged ─────────────────────────────────────
const readBack = CR.speciesAbilityGrants({ species: 'Ewok' }, CB);
ok(Array.isArray(readBack) && readBack.length > 0,
   'R-MRN-3: a name-keyed READ still resolves something (the render paths were NOT flipped strict — '
   + 'doing so would turn "possibly the wrong species" into "no species at all" for legacy saves)');

// ── THE NAMED MUTANT (C-MRN-2): restore the guess at the writing seam ───────────────────────
// The real line reads `buildNameIndex(charbuild.species || {})`. The mutant is what it replaced.
const SRC = fs.readFileSync(path.join(REPO, 'lib/shared/charResolve.js'), 'utf8');
ok(/if \(!sheet\.speciesId && sheet\.species\) \{[\s\S]{0,3000}?__hits\.length === 1/.test(SRC),
   'C-MRN-2: the writing seam stamps ONLY when exactly one record carries the collapsed name');
const mutantSrc = SRC.replace(
  'if (__wanted && __hits.length === 1) { sheet.speciesId = __hits[0]; changed = true; }',
  'var sid = lookupByName(speciesNameIndex(charbuild.species || {}), sheet.species);\n      if (sid) { sheet.speciesId = sid; changed = true; }');
ok(mutantSrc !== SRC, 'C-MRN-2: the mutant edit applies (the line is where this guard thinks it is)');
const mutantPath = path.join(require('os').tmpdir(), 'charResolve.mutant.' + process.pid + '.js');
fs.writeFileSync(mutantPath, mutantSrc);
const MUT = require(mutantPath);
const mutated = MUT.migrateSheet({ species: 'Ewok', name: 'Legacy Save', talents: [], forcePowers: [] }, CB);
fs.unlinkSync(mutantPath);
ok(mutated.value.speciesId !== undefined && mutated.changed === true,
   `MUTATION: restoring the incumbent-wins index DOES stamp the ambiguous name (${mutated.value.speciesId}) `
   + '— so the asserts above are capable of catching the defect they exist for');
// A second assertion here required the mutant to stamp the WRONG record (`!== 'ewok_aaa'`). DELETED
// by ruling `species-name-precedence-mutant-repoint` Q1(a), C-SNP-1 — NOT a regression, and not to
// be restored: C-MRN-2 requires the mutant be shown RED, never that it be shown WRONG, so the clause
// exceeded the condition that created this leg. `species-name-precedence` made `speciesNameIndex`
// the precedence rule itself, so the mutant's target is now correct by construction and no fixture
// can revive the clause. The harm R-MRN-2 names is writing an ambiguous name down AT ALL — a stamped
// id is frozen, so a save stamped today is wrong tomorrow if a new book re-ranks the name. The leg
// above still discriminates: real seam → undefined/false, mutant → ewok_aaa/true.

console.log(`\nspecies name migration guard: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass, ${fail} fail)`);
process.exit(fail ? 1 : 0);
