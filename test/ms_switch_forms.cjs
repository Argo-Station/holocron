#!/usr/bin/env node
/**
 * ms_switch_forms.cjs — the editor URL's two forms (F-100 MS build; card f100-ms-build R-MSB-6 (h) "both URL forms,
 * with an old link landing on home"; contract f100-sync-instance-index R-SII-10, a URL contract on paper first).
 *
 *   /…/homebrew/<shelf>/in/<packId>/<id>              an imported row, or an own packId this device holds ONCE
 *   /…/homebrew/<shelf>/in/<packId>~<instance>/<id>   an own packId held MORE than once (`~` is not in PACK_ID_RE)
 *   an old link /in/<packId>/<id>                      → home (my_data), else the first own row of that packId in
 *                                                        order; the canonical path is returned so the host replaces it
 *
 *   U1  parse reads both forms; pathFor writes both; a round trip is exact
 *   U2  resolveIn(route, rows) → { ck, route }: the ck a route names, and the route it SHOULD be (the host replaces)
 *   U3  inFor(row, rows) → the route fields a link to that row carries (instance only when its packId repeats)
 *   U4  the host: lib/editor/view.jsx resolves a pack route through resolveIn and builds its links through inFor
 *
 * Exit 0 all pass · 1 any fail or a zero harvest.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let rows = 0, fails = 0;
function check(label, cond, detail) {
  rows += 1;
  if (cond) console.log('  ✓ ' + label);
  else { fails += 1; console.log('  ✗ ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 300))); }
}
const SRC = fs.readFileSync(path.join(ROOT, 'lib/editor/switch.js'), 'utf8');
const g = { location: { search: '' }, localStorage: { getItem: () => null, setItem: () => {} } };
const E = new Function('window', 'globalThis', 'module', SRC + '\nreturn window.SWRPGEditor;')(g, g, undefined);

const A = '0123456789ab', B = 'ba9876543210', H = 'aaaaaaaaaaaa';
const ROWS = [
  { ck: 'own:' + A, packId: 'my_data', origin: 'own', home: true },
  { ck: 'own:' + B, packId: 'my_data', origin: 'own', home: false },
  { ck: 'own:' + H, packId: 'house_rules', origin: 'own', home: false },
  { ck: 'imp:friend', packId: 'friend', origin: 'imported', home: false },
];

try {
  // ── U1 ──
  const two = E.parse('/player/homebrew/weapons/in/my_data~' + B + '/custom_my_data_x');
  check('U1 the ~ form parses packId and instance', !!two && two.packId === 'my_data' && two.instance === B && two.id === 'custom_my_data_x', two);
  check('U1 … and is its own canonical path', !!two && two.canonical === '/player/homebrew/weapons/in/my_data~' + B + '/custom_my_data_x', two && two.canonical);
  const old = E.parse('/gm/homebrew/gear/in/my_data/custom_my_data_y');
  check('U1 the old form parses with no instance', !!old && old.packId === 'my_data' && !old.instance && old.id === 'custom_my_data_y', old);
  check('U1 pathFor writes the ~ form when the route names an instance',
    E.pathFor({ host: 'gm', view: 'record', shelf: 'armor', packId: 'house_rules', instance: H, id: 'q' }) === '/gm/homebrew/armor/in/house_rules~' + H + '/q');
  const bad = E.parse('/player/homebrew/weapons/in/my_data~nothex/custom_z');
  check('U1 a ~ tail that is not an instance is dropped (packId only)', !!bad && bad.packId === 'my_data' && !bad.instance, bad);

  // ── U2 ──
  check('U2 resolveIn exists', typeof E.resolveIn === 'function');
  const r1 = E.resolveIn(old, ROWS);
  check('U2 an OLD my_data link lands on HOME', !!r1 && r1.ck === 'own:' + A, r1);
  check('U2 … and its canonical route names home\'s instance (my_data is held twice)', !!r1 && r1.route.instance === A
    && E.pathFor(r1.route) === '/gm/homebrew/gear/in/my_data~' + A + '/custom_my_data_y', r1 && E.pathFor(r1.route));
  const r2 = E.resolveIn(two, ROWS);
  check('U2 the ~ form names that instance\'s row (not home)', !!r2 && r2.ck === 'own:' + B && r2.route.instance === B, r2);
  const r3 = E.resolveIn(E.parse('/player/homebrew/weapons/in/house_rules/custom_house_rules_w'), ROWS);
  check('U2 an own packId held once keeps the old form', !!r3 && r3.ck === 'own:' + H && !r3.route.instance, r3);
  const r4 = E.resolveIn(E.parse('/player/homebrew/weapons/in/house_rules~' + H + '/custom_house_rules_w'), ROWS);
  check('U2 a ~ link to a packId held once canonicalises to the old form', !!r4 && r4.ck === 'own:' + H && !r4.route.instance, r4);
  const r5 = E.resolveIn(E.parse('/player/homebrew/weapons/in/friend/custom_friend_w'), ROWS);
  check('U2 an imported row keeps the old form', !!r5 && r5.ck === 'imp:friend' && !r5.route.instance, r5);
  check('U2 an unknown packId → null (the view falls back to the shelf)', E.resolveIn(E.parse('/player/homebrew/weapons/in/nobody/x'), ROWS) === null);
  check('U2 an instance under the wrong packId → null', E.resolveIn(E.parse('/player/homebrew/weapons/in/house_rules~' + B + '/x'), ROWS) === null);
  const order = [ROWS[2], { ck: 'own:cccccccccccc', packId: 'house_rules', origin: 'own', home: false }];
  const r6 = E.resolveIn(E.parse('/player/homebrew/weapons/in/house_rules/x'), order);
  check('U2 an old link to a repeated non-my_data packId → its FIRST own row in order', !!r6 && r6.ck === 'own:' + H && r6.route.instance === H, r6);

  // ── U3 ──
  check('U3 inFor exists', typeof E.inFor === 'function');
  check('U3 a link to a repeated packId carries the instance', JSON.stringify(E.inFor(ROWS[1], ROWS)) === JSON.stringify({ packId: 'my_data', instance: B }), E.inFor(ROWS[1], ROWS));
  check('U3 a link to a packId held once carries none', JSON.stringify(E.inFor(ROWS[2], ROWS)) === JSON.stringify({ packId: 'house_rules' }), E.inFor(ROWS[2], ROWS));
  check('U3 a link to an imported row carries none', JSON.stringify(E.inFor(ROWS[3], ROWS)) === JSON.stringify({ packId: 'friend' }), E.inFor(ROWS[3], ROWS));

  // ── U4 ──
  const V = fs.readFileSync(path.join(ROOT, 'lib/editor/view.jsx'), 'utf8');
  // the view reaches window.SWRPGEditor through its ED() accessor (and the Editor's local E = ED())
  check('U4 view.jsx resolves a pack route through SWRPGEditor.resolveIn (RecordForm and the Editor)', (V.match(/\b(?:ED\(\)|E)\.resolveIn\(/g) || []).length >= 2);
  check('U4 view.jsx builds its record links through SWRPGEditor.inFor', /\bED\(\)\.inFor\(/.test(V));
} catch (e) { check('ran without a crash', false, String(e && e.stack || e)); }

console.log('\nms_switch_forms: ' + (rows - fails) + '/' + rows + ' passed');
if (!rows || fails) process.exit(1);
