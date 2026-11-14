/**
 * test/r7_b1636_counter_hold.cjs — GUARD for B-1636's counter half: a TRADE GOODS line bought straight INTO THE HOLD
 * (ruling `release-r7-bug-burndown` ADDENDUM 355 Q1 A, Q2 A, THE SHAPE ON PAPER; mockup HQvHzTZFtVsfFc7eEeythZ v2, D-418).
 * Loads the BUILT store (lib/store/view.js), the Yard's store (lib/shared/vesselStore.js), the resolver and the BUILT Yard
 * view (lib/shared/vesselView.js, whose `counterSeam` is the host's seam), as test/vessel_counter.cjs does.
 *
 *   §A the shape: a gear line's `for: {vessel, then: 'hold'}` and `hidden` survive the one writer and a load → re-save;
 *      the same id for the pack and for a hold are two lines (lineKeyOf by ship); a plain gear line is unchanged.
 *   §B the fold's gear arm (vesselStore.counterRefusal / deliverCounter): bad_line on `then: 'fit'`, off, away, held,
 *      not_in_the_book; delivered through loadCargo as CargoLine {kind:'item', ref, qty, hidden}, stacking; never refused
 *      over capacity.
 *   §C the debit (buildNextEquipment): a delivered hold line is charged once at its list price and never enters the pack;
 *      undeliverable or no plan → kept, charged nothing; the parts' projection (`projectedHostsOf`'s first pass) sees no
 *      hold line.
 *   §D the seam (vesselView.counterSeam): plan judges a hold line by the fold and carries THE HOLD's numbers (holdOf);
 *      deliver loads it; `ships(charId)` answers the character's own ships, the party's, then NO OWNER, active only.
 *
 * Red at the cut 8b638dbc2 (no `for` on a gear line, no gear arm, no `ships`).
 * Run:  node test/r7_b1636_counter_hold.cjs   (needs `npm run build`: it reads the built bundles)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] || null,
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

const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/gear.json'), 'utf8')).gear;
global.window._canonicalRegistries = { gear: G };
const STORE = path.join(ROOT, 'lib/store/view.js');
function loadStore(seed) {
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
try { require(path.join(ROOT, 'lib/shared/vesselResolve.js')); } catch (e) { /* the hold's room then reads "—" and §D says so */ }
require(path.join(ROOT, 'lib/shared/vesselView.js'));
const VV = global.window.SWRPGVesselView;

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}
const J = (x) => JSON.stringify(x);
const CT = 'swrpg_store_counter_v1';
const counterRec = () => JSON.parse(globalThis.localStorage.getItem(CT) || 'null');
const CASE = 'corellian_whiskey_25_bottle_case', CASE_ID = 'gear:' + CASE;
const HOLD1 = { vessel: 'v1', then: 'hold' };
check('fixtures: the case is a gear row with a price and an encumbrance', !!G[CASE] && typeof G[CASE].price === 'number' && typeof G[CASE].encumbrance === 'number');

// ════ §A THE SHAPE (355 Q2 A) ════
S.addToCounter({ id: CASE_ID, for: HOLD1 });
check('§A the one writer keeps a gear line\'s `for` (the record: id, qty, for — no price key)',
  J(counterRec().lines) === J([{ id: CASE_ID, qty: 1, for: HOLD1 }]), J(counterRec().lines));
S.addToCounter({ id: CASE_ID });
check('§A the same id for the PACK is another line (lineKeyOf keys a hold line by its ship)',
  counterRec().lines.length === 2 && J(counterRec().lines[1]) === J({ id: CASE_ID, qty: 1 }), J(counterRec().lines));
S.addToCounter({ id: CASE_ID, for: HOLD1 });
check('§A the same id for the same hold again bumps that line', counterRec().lines[0].qty === 2 && counterRec().lines.length === 2);
S.addToCounter({ id: CASE_ID, for: { vessel: 'v2', then: 'hold' } });
check('§A the same id for ANOTHER ship\'s hold is a third line', counterRec().lines.length === 3 && counterRec().lines[2].for.vessel === 'v2');
S = loadStore({ [CT]: JSON.stringify({ v: 1, shopFor: null, lines: [
  { id: CASE_ID, qty: 3, for: HOLD1, hidden: true }, { id: CASE_ID, qty: 1 }, { id: 'gear:medpac', qty: 1, future: 'x' }] }) });
S.addToCounter({ id: 'gear:stimpack' });
const RS = counterRec().lines;
check('§A load → re-save keeps a hold line\'s `for` and `hidden`', J(RS[0]) === J({ id: CASE_ID, qty: 3, for: HOLD1, hidden: true }), J(RS[0]));
check('§A a plain gear line stays the store\'s own shape (id, qty, price only — R-SPC-3)', J(RS[1]) === J({ id: CASE_ID, qty: 1 }) && J(RS[2]) === J({ id: 'gear:medpac', qty: 1 }), J(RS.slice(1, 3)));

