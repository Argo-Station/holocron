// test/b1788_modify_glyphs.cjs — B-1788 (ruling release-r7-bug-burndown ADDENDUM 592, job step 3).
// Modify this Character printed rule text's [XX] dice codes as text. Every `clean(` result in lib/modify/view.jsx
// reaches the page through `draw`, the shared drawer the page's tree cards use, and `draw` is a guarded call.
//   A  every `clean(` call is drawn where it is made — `draw(clean(` — or is a row's `rule:` or the Preview's
//      `mine:` / `book:`, which ListHost and Preview draw where they render them (B);
//   B  ListHost renders `draw(r.rule)`; Preview renders `draw(c[1])`;
//   C  `draw` is guarded: no SWRPGUI, or no glyphText → the text itself, never a throw; empty stays empty;
//      with the drawer it calls glyphText(text, 1), the tree cards' size.
// Reads the source at B1788_SRC (default lib/modify/view.jsx), so a bite runs against a mutant copy, never the tree.
// EXIT 0 all pass · 1 any fail.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = process.env.B1788_SRC || path.join(__dirname, '..', 'lib', 'modify', 'view.jsx');
const src = fs.readFileSync(SRC, 'utf8');
let fails = 0, n = 0;
function check(label, ok, detail) {
  n++;
  console.log((ok ? '✓ ' : '✗ ') + label + (ok || detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 300)));
  if (!ok) fails++;
}

// A — every clean( call site, the definition aside.
const lines = src.split('\n');
const sites = [];
lines.forEach((l, i) => {
  const re = /clean\(/g; let m;
  while ((m = re.exec(l))) {
    if (/function clean\($/.test(l.slice(0, m.index + 6))) continue;
    const before = l.slice(0, m.index);
    const drawn = /draw\($/.test(before);
    const field = (before.match(/(\w+):\s*$/) || [])[1];
    sites.push({ line: i + 1, drawn, field });
  }
});
check('A: the census finds the 11 clean( sites of B-1788', sites.length >= 11, sites.length);
const undrawn = sites.filter((s) => !s.drawn && ['rule', 'mine', 'book'].indexOf(s.field) < 0);
check('A: no clean( result reaches the page without the drawer', undrawn.length === 0, undrawn);

// B — the two render sites that draw a carried string.
check('B: ListHost draws a row\'s rule — draw(r.rule)', /className: 'm13-lrule' \}, draw\(r\.rule\)/.test(src));
check('B: Preview draws Yours and The book\'s — draw(c[1])', /className: 'm13-psmall' \}, draw\(c\[1\]\)/.test(src));
check('B: nothing renders r.rule undrawn', !/[^(]r\.rule\)/.test(src.replace(/draw\(r\.rule\)/g, '')) && !/,\s*r\.rule\s*\)/.test(src));

// C — the drawer, sliced and run.
const m = src.match(/function draw\(x\) \{[^\n]*\}/);
check('C: draw is defined on one line', !!m);
if (m) {
  const make = (win) => new Function('window', m[0] + '; return draw;')(win);
  let out, threw = null;
  try { out = make({})('Hard ([DI][DI])'); } catch (e) { threw = String(e); }
  check('C: no SWRPGUI → the text, no throw', threw === null && out === 'Hard ([DI][DI])', threw || out);
  threw = null;
  try { out = make({ SWRPGUI: {} })('[SU]'); } catch (e) { threw = String(e); }
  check('C: SWRPGUI without glyphText → the text, no throw', threw === null && out === '[SU]', threw || out);
  const calls = [];
  const U = { glyphText: (t, size, opts) => { calls.push([t, size, opts]); return ['MARKS']; } };
  out = make({ SWRPGUI: U })('Spend [TR]');
  check('C: with the drawer → glyphText(text, 1), the tree cards\' size', out[0] === 'MARKS' && calls.length === 1 && calls[0][0] === 'Spend [TR]' && calls[0][1] === 1 && calls[0][2] === undefined, calls);
  check('C: empty stays empty (a `p.sub ? …` test still reads it)', make({ SWRPGUI: U })('') === '' && make({ SWRPGUI: U })(null) === null);
}

console.log('\n' + (n - fails) + '/' + n + ' passed');
process.exit(fails ? 1 : 0);
