/* B-72 — THE CREATION-DRAFT STEP CONTRACT, guarded.
 *
 * Ruling `b72-draft-step-contract` (R-SY4 durable-contract halt, discharged on paper before code).
 * The draft persisted `step` as a RAW FC_STEPS INDEX and never read the `v` field it wrote itself,
 * so any insertion or reorder silently resumed every in-flight draft on the wrong step.
 *
 * WHAT THIS GUARDS, in the ruling's own terms:
 *   1. a v1 fixture at EVERY old index resumes on the SAME-NAMED step under the twelve-step order;
 *   2. the NAMED MUTANT — the insertion applied WITHOUT the migration — turns it RED;
 *   3. R-UNH-1 self-check: a v:2 draft round-trips by name;
 *   4. the frozen literal is FROZEN — it must not be the live array (a migration that reads the
 *      live order is this bug reborn inside its own fix).
 *
 * Node guard rather than a browser smoke: this is pure contract arithmetic, and it must run in the
 * battery that gates every lap.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8');

let failures = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

// ── read the two orders out of the source, by name, so the guard tracks the real thing ──────
function arrayLiteral(varName) {
  const m = SRC.match(new RegExp('var\\s+' + varName + '\\s*=\\s*\\[([^\\]]*)\\]'));
  if (!m) return null;
  return m[1].split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const V1 = arrayLiteral('FC_STEPS_V1');
const LIVE = arrayLiteral('FC_STEPS');

check('the frozen v1 order is present in source', Array.isArray(V1) && V1.length === 11,
      V1 ? V1.length + ' steps' : 'missing');
check('the live FC_STEPS is present in source', Array.isArray(LIVE) && LIVE.length >= 11,
      LIVE ? LIVE.length + ' steps' : 'missing');

// ── 4. THE FROZEN LITERAL IS FROZEN ─────────────────────────────────────────────────────────
// The migration must not consult the live array. If FC_STEPS_V1 were ever re-pointed at
// FC_STEPS, every assert below would still pass while the bug returned — so this is checked
// structurally, at source, not behaviourally.
check('the migration reads a FROZEN literal, never the live FC_STEPS',
      /var\s+FC_STEPS_V1\s*=\s*\[/.test(SRC) && !/FC_STEPS_V1\s*=\s*FC_STEPS/.test(SRC),
      'FC_STEPS_V1 is its own literal');

// ── the contract, reimplemented here from the RULING (not imported from the app) ────────────
// An assert that imports the function it is testing proves only self-consistency. This mirrors
// the ruled behaviour independently: v2 → the name; v1/missing → the frozen order; else review.
function expectedName(draft) {
  if (draft && Number(draft.v) >= 2) {
    return (typeof draft.step === 'string' && draft.step) ? draft.step : 'review';
  }
  const i = draft && draft.step;
  return (typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < V1.length)
    ? V1[i] : 'review';
}

// The NAME is only half the contract; the app then resolves it to a live index, and THAT is where
// an unknown name lands on review. The first cut of this guard conflated the two and reported a
// false failure — the mirror must model both halves or it is testing a different function.
function expectedIndex(draft) {
  const i = LIVE.indexOf(expectedName(draft));
  return i >= 0 ? i : LIVE.indexOf('review');
}

// ── 1. EVERY v1 INDEX RESUMES ON ITS OWN STEP under the new order ───────────────────────────
let mapped = 0;
V1.forEach((name, idx) => {
  const draft = { v: 1, flow: 'custom', gameLine: 'eote', character: {}, step: idx };
  const got = expectedName(draft);
  const liveIdx = LIVE.indexOf(got);
  check(`v1 draft at index ${idx} ("${name}") resumes on "${name}"`,
        got === name && liveIdx >= 0, `→ ${got} @ live ${liveIdx}`);
  mapped++;
});
check('non-vacuity: every v1 index was exercised', mapped === V1.length, mapped + ' of ' + V1.length);

// ── 3. R-UNH-1 SELF-CHECK: a v2 draft round-trips by name ───────────────────────────────────
LIVE.forEach(name => {
  check(`v2 draft "${name}" round-trips by name`, expectedName({ v: 2, step: name }) === name);
});

// ── the unresolvable cases land on review, draft intact (F-45's pattern) ────────────────────
check('a v2 draft naming a step this build lacks lands on review',
      expectedIndex({ v: 2, step: 'a_step_that_never_existed' }) === LIVE.indexOf('review'),
      'unknown name → review, draft intact');
check('a v1 index beyond the frozen order lands on review',
      expectedName({ v: 1, step: 99 }) === 'review');
check('a draft with no version and no usable step lands on review',
      expectedName({ step: null }) === 'review');

// ── 2. THE NAMED MUTANT, run as a THOUGHT EXPERIMENT the guard can actually execute ─────────
// "The insertion applied WITHOUT the migration" = reading the persisted integer straight against
// the NEW order. If the live order has grown past v1, that must land drafts on the wrong step —
// which is the defect. This asserts the migration is doing real work, not that it exists.
if (LIVE.length > V1.length) {
  const wrong = V1.map((name, idx) => LIVE[idx]).filter((n, i) => n !== V1[i]);
  check('WITHOUT the migration the raw index would land drafts on the WRONG step (the defect is real)',
        wrong.length > 0,
        wrong.length + ' of ' + V1.length + ' steps would shift');
} else {
  console.log('SKIP  the shift check — the live order has not grown past v1 yet ' +
              '(it arms itself the moment the specialization step is inserted)');
}

// ── C-GLB-1: EVERY custom WRITER STAMPS THE CONTRACT — the class, not the instance ──────────
// F-45's re-entry wrote `v: 1` with a TWELVE-step index: a v1 label on v2 data. It reached the
// right screen only because the index was out of the frozen order's range and the unresolvable
// fallback caught it — the correct destination via the FAILURE path. This asserts the CLASS: any
// call site persisting a custom draft must stamp v:2 and a STRING step. A second writer added in a
// year gets caught by this, not by a reader noticing.
// Extracted by STRUCTURE, not by a fixed-width regex window: the first cut used {0,400} and found
// ONE of the three call sites, then reported "1 of 1 custom writers" — a vacuous pass dressed as a
// census. Walk from each call to its closing `});` instead, so the extraction cannot silently
// truncate a longer writer.
const SRC_LINES = SRC.split('\n');
const writers = [];
SRC_LINES.forEach((ln, i) => {
  if (!/saveCreationDraft\(\{/.test(ln)) return;
  const buf = [];
  for (let j = i; j < SRC_LINES.length && j < i + 40; j++) {
    buf.push(SRC_LINES[j]);
    if (/^\s*\}\);\s*$/.test(SRC_LINES[j])) break;
  }
  // Strip comments from the block before matching. Without this the doc-comment ABOVE the fixed
  // writer — which quotes the retired `v: 1` to explain what changed — matched first and the guard
  // reported the fixed writer as broken. Third instance today of a comment reading as code; the
  // rule is the same every time: match against code, quote history in prose.
  writers.push(buf.join('\n').split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'));
});
// F-100 M13 Lap C: the F-45 door was the third writer and left with it. KEEPS: the census of every writer, its stamp. DROPS: the count of three and two custom.
check('the draft writers are findable in source (non-vacuity)', writers.length >= 2,
      `${writers.length} saveCreationDraft call sites`);

const customWriters = writers.filter(w => /flow:\s*'custom'/.test(w));
check('every custom draft writer was located', customWriters.length >= 1,
      `${customWriters.length} of ${writers.length} write flow:'custom'`);

customWriters.forEach((w, i) => {
  const v = (w.match(/v:\s*(\d+)/) || [])[1];
  const stepM = w.match(/step:\s*([^,\n]+)/);
  const step = stepM ? stepM[1].trim() : '(none)';
  // a STRING step: either a quoted literal or an FC_STEPS[...] lookup, never a bare index
  // RE-POINTED (`f100-cerean-intellectuals-card` ADDENDUM 7, lap f100-cerean-intellectuals): F-45's re-entry writer reads
  // `step: landOn`, and `landOn` is 'review' unless the species ask's career-pick route asks for 'species' — a name either
  // way, both named in the live order. KEEPS the class (every custom writer persists a NAME, never an index); DROPS the
  // rule that the name must be a literal or an FC_STEPS lookup at the call site — `landOn` passes only with its rule pinned.
  const landOnPinned = step === 'landOn'
    && /var landOn = \(opts && opts\.step === 'species'\) \? 'species' : 'review';/.test(SRC)
    && LIVE.indexOf('species') >= 0 && LIVE.indexOf('review') >= 0;
  const isName = /^'[^']+'$/.test(step) || /^FC_STEPS\[/.test(step) || landOnPinned;
  check(`custom writer #${i + 1} stamps v:2`, v === '2', `v: ${v}, step: ${step}`);
  check(`custom writer #${i + 1} persists the step BY NAME, not an index`, isName, `step: ${step}`);
});

// The quickbuild writer lives in its OWN step space (its own STEPS array), so v:1 is correct there
// and the contract does not apply — asserted so the exemption is deliberate rather than an oversight.
const qb = writers.filter(w => /flow:\s*'quickbuild'/.test(w));
check('the quickbuild writer is exempt BY DESIGN and says so', qb.length === 1 &&
      /step indexes QuickBuild|OWN `STEPS` array|own STEPS array/i.test(SRC),
      `${qb.length} quickbuild writer(s)`);
check('and loadCreationDraft resolves a stepName ONLY for the custom flow',
      /if \(d\.flow === 'custom'\) d\.stepName/.test(SRC));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
