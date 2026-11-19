#!/usr/bin/env node
/**
 * bite.mjs — shows each conformance assert can go red (ruling `argo-a4-launcher-build` §4.2 ACCEPTANCE: "each assert
 * shown to bite once"; PRAXIS §6: a green that has never been red is not evidence). Each mutant patches ONE line of a
 * COPY of the Mac launcher's sources (or of the stub server half), is built into the OS temp directory, and has the
 * suite run its group against it. A mutant BITES when every assert it names goes red. At the end the union of bitten
 * asserts is compared with every assert the clean suite runs (ids starting `pre.` are preconditions, not asserts).
 *
 *   node program/conformance/bite.mjs [--only <mutant,mutant>] [--out <report.json>]
 *   (Windows) node program/conformance/bite.mjs --workerd <workerd.exe> --icons <dir> [--only …] [--out …]
 * Mac: needs program/conformance/out/serve (stub.mjs); the mutants are M's, of program/mac/Sources, run --serve stub.
 * Windows (`argo-a4-launcher-build` ADDENDUM 7): the mutants are MW's, of program/windows/Sources, each built by
 * program/windows/build.mjs with program/out/serve and program/out/site (program/build.mjs) and run --serve real.
 * Coverage counts only the asserts the OS runs (C14.sigterm and C7.2.system are the Mac's, C14.job is Windows').
 * Reads nothing outside this tree; writes only under the OS temp dir and --out. Exit 0 when every mutant bit and every
 * assert was bitten by one, 1 otherwise.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { processes } from './lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === 'win32';
const MAC = path.resolve(HERE, '..', WIN ? 'windows' : 'mac');
const SERVE = WIN ? path.resolve(HERE, '..', 'out', 'serve') : path.join(HERE, 'out', 'serve');
const SITE = WIN ? path.resolve(HERE, '..', 'out', 'site') : path.join(HERE, 'fixture', 'site');
const argv = process.argv.slice(2);
const o = {};
for (let i = 0; i < argv.length; i++) {
  if (!['--only', '--out', '--workerd', '--icons'].includes(argv[i]) || argv[i + 1] == null) { console.error('usage: bite.mjs [--only <ids>] [--out <file>] [--workerd <exe> --icons <dir>]'); process.exit(2); }
  o[argv[i].slice(2)] = argv[++i];
}
if (!fs.existsSync(path.join(SERVE, 'holocron.capnp'))) { console.error(WIN ? 'run program/build.mjs first' : 'run program/conformance/stub.mjs first'); process.exit(2); }
if (WIN && (!o.workerd || !o.icons)) { console.error('Windows: --workerd and --icons are needed'); process.exit(2); }

// [id, file (Sources/… or stub/…), find, replace, suite group, asserts it must turn red]
const M = [
  ['copy-s1', 'Sources/Window.swift', 'lead.stringValue = "Players on your Wi-Fi open:"', 'lead.stringValue = "Players on your WiFi open:"', 'start,lan', ['S1.copy', 'S2.returns']],
  ['copy-s2', 'Sources/Window.swift', '"No Wi-Fi on this computer. Connect it so players can join."', '"No Wi-Fi on this computer."', 'lan', ['S2.copy']],
  ['copy-s3', 'Sources/Window.swift', '"A new version of Holocron is out (\\(o.version))."', '"A new version is out (\\(o.version))."', 'update', ['S3.copy']],
  ['copy-s4', 'Sources/Window.swift', 'a.messageText = "Players are at your table. Closing stops Holocron for everyone."', 'a.messageText = "Players are at your table."', 's4', ['S4.copy:close', 'S4.copy:quit']],
  ['s4-primary', 'Sources/Window.swift', 'a.addButton(withTitle: "Keep running")    // the primary, as window-s4-mac-a draws it\n        a.addButton(withTitle: "Stop Holocron")', 'a.addButton(withTitle: "Stop Holocron")\n        a.addButton(withTitle: "Keep running")', 's4', ['S4.copy:close', 'S4.copy:quit']],
  ['copy-s5', 'Sources/Window.swift', 'then open Holocron again."', 'then try again."', 's5', ['S5.copy:wildcard', 'S5.copy:loopback', 'S5.copy:foreign-pid']],
  ['no-origin-at-start', 'Sources/main.swift', 'w.origin = lan.origin', 'w.origin = ""', 'start', ['S1.state', 'S1.copy']],
  ['open-lan', 'Sources/Constants.swift', 'static var localURL: String { "http://localhost:\\(Build.port)/" }', 'static var localURL: String { "http://127.0.0.1:\\(Build.port)/" }', 'start,buttons,s6', ['C7.1.open-at-start', 'C7.1.open-button', 'S6.forward']],
  ['no-open-at-start', 'Sources/main.swift', 'openBrowser(URL(string: Program.localURL)!)          // the browser opens on its own at start (S1)', '// no open at start', 'start', ['C7.1.open-at-start']],
  ['bind-loopback', 'Sources/Server.swift', '"--socket-addr", "http=*:\\(Build.port)",', '"--socket-addr", "http=127.0.0.1:\\(Build.port)",', 'start', ['C9.one-listener']],
  ['exe-renamed', 'Sources/Paths.swift', 'static let workerd = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/workerd")', 'static let workerd: URL = { let u = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("holocron-server-\\(getpid())"); try? FileManager.default.removeItem(at: u); try? FileManager.default.copyItem(at: Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/workerd"), to: u); return u }()', 'start', ['C9.exe']],
  ['internal-wildcard', 'Sources/Server.swift', '"--socket-addr", "internal=127.0.0.1:\\(internalPort)",', '"--socket-addr", "internal=*:\\(internalPort)",', 'start', ['C11.internal']],
  ['lan-json-shape', 'Sources/Lan.swift', 'Paths.writeAtomically("{\\"v\\":1,\\"origin\\":\\"\\(origin)\\"}"', 'Paths.writeAtomically("{\\"origin\\":\\"\\(origin)\\",\\"v\\":1}"', 'start', ['C7.2.lan-json']],
  ['site-wrong', 'Sources/Server.swift', '"-d", "site=\\(Paths.site.path)",', '"-d", "site=\\(Paths.state.path)",', 'start', ['C11.site']],
  ['stub-t-to-site', 'stub/harness_router.js', "if (url.pathname === '/t') return env.TABLE_SERVER.fetch(request);", "if (url.pathname === '/tt') return env.TABLE_SERVER.fetch(request);", 'start', ['C11.t']],
  ['stub-presence-public', 'stub/router.js', "    return harness.fetch(request, env);", "    if (url.pathname === '/program/presence') return Response.json({ v: 1, players: 0 });\n    return harness.fetch(request, env);", 'start', ['C12.not-public']],
  ['stub-presence-shape', 'stub/inner.js', 'return Response.json({ v: 1, players }', 'return Response.json({ players }', 'start', ['C12.internal']],
  ['stub-presence-zero', 'stub/inner.js', 'if (r.ok) players = Number((await r.json()).players) || 0;', 'if (r.ok) players = 0;', 's4', ['C12.count:close', 'C12.count:quit']],
  ['stub-presence-one', 'stub/inner.js', 'if (r.ok) players = Number((await r.json()).players) || 0;', 'if (r.ok) players = 1;', 'close', ['C12.gm-alone:close', 'C12.gm-alone:quit']],
  ['do-disk-kept', 'Sources/Server.swift', 'try? fm.removeItem(at: Paths.doDisk)', '// do-disk kept', 'start', ['C11.do-disk']],
  ['rfc1918-open', 'Sources/Lan.swift', 'if p[0] == 10 { return true }', 'return true', 'lan', ['C7.2.private:100.64.0.5', 'C7.2.private:172.32.0.1', 'C7.2.private:8.8.8.8']],
  ['no-watch', 'Sources/Lan.swift', 'let t = Timer(timeInterval: 10, repeats: true) { [weak self] _ in self?.check() }', 'let t = Timer(timeInterval: 1000, repeats: true) { _ in }', 'lan', ['S2.state', 'S2.returns', 'C7.2.system']],
  ['slow-backstop', 'Sources/Lan.swift', 'let t = Timer(timeInterval: 10, repeats: true)', 'let t = Timer(timeInterval: 25, repeats: true)', 'lan', ['C11.backstop']],
  ['system-blind', 'Sources/Lan.swift', 'guard let store = SCDynamicStoreCreate(nil, "Holocron" as CFString, nil, nil),', 'guard Bool(false), let store = SCDynamicStoreCreate(nil, "Holocron" as CFString, nil, nil),', 'lan', ['C7.2.system']],
  ['copy-wrong', 'Sources/Window.swift', 'NSPasteboard.general.setString(origin, forType: .string)', 'NSPasteboard.general.setString(Program.localURL, forType: .string)', 'buttons', ['S1.copy-button']],
  ['open-button-lan', 'Sources/main.swift', 'w.onOpen = { [weak self] in self?.openBrowser(URL(string: Program.localURL)!) }', 'w.onOpen = { [weak self] in self?.openBrowser(URL(string: (self?.lan.origin ?? "") + "/")!) }', 'buttons', ['C7.1.open-button']],
  ['no-single', 'Sources/main.swift', 'return flock(lockFD, LOCK_EX | LOCK_NB) == 0', 'return true', 's6', ['S6.no-second', 'S6.forward']],
  ['reopen-restarts', 'Sources/main.swift', 'if phase == "running" { openBrowser(URL(string: Program.localURL)!) }', 'if phase == "running" { server.stop(); _ = server.start(lan: lan); openBrowser(URL(string: Program.localURL)!) }', 's6', ['S6.one-server']],
  ['never-ask', 'Sources/main.swift', 'if let n = n, n >= 1 {', 'if let n = n, n >= 99 {', 's4', ['S4.ask:close', 'S4.ask:quit']],
  ['always-ask', 'Sources/main.swift', 'if let n = n, n >= 1 {', 'if let n = n, n >= 0 {', 'close', ['C12.no-ask:close', 'C12.no-ask:quit']],
  ['keep-stops', 'Sources/Window.swift', 'answer(resp == .alertSecondButtonReturn)', 'answer(true)', 's4', ['S4.keep:close', 'S4.keep:quit']],
  ['stop-hangs', 'Sources/Window.swift', 'answer(resp == .alertSecondButtonReturn)', 'answer(false)', 's4', ['S4.stop:close', 'S4.stop:quit']],
  ['exit-leaves-workerd', 'Sources/main.swift', '        stopServer()\n        Log.write("Holocron stopped")', '        Log.write("Holocron stopped")', 's4,close,sig', ['C14.freed:close', 'C14.freed0:close', 'C14.freed0:quit', 'C14.sigterm', 'teardown.*']],
  ['stop-skipped', 'Sources/main.swift', '        report()\n        server.stop()\n', '        report()\n', 's4', ['C14.freed:close', 'C14.freed:quit']],
  ['hard-kill-first', 'Sources/Server.swift', '        kill(pid, SIGTERM)\n        var gone', '        kill(pid, SIGKILL)\n        var gone', 's4', ['C14.graceful:close', 'C14.graceful:quit']],
  ['sigterm-default', 'Sources/main.swift', 'for s in [SIGTERM, SIGINT, SIGHUP] {', 'for s in [SIGINT, SIGHUP] {', 'sig', ['C14.sigterm']],
  ['no-reclaim', 'Sources/Server.swift', '        Server.reclaimOrphan()\n        if Server.portHeld', '        if Server.portHeld', 'orphan', ['C14.reclaim']],
  ['reclaim-anyone', 'Sources/Server.swift', 'guard exe == ours else {', 'guard exe == ours || true else {', 's5', ['C14.never-kills:foreign-pid', 'S5.state:foreign-pid']],
  ['no-precheck', 'Sources/Server.swift', 'if Server.portHeld(Build.port) {', 'if Bool(false) {', 's5', ['S5.state:wildcard', 'S5.state:loopback']],
  ['other-port', 'Sources/Server.swift', 'if Server.portHeld(Build.port) { Log.write("port \\(Build.port) is held by another program"); return .portTaken }', 'if Server.portHeld(Build.port) { internalPort = 0; _ = Server.spawn(Paths.workerd.path, ["workerd", "serve", Paths.config.path, "--socket-addr", "http=*:8251", "--socket-addr", "internal=127.0.0.1:0", "-d", "site=\\(Paths.site.path)", "-d", "state=\\(Paths.state.path)", "-d", "do-disk=\\(Paths.doDisk.path)"], cwd: Paths.config.deletingLastPathComponent().path, log: Paths.log.path); return .portTaken }', 's5', ['S5.nothing:wildcard', 'S5.nothing:loopback', 'S5.nothing:foreign-pid']],
  ['kill-holder', 'Sources/Server.swift', 'if Server.portHeld(Build.port) { Log.write("port \\(Build.port) is held by another program"); return .portTaken }', 'if Server.portHeld(Build.port) { let k = Process(); k.executableURL = URL(fileURLWithPath: "/bin/sh"); k.arguments = ["-c", "kill $(lsof -t -iTCP:8250 -sTCP:LISTEN)"]; try? k.run(); k.waitUntilExit(); return .portTaken }', 's5', ['C14.never-kills:wildcard', 'C14.never-kills:loopback', 'C14.never-kills:foreign-pid']],
  ['no-sigint', 'Sources/Server.swift', '            kill(pid, SIGINT)\n', '', 's4', ['C14.graceful:close', 'C14.graceful:quit']],
  ['ok-stays', 'Sources/Window.swift', '@objc private func okPressed() { onClose?() }', '@objc private func okPressed() { }', 's5', ['S5.ok:wildcard', 'S5.ok:loopback', 'S5.ok:foreign-pid']],
  ['version-wrong', 'Sources/Constants.swift', '(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0"', '"0.9.0"', 'update', ['C13.version']],
  ['never-newer', 'Sources/Update.swift', 'let mine = numbers(own), newer(theirs, than: mine),', 'let mine = numbers(own), newer(theirs, than: mine), Bool(false),', 'update', ['C13.newer', 'S3.copy', 'S3.get-it']],
  ['get-it-dead', 'Sources/Window.swift', '@objc private func getItPressed() { if let p = updatePage { onOpenURL?(p) } }', '@objc private func getItPressed() { }', 'update', ['S3.get-it']],
  ['same-is-newer', 'Sources/Update.swift', 'let mine = numbers(own), newer(theirs, than: mine),', 'let mine = numbers(own), newer(theirs, than: mine) || theirs == mine,', 'update', ['C13.no-line:same']],
  ['any-differs', 'Sources/Update.swift', 'let mine = numbers(own), newer(theirs, than: mine),', 'let mine = numbers(own), theirs != mine,', 'update', ['C13.no-line:older']],
  ['http-page-ok', 'Sources/Update.swift', 'page.scheme == "https", !releaseHost.isEmpty,', '(page.scheme == "https" || page.scheme == "http"), !releaseHost.isEmpty,', 'update', ['C13.no-line:http-page']],
  ['any-host', 'Sources/Update.swift', 'page.host?.lowercased() == releaseHost.lowercased()', 'page.host != nil', 'update', ['C13.no-line:other-host']],
  ['any-v', 'Sources/Update.swift', '              (obj["v"] as? Int) == 1,\n', '', 'update', ['C13.no-line:bad-v']],
  ['loose-version', 'Sources/Update.swift', 'let parts = v.split(separator: ".", omittingEmptySubsequences: false)', 'let parts = (v.split(separator: "-").first ?? "").split(separator: ".", omittingEmptySubsequences: false)', 'update', ['C13.no-line:bad-version']],
  ['garbage-shows', 'Sources/Update.swift', 'if offer == nil { Log.write("update check: no line") }', 'if offer == nil, let d = data, !d.isEmpty, (try? JSONSerialization.jsonObject(with: d)) == nil { offer = UpdateOffer(version: "?", page: URL(string: "https://x")!) }\n            if offer == nil { Log.write("update check: no line") }', 'update', ['C13.no-line:garbage']],
  ['any-status', 'Sources/Update.swift', 'h.statusCode == 200, let data = data {', 'h.statusCode > 0, let data = data {', 'update', ['C13.no-line:500']],
  ['long-timeout', 'Sources/Update.swift', 'cfg.timeoutIntervalForRequest = 5\n        cfg.timeoutIntervalForResource = 5', 'cfg.timeoutIntervalForRequest = 9\n        cfg.timeoutIntervalForResource = 9', 'update', ['C13.timeout']],
  ['start-waits', 'Sources/main.swift', 'let result = self.server.start(lan: self.lan)', 'let result = self.server.start(lan: self.lan); let sem = DispatchSemaphore(value: 0); DispatchQueue.main.async { UpdateCheck.run { _ in sem.signal() } }; _ = sem.wait(timeout: .now() + 8)', 'update', ['C13.not-blocking']],
  ['empty-sends', 'Sources/Update.swift', 'let raw = Hooks.latestURL ?? Build.latestURL', 'var raw = Hooks.latestURL ?? Build.latestURL; if raw.isEmpty { raw = ProcessInfo.processInfo.environment["HOLOCRON_BITE_URL"] ?? "" }', 'update', ['C13.empty']],
  ['twice', 'Sources/Update.swift', '        }.resume()\n    }', '        }.resume()\n        URLSession(configuration: .ephemeral).dataTask(with: req).resume()\n    }', 'update', ['C13.one-get']],
  ['post-body', 'Sources/Update.swift', 'req.httpMethod = "GET"', 'req.httpMethod = "POST"; req.httpBody = "x".data(using: .utf8)', 'update', ['C13.one-get', 'C13.no-body']],
  ['cookie', 'Sources/Update.swift', 'req.setValue("Holocron", forHTTPHeaderField: "User-Agent")', 'req.setValue("Holocron", forHTTPHeaderField: "User-Agent"); req.setValue("id=1", forHTTPHeaderField: "Cookie")', 'update', ['C13.no-cookie']],
  ['query', 'Sources/Update.swift', 'comps.query = nil', 'comps.query = "v=\\(Program.version)"', 'update', ['C13.no-query']],
  ['default-ua-2', 'Sources/Update.swift', 'req.setValue("Holocron", forHTTPHeaderField: "User-Agent")', 'req.setValue("Holocron/\\(Program.version)", forHTTPHeaderField: "User-Agent")', 'update', ['C13.ua', 'C13.no-version']],
];

// Windows (ADDENDUM 7 §2): the two mutants the planted-orphan and Job Object asserts are owed; ADDENDUM 12's stop mutant
const MW = [
  ['win-job-off', 'Sources/Server.cs', 'info.BasicLimitInformation.LimitFlags = Native.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;', 'info.BasicLimitInformation.LimitFlags = 0;', 'job', ['C14.job']],
  ['win-no-reclaim', 'Sources/Server.cs', '        ReclaimOrphan();\n        if (PortHeld', '        if (PortHeld', 'orphan', ['C14.reclaim']],
  // ADDENDUM 12: neither event is sent (each send "succeeds" unsent), so every stop waits out the 5 s kill
  ['win-no-stop', 'Sources/Server.cs', '    static bool CtrlEvent(int pid, int ev)\n    {\n', '    static bool CtrlEvent(int pid, int ev)\n    {\n        if (pid > 0) return true;\n', 's4', ['C14.graceful:close', 'C14.graceful:quit']],
];

const only = o.only ? new Set(o.only.split(',')) : null;
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-bite-'));
const report = [];
for (const [id, file, find, replace, group, want] of (WIN ? MW : M)) {
  if (only && !only.has(id)) continue;
  if (!want.length) continue;   // a combined mutant: its partner carries the asserts
  const dir = path.join(base, id);
  const src = path.join(dir, 'Sources'), serve = path.join(dir, 'serve');
  fs.cpSync(path.join(MAC, 'Sources'), src, { recursive: true });
  if (!WIN) fs.cpSync(SERVE, serve, { recursive: true });
  const target = file.startsWith('Sources/') ? path.join(src, file.slice(8)) : path.join(serve, file.slice(5));
  const text = fs.readFileSync(target, 'utf8');
  const count = text.split(find).length - 1;
  if (count !== 1) { report.push({ id, verdict: 'BAD MUTANT', why: `find occurs ${count}×` }); console.log(`✗ ${id}: find occurs ${count}×`); continue; }
  fs.writeFileSync(target, text.replace(find, replace));
  const b = WIN
    ? spawnSync(process.execPath, [path.join(MAC, 'build.mjs'), '--sources', src, '--serve', SERVE, '--site', SITE, '--workerd', o.workerd, '--icons', o.icons, '--out', dir], { encoding: 'utf8' })
    : spawnSync(process.execPath, [path.join(MAC, 'build.mjs'), '--sources', src, '--serve', serve, '--site', SITE, '--out', dir], { encoding: 'utf8' });
  if (b.status !== 0) { report.push({ id, verdict: 'BAD MUTANT', why: 'build failed: ' + (b.stderr || b.stdout).slice(-400) }); console.log(`✗ ${id}: build failed`); continue; }
  const resFile = path.join(dir, 'results.json');
  const exe = WIN ? path.join(dir, 'Holocron', 'Holocron.exe') : path.join(dir, 'Holocron.app', 'Contents', 'MacOS', 'Holocron');
  spawnSync(process.execPath, [path.join(HERE, 'run.mjs'), '--launcher', exe, '--serve', WIN ? 'real' : 'stub', '--only', group, '--results', resFile], { encoding: 'utf8' });
  let res = [];
  try { res = JSON.parse(fs.readFileSync(resFile, 'utf8')); } catch (e) {}
  const red = new Set(res.filter((x) => !x.ok).map((x) => x.id));
  const hit = (w) => (w.endsWith('*') ? [...red].some((x) => x.startsWith(w.slice(0, -1))) : red.has(w));
  const ran = new Set(res.map((x) => x.id));
  const seen = (w) => (w.endsWith('*') ? [...ran].some((x) => x.startsWith(w.slice(0, -1))) : ran.has(w));
  // ADDENDUM 13: an owed assert the mutant's run never reached is UNMEASURED, never "still green"
  const absent = want.filter((w) => !seen(w));
  const missed = want.filter((w) => seen(w) && !hit(w));
  const verdict = absent.length ? 'UNMEASURED' : res.length && !missed.length ? 'BIT' : 'DID NOT BITE';
  // ADDENDUM 14: a group that crashed under the mutant keeps its stack, so the reading says why
  const crashed = res.filter((x) => !x.ok && x.id.endsWith('.crashed')).map((x) => ({ id: x.id, detail: String(x.detail || '').slice(0, 2000) }));
  report.push({ id, group, want, red: [...red], missed, absent, verdict, crashed });
  console.log(`${verdict === 'BIT' ? '✓' : '✗'} ${id} → ${verdict}${missed.length ? ' · still green: ' + missed.join(', ') : ''}${absent.length ? ' · never checked: ' + absent.join(', ') : ''} · red: ${[...red].join(', ')}`);
  for (const c of crashed) console.log(`  ${c.id}: ${c.detail.split('\n').slice(0, 6).join(' | ')}`);
  // a mutant may leave a process behind (other-port's second workerd): stop exactly those pids, by their executable
  const tmpd = os.tmpdir();
  for (const p of processes()) {
    if (p.command.includes(path.join(dir, WIN ? 'Holocron' : 'Holocron.app')) || p.command.includes(path.join(tmpd, 'holocron-server-'))) { try { process.kill(p.pid, 'SIGKILL'); } catch (e) {} }
  }
  for (const f of fs.readdirSync(tmpd)) if (f.startsWith('holocron-server-')) fs.rmSync(path.join(tmpd, f), { force: true });
  fs.rmSync(path.join(dir, WIN ? 'Holocron' : 'Holocron.app'), { recursive: true, force: true });
}

// coverage: every assert the clean suite runs is bitten by some mutant
const bitten = new Set(report.filter((r) => r.verdict === 'BIT').flatMap((r) => r.want));
const runSrc = fs.readFileSync(path.join(HERE, 'run.mjs'), 'utf8');
const ids = [...runSrc.matchAll(/check\(\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1]).filter((x) => !x.startsWith('pre.'));
const expand = (id) => id.includes('${when}') ? ['teardown.*']
  : id.includes('${road}') ? ['close', 'quit'].map((r) => id.replace('${road}', r))
  : id.includes('${name}') ? (id.startsWith('C13') ? ['same', 'older', 'http-page', 'other-host', 'bad-v', 'bad-version', 'garbage', '500'] : ['wildcard', 'loopback', 'foreign-pid']).map((n) => id.replace('${name}', n))
    : id.includes('${ip}') ? ['100.64.0.5', '172.32.0.1', '8.8.8.8'].map((n) => id.replace('${ip}', n)) : [id];
const NOT_THIS_OS = WIN ? ['C14.sigterm', 'C7.2.system'] : ['C14.job'];
const all = ids.flatMap(expand).filter((x) => !x.endsWith('.crashed') && !NOT_THIS_OS.includes(x));
const unbitten = only ? [] : all.filter((x) => !bitten.has(x));
const bad = report.filter((r) => r.verdict !== 'BIT');
console.log(`\nBITE ${report.length - bad.length}/${report.length} mutants bit · asserts bitten ${all.length - unbitten.length}/${all.length}${unbitten.length ? ' · NEVER BITTEN: ' + unbitten.join(', ') : ''}`);
if (o.out) fs.writeFileSync(o.out, JSON.stringify({ report, unbitten, asserts: all.length }, null, 1));
fs.rmSync(base, { recursive: true, force: true });
let held = [];
try { held = (await import('./lib.mjs')).on(8250); } catch (e) {}
console.log('lsof -iTCP:8250 after the bite run: ' + (held.length ? JSON.stringify(held) : 'empty'));
process.exit(bad.length || unbitten.length ? 1 : 0);
