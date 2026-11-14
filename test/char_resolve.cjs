#!/usr/bin/env node
/**
 * char_resolve.cjs — STANDING guard for the shared talent/Force-power resolver
 * (lib/shared/charResolve.js, ADR 0003 charbuild sub-step 3b; ruling charbuild-3b-recon).
 *
 * Proves, against the REAL canonical registries:
 *   1. Creation projection: posKey talent map -> [{id, rank}] with ranks COLLAPSED (D-CB2);
 *      creator force-power buy state -> [{id, basic, upgrades:[]}].
 *   2. Render resolution: canonical id-refs -> display (name/description/activation/rank);
 *      legacy display entries pass through MARKED, never dropped; dangling ids -> _unresolved.
 *   3. Migration (D-3B4): legacy name lists -> id-refs; duplicate ranked-talent names collapse
 *      to rank; AMBIGUOUS names are NO match (live homonym "Temple Training" routes to legacy);
 *      duplicate UNRANKED names stay legacy (anomaly preserved); force-power upgrades match by
 *      KEY only and one bad key keeps the whole entry legacy (atomic).
 *   4. Sheet-level migration adds careerId/speciesId ALONGSIDE name strings (D-3B2 additive).
 *   5. Name index: collision detection matches the build-data truth (talents >= 1 collision;
 *      powers 0 collisions).
 *
 * Run:  node test/char_resolve.cjs   (needs public/data/canonical/*.json)
 */
const fs = require('fs');
const path = require('path');
const CR = require('../lib/shared/charResolve.js');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

