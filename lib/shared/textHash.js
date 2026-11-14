/* lib/shared/textHash.js — THE ONE SPAN HASH ON EVERY DEVICE (window.SWRPGTextHash; require-able).
 *
 * F-100 THE SURFACING MISSION (ruling `f100-surfacing-preflip-species-card` R-SPF-4, executing `f100-m9-build-card`
 * R-M9B-48 (2)). A working row's `words` (and a span `condition` / `unless`) is tied to the exact words it was read from by
 * a hash: `{ start, end, hash }`, where `hash` is sha1 of the UTF-8 bytes of the NORMALISED slice, first 12 hex. This is
 * the JS twin of scripts/canonical/talent_words.py (`norm_text`, `text_hash`): the editor used to carry the only copy
 * (lib/editor/view.jsx), so the shared code every device runs could not tell a stale row from a live one. It now lives
 * here once, and the editor, packValidate's species arm and charResolve's species reader all call it. A second copy of
 * this function is a second resolution path (PRAXIS §5); test/f100_m8_editor_verbs.cjs V5 equates it to talent_words over
 * every canonical span, and test/f100_spf_preflip.cjs pins that the editor carries none of its own.
 *
 * Loaded by BOTH shells before charResolve.js and packValidate.js; the editor reads it off window.
 */
