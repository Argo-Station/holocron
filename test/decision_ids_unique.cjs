#!/usr/bin/env node
/**
 * Two ADR files must not share a decision number.
 *
 * WHY THIS EXISTS (ruling `species-phone-band` A2, R-SPBG-A2-1). Decision numbers are how ADRs are
 * CITED — `decisions/0039` appears in `Docs/BOARD.md`, in a gate and in a ruling — so a number that
 * points at two files makes every citation of it ambiguous after the fact. Two seats working the
 * same day each take "the next number" from a tree that does not yet contain the other's file, and
 * neither commit conflicts: the collision is created by the MERGE, exactly like the duplicate `def`
 * in B-374 and the B-371..373 board-id clash. Three of that class in one day is what commissioned
 * this check.
 *
 * FOUNDING CASE, EMBEDDED rather than looked up (decision 0042): the pair that motivated it is this
 * seat's `0043-an-instrument-is-re-pointed-at-the-fix-you-just-made.md` and seat 1's unmerged
 * `0043-…` on `feat/visual-revision`. Looking those up would check nothing once seat 1 renumbers to
 * 0044 at its merge — the case must survive its own resolution, so the names are written here.
 *
 * SCOPE, deliberately narrow: filename numbers only. A file whose `# NNNN.` heading disagrees with
 * its filename is a sibling defect and is NOT checked here; it was not what this guard was
 * commissioned for, and a guard that quietly grows a second subject is harder to trust than two.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'decisions');
const NUM = /^(\d{4})-/;

function collisions(names) {
  const byId = new Map();
  for (const n of names) {
    const m = NUM.exec(n);
    if (!m) continue;
    if (!byId.has(m[1])) byId.set(m[1], []);
    byId.get(m[1]).push(n);
  }
  return [...byId.entries()].filter(([, files]) => files.length > 1);
}

// ── FOUNDING CASE ────────────────────────────────────────────────────────────────────────────
const FOUNDING = [
  '0042-a-guards-founding-case-is-embedded-not-looked-up.md',
  '0043-an-instrument-is-re-pointed-at-the-fix-you-just-made.md',
  '0043-a-driven-guard-proves-the-value-moves.md',
  '0044-something-else-entirely.md',
];
const fc = collisions(FOUNDING);
if (fc.length !== 1 || fc[0][0] !== '0043' || fc[0][1].length !== 2) {
  console.error('✗ VOID — the detector cannot see its own founding case (the 0043 pair).');
  console.error('  Everything below would be untested silence. Fix the detector, not the tree.');
  process.exit(1);
}
console.log(`✓ founding case bites: 0043 claimed by ${fc[0][1].length} files`);

// ── THE SWEEP ────────────────────────────────────────────────────────────────────────────────
const names = fs.readdirSync(DIR).filter(n => n.endsWith('.md') && NUM.test(n)).sort();
const bad = collisions(names);

for (const [id, files] of bad) {
  console.error(`✗ decision ${id} is claimed by ${files.length} files:`);
  for (const f of files) console.error(`    ${f}`);
  console.error(`  A citation of "decision ${id}" cannot say which one it means.`);
}
if (bad.length) {
  console.error(`\n${bad.length} colliding decision number(s) across ${names.length} ADR files.`);
  process.exit(1);
}
console.log(`✓ ${names.length} ADR files, every decision number unique`);
