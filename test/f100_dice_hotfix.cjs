#!/usr/bin/env node
/**
 * f100_dice_hotfix.cjs — guard for the dice-upgrade rule (ruling `f100-dice-hotfix` R-FDH-1/2, §4 item 1;
 * DECISIONS D-28; B-1066).
 *
 * RAW: an upgrade turns an Ability die into a Proficiency die. With none left, the upgrade ADDS AN ABILITY
 * DIE, and a further upgrade turns that new die over (FaD Core p.30; EotE Core p.21 prints the same
 * paragraph). The engine used to add a Proficiency die at once (TRUE-AIM1, 3e5a6bf1).
 *
 *   (1) FaD p.30's own example: [PR][PR] + 1 → [PR][PR][AB]; + 2 → [PR][PR][PR]; + 3 → [PR][PR][PR][AB].
 *   (2) a pool with an Ability die turns it first (Agility 3, rank 1, one upgrade → 2P 1A).
 *   (3) no upgrade, or a negative one, leaves the pool as the basic build.
 *   (4) the book's procedure applied ONE UPGRADE AT A TIME (an independent oracle, not the helper's
 *       arithmetic) agrees with buildPool over characteristic 0–6 × rank 0–6 × upgrades 0–8, and the
 *       upgrade never touches the difficulty side or the plain adds.
 *
 * Run:  node test/f100_dice_hotfix.cjs   (pure logic; no data files)
 */
const D = require('../lib/shared/diceEngine.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}
const pa = (p) => p.proficiency + 'P ' + p.ability + 'A';

// (1) FaD Core p.30: a character with two Proficiency dice and no Ability dice.
const pr2 = (n) => D.buildPool({ characteristic: 2, skillRank: 2, upgradeAbility: n });
check('(1) [PR][PR] + 1 upgrade → [PR][PR][AB] (2P 1A), got ' + pa(pr2(1)), pr2(1).proficiency === 2 && pr2(1).ability === 1);
check('(1) [PR][PR] + 2 upgrades → [PR][PR][PR] (3P 0A), got ' + pa(pr2(2)), pr2(2).proficiency === 3 && pr2(2).ability === 0);
check('(1) [PR][PR] + 3 upgrades → [PR][PR][PR][AB] (3P 1A), got ' + pa(pr2(3)), pr2(3).proficiency === 3 && pr2(3).ability === 1);

// (2) an Ability die in the pool is turned before anything is added.
const ag = D.buildPool({ characteristic: 3, skillRank: 1, upgradeAbility: 1 });
check('(2) Agility 3, rank 1, one upgrade → 2P 1A, got ' + pa(ag), ag.proficiency === 2 && ag.ability === 1);

// (3) no upgrade, or a negative one, is the basic pool.
const base = D.buildPool({ characteristic: 3, skillRank: 1 });
['0', '-1', '-4', 'undefined', 'null'].forEach((s) => {
  const n = s === 'undefined' ? undefined : JSON.parse(s);
  const p = D.buildPool({ characteristic: 3, skillRank: 1, upgradeAbility: n });
  check('(3) upgradeAbility ' + s + ' leaves the basic pool (1P 2A), got ' + pa(p),
        JSON.stringify(p) === JSON.stringify(base) && p.proficiency === 1 && p.ability === 2);
});

// (4) the book's procedure, one upgrade at a time.
function rawStepwise(c, r, n) {
  let prof = Math.min(c, r), abil = Math.max(c, r) - prof;
  for (let i = 0; i < n; i++) {
    if (abil > 0) { abil -= 1; prof += 1; }   // "upgrade an Ability die into a Proficiency die"
    else { abil += 1; }                        // none left: "adds one additional Ability die"
  }
  return { ability: abil, proficiency: prof };
}
let swept = 0, wrong = [], sideMoved = [];
const OTHER = { difficulty: 3, challenge: 1, boost: 2, setback: 1, force: 1 };
for (let c = 0; c <= 6; c++) for (let r = 0; r <= 6; r++) for (let n = 0; n <= 8; n++) {
  swept += 1;
  const want = rawStepwise(c, r, n);
  const got = D.buildPool(Object.assign({ characteristic: c, skillRank: r, upgradeAbility: n }, OTHER));
  if (got.ability !== want.ability || got.proficiency !== want.proficiency) wrong.push(c + '/' + r + '+' + n + ': ' + pa(got) + ' ≠ ' + pa(want));
  const plain = D.buildPool(Object.assign({ characteristic: c, skillRank: r }, OTHER));
  ['difficulty', 'challenge', 'boost', 'setback', 'force'].forEach((k) => { if (got[k] !== plain[k]) sideMoved.push(c + '/' + r + '+' + n + ' ' + k); });
}
check('(4) the stepwise RAW procedure equals buildPool over ' + swept + ' pools' + (wrong.length ? ' — ' + wrong.length + ' differ, e.g. ' + wrong.slice(0, 3).join('; ') : ''), wrong.length === 0);
check('(4) an Ability upgrade never moves difficulty, challenge, boost, setback or force' + (sideMoved.length ? ' — ' + sideMoved.slice(0, 3).join('; ') : ''), sideMoved.length === 0);

console.log(failures ? `\nFAILED — ${failures} check(s)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
