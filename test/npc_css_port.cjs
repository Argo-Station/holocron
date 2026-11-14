#!/usr/bin/env node
/* npc_css_port.cjs — THE NPC LIBRARY'S PAPER LAYER STAYS A FENCED PORT, and every view has a zone.
 *
 * Ruling `npc-library-paper-concept` R-NPC-6: "`lib/shared/npc.css` = the board's `nl-*` rules ported
 * under the token map, every rule fenced to `[data-npc-shell]` … 0 LIVE `--pp-*`, 0 unfenced
 * selectors, 0 new hex/rgba literals". B-862 lands the file; this guard keeps those three claims true
 * at every later row, plus two the build added:
 *   · both shells link the layer AFTER `paper.css` (it ties the kit on specificity);
 *   · every view id the kernel can set is either DRAWN (`NPC_DRAWN_ZONES`, since B-864) or belongs to
 *     exactly one `NPC_INTERIM_ZONES` zone — never both, never neither — so no view can reach the paper
 *     shell and stand on an UNNAMED island (`data-npc-interim="unzoned"`).
 *
 * A FALSIFIER RUNS FIRST for each checker: a synthetic stylesheet carrying the defect must be caught,
 * so a checker that stopped seeing (a regex that matches nothing) reads red, not green.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const CSS_PATH = path.join(ROOT, 'lib/shared/npc.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ── the three checkers, each a pure function over a stylesheet's text ────────────────────────
function preludes(text) {
  return (stripComments(text).match(/[^{}]+(?=\{)/g) || []).map((p) => p.trim()).filter(Boolean);
}
function unfenced(text) {
  const out = [];
  preludes(text).forEach((p) => {
    if (p.startsWith('@')) { out.push(p); return; }    // no at-rules in this layer: one would hide selectors
    // R-SAP-15 (D-SAP2): the fence may stand inside :where(), each arm starting with it, so a resting ground can sit under the stripe
    p.split(',').forEach((sel) => { const s = sel.trim().replace(/^:where\(/, '').replace(/\)$/, '').trim(); if (!s.startsWith('[data-npc-shell]')) out.push(sel.trim()); });
  });
  return out;
}
function livePp(text) { return stripComments(text).match(/--pp-[a-z0-9-]+/g) || []; }
// The literals the port carries by name (npc.css's header says why each is not a new colour).
const ALLOWED = {
  'rgba(23,22,27,.18)': 1,       // the summoned overlay's shadow — --doc-ink's channels
  'rgba(23,22,27,.28)': 1,       // its scrim — --doc-ink's channels
  '#0a0a0a': 1,                  // the interim island's ground — .sb-legacy / .cf-legacy's own literal
  '#fff': 1,                     // the interim island's ink — the same device
  'rgba(255,255,255,.22)': 1,    // the island's scrollbar thumb — .cf-legacy's own literal
};
function literals(text) {
  return stripComments(text).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || [];
}
function unexpectedLiterals(text) {
  const seen = {};
  literals(text).forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
  const bad = [];
  Object.keys(seen).forEach((l) => { if (!(l in ALLOWED) || seen[l] > ALLOWED[l]) bad.push(l + ' ×' + seen[l]); });
  return bad;
}

// ── FALSIFIERS — each checker must bite a planted defect ─────────────────────────────────────
const MUTANT = '[data-npc-shell] .nl-ok{color:var(--doc-ink)}\n.nl-loose{color:var(--pp-ink);background:#123456}';
check('falsifier: an UNFENCED selector is caught', unfenced(MUTANT).indexOf('.nl-loose') !== -1, unfenced(MUTANT));
check('falsifier: :where() with no fence inside is caught (R-SAP-15)', unfenced(':where(.nl-loose){color:var(--doc-ink)}').indexOf(':where(.nl-loose)') !== -1, unfenced(':where(.nl-loose){color:var(--doc-ink)}'));
check('falsifier: :where() with one arm unfenced is caught (R-SAP-15)', unfenced(':where([data-npc-shell] .a, .nl-loose){color:var(--doc-ink)}').length === 1, unfenced(':where([data-npc-shell] .a, .nl-loose){color:var(--doc-ink)}'));
check('falsifier: a live --pp-* token is caught', livePp(MUTANT).length === 1, livePp(MUTANT));
check('falsifier: a NEW hex literal is caught', unexpectedLiterals(MUTANT).some((b) => b.indexOf('#123456') === 0),
      unexpectedLiterals(MUTANT));
check('falsifier: a comment is NOT read as a selector or a token (/* --pp-ink .x{} */)',
      unfenced('/* .x{} */[data-npc-shell] .y{}').length === 0 && livePp('/* --pp-ink */').length === 0);

