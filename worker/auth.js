// F-34 — the better-auth configuration. Pinned 1.6.25 (scope ruling amendment A4).
//
// Built PER REQUEST because the D1 binding and the secrets arrive on `env`, which only exists inside
// the worker's fetch. betterAuth() construction is cheap; the expensive thing (the D1 dialect) is
// created lazily by the kysely adapter on first query.
//
// D1 NEEDS NO EXTRA DEPENDENCY: @better-auth/kysely-adapter detects a D1Database structurally
// (`batch` + `exec` + `prepare` all present) and selects its own D1SqliteDialect. Verified by
// reading the adapter source at the pin, not assumed.
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { placeholderEmail } from './placeholderEmail.js';
import SITE_SETTINGS from '../lib/shared/siteSettings.js';

// B-186 / R-FA-10 — the EXPLICIT trusted-origin set, one source of truth for both better-auth's own
// checks (config `trustedOrigins`) and the sign-in origin gate in index.js. The apex is the only trusted
// origin: `www.holocron.work` is 301'd to the apex at the edge (B-185), so a legitimate browser never
// presents a `www` origin here. Normalized to an Origin (scheme+host, no trailing slash) so it compares
// equal to a browser's `Origin` header. Falls back to the settings module's AUTH_ORIGIN (R-AAC-19) if the
// binding is somehow absent; with both blank (the public copy's template) no origin is trusted.
export function trustedOrigins(env) {
  const base = (env && env.BETTER_AUTH_URL ? env.BETTER_AUTH_URL : (SITE_SETTINGS.AUTH_ORIGIN || '')).replace(/\/+$/, '');
  return base ? [base] : [];
}

// ── the privacy mapper, wired per provider ───────────────────────────────────────────────────────
// Every provider gets the SAME treatment: whatever the provider says about the human is discarded
// and the email column is filled from the provider name + the opaque subject id.
//
// TWO INDEPENDENT LAYERS, deliberately (ADR 0017's "read-never" law):
//   1. WE NEVER ASK. Every provider below is configured with `disableDefaultScope` + an explicit
//      scope list that OMITS email. better-auth's built-in Google and Microsoft providers request
//      `email` by default (measured: Google asked for "email profile openid" before this was set) —
//      that default is exactly what would have made "we never read your email" false. With the
//      scope withheld, the address is never in the token, so there is nothing to read.
//   2. WE OVERRIDE ANYWAY. This mapper fills `email` from provider + subject id regardless, so a
//      provider that volunteers an address off-scope still cannot land one. The `...userMap` spread
//      in each provider's getUserInfo runs AFTER its own `email:` assignment, so ours wins.
// The D1 CHECK constraint is the third layer, and the only one that cannot be bypassed by code.
const mapToPlaceholder = (providerId, subjectKey) => (profile) => ({
  email: placeholderEmail(providerId, profile?.[subjectKey]),
  emailVerified: false,   // nothing to verify — the address is synthetic by construction
});

// `openid` yields the subject id (the only thing we actually need); `profile` yields a display
// name. `email` is deliberately absent — see layer 1 above.
const MINIMAL_SCOPES = ['openid', 'profile'];

// The columns we refuse to persist. Named once per model so the create and update hooks cannot
// drift apart — a null-out that covers only one path is worse than none, because it looks done.
const NO_TOKENS = { accessToken: null, refreshToken: null, idToken: null };

// F-LD1 (ruling `f34-phase-a-live-drive` §3): the provider's profile-photo URL. Identity-bearing,
// stored, and read by NOTHING — the architect's grep for `.image` across every view returned zero
// matches. That is the same sentence D3/D4 used to null the provider tokens, on a different column,
// so it takes the same remedy. Found only by signing in for real and reading the row that came back.
const NO_IMAGE = { image: null };

