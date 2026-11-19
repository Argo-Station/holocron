#!/usr/bin/env node
/**
 * build.mjs — builds Holocron\, the program's Windows launcher folder (ruling `argo-a4-launcher-build` §4.3). Unsigned
 * (D-615 b2). Runs on the PC, where the OS's own .NET Framework csc.exe compiles it (C# 5, nothing installed), and on
 * the Mac for a compile check only (--check, a user-local Roslyn under program/windows/.tools/, gitignored).
 *
 *   node program/windows/build.mjs [--serve <dir>] [--site <dir>] [--workerd <workerd.exe>] [--icons <dir>]
 *                                  [--out <dir>] [--sources <dir>] [--check]
 *     --serve    the server half: holocron.capnp and everything it embeds (A4-C11). Default program/out/serve/.
 *     --site     the program's built site. Default program/out/site/.
 *     --workerd  workerd.exe from npm's @cloudflare/workerd-windows-64 at the repo's pinned version. Default: that
 *                package under node_modules, version-checked against package-lock.json.
 *     --icons    a directory holding icon.png and holocron.ico (program/windows/icons.mjs makes them, on the Mac).
 *                Default program/windows/out/icons/.
 *     --out      where Holocron\ goes. Default program/windows/build/ (gitignored).
 *     --sources  the C# sources. Default program/windows/Sources/ (a bite run builds its mutants this way).
 *     --check    compile only, into --out\check\, with Roslyn from program/windows/.tools/ against the .NET Framework 4.8
 *                reference assemblies at C# 5; no bundle. The Mac's road.
 *
 * Holocron\ holds:
 *   Holocron.exe   csc of Sources\*.cs + BuildInfo.g.cs (the version), /target:winexe, /win32manifest:app.manifest,
 *                  /win32icon:holocron.ico; FileDescription and ProductName "Holocron"
 *   server\Holocron.exe   the --workerd file, copied unchanged under the launcher's name in its own folder (ADDENDUM 17
 *                  (iv): Windows' firewall names the file; the same bytes keep Smart App Control's verdict)
 *   serve\, site\  the --serve and --site directories, copied
 *   icon.png       the window's 40 px icon source
 * The program's version is package.json's `version` (A4-C13): BuildInfo.Version.
 * Exit 0 built, 1 failed, 2 usage.
 */
import { execFileSync } from 'node:child_process';
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
  if (argv[i] === '--check') { opts.check = true; continue; }
  if (!['--serve', '--site', '--workerd', '--icons', '--out', '--sources'].includes(argv[i]) || argv[i + 1] == null) {
    console.error('usage: node program/windows/build.mjs [--serve <dir>] [--site <dir>] [--workerd <exe>] [--icons <dir>] [--out <dir>] [--sources <dir>] [--check]');
    process.exit(2);
  }
  opts[argv[i].slice(2)] = path.resolve(argv[++i]);
}
let gen = null;
const fail = (msg) => { if (gen) fs.rmSync(gen, { recursive: true, force: true }); console.error('BUILD FAILED: ' + msg); process.exit(1); };
const OUT = opts.out || path.join(HERE, 'build');
const SOURCES = opts.sources || path.join(HERE, 'Sources');
const ICONS = opts.icons || path.join(HERE, 'out', 'icons');

