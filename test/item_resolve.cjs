#!/usr/bin/env node
/**
 * item_resolve.cjs — STANDING guard for the shared item/weapon resolver (lib/shared/itemResolve.js,
 * ADR 0003 items sub-step 3a) + the SWItems.formatQualities canonical tolerance.
 *
 * Proves the unified PC equipment model resolves correctly and the double-brawn villain stays dead
 * at the boundary the Q4 guardrail names:
 *   1. resolveWeapon (LOUD): id-ref -> canonical; dangling id-ref THROWS; inline profile as-is.
 *   2. weaponDamage: base 'brawn' -> Brawn + value (never Br+0 when value>0); 'flat' -> value.
 *   3. weaponForDisplay: damage is the BASE value, damageDisplay is "+N" (brawn) / "N" (flat) —
 *      so a consumer shows the string OR adds Brawn via weaponDamage, never both (Brawn lands ONCE).
 *   4. pcResolveEntry (GRACEFUL): {id} / bare-string / {_inline} resolve; dangling {id} + legacy
 *      old-shape {name,damage} + null all return null (sheet skips, never throws).
 *   5. isCanonicalEntry: distinguishes canonical entries from legacy old-shape objects.
 *   6. SWItems.formatQualities tolerates the canonical [{id,name,ranked,rank}] shape AND the legacy
 *      {Key,Count} / string shapes (render-neutral for old data).
 *
 * Run:  node test/item_resolve.cjs   (needs public/data/canonical/weapons.json)
 */
