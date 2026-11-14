#!/usr/bin/env node
/**
 * source_logic_predicates.cjs — B-336's LOGIC class: the questions that were being asked by
 * string-matching a book TITLE, and the sorts that depended on the answer.
 *
 * `f102-sources-facet-concept` A5 ruled shape (a): the five LOGIC sites land first, each with a
 * sort assertion red-before/green-after. This is that assertion, made permanent.
 *
 * THE DEFECT, and why it is the dangerous kind. Five consumers did not DISPLAY a source — they
 * interrogated it:
 *     glMap = { eote: 'Edge of the Empire', ... };  src.indexOf(glStr) >= 0       // "my line?"
 *     coreSources = ['Force and Destiny Core Rulebook', ...]; indexOf(s) >= 0     // "core book?"
 *     _allSrc.indexOf('Force and Destiny Core Rulebook')                          // "prefer F&D"
 * Every one asks something the book vocabulary answers on the row — `line`, `group`, `id`. The
 * title match only ever worked because every registry happened to store display titles. Under
 * B-336's key conversion it returns false for everything, and NOTHING SAYS SO: no error, no key on
 * screen, just careers and Force powers coming back in a worse order forever. A visible key is a
 * bug report; a silent re-sort is not.
 *
 * WHY THE PREDICATES MOVED TO lib/shared/sources.js: inline in a 22,000-line React file they could
 * not be called by any guard, so they were verified by eye once, on the day they were written, and
 * never again. That is a large part of why they stayed wrong. A predicate a test cannot reach is a
 * predicate nobody is checking.
 *
 * THE RED-BEFORE IS FROZEN INTO THIS FILE. `OLD_isMyLine` / `OLD_isCore` below are the shipped
 * implementations verbatim, so the comparison is against what actually ran rather than against a
 * description of it — and the assertion is a SORT, not a predicate call, because the sort order is
 * what a player sees.
 *
 * Run: node test/source_logic_predicates.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/sources.js'), 'utf8');
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/books.vocab.json'), 'utf8'));
const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + String(detail).slice(0, 300) : '')); }
}

function load(mutate) {
  const ctx = { window: {}, module: { exports: {} }, console: { log() {}, warn() {}, error() {} }, setTimeout };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(mutate ? mutate(SRC) : SRC, ctx);
  return ctx.window.SWRPGSources || ctx.module.exports;
}
const S = load(null);
const IDX = S.buildIndex(VOCAB);

// ── the shipped predicates, VERBATIM, as they were before this lap ───────────────────────────
function OLD_isMyLine(c, gameLine) {
  const glMap = { eote: 'Edge of the Empire', aor: 'Age of Rebellion', fad: 'Force and Destiny' };
  const glStr = glMap[gameLine] || '';
  const src = (c.sources && c.sources[0]) || '';
  return src.indexOf(glStr) >= 0 && !!glStr;
}
function OLD_isCore(rec) {
  const coreSources = ['Force and Destiny Core Rulebook', 'Edge of the Empire Core Rulebook', 'Age of Rebellion Core Rulebook'];
  return (rec.sources || []).some((s) => coreSources.indexOf(s) >= 0);
}

// Fixtures in BOTH forms. `TITLES` is what every registry holds today; `KEYS` is what B-336
// converts them to, registry by registry. Both must sort identically — that is the whole contract.
const asTitles = [
  { name: 'Ace', sources: ['Age of Rebellion Core Rulebook'] },
  { name: 'Bounty Hunter', sources: ['Edge of the Empire Core Rulebook'] },
  { name: 'Colonist', sources: ['Far Horizons'] },
  { name: 'Guardian', sources: ['Force and Destiny Core Rulebook'] },
];
const asKeys = [
  { name: 'Ace', sources: ['aor'] },
  { name: 'Bounty Hunter', sources: ['eote'] },
  { name: 'Colonist', sources: ['far_horizons'] },
  { name: 'Guardian', sources: ['fad'] },
];

// The sort under test, parameterised by the predicate — the same shape player/app.jsx runs.
function lineSort(list, pred) {
  const m = [], o = [];
  list.forEach((c) => (pred(c) ? m : o).push(c));
  return m.concat(o).map((c) => c.name);
}
function coreSort(list, pred) {
  return list.slice().sort((a, b) => {
    const ac = pred(a), bc = pred(b);
    if (ac !== bc) return ac ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).map((c) => c.name);
}

console.log('SOURCE LOGIC PREDICATES — B-336 LOGIC class (f102 A5)');
console.log('');

// ── SITE 1+2: the career game-line sort ──────────────────────────────────────────────────────
console.log('  SITE 1+2 — career game-line sort (app.jsx: the sorted useMemo + the divider index):');
{
  // A DELIBERATE BEHAVIOUR CHANGE, flagged in the gate rather than absorbed. The old title match
  // asked "does the source string contain 'Edge of the Empire'", which only ever matched the CORE
  // book. The vocabulary asks "is this source on the eote LINE", which is also true of every EotE
  // SUPPLEMENT — `far_horizons` has line 'eote'. So Colonist (Far Horizons) now groups with its
  // own game line, where before it fell to "other". That is what the sort's own comment says it
  // wants ("game-line-matching careers first"), so the change is a second latent bug fixed rather
  // than a regression — but it IS a change, and the first version of this test asserted the OLD
  // narrower order out of habit and failed. Recording the wider order as the expectation.
  const want = ['Bounty Hunter', 'Colonist', 'Ace', 'Guardian'];   // BOTH eote-line careers first
  check('    NEW predicate sorts TITLE-form correctly (today\'s data must not regress)',
    JSON.stringify(lineSort(asTitles, (c) => S.isFromLine(IDX, c, 'eote'))) === JSON.stringify(want),
    lineSort(asTitles, (c) => S.isFromLine(IDX, c, 'eote')));
  check('    NEW predicate sorts KEY-form correctly (what B-336 converts to)',
    JSON.stringify(lineSort(asKeys, (c) => S.isFromLine(IDX, c, 'eote'))) === JSON.stringify(want),
    lineSort(asKeys, (c) => S.isFromLine(IDX, c, 'eote')));
  // THE RED-BEFORE, in the same run: the shipped predicate against key-form.
  const oldOnKeys = lineSort(asKeys, (c) => OLD_isMyLine(c, 'eote'));
  check('    RED-BEFORE: the OLD title match MIS-SORTS key-form (every career reads as "other")',
    JSON.stringify(oldOnKeys) !== JSON.stringify(want), oldOnKeys);
  check('    ...and it did so SILENTLY — no throw, a full list, just the wrong order',
    oldOnKeys.length === 4);
}

// ── SITE 3+4: the force-power core-first sort ────────────────────────────────────────────────
console.log('');
console.log('  SITE 3+4 — force-power core-first sort (buildBasicForcePowerList):');
{
  // THE FIXTURE MUST MAKE core-first AND alphabetical DISAGREE, or the red-before passes by
  // coincidence. The first version used Enhance (core) + Misdirect (supplement): with the old
  // predicate both read as non-core, the sort fell through to alphabetical, and 'Enhance' sorts
  // before 'Misdirect' anyway — so a broken predicate produced the RIGHT order and the red-before
  // came out green. A test whose failure case accidentally looks like success proves nothing.
  // 'Bind' (supplement) vs 'Enhance' (core) inverts them: core-first says Enhance, alphabetical
  // says Bind.
  const powers = (src) => [
    { name: 'Bind', sources: [src === 'keys' ? 'nexus_of_power' : 'Nexus of Power'] },
    { name: 'Enhance', sources: [src === 'keys' ? 'fad' : 'Force and Destiny Core Rulebook'] },
  ];
  const want = ['Enhance', 'Bind'];   // core first — and alphabetical would say the opposite
  check('    NEW predicate: core-first holds on TITLE-form',
    JSON.stringify(coreSort(powers('titles'), (r) => S.hasCoreSource(IDX, r))) === JSON.stringify(want));
  check('    NEW predicate: core-first holds on KEY-form',
    JSON.stringify(coreSort(powers('keys'), (r) => S.hasCoreSource(IDX, r))) === JSON.stringify(want));
  const oldOnKeys = coreSort(powers('keys'), OLD_isCore);
  check('    RED-BEFORE: the OLD title list MIS-SORTS key-form (core stops leading)',
    JSON.stringify(oldOnKeys) !== JSON.stringify(want), oldOnKeys);
}

// ── SITE 5: the F&D source-label preference ──────────────────────────────────────────────────
console.log('');
console.log('  SITE 5 — the F&D label preference:');
{
  const pick = (arr) => {
    const i = arr.findIndex((s) => { const m = S.sourceMeta(IDX, s); return !!(m && m.id === 'fad'); });
    return i >= 0 ? arr[i] : (arr[0] || '');
  };
  check('    NEW: prefers the F&D entry in TITLE-form',
    pick(['Nexus of Power', 'Force and Destiny Core Rulebook']) === 'Force and Destiny Core Rulebook');
  check('    NEW: prefers the F&D entry in KEY-form',
    pick(['nexus_of_power', 'fad']) === 'fad');
  check('    RED-BEFORE: the OLD indexOf silently fell back to sources[0] on key-form',
    ['nexus_of_power', 'fad'].indexOf('Force and Destiny Core Rulebook') === -1);
}

// ── the sites actually delegate ──────────────────────────────────────────────────────────────
console.log('');
console.log('  THE SHIPPED SITES DELEGATE (a fixed core helps nobody if app.jsx still string-matches):');
{
  const code = APP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  check('    app.jsx calls isFromLine', /S\.isFromLine\(/.test(code));
  check('    app.jsx calls hasCoreSource', /hasCoreSource\(/.test(code));
  check('    no `indexOf(glStr)` title match survives in CODE', !/indexOf\(glStr\)/.test(code),
    (code.match(/[^\n]*indexOf\(glStr\)[^\n]*/) || [''])[0]);
  check('    no `coreSources` title list survives in CODE', !/coreSources\s*=/.test(code),
    (code.match(/[^\n]*coreSources\s*=[^\n]*/) || [''])[0]);
}

