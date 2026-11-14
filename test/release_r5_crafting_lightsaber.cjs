#!/usr/bin/env node
/* release-r5-crafting-ev C2 · A FINISHED LIGHTSABER HILT, ITS CRYSTAL, AND THE FAILURE ROWS (card `release-r5-crafting-ev`
 * §5 acceptance 3; rulings `release-r5-crafting-ev-c0` Q1 (b), `-hilt-damage` Q1 (a), `-on-failure` Q1 (a)).
 *
 * A crafted hilt lands {_inline} on equipment.weapons at damage 0 (Endless Vigil printed 84: "only … a lightsaber hilt");
 * the player installs a crystal through the ONE attachments writer (ItemResolve.writeAttachment) and the item then reads
 * through the ONE path the sheet uses (pcResolveEntry → applyInstalledAttachments, sheetPool.resolveSheetEquipment's
 * core). Every read is after a JSON round trip of the equipment (the reload).
 *   H1  Standard finished: one {_inline} weapon, built_with as bought; damage 0, crit 0, one-handed, no attachment.
 *   H2  ilum_crystal installed on that inline entry (the writer accepts the inline host): 6 / 2 / Breach 1, Sunder, and
 *       3 hard points free of 5 (FaD printed 176: the crystal occupies 2).
 *   H3  Precision + Ilum reads 5 (its crystal_damage_mod −1).
 *   H4  a FAILED check lands nothing.
 *   T1  Standard + Two-Handed: the hilt reads 0, two-handed, encumbrance 3; + Ilum reads 7 / 2.
 *   T2  Precision + Two-Handed + Ilum reads 6.
 *   T3  the fence: melee's Two-Handed on a non-hilt template (bladed_weapon) still raises its damage by 1.
 *   F1  on a failed roll exactly the two on_failure rows are affordable; on a success neither is, and every other row is;
 *       no verdict reads as a success; buildItem refuses an on_failure row in a finished build.
 *   BITES: the hilt routing removed reds T1 (reads 6); routing every profile reds T3; a spend that ignores on_failure
 *   reds F1.
 *
 * Run: node test/release_r5_crafting_lightsaber.cjs → exit 0 when every leg holds and every bite bites.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (p) => JSON.parse(read(p));
const TPL = J('public/data/canonical/crafting_templates.json').templates;
const SPEND = J('public/data/canonical/crafting_spend.json');
const ATT = J('public/data/canonical/attachments.json');
const AREG = {};
(Array.isArray(ATT.attachments) ? ATT.attachments : Object.values(ATT.attachments || {})).forEach((a) => { AREG[a.id] = a; });

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
};
const bite = (label, holds) => {
  if (!holds) console.log('  PASS  BITE: ' + label);
  else { failures += 1; console.error('  FAIL  BITE: ' + label + ' — the leg still held'); }
};

// the three shared modules from source strings, in their own directory (a mutant never touches the tree); crafting.js's
// node-only registry reads are re-pointed at the tree's files
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5ev-'));
let nth = 0;
const SRC = { store: read('lib/shared/craftStore.js'), crafting: read('lib/shared/crafting.js'), ir: read('lib/shared/itemResolve.js') };
function modsFrom(over) {
  const s = Object.assign({}, SRC, over || {});
  const dir = path.join(tmp, String(nth++));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'itemResolve.js'), s.ir);
  fs.writeFileSync(path.join(dir, 'crafting.js'), s.crafting.split("'../../public/data/canonical/").join("'" + path.join(ROOT, 'public/data/canonical').replace(/'/g, "\\'") + '/'));
  fs.writeFileSync(path.join(dir, 'craftStore.js'), s.store);
  return { Craft: require(path.join(dir, 'craftStore.js')), IR: require(path.join(dir, 'itemResolve.js')) };
}
function cut(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('bite found nothing to cut: ' + a);
  return src.replace(a, b);
}

const reload = (x) => JSON.parse(JSON.stringify(x));
const EQ = { weapons: [{ id: 'blaster_pistol' }], gear: [], credits: 0 };
const qs = (r) => (r.qualities || []).map((q) => q.id + (q.ranked ? q.rank : '')).sort().join(',');

// finish a project on `templateId` with `rows`; → the equipment after the landing arm (null when nothing landed)
function finish(M, templateId, rows, roll) {
  const t = TPL[templateId];
  const index = M.Craft.indexSpend(SPEND, t.category);
  const imp = rows.filter((id) => index[id].side === 'improvement'), fl = rows.filter((id) => index[id].side === 'flaw');
  const p = Object.assign(M.Craft.newProject(templateId, t.category, []), { stage: 'spending', roll: roll || { su: 2 }, improvements: imp, flaws: fl });
  const land = M.Craft.landingOf(p, t, index, EQ, {});
  return land ? reload(land.equipment) : null;
}
// the crafted entry (the last weapon), resolved the sheet's way
function readLast(M, eq) {
  const i = eq.weapons.length - 1, entry = eq.weapons[i];
  const rec = M.IR.pcResolveEntry(entry, {});
  const atts = Array.isArray(entry.attachments) ? entry.attachments : [];
  const out = atts.length ? M.IR.applyInstalledAttachments('weapon', rec, atts, AREG, {}) : rec;
  const acct = M.IR.pcHardpointAccounting(rec.hardpoints, atts, AREG);
  return { i, entry, rec, out, free: acct.capacity - acct.used - acct.uncosted };
}
// install `id` on the crafted entry through the one writer; → the reloaded equipment, or null when the writer refused
function install(M, eq, id) {
  const r = readLast(M, eq);
  const next = M.IR.writeAttachment(eq, { kind: 'weapon', idx: r.i }, { op: 'attach', id, registry: AREG, record: r.rec });
  return next === eq ? null : reload(next);
}

const M0 = modsFrom();

// ── H1–H4 ──
function legsH(M) {
  const eq = finish(M, 'lightsaber_standard', []);
  const h = readLast(M, eq);
  const lit = install(M, eq, 'ilum_crystal');
  const hl = lit && readLast(M, lit);
  const peq = finish(M, 'lightsaber_precision', []);
  const plit = install(M, peq, 'ilum_crystal');
  const pl = plit && readLast(M, plit);
  return {
    h1: eq.weapons.length === 2 && !!h.entry._inline && Array.isArray(h.rec.built_with) && h.rec.built_with.length === 0
      && h.rec.damage.value === 0 && h.rec.crit === 0 && h.rec.hands === 'one_handed' && !h.entry.attachments,
    h1d: { n: eq.weapons.length, dmg: h.rec.damage, crit: h.rec.crit, hands: h.rec.hands },
    h2: !!hl && hl.out.damage.value === 6 && hl.out.crit === 2 && qs(hl.out) === 'breach1,sunder' && hl.free === 3,
    h2d: hl ? { dmg: hl.out.damage.value, crit: hl.out.crit, q: qs(hl.out), free: hl.free } : 'the writer REFUSED the inline host',
    h3: !!pl && pl.out.damage.value === 5 && pl.out.crit === 2 && qs(pl.out) === 'accurate1,breach1,sunder',
    h3d: pl ? { dmg: pl.out.damage.value, q: qs(pl.out) } : 'refused',
    h4: finish(M, 'lightsaber_standard', [], { fa: 2 }) === null,
  };
}
const H = legsH(M0);
check('H1 a finished Standard hilt lands one {_inline} weapon: damage 0, crit 0, one-handed, no crystal (after a reload)', H.h1, H.h1d);
check('H2 ilum_crystal installed on the inline entry by the one writer reads 6 / 2 / Breach 1, Sunder, 3 hard points free', H.h2, H.h2d);
check('H3 a Precision hilt + Ilum reads 5', H.h3, H.h3d);
check('H4 a failed check lands nothing', H.h4);

// ── T1–T3 ──
function legsT(M) {
  const eq = finish(M, 'lightsaber_standard', ['lightsaber_two_handed']);
  const h = readLast(M, eq);
  const lit = install(M, eq, 'ilum_crystal'), hl = lit && readLast(M, lit);
  const peq = finish(M, 'lightsaber_precision', ['lightsaber_two_handed']);
  const pl = readLast(M, install(M, peq, 'ilum_crystal'));
  const plain = readLast(M, finish(M, 'bladed_weapon', [])).rec, two = readLast(M, finish(M, 'bladed_weapon', ['two_handed'])).rec;
  return {
    t1: h.rec.damage.value === 0 && h.rec.hands === 'two_handed' && h.rec.encumbrance === 3 && !!hl && hl.out.damage.value === 7 && hl.out.crit === 2,
    t1d: { hilt: h.rec.damage.value, hands: h.rec.hands, enc: h.rec.encumbrance, lit: hl && hl.out.damage.value },
    t2: pl.out.damage.value === 6, t2d: pl.out.damage.value,
    t3: two.damage.value === plain.damage.value + 1 && !('crystal_damage_mod' in two), t3d: [plain.damage, two.damage],
  };
}
const T = legsT(M0);
check('T1 Standard + Two-Handed: the hilt reads 0, two-handed, enc 3; + Ilum reads 7 / 2 (after a reload)', T.t1, T.t1d);
check('T2 Precision + Two-Handed + Ilum reads 6', T.t2, T.t2d);
check('T3 the fence: melee\'s Two-Handed on bladed_weapon still raises its damage by 1', T.t3, T.t3d);

// ── F1 ──
function legF(M) {
  const index = M.Craft.indexSpend(SPEND, 'lightsaber');
  const rich = { ad: 9, tr: 9, th: 9, de: 9 };
  const onFail = Object.keys(index).filter((id) => M.Craft.affordableFrom(index[id].row, rich, 'failed')).sort();
  const onWin = Object.keys(index).filter((id) => M.Craft.affordableFrom(index[id].row, rich, 'crafted'));
  const bare = Object.keys(index).filter((id) => M.Craft.affordableFrom(index[id].row, rich));
  const two = ['lightsaber_horrible_accident', 'lightsaber_learning_experience'];
  let threw = false;
  try { finish(M, 'lightsaber_standard', ['lightsaber_learning_experience']); } catch (e) { threw = /failed check/.test(e.message); }
  const led = M.Craft.spendLedger(['lightsaber_learning_experience'], index, { tr: 1 }, 'failed');
  return {
    ok: JSON.stringify(onFail) === JSON.stringify(two) && onWin.length === 24 && two.every((id) => onWin.indexOf(id) === -1)
      && JSON.stringify(bare) === JSON.stringify(onWin) && threw && led.paid.length === 1,
    d: { onFail, onWin: onWin.length, bare: bare.length, threw, paid: led.paid },
  };
}
const F = legF(M0);
check('F1 failure: exactly the two on_failure rows; success and no verdict: the other 24, never those two; a finished build refuses one', F.ok, F.d);

// ── BITES ──
const T_CUT = legsT(modsFrom({ crafting: cut(SRC.crafting, "return !!profile && typeof profile.crystal_damage_mod === 'number';", 'return false;') }));
bite('the hilt routing removed reds T1 (reads 6)', T_CUT.t1 || T_CUT.t1d.lit !== 6);
bite('routing every profile reds T3 (the fence)',
  legsT(modsFrom({ crafting: cut(SRC.crafting, "return !!profile && typeof profile.crystal_damage_mod === 'number';", "if (profile && typeof profile.crystal_damage_mod !== 'number') profile.crystal_damage_mod = 0; return !!profile;") })).t3);
bite('a spend that ignores on_failure reds F1',
  // re-pointed (release-r5-crafting-kp, ruling release-r5-crafting-kp-c0 Q3b): eligible's on_failure test is now the line
  // before limitOf; the mutant is the same — the verdict is ignored, every row eligible
  legF(modsFrom({ store: cut(SRC.store, "if (verdict === 'failed' ? !onFail : onFail) return false;", '') })).ok);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error('FAILED: ' + failures); process.exit(1); }
console.log('OK');
