#!/usr/bin/env node
/**
 * law_check.mjs — the guard on law.mjs's per-OS reader (ruling `argo-a4-launcher-build` ADDENDUM 7 §1, ERRATUM
 * E-A4LB-3). Three checks, each by exit code:
 *   mac.identical  loadLaw(LAW, 'mac') is byte-identical (as JSON) to the reader at 0e0a0af5c, read from git
 *   win.loads      loadLaw(LAW, 'win') loads all six lists, each non-empty, S4's alert being the dialog (not the window)
 *   win.bites      a scratch copy of LAW with one word of the Windows S4 dialog changed reds the win S4 alert list, and
 *                  leaves the Mac lists as they were
 *   node program/conformance/law_check.mjs [--law <mockup.html>]
 * Writes only under the OS temp directory (the old reader and the scratch LAW). Exit 0 all pass, 1 any fails, 2 usage.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadLaw } from './law.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
let LAW = path.join(REPO, 'Docs', 'mockups', 'argo-a4-guide.html');
if (argv.length === 2 && argv[0] === '--law') LAW = path.resolve(argv[1]);
else if (argv.length) { console.error('usage: law_check.mjs [--law <mockup.html>]'); process.exit(2); }

const BASE_SHA = '0e0a0af5c';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holocron-lawcheck-'));
const results = [];
const check = (id, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${id}${ok ? '' : '  · ' + detail}`); };
try {
  const oldReader = path.join(tmp, 'law_old.mjs');
  fs.writeFileSync(oldReader, execFileSync('git', ['-C', REPO, 'show', `${BASE_SHA}:program/conformance/law.mjs`]));
  const old = await import(pathToFileURL(oldReader).href);
  const before = JSON.stringify(old.loadLaw(LAW, 'mac'));
  const now = JSON.stringify(loadLaw(LAW, 'mac'));
  check('mac.identical', before === now, `${before}\n  vs ${now}`);

  let win = null;
  try { win = loadLaw(LAW, 'win'); } catch (e) { check('win.loads', false, e.message); }
  if (win) {
    const keys = ['S1', 'S2', 'S3', 'S4window', 'S4alert', 'S5'];
    const ok = keys.every((k) => Array.isArray(win[k]) && win[k].length > 0) && JSON.stringify(win.S4alert) !== JSON.stringify(win.S4window)
      && win.S4alert.includes('Keep running') && !win.S4alert.includes('Open Holocron');
    check('win.loads', ok, JSON.stringify(win));

    // the bite: one word of the Windows S4 dialog changed in a scratch LAW
    const html = fs.readFileSync(LAW, 'utf8');
    const fig = html.indexOf('data-frame="window-s4-win-a"');
    const dlg = html.indexOf('class="win dlg"', fig);
    const word = html.indexOf('Players are at your table.', dlg);
    const scratch = path.join(tmp, 'law_bite.html');
    fs.writeFileSync(scratch, html.slice(0, word) + 'Players are at the table.' + html.slice(word + 'Players are at your table.'.length));
    const bitten = loadLaw(scratch, 'win');
    check('win.bites', fig > 0 && dlg > fig && word > dlg && JSON.stringify(bitten.S4alert) !== JSON.stringify(win.S4alert)
      && JSON.stringify(loadLaw(scratch, 'mac')) === now, JSON.stringify(bitten.S4alert));
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const failed = results.filter((x) => !x).length;
console.log(`RESULT ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
