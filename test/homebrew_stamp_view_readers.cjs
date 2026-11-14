#!/usr/bin/env node
/**
 * homebrew_stamp_view_readers.cjs — STANDING guard for the stamp-view readers HOMEBREW H1 relies on (ruling
 * `f100-h1-word` R-FHW-1; card `homebrew-h1-build-card` §5 ACCEPTANCE; ruling `homebrew-h1-build-pool-premise` R-H1BP-1).
 *
 * THE CASE an attach creates: a character STAMPED with a collection that is switched OFF on this device (R-H1K-3 lets a
 * player add any collection this device holds, active or not). The device's DISCOVERY view (`_canonicalCharbuild`,
 * active packs only) does not carry it; the character's STAMP view (`CharResolve.talentViewFor`, the registered
 * `SWRPGTalentView.sheetTalentView`) does.
 *
 *   1. Force powers — `player/app.jsx` `sheetForcePowersForDisplay`, SLICED from the app's own source by name and run in
 *      the host's context: the collection's new power resolves to its name (it read the discovery view only before
 *      R-FHW-1's edit: "(unknown power)" — THE RED).
 *   2. Pool dice — `lib/shared/sheetPool.js` `collectPoolMods`: the collection's Combat Veteran dice (a removed Setback)
 *      are the character's. PRESENT before and after — R-H1BP-1: the reader already read the stamp view first, so its
 *      grant went unused (test/sheet_pool_talent_view.cjs, 21/21 on the pre-change tree).
 *   3. C4.4: a stamp NOT on this device → the stamp view is null and both readers answer from discovery, as before.
 *
 * THE BITE: on the pre-change `player/app.jsx` row 1 is red (the power reads "(unknown power)") and the file exits 1.
 * Run: node test/homebrew_stamp_view_readers.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CharResolve = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const PoolMods = require(path.join(ROOT, 'lib/shared/poolMods.js'));
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));

let failures = 0, rows = 0;
function check(ok, msg, detail) {
  rows += 1;
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const BOOK = {}; PV.APPLIED_SECTIONS.forEach((sec) => { BOOK[sec] = canon(sec + '.json')[sec]; });
const VOCAB = { skills: canon('skills.vocab.json').entries.map((e) => e.id), qualities: canon('qualities.vocab.json').entries.map((e) => e.id) };

// the app's own function, sliced by name: from its declaration to the first line that closes it at column 0
function slice(file, name) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const at = lines.findIndex((l) => l.indexOf('function ' + name + '(') === 0);
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && l === '}');
  return lines.slice(at, end + 1).join('\n');
}

(async function main() {
  console.log('homebrew_stamp_view_readers — R-FHW-1 / R-H1BP-1 (an attached collection switched off on this device)');
  const H = U.createStore({ adapter: U.memoryAdapter(), schemas: PV.readSchemaDir(path.join(ROOT, 'schema')), vocab: VOCAB, base: BOOK });
  await H.ready();
  const made = await H.createPack({ packId: 'drive_kit', name: 'Drive Kit' });
  const fp = clone(BOOK.force_powers.sense); fp.name = 'Kit Sense'; delete fp.id;
  Object.values(fp.abilities || {}).forEach((a) => ['pool_mods', 'roll_numbers', 'effects', 'told'].forEach((k) => { delete a[k]; }));   // F-100 M10 (f100-m10-build-card R-M10B-3): a canonical power's upgrade rows name ITS id (V1's key, V4's value), which the validator refuses on a power with another id — the own power copies the tree and text, never the rows
  const wp = await H.saveRecord('drive_kit', 'force_powers', fp, { from: 'sense', create: true, mint: true });
  const cv = clone(BOOK.talents.combat_veteran); cv.pool_mods = [Object.assign(clone(cv.pool_mods[0]), { die: 'setback', direction: 'remove' })];
  const wt = await H.saveRecord('drive_kit', 'talents', cv);
  check(!!(made && made.ok && wp && wp.ok && wt && wt.ok), 'fixture: Drive Kit (own) holds a new Force power (from Sense) and a changed Combat Veteran', [made, wp && wp.reasons, wt && wt.reasons]);
  const stamp = H.list().filter((r) => r.packId === 'drive_kit')[0].stamp;
  await H.setActive(H.list().filter((r) => r.packId === 'drive_kit')[0].ck, false);
  M.useUserPacks(H);
  check(H.activeStamps().indexOf(stamp) < 0 && H.missingFor([stamp]).length === 0, 'fixture: Drive Kit is OFF on this device, yet resolvable for its stamp (missingFor [])', { active: H.activeStamps(), stamp });

  const sheet = { name: 'Maro Jinx', speciesId: 'human', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 3, willpower: 2, presence: 3 },
    woundBase: 10, strainBase: 10, forceRatingBase: 1, specializations: [], talents: [{ id: 'combat_veteran', rank: 1 }],
    forcePowers: [{ id: wp.id, basic: true, upgrades: [] }], mods: [stamp] };
  Object.assign(sheet, CharResolve.talentValuesAtRender(sheet, { talents: BOOK.talents }));
  const away = Object.assign(clone(sheet), { mods: ['user:a_pack_not_on_this_device#0a1b2c3d4e5f'] });

  // the player's page in node: its two shared modules, the base its loader writes, its own registration statement
  CharResolve.setTalentViewResolver(null);
  const box = { console, Promise, setTimeout, CharResolve, SWRPGPoolMods: PoolMods, SWRPGMods: M, SWRPGUserData: H,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    qbFetchJson: (url) => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, url), 'utf8'))), speciesPortraitIndexReady: Promise.resolve(null),
    cleanMarkup: (s) => s };
  box.window = box;
  const ctx = vm.createContext(box);
  for (const f of ['lib/shared/talentView.js', 'lib/shared/sheetPool.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  await box.SWRPGSheetPool.loadCanonicalCharacterBuild();
  vm.runInContext('window.SWRPGTalentView.register();', ctx);
  const src = slice('player/app.jsx', 'sheetForcePowersForDisplay');
  check(!!src, 'player/app.jsx carries sheetForcePowersForDisplay (sliced by name)');
  vm.runInContext(src + '\nwindow.__sfp = sheetForcePowersForDisplay;', ctx, { filename: 'player/app.jsx — sheetForcePowersForDisplay' });

  check(!(box._canonicalCharbuild.forcePowers || {})[wp.id], 'control: the DISCOVERY view does not carry Drive Kit’s power (the pack is off)');
  const powers = box.__sfp(sheet);
  check(powers.length === 1 && powers[0].name === 'Kit Sense' && !powers[0]._unresolved,
    '1. Force powers: the character’s power reads its name from the STAMP view — "Kit Sense", not "(unknown power)"', powers.map((p) => p.name));
  const dice = box.SWRPGSheetPool.collectPoolMods({ weapons: [], armor: null, gear: [], _owner: sheet })
    .filter((m) => m.source === 'Combat Veteran').map((m) => m.direction + ' ' + m.die);
  check(JSON.stringify(dice) === '["remove setback"]', '2. Pool dice: Combat Veteran’s die is the STAMP view’s (remove setback) — present before and after (R-H1BP-1)', dice);

  const pAway = box.__sfp(away);
  const dAway = box.SWRPGSheetPool.collectPoolMods({ weapons: [], armor: null, gear: [], _owner: away }).filter((m) => m.source === 'Combat Veteran').map((m) => m.direction + ' ' + m.die);
  check(CharResolve.talentViewFor(away) === null && pAway[0] && pAway[0]._unresolved && JSON.stringify(dAway) === '["add boost"]',
    '3. C4.4: a stamp not on this device → no stamp view; both readers answer from discovery, as before', { power: pAway[0] && pAway[0].name, dice: dAway });
  CharResolve.setTalentViewResolver(null);

  console.log('\n' + (rows - failures) + '/' + rows + (failures ? ' — FAILED' : ' ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('  FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
