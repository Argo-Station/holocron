/* CITE JUDGEMENT BY TOC — ruling `cite-verification-method` R-CVM-1/2, board B-330; RE-POINTED by ruling
 * `release-r7-bug-burndown` ADDENDUM 56 (F-2, B-1349), which re-points R-CVM-1/2's premise.
 *
 * THE RE-POINT, PLAINLY. This guard used to say the `toc` tool's bookmarks carry PRINTED pages. They carry
 * CORPUS pages (EotE Step 6 bookmarks corpus 101-102, where its text sits; the converter prints 92-93), so
 * every cite it passed shipped a corpus page as a printed one. KEPT: the section judgement, the three honesty
 * classes, the bites — now over the CORPUS page each cite was read at (`creator_step_cites.json`
 * `pages[].corpus`). DROPPED: "a TOC range is a printed range". The PRINTED page is the one converter's and is
 * guarded by `test/b1349_step_cites_printed.cjs`. The paragraphs below are the original reasoning; read
 * "printed" in them as the claim that was measured false.
 *
 * WHY THIS GUARD EXISTS. Every printed page number the app had shipped was "verified" by reading
 * the corpus at that page and finding the rule there. That method is UNSOUND: the corpus's page N
 * is not the book's printed page N, and the drift is NOT a constant offset — the lab measured
 * -2, -1, 0, -1 across four adjacent EotE species entries (LAB_NOTES §18 @ 206d7f65). A content
 * read proves WHAT a rule says. It cannot prove WHERE it is printed.
 *
 * THE SOUND METHOD is the corpus's `toc` tool: PDF bookmark metadata carrying PRINTED page ranges,
 * with no OCR alignment anywhere in the path. A citation is CORRECT iff its page falls inside the
 * TOC section that STATES the rule. That is a containment test over metadata, and it is what this
 * guard runs.
 *
 * THE THREE HONESTY CLASSES ship with the method and all three appear below:
 *   CORRECT     — the page is inside the section that states the rule.
 *   UNJUDGEABLE — no TOC section tighter than tens of pages covers the claim. RECORDED, not
 *                 guessed, and not silently passed.
 *   WIDE-RANGE  — inside a section, but a wide one. Weak confirmation, and it says so.
 *
 * SCOPE IS DERIVED FROM THE SOURCE, NEVER TYPED. The guard reads the four steps' corpus pages out of
 * `public/data/canonical/creator_step_cites.json` (B-1349 moved them there from `player/app.jsx`'s retired
 * `FC_STEP_CITES`) and `FC_CHAR_GLOSS_CITE` out of `player/app.jsx`, so a page added tomorrow is
 * judged tomorrow. A hand-kept list of what to check is a list that goes stale the first time
 * someone adds a chip — this repo has watched that happen three times to a CSS scope.
 *
 * THE REGRESSION IT BLOCKS: a chip can never go back to being read-verified, because a page that
 * no declared section contains fails here, loudly, with the section it should have been in.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/toc_sections.json'), 'utf8'));
const SRC = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const CITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/creator_step_cites.json'), 'utf8'));

let pass = 0, fail = 0;
const check = (name, ok, evidence) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (evidence ? '  — ' + JSON.stringify(evidence) : '')); }
};

/* WHICH SECTION STATES EACH CLAIM. This mapping IS the judgement and is therefore declared here
 * rather than inferred: a guard that decided for itself which section a chip meant would be
 * marking its own homework. Matched by step NUMBER because the three books word the headings
 * differently ("Step 4 and 5: Choosing a Career and Specializations" in EotE, "Steps 4 and 5:
 * Select Career and Specializations" in AoR, "…Select a Career and Specialization" in FaD). */
const CLAIM_SECTIONS = {
  // The characteristics step's rule is the COST of raising a characteristic with starting XP.
  // That is Step 6, in all three books. Chapter 1's "Experience & Development" introduces XP as a
  // concept and does NOT carry the creation raise cost — which is exactly the trap the old
  // eote p.39 fell into.
  characteristics: [/step\s*6/i],
  // The career step's claim has two halves and the books split them the same way: WHICH skills are
  // career skills (Steps 4 and 5) and that career skills are cheaper to raise (Step 6).
  career: [/steps?\s*4\s*and\s*5/i, /step\s*6/i],
  specialization: [/steps?\s*4\s*and\s*5/i, /step\s*6/i],
  // The game-line chip says where the line's CAMPAIGN MECHANIC is defined — Obligation,
  // Duty, Morality — which each book states in its own Step 2. Matched by step number for
  // the same reason as the others: three books, three different headings.
  gameline: [/step\s*2/i],
};

/* UNJUDGEABLE BY DECLARATION. The gloss head cites the page where the six characteristics are
 * DEFINED. No book's TOC carries a section for that: it sits inside "1: Playing the Game", which
 * is 24–26 pages wide depending on the line. Recorded as unjudgeable rather than either guessed at
 * or quietly passed — the honesty class exists for precisely this. Re-open it if the corpus ever
 * gains a tighter bookmark. */
