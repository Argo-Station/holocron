#!/usr/bin/env node
/**
 * f100_m5_change_count.cjs — ruling `f100-m5-contracts` ADDENDUM 1, R-M5K-A1-2 (a) / C1.3a and A1-4 (i): a change count treats
 * an ABSENT `effects` / `pool_mods` key and `[]` as EQUAL. The save writes both keys (C1.3); the count must not report them.
 *
 * THE SHIPPED CODE, NOT A COPY: the editor's source (lib/editor/view.jsx), compiled by the repo's own esbuild, is loaded in a vm with a
 * stub React, and its own
 * `userChanged` (exported on SWRPGEditorView._test) is asked about a split the REAL store computes (lib/shared/userData.js):
 *   Fleet Foot derived as "Fleet Stride" (a new name, a new description) — the book record carries neither key; the save writes
 *   both as [] → 2 changes (name, description), never 4.
 * Rows: 1 the save wrote both keys, and the split doesn't list them (the premise, re-pointed by `release-r7-bug-burndown` ADDENDUM 554, D-PPC1 (a),
 * since ADDENDUM 546 B moved the cover into the split's own read); 2 userChanged counts 2; 3 a real effect IS counted (3);
 * 4 BITE: yoursAsBook's delete removed from the store's source → the split lists 4;
 * 5 userChanged's filter still has a case of its own: an anchor holding a real list, a copy that emptied it, and a book that later emptied it too.
 *   The split lists it (a conflict, both moved); the count doesn't. BITE: the filter removed from the source → the count goes up by one.
 *
 * Run: node test/f100_m5_change_count.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const USERDATA = path.join(ROOT, 'lib/shared/userData.js');
const U = require(USERDATA);
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
let fails = 0, passes = 0;
const check = (c, l, d) => { if (c) passes++; else fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + l + (!c && d !== undefined ? '   -> ' + JSON.stringify(d).slice(0, 300) : '')); };
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
const vocab = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries;
const VOCAB = { skills: vocab('skills.vocab.json').map((e) => e.id), qualities: vocab('qualities.vocab.json').map((e) => e.id) };
function loadEditor(src) {
  const React = { createElement: () => null, Fragment: 'F', useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect() {}, useRef: (v) => ({ current: v }), useCallback: (f) => f, useLayoutEffect() {} };
  const win = { React, SWRPGEditor: {}, addEventListener() {}, removeEventListener() {} };
  const ctx = { window: win, React, console, JSON, Math, Object, Array, String, Number, Promise, setTimeout, clearTimeout };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return win.SWRPGEditorView._test;
}
// The store from its own source with one line changed, for a bite. In memory: nothing is written to the tree.
function loadStore(src) {
  const m = new Module(USERDATA, module);
  m.filename = USERDATA; m.paths = Module._nodeModulePaths(path.dirname(USERDATA));
  m._compile(src, USERDATA);
  return m.exports;
}
(async function main() {
  const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
  const JSX = fs.readFileSync(path.join(ROOT, 'lib/editor/view.jsx'), 'utf8');
  const compile = (code) => esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2020' }).code;
  const src = compile(JSX);
  const T = loadEditor(src);
  const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
  const openStore = async (Store, adapter, base) => { const S = Store.createStore({ adapter, schemas: SCHEMAS, vocab: VOCAB, base }); await S.ready(); return S; };
  const saveFleetFoot = async (S) => {
    const rec = Object.assign({}, JSON.parse(JSON.stringify(BASE.talents.swift)), { name: 'Fleet Foot', description: 'Our table: move a little further.', effects: [], pool_mods: [] });
    delete rec.id;
    const sv = await S.saveRecord('my_data', 'talents', rec, { create: true, mint: true, from: 'swift' });
    const stored = S.get('my_data').pack.sections.talents[sv.id];
    return { sv, stored, sp: S.split('talents', sv.id, stored) };
  };
  const H = await openStore(U, U.memoryAdapter(), BASE);
  const book = BASE.talents.swift;
  const { sv, stored, sp } = await saveFleetFoot(H);
  const listed = sp.yours.concat(sp.conflict);
  check(sv.ok && !('effects' in book) && !('pool_mods' in book) && Array.isArray(stored.effects) && Array.isArray(stored.pool_mods) && listed.indexOf('effects') === -1 && listed.indexOf('pool_mods') === -1,
    'premise: the book\'s Swift has no effects / pool_mods keys, the save wrote both, and the split doesn\'t list them ' + JSON.stringify(listed), { sv, stored, listed });
  const n = T.userChanged(sp, stored, book).length;
  check(n === 2, 'C1.3a: Fleet Foot reads 2 changes (name, description), never 4', n);
  const rec2 = Object.assign({}, stored, { effects: [{ op: 'soak_delta', amount: 1, per_rank: false }] }); rec2.id = sv.id;
  const sv2 = await H.saveRecord('my_data', 'talents', rec2);
  const st2 = H.get('my_data').pack.sections.talents[sv.id];
  check(sv2.ok && T.userChanged(H.split('talents', sv.id, st2), st2, book).length === 3, 'a real number line IS a change: 3');
  const STORE_SRC = fs.readFileSync(USERDATA, 'utf8');
  const STORE_NEEDLE = "if (Array.isArray(o[k]) && !o[k].length && !hasOwn(fields, k)) delete o[k];";
  let bittenSplit = null, bittenFiltered = null;
  if (STORE_SRC.indexOf(STORE_NEEDLE) !== -1) {
    const U2 = loadStore(STORE_SRC.replace(STORE_NEEDLE, ''));
    const b = await saveFleetFoot(await openStore(U2, U2.memoryAdapter(), BASE));
    bittenSplit = b.sp.yours.concat(b.sp.conflict).filter((k) => k !== 'id').length;
    bittenFiltered = T.userChanged(b.sp, b.stored, book).length;
  }
  check(bittenSplit === 4, 'BITE: yoursAsBook\'s delete removed from the store\'s source → the split lists ' + bittenSplit + ' (4); userChanged over it reads ' + bittenFiltered, bittenSplit);

  // The filter's own case. The book has a real list, the copy empties it, and the next book empties it too. The book's move is a second load of the same device's bytes against a moved base.
  const NEEDLE = "if ((k === 'effects' || k === 'pool_mods') && rec && emptyList(rec[k]) && emptyList(book && book[k])) return false;";
  const EFFECT = [{ op: 'soak_delta', amount: 1, per_rank: false }];
  const asTalents = (talent) => Object.assign({}, BASE, { talents: Object.assign({}, BASE.talents, { swift: talent }) });
  const adapter = U.memoryAdapter();
  const before = await openStore(U, adapter, asTalents(Object.assign({}, book, { effects: EFFECT })));
  const rec3 = Object.assign({}, JSON.parse(JSON.stringify(book)), { name: 'Fleet Foot', effects: [], pool_mods: [] });
  delete rec3.id;
  const sv3 = await before.saveRecord('my_data', 'talents', rec3, { create: true, mint: true, from: 'swift' });
  const after = await openStore(U, adapter, asTalents(Object.assign({}, book)));
  const st3 = after.get('my_data').pack.sections.talents[sv3.id];
  const sp3 = after.split('talents', sv3.id, st3);
  const n3 = T.userChanged(sp3, st3, book);
  const bitten3 = JSX.indexOf(NEEDLE) !== -1 ? loadEditor(compile(JSX.replace(NEEDLE, ''))).userChanged(sp3, st3, book) : null;
  check(sv3.ok && sp3.conflict.indexOf('effects') !== -1 && n3.indexOf('effects') === -1 && bitten3 && bitten3.length === n3.length + 1 && bitten3.indexOf('effects') !== -1,
    'both emptied a real list: the split has it as a conflict ' + JSON.stringify(sp3.conflict) + ', the count reads ' + n3.length + ' ' + JSON.stringify(n3) + '; BITE: the filter removed from the built source → ' + (bitten3 && bitten3.length) + ' ' + JSON.stringify(bitten3), { sv3, sp3, n3, bitten3 });
  console.log('\nf100_m5_change_count: ' + passes + ' PASS, ' + fails + ' FAIL · HARVEST ' + (passes + fails));
  if (fails || !passes) process.exit(1);
})().catch((e) => { console.error('f100_m5_change_count: CRASHED — ' + (e && e.stack || e)); process.exit(1); });
