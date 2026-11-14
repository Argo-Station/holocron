// F-34 Phase B — /api/v1/sync: the wire contract (C3), over the C2 tables.
//
//   GET  /api/v1/sync        → every key this person has, with its value and version
//   PUT  /api/v1/sync/:key   → write one key, CONDITIONAL on the version the client believes
//
// THE SERVER NEVER PARSES INSIDE A PAYLOAD. It checks that the body is a string, checks its size,
// and stores it. Every decision about what a payload MEANS — merging, migrating, which of two
// records is newer — is the client's, because the client is the thing that knows these shapes and
// the server would go stale the moment a store module changed. Anything here that needed to
// understand a payload would be a design error.
import { createAuth } from './auth.js';

const json = (body, status, headers) =>
  Response.json(body, { status: status || 200, headers: Object.assign({ 'cache-control': 'no-store' }, headers || {}) });

// THE COMPOSED v1 KEY SET (ruling `f34-phase-b-scope` §3, D-B7/D-B8/D-B9). Enforced HERE as well as
// on the client, because an allow-list that lives only in the caller is a suggestion: one client
// bug and this table fills with keys nobody ruled on and nobody can merge.
//
// `swrpg_store_shelves_v1` and `swrpg_store_holds_v1` are ABSENT ON PURPOSE — shelf ids encode
// local list position and collide across devices, and holds is a bare string array whose reader
// deletes anything richer. They join when their identities are fixed, in their own lap.
const SYNC_KEYS = new Set([
  'swrpg_saved_characters',
  'swrpg_creation_draft',
  'swrpg_deleted_ids',
  'swrpg_vessels_v1',
  // K5 · the fleet units (ruling `shipyard-s3-contracts` R-S3K-5; S4 JOB 2, R-S4G-17). A LIST key merged by
  // unit id in syncMerge. No writer while the Yard's K9 is OFF; it ships with the Pages deploy of commercial.
  'swrpg_fleet_units_v1',
  'swrpg_npc_cast',
  'swrpg_npc_bench',
  'swrpg_gm_vehicle_overrides',
  'swrpg_mods',
  'swrpg_active_sources',
  // The tenth, added by ruling `f5-map-pins` §3 (R-F5-1). F-5 shipped local-only because its
  // concept was written before accounts existed; the nine above already followed a person between
  // devices and a GM's campaign pins did not, which is the inconsistency this closes. WHOLE in
  // syncMerge — a flat planetId→{note,when} map with no per-record identity to merge.
  'swrpg_map_pins',
  // The twelfth: the group record (ruling `release-r4-shapes` R-R4S-5 item 3; R6 lane A). A LIST key in syncMerge,
  // merged by party id. Its one writer is lib/shared/partyStore.js.
  'swrpg_party_v1',
  // The thirteenth: the campaign record (ruling `encounters-e6-plumbing` ADDENDUM 1, C2; save shape
  // `encounters-e4-campaign-redraw` §5). A LIST key in syncMerge, merged by campaign id. Its one writer is
  // lib/shared/campaignStore.js. Ships with the Pages deploy, Jason's word.
  'swrpg_campaigns',
]);

// THE HOMEBREW FAMILIES (contract `f100-homebrew-sync-contract` R-HSC-1, -4, -11; card `f100-ms-build` R-MSB-5). They sit
// BESIDE the Set rather than in it because an instance or a pinned version is not a fixed name — so they are admitted by
// PATTERN, and the patterns are as tight as the ids they carry: a collection's 48-bit instance (12 lowercase hex), the
// one meta row, and a version row named by its packId (^[a-z0-9_]+$, at most 64) and its 12-hex packVersion. The value
// is still never read: a pack row's envelope is `{"enc":"gzip-b64","v":…}` or the tombstone `{"enc":"gone"}`, and to
// this file both are just a string with a size.
const PACK_META_KEY = 'swrpg_user_pack_meta';
const PACK_KEY_RES = [
  /^swrpg_user_pack:[0-9a-f]{12}$/,
  /^swrpg_user_pack_meta$/,
  /^swrpg_user_pack_v:[a-z0-9_]{1,64}@[0-9a-f]{12}$/,
];
function isPackKey(key) { return PACK_KEY_RES.some(function (re) { return re.test(key); }); }

