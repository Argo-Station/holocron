-- F-34 C1 — the auth schema. better-auth 1.6.25 · D1 (SQLite).
--
-- PROVENANCE: every CREATE below except the CHECK constraint is better-auth's OWN generated DDL,
-- captured by running `getMigrations()` from `better-auth/db/migration` against a throwaway
-- node:sqlite database and reading back `sqlite_master` (2026-07-25, v1.6.25). It is not
-- hand-written from memory, and it is not paraphrased. Regenerate the same way when the pin moves.
--
-- ── THE PRIVACY LAW, THIRD LAYER (ADR 0017, as amended by ruling `f34-credential-free-build`) ──
-- better-auth REQUIRES an email column; it cannot be omitted (Finding 2 / amendment A2). The
-- no-real-email promise therefore holds in three layers, and THIS FILE IS THE THIRD:
--   1. SCOPE MINIMISATION (worker/auth.js) — we never ask any provider for an email, so none
--      arrives. This is the primary mechanism.
--   2. THE MAPPER (worker/placeholderEmail.js) — we synthesise the column from provider + opaque
--      subject id and override whatever a provider volunteers anyway.
--   3. THIS CONSTRAINT — the database refuses anything that is not the mapper's exact shape.
--
-- WHAT THIS CONSTRAINT DOES AND DOES NOT BUY (corrected by ruling F4 — the earlier claim that it
-- "cannot be bypassed by any future code path" was WRONG, and measured to be wrong):
--   IT GUARANTEES the local part is `<provider>_<subject>` over a restricted alphabet, ending in
--   the RFC 2606 reserved `.invalid` TLD. Measured 8/9 against the adversarial matrix in
--   test/placeholder_email.cjs: it refuses a real address, a suffix-spoofing domain
--   (`a@placeholder.invalid.evil.com`), a case variant (`x@PLACEHOLDER.INVALID` — GLOB is
--   case-sensitive where LIKE is not), and an embedded address (`a@b.com#@placeholder.invalid`,
--   including the underscore-bearing variant that the GLOB alone lets through — hence the
--   companion no-double-`@` clause).
--
--   IT CANNOT CATCH an email passed in as the SUBJECT argument: a regression doing
--   `placeholderEmail('google', <a real address>)` yields
--   `google_jason-gmail.com@placeholder.invalid`, which is PII and is shape-identical to a
--   legitimate opaque id. NO constraint can distinguish those. What prevents that class is the
--   MAPPER'S CONTRACT — subject is the provider's opaque id, never an address — enforced by code
--   review and by test/placeholder_email.cjs, NOT by SQLite.
--
-- Nor does it govern what better-auth reads in memory during a callback; layer 1 is what makes
-- that moot. Do not restate this constraint as an absolute guarantee anywhere.

-- ── user ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "user" (
  "id"            text not null primary key,
  "name"          text not null,
  "email"         text not null unique
                  -- GLOB (case-SENSITIVE, unlike LIKE) pins the mapper's shape; the second clause
                  -- rejects a second `@`, which the GLOB alone admits when the smuggled address
                  -- contains an underscore. Keep both — they catch different things.
                  CHECK ("email" GLOB '[a-z0-9._-]*_[a-z0-9._-]*@placeholder.invalid'
                         AND "email" NOT LIKE '%@%@%'),
  "emailVerified" integer not null,
  "image"         text,
  "createdAt"     date not null,
  "updatedAt"     date not null
);

-- ── session ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "session" (
  "id"        text not null primary key,
  "expiresAt" date not null,
  "token"     text not null unique,
  "createdAt" date not null,
  "updatedAt" date not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references "user" ("id") on delete cascade
);

CREATE INDEX "session_userId_idx" on "session" ("userId");

-- ── account ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "account" (
  "id"                     text not null primary key,
  "accountId"              text not null,
  "providerId"             text not null,
  "userId"                 text not null references "user" ("id") on delete cascade,
  "accessToken"            text,
  "refreshToken"           text,
  "idToken"                text,
  "accessTokenExpiresAt"   date,
  "refreshTokenExpiresAt"  date,
  "scope"                  text,
  "password"               text,
  "createdAt"              date not null,
  "updatedAt"              date not null
);

CREATE INDEX "account_userId_idx" on "account" ("userId");

-- ── verification ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "verification" (
  "id"         text not null primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  date not null,
  "createdAt"  date not null,
  "updatedAt"  date not null
);

CREATE INDEX "verification_identifier_idx" on "verification" ("identifier");
