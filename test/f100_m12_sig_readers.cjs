#!/usr/bin/env node
/**
 * f100_m12_sig_readers.cjs — STANDING guard: F-100 M12's signature-ability readers (ruling `f100-m12-build-card` step 4 /
 * LAP NEXT step 2; `f100-m12-census-card` R-M12C-14/15/20/39/40/42; ADDENDUM 5 R-M12B-21/25; R-M12B-31).
 *
 * Over the SHIPPED registries (public/data/canonical), with in-memory sheets built per leg:
 *   V  sigAbilityChecks — THE ONE LEGALITY FUNCTION, key-independent (the import's): a legal entry passes; each of V0–V7
 *      refuses with its check named (V0 unknown id, V1 another career, V2 a tree outside the career, V3 a bottom-row talent
 *      missing, V4 a second ability on one tree, V5 an upgrade without the base, V6 an upgrade linked to nothing owned,
 *      V7 a position that is no cell); a V6/V7 refusal leaves the cells that still join standing.
 *   K  the owned pool sources carry the sheet's signature owners. (post1-switch-deletion, ADDENDUM 638: M12's key is gone;
 *      K1 (the key OFF moves nothing) and N3's key-OFF half went with it, table 3; K2, the ON control, stays.)
 *   N
 *      N1 SV2: Counterespionage's Boost bought in two cells counts 2, and its row reaches the pool sources at count 2.
 *      N2 SV5: Unmatched Expertise's career_skills anchor resolves to the owner's career skills (careerSkillStatus), and to
 *         nothing else.
 *      N3 SV1: a node row anchored {scope: signature_ability} matches its ability's activation check (contextFor's
 *         sigAbility) and no other check.
 *      N4 the fold (R-M12B-25): Unmatched Heroism — uses 1+1, duration 2+2 (Duration in two cells), range set medium,
 *         destiny set 1; strain −1 folds `unstated` (R-M12B-31); silhouette absent.
 *      N5 floor (R-M12B-21): a duration delta of −5 per box floored at 1 folds to 1 (an in-memory registry copy).
 *      N6 sigAbilitiesXp: the standing cells' registry costs, shown (never charged).
 *
 * Run: node test/f100_m12_sig_readers.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const PM = require(path.join(ROOT, 'lib/shared/poolMods.js'));
const C = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const vocab = C('skills.vocab.json').entries;
const skillSheetKeys = {};
vocab.forEach((e) => { skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; });
const SIG = C('signature_abilities.json').signature_abilities;
const CB = { careers: C('careers.json').careers, specializations: C('specializations.json').specializations,
  talents: C('talents.json').talents, forcePowers: C('force_powers.json').force_powers, species: C('species.json').species,
  skillSheetKeys, signatureAbilities: SIG };
const clone = (x) => JSON.parse(JSON.stringify(x));

let failures = 0;
const check = (ok, label, detail) => { if (ok) console.log('  PASS  ' + label); else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); } };

// a sheet: career, one spec with its bottom-row columns owned (1-based), the entries
function sheet(career, spec, cols, entries) {
  const bottom = CB.specializations[spec].talent_tree.length - 1;
  return { careerId: career, career: CB.careers[career].name, specializations: [{ id: spec, owned: cols.map((c) => bottom + '-' + (c - 1)) }],
    talents: [], skills: {}, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    signatureAbilities: entries };
}
const SPY = (owned, more) => sheet('spy', 'courier', [2, 3], [{ id: 'counterespionage', tree: 'courier', owned }].concat(more || []));
const checks = (sh, cb) => CR.sigAbilityChecks(sh, cb || CB);
const codes = (r) => r.problems.map((p) => p.check).join(',');

// ── V: the one legality function ──
{
  const ok = checks(SPY(['0-0', '1-0', '1-2', '2-2']))[0];
  check(ok.ok && ok.cells.length === 4, 'V+  a legal Counterespionage (spy, Courier, columns 2–3, four linked cells) passes', codes(ok));
  const legs = [
    ['V0', Object.assign(SPY(['0-0']), { signatureAbilities: [{ id: 'not_an_ability', tree: 'courier', owned: ['0-0'] }] })],
    ['V1', Object.assign(SPY(['0-0']), { careerId: 'smuggler', career: 'Smuggler' })],
    ['V2', sheet('spy', 'courier', [2, 3], [{ id: 'counterespionage', tree: 'shadow', owned: ['0-0'] }])],
    ['V3', sheet('spy', 'courier', [2], [{ id: 'counterespionage', tree: 'courier', owned: ['0-0'] }])],
    ['V4', SPY(['0-0'], [{ id: 'counterespionage', tree: 'courier', owned: ['0-0'] }])],
    ['V5', SPY(['1-0'])],
    ['V6', SPY(['0-0', '2-3'])],
    ['V7', SPY(['0-0', '3-0'])],
  ];
  legs.forEach(([v, sh]) => {
    const rs = checks(sh), bad = rs.filter((r) => !r.ok);
    const hit = bad.some((r) => r.problems.some((p) => p.check === v));
    check(hit, `${v}  refused with ${v} named: ${(bad[0] && bad[0].problems[0] || {}).words || '(nothing refused)'}`, rs.map(codes).join(' | '));
  });
  const v6 = checks(SPY(['0-0', '1-0', '2-3']))[0];
  check(!v6.ok && v6.cells.map((c) => c.pos).join() === '0-0,1-0', 'V6' + "' a refused cell leaves the cells that join standing (0-0, 1-0)", v6.cells.map((c) => c.pos).join());
}

// ── K: the signature owners ──
{
  const sh = SPY(['0-0', '1-0', '1-2', '2-2']);
  const sigOwners = (fn) => fn(sh, CB).filter((o) => /^sig:/.test(o.id)).length;
  const on = [CR.sigAbilityRowSources(sh, CB).length, sigOwners(CR.ownedTalentPoolSources)];
  check(on[0] > 0 && on[1] > 0, 'K2  the sheet carries signature owners (' + on.join(', ') + ')');
}

// ── N ──
{
  const sh = SPY(['0-0', '1-0', '1-2', '2-2']);
  const n = CR.sigUpgradeCount(sh, 'counterespionage.counterespboost', CB);
  const boost = CR.ownedTalentPoolSources(sh, CB).filter((o) => o.id === 'sig:counterespionage:counterespboost')[0];
  const row = boost && boost.pool_mods[0];
  check(n === 2 && row && row.count === 2 && !row.count_of, 'N1  SV2: Boost in two cells counts 2; its row reaches the pool sources at count 2', JSON.stringify({ n, row }));
}
{
  const sh = sheet('colonist', 'doctor', [2, 3], [{ id: 'unmatchexpert', tree: 'doctor', owned: ['0-0', '1-0'] }]);
  const st = CR.careerSkillStatus(sh, CB), want = Object.keys(st).map((k) => st[k].id).sort();
  const base = CR.sigAbilityRowSources(sh, CB).filter((o) => o.node === 'unmatchexpert')[0];
  const got = base ? base.pool_mods[0].applies_to.map((a) => a.scope + ':' + a.value) : [];
  check(want.length >= 8 && got.length === want.length && got.every((g, i) => g === 'skill:' + want[i]),
    `N2  SV5: the base row's career_skills anchor resolves to the owner's ${want.length} career skills through careerSkillStatus`, got.slice(0, 4).join(' '));
}
{
  const idx = { bySheetKey: {}, byId: {} };
  vocab.forEach((e) => { const r = { id: e.id, group: e.group, characteristic: e.characteristic }; idx.byId[e.id] = r; idx.bySheetKey[skillSheetKeys[e.id]] = r; });
  const mod = { appliesTo: [{ scope: 'signature_ability', value: 'counterespionage' }] };
  const at = PM.contextFor('warfare', idx, undefined, undefined, undefined, 'counterespionage');
  const plain = PM.contextFor('warfare', idx);
  const other = PM.contextFor('warfare', idx, undefined, undefined, undefined, 'mycity');
  const onHit = PM.matches(mod, at), onPlain = PM.matches(mod, plain), onOther = PM.matches(mod, other);
  check(onHit && !onPlain && !onOther, 'N3  SV1: matches its ability\'s activation check only', JSON.stringify({ onHit, onPlain, onOther }));
}
{
  const sh = sheet('guardian', 'peacekeeper', [1, 2], [{ id: 'unmatchhero', tree: 'peacekeeper', owned: ['0-0', '1-0', '1-3', '1-2', '2-0', '2-1', '1-1'] }]);
  const r = CR.sigAbilityChecks(sh, CB)[0];
  const f = CR.sigActivation(sh, CB, 'unmatchhero');
  const ok = r.ok && f && f.uses_per_session.value === 2 && f.duration_rounds.value === 4 && f.duration_rounds.delta === 2 &&
    f.range.value === 'medium' && f.range.set === 'medium' && f.destiny.value === 1 && f.strain && f.strain.base === 'unstated' &&
    f.strain.value === null && f.strain.delta === -1 && f.silhouette === null;
  check(ok, 'N4  the fold: Heroism uses 2, duration 4 (2 + 1 × 2 boxes), range medium (set), destiny 1 (set); strain −1 unstated; silhouette none',
    JSON.stringify({ ok: r.ok, p: codes(r), f }));
}
{
  const cb = Object.assign({}, CB, { signatureAbilities: Object.assign({}, SIG, { unmatchhero: clone(SIG.unmatchhero) }) });
  const m = cb.signatureAbilities.unmatchhero.abilities.unmatchheroduration.activation_mods[0];
  m.value = -5; m.floor = 1;
  const sh = sheet('guardian', 'peacekeeper', [1, 2], [{ id: 'unmatchhero', tree: 'peacekeeper', owned: ['0-0', '1-0', '1-2', '1-3'] }]);
  const f = CR.sigActivation(sh, cb, 'unmatchhero');
  check(f && f.duration_rounds.value === 1 && f.duration_rounds.delta === -10, 'N5  floor: 2 + (−5 × 2 boxes) clamps at its floor of 1', JSON.stringify(f && f.duration_rounds));
}
{
  const sh = SPY(['0-0', '1-0', '1-2', '2-2']);
  const x = CR.sigAbilitiesXp(sh, CB)[0], want = 30 + 10 + 10 + 15;
  check(x.xp === want && x.cells === 4, `N6  sigAbilitiesXp: ${x.xp} XP over ${x.cells} cells (30 + 10 + 10 + 15), inferred ${x.inferred}`, JSON.stringify(x));
}

console.log(failures ? `\nf100_m12_sig_readers: ${failures} FAILED` : '\nf100_m12_sig_readers: all legs pass');
process.exit(failures ? 1 : 0);
