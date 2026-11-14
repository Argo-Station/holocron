#!/usr/bin/env node
/**
 * argo_dice_font.cjs — STANDING guard: step 4's T1 and T3 (ruling argo-a1-export ADDENDUM 6, D-510; the approved drawing
 * Docs/mockups/argo-public-step4.html @ d6b9f3286).
 *
 *   P   THE ONE FONT-ABSENT PROBE (SWRPGSources.diceFontProbe), in a sandbox with a stub fetch:
 *       a 404 turns the fallback ON; an abort (rejected fetch), a 500 and a 200 leave it OFF; each font file is asked
 *       for once per page (a second call fetches nothing); at 'included' (holocron.work) nothing is fetched and it is OFF.
 *   T1  removedCellLine — the narrow cell's ONE book: Stalker → its page's book "Age of Rebellion Core Rulebook p.157"
 *       (not the first listed); Outdoorsman → "Edge of the Empire Core Rulebook p.141"; a record with books but no page
 *       → the first book's title; Beast of Burden (cites nothing) → ''; at 'included' → null.
 *   K   the PDF's word kit (player/app.jsx pdfWordKit, sliced): a die run collapses to its count and short name, in the
 *       runs' order, dice side by side joined " · " ("1 Pr · 2 Ab"), a result reads as its word ("2 advantage"), and the
 *       key line is the drawn one, given only once a die printed as words.
 *   BITE (in process): a probe that turns on for any failed status reds P's 500 leg; a cell line that takes the first
 *       listed book reds T1's Stalker leg.
 *
 * Run: node test/argo_dice_font.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let failures = 0;
const check = (ok, m, detail) => { if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/sources.js'), 'utf8');
const T = J('talents.json').talents;

function load(content, answer, src) {
  const b = { module: { exports: {} }, console: { warn() {} }, Promise }; b.window = b;
  b.SWRPGTextHash = { bookContent: () => content };
  b.asked = [];
  b.fetch = (u) => { b.asked.push(u); return answer === 'abort' ? Promise.reject(new Error('aborted')) : Promise.resolve({ status: answer, ok: answer === 200 }); };
  vm.createContext(b); vm.runInContext(src || SRC, b);
  b._swrpgSourcesIndex = b.module.exports.buildIndex(J('books.vocab.json'));
  return b;
}
async function probe(content, answer, src) {
  const b = load(content, answer, src), S = b.module.exports;
  const first = await S.diceFontProbe();
  const n = b.asked.length;
  await S.diceFontProbe();
  return { on: S.diceFontAbsent(), first, asked: n, again: b.asked.length - n };
}

(async () => {
  const p404 = await probe('removed', 404), pAbort = await probe('removed', 'abort'), p500 = await probe('removed', 500),
    p200 = await probe('removed', 200), pHolo = await probe('included', 404);
  check(p404.on === true && p404.asked === 2 && p404.again === 0, 'P a 404 turns the fallback ON; the two font files asked once per page', p404);
  check(pAbort.on === false && p500.on === false && p200.on === false, 'P an abort, a 500 and a 200 leave it OFF', [pAbort.on, p500.on, p200.on]);
  check(pHolo.on === false && pHolo.asked === 0, "P at 'included' (holocron.work) nothing is fetched and it is OFF", pHolo);

  const R = load('removed', 200).module.exports, H = load('included', 200).module.exports;
  const t1 = [['stalker', R.removedCellLine(T.stalker), 'Age of Rebellion Core Rulebook p.157'],
    ['outdoorsman', R.removedCellLine(T.outdoorsman), 'Edge of the Empire Core Rulebook p.141'],
    ['no page', R.removedCellLine({ sources: ['eote', 'aor'] }), 'Edge of the Empire Core Rulebook'],
    ['beast_of_burden', R.removedCellLine(T.beast_of_burden), ''],
    ['holocron', H.removedCellLine(T.stalker), null]].filter((r) => r[1] !== r[2]).map((r) => r[0] + ': ' + JSON.stringify(r[1]));
  check(!t1.length, "T1 the cell's ONE book carrying the page; the first title without one; '' with none; null on holocron", t1);

  // K: pdfWordKit and its key line, sliced out of player/app.jsx and run over a stub body font
  const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const a = app.indexOf('var PDF_DICE_KEY_LINE'), z = app.indexOf('\n}\n', app.indexOf('function pdfWordKit')) + 3;
  const kb = { pdfEncodable: (f, t) => t }; vm.createContext(kb);
  vm.runInContext(app.slice(a, z) + '\nthis.pdfWordKit = pdfWordKit; this.KEY = PDF_DICE_KEY_LINE;', kb);
  const D = { PDF_ABBR: { proficiency: 'Pr', ability: 'Ab', boost: 'Bo', challenge: 'Ch', difficulty: 'Di', setback: 'Se', force: 'Fo' },
    dieWord: (k, c) => (c ? c + ' ' : '') + k };
  const body = { widthOfTextAtSize: (t, s) => String(t).length * s };
  const kit = kb.pdfWordKit(body, D), drawn = [], page = { drawText: (t) => drawn.push(t) };
  const keyBefore = kit.keyLine();
  const runs = [{ text: 'Roll ' }, { sym: 'proficiency' }, { sym: 'ability' }, { sym: 'ability' }, { text: ', spend ' }, { sym: 'advantage' }, { sym: 'advantage' }];
  kit.wrap(runs, 1000, 7).forEach((l) => kit.draw(page, l, 0, 0, 7));
  const line = drawn.join('');
  check(line === 'Roll 1 Pr · 2 Ab, spend 2 advantage', 'K a die run prints "count short-name" in order, joined " · "; a result as its word', line);
  check(keyBefore === '' && kit.keyLine() === 'Pr Proficiency · Ab Ability · Bo Boost · Ch Challenge · Di Difficulty · Se Setback · Fo Force',
    'K the drawn key line, given only once a die printed as words', [keyBefore, kit.keyLine()]);

  // BITES
  const PMUT = 'return r.status === 404;';
  const bp = await probe('removed', 500, SRC.replace(PMUT, 'return !r.ok;'));
  check(SRC.includes(PMUT) && bp.on === true, 'BITE a probe that turns on for any failed status reds the 500 leg', bp);
  const CMUT = 'var paged = cites.filter(function (c) { return pageWord(c.page); })[0];';
  const bc = load('removed', 200, SRC.replace(CMUT, 'var paged = cites[0];')).module.exports.removedCellLine(T.stalker);
  check(SRC.includes(CMUT) && bc !== 'Age of Rebellion Core Rulebook p.157', 'BITE a cell line taking the first listed book reds Stalker', bc);

  console.log(failures ? '\nFAIL ' + failures : '\nPASS');
  process.exit(failures ? 1 : 0);
})();
