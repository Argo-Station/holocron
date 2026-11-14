/**
 * recordPortrait.js — a saved character's OWN picture: where it is stored, and the one way to read it.
 * B-931, ruling `paper-b931` (R-PB9-1..5), on the census lab `57e56c49` `lab/paper/b931_census_3f002810.md`.
 *
 * THE SHAPE (R-PB9-1). A record carries its picture ONCE, at `sheetData.portrait`. Records written before B-931
 * carry it up to three times: the record-level `portrait` (T), `selectedChar.portrait` (SC) and
 * `sheetData.portrait` (SD). Nothing rewrites those at load (R-PB9-3): each one shrinks on its owner's next write.
 *
 * THE FOLD (R-PB9-4). `recordPortraitOf(rec)` is the ONE reader of a stored record's picture. Order: a `data:` URI
 * (an upload or an import) first, then any non-empty value; within each, SC, then T, then SD. That reproduces what
 * the sheet showed before B-931, the 3 TOR species whose SC and SD hold different art included. A new record has
 * only SD, so the order never matters for it.
 *
 * THE WRITE (R-PB9-5). `foldRecordPortrait(rec)` returns the pair a write stores: `selectedChar` without a
 * `portrait`, its other fields kept (the pregen catalog's tagline, description and playstyle live only there), and
 * `sheetData` carrying the folded value. Fold FIRST, then write: a value that lives only in a legacy copy (the 5
 * species whose SD is empty) is carried into SD rather than dropped, and a removal leaves no stale copy behind to
 * come back. A record with no sheetData object keeps the folded value on selectedChar, so nothing is lost.
 *
 * NOT `SWRPGPortraits.charPortrait` (lib/shared/portraits.js): that resolves SPECIES art and reads no copy.
 *
 * HOSTS: player (deferred, before app.js). Node: `require` it, as test/b931_one_portrait.cjs does.
 */
(function (root) {
  'use strict';

  function str(v) { return typeof v === 'string' ? v : ''; }

  // The three copies, in the fold's order: SC, then T, then SD.
  function copiesOf(rec) {
    rec = rec || {};
    return [str((rec.selectedChar || {}).portrait), str(rec.portrait), str((rec.sheetData || {}).portrait)];
  }

  function recordPortraitOf(rec) {
    var c = copiesOf(rec);
    for (var i = 0; i < c.length; i++) if (c[i].indexOf('data:') === 0) return c[i];
    for (var j = 0; j < c.length; j++) if (c[j]) return c[j];
    return '';
  }

  function foldRecordPortrait(rec) {
    rec = rec || {};
    var value = recordPortraitOf(rec);
    var sc = rec.selectedChar ? Object.assign({}, rec.selectedChar) : null;
    var sd = (rec.sheetData && typeof rec.sheetData === 'object') ? Object.assign({}, rec.sheetData) : null;
    if (!sd) {
      if (sc && value) sc.portrait = value;
      return { selectedChar: sc, sheetData: rec.sheetData == null ? null : rec.sheetData, portrait: value };
    }
    if (sc) delete sc.portrait;
    if (value || Object.prototype.hasOwnProperty.call(sd, 'portrait')) sd.portrait = value;
    return { selectedChar: sc, sheetData: sd, portrait: value };
  }

  var API = { recordPortraitOf: recordPortraitOf, foldRecordPortrait: foldRecordPortrait };
  if (typeof window !== 'undefined') root.SWRPGRecordPortrait = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
