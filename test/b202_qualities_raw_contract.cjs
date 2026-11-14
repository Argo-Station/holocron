#!/usr/bin/env node
/**
 * b202_qualities_raw_contract.cjs — C-BDS-2 guard (rider off ruling `b202-deflection-stacking` §4).
 *
 * B-202's defence loop reads ONLY `_qualitiesRaw`. Any producer that does not set it yielded no
 * Defensive/Deflection AND no signal — the silent-zero shape B-200 was fixed for. This guard pins
 * the contract that answers it:
 *
 *   ABSENT (undefined)  — the weapon never went through the canonical resolve path. 0 is not an
 *                         answer, it is the absence of one → a de-duped console.warn fires.
 *   EMPTY ([])          — resolved against the registry, which listed no qualities. 0 is CORRECT
 *                         and silent.
 *
 * It also pins the reason the obvious "fix" is not one: the display `.qualities` array holds STRINGS
 * ("Deflection 2"), so the old `|| w.qualities` fallback compared `undefined === 'deflection'` and
 * summed 0 on every element. It read as protection while providing none.
 *
 * Run:  node test/b202_qualities_raw_contract.cjs
 */
const CR = require('../lib/shared/charResolve.js');
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  [' + detail + ']' : '')); }
}

function modernSheet() {
  return {
    characteristics: { brawn: 3, willpower: 2 },
    derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
    forceRatingBase: 0, woundBase: 10, strainBase: 10,
  };
}

// Capture console.warn around one call so the signal is observed rather than inferred.
function derivedWithWarnings(weapons) {
  const seen = [];
  const real = console.warn;
  console.warn = function () { seen.push(Array.prototype.join.call(arguments, ' ')); };
  let d;
  try { d = CR.computeDerived(modernSheet(), { armor: null, weapons: weapons }); }
  finally { console.warn = real; }
  return { derived: d, warnings: seen };
}

