// F-34 Phase 0 — bundle worker/index.js → _worker.js (Pages advanced mode entry). Separate from the
// frontend build.mjs: the worker is BUNDLED (not transformed) for the workerd runtime, node: builtins
// left external so nodejs_compat provides them. This is the pipeline better-auth's worker will reuse.
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['worker/index.js'],
  outfile: '_worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',                 // workerd is browser-like; node: builtins are marked external below
  target: 'es2022',
  external: ['node:*', 'cloudflare:*'], // provided by the runtime (nodejs_compat / CF bindings)
  conditions: ['workerd', 'worker', 'browser'],
  legalComments: 'none',
});
console.log('wrote _worker.js');
