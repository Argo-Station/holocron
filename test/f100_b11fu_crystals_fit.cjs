#!/usr/bin/env node
/**
 * f100_b11fu_crystals_fit.cjs — B-1198 and B-1200, as ruled (`f100-b1189-followups-card` ADDENDUM 1, R-B11FU-5..8).
 * A sibling of f100_b1199_no_rating.cjs, on the same sandbox. Reads the SERVED registries.
 *
 *   B-1198 · A NEW CRYSTAL REPLACES THE HILT'S PRINTED CRYSTAL (R-B11FU-5; FaD p.196)
 *     (d1)  Basic Lightsaber + Dantari → Breach 1, Sunder (was Breach 2: the Ilum's Breach stacked)        ← the ACCEPTANCE leg
 *     (d2)  Basic Lightsaber + Ilum → Breach 1, Sunder (its own crystal again, not doubled)
 *     (d3)  Training lightsaber + Ilum → Breach 1, Sunder: the emitter's Stun Damage leaves with it (FaD p.178 "full-powered")
 *     (d4)  Basic Lightsaber + Lorrdian → Breach 1, Defensive 1, Sunder (R-B11FU-8, FaD p.198–199)
 *     (d5)  Basic Lightsaber + Kimber stone → Stun Damage, Crit 0 (R-B11FU-8, KtP p.55 "-")
 *     (d6)  SYNTHETIC: a defaulted host printing Breach 2 + Dantari → Breach 2, Sunder: a ranked quality loses the default's
 *           rank, not the whole quality (no shipped host outranks its crystal, so only a synthetic record reaches the line)
 *     (c1)  CONTROL: Basic Lightsaber + a non-crystal attachment (no set) → its own Breach 1, Sunder; nothing taken off
 *     (c2)  CONTROL: a host that prints no default (crossguard) + Dantari → its record + Dantari, unchanged (Q2)
 *   Q4 · THE KRAYT DRAGON PEARL REPLACES THE ITEM QUALITIES (R-B11FU-6; FaD p.198)
 *     (k1)  Shoto + Krayt → Breach 1, Sunder, Vicious 1 (the shoto's Accurate 1 goes, as printed)          ← the ACCEPTANCE leg
 *     (k2)  Crossguard (no default) + Krayt → Breach 1, Sunder, Vicious 1 (its Defensive 1 goes)
 *   B-1200 · A WEAPON WITH NO CATEGORY IS REFUSED A CATEGORY-LIMITED ATTACHMENT (R-B11FU-7)
 *     (f1)  Z2 stun baton (now Bludgeoning/Powered Melee, Far Horizons p.42–43) + Ilum → refused, "Lightsaber only"
 *     (f2)  bola_net (the page names no kind) + Ilum → refused, "Lightsaber only — this one is uncategorised"
 *     (f3)  Z2 stun baton + Weighted Head (Bludgeoning Melee) → fits, evaluated (no "uncategorised" note)
 *     (f4)  an uncategorised ARMOUR (the Individual Field Disruptor) + Armor Spikes (Full Body / Half Body) → REFUSED,
 *           "Full Body or Half Body only — this one is uncategorised", nothing unevaluated (R-M12C-69: armour takes the
 *           weapon posture)
 *   RE-POINTED by R-M12B-37 (f100-m12-build-card ADDENDUM 12): (f4) was a fail-open CONTROL (fits, unevaluated; B-1232) and
 *   is now the refusal leg above; (p0)'s uncategorised-armour premise re-aims from diplomat_s_robes (categorised by
 *   R-M12C-69) to individual_field_disruptor, by id. Every other premise and leg is unchanged.
 *
 * The bite harness (scripts/f100_b1189fu_bites.cjs) runs this file over mutated copies of itemResolve.js, passed by
 * B11FU_ITEMRESOLVE=<path>, and reads the EXIT CODE.
 *
 * Run: node test/f100_b11fu_crystals_fit.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');
const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const S = (x) => JSON.stringify(x);
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const W = J('weapons.json').weapons, ATT = J('attachments.json').attachments, AR = J('armor.json').armor;

const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
vm.createContext(sb);
for (const f of ['lib/items.js', process.env.B11FU_ITEMRESOLVE || 'lib/shared/itemResolve.js']) {
  sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f });
}
const IR = sb.ItemResolve;

const at = (id) => ({ id: id, mods: [] });
const qs = (rec) => (rec.qualities || []).map((q) => q.id + (q.ranked ? ' ' + q.rank : '')).sort().join(', ');
const on = (host, ids) => IR.applyInstalledAttachments('weapon', W[host], ids.map(at), ATT);
const fitW = (w, a) => IR.attachmentFit(W[w], ATT[a], { kind: 'weapon' });

console.log('B-1198 / B-1200 · CRYSTAL SWAPS AND UNCATEGORISED WEAPONS (f100-b1189-followups-card R-B11FU-5..8)');

// the fixture's premises, so a data change cannot turn a leg vacuous
check(W.basic_lightsaber.crystal_default === 'ilum_crystal' && W.training_lightsaber.crystal_default === 'training_lightsaber_emitter' &&
  W.shoto.crystal_default === 'ilum_crystal' && W.crossguard_lightsaber.crystal_default === undefined &&
  qs(W.basic_lightsaber) === 'breach 1, sunder' && qs(W.shoto) === 'accurate 1, breach 1, sunder' &&
  qs(W.crossguard_lightsaber) === 'breach 1, defensive 1, sunder' &&
  qs({ qualities: ATT.dantari_crystal.qualities_add.map((q) => ({ id: q.key, ranked: q.rank != null, rank: q.rank })) }) === 'breach 1, sunder' &&
  ATT.krayt_dragon_pearl.qualities_replace === true && ATT.dantari_crystal.qualities_replace === undefined &&
  !W.bola_net.categories && W.stun_baton.categories && ATT.weighted_head.constraints.category_limit.indexOf('Bludgeoning Melee') >= 0 &&
  !(AR.individual_field_disruptor.categories || []).length && (ATT.armor_spikes.constraints.category_limit || []).length > 0,
  '(p0) the premises: the defaults recorded (basic, training, shoto; none on the crossguard); the hosts\' printed qualities; ' +
  'Dantari Breach 1 + Sunder; only the Krayt pearl replaces; bola_net uncategorised, the stun baton categorised; the Individual Field Disruptor uncategorised (R-M12C-69)');

// B-1198
check(qs(on('basic_lightsaber', ['dantari_crystal'])) === 'breach 1, sunder',
  '(d1) Basic Lightsaber + Dantari → Breach 1, Sunder (FaD p.196)', qs(on('basic_lightsaber', ['dantari_crystal'])));
check(qs(on('basic_lightsaber', ['ilum_crystal'])) === 'breach 1, sunder',
  '(d2) Basic Lightsaber + Ilum → Breach 1, Sunder, not doubled', qs(on('basic_lightsaber', ['ilum_crystal'])));
check(qs(on('training_lightsaber', ['ilum_crystal'])) === 'breach 1, sunder',
  '(d3) Training lightsaber + Ilum → Breach 1, Sunder; the emitter\'s Stun Damage leaves with it', qs(on('training_lightsaber', ['ilum_crystal'])));
check(qs(on('basic_lightsaber', ['lorrdian_gemstone'])) === 'breach 1, defensive 1, sunder',
  '(d4) Basic Lightsaber + Lorrdian → Breach 1, Defensive 1, Sunder (FaD p.198–199)', qs(on('basic_lightsaber', ['lorrdian_gemstone'])));
{
  const r = on('basic_lightsaber', ['kimber_stone']);
  check(qs(r) === 'stun_damage' && r.crit === 0, '(d5) Basic Lightsaber + Kimber stone → Stun Damage, Crit 0 (KtP p.55)', qs(r) + ' crit ' + r.crit);
}
{
  const rec = Object.assign({}, W.basic_lightsaber, { id: 'b11fu_breach2', qualities: W.basic_lightsaber.qualities.map((q) => q.id === 'breach' ? Object.assign({}, q, { rank: 2 }) : q) });
  const r = IR.applyInstalledAttachments('weapon', rec, [at('dantari_crystal')], ATT);
  check(qs(r) === 'breach 2, sunder', '(d6) SYNTHETIC: a defaulted host printing Breach 2 + Dantari → Breach 2, Sunder (the default\'s rank off, not the quality)', qs(r));
}
check(qs(on('basic_lightsaber', ['enhanced_xciter'])) === 'breach 1, sunder',
  '(c1) CONTROL: Basic Lightsaber + a non-crystal attachment → Breach 1, Sunder, nothing taken off', qs(on('basic_lightsaber', ['enhanced_xciter'])));
check(qs(on('crossguard_lightsaber', ['dantari_crystal'])) === 'breach 2, defensive 1, sunder',
  '(c2) CONTROL: a host with no printed default (crossguard) + Dantari → its record + Dantari, unchanged (Q2)', qs(on('crossguard_lightsaber', ['dantari_crystal'])));

// Q4
check(qs(on('shoto', ['krayt_dragon_pearl'])) === 'breach 1, sunder, vicious 1',
  '(k1) Shoto + Krayt dragon pearl → Breach 1, Sunder, Vicious 1 (FaD p.198 "replaces its item qualities")', qs(on('shoto', ['krayt_dragon_pearl'])));
check(qs(on('crossguard_lightsaber', ['krayt_dragon_pearl'])) === 'breach 1, sunder, vicious 1',
  '(k2) Crossguard + Krayt dragon pearl → Breach 1, Sunder, Vicious 1', qs(on('crossguard_lightsaber', ['krayt_dragon_pearl'])));

// B-1200
{
  const f = fitW('stun_baton', 'ilum_crystal');
  check(!f.fits && S(f.reasons) === S(['Lightsaber only']), '(f1) Z2 stun baton + Ilum → refused, "Lightsaber only"', S(f));
}
{
  const f = fitW('bola_net', 'ilum_crystal');
  check(!f.fits && S(f.reasons) === S(['Lightsaber only — this one is uncategorised']) && !f.unevaluated.length,
    '(f2) bola_net (no kind printed) + Ilum → refused, "Lightsaber only — this one is uncategorised"', S(f));
}
{
  const f = fitW('stun_baton', 'weighted_head');
  check(f.fits && !f.unevaluated.some((u) => /uncategorised/.test(u)), '(f3) Z2 stun baton + Weighted Head (Bludgeoning Melee) → fits, evaluated', S(f));
}
{
  const f = IR.attachmentFit(AR.individual_field_disruptor, ATT.armor_spikes, { kind: 'armor' });
  check(!f.fits && S(f.reasons) === S(['Full Body or Half Body only — this one is uncategorised']) && !f.unevaluated.length,
    '(f4) the uncategorised Individual Field Disruptor + Armor Spikes → REFUSED, nothing unevaluated (R-M12C-69)', S(f));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
