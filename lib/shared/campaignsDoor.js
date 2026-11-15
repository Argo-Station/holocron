/* lib/shared/campaignsDoor.js — THE CAMPAIGNS DOOR'S SWITCH (window.SWRPGCampaignsDoor), read by BOTH apps.
 *
 * Ruling `encounters-e6-frames` R-E6F-2 (the key on paper first, R-Y2-1), on `lib/library/npc/encountersDoor.js`'s
 * pattern: one function, and a storage error reads OFF.
 *
 * THE SWITCH. `swrpg_campaigns_door`: the string '1' is ON; anything else, or no key, is OFF. DEFAULT OFF.
 *   OFF — today's apps, byte for byte (R-E6F-3): no CAMPAIGNS tile on either landing, and /gm/campaigns[/<id>],
 *         /player/campaigns[/<id>] and /player/join fall back to their app's landing, as an unknown path does.
 *   ON  — the GM landing's CAMPAIGNS plate and the player landing's Campaigns tile, and the routes of R-E6F-1.
 * The app never writes the key; suites plant it. A read-only switch, so it has no store-census WRITE row (its row says
 * so). THE FLIP is Jason's word: it changes `on()`'s default below in one line.
 *
 * THE LOAD (B-1874, ruling release-r7-bug-burndown ADDENDUMS 721, 722). The shells tag this file and tableSession.js. `load()`
 * runs the rest, in the order the shells tagged them, and each app calls it before its first render when `on()` is true
 * (the current screen holds; no loading look, 426 §5), so every view that reads them mounts with them in. Off, it
 * fetches nothing. It never rejects: a file that fails reads as the door off (each app's `…On()` asks for
 * SWRPGCampaignsView). A door flipped after boot takes effect on the next load, as the routes always have.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_campaigns_door';

  function on() {
    try { return !!(root.localStorage && root.localStorage.getItem(KEY) === '1'); } catch (e) { return false; }
  }

  // the GM's OPEN TABLE sheet draws the join link's QR, so it asks for qrcode-generator too, before the screens
  // tableSession.js is NOT here: both shells tag it eagerly beside this file, since its pcOf is a fight's PC-name reader
  // with the door off too (B-1851; ADDENDUM 722). It reads tableLink and campaignStore at call time, so they come later.
  var FILES = ['/lib/shared/campaignStore.js', '/lib/shared/tableLink.js', '/lib/shared/campaignsView.js'];
  var QR = '/public/vendor/qrcode-generator/qrcode.js';
  var _load = null;
  function inject(src) {
    return new Promise(function (resolve, reject) {
      var s = root.document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      root.document.head.appendChild(s);
    });
  }
  function load(opts) {
    if (!on()) return Promise.resolve(false);
    if (_load) return _load;
    var files = FILES.slice(0, 2).concat(opts && opts.qr ? [QR] : [], FILES.slice(2));
    _load = files.reduce(function (p, src) { return p.then(function () { return inject(src); }); }, Promise.resolve())
      .then(function () { return true; }, function (e) { console.warn('[campaigns] the campaign files did not load; the door reads off:', e); return false; });
    return _load;
  }

  var api = { KEY: KEY, on: on, load: load, FILES: FILES, QR: QR };
  if (typeof root !== 'undefined' && root) root.SWRPGCampaignsDoor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
