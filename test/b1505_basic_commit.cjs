#!/usr/bin/env node
/**
 * b1505_basic_commit.cjs — B-1505 (DECISIONS D-402 = A; ruling `release-r7-bug-burndown` ADDENDUM 111): the sheet's PLAIN
 * Commit button shows only on a power whose BASIC power's own words commit. RAW read at commissioning: Endure's basic power
 * commits (Knights of Fate p.36); none of the eleven Force and Destiny core powers' basic text does (FaD pp.284–304).
 *
 *   C1  THE CENSUS, base: CharResolve.basicPowerCommits over every power in public/data/canonical/force_powers.json = [endure].
 *   C2  THE CENSUS, the reSpecialized fad-v1 overlay (the records a sheet resolves through with the pack on) = [endure].
 *   C3  THE BUTTON: sheetPlainCommitShown, sliced by name from player/app.jsx and EXECUTED with the core, over every shipped
 *       power (base and overlay), every upgrade owned, nothing committed → shown exactly on C1/C2's set (Sense, a basic-only
 *       power, the row's own case: not shown). A die already held under a power's key keeps its button (its Release).
 *   C4  THE UPGRADE TICKS STAY: diceHubDurationCommits (sliced from lib/shared/diceHub.jsx, executed, the Force switch ON) over every shipped power with
 *       every upgrade → every owned Duration that names [FO] and every non-basic upgrade with a `commit_force` effect row
 *       keeps its tick; the set is non-empty (a zero is a FAILED run).
 *   C5  THE WIRING: the unit's plain button renders under `basicCommits`, and `basicCommits` is sheetPlainCommitShown's — the
 *       gate is the data's, never `atCap` alone and never a power's name.
 *
 * Red at the cut 35f37f637 (no basicPowerCommits, no sheetPlainCommitShown, the button gated by atCap alone).
 * Run: node test/b1505_basic_commit.cjs   (no arguments)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
if (process.argv.length > 2) { console.error('usage: node test/b1505_basic_commit.cjs'); process.exit(2); }
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

console.log('B-1505 · the plain Commit shows only where the basic power commits');
const SRC_APP = read('player/app.jsx');
// D-507: diceHubDurationCommits moved VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx — sliced from there by name
const SRC_HUB = read('lib/shared/diceHub.jsx');
const sb = { console, JSON, Object, String, RegExp, Math, Number, Array };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(read('lib/shared/charResolve.js'), sb, { filename: 'charResolve.js' });
const CR = sb.CharResolve;

const BASE = JSON.parse(read('public/data/canonical/force_powers.json')).force_powers;
const OVER = JSON.parse(read('public/data/mods/respecialized/fad-v1/force_powers.overlay.json')).force_powers;
const VIEWS = [['base', BASE], ['fad-v1 overlay', OVER]];
const EXPECT = ['endure'];

// C1 + C2 — the census
for (const [nm, recs] of VIEWS) {
  const n = Object.keys(recs).length;
  const hits = typeof CR.basicPowerCommits === 'function'
    ? Object.keys(recs).filter((id) => CR.basicPowerCommits(recs[id])).sort() : null;
  check(n > 0 && S(hits) === S(EXPECT), (nm === 'base' ? 'C1' : 'C2') + ' the census over ' + n + ' ' + nm + ' powers: the basic commits on ' + S(EXPECT), hits);
}

// C3 + C4 — the sheet's two pure steps, sliced by name and executed
const decls = ['function forceCommitKey(fp)', 'function sheetPlainCommitShown(fp, cb, committed)', 'function diceHubDurationCommits(fp, cb)'];
const DECL_SRC = { 'function diceHubDurationCommits(fp, cb)': SRC_HUB };
const bodies = decls.map((d) => sliceDecl(DECL_SRC[d] || SRC_APP, d));
const missing = decls.filter((d, i) => !bodies[i]);
if (check(missing.length === 0, 'C3 the sheet\'s steps are in player/app.jsx, the hub\'s in lib/shared/diceHub.jsx (sliced by name)', missing)) {
  vm.runInContext(bodies.join('\n') + '\nglobalThis.__A = { forceCommitKey, sheetPlainCommitShown, diceHubDurationCommits };', sb, { filename: 'app-slice.js' });
  const A = sb.__A;
  for (const [nm, recs] of VIEWS) {
    const cb = { forcePowers: recs };
    const fps = Object.keys(recs).map((id) => ({ id, name: recs[id].name,
      upgradeKeys: Object.keys(recs[id].abilities || {}).filter((k) => recs[id].abilities[k].family !== 'basic') }));
    const shown = fps.filter((fp) => A.sheetPlainCommitShown(fp, cb, {})).map((fp) => fp.id).sort();
    check(S(shown) === S(EXPECT), 'C3 ' + nm + ': over ' + fps.length + ' powers, every upgrade owned, the plain Commit shows exactly on ' + S(EXPECT), shown);
    check(fps.some((fp) => fp.id === 'sense') && !A.sheetPlainCommitShown({ id: 'sense', name: 'Sense', upgradeKeys: [] }, cb, {}),
      'C3 ' + nm + ': Sense bought at basic only shows no Commit (the row\'s own case)');
    const held = fps.filter((fp) => !A.sheetPlainCommitShown(fp, cb, { [fp.id]: true })).map((fp) => fp.id);
    check(held.length === 0, 'C3 ' + nm + ': a die held under any power\'s key keeps its button (its Release)', held);
    // C4 — the expected ticks by rule, read straight off the records
    const want = [], got = [];
    fps.forEach((fp) => {
      fp.upgradeKeys.forEach((k) => {
        const ab = recs[fp.id].abilities[k];
        const dur = ab.family === 'duration' && CR.durationCommitDice(ab) > 0;
        const eff = ab.family !== 'duration' && (ab.effects || []).some((e) => e && e.cost && e.cost.commit_force) && CR.commitValueOf(fp.id + '.' + k, cb) != null;
        if (dur || eff) want.push(fp.id + '.' + k);
      });
      A.diceHubDurationCommits(fp, cb).forEach((u) => got.push(u.key));
    });
    want.sort(); got.sort();
    check(want.length > 0 && S(got) === S(want), 'C4 ' + nm + ': every committing upgrade keeps its tick (' + want.length + ')', { want, got });
  }
}

// C5 — the wiring
{
  const btn = /\{p\.onCommit && basicCommits \? <button type="button" className="hp-quiet" data-testid=\{'commit-force-' \+ i\}/.test(SRC_APP);
  const src = /var basicCommits = sheetPlainCommitShown\(fp, tickCb, committedMap\);/.test(SRC_APP);
  const noName = !/basicPowerCommits[^\n]*['"]endure['"]|sheetPlainCommitShown[^\n]*['"]endure['"]/.test(SRC_APP + read('lib/shared/charResolve.js'));
  check(btn && src && noName, 'C5 the unit\'s plain Commit renders under sheetPlainCommitShown — the data\'s gate, no power name', { btn, src, noName });
}

console.log(failures ? '\nFAIL — ' + failures + ' check(s)' : '\nPASS');
process.exit(failures ? 1 : 0);
