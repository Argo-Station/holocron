/*
 * r7_b1626_loose_part_named.cjs — B-1626 (b), R-R7-GD1 (ruling `release-r7-bug-burndown` ADDENDUM 345).
 *
 * THE ROW. The 1.0 dry run (gear-store, 390) pressed the store's MOVE TO INVENTORY on a Telescopic Optical Sight. The
 * store wrote it into the pack as `{ id: 'telescopic_optical_sight', qty: 1, provenance }`, and the sheet's pack list read
 * "(unknown gear)": `resolveSheetEquipment` resolves a pack entry against the gear (and, for a spare suit, the armour)
 * registry only, never the attachments one.
 *
 * THE RULING (R-R7-GD1). Such an entry is HISTORY a live path wrote. The ONE shared core names it from its attachment
 * record — display only: the entry is not rewritten, no number of the part applies (a loose part does nothing until it
 * is fitted), and nothing offers a fit from the pack (shape B, which D-279 declined).
 *
 * THE FIXTURE is the dry run's saved entry, VERBATIM (`~/Documents/Holocron Playtests/2026-10-31-0201-gear-store/
 * storage/r1-10.json`, Kael Voss's `equipment.gear[3]`). Red at the cut `8216d534d` by exit code; green at the tip.
 *
 * What it cannot see: the rendered pack row (scripts/smoke_r7_gear_dry_run.py B1626-MOVE measures that at 390 and 1440).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
let pass = 0, fail = 0;
const check = (label, ok, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + JSON.stringify(detail) : '')); } };
console.log('r7_b1626_loose_part_named — B-1626 (b), R-R7-GD1: a loose part in the pack is named, display only');

const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const SWItems = require(path.join(ROOT, 'lib/items.js')).SWItems;
const unwrap = (d, k) => (d && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) ? d[k] : d;
const REGS = {
  weapons: unwrap(J('public/data/canonical/weapons.json'), 'weapons'),
  armor: unwrap(J('public/data/canonical/armor.json'), 'armor'),
  gear: unwrap(J('public/data/canonical/gear.json'), 'gear'),
  attachments: unwrap(J('public/data/canonical/attachments.json'), 'attachments'),
};
const SIGHT = 'telescopic_optical_sight';
check('fixture: the sight is an ATTACHMENT record, in no gear or armour record',
  !!REGS.attachments[SIGHT] && !REGS.gear[SIGHT] && !REGS.armor[SIGHT]);

// The SHEET's own resolver, sliced from source into a world that holds the shipped registries.
function slice(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name + ' in lib/shared/sheetPool.js');
  const rest = src.slice(at);
  return rest.slice(0, rest.indexOf('\nfunction ', 1));
}
const win = { ItemResolve: IR, SWItems, SWRPGItemRegistries: { forStampSync: () => REGS } };
// argv[2] (optional): another copy of sheetPool.js to judge — the bite run reads the cut's blob this way.
const src = fs.readFileSync(process.argv[2] || path.join(ROOT, 'lib/shared/sheetPool.js'), 'utf8');
const ctx = vm.createContext({ window: win, Object, Array, JSON, Number, String, console });
vm.runInContext(['sheetItemRegistries', 'deriveItemState', 'resolveSheetEquipment'].map((n) => slice(src, n)).join('\n')
  + '\nthis.resolveSheetEquipment = resolveSheetEquipment;', ctx);

// The dry run's saved equipment, verbatim.
const EQUIPMENT = {
  weapons: [{ id: 'light_blaster_pistol' }, { id: 'unarmed' }, { id: 'blaster_rifle', provenance: [{ note: 'acquired — no cost', when: '2026-10-31' }] }],
  armor: { id: 'heavy_clothing', state: 'worn' },
  gear: [{ id: 'datapad', qty: 1 }, { id: 'emergency_medpac', qty: 1 }, { id: 'utility_belt', qty: 1 },
    { id: SIGHT, qty: 1, provenance: [{ note: 'acquired — no cost', when: '2026-10-31' }] }],
  credits: 950,
};
const before = JSON.stringify(EQUIPMENT);
let out = null;
try { out = ctx.resolveSheetEquipment(JSON.parse(before), { name: 'Kael Voss', mods: [] }); }
catch (e) { check('resolveSheetEquipment ran', false, e && e.message); }

if (out) {
  const row = out.gear[3] || {};
  check('the pack keeps four rows, index-aligned with the saved entries (MAP-PRESERVE)', out.gear.length === 4, out.gear.length);
  check('B-1626: the loose sight is NAMED "Telescopic Optical Sight", not "(unknown gear)"', row.name === 'Telescopic Optical Sight', row.name);
  check('…and is no longer marked unresolved', !row._unresolved, row);
  check('…its qty is the entry\'s', row.qty === 1, row.qty);
  check('display only: no number of the part rides the row (no pool_mods, base_mods, hp, price, encumbrance, hardpoints)',
    ['pool_mods', 'base_mods', 'hp', 'price', 'encumbrance', 'hardpoints', 'attachments'].every((k) => row[k] === undefined),
    Object.keys(row));
  check('the three gear rows beside it resolve as before', ['Datapad', 'Emergency Medpac', 'Utility Belt'].every((n, i) => (out.gear[i] || {}).name === n),
    out.gear.slice(0, 3).map((g) => g.name));
  check('the rifle and the pistol are untouched', (out.weapons[2] || {}).name === 'Blaster Rifle' && !(out.weapons[2] || {})._unresolved);
}
check('nothing is written: the saved equipment is byte-identical after the read', JSON.stringify(EQUIPMENT) === before);

// A neighbour that must NOT move: an id no registry holds still reads "(unknown gear)".
try {
  const o2 = ctx.resolveSheetEquipment({ gear: [{ id: 'no_such_item_r7', qty: 2 }] }, { name: 'X', mods: [] });
  check('an id in NO registry still reads "(unknown gear)", unresolved', o2.gear[0].name === '(unknown gear)' && o2.gear[0]._unresolved === true, o2.gear[0]);
} catch (e) { check('the unknown-id leg ran', false, e && e.message); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
