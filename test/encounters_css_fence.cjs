#!/usr/bin/env node
/* encounters_css_fence.cjs — THE ENCOUNTER MANAGER'S LAYER STAYS FENCED, TOKENED AND GM-ONLY.
 *
 * Ruling `encounters-e3-screens` ADDENDUM 9 @ `41b683471` (brief `encounters-e3-screens-css-fence` Q3, (a′)):
 * `lib/shared/encounters.css` holds the manager's paint. Three claims:
 *   · FENCED — every selector, inside an at-rule or not, starts with `[data-npc-shell]` and names an `enc-` class
 *     or a `data-enc` attribute (so nothing matches while swrpg_encounters_door is off);
 *   · TOKENED — no colour literal but the one named exception: the mask stops `#000` ×8 and the drawn scrim
 *     `rgba(23,22,27,.42)` ×1 (the sheet's header says why);
 *   · GM-ONLY — `gm/index.html` links it (after npc.css) and no other shell does.
 *
 * A FALSIFIER RUNS FIRST for each checker (npc_css_port's device): a synthetic sheet or shell carrying the defect must
 * be caught, so a checker that stopped seeing reads red. The exit code is the verdict.
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

const SHEET = '/lib/shared/encounters.css';
const css = fs.readFileSync(path.join(ROOT, SHEET.slice(1)), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ── the checkers, pure over a text ─────────────────────────────────────────────────────────────
function preludes(text) {
  return (stripComments(text).match(/[^{}]+(?=\{)/g) || []).map((p) => p.trim()).filter(Boolean);
}
function unfenced(text) {
  const out = [];
  preludes(text).forEach((p) => {
    if (/^@(media|container|supports)\b/.test(p)) return;    // a conditional group: its rules are read on their own
    if (p.startsWith('@')) { out.push(p); return; }          // any other at-rule (@font-face, @keyframes, @import …)
    p.split(',').forEach((sel) => {
      const s = sel.trim();
      if (!s.startsWith('[data-npc-shell]') || !/\.enc-|\[data-enc/.test(s)) out.push(s);
    });
  });
  return out;
}
const ALLOWED = {
  '#000': 8,                    // the .enc-sb scroll-fade mask stops — alpha only, never painted
  'rgba(23,22,27,.42)': 1,      // the drawn scrim — --doc-ink's channels at the drawing's .42
};
function unexpectedLiterals(text) {
  const seen = {};
  (stripComments(text).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || []).forEach((l) => { seen[l] = (seen[l] || 0) + 1; });
  return Object.keys(seen).filter((l) => !(l in ALLOWED) || seen[l] > ALLOWED[l]).map((l) => l + ' ×' + seen[l]);
}
function links(html) {
  return (html.match(/<link\b[^>]*>/g) || []).map((t) => (t.match(/href="([^"]+)"/) || [])[1]).filter(Boolean);
}
function shellReading(html) {
  const l = links(html);
  return { has: l.indexOf(SHEET) >= 0, afterNpc: l.indexOf(SHEET) > l.indexOf('/lib/shared/npc.css') && l.indexOf('/lib/shared/npc.css') >= 0 };
}

// ── falsifiers first ───────────────────────────────────────────────────────────────────────────
check('falsifier: an unfenced selector is caught', unfenced('.enc-x{color:var(--doc-ink)}').length === 1);
check('falsifier: a fenced selector naming no enc- part is caught', unfenced('[data-npc-shell] .nl-bar{margin:0}').length === 1);
check('falsifier: an unfenced arm inside @media is caught',
  unfenced('@media (max-width:1px){[data-npc-shell] .enc-a{margin:0} .enc-b{margin:0}}').length === 1);
check('falsifier: a @keyframes is caught', unfenced('@keyframes enc-x{from{opacity:0}}').length >= 1);
check('falsifier: a new hex and a ninth #000 are caught',
  unexpectedLiterals('a{color:#7F2A14}' + 'b{m:#000}'.repeat(9)).length === 2);
check('falsifier: a shell without the link, and one linking it before npc.css, are read as such',
  !shellReading('<link href="/lib/shared/npc.css" rel="stylesheet" />').has
  && !shellReading('<link href="/lib/shared/encounters.css" rel="stylesheet" /><link href="/lib/shared/npc.css" rel="stylesheet" />').afterNpc);

// ── the sheet ──────────────────────────────────────────────────────────────────────────────────
const pre = preludes(css).filter((p) => !p.startsWith('@'));
check('the sheet is read (>= 100 rules, the reader is not blind)', pre.length >= 100, pre.length);
const uf = unfenced(css);
check('FENCED: every selector starts with [data-npc-shell] and names an enc- class or a data-enc attribute', uf.length === 0, uf.slice(0, 6));
const lit = unexpectedLiterals(css);
check('TOKENED: no colour literal but #000 ×8 (mask stops) and rgba(23,22,27,.42) ×1 (the scrim)', lit.length === 0, lit);
check('TOKENED: no token fallback carries a literal (var(--x, #…))', !/var\(--[a-z0-9-]+\s*,\s*(#|rgb|hsl)/i.test(stripComments(css)));

// ── the shells ─────────────────────────────────────────────────────────────────────────────────
const gm = shellReading(fs.readFileSync(path.join(ROOT, 'gm/index.html'), 'utf8'));
check('GM-ONLY: gm/index.html links ' + SHEET + ', after npc.css', gm.has && gm.afterNpc, gm);
const others = ['index.html', 'player/index.html', 'dice/index.html', 'account/index.html']
  .filter((f) => fs.existsSync(path.join(ROOT, f)))
  .filter((f) => shellReading(fs.readFileSync(path.join(ROOT, f), 'utf8')).has);
check('GM-ONLY: no other shell links it (player, dice, account, the launchpad)', others.length === 0, others);

console.log('\nencounters_css_fence: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
