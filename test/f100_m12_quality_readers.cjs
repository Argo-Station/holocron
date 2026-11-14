#!/usr/bin/env node
/* F-100 M12 · THE QUALITY MEMBERS' READERS (QS1–QS3, QM1, QT1): lib/shared/qualityRows.js spendRows / modeOffers / targetRows.
 * Ruled: f100-m12-build-card ADDENDUM 22 (R-M12B-67..71) under the qualities paper; census card R-M12C-58 ("data plus ONE
 * pure resolver, targetRows, with a node guard. That guard is its consumer in M12"); R-M12F-5 (the engine proposes, the
 * player taps); R-M12F-8 (DARK behind M12's one key).
 *
 *   (post1-switch-deletion, ADDENDUM 638: M12's key is gone; the OFF leg (every reader empty) went with it, table 3.)
 *   SWEEP Every shipped weapon carrying a SPEND quality lists one row per spend row of each such quality;
 *         every row's `req` is read by the spend menu's OWN spendAfford (sliced from lib/shared/ui.jsx, not restated):
 *         paid at its price, unpaid one Advantage short.
 *   QS1   Blast's hit (2) and miss (3) rows, `when` filtering; Auto-fire's row only with its mode on; Linked's repeat = its
 *         rating; Sunder's repeat unbounded; Knockdown + 1 per silhouette above 1, and `reqAdd` riding when unknown.
 *   QS2   a `_spendCostDeltas` row lowers its quality's price, never below 1; a key "any" delta is not applied and rides.
 *   QS3   a `_spendEffectSets` row sets Sunder's steps to 2 and the effect reads it.
 *   QM1   Auto-fire's mode offers +1 difficulty stamped with the attack's anchor; Stun setting offers Short and strain.
 *   QT1   Pierce capped at the soak; Breach 10 soak per rating (personal) or its armour (vehicle); Stun Damage and Ion
 *         (vehicle system strain, droid strain, a person nothing); Stun Damage (Droids) only against a droid; a defender's
 *         Cortosis armour blocks Pierce and Breach, its Cortosis weapon lists Sunder as immune.
 * Exit 0 only when every leg passes; a zero harvest is a FAILED run.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QR = require(path.join(ROOT, 'lib/shared/qualityRows.js'));
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const vocab = canon('qualities.vocab.json').entries;
const V = {}; vocab.forEach((e) => { V[e.id] = e; });
const WEAPONS = canon('weapons.json').weapons;

// the spend menu's own cost test, sliced from its one home (never restated here)
const UI = fs.readFileSync(path.join(ROOT, 'lib/shared/ui.jsx'), 'utf8');
const m = /function spendAfford\(req, tally\) \{[\s\S]*?\n  \}\n/.exec(UI);
if (!m) { console.error('  FAIL  spendAfford not found in lib/shared/ui.jsx'); process.exit(1); }
const spendAfford = new Function(m[0] + '\nreturn spendAfford;')();

let failures = 0, legs = 0;
const fail = (s) => { failures += 1; console.error('  FAIL  ' + s); };
const pass = (s) => console.log('  PASS  ' + s);
const check = (label, ok, detail) => { legs += 1; if (ok) pass(label); else fail(label + (detail ? ' — ' + detail : '')); };
const W = (...qs) => ({ _qualitiesRaw: qs.map(([id, rank]) => rank ? { id, name: V[id].label, ranked: true, rank } : { id, name: V[id].label, ranked: false }) });
const ON = (fn) => fn();   // the one world (the ON wrapper kept so the legs read as before)

// ── SWEEP ────────────────────────────────────────────────────────────────────────────────────────────────────────────
ON(() => {
  let weapons = 0, rows = 0, bad = [];
  Object.entries(WEAPONS).forEach(([id, rec]) => {
    const qs = (rec.qualities || []).filter((q) => V[q.id] && V[q.id].spend);
    if (!qs.length) return;
    weapons += 1;
    const got = QR.spendRows({ _qualitiesRaw: rec.qualities }, { vocab });
    const want = qs.reduce((k, q) => k + V[q.id].spend.filter((r) => !r.mode).length, 0);
    if (got.length !== want) bad.push(id + ' ' + got.length + '≠' + want);
    got.forEach((r) => {
      rows += 1;
      const price = r.req[0].ad || 0;
      if (!spendAfford(r.req, { ad: price, tr: 0 }) || spendAfford(r.req, { ad: price - 1, tr: 0 })) bad.push(id + '.' + r.quality + '.' + r.rowId + ' afford');
    });
  });
  check('SWEEP: ' + weapons + ' weapons with a SPEND quality → ' + rows + ' rows, each paid at its price by spendAfford and not one short',
    weapons > 0 && rows > 0 && !bad.length, bad.slice(0, 4).join(' | '));
});

// ── QS1 / QS2 / QS3 ──────────────────────────────────────────────────────────────────────────────────────────────────
ON(() => {
  const blast = QR.spendRows(W(['blast', 4]), { vocab });
  check('QS1 Blast 4: a hit row at 2 Advantage and a miss row at 3', blast.length === 2 && blast[0].when === 'hit' && blast[0].req[0].ad === 2 && blast[1].when === 'miss' && blast[1].req[0].ad === 3 && blast[0].rating === 4, JSON.stringify(blast.map((r) => [r.when, r.req])));
  check('QS1 `when: miss` lists only Blast\'s miss row', QR.spendRows(W(['blast', 4]), { vocab, when: 'miss' }).map((r) => r.rowId).join() === 'miss');
  check('QS1 Auto-fire\'s extra hit is NOT listed with its mode off', QR.spendRows(W(['auto_fire']), { vocab }).length === 0);
  const af = QR.spendRows(W(['auto_fire']), { vocab, modes: ['auto_fire'] });
  check('QS1 Auto-fire\'s extra hit listed with its mode on, unbounded repeats', af.length === 1 && af[0].repeatMax === null && af[0].mode === 'auto_fire');
  check('QS1 Linked 2: repeat up to its rating', QR.spendRows(W(['linked', 2]), { vocab })[0].repeatMax === 2);
  const sun = QR.spendRows(W(['sunder']), { vocab })[0];
  check('QS1 Sunder: 1 Advantage, unbounded, "by 1 step"', sun.req[0].ad === 1 && sun.repeatMax === null && /by 1 step/.test(sun.effect), sun.effect);
  const kd3 = QR.spendRows(W(['knockdown']), { vocab, target: { silhouette: 3 } })[0];
  check('QS1 Knockdown vs silhouette 3: 2 + 2 = 4 Advantage', kd3.req[0].ad === 4 && kd3.reqAdd === null, JSON.stringify(kd3.req));
  const kd = QR.spendRows(W(['knockdown']), { vocab })[0];
  check('QS1 Knockdown, silhouette unknown: 2 Advantage with reqAdd riding', kd.req[0].ad === 2 && kd.reqAdd && kd.reqAdd.per === 'target_silhouette_above_1');
  const low = (d) => QR.spendRows(Object.assign(W(['knockdown']), { _spendCostDeltas: d }), { vocab })[0];
  check('QS2 a knockdown −1 delta: 2 → 1, named', low([{ key: 'knockdown', value: -1, source: 'Jig' }]).req[0].ad === 1 && low([{ key: 'knockdown', value: -1, source: 'Jig' }]).lowered[0].source === 'Jig');
  check('QS2 a −3 delta stops at the floor of 1', low([{ key: 'knockdown', value: -3 }]).req[0].ad === 1);
  check('QS2 a delta keyed to another quality changes nothing', low([{ key: 'stun', value: -1 }]).req[0].ad === 2);
  const any = low([{ key: 'any', value: -1, source: 'Jury Rigged' }]);
  check('QS2 key "any": not applied (the player names it at the menu), rides on anyDeltas', any.req[0].ad === 2 && any.anyDeltas.length === 1 && any.anyDeltas[0].by === 1);
  const s2 = QR.spendRows(Object.assign(W(['sunder']), { _spendEffectSets: [{ key: 'sunder', field: 'steps', amount: 2, source: 'Sunder (Improved)' }] }), { vocab })[0];
  check('QS3 Sunder (Improved): steps 2, the effect reads "by 2 step"', s2.values.steps === 2 && /by 2 step/.test(s2.effect) && s2.set[0].source === 'Sunder (Improved)', s2.effect);
});

// ── QM1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
ON(() => {
  const anchor = { scope: 'skill', value: 'ranged_heavy' };
  const af = QR.modeOffers(W(['auto_fire'], ['pierce', 2]), { vocab, anchor });
  check('QM1 Auto-fire: one offer, +1 difficulty, the attack\'s anchor', af.length === 1 && af[0].poolRows.length === 1 && af[0].poolRows[0].die === 'difficulty' && af[0].poolRows[0].direction === 'add' && af[0].poolRows[0].count === 1 && af[0].poolRows[0].appliesTo[0] === anchor);
  const st = QR.modeOffers(W(['stun_setting']), { vocab });
  check('QM1 Stun setting: Short and strain, no dice', st.length === 1 && st[0].rangeMax === 'short' && st[0].damageAs === 'strain' && st[0].poolRows.length === 0);
});

// ── QT1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
ON(() => {
  const t = (w, target) => QR.targetRows(w, target, { vocab });
  const p = t(W(['pierce', 3]), { soak: 2 });
  check('QT1 Pierce 3 vs soak 2: ignores 2, leaves 0 (EotE p.157)', p.soakIgnored === 2 && p.soakAfter === 0);
  const b = t(W(['breach', 1]), { soak: 15 });
  check('QT1 Breach 1 vs soak 15 (personal): ignores 10, leaves 5', b.soakIgnored === 10 && b.soakAfter === 5);
  const bv = t(W(['breach', 2]), { kind: 'vehicle', armor: 4 });
  check('QT1 Breach 2 vs a vehicle: 2 armour ignored, no soak arithmetic', bv.armorIgnored === 2 && bv.soakAfter === null);
  check('QT1 Stun Damage: dealt as strain', t(W(['stun_damage']), { soak: 3 }).damageAs === 'strain');
  check('QT1 Ion vs a vehicle: system strain', t(W(['ion']), { kind: 'vehicle' }).damageAs === 'system_strain');
  check('QT1 Ion vs a droid: strain', t(W(['ion']), { kind: 'droid', soak: 4 }).damageAs === 'strain');
  check('QT1 Ion vs a person: no row', t(W(['ion']), { kind: 'personal', soak: 4 }).damageAs === null);
  check('QT1 Stun Damage (Droids) vs a droid: strain; vs a person: nothing',
    t(W(['stun_damage_droids']), { kind: 'droid' }).damageAs === 'strain' && t(W(['stun_damage_droids']), { kind: 'personal' }).damageAs === null);
  const c = t(W(['pierce', 3], ['breach', 1]), { soak: 12, qualities: { armor: ['cortosis'] } });
  check('QT1 a defender\'s Cortosis armour blocks Pierce and Breach (EotE p.155)', c.soakIgnored === 0 && c.soakAfter === 12 && c.blocked.length === 2);
  const cw = t(W(['sunder']), { soak: 2, qualities: { weapon: ['cortosis'] } });
  check('QT1 a defender\'s Cortosis weapon lists Sunder as immune', cw.immune.weapon.join() === 'sunder');
});

console.log('\n' + legs + ' legs' + (failures ? ', FAILED: ' + failures : ', OK'));
process.exit(failures ? 1 : 0);
