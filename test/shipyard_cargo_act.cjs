/**
 * test/shipyard_cargo_act.cjs — SHIP CARGO · THE ACT: LOAD and UNLOAD as one act over two records.
 *
 * Card `shipyard-cargo-build` R-SCB-2/-3 (ruling `shipyard-cargo-concept` R-SCG-1..4; ruling
 * `shipyard-cargo-build-gm-character-write` R-SCW-2/-7). Loads the BUILT store (lib/store/view.js — its `stackTargetOf` is the
 * one stacking rule the character's half calls), the Yard's store (lib/shared/vesselStore.js) and the BUILT Yard view
 * (lib/shared/vesselView.js), over the SHIPPED gear registry.
 *
 *   §1 the character's half, pure: cargoLoadNext (a count off one entry; the entry gone at 0; an inline copy HELD) and
 *      cargoUnloadNext (onto the store's stack target, else a NEW entry with the store's PROV shape {note, when}).
 *   §2 LOAD: every refusal decided before any write (no write call, the ships untouched); the ship first, then the
 *      character; a refused character write puts the ship back.
 *   §3 UNLOAD: the character first, then the ship; a refused ship write puts the character back.
 *   §4 R-SCG-4 WHO: the player host, an owned ship's owner or a party ship; the GM host, any.
 *
 * Run:  node test/shipyard_cargo_act.cjs   (needs `npm run build`: it reads the built bundles, as vessel_counter does)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] || null, get length() { return m.size; },
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
const LISTEN = [];   // the store's own `storage` listener: a reset device reaches it as another tab's write does
global.window.addEventListener = function (type, fn) { if (type === 'storage') LISTEN.push(fn); };
global.window.removeEventListener = function () {};
setStorage(memStorage());
require(path.join(ROOT, 'lib/store/glyphs.js'));
require(path.join(ROOT, 'lib/store/rarity.js'));
require(path.join(ROOT, 'lib/store/view.js'));
require(path.join(ROOT, 'lib/shared/vesselStore.js'));
require(path.join(ROOT, 'lib/shared/vesselView.js'));
const S = global.window.SWRPGStore, VS = global.window.SWRPGVessels, VV = global.window.SWRPGVesselView;

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}
const J = (x) => JSON.stringify(x);
const clone = (x) => JSON.parse(J(x));

const GEAR = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/gear.json'), 'utf8')).gear;   // id → row
const gearRow = (ref) => GEAR[ref] || null;
const AVA = 'avabush_spice_100_dose_cargo_container', GLT = 'glitterstim_100_dose_cargo_container', MED = 'emergency_medpac';
check('fixtures: the shipped gear list holds the two cargo containers and the medpac', !!GEAR[AVA] && !!GEAR[GLT] && !!GEAR[MED]);
check('exports: the act and its two pure halves', ['cargoLoadNext', 'cargoUnloadNext', 'cargoLoad', 'cargoUnload', 'cargoInScope'].every((k) => typeof VV[k] === 'function')
  && typeof S.stackTargetOf === 'function');

// ════ §1 THE CHARACTER'S HALF (pure) ════
const PROV = [{ note: 'purchased — 500 cr', when: '2026-10-19' }];
const EQ = { credits: 120, weapons: [{ id: 'blaster_pistol' }], gear: [
  { id: AVA, qty: 3, provenance: PROV }, { _inline: { id: 'house_medpac', name: 'House Medpac' }, qty: 1 }, { id: MED, qty: 1 }] };
const l1 = VV.cargoLoadNext(EQ, 0, 2);
check('§1 cargoLoadNext (partial): the entry\'s count 3 → 1, its story kept; the rest of the record untouched; the input not mutated',
  !!l1 && l1.gear[0].qty === 1 && J(l1.gear[0].provenance) === J(PROV) && l1.gear.length === 3 && l1.credits === 120 && J(l1.weapons) === J(EQ.weapons)
    && EQ.gear[0].qty === 3, J(l1));
const l2 = VV.cargoLoadNext(EQ, 0, 3);
check('§1 cargoLoadNext (all of it): the entry leaves the pack', !!l2 && l2.gear.length === 2 && !l2.gear.some((g) => g.id === AVA), J(l2));
check('§1 cargoLoadNext refuses: an inline copy (HELD, R-SCG-6), more than held, 0, 1.5, no such entry',
  VV.cargoLoadNext(EQ, 1, 1) === null && VV.cargoLoadNext(EQ, 0, 4) === null && VV.cargoLoadNext(EQ, 0, 0) === null
    && VV.cargoLoadNext(EQ, 0, 1.5) === null && VV.cargoLoadNext(EQ, 9, 1) === null);
const u1 = VV.cargoUnloadNext(EQ, MED, 2, 'unloaded from YT-1300 Light Freighter', '2026-10-21');
check('§1 cargoUnloadNext (a stack held): onto it, 1 → 3, and no note added (F7)',
  u1.gear.length === 3 && u1.gear[2].qty === 3 && u1.gear[2].provenance === undefined, J(u1.gear));
const u2 = VV.cargoUnloadNext(EQ, GLT, 2, 'unloaded from YT-1300 Light Freighter', '2026-10-21');
check('§1 cargoUnloadNext (new goods): a NEW entry {id, qty, provenance: [{note, when}]} — the store\'s PROV shape',
  J(u2.gear[3]) === J({ id: GLT, qty: 2, provenance: [{ note: 'unloaded from YT-1300 Light Freighter', when: '2026-10-21' }] }), J(u2.gear[3]));
const MARKED = { gear: [{ id: MED, qty: 1, talentMarks: [{ talent: 'tinkerer' }] }] };
const u3 = VV.cargoUnloadNext(MARKED, MED, 1, 'unloaded from X', '2026-10-21');
check('§1 cargoUnloadNext never stacks onto a marked copy (the store\'s rule): a new entry beside it',
  u3.gear.length === 2 && u3.gear[0].qty === 1 && u3.gear[1].qty === 1, J(u3.gear));

// R-SCG0-3 (ruling `shipyard-cargo-build-gate`): a talent-marked copy never loads — the mark is ON that copy (R-M8G-12) and a
// cargo line has nowhere to keep it. The pure half refuses it; the act refuses it before any write (§2 below); the faces
// leave it out (absent, not greyed).
const MARKED_EQ = { gear: [{ id: AVA, qty: 3, talentMarks: [{ talent: 'tinkerer' }] }, { id: AVA, qty: 2 }, { id: MED, qty: 1, talentMarks: [] }] };
check('§1 R-SCG0-3 cargoLoadNext refuses a talent-marked entry (any count); the unmarked stack of the same id still loads; an EMPTY talentMarks is no mark',
  VV.cargoLoadNext(MARKED_EQ, 0, 1) === null && VV.cargoLoadNext(MARKED_EQ, 0, 3) === null
    && !!VV.cargoLoadNext(MARKED_EQ, 1, 1) && !!VV.cargoLoadNext(MARKED_EQ, 2, 1));
check('§1 R-SCG0-3 the faces\' one predicate (SWRPGVesselView.Cargo.marked): the marked copy yes, the unmarked and the empty mark no',
  !!VV.Cargo && typeof VV.Cargo.marked === 'function' && VV.Cargo.marked(MARKED_EQ.gear[0]) === true
    && VV.Cargo.marked(MARKED_EQ.gear[1]) === false && VV.Cargo.marked(MARKED_EQ.gear[2]) === false);

// ════ the device: two characters, three ships ════
const KAEL = 'c_kael', RYN = 'c_ryn';
function roster() {
  return [{ id: KAEL, name: 'Kael Voss', sheetData: { equipment: clone(EQ) } }, { id: RYN, name: 'Ryn Kessig', sheetData: { equipment: { gear: [] } } }];
}
const SHIPS = { v: 3, vessels: [
  VS.normalizeVessel({ id: 'v_kael', vehicleKey: 'YT1300', owner: 'char:' + KAEL, cargo: [] }, 'd'),
  VS.normalizeVessel({ id: 'v_party', vehicleKey: 'YT1300', owner: 'party', cargo: [{ id: 'c_glt', kind: 'item', ref: GLT, qty: 3, hidden: false }] }, 'd'),
  VS.normalizeVessel({ id: 'v_ryn', vehicleKey: 'YT1300', owner: 'char:' + RYN, cargo: [{ id: 'c_free', kind: 'free', name: 'Crates', qty: 6, enc: 30 }] }, 'd')] };
function device() {
  setStorage(memStorage({ [VS.VESSELS_KEY]: J(SHIPS) }));
  VS.getState();   // wired at the first read
  LISTEN.forEach((fn) => fn({ key: VS.VESSELS_KEY }));
}
const ship = (id) => VS.getState().vessels.filter((v) => v.id === id)[0];
device();
check('fixtures: a reset device reads the seeded ships (the party hold 3 of glitterstim)', LISTEN.length > 0 && ship('v_party').cargo[0].qty === 3);
// the host's write, recorded: it persists into the roster it was handed, and answers `ok`
function host(hostName, ok, list) {
  const calls = [], r = list || roster();
  return { calls, roster: r, o: { host: hostName, roster: r, gearRow, now: () => '2026-10-21', shipName: () => 'YT-1300 Light Freighter',
    write: (id, next) => { calls.push([id, clone(next)]); if (ok === false) return false; r.filter((c) => c.id === id)[0].sheetData.equipment = next; return true; } } };
}

// ════ §2 LOAD ════
device();
let h = host('player');
const v0 = clone(VS.getState());
const okL = VV.cargoLoad(h.o, KAEL, 0, 'v_kael', 2);
check('§2 LOAD: the ship gains an open item line {ref, qty 2}; the character\'s entry 3 → 1, through the host\'s write, once',
  okL.ok === true && J(ship('v_kael').cargo.map((c) => [c.kind, c.ref, c.qty, c.hidden])) === J([['item', AVA, 2, false]])
    && h.calls.length === 1 && h.calls[0][0] === KAEL && h.calls[0][1].gear[0].qty === 1, J([okL, ship('v_kael').cargo, h.calls]));
check('§2 LOAD logs no event and charges nothing (provenance and credits as they were)',
  ship('v_kael').provenance.length === 0 && h.calls[0][1].credits === 120);
VV.cargoLoad(h.o, KAEL, 0, 'v_kael', 1);
check('§2 LOAD again (the merge rule, through the act): the open line 2 → 3; the entry leaves the pack at 0',
  J(ship('v_kael').cargo.map((c) => c.qty)) === J([3]) && !h.roster[0].sheetData.equipment.gear.some((g) => g.id === AVA), J(ship('v_kael').cargo));
// R-SCG0-3 through the act: a marked entry is refused BEFORE any write — no character write, the ships as they were
device();
{
  const mr = roster(); mr[0].sheetData.equipment.gear[0].talentMarks = [{ talent: 'tinkerer' }];
  const hm = host('player', true, mr), vm = clone(VS.getState());
  const noM = VV.cargoLoad(hm.o, KAEL, 0, 'v_kael', 1);
  check('§2 R-SCG0-3 LOAD of a talent-marked entry: refused (ok false), no write called, the ship and the mark as they were',
    noM.ok === false && hm.calls.length === 0 && J(VS.getState()) === J(vm) && mr[0].sheetData.equipment.gear[0].qty === 3
      && mr[0].sheetData.equipment.gear[0].talentMarks.length === 1, J([noM, hm.calls.length]));
}
// the undo leg
device();
h = host('player', false);
const before = clone(VS.getState());
const noL = VV.cargoLoad(h.o, KAEL, 0, 'v_kael', 2);
check('§2 LOAD, the character write refused: ok false (why write) and the ship PUT BACK as it was',
  noL.ok === false && noL.why === 'write' && h.calls.length === 1 && J(VS.getState()) === J(before), J([noL, ship('v_kael').cargo]));
// the order leg: the ship is written FIRST — when its write is refused (its gear row gone between the check and the write),
// the character is never written, so no goods are destroyed
device();
h = host('player');
const v15 = clone(VS.getState());
let asked = 0;
h.o.gearRow = (ref) => (++asked === 1 ? gearRow(ref) : null);
const noS = VV.cargoLoad(h.o, KAEL, 0, 'v_kael', 2);
check('§2 LOAD, the ship\'s write refused: ok false (why held), the character NEVER written, the ships untouched',
  noS.ok === false && noS.why === 'held' && h.calls.length === 0 && J(VS.getState()) === J(v15), J([noS, h.calls.length]));
// refusals decided first: no write call, the ships untouched
device();
const v1 = clone(VS.getState());
const REF = [
  ['no such character', (o) => VV.cargoLoad(o, 'c_none', 0, 'v_kael', 1), 'no_character'],
  ['no such ship', (o) => VV.cargoLoad(o, KAEL, 0, 'v_none', 1), 'no_ship'],
  ['another character\'s ship (player host)', (o) => VV.cargoLoad(o, KAEL, 0, 'v_ryn', 1), 'scope'],
  ['an inline copy (HELD)', (o) => VV.cargoLoad(o, KAEL, 1, 'v_kael', 1), 'refused'],
  ['more than held', (o) => VV.cargoLoad(o, KAEL, 0, 'v_kael', 4), 'refused'],
  ['a count of 0', (o) => VV.cargoLoad(o, KAEL, 0, 'v_kael', 0), 'refused'],
];
REF.forEach(([what, run, why]) => {
  const hh = host('player'), got = run(hh.o);
  check('§2 LOAD refused before any write: ' + what + ' → ' + why + '; no write, the ships untouched',
    got.ok === false && got.why === why && hh.calls.length === 0 && J(VS.getState()) === J(v1), J([got, hh.calls.length]));
});
const noGear = host('player'); noGear.o.gearRow = () => null;
const ng = VV.cargoLoad(noGear.o, KAEL, 0, 'v_kael', 1);
check('§2 LOAD refused before any write: a ref with no gear row (the ship\'s op refuses it)',
  ng.ok === false && noGear.calls.length === 0 && J(VS.getState()) === J(v1), J(ng));
const noW = host('player'); delete noW.o.write;
check('§2 LOAD refused with no host write (the GM host today): why no_write, the ships untouched',
  VV.cargoLoad(noW.o, KAEL, 0, 'v_kael', 1).why === 'no_write' && J(VS.getState()) === J(v1));

// ════ §3 UNLOAD ════
device();
h = host('player');
const okU = VV.cargoUnload(h.o, 'v_party', 'c_glt', RYN, 2);
check('§3 UNLOAD (partial, a party ship): the line 3 → 1; the recipient gains a NEW entry with "unloaded from ‹ship›" and the store\'s `when`',
  okU.ok === true && ship('v_party').cargo[0].qty === 1 && h.calls.length === 1 && h.calls[0][0] === RYN
    && J(h.calls[0][1].gear) === J([{ id: GLT, qty: 2, provenance: [{ note: 'unloaded from YT-1300 Light Freighter', when: new Date().toISOString().slice(0, 10) }] }]),
  J([okU, ship('v_party').cargo, h.calls]));
const okU2 = VV.cargoUnload(h.o, 'v_party', 'c_glt', RYN, 1);
check('§3 UNLOAD (the rest): the line leaves the hold; the goods stack onto the entry the first unload wrote (3), one note',
  okU2.ok === true && ship('v_party').cargo.length === 0 && J(h.roster[1].sheetData.equipment.gear.map((g) => [g.id, g.qty, (g.provenance || []).length])) === J([[GLT, 3, 1]]),
  J(h.roster[1].sheetData.equipment.gear));
check('§3 UNLOAD logs no event (the ship\'s provenance as it was)', ship('v_party').provenance.length === 0);
// the undo leg: the ship's write refused after the character's — the line went meanwhile — so the character is written back
device();
h = host('player');
const prior = clone(h.roster[1].sheetData.equipment);
h.o.write = ((w) => (id, next) => { const r = w(id, next); if (h.calls.length === 1) VS.apply((s) => VS.removeCargo(s, 'v_party', 'c_glt', 'd')); return r; })(h.o.write);
const noU = VV.cargoUnload(h.o, 'v_party', 'c_glt', RYN, 2);
check('§3 UNLOAD, the ship\'s write refused after the character\'s: ok false (why held) and the character WRITTEN BACK as it was',
  noU.ok === false && noU.why === 'held' && h.calls.length === 2 && J(h.calls[1][1]) === J(prior) && J(h.roster[1].sheetData.equipment) === J(prior),
  J([noU, h.calls]));
device();
const v3 = clone(VS.getState());
[
  ['a line of your own', (o) => VV.cargoUnload(o, 'v_ryn', 'c_free', RYN, 1)],
  ['more than the line holds', (o) => VV.cargoUnload(o, 'v_party', 'c_glt', RYN, 4)],
  ['no such line', (o) => VV.cargoUnload(o, 'v_party', 'c_none', RYN, 1)],
  ['another character\'s ship (player host)', (o) => VV.cargoUnload(o, 'v_ryn', 'c_free', KAEL, 1)],
].forEach(([what, run]) => {
  const hh = host('player'), got = run(hh.o);
  check('§3 UNLOAD refused before any write: ' + what + '; no write, the ships untouched',
    got.ok === false && hh.calls.length === 0 && J(VS.getState()) === J(v3), J(got));
});
const wf = host('player', false), noU2 = VV.cargoUnload(wf.o, 'v_party', 'c_glt', RYN, 1);
check('§3 UNLOAD, the character write refused: ok false and the ship untouched (it is written second)',
  noU2.ok === false && noU2.why === 'write' && J(VS.getState()) === J(v3));

// ════ §4 WHO (R-SCG-4) ════
const own = { owner: 'char:' + KAEL }, party = { owner: 'party' }, other = { owner: 'char:' + RYN };
check('§4 the player host: an owned ship\'s owner, any character for a party ship, never another\'s ship; the GM host: any',
  VV.cargoInScope('player', own, KAEL) && VV.cargoInScope('player', party, RYN) && !VV.cargoInScope('player', other, KAEL)
    && VV.cargoInScope('gm', other, KAEL));

console.log('\nshipyard_cargo_act: ' + passes + '/' + (passes + failures) + ' PASS' + (failures ? '  (' + failures + ' FAILED)' : ''));
process.exit(failures ? 1 : 0);
