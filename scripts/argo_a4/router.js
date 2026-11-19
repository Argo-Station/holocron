// router.js — A4-C4's measurement router (site.capnp): exactly the path /t goes to the table server, unchanged; every
// other path is the built site from the read-only disk service. A directory path reads its index.html. MEASURED, NOT
// BUILT: the launcher card chooses the program's real mechanism (ruling `argo-a4-table-spike` §4 step 2).
// G5's harness additions (ruling `argo-a4-wifi-client` §3 G5; instrument code only, B-1892 stays open for the launcher):
// a minimal MIME map by extension (the disk service answers application/octet-stream, which a browser refuses for a
// stylesheet) and a single-page fallback (an extensionless app path with no file reads its app's shell, as serve.py's).
const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', wasm: 'application/wasm', map: 'application/json',
};
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
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/t') return env.TABLE_SERVER.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    const read = (p) => env.SITE.fetch(new Request(new URL(p, url.origin), { method: request.method }));
    let path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    let res = await read(path);
    if (res.status === 404 && !/\.[a-z0-9]+$/i.test(url.pathname)) { path = shellOf(url.pathname); res = await read(path); }
    return typed(res, path);
  },
};
