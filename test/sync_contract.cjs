#!/usr/bin/env node
/**
 * sync_contract.cjs — the /api/v1/sync wire contract and the one law under it.
 * Ruling `accounts-sync-architecture` §4 (C2/C3) · `f34-phase-b-scope` §3-4 (the composed v1 set).
 *
 * THE LAW, and most of this file exists to keep it true: THE SERVER NEVER PARSES INSIDE A PAYLOAD.
 * `value_json` is the client's envelope verbatim. Every decision about what a payload means —
 * merging, migrating, which of two records is newer — belongs to the client, because the client is
 * the thing that knows these shapes. The moment the server learns one, it starts going stale on the
 * day a store module changes, and it becomes a second place that has to be migrated in lockstep.
 *
 * The SQL semantics (upsert, history-before-overwrite, prune depth, cascade on delete) are proven
 * against a real D1 in the gate rather than mocked here: `ON CONFLICT`, the `NOT IN (... LIMIT)`
 * prune and foreign-key cascade are database behaviour, and asserting them against a fake would
 * prove only that the fake agrees with me.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

console.log('sync_contract — the wire, and the law that the server stays ignorant\n');

const sync = read('worker/sync.js');
const v1 = read('worker/v1.js');
const mig = read('migrations/0002_c2_user_data.sql');

// ── THE LAW ──────────────────────────────────────────────────────────────────
const code = sync.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
// Asserted as ABSENCE OF THE WHOLE FAMILY, not of particular expressions. The first version of this
// pinned `JSON.stringify(value` and a mutation slipped straight past it as
// `JSON.stringify(body && body.value)` — same defect, different spelling. There is no legitimate
// reason for this file to serialise or parse anything: the request body arrives via
// `request.json()` and responses go out through `Response.json`, so any occurrence at all is the
// server starting to have opinions about a payload.
check('LAW the server never PARSES a payload — no JSON.parse anywhere in the file',
  !/JSON\.parse/.test(code));
check('LAW the server never RE-SERIALISES a payload — no JSON.stringify anywhere in the file',
  !/JSON\.stringify/.test(code));
check('LAW the value must already be a string, or it is refused',
  /typeof value !== 'string'/.test(sync) && /value_must_be_string/.test(sync));
check('LAW the payload is a BOUND parameter, never interpolated into SQL',
  !/value_json[^\n]*\$\{/.test(code) && !/\+\s*value\s*\+/.test(code));

// ── the composed v1 key set (D-B7 / D-B8 / D-B9) ─────────────────────────────
// RE-POINTED to ten by ruling `f5-map-pins` §3 (R-F5-1), which names `swrpg_map_pins` and its WHOLE
// class in writing. The nine-key form of this assert went RED the moment the key landed, which is
// the assert doing its job — it is re-pointed on the architect's paper, not rewritten to match
// whatever the code now does. `test/sync_pins_key.cjs` is the tenth key's own guard.
const RULED = ['swrpg_saved_characters', 'swrpg_creation_draft', 'swrpg_deleted_ids',
  'swrpg_vessels_v1', 'swrpg_npc_cast', 'swrpg_npc_bench', 'swrpg_gm_vehicle_overrides',
  'swrpg_mods', 'swrpg_active_sources', 'swrpg_map_pins',
  // ELEVEN since ruling `shipyard-s3-contracts` R-S3K-5 (K5, the fleet units), built in S4 JOB 2 (R-S4G-17):
  // the ratified guard row "the key is in both lists" — here the worker's; sync_merge pins the LISTS side.
  'swrpg_fleet_units_v1',
  // TWELVE since ruling `release-r4-shapes` R-R4S-5 item 3 (the group record; card `release-r6-backend-card` §3):
  // LISTS by party id in syncMerge (sync_merge pins that side) and here in the worker's set.
  'swrpg_party_v1',
  // THIRTEEN since ruling `encounters-e6-plumbing` ADDENDUM 1, C2 (the campaign record): LISTS by campaign id in syncMerge (sync_merge
  // pins that side) and here in the worker's set. KEEPS "exactly the ruled keys"; the count is derived, so it moves itself.
  'swrpg_campaigns'];
for (const k of RULED) check('KEY SET syncs ' + k, new RegExp("'" + k + "'").test(sync));
check('KEY SET store SHELVES are excluded (ids collide across devices — D-B7)',
  !/'swrpg_store_shelves_v1'/.test(sync.slice(sync.indexOf('const SYNC_KEYS'), sync.indexOf('MAX_VALUE_BYTES'))));
check('KEY SET store HOLDS are excluded (bare string array, reader eats richer shapes — D-B8)',
  !/'swrpg_store_holds_v1'/.test(sync.slice(sync.indexOf('const SYNC_KEYS'), sync.indexOf('MAX_VALUE_BYTES'))));
// The count is DERIVED from RULED above rather than typed a second time. The two numbers used to be
// separate literals, so re-pointing the list meant remembering to re-point a bare `9` twelve lines
// away — the kind of second copy this file exists to complain about elsewhere.
check('KEY SET is exactly the ' + RULED.length + ' ruled keys — no extras crept in',
  (sync.slice(sync.indexOf('const SYNC_KEYS'), sync.indexOf(']);')).match(/'swrpg_[a-z0-9_]+'/g) || []).length === RULED.length);
check('KEY SET is enforced server-side, not just trusted from the client',
  /SYNC_KEYS\.has\(key\)/.test(sync) && /key_not_synced/.test(sync));
// RE-POINTED by card `f100-ms-build` R-MSB-5 (contract `f100-homebrew-sync-contract` R-HSC-1/-4/-11): the ruled
// allow-list is the eleven SYNC_KEYS above PLUS the three homebrew families, admitted by PATTERN beside the Set (an
// instance or a version is not a fixed name). KEEPS "exactly the ruled keys, enforced server-side"; DROPS nothing —
// the Set's count above is unchanged. The families' patterns are pinned verbatim, so a loosened one fails here.
const FAMILIES = ['/^swrpg_user_pack:[0-9a-f]{12}$/', "'swrpg_user_pack_meta'", '/^swrpg_user_pack_v:[a-z0-9_]{1,64}@[0-9a-f]{12}$/'];
for (const f of FAMILIES) check('KEY SET admits the homebrew family ' + f + ' (R-MSB-5)', sync.indexOf(f) !== -1);
check('KEY SET the families are asked beside the Set, both server-side (one admission test)',
  /SYNC_KEYS\.has\(key\)\s*\|\|\s*isPackKey\(key\)/.test(code) && /key_not_synced/.test(sync));

// ── auth first ───────────────────────────────────────────────────────────────
check('AUTH every sync path requires a session before anything else happens',
  sync.indexOf('not_signed_in') < sync.indexOf('SYNC_KEYS.has(key)')
  && sync.indexOf('getSession') < sync.indexOf('not_signed_in'));

// ── the conditional write (C3 / §3.3) ────────────────────────────────────────
check('CONFLICT the write is conditional on the version the client believes',
  /currentVersion !== expected/.test(sync));
check('CONFLICT a stale writer gets 409 WITH the current row (so it can resolve in one round trip)',
  /version_conflict[\s\S]{0,200}current:[\s\S]{0,120}409/.test(sync));
check('CONFLICT an absent row is version 0, so create and update are the same code path',
  /current \? current\.version : 0/.test(sync));
check('CONFLICT the new version is the old one plus one — a counter, not a clock',
  /const next = currentVersion \+ 1;/.test(sync));

// ── non-destructive by construction (§4) ─────────────────────────────────────
check('HISTORY the replaced value is appended BEFORE the overwrite',
  sync.indexOf('user_data_history') < sync.indexOf('ON CONFLICT'));
check('HISTORY the append, the write and the prune are ONE batch (history cannot be left unbounded)',
  /DB\.batch\(statements\)/.test(sync) && (sync.match(/statements\.push/g) || []).length === 3);
// RE-POINTED by R-MSB-5 (R-HSC-7): the history asserts read "every key EXCEPT the pack family". KEEPS the three
// statements on the history path (the count above is unchanged in source); ADDS that the append and the prune are
// both skipped for a pack key, so a pack write is one statement (the upsert) plus the counter upsert after it.
// DROPS nothing. The write path's behaviour (no history row after a pack replace) is test/ms_worker_pack_lane.cjs W3.
check('HISTORY the append is skipped for the pack family (R-HSC-7)', /if \(current && !pack\) \{\s*statements\.push/.test(code));
check('HISTORY the prune is skipped for the pack family (R-HSC-7)', /if \(!pack\) \{\s*statements\.push/.test(code));
check('HISTORY the usage counter is its own statement, after the batch (never part of the history three)',
  code.indexOf('await env.DB.batch(statements)') !== -1 && code.indexOf('usage_day', code.indexOf('await env.DB.batch(statements)')) !== -1);
// Three separate properties, because "is a named constant" is not one thing: the constant has to
// exist, the SQL has to use a PLACEHOLDER rather than a baked number, and the constant has to be
// what gets bound to it. (The first version of this assert matched `LIMIT ?'` and reddened on
// correct code, because the SQL closes a paren before the quote — an assert wrong about the text it
// was reading, which is the cheapest kind of false red to ship and the easiest to misread as a bug.)
check('HISTORY depth is a named constant', /const HISTORY_DEPTH = \d+;/.test(sync));
check('HISTORY the prune uses a placeholder, not a number baked into the SQL',
  /ORDER BY "id" DESC LIMIT \?\)/.test(sync) && !/LIMIT \d+\)/.test(sync));
check('HISTORY the constant is what gets bound to it',
  /\.bind\([^)]*HISTORY_DEPTH\)/.test(sync));

// ── D1's real limits, read not assumed ───────────────────────────────────────
check('SIZE there is a byte cap below D1\'s 2,000,000-byte row ceiling',
  /const MAX_VALUE_BYTES = (\d+);/.test(sync) && Number(RegExp.$1) < 2000000);
check('SIZE it is measured in BYTES (a character can be several)',
  /new TextEncoder\(\)\.encode\(value\)\.length/.test(sync));
check('SIZE an over-cap payload gets an honest 413, not a database error',
  /too_large[\s\S]{0,120}413/.test(sync));

// ── C4's teeth still reach everything (the privacy page's claim) ─────────────
check('DELETE account removal purges user_data',
  /DELETE FROM "user_data" WHERE "userId" = \?/.test(v1));
check('DELETE account removal purges user_data_history',
  /DELETE FROM "user_data_history" WHERE "userId" = \?/.test(v1));
check('DELETE the sync tables go BEFORE the user row (children first)',
  v1.indexOf('DELETE FROM "user_data_history"') < v1.indexOf('DELETE FROM "user" WHERE "id" = ?'));

// ── the schema itself ────────────────────────────────────────────────────────
check('SCHEMA user_data is keyed by (userId, key)', /PRIMARY KEY \("userId", "key"\)/.test(mig));
check('SCHEMA both tables cascade from the user row',
  (mig.match(/references "user" \("id"\) on delete cascade/g) || []).length === 2);
check('SCHEMA history has the lookup index its prune depends on',
  /CREATE INDEX "user_data_history_lookup" on "user_data_history" \("userId", "key", "id"\)/.test(mig));
check('SCHEMA states the never-parse law where the table is defined',
  /NEVER parses inside it/.test(mig));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
