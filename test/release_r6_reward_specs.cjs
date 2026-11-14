#!/usr/bin/env node
/**
 * release_r6_reward_specs.cjs — the specs the dice hub rolls are the pools' own (card `release-r6-ui` ADDENDUM 5, U6 → (b)).
 *
 * The hub's given row is an ordinary spec row (doRoll, the chips), fed by rewardsStore's specs. That is one roll path only
 * while each pool IS buildPool of its spec. This pins it:
 *   P1  contactPool(c) equals diceEngine.buildPool(contactSpec(c)), for every Scope × Expertise 1..5.
 *   P2  rewardPool(reg, sheet, id) equals { pool: buildPool(rewardSpec(...).spec), symbols, per, skills } for every tier of
 *       every type whose tier prints a pool, alone and with each School tier on the sheet (the School's part folded in).
 *   P3  the School cases fold something in (a spec with boost, an upgrade or a symbol), so P2 is not vacuous on them.
 *
 * Run: node test/release_r6_reward_specs.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RS = require(path.join(ROOT, 'lib/shared/rewardsStore.js'));
const D = require(path.join(ROOT, 'lib/shared/diceEngine.js'));
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/rewards.json'), 'utf8'));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; } else { fail++; console.log('FAIL  ' + label + (detail ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// P1
for (let s = 1; s <= 5; s++) for (let e = 1; e <= 5; e++) {
  const c = { id: 'cnt-x', name: 'Net', skill: 'knowledge_underworld', scope: s, expertise: e, xp: 0 };
  check(`P1 contactPool = buildPool(contactSpec) at Scope ${s} / Expertise ${e}`, eq(RS.contactPool(c), D.buildPool(RS.contactSpec(c))),
    { pool: RS.contactPool(c), spec: RS.contactSpec(c) });
}

// P2 + P3
const types = Object.keys(REG.types).filter(k => (REG.types[k].tiers || []).some(t => t.effect && t.effect.pool));
const schools = [null].concat(REG.types.SCHOOL.tiers.map(t => t.key));
let cases = 0, folded = 0;
for (const k of types) for (const t of REG.types[k].tiers) {
  if (!(t.effect && t.effect.pool)) continue;
  for (const sk of schools) {
    const rows = [{ id: 'rwd-x', key: k, tier: t.key, name: '', xp: 0 }];
    if (sk && k !== 'SCHOOL') rows.push({ id: 'rwd-s', key: 'SCHOOL', tier: sk, name: '', xp: 0 });
    const sheet = { rewards: rows };
    const r = RS.rewardSpec(REG, sheet, 'rwd-x'), p = RS.rewardPool(REG, sheet, 'rwd-x');
    cases++;
    check(`P2 ${k} ${t.name}${sk ? ' + School ' + sk : ''}: rewardPool = buildPool(rewardSpec.spec) + its parts`,
      !!r && eq(p, { pool: D.buildPool(r.spec), symbols: r.symbols, per: r.per, skills: r.skills }), { p, r });
    if (r && sk && (r.spec.boost || r.spec.upgradeAbility || r.symbols.success || r.symbols.advantage)) folded++;
  }
}
check('P2 harvest is non-zero (the registry has pool tiers)', cases > 0, { cases });
check('P3 a School case folds something into a spec', folded > 0, { folded });

console.log(`release_r6_reward_specs: ${pass}/${pass + fail} PASS (${cases} reward cases, ${folded} with a School part)`);
if (fail) { console.log(`${fail} FAILED`); process.exit(1); }
console.log('all passed');
