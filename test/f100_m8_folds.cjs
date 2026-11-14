/*
 * f100_m8_folds.cjs — F-100 M8 step 2, card item 8 (ruling `f100-m8-build-card` §4; B-1061, B-1062; `f100-m8-contracts`
 * C2, R-M8K-2): a talent dice row anchored to the CRAFTING roll applies in the workshop's pool, and one anchored to the
 * FORCE POWER roll applies in the hub's Force row — each there and nowhere else.
 *
 *   C  craftPoolOf (player/app.jsx): the workshop's check pool folds the owner's auto-applying dice through the ONE fold
 *      (`withPoolMods` over `collectPoolMods(resolveSheetEquipment(sheet.equipment, sheet))`) with roll `craft`. A row
 *      anchored to the check's SKILL applies too (a crafting check is a Mechanics check); an OFFER (a cost) never folds.
 *      `rollCheck` rolls, and `poolLine` draws, that one built pool (`pool.dice`) — never a bare re-count.
 *   F  diceHubForceSpec (lib/shared/diceHub.jsx): the hub's Force rows fold with roll `force_power` and NO skill, so poolMods'
 *      ROLL-ONLY context answers a `roll: force_power` row and refuses `all`, skill and characteristic anchors.
 *   X  the two rolls never cross: the craft row stays off the Force row and off the hub's plain Mechanics row.
 *
 * `roll: force_power` has no base user (R-F100-9; f100_m8_members.json), so the Force leg is proven on a FIXTURE row,
 * as LAP.md's IN FLIGHT records; the gate flags that the member waits for a user.
 *
 * The collector is the shipped `SWRPGPoolMods.collect` over the shipped `resolveSheetEquipment`; only the OWNED-TALENT
 * list it is handed is a fixture (a stamp view would need a full owned tree), so every number below passes through the
 * real collect → augment → buildPool chain.
 *
 * Run: node test/f100_m8_folds.cjs        exit 0 = every leg holds.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (p) => JSON.parse(read(p));
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const APP = read('player/app.jsx');
// D-507 (handoff `encounters-e3-dicehub-move`): the hub's functions (diceHubSkillRow, diceHubRolledCharacteristic,
// diceHubSkillSpec, diceHubForceSpec, DiceHub) moved VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx — sliced from
// there by name; the workshop's stay in player/app.jsx
const HUBSRC = read('lib/shared/diceHub.jsx');
function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — the source moved; fix the slice.');
  let k = header.endsWith('{') ? i + header.length - 1 : src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
// A COMPONENT's text, header to the next top-level declaration (JSX braces defeat sliceDecl's brace count).
function region(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — the source moved; fix the slice.');
  const m = /\n(?:function |const |var |let |class )/.exec(src.slice(i + header.length));
  return m ? src.slice(i, i + header.length + m.index) : src.slice(i);
}
function sliceBetween(src, from, to) {
  const i = src.indexOf(from), j = src.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error('SLICE MISS: ' + from);
  return src.slice(i, j);
}

// ── the shipped shared cores in one vm, as both hosts load them ──
const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set };
sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
vm.createContext(sb);
for (const f of ['lib/shared/charResolve.js', 'lib/shared/diceEngine.js', 'lib/shared/poolMods.js', 'lib/shared/sheetPool.js']) {
  sb.module = { exports: {} };
  vm.runInContext(read(f), sb, { filename: f });
}
const vocab = J('public/data/canonical/skills.vocab.json').entries;
const cb = { species: J('public/data/canonical/species.json').species, careers: J('public/data/canonical/careers.json').careers,
  specializations: J('public/data/canonical/specializations.json').specializations, talents: J('public/data/canonical/talents.json').talents,
  skillSheetKeys: {}, skillChars: {} };
vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });
sb._canonicalCharbuild = cb;
sb._canonicalRegistries = { skills: vocab };

vm.runInContext([
  sliceBetween(APP, '// ── BEGIN SHEETPOOL BINDINGS', '// ── END SHEETPOOL BINDINGS'),
  sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
  sliceDecl(HUBSRC, 'function diceHubSkillRow(sheet, k)'),
  sliceDecl(HUBSRC, 'function diceHubRolledCharacteristic(row, using)'),
  sliceDecl(HUBSRC, 'function diceHubSkillSpec(sheet, row, poolMods, using, accent)'),
  sliceDecl(HUBSRC, 'function diceHubForceSpec(sheet, poolMods, available, accent, powerId)'),   // F-100 M10 (R-M10S-3): the power id rides
  sliceDecl(APP, 'const CRAFT_DIFF_DICE = {') + ';',
  sliceDecl(APP, 'const CRAFT_SKILL_KEY = {') + ';',
  sliceDecl(APP, 'const CRAFT_CHAR_PROP = {') + ';',
  sliceDecl(APP, 'function craftSkillKey(canonId)'),
  sliceDecl(APP, 'function craftPoolOf(sheet, t, canonId)'),
].join('\n') + '\nglobalThis.__C = { craftPoolOf, diceHubSkillRow, diceHubSkillSpec, diceHubForceSpec };',
  sb, { filename: 'app.jsx-slices' });
const C = sb.__C, Dice = sb.SWRPGDice, PM = sb.SWRPGPoolMods;

// The owned-talent fixture rides into the SHIPPED collector: the app's bound `collectPoolMods` is re-bound to the real
// `SWRPGPoolMods.collect` over the equipment it is handed, plus this list. What it was handed is recorded (leg C5).
let OWNED = [], handed = [];
sb.collectPoolMods = function (eq) { handed.push(eq); return PM.collect(eq, OWNED); };
const row = (id, mod) => ({ id: id, name: id, ranked: false, ranks: 1, pool_mods: [Object.assign({ die: 'boost', count: 1, direction: 'add', condition: null }, mod)] });
const CRAFT_ROW = row('fx_craft', { applies_to: [{ scope: 'roll', value: 'craft' }] });
const FORCE_ROW = row('fx_force', { applies_to: [{ scope: 'roll', value: 'force_power' }] });
const MECH_ROW = row('fx_mech', { applies_to: [{ scope: 'skill', value: 'mechanics' }] });
const ALL_ROW = row('fx_all', { applies_to: [{ scope: 'all' }] });
const WIL_ROW = row('fx_wil', { applies_to: [{ scope: 'characteristic', value: 'willpower' }] });
const OFFER_ROW = row('fx_offer', { applies_to: [{ scope: 'roll', value: 'craft' }], cost: { strain: 1 } });

const SHEET = { name: 'Fold case', characteristics: { brawn: 2, agility: 2, intellect: 3, cunning: 2, willpower: 3, presence: 2 },
  skills: { MECH: 1 }, specializations: [], equipment: { weapons: [], armor: null, gear: [] } };
const T = { check: { skills: ['mechanics'], difficulty: 'average' } };
const craft = (owned) => { OWNED = owned; return C.craftPoolOf(SHEET, T, 'mechanics'); };
const force = (owned) => { OWNED = owned; return Dice.buildPool(C.diceHubForceSpec(SHEET, sb.collectPoolMods(sb.resolveSheetEquipment(SHEET.equipment, SHEET)), 2, '#fff')); };
const hubMech = (owned) => { OWNED = owned; const r = C.diceHubSkillRow(SHEET, 'MECH'); return Dice.buildPool(C.diceHubSkillSpec(SHEET, r, sb.collectPoolMods(sb.resolveSheetEquipment(SHEET.equipment, SHEET)), null, '#fff')); };

console.log('F-100 M8 FOLDS (card item 8; B-1061, B-1062)');

// ── C. the workshop's crafting roll ──
const c0 = craft([]), c1 = craft([CRAFT_ROW]);
check(c0 && c0.dice && c0.dice.boost === 0 && c0.dice.ability + c0.dice.proficiency === 3 && c0.dice.difficulty === 2,
  'C0 control — no row: the workshop rolls Intellect 3 / Mechanics 1 vs Average, no boost', JSON.stringify(c0 && c0.dice));
check(c1 && c1.dice && c1.dice.boost === 1, 'C1 a `roll: craft` row adds its boost to the workshop\'s pool', JSON.stringify(c1 && c1.dice));
check(c1 && c1.spec && (c1.spec._poolModChanges || []).length === 1 && c1.spec._poolModChanges[0].source === 'fx_craft',
  'C2 the folded spec records the one change, named by its source', JSON.stringify(c1 && c1.spec && c1.spec._poolModChanges));
check(craft([MECH_ROW]).dice.boost === 1, 'C3 a row anchored to the check\'s skill (Mechanics) applies to the crafting check too');
check(craft([OFFER_ROW]).dice.boost === 0, 'C4 a craft row with a cost is an OFFER: it never folds on its own (R-M8K-4)');
handed = []; craft([]);
check(handed.length === 1 && handed[0] && handed[0]._owner === SHEET, 'C5 the collector is handed the sheet\'s own resolved equipment (its `_owner` is the sheet)');
check(c1 && c1.total === 3 && c1.upg === 1 && c1.diff === 2, 'C6 the bare check\'s numbers (total/upg/diff) are unchanged beside the fold', JSON.stringify({ total: c1 && c1.total, upg: c1 && c1.upg, diff: c1 && c1.diff }));
const WS = region(APP, 'function CraftWorkshop({ sheet, accent, onSheetChange })');
check(/D\.rollAndResolve\(pool\.dice\)/.test(WS) && !/pool\.total - pool\.upg/.test(WS), 'C7 rollCheck rolls the folded pool (`pool.dice`), not a bare re-count');
check(/\bdp = pd\.dice\b/.test(WS) && !/ffgDicePool\(pd\.charVal, pd\.rank\)/.test(WS), 'C8 poolLine draws the same folded pool');

// ── F. the hub's Force rows ──
const f0 = force([]), f1 = force([FORCE_ROW]);
check(f0.force === 2 && f0.boost === 0, 'F0 control — no row: the Force row rolls the 2 available Force dice, no boost', JSON.stringify(f0));
check(f1.force === 2 && f1.boost === 1, 'F1 a `roll: force_power` row adds its boost to the Force row', JSON.stringify(f1));
check(force([ALL_ROW]).boost === 0, 'F2 an `all` row does NOT reach a Force power check (roll-only context)');
check(force([WIL_ROW]).boost === 0, 'F3 a characteristic row (Willpower) does NOT reach it either');
check(force([MECH_ROW]).boost === 0, 'F4 nor does a skill row');
const HUB = region(HUBSRC, 'function DiceHub({ sheet, accent, onClose, initialStrip, committed: committedProp, onCommit, onChoosePick, treat, onTreated, given })');
// the surfacing hub re-point (f100-surfacing-hub-build, H6): the power id is read once as `pid` (the dials and the Duration
// commit read it too); kept: the row's spec IS diceHubForceSpec over the hub's poolMods and `available`; dropped: the inline id.
check(/var pid = typeof fp === 'string' \? null : fp\.id;/.test(HUB) && /var spec = diceHubForceSpec\(sheet, poolMods, available, accent, pid\);/.test(HUB), 'F5 DiceHub\'s Force rows build through diceHubForceSpec over the hub\'s poolMods');

// ── X. the rolls never cross ──
check(force([CRAFT_ROW]).boost === 0, 'X1 the craft row stays off the Force row');
check(craft([FORCE_ROW]).dice.boost === 0, 'X2 the Force row stays off the workshop');
check(hubMech([CRAFT_ROW]).boost === 0 && hubMech([MECH_ROW]).boost === 1, 'X3 the craft row stays off the hub\'s plain Mechanics row (which a skill row still reaches)');
check(craft([ALL_ROW]).dice.boost === 1, 'X4 an `all` row still reaches the crafting check (it has a skill, so its context is not roll-only)');

console.log('\n  f100_m8_folds: ' + pass + ' PASS · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
