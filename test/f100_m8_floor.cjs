/*
 * f100_m8_floor.cjs — F-100 M8 member F, the difficulty FLOOR (ruling `f100-m8-contracts` ADDENDUM 5, R-M8K-29..31;
 * brief ADDENDUM 2, A2.2's two fixtures).
 *
 * WHAT IT ASSERTS, executing the shipped cores (`poolMods.collect` → `augment` → `diceEngine.buildPool`):
 *   (1) ORDER (β), R-M8K-30: Computers at Average (2 purple), Master Slicer's floored decrease {1, floor 1} and
 *       Codebreaker's plain decrease, both taken, build 0 Difficulty dice (Simple) in EITHER data order — each floor
 *       binds its own row's decrease only, and floored rows go first;
 *   (2) THE LEVEL COUNTS CHALLENGE (EotE p.22): Average upgraded once (1 red + 1 purple) + a floored decrease → 1 red,
 *       because the level is 2 > 1. Control: Easy (1 purple) + a floored decrease → still 1 purple, and the change
 *       record holds nothing (R3/R6: at its floor, ignored);
 *   (3) ABSENT CHANGES NOTHING (R-M8K-31): over a grid of specs, `removeDifficultyFloored` absent and [] build
 *       byte-identical pools, and a floor-0 entry builds exactly what the plain `removeDifficulty` does;
 *   (4) THE FIELD TRAVELS: `collect` carries a talent row's `floor` into the mod (the `withSymbol` whitelist).
 * ITS BITES (landed mutants, read by exit code — scripts/canonical/f100_m8_bites.cjs): the order flipped (plain
 * first) → (1) red; the level counting purple only → (2) red; `floor` dropped from the whitelist → (4) red.
 */
'use strict';
const D = require('../lib/shared/diceEngine.js');
const P = require('../lib/shared/poolMods.js');
let fails = 0, passes = 0;
const check = (label, ok, detail) => { if (ok) { passes++; console.log('  PASS  ' + label); } else { fails++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); } };
const CTX = { skillId: 'computers', group: 'general', characteristic: 'intellect' };
const ALL = [{ scope: 'all' }];
const floored = (source) => ({ source, die: 'difficulty', count: 1, direction: 'remove', condition: null, appliesTo: ALL, floor: 1 });
const plain = (source) => ({ source, die: 'difficulty', count: 1, direction: 'remove', condition: null, appliesTo: ALL });
const fold = (spec, mods) => { const s = P.augment(spec, mods, CTX); return { spec: s, pool: D.buildPool(s) }; };
const dc = (p) => 'C' + (p.challenge || 0) + ' D' + (p.difficulty || 0);

console.log('F-100 M8 · MEMBER F, THE DIFFICULTY FLOOR');

// ── (1) order (β) ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const base = { characteristic: 3, skillRank: 2, difficulty: 2 };
  const a = fold(base, [floored('Master Slicer'), plain('Codebreaker')]).pool;
  const b = fold(base, [plain('Codebreaker'), floored('Master Slicer')]).pool;
  check('(1) Average + Master Slicer (floor Easy) + Codebreaker → Simple (C0 D0), floored first', dc(a) === 'C0 D0', dc(a));
  check('(1) the same in the other data order', dc(b) === 'C0 D0', dc(b));
  const one = fold(base, [floored('Master Slicer')]).pool;
  check('(1) Average + Master Slicer alone → Easy (D1)', dc(one) === 'C0 D1', dc(one));
  const two = fold(base, [floored('A'), floored('B')]).pool;
  check('(1) two floored decreases on Average stop at Easy (D1)', dc(two) === 'C0 D1', dc(two));
}

// ── (2) the level counts Challenge dice ─────────────────────────────────────────────────────────────────────────────
{
  const up = fold({ characteristic: 2, skillRank: 1, difficulty: 2, challenge: 1 }, [floored('Master Leader')]);
  check('(2) Average upgraded once (C1 D1) + floored decrease → C1 D0 (level 2 > Easy)', dc(up.pool) === 'C1 D0', dc(up.pool));
  const easy = fold({ characteristic: 2, skillRank: 1, difficulty: 1 }, [floored('Master Leader')]);
  check('(2) control: Easy (D1) + floored decrease → D1 (at its floor)', dc(easy.pool) === 'C0 D1', dc(easy.pool));
  check('(2) control: the change record holds nothing (ignored, R3/R6)', easy.spec._poolModChanges.length === 0, easy.spec._poolModChanges);
  const rec = up.spec._poolModChanges[0] || {};
  check('(2) the change record names the floor and the move 1 → 0', rec.floor === 1 && rec.from === 1 && rec.to === 0, rec);
}

// ── (3) absent changes nothing ──────────────────────────────────────────────────────────────────────────────────────
{
  let same = 0, n = 0; const diff = [];
  for (let d = 0; d <= 4; d++) for (let c = 0; c <= d; c++) for (let up = 0; up <= 2; up++) for (let rm = 0; rm <= 3; rm++) {
    const spec = { characteristic: 2, skillRank: 1, difficulty: d, challenge: c, upgradeDifficulty: up, removeDifficulty: rm, setback: 1 };
    const ref = JSON.stringify(D.buildPool(spec));
    const empty = JSON.stringify(D.buildPool(Object.assign({}, spec, { removeDifficultyFloored: [] })));
    const zero = JSON.stringify(D.buildPool(Object.assign({}, spec, { removeDifficulty: 0, removeDifficultyFloored: rm ? [{ count: rm, floor: 0 }] : [] })));
    n++; if (ref === empty && ref === zero) same++; else diff.push(spec);
  }
  check('(3) ' + n + ' specs: absent = [] = a floor-0 entry, byte-identical', same === n, diff.slice(0, 3));
}

// ── (4) the field travels through collect ───────────────────────────────────────────────────────────────────────────
{
  const owned = [{ id: 'master_slicer', name: 'Master Slicer', ranked: false, ranks: 1,
    pool_mods: [{ id: 'remove_difficulty', die: 'difficulty', direction: 'remove', count: 1, applies_to: [{ scope: 'skill', value: 'computers' }], floor: 1 }] }];
  const m = P.collect(null, owned)[0] || {};
  check('(4) collect carries `floor` from the talent row', m.floor === 1, m);
}

console.log(`\nf100_m8_floor: ${passes} PASS · ${fails} FAIL`);
process.exit(fails ? 1 : 0);
