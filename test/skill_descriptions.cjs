#!/usr/bin/env node
/**
 * skill_descriptions.cjs — F-58 guard: the skill explanations live in the REGISTRY, not in code.
 *
 * WRITTEN FROM THE RULING TEXT (R-MEL-1). F-58 was scoped as "skills.vocab descriptions: 0 of 35
 * entries carry one". Measured, the prose already existed — 35 of them, in `FC_SKILL_DESC`, a
 * hardcoded map in player/app.jsx. So the lap was a MOVE into the registry, and this guard pins the
 * move rather than the authoring: the registry must hold all 35, and the shipped bundle must hold
 * NONE of them.
 *
 * R-B55-1 COMPLIANCE — the bundle assertions use only what survives minification:
 *   · the DESCRIPTION STRINGS themselves (string literals; a minifier cannot rewrite them)
 *   · the property name `skillDescs` (object keys survive)
 * It deliberately does NOT assert on the helper's function name, which a minifier may rename.
 *
 * Run: node test/skill_descriptions.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const TRACKED = path.join(root, 'schema/vocab/skills.vocab.json');
const SERVED = path.join(root, 'public/data/canonical/skills.vocab.json');

const tracked = JSON.parse(fs.readFileSync(TRACKED, 'utf8'));
const servedRaw = fs.readFileSync(SERVED, 'utf8');
const served = JSON.parse(servedRaw);
const entries = tracked.entries;

check('35 skill entries in the vocabulary', entries.length === 35, entries.length);

// L1br.0 asserts served == tracked; a lap that writes one and forgets the other blocks promotion.
check('served copy is identical to the tracked source (L1br.0)',
  JSON.stringify(served) === JSON.stringify(tracked));

const bare = entries.filter(function (e) { return !e.description || !String(e.description).trim(); })
  .map(function (e) { return e.id; });
check('every one of the 35 carries a non-empty description (was 0 of 35)', bare.length === 0, bare);

// A description that is technically present but useless would pass the check above. These are
// explanations for a new player, and the shipped set runs 115-169 characters.
// copy-voice-sweep-build ADDENDUM 6 R-CVB-11 (D-289): the floor moves 40 → 20 for the approved quick-build lines (shortest coercion 25)
const tooShort = entries.filter(function (e) { return String(e.description).trim().length < 20; })
  .map(function (e) { return { id: e.id, len: String(e.description).trim().length }; });
check('no description is a stub (>= 20 chars; R-CVB-11, D-289)', tooShort.length === 0, tooShort);

// Born-clean (R-CVS-2): no FFG page-reference or "see page" residue may enter a registry.
const refLeak = entries.filter(function (e) { return /\bp\.\s?\d+|see page|\bpg\.\s?\d+/i.test(e.description); })
  .map(function (e) { return e.id; });
check('no page-reference residue in any description (R-CVS-2 born clean)', refLeak.length === 0, refLeak);

// C-F58-1 (ruling `f58-skill-descriptions`): prose in `canonical/` carries its book reference. Every
// other authored prose field in the registries does; uncited prose was tolerable buried in a
// component file and is not tolerable here. Seeded from RULES_FOUNDATION_SKILLS.md's 35/35 by
// scripts/canonical/apply_skill_cites.py, which parses that table rather than retyping it.
const uncited = entries.filter(function (e) { return !e.cite || !String(e.cite).trim(); })
  .map(function (e) { return e.id; });
check('C-F58-1: no description without a source cite (all 35)', uncited.length === 0, uncited);

// R-EQW1: the cite names the OWNING book by its books.vocab label and uses PRINTED numbering, so a
// bare id ("eote p.113") or a missing page is a defect, not a style choice.
const bookLabels = new Set(
  (function () {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'schema/vocab/books.vocab.json'), 'utf8'));
    return (raw.entries || raw).map(function (b) { return b.label; });
  })());
const badCite = entries.filter(function (e) {
  const m = /^(.+) p\.(\d+)$/.exec(String(e.cite || ''));
  return !m || !bookLabels.has(m[1]);
}).map(function (e) { return { id: e.id, cite: e.cite }; });
check('C-F58-1 / R-EQW1: every cite is "<books.vocab label> p.<printed page>"', badCite.length === 0, badCite);

// The cite must agree with `sources`, or the two drift and a reader believes whichever it reads first.
const bookById = (function () {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'schema/vocab/books.vocab.json'), 'utf8'));
  const m = {}; (raw.entries || raw).forEach(function (b) { m[b.id] = b.label; }); return m;
})();
const citeSourceMismatch = entries.filter(function (e) {
  const want = (e.sources || []).map(function (s) { return bookById[s]; });
  return want.length !== 1 || String(e.cite || '').indexOf(want[0]) !== 0;
}).map(function (e) { return { id: e.id, cite: e.cite, sources: e.sources }; });
check('C-F58-1: `cite` and `sources` name the same book', citeSourceMismatch.length === 0, citeSourceMismatch);

const dupes = {};
entries.forEach(function (e) {
  const k = String(e.description).trim();
  dupes[k] = (dupes[k] || []).concat(e.id);
});
const shared = Object.keys(dupes).filter(function (k) { return dupes[k].length > 1; }).map(function (k) { return dupes[k]; });
check('no two skills share the same description (copy-paste check)', shared.length === 0, shared);

// ── the move actually happened: the strings are OUT of the shipped bundle ────────────────────
// B-139 (ruling release-r7-bug-burndown ADDENDUM 426 §6): the shipped player code is app.js + creator.js + sheet.js since
// the split; the absence pin reads all three, or a description left in a chunk would pass unseen.
const bundlePaths = ['player/app.js', 'player/creator.js', 'player/sheet.js'].map((f) => path.join(root, f));
if (bundlePaths.some((f) => !fs.existsSync(f))) {
  check('player/app.js, creator.js and sheet.js exist (run `npm run build` first — the browser runs the BUILT bundle)', false);
} else {
  const bundle = bundlePaths.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  // String literals survive minification, so this is a valid bundle assertion (R-B55-1).
  const stillInCode = entries.filter(function (e) {
    // compare on the first clause, long enough to be unique and free of quote-escaping differences
    const probe = String(e.description).split('.')[0].trim();
    return probe.length > 20 && bundle.indexOf(probe) !== -1;
  }).map(function (e) { return e.id; });
  check('ZERO of the 35 descriptions appear in the built bundle (the hardcoded map is gone)',
    stillInCode.length === 0, stillInCode);
  // The loader must expose the map the render sites read. Property names survive minification.
  check('the built bundle builds `skillDescs` from the vocabulary', bundle.indexOf('skillDescs') !== -1);
  // B-54 rides this lap: the unresolvable-spec label must be the project's established vocabulary.
  // RE-POINTED (N-post, lap paper-sheet-delete step 4, 2026-09-30): the `(unknown specialization)` label
  // lived only on the old sheet's ADVANCEMENT tab, deleted. The paper growth room's unresolved row names it
  // `Specialization` and refuses it `Unavailable` — asserted at source below. KEPT: the label is in the
  // bundle. DROPPED: the old face's wording.
  check('B-54: the bundle carries the paper growth room\'s unresolved-spec refusal',
    bundle.indexOf('{className:"sb-refuse"},"Unavailable")') !== -1);
}

// ── the source of truth is the registry, not app.jsx ────────────────────────────────────────
const app = fs.readFileSync(path.join(root, 'player/app.jsx'), 'utf8');
check('FC_SKILL_DESC is not declared in player/app.jsx any more',
  !/var\s+FC_SKILL_DESC\s*=/.test(app));
check('no consumer reads a hardcoded skill-description map',
  !/FC_SKILL_DESC\s*\[/.test(app));

// B-54's other two claims, asserted at source: an unresolved spec is neither ACTIVE nor owned.
check('B-54: the unresolved branch is computed once and reused (an `unresolved` flag exists)',
  /var\s+unresolved\s*=\s*!rec;/.test(app));
// RE-POINTED (same lap): the claim before — the old tab's state chip can read `unavailable`. After — the
// paper growth room's row refuses an unresolved spec in words (`Unavailable`), is marked refused, and never
// becomes the active tree (its click is a no-op). KEPT: never ACTIVE nor owned. DROPPED: the chip's word.
check('B-54: the paper row refuses an unresolved spec (`Unavailable`), marks it refused, never activates it',
  /\{unresolved \? <span className="sb-refuse">Unavailable<\/span>/.test(app) &&
  /data-refused=\{unresolved \? '1' : undefined\}/.test(app) &&
  /onClick=\{function\(\) \{ if \(!unresolved\) \{ setActiveSpecId/.test(app));

console.log('');
if (failures) { console.error('skill_descriptions guard: ' + failures + ' FAILED'); process.exit(1); }
console.log('skill_descriptions guard: ALL PASS');
