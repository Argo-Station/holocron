/* test/shipyard_s8_build.cjs — SHIP YARD S8, step 3: the BUILT ship and the ONE vehicle lookup (card `shipyard-s8-build` R-S8B-4;
 * ruling `shipyard-s8-census-card` R-S8C-9; `f100-s8-vocabulary` R-S8V-4/-5).
 *
 *   B-1 the record   · `build: {frame, engine: {key, mods}, hull: {key, mods}, note}` normalizes (vesselStore normalizeBuild), is
 *                      optional (a record without it reads back as it was), and a normalized built ship normalizes to itself
 *   B-2 the lookup   · vesselStore `vehicleFor`: a built ship → its FRAME row; a stock ship → the library row by vehicleKey; an
 *                      encounter craft {key} → the library row; a built ship with no frames in hand → null (HELD), never a
 *                      library row; and the static leg: no face looks a ship up by its vehicleKey any more (grep)
 *   B-3 the resolve  · the build's engine and hull resolve through ARMS before every ordinary part (FO pp.78-84): a starfighter
 *                      frame + Electron Baffled + Sleek Carapace reads speed 2, aft 2 (never starboard), strain 5 × 3, armor 0,
 *                      handling +2; a part's own SET installed after them is the later SET; with the parts list missing, HELD
 *
 * THE BITE: each MUTANT removes one arm in memory; the child run must exit 1 — read by EXIT CODE.
 * Run: node test/shipyard_s8_build.cjs        (children: --mutant=<name>)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const MUT = (process.argv.find((a) => a.indexOf('--mutant=') === 0) || '').slice(9) || null;

const MUTANTS = {
  framebranch: ['lib/shared/vesselStore.js', "if (b && typeof b === 'object' && b.frame) { var fr = frames || getFrames(); return (fr && fr[b.frame]) || null; }", ''],
  normalize: ['lib/shared/vesselStore.js', "opt(known, rec, 'build', normalizeBuild(rec.build));", ''],
  pieces: ['lib/shared/vesselResolve.js', "if (!held) pieces.forEach(function (k) { install(bld[k], k); });", ''],
  heldbuild: ['lib/shared/vesselResolve.js', '(rec.attachments || []).length > 0 || pieces.length > 0 ||', '(rec.attachments || []).length > 0 ||'],
  site: ['lib/shared/vesselView.jsx', 'var vrow = vehicleOf(rec, props.getVehicle);', 'var vrow = props.getVehicle ? props.getVehicle(rec.vehicleKey) : null;'],
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

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; if (!MUT) console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const ATT = J('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const FR = J('public/data/canonical/vehicle-frames.json').vehicle_frames;
const LIB = [].concat(...fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => /\.json$/.test(f) && f !== 'index.json' && f !== 'taxonomy.json')
  .map((f) => J('public/data/vehicle-library/' + f).entries || []));
const libFn = (k) => LIB.find((e) => e.key === k) || null;
const BUILT = { id: 'v_built', vehicleKey: '', owner: 'party', v: 3,
  build: { frame: 'starfighter', engine: { key: 'electron_baffled_engine', mods: [{ option: 'SPEEDADD2', when: null, session: null }] },
    hull: { key: 'sleek_carapace', mods: [] }, note: 'B-wing knock-off' } };

// ── B-1 · the record ──
{
  const n = VS.normalizeVessel(BUILT, 't');
  check('B-1 · normalizeBuild keeps the keys and choices: frame, engine {key, mods by option id}, hull {key, mods}, note',
        n.build && n.build.frame === 'starfighter' && n.build.engine.key === 'electron_baffled_engine' && n.build.engine.mods.length === 1
          && n.build.engine.mods[0].option === 'SPEEDADD2' && n.build.hull.key === 'sleek_carapace' && n.build.note === 'B-wing knock-off' && n.vehicleKey === '', n.build);
  check('B-1 · a normalized built ship normalizes to itself (byte for byte)', JSON.stringify(VS.normalizeVessel(n, 't')) === JSON.stringify(n));
  const stock = VS.normalizeVessel({ id: 'v_s', vehicleKey: 'YT1300', owner: 'party', v: 3 }, 't');
  check('B-1 · optional: a stock record never gains a `build`', !('build' in stock));
  const odd = VS.normalizeVessel(Object.assign({}, BUILT, { build: { frame: 'starfighter', engine: { mods: [] }, hull: 'x', extra: 1 } }), 't');
  check('B-1 · a piece with no key reads null (not chosen yet); unknown fields are kept',
        odd.build.engine === null && odd.build.hull === null && odd.build.extra === 1 && odd.build.note === null, odd.build);
}

// ── B-2 · the ONE lookup ──
{
  VS.setFrames(null);
  check('B-2 · a built ship with no frames in hand → null (HELD), never a library row', VS.vehicleFor(BUILT, libFn) === null);
  VS.setFrames(FR);
  check('B-2 · a built ship → its FRAME row (the starfighter frame, FO p.79)', VS.vehicleFor(BUILT, libFn) === FR.starfighter);
  check('B-2 · a stock ship → the library row by vehicleKey (function or list)',
        VS.vehicleFor({ vehicleKey: 'YT1300' }, libFn).key === 'YT1300' && VS.vehicleFor({ vehicleKey: 'YT1300' }, LIB).key === 'YT1300');
  check('B-2 · an encounter craft {id, key} → the library row; an empty key → null',
        VS.vehicleFor({ id: 'c1', key: 'T65BXWING' }, LIB).key === 'T65BXWING' && VS.vehicleFor({ vehicleKey: '' }, LIB) === null);
  // the static leg: no face looks a ship up by its vehicleKey; the bench's own filter is gone
  const FILES = ['player/app.jsx', 'gm/app.jsx', 'lib/shared/vesselView.jsx', 'lib/library/npc/view.jsx'];
  const old = [];
  FILES.forEach((f) => source(f).split('\n').forEach((l, i) => {
    if (/getVehicle\w*\([^)]*vehicleKey|benchVehicleRecord/.test(l) && !/^\s*\/\//.test(l)) old.push(f + ':' + (i + 1));
  }));
  check('B-2 · static: no lookup by a record\'s vehicleKey and no benchVehicleRecord in ' + FILES.join(' · ') + ' (grep)', old.length === 0, old);
}

// ── B-3 · the build resolves through ARMS ──
{
  const ctx = { attachments: ATT };
  const rec = VS.normalizeVessel(BUILT, 't');
  const r = R.resolve(rec, VS.vehicleFor(rec, libFn), ctx);
  check('B-3 · starfighter frame + Electron Baffled (+2 speed mod) + Sleek Carapace: speed 2 + 2 = 4, aft 2, starboard 0, strain 5 × 3 = 15, armor 0, handling +2',
        r.speed === 4 && r.defense.aft === 2 && r.defense.starboard === 0 && r.defense.fore === 0 && r.strain_threshold === 15 && r.armor === 0 && r.handling === 2,
        { speed: r.speed, def: r.defense, ss: r.strain_threshold, armor: r.armor, hand: r.handling });
  check('B-3 · every number names its piece: speed {set 2, from 0} by the engine, then its mod; handling {set 2} by the hull',
        r.because.speed[0].source === 'Electron Baffled Engine' && r.because.speed[0].set === 2 && r.because.speed[1].source === 'Electron Baffled Engine (mod)'
          && r.because.handling[0].source === 'Sleek Carapace' && r.because.handling[0].set === 2, { speed: r.because.speed, hand: r.because.handling });
  const later = R.resolve(Object.assign({}, rec, { attachments: [{ key: 'podracer_control_cables', mods: [] }] }), FR.starfighter, ctx);
  check('B-3 · the pieces queue BEFORE an ordinary part: a part\'s own handling SET (−1) is the later SET, both credited',
        later.handling === -1 && later.because.handling.length === 2 && later.because.handling[0].source === 'Sleek Carapace', later.because.handling);
  const held = R.resolve(rec, FR.starfighter, { attachments: null });
  check('B-3 · the parts list missing: a built ship HOLDS (R-S4CC-6) — never the bare frame\'s numbers as known', held.held === true, held.held);
}

if (MUT) { console.log('MUTANT ' + MUT + ': ' + fail + ' FAIL'); process.exit(fail ? 1 : 0); }
Object.keys(MUTANTS).forEach((m) => {
  const c = spawnSync(process.execPath, [__filename, '--mutant=' + m], { encoding: 'utf8' });
  check('bite · --mutant=' + m + ' turns this guard RED — the child exits 1 (read by exit code)', c.status === 1,
        { status: c.status, out: (c.stdout || '').slice(-300), err: (c.stderr || '').slice(-300) });
});
console.log('\nshipyard_s8_build: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
