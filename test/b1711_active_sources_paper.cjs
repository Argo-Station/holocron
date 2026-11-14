#!/usr/bin/env node
/**
 * b1711_active_sources_paper.cjs — B-1711 (ruling `release-r7-bug-burndown` ADDENDA 607, 608): the ⚙ Active Sources panel
 * has ONE face, paper. Its dark face reached no user (brief `post1-active-sources-step0`: every ⚙ a user can see opened
 * paper, and every screen off the paper list hides its ⚙), so it was deleted. This guard keeps a non-paper path from
 * coming back.
 *
 *   A · SOURCE   `openActiveSources`, `ActiveSourcesPanel`, `ledgerSectionHead` and `platedRow` (lib/shared/ui.jsx) have no
 *                face switch: no `paper` read in the opener, no `paper ?` branch in the panel or its two row primitives,
 *                and none of the deleted dark literals (the navy card, its black scrim, R8a's `floorA`).
 *   B · RENDER   the opener, run in a vm with a recording ReactDOM, renders the dialog with `data-paper-chrome="1"`,
 *                `data-doc-ground="creator"` and `.pb-src`, beside the kit's `.hp-scrim`. It renders the SAME tree for
 *                no options, `{paper: false}` and `{paper: true}`, so no option a caller passes can change the face.
 *   C · CALLERS  no `openActiveSources(…)` call in player/, gm/, lib/ or dice/ passes `paper`.
 *   D · BITES    (PRAXIS §6) three mutants, each run as a child process and read by its EXIT CODE, must exit 1:
 *                the dark branch restored · `paper: false` changing the face · a caller passing `paper: paperChrome`.
 *
 * Run: node test/b1711_active_sources_paper.cjs        (B1711_MUTANT=<name> is the bite harness's own switch)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const React = require('react');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── THE MUTANTS (leg D). Each is applied to the source it names; the guard must then exit 1. ───────────────────────────
const PAPER_RENDER = "    root.render(h(React.Fragment, null,\n      h('div', { onClick: close, className: 'hp-scrim', 'data-src-scrim': '1',";
const MUTANTS = {
  // the deleted dark render, put back in front of the paper one behind a `paper` read
  dark: { file: 'lib/shared/ui.jsx', apply: (s) => s.replace(PAPER_RENDER,
    "    var paper = !!opts.paper;\n    if (!paper) {\n      root.render(h('div', { onClick: close, role: 'dialog', 'aria-label': 'Active sources', 'data-testid': 'active-sources',\n" +
    "        style: { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.82)' } },\n" +
    "        h('div', { style: { maxWidth: '448px', background: '#0E131D' } }, panel)));\n      return { close: close };\n    }\n" + PAPER_RENDER) },
  // an option that changes the face: `paper: false` drops the scope
  paperfalse: { file: 'lib/shared/ui.jsx', apply: (s) => s.replace("'data-paper-chrome': '1', 'data-doc-ground': 'creator', className: 'pb-src',",
    "'data-paper-chrome': opts.paper === false ? undefined : '1', 'data-doc-ground': 'creator', className: 'pb-src',") },
  // a caller passing `paper` again
  caller: { file: 'player/app.jsx', apply: (s) => s.replace("window.SWRPGUI.openActiveSources({ accent: '#4EAAFF' })",
    "window.SWRPGUI.openActiveSources({ accent: '#4EAAFF', paper: paperChrome })") },
};
const MUTANT = process.env.B1711_MUTANT || '';
function src(p) {
  const s = read(p);
  if (MUTANT && MUTANTS[MUTANT] && MUTANTS[MUTANT].file === p) {
    const m = MUTANTS[MUTANT].apply(s);
    if (m === s) { console.error('  MUTANT ' + MUTANT + ' did not apply — its anchor moved'); process.exit(3); }
    return m;
  }
  return s;
}

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + String(detail).slice(0, 400) : '')); }
}

const UI_SRC = src('lib/shared/ui.jsx');

// a function's body, from its `function name(` to the next top-level (2-space) `  function ` or `  // ` block start
function body(name) {
  const a = UI_SRC.indexOf('  function ' + name + '(');
  if (a < 0) return null;
  const rest = UI_SRC.slice(a + 1);
  const m = rest.search(/\n  \}\n/);
  return m < 0 ? null : UI_SRC.slice(a, a + 1 + m + 4);
}

// ── A · SOURCE ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const OPENER = body('openActiveSources'), PANEL = body('ActiveSourcesPanel');
const PAPER_WORD = /(?<![\w-])paper(?![\w-])/;   // the identifier, not `data-paper-chrome`
const HEAD = body('ledgerSectionHead'), ROW = body('platedRow');
check('A · the four functions are found in lib/shared/ui.jsx', OPENER && PANEL && HEAD && ROW,
  [!!OPENER, !!PANEL, !!HEAD, !!ROW]);
if (OPENER && PANEL && HEAD && ROW) {
  const codeOf = (t) => t.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // comments may name the history
  check('A · openActiveSources reads no `paper` — no face switch in the opener', !PAPER_WORD.test(codeOf(OPENER)),
    (codeOf(OPENER).split('\n').filter((l) => PAPER_WORD.test(l))[0] || '').trim());
  check('A · …and renders ONE root (one `root.render(`)', (codeOf(OPENER).match(/root\.render\(/g) || []).length === 1,
    (codeOf(OPENER).match(/root\.render\(/g) || []).length);
  for (const [n, t] of [['ActiveSourcesPanel', PANEL], ['ledgerSectionHead', HEAD], ['platedRow', ROW]]) {
    check('A · ' + n + ' has no `paper ?` branch and no `noInk`', !/paper\s*\?|paper\s*&&|noInk/.test(codeOf(t)),
      (codeOf(t).match(/.*(paper\s*\?|paper\s*&&|noInk).*/) || [''])[0].trim());
  }
  const dark = ['#0E131D', 'rgba(0,0,0,0.82)', 'floorA', 'PANEL_GROUND'];
  for (const [n, t] of [['openActiveSources', OPENER], ['ActiveSourcesPanel', PANEL], ['ledgerSectionHead', HEAD], ['platedRow', ROW]]) {
    const hit = dark.filter((d) => codeOf(t).indexOf(d) !== -1);
    check('A · ' + n + ' carries none of the deleted dark literals ' + JSON.stringify(dark), !hit.length, hit);
  }
  check('A · `floorA` is gone from ui.jsx code and from the SWRPGUI export', !/\bfloorA\b/.test(codeOf(UI_SRC)));
}

