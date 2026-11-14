#!/usr/bin/env node
/**
 * shipyard_encounter_craft_store.cjs — the bench's MARK ACT and the craft LIFECYCLE (card `shipyard-encounter-craft-build`
 * step 1: R-SECB-1/-2, as ruled in `shipyard-encounter-craft-build-recon` R-SECB-5/-6; concept R-SEC-2..4).
 *
 * The REAL bench store and the REAL Ship Yard store run in node over one stub localStorage (the browser's two keys), on
 * release scenario 17's encounter built by the bench's own writes: Imperial Stormtroopers ×4, a Guilded Bounty Hunter,
 * two TIE/LN craft. Each leg reads BOTH stores back from storage, never from the act's answer alone. What it holds:
 *   · a − at zero on a fresh craft mints nothing (refused 'below-zero': no record, no pointer);
 *   · the first mark mints ONE record (owner bench:<groupId>, crew empty) and stores its id on that craft only, and the
 *     bench write is on disk; a later mark is one updateVessel (no second record, the bench unchanged);
 *   · two craft, two records, each craft pointing at its own;
 *   · the bench write refused (a throwing localStorage on the bench key) → the mint is UNDONE: no record, no pointer;
 *   · the refusals, decided before any write: no vessel store, a stale bench, a stale vessel store, no group, no craft,
 *     no vehicleRow, no row, a bad mark;
 *   · a dangling pointer (the vessel deleted elsewhere) reads fresh and the next mark mints anew and re-points;
 *   · reset zeros every owned vessel (hull, strain, crits) and KEEPS the record and the pointer;
 *   · remove and delete tombstone only vessels the group still owns (a re-owned record survives);
 *   · with no vessel store, the lifecycle three behave as before (bench only).
 *
 * Run:  node test/shipyard_encounter_craft_store.cjs [<benchStore.js>]   — the argument is for the BITE (a mutated COPY).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BENCH_JS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'lib/library/npc/benchStore.js');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
console.log('shipyard_encounter_craft_store — the mark act and the craft lifecycle, both stores read back\n');

global.window = globalThis.window || {};
const mem = new Map();
let throwOn = null;   // a key whose write throws (the refused bench write)
const LS = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (k === throwOn) throw new Error('QuotaExceededError (planted)'); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0,
};
Object.defineProperty(globalThis, 'localStorage', { value: LS, configurable: true, writable: true });
window.localStorage = LS;
window.addEventListener = () => {}; window.removeEventListener = () => {};
const B = require(BENCH_JS);
require(path.join(ROOT, 'lib/shared/vesselStore.js'));
const VS = window.SWRPGVessels;
check('the bench store exports markCraft, and the Yard store loads', typeof B.markCraft === 'function' && !!VS && typeof VS.apply === 'function');
if (typeof B.markCraft !== 'function' || !VS) { console.log('\nshipyard_encounter_craft_store: ' + pass + '/' + (pass + fail) + ' PASS (the rest cannot run)'); process.exit(1); }

const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const VEH = {};
fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => f.endsWith('.json'))
  .forEach((f) => (J('public/data/vehicle-library/' + f).entries || []).forEach((e) => { VEH[e.key] = e; }));
const TIE = 'TIELN';
const row = (k) => VEH[k] || null;
const NOW = '2026-10-21';

// ── the two stores, read back from storage ──
const fleet = () => { const raw = mem.get(VS.VESSELS_KEY); return raw ? (JSON.parse(raw).vessels || []) : []; };
const saved = () => B.normalize(JSON.parse(mem.get(B.KEY) || 'null'));
const grpOf = (s, gid) => s.groups.filter((g) => g.id === gid)[0];
const craftOf = (s, gid, cid) => (grpOf(s, gid).vehicles || []).filter((v) => v.id === cid)[0];
const recOf = (id) => fleet().filter((r) => r.id === id)[0] || null;

function scene() {
  mem.clear(); throwOn = null;
  VS.apply(() => ({ v: VS.SCHEMA_V, vessels: [] }));
  let s = B.emptyState();
  const cg = B.createGroup(s, 'Tonight’s encounter'); s = cg.state; const GID = cg.id;
  s = B.addMember(s, GID, 'IMPERIAL_STORMTROOPER');
  s = B.setMember(s, GID, grpOf(s, GID).members[0].id, { count: 4 });
  s = B.addMember(s, GID, 'GUILDED_BOUNTY_HUNTER');
  s = B.addVehicle(s, GID, TIE); s = B.addVehicle(s, GID, TIE);
  B.persist(s);
  const [T1, T2] = grpOf(s, GID).vehicles.map((v) => v.id);
  return { s, GID, T1, T2 };
}
const hit = (sc, cid, track, delta) => B.markCraft(sc.s, sc.GID, cid, { track, delta }, NOW, row);

// ── the scene ──
let sc = scene();
check('scenario 17 by the bench\'s writes: a ×4 minion line, a rival, two TIE/LN craft, no record behind either',
  grpOf(sc.s, sc.GID).members.length === 2 && grpOf(sc.s, sc.GID).vehicles.length === 2 && !!VEH[TIE] && fleet().length === 0
  && grpOf(saved(), sc.GID).vehicles.every((v) => !('vessel' in v)));

// ── a − at zero mints nothing ──
let r = hit(sc, sc.T1, 'hull', -1);
check('a − at zero on a fresh craft is refused (below-zero): no record, no pointer, on disk',
  r.refused === 'below-zero' && r.state === sc.s && fleet().length === 0 && !('vessel' in craftOf(saved(), sc.GID, sc.T1)), { r: r.refused, n: fleet().length });

// ── the first mark: one record, its id on that craft only ──
r = hit(sc, sc.T1, 'hull', 1);
const ID1 = r.state && craftOf(r.state, sc.GID, sc.T1).vessel;
const rec1 = recOf(ID1);
check('the first mark mints ONE record: owner bench:<groupId>, hull 1, strain 0, crew empty (read from the vessels key)',
  !r.refused && fleet().length === 1 && !!rec1 && rec1.owner === 'bench:' + sc.GID && rec1.hull_current === 1 && (rec1.strain_current || 0) === 0
  && Array.isArray(rec1.crew) && rec1.crew.length === 0 && rec1.vehicleKey === TIE, { refused: r.refused, rec1, n: fleet().length });
check('its id is on the first craft only, and the bench pointer is ON DISK (TIE · B still has none)',
  craftOf(saved(), sc.GID, sc.T1).vessel === ID1 && !('vessel' in craftOf(saved(), sc.GID, sc.T2)), saved().groups[0].vehicles);
sc.s = r.state;

// ── a later mark: one updateVessel ──
r = hit(sc, sc.T1, 'hull', 6);
check('a later mark is one updateVessel: still ONE record, hull 7 (crippled at 7 / 6), the bench state unchanged',
  !r.refused && r.state === sc.s && fleet().length === 1 && recOf(ID1).hull_current === 7, { refused: r.refused, n: fleet().length, rec: recOf(ID1) });
r = hit(sc, sc.T1, 'hull', -8);
check('a later mark below zero is refused and writes nothing (hull stays 7)', r.refused === 'below-zero' && recOf(ID1).hull_current === 7);

// ── two craft, two records ──
r = hit(sc, sc.T2, 'strain', 2); sc.s = r.state;
const ID2 = craftOf(sc.s, sc.GID, sc.T2).vessel;
check('two craft, two records: TIE · B\'s first mark mints its own (strain 2), each craft points at its own',
  !r.refused && fleet().length === 2 && ID2 && ID2 !== ID1 && recOf(ID2).strain_current === 2 && recOf(ID2).owner === 'bench:' + sc.GID
  && craftOf(saved(), sc.GID, sc.T1).vessel === ID1 && craftOf(saved(), sc.GID, sc.T2).vessel === ID2, fleet().map((x) => [x.id, x.owner]));

// ── reset: zeros, record and pointer kept ──
sc.s = B.resetGroup(sc.s, sc.GID); B.persist(sc.s);
check('reset (HEAL & REPAIR ALL) zeros both owned vessels — hull, strain, crits — and KEEPS both records and pointers',
  fleet().length === 2 && [ID1, ID2].every((id) => recOf(id) && !recOf(id).hull_current && !recOf(id).strain_current && (recOf(id).crits || []).length === 0)
  && craftOf(saved(), sc.GID, sc.T1).vessel === ID1 && craftOf(saved(), sc.GID, sc.T2).vessel === ID2
  && grpOf(saved(), sc.GID).members.every((m) => !m.currentWounds && !m.poolWounds), fleet().map((x) => [x.hull_current, x.strain_current]));

// ── remove and delete tombstone only what the group still owns ──
VS.apply((st) => VS.updateVessel(st, ID1, { owner: 'party' }, NOW));   // TIE · A's record re-owned elsewhere
sc.s = B.removeVehicle(sc.s, sc.GID, sc.T1); B.persist(sc.s);
check('remove: a craft whose record is no longer bench-owned leaves that record standing (only bench: owners are the bench\'s)',
  !!recOf(ID1) && recOf(ID1).owner === 'party' && !craftOf(saved(), sc.GID, sc.T1));
sc.s = B.removeVehicle(sc.s, sc.GID, sc.T2); B.persist(sc.s);
check('remove: TIE · B\'s bench-owned record is tombstoned with the craft', !recOf(ID2) && !craftOf(saved(), sc.GID, sc.T2) && !!recOf(ID1));

sc = scene();
sc.s = hit(sc, sc.T1, 'hull', 1).state; sc.s = hit(sc, sc.T2, 'hull', 1).state;
const before = fleet().length;
sc.s = B.deleteGroup(sc.s, sc.GID); B.persist(sc.s);
check('delete: deleting the group tombstones both of its minted records (2 → 0)', before === 2 && fleet().length === 0 && saved().groups.length === 0, { before, after: fleet().length });

// ── the refused bench write: the mint is undone ──
sc = scene();
throwOn = B.KEY;
r = hit(sc, sc.T1, 'hull', 1);
throwOn = null;
check('the bench write refused (a throwing localStorage) → bench-write-refused, the mint UNDONE: no record, no pointer',
  r.refused === 'bench-write-refused' && r.state === sc.s && fleet().length === 0 && !('vessel' in craftOf(saved(), sc.GID, sc.T1)), { r: r.refused, n: fleet().length });

// ── the refusals, before any write ──
sc = scene();
const none = (why, res) => res.refused === why && res.state === sc.s && fleet().length === 0;
check('no group → no-group', none('no-group', B.markCraft(sc.s, 'nope', sc.T1, { track: 'hull', delta: 1 }, NOW, row)));
check('no craft → no-craft', none('no-craft', B.markCraft(sc.s, sc.GID, 'nope', { track: 'hull', delta: 1 }, NOW, row)));
check('no vehicleRow → no-row', none('no-row', B.markCraft(sc.s, sc.GID, sc.T1, { track: 'hull', delta: 1 }, NOW)));
check('no library row for the key → no-row', none('no-row', B.markCraft(sc.s, sc.GID, sc.T1, { track: 'hull', delta: 1 }, NOW, () => null)));
check('a bad track or delta → bad-mark', none('bad-mark', hit(sc, sc.T1, 'shields', 1)) && none('bad-mark', hit(sc, sc.T1, 'hull', 0))
  && none('bad-mark', hit(sc, sc.T1, 'hull', 0.5)));
const staleBench = Object.assign({}, sc.s, { stale: true });
r = B.markCraft(staleBench, sc.GID, sc.T1, { track: 'hull', delta: 1 }, NOW, row);
check('a stale (version-ahead) bench → stale-bench', r.refused === 'stale-bench' && r.state === staleBench && fleet().length === 0, r.refused);
const realVS = window.SWRPGVessels;
window.SWRPGVessels = Object.assign({}, realVS, { isStale: () => true });
check('a stale vessel store → stale-vessels', none('stale-vessels', hit(sc, sc.T1, 'hull', 1)));
delete window.SWRPGVessels;
check('no vessel store → no-vessel-store (R-SECB-6 rider (i): never a silent bench-only mark)', none('no-vessel-store', hit(sc, sc.T1, 'hull', 1)));
// rider (i): the lifecycle three with no store behave as today
let s0 = B.setMember(sc.s, sc.GID, grpOf(sc.s, sc.GID).members[1].id, { currentWounds: 5 });
s0 = B.resetGroup(s0, sc.GID);
const s1 = B.removeVehicle(s0, sc.GID, sc.T1), s2 = B.deleteGroup(s1, sc.GID);
check('no vessel store: reset, remove and delete do what they did before (bench only, no throw)',
  grpOf(s0, sc.GID).members.every((m) => !m.currentWounds) && grpOf(s1, sc.GID).vehicles.length === 1 && s2.groups.length === 0);
window.SWRPGVessels = realVS;

// ── a dangling pointer reads fresh; the next mark mints anew and re-points ──
sc = scene();
sc.s = hit(sc, sc.T1, 'hull', 3).state;
const OLD = craftOf(sc.s, sc.GID, sc.T1).vessel;
VS.apply((st) => VS.removeVessel(st, OLD));   // deleted elsewhere
r = hit(sc, sc.T1, 'hull', -1);
check('a dangling pointer reads fresh: a − is refused below zero, nothing minted', r.refused === 'below-zero' && fleet().length === 0);
r = hit(sc, sc.T1, 'hull', 1);
const NEW = r.state && craftOf(r.state, sc.GID, sc.T1).vessel;
check('… and the next + mints anew (hull 1) and re-points the craft, on disk', !r.refused && NEW && NEW !== OLD && fleet().length === 1
  && recOf(NEW).hull_current === 1 && craftOf(saved(), sc.GID, sc.T1).vessel === NEW, { r: r.refused, NEW, OLD });

console.log('\nshipyard_encounter_craft_store: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
