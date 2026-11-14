#!/usr/bin/env node
/**
 * b1161_homebrew_copy.cjs — STANDING guard for B-1161 (ruling `b1161-homebrew-copy-hotfix`, R-B1161-1..3; DECISIONS D-82).
 *
 * The bug: the store lists items from the DISCOVERY registry (every active user pack folded in), while the sheet
 * resolves a character's items through that CHARACTER's own pack stamps. A homebrew item the character's stamps cannot
 * see was written as a bare `{ id }` and read back as "(unknown weapon)", every stat a dash. D-82's fix: such an item
 * is written as the character's OWN COPY, `{ _inline: <the record> }` — the custom-item shape itemResolve already reads.
 *
 * THE WORLD is real: the shipped registries, the user-pack store (lib/shared/userData.js) with two of the user's own
 * collections, the shared loader (lib/shared/itemRegistries.js), and the SHEET's own resolver, sliced from
 * lib/shared/sheetPool.js (`sheetItemRegistries` + `resolveSheetEquipment`) — the one resolution path (R-B1161-2).
 * The store kernel is compiled from lib/store/view.jsx (esbuild), so the guard never reads a stale bundle.
 *   A1 — a character with NO `user:` stamp (an older, imported or seeded save); the weapon lives in My Data.
 *   A4 — a character stamped with My Data only; the weapon lives in a SECOND collection it does not carry.
 *   CONTROL — a character stamped with every active collection: it resolves the item, so the entry stays a bare id.
 *
 * Legs (the BUILD CARD's step 2):
 *   (a) MOVE TO INVENTORY, weapon, A1 and A4 → `{ _inline }`, and the sheet resolver returns its name and stats.
 *   (b) MOVE TO INVENTORY, gear (qty + stacking per R-B1161-3) and armour (the entry's shape).
 *   (c) CONTROL → the bare `{ id }` entry; the purchase build is BYTE-IDENTICAL to the cut's (7c31e21a) function.
 *   (d) the counter's purchase build (`buildNextEquipment`, the census's W3–W5) for A1.
 *   (e) the copy is DEEP: mutating the catalog's record after the write changes no entry; two copies share nothing.
 *   (s) every copy is schema-valid by the validator user packs are saved through (packValidate.validateRecord).
 * BITES (the BUILD CARD's step 3) are this file's own mutant list, `MUTANTS` below: `B1161_BITES=1 node <this>` plants
 * each one in a COPY of view.jsx (handed to a child run through B1161_VIEW — the tree is never written), and a bite counts
 * only when the child EXITS 1 with no crash and the leg it names is among the FAILs (PRAXIS §6: read the exit code,
 * and record WHICH check failed). A mutant whose text is not found is VOID, and a VOID fails the bite run.
 *
 * Run: node test/b1161_homebrew_copy.cjs            ·  bites: B1161_BITES=1 node test/b1161_homebrew_copy.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CUT = '7c31e21a';
// The cut's view.jsx, the (c)/(f) oracle. Re-pointed (argo-a1-export-scan R-AES-10 rider: this guard goes green in the
// public copy, which has no history): read from test/fixtures/b1161_cut_view.jsx. KEEPS the same oracle bytes: where
// git can read the cut, the fixture must equal its blob (a drifted fixture is red). DROPS only the git dependency.
const CUT_FIXTURE = path.join(ROOT, 'test/fixtures/b1161_cut_view.jsx');
function cutView() {
  const fixture = fs.readFileSync(CUT_FIXTURE, 'utf8');
  let blob = null;
  try { blob = execFileSync('git', ['show', CUT + ':lib/store/view.jsx'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { blob = null; }
  if (blob !== null && blob !== fixture) throw new Error('test/fixtures/b1161_cut_view.jsx differs from ' + CUT + ':lib/store/view.jsx');
  return fixture;
}
const VIEW = process.env.B1161_VIEW || path.join(ROOT, 'lib/store/view.jsx');
const APP = process.env.B1161_APP || path.join(ROOT, 'player/app.jsx');          // the creator door (R-B1161-7)
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const SWItems = require(path.join(ROOT, 'lib/items.js')).SWItems;
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const IREG = require(path.join(ROOT, 'lib/shared/itemRegistries.js'));

let failures = 0, rows = 0;
const check = (ok, m) => { rows += 1; if (ok) console.log('  PASS  ' + m); else { failures += 1; console.error('  FAIL  ' + m); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const canon = (x) => Array.isArray(x) ? '[' + x.map(canon).join(',') + ']'
  : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}' : JSON.stringify(x);
// A user pack's record, as every view shows it: the fold marks it `_provenance: 'custom'` (mods.js markUser — a
// redefined blaster_pistol stops claiming oggdude), and the character's copy keeps that claim.
const asOwned = (r) => Object.assign(clone(r), { _provenance: 'custom' });

function slice(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name + ' in the source');
  const rest = src.slice(at);
  return rest.slice(0, rest.indexOf('\nfunction ', 1));
}
const REACT = {
  createElement: function () { return null; }, Fragment: 'fragment',
  useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
  useEffect: function () {}, useRef: function () { return { current: null }; },
  useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
};
// The store kernel from SOURCE (jsx → js in-process), in a context whose `window` is the shared world.
function loadStore(src, win) {
  const js = esbuild.transformSync(src, { loader: 'jsx' }).code;
  const ctx = vm.createContext({ window: win, React: REACT, console, Object, Array, JSON, Number, String, Math, Date, Promise, Set, Map, localStorage: { getItem: () => null, setItem() {} } });
  for (const f of ['lib/store/glyphs.js', 'lib/store/rarity.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  vm.runInContext(js, ctx);
  return win.SWRPGStore;
}

// ── the mutant list (step 3). `from` must occur exactly once in view.jsx; `leg` is the FAIL that must appear. ──
const MUTANTS = [
  { name: 'the resolvability check removed (always the bare id)', leg: '(a) A1: MOVE TO INVENTORY writes',
    from: "      return { _inline: copy(rec) };", to: "      return { id: refId };" },
  { name: 'the check inverted (always the inline copy)', leg: '(c) CONTROL weapon',
    from: "      if (!regs || !rec || !copy || (reg && Object.prototype.hasOwnProperty.call(reg, refId))) return { id: refId };", to: "      if (!rec || !copy) return { id: refId };" },
  { name: 'the copy made without the one copier (a verbatim deep clone)', leg: '(e) the copy carries no resolved-view marker',
    from: "      return { _inline: copy(rec) };", to: "      return { _inline: JSON.parse(JSON.stringify(rec)) };" },
  { name: 'a shallow copy', leg: '(e) a later edit',
    from: "      return { _inline: copy(rec) };", to: "      return { _inline: Object.assign({}, rec) };" },
  // B-1162 (ruling release-r7-bug-burndown ADDENDUM 55) re-pointed this mutant: R-B1161-8's bare spare suit is retired, so the
  // mutants are now the cut's bare write coming back, and the `as` key dropped (by the writer, and by the sheet's reader)
  { name: 'an unresolvable spare suit kept bare (B-1162 dropped, R-B1161-8 back)', leg: '(b) spare armour (B-1162)',
    from: "    return r && r._inline ? { _inline: r._inline, as: 'armor' } : { id: refId };", to: "    return { id: refId };" },
  { name: 'the spare suit\'s copy written without `as`', leg: '(b) spare armour (B-1162)',
    from: "    return r && r._inline ? { _inline: r._inline, as: 'armor' } : { id: refId };", to: "    return r && r._inline ? { _inline: r._inline } : { id: refId };" },
  { name: 'the creator\'s draft without mods', leg: '(f) the creator door', file: 'app',
    from: "sheetData: { equipment: eq, mods: creationStampsFor(gameData) } };", to: "sheetData: { equipment: eq } };" },
  { name: 'the creator\'s finalize filtering on .id only (a silent drop)', leg: '(f) a RE-ENTERED draft\'s buy', file: 'app',
    from: "(nextEquipment.weapons || []).forEach(function(w) { var id = w && (w.id || (w._inline && w._inline.id)); if (id) push(id, 'weapons', 1); });",
    to: "(nextEquipment.weapons || []).forEach(function(w) { if (w && w.id) push(w.id, 'weapons', 1); });" },
  { name: 'an inline copy stacks onto a bare line', leg: '(b) stack: an inline copy does NOT join a bare-id line',
    from: "      if (inline) return !!g._inline && g._inline.id === refId && canonJson(g._inline) === canonJson(inline);", to: "      if (inline) return (g._inline ? g._inline.id : g.id) === refId;" },
  { name: 'a bare id stacks onto an inline line', leg: '(b) stack: a bare id does NOT join an inline line',
    from: "      return g.id === refId && g._inline == null;", to: "      return (g._inline ? g._inline.id : g.id) === refId;" },
];
if (process.env.B1161_BITES) {
  const os = require('os');
  const { spawnSync } = require('child_process');
  const SRC = { view: [VIEW, 'B1161_VIEW', '.jsx'], app: [APP, 'B1161_APP', '.jsx'] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b1161-bites-'));
  let bad = 0;
  const control = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1161_BITES: '' }), encoding: 'utf8' });
  console.log(`  CONTROL  unmutated: exit ${control.status}` + (control.status === 0 ? ' (green)' : ' — NOT GREEN, every bite below is void'));
  if (control.status !== 0) bad += 1;
  MUTANTS.forEach((m, i) => {
    const [file, envKey, ext] = SRC[m.file || 'view'];
    const src = fs.readFileSync(file, 'utf8');
    const n = src.split(m.from).length - 1;
    if (n !== 1) { bad += 1; console.error(`  VOID  M${i + 1} ${m.name}: its text occurs ${n}× in ${file} (planted nothing)`); return; }
    const f = path.join(dir, (m.file || 'view') + '.M' + (i + 1) + ext);
    fs.writeFileSync(f, src.replace(m.from, m.to));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1161_BITES: '', [envKey]: f }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    const fails = out.split('\n').filter((l) => l.indexOf('  FAIL  ') === 0).map((l) => l.slice(8, 70));
    const crashed = /CRASHED/.test(out);
    const bit = r.status === 1 && !crashed && fails.some((l) => l.indexOf(m.leg) === 0);
    if (!bit) bad += 1;
    console.log(`  ${bit ? 'BIT ' : 'MISS'}  M${i + 1} ${m.name}: exit ${r.status}${crashed ? ' CRASHED' : ''}, ${fails.length} FAIL — ${fails.join(' · ')}`);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? `\nb1161 bites: ${bad} did not bite (or void)` : `\nb1161 bites: ALL ${MUTANTS.length} BIT, control green`);
  process.exit(bad ? 1 : 0);
}

(async function main() {
  // ── the user's own collections: My Data, and a second one ("Drive Kit") ──
  const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = J('public/data/canonical/' + s + '.json')[s]; });
  const ids = (f) => J('public/data/canonical/' + f).entries.map((e) => e.id);
  const schemas = PV.readSchemaDir(path.join(ROOT, 'schema'));
  const store = U.createStore({ adapter: U.memoryAdapter(), schemas, vocab: { skills: ids('skills.vocab.json'), qualities: ids('qualities.vocab.json') }, base: BASE });
  M.useUserPacks(store);
  await store.ready();
  const mk = (from, section, id, name, extra) => Object.assign(clone(BASE[section][from]), { id, name }, extra || {});
  const saves = [
    ['my_data', 'weapons', mk('blaster_pistol', 'weapons', 'custom_my_data_house_blaster', 'House Blaster', { damage: { base: 'flat', value: 7 }, crit: 2 })],
    ['my_data', 'gear', mk('medpac', 'gear', 'custom_my_data_house_medpac', 'House Medpac')],
    ['my_data', 'armor', mk('padded_armor', 'armor', 'custom_my_data_house_vest', 'House Vest', { soak: 3 })],
  ];
  const made = await store.createPack({ packId: 'drive_kit', name: 'Drive Kit' });
  check(made && made.ok, 'setup: a second collection "Drive Kit" is created');
  saves.push(['drive_kit', 'weapons', mk('heavy_blaster_pistol', 'weapons', 'custom_drive_kit_drive_carbine', 'Drive Carbine', { crit: 3 })]);
  const stored = {};   // id → the record EXACTLY as the collection stores it: what the character's copy must equal
  for (const [p, s, r] of saves) {
    const got = await store.saveRecord(p, s, r, { create: true });
    if (got && got.ok) stored[r.id] = clone(got.record);
    check(got && got.ok, `setup: ${p}.${s}.${r.id} saved through the rail` + (got && got.ok ? '' : ' — ' + (got && got.reasons || []).join(' | ')));
  }
  const allStamps = store.activeStamps();
  const myDataStamp = allStamps.find((s) => s.indexOf('user:my_data') === 0);
  check(allStamps.length === 2 && !!myDataStamp, `setup: two active stamps (${allStamps.join(', ')})`);

  // ── the shared world: the loader (discovery folded) + the SHEET's own resolver ──
  // the browser's SWRPGUserData carries the module's exports (userData.js copies them onto the store); the copier is one
  const win = { ItemResolve: IR, SWItems, SWRPGUserData: Object.assign({}, store, { persistableCopy: U.persistableCopy }) };
  const loader = IREG.create({ host: win, mods: M, userData: () => store, fetchJson: (p) => Promise.resolve(J(p)) });
  win.SWRPGItemRegistries = loader;
  const discovery = await loader.load();
  const poolSrc = fs.readFileSync(path.join(ROOT, 'lib/shared/sheetPool.js'), 'utf8');
  const pctx = vm.createContext({ window: win, Object, Array, JSON, Number, String, console });
  vm.runInContext(['sheetItemRegistries', 'deriveItemState', 'resolveSheetEquipment'].map((n) => slice(poolSrc, n)).join('\n')
    + '\nthis.SP = { sheetItemRegistries: sheetItemRegistries, resolveSheetEquipment: resolveSheetEquipment };', pctx);
  win.SWRPGSheetPool = pctx.SP;
  const SP = pctx.SP;

  const S = loadStore(fs.readFileSync(VIEW, 'utf8'), win);
  // A kernel without the seam (the cut) still runs every leg it CAN: its catalog is rebuilt here the way the cut's
  // `buildCatalog` builds it, and a missing function FAILS its own leg instead of crashing the guard — so the red at the
  // cut shows the bug itself (the purchase build writing bare ids), not only an absent export.
  const catalog = typeof S.buildCatalog === 'function' ? S.buildCatalog(discovery) : (function () {
    const byId = {};
    ['weapons', 'armor', 'gear'].forEach((sec) => Object.keys(discovery[sec] || {}).forEach((id) => {
      const it = SWItems.canonicalToStore(discovery[sec][id], sec); if (it) byId[it.key] = it;
    }));
    return { byId };
  })();
  check(typeof S.buildCatalog === 'function' && !!catalog.byId['weapons:custom_my_data_house_blaster'] && !!catalog.byId['weapons:custom_drive_kit_drive_carbine'],
    'the store\'s catalog (buildCatalog over the discovery view) lists both homebrew weapons');
  const api = ['ownRefOf', 'moveToInventoryNext', 'buildNextEquipment', 'stackTargetOf'].filter((n) => typeof S[n] !== 'function');
  check(api.length === 0, 'the kernel exports the write seam' + (api.length ? ' — missing: ' + api.join(', ') : ''));
  const leg = (name, fn) => { try { fn(); } catch (e) { check(false, name + ' — threw: ' + (e && e.message)); } };
  if (typeof S.ownRefOf !== 'function') S.ownRefOf = () => undefined;

  const char = (mods) => ({ name: 'Test', mods, characteristics: { brawn: 2 }, equipment: { weapons: [], armor: null, gear: [], credits: 1000 } });
  const A1 = char(['respecialized@eote-v1']);         // a variant only — no `user:` stamp
  const A4 = char([myDataStamp]);                      // My Data only — not Drive Kit
  const CTL = char(allStamps.slice());                 // carries both
  const item = (k) => catalog.byId[k];
  const stamp = [{ note: 'acquired — no cost', when: '2026-10-10' }];
  const sheetOf = (c, eq) => SP.resolveSheetEquipment(eq, Object.assign(clone(c), { equipment: eq }));
  const disc = (sec, id) => discovery[sec][id];
  const written = [];   // every copy a leg saw written, for (s)

  // ── the premise, through the SHEET's path: A1 and A4 cannot see the item; CONTROL can ──
  const can = (c, sec, id) => has((SP.sheetItemRegistries(c) || {})[sec], id);
  check(!can(A1, 'weapons', 'custom_my_data_house_blaster') && !can(A4, 'weapons', 'custom_drive_kit_drive_carbine')
    && can(CTL, 'weapons', 'custom_my_data_house_blaster') && can(CTL, 'weapons', 'custom_drive_kit_drive_carbine'),
    'premise: the sheet\'s registries miss the item for A1 and A4 and hold it for CONTROL');

  // ── (a) MOVE TO INVENTORY, weapon ──
  leg('(a)', () => { for (const [label, c, key] of [['A1', A1, 'weapons:custom_my_data_house_blaster'], ['A4', A4, 'weapons:custom_drive_kit_drive_carbine']]) {
    const eq = S.moveToInventoryNext(c.equipment, item(key), S.ownRefOf(c, catalog), stamp);
    const e = eq.weapons[0], id = key.split(':')[1];
    check(eq.weapons.length === 1 && e && e._inline && e._inline.id === id && !has(e, 'id') && JSON.stringify(e.provenance) === JSON.stringify(stamp),
      `(a) ${label}: MOVE TO INVENTORY writes { _inline: <${id}>, provenance } and no bare id — got ${JSON.stringify(e && Object.keys(e))}`);
    check(e && canon(e._inline) === canon(asOwned(stored[id])) && !has(e._inline, '_pack'),
      `(a) ${label}: the copy is the record as its collection stores it, claiming _provenance "custom", field for field (no _pack)`);
    written.push(['weapons', e && e._inline]);
    const w = sheetOf(c, eq).weapons[0];
    const want = SWItems.canonicalToStore(disc('weapons', id), 'weapons');
    check(w && !w._unresolved && w.name === disc('weapons', id).name && w.damage === want.damage && w.crit === want.crit && w.damage !== '' && w.crit != null,
      `(a) ${label}: the sheet resolver reads "${w && w.name}" damage ${w && w.damage} crit ${w && w.crit} (not "(unknown weapon)")`);
  } });

  // ── (b) MOVE TO INVENTORY, gear + armour ──
  leg('(b)', () => {
    const refOf = S.ownRefOf(A1, catalog);
    let eq = S.moveToInventoryNext(A1.equipment, item('gear:custom_my_data_house_medpac'), refOf, stamp);
    eq = S.moveToInventoryNext(eq, item('gear:custom_my_data_house_medpac'), refOf, stamp);
    const g = eq.gear;
    check(g.length === 1 && g[0]._inline && g[0]._inline.id === 'custom_my_data_house_medpac' && g[0].qty === 2 && !has(g[0], 'id'),
      `(b) gear: two moves of one homebrew item make ONE inline line, qty 2 — got ${JSON.stringify(g.map((x) => [x._inline ? 'inline' : 'id', x.qty]))}`);
    const r = sheetOf(A1, eq).gear[0];
    check(r && !r._unresolved && r.name === 'House Medpac' && r.qty === 2, `(b) gear: the sheet reads "${r && r.name}" ×${r && r.qty}`);
    // R-B1161-3 stacking: an inline copy never joins a bare-id line, a bare-id line never takes an inline copy,
    // and an inline copy joins only a deep-equal record of the same id.
    const bare = { id: 'custom_my_data_house_medpac', qty: 1 };
    const rec = g[0]._inline;   // the copy the write just made
    written.push(['gear', rec]);
    const inl = { _inline: clone(rec), qty: 1 };
    const changed = { _inline: Object.assign(clone(rec), { name: 'House Medpac (old)' }), qty: 1 };
    check(S.stackTargetOf([bare], 'custom_my_data_house_medpac', rec) === undefined, '(b) stack: an inline copy does NOT join a bare-id line');
    check(S.stackTargetOf([inl], 'custom_my_data_house_medpac') === undefined, '(b) stack: a bare id does NOT join an inline line');
    check(S.stackTargetOf([changed], 'custom_my_data_house_medpac', rec) === undefined, '(b) stack: an inline copy does NOT join a copy whose record differs');
    check(S.stackTargetOf([bare, inl], 'custom_my_data_house_medpac', rec) === inl, '(b) stack: an inline copy joins the deep-equal inline line');
    check(S.stackTargetOf([inl, bare], 'custom_my_data_house_medpac') === bare, '(b) stack: a bare id still joins its bare line (today\'s rule)');
    // B-1162 (ruling release-r7-bug-burndown ADDENDUM 55; HONEST RE-POINT of R-B1161-8's CONTROL): a SPARE suit the character
    // cannot resolve is now its own copy marked `as: 'armor'`. KEEPS: it lands in the pack (not worn), qty 1, its provenance.
    // DROPS: the cut's bare { id } for that suit, which the sheet read as "(unknown gear)".
    const ea = S.moveToInventoryNext(A1.equipment, item('armor:custom_my_data_house_vest'), refOf, stamp);
    const eg = (ea.gear || [])[0] || {};
    check(ea.gear.length === 1 && eg._inline && eg._inline.id === 'custom_my_data_house_vest' && eg.as === 'armor' && !has(eg, 'id') && eg.qty === 1
      && JSON.stringify(eg.provenance) === JSON.stringify(stamp) && !ea.armor,
      `(b) spare armour (B-1162): MOVE TO INVENTORY packs { _inline, as: "armor", qty: 1, provenance } — got ${JSON.stringify(ea.gear).slice(0, 200)}`);
    const sa = sheetOf(A1, ea).gear[0] || {};
    check(sa._armorSpare === true && sa.name === 'House Vest' && sa.soak === 3,
      `(b) spare armour (B-1162): the sheet lists it as a spare suit (PROTECTION, WEAR), "House Vest" soak 3 — got ${JSON.stringify({ spare: sa._armorSpare, name: sa.name, soak: sa.soak })}`);
    // the key's acting reader on the sheet acts on it (the OggDude export is the second, ADDENDUM 266; r7_b1554): a homebrew suit whose record carries no soak and no defence is armour only by `as`
    const cloak = { id: 'custom_my_data_plain_cloak', name: 'Plain Cloak', encumbrance: 1, price: 10, rarity: 0 };
    const withAs = sheetOf(A1, { gear: [{ _inline: clone(cloak), as: 'armor', qty: 1 }] }).gear[0] || {};
    const without = sheetOf(A1, { gear: [{ _inline: clone(cloak), qty: 1 }] }).gear[0] || {};
    check(withAs._armorSpare === true && withAs.name === 'Plain Cloak' && !without._armorSpare,
      `(b) spare armour (B-1162): \`as: "armor"\` makes a soak-less suit a spare; absent, it reads as today (gear) — ${JSON.stringify([withAs._armorSpare, without._armorSpare])}`);
    // a suit the character CAN resolve keeps the bare id, byte for byte (CONTROL)
    const ec = S.moveToInventoryNext(CTL.equipment, item('armor:custom_my_data_house_vest'), S.ownRefOf(CTL, catalog), stamp);
    check(JSON.stringify(ec.gear.slice(-1)) === JSON.stringify([{ id: 'custom_my_data_house_vest', qty: 1, provenance: stamp }]),
      `(b) spare armour CONTROL: a resolvable suit still packs the bare { id, qty: 1, provenance } — got ${JSON.stringify(ec.gear.slice(-1)).slice(0, 200)}`);
  });

  // ── (c) CONTROL: a character that resolves the item keeps the bare id ──
  leg('(c)', () => {
    const refOf = S.ownRefOf(CTL, catalog);
    const ew = S.moveToInventoryNext(CTL.equipment, item('weapons:custom_drive_kit_drive_carbine'), refOf, stamp);
    check(JSON.stringify(ew.weapons) === JSON.stringify([{ id: 'custom_drive_kit_drive_carbine', provenance: stamp }]),
      `(c) CONTROL weapon: { id, provenance } exactly as the cut writes it — got ${JSON.stringify(ew.weapons)}`);
    let eg = S.moveToInventoryNext(CTL.equipment, item('gear:custom_my_data_house_medpac'), refOf, stamp);
    eg = S.moveToInventoryNext(eg, item('gear:custom_my_data_house_medpac'), refOf, stamp);
    check(JSON.stringify(eg.gear) === JSON.stringify([{ id: 'custom_my_data_house_medpac', qty: 2, provenance: stamp }]),
      `(c) CONTROL gear: { id, qty, provenance }, stacked — got ${JSON.stringify(eg.gear)}`);
    const ec = S.moveToInventoryNext(A1.equipment, item('weapons:blaster_pistol'), S.ownRefOf(A1, catalog), stamp);
    check(JSON.stringify(ec.weapons) === JSON.stringify([{ id: 'blaster_pistol', provenance: stamp }]),
      '(c) CONTROL book item on A1: the base resolves it, so { id } as today');
    // the purchase build, against the CUT's own function (oracle)
    let OLD = null;
    try {
      const cutSrc = cutView();
      OLD = loadStore(cutSrc, Object.assign({}, win)).buildNextEquipment;
    } catch (e) { check(false, '(c) the cut\'s view.jsx at ' + CUT + ' could not be read — the oracle is missing: ' + e.message); }
    if (OLD) {
      const cart = [
        { itemId: 'weapons:custom_drive_kit_drive_carbine', section: 'weapons', qty: 2, priceEach: 100 },
        { itemId: 'armor:custom_my_data_house_vest', section: 'armor', qty: 2, priceEach: 50 },
        { itemId: 'gear:custom_my_data_house_medpac', section: 'gear', qty: 3, priceEach: 25 },
        { itemId: 'weapons:blaster_pistol', section: 'weapons', qty: 1, priceEach: 400 },
      ];
      const start = { weapons: [{ id: 'vibrosword' }], armor: null, gear: [{ id: 'custom_my_data_house_medpac', qty: 1 }], credits: 1000 };
      const strip = (o) => JSON.stringify(o, (k, v) => (k === 'when' ? '' : v));
      const a = OLD(clone(start), clone(cart), catalog.byId);
      const b = S.buildNextEquipment(clone(start), clone(cart), catalog.byId, null, S.ownRefOf(CTL, catalog));
      check(strip(a) === strip(b), '(c) CONTROL purchase build: byte-identical to the cut\'s buildNextEquipment' + (strip(a) === strip(b) ? '' : '\n        cut: ' + strip(a.next) + '\n        now: ' + strip(b.next)));
      const n = S.buildNextEquipment(clone(start), clone(cart), catalog.byId);
      check(strip(a) === strip(n), '(c) no judge handed in (a host with none): byte-identical to the cut');
    }
  });

  // ── (d) the counter's purchase build for A1 (W3 weapons, W4 the worn slot, W5 pack + gear) ──
  leg('(d)', () => {
    const cart = [
      { itemId: 'weapons:custom_my_data_house_blaster', section: 'weapons', qty: 2, priceEach: 100 },
      { itemId: 'armor:custom_my_data_house_vest', section: 'armor', qty: 2, priceEach: 50 },
      { itemId: 'gear:custom_my_data_house_medpac', section: 'gear', qty: 3, priceEach: 25 },
    ];
    const out = S.buildNextEquipment(clone(A1.equipment), cart, catalog.byId, null, S.ownRefOf(A1, catalog));
    const n = out.next;
    check(n.weapons.length === 2 && n.weapons.every((w) => w._inline && w._inline.id === 'custom_my_data_house_blaster' && !has(w, 'id') && w.provenance),
      '(d) purchase W3: two weapons, each its own { _inline } copy with its provenance');
    check(n.weapons[0]._inline !== n.weapons[1]._inline, '(d) purchase W3: the two copies are two objects');
    check(n.armor && n.armor._inline && n.armor._inline.id === 'custom_my_data_house_vest' && n.armor.state === 'worn' && !has(n.armor, 'id'),
      '(d) purchase W4: nothing worn → the first suit is WORN as { _inline, state: "worn" }');
    written.push(['armor', n.armor && n.armor._inline]);
    const vest = n.gear.filter((g) => g._inline && g._inline.id === 'custom_my_data_house_vest');
    const med = n.gear.filter((g) => g._inline && g._inline.id === 'custom_my_data_house_medpac');
    check(vest.length === 1 && vest[0].as === 'armor' && vest[0].qty === 1 && !has(vest[0], 'id')
      && med.length === 1 && med[0].qty === 3 && n.credits === 1000 - 200 - 100 - 75,
      `(d) purchase W5: the second suit packs as its own copy { _inline, as: "armor", qty: 1 } (B-1162; was R-B1161-8's bare id), the medpacs one inline line ×3, credits ${n.credits}`);
    const sh = sheetOf(A1, n);
    check(sh.weapons.length === 2 && sh.weapons.every((w) => w.name === 'House Blaster' && !w._unresolved) && sh.armor && sh.armor.name === 'House Vest' && sh.armor.soak === 3,
      `(d) the sheet reads the purchase: ${sh.weapons.map((w) => w.name).join(' + ')}, worn "${sh.armor && sh.armor.name}" soak ${sh.armor && sh.armor.soak}`);
  });

  // ── (e) the copy is DEEP ──
  leg('(e)', () => {
    const rec = disc('weapons', 'custom_my_data_house_blaster');
    const before = canon(asOwned(stored['custom_my_data_house_blaster'])), original = JSON.stringify(rec);
    const eq = S.moveToInventoryNext(A1.equipment, item('weapons:custom_my_data_house_blaster'), S.ownRefOf(A1, catalog), stamp);
    const out = S.buildNextEquipment(clone(A1.equipment), [{ itemId: 'weapons:custom_my_data_house_blaster', section: 'weapons', qty: 1, priceEach: 1 }], catalog.byId, null, S.ownRefOf(A1, catalog));
    rec.name = 'EDITED LATER'; rec.damage.value = 99; (rec.qualities || []).push({ id: 'edited', rank: 1 });
    const keptA = canon(eq.weapons[0]._inline), keptB = canon(out.next.weapons[0]._inline);
    check(keptA === before && keptB === before, '(e) a later edit to the record changes neither copy (MOVE TO INVENTORY nor purchase)');
    const marks = ['_pack', '_unapplied', '_variant'].filter((k) => has(eq.weapons[0]._inline, k) || has(out.next.weapons[0]._inline, k));
    const errs = PV.create(schemas).validateRecord('weapons', clone(eq.weapons[0]._inline));
    check(has(rec, '_pack') && marks.length === 0 && errs.length === 0,
      `(e) the copy carries no resolved-view marker (the catalog's record does: _pack), and packValidate.validateRecord accepts it` + (marks.length || errs.length ? ' — ' + marks.join(',') + ' ' + JSON.stringify(errs).slice(0, 200) : ''));
    const keep = JSON.parse(original); Object.keys(rec).forEach((k) => delete rec[k]); Object.assign(rec, keep);
  });

  // ── (f) the CREATOR's store door (R-B1161-7): the draft carries the stamps finalize will give it ──
  // `creationStampsFor` and `storeShopFor`'s memo body are sliced from player/app.jsx and RUN, so the leg reads the record
  // the creator really hands the store. A homebrew item in an active collection stays the bare { id } the ledger keeps.
  leg('(f)', () => {
    const app = fs.readFileSync(APP, 'utf8');
    const memo = app.match(/var storeShopFor = useMemo\((function\(\) \{[\s\S]*?\n  \}), \[/);
    check(!!memo && app.indexOf('function creationStampsFor(') >= 0, '(f) player/app.jsx carries creationStampsFor and storeShopFor\'s memo body');
    if (!memo) return;
    const fwin = { SWRPGMods: { active: () => ['respecialized@eote-v1'] }, SWRPGUserData: { activeStamps: () => allStamps.slice() } };
    // the memo body closes over ctrl / accent / gameData: they become the parameters of the function it runs in
    const run = vm.runInContext(slice(app, 'creationStampsFor') + '\n(function (ctrl, accent, gameData) { return (' + memo[1] + ')(); })',
      vm.createContext({ window: fwin, Array, Object, Math }));
    const ctrl = { character: { gearLedger: { inventory: [] }, identity: { name: 'Draft Smuggler' } }, credits: { remaining: 500 } };
    const draft = run(ctrl, '#4EAAFF', { charbuild: {} });
    check(draft && draft.id === 'draft' && JSON.stringify(draft.sheetData.mods) === JSON.stringify(['respecialized@eote-v1'].concat(allStamps)),
      `(f) the creator's draft carries the stamps finalize will give it: ${JSON.stringify(draft && draft.sheetData.mods)}`);
    const cart = [
      { itemId: 'weapons:custom_my_data_house_blaster', section: 'weapons', qty: 1, priceEach: 400 },
      { itemId: 'weapons:custom_drive_kit_drive_carbine', section: 'weapons', qty: 1, priceEach: 1 },
      { itemId: 'gear:custom_my_data_house_medpac', section: 'gear', qty: 2, priceEach: 25 },
      { itemId: 'armor:custom_my_data_house_vest', section: 'armor', qty: 1, priceEach: 50 },
    ];
    const strip = (o) => JSON.stringify(o, (k, v) => (k === 'when' ? '' : v));
    const cutSrc = cutView();
    const a = loadStore(cutSrc, Object.assign({}, win)).buildNextEquipment(clone(draft.sheetData.equipment), clone(cart), catalog.byId);
    const b = S.buildNextEquipment(clone(draft.sheetData.equipment), clone(cart), catalog.byId, null, S.ownRefOf(draft.sheetData, catalog));
    check(strip(a) === strip(b) && b.next.weapons.every((w) => has(w, 'id') && !has(w, '_inline')),
      '(f) the creator door\'s purchase of homebrew items in active collections is BYTE-IDENTICAL to the cut (bare ids the ledger keeps)'
      + (strip(a) === strip(b) ? '' : '\n        cut: ' + strip(a.next) + '\n        now: ' + strip(b.next)));
    const re = run(ctrl, '#4EAAFF', { charbuild: {}, stampMods: [myDataStamp] });
    check(re && JSON.stringify(re.sheetData.mods) === JSON.stringify([myDataStamp]), `(f) a RE-ENTERED draft carries its character's own stamps: ${JSON.stringify(re && re.sheetData.mods)}`);
    // R-B1161-10: a re-entered draft buying from a collection its character does not carry gets an inline copy, and
    // the creator's finalize (sliced from player/app.jsx and RUN) keeps it in the gear ledger by id — as at the cut,
    // never a silent drop. (That door still reads "(unknown weapon)" after finishing, as today: B-1163.)
    const fin = app.match(/var handleStoreFinalizeInCreator = useCallback\((function\(charId, nextEquipment\) \{[\s\S]*?\n  \}), \[ctrl, gameData\]\);/);
    check(!!fin, '(f) player/app.jsx carries handleStoreFinalizeInCreator\'s body');
    if (!fin) return;
    const dispatched = [], loud = [];
    const fctrl = { character: { gearLedger: { inventory: [] } }, dispatch: (a) => dispatched.push(a), setSubView() {} };
    const finalize = vm.runInContext('(function (ctrl, gameData) { return (' + fin[1] + '); })',
      vm.createContext({ window: { _canonicalRegistries: discovery }, console: { error: (m) => loud.push(m) }, Object }))(fctrl, { canonical: discovery });
    const reBuy = S.buildNextEquipment(clone(re.sheetData.equipment), [{ itemId: 'weapons:custom_drive_kit_drive_carbine', section: 'weapons', qty: 1, priceEach: 1 }],
      catalog.byId, null, S.ownRefOf(re.sheetData, catalog));
    finalize('draft', reBuy.next);
    const inv = dispatched.length ? dispatched[0].value.inventory : null;
    check(reBuy.next.weapons[0] && reBuy.next.weapons[0]._inline && Array.isArray(inv) && inv.length === 1
      && inv[0].key === 'custom_drive_kit_drive_carbine' && inv[0].section === 'weapons' && !loud.length,
      `(f) a RE-ENTERED draft's buy from a collection it lacks lands in the creator's gear ledger by id (R-B1161-10) — ledger ${JSON.stringify(inv)}`);
  });

  // ── (s) every copy is schema-valid by the rail user packs are saved through ──
  leg('(s)', () => {
    const V = PV.create(schemas);
    const bad = [];
    for (const [s, r] of written) {
      const errs = r ? V.validateRecord(s, clone(r)) : ['no copy'];
      if (errs.length) bad.push(s + '.' + (r && r.id) + ': ' + errs.map((e) => e.message || JSON.stringify(e)).join('; '));
    }
    check(written.length === 4 && written.every(([, r]) => r) && bad.length === 0, `(s) every copy written (${written.length}) passes packValidate.validateRecord, the rail user packs are saved through` + (bad.length ? ' — ' + bad.join(' | ') : ''));
  });
  finish();
})().catch((e) => { console.error('b1161_homebrew_copy: CRASHED — ' + (e && e.stack || e)); process.exit(1); });

function finish() {
  if (rows === 0) { console.error('b1161_homebrew_copy: HARVEST 0 — no row ran'); process.exit(1); }
  if (failures) { console.error(`\nb1161_homebrew_copy: ${failures} FAIL of ${rows}`); process.exit(1); }
  console.log(`\nb1161_homebrew_copy: ALL PASS — ${rows} rows`);
}
