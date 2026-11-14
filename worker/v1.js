// F-34 Phase A — /api/v1/*: the product's own API surface, distinct from better-auth's
// /api/auth/* subtree. Ruling f34-login-build-scope Phase A names the first two endpoints:
// /api/v1/me and /api/v1/logout. Phase B's sync endpoints land HERE, not in index.js —
// index.js stays the availability shell and routes the whole /api/v1/ prefix to this file.
import { createAuth, boundProviders } from './auth.js';
import { handleSync } from './sync.js';

// Identity answers must NEVER be edge-cached: a cached /api/v1/me is somebody else's session
// served to you. no-store on every v1 response, unconditionally — cheaper than remembering
// which ones carry identity.
const json = (body, status) =>
  Response.json(body, { status: status || 200, headers: { 'cache-control': 'no-store' } });

export async function handleV1(request, env, url) {
  if (url.pathname === '/api/v1/me') return me(request, env);
  if (url.pathname === '/api/v1/logout') return logout(request, env);
  if (url.pathname === '/api/v1/account') return deleteAccount(request, env);
  if (url.pathname === '/api/v1/sync' || url.pathname.startsWith('/api/v1/sync/')) {
    return handleSync(request, env, url);
  }
  return json({ ok: false, error: 'not_found' }, 404);
}

// GET /api/v1/me → { ok, user: { id, name, image } | null, providers: [{ id, label, signIn }] }
//
// THE v1 WIRE CONTRACT, as ruled: `f34-phase-a` §4 D1 accepted the shape; `f34-phase-a-conditions`
// §3 D5 amended it to carry `label` (R-PA-3). The amendment is ADDITIVE — a consumer reading only
// { id, signIn } keeps working, and both views fall back to `p.label || p.id`. This is a durable
// contract (R-SY4 / R-Y2-1): change it on paper BEFORE any consumer depends on the change.
//
// THE ZERO-PII CONTRACT (ADR 0017 / Finding 2): the user object is a WHITELIST, never a spread.
// better-auth's session.user carries the framework-required email column — synthetic by
// construction (placeholderEmail), but it does not cross this boundary even so: the API surface
// emits no email field at all, so nothing downstream can come to depend on one.
//
// `providers` is R-F34-6 made structural: the list is DERIVED from which providers actually have
// credentials bound (boundProviders reads the env bindings next to the config in auth.js), never
// hard-coded here. A UI that renders this list cannot show a dead "Sign in with Microsoft" button.
async function me(request, env) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = createAuth(env);

  // D7's instrument (ruling f34-phase-a-conditions C-PA-5): the session lookup is the ONLY D1 read
  // on the product's hot path, so timing it here measures the number that actually matters —
  // in-worker, against production D1, on the real request path rather than a synthetic probe.
  //
  // READ IT ON A REQUEST THAT HAS A SESSION. With no cookie, better-auth short-circuits before any
  // D1 access (verified: no unauthenticated path performs a D1 read — a bogus cookie fails its HMAC
  // check first), so `dur` is ~0 and means "nothing to look up", NOT "D1 is instant". A gate that
  // quotes a signed-out number would be quoting the absence of the measurement.
  //
  // Emitted as Server-Timing because it is the standard the browser devtools already reads, so this
  // stays measurable forever instead of being a number someone captured once and wrote down.
  const t0 = Date.now();
  const session = await auth.api.getSession({ headers: request.headers });
  const lookupMs = Date.now() - t0;

  // The whitelist lost `image` (F-LD1) — a SUBTRACTIVE amendment to the v1 contract, the first one.
  // Safe because the architect's grep proved no consumer exists; surfaced on paper in the ruling
  // rather than changed silently. Two fields is the whole of what a signed-in person is here.
  const user = session && session.user
    ? { id: session.user.id, name: session.user.name || null }
    : null;
  const out = json({ ok: true, user, providers: boundProviders(env) });
  out.headers.set('server-timing', 'session;dur=' + lookupMs + ';desc="getSession incl. D1"');
  return out;
}

// POST /api/v1/logout → { ok, user: null }, with better-auth's cookie-clearing headers copied
// through. POST-only: a GET logout is a classic drive-by primitive (an <img src> logs you out);
// SameSite=Lax already blocks cross-site POSTs, so POST-only closes the loop.
//
// IDEMPOTENT by design: signing out without a live session is a success, not an error — the
// state the caller asked for ("no session") already holds. better-auth's signOut throws on a
// missing session; that throw is absorbed, not surfaced.
async function logout(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = createAuth(env);
  let cookies = [];
  try {
    const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
    cookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  } catch (e) {
    // no live session → nothing to revoke; the cookie the browser holds (if any) is already dead
  }
  const out = json({ ok: true, user: null });
  for (const c of cookies) out.headers.append('set-cookie', c);
  return out;
}

// DELETE /api/v1/account → the C4 floor's teeth (contract C3 names this endpoint; ruling
// accounts-sync-architecture §4). HARD delete: sessions, provider links, the user row — at
// Phase A there is nothing else to a person than these (Phase B's user_data joins this batch
// when it exists).
//
// ORDER MATTERS: signOut runs FIRST, while the session still exists, because it is the only
// clean source of the cookie-clearing headers (hard-coding cookie names here would duplicate
// better-auth internals — the closeout gate's drift class). Then the rows go, children first,
// in ONE D1 batch (atomic per D1's semantics), every statement parameterized (§7 rider).
async function deleteAccount(request, env) {
  if (request.method !== 'DELETE') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !session.user) return json({ ok: false, error: 'not_signed_in' }, 401);
  const userId = session.user.id;

  let cookies = [];
  try {
    const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
    cookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  } catch (e) {
    // a failed sign-out does not spare the rows; the browser cookie dies with the session rows anyway
  }

  // Phase B widened what "everything attached to it" means. The synced data and its history are
  // the person's characters — if delete leaves them behind, the privacy page's "the account row and
  // everything attached to it" becomes false, which is the exact defect class the live drive found
  // on that same page. Children first, then the user row; the foreign keys cascade anyway, and
  // saying it explicitly is what makes it reviewable.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM "user_data_history" WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM "user_data" WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM "account" WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM "user" WHERE "id" = ?').bind(userId),
  ]);

  const out = json({ ok: true, user: null, deleted: true });
  for (const c of cookies) out.headers.append('set-cookie', c);
  return out;
}
