#!/usr/bin/env node
/**
 * f100_m5_talent_render.cjs — F-100 M5 JOB 2: C4's CASE TABLE (ruling `f100-m5-contracts` §6 item 4, cases 1–11) and
 * C5.2's predicate (§6 item 5), on the SHARED cores the sheet calls, over registry-shaped data and a REAL user store.
 *
 * WHAT IT HOLDS (C4, shape (b)): a talent's values are worked out when the sheet is shown, through the sheet's OWN
 * STAMP VIEW (CharResolve.stampTalentView — the very function the player's resolver wraps), not read from the
 * persisted `derivedBonuses` / `derivedConditional`; the ONE fallback (a stamped pack not on this device) renders the
 * persisted projection; an eligible difference is WRITTEN (SWRPGProjectionDiff.reproject) and named for the notice.
 *
 *   1  an own edit to an owned talent's number → the new number at once; reproject names it (U8), then not stale
 *   2  an op ADDED to an owned talent (plain and `when`) → as case 1
 *   3  dice, text, `when` values and the floor → still live, now through the STAMP view
 *   4  a deleted own REDEFINE → the book's value; reproject names it RESTORED (U8's "no longer change")
 *   5  a deleted NEW own talent → unknown, gives nothing; NOT held (C5.2), U9's refs; buying stays on
 *   6  a deleted own SPECIALIZATION → its talents kept and working; NOT held; U9's refs
 *   7  the stamped pack switched OFF on this device → the stamp's values, not the book's
 *   8  the stamped pack ABSENT (hold A) → held as today; the numbers from the persisted projection, no drop
 *   9  a FROZEN re-import with a changed talent → the display follows it; no write, no notice
 *   10 BOOK-DATA PARITY → for every specialization (137) a character owning its whole tree, the numbers worked out at
 *      render equal today's persisted numbers, all six, armour on and off (the grammar gate's pattern)
 *   11 the tree REPLACE (M-2) → reproject's count-level "Changed" write, positions and XP untouched
 * BITE (acceptance 4): with the resolver UNWIRED, cases 1 and 7 go red — asserted here, not left to a mutant.
 *
 * Run: node test/f100_m5_talent_render.cjs   (exit 1 on any FAIL)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
global.CharResolve = CR;
const PD = require(path.join(ROOT, 'lib/shared/projectionDiff.js'));

let fails = 0, passes = 0;
function check(cond, label, detail) {
  if (cond) passes += 1; else fails += 1;
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (!cond && detail !== undefined ? '   -> ' + JSON.stringify(detail).slice(0, 400) : ''));
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const vocab = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries;
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const skills = vocab('skills.vocab.json');
const VOCAB = { skills: skills.map((e) => e.id), qualities: vocab('qualities.vocab.json').map((e) => e.id) };
const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const CB = { species: BASE.species, careers: BASE.careers, specializations: BASE.specializations, talents: BASE.talents, forcePowers: BASE.force_powers };
const mk = () => U.createStore({ adapter: U.memoryAdapter(), schemas: SCHEMAS, vocab: VOCAB, base: BASE });
// THE resolver the player registers, minus its cache: the sheet's stamp view through `store`, or null (C4.4).
const wire = (store) => { M.useUserPacks(store); CR.setTalentViewResolver((sh) => CR.stampTalentView(sh, CB, M, store)); };
const unwire = () => CR.setTalentViewResolver(null);
const ARMOR = { armor: { soak: 1, defense: 0 } };
const NUMS = ['soak', 'woundThreshold', 'strainThreshold', 'meleeDefense', 'rangedDefense', 'forceRating'];

// A character as buyTalent writes it: positions, then the three projections through the view it bought under.
function owner(spec, positions, view, mods) {
  const specs = [{ id: spec, owned: positions.slice() }];
  return Object.assign({ name: 'Case', speciesId: 'human', careerId: ((view && view.specializations && view.specializations[spec]) || BASE.specializations[spec] || {}).career || 'smuggler', specializationIds: [spec],
    specializations: specs, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    woundBase: 10, strainBase: 10, forceRatingBase: 1, forcePowers: [], mods: mods || [], xp: { total: 200, spent: 15, remaining: 185 } },
    PD.projectSheet({ specializations: specs }, view));
}
async function home() { const H = mk(); await H.ready(); return H; }
async function viewOf(store, mods) { M.useUserPacks(store); return M.resolveForStamp(mods, CB); }

(async function main() {
  console.log('f100_m5_talent_render — C4 case table + C5.2 (ruling f100-m5-contracts §6 items 4–5)');

  // ── 1 · an own edit to an owned talent's NUMBER (M-1 a): grit +1 → +2 on advisor 0-2 ──
  {
    const H = await home();
    await H.saveRecord('my_data', 'talents', clone(BASE.talents.grit));
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);
    wire(H);
    const before = CR.computeDerived(sheet, null, CB).strainThreshold;
    const rec = clone(BASE.talents.grit); rec.effects[0].amount = 2;
    await H.saveRecord('my_data', 'talents', rec);
    const after = CR.computeDerived(sheet, null, CB).strainThreshold;
    check(after === before + 1, 'case 1: grit +1 → +2 in a live own pack — the owner\'s strain threshold moves ' + before + ' → ' + after + ' on the first render', { before, after });
    const v1 = await viewOf(H, mods), ti = PD.tellingInputs(sheet, H, M, CB);
    const r = PD.reproject(sheet, v1, ti.supplier, ti.opts);
    check(!!r && r.notice.talents.join() === 'grit' && r.notice.specs.length === 0 && r.notice.restored.length === 0,
      'case 1: reproject WRITES and names the record for U8 — notice.talents [grit]', r && r.notice);
    check(!!r && r.sheet.derivedBonuses.strainThresholdBonus === 2 && JSON.stringify(r.sheet.specializations) === JSON.stringify(sheet.specializations) && JSON.stringify(r.sheet.xp) === JSON.stringify(sheet.xp),
      'case 1: the persisted projection updated (strain bonus 2); positions and XP untouched (F24)', r && r.sheet.derivedBonuses);
    check(!!r && !PD.diff(r.sheet, v1).stale && PD.reproject(r.sheet, v1, ti.supplier, ti.opts) === null,
      'case 1: after the write the sheet is not stale, and a second render writes nothing (U8 once)');
    unwire();
    check(CR.computeDerived(sheet, null, CB).strainThreshold === before,
      'BITE case 1: with the resolver UNWIRED the owner keeps the baked number (' + before + ') — the render path is what moved it');
  }

  // ── 2 · an op ADDED to an owned talent: plain (M-1 f) and `when` (M-1 g; A1-4 (ii)) ──
  for (const g of [{ k: 'plain soak_delta +1', eff: { op: 'soak_delta', amount: 1, per_rank: true }, eq: null },
                   { k: '`when` armored soak_delta +1', eff: { op: 'soak_delta', amount: 1, per_rank: false, when: 'armored' }, eq: ARMOR }]) {
    const H = await home();
    await H.saveRecord('my_data', 'talents', clone(BASE.talents.grit));
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);
    wire(H);
    const before = CR.computeDerived(sheet, g.eq, CB).soak;
    const rec = clone(BASE.talents.grit); rec.effects.push(g.eff);
    await H.saveRecord('my_data', 'talents', rec);
    const after = CR.computeDerived(sheet, g.eq, CB).soak;
    const v1 = await viewOf(H, mods), ti = PD.tellingInputs(sheet, H, M, CB);
    const r = PD.reproject(sheet, v1, ti.supplier, ti.opts);
    check(after === before + 1 && !!r && r.notice.talents.join() === 'grit', 'case 2: grit gains ' + g.k + ' — soak ' + before + ' → ' + after + ' live; reproject names grit', { before, after, n: r && r.notice });
    unwire();
  }

  // ── 3 · dice, text, `when` VALUES and the floor: live through the STAMP view ──
  {
    const H = await home();
    for (const id of ['beast_wrangler', 'armor_master', 'witchcraft', 'grit']) await H.saveRecord('my_data', 'talents', clone(BASE.talents[id]));
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const bw = owner('beast_rider', ['0-3'], v0, mods), am = owner('armorer', ['1-1'], v0, mods), wc = owner('nightsister', ['0-0'], v0, mods);
    wire(H);
    const b0 = CR.ownedTalentPoolSources(bw, CR.stampTalentView(bw, CB, M, H)).filter((p) => p.id === 'beast_wrangler')[0];
    const s0 = CR.computeDerived(am, ARMOR, CB).soak, f0 = CR.computeDerived(wc, null, CB).forceRating;
    const r1 = clone(BASE.talents.beast_wrangler); r1.pool_mods[0].count = 2; await H.saveRecord('my_data', 'talents', r1);
    const r2 = clone(BASE.talents.armor_master); r2.effects[0].amount = 2; await H.saveRecord('my_data', 'talents', r2);
    const r3 = clone(BASE.talents.witchcraft); r3.effects[0].amount = 2; await H.saveRecord('my_data', 'talents', r3);
    const r4 = clone(BASE.talents.grit); r4.description = 'House rule: our Grit.'; await H.saveRecord('my_data', 'talents', r4);
    const b1 = CR.ownedTalentPoolSources(bw, CR.stampTalentView(bw, CB, M, H)).filter((p) => p.id === 'beast_wrangler')[0];
    check(b0 && b1 && b0.pool_mods[0].count === 1 && b1.pool_mods[0].count === 2, 'case 3: dice — beast_wrangler boost 1 → 2 through the stamp view', { b0: b0 && b0.pool_mods, b1: b1 && b1.pool_mods });
    check(CR.computeDerived(am, ARMOR, CB).soak === s0 + 1, 'case 3: a `when` value — armor_master soak@armored 1 → 2, armour worn (soak ' + s0 + ' → ' + CR.computeDerived(am, ARMOR, CB).soak + ')');
    check(CR.computeDerived(wc, null, CB).forceRating === Math.max(f0, 2), 'case 3: the floor — witchcraft floor 1 → 2 (FR ' + f0 + ' → ' + CR.computeDerived(wc, null, CB).forceRating + ')');
    check(CR.stampTalentView(bw, CB, M, H).talents.grit.description === 'House rule: our Grit.', 'case 3: text — the stamp view carries the house description');
    unwire();
  }

  // ── 4 · a deleted own REDEFINE (M-6 3): the book stands in; reproject names it RESTORED ──
  {
    const H = await home();
    const rec = clone(BASE.talents.grit); rec.effects[0].amount = 2;
    await H.saveRecord('my_data', 'talents', rec);
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);   // bought UNDER the house rule (+2)
    wire(H);
    const under = CR.computeDerived(sheet, null, CB).strainThreshold;
    await H.deleteRecord('my_data', 'talents', 'grit');
    const book = CR.computeDerived(sheet, null, CB).strainThreshold;
    const v1 = await viewOf(H, mods), ti = PD.tellingInputs(sheet, H, M, CB);
    const r = PD.reproject(sheet, v1, ti.supplier, ti.opts);
    check(book === under - 1, 'case 4: the house +2 deleted — the book\'s +1 shows (strain ' + under + ' → ' + book + ')');
    check(!!r && r.notice.restored.join() === 'grit' && r.notice.talents.length === 0, 'case 4: reproject writes and names grit RESTORED (U8 "no longer change")', r && r.notice);
    check(CR.sheetHold(sheet, v1, H.missingFor(mods), true) === null, 'case 4: not held');
    unwire();
  }

  // ── 5 · a deleted NEW own talent (M-6 1): unknown, gives nothing; NOT a hold; U9's refs ──
  let newTalentId = null;
  {
    const H = await home();
    const fresh = clone(BASE.talents.grit); fresh.name = 'Iron Will'; fresh.effects[0].amount = 3;
    newTalentId = H.mintId('my_data', 'talents', 'Iron Will');
    fresh.id = newTalentId;
    const sv = await H.saveRecord('my_data', 'talents', fresh, { create: true });
    const tree = clone(BASE.specializations.advisor); tree.talent_tree[0].talents[2].talent = newTalentId;
    const sv2 = await H.saveRecord('my_data', 'specializations', tree);
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);
    wire(H);
    const withIt = CR.computeDerived(sheet, null, CB).strainThreshold;
    const del = await H.deleteRecord('my_data', 'talents', newTalentId);
    const v1 = await viewOf(H, mods);
    const without = CR.computeDerived(sheet, null, CB).strainThreshold;
    check(sv.ok && sv2.ok && del.ok, 'case 5: fixture — a new own talent placed in a copied advisor tree, owned, then deleted', { sv, sv2, del });
    check(without === withIt - 3, 'case 5: the deleted talent gives NOTHING (strain ' + withIt + ' → ' + without + '; its +3 is gone, not baked)');
    check(CR.sheetHold(sheet, v1, H.missingFor(mods), true) === null, 'case 5: NOT held (C5.2) — buying stays on');
    const dr = CR.sheetDeletedRefs(sheet, v1, H.missingFor(mods), true);
    check(dr.length === 1 && dr[0].kind === 'talent' && dr[0].id === newTalentId, 'case 5: U9\'s refs name one deleted talent', dr);
    unwire();
    check(CR.sheetHold(sheet, v1, H.missingFor(mods), true) === null, 'case 5: the predicate does not depend on the resolver');
  }

  // ── 6 · a deleted own SPECIALIZATION (M-6 2): its talents kept and working; NOT held; U9 ──
  {
    const H = await home();
    const tree = clone(BASE.specializations.advisor); tree.id = H.mintId('my_data', 'specializations', 'Night Counsel'); tree.name = 'Night Counsel';
    const sv = await H.saveRecord('my_data', 'specializations', tree, { create: true });
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner(tree.id, ['0-2'], v0, mods);   // grit, bought in the own tree
    wire(H);
    const withTree = CR.computeDerived(sheet, null, CB).strainThreshold;
    await H.deleteRecord('my_data', 'specializations', tree.id);
    const v1 = await viewOf(H, mods);
    const after = CR.computeDerived(sheet, null, CB).strainThreshold;
    check(sv.ok && after === withTree && sheet.talents.some((t) => t.id === 'grit'), 'case 6: the tree deleted — grit is kept and still works (strain ' + withTree + ' → ' + after + ')');
    check(CR.sheetHold(sheet, v1, H.missingFor(mods), true) === null, 'case 6: NOT held (C5.2)');
    const dr = CR.sheetDeletedRefs(sheet, v1, H.missingFor(mods), true);
    check(dr.some((r) => r.kind === 'specialization' && r.id === tree.id), 'case 6: U9\'s refs name the deleted specialization', dr);
    const ti6 = PD.tellingInputs(sheet, H, M, CB);
    check(PD.reproject(sheet, v1, ti6.supplier, ti6.opts) === null, 'case 6: NO re-projection over a deleted tree — a write would drop grit (no false "no longer change Grit")');
    unwire();
  }

  // ── 7 · the stamped pack switched OFF on this device: the stamp's values, not the book's ──
  {
    const H = await home();
    const rec = clone(BASE.talents.grit); rec.effects[0].amount = 2;
    await H.saveRecord('my_data', 'talents', rec);
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);
    const act = await H.setActive('my_data', false);
    wire(H);
    const onSheet = CR.computeDerived(sheet, null, CB).strainThreshold;
    const bookOnly = CR.computeDerived(owner('advisor', ['0-2'], CB, []), null, CB).strainThreshold;
    check(act && act.ok !== false && H.activeStamps().indexOf(mods[0]) === -1, 'case 7: fixture — My Data switched OFF on this device', { act, active: H.activeStamps() });
    check(onSheet === bookOnly + 1, 'case 7: the sheet shows its STAMP\'s +2 (strain ' + onSheet + '), not the book\'s (' + bookOnly + ')');
    unwire();
  }

  // ── 8 · the stamped pack ABSENT (hold A): held as today; the persisted numbers, no drop ──
  {
    const H = await home();
    const rec = clone(BASE.talents.grit); rec.effects[0].amount = 2;
    await H.saveRecord('my_data', 'talents', rec);
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);
    const persisted = CR.computeDerived(sheet, null, CB).strainThreshold;   // no resolver: the persisted projection
    const SECOND = await home();
    wire(SECOND);
    const there = CR.computeDerived(sheet, null, CB).strainThreshold;
    const v2 = await viewOf(SECOND, mods);
    const hold = CR.sheetHold(sheet, v2, SECOND.missingFor(mods), true);
    check(CR.stampTalentView(sheet, CB, M, SECOND) === null, 'case 8: the stamp view is NULL on a device without the pack (C4.4)');
    check(there === persisted, 'case 8: the numbers come from the persisted projection (strain ' + there + ' = ' + persisted + '), no drop');
    check(!!hold && hold.variant === 'A', 'case 8: held as today (variant A)', hold);
    unwire();
  }

  // ── 9 · a FROZEN re-import with a changed talent: the display follows it; no write, no notice ──
  {
    const H = await home();
    const rec = clone(BASE.talents.grit); rec.effects[0].amount = 2;
    await H.saveRecord('my_data', 'talents', rec);
    const sh1 = await H.exportShare('my_data', { newPackId: 'table_rules' });
    const OTHER = await home();
    const imp = await OTHER.importPack(sh1.text);
    const frozen = [imp.stamp];
    const v0 = await viewOf(OTHER, frozen);
    const sheet = owner('advisor', ['0-2'], v0, frozen);
    const rec2 = clone(rec); rec2.effects[0].amount = 3;
    await H.saveRecord('my_data', 'talents', rec2);
    const sh2 = await H.exportShare('my_data', { newPackId: 'table_rules' });
    const imp2 = await OTHER.importPack(sh2.text);
    const newer = [imp2.stamp];
    const sheet2 = Object.assign(clone(sheet), { mods: newer });   // the re-import's outcome re-stamps the character
    wire(OTHER);
    const shown = CR.computeDerived(sheet2, null, CB).strainThreshold;
    const v1 = await viewOf(OTHER, newer), ti = PD.tellingInputs(sheet2, OTHER, M, CB);
    check(!!imp.stamp && !!imp2.stamp && imp.stamp !== imp2.stamp, 'case 9: fixture — a frozen import, then a re-import of a changed Grit', { a: imp.stamp, b: imp2.stamp });
    check(shown === CR.computeDerived(owner('advisor', ['0-2'], CB, []), null, CB).strainThreshold + 2, 'case 9: the display FOLLOWS the re-import (+3, strain ' + shown + ')');
    check(PD.reproject(sheet2, v1, ti.supplier, ti.opts) === null, 'case 9: NO write and NO notice for a frozen import (R-EC2-6 (i))');
    unwire();
  }

  // ── 10 · BOOK-DATA PARITY: every specialization, its whole tree owned — render === persisted, six numbers ──
  {
    const H = await home();
    wire(H);
    let rows = 0, diffs = [];
    const talentsSeen = new Set();
    Object.keys(BASE.specializations).forEach((sid) => {
      const tree = BASE.specializations[sid].talent_tree || [];
      const pos = []; tree.forEach((row, r) => (row.talents || []).forEach((c, ci) => { if (c && c.talent) { pos.push(r + '-' + ci); talentsSeen.add(c.talent); } }));
      const sheet = owner(sid, pos, CB, []);
      [null, ARMOR].forEach((eq) => {
        CR.setTalentViewResolver(null);
        const persisted = CR.computeDerived(sheet, eq, CB);
        wire(H);
        const rendered = CR.computeDerived(sheet, eq, CB);
        NUMS.forEach((k) => { rows += 1; if (persisted[k] !== rendered[k]) diffs.push({ sid, k, persisted: persisted[k], rendered: rendered[k], armour: !!eq }); });
      });
    });
    check(diffs.length === 0 && rows === Object.keys(BASE.specializations).length * 2 * NUMS.length,
      'case 10: PARITY — ' + Object.keys(BASE.specializations).length + ' specializations × armour on/off × 6 numbers = ' + rows + ' rows, render === persisted byte for byte (' + talentsSeen.size + ' of ' + Object.keys(BASE.talents).length + ' talents sit in a tree)', diffs.slice(0, 5));
    unwire();
  }

  // ── 11 · the tree REPLACE (M-2): reproject's count-level "Changed", positions and XP untouched ──
  {
    const H = await home();
    await H.saveRecord('my_data', 'specializations', clone(BASE.specializations.charmer));
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('charmer', ['0-0', '1-2'], v0, mods);
    const t = clone(BASE.specializations.charmer); t.talent_tree[1].talents[2].talent = 'toughened';
    await H.saveRecord('my_data', 'specializations', t);
    const v1 = await viewOf(H, mods), ti = PD.tellingInputs(sheet, H, M, CB);
    const r = PD.reproject(sheet, v1, ti.supplier, ti.opts);
    check(!!r && r.notice.specs.join() === 'charmer' && r.sheet.talents.some((x) => x.id === 'toughened') && JSON.stringify(r.sheet.specializations) === JSON.stringify(sheet.specializations) && JSON.stringify(r.sheet.xp) === JSON.stringify(sheet.xp),
      'case 11: the replace — notice.specs [charmer] (C6 "Changed"), talents re-projected, positions and XP unchanged', r && r.notice);
  }

  // ── BITE (acceptance 4): the resolver UNWIRED leaves case 7's sheet on the persisted number of a DIFFERENT truth ──
  {
    const H = await home();
    await H.saveRecord('my_data', 'talents', clone(BASE.talents.grit));
    const mods = H.activeStamps(), v0 = await viewOf(H, mods);
    const sheet = owner('advisor', ['0-2'], v0, mods);
    const rec = clone(BASE.talents.grit); rec.effects[0].amount = 4; await H.saveRecord('my_data', 'talents', rec);
    unwire();
    const cold = CR.computeDerived(sheet, null, CB).strainThreshold;
    wire(H);
    const hot = CR.computeDerived(sheet, null, CB).strainThreshold;
    unwire();
    check(hot === cold + 3, 'BITE: unwired, the house +4 does not reach the sheet (' + cold + '); wired it does (' + hot + ') — the case table measures the wiring');
  }

  console.log('\nf100_m5_talent_render: ' + passes + ' PASS, ' + fails + ' FAIL · HARVEST ' + (passes + fails) + ' rows');
  if (fails || !passes) process.exit(1);
})().catch((e) => { console.error('f100_m5_talent_render: CRASHED — ' + (e && e.stack || e)); process.exit(1); });
