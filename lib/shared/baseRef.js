/**
 * baseRef.js — window.SWRPGBaseRef: THE drift fingerprint of a canonical record and THE version of a
 * user pack (F-100 UD-1a; ruling f100-ud1-contracts R-FUD-1, R-FUD-5; brief f100-ud1-contracts §1, §5).
 *
 *   ref     = "sha256:p1:" + hex(SHA-256(UTF-8(JCS(project_p1(baseRecord)))))
 *   version = first 12 hex of SHA-256(UTF-8(JCS(pack.sections)))        (sections VERBATIM)
 *
 * ONE implementation, in JS, synchronous and pure (R-FUD-1): no Web Crypto (async; the drift state is
 * read on sync render paths), no Python twin (node's crypto is the guard's oracle; the Python
 * validator checks only a ref's FORMAT). The label `sha256:p1:` names the algorithm AND the
 * projection; a reader meeting any other label cannot verify the ref and reports base-moved
 * (unverifiable-ref) — that decision is the store's, not this module's.
 *
 * project_p1 (brief §1.3, exact):
 *   1. top-level keys beginning with `_` are EXCLUDED (provenance/ingest metadata and every
 *      pack-owned or resolved-view field: _base, _mode, _changes, _pack, _unapplied, _variant);
 *   2. NESTED `_` keys are KEPT (species option `_default` is content);
 *   3. object members whose value is null are DROPPED at every depth (null ≡ absent, H10);
 *   4. arrays keep their order and their elements (a null array ELEMENT is kept); empty arrays and
 *      empty objects are kept;
 *   5. a STAMP is EXCLUDED at every depth (ruling `f100-surfacing-preflip-species-card` R-SPF-21, amending
 *      f100-ud1-contracts R-FUD-1's projection under D-215): a member this repo's scripts write over the book's words and
 *      never author — `STAMPED`, today `carried` (R-SPF-5) — so a stamp never reads as "the book changed". One list,
 *      exported; userData's p1v applies the same one. A key joins it only by a ruling naming it.
 * jcs = RFC 8785: keys sorted by UTF-16 code units, numbers in ECMAScript Number#toString form,
 * strings escaped as JSON.stringify escapes them, no whitespace. Non-finite numbers and values JSON
 * cannot carry (undefined, functions, symbols, bigint) THROW — a fingerprint over data JSON cannot
 * hold would be a fingerprint of nothing.
 *
 * Dual-export (browser window.SWRPGBaseRef / CommonJS) in the sources.js idiom; test/base_ref.cjs
 * holds it to node's crypto over every record of the 8 applied sections.
 */
