// router.js — the Holocron program's front router (ruling `argo-a4-launcher-build` §3 A4-C11; holocron.capnp's `http`).
//   exactly /t          → the table server, unchanged (A4-C4)
//   /program/lan.json   → the launcher's state/lan.json VERBATIM (A4-C7.2), always no-store; a missing or unparseable
//                         file answers {"v":1,"origin":""}
//   any other /program/ → 404 (the table server's /program/presence is read on the internal socket only, A4-C12)
//   everything else     → the built site, GET/HEAD only: a directory reads its index.html, each file is typed by its
//                         extension (the disk service answers application/octet-stream), and an extensionless app path
//                         with no file reads its app's shell, as serve.py does (B-1892, from G5's measured harness)
const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', wasm: 'application/wasm', map: 'application/json', xml: 'application/xml',
  csv: 'text/csv; charset=utf-8', md: 'text/plain; charset=utf-8', mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm',
};
const NO_ADDRESS = '{"v":1,"origin":""}';

function typed(res, path) {
  const ext = (/\.([a-z0-9]+)$/i.exec(path) || [])[1];
  const t = ext && MIME[ext.toLowerCase()];
  if (!t || !res.ok) return res;
  const h = new Headers(res.headers); h.set('content-type', t);
  return new Response(res.body, { status: res.status, headers: h });
}
function shellOf(p) {
  for (const app of ['player', 'gm', 'dice', 'account']) if (p.startsWith('/' + app + '/')) return '/' + app + '/index.html';
  return '/index.html';
}
async function lan(env) {
  let body = NO_ADDRESS;
  try {
    const r = await env.STATE.fetch('http://state/lan.json');
    if (r.ok) { const text = await r.text(); JSON.parse(text); body = text; }
  } catch (e) { /* missing or garbage: no address */ }
  return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/t') return env.TABLE_SERVER.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    if (url.pathname === '/program/lan.json') return lan(env);
    if (url.pathname.startsWith('/program/')) return new Response('not found', { status: 404 });
    const read = (p) => env.SITE.fetch(new Request(new URL(p, url.origin), { method: request.method }));
    let path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    let res = await read(path);
    if (res.status === 404 && !/\.[a-z0-9]+$/i.test(url.pathname)) { path = shellOf(url.pathname); res = await read(path); }
    return typed(res, path);
  },
};
