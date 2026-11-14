/**
 * b239_buy_cost_guard.cjs — B-239: the NaN cost hole on ADVANCEMENT's buy spines.
 *
 * THE DEFECT. Four of the five buy guards read `if (availableXp < cost) return;`. In JavaScript
 * `100 < undefined` is FALSE, so an undefined/absent cost does not block the purchase — it sails
 * through. The very next lines then compute `remaining: availableXp - cost` and
 * `spent: spentXp + cost`, and `100 - undefined` is **NaN**. Once XP is NaN every later guard
 * compares against NaN, which is also false, so EVERY subsequent purchase is free too. One missing
 * cost silently converts the character's whole XP budget into "unlimited".
 *
 * `buyBasicPower` already carries the fix — `if (cost == null || availableXp < cost) return;` — so
 * this is a fix that existed in the same file and never propagated to its four siblings.
 *
 * THE ASSERT IS EXECUTABLE, not a text pin. For each buy function this slices the guard EXPRESSION
 * out of `player/app.jsx` and EVALUATES it with a cost of `undefined` (and of `NaN`), asserting the
 * expression BLOCKS. A comment cannot satisfy it; only a real predicate can.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8');

// The five spines, by the signature each is declared with.
const SPINES = [
  'function buySkillRank(',
  'function buyTalent(',
  'function buyNewSpec(',
  'function buyForceUpgrade(',
  'function buyBasicPower(',
];

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}

console.log('b239_buy_cost_guard — an absent cost must never buy anything, and must never poison XP');

// THE PREDICATE, EXECUTED. `cannotAfford`'s return expression is sliced out of app.jsx and run
// with real values — a comment cannot satisfy this, only a working predicate can.
function predicateExpression() {
  const i = APP.indexOf('function cannotAfford(cost)');
  if (i < 0) throw new Error('SLICE MISS: cannotAfford — the ONE affordability predicate is gone; '
    + 'if the spines went back to inline guards, B-239 has regressed by construction.');
  const m = APP.slice(i, i + 400).match(/return\s+([^;]+);/);
  if (!m) throw new Error('cannotAfford has no return expression');
  return m[1].replace(/\s+/g, ' ').trim();
}
const EXPR = predicateExpression();
// eslint-disable-next-line no-new-func
const cannotAfford = new Function('availableXp', 'cost', 'return !!(' + EXPR + ');');

console.log('  predicate under test: ' + EXPR + '\n');

// ── the hole itself: a cost that is not a number must never buy ─────────────────────────────
[['undefined', undefined], ['NaN', NaN], ['null', null], ['a string', '10'], ['Infinity', Infinity]]
  .forEach(function (pair) {
    check('a ' + pair[0] + ' cost is BLOCKED (100 available)', cannotAfford(100, pair[1]));
  });

// ── the cascade: a character whose XP is ALREADY poisoned must not buy either ────────────────
check('a NaN budget blocks even an affordable-looking cost (stops the cascade)', cannotAfford(NaN, 5));
check('an undefined budget blocks', cannotAfford(undefined, 5));

// ── and it must still do its actual job ─────────────────────────────────────────────────────
check('an unaffordable cost is blocked', cannotAfford(100, 101));
check('an exactly-affordable cost goes through', !cannotAfford(100, 100));
check('an affordable cost goes through', !cannotAfford(100, 10));
check('a zero cost goes through', !cannotAfford(100, 0));

// ── WIRING: every spine must route through the ONE predicate, or it can drift again ──────────
SPINES.forEach(function (sig) {
  const name = sig.replace('function ', '').replace('(', '');
  const i = APP.indexOf(sig);
  if (i < 0) throw new Error('SLICE MISS: ' + sig);
  const body = APP.slice(i, i + 2600);
  // B-855 re-point (instrument norm 3): the claim KEPT is "every spine routes through the ONE
  // affordability predicate"; what it now also ACCEPTS is the ruled hold prefix on the same line
  // (`if (hold || cannotAfford(cost)) return;` — f100-b854 R-B854-1, guarded by
  // test/b855_hold_refusal.cjs). What it DROPS: nothing — a spine with no cannotAfford call still fails.
  check(name + ': routes through cannotAfford()', /if\s*\((hold\s*\|\|\s*)?cannotAfford\(cost\)\)\s*return;/.test(body),
    'its own guard: ' + ((body.match(/if\s*\([^\n]*\)\s*return;/) || ['<none>'])[0]));
  check(name + ': carries NO bare availableXp comparison of its own',
    !/if\s*\([^\n]*availableXp\s*<\s*cost[^\n]*\)\s*return;/.test(body));
});

// The arithmetic these guards protect — pinned so the reason the guard exists stays visible.
check('every spine that spends XP does so as availableXp - cost / spentXp + cost',
  (APP.match(/remaining:\s*availableXp\s*-\s*cost/g) || []).length >= 4
  && (APP.match(/spent:\s*spentXp\s*\+\s*cost/g) || []).length >= 4,
  'if this changes shape, re-read whether the guard above still protects it');

console.log('\nb239_buy_cost_guard: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
