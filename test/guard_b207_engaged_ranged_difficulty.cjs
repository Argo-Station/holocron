/**
 * B-207 guard — engaged-range difficulty constants + zero engaged Gunnery weapons.
 *
 * 1. The 3 Ranged (Light) engaged weapons are named and their skill confirmed.
 * 2. Zero engaged-range Ranged (Heavy) weapons exist.
 * 3. Zero engaged-range Gunnery weapons exist (R-ERD-2 tripwire).
 * 4. The engaged-range behaviour matches Table 6-4 (printed p.210) — EXECUTED, not pattern-matched.
 *
 * §4 RE-POINTED under C-BBA-2 (ruling `b207-band-arithmetic`). It used to regex the literal line
 * `if (band === 'Engaged' && skKey)` out of app.jsx and assert `!/GUNN/` on it — condition
 * C-ERD-G1, whose purpose was to stop us shipping a FABRICATED `GUNN +2` constant and whose
 * acceptance rested on "the guard already ensures nothing can reach it."
 *
 * **C-ERD-G1 is SUPERSEDED, purpose intact.** Both premises are gone: D-DH-7 makes Engaged
 * selectable (so unreachability no longer holds), and R-DRB-5/R-BBL-1 model the book's REAL
 * prohibition instead of an invented number. The successor assertion below keeps the original
 * target exactly — a Gunnery difficulty NUMBER is still the defect — by requiring `barred` with
 * `difficulty === null`.
 *
 * The pin is now EXECUTABLE (Amendment 1's assertion-over-comment logic): it runs the shipped
 * computeWeaponPool rather than describing its source text, and it runs in BOTH input shapes,
 * because C-BBA-1's whole finding was that a capitalized-only fixture guards nothing live.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

// ── Registry census ──
var wData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'canonical', 'weapons.json'), 'utf8'));
var weapons = Object.values(wData.weapons);

var engagedRangeLt = weapons.filter(function(w) {
  return (w.range || '').trim().toLowerCase() === 'engaged' &&
         (w.skill || '').toLowerCase() === 'ranged_light';
});
var engagedRangeHvy = weapons.filter(function(w) {
  return (w.range || '').trim().toLowerCase() === 'engaged' &&
         (w.skill || '').toLowerCase() === 'ranged_heavy';
});
var engagedGunnery = weapons.filter(function(w) {
  return (w.range || '').trim().toLowerCase() === 'engaged' &&
         (w.skill || '').toLowerCase() === 'gunnery';
});

console.log('\n  B-207: engaged-range difficulty guard\n');

// 1. Exactly 3 Ranged (Light) engaged weapons, named
var expectedRangLt = ['a95_stingbeam', 'rivet_gun', 'wrist_blaster'];
var actualIds = engagedRangeLt.map(function(w) { return w.id; }).sort();
check('Ranged (Light) engaged count = 3', engagedRangeLt.length === 3,
  'got ' + engagedRangeLt.length + ': ' + actualIds.join(', '));
check('Ranged (Light) engaged weapons are the expected 3',
  JSON.stringify(actualIds) === JSON.stringify(expectedRangLt.sort()),
  'expected ' + expectedRangLt.sort().join(', ') + ' got ' + actualIds.join(', '));

// 2. Zero Ranged (Heavy) engaged
check('Ranged (Heavy) engaged count = 0', engagedRangeHvy.length === 0,
  'got ' + engagedRangeHvy.length + ': ' + engagedRangeHvy.map(function(w){ return w.id; }).join(', '));

// 3. Zero Gunnery engaged (R-ERD-2 tripwire)
check('Gunnery engaged count = 0 (R-ERD-2)', engagedGunnery.length === 0,
  'got ' + engagedGunnery.length + ': ' + engagedGunnery.map(function(w){ return w.id; }).join(', '));

// 4. Engaged-range behaviour — EXECUTE the shipped computeWeaponPool (C-BBA-2), in BOTH shapes.
var vm = require('vm');
var APP = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8');
// R-S4PP-2 (ruling `shipyard-s4-ship-pool-path`): the sheet's dice path moved VERBATIM to lib/shared/sheetPool.js, so
// its members are sliced from there — the same text, the same claim (norm 3); the rest still comes from app.jsx.
var POOL = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'sheetPool.js'), 'utf8');
// D-507 (handoff `encounters-e3-dicehub-move`): resolveWeaponSkillKey and computeWeaponPool moved VERBATIM with DiceHub's closure to
// lib/shared/diceHub.jsx — sliced from there by name, the same text, the same claim
var HUB = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'diceHub.jsx'), 'utf8');
function sliceDecl(src, header) {
  var i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — app.jsx moved; fix the slice.');
  var j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
var sb = { module: { exports: {} }, console: console, JSON: JSON, Math: Math, Object: Object,
           Array: Array, String: String, Number: Number, Boolean: Boolean, isFinite: isFinite };
sb.window = sb; sb.global = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'charResolve.js'), 'utf8'), sb, { filename: 'charResolve.js' });
// R-PCA-2: the REAL assembler + the REAL skill vocabulary, so this guard executes the shipped fold
// rather than a version of `computeWeaponPool` with the fold stubbed out. The fixture carries no
// equipment, so there are no item dice to fold — which is the claim being made.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'poolMods.js'), 'utf8'), sb, { filename: 'poolMods.js' });
// F-100 M7: the vocabulary's id → sheet key and id → characteristic maps, as loadCanonicalCharacterBuild builds them.
sb._canonicalCharbuild = (function () {
  var cb = { skillSheetKeys: {}, skillChars: {} };
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'canonical', 'skills.vocab.json'), 'utf8')).entries.forEach(function (e) {
    cb.skillSheetKeys[e.id] = (e.aliases || []).find(function (a) { return /^[A-Z]+$/.test(a); }) || e.id;
    if (e.characteristic) cb.skillChars[e.id] = e.characteristic;
  });
  return cb;
})();
sb._canonicalRegistries = { skills: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'canonical', 'skills.vocab.json'), 'utf8')).entries };
vm.runInContext([
  sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
  sliceDecl(POOL, 'const OGG_TO_SHEET_SKILL = {') + ';',
  // F-100 M7 C2 (R-M7K-9): SKILL_CHARS is DELETED; the characteristic is CharResolve.skillCharacteristic through the
  // shared read, sliced like the rest, over the vocabulary's own map (the sandbox's `_canonicalCharbuild`).
  sliceDecl(POOL, 'function sheetSkillCharacteristic(sheet, sheetKey)'),
  sliceDecl(HUB, 'function resolveWeaponSkillKey(rawSkill)'),
  // R-B658 (ruling `b658-sheet-skill-grant-shape`): `computeWeaponPool` reads its skill rank through the
  // shared read-tolerance helper, so the helper is SLICED — the same reason `withPoolMods` is. Stubbing it
  // would make this guard execute a function the app does not have.
  sliceDecl(POOL, 'function skillEntryRank(entry)'),
  sliceDecl(POOL, 'function poolModSkillIndex()'),
  sliceDecl(POOL, 'function collectPoolMods(resolvedEquipment, session)'),
  sliceDecl(POOL, 'function collectRollNumbers(sheet)'),
  sliceDecl(POOL, 'function withPoolMods(spec, mods, skillKeyOrId, characteristic, roll, powerId)'),
  sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)'),
  // the builder moved into sheetPool.js (f100-surfacing-sheet-concept R-SSC-4, ADDENDUM 10 C3 (a)): computeWeaponPool is its
  // one-line caller — re-pointed by name at f100-surfacing-sheet-build
  sliceDecl(POOL, 'function weaponPoolOf(sheet, weapon, opts)'),
  sliceDecl(POOL, 'function sheetWeaponDamage(sheet, weapon, qualityRows)'),   // post1-one-number-hub-build C3: weaponPoolOf's one damage
].join('\n') + '\nglobalThis.SKILL_NAMES=SKILL_NAMES;globalThis.OGG_TO_SHEET_SKILL=OGG_TO_SHEET_SKILL; globalThis.SWRPGSheetPool = Object.assign(globalThis.SWRPGSheetPool || {}, { weaponPoolOf: weaponPoolOf });',
  sb, { filename: 'app.jsx-slices' });

var SHEET = { characteristics: { brawn: 3, agility: 3 }, skills: { RANGHVY: 2, RANGLT: 2, GUNN: 2 } };
var EQ = { weapons: [], armor: null, gear: [] };

[['capitalized', function (x) { return x; }],
 ['lowercase (the registry\'s own shape)', function (x) { return x.toLowerCase(); }]
].forEach(function (entry) {
  var label = entry[0], sh = entry[1];
  function pool(skill, printed) {
    return sb.computeWeaponPool(SHEET, { skill: skill, range: sh(printed) }, null, { forceRating: 0 }, '#fff', EQ);
  }
  // Table 6-4's two named modifiers, on the Easy(1) Engaged base (Table 6-1's own Engaged row).
  check('[' + label + '] Ranged (Light) at Engaged = 2  (Easy 1 + light +1)',
    pool('Ranged (Light)', 'Engaged').difficulty === 2, JSON.stringify(pool('Ranged (Light)', 'Engaged').difficulty));
  check('[' + label + '] Ranged (Heavy) at Engaged = 3  (Easy 1 + heavy +2)',
    pool('Ranged (Heavy)', 'Engaged').difficulty === 3, JSON.stringify(pool('Ranged (Heavy)', 'Engaged').difficulty));
  // C-ERD-G1's SUCCESSOR: the original target was a Gunnery difficulty NUMBER. Still the defect.
  var g = pool('Gunnery', 'Engaged');
  check('[' + label + '] Gunnery at Engaged is BARRED, and never a number (C-ERD-G1 successor)',
    g.barred === true && g.difficulty === null,
    'barred=' + JSON.stringify(g.barred) + ' difficulty=' + JSON.stringify(g.difficulty));
});

console.log('\n  ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAIL)' : '') + '\n');
process.exit(fail ? 1 : 0);