const fs = require('fs');
const path = require('path');
const IR = require('../lib/shared/itemResolve.js');
const Items = require('../lib/items.js');
const SWItems = Items.SWItems;

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function main() {
  const weapons = rd('public/data/canonical/weapons.json').weapons;
  console.log('='.repeat(72));
  console.log('ITEM RESOLVE — shared resolver guard (brawn lands once, graceful PC resolve)');
  console.log('='.repeat(72));

  const fails = [];
  const PC = { characteristics: { brawn: 3 } };  // probe actor

  // Pick a representative brawn weapon and a flat weapon from the real registry.
  const ids = Object.keys(weapons);
  const brawnId = ids.find(id => weapons[id].damage.base === 'brawn' && weapons[id].damage.value > 0);
  const flatId = ids.find(id => weapons[id].damage.base === 'flat');
  const bW = weapons[brawnId], fW = weapons[flatId];

  // 1 — resolveWeapon LOUD
  if (IR.resolveWeapon(brawnId, weapons) !== bW) fails.push('resolveWeapon id-ref mismatch');
  let threw = false;
  try { IR.resolveWeapon('___nope___', weapons); } catch (e) { threw = true; }
  if (!threw) fails.push('resolveWeapon did NOT throw on dangling id-ref');
  const inline = { name: 'X', damage: { value: 4, base: 'flat' }, range: 'short', skill: 'ranged_light' };
  if (IR.resolveWeapon(inline, weapons) !== inline) fails.push('resolveWeapon inline not returned as-is');
  console.log(`  [1] resolveWeapon: id-ref ok; dangling throws=${threw}; inline as-is`);

  // 2 — weaponDamage brawn vs flat
  const bd = IR.weaponDamage(bW, PC);
  if (bd.total !== 3 + bW.damage.value) fails.push(`weaponDamage brawn ${bd.total} != 3+${bW.damage.value}`);
  if (bd.base !== 'brawn' || bd.bonus !== bW.damage.value) fails.push('weaponDamage brawn shape wrong');
  const fd = IR.weaponDamage(fW, PC);
  if (fd.total !== fW.damage.value) fails.push(`weaponDamage flat ${fd.total} != ${fW.damage.value}`);
  // every brawn weapon: total != base when value>0 (no Br+0 regression)
  let brawnChecked = 0;
  for (const id of ids) {
    const w = weapons[id];
    if (w.damage.base !== 'brawn') continue;
    brawnChecked++;
    if (IR.weaponDamage(w, PC).total !== 3 + w.damage.value) fails.push(`${id}: brawn total wrong`);
  }
  console.log(`  [2] weaponDamage: brawn ${brawnId}=Br3+${bW.damage.value}->${bd.total}; flat ${flatId}=${fd.total}; ${brawnChecked} brawn weapons all Brawn+value`);

  // 3 — weaponForDisplay: base value + display string; Brawn lands ONCE
  const disp = IR.weaponForDisplay(brawnId, weapons);
  if (disp.damage !== bW.damage.value) fails.push(`weaponForDisplay.damage ${disp.damage} != BASE ${bW.damage.value} (must be base, not total)`);
  if (disp.damageDisplay !== '+' + bW.damage.value) fails.push(`brawn damageDisplay ${disp.damageDisplay} != +${bW.damage.value}`);
  const fdisp = IR.weaponForDisplay(flatId, weapons);
  if (fdisp.damageDisplay !== '' + fW.damage.value) fails.push(`flat damageDisplay ${fdisp.damageDisplay} != ${fW.damage.value}`);
  if (!disp.name || disp.range == null || disp.damage == null) fails.push('weaponForDisplay missing name/range/damage');
  // The guardrail in one assertion: display base + arithmetic total are distinct; using one OR the
  // other yields Brawn exactly once (never base already-includes-Brawn).
  if (disp.damage + 3 !== IR.weaponDamage(bW, PC).total) fails.push('Brawn-lands-once invariant broke: display.damage + Brawn != weaponDamage.total');
  console.log(`  [3] weaponForDisplay: damage=BASE ${disp.damage}, damageDisplay="${disp.damageDisplay}"; base+Brawn==weaponDamage.total (lands once)`);

  // 4 — pcResolveEntry GRACEFUL
  const cases = [
    ['bare string id-ref', brawnId, bW],
    ['catalog {id}', { id: brawnId, qty: 1 }, bW],
    ['custom {_inline}', { _inline: inline }, inline],
    ['dangling {id}', { id: '___nope___' }, null],
    ['legacy old-shape', { name: 'Old Blaster', damage: '9', crit: '3', range: 'Short' }, null],
    ['null', null, null],
  ];
  for (const [label, entry, expect] of cases) {
    let res;
    try { res = IR.pcResolveEntry(entry, weapons); }
    catch (e) { fails.push(`pcResolveEntry THREW on ${label} (must be graceful)`); continue; }
    if (res !== expect) fails.push(`pcResolveEntry ${label}: got ${res && (res.name || res.id) } expected ${expect && (expect.name || 'record')}`);
  }
  console.log(`  [4] pcResolveEntry: id-ref/catalog/inline resolve; dangling+legacy+null -> null (no throw)`);

  // 5 — isCanonicalEntry
  const canon = [brawnId, { id: brawnId }, { _inline: inline }];
  const legacy = [{ name: 'Old', damage: '9' }, null, {}];
  if (!canon.every(IR.isCanonicalEntry)) fails.push('isCanonicalEntry false-negative on a canonical entry');
  if (legacy.some(IR.isCanonicalEntry)) fails.push('isCanonicalEntry false-positive on a legacy entry');
  console.log(`  [5] isCanonicalEntry: canonical=true, legacy/empty=false`);

  // 6 — formatQualities canonical tolerance
  const canonQ = SWItems.formatQualities([
    { id: 'inferior', name: 'Inferior', ranked: false },
    { id: 'limited_ammo', name: 'Limited Ammo', ranked: true, rank: 2 },
  ]);
  if (JSON.stringify(canonQ) !== JSON.stringify(['Inferior', 'Limited Ammo 2'])) fails.push(`formatQualities canonical -> ${JSON.stringify(canonQ)}`);
  const rawQ = SWItems.formatQualities([{ Key: 'ACCURATE', Count: 2 }, { Key: 'STUN' }]);
  if (JSON.stringify(rawQ) !== JSON.stringify(['Accurate 2', 'Stun'])) fails.push(`formatQualities raw -> ${JSON.stringify(rawQ)}`);
  const strQ = SWItems.formatQualities(['Pierce 3', 'Vicious']);
  if (JSON.stringify(strQ) !== JSON.stringify(['Pierce 3', 'Vicious'])) fails.push(`formatQualities strings -> ${JSON.stringify(strQ)}`);
  console.log(`  [6] formatQualities: canonical ${JSON.stringify(canonQ)}; raw ${JSON.stringify(rawQ)}; strings ${JSON.stringify(strQ)}`);

  // 7 — RESOLVABILITY (verification add #1): every catalog id-ref a builder can emit resolves
  // NON-null. buildCanonicalEquipment stores {id} from the canonical registries; this proves every
  // such id round-trips through pcResolveEntry — test-time fail-loud for a build that emits a bad ref.
  var armorReg = rd('public/data/canonical/armor.json').armor;
  var gearReg = rd('public/data/canonical/gear.json').gear;
  var unresolvable = 0, checked = 0;
  [['weapons', weapons], ['armor', armorReg], ['gear', gearReg]].forEach(function(pair) {
    var reg = pair[1];
    Object.keys(reg).forEach(function(id) {
      checked++;
      if (IR.pcResolveEntry({ id: id }, reg) == null) { unresolvable++; fails.push('catalog id-ref unresolvable: ' + pair[0] + '/' + id); }
    });
  });
  console.log('  [7] resolvability: ' + checked + ' catalog id-refs (weapons+armor+gear) all resolve non-null (' + unresolvable + ' bad)');

  console.log('-'.repeat(72));
  if (fails.length) {
    console.log(`FAIL (${fails.length}):`);
    fails.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('PASS — shared resolver holds; Brawn lands once; PC resolve graceful; qualities tolerant.');
}

main();
