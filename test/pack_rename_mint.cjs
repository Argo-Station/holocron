#!/usr/bin/env node
/**
 * pack_rename_mint.cjs — STANDING guard for rename, the id mint and the create intent (F-100 items editor;
 * ruling f100-items-editor-contracts R-FIEC-7; brief C-5.4 fixtures). lib/shared/userData.js through the real
 * store, schemas, vocab and registries (memory adapter).
 *
 *   F-C5-1 rename an own collection → the name changes; its stamp and packVersion do not.
 *   F-C5-2 rename an imported one → refused pack-read-only, nothing written.
 *          My Data can be renamed and keeps its packId.
 *   Q1     a duplicate OWN name is refused, case-insensitively, by createPack and renamePack alike (an
 *          imported pack's name does not count); renaming a collection to its own name is not a duplicate.
 *   Since the mint tag (f100-sync-instance-index R-SII-6) a minted id is `custom_<packId>_<slug>_<inst6>`, <inst6> the
 *   first six hex of the collection's instance, and a step `_2` comes AFTER the tag (re-pointed by ruling
 *   f100-ms-build-card R-MSB-13).
 *   F-C5-3 mint "Det Cord" → …_det_cord_<inst6>; saved, mint again → …_det_cord_<inst6>_2.
 *   F-C5-4 mint "Blaster Pistol" in my_data → custom_my_data_blaster_pistol_<inst6> (no collision with the book's
 *          blaster_pistol); a collision with ANOTHER pack's id in the same section also steps the suffix.
 *   F-C5-5 a 200-character name → a 48-character slug (between the prefix and the tag); an empty or all-symbol name →
 *          `item`.
 *   CREATE the create intent refuses an id already in that pack (`id-taken`) and leaves the stored record
 *          byte-identical. BITE: the same save WITHOUT the intent replaces it — the measured silent replace
 *          ("Det Cord II" over "Det Cord") the intent exists to stop.
 *   HELD   every write here is refused on a write-held (newer) store.
 *
 * Run: node test/pack_rename_mint.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const BR = require(path.join(ROOT, 'lib/shared/baseRef.js'));

let failures = 0, rows = 0;
const check = (ok, m) => { rows += 1; if (ok) console.log('  PASS  ' + m); else { failures += 1; console.log('  FAIL  ' + m); } };
const J = (x) => JSON.stringify(x);

const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const ids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const VOCAB = { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 8, 23, 0, 0, tick++)).toISOString();
const mk = (extra) => U.createStore(Object.assign({ adapter: U.memoryAdapter(), schemas: SCHEMAS, vocab: VOCAB, base: BASE, now }, extra || {}));
const weapon = (id, name) => ({ id, name, skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] });
const reasons = (r) => (r && r.reasons ? r.reasons.join(' ') : '');

(async () => {
  console.log('pack_rename_mint — ruling f100-items-editor-contracts R-FIEC-7');
  const S = mk(); await S.ready();
  await S.createPack({ packId: 'demolitions_kit', name: 'Demolitions Kit' });
  const tagK = S.get('demolitions_kit').pack.instance.slice(0, 6);
  const DC = 'custom_demolitions_kit_det_cord_' + tagK;          // the id a mint of "Det Cord" makes in this collection
  await S.saveRecord('demolitions_kit', 'weapons', weapon(DC, 'Det Cord'), { create: true });

  // ── F-C5-1 ──
  const before = S.list().find((p) => p.packId === 'demolitions_kit');
  const v0 = BR.packVersion(S.get('demolitions_kit').pack);
  const rn = await S.renamePack('demolitions_kit', 'Breaching Kit');
  const after = S.list().find((p) => p.packId === 'demolitions_kit');
  check(rn.ok && after.name === 'Breaching Kit' && after.stamp === before.stamp && BR.packVersion(S.get('demolitions_kit').pack) === v0,
    `F-C5-1 rename own: "${before.name}" → "${after.name}"; stamp ${after.stamp === before.stamp ? 'unchanged' : 'MOVED'}, packVersion ${BR.packVersion(S.get('demolitions_kit').pack) === v0 ? 'unchanged' : 'MOVED'}`);

  // ── F-C5-2 + My Data ──
  const sh = await S.exportShare('demolitions_kit', {});
  const R = mk(); await R.ready();
  await R.importPack(sh.text);
  const impBefore = J(R.get('demolitions_kit'));
  const ri = await R.renamePack('demolitions_kit', 'Mine Now');
  check(!ri.ok && /pack-read-only/.test(reasons(ri)) && J(R.get('demolitions_kit')) === impBefore, 'F-C5-2 rename an imported collection → ' + (reasons(ri).split(' — ')[0] || 'ACCEPTED') + ', nothing written');
  const my = await S.renamePack('my_data', 'House Rules');
  check(my.ok && S.get('my_data').pack.name === 'House Rules' && S.get('my_data').packId === 'my_data', 'My Data can be renamed ("House Rules") and keeps its packId my_data');

  // ── Q1 duplicate own names ──
  const c1 = await S.createPack({ packId: 'other', name: 'breaching KIT' });
  const c2 = await S.createPack({ packId: 'other', name: 'Dathomir Witches' });
  const r1 = await S.renamePack('other', '  house rules ');
  const r2 = await S.renamePack('other', 'DATHOMIR witches');
  check(!c1.ok && /name-taken/.test(reasons(c1)) && c2.ok && !r1.ok && /name-taken/.test(reasons(r1)) && r2.ok,
    'Q1 a duplicate own name is refused case-insensitively by createPack and renamePack; renaming to its own name (another case) is allowed');
  const Ri = await R.createPack({ packId: 'mine', name: R.get('demolitions_kit').pack.name });
  check(Ri.ok, 'Q1 an IMPORTED pack\'s name does not count: on the receiver, an own collection may take it ("Breaching Kit")');

  // ── F-C5-3 / 4 / 5 ──
  const m1 = S.mintId('demolitions_kit', 'weapons', 'Det Cord II');
  const m0 = S.mintId('demolitions_kit', 'weapons', 'Det Cord');
  check(m0 === DC + '_2' && m1 === 'custom_demolitions_kit_det_cord_ii_' + tagK, `F-C5-3 "Det Cord" (taken) → ${m0}; "Det Cord II" → ${m1}`);
  const S2 = mk(); await S2.ready();
  const tagH = S2.get('my_data').pack.instance.slice(0, 6), BP = 'custom_my_data_blaster_pistol_' + tagH;
  const bp = S2.mintId('my_data', 'weapons', 'Blaster Pistol');
  // another pack holding that id: X redefines My Data's record, then My Data's own copy is deleted
  await S2.createPack({ packId: 'x', name: 'X' });
  // the TAGGED id (R-MSB-13): the untagged literal can no longer reach a mint, so it could not show the step past ANY row
  await S2.saveRecord('my_data', 'weapons', weapon(BP, 'Blaster Pistol'), { create: true });
  const xr = await S2.saveRecord('x', 'weapons', weapon(BP, 'Blaster Pistol (X)'), { create: true });
  await S2.deleteRecord('my_data', 'weapons', BP);
  const bp2 = xr.ok ? S2.mintId('my_data', 'weapons', 'Blaster Pistol') : 'x-refused: ' + reasons(xr);
  check(bp === BP && bp2 === BP + '_2', `F-C5-4 "Blaster Pistol" in my_data → ${bp} (not the book's blaster_pistol); held by another pack → ${bp2}`);
  const long = S2.mintId('my_data', 'weapons', 'A'.repeat(100) + ' ' + 'b'.repeat(100));
  const slug = long.endsWith('_' + tagH) ? long.slice('custom_my_data_'.length, -('_' + tagH).length) : '(no tag) ' + long;
  check(slug.length === 48 && /^[a-z0-9_]+$/.test(long) && S2.mintId('my_data', 'gear', '') === 'custom_my_data_item_' + tagH && S2.mintId('my_data', 'gear', '★ — !') === 'custom_my_data_item_' + tagH,
    `F-C5-5 a 201-character name → a ${slug.length}-character slug; an empty or all-symbol name → item`);
  check(PV.create(SCHEMAS).validateRecord('weapons', weapon(bp, 'x')).length === 0 && /^custom_my_data_/.test(bp), 'a minted id passes the add id rules (the ^[a-z0-9_]+$ pattern, the custom_<packId>_ namespace)');
  const listBefore = J(S2.get('x'));
  S2.mintId('x', 'weapons', 'Anything');
  check(J(S2.get('x')) === listBefore, 'mintId is pure: it writes nothing');

  // ── CREATE + BITE ──
  const stored0 = J(S.get('demolitions_kit').pack.sections.weapons[DC]);
  const cr = await S.saveRecord('demolitions_kit', 'weapons', weapon(DC, 'Det Cord II'), { create: true });
  check(!cr.ok && /id-taken/.test(reasons(cr)) && J(S.get('demolitions_kit').pack.sections.weapons[DC]) === stored0,
    'CREATE a new record under a taken id → ' + (reasons(cr).split(' — ')[0] || 'ACCEPTED') + '; "Det Cord" byte-identical');
  const ed = await S.saveRecord('demolitions_kit', 'weapons', weapon(DC, 'Det Cord II'));
  check(ed.ok && S.get('demolitions_kit').pack.sections.weapons[DC].name === 'Det Cord II',
    'BITE the same save without the intent replaces it (an edit in place) — the silent replace the intent stops');
  const bpr = await S.saveRecord('demolitions_kit', 'weapons', Object.assign({}, BASE.weapons.blaster_pistol, { price: 450 }), { create: true });
  const bpr2 = await S.saveRecord('demolitions_kit', 'weapons', Object.assign({}, BASE.weapons.blaster_pistol, { price: 460 }), { create: true });
  check(bpr.ok && bpr.mode === 'redefine' && !bpr2.ok && /id-taken/.test(reasons(bpr2)), 'CREATE a first "change the book\'s" saves; a second create of the same redefine in that pack is id-taken');

  // ── HELD ──
  const H = mk({ adapter: U.memoryAdapter({ dbVersion: 99 }) }); await H.ready();
  const hs = [await H.renamePack('my_data', 'Z'), await H.createPack({ packId: 'z', name: 'Z' })];
  check(hs.every((r) => !r.ok && /write-held/.test(reasons(r))), 'HELD rename and create are refused on a newer store');

  if (failures) { console.error(`\npack_rename_mint: ${failures} FAIL of ${rows}`); process.exit(1); }
  console.log(`\npack_rename_mint: ALL PASS — ${rows} rows`);
})().catch((e) => { console.error(e); process.exit(1); });
