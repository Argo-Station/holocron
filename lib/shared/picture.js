/**
 * picture.js — the ONE re-encode helper for a picture the player gives the app (ruling `shipyard-s4-ground`
 * R-S4G-16: "one helper, two settings"; `shipyard-s3-contracts` F-b; JOB 3a).
 *
 * `reEncode(dataUri, { ladder, maxChars })` → Promise<{ dataUrl, refused }>. It draws the image into a canvas at each
 * rung's longest edge and JPEG quality, in turn:
 *   · a CHARACTER'S PORTRAIT — one rung, no cap: [[512, 0.82]]. Exactly the shipped `reEncodePortrait` (R-OGG-21,
 *     B-926): the rung's JPEG, or the ORIGINAL data URI on any failure, so a portrait is never lost to a re-encode
 *     error. `player/app.jsx` keeps `reEncodePortrait(dataUri, maxEdge, quality)` as a same-name adapter over it.
 *   · a SHIP'S PICTURE (U1, K1.image) — F-b's ladder with its cap: `SWRPGVessels.IMAGE_LADDER` ([512, .82] →
 *     [512, .70] → [384, .70]) until the JPEG fits `SWRPGVessels.IMAGE_MAX_CHARS` (96,000). None fits → refused
 *     'too_large'; the file will not decode as an image → refused 'not_picture'. The store's own `imageRefusal`
 *     still decides the write (the device's room, `fleet_full`), so the refusals U1 prints come from two owners,
 *     each once.
 * `readFile(file)` → Promise<dataUri>, the FileReader step both callers share.
 * `check(file)` → Promise<{ ok, refused }> — B-1258: THE ONE TRUST-BOUNDARY CHECK every image picker calls before it
 *   keeps anything (the ship's picture through `reEncode`, the deck plan, the sheet portrait, the store's single replace
 *   and batch import). A file the browser cannot decode as an image is refused 'not_picture'; `accept="image/*"` is the
 *   OS chooser's hint, not the app's refusal. It decodes through `decode`, the same step `reEncode` draws from.
 *
 * The settings are the CALLERS', passed in; nothing here knows a portrait from a ship. test/picture_helper.cjs pins
 * both settings and the single rung's fallback. Classic script → window.SWRPGPicture; no DOM at load.
 * HOSTS: the player loads it `defer` (portrait uploads, the Yard); the GM app injects it with the Yard's character core
 * under K9 (gm/app.jsx `ensureYardCharCore`).
 */
(function (global) {
  'use strict';

  function drawJpeg(img, edge, quality) {
    var w = img.naturalWidth, hgt = img.naturalHeight;
    if (!w || !hgt) return null;
    var scale = Math.min(1, edge / Math.max(w, hgt));
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(hgt * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  // the one decode: resolves to the loaded <img> with a real size, or null when the source is not an image
  function decode(src) {
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () { resolve(img.naturalWidth && img.naturalHeight ? img : null); };
        img.onerror = function () { resolve(null); };
        img.src = src;
      } catch (e) { resolve(null); }
    });
  }

  function reEncode(dataUri, opts) {
    opts = opts || {};
    var ladder = Array.isArray(opts.ladder) && opts.ladder.length ? opts.ladder : [[512, 0.82]];
    var cap = typeof opts.maxChars === 'number' ? opts.maxChars : null;
    var single = ladder.length === 1 && cap == null;   // the portrait's setting: never refuse, never lose it
    return new Promise(function (resolve) {
      if (!dataUri) { resolve({ dataUrl: '', refused: single ? null : 'not_picture' }); return; }
      function fail(reason) { resolve(single ? { dataUrl: dataUri, refused: null } : { dataUrl: null, refused: reason }); }
      decode(dataUri).then(function (img) {
        if (!img) { fail('not_picture'); return; }
        try {
          for (var i = 0; i < ladder.length; i++) {
            var out = drawJpeg(img, ladder[i][0], ladder[i][1]);
            if (!out) { fail('not_picture'); return; }
            if (cap == null || out.length <= cap) { resolve({ dataUrl: out, refused: null }); return; }
          }
          resolve({ dataUrl: null, refused: 'too_large' });
        } catch (e) { fail('not_picture'); }
      });
    });
  }

  function check(file) {
    if (!file) return Promise.resolve({ ok: false, refused: 'not_picture' });
    var U = typeof URL !== 'undefined' && URL.createObjectURL ? URL : null;
    var src = U ? Promise.resolve(U.createObjectURL(file)) : readFile(file);
    return src.then(function (s) {
      return decode(s).then(function (img) {
        if (U) U.revokeObjectURL(s);
        return img ? { ok: true, refused: null } : { ok: false, refused: 'not_picture' };
      });
    }, function () { return { ok: false, refused: 'not_picture' }; });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(reader.error || new Error('unreadable')); };
        reader.readAsDataURL(file);
      } catch (e) { reject(e); }
    });
  }

  var api = { reEncode: reEncode, readFile: readFile, check: check, PORTRAIT: { ladder: [[512, 0.82]], maxChars: null } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGPicture = api;
})(typeof window !== 'undefined' ? window : this);
