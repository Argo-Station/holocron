/* test/shipyard_s8_room.cjs — SHIP YARD S8, step 6c: THE CONVERT ROOM (card `shipyard-s8-build` R-S8B-8 + ADDENDUM 12 Q1/Q2;
 * frames v3 R-S8FR-3, APPROVED D-238: C-elig · C-picked · C-parts · C-nohp; `shipyard-s8-frames-card` ADDENDUM 2 R-S8FJ-3's copy table).
 *
 *   R-1 the route   · 'ship/<id>/fit/convert' is THE SHIP's Convert room ({room:'ship', tab:'fit', at:'convert'}), and back: yardTail
 *                     writes the same tail; a fourth segment other than 'convert' under fit is not-found (ADDENDUM 12 Q1)
 *   R-2 the words   · the copy table is R-S8FJ-3's eleven, word for word and in its order, and names exactly the registry's kind
 *                     'conversion' rows; each type refusal reads "<words> · DC p.71"; has_parts reads C-parts' sentence with the
 *                     cite; no_hard_points reads C-nohp's "NO HARD POINTS TO TAKE"
 *   R-3 the reading · the YT-1300 + LIGHT FREIGHTER, read by the ONE resolver (frames v3 C-elig / C-picked; lab s8_numbers.cjs):
 *                     HANDLING −1 → −2 · ARMOR 3 → 4 · HULL TRAUMA 22 → 24 · SYSTEM STRAIN 15 → 13, no DEFENSE row until an arc
 *                     is picked, then DEFENSE · FORE 1 → 2; the added guns are TWO rows (R-S8V-6 as amended), each TURRET · Quad
 *                     Laser Cannon; the arcs asked: light freighter 1, bulk transport 2, speeder bike none; the zones FORE · AFT
 *   R-5 CONVERSION (b) · 6d, frames M-conv: the template and its cite; before → after by the resolver without the conversion;
 *                     the guns as THE SHIP's WeaponRow, credited "<TEMPLATE> · DC p.71"; the saved pick shown, a new pick and REMOVE
 *                     CONVERSION saved; HELD and the orphan (L-7)
 *   R-6 the panels' credits · card ADDENDUM 15 H-2 (a), frames M-conv: FIT's panels on the converted YT-1300 credit the template as
 *                     "<NAME> · DC p.71" — HULL TRAUMA "+2 · …", the picked FORE "+1 · …" without "(chosen)" — the cite read
 *                     from the parts list's row; a part keeps the S4 idiom ("+1 · Reinforced Shield Generator (chosen)", no cite)
 *   R-7 MODS' BUILD · 6e, frames M-built · M-change · H-mods: the Starfighter frame + Fusial Thrust Engine + Sleek Carapace reads
 *                     FRAME STARFIGHTER · FO p.79 (SILHOUETTE 3 · HULL TRAUMA 8 · HARD POINTS 7, no CHANGE, "A DIFFERENT FRAME IS
 *                     A DIFFERENT SHIP"), ENGINE SPEED 3 · DEFENSE 1/0 · SYSTEM STRAIN 4 × SIL = 12, HULL ARMOR 0 · HANDLING +2, each
 *                     with CHANGE; the ONE picker in the book's order with its page values, before → after on THIS ship (M-change
 *                     line for line), the saved piece on and the Repulsor Cluster refused "CAN’T GO ON A STARSHIP · FO p.82"; a
 *                     Space Station's engines each "SPEED STAYS 0 ON A SPACE STATION · FO p.81"; a tap names its key; HELD (the
 *                     saved keys, "—", CHANGE inert) and the orphan (L-7); the panels credit the pieces "<NAME> · FO p.82" (H-2)
 *   R-9 BUILD A SHIP · 6f, frames B-empty · B-part · B-s1 · B-s2 · B-corvette · B-station · H-build (R-S8B-9; ADDENDUM 12 Q1): the
 *                     route 'build' and back; PLANETARY 4 then STARSHIPS 8, each frame card its numbers and cite; the engines and hulls
 *                     through the ONE picker; YOUR SHIP's twelve numbers each with its reason ("<FRAME> FRAME · FO p.79", the pieces'
 *                     "<NAME> · FO p.82", "+25 · Expanded-Capacity Holds · FO p.83", the station's speed line), the frames' sums
 *                     ("100 + 25 = 125") and products ("4 × 3 = 12"); "—" for a piece not picked or refused on this frame; ADD inert
 *                     until a frame, an engine, a hull and a NAME; the add writes ONE record {vehicleKey '', nickname, owner, build}
 *                     and opens THE SHIP (GM: the party; player: the character); HELD: the parts list's words, the frame's own numbers
 *   R-10 THE SHIP built · 6g, frames S-built · S-cell · M-built (R-S8B-10; ADDENDUM 15 H-2 (a), a view rule): the hull line reads
 *                     "BUILT · STARFIGHTER FRAME · SILHOUETTE 3 · UNIT · RED SQUADRON" and the Hangar's cell "BUILT · STARFIGHTER FRAME ·
 *                     SILHOUETTE 3"; the panels credit HULL TRAUMA THRESHOLD "STARFIGHTER FRAME · FO p.79", SYSTEM STRAIN THRESHOLD
 *                     "4 × 3 = 12 · Fusial Thrust Engine · FO p.82", a station's SPEED by its line alone; a stock ship's credits untouched
 *   R-8 s8Cite      · card ADDENDUM 17's print contract: every S8 row (12 frames, 11 pieces, 11 templates) prints "FO p.<its page>" or
 *                     "DC p.<its page>"; with no such alias, two of them, or no vocabulary, the row's cite AS STORED, never blank
 *   R-4 the room    · rendered one level deep under a recording React over the shipped parts list: a stock YT-1300 lists FITS THIS
 *                     HULL 1 (the light freighter) then DOES NOT FIT 10 in the table's order, each with its words; CONVERT is
 *                     inert (no handler, aria-disabled) while the pick is owed and the picker is marked; a ship holding a part
 *                     lists the light freighter refused has_parts; the parts list missing → the room is PartsWords alone (H-mods)
 *
 * THE BITE: each MUTANT changes one arm of lib/shared/vesselView.jsx in memory before it is compiled; the child must exit 1.
 * Run: node test/shipyard_s8_room.cjs        (children: --mutant=<name>)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const MUT = (process.argv.find((a) => a.indexOf('--mutant=') === 0) || '').slice(9) || null;

const VIEW = 'lib/shared/vesselView.jsx';
const MUTANTS = {
  route: "      if (segs.length === 4 && segs[2] === 'fit' && segs[3] === 'convert') return { room: 'ship', id: segs[1], tab: 'fit', at: 'convert' };\n",
  tail: [" : r.at === 'convert' ? '/fit/convert'", ''],
  words: ["'ONLY FOR WHEELED OR TRACKED VEHICLES'", "'ONLY FOR WHEELEDS / TRACKED'"],
  order: ['function convertOrder(id) { for', 'function convertOrder(id) { return 0; for'],
  cite: ["CONVERT_ONLY_FOR[i][1] + ' · '", "CONVERT_ONLY_FOR[i][1] + ' '"],
  guns: ['return w.added_by === src;', 'return false;'],
  picks: ["return !chosen ? 0 : typeof", 'return 1 || typeof'],
  inert: ['onClick: need > 0 ? undefined : go', 'onClick: go'],
  mark: ["'data-need': need > 0 ? 1 : 0", "'data-need': 0"],
  held: ["if (!p.attById) return el('div', { 'data-testid': 'conv-door', 'data-state': 'held' }, el(PartsWords, { err: p.attErr }));", ''],
  // 6d · CONVERSION (b) and the added guns' credit
  before: ['Object.assign({}, p.rec, { conversion: null })', 'p.rec'],
  credit: ["return w.added_by + (row && row.cite ? ' · ' + row.cite : '');", 'return w.added_by;'],
  remove: ["function drop() { p.update({ conversion: null }); }", 'function drop() {}'],
  saved: ["onArcs: function (a) { p.update({ conversion: Object.assign({}, c, { arcs: a }) }); }", 'onArcs: function () {}'],
  // ADDENDUM 15 H-2 (a) · the panels' S8 credits
  s8credit: ['fitCredit(s8Credit(s8, c), bare)', 'fitCredit(c, bare)'],
  s8chosen: ["s.replace(/ \\(chosen\\)$/, '')", 's'],
  s8scope: ["var out = {}, c = convOn(p), b = p.rec && p.rec.build, by = p.attById || {};",
    "var out = {}, c = convOn(p), b = p.rec && p.rec.build, by = p.attById || {}; Object.keys(by).forEach(function (k) { out[by[k].name] = by[k].cite; });"],
  // 6e · MODS' BUILD and the picker
  noframechange: ["line: 'A DIFFERENT FRAME IS A DIFFERENT SHIP',", "line: 'A DIFFERENT FRAME IS A DIFFERENT SHIP', act: change('frame'),"],
  pickorder: ['return pg(x) - pg(y) || pr(x) - pr(y) ||', 'return 0 ||'],
  starship: ['row.constraints.must_not_be_starship && frame && frame.is_starship', 'row.constraints.must_not_be_starship && false'],
  station: ["return fx && typeof fx.speed === 'number' ?", 'return false ?'],
  moves: ['if (a !== c) lines.push(', 'if (false) lines.push('],
  heldkey: ["name: ok ? row.name : key || '—',", "name: ok ? row.name : '—',"],
  // card ADDENDUM 17 · s8Cite: one short alias, or the cite as stored
  citeone: ['return short.length === 1 ?', 'return short.length >= 1 ?'],
  // 6f · BUILD A SHIP
  buildroute: "    if (segs.length === 1 && segs[0] === 'build') return { room: 'build' };\n",
  buildtail: ["    if (r.room === 'build') return 'build';\n", ''],
  framecredit: ["return upper(f.name) + ' FRAME' +", "return upper(f.name) +"],
  stationwhy: ['why.speed = fixed ? [stationLine(f)] : because', 'why.speed = because'],
  strainarith: ["if (ex && f.silhouette != null) arith.strain =", 'if (false) arith.strain ='],
  sumarith: ['if (adds.length && live) arith[k] =', 'if (false) arith[k] ='],
  addcredit: ['adds.forEach(function (c) { why[k].push(cred(c)); });', ''],
  unpicked: ['if (b.hull && live) {', 'if (live) {'],
  refusedengine: ["if (er && (er.kind !== 'engine' || pieceRefusal(f, er))) er = null;", "if (er && er.kind !== 'engine') er = null;"],
  needname: ['&& !held && !!String(name).trim();', '&& !held;'],
  writes: ['return VS.updateVessel(r.state, r.id, { build: build }, now);', 'return r.state;'],
  gmparty: ["add('party', 'Added to the party from the yard.');", "add(props.owner, 'Added to the party from the yard.');"],
  buildheld: ["held ? el(PartsWords, { err: attLoad.err }) : el(BuildPicker, { slot: 'engine'", "el(BuildPicker, { slot: 'engine'"],
  // card ADDENDUM 19 H-5 (b) · the drawn crew words
  crewshort: ['function crewLine(vrow) { return vrow ? vrow.crew_short || vrow.crew || null : null; }', 'function crewLine(vrow) { return vrow ? vrow.crew || null : null; }'],
  // 6g · THE SHIP built
  builtword: ["if (builtWord(rec, vrow)) return builtWord(rec, vrow) + ' · ' + sil + u;", ''],
  builtcell: ["(builtWord(props.rec, vrow) || vrow.name", "(vrow.name"],
  framekeys: ["BUILT_FRAME_KEYS.forEach(function (k) { if (k !== 'massive' || res.massive) out[k] = [fc].concat(b[k] || []); });", ''],
  strainprod: ["return i === 0 && c.set != null ?", 'return false ?'],
  stationpanel: ["if ((b.speed || []).some(function (c) { return 'fixed' in c; }) && stationLine(f)) out.speed", 'if (false) out.speed'],
};
// card ADDENDUM 17's two mutants, on the vocabulary's text (in memory): fully_operational's `fo` removed; a second short alias added
const VOCAB = 'public/data/canonical/books.vocab.json';
const VOCAB_MUTANTS = {
  noalias: ['"Fully Operational",\n    "fo"\n', '"Fully Operational"\n'],
  twoalias: ['"fo"\n   ],', '"fo",\n    "fop"\n   ],'],
};
function vocabSource() {
  let s = fs.readFileSync(path.join(ROOT, VOCAB), 'utf8');
  const m = MUT && VOCAB_MUTANTS[MUT];
  if (m) {
    if (s.indexOf(m[0]) === -1) { console.log('MUTANT ' + MUT + ': its text is not in ' + VOCAB + ' (the guard is stale)'); process.exit(2); }
    s = s.replace(m[0], m[1]);
  }
  return s;
}
function viewSource() {
  let s = fs.readFileSync(path.join(ROOT, VIEW), 'utf8');
  const m = MUT && MUTANTS[MUT];
  if (m) {
    const [a, b] = Array.isArray(m) ? m : [m, ''];
    if (s.indexOf(a) === -1) { console.log('MUTANT ' + MUT + ': its text is not in ' + VIEW + ' (the guard is stale)'); process.exit(2); }
    s = s.replace(a, b);
  }
  return s;
}

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; if (!MUT) console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// ── the stub world: a recording React; the Yard's REAL store, resolver and schematic; fetch answers from the tree ──
const React = {
  createElement: (t, p, ...c) => ({ t, p: p || {}, c }), Fragment: 'Fragment',
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect() {}, useLayoutEffect() {}, useRef: (v) => ({ current: v }),
  useCallback: (f) => f, useMemo: (f) => f(), useSyncExternalStore: (s, g) => g(), createContext: (v) => ({ _v: v }), useContext: (c) => (c ? c._v : undefined),
  memo: (f) => f, forwardRef: (f) => f,
};
const win = { React, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout: () => 0, clearTimeout() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(J(String(u).replace(/^\//, ''))) }) };
win.window = win; win.self = win;
const ctx = vm.createContext(win);
function run(file, code) { vm.runInContext(code || fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file }); }
run('lib/shared/vesselStore.js');
run('lib/shared/vesselResolve.js');
run('lib/shared/shipSchematic.js');
run('lib/shared/sources.js');
const VOCAB_INDEX = win.SWRPGSources.buildIndex(JSON.parse(vocabSource()));
win._swrpgSourcesIndex = VOCAB_INDEX;
run(VIEW, esbuild.transformSync(viewSource(), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2020' }).code);
const VS = win.SWRPGVessels, R = win.SWRPGVesselResolve, VV = win.SWRPGVesselView, C = VV && VV.YardConvert;
check('the store, resolver, schematic and view load; the view exports YardConvert', !!(VS && R && win.SWRPGShipSchematic && C));
if (!C) { console.log('\nshipyard_s8_room: ' + ok + '/' + (ok + fail) + ' PASS  (the rest cannot run)'); process.exit(1); }

const ATT = J('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const WPN = J('public/data/canonical/vehicle-weapons.json').vehicle_weapons;
const QUALS = {};
(J('public/data/canonical/qualities.vocab.json').entries || []).forEach((q) => { if (!q) return; QUALS[q.id] = q; (q.aliases || []).forEach((a) => { QUALS[a] = q; }); });
const LIB = [].concat(...fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => /\.json$/.test(f) && f !== 'index.json' && f !== 'taxonomy.json')
  .map((f) => J('public/data/vehicle-library/' + f).entries || []));
const lib = (k) => LIB.find((e) => e.key === k) || null;
const FRAMES = J('public/data/canonical/vehicle-frames.json').vehicle_frames;
const built = (frame, engine, hull) => VS.normalizeVessel({ id: 'v_built', owner: 'party', v: 3, attachments: [],
  build: { frame, engine: engine ? { key: engine, mods: [] } : null, hull: hull ? { key: hull, mods: [] } : null, note: null } }, 1);
const ship = (key, extra) => VS.normalizeVessel(Object.assign({ id: 'v_' + key, vehicleKey: key, owner: 'party', v: 3, attachments: [] }, extra || {}), 1);
function P(rec, att) {
  const vrow = rec.build ? FRAMES[rec.build.frame] : lib(rec.vehicleKey), rctx = { attachments: att === undefined ? ATT : att, weapons: WPN };
  return { rec, vrow, res: R.resolve(rec, vrow, rctx), reg: { qualities: QUALS }, ctx: { resolve: rctx }, attById: att === undefined ? ATT : att, attErr: null,
    apply() {}, go() {}, now: () => '2026-10-20', band: 'wide', host: 'player' };
}

// ── R-1 · the route ──
{
  const r = VV.yardRoute('ship/v_1/fit/convert');
  check('R-1 · ship/<id>/fit/convert → {room ship, id, tab fit, at convert} (ADDENDUM 12 Q1)', r.room === 'ship' && r.id === 'v_1' && r.tab === 'fit' && r.at === 'convert', r);
  check('R-1 · …and yardTail writes the same tail back', VV.yardTail(r) === 'ship/v_1/fit/convert', VV.yardTail(r));
  check('R-1 · MODS stays /fit (the segment kept) and a stray fourth segment is not-found',
    VV.yardTail(VV.yardRoute('ship/v_1/fit')) === 'ship/v_1/fit' && VV.yardRoute('ship/v_1/fit/plan').room === 'notfound' && VV.yardRoute('ship/v_1/crew/convert').room === 'notfound');
}

// ── R-2 · the words (R-S8FJ-3, word for word and in its order; C-parts; C-nohp) ──
const RSFJ3 = [
  ['paramilitary_airspeeder', 'ONLY FOR AIRSPEEDERS'], ['paramilitary_cloud_car', 'ONLY FOR CLOUD CARS'], ['paramilitary_landspeeder', 'ONLY FOR LANDSPEEDERS'],
  ['paramilitary_walker', 'ONLY FOR WALKERS'], ['paramilitary_wheeled_tracked', 'ONLY FOR WHEELED OR TRACKED VEHICLES'],
  ['paramilitary_speeder_bike_swoop', 'ONLY FOR SPEEDER BIKES AND SWOOPS'], ['paramilitary_bulk_transport', 'ONLY FOR BULK TRANSPORTS'],
  ['paramilitary_light_freighter', 'ONLY FOR LIGHT FREIGHTERS'], ['paramilitary_medium_transport', 'ONLY FOR MEDIUM TRANSPORTS'],
  ['paramilitary_shuttle', 'ONLY FOR SHUTTLES'], ['paramilitary_yacht', 'ONLY FOR YACHTS']];
const CONV = Object.keys(ATT).filter((k) => ATT[k].kind === 'conversion');
{
  check('R-2 · the copy table is R-S8FJ-3\'s eleven, word for word, in its order', JSON.stringify(C.ONLY_FOR) === JSON.stringify(RSFJ3), C.ONLY_FOR);
  check('R-2 · …and names exactly the registry\'s kind \'conversion\' rows (none reaches the room unworded)',
    CONV.length === RSFJ3.length && CONV.every((k) => RSFJ3.some((r) => r[0] === k)), CONV);
  const bad = RSFJ3.filter(([k, w]) => C.why('type', ATT[k]) !== w + ' · DC p.71' || C.why('category', ATT[k]) !== w + ' · DC p.71');
  check('R-2 · each type or category refusal reads "<words> · DC p.71"', bad.length === 0, bad);
  check('R-2 · has_parts reads C-parts\' sentence, cited', C.why('has_parts', ATT.paramilitary_light_freighter) === 'TAKE OFF ITS PARTS FIRST — A CONVERSION GOES ON A SHIP WITH NONE FITTED · DC p.71');
  check('R-2 · no_hard_points reads C-nohp\'s "NO HARD POINTS TO TAKE"', C.why('no_hard_points', ATT.paramilitary_speeder_bike_swoop) === 'NO HARD POINTS TO TAKE');
}

// ── R-3 · the reading (frames v3 C-elig / C-picked) ──
{
  const p = P(ship('YT1300')), zones = C.zones(p.res), t = ATT.paramilitary_light_freighter;
  check('R-3 · the YT-1300\'s zones are FORE · AFT (C-elig\'s two buttons)', JSON.stringify(zones) === '["fore","aft"]', zones);
  const d0 = C.diff(p, t, [], zones);
  const want0 = [['HANDLING', '−1 → −2'], ['ARMOR', '3 → 4'], ['HULL TRAUMA', '22 → 24'], ['SYSTEM STRAIN', '15 → 13']];
  check('R-3 · unpicked: HANDLING −1 → −2 · ARMOR 3 → 4 · HULL TRAUMA 22 → 24 · SYSTEM STRAIN 15 → 13, no DEFENSE row',
    JSON.stringify(d0.rows.map((r) => [r.label, r.value])) === JSON.stringify(want0), d0.rows);
  const d1 = C.diff(p, t, ['fore'], zones);
  check('R-3 · picked FORE: the same four, then DEFENSE · FORE 1 → 2 (C-picked)',
    JSON.stringify(d1.rows.map((r) => [r.label, r.value])) === JSON.stringify(want0.concat([['DEFENSE · FORE', '1 → 2']])), d1.rows);
  check('R-3 · the added guns are TWO rows, each a TURRET Quad Laser Cannon of count 1 (R-S8V-6 as amended)',
    d1.guns.length === 2 && d1.guns.every((w) => w.turret && w.count === 1 && w.name === WPN.LASERQUAD.name), d1.guns.map((w) => [w.name, w.turret, w.count]));
  check('R-3 · the arcs asked: light freighter 1 · bulk transport 2 · speeder bike/swoop none (the resolver\'s own count)',
    C.picks(ATT.paramilitary_light_freighter) === 1 && C.picks(ATT.paramilitary_bulk_transport) === 2 && C.picks(ATT.paramilitary_speeder_bike_swoop) === 0);
}

// ── R-4 · the room, rendered one level deep over the shipped parts list ──
function walk(n, f) { if (n == null || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach((x) => walk(x, f)); return; } f(n); (n.c || []).forEach((x) => walk(x, f)); }
function find(tree, tid) { const out = []; walk(tree, (n) => { if (n.p && n.p['data-testid'] === tid) out.push(n); }); return out; }
function text(n) { const out = []; walk(n, (x) => { (x.c || []).forEach((c) => { if (typeof c === 'string' || typeof c === 'number') out.push(String(c)); }); }); return out.join(''); }
// ── R-9 (H-build) · the builder with the parts list not in hand: rendered BEFORE the list loads (the view's module cache empty) ──
VS.setFrames(FRAMES);
win.innerWidth = 1280;
// the room's pickers and the parts list's words are component elements (one level deep): `opened` renders those in place
const opened = (tree) => { walk(tree, (n) => { if (typeof n.t === 'function' && ['BuildPicker', 'PartsWords'].indexOf(n.t.name) !== -1 && !n.opened) { n.opened = 1; n.c = [n.t(n.p)]; } }); return tree; };
const yoursOf = (tree) => { let y = null; walk(tree, (n) => { if (n.t === VV.YardBuild.Yours) y = n.t(n.p); }); return y; };
const leds = (y) => { const out = {}; walk(y, (n) => { if (n.p && n.p.tid === 'build-led') out[n.p.k] = [typeof n.p.value === 'string' ? n.p.value : '—', ...[].concat(...(n.c || [])).filter(Boolean).map(text)]; }); return out; };
{
  const tree = opened(VV.YardBuild.Room({ host: 'player', initial: { frame: 'starfighter', engine: 'fusial_thrust_engine', hull: 'sleek_carapace', name: 'Knife Edge' }, character: { id: 'c1' } }));
  const y = opened(yoursOf(tree)), L = leds(y);
  check('R-9 · H-build: the engine section is the parts list\'s words, no hull cards; YOUR SHIP carries the words too',
    find(find(tree, 'build-pickers')[0], 'parts-words').length === 1 && find(tree, 'build-hull').length === 0 && find(y, 'parts-words').length === 1);
  check('R-9 · …the frame\'s own numbers with its reason (its own registry), every piece number "—", ADD inert',
    JSON.stringify(L.silhouette) === '["3","STARFIGHTER FRAME · FO p.79"]' && JSON.stringify(L.hull_trauma) === '["8","STARFIGHTER FRAME · FO p.79"]'
    && ['speed', 'defense', 'strain', 'armor', 'handling'].every((k) => JSON.stringify(L[k]) === '["—"]') && find(y, 'build-add')[0].p['aria-disabled'] === 'true'
    && find(y, 'build-add')[0].p.onClick === undefined, L);
}
// the parts list's loader catches a throw inside its callback and calls it AGAIN with an empty list: a throw here must turn the
// guard red, never end it at exit 0 with the rest unrun (6f found it so)
let loadedOnce = false;
VV.loadAttachments(() => {
  if (loadedOnce) return;
  loadedOnce = true;
  try { loaded(); } catch (e) { check('the guard ran to its end (no throw inside the loaded legs)', false, String(e && e.stack)); finish(); }
});
function loaded() {
  const room = (rec, att) => C.Room({ p: P(rec, att) });
  {
    const tree = room(ship('YT1300'));
    const tpl = find(tree, 'conv-tpl'), groups = find(tree, 'conv-group');
    check('R-4 · C-elig: FITS THIS HULL 1 then DOES NOT FIT 10', groups.length === 2 && text(groups[0]) === 'FITS THIS HULL1' && text(groups[1]) === 'DOES NOT FIT10', groups.map(text));
    const order = tpl.map((n) => n.p['data-key']);
    const want = ['paramilitary_light_freighter'].concat(RSFJ3.map((r) => r[0]).filter((k) => k !== 'paramilitary_light_freighter'));
    check('R-4 · …the light freighter first, the refused in the table\'s order (the book\'s)', JSON.stringify(order) === JSON.stringify(want), order);
    const words = tpl.filter((n) => n.p['data-ok'] === 0).map((n) => text(find(n, 'conv-why')));
    check('R-4 · …each refused template with its words (· DC p.71)',
      JSON.stringify(words) === JSON.stringify(RSFJ3.filter((r) => r[0] !== 'paramilitary_light_freighter').map((r) => r[1] + ' · DC p.71')), words);
    // ConvertArcs and FitLed are component elements (one level deep): the picker is rendered from its own element, a gun row
    // is read by its props
    const lf = tpl[0], go = find(lf, 'conv-go')[0], pk = [];
    walk(lf, (n) => { if (typeof n.t === 'function' && n.p && typeof n.p.picks === 'number') pk.push(n); });
    const arcs = pk[0] ? pk[0].t(pk[0].p) : null;
    check('R-4 · …PICK 1 ARC FOR +1 DEFENSE, the picker marked while the pick is owed', arcs && arcs.p['data-need'] === 1 && /^PICK 1 ARC FOR \+1 DEFENSE/.test(text(arcs)), arcs && text(arcs));
    check('R-4 · …CONVERT is inert while the pick is owed: no handler, aria-disabled', go && go.p.onClick === undefined && go.p['aria-disabled'] === 'true', go && go.p);
    const guns = []; walk(lf, (n) => { if (n.p && n.p.tid === 'conv-gun') guns.push(n); });
    check('R-4 · …two gun rows, each TURRET · Quad Laser Cannon', guns.length === 2 && guns.every((g) => g.p.label === 'TURRET' && g.p.value === WPN.LASERQUAD.name), guns.map((g) => [g.p.label, g.p.value]));
  }
  {
    const part = Object.keys(ATT).find((k) => !ATT[k].kind && ATT[k].hp);
    const tree = room(ship('YT1300', { attachments: [{ key: part, mods: [] }] }));
    const lf = find(tree, 'conv-tpl').find((n) => n.p['data-key'] === 'paramilitary_light_freighter');
    check('R-4 · C-parts: a ship holding a part lists the light freighter refused, in C-parts\' words', lf && lf.p['data-ok'] === 0 && lf.p['data-why'] === 'has_parts'
      && text(find(lf, 'conv-why')) === 'TAKE OFF ITS PARTS FIRST — A CONVERSION GOES ON A SHIP WITH NONE FITTED · DC p.71', lf && text(lf));
  }
  {
    const tree = room(ship('YT1300', { attachments: [{ key: 'combat_plating', mods: [] }] }), null);
    const door = find(tree, 'conv-door')[0];
    check('R-4 · H-mods: the parts list missing → the room is the parts list\'s words alone, nothing listed (R-S8G-1\'s class)',
      door && door.p['data-state'] === 'held' && find(tree, 'conv-tpl').length === 0, door && door.p);
  }
  // ── R-5 · CONVERSION (b) on a converted ship (frames v3 M-conv; 6d) ──
  {
    const rec = ship('YT1300', { conversion: { key: 'paramilitary_light_freighter', arcs: ['fore'], note: null } }), patches = [];
    const p = Object.assign(P(rec), { update: (x) => patches.push(x) });
    const tree = C.Converted({ p }), head = find(tree, 'mods-conv')[0];
    check('R-5 · M-conv: CONVERSION (b) names the template and its cite', head && head.p['data-state'] === 'converted' && /^Paramilitary Light FreighterDC p\.71/.test(text(tree)), text(tree).slice(0, 60));
    const moves = []; walk(tree, (n) => { if (n.p && n.p.k === 'conv' && n.p.label) moves.push([n.p.label, n.p.value]); });
    check('R-5 · …before → after read from the resolver without the conversion: the four, then DEFENSE · FORE 1 → 2',
      JSON.stringify(moves) === JSON.stringify([['HANDLING', '−1 → −2'], ['ARMOR', '3 → 4'], ['HULL TRAUMA', '22 → 24'], ['SYSTEM STRAIN', '15 → 13'], ['DEFENSE · FORE', '1 → 2']]), moves);
    const rows = []; walk(tree, (n) => { if (n.p && n.p.w && typeof n.p.i === 'number' && n.p.noTohit) rows.push(n.p); });
    check('R-5 · …the guns are THE SHIP\'s WeaponRow, two rows, each a Quad Laser Cannon the template added',
      rows.length === 2 && rows.every((r) => r.w.name === WPN.LASERQUAD.name && r.w.added_by === ATT.paramilitary_light_freighter.name), rows.map((r) => [r.i, r.w.name]));
    check('R-5 · …each credited "<TEMPLATE> · DC p.71" (the parts list\'s own cite; R-S8FR-4)',
      rows.every((r) => C.credit(p, r.w) === 'Paramilitary Light Freighter · DC p.71'), rows.map((r) => C.credit(p, r.w)));
    const arcs = []; walk(tree, (n) => { if (typeof n.t === 'function' && n.p && typeof n.p.picks === 'number') arcs.push(n); });
    arcs[0] && arcs[0].p.onArcs(['aft']);
    const rm = find(tree, 'mods-conv-remove')[0]; rm && rm.p.onClick();
    check('R-5 · …the picker shows the saved FORE and a new pick saves at once; REMOVE CONVERSION saves conversion null',
      arcs[0] && JSON.stringify(arcs[0].p.arcs) === '["fore"]' && JSON.stringify(patches) === JSON.stringify([{ conversion: { key: 'paramilitary_light_freighter', arcs: ['aft'], note: null } }, { conversion: null }]), patches);
    const held = C.Converted({ p: Object.assign(P(rec, null), { update() {} }) }), orphan = C.Converted({ p: Object.assign(P(ship('YT1300', { conversion: { key: 'paramilitary_starfighter', arcs: [], note: null } })), { update() {} }) });
    check('R-5 · …the parts list missing → HELD (its words, the key); a key the list lacks → the orphan row, its key printed (L-7)',
      find(held, 'mods-conv')[0].p['data-state'] === 'held' && find(orphan, 'mods-conv')[0].p['data-state'] === 'orphan' && find(orphan, 'fit-orphan')[0].p['data-key'] === 'paramilitary_starfighter');
  }
  // ── R-6 · the panels' credits (card ADDENDUM 15 H-2 (a); frames M-conv) ──
  {
    const panels = (rec) => { const p = P(rec); return find(C.Panels({ p, m: C.model(p), diff: null }), 'fit-credit').map(text); };
    const cv = panels(ship('YT1300', { conversion: { key: 'paramilitary_light_freighter', arcs: ['fore'], note: null } }));
    const T = 'Paramilitary Light Freighter · DC p.71';
    check('R-6 · H-2 M-conv: HULL TRAUMA credits "+2 · ' + T + '" and the picked FORE "+1 · ' + T + '" — the cite from the parts list\'s row',
      ATT.paramilitary_light_freighter.cite === 'DC p.71' && cv.indexOf('+2 · ' + T) !== -1 && cv.indexOf('+1 · ' + T) !== -1, cv);
    check('R-6 · …no panel credit on the converted ship reads "(chosen)", and every template credit carries its cite',
      cv.every((t) => !/\(chosen\)/.test(t)) && cv.filter((t) => /Paramilitary Light Freighter/.test(t)).every((t) => / · DC p\.71$/.test(t)), cv);
    const s4 = panels(ship('YT1300', { attachments: [{ key: 'reinforced_shield_generator', mods: [], zone: 'aft' }] }));
    check('R-6 · …a part keeps the S4 idiom: "+1 · Reinforced Shield Generator (chosen)", no cite (smoke_yard_s4_fit\'s U10 read-back)',
      s4.indexOf('+1 · Reinforced Shield Generator (chosen)') !== -1 && s4.every((t) => !/DC p\.71/.test(t)), s4);
  }
  // ── R-7 · MODS' BUILD (frames v3 M-built · M-change · H-mods; 6e) ──
  {
    const kv = (row) => { const out = []; walk(row, (n) => { if (typeof n.t === 'function' && n.p && n.p.k !== undefined && 'v' in n.p) out.push(n.p.k + ' ' + (n.p.v == null ? '—' : n.p.v)); }); return out; };
    const rowsOf = (tree) => { const out = []; walk(tree, (n) => { if (typeof n.t === 'function' && n.p && n.p.slot && n.t.name === 'BuildRow') out.push(n); }); return out; };
    const rr = (n) => n.t(n.p);
    const B = VV.YardBuild;
    const rec = built('starfighter', 'fusial_thrust_engine', 'sleek_carapace'), p = Object.assign(P(rec), { update() {} });
    const rows = rowsOf(B.Build({ p })).map(rr);
    const fr = rows[0], en = rows[1], hu = rows[2];
    check('R-7 · M-built: FRAME STARFIGHTER · FO p.79 — SILHOUETTE 3 · HULL TRAUMA 8 · HARD POINTS 7 · CREW, no CHANGE, "A DIFFERENT FRAME IS A DIFFERENT SHIP"',
      rows.length === 3 && fr.p['data-slot'] === 'frame' && /^FRAMEStarfighterFO p\.79/.test(text(fr)) && JSON.stringify(kv(fr).slice(0, 3)) === '["SILHOUETTE 3","HULL TRAUMA 8","HARD POINTS 7"]'
      && find(fr, 'mods-change').length === 0 && /A DIFFERENT FRAME IS A DIFFERENT SHIP$/.test(text(fr)), [text(fr), kv(fr)]);
    check('R-7 · …ENGINE Fusial Thrust Engine · FO p.82 — SPEED 3 · DEFENSE 1/0 · SYSTEM STRAIN 4 × SIL = 12, with CHANGE',
      /^ENGINEFusial Thrust EngineFO p\.82/.test(text(en)) && JSON.stringify(kv(en)) === '["SPEED 3","DEFENSE 1/0","SYSTEM STRAIN 4 × SIL = 12"]' && find(en, 'mods-change').length === 1, [text(en), kv(en)]);
    check('R-7 · …HULL Sleek Carapace · FO p.82 — ARMOR 0 · HANDLING +2, with CHANGE',
      /^HULLSleek CarapaceFO p\.82/.test(text(hu)) && JSON.stringify(kv(hu)) === '["ARMOR 0","HANDLING +2"]' && find(hu, 'mods-change').length === 1, [text(hu), kv(hu)]);
    const picks = [];
    const pk = B.Picker({ slot: 'engine', build: rec.build, frame: FRAMES.starfighter, by: ATT, on: 'fusial_thrust_engine', change: true, rec, ctx: p.ctx.resolve, res: p.res,
      zones: C.zones(p.res), onPick: (k) => picks.push(k) });
    const cards = find(pk, 'build-engine'), at = (k) => cards.find((c) => c.p['data-key'] === k), moves = (k) => find(at(k), 'build-move').map(text);
    check('R-7 · M-change: the six engines in the book\'s order (FO pp.81–82)', JSON.stringify(cards.map((c) => c.p['data-key'])) === JSON.stringify(['single_ion_coil',
      'electron_baffled_engine', 'ion_turbine_engine', 'fusial_thrust_engine', 'high_performance_repulsor_cluster', 'ion_drive_array']), cards.map((c) => c.p['data-key']));
    check('R-7 · …each card its page values (Electron Baffled SPEED 2 · DEFENSE 0/0/0/2 · SYSTEM STRAIN 5 × SIL)',
      JSON.stringify(kv(at('electron_baffled_engine'))) === '["SPEED 2","DEFENSE 0/0/0/2","SYSTEM STRAIN 5 × SIL"]' && /Electron Baffled EngineFO p\.81/.test(text(at('electron_baffled_engine'))), kv(at('electron_baffled_engine')));
    check('R-7 · …before → after on THIS ship, line for line as M-change draws it',
      JSON.stringify(moves('single_ion_coil')) === '["SPEED 3 → 1","DEFENSE 1/0 → 0/0","SYSTEM STRAIN 12 → 9"]'
      && JSON.stringify(moves('electron_baffled_engine')) === '["SPEED 3 → 2","DEFENSE 1/0 → 0/2","SYSTEM STRAIN 12 → 15"]'
      && JSON.stringify(moves('ion_turbine_engine')) === '["SPEED 3 → 1","SYSTEM STRAIN 12 → 30"]'
      && JSON.stringify(moves('ion_drive_array')) === '["SPEED 3 → 4","DEFENSE 1/0 → 0/0","SYSTEM STRAIN 12 → 6"]', ['single_ion_coil', 'electron_baffled_engine', 'ion_turbine_engine', 'ion_drive_array'].map(moves));
    const rep = at('high_performance_repulsor_cluster'), fu = at('fusial_thrust_engine');
    check('R-7 · …the saved engine on, no lines; the Repulsor Cluster refused "CAN’T GO ON A STARSHIP · FO p.82", not pressable',
      fu.p['data-on'] === 1 && moves('fusial_thrust_engine').length === 0 && rep.p['data-refused'] === 1 && rep.p.onClick === undefined
      && text(find(rep, 'build-refused')[0]) === 'CAN’T GO ON A STARSHIP · FO p.82' && moves('high_performance_repulsor_cluster').length === 0, text(rep));
    at('ion_drive_array').p.onClick();
    check('R-7 · …a tap names its key to the writer (build.engine = {key, mods: []} — pickTo, read back by the smoke)', JSON.stringify(picks) === '["ion_drive_array"]', picks);
    const hp = find(B.Picker({ slot: 'hull', build: rec.build, frame: FRAMES.starfighter, by: ATT, on: 'sleek_carapace', onPick() {} }), 'build-hull');
    check('R-7 · …the five hulls in the book\'s order (FO pp.82–84), Expanded-Capacity Holds with ENCUMBRANCE +25 · PASSENGERS +25',
      JSON.stringify(hp.map((c) => c.p['data-key'])) === JSON.stringify(['sleek_carapace', 'expanded_capacity_holds', 'light_armored_hull', 'deflective_plating', 'combat_plating'])
      && JSON.stringify(kv(hp[1])) === '["ARMOR 1","HANDLING −2","ENCUMBRANCE +25","PASSENGERS +25"]', [hp.map((c) => c.p['data-key']), kv(hp[1])]);
    const stn = find(B.Picker({ slot: 'engine', build: { frame: 'space_station' }, frame: FRAMES.space_station, by: ATT, onPick() {} }), 'build-station').map(text);
    check('R-7 · …on a Space Station every engine reads "SPEED STAYS 0 ON A SPACE STATION · FO p.81"',
      stn.length === 6 && stn.every((t) => t === 'SPEED STAYS 0 ON A SPACE STATION · FO p.81'), stn);
    const held = B.Build({ p: Object.assign(P(rec, null), { update() {} }) }), hr = rowsOf(held).map(rr);
    check('R-7 · H-mods: the parts list missing → its words, the frame, each piece by its saved key with "—", CHANGE inert',
      held.p['data-state'] === 'held' && /^ENGINEfusial_thrust_engine/.test(text(hr[1])) && kv(hr[1]).every((t) => / —$/.test(t)) && /^HULLsleek_carapace/.test(text(hr[2]))
      && find(hr[1], 'mods-change')[0].p['aria-disabled'] === 'true' && find(hr[1], 'mods-change')[0].p.onClick === undefined, [text(hr[1]), kv(hr[1])]);
    const orf = rowsOf(B.Build({ p: Object.assign(P(built('starfighter', 'warp_core', 'sleek_carapace')), { update() {} }) })).map(rr)[1];
    check('R-7 · …a key the list lacks → the orphan row, its key printed in FitOrphan\'s words (L-7), CHANGE kept',
      orf.p['data-state'] === 'orphan' && find(orf, 'fit-orphan')[0].p['data-key'] === 'warp_core' && /^ENGINEwarp_core/.test(text(orf)) && find(orf, 'mods-change').length === 1, text(orf));
    const pc = find(C.Panels({ p, m: C.model(p), diff: null }), 'fit-credit').map(text);
    check('R-7 · H-2 at 6e: the panels credit the pieces "<NAME> · FO p.82" (DEFENSE · Fusial Thrust Engine, ARMOR · Sleek Carapace)',
      pc.indexOf('Fusial Thrust Engine · FO p.82') !== -1 && pc.indexOf('Sleek Carapace · FO p.82') !== -1, pc);
  }
  // ── R-9 · BUILD A SHIP (frames B-empty · B-part · B-s1 · B-s2 · B-corvette · B-station; 6f) ──
  {
    const r = VV.yardRoute('build');
    check('R-9 · "build" → {room build} and yardTail writes it back; "build/x" is not-found (ADDENDUM 12 Q1)',
      JSON.stringify(r) === '{"room":"build"}' && VV.yardTail(r) === 'build' && VV.yardRoute('build/x').room === 'notfound', [r, VV.yardTail(r)]);
    const RoomB = (initial, extra) => opened(VV.YardBuild.Room(Object.assign({ host: 'player', initial, character: { id: 'c1' }, nav() {} }, extra || {})));
    const empty = RoomB({}), groups = find(empty, 'build-group').map(text), fcards = find(empty, 'build-frame');
    const fkv = (c) => { const out = []; walk(c, (n) => { if (typeof n.t === 'function' && n.p && n.p.k !== undefined && 'v' in n.p) out.push(n.p.k + ' ' + n.p.v); }); return out; };
    check('R-9 · B-empty: PLANETARY 4 then STARSHIPS 8, the twelve frames in the registry\'s order',
      JSON.stringify(groups) === '["PLANETARY4","STARSHIPS8"]' && JSON.stringify(fcards.map((c) => c.p['data-key'])) === JSON.stringify(Object.keys(FRAMES)), [groups, fcards.map((c) => c.p['data-key'])]);
    const sf = fcards.find((c) => c.p['data-key'] === 'starfighter');
    check('R-9 · …a frame card: its name, "FO p.79", SILHOUETTE 3 · HULL TRAUMA 8 · HARD POINTS 7 · CREW one pilot (crew_short, ADDENDUM 19 H-5), and its identifier',
      /^StarfighterFO p\.79/.test(text(sf)) && JSON.stringify(fkv(sf).slice(0, 3)) === '["SILHOUETTE 3","HULL TRAUMA 8","HARD POINTS 7"]' && fkv(sf)[3] === 'CREW one pilot'
      && find(sf, 'build-frame').length === 1, [text(sf), fkv(sf)]);
    const ye = leds(yoursOf(empty));
    check('R-9 · …YOUR SHIP\'s twelve rows in the frames\' order, each "—"; ADD inert',
      JSON.stringify(Object.keys(ye)) === JSON.stringify(['silhouette', 'hull_trauma', 'hard_points', 'encumbrance', 'passengers', 'sensor', 'crew', 'speed', 'defense', 'strain', 'armor', 'handling'])
      && Object.keys(ye).every((k) => JSON.stringify(ye[k]) === '["—"]') && find(yoursOf(empty), 'build-add')[0].p['aria-disabled'] === 'true', ye);
    check('R-9 · …the engines and hulls through the ONE picker (no before → after), with the TOLD line',
      find(empty, 'build-engine').length === 6 && find(empty, 'build-hull').length === 5 && find(empty, 'build-move').length === 0
      && text(find(yoursOf(empty), 'build-told')[0]) === 'The book’s crafting check, cost and time are your GM’s call (FO pp.76–77).');
    const s1 = RoomB({ frame: 'starfighter', engine: 'fusial_thrust_engine', hull: 'sleek_carapace', name: 'Knife Edge' }), y1 = yoursOf(s1), L1 = leds(y1);
    const F = 'STARFIGHTER FRAME · FO p.79', E = 'Fusial Thrust Engine · FO p.82', H = 'Sleek Carapace · FO p.82';
    const want1 = { silhouette: ['3', F], hull_trauma: ['8', F], hard_points: ['7', F], encumbrance: ['2', F], passengers: ['0', F], sensor: ['CLOSE', F],
      crew: ['one pilot', F], speed: ['3', E], defense: ['1/0', E], strain: ['4 × 3 = 12', E], armor: ['0', H], handling: ['+2', H] };
    check('R-9 · B-s1: Starfighter + Fusial Thrust Engine + Sleek Carapace — every number with its reason, the strain "4 × 3 = 12"',
      JSON.stringify(L1) === JSON.stringify(want1), L1);
    const add = find(y1, 'build-add')[0];
    check('R-9 · …the three picked cards on; ADD live, "＋ ADD TO YOUR VESSELS"',
      [['build-frame', 'starfighter'], ['build-engine', 'fusial_thrust_engine'], ['build-hull', 'sleek_carapace']].every(([t, k]) => find(s1, t).find((c) => c.p['data-key'] === k).p['data-on'] === 1)
      && add.p['aria-disabled'] === undefined && typeof add.p.onClick === 'function' && text(add) === '＋ ADD TO YOUR VESSELS', text(add));
    const L2 = leds(yoursOf(RoomB({ frame: 'freighter', engine: 'ion_turbine_engine', hull: 'expanded_capacity_holds', name: 'Overload' })));
    const F2 = 'FREIGHTER FRAME · FO p.79', X = '+25 · Expanded-Capacity Holds · FO p.83';
    check('R-9 · B-s2: Freighter + Ion Turbine + Expanded-Capacity Holds — ENCUMBRANCE "100 + 25 = 125" and PASSENGERS "4 + 25 = 29", each frame then hull; SYSTEM STRAIN "10 × 4 = 40"',
      JSON.stringify(L2.encumbrance) === JSON.stringify(['100 + 25 = 125', F2, X]) && JSON.stringify(L2.passengers) === JSON.stringify(['4 + 25 = 29', F2, X])
      && JSON.stringify(L2.strain) === '["10 × 4 = 40","Ion Turbine Engine · FO p.82"]' && JSON.stringify(L2.defense) === '["1/0","Ion Turbine Engine · FO p.82"]'
      && JSON.stringify(L2.armor) === '["1","Expanded-Capacity Holds · FO p.83"]' && JSON.stringify(L2.handling) === '["−2","Expanded-Capacity Holds · FO p.83"]', L2);
    const L3 = leds(yoursOf(RoomB({ frame: 'space_station', engine: 'fusial_thrust_engine', hull: 'combat_plating' })));
    check('R-9 · B-station: SPEED 0 "SPEED STAYS 0 ON A SPACE STATION · FO p.81"; DEFENSE in its four zones 1/0/0/0; SYSTEM STRAIN "4 × 8 = 32"; LONG; 100000 · 40000',
      JSON.stringify(L3.speed) === '["0","SPEED STAYS 0 ON A SPACE STATION · FO p.81"]' && L3.defense[0] === '1/0/0/0' && L3.strain[0] === '4 × 8 = 32'
      && L3.sensor[0] === 'LONG' && L3.encumbrance[0] === '100000' && L3.passengers[0] === '40000' && JSON.stringify(L3.armor) === '["3","Combat Plating · FO p.84"]', L3);
    const cv = RoomB({ frame: 'corvette', engine: 'ion_drive_array', hull: 'deflective_plating' }), L4 = leds(yoursOf(cv));
    check('R-9 · B-corvette: SILHOUETTE 5 · HULL TRAUMA 45 · HARD POINTS 12 (D-231), DEFENSE 0/0/0/0, SYSTEM STRAIN "2 × 5 = 10"; no NAME → ADD inert',
      L4.silhouette[0] === '5' && L4.hull_trauma[0] === '45' && L4.hard_points[0] === '12' && L4.defense[0] === '0/0/0/0' && L4.strain[0] === '2 × 5 = 10'
      && find(yoursOf(cv), 'build-add')[0].p['aria-disabled'] === 'true', L4);
    const pt = RoomB({ frame: 'starfighter', engine: 'fusial_thrust_engine', name: 'Knife Edge' }), L5 = leds(yoursOf(pt));
    check('R-9 · B-part: no hull picked → ARMOR and HANDLING "—", ADD inert with a NAME',
      JSON.stringify(L5.armor) === '["—"]' && JSON.stringify(L5.handling) === '["—"]' && L5.speed[0] === '3' && find(yoursOf(pt), 'build-add')[0].p['aria-disabled'] === 'true', L5);
    const rf = RoomB({ frame: 'starfighter', engine: 'high_performance_repulsor_cluster', hull: 'sleek_carapace', name: 'X' }), L6 = leds(yoursOf(rf));
    const rc = find(rf, 'build-engine').find((c) => c.p['data-key'] === 'high_performance_repulsor_cluster');
    check('R-9 · …an engine refused on this frame stays marked, refused, its numbers "—", ADD inert',
      rc.p['data-on'] === 1 && rc.p['data-refused'] === 1 && ['speed', 'defense', 'strain'].every((k) => JSON.stringify(L6[k]) === '["—"]') && find(yoursOf(rf), 'build-add')[0].p['aria-disabled'] === 'true', L6);
    // the add: ONE record, the build's keys only, then THE SHIP
    const realApply = VS.apply; let wrote = null, went = null;
    VS.apply = (fn) => { wrote = fn({ v: 2, vessels: [] }); };
    const doAdd = (host, extra) => { wrote = null; went = null; find(yoursOf(VV.YardBuild.Room(Object.assign({ host, initial: { frame: 'starfighter', engine: 'fusial_thrust_engine', hull: 'sleek_carapace', name: ' Knife Edge ' }, nav: (r) => { went = r; } }, extra))), 'build-add')[0].p.onClick(); return (wrote && wrote.vessels) || []; };
    const gv = doAdd('gm', { owner: 'char:c9' });
    check('R-9 · the GM\'s add: "＋ ADD TO PARTY" writes ONE record — owner party, vehicleKey \'\', nickname "Knife Edge", build = the three keys, mods [] — and opens THE SHIP',
      gv.length === 1 && gv[0].owner === 'party' && gv[0].vehicleKey === '' && gv[0].nickname === 'Knife Edge'
      && JSON.stringify(gv[0].build) === JSON.stringify({ frame: 'starfighter', engine: { key: 'fusial_thrust_engine', mods: [] }, hull: { key: 'sleek_carapace', mods: [] }, note: null })
      && went && went.room === 'ship' && went.id === gv[0].id, [gv, went]);
    const pv = doAdd('player', { character: { id: 'c1' } });
    check('R-9 · …the player\'s add writes it to the character (owner char:c1)', pv.length === 1 && pv[0].owner === 'char:c1' && !!pv[0].build, pv);
    VS.apply = realApply;
    const noRoster = find(yoursOf(RoomB({ frame: 'starfighter' }, { character: null, roster: [] })), 'entry-make-character');
    const choose = find(yoursOf(RoomB({}, { character: null, roster: [{ id: 'c1' }] })), 'build-add');
    check('R-9 · …no character on this device → MAKE A CHARACTER ›; characters but none chosen → ＋ ADD TO YOUR VESSELS (the entry\'s U6/U7)',
      noRoster.length === 1 && text(noRoster[0]) === 'MAKE A CHARACTER ›' && choose.length === 1 && text(choose[0]) === '＋ ADD TO YOUR VESSELS');
    win.innerWidth = 390;
    const bar = find(RoomB({ frame: 'starfighter', engine: 'fusial_thrust_engine', hull: 'sleek_carapace' }), 'build-bar')[0];
    const bar0 = find(RoomB({}), 'build-bar')[0];
    win.innerWidth = 1280;
    check('R-9 · the phone\'s sticky bar: "SPEED 3 · HANDLING +2 · ARMOR 0 · HULL 8" · "YOUR SHIP ›"; empty, every number "—"',
      bar && text(bar) === 'SPEED 3 · HANDLING +2 · ARMOR 0 · HULL 8YOUR SHIP ›' && bar0 && text(bar0) === 'SPEED — · HANDLING — · ARMOR — · HULL —YOUR SHIP ›', [bar && text(bar), bar0 && text(bar0)]);
    check('R-9 · …and the desk has no bar (YOUR SHIP stands at the side)', find(RoomB({}), 'build-bar').length === 0);
  }
  // ── R-10 · THE SHIP built (frames S-built · S-cell · M-built; 6g) ──
  {
    const B = VV.YardBuild, rec = Object.assign(built('starfighter', 'fusial_thrust_engine', 'sleek_carapace'), { nickname: 'Knife Edge' }), p = P(rec);
    check('R-10 · S-built: the hull line reads "BUILT · STARFIGHTER FRAME · SILHOUETTE 3 · UNIT · RED SQUADRON"',
      B.hullLine(rec, p.vrow, p.res, { name: 'Red Squadron' }) === 'BUILT · STARFIGHTER FRAME · SILHOUETTE 3 · UNIT · RED SQUADRON', B.hullLine(rec, p.vrow, p.res, { name: 'Red Squadron' }));
    check('R-10 · S-cell: the Hangar\'s cell reads "BUILT · STARFIGHTER FRAME · SILHOUETTE 3"; a stock ship\'s is its name',
      text(B.HullType({ rec, vrow: p.vrow, res: p.res })) === 'BUILT · STARFIGHTER FRAME · SILHOUETTE 3'
      && text(B.HullType({ rec: ship('YT1300'), vrow: lib('YT1300'), res: P(ship('YT1300')).res })) === lib('YT1300').name + ' · SILHOUETTE 4');
    const cr = (pp, id) => { const t = find(C.Panels({ p: pp, m: C.model(pp), diff: null }), 'fit-panel'); const out = []; walk(t, (n) => { if (n.p && n.p.k === id && n.t && n.t.name === 'FitLed') walk(n.c, (x) => { if (x.p && x.p['data-testid'] === 'fit-credit') out.push(text(x)); }); }); return out; };
    check('R-10 · M-built: HULL TRAUMA THRESHOLD is credited "STARFIGHTER FRAME · FO p.79"', JSON.stringify(cr(p, 'hull')) === '["STARFIGHTER FRAME · FO p.79"]', cr(p, 'hull'));
    check('R-10 · …SYSTEM STRAIN THRESHOLD "4 × 3 = 12 · Fusial Thrust Engine · FO p.82"; FORE "Fusial Thrust Engine · FO p.82"; ARMOR "Sleek Carapace · FO p.82"',
      JSON.stringify(cr(p, 'strain')) === '["4 × 3 = 12 · Fusial Thrust Engine · FO p.82"]' && JSON.stringify(cr(p, 'def_fore')) === '["Fusial Thrust Engine · FO p.82"]'
      && JSON.stringify(cr(p, 'armor')) === '["Sleek Carapace · FO p.82"]', [cr(p, 'strain'), cr(p, 'def_fore'), cr(p, 'armor')]);
    const p2 = P(built('freighter', 'ion_turbine_engine', 'expanded_capacity_holds'));
    check('R-10 · …a frame number a hull changes: the frame first, then the hull ("FREIGHTER FRAME · FO p.79", "+25 · Expanded-Capacity Holds · FO p.83")',
      JSON.stringify(cr(p2, 'enc')) === '["FREIGHTER FRAME · FO p.79","+25 · Expanded-Capacity Holds · FO p.83"]', cr(p2, 'enc'));
    const p3 = P(built('space_station', 'fusial_thrust_engine', 'combat_plating'));
    check('R-10 · …a Space Station\'s SPEED reads "SPEED STAYS 0 ON A SPACE STATION · FO p.81" alone', JSON.stringify(cr(p3, 'speed')) === '["SPEED STAYS 0 ON A SPACE STATION · FO p.81"]', cr(p3, 'speed'));
    const s4 = P(ship('YT1300'));
    check('R-10 · …a stock ship\'s credits are the resolver\'s, untouched (no FRAME credit)', JSON.stringify(B.credits(s4, s4.res.because, {})) === JSON.stringify(s4.res.because) && cr(s4, 'hull').length === 0, cr(s4, 'hull'));
  }
  // ── R-8 · s8Cite (card ADDENDUM 17's print contract) ──
  {
    const B = VV.YardBuild, bad = [];
    const page = (c) => (typeof c === 'object' ? String(c.page) : /p\.(\d+)/.exec(c)[1]);
    Object.keys(FRAMES).forEach((k) => { const t = B.cite(FRAMES[k].cite); if (t !== 'FO p.' + page(FRAMES[k].cite)) bad.push([k, t]); });
    Object.keys(ATT).filter((k) => ['engine', 'hull', 'conversion'].indexOf(ATT[k].kind) !== -1).forEach((k) => {
      const t = B.cite(ATT[k].cite), want = (ATT[k].kind === 'conversion' ? 'DC' : 'FO') + ' p.' + page(ATT[k].cite);
      if (t !== want) bad.push([k, t]);
    });
    check('R-8 · every S8 row prints "FO p.<its page>" (12 frames, 11 pieces) or "DC p.<its page>" (11 templates), as the frames draw',
      bad.length === 0 && Object.keys(FRAMES).length === 12, bad);
    const keep = (ix) => { win._swrpgSourcesIndex = ix; const t = [B.cite('fully_operational p.82'), B.cite({ book: 'fully_operational', page: 79 })]; win._swrpgSourcesIndex = VOCAB_INDEX; return t; };
    const two = { aliasToId: Object.assign({}, VOCAB_INDEX.aliasToId, { fop: 'fully_operational' }) };
    const none = { aliasToId: Object.assign({}, VOCAB_INDEX.aliasToId) }; delete none.aliasToId.fo;
    check('R-8 · …no short alias, two of them, or no vocabulary → the cite as STORED, never blank, never guessed',
      [keep(none), keep(two), keep(null)].every((t) => JSON.stringify(t) === '["fully_operational p.82","fully_operational p.79"]') && B.cite(null) === null,
      [keep(none), keep(two), keep(null)]);
  }
  finish();
}
function finish() {
  if (MUT) { console.log('MUTANT ' + MUT + ': ' + fail + ' FAIL'); process.exit(fail ? 1 : 0); }
  Object.keys(MUTANTS).concat(Object.keys(VOCAB_MUTANTS)).forEach((m) => {
    const c = spawnSync(process.execPath, [__filename, '--mutant=' + m], { encoding: 'utf8' });
    check('bite · --mutant=' + m + ' turns this guard RED — the child exits 1 (read by exit code)', c.status === 1, (c.stdout || '').split('\n').filter((l) => /^FAIL|MUTANT/.test(l)).slice(0, 2));
  });
  console.log('\nshipyard_s8_room: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
  process.exit(fail ? 1 : 0);
}
