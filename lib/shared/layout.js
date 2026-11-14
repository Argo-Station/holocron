/**
 * layout.js — THE desktop/mobile LAYOUT MODE system (F-46 Desktop Curation; ruling
 * desktop-curation-program §3 T0, contract G10).
 *
 * ONE home for "is this a desktop layout?" — the shell CSS (`:root[data-layout="desktop"]`) and
 * every desktop-adopting screen read the resolved mode from here. Mobile is byte-identical below
 * 1024px BY CONSTRUCTION: the attribute is `mobile` there and the existing phone-width caps apply
 * verbatim.
 *
 * THE RESOLUTION LAW (exact): `desktop` iff pref()==='desktop', OR (pref()==='auto' AND
 * matchMedia('(min-width:1024px)').matches). Everything else → `mobile`. WIDTH ONLY — no
 * pointer/user-agent sniffing (a browser "desktop site" toggle changes UA, not width, and must
 * NOT drive our layout). Deterministic + testable.
 *
 * THE DOM STAMP: init() and every change set document.documentElement.dataset.layout = mode() and
 * dispatch a 'swrpg-layout-changed' CustomEvent. React consumes via a 10-line useLayoutMode() hook.
 *
 * Plain classic script (no JSX, no deps) — the sources.js / mods.js idiom, dual-exported for
 * consistency. The resolution law is verified live across four viewports + a threshold flip by
 * scripts/smoke_desktop_layout.py (a stronger check than a unit test — it exercises the real
 * matchMedia + the DOM stamp + the A4 no-remount guarantee).
 */
(function (root) {
  var MODES = ['auto', 'mobile', 'desktop'];
  var PREF_KEY = 'swrpg_layout_pref';
  // The seam is bands.js's (one home for the ladder); the literal fallback keeps node tests that
  // load this file alone on the same number.
  var MQ = (root && root.SWRPGBands && root.SWRPGBands.MQ_DESKTOP) || '(min-width: 1024px)';

  function pref() {
    try {
      var v = root.localStorage && root.localStorage.getItem(PREF_KEY);
      return (v === 'mobile' || v === 'desktop') ? v : 'auto';
    } catch (e) { return 'auto'; }
  }
  function wide() {
    try { return !!(root.matchMedia && root.matchMedia(MQ).matches); } catch (e) { return false; }
  }
  function mode() {
    var p = pref();
    if (p === 'desktop') return 'desktop';
    if (p === 'mobile') return 'mobile';
    return wide() ? 'desktop' : 'mobile';  // auto
  }
  function stamp() {
    try {
      if (root.document && root.document.documentElement) {
        root.document.documentElement.dataset.layout = mode();
      }
    } catch (e) {}
  }
  function broadcast() {
    stamp();
    try { if (root.dispatchEvent) root.dispatchEvent(new CustomEvent('swrpg-layout-changed')); } catch (e) {}
  }
  function setPref(v) {
    if (MODES.indexOf(v) < 0) return;
    try { if (root.localStorage) root.localStorage.setItem(PREF_KEY, v); } catch (e) {}
    broadcast();
  }
  var _inited = false;
  function init() {
    if (_inited) return;
    _inited = true;
    stamp();
    try {
      if (root.matchMedia) {
        var mq = root.matchMedia(MQ);
        var onChange = function () { broadcast(); };
        // width crossing the threshold (rotate/resize/zoom) → pure restyle (A4), never a remount.
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);  // Safari < 14
      }
    } catch (e) {}
  }

  var api = { MODES: MODES, PREF_KEY: PREF_KEY, pref: pref, setPref: setPref, mode: mode, init: init };
  if (typeof root !== 'undefined') root.SWRPGLayout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);

// Stamp as early as possible (guarded) so the shell CSS resolves before first paint where it can.
if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.SWRPGLayout) {
  window.SWRPGLayout.init();
}
