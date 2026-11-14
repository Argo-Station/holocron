#!/usr/bin/env node
/**
 * user_data_store.cjs — STANDING guard for THE user-pack store, lib/shared/userData.js, driven through
 * its memory adapter (F-100 UD-1e; ruling f100-ud1-contracts R-FUD-4, H7, H8(a), H8(b) as amended, H9;
 * §6 acceptance 6). The IndexedDB adapter is the browser smoke's (scripts/smoke_user_packs.py): node
 * has no IndexedDB, and no test dependency is added (brief §4).
 *
 *   1. my_data is SEEDED on first open, once (a second open over the same data does not duplicate it).
 *   2. ONE COPY PER RECORD: ten saves of one id leave one record; the `_base` anchor is captured once;
 *      resolved-view markers are never persisted; a canonical id is a redefine, a new id an add, and an
 *      un-namespaced add is refused by name.
 *   3. VERSIONS are APPEND-ONLY: re-importing the same bytes adds nothing; a changed import adds one;
 *      an earlier version is never rewritten.
 *   4. H8(a): a SHARE of my_data mints a fresh packId IN THE FILE and remaps custom_my_data_* inside it;
 *      local data is untouched.
 *   5. H8(b) as amended: an import whose packId is an OWN pack's is refused `pack-id-taken`; one whose
 *      packId is an IMPORTED pack's is a NEW VERSION of it.
 *   6. H7: FULL export is never refused (unknown content included, the stored value verbatim); SHARE
 *      is refused on the same content, by name.
 *   7. WRITE-HELD on a newer store (the database version, or meta.v, ahead): reads work, every write is
 *      refused, and nothing reaches the adapter.
 *   8. The rest of the contract: imported packs read-only and ON by default (H9); active/order persist;
 *      removing a pack keeps its versions; memory status says it will not persist; a store with no
 *      records never loads the schemas.
 *
 * Run: node test/user_data_store.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const BR = require(path.join(ROOT, 'lib/shared/baseRef.js'));

let failures = 0, rows = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const pass = (m) => console.log('  PASS  ' + m);
const check = (ok, m) => { rows += 1; (ok ? pass(m) : fail(m)); };
const clone = (x) => JSON.parse(JSON.stringify(x));

const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const ids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const VOCAB = { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 8, 23, 0, 0, tick++)).toISOString();
const mk = (adapter, extra) => U.createStore(Object.assign({ adapter, schemas: SCHEMAS, vocab: VOCAB, base: BASE, now }, extra || {}));
const blaster = (dmg) => { const r = clone(BASE.weapons.blaster_pistol); r.damage = Object.assign({}, r.damage, { value: dmg }); return r; };
const gearAdd = (packId, slug, name) => ({ id: `custom_${packId}_${slug}`, name, type: 'Trinket', description: 'A thing.', price: 5, rarity: 1, restricted: false, encumbrance: 0, sources: [] });
const pack = (packId, sections, extra) => Object.assign({ formatVersion: 1, packId, name: packId, _provenance: 'custom', sections }, extra || {});
// v2 (f100-sync-instance-index R-SII-2/-3; re-pointed by ruling f100-ms-build-card R-MSB-13): what is stored is the
// `collections` store keyed by ck, and meta v2 keys active/order by ck with `home` naming this device's My Data.
// ckIn(A, p) — the stored row a packId names: my_data → meta.home; an own pack by its packId; an import `imp:<packId>`.
const ckIn = (A, p) => { if (p === 'my_data') return (A._data.meta.state || {}).home; const own = Object.keys(A._data.collections).find((k) => A._data.collections[k].origin === 'own' && A._data.collections[k].packId === p); return own || 'imp:' + p; };
const row = (A, p) => A._data.collections[ckIn(A, p)];

(async function main() {
  // ── 1. my_data seeded, once ──
  {
    const A = U.memoryAdapter();
    const s = mk(A);
    const st = await s.ready();
    const l = s.list();
    check(l.length === 1 && l[0].packId === 'my_data' && l[0].origin === 'own' && l[0].active === true && row(A, 'my_data') && A._data.meta.state && A._data.meta.state.v === 2,
      '1 my_data is SEEDED on first open (own, ON) and WRITTEN to the store with the meta state');
    const s2 = mk(A); await s2.ready();
    check(Object.keys(A._data.collections).length === 1 && s2.list().length === 1 && JSON.stringify(A._data.meta.state.order) === JSON.stringify([A._data.meta.state.home]),
      '1 a second open over the same data does not seed it twice');
    check(st.persistent === false && st.writable === true && st.reason === 'memory', '8 the memory adapter says it will not persist (status ' + JSON.stringify(st) + ')');
    check(st.rail === 'not-loaded', '8 a store holding no records never loads the schemas (zero cost for a user with no homebrew)');
  }

  // ── 2. one copy per record ──
  {
    const A = U.memoryAdapter(); const s = mk(A); await s.ready();
    let first = null;
    for (let d = 7; d < 17; d++) {
      const r = await s.saveRecord('my_data', 'weapons', Object.assign(blaster(d), { _pack: 'my_data', _unapplied: [] }));
      if (!r.ok) { fail('2 save ' + d + ' refused: ' + r.reasons.join(' | ')); break; }
      if (!first) first = clone(row(A, 'my_data').pack.sections.weapons.blaster_pistol._base);
    }
    const w = row(A, 'my_data').pack.sections.weapons;
    check(Object.keys(w).length === 1 && w.blaster_pistol.damage.value === 16, '2 ten saves of one id leave ONE record, the last (damage 16)');
    check(w.blaster_pistol._mode === 'redefine' && JSON.stringify(w.blaster_pistol._base) === JSON.stringify(first)
      && w.blaster_pistol._base.ref === BR.baseRef(BASE.weapons.blaster_pistol),
      '2 a canonical id is a REDEFINE; its `_base` is the pristine record\'s sha256:p1 ref, captured once and kept');
    check(!('_pack' in w.blaster_pistol) && !('_unapplied' in w.blaster_pistol), '2 resolved-view markers (_pack, _unapplied) are never persisted');
    const g = await s.saveRecord('my_data', 'gear', gearAdd('my_data', 'lucky_dice', 'Lucky Dice'));
    check(g.ok && row(A, 'my_data').pack.sections.gear.custom_my_data_lucky_dice._mode === 'add', '2 a new custom_my_data_ id is an ADD');
    const bad = await s.saveRecord('my_data', 'gear', gearAdd('elsewhere', 'x', 'X'));
    check(!bad.ok && bad.reasons.some((r) => /add-id-not-namespaced/.test(r)), '2 an add outside the pack\'s namespace is REFUSED by name: ' + (bad.reasons || []).join(' | '));
    const del = await s.deleteRecord('my_data', 'gear', 'custom_my_data_lucky_dice');
    check(del.ok && !row(A, 'my_data').pack.sections.gear.custom_my_data_lucky_dice, '2 deleteRecord removes the one copy');
  }

  // ── 3 + 5 + 8: versions, H8(b), H9, read-only, active/order, removePack ──
  {
    const A = U.memoryAdapter(); const s = mk(A); await s.ready();
    const f1 = pack('friend', { weapons: { blaster_pistol: Object.assign(blaster(9), { _mode: 'redefine' }) } });
    const r1 = await s.importPack(JSON.stringify(f1));
    check(r1.ok && r1.version === BR.packVersion(f1) && r1.stamp === 'user:friend@' + r1.version, '3 an import is versioned by packVersion over what was received: ' + r1.stamp);
    check(s.list().find((p) => p.packId === 'friend').active === true, '8 H9: an imported pack is ON by default');
    const r1b = await s.importPack(JSON.stringify(f1));
    check(r1b.ok && r1b.sameVersion && Object.keys(A._data.versions).length === 1, '3 re-importing the SAME bytes adds no version (1 stored)');
    const v1bytes = JSON.stringify(A._data.versions[Object.keys(A._data.versions)[0]]);
    const f2 = pack('friend', { weapons: { blaster_pistol: Object.assign(blaster(10), { _mode: 'redefine' }) } });
    const r2 = await s.importPack(f2);
    check(r2.ok && r2.newVersion && Object.keys(A._data.versions).length === 2, '5 H8(b): an import whose packId is an IMPORTED pack\'s is a NEW VERSION (2 stored)');
    check(JSON.stringify(A._data.versions[Object.keys(A._data.versions).find((k) => k.endsWith(r1.version))]) === v1bytes,
      '3 the earlier version is never rewritten (append-only)');
    check(row(A, 'friend').pack.sections.weapons.blaster_pistol.damage.value === 10, '3 the packs store holds the CURRENT version');
    const own = await s.importPack(pack('my_data', {}));
    check(!own.ok && /pack-id-taken/.test(own.reasons[0]), '5 H8(b): an import whose packId is an OWN pack\'s is refused: ' + (own.reasons || [])[0]);
    await s.createPack({ packId: 'house', name: 'House rules' });
    const own2 = await s.importPack(pack('house', {}));
    check(!own2.ok && /pack-id-taken/.test(own2.reasons[0]), '5 …for any own pack, not only my_data (house)');
    const ro = await s.saveRecord('friend', 'weapons', blaster(11));
    check(!ro.ok && /pack-read-only/.test(ro.reasons[0]), '8 an imported pack is read-only: ' + ro.reasons[0]);
    await s.setActive('friend', false);
    await s.setOrder(['house', 'my_data', 'friend']);
    const s2 = mk(A); await s2.ready();
    const fl = s2.list();
    check(fl.find((p) => p.packId === 'friend').active === false && JSON.stringify(A._data.meta.state.order) === JSON.stringify([ckIn(A, 'house'), ckIn(A, 'my_data'), 'imp:friend']),
      '8 active and order persist across a reopen');
    check(JSON.stringify(fl.map((p) => p.packId)) === '["friend","house","my_data"]', '8 list() is in LAYER order (imported → own → my_data), whatever `order` says of my_data');
    const hadFriend = !!A._data.collections['imp:friend'];         // the row exists before, so its absence after is the removal
    const rm = await s2.removePack('friend');
    check(rm.ok && hadFriend && !A._data.collections['imp:friend'] && Object.keys(A._data.versions).length === 2, '8 removing a pack keeps its versions (a frozen character still resolves)');
    const rmMy = await s2.removePack('my_data');
    check(!rmMy.ok && /my-data-is-permanent/.test(rmMy.reasons[0]), '8 my_data cannot be removed');
  }

  // ── 4. H8(a) — SHARE of my_data remaps ──
  {
    const A = U.memoryAdapter(); const s = mk(A); await s.ready();
    await s.saveRecord('my_data', 'weapons', blaster(7));
    await s.saveRecord('my_data', 'gear', gearAdd('my_data', 'lucky_dice', 'Lucky Dice'));
    const t = JSON.parse(JSON.stringify(row(A, 'my_data').pack.sections.gear.custom_my_data_lucky_dice));
    t.id = 'custom_my_data_talent_ref'; t.name = 'Ref';
    await s.saveRecord('my_data', 'gear', t);
    const before = (await s.exportFull('my_data')).text;
    const sh = await s.exportShare('my_data', { newPackId: 'jasons_table' });
    const txt = sh.text || '';
    check(sh.ok && sh.pack.packId === 'jasons_table' && /^[a-z0-9_]+$/.test(sh.pack.packId), '4 H8(a): a SHARE of my_data carries a fresh packId (jasons_table)');
    check(txt.indexOf('custom_my_data_') === -1 && sh.pack.sections.gear.custom_jasons_table_lucky_dice && sh.pack.sections.gear.custom_jasons_table_lucky_dice.id === 'custom_jasons_table_lucky_dice',
      '4 every custom_my_data_* key and id inside the FILE is remapped to custom_jasons_table_*');
    check((await s.exportFull('my_data')).text === before && row(A, 'my_data').pack.packId === 'my_data', '4 local data and its ids are untouched');
    const sh2 = await s.exportShare('my_data');
    check(sh2.ok && sh2.pack.packId !== 'my_data' && /^shared_[0-9a-f]{10}$/.test(sh2.pack.packId), '4 without a chosen id, one is minted: ' + sh2.pack.packId);
  }

  // ── 6. H7 — FULL never refused; SHARE refused on unknown content ──
  {
    const A = U.memoryAdapter(); const s = mk(A); await s.ready();
    const IRON = 'custom_future_iron_will';
    const fut = pack('future', {
      talents: { [IRON]: { _mode: 'add', id: IRON, name: 'Iron Will', description: 'x', ranked: true, activation: 'passive', sources: [],
        effects: [{ op: 'strain_threshold_delta', amount: 1, per_rank: true }, { op: 'upgrade_die', amount: 1, per_rank: true }] } },
      vehicle_attachments: { a: { id: 'a' } } }, { futureKey: 1 });
    const imp = await s.importPack(JSON.stringify(fut));
    check(imp.ok && imp.unapplied === 1, '6 a pack from a newer app IMPORTS (stored whole; its unknown op quarantined, ' + imp.unapplied + ' entry)');
    const full = await s.exportFull('future');
    check(full.ok && JSON.stringify(JSON.parse(full.text)) === JSON.stringify(fut), '6 FULL export is never refused and returns the stored value verbatim (unknown section, key and op included)');
    const share = await s.exportShare('future');
    check(!share.ok && share.reasons.some((r) => /upgrade_die.*is not an effect this app can apply/.test(r)) && share.reasons.some((r) => /vehicle_attachments/.test(r)),
      '6 SHARE export of the same pack is REFUSED, by name (' + (share.reasons || []).length + ' reasons)');
  }

  // ── 7. write-held on a newer store ──
  {
    const A = U.memoryAdapter({ dbVersion: U.DB_VERSION + 1 });     // newer than this build's v2
    const s = mk(A); const st = await s.ready();
    check(st.writable === false && st.reason === 'newer-store', '7 a NEWER database version opens WRITE-HELD: ' + JSON.stringify(st));
    check(s.list().length === 1 && /^user:my_data#[0-9a-f]{12}$/.test(s.activeStamps().join()), '7 reads still work (my_data held in memory, stamped ' + s.activeStamps().join() + ')');
    const w = await s.saveRecord('my_data', 'weapons', blaster(7));
    const i = await s.importPack(pack('friend', { weapons: {} }));
    const c = await s.createPack({ packId: 'house', name: 'H' });
    check(!w.ok && !i.ok && !c.ok && [w, i, c].every((r) => /write-held/.test(r.reasons[0])), '7 every write is refused, named write-held');
    check(Object.keys(A._data.collections).length === 0 && Object.keys(A._data.packs).length === 0 && Object.keys(A._data.meta).length === 0, '7 NOTHING reached the store (not even the my_data seed)');
    const B = U.memoryAdapter();
    await B.tx([{ store: 'meta', op: 'put', key: 'state', value: { v: 3, home: null, active: {}, order: [], future: 1 } }]);
    const s2 = mk(B); const st2 = await s2.ready();
    const w2 = await s2.setActive('my_data', false);
    check(st2.writable === false && !w2.ok && B._data.meta.state.v === 3 && B._data.meta.state.future === 1,
      '7 meta.v ahead holds writes too, and the newer meta is never written back');
  }

  if (rows === 0) fail('HARVEST 0 — no row ran');
  if (failures) { console.error(`\nuser_data_store: ${failures} FAIL of ${rows}`); process.exit(1); }
  console.log(`\nuser_data_store: ALL PASS — ${rows} rows`);
})().catch((e) => { console.error('user_data_store: CRASHED — ' + (e && e.stack || e)); process.exit(1); });
