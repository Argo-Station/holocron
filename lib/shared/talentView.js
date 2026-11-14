/**
 * talentView.js — THE SHEET'S STAMP VIEW, its host wrapper, one unit for both apps (ruling `f100-m5-contracts` ADDENDUM 3,
 * A3-1…A3-4; HANDOFF `f100-talent-view-shared`; board B-982).
 *
 * What a talent gives a character — its numbers, dice, conditional, floor and tiers — resolves through the character's
 * OWN stamp view (F-100 M5 C4). The ENGINE is CharResolve's and stays there (lib/shared/charResolve.js:
 * setTalentViewResolver · talentViewFor · stampTalentView). This is the WRAPPER that was the player's alone: the view
 * cache, the epoch with its three subscriptions, `sheetTalentView`, and the React hook `useTalentViewEpoch` that every
 * surface showing a character's talent numbers or dice keys its memos on (C4.6; B-844). Both apps load it at boot and
 * BOTH REGISTER it (A3-2), so a house-rule talent reads the same on the GM's screen as on the player's own sheet:
 *   one view    — CharResolve.talentViewFor asks the resolver registered here, on either host;
 *   one base    — `_canonicalCharbuildBase`, written by SWRPGSheetPool.loadCanonicalCharacterBuild on both hosts (A3-3);
 *   one degrade — NULL when a stamped `user:` pack is not on this device, and each consumer takes its own fallback:
 *                 C4.4's persisted projection for derived numbers, collectPoolMods' discovery view for dice (A3-4).
 *
 * VERBATIM. Everything between BEGIN and END was moved, unedited, from `player/app.jsx` @ `fbba069c` (its lines
 * 10243–10284) except that block's one registration line (10275). Registering is a HOST's act, so that line sits in
 * `register()` below, unedited but for its indent, and each host calls `SWRPGTalentView.register()` at its module
 * top (player/app.jsx, gm/app.jsx). A host that loads this file and never registers can therefore be seen:
 * test/sheet_pool_talent_view.cjs runs each host's own statement, read out of its own source.
 * scripts/check_talent_view_verbatim.cjs proves the move line for line.
 * ONE EXCEPTION, after the move: F-100 M6 added one line inside the region (sheetTalentView's `warmOnMiss(mods);`),
 * marked `// F-100 M6 (B-1000)` (ruling `f100-m6-pack` ADDENDUM 1). The checker names it, sets it aside, and proves the
 * rest verbatim as before; its function and the landing listener sit after END.
 *
 * Nothing here is an identifier only one host has (C7's rule): window.CharResolve, SWRPGMods, SWRPGUserData,
 * _canonicalCharbuildBase and React are read at CALL time, and both apps load them all. The epoch's subscriptions are
 * wired at LOAD, so each host loads this file after userData.js and every script its ready() reads when called.
 *
 * HOSTS.
 *   player — a `defer` script after treeView.js, before /player/app.js.
 *   gm     — a script after treeView.js, before /gm/app.js; loaded at boot, not with the Yard's lazy core (A3-2).
 *
 * Exports window.SWRPGTalentView = { register, sheetTalentView, useTalentViewEpoch, bumpTalentViewEpoch }.
 */
