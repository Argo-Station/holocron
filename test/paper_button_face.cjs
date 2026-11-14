#!/usr/bin/env node
/* paper_button_face — G2: a paper button takes the paper's font, ROW-SCOPED (card `paper-n7-b1210-scrim-font-card`
 * ADDENDUM 1 R-B1210-6 and its CONDITION, R-B1210-9; ADDENDUM 2 R-B1210-13).
 *
 * A <button> with no family of its own computes the UA's `font: -webkit-small-control`. The gate's crops showed the
 * ground-wide form turns the bold UA › − + light on four surfaces beyond the row, so the rule is row-scoped. This
 * guard reds on, statically, in `lib/shared/paper.css`:
 *   (a) the rule is gone: no rule whose selectors are exactly the row's roots' `button` and `.pb-chip` under a ground,
 *       declaring `font-family: inherit`;
 *   (b) it gains specificity: any selector of it not wholly inside `:where(…)` (wrapped in a class, fenced by a ground
 *       attribute outside `:where`), or it sets more than the family (`font:` would move size and weight);
 *   (c) the ground-wide form comes back: `:where([data-doc-ground], [data-paper-chrome]) button` with font-family,
 *       which re-faces `.hp-plate.gm-tile`, `.hp-plate.nl-pick`, `.hp-row` and GM.NPC.CUSTOM.FIGHT's buttons.
 *
 * PAPER_BUTTON_FACE_CSS points it at a COPY of paper.css (its bite).
 * Run: node test/paper_button_face.cjs
 */
const fs = require('fs');
const path = require('path');

const CSS = process.env.PAPER_BUTTON_FACE_CSS || path.resolve(__dirname, '..', 'lib/shared/paper.css');
const WANT = [
  ':where([data-m7-sheet],[data-tree-sheet="paper"],[data-paper-chrome].pb-src,[data-sources-box],[data-sources-overlay]) button',
  ':where([data-doc-ground] .pb-chip,[data-paper-chrome] .pb-chip)',
];

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); }
};
const squash = (s) => s.replace(/\s+/g, '');
// a selector keeps its combinators: whitespace collapses to one space, none is kept just inside ( ) or around a comma
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')').replace(/\s?,\s?/g, ',').trim();
// split a selector list on top-level commas only
const split = (sel) => { const out = []; let d = 0, cur = '';
  for (const c of sel) { if (c === '(') d++; else if (c === ')') d--;
    if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out.map(norm).filter(Boolean); };

const src = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...src.matchAll(/(^|[}\s])([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sels: split(m[2]), decl: squash(m[3]) }));
const faced = rules.filter((r) => /font-family:inherit/.test(r.decl) || /(^|;)font:inherit/.test(r.decl));

// (a)
const ours = faced.filter((r) => r.sels.some((s) => s.includes('[data-m7-sheet]') || s.includes('.pb-chip')));
check('(a) paper.css carries the row-scoped font rule', ours.length === 1, ours.length + ' candidate rules');
if (ours.length === 1) {
  const r = ours[0];
  const missing = WANT.filter((w) => !r.sels.includes(w)), extra = r.sels.filter((s) => !WANT.includes(s));
  check('(a) its selectors are the row\'s roots and .pb-chip, no more and no fewer', !missing.length && !extra.length,
    (missing.length ? 'missing ' + missing.join(' | ') : '') + (extra.length ? ' extra ' + extra.join(' | ') : ''));
  // (b)
  // what follows the `:where(…)` that opens the selector: '' or the bare type `button` adds no class or attribute weight
  const tail = (s) => { if (!s.startsWith(':where(')) return null; let d = 0;
    for (let i = 6; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0) return s.slice(i + 1); } }
    return null; };
  const outside = r.sels.filter((s) => { const t = tail(s); return t !== '' && t !== ' button'; });
  check('(b) zero specificity: every selector is wholly inside :where() (plus a bare `button` type)', !outside.length, outside.join(' | '));
  check('(b) family only: the rule declares font-family:inherit and nothing else', r.decl.replace(/;$/, '') === 'font-family:inherit', r.decl);
}
// (c)
const wide = faced.filter((r) => r.sels.some((s) => /^:where\(\[data-doc-ground\],\[data-paper-chrome\]\) button$/.test(s)));
check('(c) the ground-wide form is absent (R-B1210-6 CONDITION: › − + change weight on four surfaces)', !wide.length,
  wide.map((r) => r.sels.join(',')).join(' | '));

console.log(`\npaper_button_face: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
