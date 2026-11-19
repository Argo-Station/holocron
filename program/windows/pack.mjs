#!/usr/bin/env node
/**
 * pack.mjs — the PC runs' one payload (ruling `argo-a4-launcher-build` §4.3: each PC run is one committed script, at
 * a named commit). Made on the Mac, carried to the PC by Homelab (D-541), unpacked to %TEMP%\holocron-a4win\. The PC
 * builds Holocron.exe itself with its own csc.exe (program/windows/build.mjs); nothing in the payload is a launcher.
 *
 *   node program/windows/pack.mjs [--sha <S>]        (default HEAD)
 *
 * Needs, made before it: program/out/ (program/build.mjs, the program's site and server) and program/windows/out/icons/
 * (program/windows/icons.mjs). Writes program/windows/out/holocron-a4win-<S>.zip (gitignored) and prints its sha256.
 * The zip mirrors the repo's paths, so the suite finds package.json and LAW where it looks:
 *   package.json, Docs/mockups/argo-a4-guide.html,
 *   program/conformance/, program/windows/{build.mjs, app.manifest, Sources/, pc/}   — `git archive <S>`, so exactly the commit
 *   program/out/{serve, site}, program/out/BUILD.json                                — program/build.mjs's output, as built
 *   program/windows/out/icons/                                                        — icon.png, holocron.ico
 *   inputs/workerd.exe        npm's @cloudflare/workerd-windows-64 at the repo's pinned workerd version (npm pack)
 *   PAYLOAD.json              { sha, builtFrom, workerd: {version, sha256}, madeAt }
 * Exit 0 made, 1 failed, 2 usage.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
let sha = 'HEAD';
if (argv.length === 2 && argv[0] === '--sha') sha = argv[1];
else if (argv.length) { console.error('usage: node program/windows/pack.mjs [--sha <S>]'); process.exit(2); }
const fail = (m) => { console.error('PACK FAILED: ' + m); process.exit(1); };
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();

const full = git('rev-parse', sha);
const short = full.slice(0, 9);
const OUTS = path.join(REPO, 'program', 'out');
if (!fs.existsSync(path.join(OUTS, 'serve', 'holocron.capnp')) || !fs.existsSync(path.join(OUTS, 'site', 'index.html'))) fail('no program/out/ — run node program/build.mjs first');
const ICONS = path.join(HERE, 'out', 'icons');
if (!fs.existsSync(path.join(ICONS, 'holocron.ico'))) fail('no program/windows/out/icons/ — run node program/windows/icons.mjs first');
const built = JSON.parse(fs.readFileSync(path.join(OUTS, 'BUILD.json'), 'utf8'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-a4win-pack-'));
try {
  const root = path.join(tmp, 'holocron-a4win');
  fs.mkdirSync(root);
  const tar = path.join(tmp, 'src.tar');
  execFileSync('git', ['-C', REPO, 'archive', '--format=tar', '-o', tar, full, 'package.json', 'Docs/mockups/argo-a4-guide.html',
    'program/conformance', 'program/windows/build.mjs', 'program/windows/app.manifest', 'program/windows/Sources', 'program/windows/pc']);
  execFileSync('tar', ['-xf', tar, '-C', root]);
  fs.cpSync(path.join(OUTS, 'serve'), path.join(root, 'program', 'out', 'serve'), { recursive: true });
  fs.cpSync(path.join(OUTS, 'site'), path.join(root, 'program', 'out', 'site'), { recursive: true });
  fs.copyFileSync(path.join(OUTS, 'BUILD.json'), path.join(root, 'program', 'out', 'BUILD.json'));
  fs.cpSync(ICONS, path.join(root, 'program', 'windows', 'out', 'icons'), { recursive: true });

  const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
  const pinned = (lock.packages['node_modules/workerd'] || {}).version;
  if (!pinned) fail('no pinned workerd in package-lock.json');
  const npmDir = path.join(tmp, 'npm');
  fs.mkdirSync(npmDir);
  const tgz = execFileSync('npm', ['pack', `@cloudflare/workerd-windows-64@${pinned}`, '--silent'], { cwd: npmDir, encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['-xzf', path.join(npmDir, tgz), '-C', npmDir]);
  fs.mkdirSync(path.join(root, 'inputs'));
  const exe = path.join(root, 'inputs', 'workerd.exe');
  fs.copyFileSync(path.join(npmDir, 'package', 'bin', 'workerd.exe'), exe);
  const wsha = crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
  fs.writeFileSync(path.join(root, 'PAYLOAD.json'), JSON.stringify({ sha: full, builtFrom: built.sha, workerd: { version: pinned, sha256: wsha }, madeAt: new Date().toISOString() }, null, 1) + '\n');

  fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
  const zip = path.join(HERE, 'out', `holocron-a4win-${short}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--keepParent', root, zip]);
  const zsha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  console.log(`PACKED ${zip} · ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB · sha256 ${zsha} · commit ${short} · site ${String(built.sha).slice(0, 9)} · workerd ${pinned} ${wsha.slice(0, 16)}…`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
