#!/usr/bin/env node
/**
 * deploy_shape.cjs — the DEPLOY-SHAPE CONTRACT, asserted rather than remembered.
 * Ruling f34-phase0-pipeline-brief §F1 ("infrastructure-as-code, staged, with a guard from day one")
 * and §F2 (the availability levers).
 *
 * WHY THIS EXISTS: `wrangler.toml` at the repo root is config that Cloudflare Pages can read for the
 * PRODUCTION project. A wrong project name, a dropped compat flag, a changed output dir, or a secret
 * pasted into it are all one-line mistakes with outage-or-breach consequences — and none of them are
 * visible in a normal diff review. So they get a guard.
 *
 * THE STAGING (F1): during the spike, wrangler.toml is BRANCH-ONLY and names the spike project. At
 * Phase A it merges CORRECTED to the production project and becomes the single source of truth. This
 * guard enforces exactly that staging: the spike name is legal ONLY while the file is off `commercial`;
 * the moment it is on `commercial`, PRODUCTION_PROJECT below must be filled in with the real project
 * name and the file must match it. The unknown BLOCKS the merge instead of being forgotten.
 *
 * F4 and F5 cover the two Workers projects beside the site: the room server and the table server.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOML = path.join(ROOT, 'wrangler.toml');
const ROUTES = path.join(ROOT, '_routes.json');

// ── the contract ─────────────────────────────────────────────────────────────
// The real Cloudflare Pages project name, read off the account 2026-07-25 (`wrangler pages project
// list` → the project serving holocron.work / www.holocron.work / sw-rpg-character-creator.pages.dev).
// Was null through Phase 0 so the unknown BLOCKED the Phase A merge rather than being forgotten.
const PRODUCTION_PROJECT = 'sw-rpg-character-creator';
const SPIKE_PROJECT = 'holocron-login-spike';
const REQUIRED_FLAGS = ['nodejs_compat'];
const REQUIRED_OUTPUT_DIR = '.';        // production's Pages output directory is the repo root
const SECRET_HINTS = [/client_secret/i, /_secret\s*=/i, /api[_-]?key\s*=/i, /password/i, /BETTER_AUTH_SECRET/];

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

function currentBranch() {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim(); }
  catch (e) { return null; }
}

// minimal TOML reads — enough for the flat keys this contract covers (no dep, ponytail: a parser
// would be more code than the contract it checks).
const readKey = (src, key) => {
  const m = src.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)$', 'm'));
  return m ? m[1].trim().replace(/\s*#.*$/, '') : null;
};
const unquote = (v) => (v || '').replace(/^["']|["']$/g, '');

console.log('deploy_shape — the wrangler.toml / _routes.json contract\n');

if (!fs.existsSync(TOML)) {
  // Legal: production may be dashboard-configured until Phase A merges the corrected file.
  console.log('  SKIP  no wrangler.toml in the tree (dashboard-configured; nothing to assert)');
  process.exit(0);
}

const toml = fs.readFileSync(TOML, 'utf8');
const branch = currentBranch();
const onCommercial = branch === 'commercial';
const name = unquote(readKey(toml, 'name'));

// ── F1: the project name, staged ─────────────────────────────────────────────
if (onCommercial) {
  check('F1 PRODUCTION_PROJECT is filled in before wrangler.toml rides `commercial` (Phase A gate)',
    PRODUCTION_PROJECT !== null,
    'wrangler.toml is on commercial but PRODUCTION_PROJECT is still null — set it to the real ' +
    'Cloudflare Pages project name in test/deploy_shape.cjs, and make wrangler.toml match.');
  if (PRODUCTION_PROJECT !== null) {
    check('F1 wrangler.toml names the PRODUCTION project on `commercial`', name === PRODUCTION_PROJECT,
      { name, want: PRODUCTION_PROJECT });
  }
  check('F1 the spike project name never reaches `commercial`', name !== SPIKE_PROJECT, { name });
} else {
  check('F1 off `commercial`, the file names the spike project (branch-only staging)',
    name === SPIKE_PROJECT || name === PRODUCTION_PROJECT, { name, branch });
}

// ── F1: the pinned deploy shape ──────────────────────────────────────────────
const flags = readKey(toml, 'compatibility_flags') || '';
REQUIRED_FLAGS.forEach((f) => check('F1 compatibility_flags pins ' + f, flags.includes(f), { flags }));
check('F1 compatibility_date is pinned (YYYY-MM-DD)',
  /^\d{4}-\d{2}-\d{2}$/.test(unquote(readKey(toml, 'compatibility_date') || '')),
  readKey(toml, 'compatibility_date'));
check('F1 pages_build_output_dir matches production\'s output dir',
  unquote(readKey(toml, 'pages_build_output_dir') || '') === REQUIRED_OUTPUT_DIR,
  readKey(toml, 'pages_build_output_dir'));

// ── F1: secrets never live in the file (wrangler secret bindings only) ───────
const secretLine = toml.split('\n').find((l) => !l.trim().startsWith('#') && SECRET_HINTS.some((r) => r.test(l)));
check('F1 no secrets in wrangler.toml (wrangler secret bindings only)', !secretLine, secretLine);

// ── F3: the PRODUCTION BUILD actually produces the worker ────────────────────
// Cloudflare Pages runs ONE build command for this git-connected project — `npm install && npm run
// build` (Docs/OPERATIONS.md) — and it is set in the dashboard, not in this repo. So `npm run build`
// is the ONLY hook the repo controls, and if it does not bundle worker/index.js into _worker.js then
// NO WORKER DEPLOYS: every /api/* path falls through to the SPA's `_redirects` and answers an HTML
// soft-200. That failure is invisible from a normal diff and from every local test, because locally
// the worker is bundled by hand.
//
// EMPIRICAL, 2026-08-05: caught at the pre-push gate of the Phase A deploy. `build` was
// `node build.mjs` alone while the worker had its own separate `build:worker` script, and the live
// site proved it — `https://holocron.work/api/ping` answered `text/html`, the SPA shell, not the
// worker's JSON. The deploy would have shipped the whole login machinery and none of it would have
// been reachable, which would have made C-PA-5's live drive impossible while looking like success.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const buildScript = (pkg.scripts && pkg.scripts.build) || '';
check('F3 `npm run build` bundles the worker (Pages runs this ONE command; else no worker deploys)',
  /worker\/build\.mjs/.test(buildScript) || /build:worker/.test(buildScript), buildScript);
check('F3 the worker bundler writes _worker.js at the deploy root (Pages advanced-mode entry)',
  /outfile:\s*'_worker\.js'/.test(fs.readFileSync(path.join(ROOT, 'worker/build.mjs'), 'utf8')));
check('F3 _worker.js is gitignored (generated at build time, never committed)',
  fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').some((l) => l.trim() === '_worker.js'));

// ── F2: the availability levers exist and are shaped right ───────────────────
check('F2 _routes.json exists (lever 1 — static assets bypass the worker)', fs.existsSync(ROUTES));
if (fs.existsSync(ROUTES)) {
  let routes = null;
  try { routes = JSON.parse(fs.readFileSync(ROUTES, 'utf8')); } catch (e) { /* reported below */ }
  check('F2 _routes.json is valid JSON', routes !== null);
  if (routes) {
    check('F2 _routes.json includes ONLY /api/* (the app can never route through auth code)',
      Array.isArray(routes.include) && routes.include.length === 1 && routes.include[0] === '/api/*',
      routes.include);
  }
}
const worker = fs.existsSync(path.join(ROOT, 'worker/index.js'))
  ? fs.readFileSync(path.join(ROOT, 'worker/index.js'), 'utf8') : '';
