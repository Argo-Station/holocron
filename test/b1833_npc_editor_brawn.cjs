#!/usr/bin/env node
/*
 * b1833_npc_editor_brawn.cjs — B-1833: the custom-NPC fight editor's weapon rows and the armory picker print a weapon's
 * damage the way the finished NPC page prints it (ruling `release-r7-bug-burndown` ADDENDUM 694). Both read
 * `creatorNormWeapon` (lib/library/npc/view.jsx); the page reads `WeaponTable` → `SWItems.canonicalToStore`. Before the
 * fix the normalizer kept `damage.value` and dropped `base`, so the Force Pike (Brawn +3) read "Damage 3" in the editor
 * and "Damage +3" on its page (the FFG weapon-table convention, fad-ocr p.175 / eote p.169).
 *
 * The normalizer and the table are sliced from view.jsx by name and run over the shipped cores and the canonical weapons
 * registry. For EVERY registry weapon the normalizer's damage must equal the damage the page's table prints for it,
 * and a Brawn weapon's normalized record must keep `damageBase: 'brawn'`. The Force Pike is pinned by its RAW figure: "+3".
 *
 * BITE (child run, by EXIT CODE): B1833_MUTANT=dropbase restores the pre-fix `.value` read → exit 1.
 *
 *   node test/b1833_npc_editor_brawn.cjs   → exit 0 green, exit 1 on any failed check
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const esbuild = require('esbuild');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MUTANT = process.env.B1833_MUTANT || '';
let fails = 0;
function check(label, ok, detail) { if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || detail == null ? '' : '  ->  ' + detail)); return ok; }
const jsx = (src, file) => esbuild.transformSync(src, { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', sourcefile: file }).code;

let VIEW = read('lib/library/npc/view.jsx');
const MUT = {
  dropbase: ["  const dmg = dmgObj ? ((SWc && SWc.canonicalToStore) ? SWc.canonicalToStore(w, 'weapons').damage : dmgObj.value) : w.damage;\n",
    "  const dmg = dmgObj ? dmgObj.value : w.damage;\n"],
};
if (MUTANT) {
  const m = MUT[MUTANT];
  if (!m || VIEW.split(m[0]).length !== 2) { console.log('MUTANT MISS: ' + MUTANT); process.exit(2); }
  VIEW = VIEW.replace(m[0], m[1]);
}
function slice(name) {
  const at = VIEW.indexOf('\nfunction ' + name + '(');
  if (at === -1) throw new Error('view.jsx has no function ' + name);
  const end = VIEW.indexOf('\n}\n', at);
  return VIEW.slice(at, end + 3);
}
function sliceConst(name) {
  const at = VIEW.indexOf('\nconst ' + name + ' = ');
  if (at === -1) throw new Error('view.jsx has no const ' + name);
  const end = VIEW.indexOf(';\n', at);
  return VIEW.slice(at, end + 2).replace('const ' + name, 'var ' + name);
}

// ── the world: the cores the GM loads, the vocabularies, the sliced normalizer and table ──
const ctx = { React, console, Math, JSON, Object, Array, String, Number, Boolean, Date, Error, RegExp, Set, Map, Promise, isFinite, parseInt, parseFloat, setTimeout, clearTimeout };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.fetch = () => new Promise(() => {}); ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.document = { body: {}, addEventListener() {}, removeEventListener() {}, documentElement: { style: {} } };
ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
ctx.ReactDOM = { createPortal: (el) => el };
vm.createContext(ctx);
const run = (code, f) => { ctx.module = { exports: {} }; vm.runInContext(code, ctx, { filename: f }); };
['lib/items.js', 'lib/shared/effectClass.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
  'lib/shared/poolMods.js', 'lib/shared/qualityRows.js', 'lib/shared/talentView.js'].forEach((f) => run(read(f), f));
run(jsx(read('lib/shared/ui.jsx'), 'ui.jsx'), 'lib/shared/ui.jsx');
run(jsx(read('lib/shared/diceUI.jsx'), 'diceUI.jsx'), 'lib/shared/diceUI.jsx');
const canon = (n) => JSON.parse(read('public/data/canonical/' + n + '.json'));
const SKILLS = canon('skills.vocab').entries;
ctx._canonicalRegistries = { skills: SKILLS };
run(read('lib/shared/sheetPool.js'), 'lib/shared/sheetPool.js');
if (ctx.SWItems && ctx.SWItems.init) ctx.SWItems.init({ entries: SKILLS });
const PRELUDE = 'var useState = React.useState, useEffect = React.useEffect, ffgDicePool = window.SWRPGUI.ffgDicePool;\n'
  + sliceConst('NpcPoolCoreCtx') + sliceConst('NPC_SB_W');
run(jsx(PRELUDE + ['parseWeaponString', 'NpcPaperSechead', 'npcPaperDesc', 'npcPoolCoreIn', 'useNpcPoolCore', 'NpcPaperPool',
  'encWeaponSpec', 'encPlatePool', 'WeaponTable', 'prettifyCreatorSkill', 'creatorNormWeapon'].map(slice).join('\n'), 'view.jsx (sliced)'), 'view.jsx (sliced)');

const W = canon('weapons').weapons;
const WEAPONS = Array.isArray(W) ? Object.fromEntries(W.map((x) => [x.id, x])) : W;
const refData = { skillsVocab: SKILLS, canonWeapons: WEAPONS };
// the damage the finished page's table prints for a weapon: WeaponTable's `Damage <b>…</b>`
function pageDamage(weaponName) {
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(ctx.WeaponTable, { weaponNames: [weaponName], accent: '#c33', refData,
    characteristics: {}, npcSkills: [] }));
  const m = html.match(/Damage <b>([^<]*)<\/b>/);
  return m ? m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&') : null;
}
const editorDamage = (w) => String(ctx.creatorNormWeapon(w).damage);

console.log('FORCE PIKE — the row\'s case (Brawn +3): the editor prints what the page prints');
{
  const fp = WEAPONS.force_pike;
  check('the registry\'s Force Pike is Brawn +3 (the case the row names)', fp && fp.damage && fp.damage.base === 'brawn' && fp.damage.value === 3, JSON.stringify(fp && fp.damage));
  const n = ctx.creatorNormWeapon(fp);
  check('creatorNormWeapon keeps the base: damageBase "brawn"', n.damageBase === 'brawn', String(n.damageBase));
  check('the editor/picker damage is "+3"', String(n.damage) === '+3', String(n.damage));
  check('the page prints "+3" for it too (WeaponTable)', pageDamage('force_pike') === '+3', pageDamage('force_pike'));
  // an inline canonical profile (a custom's carried weapon stored verbatim) reads the same
  const inline = Object.assign({}, fp);
  check('an INLINE Force Pike profile: the editor equals the page', editorDamage(inline) === pageDamage(inline), editorDamage(inline) + ' vs ' + pageDamage(inline));
}

console.log('EVERY REGISTRY WEAPON — the editor\'s damage equals the page\'s');
{
  const ids = Object.keys(WEAPONS);
  const brawn = ids.filter((k) => WEAPONS[k].damage && WEAPONS[k].damage.base === 'brawn');
  const off = [], lostBase = [];
  ids.forEach((k) => {
    const e = editorDamage(WEAPONS[k]), p = pageDamage(k);
    // the page prints '–' for a missing figure on the id-ref lane; the editor's own placeholder is the same '–'
    if (e !== String(p)) off.push(k + ' ' + e + '≠' + p);
  });
  brawn.forEach((k) => { if (ctx.creatorNormWeapon(WEAPONS[k]).damageBase !== 'brawn') lostBase.push(k); });
  check(ids.length + ' weapons: the editor\'s damage is the page\'s', off.length === 0, off.length + ' differ: ' + off.slice(0, 6).join(' · '));
  check(brawn.length + ' Brawn weapons keep damageBase "brawn"', brawn.length > 0 && lostBase.length === 0, lostBase.slice(0, 6).join(' · '));
  const flat = ids.find((k) => WEAPONS[k].damage && WEAPONS[k].damage.base !== 'brawn' && WEAPONS[k].damage.value != null);
  check('a flat weapon (' + flat + ') prints its bare figure, unsigned', editorDamage(WEAPONS[flat]) === String(WEAPONS[flat].damage.value), editorDamage(WEAPONS[flat]));
}

console.log('THE OTHER LANES — unchanged');
{
  check('a legacy prose string keeps its parsed damage', ctx.creatorNormWeapon('Blaster pistol (Dmg 6; Medium; Stun setting)').damage === '6',
    String(ctx.creatorNormWeapon('Blaster pistol (Dmg 6; Medium; Stun setting)').damage));
  check('a hand weapon (base flat, 7) prints 7', editorDamage({ name: 'Filed hold-out', damage: { value: 7, base: 'flat' }, crit: 3 }) === '7');
  check('a plain-number damage still prints as itself', editorDamage({ name: 'Old', damage: 5 }) === '5');
  check('no weapon → the placeholder', ctx.creatorNormWeapon(null).damage === '–');
}

if (!MUTANT) {
  console.log('BITE — the pre-fix read, by exit code');
  const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1833_MUTANT: 'dropbase' }), encoding: 'utf8' });
  check('B1833_MUTANT=dropbase (the old `.value` read) exits 1', r.status === 1, 'exit ' + r.status + ' ' + String(r.stdout).split('\n').filter((l) => /FAIL|MISS/.test(l)).slice(0, 2).join(' | '));
}

console.log(fails ? '\nb1833_npc_editor_brawn: ' + fails + ' FAILED' : '\nb1833_npc_editor_brawn: all green');
process.exit(fails ? 1 : 0);
