/*
 * commercial_mode_parity.cjs — the two apps agree on whether artwork is shown (ruling `shipyard-s4-ship-pool-path`
 * R-S4PP-4).
 *
 * `COMMERCIAL_MODE` gates the publisher's art (the species portraits: lib/shared/portraits.js `speciesImgPath`
 * reads it at call time). Once the GM app shows character portraits (R-S4CO-7), a flag set on one shell and absent
 * from the other would show on one app what the other hides. So each shell defines it once, and the two literals
 * are equal: the two-distribution flip (`project_two_distribution_plan`, not S4's) moves both or fails here.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); } };
const defs = (file) => {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = []; const re = /(?:^|[^.\w$])var\s+COMMERCIAL_MODE\s*=\s*([^;\n]+);/g; let m;
  while ((m = re.exec(src))) out.push(m[1].trim());
  return out;
};
const P = defs('player/index.html'), G = defs('gm/index.html');
console.log('COMMERCIAL_MODE PARITY');
check(P.length === 1, 'player/index.html defines COMMERCIAL_MODE once', `found ${P.length}`);
check(G.length === 1, 'gm/index.html defines COMMERCIAL_MODE once', `found ${G.length}`);
check(P.length === 1 && /^(true|false)$/.test(P[0]), 'the player\'s value is a boolean literal', P[0]);
check(P.length === 1 && G.length === 1 && P[0] === G[0], 'the two shells carry the same literal', `player ${P[0]} · gm ${G[0]}`);
console.log(`\ncommercial_mode_parity: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
