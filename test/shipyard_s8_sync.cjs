/* test/shipyard_s8_sync.cjs — SHIP YARD S8, step 3d: a BUILT ship and a CONVERTED ship survive the normalizer and the sync merge
 * unchanged (card `shipyard-s8-build` R-S8B-4: "the normalizer and `syncMerge` are untouched in kind (content-blind). A guard
 * round-trips a built ship through normalize + sync unchanged"; BLIND CHECKLIST GATE #0: "normalize + sync round-trip a built ship
 * and a converted ship unchanged"; ruling `shipyard-s8-census-card` R-S8C-9/-10).
 *
 *   S-1 normalize · each fixture normalizes, survives JSON (the save), and normalizes to itself byte for byte — a built ship with
 *                   its pieces' mods, a converted ship with a wrong-length, illegal `arcs` (b1) and a note, one carrying both, and
 *                   one carrying a newer build's unknown fields inside `build` and `conversion` (kept, R-S3K-1 (a))
 *   S-2 sync      · lib/shared/syncMerge.js mergeAdoption over swrpg_vessels_v1: a ship on one side only arrives byte-equal; the
 *                   same ship on both sides is kept byte-equal; a union of the two devices holds every ship byte-equal; and the
 *                   merged records normalize to the same records (the merge is content-blind, so nothing S8 adds needs it)
 *   S-3 resolve   · the merged ships resolve to the same numbers as the originals (the round trip loses no number)
 *
 * THE BITE: each MUTANT breaks one link in memory — the conversion normalizer filtering `arcs` (b1's "loses nothing"), the
 * build normalizer dropping a piece's mods, a content-aware merge stripping `conversion` — and the child run must exit 1, read by
 * EXIT CODE.
 * Run: node test/shipyard_s8_sync.cjs        (children: --mutant=<name>)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const MUT = (process.argv.find((a) => a.indexOf('--mutant=') === 0) || '').slice(9) || null;

const MUTANTS = {
  arcs: ['lib/shared/vesselStore.js', 'arcs: Array.isArray(c.arcs) ? c.arcs.slice() : []',
    "arcs: Array.isArray(c.arcs) ? c.arcs.filter(function (z) { return ZONES[z]; }) : []"],
  mods: ['lib/shared/vesselStore.js', "return keep(p, { key: String(p.key), mods: Array.isArray(p.mods) ? p.mods.map(normalizeMod).filter(Boolean) : [] });",
    "return keep(p, { key: String(p.key), mods: [] });"],
  merge: ['lib/shared/syncMerge.js', 'emit: function (env, list) { return Object.assign({}, env, { vessels: list }); },',
    'emit: function (env, list) { return Object.assign({}, env, { vessels: list.map(function (r) { var o = Object.assign({}, r); delete o.conversion; return o; }) }); },'],
};
function source(file) {
  let s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = MUT && MUTANTS[MUT];
  if (m && m[0] === file) {
    if (s.indexOf(m[1]) === -1) { console.log('MUTANT ' + MUT + ': its text is not in ' + file + ' (the guard is stale)'); process.exit(2); }
    s = s.replace(m[1], m[2]);
  }
  return s;
}
function load(file, name) { const sb = {}; new Function(source(file)).call(sb); return sb[name]; }
const R = load('lib/shared/vesselResolve.js', 'SWRPGVesselResolve');
const VS = load('lib/shared/vesselStore.js', 'SWRPGVessels');
const SM = (() => { const mod = { exports: {} }; const req = (m) => require(m.indexOf('./') === 0 ? path.join(ROOT, 'lib/shared', m) : m);
  new Function('module', 'exports', 'require', source('lib/shared/syncMerge.js'))(mod, mod.exports, req); return mod.exports; })();

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; if (!MUT) console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const S = (o) => JSON.stringify(o);

const ATT = J('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const WPN = J('public/data/canonical/vehicle-weapons.json').vehicle_weapons;
const FR = J('public/data/canonical/vehicle-frames.json').vehicle_frames;
const LIB = [].concat(...fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => /\.json$/.test(f) && f !== 'index.json' && f !== 'taxonomy.json')
  .map((f) => J('public/data/vehicle-library/' + f).entries || []));
const CTX = { attachments: ATT, weapons: WPN };
const rowOf = (rec) => VS.vehicleFor(rec, LIB, FR);

const T = 1790000000000;
const RAW = [
  { id: 'v_built', vehicleKey: '', owner: 'party', v: 3, nickname: 'Overload', createdAt: T, updatedAt: T,
    build: { frame: 'freighter', engine: { key: 'ion_turbine_engine', mods: [{ option: 'SPEEDADD', when: null, session: null }] },
      hull: { key: 'expanded_capacity_holds', mods: [{ option: 'ARMORADD', when: null, session: null }] }, note: 'sample 2' } },
  { id: 'v_conv', vehicleKey: 'ACTIONIV', owner: 'party', v: 3, nickname: 'Q-ship', createdAt: T, updatedAt: T,
    conversion: { key: 'paramilitary_bulk_transport', arcs: ['fore', 'fore', 'sideways'], note: 'hidden guns' } },
  { id: 'v_both', vehicleKey: '', owner: 'char:ace', v: 3, createdAt: T, updatedAt: T,
    build: { frame: 'shuttle', engine: { key: 'single_ion_coil', mods: [] }, hull: { key: 'light_armored_hull', mods: [] }, note: null },
    conversion: { key: 'paramilitary_shuttle', arcs: ['port', 'aft'], note: null } },
  { id: 'v_newer', vehicleKey: 'YT1300', owner: 'party', v: 3, createdAt: T, updatedAt: T,
    conversion: { key: 'paramilitary_light_freighter', arcs: ['fore'], note: null, applied_by: 'a newer build' },
    build_hint: { kept: true } },
];
// the fixtures' keys are served rows (a stale fixture would prove nothing)
check('the fixtures name served rows: every frame, piece and template is in its registry',
  RAW.every((r) => (!r.build || (FR[r.build.frame] && ATT[r.build.engine.key] && ATT[r.build.hull.key])) && (!r.conversion || ATT[r.conversion.key])));

// ── S-1 · normalize ──
const N = RAW.map((r) => VS.normalizeVessel(r, T));
N.forEach((n, i) => {
  const saved = JSON.parse(JSON.stringify(n));
  const again = VS.normalizeVessel(saved, T + 1);
  check('S-1 · ' + n.id + ' normalizes, saves and normalizes to itself byte for byte', S(again) === S(n), [S(n).length, S(again).length]);
});
check('S-1 · the built ship keeps its pieces and their mods', S(N[0].build) === S(RAW[0].build), N[0].build);
check('S-1 (b1) · the converted ship keeps its wrong-length, illegal `arcs` as stored, and its note', S(N[1].conversion) === S(RAW[1].conversion), N[1].conversion);
check('S-1 · a ship carrying both keeps both', S(N[2].build) === S(RAW[2].build) && S(N[2].conversion) === S(RAW[2].conversion));
check('S-1 · a newer build\'s fields inside `conversion` and beside it are kept (R-S3K-1 (a))',
  N[3].conversion.applied_by === 'a newer build' && N[3].build_hint && N[3].build_hint.kept === true);

// ── S-2 · sync (mergeAdoption over swrpg_vessels_v1) ──
const env = (list) => ({ v: 3, vessels: list });
const one = SM.mergeAdoption({}, { swrpg_vessels_v1: env(N) });
check('S-2 · every ship on the remote side only arrives byte-equal', S(one.merged.swrpg_vessels_v1.vessels) === S(N) && one.conflicts.length === 0);
const both = SM.mergeAdoption({ swrpg_vessels_v1: env(N) }, { swrpg_vessels_v1: env(JSON.parse(JSON.stringify(N))) });
check('S-2 · the same ships on both devices are kept byte-equal, no question', S(both.merged.swrpg_vessels_v1.vessels) === S(N) && both.conflicts.length === 0, both.conflicts);
const split = SM.mergeAdoption({ swrpg_vessels_v1: env([N[0], N[2]]) }, { swrpg_vessels_v1: env([N[1], N[3]]) });
const byId = {};
split.merged.swrpg_vessels_v1.vessels.forEach((r) => { byId[r.id] = r; });
check('S-2 · a union of two devices holds all four ships, each byte-equal', N.every((n) => byId[n.id] && S(byId[n.id]) === S(n)) && split.conflicts.length === 0,
  Object.keys(byId));
check('S-2 · the merged ships normalize to the same records (content-blind: nothing S8 adds is read by the merge)',
  N.every((n) => S(VS.normalizeVessel(byId[n.id], T + 2)) === S(n)));

// ── S-3 · resolve ──
const nums = (rec) => { const r = R.resolve(rec, rowOf(rec), CTX); return S([r.speed, r.handling, r.armor, r.hull_threshold, r.strain_threshold, r.defense, r.weapons.length, r.pending.length]); };
check('S-3 · each merged ship resolves to the original\'s numbers', N.every((n) => rowOf(n) && nums(byId[n.id]) === nums(RAW.find((r) => r.id === n.id))),
  N.map((n) => [n.id, !!rowOf(n)]));

if (MUT) { console.log('MUTANT ' + MUT + ': ' + fail + ' FAIL'); process.exit(fail ? 1 : 0); }
Object.keys(MUTANTS).forEach((m) => {
  const c = spawnSync(process.execPath, [__filename, '--mutant=' + m], { encoding: 'utf8' });
  check('bite · --mutant=' + m + ' turns this guard RED — the child exits 1 (read by exit code)', c.status === 1, (c.stdout || '').split('\n').filter((l) => /^FAIL|MUTANT/.test(l)).slice(0, 2));
});
console.log('\nshipyard_s8_sync: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
