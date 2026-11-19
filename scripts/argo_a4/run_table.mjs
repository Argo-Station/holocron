#!/usr/bin/env node
/**
 * run_table.mjs — the A4 run kit's one script: the table server (table-server/, unchanged) under workerd on this machine
 * (ARGO A4, ruling `argo-a4-table-spike` §4 step 2). Node, not shell, so the same kit runs on Windows and Linux (step 3).
 *
 *   node scripts/argo_a4/run_table.mjs bundle [--out <dir>]
 *       `npx wrangler deploy --dry-run --outdir <dir>` from table-server/ (default scripts/argo_a4/out/bundle). Publishes
 *       nothing. On a machine without wrangler, carry a bundle made here instead and pass it to `start --bundle`.
 *   node scripts/argo_a4/run_table.mjs start [--bundle <dir>] [--run <dir>] [--storage <dir>] [--host <h>] [--port <p>]
 *                                            [--site <root>] [--verbose]
 *       copies table.capnp (or site.capnp with --site) and the bundle into the run directory, starts `workerd serve`
 *       detached, writes <run>/workerd.pid, and waits for /health. Prints `READY <url> pid <n>`; exit 0, else exit 1.
 *       Defaults: bundle out/bundle, run out/run, storage <run>/do-storage, host 127.0.0.1, port 8790.
 *       Storage OUTLIVES the process: a restart on the same --storage keeps every table (spike item 5).
 *       --site <root>: A4-C4's measurement. One workerd answers the built site from <root> and routes exactly /t to the
 *       table server, on one port (site.capnp + router.js). The table server's own /health is answered on the internal
 *       socket, --internal-port (default 8790), never through the site's origin.
 *   node scripts/argo_a4/run_table.mjs stop [--run <dir>]
 *       stops the pid in <run>/workerd.pid and waits for it to go. Exit 0 when it is gone (or was never running).
 *
 * The port is checked free by binding it first; a held port is exit 1 naming it, never a silent second server.
 * The workerd binary is the `workerd` npm package's (require('workerd').default), so its version is node_modules'.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(KIT, '..', '..');
const OUT = path.join(KIT, 'out');

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else o._.push(argv[i]);
  }
  return o;
}
const die = (msg) => { console.error('run_table: ' + msg); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function workerdBin() {
  try { return createRequire(path.join(REPO, 'package.json'))('workerd').default; } catch (e) { return null; }
}
function portFree(host, port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, host, () => s.close(() => resolve(true)));
  });
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return false; } }
async function health(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

function bundle(o) {
  const out = path.resolve(o.out || path.join(OUT, 'bundle'));
  const r = spawnSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', out], { cwd: path.join(REPO, 'table-server'), stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) die('wrangler dry-run exit ' + r.status);
  console.log('BUNDLE ' + out + ' ' + fs.statSync(path.join(out, 'index.js')).size + ' bytes');
}

async function start(o) {
  const bin = workerdBin();
  if (!bin || !fs.existsSync(bin)) die('no workerd binary (the `workerd` npm package is not installed here)');
  const bundleDir = path.resolve(o.bundle || path.join(OUT, 'bundle'));
  if (!fs.existsSync(path.join(bundleDir, 'index.js'))) die('no bundle at ' + bundleDir + ' — run `bundle` first');
  const run = path.resolve(o.run || path.join(OUT, 'run'));
  const storage = path.resolve(o.storage || path.join(run, 'do-storage'));
  const host = o.host || '127.0.0.1', port = Number(o.port || 8790);
  const pidFile = path.join(run, 'workerd.pid');
  if (fs.existsSync(pidFile) && alive(Number(fs.readFileSync(pidFile, 'utf8')))) die('already running from ' + run + ' (pid ' + fs.readFileSync(pidFile, 'utf8').trim() + ')');
  if (!(await portFree(host, port))) die('port ' + host + ':' + port + ' is held by another process');

  fs.mkdirSync(path.join(run, 'bundle'), { recursive: true });
  fs.mkdirSync(storage, { recursive: true });
  fs.copyFileSync(path.join(bundleDir, 'index.js'), path.join(run, 'bundle', 'index.js'));
  const config = o.site ? 'site.capnp' : 'table.capnp';
  fs.copyFileSync(path.join(KIT, config), path.join(run, config));
  const argv = ['serve', path.join(run, config), '-d', 'do-disk=' + storage, '-s', 'http=' + host + ':' + port];
  if (o.verbose) argv.push('--verbose');
  if (o.site) {
    const internal = Number(o['internal-port'] || 8790);
    if (!(await portFree(host, internal))) die('internal port ' + host + ':' + internal + ' is held by another process');
    fs.copyFileSync(path.join(KIT, 'router.js'), path.join(run, 'router.js'));
    argv.push('-d', 'site=' + path.resolve(o.site), '-s', 'internal=127.0.0.1:' + internal);
  }
  const log = fs.openSync(path.join(run, 'workerd.log'), 'a');
  const child = spawn(bin, argv, { cwd: run, detached: true, stdio: ['ignore', log, log] });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));

  const url = 'http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + port + (o.site ? '/' : '/health');
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (!alive(child.pid)) die('workerd exited at start; see ' + path.join(run, 'workerd.log'));
    if (o.site) { try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (r.status) { console.log('READY ' + url + ' pid ' + child.pid); return; } } catch (e) {} }
    else if (await health(url)) { console.log('READY ' + url + ' pid ' + child.pid); return; }
  }
  die('no answer on ' + url + ' after 15 s; see ' + path.join(run, 'workerd.log'));
}

async function stop(o) {
  const run = path.resolve(o.run || path.join(OUT, 'run'));
  const pidFile = path.join(run, 'workerd.pid');
  if (!fs.existsSync(pidFile)) { console.log('STOPPED (no pid file in ' + run + ')'); return; }
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  if (alive(pid)) process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 40 && alive(pid); i++) await sleep(250);
  if (alive(pid)) { process.kill(pid, 'SIGKILL'); await sleep(500); }
  if (alive(pid)) die('pid ' + pid + ' would not stop');
  fs.unlinkSync(pidFile);
  console.log('STOPPED pid ' + pid);
}

const o = args(process.argv.slice(2));
const cmd = o._[0];
if (cmd === 'bundle') bundle(o);
else if (cmd === 'start') await start(o);
else if (cmd === 'stop') await stop(o);
else { console.error('usage: run_table.mjs bundle|start|stop [options] — read the header'); process.exit(2); }
