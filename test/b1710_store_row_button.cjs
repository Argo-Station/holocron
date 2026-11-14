// test/b1710_store_row_button.cjs — B-1710 (ruling `release-r7-bug-burndown` ADDENDUM 589): THE CATALOGUE ROW'S OPEN IS A
// REAL BUTTON. `tr[data-store-row]` was focusable and pressable (tabIndex 0, Enter/Space) with no role, so a reader announced
// a plain row. The ruled structure is (b): one `<button type="button">` in the row's name cell carries the open and the row's
// accessible name (`it.name · price`); the `tr` loses tabIndex, its key handler and its aria-label and keeps its pointer
// click; the GM's + SHELF pill stays its own control, never inside the open button. The look is held by CSS: the button
// draws no box, and the row draws the focus ring when the button has it.
//
// A SOURCE GUARD over `lib/store/view.jsx` and `lib/shared/store.css` (no node guard renders the store; the rendered
// truth is the keyboard read and the store's browser suites at the gate). RED AT THE CUT `325e0c1cb` by exit code.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}
const src = fs.readFileSync(path.join(ROOT, 'lib/store/view.jsx'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'lib/shared/store.css'), 'utf8');

// The body of `var <name> = function (...) { ... };`, by brace balance from its opening line.
function body(name) {
  const at = src.indexOf('var ' + name + ' = function');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return null;
}
// Every call `fn(...)` inside text, as its full argument span, by paren balance.
function calls(text, fn) {
  const out = [];
  const re = new RegExp('\\b' + fn + '\\(', 'g');
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    for (let i = m.index + fn.length; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) { out.push(text.slice(m.index, i + 1)); break; }
    }
  }
  return out;
}

const rowProps = body('rowProps');
const rowOpen = body('rowOpen');
const rowWide = body('rowWide');
const rowHh = body('rowHh');
check('the four bodies are found (rowProps · rowOpen · rowWide · rowHh)', !!(rowProps && rowOpen && rowWide && rowHh),
  { rowProps: !!rowProps, rowOpen: !!rowOpen, rowWide: !!rowWide, rowHh: !!rowHh });

// 1 — the open is a button carrying the row's name.
const r = rowOpen || '';
check("rowOpen draws a <button type=\"button\">", /(h\('button',|\['button',)\s*\{[^]*type:\s*'button'/.test(r));
check("rowOpen's accessible name is the row's: it.name + ' · ' + fmtCr(it.price)",
  /'aria-label':\s*it\.name \+ ' · ' \+ fmtCr\(it\.price\)/.test(r));
check('rowOpen opens the item (setOpenId(it.key))', /setOpenId\(it\.key\)/.test(r));
check('rowOpen carries the hook class st-open', /className:\s*[^,]*'[^']*\bst-open\b/.test(r));
const wideOpens = calls(rowWide || '', 'rowOpen');
const hhOpens = calls(rowHh || '', 'rowOpen');
check('rowWide draws exactly one open button', wideOpens.length === 1, wideOpens.length);
check('rowHh draws exactly one open button', hhOpens.length === 1, hhOpens.length);
const nmCell = (rowWide || '').indexOf("h('td', { className: 'nm' }");
const wideAt = (rowWide || '').indexOf('rowOpen(');
const firstCellEnd = (rowWide || '').indexOf('cols.map');
check("rowWide's open button is in the name cell (td.nm)", nmCell >= 0 && wideAt > nmCell && wideAt < firstCellEnd,
  { nmCell, wideAt, firstCellEnd });

// 1b — the button is the name cell's content block, mat included: the mat's 46px carries the 44px floor (AS-6), the name's
// line alone is 19px.
check("at the desk the button is the name cell's block (.st-nmwrap) and holds the mat", /rowOpen\(it, 'st-nmwrap', \[mat\(it\)/.test(rowWide || ''));
check("on the phone the button is the row's first line (.st-row1) and holds the mat", /rowOpen\(it, 'st-row1', \[mat\(it\)/.test(rowHh || ''));

// 1c — ADDENDUM 590 Rider 1: what the button covers is its description. The (R) mark (desk and phone) and the desk's .st-q
// line are named by aria-describedby, by ids from the row's key; the name stays it.name · price.
check('rowOpen sets aria-describedby from the ids it is handed (absent when none)',
  /'aria-describedby':\s*ids\.length \? ids\.join\(' '\) : null/.test(r));
check("at the desk the (R) mark and the .st-q line carry the ids the button names",
  /h\('span', \{ className: 'st-r', id: rowDescId\(it, 'r'\) \}/.test(rowWide || '')
  && /className: 'st-q', id: rowDescId\(it, 'q'\)/.test(rowWide || '')
  && /\[it\.restricted \? rowDescId\(it, 'r'\) : null, q \? rowDescId\(it, 'q'\) : null\]/.test(rowWide || ''));
check("on the phone the (R) mark carries the id the button names",
  /h\('span', \{ className: 'st-r', id: rowDescId\(it, 'r'\) \}/.test(rowHh || '')
  && /\[it\.restricted \? rowDescId\(it, 'r'\) : null\]/.test(rowHh || ''));

// 2 — the row is no longer a keyboard stop with its own name.
const p = rowProps || '';
check('no tr[data-store-row] carries tabIndex', !/tabIndex/.test(p) && /'data-store-row'/.test(p));
check('the row has no key handler', !/onKeyDown/.test(p));
check('the row has no aria-label (the button names it)', !/aria-label/.test(p));
check('the row keeps its pointer click (a press anywhere on the row opens)', /onClick:\s*function \(\) \{ setOpenId\(it\.key\); \}/.test(p));

// 3 — the shelf pill is its own control, never inside the open.
const opens = wideOpens.concat(hhOpens);
check('no open button holds the shelf pill', opens.length === 2 && opens.every((c) => !/shelfPill/.test(c)) && !/shelfPill/.test(r),
  opens);
check('the shelf pill still stops its press and its keys from reaching the row',
  /e\.stopPropagation\(\); toggleShelfItem/.test(body('shelfPill') || '') && /onKeyDown: function \(e\) \{ e\.stopPropagation\(\); \}/.test(body('shelfPill') || ''));

// 4 — the look: no box on the button, the ring on the row.
check('store.css resets the open button to the cell (no box: border, background, padding, font inherited)',
  /\.st-open\)?\{[^}]*all:unset/.test(css));
check('store.css draws the focus ring on the row when its open button has keyboard focus',
  /tr:has\(\.st-open:focus-visible\)\{[^}]*outline/.test(css));

// 4b — ADDENDUM 590 Rider 2: both focus rules sit inside @supports selector(:has(a)), so where :has is missing the button
// keeps the hosts' ring; neither rule stands outside the block.
const sup = css.match(/@supports selector\(:has\(a\)\)\{([^]*?)\n\}/);
const inner = sup ? sup[1] : '';
const outer = sup ? css.replace(sup[0], '') : css;
check('both focus rules sit inside @supports selector(:has(a)), and neither outside it',
  !!sup && /\.st-open:focus-visible\{outline:none/.test(inner) && /tr:has\(\.st-open:focus-visible\)\{/.test(inner)
  && !/\.st-open:focus-visible\{outline:none/.test(outer) && !/tr:has\(\.st-open:focus-visible\)\{/.test(outer));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