check('F2 the worker fails open — non-API falls through to ASSETS', /startsWith\('\/api\/'\)[\s\S]{0,80}ASSETS\.fetch/.test(worker) || /!url\.pathname\.startsWith\('\/api\/'\)\)\s*return env\.ASSETS\.fetch/.test(worker));
check('F2 the worker catches API faults and answers with an honest JSON 500',
  /catch\s*\([\s\S]{0,200}?500/.test(worker));
check('F2 break-glass is environment-gated (never reachable in production)',
  !worker.includes('/api/__break') || /ALLOW_BREAK_GLASS/.test(worker));

// ── F4: THE SECOND DEPLOYABLE (HOLOTABLE slice 1, R-RSC-5) ───────────────────
//
// THE RE-POINT. Everything above assumes ONE deployable — the Pages project described by the root
// wrangler.toml. That assumption stopped being true when the room server landed: Cloudflare cannot
// host a Durable Object inside a Pages project ("You cannot create and deploy a Durable Object
// within a Pages project"), so the room server is a SEPARATE Workers project with its own config
// and its own `wrangler deploy`.
//
// The dangerous consequence, and the reason these asserts exist rather than a comment: a
// `commercial` push ships the site and does NOT ship the room server. So the two can silently
// drift apart, and "the site deployed fine" says nothing about the room. What this file can check
// is the BOUNDARY between them; whether the deployed Worker is CURRENT is a live question and
// belongs to scripts/check_room_worker.py, which is built to be able to answer no.
const ROOM_CFG = path.join(ROOT, 'room-server', 'wrangler.jsonc');
if (!fs.existsSync(ROOM_CFG)) {
  console.log('  SKIP  no room-server/wrangler.jsonc in this tree (pre-HOLOTABLE branch)');
} else {
  const rawRoom = fs.readFileSync(ROOM_CFG, 'utf8');
  // JSONC: strip // line comments that start a line or follow whitespace. Enough for this file,
  // and a dependency-free reader beats adding a parser to check a config.
  let roomCfg = null;
  try { roomCfg = JSON.parse(rawRoom.replace(/^\s*\/\/.*$/gm, '')); } catch (e) { /* reported */ }
  check('F4 room-server/wrangler.jsonc parses', roomCfg !== null);

  if (roomCfg) {
    check('F4 the room Worker has its OWN name, never the Pages project (a collision would '
        + 'point a wrangler deploy at the live site)',
      typeof roomCfg.name === 'string' && roomCfg.name.length > 0
      && roomCfg.name !== PRODUCTION_PROJECT && roomCfg.name !== SPIKE_PROJECT,
      { room: roomCfg.name, pages: PRODUCTION_PROJECT });
    check('F4 its entrypoint exists on disk (a wrong `main` fails at deploy, not at review)',
      typeof roomCfg.main === 'string'
      && fs.existsSync(path.join(ROOT, 'room-server', roomCfg.main)), roomCfg.main);
    check('F4 it declares the ROOM durable-object binding (without it there is no room)',
      roomCfg.durable_objects && Array.isArray(roomCfg.durable_objects.bindings)
      && roomCfg.durable_objects.bindings.some((b) => b && b.name === 'ROOM' && b.class_name),
      roomCfg.durable_objects);
    // `exports` and the legacy `migrations` array are MUTUALLY EXCLUSIVE — a config carrying both
    // is rejected at validation, which is a deploy-time failure for a review-time mistake.
    check('F4 it uses the CURRENT lifecycle shape (`exports`) and NOT the legacy `migrations` array',
      !!roomCfg.exports && !roomCfg.migrations, { exports: !!roomCfg.exports, migrations: !!roomCfg.migrations });
    check('F4 the DO is SQLite-backed (storage backends are IMMUTABLE once provisioned)',
      roomCfg.exports && roomCfg.exports.Room && roomCfg.exports.Room.storage === 'sqlite',
      roomCfg.exports);
    check('F4 observability is on (a Worker you cannot see is a Worker you cannot debug)',
      roomCfg.observability && roomCfg.observability.enabled === true);
  }

  const roomSecret = rawRoom.split('\n').find((l) => SECRET_HINTS.some((re) => re.test(l)));
  check('F4 no secrets in the room config either (wrangler secret bindings only)',
    !roomSecret, roomSecret);

  // THE BOUNDARY. The site build must not try to build or ship the room server, and the room
  // config must not reach into the site's. Either direction coupling them re-creates the single
  // deployable this re-point exists to stop assuming.
  check('F4 `npm run build` does NOT build the room server (a site push must not ship it)',
    !/room-server/.test(buildScript), buildScript);
  check('F4 the root wrangler.toml does not reference the room server',
    !fs.existsSync(TOML) || !/room-server/.test(fs.readFileSync(TOML, 'utf8')));
  check('F4 the deploy needle exists and can be pointed at a host (R-CNIG-R5)',
    fs.existsSync(path.join(ROOT, 'scripts', 'check_room_worker.py')));
}

// ── F5: THE THIRD DEPLOYABLE (ENCOUNTERS E6, ruling `encounters-e6-plumbing` ADDENDUM 1 P6.2, ADDENDUM 2 R-E6P-R4/R5) ──
//
// The table server is a Workers project of its own, for F4's reason, and F4 stays as it was (P6.2). Its one difference
// from the room server is deliberate: the upgrade URL carries a table code or tableId (P8.1), and the paper stores and
// LOGS NOTHING per table (D-524 b4, wire-online §5). So request logging is pinned OFF here, where F4 pins it on.
// TABLE_SERVER_DIR points this section at a copy (its bite runs on mutants of that copy, never on the tree).
const TABLE_DIR = process.env.TABLE_SERVER_DIR || path.join(ROOT, 'table-server');
const TABLE_CFG = path.join(TABLE_DIR, 'wrangler.jsonc');
if (!fs.existsSync(TABLE_CFG)) {
  console.log('  SKIP  no table-server/wrangler.jsonc in this tree (pre-E6 branch)');
} else {
  const rawTable = fs.readFileSync(TABLE_CFG, 'utf8');
  let tableCfg = null;
  try { tableCfg = JSON.parse(rawTable.replace(/^\s*\/\/.*$/gm, '')); } catch (e) { /* reported */ }
  check('F5 table-server/wrangler.jsonc parses', tableCfg !== null);

  if (tableCfg) {
    const roomName = fs.existsSync(ROOM_CFG) ? ((JSON.parse(fs.readFileSync(ROOM_CFG, 'utf8').replace(/^\s*\/\/.*$/gm, '')) || {}).name) : null;
    check('F5 the table Worker has its OWN name: not the Pages project, not the room server',
      typeof tableCfg.name === 'string' && tableCfg.name.length > 0
      && [PRODUCTION_PROJECT, SPIKE_PROJECT, roomName].indexOf(tableCfg.name) === -1,
      { table: tableCfg.name, room: roomName });
    check('F5 its entrypoint exists on disk',
      typeof tableCfg.main === 'string' && fs.existsSync(path.join(TABLE_DIR, tableCfg.main)), tableCfg.main);
    const binds = (tableCfg.durable_objects && tableCfg.durable_objects.bindings) || [];
    const CLASSES = { TABLE: 'Table', LISTING: 'Listing', CODE: 'Code' };
    check('F5 it binds all three objects: TABLE→Table, LISTING→Listing, CODE→Code (R-E6P-R5)',
      Object.keys(CLASSES).every((n) => binds.some((b) => b && b.name === n && b.class_name === CLASSES[n])), binds);
    check('F5 the current lifecycle shape (`exports`), not the legacy `migrations` array',
      !!tableCfg.exports && !tableCfg.migrations, { exports: !!tableCfg.exports, migrations: !!tableCfg.migrations });
    check('F5 all three classes are SQLite-backed, in the same config change (R-E6P-R5)',
      !!tableCfg.exports && Object.keys(CLASSES).every((n) => tableCfg.exports[CLASSES[n]] && tableCfg.exports[CLASSES[n]].storage === 'sqlite'),
      tableCfg.exports);
    // R-E6P-R4: Workers Logs records each request's URL, which carries the code and tableId. Absent or false only.
    check('F5 Workers Logs are NOT enabled (no `observability.enabled: true`, nor on its `logs`) — R-E6P-R4',
      !(tableCfg.observability && (tableCfg.observability.enabled === true
        || (tableCfg.observability.logs && tableCfg.observability.logs.enabled === true))), tableCfg.observability);
    check('F5 Logpush is NOT enabled — R-E6P-R4', tableCfg.logpush !== true, tableCfg.logpush);
    check('F5 no `vars` in the config (the TEST_EMPTY_MS knob is a `wrangler dev --var` only, never deployed)',
      !tableCfg.vars && !tableCfg.env, { vars: tableCfg.vars, env: !!tableCfg.env });
  }

  const tableSecret = rawTable.split('\n').find((l) => SECRET_HINTS.some((re) => re.test(l)));
  check('F5 no secrets in the table config', !tableSecret, tableSecret);

  // R-E6P-R4's second half: nothing in the source prints at all, so nothing can print a URL, code or id.
  const srcDir = path.join(TABLE_DIR, 'src');
  const srcFiles = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => /\.(m?js)$/.test(f)) : [];
  const printing = srcFiles.filter((f) => /\bconsole\s*\.\s*\w+\s*\(/.test(fs.readFileSync(path.join(srcDir, f), 'utf8')));
  check('F5 no console.* call anywhere in table-server/src (it logs nothing per table) — R-E6P-R4',
    srcFiles.length > 0 && printing.length === 0, { files: srcFiles.length, printing });
  // P6.1: no code shared with room-server/ (R-E6W-2), in either direction.
  const reaching = srcFiles.filter((f) => /room-server|\.\.\/\.\.\//.test(fs.readFileSync(path.join(srcDir, f), 'utf8')));
  check('F5 table-server/src imports nothing from room-server/ or the site (P6.1)', reaching.length === 0, reaching);

  check('F5 `npm run build` does NOT build the table server (a site push must not ship it)',
    !/table-server/.test(buildScript), buildScript);
  check('F5 the root wrangler.toml does not reference the table server',
    !fs.existsSync(TOML) || !/table-server/.test(fs.readFileSync(TOML, 'utf8')));
  check('F5 the room config does not reference the table server',
    !fs.existsSync(ROOM_CFG) || !/table-server|holocron-table/.test(fs.readFileSync(ROOM_CFG, 'utf8')));
  check('F5 the deploy needle exists and can be pointed at a host',
    fs.existsSync(path.join(ROOT, 'scripts', 'check_table_worker.py')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
