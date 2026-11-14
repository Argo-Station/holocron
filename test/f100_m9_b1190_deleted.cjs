#!/usr/bin/env node
/**
 * f100_m9_b1190_deleted.cjs — B-1190 (ruling `f100-m9-build-card` step 10, ADDENDUM 1 R-M9B-6): a SPECIES, CAREER or FORCE
 * POWER deleted from a present own pack is released from the hold exactly as M5's C5.2 releases a talent or specialization
 * (`CharResolve.sheetHold`), and `sheetDeletedRefs` names it for F5's notice — the one predicate, so HOMEBREW H2's guard
 * inherits it with no H2 edit (F-100 WORD on the B-1190 row). Over a REAL user store and the shipped registries.
 *
 *   1-3  a deleted own species / career / Force power → sheetHold null (not held); sheetDeletedRefs names it, its kind
 *   4    the same sheet with its pack MISSING (a `user:` stamp not on this device) → held, variant A, as before
 *   5    a sheet with NO present `user:` stamp naming an unknown species → held, variant B, as before (an old app)
 *   6    a view without a section (the talent view of a host that does not carry species) → no false "deleted"
 * BITES (each must turn a case red; run below, by exit code of the assertions, not by output): the species, career or
 * Force power kind left out of the release list.
 *
 * Run: node test/f100_m9_b1190_deleted.cjs   (exit 1 on any FAIL)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const CR_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');

const clone = (v) => JSON.parse(JSON.stringify(v));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const vocab = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries;
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const VOCAB = { skills: vocab('skills.vocab.json').map((e) => e.id), qualities: vocab('qualities.vocab.json').map((e) => e.id) };
const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
const CB = { species: BASE.species, careers: BASE.careers, specializations: BASE.specializations, talents: BASE.talents, forcePowers: BASE.force_powers };
const mk = () => U.createStore({ adapter: U.memoryAdapter(), schemas: SCHEMAS, vocab: VOCAB, base: BASE });

// a charResolve built from SOURCE, so a bite can swap one line (a fresh module scope per load)
function loadCR(src) {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', 'window', 'globalThis', src)(m, m.exports, require, undefined, {});
  return m.exports && m.exports.sheetHold ? m.exports : (globalThis.CharResolve || m.exports);
}
function sheetOf(mods, over) {
  return Object.assign({ name: 'Case', speciesId: 'human', species: 'Human', careerId: 'smuggler', specializationIds: ['scoundrel'],
    specializations: [{ id: 'scoundrel', owned: [] }], talents: [], forcePowers: [], mods: mods,
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 } }, over || {});
}

async function cases(CR) {
  const out = [];
  const check = (cond, label, detail) => out.push([!!cond, label, detail]);
  // F-100 M10 (f100-m10-build-card R-M10B-3): a canonical power's upgrade rows name ITS id (V1's key, V4's value), which the
  // validator refuses on a power with another id — so the own power copies the tree and text, never the rows.
  const ownPower = (p, name) => { Object.values(p.abilities || {}).forEach((a) => ['pool_mods', 'roll_numbers', 'effects', 'told'].forEach((k) => { delete a[k]; }));
    return Object.assign(p, { name: name }); };
  const kinds = [
    ['species', 'species', 'Four-Armed Human', (id) => ({ speciesId: id, species: 'Four-Armed Human' }), 'speciesId', () => Object.assign(clone(BASE.species.human), { name: 'Four-Armed Human' })],
    ['careers', 'career', 'Night Runner', (id) => ({ careerId: id }), 'careerId', () => Object.assign(clone(BASE.careers.smuggler), { name: 'Night Runner' })],
    ['force_powers', 'force power', 'Kit Sense', (id) => ({ forcePowers: [{ id: id }] }), 'forcePowers', () => ownPower(clone(BASE.force_powers[Object.keys(BASE.force_powers)[0]]), 'Kit Sense')],
  ];
  for (let i = 0; i < kinds.length; i++) {
    const [sec, kind, nm, put, field, make] = kinds[i];
    const H = mk(); await H.ready();
    const rec = make(); rec.id = H.mintId('my_data', sec, nm);
    const sv = await H.saveRecord('my_data', sec, rec, { create: true });
    const mods = H.activeStamps();
    M.useUserPacks(H);
    const sheet = sheetOf(mods, put(rec.id));
    const v0 = await M.resolveForStamp(mods, CB);
    check(sv.ok && CR.sheetHold(sheet, v0, H.missingFor(mods), true) === null, 'case ' + (i + 1) + ': fixture — an own ' + kind + ' saved and owned, not held', sv);
    const del = await H.deleteRecord('my_data', sec, rec.id);
    const v1 = await M.resolveForStamp(mods, CB);
    const hold = CR.sheetHold(sheet, v1, H.missingFor(mods), true);
    check(del.ok && hold === null, 'case ' + (i + 1) + ': the ' + kind + ' deleted from a present own pack → NOT held (B-1190)', hold);
    const dr = CR.sheetDeletedRefs(sheet, v1, H.missingFor(mods), true);
    check(dr.length === 1 && dr[0].kind === kind && dr[0].id === rec.id && dr[0].field === field, 'case ' + (i + 1) + ': sheetDeletedRefs names the deleted ' + kind, dr);
    if (i === 0) {
      // 4 · the pack itself missing (another device's stamp): held, variant A, as before
      const gone = sheetOf(mods.concat(['user:not_on_this_device@0123456789ab']), put(rec.id));
      const hA = CR.sheetHold(gone, v1, H.missingFor(gone.mods), true);
      check(hA && hA.variant === 'A', 'case 4: a missing stamp still holds (variant A)', hA);
      check(CR.sheetDeletedRefs(gone, v1, H.missingFor(gone.mods), true).length === 0, 'case 4: …and names nothing deleted');
      // 6 · a view without the section: no false "deleted"
      const noSec = Object.assign({}, v1); delete noSec.species; delete noSec.careers; delete noSec.forcePowers;
      check(CR.sheetDeletedRefs(sheetOf(mods), noSec, H.missingFor(mods), true).length === 0, 'case 6: a view that carries no species/careers/forcePowers names nothing deleted');
    }
  }
  // 5 · no present user stamp, an unknown species: variant B (an app too old for the data), as before
  const hB = CR.sheetHold(sheetOf([], { speciesId: 'custom_my_data_from_the_future' }), CB, [], true);
  check(hB && hB.variant === 'B' && hB.refs.some((r) => r.kind === 'species'), 'case 5: no present user stamp → still held, variant B', hB);
  return out;
}

(async function main() {
  console.log('f100_m9_b1190_deleted — B-1190: species, career and Force power released by C5.2 (f100-m9-build-card step 10)');
  const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
  const rows = await cases(CR);
  let fails = 0;
  rows.forEach(([ok, l, d]) => { if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + l + (!ok && d !== undefined ? '   -> ' + JSON.stringify(d).slice(0, 300) : '')); });
  console.log('BITES (each must turn at least one case red):');
  const LINE = "var C5_RELEASED = ['talent', 'specialization', 'species', 'career', 'force power'];";
  if (CR_SRC.indexOf(LINE) === -1) { fails++; console.log('  FAIL  the release list line is not where the bites expect it'); }
  for (const k of ['species', 'career', 'force power']) {
    const mut = CR_SRC.replace(LINE, LINE.replace(", '" + k + "'", ''));
    let red;
    try { red = (await cases(loadCR(mut))).some((r) => !r[0]); } catch (e) { red = true; }
    if (!red) fails++;
    console.log((red ? '  PASS  ' : '  FAIL  ') + 'bite: "' + k + '" left out of the release list → red');
  }
  console.log('\nHARVEST ' + rows.length + ' cases · 3 bites');
  console.log('f100_m9_b1190_deleted: ' + (fails ? 'FAIL (' + fails + ')' : 'PASS'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
