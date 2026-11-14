#!/usr/bin/env node
/**
 * f100_b1199_no_rating.cjs — B-1199: an attachment's Critical change never GIVES a rating to a weapon that has none
 * (ruling `f100-b1189-followups-card` R-B11FU-1). `applyInstalledAttachments` floors `crit_mod` and the `crit_delta`
 * option at 1; a weapon with no printed Critical rating (crit ≤ 0 — FaD p.177 Table 5-7 prints the training lightsaber's
 * Crit as "—") is left alone, as CharResolve's character `crit_delta` op already leaves it ("No printed crit (null, 0) is
 * skipped"). A sibling of f100_b1189_sets.cjs, on the same sandbox minus the app slices (no pool is read here).
 *
 *   NO RATING STAYS NO RATING
 *     (n1)  a training lightsaber (Crit 0) + a Mono-Molecular Edge (base crit_mod −1) → 0, not 1
 *     (n2)  a training lightsaber + Jury Rigged's "Decrease Crit by 1" option (crit_delta −1) → 0, not 1
 *     (n3)  a basic lightsaber + the training emitter (crit_set 0, FaD p.200) + an Enhanced XCiter (crit_mod −1) → 0:
 *           the set leaves no rating and the adjustment after it does not create one
 *     (n4)  the same emitter, then Jury Rigged's crit option → 0 (the option path after a set)
 *     (n5)  SYNTHETIC: a +1 crit_mod on a training lightsaber → 0 — no rating either way, whatever the sign
 *     (n6)  SYNTHETIC: a weapon whose crit is null + a crit_mod → null (unmoved before the fix by construction)
 *   THE FLOOR STILL HOLDS ON A RATED WEAPON (controls: unmoved before the fix by construction; bitten by a mutant that
 *   drops the crit_mod line, recorded in the gate)
 *     (c1)  a blaster pistol (Crit 3) + an Enhanced XCiter → 2
 *     (c2)  a Semblan obsidian dagger (Crit 1) + an Enhanced XCiter → 1 (the floor of 1)
 *     (c3)  a blaster pistol + Jury Rigged's crit option → 2
 *
 * Run: node test/f100_b1199_no_rating.cjs
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

const W = byId(payload(J('weapons.json'), 'weapons'));
const ATT = byId(payload(J('attachments.json'), 'attachments'));

// the B-1185 sandbox (both hosts load these, in this order)
const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
vm.createContext(sb);
for (const f of ['lib/items.js', 'lib/shared/itemResolve.js']) {
  sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f });
}
const IR = sb.ItemResolve;

const fitOn = (rec, atts, reg) => IR.applyInstalledAttachments('weapon', rec, atts, reg || ATT);
const fit = (id, atts) => fitOn(W[id], atts);
const at = (id, mods) => ({ id: id, mods: mods || [] });
const JR = (ATT.jury_rigged_weapon.added_mods || []).findIndex((m) => m.effect && m.effect.type === 'crit_delta');
const jr = () => at('jury_rigged_weapon', ['mod_' + JR]);

console.log('B-1199 · AN ATTACHMENT NEVER GIVES A "NO RATING" WEAPON A CRITICAL RATING (f100-b1189-followups-card R-B11FU-1)');

// the fixture's own premises, so a data change cannot turn a leg vacuous
check(W.training_lightsaber.crit === 0 && ATT.mono_molecular_edge.crit_mod === -1 && ATT.enhanced_xciter.crit_mod === -1 &&
  ATT.training_lightsaber_emitter.crit_set === 0 && JR >= 0 && ATT.jury_rigged_weapon.added_mods[JR].effect.value === -1 &&
  W.blaster_pistol.crit === 3 && W.semblan_obsidian_dagger.crit === 1,
  '(p0) the premises: training lightsaber Crit 0; Mono-Molecular Edge and XCiter −1; emitter sets 0; Jury Rigged option −1; blaster pistol 3; Semblan dagger 1',
  S([W.training_lightsaber.crit, ATT.mono_molecular_edge.crit_mod, ATT.enhanced_xciter.crit_mod, ATT.training_lightsaber_emitter.crit_set, JR]));

// NO RATING STAYS NO RATING
{
  const r = fit('training_lightsaber', [at('mono_molecular_edge')]);
  check(r.crit === 0, '(n1) training lightsaber + Mono-Molecular Edge (crit_mod −1) → 0, no rating', S(r.crit));
}
{
  const r = fit('training_lightsaber', [jr()]);
  check(r.crit === 0, '(n2) training lightsaber + Jury Rigged\'s crit option (crit_delta −1) → 0, no rating', S(r.crit));
}
{
  const r = fit('basic_lightsaber', [at('training_lightsaber_emitter'), at('enhanced_xciter')]);
  check(r.crit === 0, '(n3) basic lightsaber + training emitter (sets 0) + Enhanced XCiter → 0: the set leaves no rating', S(r.crit));
}
{
  const r = fit('basic_lightsaber', [at('training_lightsaber_emitter'), jr()]);
  check(r.crit === 0, '(n4) basic lightsaber + training emitter + Jury Rigged\'s crit option → 0', S(r.crit));
}
{
  const reg = Object.assign({}, ATT, { b1199_plus: { id: 'b1199_plus', name: 'B-1199 synthetic', type: 'weapon', crit_mod: 1 } });
  const r = fitOn(W.training_lightsaber, [at('b1199_plus')], reg);
  check(r.crit === 0, '(n5) SYNTHETIC: training lightsaber + a crit_mod +1 → 0, no rating either way', S(r.crit));
}
{
  const rec = Object.assign({}, W.blaster_pistol, { id: 'b1199_null', crit: null });
  const r = fitOn(rec, [at('enhanced_xciter'), jr()]);
  check(r.crit === null, '(n6) SYNTHETIC: a weapon with crit null + XCiter + Jury Rigged\'s option → null', S(r.crit));
}

// THE FLOOR STILL HOLDS ON A RATED WEAPON
{
  const c1 = fit('blaster_pistol', [at('enhanced_xciter')]);
  check(c1.crit === 2, '(c1) blaster pistol (Crit 3) + Enhanced XCiter → 2', S(c1.crit));
  const c2 = fit('semblan_obsidian_dagger', [at('enhanced_xciter')]);
  check(c2.crit === 1, '(c2) Semblan obsidian dagger (Crit 1) + Enhanced XCiter → 1, the floor', S(c2.crit));
  const c3 = fit('blaster_pistol', [jr()]);
  check(c3.crit === 2, '(c3) blaster pistol + Jury Rigged\'s crit option → 2', S(c3.crit));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
