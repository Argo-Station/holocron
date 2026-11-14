#!/usr/bin/env node
/**
 * b202_defense_qualities.cjs — B-202 guard.
 *
 * Defensive: enters meleeDefense for carried items (R-DQC-1, RAW "wielding" passive; R-TFD-2 OVERRULED).
 * Deflection: enters rangedDefense for carried items (R-BDQ-1, RAW "wearer" passive).
 * Both gated on non-stowed, both sum capped at 4 (R-DQC-2).
 *
 * Run:  node test/b202_defense_qualities.cjs
 */
const CR = require('../lib/shared/charResolve.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

function modernSheet(over) {
  return Object.assign({
    characteristics: { brawn: 3, willpower: 2 },
    derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
    forceRatingBase: 0,
    woundBase: 10, strainBase: 10,
  }, over || {});
}

function eqWith(weapons, armorObj) {
  var eq = { armor: armorObj || null };
  eq.weapons = weapons || [];
  return eq;
}

function main() {
  console.log('B-202: Defensive / Deflection weapon qualities vs derived defense\n');

  // ── 1. Defensive weapons ENTER meleeDefense (R-DQC-1: R-TFD-2 overruled, mirrors Deflection) ──
  var defWeapons = [
    { name: 'Riot Shield', _qualitiesRaw: [{ id: 'defensive', ranked: true, rank: 2 }], qualities: ['Defensive 2'], state: 'carried' },
    { name: 'Vibrosword',  _qualitiesRaw: [{ id: 'defensive', ranked: true, rank: 1 }], qualities: ['Defensive 1'], state: 'carried' },
  ];
  var d1 = CR.computeDerived(modernSheet(), eqWith(defWeapons));
  check('B-202.1: two Defensive weapons (rank 2 + rank 1) → meleeDefense 3', d1.meleeDefense === 3);
  check('B-202.1: rangedDefense stays 0 (Defensive is melee-only)', d1.rangedDefense === 0);

  // ── 2. Deflection ENTERS rangedDefense (R-BDQ-1: "wearer" = passive, knowable) ──
  var deflWeapons = [
    { name: 'Riot Shield', _qualitiesRaw: [{ id: 'deflection', ranked: true, rank: 2 }], qualities: ['Deflection 2'], state: 'carried' },
  ];
  var d2 = CR.computeDerived(modernSheet(), eqWith(deflWeapons));
  check('B-202.2: Deflection 2 weapon → rangedDefense = 2 (R-BDQ-1)', d2.rangedDefense === 2);
  check('B-202.2: meleeDefense stays 0 (Deflection is ranged-only)', d2.meleeDefense === 0);

  // ── 3. Both qualities: Defensive → melee, Deflection → ranged (both enter derived) ──
  var bothWeapons = [
    { name: 'Guard Shoto', _qualitiesRaw: [
      { id: 'defensive', ranked: true, rank: 1 },
      { id: 'deflection', ranked: true, rank: 1 },
    ], qualities: ['Defensive 1', 'Deflection 1'], state: 'carried' },
  ];
  var d3 = CR.computeDerived(modernSheet(), eqWith(bothWeapons));
  check('B-202.3: Defensive 1 + Deflection 1 → meleeDefense 1 (Defensive enters derived)', d3.meleeDefense === 1);
  check('B-202.3: rangedDefense = 1 (Deflection enters derived)', d3.rangedDefense === 1);

  // ── 4. Armor defense + Deflection stack (both are INCREASE sources) ──
  var d4 = CR.computeDerived(modernSheet(), eqWith(deflWeapons, { soak: 2, defense: 1 }));
  check('B-202.4: armor(1) + Deflection(2) → rangedDefense 3', d4.rangedDefense === 3);
  check('B-202.4: armor(1) → meleeDefense 1 (no Defensive weapons in this fixture)', d4.meleeDefense === 1);

  // ── 5. Talent bonuses + armor + Deflection, capped at 4 ──
  var d5 = CR.computeDerived(modernSheet({
    derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0,
      meleeDefenseBonus: 1, rangedDefenseBonus: 1 },
  }), eqWith(deflWeapons, { soak: 2, defense: 1 }));
  check('B-202.5: armor(1) + rangedBonus(1) + Deflection(2) = 4 (at cap)', d5.rangedDefense === 4);
  check('B-202.5: armor(1) + meleeBonus(1) → meleeDefense 2 (no Defensive weapons in this fixture)', d5.meleeDefense === 2);

  // ── 5b. Over-cap: would be 5 without cap ──
  var bigDefl = [
    { name: 'Shield A', _qualitiesRaw: [{ id: 'deflection', ranked: true, rank: 3 }], qualities: ['Deflection 3'] },
  ];
  var d5b = CR.computeDerived(modernSheet({
    derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0,
      meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
  }), eqWith(bigDefl, { soak: 2, defense: 2 }));
  check('B-202.5b: armor(2) + Deflection(3) = 4 (capped, not 5)', d5b.rangedDefense === 4);

  // ── 6. Stored weapons contribute nothing ──
  var storedDefl = [
    { name: 'Stored Shield', _qualitiesRaw: [{ id: 'deflection', ranked: true, rank: 3 }], qualities: ['Deflection 3'], state: 'stowed' },
  ];
  var d6 = CR.computeDerived(modernSheet(), eqWith(storedDefl));
  check('B-202.6: stored Deflection weapon → rangedDefense 0', d6.rangedDefense === 0);

  var storedDef = [
    { name: 'Stored Sword', _qualitiesRaw: [{ id: 'defensive', ranked: true, rank: 3 }], qualities: ['Defensive 3'], state: 'stowed' },
  ];
  var d6b = CR.computeDerived(modernSheet(), eqWith(storedDef));
  check('B-202.6b: stored Defensive weapon → meleeDefense 0', d6b.meleeDefense === 0);

  // ── 7. Null / empty safety ──
  check('B-202.7: no equipment → no throw, defense 0/0', (function() {
    try {
      var d = CR.computeDerived(modernSheet(), null);
      return d.meleeDefense === 0 && d.rangedDefense === 0;
    } catch (e) { return false; }
  })());

  console.log('\n' + (failures ? '  ' + failures + ' FAILED' : '  B-202 defense qualities guard: ALL PASS'));
  process.exit(failures ? 1 : 0);
}
main();
