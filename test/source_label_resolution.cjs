#!/usr/bin/env node
/**
 * source_label_resolution.cjs — F-102 A3: a source string must RENDER, in every form it takes.
 *
 * THE DEFECT THIS EXISTS FOR, and it was invisible for as long as the data stayed uniform.
 * `buildIndex` mapped a book's ALIASES to its id and never mapped the id to ITSELF, so
 * `aliasToId['far_horizons']` was undefined and any consumer resolving a source string fell
 * through to printing the raw key. Nothing complained, because every registry held display TITLES
 * and titles are aliases. It would have surfaced the moment B-332 wrote key-form sources into
 * weapons: the store's cite plate would have read "SOURCE · FAR_HORIZONS".
 *
 * It also read as fine to a spot-check: THREE of the 67 vocabulary entries (eote, aor, fad) do
 * list their own id among their aliases, and those three are exactly the ones anyone would test
 * first. This guard therefore asserts ALL 67, not a sample.
 *
 * WHY BOTH FORMS MUST WORK AT ONCE (and why this is not a transitional kludge): B-336 converts
 * 2,473 display-title entries to keys REGISTRY BY REGISTRY. For the whole of that program a
 * `sources` array can legitimately hold a key, a title, or both, and every one has to render. A
 * resolver that understood only keys would blank the registries not yet converted.
 *
 * HIDDEN SOURCE CODES (BOOKS-1b D2 — aorbeta, fadbeta) have no vocab row BY DESIGN: beta content
 * is invisible to the active-sources filter on purpose. They must come back AS-IS — mapping one to
 * a release book would falsify a record's provenance, and blanking it would hide a citation the
 * data legitimately carries.
 *
 * Run: node test/source_label_resolution.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/sources.js'), 'utf8');
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/books.vocab.json'), 'utf8'));
const STORE = fs.readFileSync(path.join(ROOT, 'lib/store/view.jsx'), 'utf8');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + String(detail).slice(0, 300) : '')); }
}

function load(mutate) {
  const src = mutate ? mutate(SRC) : SRC;
  const ctx = { window: {}, module: { exports: {} }, console: { log() {}, warn() {}, error() {} },
                setTimeout, fetch: undefined, localStorage: undefined };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.SWRPGSources || ctx.module.exports;
}

const S = load(null);
const idx = S.buildIndex(VOCAB);

console.log('SOURCE LABEL RESOLUTION — F-102 A3');
console.log('');

// ── leg 1: the identity mapping, over ALL 67 entries ─────────────────────────────────────────
const unresolved = VOCAB.entries.filter((e) => S.sourceLabel(idx, e.id) !== e.label);
check('every vocab id resolves to its own label (all ' + VOCAB.entries.length + ', not a sample)',
  unresolved.length === 0, unresolved.slice(0, 6).map((e) => e.id).join(', '));
check('  including the 64 that do NOT list their own id in aliases',
  VOCAB.entries.filter((e) => !(e.aliases || []).includes(e.id))
    .every((e) => S.sourceLabel(idx, e.id) === e.label));

// ── leg 2: display titles keep working through B-336's transition ────────────────────────────
const titleBroken = VOCAB.entries.filter((e) => e.label && S.sourceLabel(idx, e.label) !== e.label);
check('every display TITLE still resolves (the un-converted registries keep rendering)',
  titleBroken.length === 0, titleBroken.slice(0, 6).map((e) => e.label).join(', '));

// ── leg 3: hidden codes come back as-is ──────────────────────────────────────────────────────
const hidden = VOCAB.hidden_source_codes || [];
check('hidden source codes exist in the vocabulary (BOOKS-1b D2)', hidden.length > 0, hidden);
hidden.forEach((c) => check('  hidden code ' + JSON.stringify(c) + ' returns AS-IS (never mapped, never blanked)',
  S.sourceLabel(idx, c) === c, S.sourceLabel(idx, c)));

// ── leg 4: nothing ever blanks ───────────────────────────────────────────────────────────────
check('an unmapped string passes through rather than blanking',
  S.sourceLabel(idx, 'not_a_real_book') === 'not_a_real_book');
check('a null index degrades to the raw string (vocab still loading)',
  S.sourceLabel(null, 'Far Horizons') === 'Far Horizons');
check('empty / non-string input yields empty, never "undefined"',
  S.sourceLabel(idx, '') === '' && S.sourceLabel(idx, null) === '' && S.sourceLabel(idx, 7) === '');

// ── leg 5: the store's cite plate actually uses it ───────────────────────────────────────────
check('store cite plate maps through citeLabel (not a raw join)',
  // RE-POINTED, B-1688: the dark plate went; the paper plate is `PaperSource`'s `src`. KEEPS the claim. DROPS `it.sources`.
  /src\.map\(citeLabel\)\.join/.test(STORE),
  (STORE.match(/src\.[^\n]*join[^\n]*/) || ['(no cite plate line found)'])[0]);