// ── B · RENDER ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function loadUI() {
  const rendered = [];
  const node = () => ({ setAttribute() {}, appendChild() {}, removeChild() {}, parentNode: null, isConnected: true,
    querySelector: () => null, querySelectorAll: () => [] });
  const win = {
    addEventListener() {}, removeEventListener() {},
    ReactDOM: { createRoot: () => ({ render: (el) => rendered.push(el), unmount() {} }) },
  };
  const doc = { documentElement: { style: {} }, body: node(), activeElement: null, createElement: node,
    addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const ctx = { React, window: win, document: doc, navigator: { userAgent: 'node' }, console: { log() {}, warn() {}, error() {} },
    history: { pushState() {}, replaceState() {}, back() {}, state: null }, location: { pathname: '/', search: '' },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  ctx.self = win; ctx.globalThis = ctx; win.matchMedia = ctx.matchMedia; win.document = doc;
  vm.createContext(ctx);
  vm.runInContext(UI_SRC, ctx);
  return { UI: win.SWRPGUI, rendered };
}
// the element tree as plain data: types by name, props by value, handlers by kind, children in order
function plain(el) {
  if (el == null || typeof el !== 'object') return el;
  if (Array.isArray(el)) return el.map(plain);
  const t = typeof el.type === 'string' ? el.type : (el.type && (el.type.name || 'Fragment')) || String(el.type);
  const props = {};
  for (const k of Object.keys(el.props || {})) {
    const v = el.props[k];
    props[k] = k === 'children' ? plain(v) : typeof v === 'function' ? 'fn' : v;
  }
  return { t, props };
}
function find(tree, pred) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) { for (const c of tree) { const f = find(c, pred); if (f) return f; } return null; }
  if (pred(tree)) return tree;
  return find(tree.props && tree.props.children, pred);
}
let L;
try { L = loadUI(); } catch (e) { L = null; check('B · lib/shared/ui.jsx loads in the vm', false, e && e.message); }
if (L) {
  check('B · SWRPGUI.openActiveSources is exported', L.UI && typeof L.UI.openActiveSources === 'function');
  const trees = {};
  for (const [name, opts] of [['none', undefined], ['paper:false', { paper: false }], ['paper:true', { paper: true }],
    ['gm', { accent: '#F5C842', variants: false }], ['gm+paper:false', { accent: '#F5C842', variants: false, paper: false }]]) {
    L.rendered.length = 0;
    try { L.UI.openActiveSources(opts); } catch (e) { check('B · the opener runs with ' + name, false, e && e.message); continue; }
    trees[name] = L.rendered.length === 1 ? plain(L.rendered[0]) : null;
    check('B · ' + name + ': the opener renders exactly once', L.rendered.length === 1, L.rendered.length);
    const d = find(trees[name], (n) => n.props && n.props['data-testid'] === 'active-sources');
    check('B · ' + name + ': the dialog carries data-paper-chrome="1", data-doc-ground="creator" and .pb-src',
      !!d && d.props.role === 'dialog' && d.props['data-paper-chrome'] === '1' && d.props['data-doc-ground'] === 'creator'
        && d.props.className === 'pb-src', d && JSON.stringify({ r: d.props.role, s: d.props['data-paper-chrome'], g: d.props['data-doc-ground'], c: d.props.className }));
    const scrim = find(trees[name], (n) => n.props && n.props['data-src-scrim'] === '1');
    check('B · ' + name + ': the scrim is the kit\'s .hp-scrim, beside the dialog', !!scrim && scrim.props.className === 'hp-scrim');
    const s = JSON.stringify(trees[name] || {});
    const left = ['#0E131D', 'rgba(0,0,0,0.82)'].filter((x) => s.indexOf(x) !== -1);
    check('B · ' + name + ': no dark literal anywhere in the rendered tree', !left.length, left);
  }
  const eq = (a, b) => JSON.stringify(trees[a]) === JSON.stringify(trees[b]);
  check('B · `{paper: false}` renders the same tree as no options — no option changes the face', eq('none', 'paper:false'));
  check('B · `{paper: true}` renders the same tree as no options', eq('none', 'paper:true'));
  check('B · the GM\'s options render the same tree with or without `paper: false`', eq('gm', 'gm+paper:false'));
}

