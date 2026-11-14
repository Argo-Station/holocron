#!/usr/bin/env node
/**
 * account_module.cjs — lib/shared/account.js, the shared account seam (F-34 Phase A).
 * Exercises the factory with injected edges (fetch/location/channel), the same pattern as
 * test/sources.cjs: pure logic in Node, no browser, no network.
 *
 * THE PROPERTIES UNDER GUARD:
 *  - the availability law: every network failure lands in state {status:'offline'}, never a throw
 *  - the cross-tab exchange converges (broadcast on identity CHANGE only)
 *  - login picks the endpoint from the provider's own signIn mechanism (worker/auth.js's fact,
 *    never re-remembered client-side)
 *  - logout is refresh-shaped: the /me re-fetch is what updates and broadcasts
 */
const { createAccount } = require('../lib/shared/account.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const jsonRes = (body, ok) => ({ ok: ok !== false, json: () => Promise.resolve(body) });

function harness(routes) {
  const calls = [];
  const posted = [];
  let onMsg = null;
  const edges = {
    fetch: (url, opts) => {
      calls.push({ url, opts: opts || {} });
      const r = routes[url];
      if (!r) return Promise.reject(new Error('unrouted ' + url));
      return Promise.resolve(typeof r === 'function' ? r(opts) : r);
    },
    location: {
      origin: 'https://holocron.work', pathname: '/player/', assigned: null,
      assign(u) { this.assigned = u; },
    },
    channel: { post: (m) => posted.push(m), onMessage: (fn) => { onMsg = fn; } },
  };
  return { edges, calls, posted, receive: (m) => onMsg && onMsg(m) };
}

const USER = { id: 'u1', name: 'Kira', image: null };
const PROVIDERS = [{ id: 'google', signIn: 'social' }, { id: 'discord', signIn: 'oauth2' }];

(async () => {
  console.log('account_module — the shared account seam\n');

  // ── refresh: unknown → ready ───────────────────────────────────────────────
  {
    const h = harness({ '/api/v1/me': jsonRes({ ok: true, user: USER, providers: PROVIDERS }) });
    const acc = createAccount(h.edges);
    check('initial state is unknown/empty', acc.state().status === 'unknown' && acc.state().user === null);
    const s = await acc.refresh();
    check('refresh lands ready with user + providers', s.status === 'ready' && s.user.id === 'u1' && s.providers.length === 2);
    check('refresh sends credentials (the session cookie IS the request)', h.calls[0].opts.credentials === 'include');
    check('identity change (null -> user) broadcasts once', h.posted.length === 1 && h.posted[0].type === 'account-changed');
    await acc.refresh();
    check('same-identity refresh does NOT rebroadcast (the exchange converges)', h.posted.length === 1);
  }

  // ── refresh coalesces ──────────────────────────────────────────────────────
  {
    const h = harness({ '/api/v1/me': jsonRes({ ok: true, user: null, providers: [] }) });
    const acc = createAccount(h.edges);
    await Promise.all([acc.refresh(), acc.refresh(), acc.refresh()]);
    check('concurrent refreshes coalesce into ONE /me fetch', h.calls.length === 1, h.calls.length);
  }

  // ── the availability law ───────────────────────────────────────────────────
  {
    const h = harness({});   // every fetch rejects
    const acc = createAccount(h.edges);
    let threw = false;
    const s = await acc.refresh().catch(() => { threw = true; });
    check('dead API resolves (never rejects) — the tools cannot be taken down', !threw);
    check('dead API → offline, no user, NO providers (no dead login button can render)',
      s.status === 'offline' && s.user === null && s.providers.length === 0);
    const out = await acc.login('google');
    check('login against a dead/empty state resolves {ok:false}, no redirect',
      out.ok === false && h.edges.location.assigned === null);
  }

  // ── login: mechanism from the server's list ────────────────────────────────
  {
    const h = harness({
      '/api/v1/me': jsonRes({ ok: true, user: null, providers: PROVIDERS }),
      '/api/auth/sign-in/social': jsonRes({ url: 'https://accounts.google.example/authz' }),
      '/api/auth/sign-in/oauth2': jsonRes({ url: 'https://discord.example/authz' }),
    });
    const acc = createAccount(h.edges);
    await acc.refresh();
    await acc.login('google');
    const g = h.calls.find((c) => c.url === '/api/auth/sign-in/social');
    const gBody = JSON.parse(g.opts.body);
    check('google (social) → sign-in/social with {provider}', gBody.provider === 'google' && !gBody.providerId);
    check('callbackURL is the calling page (origin + pathname)', gBody.callbackURL === 'https://holocron.work/player/');
    check('social sign-in redirects to the provider URL', h.edges.location.assigned === 'https://accounts.google.example/authz');
    await acc.login('discord');
    const d = h.calls.find((c) => c.url === '/api/auth/sign-in/oauth2');
    const dBody = JSON.parse(d.opts.body);
    check('discord (oauth2) → sign-in/oauth2 with {providerId}', dBody.providerId === 'discord' && !dBody.provider);
    const unknown = await acc.login('microsoft');
    check('a provider the server did not list is refused client-side (R-F34-6 downstream)',
      unknown.ok === false && unknown.error === 'unknown_provider');
  }

  // ── logout: refresh-shaped ─────────────────────────────────────────────────
  {
    let me = { ok: true, user: USER, providers: PROVIDERS };
    const h = harness({
      '/api/v1/me': () => jsonRes(me),
      '/api/v1/logout': (opts) => { me = { ok: true, user: null, providers: PROVIDERS }; return jsonRes({ ok: true, user: null }); },
    });
    const acc = createAccount(h.edges);
    await acc.refresh();
    h.posted.length = 0;
    const s = await acc.logout();
    const lo = h.calls.find((c) => c.url === '/api/v1/logout');
    check('logout POSTs /api/v1/logout with credentials', lo && lo.opts.method === 'POST' && lo.opts.credentials === 'include');
    check('logout lands signed-out via the /me re-fetch', s.status === 'ready' && s.user === null);
    check('the identity change broadcasts (other tabs learn)', h.posted.length === 1);
  }

  // ── deleteAccount: the C4 floor client-side ────────────────────────────────
  {
    let me = { ok: true, user: USER, providers: PROVIDERS };
    const h = harness({
      '/api/v1/me': () => jsonRes(me),
      '/api/v1/account': () => { me = { ok: true, user: null, providers: PROVIDERS }; return jsonRes({ ok: true, deleted: true }); },
    });
    const acc = createAccount(h.edges);
    await acc.refresh();
    const r = await acc.deleteAccount();
    const del = h.calls.find((c) => c.url === '/api/v1/account');
    check('deleteAccount sends DELETE /api/v1/account with credentials',
      del && del.opts.method === 'DELETE' && del.opts.credentials === 'include');
    check('deleteAccount resolves {ok:true} and lands signed-out via /me',
      r.ok === true && r.state.user === null && acc.state().user === null);
  }
  {
    const h = harness({ '/api/v1/me': jsonRes({ ok: true, user: null, providers: [] }) });
    const acc = createAccount(h.edges);
    const r = await acc.deleteAccount();
    check('deleteAccount against a dead endpoint resolves {ok:false}, never throws', r.ok === false);
  }

  // ── cross-tab receive ──────────────────────────────────────────────────────
  {
    const h = harness({ '/api/v1/me': jsonRes({ ok: true, user: null, providers: [] }) });
    const acc = createAccount(h.edges);
    await acc.refresh();
    h.receive({ type: 'account-changed' });
    await new Promise((r) => setTimeout(r, 0));
    check('an account-changed message triggers a re-fetch', h.calls.length === 2, h.calls.length);
    h.receive({ type: 'unrelated' });
    await new Promise((r) => setTimeout(r, 0));
    check('unrelated messages are ignored', h.calls.length === 2);
  }

  // ── subscribers ────────────────────────────────────────────────────────────
  {
    const h = harness({ '/api/v1/me': jsonRes({ ok: true, user: USER, providers: PROVIDERS }) });
    const acc = createAccount(h.edges);
    const seen = [];
    const un = acc.subscribe((s) => seen.push(s.status));
    acc.subscribe(() => { throw new Error('bad subscriber'); });
    await acc.refresh();
    check('subscribe fires immediately with the current state, then on change',
      seen[0] === 'unknown' && seen[seen.length - 1] === 'ready');
    check('a throwing subscriber cannot break the seam (refresh still landed)', acc.state().status === 'ready');
    un();
    const n = seen.length;
    await acc.refresh();
    check('unsubscribe stops delivery', seen.length === n);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
