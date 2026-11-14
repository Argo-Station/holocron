#!/usr/bin/env node
/**
 * npc_craft_block.cjs — PAPER N6, the NPC vehicle dossier's CRAFT block, on the BUILT bundle (ruling
 * `paper-npc-vehicle-dossier-concept` R-NVD-C5 (c); the shape is R-NVD-C2).
 *
 * The built `lib/library/npc/view.js` and the built `lib/shared/vesselView.js` are loaded in a vm under a stub React
 * whose createElement records the tree, with the Yard's REAL store and resolver (`vesselStore.js`, `vesselResolve.js`);
 * states are minted through the store's own ops, and the reference card (`SWRPGLibrary.NPC.NpcPaperStatBlock`) and
 * the block (`…NPC.NpcCraftBlock`) are rendered one level deep. What it holds:
 *   · ONE PARTS SET: every component the block draws is a member of `SWRPGVesselView.YardParts` BY IDENTITY (a local
 *     Stamp / HullType / Cond / stamp formatter would be a different function), and the source defines none of them;
 *     the Yard's sentences (crippled, RECORD KEPT) are not written in the NPC module at all.
 *   · READ-ONLY: no control element and no handler prop anywhere in the block's tree.
 *   · THE WORDS: a destroyed record (derelict) draws LOST through the Yard's LostLine and never the string DERELICT.
 *   · THE FACE: CRAFT between ARSENAL and LORE at the library mount when the NPC owns a ship; never when it owns
 *     nothing; never at the bench (`ctx !== 'library'`).
 *
 * Run:  node test/npc_craft_block.cjs [<built view.js>]   — the argument is for the BITE (a mutated COPY of the bundle).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const VIEW_JS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'lib/library/npc/view.js');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
console.log('npc_craft_block — the CRAFT face draws the Yard\'s parts, read-only (' + path.relative(ROOT, VIEW_JS) + ')\n');

// ── the stub world: a recording React, a window that answers every unknown name with an inert stub ──
const FRAG = Symbol('Fragment');
const React = {
  createElement: (t, p, ...c) => ({ t, p: p || {}, c }), Fragment: FRAG,
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect() {}, useLayoutEffect() {},
  useRef: (v) => ({ current: v }), useCallback: (f) => f, useMemo: (f) => f(), useSyncExternalStore: (s, g) => g(),
  createContext: (v) => ({ Provider: 'Provider', Consumer: 'Consumer', _v: v }), useContext: (c) => (c ? c._v : undefined),
  memo: (f) => f, forwardRef: (f) => f,
};
const STUB = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : STUB),
  apply: () => STUB, construct: () => STUB,
});
const mem = {};
const backing = {
  React, SWRPGLibrary: {},
  localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
};
const win = new Proxy(backing, {
  // `with` asks for Symbol.unscopables first: a stub there would mark every name unscopable and skip this object
  get: (b, k) => (k === Symbol.unscopables ? undefined : k in b ? b[k] : (k in globalThis ? globalThis[k] : STUB)),
  set: (b, k, v) => { b[k] = v; return true; },
  has: () => true,
});
backing.window = win; backing.self = win; backing.globalThis = win;
function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  new Function('__w', 'with (__w) {\n' + src + '\n}').call(win, win);   // eslint-disable-line no-new-func
}
let loaded = true;
try {
  load(path.join(ROOT, 'lib/shared/vesselStore.js'));
  load(path.join(ROOT, 'lib/shared/vesselResolve.js'));
  load(path.join(ROOT, 'lib/shared/vesselView.js'));
  load(VIEW_JS);
} catch (e) { loaded = false; check('the built bundles load under the stub world', false, String(e && e.stack || e).slice(0, 300)); }
const VS = backing.SWRPGVessels, VV = backing.SWRPGVesselView, P = VV && VV.YardParts;
const NPC = backing.SWRPGLibrary && backing.SWRPGLibrary.NPC;
check('the Yard\'s store, resolver and parts load (SWRPGVessels · SWRPGVesselResolve · SWRPGVesselView.YardParts)',
  loaded && !!VS && !!backing.SWRPGVesselResolve && !!P);
check('the NPC bundle exports the reference card and the CRAFT block (SWRPGLibrary.NPC.NpcPaperStatBlock / NpcCraftBlock)',
  !!NPC && typeof NPC.NpcPaperStatBlock === 'function' && typeof NPC.NpcCraftBlock === 'function', NPC ? Object.keys(NPC).slice(0, 8) : null);
// ── THE SOURCE: no local copy of a Yard part or sentence (comments stripped; the built bundle is minified, so names are read here) ──
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^\n'"]*$/gm, '$1');
const VIEW_SRC = strip(fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8'));
const LOCAL = ['Stamp', 'HullType', 'Cond', 'LastCrit', 'Art', 'stampOf', 'fitSign', 'shipName', 'isCrippled', 'CripLine', 'LostLine'];
const defs = LOCAL.filter((n) => new RegExp('(function\\s+' + n + '\\s*\\(|(const|let|var)\\s+' + n + '\\s*=)').test(VIEW_SRC));
check('view.jsx defines no local ' + LOCAL.join(' / '), defs.length === 0, defs);
const BUNDLE = fs.readFileSync(VIEW_JS, 'utf8');
check('the built bundle references YardParts', /\.YardParts\b/.test(BUNDLE));
const copies = ['Hull trauma is past', 'RECORD KEPT', 'BATTLE-READY', 'SILHOUETTE '].filter((w) => BUNDLE.includes(w));
check('the built bundle writes none of the Yard\'s sentences (crippled · RECORD KEPT · BATTLE-READY · the hull line)', copies.length === 0, copies);

if (!VS || !P || !NPC || typeof NPC.NpcCraftBlock !== 'function' || typeof NPC.NpcPaperStatBlock !== 'function') {
  console.log('\nnpc_craft_block: ' + pass + '/' + (pass + fail) + ' PASS  (' + fail + ' FAILED — the rest cannot run)');
  process.exit(1);
}

// ── the data: Boba Fett and his ships, from the shipped registries (the smoke's fixture) ──
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const NPCREC = J('public/data/canonical/npcs.json').npcs.boba_fett;
const OWNER_KEY = NPCREC._source_key, OWNER = 'npc:' + OWNER_KEY, WHEN = '2026-10-11';
const ROWS = J('public/data/canonical/crit_tables.json').vehicle.rows;
const vehicles = [];
const vlib = path.join(ROOT, 'public/data/vehicle-library');
fs.readdirSync(vlib).filter((f) => f.endsWith('.json')).forEach((f) => (J('public/data/vehicle-library/' + f).entries || []).forEach((e) => vehicles.push(e)));
const refData = { vehicles };
const FIRE = vehicles.find((v) => v.key === 'FIRESPRAY');
const base = (st) => VS.acquire(st, 'FIRESPRAY', { owner: OWNER, nickname: 'Slave I', id: 'v_slave1' }, WHEN).state;
const hurt = (st, h, s) => VS.addCrit(VS.updateVessel(st, 'v_slave1', { hull_current: h, strain_current: s }, WHEN), 'v_slave1', { row: 'navicomputer_failure' }, WHEN, ROWS);
const STATES = {
  i: (st) => base(st),
  iii: (st) => VS.markDestroyed(hurt(base(st), 9, 6), 'v_slave1', { state: 'derelict' }, WHEN),
  iv: (st) => hurt(base(st), FIRE.hull_trauma + 2, 6),
  v: (st) => VS.acquire(base(st), '74ZSPEEDERBIKE', { owner: OWNER, id: 'v_74z' }, WHEN).state,
  vi: () => null,
};
function mint(sid) {
  delete mem[VS.VESSELS_KEY];
  VS.apply(() => ({ v: 3, vessels: [] }));
  if (sid !== 'vi') VS.apply(STATES[sid]);
  return VS.forOwner(VS.getState(), OWNER).length;
}

// ── the tree readers ──
const PARTS = new Map(Object.keys(P).filter((k) => typeof P[k] === 'function').map((k) => [P[k], k]));
function walk(node, out) {
  if (node == null || node === false || node === true) return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  if (typeof node !== 'object') { out.strings.push(String(node)); return out; }
  const { t, p, c } = node;
  if (t === FRAG) out.frags++;
  else if (typeof t === 'string') out.hosts.push({ t, p });
  else if (typeof t === 'function') out.fns.push({ fn: t, name: PARTS.get(t) || null, p, c });
  Object.keys(p || {}).forEach((k) => { if (typeof p[k] === 'string' && k !== 'className' && k !== 'key') out.strings.push(p[k]); });
  walk(c, out);
  if (p && p.children) walk(p.children, out);
  return out;
}
const tree = (n) => walk(n, { hosts: [], fns: [], strings: [], frags: 0 });
function card(ctx, owner) {
  const el = NPC.NpcPaperStatBlock({ rend: NPCREC, tier: NPCREC.tier, refData, name: NPCREC.name, arrange: 'stack', ctx, owner });
  const t = tree(el);
  const stack = t.hosts.find((h) => h.p['data-testid'] === 'npc-stack');
  const faces = [];
  (function sections(n) {
    if (n == null || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(sections); return; }
    if (n.t === 'section') { const h3 = (n.c || []).flat().find((x) => x && x.t === 'h3'); faces.push(h3 ? h3.c.flat().join('') : '?'); return; }
    sections(n.c);
  })(el);
  const craftEl = t.fns.find((f) => f.fn === NPC.NpcCraftBlock);
  return { root: el && el.p, faces, stack: !!stack, craftEl };
}
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea', 'option', 'details', 'summary', 'label']);
const HANDLER = /^on[A-Z]/;

// ── THE FACE ──
check('(i) minted through the store\'s ops: one ship under ' + OWNER, mint('i') === 1);
let c = card('library', OWNER_KEY);
check('(i) library mount, owns a ship: faces STATS · ARSENAL · CRAFT · LORE', JSON.stringify(c.faces) === JSON.stringify(['STATS', 'ARSENAL', 'CRAFT', 'LORE']), c.faces);
check('(i) the face root carries data-npc-craft="1"', c.root && c.root['data-npc-craft'] === '1', c.root && c.root['data-npc-craft']);
check('(i) the CRAFT body is NpcCraftBlock, handed the owner key', !!c.craftEl && c.craftEl.p.owner === OWNER_KEY, c.craftEl && c.craftEl.p);
c = card('bench', OWNER_KEY);
check('(i) the bench (ctx "bench"): no CRAFT face, no data-npc-craft', !c.faces.includes('CRAFT') && c.root && c.root['data-npc-craft'] == null, c.faces);
c = card('library', null);
check('(i) a mount that passes no owner: no CRAFT face', !c.faces.includes('CRAFT'), c.faces);
check('(vi) minted: nothing under ' + OWNER, mint('vi') === 0);
c = card('library', OWNER_KEY);
check('(vi) owns nothing: faces STATS · ARSENAL · LORE, no data-npc-craft', JSON.stringify(c.faces) === JSON.stringify(['STATS', 'ARSENAL', 'LORE'])
  && c.root && c.root['data-npc-craft'] == null, c.faces);
check('(vi) owns nothing: NpcCraftBlock itself draws nothing', NPC.NpcCraftBlock({ owner: OWNER_KEY, refData }) == null);

// ── THE BLOCK, per state ──
const NEED = { i: ['Art', 'HullType', 'Cond', 'LastCrit'], iii: ['Art', 'HullType', 'Stamp', 'LostLine', 'LastCrit'],
  iv: ['Art', 'HullType', 'Stamp', 'Cond', 'CripLine', 'LastCrit'], v: ['Art', 'HullType', 'Cond'] };
['i', 'iii', 'iv', 'v'].forEach((sid) => {
  const n = mint(sid);
  const t = tree(NPC.NpcCraftBlock({ owner: OWNER_KEY, refData }));
  const foreign = t.fns.filter((f) => !f.name && f.fn !== backing.SWRPGLibrary.NPC.NpcCraftBlock);
  check('(' + sid + ') every component the block draws is a YardParts member by identity (' + t.fns.length + ' drawn, '
    + foreign.length + ' foreign)', t.fns.length > 0 && foreign.length === 0, foreign.map((f) => f.fn.name || '(anonymous)'));
  const used = new Set(t.fns.map((f) => f.name));
  const miss = NEED[sid].filter((k) => !used.has(k));
  check('(' + sid + ') the block draws ' + NEED[sid].join(' · ') + ' from YardParts', miss.length === 0, { missing: miss, used: [...used] });
  const ships = t.hosts.filter((h) => h.p['data-testid'] === 'npc-craft-ship');
  check('(' + sid + ') one article per owned ship (' + n + ')', ships.length === n && n > 0, ships.length);
  const ctl = t.hosts.filter((h) => CONTROL_TAGS.has(h.t) || (h.t === 'a' && h.p.href != null) || /^(button|link|checkbox|tab|switch|menuitem)$/.test(h.p.role || '')
    || h.p.tabIndex != null || Object.keys(h.p).some((k) => HANDLER.test(k)));
  const ctlFn = t.fns.filter((f) => Object.keys(f.p || {}).some((k) => HANDLER.test(k)));
  check('(' + sid + ') READ-ONLY: 0 controls and 0 handler props in the block', ctl.length === 0 && ctlFn.length === 0,
    ctl.map((h) => h.t + ' ' + Object.keys(h.p).join(',')).concat(ctlFn.map((f) => f.name + ' ' + Object.keys(f.p).join(','))));
  if (sid === 'iii') {
    const stamps = t.fns.filter((f) => f.name === 'Stamp').map((f) => [].concat(f.c || []).flat(Infinity).join(''));
    check('(iii) a destroyed (derelict) record: the stamp says LOST, never DERELICT', stamps.includes('LOST') && !stamps.includes('DERELICT'), stamps);
    check('(iii) the string DERELICT appears nowhere in the block\'s tree', !t.strings.some((s) => /DERELICT/i.test(s)), t.strings.filter((s) => /DERELICT/i.test(s)));
  }
  if (sid === 'iv') {
    const stamps = t.fns.filter((f) => f.name === 'Stamp').map((f) => [].concat(f.c || []).flat(Infinity).join(''));
    const crip = t.fns.find((f) => f.name === 'CripLine');
    check('(iv) past the threshold: CRIPPLED stamp and the Yard\'s CripLine at ' + FIRE.hull_trauma, stamps.includes('CRIPPLED') && crip && crip.p.ht === FIRE.hull_trauma, { stamps, ht: crip && crip.p.ht });
  }
});

console.log('\nnpc_craft_block: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
