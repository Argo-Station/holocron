// B-1390 (card `release-r7-bug-burndown` ADDENDUM 415; STEP-0 answer Q1 (B)) — a hull row prints its stat block's mount
// qualities, not OggDude's per-mount count. The VT-49's Quad Lasers stored Linked 1 (Fly Casual p.55 prints Linked 3), and
// four sibling mounts printed less than their own page. The library is generated: scripts/build_vehicle_library.py's
// PRINTED_MOUNT_QUALITIES carries each correction with its cite. The values below are read off the printed pages here,
// independently of that table, so a wrong table entry reds this guard.
//   1. each corrected mount on the BUILT library carries the printed count;
//   2. the five mounts that print LESS than the weapons registry but follow their own stat block stay as printed;
//   3. the VT-49's two gun rows on the sheet (the one resolver, `vesselResolve.resolve`, whose weapons `WeaponRow` prints)
//      read Linked 3, matching `vehicle-weapons.json`'s LASERQUAD.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
let fail = 0;
const ok = (c, m, d) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || d === undefined ? '' : '  — ' + JSON.stringify(d))); if (!c) fail++; };

const lib = {};
for (const f of ['capital_ships.json', 'starfighters.json', 'transports.json']) J('public/data/vehicle-library/' + f).entries.forEach((e) => { lib[e.key] = e; });
const q = (vkey, i, loc, key) => {
  const w = ((lib[vkey] || {}).weapons || [])[i];
  const hit = w && w.location === loc && (w.qualities_resolved || []).find((x) => x.key === key);
  return hit ? hit.count : undefined;
};

// [vehicle, weapon index, location, quality, printed count, book + printed page]
const PRINTED = [
  ['VT49DECIMATOR', 0, 'Dorsal', 'LINKED', 3, 'Fly Casual p.55'],
  ['VT49DECIMATOR', 1, 'Ventral', 'LINKED', 3, 'Fly Casual p.55'],
  ['IMPCUSTFRIG', 4, 'Forward', 'TRACTOR', 3, 'Fly Casual p.55'],
  ['STARBOLT', 2, 'Forward', 'LIMITEDAMMO', 8, 'Dangerous Covenants p.70'],
  ['PREYBIRD', 2, 'Aft', 'LIMITEDAMMO', 6, 'Dangerous Covenants p.66'],
  ['ALPHAXG1', 2, 'Forward', 'GUIDED', 3, 'Fly Casual p.54'],
];
for (const [v, i, loc, key, n, cite] of PRINTED) {
  const got = q(v, i, loc, key);
  ok(got === n, 'B-1390 ' + v + ' mount ' + i + ' (' + loc + ') ' + key + ' ' + n + ' as ' + cite + ' prints', got);
}

// below the registry, and right: each follows its own stat block (STEP 0's five, "checked")
const KEPT = [
  ['NEUTRONSTAR', 'TURBOHVY', 'BREACH', 3, 'Dangerous Covenants p.69'],
  ['H60TEMPEST', 'PROTONBAY', 'LIMITEDAMMO', 12, 'Stay on Target p.54'],
  ['R60TWING', 'PTL', 'LIMITEDAMMO', 2, 'Stay on Target p.56'],
];
const byName = (re) => Object.values(lib).find((e) => re.test(e.name));
const NAMES = { NEUTRONSTAR: /^Neutron Star/, H60TEMPEST: /^H-60 Tempest/, R60TWING: /^R-60 /};
for (const [tag, wkey, key, n, cite] of KEPT) {
  const e = byName(NAMES[tag]);
  const counts = ((e && e.weapons) || []).filter((w) => w.key === wkey).map((w) => ((w.qualities_resolved || []).find((x) => x.key === key) || {}).count);
  ok(counts.length > 0 && counts.every((c) => c === n), 'B-1390 kept: ' + (e && e.name) + ' ' + wkey + ' ' + key + ' ' + n + ' on every mount (' + counts.length + '), as ' + cite + ' prints', counts);
}

// the sheet's gun rows: the one resolver
function load(file, name) { const sb = {}; new Function(fs.readFileSync(path.join(ROOT, file), 'utf8')).call(sb); return sb[name]; }
const R = load('lib/shared/vesselResolve.js', 'SWRPGVesselResolve');
const VS = load('lib/shared/vesselStore.js', 'SWRPGVessels');
const ATT = J('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const TAL = J('public/data/canonical/talents.json').talents;
const VW = J('public/data/canonical/vehicle-weapons.json').vehicle_weapons;
const regLinked = ((VW.LASERQUAD.profile.qualities || []).find((x) => x.key === 'linked') || {}).count;
ok(regLinked === 3, 'setup: vehicle-weapons.json LASERQUAD is Linked 3 (EotE p.230)', regLinked);
const rec = VS.normalizeVessel({ id: 'v_b1390', vehicleKey: 'VT49DECIMATOR', owner: 'party', v: 3 }, 't');
const res = R.resolve(rec, lib.VT49DECIMATOR, { attachments: ATT, talentRecords: TAL });
const guns = ((res && res.weapons) || []).filter((w) => w.key === 'LASERQUAD');
ok(guns.length === 2, 'setup: the VT-49 resolves two Quad Laser rows (D-220 Q2: Dorsal and Ventral)', guns.length);
guns.forEach((w) => {
  const l = ((w.qualities_resolved || []).find((x) => x.key === 'LINKED') || {}).count;
  ok(l === regLinked, 'B-1390 the sheet\'s ' + w.location + ' Quad Laser row reads Linked ' + regLinked + ' (the registry\'s, Fly Casual p.55)', l);
});

console.log(fail ? '\nb1390_printed_mount_qualities: ' + fail + ' FAILED' : '\nb1390_printed_mount_qualities: all green');
process.exit(fail ? 1 : 0);
