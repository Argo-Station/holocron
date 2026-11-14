#!/usr/bin/env node
/**
 * talent_effects.cjs — STANDING guard for talent derived effects (CS-4 R-CS4b, R-DAR4), RE-POINTED by
 * the F-100 grammar lap (rulings `f100-effects-census` §6 acceptance 1–3, `f100-effects-grammar-contracts`
 * R-FEGC-1, R-FEC-1): the effects now live in DATA (`talents.json` `effects[]`) and the resolver reads
 * them through the charbuild registry.
 *
 * THE ORACLE. The resolver's frozen nine-key map as it stood at d37d6745 is copied VERBATIM below
 * (`ORACLE`), together with the pre-F-100 summing algorithm. It is the independent statement the
 * registry-fed resolver must reproduce — byte-for-byte, over 84 tuples (acceptance 1, R-F100-5: no
 * derived number moves for any sheet). A guard that read its oracle back out of the thing it checks
 * could not fail; this one holds its own copy.
 *
 * Sections (the 28 claims the guard carried before the re-point are all KEPT — marked [K1]..[K28];
 * where a claim's property moved to the registry, the check reads the registry AND the kept fallback):
 *   1–7   the original claims, now driven through the registry (`dbFrom` passes `talents.json`).
 *   8     MIGRATION PROOF — 84 tuples byte-equal vs ORACLE. B-701 (FaD p.282; f100-triage-census-card ADDENDUM 12): a
 *         Force Rating rank counts only with Force access, so the 9 force_rating tuples run at forceRatingBase 1 (the
 *         smallest member the access predicate reads) and expect the oracle's number + that 1 (rank r → 1 + r); one
 *         more row pins the gate itself — base 0, no access, three ranks → 0.
 *   9     R-FEC-1 floor rows (Witchcraft) — base 0→1, 1→1, 2→2, base 0 + witchcraft + one Force Rating rank → 2.
 *   10    loud failure — no registry THROWS; an unimplemented op THROWS.
 *
 * Cites: Docs/RULES_FOUNDATION_ADVANCEMENT.md (EotE CRB p.132-145). Run: node test/talent_effects.cjs
 */
