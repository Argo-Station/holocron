#!/usr/bin/env node
/**
 * homebrew_pack_detach.cjs — STANDING guard for HOMEBREW H2's acts in `lib/shared/packAttach.js`: remove a collection,
 * the held sheet's way out, swap in this device's My Data (card `homebrew-h2-build-card` §5 ACCEPTANCE, R-H2B-3/-4;
 * contract `homebrew-h2-contract` R-H2K-1..8; frames ruling R-H2F-1/-3/-4/-7; frames Docs/mockups/homebrew-h2.html
 * @ f12904390, D-118).
 *
 * Driven, not read: the player's page in a node vm, as test/homebrew_pack_attach.cjs builds it, over the frames' own
 * devices, built through the store's writing verbs as scripts/homebrew_h2_frames.py's DEVICE builds them:
 *   MAIN   My Data (Tuned Blaster Pistol) · House Rules (Toughened's text) · Drive Kit, a friend's share file imported
 *          here (H1's records + Rig It, Drive Mechanic holding Rig It at 0-0, Kit Sense) · Marshal Rework (H1's swap)
 *   HELD   the same collections made HERE (Drive Kit own), then Drive Kit and House Rules removed by removePack
 *   OTHER  another device's My Data (Scoped Holdout; the book's Light Blaster Pistol damage 6; Grit +2), received here
 *          beside this device's own My Data (Tuned Blaster Pistol; Light Blaster Pistol damage 7), then removed
 *   Maro Jinx — the Colonist pregen + H1's three entries, Drive Kit and My Data ADDED by the shipped attach (the copy
 *   ticked), then Drive Mechanic bought at 0-0 projected as the buy writes it (MAKE). Maro (Force) also owns Kit Sense.
 *
 * Every number below is a LITERAL quoted from the frames gate @ f4846897 (R-H2B-4), never re-derived here:
 *   F6 Light Blaster Pistol crit 3 → 4; Shock Knuckles, Long-Barrel Light Blaster, Scrap-Plate Vest unknown; Strain
 *   threshold 14 → 13, soak 4 → 3; talents [grit, rig_it] · F6-tree "Your Marshal tree changes: 1 talent is different",
 *   Wound threshold 14 → 12 · F7 the counts · F8 damage 6 → 7, Scoped Holdout unknown, strain 14 → 13 · F8-held damage
 *   5 → 7 · F9 force power Kit Sense · F10-replaced LBP damage 7.
 *
 *   A detach of a present collection: sections, words, numbers, the R-H2F-1 writer, the patch, the mirror, re-diff clean
 *   B the empty detach (R-H2F-4) · the tree detach · the cross-device line iff signed in (J1 (A))
 *   C the guard (R-H2F-3): a true variant B's Force power refused with its ref (F9's words); F9 itself offered since B-1190
 *     (R-M9B-13), its preview naming Kit Sense; the last-stamp case (a homebrew talent owned); a missing-kind refusal on a
 *     true variant B's way out; a held sheet's detach refused
 *   D the held way out, one missing and two (counts; "Buying works again." iff the after hold is null)
 *   E replace: in slot; known → unknown; a same-key different record named both sides; on a held sheet only when the
 *     replaced stamp is the ONLY missing one; the way-out rows
 *   F Undo restores the record byte for byte, for each act; the after-lines
 *
 * THE BITE: on the pre-change module (packAttach.js @ f6f04008) the file exits 1 — no H2 mode exists. Run:
 *   node test/homebrew_pack_detach.cjs
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
// F-100 M10 (f100-m10-build-card R-M10B-3): a canonical power's upgrade rows name ITS id (V1's key, V4's value), which the
// validator refuses on a power with another id — an own power copies the tree and text, never the rows.
const noRows = (r) => Object.values(r.abilities || {}).forEach((a) => ['pool_mods', 'roll_numbers', 'effects', 'told'].forEach((k) => { delete a[k]; }));
function check(ok, msg, detail) {
  rows += 1;
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : '')); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const BOOK = {}; PV.APPLIED_SECTIONS.forEach((sec) => { BOOK[sec] = canon(sec + '.json')[sec]; });
const VOCAB = { skills: canon('skills.vocab.json').entries.map((e) => e.id), qualities: canon('qualities.vocab.json').entries.map((e) => e.id) };
const PREGEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters.filter((c) => c.id === 'colonist')[0];
const WHO = 'Maro Jinx';
const words = (pay) => [pay.title].concat(pay.sub ? [].concat(pay.sub) : [], pay.lead ? [pay.lead] : [],
  pay.groups.reduce((a, g) => a.concat(g.h ? [g.h] : [], g.rows.map((r) => r.t)), []), pay.cross ? [pay.cross] : [], pay.last ? [pay.last] : []);
const OTHER_STARTED = '2026-10-03T09:00:00.000Z';   // AUTHORED (H1's frames): the other device's My Data start date

(async function main() {
  console.log('homebrew_pack_detach — H2’s remove, way out and swap on the frames’ devices (R-H2B-3/-4, R-H2K-3..8, R-H2F-1/-3/-4/-7)');
  let PA = null;
  try { PA = require(path.join(ROOT, 'lib/shared/packAttach.js')); } catch (e) { check(false, 'lib/shared/packAttach.js loads', String(e).slice(0, 200)); }
  if (!PA || typeof PA.attachPlan !== 'function') { console.log('\n' + (rows - failures) + '/' + rows + ' — FAILED'); process.exit(1); }
  const probe = PA.attachPlan(clone(PREGEN), null, { M, UD: { missingFor: () => [], list: () => [] } }, 'missing');
  if (!probe || probe.refused !== 'none-missing' || typeof PA.refusalWords !== 'function') {
    check(false, 'packAttach has H2’s modes (attachPlan … "missing" refuses a sheet with nothing missing) and refusalWords', probe);
    console.log('\n' + (rows - failures) + '/' + rows + ' — FAILED'); process.exit(1);
  }

  // ── the page (one vm; the store it reads is switched per device) ──
  const box = { console, Promise, setTimeout, CharResolve, SWRPGPoolMods: PoolMods, SWRPGMods: M, SWRPGUserData: null, SWRPGProjectionDiff: PD,
    ItemResolve: IRes, SWItems, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    qbFetchJson: (url) => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, url), 'utf8'))), speciesPortraitIndexReady: Promise.resolve(null),
    _canonicalRegistriesBase: { weapons: BOOK.weapons, armor: BOOK.armor, gear: BOOK.gear } };
  box.window = box;
  const ctx = vm.createContext(box);
  for (const f of ['lib/shared/itemRegistries.js', 'lib/shared/talentView.js', 'lib/shared/sheetPool.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  await box.SWRPGSheetPool.loadCanonicalCharacterBuild();
  vm.runInContext('window.SWRPGTalentView.register();', ctx);
  CharResolve.setTalentViewResolver(null);
  const C = box._canonicalCharbuildBase, B = box._canonicalRegistriesBase;
  const tellApart = (c, shown) => (shown.some((x) => x.ck !== c.ck && x.name === c.name) ? ['Started …'] : []);
  const envOf = (H, o) => Object.assign({ UD: H, M, CR: CharResolve, PD, SP: box.SWRPGSheetPool, IR: box.SWRPGItemRegistries, base: C, tellApart }, o || {});
  const use = (H) => { M.useUserPacks(H); box.SWRPGUserData = H; return envOf(H); };
  const got = (r, what) => { if (!r || !r.ok) throw new Error(what + ': ' + JSON.stringify(r && (r.reasons || r.reason || r))); return r; };
  const nw = (base, name, f) => { const r = clone(base); r.name = name; delete r.id; if (f) f(r); return r; };
  const newStore = async () => { const H = U.createStore({ adapter: U.memoryAdapter(), schemas: PV.readSchemaDir(path.join(ROOT, 'schema')), vocab: VOCAB, base: BOOK }); await H.ready(); return H; };

  // THE DEVICE — scripts/homebrew_h2_frames.py DEVICE, verb for verb
  async function device(H, o) {
    const ids = {};
    got(await H.saveRecord('my_data', 'weapons', nw(B.weapons.blaster_pistol, 'Tuned Blaster Pistol', (r) => { r.damage = { value: B.weapons.blaster_pistol.damage.value + 1, base: 'flat' }; }),
      { from: 'blaster_pistol', create: true, mint: true }), 'my data');
    if (o.lbpMine) { const c = clone(B.weapons.light_blaster_pistol); c.damage = { value: o.lbpMine, base: 'flat' }; got(await H.saveRecord('my_data', 'weapons', c), 'my data lbp'); }
    if (o.onlyMyData) return { ids };
    got(await H.createPack({ packId: 'house_rules', name: 'House Rules' }), 'house rules');
    const tg = clone(C.talents.toughened); tg.description = C.talents.toughened.description + ' At our table it also covers a long march.';
    got(await H.saveRecord('house_rules', 'talents', tg), 'house rules toughened');
    got(await H.createPack({ packId: 'drive_kit', name: 'Drive Kit' }), 'drive kit');
    const lbp = B.weapons.light_blaster_pistol, bk = B.weapons.brass_knuckles, pa = B.armor.padded_armor;
    ids.longBarrel = got(await H.saveRecord('drive_kit', 'weapons', nw(lbp, 'Long-Barrel Light Blaster', (r) => { r.damage = { value: lbp.damage.value + 2, base: 'flat' }; }),
      { from: 'light_blaster_pistol', create: true, mint: true }), 'long barrel').id;
    ids.shockKnuckles = got(await H.saveRecord('drive_kit', 'weapons', nw(bk, 'Shock Knuckles', (r) => { r.damage = clone(bk.damage); r.damage.value = (bk.damage.value || 0) + 1; r.crit = 4; }),
      { from: 'brass_knuckles', create: true, mint: true }), 'shock knuckles').id;
    ids.scrapVest = got(await H.saveRecord('drive_kit', 'armor', nw(pa, 'Scrap-Plate Vest', (r) => { r.soak = pa.soak + 1; }),
      { from: 'padded_armor', create: true, mint: true }), 'scrap vest').id;
    const lbpC = clone(lbp); lbpC.crit = lbp.crit - 1; got(await H.saveRecord('drive_kit', 'weapons', lbpC), 'lbp change');
    const gr = clone(C.talents.grit); gr.effects = clone(C.talents.grit.effects); gr.effects[0].amount = 2; got(await H.saveRecord('drive_kit', 'talents', gr), 'grit change');
    ids.rigIt = got(await H.saveRecord('drive_kit', 'talents', nw(C.talents.enduring, 'Rig It'), { from: 'enduring', create: true, mint: true }), 'rig it').id;
    const dm = nw(C.specializations.marshal, 'Drive Mechanic', (r) => { r.talent_tree[0].talents[0].talent = ids.rigIt; });
    ids.driveMechanic = got(await H.saveRecord('drive_kit', 'specializations', dm, { from: 'marshal', create: true, mint: true }), 'drive mechanic').id;
    ids.kitSense = got(await H.saveRecord('drive_kit', 'force_powers', nw(C.forcePowers.sense, 'Kit Sense', noRows), { from: 'sense', create: true, mint: true }), 'kit sense').id;
    if (o.importDrive) {
      const share = got(await H.exportShare('drive_kit'), 'share').text;
      got(await H.removePack('drive_kit'), 'remove friend copy');
      got(await H.importPack(share), 'import');
    }
    if (o.marshalRework) {
      got(await H.createPack({ packId: 'marshal_rework', name: 'Marshal Rework' }), 'marshal rework');
      const m = clone(C.specializations.marshal), r0 = m.talent_tree[0].talents, a = r0[1].talent; r0[1].talent = r0[3].talent; r0[3].talent = a;
      got(await H.saveRecord('marshal_rework', 'specializations', m), 'marshal rework tree');
    }
    const dk = H.list().filter((x) => x.packId === 'drive_kit')[0];
    const copy = U.persistableCopy(box.SWRPGItemRegistries.forStampSync([dk.stamp]).weapons[ids.longBarrel]);
    return { ids, copy };
  }
  // H1's maro() (scripts/homebrew_h1_frames.py) and H2's MAKE: the shipped attach in order, then the bought spec projected
  const maro = (ids, copy, extra) => {
    const s = clone(PREGEN);
    if (extra !== false && ids) {
      s.equipment.weapons.splice(1, 0, { id: ids.shockKnuckles, provenance: [{ note: 'purchased — 75 cr', when: '2026-10-02' }] });
      s.equipment.weapons.splice(2, 0, { _inline: clone(copy), provenance: [{ note: 'purchased — 450 cr', when: '2026-10-06' }] });
      s.equipment.gear.push({ id: ids.scrapVest, qty: 1, provenance: [{ note: 'purchased — 600 cr', when: '2026-10-02' }] });
    }
    return s;
  };
  const make = (env, sheet, stamps, buy, powers) => {
    let s = clone(sheet);
    for (const st of stamps) {
      const p = PA.attachPlan(s, st, Object.assign({}, env, { held: false }), 'attach');
      if (p.refused) throw new Error('attach refused ' + st + ': ' + p.refused);
      s = Object.assign({}, s, PA.patchFor(p, s, null));
    }
    if (buy) {
      s.specializations = (s.specializations || []).concat([{ id: buy.spec, owned: buy.owned }]);
      const view = CharResolve.stampTalentView(s, env.base, env.M, env.UD), pr = PD.projectSheet(s, view);
      s.talents = pr.talents; s.derivedBonuses = pr.derivedBonuses; s.derivedConditional = pr.derivedConditional;
    }
    if (powers) s.forcePowers = powers.map((id) => ({ id: id }));
    return s;
  };
  const apply = (s, p) => Object.assign({}, s, p);
  const patchKeysOk = (p) => Object.keys(p.patch).every((k) => ['mods', 'talents', 'derivedBonuses', 'derivedConditional'].indexOf(k) >= 0) && !own(p.patch, 'equipment');
  const undoExact = (s, p, ticks) => { const patch = PA.patchFor(p, s, ticks), before = JSON.stringify(s); return JSON.stringify(PA.restore(apply(s, patch), PA.undoFor(s, patch))) === before; };

  // ════ MAIN ════
  const H = await newStore(); let env = use(H);
  const dev = await device(H, { importDrive: true, marshalRework: true });
  const st = {}; H.list().forEach((r) => { st[r.packId] = r.stamp; });
  const DK = st.drive_kit, MY = st.my_data, MR = st.marshal_rework, ids = dev.ids;
  const buy = { spec: ids.driveMechanic, owned: ['0-0'] };
  const MARO = make(env, maro(ids, dev.copy), [DK, MY], buy);
  const FORCE = make(env, maro(ids, dev.copy), [DK, MY], buy, [ids.kitSense]);
  const TREE = make(env, maro(null, null, false), [MR]);
  check(same(MARO.mods, [DK, MY]) && MARO.talents.some((t) => t.id === ids.rigIt) && !PA.isHeld(MARO, env),
    'fixture: Maro carries Drive Kit · My Data, owns Rig It through Drive Mechanic 0-0, and is not held', { mods: MARO.mods, talents: MARO.talents });

  // ── A detach Drive Kit (F6) ──
  const pD = PA.attachPlan(MARO, DK, env, 'detach'), wD = PA.previewWords(pD, WHO);
  check(!pD.refused && pD.hold1 === null && same(pD.next, [MY]) && same(pD.gone, [DK]), 'A: Remove Drive Kit is offered; the after hold is null; only that stamp goes', { refused: pD.refused, hold1: pD.hold1, next: pD.next });
  // copy-voice-sweep-build (D-289): 'Goes back to the book' (census packAttach.js:59:12) and the last line (:49:33) are cut
  const wantD = ['Remove Drive Kit from Maro Jinx?', 'Light Blaster Pistol — crit 3 → 4', 'Shows as unknown',
    'Shock Knuckles — shows as unknown', 'Long-Barrel Light Blaster — shows as unknown', 'Scrap-Plate Vest — shows as unknown', 'Talents and numbers',
    'Drive Mechanic — specialization goes away; talents bought in it stay.', 'Rig It — does nothing now', 'Strain threshold 14 → 13, soak 4 → 3'];
  check(same(words(wD), wantD), 'A: F6 reads the frames’ words, section for section and in order (signed out: no cross line)', words(wD));
  check(wD.primary === 'Remove' && wD.cancel === 'Cancel' && wD.cross === null && wD.lead === null, 'A: Remove · Cancel; signed out, no cross-device line (F6-signedout)');
  const strain = pD.numbers.filter((n) => n.key === 'strainThreshold')[0], soak = pD.numbers.filter((n) => n.key === 'soak')[0];
  check(strain && strain.from === 14 && strain.to === 13 && soak && soak.from === 4 && soak.to === 3, 'A: numbers — strain 14 → 13, soak 4 → 3 (the frames gate’s literals)', pD.numbers);
  check(same(pD.patch.talents.map((t) => t.id), ['grit', ids.rigIt]) && /_rig_it_/.test(ids.rigIt),
    'A: R-H2F-1 — the patch writes talents [grit, rig_it] (talentsKeepingAbsentTrees; H1’s projection would drop rig_it)', { patch: pD.patch.talents, rendered: pD.writers.rendered });
  check(!pD.writers.rendered.some((t) => t.id === ids.rigIt), 'A: …and that is a real difference: d.rendered would write ' + JSON.stringify(pD.writers.rendered.map((t) => t.id)));
  check(patchKeysOk(pD) && same(Object.keys(pD.patch).sort(), ['derivedBonuses', 'derivedConditional', 'mods', 'talents']),
    'A: the patch is mods + the three projections; equipment is never in it (R-H2K-1)', Object.keys(pD.patch));
  check(!own(PA.patchFor(pD, MARO), 'equipment'), 'A: patchFor adds no equipment on a detach (copies are a replace’s only)');
  check(pD.cleanAfter && pD.mirror, 'A: the patched record re-diffs clean but for the absent tree’s kept talents; the remaining order is creation’s');
  check(pD.items.copies.length === 0 && pD.items.nowShows.length === 0 && pD.held.length === 0, 'A: no saved copy, nothing turns known, no held line (no floor binds here)');
  const wDin = PA.previewWords(PA.attachPlan(MARO, DK, Object.assign({}, env, { signedIn: true }), 'detach'), WHO);
  const tail = words(wDin).slice(-1);   // the last line is cut (D-289, census packAttach.js:49:33): the cross-device line closes it
  check(same(tail, ['This changes Maro Jinx on every device you’re signed in on.']) && wDin.last === null, 'A: signed in, the cross-device line closes the preview (J1 (A); the last line cut, D-289)', tail);
  const after = apply(MARO, PA.patchFor(pD, MARO));
  check(!PA.isHeld(after, env) && same(PA.lineNames(after, env, false), ['My Data']), 'A: after the write, not held; the line names My Data');

  // R-H2K-3 / R-H1B-3: the held line where the legacy floor holds — Maro's older saved strain (14, a record from before
  // the floor's premise) holds the number the detach would lower; ruling homebrew-h2-build-readings R-H2R-3: a removal
  // says "Without <c>"
  const FLOOR = Object.assign(clone(MARO), { derived: Object.assign({}, MARO.derived || {}, { strainThreshold: 14 }) });
  const pFl = PA.attachPlan(FLOOR, DK, env, 'detach'), wFl = words(PA.previewWords(pFl, WHO));
  check(pFl.held.length === 1 && pFl.held[0].key === 'strainThreshold' && pFl.held[0].computed === 13 && pFl.held[0].held === 14
    && wFl.indexOf('Strain threshold stays 14. Without Drive Kit it would be 13, but this character’s older saved number holds it.') >= 0
    && !wFl.some((t) => t.indexOf('. With ') >= 0)
    && !pFl.numbers.some((n) => n.key === 'strainThreshold'), 'A: the held line where the floor holds (derivedFloorHeld {13, 14}) reads “Without Drive Kit” (R-H2R-3); strain is not a moving number', { held: pFl.held, words: wFl });

  // ── B the empty detach (R-H2F-4) and the tree detach ──
  const pE = PA.attachPlan(MARO, MY, Object.assign({}, env, { signedIn: true }), 'detach'), wE = PA.previewWords(pE, WHO);
  // copy-voice-sweep-build (D-289): R-H2F-4's empty line is cut (census packAttach.js:64:43)
  check(pE.empty && same(words(wE), ['Remove My Data from Maro Jinx?',
    'This changes Maro Jinx on every device you’re signed in on.']) && wE.last === null && wE.lead === null && wE.primary === 'Remove', 'B: F6-empty — My Data changes nothing on Maro: the title, cross line, Remove (the empty line cut, D-289)', words(wE));
  check(same(Object.keys(pE.patch), ['mods']), 'B: the empty detach’s patch is mods alone', Object.keys(pE.patch));
  const pT = PA.attachPlan(TREE, MR, env, 'detach'), wT = words(PA.previewWords(pT, WHO));
  check(!pT.refused && wT.indexOf('Your Marshal tree changes: 1 talent is different') >= 0 && wT.some((t) => /^Wound threshold 14 → 12/.test(t)) && wT[0] === 'Remove Marshal Rework from Maro Jinx?',
    'B: F6-tree — “Your Marshal tree changes: 1 talent is different”; Wound threshold 14 → 12', wT);
  check(pT.cleanAfter && patchKeysOk(pT), 'B: the tree detach re-diffs clean; mods + projections only');

  // ── C the guard (R-H2F-3) ──
  // RE-POINTED at B-1190 (ruling f100-m9-build-card ADDENDUM 5 R-M9B-13, as amended by ADDENDUM 6 R-M9B-14; instrument
  // norm 3). R-H2K-6: "This holds until F-100 fixes B-1190. The guard reads `sheetHold`'s refs on the after-state: a
  // variant-B result refuses." Lap f100-m9-editor is that fix (charResolve.js C5_RELEASED now releases a species, career and
  // Force power), so F9's after-state is no longer variant B. R-M9B-14: until H2's preview can name such a loss (B-1203), the
  // guard ALSO refuses an after-state where C5.2 releases a species, career or Force power THIS act removes, reading the
  // one core's pair `sheetDeletedRefs` on the same after-state.
  //   KEPT    — F9 is refused, with its ref (force power Kit Sense) and R-H2K-6's present words, word for word; a TRUE
  //             variant B (Drive Kit the ONLY collection) still refuses, present and missing.
  //   MOVED   — the reason F9 refuses: the released-kind reading (hold1 null), not variant B (hold1 'B').
  //   ADDED   — a talent-only detach is still offered and its losses listed (R-M9B-14); a Force power deleted BEFORE the
  //             act does not lock an unrelated removal (this lap's reading of "leaves", disclosed in the gate).
  //   DROPPED — "sheetHold on the after-state is variant B" for F9, and R-M9B-13's preview leg (replaced by R-M9B-14).
  // RE-POINTED again (RULING-MOVED: DECISIONS D-411 items 7–9 @ f7f6b80a4, B-1203; ruling release-r7-bug-burndown ADDENDUM
  // 293). R-M9B-14's refusal is retired: the preview now names the lost Force power in the talent row's wording.
  //   KEPT    — F9's after-state is not variant B (hold1 null); a TRUE variant B still refuses, present and missing (below).
  //   MOVED   — F9 is OFFERED, its preview naming "Kit Sense — does nothing now" (was: refused, R-H2K-6's present words).
  //   DROPPED — F9's refusal ref and R-H2K-6's present words for F9.
  const pF = PA.attachPlan(FORCE, DK, env, 'detach'), wF = words(PA.previewWords(pF, WHO));
  check(!pF.refused && pF.hold1 === null && pF.lost.powers.length === 1 && pF.lost.powers[0].id === ids.kitSense && pF.lost.powers[0].name === 'Kit Sense',
    'C: F9 — Remove Drive Kit from Maro (Force) is offered, not variant B; the plan names the lost Force power Kit Sense (D-411 items 7–9, B-1203)', { refused: pF.refused, hold1: pF.hold1, lost: pF.lost });
  check(wF.indexOf('Kit Sense — does nothing now') >= 0, 'C: F9’s preview names it in the talent row’s wording (D-411 item 7)', wF);
  check(!pD.refused && words(wD).indexOf('Rig It — does nothing now') >= 0 && words(wD).indexOf('Drive Mechanic — specialization goes away; talents bought in it stay.') >= 0,
    'C: a talent-only detach (Maro without Kit Sense) is still offered, its lost talent and specialization listed (R-M9B-14)', { refused: pD.refused });
  const FORCE1 = make(env, maro(null, null, false), [DK], null, [ids.kitSense]);
  const pFB = PA.attachPlan(FORCE1, DK, env, 'detach');
  check(pFB.refused === 'would-hold' && pFB.hold1 === 'B' && pFB.refs[0].kind === 'force power' && pFB.refs[0].name === 'Kit Sense',
    'C: a TRUE variant B still refuses — Remove Drive Kit, the only collection, from Maro (Force): ref force power Kit Sense (R-H2K-6, R-H2F-3)', { refused: pFB.refused, hold1: pFB.hold1, refs: pFB.refs });
  check(PA.refusalWords(pFB, WHO) === 'Drive Kit gives Maro Jinx’s Force power Kit Sense, so it can’t be removed yet.', 'C: …in F9’s words (R-H2K-6, present)', PA.refusalWords(pFB, WHO));
  // ADDED (this lap's reading of R-M9B-14's "leaves"): a Force power deleted from My Data BEFORE the act is not Drive Kit's
  // to give, so removing Drive Kit is still offered (the sheet already shows F5's notice for it).
  const oldSense = got(await H.saveRecord('my_data', 'force_powers', nw(C.forcePowers.sense, 'Old Sense', noRows), { from: 'sense', create: true, mint: true }), 'old sense').id;
  const PRE = make(env, maro(null, null, false), [DK, MY], null, [oldSense]);
  got(await H.deleteRecord('my_data', 'force_powers', oldSense), 'delete old sense');
  const pPre = PA.attachPlan(PRE, DK, env, 'detach');
  check(!pPre.refused && pPre.hold1 === null && CharResolve.sheetDeletedRefs(PRE, box.SWRPGTalentView.sheetTalentView(PRE), H.missingFor(PRE.mods), true).some((r) => r.id === oldSense),
    'C: a Force power deleted BEFORE the act (Old Sense, already released) does not refuse an unrelated removal of Drive Kit (R-M9B-14, only what this act releases)', { refused: pPre.refused, refs: pPre.refs });
  const LAST = make(env, maro(ids, dev.copy), [DK], buy);
  const pL = PA.attachPlan(LAST, DK, env, 'detach');
  check(pL.refused === 'would-hold' && pL.refs.some((r) => r.kind === 'talent' && r.id === ids.rigIt),
    'C: the last-stamp case — removing the only collection while its talent is owned is variant B (C5.2 needs a present stamp), refused', { refused: pL.refused, refs: pL.refs });
  check(/^Drive Kit gives Maro Jinx’s (talent Rig It|specialization Drive Mechanic), so it can’t be removed yet\.$/.test(PA.refusalWords(pL, WHO)), 'C: …its row names the kind (R-H2F-3)', PA.refusalWords(pL, WHO));

  // ── E replace, on this device's own two My Datas ──
  const O = await newStore(); env = use(O);
  got(await O.saveRecord('my_data', 'weapons', nw(B.weapons.holdout_blaster, 'Scoped Holdout'), { from: 'holdout_blaster', create: true, mint: true }), 'scoped');
  const scoped = Object.keys(O.get('my_data').pack.sections.weapons).filter((k) => O.get('my_data').pack.sections.weapons[k].name === 'Scoped Holdout')[0];
  { const l = clone(B.weapons.light_blaster_pistol); l.damage = { value: B.weapons.light_blaster_pistol.damage.value + 1, base: 'flat' }; got(await O.saveRecord('my_data', 'weapons', l), 'lbp 6'); }
  { const g = clone(C.talents.grit); g.effects = clone(C.talents.grit.effects); g.effects[0].amount = 2; got(await O.saveRecord('my_data', 'talents', g), 'grit'); }
  const otherPack = clone(O.get('my_data').pack); otherPack.createdAt = OTHER_STARTED;
  const OTHER = O.list().filter((x) => x.home)[0].stamp;
  const T = await newStore(); env = use(T);
  await device(T, { onlyMyData: true, lbpMine: 7 });
  const MINE = T.list().filter((x) => x.home)[0].stamp;
  check(got(await T.receiveOwn(otherPack), 'receive').ok && OTHER !== MINE && T.missingFor([OTHER]).length === 0, 'E: fixture — the other device’s My Data is kept beside this one');
  const base = maro(null, null, false); base.equipment.weapons.splice(1, 0, { id: scoped, provenance: [{ note: 'purchased — 400 cr', when: '2026-10-04' }] });
  const MO = make(env, base, [OTHER]);
  const cands = PA.candidates(MO, env), mineRow = cands.filter((c) => c.stamp === MINE)[0];
  check(mineRow && mineRow.refuse === 'This character uses your other My Data', 'E: H1’s list refuses this device’s My Data with W.otherMy — the replace door', mineRow);
  const pR = PA.attachPlan(MO, MINE, env, 'replace'), wR = PA.previewWords(pR, WHO);
  const seenR = PA.seenOnCommit(pR, MO, env);   // R-H2R-1, read while this device still keeps the replaced (other) My Data
  check(!pR.refused && same(pR.next, [MINE]) && pR.next.indexOf(MINE) === MO.mods.indexOf(OTHER) && pR.old === OTHER, 'E: replace — the new stamp takes the old one’s slot', { next: pR.next, refused: pR.refused });
  const wantR = ['Use this My Data on Maro Jinx instead?', 'Started …', 'Changes', 'Light Blaster Pistol — this My Data’s Light Blaster Pistol: damage 6 → 7',
    'Shows as unknown', 'Scoped Holdout — shows as unknown', 'Talents and numbers', 'Strain threshold 14 → 13'];   // the last line cut (D-289, census packAttach.js:49:33)
  check(same(words(wR), wantR) && wR.primary === 'Use this one instead', 'E: F8 — tell-apart, same-key different record named both sides, known → unknown, strain 14 → 13', words(wR));
  check(patchKeysOk(pR) && pR.cleanAfter && pR.mirror && pR.hold1 === null, 'E: the replace patch is mods + projections; re-diffs clean; mirror');
  const MOr = apply(MO, PA.patchFor(pR, MO));
  const damageOf = (w) => (w && w.damage && typeof w.damage === 'object') ? w.damage.value : (w && w.damage);
  const lbpAt = MO.equipment.weapons.findIndex((w) => (w && w.id) === 'light_blaster_pistol' || w === 'light_blaster_pistol');
  const lbpAfter = box.SWRPGSheetPool.resolveSheetEquipment(MOr.equipment, MOr).weapons[lbpAt];
  check(lbpAt >= 0 && lbpAfter && lbpAfter.name === 'Light Blaster Pistol' && damageOf(lbpAfter) === 7 && same(MOr.equipment, MO.equipment),
    'E: F10-replaced — the re-resolved Light Blaster Pistol reads damage 7 in its own slot; equipment untouched', lbpAfter && { name: lbpAfter.name, damage: lbpAfter.damage });
  // the slot, where it shows: a saved order with the replaced stamp FIRST (another collection after it) keeps that order
  got(await T.createPack({ packId: 'house_rules', name: 'House Rules' }), 'house rules');
  { const tg = clone(C.talents.toughened); tg.description += ' At our table it also covers a long march.'; got(await T.saveRecord('house_rules', 'talents', tg), 'hr toughened'); }
  const HRT = T.list().filter((x) => x.packId === 'house_rules')[0].stamp;
  const MO3 = Object.assign(clone(MO), { mods: [OTHER, HRT] }), pR3 = PA.attachPlan(MO3, MINE, env, 'replace');
  check(!pR3.refused && same(pR3.next, [MINE, HRT]), 'E: replace keeps the SLOT — [other My Data, House Rules] → [this My Data, House Rules]; nothing else moves', pR3.refused || pR3.next);
  // the held state: the other device's My Data removed here
  got(await T.removePack(T.list().filter((x) => x.packId === 'my_data' && !x.home)[0].ck), 'remove other');
  check(PA.isHeld(MO, env) && same(T.missingFor(MO.mods), [OTHER]), 'E: fixture — Maro (other) is held: its only stamp is missing here');
  check(PA.attachPlan(MO, OTHER, env, 'detach').refused === 'not-carried' || PA.attachPlan(MO, MINE, env, 'detach').refused, 'E: a held sheet offers no detach of what it lacks');
  const pRH = PA.attachPlan(MO, MINE, env, 'replace'), wRH = words(PA.previewWords(pRH, WHO));
  check(!pRH.refused && pRH.hold0 === 'A' && pRH.hold1 === null && wRH.indexOf('Light Blaster Pistol — this My Data’s Light Blaster Pistol: damage 5 → 7') >= 0,
    'E: F8-held — replace on a held sheet is offered (the only missing stamp); damage 5 → 7 against what this device shows (F-2)', { refused: pRH.refused, words: wRH });
  const ways = PA.wayOutRows(MO, env);
  check(ways.length === 1 && ways[0].stamp === MINE, 'E: R-H2F-2 — the held sheet’s + Add homebrew has exactly one row: the replace that lifts the hold', ways.map((r) => r.name));
  const MO2 = Object.assign(clone(MO), { mods: MO.mods.concat(['user:old_campaign#0a1b2c3d4e5f']) });
  check(PA.attachPlan(MO2, MINE, env, 'replace').refused === 'held' && PA.wayOutRows(MO2, env).length === 0,
    'E: with a second stamp missing, the replace is refused — it would not be a way out (R-H2K-5)');
  check(undoExact(MO, pRH), 'F: Undo after the held replace restores the record byte for byte');

  // ════ HELD — Drive Kit (made here) and House Rules removed by removePack (F7, F7-two) ════
  const HH = await newStore(); env = use(HH);
  const dv = await device(HH, { importDrive: false });
  const s2 = {}; HH.list().forEach((r) => { s2[r.packId] = r.stamp; });
  const hb = { spec: dv.ids.driveMechanic, owned: ['0-0'] };
  const ONE = make(env, maro(dv.ids, dv.copy), [s2.drive_kit, s2.my_data], hb);
  const TWO = make(env, maro(dv.ids, dv.copy), [s2.drive_kit, s2.house_rules, s2.my_data], hb);
  const HF = make(env, maro(dv.ids, dv.copy), [s2.drive_kit, s2.my_data], hb, [dv.ids.kitSense]);
  const HF1 = make(env, maro(null, null, false), [s2.drive_kit], null, [dv.ids.kitSense]);
  got(await HH.removePack('drive_kit'), 'remove dk'); got(await HH.removePack('house_rules'), 'remove hr');
  check(same(HH.missingFor(ONE.mods), [s2.drive_kit]) && HH.missingFor(TWO.mods).length === 2 && PA.isHeld(ONE, env), 'D: fixture — removePack holds Maro (one missing) and Maro (two)');
  check(PA.attachPlan(ONE, s2.my_data, env, 'detach').refused === 'held', 'C: a held sheet’s present collection is not removable (the after-state would still be incomplete)');
  const p1 = PA.attachPlan(ONE, null, Object.assign({}, env, { signedIn: true }), 'missing'), w1 = PA.previewWords(p1, WHO);
  const want1 = ['Remove the missing homebrew from Maro Jinx?', '1 homebrew collection that isn’t on this device', '3 items stay unknown',
    '1 specialization goes away; talents bought in it stay.', '1 talent does nothing now', 'Strain threshold 14 → 13, soak 4 → 3', 'Buying works again.',
    'This changes Maro Jinx on every device you’re signed in on.'];
  check(same(words(w1), want1) && w1.last === null && w1.groups[0].h === null && w1.primary === 'Remove', 'D: F7 — the way out counts, it does not name (R-H2K-4, R-H2F-7)', words(w1));
  check(p1.hold0 === 'A' && p1.hold1 === null && same(p1.next, [s2.my_data]) && p1.cleanAfter && patchKeysOk(p1), 'D: held A before, null after; every missing stamp goes; mods + projections');
  check(same(p1.patch.talents.map((t) => t.id), ['grit', dv.ids.rigIt]), 'D: the way out keeps the absent tree’s talents too (R-H2F-1)', p1.patch.talents);
  // R-H2R-3: the way out's held line — ONE with an older saved strain of 14 holds the number the way out would lower
  const FL1 = Object.assign(clone(ONE), { derived: Object.assign({}, ONE.derived || {}, { strainThreshold: 14 }) });
  const pF1 = PA.attachPlan(FL1, null, env, 'missing'), wF1 = words(PA.previewWords(pF1, WHO));
  check(pF1.held.length === 1 && pF1.held[0].computed === 13 && pF1.held[0].held === 14
    && wF1.indexOf('Strain threshold stays 14. Without the missing homebrew it would be 13, but this character’s older saved number holds it.') >= 0
    && wF1.indexOf('Soak 4 → 3') >= 0 && !wF1.some((t) => t.indexOf('. With ') >= 0),
    'D: the way out’s held line reads “Without the missing homebrew” where the floor holds (R-H2R-3)', { held: pF1.held, words: wF1 });
  const p2 = PA.attachPlan(TWO, null, env, 'missing'), w2 = p2.refused ? [p2.refused] : words(PA.previewWords(p2, WHO));
  check(w2[1] === '2 homebrew collections that aren’t on this device' && w2.indexOf('Buying works again.') >= 0 && p2.gone.length === 2 && !p2.refused, 'D: F7-two — the count reads 2', w2);
  // RE-POINTED at B-1190 (R-M9B-13 as amended by R-M9B-14, as C above). KEPT — the way out on HF (My Data present) is
  // refused in R-H2K-6's missing words; a TRUE variant B (the missing Drive Kit the only collection) refuses too. MOVED — HF
  // refuses by the released-kind reading (hold1 null), not variant B. DROPPED — "hold1 B" for HF.
  // RE-POINTED again (RULING-MOVED: D-411 items 7–9, B-1203, as C above). KEPT — HF is not variant B (hold1 null); the TRUE
  // variant B below still refuses. MOVED — HF's way out is OFFERED and counts "1 Force power does nothing now" (was: refused
  // in R-H2K-6's missing words). DROPPED — HF's refusal.
  const pHF = PA.attachPlan(HF, null, env, 'missing'), wHF = pHF.refused ? [pHF.refused] : words(PA.previewWords(pHF, WHO));
  check(!pHF.refused && pHF.hold1 === null && wHF.indexOf('1 Force power does nothing now') >= 0,
    'C: the way out that leaves Kit Sense released is offered and counts it (D-411 items 7–9, B-1203)', { refused: pHF.refused, hold1: pHF.hold1, words: wHF });
  const pHF1 = PA.attachPlan(HF1, null, env, 'missing');
  check(pHF1.refused === 'would-hold' && pHF1.hold1 === 'B' && PA.refusalWords(pHF1, WHO) === 'Maro Jinx’s Force power comes from homebrew that isn’t on this device, so it can’t be removed yet.',
    'C: a missing-kind refusal — a TRUE variant B (the missing Drive Kit the only collection) is refused in R-H2K-6’s missing words', { refused: pHF1.refused, hold1: pHF1.hold1, words: PA.refusalWords(pHF1, WHO) });
  check(words(PA.previewWords(p1, WHO)).indexOf('Buying works again.') >= 0 && !PA.previewWords(pD, WHO).groups.some((g) => g.rows.some((r) => r.t === 'Buying works again.')),
    'D: “Buying works again.” only where the after hold is null after a hold');

  // ── F Undo, the after-lines ──
  check(undoExact(MARO, pD) && undoExact(MARO, pE) && undoExact(ONE, p1), 'F: Undo restores the record byte for byte (detach, empty detach, the way out)');
  const bare = clone(MARO); delete bare.derivedConditional;
  check(undoExact(bare, PA.attachPlan(bare, DK, use(H), 'detach')), 'F: …including keys the record did not have');
  check(PA.afterWords(pD) === 'Drive Kit removed.' && PA.afterWords(pR) === 'Now uses this My Data.' && PA.afterWords(p1) === 'Missing homebrew removed.' && PA.W.undo === 'Undo',
    'F: the after-lines (R-H2K-8)');
  check(PA.attachPlan(MARO, MY, use(H), 'replace').refused === 'carried', 'E: replace of a carried stamp is refused');

  // ── G ruling homebrew-h2-build-readings R-H2R-1: a Remove puts H1's offer away for the removed collection ──
  env = use(H);
  const dkRow = H.list().filter((r) => r.stamp === DK)[0];
  const seenD = PA.seenOnCommit(pD, MARO, env);
  check(dkRow && same(seenD, [PA.seenKey(MARO, dkRow.ck)]) && seenD[0] === 'Maro Jinx|' + dkRow.ck, 'G: a Remove writes <name>|<ck> for the collection it removed (R-H1B-4’s key)', seenD);
  const afterD = apply(MARO, PA.patchFor(pD, MARO)), seenObj = {}; seenD.forEach((k) => { seenObj[k] = 1; });
  const offBefore = PA.offerFor(afterD, env, {}, false).map((c) => c.ck), offAfter = PA.offerFor(afterD, env, seenObj, false).map((c) => c.ck);
  check(offBefore.indexOf(dkRow.ck) >= 0 && offAfter.indexOf(dkRow.ck) < 0, 'G: without the write the removed collection would raise H1’s offer; with it, it does not (F10-removed draws no offer)', { offBefore, offAfter });
  check(seenR.length === 0 && PA.seenOnCommit(p1, ONE, use(HH)).length === 0 && PA.seenOnCommit(pE, MARO, use(H)).length === 1,
    'G: a replace (its replaced collection still on this device) and the held way out write nothing; every Remove writes one', { seenR });

  CharResolve.setTalentViewResolver(null);
  console.log('\n' + (rows - failures) + '/' + rows + (failures ? ' — FAILED' : ' ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('  FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
