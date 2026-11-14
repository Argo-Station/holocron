// test/user_art_keyspace.cjs — SHIP YARD S4 · JOB 3a · K7 (ruling `shipyard-s3-contracts` R-S3K-5 K7, as re-read in
// `shipyard-s4-ground` P3): a ship's DECK PLANS share the player's art database (lib/store/userArt.js, IndexedDB
// `swrpg_user_art`) under their own keyspace, `vessel:<vesselId>:deck:<deckId>`, and ITEM ART is every key without a
// colon. The pin: the store's count, its id list and its CLEAR ALL are about item art only — they never count or clear a
// plan — while a plan is still read (hasArt), listed by its prefix, and removed one at a time. Driven in a node vm over an
// in-memory IndexedDB; then the one writer (the DECK faces' `putPlan`) is pinned to K7's key.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

// ── an in-memory IndexedDB: one database, one object store, requests answered in order, then the transaction ──
function fakeIDB(seedKeys) {
  const data = new Map((seedKeys || []).map((k) => [k, { blob: k }]));
  const later = (fn) => setTimeout(fn, 0);
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => {},
    transaction: () => {
      const t = {};
      const req = (fn) => { const r = {}; later(() => { r.result = fn(); if (r.onsuccess) r.onsuccess(); }); return r; };
      t.objectStore = () => ({
        getAllKeys: () => req(() => Array.from(data.keys())),
        get: (k) => req(() => data.get(k)),
        put: (v, k) => req(() => { data.set(k, v); }),
        delete: (k) => req(() => { data.delete(k); }),
        clear: () => req(() => { data.clear(); }),
      });
      later(() => later(() => { if (t.oncomplete) t.oncomplete(); }));
      return t;
    },
  };
  return { data, api: { open: () => { const r = {}; later(() => { r.result = db; if (r.onsuccess) r.onsuccess(); }); return r; } } };
}

const code = fs.readFileSync(path.join(ROOT, 'lib/store/userArt.js'), 'utf8');
const ITEMS = ['blaster_pistol', 'armored_clothing'];
const PLANS = ['vessel:v_1:deck:d1', 'vessel:v_2:deck:d9'];
const idb = fakeIDB(ITEMS.concat(PLANS));
const box = { indexedDB: idb.api, console: console, setTimeout: setTimeout, Promise: Promise,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  SWRPGItemRegistries: { load: () => Promise.resolve({ weapons: { blaster_pistol: { _source_key: 'BLASTERPISTOL' } }, armor: { armored_clothing: {} }, gear: {} }) } };
box.window = box;
let UA = null;
try { vm.runInNewContext(code, box, { filename: 'userArt.js' }); UA = box.SWRPGUserArt; } catch (e) { check('userArt.js evaluates', false, String(e).slice(0, 160)); }
check('the store is up: window.SWRPGUserArt', !!UA);

