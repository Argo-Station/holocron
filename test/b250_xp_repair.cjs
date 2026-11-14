/* test/b250_xp_repair.cjs — B-250: a NaN-poisoned XP budget repairs to zeros on load.
 *
 * WHY ZEROS AND NOT A RECOMPUTE. The obvious repair — re-derive `spent` from what the character
 * owns — cannot be done on the persisted shape: `xp.spent` counts ADVANCEMENT spend only, and the
 * saved sheet stores what a character HAS, never how they got it. A best-effort number would move
 * a real budget in either direction while looking authoritative, which is worse than an honest
 * zero (brief `b250-recompute-is-not-derivable`, ruled R-B250-1).
 *
 * THE TWO BITES R-B250-1 OWES are §B and §C: idempotence, and a healthy sheet passing through
 * untouched. The second is the one that matters — a repair that "fixes" healthy characters is a
 * data-loss bug wearing a repair's clothes, and it would be invisible because the result still
 * looks like a valid budget.
 *
 * Run: node test/b250_xp_repair.cjs
 */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'lib', 'shared', 'charResolve.js'));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || !detail ? '' : '\n          -> ' + detail));
  ok ? pass++ : fail++;
}
const R = C.repairPoisonedXp;

// ── A. the damage this exists for ─────────────────────────────────────────────────────────────
const POISONED = [
  ['NaN spent', { total: 150, spent: NaN, remaining: 25 }],
  ['NaN remaining', { total: 150, spent: 125, remaining: NaN }],
  ['NaN total', { total: NaN, spent: 125, remaining: 25 }],
  ['all three NaN', { total: NaN, spent: NaN, remaining: NaN }],
  ['Infinity', { total: Infinity, spent: 0, remaining: Infinity }],
  ['-Infinity', { total: 0, spent: -Infinity, remaining: 0 }],
  ['a string that looks numeric', { total: '150', spent: 125, remaining: 25 }],
  ['undefined field', { total: 150, spent: undefined, remaining: 25 }],
];
POISONED.forEach(function (row) {
  const out = R(row[1]);
  check('A ' + row[0] + ' -> repaired to zeros', out.repaired === true
        && out.xp.total === 0 && out.xp.spent === 0 && out.xp.remaining === 0,
        JSON.stringify(out));
});
// A string is repaired deliberately: `'150' - 5` is 145 but `'150' + 5` is '1505', so a numeric
// string is a live arithmetic hazard in the same budget, not a harmless shape.

// ── B. BITE ONE — idempotent ──────────────────────────────────────────────────────────────────
const once = R({ total: NaN, spent: NaN, remaining: NaN });
const twice = R(once.xp);
check('B repairing twice changes nothing the second time',
      twice.repaired === false && JSON.stringify(twice.xp) === JSON.stringify(once.xp),
      JSON.stringify(twice));
check('B the second pass returns the SAME OBJECT, not a copy', twice.xp === once.xp);

// ── C. BITE TWO — a healthy sheet is never "repaired" ─────────────────────────────────────────
const HEALTHY = [
  ['a normal budget', { total: 150, spent: 125, remaining: 25 }],
  ['a fresh character', { total: 0, spent: 0, remaining: 0 }],
  ['zero remaining', { total: 200, spent: 200, remaining: 0 }],
  ['negative remaining (overspent, but FINITE)', { total: 100, spent: 120, remaining: -20 }],
];
HEALTHY.forEach(function (row) {
  const out = R(row[1]);
  check('C ' + row[0] + ' passes through UNTOUCHED (by identity)',
        out.repaired === false && out.xp === row[1], JSON.stringify(out));
});
// Negative-but-finite is deliberately NOT repaired. It is a legal state (a GM can lower a grant
// below what was spent) and zeroing it would destroy a real budget to fix a problem it does not
// have — the "confident wrong number" this whole row exists to refuse.

// ── D. an ABSENT budget is not damage ─────────────────────────────────────────────────────────
check('D null xp is left alone (a character who never advanced has none)',
      R(null).repaired === false && R(null).xp === null);
check('D undefined xp is left alone', R(undefined).repaired === false);
// If absence counted as damage, the marker would be stamped on every untouched character in the
// roster and every one of them would show the notice.

// ── E. purity ─────────────────────────────────────────────────────────────────────────────────
const src = { total: NaN, spent: NaN, remaining: NaN };
const before = Object.keys(src).map(function (k) { return k + '=' + String(src[k]); }).join(',');
R(src);
const after = Object.keys(src).map(function (k) { return k + '=' + String(src[k]); }).join(',');
check('E the input is never mutated', before === after, before + ' -> ' + after);

console.log('\n  B-250 xp repair: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