// ── THE LAYER ────────────────────────────────────────────────────────────────────────────────
const sels = preludes(css).reduce((n, p) => n + p.split(',').length, 0);
check('npc.css is non-vacuous: it declares the port\'s 257 selectors plus the island\'s 2 (>= 259)', sels >= 259, sels);
check('0 unfenced selectors — every one starts with [data-npc-shell]', unfenced(css).length === 0, unfenced(css).slice(0, 5));
check('0 live --pp-* tokens (the lab vocabulary never ships)', livePp(css).length === 0, livePp(css).slice(0, 5));
check('0 colour literals beyond the five the header names, each at its stated count',
      unexpectedLiterals(css).length === 0, unexpectedLiterals(css));
check('the token map landed: --doc-action, --doc-ink, --doc-rule are all in use',
      /var\(--doc-action\)/.test(css) && /var\(--doc-ink\)/.test(css) && /var\(--doc-rule\)/.test(css));

// ── BOTH SHELLS LINK IT, AFTER THE KIT ───────────────────────────────────────────────────────
['player/index.html', 'gm/index.html'].forEach((shell) => {
  const html = fs.readFileSync(path.join(ROOT, shell), 'utf8');
  const kit = html.indexOf('href="/lib/shared/paper.css"');
  const npc = html.indexOf('href="/lib/shared/npc.css"');
  check(shell + ' links /lib/shared/npc.css AFTER /lib/shared/paper.css', kit !== -1 && npc > kit, { kit, npc });
});

// ── EVERY VIEW HAS ONE ZONE ──────────────────────────────────────────────────────────────────
const view = fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8');
// B-869: the table can be EMPTY (`{};` on one line) — the reader stops at the table's OWN close, never the
// next `\n};` in the file (which silently parsed the drawn table as the interim one).
const zm = view.match(/const NPC_INTERIM_ZONES = \{([^;]*?)\};/);
check('view.jsx declares NPC_INTERIM_ZONES', !!zm);
const zones = {};
if (zm) {
  const re = /(\w+):\s*\{\s*retiredBy:\s*'([^']+)',\s*views:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(zm[1]))) zones[m[1]] = { by: m[2], views: (m[3].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1)) };
}
// Every row names what retires it; since B-869 (R-NPC-12) there are NO rows — every view is drawn. The
// reader's positive control: the table's body parses to exactly the rows it declares (a stray row is seen).
const rowsDeclared = ((zm && zm[1]) || '').match(/\w+:\s*\{/g) || [];
check('every zone names what retires it — and since B-869 the table is EMPTY (R-NPC-12: every view drawn)',
      !!zm && rowsDeclared.length === Object.keys(zones).length && Object.keys(zones).length === 0, { zones, rowsDeclared });
const setViews = new Set((view.match(/setView\('([a-z-]+)'\)/g) || []).map((s) => s.slice(9, -2)));
// B-864: the tab strip sets its views by id (`setView(it.id)`), so the reader takes the tab ids too —
// `history` was set only that way, and the reader could not see it.
((view.match(/const navItems = \[([\s\S]*?)\]\.filter/) || ['', ''])[1].match(/\{ id: '([a-z-]+)'/g) || [])
  .forEach((s) => setViews.add(s.slice(7, -1)));
(view.match(/const CREATOR_VIEWS = \[([^\]]*)\]/) || ['', ''])[1].replace(/'([^']+)'/g, (_, v) => setViews.add(v));
setViews.add('library-landing');
const owner = {};
Object.keys(zones).forEach((z) => zones[z].views.forEach((v) => { (owner[v] = owner[v] || []).push(z); }));
// Drawn views (B-864's register, B-865's reference) stand on no island; a drawn view must not ALSO be in a zone.
const dzm = view.match(/const NPC_DRAWN_ZONES = \{([\s\S]*?)\n\};/);
const drawn = [];
if (dzm) { (dzm[1].match(/'([a-z-]+)'/g) || []).forEach((x) => drawn.push(x.slice(1, -1))); }
const CUSTOM_VIEWS = ['cast', 'c-fork', 'c-fight', 'c-talk', 'c-armory', 'c-profile'];
check('view.jsx declares the drawn views (NPC_DRAWN_ZONES: the register\'s four, B-864; the reference, B-865; the bench, B-866; the six custom views, B-869)',
      drawn.length === 12 && drawn.indexOf('reference') !== -1 && drawn.indexOf('groups') !== -1
      && CUSTOM_VIEWS.every((v) => drawn.indexOf(v) !== -1), drawn);
drawn.forEach((v) => { (owner[v] = owner[v] || []).push('<drawn>'); });
const orphan = [...setViews].filter((v) => !owner[v]);
const twice = Object.keys(owner).filter((v) => owner[v].length > 1);
check('the kernel sets >= 12 distinct views (the reader is not blind)', setViews.size >= 12, [...setViews]);
check('every view the kernel can set is DRAWN or in exactly ONE zone — no island is ever "unzoned"',
      orphan.length === 0 && twice.length === 0, { orphan, twice });

console.log('\nnpc_css_port: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
