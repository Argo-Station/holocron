/**
 * F-100 M7 · R-M7G-8 — the composers' BEHAVIOUR: three pool composers roll the shared characteristic.
 *
 * WHY THIS FILE EXISTS. Ruling `f100-m7-build` §3's mutation stroke turned `computeWeaponPool`'s `_sc.characteristic`
 * into `_sc.base` and EVERY instrument stayed green: composer 2 was pinned only by a source regex (engine I6). A
 * lightsaber attack under Renegade Form would have rolled Brawn again and nothing would have said so. This file
 * EXECUTES the shipped composers on the community case and reads the characteristic each one rolls.
 *
 * THE COMMUNITY CASE (acceptance 4): a Force-Sensitive Outcast owning Secrets of the Force and Renegade Form, Agility
 * picked in the pick map (R-M7K-3), Agility 3 above Brawn 2. The shared answer (CharResolve.skillCharacteristic,
 * best-of, R-M7K-10) is Agility for Lightsaber. Each leg has a CONTROL with the pick removed, where the same composer
 * must fall back to Brawn — so a composer hard-wired to Agility cannot pass either.
 *
 *   W  computeWeaponPool (lib/shared/diceHub.jsx): a Lightsaber weapon's `characteristic` is the Agility value.
 *   H  diceHubSkillRow (lib/shared/diceHub.jsx, the dice hub's trained-skill row): the LTSAB row's `cv` is the Agility value.
 *   C  craftPoolOf (player/app.jsx, the workshop's check pool): a Lightsaber check reads `charKey` AG. The live
 *      crafting templates name only Mechanics and Survival, which no applied op touches, so the leg drives the
 *      sheet key LTSAB through the same function; the shared read is the line under test.
 *   S  The components call these functions — the hoisted composers are the ones that render, not dead copies.
 *   A  R-M7G-9 — the charbuild ABSENT (before the vocabulary loads): sheetPoolOf, computeWeaponPool, diceHubSkillRow
 *      and craftPoolOf return null, never a pool drawn from a characteristic of 0 or a blank; yardCharPool passes the
 *      null on; the hub drops both kinds of row, and the workshop holds its existing "Loading the workshop…" state.
 *      The two PDFs' wait is a browser leg (scripts/f100_m7_pdf_wait_browser.py), since only a page runs them.
 *
 * Shared cores load whole, as both hosts load them; the app's own SHEETPOOL BINDINGS block is executed verbatim, so
 * each composer reads the names the app binds. Bitten by `_sc.characteristic` → `_sc.base` in each composer (gate
 * ADDENDUM 2).
 *
 * Run: node test/f100_m7_composers.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (p) => JSON.parse(read(p));
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const APP = read('player/app.jsx');
// D-507 (handoff `encounters-e3-dicehub-move`): resolveWeaponSkillKey, computeWeaponPool, diceHubSkillRow and DiceHub moved
// VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx — sliced from there by name; the workshop's stay in player/app.jsx
const HUB = read('lib/shared/diceHub.jsx');
// A header that ends in '{' opens the body there (a component's destructured props hold the first '{').
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

// ── the app's slices: its own binding block, then the composers and what they call ──
vm.runInContext([
  sliceBetween(APP, '// ── BEGIN SHEETPOOL BINDINGS', '// ── END SHEETPOOL BINDINGS'),
  sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
  sliceDecl(HUB, 'function resolveWeaponSkillKey(rawSkill)'),
  sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)'),
  sliceDecl(HUB, 'function diceHubSkillRow(sheet, k)'),
  sliceDecl(APP, 'const CRAFT_DIFF_DICE = {') + ';',
  sliceDecl(APP, 'const CRAFT_SKILL_KEY = {') + ';',
  sliceDecl(APP, 'const CRAFT_CHAR_PROP = {') + ';',
  sliceDecl(APP, 'function craftSkillKey(canonId)'),
  sliceDecl(APP, 'function craftPoolOf(sheet, t, canonId)'),
].join('\n') + '\nglobalThis.__C = { computeWeaponPool: computeWeaponPool, diceHubSkillRow: diceHubSkillRow, craftPoolOf: craftPoolOf };',
  sb, { filename: 'app.jsx-slices' });
const C = sb.__C, SP = sb.SWRPGSheetPool;

const cellOf = (specId, tid) => {
  const tree = cb.specializations[specId].talent_tree || [];
  for (let r = 0; r < tree.length; r++) for (let c = 0; c < ((tree[r] && tree[r].talents) || []).length; c++) if (tree[r].talents[c] && tree[r].talents[c].talent === tid) return r + '-' + c;
  return null;
};
const FSO = 'force_sensitive_outcast';
const SOTF = cellOf(FSO, 'secrets_of_the_force'), REN = cellOf(FSO, 'renegade_form');
const community = (picked) => ({
  name: 'Community case', career: 'Bounty Hunter', careerId: 'bounty_hunter', species: 'Human', speciesId: 'human',
  specializations: [{ id: FSO, owned: [SOTF, REN] }],
  talentCharacteristicChoices: picked ? { [FSO]: { [REN]: 'agility' } } : {},
  characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 }, skills: { LTSAB: 2 } });

console.log('F-100 M7 COMPOSERS (R-M7G-8, R-M7G-9)');
check(!!SOTF && !!REN, 'P0 the shipped Force-Sensitive Outcast tree carries Secrets of the Force and Renegade Form', SOTF + ' ' + REN);
const sc = sb.CharResolve.skillCharacteristic(community(true), 'LTSAB', cb);
check(sc && sc.characteristic === 'agility' && sc.base === 'brawn', 'P1 the shared answer for the community case: Lightsaber rolls Agility (base Brawn)', JSON.stringify(sc));

// ── W. computeWeaponPool ──
const SABER = { name: 'Lightsaber', skill: 'lightsaber', range: 'engaged', damage: { value: 10, base: 'flat' }, crit: 1, qualities: [] };
const EQ = { weapons: [], armor: null, gear: [] };
const wp = (s) => C.computeWeaponPool(s, SABER, 'Engaged', { forceRating: 1, brawn: 2 }, '#fff', EQ);
const w1 = wp(community(true)), w0 = wp(community(false));
check(w1.characteristic === 3 && w1.skillRank === 2, 'W1 a Lightsaber attack rolls the Agility value (3), rank 2', JSON.stringify({ characteristic: w1.characteristic, skillRank: w1.skillRank }));
check(w0.characteristic === 2, 'W2 control — no pick: the same attack rolls Brawn (2)', String(w0.characteristic));

// ── H. the dice hub's trained-skill row ──
const h1 = C.diceHubSkillRow(community(true), 'LTSAB'), h0 = C.diceHubSkillRow(community(false), 'LTSAB');
check(h1.cv === 3 && h1.rank === 2 && h1.name === 'Lightsaber', 'H1 the hub\'s Lightsaber row reads the Agility value (3), rank 2', JSON.stringify(h1));
check(h0.cv === 2, 'H2 control — no pick: the row reads Brawn (2)', JSON.stringify(h0));

// ── C. the workshop's check pool ──
const T = { check: { skills: ['LTSAB'], difficulty: 'average' } };
const c1 = C.craftPoolOf(community(true), T, 'LTSAB'), c0 = C.craftPoolOf(community(false), T, 'LTSAB');
check(c1.charKey === 'AG' && c1.charVal === 3 && c1.rank === 2, 'C1 a Lightsaber check in the workshop reads AG, value 3', JSON.stringify(c1));
check(c0.charKey === 'BR' && c0.charVal === 2, 'C2 control — no pick: the workshop reads BR, value 2', JSON.stringify(c0));
const cm = C.craftPoolOf(community(true), { check: { skills: ['mechanics'], difficulty: 'hard' } }, 'mechanics');
check(cm.charKey === 'INT' && cm.diff === 3, 'C3 a live template\'s Mechanics check still reads INT, Hard (3)', JSON.stringify(cm));

// ── S. the components call the hoisted composers ──
const hub = sliceDecl(HUB, 'function DiceHub({ sheet, accent, onClose, initialStrip, committed: committedProp, onCommit, onChoosePick, treat, onTreated, given }) {'),
  ws = sliceDecl(APP, 'function CraftWorkshop({ sheet, accent, onSheetChange }) {');
check(/\.map\(function \(k\) \{ return diceHubSkillRow\(sheet, k(, committedProp)?\); \}\)/.test(hub) && !/sheetSkillCharacteristic\(/.test(hub),
  'S1 DiceHub builds its trained rows through diceHubSkillRow, and reads no characteristic itself');
// (re-pointed by name, f100-surfacing-force-flip: the hub hands the row the session's committed Force set, E-FFL-4)
check(/function craftPool\(t, canonId\) \{ return craftPoolOf\(sheet, t, canonId\); \}/.test(ws) && !/sheetSkillCharacteristic\(/.test(ws),
  'S2 CraftWorkshop\'s craftPool is craftPoolOf over its sheet, and reads no characteristic itself');

// ── A. R-M7G-9: the charbuild ABSENT ──
{
  const s = community(true);
  check(!!SP.sheetPoolOf(s, 'LTSAB'), 'A0 control — loaded: sheetPoolOf draws the Lightsaber pool');
  sb._canonicalCharbuild = null;
  try {
    check(sb.SWRPGSheetPool.sheetSkillCharacteristic(s, 'LTSAB') === null, 'A1 absent: the shared read has no answer (null)');
    check(SP.sheetPoolOf(s, 'LTSAB') === null, 'A2 absent: sheetPoolOf → null (no pool from a characteristic of 0)', JSON.stringify(SP.sheetPoolOf(s, 'LTSAB')));
    check(SP.yardCharPool({ sheetData: s }, 'lightsaber', 0) === null, 'A3 absent: yardCharPool (the GM seat pool) → null');
    const w = C.computeWeaponPool(s, SABER, 'Engaged', { forceRating: 1, brawn: 2 }, '#fff', EQ);
    check(w === null, 'A4 absent: computeWeaponPool → null', w && JSON.stringify({ characteristic: w.characteristic }));
    const hr = C.diceHubSkillRow(s, 'LTSAB');
    check(hr === null, 'A5 absent: diceHubSkillRow → null', JSON.stringify(hr));
    const cp = C.craftPoolOf(s, { check: { skills: ['mechanics'], difficulty: 'average' } }, 'mechanics');
    check(cp === null, 'A6 absent: craftPoolOf → null (no INT/2 fallback before the vocabulary answers)', JSON.stringify(cp));
  } finally { sb._canonicalCharbuild = cb; }
  check(!!C.computeWeaponPool(s, SABER, 'Engaged', { forceRating: 1, brawn: 2 }, '#fff', EQ) && !!C.diceHubSkillRow(s, 'LTSAB') && !!C.craftPoolOf(s, T, 'LTSAB'),
    'A7 control — loaded again: each composer answers once the vocabulary is back');
  const hub = sliceDecl(HUB, 'function DiceHub({ sheet, accent, onClose, initialStrip, committed: committedProp, onCommit, onChoosePick, treat, onTreated, given }) {');
  check(/if \(!spec\) return null;/.test(hub) && /\}\)\.filter\(Boolean\);\n\n  \/\/ ── SKILLS ──/.test(hub) && /diceHubSkillRow\(sheet, k(, committedProp)?\); \}\)\s*\.filter\((Boolean|function \(r\) \{ return r && )/.test(hub),
    'A8 the hub drops a weapon row and a skill row that have no pool yet (it re-renders on useCanonicalReady)');
// (A8 re-pointed by name, f100-surfacing-force-flip E-FFL-4: the trained filter reads the row's committed rank, so the null row
// drops in the same filter — `r && (r.rank > 0 || …)`; kept: a row with no pool yet is dropped; dropped: the bare filter(Boolean))
  const ws = sliceDecl(APP, 'function CraftWorkshop({ sheet, accent, onSheetChange }) {');
  check(/var canonReady = useCanonicalReady\(\);/.test(ws) && /if \(!regs \|\| !Craft \|\| !canonReady \|\| !window\._canonicalCharbuild\) \{\n    return h\('div', \{ 'data-testid': 'craft-workshop'[^\n]*'Loading the workshop…'\);/.test(ws),
    'A9 the workshop holds "Loading the workshop…" until the charbuild is here');
}

console.log('\n  F-100 M7 composers: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