const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version "${version}" is not x.y.z`);

// ── the generated source: the version, and the assembly's names (the file's FileDescription is "Holocron") ──
gen = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-win-gen-'));
const info = path.join(gen, 'BuildInfo.g.cs');
fs.writeFileSync(info, `// BuildInfo.g.cs — written by program/windows/build.mjs at each build; never committed.
using System.Reflection;
[assembly: AssemblyTitle("Holocron")]
[assembly: AssemblyDescription("Holocron")]
[assembly: AssemblyProduct("Holocron")]
[assembly: AssemblyVersion("${version}.0")]
[assembly: AssemblyFileVersion("${version}.0")]
[assembly: AssemblyInformationalVersion("${version}")]
// without it the runtime runs the program in .NET 4.0's compatibility mode (its TLS defaults among them)
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8", FrameworkDisplayName = ".NET Framework 4.8")]
static class BuildInfo { public const string Version = "${version}"; }
`);
const sources = fs.readdirSync(SOURCES).filter((f) => f.endsWith('.cs')).sort().map((f) => path.join(SOURCES, f));
const REFS = ['mscorlib.dll', 'System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll'];

try {
  if (opts.check) {
    // ── the Mac's compile check: Roslyn at C# 5 against the 4.8 reference assemblies ──
    const tools = path.join(HERE, '.tools');
    const dotnet = path.join(tools, 'dotnet', 'dotnet');
    const sdk = path.join(tools, 'dotnet', 'sdk');
    const ver = fs.existsSync(sdk) ? fs.readdirSync(sdk).sort().pop() : null;
    const csc = ver && path.join(sdk, ver, 'Roslyn', 'bincore', 'csc.dll');
    const refs = path.join(tools, 'refs', 'build', '.NETFramework', 'v4.8');
    if (!csc || !fs.existsSync(csc) || !fs.existsSync(refs)) fail('no Roslyn or reference assemblies under program/windows/.tools/');
    const outDir = path.join(OUT, 'check');
    fs.mkdirSync(outDir, { recursive: true });
    const args = [csc, '-nologo', '-noconfig', '-nostdlib', '-langversion:5', '-target:winexe', '-platform:anycpu', '-optimize+',
      '-warnaserror+', `-out:${path.join(outDir, 'Holocron.exe')}`, `-win32manifest:${path.join(HERE, 'app.manifest')}`,
      ...REFS.map((r) => `-r:${path.join(refs, r)}`), info, ...sources];
    if (fs.existsSync(path.join(ICONS, 'holocron.ico'))) args.splice(args.length - sources.length - 1, 0, `-win32icon:${path.join(ICONS, 'holocron.ico')}`);
    execFileSync(dotnet, args, { stdio: 'inherit' });
    console.log(`CHECKED ${path.join(outDir, 'Holocron.exe')} · C# 5 · .NET Framework 4.8 references · version ${version}`);
    fs.rmSync(gen, { recursive: true, force: true });
    process.exit(0);
  }

  // ── the PC's build: the OS's own csc.exe ──
  if (process.platform !== 'win32') fail('the bundle is built on Windows (use --check on the Mac)');
  const SERVE = opts.serve || path.join(REPO, 'program', 'out', 'serve');
  const SITE = opts.site || path.join(REPO, 'program', 'out', 'site');
  if (!fs.existsSync(path.join(SERVE, 'holocron.capnp'))) fail(`no holocron.capnp in ${SERVE}`);
  if (!fs.existsSync(path.join(SITE, 'index.html'))) fail(`no index.html in ${SITE}`);
  for (const f of ['icon.png', 'holocron.ico']) if (!fs.existsSync(path.join(ICONS, f))) fail(`no ${f} in ${ICONS}`);
  let workerd = opts.workerd;
  if (!workerd) {
    const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
    const pinned = (lock.packages['node_modules/workerd'] || {}).version;
    let pkg;
    try { pkg = createRequire(path.join(REPO, 'package.json')).resolve('@cloudflare/workerd-windows-64/package.json'); }
    catch (e) { fail('@cloudflare/workerd-windows-64 is not installed; pass --workerd'); }
    const have = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
    if (have !== pinned) fail(`workerd ${have} is installed, the repo pins ${pinned}`);
    workerd = path.join(path.dirname(pkg), 'bin', 'workerd.exe');
  }
  if (!fs.existsSync(workerd)) fail(`no workerd.exe at ${workerd}`);
  const fw = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const csc = path.join(fw, 'csc.exe');
  if (!fs.existsSync(csc)) fail(`no ${csc}`);

  const dir = path.join(OUT, 'Holocron');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(csc, ['/nologo', '/noconfig', '/target:winexe', '/platform:anycpu', '/optimize+', '/warnaserror+',
    `/out:${path.join(dir, 'Holocron.exe')}`, `/win32manifest:${path.join(HERE, 'app.manifest')}`,
    `/win32icon:${path.join(ICONS, 'holocron.ico')}`, ...REFS.map((r) => `/r:${path.join(fw, r)}`), info, ...sources], { stdio: 'inherit' });
  fs.mkdirSync(path.join(dir, 'server'));
  fs.copyFileSync(workerd, path.join(dir, 'server', 'Holocron.exe'));
  fs.cpSync(SERVE, path.join(dir, 'serve'), { recursive: true });
  fs.cpSync(SITE, path.join(dir, 'site'), { recursive: true });
  fs.copyFileSync(path.join(ICONS, 'icon.png'), path.join(dir, 'icon.png'));
  let bytes = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
  walk(dir);
  console.log(`BUILT ${dir} · version ${version} · ${(bytes / 1048576).toFixed(1)} MB`);
} catch (e) {
  fail(e.message);
} finally {
  fs.rmSync(gen, { recursive: true, force: true });
}