// ── THE BITE ─────────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('  THE BITE — mutants of the shared predicates must be caught:');
[
  ['isFromLine ignores `line`', (s) => s.replace("return !!(m && m.line === line);", "return !!m;")],
  ['hasCoreSource ignores `group`', (s) => s.replace("return !!(m && m.group === 'Core');", "return !!m;")],
  ['sourceMeta stops resolving', (s) => s.replace("var id = index.aliasToId && index.aliasToId[src];", "var id = null;")],
].forEach(([label, mut]) => {
  if (mut(SRC) === SRC) { failures += 1; console.error('  FAIL  mutant anchor not found: ' + label); return; }
  let caught = false, threw = null;
  try {
    const M = load(mut);
    const mi = M.buildIndex(VOCAB);
    const a = JSON.stringify(lineSort(asKeys, (c) => M.isFromLine(mi, c, 'eote')));
    const b = JSON.stringify(coreSort([
      { name: 'Bind', sources: ['nexus_of_power'] }, { name: 'Enhance', sources: ['fad'] },
    ], (r) => M.hasCoreSource(mi, r)));
    caught = a !== JSON.stringify(['Bounty Hunter', 'Colonist', 'Ace', 'Guardian'])
          || b !== JSON.stringify(['Enhance', 'Bind']);
  } catch (e) { threw = e.message; }
  check('    ' + label + ' IS caught by the sort (not by a crash)', caught && !threw,
    threw ? 'THREW: ' + threw : 'not detected');
});

console.log('');
console.log(failures ? 'FAILED (' + failures + ')' : 'OK — both forms sort identically, and the old title match provably did not.');
process.exit(failures ? 1 : 0);
