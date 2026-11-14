#!/usr/bin/env node
/* release-r5-crafting-kp · KEEPING THE PEACE ARMOUR, THE SPARE IT LANDS AS, AND A ROW'S LIMITS (card
 * `release-r5-crafting-kp` C2, C9, acceptance 3–4; ruling `release-r5-crafting-kp-c0` Q1 (a), Q3a (a), Q3b).
 *
 *   K1  (Q2) the 7 `armor` templates are Table 3-1 (Keeping the Peace printed 90) in the page's order: price/rarity,
 *       (R), difficulty, skills, hours and the profile (soak, defense, encumbrance, hard points); each one's output is
 *       'armor' (craftStore.outputOf, read off the profile by ItemResolve.isArmorRecord).
 *   K2  (C2) a finished Combat Armor with Extra Soak and Extra Melee Defense lands in equipment.gear as {_inline} with
 *       `built_with`; equipment.armor is untouched by the craft; after a reload the SHEET lists it as a SPARE suit
 *       (sheetPool.resolveSheetEquipment: `_armorSpare`, section armor) reading soak 3 and melee defence 1.
 *   K3  (C2, R-ASS-1) WEAR — the sheet's own act, sliced from player/app.jsx's SheetPack — swaps it ON: equipment.armor is
 *       the crafted record, worn, and the old suit goes to the pack carried; the sheet reads the worn soak 3. WEAR back:
 *       the crafted suit returns to the pack and, after a reload, is still a spare with its `built_with`.
 *   K4  (C2) a FAILED check lands nothing (Keeping the Peace printed 91: "the materials are lost").
 *   K5  (C2, C6) Duplicate (extra_copy) lands TWO spare entries, each its own copy (an edit to one never reaches the other).
 *   K6  (Q3a) a row may be bought again: Crafting.applyCraftingSpend applies a repeated id twice (Extra Hard Point x2 → +2
 *       hard points); takeAgain buys a second; a THIRD is refused by limits.max_count 2 (takeAgain unchanged,
 *       spendLedger leaves it unpaid, buildItem THROWS); dropOne returns one. Extra Soak (once only) refuses a second.
 *   K7  (C9, B-1473) lightsaber_two_handed's limits.not_for: on the Pole hilt (two-handed base) toggleRow and takeAgain
 *       refuse it, eligible says no, spendLedger leaves it unpaid, buildItem THROWS; on the Standard hilt it is bought and
 *       builds (its "reads 7 with Ilum" is release_r5_crafting_lightsaber's T1).
 *   BITES: an applier that skips a repeated id reds K6; a limitOf that ignores max_count reds K6; one that ignores
 *       not_for reds K7; an isArmorRecord that never says armour reds K1 and K2 (the sheet's spare branch).
 *
 * Run: node test/release_r5_crafting_armor.cjs → exit 0 when every leg holds and every bite bites.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (p) => JSON.parse(read(p));
const TPL = J('public/data/canonical/crafting_templates.json').templates;
const SPEND = J('public/data/canonical/crafting_spend.json');
const byId = (doc, key) => { const v = doc[key]; const o = {}; (Array.isArray(v) ? v : Object.values(v || {})).forEach((r) => { o[r.id] = r; }); return o; };
const ARMOR = byId(J('public/data/canonical/armor.json'), 'armor');
const GEAR = byId(J('public/data/canonical/gear.json'), 'gear');
const AREG = byId(J('public/data/canonical/attachments.json'), 'attachments');
const SWItems = require(path.join(ROOT, 'lib/items.js')).SWItems;

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
};
const bite = (label, holds) => {
  if (!holds) console.log('  PASS  BITE: ' + label);
  else { failures += 1; console.error('  FAIL  BITE: ' + label + ' — the leg still held'); }
};
const reload = (x) => JSON.parse(JSON.stringify(x));
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

// ── the shared modules from source strings, in their own directory (a mutant never touches the tree) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5kp-'));
let nth = 0;
const SRC = { store: read('lib/shared/craftStore.js'), crafting: read('lib/shared/crafting.js'), ir: read('lib/shared/itemResolve.js'),
              pool: read('lib/shared/sheetPool.js') };
function slice(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name + ' in the source');
  const rest = src.slice(at);
  return rest.slice(0, rest.indexOf('\nfunction ', 1));
}
function modsFrom(over) {
  const s = Object.assign({}, SRC, over || {});
  const dir = path.join(tmp, String(nth++));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'itemResolve.js'), s.ir);
  fs.writeFileSync(path.join(dir, 'crafting.js'), s.crafting.split("'../../public/data/canonical/").join("'" + path.join(ROOT, 'public/data/canonical').replace(/'/g, "\\'") + '/'));
  fs.writeFileSync(path.join(dir, 'craftStore.js'), s.store);
  const IR = require(path.join(dir, 'itemResolve.js'));
  // the SHEET's resolver (sheetPool.js), in a world whose registries are the shipped catalogue
  const win = { ItemResolve: IR, SWItems, SWRPGItemRegistries: { forStampSync: () => ({ weapons: {}, armor: ARMOR, gear: GEAR, attachments: AREG }) } };
  const ctx = vm.createContext({ window: win, Object, Array, JSON, Number, String, Math, console });
  vm.runInContext(['sheetItemRegistries', 'deriveItemState', 'resolveSheetEquipment'].map((n) => slice(s.pool, n)).join('\n')
    + '\nthis.SP = { resolveSheetEquipment: resolveSheetEquipment };', ctx);
  return { Craft: require(path.join(dir, 'craftStore.js')), Crafting: require(path.join(dir, 'crafting.js')), IR, SP: ctx.SP };
}
function cut(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('bite found nothing to cut: ' + a);
  return src.replace(a, b);
}

// ── WEAR: the sheet's own act, sliced from SheetPack (player/app.jsx), its closure handed in ──
const APP = read('player/app.jsx');
const WEAR_SRC = (() => {
  const a = APP.indexOf('  function wear(spareIdx) {');
  if (a < 0) throw new Error('no WEAR act in SheetPack');
  return APP.slice(a, APP.indexOf('\n  }\n', a) + 4);
})();
function wear(equipment, spareIdx) {
  let out = null;
  const fn = new Function('persistedEq', 'patch', 'setSelected', WEAR_SRC + '\nreturn wear;')(equipment, (u) => { out = u; }, () => {});
  fn(spareIdx);
  return out ? out.equipment : equipment;
}

const EQ = { weapons: [], armor: { id: 'heavy_clothing', state: 'worn' }, gear: [{ id: 'stimpack', qty: 1 }], credits: 0 };
const project = (M, t, imp, roll, flaws) => Object.assign(M.Craft.newProject(t.id, t.category, []),
  { stage: 'spending', roll: roll || { su: 2 }, improvements: imp || [], flaws: flaws || [] });
const sheet = (M, eq) => M.SP.resolveSheetEquipment(eq, { name: 'T', mods: [], equipment: eq });

// ── K1 ──
const PAGE = [   // Table 3-1, printed 90, read off the page image (brief release-r5-crafting-kp-c0 F1)
  ['armor_reinforced_clothing', 25, 0, false, 'average', ['mechanics', 'survival'], 6, 1, 0, 1, 0],
  ['armor_light', 250, 0, false, 'average', ['mechanics', 'survival'], 12, 2, 0, 2, 0],
  ['armor_customizable', 500, 4, false, 'average', ['mechanics'], 16, 1, 0, 4, 4],
  ['armor_deflective', 500, 5, false, 'average', ['mechanics'], 24, 1, 1, 2, 1],
  ['armor_combat', 1250, 4, false, 'hard', ['mechanics'], 48, 2, 0, 4, 3],
  ['armor_segmented', 2500, 6, true, 'daunting', ['mechanics'], 72, 2, 1, 6, 4],
  ['armor_augmentative', 4500, 8, true, 'formidable', ['mechanics'], 120, 2, 2, 6, 6],
];
function legK1(M) {
  const ids = Object.keys(TPL).filter((id) => TPL[id].category === 'armor');
  const bad = [];
  if (JSON.stringify(ids) !== JSON.stringify(PAGE.map((r) => r[0]))) bad.push('order ' + ids.join(','));
  PAGE.forEach(([id, price, rar, r, diff, skills, hours, soak, def, enc, hp]) => {
    const t = TPL[id] || {}, rp = t.result_profile || {};
    const got = [t.material_price, t.material_rarity, t.restricted, (t.check || {}).difficulty, JSON.stringify((t.check || {}).skills),
      (t.time || {}).hours, rp.soak, rp.defense, rp.encumbrance, rp.hardpoints];
    const want = [price, rar, r, diff, JSON.stringify(skills), hours, soak, def, enc, hp];
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(id + ' ' + JSON.stringify(got));
    if (M.Craft.outputOf(t) !== 'armor') bad.push(id + ' outputOf ' + M.Craft.outputOf(t));
  });
  return bad;
}

// ── K2 + K3 ──
function legK2(M) {
  const t = TPL.armor_combat, index = M.Craft.indexSpend(SPEND, 'armor');
  const p = project(M, t, ['armor_extra_soak', 'armor_extra_melee_defense']);
  const land = M.Craft.landingOf(p, t, index, reload(EQ), {});
  const eq = land && reload(land.equipment);
  const entry = eq && eq.gear[eq.gear.length - 1];
  const s = eq && sheet(M, reload(eq));
  const spare = s && s.gear[s.gear.length - 1];
  return {
    lands: !!(entry && entry._inline && entry._inline.name === 'Combat Armor' && eq.weapons.length === 0 && eq.gear.length === 2),
    builtWith: !!(entry && JSON.stringify(entry._inline.built_with) === '["armor_extra_soak","armor_extra_melee_defense"]'),
    wornUntouched: !!(eq && JSON.stringify(eq.armor) === JSON.stringify(EQ.armor)),
    spare: !!(spare && spare._armorSpare === true && spare.section === 'armor' && spare.soak === 3),
    melee: !!(entry && entry._inline.defense_melee === 1 && entry._inline.defense_ranged === 0),
    eq, d: { entry: entry && entry._inline, spare: spare && { name: spare.name, spare: spare._armorSpare, soak: spare.soak, type: spare.type } },
  };
}
function legK3(M, eq0) {
  const on = reload(wear(reload(eq0), eq0.gear.length - 1));
  const s1 = sheet(M, reload(on));
  const wornOk = !!(on.armor && on.armor._inline && on.armor._inline.name === 'Combat Armor' && on.armor.state === 'worn'
    && s1.armor && s1.armor.soak === 3);
  const oldPacked = on.gear.findIndex((g) => g && g.id === 'heavy_clothing' && g.state === 'carried');
  const back = reload(wear(reload(on), oldPacked));
  const s2 = sheet(M, reload(back));
  const crafted = back.gear.find((g) => g && g._inline && g._inline.name === 'Combat Armor');
  const sp = s2.gear.find((g) => g && g.name === 'Combat Armor');
  const backOk = !!(back.armor && back.armor.id === 'heavy_clothing' && crafted && crafted._inline.built_with.length === 2
    && sp && sp._armorSpare === true);
  return { wornOk, oldPacked: oldPacked >= 0, backOk, d: { worn: on.armor, back: back.armor, spare: sp && sp._armorSpare } };
}

// ── K4, K5 ──
function legK4(M) {
  const t = TPL.armor_light, index = M.Craft.indexSpend(SPEND, 'armor');
  return M.Craft.landingOf(project(M, t, [], { su: 0, fa: 2 }), t, index, reload(EQ), {}) === null;
}
function legK5(M) {
  const t = TPL.armor_reinforced_clothing, index = M.Craft.indexSpend(SPEND, 'armor');
  const land = M.Craft.landingOf(project(M, t, ['armor_duplicate']), t, index, reload(EQ), {});
  const eq = land && land.equipment;
  const two = eq && eq.gear.filter((g) => g && g._inline && g._inline.name === 'Reinforced Clothing');
  if (!two || two.length !== 2 || land.copies !== 2) return { ok: false, d: { copies: land && land.copies, n: two && two.length } };
  two[0]._inline.nickname_probe = 'x';
  return { ok: two[1]._inline.nickname_probe === undefined && !two.some((g) => g.qty), d: null };
}

// ── K6 ──
function legK6(M) {
  const t = TPL.armor_customizable, index = M.Craft.indexSpend(SPEND, 'armor');
  const rows = {}; Object.keys(index).forEach((k) => { rows[k] = index[k].row; });
  const base = M.Crafting.applyTemplateEffects(t.result_profile, t, null, { kind: 'armor' });
  const twice = M.Crafting.applyCraftingSpend(base, ['armor_extra_hard_point', 'armor_extra_hard_point'], rows, { kind: 'armor' }).profile;
  const applierTwice = twice.hardpoints === base.hardpoints + 2;
  let p = project(M, t, []);
  p = M.Craft.takeAgain(p, 'armor_extra_hard_point', index, base);
  p = M.Craft.takeAgain(p, 'armor_extra_hard_point', index, base);
  const two = JSON.stringify(p.improvements) === '["armor_extra_hard_point","armor_extra_hard_point"]';
  const p3 = M.Craft.takeAgain(p, 'armor_extra_hard_point', index, base);
  const thirdRefused = p3 === p;
  const three = ['armor_extra_hard_point', 'armor_extra_hard_point', 'armor_extra_hard_point'];
  const led = M.Craft.spendLedger(three, index, { ad: 9 }, undefined, base);
  const ledgerOk = led.paid.length === 2 && led.unpaid.length === 1;
  const buildThrows = throws(() => M.Craft.buildItem(Object.assign(project(M, t, three)), t, index, {}));
  const builtTwo = M.Craft.buildItem(p, t, index, {}).record.hardpoints === t.result_profile.hardpoints + 2;
  const dropped = JSON.stringify(M.Craft.dropOne(p, 'armor_extra_hard_point', index).improvements) === '["armor_extra_hard_point"]';
  let q = M.Craft.takeAgain(project(M, t, []), 'armor_extra_soak', index, base);
  const onceOk = M.Craft.takeAgain(q, 'armor_extra_soak', index, base) === q;
  return { ok: applierTwice && two && thirdRefused && ledgerOk && buildThrows && builtTwo && dropped && onceOk,
           d: { applierTwice, two, thirdRefused, ledgerOk, buildThrows, builtTwo, dropped, onceOk } };
}

// ── K7 ──
function legK7(M) {
  const index = M.Craft.indexSpend(SPEND, 'lightsaber');
  const row = index.lightsaber_two_handed.row;
  const pole = TPL.lightsaber_pole, std = TPL.lightsaber_standard;
  const poleBase = M.Crafting.applyTemplateEffects(pole.result_profile, pole, null, { kind: 'weapon' });
  const stdBase = M.Crafting.applyTemplateEffects(std.result_profile, std, null, { kind: 'weapon' });
  const p = project(M, pole, []);
  const toggleRefused = M.Craft.toggleRow(p, 'lightsaber_two_handed', index, poleBase) === p;
  const againRefused = M.Craft.takeAgain(p, 'lightsaber_two_handed', index, poleBase) === p;
  const notEligible = M.Craft.eligible(row, undefined, poleBase, 0) === false;
  const led = M.Craft.spendLedger(['lightsaber_two_handed'], index, { ad: 9, tr: 9 }, undefined, poleBase);
  const unpaid = led.unpaid.length === 1;
  const buildThrows = throws(() => M.Craft.buildItem(project(M, pole, ['lightsaber_two_handed']), pole, index, {}));
  const ps = M.Craft.toggleRow(project(M, std, []), 'lightsaber_two_handed', index, stdBase);
  const stdBought = JSON.stringify(ps.improvements) === '["lightsaber_two_handed"]';
  const stdBuilds = !throws(() => M.Craft.buildItem(ps, std, index, {}));
  return { ok: toggleRefused && againRefused && notEligible && unpaid && buildThrows && stdBought && stdBuilds,
           d: { toggleRefused, againRefused, notEligible, unpaid, buildThrows, stdBought, stdBuilds } };
}

const M0 = modsFrom();
const k1 = legK1(M0);
check('K1 the 7 armour templates are Table 3-1 (printed 90), in the page\'s order, each landing as armour', k1.length === 0, k1);
const K2 = legK2(M0);
check('K2 a finished Combat Armor lands in equipment.gear as {_inline}, nothing in weapons', K2.lands, K2.d);
check('K2 its record carries built_with (Extra Soak, Extra Melee Defense)', K2.builtWith, K2.d);
check('K2 equipment.armor is untouched by the craft', K2.wornUntouched, K2.eq && K2.eq.armor);
check('K2 after a reload the sheet lists it as a SPARE suit (PROTECTION, WEAR) reading soak 3', K2.spare, K2.d);
check('K2 Extra Melee Defense raises melee defence only (1 / 0)', K2.melee, K2.d);
const K3 = K2.eq ? legK3(M0, K2.eq) : { wornOk: false, oldPacked: false, backOk: false };
check('K3 WEAR puts the crafted suit on (equipment.armor = its record, worn; the sheet reads soak 3)', K3.wornOk, K3.d);
check('K3 the suit it replaced goes to the pack, carried', K3.oldPacked, K3.d);
check('K3 WEAR back: the crafted suit returns to the pack, still a spare with its built_with, after a reload', K3.backOk, K3.d);
check('K4 a FAILED check lands nothing', legK4(M0));
const K5 = legK5(M0);
check('K5 Duplicate lands two spare entries, each its own copy, never qty', K5.ok, K5.d);
const K6 = legK6(M0);
check('K6 a row bought again stacks; Extra Hard Point stops at 2 (takeAgain, spendLedger, buildItem); Extra Soak at 1', K6.ok, K6.d);
const K7 = legK7(M0);
check('K7 Two-Handed is refused on the Pole hilt by every path, and bought on the Standard hilt', K7.ok, K7.d);

// ── BITES ──
bite('an applier that skips a repeated id reds K6', legK6(modsFrom({ crafting: cut(SRC.crafting,
  "(Array.isArray(rowIds) ? rowIds : []).forEach(function (id) {",
  "(Array.isArray(rowIds) ? rowIds : []).filter(function (x, i, a) { return a.indexOf(x) === i; }).forEach(function (id) {") })).ok);
bite('a limitOf that ignores max_count reds K6', legK6(modsFrom({ store: cut(SRC.store,
  "if (lim.max_count != null && n >= lim.max_count)", 'if (false)') })).ok);
bite('a limitOf that ignores not_for reds K7', legK7(modsFrom({ store: cut(SRC.store,
  'if (base && Array.isArray(lim.not_for)) {', 'if (false) {') })).ok);
const MNA = modsFrom({ ir: cut(SRC.ir, "return !!rec && typeof rec === 'object' && !rec.damage && (rec.soak != null || Number(rec.defense) >= 1);", 'return false;') });
bite('an isArmorRecord that never says armour reds K1', legK1(MNA).length === 0);
bite('an isArmorRecord that never says armour reds K2 (the sheet\'s spare branch)', legK2(MNA).spare);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
