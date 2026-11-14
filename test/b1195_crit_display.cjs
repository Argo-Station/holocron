#!/usr/bin/env node
/* test/b1195_crit_display.cjs — B-1195: a weapon with no critical rating prints "—", never "0", wherever a Critical prints.
 *
 * The registry stores "no rating" as `crit: 0` (the training lightsaber, nets, stun grenades…); the roll already read
 * ≤ 0 as no threshold and the dice hub printed "—", but the stack card, the item panel, the bench's delta, two PDF writers
 * and three more lines printed the raw 0. Lap f100-fix-live-numbers-s (card ADDENDUM 7; ruling ADDENDUM 8 Q5: all nine
 * sites through ONE helper) puts every site through `ItemResolve.critText`.
 *
 *   1 the helper: null / '' / 0 / a negative → "—"; a positive prints as itself
 *   2 the source scan: in player/app.jsx, lib/shared/sheetPool.js and lib/shared/diceHub.jsx every `.crit` read that is not inside critText(...) is one of the three
 *     NON-printing reads named below (two pool computations, one registry→store mapping) — a tenth printing site, or one
 *     of the nine reverted, turns this red
 *   3 the registry: every `crit: 0` weapon prints "—" through the helper (the count read, never typed)
 *
 * Run: node test/b1195_crit_display.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
let pass = 0, fail = 0;
function check(label, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || detail === undefined ? '' : '\n          -> ' + JSON.stringify(detail)));
  ok ? pass++ : fail++;
}
const DASH = '—';

console.log('B-1195: one crit display, "—" for none\n');

// 1 — the helper
check('critText exists on ItemResolve', typeof IR.critText === 'function');
const ct = IR.critText || (() => null);
[[0, DASH], [null, DASH], [undefined, DASH], ['', DASH], [-1, DASH], ['0', DASH], [2, '2'], ['3', '3'], [5, '5']].forEach(([v, want]) => {
  check('critText(' + JSON.stringify(v) + ') → "' + want + '"', ct(v) === want, ct(v));
});

// 2 — the source scan
const NON_PRINTING = [
  'var critNum = Number(weapon.crit);',                                   // weaponPoolOf's threshold (lib/shared/sheetPool.js)
  'var critNum = Number(w && w.crit), critPrinted =',                     // the dice hub's threshold
];
// RULING-MOVED (D-411 item 28, D-R7GP2 → (a), release-r7-bug-burndown ADDENDUM 309): the bench's registry→store fallback
// mapping ("crit: r.crit, qualities: [], …") left with B-1099, whose bench reads resolveSheetEquipment's display. KEEPS every
// raw `.crit` read listed and non-printing, and the nine printing sites on critText; DROPS only the deleted line's entry (3 → 2).
// the hub row's builder moved from computeWeaponPool into lib/shared/sheetPool.js's weaponPoolOf (f100-surfacing-sheet-concept
// R-SSC-4, ADDENDUM 10 C3 (a)) — re-pointed by name at f100-surfacing-sheet-build: the scan reads that file too, the three
// non-printing reads and the nine printing sites unchanged
// D-507 (handoff `encounters-e3-dicehub-move`): the dice hub (its threshold read and its printing site, which now calls
// ItemResolve.critText — the helper app.jsx's critText wraps) moved VERBATIM to lib/shared/diceHub.jsx — re-pointed by
// name: the scan reads that file too, each file scanned on its own, the non-printing reads and the nine sites unchanged
// post1-one-number-hub-build (ADDENDUM 642 as 644 rules it, C1/C2): the hub's press sheet head (`whyMeta`, "Damage N ·
// Critical N" as approved Q1 draws it) is a NEW printing site and calls ItemResolve.critText — KEEPS every rule (no raw
// `.crit` printed, the two non-printing reads); MOVES only the count, nine → ten
const FILES = ['player/app.jsx', 'lib/shared/sheetPool.js', 'lib/shared/diceHub.jsx'];
const raw = [];
let sites = 0;
FILES.forEach((rel) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  src.forEach((line, i) => {
    const stripped = line.replace(/critText\([^()]*(\([^()]*\))*[^()]*\)/g, '');
    if (/\.crit\b/.test(stripped) && !/^\s*\/\//.test(line)) raw.push({ file: rel, line: i + 1, text: line.trim().slice(0, 140), full: line });
  });
  sites += src.filter((l) => /critText\(/.test(l) && !/function critText/.test(l)).length;
});
const unexplained = raw.filter((r) => !NON_PRINTING.some((sig) => r.text.indexOf(sig) >= 0 || r.full.indexOf(sig) >= 0))
  .map((r) => ({ file: r.file, line: r.line, text: r.text }));
check(FILES.join(' + ') + ': every raw `.crit` read is one of the ' + NON_PRINTING.length + ' non-printing reads (found ' + raw.length + ')',
  unexplained.length === 0 && raw.length === NON_PRINTING.length, unexplained.length ? unexplained : raw.map((r) => ({ file: r.file, line: r.line, text: r.text })));
check(FILES.join(' + ') + ': the ten printing sites call critText (found ' + sites + ')', sites === 10, sites);

// 3 — the registry
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/weapons.json'), 'utf8')).weapons;
const zero = Object.values(W).filter((w) => w && w.crit === 0);
check(zero.length + ' registry weapons store crit 0; every one prints "—"', zero.length > 0 && zero.every((w) => ct(w.crit) === DASH),
  zero.filter((w) => ct(w.crit) !== DASH).map((w) => w.id));
check('the training lightsaber is among them', zero.some((w) => w.id === 'training_lightsaber'));

console.log('\n  B-1195 crit display: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
