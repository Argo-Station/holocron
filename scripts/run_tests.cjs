#!/usr/bin/env node
/**
 * scripts/run_tests.cjs — `npm test`: every guard in test/*.cjs, one node process per file, in name order.
 * A bare `node test/*.cjs` runs only the first file, so the guards need a runner. Run `npm run build` first:
 * several guards read the built bundles.
 *
 *   node scripts/run_tests.cjs              every guard
 *   node scripts/run_tests.cjs room_client  only the guards whose file name contains a word given
 *
 * Exit 0 when every guard exits 0; otherwise 1, with each failing file and the tail of its output.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const words = process.argv.slice(2);
const files = fs.readdirSync(path.join(ROOT, 'test'))
  .filter((f) => f.endsWith('.cjs') && (!words.length || words.some((w) => f.includes(w))))
  .sort();
if (!files.length) { console.log('no guards matched'); process.exit(1); }

const failed = [];
const t0 = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join('test', f)], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  const ok = r.status === 0;
  console.log((ok ? '  ok    ' : '  FAIL  ') + f);
  if (!ok) failed.push([f, ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-8).join('\n')]);
}
console.log('\n' + (files.length - failed.length) + ' of ' + files.length + ' guards pass (' + Math.round((Date.now() - t0) / 1000) + 's)');
for (const [f, tail] of failed) console.log('\n── ' + f + '\n' + tail);
process.exit(failed.length ? 1 : 0);
