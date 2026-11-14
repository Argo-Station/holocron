/*
 * f100_m8_dice_order.cjs — F-100 M8 C3's engine contract (ruling `f100-m8-contracts` R-M8K-3; `f100-m8-build-card` §4
 * item 1; C10's `dice_order` row and R-M8K-10 (vi)).
 *
 * WHAT IT ASSERTS, executing the shipped cores (`poolMods.augment` → `diceEngine.buildPool` → `resolve`):
 *   (a) RAW's order — add → upgrade → downgrade → remove (EotE p.20; FaD p.29) — WHATEVER THE DATA ORDER: every
 *       permutation of a mixed set of entries builds the same pool, and that pool is the hand-worked RAW answer;
 *       the change record lists the verbs in RAW's order;
 *   (b) R4/R5: an upgrade with no Ability (Difficulty) die left ADDS THE LOWER DIE, and the next upgrade turns it
 *       over — FaD Core p.30's own example: [PR][PR] + 1 upgrade = [PR][PR][AB]; + 2 = [PR][PR][PR] (B-1066);
 *   (c) R3/R6: a downgrade or a removal that finds nothing is ignored, and records nothing;
 *   (d) automatic symbols (C3 `symbol`): carried by buildPool, counted by resolve, shifted in the odds.
 * ITS BITES (landed mutants, read by exit code — scripts/f100_m8_bites.cjs): buildPool's phases reversed; the
 * Proficiency-add restored; augment's RAW sort removed.
 */
'use strict';
const D = require('../lib/shared/diceEngine.js');
const P = require('../lib/shared/poolMods.js');
let fails = 0, passes = 0;
const check = (label, ok, detail) => { if (ok) { passes++; console.log('  PASS  ' + label); } else { fails++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); } };
const ANY = { skillId: 'cool', group: 'general', characteristic: 'presence' };
const mod = (die, direction, count, source) => ({ source: source || die + ' ' + direction, die, count, direction, condition: null, appliesTo: [{ scope: 'all' }] });
const short = (p) => ['proficiency', 'ability', 'boost', 'setback', 'challenge', 'difficulty', 'force'].map((k) => k[0].toUpperCase() + (p[k] || 0)).join(' ');
function perms(a) { if (a.length <= 1) return [a]; const out = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach((r) => out.push([x].concat(r)))); return out; }
const fold = (spec, mods) => { const s = P.augment(spec, mods, ANY); return { spec: s, pool: D.buildPool(s) }; };

console.log('F-100 M8 · DICE ORDER (C3)');

// ── (b) R4 / R5 at the engine ────────────────────────────────────────────────────────────────────────────────────────
{
  const pp = { characteristic: 2, skillRank: 2 };                          // [PR][PR]
  const one = D.buildPool(Object.assign({ upgradeAbility: 1 }, pp)), two = D.buildPool(Object.assign({ upgradeAbility: 2 }, pp));
  check('(b) FaD p.30: [PR][PR] + 1 upgrade = [PR][PR][AB]', one.proficiency === 2 && one.ability === 1, short(one));
  check('(b) FaD p.30: [PR][PR] + 2 upgrades = [PR][PR][PR]', two.proficiency === 3 && two.ability === 0, short(two));
  const conv = D.buildPool({ characteristic: 3, skillRank: 1, upgradeAbility: 1 });
  check('(b) an Ability die left is turned over first: 1P2A + 1 = 2P1A', conv.proficiency === 2 && conv.ability === 1, short(conv));
  const d1 = D.buildPool({ difficulty: 0, upgradeDifficulty: 1 }), d2 = D.buildPool({ difficulty: 0, upgradeDifficulty: 2 });
  check('(b) R5: no Difficulty die + 1 upgrade = one Difficulty die added', d1.difficulty === 1 && d1.challenge === 0, short(d1));
  check('(b) R5: no Difficulty die + 2 upgrades = one Challenge die', d2.difficulty === 0 && d2.challenge === 1, short(d2));
  const viaMod = fold(pp, [mod('ability', 'upgrade', 1, 'Test Upgrade')]).pool;
  check('(b) through augment: an `upgrade ability` entry on [PR][PR] adds the green die', viaMod.proficiency === 2 && viaMod.ability === 1, short(viaMod));
}

