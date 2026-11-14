#!/usr/bin/env node
/* test/b336_cite_book_comparators.cjs — B-336's nested `cite.book`, shape (C) (ruling release-r7-bug-burndown ADDENDUM 62).
 *
 * A wave converts a record's `sources` AND its nested `cite.book` to vocabulary keys in one commit, and every comparator
 * resolves both sides, so a key, an alias, a title or a MIXED record all pass. A player's own record may still hold a title
 * on either side (the editor wrote titles), and a string-equal comparator would refuse it or drop its page silently.
 *   C2  the five comparators, each over a MIXED fixture (title one side, key the other), both directions:
 *       packValidate crossField L1cb.sig / L1cb.fp / L1cb.prv species, the editor's sigBooksOf, the app's fcMotivTiers.
 *       A NEGATIVE control per packValidate arm (a cite naming a book NOT in sources is still refused), so green is not
 *       vacuous; and a STRING-EQUAL mutant of each comparator reds its mixed fixture.
 *   C3  the homebrew leg: a user record whose cite.book is a TITLE beside key-form sources validates, and the editor still
 *       appends its page.
 *   C1  the two DISPLAY readers of cite.book (charResolve's held words, the app's sigHeldWords) print the TITLE of a key.
 *
 * Run: node test/b336_cite_book_comparators.cjs   Exit 0 all legs pass; 1 a leg failed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const VOCAB = JSON.parse(read('public/data/canonical/books.vocab.json'));

let failures = 0;
const check = (msg, ok, detail) => {
  if (ok) console.log('  PASS  ' + msg);
  else { failures++; console.log('  FAIL  ' + msg + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 300) : '')); }
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── the shared resolver, live, over the shipped vocabulary ─────────────────────────────────────────────────
function loadSources() {
  const ctx = { window: {}, module: { exports: {} }, console: { log() {}, warn() {}, error() {} }, setTimeout };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('lib/shared/sources.js'), ctx);
  return ctx.window.SWRPGSources || ctx.module.exports;
}
const S0 = loadSources();
const IDX = S0.buildIndex(VOCAB);
const SWRPGSources = Object.assign({}, S0, { current: () => ({ index: IDX }) });
const keyOf = (s) => IDX.aliasToId[s] || s;
const titleOf = (s) => S0.sourceLabel(IDX, s);

// ── packValidate, loaded with the resolver up (root = window) ────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b336-cb-'));
fs.copyFileSync(path.join(ROOT, 'lib/shared/textHash.js'), path.join(TMP, 'textHash.js'));
function loadPV(src, tag) {
  const f = path.join(TMP, 'packValidate.' + tag + '.js');
  fs.writeFileSync(f, src);
  global.window = { SWRPGSources };
  delete require.cache[f];
  const PV = require(f);
  delete global.window;
  return PV.create(PV.readSchemaDir(path.join(ROOT, 'schema')));
}
const PV_SRC = read('lib/shared/packValidate.js');
const V = loadPV(PV_SRC, 'live');
const BOOKIN_RESOLVING = '      if (srcs.indexOf(book) !== -1) return true;\n      var k = bookIdOf(book);\n      return srcs.some(function (x) { return typeof x === \'string\' && bookIdOf(x) === k; });';
const PV_MUT = PV_SRC.replace(BOOKIN_RESOLVING, '      return srcs.indexOf(book) !== -1;');
check('C2 the packValidate string-equal mutant anchor is found (bookIn resolves)', PV_MUT !== PV_SRC);
const VM = loadPV(PV_MUT, 'mutant');

const citeMsgs = (Vx, section, rec) => Vx.crossField(section, rec).filter((c) => /cite book/.test(c.msg));

// every cite object under a record (the arms' own paths: nodes/abilities, their rows, special abilities)
function cites(node, out) {
  if (Array.isArray(node)) node.forEach((x) => cites(x, out));
  else if (node && typeof node === 'object') {
    if (node.cite && typeof node.cite === 'object' && typeof node.cite.book === 'string') out.push(node.cite);
    Object.keys(node).forEach((k) => { if (k !== 'cite') cites(node[k], out); });
  }
  return out;
}
const firstWithCites = (reg, coll) => {
  const d = JSON.parse(read('public/data/canonical/' + reg + '.json'))[coll];
  const recs = Array.isArray(d) ? d : Object.values(d);
  return recs.find((r) => Array.isArray(r.sources) && r.sources.length && cites({ x: r.abilities || r.special_abilities || r.option_choices }, []).length);
};
const ARMS = [
  ['signature_abilities', firstWithCites('signature_abilities', 'signature_abilities')],
  ['force_powers', firstWithCites('force_powers', 'force_powers')],
  ['species', firstWithCites('species', 'species')],
];
const NOT_A_SOURCE = 'savage_spirits';

for (const [section, rec] of ARMS) {
  check(`C2 ${section}: a fixture record with nested cites exists`, !!rec);
  if (!rec) continue;
  const id = rec.id;
  // MIXED 1: sources as KEYS, cite.book as TITLES (the homebrew shape after a wave, C3)
  const m1 = clone(rec); m1.sources = m1.sources.map(keyOf); cites(m1, []).forEach((c) => { c.book = titleOf(c.book); });
  // MIXED 2: sources as TITLES, cite.book as KEYS
  const m2 = clone(rec); m2.sources = m2.sources.map(titleOf); cites(m2, []).forEach((c) => { c.book = keyOf(c.book); });
  // CONVERTED: both keys (the wave's normal form)
  const kk = clone(rec); kk.sources = kk.sources.map(keyOf); cites(kk, []).forEach((c) => { c.book = keyOf(c.book); });
  const n = cites(m1, []).length;
  check(`C2 ${section} ${id}: the shipped record passes (${n} cite(s))`, citeMsgs(V, section, rec).length === 0, citeMsgs(V, section, rec));
  check(`C3 ${section} ${id}: key sources + TITLE cite.book validate (the homebrew leg)`, citeMsgs(V, section, m1).length === 0, citeMsgs(V, section, m1));
  check(`C2 ${section} ${id}: title sources + KEY cite.book validate`, citeMsgs(V, section, m2).length === 0, citeMsgs(V, section, m2));
  check(`C2 ${section} ${id}: both keys validate (the wave's form)`, citeMsgs(V, section, kk).length === 0, citeMsgs(V, section, kk));
  // every cite moved off the record's books: some are ones the arm does not check (a record-level cite), so all move
  const neg = clone(kk);
  const other = neg.sources.indexOf(NOT_A_SOURCE) === -1 ? NOT_A_SOURCE : VOCAB.entries.map((e) => e.id).find((k) => neg.sources.indexOf(k) === -1);
  cites(neg, []).forEach((c) => { c.book = other; });
  check(`C2 ${section} ${id}: NEGATIVE — a cite naming a book outside sources is still refused`, citeMsgs(V, section, neg).length >= 1);
  check(`C2 ${section} ${id}: the STRING-EQUAL mutant reds the mixed fixture`, citeMsgs(VM, section, m1).length >= 1, 'mutant passed it');
}

// ── extracted functions (JSX files are read as text; the functions themselves are plain JS) ─────────────────
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('no function ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
function runFns(srcs, call) {
  const ctx = { window: { SWRPGSources }, out: null };
  vm.createContext(ctx);
  vm.runInContext(srcs.join('\n') + '\nout = (' + call + ');', ctx);
  return ctx.out;
}

// sigBooksOf (lib/editor/view.jsx)
const ED = read('lib/editor/view.jsx');
const ED_FNS = ['bookLabel', 'booksOf', 'sigBooksOf'].map((n) => extractFn(ED, n));
const SIG_EQ = "(c.book === s0 || bookLabel(c.book) === bookLabel(s0))";
const ED_MUT = ED_FNS.map((f) => f.replace(SIG_EQ, '(c.book === s0)'));
check('C2 sigBooksOf: the string-equal mutant anchor is found', ED_MUT[2] !== ED_FNS[2]);
const sigRec = (src, book) => JSON.stringify({ sources: [src], cite: { book: book, page: 39 } });
const p1 = runFns(ED_FNS, `sigBooksOf(${sigRec('fly_casual', 'Fly Casual')})`);
check('C3 sigBooksOf: key source + TITLE cite still appends its page ("Fly Casual · p. 39")', JSON.stringify(p1) === JSON.stringify(['Fly Casual · p. 39']), p1);
const p2 = runFns(ED_FNS, `sigBooksOf(${sigRec('Fly Casual', 'fly_casual')})`);
check('C2 sigBooksOf: title source + KEY cite appends its page', JSON.stringify(p2) === JSON.stringify(['Fly Casual · p. 39']), p2);
const p3 = runFns(ED_FNS, `sigBooksOf(${sigRec('fly_casual', 'savage_spirits')})`);
check('C2 sigBooksOf: NEGATIVE — a cite of another book appends no page', JSON.stringify(p3) === JSON.stringify(['Fly Casual']), p3);
const pm = runFns(ED_MUT, `sigBooksOf(${sigRec('fly_casual', 'Fly Casual')})`);
check('C2 sigBooksOf: the STRING-EQUAL mutant drops the page on the mixed fixture', JSON.stringify(pm) === JSON.stringify(['Fly Casual']), pm);

// fcMotivTiers (player/app.jsx)
const APP = read('player/app.jsx');
const MOT_FNS = ['fcMotivLineBook', 'fcMotivTiers'].map((n) => extractFn(APP, n));
const MOT_EQ = 'return s === book || _labelOf(s) === book;';
const MOT_MUT = MOT_FNS.map((f) => f.replace(MOT_EQ, 'return s === book;'));
check('C2 fcMotivTiers: the string-equal mutant anchor is found', MOT_MUT[1] !== MOT_FNS[1]);
const cats = JSON.stringify([
  { id: 'k', name: 'Keyed', sources: ['eote'] },
  { id: 't', name: 'Titled', sources: ['Edge of the Empire Core Rulebook'] },
  { id: 'x', name: 'Other', sources: ['aor'] },
]);
const trioIds = (fns) => runFns(fns, `(fcMotivTiers(${cats}, 'eote', null).tiers[0] || {cats: []}).cats.map(function (c) { return c.id; }).sort().join(',')`);
check('C2 fcMotivTiers: a KEY-form and a TITLE-form category both join the line\'s trio', trioIds(MOT_FNS) === 'k,t', trioIds(MOT_FNS));
check('C2 fcMotivTiers: the STRING-EQUAL mutant drops the key-form one', trioIds(MOT_MUT) === 't', trioIds(MOT_MUT));

// C1: the two DISPLAY readers
const HW = runFns([extractFn(APP, 'gameLineTitle').replace(/FC_GAME_LINES/g, '[]'), extractFn(APP, 'gameLineBookLabel'), extractFn(APP, 'sigHeldWords')],
  `sigHeldWords({ sources: ['fly_casual'], cite: { book: 'fly_casual', page: 39 } }).cell`);
check('C1 sigHeldWords prints the TITLE of a key ("cost unverified — Fly Casual p.39")', HW === 'cost unverified — Fly Casual p.39', HW);
const CR = read('lib/shared/charResolve.js');
const CRL = runFns(['var root = window;', extractFn(CR, 'bookLabelOf')], `bookLabelOf('fly_casual')`);
check('C1 charResolve bookLabelOf prints the TITLE of a key', CRL === 'Fly Casual', CRL);
check('C1   and the held words go through it', /var book = bookLabelOf\(\(rec\.cite && rec\.cite\.book\)/.test(CR));

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failures ? `FAILED (${failures})` : 'OK — every cite.book comparator resolves both sides, and its displays print titles.');
process.exit(failures ? 1 : 0);
