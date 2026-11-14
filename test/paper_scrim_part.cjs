#!/usr/bin/env node
/* paper_scrim_part — G1: the kit's ONE paper dim, `.hp-scrim`, and its six adopters as EMPTY SIBLINGS
 * (card `paper-n7-b1210-scrim-font-card` ADDENDUM 1 R-B1210-1/2/9, ADDENDUM 2 R-B1210-11/12/14; DECISIONS D-174).
 *
 * The paper sweep grades a scrim that HOLDS its window as itself, so a held window reads MIXED; an approved paper
 * window puts the dim BESIDE the window. A regression back to an inline holding scrim would read OLD/MIXED on a sweep
 * nobody runs until the next lap, so this guard reds on, statically:
 *   (a) `lib/shared/paper.css` does not declare `.hp-scrim` exactly once, unfenced, with position:fixed, inset:0 and
 *       the ruled value rgba(18,16,20,.42) (H1Window's, value (i));
 *   (b) an adopter's PAPER face holds an inline full-inset translucent background literal (the census's `--static`
 *       matcher, ported), or does not carry `hp-scrim`; and `chrome.css` brings back a value for `.pb-src-scrim`
 *       (P4's grey, retired by D-174);
 *   (c) an adopter's `hp-scrim` element has children (route (A): the scrim is never an ancestor of the dialog).
 *
 * The adopters' paper faces are sliced by markers in the source; a marker that is not found is a red, never a skip.
 * PAPER_SCRIM_ROOT points it at a COPY of the tree (its bite).
 * Run: node test/paper_scrim_part.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PAPER_SCRIM_ROOT || path.resolve(__dirname, '..');
const VALUE = 'rgba(18,16,20,.42)';
// (file, function, the paper face's slice inside the function body: from marker → to marker; null = the whole body)
const ADOPTERS = [
  { name: 'H1Window', file: 'player/app.jsx', fn: 'function H1Window(', from: null, to: null },
  { name: 'ArtworkPaper', file: 'lib/store/view.jsx', fn: 'function ArtworkPaper(', from: null, to: null },
  { name: 'ConflictPaper', file: 'lib/shared/ui.jsx', fn: 'function ConflictPaper(', from: null, to: null },
  // RE-POINTED by ruling release-r7-bug-burndown ADDENDUM 609 (B-1711): the opener has one face, paper, so its paper face is the
  // whole body. KEEPS (a)(b)(c) on this adopter: no inline full-inset translucent background, `hp-scrim` carried, the scrim
  // empty (now over the whole opener, not one slice). DROPS the `if (paper) {` marker, which named a branch that is gone.
  { name: 'openActiveSources (paper)', file: 'lib/shared/ui.jsx', fn: 'function openActiveSources(', from: null, to: null },
  // RE-POINTED by ruling release-r6-companions-lifts Q2 (a): the sheet lives in lib/shared/ui.jsx (h(...)); KEEPS the empty-sibling claim
  { name: 'M7PaperSheet (<1024)', file: 'lib/shared/ui.jsx', fn: 'function M7PaperSheet(', from: 'return window.ReactDOM.createPortal(phone', to: ': body, document.body);' },
  { name: 'DirectionalTreeSheet (paper)', file: 'lib/shared/treeView.jsx', fn: 'function DirectionalTreeSheet(', from: 'if (paper) return ReactDOM.createPortal(', to: '), document.body);' },
];

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); }
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const squash = (s) => s.replace(/\s+/g, '');

// the body of `function NAME(...) { ... }`, by brace balance (strings and comments are rare enough in these bodies
// that a brace inside one would show as a FAIL here, not as a silent pass)
function body(src, head) {
  const at = src.indexOf(head); if (at < 0) return null;
  const open = src.indexOf('{', src.indexOf(')', at)); let d = 0;
  for (let i = open; i < src.length; i++) { const c = src[i];
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(open, i + 1); } }
  return null;
}
// is the element that carries `hp-scrim` at `at` childless? h('div', {…}) with two arguments, or a self-closing JSX tag
function childless(s, at) {
  const hAt = s.lastIndexOf("h('div'", at), jAt = s.lastIndexOf('<div', at);
  if (hAt > jAt) {
    let d = 0, args = 1, depth0 = null;
    for (let i = hAt + 1; i < s.length; i++) { const c = s[i];
      if (c === '(' || c === '{' || c === '[') { d++; if (depth0 === null) depth0 = d; }
      else if (c === ')' || c === '}' || c === ']') { d--; if (d === 0) return args === 2; }
      else if (c === ',' && d === depth0) args++; }
    return false;
  }
  let d = 0;
  for (let i = jAt; i < s.length; i++) { const c = s[i];
    if (c === '{') d++; else if (c === '}') d--;
    else if (c === '>' && d === 0) return s[i - 1] === '/'; }
  return false;
}

// (a) THE PART
const css = read('lib/shared/paper.css').replace(/\/\*[\s\S]*?\*\//g, '');
const decls = [...css.matchAll(/(^|\})\s*([^{}]*\.hp-scrim\b[^{}]*)\{([^}]*)\}/g)];
check('(a) paper.css declares .hp-scrim exactly once', decls.length === 1, decls.length + ' rules');
if (decls.length === 1) {
  const sel = decls[0][2].trim(), d = squash(decls[0][3]);
  check('(a) unfenced: the selector is .hp-scrim alone', sel === '.hp-scrim', JSON.stringify(sel));
  check('(a) position:fixed; inset:0', /position:fixed/.test(d) && /inset:0(;|$)/.test(d), d);
  check('(a) the ruled value ' + VALUE + ' (H1Window\'s, R-B1210-2)', d.includes('background:' + VALUE), d);
}

// (b) + (c) THE ADOPTERS
const TRANSLUCENT_FULL_INSET = /inset:\s*0[^{}]*background:\s*'rgba\(|background:\s*'rgba\([^{}]*inset:\s*0/;
for (const a of ADOPTERS) {
  const src = read(a.file); let s = body(src, a.fn);
  if (!s) { check(`${a.name}: ${a.fn} found in ${a.file}`, false, 'function not found'); continue; }
  if (a.from) {
    const i = s.indexOf(a.from), j = i < 0 ? -1 : s.indexOf(a.to, i + a.from.length);
    if (i < 0 || j < 0) { check(`${a.name}: the paper face is found (${JSON.stringify(a.from)} … ${JSON.stringify(a.to)})`, false, 'marker not found'); continue; }
    s = s.slice(i, j + a.to.length);
  }
  const hit = s.match(TRANSLUCENT_FULL_INSET);
  check(`(b) ${a.name}: no inline full-inset translucent background`, !hit, hit && hit[0].slice(0, 90));
  const at = s.search(/className:\s*'hp-scrim'|className="hp-scrim"/);
  check(`(b) ${a.name}: its scrim is .hp-scrim`, at >= 0);
  if (at >= 0) check(`(c) ${a.name}: the .hp-scrim element is empty (an empty sibling, route (A))`, childless(s, at));
}
const chrome = read('lib/shared/chrome.css').replace(/\/\*[\s\S]*?\*\//g, '');
const p4 = chrome.match(/\.pb-src-scrim[^{]*\{[^}]*background/);
check('(b) chrome.css carries no .pb-src-scrim background (P4\'s grey retired, D-174)', !p4, p4 && p4[0].slice(0, 90));

console.log(`\npaper_scrim_part: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
