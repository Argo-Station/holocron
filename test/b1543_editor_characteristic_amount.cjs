/**
 * b1543_editor_characteristic_amount.cjs — B-1543 (ruling `release-r7-bug-burndown` ADDENDUM 54, HANDOFF release-r7-homebrew):
 * the homebrew editor's read-line (`rnRead`) and preview (`m8Preview`) name a damage bonus whose amount is one CHARACTERISTIC
 * (`amount: {of: 'characteristic', key}`) as that characteristic — never as "your ranks in the picked skill".
 *
 *   C1  every canonical talent with a characteristic-amount roll_numbers row reads "equal to your <Characteristic>" in both,
 *       and neither says "picked skill" (Anatomy Lessons, Deathblow, Falling Avalanche, Soft Spot, Targeted Blow).
 *   C2  a skill_ranks row with a picked skill still reads as the picked skill (the branch it shared is unchanged).
 *
 * Harness: f100_m8_editor_verbs' (esbuild over lib/editor/view.jsx, a splice handing out the two functions).
 * Run: node test/b1543_editor_characteristic_amount.cjs [path/to/view.jsx]   (the arg measures another source, e.g. the cut's)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + String(detail).slice(0, 300) : '')); } };
const ANCHOR = 'window.SWRPGEditorView = {';
const SPLICE = 'window.__B1543 = { rnRead: rnRead, m8Preview: m8Preview };\n  ' + ANCHOR;
function load(src) {
  if (src.split(ANCHOR).length !== 2) throw new Error('splice anchor moved — re-derive this guard');
  const js = esbuild.transformSync(src.replace(ANCHOR, SPLICE), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2020' }).code;
  const R = { createElement: () => null, Fragment: 'F', useState: (v) => [v, () => {}], useEffect() {}, useLayoutEffect() {}, useRef: (v) => ({ current: v }), useCallback: (f) => f, useMemo: (f) => f(), useContext: () => null };
  const win = { React: R, SWRPGEditor: {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  win.SWRPGTextHash = require(path.join(ROOT, 'lib/shared/textHash.js'));
  const EC = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'lib/shared/effectClass.js'), 'utf8'), { module: EC, window: win, self: win });
  win.SWRPGEffectClass = win.SWRPGEffectClass || EC.exports;
  const ctx = { window: win, React: R, console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Date, Promise, setTimeout, clearTimeout, document: undefined, navigator: { userAgent: 'node' } };
  vm.createContext(ctx); vm.runInContext(js, ctx);
  return win.__B1543;
}
const src = process.argv[2] ? fs.readFileSync(path.resolve(process.argv[2]), 'utf8') : fs.readFileSync(path.join(ROOT, 'lib/editor/view.jsx'), 'utf8');
const ED = load(src);
const talents = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/talents.json'), 'utf8'));
const recs = Object.values(talents.talents || talents).filter((t) => t && Array.isArray(t.roll_numbers));
const vocab = { skills: [] };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

console.log('C1 — a characteristic amount names the characteristic');
const hits = recs.filter((t) => t.roll_numbers.some((rn) => rn.amount && rn.amount.of === 'characteristic'));
check(hits.length >= 5, 'the census finds the row\'s five talents (at least)', hits.map((t) => t.name).join(', '));
hits.forEach((t) => {
  t.roll_numbers.filter((rn) => rn.amount && rn.amount.of === 'characteristic').forEach((rn) => {
    const want = 'equal to your ' + cap(rn.amount.key);
    const line = ED.rnRead(rn, vocab);
    check(line.includes(want) && !/picked skill|ranks in/.test(line) && !/undefined/.test(line), t.name + ' · read-line: ' + JSON.stringify(line));
    const pv = ED.m8Preview({ roll_numbers: [rn] }, vocab, 1).map((r) => r.join(' — ')).join(' | ');
    check(pv.includes(want) && !/picked|ranks in/.test(pv) && !/undefined/.test(pv), t.name + ' · preview: ' + JSON.stringify(pv));
  });
});

console.log('C2 — the picked-skill branch is unchanged');
const picked = { op: 'damage_delta', amount: { of: 'skill_ranks', chosen: true } };
check(/ranks in the picked skill/.test(ED.rnRead(picked, vocab)), 'a picked skill_ranks row still reads the picked skill');
check(/the skill you picked/.test(ED.m8Preview({ roll_numbers: [picked] }, vocab, 1)[0][0]), 'and previews the same');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
