#!/usr/bin/env node
/*
 * b1296_shell_cores.cjs — B-1296 (ruling `f100-surfacing-hub-concept` R-SHC-12; ADDENDUM 7 ratifies the set): the GM shell
 * loads the same DICE-POOL core set as the player shell, so the same character pools the same way in both hosts (the
 * no-compromise mirror). The set is the shared cores a check's pool is built from; the player loads each with a static tag,
 * the GM with a static tag OR through `ensureYardCharCore`'s lazy list (gm/app.jsx), which the Yard's seats and the NPC
 * bench wait on before they draw a pool.
 *
 * Origin: `gm/index.html` did not load `lib/shared/qualityRows.js`, so with `swrpg_engine_rules` ON no quality spend,
 * target or mode row had a reader in the GM app while the player shell answered them (census T2 (1), F4).
 *
 * THE BITE is in the guard: case 3 removes the qualityRows tag from an in-memory copy of gm/index.html and the same check
 * must report it missing — so a check that reads nothing cannot pass.
 *
 *   node test/b1296_shell_cores.cjs   → exit 0 green, exit 1 on any failed case
 */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SET = ['lib/items.js',
  'lib/shared/effectClass.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
  'lib/shared/poolMods.js', 'lib/shared/qualityRows.js', 'lib/shared/itemRegistries.js', 'lib/shared/sheetPool.js'];

let fails = 0, cases = 0;
function check(name, ok, detail) {
  cases++;
  if (!ok) fails++;
  console.log((ok ? '✓ ' : '✗ ') + name + (detail ? ' — ' + detail : ''));
}
const norm = (s) => s.replace(/^\.?\//, '').split('?')[0];
// every <script src> of a shell, comments stripped first (a commented-out tag is not a load)
function scriptTags(html) {
  const out = [], re = /<script\b[^>]*\bsrc="([^"]+)"/g;
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  let m;
  while ((m = re.exec(body))) out.push(norm(m[1]));
  return out;
}
// ensureYardCharCore's lazy list: the array literal it reduces over
function lazyCore(appSrc) {
  const i = appSrc.indexOf('function ensureYardCharCore()');
  if (i < 0) return null;
  const m = /_yardCharCore\s*=\s*\[([^\]]*)\]/.exec(appSrc.slice(i, i + 2000));
  return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => norm(s.slice(1, -1))) : null;
}
const missing = (have) => SET.filter((f) => have.indexOf(f) === -1);

const player = scriptTags(read('player/index.html'));
const gmHtml = read('gm/index.html');
const lazy = lazyCore(read('gm/app.jsx'));

check('1 the player shell loads every dice-pool core by a static tag', missing(player).length === 0, 'missing: ' + JSON.stringify(missing(player)));
check('2a ensureYardCharCore\'s lazy list is found and non-empty', Array.isArray(lazy) && lazy.length > 0, JSON.stringify(lazy));
const gm = scriptTags(gmHtml).concat(lazy || []);
check('2 the GM shell loads every dice-pool core (static ∪ ensureYardCharCore)', missing(gm).length === 0, 'missing: ' + JSON.stringify(missing(gm)));
// 3 THE BITE: the qualityRows tag removed from a copy → the same check must name it
const bitten = gmHtml.replace(/<script\b[^>]*src="[^"]*lib\/shared\/qualityRows\.js"[^>]*><\/script>/g, '');
const gmB = scriptTags(bitten).concat(lazy || []);
check('3 BITE: with the qualityRows tag removed the check names it missing', bitten !== gmHtml && missing(gmB).indexOf('lib/shared/qualityRows.js') !== -1,
  'missing in the mutant: ' + JSON.stringify(missing(gmB)));

// ── 4–6 THE DICE WINDOW (ENCOUNTERS, D-507; ruling `encounters-e3-screens` ADDENDUM 15 CONTRACT 6): lib/shared/diceHub.js, the window
// both apps can open, in its order on BOTH shells. GM: a static tag after /vendor.js (React, SWRPGUI) and talentView.js. Player: the
// FIRST file of the 'sheet' part (player/app.jsx PLAYER_PARTS), before player/sheet.js, whose readers name it — and never a page tag
// (first paint stays unchanged; build/playerSplit.mjs refuses a lazy file the page loads). The pool cores are NOT added to the GM
// boot: the GM's lazy core list (2) already carries them, and the window's sheet paths bind them when they land.
const HUB = 'lib/shared/diceHub.js';
const gmOrder = (tags) => { const v = tags.indexOf('vendor.js'), t = tags.indexOf('lib/shared/talentView.js'), d = tags.indexOf(HUB); return d > v && v >= 0 && d > t && t >= 0; };
check('4 the GM shell loads the dice window by a static tag, after /vendor.js and talentView.js', gmOrder(scriptTags(gmHtml)),
  JSON.stringify(scriptTags(gmHtml).filter((s) => /vendor|talentView|diceHub/.test(s))));
function playerSheetPart(appSrc) {
  const m = /^var PLAYER_PARTS = \{[\s\S]*?^\s*sheet:\s*\[([^\]]*)\]/m.exec(appSrc);
  return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => norm(s.slice(1, -1))) : null;
}
const part = playerSheetPart(read('player/app.jsx'));
check('5 the player loads it as the sheet part\'s first file, before player/sheet.js, and never by a page tag',
  Array.isArray(part) && part.indexOf(HUB) === 0 && part.indexOf('player/sheet.js') === 1 && player.indexOf(HUB) === -1, JSON.stringify(part));
// 6 THE BITE: the GM tag moved above /vendor.js in a copy → check 4's test must refuse it
const gmMoved = gmHtml.replace(/\s*<script\b[^>]*src="\/lib\/shared\/diceHub\.js"[^>]*><\/script>/, '').replace('<script src="/vendor.js"></script>', '<script src="/lib/shared/diceHub.js"></script><script src="/vendor.js"></script>');
check('6 BITE: with the dice window\'s tag moved above /vendor.js the order check refuses it', gmMoved !== gmHtml && !gmOrder(scriptTags(gmMoved)));

console.log((fails ? 'FAILED' : 'OK') + ' — ' + (cases - fails) + '/' + cases);
process.exit(fails ? 1 : 0);
