#!/usr/bin/env node
/* test/argo_a4_join_url.cjs — A4-C7.3, the QR's link in the Holocron program (ruling `argo-a4-table-spike` ADDENDUM 2
 * A2.3; card `argo-a4-launcher-build` §4.1; B-1897), on lib/shared/tableSession.js in a vm with a stand-in location and
 * fetch for /program/lan.json.
 *
 * J1  '@origin' on a loopback page (localhost, 127.0.0.1, [::1]): null until lan.json answers (the QR waits, no wrong
 *     link meanwhile); then the published origin + '/player/join#' + code; lan.json is asked with no-store
 * J2  '@origin' on loopback with no address: origin '' → ''; a failed fetch, garbage, v ≠ 1, and a published loopback
 *     or non-IPv4 origin → '' (no QR from a loopback address, ever)
 * J3  the address returns: within 5 s of re-asking, '' becomes the link (the sheet redraws with the QR)
 * J4  '@origin' on the LAN host (http://192.168.1.65:8250): this page's origin, as A4-C2 built it; lan.json never read
 * J5  holocron.work's setting: 'https://holocron.work/player/join#' + code on every host; lan.json never read
 *
 *   node test/argo_a4_join_url.cjs   ·   node test/argo_a4_join_url.cjs --bite   (each mutant on a copy must turn it red)
 * Exit 0 green · 1 a red · 3 crashed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TS_SRC = process.env.A4_TS || path.join(ROOT, 'lib/shared/tableSession.js');
const MUTANTS = [   // [name, find, replace, the check that must go red]
  ['loopback-ignored', "if (serverHost() === ORIGIN && loopback()) {", "if (false) {", 'J1'],
  ['pending-as-none', "return o == null ? null : o && o + '/player/join#' + code;", "return o == null ? '' : o && o + '/player/join#' + code;", 'J1'],
  ['loopback-published', "&& !/^http:\\/\\/127\\./.test(o) ? o : '';", "? o : '';", 'J2'],
  ['never-re-read', 'if (now() - lanAt >= 5000 &&', 'if (!lanAt &&', 'J3'],
  ['lan-host-moved', "(serverHost() === ORIGIN ? loc().origin : 'https://holocron.work')", "(serverHost() === ORIGIN ? 'http://x' : 'https://holocron.work')", 'J4'],
  ['live-join-moved', "'https://holocron.work') + '/player/join#'", "'https://holocron.work') + '/join#'", 'J5'],
];
process.on('unhandledRejection', (e) => { console.error('CRASH ' + (e && e.stack || e)); process.exit(3); });

if (process.argv.includes('--bite')) {
  const src = fs.readFileSync(TS_SRC, 'utf8');
  let bad = 0;
  for (const [name, find, put, leg] of MUTANTS) {
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joinurl-')), f = path.join(dir, 'tableSession.js');
    fs.writeFileSync(f, src.replace(find, put));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { A4_TS: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT    ' : '  MISSED ') + name.padEnd(20) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, info) { if (ok) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (info !== undefined ? '  ->  ' + JSON.stringify(info).slice(0, 300) : '')); } }
const SRC = fs.readFileSync(TS_SRC, 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

// a session under `host` (TABLE_SERVER_HOST) on `origin`, its lan.json answered by `answer()` (a body, or a throw)
function session(host, origin, answer) {
  const u = new URL(origin), calls = [];
  let clock = 1e12;
  const fakeDate = { now: () => clock };
  const ctx = { console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Date: fakeDate,
    SWRPGSiteSettings: { TABLE_SERVER_HOST: host },
    location: { hostname: u.hostname, host: u.host, protocol: u.protocol, origin: u.origin },
    fetch: (url, init) => { calls.push({ url, init }); return Promise.resolve().then(() => { const b = answer(); return { json: () => Promise.resolve().then(() => JSON.parse(b)) }; }); } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'tableSession.js' });
  return { T: ctx.SWRPGTableSession, calls, later: (ms) => { clock += ms; } };
}
const CODE = '7KQ-M4R';

(async () => {
  console.log('[J1 loopback, an address]');
  for (const origin of ['http://localhost:8250', 'http://127.0.0.1:8250', 'http://[::1]:8250']) {
    const s = session('@origin', origin, () => '{"v":1,"origin":"http://192.168.1.23:8250"}');
    check('J1 ' + origin + ': null while lan.json is unread', s.T.joinUrl(CODE) === null, s.T.joinUrl(CODE));
    await tick(); await tick(); await tick();
    check('J1 ' + origin + ': then the published origin\'s JOIN', s.T.joinUrl(CODE) === 'http://192.168.1.23:8250/player/join#' + CODE, s.T.joinUrl(CODE));
    check('J1 ' + origin + ': lan.json asked same-origin, no-store', s.calls.length >= 1 && s.calls[0].url === '/program/lan.json' && s.calls[0].init && s.calls[0].init.cache === 'no-store', s.calls);
  }

  console.log("[J2 loopback, no address → '']");
  const none = [['origin ""', () => '{"v":1,"origin":""}'], ['a failed fetch', () => { throw new Error('refused'); }], ['garbage', () => '{"v":1,'],
    ['v 2', () => '{"v":2,"origin":"http://192.168.1.23:8250"}'], ['a published loopback', () => '{"v":1,"origin":"http://127.0.0.1:8250"}'],
    ['a published name', () => '{"v":1,"origin":"http://holocron.local:8250"}'], ['https', () => '{"v":1,"origin":"https://192.168.1.23:8250"}']];
  for (const [label, answer] of none) {
    const s = session('@origin', 'http://localhost:8250', answer);
    s.T.joinUrl(CODE); await tick(); await tick(); await tick();
    check("J2 " + label + " → ''", s.T.joinUrl(CODE) === '', s.T.joinUrl(CODE));
  }

  console.log('[J3 the address returns]');
  let body = '{"v":1,"origin":""}';
  const back = session('@origin', 'http://localhost:8250', () => body);
  back.T.joinUrl(CODE); await tick(); await tick(); await tick();
  const was = back.T.joinUrl(CODE);
  body = '{"v":1,"origin":"http://192.168.1.40:8250"}';
  back.later(1000); back.T.joinUrl(CODE); await tick(); await tick(); await tick();
  const early = back.T.joinUrl(CODE);
  back.later(4000); back.T.joinUrl(CODE); await tick(); await tick(); await tick();
  check("J3 '' at first, still '' 1 s later (one read per 5 s), the link once 5 s have passed", was === '' && early === '' && back.T.joinUrl(CODE) === 'http://192.168.1.40:8250/player/join#' + CODE, [was, early, back.T.joinUrl(CODE)]);

  console.log('[J4 the LAN host]');
  const lanHost = session('@origin', 'http://192.168.1.65:8250', () => { throw new Error('never asked'); });
  check("J4 '@origin' on http://192.168.1.65:8250 → that origin's JOIN, lan.json never read", lanHost.T.joinUrl(CODE) === 'http://192.168.1.65:8250/player/join#' + CODE && lanHost.calls.length === 0, [lanHost.T.joinUrl(CODE), lanHost.calls.length]);

  console.log("[J5 holocron.work's setting]");
  for (const origin of ['https://holocron.work', 'http://localhost:3102']) {
    const s = session('holocron-table-server.example.test', origin, () => { throw new Error('never asked'); });
    check("J5 a named host on " + origin + " → holocron.work's JOIN, lan.json never read", s.T.joinUrl(CODE) === 'https://holocron.work/player/join#' + CODE && s.calls.length === 0, s.T.joinUrl(CODE));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
