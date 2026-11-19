// B-1912 (ruling release-r7-bug-burndown ADDENDUM 761 items 2–3): no page loads a hand-written lib/ .js from /lib/.
// The build writes a minified copy of each to dist/lib/<path>.js (build.mjs buildRawLib, build/sources.mjs
// rawLibFiles), and every loader names the copy. A RAW file still loaded from /lib/ ships its comments again, silently.
//
//   L1  every <script src> in the five shells resolves to a dist/ copy of a RAW source, a BUILT output or a non-lib file
//   L2  the same for campaignsDoor.js's FILES, FIRST and QR (run in a vm, as the census reads them)
//   L3  the same for every '/lib/…js' string left in product CODE and the shells' inline blocks (comments stripped by
//       esbuild first): the player's
//       PLAYER_PARTS, the GM's yard core, ruleTextLoad's SCRIPTS, sources.js's RULE_TEXT_FILES and any loader added later
//   L4  dist/lib/shared/siteSettings.js carries its source's TABLE_SERVER_HOST (the Surfacing Architect's answer to the
//       program/build.mjs STOP: a source edited after the build is caught wherever the edit comes from)
//   L5  when dist/ is built, every copy a loader names exists
//   BITE (in memory, nothing written): one shell tag put back to /lib/ reds L1; a door entry put back reds L2; a
//   siteSettings source whose host differs from its copy reds L4. A bite that stays green fails the guard.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHELLS = ['player/index.html', 'gm/index.html', 'index.html', 'account/index.html', 'dice/index.html'];
let fail = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++; };

