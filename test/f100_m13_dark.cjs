#!/usr/bin/env node
// F-100 M13 Lap B (f100-m13-build-card ADDENDUM 9 ACCEPTANCE; R-M13B-25): the page holds one of nothing, and the GM has no way in.
// Lap C (ADDENDUM 35 SCOPE 7) ended "dark". KEEPS: the GM has no route or mount; one mount; the gate waits on state and parts; the parts list; no switch or
// storage (D-449); one of everything; the band; `aim`. DROPS: no link to the route; the route's two lines as the only mention; the pack's constant; the door and ask hashes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
let fails = 0, passes = 0;
const check = (ok, label, detail) => { if (ok) { passes++; console.log('  ok   ' + label); } else { fails++; console.log('  FAIL ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); } };
const app = read('player/app.jsx'), gm = read('gm/app.jsx'), view = read('lib/modify/view.jsx');

console.log('the mount: the GM has none, the player has one');
check(!/\/modify\b/.test(gm) && !/SWRPGModifyView/.test(gm), 'the GM has no route to it and no mount');
const mounts = app.split('\n').filter((l) => /SWRPGModifyView\.Page/.test(l));
check(mounts.length === 1, 'one mount', mounts.length);
const gate = app.split('\n').find((l) => /screen === 'modify' && selectedChar/.test(l)) || '';
check(/modifyViewReady/.test(gate) && !/window\._canonicalCharbuildBase/.test(gate), 'R-M13B-75: the mount reads state that wakes it, not the window global', gate.trim());
// ADDENDUM 474 (ruling-moved): the page's one mount now sits in ModifyHost, a creator-chunk root. "one mount" KEEPS one Page call and R-M13B-75's gate;
// it ADDS: PlayerApp names the host once, behind the screen's parts, and the screen asks for that chunk. DROPS nothing.
check((app.match(/React\.createElement\(ModifyHost,/g) || []).length === 1, 'ADDENDUM 474: PlayerApp names ModifyHost at one gate site');
check(/playerScreenReady\('modify'\)/.test(gate), 'ADDENDUM 474: the gate waits for the screen\'s parts', gate.trim());
// R-M13R-43 (ruling-moved): KEEPS the screen asking for creator.js; ADDS the modify part, in order, and both <script> lines gone from player/index.html.
check(/modify: \['creator', 'modify'\]/.test(app), 'ADDENDUM 474, R-M13R-43: the screen asks for the creator chunk and the modify part');
check(/modify: \['\/lib\/shared\/charModify\.js', '\/lib\/modify\/view\.js'\]/.test(app), 'R-M13R-43: the part loads the engine, then the page');
const shell = read('player/index.html');
check(!/charModify\.js|lib\/modify\/view\.js/.test(shell), 'R-M13R-43: neither file is on first load');

console.log('the page: no switch');
check(!/SWRPG[A-Za-z]*\.(flag|enabled)|swrpg_modify_[a-z]*_on|localStorage/.test(view), 'no user-facing switch and no storage on the page (D-449)');

console.log('one of everything: the page holds no price, fold, merge or save logic');
['skillRankCost', 'costForNewSpec', 'applyStampSync', 'resolveForStamp', 'foldOwn', 'reproject', 'computeDerived', 'mergeRecord', 'upsertSavedCharacter', 'localStorage', 'sha256hex', 'talentsFromOwnedPositions'].forEach((w) => check(!view.includes(w), 'no ' + w));
check(!/\*\s*10\b|\*\s*5\b/.test(view), 'no rank multiplied here');
const uses = view.match(/buildPrice\('[a-z_]+'/g) || [];
check(uses.every((u) => /specialization|skill|force_basic/.test(u)), 'the next-step labels read the one core, for these parts only', uses);
check(!/color-mix|--doc-row-band/.test(read('lib/modify/modify.css')) && /hp-bands m13-bands/.test(view), 'no local copy of the band: the class is .hp-bands');
check(!/trial|version C|\(A\)|\(B\)/.test(view.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), '0 trial strings');
const css = read('lib/shared/paper.css'), tok = read('lib/shared/tokens.css'), gr = read('lib/shared/grounds/creator.css');
const EXPR = /--doc-row-band:\s+color-mix\(in srgb, var\(--doc-paper\) 50%, var\(--doc-paper-raised\)\)/;
check(EXPR.test(tok) && EXPR.test(gr), 'R-M13B-3: the token, both hunks, the same expression');
check(/:where\(\.hp-bands\) > :nth-child\(even\) \{ background: var\(--doc-row-band\); \}/.test(css), 'R-M13B-3: the class, once');

console.log('R-M13B-36: `aim` is one prop on the form');
const ed = read('lib/editor/view.jsx');
check(/aim \? null : h\('button'[^\n]*'data-editor-inbtn'/.test(ed) && /canDel && !aim \? h\(/.test(ed), 'In: and Delete are off under it');
check(/if \(aim\) \{ var ar = aim\.onSave\(rec, \{ intent: intent \}\); if \(ar && ar\.ok === false\) refusedSave\(ar\); return; \}/.test(ed), 'a form save lands in the page\'s draft; a refusal stays in the form');
check((ed.match(/U\.saveRecord\(/g) || []).length >= 1 && ed.indexOf('aim.onSave') < ed.indexOf("var opts = { create: true };"), 'and returns before the Homebrew write');
console.log(`f100_m13_dark: ${passes} pass, ${fails} fail`);
process.exit(fails ? 1 : 0);
