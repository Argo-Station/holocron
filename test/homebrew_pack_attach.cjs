#!/usr/bin/env node
/**
 * homebrew_pack_attach.cjs — STANDING guard for `lib/shared/packAttach.js` (HOMEBREW H1; card `homebrew-h1-build-card`
 * §5 ACCEPTANCE; contract `homebrew-h1-contract` R-H1K-2..6; frames Docs/mockups/homebrew-h1.html @ 813f0578, D-110).
 *
 * Driven, not read: the player's page in a node vm — the real store (userData.js on its memory adapter, the shipped
 * schemas and registries), SWRPGMods, CharResolve, SWRPGProjectionDiff, ItemResolve, SWItems, the items loader, the
 * sheet's pool module and the talent-view wrapper registered as the player registers it — over the frames' own device,
 * built through the store's writing verbs as scripts/homebrew_h1_frames.py builds it:
 *   My Data (home) — Tuned Blaster Pistol · House Rules (own) — Toughened's text · Drive Kit — a friend's file,
 *   imported at v1 then v2 (Long-Barrel Light Blaster damage +1 → +2; Shock Knuckles; Scrap-Plate Vest; the book's
 *   Light Blaster Pistol crit 4 → 3; Grit +2) · Marshal Rework (own) — Grit and Toughened swapped in Marshal's row 0 ·
 *   Blank (own, 0 records) · Maro Jinx — the Colonist pregen + Shock Knuckles as a bare id, a spare Scrap-Plate Vest,
 *   and the Long-Barrel saved as a hotfix copy at v1.
 *
 *   A placement by rank and device order; no existing stamp moves; equal to creation's layer order (the mirror)
 *   B each preview section in the frames' words; the empty preview; copies start TICKED (J2 A); the patch's ticked and
 *     unticked swaps
 *   C update: the pin replaced in its slot; the version line; damage 6 → 7
 *   D refusals: a held sheet, the same packId under another version (H2's REPLACE), a carried stamp
 *   E a 0-record collection is not offered; refusal words in the list; J3's offer (R-H1BP-2: ACTIVE only; Not now
 *     remembered by name|ck; never held)
 *   F R-H1B-3's held line on B-1180's fixture, in the card's words
 *   G Undo restores the record byte for byte; the patched record re-diffs clean (the preview IS the write)
 *   H B-1162 F1 (ruling release-r7-bug-burndown ADDENDUM 69): a held spare suit { _inline, as: "armor" } whose collection is
 *     attached swaps to { id, … } with NO `as` — the key lives only on an {_inline} entry (ADDENDUM 55's paper)
 *
 * THE BITE: before packAttach.js exists the file exits 1 (no module); mutants are listed in the gate.
 * Run: node test/homebrew_pack_attach.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CharResolve = require(path.join(ROOT, 'lib/shared/charResolve.js'));
global.CharResolve = CharResolve;
const PD = require(path.join(ROOT, 'lib/shared/projectionDiff.js'));
const PoolMods = require(path.join(ROOT, 'lib/shared/poolMods.js'));
const IRes = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const SWItems = require(path.join(ROOT, 'lib/items.js')).SWItems;
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));

let failures = 0, rows = 0;
function check(ok, msg, detail) {
  rows += 1;
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const BOOK = {}; PV.APPLIED_SECTIONS.forEach((sec) => { BOOK[sec] = canon(sec + '.json')[sec]; });
const VOCAB = { skills: canon('skills.vocab.json').entries.map((e) => e.id), qualities: canon('qualities.vocab.json').entries.map((e) => e.id) };
const PREGEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters.filter((c) => c.id === 'colonist')[0];
// copy-voice-sweep-build (DECISIONS D-289, census packAttach.js:39:11, :49:33): a group head and the last line may now be null — a
// null is no word, so it is skipped rather than counted (the H2 guard's helper already did)
const words = (pay) => pay.groups.reduce((a, g) => a.concat(g.h ? [g.h] : [], g.rows.map((r) => r.t), g.rows.filter((r) => r.sub).map((r) => r.sub)), [pay.title]).concat(pay.sub ? [pay.sub] : [], pay.last ? [pay.last] : []);

(async function main() {
  console.log('homebrew_pack_attach — packAttach.js on the frames’ device (R-H1K-2..6, R-H1B-3, R-H1BP-2)');
  let PA = null;
  try { PA = require(path.join(ROOT, 'lib/shared/packAttach.js')); } catch (e) { check(false, 'lib/shared/packAttach.js loads', String(e).slice(0, 200)); }
  if (!PA || typeof PA.attachPlan !== 'function') { console.log('\n' + (rows - failures) + '/' + rows + ' — FAILED'); process.exit(1); }

  // ── the device ──
  const H = U.createStore({ adapter: U.memoryAdapter(), schemas: PV.readSchemaDir(path.join(ROOT, 'schema')), vocab: VOCAB, base: BOOK });
  await H.ready();
  M.useUserPacks(H);
  const got = (r, what) => { if (!r || !r.ok) throw new Error(what + ': ' + JSON.stringify(r && r.reasons)); return r; };
  const nw = (b, name, f) => { const r = clone(b); r.name = name; delete r.id; f(r); return r; };
  const W_ = BOOK.weapons, A_ = BOOK.armor, T_ = BOOK.talents;
  got(await H.saveRecord('my_data', 'weapons', nw(W_.blaster_pistol, 'Tuned Blaster Pistol', (r) => { r.damage = { value: W_.blaster_pistol.damage.value + 1, base: 'flat' }; }), { from: 'blaster_pistol', create: true, mint: true }), 'my data');
  got(await H.createPack({ packId: 'house_rules', name: 'House Rules' }), 'house rules');
  const tg = clone(T_.toughened); tg.description += ' At our table it also covers a long march.';
  got(await H.saveRecord('house_rules', 'talents', tg), 'house rules toughened');
  got(await H.createPack({ packId: 'drive_kit', name: 'Drive Kit' }), 'drive kit');
  const lbp = W_.light_blaster_pistol;
  const lb = got(await H.saveRecord('drive_kit', 'weapons', nw(lbp, 'Long-Barrel Light Blaster', (r) => { r.damage = { value: lbp.damage.value + 1, base: 'flat' }; }), { from: 'light_blaster_pistol', create: true, mint: true }), 'lb');
  const bk = W_.brass_knuckles;
  const sk = got(await H.saveRecord('drive_kit', 'weapons', nw(bk, 'Shock Knuckles', (r) => { r.damage = clone(bk.damage); r.damage.value = (bk.damage.value || 0) + 1; r.crit = 4; }), { from: 'brass_knuckles', create: true, mint: true }), 'sk');
  const pa = A_.padded_armor;
  const sv = got(await H.saveRecord('drive_kit', 'armor', nw(pa, 'Scrap-Plate Vest', (r) => { r.soak = pa.soak + 1; }), { from: 'padded_armor', create: true, mint: true }), 'sv');
  const lbpC = clone(lbp); lbpC.crit = lbp.crit - 1; got(await H.saveRecord('drive_kit', 'weapons', lbpC), 'lbp change');
  const gr = clone(T_.grit); gr.effects = clone(T_.grit.effects); gr.effects[0].amount = 2; got(await H.saveRecord('drive_kit', 'talents', gr), 'grit');
  const share1 = got(await H.exportShare('drive_kit'), 'share v1').text;
  const lb2 = clone(H.get('drive_kit').pack.sections.weapons[lb.id]); lb2.damage = { value: lbp.damage.value + 2, base: 'flat' };
  got(await H.saveRecord('drive_kit', 'weapons', lb2), 'lb v2');
  const share2 = got(await H.exportShare('drive_kit'), 'share v2').text;
  got(await H.removePack('drive_kit'), 'remove');
  got(await H.importPack(share1), 'import v1');
  const v1 = H.list().filter((x) => x.packId === 'drive_kit')[0].version;
  got(await H.importPack(share2), 'import v2');
  const v2 = H.list().filter((x) => x.packId === 'drive_kit')[0].version;
  got(await H.createPack({ packId: 'marshal_rework', name: 'Marshal Rework' }), 'marshal rework');
  const mr = clone(BOOK.specializations.marshal); { const r0 = mr.talent_tree[0].talents, a = r0[1].talent; r0[1].talent = r0[3].talent; r0[3].talent = a; }
  got(await H.saveRecord('marshal_rework', 'specializations', mr), 'marshal rework tree');
  got(await H.createPack({ packId: 'blank', name: 'Blank' }), 'blank');
  const row = (pk) => H.list().filter((x) => x.packId === pk)[0];
  const V1 = 'user:drive_kit@' + v1, V2 = 'user:drive_kit@' + v2, MY = row('my_data').stamp, HR = row('house_rules').stamp, MR = row('marshal_rework').stamp;

  // ── the page ──
  CharResolve.setTalentViewResolver(null);
  const box = { console, Promise, setTimeout, CharResolve, SWRPGPoolMods: PoolMods, SWRPGMods: M, SWRPGUserData: H, SWRPGProjectionDiff: PD,
    ItemResolve: IRes, SWItems, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    qbFetchJson: (url) => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, url), 'utf8'))), speciesPortraitIndexReady: Promise.resolve(null),
    _canonicalRegistriesBase: { weapons: BOOK.weapons, armor: BOOK.armor, gear: BOOK.gear } };
  box.window = box;
  const ctx = vm.createContext(box);
  for (const f of ['lib/shared/itemRegistries.js', 'lib/shared/talentView.js', 'lib/shared/sheetPool.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  await box.SWRPGSheetPool.loadCanonicalCharacterBuild();
  vm.runInContext('window.SWRPGTalentView.register();', ctx);
  const env = { UD: H, M, CR: CharResolve, PD, SP: box.SWRPGSheetPool, IR: box.SWRPGItemRegistries, base: box._canonicalCharbuildBase,
                tellApart: (c, shown) => (shown.some((x) => x.ck !== c.ck && x.name === c.name) ? ['Started …'] : []) };

  const v1copy = U.persistableCopy(box.SWRPGItemRegistries.forStampSync([V1]).weapons[lb.id]);
  const maro = (mods) => {
    const s = clone(PREGEN); if (mods) s.mods = mods.slice();
    s.equipment.weapons.splice(1, 0, { id: sk.id, provenance: [{ note: 'purchased — 75 cr', when: '2026-10-02' }] });
    s.equipment.weapons.splice(2, 0, { _inline: clone(v1copy), provenance: [{ note: 'purchased — 450 cr', when: '2026-10-06' }] });
    s.equipment.gear.push({ id: sv.id, qty: 1, provenance: [{ note: 'purchased — 600 cr', when: '2026-10-02' }] });
    return s;
  };
  const apply = (s, p) => Object.assign({}, s, p);
  const M0 = maro();
  check(!PA.isHeld(M0, env), 'fixture: Maro Jinx is not held on this device');

  // ── A placement ──
  const pA = PA.attachPlan(M0, V2, env);
  check(!pA.refused && same(pA.next, [V2]) && pA.mirror, 'A: Drive Kit attaches as the only stamp; placement equals creation’s layer order', pA.refused || pA.next);
  const s1 = apply(M0, PA.patchFor(pA, M0));
  const pM = PA.attachPlan(s1, MY, env);
  check(same(pM.next, [V2, MY]) && pM.mirror, 'A: My Data (rank 2) lands after the import (rank 0)', pM.next);
  const s2 = apply(s1, PA.patchFor(pM, s1));
  const pH = PA.attachPlan(s2, HR, env);
  check(same(pH.next, [V2, HR, MY]) && pH.mirror, 'A: House Rules (own, rank 1) lands between them; neither existing stamp moved', pH.next);
  const s3 = apply(s2, PA.patchFor(pH, s2));
  const pR = PA.attachPlan(s3, MR, env);
  const exp = H.list().map((r) => r.stamp).filter((s) => [HR, MR].indexOf(s) >= 0);
  check(pR.mirror && same(pR.next.filter((s) => s !== MR), s3.mods) && same(pR.next.filter((s) => [HR, MR].indexOf(s) >= 0), exp),
    'A: within rank 1, Marshal Rework goes by this device’s order; the stamps already there keep their order', { next: pR.next, deviceOrder: exp });

  // ── B the preview, in the frames' words ──
  const wA = PA.previewWords(pA, 'Maro Jinx');
  // copy-voice-sweep-build (D-289): 'Now shows its stats' (census packAttach.js:39:11) and 'Nothing else on … changes.' (:49:33) are cut
  const wantA = ['Add Drive Kit to Maro Jinx?', 'Shock Knuckles — damage +2, crit 4', 'Scrap-Plate Vest — soak 3', 'Changes',
    'Light Blaster Pistol — crit 4 → 3', 'Saved copies', 'Long-Barrel Light Blaster (copy) — use the collection’s version?', 'Copy: damage 6 · Collection: damage 7',
    'Talents and numbers', 'Grit — strain threshold 13 → 14'];
  const gotA = words(wA);
  check(wantA.every((t) => gotA.indexOf(t) >= 0) && gotA.length === wantA.length, 'B: F2-add reads the frames’ words, section for section', gotA);
  check(wA.groups.map((g) => g.h).join('|') === '|Changes|Saved copies|Talents and numbers' && wA.last === null && wA.primary === 'Add' && wA.cancel === 'Cancel' && wA.sub === null,
    'B: sections in the frames’ order; Add · Cancel; no version line on attach');
  const copyRow = wA.groups[2].rows[0];
  check(copyRow.tick === true, 'B: J2 (A) — the saved copy starts TICKED');
  const tickedEq = PA.patchFor(pA, M0).equipment, untickedP = PA.patchFor(pA, M0, [false]);
  check(!!tickedEq && same(tickedEq.weapons[2], { provenance: M0.equipment.weapons[2].provenance, id: lb.id }) && !own(tickedEq.weapons[2], '_inline'),
    'B: a ticked copy swaps {_inline} → {id}, its other keys kept', tickedEq && tickedEq.weapons[2]);
  check(!own(untickedP, 'equipment'), 'B: unticked, the copy is left alone (no equipment in the patch)', Object.keys(untickedP));
  check(same(Object.keys(pA.patch).sort(), ['derivedBonuses', 'derivedConditional', 'mods', 'talents']) && pA.cleanAfter,
    'B: the patch is mods + the three re-projected fields; the patched record re-diffs clean (the preview IS the write)', Object.keys(pA.patch));
  const pE = PA.attachPlan(M0, MY, env), wE = PA.previewWords(pE, 'Maro Jinx');
  // copy-voice-sweep-build (D-289): the empty line is cut (census packAttach.js:50:37)
  check(pE.empty && !wE.groups.length && wE.last === null,
    'B: an empty preview (My Data) still attaches; its empty line is cut (D-289)', wE.last);
  check(same(Object.keys(PA.patchFor(pE, M0)), ['mods']), 'B: the empty preview’s patch is mods alone');

  // ── H B-1162 F1: the swap drops `as` with `_inline` ──
  const svCopy = U.persistableCopy(box.SWRPGItemRegistries.forStampSync([V2]).armor[sv.id]);
  const MH = maro(); MH.equipment.gear = MH.equipment.gear.filter((g) => !(g && g.id === sv.id));
  MH.equipment.gear.push({ _inline: clone(svCopy), as: 'armor', qty: 1, provenance: [{ note: 'purchased — 600 cr', when: '2026-10-02' }] });
  const hi = MH.equipment.gear.length - 1;
  const pHs = PA.attachPlan(MH, V2, env);
  const hcs = (pHs.items && pHs.items.copies) || [], hcopy = hcs.filter((c) => c.id === sv.id)[0];
  const hEq = hcopy ? PA.patchFor(pHs, MH, hcs.map(() => true)).equipment : null;
  const hg = hEq && hEq.gear[hi];
  check(!!hcopy && !!hg && hg.id === sv.id && !own(hg, '_inline') && !own(hg, 'as') && hg.qty === 1 && same(hg.provenance, MH.equipment.gear[hi].provenance),
    'H: B-1162 F1 — a held { _inline, as: "armor" } suit, its collection attached, swaps to { id, qty, provenance } with no `as`', hg);

  // ── C update ──
  const m1 = apply(maro(), PA.patchFor(PA.attachPlan(maro(), V1, env), maro()));   // Maro after adding Drive Kit at v1, copy ticked
  const m1b = apply(m1, PA.patchFor(PA.attachPlan(m1, MY, env), m1));               // …and My Data after it
  const ups = PA.updates(m1b, env);
  check(ups.length === 1 && ups[0].from === V1 && ups[0].to === V2, 'C: Update available — the device holds a newer import of the pin', ups);
  const pU = PA.attachPlan(m1b, V2, env, 'update'), wU = PA.previewWords(pU, 'Maro Jinx');
  check(same(pU.next, [V2, MY]) && pU.next.indexOf(V2) === m1b.mods.indexOf(V1), 'C: the pin is replaced IN ITS SLOT; the other stamp untouched', pU.next);
  check(wU.title === 'Update Drive Kit on Maro Jinx?' && wU.sub === 'version ' + v1.slice(0, 6) + ' → ' + v2.slice(0, 6) && wU.primary === 'Update'
    && words(wU).indexOf('Long-Barrel Light Blaster — damage 6 → 7') >= 0, 'C: the update preview: title, version line, Long-Barrel damage 6 → 7', words(wU));
  check(PA.updates(apply(m1b, PA.patchFor(pU, m1b)), env).length === 0, 'C: after the update, no Update available');

  // ── D refusals ──
  const heldS = Object.assign(clone(m1), { mods: m1.mods.concat(['user:old_campaign#0a1b2c3d4e5f']) });
  const heldPlan = (() => { try { return PA.attachPlan(heldS, MY, env); } catch (e) { return { threw: String(e).slice(0, 120) }; } })();
  check(PA.isHeld(heldS, env) && heldPlan.refused === 'held', 'D: a held sheet is refused (its preview could not be true)', heldPlan.refused || heldPlan.threw || 'planned');
  check(PA.attachPlan(m1, V2, env).refused === 'replace', 'D: the same packId under another version is refused — H2’s REPLACE');
  check(PA.attachPlan(s1, V2, env).refused === 'carried', 'D: a carried stamp is refused');
  check(PA.lineNames(heldS, env, true).join(' · ') === 'Drive Kit', 'D: a held sheet’s line names only what this device resolves (R-H1F-3)', PA.lineNames(heldS, env, true));

  // ── E the list and the offer ──
  const cands = PA.candidates(s1, env);
  check(!cands.some((c) => c.packId === 'blank') && H.list().some((r) => r.packId === 'blank' && r.records === 0), 'E: a 0-record collection is not offered (R-H1F-2)');
  const dk = cands.filter((c) => c.packId === 'drive_kit')[0];
  check(dk && dk.refuse === 'Already on this character' && dk.meta === 'imported · 3 weapons, 1 armor, 1 talent', 'E: Drive Kit’s row on a character carrying it', dk);
  check(cands.filter((c) => !c.refuse).map((c) => c.name).sort().join('|') === 'House Rules|Marshal Rework|My Data', 'E: the others are offered', cands.map((c) => [c.name, c.refuse]));
  const offer0 = PA.offerFor(M0, env, {}, false);
  check(offer0.length > 0, 'E: J3 — an older character on a device with active collections it lacks gets the offer', offer0.map((c) => c.name));
  await H.setActive(row('house_rules').ck, false);
  const offerOff = PA.offerFor(M0, env, {}, false), listOff = PA.candidates(M0, env);
  check(!offerOff.some((c) => c.packId === 'house_rules') && listOff.some((c) => c.packId === 'house_rules' && !c.refuse),
    'E: R-H1BP-2 — a collection switched OFF raises no offer, but is listed under + Add homebrew');
  const seen = {}; offerOff.forEach((c) => { seen[PA.seenKey(M0, c.ck)] = 1; });
  check(PA.offerFor(M0, env, seen, false).length === 0, 'E: Not now (every offered row remembered by name|ck) puts the offer away');
  await H.setActive(row('house_rules').ck, true);
  const back = PA.offerFor(M0, env, seen, false);
  check(back.length === 1 && back[0].packId === 'house_rules', 'E: a collection newly active and unseen raises it again', back.map((c) => c.name));
  check(PA.offerFor(heldS, env, {}, true).length === 0, 'E: never on a held sheet');

  // ── F R-H1B-3, B-1180 ──
  const pT = PA.attachPlan(maro(), MR, env), wT = PA.previewWords(pT, 'Maro Jinx');
  const tw = words(wT);
  check(pT.held.length === 1 && pT.held[0].key === 'strainThreshold' && pT.held[0].computed === 12 && pT.held[0].held === 13, 'F: derivedFloorHeld names strain {12, 13} on B-1180’s fixture', pT.held);
  check(tw.indexOf('Strain threshold stays 13. With Marshal Rework it would be 12, but this character’s older saved number holds it.') >= 0
    && tw.indexOf('Wound threshold 12 → 14') >= 0 && tw.indexOf('Your Marshal tree changes: 1 talent is different') >= 0 && wT.last === null,   // the last line is cut (D-289, packAttach.js:49:33)
    'F: the preview reads the frames’ tree lines plus R-H1B-3’s held line, in the card’s words', tw);
  check(pA.held.length === 0, 'F: no held line where no floor binds (Drive Kit: 13 → 14 rises past it)');

  // ── G undo ──
  const before = JSON.stringify(M0), patch = PA.patchFor(pA, M0), undo = PA.undoFor(M0, patch);
  const restored = PA.restore(apply(M0, patch), undo);
  check(JSON.stringify(restored) === before, 'G: Undo restores the record byte for byte');
  const bare = clone(M0); delete bare.mods; delete bare.derivedConditional;
  const pB = PA.attachPlan(bare, V2, env), patchB = PA.patchFor(pB, bare);
  check(JSON.stringify(PA.restore(apply(bare, patchB), PA.undoFor(bare, patchB))) === JSON.stringify(bare), 'G: …including keys the record did not have (removed, not left empty)');

  CharResolve.setTalentViewResolver(null);
  console.log('\n' + (rows - failures) + '/' + rows + (failures ? ' — FAILED' : ' ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('  FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });

function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
