/*
 * b1054_choice_talent_head.cjs — B-1054 / B-1033 (3): an owned choice talent's cell (Well Rounded, Well Read) opens
 * ITS OWN picker, never M8's per-rank pick.
 *
 * THE DEFECT (measured at the cut e321b7668, release-r7-sheet-layout-and-receipts STEP 0): M8 B1 (`ce1ac8638`) authored
 * Well Rounded's and Well Read's `told` rows with `pick: { id: 'career_skills', per: 'rank', kind: 'skill' }` (the id
 * R-M8G-3 made CONTRACT for exactly these two). treeView's `m8Decl` takes ANY per-rank skill/item pick, so the owned
 * cell carried `m8Pick`, its head opened M8's picker ("choose the skill for this rank", one skill), and
 * CharResolve.pickWrite REFUSES `career_skills` ("a legacy pick id; its writer is the legacy map (R-M8G-3)"): the
 * player's choice dropped silently, and the B-181 prompt (OWNED · NEEDS ITS SKILLS) and its receipt (CAREER SKILLS
 * CHOSEN) became unreachable from the tree. `smoke_b181_talent_choice` reads it red from the phone's receipt leg on.
 *
 * LEGS (the BUILT lib/shared/treeView.js, the shipped charResolve, the real registries):
 *   1. CharResolve names the legacy pick ids (the one vocabulary; treeView does not restate it).
 *   2. an owned Well Rounded with no picks: m8Pick null, needsChoice true (its head reaches the B-181 prompt).
 *   3. an owned Well Rounded with its two picks: m8Pick null, the receipt names both skills.
 *   4. Well Read the same as 2.
 *   5. a real M8 per-rank pick (Deadly Accuracy) still carries m8Pick (the exclusion is the legacy ids only).
 * Run: node test/b1054_choice_talent_head.cjs   (after `npm run build`). Exit 0 green · 1 red.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let fails = 0, passes = 0;
const check = (label, ok, detail) => { if (ok) { passes++; console.log('  PASS  ' + label); } else { fails++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));

const CR = require('../lib/shared/charResolve.js');
const talents = J('talents.json').talents, specs = J('specializations.json').specializations;
const skillNames = {}; J('skills.vocab.json').entries.forEach((e) => { skillNames[e.id] = e.label; });

const built = path.join(ROOT, 'lib/shared/treeView.js');
if (!fs.existsSync(built)) { console.log('  FAIL  lib/shared/treeView.js is not built — run `npm run build`'); process.exit(1); }
const noop = () => null;
const React = { createElement: noop, Fragment: 'F', useState: (v) => [v, noop], useEffect: noop, useRef: (v) => ({ current: v }), useMemo: (f) => f(), useCallback: (f) => f, useLayoutEffect: noop };
const win = { CharResolve: CR, React, SWRPGUI: { formatActivation: (a) => String(a || '') } };
const sb = { window: win, CharResolve: CR, React, console, document: { addEventListener: noop, querySelector: noop, querySelectorAll: () => [] } };
sb.window.window = win;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(built, 'utf8'), sb);
const TV = win.SWRPGTree;
check('the built tree exposes talentTreeToModel', !!(TV && typeof TV.talentTreeToModel === 'function'));
if (!TV || typeof TV.talentTreeToModel !== 'function') { console.log('\nb1054_choice_talent_head: ' + passes + ' pass, ' + fails + ' fail'); process.exit(1); }

// 1 — the one vocabulary
check('1 CharResolve.isLegacyPick names career_skills and characteristic, and no M8 id',
  typeof CR.isLegacyPick === 'function' && CR.isLegacyPick('career_skills') && CR.isLegacyPick('characteristic') && !CR.isLegacyPick('da_skill'));

function findCell(talentId) {
  for (const sid of Object.keys(specs)) {
    const tree = specs[sid].talent_tree || [];
    for (let ri = 0; ri < tree.length; ri++) {
      const cells = tree[ri].talents || [];
      for (let ci = 0; ci < cells.length; ci++) if (cells[ci] && cells[ci].talent === talentId) return { sid, ri, ci };
    }
  }
  return null;
}
function cellEntry(talentId, picks) {
  try { return cellEntry_(talentId, picks); } catch (e) { return { threw: String(e && e.message || e).slice(0, 200) }; }
}
function cellEntry_(talentId, picks) {
  const at = findCell(talentId); if (!at) return { missing: talentId };
  const pos = at.ri + '-' + at.ci;
  const model = TV.talentTreeToModel({ specData: Object.assign({ id: at.sid }, specs[at.sid]), talentDb: talents,
    character: { talents: { [at.sid + '_r' + at.ri + 'c' + at.ci]: true } }, readOnly: false, availableXp: 50, skillNames,
    talentSkillChoices: picks ? { [at.sid]: { [pos]: picks } } : {}, characteristicChoices: {}, talentChoices: {}, onBuy: noop, onRefund: noop });
  const rows = (model && model.rows) || [];
  const cell = ((rows[at.ri] || {}).cells || [])[at.ci];
  return (cell && cell.entry) || { noEntry: true, model: Object.keys(model || {}) };
}

const wr = cellEntry('well_rounded');
check('2 owned Well Rounded, no picks: no M8 pick on the cell (its head is the B-181 prompt\'s)', !wr.m8Pick, wr.m8Pick || wr);
check('2 owned Well Rounded, no picks: needsChoice', wr.needsChoice === true, wr.needsChoice);
const wr2 = cellEntry('well_rounded', ['charm', 'cool']);
check('3 owned Well Rounded, picked: no M8 pick', !wr2.m8Pick, wr2.m8Pick);
check('3 owned Well Rounded, picked: the receipt names both skills', Array.isArray(wr2.choiceReceipt) && wr2.choiceReceipt.length === 2, wr2.choiceReceipt);
const wd = cellEntry('well_read');
check('4 owned Well Read, no picks: no M8 pick, needsChoice', !wd.m8Pick && wd.needsChoice === true, { m8: wd.m8Pick, needs: wd.needsChoice });
const da = cellEntry('deadly_accuracy');
check('5 an owned Deadly Accuracy still carries its M8 pick (only the legacy ids are excluded)', !!(da.m8Pick && da.m8Pick.kind === 'skill'), da.m8Pick || da);

console.log('\nb1054_choice_talent_head: ' + passes + ' pass, ' + fails + ' fail');
process.exit(fails ? 1 : 0);