// ════ §B THE FOLD'S GEAR ARM (vesselStore) ════
function ship(id, extra) {
  return Object.assign({ id: id, vehicleKey: 'YT1300', owner: 'party', attachments: [], mounts: [], cargo: [], provenance: [] }, extra || {});
}
const ST0 = { v: 1, vessels: [VS.normalizeVessel(ship('v1'), '2026-10-31'), VS.normalizeVessel(ship('v2'), '2026-10-31')] };
const gearRow = (id) => G[id] || null;
const CTX = { k9: true, writable: true, gearRow: gearRow };
const why = (line, ctx) => VS.counterRefusal(ST0, line, ctx || CTX);
check('§B parseCounterId reads a gear line', J(VS.parseCounterId(CASE_ID)) === J({ sec: 'gear', key: CASE }));
check('§B `then: \'fit\'` on a gear line → bad_line (a vessel-line word)', why({ id: CASE_ID, qty: 1, for: { vessel: 'v1', then: 'fit' } }) === 'bad_line');
check('§B no `for` → none', why({ id: CASE_ID, qty: 1 }) === 'none');
check('§B K9 off → off; no such ship → away; the store held → held',
  why({ id: CASE_ID, qty: 1, for: HOLD1 }, Object.assign({}, CTX, { k9: false })) === 'off'
  && why({ id: CASE_ID, qty: 1, for: { vessel: 'gone', then: 'hold' } }) === 'away'
  && why({ id: CASE_ID, qty: 1, for: HOLD1 }, Object.assign({}, CTX, { writable: false })) === 'held');
check('§B an id no gear row holds → not_in_the_book (SHIPYARD_Y2_SCHEMA\'s list)', why({ id: 'gear:b1636_no_row', qty: 1, for: HOLD1 }) === 'not_in_the_book');
check('§B a deliverable hold line → null', why({ id: CASE_ID, qty: 1, for: HOLD1 }) === null);
const RUN = VS.deliverCounter(ST0, [{ id: CASE_ID, qty: 2, for: HOLD1 }, { id: CASE_ID, qty: 1, for: HOLD1 },
  { id: CASE_ID, qty: 1, for: { vessel: 'v2', then: 'hold' }, hidden: true }], CTX, '2026-10-31', null);
const c1 = RUN.state.vessels.filter((r) => r.id === 'v1')[0].cargo, c2 = RUN.state.vessels.filter((r) => r.id === 'v2')[0].cargo;
check('§B all three delivered', J(RUN.delivered) === J([0, 1, 2]), J(RUN));
check('§B loadCargo writes ONE CargoLine {kind:\'item\', ref, qty} for v1 and stacks the second line onto it (qty 3)',
  c1.length === 1 && c1[0].kind === 'item' && c1[0].ref === CASE && c1[0].qty === 3 && !c1[0].hidden, J(c1));
check('§B a hidden hold line rides hidden', c2.length === 1 && c2[0].hidden === true && c2[0].qty === 1, J(c2));
const BIG = { v: 1, vessels: [VS.normalizeVessel(ship('v1', { cargo: [{ id: 'c_fill', kind: 'item', ref: 'gunjack_spice_100_doses', qty: 99, hidden: false }] }), '2026-10-31')] };
check('§B never refused over capacity (a hold already far past its room still loads)',
  VS.deliverCounter(BIG, [{ id: CASE_ID, qty: 1, for: HOLD1 }], CTX, '2026-10-31', null).delivered.length === 1);

// ════ §C THE DEBIT (buildNextEquipment) ════
const eq0 = { weapons: [], armor: null, gear: [], credits: 5000 };
const HL = { itemId: CASE_ID, section: 'gear', qty: 2, priceEach: G[CASE].price, edited: false, for: HOLD1 };
const PL = { itemId: CASE_ID, section: 'gear', qty: 1, priceEach: G[CASE].price, edited: false };
const KEY = CASE_ID + '→v1/hold/';
const built = S.buildNextEquipment(eq0, [HL, PL], null, { ok: { [KEY]: true }, price: {}, row: {} });
check('§C a delivered hold line is charged once at its list price, with the pack line (3 × the price)',
  built.total === 3 * G[CASE].price && built.next.credits === 5000 - 3 * G[CASE].price, String(built.total));
check('§C the hold line never enters the pack: one pack entry, qty 1', built.next.gear.length === 1 && built.next.gear[0].qty === 1, J(built.next.gear));
check('§C it rides back as its record, for the host to deliver', J(built.vessel) === J([{ id: CASE_ID, qty: 2, for: HOLD1 }]), J(built.vessel));
const kept = S.buildNextEquipment(eq0, [HL], null, { ok: { [KEY]: false }, price: {}, row: {} });
check('§C a hold line the plan cannot deliver is skipped by its key, charged nothing, nothing delivered',
  kept.total === 0 && kept.vessel.length === 0 && J(kept.skipped.ids) === J([KEY]), J(kept.skipped));
