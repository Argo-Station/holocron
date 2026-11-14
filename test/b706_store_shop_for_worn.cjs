#!/usr/bin/env node
/* B-706 (2) — the creator's store pseudo-character says its suit is WORN (ruling release-r7-bug-burndown ADDENDUM 276, lap
 * release-r7-gear-panel-numbers).
 *
 * `FullCreator`'s `storeShopFor` hands the shared store overlay a pseudo-character built from the draft's gear ledger. Its
 * suit was written `{ id }` with no `state`, the last creator-side armour producer B-699's census found that does not say
 * worn (`deriveItemState` reads a stateless suit as CARRIED). The fix writes the existing vocabulary B-699 put in the
 * shared core — `buildCanonicalEquipment`'s `{ id, state: 'worn' }` — so no new shape (R-Y2-1).
 *
 * The mapping is RUN, not grepped: the `inv.forEach(...)` body is sliced from `storeShopFor` in player/app.jsx and called
 * over a ledger with one suit, two weapons and a gear stack. The worn shape is then checked against the shared core's own
 * output for the same suit, so both producers are held to one vocabulary.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, got) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? '  — got ' + JSON.stringify(got) : '')); }
}
console.log('B-706 (2): storeShopFor writes the creator\'s suit worn\n');

const at = src.indexOf('var storeShopFor = useMemo(function()');
check('storeShopFor is found in player/app.jsx', at >= 0);
if (at < 0) { console.log('\nb706_store_shop_for_worn: ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
const open = src.indexOf('inv.forEach(function(it) {', at);
const close = src.indexOf('\n    });', open);
check('its ledger mapping (inv.forEach) is sliced inside storeShopFor', open > at && close > open && open - at < 400, { open: open - at });
const body = src.slice(open + 'inv.forEach(function(it) {'.length, close);

const inv = [
  { key: 'heavy_battle_armor', section: 'armor', qty: 1 },
  { key: 'blaster_pistol', section: 'weapons', qty: 2 },
  { key: 'stimpack', section: 'gear', qty: 3 },
];
let eq;
try {
  const run = new Function('inv', 'eq', 'inv.forEach(function(it) {' + body + '\n    });\n    return eq;');
  eq = run(inv, { weapons: [], armor: null, gear: [], credits: 0 });
} catch (e) {
  check('the sliced mapping runs', false, String(e));
  console.log('\nb706_store_shop_for_worn: ' + pass + ' passed, ' + fail + ' failed'); process.exit(1);
}
check('the suit is written { id, state: \'worn\' }', JSON.stringify(eq.armor) === JSON.stringify({ id: 'heavy_battle_armor', state: 'worn' }), eq.armor);
check('weapons are unchanged: one bare id-ref per copy', JSON.stringify(eq.weapons) === JSON.stringify([{ id: 'blaster_pistol' }, { id: 'blaster_pistol' }]), eq.weapons);
check('gear is unchanged: { id, qty }', JSON.stringify(eq.gear) === JSON.stringify([{ id: 'stimpack', qty: 3 }]), eq.gear);

// the vocabulary is the shared core's: buildCanonicalEquipment (B-699) writes the same keys for a created suit
const crSrc = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
check('the shared core\'s created suit is the same shape ({ id, state: \'worn\' }, B-699)', /armorRef\s*=\s*\{\s*id:\s*[^,}]+,\s*state:\s*'worn'\s*\}/.test(crSrc));

console.log('\nb706_store_shop_for_worn: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