// ── C · CALLERS ────────────────────────────────────────────────────────────────────────────────────────────────────────
function walk(dir, out) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.jsx$/.test(e.name) || (/\.html$/.test(e.name) && dir.split(path.sep)[0] === 'dice')) out.push(p);
  }
  return out;
}
const files = ['player', 'gm', 'lib', 'dice'].reduce((o, d) => walk(d, o), []);
const calls = [];
for (const f of files) {
  const s = src(f.split(path.sep).join('/'));
  const re = /openActiveSources\(([^)]*)\)/g; let m;
  while ((m = re.exec(s))) {
    if (/function\s+openActiveSources\s*$/.test(s.slice(Math.max(0, m.index - 30), m.index + 'openActiveSources'.length))) continue;
    calls.push({ f, arg: m[1] });
  }
}
check('C · the three ⚙ callers are found (player, GM, the Yard catalogue) — ' + calls.length + ' call(s)',
  calls.length >= 3 && ['player/app.jsx', 'gm/app.jsx', 'lib/shared/vesselView.jsx'].every((p) => calls.some((c) => c.f.split(path.sep).join('/') === p)),
  calls.map((c) => c.f).join(', '));
const passing = calls.filter((c) => PAPER_WORD.test(c.arg));
check('C · no caller passes `paper`', !passing.length, passing.map((c) => c.f + ': ' + c.arg).join(' | '));

// ── D · BITES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
if (!MUTANT) {
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1711_MUTANT: name }), encoding: 'utf8' });
    const fails = (r.stderr || '').split('\n').filter((l) => l.indexOf('  FAIL') === 0);
    check('D · BITE `' + name + '`: the guard exits 1 on the mutant (exit ' + r.status + ', ' + fails.length + ' FAIL line(s))',
      r.status === 1 && fails.length > 0, (r.stderr || '').slice(0, 300));
  }
}

console.log('\nb1711_active_sources_paper' + (MUTANT ? ' [mutant ' + MUTANT + ']' : '') + ': ' + (failures ? failures + ' FAIL' : 'all pass'));
process.exit(failures ? 1 : 0);
