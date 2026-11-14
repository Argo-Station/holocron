/* f100_m13_force_tree — a Force model is a READ tree unless its maker sets `buyOnCell` (Modify's alone), and Modify's
 * refund reads the talents' own connection check over the Force cells (HOTFIX f100-m13-force-removal; f100-m13-build-card
 * ADDENDUM 56 R-M13B-158, ADDENDUM 57 R-M13B-161; B-1811).
 *
 *   READ   a model without `buyOnCell` carries no flag and no `keepsTree`, and renders every cell `data-role="read"`, no buttons
 *   BUY    the same power with `buyOnCell` renders `data-role="buy"` and its badges are buttons
 *   KEEPS  Foresee, Control (1-0) + Magnitude (2-0) owned: Control does not keep the tree, Magnitude does
 *   WIDE   Control (1-0, three columns wide) + Range (2-1, hanging from Control's middle column): Control does not keep it
 *   BITE   a renderer that ignores the flag, and a maker that sets it on every Force model, each go red here
 *
 * Headless, as tree_skin_parity: the functions lifted from lib/shared/treeView.jsx, JSX through the repo's esbuild.
 * Run: node test/f100_m13_force_tree.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (!cond && detail !== undefined ? '   -> ' + JSON.stringify(detail).slice(0, 400) : ''));
  cond ? pass++ : fail++;
};

const LINES = fs.readFileSync(path.join(ROOT, 'lib/shared/treeView.jsx'), 'utf8').split('\n');
const NAMES = ['DirectionalTree', 'dtCellSkin', 'DirectionalTreeSheet', 'DirectionalTreeEntryBody', 'forcePowerToModel',
               'fcTalentReachCosts', 'fcTalentIsPurchased', 'fcTalentIsAvailable', 'fcTalentIsConnected', 'fcTalentIsRefundable',
               'glyphs', 'cleanMarkup'];
function lift(name) {
  const start = LINES.findIndex((l) => l.startsWith('function ' + name + '('));
  if (start < 0) throw new Error('function ' + name + ' not found at column 0 in lib/shared/treeView.jsx');
  let end = start + 1;
  while (end < LINES.length && LINES[end] !== '}') end++;
  return LINES.slice(start, end + 1).join('\n');
}
const JS = esbuild.transformSync(NAMES.map(lift).join('\n'), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2020' }).code;
function load(mutate) {
  let code = JS;
  if (mutate) { const next = mutate(code); if (next === code) throw new Error('mutant anchor not found'); code = next; }
  const ctx = { React, console, window: {}, document: undefined, formatActivation: (a) => (a ? String(a) : 'Passive'), gameLineTitle: (id) => id, SWRPGDice: null };
  ctx.window.CharResolve = null;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code + '\nglobalThis.__T = { DirectionalTree, forcePowerToModel };', ctx);
  return ctx.__T;
}

const powers = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/force_powers.json'), 'utf8')).force_powers;
const foresee = powers.foresee;
check('fixture: Foresee on the registry, Control three columns wide at 1-0', foresee && foresee.tree[1].cells[0].ability === 'forseecontrol1' && foresee.tree[1].cells[0].span === 3);

const make = (T, opts) => T.forcePowerToModel(Object.assign({ power: foresee, ownedUpgradeNames: [], availableXp: 1e9, readOnly: false, onBuy() {}, skin: 'board', interactive: true }, opts));
const draw = (T, model) => ReactDOMServer.renderToStaticMarkup(React.createElement(T.DirectionalTree, { model, accent: '#000' }));
const count = (html, re) => (html.match(re) || []).length;
const roles = (T, opts) => { const html = draw(T, make(T, opts)); return { read: count(html, /data-role="read"/g), buy: count(html, /data-role="buy"/g), buttons: count(html, /<button[^>]*class="hp-tab/g) }; };
const cellAt = (m, ri, ci) => m.rows[ri].cells[ci];

function legs(T, tag) {
  const out = {};
  const m = make(T, {});
  const keyed = m.rows.some((r) => r.cells.some((c) => c && c.entry && 'keepsTree' in c.entry));
  out.read = roles(T, {});
  out.readOk = !('buyOnCell' in m) && !keyed && out.read.read === 13 && out.read.buy === 0 && out.read.buttons === 0;
  out.buy = roles(T, { buyOnCell: true });
  out.buyOk = make(T, { buyOnCell: true }).buyOnCell === true && out.buy.read === 0 && out.buy.buy === 13 && out.buy.buttons > 0;
  const k = make(T, { buyOnCell: true, ownedUpgradeNames: ['forseecontrol1', 'forseemagnitude'] });
  out.keeps = [cellAt(k, 1, 0).entry.keepsTree, cellAt(k, 2, 0).entry.keepsTree];
  const w = make(T, { buyOnCell: true, ownedUpgradeNames: ['forseecontrol1', 'forseerange'] });
  out.wide = [cellAt(w, 1, 0).entry.keepsTree, cellAt(w, 2, 1).entry.keepsTree];
  if (tag) return out;
  check('READ a model without buyOnCell: no flag, no keepsTree, 13 read cells, no buttons', out.readOk, { read: out.read, keyed });
  check('BUY the same power with buyOnCell: 13 buy cells, badges are buttons', out.buyOk, out.buy);
  check('KEEPS Control (1-0) with Magnitude hanging from it does not keep the tree; Magnitude does', out.keeps[0] === false && out.keeps[1] === true, out.keeps);
  check('WIDE Control with Range under its middle column does not keep the tree; Range does', out.wide[0] === false && out.wide[1] === true, out.wide);
  return out;
}

legs(load());

// ── BITE: each mutant must turn a leg red ─────────────────────────────────────────────────────
// A mutant whose anchor is gone is a FAIL by name, not a crash (a crash would read as a bite).
const mutant = (label, edit) => { try { return legs(load(edit), 'bite'); } catch (e) { check('BITE anchor: ' + label, false, String(e.message)); return null; } };
const ignoresFlag = mutant('ignores the flag', (c) => c.replace("model.treeClass === \"hp-forcetree\" && !model.buyOnCell", "model.treeClass === \"hp-forcetree\""));
check('BITE: a renderer that ignores buyOnCell reads Modify\'s tree as read-only (BUY would fail)', !!ignoresFlag && !ignoresFlag.buyOk, ignoresFlag && ignoresFlag.buy);
const alwaysFlag = mutant('always the flag', (c) => c.replace('if (buyOnCell) model.buyOnCell = true;', 'model.buyOnCell = true;'));
check('BITE: a maker that sets buyOnCell on every Force model moves the other mounts (READ would fail)', !!alwaysFlag && !alwaysFlag.readOk, alwaysFlag && alwaysFlag.read);
const keepsFillers = mutant('keeps the fillers', (c) => c.replace('delete less[specKey + "_r" + ri + "c" + fi];', ''));
check('BITE: a simulation that keeps the wide box\'s fillers refunds Control over Range (WIDE would fail)', !!keepsFillers && keepsFillers.wide[0] !== false, keepsFillers && keepsFillers.wide);
const noSpecKey = mutant('no specKey', (c) => c.replace('{ row: ri, col: ci, specKey }', '{ row: ri, col: ci }'));
check('BITE: an owned map without specKey reads every Force cell as refundable (KEEPS would fail)', !!noSpecKey && noSpecKey.keeps[0] !== false, noSpecKey && noSpecKey.keeps);

console.log('\nf100_m13_force_tree: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
