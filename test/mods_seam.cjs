#!/usr/bin/env node
/**
 * mods_seam.cjs — STANDING guard for the reSpecialized resolver (F-9 Phase B, build-plan B1/B4).
 * Pins the two properties the whole feature's safety rests on:
 *   1. applyOverlay is PURE — it never mutates its input registries.
 *   2. STAMP-PRECEDENCE truth table — resolveForStamp resolves against a SHEET's stamp ONLY, never
 *      the global toggle (architecture §3.4: discovery vs ownership). The four ruled fixtures:
 *        (a) vanilla sheet  + toggle OFF → BASE tree
 *        (b) stamped sheet  + toggle OFF → THEIR tree   ← the load-bearing case (turn the mod off, keep the char)
 *        (c) stamped sheet  + toggle ON  → THEIR tree
 *        (d) vanilla sheet  + toggle ON  → BASE tree    ← the toggle never rewrites existing chars
 *   1b. F-100 (R-FEGC-7): a reSpecialized twin's pool_mods survive applyOverlay and reach poolMods.collect
 *       through charResolve.ownedTalentPoolSources (served pack over the shipped registry).
 *
 * Run: node test/mods_seam.cjs
 */
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'lib/shared/mods.js'));

let failures = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(m + ` (got ${JSON.stringify(a)} want ${JSON.stringify(b)})`); };

// ── fixtures: a base registry + one overlay pack ──
function baseReg() {
  return {
    species: { human: { id: 'human' } },
    specializations: {
      scoundrel: { id: 'scoundrel', career_skills: ['cool'], talent_tree: [{ cost: 5, talents: [{ talent: 'grit' }] }] },
      pilot: { id: 'pilot', talent_tree: [{ cost: 5, talents: [{ talent: 'grit' }] }] },
    },
    talents: { grit: { id: 'grit', name: 'Grit', description: 'base' } },
  };
}
const PACK = {
  specializations: { scoundrel: { talent_tree: [{ cost: 5, talents: [{ talent: 'respec_opp' }] }] } },
  talents: { respec_opp: { id: 'respec_opp', name: 'Opportunist', description: 'variant', _provenance: 'respecialized', sources: [] } },
};

// ── 1. applyOverlay PURITY ──
(function () {
  const reg = baseReg();
  const snapshot = JSON.stringify(reg);
  const view = M.applyOverlay(reg, PACK);
  eq(JSON.stringify(reg), snapshot, 'purity: applyOverlay mutated its input registries');
  if (view === reg) fail('purity: applyOverlay returned the same object (must be a new view)');
  if (view.specializations === reg.specializations) fail('purity: specializations map not copied');
  if (view.talents === reg.talents) fail('purity: talents map not copied');
  // merge correctness
  eq(view.specializations.scoundrel.talent_tree[0].talents[0].talent, 'respec_opp', 'merge: overlay tree not applied to scoundrel');
  eq(view.specializations.scoundrel.career_skills, ['cool'], 'merge: base field (career_skills) lost on overlaid spec');
  eq(view.specializations.pilot.talent_tree[0].talents[0].talent, 'grit', 'merge: non-overlaid spec changed');
  if (!view.talents.respec_opp) fail('merge: overlay talent not added');
  eq(view.talents.grit.description, 'base', 'merge: base talent mutated');
  eq(view.species, reg.species, 'merge: unrelated registry (species) not preserved by-ref');
})();

// ── 1b. F-100 (R-FEGC-7, R-F100-6): a reSpecialized TWIN's dice survive the overlay and reach the roll ──
// The SERVED eote pack over the SHIPPED registry: `respec_galmap` IS Galaxy Mapper; the view must keep the
// pool_mods the applier gave it, and poolMods.collect's owned-talents arm must turn a two-rank owner into ONE
// line, count 2, named by the twin — else a reSpecialized character's Galaxy Mapper adds no dice.
(function () {
  const fs = require('fs');
  const CR = require(path.resolve(__dirname, '..', 'lib/shared/charResolve.js'));
  const PM = require(path.resolve(__dirname, '..', 'lib/shared/poolMods.js'));
  const J = (rel) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8'));
  const base = { talents: J('public/data/canonical/talents.json').talents, species: {}, specializations: {} };
  const pack = { talents: J('public/data/mods/respecialized/eote-v1/talents.overlay.json').talents };
  const view = M.applyOverlay(base, pack);
  // RE-POINTED (F-100 M8, ruling f100-m8-batches ADDENDUM 25 R-M8BG-85's systemic clause): each row's `words` / `condition`
  // SPAN object is dropped from both sides — R-M8G-36 makes a twin's span index the twin's OWN description. Every grant
  // key (die, direction, count, per_rank, applies_to, cite) is kept; a verbatim-text condition is kept.
  const isSpan = (v) => !!v && typeof v === 'object' && 'hash' in v && 'start' in v && 'end' in v;
  const noSpan = (arr) => arr && arr.map((r) => { const o = { ...r }; ['words', 'condition'].forEach((k) => { if (isSpan(o[k])) delete o[k]; }); return o; });
  eq(JSON.stringify(noSpan(view.talents.respec_galmap && view.talents.respec_galmap.pool_mods)),
    JSON.stringify(noSpan(base.talents.galaxy_mapper.pool_mods)), 'F-100 twin: the view keeps respec_galmap.pool_mods equal to galaxy_mapper\'s, its own words span aside');
  const lines = PM.collect(null, CR.ownedTalentPoolSources({ talents: [{ id: 'respec_galmap', rank: 2 }] }, view));
  eq(lines.map((l) => [l.source, l.die, l.direction, l.count]), [['Galaxy Mapper', 'setback', 'remove', 2]],
    'F-100 twin: a two-rank reSpecialized Galaxy Mapper → ONE line, remove 2 setback, named');
  if (!pack.talents.respec_galmap) fail('F-100 twin: the served pack no longer carries respec_galmap — the row aimed at nothing');
})();

// ── 2. STAMP-PRECEDENCE truth table (resolveForStamp reads the stamp ONLY) ──
// mock fetch to serve the overlay pack from any respecialized@… stamp path
global.fetch = function (url) {
  if (!/eote-v1/.test(url)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
  const body = /specializations\.overlay/.test(url) ? { specializations: PACK.specializations }
    : /talents\.overlay/.test(url) ? { talents: PACK.talents } : {};
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
};
const STAMP = 'respecialized@eote-v1';
async function treeTalent(mods) {
  const view = await M.resolveForStamp(mods, baseReg());
  return view.specializations.scoundrel.talent_tree[0].talents[0].talent;
}
(async function () {
  // resolveForStamp reads the sheet's stamp, never M.active() — so the global toggle is irrelevant here
  eq(await treeTalent([]), 'grit', '(a)/(d) vanilla stamp → BASE tree');            // toggle state does not matter
  eq(await treeTalent([STAMP]), 'respec_opp', '(b)/(c) stamped → THEIR tree');       // even with toggle OFF
  // version pinning: a different (unfetchable) version resolves to base gracefully, not a throw
  const v2 = await M.resolveForStamp(['respecialized@does-not-exist'], baseReg());
  eq(v2.specializations.scoundrel.talent_tree[0].talents[0].talent, 'grit', 'version-pin: missing pack → base, graceful');

  if (failures) { console.error(`\nmods_seam guard: ${failures} FAIL`); process.exit(1); }
  console.log('mods seam guard: ALL PASS (applyOverlay pure; F-100 twin dice reach collect; stamp-precedence 4/4; version-pin graceful)');
})();
