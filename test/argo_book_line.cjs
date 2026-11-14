#!/usr/bin/env node
/**
 * argo_book_line.cjs — STANDING guard: S1's ONE "book + printed page" formatter (ruling argo-a1-curation ADDENDUM 4 S1;
 * argo-a1-export ADDENDUM 1 item 5; the approved drawing Docs/mockups/argo-public-book-line.html, D-504; B-1809).
 *
 *   F   the formatter over the drawing's real records, against the drawn words:
 *       F1/F2 talent blooded → "Edge of the Empire Core Rulebook p.132 · Age of Rebellion Core Rulebook · Unlimited Power"
 *       (the page from its rows' cites, the other books by title); F4 weapon 12_defender → "Far Horizons p.40" (its
 *       `_book_page`); F7 npc 000 → "Allies and Adversaries" (a `source` title, no page); F9 talent beast_of_burden → ""
 *       (no book: the slot collapses). A cite string "eote p.206" → "Edge of the Empire Core Rulebook p.206".
 *   W   pageWord / pageCite: 'p.N', '<title> p.N', the title alone without a page, '' without a title.
 *   C   B-1809 stays answered: no app source outside lib/shared/sources.js writes `' p.' +` (or `' · p.' +`) itself.
 *       The two cites m6ResolveGear stores as strings ('eote p.205', 'eote p.154-157') are data, not concatenation.
 *   S2  removedLine(rec, cites) in a sandbox: at 'removed', blooded's told row's own cite → "Edge of the Empire Core
 *       Rulebook p.132" (mockup F2's told line); no cite → the record's line; neither → ''; at 'included' → null (holocron).
 *   BITE (in process): pageCite answering without the page → F1 and F4 red.
 *
 * Run: node test/argo_book_line.cjs
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'lib/shared/sources.js'));
let failures = 0;
const check = (ok, m, detail) => { if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const ix = S.buildIndex(J('books.vocab.json'));
const T = J('talents.json').talents, W = J('weapons.json').weapons, N = J('npcs.json');
const npcs = N.npcs || N;

function legF(tag) {
  const got = {
    f1: S.bookLine(ix, T.blooded), f4: S.bookLine(ix, W['12_defender']), f7: S.bookLine(ix, npcs['000']),
    f9: S.bookLine(ix, T.beast_of_burden), str: S.bookLine(ix, ['eote p.206']),
  };
  const want = {
    f1: 'Edge of the Empire Core Rulebook p.132 · Age of Rebellion Core Rulebook · Unlimited Power', f4: 'Far Horizons p.40',
    f7: 'Allies and Adversaries', f9: '', str: 'Edge of the Empire Core Rulebook p.206',
  };
  return Object.keys(want).filter((k) => got[k] !== want[k]).map((k) => tag + k + ': ' + JSON.stringify(got[k]));
}
const fBad = legF('');
check(!fBad.length, 'F the drawn records give the drawn lines (F1/F2, F4, F7, F9, a cite string)', fBad);

check(S.pageWord(132) === 'p.132' && S.pageWord(null) === '' && S.pageCite('Far Horizons', 40) === 'Far Horizons p.40'
  && S.pageCite('Far Horizons') === 'Far Horizons' && S.pageCite('', 3) === '' && S.pageCite('EotE', '154-157') === 'EotE p.154-157',
  'W pageWord / pageCite: p.N · <title> p.N · title alone · nothing without a title');

const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const app = ['player', 'gm', 'lib', 'dice'].flatMap(walk).filter((f) => /\.(jsx|mjs)$/.test(f) || (/\.js$/.test(f) && !fs.existsSync(path.join(ROOT, f + 'x')) && !/player\/|gm\//.test(f)));
const CONCAT = /['"] (?:· )?p\.['"]\s*\+/;
const concat = app.filter((f) => f !== path.join('lib', 'shared', 'sources.js'))
  .flatMap((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l, i) => (CONCAT.test(l) ? f + ':' + (i + 1) : null)).filter(Boolean));
check(app.length > 50 && !concat.length, 'C no app source of ' + app.length + ' concatenates a page itself (B-1809)', concat);

// BITE: a copy of sources.js whose pageCite drops the page, loaded in a sandbox → the drawn lines with a page go red.
const vm = require('vm');
const src = fs.readFileSync(path.join(ROOT, 'lib/shared/sources.js'), 'utf8');
const MUT = "return t ? (w ? t + ' ' + w : t) : '';";
const sb = { module: { exports: {} } }; sb.window = sb;
vm.createContext(sb);
vm.runInContext(src.replace(MUT, "return t ? t : '';"), sb);
const M = sb.module.exports, mix = M.buildIndex(J('books.vocab.json'));
const bite = [['f1', M.bookLine(mix, T.blooded), 'Edge of the Empire Core Rulebook p.132 · Age of Rebellion Core Rulebook · Unlimited Power'],
  ['f4', M.bookLine(mix, W['12_defender']), 'Far Horizons p.40']].filter((r) => r[1] !== r[2]).map((r) => r[0]);
check(src.includes(MUT) && bite.length === 2, 'BITE pageCite without the page reds F1 and F4', bite);

// S2: the told row's line, in a sandbox whose SWRPGTextHash answers the copy's book content
function s2At(content) {
  const b = { module: { exports: {} } }; b.window = b;
  b.SWRPGTextHash = { bookContent: () => content };
  vm.createContext(b); vm.runInContext(src, b);
  b._swrpgSourcesIndex = b.module.exports.buildIndex(J('books.vocab.json'));
  return b.module.exports;
}
const R = s2At('removed'), H = s2At('included'), row = (T.blooded.told || [])[0] || {};
const s2 = [['row', R.removedLine(T.blooded, [row.cite]), 'Edge of the Empire Core Rulebook p.132'],
  ['rec', R.removedLine(T.blooded, [null]), 'Edge of the Empire Core Rulebook p.132 · Age of Rebellion Core Rulebook · Unlimited Power'],
  ['none', R.removedLine(null, [null]), ''], ['holocron', H.removedLine(T.blooded, [row.cite]), null]]
  .filter((r) => r[1] !== r[2]).map((r) => r[0] + ': ' + JSON.stringify(r[1]));
check(!s2.length, "S2 removedLine(rec, cites): the told row's cite first, else the record, '' with neither, null on holocron", s2);

console.log(failures ? 'argo_book_line: ' + failures + ' FAIL' : 'argo_book_line: ALL PASS');
process.exit(failures ? 1 : 0);
