#!/usr/bin/env node
/**
 * ms_pack_lane.cjs — the homebrew pack lane, end to end in node: TWO DEVICES (two createSync clients, two memory-adapter
 * stores) over ONE server (the REAL worker/sync.js on SQLite built from migrations/, test/fixtures/ms_d1_harness.js).
 * F-100 MS build; card f100-ms-build R-MSB-4, R-MSB-6 (a)(d)(e)(f)(g), ADDENDUM 1 R-MSB-8/-9 (o); contract
 * f100-homebrew-sync-contract R-HSC-1..-15; f100-sync-instance-index R-SII-7. The real Pages emulator and real IndexedDB
 * are the gate's probes; this is the battery's instrument.
 *
 *   L1  receipt: a collection made on A arrives on B (silently, base set); its character's stamp resolves on B
 *   L2  (a) the floor: a refused pack push — 413 too_large, 413 over_cap, 503 sync_paused — leaves collections / meta /
 *       versions byte-identical, status().writable true, the collection editable and exportable; the cause is DATA
 *       (packState()); a 413 is never retried until the content changes; the roster still syncs while paused
 *   L3  R-MSB-4 the browser floor: no compression → the lane sends and receives nothing, every own collection is
 *       flagged 'no-compression', the roster syncs as today
 *   L4  R-MSB-8 the cap walk: in order, skip-and-continue at 1,000 entries; the skipped one is flagged 'cap', never sent
 *   L5  (d) R-HSC-11 a pinned version syncs create-only: B stores it in `versions` only; a 409 with equal content is
 *       success; an unequal one is refused 'version-mismatch' and nothing is stored, on either side
 *   L6  (e) R-HSC-13 tombstones: an unused copy is deleted; a used one (roster or DRAFT, C4) is kept device-local and
 *       never re-uploaded; FLAG-3 — HOME tombstoned elsewhere stays home, device-local, and stops syncing
 *   L7  (f) R-HSC-12 a FULL restore after a removal rewrites the row; another device receives it; again → already-here
 *   L8  (g) R-HSC-14 a pack 409 with different content → an `envelope` conflict, collection-named by data, local kept,
 *       the key held; answering 'local' pushes it and clears the hold
 *   L9  (o) R-MSB-9's seven rows, a RELOAD (a new store + a new client over the same adapter and storage) between steps
 *   L10 the meta row: active/order travel, instance-keyed (R-HSC-4 / R-SII-3)
 *
 * Exit 0 all pass · 1 any fail / crash / zero harvest.
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const { makeWorker } = require('./fixtures/ms_d1_harness.js');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const SY = require(path.join(ROOT, 'lib/shared/sync.js'));
const fs = require('fs');

let rows = 0, fails = 0;
function check(label, cond, detail) {
  rows += 1;
  if (cond) console.log('  ✓ ' + label);
  else { fails += 1; console.log('  ✗ ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 300))); }
}
async function block(name, fn) { try { await fn(); } catch (e) { check(name + ' ran without a crash', false, String(e && e.stack || e).slice(0, 400)); } }

const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const ids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const VOCAB = { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 11, 0, 0, 0, tick++)).toISOString();
let seq = 0;
// a deterministic 12-HEX instance per device (the prefix hex-encoded): a fixture instance must pass INSTANCE_RE, or the
// store cannot key the row it mints (the first cut of this fixture minted 'k1…' and every such row fell out of the API)
const insts = (pfx) => () => { const h = Buffer.from(String(pfx)).toString('hex').slice(0, 6); return (h + String(++seq).padStart(12 - h.length, '0')).slice(0, 12); };
const weapon = (id, name, extra) => Object.assign({ id, name, skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] }, extra || {});
const PACK = (inst) => 'swrpg_user_pack:' + inst;
const VER = (pid, v) => 'swrpg_user_pack_v:' + pid + '@' + v;
const COMPRESS = typeof SY.makeCompress === 'function' ? SY.makeCompress(globalThis) : null;
const settle = () => new Promise((r) => setTimeout(r, 20));
const roster = (mods) => JSON.stringify({ version: 1, characters: [{ id: 'c1', name: 'Kira', mods }] });

// ── a device: a store over a memory adapter, a client over the worker, a localStorage map. reload() = a new page load.
function device(w, name, opts) {
  opts = opts || {};
  const ad = opts.adapter || U.memoryAdapter();
  const mem = opts.mem || {};
  const log = opts.log || [];
  const d = { name, ad, mem, log, store: null, sync: null };
  const fetchFor = async (url, o) => {
    o = o || {};
    const u = new URL('http://local' + url);
    const init = { method: o.method || 'GET', headers: Object.assign({ 'x-test-user': opts.user || 'u1' }, o.headers || {}) };
    if (o.body) init.body = o.body;
    const res = await w.mod.handleSync(new Request(u, init), w.env, u);
    const key = decodeURIComponent(u.pathname.slice('/api/v1/sync/'.length));
    let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    log.push({ method: init.method, key: init.method === 'PUT' ? key : null, status: res.status, body });
    return res;
  };
  d.boot = () => {
    d.store = U.createStore({ adapter: ad, schemas: SCHEMAS, vocab: VOCAB, base: BASE, now, mintInstance: insts(opts.inst || name) });
    d.sync = SY.createSync({
      fetch: fetchFor, storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } },
      schedule: (fn) => { fn(); return 1; }, packs: () => d.store, compress: opts.floor ? null : COMPRESS,
    });
    return d.store.ready();
  };
  d.reload = async () => { await d.boot(); await d.sync.adopt(); await settle(); };
  d.puts = (key) => log.filter((x) => x.method === 'PUT' && x.key === key);
  d.snap = () => JSON.stringify({ c: ad._data.collections, m: ad._data.meta, v: ad._data.versions });
  return d;
}
// seed a row straight into a device's adapter (a fixture: a big or many-entry collection), then re-read it
async function seedRow(d, packId, inst, name, recs, extra) {
  const t = '2026-10-01T00:00:00.000Z';
  const pack = { formatVersion: 1, packId, instance: inst, name, _provenance: 'custom', createdAt: t, updatedAt: t, sections: { weapons: recs || {} } };
  const prev = d.ad._data.collections && d.ad._data.collections['own:' + inst];
  const row = Object.assign({ ck: 'own:' + inst, packId, origin: 'own', pack, addedAt: t, updatedAt: t }, prev && prev.synced ? { synced: prev.synced } : {}, extra || {});
  await d.ad.tx([{ store: 'collections', op: 'put', value: row }]);
  await d.store.reload();
  return row.ck;
}
function bigRecs(packId, n, bytes) {
  const out = {};
  for (let i = 0; i < n; i++) { const id = 'custom_' + packId + '_r' + i; out[id] = weapon(id, 'R' + i, { description: crypto.randomBytes(bytes).toString('base64') }); }
  return out;
}
function manyRecs(packId, n) { const out = {}; for (let i = 0; i < n; i++) { const id = 'custom_' + packId + '_m' + i; out[id] = weapon(id, 'M' + i); } return out; }
const st = (d) => (typeof d.sync.packState === 'function' ? d.sync.packState() : {});

(async () => {
  console.log('ms_pack_lane — two devices, one server, the pack lane (R-HSC-1..15, R-MSB-4/-6/-8/-9)');
  check('setup: sync.js exports makeCompress (CompressionStream gzip + base64)', !!COMPRESS && typeof COMPRESS.gzip === 'function');

  // ── L1 receipt ──
  await block('L1', async () => {
    const w = makeWorker();
    const A = device(w, 'a1'), B = device(w, 'b1');
    await A.boot(); await B.boot();
    const c = await A.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_ion', 'Ion'));
    A.mem.swrpg_saved_characters = roster(['user:house_rules#' + c.ck.slice(4)]);
    await A.sync.adopt(); await settle();
    const put = A.puts(PACK(c.ck.slice(4)));
    check('L1 A pushed the collection once, 200', put.length === 1 && put[0].status === 200, put.map((x) => x.status));
    check('L1 the PUT declared its entries (1)', put[0] && put[0].body && put[0].body.entries === 1, put[0] && put[0].body && put[0].body.entries);
    check('L1 the value is the gzip-b64 envelope', put[0] && /^\{"enc":"gzip-b64","v":"/.test(put[0].body.value));
    check('L1 A\'s row now carries its sync base (ver 1)', (A.store.get(c.ck).synced || {}).ver === 1, A.store.get(c.ck).synced);
    B.mem.swrpg_saved_characters = A.mem.swrpg_saved_characters;
    await B.sync.adopt(); await settle();
    const got = B.store.get(c.ck);
    check('L1 B received it (own, same instance, same records)', !!got && got.origin === 'own' && !!got.pack.sections.weapons.custom_house_rules_ion, got && got.ck);
    check('L1 … silently (no conflict) and with its base', B.sync.conflicts().length === 0 && (got.synced || {}).ver === 1, B.sync.conflicts());
    check('L1 B\'s character stamp resolves (nothing missing)', B.store.missingFor(['user:house_rules#' + c.ck.slice(4)]).length === 0);
    check('L1 B did not push it back (unchanged/unchanged)', B.puts(PACK(c.ck.slice(4))).length === 0);
    check('L1 no pack row wrote history (R-HSC-7)', w.sql("SELECT COUNT(*) AS n FROM user_data_history WHERE key GLOB 'swrpg_user_pack*'")[0].n === 0);
  });

  // ── L2 the floor fixture ──
  for (const cause of ['too_large', 'over_cap', 'sync_paused']) {
    await block('L2 ' + cause, async () => {
      const w = makeWorker();
      const A = device(w, 'f' + cause.slice(0, 2));
      await A.boot();
      const inst = 'f2' + crypto.randomBytes(5).toString('hex');
      const ck = await seedRow(A, 'big_pack', inst, 'Big Pack', manyRecs('big_pack', 1));
      await A.store.setActive(ck, true);
      await A.sync.adopt(); await settle();
      check('L2 ' + cause + ' setup: the small first version pushed 200', A.puts(PACK(inst)).length === 1 && A.puts(PACK(inst))[0].status === 200, A.puts(PACK(inst)).map((x) => x.status));
      let recs;
      if (cause === 'too_large') recs = bigRecs('big_pack', 240, 6000);
      else if (cause === 'over_cap') {
        for (const i of ['0000000000a1', '0000000000a2', '0000000000a3']) await w.handle('PUT', PACK(i), { value: 'z'.repeat(1450000), version: 0, entries: 1 });
        recs = bigRecs('big_pack', 110, 6000);
      } else { w.env.SYNC_BUDGET_STORAGE_BYTES = '4096'; w.env.SYNC_STOP_AT = '0.85'; recs = manyRecs('big_pack', 3); }
      await seedRow(A, 'big_pack', inst, 'Big Pack', recs);
      const before = A.snap();
      const n0 = A.puts(PACK(inst)).length;
      await A.sync.packSend(); await settle();
      const tried = A.puts(PACK(inst)).slice(n0);
      const want = cause === 'sync_paused' ? 503 : 413;
      check('L2 ' + cause + ' the push was refused ' + want, tried.length === 1 && tried[0].status === want, tried.map((x) => x.status));
      check('L2 ' + cause + ' collections / meta / versions are byte-identical', A.snap() === before);
      check('L2 ' + cause + ' status().writable stays true', A.store.status().writable === true);
      const s = st(A);
      if (cause === 'sync_paused') check('L2 the pause is data: packState().paused.cause = storage', !!s.paused && s.paused.cause === 'storage', s);
      else check('L2 ' + cause + ' the refusal cause is data: packState().refused[ck] = ' + cause, !!s.refused && s.refused[ck] === cause, s);
      const ex = await A.store.exportFull(ck);
      check('L2 ' + cause + ' the collection still exports', ex.ok && JSON.parse(ex.text).instance === inst);
      if (cause !== 'sync_paused') {
        await A.sync.packSend(); await settle();
        check('L2 ' + cause + ' a 413 is NOT retried while the content is unchanged', A.puts(PACK(inst)).length === n0 + 1, A.puts(PACK(inst)).length - n0);
      } else {
        A.mem.swrpg_saved_characters = roster([]);
        A.sync.sweep(); await settle();
        const rp = A.puts('swrpg_saved_characters');
        check('L2 the roster still syncs while homebrew is paused (200)', rp.length >= 1 && rp[rp.length - 1].status === 200, rp.map((x) => x.status));
      }
      const ed = await A.store.saveRecord(ck, 'weapons', weapon('custom_big_pack_after', 'After'));
      check('L2 ' + cause + ' the collection stays editable', ed.ok, ed);
    });
  }

  // ── L3 the browser floor (R-MSB-4) ──
  await block('L3', async () => {
    const w = makeWorker();
    const B = device(w, 'g1');
    await B.boot();
    const bc = await B.store.createPack({ packId: 'their_pack', name: 'Theirs' });
    await B.store.saveRecord(bc.ck, 'weapons', weapon('custom_their_pack_w', 'W'));
    await B.sync.adopt(); await settle();
    const A = device(w, 'h1', { floor: true });
    await A.boot();
    const c = await A.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_f', 'F'));
    A.mem.swrpg_saved_characters = roster([]);
    await A.sync.adopt(); await settle();
    check('L3 no homebrew PUT at all', A.log.filter((x) => x.method === 'PUT' && /^swrpg_user_pack/.test(x.key)).length === 0, A.log.filter((x) => x.method === 'PUT').map((x) => x.key));
    check('L3 nothing received (B\'s collection is not on A)', !A.store.get(bc.ck));
    const s = st(A);
    check('L3 packState().floor is true', s.floor === true, s);
    check('L3 every own collection is flagged no-compression', A.store.list().filter((x) => x.origin === 'own').every((x) => s.refused && s.refused[x.ck] === 'no-compression'), s.refused);
    const rp = A.puts('swrpg_saved_characters');
    check('L3 the roster syncs as today (200)', rp.length === 1 && rp[0].status === 200, rp.map((x) => x.status));
  });

  // ── L4 the cap walk (R-MSB-8) ──
  await block('L4', async () => {
    const w = makeWorker();
    const A = device(w, 'i1');
    await A.boot();
    const c1 = await seedRow(A, 'first_pack', 'e4000000000a', 'First', manyRecs('first_pack', 600));
    const c2 = await seedRow(A, 'second_pack', 'e4000000000b', 'Second', manyRecs('second_pack', 600));
    const c3 = await seedRow(A, 'third_pack', 'e4000000000c', 'Third', manyRecs('third_pack', 300));
    await A.store.setOrder([c1, c2, c3]);
    await A.sync.adopt(); await settle();
    check('L4 the first (600) is sent', A.puts(PACK('e4000000000a')).length === 1 && A.puts(PACK('e4000000000a'))[0].status === 200);
    check('L4 the second (600, past 1,000) is skipped — never sent', A.puts(PACK('e4000000000b')).length === 0);
    check('L4 … and flagged cap', (st(A).refused || {})[c2] === 'cap', st(A).refused);
    check('L4 the walk continues: the third (300, 900 in all) is sent', A.puts(PACK('e4000000000c')).length === 1 && A.puts(PACK('e4000000000c'))[0].status === 200);
  });

  // ── L5 pinned versions (R-HSC-11) ──
  await block('L5', async () => {
    const w = makeWorker();
    const X = device(w, 'j0'); await X.boot();
    const fc = await X.store.createPack({ packId: 'friends_pack', name: 'Friend' });
    await X.store.saveRecord(fc.ck, 'weapons', weapon('custom_friends_pack_w', 'FW'));
    const share = (await X.store.exportShare(fc.ck)).text;
    const A = device(w, 'j1'); await A.boot();
    const imp = await A.store.importPack(share);
    const v = imp.version, stamp = 'user:friends_pack@' + v;
    A.mem.swrpg_saved_characters = roster([stamp]);
    await A.sync.adopt(); await settle();
    const vp = A.puts(VER('friends_pack', v));
    check('L5 A pushed the pinned version create-only (version 0) → 200', vp.length === 1 && vp[0].body.version === 0 && vp[0].status === 200, vp.map((x) => [x.body && x.body.version, x.status]));
    check('L5 the imported collection\'s own row never syncs', A.log.every((x) => x.key !== PACK('friends_pack')) && !A.log.some((x) => x.method === 'PUT' && /friends_pack/.test(x.key || '') && x.key.indexOf('_v:') === -1));
    const B = device(w, 'j2'); await B.boot();
    B.mem.swrpg_saved_characters = A.mem.swrpg_saved_characters;
    await B.sync.adopt(); await settle();
    check('L5 B stores the version in `versions`', B.store.versions('friends_pack').indexOf(v) !== -1, B.store.versions('friends_pack'));
    check('L5 … only: no listed row on B', !B.store.list().some((x) => x.packId === 'friends_pack'));
    await B.store.loadStamp(stamp);
    check('L5 … and B\'s character stamp resolves', B.store.missingFor([stamp]).length === 0);
    const C = device(w, 'j3'); await C.boot();
    await C.store.importPack(share);
    C.mem.swrpg_saved_characters = roster([stamp]);
    // a SEND with no receipt first (the race where the row lands between this device's pull and its push): the 409 path
    await C.sync.packSend(); await settle();
    const cp = C.puts(VER('friends_pack', v));
    check('L5 a create that finds the row: 409 equal content = success (no refusal)', cp.length === 1 && cp[0].status === 409 && !((st(C).refused || {})[VER('friends_pack', v)]), [cp.map((x) => x.status), st(C).refused]);
    // unequal: the server row under friends_pack@<v2> holds content whose packVersion is NOT v2
    const Y = device(w, 'j4'); await Y.boot();
    await Y.store.saveRecord((await Y.store.createPack({ packId: 'friends_pack', name: 'F2' })).ck, 'weapons', weapon('custom_friends_pack_x', 'X2'));
    const share2 = (await Y.store.exportShare(Y.store.list().find((x) => x.packId === 'friends_pack').ck)).text;
    const D = device(w, 'j5', { user: 'u2' }); await D.boot();
    const imp2 = await D.store.importPack(share2);
    const v2 = imp2.version;
    const wrong = JSON.parse(share); // a different pack, filed under v2
    await w.handle('PUT', VER('friends_pack', v2), { value: JSON.stringify({ enc: 'gzip-b64', v: await COMPRESS.gzip(JSON.stringify(wrong)) }), version: 0, entries: 1 }, 'u2');
    D.mem.swrpg_saved_characters = roster(['user:friends_pack@' + v2]);
    const dv0 = JSON.stringify(D.ad._data.versions);
    await D.sync.adopt(); await settle();
    check('L5 a receipt of UNEQUAL content (held here) → refused version-mismatch', (st(D).refused || {})[VER('friends_pack', v2)] === 'version-mismatch', st(D).refused);
    check('L5 … and the sender stored nothing', JSON.stringify(D.ad._data.versions) === dv0);
    // the same unequal row met by a SEND with no receipt first (the race): the 409 branch compares too (R-HSC-11)
    const D2 = device(w, 'j7', { user: 'u2' }); await D2.boot();
    await D2.store.importPack(share2);
    D2.mem.swrpg_saved_characters = roster(['user:friends_pack@' + v2]);
    const d2v0 = JSON.stringify(D2.ad._data.versions);
    await D2.sync.packSend(); await settle();
    const dp = D2.puts(VER('friends_pack', v2));
    check('L5 a create that meets UNEQUAL content (409) → refused version-mismatch', dp.length === 1 && dp[0].status === 409 && (st(D2).refused || {})[VER('friends_pack', v2)] === 'version-mismatch', [dp.map((x) => x.status), st(D2).refused]);
    check('L5 … and that sender stored nothing', JSON.stringify(D2.ad._data.versions) === d2v0);
    const E = device(w, 'j6', { user: 'u2' }); await E.boot();
    await E.sync.adopt(); await settle();
    check('L5 a receiver checks the same equality: nothing stored', E.store.versions('friends_pack').indexOf(v2) === -1, E.store.versions('friends_pack'));
    check('L5 … and says so: the receiver\'s packState().refused names it version-mismatch (R-MSB-17)', (st(E).refused || {})[VER('friends_pack', v2)] === 'version-mismatch', st(E).refused);
  });

  // ── L6 tombstones (R-HSC-13) + FLAG-3 ──
  await block('L6', async () => {
    // the UNUSED case lives on its own account: devices of one account share their characters (the roster and the draft
    // sync), so a character on B2 makes the collection used on every device of that account — the first cut of this leg
    // measured exactly that and read it as a defect
    {
      const w0 = makeWorker();
      const A0 = device(w0, 'k0'), B0 = device(w0, 'k5');
      await A0.boot(); await B0.boot();
      const c0 = await A0.store.createPack({ packId: 'old_campaign', name: 'Old Campaign' });
      await A0.store.saveRecord(c0.ck, 'weapons', weapon('custom_old_campaign_w', 'OW'));
      await A0.sync.adopt(); await settle();
      await B0.sync.adopt(); await settle();
      await A0.store.removePack(c0.ck); await A0.sync.packSend(); await settle();
      await B0.reload();
      check('L6 an UNUSED copy is deleted', !B0.store.get(c0.ck));
    }
    const w = makeWorker();
    const A = device(w, 'k1'), B = device(w, 'k2'), B2 = device(w, 'k3'), B3 = device(w, 'k4');
    for (const d of [A, B, B2, B3]) await d.boot();
    const c = await A.store.createPack({ packId: 'old_campaign', name: 'Old Campaign' });
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_old_campaign_w', 'OW'));
    await A.sync.adopt(); await settle();
    const stamp = 'user:old_campaign#' + c.ck.slice(4);
    B2.mem.swrpg_saved_characters = roster([stamp]);
    B3.mem.swrpg_creation_draft = JSON.stringify({ step: 2, mods: [stamp] });
    for (const d of [B, B2, B3]) { await d.sync.adopt(); await settle(); }
    check('L6 setup: all three received it', [B, B2, B3].every((d) => !!d.store.get(c.ck)));
    await A.store.removePack(c.ck);
    await A.sync.packSend(); await settle();
    const tp = A.puts(PACK(c.ck.slice(4))).slice(-1)[0];
    check('L6 removal writes the tombstone value, 0 entries', !!tp && tp.status === 200 && tp.body.value === '{"enc":"gone"}' && tp.body.entries === 0, tp && tp.body);
    for (const d of [B, B2, B3]) await d.reload();
    const k2 = B2.store.get(c.ck), k3 = B3.store.get(c.ck);
    check('L6 a copy a CHARACTER uses is kept, device-local', !!k2 && k2.local === 'removed-elsewhere', k2 && k2.local);
    check('L6 a copy the creation DRAFT uses is kept too (C4)', !!k3 && k3.local === 'removed-elsewhere', k3 && k3.local);
    await B2.store.saveRecord(c.ck, 'weapons', weapon('custom_old_campaign_later', 'Later'));
    await B2.sync.packSend(); await settle();
    check('L6 a kept copy is never re-uploaded', B2.puts(PACK(c.ck.slice(4))).length === 0);
    // FLAG-3: A's HOME, held on B as an ordinary row, is removed there
    await A.store.saveRecord(A.store.home(), 'weapons', weapon('custom_my_data_home', 'Home W'));
    await A.sync.packSend(); await settle();
    await B.store.saveRecord(B.store.home(), 'weapons', weapon('custom_my_data_bee', 'B W'));
    await B.reload();
    const aHome = A.store.home();
    check('L6 FLAG-3 setup: A\'s home is held on B beside B\'s own', !!B.store.get(aHome) && B.store.home() !== aHome);
    const rm = await B.store.removePack(aHome);
    await B.sync.packSend(); await settle();
    check('L6 FLAG-3 setup: B removed it and wrote the tombstone', rm.ok && B.puts(PACK(aHome.slice(4))).slice(-1)[0].body.value === '{"enc":"gone"}');
    await A.reload();
    const hr = A.store.get(aHome);
    check('L6 FLAG-3 A keeps its home, still home', !!hr && A.store.home() === aHome);
    check('L6 FLAG-3 … device-local (the kept state)', hr && hr.local === 'removed-elsewhere', hr && hr.local);
    const n0 = A.puts(PACK(aHome.slice(4))).length;
    await A.store.saveRecord(aHome, 'weapons', weapon('custom_my_data_new_after', 'New'));
    await A.sync.packSend(); await settle();
    check('L6 FLAG-3 … and new homebrew saved there no longer syncs', A.puts(PACK(aHome.slice(4))).length === n0);
  });

  // ── L7 restore (R-HSC-12) ──
  await block('L7', async () => {
    const w = makeWorker();
    const A = device(w, 'l1'), B = device(w, 'l2');
    await A.boot(); await B.boot();
    const c = await A.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_r', 'R'));
    await A.sync.adopt(); await settle();
    const full = (await A.store.exportFull(c.ck)).text;
    await A.store.removePack(c.ck);
    await A.sync.packSend(); await settle();
    const r = await A.store.importPack(full);
    check('L7 the FULL file restores as own, same ck', r.ok && r.restored === true && r.ck === c.ck, r);
    await A.sync.packSend(); await settle();
    const last = A.puts(PACK(c.ck.slice(4))).slice(-1)[0];
    check('L7 the restore rewrites the tombstoned row (200, a real envelope)', !!last && last.status === 200 && /gzip-b64/.test(last.body.value), last && [last.status, last.body.value.slice(0, 30)]);
    await B.sync.adopt(); await settle();
    check('L7 another device receives the restored collection', !!B.store.get(c.ck) && !!B.store.get(c.ck).pack.sections.weapons.custom_house_rules_r);
    const again = await A.store.importPack(full);
    check('L7 again → already-here', !again.ok && /already-here/.test((again.reasons || []).join(' ')), again);
  });

  // ── L8 the pack 409 with different content (R-HSC-14) ──
  await block('L8', async () => {
    const w = makeWorker();
    const A = device(w, 'm1'), B = device(w, 'm2');
    await A.boot(); await B.boot();
    const c = await A.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await A.sync.adopt(); await settle();
    await B.sync.adopt(); await settle();
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_a', 'From A'));
    await A.sync.packSend(); await settle();
    await B.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_b', 'From B'));
    const beforeB = JSON.stringify(B.ad._data.collections[c.ck]);
    await B.sync.packSend(); await settle();
    const bp = B.puts(PACK(c.ck.slice(4)));
    check('L8 B\'s push met 409', bp.length === 1 && bp[0].status === 409, bp.map((x) => x.status));
    const cf = B.sync.conflicts().filter((x) => x.key === PACK(c.ck.slice(4)));
    check('L8 one envelope conflict, the collection named by data', cf.length === 1 && cf[0].kind === 'envelope' && cf[0].collection === true && cf[0].ck === c.ck && cf[0].name === 'House Rules', cf);
    check('L8 local kept provisionally (B\'s row byte-identical)', JSON.stringify(B.ad._data.collections[c.ck]) === beforeB);
    await B.sync.packSend(); await settle();
    check('L8 the key is held: no further PUT', B.puts(PACK(c.ck.slice(4))).length === 1);
    const res = await B.sync.resolve(cf[0], 'local'); await settle();
    const after = B.puts(PACK(c.ck.slice(4))).slice(-1)[0];
    check('L8 answering "this device" pushes it (200) and clears the hold', !!res && after.status === 200 && !B.sync.isHeld(PACK(c.ck.slice(4))), [res, after && after.status]);
    await A.reload();
    check('L8 the other device then receives the answer', !!A.store.get(c.ck).pack.sections.weapons.custom_house_rules_b && !A.store.get(c.ck).pack.sections.weapons.custom_house_rules_a);
  });

  // ── L9 R-MSB-9's table, a reload between steps ──
  await block('L9', async () => {
    const w = makeWorker();
    const A = device(w, 'n1'), B = device(w, 'n2');
    await A.boot(); await B.boot();
    const c = await A.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_0', 'Zero'));
    await A.sync.adopt(); await settle();
    await B.reload();
    const key = PACK(c.ck.slice(4));
    const recs = (d) => Object.keys(d.store.get(c.ck).pack.sections.weapons || {}).sort().join(',');
    // row 1
    let b0 = B.snap(), p0 = B.puts(key).length;
    await B.reload();
    check('L9 row 1 unchanged/unchanged → nothing (no PUT, no write)', B.puts(key).length === p0 && B.snap() === b0);
    // row 2
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_1', 'One')); await A.sync.packSend(); await settle();
    await B.reload();
    check('L9 row 2 unchanged/moved → received silently (the stale device catches up, no prompt)', recs(B) === 'custom_house_rules_0,custom_house_rules_1' && B.sync.conflicts().length === 0, [recs(B), B.sync.conflicts().length]);
    // row 3
    await B.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_2', 'Two'));
    p0 = B.puts(key).length;
    await B.reload();
    const r3 = B.puts(key).slice(p0);
    check('L9 row 3 moved/unchanged → pushed, conditional on the base version', r3.length === 1 && r3[0].status === 200 && r3[0].body.version === 2, r3.map((x) => [x.status, x.body.version]));
    await A.reload();
    check('L9 row 3 … and A then receives it', recs(A) === 'custom_house_rules_0,custom_house_rules_1,custom_house_rules_2', recs(A));
    // row 4 — both moved to the SAME content
    const same = JSON.parse(JSON.stringify(A.ad._data.collections[c.ck]));
    same.pack.sections.weapons.custom_house_rules_3 = weapon('custom_house_rules_3', 'Three'); same.pack.updatedAt = '2026-10-11T09:00:00.000Z';
    const bSame = Object.assign(JSON.parse(JSON.stringify(same)), { synced: B.ad._data.collections[c.ck].synced });
    await A.ad.tx([{ store: 'collections', op: 'put', value: same }]); await A.reload();
    await B.ad.tx([{ store: 'collections', op: 'put', value: bSame }]);
    p0 = B.puts(key).length;
    await B.reload();
    check('L9 row 4 moved/moved, same content → adopted silently, base set, no PUT', B.puts(key).length === p0 && B.sync.conflicts().length === 0
      && B.store.get(c.ck).synced.h === U.syncHash(B.store.get(c.ck).pack), [B.puts(key).length - p0, B.sync.conflicts().length]);
    // row 5 — both moved, different
    await A.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_4a', 'Four A')); await A.sync.packSend(); await settle();
    await B.store.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_4b', 'Four B'));
    const b5 = JSON.stringify(B.ad._data.collections[c.ck]);
    await B.reload();
    const cf = B.sync.conflicts().filter((x) => x.key === key);
    check('L9 row 5 moved/moved, different → an envelope conflict, local kept', cf.length === 1 && cf[0].kind === 'envelope' && JSON.stringify(B.ad._data.collections[c.ck]) === b5, [cf.length, recs(B)]);
    await B.sync.resolve(cf[0], 'remote'); await settle();
    check('L9 row 5 … answering "the account" takes the other side', recs(B).indexOf('custom_house_rules_4a') !== -1 && recs(B).indexOf('custom_house_rules_4b') === -1, recs(B));
    // row 6 — local moved, remote tombstoned
    const c6 = await A.store.createPack({ packId: 'side_pack', name: 'Side' });
    await A.store.saveRecord(c6.ck, 'weapons', weapon('custom_side_pack_s', 'S'));
    await A.sync.packSend(); await settle();
    await B.reload();
    await B.store.saveRecord(c6.ck, 'weapons', weapon('custom_side_pack_unsynced', 'Unsynced'));
    await A.store.removePack(c6.ck); await A.sync.packSend(); await settle();
    await B.reload();
    const k6 = B.store.get(c6.ck);
    check('L9 row 6 moved/tombstone → kept device-local; the unsynced edit is not deleted', !!k6 && k6.local === 'removed-elsewhere' && !!k6.pack.sections.weapons.custom_side_pack_unsynced, k6 && k6.local);
    // row 7 — no base
    const nb = JSON.parse(JSON.stringify(B.ad._data.collections[c.ck])); delete nb.synced;
    await B.ad.tx([{ store: 'collections', op: 'put', value: nb }]);
    p0 = B.puts(key).length;
    await B.reload();
    check('L9 row 7 no base, equal → the base is set, no PUT, no conflict', B.puts(key).length === p0 && (B.store.get(c.ck).synced || {}).ver > 0 && B.sync.conflicts().length === 0, B.store.get(c.ck).synced);
    const nb2 = JSON.parse(JSON.stringify(B.ad._data.collections[c.ck])); delete nb2.synced;
    nb2.pack.sections.weapons.custom_house_rules_nb = weapon('custom_house_rules_nb', 'NB');
    await B.ad.tx([{ store: 'collections', op: 'put', value: nb2 }]);
    await B.reload();
    check('L9 row 7 no base, different → an envelope conflict (local kept)', B.sync.conflicts().filter((x) => x.key === key).length === 1 && !!B.store.get(c.ck).pack.sections.weapons.custom_house_rules_nb);
  });

  // ── L10 the meta row ──
  await block('L10', async () => {
    const w = makeWorker();
    const A = device(w, 'o1'), B = device(w, 'o2');
    await A.boot(); await B.boot();
    const c = await A.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await A.sync.adopt(); await settle();
    await B.sync.adopt(); await settle();
    await A.store.setActive(c.ck, false);
    await A.sync.packSend(); await settle();
    const mp = A.puts('swrpg_user_pack_meta').slice(-1)[0];
    check('L10 the meta row is pushed, instance-keyed', !!mp && mp.status === 200 && JSON.parse(mp.body.value).active[c.ck.slice(4)] === false, mp && mp.body.value);
    await B.reload();
    check('L10 B takes the active state', B.store.list().find((x) => x.ck === c.ck).active === false);
  });

  console.log('\nms_pack_lane: ' + (rows - fails) + '/' + rows + ' passed');
  if (!rows || fails) process.exit(1);
})().catch((e) => { console.error('  ✗ CRASH ' + (e && e.stack || e)); process.exit(1); });
