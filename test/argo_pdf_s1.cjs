#!/usr/bin/env node
/**
 * argo_pdf_s1.cjs — STANDING guard: S4, the PDF's ability lines (ruling argo-a1-curation ADDENDUM 4 S4; argo-a1-export
 * ADDENDUM 1 item 5; mockup F10, D-504). The exporters write each ability's S1 line where its text is removed.
 *
 *   P1  pdfS1Words (player/app.jsx, sliced with sheetBookLineOf, over the real sources.js and registries): at 'removed' a
 *       talent with no words → its book line (blooded → the drawn F1 line); a Force power and a signature entry the same
 *       through their registries; text on file → the text, untouched.
 *   P2  at 'included' (holocron.work): text → the text; no text → '' (exactly the exporters' old `x || ''`).
 *   P3  every ability write in generateFFGPdf and generateCustomPdf goes through pdfS1Words: the talents box and page,
 *       the signature entries, the species abilities and the Force powers (no bare `t.description` / `e.words` /
 *       `a.description` / `fp.description` read left in either exporter's ability writes).
 *   BITE (in process): a pdfS1Words that returns `text || ''` (the exporters' old read) → P1 red.
 *
 * Run: node test/argo_pdf_s1.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
let failures = 0;
const check = (ok, m, detail) => { if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));

function slice(name) {
  const at = APP.search(new RegExp('\\n(async )?function ' + name + '\\('));
  if (at < 0) throw new Error('no function ' + name);
  let i = APP.indexOf('{', at), depth = 0;
  for (; i < APP.length; i++) { if (APP[i] === '{') depth++; else if (APP[i] === '}' && !--depth) break; }
  return APP.slice(at + 1, i + 1);
}

function sandbox(content, mutate) {
  const sb = { console, JSON, Object, Array, String, SWRPGTextHash: { bookContent: () => content }, localStorage: { getItem: () => null, setItem: () => {} } };
  sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/shared/sources.js'), 'utf8'), sb);
  sb._swrpgSourcesIndex = sb.SWRPGSources.buildIndex(J('books.vocab.json'));
  sb._canonicalCharbuild = { talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers, signatureAbilities: J('signature_abilities.json').signature_abilities };
  const fn = mutate ? slice('pdfS1Words').replace(/\{[\s\S]*\}$/, "{ return text || ''; }") : slice('pdfS1Words');
  vm.runInContext(slice('sheetBookLineOf') + '\n' + fn + '\nwindow.pdfS1Words = pdfS1Words;', sb);
  return sb;
}

const rem = sandbox('removed'), inc = sandbox('included');
const SR = rem.SWRPGSources, ix = rem._swrpgSourcesIndex, cb = rem._canonicalCharbuild;
const sigId = Object.keys(cb.signatureAbilities)[0];
const got = {
  talent: rem.pdfS1Words('', 'talent', { id: 'blooded', name: 'Blooded' }, {}),
  force: rem.pdfS1Words('', 'force', { id: 'alter' }, {}),
  sig: rem.pdfS1Words('', 'signature', { id: sigId }, {}),
  text: rem.pdfS1Words('Own words.', 'talent', { id: 'blooded' }, {}),
};
const want = {
  talent: 'Edge of the Empire Core Rulebook p.132 · Age of Rebellion Core Rulebook · Unlimited Power',
  force: SR.bookLine(ix, cb.forcePowers.alter), sig: SR.bookLine(ix, cb.signatureAbilities[sigId]), text: 'Own words.',
};
const off = Object.keys(want).filter((k) => got[k] !== want[k] || (k !== 'text' && !got[k]));
check(!off.length, "P1  'removed': no words → the S1 line (talent F1, force, signature); words → the words", off.map((k) => [k, got[k], want[k]]));
check(inc.pdfS1Words('Own words.', 'talent', { id: 'blooded' }, {}) === 'Own words.' && inc.pdfS1Words('', 'talent', { id: 'blooded' }, {}) === '' &&
  inc.pdfS1Words(undefined, 'force', { id: 'alter' }, {}) === '', "P2  'included': the text as before; no text → ''");

const FFG = slice('generateFFGPdf'), CUS = slice('generateCustomPdf');
const bare = [];
[['generateFFGPdf', FFG], ['generateCustomPdf', CUS]].forEach(([n, src]) => {
  [/pdfGlyphRuns\(t\.description/, /pdfText\(t\.description/, /pdfGlyphRuns\(fp\.description/, /pdfText\(fp\.description/,
    /description: e\.words/, /words: e\.words/, /words: a\.description/, /if \(t\.description\)/, /if \(fp\.description\)/]
    .forEach((re) => { if (re.test(src)) bare.push(n + ' ' + re); });
});
const uses = (FFG.match(/S1W\(/g) || []).length + ':' + (CUS.match(/S1W\(/g) || []).length;
check(!bare.length && uses === '3:4', 'P3  every ability write in both exporters goes through pdfS1Words (S1W, its typeof-guarded local; FFG 3 · custom 4)', { bare, uses });

const bit = sandbox('removed', true);
check(bit.pdfS1Words('', 'talent', { id: 'blooded', name: 'Blooded' }, {}) !== want.talent, "BITE pdfS1Words as `text || ''` → P1's talent line is lost (red)");

console.log(failures ? '\nFAIL (' + failures + ')' : '\nPASS');
process.exit(failures ? 1 : 0);