// ── (a) RAW order, whatever the data order ───────────────────────────────────────────────────────────────────────────
{
  // Difficulty side: base 1 purple. add 1 → D2; upgrade ×2 → C2; downgrade 1 → C1 D1; remove 1 Difficulty → C1 D0.
  const set = [mod('difficulty', 'add', 1, 'add'), mod('difficulty', 'upgrade', 2, 'upgrade'),
    mod('challenge', 'downgrade', 1, 'downgrade'), mod('difficulty', 'remove', 1, 'remove')];
  const want = 'C1 D0';
  const got = perms(set).map((order) => { const p = fold({ characteristic: 2, skillRank: 1, difficulty: 1 }, order).pool; return 'C' + p.challenge + ' D' + p.difficulty; });
  check('(a) difficulty side: all 24 data orders build ' + want + ' (hand-worked RAW)', got.every((g) => g === want), [...new Set(got)]);
  // Ability side: base [PR][PR]. upgrade 1 → 2P1A; downgrade 1 → 1P2A. (Reversed it would be 1P1A → 2P0A.)
  const aset = [mod('proficiency', 'downgrade', 1, 'downgrade'), mod('ability', 'upgrade', 1, 'upgrade')];
  const agot = perms(aset).map((order) => short(fold({ characteristic: 2, skillRank: 2 }, order).pool));
  check('(a) ability side: both data orders build 1P2A (upgrade before downgrade, R2)',
    agot.every((g) => /^P1 A2 /.test(g)), agot);
  // the change record lists the verbs in RAW's order, whatever the data order
  const rec = fold({ characteristic: 2, skillRank: 1, difficulty: 1 }, set.slice().reverse()).spec._poolModChanges.map((c) => c.direction);
  check('(a) the change record reads add → upgrade → downgrade → remove for a reversed list', rec.join(',') === 'add,upgrade,downgrade,remove', rec);
}

// ── (c) a downgrade or a removal that finds nothing is ignored ──────────────────────────────────────────────────────
{
  const base = { characteristic: 2, skillRank: 0, difficulty: 1 };          // 2A vs 1D: no yellow, no red, no setback
  const r = fold(base, [mod('proficiency', 'downgrade', 1), mod('challenge', 'downgrade', 1), mod('challenge', 'remove', 1), mod('setback', 'remove', 1)]);
  check('(c) downgrade/remove with nothing to act on leaves the pool unchanged', short(r.pool) === short(D.buildPool(base)), short(r.pool));
  check('(c) …and records nothing', r.spec._poolModChanges.length === 0, r.spec._poolModChanges);
  const over = fold({ characteristic: 2, skillRank: 0, difficulty: 2 }, [mod('difficulty', 'remove', 5)]).pool;
  check('(c) R3: removing 5 from 2 Difficulty dice removes 2, the rest ignored', over.difficulty === 0, short(over));
  const purple = fold({ difficulty: 1, upgradeDifficulty: 1 }, [mod('difficulty', 'remove', 1)]).pool;
  check('(c) R8: a removed Difficulty die is purple — it never takes a Challenge die', purple.challenge === 1 && purple.difficulty === 0, short(purple));
}

// ── (d) automatic symbols ────────────────────────────────────────────────────────────────────────────────────────────
{
  const sym = { source: 'Test Symbol', symbol: 'advantage', count: 2, direction: 'add', condition: null, appliesTo: [{ scope: 'all' }] };
  const r = fold({ characteristic: 1, skillRank: 0, difficulty: 0 }, [sym, Object.assign({}, sym, { symbol: 'triumph', count: 1 })]);
  check('(d) augment carries symbols on the spec; buildPool keeps them on the pool',
    r.pool._autoSymbols && r.pool._autoSymbols.advantage === 2 && r.pool._autoSymbols.triumph === 1, r.pool._autoSymbols);
  const res = D.resolve({ ability: [{}], _autoSymbols: r.pool._autoSymbols });   // one blank green die
  check('(d) resolve counts them: 2 advantage; a Triumph is a Success too', res.advantage === 2 && res.triumph === 1 && res.success === 1, res);
  const odds = D.probabilities(r.pool);
  check('(d) the odds agree with the roll: success is certain with an automatic Triumph on 1 green die',
    odds && Math.abs(odds.success.chance - 1) < 1e-12 && Math.abs(odds.advantage.posChance - 1) < 1e-12, odds && odds.success.chance);
  const plain = D.buildPool({ characteristic: 2, skillRank: 1 });
  check('(d) a pool without symbols keeps its exact shape (no `_autoSymbols` key)', !('_autoSymbols' in plain), Object.keys(plain));
}

console.log(`\nf100_m8_dice_order: ${passes} PASS · ${fails} FAIL`);
process.exit(fails ? 1 : 0);
