#!/usr/bin/env node
/**
 * ms_store_v2.cjs — the homebrew store at version 2, on its memory adapter (F-100 MS build; card
 * f100-ms-build R-MSB-6 (e)(f)(h)(i); contract f100-sync-instance-index R-SII-1..12,
 * f100-homebrew-sync-contract R-HSC-11..13). The IndexedDB upgrade itself (copy, forced failure,
 * v1 meeting v2) is a REAL-browser leg: scripts/f100_ms_idb_probe.py.
 *
 *   S1  identity: list() rows carry ck / stamp / packId / name / home; home is own:<instance> of my_data;
 *       a bare packId still names a collection (legacy callers: my_data → home)
 *   S2  two My Datas, both live: another device's My Data arriving on a non-empty home is HELD beside it;
 *       a character stamped with either holds nothing missing; conflicts() names a shared id with two labels
 *   S3  the collapse (R-SII-7): an empty, unreferenced home yields to the arrival; a referenced or non-empty
 *       home is kept and both are held
 *   S4  the mint tag (R-SII-8): a new id ends _<inst6>; packValidate accepts it; an old id is untouched
 *   S5  home is unremovable; another my_data row is removable (R-SII-4)
 *   S6  rawForStamp resolves own:<instance> only when the packId matches (R-SII-5)
 *   S7  layerLabel / orderLayers by ck: two same-packId layers stay two labels (R-SII-6)
 *   S8  a version receipt (R-HSC-11): a mismatch stores nothing; a match writes `versions` only
 *   S9  a tombstone receipt (R-HSC-13): an unused copy is deleted; a used one is kept
 *   S10 a FULL own file restores as own, packId + instance verbatim, its version written; again → already-here;
 *       a SHARE still imports (R-HSC-12)
 *   S11 the synced meta maps instances to own:<instance>; imported positions stay local (R-SII-3)
 *   S12 two tabs (B-888 C2/C3): a receipt in A reaches B; a receipt racing B's edit loses neither
 *   S13 the sync base (card ADDENDUM 1 R-MSB-9): synced {ver, h} on own rows and local meta, written only by
 *       a receipt / markSynced, h = syncHash over the whole envelope (a rename moves it); a local edit never moves it
 *   S14 the "removed here, not yet sent" mark (card ADDENDUM 4 R-MSB-23, FLAG-10): meta key 'removed' =
 *       {v:1, rows:{<instance>:{ver,h}}}, the row's synced base at removal; written by removePack only, and only for a
 *       synced, non-local row; carried through commit()'s snap (a later write and another tab keep it); cleared per
 *       instance through clearRemoved(); never in meta's 'state' row nor the wire meta; no DB version change
 *
 * Run: node test/ms_store_v2.cjs · exit 0 all pass, 1 any fail / crash / zero harvest.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const BR = require(path.join(ROOT, 'lib/shared/baseRef.js'));

let rows = 0, fails = 0;
function check(label, cond, detail) {
  rows += 1;
  if (cond) console.log('  ✓ ' + label);
  else { fails += 1; console.log('  ✗ ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 300))); }
}
async function block(name, fn) { try { await fn(); } catch (e) { check(name + ' ran without a crash', false, String(e && e.message)); } }

const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const ids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const VOCAB = { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 11, 0, 0, tick++)).toISOString();
let seq = 0;
// a deterministic 12-HEX instance per device (the prefix hex-encoded): a fixture instance must pass INSTANCE_RE, or the
// store cannot key the row it mints (the first cut of this fixture minted 'k1…' and every such row fell out of the API)
const insts = (pfx) => () => { const h = Buffer.from(String(pfx)).toString('hex').slice(0, 6); return (h + String(++seq).padStart(12 - h.length, '0')).slice(0, 12); };
const mk = (adapter, inst, extra) => U.createStore(Object.assign({ adapter: adapter || U.memoryAdapter(), schemas: SCHEMAS, vocab: VOCAB, base: BASE, now, mintInstance: insts(inst || 'a') }, extra || {}));
const weapon = (id, name) => ({ id, name, skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] });
const homeRow = (s) => s.list().find((c) => c.home);
const clone = (v) => JSON.parse(JSON.stringify(v));
// another device's own collection, as the lane hands it in (the decoded row)
function foreignPack(packId, inst, name, recs) {
  const t = '2026-10-03T00:00:00.000Z';
  const p = { formatVersion: 1, packId, instance: inst, name, _provenance: 'custom', createdAt: t, updatedAt: t, sections: {} };
  if (recs) p.sections.weapons = recs;
  return p;
}
const tickle = () => new Promise((res) => setTimeout(res, 30));

(async () => {
  console.log('ms_store_v2 — f100-sync-instance-index R-SII-1..12 · R-HSC-11..13 (memory adapter)');

  await block('S1', async () => {
    const s = mk(null, 'a1'); await s.ready();
    const h = homeRow(s);
    check('S1 list() rows carry ck, stamp, packId, name, home', !!h && ['ck', 'stamp', 'packId', 'name', 'home'].every((k) => k in h), h);
    check('S1 home is own:<instance> of my_data', !!h && h.packId === 'my_data' && /^own:[0-9a-f]{12}$/.test(h.ck) && h.stamp === 'user:my_data#' + h.ck.slice(4), h);
    check('S1 home() names the home ck', typeof s.home === 'function' && s.home() === (h && h.ck));
    const r = await s.saveRecord(h.ck, 'weapons', weapon('custom_my_data_a', 'A'));
    check('S1 saveRecord takes a ck', r.ok && r.ck === h.ck, r);
    const r2 = await s.saveRecord('my_data', 'weapons', weapon('custom_my_data_b', 'B'));
    check('S1 a bare packId still names a collection (legacy: my_data → home)', r2.ok && r2.ck === h.ck, r2);
    const c = await s.createPack({ packId: 'house_rules', name: 'House Rules' });
    check('S1 createPack returns the new ck', c.ok && /^own:[0-9a-f]{12}$/.test(c.ck), c);
    check('S1 get(ck) returns that row', !!s.get(c.ck) && s.get(c.ck).packId === 'house_rules');
  });

  await block('S2', async () => {
    const s = mk(null, 'b1'); await s.ready();
    const home = s.home();
    await s.saveRecord(home, 'weapons', weapon('custom_my_data_shared', 'Mine'));
    const other = foreignPack('my_data', 'ffff00000001', 'My Data', { custom_my_data_shared: weapon('custom_my_data_shared', 'Theirs') });
    const r = await s.receiveOwn(other, { used: [] });
    check('S2 receiveOwn on a non-empty home → both held', r && r.ok && s.list().filter((c) => c.packId === 'my_data').length === 2, r);
    check('S2 home unchanged', s.home() === home);
    const oc = 'own:ffff00000001';
    check('S2 the arrival is listed as an ordinary own row (not home)', !!s.list().find((c) => c.ck === oc && !c.home && c.origin === 'own'));
    const mine = 'user:my_data#' + home.slice(4), theirs = 'user:my_data#ffff00000001';
    check('S2 a character stamped with either holds nothing missing', s.missingFor([mine, theirs]).length === 0, s.missingFor([mine, theirs]));
    await s.setActive(oc, true);
    M.useUserPacks(s);           // the store is the user-pack provider, as window.SWRPGUserData is in the browser
    const ties = s.conflicts().filter((t) => t.id === 'custom_my_data_shared');
    check('S2 conflicts() names the shared id with two distinct stamp labels', ties.length === 1 && ties[0].layers.length === 2 && ties[0].layers[0] !== ties[0].layers[1], ties);
  });

  await block('S3', async () => {
    const a = mk(null, 'c1'); await a.ready();
    const emptyHome = a.home();
    const arr = foreignPack('my_data', 'ffff00000002', 'My Data', { custom_my_data_z: weapon('custom_my_data_z', 'Z') });
    let r = await a.receiveOwn(arr, { used: [] });
    check('S3 empty + unreferenced home → collapses to ONE my_data', r.ok && a.list().filter((c) => c.packId === 'my_data').length === 1, a.list());
    check('S3 the arrival is home now', a.home() === 'own:ffff00000002');
    check('S3 the empty one is gone', !a.get(emptyHome));
    const b = mk(null, 'c2'); await b.ready();
    const bh = b.home();
    r = await b.receiveOwn(foreignPack('my_data', 'ffff00000003', 'My Data', {}), { used: ['user:my_data#' + bh.slice(4)] });
    check('S3 empty but REFERENCED home → both held, home unchanged', b.list().filter((c) => c.packId === 'my_data').length === 2 && b.home() === bh, b.list());
    const c = mk(null, 'c3'); await c.ready();
    const ch = c.home();
    await c.saveRecord(ch, 'weapons', weapon('custom_my_data_q', 'Q'));
    await c.receiveOwn(foreignPack('my_data', 'ffff00000004', 'My Data', {}), { used: [] });
    check('S3 non-empty home → both held, home unchanged', c.list().filter((x) => x.packId === 'my_data').length === 2 && c.home() === ch);
  });

  await block('S4', async () => {
    const s = mk(null, 'd1'); await s.ready();
    const c = await s.createPack({ packId: 'house_rules', name: 'House Rules' });
    const r = await s.saveRecord(c.ck, 'weapons', { name: 'Ion Slugger', skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] }, { create: true, mint: true });
    const inst6 = c.ck.slice(4, 10);
    check('S4 a minted id ends _<inst6>', r.ok && r.id === 'custom_house_rules_ion_slugger_' + inst6, r);
    check('S4 mintId(ck, …) mints the same shape', s.mintId(c.ck, 'weapons', 'Ion Slugger 2') === 'custom_house_rules_ion_slugger_2_' + inst6, s.mintId(c.ck, 'weapons', 'Ion Slugger 2'));
    const old = await s.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_legacy', 'Legacy'));
    check('S4 an old untagged id still saves unchanged', old.ok && old.id === 'custom_house_rules_legacy', old);
    const r2 = await s.saveRecord(c.ck, 'weapons', { name: 'Ion Slugger', skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] }, { create: true, mint: true });
    check('S4 the _2 stepping still checks held rows', r2.ok && r2.id === 'custom_house_rules_ion_slugger_' + inst6 + '_2', r2);
  });

  await block('S5', async () => {
    const s = mk(null, 'e1'); await s.ready();
    await s.saveRecord(s.home(), 'weapons', weapon('custom_my_data_k', 'K'));
    await s.receiveOwn(foreignPack('my_data', 'ffff00000005', 'My Data', {}), { used: [] });
    const r = await s.removePack(s.home());
    check('S5 removePack(home) refused', !r.ok && /permanent/.test(r.reasons.join(' ')), r);
    const r2 = await s.removePack('own:ffff00000005');
    check('S5 another my_data row is removable', r2.ok && !s.get('own:ffff00000005'), r2);
  });

  await block('S6', async () => {
    const s = mk(null, 'f1'); await s.ready();
    await s.receiveOwn(foreignPack('house_rules', 'ffff00000006', 'House Rules', { custom_house_rules_w: weapon('custom_house_rules_w', 'W') }), { used: [] });
    check('S6 user:house_rules#<inst> resolves', s.missingFor(['user:house_rules#ffff00000006']).length === 0);
    check('S6 the same instance under another packId does not', s.missingFor(['user:other_pack#ffff00000006']).length === 1);
  });

  await block('S7', async () => {
    const a = { packId: 'my_data', origin: 'own', ck: 'own:aaaaaaaaaaaa', pack: { packId: 'my_data', instance: 'aaaaaaaaaaaa', sections: {} } };
    const b = { packId: 'my_data', origin: 'own', ck: 'own:bbbbbbbbbbbb', pack: { packId: 'my_data', instance: 'bbbbbbbbbbbb', sections: {} } };
    const la = M.layerLabel(a.pack, 0), lb = M.layerLabel(b.pack, 1);
    check('S7 layerLabel: two same-packId own layers → two labels (their stamps)', la !== lb && la === 'user:my_data#aaaaaaaaaaaa', [la, lb]);
    const o = M.orderLayers([a, b], ['own:bbbbbbbbbbbb', 'own:aaaaaaaaaaaa']);
    check('S7 orderLayers positions by ck', o[0] === b && o[1] === a, o.map((x) => x.ck));
  });

  await block('S8', async () => {
    const s = mk(null, 'g1'); await s.ready();
    const vp = foreignPack('friends_pack', undefined, 'Friend\'s Pack', { custom_friends_pack_w: weapon('custom_friends_pack_w', 'FW') });
    delete vp.instance; vp.projection = 'share';
    const v = BR.packVersion(vp);
    const bad = await s.receiveVersion('friends_pack', '000000000000', vp);
    check('S8 a version whose packVersion differs → version-mismatch, nothing stored', !bad.ok && /version-mismatch/.test(bad.reasons.join(' ')) && s.versions('friends_pack').length === 0, bad);
    const good = await s.receiveVersion('friends_pack', v, vp);
    check('S8 a matching version is stored', good.ok && s.versions('friends_pack').indexOf(v) !== -1, good);
    check('S8 … in `versions` only: no list row', !s.list().some((c) => c.packId === 'friends_pack'));
    await s.loadStamp('user:friends_pack@' + v);
    check('S8 … and its @v12 stamp resolves', s.missingFor(['user:friends_pack@' + v]).length === 0);
  });

  await block('S9', async () => {
    const s = mk(null, 'h1'); await s.ready();
    await s.receiveOwn(foreignPack('old_campaign', 'ffff00000009', 'Old Campaign', {}), { used: [] });
    await s.receiveOwn(foreignPack('house_rules', 'ffff0000000a', 'House Rules', {}), { used: [] });
    let r = await s.receiveTombstone('ffff00000009', { used: [] });
    check('S9 an unused copy is deleted', r.ok && !s.get('own:ffff00000009'), r);
    r = await s.receiveTombstone('ffff0000000a', { used: ['user:house_rules#ffff0000000a'] });
    check('S9 a used copy is kept (device-local)', r.ok && r.kept === true && !!s.get('own:ffff0000000a'), r);
  });

  await block('S10', async () => {
    const s = mk(null, 'i1'); await s.ready();
    const c = await s.createPack({ packId: 'house_rules', name: 'House Rules' });
    await s.saveRecord(c.ck, 'weapons', weapon('custom_house_rules_r', 'R'));
    const full = (await s.exportFull(c.ck)).text;
    await s.removePack(c.ck);
    const r = await s.importPack(full);
    check('S10 a FULL own file restores as own', r.ok && r.restored === true && r.ck === c.ck && s.get(c.ck) && s.get(c.ck).origin === 'own', r);
    const pk = JSON.parse(full);
    check('S10 packId and instance verbatim', s.get(c.ck).pack.instance === pk.instance && s.get(c.ck).packId === pk.packId);
    check('S10 its version is written', s.versions('house_rules').indexOf(BR.packVersion(pk)) !== -1, s.versions('house_rules'));
    const again = await s.importPack(full);
    check('S10 again → already-here, nothing written', !again.ok && /already-here/.test(again.reasons.join(' ')), again);
    const sh = await s.exportShare(c.ck);
    const other = mk(null, 'i2'); await other.ready();
    const ri = await other.importPack(sh.text);
    check('S10 a SHARE still imports (imported, frozen)', ri.ok && !ri.restored && other.list().some((x) => x.origin === 'imported' && x.ck === 'imp:' + ri.packId), ri);
  });

  await block('S11', async () => {
    const s = mk(null, 'j1'); await s.ready();
    await s.receiveOwn(foreignPack('house_rules', 'ffff0000000b', 'House Rules', {}), { used: [] });
    const home = s.home();
    const r = await s.receiveMeta({ v: 1, active: { ffff0000000b: false }, order: ['ffff0000000b', home.slice(4)] });
    check('S11 receiveMeta maps instances to own:<instance>', r.ok && s.list().find((c) => c.ck === 'own:ffff0000000b').active === false, s.list());
    const snap = s.syncSnapshot();
    check('S11 syncSnapshot().meta speaks instances, own only', snap.meta.v === 1 && snap.meta.order.every((x) => /^[0-9a-f]{12}$/.test(x)) && 'ffff0000000b' in snap.meta.active, snap.meta);
    check('S11 syncSnapshot().own lists every own row with its entries', snap.own.length === 2 && snap.own.every((o) => typeof o.entries === 'number' && o.instance && o.pack), snap.own.map((o) => o.ck));
  });

  await block('S12', async () => {
    const ad = U.memoryAdapter();
    const listeners = { A: [], B: [] };
    const chan = (me, peer) => ({ addEventListener: (t, f) => listeners[me].push(f), postMessage: (m) => listeners[peer].forEach((f) => setTimeout(() => f({ data: m }), 0)) });
    const A = mk(ad, 'k1', { channel: chan('A', 'B') }), B = mk(ad, 'k2', { channel: chan('B', 'A') });
    await A.ready(); await B.ready();
    const hr = await B.createPack({ packId: 'house_rules', name: 'House Rules' });
    await tickle();
    await A.receiveOwn(foreignPack('old_campaign', 'ffff0000000c', 'Old Campaign', { custom_old_campaign_w: weapon('custom_old_campaign_w', 'OW') }), { used: [] });
    await tickle();
    check('S12 C2: a receipt in tab A reaches tab B', !!B.get('own:ffff0000000c'));
    const race = Promise.all([
      B.saveRecord(hr.ck, 'weapons', weapon('custom_house_rules_x', 'X')),
      A.receiveOwn(foreignPack('another', 'ffff0000000d', 'Another', {}), { used: [] }),
    ]);
    await race; await tickle();
    const rows = Object.keys(ad._data.collections || {});
    check('S12 C3: a receipt racing an edit in the other tab loses neither', rows.indexOf('own:ffff0000000d') !== -1
      && !!(ad._data.collections[hr.ck] && ad._data.collections[hr.ck].pack.sections.weapons && ad._data.collections[hr.ck].pack.sections.weapons.custom_house_rules_x), rows);
  });

  await block('S13', async () => {
    const s = mk(null, 'l1'); await s.ready();
    const fp = foreignPack('house_rules', 'ffff0000000e', 'House Rules', { custom_house_rules_b: weapon('custom_house_rules_b', 'B') });
    await s.receiveOwn(fp, { used: [], ver: 3 });
    const ck = 'own:ffff0000000e';
    check('S13 a receipt writes synced {ver, h}', !!s.get(ck).synced && s.get(ck).synced.ver === 3 && s.get(ck).synced.h === U.syncHash(fp), s.get(ck).synced);
    check('S13 syncHash is 12 hex over the whole envelope', /^[0-9a-f]{12}$/.test(U.syncHash(fp)) && U.syncHash(fp) !== U.syncHash(Object.assign({}, fp, { name: 'Renamed' })));
    await s.saveRecord(ck, 'weapons', weapon('custom_house_rules_c', 'C'));
    check('S13 a local edit leaves the base where it was', s.get(ck).synced.ver === 3 && s.get(ck).synced.h === U.syncHash(fp));
    check('S13 … so local now differs from its base', U.syncHash(s.get(ck).pack) !== s.get(ck).synced.h);
    const m = await s.markSynced(ck, { ver: 4, h: U.syncHash(s.get(ck).pack) });
    check('S13 markSynced(ck, {ver, h}) writes the base', m.ok && s.get(ck).synced.ver === 4, m);
    await s.receiveMeta({ v: 1, active: {}, order: [] }, { ver: 2 });
    const snap = s.syncSnapshot();
    check('S13 local meta carries synced {ver, h} after a meta receipt', !!snap.metaSynced && snap.metaSynced.ver === 2 && /^[0-9a-f]{12}$/.test(snap.metaSynced.h), snap.metaSynced);
    check('S13 syncSnapshot().own rows carry their base', snap.own.find((o) => o.ck === ck).synced.ver === 4);
  });

  await block('S14', async () => {
    const ad = U.memoryAdapter(), s = mk(ad, 'r1'); await s.ready();
    const fp = foreignPack('house_rules', 'ffff00000014', 'House Rules', { custom_house_rules_r: weapon('custom_house_rules_r', 'R') });
    await s.receiveOwn(fp, { used: [], ver: 5 });
    const ck = 'own:ffff00000014', base = clone(s.get(ck).synced);
    const r = await s.removePack(ck);
    const stored = ad._data.meta.removed;
    check('S14 removePack of a synced own row writes the mark {v:1, rows:{<instance>:{ver,h}}} = its base', r.ok && !!stored && stored.v === 1
      && !!stored.rows && JSON.stringify(stored.rows.ffff00000014) === JSON.stringify(base), stored);
    check('S14 the mark is in syncSnapshot().removed', JSON.stringify((s.syncSnapshot().removed || {}).ffff00000014) === JSON.stringify(base), s.syncSnapshot().removed);
    check('S14 never in meta\'s state row, nor the wire meta', !('removed' in (ad._data.meta.state || {})) && !('removed' in s.syncSnapshot().meta)
      && JSON.stringify(s.syncSnapshot().meta).indexOf('ffff00000014') === -1, [Object.keys(ad._data.meta.state || {}), s.syncSnapshot().meta]);
    await s.createPack({ packId: 'later', name: 'Later' });
    check('S14 carried through commit()\'s snap: a later write keeps it', !!(ad._data.meta.removed && ad._data.meta.removed.rows.ffff00000014));
    const t2 = mk(ad, 'r2'); await t2.ready();
    check('S14 another tab (a reload) reads it', !!(t2.syncSnapshot().removed || {}).ffff00000014, t2.syncSnapshot().removed);
    const nb = await s.createPack({ packId: 'never_sent', name: 'Never Sent' });
    await s.removePack(nb.ck);
    check('S14 a row with no synced base writes no mark', Object.keys(ad._data.meta.removed.rows).length === 1, ad._data.meta.removed.rows);
    const lp = foreignPack('kept', 'ffff00000015', 'Kept', { custom_kept_k: weapon('custom_kept_k', 'K') });
    await s.receiveOwn(lp, { used: [], ver: 2 });
    const stamp = s.syncSnapshot().own.find((o) => o.ck === 'own:ffff00000015');
    await s.receiveTombstone('ffff00000015', { used: [], keep: true });
    check('S14 (fixture) the kept row is device-local', s.get('own:ffff00000015').local === 'removed-elsewhere' && !!stamp);
    await s.removePack('own:ffff00000015');
    check('S14 a device-local row writes no mark (R-MSB-11)', !('ffff00000015' in ad._data.meta.removed.rows), ad._data.meta.removed.rows);
    const c1 = await s.clearRemoved('ffff00000014');
    check('S14 clearRemoved(instance) clears it, through commit', c1 && c1.ok && !('ffff00000014' in ad._data.meta.removed.rows), [c1, ad._data.meta.removed]);
    const c2 = await s.clearRemoved('ffff00000014');
    check('S14 clearing an absent mark writes nothing', c2 && c2.ok && c2.absent === true, c2);
    check('S14 no DB version change (DB_VERSION 2)', U.DB_VERSION === 2, U.DB_VERSION);
  });

  console.log('\nms_store_v2: ' + (rows - fails) + '/' + rows + ' passed');
  if (!rows || fails) process.exit(1);
})().catch((e) => { console.error('  ✗ CRASH ' + (e && e.stack || e)); process.exit(1); });
