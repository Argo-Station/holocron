#!/usr/bin/env node
/**
 * own_collection_identity.cjs — STANDING guard for an own collection's identity (F-100; ruling
 * f100-editor-contracts-2 R-EC2-1, brief C5, fixtures F21–F23; amends R-FUD-5 and R-B854-2).
 *
 *   MINT: every own pack mints a RANDOM 48-bit instance once (12 hex); 1,000 pairs of fresh stores,
 *         0 collisions; a store re-opened keeps its instance; a SHARE never carries it.
 *   F21  the B-856 fixture (HOME's own My Data REDEFINES charmer r0c0), both variants: a character made
 *        on HOME carries `user:my_data#<HOME>`; on SECOND that stamp is ABSENT (missingFor names it), so
 *        the R-EC2-1 trigger HOLDS it — the case where every reference resolves to the book. HOME: not held.
 *   F22  SECOND's own My Data holds a DIFFERENT `custom_my_data_b856_house`: HOME's stamp still absent,
 *        and SECOND's record never stands in for HOME's.
 *   F23  an own stamp without `#` is unheld; an imported stamp keeps `@<v12>` (user_pack_stamps holds the rest).
 *
 * The HOLD's writer wiring is B-855's (released after this card); this guard pins its trigger INPUT:
 *   held(sheet) = the sheet carries an own stamp (`user:<p>#<i>`) this device's store does not hold.
 *
 * Run: node test/own_collection_identity.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));

let failures = 0, rows = 0;
function check(ok, msg) { rows += 1; if (ok) console.log('  PASS  ' + msg); else { failures += 1; console.log('  FAIL  ' + msg); } }
const clone = (v) => JSON.parse(JSON.stringify(v));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const vocab = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries;
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const skills = vocab('skills.vocab.json');
const skillSheetKeys = {}; skills.forEach((e) => { skillSheetKeys[e.id] = ((e.aliases || []).find((a) => /^[A-Z]+$/.test(a))) || e.id; });
const VOCAB = { skills: skills.map((e) => e.id), qualities: vocab('qualities.vocab.json').map((e) => e.id) };
const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const CB = { species: BASE.species, careers: BASE.careers, specializations: BASE.specializations, talents: BASE.talents, forcePowers: BASE.force_powers, skillSheetKeys };
const mk = (adapter) => U.createStore({ adapter: adapter || U.memoryAdapter(), schemas: SCHEMAS, vocab: VOCAB, base: BASE });
const OWN_RE = /^user:[a-z0-9_]+#[0-9a-f]{12}$/;
// the R-EC2-1 trigger input, as the amended R-B854-2 words it
const held = (store, mods) => (mods || []).some((s) => OWN_RE.test(s) && store.missingFor([s]).length === 1);

const HOUSE = 'toughened', CUSTOM_HOUSE = 'custom_my_data_b856_house', SPEC = 'charmer';
async function device(house, customName) {
  const s = mk(); await s.ready();
  if (house) {
    if (house === CUSTOM_HOUSE) {
      const t = clone(BASE.talents[HOUSE]); t.id = CUSTOM_HOUSE; t.name = customName || 'B-856 House Talent';
      Object.keys(t).forEach((k) => { if (k.charAt(0) === '_') delete t[k]; });
      const rt = await s.saveRecord('my_data', 'talents', t); if (!rt.ok) throw new Error(JSON.stringify(rt));
    }
    const rec = clone(BASE.specializations[SPEC]); rec.talent_tree[0].talents[0].talent = house;
    const r = await s.saveRecord('my_data', 'specializations', rec); if (!r.ok || r.mode !== 'redefine') throw new Error(JSON.stringify(r));
  }
  return s;
}
const r0c0 = (data) => data.specializations[SPEC].talent_tree[0].talents[0].talent;

(async function main() {
  console.log('own_collection_identity — ruling f100-editor-contracts-2 R-EC2-1');

  // ── MINT ──
  const seen = new Set(); let collisions = 0, pairs = 0, shaped = 0;
  for (let i = 0; i < 1000; i++) {
    const a = mk(), b = mk(); await a.ready(); await b.ready();
    const ia = a.get('my_data').pack.instance, ib = b.get('my_data').pack.instance;
    pairs += 1; if (/^[0-9a-f]{12}$/.test(ia) && /^[0-9a-f]{12}$/.test(ib)) shaped += 1;
    if (ia === ib || seen.has(ia) || seen.has(ib)) collisions += 1;
    seen.add(ia); seen.add(ib);
  }
  check(pairs === 1000 && shaped === 1000 && collisions === 0, `MINT 1,000 pairs of fresh stores: ${collisions} collisions across ${seen.size} instances, all 12-hex (HARVEST ${pairs})`);
  const A = U.memoryAdapter(); const s1 = mk(A); await s1.ready();
  const i1 = s1.get('my_data').pack.instance;
  const cp = await s1.createPack({ packId: 'house', name: 'House' });
  const s2 = mk(A); await s2.ready();
  check(cp.ok && s2.get('my_data').pack.instance === i1 && /^[0-9a-f]{12}$/.test(s2.get('house').pack.instance) && s2.get('house').pack.instance !== i1,
    'MINT a store re-opened keeps its instance; createPack mints its own');
  check(s2.activeStamps().every((x) => OWN_RE.test(x)) && s2.activeStamps().includes('user:my_data#' + i1), 'MINT own stamps are user:<packId>#<instance>: ' + s2.activeStamps().join(', '));
  const legacy = U.memoryAdapter();
  await legacy.tx([{ store: 'packs', op: 'put', value: { packId: 'my_data', origin: 'own', addedAt: 't', updatedAt: 't', pack: { formatVersion: 1, packId: 'my_data', name: 'My Data', _provenance: 'custom', sections: {} } } }]);
  const s3 = mk(legacy); await s3.ready();
  const i3 = s3.get('my_data').pack.instance;
  // v2 (R-SII-2; re-pointed by ruling f100-ms-build-card R-MSB-13): open copies the v1 row into `collections` under its
  // healed ck, once; the v1 `packs` store is kept and never written
  const healed = legacy._data.collections['own:' + i3];
  check(/^[0-9a-f]{12}$/.test(i3) && !!healed && healed.pack.instance === i3 && healed.packId === 'my_data' && legacy._data.meta.state.home === 'own:' + i3,
    'MINT an own pack stored without an instance gets one at open, written once');
  check(legacy._data.packs.my_data.pack.instance === undefined, 'MINT the v1 row it was copied from stays un-instanced (v1 is never written)');

  // ── F21 / F22 ──
  for (const variant of [HOUSE, CUSTOM_HOUSE]) {
    const HOME = await device(variant);
    const SECOND = await device(null);
    const mods = HOME.activeStamps();
    M.useUserPacks(HOME); const homeData = await M.resolveForStamp(mods, CB);
    M.useUserPacks(SECOND); const secondData = await M.resolveForStamp(mods, CB);
    check(r0c0(homeData) === variant && r0c0(secondData) === r0c0(CB) && r0c0(CB) !== variant, `F21 [${variant}] control: HOME r0c0=${r0c0(homeData)} · SECOND resolves the BOOK's ${r0c0(secondData)}`);
    check(!held(HOME, mods) && held(SECOND, mods) && SECOND.missingFor(mods).join() === mods.join(),
      `F21 [${variant}] the trigger: HOME not held; SECOND HELD — missingFor names ${SECOND.missingFor(mods).join()} (the stamp is absent even where every reference resolves)`);
  }
  const HOME = await device(CUSTOM_HOUSE, 'HOME house');
  const OTHER = await device(CUSTOM_HOUSE, 'SECOND house (different content)');
  const mods = HOME.activeStamps();
  M.useUserPacks(OTHER); const otherData = await M.resolveForStamp(mods, CB);
  check(held(OTHER, mods) && !(otherData.talents || {})[CUSTOM_HOUSE],
    'F22 SECOND\'s own My Data holds a different ' + CUSTOM_HOUSE + ': HOME\'s stamp is still absent (HELD) and SECOND\'s record never stands in for HOME\'s');
  M.useUserPacks(HOME); const homeAgain = await M.resolveForStamp(mods, CB);
  check((homeAgain.talents || {})[CUSTOM_HOUSE] && homeAgain.talents[CUSTOM_HOUSE].name === 'HOME house', 'F22 control: on HOME the same stamp resolves HOME\'s record');

  // ── F23 ──
  check(HOME.missingFor(['user:my_data']).length === 1 && HOME.stampSync('user:my_data') === null, 'F23 an own stamp WITHOUT #<instance> is unheld (nothing shipped writes one)');
  const sh = await HOME.exportShare('my_data', { newPackId: 'friend' });
  const R = mk(); await R.ready();
  const imp = await R.importPack(sh.text);
  check(sh.ok && !/"instance"/.test(sh.text) && imp.ok && /^user:friend@[0-9a-f]{12}$/.test(imp.stamp) && R.missingFor([imp.stamp]).length === 0,
    'F23 a SHARE carries no instance; its import is stamped @<v12> and resolves (' + imp.stamp + ')');
  const full = await HOME.exportFull('my_data');
  check(JSON.parse(full.text).instance === HOME.get('my_data').pack.instance, 'F23 the FULL export carries the instance (R-EC2-1: the restore question stays Jason\'s)');

  if (failures) { console.error(`\nown_collection_identity: ${failures} FAIL of ${rows}`); process.exit(1); }
  console.log(`\nown_collection_identity: ALL PASS — ${rows} rows · HARVEST ${pairs} mint pairs, 2 variants + F22`);
})().catch((e) => { console.error('own_collection_identity: CRASHED — ' + (e && e.stack || e)); process.exit(1); });
