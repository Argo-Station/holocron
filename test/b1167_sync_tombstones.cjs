#!/usr/bin/env node
/**
 * b1167_sync_tombstones.cjs — a sync conflict (409) never brings back a deleted character, and never
 * shrinks the deletion list. Ruling `b1167-sync-tombstone-hotfix` R-B1167-1..3 · BOARD B-1167.
 *
 * The defect, measured at d712f021: `pushNow`'s 409 branch merged ONLY the pushed key, so the merge
 * saw no tombstones on either side, unioned a deleted character back into the roster, and then wrote
 * the merge's empty tombstone list over this device's own. The other device's deletions were never
 * read at all.
 *
 * Same injected-edges harness as test/sync_seam.cjs (fetch / storage / schedule), no network.
 *
 * BITES (`node test/b1167_sync_tombstones.cjs --bites`): each mutant below is applied to a COPY of
 * lib/shared/sync.js in a temp dir, this file re-runs against it, and the mutant must FAIL a leg while
 * the unmutated CONTROL exits 0. Each anchor must match exactly once, or the bite run itself fails —
 * a mutant that silently missed its line would read as "did not bite".
 *
 * A CRASH IS NOT A BITE (PRAXIS §6; ruling ADDENDUM 2, R-B1167-9). The first cut of this runner
 * copied sync.js and syncMerge.js only; syncMerge.js requires ./recency.js, so every mutant died on
 * `Cannot find module` and every BIT row read "exits 1" from a crash. So now: (a) the copy carries
 * every module sync.js loads, TRANSITIVELY, read from the `require('./…')` calls, never a hand list;
 * (b) a NO-OP row — an unmutated copy made the same way — must exit 0 first, or no BIT row counts;
 * (c) a BIT counts only on exit 1 with at least one `  FAIL  ` line and no `Error:` / `Cannot find
 * module` / `CRASHED` in the child's output, and the row names the legs that failed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SYNC_SRC = path.join(ROOT, 'lib/shared/sync.js');

// ── the mutant list (card §4 step 2) ─────────────────────────────────────────
const MUTANTS = [
  { name: 'local tombstones not passed to the merge',
    from: 'l[MERGE.TOMBSTONES] = localTombstones().concat(key === MERGE.TOMBSTONES && Array.isArray(value) ? value : []);',
    to: 'l[MERGE.TOMBSTONES] = key === MERGE.TOMBSTONES ? value : [];' },
  { name: 'the server\'s tombstones not read',
    from: 'return remoteTombstones().then(function (rt) {',
    to: 'return Promise.resolve([]).then(function (rt) {' },
  { name: 'writeLocal given the whole merged map, empty tombstone list (the cut\'s line)',
    from: 'writeLocal(conflictWrites(key, merged.merged));',
    to: 'merged.merged[MERGE.TOMBSTONES] = []; writeLocal(merged.merged);' },
];

// Every module `entry` loads through relative requires, transitively — the files a copy must carry.
function localDeps(entry) {
  const seen = new Set();
  (function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const re = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
    let m;
    const text = fs.readFileSync(file, 'utf8');
    while ((m = re.exec(text))) {
      let dep = path.resolve(path.dirname(file), m[1]);
      if (!fs.existsSync(dep) && fs.existsSync(dep + '.js')) dep += '.js';
      walk(dep);
    }
  })(entry);
  return Array.from(seen);
}

if (process.argv.includes('--bites')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b1167-bites-'));
  const deps = localDeps(SYNC_SRC);
  deps.forEach((f) => {
    if (path.dirname(f) !== path.dirname(SYNC_SRC)) throw new Error('a dependency outside lib/shared/: ' + f);
  });
  const run = (dir) => {
    const env = Object.assign({}, process.env, { B1167_SYNC_DIR: dir || '' });
    try {
      const out = execFileSync(process.execPath, [__filename], { env, stdio: 'pipe' }).toString();
      return { code: 0, out };
    } catch (e) {
      return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
    }
  };
  // a copy of lib/shared/sync.js and everything it loads, with `src` as sync.js
  const copyWith = (name, src) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    deps.forEach((f) => fs.copyFileSync(f, path.join(dir, path.basename(f))));
    fs.writeFileSync(path.join(dir, 'sync.js'), src);
    return dir;
  };
  const crashed = (out) => /Error:|Cannot find module|CRASHED/.test(out);
  const failedLegs = (out) => Array.from(new Set((out.match(/^ {2}FAIL {2}\(([a-z0-9]+)\)/gm) || [])
    .map((l) => l.replace(/^ {2}FAIL {2}/, ''))));
  let bad = 0;
  console.log('copies carry ' + deps.length + ' module(s): ' + deps.map((f) => path.basename(f)).join(', '));
  const control = run('');
  console.log((control.code === 0 ? '  PASS  ' : '  FAIL  ') + 'CONTROL (the tree\'s own sync.js) exits 0 — got ' + control.code);
  if (control.code !== 0) bad += 1;
  const src = fs.readFileSync(SYNC_SRC, 'utf8');
  const noop = run(copyWith('noop', src));
  const noopOk = noop.code === 0 && !crashed(noop.out);
  console.log((noopOk ? '  PASS  ' : '  FAIL  ') + 'NO-OP (an unmutated copy made the mutants\' way) exits 0 — got ' + noop.code
    + (crashed(noop.out) ? ' (CRASHED)' : ''));
  if (!noopOk) bad += 1;
  MUTANTS.forEach((m, i) => {
    const hits = src.split(m.from).length - 1;
    if (hits !== 1) { bad += 1; console.log('  FAIL  mutant "' + m.name + '": anchor matched ' + hits + ' times (need exactly 1)'); return; }
    const r = run(copyWith('m' + i, src.replace(m.from, m.to)));
    const legs = failedLegs(r.out);
    const bit = noopOk && r.code === 1 && legs.length > 0 && !crashed(r.out);
    console.log((bit ? '  PASS  ' : '  FAIL  ') + 'BIT: "' + m.name + '" — exit ' + r.code
      + (crashed(r.out) ? ', CRASHED (not a bite)' : '') + ', failed legs: ' + (legs.length ? legs.join(' ') : 'none'));
    if (!bit) bad += 1;
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (MUTANTS.length + 2 - bad) + '/' + (MUTANTS.length + 2) + ' bite rows');
  process.exit(bad ? 1 : 0);
}

const { createSync } = require(process.env.B1167_SYNC_DIR ? path.join(process.env.B1167_SYNC_DIR, 'sync.js') : SYNC_SRC);

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const ROSTER = 'swrpg_saved_characters';
const TOMBS = 'swrpg_deleted_ids';
const roster = (ids) => JSON.stringify({ version: 1, characters: ids.map((id) => ({ id, name: 'C ' + id })) });
const idsOf = (raw) => JSON.parse(raw).characters.map((c) => c.id).sort();
const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const conflict = (value, version) => ({ ok: false, status: 409,
  json: () => Promise.resolve({ ok: false, error: 'version_conflict', current: { value, version } }) });

function harness(routes, seed) {
  const calls = [];
  const mem = Object.assign({}, seed || {});
  const writes = [];
  const events = [];
  const edges = {
    fetch: (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
      const r = routes[(opts && opts.method) === 'PUT' ? 'PUT ' + url : url];
      if (!r) return Promise.reject(new Error('unrouted ' + url));
      return Promise.resolve(typeof r === 'function' ? r(opts, calls) : r);
    },
    storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { writes.push(k); mem[k] = v; } },
    schedule: (fn) => { fn(); return 1; },
  };
  const s = createSync(edges);
  s.subscribe((t, d) => events.push({ t, d }));
  const puts = () => calls.filter((c) => c.method === 'PUT');
  const gets = () => calls.filter((c) => c.method === 'GET');
  return { s, calls, mem, writes, events, puts, gets };
}
// a PUT route that answers 409 once, then accepts
function conflictOnce(value, version, next) {
  let n = 0;
  return () => { n += 1; return n === 1 ? conflict(value, version) : ok({ ok: true, version: next }); };
}
const retryIds = (put) => JSON.parse(put.body.value).characters.map((c) => c.id).sort();

(async () => {
  console.log('b1167_sync_tombstones — a 409 never resurrects a deletion\n');

  // ── (a) B-1167's measured fixture, verbatim (§2): THIS device deleted `gone` ──────────────
  {
    const seed = { [ROSTER]: roster(['mine']), [TOMBS]: JSON.stringify(['gone']) };
    const h = harness({
      [`PUT /api/v1/sync/${ROSTER}`]: conflictOnce(roster(['mine', 'gone']), 7, 8),
      '/api/v1/sync': ok({ ok: true, keys: { [ROSTER]: { value: roster(['mine', 'gone']), version: 7 } } }),
    }, seed);
    await h.s.pushNow(ROSTER, JSON.parse(seed[ROSTER]));
    const after = idsOf(h.mem[ROSTER]);
    check('(a) R-B1167-1: this device\'s deletion is NOT unioned back into local storage', after.join() === 'mine', after);
    const tombs = JSON.parse(h.mem[TOMBS]);
    check('(a) R-B1167-2: this device\'s deletion list is NOT wiped', tombs.indexOf('gone') !== -1, tombs);
    const p = h.puts();
    check('(a) the reconciled value is pushed again (setup: a retry happened)', p.length === 2, p.length);
    check('(a) R-B1167-1: the retry PUT does not carry `gone` to the server',
      p.length === 2 && retryIds(p[1]).join() === 'mine', p.length === 2 ? retryIds(p[1]) : p);
    check('(a) R-B1167-3: the retry is still at the server\'s reported version', p.length === 2 && p[1].body.version === 7);
    check('(a) R-B1167-6: exactly ONE read of the server per LIST-key 409', h.gets().length === 1, h.gets().length);
    check('(a) R-B1167-3: the 409 path writes only the roster and the deletion list',
      h.writes.every((k) => k === ROSTER || k === TOMBS), h.writes);
  }

  // ── (b) the OTHER device deleted `y`; the 409's roster already lacks it ──────────────────
  {
    const seed = { [ROSTER]: roster(['mine', 'y']), [TOMBS]: JSON.stringify([]) };
    const h = harness({
      [`PUT /api/v1/sync/${ROSTER}`]: conflictOnce(roster(['mine']), 7, 8),
      '/api/v1/sync': ok({ ok: true, keys: {
        [ROSTER]: { value: roster(['mine']), version: 7 },
        [TOMBS]: { value: JSON.stringify(['y']), version: 3 },
      } }),
    }, seed);
    await h.s.pushNow(ROSTER, JSON.parse(seed[ROSTER]));
    const after = idsOf(h.mem[ROSTER]);
    check('(b) R-B1167-1: a character the OTHER device deleted is not put back locally', after.indexOf('y') === -1, after);
    const p = h.puts();
    check('(b) R-B1167-1: ...nor sent back up in the retry PUT',
      p.length === 2 && retryIds(p[1]).indexOf('y') === -1, p.length === 2 ? retryIds(p[1]) : p.length);
    const tombs = JSON.parse(h.mem[TOMBS]);
    check('(b) R-B1167-2: the local deletion list grows by the server\'s id (⊇ [y])', tombs.indexOf('y') !== -1, tombs);
    check('(b) R-B1167-6: exactly ONE read of the server per LIST-key 409', h.gets().length === 1, h.gets().length);
    check('(b) R-B1167-3: the retry is at the 409\'s version, not the read\'s', p.length === 2 && p[1].body.version === 7);
    check('(b) R-B1167-3: and the version lands on the retry\'s result', h.s._versions()[ROSTER] === 8, h.s._versions());
  }

  // ── (c) a 409 on the deletion list itself stays a set union ──────────────────────────────
  {
    const seed = { [TOMBS]: JSON.stringify(['a']) };
    const h = harness({ [`PUT /api/v1/sync/${TOMBS}`]: conflictOnce(JSON.stringify(['b']), 4, 5) }, seed);
    await h.s.pushNow(TOMBS, JSON.parse(seed[TOMBS]));
    const tombs = JSON.parse(h.mem[TOMBS]).slice().sort();
    check('(c) a 409 on swrpg_deleted_ids leaves the UNION locally', tombs.join() === 'a,b', tombs);
    const p = h.puts();
    check('(c) ...and pushes the union at the server\'s version',
      p.length === 2 && JSON.parse(p[1].body.value).slice().sort().join() === 'a,b' && p[1].body.version === 4,
      p.map((x) => x.body));
  }

  // ── (d) a 409 on a WHOLE key leaves the deletion list byte-identical ─────────────────────
  {
    const tombsRaw = JSON.stringify(['gone', 'also-gone']);
    // d1: the envelopes differ → an envelope conflict (asks, no retry)
    const seed = { swrpg_mods: JSON.stringify(['x']), [TOMBS]: tombsRaw };
    const h = harness({ 'PUT /api/v1/sync/swrpg_mods': conflict(JSON.stringify(['y']), 4) }, seed);
    const r = await h.s.pushNow('swrpg_mods', ['x']);
    check('(d1) setup: a differing WHOLE key raises a conflict (non-vacuous)', r.conflict === true, r);
    check('(d1) R-B1167-2: the deletion list is byte-identical after a WHOLE-key 409', h.mem[TOMBS] === tombsRaw, h.mem[TOMBS]);
    check('(d1) R-B1167-3: the 409 path writes only the pushed key', h.writes.every((k) => k === 'swrpg_mods'), h.writes);
    check('(d1) R-B1167-6: ZERO reads of the server on a WHOLE-key 409', h.gets().length === 0, h.gets().length);
    // d2: identical envelopes → a clean retry
    const h2 = harness({ 'PUT /api/v1/sync/swrpg_mods': conflictOnce(JSON.stringify(['x']), 4, 5) },
      { swrpg_mods: JSON.stringify(['x']), [TOMBS]: tombsRaw });
    const r2 = await h2.s.pushNow('swrpg_mods', ['x']);
    check('(d2) setup: an identical WHOLE key retries clean', r2.ok === true && h2.puts().length === 2, r2);
    check('(d2) R-B1167-2: the deletion list is byte-identical after a clean WHOLE-key 409', h2.mem[TOMBS] === tombsRaw, h2.mem[TOMBS]);
    check('(d2) R-B1167-6: ZERO reads of the server on a WHOLE-key 409', h2.gets().length === 0, h2.gets().length);
  }

  // ── (e) CONTROL: a clean 409 with no deletions anywhere — sync_seam's case ───────────────
  {
    const seed = { [ROSTER]: roster(['mine']) };
    const h = harness({
      [`PUT /api/v1/sync/${ROSTER}`]: conflictOnce(roster(['theirs']), 7, 8),
      '/api/v1/sync': ok({ ok: true, keys: { [ROSTER]: { value: roster(['theirs']), version: 7 } } }),
    }, seed);
    await h.s.pushNow(ROSTER, JSON.parse(seed[ROSTER]));
    check('(e) CONTROL: the local work still merges with the other device\'s — mine,theirs',
      idsOf(h.mem[ROSTER]).join() === 'mine,theirs', idsOf(h.mem[ROSTER]));
    const p = h.puts();
    check('(e) CONTROL: the retry carries mine,theirs at version 7',
      p.length === 2 && retryIds(p[1]).join() === 'mine,theirs' && p[1].body.version === 7, p.map((x) => x.body));
    check('(e) CONTROL: the version lands on the retry\'s result', h.s._versions()[ROSTER] === 8, h.s._versions());
  }

  // ── (f) R-B1167-6 under the bound: one read per LIST-key 409, never more ────────────────
  {
    let n = 0;
    const h = harness({
      [`PUT /api/v1/sync/${ROSTER}`]: () => { n += 1; return conflict(roster(['other' + n]), n); },
      '/api/v1/sync': ok({ ok: true, keys: {} }),
    }, { [ROSTER]: roster(['mine']) });
    const r = await h.s.pushNow(ROSTER, JSON.parse(roster(['mine'])));
    check('(f) setup: a server that never stops moving exhausts the bound', r.error === 'conflict_retry_exhausted', r);
    check('(f) R-B1167-6: three LIST-key 409s → three PUTs and exactly three reads',
      h.puts().length === 3 && h.gets().length === 3, { puts: h.puts().length, gets: h.gets().length });
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('b1167_sync_tombstones: CRASHED — ' + (e && e.stack || e)); process.exit(2); });
