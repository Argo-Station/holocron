// test/b984_pool_skill_index_base.cjs — B-984 (ruling `shipyard-s5-ready` P1, rider R-S5R-6): an own-pack change nulls
// the discovery view (`window._canonicalRegistries`), and nothing re-loads it while a sheet stays open, so the pool path's
// skill index (lib/shared/sheetPool.js `poolModSkillIndex`) read no vocabulary and every auto-applied die left the open
// sheet. The fix reads the PRISTINE base's skills (`window._canonicalRegistriesBase`) when discovery is gone. It rests on
// one premise, pinned here: NO PACK SECTION DEFINES SKILLS (SWRPGMods.SECTIONS, F-100's list) — so the base's vocabulary
// is the vocabulary every view carries. If F-100 ever adds `skills` to the sections, this goes red and the fix is re-ruled.
//
// The function is SLICED from the shipped file by name and run (never retyped), as band_arithmetic.cjs does.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

// R-S5R-6 · the premise
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
check('R-S5R-6: SWRPGMods.SECTIONS carries no `skills` (no pack section defines the skills vocabulary)',
  Array.isArray(M.SECTIONS) && M.SECTIONS.length > 0 && M.SECTIONS.indexOf('skills') < 0 && !(M.SECTION_TABLE && M.SECTION_TABLE.skills), M.SECTIONS);

// the drive: slice poolModSkillIndex out of the shipped file and run it over a window whose discovery view is gone
const SRC = process.env.B984_SRC || path.join(ROOT, 'lib/shared/sheetPool.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('function poolModSkillIndex() {');
const b = src.indexOf('\n}\n', a);
check('poolModSkillIndex is in sheetPool.js (sliced by name)', a > 0 && b > a);
function run(win) {
  return new Function('window', src.slice(a, b + 2) + '\nreturn poolModSkillIndex();')(win);
}
const SKILLS = [{ id: 'discipline', key: 'DISC' }, { id: 'stealth', key: 'STEAL' }];
const P = { indexSkills: (entries) => ({ n: entries.length, from: entries }) };
const loaded = run({ SWRPGPoolMods: P, _canonicalRegistries: { skills: SKILLS }, _canonicalRegistriesBase: { skills: SKILLS } });
check('loaded: the index is built from the discovery view', loaded && loaded.n === 2, loaded);
const afterPack = run({ SWRPGPoolMods: P, _canonicalRegistries: null, _canonicalRegistriesBase: { skills: SKILLS } });
check('B-984: after a pack change nulls discovery, the index is built from the PRISTINE base (not null — the dice stay on the open sheet)',
  afterPack && afterPack.n === 2 && afterPack.from === SKILLS, afterPack);
const nothing = run({ SWRPGPoolMods: P, _canonicalRegistries: null, _canonicalRegistriesBase: null });
check('before anything loads: null (the helper stays total — the caller\'s spec unchanged)', nothing === null, nothing);
const noModule = run({ _canonicalRegistries: { skills: SKILLS } });
check('without the assembler: null', noModule === null, noModule);

console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
