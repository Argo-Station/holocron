/**
 * use_state_component_init.cjs — STANDING guard: no `useState(` takes a COMPONENT as its initial value.
 *
 * Ruling `b1404-npc-reopen-card` R-B1404-2 (B-1404). React treats a function handed to `useState` as a
 * LAZY INITIALISER and calls it with no arguments. A component is a function, so
 * `useState(window.SWRPGLibrary ? window.SWRPGLibrary.NPC.Library : null)` worked on a first mount (the
 * module was not loaded yet, so the value was null) and on the next mount called `NpcLibrary(undefined)`,
 * which threw `Cannot destructure property 'onBack' of 'undefined'`: the player app went black on the
 * second visit to NPCs. The safe form wraps it: `useState(function () { return …Library; })`.
 *
 * THE SHAPE (by property): over every tracked `.jsx` under player/ gm/ lib/ dice/, a `useState(` whose
 * argument is NOT itself a function (`function …` or an arrow) and whose value can be a component: a
 * member chain or identifier ending in a PascalCase name, either the whole argument or an arm of a
 * top-level ternary (`c ? A.B.Comp : null`), checked through nested ternaries and parentheses.
 * Reported by file:line and the enclosing component.
 *
 * A DELIBERATE EXCEPTION is a named ALLOW entry `{ file, component, reason }`; an entry that matches
 * nothing is itself a failure, so the list cannot rot.
 *
 * The positive controls run first on inline fixtures: the instrument must see the shape before its
 * silence over the repo means anything.
 *
 * Run: node test/use_state_component_init.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '..');

// { file, component, reason } — empty: no site needs a component as its initial state today.
const ALLOW = [];

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  PASS  ' + m))
                            : (fail++, console.log('  FAIL  ' + m + (d ? ' — ' + d : ''))); };

// The balanced argument text of the call whose `(` is at `open`; strings and template literals skipped.
function callArg(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return null;
}

function stripParens(e) {
  e = e.trim();
  while (e.startsWith('(') && e.endsWith(')') && callArg(e, 0) === e.slice(1, -1)) e = e.slice(1, -1).trim();
  return e;
}

// The arms of a top-level ternary (recursively), else [expr]. `?.` and `??` are not ternary marks.
function arms(expr) {
  const e = stripParens(expr);
  let depth = 0, q = -1;
  for (let i = 0; i < e.length; i++) {
    const ch = e[i];
    if (ch === '"' || ch === "'" || ch === '`') { for (i++; i < e.length && e[i] !== ch; i++) if (e[i] === '\\') i++; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (depth === 0 && ch === '?') {
      if (e[i + 1] === '.' || e[i + 1] === '?' || e[i - 1] === '?') { i++; continue; }
      if (q < 0) { q = i; continue; }
    }
  }
  if (q < 0) return [e];
  // find the `:` matching the first top-level `?`
  depth = 0; let nest = 0;
  for (let i = q + 1; i < e.length; i++) {
    const ch = e[i];
    if (ch === '"' || ch === "'" || ch === '`') { for (i++; i < e.length && e[i] !== ch; i++) if (e[i] === '\\') i++; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (depth === 0 && ch === '?' && e[i + 1] !== '.' && e[i + 1] !== '?' && e[i - 1] !== '?') nest++;
    else if (depth === 0 && ch === ':') {
      if (nest === 0) return arms(e.slice(q + 1, i)).concat(arms(e.slice(i + 1)));
      nest--;
    }
  }
  return [e];
}

const CHAIN = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/;
const PASCAL = /^[A-Z][a-z0-9]+[A-Za-z0-9]*$/;
const NOT_COMPONENTS = new Set(['Infinity', 'NaN', 'Number', 'String', 'Boolean', 'Object', 'Array', 'Date', 'Math', 'JSON']);

function isFunctionArg(a) {
  return /^(?:async\s+)?function\b/.test(a) || /^(?:async\s+)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(a);
}

function componentArm(a) {
  if (!CHAIN.test(a)) return null;
  const last = a.split(/\??\./).pop();
  return PASCAL.test(last) && !NOT_COMPONENTS.has(a) ? a : null;
}

function enclosing(src, at) {
  const re = /^[ \t]*(?:export\s+)?(?:default\s+)?(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>|React\.memo|memo\())/gm;
  let m, name = '(top level)';
  while ((m = re.exec(src)) && m.index < at) name = m[1] || m[2];
  return name;
}

function inComment(src, at) {
  const lineStart = src.lastIndexOf('\n', at - 1) + 1;
  if (src.slice(lineStart, at).includes('//')) return true;
  return src.lastIndexOf('/*', at) > src.lastIndexOf('*/', at);
}

