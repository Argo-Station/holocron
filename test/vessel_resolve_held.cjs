/* test/vessel_resolve_held.cjs — B-1015's CLASS, made mechanical (ruling `shipyard-s4-catalogue-card` R-S4CC-6: "a guard
 * enumerates $defs/vehicle_effect's ops and fails for an op whose output is not held"; R-S4CC-7 a seat's pool; R-S4CC-8 a
 * part's name; the approved page @ 6aa1f830).
 *
 * The ops are DERIVED from `schema/charbuild-common.schema.json` `$defs/vehicle_effect` (never listed here), so a fifteenth
 * op cannot slip past. For each op a synthetic part carrying that one effect is fitted to the YT-1300 (EotE p.261):
 *   - with the parts list handed, the op's output MOVES (non-vacuity: the probe reads the right field);
 *   - with the list missing (`ctx.attachments === null`), that output is HELD (null), and so is every other op's.
 * Plus: a seat-upgrading part's pool is the sitter's own and marked `held`; nothing is ORPHANED while held; a bare ship (no
 * part) resolves exactly as with the list; `{}` keeps today's meaning (not held).
 * Run: node test/vessel_resolve_held.cjs   (HELD_RESOLVER=<file> runs it against another copy: the bite)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
function load(file, name) {
  const sb = {};
  new Function(fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8')).call(sb);
  return sb[name];
}
const R = load(process.env.HELD_RESOLVER || 'lib/shared/vesselResolve.js', 'SWRPGVesselResolve');
const VS = load('lib/shared/vesselStore.js', 'SWRPGVessels');

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

// Re-pointed by `f100-m8-c8-signature-vehicle` R-M8C8-3: B-1015's class is what the PARTS list could move, so the ops are the
// ones a PART may carry — $defs/vehicle_effect's enum less the part schema's refusals (both derived, never listed here). KEPT:
// every part op held, by derivation. DROPPED: the talent-only op (weapon_quality_delta), whose output a held ship still knows.
const ALL = J('schema/charbuild-common.schema.json').$defs.vehicle_effect.properties.op.enum;
const PS = J('schema/vehicle-attachment.schema.json');
const refusedBy = (items) => [].concat(...(items.allOf || []).map((a) => (a.properties && a.properties.op && a.properties.op.not && a.properties.op.not.enum) || []));
const REFUSED = refusedBy(PS.properties.base_effects.items);
const OPS = ALL.filter((op) => REFUSED.indexOf(op) === -1);
const YT = J('public/data/vehicle-library/freighters.json').entries.find((e) => e.key === 'YT1300');
// Re-pointed by `shipyard-s7-build-card` ADDENDUM 2 (R-S7V-3, the five SETs enter). KEPT: the class derived from the schema, every
// part op held. CHANGED: 15 → 20 ops at this writing, 14 → 19 part ops, the five SETs named.
// Re-pointed by `f100-s8-vocabulary` R-S8V-1/-6 (card `shipyard-s8-build` ADDENDUM 4, H-1 (i)): KEPT the class derived from the
// schema, every part op held. CHANGED: 20 → 22 ops, 19 → 21 part ops, the six SETs named (strain_threshold_set the sixth), weapon_add.
const S7_SETS = ['hyperdrive_class_set', 'speed_set', 'handling_set', 'armor_set', 'defense_set', 'strain_threshold_set'];
check('setup: the schema names its ops (22 at this writing) and the YT-1300 row is served', ALL.length >= 22 && !!YT, ALL.length);
check('the class is the enum less the part schema\'s refusals: weapon_quality_delta refused (base_effects and added_options alike), 21 part ops, the six SETs and weapon_add among them',
  JSON.stringify(REFUSED) === '["weapon_quality_delta"]' && JSON.stringify(refusedBy(PS.properties.added_options.items.properties.effects.items)) === JSON.stringify(REFUSED)
    && OPS.length === 21 && S7_SETS.every((op) => OPS.indexOf(op) !== -1) && OPS.indexOf('weapon_add') !== -1, { REFUSED, OPS: OPS.length });
const vessel = (atts, extra) => VS.normalizeVessel(Object.assign({ id: 'v_held', vehicleKey: 'YT1300', owner: 'party', v: 3,
  attachments: atts || [] }, extra || {}), 't');

// one effect per op, aimed so it moves a printed number on this hull; the probe reads that number
const EFFECT = {
  defense_delta: { target: 'fore' },
  hyperdrive_class_delta: { target: 'primary', amount: 1 },
  sensor_range_step: { amount: 1 },
  // S7 (ADDENDUM 2): a SET probe must land a value the YT-1300 does not print (fore 1, class 2)
  defense_set: { target: 'fore', amount: 2 },
  hyperdrive_class_set: { target: 'primary', amount: 4 },
  // S8 (ADDENDUM 4, H-1 (ii)): a real weapon, fore only, read against the weapons registry handed below
  weapon_add: { weapon: 'LASERMED', firing_arcs: { fore: true, aft: false, port: false, starboard: false, dorsal: false, ventral: false } },
};
const VW = J('public/data/canonical/vehicle-weapons.json').vehicle_weapons;
function read(out, op) {
  const arm = R.ARMS[op];
  if (arm === 'defense') return out.defense.fore;
  if (arm === 'hyperdrive') return out.hyperdrive.primary;
  if (op === 'weapon_add') return out.weapons.length;   // H-1 (ii): the list's length
  if (arm === 'weapons') return out.weapons[0] ? out.weapons[0].damage : undefined;
  return out[arm];
}
function partFor(op) {
  const e = Object.assign({ op, amount: 1 }, EFFECT[op] || {});
  return { id: 'held_probe_' + op, name: 'Probe ' + op, base_effects: [e] };
}

OPS.forEach((op) => {
  const row = partFor(op);
  const reg = { [row.id]: row };
  const choice = op === 'weapon_damage_delta' ? { weapon: { i: 0, key: YT.weapons[0].key } } : {};
  const rec = vessel([Object.assign({ key: row.id, when: null, note: null, mods: [] }, choice)]);
  const bare = R.resolve(vessel([]), YT, { attachments: reg, weapons: VW });
  const live = R.resolve(rec, YT, { attachments: reg, weapons: VW });
  const held = R.resolve(rec, YT, { attachments: null, weapons: VW });
  check(`${op}: with the list, the part moves ${R.ARMS[op]} (non-vacuity)`, JSON.stringify(read(live, op)) !== JSON.stringify(read(bare, op)),
    { bare: read(bare, op), live: read(live, op) });
  // H-1 (iii): a held weapon_add invents no row — the list is the hull's rows only, every damage null, held
  if (op === 'weapon_add') check(`${op}: with the list missing, no row is invented — the hull's ${YT.weapons.length} rows only, every damage HELD (null), held: true`,
    held.held === true && held.weapons.length === YT.weapons.length && held.weapons.every((w, i) => w.key === YT.weapons[i].key && w.damage === null),
    { held: held.held, rows: held.weapons.length, damages: held.weapons.map((w) => w.damage) });
  else check(`${op}: with the list missing, ${R.ARMS[op]} is HELD (null), never the bare hull's`, held.held === true && read(held, op) === null,
    { held: held.held, value: read(held, op) });
});

// every op's output is held on ONE held ship (a part the list would have read, whatever its ops)
const one = R.resolve(vessel([{ key: 'advanced_targeting_array', when: null, note: null, mods: [] }]), YT, { attachments: null });
// H-1 (iii): weapon_add's output is the list itself, so "held" for it is "no row invented" (read as the hull's own count)
const notHeld = OPS.filter((op) => (op === 'weapon_add' ? read(one, op) !== YT.weapons.length : read(one, op) !== null));
check('a ship with any fitted part holds the WHOLE class: every op\'s output null (weapon_add: no row invented)', notHeld.length === 0, notHeld);
check('HELD_KEYS is one entry per PART op, in the schema\'s order (the talent-only op outside it)', JSON.stringify(R.HELD_KEYS) === JSON.stringify(OPS.map((op) => R.ARMS[op])), R.HELD_KEYS);
check('held: nothing is called ORPHANED (an unknown key is not a lost one)',
  ['attachments', 'mods', 'choices'].every((k) => one.orphaned[k].length === 0), one.orphaned);
check('held: the hull\'s own facts stay (silhouette, weapon names and ranges)',
  one.silhouette === YT.silhouette && one.weapons.length === YT.weapons.length && one.weapons[0].key === YT.weapons[0].key);

// R-S4CC-7: a seat-upgrading part (the Advanced Targeting Array upgrades Gunnery once) — its upgrade is held
const ATT = J('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const ata = vessel([{ key: 'advanced_targeting_array', when: null, note: null, mods: [] }]);
const upLive = R.seatPool(ata, YT, { attachments: ATT }, 'gunner');
const upHeld = R.seatPool(ata, YT, { attachments: null }, 'gunner');
check('R-S4CC-7: with the list, the gunner\'s pool is upgraded (non-vacuity)', upLive.upgradeAbility >= 1 && !upLive.held, upLive);
check('R-S4CC-7: with the list missing, the gunner\'s pool is the sitter\'s own (no part upgrade) and marked held',
  upHeld.upgradeAbility === 0 && upHeld.held === true, upHeld);

// the arms' own limits: a hyperdrive DELTA cannot give a hull a hyperdrive (the T-47, airspeeders.json: no hyperdrive class) — the
// probe on a part that tries proves the arm only warns. Re-pointed by `shipyard-s7-build-card` ADDENDUM 2: KEPT the delta's warn;
// CHANGED the held row — a part CAN give it one (hyperdrive_class_set), so it is held.
const T47 = J('public/data/vehicle-library/airspeeders.json').entries.find((e) => e.key === 'T47ALLIANCE');
const hdg = { held_probe_hd: { id: 'held_probe_hd', name: 'Probe hyperdrive', base_effects: [{ op: 'hyperdrive_class_delta', target: 'primary', amount: -1 }] } };
const t47rec = VS.normalizeVessel({ id: 'v_t47', vehicleKey: 'T47ALLIANCE', owner: 'party', v: 3, attachments: [{ key: 'held_probe_hd', when: null, note: null, mods: [] }] }, 't');
const t47live = R.resolve(t47rec, T47, { attachments: hdg }), t47held = R.resolve(t47rec, T47, { attachments: null });
check('setup: the T-47 prints no hyperdrive class, and a hyperdrive part on it only warns (no_hyperdrive)',
  !!T47 && !(T47.hyperdrive_primary > 0) && t47live.hyperdrive.primary === T47.hyperdrive_primary && t47live.warnings.some((w) => w.kind === 'no_hyperdrive'));
check('held: a hull without a hyperdrive — a part CAN give it one (hyperdrive_class_set), so it is held: both classes null, with its other values',
  t47held.held === true && t47held.hyperdrive.primary === null && t47held.hyperdrive.backup === null && t47held.speed === null
    && !(T47.hyperdrive_primary > 0), t47held.hyperdrive);
// the T-47 prints its class as null, which reads null held or not; the Z-95-AF4 (starfighters.json) prints class 0 / 0, so the same
// held row is shown to bite there (a hull that printed "no hyperdrive" as 0 used to keep the 0 while held)
const Z95 = J('public/data/vehicle-library/starfighters.json').entries.find((e) => e.key === 'Z95AF4');
const z95held = R.resolve(VS.normalizeVessel({ id: 'v_z95', vehicleKey: 'Z95AF4', owner: 'party', v: 3, attachments: [{ key: 'held_probe_hd', when: null, note: null, mods: [] }] }, 't'), Z95, { attachments: null });
check('held: the Z-95-AF4 prints class 0 / 0 (no hyperdrive) — a part CAN give it one (hyperdrive_class_set), so both classes are held (null), never the printed 0',
  !!Z95 && Z95.hyperdrive_primary === 0 && z95held.held === true && z95held.hyperdrive.primary === null && z95held.hyperdrive.backup === null, z95held.hyperdrive);

// a bare ship moves nothing: held or not, it resolves as with the list; `{}` keeps today's meaning
const bareNull = R.resolve(vessel([]), YT, { attachments: null }), bareFull = R.resolve(vessel([]), YT, { attachments: ATT });
check('a bare ship is never held, and resolves exactly as with the list', bareNull.held === false && JSON.stringify(bareNull) === JSON.stringify(bareFull));
const empty = R.resolve(ata, YT, { attachments: {} });
check('`{}` is not "missing": not held (today\'s meaning kept)', empty.held === false && empty.strain_threshold === YT.system_strain);

console.log(`\nvessel_resolve_held: ${ok}/${ok + fail} PASS`);
process.exit(fail ? 1 : 0);
