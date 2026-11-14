#!/usr/bin/env node
/**
 * release_r5_roundtrip.cjs — RELEASE 1.0 R5, card `release-r5-data` ACCEPTANCE 6 (blind checklist items 8 and 10): an OggDude round
 * trip of one fixture character holding a NEW weapon (C3's Spray Rifle, SPRAYRIF) and a bare HILT (LTSABERBASICHILT, C8):
 * import → export → re-import, the weapon intact, through the importer's ONE entry (importToCharacter, handed ADAPT_MAP exactly as
 * player/app.jsx hands it), the REAL creator core (normalizeCreated) and the shipped exporter (oggExport.exportCharacter).
 *
 * The fixture, test/fixtures/release_r5_roundtrip.xml, is test/fixtures/oggdude_saves/A_ArooMeh_Human_Smuggler.xml (byte-identical to
 * Jason's save, which stays untouched) with exactly two ItemKeys swapped: BLASTHOLDTT24 → SPRAYRIF, BLASTPIS → LTSABERBASICHILT.
 *   T0  the fixture IS that derivation, byte for byte (no other edit rides in);
 *   T1  the first import: the sheet holds spray_rifle and basic_lightsaber (the hilt adapted, the receipt's adapted row names the
 *       saber), and neither key is reported absent;
 *   T2  the export writes SPRAYRIF and the SABER's own key, LTSABERBASIC, and no hilt key: the round trip's ONE key change
 *       (hilt → saber), DISCLOSED here and in the gate (ADDENDUM 2 Q2), never hidden;
 *   T3  the re-import holds the same weapons, by id and count, as the first import;
 *   T4  ADDENDUM 7's measured line: A with BLASTPIS → a genuinely-absent OggDude weapon imports with ONE receipt row under
 *       NOT IN OUR DATA (`absent`, type weapons) — not a silent drop, and not LEFT IN THE FILE (that line is the D-273 leftOut).
 *       RE-POINTED by release-r7-bug-burndown ADDENDUM 37 D-R7GD1 (a): GUNGPES is HELD now (B-1429, Nexus of Power p.104), so
 *       the absent key is RWEAPTEMP5 ("Energy Rifle (Template)", an OggDude crafting template no registry holds and no
 *       ADAPT_MAP entry adapts). KEEPS the rule (one absent row, not a silent drop, not leftOut); DROPS GUNGPES as its
 *       example; ADDS T4b, GUNGPES now imports onto the sheet as gungan_personal_energy_shield.
 * BITE (every run, by return value): T1 on an import without ADAPT_MAP (the hilt is dropped), and T3 on an export with the
 * Spray Rifle's line removed (the weapon lost) — each must report a problem.
 * Run: node test/release_r5_roundtrip.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OGG = require(path.join(ROOT, 'lib/shared/oggImport.js'));
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const X = require(path.join(ROOT, 'lib/shared/oggExport.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'test/fixtures/oggdude_saves/A_ArooMeh_Human_Smuggler.xml'), 'utf8');
const FIX = fs.readFileSync(path.join(ROOT, 'test/fixtures/release_r5_roundtrip.xml'), 'utf8');
const SWAPS = [['BLASTHOLDTT24', 'SPRAYRIF'], ['BLASTPIS', 'LTSABERBASICHILT']];
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}${!c && d ? '  ->  ' + d : ''}`); };

const canon = (t) => Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', t + '.json'), 'utf8'))[t]);
const byId = (recs) => { const o = {}; recs.forEach((r) => { if (r && r.id) o[r.id] = r; }); return o; };
const T = {}; ['species', 'careers', 'specializations', 'talents', 'weapons', 'armor', 'gear', 'force_powers'].forEach((t) => { T[t] = canon(t); });
const gameData = { narrativeMechanics: { morPairs: { strengths: [], weaknesses: [] }, config: {} },
  charbuild: { species: byId(T.species), careers: byId(T.careers), specializations: byId(T.specializations), talents: byId(T.talents), forcePowers: byId(T.force_powers) } };
const registries = { weapons: byId(T.weapons), armor: byId(T.armor), gear: byId(T.gear) };
const index = {}; Object.keys(T).forEach((t) => { index[t] = OGG.indexBy(T[t], '_source_key'); });
const W = { rifle: index.weapons.SPRAYRIF, saber: index.weapons[OGG.ADAPT_MAP.weapons.LTSABERBASICHILT.toKey] };

function importWith(xml, adaptMap) {
  const r = OGG.importToCharacter(xml, { index, adaptMap });
  if (r.error) return { error: r.error };
  const sheet = CR.normalizeCreated(r.character, r.speciesRecord, null, gameData, 'ogg-import', { registries, activeMods: [] });
  return { r, sheet, receipt: r.oggSource && r.oggSource.report ? r.oggSource.report : OGG.buildReport(r.report, r.parsed) };
}
// the sheet's weapons (normalizeCreated's `equipment.weapons`, one entry per item held), as `id×count`
const weaponsOf = (sheet) => { const n = {}; (((sheet.equipment || {}).weapons) || []).forEach((w) => { n[w.id] = (n[w.id] || 0) + 1; });
  return Object.keys(n).sort().map((k) => `${k}×${n[k]}`); };

function firstImport(adaptMap) {
  const probs = [];
  const one = importWith(FIX, adaptMap);
  if (one.error) return { probs: ['import error ' + one.error] };
  const held = weaponsOf(one.sheet).map((s) => s.split('×')[0]);
  [W.rifle, W.saber].forEach((w) => { if (!held.includes(w.id)) probs.push(`the sheet lacks ${w.id}`); });
  if (!(one.receipt.adapted || []).some((a) => a.to === W.saber.name)) probs.push(`the receipt's adapted rows do not name ${W.saber.name}`);
  const absent = (one.r.report.absent || []).map((a) => a.rec.key).filter((k) => k === 'SPRAYRIF' || k === 'LTSABERBASICHILT');
  if (absent.length) probs.push('reported absent: ' + absent.join(', '));
  return { probs, one };
}
function reimport(one, xmlOut) {
  const two = importWith(xmlOut, OGG.ADAPT_MAP);
  if (two.error) return ['re-import error ' + two.error];
  const a = weaponsOf(one.sheet), b = weaponsOf(two.sheet);
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [`first import ${JSON.stringify(a)}, re-import ${JSON.stringify(b)}`];
}

// T0
const derived = SWAPS.reduce((s, [a, b]) => s.replace(`<ItemKey>${a}</ItemKey>`, `<ItemKey>${b}</ItemKey>`), SRC);
ok(derived === FIX && SWAPS.every(([a]) => SRC.split(`<ItemKey>${a}</ItemKey>`).length === 2),
  'T0 the fixture is A_ArooMeh with exactly BLASTHOLDTT24 → SPRAYRIF and BLASTPIS → LTSABERBASICHILT (byte for byte)');
// T1
const t1 = firstImport(OGG.ADAPT_MAP);
ok(t1.probs.length === 0, `T1 the first import holds ${W.rifle.id} and ${W.saber.id} (the hilt adapted; the receipt names ${W.saber.name})`, t1.probs.join('; '));
// T2
const xmlOut = t1.one ? X.exportCharacter(t1.one.sheet, { fileName: 'release_r5_roundtrip.xml' }) : '';
const keys = (xmlOut.match(/<CharWeapon>[\s\S]*?<\/CharWeapon>/g) || []).map((b) => (b.match(/<ItemKey>([^<]*)<\/ItemKey>/) || [])[1]).filter(Boolean);
ok(keys.includes('SPRAYRIF') && keys.includes(W.saber._source_key) && !keys.includes('LTSABERBASICHILT'),
  `T2 the export writes SPRAYRIF and the saber's own key ${W.saber._source_key}, not the hilt's (the disclosed key change): ${JSON.stringify(keys)}`);
// T3
const t3 = t1.one ? reimport(t1.one, xmlOut) : ['no first import'];
ok(t3.length === 0, `T3 the re-import holds the same weapons, by id and count: ${t1.one ? JSON.stringify(weaponsOf(t1.one.sheet)) : '—'}`, t3.join('; '));
// T4 — ADDENDUM 7's measured line: a character holding a weapon we do not hold is never silently dropped
// (re-pointed GUNGPES → RWEAPTEMP5 by ADDENDUM 37 D-R7GD1: GUNGPES is held since B-1429)
const ABSENT_KEY = 'RWEAPTEMP5';
const gp = importWith(SRC.replace('<ItemKey>BLASTPIS</ItemKey>', '<ItemKey>' + ABSENT_KEY + '</ItemKey>'), OGG.ADAPT_MAP);
const gpAbsent = gp.r ? (gp.receipt.absent || []).filter((a) => a.key === ABSENT_KEY) : [];
ok(gpAbsent.length === 1 && gpAbsent[0].type === 'weapons',
  `T4 ${ABSENT_KEY} (in no registry) imports as one receipt row under NOT IN OUR DATA, not a silent drop: ${JSON.stringify(gpAbsent)}`
  + (gp.receipt && 'leftOut' in gp.receipt ? ' · leftOut ' + JSON.stringify(gp.receipt.leftOut) : ' · no LEFT IN THE FILE line'));
// T4b — GUNGPES, held by B-1429, imports onto the sheet and is not reported absent
const gh = importWith(SRC.replace('<ItemKey>BLASTPIS</ItemKey>', '<ItemKey>GUNGPES</ItemKey>'), OGG.ADAPT_MAP);
const ghAbsent = gh.r ? (gh.receipt.absent || []).filter((a) => a.key === 'GUNGPES') : ['no import'];
ok(ghAbsent.length === 0 && weaponsOf(gh.sheet).some((w) => /^gungan_personal_energy_shield×/.test(w)),
  `T4b GUNGPES (held, B-1429) imports as gungan_personal_energy_shield: ${gh.sheet ? JSON.stringify(weaponsOf(gh.sheet)) : '—'}`);
// BITES
const b1 = firstImport(null);
ok(b1.probs.length > 0, `BITE T1 without ADAPT_MAP reports: ${b1.probs.join('; ')}`);
const b3 = t1.one ? reimport(t1.one, xmlOut.replace(/<CharWeapon>\s*<ItemKey>SPRAYRIF<\/ItemKey>[\s\S]*?<\/CharWeapon>/, '')) : [];
ok(b3.length > 0, `BITE T3 on an export with the Spray Rifle's line removed reports: ${b3.join('; ')}`);

console.log(`release_r5_roundtrip: ${pass}/${pass + fail} ${fail ? `(${fail} FAILED)` : 'ALL PASS'}`);
process.exit(fail ? 1 : 0);
