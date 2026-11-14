/* r7_b1663_career_free_ranks_line — B-1663 (ruling `release-r7-bug-burndown` ADDENDUM 406; DECISIONS D-433 item 4 @ 2faadb2f2):
 * the career step's lead says, verbatim, "Career free ranks go only to career skills, which cost 5 XP less." The old line
 * ("Only career skills get free ranks, …") was false for a Human, who takes a free rank in two NON-career skills (EotE p.48).
 *
 *   §A  FC_CAREER_LEAD_RULE is Jason's sentence, character for character
 *   §B  the career step's lead prints it (the one reader), and the old sentence is gone from the player app
 *   §C  the copy sweep's TIGHTEN row carries the new words, so its ratchet holds the line D-433 set
 *
 * Red at the cut 468859b19 (the old sentence). Run: node test/r7_b1663_career_free_ranks_line.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'player', 'app.jsx'), 'utf8');
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'copy_voice_sweep.json'), 'utf8'));
const WANT = 'Career free ranks go only to career skills, which cost 5 XP less.';
const OLD = 'Only career skills get free ranks, and cost 5 XP less.';

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}

const decl = (SRC.match(/var FC_CAREER_LEAD_RULE = '([^']*)';/) || [])[1];
check('§A FC_CAREER_LEAD_RULE reads D-433\'s words verbatim', decl === WANT, JSON.stringify(decl));
const readers = SRC.split('\n').filter((l) => /\bFC_CAREER_LEAD_RULE\b/.test(l) && !/var FC_CAREER_LEAD_RULE =/.test(l));
check('§B the career step\'s lead is its one reader, printed after the career-skill count', readers.length === 1 && /career skills<\/b>\. ' \+ FC_CAREER_LEAD_RULE/.test(readers[0]), readers.join(' | '));
check('§B the old sentence is gone from player/app.jsx', SRC.indexOf(OLD) < 0);
const row = FX.rows.filter((r) => r.cls === 'TIGHTEN' && /only skills you can take <b>free ranks<\/b>/.test(r.text || ''));
check('§C the sweep\'s TIGHTEN row for this lead carries the new words', row.length === 1 && row[0].new === WANT, row.map((r) => r.new).join(' | '));

console.log('\nr7_b1663_career_free_ranks_line: ' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
