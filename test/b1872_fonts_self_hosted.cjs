#!/usr/bin/env node
/**
 * b1872_fonts_self_hosted.cjs — B-1872: Orbitron, Rajdhani and Share Tech Mono are served from our own origin.
 *
 * Every door linked Google's css2 stylesheet render-blocking in <head>, so a slow or blocked path to Google held the
 * page blank (ADDENDUM 715: 30 s on the PC bench). Ruling release-r7-bug-burndown ADDENDUM 727 mirrored Google's own
 * @font-face blocks and woff2 files into lib/shared/fonts.css and public/fonts/, one stylesheet for all five doors.
 *
 *   F1  no door, nothing under lib/ and nothing under account/ names fonts.googleapis.com or fonts.gstatic.com
 *   F2  every door links /lib/shared/fonts.css
 *   F3  every src in fonts.css names a file that exists under public/fonts/ and is a woff2 (magic bytes wOF2)
 *   F4  every family lib/shared/tokens.css names has an @font-face in fonts.css
 *   F5  each family's licence ships beside the files: public/fonts/OFL-<Family>.txt, SIL OFL 1.1
 *
 * BITES (PRAXIS §6, read by EXIT CODE): at the lap's cut (the Google links still in the doors, no fonts.css) this
 * exits 1. B1872_ROOT points it at another tree.
 *
 * Run: node test/b1872_fonts_self_hosted.cjs
 */
const fs = require('fs');
const path = require('path');

const root = process.env.B1872_ROOT || path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : '')); }
}
const read = (rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; } };

const DOORS = ['index.html', 'player/index.html', 'gm/index.html', 'dice/index.html', 'account/index.html'];
const GOOGLE = /fonts\.(googleapis|gstatic)\.com/;
const LICENCES = { Orbitron: 'OFL-Orbitron.txt', Rajdhani: 'OFL-Rajdhani.txt', 'Share Tech Mono': 'OFL-ShareTechMono.txt' };

function walk(rel, out) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = path.join(rel, ent.name);
    if (ent.isDirectory()) walk(r, out);
    else if (/\.(html|css|js|jsx|mjs|cjs|json)$/.test(ent.name)) out.push(r);
  }
  return out;
}

console.log('F1  no Google font host in the doors, lib/ or account/');
const scanned = Array.from(new Set(DOORS.concat(walk('lib', []), walk('account', []))));
const named = scanned.filter((rel) => GOOGLE.test(read(rel) || ''));
check('F1  ' + scanned.length + ' files carry no fonts.googleapis.com / fonts.gstatic.com', named.length === 0, named);

console.log('F2  every door links /lib/shared/fonts.css');
for (const door of DOORS) {
  const html = read(door);
  check('F2  ' + door + ' links /lib/shared/fonts.css', !!html && /<link href="\/lib\/shared\/fonts\.css" rel="stylesheet" \/>/.test(html));
}

console.log('F3  every src in fonts.css is a woff2 under public/fonts/');
const css = read('lib/shared/fonts.css') || '';
check('F3  lib/shared/fonts.css exists and holds @font-face blocks', /@font-face\s*\{/.test(css));
const srcs = Array.from(css.matchAll(/src:\s*url\(([^)]+)\)/g), (m) => m[1].replace(/['"]/g, ''));
check('F3  fonts.css names at least one src', srcs.length > 0);
for (const src of Array.from(new Set(srcs))) {
  const ok = src.startsWith('/public/fonts/') && fs.existsSync(path.join(root, src));
  const magic = ok ? fs.readFileSync(path.join(root, src)).subarray(0, 4).toString('latin1') : '';
  check('F3  ' + src + ' exists and is woff2', ok && magic === 'wOF2', { ok, magic });
}

console.log('F4  every family tokens.css names has a face');
const tokens = read('lib/shared/tokens.css') || '';
const families = Array.from(tokens.matchAll(/--font-[a-z]+:\s*'([^']+)'/g), (m) => m[1]);
check('F4  tokens.css names the three families', ['Orbitron', 'Rajdhani', 'Share Tech Mono'].every((f) => families.includes(f)), families);
const faces = new Set(Array.from(css.matchAll(/font-family:\s*'([^']+)'/g), (m) => m[1]));
for (const fam of families) check('F4  ' + fam + ' has an @font-face in fonts.css', faces.has(fam));

console.log('F5  each family\'s licence ships');
for (const [fam, file] of Object.entries(LICENCES)) {
  const txt = read('public/fonts/' + file) || '';
  check('F5  public/fonts/' + file + ' is the SIL OFL 1.1 for ' + fam,
    txt.includes('SIL Open Font License, Version 1.1') && txt.includes('SIL OPEN FONT LICENSE Version 1.1'));
}

console.log(failures ? '\nFAIL  ' + failures + ' check(s)' : '\nPASS  b1872_fonts_self_hosted');
process.exit(failures ? 1 : 0);
