#!/usr/bin/env node
/**
 * force_power_buy_shared.cjs — B-32 anti-divergence pin (ruling advancement-basic-force-power-triage §3).
 *
 * A Force-sensitive character can buy basic powers in the CREATOR and in the sheet's ADVANCEMENT — but
 * the printed-cost / list / card logic must have ONE home (the RAW class: two force-power-purchase paths
 * for the same rule is the defect). This guard asserts, at source, that the shared core holds so a future
 * edit can't re-fork it:
 *   - one basicForcePowerCost (the RAW row-0 printed cost) + one buildBasicForcePowerList + one
 *     ForcePowerBuyList component;
 *   - BOTH surfaces consume ForcePowerBuyList (creator + advancement);
 *   - the old creator-only basicCostOf is RETIRED (not a second cost path);
 *   - advancement gates the section on force-sensitivity (forceRating), not only on owning a power;
 *   - a bought basic power is persisted in the canonical shape ({id, basic:true, upgrades:[]}).
 *
 * Run: node test/force_power_buy_shared.cjs
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'player', 'app.jsx'), 'utf8');

let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}
function count(re) { return (src.match(re) || []).length; }

// 1. one home for the RAW cost + the list build + the card component
check('basicForcePowerCost (printed RAW cost) defined exactly once', count(/function basicForcePowerCost\s*\(/g) === 1);
check('buildBasicForcePowerList defined exactly once', count(/function buildBasicForcePowerList\s*\(/g) === 1);
check('ForcePowerBuyList component defined exactly once', count(/function ForcePowerBuyList\s*\(/g) === 1);

// 2. the old creator-only cost fn is retired (no second RAW path)
check('the creator-only basicCostOf is RETIRED (folded into the shared core)', count(/function basicCostOf\s*\(/g) === 0);

// 3. RE-POINTED, B-1688 (D-449; ruling `release-r7-bug-burndown` ADDENDA 445, 469): the legacy `FCForcePowersStep` was the list's creator consumer. KEEPS advancement on the shared
// list and one cost path for the creator's sheet. DROPS "the creator mounts the list" and the >= 2 count.
check('advancement renders h(ForcePowerBuyList, …)', /h\(ForcePowerBuyList\b/.test(src));
check("the creator's Force sheet prices through the same one cost (basicForcePowerCost)",
  /function FCForceSheet[\s\S]*?\n\}\n/.test(src) && /basicForcePowerCost\(/.test(src.slice(src.indexOf('function FullCreator'))));

// 4. advancement gates on force-sensitivity, not only on owning a power
check('advancement gates the FORCE POWERS section on forceRating (not powers.length alone)',
  /forceRating\s*>=\s*1\s*\|\|\s*powers\.length\s*>\s*0/.test(src));
check('advancement has a buyBasicPower that persists the canonical shape',
  /function buyBasicPower\s*\(/.test(src) && /\{\s*id:\s*p\.id,\s*basic:\s*true,\s*upgrades:\s*\[\]\s*\}/.test(src));

console.log(failures === 0 ? '\nforce_power_buy_shared guard: ALL PASS' : '\nforce_power_buy_shared guard: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
