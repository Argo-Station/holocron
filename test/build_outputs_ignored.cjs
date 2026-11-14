#!/usr/bin/env node
/**
 * build_outputs_ignored.cjs — every esbuild OUTPUT is gitignored, and the list is DERIVED.
 *
 * WHY THIS EXISTS. `.gitignore` names each build output on its own line, one per transform. Adding
 * a transform to `build.mjs` therefore carries a second, unwritten obligation two files away, and
 * nothing enforced it: the new `.js` and `.js.map` just showed up as untracked noise, and the
 * failure mode if nobody noticed is committing a build artifact — a file the next build rewrites,
 * that then shows as a spurious diff in every unrelated lap forever.
 *
 * It was missed once in this lap (roomSession), which is what commissioned the guard. A rule
 * broken once is a slip; a rule with no mechanism is a rule that will be broken again.
 *
 * THE SCOPE IS READ OUT OF `build.mjs`, never hand-typed here — a hand-typed list stops covering
 * the transform someone adds next week, which is the exact defect this guard is about.
 *
 * Run:  node test/build_outputs_ignored.cjs   (static; no build, no browser)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const ROOT = path.join(__dirname, '..');
// B-423 RE-POINT (INSTRUMENT, R-CPR-18 — the READ follows the table, the CLAIM is untouched): the
// transform table moved OUT of build.mjs into build/sources.mjs, where the tree stamp reads the same
// list. This guard regexed build.mjs and found zero outputs — a scope of nothing, which passes leg 2
// vacuously. It now reads the table where the table lives, and leg 1b holds the two files together
// so the list cannot fork again.
const BUILD = fs.readFileSync(path.join(ROOT, 'build.mjs'), 'utf8');
const SOURCES = fs.readFileSync(path.join(ROOT, 'build/sources.mjs'), 'utf8');

// The transform table's own shape: { in: '...', out: '...' }.
const outs = [];
const re = /\bout:\s*'([^']+\.js)'/g;
let m;
while ((m = re.exec(SOURCES)) !== null) outs.push(m[1]);

check('1 the transform table was READ, not guessed — build/sources.mjs declares outputs', outs.length >= 8,
      outs.length);
check('1b ONE list — build.mjs imports the table it compiles from build/sources.mjs, so this guard and '
      + 'the build read the same document',
      /import\s*\{[^}]*TRANSFORMS[^}]*\}\s*from\s*'\.\/build\/sources\.mjs'/.test(BUILD));

// `git check-ignore` is the authority: it answers the question git itself will ask, rather than
// re-implementing .gitignore's matching rules (which have directory/negation subtleties no grep
// gets right).
function ignored(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch (e) { return false; }
}

const missing = [];
outs.forEach((o) => {
  if (!ignored(o)) missing.push(o);
  if (!ignored(o + '.map')) missing.push(o + '.map');
});
check('2 EVERY build output and its sourcemap is gitignored — adding a transform to build.mjs '
    + 'carries an unwritten obligation in .gitignore, and this is what writes it down',
  missing.length === 0, missing);

check('3 BITE: the check discriminates — a path that is NOT ignored reads as not ignored',
  !ignored('lib/shared/roomState.js') && !ignored('build.mjs'));
check('4 BITE: and it does find the ones that ARE',
  ignored('lib/shared/holotableView.js') && ignored('vendor.js.map'));

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + `  (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