(function (root) {
  'use strict';

  // talent_words.norm_text: curly quotes to straight, em/en dash to hyphen, whitespace runs to one space, trimmed, lower.
  function normText(s) {
    s = String(s == null ? '' : s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-');
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function utf8(s) {
    var o = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) o.push(c);
      else if (c < 0x800) o.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { var cp = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); o.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63); }
      else o.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return o;
  }
  function sha1Hex(b) {
    var n = b.length, words = [], i;
    for (i = 0; i < n; i++) words[i >> 2] |= b[i] << (24 - (i % 4) * 8);
    words[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    var len = (((n + 8) >> 6) + 1) * 16; for (i = 0; i < len; i++) words[i] = words[i] | 0;
    words[len - 1] = n * 8;
    var H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0], w = [];
    for (var j = 0; j < len; j += 16) {
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4];
      for (i = 0; i < 80; i++) {
        w[i] = i < 16 ? words[j + i] : (function (x) { return x << 1 | x >>> 31; })(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]);
        var f = i < 20 ? (bb & c | ~bb & d) + 0x5a827999 : i < 40 ? (bb ^ c ^ d) + 0x6ed9eba1 : i < 60 ? (bb & c | bb & d | c & d) + 0x8f1bbcdc : (bb ^ c ^ d) + 0xca62c1d6;
        var t = ((a << 5 | a >>> 27) + f + e + w[i]) | 0;
        e = d; d = c; c = bb << 30 | bb >>> 2; bb = a; a = t;
      }
      H[0] = H[0] + a | 0; H[1] = H[1] + bb | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0; H[4] = H[4] + e | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function textHash(s) { return sha1Hex(utf8(normText(s))).slice(0, 12); }
  function isSpan(w) { return !!w && typeof w === 'object' && !Array.isArray(w); }
  // a span holds when it is in bounds and its hash recomputes over the text (talent_words.span_ok's test)
  function spanOk(text, w) {
    var d = String(text || '');
    return isSpan(w) && typeof w.start === 'number' && typeof w.end === 'number' && w.start >= 0 && w.end > w.start &&
      w.end <= d.length && textHash(d.slice(w.start, w.end)) === w.hash;
  }

  // THE SPAN GATE (ruling argo-a1-export-fields D2, as tightened; R-AAC-27 (a)). A row applies while its span holds. In
  // a copy whose siteSettings say BOOK_CONTENT 'removed' (the public copy), a text that is ABSENT or "" was removed by
  // the export, and a removed text is not an edited one: the row applies exactly as it does with the words present.
  // A text that is present but edited still fails, on both sites. STATED CONSEQUENCE: in the public copy a homebrew
  // record whose author left its text empty also applies its rows — removed and empty cannot be told apart there.
  // That is accepted, and it cannot happen on holocron.work, whose value is 'included'. The setting is read at CALL
  // time, so a page that loads siteSettings.js after this file still gets it.
  function bookContent() {
    var S = null;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { S = require('./siteSettings.js'); } catch (e) { S = null; } }
    if (!S && root && root.SWRPGSiteSettings) S = root.SWRPGSiteSettings;
    return S && S.BOOK_CONTENT === 'removed' ? 'removed' : 'included';
  }
  function spanHolds(text, w) {
    if (spanOk(text, w)) return true;
    return bookContent() === 'removed' && String(text == null ? '' : text) === '' && isSpan(w);
  }

  // REMOVED IS NOT INVALID (ruling argo-a1-export-scan R-AES-10, the D2 principle applied to validation). Under
  // BOOK_CONTENT 'removed', a schema's minLength, pattern or required on a text field is satisfied by an EMPTY or
  // ABSENT value at a path the export blanks. REMOVED_PATHS is that list, by registry section, DERIVED from the
  // export's own json-blank rows (scripts/argo_export/gen_removed_paths.py writes it; the export refuses a stale
  // block), so a new blank row is covered with no other edit. `[]` stands for any list index, `*` for any key.
  // On holocron.work ('included') it never holds, so validation is exactly as before. STATED CONSEQUENCE: in the
  // public copy a homebrew record whose author left one of those fields empty also saves.
  // path: ['<section>', '<record id>', field, ...] as packValidate carries it.
  // BEGIN GENERATED REMOVED_PATHS (scripts/argo_export/gen_removed_paths.py; do not edit by hand)
  var REMOVED_PATHS = {
    "*": [
      "pages.[].quote"
    ],
    "armor": [
      "base_mods.[].description",
      "description",
      "pool_mods.[].condition"
    ],
    "attachments": [
      "added_mods.[].description",
      "base_mods.[].description",
      "description",
      "pool_mods.[].condition"
    ],
    "doors": [
      "[].description"
    ],
    "force_powers": [
      "abilities.*.description"
    ],
    "gear": [
      "base_mods.[].description",
      "description",
      "pool_mods.[].condition"
    ],
    "npcs": [
      "abilities.[].description",
      "description",
      "equipmentDesc",
      "gear.[]"
    ],
    "signature_abilities": [
      "abilities.*.description",
      "fills.[].note"
    ],
    "species": [
      "homeworld",
      "option_choices.[].options.[].description",
      "option_choices.[].options.[].special_abilities.[].description",
      "special_abilities.[].description"
    ],
    "spend": [
      "flaws.[].effect",
      "improvements.[].effect"
    ],
    "talents": [
      "description"
    ],
    "templates": [
      "examples",
      "result_profile.abilities.[].description",
      "result_profile.base_mods.[].description"
    ],
    "vehicle_attachments": [
      "added_mods.[].description",
      "base_mods.[].description",
      "description",
      "hp_note"
    ],
    "vehicle_weapons": [
      "scale_note"
    ],
    "weapons": [
      "_cite",
      "description",
      "pool_mods.[].condition"
    ]
  };
  // END GENERATED REMOVED_PATHS
  function removedHolds(path, value) {
    if (bookContent() !== 'removed' || !(value === undefined || value === null || value === '')) return false;
    if (!Array.isArray(path) || path.length < 3) return false;
    var want = REMOVED_PATHS[path[0]];
    if (!want || !want.length) return false;
    var got = path.slice(2).map(function (k) { return typeof k === 'number' ? '[]' : String(k); });
    return want.some(function (p) {
      var w = p.split('.');
      return w.length === got.length && w.every(function (x, i) { return x === '*' || x === got[i]; });
    });
  }

  var api = { normText: normText, textHash: textHash, spanOk: spanOk, spanHolds: spanHolds, bookContent: bookContent,
    removedHolds: removedHolds, REMOVED_PATHS: REMOVED_PATHS };
  if (root) root.SWRPGTextHash = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