(async function main() {
  if (!UA) return finish();
  check('K7: deckKey(vesselId, deckId) is vessel:<vesselId>:deck:<deckId>', typeof UA.deckKey === 'function' && UA.deckKey('v_1', 'd1') === 'vessel:v_1:deck:d1',
    UA.deckKey && UA.deckKey('v_1', 'd1'));
  check('K7: a key without a colon is item art, a keyspace key is not', typeof UA.isItemKey === 'function' && UA.isItemKey('blaster_pistol') === true && UA.isItemKey('vessel:v_1:deck:d1') === false);
  await UA.ready();
  check('non-vacuity: the database holds 2 item pictures and 2 deck plans', idb.data.size === 4, Array.from(idb.data.keys()));
  check('K7: count() counts item art only (2, not 4)', UA.count() === 2, UA.count());
  check('K7: ids() lists item art only', JSON.stringify(UA.ids().slice().sort()) === JSON.stringify(ITEMS.slice().sort()), UA.ids());
  check('K7: a plan is still read by its key (hasArt)', UA.hasArt('vessel:v_1:deck:d1') === true && UA.hasArt('vessel:v_1:deck:nope') === false);
  check('K7: listPrefix lists a ship\'s plans, and only that ship\'s', typeof UA.listPrefix === 'function'
    && JSON.stringify(UA.listPrefix('vessel:v_1:')) === JSON.stringify(['vessel:v_1:deck:d1']), UA.listPrefix && UA.listPrefix('vessel:v_1:'));
  await UA.setOne(UA.deckKey ? UA.deckKey('v_1', 'd2') : 'vessel:v_1:deck:d2', { blob: 'plan' });
  check('K7: adding a plan changes no item count', UA.count() === 2 && UA.listPrefix && UA.listPrefix('vessel:v_1:').length === 2, { count: UA.count() });
  await UA.clearAll();
  check('K7: CLEAR ALL clears the item art (count 0)', UA.count() === 0 && UA.ids().length === 0, UA.count());
  check('K7: CLEAR ALL never touches a plan: all three plans are still in the database and still read',
    ['vessel:v_1:deck:d1', 'vessel:v_1:deck:d2', 'vessel:v_2:deck:d9'].every((k) => idb.data.has(k) && UA.hasArt(k)), Array.from(idb.data.keys()));
  await UA.removeOne('vessel:v_1:deck:d1');
  check('a plan is removed one at a time, by its key (removing a deck)', !idb.data.has('vessel:v_1:deck:d1') && idb.data.has('vessel:v_1:deck:d2'), Array.from(idb.data.keys()));

  // ── the one writer: the DECK faces write a plan under K7's key, and remove it with its deck ──
  const vv = fs.readFileSync(path.join(ROOT, 'lib/shared/vesselView.jsx'), 'utf8');
  check('the one writer: putPlan stores the plan under UA.deckKey(<vesselId>, <deckId>) and names it in the deck\'s `art`',
    /var key = UA\.deckKey\(rec\.id, id\);\s*return UA\.setOne\(key, file\)/.test(vv) && /Object\.assign\(\{\}, d, \{ art: key \}\)/.test(vv));
  check('removing a deck removes its plan from this device (its `art` key)', /if \(d\.art && UA\) UA\.removeOne\(d\.art\);/.test(vv));

  // ── R-S4SH-1 (ruling `shipyard-s4-ship`, F1): K7's other half — "vessel delete removes their blobs; retire keeps them" ──
  check('R-S4SH-1: vesselPrefix(id) is the ship\'s whole keyspace, and every deck key lives under it',
    typeof UA.vesselPrefix === 'function' && UA.vesselPrefix('v_1') === 'vessel:v_1:' && UA.deckKey('v_1', 'd1').indexOf(UA.vesselPrefix('v_1')) === 0);
  if (typeof UA.removePrefix === 'function') {
    await UA.setOne('vessel:v_2:deck:d3', { blob: 'plan' });
    await UA.setOne('vessel:v_2:deck:d4', { blob: 'plan' });
    await UA.setOne('lightsaber', { blob: 'item' });
    const n = await UA.removePrefix(UA.vesselPrefix('v_2'));
    check('R-S4SH-1: removePrefix(vesselPrefix(v_2)) removes every plan v_2 kept (3: the seeded d9, d3, d4) — from the database and from what the store reads',
      n === 3 && !idb.data.has('vessel:v_2:deck:d9') && !idb.data.has('vessel:v_2:deck:d3') && !idb.data.has('vessel:v_2:deck:d4') && UA.listPrefix('vessel:v_2:').length === 0, { n, keys: Array.from(idb.data.keys()) });
    check('R-S4SH-1: …and nothing else: another ship\'s plan and the item art stay', idb.data.has('vessel:v_1:deck:d2') && idb.data.has('lightsaber'), Array.from(idb.data.keys()));
    const refused = await UA.removePrefix('lightsaber');
    check('R-S4SH-1: a prefix that is not a keyspace (no colon) removes nothing — item art can never go this way', refused === 0 && idb.data.has('lightsaber'));
  } else check('R-S4SH-1: the store can remove a ship\'s keyspace (removePrefix)', false, 'absent');
  const fnBody = (name) => { const i = vv.indexOf('function ' + name + '('); if (i < 0) return ''; const j = vv.indexOf('\n  }\n', i); return vv.slice(i, j); };
  const del = vv.slice(vv.indexOf("'data-testid': 'ship-delete'") - 80, vv.indexOf("'data-testid': 'ship-delete'") + 260);
  const ret = vv.slice(vv.indexOf("'data-testid': 'ship-retire'") - 40, vv.indexOf("'data-testid': 'ship-retire'") + 260);
  check('R-S4SH-1: DELETE THIS SHIP removes the record AND its plans — one writer, removeShip: removeVessel + removePrefix(vesselPrefix(id))',
    /removeShip\(p\)/.test(del) && /V\(\)\.removeVessel\(s, id\)/.test(fnBody('removeShip')) && /UA\.removePrefix\(UA\.vesselPrefix\(id\)\)/.test(fnBody('removeShip')), del.slice(0, 160));
  check('R-S4SH-1: RETIRE keeps the plans — it retires the record and removes nothing from this device',
    /VS\.retire\(s, rec\.id/.test(ret) && !/removeShip|removePrefix|removeOne/.test(ret), ret.slice(0, 160));

  // ── B-983 (ruling `shipyard-s5-ready` P2; R-S4SH-1's last clause): a ship deleted on ANOTHER device reaches this one as a
  // sync tombstone, and the vessel store's re-read takes its plans with it. The MEASURED row this replaces said "no sync or
  // store module reaches the art database" (retired with the fix, the retiring-assert law). Driven: the REAL store
  // (lib/shared/vesselStore.js) over a fake localStorage, beside the REAL art store above. ──
  const SM = require(path.join(ROOT, 'lib/shared/syncMerge.js'));
  const out = SM.mergeAdoption({ swrpg_vessels_v1: { v: 3, vessels: [{ id: 'v_9', vehicleKey: 'YT1300', owner: 'party', decks: [{ id: 'd1', name: 'MAIN', art: 'vessel:v_9:deck:d1', areas: [] }] }] }, swrpg_deleted_ids: [] },
    { swrpg_deleted_ids: ['v_9'] });
  check('B-983 premise: a remote tombstone drops the record here (v_9 gone after the adoption merge)',
    !((out.merged.swrpg_vessels_v1 || {}).vessels || []).some((v) => v.id === 'v_9'));
  for (const k of ['vessel:v_9:deck:d1', 'vessel:v_9:deck:d2', 'vessel:v_8:deck:d1', 'vessel:v_7:deck:d1', 'vessel:v_6:deck:d1']) await UA.setOne(k, { blob: 'plan' });
  const LS = new Map(), listeners = [];
  const ls = { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) };
  const ship = (id) => ({ id, vehicleKey: 'YT1300', owner: 'party' });
  // the page's first read: v_9 is tombstoned with no record (the sync wrote it before the store read) → swept at ensure();
  // v_8 is absent and NOT tombstoned (a strip is not a delete) → kept; v_7 is LIVE (and tombstoned: a live record wins) → kept
  LS.set('swrpg_vessels_v1', JSON.stringify({ v: 3, vessels: [ship('v_7'), ship('v_6')] }));
  LS.set('swrpg_deleted_ids', JSON.stringify(['char_1', 'v_9', 'v_7']));
  const vbox = { localStorage: ls, SWRPGUserArt: UA, addEventListener: (t, fn) => { if (t === 'storage') listeners.push(fn); }, console };
  new Function(fs.readFileSync(path.join(ROOT, 'lib/shared/vesselStore.js'), 'utf8')).call(vbox);
  const VS = vbox.SWRPGVessels;
  VS.getState();
  await new Promise((r) => setTimeout(r, 30));
  check('B-983 (ensure): a tombstoned id with no record here loses every vessel:<id>: key (v_9: d1, d2)',
    !idb.data.has('vessel:v_9:deck:d1') && !idb.data.has('vessel:v_9:deck:d2') && UA.listPrefix('vessel:v_9:').length === 0, Array.from(idb.data.keys()));
  check('B-983: an id merely ABSENT from the list, never tombstoned, keeps its plans (v_8)', idb.data.has('vessel:v_8:deck:d1'));
  check('B-983: a LIVE record keeps its plans even where its id is in the shared list (v_7), and so does an untouched live ship (v_6)',
    idb.data.has('vessel:v_7:deck:d1') && idb.data.has('vessel:v_6:deck:d1'));
  check('B-983: a character id in the shared list sweeps nothing, and item art is untouched', idb.data.has('vessel:v_8:deck:d1') && idb.data.has('vessel:v_1:deck:d2'));
  // a later arrival: another device's delete of v_6 comes in through the sync layer / another tab → the raw string moves → pull()
  LS.set('swrpg_vessels_v1', JSON.stringify({ v: 3, vessels: [ship('v_7')] }));
  LS.set('swrpg_deleted_ids', JSON.stringify(['char_1', 'v_9', 'v_7', 'v_6']));
  listeners.forEach((fn) => fn({ key: 'swrpg_vessels_v1' }));
  await new Promise((r) => setTimeout(r, 30));
  check('B-983 (pull): a delete arriving later (the storage seam) takes v_6\'s plans, and v_7, v_8 keep theirs',
    !idb.data.has('vessel:v_6:deck:d1') && idb.data.has('vessel:v_7:deck:d1') && idb.data.has('vessel:v_8:deck:d1'), Array.from(idb.data.keys()));
  // THE ORDER RACE (found by smoke_yard_s4_ship's live leg): another tab's sync writes the keys in its map's order, so the
  // fleet's storage event can arrive BEFORE the tombstone is written. The fleet event sweeps nothing (no tombstone yet); the
  // tombstone's own event must then sweep.
  await UA.setOne('vessel:v_5:deck:d1', { blob: 'plan' });
  LS.set('swrpg_vessels_v1', JSON.stringify({ v: 3, vessels: [ship('v_7'), ship('v_5')] }));
  listeners.forEach((fn) => fn({ key: 'swrpg_vessels_v1' }));
  await new Promise((r) => setTimeout(r, 30));
  LS.set('swrpg_vessels_v1', JSON.stringify({ v: 3, vessels: [ship('v_7')] }));
  listeners.forEach((fn) => fn({ key: 'swrpg_vessels_v1' }));   // the fleet first: v_5 gone, its tombstone not yet written
  await new Promise((r) => setTimeout(r, 30));
  const early = idb.data.has('vessel:v_5:deck:d1');
  LS.set('swrpg_deleted_ids', JSON.stringify(['char_1', 'v_9', 'v_7', 'v_6', 'v_5']));
  listeners.forEach((fn) => fn({ key: 'swrpg_deleted_ids' }));  // then the tombstone
  await new Promise((r) => setTimeout(r, 30));
  check('B-983 (the order race): the fleet\'s event before the tombstone sweeps nothing (no delete yet); the tombstone\'s own event then takes v_5\'s plans',
    early && !idb.data.has('vessel:v_5:deck:d1') && idb.data.has('vessel:v_7:deck:d1'), { early, keys: Array.from(idb.data.keys()) });
  // total without the art module: the GM host or node may load the store without it
  const nbox = { localStorage: ls, addEventListener: () => {}, console };
  new Function(fs.readFileSync(path.join(ROOT, 'lib/shared/vesselStore.js'), 'utf8')).call(nbox);
  let threw = null; try { nbox.SWRPGVessels.getState(); } catch (e) { threw = String(e); }
  check('B-983: total without SWRPGUserArt (the read never throws)', threw === null, threw);
  finish();
})().catch((e) => { check('the drive completes', false, String(e && e.stack || e).slice(0, 300)); finish(); });

function finish() {
  console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
  process.exit(fail ? 1 : 0);
}
