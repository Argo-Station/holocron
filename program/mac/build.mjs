#!/usr/bin/env node
/**
 * build.mjs — builds Holocron.app, the program's Mac launcher (ruling `argo-a4-launcher-build` §4.2). Unsigned (D-615 b2):
 * sealed ad hoc, whole (`argo-close-out` ADDENDUM 1 A1). The last step is `codesign --force -s -` on the bundle, without
 * --deep, so the bundle's resources and Info.plist are sealed while workerd keeps npm's own signature; then
 * `codesign --verify --strict` must pass, and workerd's CDHash must equal the npm file's (the identity a Mac's firewall
 * Allow holds, argo-a4-own-run ADDENDUM 3). Either failing exits 1.
 *
 *   node program/mac/build.mjs [--serve <dir>] [--site <dir>] [--out <dir>]
 *     --serve  the server half: a directory holding holocron.capnp and everything it embeds (A4-C11).
 *              Default program/out/serve/, which program/build.mjs (argo-a4-program-serve) writes: program/serve/'s
 *              config and router beside the bundled table server (table/index.js). The suite's stub is passed this way.
 *     --site   the program's built site (default program/out/site/, made by program/build.mjs).
 *     --out    where Holocron.app goes (default program/mac/build/, gitignored).
 *     --sources  the Swift sources (default program/mac/Sources/); the conformance bite run builds its mutants this way.
 *
 * The app holds:
 *   Contents/MacOS/Holocron   swiftc of Sources/*.swift, arm64, deployment target macOS 13.5 (`argo-a4-launcher` ADDENDUM 1)
 *   Contents/MacOS/workerd    from npm's @cloudflare/workerd-darwin-arm64, which must be the repo's pinned workerd version
 *   Contents/Resources/serve/ the --serve directory, copied
 *   Contents/Resources/site/  the --site directory, copied
 *   Contents/Resources/icon.png, AppIcon.icns   from public/icons/holocron-icon.svg (Quick Look renders it; CoreSVG drops
 *                             its feMerge glow)
 * Info.plist's CFBundleShortVersionString is package.json's `version`: the program's version is the site's release
 * version at its build (A4-C13).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!['--serve', '--site', '--out', '--sources'].includes(argv[i]) || argv[i + 1] == null) {
    console.error('usage: node program/mac/build.mjs [--serve <dir>] [--site <dir>] [--out <dir>] [--sources <dir>]');
    process.exit(2);
  }
  opts[argv[i].slice(2)] = path.resolve(argv[++i]);
}
const SERVE = opts.serve || path.join(REPO, 'program', 'out', 'serve');
const SITE = opts.site || path.join(REPO, 'program', 'out', 'site');
const OUT = opts.out || path.join(HERE, 'build');
const SOURCES = opts.sources || path.join(HERE, 'Sources');
const fail = (msg) => { console.error('BUILD FAILED: ' + msg); process.exit(1); };

if (!fs.existsSync(path.join(SERVE, 'holocron.capnp'))) fail(`no holocron.capnp in ${SERVE}`);
if (!fs.existsSync(path.join(SITE, 'index.html'))) fail(`no index.html in ${SITE}`);

// ── versions ──
const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version "${version}" is not x.y.z`);
const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
const pinned = (lock.packages['node_modules/workerd'] || {}).version;
const req = createRequire(path.join(REPO, 'package.json'));
let workerdPkg;
try { workerdPkg = req.resolve('@cloudflare/workerd-darwin-arm64/package.json'); } catch (e) { fail('@cloudflare/workerd-darwin-arm64 is not installed (npm ci)'); }
const workerdVersion = JSON.parse(fs.readFileSync(workerdPkg, 'utf8')).version;
if (workerdVersion !== pinned) fail(`workerd ${workerdVersion} is installed, the repo pins ${pinned}`);
const workerdBin = path.join(path.dirname(workerdPkg), 'bin', 'workerd');

// ── the bundle ──
const app = path.join(OUT, 'Holocron.app');
fs.rmSync(app, { recursive: true, force: true });
const macos = path.join(app, 'Contents', 'MacOS');
const res = path.join(app, 'Contents', 'Resources');
fs.mkdirSync(macos, { recursive: true });
fs.mkdirSync(res, { recursive: true });

const sources = fs.readdirSync(SOURCES).filter((f) => f.endsWith('.swift')).sort().map((f) => path.join(SOURCES, f));
execFileSync('swiftc', ['-O', '-target', 'arm64-apple-macos13.5', '-framework', 'AppKit', '-framework', 'SystemConfiguration',
  '-o', path.join(macos, 'Holocron'), ...sources], { stdio: 'inherit' });
fs.copyFileSync(workerdBin, path.join(macos, 'workerd'));
fs.chmodSync(path.join(macos, 'workerd'), 0o755);
execFileSync('ditto', [SERVE, path.join(res, 'serve')]);
execFileSync('ditto', [SITE, path.join(res, 'site')]);

// ── the icon ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-icon-'));
try {
  const svg = path.join(REPO, 'public', 'icons', 'holocron-icon.svg');
  execFileSync('qlmanage', ['-t', '-s', '1024', '-o', tmp, svg], { stdio: 'ignore' });
  const big = path.join(tmp, 'holocron-icon.svg.png');
  if (!fs.existsSync(big)) fail('Quick Look did not render the icon');
  fs.copyFileSync(big, path.join(res, 'icon.png'));
  const round = path.join(tmp, 'roundicon');
  execFileSync('swiftc', ['-O', '-target', 'arm64-apple-macos13.5', '-o', round, path.join(HERE, 'tools', 'roundicon.swift')], { stdio: 'inherit' });
  const set = path.join(tmp, 'AppIcon.iconset');
  fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync(round, [big, path.join(set, `icon_${s}x${s}.png`), String(s)]);
    execFileSync(round, [big, path.join(set, `icon_${s}x${s}@2x.png`), String(s * 2)]);
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(res, 'AppIcon.icns')]);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ── Info.plist ──
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Holocron</string>
  <key>CFBundleDisplayName</key><string>Holocron</string>
  <key>CFBundleIdentifier</key><string>work.holocron.program</string>
  <key>CFBundleExecutable</key><string>Holocron</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>13.5</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSSupportsAutomaticTermination</key><false/>
  <key>NSSupportsSuddenTermination</key><false/>
</dict>
</plist>
`;
fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), plist);

// ── the seal (argo-close-out ADDENDUM 1 A1): ad hoc over the whole bundle, workerd's own signature untouched ──
const cdhash = (f) => {
  const r = spawnSync('codesign', ['-dv', '--verbose=4', f], { encoding: 'utf8' });
  const m = /^CDHash=([0-9a-f]{40})$/m.exec((r.stderr || '') + (r.stdout || ''));
  return m ? m[1] : null;
};
const npmHash = cdhash(workerdBin);
if (!npmHash) fail(`no CDHash on npm's workerd at ${workerdBin}`);
const seal = spawnSync('codesign', ['--force', '-s', '-', app], { encoding: 'utf8' });
if (seal.status !== 0) fail('codesign --force -s - exit ' + seal.status + ': ' + (seal.stderr || '').trim());
const verify = spawnSync('codesign', ['--verify', '--strict', app], { encoding: 'utf8' });
if (verify.status !== 0) fail('codesign --verify --strict exit ' + verify.status + ': ' + (verify.stderr || '').trim());
const appHash = cdhash(path.join(macos, 'workerd'));
if (appHash !== npmHash) fail(`workerd's CDHash ${appHash} is not npm's ${npmHash}`);
console.log(`SEALED ad hoc · codesign --verify --strict OK · workerd CDHash ${appHash} = npm's`);

const size = execFileSync('du', ['-sk', app], { encoding: 'utf8' }).split('\t')[0];
console.log(`BUILT ${app} · version ${version} · workerd ${workerdVersion} · ${(Number(size) / 1024).toFixed(1)} MB`);
