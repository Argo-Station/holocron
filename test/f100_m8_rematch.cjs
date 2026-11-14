/*
 * f100_m8_rematch.cjs — F-100 M8 THE RE-MATCH (ruling `f100-m8-contracts` R-M8K-2 (iii), R-M8K-10 (ii); B-1065;
 * `f100-m8-build-card` §4 item 3).
 *
 * When a talent swaps the characteristic a skill rolls (M7's best-of) or the player switches it for one roll (the hub's
 * W3 switch), an item entry anchored to a CHARACTERISTIC must match the characteristic ROLLED, not the vocabulary's
 * base. Executes the shipped code: the shared cores in a vm, and the hub's named row builder `diceHubSkillSpec` sliced
 * from lib/shared/diceHub.jsx by name (never retyped; player/app.jsx before D-507).
 *
 *   (a) every characteristic anchor in the registries (8 entries, 16 anchors at this lap's base) matches through
 *       `contextFor(skill, index, characteristic)` on a skill whose base is NOT that characteristic, and does not without it;
 *   (b) `sheetPoolOf`'s best-of: Lightsaber swapped to Agility by Renegade Form takes the Enviro Suit's Agility setback;
 *   (c) the hub's switch: the same row switched back to Brawn for one roll drops it, and its reminders follow;
 *   (d) control: no swap, no setback (the base still matches as before);
 *   (e) the hub's weapon row (`diceHubWeaponReminders`): its reminders follow the best-of its pool rolls.
 * ITS BITE (scripts/canonical/f100_m8_bites.cjs): `contextFor` ignoring the passed characteristic.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fails = 0, passes = 0;
const check = (label, ok, detail) => { if (ok) { passes++; console.log('  PASS  ' + label); } else { fails++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); } };
function slice(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}

const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set, Symbol, Error };
sb.window = sb; sb.global = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {};
vm.createContext(sb);
for (const f of ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
  'lib/shared/poolMods.js', 'lib/shared/itemRegistries.js', 'lib/shared/sheetPool.js']) { sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f }); }
const vocab = J('skills.vocab.json').entries;
const REG = { weapons: J('weapons.json').weapons, armor: J('armor.json').armor, gear: J('gear.json').gear, attachments: J('attachments.json').attachments };
sb._canonicalRegistries = Object.assign({ skills: vocab }, REG);
const cb = { species: J('species.json').species, careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, skillSheetKeys: {}, skillChars: {}, skillNames: {} };
vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; cb.skillNames[e.id] = e.label; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });
sb._canonicalCharbuild = cb;
// D-507 (handoff `encounters-e3-dicehub-move`): the hub's row builders moved VERBATIM with DiceHub's closure to
// lib/shared/diceHub.jsx — sliced from there by name
const HUBSRC = read('lib/shared/diceHub.jsx');
vm.runInContext([
  'var SP = window.SWRPGSheetPool; var withPoolMods = SP.withPoolMods, poolModSkillIndex = SP.poolModSkillIndex, sheetSkillCharacteristic = SP.sheetSkillCharacteristic;',
  slice(HUBSRC, 'function diceHubRolledCharacteristic(row, using)'),
  slice(HUBSRC, 'function diceHubSkillSpec(sheet, row, poolMods, using, accent)'),
  slice(HUBSRC, 'function poolModRemindersFor(mods, skillKeyOrId, characteristic)'),
  slice(HUBSRC, 'function diceHubWeaponReminders(sheet, poolMods, spec)'),
  'globalThis.__hub = { diceHubSkillSpec: diceHubSkillSpec, poolModRemindersFor: poolModRemindersFor, diceHubWeaponReminders: diceHubWeaponReminders };',
].join('\n'), sb, { filename: 'diceHub.jsx-slices' });
const P = sb.SWRPGPoolMods, SP = sb.SWRPGSheetPool, D = sb.SWRPGDice, HUB = sb.__hub, IDX = SP.poolModSkillIndex();

console.log('F-100 M8 · THE RE-MATCH (B-1065)');

// ── (a) every characteristic anchor, through contextFor ─────────────────────────────────────────────────────────────
{
  const rows = [];
  Object.entries(REG).forEach(([kind, recs]) => Object.entries(recs).forEach(([id, r]) => (r.pool_mods || []).forEach((m) => {
    (m.applies_to || []).filter((a) => a.scope === 'characteristic').forEach((a) => rows.push({ kind, id, m, c: a.value }));
  })));
  const entries = new Set(rows.map((r) => r.kind + ':' + r.id)).size;
  check(`(a) harvest: characteristic anchors found (${rows.length} anchors on ${entries} entries) — a zero harvest is a FAILED run`, rows.length >= 16 && entries >= 8, { rows: rows.length, entries });
  const bad = [];
  rows.forEach((r) => {
    const mod = { appliesTo: r.m.applies_to };
    // a skill whose base is not r.c and which no OTHER anchor of this entry reaches
    const skill = vocab.find((e) => e.characteristic && e.characteristic !== r.c
      && !P.matches(mod, P.contextFor(e.id, IDX)));
    if (!skill) { bad.push(r.id + ' ' + r.c + ': no free skill'); return; }
    const swapped = P.matches(mod, P.contextFor(skill.id, IDX, r.c)), base = P.matches(mod, P.contextFor(skill.id, IDX));
    if (!(swapped && !base)) bad.push(`${r.kind}:${r.id} @${r.c} on ${skill.id}: swapped ${swapped}, base ${base}`);
  });
  check('(a) every characteristic anchor matches the ROLLED characteristic, and the base alone does not', bad.length === 0, bad);
  const plain = P.contextFor('LTSAB', IDX);
  check('(a) no characteristic passed → the vocabulary base, exactly as before', plain && plain.characteristic === 'brawn', plain);
}

// ── the character: M7's community case (Renegade Form, Agility picked) in an Enviro Suit ───────────────────────────────
const sp = cb.specializations.force_sensitive_outcast, cells = {};
(sp.talent_tree || []).forEach((row, r) => (row.talents || []).forEach((c, ci) => { if (c && !cells[c.talent]) cells[c.talent] = r + '-' + ci; }));
const sheetWith = (owned, armor) => ({ name: 'Rematch', career: 'Bounty Hunter', careerId: 'bounty_hunter', speciesId: 'human', species: 'Human',
  specializations: [{ id: sp.id, owned }], talentCharacteristicChoices: { [sp.id]: { [cells.renegade_form]: 'agility' } },
  characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 }, skills: { LTSAB: 1 },
  equipment: { weapons: [], armor: armor ? { id: armor, state: 'worn' } : null, gear: [], credits: 0 } });
const swapped = sheetWith([cells.renegade_form], 'enviro_suit'), plainSheet = sheetWith([], 'enviro_suit');
const modsOf = (sheet) => SP.collectPoolMods(SP.resolveSheetEquipment(sheet.equipment, sheet));

// ── (b) sheetPoolOf's best-of ────────────────────────────────────────────────────────────────────────────────────────
{
  const sc = SP.sheetSkillCharacteristic(swapped, 'LTSAB');
  check('(b) premise: Renegade Form rolls Lightsaber with Agility (best-of; base Brawn)', sc && sc.characteristic === 'agility' && sc.base === 'brawn', sc && { c: sc.characteristic, base: sc.base });
  const pool = SP.sheetPoolOf(swapped, 'LTSAB', modsOf(swapped));
  check('(b) sheetPoolOf: the Enviro Suit\'s Agility setback re-matches the swapped roll (1 setback)', pool && pool.setback === 1, pool);
  const yard = SP.yardCharPool({ sheetData: swapped }, 'lightsaber', 0);
  check('(b) the Yard\'s seat pool (yardCharPool → sheetPoolOf) agrees: 1 setback', yard && yard.setback === 1, yard);
}

// ── (c) the hub's switch ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const sc = SP.sheetSkillCharacteristic(swapped, 'LTSAB');
  const row = { key: 'LTSAB', cv: 3, rank: 1, sc };
  const mods = modsOf(swapped);
  const best = D.buildPool(HUB.diceHubSkillSpec(swapped, row, mods, null, ''));
  const brawn = D.buildPool(HUB.diceHubSkillSpec(swapped, row, mods, 'brawn', ''));
  check('(c) hub row, no switch: rolls Agility and takes the Agility setback', best.setback === 1 && best.ability + best.proficiency === 3, best);
  check('(c) hub row switched to Brawn for one roll: the Agility setback is gone', brawn.setback === 0 && brawn.ability + brawn.proficiency === 2, brawn);
  const conditioned = [{ source: 'Test Holo', die: 'boost', count: 1, direction: 'add', condition: 'when broadcasting', appliesTo: [{ scope: 'characteristic', value: 'agility' }] }];
  const remAg = HUB.poolModRemindersFor(conditioned, 'LTSAB', 'agility'), remBr = HUB.poolModRemindersFor(conditioned, 'LTSAB', 'brawn');
  check('(c) the reminders follow the rolled characteristic too', remAg.length === 1 && remBr.length === 0, { remAg, remBr });
}

// ── (d) control ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const pool = SP.sheetPoolOf(plainSheet, 'LTSAB', modsOf(plainSheet));
  check('(d) control: no swap → Lightsaber rolls Brawn, and the Agility setback does not apply', pool && pool.setback === 0, pool);
}

// ── (e) the hub's weapon row: its reminders are asked about the characteristic its pool rolls ───────────────────────
{
  const conditioned = [{ source: 'Test Holo', die: 'boost', count: 1, direction: 'add', condition: 'when broadcasting', appliesTo: [{ scope: 'characteristic', value: 'agility' }] }];
  const remSw = HUB.diceHubWeaponReminders(swapped, conditioned, { skillKey: 'LTSAB' });
  const remPl = HUB.diceHubWeaponReminders(plainSheet, conditioned, { skillKey: 'LTSAB' });
  check('(e) weapon row: Renegade Form\'s Agility roll brings the Agility reminder; without the swap (Brawn) it does not',
    remSw.length === 1 && remPl.length === 0, { remSw: remSw.length, remPl: remPl.length });
}

console.log(`\nf100_m8_rematch: ${passes} PASS · ${fails} FAIL`);
process.exit(fails ? 1 : 0);