const none = S.buildNextEquipment(eq0, [HL], null);
check('§C no plan (no seam) → kept, charged nothing', none.total === 0 && none.skipped.count === 1 && none.next.gear.length === 0);
const SRC = fs.readFileSync(path.join(ROOT, 'lib/store/view.jsx'), 'utf8');
check('§C code: the slip walk sends every ship-bound line (vessel or hold) to `vessel` before the pack is touched',
  /if \(shipBound\(line\)\) \{ vessel\.push\(counterRecordOf\(line\)\); return; \}/.test(SRC));

// ════ §D THE SEAM (vesselView.counterSeam) ════
const YT = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/vehicle-library/freighters.json'), 'utf8')).entries.filter((e) => e.key === 'YT1300')[0];
setStorage(memStorage({ swrpg_saved_characters: JSON.stringify([{ id: 'kael', name: 'Kael' }, { id: 'jo', name: 'Jo' }]) }));
const FLEET = { v: 1, vessels: [
  VS.normalizeVessel(ship('party1'), '2026-10-31'),
  VS.normalizeVessel(ship('mine', { owner: 'char:kael', nickname: 'Dusty' }), '2026-10-31'),
  VS.normalizeVessel(ship('lost', { owner: 'char:kael', destroyed: { when: '2026-10-31' } }), '2026-10-31'),
  VS.normalizeVessel(ship('orphan', { owner: 'char:nobody_here' }), '2026-10-31'),
  VS.normalizeVessel(ship('other', { owner: 'char:jo' }), '2026-10-31'),
] };
VS.apply(function () { return FLEET; });
const seam0 = VV.counterSeam({ k9: true, getVehicle: (k) => (k === 'YT1300' ? YT : null), attachments: {}, weapons: {}, now: () => '2026-10-31' });
check('§D exports: the seam answers `ships`', typeof seam0.ships === 'function');
// at a build without `ships` every leg below reads [] and FAILS (never a crash): red by count, not by exception
const seam = Object.assign({ ships: () => [] }, seam0);
const order = seam.ships('kael').map((x) => x.id);
check('§D ships(kael): own, the party\'s, then NO OWNER — active only; another character\'s ship is not offered',
  J(order) === J(['mine', 'party1', 'orphan']), J(order));
setStorage(memStorage({ swrpg_saved_characters: JSON.stringify([{ id: 'jo', name: 'Jo' }]) }));
VS.apply(function () { return FLEET; });   // the vessel store reads the device's storage: re-seat the fleet on each swap
check('§D a shopper this device\'s saved list does not carry: each ship once (own is never also NO OWNER)',
  J(seam.ships('kael').map((x) => x.id)) === J(['mine', 'party1', 'orphan']), J(seam.ships('kael').map((x) => x.id)));
setStorage(memStorage({ swrpg_saved_characters: JSON.stringify([{ id: 'kael', name: 'Kael' }, { id: 'jo', name: 'Jo' }]) }));
VS.apply(function () { return FLEET; });
check('§D a ship\'s name is its nickname, else its hull\'s', J(seam.ships('kael').slice(0, 2).map((x) => x.name)) === J(['Dusty', YT.name]), J(seam.ships('kael')));
const pl = seam.plan([{ id: CASE_ID, qty: 2, for: { vessel: 'mine', then: 'hold' } }, { id: CASE_ID, qty: 1, for: { vessel: 'mine', then: 'fit' } }]).lines;
check('§D plan: a hold line is judged by the fold (ok), priced by the store (null), named, its ship named',
  pl[0].ok === true && pl[0].price === null && pl[0].name === G[CASE].name && pl[0].ship === 'Dusty' && pl[0].sec === 'gear', J(pl[0]));
check('§D plan: a hold line carries THE HOLD\'s numbers (holdOf: THE HOLD 0 OF 165, the YT-1300\'s room)',
  !!pl[0].hold && pl[0].hold.open === 0 && pl[0].hold.openCap === 165, J(pl[0].hold));
check('§D plan: `then: \'fit\'` on a gear line is refused (bad_line)', pl[1].ok === false && pl[1].why === 'bad_line', J(pl[1]));
const got = seam.deliver([{ id: CASE_ID, qty: 2, for: { vessel: 'mine', then: 'hold' } }]);
const mine = VS.getState().vessels.filter((r) => r.id === 'mine')[0] || { cargo: [] };
check('§D deliver loads the hold (one apply) and can undo', got.ok === true && mine.cargo.length === 1 && mine.cargo[0].ref === CASE && mine.cargo[0].qty === 2, J(mine.cargo));
if (typeof got.undo === 'function') got.undo();
check('§D undo puts the ship back', VS.getState().vessels.filter((r) => r.id === 'mine')[0].cargo.length === 0);

console.log(`\nr7_b1636_counter_hold: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
