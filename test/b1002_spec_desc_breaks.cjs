#!/usr/bin/env node
/**
 * b1002_spec_desc_breaks.cjs — STANDING guard for B-1002 (lap f100-fix-live-numbers-s; f100-triage-census-card ADDENDUM 8
 * Q3, SHOW under D-154): the reSpecialized packs ship the authors' notes ("At a Glance", "Media Touchstones", …) as
 * headings on their own lines, and the creator's specialization preview drew them as one run of prose.
 *
 *   1. ONE DRAWER: `player/app.jsx` `fcSpecDescNode` draws the description with `whiteSpace: 'pre-line'`, and every site
 *      that draws a specialization description calls it — no site passes `fcSpecDescText(…)`, `descText` or `selDesc`
 *      through `cleanMarkup` on its own.
 *   2. THE DATA IT SERVES: the packs carry their headings on their own lines (a pack description holds "\n\nAt a
 *      Glance\n\n"); no BOOK description carries a newline, so a book tree draws exactly as before.
 *   3. `cleanMarkup` keeps a "\n" (a drawer that keeps breaks needs them to arrive).
 *
 * THE BITE: one site reverted to the old inline form in a copy of the source → row 1 red.
 * Run: node test/b1002_spec_desc_breaks.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0, rows = 0;
function check(ok, msg, detail) {
  rows += 1;
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const SRC = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');

function scan(src) {
  // `opts` is B-1600's glyph flag (`CREATOR_GLYPHS`, ADDENDUM 281), passed through to `glyphs`; the drawer is the same one.
  const helper = src.match(/function fcSpecDescNode\(spec(?:, opts)?\) \{\n([\s\S]*?)\n\}/);
  const body = helper ? helper[1] : '';
  const rest = helper ? src.replace(helper[0], '') : src;
  const raw = rest.match(/cleanMarkup\((?:fcSpecDescText\([^)]*\)|descText|selDesc)\)/g) || [];
  return { helper: !!helper, preLine: /whiteSpace:\s*'pre-line'/.test(body), raw: raw.length, calls: (rest.match(/fcSpecDescNode\(/g) || []).length };
}
// 1
const s = scan(SRC);
check(s.helper && s.preLine, '1 fcSpecDescNode exists and draws with whiteSpace pre-line');
// RE-POINTED, B-1688: `FCSpecDetail` went. KEEPS every live site through the helper. DROPS its one call, so 4 is 3.
check(s.raw === 0 && s.calls === 3, `1 every description site calls it (${s.calls} calls; ${s.raw} sites flatten on their own)`, s);
// 2
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8')).specializations;
const bookNl = Object.keys(BOOK).filter((k) => /\n/.test(BOOK[k].description || ''));
check(bookNl.length === 0, `2 no book specialization description carries a newline (${Object.keys(BOOK).length} records)`, bookNl);
const packDir = path.join(ROOT, 'public/data/mods/respecialized');
let headed = 0, packs = 0;
fs.readdirSync(packDir).forEach((v) => {
  const f = path.join(packDir, v, 'specializations.overlay.json');
  if (!fs.existsSync(f)) return;
  packs += 1;
  const o = JSON.parse(fs.readFileSync(f, 'utf8')).specializations;
  headed += Object.keys(o).filter((k) => /\n\nAt a Glance\n\n/.test(o[k].description || '')).length;
});
check(packs > 0 && headed > 0, `2 the packs carry "At a Glance" on its own line (${headed} descriptions over ${packs} packs)`);
// 3
const cm = SRC.match(/function cleanMarkup\(text\) \{[\s\S]*?\n\}/);
let kept = false;
try { kept = new Function(cm[0] + '; return cleanMarkup;')()('A\n\nAt a Glance\n\nB') === 'A\n\nAt a Glance\n\nB'; } catch (e) { kept = false; }
check(kept, '3 cleanMarkup keeps the newlines it is given');

// THE BITE
const MUT = SRC.replace('{fcSpecDescNode(sel, CREATOR_GLYPHS)}', '{glyphs(cleanMarkup(selDesc), null, CREATOR_GLYPHS)}');
const m = scan(MUT);
check(MUT !== SRC && m.raw === 1, 'BITE one site reverted to the inline form → the scan finds it', m);

console.log(`\nb1002_spec_desc_breaks: ${failures} FAIL of ${rows}`);
process.exit(failures ? 1 : 0);
