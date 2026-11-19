#!/usr/bin/env node
/**
 * icons.mjs — the Windows launcher's icons, made on the Mac (the PC has no SVG renderer): from
 * public/icons/holocron-icon.svg, rendered by Quick Look exactly as program/mac/build.mjs renders it, rounded at 22 %
 * by program/mac/tools/roundicon.swift (the frames' .ico border-radius):
 *   <out>/icon.png       160 px, the window's 40 px head icon at up to 4× DPI (the window rounds it again as drawn)
 *   <out>/holocron.ico   16, 20, 24, 32, 40, 48, 64, 256 px, each a PNG entry (Windows Vista and later read them)
 *   node program/windows/icons.mjs [--out <dir>]      Default program/windows/out/icons/ (gitignored).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
let OUT = path.join(HERE, 'out', 'icons');
if (argv.length === 2 && argv[0] === '--out') OUT = path.resolve(argv[1]);
else if (argv.length) { console.error('usage: node program/windows/icons.mjs [--out <dir>]'); process.exit(2); }
if (process.platform !== 'darwin') { console.error('icons.mjs runs on the Mac (Quick Look renders the SVG)'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-winicon-'));
try {
  const svg = path.join(REPO, 'public', 'icons', 'holocron-icon.svg');
  execFileSync('qlmanage', ['-t', '-s', '1024', '-o', tmp, svg], { stdio: 'ignore' });
  const big = path.join(tmp, 'holocron-icon.svg.png');
  if (!fs.existsSync(big)) throw new Error('Quick Look did not render the icon');
  const round = path.join(tmp, 'roundicon');
  execFileSync('swiftc', ['-O', '-o', round, path.join(REPO, 'program', 'mac', 'tools', 'roundicon.swift')], { stdio: 'inherit' });
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync(round, [big, path.join(OUT, 'icon.png'), '160']);
  const sizes = [16, 20, 24, 32, 40, 48, 64, 256];
  const pngs = sizes.map((s) => { const f = path.join(tmp, `i${s}.png`); execFileSync(round, [big, f, String(s)]); return fs.readFileSync(f); });
  // ICONDIR + ICONDIRENTRY[n] + the PNGs
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(path.join(OUT, 'holocron.ico'), Buffer.concat([head, ...pngs]));
  console.log(`ICONS ${OUT} · icon.png 160 · holocron.ico ${sizes.join('/')}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
