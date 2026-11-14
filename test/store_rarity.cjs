#!/usr/bin/env node
/**
 * store_rarity.cjs — STANDING guard for the shared RAW find-difficulty module (lib/store/rarity.js),
 * consumed by the player store kernel AND the GM availability tool (ITM-B).
 *
 * Proves the Table 5-1 / 5-2 encoding (EotE CRB p.150, verified this arc):
 *   1. rarityBand — every rarity 0-10 → the verified difficulty band + dice count; null on absent.
 *   2. findDifficulty — the full readout: dice + label + skill (Streetwise for (R), else Negotiation)
 *      + black-market flag + cite. Hand-anchored: rarity 6 → Hard/3 purple/Negotiation; a rarity-6
 *      (R) item → Streetwise/black market; rarity 10+ → Formidable/5.
 *   3. LOCATION_MODIFIERS — Table 5-2 world-circumstance values (−2…+4) present + correct.
 *
 * Run:  node test/store_rarity.cjs
 */
const M = require('../lib/store/rarity.js');
const R = M.SWRPGRarity || (typeof window !== 'undefined' && window.SWRPGRarity);

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

// 1. band ladder (verified against Table 5-1's own example items in our registries)
const LADDER = [
  [0, 'SIMPLE', 0], [1, 'SIMPLE', 0], [2, 'EASY', 1], [3, 'EASY', 1],
  [4, 'AVERAGE', 2], [5, 'AVERAGE', 2], [6, 'HARD', 3], [7, 'HARD', 3],
  [8, 'DAUNTING', 4], [9, 'DAUNTING', 4], [10, 'FORMIDABLE', 5], [14, 'FORMIDABLE', 5],
];
LADDER.forEach(([r, label, dice]) => {
  const b = R.rarityBand(r);
  check(`rarityBand(${r}) → ${label}/${dice}`, b && b.label === label && b.dice === dice);
});
check('rarityBand(null) → null (R-ITM5 fallback)', R.rarityBand(null) === null);
check('rarityBand("x") → null', R.rarityBand('x') === null);

// 2. findDifficulty — the GM chip's data
const d6 = R.findDifficulty(6, false);
check('findDifficulty(6, legal): Hard · 3 dice · NEGOTIATION · cited', d6 && d6.label === 'HARD'
  && d6.dice === 3 && d6.skill === 'NEGOTIATION' && d6.blackMarket === false && d6.cite === 'EotE CRB p.150');
const d6r = R.findDifficulty(6, true);
check('findDifficulty(6, restricted): STREETWISE + black market', d6r
  && d6r.skill === 'STREETWISE' && d6r.blackMarket === true && d6r.label === 'HARD');
const d10 = R.findDifficulty(12, false);
check('findDifficulty(12): Formidable/5 (>10 stays Formidable)', d10 && d10.label === 'FORMIDABLE' && d10.dice === 5);
check('findDifficulty(null) → null', R.findDifficulty(null, false) === null);

// 3. Table 5-2 location modifiers
const byId = {};
R.LOCATION_MODIFIERS.forEach(m => { byId[m.id] = m.mod; });
check('Table 5-2: primary Core −2', byId.primary_core === -2);
check('Table 5-2: Outer Rim +2', byId.outer_rim === 2);
check('Table 5-2: uncivilized +4 (max)', byId.uncivilized === 4);
check('Table 5-2: 9 world-circumstance rows, all in −2…+4',
  R.LOCATION_MODIFIERS.length === 9 && R.LOCATION_MODIFIERS.every(m => m.mod >= -2 && m.mod <= 4));

// 4. STORE-UNIFY location bridge — region→circumstance + the effective modifier (trade-lane stacks)
check('NEUTRAL_CIRCUMSTANCE = settled/0', R.NEUTRAL_CIRCUMSTANCE.id === 'settled' && R.NEUTRAL_CIRCUMSTANCE.mod === 0);
check('circumstanceForRegion(Outer Rim) → outer_rim (+2)', R.circumstanceForRegion('Outer Rim').id === 'outer_rim');
check('circumstanceForRegion(Mid Rim) → mid_rim (+1)', R.circumstanceForRegion('Mid Rim').id === 'mid_rim');
check('circumstanceForRegion(Inner Rim) → settled (0)', R.circumstanceForRegion('Inner Rim').id === 'settled');
check('circumstanceForRegion(unknown string) → settled (0)', R.circumstanceForRegion('Nowhere').id === 'settled');
const orim = R.circumstanceForRegion('Outer Rim');
check('locationModifier(Outer Rim, no lane) = +2', R.locationModifier(orim, false) === 2);
check('locationModifier(Outer Rim, ON lane) = +1 (trade-lane −1 stacks)', R.locationModifier(orim, true) === 1);
check('locationModifier(neutral, ON lane) = −1', R.locationModifier(R.NEUTRAL_CIRCUMSTANCE, true) === -1);

if (failures) { console.error('\nstore_rarity: ' + failures + ' FAILED'); process.exit(1); }
console.log('\nstore_rarity: all green');
