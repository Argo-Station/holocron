/**
 * account.js — THE shared account seam (F-34 Phase A; ruling f34-login-build-scope).
 *
 * ONE module, all three apps + the launchpad (the no-compromise-mirror law): session state,
 * login/logout, cross-tab broadcast. Nothing else in the product talks to /api/v1 or
 * /api/auth directly — this file is the whole client-side surface of accounts.
 *
 * THE LAW THIS FILE INHERITS (ADR 0017 / worker/index.js): login may fail; the game tools may
 * not. Every network path in here resolves — a dead API yields state {status:'offline',
 * user:null, providers:[]} and NEVER a throw that could take a mounting app down with it.
 * The UI renders from `providers`, so an unreachable API means NO login button rather than a
 * dead one (R-F34-6's defect class: success and failure indistinguishable from outside).
 *
 * WHAT THE SERVER SENDS (GET /api/v1/me, cache-control: no-store):
 *   { ok, user: { id, name, image } | null, providers: [{ id, signIn }] }
 * `user` is the zero-PII whitelist — no email field exists on this wire, ever (Finding 2).
 * `providers` is DERIVED server-side from which providers have credentials bound, and each
 * carries its sign-in mechanism ('social' = better-auth built-in, 'oauth2' = genericOAuth
 * plugin) so this file never re-remembers a fact that lives in worker/auth.js.
 *
 * CROSS-TAB: BroadcastChannel('swrpg_account'). A tab that OBSERVES an identity change
 * (refresh sees a different user id, or its own logout) posts once; receivers re-fetch /me.
 * Rebroadcast happens only on actual change, so the exchange converges instead of looping.
 *
 * Pure logic + injected edges (fetch/location/channel), factory-exported for Node tests
 * (test/account_module.cjs) exactly like sources.js; the browser boot at the bottom wires the
 * real ones and exposes window.SWRPGAccount.
 */
