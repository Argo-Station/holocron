#!/usr/bin/env node
/**
 * f100_m12_editor_when_pending.cjs — f100-m12-build-card ADDENDUM 31 R-M12B-104: the career form's "Only while wearing armour"
 * Yes writes `when: "armored"` on EVERY non-zero Attributes row (the drawing stands, D-157). The engine half is the M12 builder's:
 * charResolve's career `when` loop must honour wound_threshold_delta / strain_threshold_delta as well as soak and defence.
 * "Until the engine half merges, the gate shows a wound row under `when` as a NAMED pending leg, not a pass."
 *
 * The legs (R-M12B-104's engine half, landed: the PENDING leg is a real assert now; the file keeps its name):
 *   E1/E2  a Soldier pregen whose career carries the rows the editor writes for +1 wound, +1 strain under Yes:
 *          computeDerived moves both thresholds by +1 with armour worn and by 0 with none.
 *   E3     ABOVE THE LEGACY FLOOR (as MV3's itemStrain, R-M12B-60): a sheet whose snapshot holds higher thresholds
 *          still gains the +1 with armour worn — a snapshot never absorbs a row that holds only while armoured.
 *   E4     TALENTS ALIKE: Armor Master planted with a wound +1 / strain +1 row under `when: "armored"`
 *          moves both by +1 with armour worn. (post1-switch-deletion, ADDENDUM 638: M12's key is gone; E4's key-OFF
 *          half, the planted talent THROWING as before the arm, went with it, table 3.)
 *   E5     an UNKNOWN op under a `when` (force_rating_delta, armoured) still THROWS, career and talent.
 *
 * Run: node test/f100_m12_editor_when_pending.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = (f) => JSON.parse(rd('public/data/canonical/' + f));
const clone = (x) => JSON.parse(JSON.stringify(x));
const FILES = ['lib/items.js', 'lib/shared/itemResolve.js',
  'lib/shared/charResolve.js', 'lib/shared/diceEngine.js', 'lib/shared/effectClass.js', 'lib/shared/poolMods.js', 'lib/shared/itemRegistries.js', 'lib/shared/sheetPool.js'];
let fails = 0, n = 0;
const check = (ok, label) => { n++; if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + label); };

// the career world, as test/f100_m12_career_powers.cjs builds it
function world(over) {
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set, Symbol, Error };
  sb.window = sb; sb.global = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
  vm.createContext(sb);
  FILES.forEach((f) => { sb.module = { exports: {} }; vm.runInContext(rd(f), sb, { filename: f }); });
  sb.module = undefined;
  const vocab = C('skills.vocab.json').entries;
  sb._canonicalRegistries = { skills: vocab, weapons: C('weapons.json').weapons, armor: C('armor.json').armor, gear: C('gear.json').gear, attachments: C('attachments.json').attachments };
  sb._canonicalRegistriesBase = sb._canonicalRegistries;
  const cb = { species: C('species.json').species, careers: C('careers.json').careers, specializations: C('specializations.json').specializations,
    talents: C('talents.json').talents, forcePowers: C('force_powers.json').force_powers, skillSheetKeys: {}, skillChars: {}, skillNames: {}, skillGroups: {} };
  vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; cb.skillNames[e.id] = e.label;
    if (e.characteristic) cb.skillChars[e.id] = e.characteristic; if (e.group) cb.skillGroups[e.id] = e.group; });
  if (over) over(cb);
  sb._canonicalCharbuild = cb; sb._canonicalCharbuildBase = cb;
  return { CR: sb.CharResolve, cb, sb };
}

console.log('f100_m12_editor_when_pending — R-M12B-104: a wound/strain Attributes row under the editor\'s Yes (`when: "armored"`)');
// the rows the career form writes for "+1 extra wound threshold, +1 extra strain threshold, Only while wearing armour: Yes"
const YES = [{ op: 'wound_threshold_delta', amount: 1, when: 'armored' }, { op: 'strain_threshold_delta', amount: 1, when: 'armored' }];
const withCareer = (effects) => (cb) => { cb.careers = Object.assign({}, cb.careers, { soldier: Object.assign({}, cb.careers.soldier, { effects }) }); };
const withTalent = (rows) => (cb) => { cb.talents = Object.assign({}, cb.talents, { armor_master: Object.assign({}, cb.talents.armor_master, {
  effects: (cb.talents.armor_master.effects || []).concat(rows) }) }); };
const W1 = world(withCareer(YES));
const W0 = world();
const base = JSON.parse(rd('public/data/pregen_sheets.json')).characters.find((c) => /soldier/i.test(String(c.career || '')));
check(!!base, 'a Soldier pregen to plant on: ' + (base && base.name));
const none = { weapons: [], armor: null, gear: [] }, worn = { weapons: [], gear: [], armor: { soak: 1, defense: 0 } };
const tryRun = (fn) => { try { return { v: fn() }; } catch (e) { return { err: e.message }; } };
const dW = (a, b) => (a.woundThreshold - b.woundThreshold) + '/' + (a.strainThreshold - b.strainThreshold);
if (base) {
  // E1 / E2
  const r = tryRun(() => ({ on: W1.CR.computeDerived(clone(base), worn, W1.cb), off: W1.CR.computeDerived(clone(base), none, W1.cb) }));
  const on0 = W0.CR.computeDerived(clone(base), worn, W0.cb), off0 = W0.CR.computeDerived(clone(base), none, W0.cb);
  check(!r.err && dW(r.v.on, on0) === '1/1', 'E1 career, armour worn: wound/strain +' + (r.err ? 'THREW ' + r.err.slice(0, 120) : dW(r.v.on, on0)) + ' (want 1/1)');
  check(!r.err && dW(r.v.off, off0) === '0/0', 'E2 career, no armour: wound/strain +' + (r.err ? 'THREW' : dW(r.v.off, off0)) + ' (want 0/0)');
  // E3 — above the legacy floor: a snapshot 3 above the computed thresholds
  const hi = clone(base);
  hi.derived = Object.assign({}, hi.derived || {}, { woundThreshold: on0.woundThreshold + 3, strainThreshold: on0.strainThreshold + 3 });
  const h1 = tryRun(() => W1.CR.computeDerived(clone(hi), worn, W1.cb)), h0 = W0.CR.computeDerived(clone(hi), worn, W0.cb);
  check(h0.woundThreshold === on0.woundThreshold + 3, 'E3 control: the snapshot floor binds without the row (' + h0.woundThreshold + ' = ' + (on0.woundThreshold + 3) + ')');
  check(!h1.err && dW(h1.v, h0) === '1/1', 'E3 career, snapshot-floored sheet, armour worn: +' + (h1.err ? 'THREW' : dW(h1.v, h0)) + ' above the floor (want 1/1)');
  // E4 — talents alike, key-asked
  const am = clone(base);
  am.talents = Object.assign({}, am.talents || {});
  am.derivedConditional = ['armor_master'];
  const WT = world(withTalent(YES)), WT0 = world();
  const t1 = tryRun(() => WT.CR.computeDerived(clone(am), worn, WT.cb)), t0 = WT0.CR.computeDerived(clone(am), worn, WT0.cb);
  check(!t1.err && dW(t1.v, t0) === '1/1', 'E4 talent (Armor Master + the planted rows), armour worn: +' + (t1.err ? 'THREW ' + t1.err.slice(0, 120) : dW(t1.v, t0)) + ' (want 1/1)');
  const tn = tryRun(() => WT.CR.computeDerived(clone(am), none, WT.cb)), tn0 = WT0.CR.computeDerived(clone(am), none, WT0.cb);
  check(!tn.err && dW(tn.v, tn0) === '0/0', 'E4 talent, no armour: +' + (tn.err ? 'THREW' : dW(tn.v, tn0)) + ' (want 0/0)');
  // E5 — an unknown op under a `when` still throws
  const BAD = [{ op: 'force_rating_delta', amount: 1, when: 'armored' }];
  const WB = world(withCareer(BAD)), WBt = world(withTalent(BAD));
  const b1 = tryRun(() => WB.CR.computeDerived(clone(base), worn, WB.cb)), b2 = tryRun(() => WBt.CR.computeDerived(clone(am), worn, WBt.cb));
  check(!!b1.err && /op under a `when`/.test(b1.err), 'E5 career: force_rating_delta under a `when` THROWS (' + (b1.err ? 'threw' : 'no throw') + ')');
  check(!!b2.err && /op under a `when`/.test(b2.err), 'E5 talent: force_rating_delta under a `when` THROWS (' + (b2.err ? 'threw' : 'no throw') + ')');
}
console.log(fails ? `\nf100_m12_editor_when_pending: ${fails} FAIL of ${n}` : `\nf100_m12_editor_when_pending: ALL PASS (${n})`);
process.exit(fails ? 1 : 0);
