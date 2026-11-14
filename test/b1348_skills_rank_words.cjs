/*
 * b1348_skills_rank_words.cjs — B-1348: the skills step teaches the book's rule, "a rank upgrades a die first; past the
 * characteristic, it adds one" (EotE p.19), not the approved board's "it never adds one".
 *
 * THE DEFECT (measured at the cut 7e18f60e1, release-r7-creator-rules-fixes STEP 0): `FCSkillsSheet`'s phone standfirst
 * read "A rank upgrades a die; it never adds one." and the mid-fold and wide teaching heads read "A Rank Upgrades, It Does
 * Not Add". EotE p.19: the higher of the two sets how many Ability dice go in, then the
 * lower one sets how many of them are upgraded to Proficiency. A rank above the
 * characteristic adds a die. Both strings were the approved board's (`lab/holocron/index.html` @ b818e23f); Jason
 * corrected them to the book on DECISIONS D-411 item 24, in the words the look page drew (QLv1fvMFqnsimYF2zxrv9E,
 * `Docs/mockups/release-r7-creator-rules-b1348-look.html` @ 7cc33f8f4).
 *
 * LEGS (source of player/app.jsx, scoped to FCSkillsSheet; the board fixtures as extracted):
 *   1. the phone standfirst carries D-411 item 24's words and not the false clause.
 *   2. both teaching heads (mid fold, wide) read "A Rank Upgrades Before It Adds"; none reads "It Does Not Add".
 *   3. THE KEY (ruling `creator-board-divergence-lab` R-CBD-3: a ruled divergence is excused by a key to its ruling, never
 *      by a frame edit). Each board frame below still draws the board's words, named by frame, keyed to D-411 item 24.
 *      A frame edited to the app's words, or a frame added or dropped, reds here, so the divergence stays enumerated.
 * Run: node test/b1348_skills_rank_words.cjs   Exit 0 green · 1 red.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let fails = 0, passes = 0;
const check = (label, ok, detail) => { if (ok) { passes++; console.log('  PASS  ' + label); } else { fails++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); } };

const RULING = 'DECISIONS D-411 item 24';
const PHONE_WORDS = "{'. A rank '}<b>{'upgrades'}</b>{' a die first; past the characteristic, it adds one.'}";
const HEAD = '<h2>A Rank Upgrades Before It Adds</h2>';
const BOARD_PHONE = 'it never adds one.';
const BOARD_HEAD = 'A Rank Upgrades, It Does Not Add';

const src = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const start = src.indexOf('function FCSkillsSheet(');
const next = start < 0 ? -1 : src.indexOf('\nfunction ', start + 1);
const body = start < 0 ? '' : src.slice(start, next < 0 ? undefined : next);
check('FCSkillsSheet is found in player/app.jsx', start >= 0);

// 1 — the phone standfirst
check('1 the phone standfirst reads "A rank upgrades a die first; past the characteristic, it adds one." (' + RULING + ')',
  body.includes(PHONE_WORDS) && /data-step-standfirst="1"/.test(body));
check('1 the false clause "it never adds one" is gone from FCSkillsSheet', !body.includes(BOARD_PHONE));

// 2 — the teaching heads
const heads = body.match(/<h2>A Rank Upgrades[^<]*<\/h2>/g) || [];
check('2 both teaching heads (mid fold, wide) read "A Rank Upgrades Before It Adds" (' + RULING + ')',
  heads.length === 2 && heads.every((h) => h === HEAD), heads);
check('2 no head in player/app.jsx reads "It Does Not Add"', !src.includes(BOARD_HEAD));

// 3 — the key: the approved frames keep the board's words, by name
const KEYED = {
  board_skills_phone: BOARD_PHONE,
  board_skills_phone_round: BOARD_PHONE,
  board_skills_phone_buy: BOARD_PHONE,
  board_skills_phone_summary: BOARD_PHONE,
  board_skills_1366: BOARD_HEAD,
  board_skills_1920: BOARD_HEAD,
  board_skills_2560: BOARD_HEAD,
  board_skills_3840: BOARD_HEAD,
  board_skills_buys: BOARD_HEAD,
  board_skills_empty: BOARD_HEAD,
  board_skills_human: BOARD_HEAD,
  board_skills_three: BOARD_HEAD,
};
const FX = path.join(ROOT, 'test/fixtures');
const onDisk = fs.readdirSync(FX).filter((f) => /^board_skills_.*\.html$/.test(f)).map((f) => f.replace(/\.html$/, '')).sort();
check('3 the keyed frames are exactly the board_skills_* fixtures on disk (12)',
  JSON.stringify(onDisk) === JSON.stringify(Object.keys(KEYED).sort()), onDisk);
for (const [frame, words] of Object.entries(KEYED)) {
  const p = path.join(FX, frame + '.html');
  const html = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  check('3 ' + frame + ' still draws the board\'s "' + words + '" (excused by ' + RULING + ', R-CBD-3; not a frame edit)',
    html.includes(words));
}

console.log('\nb1348_skills_rank_words: ' + passes + ' pass, ' + fails + ' fail');
process.exit(fails ? 1 : 0);
