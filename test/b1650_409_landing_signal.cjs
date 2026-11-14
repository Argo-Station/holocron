#!/usr/bin/env node
/**
 * b1650_409_landing_signal.cjs — a 409 merge that changes local emits the landing signal BEFORE the next push (ruling
 * `release-r7-bug-burndown` ADDENDUM 391, CONTRACT: "any merge write that changes local emits ONE landing signal before
 * the next push is sent"). Without it an open sheet keeps its pre-merge copy, and its next edit writes it back: the other
 * device's one-sided change is erased again (B-1650's open-tab case, 387).
 *
 * THE METHOD is sync_base_lifecycle's: createSync over the REAL worker on SQLite (test/fixtures/ms_d1_harness.js).
 *
 *   G1  a 409 whose merge lands the other device's unit → `adopt_written` naming the key, once
 *   G2  … emitted before the re-push's PUT is sent
 *   G3  a 409 whose merge leaves local as it was → no signal
 *   G4  the bench and the sheet listen. RE-POINTED (ruling `release-r7-bug-burndown` ADDENDUM 516 contract 6, 518): the bench's listener moved onto
 *       lib/shared/heldStore.js, the one cure. KEEPS: the bench's store is held by a piece that hears `adopt_written`; the sheet's line as it was.
 *       DROPS: the literal `relanded()` beside `adopt_written` in view.jsx. Hearing is driven by test/held_store.cjs and the drive's `bench-*`.
 *
 * `--cut <sha>` runs G1–G3 against that commit's lib/shared (red at the cut). Exit 0 all pass · 1 any fail / crash.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeWorker, ROOT } = require('./fixtures/ms_d1_harness.js');
const LIB = process.env.B1650_SIGNAL_LIB || path.join(ROOT, 'lib/shared');

if (process.argv.includes('--cut')) {
  const sha = process.argv[process.argv.indexOf('--cut') + 1];
  const dir = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'b1650-cut-'));
  execFileSync('git', ['ls-tree', '--name-only', sha, 'lib/shared/'], { cwd: ROOT }).toString().split('\n')
    .filter((f) => f.endsWith('.js')).forEach((f) => fs.writeFileSync(path.join(dir, path.basename(f)), execFileSync('git', ['show', sha + ':' + f], { cwd: ROOT })));
  let code = 0, out = '';
  try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1650_SIGNAL_LIB: dir }), stdio: 'pipe' }).toString(); }
  catch (e) { code = e.status == null ? -1 : e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(out.split('\n').filter((l) => /✗|passed/.test(l)).join('\n'));
  console.log('AT ' + sha + ': exit ' + code + (code === 1 ? ' (RED, as owed)' : ' (NOT RED)'));
  process.exit(code === 1 ? 0 : 1);
}

const SY = require(path.join(LIB, 'sync.js'));
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + label); }
  else { fail += 1; console.log('  ✗ ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 400))); }
}
const R = 'swrpg_saved_characters';
const T0 = 1786036920326;
const roster = (c) => JSON.stringify({ version: 1, characters: [c] });

function device(w, log) {
  const mem = {};
  const d = { mem };
  d.sync = SY.createSync({
    storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } },
    schedule: (fn) => { fn(); return 1; },
    fetch: async (url, init) => {
      init = init || {};
      if ((init.method || 'GET') === 'PUT') log.push('PUT');
      const u = new URL('http://local' + url);
      const ri = { method: init.method || 'GET', headers: Object.assign({ 'x-test-user': 'u1' }, init.headers || {}) };
      if (init.body) ri.body = init.body;
      return w.mod.handleSync(new Request(u, ri), w.env, u);
    },
  });
  d.sync.subscribe((type, detail) => { if (type === 'adopt_written') log.push('SIGNAL:' + ((detail && detail.keys) || []).join(',')); });
  return d;
}

(async () => {
  console.log('b1650_409_landing_signal — a 409 merge that changes local signals before the next push (ADDENDUM 391)');
  try {
    // A and B share kira; B (the phone) sets wounds 5; A (the open tab) sets strain 3 and meets B's copy with a 409
    const w = makeWorker();
    const la = [], lb = [];
    const A = device(w, la), B = device(w, lb);
    const k0 = { id: 'kira', name: 'kira', updatedAt: T0, sheetData: { currentWounds: 4, currentStrain: 0 } };
    A.mem[R] = roster(k0);
    await A.sync.adopt({ uid: 'u1' });
    await B.sync.adopt({ uid: 'u1' });
    B.mem[R] = roster(Object.assign({}, k0, { updatedAt: T0 + 1000, sheetData: { currentWounds: 5, currentStrain: 0 } }));
    await B.sync.pushNow(R, JSON.parse(B.mem[R]));
    la.length = 0;
    A.mem[R] = roster(Object.assign({}, k0, { updatedAt: T0 + 2000, sheetData: { currentWounds: 4, currentStrain: 3 } }));
    await A.sync.pushNow(R, JSON.parse(A.mem[R]));
    const sig = la.filter((x) => x.indexOf('SIGNAL:') === 0);
    check('G1 a 409 that lands the other device\'s unit signals once, naming the roster', sig.length === 1 && sig[0].indexOf(R) !== -1, la);
    check('G2 … between the refused PUT and the re-push', la.join(' ') === 'PUT SIGNAL:' + R + ' PUT', la);

    // a 409 whose merge leaves local unchanged: the account moved to exactly this device's copy
    const w2 = makeWorker();
    const lc = [], ld = [];
    const C = device(w2, lc), D = device(w2, ld);
    C.mem[R] = roster(k0);
    await C.sync.adopt({ uid: 'u1' });
    await D.sync.adopt({ uid: 'u1' });
    const same = roster(Object.assign({}, k0, { updatedAt: T0 + 3000, sheetData: { currentWounds: 4, currentStrain: 6 } }));
    D.mem[R] = same;
    await D.sync.pushNow(R, JSON.parse(same));
    lc.length = 0;
    C.mem[R] = same;
    await C.sync.pushNow(R, JSON.parse(same));
    check('G3 a 409 whose merge leaves local as it was sends no signal', !lc.some((x) => x.indexOf('SIGNAL:') === 0), lc);

    // the listeners
    const bench = fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
    const held = fs.readFileSync(path.join(ROOT, 'lib/shared/heldStore.js'), 'utf8');
    check('G4 the GM bench is held by the one cure, which hears adopt_written', /SWRPGHeldStore\.use\(\{ key: BenchStore/.test(bench) && /LANDINGS = \{[^}]*adopt_written: true/.test(held) && /return listen\(opts\.key, relanded\)/.test(held));
    check('G4 the open sheet re-reads on adopt_written', /type === 'adopt_written'[^\n]*onLanding\(\)|adopt_written[\s\S]{0,120}onLanding\(\)/.test(app));
  } catch (e) {
    check('the run finished without a crash', false, String(e && e.stack || e).slice(0, 500));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail || pass < 4 ? 1 : 0);
})();