(function () {
// ── BEGIN VERBATIM (player/app.jsx @ fbba069c) ─────────────────────────────────────────────────────────────────
// ── F-100 M5 C4 (ruling f100-m5-contracts §3 C4, shape (b)) — THE SHEET'S STAMP VIEW, for every value a talent gives it ──
// The view a talent's numbers, dice, conditional, floor and tiers resolve through: the sheet's OWN stamp over the pristine
// base, never the device's toggles (C4.1; STOP-8). NULL is C4.4's ONE FALLBACK — a `user:` pack the sheet is stamped with
// is not on this device (or the store has not opened yet), or a shipped variant it names has not loaded: the persisted
// projection answers (CharResolve.computeDerived), so a character opened elsewhere keeps its numbers at the table.
// Cached per stamp list and EPOCH; the epoch moves when the packs change or the store opens (useTalentViewEpoch keys the
// sheet's memos on it — B-844: a memo keyed [sheet, equipment] alone never saw a house-rule edit).
var _talentViewCache = { key: null, view: null };
var _talentViewEpoch = 0;
var _talentViewListeners = [];
function bumpTalentViewEpoch() {
  _talentViewEpoch += 1; _talentViewCache = { key: null, view: null };
  _talentViewListeners.slice().forEach(function (fn) { try { fn(_talentViewEpoch); } catch (e) { /* a listener's own fault */ } });
}
if (typeof window !== 'undefined' && !window._talentViewEpochWired) {
  window._talentViewEpochWired = true;
  window.addEventListener('swrpg-user-packs-changed', bumpTalentViewEpoch);
  window.addEventListener('swrpg-mods-changed', bumpTalentViewEpoch);
  var _udForEpoch = window.SWRPGUserData;
  if (_udForEpoch && typeof _udForEpoch.ready === 'function') _udForEpoch.ready().then(bumpTalentViewEpoch, function () {});
}
function sheetTalentView(sheet) {
  var base = window._canonicalCharbuildBase;
  if (!sheet || !base) return null;
  var mods = Array.isArray(sheet.mods) ? sheet.mods : [];
  if (sheet.own) return ownTalentView(sheet, base, mods);   // F-100 M13 (R-M13L-14): a character's own layer has its own view and cache
  if (!mods.length) return base;
  var key = _talentViewEpoch + '\u0000' + mods.join('\u0000');
  if (_talentViewCache.key === key && _talentViewCache.base === base) return _talentViewCache.view;
  warmOnMiss(mods);   // F-100 M6 (B-1000): a cold stamped SHIPPED pack is fetched; its landing moves the epoch
  var view = window.CharResolve.stampTalentView(sheet, base, window.SWRPGMods, window.SWRPGUserData);
  _talentViewCache = { key: key, base: base, view: view };
  return view;
}

// The epoch as React state, for the memos that derive a sheet's numbers.
function useTalentViewEpoch() {
  var st = React.useState(_talentViewEpoch), setEpoch = st[1];
  React.useEffect(function () {
    _talentViewListeners.push(setEpoch);
    return function () { _talentViewListeners = _talentViewListeners.filter(function (f) { return f !== setEpoch; }); };
  }, []);
  return st[0];
}
// ── END VERBATIM ────────────────────────────────────────────────────────────────────────────────────────────────

// F-100 M6 (ruling f100-m6-pack ADDENDUM 1, R-M6G-3 as amended) — B-1000: WARM-ON-MISS. A sheet stamped with a shipped
// pack this device has not loaded (reSpecialized toggled OFF here, or not yet fetched) got a null view, cached until the
// epoch moved — and nothing moved it, so the character's own sheet lost its variant talents' dice. Now the first miss
// fetches every cold stamped SHIPPED pack, and when one lands mods.js fires 'swrpg-mods-pack-loaded' (its own event,
// never broadcast(): that one re-resolves the creator's charbuild), which moves the epoch: the cached null is dropped
// and every memo keyed on the epoch re-derives. A `user:` stamp is never fetched (R-FUD-5): it is on this device or
// nowhere, and C4.4's persisted projection answers for it. A pack whose last fetch FAILED is left to the player's RETRY
// (B-30: no silent retry loop). The one call sits inside the verbatim block, marked; check_talent_view_verbatim names it.
function warmOnMiss(mods) {
  var M = window.SWRPGMods;
  if (!M || typeof M.warm !== 'function' || typeof M.variantOf !== 'function' || typeof M.isUserStamp !== 'function') return;
  var failed = typeof M.failed === 'function' ? M.failed() : [];
  var cold = mods.filter(function (s) { return !M.isUserStamp(s) && !M.variantOf(s) && failed.indexOf(s) < 0; });
  if (cold.length) M.warm(cold);
}
if (typeof window !== 'undefined' && !window._talentViewLandingWired) {
  window._talentViewLandingWired = true;
  window.addEventListener('swrpg-mods-pack-loaded', bumpTalentViewEpoch);
}

// F-100 M13 (R-M13L-14): THE VIEW OF A SHEET WITH ITS OWN LAYER. Two characters with one stamp list must never share a view,
// so the cache is keyed on the `own` OBJECT; a Save builds a new `own` and never mutates one, so it misses. Stamps warm as M6's do.
var _ownViewCache = new WeakMap();
function ownTalentView(sheet, base, mods) {
  var key = _talentViewEpoch + '\u0000' + mods.join('\u0000'), hit = _ownViewCache.get(sheet.own);
  if (hit && hit.key === key && hit.base === base) return hit.view;
  warmOnMiss(mods);
  var view = window.CharResolve.stampTalentView(sheet, base, window.SWRPGMods, window.SWRPGUserData);
  _ownViewCache.set(sheet.own, { key: key, base: base, view: view });
  return view;
}

// A3-2 — THE REGISTRATION, a host's act: player/app.jsx line 10275 @ fbba069c, unedited but for its indent. Each host
// calls this once at its module top; until one does, CharResolve.talentViewFor answers null on that host (every consumer's fallback).
function register() {
  if (typeof window !== 'undefined' && window.CharResolve && window.CharResolve.setTalentViewResolver) window.CharResolve.setTalentViewResolver(sheetTalentView);
}

  window.SWRPGTalentView = {
    register: register,
    sheetTalentView: sheetTalentView,
    useTalentViewEpoch: useTalentViewEpoch,
    bumpTalentViewEpoch: bumpTalentViewEpoch,
  };
})();
