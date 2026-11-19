// B-1912 (ruling release-r7-bug-burndown ADDENDUM 764): every script URL a page asks for reaches the real file on Pages.
// `_redirects` is first-match-wins and ends `/*  /  200`; a 200 rewrite beats an existing file, so a /dist/lib/ script with
// no rule of its own is answered with the landing shell as text/html (babel-lap1, 2026-06-16). serve.py ignores _redirects,
// so no browser suite here can see it, and guard_b213 / guard_b267 classify TRACKED paths only (dist/ is gitignored).
//
// Resolver: each rule `from to [code]` (code defaults to 302), tried top to bottom; `*` at the end of `from` matches the
// rest of the path (the splat); a rule whose `to` keeps the splat (`/x/:splat` for `/x/*`) passes the file through. A URL
// is SERVED when no rule matches or its first match is a pass-through 200; any other first match (a shell rewrite or a
// redirect) is a red.
//   R1  every <script src> in the five shells (comments stripped; relative srcs resolve against `<base href="/">`)
//   R2  every URL in campaignsDoor.js's FILES, FIRST and QR
//   R3  every lib/ script string in product code and the shells' inline blocks (b1912_no_raw_lib_served's L3 reading)
//   BITES (in memory): (a) this file with its /dist/* line removed reds R1; (b) commercial's _redirects before B-1912
//   (git show <ref>:_redirects, default the merge-base with commercial) reds a /dist/ tag.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHELLS = ['player/index.html', 'gm/index.html', 'index.html', 'account/index.html', 'dice/index.html'];
let fail = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++; };

const rulesOf = (text) => text.split('\n').map((l) => l.split('#')[0].trim()).filter((l) => l.startsWith('/'))
  .map((l) => { const [from, to, code] = l.split(/\s+/); return { from, to, code: code || '302' }; });
const firstMatch = (rules, url) => rules.find((r) => r.from.endsWith('*') ? url.startsWith(r.from.slice(0, -1)) : url === r.from);
const served = (rules, url) => {
  const r = firstMatch(rules, url);
  if (!r) return null;
  const pass = r.code === '200' && (r.to === url || (r.from.endsWith('*') && r.to === r.from.slice(0, -1) + ':splat'));
  return pass ? null : `${url} → ${r.from} ${r.to} ${r.code}`;
};

(async () => {
  const { TRANSFORMS, rawLibFiles } = await import(path.join(ROOT, 'build/sources.mjs'));
  const abs = (u) => '/' + u.replace(/[?#].*$/, '').replace(/^\//, '');
  // R1 — the shells
  const tagUrls = SHELLS.flatMap((s) => [...rd(s).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map((m) => m[1]).filter((u) => !/^https?:/.test(u)).map(abs));
  // R2 — the door
  const ctx = { localStorage: { getItem: () => null }, document: {} }; ctx.window = ctx;
  vm.runInNewContext(rd('lib/shared/campaignsDoor.js'), ctx, { filename: 'lib/shared/campaignsDoor.js' });
  const D = ctx.SWRPGCampaignsDoor;
  const doorUrls = [...D.FILES, ...D.FIRST, D.QR].map(abs);
  // R3 — runtime loaders (comments stripped; effectClass's source citations are not URLs)
  const code = ['player/app.jsx', 'gm/app.jsx', ...TRANSFORMS.map((t) => t.in).filter((f) => f.startsWith('lib/')), ...rawLibFiles(ROOT)];
  const inline = (f) => [...rd(f).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n');
  const loaderUrls = [];
  for (const f of [...new Set(code), ...SHELLS]) {
    const out = esbuild.transformSync(f.endsWith('.html') ? inline(f) : rd(f), { loader: f.endsWith('.jsx') ? 'jsx' : 'js', minifyWhitespace: true, legalComments: 'none' }).code;
    for (const m of out.matchAll(/(file:|CR_FILE=)?["'`]((?:\/?dist\/)?\/?lib\/[\w./-]+\.js)["'`]/g)) if (!m[1]) loaderUrls.push(abs(m[2]));
  }

  const rules = rulesOf(rd('_redirects'));
  console.log('B-1912 — every script URL reaches the real file through _redirects (ADDENDUM 764)');
  for (const [label, urls] of [['R1 shell <script src>', tagUrls], ['R2 door FILES/FIRST/QR', doorUrls], ['R3 runtime loader', loaderUrls]]) {
    const bad = [...new Set(urls)].map((u) => served(rules, u)).filter(Boolean);
    ok(urls.length > 0 && bad.length === 0, `${label}: ${new Set(urls).size} URLs (${[...new Set(urls)].filter((u) => u.startsWith('/dist/')).length} under /dist/) served as files` + (bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''));
  }
  // BITE (a): the /dist/* line removed
  const minus = rulesOf(rd('_redirects').split('\n').filter((l) => !/^\/dist\/\*\s/.test(l)).join('\n'));
  const distTag = tagUrls.find((u) => u.startsWith('/dist/'));
  ok(!!distTag && !!served(minus, distTag), `BITE (a): without the /dist/* line, ${distTag} → ${served(minus, distTag)}`);
  // BITE (b): the pre-B-1912 _redirects (commercial before this lap) with a /dist/ tag
  let ref = process.env.B1912_REDIRECTS_REF;
  try { ref = ref || execFileSync('git', ['merge-base', 'HEAD', 'commercial'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { ref = null; }
  let old = null;
  try { old = execFileSync('git', ['show', ref + ':_redirects'], { cwd: ROOT, encoding: 'utf8' }); } catch (e) { old = null; }
  if (old && !/^\/dist\/\*/m.test(old)) ok(!!served(rulesOf(old), distTag), `BITE (b): _redirects at ${String(ref).slice(0, 9)} (no /dist/ line) answers ${distTag} with ${served(rulesOf(old), distTag)}`);
  else ok(true, `BITE (b) not measurable here: ${old ? 'the ref already carries /dist/*' : 'no ref readable'} (B1912_REDIRECTS_REF names one)`);
  console.log(`\nb1912_redirects_pass_dist: ${fail ? fail + ' FAILED' : 'all pass'}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
