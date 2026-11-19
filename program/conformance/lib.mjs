// lib.mjs — the conformance suite's plumbing: start a launcher under HOLOCRON_TEST=1, read its report, drive its control
// directory, and read the OS's own view of ports and processes. Platform-specific reads are here and only here, so the
// Windows card runs the same suite with its own branch of each.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

export const PORT = 8250;
export const WIN = process.platform === 'win32';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A run directory with the hooks' files; `start()` launches one copy of the launcher against it. */
export class Rig {
  constructor(launcher, base, name) {
    this.launcher = launcher;
    this.dir = path.join(base, name);
    fs.rmSync(this.dir, { recursive: true, force: true });
    for (const d of ['ctl', 'snap', 'root/state']) fs.mkdirSync(path.join(this.dir, d), { recursive: true });
    this.opened = path.join(this.dir, 'opened.log');
    this.report = path.join(this.dir, 'report.json');
    this.lan = path.join(this.dir, 'lan');
    this.root = path.join(this.dir, 'root');
    this.state = path.join(this.root, 'state');
    this.ctlSeq = 0;
    this.openScript = writeOpenScript(this.dir, this.opened);
    this.env = {
      HOLOCRON_TEST: '1', HOLOCRON_TEST_OPEN: this.openScript, HOLOCRON_TEST_REPORT: this.report,
      HOLOCRON_TEST_CONTROL: path.join(this.dir, 'ctl'), HOLOCRON_TEST_STATE: this.root, HOLOCRON_TEST_LAN: this.lan,
      HOLOCRON_TEST_SNAPSHOT: path.join(this.dir, 'snap'),
    };
  }
  setLan(text) { if (text == null) fs.rmSync(this.lan, { force: true }); else fs.writeFileSync(this.lan, text + '\n'); }
  setPresence(n) { fs.writeFileSync(path.join(this.state, 'stub_presence.json'), JSON.stringify({ players: n })); }
  start(extraEnv = {}) {
    const env = Object.assign({}, process.env, this.env, extraEnv);
    for (const k of Object.keys(extraEnv)) if (extraEnv[k] === null) delete env[k];
    const out = fs.openSync(path.join(this.dir, 'launcher.out'), 'a');
    const child = spawn(this.launcher, [], { env, stdio: ['ignore', out, out], detached: true });
    child.unref();
    const proc = { child, pid: child.pid, exit: null };
    // a launcher that never starts (the OS refuses it) ends here as an exit with its error, never an uncaught 'error'
    proc.exited = new Promise((r) => {
      child.on('exit', (code, sig) => { proc.exit = { code, sig }; r(proc.exit); });
      child.on('error', (e) => { proc.exit = { error: e.code || e.message }; r(proc.exit); });
    });
    return proc;
  }
  read() { try { return JSON.parse(fs.readFileSync(this.report, 'utf8')); } catch (e) { return null; } }
  openedList() { try { return fs.readFileSync(this.opened, 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; } }
  send(cmd) { fs.writeFileSync(path.join(this.dir, 'ctl', String(++this.ctlSeq).padStart(5, '0') + '.cmd'), cmd); }
  async until(pred, ms = 15000, step = 100, quit = null) {   // quit(): stop waiting early (the launcher is gone)
    const end = Date.now() + ms;
    while (Date.now() < end) { const r = this.read(); if (r && pred(r)) return r; if (quit && quit()) return null; await sleep(step); }
    return null;
  }
  pidFile() { try { return Number(fs.readFileSync(path.join(this.state, 'workerd.pid'), 'utf8').trim()); } catch (e) { return 0; } }
  log() { try { return fs.readFileSync(path.join(this.state, 'holocron.log'), 'utf8'); } catch (e) { return ''; } }
}

function writeOpenScript(dir, log) {
  // The browser-open command: records the URL, opens nothing.
  if (WIN) {
    const p = path.join(dir, 'open.cmd');
    fs.writeFileSync(p, `@echo %~1>>"${log}"\r\n`);
    return p;
  }
  const p = path.join(dir, 'open.sh');
  fs.writeFileSync(p, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${log.replace(/'/g, "'\\''")}'\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

export function alive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
export async function gone(pid, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (!alive(pid)) return true; await sleep(50); } return !alive(pid); }

/** Every TCP listener on the machine as [{pid, command, addr, port}] — lsof on the Mac, netstat on Windows. */
export function listeners() {
  if (WIN) {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
    return out.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((c) => c[0] === 'TCP' && c[3] === 'LISTENING')
      .map((c) => { const i = c[1].lastIndexOf(':'); return { pid: Number(c[4]), command: '', addr: c[1].slice(0, i), port: Number(c[1].slice(i + 1)) }; });
  }
  let out = '';
  try { out = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcPn'], { encoding: 'utf8' }); } catch (e) { out = e.stdout || ''; }
  const rows = []; let pid = 0, cmd = '';
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'c') cmd = line.slice(1);
    else if (line[0] === 'n') { const i = line.lastIndexOf(':'); rows.push({ pid, command: cmd, addr: line.slice(1, i), port: Number(line.slice(i + 1)) }); }
  }
  return rows;
}
export const on = (port) => listeners().filter((l) => l.port === port);

/** The executable of a pid (to tell this program's workerd from any other process). */
export function exeOf(pid) {
  try {
    if (WIN) return execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).Path`], { encoding: 'utf8' }).trim();
    // the executable itself (lsof's first txt entry), never argv[0], which a launcher may set to a bare name
    return (/^n(.*)$/m.exec(execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn'], { encoding: 'utf8' })) || [])[1] || '';
  } catch (e) { return ''; }
}

/** Every process as [{pid, ppid, command}] (the S5 check: a launcher that cannot start starts no child). */
export function processes() {
  try {
    if (WIN) {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.ExecutablePath)" }'], { encoding: 'utf8' });
      return out.split(/\r?\n/).filter(Boolean).map((l) => { const [pid, ppid, command] = l.split('\t'); return { pid: Number(pid), ppid: Number(ppid), command: command || '' }; });
    }
    const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).map((l) => { const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l); return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] } : null; }).filter(Boolean);
  } catch (e) { return []; }
}
export const childrenOf = (pid) => processes().filter((p) => p.ppid === pid);

/** A process's working directory (the REFUSED line names it). */
export function cwdOf(pid) {
  if (WIN) return '';
  try { return (/^n(.*)$/m.exec(execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })) || [])[1] || ''; } catch (e) { return ''; }
}

/** Can a TCP connection be made? */
export function connects(host, port, ms = 800) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const t = setTimeout(() => { s.destroy(); resolve(false); }, ms);
    s.on('connect', () => { clearTimeout(t); s.destroy(); resolve(true); });
    s.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

/** GET with the raw answer: {status, headers, body}. */
export function get(url, headers = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers, timeout: 4000 }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '' }); });
    req.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
  });
}

/** Another program holding the port: a listener in a child process, so its pid is not ours. */
export function holdPort(host, port) {
  const code = `const s=require('net').createServer(c=>c.end());s.listen(${port},'${host}',()=>console.log('HOLD'));setInterval(()=>{},1e6)`;
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve) => child.stdout.once('data', () => resolve(child)));
}

/** A fixture for the update check: answers every request with `answer` and records what it was sent. */
export function updateFixture() {
  const seen = [];
  let answer = { status: 200, body: '{}', delay: 0 };
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, rawHeaders: req.rawHeaders, body });
      setTimeout(() => { res.writeHead(answer.status, { 'content-type': 'application/json' }); res.end(answer.body); }, answer.delay);
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${srv.address().port}/latest.json`, seen, set(a) { answer = Object.assign({ status: 200, delay: 0 }, a); },
    close() { srv.closeAllConnections?.(); srv.close(); },
  })));
}

