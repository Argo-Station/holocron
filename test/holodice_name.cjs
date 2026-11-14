#!/usr/bin/env node
/**
 * holodice_name.cjs — the dice app is called HoloDice where a player meets its name (R-PHD-10).
 *
 * WHY THIS EXISTS. The dice app was called HoloTable, and since DECISIONS D-12 that name belongs to the
 * separate paid VTT. Ruling `paper-holodice` renames the dice app to HoloDice (R-HT-9; capitals HOLODICE,
 * R-PHD-1) on the surfaces Jason approved as drawn (D-16, the frames at Docs/mockups/paper-holodice.html).
 * Before this guard, NO instrument read the dice app's name (census §3 K-9): smoke_ubc1 passed on
 * "GM HOLOCRON" alone and smoke_launchpad read the tile's accent, not its words. So a half-done rename
 * stayed green. Every leg below is independent, so a rename that misses one surface reddens that leg.
 *
 * WHAT IT PINS, each with HoloTable (any spelling) ABSENT from the same value:
 *   1. the switcher — SUITE_APPS' dice row in lib/shared/ui.jsx. It is ONE constant that the shared
 *      SuiteBar renders in all three apps, so the leg also pins that each app reaches it through the
 *      shared SuiteBar and that no app declares a second app list of its own;
 *   2. the dice app's header — the appName diceSurface hands the SuiteBar;
 *   3. the tab title — dice/index.html's <title>, "HoloDice — Star Wars RPG" (R-PHD-12);
 *   4. the launchpad tile — the eyebrow of index.html's /dice/ tile;
 *   5. the bottom bar's screen-reader name — BottomNav's label (rendered as "<label> sections");
 *   6. the link preview's title — og:title follows the tab title (S-4 (b), R-PHD-12). The preview's
 *      description stays as it was, and is pinned unchanged here so (b) cannot drift into (c).
 *
 * A SOURCE GUARD, not a browser one: these values are literals in the source, and the guard must run in
 * the node battery without a build or a server.
 *
 * Run: node test/holodice_name.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const OLD = /holo[-_ ]?table/i;

// ── 1. the switcher, all three apps ─────────────────────────────────────────────────────────────
const ui = read('lib/shared/ui.jsx');
const appsDecl = ui.match(/var SUITE_APPS = \[([\s\S]*?)\];/);
check('lib/shared/ui.jsx declares SUITE_APPS (the anchor is not stale)', !!appsDecl);
const diceRow = appsDecl ? (appsDecl[1].match(/\{[^}]*id:\s*'dice'[^}]*\}/) || [])[0] : undefined;
check("SUITE_APPS has a dice row (id: 'dice')", !!diceRow, appsDecl && appsDecl[1]);
const diceName = diceRow ? (diceRow.match(/name:\s*'([^']*)'/) || [])[1] : undefined;
check("the switcher's dice row reads HOLODICE", diceName === 'HOLODICE', diceName);
check("the switcher's dice row does not say HoloTable", diceRow !== undefined && !OLD.test(diceRow), diceRow);
check("the switcher's dice row keeps id 'dice' and href '/dice/' (R-PHD-5)",
  !!diceRow && /href:\s*'\/dice\/'/.test(diceRow), diceRow);

const HOSTS = ['player/app.jsx', 'gm/app.jsx', 'lib/dice/diceSurface.jsx'];
for (const rel of HOSTS) {
  const src = read(rel);
  check(rel + ' renders the shared SuiteBar (so it shows SUITE_APPS)', /SuiteBar/.test(src));
  check(rel + ' declares no app list of its own', !/SUITE_APPS\s*=/.test(src));
}

// ── 2. the dice app's header ────────────────────────────────────────────────────────────────────
const dice = read('lib/dice/diceSurface.jsx');
const sbCalls = dice.match(/h\(SB,\s*\{[^}]*\}/g) || [];
check('diceSurface renders the SuiteBar exactly once (the anchor is not stale)', sbCalls.length === 1, sbCalls.length);
const appName = sbCalls[0] ? (sbCalls[0].match(/appName:\s*'([^']*)'/) || [])[1] : undefined;
check("the dice header's appName reads HOLODICE", appName === 'HOLODICE', appName);
check('the dice header does not say HoloTable', sbCalls.length === 1 && !OLD.test(sbCalls[0]), sbCalls[0]);

// ── 3. the tab title ───────────────────────────────────────────────────────────────────────────
const shell = read('dice/index.html');
const titles = shell.match(/<title>([^<]*)<\/title>/g) || [];
check('dice/index.html has exactly one <title>', titles.length === 1, titles.length);
const title = titles[0] ? titles[0].replace(/<\/?title>/g, '') : undefined;
check('the tab title reads "HoloDice — Star Wars RPG"', title === 'HoloDice — Star Wars RPG', title);
check('the tab title does not say HoloTable', title !== undefined && !OLD.test(title), title);

// ── 4. the launchpad tile ──────────────────────────────────────────────────────────────────────
const pad = read('index.html');
// B-1253 (paper-n7-frontdoor-build): the tile is the paper landing's way plate now (`class="hp-plate ld-wayplate tile"`),
// so the anchor matches `tile` among its classes. KEPT: the tile, its eyebrow, the old name's absence. DROPPED: nothing.
const tile = (pad.match(/<a class="[^"]*\btile\b[^"]*" href="\/dice\/"[\s\S]*?<\/a>/) || [])[0];
check('index.html has a launchpad tile for /dice/', !!tile);
const eyebrow = tile ? (tile.match(/<span class="tile-eyebrow">([^<]*)<\/span>/) || [])[1] : undefined;
check("the /dice/ tile's eyebrow reads HoloDice", eyebrow === 'HoloDice', eyebrow);
check('the /dice/ tile does not say HoloTable', tile !== undefined && !OLD.test(tile), tile);

// ── 5. the bottom bar's screen-reader name ─────────────────────────────────────────────────────
const bnCalls = dice.match(/h\(BN,\s*\{[^}]*\}/g) || [];
check('diceSurface renders the BottomNav exactly once (the anchor is not stale)', bnCalls.length === 1, bnCalls.length);
const bnLabel = bnCalls[0] ? (bnCalls[0].match(/label:\s*'([^']*)'/) || [])[1] : undefined;
check("the dice bottom bar's label reads HoloDice (heard as \"HoloDice sections\")", bnLabel === 'HoloDice', bnLabel);

// ── 6. the link preview (S-4 (b)) ──────────────────────────────────────────────────────────────
const ogTitle = (shell.match(/<meta property="og:title" content="([^"]*)"/) || [])[1];
check('the link preview title reads "HoloDice — Star Wars RPG"', ogTitle === 'HoloDice — Star Wars RPG', ogTitle);
const ogDesc = (shell.match(/<meta property="og:description" content="([^"]*)"/) || [])[1];
check("the link preview's description is unchanged (S-4 is (b), not (c))",
  ogDesc === 'Roll once. See what changes. A free demo of FFG / Edge Studio narrative dice.', ogDesc);
const appleTitle = (shell.match(/<meta name="apple-mobile-web-app-title" content="([^"]*)"/) || [])[1];
check('the install name stays "Holocron" (no HoloDice manifest: (c) is not built)', appleTitle === 'Holocron', appleTitle);

console.log(failures ? '\nholodice_name: ' + failures + ' FAIL' : '\nholodice_name: all pass');
process.exit(failures ? 1 : 0);
