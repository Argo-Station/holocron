#!/usr/bin/env node
/* test/program_router.cjs — the Holocron program's front router, program/serve/router.js (ruling `argo-a4-launcher-build`
 * §3 A4-C11, card §4.1; B-1892), driven in node with stand-in services (the disk services' own behaviour, and the whole
 * config under workerd, are the gate's dry run on port 8250).
 *
 * R1  /program/lan.json is state/lan.json VERBATIM, application/json, cache-control no-store
 * R2  a missing lan.json, a garbage one, and a STATE service that throws → {"v":1,"origin":""}, still no-store
 * R3  exactly /t goes to the table service, the request unchanged (upgrade header, query); /t/ and /tx do not
 * R4  any other /program/ path is 404 and never reaches the site or the table (A4-C12's count is internal-only)
 * R5  MIME by extension (.js, .css, .svg, .json, .webmanifest, .woff2), over the disk service's octet-stream
 * R6  the single-page fallback: /player/join and /gm/campaigns read their app's shell; / reads /index.html; a missing
 *     file WITH an extension stays 404; POST is 405
 *
 *   node test/program_router.cjs   ·   node test/program_router.cjs --bite   (each mutant on a copy must turn it red)
 * Exit 0 green · 1 a red · 3 crashed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = process.env.PROGRAM_ROUTER || path.join(ROOT, 'program/serve/router.js');
const COPY_NAME = path.basename(SRC).replace(/\.js$/, '') + '.mjs';   // a scratch copy's name, so node reads ES syntax
const MUTANTS = [
  ['lan-cached', "'cache-control': 'no-store'", "'cache-control': 'max-age=60'", 'R1'],
  ['lan-garbage-passed', 'JSON.parse(text); body = text;', 'body = text;', 'R2'],
  ['t-prefix', "if (url.pathname === '/t') return env.TABLE_SERVER.fetch(request);", "if (url.pathname.startsWith('/t')) return env.TABLE_SERVER.fetch(request);", 'R3'],
  ['program-to-site', "if (url.pathname.startsWith('/program/')) return new Response('not found', { status: 404 });", '', 'R4'],
  ['mime-dropped', "css: 'text/css; charset=utf-8', ", '', 'R5'],
  ['no-fallback', "if (res.status === 404 && !/\\.[a-z0-9]+$/i.test(url.pathname))", 'if (false)', 'R6'],
];
process.on('unhandledRejection', (e) => { console.error('CRASH ' + (e && e.stack || e)); process.exit(3); });

if (process.argv.includes('--bite')) {
  const src = fs.readFileSync(SRC, 'utf8');
  let bad = 0;
  for (const [name, find, put, leg] of MUTANTS) {
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-mutant-')), f = path.join(dir, COPY_NAME);
    fs.writeFileSync(f, src.replace(find, put));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { PROGRAM_ROUTER: f }), encoding: 'utf8' });
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

// stand-in services: the site a map of path → body (octet-stream, as workerd's disk service answers), the state one file
const SITE = { '/index.html': 'ROOT SHELL', '/player/index.html': 'PLAYER SHELL', '/gm/index.html': 'GM SHELL', '/lib/a.js': 'js',
  '/s.css': 'css', '/i.svg': 'svg', '/d.json': '{}', '/manifest.webmanifest': '{}', '/f.woff2': 'font' };
function env(lanBody, opts) {
  const seen = { site: [], table: [] };
  return { seen,
    SITE: { fetch: async (req) => { const p = new URL(req.url).pathname; seen.site.push(p);
      return p in SITE ? new Response(SITE[p], { headers: { 'content-type': 'application/octet-stream' } }) : new Response('nf', { status: 404 }); } },
    STATE: { fetch: async () => { if (opts && opts.throws) throw new Error('disk gone'); return lanBody == null ? new Response('nf', { status: 404 }) : new Response(lanBody); } },
    TABLE_SERVER: { fetch: async (req) => { seen.table.push(req); return new Response('table', { status: 200 }); } },
  };
}
const get = (p, init) => new Request('http://192.168.1.23:8250' + p, init);

(async () => {
  // an .mjs copy, so node reads it as the ES module workerd does (the repo's package.json has no "type")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-')), copy = path.join(dir, COPY_NAME);
  fs.copyFileSync(SRC, copy);
  const router = (await import(pathToFileURL(copy).href)).default;
  fs.rmSync(dir, { recursive: true, force: true });
  const go = async (e, p, init) => router.fetch(get(p, init), e);

  console.log('[R1 lan.json verbatim]');
  const body = '{"v":1,"origin":"http://192.168.1.23:8250"}';
  let r = await go(env(body), '/program/lan.json');
  check('R1 the body is state/lan.json byte for byte', (await r.text()) === body);
  check('R1 application/json and cache-control no-store', /application\/json/.test(r.headers.get('content-type')) && r.headers.get('cache-control') === 'no-store', [r.headers.get('content-type'), r.headers.get('cache-control')]);

  console.log('[R2 no address]');
  for (const [label, e] of [['missing', env(null)], ['garbage', env('{"v":1,"origin":')], ['a throwing STATE', env('', { throws: true })]]) {
    r = await go(e, '/program/lan.json');
    check('R2 ' + label + ' → {"v":1,"origin":""}, no-store', (await r.text()) === '{"v":1,"origin":""}' && r.headers.get('cache-control') === 'no-store');
  }

  console.log('[R3 exactly /t]');
  let e = env(null);
  const up = get('/t?code=ABC123', { headers: { Upgrade: 'websocket' } });
  r = await router.fetch(up, e);
  check('R3 /t?code= reaches the table service, the same request object', e.seen.table.length === 1 && e.seen.table[0] === up);
  for (const p of ['/t/', '/tx', '/table']) { e = env(null); await go(e, p); check('R3 ' + p + ' never reaches the table service', e.seen.table.length === 0); }

  console.log('[R4 /program/ is internal-only]');
  for (const p of ['/program/presence', '/program/', '/program/x.json']) {
    e = env(null); r = await go(e, p);
    check('R4 ' + p + ' → 404, touching neither the site nor the table', r.status === 404 && !e.seen.site.length && !e.seen.table.length, { status: r.status, site: e.seen.site });
  }

  console.log('[R5 MIME]');
  for (const [p, t] of [['/lib/a.js', 'text/javascript'], ['/s.css', 'text/css'], ['/i.svg', 'image/svg+xml'], ['/d.json', 'application/json'], ['/manifest.webmanifest', 'application/manifest+json'], ['/f.woff2', 'font/woff2'], ['/', 'text/html']]) {
    r = await go(env(null), p);
    check('R5 ' + p + ' is ' + t, r.status === 200 && (r.headers.get('content-type') || '').startsWith(t), r.headers.get('content-type'));
  }

  console.log('[R6 the single-page fallback]');
  for (const [p, shell] of [['/player/join', 'PLAYER SHELL'], ['/gm/campaigns', 'GM SHELL'], ['/', 'ROOT SHELL'], ['/nowhere', 'ROOT SHELL']]) {
    r = await go(env(null), p);
    check('R6 ' + p + ' reads ' + shell + ' as text/html', r.status === 200 && (await r.text()) === shell && /text\/html/.test(r.headers.get('content-type')));
  }
  r = await go(env(null), '/lib/missing.js');
  check('R6 a missing file with an extension stays 404', r.status === 404, r.status);
  r = await go(env(null), '/player/join', { method: 'POST', body: 'x' });
  check('R6 POST is 405', r.status === 405, r.status);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
