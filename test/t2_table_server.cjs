#!/usr/bin/env node
/* test/t2_table_server.cjs — T2's table-server change, driven LIVE over real WebSockets on the run kit's local server
 * (the harness of test/table_server_wire.cjs, copied: that file runs its own suite on load). Rulings
 * `encounters-t2-shapes` §2 + ADDENDUM 2, `encounters-t2-build` item 2 (R-T2S-2's bites).
 *
 * T1  ?open=<ref> + the secret → opened; the seats it seeds come back on a rejoin's opened; a secret on ?open=1 → bad_frame
 * T2  BITE · a wrong secret on a ref route → bad_frame, and the socket closes                       (security line 1)
 * T3  LET IN → the GM's `seated {knockId, deviceLabel, seatKeyHash}` (43-char b64url = SHA-256 of the seat key)
 * T4  BITE · a player's seat key used as the GM's (rejoin gmKey, and as the secret) → closed / bad_frame (line 2)
 * T5  a GM back in a new browser session: the secret takes the live table over (new gmKey, seats kept, old GM hung up)
 * T6  BITE · after `forget` the seat's key rejoins → closed (a stale seatKeyHash)                    (line 4)
 * T7  a seeded player's `rejoin {wait:true}` on no meta → table waiting; the seeding open → table here, GM peer here
 * T8  BITE · an UNSEEDED waiting socket → closed at the open, never seated                           (line 3)
 * T9  BITE · a rejoin WITHOUT `wait` on no meta → closed (today's answer, ADDENDUM 2); `wait: false` → bad_frame
 * T10 `record` and `shared` relay GM → player
 * (R-T2S-2's other two bites, a memory field in a URL and the memory absent from syncMerge, are client-side:
 *  test/t2_table_memory.cjs.)
 *
 *   node test/t2_table_server.cjs [--base ws://127.0.0.1:<port>]   ·   node test/t2_table_server.cjs --bite
 * IT NEVER READS GREEN WITHOUT A LIVE SERVER (exit 2, REFUSED). Exit 0 green · 1 a red · 2 REFUSED · 3 crashed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KIT = path.join(ROOT, 'scripts/argo_a4');
const kitBundle = () => { const p = path.join(KIT, 'out/bundle/index.js'); return fs.existsSync(p) ? p : null; };
const WAIT_MS = 6000;

// each targets one line of the bundled table.js; each must turn this suite red (exit 1)
const MUTANTS = [
  { name: 'T2 a wrong secret opens (the ref check dropped)',
    find: '=== who.ref : f.secret == null;', put: '!== null : f.secret == null;' },
  { name: 'T4 a seat key passes as the GM key',
    find: 'if (f.gmKey && await sha256(f.gmKey) === meta.gmKeyHash) {',
    put: 'if (f.gmKey && (await sha256(f.gmKey) === meta.gmKeyHash || Object.values(meta.seats).some((x) => x.seatKeyHash === "") || Object.keys(meta.seats).length)) {' },
  { name: 'T6 forget keeps the seat',
    find: 'delete meta.seats[f.knockId];', put: 'void 0;' },
  { name: 'T8 an unseeded waiting socket is seated',
    find: 'meta.seats[k].seatKeyHash === a.seatKeyHash);', put: 'meta.seats[k].seatKeyHash === a.seatKeyHash) || Object.keys(meta.seats)[0];' },
  { name: 'T9 waiting applied without the flag',
    find: 'if (!meta && f.wait === true && f.seatKey) {', put: 'if (!meta && f.seatKey) {' },
];

process.on('uncaughtException', (e) => { console.error('CRASH ' + (e && e.stack || e)); process.exit(3); });
process.on('unhandledRejection', (e) => { console.error('CRASH ' + (e && e.stack || e)); process.exit(3); });
function argOf(name) { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] || null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
function check(ok, label, detail) {
  if (ok) { passes++; console.log('  ✓ ' + label); }
  else { fails++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
  return ok;
}
const seenTypes = new Set();
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const refOf = (secret) => b64url(crypto.createHash('sha256').update(secret, 'utf8').digest());
const newSecret = () => b64url(crypto.randomBytes(32));

// A socket that queues every frame it receives; take(pred) waits for the first matching one not yet taken.
function connect(base, query) {
  const url = base + '/t?' + query;
  const ws = new WebSocket(url);
  const c = { ws, frames: [], raw: [], waiters: [], opened: false, closed: false, failed: null };
  const settle = () => {
    c.waiters = c.waiters.filter((w) => {
      const i = c.frames.findIndex(w.pred);
      if (i !== -1) { const [f] = c.frames.splice(i, 1); clearTimeout(w.timer); w.resolve(f); return false; }
      if (c.closed) { clearTimeout(w.timer); w.resolve(null); return false; }
      return true;
    });
  };
  c.ready = new Promise((resolve) => {
    ws.addEventListener('open', () => { c.opened = true; resolve(true); });
    ws.addEventListener('error', (e) => { if (!c.opened) { c.failed = (e && e.message) || 'handshake failed'; resolve(false); } });
    ws.addEventListener('close', () => { c.closed = true; if (!c.opened) resolve(false); settle(); });
  });
  ws.addEventListener('message', (ev) => {
    const text = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
    c.raw.push(text);
    let f = null;
    try { f = JSON.parse(text); } catch (e) { f = { t: '(unparsed)', text }; }
    if (f && typeof f.t === 'string') seenTypes.add(f.t);
    c.frames.push(f);
    settle();
  });
  c.send = (frame) => ws.send(typeof frame === 'string' ? frame : JSON.stringify(Object.assign({ v: 1 }, frame)));
  c.take = (pred, ms) => new Promise((resolve) => {
    const w = { pred: typeof pred === 'string' ? (f) => f.t === pred : pred, resolve };
    w.timer = setTimeout(() => { c.waiters = c.waiters.filter((x) => x !== w); resolve(null); }, ms || WAIT_MS);
    c.waiters.push(w);
    settle();
  });
  c.closedSoon = async (ms) => { for (let i = 0; i < (ms || WAIT_MS) / 50 && !c.closed; i++) await sleep(50); return c.closed; };
  c.close = () => { try { ws.close(1000, 'wire test'); } catch (e) {} };
  return c;
}
const isErr = (code) => (f) => f.t === 'error' && f.code === code;
const lowerHyphen = (code) => (code.slice(0, 3) + '-' + code.slice(3)).toLowerCase();

async function health(httpBase) {
  try {
    const r = await fetch(httpBase + '/health', { signal: AbortSignal.timeout(5000) });
    const body = await r.json();
    return { status: r.status, ctype: r.headers.get('content-type') || '', body };
  } catch (e) { return null; }
}


async function suite(base) {
  const sockets = [];
  const open = (q) => { const c = connect(base, q); sockets.push(c); return c; };
  const gone = (c) => c.closedSoon(3000);
  try {
    const h = await fetch(base.replace(/^ws/, 'http') + '/health').then((r) => r.json()).catch(() => null);
    if (!h || h.ok !== true) { console.log('REFUSED: no table server answers /health'); return 2; }

    console.log('T1 ?open=<ref> with its secret');
    const secret = newSecret(), ref = refOf(secret);
    const one = open('open=1');
    await one.ready;
    one.send({ t: 'open', label: 'T2 Wire', listed: false, secret });
    check(!!(await one.take(isErr('bad_frame'))), 'a secret on ?open=1 → bad_frame');
    const gm = open('open=' + ref);
    check(await gm.ready, '?open=<ref> upgrades', gm.failed);
    gm.send({ t: 'open', label: 'T2 Wire', listed: false, secret, seats: [] });
    const opened = await gm.take('opened');
    if (!check(!!opened && typeof opened.gmKey === 'string', 'open with the secret → opened with a gmKey', JSON.stringify(opened))) return 1;
    const { tableId, code } = opened;

    console.log('T2 a wrong secret');
    const bad = open('open=' + ref);
    await bad.ready;
    bad.send({ t: 'open', label: 'Thief', listed: false, secret: newSecret() });
    check(!!(await bad.take(isErr('bad_frame'))), 'a wrong secret on the ref route → bad_frame');
    check(await gone(bad), 'and the socket closes');

    console.log('T3 LET IN → seated');
    const pa = open('code=' + code);
    await pa.ready;
    pa.send({ t: 'join', code, deviceLabel: 'Kael pad' });
    const knock = await gm.take('knock');
    if (!knock) { check(false, 'the GM reads the knock'); return 1; }
    gm.send({ t: 'admit', knockId: knock.knockId });
    const admitted = await pa.take('admitted');
    const seated = await gm.take('seated');
    const A = knock.knockId, keyA = admitted && admitted.seatKey;
    check(!!seated && seated.knockId === A && seated.deviceLabel === 'Kael pad', 'the GM reads seated { knockId, deviceLabel }', JSON.stringify(seated));
    check(!!seated && keyA && seated.seatKeyHash === refOf(keyA), 'seatKeyHash is b64url(SHA-256(seatKey)), 43 characters', seated && seated.seatKeyHash);
    check(!!seated && !('seatKey' in seated), 'seated never carries the key');

    console.log('T4 a player\'s key as the GM\'s');
    const pk = open('table=' + encodeURIComponent(tableId));
    await pk.ready;
    pk.send({ t: 'rejoin', tableId, gmKey: keyA });
    check(!!(await pk.take(isErr('closed'))), 'rejoin with the seat key as gmKey → closed');
    const ps = open('open=' + ref);
    await ps.ready;
    ps.send({ t: 'open', label: 'Thief', listed: false, secret: keyA });
    check(!!(await ps.take(isErr('bad_frame'))), 'the seat key as the secret → bad_frame');

    console.log('T5 the GM takes its live table over');
    const gm2 = open('open=' + ref);
    await gm2.ready;
    gm2.send({ t: 'open', label: 'T2 Wire', listed: false, secret, seats: [{ knockId: A, deviceLabel: 'Kael pad', seatKeyHash: seated.seatKeyHash }] });
    const took = await gm2.take('opened');
    check(!!took && took.tableId === tableId && took.code === code && typeof took.gmKey === 'string' && took.gmKey !== opened.gmKey, 'opened: the same table and code, a new gmKey', JSON.stringify(took));
    check(!!took && Array.isArray(took.seats) && took.seats.includes(A), 'its opened names the seats held');
    check(!!(await gm2.take((f) => f.t === 'peer' && f.knockId === A && f.state === 'here')), 'and it hears the seated player here');
    check(await gone(gm), 'the old GM socket is hung up');

    console.log('T6 forget');
    gm2.send({ t: 'forget', knockId: A });
    check(!!(await pa.take(isErr('closed'))), 'the forgotten seat reads closed');
    const pa2 = open('table=' + encodeURIComponent(tableId));
    await pa2.ready;
    pa2.send({ t: 'rejoin', tableId, seatKey: keyA });
    check(!!(await pa2.take(isErr('closed'))), 'its key then rejoins → closed (no stale hash)');

    console.log('T10 record and shared relay');
    const pb = open('code=' + code);
    await pb.ready;
    pb.send({ t: 'join', code, deviceLabel: 'Gron pad' });
    const kb = await gm2.take('knock');
    gm2.send({ t: 'admit', knockId: kb && kb.knockId });
    const admB = await pb.take('admitted');
    const seatedB = await gm2.take('seated');
    gm2.send({ t: 'play', to: kb && kb.knockId, msg: { type: 'record', payload: {} } });
    check(!!(await pb.take((f) => f.t === 'play' && f.msg.type === 'record')), 'a GM `record` reaches the player');
    gm2.send({ t: 'play', msg: { type: 'shared', payload: { lines: [] } } });
    check(!!(await pb.take((f) => f.t === 'play' && f.msg.type === 'shared')), 'a GM `shared` reaches the player');

    console.log('T7–T9 waiting');
    gm2.send({ t: 'close' });
    await pb.take(isErr('closed'));
    await gone(gm2);
    const keyB = admB && admB.seatKey;
    const nowait = open('table=' + encodeURIComponent(tableId));
    await nowait.ready;
    nowait.send({ t: 'rejoin', tableId, seatKey: keyB });
    check(!!(await nowait.take(isErr('closed'))), 'T9 a rejoin without `wait` on no meta → closed, as today');
    const falsy = open('table=' + encodeURIComponent(tableId));
    await falsy.ready;
    falsy.send({ t: 'rejoin', tableId, seatKey: keyB, wait: false });
    check(!!(await falsy.take(isErr('bad_frame'))), 'T9 `wait: false` → bad_frame');
    const wB = open('table=' + encodeURIComponent(tableId));
    await wB.ready;
    wB.send({ t: 'rejoin', tableId, seatKey: keyB, wait: true });
    check(!!(await wB.take((f) => f.t === 'table' && f.state === 'waiting')), 'T7 a seeded player\'s wait → table waiting');
    const wX = open('table=' + encodeURIComponent(tableId));
    await wX.ready;
    wX.send({ t: 'rejoin', tableId, seatKey: newSecret(), wait: true });
    check(!!(await wX.take((f) => f.t === 'table' && f.state === 'waiting')), 'T8 an unseeded key also waits (the server cannot tell yet)');
    const gm3 = open('open=' + ref);
    await gm3.ready;
    gm3.send({ t: 'open', label: 'T2 Wire', listed: false, secret, seats: [{ knockId: kb.knockId, deviceLabel: 'Gron pad', seatKeyHash: seatedB.seatKeyHash }] });
    const reopened = await gm3.take('opened');
    check(!!reopened && reopened.tableId === tableId && reopened.code !== code, 'T7 the next night\'s open: the same tableId, a fresh code', JSON.stringify(reopened));
    check(!!(await wB.take((f) => f.t === 'table' && f.state === 'here')), 'T7 the waiting seeded player is seated: table here');
    check(!!(await gm3.take((f) => f.t === 'peer' && f.knockId === kb.knockId && f.state === 'here')), 'T7 and the GM reads its peer here');
    check(!!(await wX.take(isErr('closed'))), 'T8 the unseeded waiting socket → closed');
    check(!wX.raw.some((r) => /"t":"table"/.test(r) && /"state":"here"/.test(r)), 'T8 and it was never seated');
    gm3.send({ t: 'play', to: kb.knockId, msg: { type: 'record', payload: {} } });
    check(!!(await wB.take((f) => f.t === 'play' && f.msg.type === 'record')), 'T7 the seated waiter is at the table (a play reaches it)');
    gm3.send({ t: 'close' });
    return fails ? 1 : 0;
  } finally {
    for (const c of sockets) c.close();
  }
}
// ── the local server, from the run kit ──
function kit(argv) { return spawnSync(process.execPath, [path.join(KIT, 'run_table.mjs')].concat(argv), { encoding: 'utf8' }); }
// R-A4SG-1: a port the OS hands out for this run (8790 stays the kit's manual default), so batteries in parallel trees
// never fight over one
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(null));
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function workerdPresent() { try { return fs.existsSync(require(path.join(ROOT, 'node_modules/workerd')).default); } catch (e) { return false; } }

async function withLocal(bundleDir, fn) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-wire-'));
  const port = await freePort();
  if (!port) return { refused: 'the OS handed out no free port' };
  const r = kit(['start', '--bundle', bundleDir, '--run', run, '--port', String(port)]);
  if (r.status !== 0) { fs.rmSync(run, { recursive: true, force: true }); return { refused: 'the run kit could not start the local server: ' + (r.stderr || r.stdout).trim() }; }
  try { return { result: await fn('ws://127.0.0.1:' + port), port }; }
  finally { kit(['stop', '--run', run]); fs.rmSync(run, { recursive: true, force: true }); }
}
// → { dir, temp } the bundle to serve: the kit's when it has one, else one built now into a fresh temporary directory
// (never into the tree; wrangler's own scratch is table-server/.wrangler/, gitignored) — or { refused } naming why
function localBundle() {
  if (!workerdPresent()) return { refused: 'no workerd binary (node_modules/workerd)' };
  const have = kitBundle();
  if (have) return { dir: path.dirname(have), temp: false };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-bundle-'));
  const r = kit(['bundle', '--out', dir]);
  if (r.status !== 0 || !fs.existsSync(path.join(dir, 'index.js'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    const why = /could not determine executable|not found|ENOENT/i.test((r.stderr || '') + (r.stdout || '')) ? 'no wrangler (npx wrangler)' : 'the bundle step failed';
    return { refused: why + ': ' + ((r.stderr || r.stdout || '').trim().split('\n').pop() || 'exit ' + r.status) };
  }
  return { dir, temp: true };
}
const dropBundle = (b) => { if (b && b.temp) fs.rmSync(b.dir, { recursive: true, force: true }); };


async function bite() {
  const b = localBundle();
  if (b.refused) { console.log('REFUSED: --bite needs the local server: ' + b.refused); return 2; }
  const src = fs.readFileSync(path.join(b.dir, 'index.js'), 'utf8');
  dropBundle(b);
  let survived = 0;
  for (const m of MUTANTS) {
    const n = src.split(m.find).length - 1;
    if (n !== 1) { console.log('✗ mutant "' + m.name + '": its target occurs ' + n + ' times in the bundle'); survived++; continue; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't2-mutant-'));
    fs.writeFileSync(path.join(dir, 'index.js'), src.replace(m.find, m.put));
    const out = await withLocal(dir, async (base) => spawnSync(process.execPath, [__filename, '--base', base], { encoding: 'utf8' }));
    fs.rmSync(dir, { recursive: true, force: true });
    if (out.refused) { console.log('✗ mutant "' + m.name + '": ' + out.refused); survived++; continue; }
    const rc = out.result.status;
    const firstRed = (out.result.stdout.split('\n').find((l) => l.includes('✗')) || '').trim();
    if (rc === 1) console.log('✓ bit: ' + m.name + ' (exit 1; first red: ' + firstRed + ')');
    else { console.log('✗ SURVIVED or crashed: ' + m.name + ' (exit ' + rc + ', a bite is exit 1)'); survived++; }
  }
  return survived ? 1 : 0;
}

(async () => {
  let rc;
  if (process.argv.includes('--bite')) rc = await bite();
  else {
    const base = argOf('--base');
    if (base) rc = await suite(base);
    else {
      const b = localBundle();
      if (b.refused) { console.log('REFUSED: no --base and no local server: ' + b.refused); rc = 2; }
      else { const out = await withLocal(b.dir, suite); dropBundle(b); rc = out.refused ? (console.log('REFUSED: ' + out.refused), 2) : out.result; }
    }
    if (rc !== 2) console.log((rc === 0 ? 'PASS' : 'FAIL') + ' ' + passes + ' passed, ' + fails + ' failed');
  }
  process.exit(rc);
})();