/** The default route's IPv4, read independently of the launcher (the Mac's `route` + `ipconfig`). */
export function systemLanIPv4() {
  if (WIN) return null;
  try {
    const iface = /interface:\s*(\S+)/.exec(execFileSync('route', ['-n', 'get', 'default'], { encoding: 'utf8' }))?.[1];
    if (!iface) return '';
    return execFileSync('ipconfig', ['getifaddr', iface], { encoding: 'utf8' }).trim();
  } catch (e) { return ''; }
}

export function clipboard() {
  try { return WIN ? execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard'], { encoding: 'utf8' }).trim() : execFileSync('pbpaste', { encoding: 'utf8' }); }
  catch (e) { return null; }
}

/** Windows only (ADDENDUM 7 §2 (b)): this program's own workerd, started OUTSIDE any job, as a crash would leave it:
 * the bundle's server\Holocron.exe (workerd, renamed; ADDENDUM 17), with the bundle's serve\holocron.capnp and site\, on 8250 and a free
 * internal port, its pid written to the rig's state\workerd.pid. Detached, so libuv puts it in no job of node's.
 * Resolves to its pid once it holds 8250 (0 when it never does). */
export async function plantOrphan(launcher, rig) {
  const dir = path.dirname(launcher);
  const internal = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const doDisk = path.join(rig.root, 'do-disk');
  fs.mkdirSync(doDisk, { recursive: true });
  const out = fs.openSync(path.join(rig.dir, 'orphan.out'), 'a');
  const child = spawn(path.join(dir, 'server', 'Holocron.exe'), ['serve', path.join(dir, 'serve', 'holocron.capnp'),
    '--socket-addr', `http=*:${PORT}`, '--socket-addr', `internal=127.0.0.1:${internal}`,
    '-d', `site=${path.join(dir, 'site')}`, '-d', `state=${rig.state}`, '-d', `do-disk=${doDisk}`],
  { cwd: path.join(dir, 'serve'), stdio: ['ignore', out, out], detached: true, windowsHide: true });
  child.unref();
  fs.writeFileSync(path.join(rig.state, 'workerd.pid'), child.pid + '\n');
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (on(PORT).some((l) => l.pid === child.pid)) return child.pid; await sleep(100); }
  return 0;
}

export const tmpBase = () => fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-conformance-'));
