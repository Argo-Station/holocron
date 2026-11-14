#!/usr/bin/env node
/**
 * f100_m10_b1172_sync_again.cjs — STANDING guard: B-1172, "Sync this again" (ruling `f100-m10-editor-card` R-M10E-7;
 * frame F7, D-141 K3 (a), D-140; the mechanism measured as K8c in Docs/briefs/f100-m10-b1172.md and
 * scripts/f100_b1172_probe.cjs, whose device harness this file reuses: two stores, two lanes, one real sync worker).
 *
 *   S1  NO NEW FIELD: device A's home, kept and marked `local: 'removed-elsewhere'` after device B removed it, is acted on
 *       (store.syncAgain). The row's saved key set afterwards is the key set before MINUS `local` and `synced` — nothing
 *       added — and its pack is byte-equal (JCS).
 *   S2  TWO DEVICES: after the act, A's next send REWRITES the account's tombstone with A's content, A is not marked again,
 *       and device B (which removed it) RECEIVES the collection back on its next load.
 *   S3  THE ACT REFUSES what it is not for: a row that is not kept (`not-kept`), an imported row (`pack-read-only`), a
 *       collection that is not held (`no-such-pack`) — each writes nothing.
 *   BITES (B1172_BITES=1), on a temp copy of lib/shared: the act clears the mark only (S2 must fail: the tombstone marks it
 *       again, K8a); the act adds a field (S1 must fail). Each child EXITS 1 with its leg among the FAILs.
 *
 * Run: node test/f100_m10_b1172_sync_again.cjs   ·   bites: B1172_BITES=1 node test/f100_m10_b1172_sync_again.cjs
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SHARED = process.env.B1172_SHARED || path.join(ROOT, 'lib/shared');

const MUTANTS = [
  { leg: 'S2', name: 'the act clears the mark only (keeps the sync base)', from: '          delete np.local; delete np.synced;\n', to: '          delete np.local;\n' },
  { leg: 'S1', name: 'the act writes a new field', from: '          delete np.local; delete np.synced;\n', to: '          delete np.local; delete np.synced; np.syncAgainAt = now();\n' },
];
if (process.env.B1172_BITES === '1') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f100-m10-b1172-'));
  let bad = 0;
  MUTANTS.forEach((m, i) => {
    const sub = path.join(dir, 'm' + (i + 1)); fs.cpSync(path.join(ROOT, 'lib/shared'), sub, { recursive: true });
    const f = path.join(sub, 'userData.js'), src = fs.readFileSync(f, 'utf8'), n = src.split(m.from).length - 1;
    if (n !== 1) { bad++; console.log(`  VOID  M${i + 1} ${m.name}: the text occurs ${n} times`); return; }
    fs.writeFileSync(f, src.replace(m.from, m.to));
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', env: Object.assign({}, process.env, { B1172_BITES: '', B1172_SHARED: sub }) });
    const fails = (r.stdout || '').split('\n').filter((l) => l.indexOf('  FAIL  ') === 0).map((l) => l.slice(8, 60));
    const bit = r.status === 1 && fails.some((x) => x.indexOf(m.leg) === 0);
    if (!bit) bad++;
    console.log(`  ${bit ? 'BIT ' : 'MISS'}  M${i + 1} ${m.name}: exit ${r.status}, FAILs ${fails.join(' · ')}`);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? `\nb1172 bites: ${bad} did not bite` : `\nb1172 bites: ALL ${MUTANTS.length} BIT`);
  process.exit(bad ? 1 : 0);
}

const { makeWorker } = require(path.join(ROOT, 'test/fixtures/ms_d1_harness.js'));
const U = require(path.join(SHARED, 'userData.js'));
const PV = require(path.join(SHARED, 'packValidate.js'));
const SY = require(path.join(SHARED, 'sync.js'));

let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + JSON.stringify(detail).slice(0, 300) : '')); } };
const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const ids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const VOCAB = { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 13, 0, 0, 0, tick++)).toISOString();
let seq = 0;
const insts = (pfx) => () => { const h = Buffer.from(String(pfx)).toString('hex').slice(0, 6); return (h + String(++seq).padStart(12 - h.length, '0')).slice(0, 12); };
const weapon = (id, name) => ({ id, name, skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] });
const PACK = (inst) => 'swrpg_user_pack:' + inst;
const COMPRESS = typeof SY.makeCompress === 'function' ? SY.makeCompress(globalThis) : null;
const settle = () => new Promise((r) => setTimeout(r, 20));
const jcs = (x) => Array.isArray(x) ? '[' + x.map(jcs).join(',') + ']'
  : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + jcs(x[k])).join(',') + '}' : JSON.stringify(x);

function device(w, name) {
  const ad = U.memoryAdapter(), mem = {}, log = [];
  const d = { name, ad, mem, log, store: null, sync: null };
  const fetchFor = async (url, o) => {
    o = o || {};
    const u = new URL('http://local' + url);
    const init = { method: o.method || 'GET', headers: Object.assign({ 'x-test-user': 'u1' }, o.headers || {}) };
    if (o.body) init.body = o.body;
    const res = await w.mod.handleSync(new Request(u, init), w.env, u);
    const key = decodeURIComponent(u.pathname.slice('/api/v1/sync/'.length));
    let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    log.push({ method: init.method, key: init.method === 'PUT' ? key : null, status: res.status, body });
    return res;
  };
  d.boot = () => {
    d.store = U.createStore({ adapter: ad, schemas: SCHEMAS, vocab: VOCAB, base: BASE, now, mintInstance: insts(name) });
    d.sync = SY.createSync({
      fetch: fetchFor, storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } },
      schedule: (fn) => { fn(); return 1; }, packs: () => d.store, compress: COMPRESS,
    });
    return d.store.ready();
  };
  d.reload = async () => { await d.boot(); await d.sync.adopt(); await settle(); };
  d.puts = (key) => log.filter((x) => x.method === 'PUT' && x.key === key);
  return d;
}

(async () => {
  console.log('F-100 M10 · B-1172, "Sync this again"');
  if (!COMPRESS) { check(false, 'setup: CompressionStream in this node (the lane sends nothing without it)'); process.exit(1); }
  const w = makeWorker();
  const A = device(w, 'k1'), B = device(w, 'k2');
  await A.boot(); await B.boot();
  const h = A.store.home();
  await A.store.saveRecord(h, 'weapons', weapon('custom_my_data_home3', 'Home 3'));
  await A.sync.adopt(); await settle(); await A.sync.packSend(); await settle();
  await B.store.saveRecord(B.store.home(), 'weapons', weapon('custom_my_data_bee3', 'B 3'));
  await B.reload();
  await B.store.removePack(h); await B.sync.packSend(); await settle();
  await A.reload();
  const before = JSON.parse(JSON.stringify(A.ad._data.collections[h] || {}));
  check(before.local === 'removed-elsewhere' && !!before.synced && !B.store.get(h), 'setup: A\'s home kept and marked after B removed it (the account holds the tombstone)', { local: before.local, synced: !!before.synced });

  // S1
  const r = await A.store.syncAgain(h);
  const after = JSON.parse(JSON.stringify(A.ad._data.collections[h] || {}));
  const want = Object.keys(before).filter((k) => k !== 'local' && k !== 'synced').sort(), got = Object.keys(after).sort();
  check(r && r.ok && JSON.stringify(got) === JSON.stringify(want) && jcs(after.pack) === jcs(before.pack),
    `S1 no new field: the row's keys after the act are the keys before minus local and synced (${got.join(', ')}); its pack byte-equal`, { r, before: Object.keys(before).sort(), after: got });

  // S2
  const n0 = A.puts(PACK(h.slice(4))).length;
  await A.reload(); await A.sync.packSend(); await settle();
  const last = A.puts(PACK(h.slice(4))).slice(-1)[0];
  const rewritten = A.puts(PACK(h.slice(4))).length > n0 && !!last && last.status < 300 && last.body && last.body.value !== '{"enc":"gone"}';
  await B.reload();
  const back = B.store.get(h);
  check(rewritten && !(A.store.get(h) || {}).local && !!back && !!(back.pack.sections.weapons || {}).custom_my_data_home3,
    'S2 two devices: A\'s send rewrites the account, A is not marked again, and B (which removed it) receives My Data back with its record',
    { rewritten, localAfter: (A.store.get(h) || {}).local || null, backOnB: !!back });

  // S3
  const again = await A.store.syncAgain(h);
  const C = device(w, 'k3'); await C.boot();
  const imp = await C.store.importPack({ formatVersion: 1, packId: 'zz_shared', name: 'Shared', sections: { weapons: { custom_zz_shared_w: Object.assign(weapon('custom_zz_shared_w', 'Shared W'), { _mode: 'add' }) } } });
  const impCk = imp && imp.ok ? imp.ck : null;
  const ro = impCk ? await C.store.syncAgain(impCk) : { ok: null };
  const none = await C.store.syncAgain('own:000000000000');
  const why = (x) => String((x && (x.reason || (x.reasons || [])[0])) || '');
  check(again.ok === false && /^not-kept/.test(why(again)) && ro.ok === false && /^pack-read-only/.test(why(ro)) && none.ok === false && /^no-such-pack/.test(why(none)),
    'S3 the act refuses a row that already syncs, an imported row and a collection not held', { again: why(again), ro: why(ro) || imp, none: why(none) });

  console.log(fail ? `\nf100_m10_b1172_sync_again: ${fail} FAILED` : `\nf100_m10_b1172_sync_again: ALL ${pass} PASS`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  crash: ' + (e && e.stack || e)); process.exit(1); });
