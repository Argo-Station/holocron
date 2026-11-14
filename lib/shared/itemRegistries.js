/**
 * itemRegistries.js — window.SWRPGItemRegistries: THE ONE items loader (F-100 UD-1f; ruling
 * f100-ud1-contracts H2 + H6, R-FUD-7 funnel 2; brief f100-ud1-contracts §7).
 *
 * THE DEFECT IT CLOSES. Three fetch paths shared ONE cache key with different shapes: the player's
 * loadCanonicalRegistries (5 files), the store's loadRegistries (3 files — "whoever fetches first
 * wins"), and BYOA's own third fetch. Whichever ran first decided whether `attachments` and `skills`
 * existed on `window._canonicalRegistries` for everyone else. There is now one loader, and all three
 * callers are re-pointed to it.
 *
 * TWO VIEWS, THE CHARBUILD PRECEDENT (F-9 B2: `_canonicalCharbuildBase` / `_canonicalCharbuild`):
 *   window._canonicalRegistriesBase — PRISTINE: the shipped registries, never overlaid.
 *   window._canonicalRegistries     — DISCOVERY: the base with every ACTIVE user pack folded in, in
 *                                     layer order. The store and the creator read this.
 * OWNERSHIP IS THE STAMP (H2). A sheet's items resolve through forStampSync(sheet.mods). A sheet
 * with no `user:` stamp resolves against the PRISTINE base, byte-equal to before this lap (variants
 * carry no item sections). A stamped sheet resolves its own packs over that base, whatever the
 * discovery toggles say now. A pack change (`swrpg-user-packs-changed`) re-folds discovery from the
 * cached base, with no re-fetch.
 *
 * Dual-export (window.SWRPGItemRegistries / CommonJS `create`), sources.js idiom. Needs mods.js;
 * userData.js is optional (without it, discovery IS the base).
 */
(function (root) {
  'use strict';

  var FILES = ['weapons', 'armor', 'gear', 'attachments'];
  var BASE_DIR = 'public/data/canonical/';

  function isUserStamp(s) { return typeof s === 'string' && s.indexOf('user:') === 0; }

  // create(env) — env: { fetchJson(path) → Promise<json>, host (the object holding the cache globals),
  // mods (SWRPGMods), userData() → SWRPGUserData|null }
  function create(env) {
    var host = env.host;
    function ud() { try { return env.userData ? env.userData() : null; } catch (e) { return null; } }

    function fetchBase() {
      var f = env.fetchJson;
      return Promise.all(FILES.map(function (s) { return f(BASE_DIR + s + '.json'); }).concat([
        // R-PCA-2: the skills vocabulary joins a `pool_mods` anchor to a check (was the player's own).
        f(BASE_DIR + 'skills.vocab.json'),
      ])).then(function (r) {
        return { weapons: r[0].weapons, armor: r[1].armor, gear: r[2].gear, attachments: r[3].attachments,
                 skills: (r[4] && r[4].entries) || [] };
      });
    }
    // The discovery fold: the active user stamps, through the ONE seam (SWRPGMods.resolveForStamp).
    function fold(base) {
      var U = ud();
      if (!U) return Promise.resolve(base);
      U.provideBase({ weapons: base.weapons, armor: base.armor, gear: base.gear });
      return U.ready().then(function () {
        var stamps = U.activeStamps();
        return stamps.length ? env.mods.resolveForStamp(stamps, base) : base;
      }).then(function (v) { return v || base; }, function (e) {
        if (typeof console !== 'undefined') console.warn('[items] user packs not applied:', e);
        return base;
      });
    }

    // load() → Promise<discovery view | null>. Same cache keys every caller has always read, so
    // clearCanonicalLoadCaches (B-27 RETRY) and the sheets' readiness hooks keep working unchanged.
    function load() {
      if (host._canonicalRegistries) return Promise.resolve(host._canonicalRegistries);
      if (host._canonicalRegistriesPromise) return host._canonicalRegistriesPromise;
      var got = host._canonicalRegistriesBase ? Promise.resolve(host._canonicalRegistriesBase) : fetchBase();
      host._canonicalRegistriesPromise = got.then(function (base) {
        host._canonicalRegistriesBase = base;
        return fold(base);
      }).then(function (view) {
        host._canonicalRegistries = view;
        return view;
      }).catch(function (err) {
        if (typeof console !== 'undefined') console.warn('[canonical] registry load failed:', err);
        return null;
      });
      return host._canonicalRegistriesPromise;
    }

    // The ITEMS view a sheet OWNS (H2). Only `user:` stamps reach it (variants carry no item sections).
    // No user stamp → the pristine base. Before the base is loaded, it falls back to whatever the global
    // holds, which is the pre-lap behaviour.
    function userStamps(mods) { return (Array.isArray(mods) ? mods : []).filter(isUserStamp); }
    // F-100 M13 (R-M13L-13): `own` is the sheet's own layer, folded last over the items through the one fold (SWRPGMods.foldOwn).
    function foldOwnItems(view, own) { return (own && env.mods && env.mods.foldOwn) ? env.mods.foldOwn(view, { own: own }) : view; }
    function forStampSync(mods, own) {
      var base = host._canonicalRegistriesBase;
      if (!base) return host._canonicalRegistries || null;
      var st = userStamps(mods);
      return foldOwnItems(st.length ? env.mods.applyStampSync(st, base) : base, own);
    }
    function forStamp(mods, own) {
      return load().then(function () {
        var base = host._canonicalRegistriesBase;
        var st = userStamps(mods);
        return (base && st.length) ? env.mods.resolveForStamp(st, base).then(function (view) { return foldOwnItems(view, own); }) : forStampSync(mods, own);
      });
    }
    function invalidate() {
      host._canonicalRegistries = null;
      host._canonicalRegistriesPromise = null;
    }
    return { load: load, forStampSync: forStampSync, forStamp: forStamp, invalidate: invalidate,
             base: function () { return host._canonicalRegistriesBase || null; } };
  }

  var exported = { create: create, FILES: FILES };

  if (typeof window !== 'undefined' && root && root === window) {
    var api = create({
      host: root,
      get mods() { return root.SWRPGMods; },          // read at call time: script order cannot bite
      userData: function () { return root.SWRPGUserData || null; },
      // B-139 (433 (d)): the page's one read per URL when it has one (player; gm only once the Yard mounts).
      fetchJson: function (p) { if (typeof root.qbFetchJson === 'function') return root.qbFetchJson(p); return fetch(p).then(function (r) { if (!r.ok) throw new Error('Failed to load ' + p + ': ' + r.statusText); return r.json(); }); },
    });
    api.create = create;
    root.SWRPGItemRegistries = api;
    // A pack change re-folds discovery from the cached base (no re-fetch); ownership is untouched.
    if (!root._itemPacksInvalidatorWired && root.addEventListener) {
      root._itemPacksInvalidatorWired = true;
      root.addEventListener('swrpg-user-packs-changed', function () { api.invalidate(); });
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
})(typeof window !== 'undefined' ? window : this);
