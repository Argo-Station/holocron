/**
 * ms_d1_harness.js — the sync worker in node, over a REAL SQLite database (F-100 MS build,
 * card f100-ms-build R-MSB-6). Not a guard (the battery runs test/*.cjs only); the guards that
 * drive worker/sync.js require it.
 *
 * WHAT IS REAL: worker/sync.js itself, bundled by esbuild exactly as the Pages build bundles it,
 * and every SQL statement it issues — run by node:sqlite against a database built from the repo's
 * own migrations/*.sql, in filename order. WHAT IS STUBBED: `./auth.js` only (a cookie names the
 * user), and D1's binding surface (prepare/bind/first/all/run/batch), whose `meta` carries the
 * three fields the worker reads: rows_written (SQLite's changes()), rows_read (0 — SQLite does not
 * report it) and size_after (page_count × page_size, the whole database in bytes, as D1 reports).
 * The real Pages emulator is the gate's probe (scripts/f100_ms_build_probe.cjs); this is the fast
 * instrument a battery can run.
 *
 * makeWorker({ ref?, migrations? }) → { handle(method, key, body?, user?), db, sql(q, ...args), env }
 *   ref         a commit: bundle THAT commit's worker/sync.js (the cut's, for R-MSB-3) instead of
 *               this tree's
 *   migrations  the filenames to apply (default: every migrations/*.sql in this tree)
 *   env         extra bindings (the budget vars), merged over { DB }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..', '..');

function d1Over(db) {
  const size = () => {
    const pc = db.prepare('PRAGMA page_count').get().page_count;
    const ps = db.prepare('PRAGMA page_size').get().page_size;
    return pc * ps;
  };
  function stmt(sql, args) {
    const run = () => {
      const p = db.prepare(sql);
      const reader = /^\s*(SELECT|PRAGMA|WITH)/i.test(sql);
      if (reader) return { results: p.all(...args), meta: { rows_written: 0, rows_read: 0, size_after: size(), changes: 0 } };
      const r = p.run(...args);
      return { results: [], meta: { rows_written: Number(r.changes), rows_read: 0, size_after: size(), changes: Number(r.changes) } };
    };
    return {
      bind: (...a) => stmt(sql, a),
      first: async () => { const r = run(); return r.results.length ? Object.assign({}, r.results[0]) : null; },
      all: async () => { const r = run(); return { results: r.results.map((x) => Object.assign({}, x)), meta: r.meta, success: true }; },
      run: async () => Object.assign({ success: true }, run()),
      _run: run,
    };
  }
  return {
    prepare: (sql) => stmt(sql, []),
    batch: async (list) => {
      db.exec('BEGIN');
      try {
        const out = list.map((s) => Object.assign({ success: true }, s._run()));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

function bundle(ref) {
  const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
  const dir = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'ms-d1-'));
  // the worker's source (this tree's, or a commit's) beside a stub auth.js, bundled with no plugin
  const entry = path.join(dir, 'sync.js');
  fs.writeFileSync(entry, ref ? execFileSync('git', ['show', ref + ':worker/sync.js'], { cwd: ROOT })
    : fs.readFileSync(path.join(ROOT, 'worker/sync.js')));
  fs.writeFileSync(path.join(dir, 'auth.js'),
    'export function createAuth() { return { api: { getSession: async ({ headers }) => {'
    + ' const u = headers.get("x-test-user"); return u ? { user: { id: u } } : null; } } }; }\n');
  const out = path.join(dir, 'sync.bundle.cjs');
  esbuild.buildSync({ entryPoints: [entry], outfile: out, bundle: true, format: 'cjs', platform: 'node', logLevel: 'silent' });
  const mod = require(out);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* tmp */ }
  return mod;
}

function makeWorker(opts) {
  opts = opts || {};
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const files = opts.migrations || fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /\.sql$/.test(f)).sort();
  files.forEach((f) => db.exec(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8')));
  const iso = new Date().toISOString();
  ['u1', 'u2'].forEach((id) => db.prepare('INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES (?,?,?,0,?,?)')
    .run(id, id, 'ms_' + id + '@placeholder.invalid', iso, iso));
  const mod = bundle(opts.ref);
  const env = Object.assign({ DB: d1Over(db) }, opts.env || {});
  async function handle(method, key, body, user) {
    const url = new URL('http://local/api/v1/sync' + (key ? '/' + encodeURIComponent(key) : ''));
    const init = { method, headers: { 'x-test-user': user || 'u1', 'content-type': 'application/json' } };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await mod.handleSync(new Request(url, init), env, url);
    let json = null; try { json = await res.clone().json(); } catch (e) { json = null; }
    return { status: res.status, json, headers: res.headers };
  }
  const sql = (q, ...args) => db.prepare(q).all(...args).map((r) => Object.assign({}, r));
  return { handle, db, sql, env, mod };
}

module.exports = { makeWorker, d1Over, ROOT };
