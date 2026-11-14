#!/usr/bin/env node
/**
 * api_v1_shape.cjs — the /api/v1 SURFACE CONTRACT (F-34 Phase A).
 * Ruling f34-login-build-scope Phase A: /api/v1/me + /api/v1/logout; the zero-PII whitelist;
 * R-F34-6 (provider list derived from bound credentials, never hard-coded).
 *
 * WHY SOURCE-LEVEL: these are the properties a live smoke can only test per-request, per-provider,
 * per-cache-state — but each is a single structural fact in the source. Asserting the structure
 * catches the regression in CI before it needs a browser, a deploy, or a signed-in session.
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

console.log('api_v1_shape — the /api/v1 surface contract\n');

const v1 = read('worker/v1.js');
const index = read('worker/index.js');
const auth = read('worker/auth.js');

// ── routing: index.js stays the availability shell ──────────────────────────
check('V1 index.js routes the /api/v1/ prefix to v1.js (one hook, not per-endpoint routes)',
  /startsWith\('\/api\/v1\/'\)[\s\S]{0,60}handleV1/.test(index));
check('V1 the v1 route sits INSIDE handleApi (so lever 2’s fail-open catch covers it)',
  index.indexOf('return handleV1(') > index.indexOf('async function handleApi'));
check('V1 unknown /api/v1/* answers an honest 404 from v1.js, not the SPA soft-200',
  /not_found['"]\s*\},\s*404\)/.test(v1));

// ── the zero-PII whitelist (ADR 0017 / Finding 2) ────────────────────────────
// RE-POINTED by ruling `f34-phase-a-live-drive` §3 (F-LD1), which dropped `image` from the
// whitelist — the first SUBTRACTIVE amendment to the v1 contract. Re-pointed TIGHTER, not looser:
// the old assert merely required three fields be present, so it would have passed a spread that
// happened to include them. This one pins the object's ENTIRE shape and separately forbids `image`.
check('PII /me builds the user object as a WHITELIST of exactly id + name',
  /\{ id: session\.user\.id, name: session\.user\.name \|\| null \}/.test(v1));
check('PII the dropped `image` field has not crept back (F-LD1)',
  !/image:\s*session\.user\.image/.test(v1));
check('PII no spread of session.user (a spread would leak whatever the framework adds next)',
  !/\.\.\.\s*session\.user/.test(v1));
check('PII the string "email" appears NOWHERE in v1.js (not even the synthetic column crosses the API)',
  !/email/i.test(v1.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// ── caching: identity is never edge-cached ───────────────────────────────────
check('CACHE every v1 response carries cache-control: no-store (one json() helper, unconditional)',
  /cache-control['"]\s*:\s*['"]no-store/.test(v1));
check('CACHE no v1 code path constructs a bare Response.json without the helper',
  (v1.match(/Response\.json\(/g) || []).length === 1);

// ── logout posture ───────────────────────────────────────────────────────────
check('LOGOUT is POST-only (405 on anything else — GET logout is a drive-by primitive)',
  /method\s*!==\s*'POST'/.test(v1) && /405/.test(v1));
check('LOGOUT copies better-auth’s cookie-clearing headers through (set-cookie appended)',
  /getSetCookie/.test(v1) && /append\('set-cookie'/.test(v1));
check('LOGOUT is idempotent — a missing session is absorbed, not surfaced as an error',
  /catch\s*\(/.test(v1) && v1.indexOf('catch') > v1.indexOf('signOut'));
check('ME is GET-only (a POST /me is a confused caller, answered 405 not 200)',
  /method\s*!==\s*'GET'/.test(v1));

// ── D7's latency instrument (C-PA-5) ─────────────────────────────────────────
check('D7 /me times the session lookup and emits it as Server-Timing',
  /const t0 = Date\.now\(\);/.test(v1) && /server-timing/.test(v1));
check('D7 the timer brackets the getSession call ONLY (not the whole handler)',
  v1.indexOf('const t0 = Date.now();') < v1.indexOf('auth.api.getSession')
  && v1.indexOf('auth.api.getSession') < v1.indexOf('const lookupMs'));
check('D7 the comment warns the signed-out number is meaningless (~0 = nothing to look up)',
  /READ IT ON A REQUEST THAT HAS A SESSION/.test(v1));

// ── delete-account: the C4 floor's teeth (contract C3) ───────────────────────
check('C4 /api/v1/account is routed', /\/api\/v1\/account/.test(v1));
check('C4 delete is DELETE-only', /method\s*!==\s*'DELETE'/.test(v1));
check('C4 an unsigned delete answers 401, never touches rows',
  /not_signed_in['"]\s*\},\s*401\)/.test(v1) && v1.indexOf('401') < v1.indexOf('DB.batch'));
// RE-POINTED by Phase B: the batch grew from three statements to five when the sync tables joined
// it. Re-pointed TIGHTER, not loosened — it now pins the FULL children-first order rather than a
// three-way subset, so adding a sixth table without placing it correctly reddens.
//
// This matters beyond tidiness: the privacy page promises delete removes "the account row and
// everything attached to it". A person's synced characters are the largest thing attached to it,
// and if they survived deletion that sentence would be false — the same defect class the live drive
// found on that same page.
const DELETE_ORDER = ['user_data_history', 'user_data', 'session', 'account', 'user'];
check('C4 the rows go children-first in ONE parameterized batch, all five tables',
  /DB\.batch\(/.test(v1)
  && DELETE_ORDER.every((t, i) => i === 0
    || v1.indexOf('DELETE FROM "' + DELETE_ORDER[i - 1] + '"') < v1.indexOf('DELETE FROM "' + t + '"'))
  && (v1.match(/\.bind\(userId\)/g) || []).length === 5,
  DELETE_ORDER.map((t) => [t, v1.indexOf('DELETE FROM "' + t + '"')]));
check('C4 no string-built SQL anywhere in v1.js (§7 rider: parameterized only)',
  !/DELETE FROM[^']*'\s*\+/.test(v1) && !/`[^`]*DELETE FROM[^`]*\$\{/.test(v1));
check('C4 signOut runs BEFORE the delete batch (cookie-clearing headers come from better-auth, not hand-built names)',
  v1.lastIndexOf('signOut') < v1.indexOf('DB.batch'));

// ── R-F34-6: providers derived, never hard-coded ─────────────────────────────
check('R-F34-6 auth.js exports boundProviders derived from credential bindings (every-key filter)',
  /export function boundProviders/.test(auth) && /keys\.every\(/.test(auth));
check('R-F34-6 v1.js imports boundProviders rather than naming providers itself',
  /boundProviders/.test(v1) && !/['"]google['"]/.test(v1) && !/['"]discord['"]/.test(v1) && !/['"]microsoft['"]/.test(v1));
check('R-F34-6 the bindings table names all three providers (dormant Microsoft included — it lights up by credentials alone)',
  /\['google',/.test(auth) && /\['discord',/.test(auth) && /\['microsoft',/.test(auth));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