(async () => {
  const { TRANSFORMS, RAW_LIB_OUT, rawLibFiles } = await import(path.join(ROOT, 'build/sources.mjs'));
  const RAW = new Set(rawLibFiles(ROOT));
  const BUILT = new Set(TRANSFORMS.map((t) => t.out));
  const built = fs.existsSync(path.join(ROOT, RAW_LIB_OUT, 'lib'));

  // a URL's verdict: null when served from where 761 says; otherwise why not
  const judge = (url) => {
    const p = url.replace(/[?#].*$/, '').replace(/^\//, '');
    if (/^https?:/.test(p) || !/(^|\/)lib\//.test(p)) return null;
    if (p.startsWith(RAW_LIB_OUT + 'lib/')) {
      const src = p.slice(RAW_LIB_OUT.length);
      if (!RAW.has(src)) return `${url}: no RAW source ${src}`;
      if (built && !fs.existsSync(path.join(ROOT, p))) return `${url}: dist/ is built but the copy is missing`;
      return null;
    }
    if (BUILT.has(p)) return null;
    if (RAW.has(p)) return `${url}: a RAW lib/ file served raw (load ${RAW_LIB_OUT}${p})`;
    return `${url}: neither a dist/ copy nor a BUILT output`;
  };
  const tagsOf = (html) => [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const shellBad = (name, html) => tagsOf(html).map(judge).filter(Boolean).map((w) => `${name} ${w}`);
  const doorOf = (code) => {
    const ctx = { localStorage: { getItem: () => null }, document: {} }; ctx.window = ctx;
    vm.runInNewContext(code, ctx, { filename: 'lib/shared/campaignsDoor.js' });
    const D = ctx.SWRPGCampaignsDoor;
    return [...D.FILES, ...D.FIRST, D.QR];
  };
  const hostOf = (code) => {
    const sandbox = { module: { exports: {} } };
    vm.runInNewContext(code, sandbox);
    return sandbox.module.exports.TABLE_SERVER_HOST;
  };

  console.log('B-1912 — no RAW lib/ file served from /lib/ (ADDENDUM 761)');
  // L1
  let n = 0; const bad1 = [];
  for (const s of SHELLS) { n += tagsOf(rd(s)).length; bad1.push(...shellBad(s, rd(s))); }
  ok(bad1.length === 0, `L1 ${n} <script src> tags in the five shells load a dist/ copy, a BUILT output or a non-lib file` + (bad1.length ? ': ' + bad1.join('; ') : ''));
  // L2
  const door = doorOf(rd('lib/shared/campaignsDoor.js'));
  const bad2 = door.map(judge).filter(Boolean);
  ok(bad2.length === 0, `L2 the door's FILES/FIRST/QR (${door.length} URLs) resolve as L1` + (bad2.length ? ': ' + bad2.join('; ') : ''));
  // L3: product code, comments stripped (a path in prose is not a loader)
  const code = ['player/app.jsx', 'gm/app.jsx', ...TRANSFORMS.map((t) => t.in).filter((f) => f.startsWith('lib/')), ...RAW];
  const bad3 = []; let lits = 0;
  // the shells' inline <script> blocks count as product code too
  const inline = (f) => [...rd(f).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n');
  for (const f of [...new Set(code), ...SHELLS]) {
    let out;
    try { out = esbuild.transformSync(f.endsWith('.html') ? inline(f) : rd(f), { loader: f.endsWith('.jsx') ? 'jsx' : 'js', minifyWhitespace: true, legalComments: 'none' }).code; }
    catch (e) { bad3.push(`${f}: transform failed (${e.message.split('\n')[0]})`); continue; }
    // a `file:` value or effectClass.js's CR_FILE names a SOURCE for its reader census, never a URL a page loads (named,
    // so any other raw lib/ string still has to resolve)
    for (const m of out.matchAll(/(file:|CR_FILE=)?["'`]((?:\/?dist\/)?\/?lib\/[\w./-]+\.js)["'`]/g)) { if (m[1]) continue; lits++; const w = judge(m[2]); if (w) bad3.push(`${f} ${w}`); }
  }
  ok(bad3.length === 0, `L3 ${lits} lib/ script strings in product code resolve as L1` + (bad3.length ? ': ' + bad3.join('; ') : ''));
  // L4
  const ssSrc = rd('lib/shared/siteSettings.js');
  const ssCopy = path.join(RAW_LIB_OUT, 'lib/shared/siteSettings.js');
  if (built) {
    const a = hostOf(ssSrc), b = hostOf(rd(ssCopy));
    ok(a === b && typeof a === 'string', `L4 ${ssCopy} TABLE_SERVER_HOST ${JSON.stringify(b)} = its source's ${JSON.stringify(a)}`);
  } else ok(true, 'L4 skipped: dist/ not built (run `npm run build`)');
  ok(built, `L5 dist/lib is built (${built ? 'every copy a loader names was checked in L1-L3' : 'copies unchecked: run `npm run build`'})`);

  // BITES — the same judges over planted inputs
  const tagged = tagsOf(rd('player/index.html')).find((u) => u.replace(/^\//, '').startsWith(RAW_LIB_OUT + 'lib/'));
  const planted = rd('player/index.html').replace(`src="${tagged}"`, `src="${tagged.replace(RAW_LIB_OUT, '')}"`);
  ok(shellBad('player/index.html', planted).length === 1, `BITE L1: ${tagged} put back to /lib/ reds it`);
  const doorPlant = rd('lib/shared/campaignsDoor.js').replace("'/" + RAW_LIB_OUT + 'lib/shared/campaignStore.js', "'/lib/shared/campaignStore.js");
  ok(doorOf(doorPlant).map(judge).filter(Boolean).length > 0, 'BITE L2: the door\'s campaignStore.js put back to /lib/ reds it');
  if (built) {
    const edited = ssSrc.replace(/TABLE_SERVER_HOST: '[^']*'/, "TABLE_SERVER_HOST: '@origin'");
    ok(edited !== ssSrc && hostOf(edited) !== hostOf(rd(ssCopy)), 'BITE L4: a source host edited after the build differs from its copy');
  }
  console.log(`\nb1912_no_raw_lib_served: ${fail ? fail + ' FAILED' : 'all pass'}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