const UNJUDGEABLE = {
  gloss: 'the characteristics are defined inside "1: Playing the Game" and no TOC section is tighter',
};
const WIDE_PAGES = 20;   // a containing section wider than this is weak confirmation, and says so

function sectionsFor(alias) { return (TOC[alias] || {}).sections || []; }
function containing(alias, page) {
  return sectionsFor(alias).filter(s => page >= s.start && page <= s.end)
                           .sort((a, b) => (a.end - a.start) - (b.end - b.start));
}
function judge(alias, page, patterns) {
  const inside = containing(alias, page);
  if (!inside.length) return { klass: 'FAIL', why: 'no TOC section in the fixture contains this page' };
  const wanted = sectionsFor(alias).filter(s => patterns.some(p => p.test(s.title)));
  if (!wanted.length) return { klass: 'UNJUDGEABLE', why: 'no section matches the claim' };
  const hit = wanted.find(s => page >= s.start && page <= s.end);
  if (!hit) {
    return { klass: 'FAIL', why: 'outside the section that states the rule',
             expected: wanted.map(s => `${s.title} (${s.start}-${s.end})`) };
  }
  const width = hit.end - hit.start + 1;
  return { klass: width > WIDE_PAGES ? 'WIDE-RANGE' : 'CORRECT',
           section: `${hit.title} (${hit.start}-${hit.end})`, width };
}

// ── SCOPE, READ FROM THE DERIVED FILE (re-pointed, ADDENDUM 56): the CORPUS page each cite was read at ──
const found = [];
for (const step of Object.keys(CLAIM_SECTIONS)) {
  for (const alias of ['eote', 'aor', 'fad']) {
    const e = CITES[step] && CITES[step][alias];
    for (const pg of (e && e.pages) || []) found.push({ step, alias, page: pg.corpus, printed: pg.printed });
  }
}
check('0 the guard found the four steps in creator_step_cites.json (non-vacuity — a read that finds nothing '
      + 'would report a clean sweep over an empty set)', found.length > 0, { found: found.length });
const steps = new Set(found.map(f => f.step));
check(`0 every step/line pair parsed (${steps.size} steps x 3 lines, some carrying two pages)`,
      found.length >= 12 && steps.size === 4, { found: found.length, steps: [...steps] });

for (const f of found) {
  const v = judge(f.alias, f.page, CLAIM_SECTIONS[f.step] || []);
  check(`${f.step} · ${f.alias} corpus ${f.page} (printed ${f.printed}) — ${v.klass}${v.section ? ' · ' + v.section : ''}`,
        v.klass === 'CORRECT' || v.klass === 'WIDE-RANGE', v);
}

// ── THE GLOSS HEAD, judged as far as it can be and recorded where it cannot ─────────────────
const gloss = (SRC.match(/var FC_CHAR_GLOSS_CITE\s*=\s*'([^']+)'/) || [])[1];
check('0 the gloss head cite was found in the source', !!gloss, { gloss });
// The gloss head is a PRINTED page (its definitions sit at a corpus page nine further on); it is not judged
// against the corpus-paged TOC at all — UNJUDGEABLE by declaration, as before.
const gpage = gloss && Number((gloss.match(/P\.(\d+)/i) || [])[1]);
check(`gloss head p.${gpage} — UNJUDGEABLE, declared: ${UNJUDGEABLE.gloss}`,
      !!gpage && !!UNJUDGEABLE.gloss, { gloss, page: gpage });

// ── THE BITE: the guard must be able to fail ────────────────────────────────────────────────
const bite = judge('eote', 39, CLAIM_SECTIONS.characteristics);
check('BITE: the retired eote corpus 39 still judges FAIL, so this guard is not vacuous',
      bite.klass === 'FAIL', bite);
const bite2 = judge('aor', 42, CLAIM_SECTIONS.career);
check('BITE: the retired aor corpus 42 still judges FAIL', bite2.klass === 'FAIL', bite2);

/* THE RIGHT-PAGE-WRONG-SECTION BITE. The lab caught two citations on its side that passed because
 * the page merely fell inside SOME section rather than inside the section that states the claim —
 * an in-range test wearing a containment test's clothes. This proves this guard is not that one:
 * eote p.62 is a perfectly real page inside a perfectly real section ("Step 4 and 5: Choosing a
 * Career and Specializations"), and it is CORRECT for the career claim — but for the
 * CHARACTERISTICS claim, whose rule is stated in Step 6, it must FAIL. Same page, same book, two
 * different verdicts, decided by the CLAIM. If this ever goes green the guard has become an
 * in-range check and every judgement above is worth less than it looks. */
const cross = judge('eote', 62, CLAIM_SECTIONS.characteristics);
const crossOk = judge('eote', 62, CLAIM_SECTIONS.career);
check('BITE: a RIGHT-PAGE-WRONG-SECTION cite fails — eote corpus 62 is CORRECT for the career claim '
      + 'and FAILS for the characteristics claim, because the section is what is judged',
      cross.klass === 'FAIL' && (crossOk.klass === 'CORRECT' || crossOk.klass === 'WIDE-RANGE'),
      { as_characteristics: cross, as_career: crossOk });

console.log(`\ncite toc judgement: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
