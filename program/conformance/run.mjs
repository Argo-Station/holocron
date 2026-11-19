#!/usr/bin/env node
/**
 * run.mjs — THE conformance suite for the Holocron program's launchers (ruling `argo-a4-launcher-build` §3, "One
 * conformance suite"). It drives one launcher's observable surface — the ports, lan.json, /program/presence, the URL the
 * browser was told to open, S2–S6, the exit and the freed port, the orphan reclaim, the update check against a local
 * fixture — through the HOLOCRON_TEST=1 hooks (program/mac/Sources/TestHooks.swift names them). A launcher passes it,
 * or it is not the rule. The Windows card runs it unchanged (§4.3).
 *
 *   node program/conformance/run.mjs --launcher <executable> [--serve stub|real] [--os mac|win] [--law <mockup.html>]
 *                                    [--only <group,group>] [--keep]
 *     --launcher  Mac: Holocron.app/Contents/MacOS/Holocron. Windows: Holocron.exe.
 *     --serve     stub: the launcher carries program/conformance/stub (before argo-a4-program-serve merges); the suite
 *                 sets the presence count in state/stub_presence.json. real (default): the launcher carries
 *                 program/serve; the suite seats a real player on a real table through /t to make the count.
 *     --law       the approved mockup (default Docs/mockups/argo-a4-guide.html); every window string is read from it.
 *     --only      run these groups only (the bite run uses this). Groups: start lan buttons s6 s4 close sig orphan job s5 update
 *     --keep      keep the run directory (the window snapshots are in <run>/<rig>/snap/).
 *     --results   also write the per-assert results (JSON) to this file. Ids starting `pre.` are a case's precondition,
 *                 not an assert of the launcher.
 * Exit 0 when every assert passes, 1 when any fails, 2 on a bad invocation or when 8250 is held by anything but this
 * run's own launcher or workerd (`REFUSED: 8250 held by <pid> <cwd>`, checked before the run and before every group).
 * Needs port 8250 free and no other Holocron running. Writes only under the OS temp directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { loadLaw, expect } from './law.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const o = { serve: 'real', os: process.platform === 'win32' ? 'win' : 'mac', law: path.join(REPO, 'Docs', 'mockups', 'argo-a4-guide.html') };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--keep') { o.keep = true; continue; }
  if (!['--launcher', '--serve', '--os', '--law', '--only', '--results'].includes(k) || argv[i + 1] == null) {
    console.error('usage: run.mjs --launcher <exe> [--serve stub|real] [--os mac|win] [--law <html>] [--only <groups>] [--keep]');
    process.exit(2);
  }
  o[k.slice(2)] = argv[++i];
}
if (!o.launcher || !fs.existsSync(o.launcher)) { console.error('no launcher at ' + o.launcher); process.exit(2); }
if (!['stub', 'real'].includes(o.serve)) { console.error('--serve is stub or real'); process.exit(2); }
const only = o.only ? new Set(o.only.split(',')) : null;
const LAW = loadLaw(o.law, o.os);
const BASE = L.tmpBase();
const keepAlive = setInterval(() => {}, 1000);

// ── the record ──
const results = [];
function check(id, what, ok, detail = '') {
  results.push({ id, what, ok: !!ok, detail: ok ? '' : String(detail) });
  console.log(`${ok ? '✓' : '✗'} ${id} — ${what}${ok ? '' : '  · ' + detail}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (x) => JSON.stringify(x);

// ── presence: a real GM (and player) at a real table through /t, in both modes. Under the stub the COUNT comes from
// its file, but the sockets are real either way, so every close road meets open WebSockets (workerd's drain). ──
async function seatPlayer(rig, { player = true } = {}) {
  if (o.serve === 'stub') rig.setPresence(player ? 1 : 0);
  const frames = (ws) => { const q = []; ws.addEventListener('message', (e) => q.push(JSON.parse(e.data))); return q; };
  const wait = async (q, t, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { const f = q.find((x) => x.t === t); if (f) return f; await L.sleep(50); } return null; };
  const gm = new WebSocket(`ws://127.0.0.1:${L.PORT}/t?open=1`);
  const gq = frames(gm);
  await new Promise((r, j) => { gm.addEventListener('open', r); gm.addEventListener('error', j); });
  gm.send(JSON.stringify({ v: 1, t: 'open', label: 'Conformance', listed: false }));
  const opened = await wait(gq, 'opened');
  if (!opened) throw new Error('no opened frame: ' + show(gq));
  let pl = null;
  if (player) {
    pl = new WebSocket(`ws://127.0.0.1:${L.PORT}/t?code=${encodeURIComponent(opened.code)}`);
    await new Promise((r, j) => { pl.addEventListener('open', r); pl.addEventListener('error', j); });
    pl.send(JSON.stringify({ v: 1, t: 'join', code: opened.code, deviceLabel: 'Phone' }));
    if (!(await wait(gq, 'knock'))) throw new Error('the GM saw no knock');
  }
  return () => { try { pl && pl.close(); gm.close(); } catch (e) {} };
}

async function presenceOf(r) {
  const res = await L.get(`http://127.0.0.1:${r.internalPort}/program/presence`);
  try { return JSON.parse(res.body); } catch (e) { return null; }
}

// A started launcher, waited to a phase. Returns {rig, proc, r}.
async function launch(name, { lan = '192.168.77.23', env = {}, phase = 'running', setup } = {}) {
  const rig = new L.Rig(o.launcher, BASE, name);
  rig.setLan(lan);
  if (setup) await setup(rig);
  const proc = rig.start(env);
  const r = await rig.until((x) => x.phase === phase || x.phase === 'failed' || x.phase === 'port-taken' || x.phase === 'running', 20000);
  return { rig, proc, r };
}
async function stop({ rig, proc }) {
  if (proc.exit) return proc.exit;
  try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
  await Promise.race([proc.exited, L.sleep(8000)]);
  const wp = rig.pidFile();
  if (wp && L.alive(wp)) { try { process.kill(wp, 'SIGKILL'); } catch (e) {} }
  return proc.exit;
}
async function portFree() { const end = Date.now() + 8000; while (Date.now() < end) { if (L.on(L.PORT).length === 0) return true; await L.sleep(100); } return false; }
const S1 = (addr) => expect(LAW.S1, { address: addr });

const GROUPS = {};

// ── start: S1, the browser, A4-C11's sockets and paths ──
GROUPS.start = async () => {
  const run = await launch('start', { setup: (rig) => { fs.mkdirSync(path.join(rig.root, 'do-disk'), { recursive: true }); fs.writeFileSync(path.join(rig.root, 'do-disk', 'planted'), 'x'); } });
  const { rig, r } = run;
  check('S1.state', 'starts running with a Wi-Fi address: S1', r && same(r.states, ['S1']), show(r && r.states));
  check('S1.copy', 'S1 shows exactly the -a frame\'s strings, the link control excepted', r && same(r.strings, S1('http://192.168.77.23:8250')), show(r && r.strings));
  await L.sleep(800);
  check('C7.1.open-at-start', 'the browser opens once, at http://localhost:8250/', same(rig.openedList(), ['http://localhost:8250/']), show(rig.openedList()));
  const on = L.on(L.PORT);
  const wpid = rig.pidFile();
  check('C9.one-listener', 'exactly one process listens on 8250, on every IPv4 interface, and it is the recorded workerd',
    on.length === 1 && ['*', '0.0.0.0'].includes(on[0].addr) && on[0].pid === wpid && wpid === r.workerdPid && wpid !== run.proc.pid, show(on) + ' pidfile ' + wpid);
  check('C9.exe', 'that process is this program\'s own workerd, inside the launcher', real(L.exeOf(wpid)) === OWN_WORKERD, L.exeOf(wpid));
  const mine = L.listeners().filter((l) => l.pid === wpid && l.port !== L.PORT);
  check('C11.internal', 'the internal socket is loopback only, on the launcher\'s own pick, not 8250',
    mine.length === 1 && mine[0].addr === '127.0.0.1' && mine[0].port === r.internalPort && r.internalPort > 0, show(mine) + ' report ' + r.internalPort);
  const lj = await L.get(`http://127.0.0.1:${L.PORT}/program/lan.json`);
  const disk = fs.readFileSync(path.join(rig.state, 'lan.json'), 'utf8');
  check('C7.2.lan-json', 'GET /program/lan.json is {"v":1,"origin":"http://<LAN>:8250"}, no-store, the launcher\'s file verbatim',
    lj.status === 200 && lj.body === '{"v":1,"origin":"http://192.168.77.23:8250"}' && lj.headers['cache-control'] === 'no-store' && lj.body === disk, show(lj) + ' disk ' + disk);
  const site = await L.get(`http://localhost:${L.PORT}/`);
  check('C11.site', 'the site answers / at localhost:8250', site.status === 200 && /text\/html/.test(site.headers['content-type'] || ''), site.status + ' ' + site.headers['content-type']);
  const t = await L.get(`http://127.0.0.1:${L.PORT}/t`);
  check('C11.t', 'exactly /t reaches the table server', t.status === 426 && /expected_websocket/.test(t.body), show(t));
  const pres = await presenceOf(r);
  check('C12.internal', 'the internal socket answers /program/presence {"v":1,"players":0}', same(pres, { v: 1, players: 0 }), show(pres));
  const pub = await L.get(`http://127.0.0.1:${L.PORT}/program/presence`);
  check('C12.not-public', '/program/presence is never served on the public socket', !/"players"/.test(pub.body), show(pub));
  check('C11.do-disk', 'do-disk is emptied at each start', !fs.existsSync(path.join(rig.root, 'do-disk', 'planted')));
  await stop(run);
};

// ── lan: S2 and the watch (A4-C7.2, A4-C11's ≤ 10 s backstop) ──
GROUPS.lan = async () => {
  const run = await launch('lan');
  const { rig } = run;
  const origin = async () => { try { return JSON.parse((await L.get(`http://127.0.0.1:${L.PORT}/program/lan.json`)).body).origin; } catch (e) { return null; } };
  const settle = async (want) => { const end = Date.now() + 12000; while (Date.now() < end) { if ((await origin()) === want) return true; await L.sleep(250); } return false; };
  rig.setLan('');
  const t0 = Date.now();
  const s2 = (await settle('')) && await rig.until((x) => same(x.states, ['S2']), 3000);
  check('S2.state', 'no address: lan.json origin "" and S2 within 12 s', !!s2, show(rig.read()));
  check('S2.copy', 'S2 shows exactly the -a frame\'s strings', s2 && same(s2.strings, LAW.S2), show(s2 && s2.strings));
  check('C11.backstop', 'the change reached lan.json within the ≤ 10 s backstop (+2 s slack)', Date.now() - t0 <= 12000, (Date.now() - t0) + ' ms');
  for (const ip of ['100.64.0.5', '172.32.0.1', '8.8.8.8']) {
    rig.setLan(ip);
    await L.sleep(11000);
    check(`C7.2.private:${ip}`, `a non-RFC 1918 address (${ip}) publishes ""`, (await origin()) === '', await origin());
  }
  rig.setLan('172.16.4.4');
  const back = (await settle('http://172.16.4.4:8250')) && await rig.until((x) => same(x.states, ['S1']) && same(x.strings, S1('http://172.16.4.4:8250')), 3000);
  check('S2.returns', 'the address coming back redraws S1 by itself', !!back, show(rig.read()));
  if (o.os === 'mac') {
    rig.setLan(null);
    const sys = L.systemLanIPv4();
    const want = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(sys || '') ? `http://${sys}:8250` : '';
    check('C7.2.system', `with no test address, the default route's RFC 1918 IPv4 (${sys || 'none'})`, await settle(want), `${await origin()} vs ${want}`);
  }
  await stop(run);
};

// ── buttons: Copy and Open Holocron ──
GROUPS.buttons = async () => {
  const run = await launch('buttons');
  const { rig } = run;
  const before = L.clipboard();
  rig.send('click Copy');
  await L.sleep(600);
  const got = L.clipboard();
  check('S1.copy-button', 'Copy puts the players\' address on the clipboard', got === 'http://192.168.77.23:8250', show(got));
  if (before != null && L.WIN === false) { try { (await import('node:child_process')).execFileSync('pbcopy', { input: before }); } catch (e) {} }
  const n = rig.openedList().length;
  rig.send('click Open Holocron');
  await L.sleep(800);
  const list = rig.openedList();
  check('C7.1.open-button', 'Open Holocron opens http://localhost:8250/ (never the LAN address)', list.length === n + 1 && list[n] === 'http://localhost:8250/', show(list));
  await stop(run);
};

// ── s6: opened again while running ──
GROUPS.s6 = async () => {
  const run = await launch('s6');
  const { rig } = run;
  await L.sleep(500);
  const wpid = rig.pidFile();
  const n = rig.openedList().length;
  const second = rig.start();
  const ex = await Promise.race([second.exited, L.sleep(6000).then(() => null)]);
  check('S6.no-second', 'a second copy exits at once (0) and starts nothing', ex && ex.code === 0, show(ex));
  const r = await rig.until((x) => x.reopens >= 1, 4000);
  await L.sleep(600);
  const list = rig.openedList();
  check('S6.forward', 'the running copy opens the browser at localhost and comes forward', r && list.length === n + 1 && list[n] === 'http://localhost:8250/' && r.windowVisible, show(list) + ' ' + show(r));
  const on = L.on(L.PORT);
  check('S6.one-server', 'still one workerd on 8250, the same one', on.length === 1 && on[0].pid === wpid, show(on));
  if (!ex) await stop({ rig, proc: second });
  await stop(run);
};

// ── s4: closing while players are at a table (A4-C12) — the window's close and ⌘Q ──
GROUPS.s4 = async () => {
  for (const road of ['close', 'quit']) {
    const run = await launch('s4-' + road);
    const { rig, r, proc } = run;
    const leave = await seatPlayer(rig);
    const pres = await presenceOf(r);
    check(`C12.count:${road}`, 'a player at a table counts 1', pres && pres.players === 1, show(pres));
    rig.send(road);
    const asked = await rig.until((x) => x.alert && x.states.includes('S4'), 5000);
    check(`S4.ask:${road}`, `${road === 'close' ? 'closing the window' : '⌘Q'} asks first`, !!asked, show(rig.read()));
    const want = LAW.S4alert;
    check(`S4.copy:${road}`, 'the OS alert carries the -a frame\'s text and its two buttons, Keep running the primary',
      asked && asked.alert.text === want[0] && !asked.alert.informative && same([...asked.alert.buttons].sort(), want.slice(1).sort()) && asked.alert.primary === 'Keep running',
      show(asked && asked.alert));
    rig.send('alert Keep running');
    await L.sleep(1500);
    const kept = rig.read();
    check(`S4.keep:${road}`, 'Keep running keeps it running: no exit, the same workerd on 8250',
      !proc.exit && kept.phase === 'running' && !kept.alert && L.on(L.PORT).length === 1 && L.alive(rig.pidFile()), show(kept) + ' ' + show(proc.exit));
    rig.send(road);
    await rig.until((x) => x.alert, 5000);
    const wpid = rig.pidFile();
    const t0 = Date.now();
    rig.send('alert Stop Holocron');
    const ex = await Promise.race([proc.exited, L.sleep(8000).then(() => null)]);
    check(`S4.stop:${road}`, 'Stop Holocron exits (0), within 7 s', ex && ex.code === 0 && Date.now() - t0 < 7000, show(ex));
    check(`C14.freed:${road}`, 'the port is free and workerd is gone', (await portFree()) && !L.alive(wpid), show(L.on(L.PORT)));
    const ended = new RegExp(`workerd ${wpid} stopped \\((signal 15|signal 2|exit 0)\\)`).test(rig.log());
    check(`C14.graceful:${road}`, 'workerd ended on its graceful signals (Mac: SIGTERM, then SIGINT at 1 s; Windows: Ctrl-C, then the hard kill at 5 s), never the 5 s hard kill', ended && !/did not stop in 5 s/.test(rig.log()), rig.log().split('\n').slice(-4).join(' | '));
    leave();
    if (!ex) await stop(run);
  }
};

// ── close: no one else connected → no ask (A4-C12 n = 0, including a GM alone at an open table) ──
GROUPS.close = async () => {
  for (const road of ['close', 'quit']) {
    const run = await launch('close-' + road);
    const { rig, r, proc } = run;
    const leave = await seatPlayer(rig, { player: false });
    const pres = await presenceOf(r);
    check(`C12.gm-alone:${road}`, o.serve === 'real' ? 'a GM alone at an open table counts 0' : 'no one counts 0', pres && pres.players === 0, show(pres));
    const wpid = rig.pidFile();
    let sawAsk = false;
    const watch = setInterval(() => { const x = rig.read(); if (x && x.alert) sawAsk = true; }, 50);
    rig.send(road);
    const ex = await Promise.race([proc.exited, L.sleep(8000).then(() => null)]);
    clearInterval(watch);
    check(`C12.no-ask:${road}`, 'closes with no ask, exit 0', ex && ex.code === 0 && !sawAsk, show(ex) + ' asked ' + sawAsk);
    check(`C14.freed0:${road}`, 'the port is free and workerd is gone', (await portFree()) && !L.alive(wpid), show(L.on(L.PORT)));
    leave();
    if (!ex) await stop(run);
  }
};

// ── sig: the OS's own stop (SIGTERM on the Mac) takes workerd with it ──
GROUPS.sig = async () => {
  // ADDENDUM 9: a group that prints nothing reads as a failed harvest
  if (L.WIN) { console.log('sig: n/a on Windows — the OS\'s stop of the launcher is covered by C14.job'); return; }
  const run = await launch('sig');
  const { rig, proc } = run;
  const wpid = rig.pidFile();
  process.kill(proc.pid, 'SIGTERM');
  const ex = await Promise.race([proc.exited, L.sleep(8000).then(() => null)]);
  check('C14.sigterm', 'SIGTERM to the launcher stops workerd too, and the port is free', ex && (await portFree()) && !L.alive(wpid), show(ex) + ' workerd alive ' + L.alive(wpid));
  if (!ex) await stop(run);
};

// ── orphan: after a crash, the next start reclaims only its own workerd ──
// On Windows a killed launcher cannot leave one (its workerd is in a kill-on-close Job Object; `job` below reads that), so
// the group plants the orphan outside any job: the bundle's own server\Holocron.exe, its pid in state/workerd.pid
// (`argo-a4-launcher-build` ADDENDUM 7 §2 (b)).
GROUPS.orphan = async () => {
  let rig, old;
  if (L.WIN) {
    rig = new L.Rig(o.launcher, BASE, 'orphan');
    rig.setLan('192.168.77.23');
    old = await L.plantOrphan(o.launcher, rig);
  } else {
    const run = await launch('orphan');
    rig = run.rig;
    old = rig.pidFile();
    process.kill(run.proc.pid, 'SIGKILL');
    await run.proc.exited;
    await L.sleep(300);
  }
  const orphaned = L.alive(old) && L.on(L.PORT).some((l) => l.pid === old);
  check('pre.orphan-exists', 'PRECONDITION: ' + (L.WIN ? 'a workerd of this program outside any job holds 8250, named in state/workerd.pid' : 'a killed launcher leaves its workerd holding 8250') + ' (the case to reclaim)', orphaned, show(L.on(L.PORT)));
  // ADDENDUM 13: a next start that never runs (a launcher the OS blocks) must red this, never skip it
  let again = null, r = null, why = '';
  try {
    again = rig.start();
    r = await rig.until((x) => again.pid && x.pid === again.pid && (x.phase === 'running' || x.phase === 'port-taken'), 20000, 100, () => again.exit);
  } catch (e) { why = 'the next start failed: ' + (e && e.message); }
  const now = rig.pidFile();
  check('C14.reclaim', 'the next start reclaims it and runs: S1 (not S5), a new workerd named in state/workerd.pid holding 8250, the orphan gone',
    !!r && r.phase === 'running' && same(r.states, ['S1']) && !L.alive(old) && now > 0 && now !== old && L.alive(now) && L.on(L.PORT).some((l) => l.pid === now),
    show(r) + ' old alive ' + L.alive(old) + ' new pid ' + now + ' launcher ' + show(again && (again.exit || again.pid)) + (why ? ' · ' + why : ''));
  if (again && again.pid && !again.exit) await stop({ rig, proc: again });
  if (L.alive(old)) { try { process.kill(old, 'SIGKILL'); } catch (e) {} }
};

// ── job (Windows only): a killed launcher takes its workerd with it (the kill-on-close Job Object; ADDENDUM 7 §2 (a)) ──
GROUPS.job = async () => {
  if (!L.WIN) return;
  const run = await launch('job');
  const { rig, proc } = run;
  const wpid = rig.pidFile();
  process.kill(proc.pid, 'SIGKILL');
  await proc.exited;
  const t0 = Date.now();
  let freed = false;
  while (Date.now() - t0 < 5000) { if (!L.alive(wpid) && L.on(L.PORT).length === 0) { freed = true; break; } await L.sleep(100); }
  const again = rig.start();
  const r = await rig.until((x) => x.pid === again.pid && (x.phase === 'running' || x.phase === 'port-taken'), 20000);
  check('C14.job', 'a killed launcher\'s workerd is gone and 8250 free within 5 s, and the next start is S1',
    wpid > 0 && freed && r && r.phase === 'running' && same(r.states, ['S1']), `workerd ${wpid} alive ${L.alive(wpid)} · ${show(L.on(L.PORT))} · ${show(r)}`);
  await stop({ rig, proc: again });
  if (L.alive(wpid)) { try { process.kill(wpid, 'SIGKILL'); } catch (e) {} }
};

// ── s5: the port is taken by another program ──
GROUPS.s5 = async () => {
  const cases = [['wildcard', '0.0.0.0'], ['loopback', '127.0.0.1'], ['foreign-pid', '0.0.0.0']];
  for (const [name, host] of cases) {
    const holder = await L.holdPort(host, L.PORT);
    const { rig, proc, r } = await launch('s5-' + name, {
      phase: 'port-taken',
      setup: (rig) => { if (name === 'foreign-pid') fs.writeFileSync(path.join(rig.state, 'workerd.pid'), holder.pid + '\n'); },
    });
    check(`S5.state:${name}`, `8250 held (${name}): S5`, r && same(r.states, ['S5']), show(r));
    check(`S5.copy:${name}`, 'S5 shows exactly its frame\'s strings', r && same(r.strings, LAW.S5), show(r && r.strings));
    await L.sleep(500);
    check(`S5.nothing:${name}`, 'no workerd started, no browser opened, never another port', r && r.workerdPid === 0 && rig.openedList().length === 0 && L.on(L.PORT).every((l) => l.pid === holder.pid) && L.childrenOf(proc.pid).length === 0, show(r) + ' ' + show(rig.openedList()) + ' children ' + show(L.childrenOf(proc.pid)));
    check(`C14.never-kills:${name}`, 'the other program is untouched', L.alive(holder.pid) && L.on(L.PORT).some((l) => l.pid === holder.pid));
    rig.send('click OK');
    const ex = await Promise.race([proc.exited, L.sleep(6000).then(() => null)]);
    check(`S5.ok:${name}`, 'OK exits, and the other program still holds its port', ex && L.alive(holder.pid), show(ex));
    if (!ex) await stop({ rig, proc });
    holder.kill();
    await portFree();
  }
};

// ── update: A4-C13 against a local fixture ──
GROUPS.update = async () => {
  const fx = await L.updateFixture();
  const HOST = 'release.test';
  const env = { HOLOCRON_TEST_LATEST_URL: fx.url, HOLOCRON_TEST_RELEASE_HOST: HOST };
  const bump = (v, i) => v.split('.').map(Number).map((n, k) => (k === i ? n + 1 : k > i ? 0 : n)).join('.');
  const drop = (v) => { const p = v.split('.').map(Number); p[p.findLastIndex((n) => n > 0)] -= 1; return p.join('.'); };

  // newer: the line, and the request's privacy
  fx.set({ body: '{}' });
  let probe = await launch('update-version', { env: { HOLOCRON_TEST_LATEST_URL: '' } });
  const own = probe.r.version;
  await stop(probe);
  check('C13.version', 'the program\'s version is package.json\'s', own === JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version, own);
  const newer = bump(own, 2);
  fx.set({ body: JSON.stringify({ v: 1, version: newer, page: `https://${HOST}/holocron/${newer}` }) });
  fx.seen.length = 0;
  let run = await launch('update-newer', { env });
  const s3 = await run.rig.until((x) => x.states.includes('S3'), 8000);
  check('C13.newer', 'a newer version on the release host shows S3', s3 && same(s3.states, ['S1', 'S3']), show(run.rig.read()));
  check('S3.copy', 'S3 shows exactly the -a frame\'s strings', s3 && same(s3.strings, expect(LAW.S3, { address: 'http://192.168.77.23:8250', version: newer })), show(s3 && s3.strings));
  run.rig.send('click Get it');
  await L.sleep(800);
  check('S3.get-it', 'Get it opens the release page', run.rig.openedList().includes(`https://${HOST}/holocron/${newer}`), show(run.rig.openedList()));
  const req = fx.seen;
  const h = req[0] ? req[0].headers : {};
  const flat = req[0] ? req[0].rawHeaders.join('\n') : '';
  check('C13.one-get', 'exactly one GET at start', req.length === 1 && req[0].method === 'GET', show(req.map((x) => x.method + ' ' + x.url)));
  check('C13.no-body', 'no body', req[0] && req[0].body === '' && !(Number(h['content-length']) > 0), show(h));
  check('C13.no-cookie', 'no cookie', req[0] && !('cookie' in h), show(h));
  check('C13.no-query', 'no query', req[0] && !req[0].url.includes('?'), req[0] && req[0].url);
  check('C13.ua', 'the User-Agent is exactly Holocron (never a version)', h['user-agent'] === 'Holocron', h['user-agent']);
  check('C13.no-version', 'the program\'s version is in no header', req[0] && !flat.includes(own), flat);
  await stop(run);

  // not newer / not on the release host / malformed / failing: no line
  const cases = [
    ['same', { body: JSON.stringify({ v: 1, version: own, page: `https://${HOST}/x` }) }],
    ['older', { body: JSON.stringify({ v: 1, version: drop(own), page: `https://${HOST}/x` }) }],
    ['http-page', { body: JSON.stringify({ v: 1, version: newer, page: `http://${HOST}/x` }) }],
    ['other-host', { body: JSON.stringify({ v: 1, version: newer, page: 'https://example.com/x' }) }],
    ['bad-v', { body: JSON.stringify({ v: 2, version: newer, page: `https://${HOST}/x` }) }],
    ['bad-version', { body: JSON.stringify({ v: 1, version: newer + '-beta', page: `https://${HOST}/x` }) }],
    ['garbage', { body: '<html>' }],
    ['500', { status: 500, body: JSON.stringify({ v: 1, version: newer, page: `https://${HOST}/x` }) }],
  ];
  for (const [name, answer] of cases) {
    fx.set(answer);
    fx.seen.length = 0;
    run = await launch('update-' + name, { env });
    const end = Date.now() + 5000;
    while (Date.now() < end && fx.seen.length === 0) await L.sleep(50);
    await L.sleep(1200);
    const x = run.rig.read();
    check(`C13.no-line:${name}`, `${name}: no line`, fx.seen.length === 1 && x && same(x.states, ['S1']), show(x && x.states) + ' requests ' + fx.seen.length);
    await stop(run);
  }

  // slow: the 5 s timeout, and start is never held up by it
  fx.set({ body: JSON.stringify({ v: 1, version: newer, page: `https://${HOST}/x` }), delay: 7000 });
  fx.seen.length = 0;
  const t0 = Date.now();
  run = await launch('update-slow', { env });
  check('C13.not-blocking', 'start does not wait for the check (running within 3.5 s, the answer due at 7 s)', run.r && run.r.phase === 'running' && Date.now() - t0 < 3500, (Date.now() - t0) + ' ms');
  await L.sleep(8500);
  check('C13.timeout', 'an answer after 5 s shows no line', same(run.rig.read().states, ['S1']), show(run.rig.read().states));
  await stop(run);

  // empty LATEST_URL: no GET at all (the shipped build until the end-goal refresh, D-609)
  fx.set({ body: JSON.stringify({ v: 1, version: newer, page: `https://${HOST}/x` }) });
  fx.seen.length = 0;
  // HOLOCRON_BITE_URL is read by no launcher; only bite.mjs's empty-URL mutant reads it, to show this assert can go red
  run = await launch('update-empty', { env: { HOLOCRON_TEST_LATEST_URL: '', HOLOCRON_TEST_RELEASE_HOST: HOST, HOLOCRON_BITE_URL: fx.url } });
  await L.sleep(3000);
  check('C13.empty', 'an empty LATEST_URL sends nothing', fx.seen.length === 0 && same(run.rig.read().states, ['S1']), fx.seen.length + ' requests');
  await stop(run);
  fx.close();
};

// ── run ──
// RULED (`argo-a4-launcher-build` ADDENDUM 5 @ d6fa01d3b): 8250 on this machine is the suite's alone. Before the
// run and before every group, a holder that is not this run's own launcher or workerd REFUSES the whole run, exit 2, and
// no result is written, so a foreign holder can never read as an S5 pass or a red. (The S5 group holds the port itself,
// inside the group, as designed.) A holder that IS this run's own workerd is a teardown failure: a red, then killed by pid.
const real = (p) => { try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); } };   // /var → /private/var
const OWN_WORKERD = real(path.join(path.dirname(o.launcher), WORKERD_NAME()));
// Windows: workerd renamed into its own folder (ADDENDUM 17 (iv)); matched by full path, as the launcher matches it
function WORKERD_NAME() { return L.WIN ? path.join('server', 'Holocron.exe') : 'workerd'; }
async function guardPort(when) {
  await portFree();
  for (const l of L.on(L.PORT)) {
    const exe = L.exeOf(l.pid);
    if (exe && real(exe) === OWN_WORKERD) {
      check(`teardown.${when}`, 'the previous group left none of its own workerd on 8250', false, `pid ${l.pid}`);
      try { process.kill(l.pid, 'SIGKILL'); } catch (e) {}
      await portFree();
      continue;
    }
    console.error(`REFUSED: 8250 held by ${l.pid} ${L.cwdOf(l.pid) || exe}`);
    clearInterval(keepAlive);
    if (!o.keep) fs.rmSync(BASE, { recursive: true, force: true });
    process.exit(2);
  }
}
await guardPort('start');
console.log(`conformance · launcher ${o.launcher} · serve ${o.serve} · os ${o.os} · LAW ${path.relative(REPO, o.law)} · run ${BASE}`);
for (const [name, fn] of Object.entries(GROUPS)) {
  if (only && !only.has(name)) continue;
  await guardPort('before-' + name);
  console.log(`\n── ${name}`);
  try { await fn(); } catch (e) { check(`${name}.crashed`, 'the group ran to its end', false, e && e.stack); }
}
await guardPort('end');
console.log('lsof -iTCP:8250 after the run: ' + (L.on(L.PORT).length ? JSON.stringify(L.on(L.PORT)) : 'empty'));
const failed = results.filter((x) => !x.ok);
console.log(`\nRESULT ${results.length - failed.length}/${results.length} passed${failed.length ? ' · FAILED: ' + failed.map((x) => x.id).join(', ') : ''}`);
fs.writeFileSync(path.join(BASE, 'results.json'), JSON.stringify(results, null, 1));
if (o.results) fs.writeFileSync(o.results, JSON.stringify(results, null, 1));
if (!o.keep) fs.rmSync(BASE, { recursive: true, force: true }); else console.log('kept ' + BASE);
clearInterval(keepAlive);
process.exit(failed.length ? 1 : (results.length ? 0 : 1));