(function (root) {
  'use strict';

  var LABEL = 'sha256:p1:';
  var STAMPED = ['carried'];
  var REF_RE = /^sha256:p1:[0-9a-f]{64}$/;

  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // ── the p1 projection ────────────────────────────────────────────────────────────────────────
  function strip(v, depth) {
    if (Array.isArray(v)) {
      var a = new Array(v.length);
      for (var i = 0; i < v.length; i++) a[i] = strip(v[i], depth + 1);
      return a;
    }
    if (isPlainObject(v)) {
      var o = {};
      var keys = Object.keys(v);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (depth === 0 && k.charAt(0) === '_') continue;   // rule 1 — top level only (rule 2)
        if (v[k] === null) continue;                          // rule 3 — at every depth
        if (STAMPED.indexOf(k) !== -1) continue;              // rule 5 — a stamp, at every depth (R-SPF-21)
        o[k] = strip(v[k], depth + 1);
      }
      return o;
    }
    return v;
  }
  function project_p1(rec) {
    if (!isPlainObject(rec)) throw new TypeError('baseRef.project_p1: a record must be a plain object');
    return strip(rec, 0);
  }

  // ── RFC 8785 JCS ─────────────────────────────────────────────────────────────────────────────
  function jcs(v) {
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!isFinite(v)) throw new TypeError('baseRef.jcs: non-finite number');
      return JSON.stringify(v);                              // ES Number#toString; -0 → "0"
    }
    if (t === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) {
      var parts = new Array(v.length);
      for (var i = 0; i < v.length; i++) parts[i] = jcs(v[i]);
      return '[' + parts.join(',') + ']';
    }
    if (t === 'object') {
      var keys = Object.keys(v).sort();                      // default sort = UTF-16 code units
      var out = [];
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (v[k] === undefined) throw new TypeError('baseRef.jcs: undefined member `' + k + '`');
        out.push(JSON.stringify(k) + ':' + jcs(v[k]));
      }
      return '{' + out.join(',') + '}';
    }
    throw new TypeError('baseRef.jcs: a ' + t + ' has no JSON form');
  }

  // ── SHA-256 (FIPS 180-4), synchronous, over UTF-8 bytes ──────────────────────────────────────
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
           0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
           0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
           0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
           0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
           0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
           0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
           0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var _encoder = null;
  function utf8(str) {
    if (!_encoder) _encoder = new TextEncoder();
    return _encoder.encode(str);
  }
  function sha256bytes(bytes) {
    var n = bytes.length;
    var total = ((n + 9 + 63) >>> 6) << 6;                   // message + 0x80 + 8-byte length, padded
    var m = new Uint8Array(total);
    m.set(bytes);
    m[n] = 0x80;
    var bitsHi = Math.floor(n / 0x20000000), bitsLo = (n << 3) >>> 0;
    m[total - 8] = (bitsHi >>> 24) & 0xff; m[total - 7] = (bitsHi >>> 16) & 0xff;
    m[total - 6] = (bitsHi >>> 8) & 0xff;  m[total - 5] = bitsHi & 0xff;
    m[total - 4] = (bitsLo >>> 24) & 0xff; m[total - 3] = (bitsLo >>> 16) & 0xff;
    m[total - 2] = (bitsLo >>> 8) & 0xff;  m[total - 1] = bitsLo & 0xff;
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var W = new Int32Array(64);
    for (var o = 0; o < total; o += 64) {
      for (var t = 0; t < 16; t++) {
        var p = o + 4 * t;
        W[t] = (m[p] << 24) | (m[p + 1] << 16) | (m[p + 2] << 8) | m[p + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var T1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var T2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + T1) | 0; d = c; c = b; b = a; a = (T1 + T2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    var H = [h0, h1, h2, h3, h4, h5, h6, h7], s = '';
    for (var i = 0; i < 8; i++) s += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return s;
  }
  function sha256hex(str) {
    if (typeof str !== 'string') throw new TypeError('baseRef.sha256hex: takes a string (hashed as UTF-8)');
    return sha256bytes(utf8(str));
  }

  // ── the two products ─────────────────────────────────────────────────────────────────────────
  function baseRef(rec) { return LABEL + sha256hex(jcs(project_p1(rec))); }

  // The version of a pack is over its `sections` VERBATIM (`_` keys and nulls included: any change to
  // any record is a new version). A pack with no `sections` has no version — this throws rather than
  // choosing one (what the store does with such a pack is the store's contract, R-FUD-4/5).
  function packVersion(pack) {
    if (!pack || typeof pack !== 'object' || pack.sections === undefined) {
      throw new TypeError('baseRef.packVersion: a pack without `sections` has no version');
    }
    return sha256hex(jcs(pack.sections)).slice(0, 12);
  }

  // A ref THIS module can verify (label sha256:p1, 64 hex). Anything else that matches the envelope's
  // wider pattern is a ref from another algorithm/projection: loadable, unverifiable.
  function isVerifiableRef(ref) { return typeof ref === 'string' && REF_RE.test(ref); }

  var api = {
    LABEL: LABEL,
    STAMPED: STAMPED,
    project_p1: project_p1,
    jcs: jcs,
    sha256hex: sha256hex,
    baseRef: baseRef,
    packVersion: packVersion,
    isVerifiableRef: isVerifiableRef,
  };
  if (typeof root !== 'undefined' && root) root.SWRPGBaseRef = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
