#!/usr/bin/env node
/**
 * dice_probabilities.cjs — guard for the Dice Tutor Lap A odds engine
 * (lib/shared/diceEngine.js probabilities(); recon dice-tutor-lap-a-recon §5).
 *
 * Three independent checks, per the recon's verification plan:
 *   (a) CROSS-CHECK: DIE_FACES matches the canonical FFG per-die faces face-for-face. The reference
 *       below is the published FFG Star Wars RPG dice (CRB), which the two cited open datasets agree on
 *       (swrpg-online/dice + TTFTCUTS/sw_dice). If our data == that reference, the base is grounded.
 *       (The architect re-verifies against the live external repos before ruling.)
 *   (b) MONTE CARLO ORACLE: exact convolution must converge to a ~200k-sample empirical estimate.
 *   (c) HAND-ANCHORED POOLS: single-die pools checked against enumerable truth (faces/total).
 *
 * Run:  node test/dice_probabilities.cjs   (pure logic; no data files)
 */
const D = require('../lib/shared/diceEngine.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

// face object -> canonical key (sorted "sym:count"), blank -> "blank"
function faceKey(f) {
  const keys = Object.keys(f).filter(k => f[k]).sort();
  return keys.length ? keys.map(k => k + ':' + f[k]).join(',') : 'blank';
}
const multiset = (faces) => faces.map(faceKey).sort();

// ── (a) canonical FFG reference (published CRB faces; swrpg-online/dice + TTFTCUTS agree) ──
const REF = {
  boost:      ['blank', 'blank', 's:1', 'a:1,s:1', 'a:2', 'a:1'],
  setback:    ['blank', 'blank', 'f:1', 'f:1', 'h:1', 'h:1'],
  ability:    ['blank', 's:1', 's:1', 's:2', 'a:1', 'a:1', 'a:1,s:1', 'a:2'],
  difficulty: ['blank', 'f:1', 'f:2', 'h:1', 'h:1', 'h:1', 'h:2', 'f:1,h:1'],
  proficiency:['blank', 's:1', 's:1', 's:2', 's:2', 'a:1', 'a:1,s:1', 'a:1,s:1', 'a:1,s:1', 'a:2', 'a:2', 's:1,t:1'],
  challenge:  ['blank', 'f:1', 'f:1', 'f:2', 'f:2', 'h:1', 'h:1', 'f:1,h:1', 'f:1,h:1', 'h:2', 'h:2', 'd:1,f:1'],
  force:      ['dk:1', 'dk:1', 'dk:1', 'dk:1', 'dk:1', 'dk:1', 'dk:2', 'l:1', 'l:1', 'l:2', 'l:2', 'l:2'],
};

function crossCheck() {
  Object.keys(REF).forEach(die => {
    const ours = multiset(D.DIE_FACES[die] || []);
    const ref = REF[die].slice().sort();
    check(`(a) DIE_FACES.${die} matches canonical FFG faces (${ref.length})`,
          ours.length === ref.length && ours.every((k, i) => k === ref[i]));
  });
}

// ── (b) Monte Carlo oracle ──
function sampleFace(die) {
  const faces = D.DIE_FACES[die];
  return faces[Math.floor(Math.random() * faces.length)];
}
function monteCarlo(pool, n) {
  let succ = 0, tri = 0, des = 0, light = 0;
  for (let i = 0; i < n; i++) {
    let s = 0, t = 0, d = 0, lf = 0;
    Object.keys(pool).forEach(die => {
      for (let k = 0; k < pool[die]; k++) {
        const f = sampleFace(die);
        s += (f.s || 0) - (f.f || 0);
        t += (f.t || 0); d += (f.d || 0);
        lf += (f.l || 0) - (f.dk || 0);
      }
    });
    if (s > 0) succ++;
    if (t >= 1) tri++;
    if (d >= 1) des++;
    if (lf > 0) light++;
  }
  return { success: succ / n, triumph: tri / n, despair: des / n, light: light / n };
}

function mcCheck() {
  const N = 200000, TOL = 0.012;
  const pools = [
    { ability: 2, proficiency: 1, difficulty: 2 },
    { proficiency: 2, challenge: 2, boost: 1, setback: 1 },
    { ability: 1, difficulty: 1, force: 1 },
  ];
  pools.forEach((pool, idx) => {
    const exact = D.probabilities(pool);
    const mc = monteCarlo(pool, N);
    check(`(b) pool#${idx} success: exact ${exact.success.chance.toFixed(3)} ≈ MC ${mc.success.toFixed(3)}`, near(exact.success.chance, mc.success, TOL));
    check(`(b) pool#${idx} triumph: exact ${exact.triumph.chance.toFixed(3)} ≈ MC ${mc.triumph.toFixed(3)}`, near(exact.triumph.chance, mc.triumph, TOL));
    check(`(b) pool#${idx} despair: exact ${exact.despair.chance.toFixed(3)} ≈ MC ${mc.despair.toFixed(3)}`, near(exact.despair.chance, mc.despair, TOL));
    if (pool.force) check(`(b) pool#${idx} net-light: exact ${exact.force.lightChance.toFixed(3)} ≈ MC ${mc.light.toFixed(3)}`, near(exact.force.lightChance, mc.light, TOL));
  });
}

// ── (c) hand-anchored single-die pools (enumerable) ──
function handCheck() {
  check('(c) empty pool -> null', D.probabilities(null) === null && D.probabilities({}) === null);
  // ability: net success>0 on S,S,SS,SA = 4/8
  check('(c) 1 ability: P(success)=0.5', near(D.probabilities({ ability: 1 }).success.chance, 0.5));
  // boost: net>0 on S,SA = 2/6
  check('(c) 1 boost: P(success)=2/6', near(D.probabilities({ boost: 1 }).success.chance, 2 / 6));
  // difficulty alone: no success symbol -> 0; fails on F,FF,FH = 3/8
  check('(c) 1 difficulty: P(success)=0, P(fail)=3/8',
        near(D.probabilities({ difficulty: 1 }).success.chance, 0) && near(D.probabilities({ difficulty: 1 }).success.fail, 3 / 8));
  // proficiency: triumph only on T face = 1/12
  check('(c) 1 proficiency: P(triumph)=1/12', near(D.probabilities({ proficiency: 1 }).triumph.chance, 1 / 12));
  // challenge: despair only on D face = 1/12
  check('(c) 1 challenge: P(despair)=1/12', near(D.probabilities({ challenge: 1 }).despair.chance, 1 / 12));
  // force: net light>0 on L,L,LL,LL,LL = 5/12; dark<0 on 6×DK + DKDK = 7/12
  const fp = D.probabilities({ force: 1 }).force;
  check('(c) 1 force: P(net light)=5/12, P(net dark)=7/12', near(fp.lightChance, 5 / 12) && near(fp.darkChance, 7 / 12));
  // distributions are valid probability mass (sum to 1)
  const p = D.probabilities({ ability: 2, proficiency: 1, difficulty: 2 });
  const sum = p.success.dist.reduce((a, x) => a + x.p, 0);
  check('(c) success distribution sums to 1', near(sum, 1, 1e-9));
}

// ── (d) buildPool upgrade semantics (TRUE-AIM1; RAW EotE p.21) ──
function upgradeCheck() {
  // base pool: char 3, skill 1 → 1 proficiency, 2 ability.
  var base = D.buildPool({ characteristic: 3, skillRank: 1 });
  check('(d) base pool char3/skill1 → 1 prof, 2 ability', base.proficiency === 1 && base.ability === 2);
  // 1 upgrade with ability available → convert one ability → proficiency (2 prof, 1 ability).
  var up1 = D.buildPool({ characteristic: 3, skillRank: 1, upgradeAbility: 1 });
  check('(d) +1 upgrade converts an ability die (2 prof, 1 ability)', up1.proficiency === 2 && up1.ability === 1);
  // upgrades EXCEEDING ability are never dropped. RE-POINTED by F-100 M8 (f100-m8-contracts R-M8K-3/R-M8K-15, B-1066):
  // with no Ability die left an upgrade ADDS AN ABILITY DIE, and the next upgrade turns it over (FaD Core p.30;
  // EotE Core p.21) — the surplus is green-then-yellow, never yellow at once. Kept: nothing is dropped.
  var up5 = D.buildPool({ characteristic: 3, skillRank: 1, upgradeAbility: 5 });
  check('(d) +5 upgrades on a 2-ability pool → 2 converted, then add/turn/add (4 prof, 1 ability)',
        up5.proficiency === 4 && up5.ability === 1);
  // balanced pool (char == skill → 0 ability): an upgrade still moves the pool (the no-op bug's fix stands).
  var bal = D.buildPool({ characteristic: 3, skillRank: 3, upgradeAbility: 2 });
  check('(d) balanced pool (0 ability) +2 upgrades → one Ability added, then upgraded (4 prof, 0 ability)',
        bal.proficiency === 4 && bal.ability === 0);
}

crossCheck();
mcCheck();
handCheck();
upgradeCheck();
console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
