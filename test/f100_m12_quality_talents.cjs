#!/usr/bin/env node
/* F-100 M12 · THE TALENTS THAT GIVE OR CHANGE A QUALITY (QG1, QK1, QS3): f100-m12-build-card ADDENDUM 22 (R-M12B-67..71) under
 * the qualities paper. Rows authored in scripts/canonical/talent_rows.json, written by apply_talent_effects.py; read by
 * CharResolve.ownedItemEffects and projected by ItemResolve.applyCharacterEffects through the SHIPPED path
 * (SWRPGSheetPool.resolveSheetEquipment, run in a vm over the real registries, as test/f100_b219_quality_rows.cjs does).
 * (post1-switch-deletion, ADDENDUM 638: M12's key is gone; the OFF leg (byte-identical to the sheet without the talents) and
 * its bite (the key check removed) went with it, table 3.)
 *
 *   IB   Ichor Blade (Collapse of the Republic p.40): the MARKED unpowered staff gains Cortosis and Pierce 2, crit 3 → 2;
 *        the peacekeeper stun baton, unmarked, is NOT auto-eligible (R-M12B-68's fixture); marked, it passes (a proxy pass
 *        the attest must catch — disclosed at GATE #1); a marked vibroknife (Powered Melee) gets nothing (the proxy refuses).
 *   IBI  Ichor Blade (Improved): the same staff also gains Sunder and Defensive 1, damage +2 — through Ichor Blade's pick
 *        (item.talent); without Ichor Blade's mark nothing.
 *   AK   Acklay's Scything Strike (Knights of Fate p.30): every Brawl weapon in use — Pierce = Force rating, or an existing
 *        Pierce raised by it (brass knuckles 1 → 3 at FR 2); a melee weapon nothing; Force rating 0 nothing; stowed nothing.
 *   PB   Powerful Blast 2 (AoR p.154; R-M12B-68): frag grenade Blast 6 → 8, a C-88 missile 12 → 14; ion_micro_rocket
 *        unchanged (no Blast, raise_only); a scatter gun's Blast 3 (a Rifle, not an explosive) unchanged.
 *   SI   Sunder (Improved) (Disciples of Harmony p.30): Sunder's spend row reads 2 steps (QS3 → spendRows).
 *   MS   Master Saboteur (reSpecialized, aor-v1): a frag grenade gains Sunder and its row reads 2 steps; a C-88 missile
 *        ("personal-scale explosives" excludes missiles, R-M12B-68) and a blaster rifle nothing.
 *   BITE three mutants each turn a leg red: the kind test removed; raise_only's test removed; the key check removed.
 * Exit 0 only when every leg passes.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const payload = (o, k) => (o[k] && typeof o[k] === 'object') ? o[k] : o;
const S = (x) => JSON.stringify(x);
let legs = 0, failures = 0;
const check = (ok, label, detail) => { legs++; if (ok) console.log('  PASS  ' + label); else { failures++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + String(detail).slice(0, 400) : '')); } };

const W = payload(J('weapons.json'), 'weapons'), A = payload(J('armor.json'), 'armor'), G = payload(J('gear.json'), 'gear');
const ATT = payload(J('attachments.json'), 'attachments');
const QV = J('qualities.vocab.json');
const TALENTS = payload(J('talents.json'), 'talents');
const PACK = JSON.parse(read('public/data/mods/respecialized/aor-v1/talents.overlay.json')).talents;
const CORES = ['lib/items.js', 'lib/shared/charResolve.js', 'lib/shared/qualityRows.js',
  'lib/shared/itemResolve.js', 'lib/shared/sheetPool.js'];

function build(swap) {
  swap = swap || {};
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
  vm.createContext(sb);
  for (const f of CORES) { sb.module = { exports: {} }; vm.runInContext(swap[f] ? swap[f](read(f)) : read(f), sb, { filename: f }); }
  sb._canonicalCharbuild = { talents: Object.assign({}, TALENTS, { respec_mastsabo: PACK.respec_mastsabo }),
    species: payload(J('species.json'), 'species'), specializations: payload(J('specializations.json'), 'specializations'),
    careers: payload(J('careers.json'), 'careers'), skillSheetKeys: {}, skillChars: {} };
  sb.SWRPGItemRegistries = { forStampSync: () => ({ weapons: W, armor: A, gear: G, attachments: ATT }) };
  sb._qualitiesDb = (() => { const m = {}; (QV.entries || []).forEach((q) => { m[q.label.toLowerCase()] = q; (q.aliases || []).forEach((a) => { m[String(a).toLowerCase()] = q; }); }); return m; })();
  return sb;
}
const sheetOf = (weapons, extra) => Object.assign({ characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  skills: {}, talents: [], specializations: [], forceRatingBase: 0, derivedBonuses: {}, equipment: { weapons: weapons, armor: null, gear: [], credits: 0 } }, extra || {});
const wpn = (id, marks, state) => Object.assign({ id: id, qty: 1, state: state || 'carried' }, marks ? { talentMarks: marks } : {});
const IB = { talent: 'ichor_blade', spec: 'nightsister', cell: '1-1' };
const q = (w, id) => { const x = (w._qualitiesRaw || []).filter((y) => y.id === id)[0]; return x ? (x.ranked ? x.rank : true) : null; };
const resolve = (sb, sheet) => sb.SWRPGSheetPool.resolveSheetEquipment(sheet.equipment, sheet).weapons;
const spend = (sb, w) => sb.SWRPGQualityRows.spendRows(w, { vocab: QV.entries });

// the fixture sheets: [label, sheet] — each with its talents (bare(): the same sheet without them)
const NS = (cells) => [{ id: 'nightsister', owned: cells }];
const FIX = {
  ichor: sheetOf([wpn('ashla_staff', [IB]), wpn('peacekeeper_stun_baton')], { specializations: NS(['1-1']) }),
  ichor_baton: sheetOf([wpn('ashla_staff'), wpn('peacekeeper_stun_baton', [IB])], { specializations: NS(['1-1']) }),
  ichor_vibro: sheetOf([wpn('vibroknife', [IB])], { specializations: NS(['1-1']) }),
  ichor_imp: sheetOf([wpn('ashla_staff', [IB])], { specializations: NS(['1-1', '2-1']) }),
  ichor_imp_nomark: sheetOf([wpn('ashla_staff')], { specializations: NS(['1-1', '2-1']) }),
  acklay: sheetOf([wpn('brass_knuckles'), wpn('backhand_shock_gloves'), wpn('ashla_staff'), wpn('brass_knuckles', null, 'stowed')],
    { specializations: [{ id: 'steel_hand_adept', owned: ['1-1'] }], talents: [{ id: 'acklay_s_scything_strike', rank: 1 }], forceRatingBase: 2 }),
  acklay_fr0: sheetOf([wpn('brass_knuckles')], { specializations: [{ id: 'steel_hand_adept', owned: ['1-1'] }], talents: [{ id: 'acklay_s_scything_strike', rank: 1 }], forceRatingBase: 0 }),
  blast: sheetOf([wpn('frag_grenade'), wpn('c_88_fragmentation_missile'), wpn('ion_micro_rocket'), wpn('8_gauge_scatter_gun')],
    { talents: [{ id: 'powerful_blast', rank: 2 }] }),
  sunder: sheetOf([wpn('arg_garok')], { talents: [{ id: 'sunder_improved', rank: 1 }] }),
  sabo: sheetOf([wpn('frag_grenade'), wpn('c_88_fragmentation_missile'), wpn('acp_array_gun')], { talents: [{ id: 'respec_mastsabo', rank: 1 }] }),
};
const bare = (s) => Object.assign({}, s, { talents: [], specializations: [] });

function legsFor(sb, tag) {
  const out = {};
  const ib = resolve(sb, FIX.ichor);
  out.IB1 = [q(ib[0], 'cortosis') === true && q(ib[0], 'pierce') === 2 && ib[0].crit === 2 && ib[0].qualities.indexOf('Pierce 2') !== -1,
    'IB the marked Ashla staff: Cortosis, Pierce 2, crit 3 → 2', S([q(ib[0], 'cortosis'), q(ib[0], 'pierce'), ib[0].crit, ib[0].qualities])];
  out.IB2 = [q(ib[1], 'cortosis') === null && S(ib[1]._qualitiesRaw) === S(resolve(sb, bare(FIX.ichor))[1]._qualitiesRaw),
    'IB the UNMARKED peacekeeper stun baton is NOT auto-eligible (R-M12B-68)', S(ib[1]._qualitiesRaw)];
  const bat = resolve(sb, FIX.ichor_baton);
  out.IB3 = [q(bat[1], 'cortosis') === true && q(bat[0], 'cortosis') === null,
    'IB the stun baton MARKED passes the proxy (a known pass the attest must catch)', S(bat[1]._qualitiesRaw)];
  const vib = resolve(sb, FIX.ichor_vibro);
  out.IB4 = [q(vib[0], 'cortosis') === null && vib[0].crit === W.vibroknife.crit, 'IB a marked vibroknife (Powered Melee) gets nothing: the proxy refuses', S(vib[0]._qualitiesRaw)];
  const imp = resolve(sb, FIX.ichor_imp);
  out.IBI1 = [q(imp[0], 'sunder') === true && q(imp[0], 'defensive') === 1 && q(imp[0], 'cortosis') === true && String(imp[0].damage) === String(Number(resolve(sb, bare(FIX.ichor_imp))[0].damage.replace('+', '')) + 2 ? imp[0].damage : ''),
    'IBI Ichor Blade (Improved) through Ichor Blade\'s pick: Sunder, Defensive 1, damage +2', S([imp[0].damage, imp[0].qualities])];
  const d0 = resolve(sb, bare(FIX.ichor_imp))[0].damage, d1 = imp[0].damage;
  out.IBI2 = [Number(String(d1).replace('+', '')) - Number(String(d0).replace('+', '')) === 2, 'IBI damage ' + d0 + ' → ' + d1, d1];
  const nom = resolve(sb, FIX.ichor_imp_nomark);
  out.IBI3 = [S(nom[0]) === S(resolve(sb, bare(FIX.ichor_imp_nomark))[0]), 'IBI without Ichor Blade\'s mark: nothing', S(nom[0]._talentEffects)];
  const ak = resolve(sb, FIX.acklay);
  out.AK1 = [q(ak[0], 'pierce') === 3 && q(ak[1], 'pierce') === 2, 'AK FR 2: brass knuckles Pierce 1 → 3; shock gloves gain Pierce 2', S([q(ak[0], 'pierce'), q(ak[1], 'pierce')])];
  out.AK2 = [q(ak[2], 'pierce') === null && q(ak[3], 'pierce') === 1, 'AK a melee staff and a STOWED brawl weapon: nothing', S([q(ak[2], 'pierce'), q(ak[3], 'pierce')])];
  out.AK3 = [q(resolve(sb, FIX.acklay_fr0)[0], 'pierce') === 1, 'AK Force rating 0: nothing'];
  const pb = resolve(sb, FIX.blast);
  out.PB1 = [q(pb[0], 'blast') === 8 && q(pb[1], 'blast') === 14, 'PB 2: frag grenade Blast 6 → 8; C-88 missile 12 → 14 (missiles are explosive weapons)', S([q(pb[0], 'blast'), q(pb[1], 'blast')])];
  out.PB2 = [S(pb[2]._qualitiesRaw) === S(W.ion_micro_rocket.qualities), 'PB ion_micro_rocket unchanged (no Blast to raise; R-M12B-68\'s fixture)', S(pb[2]._qualitiesRaw)];
  out.PB3 = [q(pb[3], 'blast') === 3, 'PB a scatter gun\'s Blast 3 (a Rifle) unchanged', q(pb[3], 'blast')];
  const si = resolve(sb, FIX.sunder), sr = spend(sb, si[0]).filter((r) => r.quality === 'sunder')[0];
  out.SI = [sr && sr.values.steps === 2 && /by 2 step/.test(sr.effect), 'SI Sunder (Improved): the spend row reads 2 steps', sr && sr.effect];
  const ms = resolve(sb, FIX.sabo), msr = spend(sb, ms[0]).filter((r) => r.quality === 'sunder')[0];
  out.MS1 = [q(ms[0], 'sunder') === true && msr && msr.values.steps === 2, 'MS Master Saboteur: a frag grenade gains Sunder, 2 steps', msr && msr.effect];
  out.MS2 = [q(ms[1], 'sunder') === null && q(ms[2], 'sunder') === null, 'MS a C-88 missile and a blaster rifle: nothing ("personal-scale explosives")'];
  return out;
}

const base = legsFor(build(), 'shipped');
Object.values(base).forEach(([ok, label, detail]) => check(ok, label, detail));

// ── BITES ──
const MUT = [
  ['the kind test removed', { 'lib/shared/itemResolve.js': (s) => s.replace("if (fx.kind && !_kindFits(cur, fx.kind)) return;", '') }, 'IB4'],
  ['raise_only\'s test removed', { 'lib/shared/itemResolve.js': (s) => s.replace("if (fx.mode === 'raise_only' && !(had && had.ranked && Number(had.rank) > 0)) return;", '') }, 'PB2'],
];
MUT.forEach(([label, swap, leg]) => {
  const src = Object.entries(swap).map(([f, fn]) => fn(read(f)) !== read(f));
  if (!src.every(Boolean)) { check(false, 'BITE ' + label + ': the mutant did not land (the source moved)'); return; }
  const r = legsFor(build(swap), label);
  check(r[leg][0] === false, 'BITE ' + label + ' → ' + leg + ' turns red');
});

console.log('\n' + legs + ' legs' + (failures ? ', FAILED: ' + failures : ', OK'));
process.exit(failures ? 1 : 0);
