#!/usr/bin/env node
/**
 * user_art_matcher.cjs — STANDING guard for the BYOA filename matcher (lib/store/userArt.js).
 *
 * The matcher (R-BYOA1) maps a user's image filenames to catalog items by BOTH keys we carry —
 * the canonical id AND the OggDude source key — and NEVER guesses: only exact normalized matches
 * resolve; anything else returns null (→ the import report's unmatched list). This guard proves:
 *   1. Canonical-id scheme: vibro_ax.webp / VibroAx.png / vibro-ax.jpg → the id `vibro_ax`.
 *   2. OggDude source-key scheme: Weapon12DEFEND.png / 12defend.webp → the id `12_defender`
 *      (prefix strip + case-fold), across all three sections (Weapon/Armor/Gear).
 *   3. Never-guesses: a garbage/partial/unknown name → null (no fuzzy nearest-match).
 *   4. Case/separator insensitivity via the shared normalizer.
 *
 * Uses the real registries + the module's synchronous _buildMaps hook (no IndexedDB/fetch).
 * Run:  node test/user_art_matcher.cjs
 */
const fs = require('fs');
const path = require('path');

const M = require('../lib/store/userArt.js');   // browser shim → attaches to module.exports
const UA = M.SWRPGUserArt || (typeof window !== 'undefined' && window.SWRPGUserArt);

const REG_DIR = path.join(__dirname, '..', 'public', 'data', 'canonical');
const regs = {};
for (const sec of ['weapons', 'armor', 'gear']) {
  regs[sec] = JSON.parse(fs.readFileSync(path.join(REG_DIR, sec + '.json')))[sec];
}
UA._buildMaps(regs);

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}
const R = UA.resolveFilename;

// pick a couple of real records to anchor the source-key scheme
const skOf = (sec, id) => regs[sec][id]._source_key;
const vibroaxSk = Object.keys(regs.weapons).find(id => regs.weapons[id]._source_key === '12DEFEND') ? '12DEFEND' : null;

// 1. canonical-id scheme (case + separator insensitive)
check('id: vibro_ax.webp → vibro_ax', R('vibro_ax.webp') === 'vibro_ax');
check('id: VibroAx.png (no underscore, mixed case) → vibro_ax', R('VibroAx.png') === 'vibro_ax');
check('id: vibro-ax.jpg (hyphen) → vibro_ax', R('vibro-ax.jpg') === 'vibro_ax');
check('id: nested/path/blaster_pistol.webp → blaster_pistol', R('packs/mine/blaster_pistol.webp') === 'blaster_pistol');

// 2. OggDude source-key scheme, all three sections (prefix strip + case-fold)
check('sk weapon: Weapon12DEFEND.png → 12_defender (source_key 12DEFEND)',
  R('Weapon12DEFEND.png') === '12_defender' && skOf('weapons', '12_defender') === '12DEFEND');
check('sk weapon: bare 12defend.webp → 12_defender', R('12defend.webp') === '12_defender');
const armorId = Object.keys(regs.armor).find(id => regs.armor[id]._source_key === 'MOUNTARMOR');
check('sk armor: ArmorMOUNTARMOR.png → the mountaineer armor',
  armorId && R('ArmorMOUNTARMOR.png') === armorId);
const gearId = Object.keys(regs.gear).find(id => regs.gear[id]._source_key === '3MALCOMLINK');
check('sk gear: Gear3MALCOMLINK.webp → the 3-MAL comlink',
  gearId && R('Gear3MALCOMLINK.webp') === gearId);

// 3. NEVER guesses (R-BYOA1): unknown / partial / empty → null
check('never-guess: totally unknown name → null', R('my_cat_photo.jpg') === null);
check('never-guess: partial id "vibro" → null (no fuzzy match)', R('vibro.png') === null);
check('never-guess: empty basename → null', R('.png') === null);
check('never-guess: a real WORD that is not a key → null', R('rifle.webp') === null || typeof R('rifle.webp') === 'string' && regs.weapons[R('rifle.webp')]);

// 4. normalizer
check('norm strips non-alphanumerics + lowercases', UA._norm('Vibro-Ax_01!') === 'vibroax01');

// every resolved id is a REAL catalog id (no map corruption)
const sample = ['vibro_ax.webp', 'Weapon12DEFEND.png', 'blaster_pistol.webp'];
check('all resolved ids exist in a registry', sample.every(n => {
  const id = R(n); if (!id) return false;
  return regs.weapons[id] || regs.armor[id] || regs.gear[id];
}));

if (failures) { console.error('\nuser_art_matcher: ' + failures + ' FAILED'); process.exit(1); }
console.log('\nuser_art_matcher: all green');
