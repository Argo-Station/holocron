#!/usr/bin/env node
/* test/table_server_routes.cjs — the table server's routing, code index and source limits, run from the REAL sources
 * under a fake `env` (ruling `encounters-e6-plumbing` ADDENDUM 2, rider R-E6P-R3). The Worker entry and the three
 * objects are loaded as written, with only their module lines rewritten for a node Function and the platform stood in
 * by fakes: sockets that pair, objects whose storage outlives their instance (a memory reset is a new instance over the
 * same storage), and a random source the guard scripts.
 *   R1 P8.1.1 exactly one route key; P8.1.2 the first frame agrees with the route, else bad_frame and the socket closes
 *   R2 P8.2.1 a code is normalised before it names its object: a typed `abc-def` and `ABCDEF` reach ONE Code object
 *   R3 P8.2.2 claim, never overwrite: a collision draws again, and the first table's code still points at it
 *   R4 P8.1.4 a guessed (parsed) tableId writes NOTHING to that object's storage, and its miss is counted
 *   R5 P8.3 order: slow_down is checked before the lookup — after 10 misses, a live code is refused with no Code read
 *   R6 P8.3 in STORAGE: the counts and the listed entry survive a memory reset between two joins
 *   R7 P8.2.3 newcode: the old code is no_table the moment newcode returns; a listed table is listed again
 *   R9 R-E6F-5: the GM's `listing {on}` puts and drops the entry, with no reply; `on` must be boolean; a player's is bad_frame
 *   R8 every refusal reaches the client as a frame (101 + `{t:'error'}`), never an HTTP status
 *   R10 `encounters-e6-wire-online` ADDENDUM 9 W-1: a GM REJOIN's `opened` carries `seats`, the knockIds meta.seats still
 *       holds (ids only); a seat that left while the GM was away is not named; `open` and `newcode` carry none
 *
 * `node test/table_server_routes.cjs --bite` runs each mutant on a COPY of table-server/src; exit 1 if one survives.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = process.env.TS_SRC_DIR || path.join(ROOT, 'table-server/src');

const MUTANTS = [
  ['first-frame-disagrees', 'R1', 'table.js', 'R.normalizeCode(f.code) === who.urlCode', 'true'],
  ['code-not-normalised', 'R2', 'index.js', 'const code = R.normalizeCode(value);', "const code = /^[0-9A-Za-z-]{6,7}$/.test(value) ? value : null;"],
  ['code-overwritten', 'R3', 'code.js', "if (live && live.tableId !== body.tableId) return json({ ok: false, error: 'taken' }, 409);", ''],
  ['guess-writes', 'R4', 'table.js', 'server.serializeAttachment({ role: \'pending\', mode, group, urlCode, urlTable });',
    "server.serializeAttachment({ role: 'pending', mode, group, urlCode, urlTable }); await this.ctx.storage.put('seen', 1);"],
  ['lookup-before-limit', 'R5', 'index.js', "if (!(await ask(listing, '/may-join')).ok) return refuse('slow_down');",
    "if (route === 'code') await env.CODE.get(env.CODE.idFromName(R.normalizeCode(value) || 'ZZZZZZ')).fetch('https://code/get');\n      if (!(await ask(listing, '/may-join')).ok) return refuse('slow_down');"],
  ['counts-in-memory', 'R6', 'listing.js', "const st = (await this.ctx.storage.get('s')) || { tables: {}, fails: [], opens: [] };",
    "const st = this.mem || (this.mem = { tables: {}, fails: [], opens: [] });"],
  ['rejoin-no-seats', 'R10', 'table.js', "tableId: meta.tableId, seats: Object.keys(meta.seats || {}).slice(0, R.MAX_SEATS) });", 'tableId: meta.tableId });'],
  ['rejoin-names-all', 'R10', 'table.js', "seats: Object.keys(meta.seats || {}).slice(0, R.MAX_SEATS) });", "seats: Object.keys(meta.seats || {}).concat(['k_gone']).slice(0, R.MAX_SEATS) });"],
  ['newcode-seats', 'R10', 'table.js', "      meta.lastFrameAt = now;\n      await this.#save(meta);\n      return send(ws, { t: 'opened', code: meta.code, codeExpiresAt: meta.codeExpiresAt, tableId: meta.tableId });",
    "      meta.lastFrameAt = now;\n      await this.#save(meta);\n      return send(ws, { t: 'opened', code: meta.code, codeExpiresAt: meta.codeExpiresAt, tableId: meta.tableId, seats: [] });"],
  ['old-code-lives', 'R7', 'table.js', "if (f.t === 'newcode') {\n      await this.#dropCode(meta);", "if (f.t === 'newcode') {"],
  ['listing-never-put', 'R9', 'table.js', "if (f.on && !meta.listed) {                                    // as `open` with listed true (#issueCode's put)", "if (false) {"],
  ['listing-never-dropped', 'R9', 'table.js', "} else if (!f.on && meta.listed) {                             // as `close` (#dropCode's drop)", "} else if (false) {"],
  ['listing-unfenced', 'R9', 'rules.mjs', "listing: (f) => typeof f.on === 'boolean',", 'listing: () => true,'],
  ['refusal-as-status', 'R8', 'index.js', "function refuse(code) {", "function refuse(code) {\n  return new Response(code, { status: 403 });"],
];

if (process.argv.includes('--bite')) {
  let bad = 0;
  for (const [name, leg, file, find, repl] of MUTANTS) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-routes-'));
    for (const f of fs.readdirSync(path.join(ROOT, 'table-server/src'))) fs.copyFileSync(path.join(ROOT, 'table-server/src', f), path.join(tmp, f));
    const src = fs.readFileSync(path.join(tmp, file), 'utf8');
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; fs.rmSync(tmp, { recursive: true }); continue; }
    fs.writeFileSync(path.join(tmp, file), src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { TS_SRC_DIR: tmp }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(22) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 20; i++) await tick(); }

(async () => {
  const R = await import(path.join(SRC_DIR, 'rules.mjs'));

  // ── the platform, faked ──
  let byteQueue = [];                                   // the random source: scripted 1-byte draws first, then real
  const realCrypto = globalThis.crypto;
  const fakeCrypto = {
    subtle: realCrypto.subtle,
    getRandomValues(a) { if (a.length === 1 && byteQueue.length) { a[0] = byteQueue.shift(); return a; } return realCrypto.getRandomValues(a); },
  };
  class FakeResponse {
    constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; this.webSocket = init && init.webSocket; this.ok = this.status >= 200 && this.status < 300; }
    async json() { return typeof this.body === 'string' ? JSON.parse(this.body) : this.body; }
    static json(b, init) { return new FakeResponse(JSON.stringify(b), init); }
  }
  class Sock {
    constructor() { this.peer = null; this.got = []; this.closed = false; this.att = null; this.host = null; }
    accept() { this.accepted = true; }
    send(data) {
      if (this.closed) throw new Error('closed');
      const p = this.peer;
      if (p.isClient) p.got.push(JSON.parse(data));
      else if (p.host) p.host.webSocketMessage(p, data);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      const p = this.peer;
      if (p) { p.closed = true; if (!p.isClient && p.host) { p.host.ctx._drop(p); p.host.webSocketClose(p); } if (!this.isClient && this.host) this.host.ctx._drop(this); }
    }
    serializeAttachment(a) { this.att = JSON.parse(JSON.stringify(a)); }
    deserializeAttachment() { return this.att; }
  }
  function WebSocketPair() { const c = new Sock(), s = new Sock(); c.isClient = true; c.peer = s; s.peer = c; return { 0: c, 1: s }; }

  const stores = {};                                    // `${ns}:${id}` → { map, alarm, writes }
  function makeNs(name, Klass, env) {
    const instances = {};
    const ns = {
      reads: 0,
      idFromName: (n) => ({ toString: () => name + ':' + n, key: name + ':' + n }),
      newUniqueId: () => { const h = Array.from(realCrypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join(''); return { toString: () => h, key: name + ':' + h }; },
      idFromString: (s) => { if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('bad id'); return { toString: () => s, key: name + ':' + s }; },
      get(id) {
        return { fetch: async (req, init) => {
          if (name === 'CODE' && String(req.url || req).endsWith('/get')) ns.reads++;
          const inst = instances[id.key] || (instances[id.key] = make(id));
          const r = typeof req === 'string' ? new Request(req, init) : req;
          return inst.fetch(r);
        } };
      },
      reset(key) { delete instances[key]; },             // a memory reset: the storage stays, the instance goes
      instance: (key) => instances[key],
    };
    function make(id) {
      const st = stores[id.key] || (stores[id.key] = { map: new Map(), alarm: null, writes: 0 });
      const live = [];
      const ctx = {
        id: { toString: () => id.toString() },
        storage: {
          get: async (k) => (st.map.has(k) ? JSON.parse(st.map.get(k)) : undefined),
          put: async (k, v) => { st.writes++; st.map.set(k, JSON.stringify(v)); },
          deleteAll: async () => { st.map.clear(); },
          setAlarm: async (t) => { st.writes++; st.alarm = t; },
          deleteAlarm: async () => { st.alarm = null; },
        },
        acceptWebSocket: (ws) => { ws.host = inst; live.push(ws); },
        getWebSockets: () => live.filter((s) => !s.closed),
        setWebSocketAutoResponse: () => {},
        _drop: (ws) => { const i = live.indexOf(ws); if (i >= 0) live.splice(i, 1); },
      };
      const inst = new Klass(ctx, env);
      return inst;
    }
    return ns;
  }

  function load(file) {
    let src = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    src = src.replace(/^import \{ DurableObject \} from 'cloudflare:workers';$/m, '')
      .replace(/^import \* as R from '\.\/rules\.mjs';$/m, '')
      .replace(/^import \{ (\w+) \} from '\.\/\w+\.js';$/gm, '')
      .replace(/^export \{[^}]*\};$/m, '')
      .replace(/^export class (\w+)/m, 'class $1')
      .replace(/^export default \{/m, 'const __default = {');
    const tail = file === 'index.js' ? '\nreturn __default;' : '\nreturn ' + (src.match(/^class (\w+)/m) || [])[1] + ';';
    // eslint-disable-next-line no-new-func
    const params = ['R', 'DurableObject', 'WebSocketPair', 'WebSocketRequestResponsePair', 'Response', 'crypto'].concat(file === 'index.js' ? ['Table', 'Listing', 'Code'] : []);
    return new Function(...params, src + tail);
  }
  class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
  const G = [R, DurableObject, WebSocketPair, function () {}, FakeResponse, fakeCrypto];
  const Table = load('table.js')(...G), Listing = load('listing.js')(...G), Code = load('code.js')(...G);
  const Worker = load('index.js')(...G, Table, Listing, Code);
  const env = {};
  env.TABLE = makeNs('TABLE', Table, env); env.LISTING = makeNs('LISTING', Listing, env); env.CODE = makeNs('CODE', Code, env);

  let ip = 1;
  async function connect(query, from) {
    const req = new Request('https://table.test/t' + query, { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': from || '10.0.0.1' } });
    const res = await Worker.fetch(req, env);
    await settle();
    const c = res.webSocket || { got: [], closed: true, status: res.status, send() {} };
    c.status = res.status;
    // a browser drops a send on a CLOSED socket; the client side does the same, so a refused route reds its own leg
    c.frame = (f) => { if (!c.closed) c.send(JSON.stringify(Object.assign({ v: 1 }, f))); };
    return c;
  }
  const last = (c, t) => [...c.got].reverse().find((f) => f.t === t) || null;
  const errOf = (c) => (last(c, 'error') || {}).code || null;
  async function openTable(label, listed, from) {
    const gm = await connect('?open=1', from);
    gm.frame({ t: 'open', label, listed: !!listed }); await settle();
    return { gm, op: last(gm, 'opened') };
  }

  // ── R1 the route and the first frame ──
  const A = await openTable('One');
  const B = await openTable('Two');
  const two = await connect('?open=1&list=1');
  check('R1 two route keys: bad_frame, and the socket is closed', errOf(two) === 'bad_frame' && two.closed, two.got);
  const mism = await connect('?code=' + A.op.code);
  mism.frame({ t: 'join', code: B.op.code, deviceLabel: 'x' }); await settle();
  check('R1 ?code= with another code in the frame: bad_frame, closed, and no knock at either GM', errOf(mism) === 'bad_frame' && mism.closed
    && !last(A.gm, 'knock') && !last(B.gm, 'knock'), mism.got);
  const wrongT = await connect('?table=' + A.op.tableId);
  wrongT.frame({ t: 'join', tableId: B.op.tableId, deviceLabel: 'x' }); await settle();
  check('R1 ?table= with another tableId in the frame: bad_frame and closed', errOf(wrongT) === 'bad_frame' && wrongT.closed, wrongT.got);

  // ── R2 normalised before naming ──
  const typed = A.op.code.toLowerCase().replace(/^(...)/, '$1-').replace(/1/g, 'l').replace(/0/g, 'o');
  const j = await connect('?code=' + encodeURIComponent(typed));
  j.frame({ t: 'join', code: typed, deviceLabel: 'typed' }); await settle();
  check('R2 a code typed in lower case, with a hyphen and I/L/O look-alikes, reaches the same table', !errOf(j) && !j.closed && !!(last(A.gm, 'knock') && last(A.gm, 'knock').deviceLabel === 'typed'), { typed, got: j.got });

  // ── R3 claim, never overwrite ──
  byteQueue = [0, 0, 0, 0, 0, 0];
  const C1 = await openTable('Claim');
  byteQueue = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  const C2 = await openTable('Collide');
  const ptr = await (await env.CODE.get(env.CODE.idFromName('000000')).fetch('https://code/get')).json();
  check('R3 the first table took 000000; the colliding table drew again (111111)', C1.op.code === '000000' && C2.op.code === '111111', [C1.op.code, C2.op.code]);
  check('R3 …and 000000 still points at the FIRST table', ptr.ok && ptr.tableId === C1.op.tableId, ptr);

  // ── R4 a guessed tableId writes nothing ──
  const guess = env.TABLE.newUniqueId().toString();
  const missesBefore = JSON.parse((stores['LISTING:v4:10.0.0.9'] || { map: new Map([['s', '{"fails":[]}']]) }).map.get('s') || '{"fails":[]}').fails.length;
  const g1 = await connect('?table=' + guess, '10.0.0.9');
  g1.frame({ t: 'join', tableId: guess, deviceLabel: 'g' }); await settle();
  const g2 = await connect('?table=' + guess, '10.0.0.9');
  g2.frame({ t: 'rejoin', tableId: guess, seatKey: 'nope' }); await settle();
  const gs = stores['TABLE:' + guess];
  check('R4 a guessed id: join is no_table, rejoin is closed', errOf(g1) === 'no_table' && errOf(g2) === 'closed', [g1.got, g2.got]);
  check('R4 …and NOTHING was written to that object (no key, no alarm)', !gs || (gs.writes === 0 && gs.map.size === 0 && gs.alarm == null), gs && { writes: gs.writes, keys: [...gs.map.keys()] });
  const fails = JSON.parse(stores['LISTING:v4:10.0.0.9'].map.get('s')).fails.length;
  check('R4 …and the join miss is counted in the source group', fails === missesBefore + 1, { missesBefore, fails });

  // ── R5 slow_down before the lookup ──
  for (let i = 0; i < 10; i++) { const c = await connect('?code=ZZZZZZ', '10.0.0.7'); }
  const live = await openTable('Live', false, '10.0.0.8');
  const readsBefore = env.CODE.reads;
  const s = await connect('?code=' + live.op.code, '10.0.0.7');
  check('R5 after 10 misses, a LIVE code is slow_down', errOf(s) === 'slow_down', s.got);
  check('R5 …and the Code object was never read for it (the check came first)', env.CODE.reads === readsBefore, { before: readsBefore, after: env.CODE.reads });

  // ── R6 in storage, through a memory reset ──
  const L = await openTable('Listed', true, '10.0.0.5');
  for (let i = 0; i < 9; i++) await connect('?code=YYYYYY', '10.0.0.5');
  env.LISTING.reset('LISTING:v4:10.0.0.5');
  const lst = await connect('?list=1', '10.0.0.5');
  lst.frame({ t: 'list' }); await settle();
  const tables = (last(lst, 'tables') || {}).tables || [];
  check('R6 after a memory reset, the group still lists its table', tables.some((x) => x.tableId === L.op.tableId), tables);
  env.LISTING.reset('LISTING:v4:10.0.0.5');
  await connect('?code=YYYYYY', '10.0.0.5');
  env.LISTING.reset('LISTING:v4:10.0.0.5');
  const after = await connect('?code=' + L.op.code, '10.0.0.5');
  check('R6 …and nine misses + one more across resets reach the limit: the next join is slow_down', errOf(after) === 'slow_down', after.got);

  // ── R7 newcode ──
  const N = await openTable('Renew', true, '10.0.0.4');
  const oldCode = N.op.code;
  N.gm.frame({ t: 'newcode' }); await settle();
  const fresh = last(N.gm, 'opened');
  const o = await connect('?code=' + oldCode, '10.0.0.3');
  check('R7 the old code is no_table the moment newcode returns', fresh && fresh.code !== oldCode && errOf(o) === 'no_table', { fresh, got: o.got });
  const lst2 = await connect('?list=1', '10.0.0.4');
  lst2.frame({ t: 'list' }); await settle();
  check('R7 a listed table stays listed after newcode', ((last(lst2, 'tables') || {}).tables || []).some((x) => x.tableId === N.op.tableId));

  // ── R9 R-E6F-5 (ruling `encounters-e6-frames` ADDENDUM 2): the GM's `listing` frame puts and drops; no reply; a player's is bad_frame ──
  const listedIn = async (tableId, from) => { const q = await connect('?list=1', from); q.frame({ t: 'list' }); await settle(); return ((last(q, 'tables') || {}).tables || []).some((x) => x.tableId === tableId); };
  const W = await openTable('Wifi', false, '10.0.0.11');
  const before9 = W.gm.got.length;
  check('R9 opened unlisted: not in the group\'s list', !(await listedIn(W.op.tableId, '10.0.0.11')));
  W.gm.frame({ t: 'listing', on: true }); await settle();
  check('R9 the GM sends listing on: the table is listed, and the GM got no reply', (await listedIn(W.op.tableId, '10.0.0.11')) && W.gm.got.length === before9, W.gm.got.slice(before9));
  W.gm.frame({ t: 'listing', on: false }); await settle();
  check('R9 the GM sends listing off: the table is dropped from the list, still open, no reply', !(await listedIn(W.op.tableId, '10.0.0.11')) && !W.gm.closed && W.gm.got.length === before9, W.gm.got.slice(before9));
  W.gm.frame({ t: 'listing', on: 'yes' }); await settle();
  check('R9 `on` not a boolean: bad_frame', errOf(W.gm) === 'bad_frame', W.gm.got.slice(before9));
  const wp = await connect('?code=' + W.op.code, '10.0.0.11');
  wp.frame({ t: 'join', code: W.op.code, deviceLabel: 'p' }); await settle();
  W.gm.frame({ t: 'admit', knockId: last(W.gm, 'knock').knockId }); await settle();
  wp.frame({ t: 'listing', on: true }); await settle();
  check('R9 a player\'s listing frame is bad_frame, and lists nothing', errOf(wp) === 'bad_frame' && !(await listedIn(W.op.tableId, '10.0.0.11')), wp.got);

  // ── R10 W-1: the GM rejoin's `opened` names the seats meta still holds ──
  const S10 = await openTable('Seats', false, '10.0.0.13');
  check('R10 open\'s `opened` carries no seats', S10.op && !('seats' in S10.op), S10.op);
  const seatUp = async (lb) => { const p = await connect('?code=' + S10.op.code, '10.0.0.13'); p.frame({ t: 'join', code: S10.op.code, deviceLabel: lb }); await settle();
    const k = last(S10.gm, 'knock').knockId; S10.gm.frame({ t: 'admit', knockId: k }); await settle(); return { p, k }; };
  const sA = await seatUp('A'), sB = await seatUp('B');
  S10.gm.frame({ t: 'newcode' }); await settle();
  check('R10 newcode\'s `opened` carries no seats', !('seats' in (last(S10.gm, 'opened') || {})), last(S10.gm, 'opened'));
  S10.gm.close(); await settle();
  sA.p.frame({ t: 'play', msg: { type: 'bye', payload: { reason: 'left' } } }); await settle();   // A leaves while the GM is away
  const g10 = await connect('?table=' + S10.op.tableId, '10.0.0.13');
  g10.frame({ t: 'rejoin', tableId: S10.op.tableId, gmKey: S10.op.gmKey }); await settle();
  const ro = last(g10, 'opened');
  check('R10 the GM rejoin\'s `opened` names the seat still held, not the one that left while it was away', ro && Array.isArray(ro.seats) && ro.seats.length === 1 && ro.seats[0] === sB.k
    && sA.k !== sB.k, { ro, kA: sA.k, kB: sB.k });
  check('R10 …ids only: no label, key or who', ro && Array.isArray(ro.seats) && ro.seats.every((s) => typeof s === 'string' && s.indexOf('k_') === 0), ro);

  // ── R8 refusals are frames ──
  const junk = await connect('?bogus=1', '10.0.0.2');
  const nt = await connect('?code=QQQQQQ', '10.0.0.2');
  check('R8 a bad route and a dead code each answer 101 with an error frame, never an HTTP status',
    junk.status === 101 && errOf(junk) === 'bad_frame' && nt.status === 101 && errOf(nt) === 'no_table', [junk.status, nt.status]);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  harness threw: ' + (e && e.stack)); process.exit(1); });
