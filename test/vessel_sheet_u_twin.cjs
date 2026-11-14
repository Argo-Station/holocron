// test/vessel_sheet_u_twin.cjs — R-S4CC-12 (b) under R-S4CC-16's three conditions (`shipyard-s4-catalogue-card`
// ADDENDA 8–9; PAPER's consent): the Ship Yard's VESSELS unit grows by the paper sheet's OWN factor.
//
// `lib/shared/sheet.css` grows the sheet by `--u` (1px · 1.3px · 1.8px, and a drawer's reset to 1px). Beside EVERY
// `--u: <n>px` sits a unitless twin `--u-k: <n>` with the equal number, and `lib/shared/yard.css` zooms the unit
// (`.yd.yd-in`) by `var(--u-k)`. The population is DERIVED from the file — every innermost rule block that declares
// `--u` — never listed, so a fifth rung cannot slip past. `--u` stays a literal px value (never derived from the twin):
// `scripts/smoke_paper_hotfix.py` reads it as a string.
//
// Bite (R-S4CC-16.2): one twin dropped, and one twin's number changed, each exit 1.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHEET = fs.readFileSync(path.join(ROOT, 'lib/shared/sheet.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const YARD = fs.readFileSync(path.join(ROOT, 'lib/shared/yard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); }
}

// every innermost `{ … }` block, with its selector (the text between the previous `}`/`{`/`;` and its `{`)
const blocks = [];
const re = /([^{};]*)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(SHEET))) blocks.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
const U = /(?:^|[;\s{])--u\s*:\s*([^;}]+)/g;          // `--u:` and not `--u-k:`
const K = /(?:^|[;\s{])--u-k\s*:\s*([^;}]+)/g;
const rungs = [];
for (const b of blocks) {
  const us = [...b.body.matchAll(U)].map((x) => x[1].trim());
  if (!us.length) continue;
  const ks = [...b.body.matchAll(K)].map((x) => x[1].trim());
  rungs.push({ sel: b.sel, u: us, k: ks });
}
check('the population is derived from sheet.css: ' + rungs.length + ' rule(s) declare --u (' + rungs.map((r) => r.sel + ' ' + r.u.join(',')).join(' · ') + ')',
  rungs.length >= 1, 'no --u found: the file moved, re-read R-S4CC-16');
for (const r of rungs) {
  const lit = r.u.length === 1 && /^\d+(\.\d+)?px$/.test(r.u[0]);
  check(r.sel + ': --u is ONE literal px value (' + r.u.join(', ') + '), never derived (R-S4CC-16.3)', lit, r.u.join(', '));
  const n = lit ? parseFloat(r.u[0]) : NaN;
  const kOk = r.k.length === 1 && /^\d+(\.\d+)?$/.test(r.k[0]) && parseFloat(r.k[0]) === n;
  check(r.sel + ': its twin --u-k reads ' + n + ' (found ' + (r.k.join(', ') || 'none') + ')', kOk, r.k.join(', ') || 'no --u-k beside --u');
}
// no orphan twin: a --u-k with no --u beside it would read a rung's k against another rule's u
const orphan = blocks.filter((b) => [...b.body.matchAll(K)].length && ![...b.body.matchAll(U)].length).map((b) => b.sel);
check('no --u-k stands without its --u (' + orphan.length + ')', !orphan.length, orphan.join(' · '));
// the consumer: the VESSELS unit zooms by the twin, and by nothing else
const yin = [...YARD.matchAll(/\.yd\.yd-in\s*\{([^{}]*)\}/g)].map((x) => x[1]);
const zooms = yin.map((b) => (/(?:^|[;\s])zoom\s*:\s*([^;}]+)/.exec(b) || [])[1]).filter(Boolean).map((z) => z.trim());
check('yard.css: the VESSELS unit (.yd.yd-in) zooms by var(--u-k, 1) and nothing else (' + (zooms.join(' | ') || 'no zoom') + ')',
  zooms.length === 1 && /^var\(--u-k(\s*,\s*1)?\)$/.test(zooms[0]), zooms.join(' | '));

console.log('\nvessel_sheet_u_twin: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
