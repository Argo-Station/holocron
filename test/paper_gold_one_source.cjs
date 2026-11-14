#!/usr/bin/env node
/**
 * paper_gold_one_source.cjs — the paper ground's gold has ONE home (B-1268; DECISIONS D-199 @ 72ae74a76;
 * ruling `paper-n7-b1268-triumph-ink-lab-card` ADDENDUM 2, C-3).
 *
 * Jason picked one gold for the Triumph mark and the Proficiency die on every paper screen: `#755D00`, the ink
 * B-1208 had scoped to the Spend results face alone (R-RC-4, `sheet.css`). That face rule is retired: the ground
 * now carries the value, so a second declaration anywhere is either redundant or a second gold — the exception
 * D-199 removed. This guard pins both:
 *
 *   (1) ONE SOURCE — `--doc-sym-proficiency` and `--doc-sym-triumph` are DECLARED (a `--x:` in CSS, a `'--x':`
 *       key in a style object, or `setProperty('--x', …)`) only in `lib/shared/grounds/creator.css`, among the
 *       tracked production sources. READS (`var(--x, …)`, `getPropertyValue('--x')`) are free.
 *   (2) THE VALUE — each is declared there exactly once, and equals `#755D00`.
 *
 * RECORDS ARE EXCLUDED (R-TI-1): `Docs/` (approved mockups and gates), `lab/`, `test/` (fixtures and guards) and
 * `scripts/` (instruments and their fixtures). An approved mockup is true at its approval SHA; D-199 supersedes
 * its gold by decision, and it is never re-inked.
 *
 * BITE: red on commercial `5139f8c87` (the cut) — `lib/shared/sheet.css` declares `--doc-sym-triumph`, and both
 * ground values are `#826700`.
 */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HOME = 'lib/shared/grounds/creator.css';
const GOLD = '#755D00';
const TOKENS = ['--doc-sym-proficiency', '--doc-sym-triumph'];
const RECORDS = /^(Docs|lab|test|scripts)\//;
const EXT = /\.(css|jsx|js|mjs|cjs|html)$/;

let fails = 0, n = 0;
const ok = (label, cond, detail) => { n++; if (cond) console.log('  PASS ', label); else { fails++; console.log('  FAIL ', label, detail ? ' -> ' + detail : ''); } };

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0').filter(p => p && EXT.test(p) && !RECORDS.test(p) && !p.startsWith('node_modules/'));
ok('the production corpus is non-empty and holds the ground file', tracked.length > 50 && tracked.includes(HOME), tracked.length + ' files');

const esc = s => s.replace(/[-]/g, '\\-');
for (const tok of TOKENS) {
  const decl = new RegExp('(?:' + esc(tok) + '[\'"]?\\s*:(?!:)|setProperty\\(\\s*[\'"]' + esc(tok) + '[\'"])', 'g');
  const sites = [];
  for (const p of tracked) {
    const txt = fs.readFileSync(path.join(ROOT, p), 'utf8');
    txt.split('\n').forEach((line, i) => { if (line.match(decl)) sites.push({ p, line: i + 1, text: line.trim().slice(0, 120) }); });
  }
  const away = sites.filter(s => s.p !== HOME);
  ok(`${tok} is declared only in ${HOME}`, away.length === 0, away.map(s => `${s.p}:${s.line} ${s.text}`).join(' | '));
  const home = sites.filter(s => s.p === HOME);
  ok(`${tok} is declared exactly once in ${HOME}`, home.length === 1, home.map(s => `:${s.line}`).join(' '));
  const val = home.length ? (home[0].text.match(new RegExp(esc(tok) + '\\s*:\\s*([^;]+);')) || [])[1] : null;
  ok(`${tok} equals ${GOLD}`, !!val && val.trim().toUpperCase() === GOLD, String(val && val.trim()));
}

console.log(`paper_gold_one_source: ${n - fails} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
