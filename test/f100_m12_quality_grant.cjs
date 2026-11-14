#!/usr/bin/env node
/* F-100 M12 · THE QUALITIES BUILD, PART 5 (ruling `f100-m12-build-card` ADDENDUM 22, R-M12B-70; the qualities paper's QS2 and
 * QG1 (sig) rows): Jury Rigged (Weapon)'s "{1} Takes 1 Less [AD] to Activate" line and Unmatched Ingenuity's grant.
 * (post1-switch-deletion, ADDENDUM 638: M12's key is gone; the OFF legs of QS2 and QG1 went with it, table 3; ON is the world.)
 *
 *   QS2  DATA   jury_rigged_weapon/a3 carries {type: spend_cost_delta, key: "any", value: -1} and no `never_modelled`.
 *        ON     the selected option lists one {key: any, value: -1, source}; unselected, none; on armour, none.
 *        READ   spendRows over the resolved weapon: `key: "any"` rides `anyDeltas` and no price moves (the player names the
 *               quality, R-M12B-70); a planted copy keyed to that weapon's quality lowers its price by 1 through the same
 *               path, floor 1 (the reader's).
 *        BITE   an itemResolve without spend_cost_delta in OPTION_DARK lists nothing, and the ON leg's check refuses it.
 *   QG1  DATA   the base node carries quality_grant {except [breach, concussive], rating 1, item held, cite}; the two
 *               Quality boxes carry quality_grant_allow [breach] / [concussive]. F5's harvest > 0 over the shipped registry.
 *        ON     base only: except both, choices = the vocabulary less both; + Quality (Breach): breach lifted; + both: all.
 *               A sheet that does not own the ability: []. The sheet is byte-identical after (OFFERED, never saved).
 *        BITE   a reader ignoring `quality_grant_allow` keeps breach barred, and the ON leg's check refuses it.
 *
 * Run: node test/f100_m12_quality_grant.cjs
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const QR = require(path.join(ROOT, 'lib/shared/qualityRows.js'));
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;
const QV = canon('qualities.vocab.json').entries;
const WEAPONS = canon('weapons.json').weapons, ARMOR = canon('armor.json').armor;
const AT = canon('attachments.json').attachments;
const SIG = canon('signature_abilities.json').signature_abilities;
const sv = canon('skills.vocab.json').entries, skillSheetKeys = {};
sv.forEach((e) => { skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; });
const CB = { careers: canon('careers.json').careers, specializations: canon('specializations.json').specializations,
  talents: canon('talents.json').talents, forcePowers: canon('force_powers.json').force_powers, species: canon('species.json').species,
  skillSheetKeys, signatureAbilities: SIG };

let failures = 0, legs = 0;
const check = (label, ok, detail) => { legs += 1; if (ok) console.log('  PASS  ' + label); else { failures += 1; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); } };
const ON = (fn) => fn();   // the one world (the ON wrapper kept so the legs read as before)

// ── QS2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const JR = AT.jury_rigged_weapon, A3 = JR.added_mods[3];
check('QS2 DATA jury_rigged_weapon/a3 → spend_cost_delta key any value -1, no never_modelled',
  J(A3.effect) === J({ type: 'spend_cost_delta', key: 'any', value: -1 }) && !('never_modelled' in A3), J(A3));
// the host: the first shipped weapon with a spend row priced 2+ [AD] (so a −1 shows above the floor)
const adOf = (req) => (req || []).reduce((n, c) => n + (Number(c && c.ad) || 0), 0);
const fitted = (IRm, rec, mods, reg) => IRm.applyInstalledAttachments('weapon', rec, [{ id: 'jury_rigged_weapon', mods }], reg || AT);
const asSheet = (res) => ({ _qualitiesRaw: res.qualities || [], _spendCostDeltas: res._spendCostDeltas });
const HOST = ON(() => Object.keys(WEAPONS).find((id) => QR.spendRows({ _qualitiesRaw: WEAPONS[id].qualities || [] }, { vocab: QV })
  .some((r) => adOf(r.req) >= 2)));
check('QS2 a host weapon with a spend row priced 2+ [AD] exists', !!HOST, String(HOST));
const H = WEAPONS[HOST];
const onLeg = (IRm) => ON(() => {
  const sel = fitted(IRm, H, ['mod_3']), none = fitted(IRm, H, []);
  const arm = IRm.applyInstalledAttachments('armor', ARMOR[Object.keys(ARMOR)[0]], [{ id: 'jury_rigged_weapon', mods: ['mod_3'] }], AT);
  return { sel, ok: J(sel._spendCostDeltas) === J([{ key: 'any', value: -1, source: JR.name }]) && none._spendCostDeltas === undefined && arm._spendCostDeltas === undefined };
});
{
  const { sel, ok } = onLeg(IR);
  check('QS2 ON selected → one {any, -1, Jury Rigged (Weapon)}; unselected none; on armour none', ok, J(sel._spendCostDeltas));
  ON(() => {
    const bare = QR.spendRows({ _qualitiesRaw: H.qualities || [] }, { vocab: QV });
    const rows = QR.spendRows(asSheet(sel), { vocab: QV });
    const same = rows.length === bare.length && rows.every((r, i) => J(r.req) === J(bare[i].req) && r.lowered.length === 0);
    const rides = rows.length > 0 && rows.every((r) => J(r.anyDeltas) === J([{ by: 1, source: JR.name }]));
    check('QS2 READ key any: no price moves, every row carries anyDeltas [{by 1}] (' + rows.length + ' rows on ' + HOST + ')', same && rides);
    // a planted copy keyed to the host's priced quality: the same path lowers that price by 1, floor 1
    const row = bare.find((r) => adOf(r.req) >= 2);
    const P = clone(AT); P.jury_rigged_weapon.added_mods[3].effect.key = row.quality;
    const keyed = QR.spendRows(asSheet(fitted(IR, H, ['mod_3'], P)), { vocab: QV }).find((r) => r.rowId === row.rowId);
    check(`QS2 READ a planted key ${row.quality}: ${adOf(row.req)} → ${keyed && adOf(keyed.req)} [AD], lowered by 1`,
      keyed && adOf(keyed.req) === adOf(row.req) - 1 && keyed.lowered.length === 1);
    P.jury_rigged_weapon.added_mods[3].effect.value = -9;
    const floored = QR.spendRows(asSheet(fitted(IR, H, ['mod_3'], P)), { vocab: QV }).find((r) => r.rowId === row.rowId);
    check('QS2 READ a planted -9: floored at 1 [AD]', floored && adOf(floored.req) === 1, floored && J(floored.req));
  });
}
{ // BITE: an itemResolve without spend_cost_delta in OPTION_DARK
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/itemResolve.js'), 'utf8');
  const FROM = 'var OPTION_DARK = { qualities_reduce: 1, spend_cost_delta: 1 };';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f100m12qs2-'));
  try {
    fs.writeFileSync(path.join(dir, 'itemResolve.js'), src.replace(FROM, 'var OPTION_DARK = { qualities_reduce: 1 };'));
    const MUT = require(path.join(dir, 'itemResolve.js'));
    const r = onLeg(MUT);
    check('QS2 BITE without spend_cost_delta in OPTION_DARK the ON leg refuses', src.includes(FROM) && !r.ok, J(r.sel._spendCostDeltas));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ── QG1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const UI = SIG.unmatchedingen, N = UI.abilities;
check('QG1 DATA base: quality_grant {one_quality, except [breach, concussive], rating 1, held, cite FO p.35}',
  J(N.unmatchedingenbase.quality_grant) === J({ id: 'one_quality', except: ['breach', 'concussive'], rating: 1, item: 'held', cite: { book: 'fully_operational', page: 35 } }),   // B-336 signature wave (ADDENDUM 62): the stored cite is the KEY
  J(N.unmatchedingenbase.quality_grant));
check('QG1 DATA Quality boxes: allow [breach] / [concussive]',
  J(N.unmatchedingenquality.quality_grant_allow) === J(['breach']) && J(N.unmatchedingenquality2.quality_grant_allow) === J(['concussive']));
{ // F5's harvest over the shipped registry: the fence has rows to read
  let g = 0, a = 0;
  Object.values(SIG).forEach((r) => Object.values(r.abilities || {}).forEach((n) => { if (n.quality_grant) g += 1; if (n.quality_grant_allow) a += 1; }));
  check(`QG1 F5 harvest: ${g} grant + ${a} allow nodes in the shipped registry (> 0)`, g === 1 && a === 2);
}
// an Engineer (Mechanic, bottom-row columns 2–3 owned) holding Unmatched Ingenuity at `owned`
const ENG = (owned) => {
  const bottom = CB.specializations.mechanic.talent_tree.length - 1;
  return { careerId: 'engineer', career: CB.careers.engineer.name, specializations: [{ id: 'mechanic', owned: [bottom + '-1', bottom + '-2'] }],
    talents: [], skills: {}, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    signatureAbilities: [{ id: 'unmatchedingen', tree: 'mechanic', owned }] };
};
const ids = QV.map((e) => e.id);
const offerLeg = (CRm) => ON(() => {
  const base = CRm.sigQualityGrantOffers(ENG(['0-0']), CB, QV)[0];
  const breach = CRm.sigQualityGrantOffers(ENG(['0-0', '1-0', '2-0']), CB, QV)[0];
  const both = CRm.sigQualityGrantOffers(ENG(['0-0', '1-0', '2-0', '1-2', '2-2', '2-3']), CB, QV)[0];
  return { base, breach, both,
    ok: !!(base && breach && both) && J(base.except) === J(['breach', 'concussive']) && base.allowed.length === 0 &&
      J(base.choices) === J(ids.filter((q) => q !== 'breach' && q !== 'concussive')) && base.rating === 1 && base.item === 'held' &&
      J(breach.except) === J(['concussive']) && J(breach.allowed) === J(['breach']) && breach.choices.includes('breach') && !breach.choices.includes('concussive') &&
      both.except.length === 0 && J(both.choices) === J(ids) };
});
{
  const legal = CR.sigAbilityChecks(ENG(['0-0', '1-0', '2-0', '1-2', '2-2', '2-3']), CB)[0];
  check('QG1 the fixture stands (V1–V7): an Engineer, Mechanic, six cells', legal && legal.ok && legal.cells.length === 6, legal && J(legal.problems));
  const sh = ENG(['0-0', '1-0', '2-0']), before = J(sh);
  const r = offerLeg(CR);
  check(`QG1 ON base: ${r.base && r.base.choices.length} of ${ids.length} offered (breach, concussive barred); + Breach box: breach lifted; + both: all ${ids.length}`, r.ok, J({ base: r.base && r.base.except, breach: r.breach && r.breach.except, both: r.both && r.both.except }));
  const other = clone(sh); other.signatureAbilities = [];
  check('QG1 ON a sheet that does not own the ability: []', J(ON(() => CR.sigQualityGrantOffers(other, CB, QV))) === '[]');
  ON(() => CR.sigQualityGrantOffers(sh, CB, QV));
  check('QG1 OFFERED, never saved: the sheet is byte-identical after the reader', J(sh) === before);
  check('QG1 no vocabulary: choices null, except still read', (ON(() => CR.sigQualityGrantOffers(sh, CB))[0] || {}).choices === null);
}
{ // BITE: a reader ignoring quality_grant_allow
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
  const FROM = '((nodes[c.ability] && nodes[c.ability].quality_grant_allow) || [])';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f100m12qg1-'));
  try {
    fs.readdirSync(path.join(ROOT, 'lib/shared')).filter((f) => f.endsWith('.js')).forEach((f) => fs.copyFileSync(path.join(ROOT, 'lib/shared', f), path.join(dir, f)));
    fs.writeFileSync(path.join(dir, 'charResolve.js'), src.replace(FROM, '[]'));
    const MUT = require(path.join(dir, 'charResolve.js'));
    const r = offerLeg(MUT);
    check('QG1 BITE a reader ignoring quality_grant_allow keeps breach barred; the ON leg refuses', src.includes(FROM) && !r.ok && r.breach && r.breach.except.includes('breach'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(failures ? `\nf100_m12_quality_grant: ${failures} of ${legs} FAILED` : `\nf100_m12_quality_grant: all ${legs} legs pass`);
process.exit(failures ? 1 : 0);
