#!/usr/bin/env node
/**
 * program/build.mjs — the Holocron PROGRAM's site and server, built from ONE commit of this repo (ruling
 * `argo-a4-launcher-build` §4.1; A4-C11).
 *
 *   node program/build.mjs [--sha <S>]          (default HEAD)
 *   node program/build.mjs --check <base>       every script URL in out/site's five shells answers 200, JavaScript,
 *                                               through a running program at <base> (e.g. http://127.0.0.1:8250), and
 *                                               the siteSettings.js they load reads TABLE_SERVER_HOST '@origin'
 *
 * 1. EXPORT  the open copy at <S>: `scripts/argo_export/export.py --sha <S> --tree <temp>` (deny-by-default allowlist,
 *            the blank siteSettings template, the full scan). A refusal stops the build (exit 2): no scan is bypassed.
 *    FONTS   scripts/argo_export/font_urls.py: every url(...) in the copy's fonts.css is a file in it (R-AE-29 item 3).
 * 2. SET     its lib/shared/siteSettings.js TABLE_SERVER_HOST to '@origin' (the server is the page's own host), BEFORE the
 *            build, so any built copy of the file carries it (B-1912's /dist/). That copy is the only place '@origin' is
 *            written; holocron.work's file and the public template are untouched.
 * 3. BUILD   the copy's `npm run build` (this repo's node_modules, linked in); its whole output goes to site/, so the
 *            shells' script URLs resolve wherever that build writes them (B-1912 moves them under /dist/).
 * 4. BUNDLE  the copy's table-server/ by `npx wrangler deploy --dry-run` (publishes nothing).
 * 5. WRITE   program/out/ (gitignored), replaced whole:
 *              site/                 the built copy, less node_modules — workerd's read-only `site`
 *              serve/holocron.capnp  program/serve/'s config and router, beside
 *              serve/router.js
 *              serve/table/index.js  the table server's bundle
 *              BUILD.json            { sha, builtAt }
 * Exit 0 built · 2 refused (the export, the build, the setting or the bundle, each named) · 1 a crash.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');

class Refused extends Error {}
function refuse(step, why) { throw new Refused('REFUSED at ' + step + ': ' + why); }
function run(cmd, argv, cwd, step) {
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) refuse(step, cmd + ' ' + argv.join(' ') + ' exit ' + r.status + '\n' + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12).join('\n'));
  return r.stdout || '';
}

const SHELLS = ['index.html', 'player/index.html', 'gm/index.html', 'dice/index.html', 'account/index.html'];
async function check(base) {
  let bad = 0, n = 0;
  const settings = new Set();
  for (const shell of SHELLS) {
    const html = fs.readFileSync(path.join(OUT, 'site', shell), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const b = /<base href="([^"]+)"/.exec(html), at = new URL(b ? b[1] : '/' + shell, base);   // the shell's own <base>
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      if (/^https?:/.test(m[1])) continue;   // a CDN script is not the program's to serve
      const url = new URL(m[1], at), r = await fetch(url);
      let ok = r.status === 200 && /javascript/.test(r.headers.get('content-type') || '');
      if (ok && /siteSettings\.js$/.test(url.pathname)) {   // whichever copy the shells load must carry the setting
        ok = /TABLE_SERVER_HOST\s*:\s*["']@origin["']/.test(await r.text());
        if (ok) settings.add(url.pathname);
      }
      n++; if (!ok) { bad++; console.log('  ✗ ' + shell + ' → ' + url.pathname + ' ' + r.status + ' ' + r.headers.get('content-type')); }
    }
  }
  if (!settings.size) { bad++; console.log('  ✗ no shell loads a siteSettings.js that reads @origin'); }
  console.log((bad ? 'CHECK RED ' : 'CHECK OK ') + (n - bad) + '/' + n + ' script URLs in ' + SHELLS.length + " shells answer 200 JavaScript; TABLE_SERVER_HOST '@origin' at " + [...settings].join(', '));
  process.exit(bad ? 1 : 0);
}

const argv = process.argv.slice(2);
if (argv[0] === '--check' && argv.length === 2) await check(argv[1]);
let sha = 'HEAD';
if (argv.length === 2 && argv[0] === '--sha') sha = argv[1];
else if (argv.length) { console.error('usage: node program/build.mjs [--sha <S>] | --check <base>'); process.exit(2); }

let tmp = null;
try {
  sha = run('git', ['rev-parse', '--verify', sha + '^{commit}'], REPO, 'sha').trim();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-program-'));
  const tree = path.join(tmp, 'tree');
  const py = fs.existsSync(path.join(REPO, '.venv/bin/python')) ? path.join(REPO, '.venv/bin/python') : 'python3';
  console.log(run(py, [path.join(REPO, 'scripts/argo_export/export.py'), '--sha', sha, '--tree', tree], REPO, 'export').trim().split('\n').pop());
  console.log(run(py, [path.join(REPO, 'scripts/argo_export/font_urls.py'), tree], REPO, 'fonts').trim().split('\n').pop());   // R-AE-29 item 3

  const ssPath = path.join(tree, 'lib/shared/siteSettings.js');
  const ss = fs.readFileSync(ssPath, 'utf8');
  const blank = "TABLE_SERVER_HOST: '',";
  if (ss.split(blank).length !== 2) refuse('setting', "lib/shared/siteSettings.js has no single `" + blank + "` line");
  fs.writeFileSync(ssPath, ss.replace(blank, "TABLE_SERVER_HOST: '@origin',"));

  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tree, 'node_modules'), 'junction');
  run('npm', ['run', 'build'], tree, 'build');

  const table = path.join(tmp, 'table');
  run('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', table], path.join(tree, 'table-server'), 'bundle');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'serve/table'), { recursive: true });
  fs.unlinkSync(path.join(tree, 'node_modules'));
  fs.cpSync(tree, path.join(OUT, 'site'), { recursive: true });   // tmp and the repo may sit on different drives
  for (const f of ['holocron.capnp', 'router.js']) fs.copyFileSync(path.join(HERE, 'serve', f), path.join(OUT, 'serve', f));
  fs.copyFileSync(path.join(table, 'index.js'), path.join(OUT, 'serve/table/index.js'));
  fs.writeFileSync(path.join(OUT, 'BUILD.json'), JSON.stringify({ sha, builtAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('BUILT ' + sha + ' → ' + path.relative(REPO, OUT) + '/ (site, serve)');
} catch (e) {
  if (!(e instanceof Refused)) throw e;
  console.error(e.message);
  process.exitCode = 2;
} finally {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