function scan(src) {
  const hits = [];
  const re = /(?:^|[^\w$])useState\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    if (inComment(src, open)) continue;
    const arg = callArg(src, open);
    if (arg == null) continue;
    const a = stripParens(arg);
    if (!a || isFunctionArg(a)) continue;
    const comps = arms(a).map(componentArm).filter(Boolean);
    if (comps.length) hits.push({ line: src.slice(0, open).split('\n').length, component: enclosing(src, open), value: comps.join(' | ') });
  }
  return hits;
}

console.log('use_state_component_init — positive controls (the instrument sees the shape)');
const BITE = [
  ['ternary arm, member chain', 'function H(){ const [L, s] = useState(window.X ? window.X.NPC.Library : null); }', 1],
  ['bare member chain', 'function H(){ const [L] = React.useState(window.SWRPGLibrary.NPC.Library); }', 1],
  ['bare identifier', 'function H(){ const [L] = useState(SomePanel); }', 1],
  ['nested ternary, parenthesised', 'function H(){ useState(a ? null : (b ? Lib.Card : null)); }', 1],
  ['lazy initialiser (function)', 'function H(){ useState(function () { return window.X.NPC.Library; }); }', 0],
  ['lazy initialiser (arrow)', 'function H(){ useState(() => window.X.NPC.Library); }', 0],
  ['a plain value', 'function H(){ useState(window.X ? window.X.count : 0); useState(DEFAULT_TAB); useState(null); useState(Infinity); }', 0],
  ['optional chain is not a ternary', 'function H(){ useState(a?.b ?? 0); }', 0],
  ['commented out', 'function H(){ // useState(window.X.Lib)\n }', 0],
];
for (const [label, src, n] of BITE) {
  const got = scan(src).length;
  ok(got === n, `${label}: ${n} hit(s)`, `got ${got}`);
}
const named = scan('function PlayerNpcLibrary({ onBack }) {\n  const [Lib, setLib] = useState(window.SWRPGLibrary ? window.SWRPGLibrary.NPC.Library : null);\n}');
ok(named.length === 1 && named[0].component === 'PlayerNpcLibrary' && named[0].line === 2,
  'a hit names its enclosing component and line', JSON.stringify(named));

console.log('use_state_component_init — the repo (player/ gm/ lib/ dice/ .jsx)');
const files = execSync("git ls-files -- 'player/*.jsx' 'gm/*.jsx' 'lib/*.jsx' 'dice/*.jsx'", { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(Boolean);
ok(files.length > 0, `tracked .jsx files found (${files.length})`);
let sites = 0;
const used = new Set();
const found = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8');
  sites += (src.match(/(?:^|[^\w$])useState\s*\(/g) || []).length;
  for (const h of scan(src)) {
    const allow = ALLOW.find(x => x.file === f && x.component === h.component);
    if (allow) { used.add(allow); continue; }
    found.push(`${f}:${h.line} ${h.component} — useState(${h.value})`);
  }
}
ok(sites > 100, `useState( call sites read (${sites})`);
ok(found.length === 0, 'no useState( takes a component as its initial value',
  found.length + ' site(s):\n      ' + found.join('\n      ') + '\n      wrap it: useState(function () { return <value>; })');
for (const a of ALLOW) ok(used.has(a), `ALLOW entry still matches: ${a.file} ${a.component} (${a.reason})`);

console.log(`\nuse_state_component_init: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
