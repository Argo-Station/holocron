#!/usr/bin/env node
/**
 * encounter_reset_keeps_crits.cjs — R-E3S-2 (ruling `encounters-e3-screens` §2): HEAL & REPAIR ALL returns a bench-owned
 * craft's hull and strain to zero and KEEPS its Critical Hits. RAW (EotE p.243): a ship or vehicle's Critical Hit stays
 * in effect until the craft is repaired. A craft's crit leaves only by the GM removing
 * it (vesselView's CRITICAL HITS `onRemove` → `removeCrit`).
 *
 * The REAL bench store and the REAL Yard store in node over one stub localStorage; the vessel is read back from storage.
 *
 * Run:  node test/encounter_reset_keeps_crits.cjs [<benchStore.js>]   — the argument is for the BITE (a mutated COPY that
 * restores `crits: []` to resetGroup's updateVessel line must exit 1).
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
console.log('encounter_reset_keeps_crits — R-E3S-2: the reset zeroes a craft\'s hull and strain, keeps its Critical Hits\n');

global.window = globalThis.window || {};
const mem = new Map();
const LS = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 };
Object.defineProperty(globalThis, 'localStorage', { value: LS, configurable: true, writable: true });
window.localStorage = LS;
window.addEventListener = () => {}; window.removeEventListener = () => {};
const B = require(BENCH_JS);
require(path.join(ROOT, 'lib/shared/vesselStore.js'));
const VS = window.SWRPGVessels;

const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const VEH = {};
fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => f.endsWith('.json'))
  .forEach((f) => (J('public/data/vehicle-library/' + f).entries || []).forEach((e) => { VEH[e.key] = e; }));
const ROWS = J('public/data/canonical/crit_tables.json').vehicle.rows;
const NOW = '2026-11-08';
const fleet = () => { const raw = mem.get(VS.VESSELS_KEY); return raw ? (JSON.parse(raw).vessels || []) : []; };
const grp = (s, gid) => s.groups.filter((g) => g.id === gid)[0];

VS.apply(() => ({ v: VS.SCHEMA_V, vessels: [] }));
let s = B.emptyState();
const cg = B.createGroup(s, 'Ambush at Nar Shaddaa'); s = cg.state; const GID = cg.id;
s = B.addVehicle(s, GID, 'TIELN'); B.persist(s);
const TID = grp(s, GID).vehicles[0].id;
s = B.markCraft(s, GID, TID, { track: 'hull', delta: 3 }, NOW, (k) => VEH[k] || null).state;
s = B.markCraft(s, GID, TID, { track: 'strain', delta: 2 }, NOW, (k) => VEH[k] || null).state;
const VID = grp(s, GID).vehicles[0].vessel;
const key = ROWS.filter((r) => r && r[3] && r[3] !== 'vaporized')[0][3];
VS.apply((st) => VS.addCrit(st, VID, { row: key }, NOW, ROWS));
const before = fleet().filter((r) => r.id === VID)[0];
check('the scene: a TIE/LN at hull 3, strain 2, one Critical Hit (row ' + key + '), owned by this encounter',
  before && before.hull_current === 3 && before.strain_current === 2 && before.crits.length === 1 && before.owner === 'bench:' + GID, before);

s = B.resetGroup(s, GID); B.persist(s);
const after = fleet().filter((r) => r.id === VID)[0];
check('HEAL & REPAIR ALL zeroes the craft\'s hull and strain', after && !after.hull_current && !after.strain_current, after);
check('HEAL & REPAIR ALL KEEPS the craft\'s Critical Hit (R-E3S-2; EotE p.243)', after && after.crits.length === 1 && after.crits[0].row === key, after && after.crits);
check('the record and the craft\'s pointer are kept', !!after && grp(s, GID).vehicles[0].vessel === VID);

console.log('\nencounter_reset_keeps_crits: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
