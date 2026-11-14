#!/usr/bin/env node
/**
 * no_jsx_text_comments.cjs — a `/* … *\/` in JSX CHILD position is not a comment, it is TEXT.
 *
 * FOUNDING CASE, and it is embedded below rather than looked up (decision 0042 — a case that reads
 * the live file checks nothing once the file is fixed). `player/app.jsx` carried this between the
 * phone runhead and the step wave:
 *
 *     </div>
 *     /* THE STEP MAP MOVED, IT DID NOT GO. The legacy rail carried … *\/
 *     <nav className="hp-wave" …>
 *
 * In JSX, text between elements is a CHILD. esbuild compiled that paragraph to a template-literal
 * child, React rendered it, and 326 characters of source commentary sat on the phone
 * characteristics screen at 390 for two days — `visible: true`, present in `innerText`.
 *
 * NOTHING CAUGHT IT, and that is why this guard is static rather than a smoke:
 *   · `board_dom_parity` strips text by construction ("TEXT AND DATA ARE STRIPPED") — a stray text
 *     node is invisible to it in BOTH directions;
 *   · the style/geometry layer compares objects, and a bare text node is not one;
 *   · no browser suite asserts on the ABSENCE of prose nobody meant to ship, and none ever will —
 *     you cannot enumerate the sentences that should not be there.
 * The one place the mistake is unambiguous is the BUILT BUNDLE: esbuild has already decided what is
 * a comment (dropped) and what is a child (emitted as a string). So this reads the build output —
 * the `store_kernel` / `skill_descriptions` / `f60_deletion_pins` pattern — and in an unbuilt
 * worktree it says so instead of passing vacuously (PRAXIS §1).
 *
 * Run: node test/no_jsx_text_comments.cjs        (after `npm run build`)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// ── THE DETECTOR ──────────────────────────────────────────────────────────────────────────────
// A string or template literal whose CONTENT opens `/*` and closes `*/`. A real comment never
// survives the bundler; a runtime string shaped exactly like a block comment is not a thing this
// codebase writes. If one ever is, it belongs in ALLOWED below with a reason — never silently.
const PATTERNS = [
  /`\/\*[\s\S]*?\*\/`/g,
  /"\/\*(?:\\.|[^"\\])*?\*\/"/g,
  /'\/\*(?:\\.|[^'\\])*?\*\/'/g,
];
const ALLOWED = [];   // none. An entry here needs a ruling and a reason on the same line.

function strays(src) {
  const hits = [];
  for (const re of PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      const lit = m[0];
      if (ALLOWED.some((a) => lit.includes(a))) continue;
      hits.push(lit.slice(0, 120).replace(/\s+/g, ' '));
    }
  }
  return hits;
}

// ── FOUNDING CASE FIRST (R-CPR-39): if it does not find the instance that defined the class,
//    every green below it is void. This is the shape esbuild actually emitted, verbatim.
const FOUNDING = 'React.createElement("span",{className:"hp-folio"},"Step "+r+" of "+n)),'
  + '`/* THE STEP MAP MOVED, IT DID NOT GO. The legacy rail carried the step list as its third '
  + '\\xA74 section; the board draws it as the head\'s WAVE. */`,'
  + 'React.createElement("nav",{className:"hp-wave"';
const founding = strays(FOUNDING);
check('0 FOUNDING CASE — the detector finds the compiled shape that motivated it '
  + '(a template-literal React child holding a block comment)',
  founding.length === 1 && founding[0].includes('THE STEP MAP MOVED'), founding);

// …and it does NOT fire on the things that legitimately look similar: a comment esbuild dropped,
// a regex, a divided expression. A detector that cannot stay quiet is not a detector.
const QUIET = 'const a=b/ *c;const s="a /* not a comment";const t=`ratio ${x/ *y}`;'
  + 'React.createElement("p",null,"see /* below */ for the rule and 2*/3 of the rest")';
check('0b it stays QUIET on a comment-shaped SUBSTRING inside ordinary prose and on division — '
  + 'the literal must OPEN and CLOSE the comment for it to be a stray child',
  strays(QUIET).length === 0, strays(QUIET));

// ── THE BUNDLES ───────────────────────────────────────────────────────────────────────────────
function bundles(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) bundles(p, acc);
    else if (e.name.endsWith('.js') && !e.name.endsWith('.map')) acc.push(p);
  }
  return acc;
}
const built = ['player/app.js', 'player/creator.js', 'player/sheet.js', 'gm/app.js', 'vendor.js']   // B-139: + the player's two chunks
  .map((f) => path.join(root, f))
  .concat(bundles(path.join(root, 'lib'), []))
  .filter((p) => fs.existsSync(p));

// PRAXIS §1: an unbuilt worktree must SAY SO. A guard over build output that passes on zero files
// is the vacuous green this whole family exists to avoid.
check('1 the built bundles are present — an unbuilt worktree makes this guard vacuous, not green '
  + '(run `npm run build`)', built.length >= 3, built.length);

const offenders = [];
for (const p of built) {
  const hits = strays(fs.readFileSync(p, 'utf8'));
  if (hits.length) offenders.push({ file: path.relative(root, p), hits });
}
check('2 no bundle emits a block comment as a React CHILD — a `/* … */` between JSX elements is '
  + 'TEXT, and it renders (founding case: the phone characteristics step, 326 chars, two days)',
  offenders.length === 0, offenders);

console.log(failures === 0
  ? `\nno_jsx_text_comments: ${built.length} bundles clean`
  : `\nno_jsx_text_comments: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
