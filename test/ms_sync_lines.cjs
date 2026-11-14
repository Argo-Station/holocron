#!/usr/bin/env node
/**
 * ms_sync_lines.cjs — the DECISIONS behind homebrew sync's approved lines (F-100 MS build, stage 2; card
 * f100-ms-build R-MSB-1 (C-MU-4), R-MSB-4, R-MSB-11, R-MSB-15; f100-ms-mockup R-MSMG-2..5, -9; D-90 F2 (a), F3 (a)).
 * Which line a collection carries, when, and in what words — the record's copy table, verbatim. The browser
 * instrument (scripts/f100_ms_build_frames.py) proves where each renders; this proves what each says and when.
 *
 *   V  lib/editor/view.jsx's MS SYNC-LINES region (plain JS, sliced by its markers and evaluated — the shipped text):
 *      V1 the strings, verbatim · V2 the date ("Started D Mon YYYY"; the trigger's " · D Mon") · V3 syncLabel: F1 for
 *      the four refusal causes, F4 for a kept copy (home too, R-MSB-15), nothing while paused (D2), nothing on an
 *      imported row, nothing signed out · V4 tellApart: nothing with unique names (R-MSMG-2), the date on each of two
 *      same-named, and home's no more than that (its "New homebrew saves here" cut, copy-voice-sweep-build E row
 *      lib/editor/view.jsx:104:16, D-289) · V5 the closed IN ▾ trigger's suffix (R-MSMG-9) · V6 the
 *      banner slot: the pause line only on a persistent store (ADDENDUM 3 R-MSB-16) · V7 the armed Remove's count reads
 *      the roster AND the creation draft, the keep rule's own set (R-MSB-19)
 *   C  lib/shared/ui.jsx's CONFLICT-COPY region: F6's collection row (title, whenPhrase sides over an ISO updatedAt);
 *      the fallback for an unknown key and a character row unchanged
 *   S  lib/shared/sync.js: a moved packState() is announced (`pack_state`), so a plate can re-read it — the floor and a
 *      413 each emit once with the cause; a pass that moves nothing emits nothing
 *
 * Run: node test/ms_sync_lines.cjs · exit 0 all pass · 1 any fail / crash / dead slice
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let rows = 0, fails = 0;
function check(label, cond, detail) {
  rows += 1;
  if (cond) console.log('  ✓ ' + label);
  else { fails += 1; console.log('  ✗ ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
function slice(file, start, end, ret) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b <= a) return { err: 'markers not found in ' + file + ' (' + a + ', ' + b + ')' };
  try { return { mod: new Function('window', src.slice(a, b) + '\nreturn ' + ret + ';')(undefined) }; } catch (e) { return { err: String(e && e.message || e) }; }
}
const ISO = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).toISOString();     // local noon: the day is the same in every zone

(async () => {
  console.log('ms_sync_lines — the approved lines\' decisions (R-MSB-1, R-MSMG-2..5, -9, D-90)');

  // ── V: the view's region ──
  const V = slice('lib/editor/view.jsx', '  // ── MS SYNC-LINES REGION START', '  // ── MS SYNC-LINES REGION END',
    '{ MSW: MSW, dayOf: dayOf, syncLabel: syncLabel, tellApart: tellApart, inSuffix: inSuffix, pauseShows: pauseShows, countUsers: countUsers }');
  check('HARNESS the MS SYNC-LINES region is in view.jsx and evaluates', !!V.mod, V.err);
  const M = V.mod || {};
  const W = M.MSW || {};
  check('V1 F1 verbatim', W.didntSync === 'On this device only — this collection didn’t sync', W.didntSync);
  check('V1 F2 verbatim', W.paused === 'Sync is paused for new homebrew — everything is saved on this device', W.paused);
  // copy-voice-sweep-build area E row lib/editor/view.jsx:104:16 (D-289): the F3a home line is cut, the key with it
  check('V1 F3a home line is cut (D-289)', !('savesHere' in W), W.savesHere);
  check('V1 F4 verbatim', W.removedElsewhere === 'On this device only — removed from sync on another device', W.removedElsewhere);
  check('V1 F5a verbatim, named (R-MSMG-4)', typeof W.restored === 'function' && W.restored('House Rules') === 'Restored House Rules as your own collection.', W.restored && W.restored('House Rules'));
  check('V1 F5b verbatim', W.alreadyHere === 'This collection is already on this device', W.alreadyHere);
  check('V1 F3b is NOT built (D-90 F3 (a))', !!V.mod && !fs.readFileSync(path.join(ROOT, 'lib/editor/view.jsx'), 'utf8').includes('From your other device'));
  const dayOf = M.dayOf || (() => null);
  check('V2 F3a date: "Started 11 Oct 2026"', typeof W.started === 'function' && W.started(dayOf(ISO(2026, 10, 11), true)) === 'Started 11 Oct 2026', W.started && W.started(dayOf(ISO(2026, 10, 11), true)));
  check('V2 "3 Oct" for the trigger (no year); a single-digit day has no zero', dayOf(ISO(2026, 10, 3), false) === '3 Oct', dayOf(ISO(2026, 10, 3), false));
  check('V2 no date → null (never "Invalid Date")', dayOf(null, true) === null && dayOf('nonsense', true) === null);

  const syncLabel = M.syncLabel || (() => 'MISSING');
  const own = (ck, extra) => Object.assign({ ck, origin: 'own', packId: 'house_rules', name: 'House Rules', home: false, local: null }, extra || {});
  const PS = (refused, paused, floor) => ({ refused: refused || {}, paused: paused || null, floor: !!floor });
  for (const cause of ['too_large', 'over_cap', 'cap', 'no-compression']) {
    check('V3 F1 on a refused own collection (' + cause + ')', syncLabel(own('own:a'), PS({ 'own:a': cause })) === W.didntSync);
  }
  check('V3 F1 on the floor (every own row flagged no-compression, R-MSB-4)', syncLabel(own('own:a'), PS({ 'own:a': 'no-compression' }, null, true)) === W.didntSync);
  check('V3 another collection is unmarked', syncLabel(own('own:b'), PS({ 'own:a': 'too_large' })) === null);
  check('V3 D2: no F1 while the pause holds', syncLabel(own('own:a'), PS({ 'own:a': 'too_large' }, { cause: 'storage' })) === null);
  check('V3 an imported collection never carries a line', syncLabel({ ck: 'imp:friends', origin: 'imported', name: "Friend's Pack" }, PS({ 'imp:friends': 'too_large' })) === null);
  check('V3 signed out (no packState) → nothing', syncLabel(own('own:a'), null) === null);
  check('V3 a version key (version-mismatch) names no collection → nothing on a plate', syncLabel(own('own:a'), PS({ 'swrpg_user_pack_v:house_rules@abc': 'version-mismatch' })) === null);
  check('V3 F4 on a kept copy', syncLabel(own('own:a', { local: 'removed-elsewhere' }), PS()) === W.removedElsewhere);
  check('V3 F4 on a kept HOME (R-MSB-15)', syncLabel(own('own:h', { home: true, packId: 'my_data', name: 'My Data', local: 'removed-elsewhere' }), PS()) === W.removedElsewhere);
  check('V3 F4 shows signed out and while paused (it is this device\'s state, not a refusal)',
    syncLabel(own('own:a', { local: 'removed-elsewhere' }), null) === W.removedElsewhere && syncLabel(own('own:a', { local: 'removed-elsewhere' }), PS({}, { cause: 'storage' })) === W.removedElsewhere);

  const tellApart = M.tellApart || (() => ['MISSING']);
  const home = own('own:h', { home: true, packId: 'my_data', name: 'My Data', createdAt: ISO(2026, 10, 11) });
  const other = own('own:o', { packId: 'my_data', name: 'My Data', createdAt: ISO(2026, 10, 3) });
  const house = own('own:a', { createdAt: ISO(2026, 9, 1) });
  const friend = { ck: 'imp:friends', origin: 'imported', name: "Friend's Pack", createdAt: ISO(2026, 9, 2) };
  const uniq = [home, house, friend];
  check('V4 unique names → no line anywhere (R-MSMG-2)', uniq.every((c) => tellApart(c, uniq).length === 0), uniq.map((c) => tellApart(c, uniq)));
  const both = [home, other, house, friend];
  check('V4 home: its date only (its home line cut, D-289)', JSON.stringify(tellApart(home, both)) === JSON.stringify(['Started 11 Oct 2026']), tellApart(home, both));
  check('V4 the other My Data: its date only', JSON.stringify(tellApart(other, both)) === JSON.stringify(['Started 3 Oct 2026']), tellApart(other, both));
  check('V4 the collections whose names are unique stay unmarked', tellApart(house, both).length === 0 && tellApart(friend, both).length === 0);
  check('V4 a collision only counts among the collections LISTED there', tellApart(home, [home, house]).length === 0);
  const sameAsFriend = own('own:x', { name: "Friend's Pack", createdAt: ISO(2026, 9, 5) });
  check('V4 an own and an imported collection of one name are told apart too', tellApart(sameAsFriend, [sameAsFriend, friend]).length === 1 && tellApart(friend, [sameAsFriend, friend]).length === 1);

  const inSuffix = M.inSuffix || (() => 'MISSING');
  check('V5 the closed IN ▾ trigger: " · 3 Oct" when the target\'s name is shared (R-MSMG-9)', inSuffix(other, [home, other, house]) === ' · 3 Oct', inSuffix(other, [home, other, house]));
  check('V5 … and nothing when it is unique', inSuffix(house, [home, other, house]) === '' && inSuffix(home, [home, house]) === '');

  const pauseShows = M.pauseShows || (() => 'MISSING');
  const PAUSED = PS({}, { cause: 'storage' });
  check('V6 F2 (a): paused on a persistent store → the pause line', pauseShows({ persistent: true, writable: true, reason: 'idb' }, PAUSED) === true);
  check('V6 R-MSB-16: paused on a MEMORY store → no pause line (the store\'s notice holds the slot alone)', pauseShows({ persistent: false, writable: true, reason: 'memory' }, PAUSED) === false);
  check('V6 not paused, or signed out → no pause line', pauseShows({ persistent: true }, PS()) === false && pauseShows({ persistent: true }, null) === false);

  const countUsers = M.countUsers || (() => -1);
  const ST = 'user:house_rules#0123456789ab';
  const chars = [{ sheetData: { mods: [ST] } }, { sheetData: { mods: ['user:other#aaaaaaaaaaaa'] } }, { sheetData: {} }];
  check('V7 roster only: 1 character uses it', countUsers(ST, 'own', 'house_rules', chars, null) === 1, countUsers(ST, 'own', 'house_rules', chars, null));
  check('V7 R-MSB-19: a creation draft naming it counts one more', countUsers(ST, 'own', 'house_rules', chars, { step: 3, sheetData: { mods: [ST] } }) === 2);
  check('V7 … wherever the draft carries the stamp (the keep rule walks every string)', countUsers(ST, 'own', 'house_rules', [], { pending: { pick: [ST] } }) === 1);
  check('V7 a draft that does not name it counts nothing', countUsers(ST, 'own', 'house_rules', chars, { sheetData: { mods: ['user:x#bbbbbbbbbbbb'] } }) === 1);
  check('V7 an imported collection: any version of it, roster and draft', countUsers(null, 'imported', 'friends', [{ sheetData: { mods: ['user:friends@abcdefabcdef'] } }], { mods: ['user:friends@111111111111'] }) === 2);

  // ── C: the conflict copy (F6) ──
  const C = slice('lib/shared/ui.jsx', '  // ── CONFLICT-COPY REGION START', '  // ── CONFLICT-COPY REGION END', '{ describeConflict: describeConflict }');
  check('HARNESS the CONFLICT-COPY region evaluates', !!C.mod, C.err);
  const dc = (C.mod && C.mod.describeConflict) || (() => ({}));
  const DAY = 86400000, nowIso = (ms) => new Date(Date.now() - ms).toISOString();
  const coll = { key: 'swrpg_user_pack:0123456789ab', kind: 'envelope', collection: true, name: 'House Rules', ck: 'own:0123456789ab',
    local: { name: 'House Rules', updatedAt: nowIso(60000) }, remote: { name: 'House Rules', updatedAt: nowIso(DAY + 60000) } };
  const d = dc(coll);
  check('C F6 title: The collection "House Rules" changed in both places', d.title === 'The collection "House Rules" changed in both places', d.title);
  check('C F6 sides: "edited today" / "edited yesterday" (an ISO updatedAt read as a date)', d.here === 'edited today' && d.there === 'edited yesterday', [d.here, d.there]);
  check('C an unknown envelope key still falls back to its key (sync_pins_key\'s trap, unchanged)', dc({ key: 'swrpg_nonexistent_key', kind: 'envelope', local: 1, remote: 2 }).title === 'swrpg_nonexistent_key');
  const ch = dc({ key: 'swrpg_saved_characters', kind: 'list', id: 'c1', local: { name: 'Vex Talon', updatedAt: Date.now() }, remote: { name: 'Vex Talon', updatedAt: Date.now() - DAY } });
  check('C a character row is unchanged', ch.title === 'The character "Vex Talon" changed in both places' && ch.here === 'edited today' && ch.there === 'edited yesterday', ch);

  // ── S: the lane announces a moved packState ──
  const { makeWorker } = require('./fixtures/ms_d1_harness.js');
  const U = require(path.join(ROOT, 'lib/shared/userData.js'));
  const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
  const SY = require(path.join(ROOT, 'lib/shared/sync.js'));
  const SCHEMAS = PV.readSchemaDir(path.join(ROOT, 'schema'));
  const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
  const BASE = {}; PV.APPLIED_SECTIONS.forEach((s) => { BASE[s] = reg(s); });
  const vids = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
  const VOCAB = { skills: vids('skills.vocab.json'), qualities: vids('qualities.vocab.json') };
  const settle = () => new Promise((r) => setTimeout(r, 20));
  let seq = 0;
  function device(w, floor) {
    const ad = U.memoryAdapter(), mem = {}, ev = [];
    const store = U.createStore({ adapter: ad, schemas: SCHEMAS, vocab: VOCAB, base: BASE, mintInstance: () => String(++seq).padStart(12, '0') });
    const sync = SY.createSync({
      fetch: async (url, o) => { o = o || {}; const u = new URL('http://local' + url);
        const init = { method: o.method || 'GET', headers: Object.assign({ 'x-test-user': 'u' + seq }, o.headers || {}) }; if (o.body) init.body = o.body;
        return w.mod.handleSync(new Request(u, init), w.env, u); },
      storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } }, schedule: (fn) => { fn(); return 1; },
      packs: () => store, compress: floor ? null : SY.makeCompress(globalThis),
    });
    sync.subscribe((type, detail) => { if (type === 'pack_state') ev.push(detail); });
    return { store, sync, ev };
  }
  try {
    const w = makeWorker();
    const F = device(w, true); await F.store.ready();
    const c = await F.store.createPack({ packId: 'house_rules', name: 'House Rules' });
    await F.sync.adopt(); await settle();
    const e = F.ev[F.ev.length - 1];
    check('S the floor announces itself: pack_state with floor and the collection\'s cause', F.ev.length >= 1 && e && e.floor === true && e.refused && e.refused[c.ck] === 'no-compression', F.ev);
    const n = F.ev.length; await F.sync.packSend(); await settle();
    check('S a pass that moves nothing announces nothing', F.ev.length === n, F.ev.length - n);

    const w2 = makeWorker({ env: { SYNC_BUDGET_STORAGE_BYTES: '4096', SYNC_STOP_AT: '0.85' } });
    const P = device(w2, false); await P.store.ready();
    const big = await P.store.createPack({ packId: 'big_pack', name: 'Big Pack' });
    for (let i = 0; i < 3; i++) await P.store.saveRecord(big.ck, 'weapons', { id: 'custom_big_pack_m' + i, name: 'M' + i, skill: 'mechanics', damage: { base: 'flat', value: 5 }, crit: 3, range: 'engaged', qualities: [] });
    await P.sync.adopt(); await settle();
    const last = P.ev[P.ev.length - 1];
    check('S a pause announces itself: pack_state with paused.cause', !!last && !!last.paused, P.ev);
  } catch (e) { check('S ran without a crash', false, String(e && e.stack || e).slice(0, 400)); }

  if (!rows) { console.log('HARVEST 0'); process.exit(1); }
  console.log('\nms_sync_lines: ' + (fails ? fails + ' FAIL of ' + rows : 'ALL PASS — ' + rows + ' rows'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ms_sync_lines CRASHED: ' + (e && e.stack || e)); process.exit(1); });