// The account backstop (R-HSC-6/-7): the sum of every collection and pinned-version row one person holds, ≤ 5,000,000
// bytes. It is the server's ONLY account-level refusal (card ADDENDUM 1 R-MSB-8): the 1,000-entry cap is the client's
// walk, and this is the floor under a client that does not walk honestly. The meta row is tiny and not counted.
const PACK_BACKSTOP_BYTES = 5000000;

// The free-limit breaker's budget (R-HSC-8), from `[vars]` in wrangler.toml; these defaults are the ruled numbers, so
// a binding without the vars behaves as ruled rather than unguarded.
function budgetOf(env) {
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    rows: num(env && env.SYNC_BUDGET_ROWS_WRITTEN_PER_DAY, 100000),
    storage: num(env && env.SYNC_BUDGET_STORAGE_BYTES, 500000000),
    stopAt: num(env && env.SYNC_STOP_AT, 0.85),
  };
}
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// D1's hard ceiling is 2,000,000 bytes for a string or row (Cloudflare's published limit, read
// rather than assumed). The cap sits below it so the row — value plus key plus ids — cannot cross,
// and so a payload approaching it fails with a SENTENCE instead of a database error nobody can act
// on. The roster is the only key that could realistically reach this: it has no cap on how many
// characters it holds.
const MAX_VALUE_BYTES = 1500000;

// History depth (§4). Ten is the architecture's number: enough that a person who notices a bad
// merge a few sessions later can still get their work back, bounded enough that a busy key cannot
// eat a 500 MB free-plan database on its own.
const HISTORY_DEPTH = 10;