function main() {
  console.log('C-BDS-2: _qualitiesRaw absent-vs-empty contract\n');

  // ── 1. EMPTY is a resolved answer: contributes 0 and says NOTHING ──
  var empty = derivedWithWarnings([
    { name: 'Truncheon (empty-quals)', _qualitiesRaw: [], qualities: [], state: 'carried' },
  ]);
  check('C-BDS-2.1: _qualitiesRaw [] → rangedDefense 0 and meleeDefense 0',
    empty.derived.rangedDefense === 0 && empty.derived.meleeDefense === 0);
  check('C-BDS-2.1: _qualitiesRaw [] is SILENT (a resolved weapon with no qualities is not a defect)',
    empty.warnings.length === 0, empty.warnings.join(' | '));

  // ── 2. ABSENT is unknowable: still 0, but it SPEAKS ──
  var absent = derivedWithWarnings([
    { name: 'Heirloom Vibro-axe', qualities: ['Defensive 2', 'Vicious 1'], state: 'carried' },
  ]);
  check('C-BDS-2.2: absent _qualitiesRaw → defence still 0 (graceful, old-data path)',
    absent.derived.meleeDefense === 0 && absent.derived.rangedDefense === 0);
  check('C-BDS-2.2: absent _qualitiesRaw WARNS exactly once', absent.warnings.length === 1, absent.warnings.length);
  check('C-BDS-2.2: the warning names the weapon',
    absent.warnings.length === 1 && absent.warnings[0].indexOf('Heirloom Vibro-axe') !== -1);
  check('C-BDS-2.2: the warning quotes the display qualities it could not read',
    absent.warnings.length === 1 && absent.warnings[0].indexOf('Defensive 2') !== -1);
  check('C-BDS-2.2: the warning is tagged C-BDS-2 for grep',
    absent.warnings.length === 1 && absent.warnings[0].indexOf('[C-BDS-2]') !== -1);

  // ── 3. THE FALLBACK THAT WOULD NOT HAVE WORKED ──
  // Display `.qualities` are strings, so `.id` is undefined on every element. Pinning this stops a
  // future reader "restoring" the fallback and believing the silent zero is fixed.
  var strs = ['Deflection 2'];
  check('C-BDS-2.3: display qualities are STRINGS, so `.id` is undefined (the old fallback was inert)',
    typeof strs[0] === 'string' && strs[0].id === undefined);

  // ── 4. De-duped: computeDerived runs every render, the console must not fill ──
  var dupName = 'Repeated Blade';
  var first = derivedWithWarnings([{ name: dupName, qualities: ['Defensive 1'], state: 'carried' }]);
  var second = derivedWithWarnings([{ name: dupName, qualities: ['Defensive 1'], state: 'carried' }]);
  check('C-BDS-2.4: first sighting of a name warns', first.warnings.length === 1, first.warnings.length);
  check('C-BDS-2.4: the same name on a later render is SILENT (de-duped)', second.warnings.length === 0, second.warnings.length);

  // ── 5. Stowed is skipped BEFORE the check — a packed weapon is not a defect ──
  var stowed = derivedWithWarnings([
    { name: 'Packed Legacy Sword', qualities: ['Defensive 3'], state: 'stowed' },
  ]);
  check('C-BDS-2.5: a STOWED unreadable weapon does not warn', stowed.warnings.length === 0, stowed.warnings.join(' | '));

  // ── 6. Mixed load: the readable one still counts while the unreadable one reports ──
  var mixed = derivedWithWarnings([
    { name: 'Registry Shield', _qualitiesRaw: [{ id: 'deflection', ranked: true, rank: 2 }], qualities: ['Deflection 2'], state: 'carried' },
    { name: 'Grandfather’s Blade', qualities: ['Deflection 2'], state: 'carried' },
  ]);
  check('C-BDS-2.6: the RESOLVED weapon still contributes (rangedDefense 2)', mixed.derived.rangedDefense === 2, mixed.derived.rangedDefense);
  check('C-BDS-2.6: the UNRESOLVED one is reported, not silently dropped', mixed.warnings.length === 1, mixed.warnings.length);

  // ── 7. Nothing throws, numbers stay finite ──
  check('C-BDS-2.7: unreadable weapons never throw and derived stays finite', (function () {
    try {
      var d = CR.computeDerived(modernSheet(), { armor: null, weapons: [{ name: 'X', state: 'carried' }, {}] });
      return Number.isFinite(d.meleeDefense) && Number.isFinite(d.rangedDefense) && Number.isFinite(d.soak);
    } catch (e) { return false; }
  })());

  // ── 8. THE PRODUCER SIDE — every resolveSheetEquipment branch that CAN know, stamps ──
  // Source-level. resolveSheetEquipment moved VERBATIM from player/app.jsx to lib/shared/sheetPool.js (R-S4PP-1/2,
  // ruling `shipyard-s4-ship-pool-path`), so the same text is read there — the claim is kept (norm 3).
  var src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'sheetPool.js'), 'utf8');
  var fn = src.slice(src.indexOf('function resolveSheetEquipment('));
  fn = fn.slice(0, fn.indexOf('\nfunction '));
  var weaponPushes = (fn.match(/out\.weapons\.push\(/g) || []).length;
  check('C-BDS-2.8: resolveSheetEquipment still has exactly 4 weapon branches', weaponPushes === 4, weaponPushes);
  check('C-BDS-2.8: the dangling-canonical-ref branch stamps _qualitiesRaw: []',
    /if \(!rec\) \{ out\.weapons\.push\(\{[^}]*_qualitiesRaw: \[\]/.test(fn));
  check('C-BDS-2.8: the unknown-entry branch stamps _qualitiesRaw: []',
    /out\.weapons\.push\(\{ name: '\(unknown weapon\)', _qualitiesRaw: \[\], _unresolved: true \}\)/.test(fn));
  check('C-BDS-2.8: the resolved branch stamps from the registry record',
    /disp\._qualitiesRaw = rec\.qualities \|\| \[\];/.test(fn));
  check('C-BDS-2.8: the legacy passthrough is documented as deliberately unstamped',
    /C-BDS-2: DELIBERATELY NOT STAMPED/.test(fn));

  console.log('\n' + (failures ? '  ' + failures + ' FAILED' : '  C-BDS-2 qualities-raw contract guard: ALL PASS'));
  process.exit(failures ? 1 : 0);
}
main();
