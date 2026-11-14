#!/usr/bin/env node
/**
 * user_pack_stamps.cjs — STANDING guard for the user: stamp (F-100 UD-1e; ruling f100-ud1-contracts
 * R-FUD-5, H3; §6 acceptance 7, first half). What a character OWNS, resolved through the ONE seam
 * (SWRPGMods.resolveForStamp / applyStampSync) over lib/shared/userData.js's memory adapter.
 *
 *   1. THE GRAMMAR: ^user:([a-z0-9_]+)(?:@([0-9a-f]{12})|#([0-9a-f]{12}))?$ (the own `#<instance>` per ruling
 *      f100-editor-contracts-2 R-EC2-1) — accepted and refused forms; every stamp
 *      the store hands out parses; no SHIPPED_STAMPS entry begins with `user:`.
 *   2. OWN = LIVE: a character stamped `user:my_data#<instance>` resolves an edit made AFTER it was stamped
 *      (async and sync paths).
 *   3. IMPORTED = FROZEN: a character stamped `user:friend@v1` keeps v1 after a re-import to v2 — also
 *      from a FRESH store over the same data (the version comes back from the versions store); a new
 *      character is stamped v2.
 *   4. THE MISSING PACK: a stamp whose pack (or version) is absent resolves to BASE, never throws;
 *      a custom_ id it added is unresolved (the "(unknown …)" path); missingFor names it.
 *   5. A user: stamp is NEVER FETCHED (fetchPack / warm), and the stamp ORDER is the fold order.
 *   6. PACK OFF (H3): the pack leaves activeStamps (new characters), and a character already stamped
 *      with it still resolves it (ownership). conflicts() reports the tie between two active packs.
 *
 * Run: node test/user_pack_stamps.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const BR = require(path.join(ROOT, 'lib/shared/baseRef.js'));
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));

let failures = 0, rows = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const pass = (m) => console.log('  PASS  ' + m);
const check = (ok, m) => { rows += 1; (ok ? pass(m) : fail(m)); };
const clone = (x) => JSON.parse(JSON.stringify(x));

let fetches = 0;
global.fetch = function (u) { fetches += 1; return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) }); };

const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const ids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const VOCAB = { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') };
const mk = (A) => { const s = U.createStore({ adapter: A, schemas: SCHEMAS, vocab: VOCAB, base: BASE }); M.useUserPacks(s); return s; };
const ITEMS = () => ({ weapons: BASE.weapons, armor: BASE.armor, gear: BASE.gear, attachments: {}, skills: [] });
const CB = () => ({ species: BASE.species, careers: BASE.careers, specializations: BASE.specializations, talents: BASE.talents, forcePowers: BASE.force_powers });
const blaster = (dmg) => { const r = clone(BASE.weapons.blaster_pistol); r.damage = Object.assign({}, r.damage, { value: dmg }); r._mode = 'redefine'; return r; };
const human = (xp) => Object.assign(clone(BASE.species.human), { starting_xp: xp, _mode: 'redefine' });
const dmg = (view) => view.weapons.blaster_pistol.damage.value;
const BASE_DMG = BASE.weapons.blaster_pistol.damage.value;
const pack = (packId, sections) => ({ formatVersion: 1, packId, name: packId, _provenance: 'custom', sections });

(async function main() {
  // ── 1. grammar ──
  const good = ['user:my_data', 'user:a', 'user:friend_2@0123456789ab', 'user:my_data#0123456789ab'];
  const bad = ['user:', 'user:My_Data', 'user:bad-id', 'user:x@0123', 'user:x@0123456789AB', 'user:x@0123456789abc', 'user:a:b', 'respecialized@eote-v1', 'user:x@', 'user:x#0123', 'user:x#0123456789AB', 'user:x@0123456789ab#0123456789ab'];
  check(good.every((s) => M.USER_STAMP_RE.test(s)) && bad.every((s) => !M.USER_STAMP_RE.test(s)),
    `1 the grammar accepts ${good.length} forms and refuses ${bad.length} (hyphen, case, short/long/upper version, extra colon, a variant stamp, short/upper instance, version+instance)`);
  check(M.SHIPPED_STAMPS.length > 0 && M.SHIPPED_STAMPS.every((s) => !s.startsWith('user:')), '1 no SHIPPED_STAMPS entry begins with user: (' + M.SHIPPED_STAMPS.join(', ') + ')');

  const A = U.memoryAdapter();
  let s = mk(A); await s.ready();
  check(s.activeStamps().every((x) => M.USER_STAMP_RE.test(x)) && s.activeStamps()[0] === 'user:my_data#' + s.get('my_data').pack.instance, '1 every stamp the store hands out parses: ' + s.activeStamps().join(', '));

  // ── 2. own = live ──
  const charA = s.activeStamps();                                        // built BEFORE the house rule
  await s.saveRecord('my_data', 'weapons', blaster(7));
  check(dmg(await M.resolveForStamp(charA, ITEMS())) === 7, '2 OWN = LIVE: a character stamped ' + charA[0] + ' before the edit resolves it (damage 7, base ' + BASE_DMG + ')');
  await s.saveRecord('my_data', 'weapons', blaster(8));
  check(dmg(await M.resolveForStamp(charA, ITEMS())) === 8 && dmg(M.applyStampSync(charA, ITEMS())) === 8, '2 …and the next edit too, on the async AND the sync path (8)');
  check(dmg(await M.resolveForStamp([], ITEMS())) === BASE_DMG && dmg(await M.resolveForStamp(undefined, ITEMS())) === BASE_DMG,
    '2 an UNSTAMPED character keeps the base (' + BASE_DMG + ') while the pack is active');

  // ── 3. imported = frozen ──
  const v1 = pack('friend', { weapons: { blaster_pistol: blaster(9) }, species: { human: human(120) } });
  const r1 = await s.importPack(JSON.stringify(v1));
  const charB = r1.ok ? [r1.stamp] : [];
  check(r1.ok && dmg(await M.resolveForStamp(charB, ITEMS())) === 9 && (await M.resolveForStamp(charB, CB())).species.human.starting_xp === 120,
    '3 a character stamped ' + charB[0] + ' resolves the import in BOTH funnels (weapon 9, human xp 120)');
  const r2 = await s.importPack(pack('friend', { weapons: { blaster_pistol: blaster(10) } }));
  check(r2.ok && r2.newVersion && dmg(await M.resolveForStamp(charB, ITEMS())) === 9, '3 IMPORTED = FROZEN: after a re-import to v2 the v1 character still resolves 9');
  s = mk(A); await s.ready();                                              // a fresh store: v1 must come back from the versions store
  check(dmg(M.applyStampSync(charB, ITEMS())) === 9 && dmg(await M.resolveForStamp(charB, ITEMS())) === 9,
    '3 …and from a FRESH store over the same data: the versions store comes back at open, so the SYNC render path resolves v1 at once (9), and the async path agrees');
  // R-FUG-2 (ruling f100-ud1-gate): a REMOVED pack's frozen version resolves on the SYNC path from a
  // fresh store with NO prior async call — its own adapter, so no current pack carries records.
  {
    const A2 = U.memoryAdapter();
    let g = mk(A2); await g.ready();
    const rg = await g.importPack(pack('gone', { weapons: { blaster_pistol: blaster(9) } }));
    const rmg = rg.ok ? await g.removePack('gone') : { ok: false };
    g = mk(A2); await g.ready();
    const syncFirst = dmg(M.applyStampSync([rg.stamp], ITEMS()));
    check(rg.ok && rmg.ok && syncFirst === 9,
      '3 R-FUG-2 a REMOVED pack\'s frozen version resolves on the SYNC path from a fresh store, before any async call (' + syncFirst + ', want 9)');
    M.useUserPacks(s);                                                   // hand the seam back to the main store
  }
  const newStamps = s.activeStamps();
  check(newStamps.includes('user:friend@' + r2.version) && !newStamps.includes(charB[0]), '3 a NEW character is stamped with v2: ' + newStamps.join(', '));

  // ── 5. order + never fetched ──
  fetches = 0;
  check(dmg(await M.resolveForStamp(newStamps, ITEMS())) === 8, '5 the stamp order is the fold order: [' + newStamps.join(', ') + '] → my_data (8) wins over friend (10)');
  check(dmg(await M.resolveForStamp(newStamps.slice().reverse(), ITEMS())) === 10, '5 …reversed, friend (10) wins');
  await M.warm(newStamps);
  check(fetches === 0, '5 a user: stamp is NEVER fetched (resolveForStamp ×2 + warm: ' + fetches + ' fetch calls)');
  check(M.failed().length === 0, '5 …and never enters the B-30 load-failure set');

  // ── 6. pack OFF, ownership, conflicts ──
  const ties = s.conflicts();
  check(ties.length === 1 && ties[0].section === 'weapons' && ties[0].id === 'blaster_pistol' && ties[0].winner === 'user:my_data#' + s.get('my_data').pack.instance && ties[0].layers[0].startsWith('user:friend@'),
    '6 conflicts() reports the one tie between the two active packs: ' + JSON.stringify(ties));
  await s.setActive('friend', false);
  check(!s.activeStamps().some((x) => x.startsWith('user:friend')), '6 PACK OFF: a new character no longer gets it (' + s.activeStamps().join(', ') + ')');
  check(dmg(await M.resolveForStamp(newStamps, ITEMS())) === 8 && dmg(await M.resolveForStamp([newStamps[0]], ITEMS())) === 10 && s.conflicts().length === 0,
    '6 …and a character ALREADY stamped with it still resolves it (ownership), while discovery has no tie left');

  // ── 4. the missing pack ──
  const ADD = 'custom_ghost_lamp';
  const ghost = ['user:ghost', 'user:friend@000000000000'];
  let threw = null, view = null;
  try { view = await M.resolveForStamp(ghost, ITEMS()); } catch (e) { threw = e; }
  check(!threw && dmg(view) === BASE_DMG, '4 a stamp whose pack / version is absent resolves to BASE and never throws');
  let syncThrew = null; try { M.applyStampSync(ghost, ITEMS()); } catch (e) { syncThrew = e; }
  check(!syncThrew, '4 …on the sync path too');
  check(IR.pcResolveEntry({ id: ADD }, view.gear) === null, '4 a custom_ id the missing pack added is UNRESOLVED (the "(unknown gear)" path), not a throw');
  const miss = s.missingFor(['respecialized@eote-v1'].concat(ghost, newStamps));
  check(JSON.stringify(miss) === JSON.stringify(ghost), '4 missingFor names exactly the absent user: stamps: ' + JSON.stringify(miss));

  if (rows === 0) fail('HARVEST 0 — no row ran');
  if (failures) { console.error(`\nuser_pack_stamps: ${failures} FAIL of ${rows}`); process.exit(1); }
  console.log(`\nuser_pack_stamps: ALL PASS — ${rows} rows`);
})().catch((e) => { console.error('user_pack_stamps: CRASHED — ' + (e && e.stack || e)); process.exit(1); });
