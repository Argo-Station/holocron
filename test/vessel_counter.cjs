/**
 * test/vessel_counter.cjs — SHIP YARD S4 · JOB 3b · G-7: a counter line tagged for a ship.
 *
 * Ruling `shipyard-s4-workbench-contracts` R-S4WC-1 (A1–A7), ADDENDUM 1's R-S4WC-16 (the store's condition: ONE counter
 * writer) and R-S4WC-17 (the store's note: a re-save keeps `for` and any unknown key on every vessel line), and the brief's
 * A1.4 as ratified with B7/B8. Loads the BUILT store (lib/store/view.js, as test/store_kernel.cjs does), the Yard's store
 * (lib/shared/vesselStore.js) and the BUILT Yard view (lib/shared/vesselView.js, whose `counterSeam` is the host's seam),
 * over the SHIPPED registries (vehicle-attachments.json, vehicle-weapons.json) and the YT-1300's hull row.
 *
 *   §1 R-S4WC-16 — one writer: the code read (ADD TO COUNTER and `addToCounter` both run `withLine` → `commitCounter`; the
 *      counter key has one `setItem`), and the writes it makes (a vpart add bumps, a vweap add stays one line, another
 *      ship is another line).
 *   §2 R-S4WC-17 — load → re-save keeps a vessel line's `for` (and its unknown sub-keys) and its unknown keys; a gear
 *      line's record is the store's own shape, as before. A6: a mod or weapon line reads qty 1.
 *   §3 the fold (vesselStore.deliverCounter / counterRefusal): A4's reasons, each op, line order, B8's one predicate.
 *   §4 the seam (vesselView.counterSeam): A2's price read (listPrice), A5's mod price, plan = the fold, deliver all-or-none
 *      and its undo.
 *   §4c ruling `shipyard-s4-workbench` R-S4WB-6 — a part priced per point of silhouette: listPrice(row, hull) = the printed
 *      base × the hull's silhouette (FaD p.269–270), a flat part unchanged; no silhouette → no price, and the counter
 *      refuses the line (no price, no sale), U12's book test included.
 *   §5 A3 — the debit (buildNextEquipment with the plan): only what can be delivered is charged, nothing enters the sheet
 *      for a vessel line, the rest is kept; no plan → every vessel line is kept (a host that hands no seam).
 *   §6 B7 — the reader hands the record's shape.
 *
 * Run:  node test/vessel_counter.cjs   (needs `npm run build`: it reads the built bundles, as store_kernel does)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── the browser globals the three classic scripts touch at load ──
function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
  };
}
function setStorage(st) {
  Object.defineProperty(globalThis, 'localStorage', { value: st, configurable: true, writable: true });
  global.window.localStorage = st;
}
global.window = globalThis.window || {};
global.React = {
  createElement: function () { return null; }, Fragment: 'fragment',
  useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
  useEffect: function () {}, useRef: function () { return { current: null }; },
  useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
  useSyncExternalStore: function (_s, g) { return g(); },
};
global.window.React = global.React;
global.window.addEventListener = function () {};
global.window.removeEventListener = function () {};
setStorage(memStorage());

const STORE = path.join(ROOT, 'lib/store/view.js');
function loadStore(seed) {   // a fresh module over a seeded device: the counter is read at load
  setStorage(memStorage(seed));
  delete require.cache[require.resolve(STORE)];
  require(STORE);
  return global.window.SWRPGStore;
}
require(path.join(ROOT, 'lib/store/glyphs.js'));
require(path.join(ROOT, 'lib/store/rarity.js'));
let S = loadStore();
require(path.join(ROOT, 'lib/shared/vesselStore.js'));
const VS = global.window.SWRPGVessels;
require(path.join(ROOT, 'lib/shared/vesselView.js'));
const VV = global.window.SWRPGVesselView;

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}
const J = (x) => JSON.stringify(x);
const CT = 'swrpg_store_counter_v1';
function counterRec() { return JSON.parse(globalThis.localStorage.getItem(CT) || 'null'); }

// ── the shipped registries and a hull ──
const ATT = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/vehicle-attachments.json'), 'utf8')).vehicle_attachments;
const WPN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/vehicle-weapons.json'), 'utf8')).vehicle_weapons;
const YT = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/vehicle-library/freighters.json'), 'utf8')).entries
  .filter((e) => e.key === 'YT1300')[0];
check('fixtures: the YT-1300 hull row carries its two medium laser cannons', !!YT && J(YT.weapons.map((w) => w.key)) === J(['LASERMED', 'LASERMED']));
const PART = Object.keys(ATT).filter((k) => typeof ATT[k].price === 'number' && (ATT[k].added_options || []).length)[0];
const PART2 = Object.keys(ATT).filter((k) => k !== PART && typeof ATT[k].price === 'number')[0];
const OPT = ATT[PART].added_options[0].id;
check('fixtures: a priced part with a mod option (' + PART + ' / ' + OPT + ') and a second priced part (' + PART2 + ')', !!PART && !!OPT && !!PART2);

// ════ §1 R-S4WC-16 — THE ONE WRITER ════
const SRC = fs.readFileSync(path.join(ROOT, 'lib/store/view.jsx'), 'utf8');
function bodyOf(name) {
  const at = SRC.indexOf('function ' + name + '(');
  if (at < 0) return '';
  let i = SRC.indexOf('{', at), d = 0, j = i;
  for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}') { d--; if (!d) break; } }
  return SRC.slice(i, j + 1);
}
check('§1 code: the store\'s ADD TO COUNTER (`addToCart`) runs `withLine(session.cart, …)` into `setCart`',
  /setCart\(withLine\(session\.cart,/.test(bodyOf('addToCart')));
check('§1 code: the exported `addToCounter` runs the SAME `withLine(session.cart, …)` into `commitCounter`',
  /withLine\(session\.cart, add\)/.test(bodyOf('addToCounter')) && /commitCounter\(next\)/.test(bodyOf('addToCounter')));
check('§1 code: `setCart` persists through `commitCounter`, which alone writes the lines (`saveCounter`)',
  /commitCounter\(next\)/.test(bodyOf('setCart')) && /saveCounter\(next, session\.shopFor\)/.test(bodyOf('commitCounter')));
check('§1 code: the counter key has ONE `setItem` (inside `saveCounter`)',
  (SRC.match(/localStorage\.setItem\(COUNTER_KEY/g) || []).length === 1 && /localStorage\.setItem\(COUNTER_KEY/.test(bodyOf('saveCounter')));
check('§1 code: `withLine` normalizes through the record\'s own reader and qualifies through `qualifyKey`',
  /counterLineOf\(\{ id: add\.id/.test(bodyOf('withLine')) && /qualifyKey\(line\.itemId/.test(bodyOf('withLine')));
check('§1 exports: the writer and its one-reader twin are on SWRPGStore',
  typeof S.addToCounter === 'function' && typeof S.counterVesselLines === 'function');

S = loadStore();
const FIT1 = { vessel: 'v1', then: 'fit' };
check('§1 an add is written: one vpart line for v1, qty 1, `for` kept, no price key (a list price is never stored)',
  S.addToCounter({ id: 'vpart:' + PART, for: FIT1 }) === true
  && J(counterRec().lines) === J([{ id: 'vpart:' + PART, qty: 1, for: FIT1 }]));
S.addToCounter({ id: 'vpart:' + PART, for: FIT1 });
check('§1 the same part for the same ship again bumps the line (A6: a vpart line\'s qty is n copies)',
  counterRec().lines.length === 1 && counterRec().lines[0].qty === 2);
S.addToCounter({ id: 'vpart:' + PART, for: { vessel: 'v2', then: 'fit' } });
check('§1 the same part for ANOTHER ship is another line', counterRec().lines.length === 2 && counterRec().lines[1].for.vessel === 'v2');
const W1 = { id: 'vweap:LASERQUAD', for: { vessel: 'v1', then: 'fit', mount: 0 } };
S.addToCounter(W1); S.addToCounter(W1);
check('§1 a weapon line added twice stays ONE line at qty 1 (A1.4 · A6)',
  counterRec().lines.filter((l) => l.id === W1.id).length === 1 && counterRec().lines.filter((l) => l.id === W1.id)[0].qty === 1);
check('§1 a line with no id is refused and writes nothing', S.addToCounter({ for: FIT1 }) === false && counterRec().lines.length === 3);
check('§1 the host bar\'s count reads the same slip (cartCount)', S.cartCount() === 2 + 1 + 1);

// ════ §2 R-S4WC-17 — LOAD → RE-SAVE KEEPS `for` AND THE UNKNOWN KEYS ════
const SEED = { v: 1, lines: [
  { id: 'vpart:' + PART, qty: 1, for: { vessel: 'v1', then: 'hold', later: 'sub-key' }, future: 'keep-me', n: 3 },
  { id: 'vmod:' + PART + '/' + OPT, qty: 4, for: { vessel: 'v1', then: 'fit', att: 0 } },
  { id: 'vweap:LASERQUAD', qty: 2, for: { vessel: 'v1', then: 'fit', mount: 1 } },
  { id: 'vpart:' + PART2, qty: 1 },
  { id: 'weapons:blaster_pistol', qty: 1, junk: 5 },
], shopFor: null };
S = loadStore({ [CT]: J(SEED) });
S.addToCounter({ id: 'vpart:' + PART2, for: { vessel: 'v9', then: 'fit' } });   // a write: the record is re-saved whole
const RS = counterRec().lines;
check('§2 a vessel line keeps `for` with its unknown sub-key through a re-save', J(RS[0].for) === J({ vessel: 'v1', then: 'hold', later: 'sub-key' }));
check('§2 a vessel line keeps its unknown keys through a re-save', RS[0].future === 'keep-me' && RS[0].n === 3);
check('§2 A6: a mod line and a weapon line read qty 1, whatever the record said', RS[1].qty === 1 && RS[2].qty === 1);
check('§2 A1: a vessel line with no `for` stays one (kept, never given a ship)', J(RS[3]) === J({ id: 'vpart:' + PART2, qty: 1 }));
check('§2 a gear line\'s record is the store\'s own shape, as before (R-SPC-3: id, qty, price only)', J(RS[4]) === J({ id: 'weapons:blaster_pistol', qty: 1 }));
check('§2 the re-save lost no line and added the new one at the end', RS.length === 6 && RS[5].for.vessel === 'v9');

// ════ §3 THE FOLD (vesselStore) ════
function ship(id, extra) {
  return Object.assign({ id: id, vehicleKey: 'YT1300', owner: 'party', attachments: [], mounts: [], cargo: [], provenance: [] }, extra || {});
}
const ST0 = { v: 1, vessels: [VS.normalizeVessel(ship('v1'), '2026-09-30'), VS.normalizeVessel(ship('v2'), '2026-09-30')] };
const HULL = (id) => (id === 'v1' || id === 'v2') ? YT.weapons.map((w) => w.key) : null;
const CTX = { k9: true, writable: true, hull: HULL, attachments: ATT, weapons: WPN };
const rec = (st, id) => st.vessels.filter((r) => r.id === id)[0];
const why = (line, ctx, st) => VS.counterRefusal(st || ST0, line, ctx || CTX);
check('§3 A1: no `for` → none', why({ id: 'vpart:' + PART, qty: 1 }) === 'none');
check('§3 an id this build cannot read → bad_line', why({ id: 'vpart:', qty: 1, for: FIT1 }) === 'bad_line' && why({ id: 'vmod:' + PART, qty: 1, for: FIT1 }) === 'bad_line'
  && why({ id: 'vmod:' + PART + '/' + OPT, qty: 1, for: { vessel: 'v1', then: 'hold', att: 0 } }) === 'bad_line');
check('§3 A4: K9 OFF → off', why({ id: 'vpart:' + PART, qty: 1, for: FIT1 }, Object.assign({}, CTX, { k9: false })) === 'off');
check('§3 A4: the ship is not on this device → away', why({ id: 'vpart:' + PART, qty: 1, for: { vessel: 'gone', then: 'fit' } }) === 'away');
check('§3 A4: the door\'s write rule fails (the store is held, V-1) → held', why({ id: 'vpart:' + PART, qty: 1, for: FIT1 }, Object.assign({}, CTX, { writable: false })) === 'held');
check('§3 A2: a part the registry does not hold has no price → not_in_the_book', why({ id: 'vpart:no_such_part', qty: 1, for: FIT1 }) === 'not_in_the_book');
check('§3 a deliverable part → null', why({ id: 'vpart:' + PART, qty: 1, for: FIT1 }) === null);

const RUN1 = VS.deliverCounter(ST0, [
  { id: 'vpart:' + PART, qty: 2, for: FIT1 },
  { id: 'vpart:' + PART2, qty: 3, for: { vessel: 'v1', then: 'hold' } },
  { id: 'vweap:LASERQUAD', qty: 1, for: { vessel: 'v2', then: 'hold' } },
], CTX, '2026-09-30', null);
const v1 = rec(RUN1.state, 'v1'), v2 = rec(RUN1.state, 'v2');
check('§3 vpart·fit qty 2 → two installs, each an INSTALLED line with reason bought',
  v1.attachments.length === 2 && v1.attachments.every((a) => a.key === PART)
  && v1.provenance.filter((e) => e.kind === 'installed' && e.ref === PART && e.reason === 'bought').length === 2);
check('§3 vpart·hold → ONE CargoLine {kind part, ref, qty 3} and no log line (a spare writes none)',
  v1.cargo.length === 1 && v1.cargo[0].kind === 'part' && v1.cargo[0].ref === PART2 && v1.cargo[0].qty === 3 && /^c_/.test(v1.cargo[0].id)
  && v1.provenance.filter((e) => e.ref === PART2).length === 0);
check('§3 vweap·hold → CargoLine {kind weapon, from_mount null, qty 1}, no log line',
  v2.cargo.length === 1 && v2.cargo[0].kind === 'weapon' && v2.cargo[0].ref === 'LASERQUAD' && v2.cargo[0].from_mount === null && v2.cargo[0].qty === 1
  && v2.provenance.length === 0);
check('§3 the fold reports every line delivered and writes nothing to the state it was handed',
  J(RUN1.delivered) === J([0, 1, 2]) && J(RUN1.refused) === '{}' && rec(ST0, 'v1').attachments.length === 0);

const MOD = { id: 'vmod:' + PART + '/' + OPT, qty: 1, for: { vessel: 'v1', then: 'fit', att: 0 } };
check('§3 A4: a mod whose `att` names no part → no_part', why(MOD) === 'no_part');
const ST1 = RUN1.state;
check('§3 a mod whose `att` names the part in its id → null', why(MOD, CTX, ST1) === null);
check('§3 A4: a mod whose `att` names ANOTHER part → no_part',
  why({ id: 'vmod:' + PART2 + '/' + OPT, qty: 1, for: { vessel: 'v1', then: 'fit', att: 0 } }, CTX, ST1) === 'no_part');
const RUN2 = VS.deliverCounter(ST1, [MOD, MOD], CTX, '2026-09-30', null);
check('§3 vmod → installMod, once per line, in line order (two lines, two ranks)',
  rec(RUN2.state, 'v1').attachments[0].mods.length === 2 && rec(RUN2.state, 'v1').attachments[0].mods.every((m) => m.option === OPT));

const SW0 = { id: 'vweap:LASERQUAD', qty: 1, for: { vessel: 'v1', then: 'fit', mount: 0 } };
const SW1 = { id: 'vweap:TURBOLT', qty: 1, for: { vessel: 'v1', then: 'fit', mount: 0 } };
const RUN3 = VS.deliverCounter(ST1, [SW0, SW1, SW1], CTX, '2026-09-30', null);
const v1s = rec(RUN3.state, 'v1'), m0 = v1s.mounts.filter((m) => m.i === 0)[0];
check('§3 two swaps of one mount in one deal: the second takes the first\'s weapon off (line order)',
  J(RUN3.delivered) === J([0, 1]) && m0 && m0.replaced_by === 'TURBOLT' && m0.key === 'LASERMED'
  && J(v1s.cargo.filter((c) => c.kind === 'weapon').map((c) => c.ref)) === J(['LASERMED', 'LASERQUAD']));
check('§3 …and the third line, the same weapon again, is refused by the swap\'s own test (already_fitted)', RUN3.refused[2] === 'already_fitted');
check('§3 a bought swap logs INSTALLED (reason bought) then REMOVED to the hold',
  J(v1s.provenance.filter((e) => e.kind === 'installed' || e.kind === 'removed').map((e) => e.kind + ':' + e.ref + ':' + (e.reason || e.to)))
  === J(['installed:' + PART + ':bought', 'installed:' + PART + ':bought', 'installed:LASERQUAD:bought', 'removed:LASERMED:hold', 'installed:TURBOLT:bought', 'removed:LASERQUAD:hold']));
// B8 — ONE predicate: a weapon line's refusal IS swapRefusal's, for every case
const B8 = [
  [SW0, ST1], [SW0, RUN3.state], [SW1, RUN3.state],
  [{ id: 'vweap:LASERQUAD', qty: 1, for: { vessel: 'v1', then: 'fit', mount: 7 } }, ST1],
  [{ id: 'vweap:NOPE', qty: 1, for: { vessel: 'v1', then: 'fit', mount: 1 } }, ST1],
  [{ id: 'vweap:LASERMED', qty: 1, for: { vessel: 'v1', then: 'fit', mount: 1 } }, ST1],
];
check('§3 B8: a vweap·fit line\'s refusal equals swapRefusal\'s over six cases (fits · after a swap · already fitted · no mount · not in the book · the hull\'s own)',
  B8.every(([l, st]) => VS.counterRefusal(st, l, CTX) === VS.swapRefusal(st, l.for.vessel, l.for.mount, l.id.slice(6), { hull: HULL(l.for.vessel), weapons: WPN })),
  J(B8.map(([l, st]) => [VS.counterRefusal(st, l, CTX), VS.swapRefusal(st, l.for.vessel, l.for.mount, l.id.slice(6), { hull: HULL(l.for.vessel), weapons: WPN })])));
check('§3 a spare weapon the registry does not hold → not_in_the_book', why({ id: 'vweap:NOPE', qty: 1, for: { vessel: 'v1', then: 'hold' } }) === 'not_in_the_book');

// ════ §4 THE SEAM (vesselView.counterSeam) ════
check('§4 exports: counterSeam and listPrice', typeof VV.counterSeam === 'function' && typeof VV.listPrice === 'function');
check('§4 A2: listPrice reads a row\'s printed price, or null', VV.listPrice(ATT[PART]) === ATT[PART].price && VV.listPrice(WPN.LASERQUAD) === WPN.LASERQUAD.price
  && VV.listPrice({ price: null }) === null && VV.listPrice(null) === null);
setStorage(memStorage({ [VS.VESSELS_KEY]: J({ v: 3, vessels: ST1.vessels }) }));
VS.refresh && VS.refresh();
const live0 = VS.getState();
check('§4 the Yard\'s store reads the seeded device (v1 with two parts)', !!rec(live0, 'v1') && rec(live0, 'v1').attachments.length === 2,
  J(live0 && live0.vessels && live0.vessels.map((v) => v.id)));
const seam = VV.counterSeam({ k9: true, getVehicle: (k) => (k === 'YT1300' ? YT : null), attachments: ATT, weapons: WPN, now: () => '2026-09-30' });
const LINES = [
  { id: 'vpart:' + PART2, qty: 1, for: FIT1 },
  MOD, MOD,
  { id: 'vmod:' + PART + '/' + OPT, qty: 1, for: { vessel: 'v1', then: 'fit', att: 1 } },
  SW0,
  { id: 'vpart:' + PART, qty: 1 },
];
const PL = seam.plan(LINES).lines;
check('§4 A2: a part\'s and a weapon\'s price are the rows\' printed prices (the read FIT prints from)',
  PL[0].price === ATT[PART2].price && PL[4].price === WPN.LASERQUAD.price);
check('§4 A5: a mod = 100 × N × 10; N counts the mods on THAT part and its earlier mod lines, + 1 (1,000 · 2,000; the other part 1,000)',
  PL[1].price === 1000 && PL[2].price === 2000 && PL[3].price === 1000, J(PL.map((l) => l.price)));
check('§4 plan = the fold: ok for the five with a ship, none for the line without one',
  J(PL.map((l) => l.ok)) === J([true, true, true, true, true, false]) && PL[5].why === 'none');
check('§4 the plan names the part and the ship', PL[0].name === ATT[PART2].name && PL[0].ship === 'YT-1300 Light Freighter');
const offPlan = VV.counterSeam({ k9: false, getVehicle: () => YT, attachments: ATT, weapons: WPN }).plan([LINES[0]]).lines[0];
check('§4 K9 OFF → the plan says off, and is not ok', offPlan.ok === false && offPlan.why === 'off');
check('§4 the plan wrote nothing', J(VS.getState()) === J(live0));
const bad = seam.deliver([LINES[0], LINES[5]]);
check('§4 deliver is all or none: a line that cannot deliver → ok false and the ships untouched', bad.ok === false && J(VS.getState()) === J(live0));
const good = seam.deliver([LINES[0], SW0]);
const v1d = rec(VS.getState(), 'v1');
check('§4 deliver writes every handed line in one apply', good.ok === true && v1d.attachments.length === 3
  && v1d.mounts.filter((m) => m.i === 0 && m.replaced_by === 'LASERQUAD').length === 1);
check('§4 …and persisted them (the vessels key on the device)', JSON.parse(globalThis.localStorage.getItem(VS.VESSELS_KEY)).vessels.filter((v) => v.id === 'v1')[0].attachments.length === 3);
good.undo();
check('§4 undo puts the ships back (the sheet\'s write failed: the same act)', rec(VS.getState(), 'v1').attachments.length === 2
  && rec(VS.getState(), 'v1').mounts.length === 0);

// ════ §4b A3 — FINALIZE THROUGH THE SEAM (the host's `onFinalize`, VV.finalizeThrough): deliver first, then the sheet ════
// The player's Store mount hands the store `finalizeThrough(seam, handleStoreFinalize)`. Its three answers, each read back
// from the Yard's store: delivered then written; a delivery refused → false and the sheet never asked; the sheet refusing →
// false and the ships put back. The page cannot make the host's save answer false (D-B5 drops a failed save), so the undo
// half of the contract is legged here.
const base4b = VS.getState(), calls = [];
function sheetWrite(answer) { return function (id, next, summary) { calls.push([id, summary && summary.vessel ? summary.vessel.length : 0]); return answer; }; }
let fin = VV.finalizeThrough(seam, sheetWrite(true))('c1', {}, { total: 1, count: 1, vessel: [LINES[0]] });
check('§4b delivered, then the sheet written: true, the part aboard, the sheet asked once with the ship line',
  fin === true && rec(VS.getState(), 'v1').attachments.length === 3 && J(calls) === J([['c1', 1]]));
VS.apply(function () { return base4b; });
calls.length = 0;
fin = VV.finalizeThrough(seam, sheetWrite(true))('c1', {}, { total: 1, count: 1, vessel: [LINES[0], LINES[5]] });
check('§4b a delivery the fold refuses → false, the ships untouched, and the sheet NEVER asked (nothing charged)',
  fin === false && J(VS.getState()) === J(base4b) && calls.length === 0);
fin = VV.finalizeThrough(seam, sheetWrite(false))('c1', {}, { total: 1, count: 1, vessel: [LINES[0]] });
check('§4b the sheet\'s write answering false → false, and the ships put back (undo, the same act)',
  fin === false && rec(VS.getState(), 'v1').attachments.length === 2 && calls.length === 1);
fin = VV.finalizeThrough({ loading: true, deliver: function () { throw new Error('never'); } }, sheetWrite(true))('c1', {}, { vessel: [LINES[0]] });
check('§4b a seam still loading → false, nothing delivered, the sheet not asked', fin === false && calls.length === 1);
fin = VV.finalizeThrough(null, sheetWrite(true))('c1', {}, { total: 5, count: 1 });
check('§4b no ship line → the sheet\'s write unchanged (no seam needed)', fin === true && calls.length === 2);
VS.apply(function () { return base4b; });

// ════ §4c R-S4WB-6 — A PART PRICED PER POINT OF SILHOUETTE (ruling `shipyard-s4-workbench` §5; FaD p.269–270) ════
// The registry flags the eleven parts OggDude marks <PriceSizeMult>true, and `price` stays the printed base ("2,000 x
// silhouette"). Every expected number is the registry's row × the hull row's silhouette, never the module's.
const ECDA = 'enhanced_carbon_durasteel_armor';
const FLAGGED = Object.keys(ATT).filter((k) => ATT[k].price_per_silhouette === true);
check('§4c fixtures: the YT-1300 is silhouette 4, and Enhanced Carbon-Durasteel Armor is flagged at its printed base, 2,000',
  YT.silhouette === 4 && !!ATT[ECDA] && ATT[ECDA].price_per_silhouette === true && ATT[ECDA].price === 2000);
check('§4c listPrice: a flagged part costs its price × the hull\'s silhouette (2,000 × 4 = 8,000), for each of the eleven',
  VV.listPrice(ATT[ECDA], YT) === 8000 && FLAGGED.length === 11 && FLAGGED.every((k) => VV.listPrice(ATT[k], YT) === ATT[k].price * YT.silhouette),
  J(FLAGGED.map((k) => [k, VV.listPrice(ATT[k], YT)])));
check('§4c listPrice: a flat part is unchanged by the hull (this hull, none, another silhouette)',
  ATT[PART2].price_per_silhouette === undefined && VV.listPrice(ATT[PART2], YT) === ATT[PART2].price
  && VV.listPrice(ATT[PART2], null) === ATT[PART2].price && VV.listPrice(ATT[PART2], { silhouette: 9 }) === ATT[PART2].price);
check('§4c listPrice: a flagged part with no silhouette to read has no price (no hull · no field · null · not a number)',
  VV.listPrice(ATT[ECDA], null) === null && VV.listPrice(ATT[ECDA], {}) === null
  && VV.listPrice(ATT[ECDA], { silhouette: null }) === null && VV.listPrice(ATT[ECDA], { silhouette: '4' }) === null);
check('§4c listPrice: silhouette 0 is a number (one hull in the library carries it): 2,000 × 0 = 0, never "no price"',
  VV.listPrice(ATT[ECDA], { silhouette: 0 }) === 0);
const ECDA_FIT = { id: 'vpart:' + ECDA, qty: 1, for: FIT1 }, ECDA_HOLD = { id: 'vpart:' + ECDA, qty: 1, for: { vessel: 'v1', then: 'hold' } };
const PL6 = seam.plan([ECDA_FIT, ECDA_HOLD]).lines;
check('§4c the counter\'s plan prices the line on its ship\'s hull (v1, a YT-1300): 8,000, deliverable, fitted or to the hold',
  PL6[0].ok === true && PL6[0].price === 8000 && PL6[1].ok === true && PL6[1].price === 8000, J(PL6.map((l) => [l.ok, l.why, l.price])));
const noHull = VV.counterSeam({ k9: true, getVehicle: () => null, attachments: ATT, weapons: WPN, now: () => '2026-09-30' });
const PL7 = noHull.plan([ECDA_FIT, ECDA_HOLD, { id: 'vpart:' + PART2, qty: 1, for: FIT1 }]).lines;
check('§4c no price, no sale: no hull to read → the flagged line is refused (not_in_the_book, the fold\'s word) and priced nothing, fitted or to the hold',
  PL7[0].ok === false && PL7[0].why === 'not_in_the_book' && PL7[0].price === null
  && PL7[1].ok === false && PL7[1].why === 'not_in_the_book' && PL7[1].price === null, J(PL7.map((l) => [l.ok, l.why, l.price])));
check('§4c …a flat part on that same ship still delivers at its printed price (the refusal is the flagged part\'s alone)',
  PL7[2].ok === true && PL7[2].price === ATT[PART2].price);
check('§4c …and deliver refuses the flagged line, the ships untouched (the fold decides, as the plan said)',
  noHull.deliver([ECDA_FIT]).ok === false && J(VS.getState()) === J(base4b));
const SRC0 = global.window.SWRPGSources;
global.window.SWRPGSources = { current: () => ({ index: {}, off: [] }), isActiveWith: () => false };   // every book switched off
const PL8 = seam.plan([ECDA_FIT, { id: 'vpart:' + PART2, qty: 1, for: FIT1 }]).lines;
global.window.SWRPGSources = SRC0;
check('§4c U12: with the hull\'s book switched off the counter reads no silhouette, as FIT does ("—"): refused, priced nothing; a flat part still sells',
  PL8[0].ok === false && PL8[0].why === 'not_in_the_book' && PL8[0].price === null && PL8[1].ok === true && PL8[1].price === ATT[PART2].price,
  J(PL8.map((l) => [l.ok, l.why, l.price])));

// ════ §5 A3 — THE DEBIT ════
const eq0 = { weapons: [], armor: null, gear: [], credits: 50000 };
const cart = [
  { itemId: 'vpart:' + PART2, section: 'vpart', qty: 2, priceEach: 0, edited: false, for: FIT1 },
  { itemId: 'vweap:LASERQUAD', section: 'vweap', qty: 1, priceEach: 999, edited: true, for: SW0.for },
  { itemId: 'vpart:' + PART, section: 'vpart', qty: 1, priceEach: 0, edited: false },
  { itemId: 'medpac', section: 'gear', qty: 1, priceEach: 100 },
];
const KEY = (l) => l.itemId + (l.for ? '→' + [l.for.vessel, l.for.then, l.for.att != null ? l.for.att : l.for.mount != null ? l.for.mount : ''].join('/') : '');
const plan = { ok: { [KEY(cart[0])]: true, [KEY(cart[1])]: true, [KEY(cart[2])]: false }, price: { [KEY(cart[0])]: 4000, [KEY(cart[1])]: 7000, [KEY(cart[2])]: 1400 } };
const built = S.buildNextEquipment(eq0, cart, null, plan);
check('§5 A3: the debit counts only deliverable vessel lines, at the plan\'s price unless edited (2×4,000 + 999 + 100)',
  built.total === 8000 + 999 + 100 && built.next.credits === 50000 - 9099, String(built.total));
check('§5 nothing enters the sheet for a vessel line; the gear line does', built.next.gear.length === 1 && built.next.gear[0].id === 'medpac' && built.next.weapons.length === 0);
check('§5 the charged vessel lines ride back as records, for the host to deliver',
  J(built.vessel) === J([{ id: 'vpart:' + PART2, qty: 2, for: FIT1 }, { id: 'vweap:LASERQUAD', qty: 1, price: 999, for: SW0.for }]));
check('§5 the undeliverable line is skipped by its line key, kept and charged nothing', J(built.skipped.ids) === J(['vpart:' + PART]) && built.skipped.count === 1);
const noPlan = S.buildNextEquipment(eq0, cart, null);
check('§5 no plan (a host that hands no seam) → every vessel line is kept and nothing about a ship is charged',
  noPlan.total === 100 && noPlan.vessel.length === 0 && noPlan.skipped.count === 3);
// R-S4WB-6: the plan keyed as the store keys it (vesselPlanOf: the line key → the seam's answer), from the REAL seam's answer
const cart6 = [{ itemId: 'vpart:' + ECDA, section: 'vpart', qty: 1, priceEach: 0, edited: false, for: FIT1 }];
const ans6 = seam.plan([ECDA_FIT]).lines[0], ans7 = noHull.plan([ECDA_FIT]).lines[0];
const built6 = S.buildNextEquipment(eq0, cart6, null, { ok: { [KEY(cart6[0])]: ans6.ok }, price: { [KEY(cart6[0])]: ans6.price } });
check('§5 R-S4WB-6: the debit charges the seam\'s per-silhouette price, 8,000 for the armour on the YT-1300',
  built6.total === 8000 && built6.next.credits === 50000 - 8000 && built6.vessel.length === 1, String(built6.total));
const built7 = S.buildNextEquipment(eq0, cart6, null, { ok: { [KEY(cart6[0])]: ans7.ok }, price: { [KEY(cart6[0])]: ans7.price } });
check('§5 R-S4WB-6: with no silhouette the line is kept and charged nothing (A3)',
  built7.total === 0 && built7.next.credits === 50000 && built7.vessel.length === 0 && built7.skipped.count === 1);

// ════ §6 B7 — THE READER ════
S = loadStore({ [CT]: J({ v: 1, lines: [W1, { id: 'weapons:blaster_pistol', qty: 1 }, { id: 'vpart:' + PART, qty: 1, for: FIT1 }] }) });
check('§6 B7: counterVesselLines hands the vessel lines as records, in order, and no gear line',
  J(S.counterVesselLines()) === J([{ id: W1.id, qty: 1, for: W1.for }, { id: 'vpart:' + PART, qty: 1, for: FIT1 }]), J(S.counterVesselLines()));

console.log('\nvessel_counter: ' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
