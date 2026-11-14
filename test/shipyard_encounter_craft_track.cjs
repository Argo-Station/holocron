#!/usr/bin/env node
/**
 * shipyard_encounter_craft_track.cjs — encounter craft's TRACK and its DOWN tests (card `shipyard-encounter-craft-build`
 * step 2: R-SECF-5, R-SECF-6; ADDENDUM 1 G1/G2), on the BUILT bundles.
 *
 * The built `lib/shared/vesselView.js` and `lib/library/npc/view.js` load in a vm under a stub React whose createElement
 * records the tree (test/npc_craft_block.cjs's world), with the Yard's REAL store and resolver. What it holds:
 *   · R-SECF-6: `YardParts.isSystemsDown` beside `isCrippled`, each PAST its threshold (equal is not down), and neither
 *     claims a state with no threshold. The sources keep no second hull or strain test: no `> threshold` comparison in
 *     vesselView.jsx or view.jsx outside the two.
 *   · R-SECF-5 / G1: `NpcPaperTrack`'s `uncapped` prints the stored value (13 / 6 prints 13); WITHOUT it an NPC at 3×
 *     still prints the R-NFST-1 clamp (18 / 6 prints 12). `down` and `downWord` replace the NPC's own test and word
 *     only when passed. The Yard's Cond prints the same 13 OF 6.
 *   · G2: no NPC caller passes `down`, `downWord` or `uncapped` — the only call that does is the craft row's.
 *
 * Run:  node test/shipyard_encounter_craft_track.cjs [<built view.js> [<built vesselView.js>]]  — the arguments are for
 * the BITE (mutated COPIES of the bundles).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const VIEW_JS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'lib/library/npc/view.js');
const VV_JS = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'lib/shared/vesselView.js');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
console.log('shipyard_encounter_craft_track — the craft track and the one down test per track\n');

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
  get: (b, k) => (k === Symbol.unscopables ? undefined : k in b ? b[k] : (k in globalThis ? globalThis[k] : STUB)),
  set: (b, k, v) => { b[k] = v; return true; },
  has: () => true,
});
backing.window = win; backing.self = win; backing.globalThis = win;
function load(file) {
  new Function('__w', 'with (__w) {\n' + fs.readFileSync(file, 'utf8') + '\n}').call(win, win);   // eslint-disable-line no-new-func
}
let loaded = true;
try {
  load(path.join(ROOT, 'lib/library/npc/benchStore.js'));
  load(path.join(ROOT, 'lib/shared/vesselStore.js'));
  load(path.join(ROOT, 'lib/shared/vesselResolve.js'));
  load(VV_JS);
  load(VIEW_JS);
} catch (e) { loaded = false; check('the built bundles load under the stub world', false, String(e && e.stack || e).slice(0, 300)); }
const P = backing.SWRPGVesselView && backing.SWRPGVesselView.YardParts;
const NPC = backing.SWRPGLibrary && backing.SWRPGLibrary.NPC;
check('the Yard\'s parts and the bench\'s tracker load (YardParts · SWRPGLibrary.NPC.NpcPaperTrack)',
  loaded && !!P && !!NPC && typeof NPC.NpcPaperTrack === 'function');
if (!P || !NPC || typeof NPC.NpcPaperTrack !== 'function') {
  console.log('\nshipyard_encounter_craft_track: ' + pass + '/' + (pass + fail) + ' PASS  (' + fail + ' FAILED — the rest cannot run)');
  process.exit(1);
}

// ── R-SECF-6: one test per track, PAST the threshold ──
const res = { hull_threshold: 6, strain_threshold: 8 };
const at = (h, s) => ({ hull_current: h, strain_current: s });
check('isSystemsDown is a YardParts member, beside isCrippled', typeof P.isSystemsDown === 'function' && typeof P.isCrippled === 'function');
if (typeof P.isSystemsDown === 'function') {
  check('isSystemsDown: 8 / 8 is not down (equal is not past)', P.isSystemsDown(at(0, 8), res) === false);
  check('isSystemsDown: 9 / 8 is down', P.isSystemsDown(at(0, 9), res) === true);
  check('isSystemsDown: no threshold claims nothing (held: 99 strain, res null)', P.isSystemsDown(at(0, 99), null) === false);
  check('isSystemsDown reads strain, never hull (99 hull, 0 strain)', P.isSystemsDown(at(99, 0), res) === false);
}
check('isCrippled: 6 / 6 is not crippled; 7 / 6 is', P.isCrippled(at(6, 0), res) === false && P.isCrippled(at(7, 0), res) === true);

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SECOND = /(hull|strain)(_current)?\s*\|\|\s*0\)?\s*>\s*(ht|st|sth)\b|\b(hull|strain)\s*>\s*(ht|st|sth)\b|>\s*(res|r)\.(hull|strain)_threshold/;
['lib/shared/vesselView.jsx', 'lib/library/npc/view.jsx'].forEach((f) => {
  const lines = strip(fs.readFileSync(path.join(ROOT, f), 'utf8')).split('\n');
  const hits = lines.filter((l) => SECOND.test(l) && !/function (isCrippled|isSystemsDown)\b/.test(l)).map((l) => l.trim().slice(0, 140));
  check(f + ': no hull or strain test outside isCrippled / isSystemsDown', hits.length === 0, hits);
});
// R-SECB-7: the ONE named leftover — player/app.jsx's combat act (the cargo lap's file), retired by a later lap's row.
// Exactly one: a second inline test there is a new defect, and none means the row is discharged and this line re-points.
const appHits = strip(fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8')).split('\n').filter((l) => SECOND.test(l));
check('player/app.jsx: exactly the one named leftover strain test (R-SECB-7)', appHits.length === 1 && /strain_current/.test(appHits[0]), appHits.map((l) => l.trim().slice(0, 140)));

// ── R-SECF-5 / G1: the tracker ──
function walk(node, out) {
  if (node == null || node === false || node === true) return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  if (typeof node !== 'object') { out.text.push(String(node)); return out; }
  if (typeof node.t === 'string') out.hosts.push(node);
  walk(node.c, out);
  if (node.p && node.p.children) walk(node.p.children, out);
  return out;
}
function read(el) {
  const t = walk(el, { hosts: [], text: [] });
  const val = t.hosts.find((h) => /\bsb-vitval\b/.test(h.p.className || ''));
  const word = t.hosts.find((h) => h.p.className === 'sb-vitword');
  const row = t.hosts.find((h) => h.p.className === 'sb-vitrow');
  const flat = (n) => walk(n, { hosts: [], text: [] }).text.join('');
  return { val: val ? flat(val.c) : null, word: word ? flat(word.c) : null, state: row ? row.p['data-state'] : null };
}
const noop = () => {};
const npc3x = read(NPC.NpcPaperTrack({ label: 'Wounds', track: 'wounds', cur: 18, max: 6, onDec: noop, onInc: noop }));
check('an NPC at 3× its threshold still prints the R-NFST-1 clamp: 12 / 6, Incapacitated', npc3x.val === '12 / 6' && npc3x.word === 'Incapacitated', npc3x);
const craft = read(NPC.NpcPaperTrack({ label: 'Hull trauma', track: 'hull', cur: 13, max: 6, uncapped: true, down: true, downWord: 'Crippled', onDec: noop, onInc: noop }));
check('a craft at 13 / 6 (uncapped) prints 13 / 6, and its own word Crippled', craft.val === '13 / 6' && craft.word === 'Crippled' && craft.state === 'down', craft);
const held = read(NPC.NpcPaperTrack({ label: 'System strain', track: 'strain', cur: 9, max: 8, uncapped: true, down: false, downWord: 'Systems down', onDec: noop, onInc: noop }));
check('`down: false` is the caller\'s word: 9 / 8 draws no down word when its test says no', held.val === '9 / 8' && held.word === null && held.state !== 'down', held);
const sys = read(NPC.NpcPaperTrack({ label: 'System strain', track: 'strain', cur: 9, max: 8, uncapped: true, down: true, downWord: 'Systems down', onDec: noop, onInc: noop }));
check('a craft at 9 / 8 with its test true prints Systems down', sys.val === '9 / 8' && sys.word === 'Systems down', sys);
const condText = walk(P.Cond({ rec: at(13, 0), res }), { hosts: [], text: [] }).text.join('');
check('the Yard prints the same one number: Cond reads HULL 13 OF 6', /HULL 13 OF 6/.test(condText), condText);

// ── G2: the NPC callers pass none of the new props ──
const VIEW_SRC = strip(fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8'));
const calls = VIEW_SRC.split('<NpcPaperTrack').slice(1).map((c) => c.slice(0, c.indexOf('/>')));
const withProps = calls.filter((c) => /\b(down|downWord|uncapped)=/.test(c));
const craftCalls = withProps.filter((c) => /track="(hull|strain)"/.test(c));
check('G2: ' + calls.length + ' NpcPaperTrack calls; every one passing down / downWord / uncapped is a craft track (hull / strain)',
  calls.length >= 5 && withProps.length === craftCalls.length, withProps.map((c) => c.slice(0, 120)));

console.log('\nshipyard_encounter_craft_track: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