// F-LD2 (same ruling; escalated to Jason, who declined the device-list capability that would have
// justified keeping it): the IP address and browser string better-auth stamps on every session.
//
// WHY A HOOK AND NOT THE CONFIG FLAG — read at source before writing this, as C-LD-1 required.
// `advanced.ipAddress.disableIpTracking: true` looks like the supported answer and is a trap: it
// short-circuits `getIp()` (@better-auth/core `utils/ip.mjs:202`), and the built-in rate limiter
// then bails out entirely (`api/rate-limiter/index.mjs:282` — `if (!ip && …disableIpTracking) return
// null`). One option, privacy bought by disabling a security control, and nothing in its name to
// say so. Nulling the columns in the hook keeps `getIp` working off the live request headers —
// which is where every consumer reads it anyway — and persists nothing. There is NO supported
// option to disable user-agent capture at all, so the hook is the only route for that half.
//
// PROPORTION, per the architect's correction (`f34-phase-a-close` §2) — the record should be
// accurate, not dramatic: the defence that flag would have switched off was ALREADY discounted
// here. We set no `rateLimit` key, so better-auth's default in-memory limiter applies, and R-F34-2
// established it is per-isolate and effectively no protection at the edge; the real limiter is the
// Cloudflare WAF rule on `/api/auth/*`. So this was a near-miss on a defence we had already written
// off, not on a live one. The reasoning stands regardless: an option that silently disables a
// security control is something to find by reading, never by incident.
//
// Verified nothing reads the stored columns: session validation, revocation, freshness and the
// cookie cache all ignore them (`api/routes/session.mjs`, `cookies/index.mjs`); both are
// `required: false` / `.nullish()` in the schema.
const NO_DEVICE = { ipAddress: null, userAgent: null };

