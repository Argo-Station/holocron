#!/usr/bin/env node
/* species_wash_manifest — the crossed washes reach the plate, and keep reaching it.
 *
 * Ruled by `species-choice-pane-shows` R-SPS-A1-1 (the wash-crossing WIRING half). The data half
 * crossed 413 washes that nothing consumed; this half consumes them, and everything below exists
 * because each failure mode here is SILENT — the plate keeps painting the algorithmic default and
 * looks entirely plausible while no species wash is ever shown.
 *
 * TWO FOUNDING CASES, both paid for in the lap that wrote this (R-CPR-39):
 *   (i)  THE URL BASE. `--doc-wash` is handed to CSS, and a relative `url()` in a custom property
 *        resolves against the STYLESHEET (`lib/shared/paper.css`), not the document. Written
 *        relative, `art/washes/Bothan.webp` became `/lib/shared/art/washes/Bothan.webp`, 404'd, and
 *        the default showed through. Caught by reading the computed background, never by grep.
 *   (ii) MANIFEST DRIFT. The manifest is GENERATED from the directory. Add or rename a wash without
 *        regenerating and those species quietly fall to the default forever.
 *
 * Run: node test/species_wash_manifest.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WASH_DIR = path.join(REPO, 'art/washes');
const MANIFEST = path.join(WASH_DIR, 'manifest.json');
const SHELL = path.join(REPO, 'player/index.html');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); }
};

console.log('\nspecies wash manifest — R-SPS-A1-1\n');

if (!fs.existsSync(MANIFEST)) {
  console.log('  FAIL  the manifest exists  ->  ' + MANIFEST + ' missing; regenerate with '
    + 'scripts/canonical/build_species_wash_manifest.py\n');
  process.exit(1);
}
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const byId = m.by_id || {};
const onDisk = new Set(fs.readdirSync(WASH_DIR).filter((f) => f.endsWith('.webp')));

/* NON-VACUOUS FIRST. An empty manifest satisfies "every entry resolves" trivially, and that is
 * exactly the state a failed regeneration leaves behind. */
check('(0) the manifest is a real population, not an empty index that would pass over anything',
  Object.keys(byId).length > 400, Object.keys(byId).length + ' entries');

const missing = Object.entries(byId).filter(([, f]) => !onDisk.has(f));
check('(1) every species the manifest binds has its wash ON DISK',
  missing.length === 0, missing.slice(0, 5).map(([k, f]) => k + ' -> ' + f).join(', '));

check('(2) the default wash the manifest names is on disk',
  !m.default || onDisk.has(m.default), String(m.default));

/* (3) DRIFT. Re-derive the binding the generator would produce and compare. Its three candidate
 * spellings are the lab's own output forms, not a prediction of them. */
const SPECIES = path.join(REPO, 'public/data/canonical/species.json');
const raw = JSON.parse(fs.readFileSync(SPECIES, 'utf8'));
const recs = raw.species || raw;
const cands = (n) => {
  const a = String(n).replace(/['’]/g, '');
  return [a.replace(/\s+/g, '_') + '.webp',
          a.replace(/[^A-Za-z0-9-]/g, '') + '.webp',
          a.replace(/[^A-Za-z0-9]/g, '') + '.webp'];
};
const expected = {};
for (const [sid, rec] of Object.entries(recs).sort()) {
  const name = (rec && rec.name) || sid;
  const hit = cands(name).find((c) => onDisk.has(c));
  if (hit) expected[sid] = hit;
}
const drifted = Object.keys({ ...expected, ...byId })
  .filter((k) => expected[k] !== byId[k]).slice(0, 6);
check('(3) the manifest MATCHES what the directory and registry now say (no drift)',
  drifted.length === 0,
  drifted.map((k) => k + ': manifest=' + byId[k] + ' disk=' + expected[k]).join(' · ')
    + ' — regenerate with scripts/canonical/build_species_wash_manifest.py');

/* (4) THE URL BASE — founding case (i). */
const shell = fs.readFileSync(SHELL, 'utf8');
const dir = (shell.match(/var SPECIES_WASH_DIR = '([^']*)'/) || [])[1];
check("(4) SPECIES_WASH_DIR is ROOT-ABSOLUTE — a relative url() resolves against the STYLESHEET",
  dir === '/art/washes/', String(dir));

/* (5) The residue is ON THE RECORD rather than absent. A species with no wash is a fact; a species
 * missing from the manifest with nothing said about it is a fact nobody can check. */
check('(5) the unresolved residue is recorded in the manifest',
  Array.isArray(m.unresolved),
  'unresolved: ' + (m.unresolved ? m.unresolved.length : 'ABSENT'));

console.log('\nspecies wash manifest: ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail ? 1 : 0);
