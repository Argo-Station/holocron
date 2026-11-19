/* lib/shared/campaignsDoor.js — THE CAMPAIGNS DOOR'S SWITCH (window.SWRPGCampaignsDoor), read by BOTH apps.
 *
 * Ruling `encounters-e6-frames` R-E6F-2 (the key on paper first, R-Y2-1), on the ENCOUNTERS door's switch's
 * pattern (`encountersDoor.js`, deleted in encounters-e3-deletion): one function.
 *
 * THE SWITCH, SINCE THE FLIP (ruling `encounters-e6-walk` ADDENDUM 26 CONTRACT 1, R-Y2-1; the E3 flip's shape):
 * `swrpg_campaigns_door`: the string '0' is OFF; anything else, or no key, is ON; a storage error reads ON. DEFAULT ON.
 *   ON  — the GM landing's CAMPAIGNS plate and the player landing's Campaigns tile, and the routes of R-E6F-1.
 *   OFF ('0', the escape) — the apps as before the flip (R-E6F-3): no CAMPAIGNS tile on either landing, and
 *         /gm/campaigns[/<id>], /player/campaigns[/<id>] and /player/join fall back to their app's landing, as an unknown
 *         path does. The escape stays until a later deletion lap, as E3's did.
 * The app never writes the key; suites plant it. A read-only switch, so it has no store-census WRITE row (its row says
 * so). Before the flip, '1' was ON and the default OFF.
 *
 * THE LOAD (B-1874, ruling release-r7-bug-burndown ADDENDUMS 721, 722). The shells tag this file and tableSession.js. `load()`
 * runs the rest, in the order the shells tagged them. The GM calls it before its first render when `on()` is true (the
 * current screen holds; no loading look, 426 §5), so every view that reads them mounts with them in. The PLAYER
 * (`encounters-e6-walk` ADDENDUMS 27, 29) runs `loadFirst()` before mount on every boot — `FIRST`, the store, the Campaigns
 * tile's one reader, so the tile draws its final height at first paint — and the rest after first paint, except on a cold
 * /player/campaigns… or /player/join…, where `load()` runs all three before mount. `FILES` and `FIRST` are the census's
 * declared source for these bytes (B-1895, release-r7-bug-burndown ADDENDUMS 749, 750). Each file is injected once,
 * whichever call asks first. Off, it
 * fetches nothing. It never rejects: a file that fails reads as the door off (each app's `…On()` asks for
 * SWRPGCampaignsView). A door flipped after boot takes effect on the next load, as the routes always have.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_campaigns_door';

  function on() {
    try { return !(root.localStorage && root.localStorage.getItem(KEY) === '0'); } catch (e) { return true; }
  }

  // the GM's OPEN TABLE sheet draws the join link's QR, so it asks for qrcode-generator too, before the screens
  // tableSession.js is NOT here: both shells tag it eagerly beside this file, since its pcOf is a fight's PC-name reader
  // with the door off too (B-1851; ADDENDUM 722). It reads tableLink and campaignStore at call time, so they come later.
  var FILES = ['/dist/lib/shared/campaignStore.js', '/dist/lib/shared/tableLink.js', '/lib/shared/campaignsView.js'];   // B-1912 (ADDENDUM 761): the two raw files load their dist/ copies; campaignsView.js is BUILT
  var QR = '/public/vendor/qrcode-generator/qrcode.js';
  var FIRST = FILES.slice(0, 1);   // ADDENDUM 29: campaignStore, which the player's landing tile reads at first paint
  var _load = null, _first = null, _ran = {};
  function inject(src) {
    if (_ran[src]) return _ran[src];
    return (_ran[src] = new Promise(function (resolve, reject) {
      var s = root.document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      root.document.head.appendChild(s);
    }));
  }
  function run(files) {
    return files.reduce(function (p, src) { return p.then(function () { return inject(src); }); }, Promise.resolve())
      .then(function () { return true; }, function (e) { console.warn('[campaigns] the campaign files did not load; the door reads off:', e); return false; });
  }
  function load(opts) {
    if (!on()) return Promise.resolve(false);
    if (_load) return _load;
    return (_load = run(FILES.slice(0, 2).concat(opts && opts.qr ? [QR] : [], FILES.slice(2))));
  }
  function loadFirst() {
    if (!on()) return Promise.resolve(false);
    return _first || (_first = run(FIRST));
  }

  var api = { KEY: KEY, on: on, load: load, loadFirst: loadFirst, FILES: FILES, FIRST: FIRST, QR: QR };
  if (typeof root !== 'undefined' && root) root.SWRPGCampaignsDoor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
