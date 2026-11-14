// B-1649 (i) — a load whose pull changes local announces it AT the write, before adopt()'s push loop, and the open
// sheet redraws on that announcement. Ruling `release-r7-bug-burndown` ADDENDUM 387 (F-1 (b)); measured in brief
// `release-r7-sync-reload-step0` (the push loop held the redraw 1.2 s at fast 3G, 4.1 s at slow 3G).
//
// The seam half drives `createSync` with every PUT held open: the redraw signal must fire while no PUT has resolved,
// with the store already holding the pulled value; `adopted` still fires once, after the pushes; a pull that changes
// nothing announces nothing. The host half reads `player/app.jsx`: the roster's re-adopt (`onLanding`) hears it.
// B1649_SYNC_DIR=<dir> loads that dir's sync.js (with syncMerge.js + recency.js beside it) — how it is shown red at
// the cut. Exit 0 every check passes · 1 a check failed or nothing ran.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.B1649_SYNC_DIR || path.join(ROOT, 'lib/shared');
const { createSync } = require(path.join(DIR, 'sync.js'));
const SIGNAL = 'adopt_written';

let rows = 0, fails = 0;
function check(label, cond, detail) {
  rows++;
  if (!cond) fails++;
  console.log((cond ? '✓ ' : '✗ ') + label + (cond || detail === undefined ? '' : '  -> ' + JSON.stringify(detail)));
}

const ROSTER = 'swrpg_saved_characters', TOMBS = 'swrpg_deleted_ids';
const MS = 1786000000000;   // a real millisecond stamp: recency refuses anything under its floor
const rec = (wounds, at) => ({ id: 'kd', name: 'Kel Dor', updatedAt: at, sheetData: { currentWounds: wounds } });
const roster = (r) => JSON.stringify({ version: 1, characters: [r] });
const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const tick = () => new Promise((r) => setTimeout(r, 5));

// local and the account each hold the roster and an empty tombstone list: a device's steady state after its first adoption
function harness(remoteRoster, localRoster) {
  const mem = { [ROSTER]: localRoster, [TOMBS]: '[]' };
  const events = [], held = [];
  let resolved = 0;
  const edges = {
    fetch: (url, opts) => {
      if (!opts || opts.method !== 'PUT') {
        return Promise.resolve(ok({ keys: { [ROSTER]: { value: remoteRoster, version: 3 }, [TOMBS]: { value: '[]', version: 2 } } }));
      }
      // every PUT is HELD until the test lets it go: the push loop cannot finish on its own
      return new Promise((res) => held.push(() => { resolved++; res(ok({ version: 4 })); }));
    },
    storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } },
    schedule: (fn) => { fn(); return 1; },
  };
  const s = createSync(edges);
  s.subscribe((t) => events.push({ t, putsResolved: resolved, roster: mem[ROSTER] }));
  return { s, mem, events, held, release: async () => { while (held.length) { held.shift()(); await tick(); } } };
}

(async () => {
  console.log('b1649_adopt_redraw_at_write — sync.js from ' + path.relative(ROOT, DIR) + '\n');

  // ── a pull that changes local ─────────────────────────────────────────────────────────────────────────────
  {
    const h = harness(roster(rec(1, MS + 2000)), roster(rec(0, MS + 1000)));
    const done = h.s.adopt();
    for (let i = 0; i < 10; i++) await tick();
    const sig = h.events.filter((e) => e.t === SIGNAL);
    check('B-1649 a load whose pull changes local announces the write while its first PUT is still in flight',
      sig.length === 1 && sig[0].putsResolved === 0 && h.held.length >= 1, { events: h.events.map((e) => e.t), held: h.held.length });
    check('B-1649 ...and at that announcement the store already holds the pulled value',
      sig.length === 1 && JSON.parse(sig[0].roster).characters[0].sheetData.currentWounds === 1, sig[0] && sig[0].roster);
    check('B-1649 `adopted` has not fired while the push loop is held (its time is unchanged)',
      !h.events.some((e) => e.t === 'adopted'), h.events.map((e) => e.t));
    await h.release();
    await done;
    const order = h.events.map((e) => e.t).filter((t) => t === SIGNAL || t === 'adopted');
    check('B-1649 `adopted` still fires exactly once, after the pushes and after the announcement',
      order.join() === SIGNAL + ',adopted' && h.events.find((e) => e.t === 'adopted').putsResolved >= 1, h.events.map((e) => [e.t, e.putsResolved]));
  }

  // ── a pull that changes nothing announces nothing ────────────────────────────────────────────────────────
  {
    const same = roster(rec(1, MS + 2000));
    const h = harness(same, same);
    const done = h.s.adopt();
    for (let i = 0; i < 10; i++) await tick();
    await h.release();
    await done;
    check('B-1649 a load whose pull matches local announces no write', !h.events.some((e) => e.t === SIGNAL) && h.events.some((e) => e.t === 'adopted'),
      h.events.map((e) => e.t));
  }

  // ── the host: the open sheet's re-adopt hears it ─────────────────────────────────────────────────────────
  {
    const src = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
    check('B-1649 player/app.jsx runs onLanding (the open sheet\'s re-adopt) on the write\'s announcement',
      new RegExp("type === '" + SIGNAL + "'\\) onLanding\\(\\)").test(src));
  }

  console.log('\n' + rows + ' checks · ' + fails + ' failed');
  process.exit(fails || !rows ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
