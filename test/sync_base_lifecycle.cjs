#!/usr/bin/env node
/**
 * sync_base_lifecycle.cjs — B-1650's sync base: WHEN it is written, pruned, cleared and refused (brief
 * `release-r7-sync-base-step0` §C; ruling `release-r7-bug-burndown` ADDENDUM 389, with R-1 and R-2). The merge that
 * READS the base is part 2 (`sync_merge_base.cjs`); this guard pins only its lifecycle.
 *
 * THE METHOD is release_no_loss_leg2's: createSync clients over ONE server, the REAL worker/sync.js on SQLite
 * (test/fixtures/ms_d1_harness.js), each device a localStorage map. No pack lane (no `packs` edge).
 *
 *   L1  no uid → nothing reads or writes the base (the seam as it was)
 *   L2  W-b: an accepted PUT writes the value it SENT — not the store's value, which moved during the request
 *   L3  W-a (R-1): an adopted pull whose local write read back sets base := remote for EVERY non-held record, also
 *       where the merge kept this device's copy (the push failed, so W-b cannot hide it)
 *   L4  a record under an open question keeps its old base; the others move
 *   L5  a local write that does not read back advances nothing (a full store)
 *   L6  a room-suspended bench is not written locally, so its base does not move
 *   L7  the 409 path: its body is an adopted pull (W-a), and the re-push's 200 is W-b
 *   L8  pruned: an id gone from the account leaves the base; a tombstoned id never enters it
 *   L9  refused: another account's base, an unknown `v`, an unreadable value → absent, then rewritten as this one's
 *   L10 cleared: clearBase() removes it and only it (R-2 (b)'s function); account.js names the account to adopt()
 *   R2a the ceiling: past BASE_CEILING the base is skipped and the person's data is written
 *   R2c a full store: a primary write that fails with the base present succeeds once the base is dropped
 *
 * BITES: `--bites` runs the mutants below against a copy of lib/shared/ (never this tree's).
 *
 * Exit 0 all pass · 1 any fail / crash / zero harvest.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { makeWorker, ROOT } = require('./fixtures/ms_d1_harness.js');
const LIB = process.env.SYNC_BASE_LIB || path.join(ROOT, 'lib/shared');
const SY = require(path.join(LIB, 'sync.js'));

// BITES (`node test/sync_base_lifecycle.cjs --bites`): each mutant edits sync.js in a COPY of lib/shared/*.js, this file
// re-runs against the copy, and must exit 1 with a failed row and no crash, after a no-op copy exits 0 (PRAXIS §6).
const MUTANTS = [
 {
  "name": "W-a dropped from adopt",
  "from": "        baseFromPull(remote.values, result.merged, result.conflicts);     // W-a, after the local write (R-1)\n",
  "to": ""
 },
 {
  "name": "no read-back",
  "from": "        if (store.get(k) !== JSON.stringify(written[k])) return;\n",
  "to": ""
 },
 {
  "name": "R-1 narrowed to merged==remote",
  "from": "        var m = has ? recordsOf(k, remoteValues[k]) : {};\n",
  "to": "        var m = has ? recordsOf(k, remoteValues[k]) : {}; var mw = recordsOf(k, written[k]); Object.keys(m).forEach(function (id) { if (JSON.stringify(m[id]) !== JSON.stringify(mw[id])) { if (old[k] && old[k][id]) m[id] = old[k][id]; else delete m[id]; } });\n"
 },
 {
  "name": "held ids not kept",
  "from": "        Object.keys(heldIds).forEach(function (id) {",
  "to": "        Object.keys({}).forEach(function (id) {"
 },
 {
  "name": "W-b from the store",
  "from": "            if (heldHere) baseFromPush(key, raw);",
  "to": "            if (heldHere) baseFromPush(key, store.get(key));"
 },
 {
  "name": "W-b without heldHere",
  "from": "            if (heldHere) baseFromPush(key, raw);",
  "to": "            baseFromPush(key, raw);"
 },
 {
  "name": "W-a dropped from 409",
  "from": "                baseFromPull(pulled, writes, merged.conflicts);",
  "to": "                void pulled;"
 },
 {
  "name": "uid refusal removed",
  "from": "o.v !== BASE_V || o.uid !== uid ||",
  "to": "o.v !== BASE_V ||"
 },
 {
  "name": "tombstones enter base",
  "from": "if (!(id && dead[id])) m[id]",
  "to": "if (true) m[id]"
 },
 {
  "name": "no ceiling",
  "from": "        if (used + BASE_KEY.length + raw.length > BASE_CEILING) {\n          // past",
  "to": "        if (false) {\n          // past"
 },
 {
  "name": "quota retry does not clear base",
  "from": "        try { store.set(k, raw); } catch (e) {\n          clearBase();",
  "to": "        try { store.set(k, raw); } catch (e) {\n          void 0;"
 }
];

if (process.argv.includes('--bites')) {
  const src = path.join(ROOT, 'lib/shared');
  const tmp = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'sync-base-bites-'));
  const copy = (name, text) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    fs.readdirSync(src).filter((f) => f.endsWith('.js')).forEach((f) => fs.copyFileSync(path.join(src, f), path.join(dir, f)));
    if (text != null) fs.writeFileSync(path.join(dir, 'sync.js'), text);
    return dir;
  };
  const run = (dir) => {
    try { return { code: 0, out: execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { SYNC_BASE_LIB: dir }), stdio: 'pipe' }).toString() }; }
    catch (e) { return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
  };
  const crashed = (out) => /without a crash/.test(out);
  const rows = (out) => (out.match(/^ {2}✗ (\S+)/gm) || []).map((l) => l.trim().slice(2));
  let bad = 0;
  const noop = run(copy('noop'));
  const noopOk = noop.code === 0 && !crashed(noop.out);
  console.log((noopOk ? '  PASS  ' : '  FAIL  ') + 'NO-OP copy exits 0 — got ' + noop.code);
  if (!noopOk) bad += 1;
  const text = fs.readFileSync(path.join(src, 'sync.js'), 'utf8');
  MUTANTS.forEach((m, i) => {
    const hits = text.split(m.from).length - 1;
    if (hits !== 1) { bad += 1; console.log('  FAIL  "' + m.name + '": anchor matched ' + hits + ' times'); return; }
    const r = run(copy('m' + i, text.replace(m.from, m.to)));
    const bit = noopOk && r.code === 1 && rows(r.out).length > 0 && !crashed(r.out);
    if (!bit) bad += 1;
    console.log((bit ? '  PASS  ' : '  FAIL  ') + 'BIT "' + m.name + '" — exit ' + r.code + (crashed(r.out) ? ' CRASHED' : '') + ', rows: ' + Array.from(new Set(rows(r.out))).join(' '));
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (MUTANTS.length + 1 - bad) + '/' + (MUTANTS.length + 1) + ' bite rows');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + label); }
  else { fail += 1; console.log('  ✗ ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 400))); }
}

const R = 'swrpg_saved_characters', V = 'swrpg_vessels_v1', BENCH = 'swrpg_npc_bench', T = 'swrpg_deleted_ids';
const BK = 'swrpg_sync_base_v1';
const T0 = 1786036920326;
const ch = (id, at, sheet) => ({ id, name: id, updatedAt: at, sheetData: Object.assign({ currentWounds: 0, currentStrain: 0 }, sheet || {}) });
const roster = (...cs) => JSON.stringify({ version: 1, characters: cs });

// a device: a localStorage map, an optional quota (in code units) and hooks around the worker
function device(w, o) {
  o = o || {};
  const mem = {};
  const d = { mem, failPut: false, onPut: null };
  const units = () => Object.keys(mem).reduce((n, k) => n + k.length + (mem[k] == null ? 0 : mem[k].length), 0);
  const storage = {
    get: (k) => (k in mem ? mem[k] : null),
    set: (k, v) => {
      if (o.quota != null && units() - (k in mem ? k.length + mem[k].length : 0) + k.length + v.length > o.quota) throw new Error('QuotaExceededError');
      if (o.refuse && o.refuse(k)) throw new Error('QuotaExceededError');
      mem[k] = v;
    },
    remove: (k) => { delete mem[k]; },
  };
  const fetchFor = async (url, init) => {
    init = init || {};
    if ((init.method || 'GET') === 'PUT') {
      if (d.failPut) throw new Error('offline');
      if (d.onPut) d.onPut(url, init);
    }
    const u = new URL('http://local' + url);
    const ri = { method: init.method || 'GET', headers: Object.assign({ 'x-test-user': o.user || 'u1' }, init.headers || {}) };
    if (init.body) ri.body = init.body;
    return w.mod.handleSync(new Request(u, ri), w.env, u);
  };
  d.sync = SY.createSync({
    fetch: fetchFor, storage, schedule: (fn) => { fn(); return 1; },
    inRoom: o.inRoom, usedUnits: o.usedUnits === false ? null : (o.usedUnits || units), baseCeiling: o.baseCeiling,
  });
  d.base = () => { try { return JSON.parse(mem[BK]); } catch (e) { return null; } };
  d.rec = (key, id) => { const b = d.base(); return b && b.keys && b.keys[key] ? b.keys[key][id] : undefined; };
  return d;
}
const put = (w, key, value, version, user) => w.handle('PUT', key, { value: typeof value === 'string' ? value : JSON.stringify(value), version: version || 0 }, user);

(async () => {
  console.log('sync_base_lifecycle — B-1650\'s base: written, pruned, cleared, refused (ADDENDUM 389 §C, R-1, R-2)');
  try {
    // ── L1 no uid ──
    {
      const w = makeWorker();
      const A = device(w);
      A.mem[R] = roster(ch('kira', T0));
      await A.sync.adopt();
      check('L1 adopt() with no uid writes no base', !(BK in A.mem), Object.keys(A.mem));
      check('L1 … and the roster still reached the account', JSON.parse((await w.handle('GET')).json.keys[R].value).characters[0].id === 'kira');
    }

    // ── L2 W-b: the value SENT ──
    {
      const w = makeWorker();
      const A = device(w);
      A.mem[R] = roster(ch('kira', T0, { currentWounds: 1 }));
      A.onPut = (url) => { if (url.indexOf(R) !== -1) A.mem[R] = roster(ch('kira', T0 + 5, { currentWounds: 9 })); };
      await A.sync.adopt({ uid: 'u1' });
      const b = A.base();
      check('L2 the base names this account and version 1', b && b.v === 1 && b.uid === 'u1', b);
      check('L2 W-b: the base holds what the PUT sent (wounds 1), not the store\'s later value (9)',
        A.rec(R, 'kira') && A.rec(R, 'kira').sheetData.currentWounds === 1, A.rec(R, 'kira'));
    }

    // ── L3 W-a (R-1) ──
    {
      const w = makeWorker();
      await put(w, R, roster(ch('kira', T0, { currentWounds: 5 })));
      const B = device(w);
      B.mem[R] = roster(ch('kira', T0 + 1000, { currentStrain: 3 }));   // newer here: today's merge keeps B's copy
      B.failPut = true;                                                // so no 200 can move the base after W-a
      await B.sync.adopt({ uid: 'u1' });
      const kept = JSON.parse(B.mem[R]).characters[0];
      check('L3 setup: the merge kept this device\'s copy (strain 3)', kept.sheetData.currentStrain === 3, kept);
      check('L3 R-1: the base is the ACCOUNT\'s copy (wounds 5) although the merge kept local',
        B.rec(R, 'kira') && B.rec(R, 'kira').sheetData.currentWounds === 5 && B.rec(R, 'kira').sheetData.currentStrain === 0, B.rec(R, 'kira'));
    }

    // ── L4 a held record keeps its old base ──
    {
      const w = makeWorker();
      const nostamp = (id, n) => ({ id, name: id + ' ' + n });       // no stamp: the merge refuses to guess and asks
      await put(w, R, roster(nostamp('kira', 'v1'), ch('jax', T0)));
      const A = device(w);
      await A.sync.adopt({ uid: 'u1' });
      check('L4 setup: the base holds kira v1', A.rec(R, 'kira') && A.rec(R, 'kira').name === 'kira v1', A.base());
      const cur = (await w.handle('GET')).json.keys[R].version;
      await put(w, R, roster(nostamp('kira', 'account'), ch('jax', T0 + 50)), cur);
      A.mem[R] = roster(nostamp('kira', 'device'), ch('jax', T0));
      const r = await A.sync.adopt({ uid: 'u1' });
      check('L4 setup: kira is an open question', r.conflicts.some((c) => c.key === R && String(c.id) === 'kira'), r.conflicts);
      check('L4 the held record keeps its old base (kira v1)', A.rec(R, 'kira') && A.rec(R, 'kira').name === 'kira v1', A.rec(R, 'kira'));
      check('L4 the other record\'s base moved to the account\'s (jax @ +50)', A.rec(R, 'jax') && A.rec(R, 'jax').updatedAt === T0 + 50, A.rec(R, 'jax'));
    }

    // ── L5 a local write that does not read back ──
    {
      const w = makeWorker();
      await put(w, V, { v: 2, vessels: [{ id: 's1', name: 'Wayfarer', updatedAt: T0 }] });
      const A = device(w, { refuse: (k) => k === V });
      await A.sync.adopt({ uid: 'u1' });
      check('L5 the vessels key was not written here (the store refused)', !(V in A.mem));
      check('L5 … so its base did not advance', !(A.base() && A.base().keys && A.base().keys[V]), A.base());
    }

    // ── L6 the room-suspended bench ──
    {
      const w = makeWorker();
      await put(w, BENCH, { version: 1, groups: [{ id: 'g1', name: 'Stormtroopers', members: [] }] });
      const A = device(w, { inRoom: () => true });
      await A.sync.adopt({ uid: 'u1' });
      check('L6 setup: in a room, the account\'s bench is not written here', !(BENCH in A.mem));
      check('L6 … and the bench\'s base did not move', !(A.base() && A.base().keys && A.base().keys[BENCH]), A.base());
    }

    // ── L7 the 409 path ──
    {
      const w = makeWorker();
      const A = device(w), B = device(w);
      A.mem[R] = roster(ch('kira', T0));
      await A.sync.adopt({ uid: 'u1' });
      await B.sync.adopt({ uid: 'u1' });
      B.mem[R] = roster(ch('kira', T0 + 100, { currentWounds: 5 }));
      await B.sync.pushNow(R, JSON.parse(B.mem[R]));
      const seen = [];
      A.onPut = (url, init) => { if (url.indexOf(R) !== -1) seen.push(JSON.parse(init.body).version); };
      A.mem[R] = roster(ch('kira', T0 + 200, { currentStrain: 3 }));
      const res = await A.sync.pushNow(R, JSON.parse(A.mem[R]));
      check('L7 setup: A\'s first PUT was refused (409) and re-pushed', seen.length === 2 && res.ok, { seen, res });
      const sent = JSON.parse(A.mem[R]).characters[0];
      check('L7 the re-push\'s 200 is W-b: the base equals what A sent last', JSON.stringify(A.rec(R, 'kira')) === JSON.stringify(sent), { base: A.rec(R, 'kira'), sent });
      // the 409's body alone (its re-push fails): W-a sets the base to the account's copy, B's wounds 5
      const C = device(w);
      await C.sync.adopt({ uid: 'u1' });
      const cur = (await w.handle('GET')).json.keys[R].version;
      const k0 = JSON.parse(C.mem[R]).characters[0];             // one field changed on each side, from the synced copy
      await put(w, R, roster(Object.assign({}, k0, { updatedAt: T0 + 300, sheetData: Object.assign({}, k0.sheetData, { currentWounds: 7 }) })), cur);
      let puts = 0;
      C.onPut = () => { puts += 1; if (puts > 1) throw new Error('offline'); };
      C.mem[R] = roster(Object.assign({}, k0, { updatedAt: T0 + 400, sheetData: Object.assign({}, k0.sheetData, { currentStrain: 2 }) }));
      await C.sync.pushNow(R, JSON.parse(C.mem[R]));
      check('L7 a 409 whose re-push fails: W-a set the base to the 409\'s copy (wounds 7)',
        C.rec(R, 'kira') && C.rec(R, 'kira').sheetData.currentWounds === 7 && C.rec(R, 'kira').updatedAt === T0 + 300, C.rec(R, 'kira'));
    }

    // ── L8 pruned ──
    {
      const w = makeWorker();
      const A = device(w);
      A.mem[R] = roster(ch('kira', T0), ch('jax', T0));
      await A.sync.adopt({ uid: 'u1' });
      check('L8 setup: both in the base', !!A.rec(R, 'kira') && !!A.rec(R, 'jax'), A.base());
      A.mem[T] = JSON.stringify(['jax']);
      A.mem[R] = roster(ch('kira', T0 + 1));
      await A.sync.pushNow(T, ['jax']);
      await A.sync.pushNow(R, JSON.parse(A.mem[R]));
      check('L8 an id gone from what was sent leaves the base', !A.rec(R, 'jax') && !!A.rec(R, 'kira'), A.base());
      const cur = (await w.handle('GET')).json.keys[R].version;
      await put(w, R, roster(ch('kira', T0 + 1), ch('jax', T0)), cur);   // an account copy that still lists jax
      const B = device(w);
      B.mem[R] = roster(ch('jax', T0 + 9));                            // a device that never saw the deletion
      B.failPut = true;                                                // W-a alone: no 200 rewrites the key after it
      await B.sync.adopt({ uid: 'u1' });
      check('L8 a tombstoned id never enters the base', !B.rec(R, 'jax'), B.base());
      check('L8 the tombstone list itself has no base', !((B.base() || {}).keys || {})[T], B.base());
    }

    // ── L9 refused ──
    {
      const w = makeWorker();
      await put(w, R, roster(ch('kira', T0)));
      for (const [name, planted] of [['another account\'s', { v: 1, uid: 'u2', keys: { [V]: { ghost: { id: 'ghost' } } } }],
        ['an unknown v', { v: 99, uid: 'u1', keys: { [V]: { ghost: { id: 'ghost' } } } }], ['an unreadable', '{not json']]) {
        const A = device(w);
        A.mem[BK] = typeof planted === 'string' ? planted : JSON.stringify(planted);
        await A.sync.adopt({ uid: 'u1' });
        const b = A.base();
        check('L9 ' + name + ' base is rewritten as this account\'s, carrying none of it', b && b.v === 1 && b.uid === 'u1' && !!A.rec(R, 'kira') && !(b.keys || {})[V], b);
        A.mem[BK] = typeof planted === 'string' ? planted : JSON.stringify(planted);
        check('L9 … and, signed in as u1, reads as absent', A.sync.readBase() === null, A.sync.readBase());
      }
    }

    // ── L10 cleared ──
    {
      const w = makeWorker();
      const A = device(w);
      A.mem[R] = roster(ch('kira', T0));
      await A.sync.adopt({ uid: 'u1' });
      check('L10 setup: a base exists', BK in A.mem);
      A.sync.clearBase();
      check('L10 clearBase() removes it, and only it', !(BK in A.mem) && R in A.mem);
      const acc = fs.readFileSync(path.join(LIB, 'account.js'), 'utf8');
      // RE-POINTED (ruling `release-r7-bug-burndown` ADDENDUM 531 item 6, §C as amended): sign-out no longer clears; test/b1708_base_kept.cjs K1, K2, K4 hold the new lifecycle.
      check('L10 account.js names the account to adopt()', /sync\.adopt\(\{\s*uid:\s*s\.user\.id\s*\}\)/.test(acc));
    }

    // ── R-2 (a) the ceiling ──
    {
      const w = makeWorker();
      await put(w, R, roster(ch('kira', T0)));
      const A = device(w, { usedUnits: () => 3499990 });             // the origin is all but at the ceiling
      await A.sync.adopt({ uid: 'u1' });
      check('R2a past the ceiling the base is skipped', !(BK in A.mem), A.base());
      check('R2a … and the person\'s data is written', JSON.parse(A.mem[R]).characters[0].id === 'kira');
    }

    // ── R-2 (c) a full store ──
    {
      const w = makeWorker();
      const big = 'x'.repeat(3000);
      await put(w, R, roster(ch('kira', T0, { notes: big })));
      const A = device(w, { quota: 9000 });
      await A.sync.adopt({ uid: 'u1' });
      check('R2c setup: the base is present beside the roster', BK in A.mem && R in A.mem, Object.keys(A.mem));
      const cur = (await w.handle('GET')).json.keys[R].version;
      await put(w, R, roster(ch('kira', T0, { notes: big }), ch('jax', T0 + 1, { notes: big })), cur);
      const B = device(w, { quota: 9000 });
      Object.assign(B.mem, A.mem);
      await B.sync.adopt({ uid: 'u1' });
      const ids = JSON.parse(B.mem[R]).characters.map((c) => c.id);
      check('R2c the roster that no longer fits beside the base was written (kira and jax)', ids.length === 2, ids);
      check('R2c … because the base was dropped, not the data', !(BK in B.mem) || B.mem[BK].length < big.length, Object.keys(B.mem));
    }
  } catch (e) {
    check('the run finished without a crash', false, String(e && e.stack || e).slice(0, 600));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail || !pass ? 1 : 0);
})();