export async function handleSync(request, env, url) {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !session.user) return json({ ok: false, error: 'not_signed_in' }, 401);
  const userId = session.user.id;

  const rest = url.pathname.slice('/api/v1/sync'.length);

  if (rest === '' || rest === '/') {
    if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
    return pullAll(env, userId);
  }

  const key = decodeURIComponent(rest.replace(/^\//, ''));
  if (!(SYNC_KEYS.has(key) || isPackKey(key))) return json({ ok: false, error: 'key_not_synced', key }, 404);
  if (request.method !== 'PUT') return json({ ok: false, error: 'method_not_allowed' }, 405);
  return pushOne(request, env, userId, key);
}

// GET — the whole set in one round trip. The client pulls at load and after any conflict, so a
// manifest-then-fetch-each shape would cost N+1 requests to answer the same question.
async function pullAll(env, userId) {
  const rows = await env.DB
    .prepare('SELECT "key", "value_json", "version", "updatedAt" FROM "user_data" WHERE "userId" = ?')
    .bind(userId)
    .all();
  const keys = {};
  for (const r of (rows.results || [])) {
    keys[r.key] = { value: r.value_json, version: r.version, updatedAt: r.updatedAt };
  }
  return json({ ok: true, keys });
}

// PUT — one key, conditional on the version the client believes is current.
//
// Body: { value: <string>, version: <number>, entries?: <integer ≥ 0> }
//   `value`   the envelope verbatim, ALREADY SERIALISED by the client. A string, not an object:
//             re-serialising it here would let the server's JSON differ from the client's by key
//             order or number formatting, and the whole point is that it round-trips untouched.
//   `version` what the client last saw. 0 (or absent) means "I believe this key does not exist".
//   `entries` how many records the value carries, as the CLIENT counted them (R-HSC-5); stored, never checked against
//             the payload. A homebrew row's breaker reads it; every other key stores 0 by default.
//
// A mismatch is NOT an error the user should see — it is the normal outcome of two devices, and it
// returns 409 WITH the current row so the client can resolve without a second request.
async function pushOne(request, env, userId, key) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json' }, 400); }

  const value = body && body.value;
  if (typeof value !== 'string') return json({ ok: false, error: 'value_must_be_string' }, 400);

  // Byte length, not string length — a character can be several bytes and the limit is bytes.
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > MAX_VALUE_BYTES) {
    return json({ ok: false, error: 'too_large', bytes, limit: MAX_VALUE_BYTES }, 413);
  }

  const expected = Number(body && body.version) || 0;
  const now = Date.now();
  // R-HSC-5: the count the client declares beside its value — a number the client computed, read off the BODY (never
  // out of the payload). Stored for every key; only the homebrew family's breaker reads it. Absent or bad → 0.
  const entries = Number.isInteger(body && body.entries) && body.entries >= 0 ? body.entries : 0;
  const pack = isPackKey(key);

  // `.all()` rather than `.first()`: its `meta.size_after` is the whole database's size, which the storage breaker reads.
  const read = await env.DB
    .prepare('SELECT "value_json", "version", "entries" FROM "user_data" WHERE "userId" = ? AND "key" = ?')
    .bind(userId, key)
    .all();
  const current = (read.results && read.results[0]) || null;

  const currentVersion = current ? current.version : 0;
  if (currentVersion !== expected) {
    // The stale writer loses cleanly and is handed what it needs to catch up.
    return json({
      ok: false, error: 'version_conflict', key,
      current: { value: current ? current.value_json : null, version: currentVersion },
    }, 409);
  }

  if (pack) {
    // R-HSC-6/-7 — the account backstop, over every OTHER collection and version row plus this one's new bytes. Bytes,
    // so the BLOB cast (SQLite's length() of TEXT counts characters).
    const held = await env.DB
      .prepare('SELECT COALESCE(SUM(length(CAST("value_json" AS BLOB))), 0) AS "n" FROM "user_data" WHERE "userId" = ? AND "key" != ?'
        + ' AND ("key" GLOB \'swrpg_user_pack:*\' OR "key" GLOB \'swrpg_user_pack_v:*\')')
      .bind(userId, key)
      .first();
    const total = Number((held && held.n) || 0) + (key === PACK_META_KEY ? 0 : bytes);
    if (key !== PACK_META_KEY && total > PACK_BACKSTOP_BYTES) {
      return json({ ok: false, error: 'over_cap', bytes: total, limit: PACK_BACKSTOP_BYTES }, 413);
    }
    // R-HSC-6/-8 — the free-limit breaker refuses homebrew GROWTH only (declared entries above what is stored), so a
    // rewrite, a shrink and a tombstone still go through and characters are never refused (the Prime Directive).
    const stored = current ? Number(current.entries) || 0 : 0;
    if (entries > stored) {
      const paused = await breakerOf(env, now, read.meta);
      if (paused) return paused;
    }
  }

  const next = currentVersion + 1;
  const statements = [];

  // The value being REPLACED goes to history first. On a create there is nothing to keep. The homebrew family keeps NO
  // history (R-HSC-7): eleven copies of a compressed collection would eat the free plan, and its loser is the other
  // device's own copy, which the conflict prompt keeps until it is answered (R-HSC-14).
  if (current && !pack) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO "user_data_history" ("userId", "key", "value_json", "version", "replacedAt") VALUES (?, ?, ?, ?, ?)'
      ).bind(userId, key, current.value_json, currentVersion, now)
    );
  }

  statements.push(
    env.DB.prepare(
      'INSERT INTO "user_data" ("userId", "key", "value_json", "version", "updatedAt", "entries") VALUES (?, ?, ?, ?, ?, ?)'
      + ' ON CONFLICT("userId", "key") DO UPDATE SET "value_json" = excluded."value_json",'
      + ' "version" = excluded."version", "updatedAt" = excluded."updatedAt", "entries" = excluded."entries"'
    ).bind(userId, key, value, next, now, entries)
  );

  // Prune to the most recent HISTORY_DEPTH for this key. Done in the same batch so history can
  // never be left unbounded by a later failure. (Nothing to prune for the homebrew family: it never inserts.)
  if (!pack) {
    statements.push(
      env.DB.prepare(
        'DELETE FROM "user_data_history" WHERE "userId" = ? AND "key" = ? AND "id" NOT IN'
        + ' (SELECT "id" FROM "user_data_history" WHERE "userId" = ? AND "key" = ? ORDER BY "id" DESC LIMIT ?)'
      ).bind(userId, key, userId, key, HISTORY_DEPTH)
    );
  }

  const results = await env.DB.batch(statements);
  await countDay(env, now, results);
  return json({ ok: true, key, version: next, updatedAt: now });
}

