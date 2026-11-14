/**
 * b1283_plate_never_paints_id.cjs — B-1283 (ruling `release-r7-bug-burndown` ADDENDUM 54, HANDOFF release-r7-homebrew):
 * MY COLLECTIONS' plate never paints a record ID while a shared collection rebuilds.
 *
 * THE CAUSE (STEP 0, a MutationObserver over 20 runs of smoke_homebrew_items R1's steps at the cut: 20/20 frames read
 * "custom_friends_pack_guild_holdout · NEW WEAPON · 0 CHANGES"): an imported derive is stored as its PATCH (`_changes`), and
 * until the book records load `recordIn` has no book to rebuild it over, so the record has no `name` and `recordsOf` fell
 * back to the id (and counted 0 changes).
 *
 *   P1  pending (no book yet): the row's name is the patch's own name, never the id; its change count is unknown (null), not 0
 *   P2  pending, and the patch does not rename: the name is '' (nothing), never the id
 *   P3  loaded (the book is there): the rebuilt record's name, as before
 *   P4  a plain added record keeps its name; a record with no name and no patch still reads its id (that fallback is unchanged)
 *
 * Harness: esbuild over lib/editor/view.jsx with a splice handing out recordsOf; SWRPGUserData stubbed to the five calls it makes.
 * Run: node test/b1283_plate_never_paints_id.cjs [path/to/view.jsx]   (the arg measures another source, e.g. the cut's)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + String(detail).slice(0, 300) : '')); } };
const ANCHOR = 'window.SWRPGEditorView = {';
const ID = 'custom_friends_pack_guild_holdout';
const PACK = { ck: 'friends_pack', packId: 'friends_pack', origin: 'imported', pack: { sections: { weapons: {
  [ID]: { _mode: 'derive', _base: { id: 'holdout_blaster' }, _changes: { name: 'Guild Holdout', qualities: [{ id: 'vicious', rank: 1 }] } },
  custom_friends_pack_quiet: { _mode: 'derive', _base: { id: 'holdout_blaster' }, _changes: { damage: 6 } },
  custom_friends_pack_own: { name: 'Own Blade', damage: 3 },
  custom_friends_pack_bare: { damage: 1 },
} } } };
const UDSTUB = {
  get: (ck) => (ck === 'friends_pack' ? PACK : null), list: () => [{ ck: 'friends_pack', name: "Friend's Pack", active: true }],
  split: () => null, baseState: () => 'ok', bookChanged: () => false,
  rebuildShare: (book, raw) => Object.assign({}, book, raw._changes, { _mode: raw._mode, _base: raw._base }),
};
function load(src) {
  if (src.split(ANCHOR).length !== 2) throw new Error('splice anchor moved — re-derive this guard');
  const js = esbuild.transformSync(src.replace(ANCHOR, 'window.__B1283 = { recordsOf: recordsOf };\n  ' + ANCHOR), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2020' }).code;
  const R = { createElement: () => null, Fragment: 'F', useState: (v) => [v, () => {}], useEffect() {}, useLayoutEffect() {}, useRef: (v) => ({ current: v }), useCallback: (f) => f, useMemo: (f) => f(), useContext: () => null };
  const win = { React: R, SWRPGEditor: {}, SWRPGUserData: UDSTUB, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  win.SWRPGTextHash = require(path.join(ROOT, 'lib/shared/textHash.js'));
  const EC = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'lib/shared/effectClass.js'), 'utf8'), { module: EC, window: win, self: win });
  win.SWRPGEffectClass = win.SWRPGEffectClass || EC.exports;
  const ctx = { window: win, React: R, console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Date, Promise, setTimeout, clearTimeout, document: undefined, navigator: { userAgent: 'node' } };
  vm.createContext(ctx); vm.runInContext(js, ctx);
  return win.__B1283;
}
const src = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'lib/editor/view.jsx'), 'utf8');
const ED = load(src);
const by = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

const pending = by(ED.recordsOf('friends_pack', { sections: {} }));
check(pending[ID] && pending[ID].name === 'Guild Holdout', 'P1 pending: the derive reads its patch\'s name "Guild Holdout"', pending[ID] && pending[ID].name);
check(pending[ID] && pending[ID].changes === null, 'P1 pending: its change count is unknown (null), not 0', pending[ID] && pending[ID].changes);
check([ID, 'custom_friends_pack_quiet'].every((k) => pending[k] && !/^custom_/.test(pending[k].name)), 'P1/P2 pending: no patched row names a record id', Object.values(pending).map((r) => r.name));
check(pending.custom_friends_pack_quiet && pending.custom_friends_pack_quiet.name === '', 'P2 pending, no rename in the patch: the name is nothing', pending.custom_friends_pack_quiet && JSON.stringify(pending.custom_friends_pack_quiet.name));

const books = { sections: { weapons: { holdout_blaster: { id: 'holdout_blaster', name: 'Holdout Blaster', damage: 5 } } } };
const loaded = by(ED.recordsOf('friends_pack', books));
check(loaded[ID].name === 'Guild Holdout' && loaded.custom_friends_pack_quiet.name === 'Holdout Blaster', 'P3 loaded: the rebuilt records\' names', [loaded[ID].name, loaded.custom_friends_pack_quiet.name]);
check(loaded[ID].baseName === 'Holdout Blaster', 'P3 loaded: "from Holdout Blaster" is back', loaded[ID].baseName);
check(loaded.custom_friends_pack_own.name === 'Own Blade', 'P4 an added record keeps its name', loaded.custom_friends_pack_own.name);
check(loaded.custom_friends_pack_bare.name === 'custom_friends_pack_bare', 'P4 a nameless unpatched record still reads its id (fallback unchanged)', loaded.custom_friends_pack_bare.name);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
