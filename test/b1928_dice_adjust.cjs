#!/usr/bin/env node
/**
 * b1928_dice_adjust.cjs — B-1928 (D-673/D-674; ruling `release-r7-bug-burndown` ADDENDA 791 items 1–6, HANDOFF 793) and
 * B-1933 (ADDENDUM 789 item 7).
 *
 * THE ENGINE STEP — SWRPGDice.buildPool's LAST step, the player's ADJUST (one step after poolMods.augment's fold, inside
 * diceEngine; never a second pool path):
 *   E1  removing a sheet die: ability −1 off [AB][PR] at Average → [PR] · 2 difficulty
 *   E2  a direct red: challenge +1 adds a Challenge die and leaves the purples alone
 *   E3  the clamp at 0: a removal past 0 lands at 0 (no negative count)
 *   E4  the clamp at 9: an add past 9 lands at 9 (ADJUST_MAX)
 *   E5  the tick over no green: every green off, destinyUpgrade → one green added (EotE pp.20–21's upgrade rule)
 *   E6  the tick over a green: turns it yellow (one upgrade, EotE p.28: one point per check)
 *   E7  an empty pool: every die off → all six counts 0
 *   E8  absent: no `adjust`, no `destinyUpgrade` → the pool is byte-identical to the suggestion
 *   E9  it runs AFTER RAW's phases: an `upgradeDifficulty` then `challenge −1` lands on the upgraded pool
 * THE HUB'S HOLD — diceHubAdjustStep / diceHubAdjustChanges / diceHubAdjusted sliced by name from lib/shared/diceHub.jsx
 * and EXECUTED with the engine:
 *   H1  a step re-anchors on the count shown: + at 9 leaves no hidden difference; − at 0 stores none
 *   H2  differences survive a suggestion change (DIFFICULTY moved after adjusting keeps the player's red)
 *   H3  no set → the spec is returned untouched; a barred spec is never adjusted
 * B-1933:
 *   T1  diceHubTrainedCount counts a rank saved under the OggDude key (LTSABER for LTSAB) — three rows, three trained
 *
 * Red at the cut e6c966171 (no adjust step, no diceHubAdjust*, no diceHubTrainedCount), by exit code.
 * Run: node test/b1928_dice_adjust.cjs   (no arguments)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
if (process.argv.length > 2) { console.error('usage: node test/b1928_dice_adjust.cjs'); process.exit(2); }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const S = (x) => JSON.stringify(x);
let failures = 0;
const check = (ok, m, detail) => {
  if (ok) console.log('  PASS  ' + m);
  else { failures += 1; console.error('  FAIL  ' + m + (detail !== undefined ? '\n        ' + S(detail).slice(0, 600) : '')); }
  return !!ok;
};
function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let j = src.indexOf('{', i + header.length - 1), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) { k++; break; } } }
  return src.slice(i, k);
}
const SIX = ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback'];
const six = (p) => SIX.map((k) => k + ':' + ((p && p[k]) || 0)).join(' ');

console.log('B-1928 · ADJUST: the pool is a suggestion · B-1933 · the trained count');
const D = require(path.join(ROOT, 'lib/shared/diceEngine.js'));
const MED = { characteristic: 2, skillRank: 1, difficulty: 2 };   // [AB][PR] · 2 difficulty
const P = (extra) => D.buildPool(Object.assign({}, MED, extra));

check(six(P({ adjust: { ability: -1 } })) === six({ proficiency: 1, difficulty: 2 }), 'E1 a sheet green taken off', P({ adjust: { ability: -1 } }));
check(six(P({ adjust: { challenge: 1 } })) === six({ ability: 1, proficiency: 1, difficulty: 2, challenge: 1 }), 'E2 a direct red is added; the purples stay', P({ adjust: { challenge: 1 } }));
check(P({ adjust: { ability: -5, setback: -3 } }).ability === 0 && P({ adjust: { setback: -3 } }).setback === 0, 'E3 the clamp at 0');
check(P({ adjust: { boost: 20 } }).boost === 9 && D.ADJUST_MAX === 9, 'E4 the clamp at 9 (ADJUST_MAX)', P({ adjust: { boost: 20 } }));
check(six(P({ adjust: { ability: -1 }, destinyUpgrade: 1 })) === six({ ability: 1, proficiency: 1, difficulty: 2 }), 'E5 the tick over no green adds a green', P({ adjust: { ability: -1 }, destinyUpgrade: 1 }));
check(six(P({ destinyUpgrade: 1 })) === six({ proficiency: 2, difficulty: 2 }), 'E6 the tick over a green turns it yellow, once', P({ destinyUpgrade: 1 }));
check(six(P({ adjust: { ability: -1, proficiency: -1, difficulty: -2 } })) === six({}), 'E7 every die off: an empty pool');
check(S(P({})) === S(D.buildPool(MED)) && S(P({ adjust: null, destinyUpgrade: 0 })) === S(D.buildPool(MED)), 'E8 absent → the suggestion, byte for byte');
check(six(P({ upgradeDifficulty: 1, adjust: { challenge: -1 } })) === six({ ability: 1, proficiency: 1, difficulty: 1 }), 'E9 after RAW: upgraded, then the red taken off', P({ upgradeDifficulty: 1, adjust: { challenge: -1 } }));

const HUB = read('lib/shared/diceHub.jsx');
const sb = { console, JSON, Object, Math, Number, Array, String };
sb.window = sb; sb.SWRPGDice = D; sb.addEventListener = () => {};
vm.createContext(sb);
const names = ['var DICE_HUB_ADJUST', 'function diceHubAdjusted(', 'function diceHubAdjustCounts(', 'function diceHubAdjustStep(', 'function diceHubAdjustChanges(', 'function diceHubTrainedCount('];
const parts = names.map((n) => (n.startsWith('var ') ? (HUB.match(/^var DICE_HUB_ADJUST = .*;$/m) || [null])[0] : sliceDecl(HUB, n)));
if (!check(parts.every(Boolean), 'the hub\'s ADJUST and trained-count functions are there to slice', names.filter((n, i) => !parts[i]))) {
  console.log('\n' + (failures ? 'FAIL' : 'PASS')); process.exit(1);
}
vm.runInContext(read('lib/shared/sheetPool.js'), sb, { filename: 'sheetPool.js' });
vm.runInContext('var sheetSkillRank = window.SWRPGSheetPool.sheetSkillRank;\n' + parts.join('\n') +
  '\nthis.H = { step: diceHubAdjustStep, changes: diceHubAdjustChanges, adjusted: diceHubAdjusted, trained: diceHubTrainedCount };', sb);
const H = sb.H;

let a = { d: {}, destiny: false };
for (let i = 0; i < 12; i++) a = H.step(MED, a, 'boost', 1);
const back = H.step(MED, a, 'boost', -1);
check(a.d.boost === 9 && back.d.boost === 8, 'H1 + at 9 leaves no hidden difference (one − reads 8)', [a, back]);
const z = H.step(MED, H.step(MED, { d: {} }, 'ability', -1), 'ability', -1);
check(z.d.ability === -1 && !('proficiency' in z.d), 'H1 − at 0 stores no further difference', z);
const red = H.step(MED, { d: {} }, 'challenge', 1);
const hard = Object.assign({}, MED, { difficulty: 3 });
check(S(H.changes(hard, red)) === S([{ die: 'challenge', name: 'Challenge', n: 1 }]) && D.buildPool(H.adjusted(hard, red)).challenge === 1 && D.buildPool(H.adjusted(hard, red)).difficulty === 3,
  'H2 a DIFFICULTY moved after adjusting keeps the player\'s red', H.changes(hard, red));
check(H.adjusted(MED, null) === MED && H.adjusted(MED, { d: {}, destiny: false }) === MED, 'H3 no set → the spec untouched');
const barred = Object.assign({}, MED, { barred: true });
check(H.adjusted(barred, red) === barred, 'H3 a barred spec is never adjusted');

const sheet = { skills: { MED: 1, PERCEP: 2, LTSABER: 2 } };
const rows = [{ key: 'MED' }, { key: 'PERCEP' }, { key: 'LTSAB' }];
check(H.trained(sheet, rows) === 3, 'T1 three rows, three trained — the LTSABER alias counts', H.trained(sheet, rows));

console.log('\n' + (failures ? failures + ' FAIL' : 'PASS'));
process.exit(failures ? 1 : 0);