// ── R-F34-6, made structural ─────────────────────────────────────────────────────────────────────
// The visible provider list is DERIVED from which providers actually have credentials bound —
// never hard-coded. A "Sign in with Microsoft" button that always fails is the reSpecialized
// defect class exactly: success and failure indistinguishable from outside. This table lives
// NEXT TO the provider config below so the two cannot drift: a provider added there without a
// row here simply never becomes visible, which fails safe (invisible, not broken).
// Each row also names the provider's SIGN-IN MECHANISM — 'social' (better-auth built-in:
// POST /api/auth/sign-in/social) vs 'oauth2' (genericOAuth plugin: POST /api/auth/sign-in/oauth2).
// The client needs this to call the right endpoint, and it is a fact OF THIS CONFIG (discord is
// oauth2 BECAUSE it is registered through the plugin below) — so it travels with the provider
// list instead of being re-remembered in lib/shared/account.js, where it would drift.
// Each row also carries the provider's DISPLAY LABEL (R-PA-3) — the name a human reads on the
// button. It travels with the id for the same reason the mechanism does: the alternative is a view
// title-casing a machine id, which renders "Sign in with google" and is a mechanics-voice defect
// the moment anyone sees it.
const PROVIDER_BINDINGS = [
  ['google', 'Google', 'social', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
  ['discord', 'Discord', 'oauth2', ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET']],
  ['microsoft', 'Microsoft', 'social', ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']],
];
export function boundProviders(env) {
  return PROVIDER_BINDINGS
    .filter(([, , , keys]) => keys.every((k) => env[k]))
    .map(([id, label, signIn]) => ({ id, label, signIn }));
}

export function createAuth(env) {
  if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not bound');
  if (!env.DB) throw new Error('D1 binding DB is not bound');

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',

    // B-186 / R-FA-10 — EXPLICIT trusted origins (was implicit-from-baseURL). Binds better-auth's own
    // origin/callback validation to the apex; the sign-in origin gate in index.js is the belt to this
    // braces (better-auth binds callbackURL to this set but does not reject a foreign Origin on sign-in
    // INITIATION — the login-CSRF surface the gate closes).
    trustedOrigins: trustedOrigins(env),

    // The product has no passwords and will never have any — there is nothing to phish, reset, or
    // leak. Accounts exist ONLY as a handle for Phase B's cross-device sync.
    emailAndPassword: { enabled: false },

    account: {
      // Linking by email is meaningless here (every address is synthetic) and would be dangerous if
      // it weren't: two providers yielding the same placeholder would silently merge two people.
      accountLinking: { enabled: false },

      // Layer 1 of the token posture (ruling `f34-phase0-close-request` D3). Symmetric-encrypts the
      // access and refresh tokens at rest, against the threats better-auth's own docs name: database
      // backups, logs, and a compromised DBA. NECESSARY BUT NOT SUFFICIENT — see the null-out below.
      encryptOAuthTokens: true,
    },

    // ── THE TOKEN POSTURE, layer 2 — the part that actually discharges the law ───────────────────
    // Ruling `f34-phase0-close-request` D4: DO NOT PERSIST provider tokens at all.
    //
    // WHY ENCRYPTION ALONE IS NOT ENOUGH, read at source: in `oauth2/link-account.mjs` all three
    // write sites (:35-37, :53-55, :88-90) do
    //     accessToken:  await setTokenUtil(...)   ← encrypted
    //     refreshToken: await setTokenUtil(...)   ← encrypted
    //     idToken:      account.idToken           ← RAW
    // and the ID_TOKEN is precisely the one carrying `given_name` / `family_name`. So encryption
    // covers the two tokens with the LEAST identity content and leaves the identity-bearing one in
    // plaintext. That is the opposite of what ADR 0017's law asks for.
    //
    // These tokens have NO function in this product: OAuth is used solely to obtain a stable subject
    // id at sign-in, and we never call a provider API afterwards. Unused credentials in a database are
    // pure breach liability — "nothing identity-valuable to breach" (ADR 0017).
    //
    // BOTH hooks are required. `create` covers first sign-in; `update` covers every subsequent one,
    // because `updateAccountOnSignIn` refills these columns on re-auth and would silently undo this.
    // ONE place where "what we refuse to keep" is enforced, model by model. Every entry is a
    // create AND an update hook, deliberately: the update path is what a RETURNING sign-in takes,
    // and a create-only null-out would quietly refill the column on the second login (C-LD-5 asks
    // Phase B to prove that on production, where returning logins are constant).
    //
    // The privacy page's list is the mirror of this block. If a column is added here, the page
    // gets shorter; if a column stops being nulled, the page is wrong. `test/no_pii_stored.cjs`
    // guards the pairing so the two cannot drift.
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: { ...account, ...NO_TOKENS } }) },
        update: { before: async (account) => ({ data: { ...account, ...NO_TOKENS } }) },
      },
      user: {
        create: { before: async (user) => ({ data: { ...user, ...NO_IMAGE } }) },
        update: { before: async (user) => ({ data: { ...user, ...NO_IMAGE } }) },
      },
      session: {
        create: { before: async (session) => ({ data: { ...session, ...NO_DEVICE } }) },
        update: { before: async (session) => ({ data: { ...session, ...NO_DEVICE } }) },
      },
    },

    session: {
      // D1 is authoritative; the signed cookie cache keeps the hot path off the database.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      cookiePrefix: 'holocron',
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',   // must survive the OAuth redirect back from the provider
        path: '/',
      },
    },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        disableDefaultScope: true,
        scope: MINIMAL_SCOPES,
        mapProfileToUser: mapToPlaceholder('google', 'sub'),
      },
      // ⚠ DORMANT — NO CREDENTIALS ARE BOUND. Microsoft was DROPPED 2026-07-25 (Jason), discharging
      // amendment A3 ("launch-if-spike-proves, else fast-follow"). The blocker was not the expected
      // publisher-verification wall but an earlier one: since June 2024 Microsoft requires every new
      // app registration to live in an Entra directory, so a personal account must first stand up a
      // tenant — disproportionate for a non-commercial fan project.
      //
      // The config is KEPT, deliberately, so re-adding Microsoft costs credentials and nothing else.
      // But dormant config that reads as working is a known hazard in this repo (ADR 0017 names it),
      // so: with no client id bound, sign-in here fails at the provider handshake.
      // **R-F34-6 binds the Phase B light-up: derive the visible provider list from which providers
      // actually have credentials bound — never hard-code it.** A "Sign in with Microsoft" button that
      // always fails is the reSpecialized defect class exactly: success and failure look identical.
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        disableDefaultScope: true,
        scope: MINIMAL_SCOPES,
        mapProfileToUser: mapToPlaceholder('microsoft', 'sub'),
      },
    },

    plugins: [
      genericOAuth({
        config: [
          {
            // DISCORD VIA GENERIC OAUTH, DELIBERATELY (Phase 0 checklist item 3 — scope
            // minimisation). The built-in Discord provider requests the `email` scope; this asks
            // for `identify` ONLY, so Discord never transmits an address and the privacy law holds
            // by the strongest available mechanism: the data never arrives.
            providerId: 'discord',
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
            authorizationUrl: 'https://discord.com/oauth2/authorize',
            tokenUrl: 'https://discord.com/api/oauth2/token',
            userInfoUrl: 'https://discord.com/api/users/@me',
            scopes: ['identify'],
            mapProfileToUser: (profile) => ({
              name: profile?.global_name || profile?.username || 'Holocron user',
              email: placeholderEmail('discord', profile?.id),
              emailVerified: false,
            }),
          },
        ],
      }),
    ],
  });
}
