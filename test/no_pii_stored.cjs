#!/usr/bin/env node
/**
 * no_pii_stored.cjs — THE REFUSAL CONTRACT: every identity-bearing column we decline to persist,
 * pinned against the privacy page that promises we decline it.
 * Ruling `f34-phase-a-live-drive` §3-4 (F-LD1 image · F-LD2 ip/user-agent), extending
 * `f34-phase0-close-request` D3/D4 (the provider tokens).
 *
 * WHY THIS FILE EXISTS. The live drive found two columns we were storing that the privacy page
 * denied storing — and it found them only because a human signed in for real and someone READ THE
 * ROW THAT CAME BACK. Fifty-five suites, twenty-four wire asserts and forty-one browser asserts
 * were all green at the time; none of them could see it, because none of them compared what the
 * database holds against what the page claims. This one does.
 *
 * THE PAIRING IS THE POINT. A column that stops being nulled is a privacy regression; a page that
 * stops naming it is a lie. Guarding either alone lets the pair drift. So each refusal below is
 * asserted TWICE — once in `worker/auth.js` (the mechanism) and once in `account/index.html` (the
 * promise) — and the wire whitelist is checked for good measure.
 *
 * WHAT IT CANNOT DO: prove the live database is clean. That needs credentials this repo has no CI
 * reader for, so it is a deploy-checklist step instead — `scripts/f34_pii_dump.py` (C-LD-2).
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

console.log('no_pii_stored — the refusal contract, mechanism vs promise\n');

const auth = read('worker/auth.js');
const v1 = read('worker/v1.js');
const page = read('account/index.html');

// ── each refusal: a named constant, applied on BOTH create and update ────────
// The update path is what a RETURNING sign-in takes. A create-only null-out looks done and quietly
// refills the column on the second login — which is exactly why better-auth's own
// `updateAccountOnSignIn` made the token hooks need both.
const REFUSALS = [
  { name: 'NO_TOKENS', model: 'account', fields: ['accessToken', 'refreshToken', 'idToken'] },
  { name: 'NO_IMAGE', model: 'user', fields: ['image'] },
  { name: 'NO_DEVICE', model: 'session', fields: ['ipAddress', 'userAgent'] },
];

for (const r of REFUSALS) {
  check(`${r.name} is a named constant nulling ${r.fields.join(', ')}`,
    r.fields.every((f) => new RegExp(`const ${r.name} = \\{[^}]*${f}: null`).test(auth)),
    r.name);
  const hookBlock = auth.slice(auth.indexOf('databaseHooks:'), auth.indexOf('session: {', auth.indexOf('databaseHooks:')) + 400);
  check(`${r.model} applies ${r.name} on CREATE`,
    new RegExp(`${r.model}: \\{[\\s\\S]{0,200}?create: \\{ before[^}]*\\.\\.\\.${r.name}`).test(auth));
  check(`${r.model} applies ${r.name} on UPDATE (the returning-sign-in path)`,
    new RegExp(`${r.model}: \\{[\\s\\S]{0,300}?update: \\{ before[^}]*\\.\\.\\.${r.name}`).test(auth));
}

// ── the config flag that would buy privacy by disabling a defence ────────────
// Read at source for C-LD-1: `advanced.ipAddress.disableIpTracking` short-circuits getIp(), and the
// built-in rate limiter then opts out entirely. Nulling in the hook keeps getIp working off the
// live request headers and persists nothing. If someone "simplifies" to the flag, this reddens.
check('the disableIpTracking flag is NOT used (it would silently disable rate limiting)',
  !/disableIpTracking/.test(auth) || /disableIpTracking[\s\S]{0,400}trap/i.test(auth));
check('and the reason is recorded next to the mechanism, not just in a ruling',
  /rate limiter[\s\S]{0,200}return\s*\n?\s*\/\/ null|rate-limiter\/index\.mjs/.test(auth));

// ── the wire: the whitelist lost `image` ─────────────────────────────────────
check('WIRE /me emits id + name only — no image field',
  /\{ id: session\.user\.id, name: session\.user\.name \|\| null \}/.test(v1)
  && !/image: session\.user\.image/.test(v1));
check('WIRE no `image` token survives anywhere in v1.js',
  !/\bimage\b/.test(v1.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// ── the promise: the page names every refusal ────────────────────────────────
// RE-POINTED 2026-08-06 by the AI-writing audit, which turned every `**Label.** gloss` into
// `**Label:** gloss` — the period-after-a-bold-label is a machine tell; a person writes a colon.
// Re-pointed to the NEW form rather than loosened to accept both (R-PA-5): pinning one shape is
// what makes the next silent copy drift redden. This guard caught the change the moment it was
// made, which is the mechanism/promise pair earning its keep on its first real edit.
const promised = [
  ['email', /never stored/i],
  ['passwords', /Passwords:<\/strong>/],
  ['provider tokens', /Provider tokens:<\/strong>/],
  ['profile picture', /profile picture:<\/strong>/i],
  ['ip address / browser', /IP address, or which browser/i],
];
for (const [label, re] of promised) {
  check(`PAGE promises we never store: ${label}`, re.test(page));
}
check('PAGE still makes the totality claim (which is only safe BECAUSE of the asserts above)',
  /That is the whole table/.test(page));
check('PAGE discloses that two of these used to be stored (honest, not retconned)',
  /used to be stored/i.test(page));

// ── R-CL-1 — EVERY SCHEMA COLUMN MUST BE CLASSIFIED ──────────────────────────
// The asserts above pin the columns we NAMED. That is one refactor away from the original defect:
// a NEW column in a future migration would not redden anything, and the page's "That is the whole
// table" sentence would quietly go false again — exactly how it went false the first time.
//
// So this arm derives the column list FROM THE MIGRATION rather than from memory (R-F34-6's
// derive-don't-hard-code lesson, applied to prose) and requires every column to land in exactly one
// bucket. A new column fails the suite until someone classifies it, which forces the decision the
// privacy page depends on instead of letting silence make it.
const migration = read('migrations/0001_c1_auth_schema.sql')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const schema = {};
const tableRe = /CREATE TABLE "(\w+)" \(([\s\S]*?)\n\);/g;
let m;
while ((m = tableRe.exec(migration))) {
  schema[m[1]] = m[2].split('\n')
    .map((l) => (l.match(/^\s*"(\w+)"/) || [])[1])
    .filter(Boolean);
}

// NULLED — a hook blanks it; the page says we never store it.
const NULLED = ['image', 'ipAddress', 'userAgent', 'accessToken', 'refreshToken', 'idToken'];
// DISCLOSED — genuinely stored, and named on the page's "what we store" list.
const DISCLOSED = ['name', 'email', 'providerId', 'accountId'];
// BOOKKEEPING — mechanical, carries no fact about the person. Each needs its reason here, so the
// list cannot become a shrug: adding a row means writing why it is not identity-bearing.
const BOOKKEEPING = {
  id: 'the random primary key — this IS the "account id" the page discloses',
  userId: 'foreign key to that same id; no new information',
  createdAt: 'row timestamp; says when, not who',
  updatedAt: 'row timestamp; says when, not who',
  expiresAt: 'when a session or state stops being valid',
  emailVerified: 'always 0 — the address is synthetic, so there is nothing to verify',
  token: 'the session credential itself. Secret, but not a fact ABOUT the person, and deleting it is what sign-out does',
  scope: 'what the provider granted (e.g. "identify") — a fact about the GRANT, and the evidence we never asked for email',
  accessTokenExpiresAt: 'expiry of a token we do not store; null in practice',
  refreshTokenExpiresAt: 'expiry of a token we do not store; null in practice',
  password: 'never written — emailAndPassword is disabled and no sign-up path sets it',
  identifier: 'the OAuth state string, deleted when the callback consumes it',
  value: 'the OAuth state payload, deleted with it',
};

const unclassified = [];
for (const [table, cols] of Object.entries(schema)) {
  for (const col of cols) {
    if (!NULLED.includes(col) && !DISCLOSED.includes(col) && !(col in BOOKKEEPING)) {
      unclassified.push(`${table}.${col}`);
    }
  }
}
check('R-CL-1 the migration parsed into tables + columns (a silent parse failure would pass everything)',
  Object.keys(schema).length === 4 && (schema.user || []).length >= 7,
  Object.fromEntries(Object.entries(schema).map(([t, c]) => [t, c.length])));
check('R-CL-1 EVERY schema column is classified — nulled, disclosed, or bookkeeping-with-a-reason',
  unclassified.length === 0, unclassified);
check('R-CL-1 every NULLED column actually appears in a refusal constant',
  NULLED.every((f) => new RegExp(`${f}: null`).test(auth)),
  NULLED.filter((f) => !new RegExp(`${f}: null`).test(auth)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
