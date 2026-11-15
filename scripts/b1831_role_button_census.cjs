#!/usr/bin/env node
// B-1831 STEP 0 (ruling release-r7-bug-burndown ADDENDUM 679): every product element given role="button" — JSX
// (`role="button"`, `role={c ? 'button' : …}`) and createElement (`role: 'button'`, `role: c ? 'button' : …`) — over the
// tracked `player/ gm/ lib/ dice/` sources, read for its OWN key handling: an onKeyDown / onKeyUp / onKeyPress on the same
// element's props. Comments are skipped. Exports `census()` for test/b1831_role_button_keys.cjs; run bare it prints the list.
// Read-only: it writes nothing (argv is ignored).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['player', 'gm', 'lib', 'dice'];

function sources() {
  const out = execFileSync('git', ['ls-files', '--', ...DIRS], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(f => /\.(jsx|js|mjs)$/.test(f))
    // built bundles are gitignored, but a tracked .js sibling of a .jsx is generated too — read the source
    .filter(f => !(f.endsWith('.js') && fs.existsSync(path.join(ROOT, f + 'x'))));
}

// blank comments (keeping offsets and newlines) so a comment that names role="button" is never a site
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && n === '*') { while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    // JSX text holding an apostrophe would open a fake string; good enough for prop spans, which is all this reads
    out += c; i++;
  }
  return out;
}

// the span of the props this `role` sits in: JSX → from the `<Tag` back to its opening tag's `>`; createElement →
// the enclosing `{ … }` object. Brace-depth aware, strings skipped.
function propSpan(s, at) {
  // walk back to the nearest unbalanced `{` (object) or a `<Tag` at depth 0
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const c = s[i];
    if (c === '}' || c === ')') depth++;
    else if (c === '{' || c === '(') {
      if (depth === 0 && c === '{') {
        // JSX attribute braces `role={…}` open right after `=`; skip them
        if (s[i - 1] === '=') continue;
        return { kind: 'object', start: i, end: matchFwd(s, i) };
      }
      if (depth > 0) depth--;
    } else if (c === '<' && depth === 0 && /[A-Za-z]/.test(s[i + 1] || '')) {
      return { kind: 'jsx', start: i, end: jsxTagEnd(s, i), tag: /^<([\w.]+)/.exec(s.slice(i))[1] };
    }
  }
  return null;
}
function matchFwd(s, i) {
  let d = 0, q = null;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') d++;
    else if (c === '}' || c === ')' || c === ']') { d--; if (d === 0) return k; }
  }
  return s.length;
}
function jsxTagEnd(s, i) {
  let d = 0, q = null;
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (d === 0 && (c === '"' || c === "'")) { q = c; continue; }
    if (d > 0 && (c === '"' || c === "'" || c === '`')) { q = c; continue; }
    if (c === '{') d++; else if (c === '}') d--;
    else if (c === '>' && d === 0) return k;
  }
  return s.length;
}

function enterSpace(t) { return /['"]Enter['"]/.test(t) && /['"] ['"]|['"]Spacebar['"]|\.code\s*===\s*['"]Space['"]/.test(t); }
// the definition of a same-file helper an onKey* handler names: `const NAME = …` / `function NAME(` — its balanced body
function helperBody(s, props) {
  const m = /\bonKey(?:Down|Up|Press)\s*[:=]\s*\{?\s*([A-Za-z_$][\w$]*)\b/.exec(props);
  if (!m || m[1] === 'function') return '';
  const d = new RegExp('(?:const|let|var)\\s+' + m[1] + '\\s*=|function\\s+' + m[1] + '\\s*\\(').exec(s);
  if (!d) return '';
  const open = s.indexOf('{', d.index);
  return open < 0 ? '' : s.slice(open, matchFwd(s, open) + 1);
}

const ROLE_RE = /\brole\s*(?:=\s*\{?|:)\s*([^,}\n>]*?'button'|[^,}\n>]*?"button")/g;

function census() {
  const sites = [];
  for (const f of sources()) sites.push(...scan(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
  return sites;
}

// one file's sites, from its text (the guard plants a bare site through here to show the census bites)
function scan(f, raw) {
  const sites = [];
  {
    const s = stripComments(raw);
    let m; ROLE_RE.lastIndex = 0;
    while ((m = ROLE_RE.exec(s))) {
      const span = propSpan(s, m.index);
      const line = s.slice(0, m.index).split('\n').length;
      const props = span ? s.slice(span.start, span.end + 1) : '';
      // its own key handler, and that handler names both Enter and Space — written inline, or a helper of the same file
      // the handler calls by name (`onKeyDown={cardPressKeys(…)}`), whose definition is read
      const keys = /\bonKey(Down|Up|Press)\b/.test(props) && enterSpace(props + helperBody(s, props));
      const spread = /\.\.\.\s*[\w.(]/.test(props);
      const testid = (/data-testid['"]?\s*[:=]\s*\{?\s*(['"])([^'"]+)\1/.exec(props) || [])[2] ||
        (/data-testid['"]?\s*[:=]\s*\{([^}]+)\}/.exec(props) || [])[1] || null;
      const cls = (/className['"]?\s*[:=]\s*\{?\s*(['"])([^'"]+)\1/.exec(props) || [])[2] || null;
      sites.push({ file: f, line, kind: span ? span.kind : '?', tag: span && span.tag || (span ? 'h()' : '?'),
        keys, spread, cls, testid: testid && testid.trim(), role: m[0].replace(/\s+/g, ' ') });
    }
  }
  return sites;
}

module.exports = { census, scan };

if (require.main === module) {
  const sites = census();
  const bare = sites.filter(x => !x.keys);
  for (const x of sites) {
    console.log((x.keys ? 'KEYS ' : 'NONE ') + x.file + ':' + x.line + '  ' + x.tag + (x.cls ? ' .' + x.cls.split(' ').join('.') : '') +
      (x.testid ? ' [' + x.testid + ']' : '') + (x.spread ? ' (spread)' : ''));
  }
  console.log('\n' + sites.length + ' role="button" site(s); ' + bare.length + ' without their own Enter and Space.');
}
