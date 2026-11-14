#!/usr/bin/env node
/* release-r5-crafting-fib C2 · A BUILT FORTIFICATION: ITS ENTRY, ITS ONE RESOLVER, AND THE EXPORT'S TOLD DROP
 * (card `release-r5-crafting-fib` C2, acceptance 3, blind checklist 3–4; ruling `release-r5-crafting-fib-c0` Q2 (a), Q3,
 * Q4a (a), Q5 (b); contract R-R5CC-2's `sheet.fortifications[]` `{ id, template_id, name, built_with[], made_from? }`).
 *
 *   F1  a finished trench (Expanded Capacity, Additional Cover) and a finished bunker (Reinforced Armor, Expanded Capacity
 *       ×2, Limited Lifespan) land through Craft.landingOf as entries at the end of `fortifications`, in build order,
 *       `built_with` in purchase order with repeats kept, `id` = the project's id; `equipment` comes back the SAME object
 *       it went in as, deep-equal to its copy; the entry holds no number (resolve-at-render).
 *   F2  the sheet is written through the roster (lib/shared/roster.js, the one save path) and RELOADED; the reloaded
 *       `sheetData.fortifications` deep-equals what was landed, and Craft.fortificationOf over the reloaded entries reads
 *       Table 3-1 + Table 3-2: trench occupancy 6+1 = 7, ranged defence 3+1 = 4; bunker armour 2+1 = 3, occupancy 4+2 = 6,
 *       hull trauma 8, silhouette 3, speed 0, each move in `because`; Limited Lifespan returned in `unapplied` with its told
 *       reason; the reloaded equipment deep-equals the input.
 *   F3  "IF APPLICABLE" (Q4a (a)): Reinforced Armor bought on a trench is `unapplied` "not applicable: the Trench has no
 *       armour" and no armour is created; a blank field stays ABSENT (no silhouette on a trench or a blind, Q1 FLAG 1 (i)).
 *       RE-POINTED by ruling release-r5-crafting-fib-c0 ADDENDUM 3 (DECISIONS D-327, C-D327-1, contract-moved): the leg
 *       "Inferior Protection on a blind is unapplied and creates no ranged defence" is DROPPED; D2 below holds its new
 *       contract. KEEPS the armour and blank legs.
 *   D1–D6 (ADDENDUM 3's added acceptance, C-D327-1..3): bunker + Additional Cover → ranged defence 1; blind + Inferior
 *       Protection → 0, its `because` −1, not in `unapplied`; bunker + Cover + Inferior → 0; a bare bunker → no
 *       `defense_ranged` key; Trench + Reinforced Armor → still `unapplied`; Trench + Inferior Protection → 2.
 *   F4  a FAILED project lands nothing (Q3 (a)): landingOf → null. A second Reinforced Armor THROWS (once_only).
 *   F5  ONE resolver: `fortificationOf` is defined once under lib/, in craftStore.js, and player/app.jsx's finish() takes
 *       `landed.fortifications` and passes `sheet.fortifications`.
 *   F6  the OggDude export (Q5 (b)): a character with two entries gets one DROPPED receipt row per entry, each with a
 *       player line naming it; the same character without entries gets none.
 *
 * BITES (PRAXIS §6, by EXIT CODE and the failing leg's name): `--bite` re-runs this file once per mutant below, each a
 * one-line edit of a COPY of craftStore.js or oggExport.js in a temp dir (FORT_LIB / FORT_EXPORT point the run at it),
 * and requires exit 1 with the named leg failing. The tree is never written.
 *
 * Run: node test/release_r5_crafting_fortification.cjs [--bite]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = process.env.FORT_LIB || path.join(ROOT, 'lib/shared');
const EXPORT = process.env.FORT_EXPORT || path.join(ROOT, 'lib/shared/oggExport.js');

// ── the mutants (--bite): [name, file, the leg(s) it must fail, '|'-joined, find, replace] ──
const MUTANTS = [
  ['equipment-written', 'craftStore.js', 'F1', 'return { equipment: equipment, fortifications: forts.concat([fb.entry])',
    'return { equipment: Object.assign({}, equipment, { gear: [fb.entry] }), fortifications: forts.concat([fb.entry])'],
  ['vessel-half-skipped', 'craftStore.js', 'F2', '    if (parts.length) {\n      var hull = {};', '    if (false) {\n      var hull = {};'],
  ['item-half-skipped', 'craftStore.js', 'F2', '    if (itemIds.length) {', '    if (false) {'],
  ['if-applicable-dropped', 'craftStore.js', 'F3', '      if (missing.length) {', '      if (false) {'],
  ['d327-unapplied-restored', 'craftStore.js', 'D1|D2', "return !f || (ops === VEHICLE_OPS && base[f] == null); });",
    "return !f || base[f] == null; });"],
  ['d327-floor-dropped', 'craftStore.js', 'D2', 'out.defense_ranged = Math.max(0, applied.profile.defense_ranged);',
    'out.defense_ranged = applied.profile.defense_ranged;'],
  ['failure-lands', 'craftStore.js', 'F4', "    if (outcome(p && p.roll) === 'failed') return null;", '    if (false) return null;'],
  ['export-silent', 'oggExport.js', 'F6', "      note('Fortification ' + fname, 'DROPPED',", "      if (0) note('Fortification ' + fname, 'DROPPED',"],
];

if (process.argv.includes('--bite')) {
  let bad = 0;
  for (const [name, file, leg, find, repl] of MUTANTS) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5fort-'));
    try {
      ['craftStore.js', 'crafting.js', 'itemResolve.js', 'vesselResolve.js', 'oggExport.js'].forEach((f) => {
        let src = fs.readFileSync(path.join(ROOT, 'lib/shared', f), 'utf8');
        if (f === 'crafting.js') src = src.split('../../public/').join(path.join(ROOT, 'public') + '/');
        if (f === file) {
          if (src.split(find).length !== 2) throw new Error('mutant ' + name + ': its line is not in ' + f + ' exactly once');
          src = src.replace(find, repl);
        }
        fs.writeFileSync(path.join(tmp, f), src);
      });
      const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8',
        env: Object.assign({}, process.env, { FORT_LIB: tmp, FORT_EXPORT: path.join(tmp, 'oggExport.js') }) });
      const hit = r.status === 1 && leg.split('|').every((l) => new RegExp('FAIL  ' + l + ' ').test(r.stderr));   // every named leg reds
      console.log((hit ? '  PASS  BITE: ' : '  FAIL  BITE: ') + name + ' → exit ' + r.status + (hit ? ', reds ' + leg : ', ' + leg + ' did not red'));
      if (!hit) bad += 1;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  console.log(bad ? '\nBITES FAILED: ' + bad : '\nOK (every mutant bit)');
  process.exit(bad ? 1 : 0);
}

const Craft = require(path.join(LIB, 'craftStore.js'));
const OE = require(EXPORT);
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const TPL = J('crafting_templates.json').templates;
const SPEND = J('crafting_spend.json');
const index = Craft.indexSpend(SPEND, 'fortification');

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : '')); }
};
const leg = (label, fn) => { try { fn(); } catch (e) { check(label, false, 'threw: ' + (e && e.message)); } };
const JS = (o) => JSON.stringify(o);
const clone = (o) => JSON.parse(JS(o));

function project(id, templateId, improvements, flaws, roll) {
  return Object.assign(Craft.newProject(templateId, 'fortification', []), { id: id, stage: 'spending',
    roll: roll || { su: 2 }, improvements: improvements || [], flaws: flaws || [] });
}
const EQ = { weapons: [{ id: 'blaster_pistol' }], gear: [{ id: 'stimpack', qty: 2 }], armor: { id: 'padded_armor' }, credits: 100 };
const EQ_COPY = clone(EQ);
const T = TPL.fortification_trench, B = TPL.fortification_bunker, BL = TPL.fortification_blind;
const TRENCH_P = project('craft-trench', T.id, ['fortification_expanded_capacity', 'fortification_additional_cover']);
const BUNKER_P = project('craft-bunker', B.id,
  ['fortification_reinforced_armor', 'fortification_expanded_capacity', 'fortification_expanded_capacity'], ['fortification_limited_lifespan']);

// ── F1 the landing ──
let forts = null;
leg('F1 a trench and a bunker land as entries, equipment untouched', () => {
  const a = Craft.landingOf(TRENCH_P, T, index, EQ, { fortifications: undefined });
  const b = Craft.landingOf(BUNKER_P, B, index, a.equipment, { fortifications: a.fortifications });
  forts = b.fortifications;
  check('F1 equipment comes back the same object, deep-equal to its copy (a fortification writes no equipment field)',
    a.equipment === EQ && b.equipment === EQ && JS(EQ) === JS(EQ_COPY), { a: a.equipment, b: b.equipment });
  check('F1 two entries, in build order, id = the project id, template_id and name set',
    forts.length === 2 && forts[0].id === 'craft-trench' && forts[1].id === 'craft-bunker'
    && forts[0].template_id === T.id && forts[1].template_id === B.id && forts[0].name === 'Trench' && forts[1].name === 'Bunker', forts);
  check('F1 built_with in purchase order, repeats kept (improvements then flaws)',
    JS(forts[1].built_with) === JS(['fortification_reinforced_armor', 'fortification_expanded_capacity',
      'fortification_expanded_capacity', 'fortification_limited_lifespan']), forts[1].built_with);
  check('F1 an entry is R-R5CC-2\'s shape and holds no number (resolve-at-render)',
    forts.every((f) => Object.keys(f).every((k) => ['id', 'template_id', 'name', 'built_with', 'made_from'].includes(k))), forts);
  const c = Craft.landingOf(project('craft-bunker-2', B.id, []), B, index, EQ, { fortifications: forts });
  check('F1 a second bunker is named apart from the fortifications it joins', c.entry.name === 'Bunker 2', c.entry.name);
});

// ── F2 written, reloaded, resolved ──
function makeRoster() {
  const data = {};
  const localStorage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
  const win = { SWRPGVersionGuard: require(path.join(ROOT, 'lib/shared/versionGuard.js')),
    CharResolve: { repairPoisonedXp: require(path.join(ROOT, 'lib/shared/charResolve.js')).repairPoisonedXp },
    SWRPGRecordPortrait: require(path.join(ROOT, 'lib/shared/recordPortrait.js')) };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/shared/roster.js'), 'utf8'),
    vm.createContext({ window: win, localStorage: localStorage, Date: Date }), { filename: 'lib/shared/roster.js' });
  return win.SWRPGRoster;
}
leg('F2 the sheet is written, reloaded, and resolved by the one resolver', () => {
  const R = makeRoster();
  const sheet = { name: 'Sergeant Vos', equipment: EQ, fortifications: forts };   // finish()'s save(patch), merged
  R.upsertSavedCharacter({ id: 'char-fort', name: 'Sergeant Vos' }, sheet, 'test');
  const rec = R.findCharById(R.loadSavedCharacters(), 'char-fort');
  const sd = rec && rec.sheetData;
  check('F2 after a reload the sheet holds the landed entries, deep-equal', sd && JS(sd.fortifications) === JS(forts), sd && sd.fortifications);
  check('F2 after a reload equipment deep-equals the input', sd && JS(sd.equipment) === JS(EQ_COPY), sd && sd.equipment);
  const tr = Craft.fortificationOf(sd.fortifications[0], TPL, index);
  const bu = Craft.fortificationOf(sd.fortifications[1], TPL, index);
  check('F2 the trench reads occupancy 7, ranged defence 4 (6 + Expanded Capacity, 3 + Additional Cover)',
    tr.passengers === 7 && tr.defense_ranged === 4 && !tr.unapplied.length && !tr.unresolved.length, tr);
  check('F2 the bunker reads armour 3, occupancy 6, hull trauma 8, silhouette 3, speed 0',
    bu.armor === 3 && bu.passengers === 6 && bu.hull_trauma === 8 && bu.silhouette === 3 && bu.speed === 0 && !bu.unresolved.length, bu);
  check('F2 each move is in `because` (armour, occupancy, ranged defence)',
    (bu.because.armor || []).length === 1 && (bu.because.passengers || []).length === 2 && (tr.because.defense_ranged || []).length === 1, { bu: bu.because, tr: tr.because });
  check('F2 Limited Lifespan is returned in `unapplied` with its told reason',
    bu.unapplied.length === 1 && bu.unapplied[0].id === 'fortification_limited_lifespan'
    && bu.unapplied[0].reason === index.fortification_limited_lifespan.row.told.reason, bu.unapplied);
});

// ── F3 "if applicable" ──
leg('F3 a row whose number the template lacks is unapplied, and creates nothing', () => {
  const ra = Craft.landingOf(project('craft-t2', T.id, ['fortification_reinforced_armor']), T, index, EQ, {});
  const tr = Craft.fortificationOf(ra.entry, TPL, index);
  check('F3 Reinforced Armor on a trench is bought and unapplied, "not applicable: the Trench has no armour"',
    JS(ra.entry.built_with) === JS(['fortification_reinforced_armor']) && tr.unapplied.length === 1
    && tr.unapplied[0].reason === 'not applicable: the Trench has no armour', tr.unapplied);
  check('F3 no armour is created on the trench', !('armor' in tr), tr);
  const bl = Craft.fortificationOf({ id: 'b', template_id: BL.id, name: 'Blind', built_with: [] }, TPL, index);
  check('F3 a blank stays ABSENT: no silhouette on a trench or a blind; the blind keeps concealment 3',
    !('silhouette' in tr) && !('silhouette' in bl) && bl.concealment === 3, { tr, bl });
});

// ── D1–D6: DECISIONS D-327, ruling release-r5-crafting-fib-c0 ADDENDUM 3 (C-D327-1..3) ──
leg('D-327 ranged defence counts from 0 where none is printed, floored at 0; nothing else moves', () => {
  const of = (tid, rows) => Craft.fortificationOf({ id: 'd', template_id: tid, name: 'x', built_with: rows }, TPL, index);
  const d1 = of(B.id, ['fortification_additional_cover']);
  check('D1 bunker + Additional Cover → ranged defence 1, not unapplied (C-D327-1)',
    d1.defense_ranged === 1 && d1.unapplied.length === 0 && JS(d1.because.defense_ranged) === JS([{ source: 'Additional Cover', amount: 1 }]), d1);
  const d2 = of(BL.id, ['fortification_inferior_protection']);
  check('D2 blind + Inferior Protection → 0 (floored), its because −1, not unapplied (C-D327-1)',
    d2.defense_ranged === 0 && d2.unapplied.length === 0 && JS(d2.because.defense_ranged) === JS([{ source: 'Inferior Protection', amount: -1 }]), d2);
  const d3 = of(B.id, ['fortification_additional_cover', 'fortification_inferior_protection']);
  check('D3 bunker + Cover + Inferior → 0', d3.defense_ranged === 0 && d3.unapplied.length === 0, d3);
  const d4 = of(B.id, []);
  check('D4 a bare bunker → no defense_ranged key, and the template carries none (C-D327-2)',
    !('defense_ranged' in d4) && !('defense_ranged' in B.result_profile) && !('defense_ranged' in BL.result_profile), d4);
  const d5 = of(T.id, ['fortification_reinforced_armor']);
  check('D5 Trench + Reinforced Armor → still unapplied, "not applicable" (C-D327-3)',
    d5.unapplied.length === 1 && /^not applicable: the Trench has no armour$/.test(d5.unapplied[0].reason) && !('armor' in d5), d5);
  const d6 = of(T.id, ['fortification_inferior_protection']);
  check('D6 Trench + Inferior Protection → 2 (unchanged)', d6.defense_ranged === 2 && d6.unapplied.length === 0, d6);
});

// ── F4 failure and once_only ──
leg('F4 a failed project lands nothing; a second Reinforced Armor throws', () => {
  const failed = Craft.landingOf(project('craft-f', B.id, ['fortification_reinforced_armor'], [], { su: 0, fa: 1 }), B, index, EQ, { fortifications: forts });
  check('F4 a FAILED project lands nothing (landingOf → null)', failed === null, failed);
  let threw = false;
  try { Craft.landingOf(project('craft-x', B.id, ['fortification_reinforced_armor', 'fortification_reinforced_armor']), B, index, EQ, {}); }
  catch (e) { threw = /past its limit/.test(e.message); }
  check('F4 a second Reinforced Armor throws (once_only)', threw);
});

// ── F5 one resolver, one writer ──
leg('F5 one resolver, and finish() takes the landing', () => {
  const defs = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|cjs)$/.test(e.name) && /function fortificationOf\(/.test(fs.readFileSync(p, 'utf8'))) defs.push(path.relative(ROOT, p));
    });
  })(path.join(ROOT, 'lib'));
  check('F5 fortificationOf is defined once under lib/, in craftStore.js', JS(defs) === JS(['lib/shared/craftStore.js']), defs);
  const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const fin = app.slice(app.indexOf('  function finish(p, name) {'), app.indexOf('  function finish(p, name) {') + 2400);
  check('F5 finish() passes sheet.fortifications and takes landed.fortifications',
    /Craft\.landingOf\(p, t, index, eq, \{[^}]*fortifications: sheet\.fortifications[,\s}]/.test(fin)
    && /if \(landed\.fortifications\) patch\.fortifications = landed\.fortifications;/.test(fin));
});

// ── F6 the export's told drop ──
leg('F6 the export tells each entry as DROPPED', () => {
  const C = path.join(ROOT, 'public/data/canonical');
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(C, f + '.json'), 'utf8'));
  const list = (name) => { const d = rd(name), it = d[name] || d; return Array.isArray(it) ? it : Object.values(it); };
  const deps = {
    attestation: JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/shared/oggAttestation.json'), 'utf8')),
    csgMap: JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/shared/oggCsgMap.json'), 'utf8')),
    species: list('species'), careers: list('careers'), specializations: list('specializations'), talents: list('talents'),
    signatureAbilities: list('signature_abilities'), weapons: list('weapons'), armor: list('armor'), gear: list('gear'),
    skillVocab: rd('skills.vocab').entries,
  };
  const CH = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters[0];
  const rows = (ch) => { const r = []; OE.exportCharacter(clone(ch), { fileName: 'fort.xml', volatile: {}, receipt: r, deps }); return r; };
  const withF = rows(Object.assign({}, CH, { fortifications: forts }));
  const dropped = withF.filter((r) => /^Fortification /.test(r.field));
  check('F6 two entries → two DROPPED rows, each with a player line naming it',
    dropped.length === 2 && dropped.every((r) => r.status === 'DROPPED' && r.player)
    && dropped[0].player.includes('Trench') && dropped[1].player.includes('Bunker'), dropped);
  const without = rows(CH).filter((r) => /^Fortification /.test(r.field));
  check('F6 the same character without entries → no fortification row', without.length === 0, without);
});

console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
