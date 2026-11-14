#!/usr/bin/env node
/**
 * b1395_jury_rigged_defence_base.cjs — B-1395 (ruling `f100-surfacing-sheet-concept` ADDENDUM 30 F2; R-SRF-5; HANDOFF
 * `release-r7-small-clusters`, `release-r7-bug-burndown` ADDENDUM 160).
 *
 * A Jury Rigged armour's defence step sat INSIDE the armour's base part and was listed as a row too, so the spine printed
 * "Ranged 2" with no mark while its why-sheet read "Ranged 1 → 2 — Jury Rigged". The armour part now reads the armour's
 * own (pre-mod) defence and the step is a row of the one walk (marked `item`, so the sheet's own J6 line still tells it):
 *   (1) the printed numbers do not move (computeDerived: ranged 2, melee 1);
 *   (2) the ranged base is 1 (the armour's own defence), its part "Heavy Battle Armor 1", so the mark reads ↑;
 *   (3) the ranged chain has the Jury Rigged row 1 → 2 and ends on the printed 2; melee is untouched (base 1, no row);
 *   (4) without Jury Rigged nothing moves (base 1 = printed 1, no row);
 *   (5) the sheet's spine does not tell the step twice: its becauseOf leaves the `item` rows to defNotes (source read).
 *
 * Run: node test/b1395_jury_rigged_defence_base.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const payload = (o, k) => (o[k] && typeof o[k] === 'object') ? o[k] : o;
const byId = (o) => Array.isArray(o) ? Object.fromEntries(o.map((r) => [r.id, r])) : o;
const S = (x) => JSON.stringify(x);
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const CR = require('../lib/shared/charResolve.js');
const cb = { specializations: payload(J('specializations.json'), 'specializations'), talents: payload(J('talents.json'), 'talents') };
const W = byId(payload(J('weapons.json'), 'weapons')), A = byId(payload(J('armor.json'), 'armor')), G = byId(payload(J('gear.json'), 'gear'));
const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {};
vm.createContext(sb);
for (const f of ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/sheetPool.js']) {
  sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f });
}
sb._canonicalCharbuild = cb;
sb.SWRPGItemRegistries = { forStampSync: () => ({ weapons: W, armor: A, gear: G }) };
const resolve = (sh) => sb.SWRPGSheetPool.resolveSheetEquipment(sh.equipment, sh);
const write = (sh, spec, cell, pick, value) => {
  const r = CR.pickWrite(sh, cb, 'jury_rigged', spec, cell, pick, value);
  if (r.refused) throw new Error('refused: ' + r.refused);
  return Object.assign({}, sh, r);
};
const bran = () => ({ characteristics: { brawn: 2, agility: 2, intellect: 3, cunning: 2, willpower: 2, presence: 2 },
  derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
  forceRatingBase: 0, woundBase: 10, strainBase: 10,
  specializations: [{ id: 'gadgeteer', owned: ['1-1'] }],
  equipment: { weapons: [], armor: { id: 'heavy_battle_armor', qty: 1, state: 'worn' }, credits: 0 } });

const plain = bran();
let jr = write(bran(), 'gadgeteer', '1-1', 'item', { section: 'armor', index: 0 });
jr = write(jr, 'gadgeteer', '1-1', 'improvement', 'defense_ranged');
const eq = resolve(jr), d = CR.computeDerived(jr, eq, cb), b = CR.derivedBecause(jr, eq, cb);
const txt = (r) => r.from + ' → ' + r.to + ' — ' + r.source;

check(d.rangedDefense === 2 && d.meleeDefense === 1, '(1) B-1395: the printed numbers do not move (ranged 2, melee 1)', S([d.rangedDefense, d.meleeDefense]));
check(b._base.rangedDefense === 1, '(2) B-1395: the ranged base is the armour\'s own defence (1), so the spine marks ↑', b._base.rangedDefense);
check(S((b._baseParts.rangedDefense || []).map((p) => p.text)) === S(['Heavy Battle Armor 1']), '(2) B-1395: the ranged part reads "Heavy Battle Armor 1"',
  S((b._baseParts.rangedDefense || []).map((p) => p.text)));
const rr = b.rangedDefense || [];
check(rr.length >= 1 && rr[0].from === 1 && rr[0].to === 2 && /Jury Rigged/.test(rr[0].source) && rr[0].item === 'armor',
  '(3) B-1395: the ranged chain opens with the Jury Rigged row 1 → 2 (an `item` row)', S(rr));
check(rr.length && rr[rr.length - 1].to === d.rangedDefense, '(3) B-1395: the ranged chain ends on the printed number', S(rr.map(txt)));
check(b._base.meleeDefense === 1 && !(b.meleeDefense || []).length, '(3) B-1395: melee untouched (base 1, no row)', S([b._base.meleeDefense, b.meleeDefense]));

const peq = resolve(plain), pd = CR.computeDerived(plain, peq, cb), pb = CR.derivedBecause(plain, peq, cb);
check(pd.rangedDefense === 1 && pb._base.rangedDefense === 1 && !(pb.rangedDefense || []).length, '(4) B-1395: without Jury Rigged nothing moves',
  S([pd.rangedDefense, pb._base.rangedDefense, pb.rangedDefense]));

const APP = read('player/app.jsx');
const spine = APP.slice(APP.indexOf('function SheetSpine('), APP.indexOf('function SheetSpine(') + 6000);
check(/var becauseOf = function \(k\) \{ return \(because\[k\] \|\| \[\]\)\.filter\(function \(r\) \{ return !r\.item; \}\)/.test(spine),
  '(5) B-1395: the spine\'s becauseOf leaves `item` rows to its J6 defNotes (no line told twice)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
