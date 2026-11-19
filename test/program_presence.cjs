#!/usr/bin/env node
/* test/program_presence.cjs — A4-C12, S4's count (ruling `argo-a4-launcher-build` §3, card §4.1), driven LIVE: the
 * program's own config (program/serve/holocron.capnp + router.js) under workerd, with the table server's dry-run bundle
 * built fresh from table-server/ into a temporary directory, real WebSockets on the http socket, and the count read on
 * the internal socket.
 *
 * P1  a GM alone at an open table → {"v":1,"players":0}
 * P2  a knock counts (1); LET IN keeps it (1); a second table with its own knock → 2 across the two tables
 * P3  a table HIBERNATED AND WOKEN: every socket idles until workerd evicts the Table objects (a test-only witness in a
 *     COPY of the bundle counts Table constructions), then the count is still 2 — and a Table was constructed again
 * P4  a player's `bye` and a closed socket leave the count (1, then 0 with two GMs still open)
 * P5  /program/presence is never served through the site's origin: the http socket answers 404; and under the online
 *     shape (no PRESENCE bound: scripts/argo_a4/table.capnp) the internal path answers today's 404 not_found
 *
 *   node test/program_presence.cjs           ·   node test/program_presence.cjs --bite   (each mutant must turn it red)
 * IT NEVER READS GREEN WITHOUT A LIVE SERVER: no workerd or no wrangler is exit 2, REFUSED. Exit 0 · 1 red · 2 · 3 crash.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVE = path.join(ROOT, 'program/serve');
const WAIT_MS = 6000;
const IDLE_MAX_S = Number(process.env.PRESENCE_IDLE_MAX_S || 150);

// each targets one line of the bundled presence.js / table.js; each must turn this suite red (exit 1). P4 has none: a
// socket that leaves (bye, close) leaves ctx.getWebSockets(), so no line of ours holds it
const MUTANTS = [   // targets as the wrangler bundle spells them (double quotes)
  { name: 'P1/P2 the GM is counted', find: '["player", "knock", "waiting"].indexOf(', put: '["gm", "player", "knock", "waiting"].indexOf(' },
  { name: 'P2 a knock is not counted', find: '["player", "knock", "waiting"].indexOf(', put: '["player", "waiting"].indexOf(' },
  { name: 'P2 one table only (the last registered)', find: 'if (ids.indexOf(tableId) === -1) {', put: 'if (ids.indexOf(tableId) === -1) { ids.length = 0;' },
  { name: 'P3 the list kept in memory, not storage', find: 'const ids = await this.ctx.storage.get("tables") || [], keep = [];', put: 'const ids = this.mem || [], keep = [];' },
];
// P3's witness, in the served COPY only: Table constructions, read at /__boots on the internal socket
const WITNESS = [
  { find: 'this.rates = /* @__PURE__ */ new Map();', put: 'this.rates = /* @__PURE__ */ new Map(); globalThis.__boots = (globalThis.__boots || 0) + 1;', alt: { find: 'this.rates = new Map();', put: 'this.rates = new Map(); globalThis.__boots = (globalThis.__boots || 0) + 1;' } },
  { find: 'if (url.pathname === "/health")', put: 'if (url.pathname === "/__boots") return new Response(String(globalThis.__boots || 0));\n      if (url.pathname === "/health")', alt: { find: "if (url.pathname === '/health')", put: "if (url.pathname === '/__boots') return new Response(String(globalThis.__boots || 0));\n      if (url.pathname === '/health')" } },
];
// the P3 mutant needs a writer for this.mem, so its register keeps the list in memory too
const MEM_REGISTER = { find: 'const ids = await this.ctx.storage.get("tables") || [];', put: 'const ids = this.mem || (this.mem = []);' };

process.on('uncaughtException', (e) => { console.error('CRASH ' + (e && e.stack || e)); process.exit(3); });
process.on('unhandledRejection', (e) => { console.error('CRASH ' + (e && e.stack || e)); process.exit(3); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
function check(ok, label, detail) {
  if (ok) { passes++; console.log('  ✓ ' + label); }
  else { fails++; console.log('  ✗ ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
  return ok;
}

function connect(base, query) {
  const ws = new WebSocket(base + '/t?' + query);
  const c = { ws, frames: [], waiters: [], opened: false, closed: false };
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
    ws.addEventListener('error', () => { if (!c.opened) resolve(false); });
    ws.addEventListener('close', () => { c.closed = true; if (!c.opened) resolve(false); settle(); });
  });
  ws.addEventListener('message', (ev) => {
    let f = null;
    try { f = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8')); } catch (e) { f = { t: '(unparsed)' }; }
    c.frames.push(f); settle();
  });
  c.send = (frame) => ws.send(JSON.stringify(Object.assign({ v: 1 }, frame)));
  c.take = (pred, ms) => new Promise((resolve) => {
    const w = { pred: typeof pred === 'string' ? (f) => f.t === pred : pred, resolve };
    w.timer = setTimeout(() => { c.waiters = c.waiters.filter((x) => x !== w); resolve(null); }, ms || WAIT_MS);
    c.waiters.push(w); settle();
  });
  c.close = () => { try { ws.close(1000, 'presence test'); } catch (e) {} };
  return c;
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(null));
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function workerdBin() { try { const b = require(path.join(ROOT, 'node_modules/workerd')).default; return fs.existsSync(b) ? b : null; } catch (e) { return null; } }
function buildBundle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-bundle-'));
  const r = spawnSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', dir], { cwd: path.join(ROOT, 'table-server'), encoding: 'utf8', shell: process.platform === 'win32' });
  const f = path.join(dir, 'index.js');
  const src = r.status === 0 && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return src ? { src } : { refused: 'the wrangler dry-run bundle failed: ' + ((r.stderr || r.stdout || '').trim().split('\n').pop() || 'exit ' + r.status) };
}
function patch(src, list) {
  for (const p of list) {
    const use = src.split(p.find).length === 2 ? p : p.alt && src.split(p.alt.find).length === 2 ? p.alt : null;
    if (!use) return { error: 'patch target not found once: ' + p.find };
    src = src.replace(use.find, use.put);
  }
  return { src };
}
async function health(url) { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).status; } catch (e) { return 0; } }

