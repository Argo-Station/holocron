#!/usr/bin/env node
/**
 * f100_m8_item_marks.cjs — F-100 M8 step 2, C7: the item pick is a MARK ON THE ITEM (ruling `f100-m8-build` ADDENDUM 3
 * R-M8G-12..16, as amended by ADDENDUM 5 R-M8G-21/22). Tinkerer (EotE p.145) is the seed.
 *
 *   SHAPE / READ (R-M8G-12/13/21)
 *     (i)    pickWrite marks the entry {talent, spec, cell}; talentChoices is not written
 *     (ii)   picksOf → pickOf reads the mark back by scanning the lists ({section, index})
 *     (iii)  the same cell in two specs (tinkerer@0-0: modder, outlaw_tech) is two marks, never one
 *     (iv)   distinct: a second Tinkerer rank on a marked entry is refused, and a hand-placed second mark is a problem
 *     (v)    a treeless rank takes no item pick: refused, and a spec-less mark is a problem
 *     (vi)   a mark whose spec/cell does not hold its talent is a problem
 *     (vii)  an orphaned mark (its cell un-bought) is ignored and NOT deleted
 *     (viii) a re-pick MOVES the mark; null lifts it
 *   STACK (R-M8G-15)
 *     (ix)   marking a gear entry at qty 3 splits one copy off: qty 2 + a new qty-1 line right after it, carrying the mark
 *   PROJECTION (R-M8K-7, R-M8G-16; card item 17's re-base)
 *     (x)    ownedItemEffects → one hard_points_delta per live mark; applyCharacterEffects bumps `hp` on a COPY;
 *            effectClass classes the row RESOLVES
 *     (xi)   resolveSheetEquipment (re-based out of the VERBATIM region) shows hp + 1 on the marked weapon only, and
 *            the saved equipment is byte-equal after
 *     (xii)  a lost item / unmade pick fails closed: nothing projected
 *     (xiii) one tree holding the talent twice (modder: tinkerer@0-0 and @1-1): each rank resolves and projects its OWN
 *            item, and a re-pick of one rank never lifts the other's mark (R-M8G-25)
 *   STAT BLOCK (R-M8G-28)
 *     (xiv)  the sheet's Unarmed (a Rules Profile) takes no mark: pickWrite refuses it, itemMarkProblems flags a placed one;
 *            Brass Knuckles (Brawl, equipment) is marked
 *   WRITERS (R-M8G-14: one leg per writer in brief §2 that creates, merges or moves an entry)
 *     (w1)   store buildNextEquipment never stacks onto a marked gear entry (a new line instead); unmarked still stacks
 *     (w2)   store moveToInventoryFor: its stack target is the same stackTargetOf (source pin: both sites call it)
 *     (w3)   wear keeps the mark on the suit both ways (spare → worn, worn → back to the pack)
 *     (w4)   persistItemState, persistStowage, updateItem (attachments, mods) keep the mark (Object.assign on the entry)
 *     (w5)   sell (loadoutSellUpdate) and remove (persistRemoveItem) drop the mark with the entry
 *
 * RE-POINTED by B-1403 (card `b1403-store-attachments-card` R-B1403-7: the one attachments[] writer):
 *   KEPT    every assert, unchanged; (w4)'s claim (an attachment added, removed or mod-toggled keeps the item's mark).
 *   MOVED   (w4)'s harness only: it also slices `writeAtt` (the panel's door to ItemResolve.writeAttachment), is handed
 *           IR, the panel's canonRec (null) and itemHp (5, the old stub's capacity), and reads the next equipment from
 *           onSheetChange as well as patchEquipment. (w1)'s slice header gains buildNextEquipment's 6th argument, `parts`.
 *   DROPPED nothing.
 * Run: npm run build first (w1 reads the built lib/store/view.js, as store_kernel does). node test/f100_m8_item_marks.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const payload = (o, k) => (o[k] && typeof o[k] === 'object') ? o[k] : o;
const S = (x) => JSON.stringify(x);
const clone = (x) => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const CR = require('../lib/shared/charResolve.js');
const IR = require('../lib/shared/itemResolve.js');
const cb = { specializations: payload(J('specializations.json'), 'specializations'), talents: payload(J('talents.json'), 'talents') };
const WEAPONS = payload(J('weapons.json'), 'weapons'), GEAR = payload(J('gear.json'), 'gear'), ARMOR = payload(J('armor.json'), 'armor');
const byId = (o) => Array.isArray(o) ? Object.fromEntries(o.map((r) => [r.id, r])) : o;
const W = byId(WEAPONS), G = byId(GEAR), A = byId(ARMOR);
const wId = Object.keys(W).find((k) => Number(W[k].hardpoints) >= 2), w2Id = Object.keys(W).find((k) => k !== wId && Number(W[k].hardpoints) >= 1);
const gId = Object.keys(G)[0], aId = Object.keys(A).find((k) => Number(A[k].hardpoints) >= 1);

console.log('F-100 M8 C7 ITEM MARKS (R-M8G-12..16, R-M8G-21/22)');
check(!!(cb.talents.tinkerer && Array.isArray(cb.talents.tinkerer.item_effects) && cb.talents.tinkerer.item_effects.length),
  'the seed: tinkerer carries item_effects[] (HARVEST ≥ 1)', S(cb.talents.tinkerer && cb.talents.tinkerer.item_effects));

const base = () => ({
  specializations: [{ id: 'modder', owned: ['0-0'] }, { id: 'outlaw_tech', owned: ['0-0'] }],
  equipment: { weapons: [{ id: wId }, { id: w2Id }], gear: [{ id: gId, qty: 3 }], armor: { id: aId, state: 'worn' }, credits: 0 },
});
const write = (sheet, spec, cell, value) => CR.pickWrite(sheet, cb, 'tinkerer', spec, cell, 'item', value);
const marksOf = (e) => (e && e.talentMarks) || [];
const apply = (sheet, patch) => Object.assign({}, sheet, patch);

// (i) (ii)
let sh = base();
let r = write(sh, 'modder', '0-0', { section: 'weapons', index: 0 });
check(r.equipment && !r.talentChoices && S(marksOf(r.equipment.weapons[0])) === S([{ talent: 'tinkerer', spec: 'modder', cell: '0-0' }]),
  '(i) pickWrite marks weapons[0] {talent, spec, cell} and writes no talentChoices', S(r));
sh = apply(sh, r);
const pk = () => CR.picksOf(sh, cb, 'tinkerer').filter((e) => e.pick.id === 'item')[0];
check(pk() && S(pk().instances.map((i) => i.value)) === S([{ section: 'weapons', index: 0 }, undefined]) && pk().unpicked === 1,
  '(ii) picksOf → pickOf reads the mark back by scanning: modder 0-0 → weapons[0]; outlaw_tech 0-0 unpicked', S(pk()));
// (iii)
r = write(sh, 'outlaw_tech', '0-0', { section: 'weapons', index: 1 });
sh = apply(sh, r);
check(S(pk().values) === S([{ section: 'weapons', index: 0 }, { section: 'weapons', index: 1 }]) && marksOf(sh.equipment.weapons[1])[0].spec === 'outlaw_tech',
  '(iii) tinkerer@0-0 in modder AND outlaw_tech are two marks, told apart by spec (R-M8G-21)', S(pk().values));
// (iv)
r = write(sh, 'outlaw_tech', '0-0', { section: 'weapons', index: 0 });
check(!!r.refused && /once/.test(r.refused), '(iv) a second Tinkerer rank on an already-marked entry is REFUSED (each item may only be modified once)', S(r));
{
  const bad = clone(sh); const w0 = bad.equipment.weapons[0]; (w0.talentMarks = w0.talentMarks || [{ talent: 'tinkerer', spec: 'modder', cell: '0-0' }]).push({ talent: 'tinkerer', spec: 'outlaw_tech', cell: '0-0' });
  const pr = CR.itemMarkProblems(bad, cb);
  check(pr.length === 1 && /second tinkerer/.test(pr[0]), '(iv) …and a hand-placed second tinkerer mark on one entry is a PROBLEM', S(pr));
}
check(S(CR.itemMarkProblems(sh, cb)) === '[]', '(iv) the two good marks raise no problem', S(CR.itemMarkProblems(sh, cb)));
// (v)
{
  const tl = Object.assign(base(), { treelessTalents: [{ id: 'tinkerer' }] });
  const rr = CR.pickWrite(tl, cb, 'tinkerer', null, 0, 'item', { section: 'weapons', index: 0 });
  check(!!rr.refused && /treeless/.test(rr.refused), '(v) a TREELESS rank takes no item pick: REFUSED (R-M8G-21)', S(rr));
  const nos = base(); nos.equipment.weapons[0].talentMarks = [{ talent: 'tinkerer', cell: '0-0' }];
  const pr = CR.itemMarkProblems(nos, cb);
  check(pr.length === 1 && /no spec/.test(pr[0]), '(v) …and a mark with no spec is a PROBLEM', S(pr));
}
// (vi)
{
  const mm = base(); mm.equipment.weapons[0].talentMarks = [{ talent: 'tinkerer', spec: 'modder', cell: '0-1' }];
  const pr = CR.itemMarkProblems(mm, cb);
  check(pr.length === 1 && /does not hold tinkerer/.test(pr[0]), '(vi) a mark whose spec/cell does not hold its talent is a PROBLEM', S(pr));
}
// (vii)
{
  const or = clone(sh); or.specializations[1].owned = [];
  const before = S(or.equipment);
  check(S(CR.picksOf(or, cb, 'tinkerer')[0].values) === S([{ section: 'weapons', index: 0 }]) && S(or.equipment) === before && marksOf(or.equipment.weapons[1]).length === 1,
    '(vii) an ORPHANED mark (outlaw_tech 0-0 un-bought) is ignored at read and NOT deleted', S(CR.picksOf(or, cb, 'tinkerer')[0].values));
  check(CR.ownedItemEffects(or, cb).length === 1, '(vii) …and the orphan projects nothing (only modder\'s live mark does)', S(CR.ownedItemEffects(or, cb)));
}
// (viii)
{
  const mv = apply(sh, write(sh, 'modder', '0-0', { section: 'armor', index: 0 }));
  check(!marksOf(mv.equipment.weapons[0]).length && !('talentMarks' in mv.equipment.weapons[0]) && marksOf(mv.equipment.armor).length === 1,
    '(viii) a re-pick MOVES the mark (weapons[0] → the worn armor; the emptied list is removed)', S(mv.equipment));
  const up = apply(mv, write(mv, 'modder', '0-0', null));
  check(!('talentMarks' in up.equipment.armor) && marksOf(up.equipment.weapons[1]).length === 1, '(viii) null LIFTS the mark; the other rank\'s mark stays', S(up.equipment));
}
// (ix)
{
  const st = apply(sh, write(sh, 'modder', '0-0', { section: 'gear', index: 0 }));
  const g = st.equipment.gear;
  check(g.length === 2 && g[0].qty === 2 && !g[0].talentMarks && g[1].qty === 1 && g[1].id === gId && S(marksOf(g[1])) === S([{ talent: 'tinkerer', spec: 'modder', cell: '0-0' }]),
    '(ix) marking a gear stack at qty 3 SPLITS one copy off: qty 2, then a qty-1 line right after it carrying the mark (R-M8G-15)', S(g));
}
// (x)
{
  const fx = CR.ownedItemEffects(sh, cb);
  check(S(fx.map((f) => [f.section, f.index, f.op, f.amount, f.source])) === S([['weapons', 0, 'hard_points_delta', 1, 'Tinkerer'], ['weapons', 1, 'hard_points_delta', 1, 'Tinkerer']]),
    '(x) ownedItemEffects: one hard_points_delta +1 per live mark', S(fx));
  const disp = { weapons: [{ name: 'a', hp: 2 }, { name: 'b', hp: null }], gear: [], armor: null };
  const keep = disp.weapons[0];
  IR.applyCharacterEffects(disp, fx);
  check(disp.weapons[0].hp === 3 && disp.weapons[1].hp === 1 && keep.hp === 2 && disp.weapons[0] !== keep && disp.weapons[0]._talentEffects[0].source === 'Tinkerer',
    '(x) applyCharacterEffects bumps hp on a COPY (none printed = 0), never the object it was given', S(disp.weapons));
}
// (x) effectClass: the row type has its class, as every other row type does
{
  const EC = require('../lib/shared/effectClass.js');
  const lines = EC.linesOf ? EC.linesOf(cb.talents.tinkerer, 'talents') : null;
  check(Array.isArray(lines) && lines.some((l) => l.field === 'item_effects' && l.cls === 'resolves') && EC.classOfItemEffect && EC.classOfItemEffect({}) === 'resolves',
    "(x) effectClass: tinkerer's item_effects row classes RESOLVES (projected and computed)", S(lines));
}
// (xi) (xii) — through the re-based resolveSheetEquipment, as both hosts load it
{
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {};
  vm.createContext(sb);
  for (const f of ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/sheetPool.js']) {
    sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f });
  }
  sb._canonicalCharbuild = cb;
  sb.SWRPGItemRegistries = { forStampSync: () => ({ weapons: W, armor: A, gear: G }) };
  const saved = S(sh.equipment);
  const eq = sb.SWRPGSheetPool.resolveSheetEquipment(sh.equipment, sh);
  const plain = sb.SWRPGSheetPool.resolveSheetEquipment(base().equipment, base());
  check(eq.weapons[0].hp === Number(W[wId].hardpoints) + 1 && eq.weapons[1].hp === Number(W[w2Id].hardpoints) + 1 && eq.armor.hp === plain.armor.hp && plain.weapons[0].hp === Number(W[wId].hardpoints),
    '(xi) resolveSheetEquipment shows hp + 1 on each marked weapon only (unmarked armor and the unmarked sheet unchanged)', [eq.weapons[0].hp, eq.weapons[1].hp, eq.armor.hp, plain.weapons[0].hp].join(','));
  check(S(sh.equipment) === saved, '(xi) …and the saved equipment is byte-equal after (projected, never written)');
  const lost = clone(sh); lost.equipment.weapons.splice(0, 1);
  const eqL = sb.SWRPGSheetPool.resolveSheetEquipment(lost.equipment, lost);
  check(eqL.weapons.length === 1 && eqL.weapons[0].hp === Number(W[w2Id].hardpoints) + 1 && CR.ownedItemEffects(lost, cb).length === 1,
    '(xii) a LOST item fails its pick closed: nothing projected for it, the other mark still does', S(CR.ownedItemEffects(lost, cb)));
}
// (xiii) R-M8G-25: ONE tree holding the talent twice — modder's tinkerer at 0-0 AND 1-1, each rank marking its own item.
// The pair (spec, cell) is the address; a matcher that drops `cell` folds the two ranks onto one item.
{
  let two = { specializations: [{ id: 'modder', owned: ['0-0', '1-1'] }], equipment: clone(base().equipment) };
  two = apply(two, write(two, 'modder', '0-0', { section: 'weapons', index: 0 }));
  two = apply(two, write(two, 'modder', '1-1', { section: 'weapons', index: 1 }));
  const own = (cell) => CR.pickOf(two, 'modder', cell, 'item', { talent: 'tinkerer' });
  check(S(own('0-0')) === S({ section: 'weapons', index: 0 }) && S(own('1-1')) === S({ section: 'weapons', index: 1 }),
    "(xiii) modder's tinkerer at 0-0 and 1-1: each rank's pickOf resolves its OWN item (weapons[0], weapons[1])", S([own('0-0'), own('1-1')]));
  const fx = CR.ownedItemEffects(two, cb);
  check(S(fx.map((f) => [f.section, f.index, f.op, f.amount])) === S([['weapons', 0, 'hard_points_delta', 1], ['weapons', 1, 'hard_points_delta', 1]]),
    '(xiii) …both items project +1 hard point', S(fx));
  const re = apply(two, write(two, 'modder', '1-1', { section: 'armor', index: 0 }));
  check(S(marksOf(re.equipment.weapons[0])) === S([{ talent: 'tinkerer', spec: 'modder', cell: '0-0' }]) && !marksOf(re.equipment.weapons[1]).length
    && S(marksOf(re.equipment.armor)) === S([{ talent: 'tinkerer', spec: 'modder', cell: '1-1' }]),
    "(xiii) …re-picking rank 2 (1-1 → the worn armor) never lifts rank 1's mark", S(re.equipment));
}
// (xiv) R-M8G-28: the one mark rule's STAT-BLOCK leg — the sheet's Unarmed (a catalogue Rules Profile: no stat block, no
// hard points, EotE Core p.187/p.211) takes no mark, by the writer and by the validator's problem list; a Brawl weapon
// that is real equipment (Brass Knuckles) stays eligible. The records come in as charbuild.items, as the validator passes them.
{
  const cbI = Object.assign({}, cb, { items: { weapons: W, armor: A, gear: G } });
  check(W.unarmed && W.unarmed.type === 'Rules Profile' && W.brass_knuckles && W.brass_knuckles.skill === 'brawl' && W.brass_knuckles.type !== 'Rules Profile',
    '(xiv) the fixture: unarmed is the catalogue Rules Profile, brass_knuckles a Brawl weapon that is equipment', S([W.unarmed && W.unarmed.type, W.brass_knuckles && W.brass_knuckles.type]));
  const fists = { specializations: [{ id: 'modder', owned: ['0-0'] }], equipment: { weapons: [{ id: 'unarmed' }, { id: 'brass_knuckles' }], gear: [], armor: null, credits: 0 } };
  const no = CR.pickWrite(fists, cbI, 'tinkerer', 'modder', '0-0', 'item', { section: 'weapons', index: 0 });
  check(!!(no && no.refused && /R-M8G-28/.test(no.refused)) && !S(fists.equipment).includes('talentMarks'),
    '(xiv) pickWrite REFUSES a Tinkerer mark on Unarmed (and writes nothing)', S(no));
  const yes = CR.pickWrite(fists, cbI, 'tinkerer', 'modder', '0-0', 'item', { section: 'weapons', index: 1 });
  check(!!(yes && yes.equipment) && S(marksOf(yes.equipment.weapons[1])) === S([{ talent: 'tinkerer', spec: 'modder', cell: '0-0' }]),
    '(xiv) …and marks Brass Knuckles (a Brawl weapon that is equipment)', S(yes));
  const placed = clone(fists); placed.equipment.weapons[0].talentMarks = [{ talent: 'tinkerer', spec: 'modder', cell: '0-0' }];
  const probs = CR.itemMarkProblems(placed, cbI);
  check(probs.length === 1 && /^weapons\[0\]: .*R-M8G-28/.test(probs[0]),
    '(xiv) a hand-placed mark on Unarmed is a problem for the validator (L1cb.mark reads this list)', S(probs));
  check(CR.itemMarkRefusal(placed, cbI, 'weapons', placed.equipment.weapons[1]) === null && CR.itemMarkRefusal(placed, cb, 'weapons', placed.equipment.weapons[0]) === null,
    '(xiv) itemMarkRefusal: equipment is never refused; with no item registry to read, nothing is refused here', 'x');
}

// ── WRITERS (R-M8G-14) ──
const APP = read('player/app.jsx'), VIEW = read('lib/store/view.jsx');
function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — the source moved; fix the slice.');
  let k = src.indexOf('{', i + header.length - 1), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}
const M = { talent: 'tinkerer', spec: 'modder', cell: '0-0' };
// (w1) (w2)
{
  global.window = {};
  global.React = { createElement() { return null; }, Fragment: 'fragment', useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect() {}, useRef: () => ({ current: null }), useMemo: (f) => f(), useCallback: (f) => f };
  require('../lib/store/glyphs.js'); require('../lib/store/rarity.js'); require('../lib/store/view.js');
  const ST = global.window.SWRPGStore;
  const eq0 = { weapons: [], gear: [{ id: gId, qty: 1, talentMarks: [M] }], credits: 1000 };
  const out = ST.buildNextEquipment(eq0, [{ itemId: gId, section: 'gear', qty: 1, priceEach: 10 }]);
  const gOut = out.next.gear;
  check(gOut.length === 2 && gOut[0].qty === 1 && S(gOut[0].talentMarks) === S([M]) && gOut[1].qty === 1 && !gOut[1].talentMarks,
    '(w1) store buildNextEquipment: a copy bought never stacks onto the marked entry — it is a new line without the mark', S(gOut));
  const eq1 = { weapons: [], gear: [{ id: gId, qty: 1 }], credits: 1000 };
  const o1 = ST.buildNextEquipment(eq1, [{ itemId: gId, section: 'gear', qty: 1, priceEach: 10 }]);
  const g1 = o1.next.gear;
  check(g1.length === 1 && g1[0].qty === 2, '(w1) …an UNMARKED entry still stacks (qty 2)', S(g1));
  // the rule itself, read from SOURCE (view.js is a build artifact): a mutant on view.jsx must reach this leg
  const stackTargetOf = new Function(sliceDecl(VIEW, 'function stackTargetOf(gear, refId, inline) {') + '\nreturn stackTargetOf;')();
  check(stackTargetOf([{ id: 'x', talentMarks: [M] }], 'x') === undefined && !!stackTargetOf([{ id: 'x' }], 'x') && typeof ST.stackTargetOf === 'function',
    '(w2) stackTargetOf (source): a marked entry is never a stack target; an unmarked one is');
  const calls = (VIEW.match(/var hit = stackTargetOf\(gear, refId, ref\._inline\);/g) || []).length;
  // B-1161 (R-B1161-11): MOVE TO INVENTORY's write lives in the pure moveToInventoryNext, which moveToInventoryFor calls
  const mtf = sliceDecl(VIEW, 'function moveToInventoryNext(equipment, item, refOf, stamp) {');
  check(calls === 2 && /stackTargetOf\(gear, refId, ref\._inline\)/.test(mtf) && /stackTargetOf\(gear, refId, ref\._inline\)/.test(sliceDecl(VIEW, 'function buildNextEquipment(equipment, cart, byId, vplan, refOf, parts) {')) && !/gear\.find\(/.test(mtf),
    '(w2) both stacking writes (buildNextEquipment, moveToInventoryFor) ask stackTargetOf, and moveToInventoryFor keeps no find of its own', 'calls ' + calls);
}
// (w3)
{
  const wear = new Function('persistedEq', 'patch', 'setSelected', sliceDecl(APP, 'function wear(spareIdx) {') + '\nreturn wear;');
  let got = null;
  const pe = { armor: { id: aId, state: 'worn', talentMarks: [M] }, gear: [{ id: aId, qty: 1 }], weapons: [] };
  wear(pe, (u) => { got = u; }, () => {})(0);
  check(got && S(got.equipment.gear[0].talentMarks) === S([M]) && got.equipment.gear[0].state === 'carried' && !got.equipment.armor.talentMarks,
    '(w3) wear: the marked worn suit goes back to the pack WITH its mark', S(got && got.equipment));
  let got2 = null;
  wear(got.equipment, (u) => { got2 = u; }, () => {})(got.equipment.gear.length - 1);
  check(got2 && S(got2.equipment.armor.talentMarks) === S([M]) && got2.equipment.armor.state === 'worn',
    '(w3) …and wearing it again keeps the mark on the suit (both ways)', S(got2 && got2.equipment));
}
// (w4)
{
  const env = 'var out = null; function patchEquipment(u) { out = u; }\n';
  const pis = new Function(env + sliceDecl(APP, 'function persistItemState(persistedEq, patchEquipment, kind, idx, newState, extra) {') + '\nreturn function (eq, k, i, s) { persistItemState(eq, patchEquipment, k, i, s); return out; };')();
  const pst = new Function(env + sliceDecl(APP, 'function persistStowage(persistedEq, patchEquipment, kind, idx, stowage) {') + '\nreturn function (eq, k, i, s) { persistStowage(eq, patchEquipment, k, i, s); return out; };')();
  const eq = { weapons: [{ id: wId, talentMarks: [M] }], gear: [{ id: gId, qty: 1, talentMarks: [M] }], armor: { id: aId, talentMarks: [M] } };
  const ok = (o, k) => o && S((Array.isArray(o[k]) ? o[k][0] : o[k]).talentMarks) === S([M]);
  check(ok(pis(eq, 'weapon', 0, 'stowed'), 'weapons') && ok(pis(eq, 'gear', 0, 'carried'), 'gear') && ok(pis(eq, 'armor', 0, 'carried'), 'armor'),
    '(w4) persistItemState keeps the mark (weapon, gear, armor)');
  check(ok(pst(eq, 'weapon', 0, 'ship'), 'weapons') && ok(pst(eq, 'gear', 0, 'ship'), 'gear') && ok(pst(eq, 'armor', 0, 'ship'), 'armor'),
    '(w4) persistStowage keeps the mark (weapon, gear, armor)');
  // B-1403 (R-B1403-7): the panel's writers reach the ONE writer, ItemResolve.writeAttachment, through `writeAtt` and
  // hand the whole next equipment to onSheetChange; the harness slices `writeAtt` too and reads either sink.
  const panel = ['function updateItem(patchObj) {', 'function writeAtt(op) {', 'function removeAttachment(attIdx) {', 'function addAttachment(attId) {']
    .map((h) => (APP.indexOf(h) >= 0 ? sliceDecl(APP, h) : '')).join('\n');
  const mk = new Function('kind', 'idx', 'persistedEq', 'persisted', 'attachmentReg', 'hpAcct', 'IR', 'canonRec', 'itemHp',
    'var out = null; function patchEquipment(u) { out = Object.assign({}, persistedEq, u); } function onSheetChange(u) { out = u.equipment; }\n' + panel + '\nreturn { add: function (a) { addAttachment(a); return out; }, mod: function (i, m) { writeAtt({ op: "mod-add", index: i, mod: m, registry: attachmentReg }); return out; }, rm: function (i) { removeAttachment(i); return out; } };');
  const pe = { weapons: [{ id: wId, talentMarks: [M], attachments: [{ id: 'att', mods: [] }] }] };
  const P = mk('weapon', 0, pe, pe.weapons[0], { att: { hp: 1, added_mods: [{ description: 'x' }] }, att2: { hp: 1 } }, { used: 0, uncosted: 0, capacity: 5 }, IR, null, 5);
  const a = P.add('att2'), m = P.mod(0, 'mod_0'), d = P.rm(0);   // release-r5-f1-c0 L1: the pack's chip is retired; D1's mod-add through the same writeAtt
  check([a, m, d].every((o) => o && S(o.weapons[0].talentMarks) === S([M])) && a.weapons[0].attachments.length === 2,
    '(w4) attachments added / removed and an option installed (writeAtt) keep the mark');
}
// (w5)
{
  const sell = new Function(sliceDecl(APP, 'function loadoutSellUpdate(persistedEq, t, amount) {') + '\nreturn loadoutSellUpdate;')();
  const rm = new Function('var out = null; function patchEquipment(u) { out = u; }\n' + sliceDecl(APP, 'function persistRemoveItem(persistedEq, patchEquipment, kind, idx) {') + '\nreturn function (eq, k, i) { persistRemoveItem(eq, patchEquipment, k, i); return out; };')();
  const eq = { weapons: [{ id: wId, talentMarks: [M] }, { id: w2Id }], gear: [{ id: gId, qty: 1, talentMarks: [M] }], armor: { id: aId, talentMarks: [M] }, credits: 0 };
  const s1 = sell(eq, { kind: 'weapon', idx: 0 }, 5), s2 = sell(eq, { kind: 'gear', idx: 0 }, 5), s3 = sell(eq, { kind: 'armor', idx: 0 }, 5);
  const left = (o) => S(o).split('talentMarks').length - 1;   // three marks in; selling one entry leaves the other two
  check(s1.weapons.length === 1 && !s1.weapons[0].talentMarks && s2.gear.length === 0 && s3.armor === null && [s1, s2, s3].every((o) => left(o) === 2),
    '(w5) sell drops the mark WITH the entry (weapon, gear at qty 1, armor); nothing re-homes it');
  const r1 = rm(eq, 'weapon', 0), r2 = rm(eq, 'gear', 0), r3 = rm(eq, 'armor', 0);
  check(r1.weapons.length === 1 && !r1.weapons[0].talentMarks && r2.gear.length === 0 && r3.armor === null,
    '(w5) remove drops the mark WITH the entry (weapon, gear, armor)');
}
console.log(`\nf100_m8_item_marks: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
