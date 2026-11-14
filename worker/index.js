// F-34 — the API worker (Cloudflare Pages advanced mode). Ruling f34-phase0-pipeline-brief §F2.
//
// THE LAW THIS FILE ENCODES: **login and sync may fail; the game tools may not.**
// "Logged-out is byte-identical forever" now includes AVAILABILITY — so this worker can never be
// the reason the Player Datapad, GM Holocron, or Dice Tutor stop serving. Two independent levers:
//
//   LEVER 1 (structural, _routes.json): the deploy's _routes.json includes ONLY "/api/*", so static
//     asset requests NEVER enter this worker at all. Auth code cannot be in the app's request path,
//     and app traffic spends no Workers request quota.
//   LEVER 2 (fail-open, here): every /api/* path runs inside a top-level try/catch that returns an
//     HONEST JSON 500 — never a hang, never an HTML soft-200 (the SPA fallback is the enemy the
//     removal-playbook taught us to distrust). Any NON-api request that somehow reaches this worker
//     (a _routes.json regression, a platform change) falls through to the static assets instead of
//     erroring — belt and braces with lever 1.
//
import { randomUUID } from 'node:crypto';   // proves nodejs_compat + the bundle handles node: builtins
import { createAuth, trustedOrigins } from './auth.js';
import { handleV1 } from './v1.js';

const json = (body, status) => Response.json(body, { status: status || 200 });

async function handleApi(request, env, url) {
  // /api/ping — the liveness probe (local, preview, and the P-FLIP post-deploy check). Deliberately
  // BEFORE the auth mount and independent of it: the probe must answer even when auth is
  // misconfigured, or the P-FLIP check would be testing the wrong thing.
  if (url.pathname === '/api/ping') {
    return json({ ok: true, service: 'holocron-api', phase: 'f34-phase0-pipeline', nonce: randomUUID() });
  }

  // B-186 / R-FA-10 — ORIGIN GATE on sign-in INITIATION. better-auth binds the callbackURL to the
  // trusted set but does NOT reject a foreign (or absent) Origin on `POST /api/auth/sign-in/*` — the
  // recon measured any/absent Origin returning 200 with a valid OAuth URL + state cookie (login-CSRF
  // initiation surface). Constrain it here, ahead of better-auth: a sign-in POST must carry an Origin in
  // the trusted set. The app's own same-origin fetch always sends `Origin: <apex>`; `www` is 301'd to the
  // apex at the edge (B-185), so a legitimate browser never presents a `www` Origin here. Scoped to POST
  // (the initiation method) so safe GET/HEAD flows and the OAuth provider's Origin-less CALLBACK
  // (`/api/auth/callback/*`, already guarded by the httpOnly state cookie) are untouched.
  if (url.pathname.startsWith('/api/auth/sign-in/') && request.method === 'POST') {
    const origin = request.headers.get('Origin');
    if (!origin || !trustedOrigins(env).includes(origin)) {
      return json({ ok: false, error: 'untrusted_origin' }, 403);
    }
  }

  // /api/auth/* — better-auth owns this subtree entirely (sign-in, callback, session, sign-out).
  // Constructed HERE rather than at module scope so a missing binding degrades to a 500 on the auth
  // routes alone instead of throwing at worker startup and taking /api/ping down with it. The outer
  // catch in fetch() turns any fault into an honest JSON 500 — never a hang, never an HTML soft-200.
  if (url.pathname.startsWith('/api/auth/')) {
    return createAuth(env).handler(request);
  }

  // /api/v1/* — the product's own API (Phase A: /me + /logout; Phase B's sync lands there too).
  // Routed as a prefix so this file stays the availability shell and v1.js owns its own surface.
  if (url.pathname.startsWith('/api/v1/')) {
    return handleV1(request, env, url);
  }

  // BREAK-GLASS (F2's guard): a deliberately-throwing route, EXISTS ONLY when the environment opts
  // in. Production never sets ALLOW_BREAK_GLASS, so this route is not reachable there; the F2 smoke
  // sets it to prove the fail-open catch works and the app still serves while /api is erroring.
  if (url.pathname === '/api/__break' && env.ALLOW_BREAK_GLASS === '1') {
    throw new Error('break-glass: deliberate worker fault (F2 availability guard)');
  }

  // Unknown /api/* → an honest 404 from the worker, not the SPA's soft-200.
  return json({ ok: false, error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    // LEVER 2a — non-API can never be broken by this worker, even if it reaches us.
    let url;
    try {
      url = new URL(request.url);
    } catch (e) {
      return env.ASSETS.fetch(request);
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // LEVER 2b — the API's own faults stay inside the API, and stay HONEST.
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      console.error('[api] unhandled:', err && err.stack ? err.stack : String(err));
      return json({ ok: false, error: 'internal_error' }, 500);
    }
  },
};
