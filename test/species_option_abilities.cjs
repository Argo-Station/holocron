/**
 * C-OAB-2 — a chosen variant's abilities UNION with the species', in that order, de-duped by name.
 *
 * THE MUTANT IS THE POINT. A test that only asserts "Blubber is present" passes just as happily
 * under a resolver that REPLACES the species' list with the option's — the very bug this condition
 * exists to prevent, and the one that would quietly hand every Aqualish character the wrong sheet.
 * So the union assert is run twice: once against the real resolver, and once against a REPLACE
 * mutant that must FAIL it. A guard whose failure mode is never exercised is not a guard.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const { speciesAbilityGrants } = require(path.join(REPO, 'lib/shared/charResolve.js'));
const charbuild = {
  species: require(path.join(REPO, 'public/data/canonical/species.json')).species,
};

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? (pass++, console.log('PASS ' + msg))
                                 : (fail++, console.log('FAIL ' + msg)); };

const REC = charbuild.species.csg_aqualish;
ok(!!REC, 'fixture: csg_aqualish is in the shipped registry');

// the group id the sheet keys its pick by — slug of the group name, per _groupId
const GROUP = REC.option_choices.find((g) => g.options.some((o) => o.id === 'aquala'));
const GID = String(GROUP.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const sheet = { speciesId: 'csg_aqualish', speciesOptionPicks: { [GID]: 'aquala' } };
const names = speciesAbilityGrants(sheet, charbuild).map((a) => a.name);

// ---- the union, by number and by name -----------------------------------------------------
ok(names.includes('Aquatic'), 'C-OAB-2 the SPECIES ability survives the pick (Aquatic)');
ok(names.includes('Blubber'), "C-OAB-2 the VARIANT's ability is granted (Aquala -> Blubber)");
ok(names.length === 2, `C-OAB-2 count is species+variant = 2 (got ${names.length}: ${names})`);
ok(names[0] === 'Aquatic' && names[1] === 'Blubber',
   'C-OAB-2 order is species first, then the option');
ok(!names.includes('Forest Dwellers') && !names.includes('Four Eyes'),
   'C-OAB-2 an UNCHOSEN variant grants nothing');

// ---- unpicked, and unresolvable ------------------------------------------------------------
const noPick = speciesAbilityGrants({ speciesId: 'csg_aqualish' }, charbuild).map((a) => a.name);
ok(noPick.length === 1 && noPick[0] === 'Aquatic',
   'an unpicked group grants nothing — the species keeps exactly its own list');
const stale = speciesAbilityGrants(
  { speciesId: 'csg_aqualish', speciesOptionPicks: { [GID]: 'no_such_option' } }, charbuild);
ok(stale.length === 1, 'a pick naming an option that no longer exists is ignored, not thrown');

// ---- THE MUTANT: replace instead of union, which MUST fail the assert above ----------------
function mutantReplace(sh, cb) {
  const rec = cb.species[sh.speciesId];
  const picks = sh.speciesOptionPicks || {};
  for (const oc of rec.option_choices || []) {
    const gid = String(oc.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const opt = (oc.options || []).find((o) => o.id === picks[gid]);
    if (opt && opt.special_abilities) return opt.special_abilities.map((a) => ({ name: a.name }));
  }
  return (rec.special_abilities || []).map((a) => ({ name: a.name }));
}
const mNames = mutantReplace(sheet, charbuild).map((a) => a.name);
ok(!(mNames.includes('Aquatic') && mNames.includes('Blubber') && mNames.length === 2),
   `MUTATION: a REPLACE resolver FAILS the union assert (it returned ${JSON.stringify(mNames)}) ` +
   '— so the assert is capable of catching the bug it exists for');

console.log(`\nspecies option abilities guard: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass)`);
process.exit(fail ? 1 : 0);
