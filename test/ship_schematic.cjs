#!/usr/bin/env node
/**
 * ship_schematic.cjs — STANDING guard for the ship schematic's pure geometry (SHIPYARD Y1, R-SY2).
 * Proves the diagram's geometry is computed ONLY from registry fields, never invented:
 *   1. zonesForSilhouette — sil 0-4 → 2 zones, sil 5-10 → 4 zones (RAW EotE printed; foundation §1).
 *   2. deriveZones — the right zone set (fore/aft for small, +port/starboard for large), each carrying
 *      its defense rating straight off the record.
 *   3. weaponArcs / unionArcs — wedges derive ONLY from firing_arcs flags; turret → ring; dorsal/ventral
 *      → badges (no wedge). The union is the default state.
 *   4. the identifier's family and class come from the record (card shipyard-schematic-build-card R-SSB-1): `famOf` from
 *      `category` (support split by "Station", D-205), `markFor` from `type` through the one FOLD; `hullGlyphFor` is retired.
 *
 * Run: node test/ship_schematic.cjs   (pure logic; React never touched — Schematic() is not called). The identifier's
 * drawing is test/ship_identifier_fidelity.cjs's; its placement, test/ship_identifier_placement.cjs's.
 */
const S = require('../lib/shared/shipSchematic.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

// 1 — zone count by silhouette (the RAW breakpoint, R-SY2)
for (let sil = 0; sil <= 4; sil++) check('zonesForSilhouette(' + sil + ') = 2', S.zonesForSilhouette(sil) === 2);
for (let sil = 5; sil <= 10; sil++) check('zonesForSilhouette(' + sil + ') = 4', S.zonesForSilhouette(sil) === 4);
check('zonesForSilhouette(null) defaults to 2 (small)', S.zonesForSilhouette(null) === 2);

// 2 — deriveZones set + defense passthrough
const small = S.deriveZones({ fore: 1, aft: 1, port: 3, starboard: 3 }, 3);
check('sil 3 → 2 zones [fore, aft] only', small.length === 2 && small.map(z => z.id).join(',') === 'fore,aft');
check('sil 3 → port/starboard IGNORED (2-zone ship has none)', !small.some(z => z.id === 'port' || z.id === 'starboard'));
check('sil 3 → fore/aft defense read off the record (1/1)', small[0].defense === 1 && small[1].defense === 1);
const big = S.deriveZones({ fore: 1, aft: 0, port: 2, starboard: 2 }, 6);
check('sil 6 → 4 zones [fore, starboard, aft, port]', big.length === 4 && big.map(z => z.id).sort().join(',') === 'aft,fore,port,starboard');
check('sil 6 → each zone carries its own defense (fore1/aft0/port2/stbd2)',
  big.find(z => z.id === 'fore').defense === 1 && big.find(z => z.id === 'aft').defense === 0
  && big.find(z => z.id === 'port').defense === 2 && big.find(z => z.id === 'starboard').defense === 2);
check('sil 10 outlier with 0 port/stbd still gets 4 zones (rating 0, zone exists)',
  S.deriveZones({ fore: 0, aft: 0, port: 0, starboard: 0 }, 10).length === 4);

// 3 — weapon arcs derive ONLY from the data
const fwd = S.weaponArcs({ firing_arcs: { fore: true, aft: false, port: false, starboard: false } });
check('forward weapon → one fore wedge, no turret', !fwd.turret && fwd.wedges.join(',') === 'fore' && fwd.badges.length === 0);
const turret = S.weaponArcs({ turret: true, firing_arcs: { fore: true } });
check('turret weapon → ring flag, no wedges (turret overrides)', turret.turret === true && turret.wedges.length === 0);
const dv = S.weaponArcs({ firing_arcs: { dorsal: true, ventral: true } });
check('dorsal/ventral → badges, no wedges', dv.wedges.length === 0 && dv.badges.sort().join(',') === 'dorsal,ventral');
const uni = S.unionArcs([
  { firing_arcs: { fore: true } },
  { firing_arcs: { port: true, starboard: true } },
]);
check('unionArcs merges the fleet default (fore+port+starboard, deduped)',
  uni.wedges.sort().join(',') === 'fore,port,starboard' && !uni.turret);
check('unionArcs with a turret weapon flags the ring', S.unionArcs([{ turret: true }, { firing_arcs: { fore: true } }]).turret === true);
check('empty weapons → empty union (no invented arcs)', S.unionArcs([]).wedges.length === 0);

// 4 — the identifier's family and class, read off the record (R-SSB-1, R-SY2); the old abstract hull glyph is retired
check('hullGlyphFor is retired (the identifier replaces it)', S.hullGlyphFor === undefined);
check('starfighters → the starfighter glyph', S.famOf({ category: 'starfighters' }) === 'starfighters');
check('support + "Station" subtype → the station glyph', S.famOf({ category: 'support', category_subtype: ['Station'] }) === 'stations');
check('support + "Station" as a string → the station glyph', S.famOf({ category: 'support', category_subtype: 'Station' }) === 'stations');
check('support, any other subtype → the utility crate (never a substring match)', S.famOf({ category: 'support', category_subtype: ['Space Stations'] }) === 'utility_c');
check('type "Light Freighter" → FREIGHTER', S.markFor('Light Freighter') === 'FREIGHTER');
check('type "Star Destroyer" → WARSHIP', S.markFor('Star Destroyer') === 'WARSHIP');
check('an unknown type → no class (never guessed)', S.markFor('Mystery Hull') === null);

// 5 — SHIPYARD Y3a: silhouetteDifficulty from Table 7-4 (R-RAWG1: EXPECTED values are the PRINTED table
// — RULES_FOUNDATION_VEHICLES.md §3 / EotE p.235 — never derived from the implementation).
// Printed Table 7-4 (firer silhouette − target silhouette → difficulty dice):
//   ≥ +4 → Formidable 5 · +3 → Daunting 4 · +2 → Hard 3 · {−1,0,+1} → Average 2 · ≤ −2 → Easy 1
const RAW_TABLE_7_4 = [
  { firer: 5, target: 5, dice: 2, label: 'Average' },     // same silhouette
  { firer: 6, target: 5, dice: 2, label: 'Average' },     // firer 1 larger
  { firer: 4, target: 5, dice: 2, label: 'Average' },     // firer 1 smaller
  { firer: 7, target: 5, dice: 3, label: 'Hard' },        // firer 2 larger
  { firer: 8, target: 5, dice: 4, label: 'Daunting' },    // firer 3 larger
  { firer: 9, target: 5, dice: 5, label: 'Formidable' },  // firer 4 larger
  { firer: 10, target: 5, dice: 5, label: 'Formidable' }, // firer 5 larger (4+ row)
  { firer: 3, target: 5, dice: 1, label: 'Easy' },        // firer 2 smaller
  { firer: 2, target: 5, dice: 1, label: 'Easy' },        // firer 3 smaller (2+ smaller row)
  { firer: 1, target: 8, dice: 1, label: 'Easy' },        // a snubfighter vs a corvette
  { firer: 8, target: 1, dice: 5, label: 'Formidable' },  // the corvette firing back
];
RAW_TABLE_7_4.forEach(function (t) {
  const r = S.silhouetteDifficulty(t.firer, t.target);
  check('Table 7-4: firer ' + t.firer + ' vs target ' + t.target + ' → ' + t.label + ' (' + t.dice + ')',
    r && r.dice === t.dice && r.label === t.label && r.cite === 'EotE p.235',
    r && (r.label + '/' + r.dice));
});
check('silhouetteDifficulty null-safe on missing silhouette', S.silhouetteDifficulty(null, 5) === null && S.silhouetteDifficulty(5, undefined) === null);

if (failures) { console.error('\nship_schematic: ' + failures + ' FAILED'); process.exit(1); }
console.log('\nship_schematic: all green');
