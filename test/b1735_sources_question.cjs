#!/usr/bin/env node
/* B-1735 (ruling `release-r7-bug-burndown` ADDENDUM 560): the books line on the sync question against what each side resolves to.
 * Runs the SHIPPED conflict-copy region of lib/shared/ui.jsx (as test/sync_pins_key.cjs does) over lib/shared/sources.js and the shipped vocabulary. Three roads:
 * the vocabulary in hand, a failed vocabulary (an empty index), and a bare slice with no window (presence rule).
 * Covers the brief's table: every row of fact 1, the 56 pairs, the true case, past three, the v1 shapes; and the three sentences word for word.
 * ENV B1735_UI (a ui.jsx to read instead). --bites: runs itself over the cut's line and each mutant; every one must exit non-zero. EXIT 0 green · 1 red · 2 no region. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const UI_PATH = process.env.B1735_UI || path.join(ROOT, 'lib/shared/ui.jsx');
const START = '  // ── CONFLICT-COPY REGION START', END = '  // ── CONFLICT-COPY REGION END';

if (process.argv.includes('--bites')) {
  const shipped = fs.readFileSync(path.join(ROOT, 'lib/shared/ui.jsx'), 'utf8');
  const mut = (from, to) => { if (!shipped.includes(from)) throw new Error('mutant has no target: ' + from); return shipped.replace(from, to); };
  const list = [
    ['the cut, 3bf3031c3 (the bug)', execFileSync('git', ['show', '3bf3031c3:lib/shared/ui.jsx'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })],
    ['the resolver ignored', mut("if (known) return S.isBookActive(index, mineSide, k);", '')],
    ['presence rule: absent reads off', mut('!theirSide.override[k];', 'false;')],
    ['v1 not normalized', mut('return S ? S.normalize(x) : { override: (x && x.override) || {} };', 'return { override: (x && x.override) || (x && typeof x === "object" ? x : {}) };')],
    ['an empty index counts as known', mut('Object.keys(index.byId).length', '1')],
    ['needs window', mut("var S = typeof window !== 'undefined' && window ? window.SWRPGSources : null;", 'var S = window.SWRPGSources;')],
    ['the word off the wrong side', mut("(isOn(a, b, k) ? ' on' : ' off')", "(isOn(b, a, k) ? ' on' : ' off')")],
    ['the count off the wrong side', mut('differing.filter(function (k) { return isOn(a, b, k); }).length', 'differing.filter(function (k) { return isOn(b, a, k); }).length')],
    ['not sorted', mut('Object.keys(names).sort().filter', 'Object.keys(names).filter')],
    ['a sentence reworded', mut("'the same books, stored differently'", "'the same books'")],
  ];
  const dir = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'b1735-bites-'));
  let bad = 0;
  list.forEach(([name, text]) => {
    const f = path.join(dir, 'ui.jsx');
    fs.writeFileSync(f, text);
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1735_UI: f }), encoding: 'utf8' });
    const fails = (r.stdout.match(/^ {2}FAIL/gm) || []).length;
    console.log('  ' + (r.status === 1 ? 'BIT   ' : 'DID NOT BITE ') + name + ' · exit ' + r.status + ' · ' + fails + ' asserts red');
    if (r.status !== 1) bad++;
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? 'BITES: ' + bad + ' did not bite' : 'BITES: all ' + list.length + ' bit');
  process.exit(bad ? 1 : 0);
}

const SS = require(path.join(ROOT, 'lib/shared/sources.js'));
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/books.vocab.json'), 'utf8'));
const index = SS.buildIndex(vocab);
const ui = fs.readFileSync(UI_PATH, 'utf8');
const a = ui.indexOf(START), b = ui.indexOf(END);
if (a < 0 || b <= a) { console.error('REFUSED: the conflict-copy region is not in ui.jsx'); process.exit(2); }
const load = (win) => new Function('window', ui.slice(a, b) + '\nreturn { describeConflict: describeConflict };')(win);
let fails = 0, passes = 0;
const check = (name, ok, got) => { if (ok) { passes++; console.log('  PASS  ' + name); } else { fails++; console.log('  FAIL  ' + name + (got === undefined ? '' : ' -> ' + JSON.stringify(got))); } };
const safe = (fn) => { try { return fn(); } catch (e) { return { threw: String(e.message || e), here: '', there: '' }; } };

const FULL = load({ SWRPGSources: SS, _swrpgSourcesIndex: index });
const FAILED = load({ SWRPGSources: SS, _swrpgSourcesIndex: SS.buildIndex({ entries: [] }) });
const NOT_YET = load({ SWRPGSources: SS });
const BARE = load(undefined);
const KEY = 'swrpg_active_sources';
const ask = (UI, h, t) => safe(() => UI.describeConflict({ key: KEY, kind: 'envelope', local: h, remote: t }));
const env = (o) => ({ version: 2, override: o });
const SAME = 'the same books, stored differently';
const ids = Object.keys(index.byId);
const official = (id) => ['Core', 'Era', 'Supplement'].includes(index.byId[id].group);
const OFF = ids.filter(official), OPT = ids.filter((i) => !official(i));
const label = (id) => index.byId[id].label;
const RISE = 'rise_of_the_separatists', COLLAPSE = 'collapse_of_the_republic', HEROES = 'heroes_on_both_sides';

// The truth, independently: the resolver over each side, sorted by id
function truth(h, t) {
  const on = (s, id) => SS.isBookActive(index, s, id);
  const T = ids.filter((id) => on(h, id) !== on(t, id)).sort();
  if (!T.length) return { here: SAME, there: SAME, T };
  if (T.length > 3) {
    const n = (s) => T.filter((id) => on(s, id)).length;
    return { here: T.length + ' books differ — ' + n(h) + ' on here, ' + (T.length - n(h)) + ' off', there: T.length + ' books differ — ' + n(t) + ' on here, ' + (T.length - n(t)) + ' off', T };
  }
  const line = (s) => T.map((id) => label(id) + (on(s, id) ? ' on' : ' off')).join(', ');
  return { here: line(h), there: line(t), T };
}
const matches = (UI, h, t) => { const d = ask(UI, h, t), w = truth(h, t); return d.here === w.here && d.there === w.there ? true : { said: d, truth: w }; };
const everyBook = (name, list, h, t) => {
  const wrong = list.map((id) => [id, matches(FULL, env(h(id)), env(t(id)))]).filter(([, r]) => r !== true);
  check(name + ' (' + list.length + ' books)', list.length > 0 && !wrong.length, wrong[0]);
};

console.log('— the harness'); check('the region was found, and the vocabulary is the shipped one (67 books, 51 official)', ids.length === 67 && OFF.length === 51, [ids.length, OFF.length]);

console.log('— fact 1, every row, the vocabulary in hand');
everyBook('official false / absent names the book', OFF, (id) => ({ [id]: false }), () => ({}));
everyBook('official true / false names the book', OFF, (id) => ({ [id]: true }), (id) => ({ [id]: false }));
everyBook('official true / absent: both on, says the same', OFF, (id) => ({ [id]: true }), () => ({}));
everyBook('off by default true / absent names the book', OPT, (id) => ({ [id]: true }), () => ({}));
everyBook('off by default true / false names the book', OPT, (id) => ({ [id]: true }), (id) => ({ [id]: false }));
everyBook('off by default false / absent: both off, says the same', OPT, (id) => ({ [id]: false }), () => ({}));
{ const d = ask(FULL, env({ [RISE]: false }), env({ [COLLAPSE]: false }));
  check('Rise off here, Collapse off there names both, truly, one order on both sides',
    d.here === 'Collapse of the Republic on, Rise of the Separatists off' && d.there === 'Collapse of the Republic off, Rise of the Separatists on', d); }

console.log('— the 56 pairs: every pair of different sides setBook can reach over three books');
const states = [];
[false, true].forEach((x) => [false, true].forEach((y) => [false, true].forEach((z) => {
  let s = env({});
  if (x) s = SS.setBook(s, index, RISE, false).state;
  if (y) s = SS.setBook(s, index, COLLAPSE, false).state;
  if (z) s = SS.setBook(s, index, HEROES, true).state;
  states.push(s);
})));
{ let n = 0; const wrong = [];
  states.forEach((x) => states.forEach((y) => { if (x !== y) { n++; const r = matches(FULL, x, y); if (r !== true) wrong.push(r); } }));
  check('56 of 56 exact', n === 56 && !wrong.length, { n, wrong: wrong.length, first: wrong[0] });
  ['FAILED', 'BARE'].forEach((road) => {
    const UI = road === 'FAILED' ? FAILED : BARE; let bad = 0;
    // no vocabulary, so a title is the readable id: judged by the words on and off per id, which is all this road can say
    states.forEach((x) => states.forEach((y) => { if (x !== y) { const d = ask(UI, x, y), T = truth(x, y).T;
      const words = (s, line) => T.every((id) => line.includes(' ' + (SS.isBookActive(index, s, id) ? 'on' : 'off'))) && line.split(', ').length === T.length;
      if (d.threw || !words(x, d.here) || !words(y, d.there)) bad++; } }));
    check('56 of 56 true on the ' + road + ' road too (setBook\'s shapes)', bad === 0, bad);
  }); }

console.log('— past three: the count');
{ const h = {}; OFF.slice(0, 5).forEach((id) => { h[id] = false; }); OPT.slice(0, 4).forEach((id) => { h[id] = true; });
  const d = ask(FULL, env(h), env({}));
  check('5 official off + 4 community on | nothing changed reads 9, 4 on, 5 off, and its mirror',
    d.here === '9 books differ — 4 on here, 5 off' && d.there === '9 books differ — 5 on here, 4 off', d);
  check('three is still named, four is counted',
    !/books differ/.test(ask(FULL, env({ [OFF[0]]: false, [OFF[1]]: false, [OFF[2]]: false }), env({})).here)
    && /^4 books differ/.test(ask(FULL, env({ [OFF[0]]: false, [OFF[1]]: false, [OFF[2]]: false, [OFF[3]]: false }), env({})).here)); }

console.log('— the true case and the old shapes');
{ const d = ask(FULL, env({ [HEROES]: false }), env({}));
  check('the true case keeps its sentence, both sides', d.here === SAME && d.there === SAME, d);
  const v = ask(FULL, { version: 1, override: {} }, env({})); check('a version alone keeps its sentence', v.here === SAME && v.there === SAME, v);
  const f = ask(FULL, env({ future_book: false }), env({})); check('a book with no row, false / absent, keeps its sentence', f.here === SAME && f.there === SAME, f);
  [[{ off: { [RISE]: true } }, 'v1 off-map'], [{ version: 1, off: [RISE] }, 'v1 off-list']].forEach(([v1, n]) => {
    const s = ask(FULL, v1, env({ [RISE]: false })); check(n + ' against its own v2 says the same', s.here === SAME && s.there === SAME, s);
    const t = ask(FULL, v1, env({})); check(n + ' against nothing names Rise, no keys read as books', t.here === 'Rise of the Separatists off' && t.there === 'Rise of the Separatists on', t);
  });
  const n = ask(FULL, null, env({ [RISE]: false })); check('a null side does not throw and names the book', n.here === 'Rise of the Separatists on' && n.there === 'Rise of the Separatists off', n); }

console.log('— no vocabulary: three roads, none throws');
[['a failed vocabulary', FAILED], ['the index not yet in', NOT_YET], ['no window (sync_pins_key\'s slice)', BARE]].forEach(([name, UI]) => {
  const d = ask(UI, env({ [RISE]: false }), env({ [COLLAPSE]: false }));
  check(name + ': Rise off here, Collapse off there names both', !d.threw && /Collapse of the Republic on/.test(d.here) && /Rise of the Separatists off/.test(d.here) && /Collapse of the Republic off/.test(d.there) && /Rise of the Separatists on/.test(d.there), d);
  const s = ask(UI, env({ [RISE]: false }), env({ [RISE]: false })); check(name + ': one value on both sides is the same', s.here === SAME, s);
});
{ const d = ask(FAILED, env({ [HEROES]: false }), env({}));
  check('ACCEPTED by ADDENDUM 560: on the failed road the true case reads off / on', d.here === 'Heroes on Both Sides off' && d.there === 'Heroes on Both Sides on', d); }

console.log(passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