const fs = require('fs');
const path = require('path');
const CR = require('../lib/shared/charResolve.js');
const REG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/data/canonical/talents.json'), 'utf8')).talents;
const CB = { talents: REG };   // a charbuild carrying only the talent registry (no species → no species grants)
let failures = 0;
function check(label, cond, detail) { if (cond) console.log('  PASS  ' + label); else { failures += 1; console.error('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); } }

// ── THE ORACLE — charResolve.js TALENT_DERIVED_EFFECTS @ d37d6745, verbatim (comments trimmed) ──────────
const ORACLE = {
  grit:              { bonus: 'strainThresholdBonus', amount: 1, ranked: true },   // eote p.136
  toughened:         { bonus: 'woundThresholdBonus',  amount: 2, ranked: true },   // eote p.145
  enduring:          { bonus: 'soakBonus',            amount: 1, ranked: true },   // eote p.135
  sixth_sense:       { bonus: 'rangedDefenseBonus',   amount: 1, ranked: false },  // eote p.142 (flat)
  superior_reflexes: { bonus: 'meleeDefenseBonus',    amount: 1, ranked: false },  // eote p.144 (flat)
  force_rating:      { bonus: 'forceRatingBonus',     amount: 1, ranked: true },   // eote p.277 (R-FR1)
  dedication:        { characteristic: 1, ranked: true },                          // eote p.134, +1 chosen char, cap 6
  armor_master:          { conditional: 'armored',   soak: 1 },                     // eote p.132
  armor_master_improved: { conditional: 'armorSoak2', meleeDef: 1, rangedDef: 1 },  // eote p.132
};
// The pre-F-100 algorithm, verbatim in behaviour (derivedEffectOf's respec_ normaliser + the R-CS4e dedupe).
function oracleEffectOf(id) {
  if (id == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(ORACLE, id)) return ORACLE[id];
  if (String(id).indexOf('respec_') === 0) { const e = ORACLE[String(id).slice(7)]; if (e) return e; }
  return undefined;
}
function oracleDB(ids) {
  const b = { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0, forceRatingBonus: 0 };
  const seen = {};
  ids.forEach(id => {
    const e = oracleEffectOf(id);
    if (!e || !e.bonus) return;
    if (e.ranked === false) { if (seen[id]) return; seen[id] = true; }
    b[e.bonus] += e.amount;
  });
  return b;
}
function oracleCond(ids) {
  const out = [];
  ids.forEach(id => { const e = oracleEffectOf(id); if (e && e.conditional && out.indexOf(id) === -1) out.push(id); });
  return out;
}
// The derived numbers the frozen map yields for the fixed fixture below (brawn 2, willpower 2, bases 10/10,
// forceRatingBase 0, no weapons, no snapshot) — closed-form, from the ORACLE alone.
function oracleDerived(ids, eq) {
  const db = oracleDB(ids);
  const armored = !!(eq && eq.armor), aSoak = armored ? eq.armor.soak : 0, aDef = armored ? eq.armor.defense : 0;
  let cS = 0, cM = 0, cR = 0;
  oracleCond(ids).forEach(id => {
    const e = oracleEffectOf(id);
    const holds = (e.conditional === 'armored' && armored) || (e.conditional === 'armorSoak2' && aSoak >= 2);
    if (holds) { cS += e.soak || 0; cM += e.meleeDef || 0; cR += e.rangedDef || 0; }
  });
  return {
    soak: 2 + aSoak + db.soakBonus + cS,
    woundThreshold: 10 + 2 + db.woundThresholdBonus,
    strainThreshold: 10 + 2 + db.strainThresholdBonus,
    meleeDefense: Math.min(4, aDef + db.meleeDefenseBonus + cM),
    rangedDefense: Math.min(4, aDef + db.rangedDefenseBonus + cR),
    forceRating: 0 + db.forceRatingBonus,
  };
}

function main() {
  const dbFrom = ids => CR.derivedBonusesFromTalents(ids, REG);
  const condFrom = ids => CR.conditionalTalentsFromOwned(ids, REG);

  // 1. Each bonus talent → cited effect.
  check('[K1] Grit → +1 strainThresholdBonus', dbFrom(['grit']).strainThresholdBonus === 1);
  check('[K2] Toughened → +2 woundThresholdBonus', dbFrom(['toughened']).woundThresholdBonus === 2);
  check('[K3] Enduring → +1 soakBonus', dbFrom(['enduring']).soakBonus === 1);
  check('[K4] Sixth Sense → +1 rangedDefenseBonus', dbFrom(['sixth_sense']).rangedDefenseBonus === 1);
  check('[K5] Superior Reflexes → +1 meleeDefenseBonus', dbFrom(['superior_reflexes']).meleeDefenseBonus === 1);

  // 2. Ranked stacking (positional ownership → repeats).
  check('[K6] ranked stacking: 2× Grit → +2 strain', dbFrom(['grit', 'grit']).strainThresholdBonus === 2);
  check('[K7] ranked stacking: 3× Toughened → +6 wound', dbFrom(['toughened', 'toughened', 'toughened']).woundThresholdBonus === 6);

  // 3. Dedication is not a bonus (raises a chosen characteristic, applied at buy).
  const ded = dbFrom(['dedication']);
  check('[K8] Dedication contributes 0 bonuses (it raises a characteristic, not a bonus)',
    ded.soakBonus === 0 && ded.woundThresholdBonus === 0 && ded.strainThresholdBonus === 0 && ded.meleeDefenseBonus === 0 && ded.rangedDefenseBonus === 0);
  // Re-pointed: the effect now lives in the REGISTRY; the kept fallback map still says the same.
  const dedFx = (REG.dedication.effects || [])[0] || {};
  check('[K9] Dedication is a characteristic effect (+1 chosen, cap 6) — registry AND the kept fallback map',
    dedFx.op === 'characteristic_delta' && dedFx.target === 'chosen' && dedFx.amount === 1 && dedFx.per_rank === true
    && CR.TALENT_DERIVED_EFFECTS.dedication.characteristic === 1 && CR.CHARACTERISTIC_CAP === 6);

  // 4. Closed list — no generic parsing; unknowns ignored.
  // Re-aimed by ruling f100-m7-build R-M7G-1: K10 counts NUMBER-op effects only. F-100 M7's two SKILL ops
  // (career_skill, skill_characteristic) move no number; their 24 talents are pinned by name by test/f100_m7_engine.cjs A2/A3.
  // Re-pointed by f100-m8-batches R-M8BG-239 (M2): skill_substitute moves no number either; its five holders are pinned BY
  // KEY by test/f100_m8_skill_swap.cjs (H1). Kept: the closed number-op list and the fallback equality. Dropped: nothing.
  const SKILL_OPS = ['career_skill', 'skill_characteristic', 'skill_substitute'];
  const regFx = Object.keys(REG).filter(id => Array.isArray(REG[id].effects) && REG[id].effects.some(e => !SKILL_OPS.includes(e.op))).sort();
  const oracleKeys = Object.keys(ORACLE).sort();
  check('[K10] closed list, no generic parsing: the registry carries effects on EXACTLY the 9 oracle talents + witchcraft (R-FEC-1), and the kept fallback map is the same 9 keys',
    JSON.stringify(regFx) === JSON.stringify(oracleKeys.concat('witchcraft').sort())
    && JSON.stringify(Object.keys(CR.TALENT_DERIVED_EFFECTS).sort()) === JSON.stringify(oracleKeys),
    'registry: ' + regFx.join(',') + ' · fallback: ' + Object.keys(CR.TALENT_DERIVED_EFFECTS).sort().join(','));
  check('[K11] unknown talent id ignored (no throw, 0 effect)', dbFrom(['dodge', 'made_up']).soakBonus === 0);

  // 4d. TRUE-AIM1 DELETED (Amendment 3, R-ERR-6) — inverse pins.
  check('[K12] true_aim is NOT an effect talent (A3 deletion) — no registry effects[], not a fallback key',
    !CR.TALENT_DERIVED_EFFECTS.hasOwnProperty('true_aim') && !(REG.true_aim && REG.true_aim.effects));
  check('[K13] dbFrom([true_aim]) exposes no trueAimBonus (field absent)',
    !dbFrom(['true_aim']).hasOwnProperty('trueAimBonus'));
  const taSheet = { characteristics: {}, woundBase: 10, strainBase: 10, forceRatingBase: 0, derivedBonuses: dbFrom(['true_aim']) };
  check('[K14] computeDerived exposes no trueAimRanks (field absent)',
    !CR.computeDerived(taSheet, null, CB).hasOwnProperty('trueAimRanks'));

  // 4b. R-CS4e — non-ranked talents dedupe across trees; ranked stack (cross-tree auto-populate).
  check('[K15] non-ranked deduped: sixth_sense owned twice → +1 ranged def (not +2)', dbFrom(['sixth_sense', 'sixth_sense']).rangedDefenseBonus === 1);
  check('[K16] ranked stacks: grit owned twice → +2 strain', dbFrom(['grit', 'grit']).strainThresholdBonus === 2);
  // 4c. R-FR1 — force_rating talent feeds the number.
  check('[K17] R-FR1: force_rating ranked, stacks → forceRatingBonus 2 for two ranks', dbFrom(['force_rating', 'force_rating']).forceRatingBonus === 2);
  const frSheet = { characteristics: {}, woundBase: 10, strainBase: 10, forceRatingBase: 1, derivedBonuses: dbFrom(['force_rating', 'force_rating']) };
  check('[K18] R-FR1 e2e: forceRating = base 1 + 2 bought ranks = 3', CR.computeDerived(frSheet, null, CB).forceRating === 3);

  // 5. End-to-end: the registry feeds computeDerived (a bought talent's effect lands live).
  const sheet = {
    characteristics: { brawn: 2, willpower: 2 }, woundBase: 10, strainBase: 10, forceRatingBase: 0,
    derivedBonuses: dbFrom(['grit', 'toughened', 'enduring']),
  };
  const d = CR.computeDerived(sheet, null, CB);
  check('[K19] e2e: Grit+Toughened+Enduring → wound 14 (10+2+2), strain 13 (10+2+1), soak 3 (2+0+1)',
    d.woundThreshold === 14 && d.strainThreshold === 13 && d.soak === 3);

  // 6. R-CS4d — equipment-CONDITIONAL talents (armor_master pair), `when` in the registry.
  check('[K20] conditionalTalentsFromOwned filters to conditional ids only (armor_master, not grit)',
    JSON.stringify(condFrom(['grit', 'armor_master', 'toughened']).sort()) === JSON.stringify(['armor_master']));
  check('[K21] conditional talents are NOT summed into derivedBonuses (armor_master → 0 flat)',
    dbFrom(['armor_master', 'armor_master_improved']).soakBonus === 0 && dbFrom(['armor_master']).meleeDefenseBonus === 0);
  const base = { characteristics: { brawn: 2 }, woundBase: 10, strainBase: 10, forceRatingBase: 0, derivedBonuses: dbFrom([]) };
  const am = Object.assign({}, base, { derivedConditional: ['armor_master'] });
  check('[K22] armor_master: +1 soak ONLY while armor is worn', CR.computeDerived(am, { armor: { soak: 0 } }, CB).soak === 3 && CR.computeDerived(am, null, CB).soak === 2,
    'armored=' + CR.computeDerived(am, { armor: { soak: 0 } }, CB).soak + ' unarmored=' + CR.computeDerived(am, null, CB).soak);
  const ami = Object.assign({}, base, { derivedConditional: ['armor_master_improved'] });
  const hi = CR.computeDerived(ami, { armor: { soak: 2 } }, CB);
  const lo = CR.computeDerived(ami, { armor: { soak: 1 } }, CB);
  check('[K23] armor_master_improved: +1 melee AND ranged defense while soak≥2', hi.meleeDefense === 1 && hi.rangedDefense === 1);
  check('[K24] armor_master_improved: no bonus while soak<2', lo.meleeDefense === 0 && lo.rangedDefense === 0);

  // 7. DEF-1 — armor PROVIDES (best, no stack), talents INCREASE (stack on top), total caps at 4.
  const def = (armorDef, mBonus, condIds) => Object.assign({}, base, {
    derivedBonuses: Object.assign(dbFrom([]), { meleeDefenseBonus: mBonus || 0 }),
    derivedConditional: condIds || [],
  });
  check('[K25] DEF-1 additive base: armor 1 (provide) + Superior Reflexes 1 (increase) = melee defense 2',
    CR.computeDerived(def(0, 1, []), { armor: { defense: 1 } }, CB).meleeDefense === 2);
  check('[K26] DEF-1 uncapped below 4: provide 2 + increases 1+1 = 4 (exactly at cap, not clamped down)',
    CR.computeDerived(def(0, 1, ['armor_master_improved']), { armor: { defense: 2, soak: 2 } }, CB).meleeDefense === 4);
  check('[K27] DEF-1 CAP: provide 3 + increases 1+1 = 5 → clamped to 4',
    CR.computeDerived(def(0, 1, ['armor_master_improved']), { armor: { defense: 3, soak: 2 } }, CB).meleeDefense === 4);
  check('[K28] DEF-1 no armor: increases alone (Superior Reflexes 1) = 1, no provide, no cap effect',
    CR.computeDerived(def(0, 1, []), null, CB).meleeDefense === 1);

  // 8. MIGRATION PROOF (acceptance 1, R-F100-5): registry-fed derivedBonuses + derivedConditional +
  // computeDerived == the ORACLE's, byte-for-byte. 9 keys × ranks 1..3 × {unarmored, armor soak 0, armor
  // soak 2} = 81, + respec_grit × ranks 1..3 (an overlay twin with NO registry record → the old-data
  // fallback) = 84. Armor soak 2 carries defense 1 so the DEF-1 provide + increase path is in the tuple.
  const ARMOR = [['unarmored', null], ['armor soak 0', { armor: { soak: 0, defense: 0 } }], ['armor soak 2', { armor: { soak: 2, defense: 1 } }]];
  const tuples = [];
  Object.keys(ORACLE).forEach(k => [1, 2, 3].forEach(r => ARMOR.forEach(a => tuples.push([k, r, a]))));
  [1, 2, 3].forEach(r => tuples.push(['respec_grit', r, ARMOR[0]]));
  const bad = [];
  tuples.forEach(([k, r, [aLabel, eq]]) => {
    const ids = Array(r).fill(k);
    const db = dbFrom(ids), dc = condFrom(ids);
    // B-701 (ADDENDUM 12): the force_rating tuples gain Force access by forceRatingBase 1; the access term is the only
    // change to the oracle's expectation (rank r → 1 + r).
    const access = k === 'force_rating' ? 1 : 0;
    const s = { characteristics: { brawn: 2, willpower: 2 }, woundBase: 10, strainBase: 10, forceRatingBase: access,
                derivedBonuses: db, derivedConditional: dc, talents: [{ id: k, rank: r }] };
    const got = JSON.stringify({ db, dc, d: CR.computeDerived(s, eq, CB) });
    const wantD = oracleDerived(ids, eq); wantD.forceRating += access;
    const want = JSON.stringify({ db: oracleDB(ids), dc: oracleCond(ids), d: wantD });
    if (got !== want) bad.push(k + ' ×' + r + ' ' + aLabel + '\n          got  ' + got + '\n          want ' + want);
  });
  check('MIGRATION PROOF: ' + (tuples.length - bad.length) + '/' + tuples.length + ' tuples byte-equal to the frozen-map ORACLE (HARVEST must be 84)',
    tuples.length === 84 && bad.length === 0, bad.slice(0, 3).join('\n        '));
  check('MIGRATION PROOF: the 9 force_rating tuples carry Force access (base 1) and read 1 + r — the talent still feeds the number',
    [1, 2, 3].every(r => CR.computeDerived({ characteristics: { brawn: 2, willpower: 2 }, woundBase: 10, strainBase: 10, forceRatingBase: 1,
      derivedBonuses: dbFrom(Array(r).fill('force_rating')), talents: [{ id: 'force_rating', rank: r }] }, null, CB).forceRating === 1 + r));
  const held = CR.computeDerived({ characteristics: { brawn: 2, willpower: 2 }, woundBase: 10, strainBase: 10, forceRatingBase: 0,
    derivedBonuses: dbFrom(['force_rating', 'force_rating', 'force_rating']), talents: [{ id: 'force_rating', rank: 3 }] }, null, CB).forceRating;
  check('B-701 (FaD p.282): no access, the bonus is held — base 0, three Force Rating ranks → 0', held === 0, String(held));
  // The charbuild-less render path (first paint before the charbuild lands) reads the same numbers.
  const noCb = ARMOR.every(([, eq]) => ['armor_master', 'armor_master_improved'].every(k => {
    const s = Object.assign({}, base, { derivedConditional: [k] });
    return JSON.stringify(CR.computeDerived(s, eq, null)) === JSON.stringify(CR.computeDerived(s, eq, CB));
  }));
  check('charbuild-less render: the conditional pair evaluates identically without the charbuild (flagged fallback path)', noCb);

  // 9. R-FEC-1 — Witchcraft's FLOOR acts on the BASE; Force Rating ranks stack on top.
  const fr = (baseFR, owned) => CR.computeDerived({
    characteristics: {}, woundBase: 10, strainBase: 10, forceRatingBase: baseFR,
    derivedBonuses: dbFrom(owned), talents: owned.map(id => ({ id: id, rank: 1 })),
  }, null, CB).forceRating;
  check('R-FEC-1 floor: base 0 + witchcraft → 1', fr(0, ['witchcraft']) === 1, String(fr(0, ['witchcraft'])));
  check('R-FEC-1 floor: base 1 + witchcraft → 1 (no effect at rating ≥ 1)', fr(1, ['witchcraft']) === 1, String(fr(1, ['witchcraft'])));
  check('R-FEC-1 floor: base 2 + witchcraft → 2 (a floor never lowers)', fr(2, ['witchcraft']) === 2, String(fr(2, ['witchcraft'])));
  check('R-FEC-1 floor: base 0 + witchcraft + one force_rating rank → 2 (max(base, floor) + deltas)',
    fr(0, ['witchcraft', 'force_rating']) === 2, String(fr(0, ['witchcraft', 'force_rating'])));
  check('R-FEC-1 control: base 0, no witchcraft → 0', fr(0, []) === 0);
  check('R-FEC-1: the floor is NOT a derivedBonuses delta (dbFrom([witchcraft]) all zero)', Object.values(dbFrom(['witchcraft'])).every(v => v === 0));

  // 10. LOUD FAILURE (charter §8; R-FEGC-1 disclosure: a path without the registry throws, an op the engine
  // does not implement throws — never read as "no effect").
  const throws = f => { try { f(); return false; } catch (e) { return true; } };
  check('no registry THROWS: derivedBonusesFromTalents(ids) with no registry', throws(() => CR.derivedBonusesFromTalents(['grit'])));
  check('no registry THROWS: even for an empty owned list (a caller that forgot the data is wrong regardless)', throws(() => CR.derivedBonusesFromTalents([])));
  check('no registry THROWS: conditionalTalentsFromOwned / forceRatingFloorFromTalents',
    throws(() => CR.conditionalTalentsFromOwned(['armor_master'])) && throws(() => CR.forceRatingFloorFromTalents(['witchcraft'])));
  const FAKE = Object.assign({}, REG, { zz_probe: { id: 'zz_probe', name: 'Probe', ranked: true, effects: [{ op: 'die_upgrade', amount: 1, per_rank: true }] } });
  check('unimplemented op THROWS (a record the engine cannot apply is never silently "no effect")',
    throws(() => CR.derivedBonusesFromTalents(['zz_probe'], FAKE)));
  const FAKE_WHEN = Object.assign({}, REG, { zz_when: { id: 'zz_when', name: 'Probe', ranked: false, effects: [{ op: 'soak_delta', amount: 1, per_rank: false, when: 'in_cover' }] } });
  check('unimplemented `when` THROWS', throws(() => CR.conditionalTalentsFromOwned(['zz_when'], FAKE_WHEN)));
  check('an OLD-DATA record (in the registry, no effects[]) falls back to the frozen map, not to "no effect"',
    CR.derivedBonusesFromTalents(['grit'], { grit: { id: 'grit', name: 'Grit', ranked: true } }).strainThresholdBonus === 1);

  console.log('\n' + (failures ? '  ' + failures + ' FAILED' : '  talent-effects guard: ALL PASS'));
  process.exit(failures ? 1 : 0);
}
main();
