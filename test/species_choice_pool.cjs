#!/usr/bin/env node
/**
 * species_choice_pool.cjs — the FREE-CHOICE SKILL GRANT resolves in the shared core.
 *
 * WHY. `skill_choice_grants` ("one rank in a skill of your choice" — Human, Geonosian, Mandalorian
 * Human, Kaminoan Green Eyes, Xi'Dec Constructor) was the one species option key whose resolution
 * lived in `player/app.jsx` instead of `lib/shared/charResolve.js`. Every other key (characteristics,
 * thresholds, XP, skill_grants, abilities, talents) resolves from (record, picks) in the core, which
 * is what lets the exception census pin it and lets a creator revision leave it alone. This one did
 * not, so the census read it as "resolves to nothing" while the product resolved it in the UI.
 * The move puts it beside the others; this guard pins the contract on the SHIPPED registry + vocab.
 *
 * WHAT IT PINS
 *   1. Record-level grants come back from (rec, {}) — Human 2×non_career.
 *   2. Option-level grants come back only when that option is PICKED — Kaminoan Green Eyes; the
 *      other castes return the record's (empty) list. (Xi'Dec Constructor left this class when the
 *      data followed the CSG page: Athletics AND Mechanics, two fixed grants.) Scalar and list picks both read.
 *   3. Record + option concatenate in that order (a fixture, since no shipped species carries both).
 *   4. Pools: explicit id list (Lasat: brawl/lore), `non_career` excludes exactly the career set, `any` is every skill,
 *      a GROUP name filters by skills.vocab.json's group and comes back label-sorted.
 *   5. An unknown group THROWS by name rather than offering every skill (ruling
 *      `f-eds-6-pool-enum-halt`), and the message keeps the text smoke_species_pool_groups asserts.
 *   6. Every shipped carrier resolves to a NON-EMPTY pool against the shipped vocab — the census's
 *      "INERT" class, checked on all 23 rather than on one exemplar.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const species = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species);
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/skills.vocab.json'), 'utf8')).entries;
const charbuild = { skillNames: {}, skillGroups: {} };
vocab.forEach(e => { charbuild.skillNames[e.id] = e.label; if (e.group) charbuild.skillGroups[e.id] = e.group; });
const byName = n => species.find(s => s.name === n);
const slug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

let n = 0;
const ok = (label, cond, detail) => { n++; assert(cond, `${label}${detail ? ' — ' + detail : ''}`); console.log('  ok', label); };

// 1. record-level
const human = byName('Human');
const hg = R.speciesChoiceGrants(human, {});
ok('Human: record-level grant from (rec, {})', hg.length === 1 && hg[0].count === 2 && hg[0].pool === 'non_career', JSON.stringify(hg));

// 2. option-level, only when picked — Kaminoan's Green Eyes caste carries `skill_choice_grants`
//    (Xi'Dec Constructor did until the data followed the CSG page — "1 rank in Athletics AND Mechanics"
//    — and became two fixed `skill_grants`; the lab's SOURCE_CORRECTION and the registry now agree).
const kaminoan = species.find(s => s.id === 'csg_kaminoan');
const castes = kaminoan.option_choices.find(g => slug(g.name) === 'castes');
const green = castes.options.find(o => o.skill_choice_grants);
ok('Kaminoan: no pick → no grant', R.speciesChoiceGrants(kaminoan, {}).length === 0);
const cg = R.speciesChoiceGrants(kaminoan, { castes: green.id });
ok(`Kaminoan ${green.name} (scalar pick) → 1 grant`, cg.length === 1 && cg[0].pool === 'non_career', JSON.stringify(cg));
ok(`Kaminoan ${green.name} (list pick) → same grant`, JSON.stringify(R.speciesChoiceGrants(kaminoan, { castes: [green.id] })) === JSON.stringify(cg));
castes.options.filter(o => o.id !== green.id).forEach(o =>
  ok(`Kaminoan ${o.name} → no grant`, R.speciesChoiceGrants(kaminoan, { castes: o.id }).length === 0));
const xidec = species.find(s => /xi.dec/i.test(s.name));
const constructor = xidec.option_choices.find(g => slug(g.name) === 'genders').options.find(o => o.id === 'constructor');
ok('Xi\'Dec Constructor grants Athletics AND Mechanics as fixed ranks (CSG p.392), no choice', !constructor.skill_choice_grants && JSON.stringify(R.speciesSkillGrants(xidec, { genders: 'constructor' }, null)) === '{"athletics":1,"mechanics":1}');

// 3. record + option concatenate, record first (fixture — no shipped species carries both)
const fx = { skill_choice_grants: [{ count: 1, pool: 'any' }], option_choices: [{ name: 'Castes', options: [{ id: 'a', skill_choice_grants: [{ count: 1, pool: 'combat' }] }] }] };
const fg = R.speciesChoiceGrants(fx, { castes: 'a' });
ok('fixture: record grant then option grant', fg.length === 2 && fg[0].pool === 'any' && fg[1].pool === 'combat');

// 4. pools
const lasat = species.find(s => s.name === 'Lasat');
const lpool = R.speciesChoicePool(R.speciesChoiceGrants(lasat, {})[0], charbuild, {});
ok('Lasat: an explicit-list pool resolves to exactly its ids (brawl + lore)', JSON.stringify(lpool) === JSON.stringify(['brawl', 'lore']) || JSON.stringify(lpool) === JSON.stringify(['brawl', 'knowledge_lore']), JSON.stringify(lpool));
const career = { athletics: true, brawl: true, coercion: true, melee: true, resilience: true, survival: true, vigilance: true, gunnery: true };
const nc = R.speciesChoicePool(hg[0], charbuild, career);
ok('Human non_career pool excludes exactly the career set', nc.length === vocab.length - Object.keys(career).length && nc.every(id => !career[id]), `${nc.length} of ${vocab.length}`);
ok('any pool = every skill', R.speciesChoicePool({ count: 1, pool: 'any' }, charbuild, career).length === vocab.length);
const combat = R.speciesChoicePool({ count: 1, pool: 'combat' }, charbuild, {});
ok('combat group pool matches the vocab\'s combat group, label-sorted',
  combat.length === vocab.filter(e => e.group === 'combat').length
  && JSON.stringify(combat) === JSON.stringify(combat.slice().sort((a, b) => charbuild.skillNames[a].localeCompare(charbuild.skillNames[b]))), JSON.stringify(combat));
ok('explicit list drops an unresolvable id', JSON.stringify(R.speciesChoicePool({ count: 1, pool: ['survival', 'no_such_skill'] }, charbuild, {})) === JSON.stringify(['survival']));
ok('no grant / no charbuild → []', R.speciesChoicePool(null, charbuild, {}).length === 0 && R.speciesChoicePool(hg[0], null, {}).length === 0);

// 5. unknown group throws by name, message text unchanged for the smoke
assert.throws(() => R.speciesChoicePool({ count: 1, pool: 'psionic' }, charbuild, {}), /speciesChoicePoolOf: unknown skill-group pool "psionic"/);
n++; console.log('  ok unknown group pool throws by name');

// 6. every shipped carrier resolves to a non-empty pool
let carriers = 0;
species.forEach(s => {
  const picksAll = {};
  (s.option_choices || []).forEach(g => { g.options.forEach(o => { if (o.skill_choice_grants) picksAll[slug(g.name)] = o.id; }); });
  const grants = R.speciesChoiceGrants(s, picksAll);
  if (!grants.length && !s.skill_choice_grants) return;
  grants.forEach(g => { carriers++; const pool = R.speciesChoicePool(g, charbuild, {}); assert(pool.length > 0, `${s.name}: grant ${JSON.stringify(g)} resolves to an EMPTY pool`); });
});
const expectedGrants = species.reduce((n, s) => n + (s.skill_choice_grants || []).length + (s.option_choices || []).reduce((m, g) => m + (g.options.some(o => o.skill_choice_grants) ? Math.max(...g.options.map(o => (o.skill_choice_grants || []).length)) : 0), 0), 0);
ok(`every shipped carrier resolves to a non-empty pool (${carriers} grants; the data says ${expectedGrants})`, carriers === expectedGrants && carriers > 0, `${carriers} vs ${expectedGrants}`);

console.log(`species_choice_pool: ${n} checks passed`);

// ── OVERLAY TWINS OF DERIVED-EFFECT TALENTS (the respec_grit finding) ────────────────────────────
// A GAME VARIANTS pack ships Grit as `respec_grit`; TALENT_DERIVED_EFFECTS is keyed by the canonical
// id. Before `derivedEffectOf`, the overlay id matched nothing and a reSpecialized Grit granted no
// strain threshold. Pinned here on the shipped packs, not on a fixture: every overlay talent whose
// NAME matches a derived-effect talent resolves to the same bonus, and an overlay ORIGINAL stays inert.
{
  const modsRoot = path.join(ROOT, 'public/data/mods');
  const derivedIds = ['grit', 'toughened', 'enduring', 'sixth_sense', 'superior_reflexes', 'force_rating', 'dedication', 'armor_master', 'armor_master_improved'];
  const canonTalents = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/talents.json'), 'utf8')).talents);
  // F-100 R-FEGC-1: the resolver is registry-fed (throws without one). The canonical twin resolves from its
  // registry `effects[]`; the overlay twin (no effects[] yet) from the frozen old-data fallback — so this
  // pin now also proves the two paths agree. The registry is the canonical map overlaid by the pack's talents.
  const canonReg = Object.fromEntries(canonTalents.map(t => [t.id, t]));
  const nameOf = id => (canonTalents.find(t => t.id === id) || {}).name;
  let twins = 0;
  for (const mod of fs.readdirSync(modsRoot)) for (const ver of fs.readdirSync(path.join(modsRoot, mod))) {
    const f = path.join(modsRoot, mod, ver, 'talents.overlay.json'); if (!fs.existsSync(f)) continue;
    const packTalents = JSON.parse(fs.readFileSync(f, 'utf8')).talents;
    const reg = Object.assign({}, canonReg, packTalents);
    for (const ot of Object.values(packTalents)) {
      const twin = derivedIds.find(id => nameOf(id) && nameOf(id).toLowerCase() === String(ot.name).toLowerCase());
      if (!twin) continue;
      twins++;
      assert.deepStrictEqual(R.derivedBonusesFromTalents([ot.id, ot.id], reg), R.derivedBonusesFromTalents([twin, twin], reg), `${mod}@${ver} ${ot.id} must grant what ${twin} grants`);
    }
  }
  ok(`overlay twins of derived-effect talents grant the canonical bonus (${twins} twins across the shipped packs)`, twins >= 2, String(twins));
  ok('an overlay ORIGINAL stays inert (respec_opp)', Object.values(R.derivedBonusesFromTalents(['respec_opp'], canonReg)).every(v => !v));
  ok('an unknown prefixed id stays inert (respec_no_such_talent)', Object.values(R.derivedBonusesFromTalents(['respec_no_such_talent'], canonReg)).every(v => !v));
}
console.log('species_choice_pool + overlay twins: done');
