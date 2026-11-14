/*
 * f100_m8_ops.cjs — F-100 M8 step 2, the C10 ops guard: one leg per landed op ARM, each bitten by a mutant in
 * scripts/canonical/f100_m8_bites.cjs (`f100-m8-build-card` §4 items 6 and 11; `f100-m8-contracts` R-M8K-16..19, R-M8K-26).
 *
 *   C11 (roll numbers, through the ONE core SWRPGPoolMods.rollNumbersAt / critRatingWith / critRoll):
 *     D  damage_delta — computeWeaponPool returns `damageLines` BESIDE the weapon's damage, never folded into it; a
 *        `range_band` row applies at a matching band and is ABSENT at any other (R-M8K-26); a condition, cost or limit
 *        makes it OFFERED (classOfRollNumber); an anchor that does not match leaves it out; a pick-less `chosen`
 *        amount fails closed.
 *     R  crit_rating_delta — `critThreshold` takes the applied rows, never below the floor; `critPrinted` keeps the book's
 *        (restored at B2 with Iron Body from c0e03b56, f100-m8-build-card R-M8B-23).
 *     W  the `weapon_record` anchor (R-M8K-25) — a row anchored to a weapons.json id matches the row whose weapon IS that
 *        record (`regId`, the display shape's bare id) and no other; both readers (the hub's computeWeaponPool and the
 *        sheet's sheetWeaponTalentDamage) hand the row's record to the one matcher.
 *     K  crit_roll_delta — the owner's injury roll: the d100, every +10, THEN the reductions, THEN the floor (N6,
 *        R-M8K-19); CritTableRef rolls through it with the sheet's own roll sources.
 *   M  moments — a row answers only its own moment: the same op at the other moment never applies.
 *   V  no vehicle weapon receives a damage_delta row (f100-m8-build R-M8G-70 (a), measured at the fix): Deadly Accuracy is
 *      "with non-starship/vehicle weapons" (EotE p.134) and stays APPLIED only because no roll surface that rolls a
 *      vehicle-mounted weapon reads roll numbers. Pinned by source: the Yard's seat pools (SWRPGSheetPool.yardCharPool /
 *      yardSeatLines), the GM app and the vessel views read none; in the player app every damage_delta read sits in
 *      computeWeaponPool or sheetWeaponTalentDamage, whose weapons are the sheet's own (`equipment.weapons`, the personal
 *      registry) — the app never names the vehicle-weapons registry. A new reader that rolls a ship's gun turns this red,
 *      and that reader owes the row a condition first (soft_spot's shape, R-M8G-50).
 *
 * The talent rows are FIXTURES handed to the shipped app slice (the app's bound `collectRollNumbers` is re-bound to
 * return them); everything else is the shipped code. Run: node test/f100_m8_ops.cjs     exit 0 = every leg holds.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (p) => JSON.parse(read(p));
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const APP = read('player/app.jsx'), UI = read('lib/shared/ui.jsx');
// D-507 (handoff `encounters-e3-dicehub-move`): resolveWeaponSkillKey, computeWeaponPool, DICE_HUB_BANDS and DiceHub's weapon
// rows moved VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx — sliced and read from there by name, each file on its own
const HUB = read('lib/shared/diceHub.jsx');
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
function sliceBetween(src, from, to) {
  const i = src.indexOf(from), j = src.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error('SLICE MISS: ' + from);
  return src.slice(i, j);
}

const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set };
sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
vm.createContext(sb);
// lib/items.js + lib/shared/itemResolve.js: the ONE Brawn adder D2's re-point reads (ADDENDUM 666 F4)
for (const f of ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js', 'lib/shared/effectClass.js', 'lib/shared/poolMods.js', 'lib/shared/sheetPool.js']) {
  sb.module = { exports: {} };
  vm.runInContext(read(f), sb, { filename: f });
}
const vocab = J('public/data/canonical/skills.vocab.json').entries;
const cb = { talents: J('public/data/canonical/talents.json').talents, skillSheetKeys: {}, skillChars: {} };
vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });
sb._canonicalCharbuild = cb;
sb._canonicalRegistries = { skills: vocab };
vm.runInContext([
  sliceBetween(APP, '// ── BEGIN SHEETPOOL BINDINGS', '// ── END SHEETPOOL BINDINGS'),
  sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
  sliceDecl(HUB, 'function resolveWeaponSkillKey(rawSkill)'),
  sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)'),
  sliceDecl(HUB, 'var DICE_HUB_BANDS = [') + ';',
  sliceDecl(APP, 'function sheetWeaponTalentDamage(sheet, w)'),
].join('\n') + '\nglobalThis.__C = { computeWeaponPool, sheetWeaponTalentDamage };' +
  // app.jsx's sheetWeaponTalentDamage calls the moved names as SWRPGDiceHub.<name> (CONTRACT 2): the module's own slices
  '\nglobalThis.SWRPGDiceHub = { DICE_HUB_BANDS: DICE_HUB_BANDS, resolveWeaponSkillKey: resolveWeaponSkillKey };', sb, { filename: 'app.jsx-slices' });
const C = sb.__C, P = sb.SWRPGPoolMods;

let OWNED = [];
// the owner's roll numbers, stubbed where collectRollNumbers reads them (CharResolve.ownedTalentRollSources): the hub's builder
// moved into sheetPool.js's closure (weaponPoolOf, f100-surfacing-sheet-concept R-SSC-4 / ADDENDUM 10 C3 (a)), so a stub of the
// free name no longer reaches it — re-pointed by name at f100-surfacing-sheet-build; the real collectRollNumbers now runs too
sb.CharResolve.ownedTalentRollSources = function () { return OWNED; };
const T = (id, rows, ranks) => ({ id: id, name: id, ranked: ranks != null, ranks: ranks || 1, roll_numbers: rows });
const SHEET = { name: 'Ops case', characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 4, willpower: 2, presence: 2 },
  skills: { BRAWL: 2, RANGLT: 1, MELEE: 1 }, specializations: [], talents: [], equipment: { weapons: [], armor: null, gear: [] } };
const EQ = { weapons: [], armor: null, gear: [] };
const FIST = { name: 'Brass knuckles', skill: 'brawl', range: 'engaged', damage: { value: 1, base: 'brawn' }, crit: 4, qualities: [] };
const PISTOL = { name: 'Blaster pistol', skill: 'ranged_light', range: 'medium', damage: { value: 6, base: 'flat' }, crit: 3, qualities: [] };
const wp = (w, band, owned) => { OWNED = owned; const before = JSON.stringify(w); const s = C.computeWeaponPool(SHEET, w, band, {}, '#fff', EQ); s.__weaponUntouched = JSON.stringify(w) === before; return s; };

const FERAL = (n) => T('feral_strength', [{ id: 'damage_delta', op: 'damage_delta', moment: 'check', amount: 1, per_rank: true,
  applies_to: [{ scope: 'skill', value: 'brawl' }, { scope: 'skill', value: 'melee' }] }], n);
const POINT_BLANK = T('point_blank', [{ id: 'damage_delta', op: 'damage_delta', moment: 'check', amount: 1, per_rank: true,
  applies_to: [{ scope: 'skill', value: 'ranged_light' }, { scope: 'skill', value: 'ranged_heavy' }], range_band: ['engaged', 'short'] }], 1);
const SOFT_SPOT = T('soft_spot', [{ id: 'damage_delta', op: 'damage_delta', moment: 'check', amount: { of: 'characteristic', key: 'cunning' },
  applies_to: [{ scope: 'all' }], cost: { destiny: 1 } }]);
const PICKED = T('fx_picked', [{ id: 'damage_delta', op: 'damage_delta', moment: 'check', amount: { of: 'skill_ranks', chosen: 'combat_skill' },
  applies_to: [{ scope: 'all' }] }]);
const CLANKER = (n, cond) => T('fx_crit', [Object.assign({ id: 'crit_rating_delta', op: 'crit_rating_delta', moment: 'check', amount: -1, per_rank: true, floor: 1,
  applies_to: [{ scope: 'skill', value: 'brawl' }] }, cond ? { condition: { span: [0, 4], hash: 'x' } } : {})], n);
const IRON_BODY = (n) => T('iron_body', [{ id: 'crit_rating_delta', op: 'crit_rating_delta', moment: 'check', amount: -1, per_rank: true, floor: 1,
  applies_to: [{ scope: 'weapon_record', value: 'unarmed' }] }], n);
const UNARMED = { name: 'Unarmed', regId: 'unarmed', skill: 'brawl', range: 'engaged', damage: { value: 0, base: 'brawn' }, crit: 5, qualities: [] };
const DURABLE = (n) => T('durable', [{ id: 'crit_roll_delta', op: 'crit_roll_delta', moment: 'critical_injury', amount: -10, per_rank: true, floor: 1 }], n);
const PLUS10 = T('fx_plus', [{ id: 'crit_roll_delta', op: 'crit_roll_delta', moment: 'critical_injury', amount: 10 }]);

console.log('F-100 M8 OPS (C10 · C11 arms)');

// ── D. damage_delta ──
const d2 = wp(FIST, 'Engaged', [FERAL(2)]);
check(d2.damageLines && d2.damageLines.total === 2 && d2.damageLines.applied.length === 1, 'D1 Feral Strength ×2 on a Brawl attack: +2 damage to one hit, APPLIED', JSON.stringify(d2.damageLines));
// RE-POINTED (release-r7-bug-burndown ADDENDUM 666 F4; 644 S3): the spec now carries C3's ONE damage, spec.damage — a
// projection of the record (ItemResolve.weaponDamage's total, Brawn added there only, plus each granted quality row), never a
// fold. KEEPS: the record untouched, critPrinted 4, "the op folds no damage of its own" (Feral Strength's +2 stays in
// damageLines, outside spec.damage). DROPS: "`damage` is undefined". FIST's `{ value, base }` shape is not the resolved
// display shape the sheet hands the pool ("+1", resolveSheetEquipment), so the projection is read on that shape of the same
// fist (FIST_D); on FIST's own shape the projection is null and the record claims are read there, as before.
const FIST_D = Object.assign({}, FIST, { damage: '+1' }), d2d = wp(FIST_D, 'Engaged', [FERAL(2)]);
const d2w = sb.ItemResolve.weaponDamage({ damage: FIST.damage }, SHEET).total, d2q = (d2d.qualityDamage || []).reduce((n, f) => n + (f && f.amount || 0), 0);
check(d2.__weaponUntouched && d2.critPrinted === 4 && d2d.__weaponUntouched && d2d.critPrinted === 4 && d2d.damage && d2d.damage.total === d2w + d2q
  && d2d.damage.base === d2w && d2w === 4 && d2d.damage.changes.length === 0 && d2d.damageLines.total === 2 && d2.damageLines.total === 2,
  'D2 never folded: the weapon record is untouched; spec.damage is the record\'s projection (' + (d2d.damage ? d2d.damage.total : 'none') + ' = weaponDamage ' + d2w + ' + granted ' + d2q + '), the op\'s +2 only in damageLines', JSON.stringify(d2d.damage));
check(wp(PISTOL, 'Short', [POINT_BLANK]).damageLines.total === 1, 'D3 Point Blank at Short: APPLIED by the band the row prices from (R-M8K-26)');
const pbM = wp(PISTOL, 'Medium', [POINT_BLANK]).damageLines;
check(pbM.total === 0 && !pbM.applied.length && !pbM.offered.length, 'D4 Point Blank at Medium: ABSENT, not offered (a machine-checked band is no fate input)', JSON.stringify(pbM));
check(wp(PISTOL, 'Short', [FERAL(1)]).damageLines.total === 0, 'D5 a Brawl/Melee row stays off a Ranged (Light) attack (anchors through the one matcher)');
const ss = wp(PISTOL, 'Short', [SOFT_SPOT]).damageLines;
check(ss.total === 0 && ss.offered.length === 1 && ss.offered[0].amount === 4, 'D6 Soft Spot (a Destiny cost) is OFFERED with its amount = Cunning 4, never applied', JSON.stringify(ss));
const up = wp(PISTOL, 'Short', [PICKED]).damageLines;
check(up.total === 0 && up.unpicked.length === 1 && !up.applied.length, 'D7 a `chosen` amount with no pick FAILS CLOSED (returned unpicked, never applied)', JSON.stringify(up));

// ── R. crit_rating_delta ──
check(wp(FIST, 'Engaged', [CLANKER(2)]).critThreshold === 2, 'R1 −1 per rank ×2 on Crit 4 → 2');
const r2 = wp(FIST, 'Engaged', [CLANKER(5)]);
check(r2.critThreshold === 1 && r2.critPrinted === 4, 'R2 never below the floor: ×5 on Crit 4 → 1, the printed 4 kept beside it', JSON.stringify({ c: r2.critThreshold, p: r2.critPrinted }));
const r3 = wp(FIST, 'Engaged', [CLANKER(1, true)]);
check(r3.critThreshold === 4 && r3.critLines.offered.length === 1, 'R3 a row with a condition is OFFERED: the rating stays 4');
check(wp(PISTOL, 'Short', [CLANKER(1)]).critThreshold === 3, 'R4 a Brawl crit row stays off a pistol');

// ── W. the weapon_record anchor (R-M8K-25) ──
const w1 = wp(UNARMED, 'Engaged', [IRON_BODY(1)]);
check(w1.critThreshold === 4 && w1.critPrinted === 5 && w1.critLines.applied.length === 1, 'W1 Iron Body ×1 on the Unarmed row (regId unarmed): Crit 5 → 4, APPLIED', JSON.stringify({ c: w1.critThreshold, p: w1.critPrinted }));
const w2 = wp(Object.assign({ regId: 'blaster_pistol' }, PISTOL), 'Short', [IRON_BODY(1)]), w2b = wp(Object.assign({ regId: 'brass_knuckles' }, FIST), 'Engaged', [IRON_BODY(1)]);
check(w2.critThreshold === 3 && !w2.critLines.applied.length && w2b.critThreshold === 4 && !w2b.critLines.applied.length,
  'W2 Iron Body stays off a pistol AND off another Brawl weapon (brass knuckles): the anchor is the record, not the skill', JSON.stringify({ p: w2.critThreshold, k: w2b.critThreshold }));
const sw = (w, owned) => { OWNED = owned; return C.sheetWeaponTalentDamage(SHEET, w); };
const w3 = sw(UNARMED, [IRON_BODY(1)]), w3b = sw(Object.assign({ regId: 'brass_knuckles' }, FIST), [IRON_BODY(1)]);
check(w3.critThreshold === w1.critThreshold && w3.critPrinted === 5 && w3.critLines.applied.length === 1 && w3b.critThreshold === 4 && !w3b.critLines.applied.length,
  'W3 the sheet\'s WEAPONS unit (sheetWeaponTalentDamage) draws the hub\'s number: Unarmed 5 → 4, brass knuckles untouched', JSON.stringify({ u: w3.critThreshold, k: w3b.critThreshold }));

// ── K. crit_roll_delta (the owner's injury roll) ──
const at = (owned) => P.rollNumbersAt(owned, 'crit_roll_delta', { moment: 'critical_injury', sheet: SHEET });
const k1 = P.critRoll(50, 2, at([DURABLE(1)]));
check(k1.total === 60 && k1.lines.length === 2 && k1.lines[0].amount === 20 && k1.lines[1].amount === -10, 'K1 d100 50 + 2 injuries (+20) − Durable 10 = 60, the steps printed in order', JSON.stringify(k1));
check(P.critRoll(3, 0, at([DURABLE(2)])).total === 1, 'K2 the floor: 3 − 20 → 1, never below');
check(P.critRoll(5, 0, at([PLUS10, DURABLE(1)])).total === 5, 'K3 N6 order: +10 first, then −10, then the floor (5 + 10 − 10 = 5, not max(1, 5 − 10) + 10 = 11)');
check(/P\.critRoll\(d, critCount, P\.rollNumbersAt\(props\.rollSources, 'crit_roll_delta', \{ moment: 'critical_injury'/.test(sliceDecl(UI, 'function CritTableRef(props)')),
  'K4 CritTableRef rolls the owner\'s injury through the one core with its roll sources');
check(/<CritTableRef paper variant="character"[^>]*rollSources=\{collectRollNumbers\(sheet\)\}/.test(APP), 'K5 the player sheet hands CritTableRef the sheet\'s own roll sources');

// ── M. moments (the SAME op at the other moment, so only the moment can keep it out) ──
const CHECK_ROLL = T('fx_check_roll', [{ id: 'crit_roll_delta', op: 'crit_roll_delta', moment: 'check', amount: 10, applies_to: [{ scope: 'all' }] }]);
const INJURY_DMG = T('fx_injury_dmg', [{ id: 'damage_delta', op: 'damage_delta', moment: 'critical_injury', amount: 3, applies_to: [{ scope: 'skill', value: 'brawl' }] }]);
check(at([CHECK_ROLL]).applied.length === 0, 'M1 a crit_roll_delta row at the CHECK moment never answers the injury roll');
check(wp(FIST, 'Engaged', [INJURY_DMG]).damageLines.applied.length === 0, 'M2 a damage_delta row at the INJURY moment never answers a check, even with a matching anchor');

// ── V. no vehicle weapon receives a damage_delta row (R-M8G-70 (a)) ──
const RN = /rollNumbersAt|collectRollNumbers|damage_delta|damageLines/;
const SPOOL = read('lib/shared/sheetPool.js');
check(!RN.test(sliceDecl(SPOOL, 'function yardCharPool(')) && !RN.test(sliceDecl(SPOOL, 'function yardSeatLines(')),
  'V1 the Yard\'s seat pools (yardCharPool, yardSeatLines) read no roll numbers');
const NOREAD = ['gm/app.jsx', 'lib/shared/vesselView.jsx', 'lib/shared/vesselView.js'].filter((f) => fs.existsSync(path.join(ROOT, f)) && RN.test(read(f)));
check(NOREAD.length === 0, 'V2 the GM app and the vessel views read no roll numbers', NOREAD.join(', '));
// the hub's read sits in the one weapon pool builder, sheetPool.js's weaponPoolOf (R-SSC-4; re-pointed by name from
// computeWeaponPool, now its one-line caller, at f100-surfacing-sheet-build)
const dmgAt = [], re = /rollNumbersAt\([^;]*'damage_delta'/g; let mm;
[APP, HUB, SPOOL].forEach((SRC) => { re.lastIndex = 0;
  while ((mm = re.exec(SRC))) { const before = SRC.slice(0, mm.index), fn = (before.match(/\nfunction ([A-Za-z0-9_]+)\(/g) || []).pop() || ''; dmgAt.push(fn.replace(/\nfunction |\(/g, '')); } });
const owners = [...new Set(dmgAt)].sort().join();
// + whySheetLines (f100-surfacing-sheet-build step 5, R-SSC-2: a skill's why-sheet names the claws' damage row the frames S2
// drew) — a CHARACTER skill's check, never a vehicle weapon, so R-M8G-70 (a)'s claim stands
check(dmgAt.length > 0 && owners === 'sheetWeaponTalentDamage,weaponPoolOf,whySheetLines',
  'V3 every damage_delta read in the player app sits in weaponPoolOf (sheetPool.js), sheetWeaponTalentDamage or whySheetLines (' + dmgAt.length + ' reads)', owners);
// D-507: DiceHub's weapon rows (the computeWeaponPool calls) live in lib/shared/diceHub.jsx; the vehicle-weapons claim reads both files.
// 3190960e2 (CONTRACT 3, the sheet-less window) wrapped the map in `(sheet ? … : [])` — the same sheet's own weapons, matched as shipped
const cwpCalls = HUB.split('\n').filter((l) => /computeWeaponPool\(sheet, w\b/.test(l));
// re-pointed by name (f100-surfacing-roll-options-card ADDENDUM 42, D-SROE-1 (a)): B-1488 (ADDENDUM 38 F4 (a)) maps the sheet's own
// weapons through diceHubWeaponsWithUnarmed, which appends only the Unarmed RULES PROFILE; the claim is kept
check(cwpCalls.length > 0 && /\(sheet \? diceHubWeaponsWithUnarmed\(equipment\.weapons, sheet\) : \[\]\)\.map\(function \(w, i\)/.test(HUB) && !/vehicle-weapons/.test(APP) && !/vehicle-weapons/.test(HUB),
  'V4 computeWeaponPool rolls the sheet\'s own weapons (equipment.weapons, + the Unarmed profile through diceHubWeaponsWithUnarmed); the app never names the vehicle-weapons registry (ADDENDUM 42 D-SROE-1)', cwpCalls.length);

console.log('\n  f100_m8_ops: ' + pass + ' PASS · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
