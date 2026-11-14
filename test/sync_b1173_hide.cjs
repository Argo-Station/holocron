#!/usr/bin/env node
/**
 * sync_b1173_hide.cjs — B-1173 + B-1183 over the REAL seam: pending keys go up when the page hides, and a load's
 * adoption neither overwrites nor forgets what was written while it ran. Card `f100-b1173-card` R-B1173C-1..5
 * (DECISIONS D-113; `f100-m9-census-card` ADDENDUM 4 R-M9C-17/-18).
 *
 * The legs are scripts/f100_b1173_probe.cjs's, made a guard in test/sync_seam.cjs's idiom: `lib/shared/sync.js`
 * createSync, `syncMerge.js` and `recency.js` load as shipped; the account is an in-memory `/api/v1/sync` with the
 * worker's version-conditional PUT; storage is a string map; the clock is virtual (the seam's own `schedule` edge,
 * with the global clearTimeout wrapped so the seam's clears reach it). A RELOAD drops every timer of the old page and
 * runs a new createSync over the same storage, adopt() then watch(), as `lib/shared/account.js` does on every load.
 * A PAGE-HIDE is the seam's `onHide` edge firing (the browser maps `pagehide` and `visibilitychange`→hidden onto it;
 * the last section loads the browser boot in a vm to hold that wiring). A keepalive request outlives its page, so the
 * fake account lands a hide's PUTs before the next page's pull.
 *
 *   C0     control — an open, a wait past the window, reload → 0 questions (green at the cut too).
 *   L1–L6  a write then a page-hide and a reload at +1 s → 0 questions, the account holds the write (R-B1173C-3).
 *   W      the probe's window grid, every cell hidden before its reload → 0 questions.
 *   F1a/b  a write during adopt()'s push loop → the FIRST sweep pushes it; the next load asks nothing (R-B1173C-2).
 *   F2a/b  a write during adopt()'s pull → still on the device and on the account, no question (R-B1173C-1; the
 *          open (a) differs only in lastOpenedAt, which merges silently since ADDENDUM 1 R-B1173C-8).
 *   F3a/b  a write during recheck()'s pull (the conflict prompt's re-entry) → still on the device (R-B1173C-9).
 *   HIDE   keepalive on the PUT · the budget is cumulative and a key over it takes the ordinary fetch · held and
 *          room-suspended keys are left alone · a failed push is sent again · one PUT however many hide events ·
 *          no listener before watch() or after unwatch() (signed out is inert) · the browser wiring.
 *
 * ENV: B1173_SYNC_DIR=<dir> loads sync.js (and its siblings) from <dir> instead of lib/shared — the bite harness.
 * EXIT: 0 every check passes · 1 a check failed, the harvest was zero, or the run crashed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DIR = process.env.B1173_SYNC_DIR ? path.resolve(process.env.B1173_SYNC_DIR) : path.join(ROOT, 'lib/shared');
const { createSync } = require(path.join(DIR, 'sync.js'));

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
};

const ROSTER = 'swrpg_saved_characters';
const DRAFT = 'swrpg_creation_draft';
const BOOKS = 'swrpg_active_sources';
const BENCH = 'swrpg_npc_bench';
const T0 = 1786000000000;

// ── the virtual clock ────────────────────────────────────────────────────────
let now = T0;
let timers = [];
let currentOwner = null;
const realClear = global.clearTimeout;
global.clearTimeout = (h) => { if (h && h.__v) { h.cancelled = true; return; } realClear(h); };
function schedule(fn, ms) {
  const t = { __v: true, at: now + ms, fn, cancelled: false, owner: currentOwner };
  timers.push(t);
  return t;
}
const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r)); };
async function advance(ms) {
  const target = now + ms;
  for (;;) {
    const due = timers.filter((t) => !t.cancelled && t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    due.cancelled = true;
    now = due.at;
    due.fn();
    await flush();
  }
  now = target;
  timers = timers.filter((t) => !t.cancelled);
}

// ── the account: the worker's sync contract, in memory ───────────────────────
function makeServer() {
  const rows = {};
  const puts = [];                         // { key, keepalive, bytes, status }
  const hooks = { onGet: null, onPut: null, failPut: 0 };
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
  function fetch(url, opts) {
    const method = (opts && opts.method) || 'GET';
    if (method === 'GET' && url === '/api/v1/sync') {
      const keys = {};
      Object.keys(rows).forEach((k) => { keys[k] = { value: rows[k].value, version: rows[k].version }; });
      const out = res(200, { keys: JSON.parse(JSON.stringify(keys)) });
      if (hooks.onGet) { const h = hooks.onGet; hooks.onGet = null; h(); }
      return Promise.resolve(out);
    }
    if (method === 'PUT' && url.indexOf('/api/v1/sync/') === 0) {
      const key = decodeURIComponent(url.slice('/api/v1/sync/'.length));
      const entry = { key, keepalive: !!(opts && opts.keepalive), bytes: Buffer.byteLength(opts.body, 'utf8'), status: 0 };
      puts.push(entry);
      if (hooks.failPut > 0) { hooks.failPut -= 1; entry.status = 'network'; return Promise.reject(new TypeError('Failed to fetch')); }
      const body = JSON.parse(opts.body);
      const cur = rows[key] ? rows[key].version : 0;
      if (body.version !== cur) { entry.status = 409; return Promise.resolve(res(409, { current: rows[key] ? { value: rows[key].value, version: cur } : null })); }
      rows[key] = { value: body.value, version: cur + 1 };
      entry.status = 200;
      if (hooks.onPut) { const h = hooks.onPut; hooks.onPut = null; h(); }
      return Promise.resolve(res(200, { version: cur + 1 }));
    }
    return Promise.reject(new Error('unrouted ' + method + ' ' + url));
  }
  return { rows, fetch, hooks, puts };
}

// ── one device: its storage, and a page that can hide and reload ────────────
function makeDevice(server, extra) {
  const mem = {};
  const storage = { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } };
  let page = null;
  function boot() {
    if (page) timers.forEach((t) => { if (t.owner === page.id) t.cancelled = true; });   // the old page's JS is gone
    const id = Symbol('page');
    currentOwner = id;
    const p = { id, hide: [], sync: null };
    p.sync = createSync(Object.assign({ fetch: server.fetch, storage, schedule, now: () => now,
      onHide: (fn) => { p.hide.push(fn); return () => { p.hide = p.hide.filter((f) => f !== fn); }; } }, extra || {}));
    page = p;
    return p;
  }
  async function load() {
    const p = boot();
    const r = await p.sync.adopt();
    await flush();
    p.sync.watch();
    return { ok: r.ok, conflicts: r.conflicts.map((c) => ({ key: c.key, kind: c.kind, id: c.id || null })) };
  }
  // the page hides (pagehide / visibilitychange→hidden), then the person reloads
  async function hide() { if (page) page.hide.slice().forEach((fn) => fn()); await flush(); }
  async function hideAndLoad() { await hide(); return load(); }
  return { mem, storage, load, hide, hideAndLoad, boot, page: () => page };
}

// ── records, and the writers as they write (scripts/f100_b1173_probe.cjs, cited by symbol in player/app.jsx) ──
const chr = (id, name, stamped) => {
  const r = { id, name, species: 'Human', career: 'Smuggler', source: 'creator',
    selectedChar: { id, name }, sheetData: { name, xp: { total: 110, spent: 100 } }, savedAt: T0 - 86400000 };
  if (stamped) r.updatedAt = T0 - 86400000;
  return r;
};
function readRoster(dev) { return JSON.parse(dev.mem[ROSTER]).characters; }
function writeRoster(dev, list) { dev.storage.set(ROSTER, JSON.stringify({ version: 1, characters: list })); }
const W = {
  upsertSavedCharacter(dev, id) {
    const list = readRoster(dev);
    const i = list.findIndex((c) => c.id === id);
    list[i] = Object.assign({}, list[i], { sheetData: Object.assign({}, list[i].sheetData, { xp: { total: 115, spent: 100 } }), updatedAt: now });
    writeRoster(dev, list);
  },
  openSheetRecord(dev, id) { const list = readRoster(dev); list.find((c) => c.id === id).lastOpenedAt = now; writeRoster(dev, list); },
  handleReorderRoster(dev) { const list = readRoster(dev).slice().reverse(); list.forEach((r, i) => { r.order = i; }); writeRoster(dev, list); },
  draft(dev) { dev.storage.set(DRAFT, JSON.stringify(Object.assign(JSON.parse(dev.mem[DRAFT]), { step: 'career' }))); },
  books(dev) { dev.storage.set(BOOKS, JSON.stringify(JSON.parse(dev.mem[BOOKS]).concat(['eote_gm']))); },
};
const acct = (server, key) => JSON.parse(server.rows[key].value);
const acctRec = (server, id) => acct(server, ROSTER).characters.find((c) => c.id === id);
const HELD = {   // what each writer leaves on the account once it got there
  upsertSavedCharacter: (s) => acctRec(s, 'char-a').sheetData.xp.total === 115,
  openSheetRecord: (s) => acctRec(s, 'char-a').lastOpenedAt != null,
  handleReorderRoster: (s) => acct(s, ROSTER).characters.every((c) => c.order != null),
  draft: (s) => acct(s, DRAFT).step === 'career',
  books: (s) => acct(s, BOOKS).indexOf('eote_gm') >= 0,
};

let baselineAsked = 0;
async function baseline(opts) {
  timers = []; now = T0;
  const server = makeServer();
  const dev = makeDevice(server, opts && opts.extra);
  const roster = { version: 1, characters: [chr('char-a', 'Kessa', !(opts && opts.legacy)), chr('char-b', 'Doran', true), chr('char-c', 'Vix', true)] };
  const seed = Object.assign({ [ROSTER]: roster, [DRAFT]: { step: 'species', species: 'human' }, [BOOKS]: ['eote', 'aor', 'fad'] }, (opts && opts.seed) || {});
  Object.keys(seed).forEach((k) => {
    const v = JSON.stringify(seed[k]);
    server.rows[k] = { value: v, version: 1 };
    dev.mem[k] = v;
  });
  const first = await dev.load();
  if (first.conflicts.length) baselineAsked += 1;
  return { server, dev, first };
}
let harvest = 0;

(async () => {
  console.log('sync_b1173_hide — pending keys at page-hide; adoption reads what it writes over\n');

  // ── C0 + L1..L6: write, (hide,) reload at +1 s ────────────────────────────
  {
    const b = await baseline({});
    await advance(300);
    W.openSheetRecord(b.dev, 'char-a');
    await advance(6000);
    const r = await b.dev.load();
    harvest++;
    check('C0 control: an open, a wait past the window, a reload → 0 questions', r.conflicts.length === 0, r.conflicts);
  }
  const LEGS = [
    ['L1', 'a sheet edit (upsertSavedCharacter)', 'upsertSavedCharacter', {}],
    ['L2', 'a sheet opened (openSheetRecord, lastOpenedAt only)', 'openSheetRecord', {}],
    ['L3', 'the roster reordered (handleReorderRoster, 3 records)', 'handleReorderRoster', {}],
    ['L4', 'a record with no updatedAt on the account, edited', 'upsertSavedCharacter', { legacy: true }],
    ['L5', 'the creator draft changed (WHOLE)', 'draft', {}],
    ['L6', 'a book switched on (WHOLE)', 'books', {}],
  ];
  for (const [leg, what, writer, opts] of LEGS) {
    const b = await baseline(opts);
    await advance(300);
    W[writer](b.dev, 'char-a');
    await advance(1000);
    const r = await b.dev.hideAndLoad();
    harvest++;
    check(leg + ' ' + what + ', page-hide, reload at +1 s → 0 questions', r.conflicts.length === 0, r.conflicts);
    check(leg + ' and the account holds the write', HELD[writer](b.server));
  }

  // ── W: the window grid, every cell hidden before its reload ──────────────
  {
    const asked = [];
    for (const phase of [2100, 3000, 3900]) {
      for (let d = 500; d <= 4500; d += 500) {
        const b = await baseline({});
        await advance(phase);
        W.openSheetRecord(b.dev, 'char-a');
        await advance(d);
        const r = await b.dev.hideAndLoad();
        harvest++;
        if (r.conflicts.length) asked.push({ edit_after_tick_ms: phase - 2000, reload_after_ms: d });
      }
    }
    check('W the window: 27 cells (3 phases × 0.5..4.5 s), each hidden before its reload → none asks', asked.length === 0, asked);
  }

  // ── F1 / F2: a write while the load's adopt() is in flight ───────────────
  for (const [tag, writer, label] of [['a', 'openSheetRecord', 'an open'], ['b', 'upsertSavedCharacter', 'a sheet edit']]) {
    {
      const b = await baseline({});
      await advance(6000);
      b.server.hooks.onPut = () => W[writer](b.dev, 'char-a');          // inside the reload's adopt() push loop
      await b.dev.load();
      await advance(b.dev.page().sync.DEBOUNCE_MS * 2 + 100);            // the first sweep, then its debounce
      harvest++;
      check('F1' + tag + ' ' + label + ' written during adopt()\'s push loop → the first sweep pushes it', HELD[writer](b.server));
      const next = await b.dev.load();
      check('F1' + tag + ' and the next load asks nothing', next.conflicts.length === 0, next.conflicts);
    }
    {
      const b = await baseline({});
      await advance(6000);
      b.server.hooks.onGet = () => W[writer](b.dev, 'char-a');          // inside the reload's pull
      const r = await b.dev.load();
      const rec = readRoster(b.dev).find((c) => c.id === 'char-a');
      harvest++;
      check('F2' + tag + ' ' + label + ' written during adopt()\'s pull → still on the device',
        writer === 'openSheetRecord' ? rec.lastOpenedAt != null : rec.sheetData.xp.total === 115, rec);
      // RE-POINTED by ADDENDUM 1 R-B1173C-8: F2a's open differs from the account ONLY in lastOpenedAt, which now merges
      // silently to the later stamp. KEEPS: the open survives on the device. DROPS: "the merge asks about it".
      check('F2' + tag + ' and it reaches the account with no question', HELD[writer](b.server) && r.conflicts.length === 0, r.conflicts);
    }
  }

  // ── F3 (R-B1173C-9, ADDENDUM 1): recheck() — the conflict prompt's re-entry — takes adopt()'s order ──
  for (const [tag, writer, label] of [['a', 'openSheetRecord', 'an open'], ['b', 'upsertSavedCharacter', 'a sheet edit']]) {
    const b = await baseline({});
    await advance(6000);
    b.server.hooks.onGet = () => W[writer](b.dev, 'char-a');            // inside recheck()'s pull
    const r = await b.dev.page().sync.recheck();
    const rec = readRoster(b.dev).find((c) => c.id === 'char-a');
    harvest++;
    check('F3' + tag + ' ' + label + ' written during recheck()\'s pull → still on the device, no question',
      (writer === 'openSheetRecord' ? rec.lastOpenedAt != null : rec.sheetData.xp.total === 115) && r.conflicts.length === 0,
      { rec, conflicts: r.conflicts });
  }

  // ── HIDE: the send itself ──────────────────────────────────────────────────
  {
    const b = await baseline({});
    await advance(300);
    W.draft(b.dev);
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    harvest++;
    check('HIDE a pending change is sent at once, with keepalive', sent.length === 1 && sent[0].key === DRAFT && sent[0].keepalive && sent[0].status === 200, sent);
    await b.dev.hide();
    await advance(10000);
    check('HIDE twice, then the debounce\'s time passes → still ONE PUT (timer cleared, snapshot advanced)', b.server.puts.length - before === 1, b.server.puts.slice(before));
  }
  {
    // a sweep-pending debounce (timer already set) is sent by the hide, and its timer does not fire again
    const b = await baseline({});
    await advance(300);
    W.books(b.dev);
    await advance(1800);                                                 // the tick at +2 s has swept it: a debounce is pending
    const before = b.server.puts.length;
    await b.dev.hide();
    await advance(10000);
    harvest++;
    const sent = b.server.puts.slice(before);
    check('HIDE a key whose debounce was already pending goes at the hide, once', sent.length === 1 && sent[0].key === BOOKS && sent[0].keepalive, sent);
  }
  {
    // the budget: one key over it takes the ordinary fetch; the sum of keepalive bodies never passes it
    const big = 'x'.repeat(70 * 1024);
    const b = await baseline({});
    const budget = b.dev.page().sync.KEEPALIVE_BUDGET;
    await advance(300);
    W.draft(b.dev); W.books(b.dev);
    const list = readRoster(b.dev); list[0].notes = big; writeRoster(b.dev, list);
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    const ka = sent.filter((p) => p.keepalive).reduce((n, p) => n + p.bytes, 0);
    const roster = sent.find((p) => p.key === ROSTER);
    harvest++;
    check('HIDE the budget is stated, and is under the browsers\' 64 KiB', typeof budget === 'number' && budget > 0 && budget <= 65536, budget);
    check('HIDE a key over the budget still goes, by the ordinary fetch', roster && !roster.keepalive && roster.status === 200, sent);
    check('HIDE the small keys ride keepalive, their sum inside the budget', sent.filter((p) => p.keepalive).length === 2 && ka <= budget, sent);
  }
  {
    // cumulative: two keys that each fit but not together → the second takes the ordinary fetch
    const b = await baseline({});
    const budget = b.dev.page().sync.KEEPALIVE_BUDGET;
    await advance(300);
    const half = 'y'.repeat(Math.floor(budget * 0.6));
    b.dev.storage.set(DRAFT, JSON.stringify({ step: 'career', pad: half }));
    b.dev.storage.set(BOOKS, JSON.stringify(['eote', half]));
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    harvest++;
    check('HIDE the budget is a SUM: of two keys that fit alone but not together, one goes keepalive and one ordinary',
      sent.length === 2 && sent.filter((p) => p.keepalive).length === 1 && sent.every((p) => p.status === 200), sent);
  }
  {
    // the order: smallest first, so the most keys ride keepalive (a 50 KiB key ahead of two 20 KiB keys in key order)
    const b = await baseline({});
    await advance(300);
    b.dev.storage.set(DRAFT, JSON.stringify({ step: 'career', pad: 'd'.repeat(50 * 1024) }));
    b.dev.storage.set(BOOKS, JSON.stringify(['eote', 'b'.repeat(20 * 1024)]));
    b.dev.storage.set('swrpg_map_pins', JSON.stringify({ tatooine: { note: 'p'.repeat(20 * 1024) } }));
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    harvest++;
    check('HIDE smallest first: the two 20 KiB keys ride keepalive, the 50 KiB key takes the ordinary fetch',
      sent.length === 3 && sent.filter((p) => p.keepalive).map((p) => p.key).sort().join() === [BOOKS, 'swrpg_map_pins'].sort().join()
      && !sent.find((p) => p.key === DRAFT).keepalive, sent);
  }
  {
    // a HELD key (C-CP-1) is left alone at the hide, even one whose last push failed
    const b = await baseline({});
    await advance(300);
    W.handleReorderRoster(b.dev);
    b.server.hooks.failPut = 1;
    await advance(4000);                                                 // swept, its PUT fails: an unsent change
    // the account's char-b moves with no stamp to order it; the question re-entry (recheck) raises it → held
    // (a rename, not a lastOpenedAt: since R-B1173C-8 a lastOpenedAt-only difference is no question)
    const acc = acct(b.server, ROSTER); acc.characters.find((c) => c.id === 'char-b').name = 'Doran II';
    b.server.rows[ROSTER] = { value: JSON.stringify(acc), version: b.server.rows[ROSTER].version + 1 };
    const r = await b.dev.page().sync.recheck();
    check('HIDE (setup) the roster has an unsent change and an open question', b.dev.page().sync.isHeld(ROSTER) && r.conflicts.length >= 1, r.conflicts);
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    harvest++;
    check('HIDE a held key is not sent', !sent.some((p) => p.key === ROSTER), sent);
  }
  {
    // a ROOM-SUSPENDED key (R-RSC-2) is left alone at the hide, even with a debounce pending from before the room
    let inRoom = false;
    const b = await baseline({ seed: { [BENCH]: { version: 1, npcs: [] } }, extra: { inRoom: () => inRoom } });
    await advance(300);
    b.dev.storage.set(BENCH, JSON.stringify({ version: 1, npcs: [{ id: 'n1' }] }));
    await advance(1800);                                                 // swept at +2 s: its debounce is pending
    inRoom = true;
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    harvest++;
    check('HIDE a room-suspended key is not sent', !sent.some((p) => p.key === BENCH), sent);
  }
  {
    // a push that failed (no network) is an unsent change: the hide sends it again
    const b = await baseline({});
    await advance(300);
    W.draft(b.dev);
    b.server.hooks.failPut = 1;
    await advance(4000);                                                 // swept at +2 s, its PUT at +4 s fails
    const failed = b.server.puts.filter((p) => p.key === DRAFT && p.status === 'network').length;
    const before = b.server.puts.length;
    await b.dev.hide();
    const sent = b.server.puts.slice(before);
    harvest++;
    check('HIDE a key whose last push failed is sent again', failed === 1 && sent.length === 1 && sent[0].key === DRAFT && sent[0].status === 200, { failed, sent });
  }
  {
    // signed out is inert: no listener until watch(), none after unwatch()
    timers = []; now = T0;
    const server = makeServer();
    const dev = makeDevice(server);
    const p = dev.boot();
    dev.storage.set(DRAFT, JSON.stringify({ step: 'x' }));
    await dev.hide();
    harvest++;
    check('HIDE signed out (never watched): no listener, no request', p.hide.length === 0 && server.puts.length === 0, { listeners: p.hide.length, puts: server.puts.length });
    p.sync.watch();
    check('HIDE watch() adds exactly one listener', p.hide.length === 1, p.hide.length);
    p.sync.unwatch();
    dev.storage.set(DRAFT, JSON.stringify({ step: 'y' }));
    await dev.hide();
    check('HIDE unwatch() (signed out again) removes it: no request', p.hide.length === 0 && server.puts.length === 0, { listeners: p.hide.length, puts: server.puts.length });
  }

  // ── the browser wiring: pagehide and visibilitychange→hidden reach the hide; visible does not ──
  {
    const src = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
    const merge = fs.readFileSync(path.join(DIR, 'syncMerge.js'), 'utf8');
    const rec = fs.readFileSync(path.join(DIR, 'recency.js'), 'utf8');
    const winL = {}, docL = {};
    const ls = {}, reqs = [];
    let tid = 0;
    const doc = { visibilityState: 'visible', addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); },
      removeEventListener: (t, f) => { docL[t] = (docL[t] || []).filter((g) => g !== f); } };
    const win = {
      document: doc,
      addEventListener: (t, f) => { (winL[t] = winL[t] || []).push(f); },
      removeEventListener: (t, f) => { winL[t] = (winL[t] || []).filter((g) => g !== f); },
      localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
      fetch: (u, o) => { reqs.push({ u, o: o || {} }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(u === '/api/v1/sync' ? { keys: {} } : { version: 1 }) }); },
      setTimeout: () => ++tid, clearTimeout: () => {},                  // never fires: the debounce is the hide's to send
    };
    win.window = win;
    const ctx = vm.createContext(Object.assign(win, { JSON, Object, Array, String, Promise, Math, Date, Error, TypeError }));
    vm.runInContext(rec, ctx); vm.runInContext(merge, ctx); vm.runInContext(src, ctx);
    const S = win.SWRPGSync;
    const count = () => (winL.pagehide || []).length + (docL.visibilitychange || []).length;
    harvest++;
    check('WIRE the browser seam exists and adds no page listener before watch()', !!S && count() === 0, count());
    S.watch();
    check('WIRE watch() listens to pagehide and visibilitychange', (winL.pagehide || []).length === 1 && (docL.visibilitychange || []).length === 1, { pagehide: (winL.pagehide || []).length, vis: (docL.visibilitychange || []).length });
    ls[DRAFT] = JSON.stringify({ step: 'z' });
    (docL.visibilitychange || []).forEach((f) => f({}));                 // still visible
    await flush();
    check('WIRE visibilitychange while visible sends nothing', reqs.length === 0, reqs.length);
    doc.visibilityState = 'hidden';
    (docL.visibilitychange || []).forEach((f) => f({}));
    await flush();
    check('WIRE visibilitychange → hidden sends the pending key with keepalive', reqs.length === 1 && reqs[0].o.keepalive === true && reqs[0].u.endsWith(DRAFT), reqs.map((r) => r.u));
    ls[BOOKS] = JSON.stringify(['eote']);
    (winL.pagehide || []).forEach((f) => f({}));
    await flush();
    check('WIRE pagehide sends the pending key with keepalive', reqs.length === 2 && reqs[1].o.keepalive === true && reqs[1].u.endsWith(BOOKS), reqs.map((r) => r.u));
    S.unwatch();
    check('WIRE unwatch() removes both listeners', count() === 0, count());
  }

  console.log('\nHARVEST ' + harvest + ' · baselines that asked ' + baselineAsked);
  if (baselineAsked) { fail++; console.log('  FAIL  a synced baseline asked a question — the rig, not the seam'); }
  if (!harvest) { fail++; console.log('  FAIL  zero harvest'); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
