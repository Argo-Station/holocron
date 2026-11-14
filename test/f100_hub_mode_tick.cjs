#!/usr/bin/env node
/**
 * f100_hub_mode_tick.cjs — STANDING guard: the dice hub's MODE tick path (ruling `f100-surfacing-hub-concept` R-SHC-4;
 * ADDENDUM 6 OWNS "takeOffers and the mode tick path" + ACCEPTANCE (6); the mark is the implementer's, briefed §5 and ruled
 * by ADDENDUM 7: `limit: 'mode'`).
 *
 *   M1  modeOffers (lib/shared/qualityRows.js) marks every row of a mode `limit: 'mode'` with ONE id `mode:<id>`, and the
 *       mode's `key` equals poolMods.offerKey of each of its rows (one tick takes the whole mode).
 *   M2  the Heavy Blaster Rifle's Auto-fire through computeWeaponPool (M12's key ON), UNTICKED: the pool's difficulty is the
 *       range's own (no Auto-fire change recorded) — an unticked mode applies NOTHING.
 *   M3  TICKED (taken = { <mode key>: true }): +1 difficulty, the change recorded as taken from "Auto-fire".
 *   M4  the row's offers (diceHubWeaponReminders' list = spec.qualityMods) never carry a mode row — the MODE tick draws it.
 *   M5  the Blaster Rifle's Stun setting: a mode with no dice still has its key and its words; ticked, the range is capped at
 *       Short and the difficulty is Short's (R7 B-1454, re-pointed by ruling release-r7-bug-burndown ADDENDUM 170 F2: "their
 *       range changes to short and cannot be increased", EotE p.157).
 *   M6  the MODE tag is the mark: ui.jsx offerTags of a mode row reads ['mode'].
 *   (post1-switch-deletion, ADDENDUM 638: M12's key is gone; M7 (the key OFF) went with it, table 3.)
 *   BITE B1: modeOffers without the mark → M2 red (the unticked mode folds +1 difficulty).
 *
 * Run: node test/f100_hub_mode_tick.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const payload = (o, k) => (o[k] && typeof o[k] === 'object') ? o[k] : o;
const byId = (o) => Array.isArray(o) ? Object.fromEntries(o.map((r) => [r.id, r])) : o;
let failures = 0;
const check = (ok, m, detail) => { if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 500) : '')); } };
function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — the source moved; fix the slice, never retype the function.');
  let k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}
function sliceBetween(src, from, to) {
  const i = src.indexOf(from), j = src.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error('SLICE MISS: ' + from);
  return src.slice(i, j);
}

const W = byId(payload(J('weapons.json'), 'weapons')), A = byId(payload(J('armor.json'), 'armor')), G = byId(payload(J('gear.json'), 'gear'));
const ATT = byId(payload(J('attachments.json'), 'attachments'));
const QV = J('qualities.vocab.json');
const skills = J('skills.vocab.json').entries;
const APP = read('player/app.jsx'), UIX = read('lib/shared/ui.jsx');
// D-507 (handoff `encounters-e3-dicehub-move`): resolveWeaponSkillKey and computeWeaponPool moved VERBATIM with DiceHub's
// closure to lib/shared/diceHub.jsx — sliced from there by name
const HUB = read('lib/shared/diceHub.jsx');
const CORES = ['lib/items.js', 'lib/shared/effectClass.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
  'lib/shared/poolMods.js', 'lib/shared/qualityRows.js', 'lib/shared/itemResolve.js', 'lib/shared/sheetPool.js'];

function build(o) {
  o = o || {};
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
  vm.createContext(sb);
  for (const f of CORES) {
    sb.module = { exports: {} };
    vm.runInContext(o[f] ? o[f](read(f)) : read(f), sb, { filename: f });
    if (f === 'lib/shared/effectClass.js') sb.SWRPGEffectClass = sb.SWRPGEffectClass || sb.module.exports;
  }
  const cb = { talents: payload(J('talents.json'), 'talents'), species: payload(J('species.json'), 'species'),
    specializations: payload(J('specializations.json'), 'specializations'), careers: payload(J('careers.json'), 'careers'), skillSheetKeys: {}, skillChars: {} };
  skills.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });
  sb._canonicalCharbuild = cb;
  sb._canonicalRegistries = { skills: skills };
  sb.SWRPGItemRegistries = { forStampSync: () => ({ weapons: W, armor: A, gear: G, attachments: ATT }) };
  sb._qualitiesDb = (() => { const m = {}; (QV.entries || []).forEach((q) => { m[q.label.toLowerCase()] = q; (q.aliases || []).forEach((a) => { m[String(a).toLowerCase()] = q; }); }); return m; })();
  vm.runInContext([
    sliceBetween(APP, '// ── BEGIN SHEETPOOL BINDINGS', '// ── END SHEETPOOL BINDINGS'),
    sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
    sliceDecl(HUB, 'function resolveWeaponSkillKey(rawSkill)'),
    sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)'),
    sliceDecl(UIX, 'function offerTags(m, talents)'),
  ].join('\n') + '\nglobalThis.__A = { computeWeaponPool, resolveSheetEquipment, offerTags };', sb, { filename: 'slices' });
  return sb;
}
// Brawn 3: the rifle's Cumbersome 3 adds nothing, so the difficulty is the range's own plus the mode alone
const CHARS = { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 };
const sheetOf = (ids) => ({ characteristics: Object.assign({}, CHARS), skills: { RANGHVY: 1 }, talents: [],
  equipment: { weapons: ids.map((id) => ({ id, qty: 1, state: 'carried', attachments: [] })), armor: null, gear: [], credits: 0 } });
function poolOf(sb, id, taken) {
  const sheet = sheetOf([id]), eq = sb.__A.resolveSheetEquipment(sheet.equipment, sheet);
  const spec = sb.__A.computeWeaponPool(sheet, eq.weapons[0], null, { forceRating: 0 }, '#fff', eq, taken);
  return { spec, changes: spec._poolModChanges || [] };
}
const fromMode = (r) => r.changes.filter((c) => c.source === 'Auto-fire');

console.log('F-100 surfacing hub · the MODE tick path (R-SHC-4)');
const sb = build(), P = sb.SWRPGPoolMods;

const u = poolOf(sb, 'heavy_blaster_rifle');
const af = (u.spec.modes || []).filter((m) => m.quality === 'auto_fire')[0];
check(af && af.poolRows.length === 1 && af.poolRows.every((r) => r.limit === 'mode' && r.id === 'mode:' + af.modeId && P.offerKey(r) === af.key),
  `M1 Auto-fire's rows carry the mark (limit 'mode', id 'mode:${af && af.modeId}') and share the mode's key "${af && af.key}"`, af);
const printed = u.spec.rangeDifficulty;
check(u.spec.difficulty === printed && fromMode(u).length === 0,
  `M2 UNTICKED Auto-fire applies nothing: difficulty ${u.spec.difficulty} = the range's ${printed}, ${fromMode(u).length} Auto-fire changes`, u.changes);
const t = poolOf(sb, 'heavy_blaster_rifle', af ? { [af.key]: true } : {});
check(t.spec.difficulty === printed + 1 && fromMode(t).length === 1 && fromMode(t)[0].taken === true,
  `M3 TICKED: difficulty ${t.spec.difficulty} (${printed + 1}), the change taken from Auto-fire`, fromMode(t));
check(!(u.spec.qualityMods || []).some((m) => m.limit === 'mode' || /^mode:/.test(String(m.id || ''))),
  `M4 the row's offer list (spec.qualityMods, ${(u.spec.qualityMods || []).length} rows) carries no mode row`);
const s = poolOf(sb, 'blaster_rifle'), st = (s.spec.modes || [])[0];
const sT = st ? poolOf(sb, 'blaster_rifle', { [st.key]: true }) : null;
check(st && st.quality === 'stun_setting' && st.poolRows.length === 0 && st.key === 'i:' + st.source + ':mode:' + st.modeId && st.words &&
  sT && sT.spec.rangeCap === 'Short' && sT.spec.rangeDifficulty === 1 && s.spec.rangeDifficulty > 1 &&
  sT.spec.difficulty === s.spec.difficulty - s.spec.rangeDifficulty + 1 && sT.changes.length === s.changes.length,
  `M5 Stun setting: key "${st && st.key}", words “${st && st.words}”, no dice — ticked, the range is capped at Short (rangeCap ${sT && sT.spec.rangeCap}) and the difficulty is Short's (${s.spec.rangeDifficulty} → ${sT && sT.spec.rangeDifficulty})`);
check(af && JSON.stringify(sb.__A.offerTags(af.poolRows[0])) === '["mode"]', `M6 the MODE tag is the mark: offerTags → ${af && JSON.stringify(sb.__A.offerTags(af.poolRows[0]))}`);

{
  const MARK = "id: id, mode: m.id, limit: 'mode', ";
  if (read('lib/shared/qualityRows.js').indexOf(MARK) === -1) check(false, 'B1 bite: the mark moved — re-point the bite, never drop it');
  else {
    const b = poolOf(build({ 'lib/shared/qualityRows.js': (x) => x.replace(MARK, 'id: id, mode: m.id, ') }), 'heavy_blaster_rifle');
    check(b.spec.difficulty === printed + 1, `B1 BITE: modeOffers without the mark — unticked reads difficulty ${b.spec.difficulty}, so M2 discriminates`);
  }
}

console.log(failures ? `\n  f100_hub_mode_tick: ${failures} FAIL` : '\n  f100_hub_mode_tick: all PASS');
process.exit(failures ? 1 : 0);
