#!/usr/bin/env node
/**
 * minion_dice_cleanup.cjs — guard for the buildPool dead-code deletion
 * (lib/shared/diceEngine.js; ruling minion-dice-cleanup-scope).
 *
 * The deleted `spec.minionGroup` branch built a flat pool (ability=ch+rk, proficiency=0) — a wrong
 * reading of RAW, and dead (0 callers since encounter removal). After deletion EVERY call uses the
 * standard FFG build, so a former-minion-style call now upgrades normally (mooks CAN crit).
 * RAW: EotE p.399; FaD Beginner p.27-28.
 *
 * Run:  node test/minion_dice_cleanup.cjs
 */
const D = require('../lib/shared/diceEngine.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

function main() {
  // A former-minion-style call (char 2, rank 1) now takes the STANDARD build:
  // proficiency=min(2,1)=1, ability=max(2,1)-1=1 — NOT the old flat {ability:3, proficiency:0}.
  const a = D.buildPool({ characteristic: 2, skillRank: 1 });
  check('former-minion call uses standard build -> {ability:1, proficiency:1}', a.ability === 1 && a.proficiency === 1);
  check('the old flat/no-upgrade path is gone (not {ability:3, proficiency:0})', !(a.ability === 3 && a.proficiency === 0));

  // Standard build intact for the ordinary case (char 3, rank 1).
  const b = D.buildPool({ characteristic: 3, skillRank: 1 });
  check('standard build intact -> {ability:2, proficiency:1}', b.ability === 2 && b.proficiency === 1);

  // The dead flag is inert: passing it changes nothing (param surface left, never read).
  const c = D.buildPool({ characteristic: 2, skillRank: 1, minionGroup: true });
  check('minionGroup flag is inert (same as standard build)', c.ability === a.ability && c.proficiency === a.proficiency);

  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