function main() {
  const talents = rd('public/data/canonical/talents.json').talents;
  const powers = rd('public/data/canonical/force_powers.json').force_powers;
  const careers = rd('public/data/canonical/careers.json').careers;
  const species = rd('public/data/canonical/species.json').species;
  const charbuild = { talents: talents, forcePowers: powers, careers: careers, species: species, specializations: {} };

  // ── 1. creation projection ──
  const grit = Object.keys(talents).find((id) => talents[id].name === 'Grit');
  const posMap = {
    'spec_r0c0': { talentKey: grit, specKey: 'spec', row: 0, col: 0, cost: 0 },
    'spec_r1c2': { talentKey: grit, specKey: 'spec', row: 1, col: 2, cost: 10 },
    'spec_r0c1': { talentKey: 'toughened', specKey: 'spec', row: 0, col: 1, cost: 5 },
  };
  const proj = CR.talentsFromCreatorState(posMap);
  check('projection collapses 2x Grit -> rank 2', proj.some((t) => t.id === grit && t.rank === 2));
  check('projection keeps single talent rank 1', proj.some((t) => t.rank === 1));
  const pproj = CR.powersFromCreatorState({ enhance: { name: 'Enhance', cost: 10, basic: true } });
  check('power projection -> [{id, basic, upgrades:[]}]', pproj.length === 1 && pproj[0].id === 'enhance' && pproj[0].basic === true && pproj[0].upgrades.length === 0);

  // ── 2. render resolution ──
  const disp = CR.resolveTalentEntry({ id: grit, rank: 3 }, talents);
  check('canonical talent resolves name + rank', disp.name === 'Grit' && disp.rank === 3 && !disp._legacy);
  const dangling = CR.resolveTalentEntry({ id: 'no_such_talent_xyz', rank: 1 }, talents);
  check('dangling talent id -> _unresolved, never throws', dangling._unresolved === true);
  const legacy = CR.resolveTalentEntry({ name: 'Hand Tooled', description: 'old text' }, talents);
  check('legacy talent entry passes through marked', legacy.name === 'Hand Tooled' && legacy._legacy === true && legacy.description === 'old text');
  const pdisp = CR.resolvePowerEntry({ id: 'enhance', basic: true, upgrades: ['enhancecont1'] }, powers);
  check('canonical power resolves printed name + upgrade name', pdisp.name === powers.enhance.name && pdisp.upgradeNames.length === 1 && pdisp.upgradeNames[0] === powers.enhance.abilities.enhancecont1.name);
  check('power display upgrades are NAMES, keys preserved', pdisp.upgrades[0] === pdisp.upgradeNames[0] && pdisp.upgradeKeys[0] === 'enhancecont1');

  // ── 3. migration ──
  const tIdx = CR.buildNameIndex(talents);
  const pIdx = CR.buildNameIndex(powers);
  check('talent registry has >= 1 name collision (homonym safety is live)', tIdx.collisions.length >= 1);
  check('power registry has 0 name collisions', pIdx.collisions.length === 0);

  const homonym = tIdx.collisions[0];
  const homonymDisplayName = homonym.replace(/\b\w/g, (c) => c.toUpperCase());
  const mig = CR.migrateSheetTalents(
    [{ name: 'Grit', description: 'x' }, { name: 'Grit', description: 'x' }, { name: homonymDisplayName, description: 'y' }],
    talents
  );
  const migGrit = mig.value.find((t) => t.id === grit);
  check('migration collapses duplicate Grit -> {id, rank:2}', !!migGrit && migGrit.rank === 2);
  const migHom = mig.value.find((t) => t._legacy);
  check('ambiguous name ("' + homonym + '") stays MARKED legacy, never guessed', !!migHom && !migHom.id && (migHom.name || '').toLowerCase() === homonym);

  const unranked = Object.keys(talents).find((id) => !talents[id].ranked && !(CR.buildNameIndex(talents).byName[talents[id].name.trim().toLowerCase()] === false));
  const migDupUnranked = CR.migrateSheetTalents(
    [{ name: talents[unranked].name }, { name: talents[unranked].name }],
    talents
  );
  check('duplicate UNRANKED talent stays legacy (anomaly preserved)', migDupUnranked.value.every((t) => t._legacy === true));

  const migP = CR.migrateSheetForcePowers(
    [{ name: powers.enhance.name, desc: 'old', upgrades: [{ name: 'Control', key: 'ENHANCECONT1', desc: '' }] }],
    powers
  );
  check('legacy power migrates by unique name; upgrade key matched case-insensitively', migP.value[0].id === 'enhance' && migP.value[0].upgrades[0] === 'enhancecont1');
  const migBadUp = CR.migrateSheetForcePowers(
    [{ name: powers.enhance.name, desc: 'old', upgrades: [{ name: 'Mystery', key: 'not_a_key', desc: '' }] }],
    powers
  );
  check('one unmatched upgrade keeps the WHOLE power entry legacy (atomic)', migBadUp.value[0]._legacy === true && !migBadUp.value[0].id);
  const migPara = CR.migrateSheetForcePowers([{ name: 'Heal', desc: 'paraphrase' }], powers);
  check('unmatched legacy power name ("Heal" vs "Heal/Harm") stays marked legacy', migPara.value[0]._legacy === true);

  // ── 4. sheet-level additive ids ──
  // THE FIXTURE PICKS AN UNAMBIGUOUS SPECIES, DERIVED — it used to take `Object.keys(species)[0]`,
  // which is `aleena`, and A-MSP-2's renames made that name one of 117 carried by two records. The
  // ASSERT'S SUBJECT IS UNCHANGED (migrateSheet stamps ids alongside the name strings); what changed
  // is that an arbitrary registry position is no longer a valid way to choose a species for it,
  // because R-MRN-2 makes a shared name deliberately unstampable. Derived rather than hardcoded so a
  // future import cannot silently make this fixture ambiguous again.
  const __nameKey = (n) => String(n || '').replace(/’/g, "'").trim().toLowerCase();
  const __byName = {};
  Object.keys(species).forEach((id) => { (__byName[__nameKey(species[id].name)] ||= []).push(id); });
  const uniqueSpeciesId = Object.keys(species).find((id) => __byName[__nameKey(species[id].name)].length === 1);
  const sheet = { career: careers[Object.keys(careers)[0]].name, species: species[uniqueSpeciesId].name, talents: [], forcePowers: [] };
  const migS = CR.migrateSheet(sheet, charbuild);
  check('migrateSheet adds careerId + speciesId alongside name strings', sheet.careerId === Object.keys(careers)[0] && sheet.speciesId === uniqueSpeciesId && typeof sheet.career === 'string');
  // R-MRN-2's negative twin, added here because this is the guard that owns migrateSheet's shape:
  // a SHARED name is never stamped, so a legacy save stays name-keyed and stays convertible.
  const ambiguousName = Object.keys(__byName).find((k) => __byName[k].length > 1);
  const ambSheet = { career: careers[Object.keys(careers)[0]].name, species: species[__byName[ambiguousName][0]].name, talents: [], forcePowers: [] };
  CR.migrateSheet(ambSheet, charbuild);
  check('migrateSheet REFUSES to stamp a species name carried by more than one record (R-MRN-2)', ambSheet.speciesId === undefined && typeof ambSheet.species === 'string');

  // ── 5. canonical entries are untouched by migration ──
  const stable = CR.migrateSheetTalents([{ id: grit, rank: 2 }], talents);
  check('already-canonical entries are no-ops (no changed flag)', stable.changed === false && stable.value[0].id === grit);

  // ── 6. skillRankCost — THE one pricing path (CR-RAW #2, ruling creator-raw-defects §3.2) ──
  // Expected values derived from RAW (R-RAWG1): training a skill's next rank costs 5 × the new
  // rank for a career skill; a non-career skill costs 5 more (EotE p.102; creation p.44).
  check('skillRankCost: career rank 1 = 5 XP (EotE p.102)', CR.skillRankCost(1, true) === 5);
  check('skillRankCost: career rank 2 = 10 XP', CR.skillRankCost(2, true) === 10);
  check('skillRankCost: non-career rank 1 = 10 XP (+5, EotE p.102)', CR.skillRankCost(1, false) === 10);
  check('skillRankCost: non-career rank 2 = 15 XP', CR.skillRankCost(2, false) === 15);
  check('skillRankCost: career vs non-career differ by exactly 5 at every rank',
    [1, 2, 3, 4, 5].every((r) => CR.skillRankCost(r, false) - CR.skillRankCost(r, true) === 5));
  check('skillRankCost: rank 5 career = 25 XP; past the table (rank 6) = null',
    CR.skillRankCost(5, true) === 25 && CR.skillRankCost(6, true) === null);
  check('skillRankCost: rank 0 / null are null (no free-rank pricing)',
    CR.skillRankCost(0, true) === null && CR.skillRankCost(null, false) === null);

  // ── B-29: born-owned specs (finalize seed) + read-time heal ──────────────────────────
  // The born-owned invariant: a zero-talent creator state that CHOSE a spec finalizes OWNING it
  // (owned:[]), not with an empty list. This is the bug's root — Guided/no-talent characters
  // were born spec-less and ADVANCEMENT misfiled them as pre-tracking legacy.
  check('B-29: zero-talent finalize seeds the chosen spec with owned:[]',
    JSON.stringify(CR.specsFromCreatorState({}, ['scoundrel'])) === '[{"id":"scoundrel","owned":[]}]');
  check('B-29: purchased cells still populate owned (union with chosen)',
    (function () {
      var out = CR.specsFromCreatorState({ 'scoundrel_r0c0': { specKey: 'scoundrel', row: 0, col: 0 } }, ['scoundrel']);
      return out.length === 1 && out[0].id === 'scoundrel' && out[0].owned.length === 1 && out[0].owned[0] === '0-0';
    })());
  check('B-29: no chosen ids + no talents → empty (unchanged legacy behavior)',
    JSON.stringify(CR.specsFromCreatorState({})) === '[]');

  var CB = { specializations: { scoundrel: { id: 'scoundrel', name: 'Scoundrel' } } };
  check('B-29 heal: empty specs + specializationIds → owned:[] at read',
    JSON.stringify(CR.resolveSheetSpecs({ specializations: [], specializationIds: ['scoundrel'] }, CB)) === '[{"id":"scoundrel","owned":[]}]');
  check('B-29 heal: empty specs + resolvable NAME (pregen path) → owned:[]',
    JSON.stringify(CR.resolveSheetSpecs({ specializations: [], specialization: 'Scoundrel' }, CB)) === '[{"id":"scoundrel","owned":[]}]');
  check('B-29 heal: TRUE legacy (no resolvable evidence) → [] (stub still fires)',
    JSON.stringify(CR.resolveSheetSpecs({ specializations: [], specialization: 'Nonexistent' }, CB)) === '[]');
  check('B-29 heal: existing owned specs pass through unchanged',
    JSON.stringify(CR.resolveSheetSpecs({ specializations: [{ id: 'x', owned: ['0-0'] }] }, CB)) === '[{"id":"x","owned":["0-0"]}]');
  check('B-29 heal: no charbuild → raw list (graceful, no throw)',
    JSON.stringify(CR.resolveSheetSpecs({ specializations: [], specializationIds: ['scoundrel'] }, null)) === '[]');

  console.log(failures === 0 ? '\nchar_resolve guard: ALL PASS' : '\nchar_resolve guard: ' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main();
