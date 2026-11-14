#!/usr/bin/env node
/**
 * ship_identifier_placement.cjs — STANDING guard: where the ship identifier draws which form (card
 * `shipyard-schematic-build-card` R-SSB-3, R-SSB-11; DECISIONS D-202, D-211, D-212).
 *   1. THE TABLE: lib/shared/shipSchematic.js HOSTS maps each of D-212's lines (the card's §2 rows) to its form at its
 *      sizes — SMALL, FULL, or FULL from a slot width — and the key line only on the entry's Plate 1 and Plate 2.
 *   2. THE CALL SITES: every identifier call site in the product source names a host (`host:` / `host=`), every named
 *      host is in the table, and every table host is named somewhere. No scattered form `if`s: no call site passes a form.
 *   3. THE FOLD: every one of the vehicle library's records folds its `type` to a class; a missing type is REPORTED by
 *      name here (it draws the family glyph with no class mark, never a guess — R-SSG-1).
 * Run: node test/ship_identifier_placement.cjs
 */
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../lib/shared/shipSchematic.js');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(label, cond, detail) { if (cond) console.log('  PASS  ' + label); else { failures += 1; console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); } }

// 1 — the table, line by line against D-212 (card §2): [host, §2 row, form at its slot sizes [width, expected form]…, key]
const D212 = [
  ['hangar-hero', 1, [[null, 'full']], false],
  ['hangar-row', 2, [[132, 'small'], [260, 'full']], false],
  ['hangar-orphan', 3, [[132, 'small'], [260, 'full']], false],
  ['unit-flagship', 4, [[null, 'full']], false],
  ['unit-fleet', 5, [[64, 'small'], [92, 'small']], false],
  ['ship-head', 6, [[112, 'small'], [120, 'small'], [200, 'full']], false],
  ['sheet-vessel', 7, [[96, 'small']], false],
  ['cat-grid', 8, [[null, 'full']], false],
  ['cat-list', 9, [[58, 'small'], [48, 'small']], false],
  ['cat-compare', 10, [[null, 'small']], false],
  ['cat-shelf', 11, [[null, 'full']], false],
  ['entry-plate1', 12, [[null, 'full']], true],
  ['entry-family', 13, [[null, 'full']], false],
  ['plan-head', 14, [[200, 'full'], [112, 'full']], false],   // FULL at both sizes (R-SSB-3, disclosed to Jason)
  ['fit-ring', 15, [[null, 'full']], false],
  ['fit-phone-ring', 15, [[null, 'full']], false],
  ['entry-plate2', 16, [[null, 'full']], true],
  ['npc-craft', 17, [[96, 'small']], false],                   // SMALL, as #7 at the same size (R-SSB-3, disclosed)
  ['fit-list-head', 15, [[null, 'full']], false],              // R-SSB-11
];
D212.forEach(([host, n, sizes, key]) => {
  const H = S.HOSTS[host];
  check('§2 #' + n + ' ' + host + ' is in the table', !!H);
  if (!H) return;
  check('§2 #' + n + ' ' + host + ' carries its row number', H.n === n, 'reads ' + H.n);
  sizes.forEach(([w, form]) => check('§2 #' + n + ' ' + host + (w != null ? ' at ' + w + ' px' : '') + ' → ' + form.toUpperCase(), S.formFor(host, w) === form, 'reads ' + S.formFor(host, w)));
  check('§2 #' + n + ' ' + host + (key ? ' draws' : ' never draws') + ' the key line', S.keyFor(host) === key);
});
check('the table holds D-212\'s hosts and no other', Object.keys(S.HOSTS).sort().join(',') === D212.map((r) => r[0]).sort().join(','),
  'table: ' + Object.keys(S.HOSTS).sort().join(','));
check('#18 the GM Matrix\'s dark registry tiles are RETIRED: no host row', !Object.keys(S.HOSTS).some((k) => /matrix|browse|index/.test(k)));
let threw = false; try { S.formFor('no-such-host'); } catch (e) { threw = true; }
check('an unknown host is refused, never given a form', threw);

// 2 — the call sites
const SRC = ['lib/shared/vesselView.jsx', 'player/app.jsx', 'gm/app.jsx', 'lib/library/npc/view.jsx', 'lib/shared/yardView.jsx', 'lib/store/view.jsx'];
const named = {};
// the props object of an `el(X, {…})` call, braces balanced (props hold nested objects and functions)
function propsAt(s, i) { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '{') d += 1; else if (s[j] === '}' && --d === 0) return s.slice(i + 1, j); } return ''; }
SRC.forEach((f) => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // every Art / CatPlate / Ident / Schematic element and every CatGrid (a CatPlate's host travels through CatGrid → CatCell)
  const re = /el\((Art|CatPlate|Ident|S\.Schematic|CatGrid), \{|<(P2?\.Art)\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(s))) {
    const what = m[1] || m[2], props = m[1] ? propsAt(s, m.index + m[0].length - 1) : m[3], line = s.slice(0, m.index).split('\n').length;
    const lit = /\bhost[:=]\s*['"]([a-z0-9-]+)['"]/.exec(props), passed = /\bhost:\s*props\.host\b/.test(props);
    check(f + ':' + line + ' ' + what + ' names its host', !!(lit || passed), props.slice(0, 120));
    if (lit) { named[lit[1]] = (named[lit[1]] || 0) + 1; check(f + ':' + line + ' host "' + lit[1] + '" is in the table', !!S.HOSTS[lit[1]]); }
    check(f + ':' + line + ' ' + what + ' passes no form of its own', !/\bform:/.test(props));
  }
});
Object.keys(S.HOSTS).forEach((k) => check('table host "' + k + '" is named at a call site', !!named[k]));

// 3 — the fold over the library
const dir = path.join(ROOT, 'public', 'data', 'vehicle-library'), recs = [];
fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !/^(index|taxonomy)\.json$/.test(f))
  .forEach((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).entries || []).forEach((e) => recs.push(e)));
const missing = recs.filter((r) => !S.markFor(r.type));
console.log('  FOLD  ' + (recs.length - missing.length) + ' of ' + recs.length + ' records fold their type to a class' +
  (missing.length ? '; MISSING: ' + missing.map((r) => r.key + ' "' + r.type + '"').join(', ') : ''));
check('every record\'s type folds to a class (a missing one is reported above, by name)', missing.length === 0);
check('every record\'s family has a glyph', recs.every((r) => !!S.SHAPES[S.famOf(r)]));

console.log(failures ? failures + ' failure(s)' : 'ship_identifier_placement: all green');
process.exit(failures ? 1 : 0);
