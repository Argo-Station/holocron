#!/usr/bin/env node
/* b1708_base_kept — B-1708, the sign-out road (ruling `release-r7-bug-burndown` ADDENDUM 531, §C as amended).
 *   K1 account.js's sign-out branch stops syncing and leaves the base; K2 a sign-out through the real seam keeps it
 *   K3 a merge with the kept base: both edited asks; different units keep both; one-sided quiet; a long-stale base asks
 *   K4 account deletion clears it at account.js's own door, on success only; its copy of the key equals sync.js's BASE_KEY
 *   S1 a base question carries each side's own stamp; the candidates' stamps are unchanged; `stamps` reaches no stored record; a no-base question has none
 *   S2 the prompt's own lines read those stamps
 * `--bite` re-runs against a mutated copy of lib/shared/ per mutant; each must exit 1 with a failed row, after a no-op copy exits 0. Exit 0 all pass · 1 otherwise. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const LIB = process.env.B1708_LIB || path.join(ROOT, 'lib/shared');
const read = (f) => fs.readFileSync(path.join(LIB, f), 'utf8');

const MUTANTS = [
  { n: 'the clear restored in the sign-out branch', f: 'account.js', from: "        sync.unwatch();\n", to: "        sync.unwatch();\n        if (sync.clearBase) sync.clearBase();\n", row: 'K1' },
  { n: 'deletion no longer clears', f: 'account.js', from: 'if (ok && edges.clearSyncBase) edges.clearSyncBase();', to: '', row: 'K4' },
  { n: 'deletion clears on failure too', f: 'account.js', from: 'if (ok && edges.clearSyncBase)', to: 'if (edges.clearSyncBase)', row: 'K4' },
  { n: 'the key copy drifts', f: 'account.js', from: "removeItem('swrpg_sync_base_v1')", to: "removeItem('swrpg_sync_base')", row: 'K4' },
  { n: 'stamps removed from the question', f: 'syncMerge.js', from: ", stamps: { local: pair.local.updatedAt, remote: pair.remote.updatedAt } }", to: ' }', row: 'S1' },
  { n: 'stamps swapped', f: 'syncMerge.js', from: 'stamps: { local: pair.local.updatedAt, remote: pair.remote.updatedAt }', to: 'stamps: { local: pair.remote.updatedAt, remote: pair.local.updatedAt }', row: 'S1' },
  { n: 'the prompt ignores them', f: 'ui.jsx', from: 'here: whenPhrase(c.stamps ? { updatedAt: c.stamps.local } : c.local),', to: 'here: whenPhrase(c.local),', row: 'S2' },
];
if (process.argv.includes('--bite')) {
  const run = (dir) => { try { execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1708_LIB: dir }), stdio: 'pipe' }); return { code: 0, out: '' }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };
  const tmp = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'b1708-bite-'));
  const copy = () => { const d = fs.mkdtempSync(path.join(tmp, 'm')); fs.readdirSync(path.join(ROOT, 'lib/shared')).filter((f) => /\.(js|jsx)$/.test(f)).forEach((f) => fs.copyFileSync(path.join(ROOT, 'lib/shared', f), path.join(d, f))); return d; };
  let bad = 0;
  const none = run(copy());
  console.log('no-op copy: exit ' + none.code); if (none.code !== 0) bad += 1;
  for (const m of MUTANTS) {
    const d = copy(); const p = path.join(d, m.f); const s = fs.readFileSync(p, 'utf8');
    if (!s.includes(m.from)) { console.log('MUTANT DOES NOT APPLY: ' + m.n); bad += 1; continue; }
    fs.writeFileSync(p, s.replace(m.from, m.to));
    const r = run(d); const hit = r.code === 1 && new RegExp('✗ ' + m.row).test(r.out);
    console.log((hit ? 'bit  ' : 'MISS ') + m.n + ' → exit ' + r.code + ' (' + m.row + ')'); if (!hit) bad += 1;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
}

const MERGE = require(path.join(LIB, 'syncMerge.js'));
const SY = require(path.join(LIB, 'sync.js'));
const { createAccount } = require(path.join(LIB, 'account.js'));
let pass = 0, fail = 0;
const check = (label, ok, detail) => { if (ok) { pass += 1; console.log('  ✓ ' + label); } else { fail += 1; console.log('  ✗ ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); } };
const KEY = 'swrpg_saved_characters', T0 = 1793000000000, T1 = T0 + 3600000, T2 = T0 + 9 * 86400000;
const rec = (s, patch) => { const r = { id: 'z', name: 'Zed', updatedAt: s, sheetData: Object.assign({ name: 'Zed', notes: '', backstory: 'orig', xp: { total: 150 } }, patch || {}) }; return r; };
const L = (r) => ({ [KEY]: [r] }), B = (r) => ({ [KEY]: { z: r } });

// K1, by the source: the branch by its shape
const acc = read('account.js');
const branch = (acc.match(/else if \(!s\.user && syncStarted\) \{([\s\S]*?)\n {6}\}/) || [])[1];
check('K1 the sign-out branch is found', !!branch);
check('K1 it still stops the watcher', /sync\.unwatch\(\)/.test(branch || ''));
check('K1 it no longer clears the base', !/clearBase\(/.test(branch || ''), branch);

// K2, through the real seam: sign-in, sign-out, with the real subscriber
(async () => {
  const calls = [];
  global.window = { SWRPGSync: { adopt: (o) => { calls.push(['adopt', o.uid]); return Promise.resolve(); }, watch: () => calls.push(['watch']), unwatch: () => calls.push(['unwatch']), clearBase: () => calls.push(['clearBase']) } };
  let me = { ok: true, user: { id: 'u1' }, providers: [] };
  const del = [];
  const a = createAccount({ fetch: (u, o) => { if (o && o.method === 'POST') me = { ok: true, user: null, providers: [] }; if (o && o.method === 'DELETE') { del.push(1); me = { ok: true, user: null, providers: [] }; return Promise.resolve({ ok: a.delOk, json: () => Promise.resolve({}) }); } return Promise.resolve({ ok: true, json: () => Promise.resolve(me) }); }, location: {}, clearSyncBase: () => calls.push(['deviceClear']) });
  await a.refresh(); await new Promise((r) => setTimeout(r, 0));
  await a.logout();
  check('K2 a sign-out through the seam stops the watcher', calls.some((c) => c[0] === 'unwatch'), calls);
  check('K2 a sign-out through the seam never clears the base', !calls.some((c) => c[0] === 'clearBase' || c[0] === 'deviceClear'), calls);

  // K4: deletion
  calls.length = 0; me = { ok: true, user: { id: 'u1' }, providers: [] }; await a.refresh();
  a.delOk = false; let r = await a.deleteAccount();
  check('K4 a refused deletion keeps the base', r.ok === false && !calls.some((c) => c[0] === 'deviceClear'), calls);
  a.delOk = true; me = { ok: true, user: { id: 'u1' }, providers: [] }; await a.refresh(); r = await a.deleteAccount();
  check('K4 a deletion clears the base through the edge', r.ok === true && calls.some((c) => c[0] === 'deviceClear'), calls);
  const copyName = (acc.match(/clearSyncBase: function \(\) \{[^}]*removeItem\('([^']+)'\)/) || [])[1];
  const realName = (read('sync.js').match(/var BASE_KEY = '([^']+)'/) || [])[1];
  check('K4 account.js\'s key copy equals sync.js\'s BASE_KEY', !!realName && copyName === realName, [copyName, realName]);
  delete global.window;

  // K3: the merge a kept base gets
  const base = rec(T0);
  let m = MERGE.mergeAdoption(L(rec(T1, { notes: 'L' })), L(rec(T2, { notes: 'R' })), B(base));
  check('K3 both edited, one unit, account newer: asks, here\'s words provisional', m.conflicts.length === 1 && m.merged[KEY].characters[0].sheetData.notes === 'L');
  m = MERGE.mergeAdoption(L(rec(T2, { notes: 'L' })), L(rec(T1, { notes: 'R' })), B(base));
  check('K3 both edited, one unit, here newer: asks', m.conflicts.length === 1);
  m = MERGE.mergeAdoption(L(rec(T1, { notes: 'L' })), L(rec(T2, { backstory: 'R' })), B(base));
  const k = m.merged[KEY].characters[0];
  check('K3 different units: quiet, both kept', m.conflicts.length === 0 && k.sheetData.notes === 'L' && k.sheetData.backstory === 'R', k.sheetData);
  m = MERGE.mergeAdoption(L(rec(T0)), L(rec(T2, { notes: 'R' })), B(base));
  check('K3 a stale copy, nobody edited here: quiet, the account\'s', m.conflicts.length === 0 && m.merged[KEY].characters[0].sheetData.notes === 'R');
  const stale = rec(T0 - 400 * 86400000);
  m = MERGE.mergeAdoption(L(rec(T1, { notes: 'L' })), L(rec(T2, { notes: 'R' })), B(stale));
  check('K3 a long-stale base, both moved: asks, never overwrites', m.conflicts.length === 1 && m.merged[KEY].characters[0].sheetData.notes === 'L');
  m = MERGE.mergeAdoption({ [KEY]: { version: 3, characters: [] } }, L(rec(T2, { notes: 'R' })), B(base));
  check('K3 an emptied list with no tombstone takes the account\'s', m.merged[KEY].characters[0].sheetData.notes === 'R' && m.conflicts.length === 0);
  m = MERGE.mergeAdoption(Object.assign({ swrpg_deleted_ids: ['z'] }, { [KEY]: { version: 3, characters: [] } }), L(rec(T2, { notes: 'R' })), B(base));
  check('K3 a tombstone keeps it deleted', m.merged[KEY].characters.length === 0);

  // S1: the question's stamps
  m = MERGE.mergeAdoption(L(rec(T2, { notes: 'L' })), L(rec(T1, { notes: 'R' })), B(base));
  const q = m.conflicts[0] || {};
  check('S1 a base question carries each side\'s own stamp', q.stamps && q.stamps.local === T2 && q.stamps.remote === T1, q.stamps);
  check('S1 the candidates keep the later stamp (the merge is unchanged)', q.local && q.remote && q.local.updatedAt === T2 && q.remote.updatedAt === T2);
  check('S1 `stamps` reaches no record the merge would store', !/"stamps"/.test(JSON.stringify(m.merged)) && !/"stamps"/.test(JSON.stringify(q.local)) && !/"stamps"/.test(JSON.stringify(q.remote)));
  const nb = MERGE.mergeAdoption(L(rec(T1, { notes: 'L' })), L(rec(T1, { notes: 'R' })));
  check('S1 a no-base tie has no `stamps`', nb.conflicts.length === 1 && nb.conflicts[0].stamps === undefined);

  // S2: the prompt's own two lines, by their text
  const ui = read('ui.jsx');
  check('S2 the prompt reads this side\'s own stamp', ui.includes('here: whenPhrase(c.stamps ? { updatedAt: c.stamps.local } : c.local)'));
  check('S2 the prompt reads the account\'s own stamp', ui.includes('there: whenPhrase(c.stamps ? { updatedAt: c.stamps.remote } : c.remote)'));
  void SY;
  console.log('\nb1708_base_kept: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail || !pass ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack)); process.exit(1); });
