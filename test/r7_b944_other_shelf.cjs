#!/usr/bin/env node
/* r7_b944_other_shelf.cjs — B-944: EVERY WEAPON SITS ON A PAPER-STORE SHELF; THE SEVENTH, "OTHER", HOLDS THE REST
 *
 * The paper store's weapons rail drew B-666's six categories over the registry's `type`; 22 weapons (Lightwhip,
 * Thrown, Tool, Vehicle) matched none, so they were reachable only under "All weapons" or by search. DECISIONS D-395 (a),
 * ruling `release-r7-bug-burndown` ADDENDUM 7: a seventh shelf, "Other", drawn as the six are.
 *
 * The store's own vocabulary (BOARD_WEAPON_CATS) and its rest-filler (withRestTypes) are sliced from lib/store/view.jsx
 * by name and run over the store-visible weapons shelf, so this measures the shipped code, not a copy.
 *   O1  the rail's last category is "Other", after the board's six, unchanged and in order;
 *   O2  every store-visible weapon matches exactly one category (none on no shelf, none on two);
 *   O3  "Other" holds exactly the types the six do not name (today Lightwhip, Thrown, Tool, Vehicle: 22 weapons);
 *   O4  a type the registry gains later lands on "Other", never nowhere.
 *
 * Exit 1 on any failure (R-R7-3: shown red at the cut by exit code).
 */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const J = JSON.stringify;
let fail = 0;
function check(ok, msg, err) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + msg + (err ? '  [' + err + ']' : ''));
  if (!ok) fail++;
}

const src = fs.readFileSync(path.join(ROOT, 'lib', 'store', 'view.jsx'), 'utf8');
const cats = src.match(/var BOARD_WEAPON_CATS = (\[[\s\S]*?\n  \]);/);
const rest = src.match(/function withRestTypes\(vocab, shelf\) \{[\s\S]*?\n  \}/);
const vocab0 = cats ? new Function('return ' + cats[1])() : null;
const withRest = rest ? new Function(rest[0] + '\nreturn withRestTypes;')() : (v) => v;
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'canonical', 'weapons.json'), 'utf8')).weapons;
const shelf = Object.values(W).filter((w) => !w.store_hidden).map((w) => ({ id: w.id, type: w.type }));

const SIX = ['Energy weapons', 'Melee', 'Explosives/Other', 'Slugthrowers', 'Lightsabers', 'Brawling'];
check(vocab0 && J(vocab0.map((c) => c.label)) === J(SIX.concat(['Other'])), `O1 the rail reads the board's six, then Other: ${J(vocab0 && vocab0.map((c) => c.label))}`);

const vocab = vocab0 ? withRest(vocab0, shelf) : [];
const on = (it) => vocab.filter((c) => (c.matchType || []).indexOf(it.type) !== -1).map((c) => c.id);
const none = shelf.filter((it) => on(it).length === 0), two = shelf.filter((it) => on(it).length > 1);
check(none.length === 0 && two.length === 0, `O2 every one of ${shelf.length} weapons on exactly one shelf: none ${none.length}, two ${two.length}`);

const other = vocab.find((c) => c.id === 'other');
const otherN = other ? shelf.filter((it) => other.matchType.indexOf(it.type) !== -1).length : 0;
check(other && J(other.matchType) === J(['Lightwhip', 'Thrown', 'Tool', 'Vehicle']) && otherN === 22,
  `O3 Other holds ${J(other && other.matchType)}: ${otherN} weapons`);

const later = vocab0 ? withRest(vocab0, shelf.concat([{ id: 'x', type: 'Sonic Weapon' }])) : [];
const o4 = later.find((c) => c.id === 'other');
check(o4 && o4.matchType.indexOf('Sonic Weapon') !== -1, `O4 a new type lands on Other: ${J(o4 && o4.matchType)}`);

console.log(fail ? `\nr7_b944_other_shelf: ${fail} FAIL` : '\nr7_b944_other_shelf: all PASS');
process.exit(fail ? 1 : 0);
