#!/usr/bin/env node
/**
 * b314_treeless_survives_set_spec.cjs — the SET_SPEC wipe stays TREE-SCOPED, and the sentinel
 * the shell hardcodes stays the one the app actually writes.
 * (B-314; ruling `short-path-spec-select-wipe` R-SPW-1.)
 *
 * WHY THIS GUARD EXISTS AT ALL. The fix lives in the `charReducer` inside `player/index.html`,
 * which loads BEFORE the bundle and therefore cannot reference `SHORT_PATH_SPECKEY` from
 * `player/app.jsx`. So the string `'__treeless__'` is written out in two places. That is a
 * DRIFT HAZARD with a silent failure mode: rename the constant in app.jsx, and the shell keeps
 * comparing against a value nothing produces — the wipe quietly becomes total again and the
 * Short Path is destroyed exactly as it was before, with every existing test still green,
 * because the browser smoke that catches it needs a browser and this class of edit does not
 * feel like it needs one.
 *
 * So: pin them to each other, cheaply, in the battery that every lap runs.
 *
 * Reads SOURCE, deliberately — `player/index.html` is served RAW (it is the shell, not a build
 * output), so source IS what ships here.
 *
 * Run:  node test/b314_treeless_survives_set_spec.cjs
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'player/index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');

// ── 1. the app's sentinel, read from its declaration ─────────────────────────
const m = APP.match(/var\s+SHORT_PATH_SPECKEY\s*=\s*'([^']+)'/);
check('1 player/app.jsx still declares SHORT_PATH_SPECKEY', !!m, m ? m[1] : null);
const sentinel = m ? m[1] : null;

// ── 2. the shell's SET_SPEC case, isolated ───────────────────────────────────
const caseStart = SHELL.indexOf("case 'SET_SPEC':");
check('2 the shell still has a SET_SPEC case', caseStart !== -1);
// Bound the window at the NEXT case, not a byte count -- a fixed slice spills into sibling
// cases and reads their code as this one's.
const rest = caseStart === -1 ? '' : SHELL.slice(caseStart);
const nextCase = rest.indexOf("case '", 10);
const bodyRaw = nextCase === -1 ? rest.slice(0, 2600) : rest.slice(0, nextCase);
// STRIP COMMENTS BEFORE SWEEPING. The fix's own comment QUOTES the defect it removed
// ("`talents: {}` took them with it"), so a raw sweep flags the documentation that exists to
// stop the next editor reintroducing it -- punishing the explanation and teaching its removal.
// The rule means "no unconditional reset in the CODE", so the code is what gets read.
const body = bodyRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

// ── 3. the wipe is SCOPED, not total ─────────────────────────────────────────
// `talents: {}` unconditional is the B-314 defect verbatim. Anything that keeps a subset is
// fine; a bare reset is not.
check('3 SET_SPEC no longer resets talents unconditionally (`talents: {}` is the B-314 defect)',
  !/talents:\s*\{\s*\}/.test(body), body.match(/talents:\s*\{[^}]{0,20}\}/g));
check('3b it preserves entries by specKey rather than wiping wholesale',
  /specKey\s*===\s*'([^']+)'/.test(body));

// ── 4. THE PIN — the two copies of the sentinel agree ────────────────────────
const shellSentinel = (body.match(/specKey\s*===\s*'([^']+)'/) || [])[1] || null;
check('4 the shell compares against the SAME sentinel app.jsx writes '
    + '(drift here silently restores the total wipe)',
  !!sentinel && shellSentinel === sentinel, { app: sentinel, shell: shellSentinel });

// ── 4b. the stripper is load-bearing, not a loophole ────────────────────────
check('4b BITE for the stripper: the RAW case body DOES contain `talents: {}` (in the comment '
    + 'that documents the defect), so leg 3 is green about CODE, not about a silent file',
  /talents:\s*\{\s*\}/.test(bodyRaw) && !/talents:\s*\{\s*\}/.test(body),
  { raw: /talents:\s*\{\s*\}/.test(bodyRaw), stripped: /talents:\s*\{\s*\}/.test(body) });

// ── 5. non-vacuity — the guard read real source, not an empty string ─────────
check('5 the guard actually read both files (not a vacuous green)',
  SHELL.length > 5000 && APP.length > 100000 && body.length > 100,
  { shell: SHELL.length, app: APP.length, caseBody: body.length });

// ── 6. the reason is written where the next editor will look ────────────────
// These read bodyRaw ON PURPOSE: they are about the PROSE, which is exactly what leg 3 strips.
check('6 the shell states WHY the wipe is scoped, so it is not "simplified" back',
  /B-314/.test(bodyRaw) && /TREE-SCOPED/.test(bodyRaw));
check('6b and names the pin, so the duplication is not mistaken for an accident',
  /b314_treeless_survives_set_spec/.test(bodyRaw));

console.log('');
console.log(`b314 treeless survives SET_SPEC: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
