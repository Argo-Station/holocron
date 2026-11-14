#!/usr/bin/env node
/**
 * crafting_effects.cjs — STANDING guard for the crafting application point (R-CVS-3).
 *
 * `crafting-v1-spend` §4 ruled that spend effects apply IN CODE, BY ROW ID, at one point, with the
 * unapplied set NAMED rather than silently skipped. R-CVS-3 requires: the application point is a
 * named function with its own unit guard, applied rows PROVEN and unapplied rows ENUMERATED.
 *
 * The load-bearing assert is §2 — CLOSURE. RE-POINTED by release-r5-crafting-sm (contract
 * `release-r5-crafting-contract` R-R5CC-1): the closed code map RETIRED into the registry's own `effects` / `told`, so
 * map-vs-registry drift can no longer happen. §2 now asserts what replaced it: every registry row carries exactly one of
 * effects / told, and every effect's `type` is in the SHARED grammar the applier hands to ItemResolve. KEPT: §1, §3–§6
 * unchanged (each row's documented mutation, the loud unknown id, the enumerated told rows, purity, sequencing). DROPPED:
 * the two map-key set comparisons (no map). The 29-row equivalence with the old map is test/release_r5_craft_equivalence.cjs.
 *
 * Run: node test/crafting_effects.cjs
 */
const fs = require('fs');
const path = require('path');
const C = require('../lib/shared/crafting.js');
let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}

const REG = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'data', 'canonical', 'crafting_spend.json'), 'utf8'));
const MELEE = REG.spend.brawl_melee;
const REG_IDS = MELEE.improvements.concat(MELEE.flaws).map((r) => r.id);

// A stand-in for a template's result_profile — the Vibro-weapon's shape (Special Modifications p.77).
const BASE = () => ({
  name: 'Vibro-weapon', type: 'Melee', skill: 'melee', hands: 'one_handed',
  damage: { value: 1, base: 'brawn' }, crit: 2, range: 'engaged',
  encumbrance: 2, hardpoints: 3,
  qualities: [{ id: 'pierce', name: 'Pierce', ranked: true, rank: 2 }],
});
const q = (p, id) => (p.qualities.find((x) => x.id === id) || {});
const one = (id, base) => C.applyCraftingSpend(base || BASE(), [id]).profile;