// ── the breaker and its counter (R-HSC-8) ──────────────────────────────────────────────────────────────────────────
// breakerOf → a 503 Response when homebrew growth must pause, else null. Storage first (it does not clear with the
// day, so it carries no Retry-After); then today's writes, which clear at 00:00 UTC. A trip is recorded on today's row
// once. The counters are the application's own (`meta` off the binding), never a Cloudflare API call.
async function breakerOf(env, now, meta) {
  const b = budgetOf(env);
  const size = Number(meta && meta.size_after) || 0;
  let cause = null, headers = null;
  if (size >= b.stopAt * b.storage) cause = 'storage';
  else {
    const row = await env.DB.prepare('SELECT "rows_written" FROM "usage_day" WHERE "day" = ?').bind(dayOf(now)).first();
    if (row && Number(row.rows_written) >= b.stopAt * b.rows) {
      cause = 'daily_writes';
      const midnight = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
      headers = { 'retry-after': String(Math.max(1, Math.ceil((midnight - now) / 1000))) };
    }
  }
  if (!cause) return null;
  try {
    await env.DB.prepare(
      'INSERT INTO "usage_day" ("day", "rows_written", "rows_read", "requests", "tripped_at") VALUES (?, 0, 0, 0, ?)'
      + ' ON CONFLICT("day") DO UPDATE SET "tripped_at" = COALESCE("usage_day"."tripped_at", excluded."tripped_at")'
    ).bind(dayOf(now), new Date(now).toISOString()).run();
  } catch (e) { /* the refusal stands even if its bookkeeping cannot be written */ }
  return json({ ok: false, error: 'sync_paused', cause, scope: 'homebrew' }, 503, headers);
}

// countDay — AFTER the batch, its own statement: what the batch wrote and read, plus this one row, and one request.
// It can never fail a push (a write that landed is reported as landed); a GET is not counted.
async function countDay(env, now, results) {
  let written = 1, readRows = 0;
  (results || []).forEach(function (r) { const m = (r && r.meta) || {}; written += Number(m.rows_written) || 0; readRows += Number(m.rows_read) || 0; });
  try {
    await env.DB.prepare(
      'INSERT INTO "usage_day" ("day", "rows_written", "rows_read", "requests", "tripped_at") VALUES (?, ?, ?, 1, NULL)'
      + ' ON CONFLICT("day") DO UPDATE SET "rows_written" = COALESCE("usage_day"."rows_written", 0) + excluded."rows_written",'
      + ' "rows_read" = COALESCE("usage_day"."rows_read", 0) + excluded."rows_read", "requests" = COALESCE("usage_day"."requests", 0) + 1'
    ).bind(dayOf(now), written, readRows).run();
  } catch (e) { /* counting is best-effort; the write it counts already committed */ }
}

export { SYNC_KEYS, MAX_VALUE_BYTES, HISTORY_DEPTH, PACK_KEY_RES, PACK_META_KEY, PACK_BACKSTOP_BYTES, isPackKey };
