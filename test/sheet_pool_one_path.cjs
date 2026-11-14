/*
 * sheet_pool_one_path.cjs — ONE path for a character's dice, on both apps (ruling `shipyard-s4-ship-pool-path`
 * R-S4PP-1..4; `shipyard-s4-collection` R-S4CO-4, R-S4CO-7; PRAXIS §5: a second path for the same number is a defect).
 *
 * THE CENSUS ROW (R-S4PP-1): every moved name is DEFINED exactly once across lib/shared, player, gm and dice — in
 * the module it moved to — and the player app only BINDS it by the same name (R-S4PP-2).
 * THE HOSTS: the player loads the three modules in the order their free names need; the GM app loads none of them
 * at boot (K9 OFF costs nothing, R-S4PP-3) and injects them, with poolMods.js, when the Yard mounts under K9.
 * THE SEAT: `seatDice`'s raw character branch is gone — a character's seat pool is the host's `charPool`, and the
 * GM app passes the shared one; both apps pass the shared portrait lookup (R-S4CO-7).
 *
 * Static, over the sources. What it cannot see: a pool the browser actually draws — the both-hosts leg in
 * scripts/smoke_yard_s4_one_pool.py measures that.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); } };

const SHEET_POOL = ['loadCanonicalCharacterBuild', 'deriveItemState', 'sheetItemRegistries', 'resolveSheetEquipment',
  // re-aimed by ruling f100-m7-build R-M7G-3: SKILL_CHARS is DELETED (R-M7K-9; f100_m7_engine H1 pins that); the function
  // that replaced it keeps the one-path pin — defined once in sheetPool.js, bound by player/app.jsx
  'OGG_TO_SHEET_SKILL', 'sheetSkillCharacteristic', 'CHAR_KEY_TO_PROP', 'poolModSkillIndex', 'collectPoolMods', 'withPoolMods',
  'SHEET_KEY_TO_OGG', 'skillEntryRank', 'sheetSkillRank', 'sheetPoolOf', 'sheetPoolFor', 'yardCharPool'];
const HOME = {};
SHEET_POOL.forEach((n) => { HOME[n] = 'lib/shared/sheetPool.js'; });
HOME.qbFetchJson = 'lib/shared/fetchJson.js';
['SPECIES_PORTRAITS_REMOVED', 'SPECIES_PORTRAIT_DIR', 'SPECIES_PORTRAIT_INDEX', 'SPECIES_PORTRAIT_BY_ID',
  'speciesPortraitIndexReady', 'speciesPortraitStem', 'speciesImgPath', 'charPortrait'].forEach((n) => { HOME[n] = 'lib/shared/portraits.js'; });
// f100-talent-view-shared (ruling `f100-m5-contracts` ADDENDUM 3, A3-1): the stamp view's host wrapper, moved whole to ONE module
['sheetTalentView', 'useTalentViewEpoch', 'bumpTalentViewEpoch'].forEach((n) => { HOME[n] = 'lib/shared/talentView.js'; });

// the searched estate: lib/shared, player, gm, dice (R-S4PP-1's census row) — sources, never built bundles
function files() {
  const out = [];
  for (const dir of ['lib/shared', 'player', 'gm', 'dice']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      const p = dir + '/' + f;
      if (fs.statSync(path.join(ROOT, p)).isDirectory()) continue;
      if (/\.(jsx|html)$/.test(f)) out.push(p);
      else if (/\.js$/.test(f) && !fs.existsSync(path.join(ROOT, dir, f.replace(/\.js$/, '.jsx')))) out.push(p);   // a .js built from a .jsx is not a source
    }
  }
  return out;
}
const FILES = files();
const SRC = {}; FILES.forEach((p) => { SRC[p] = read(p); });
// a DEFINITION is a declaration whose value is not the shared module's own member (that is a binding)
function definitions(name) {
  const hits = [];
  const re = new RegExp('(?:^|[^.\\w$])(?:function\\s+' + name + '\\s*\\(|(?:var|let|const)\\s+' + name + '\\s*=\\s*([^;\\n]*))', 'gm');
  for (const p of FILES) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(SRC[p]))) {
      const rhs = (m[1] || '').trim();
      if (/^(?:window\.)?SWRPG(?:SheetPool|Portraits)\.\w+/.test(rhs)) continue;   // a same-name binding
      hits.push(p);
    }
  }
  return hits;
}
console.log('SHEET POOL — ONE PATH');
for (const n of Object.keys(HOME)) {
  const d = definitions(n);
  check(d.length === 1 && d[0] === HOME[n], `${n} is defined once, in ${HOME[n]}`, `defined in: ${d.join(', ') || 'nowhere'}`);
}

// the player's same-name bindings (R-S4PP-2): one block, every moved name, each bound to its own member
const app = SRC['player/app.jsx'];
const B = app.indexOf('── BEGIN SHEETPOOL BINDINGS'), E = app.indexOf('── END SHEETPOOL BINDINGS');
const block = B >= 0 && E > B ? app.slice(B, E) : '';
check(!!block, 'player/app.jsx carries one SHEETPOOL BINDINGS block');
for (const n of SHEET_POOL) {
  check(new RegExp('(?:var|const)\\s+' + n + '\\s*=\\s*window\\.SWRPGSheetPool\\.' + n + '\\s*;').test(block), `player/app.jsx binds ${n} to SWRPGSheetPool.${n}`);
}
// …and the block precedes every other top-level statement that could read a binding at load time
const firstCode = app.split('\n').findIndex((l) => /^(?:const|var|let|function)\s/.test(l));
const blockLine = app.slice(0, B).split('\n').length - 1;
check(B >= 0 && blockLine <= firstCode + 1, 'the bindings open player/app.jsx, before any top-level code runs', `block at line ${blockLine + 1}, first top-level declaration at ${firstCode + 1}`);

// the player shell's load order
const ph = SRC['player/index.html'];
const tagAt = (html, file) => { const m = new RegExp('<script([^>]*)src="/?lib/shared/' + file + '"').exec(html); return m ? { at: m.index, defer: /\bdefer\b/.test(m[1]) } : null; };
const inlineAt = ph.search(/<script>\s*$/m);
const fj = tagAt(ph, 'fetchJson.js'), pt = tagAt(ph, 'portraits.js'), sp = tagAt(ph, 'sheetPool.js');
const appAt = ph.indexOf('src="/player/app.js"');
check(!!fj && !fj.defer && fj.at < inlineAt, 'player: fetchJson.js loads NOT deferred, before the inline script that calls qbFetchJson while the page parses (R-S4PP-7)');
check(!!pt && pt.defer && pt.at < appAt, 'player: portraits.js is a deferred script before /player/app.js (it needs only qbFetchJson, which runs first)');
check(!!sp && sp.defer && sp.at < appAt, 'player: sheetPool.js is a deferred script before /player/app.js');
// A3-2: the stamp view's wrapper loads at BOOT on both hosts — after the user store and every script its ready() reads when
// called (the epoch's subscription is wired at load), before app.js, which registers it
const tvP = tagAt(ph, 'talentView.js'), udP = tagAt(ph, 'userData.js'), vgP = tagAt(ph, 'versionGuard.js');
check(!!tvP && tvP.defer && tvP.at < appAt && !!udP && tvP.at > udP.at && !!vgP && tvP.at > vgP.at, 'player: talentView.js is a deferred script after userData.js and versionGuard.js, before /player/app.js (A3-2)');
// R-S4PP-7 / R-BDC-1: the player boot's undeferred scripts are exactly the three named exceptions
const undeferred = [...ph.matchAll(/<script(?![^>]*\bdefer\b)[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^.*\//, '')).sort();
check(JSON.stringify(undeferred) === JSON.stringify(['bands.js', 'fetchJson.js', 'layout.js']), "player: the boot's undeferred scripts are exactly bands.js, fetchJson.js and layout.js (R-BDC-1's three named exceptions)", undeferred.join(', '));

// the GM shell: nothing at boot (K9 OFF costs nothing) — the lazy loader brings the four
const gh = SRC['gm/index.html'];
for (const f of ['fetchJson.js', 'portraits.js', 'poolMods.js', 'sheetPool.js']) check(!tagAt(gh, f), `gm/index.html does not load ${f} at boot`);
const tvG = tagAt(gh, 'talentView.js'), udG = tagAt(gh, 'userData.js'), vgG = tagAt(gh, 'versionGuard.js'), gmAppAt = gh.indexOf('src="/gm/app.js"');
check(!!tvG && gmAppAt > 0 && tvG.at < gmAppAt && !!udG && tvG.at > udG.at && !!vgG && tvG.at > vgG.at, 'gm: talentView.js loads at BOOT, not with the lazy core — after userData.js and versionGuard.js, before /gm/app.js (A3-2)');
const gm = SRC['gm/app.jsx'];
const lazy = /function ensureYardCharCore\(\)[\s\S]*?\n}\n/.exec(gm);
const order = lazy ? ['fetchJson.js', 'portraits.js', 'poolMods.js', 'sheetPool.js'].map((f) => lazy[0].indexOf('lib/shared/' + f)) : [];
check(!!lazy && order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), 'gm/app.jsx ensureYardCharCore() injects fetchJson → portraits → poolMods → sheetPool, in that order');
check(!!lazy && /SWRPGSheetPool\.loadCanonicalCharacterBuild\(\)/.test(lazy[0]) && /SWRPGItemRegistries\.load\(\)/.test(lazy[0]), 'ensureYardCharCore() loads the charbuild view and the item registries (R-S4PP-3)');

// the seat: one path
const vv = SRC['lib/shared/vesselView.jsx'];
const sd = /function seatDice\([\s\S]*?\n  }\n/.exec(vv);
check(!!sd, 'vesselView.jsx carries seatDice');
check(!!sd && !/sheetData/.test(sd[0]), "seatDice's raw character branch is gone (it reads no sheetData)");
check(!!sd && /ctx\.charPool\(/.test(sd[0]), "seatDice's character branch asks the host's charPool");
check(/charPool:\s*[^,\n]*SWRPGSheetPool\.charPool\b/.test(gm), 'the GM Yard passes the shared charPool');
check(/portraitFor:\s*[^,\n]*SWRPGPortraits[^,\n]*charPortrait/.test(gm), 'the GM Yard passes the shared portrait lookup');
check(/portraitFor:\s*[^,\n]*SWRPGPortraits[^,\n]*charPortrait/.test(app), 'the player Yard passes the shared portrait lookup');

// ── THE OWN-PACK ROW (HANDOFF `f100-talent-view-shared`; ruling `f100-m5-contracts` ADDENDUM 3, A3-2/A3-4) ──
// A PC's seat pool on a sheet stamped with this device's OWN pack is the SAME on both hosts: each host's page modelled in a
// node vm — the shared modules it loads, the base its loader writes, then its registration READ OUT OF ITS OWN SOURCE —
// and `SWRPGSheetPool.charPool` asked for Discipline. The house rule (My Data: Combat Veteran's Boost ×1 → ×2) is OFF for
// discovery on this device (case 7), so the control — no registration — draws the book's pool, and agreement between the
// hosts cannot come from both falling back.
(async function ownPack() {
  console.log('THE OWN-PACK ROW');
  const vm = require('vm');
  const CharResolve = require(path.join(ROOT, 'lib/shared/charResolve.js'));
  const U = require(path.join(ROOT, 'lib/shared/userData.js')), PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
  const M = require(path.join(ROOT, 'lib/shared/mods.js')), PoolMods = require(path.join(ROOT, 'lib/shared/poolMods.js'));
  const Dice = require(path.join(ROOT, 'lib/shared/diceEngine.js'));
  const canon = (f) => JSON.parse(read('public/data/canonical/' + f));
  const BOOK = {}; PV.APPLIED_SECTIONS.forEach((sec) => { BOOK[sec] = canon(sec + '.json')[sec]; });
  const SK = canon('skills.vocab.json').entries;
  const H = U.createStore({ adapter: U.memoryAdapter(), schemas: PV.readSchemaDir(path.join(ROOT, 'schema')), base: BOOK,
    vocab: { skills: SK.map((e) => e.id), qualities: canon('qualities.vocab.json').entries.map((e) => e.id) } });
  await H.ready();
  const cv = JSON.parse(JSON.stringify(BOOK.talents.combat_veteran)); cv.pool_mods[0].count = 2;
  const w = await H.saveRecord('my_data', 'talents', cv);
  const stamps = H.activeStamps();
  const sheet = { name: 'Kel Arvo', speciesId: 'human', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    woundBase: 10, strainBase: 10, specializations: [], forcePowers: [], skills: {}, talents: [{ id: 'combat_veteran', rank: 1 }], mods: stamps.slice() };
  await H.setActive('my_data', false);
  M.useUserPacks(H);
  const REG_LINE = /^window\.SWRPGTalentView\.register\(\);$/;
  async function seat(stmts) {
    CharResolve.setTalentViewResolver(null);
    const box = { console, Promise, setTimeout, CharResolve, SWRPGPoolMods: PoolMods, SWRPGDice: Dice, SWRPGMods: M, SWRPGUserData: H,
      _canonicalRegistries: { skills: SK }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
      qbFetchJson: (url) => Promise.resolve(JSON.parse(read(url))), speciesPortraitIndexReady: Promise.resolve(null) };
    box.window = box;
    const ctx = vm.createContext(box);
    for (const f of ['lib/shared/talentView.js', 'lib/shared/sheetPool.js']) vm.runInContext(read(f), ctx, { filename: f });
    await box.SWRPGSheetPool.loadCanonicalCharacterBuild();
    stmts.forEach((st) => vm.runInContext(st, ctx));
    const pool = box.SWRPGSheetPool.charPool({ id: 'kel', name: 'Kel Arvo', sheetData: sheet }, 'discipline', 0);
    CharResolve.setTalentViewResolver(null);
    return pool;
  }
  const host = (p) => read(p).split('\n').filter((l) => REG_LINE.test(l));
  const none = await seat([]), gmP = await seat(host('gm/app.jsx')), plP = await seat(host('player/app.jsx'));
  check(!!(w && w.ok !== false) && stamps.length === 1 && H.activeStamps().length === 0 && !!none && none.boost === 1,
    'control: My Data (Combat Veteran Boost ×2) stamps the sheet but is OFF for discovery; with no host registered the seat draws the book\'s Boost ×1',
    JSON.stringify({ stamps, none }));
  check(!!gmP && !!plP && JSON.stringify(gmP) === JSON.stringify(plP) && gmP.boost === 2,
    `own pack (a sheet with a user: stamp): the PC's Discipline seat pool is the SAME on the player and the GM, and the house rule's — player ${JSON.stringify(plP)} · GM ${JSON.stringify(gmP)}`);
})().catch((e) => check(false, 'the own-pack row ran to the end', String(e && e.stack || e).slice(0, 300))).then(() => {
  console.log(`\nsheet_pool_one_path: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
});