(function (root) {
  'use strict';

  // ── THE DARK-LAUNCH FLAG (R-PA-1; ruling f34-phase-a C-PA-1) ─────────────────────────────────
  // Phase A ships DARK: built, deployed and proven against real production, with NO sign-in
  // affordance any visitor can see. This constant is the mechanism — before it existed, darkness
  // was a side-effect of leaving credentials unbound, which made the live OAuth drive and the dark
  // period mutually exclusive (ruling f34-phase-a §3: binding credentials to run the drive would
  // have opened the door to every visitor in the same instant).
  //
  // IT GATES THE VISIBLE AFFORDANCES ONLY — the launchpad door, the SuiteBar chip, and the account
  // page's sign-in buttons. It does NOT gate this module, `/api/v1/*` or `/api/auth/*`: those stay
  // reachable by direct URL, which is exactly what lets C-PA-5's live drive run invisibly.
  //
  // LIT 2026-08-06, at Phase B's light-up gate. It was false for the whole of Phase A and most of
  // Phase B, on the rule that a visible sign-in must not offer a promise the product cannot keep —
  // the "I signed in and nothing happened" defect Q1c was written to prevent. That promise is now
  // kept: an account carries your characters, ships, NPCs, groups, variants and books across
  // devices; the merge refuses to guess and asks instead; a deletion survives; and a question you
  // have not answered is never overwritten behind your back.
  //
  // What flipping this does NOT do, stated because the seam was deliberately built independent of
  // it: `/api/v1/*` and `/api/auth/*` were always reachable, and sync always ran for a signed-in
  // session. This makes the four AFFORDANCES visible — the launchpad band, the account page's
  // sign-in buttons, the HUB row, and the chip. Signed-OUT chrome is unchanged by design, save the
  // one ruled HUB row (C-DP-3).
  //
  // Read at RENDER time by every consumer (never captured at load), so the four surfaces can never
  // disagree about whether the product is dark.
  var ACCOUNT_UI_ENABLED = true;

  function accountUIEnabled() {
    return !!(root.SWRPGAccountUI && root.SWRPGAccountUI.enabled);
  }

  function createAccount(edges) {
    var doFetch = edges.fetch;
    var loc = edges.location;
    var channel = edges.channel || null;   // { post(msg), onMessage(fn) } or null

    var state = { status: 'unknown', user: null, providers: [] };
    var subscribers = [];
    var refreshing = null;   // in-flight /me promise, shared so concurrent callers coalesce

    function snapshot() {
      return { status: state.status, user: state.user, providers: state.providers };
    }
    function notify() {
      var s = snapshot();
      subscribers.forEach(function (fn) { try { fn(s); } catch (e) { /* a bad subscriber cannot break the seam */ } });
    }
    function subscribe(fn) {
      subscribers.push(fn);
      try { fn(snapshot()); } catch (e) { /* as above */ }
      return function () {
        var i = subscribers.indexOf(fn);
        if (i >= 0) subscribers.splice(i, 1);
      };
    }

    function sameUser(a, b) {
      return (a === null && b === null) || (!!a && !!b && a.id === b.id);
    }

    // GET /api/v1/me → update state. Broadcasts ONLY when identity actually changed, so the
    // cross-tab exchange converges. Any failure → 'offline', never a rejection.
    function refresh() {
      if (refreshing) return refreshing;
      refreshing = Promise.resolve()
        .then(function () { return doFetch('/api/v1/me', { credentials: 'include' }); })
        .then(function (res) {
          if (!res || !res.ok) throw new Error('me_unavailable');
          return res.json();
        })
        .then(function (body) {
          var prev = state.user;
          state.status = 'ready';
          state.user = body && body.user ? body.user : null;
          state.providers = (body && body.providers) || [];
          if (!sameUser(prev, state.user) && channel) channel.post({ type: 'account-changed' });
          notify();
          return snapshot();
        })
        .catch(function () {
          state.status = 'offline';
          state.user = null;
          state.providers = [];
          notify();
          return snapshot();
        })
        .then(function (s) { refreshing = null; return s; });
      return refreshing;
    }

    // login(providerId) → the full-page OAuth redirect. The endpoint is chosen by the
    // provider's OWN signIn mechanism from the server's list — never guessed here. Unknown
    // provider (UI raced a credential change) or a dead API resolves {ok:false}; the caller's
    // button un-busies and the tools keep working.
    function login(providerId) {
      var p = null;
      for (var i = 0; i < state.providers.length; i++) {
        if (state.providers[i].id === providerId) { p = state.providers[i]; break; }
      }
      if (!p) return Promise.resolve({ ok: false, error: 'unknown_provider' });
      var callbackURL = loc.origin + loc.pathname;
      var path = p.signIn === 'oauth2' ? '/api/auth/sign-in/oauth2' : '/api/auth/sign-in/social';
      var body = p.signIn === 'oauth2'
        ? { providerId: p.id, callbackURL: callbackURL }
        : { provider: p.id, callbackURL: callbackURL };
      return Promise.resolve()
        .then(function () {
          return doFetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          });
        })
        .then(function (res) {
          if (!res || !res.ok) throw new Error('sign_in_unavailable');
          return res.json();
        })
        .then(function (out) {
          if (out && out.url) { loc.assign(out.url); return { ok: true }; }
          throw new Error('no_redirect_url');
        })
        .catch(function (e) {
          return { ok: false, error: (e && e.message) || 'sign_in_failed' };
        });
    }

    // logout() → POST /api/v1/logout (idempotent server-side), then re-fetch /me. The refresh
    // is what broadcasts — logout is just an identity change observed like any other.
    function logout() {
      return Promise.resolve()
        .then(function () { return doFetch('/api/v1/logout', { method: 'POST', credentials: 'include' }); })
        .catch(function () { /* even a dead API: fall through to refresh, which reports honestly */ })
        .then(function () { return refresh(); });
    }

    // deleteAccount() → DELETE /api/v1/account (the C4 floor's teeth), then re-fetch /me.
    // Resolves { ok } so the account page can say "deleted" vs "unavailable" honestly; the
    // state change itself arrives through refresh, same as logout.
    function deleteAccount() {
      var ok = false;
      return Promise.resolve()
        .then(function () { return doFetch('/api/v1/account', { method: 'DELETE', credentials: 'include' }); })
        .then(function (res) {
          ok = !!(res && res.ok);
          if (ok && edges.clearSyncBase) edges.clearSyncBase();   // ADDENDUM 531 item 2: this door loads no sync.js, so it clears the base itself
        })
        .catch(function () { /* dead API → ok stays false; refresh reports the honest state */ })
        .then(function () { return refresh(); })
        .then(function (s) { return { ok: ok, state: s }; });
    }

    if (channel) channel.onMessage(function (msg) {
      if (msg && msg.type === 'account-changed') refresh();
    });

    // ── Phase B: sync starts when a session appears, and stops when it goes ───
    // Wired HERE rather than in each app, because "who is signed in" is this module's business and
    // three copies of the same subscribe would be three chances to drift. `adopt()` runs ONCE per
    // sign-in — it is the merge, not a refresh — and the watcher runs only while signed in, which is
    // what keeps the logged-out path byte-identical to today.
    var syncStarted = false;
    subscribe(function (s) {
      var sync = (typeof window !== 'undefined') && window.SWRPGSync;
      if (!sync) return;
      if (s.user && !syncStarted) {
        syncStarted = true;
        // the account's id switches on this device's sync base for it (B-1650, ruling release-r7-bug-burndown ADDENDUM 389)
        sync.adopt({ uid: s.user.id }).then(function () { sync.watch(); });
      } else if (!s.user && syncStarted) {
        syncStarted = false;
        sync.unwatch();
        // The sync base stays (ruling `release-r7-bug-burndown` ADDENDUM 531, §C as amended): what this device last agreed is what tells an edit made
        // signed out from a stale copy at the next sign-in. The `uid` refuses it for any other account; account deletion clears it, in deleteAccount.
      }
    });

    return { state: snapshot, subscribe: subscribe, refresh: refresh, login: login, logout: logout, deleteAccount: deleteAccount };
  }

  // ── browser boot ─────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    // The flag's published home. Every affordance reads `SWRPGAccountUI.enabled` at render time;
    // the seam below is deliberately independent of it, so the endpoints stay exercisable while
    // the product is dark.
    root.SWRPGAccountUI = { enabled: ACCOUNT_UI_ENABLED };
    var bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      var raw = new BroadcastChannel('swrpg_account');
      bc = {
        post: function (msg) { try { raw.postMessage(msg); } catch (e) { /* broadcast is best-effort */ } },
        onMessage: function (fn) { raw.onmessage = function (ev) { fn(ev.data); }; },
      };
    }
    root.SWRPGAccount = createAccount({
      fetch: function (url, opts) { return window.fetch(url, opts); },
      location: window.location,
      channel: bc,
      // sync.js's BASE_KEY: a second copy of the name, held to the first by test/b1708_base_kept.cjs
      clearSyncBase: function () { try { window.localStorage.removeItem('swrpg_sync_base_v1'); } catch (e) { /* nothing to free */ } },
    });
  }

  // Exposed so a surface written in plain script (the launchpad door, the account page) asks the
  // same question the bundled chip asks, through one function rather than four copies of a
  // truthiness check.
  if (typeof window !== 'undefined') root.SWRPGAccountUIEnabled = accountUIEnabled;

  // ── Node (tests) ─────────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createAccount: createAccount, ACCOUNT_UI_ENABLED: ACCOUNT_UI_ENABLED };
  }
})(typeof window !== 'undefined' ? window : this);