check('  and citeLabel delegates to the SHARED resolver, not a local reimplementation',
  /function citeLabel[\s\S]{0,400}SWRPGSources[\s\S]{0,200}sourceLabel/.test(STORE));
// Comments and string literals are stripped first. The un-stripped version failed on this very
// file's own explanation of the defect ("It used to read `it.sources.join(...)`") — a scanner that
// cannot tell code from the comment describing the code is red for the wrong reason forever, which
// is the same lesson test/b314_detector.cjs records.
const STORE_CODE = STORE
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
check('  no raw `sources.join` survives in the store CODE (comments stripped)',
  !/\bsources\.join\(/.test(STORE_CODE),
  (STORE_CODE.match(/[^\n]*sources\.join\([^\n]*/) || [''])[0]);

// ── leg 6: THE BITE ──────────────────────────────────────────────────────────────────────────
console.log('');
console.log('  THE BITE — mutants must be caught, by comparison and not by a crash:');
{
  // THE IDENTITY MAPPING IS NOW BELT-AND-BRACES, AND THIS BITE HAD TO CHANGE TO SAY SO.
  // F-102 A4 put every id into its own `aliases` in books.vocab.json, which fixed all seven
  // alias-only indexes at once. A happy consequence is that the alias loop now covers the id — so
  // removing `aliasToId[e.id] = e.id` against the CURRENT vocabulary changes nothing, and this
  // mutant stopped being caught. It went green while proving nothing, which is the vacuous-bite
  // family again, in this file, one ruling later.
  //
  // The mapping still earns its place: it is what holds if the VOCABULARY regresses. So the mutant
  // now runs against a vocabulary with the self-aliases stripped — the shape that blinded six
  // indexes — where the code-level mapping is genuinely load-bearing. Both halves are asserted:
  // with a healthy vocab the mapping is redundant (and L1bk.selfalias is what guards that), and
  // with a regressed one the mapping alone still resolves every id.
  const REGRESSED = JSON.parse(JSON.stringify(VOCAB));
  REGRESSED.entries.forEach((e) => { e.aliases = (e.aliases || []).filter((a) => a !== e.id); });

  const healthy = load(null);
  check('    with a healthy vocab the identity mapping is redundant (A4 made it so)',
    REGRESSED.entries.length > 0 &&
    VOCAB.entries.every((e) => healthy.sourceLabel(healthy.buildIndex(VOCAB), e.id) === e.label));
  check('    and it ALONE still resolves every id against a REGRESSED vocab',
    VOCAB.entries.every((e) => healthy.sourceLabel(healthy.buildIndex(REGRESSED), e.id) === e.label));

  const mut = (s) => s.replace('      aliasToId[e.id] = e.id;', '      /* identity mapping removed by mutant */');
  if (mut(SRC) === SRC) { failures += 1; console.error('  FAIL  identity-mapping mutant anchor not found'); }
  else {
    let caught = false, threw = null;
    try {
      const M = load(mut);
      const mi = M.buildIndex(REGRESSED);
      caught = VOCAB.entries.some((e) => M.sourceLabel(mi, e.id) !== e.label);
    } catch (e) { threw = e.message; }
    check('    removing it IS caught against a regressed vocab (the case it defends)',
      caught && !threw, threw ? 'THREW: ' + threw : 'not detected');
  }
}
{
  // The store mutant is a source check, so it is applied to the text and re-tested the same way.
  const reverted = STORE.replace('src.map(citeLabel).join', 'src.join');
  check('    reverting the cite plate to a raw join IS caught',
    reverted !== STORE && !/src\.map\(citeLabel\)\.join/.test(reverted));
}
{
  // And the inverse: a resolver that blanks unknown strings would pass leg 1 and break the
  // transition, so prove the fallback is load-bearing.
  const mut = (s) => s.replace("    return src;   // display title (pre-B-336), hidden code, or an unmapped string — never blank",
                              "    return '';");
  if (mut(SRC) === SRC) { failures += 1; console.error('  FAIL  fallback mutant anchor not found'); }
  else {
    let caught = false, threw = null;
    try {
      const M = load(mut);
      const mi = M.buildIndex(VOCAB);
      caught = (M.sourceLabel(mi, 'not_a_real_book') !== 'not_a_real_book')
            || hidden.some((c) => M.sourceLabel(mi, c) !== c);
    } catch (e) { threw = e.message; }
    check('    a resolver that BLANKS unknown strings IS caught (hidden codes + transition)',
      caught && !threw, threw ? 'THREW: ' + threw : 'not detected');
  }
}

console.log('');
console.log(failures ? 'FAILED (' + failures + ')' : 'OK — keys, titles and hidden codes all render, and the store uses the one resolver.');
process.exit(failures ? 1 : 0);
