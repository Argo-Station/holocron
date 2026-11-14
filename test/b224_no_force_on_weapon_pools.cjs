/**
 * B-224 — a weapon ATTACK pool carries no Force dice.
 *
 * THE DIVERGENCE: `computeWeaponPool` set `force: (derived && derived.forceRating) || 0`,
 * UNCONDITIONALLY. Every Force-sensitive character rolled their full Force Rating into every
 * blaster shot and every knife swing, on the cockpit and on LOADOUT.
 *
 * RAW: an attack pool is characteristic/skill vs difficulty, plus boost/setback (FaD Core
 * p.30-31). Force dice enter a check through a FORCE POWER check, or through explicit talent or
 * upgrade text that says so (FaD Core p.282) — never as a standing bonus on ordinary attacks.
 * Oracle-cited two-pass with negative-discipline; the deciding line read by the architect; the
 * behaviour change escalated to and approved by Jason (ruling `dice-hub-mockup` §5, card item 10).
 *
 * WHAT THIS GUARD MUST NOT DO is prove the removal by proving Force dice are gone everywhere —
 * that would pass just as well if the Force-power path had been broken too. §C executes the
 * OTHER path and requires the dice to still be there, so "attacks lost their Force dice" and
 * "Force powers lost their Force dice" can never look the same to this file.
 *
 * Run: node test/b224_no_force_on_weapon_pools.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

const REPO = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(REPO, 'player', 'app.jsx'), 'utf8');
// R-S4PP-2 (ruling `shipyard-s4-ship-pool-path`): the sheet's dice path moved VERBATIM to lib/shared/sheetPool.js, so
// its members are sliced from there — the same text, the same claim (norm 3); the rest still comes from app.jsx.
const POOL = fs.readFileSync(path.join(REPO, 'lib', 'shared', 'sheetPool.js'), 'utf8');
// D-507 (handoff `encounters-e3-dicehub-move`): DiceHub's closure moved VERBATIM to lib/shared/diceHub.jsx, so its
// members (resolveWeaponSkillKey, computeWeaponPool, …) are sliced from there by name — the same text, the same claim.
const HUB = fs.readFileSync(path.join(REPO, 'lib', 'shared', 'diceHub.jsx'), 'utf8');

// Same slice idiom as guard_b207 — EXECUTE the shipped function, never regex its source text.
function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — app.jsx moved; fix the slice.');
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

const sb = { module: { exports: {} }, console: console, JSON: JSON, Math: Math, Object: Object,
             Array: Array, String: String, Number: Number, Boolean: Boolean, isFinite: isFinite };
sb.window = sb; sb.global = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(REPO, 'lib', 'shared', 'charResolve.js'), 'utf8'), sb, { filename: 'charResolve.js' });
vm.runInContext(fs.readFileSync(path.join(REPO, 'lib', 'shared', 'poolMods.js'), 'utf8'), sb, { filename: 'poolMods.js' });
// F-100 M7: the vocabulary's id → sheet key and id → characteristic maps, as loadCanonicalCharacterBuild builds them.
sb._canonicalCharbuild = (function () {
  var cb = { skillSheetKeys: {}, skillChars: {} };
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'canonical', 'skills.vocab.json'), 'utf8')).entries.forEach(function (e) {
    cb.skillSheetKeys[e.id] = (e.aliases || []).find(function (a) { return /^[A-Z]+$/.test(a); }) || e.id;
    if (e.characteristic) cb.skillChars[e.id] = e.characteristic;
  });
  return cb;
})();
sb._canonicalRegistries = { skills: JSON.parse(fs.readFileSync(
  path.join(REPO, 'public', 'data', 'canonical', 'skills.vocab.json'), 'utf8')).entries };
vm.runInContext([
  sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
  sliceDecl(POOL, 'const OGG_TO_SHEET_SKILL = {') + ';',
  // F-100 M7 C2 (R-M7K-9): SKILL_CHARS is DELETED; the characteristic is CharResolve.skillCharacteristic through the
  // shared read, sliced like the rest, over the vocabulary's own map (the sandbox's `_canonicalCharbuild`).
  sliceDecl(POOL, 'function sheetSkillCharacteristic(sheet, sheetKey)'),
  sliceDecl(HUB, 'function resolveWeaponSkillKey(rawSkill)'),
  // R-B658 (ruling `b658-sheet-skill-grant-shape`): `computeWeaponPool` reads its skill rank through the
  // shared read-tolerance helper, so the helper is SLICED — the same reason `withPoolMods` is. Stubbing it
  // would make this guard execute a function the app does not have.
  sliceDecl(POOL, 'function skillEntryRank(entry)'),
  sliceDecl(POOL, 'function poolModSkillIndex()'),
  sliceDecl(POOL, 'function collectPoolMods(resolvedEquipment, session)'),
  sliceDecl(POOL, 'function collectRollNumbers(sheet)'),
  sliceDecl(POOL, 'function withPoolMods(spec, mods, skillKeyOrId, characteristic, roll, powerId)'),
  sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)'),
  // the builder moved into sheetPool.js (f100-surfacing-sheet-concept R-SSC-4, ADDENDUM 10 C3 (a)): computeWeaponPool is its
  // one-line caller — re-pointed by name at f100-surfacing-sheet-build
  sliceDecl(POOL, 'function weaponPoolOf(sheet, weapon, opts)'),
  sliceDecl(POOL, 'function sheetWeaponDamage(sheet, weapon, qualityRows)'),   // post1-one-number-hub-build C3: weaponPoolOf's one damage
].join('\n') + '\nglobalThis.SKILL_NAMES=SKILL_NAMES;globalThis.OGG_TO_SHEET_SKILL=OGG_TO_SHEET_SKILL; globalThis.SWRPGSheetPool = Object.assign(globalThis.SWRPGSheetPool || {}, { weaponPoolOf: weaponPoolOf });',
  sb, { filename: 'app.jsx-slices' });

const SHEET = { characteristics: { brawn: 3, agility: 3 }, skills: { RANGHVY: 2, MELEE: 2 } };
const EQ = { weapons: [], armor: null, gear: [] };
const BLASTER = { name: 'Blaster Rifle', skill: 'ranged_heavy', range: 'long',
                  damage: { value: 9, base: 'flat' }, crit: 3, qualities: [] };
const SWORD = { name: 'Sword', skill: 'melee', range: 'engaged',
                damage: { value: 3, base: 'brawn' }, crit: 3, qualities: [] };

// ── A. a Force user's ATTACK pools carry no Force dice ────────────────────────────────────────
[['Force Rating 1', 1], ['Force Rating 3', 3]].forEach(function (row) {
  const derived = { forceRating: row[1], brawn: 3 };
  [['ranged', BLASTER, 'Long'], ['melee', SWORD, 'Engaged']].forEach(function (w) {
    const spec = sb.computeWeaponPool(SHEET, w[1], w[2], derived, '#fff', EQ);
    check('A ' + row[0] + ', ' + w[0] + ' attack: force dice = 0',
          (spec.force || 0) === 0, 'force=' + spec.force);
  });
});

// ── B. the rest of the pool is UNCHANGED — the removal is surgical ────────────────────────────
// Without this, deleting far more than the force term would still pass §A.
const withFR = sb.computeWeaponPool(SHEET, BLASTER, 'Long', { forceRating: 3, brawn: 3 }, '#fff', EQ);
const noFR = sb.computeWeaponPool(SHEET, BLASTER, 'Long', { forceRating: 0, brawn: 3 }, '#fff', EQ);
check('B the pool is IDENTICAL whether or not the character is Force-sensitive',
      JSON.stringify(withFR) === JSON.stringify(noFR),
      'FR3=' + JSON.stringify(withFR) + ' FR0=' + JSON.stringify(noFR));
// The pool's fields are `characteristic` and `skillRank` — the ability/proficiency SPLIT happens
// downstream in the renderer. The first version of this assert read the rendered names and failed
// against a perfectly good pool, which would have gone on failing after the fix and taught me to
// relax it. Read what the function actually returns.
check('B the pool still has its characteristic and skill dice (nothing else was deleted)',
      (withFR.characteristic || 0) > 0 && (withFR.skillRank || 0) > 0,
      JSON.stringify({ characteristic: withFR.characteristic, skillRank: withFR.skillRank }));
check('B difficulty is still priced', withFR.difficulty != null);

// ── C. THE FORCE-POWER PATH IS UNBROKEN — the assert that stops §A being vacuous ───────────────
// Force powers do NOT go through computeWeaponPool; they build their own pool with the rating
// (`force: available`). This asserts that spine still exists and still reads the rating, so a
// change that silenced Force dice EVERYWHERE cannot pass this file.
// COMMENTS ARE STRIPPED FIRST, and that is the assert working rather than tidiness. Counted over
// raw source, this matched the sentence in the comment above it — the guard was counting itself,
// and the padding meant that DELETING ONE REAL SPINE would still leave a count of 2 and pass.
// A self-counting assert is the "green that is true about something else" shape, in miniature.
// D-507: the hub's spine moved with DiceHub's closure to lib/shared/diceHub.jsx — each file is counted on its own (the
// modal's in player/app.jsx, the hub's in the module), never as one blob, and the two counts are summed.
const codeOnly = (src) => src.split('\n')
  .filter(function (ln) { const t = ln.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
  .join('\n');
const sitesIn = (src) => (codeOnly(src).match(/force:\s*available/g) || []).length;
const appSites = sitesIn(APP), hubSites = sitesIn(HUB);
const forcePowerSites = appSites + hubSites;
check('C the Force-power roll spines still pass the available Force rating (found ' + forcePowerSites + ': player/app.jsx ' + appSites + ' · lib/shared/diceHub.jsx ' + hubSites + ')',
      forcePowerSites >= 2 && appSites >= 1 && hubSites >= 1, 'expected the modal (player/app.jsx) + hub (lib/shared/diceHub.jsx) spines, counted in CODE only');
// re-pointed by name (f100-surfacing-sheet-build): the builder is sheetPool.js's weaponPoolOf; computeWeaponPool its caller
check('C and computeWeaponPool no longer reads forceRating at all',
      !/forceRating/.test(sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)')) &&
      !/forceRating/.test(sliceDecl(POOL, 'function weaponPoolOf(sheet, weapon, opts)')));

console.log('\n  B-224 no force on weapon pools: ' + ok + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