function main() {
  // ── 1. Every APPLIED row produces its documented mutation ──────────────────
  check('two_handed: +1 damage, +2 encumbrance, hands -> two_handed', (() => {
    const p = one('two_handed');
    return p.damage.value === 2 && p.encumbrance === 4 && p.hands === 'two_handed';
  })());
  check('lightweight: encumbrance -1', one('lightweight').encumbrance === 1);
  check('lightweight: floors at 1, never 0',
    C.applyCraftingSpend({ encumbrance: 1, qualities: [] }, ['lightweight', 'lightweight']).profile.encumbrance === 1);
  check('destructive: +1 damage', one('destructive').damage.value === 2);
  check('customizable: +1 hard point', one('customizable').hardpoints === 4);
  check('lethal: crit -1', one('lethal').crit === 1);
  check('lethal: crit floors at 1', one('lethal', Object.assign(BASE(), { crit: 1 })).crit === 1);
  check('heavy: +1 encumbrance', one('heavy').encumbrance === 3);

  // quality rows — grant when absent, increment when present, cap where crafting prints one
  check('knockdown_quality: bare grant (unranked, no rank field)', (() => {
    const k = q(one('knockdown_quality'), 'knockdown');
    return k.ranked === false && k.rank === undefined;
  })());
  check('sunder_quality: bare grant', q(one('sunder_quality'), 'sunder').ranked === false);
  check('pierce_quality: increments the EXISTING Pierce 2 -> 3', q(one('pierce_quality'), 'pierce').rank === 3);
  check('vicious_quality: grants Vicious at 1 when absent', q(one('vicious_quality'), 'vicious').rank === 1);
  check('defensive_quality: caps at crafting\'s 3', (() => {
    const p = C.applyCraftingSpend(BASE(), Array(6).fill('defensive_quality')).profile;
    return q(p, 'defensive').rank === 3;
  })());
  check('vicious_quality: caps at crafting\'s 5', (() => {
    const p = C.applyCraftingSpend(BASE(), Array(9).fill('vicious_quality')).profile;
    return q(p, 'vicious').rank === 5;
  })());
  check('accurate/deflection cap at 3', (() => {
    const a = C.applyCraftingSpend(BASE(), Array(5).fill('accurate_quality')).profile;
    const d = C.applyCraftingSpend(BASE(), Array(5).fill('deflection_quality')).profile;
    return q(a, 'accurate').rank === 3 && q(d, 'deflection').rank === 3;
  })());
  check('pierce/stun/ensnare/cumbersome/inaccurate are UNCAPPED (crafting prints no maximum)', (() => {
    const p = C.applyCraftingSpend(BASE(), Array(7).fill('stun_quality')).profile;
    return q(p, 'stun').rank === 7;
  })());
  check('R-CQM-2: crafting onto a canon Vicious 6 never downgrades it to 5', (() => {
    const base = Object.assign(BASE(), { qualities: [{ id: 'vicious', name: 'Vicious', ranked: true, rank: 6 }] });
    return q(one('vicious_quality', base), 'vicious').rank === 6;
  })());
  check('cumbersome_quality + inaccurate_quality (flaw side) apply', (() => {
    const p = C.applyCraftingSpend(BASE(), ['cumbersome_quality', 'inaccurate_quality']).profile;
    return q(p, 'cumbersome').rank === 1 && q(p, 'inaccurate').rank === 1;
  })());

  // ── 2. CLOSURE — every registry row is effects XOR told, in the shared grammar (R-R5CC-1) ──
  const SHARED = ['quality_add', 'damage_delta', 'crit_delta', 'encumbrance_delta', 'range_delta', 'defense_delta', 'soak_delta',
    'hands_set', 'hard_points_delta', 'quality_grant', 'qualities_reduce', 'pool_mod', 'item_character_effect'];
  const ROWS = MELEE.improvements.concat(MELEE.flaws);
  const xor = ROWS.filter((r) => Array.isArray(r.effects) === !!r.told).map((r) => r.id);
  check(`closure: every registry row carries exactly one of effects / told (${REG_IDS.length} rows) — off: ${xor.join(',') || 'none'}`,
    xor.length === 0);
  const foreign = [];
  ROWS.forEach((r) => (r.effects || []).forEach((fx) => { if (SHARED.indexOf(fx.type) === -1) foreign.push(r.id + ':' + fx.type); }));
  check(`closure: every effect is a shared-grammar op — foreign: ${foreign.join(',') || 'none'}`, foreign.length === 0);
  check('closure: the closed map is gone (CRAFT_EFFECTS not exported)', C.CRAFT_EFFECTS === undefined);
  const mapIds = REG_IDS;

  // ── 3. Unknown ids are LOUD (closed map; crafting ids come from the registry) ──
  let threw = false;
  try { C.applyCraftingSpend(BASE(), ['not_a_real_row']); } catch (e) { threw = /unknown spend row id/.test(e.message); }
  check('unknown row id THROWS (code path -> bug, never silent)', threw);

  // ── 4. Unapplied rows are ENUMERATED, not skipped silently (§4 inform-and-record) ──
  const res = C.applyCraftingSpend(BASE(), ['schematic', 'destructive', 'wear_and_tear']);
  check('unapplied rows are returned with reasons', res.unapplied.length === 2
    && res.unapplied.every((u) => typeof u.reason === 'string' && u.reason.length > 10));
  check('an unapplied row does NOT block the applied ones in the same list', res.profile.damage.value === 2);
  check('applied + unapplied partition the whole registry with no overlap', (() => {
    const a = C.appliedRowIds(), u = C.unappliedRowIds();
    return a.length + u.length === mapIds.length && a.filter((x) => u.indexOf(x) !== -1).length === 0;
  })());
  console.log(`         → applied ${C.appliedRowIds().length} / unapplied ${C.unappliedRowIds().length} of ${mapIds.length}`);
  console.log(`         → unapplied: ${C.unappliedRowIds().join(', ')}`);

  // ── 5. PURITY — the caller's profile survives untouched ──
  const src = BASE();
  const snap = JSON.stringify(src);
  C.applyCraftingSpend(src, ['two_handed', 'pierce_quality', 'destructive']);
  check('purity: input profile is not mutated', JSON.stringify(src) === snap);
  check('purity: nested damage + qualities are copied, not shared', (() => {
    const out = C.applyCraftingSpend(src, ['destructive']).profile;
    return out.damage !== src.damage && out.qualities !== src.qualities;
  })());

  // ── 6. Sequential spends accumulate (a real crafting result buys several) ──
  check('sequential: three spends compose onto one profile', (() => {
    const p = C.applyCraftingSpend(BASE(), ['destructive', 'two_handed', 'lightweight']).profile;
    // +1 dmg, then +1 dmg/+2 enc, then -1 enc  => dmg 3, enc 2+2-1 = 3
    return p.damage.value === 3 && p.encumbrance === 3 && p.hands === 'two_handed';
  })());

  console.log(failures === 0 ? '\ncrafting effects guard: ALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
