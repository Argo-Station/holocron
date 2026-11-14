/**
 * B-186 / R-FA-10 — guard on the sign-in ORIGIN GATE (ruling `b185-firefox-auth-403` §4/§8).
 *
 * WHAT THIS PROTECTS: `POST /api/auth/sign-in/*` must reject a foreign or absent `Origin`. The recon
 * (`Docs/briefs/b185-b186-recon-and-fix-prep.md` §3) measured that better-auth binds the callbackURL to
 * the trusted set but does NOT gate the Origin on sign-in INITIATION — any/absent Origin returned 200
 * with a valid OAuth URL + a `__Secure-holocron.state` cookie (a login-CSRF initiation surface). The gate
 * in `worker/index.js` closes it ahead of better-auth, using the SAME trusted set as the config.
 *
 * WHY A GUARD: the gate is a few lines that are easy to delete or loosen (widen the trusted set, drop the
 * absent-Origin branch, forget the POST scope) with no visible failure — the app keeps working because it
 * always sends `Origin: <apex>`. This asserts the four corners: foreign rejected, absent rejected, apex
 * allowed through, and the scope (POST + sign-in path only, so GET flows and the OAuth callback are free).
 *
 * These are behaviour asserts through the real worker fetch handler; the live proof is a curl probe
 * against holocron.work after deploy.
 *
 * Run: node test/auth_signin_origin_gate.cjs
 */
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const APEX = 'https://holocron.work';
const STUB_ENV = {
  DB: { batch() {}, exec() {}, prepare() {} },
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: APEX,
  GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret',
  MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 'secret',
  DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'secret',
};

// Fire a request at the worker and report {status, gated} — `gated` = the gate's own 403 body fired,
// distinguished from any 403 better-auth might return for its own reasons (so the assert is not coupled
// to better-auth's internals).
async function hit(worker, { path, method, origin }) {
  const headers = {};
  if (origin !== undefined) headers['Origin'] = origin;
  const req = new Request('https://holocron.work' + path, { method, headers });
  let res, text = '';
  try { res = await worker.fetch(req, STUB_ENV); text = await res.text(); }
  catch (e) { return { status: 0, gated: false, threw: String(e) }; }
  return { status: res.status, gated: text.includes('untrusted_origin') };
}

(async () => {
  console.log('auth_signin_origin_gate — POST /api/auth/sign-in/* rejects foreign/absent Origin\n');

  const { trustedOrigins, createAuth } = await import('../worker/auth.js');
  const worker = (await import('../worker/index.js')).default;

  // 1 — the trusted set is exactly the apex, normalized to an Origin (no trailing slash).
  check('trustedOrigins(env) === [apex]',
    JSON.stringify(trustedOrigins(STUB_ENV)) === JSON.stringify([APEX]), trustedOrigins(STUB_ENV));
  check('trustedOrigins normalizes a trailing slash off baseURL',
    JSON.stringify(trustedOrigins({ BETTER_AUTH_URL: APEX + '/' })) === JSON.stringify([APEX]),
    trustedOrigins({ BETTER_AUTH_URL: APEX + '/' }));

  // 2 — the config wires the explicit trusted set into better-auth itself.
  const opts = createAuth(STUB_ENV).options;
  check('better-auth config carries the explicit trustedOrigins',
    Array.isArray(opts.trustedOrigins) && opts.trustedOrigins.includes(APEX), opts.trustedOrigins);

  // 3 — a FOREIGN Origin on sign-in initiation is rejected by the gate.
  const evil = await hit(worker, { path: '/api/auth/sign-in/social', method: 'POST', origin: 'https://evil.example.com' });
  check('POST sign-in with a foreign Origin → 403 untrusted_origin', evil.status === 403 && evil.gated, evil);

  // 4 — an ABSENT Origin on sign-in initiation is rejected too (a non-browser caller).
  const none = await hit(worker, { path: '/api/auth/sign-in/social', method: 'POST', origin: undefined });
  check('POST sign-in with NO Origin → 403 untrusted_origin', none.status === 403 && none.gated, none);

  // 5 — the APEX Origin passes the gate (whatever better-auth then does, it is NOT our 403).
  const apex = await hit(worker, { path: '/api/auth/sign-in/social', method: 'POST', origin: APEX });
  check('POST sign-in with the apex Origin passes the gate (not untrusted_origin)', !apex.gated, apex);

  // 6 — SCOPE: the gate is POST + sign-in only. A GET, and the OAuth CALLBACK, are never gated —
  //     the provider redirects to the callback with no app Origin, guarded by the state cookie instead.
  const getForeign = await hit(worker, { path: '/api/auth/sign-in/social', method: 'GET', origin: 'https://evil.example.com' });
  check('GET sign-in is NOT gated (safe method)', !getForeign.gated, getForeign);
  const cbForeign = await hit(worker, { path: '/api/auth/callback/google', method: 'POST', origin: 'https://evil.example.com' });
  check('POST callback is NOT gated (state-cookie guarded, provider is Origin-less)', !cbForeign.gated, cbForeign);

  console.log('\n' + (fail ? 'FAIL ' : 'PASS ') + `${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
