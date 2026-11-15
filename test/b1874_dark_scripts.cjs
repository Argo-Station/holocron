/* test/b1874_dark_scripts.cjs — B-1874 (ruling release-r7-bug-burndown ADDENDUM 721, D-597): the online table's files and
 * the rule-text panel's files are off the first paint.
 *
 *   S  neither shell (player/index.html, gm/index.html) carries a <script src> for campaignStore, tableLink, campaignsView,
 *      ruleTextStore, ruleTextLoad or ruleTextPanel, nor (either shell) qrcode-generator's qrcode.js;
 *   E  campaignsDoor.js and tableSession.js are still tagged in both shells, eagerly (no async; the player's defer runs before
 *      its mount) — ADDENDUM 722: tableSession.pcOf names a fight's PC with the door off (B-1851);
 *   L  the door's loader, run in a vm as the page runs it: door OFF, load() resolves false and makes no <script>; door ON,
 *      it runs the three files in the shells' old order (the GM's { qr: true } puts qrcode.js before campaignsView.js),
 *      once, and resolves true; a file that fails resolves false (never rejects);
 *   B  each app asks the door before its first render: player/app.jsx's boot and gm/app.jsx's mount call load() only
 *      under on(), and otherwise mount as before;
 *   A  SWRPGSources.ready(), run in a vm: with BOOK_CONTENT 'included' it makes no <script>; with 'removed' it runs the
 *      three A5 files in order before it resolves, then awaits the store's ready(); the player's rule-text row runs the same
 *      loader (SWRPGSources.ruleTextFiles, once a page) before it opens the panel.
 * Run: node test/b1874_dark_scripts.cjs   (B1874_ROOT=<dir> reads another tree's files: the bite, red at 6c2af66fd)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = process.env.B1874_ROOT || path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, info) { if (ok) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (info ? '  ->  ' + info : '')); } }

const DARK = ['lib/shared/campaignStore.js', 'lib/shared/tableLink.js', 'lib/shared/campaignsView.js',
  'public/vendor/qrcode-generator/qrcode.js', 'lib/shared/ruleTextStore.js', 'lib/shared/ruleTextLoad.js', 'lib/shared/ruleTextPanel.js'];
const tags = (html) => [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)]
  .map((m) => ({ src: m[2].replace(/^\//, ''), attrs: m[1] + m[3] }));

console.log('[S] the shells tag none of the seven]');
for (const shell of ['player/index.html', 'gm/index.html']) {
  const t = tags(read(shell)), hit = DARK.filter((f) => t.some((x) => x.src === f));
  check(shell + ' tags none of the seven', hit.length === 0, hit.join(', '));
}

console.log('[E] the switch and the table session stay eager (ADDENDUM 722)]');
for (const shell of ['player/index.html', 'gm/index.html']) for (const f of ['lib/shared/campaignsDoor.js', 'lib/shared/tableSession.js']) {
  const d = tags(read(shell)).filter((x) => x.src === f);
  check(shell + ' tags ' + path.basename(f) + ' once, not async', d.length === 1 && !/\basync\b/.test(d[0].attrs), JSON.stringify(d));
}

// a page as the loader sees it: localStorage, and a document whose appended <script>s are recorded and then load (or fail)
function page(store, failSrc) {
  const made = [];
  const document = {
    createElement: (tag) => ({ tag }),
    head: { appendChild: (el) => { made.push(el.src); setImmediate(() => (el.src === failSrc ? el.onerror() : el.onload())); } },
  };
  const win = { localStorage: { getItem: (k) => (k in store ? store[k] : null) }, document, console: { warn() {} } };
  win.window = win;
  return { win, made };
}
function runIn(win, file) { vm.runInNewContext(read(file), Object.assign(win, { setImmediate, Promise }), { filename: file }); }

(async () => {
  console.log('[L] the door\'s loader]');
  const doorFile = 'lib/shared/campaignsDoor.js';
  const E6 = ['/lib/shared/campaignStore.js', '/lib/shared/tableLink.js', '/lib/shared/campaignsView.js'];
  const QR = '/public/vendor/qrcode-generator/qrcode.js';
  {
    const p = page({}); runIn(p.win, doorFile); const D = p.win.SWRPGCampaignsDoor;
    const ok = !!(D && typeof D.load === 'function');
    check('the door exposes load()', ok);
    if (ok) {
      const r = await D.load({ qr: true });
      check('door OFF: load() resolves false and makes no <script>', r === false && p.made.length === 0, JSON.stringify({ r, made: p.made }));
    }
  }
  {
    const p = page({ swrpg_campaigns_door: '1' }); runIn(p.win, doorFile); const D = p.win.SWRPGCampaignsDoor;
    if (D && D.load) {
      const r = await D.load(); const again = await D.load();
      check('door ON (player): the three files, in order, once; resolves true', r === true && again === true && JSON.stringify(p.made) === JSON.stringify(E6), JSON.stringify(p.made));
    } else check('door ON (player): load() exists', false);
  }
  {
    const p = page({ swrpg_campaigns_door: '1' }); runIn(p.win, doorFile); const D = p.win.SWRPGCampaignsDoor;
    if (D && D.load) {
      const r = await D.load({ qr: true });
      check('door ON (GM): qrcode.js before campaignsView.js', r === true && JSON.stringify(p.made) === JSON.stringify(E6.slice(0, 2).concat([QR], E6.slice(2))), JSON.stringify(p.made));
    } else check('door ON (GM): load() exists', false);
  }
  {
    const p = page({ swrpg_campaigns_door: '1' }, '/lib/shared/tableLink.js'); runIn(p.win, doorFile); const D = p.win.SWRPGCampaignsDoor;
    if (D && D.load) {
      let r; try { r = await D.load(); } catch (e) { r = 'rejected'; }
      check('a file that fails: load() resolves false (never rejects) and stops there', r === false && p.made.length === 2, JSON.stringify({ r, made: p.made }));
    } else check('a failing file: load() exists', false);
  }

  console.log('[B] each app asks the door before its first render]');
  const pl = read('player/app.jsx'), gm = read('gm/app.jsx');
  check('player/app.jsx: the boot runs after SWRPGCampaignsDoor.load() under on(), else at once',
    /if \(window\.SWRPGCampaignsDoor && window\.SWRPGCampaignsDoor\.on\(\)\) window\.SWRPGCampaignsDoor\.load\(\)\.then\(playerBoot\); else playerBoot\(\);/.test(pl));
  check('gm/app.jsx: the mount runs after SWRPGCampaignsDoor.load({ qr: true }) under on(), else at once',
    /if \(D && D\.on\(\)\) D\.load\(\{ qr: true \}\)\.then\(boot\); else boot\(\);/.test(gm));
  const mountCalls = (s, re) => (s.match(re) || []).length;
  check('player/app.jsx renders <PlayerApp /> in one place (playerMount)', mountCalls(pl, /\.render\(<PlayerApp \/>\)/g) === 1);
  check('gm/app.jsx renders <GmApp /> in one place (mount)', mountCalls(gm, /\.render\(<GmApp \/>\)/g) === 1);

  console.log('[A] A5 runs only where book text is removed]');
  async function sourcesRun(content) {
    const p = page({});
    p.win.SWRPGTextHash = { bookContent: () => content };
    p.win.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entries: [] }) });
    let storeReadyAsked = false;
    const origAppend = p.win.document.head.appendChild;
    p.win.document.head.appendChild = (el) => {
      if (el.src === '/lib/shared/ruleTextStore.js') p.win.SWRPGRuleTextStore = { ready: () => { storeReadyAsked = true; return Promise.resolve(null); }, get: () => null };
      origAppend(el);
    };
    runIn(p.win, 'lib/shared/sources.js');
    await p.win.SWRPGSources.ready();
    const afterReady = p.made.length;
    if (p.win.SWRPGSources.ruleTextFiles) await p.win.SWRPGSources.ruleTextFiles();   // the player's row, after ready()
    return { made: p.made, storeReadyAsked, again: p.made.length - afterReady };
  }
  const inc = await sourcesRun('included');
  check("BOOK_CONTENT 'included' (holocron.work): ready() makes no <script>", inc.made.length === 0, JSON.stringify(inc.made));
  const rem = await sourcesRun('removed');
  const A5 = ['/lib/shared/ruleTextStore.js', '/lib/shared/ruleTextLoad.js', '/lib/shared/ruleTextPanel.js'];
  check("BOOK_CONTENT 'removed': ready() runs the three A5 files in order, then the store's ready(), before it resolves",
    JSON.stringify(rem.made) === JSON.stringify(A5) && rem.storeReadyAsked, JSON.stringify(rem));
  check('SWRPGSources.ruleTextFiles() (the player row) runs the files once a page: a second ask makes no <script>', rem.again === 0, JSON.stringify(rem));
  check("player/app.jsx: the 'Fill in rule text…' row opens after SWRPGSources.ruleTextFiles()",
    /onSelect: \(\) => \{ window\.SWRPGSources\.ruleTextFiles\(\)\.then\(\(\) => setRuleTextOpen\(true\)\); \}/.test(pl));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  the guard threw: ' + (e && e.stack || e)); process.exit(1); });
