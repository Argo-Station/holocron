#!/usr/bin/env node
/*
 * dicehub_module_sheetless.cjs — the dice window opened with `given` and NO sheet (ENCOUNTERS, D-507; ruling
 * `encounters-e3-screens` ADDENDUM 15 CONTRACT 3 + 4, R-E3S-4). The window is lib/shared/diceHub.jsx (window.SWRPGDiceHub),
 * compiled as the build compiles it and RENDERED here (react-dom/server) with the shipped shared cores and no host.
 *
 *   C4  the given row draws: its name, its pool's dice, the DIFFICULTY chip, ROLL, and DICE REFERENCE; and NOTHING that reads a
 *       sheet: no WEAPONS, SKILLS or FORCE section, no treat row, no "From your gear", no character name in the head. The
 *       result lines: DiceHubRow, the component the given section draws, rendered with a roll of that same spec.
 *   C3  the host seam: every HANDED-IN reader (window.SWRPGDiceHubHost) is a spy, and none is called; nothing is fetched;
 *       window._canonicalCharbuild is a counting getter, and nothing reads it.
 *   NON-VACUITY  the same window WITH a sheet calls the host's useCanonicalReady and draws a Skills section.
 *   BITES (by EXIT CODE of a child run, PRAXIS §6): MUTANT=hook drops the sheet gate on useCanonicalReady → C3 reds;
 *       MUTANT=weapons drops the sheet gate on the weapon rows → the window throws or draws a sheet section → exit 1.
 *
 *   node test/dicehub_module_sheetless.cjs   → exit 0 green, exit 1 on any failed check
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const esbuild = require('esbuild');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MUTANT = process.env.DICEHUB_SHEETLESS_MUTANT || '';
let fails = 0, cases = 0;
function check(label, ok, detail) { cases++; if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || detail == null ? '' : '  ->  ' + detail)); return ok; }
const jsx = (src, file) => esbuild.transformSync(src, { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', sourcefile: file }).code;

let HUB = read('lib/shared/diceHub.jsx');
const MUT = {
  hook: ['var canonReady = sheet ? useCanonicalReady() : true;', 'var canonReady = useCanonicalReady();'],
  weapons: ['(sheet ? diceHubWeaponsWithUnarmed(equipment.weapons, sheet) : [])', 'diceHubWeaponsWithUnarmed(equipment.weapons, sheet)'],
};
if (MUTANT) { const m = MUT[MUTANT]; if (!m || HUB.split(m[0]).length !== 2) { console.log('MUTANT MISS: ' + MUTANT); process.exit(2); } HUB = HUB.replace(m[0], m[1]); }

// ── the world: React, the shared cores both shells load, a counting fetch and charbuild; NO host ──
function world(host) {
  const calls = { host: [], fetch: 0, charbuild: 0 };
  const ctx = { React, console, Math, JSON, Object, Array, String, Number, Boolean, Date, Error, RegExp, Set, Map, Promise, isFinite, parseInt, parseFloat, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.fetch = function () { calls.fetch++; return new Promise(function () {}); };
  ctx.addEventListener = function () {}; ctx.removeEventListener = function () {}; ctx.dispatchEvent = function () { return true; };
  ctx.document = { body: {}, addEventListener() {}, removeEventListener() {}, documentElement: { style: {} } };
  ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  ctx.ReactDOM = { createPortal: (el) => el };   // react-dom/server renders the portal's children in place
  vm.createContext(ctx);
  const run = (code, f) => { ctx.module = { exports: {} }; vm.runInContext(code, ctx, { filename: f }); };
  ['lib/items.js', 'lib/shared/effectClass.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
    'lib/shared/poolMods.js', 'lib/shared/qualityRows.js', 'lib/shared/talentView.js'].forEach((f) => run(read(f), f));
  run(jsx(read('lib/shared/ui.jsx'), 'ui.jsx'), 'lib/shared/ui.jsx');
  run(jsx(read('lib/shared/diceUI.jsx'), 'diceUI.jsx'), 'lib/shared/diceUI.jsx');
  Object.defineProperty(ctx, '_canonicalCharbuild', { configurable: true, get() { calls.charbuild++; return undefined; } });
  if (host) {
    const spy = (name, ret) => function () { calls.host.push(name); return typeof ret === 'function' ? ret.apply(null, arguments) : ret; };
    ctx.SWRPGDiceHubHost = { SKILL_NAMES: { ATHL: 'Athletics' }, useCanonicalReady: spy('useCanonicalReady', true), useRewardsReg: spy('useRewardsReg', null),
      sheetOwnViewOr: spy('sheetOwnViewOr', (s, f) => f), sheetForcePowersForDisplay: spy('sheetForcePowersForDisplay', []),
      diceHubWeaponDamage: spy('diceHubWeaponDamage', null), m7CapChar: spy('m7CapChar', '') };
  }
  run(jsx(HUB, 'diceHub.jsx'), 'lib/shared/diceHub.jsx');
  return { ctx, calls };
}

// the given check: an NPC's own pool, as the encounter will hand it in ({ spec, label }); Agility 3, Ranged (Light) 1
const GIVEN = { spec: { characteristic: 3, skillRank: 1, difficulty: 2 }, label: 'Stormtrooper — Ranged (Light)' };

console.log('C4 / C3 — the window with `given` and no sheet');
let html = '', w;
try {
  w = world(true);
  html = ReactDOMServer.renderToStaticMarkup(React.createElement(w.ctx.SWRPGDiceHub.DiceHub, { given: GIVEN, accent: '#c33', onClose() {} }));
} catch (e) { check('the sheet-less window renders', false, String(e && e.message || e).slice(0, 200)); console.log('FAILED — the render threw'); process.exit(1); }
const has = (s) => html.indexOf(s) !== -1;
check('the window renders (dice-hub)', has('data-testid="dice-hub"'));
check('the given row draws (dice-hub-given-row), with its name', has('data-testid="dice-hub-given-row"') && has(GIVEN.label));
check('its pool draws (the row\'s dice glyphs, sb-pool)', /data-testid="dice-hub-given-row"[\s\S]*class="sb-pool/.test(html), html.slice(0, 0));
check('its DIFFICULTY chip draws, Average until set', has('data-testid="dice-hub-difficulty-chip"') && has('Average'));
check('ROLL draws, named for the check', has('data-testid="dice-hub-roll"') && has('aria-label="Roll ' + GIVEN.label + '"'));
check('DICE REFERENCE draws (its door)', has('data-testid="dice-hub-reference-door"') && has('Dice reference'));
['dice-hub-weapon', 'dice-hub-skill', 'dice-hub-force', 'dice-hub-treat', 'dice-hub-treat-row'].forEach((t) =>
  check('nothing that reads a sheet: no ' + t, !has('data-testid="' + t + '"')));
['>Weapons<', '>Skills<', '>Force<', 'From your gear'].forEach((t) => check('no sheet section head ' + JSON.stringify(t), !has(t)));
check('the head names no character (sb-dh-name empty)', has('<span class="sb-dh-name"></span>'));
check('C3 no HANDED-IN reader is called', w.calls.host.length === 0, JSON.stringify(w.calls.host));
check('C3 nothing is fetched', w.calls.fetch === 0, w.calls.fetch + ' fetch(es)');
check('C3 window._canonicalCharbuild is not read', w.calls.charbuild === 0, w.calls.charbuild + ' read(s)');

// the result lines: the given section's own component and props, with a roll of that spec (react-dom/server renders no clicks)
try {
  const D = w.ctx.SWRPGDice, res = D.rollAndResolve(D.buildPool(GIVEN.spec)), r = res.resolved || res;
  const rolled = { resolved: r, aria: D.formatResults(r), auto: [], spec: GIVEN.spec, taken: null, spent: {} };
  const rowHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(w.ctx.SWRPGDiceHub.DiceHubRow,
    { testid: 'dice-hub-given-row', rowKey: 'given', name: GIVEN.label, spec: GIVEN.spec, accent: '#c33', rolled, onRoll() {} }, []));
  check('a roll draws its result (dice-hub-result, its words)', rowHtml.indexOf('data-testid="dice-hub-result"') !== -1 && rowHtml.indexOf('data-rolled="1"') !== -1);
} catch (e) { check('a roll draws its result', false, String(e && e.message || e).slice(0, 200)); }

// NON-VACUITY: the same window WITH a sheet reaches the host and draws a sheet section
console.log('NON-VACUITY — the same window with a sheet');
try {
  const w2 = world(true);
  const skills = JSON.parse(read('public/data/canonical/skills.vocab.json')).entries;
  w2.ctx._canonicalRegistries = { skills };
  // the skills half of a charbuild (the skill's characteristic), as the hub fixture builds it; the base, so the counting getter stays
  const cb = { talents: {}, species: {}, careers: {}, specializations: {}, forcePowers: {}, signatureAbilities: {}, skillNames: {}, skillSheetKeys: {}, skillChars: {}, skillGroups: {} };
  skills.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; cb.skillNames[e.id] = e.label;
    if (e.characteristic) cb.skillChars[e.id] = e.characteristic; if (e.group) cb.skillGroups[e.id] = e.group; });
  w2.ctx._canonicalCharbuildBase = cb;
  w2.ctx.SWRPGSheetPool = undefined;
  ['lib/shared/sheetPool.js'].forEach((f) => { w2.ctx.module = { exports: {} }; vm.runInContext(read(f), w2.ctx, { filename: f }); });
  const sheet = { name: 'Kell', characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 }, skills: { ATHL: 1 }, equipment: { weapons: [], armor: null, gear: [] } };
  let h2 = '', err = null;
  try { h2 = ReactDOMServer.renderToStaticMarkup(React.createElement(w2.ctx.SWRPGDiceHub.DiceHub, { sheet, accent: '#c33', onClose() {} })); } catch (e) { err = e; }
  check('with a sheet the host\'s useCanonicalReady IS called (the spy can see a call)', w2.calls.host.indexOf('useCanonicalReady') !== -1, JSON.stringify(w2.calls.host) + (err ? ' · threw ' + String(err.message).slice(0, 120) : ''));
  check('with a sheet the head names the character', h2.indexOf('<span class="sb-dh-name">Kell</span>') !== -1, err ? String(err.message).slice(0, 160) : null);
  check('with a sheet the SAME matchers see a sheet section (">Skills<", dice-hub-skill) — the absences above are not vacuous',
    h2.indexOf('>Skills<') !== -1 && h2.indexOf('data-testid="dice-hub-skill"') !== -1, err ? String(err.message).slice(0, 160) : null);
} catch (e) { check('the sheet world builds', false, String(e && e.message || e).slice(0, 200)); }

// BITES — each mutant run as a child, judged by its EXIT CODE (a crash and a miss both read non-zero; a green mutant fails here)
if (!MUTANT) {
  console.log('BITES — by exit code');
  Object.keys(MUT).forEach((m) => {
    const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { DICEHUB_SHEETLESS_MUTANT: m }), encoding: 'utf8' });
    check('MUTANT=' + m + ' (' + MUT[m][1].slice(0, 60) + ') exits 1', r.status === 1, 'exit ' + r.status + ' · ' + (r.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).slice(0, 2).join(' | '));
  });
}
console.log((fails ? 'FAILED' : 'OK') + ' — dicehub_module_sheetless: ' + (cases - fails) + '/' + cases);
process.exit(fails ? 1 : 0);
