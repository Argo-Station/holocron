#!/usr/bin/env node
/* B-342 — the ACTIVE-SOURCES ready-gate has exactly ONE definition.
 *
 * Ruled by `b342-ready-gate-consolidation` R-RGC-2: one definition beside the capability it
 * wraps, and "a fifth copy anywhere is the defect by name".
 *
 * WHAT WENT WRONG WITHOUT THIS. The subscription — ready() plus the `swrpg-sources-changed`
 * listener — was re-implemented in four modules (ui.jsx, yardView.jsx, store/view.jsx,
 * vesselView.jsx). Nothing was broken by that; each copy worked. The cost is the shape: four
 * places to fix when the contract moves, and three of them silently weaker than the one that
 * returns the resolved {ready, index, off}. The fourth was added one lap ago BY THIS SEAT as
 * the least-bad option and flagged rather than hidden, which is how it got a row and a ruling.
 *
 * WHY A GUARD AND NOT A NOTE: a duplicate re-implementation is invisible to every functional
 * test, because every copy WORKS. Only a structural check can see it, which is the same reason
 * the page-offset problem needed a guard rather than another paragraph.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME = 'lib/shared/ui.jsx';               // beside the capability it wraps (R-RGC-2)
const SCAN = ['lib', 'player', 'gm'];
const NEEDLE = /SWRPGSources\s*\.\s*ready\s*\(\s*\)\s*\.\s*then/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (e.name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const files = SCAN.filter(d => fs.existsSync(path.join(ROOT, d)))
                  .flatMap(d => walk(path.join(ROOT, d)));
const holders = files
  .filter(f => NEEDLE.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(ROOT, f).split(path.sep).join('/'));

// Non-vacuity first: a scan that read nothing would pass every assert below while measuring
// nothing — the failure mode this repo has been bitten by repeatedly. It is tied to the FOUR
// SURFACES this guard is about rather than a file-count threshold: a count is a magic number
// that goes stale (the first draft asserted >50 and there are 15), whereas "did it read the
// files whose duplication caused this row" is the question actually being asked.
const MUST_READ = ['lib/shared/ui.jsx', 'lib/shared/yardView.jsx',
                   'lib/store/view.jsx', 'lib/shared/vesselView.jsx'];
const read = new Set(files.map(f => path.relative(ROOT, f).split(path.sep).join('/')));
const missed = MUST_READ.filter(f => !read.has(f));
check(`the scan reached all four B-342 surfaces (${files.length} .jsx read)`,
      missed.length === 0, `never read: ${missed.join(', ')}`);
check('exactly ONE module subscribes to SWRPGSources.ready()',
      holders.length === 1, `found ${holders.length}: ${holders.join(', ')}`);
check(`that module is the ruled home (${HOME})`,
      holders.length === 1 && holders[0] === HOME, `found in ${holders.join(', ')}`);
check('the home exports the hook on SWRPGUI (so the other surfaces can reach it)',
      /useActiveSources\s*:\s*useActiveSources/.test(
        fs.readFileSync(path.join(ROOT, HOME), 'utf8')),
      'useActiveSources is not on the SWRPGUI export table');

console.log(`\nsources ready-gate single definition: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
