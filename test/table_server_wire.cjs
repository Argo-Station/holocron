#!/usr/bin/env node
/* test/table_server_wire.cjs — the table server's WIRE CONFORMANCE suite: it drives a LIVE server over real WebSockets the
 * way a phone does (ruling `argo-a4-table-spike` §4 step 1). The same suite passes against holocron.work's deploy and
 * against the local server under workerd, which is how A4 knows the local table behaves like the real one.
 *
 *   node test/table_server_wire.cjs --base wss://<the deployed table server's host>   (ONE open per run)
 *   node test/table_server_wire.cjs --base ws://127.0.0.1:8790
 *   node test/table_server_wire.cjs            → starts the local server itself from the run kit (scripts/argo_a4/) on a
 *                                                 port the OS assigns; with no kit bundle it builds one into a fresh
 *                                                 temporary directory first (R-A4SG-1: it runs in every battery)
 *   node test/table_server_wire.cjs --bite     → each mutant on a COPY of the kit's dry-run bundle, served locally;
 *                                                 exit 1 if one survives. A mutant run must exit 1: a crash is not a bite.
 *
 * W1  /health: JSON `ok`, `service`, `schema`
 * W2  refusals are FRAMES, never HTTP statuses: two route keys → bad_frame; an unknown code → no_table
 * W3  a GM `?open=1` → `open` → `opened` { code, codeExpiresAt, gmKey, tableId }; a ping is answered `pong`
 * W4  `?list=1` → `list` → `tables`, carrying the listed table; the socket then closes
 * W5  a player `?code=` (typed lower-case with a hyphen) → `join` → the GM's `knock`; admit → `admitted` + the GM's `peer`
 * W6  `play` relayed both ways, `actorId` stamped by the server; `signal` both ways, `knockId` filled
 * W7  a second knock refused → `refused`; the first frame disagreeing with the route → bad_frame, and the socket closes
 * W8  the rate limit: an 11th frame inside a second → slow_down
 * W9  the GM drops and REJOINS by `?table=` → `opened` with its code and `seats`; the player reads `table` gm_away, then here
 * W10 the player drops and rejoins by seatKey → `table` here; the GM reads `peer` dropped, then here
 * W11 `newcode` → `opened` with a new code; the old code is no_table at once
 * W12 a player's `bye` → the GM's `play` + `peer` left; the GM's `close` → `closed` to the rest; a rejoin then reads closed
 *
 * Every frame type the server sends is asserted at least once: error, opened, knock, table, peer, admitted, play, tables,
 * signal, and the hibernation auto-response pong. Not driven live: `expired` (a code's 15 min), `full` (6 seats), the
 * group's 20-opens and 10-failed-joins windows, and the 30 min / 24 h alarm (the run kit's spike item 6 measures it).
 *
 * IT NEVER READS GREEN WITHOUT A LIVE SERVER: no answer on /health is exit 2 with a `REFUSED:` line. With no --base, a
 * REFUSED names one of: no workerd, no wrangler, a failed bundle step (R-A4SG-1). Invented names only.
 * Exit 0 all green · 1 a red · 2 REFUSED · 3 the suite itself crashed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KIT = path.join(ROOT, 'scripts/argo_a4');
// the kit's dry-run bundle is GENERATED (out/ is gitignored): null until `run_table.mjs bundle` has run
const kitBundle = () => { const p = path.join(KIT, 'out/bundle/index.js'); return fs.existsSync(p) ? p : null; };
const WAIT_MS = 8000;

const MUTANTS = [
  { name: 'a refusal sent as an HTTP status instead of a frame',
    find: 'function refuse(code) {',
    put: 'function refuse(code) { return new Response(JSON.stringify({ ok: false, error: code }), { status: 400 });' },
  { name: 'normalizeCode drops its upper-casing',
    find: 'const s = input.toUpperCase().replace(',
    put: 'const s = input.replace(' },
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
  const httpBase = base.replace(/^ws/, 'http');
  const sockets = [];
  const open = (q) => { const c = connect(base, q); sockets.push(c); return c; };
  try {
    console.log('W1 /health');
    const h = await health(httpBase);
    if (!h || !h.body || h.body.ok !== true) {
      console.log('REFUSED: no table server answers ' + httpBase + '/health — this suite never reads green without a live server');
      return 2;
    }
    check(h.status === 200 && /json/.test(h.ctype), '/health is 200 JSON', h.status + ' ' + h.ctype);
    check(h.body.service === 'holocron-table-server' && h.body.schema === 1, '/health names its service and schema', JSON.stringify(h.body));

    console.log('W2 refusals are frames');
    const two = open('open=1&code=ABCDEF');
    check(await two.ready, 'two route keys: the upgrade is accepted (101), not an HTTP status', two.failed);
    check(!!(await two.take(isErr('bad_frame'))), 'two route keys → error bad_frame');
    check(await two.closedSoon(), 'and the socket closes');
    const ghost = open('code=ZZZZZ9');
    check(await ghost.ready, 'an unknown code: the upgrade is accepted (101), not an HTTP status', ghost.failed);
    check(!!(await ghost.take(isErr('no_table'))), 'an unknown code → error no_table');

    console.log('W3 open (the run\'s ONE open)');
    const gm = open('open=1');
    check(await gm.ready, 'GM ?open=1 upgrades', gm.failed);
    gm.send({ t: 'open', label: 'Wire Test Table', listed: true });
    const opened = await gm.take('opened');
    if (!check(!!opened, 'open → opened')) return 1;
    check(opened.v === 1, 'opened carries v 1');
    check(/^[0-9A-HJKMNP-TV-Z]{6}$/.test(opened.code || ''), 'opened.code is 6 of the code alphabet', opened.code);
    check(typeof opened.codeExpiresAt === 'number' && opened.codeExpiresAt > Date.now(), 'opened.codeExpiresAt is a future time');
    check(typeof opened.gmKey === 'string' && opened.gmKey.length >= 40, 'opened.gmKey is issued');
    check(typeof opened.tableId === 'string' && opened.tableId.length > 0, 'opened.tableId is issued');
    check(!('seats' in opened), 'an open\'s opened carries no seats (W-1)');
    const { code, gmKey, tableId } = opened;
    gm.send('{"v":1,"t":"ping"}');
    check(!!(await gm.take('pong')), 'a ping is answered pong (the auto-response)');

    console.log('W4 the listing');
    const lister = open('list=1');
    check(await lister.ready, '?list=1 upgrades', lister.failed);
    lister.send({ t: 'list' });
    const tables = await lister.take('tables');
    check(!!tables && Array.isArray(tables.tables), 'list → tables');
    check(!!tables && tables.tables.some((t) => t.tableId === tableId && t.label === 'Wire Test Table'), 'tables carries the listed table and its label');
    check(await lister.closedSoon(), 'the list socket then closes');

    console.log('W5 a player joins');
    const pa = open('code=' + encodeURIComponent(lowerHyphen(code)));
    check(await pa.ready, 'player ?code= (typed lower-case with a hyphen) upgrades', pa.failed);
    pa.send({ t: 'join', code: lowerHyphen(code), deviceLabel: 'Wire Pad A' });
    const knock = await gm.take('knock');
    check(!!knock && knock.deviceLabel === 'Wire Pad A' && /^k_/.test(knock.knockId || ''), 'join → the GM\'s knock { knockId, deviceLabel }', JSON.stringify(knock));
    if (!knock) return 1;
    const A = knock.knockId;
    gm.send({ t: 'admit', knockId: A });
    const admitted = await pa.take('admitted');
    check(!!admitted && typeof admitted.seatKey === 'string' && admitted.tableId === tableId, 'admit → admitted { seatKey, tableId }', JSON.stringify(admitted));
    check(!!(await gm.take((f) => f.t === 'peer' && f.knockId === A && f.state === 'here')), 'admit → the GM\'s peer here');
    const seatKey = admitted && admitted.seatKey;

    console.log('W6 play and signal, both ways');
    gm.send({ t: 'play', msg: { type: 'table_hello', note: 'from the GM' } });
    const p1 = await pa.take('play');
    check(!!p1 && p1.msg.type === 'table_hello' && p1.msg.actorId === 'gm' && p1.msg.note === 'from the GM', 'GM play → the player, actorId gm', JSON.stringify(p1));
    pa.send({ t: 'play', msg: { type: 'char_update', actorId: 'forged', note: 'from the player' } });
    const p2 = await gm.take('play');
    check(!!p2 && p2.msg.type === 'char_update' && p2.msg.actorId === A, 'player play → the GM, actorId stamped (a forged one replaced)', JSON.stringify(p2));
    gm.send({ t: 'play', msg: { type: 'char_update' } });
    check(!!(await gm.take(isErr('bad_frame'))), 'a GM play of a player-only type → bad_frame');
    gm.send({ t: 'signal', knockId: A, start: true });
    const s1 = await pa.take('signal');
    check(!!s1 && s1.knockId === A && s1.start === true, 'GM signal → the player { knockId, start }', JSON.stringify(s1));
    pa.send({ t: 'signal', candidate: 'wire-candidate' });
    const s2 = await gm.take('signal');
    check(!!s2 && s2.knockId === A && s2.candidate === 'wire-candidate', 'player signal → the GM, knockId filled by the server', JSON.stringify(s2));

    console.log('W7 a refusal, and a first frame that disagrees');
    const pb = open('code=' + code);
    check(await pb.ready, 'a second player upgrades', pb.failed);
    pb.send({ t: 'join', code, deviceLabel: 'Wire Pad B' });
    const knockB = await gm.take('knock');
    check(!!knockB && knockB.deviceLabel === 'Wire Pad B', 'the GM reads the second knock');
    if (knockB) gm.send({ t: 'refuse', knockId: knockB.knockId });
    check(!!(await pb.take(isErr('refused'))), 'refuse → error refused');
    check(await pb.closedSoon(), 'and the refused socket closes');
    const odd = open('code=' + code);
    check(await odd.ready, '?code= upgrades', odd.failed);
    odd.send({ t: 'open', label: 'Wire Odd', listed: false });
    check(!!(await odd.take(isErr('bad_frame'))), 'a first frame `open` on a ?code= route → bad_frame');
    check(await odd.closedSoon(), 'and the socket closes');
    const odd2 = open('code=' + code);
    await odd2.ready;
    odd2.send({ t: 'join', code: 'ZZZZZ9', deviceLabel: 'Wire Odd' });
    check(!!(await odd2.take(isErr('bad_frame'))), 'a join naming another code than the route → bad_frame');

    console.log('W8 the rate limit');
    const fast = open('code=' + code);
    await fast.ready;
    fast.send({ t: 'join', code, deviceLabel: 'Wire Fast' });
    const knockF = await gm.take('knock');
    for (let i = 0; i < 11; i++) fast.send({ t: 'newcode' });
    check(!!(await fast.take(isErr('slow_down'))), 'an 11th frame inside a second → slow_down');
    fast.close();
    if (knockF) gm.send({ t: 'refuse', knockId: knockF.knockId });

    console.log('W9 the GM drops and rejoins');
    gm.close();
    check(!!(await pa.take((f) => f.t === 'table' && f.state === 'gm_away')), 'the GM drops → the player\'s table gm_away');
    const gm2 = open('table=' + encodeURIComponent(tableId));
    check(await gm2.ready, 'GM ?table= upgrades', gm2.failed);
    gm2.send({ t: 'rejoin', tableId, gmKey });
    const reopened = await gm2.take('opened');
    check(!!reopened && reopened.code === code && reopened.tableId === tableId, 'rejoin → opened with its code', JSON.stringify(reopened));
    check(!!reopened && Array.isArray(reopened.seats) && reopened.seats.includes(A), 'the rejoin\'s opened names the seat held (W-1)');
    check(!!(await gm2.take((f) => f.t === 'peer' && f.knockId === A && f.state === 'here')), 'the rejoining GM reads the player\'s peer here');
    check(!!(await pa.take((f) => f.t === 'table' && f.state === 'here')), 'the player reads table here');
    const thief = open('table=' + encodeURIComponent(tableId));
    await thief.ready;
    thief.send({ t: 'rejoin', tableId, gmKey: 'not-the-gm-key-not-the-gm-key' });
    check(!!(await thief.take(isErr('closed'))), 'a rejoin with a wrong key → closed');

    console.log('W10 the player drops and rejoins by seatKey');
    pa.close();
    check(!!(await gm2.take((f) => f.t === 'peer' && f.knockId === A && f.state === 'dropped')), 'the player drops → the GM\'s peer dropped');
    const pa2 = open('table=' + encodeURIComponent(tableId));
    check(await pa2.ready, 'player ?table= upgrades', pa2.failed);
    pa2.send({ t: 'rejoin', tableId, seatKey });
    check(!!(await pa2.take((f) => f.t === 'table' && f.state === 'here')), 'the seatKey rejoin → table here');
    check(!!(await gm2.take((f) => f.t === 'peer' && f.knockId === A && f.state === 'here')), 'the GM reads peer here');

    console.log('W11 newcode');
    gm2.send({ t: 'newcode' });
    const fresh = await gm2.take('opened');
    check(!!fresh && /^[0-9A-HJKMNP-TV-Z]{6}$/.test(fresh.code || '') && fresh.code !== code && fresh.tableId === tableId, 'newcode → opened with a new code', JSON.stringify(fresh));
    check(!!fresh && !('seats' in fresh), 'a newcode\'s opened carries no seats (W-1)');
    const stale = open('code=' + code);
    check(await stale.ready, 'the old code still upgrades (refusals are frames)', stale.failed);
    check(!!(await stale.take(isErr('no_table'))), 'the old code is no_table at once');

    console.log('W12 bye and close');
    pa2.send({ t: 'play', msg: { type: 'bye' } });
    check(!!(await gm2.take((f) => f.t === 'play' && f.msg && f.msg.type === 'bye' && f.msg.actorId === A)), 'a player\'s bye reaches the GM');
    check(!!(await gm2.take((f) => f.t === 'peer' && f.knockId === A && f.state === 'left')), 'and the GM reads peer left');
    const pc = open('code=' + fresh.code);
    await pc.ready;
    pc.send({ t: 'join', code: fresh.code, deviceLabel: 'Wire Pad C' });
    const knockC = await gm2.take('knock');
    if (knockC) gm2.send({ t: 'admit', knockId: knockC.knockId });
    await pc.take('admitted');
    gm2.send({ t: 'close' });
    check(!!(await pc.take(isErr('closed'))), 'the GM\'s close → the seated player reads closed');
    check(await gm2.closedSoon(), 'and the GM\'s socket closes');
    const after = open('table=' + encodeURIComponent(tableId));
    await after.ready;
    after.send({ t: 'rejoin', tableId, gmKey });
    check(!!(await after.take(isErr('closed'))), 'a rejoin after close → closed (the table holds nothing)');
    const lister2 = open('list=1');
    await lister2.ready;
    lister2.send({ t: 'list' });
    const tables2 = await lister2.take('tables');
    check(!!tables2 && !tables2.tables.some((t) => t.tableId === tableId), 'the closed table is no longer listed');

    console.log('every frame type the server sends');
    for (const t of ['error', 'opened', 'knock', 'table', 'peer', 'admitted', 'play', 'tables', 'signal', 'pong'])
      check(seenTypes.has(t), 'received `' + t + '`');
    for (const c of sockets) for (const raw of c.raw) if (raw !== '{"v":1,"t":"pong"}') {
      let f; try { f = JSON.parse(raw); } catch (e) { f = null; }
      if (!f || f.v !== 1) { check(false, 'every frame carries v 1', raw.slice(0, 80)); break; }
    }
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-mutant-'));
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
    if (base) {
      if (!/^wss?:\/\/[^/]+$/.test(base)) { console.log('REFUSED: --base must be ws(s)://host[:port], got ' + base); rc = 2; }
      else { console.log('table_server_wire against ' + base + ' at ' + new Date().toISOString()); rc = await suite(base); }
    } else {
      const b = localBundle();
      if (b.refused) { console.log('REFUSED: no --base and no local server: ' + b.refused); rc = 2; }
      else {
        console.log('table_server_wire against the run kit\'s local server (' + (b.temp ? 'a bundle built now into a temp dir' : 'the kit\'s bundle') + ', an OS-assigned port)');
        const out = await withLocal(b.dir, suite);
        dropBundle(b);
        if (out.refused) { console.log('REFUSED: ' + out.refused); rc = 2; } else rc = out.result;
      }
    }
    if (rc !== 2) console.log((rc === 0 ? 'PASS' : 'FAIL') + ' ' + passes + ' passed, ' + fails + ' failed');
  }
  process.exit(rc);
})();
