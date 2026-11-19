#!/usr/bin/env node
/**
 * stub.mjs — assembles the suite's stand-in server half into program/conformance/out/serve/ (gitignored), for the
 * launcher to carry until argo-a4-program-serve merges (ruling `argo-a4-launcher-build` §4.2):
 *   stub/holocron.capnp, stub/router.js, stub/inner.js       this directory's stand-ins
 *   harness_router.js                                         scripts/argo_a4/router.js, the measured harness, unchanged
 *   bundle/index.js                                           the table server, bundled by `run_table.mjs bundle`
 *                                                             (wrangler --dry-run; publishes nothing)
 *   node program/conformance/stub.mjs        Prints the directory. No other arguments.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
if (process.argv.length > 2) { console.error('usage: node program/conformance/stub.mjs'); process.exit(2); }
const out = path.join(HERE, 'out', 'serve');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'bundle'), { recursive: true });
for (const f of ['holocron.capnp', 'router.js', 'inner.js']) fs.copyFileSync(path.join(HERE, 'stub', f), path.join(out, f));
fs.copyFileSync(path.join(REPO, 'scripts', 'argo_a4', 'router.js'), path.join(out, 'harness_router.js'));
const tmp = path.join(HERE, 'out', 'bundle');
const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'argo_a4', 'run_table.mjs'), 'bundle', '--out', tmp], { stdio: 'inherit' });
if (r.status !== 0) { console.error('bundle failed'); process.exit(1); }
fs.copyFileSync(path.join(tmp, 'index.js'), path.join(out, 'bundle', 'index.js'));
console.log(out);