// the program's config, laid out as program/build.mjs lays out program/out/serve/, served on two free ports
async function serveProgram(bundleSrc, capnp) {
  const bin = workerdBin();
  if (!bin) return { refused: 'no workerd binary (node_modules/workerd)' };
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-run-'));
  fs.mkdirSync(path.join(run, 'serve/table'), { recursive: true });
  for (const d of ['site', 'state', 'do-disk']) fs.mkdirSync(path.join(run, d));
  fs.writeFileSync(path.join(run, 'site/index.html'), '<!doctype html><title>site</title>');
  const conf = capnp || path.join(SERVE, 'holocron.capnp');
  fs.copyFileSync(conf, path.join(run, 'serve', path.basename(conf)));
  fs.copyFileSync(path.join(SERVE, 'router.js'), path.join(run, 'serve/router.js'));
  fs.writeFileSync(path.join(run, 'serve/table/index.js'), bundleSrc);
  fs.mkdirSync(path.join(run, 'serve/bundle'));
  fs.writeFileSync(path.join(run, 'serve/bundle/index.js'), bundleSrc);   // table.capnp's embed path
  const http = await freePort(), internal = await freePort();
  const argv = ['serve', path.join(run, 'serve', path.basename(conf)), '-d', 'do-disk=' + path.join(run, 'do-disk'),
    '-s', 'http=127.0.0.1:' + http];
  if (!capnp) argv.push('-d', 'site=' + path.join(run, 'site'), '-d', 'state=' + path.join(run, 'state'), '-s', 'internal=127.0.0.1:' + internal);
  const child = spawn(bin, argv, { cwd: path.join(run, 'serve'), stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; child.stderr.on('data', (d) => { err += d; });
  const probe = capnp ? 'http://127.0.0.1:' + http + '/health' : 'http://127.0.0.1:' + internal + '/health';
  for (let i = 0; i < 60 && !(await health(probe)); i++) await sleep(250);
  const stop = async () => { child.kill('SIGTERM'); for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(100); if (child.exitCode === null) child.kill('SIGKILL'); fs.rmSync(run, { recursive: true, force: true }); };
  if (!(await health(probe))) { await stop(); return { refused: 'workerd did not answer ' + probe + ': ' + err.trim().split('\n').slice(-3).join(' | ') }; }
  return { http: 'http://127.0.0.1:' + http, ws: 'ws://127.0.0.1:' + http, internal: 'http://127.0.0.1:' + internal, stop };
}

async function count(internal) {
  try { const r = await fetch(internal + '/program/presence'); return { status: r.status, cc: r.headers.get('cache-control'), body: await r.json() }; } catch (e) { return { status: 0, body: null }; }
}
const players = async (internal) => { const c = await count(internal); return c.body && c.body.v === 1 ? c.body.players : 'bad:' + JSON.stringify(c.body); };
const boots = async (internal) => Number(await (await fetch(internal + '/__boots')).text());

async function openTable(base, label) {
  const gm = connect(base, 'open=1'); await gm.ready;
  gm.send({ t: 'open', label, listed: false });
  const o = await gm.take('opened');
  return { gm, code: o && o.code };
}
async function knock(base, t, label) {
  const p = connect(base, 'code=' + t.code); await p.ready;
  p.send({ t: 'join', code: t.code, deviceLabel: label });
  const k = await t.gm.take('knock');
  return { p, knockId: k && k.knockId };
}

async function suite(srv) {
  const socks = [];
  try {
    console.log('P1 a GM alone');
    const c0 = await count(srv.internal);
    check(c0.status === 200 && c0.cc === 'no-store', '/program/presence answers 200, no-store, on the internal socket', c0);
    const A = await openTable(srv.ws, 'Presence A'); socks.push(A.gm);
    check(!!A.code, 'table A opened', A.code);
    check(await players(srv.internal) === 0, 'a GM alone at an open table → players 0', await players(srv.internal));

    console.log('P2 knocks, a seat, two tables');
    const a1 = await knock(srv.ws, A, 'Pad A1'); socks.push(a1.p);
    check(await players(srv.internal) === 1, 'a knock counts → 1', await players(srv.internal));
    A.gm.send({ t: 'admit', knockId: a1.knockId });
    check(!!(await a1.p.take('admitted')), 'LET IN → admitted');
    check(await players(srv.internal) === 1, 'the seated player still counts → 1', await players(srv.internal));
    const B = await openTable(srv.ws, 'Presence B'); socks.push(B.gm);
    const b1 = await knock(srv.ws, B, 'Pad B1'); socks.push(b1.p);
    check(await players(srv.internal) === 2, 'n across two tables → 2', await players(srv.internal));

    console.log('P3 hibernated and woken');
    const before = await boots(srv.internal);
    let slept = false, waited = 0;
    // idle; then a GM frame wakes each table (a ping would not: it is auto-answered), and a construction after the idle
    // means it had been evicted. Only then is the count read.
    for (; waited < IDLE_MAX_S && !slept; waited += 15) {
      await sleep(15000);
      A.gm.send({ t: 'listing', on: false }); B.gm.send({ t: 'listing', on: false });
      await sleep(500);
      if (await boots(srv.internal) > before) { slept = true; const n = await players(srv.internal); check(n === 2, 'after ' + (waited + 15) + ' s idle, the woken count is still 2', n); }
    }
    check(slept, 'workerd evicted and re-constructed a Table within ' + IDLE_MAX_S + ' s (the witness counted a new construction)', { waited });
    A.gm.send({ t: 'ping' }); a1.p.send({ t: 'ping' });
    check(!!(await A.gm.take('pong')) && !!(await a1.p.take('pong')), 'the woken sockets still answer');

    console.log('P4 leaving');
    a1.p.send({ t: 'play', msg: { type: 'bye' } });
    await A.gm.take((f) => f.t === 'peer' && f.state === 'left');
    await sleep(300);
    check(await players(srv.internal) === 1, "a player's bye leaves the count → 1", await players(srv.internal));
    b1.p.close();
    let n = null;
    for (let i = 0; i < 20 && n !== 0; i++) { await sleep(150); n = await players(srv.internal); }
    check(n === 0, 'a closed socket leaves the count → 0, two GMs still open', n);

    console.log('P5 never through the site');
    const viaSite = await fetch(srv.http + '/program/presence');
    check(viaSite.status === 404, 'the http socket answers /program/presence with 404', viaSite.status);
    return fails ? 1 : 0;
  } finally { for (const s of socks) s.close(); }
}

async function main(bundle) {
  const w = patch(bundle, WITNESS);
  if (w.error) { console.log('REFUSED: the witness could not be planted: ' + w.error); return 2; }
  const srv = await serveProgram(w.src);
  if (srv.refused) { console.log('REFUSED: ' + srv.refused); return 2; }
  let rc;
  try { rc = await suite(srv); } finally { await srv.stop(); }
  const online = await serveProgram(bundle, path.join(ROOT, 'scripts/argo_a4/table.capnp'));
  if (online.refused) { console.log('REFUSED: the online shape: ' + online.refused); return 2; }
  try {
    const r = await fetch(online.http + '/program/presence'); const body = await r.json().catch(() => null);
    check(r.status === 404 && body && body.error === 'not_found', 'online shape (no PRESENCE): /program/presence → 404 not_found', { status: r.status, body });
  } finally { await online.stop(); }
  console.log('\n' + passes + ' passed, ' + fails + ' failed');
  return fails ? 1 : 0;
}

(async () => {
  const fi = process.argv.indexOf('--bundle-file');   // the bite's mutant copy
  const b = fi !== -1 ? { src: fs.readFileSync(process.argv[fi + 1], 'utf8') } : buildBundle();
  if (b.refused) { console.log('REFUSED: ' + b.refused); process.exit(2); }
  if (!process.argv.includes('--bite')) process.exit(await main(b.src));
  let survived = 0;
  for (const m of MUTANTS) {
    let p = patch(b.src, [m].concat(m.name.startsWith('P3') ? [MEM_REGISTER] : []));
    if (p.error) { console.log('✗ mutant "' + m.name + '": ' + p.error); survived++; continue; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-mutant-'));
    fs.writeFileSync(path.join(dir, 'index.js'), p.src);
    const r = spawnSync(process.execPath, [__filename, '--bundle-file', path.join(dir, 'index.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { PRESENCE_IDLE_MAX_S: String(IDLE_MAX_S) }) });
    fs.rmSync(dir, { recursive: true, force: true });
    const red = (r.stdout.split('\n').find((l) => l.includes('✗')) || '').trim();
    if (r.status === 1) console.log('✓ bit: ' + m.name + ' (first red: ' + red + ')');
    else { console.log('✗ SURVIVED or crashed: ' + m.name + ' (exit ' + r.status + ')'); survived++; }
  }
  process.exit(survived ? 1 : 0);
})();
