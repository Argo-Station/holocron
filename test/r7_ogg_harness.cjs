/* R7 release-r7-oggdude-io — the shared harness of the r7_* OggDude guards (not a guard itself: it runs nothing on load).
 * importSheet(xml) runs the REAL import → normalizeCreated chain over the shipped registries; oracle(char) runs
 * scripts/ogg_export.py on a character and returns { xml, rows } (its reader rows). IMP/EXP may be re-pointed by the bite run. */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const canon = (t) => Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', t + '.json'), 'utf8'))[t]);
const byId = (r) => { const o = {}; r.forEach((x) => { if (x && x.id) o[x.id] = x; }); return o; };
const T = {}; ['species', 'careers', 'specializations', 'talents', 'weapons', 'armor', 'gear', 'force_powers', 'signature_abilities'].forEach((t) => { T[t] = canon(t); });
const NM = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/narrative-mechanics.json'), 'utf8'));
const gd = { narrativeMechanics: { morPairs: { strengths: [], weaknesses: [] }, config: NM.config || NM },
  charbuild: { species: byId(T.species), careers: byId(T.careers), specializations: byId(T.specializations), talents: byId(T.talents), forcePowers: byId(T.force_powers), signatureAbilities: byId(T.signature_abilities) } };
const registries = { weapons: byId(T.weapons), armor: byId(T.armor), gear: byId(T.gear) };
function importSheet(OGG, xml) {
  const index = {}; Object.keys(T).forEach((t) => { index[t] = OGG.indexBy(T[t], '_source_key'); });
  const r = OGG.importToCharacter(xml, { index });
  const sheet = CR.normalizeCreated(r.character, r.speciesRecord, null, gd, 'ogg-import', { registries, activeMods: [] });
  return { r, sheet, report: r.oggSource && r.oggSource.report };
}
function oracle(char) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r7ogg-')), fj = path.join(tmp, 'c.json'), fo = path.join(tmp, 'c.xml'), fr = path.join(tmp, 'r.json');
  try {
    fs.writeFileSync(fj, JSON.stringify(char));
    execFileSync(path.join(ROOT, '.venv/bin/python'), [path.join(ROOT, 'scripts/ogg_export.py'), '--character-json', fj, '--out', fo, '--receipt-json', fr], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
    return { xml: fs.readFileSync(fo, 'utf8'), rows: JSON.parse(fs.readFileSync(fr, 'utf8')).reader_rows || [] };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
const save = (n) => fs.readFileSync(path.join(ROOT, 'data-sources/ogg-saves', n), 'utf8');
const pregen = (id) => JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters.find((c) => c.id === id)));
function checker() {
  let failures = 0;
  return { check: (ok, m, d) => { if (ok) console.log('  PASS  ' + m); else { failures++; console.error('  FAIL  ' + m + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 300) : '')); } },
    failures: () => failures };
}
module.exports = { ROOT, importSheet, oracle, save, pregen, checker, registries };
