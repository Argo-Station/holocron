#!/usr/bin/env node
/**
 * room_server_imports.cjs — every relative import in the room Worker RESOLVES ON DISK.
 *
 * WHY THIS EXISTS, and it is not hypothetical. `room-server/src/room.js` imports
 * `cloudflare:workers`, which plain Node cannot resolve — so NO guard in this battery can load
 * the Worker, and a broken import inside it is invisible to all 140 of them. On 2026-08-26 that
 * gap cashed in: a file was renamed `ttl.js` -> `ttl.mjs` in a `git mv && sed` chain, the `git mv`
 * failed because the file was untracked, the `&&` short-circuited, and the import fix never ran.
 * The Worker could not build for four commits. Nothing went red. It was caught only because a
 * `wrangler deploy --dry-run` was run before the real deploy.
 *
 * `--dry-run` IS the complete check and it stays the pre-deploy step — but it needs npx, a
 * network round trip for telemetry, and several seconds, which is not battery shape. This is the
 * cheap 90%: a static scan of every relative specifier against the filesystem. It runs in
 * milliseconds, needs nothing installed, and would have caught that defect on the commit that
 * introduced it.
 *
 * NOT a substitute for the workerd harness (ruling holotable-substrate-stage-a R-HSA-1) — that
 * proves the Worker WIRES its rules. This proves only that its files can find each other.
 *
 * ONE LOOP PER DEPLOYABLE (ruling `encounters-e6-plumbing` ADDENDUM 1 P6.3): the table server is a third deployable
 * with the same blind spot (three of its files import `cloudflare:workers`), so every assert below runs once per Worker
 * directory. The room server's asserts are kept as they were, and check 4 now covers EVERY binding's class, not only
 * the first. The file keeps its name because the battery, OPERATIONS and PRAXIS cite it.
 *
 * Run:  node test/room_server_imports.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// [label, directory, the least number of sources a real tree has]
const DEPLOYABLES = [['room', 'room-server', 3], ['table', 'table-server', 4]];

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

console.log('room_server_imports — each Worker\'s files can find each other\n');

for (const [name, dir, least] of DEPLOYABLES) {
  const HOME = path.join(ROOT, dir);
  const SRC = path.join(HOME, 'src');
  if (!fs.existsSync(path.join(HOME, 'wrangler.jsonc'))) { console.log('  SKIP  ' + name + ': no ' + dir + '/ in this tree'); continue; }

  const files = fs.readdirSync(SRC).filter((f) => /\.(js|mjs)$/.test(f));
  check(name + ' 1 the scan found the Worker\'s sources (non-vacuous)', files.length >= least, files);

  const broken = [];
  let relCount = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
    // static `import ... from '<spec>'` and `export ... from '<spec>'`
    const specs = [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;          // bare/builtin (cloudflare:workers) — not ours
      relCount++;
      const target = path.resolve(SRC, spec);
      if (!fs.existsSync(target)) broken.push(`${f} -> ${spec}`);
    }
  }
  check(name + ' 2 every RELATIVE import resolves to a file that exists', broken.length === 0, broken);
  check(name + ' 2b the import scan is non-vacuous (it found relative imports to check)', relCount > 0,
        `${relCount} relative imports`);

  // The entrypoint the deploy config names must exist too — a wrong `main` fails at deploy, not review.
  const cfgRaw = fs.readFileSync(path.join(HOME, 'wrangler.jsonc'), 'utf8');
  const cfg = JSON.parse(cfgRaw.replace(/^\s*\/\/.*$/gm, ''));
  const mainOk = fs.existsSync(path.join(HOME, cfg.main));
  check(name + ' 3 wrangler `main` points at a file that exists', mainOk, cfg.main);

  // Each Durable Object class a binding names must actually be exported from that entrypoint.
  const entry = mainOk ? fs.readFileSync(path.join(HOME, cfg.main), 'utf8') : '';
  const classes = ((cfg.durable_objects && cfg.durable_objects.bindings) || []).map((b) => b.class_name);
  const missing = classes.filter((cls) => !(new RegExp('export\\s*\\{[^}]*\\b' + cls + '\\b').test(entry)
      || new RegExp('export\\s+class\\s+' + cls + '\\b').test(entry)));
  check(name + ' 4 every Durable Object class a binding names is EXPORTED from the entrypoint',
        classes.length > 0 && missing.length === 0, { classes, missing });
}

console.log('');
console.log(`room_server_imports: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
