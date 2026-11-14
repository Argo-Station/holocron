/**
 * f100_m10_b1227_dup_names.cjs — STANDING guard: B-1227, two abilities of one name are refused on EVERY path (ruling
 * `f100-m10-editor-card` R-M10E-6; K4 (b)'s drawn words "Two abilities are called Night Vision. Rename one.", DISCLOSED for
 * the rename path K4 (a)'s picker cannot reach).
 *
 *   E1  the editor's save check (speciesCheck, lib/editor/view.jsx) refuses a copy of Human holding two "Night Vision"
 *       abilities in the drawn words; a trailing space or other case is the same name; one Night Vision is not refused.
 *   E2  no book species is refused by it: 537 of 537 copies pass the duplicate check (counted).
 *   E3  census row C5 (frames census, KEEP; R-M10E-9): an ability with no name is still refused "Give every ability a name.",
 *       and two nameless abilities are not ALSO called duplicates (a blank is no name, so B-1227's words never read "called .").
 *   P1  the pack rail (packValidate.crossField's species arm) refuses the same record with the same words, and authoring
 *       refuses a pack holding it; the single-Night-Vision record passes.
 *   P2  no book species is refused by the rail's arm: 537 of 537 (counted).
 *   BITES (B1227_BITES=1): the editor's check removed (E1 must fail), the rail's arm removed (P1 must fail) and the
 *       editor's nameless-ability refusal removed (E3 must fail), each on a
 *       temp copy, each child EXITS 1 with its leg among the FAILs.
 *
 * Run: node test/f100_m10_b1227_dup_names.cjs   ·   bites: B1227_BITES=1 node test/f100_m10_b1227_dup_names.cjs
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const VIEW = process.env.B1227_VIEW || path.join(ROOT, 'lib/editor/view.jsx');
const PVP = process.env.B1227_PV || path.join(ROOT, 'lib/shared/packValidate.js');
const WORDS = 'Two abilities are called Night Vision. Rename one.';

const MUTANTS = [
  { file: 'VIEW', src: path.join(ROOT, 'lib/editor/view.jsx'), leg: 'E1', name: 'the editor\'s duplicate check removed',
    from: "      if (seenN[key] === 1) w.push(SW.twoCalled(n));\n", to: "\n" },
  { file: 'PV', src: path.join(ROOT, 'lib/shared/packValidate.js'), leg: 'P1', name: 'the rail\'s duplicate arm removed',
    from: "          if (seenN[key] === 1) out.push({ path: ['special_abilities', i, 'name'], msg: 'Two abilities are called ' + n + '. Rename one. (B-1227)' });\n", to: "\n" },
  { file: 'VIEW', src: path.join(ROOT, 'lib/editor/view.jsx'), leg: 'E3', name: 'the editor\'s nameless-ability refusal removed (census C5)',
    from: "    if ((rec.special_abilities || []).some(function (a) { return !a.name; })) w.push(SW.needAbilityName);\n", to: "\n" },
];
if (process.env.B1227_BITES === '1') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f100-m10-b1227-'));
  let bad = 0;
  MUTANTS.forEach((m, i) => {
    const src = fs.readFileSync(m.src, 'utf8'), n = src.split(m.from).length - 1;
    if (n !== 1) { bad++; console.log(`  VOID  M${i + 1} ${m.name}: the text occurs ${n} times`); return; }
    const sub = path.join(dir, 'm' + (i + 1)); fs.cpSync(path.dirname(m.src), sub, { recursive: true });
    const out = path.join(sub, path.basename(m.src)); fs.writeFileSync(out, src.replace(m.from, m.to));
    const env = Object.assign({}, process.env, { B1227_BITES: '' }); env['B1227_' + m.file] = out;
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', env });
    const fails = (r.stdout || '').split('\n').filter((l) => l.indexOf('  FAIL  ') === 0).map((l) => l.slice(8, 50));
    const bit = r.status === 1 && fails.some((f) => f.indexOf(m.leg) === 0);
    if (!bit) bad++;
    console.log(`  ${bit ? 'BIT ' : 'MISS'}  M${i + 1} ${m.name}: exit ${r.status}, FAILs ${fails.join(' · ')}`);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? `\nb1227 bites: ${bad} did not bite` : `\nb1227 bites: ALL ${MUTANTS.length} BIT`);
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + JSON.stringify(detail).slice(0, 300) : '')); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
const SPLICE = 'window.__B1227 = { speciesCheck: speciesCheck };\n  window.SWRPGEditorView = {';
function loadView(src) {
  if (src.split('window.SWRPGEditorView = {').length !== 2) throw new Error('splice anchor moved — re-derive this guard');
  const js = esbuild.transformSync(src.replace('window.SWRPGEditorView = {', SPLICE), { loader: 'jsx', target: 'es2020' }).code;
  const R = { createElement: () => null, Fragment: 'F', useState: (v) => [v, () => {}], useEffect() {}, useLayoutEffect() {}, useRef: (v) => ({ current: v }), useCallback: (f) => f, useMemo: (f) => f(), useContext: () => null };
  const win = { React: R, SWRPGEditor: { OPEN_SHELVES: ['species'] }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  const ctx = { window: win, React: R, console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Date, Promise, setTimeout, clearTimeout, navigator: { userAgent: 'node' } };
  vm.createContext(ctx); vm.runInContext(js, ctx);
  return win.__B1227;
}
const ED = loadView(fs.readFileSync(VIEW, 'utf8'));
const PV = require(PVP);
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const SP = J('public/data/canonical/species.json').species;
const NV = SP.csg_arkanian.special_abilities[0];
const human = Object.assign(clone(SP.human), { id: 'custom_my_data_human' });
const twice = clone(human); twice.special_abilities.push(clone(NV)); twice.special_abilities[0].name = 'Night Vision';
const spaced = clone(human); spaced.special_abilities.push(clone(NV)); spaced.special_abilities[0].name = ' night vision ';
const once = clone(human); once.special_abilities.push(clone(NV));
const words = (r) => { const c = ED.speciesCheck(r); return c ? c.words : []; };

console.log('F-100 M10 · B-1227, two abilities of one name');
check(words(twice).indexOf(WORDS) !== -1 && words(spaced).some((w) => /^Two abilities are called /.test(w)) && !words(once).some((w) => /^Two abilities/.test(w)),
  'E1 the editor\'s save check refuses two Night Visions in the drawn words (any case, any spaces); one is not refused', { twice: words(twice), once: words(once) });
{
  const hit = Object.keys(SP).filter((id) => words(Object.assign(clone(SP[id]), { name: SP[id].name || id })).some((w) => /^Two abilities/.test(w)));
  check(Object.keys(SP).length === 537 && hit.length === 0, `E2 the editor's check refuses no book species: ${537 - hit.length} of ${Object.keys(SP).length}`, hit.slice(0, 5));
}
{
  const blank = clone(human); blank.special_abilities.push(clone(NV)); blank.special_abilities[1].name = '';
  const blanks = clone(blank); blanks.special_abilities[0].name = '  ';
  const w1 = words(blank), w2 = words(blanks);
  check(w1.indexOf('Give every ability a name.') !== -1 && w2.indexOf('Give every ability a name.') !== -1 && !w2.some((w) => /^Two abilities/.test(w)),
    'E3 census C5 kept: a nameless ability is refused "Give every ability a name."; two blanks are not called duplicates', { one: w1, two: w2 });
}
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = J('public/data/canonical/' + s + '.json')[s]; });
const V = PV.create(PV.readSchemaDir(path.join(ROOT, 'schema')));
const rail = (r) => V.crossField('species', r).map((x) => x.msg);
{
  const fixture = J('schema/fixtures/user-pack.example.json');
  const pack = clone(fixture); Object.keys(pack.sections).forEach((s) => { pack.sections[s] = {}; });
  const rec = Object.assign(clone(twice), { _mode: 'add' }); delete rec._provenance; delete rec._source_key;
  pack.sections.species = { [rec.id]: rec };
  const vocab = (f) => J('public/data/canonical/' + f).entries.map((e) => e.id);
  const auth = V.authoring(pack, { base: BASE, vocab: { skills: vocab('skills.vocab.json'), qualities: vocab('qualities.vocab.json') }, others: [] });
  check(rail(twice).some((m) => m.indexOf(WORDS) === 0) && !rail(once).some((m) => /Two abilities/.test(m)) && auth.ok === false && auth.reasons.some((r) => r.indexOf(WORDS) !== -1),
    'P1 the pack rail refuses the same record in the same words (crossField and authoring); one Night Vision passes', { rail: rail(twice), auth: auth.reasons && auth.reasons.slice(0, 3) });
}
{
  const hit = Object.keys(SP).filter((id) => rail(SP[id]).some((m) => /Two abilities/.test(m)));
  check(hit.length === 0, `P2 the rail's arm refuses no book species: ${537 - hit.length} of 537`, hit.slice(0, 5));
}
console.log(fail ? `\nf100_m10_b1227_dup_names: ${fail} FAILED` : `\nf100_m10_b1227_dup_names: ALL ${pass} PASS`);
process.exit(fail ? 1 : 0);
