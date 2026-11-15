/**
 * userData.js — window.SWRPGUserData: THE user-pack store (F-100 UD-1e; ruling f100-ud1-contracts
 * R-FUD-4/5/6/8/10 and ADDENDUM 1 R-FUD-A1-1; brief f100-ud1-contracts §4, §5, §6, §8).
 *
 * WHERE HOMEBREW LIVES. IndexedDB `swrpg_user_packs` v1 — three stores (R-FUD-4):
 *   packs     keyPath 'packId'            { packId, origin:'own'|'imported', pack:<envelope as stored>, addedAt, updatedAt }
 *   versions  keyPath ['packId','version'] { packId, version:<v12>, pack, importedAt }   append-only, imported packs only
 *   meta      out-of-line key 'state'     { v:1, active:{packId:bool}, order:[packId…] }
 *             out-of-line key 'removed'   { v:1, rows:{<instance>:{ver,h}} }  (v2; card f100-ms-build R-MSB-23 — a removal
 *                                         made here, not yet sent; device-only, never on the wire, in an export or a hash)
 * 'my_data' is seeded on first open. Upgrades are cumulative and never delete a user store. An older
 * build opening a NEWER store reads what it recognises and runs WRITE-HELD (versionGuard.isAhead, the
 * F-54 "never written back" rule). No IndexedDB → an in-memory adapter for the session (status says
 * so); there is NO localStorage fallback. The node guards drive the same store through that adapter.
 *
 * WHAT A CHARACTER OWNS (R-FUD-5, G5 as Jason amended it; the own grammar per f100-editor-contracts-2
 * R-EC2-1). A new character is stamped with every ACTIVE pack, in layer order: `user:<packId>#<instance>`
 * for an own pack (resolves LIVE — house rules update everywhere the pack is owned — and names ONE
 * collection: every own pack mints a random 48-bit instance once, so HOME's "My Data" is absent on
 * SECOND, never read as SECOND's) and `user:<packId>@<v12>` for an imported one (FROZEN at that
 * version). v12 = baseRef.packVersion over the pack AS RECEIVED, so two devices importing one file
 * get one stamp. A stamp whose pack is absent resolves to base, never throws, and is never re-stamped.
 *
 * R-FUD-5 AS AMENDED (f100-b854 R-B854-3; landed by B-855, ruling b855-hold R-B855-5(i)):
 *   "The missing-pack path is graceful for RESOLUTION and never re-stamps — AND it is READ-ONLY for
 *   the projections. No writer re-projects a persisted derived list (talents, derivedBonuses,
 *   derivedConditional) or prices a buy through a resolved view in which any owned reference of the
 *   sheet is unresolved; such a writer is HELD with the sheet's reason, and the record is
 *   byte-identical afterwards. Patches to persisted id-refs and trackers are not held. The rule is
 *   the same on a build without the store (an older build) and on a UD-1 build without the pack,
 *   because the loss is the same."
 *   And per f100-editor-contracts-2 R-EC2-1: a sheet carrying an own-collection stamp
 *   (user:<packId>#<instance>) whose instance this device does not hold is HELD for every projecting
 *   writer, whether or not its references resolve here. The predicate is CharResolve.sheetHold; the
 *   store side is missingFor().
 *
 * WHAT IS APPLIED. A stored pack goes through packValidate.load (the partition, R-FUD-3): the known
 * part is applied, the rest stays stored. A SHARE record (`_changes`) is REBUILT AT LOAD over the RAW
 * live base (R-FUD-10 as amended by A1): MergePatch(raw B, P), B's `_` metadata kept, `_base` = the
 * share's anchor. A share record whose base this app lacks is kept, not applied (`base-missing`).
 *
 * THE TWO EXPORTS (H7). FULL = the stored envelope, never refused (it is the user's own data). SHARE =
 * the projection (R-FUD-8 + A1; f100-editor-contracts-2 R-EC2-2/3 — a share never carries a book record's
 * numbers or text): a plain add is emitted whole; a redefine of a canonical id, and a DERIVE (a new record
 * started from a book record, `_base.id` naming it), carry only `{_mode, _base:<anchor of the LIVE base>,
 * _changes:P}` where P is DECIDED on the p1 projections (a key is changed iff its p1 values differ) and
 * EMITTED from the RAW user record (so an array replaced whole keeps its nulls). A redefine or derive whose
 * book record this app lacks, and a redefine of another pack's book-rooted record, are LEFT OUT with a
 * warning; an export that leaves out everything refuses `nothing-to-share`. Refused on anything the
 * authoring rail refuses (R-FPA-3). A SHARE of `my_data` mints a fresh packId in the FILE only and remaps
 * custom_my_data_* inside it (H8(a)); it never carries the collection's instance.
 *
 * TWO TABS, ONE STORE (B-888; ruling f100-items-live-contracts R-FILC-2/3/4, the card's C1–C3). Both apps
 * open this one database, and each tab caches what it read. So:
 *   C1 — NO WRITE IS BUILT FROM THE CACHE. Every write reads the stored packs and meta inside ONE readwrite
 *        transaction (the adapters' update(stores, fn), fn synchronous), runs its content checks against that
 *        fresh copy, applies only its own change to it, and the cache becomes what is stored. A pack the stored
 *        state no longer has is refused (`no-such-pack`), never re-created; the first-open seed and the instance
 *        heal are PUT-IF-ABSENT; a new record's id is minted inside the transaction (`mint`, C1.a).
 *   C2 — after each committed write the tab posts { kind: 'changed', v: 1 } on BroadcastChannel
 *        ('swrpg_user_packs'); a receiver treats ANY message, and the tab turning visible, as "re-read" —
 *        reload() re-reads packs, meta and versions and dispatches the same change event as a write.
 *   C3 — a save may name the record as its form OPENED it (`opened`); the stored record is compared with it
 *        (JCS) inside the transaction, and a difference refuses `changed-elsewhere` with the stored record,
 *        writing nothing. Delete does not compare (C3.a).
 *
 * Headless (H1): no element, no copy. Dual-export (window.SWRPGUserData / CommonJS), sources.js idiom.
 * Needs baseRef.js, packValidate.js, mods.js and versionGuard.js loaded first.
 */
(function (root) {
  'use strict';

  var DB_NAME = 'swrpg_user_packs';
  var DB_VERSION = 2;           // v2: `collections` keyed by ck (f100-sync-instance-index R-SII-2)
  var META_V = 2;               // v2: { v:2, home, active:{ck}, order:[ck], synced? } (R-SII-3, card ADDENDUM 1 R-MSB-9)
  var MY = 'my_data';
  var PACK_ID_RE = /^[a-z0-9_]+$/;
  var EVENT = 'swrpg-user-packs-changed';
  var RESOLVED_VIEW = ['_pack', '_unapplied', '_variant'];   // never persisted (R-FUD-6)

  // ── dependencies: window globals in the browser, require() in node ──
  function dep(globalName, file) {
    if (typeof root !== 'undefined' && root && root[globalName]) return root[globalName];
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') return require('./' + file);
    throw new Error('userData: ' + globalName + ' is not loaded (script order)');
  }
  function BR() { return dep('SWRPGBaseRef', 'baseRef.js'); }
  function PV() { return dep('SWRPGPackValidate', 'packValidate.js'); }
  function MODS() { return dep('SWRPGMods', 'mods.js'); }
  function VG() { return dep('SWRPGVersionGuard', 'versionGuard.js'); }

  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  // The record as it may be PERSISTED: a deep copy without the resolved-view markers a fold puts on a view's record
  // (RESOLVED_VIEW, never persisted — R-FUD-6). The pack save path and the store's own-copy write (B-1161, ruling
  // `b1161-homebrew-copy-hotfix` R-B1161-9) both make their copy here, so the two strips cannot drift.
  function persistableCopy(record) {
    var rec = clone(record);
    RESOLVED_VIEW.forEach(function (k) { delete rec[k]; });
    return rec;
  }
  function nowIso() { return new Date().toISOString(); }
  // An own collection's identity (ruling f100-editor-contracts-2 R-EC2-1): 48 bits from the platform's
  // cryptographic RNG, 12 lowercase hex, minted ONCE. Never from content, name or clock — two fresh empty
  // "My Data" collections must never share one. No RNG → throw: a guessable identity is worse than none.
  function mintInstance() {
    var bytes;
    if (typeof root !== 'undefined' && root && root.crypto && typeof root.crypto.getRandomValues === 'function') {
      bytes = root.crypto.getRandomValues(new Uint8Array(6));
    } else if (typeof require === 'function') {
      bytes = require('crypto').randomBytes(6);
    } else throw new Error('userData: no cryptographic RNG to mint a collection instance');
    var hex = '';
    for (var i = 0; i < 6; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return hex;
  }
  var INSTANCE_RE = /^[0-9a-f]{12}$/;
  function vkey(packId, version) { return packId + '\u0000' + version; }

  // ── identity at v2 (f100-sync-instance-index R-SII-1) ──
  // A collection on a device is its COLLECTION KEY: `own:<instance>` for an own row, `imp:<packId>` for an imported one.
  // Among own rows a packId is a label that may repeat (another device's "My Data" beside this one's); an imported row
  // stays one per packId. The stamp grammar does not change (user:<packId>#<instance> / user:<packId>@<v12>).
  var CK_RE = /^(own:[0-9a-f]{12}|imp:[a-z0-9_]+)$/;
  function ckOf(row) {
    if (!isObj(row)) return null;
    if (row.origin === 'imported') return typeof row.packId === 'string' ? 'imp:' + row.packId : null;
    return isObj(row.pack) && INSTANCE_RE.test(row.pack.instance || '') ? 'own:' + row.pack.instance : null;
  }
  // upgradeV1(rows, meta, mint) — the v1 → v2 copy, ONE function for both adapters (R-SII-2/-3): every `packs` row becomes
  // a `collections` row with its ck; an own row with no valid instance is healed exactly as `seed` heals (minted once);
  // meta maps each packId to its row's ck, and `home` is the own My Data. Pure but for `mint`; the v1 rows are not changed.
  function upgradeV1(rows, meta, mint) {
    var out = [], byPack = {}, home = null;
    (rows || []).forEach(function (r0) {
      if (!isObj(r0) || typeof r0.packId !== 'string') return;
      var r = clone(r0);
      if (r.origin !== 'imported' && isObj(r.pack) && !INSTANCE_RE.test(r.pack.instance || '')) r.pack.instance = mint();
      var ck = ckOf(r);
      if (!ck) return;          // a v1 row with no pack object has nothing to copy; it stays in `packs`, untouched
      r.ck = ck;
      out.push(r);
      if (!byPack[r.packId]) byPack[r.packId] = ck;
      if (r.origin !== 'imported' && r.packId === 'my_data' && !home) home = ck;
    });
    var m2 = null;
    if (isObj(meta)) {
      m2 = { v: META_V, home: home, active: {}, order: [] };
      Object.keys(isObj(meta.active) ? meta.active : {}).forEach(function (id) { if (byPack[id]) m2.active[byPack[id]] = meta.active[id] === true; });
      (Array.isArray(meta.order) ? meta.order : []).forEach(function (id) { if (byPack[id] && m2.order.indexOf(byPack[id]) === -1) m2.order.push(byPack[id]); });
    }
    return { rows: out, meta: m2 };
  }
  // The strings a page's characters carry that name a user collection (R-HSC-13's "used here", R-SII-7's "referenced"):
  // every string starting `user:` anywhere in the roster AND the creation draft (census C4: the draft counts too).
  // get(key) → the raw stored string. One walk, shared by the store and the sync lane.
  function usedStamps(get) {
    var out = [], seen = {};
    function walk(v) {
      if (typeof v === 'string') { if (v.indexOf('user:') === 0 && !seen[v]) { seen[v] = 1; out.push(v); } return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (isObj(v)) Object.keys(v).forEach(function (k) { walk(v[k]); });
    }
    ['swrpg_saved_characters', 'swrpg_creation_draft'].forEach(function (k) {
      var raw = null; try { raw = get(k); } catch (e) { raw = null; }
      if (raw == null) return;
      try { walk(JSON.parse(raw)); } catch (e) { /* unreadable: names nothing */ }
    });
    return out;
  }

  // ── the share projection (R-FUD-8 as amended by A1) ──────────────────────────────────────────
  // p1 of a VALUE below the top level: null object members dropped at every depth, arrays kept whole.
  // R-SPF-21, R-A5C-9: a STAMP (baseRef's one STAMPED list, `carried` and `_source_key`) is not book content, at any depth — so `_base.fields` is unmoved by it
  function p1v(v) {
    if (Array.isArray(v)) return v.map(p1v);
    if (isObj(v)) { var st = BR().STAMPED || [], o = {}; Object.keys(v).forEach(function (k) { if (v[k] !== null && st.indexOf(k) === -1) o[k] = p1v(v[k]); }); return o; }
    return v;
  }
  function p1Equal(a, b) { var J = BR().jcs; return J(p1v(a)) === J(p1v(b)); }
  // ELEMENT REFERENCES (ruling f100-items-editor-contracts R-FIEC-2, C-2.4 shape (a); amends R-FUD-8's
  // arrays-replace-whole on the SHARE path only; extended by f100-items-share-residual R-FISR-1/2). A changed
  // array of OBJECTS ships element by element:
  //   · an element p1-equal to a book element → {"$base": i}: its own index when that one matches, else the
  //     first book index that does (a deleted line must not ship the sentences after it);
  //   · any other element → {"$base": j, "$patch": P}, P = diffShare(book[j], element), j the book element
  //     giving the SMALLEST patch (JCS length; ties → lowest j) — so a +1 on a dice line ships `count`, never
  //     its book condition, and a line shifted by a deleted one is patched against its own book line;
  //   · whole, raw, when no patch is smaller than whole (a new line: the user's own — on a tie, whole, so a
  //     new line never depends on an unrelated book element being there).
  // Any j rebuilds exactly (book[j] merged with diff(book[j], u) is u); the choice decides only what text
  // travels. An array of plain values ships whole. So a share never carries a book sentence the user did not write.
  function isBaseRef(v) {
    if (!isObj(v) || typeof v.$base !== 'number' || v.$base < 0 || Math.floor(v.$base) !== v.$base) return false;
    return Object.keys(v).every(function (k) { return k === '$base' || (k === '$patch' && isObj(v.$patch)); });
  }
  function shareArray(Barr, Uarr) {
    if (!Array.isArray(Barr) || !Uarr.some(isObj)) return clone(Uarr);
    var J = BR().jcs;
    return Uarr.map(function (el, i) {
      if (!isObj(el)) return clone(el);
      if (i < Barr.length && isObj(Barr[i]) && p1Equal(Barr[i], el)) return { $base: i };
      for (var j = 0; j < Barr.length; j++) if (isObj(Barr[j]) && p1Equal(Barr[j], el)) return { $base: j };
      var best = null, bestSize = Infinity;
      for (j = 0; j < Barr.length; j++) {
        if (!isObj(Barr[j])) continue;
        var P = diffShare(Barr[j], el, 1), size = J(P).length;
        if (size < bestSize) { best = { $base: j, $patch: P }; bestSize = size; }
      }
      // a tie ships whole: a patch that replaces every key is the user's new line, not an edit of a book one
      return (best && bestSize < J(el).length) ? best : clone(el);
    });
  }
  // resolveBaseRefs(B, P) → P with every {"$base": i} swapped for B's element i at the same path, raw. An
  // element B does not have THROWS (base-element-missing): the record is kept, not applied — never half-built.
  function resolveBaseRefs(B, P, at) {
    at = at || '';
    if (Array.isArray(P)) {
      return P.map(function (el, i) {
        if (!isBaseRef(el)) return clone(el);
        if (!Array.isArray(B) || el.$base >= B.length) throw new Error('base-element-missing — ' + (at || 'the record') + ' element ' + el.$base + ' is not in this app\'s book record');
        var be = B[el.$base];
        return el.$patch ? mergePatch(be, resolveBaseRefs(be, el.$patch, (at || '') + '[' + el.$base + ']')) : clone(be);
      });
    }
    if (!isObj(P)) return clone(P);
    var out = {};
    Object.keys(P).forEach(function (k) { out[k] = resolveBaseRefs(isObj(B) ? B[k] : undefined, P[k], at ? at + '.' + k : k); });
    return out;
  }
  // diffShare(B, U) → P. DECIDED on p1 (a key changed iff its p1 values differ; null ≡ absent), EMITTED
  // from the RAW U (a changed value is U's own, nulls inside it included). Top-level `_` keys are never
  // diffed. Objects recurse and emit only a non-empty result; a changed array ships by element (above);
  // anything else is replaced WHOLE.
  function diffShare(B, U, depth) {
    depth = depth || 0;
    var P = {}, keys = [], seen = {};
    [B, U].forEach(function (o) { Object.keys(o).forEach(function (k) { if (!seen[k]) { seen[k] = 1; keys.push(k); } }); });
    keys.forEach(function (k) {
      if (depth === 0 && k.charAt(0) === '_') return;
      var hb = hasOwn(B, k) && B[k] !== null, hu = hasOwn(U, k) && U[k] !== null;
      if (!hb && !hu) return;
      if (hb && !hu) { P[k] = null; return; }                                  // removed
      if (!hb && hu) { P[k] = clone(U[k]); return; }                           // added
      if (isObj(B[k]) && isObj(U[k])) { var sub = diffShare(B[k], U[k], depth + 1); if (Object.keys(sub).length) P[k] = sub; return; }
      if (p1Equal(B[k], U[k])) return;                                         // unchanged — never emitted
      P[k] = Array.isArray(U[k]) ? shareArray(B[k], U[k]) : clone(U[k]);   // changed — by element / whole, raw
    });
    return P;
  }
  // RFC 7386 MergePatch. A null member removes; an object recurses (onto {} when the target has none,
  // which is where a null written as a NEW member is lost — the residual A1 row 3 measures); anything
  // else (arrays included) replaces whole. Never mutates `target`.
  function mergePatch(target, patch) {
    if (!isObj(patch)) return clone(patch);
    var out = isObj(target) ? clone(target) : {};
    Object.keys(patch).forEach(function (k) {
      if (patch[k] === null) delete out[k];
      else out[k] = mergePatch(out[k], patch[k]);
    });
    return out;
  }
  // The receiver's rebuild (R-FUD-10 + A1): over the RAW live base, its `_` metadata kept (P never
  // carries a top-level `_` key), the share's own `_mode` (`derive` or `redefine`, R-EC2-2) and the SHARE's
  // anchor as `_base`. null = the base is not in this app (base-missing). A `_changes` that is not an
  // object THROWS (kept, named, by the rail); so does an element reference this base lacks (R-FIEC-2 (2)).
  function rebuildShare(baseRec, rec) {
    if (!isObj(baseRec)) return null;
    if (!isObj(rec._changes)) throw new Error('_changes is not an object');
    var out = mergePatch(baseRec, resolveBaseRefs(baseRec, rec._changes));
    if (rec._mode === 'derive') stripBookKeys(out);                 // R-EC2-A1-1: a redefine keeps them (it IS the book record)
    out._mode = rec._mode === 'derive' ? 'derive' : 'redefine';
    if (isObj(rec._base)) out._base = clone(rec._base); else delete out._base;
    return out;
  }
  // A DERIVE is a new record: it keeps no top-level `_` key of its book record (`_source_key`, `_provenance`,
  // `_dataset` … — the book's bookkeeping, which would make an OggDude-key join land on the user's record),
  // only the pack-owned `_mode` and `_base` (ruling f100-editor-contracts-2 ADDENDUM 1 ANSWER, R-EC2-A1-1).
  // Provenance comes from markUser at render, as for every user record. Mutates `rec`.
  function stripBookKeys(rec) {
    Object.keys(rec).forEach(function (k) { if (k.charAt(0) === '_' && k !== '_mode' && k !== '_base') delete rec[k]; });
    return rec;
  }
  // The id of the BOOK record a record is anchored to: a derive names it (`_base.id`); a redefine IS it.
  function baseIdOf(rec, id) {
    return (isObj(rec) && rec._mode === 'derive' && isObj(rec._base) && typeof rec._base.id === 'string') ? rec._base.id : id;
  }

  // ── what a book-anchored record OWNS, and the per-field split (ruling f100-items-editor-contracts R-FIEC-3,
  // R-FIEC-4). A record anchored to a book record owns every non-`_` key except `sources`: its sources are the
  // LIVE book's, supplied when the store hands it to a view (and by the receiver's own book on a share), so a
  // key rename in the data (693660af moved 500 gear records' sources) never strands a copy.
  function ownedKeys(rec) {
    return isObj(rec) ? Object.keys(rec).filter(function (k) { return k.charAt(0) !== '_' && k !== 'sources' && rec[k] !== null && rec[k] !== undefined; }) : [];
  }
  function withoutSources(rec) { var o = {}; Object.keys(rec).forEach(function (k) { if (k !== 'sources') o[k] = rec[k]; }); return o; }
  // fieldHashes(book) → { <owned key>: 12-hex SHA-256 of JCS(p1v(value)) }. Hashes only, no book text.
  function hashOf(v) { return BR().sha256hex(BR().jcs(p1v(v))).slice(0, 12); }
  function fieldHashes(book) {
    var o = {};
    ownedKeys(book).forEach(function (k) { o[k] = hashOf(book[k]); });
    return o;
  }
  // splitAgainst(fields, book, rec) → { book:[k], yours:[k], conflict:[k] }: the book changed k when its current
  // hash differs from the anchor's (a key it added or removed included); you changed k when your value's does;
  // both → a conflict (N-7). Keys in record order of the union, sorted for a stable read.
  function splitAgainst(fields, book, rec) {
    var keys = {}, out = { book: [], yours: [], conflict: [] };
    Object.keys(fields).concat(ownedKeys(book), ownedKeys(rec)).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).sort().forEach(function (k) {
      var was = hasOwn(fields, k) ? fields[k] : undefined;
      var b = (isObj(book) && book[k] !== null && book[k] !== undefined) ? hashOf(book[k]) : undefined;
      var u = (isObj(rec) && rec[k] !== null && rec[k] !== undefined) ? hashOf(rec[k]) : undefined;
      var bc = b !== was, uc = u !== was;
      if (bc && uc) out.conflict.push(k); else if (bc) out.book.push(k); else if (uc) out.yours.push(k);
    });
    return out;
  }
  // askedFields(section, sp, rec, book) → { asked:[k], follow:{k: <text key>} } (B-1748, ADDENDUM 546 D): what the plate asks of a split. A field that differs
  // from the book's only by its spans is the text's measure, not a question: it follows the answer on that text, so old words never get a new span.
  // ONLY while that text is itself on the plate, or a span-only move would leave a lit mark with nothing to answer (B-1722's dead control).
  // SPAN_TEXT names the sections whose top-level rows measure a top-level text; a species ability or a power's upgrade holds its spans and its text in one field.
  var SPAN_TEXT = { talents: 'description' };
  function isSpan(v) { return isObj(v) && typeof v.start === 'number' && typeof v.end === 'number' && typeof v.hash === 'string'; }
  function withoutSpans(v) {
    if (Array.isArray(v)) return v.map(withoutSpans);
    if (isSpan(v)) return 'span';
    if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = withoutSpans(v[k]); }); return o; }
    return v;
  }
  function askedFields(section, sp, rec, book) {
    var moved = sp.book.concat(sp.conflict).filter(function (k) { return k !== 'id'; }), text = SPAN_TEXT[section], follow = {};
    var on = !!text && moved.indexOf(text) !== -1;
    var asked = moved.filter(function (k) {
      if (!on || k === text || !isObj(rec) || !isObj(book) || rec[k] == null || book[k] == null) return true;
      if (hashOf(withoutSpans(rec[k])) !== hashOf(withoutSpans(book[k]))) return true;
      follow[k] = text;
      return false;
    });
    return { asked: asked, follow: follow };
  }

  // ── adapters ─────────────────────────────────────────────────────────────────────────────────
  // Both expose: open() → Promise<{persistent, writable, reason}>, getAll(store), get(store, key),
  // keys(store), tx(ops[{store, op:'put'|'delete', value?, key?}]) — one atomic transaction — and
  // update(stores, fn) — ONE readwrite transaction that READS what is stored and writes from it (C1):
  //   snap = { collections: {ck → stored row}, meta: the stored 'state' (undefined when none), removed: the stored 'removed'
  //   (R-MSB-23; undefined when none), versionKeys: {vkey → true} }
  //   (each only for a store named in `stores`); fn(snap) runs SYNCHRONOUSLY — an IndexedDB transaction commits
  //   across any await that is not its own request — and returns { ops, value }. The ops are written in the same
  //   transaction; the promise resolves `value` once it commits. fn owns snap (a private copy); a throw aborts.
  function snapOps(stores, ops) {
    (ops || []).forEach(function (o) { if (stores.indexOf(o.store) === -1) throw new Error('userData: update wrote ' + o.store + ' outside its transaction (' + stores.join(', ') + ')'); });
  }
  function memoryAdapter(opts) {
    opts = opts || {};
    // `packs` is the v1 store, KEPT (never written by this build: R-SII-2); a guard may seed it to stand for a v1 database,
    // and open() then performs the same copy the IndexedDB upgrade performs, once.
    var data = { packs: {}, versions: {}, meta: {}, collections: {} };
    var dbVersion = typeof opts.dbVersion === 'number' ? opts.dbVersion : DB_VERSION;
    function keyOf(store, value, key) {
      if (store === 'packs') return value.packId;
      if (store === 'collections') return value.ck;
      if (store === 'versions') return vkey(value.packId, value.version);
      return key;
    }
    function kstr(store, key) { return (store === 'versions' && Array.isArray(key)) ? vkey(key[0], key[1]) : key; }
    return {
      kind: 'memory',
      open: function () {
        var ahead = VG().isAhead(dbVersion, DB_VERSION);
        if (!ahead && !Object.keys(data.collections).length && Object.keys(data.packs).length) {
          var up = upgradeV1(Object.keys(data.packs).map(function (k) { return data.packs[k]; }), data.meta.state, opts.mintInstance || mintInstance);
          up.rows.forEach(function (r) { data.collections[r.ck] = clone(r); });
          if (up.meta) data.meta.state = up.meta;
        }
        return Promise.resolve({ persistent: false, writable: !ahead, reason: ahead ? 'newer-store' : (opts.reason || 'memory') });
      },
      getAll: function (store) { return Promise.resolve(Object.keys(data[store]).map(function (k) { return clone(data[store][k]); })); },
      get: function (store, key) { var v = data[store][kstr(store, key)]; return Promise.resolve(v === undefined ? undefined : clone(v)); },
      keys: function (store) {
        return Promise.resolve(Object.keys(data[store]).map(function (k) { return store === 'versions' ? k.split('\u0000') : k; }));
      },
      tx: function (ops) {
        apply(ops);
        return Promise.resolve();
      },
      // C1: the read, fn and the writes happen in one synchronous turn — nothing else can interleave
      update: function (stores, fn) {
        try {
          var snap = {};
          if (stores.indexOf('collections') !== -1) { snap.collections = {}; Object.keys(data.collections).forEach(function (k) { snap.collections[k] = clone(data.collections[k]); }); }
          if (stores.indexOf('meta') !== -1) { snap.meta = clone(data.meta.state); snap.removed = clone(data.meta.removed); }
          if (stores.indexOf('versions') !== -1) { snap.versionKeys = {}; Object.keys(data.versions).forEach(function (k) { snap.versionKeys[k] = true; }); }
          var r = fn(snap) || {};
          snapOps(stores, r.ops);
          apply(r.ops);
          return Promise.resolve(r.value);
        } catch (e) { return Promise.reject(e); }
      },
      _data: data,          // guards only: the adapter's own copy, to read "what was written"
    };
    function apply(ops) {
      (ops || []).forEach(function (o) {
        if (o.op === 'delete') delete data[o.store][kstr(o.store, o.key)];
        else data[o.store][keyOf(o.store, o.value, o.key)] = clone(o.value);
      });
    }
  }

  function idbAdapter(idb) {
    var db = null, status = null, legacy = null;
    function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
    function wire(d) {
      d.onversionchange = function () { try { d.close(); } catch (e) { /* closing */ } if (status) { status.writable = false; status.reason = 'stale-tab'; } };
      return d;
    }
    function openAt(version) {
      return new Promise(function (resolve, reject) {
        var r;
        try { r = version ? idb.open(DB_NAME, version) : idb.open(DB_NAME); } catch (e) { reject(e); return; }
        r.onupgradeneeded = function (e) {
          var d = r.result;
          // CUMULATIVE arms (R-FUD-4): each runs once, in order, and never deletes a store holding user data.
          if (e.oldVersion < 1) {
            if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'packId' });
            if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: ['packId', 'version'] });
            if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
          }
          // v2 (R-SII-2): `collections` keyed by ck, and every `packs` row COPIED into it inside this one versionchange
          // transaction — chained in request callbacks, so it never goes inactive. `packs` is kept and never written again.
          // Any failure aborts the transaction: the open fails, the database stays at v1 with its data intact (open()
          // below then reads it read-only), and nothing half-copied is left behind.
          if (e.oldVersion < 2) {
            var cs = d.objectStoreNames.contains('collections') ? r.transaction.objectStore('collections') : d.createObjectStore('collections', { keyPath: 'ck' });
            if (e.oldVersion >= 1) {
              var t = r.transaction;
              var pr = t.objectStore('packs').getAll();
              pr.onsuccess = function () {
                var mr = t.objectStore('meta').get('state');
                mr.onsuccess = function () {
                  try {
                    var up = upgradeV1(pr.result || [], mr.result, mintInstance);
                    up.rows.forEach(function (row) { cs.put(row); });
                    if (up.meta) t.objectStore('meta').put(up.meta, 'state');
                  } catch (x) { try { t.abort(); } catch (y) { /* already aborting */ } }
                };
              };
            }
          }
        };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); reject(r.error); };
        r.onblocked = function () { /* another tab holds an older version open; it closes on versionchange */ };
      });
    }
    function has(store) { return db && db.objectStoreNames.contains(store); }
    // A v1 database this build could not upgrade (a failed copy, read-only): its `packs` and meta seen through the same
    // upgradeV1 copy, in memory, once. Nothing is written; an un-instanced own row is healed for this read only.
    function legacyView() {
      if (legacy) return legacy;
      legacy = Promise.all([req(db.transaction('packs', 'readonly').objectStore('packs').getAll()),
        has('meta') ? req(db.transaction('meta', 'readonly').objectStore('meta').get('state')) : Promise.resolve(undefined)])
        .then(function (r) { return upgradeV1(r[0] || [], r[1], mintInstance); });
      return legacy;
    }
    return {
      kind: 'indexeddb',
      open: function () {
        return openAt(DB_VERSION).then(function (d) {
          db = wire(d);
          status = { persistent: true, writable: true, reason: 'indexeddb' };
          return status;
        }, function (err) {
          if (err && err.name === 'AbortError') {
            // the v1 → v2 copy failed and was rolled back (R-SII-2): the database is still v1, intact. Read it — through
            // the same copy, in memory only — and write nothing; the hold says why.
            return openAt(null).then(function (d) {
              db = wire(d);
              legacy = null;
              status = { persistent: true, writable: false, reason: 'upgrade-failed', dbVersion: d.version };
              return status;
            });
          }
          if (!err || err.name !== 'VersionError') throw err;
          // a NEWER app wrote this database: read what we recognise, never write (F-54).
          return openAt(null).then(function (d) {
            db = wire(d);
            status = { persistent: true, writable: false, reason: 'newer-store', dbVersion: d.version };
            return status;
          });
        });
      },
      getAll: function (store) {
        if (store === 'collections' && !has('collections') && has('packs')) return legacyView().then(function (v) { return v.rows; });
        if (!has(store)) return Promise.resolve([]);
        return req(db.transaction(store, 'readonly').objectStore(store).getAll());
      },
      get: function (store, key) {
        if (store === 'meta' && key === 'state' && !has('collections') && has('packs')) return legacyView().then(function (v) { return v.meta || undefined; });
        if (!has(store)) return Promise.resolve(undefined);
        return req(db.transaction(store, 'readonly').objectStore(store).get(key));
      },
      keys: function (store) {
        if (!has(store)) return Promise.resolve([]);
        return req(db.transaction(store, 'readonly').objectStore(store).getAllKeys());
      },
      tx: function (ops) {
        var names = [];
        (ops || []).forEach(function (o) { if (names.indexOf(o.store) === -1) names.push(o.store); });
        if (!names.length) return Promise.resolve();
        return new Promise(function (resolve, reject) {
          var t = db.transaction(names, 'readwrite');
          ops.forEach(function (o) {
            var s = t.objectStore(o.store);
            if (o.op === 'delete') s.delete(o.key);
            else if (o.store === 'meta') s.put(o.value, o.key);
            else s.put(o.value);
          });
          t.oncomplete = function () { resolve(); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error || new Error('transaction aborted')); };
        });
      },
      // C1: the reads are this transaction's own requests, and fn runs inside the last one's success callback,
      // so the transaction is still active when the writes are issued — no promise hop between read and write.
      update: function (stores, fn) {
        return new Promise(function (resolve, reject) {
          var names = stores.filter(has);
          var t = db.transaction(names, 'readwrite'), snap = {}, pending = 0, value, failed = null;
          function step() {
            if (--pending > 0) return;
            try {
              var r = fn(snap) || {};
              snapOps(names, r.ops);
              value = r.value;
              (r.ops || []).forEach(function (o) {
                var s = t.objectStore(o.store);
                if (o.op === 'delete') s.delete(o.key);
                else if (o.store === 'meta') s.put(o.value, o.key);
                else s.put(o.value);
              });
            } catch (e) { failed = e; try { t.abort(); } catch (x) { /* already finishing */ } }
          }
          function read(store, r, into) { pending++; r.onsuccess = function () { into(r.result); step(); }; }
          if (names.indexOf('collections') !== -1) read('collections', t.objectStore('collections').getAll(), function (v) { snap.collections = {}; (v || []).forEach(function (p) { if (p && typeof p.ck === 'string') snap.collections[p.ck] = p; }); });
          if (names.indexOf('meta') !== -1) read('meta', t.objectStore('meta').get('state'), function (v) { snap.meta = v; });
          if (names.indexOf('meta') !== -1) read('meta', t.objectStore('meta').get('removed'), function (v) { snap.removed = v; });
          if (names.indexOf('versions') !== -1) read('versions', t.objectStore('versions').getAllKeys(), function (v) {
            snap.versionKeys = {}; (v || []).forEach(function (k) { if (Array.isArray(k)) snap.versionKeys[vkey(k[0], k[1])] = true; });
          });
          if (!pending) { pending = 1; step(); }
          t.oncomplete = function () { resolve(value); };
          t.onerror = function () { reject(failed || t.error); };
          t.onabort = function () { reject(failed || t.error || new Error('transaction aborted')); };
        });
      },
    };
  }

  // The browser's choice: IndexedDB when it opens; otherwise memory, with the reason on status().
  function autoAdapter(idb) {
    var real = null, mem = null;
    function pick() {
      if (real || mem) return Promise.resolve();
      if (!idb) { mem = memoryAdapter({ reason: 'no-indexeddb' }); return Promise.resolve(); }
      var a = idbAdapter(idb);
      return a.open().then(function (st) { real = a; real._status = st; }, function (e) {
        mem = memoryAdapter({ reason: 'indexeddb-unavailable: ' + ((e && (e.name || e.message)) || 'error') });
      });
    }
    function cur() { return real || mem; }
    return {
      kind: 'auto',
      open: function () { return pick().then(function () { return real ? real._status : mem.open(); }); },
      getAll: function (s) { return cur().getAll(s); },
      get: function (s, k) { return cur().get(s, k); },
      keys: function (s) { return cur().keys(s); },
      tx: function (ops) { return cur().tx(ops); },
      update: function (s, fn) { return cur().update(s, fn); },
    };
  }

  // ── THE STORE ────────────────────────────────────────────────────────────────────────────────
  // opts: { adapter, now(), build?, schemas? | loadSchemas(), vocab? | loadVocab(), base? (pack-section
  //         names → id maps), broadcast?(event) }
  function createStore(opts) {
    opts = opts || {};
    var adapter = opts.adapter || memoryAdapter();
    var now = opts.now || nowIso;
    var st = { persistent: false, writable: false, reason: 'not-open' };
    var packs = {};                 // ck → { ck, packId, origin, pack, addedAt, updatedAt, synced?, local? }  (R-SII-1; R-MSB-9; R-HSC-13)
    var meta = { v: META_V, home: null, active: {}, order: [] };   // active/order keyed by ck; home = this device's own My Data
    var removed = { v: 1, rows: {} };   // R-MSB-23: instance → the synced base {ver, h} of an own row removed here, not yet sent
    var versionKeys = {};           // vkey → true (every version the store holds)
    var versionPacks = {};          // vkey → raw pack (loaded on demand)
    var applied = {};               // stamp → applied pack | null
    var base = {};                  // pack-section name → pristine id map
    var vocab = opts.vocab || null;
    var rail = null, railError = null, railPromise = null;
    var readyPromise = null;
    var priorAnchors = {};          // "packId\0section\0id" → the anchor a reconcile replaced (Undo, R-EC2-4); never persisted
    var epoch = 0;                  // bumped each time the cache adopts a stored state (C1/C2): a re-read that began before it is dropped
    var mint = opts.mintInstance || mintInstance;
    if (opts.base) provideBase(opts.base);
    // C2: ANY message on the channel means "another tab wrote — re-read"; its content is never read, so any two builds talk
    if (opts.channel && typeof opts.channel.addEventListener === 'function') opts.channel.addEventListener('message', function () { reload(); });

    function emit() {
      applied = {};
      if (opts.broadcast) { try { opts.broadcast(EVENT); } catch (e) { /* non-DOM host */ } }
    }
    // C2: after a COMMITTED write only (a channel never delivers to its own sender, so this tab does not re-read itself)
    function post() { if (opts.channel) { try { opts.channel.postMessage({ kind: 'changed', v: 1 }); } catch (e) { /* a closed channel */ } } }
    function packVersionOf(pack) { try { return BR().packVersion(pack); } catch (e) { return null; } }
    function hasRecords(pack) {
      if (!isObj(pack) || !isObj(pack.sections)) return false;
      return Object.keys(pack.sections).some(function (s) { return isObj(pack.sections[s]) && Object.keys(pack.sections[s]).length > 0; });
    }
    // R-FUG-2: a stored VERSION counts too — a removed pack's frozen version must resolve on the sync path.
    function needsRail() {
      return !rail && (Object.keys(packs).some(function (id) { return hasRecords(packs[id].pack); })
        || Object.keys(versionPacks).some(function (k) { return hasRecords(versionPacks[k]); }));
    }

    // ── C1: what is stored, as one transaction reads it ──
    // freshOf(snap) → { packs (ck → row), meta (this build's shape), stored (a meta row exists), ahead (a newer build wrote
    // it), versionKeys (when read) } — private copies: a write changes them on its way to success, and the cache adopts them.
    function normMeta(m) {
      var o = { v: META_V, home: isObj(m) && typeof m.home === 'string' ? m.home : null,
                active: isObj(m) && isObj(m.active) ? clone(m.active) : {}, order: isObj(m) && Array.isArray(m.order) ? m.order.slice() : [] };
      if (isObj(m) && isObj(m.synced)) o.synced = { ver: m.synced.ver, h: m.synced.h };
      return o;
    }
    // R-MSB-23: the stored 'removed' mark, normalised — only well-formed {ver:number, h:string} rows by instance
    function normRemoved(m) {
      var o = { v: 1, rows: {} };
      if (isObj(m) && isObj(m.rows)) Object.keys(m.rows).forEach(function (i) {
        var r = m.rows[i];
        if (INSTANCE_RE.test(i) && isObj(r) && typeof r.ver === 'number' && typeof r.h === 'string') o.rows[i] = { ver: r.ver, h: r.h };
      });
      return o;
    }
    function rowsOf(list) { var P = {}; (list || []).forEach(function (p) { if (p && typeof p.ck === 'string') P[p.ck] = p; }); return P; }
    function freshOf(snap) {
      var m = snap.meta;
      return { packs: rowsOf(Object.keys(snap.collections || {}).map(function (k) { return snap.collections[k]; })), stored: isObj(m),
               ahead: isObj(m) && VG().isAhead(m.v, META_V), versionKeys: snap.versionKeys || null, meta: normMeta(m),
               removed: normRemoved(snap.removed) };
    }
    function cacheKey() { return JSON.stringify([packs, meta]); }
    // adopt(F) — the cache becomes what is stored. → whether anything this tab shows moved.
    function adopt(F) {
      var was = cacheKey();
      packs = F.packs; meta = F.meta;
      if (F.removed) removed = F.removed;            // device bookkeeping: adopted, but nothing a view shows moves with it
      if (F.versionKeys) Object.keys(F.versionKeys).forEach(function (k) { versionKeys[k] = true; });
      epoch++;
      return cacheKey() !== was;
    }
    function no(reason, extra) { var r = { ok: false, reasons: [].concat(reason) }; Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; }); return r; }
    // commit(stores, change) — EVERY write goes through here (C1). change(F) runs SYNCHRONOUSLY on the stored
    // state F and returns a refusal (no(…)) or { ops, value, after? }; it changes F only on its way to success, so a
    // refused F is exactly what is stored. Either way the cache adopts F — a tab refused for being stale is stale no
    // longer, and its views re-read. A committed write then runs `after` (session-only state), emits and posts.
    // `collections` and `meta` are ALWAYS read (the cache adopts both); `versions` when a write names it.
    function commit(stores, change) {
      if (!st.writable) return refuse(heldReason());
      var F = null, res = null;
      var names = ['collections', 'meta'].concat(stores.indexOf('versions') !== -1 ? ['versions'] : []);
      return adapter.update(names, function (snap) {
        F = freshOf(snap);
        if (F.ahead) { res = no('write-held — newer-store (a newer version of the app saved this store; nothing is written back)'); return { ops: [] }; }
        res = change(F);
        return { ops: res && res.ok !== false && res.ops ? clone(res.ops) : [] };
      }).then(function () {
        if (F.ahead) { st.writable = false; st.reason = 'newer-store'; }
        var moved = adopt(F), wrote = !!(res && res.ok !== false && res.ops);
        if (wrote && res.after) res.after();
        return Promise.resolve((wrote || moved) && needsRail() ? ensureRail() : null).then(function () {
          if (wrote || moved) emit();
          if (wrote) post();
          return wrote ? res.value : res;
        });
      });
    }
    // ckFor(P, M, x) — the collection a verb names (R-SII-11: every verb takes a ck). A LEGACY packId is still read, so
    // a caller written before v2 keeps working: `my_data` → HOME; an own packId → its first own row in the user's order
    // (then any); otherwise the imported row `imp:<packId>`.
    function ckFor(P, M, x) {
      if (typeof x !== 'string') return null;
      if (CK_RE.test(x)) return x;
      if (x === MY && M.home && P[M.home]) return M.home;
      var own = Object.keys(P).filter(function (k) { return P[k].origin === 'own' && P[k].packId === x; });
      if (own.length) {
        own.sort(function (a, b) { var ia = M.order.indexOf(a), ib = M.order.indexOf(b); return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib); });
        return own[0];
      }
      return 'imp:' + x;
    }
    function ckHere(x) { return ckFor(packs, meta, x); }
    function homeOk(S) { var h = S.meta.home && S.packs[S.meta.home]; return !!h && h.origin === 'own' && h.packId === MY; }

    // ── open, seed, read ──
    function ready() {
      if (readyPromise) return readyPromise;
      readyPromise = adapter.open().then(function (status) {
        st = status;          // the adapter's own object: a later versionchange (another tab upgrading) holds writes here too
        // every stored version comes back at open, so a FROZEN stamp resolves on the SYNC render path
        // (applyStampSync) from the first paint — no per-sheet warm-up (versions are small, append-only).
        return Promise.all([adapter.getAll('collections'), adapter.get('meta', 'state'), adapter.getAll('versions'), adapter.get('meta', 'removed')]);
      }).then(function (r) {
        packs = rowsOf(r[0]);
        removed = normRemoved(r[3]);
        if (isObj(r[1])) {
          if (VG().isAhead(r[1].v, META_V)) { st.writable = false; st.reason = 'newer-store'; }
          meta = normMeta(r[1]);
        }
        (r[2] || []).forEach(function (v) {
          if (v && typeof v.packId === 'string' && typeof v.version === 'string') { var k = vkey(v.packId, v.version); versionKeys[k] = true; versionPacks[k] = v.pack || null; }
        });
        var S0 = { packs: packs, meta: meta };
        var need = !homeOk(S0) || !isObj(r[1]) || !hasOwn(meta.active, meta.home) || meta.order.indexOf(meta.home) === -1;
        if (!need) return null;
        // write-held: the seed lives in memory only; nothing is written back (F-54)
        if (!st.writable) { seed({ packs: packs, meta: meta, stored: isObj(r[1]) }); return null; }
        // C1: the seed is PUT-IF-ABSENT against what is stored NOW, in one transaction — two tabs opening an empty
        // store together must not mint two identities for My Data (M-1's SEED leg): the later tab adopts the first's.
        var F = null;
        return adapter.update(['collections', 'meta'], function (snap) {
          F = freshOf(snap);
          return { ops: F.ahead ? [] : clone(seed(F)) };
        }).then(function () { if (F.ahead) { st.writable = false; st.reason = 'newer-store'; } adopt(F); });
      }).then(function () {
        return needsRail() ? ensureRail() : null;
      }).then(function () { return api.status(); });
      return readyPromise;
    }
    // seed(S) — what a first open adds to S (mutated in place) and the ops that store it: a HOME (R-SII-4) when none —
    // the first own My Data row in order if one is held, else a new My Data minted once; home ON and in the order (D1).
    // Nothing already stored is replaced.
    function seed(S) {
      var ops = [];
      var metaChanged = !S.stored;
      if (!homeOk(S)) {
        var mine = Object.keys(S.packs).filter(function (k) { return S.packs[k].origin === 'own' && S.packs[k].packId === MY; });
        mine.sort(function (a, b) { var ia = S.meta.order.indexOf(a), ib = S.meta.order.indexOf(b); return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib); });
        if (mine.length) S.meta.home = mine[0];
        else {
          var t = now(), inst = mint(), ck = 'own:' + inst;
          S.packs[ck] = { ck: ck, packId: MY, origin: 'own', addedAt: t, updatedAt: t,
            pack: { formatVersion: 1, packId: MY, instance: inst, name: 'My Data', _provenance: 'custom', createdAt: t, updatedAt: t, sections: {} } };
          ops.push({ store: 'collections', op: 'put', value: S.packs[ck] });
          S.meta.home = ck;
        }
        metaChanged = true;
      }
      if (!hasOwn(S.meta.active, S.meta.home)) { S.meta.active[S.meta.home] = true; metaChanged = true; }        // D1: the user's own = ON
      if (S.meta.order.indexOf(S.meta.home) === -1) { S.meta.order.push(S.meta.home); metaChanged = true; }
      if (metaChanged) ops.push(metaOpOf(S.meta));
      return ops;
    }

    // ── C2: re-read what is stored (another tab wrote, or this tab came back into view) ──
    // Keeps the rail and priorAnchors; clears `applied` (emit). A re-read that began before this tab adopted a
    // stored state (its own write, or a later re-read) is dropped: IndexedDB orders the two, so the adopted one is newer.
    function reload() {
      if (!readyPromise) return Promise.resolve(null);          // never opened here: ready() reads fresh when first asked
      return readyPromise.then(function () {
        var at = epoch;
        return Promise.all([adapter.getAll('collections'), adapter.get('meta', 'state'), adapter.getAll('versions'), adapter.get('meta', 'removed')]).then(function (r) {
          if (epoch !== at) return api.status();
          var snap = { collections: rowsOf(r[0]), meta: r[1], removed: r[3] };
          var F = freshOf(snap), vmoved = false;
          if (F.ahead) { st.writable = false; st.reason = 'newer-store'; }
          (r[2] || []).forEach(function (v) {
            if (!v || typeof v.packId !== 'string' || typeof v.version !== 'string') return;
            var k = vkey(v.packId, v.version);
            if (!versionKeys[k] || !hasOwn(versionPacks, k)) { vmoved = true; versionKeys[k] = true; versionPacks[k] = v.pack || null; }
          });
          var moved = adopt(F) || vmoved;
          if (!moved) return api.status();
          return Promise.resolve(needsRail() ? ensureRail() : null).then(function () { emit(); return api.status(); });
        });
      });
    }

    // ── the rail (schemas + vocab): loaded only when a pack actually carries records ──
    function ensureRail() {
      if (rail) return Promise.resolve(rail);
      if (railPromise) return railPromise;
      var schemas = opts.schemas ? Promise.resolve(opts.schemas) : (opts.loadSchemas ? opts.loadSchemas() : Promise.reject(new Error('no schemas')));
      var voc = vocab ? Promise.resolve(vocab) : (opts.loadVocab ? opts.loadVocab() : Promise.resolve({ skills: [], qualities: [] }));
      railPromise = Promise.all([schemas, voc]).then(function (r) {
        rail = PV().create(r[0]);
        vocab = { skills: (r[1] && r[1].skills) || [], qualities: (r[1] && r[1].qualities) || [] };
        railError = null;
        applied = {};
        return rail;
      }).catch(function (e) {
        railError = (e && e.message) || String(e);
        railPromise = null;          // a later call may retry (e.g. once /schema/* is reachable)
        return null;
      });
      return railPromise;
    }

    // base: the PRISTINE registries by pack-section name. The funnels hand in their own sections.
    function provideBase(sections) {
      if (!isObj(sections)) return;
      Object.keys(sections).forEach(function (s) { if (isObj(sections[s])) base[s] = sections[s]; });
      applied = {};
    }
    // ctxFor(ck, F?) — the rail's context: the other ACTIVE collections' sections, from the stored state F inside a
    // write (C1), from the cache on the read paths.
    function ctxFor(ck, F) {
      var also = [];
      orderedActive(F).forEach(function (p) { if (p.ck !== ck && isObj(p.pack.sections)) also.push(p.pack.sections); });
      return {
        base: base, vocab: vocab || { skills: [], qualities: [] }, also: also,
        // a DERIVE's key is its own custom id; its book record is named by `_base.id` (R-EC2-2 / R-SC-5)
        rebuild: function (section, id, rec) { return rebuildShare(base[section] && base[section][baseIdOf(rec, id)], rec); },
      };
    }

    // yoursAsBook (B-1748, ADDENDUM 546 B): a copy's value as its book would say it, for "did YOU change it" only. A copy's rows name the copy (rekeyRows,
    // R-M10E-10), and the form writes `effects: []` / `pool_mods: []` where the book has no key (C1.3a): neither is an edit. A new object; nothing stored moves.
    function yoursAsBook(section, rec, bid, id, fields) {
      var o = clone(rec);
      if (bid !== id) rekeyRows(section, o, id, bid);
      ['effects', 'pool_mods'].forEach(function (k) { if (Array.isArray(o[k]) && !o[k].length && !hasOwn(fields, k)) delete o[k]; });
      return o;
    }
    // anchorSplit: the split against the anchor's fields. An anchor with NONE (a file or a pull; no save writes one, B-1722): the book's own hashes while the ref
    // still matches, since the book has not moved; past that the old book is gone, so the copy stands as the base: no difference, no mark; a difference, a field to answer.
    function anchorSplit(section, id, rec, B) {
      var bid = baseIdOf(rec, id), f = rec._base.fields;
      if (!isObj(f)) {
        var own = fieldHashes(B);
        if (rec._base.ref === BR().baseRef(B)) f = own;
        else { f = fieldHashes(yoursAsBook(section, rec, bid, id, own)); if (hasOwn(own, 'id')) f.id = own.id; else delete f.id; }
      }
      return splitAgainst(f, B, yoursAsBook(section, rec, bid, id, f));
    }
    // true only when the BOOK moved against the anchor: book + conflict is the book's hash against the anchor's, so "yours" can't light or clear it
    function bookChangedOf(section, id, rec, B) {
      if (!isObj(rec) || !isObj(rec._base)) return false;
      var sp = isObj(rec._base.fields) ? splitAgainst(rec._base.fields, B, rec) : anchorSplit(section, id, rec, B);
      return sp.book.length + sp.conflict.length > 0;
    }
    function orderedActive(F) {
      var P = F ? F.packs : packs, M = F ? F.meta : meta;
      var list = Object.keys(P).filter(function (ck) { return M.active[ck] === true; }).map(function (ck) { return P[ck]; });
      return MODS().orderLayers(list, M.order);
    }
    function stampOf(p) {
      if (p.origin === 'imported') { var v = packVersionOf(p.pack); return v ? 'user:' + p.packId + '@' + v : null; }
      var inst = isObj(p.pack) ? p.pack.instance : null;
      return INSTANCE_RE.test(inst || '') ? 'user:' + p.packId + '#' + inst : null;
    }

    // The raw pack a stamp names, from what is loaded (sync). undefined = unknown yet; null = absent.
    // A LIVE stamp names ONE own collection by its instance (R-EC2-1): the row `own:<instance>` whose packId equals the
    // stamp's (R-SII-5) — so every own collection this device holds resolves, another device's "My Data" included, and an
    // own stamp with no instance is absent here.
    function rawForStamp(stamp) {
      var s = MODS().parseUserStamp(stamp);
      if (!s) return null;
      if (!s.version) {
        var o = s.instance ? packs['own:' + s.instance] : null;
        return (o && o.origin === 'own' && o.packId === s.packId && isObj(o.pack)) ? o.pack : null;   // live
      }
      var p = packs['imp:' + s.packId];
      if (p && p.origin === 'imported' && packVersionOf(p.pack) === s.version) return p.pack;
      var k = vkey(s.packId, s.version);
      if (hasOwn(versionPacks, k)) return versionPacks[k];
      return versionKeys[k] ? undefined : null;
    }
    function computeApplied(stamp, raw) {
      if (!rail) return null;
      var s = MODS().parseUserStamp(stamp);
      var res = rail.load(sourcedPack(raw), ctxFor(s.instance ? 'own:' + s.instance : 'imp:' + s.packId));
      if (res.status === 'ok') supplySources(res.applied);
      return { formatVersion: 1, packId: s.packId, name: raw && raw.name, sections: res.status === 'ok' ? res.applied : {}, _load: res };
    }
    // R-FIEC-4: a record anchored to a book record gets that LIVE book record's `sources` (a derive's from
    // `_base.id`, a redefine's from its own id), or none when the book has none. Resolve-at-render: the record
    // switches on and off with its book in Sources forever. A plain add keeps what it has (a blank start: none).
    function supplySources(sections) {
      Object.keys(sections || {}).forEach(function (sec) {
        var recs = sections[sec];
        if (!isObj(recs) || !isObj(base[sec])) return;
        Object.keys(recs).forEach(function (id) {
          var r = recs[id], bid = baseIdOf(r, id);
          var anchored = (isObj(r) && r._mode === 'derive' && typeof bid === 'string' && bid !== id) || hasOwn(base[sec], id);
          if (!anchored || !isObj(base[sec][bid])) return;
          if (Array.isArray(base[sec][bid].sources)) r.sources = clone(base[sec][bid].sources); else delete r.sources;
        });
      });
    }
    // F-100 M12 R-M12B-116: the rail checks a record AS IT IS READ — at the three checks that read STORED records: the save, the
    // load (computeApplied) and the share's own check. (The import's load passes a derive as it arrives; measured, not wrapped.) A book-anchored record never stores `sources` (R-FIEC-4,
    // above) — it reads its live book's — so its rows' `cite.book` are checked against those: a derive of Narrow Escape keeps
    // "Fly Casual" (F2 (d)'s "Books CARRIED"), and a plain add checks against its own (a /new ability: none, so a book cite
    // is refused and named). A copy: nothing stored changes. Leg 1d's section ONLY (SOURCED_AS_READ): a species derive that took
    // an ability from another species (B-1201, R-M10E-6) cites that species' book, which its base's sources do not name — the
    // wrap reaching every section refused that save (E5's m10_editor red); every other section is checked as at the cut.
    var SOURCED_AS_READ = ['signature_abilities'];
    function sourcedPack(pack) {
      if (!isObj(pack) || !isObj(pack.sections)) return pack;
      var c = clone(pack), part = {};
      SOURCED_AS_READ.forEach(function (sec) { if (hasOwn(c.sections, sec)) part[sec] = c.sections[sec]; });
      supplySources(part); return c;
    }
    function stampSync(stamp) {
      if (hasOwn(applied, stamp)) return applied[stamp];
      var raw = rawForStamp(stamp);
      if (!raw) return null;
      if (!hasRecords(raw)) { applied[stamp] = { formatVersion: 1, packId: MODS().parseUserStamp(stamp).packId, sections: {}, _load: null }; return applied[stamp]; }
      if (!rail) return null;
      applied[stamp] = computeApplied(stamp, raw);
      return applied[stamp];
    }
    function loadStamp(stamp) {
      return ready().then(function () {
        var s = MODS().parseUserStamp(stamp);
        if (!s) return null;
        var k = s.version ? vkey(s.packId, s.version) : null;
        var fetchVersion = (k && versionKeys[k] && !hasOwn(versionPacks, k) && rawForStamp(stamp) === undefined)
          ? adapter.get('versions', [s.packId, s.version]).then(function (v) { versionPacks[k] = (v && v.pack) || null; })
          : null;
        return Promise.resolve(fetchVersion).then(function () {
          var raw = rawForStamp(stamp);
          return (raw && hasRecords(raw)) ? ensureRail() : null;
        }).then(function () { return stampSync(stamp); });
      });
    }

    // ── writes ── (C1: each one is a commit() over what is stored; the cache is never the source of a write)
    function refuse(reasons) { return Promise.resolve({ ok: false, reasons: [].concat(reasons) }); }
    function heldReason() { return 'write-held — ' + st.reason + ' (this store is read-only here; nothing is written back)'; }
    function metaOpOf(M) { return { store: 'meta', op: 'put', key: 'state', value: M }; }
    function removedOpOf(Rm) { return { store: 'meta', op: 'put', key: 'removed', value: Rm }; }

    function createPack(o) {
      o = o || {};
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var id = o.packId, name = o.name;
          if (typeof id !== 'string' || !PACK_ID_RE.test(id)) return no('bad-pack-id — a packId is ^[a-z0-9_]+$ (R-FUD-2)');
          // a NEW local collection still takes a packId no row here holds (R-SII-12: newPackId steps against this device's
          // list); a RECEIVED own row may repeat one (R-SII-1)
          if (Object.keys(F.packs).some(function (k) { return F.packs[k].packId === id; })) return no('pack-id-taken — ' + id + ' is already a pack here');
          if (typeof name !== 'string' || !name.length) return no('bad-name — a pack needs a name');
          if (ownNameTaken(F.packs, name, null)) return no('name-taken — you already have a collection called ' + name + ' (R-FIEC-7)');
          var t = now(), inst = mint(), ck = 'own:' + inst;
          var rec = { ck: ck, packId: id, origin: 'own', addedAt: t, updatedAt: t,
            pack: { formatVersion: 1, packId: id, instance: inst, name: name, _provenance: 'custom', createdAt: t, updatedAt: t, sections: {} } };
          F.packs[ck] = rec;
          F.meta.active[ck] = true; if (F.meta.order.indexOf(ck) === -1) F.meta.order.push(ck);
          return { ops: [{ store: 'collections', op: 'put', value: rec }, metaOpOf(F.meta)], value: { ok: true, packId: id, ck: ck } };
        });
      });
    }

    // Two own collections never share a name, case-insensitively (ruling f100-items-editor-contracts
    // R-FIEC-7 Q1): the collections list and the tie frames tell them apart by name. Imported packs are
    // not compared — they are named by their authors. P: the packs a write read (C1).
    // A RECEIVED own row may repeat a name (sync never renames, R-SII-9); this check governs local creates and renames.
    function ownNameTaken(P, name, exceptCk) {
      var n = String(name).trim().toLowerCase();
      return Object.keys(P).some(function (k) {
        var p = P[k];
        return k !== exceptCk && p.origin === 'own' && isObj(p.pack) && String(p.pack.name || '').trim().toLowerCase() === n;
      });
    }
    // renamePack(ck, name) — OWN collections only (an imported pack is stored as received, R-FUD-10);
    // My Data may be renamed and keeps its packId. Writes the name and updatedAt; the stamp (its instance)
    // and packVersion (over sections) do not move.
    function renamePack(x, name) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var ck = ckFor(F.packs, F.meta, x), p = F.packs[ck];
          if (!p) return no('no-such-pack — ' + x);
          if (p.origin !== 'own') return no('pack-read-only — ' + p.packId + ' is imported; its name is its author\'s');
          if (typeof name !== 'string' || !name.trim().length) return no('bad-name — a pack needs a name');
          if (ownNameTaken(F.packs, name, ck)) return no('name-taken — you already have a collection called ' + name + ' (R-FIEC-7)');
          var np = clone(p), t = now();
          np.pack.name = name; np.pack.updatedAt = t; np.updatedAt = t;
          F.packs[ck] = np;
          return { ops: [{ store: 'collections', op: 'put', value: np }], value: { ok: true, packId: p.packId, ck: ck, name: name } };
        });
      });
    }
    // mintId(ck, section, name) → `custom_<packId>_<slug>_<inst6>` (R-FIEC-7, C-5.2; the tag by f100-sync-instance-index
    // R-SII-8): slug = the name lower-cased, every run of non-[a-z0-9] → `_`, trimmed, capped at 48; empty → `item`;
    // <inst6> = the first six hex of the collection's instance, so two devices offline never mint one id for two records.
    // A collision with any record id in ANY held row's same section, or in the book, appends _2, _3 … Pure: it writes
    // nothing, and it reads this tab's cache — a save mints INSIDE its transaction instead (saveRecord's `mint`, C1.a). A
    // record renamed later never re-mints (its id is identity), and an id minted before v2 is never rewritten.
    function mintIn(P, packId, section, name, inst) {
      var slug = String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48).replace(/_+$/, '');
      if (!slug) slug = 'item';
      var stem = 'custom_' + packId + '_' + slug + (INSTANCE_RE.test(inst || '') ? '_' + inst.slice(0, 6) : '');
      var taken = function (id) {
        if (isObj(base[section]) && hasOwn(base[section], id)) return true;
        return Object.keys(P).some(function (k) { var sec = isObj(P[k].pack) && isObj(P[k].pack.sections) ? P[k].pack.sections[section] : null; return isObj(sec) && hasOwn(sec, id); });
      };
      var id = stem, n = 2;
      while (taken(id)) id = stem + '_' + (n++);
      return id;
    }
    function mintId(x, section, name) {
      var p = packs[ckHere(x)];
      return mintIn(packs, p ? p.packId : x, section, name, p && isObj(p.pack) ? p.pack.instance : null);
    }

    // ONE re-key (R-M10E-10, generalized by f100-m12-build-card R-M12B-111): a record's rows that name the record follow it
    // from `from` to `to` (in place; the four row arrays of every node), by its section's own ref rules — `count_of.key`
    // '<record>.<node>' (V1 / SV2) and `applies_to` {scope: <the section's scope>, value: <record>} (V4 / SV1). A row naming
    // another record keeps it; a node's own key (`abilities` keys, a tree cell's `ability`) is never a ref and is not touched.
    var REKEY_SCOPE = { force_powers: 'force_power', signature_abilities: 'signature_ability' };
    function rekeyRows(section, rec, from, to) {
      var scope = REKEY_SCOPE[section]; if (!scope) return;
      var abs = isObj(rec.abilities) ? rec.abilities : {};
      Object.keys(abs).forEach(function (k) {
        var ab = abs[k]; if (!isObj(ab)) return;
        ['pool_mods', 'effects', 'roll_numbers', 'told'].forEach(function (arr) {
          (Array.isArray(ab[arr]) ? ab[arr] : []).forEach(function (row) {
            if (!isObj(row)) return;
            var c = row.count_of;
            if (isObj(c) && typeof c.key === 'string' && c.key.indexOf(from + '.') === 0) c.key = to + c.key.slice(from.length);
            if (Array.isArray(row.applies_to)) row.applies_to.forEach(function (x) { if (isObj(x) && x.scope === scope && x.value === from) x.value = to; });
          });
        });
      });
    }
    // saveRecord — an OWN pack's record, FULL (G4), one copy per id (rewritten in place).
    // o (ruling f100-editor-contracts-2):
    //   from:   <canonical id>  — the FIRST save of a new record started from that book record → a DERIVE
    //           (R-EC2-2): `_base` = { id, ref, editedAt, tag? }, captured once. Canonical ids only; no detach.
    //   anchor: 'keep' (default: the first anchor is kept, R-FPA-2) | 'reconcile' (the user answered the
    //           book's change — either way — so re-anchor on the live base; legal only when base-moved) |
    //           <the prior anchor object> (Undo of the last reconcile, this session only) (R-EC2-4).
    //   create: true — the CREATE intent (R-FIEC-7): this save makes a new record, so an id already in this
    //           pack's section is refused `id-taken` instead of silently replacing it. Without it, a save of an
    //           existing id rewrites that record in place (an edit).
    //   mint:   true (with create) — the id is minted from the record's name INSIDE the write, against what is
    //           stored (C1.a; ruling f100-items-live-contracts R-FILC-2): two tabs creating one name get two ids.
    //   opened: the record as the form OPENED it (C3, R-FILC-4), null for "there was none". Compared with the stored
    //           record by JCS inside the write; a difference refuses `changed-elsewhere` with `stored` (the stored
    //           record, or null) and writes nothing. Absent → no compare (a create, a reconcile, a guard).
    // → { ok, packId, ck, section, id, mode, record } — `record` is the record exactly as stored (a form's next `opened`).
    function saveRecord(x, section, record, o) {
      o = o || {};
      return ready().then(function () {
        if (!st.writable) return refuse(heldReason());
        // the rail loads BEFORE the transaction opens: authoring is synchronous, and nothing may await inside it
        return ensureRail().then(function (r) {
          return commit(['collections', 'meta'], function (F) {
            var ck = ckFor(F.packs, F.meta, x), p = F.packs[ck];
            if (!p) return no('no-such-pack — ' + x);
            var packId = p.packId;
            if (p.origin !== 'own') return no('pack-read-only — ' + packId + ' is imported; save the record into one of your own packs instead');
            if (PV().APPLIED_SECTIONS.indexOf(section) === -1) return no('section-not-writable — ' + section + ' is not a section this app writes in v1');
            if (!isObj(base[section])) return no('base-not-loaded — the ' + section + ' registry is not loaded here, so a canonical id cannot be told from a new one');
            if (!isObj(record) || (o.mint !== true && typeof record.id !== 'string')) return no('bad-record — a record is an object with an `id`');
            if (o.mint === true && o.create !== true) return no('bad-mint — an id is minted only for a new record (mint goes with create)');
            var rec = persistableCopy(record);
            var srcId = typeof record.id === 'string' ? record.id : null;   // the record this one was opened from (a copy's source)
            if (o.mint === true) rec.id = mintIn(F.packs, packId, section, rec.name, p.pack.instance);
            var id = rec.id;
            // F-100 M10 R-M10E-10 (D-M10B1 (a)), M12 R-M12B-111: a COPY's rows follow the copy. A Force power or a signature ability
            // saved under a NEW id re-keys every row naming its source (rekeyRows, the section's own ref rules) to its own id; a row
            // naming another record keeps it. The source is the book record (`from`) and/or the record the form opened (a copy of a
            // copy). A redefine ("Change the book's Move") keeps the id and re-keys nothing.
            [o.from, srcId].forEach(function (src) { if (typeof src === 'string' && src !== id) rekeyRows(section, rec, src, id); });
            var prior = isObj(p.pack.sections[section]) ? p.pack.sections[section][id] : undefined;
            if (o.opened !== undefined) {
              var J = BR().jcs, had = prior === undefined ? null : J(prior), saw = o.opened === null ? null : J(o.opened);
              if (had !== saw) return no('changed-elsewhere — ' + section + '.' + id + ' changed in another tab after this form opened it; nothing was saved',
                { changed: true, stored: prior === undefined ? null : clone(prior) });
            }
            if (o.create === true && prior !== undefined) return no('id-taken — ' + section + '.' + id + ' is already in ' + packId + '; a new record takes a new id (mintId)');
            var canonical = hasOwn(base[section], id);
            var otherPack = Object.keys(F.packs).some(function (k) { return k !== ck && isObj(F.packs[k].pack.sections) && isObj(F.packs[k].pack.sections[section]) && hasOwn(F.packs[k].pack.sections[section], id); });
            var from = o.from;
            if (from !== undefined) {
              if (canonical) return no('derive-id-canonical — ' + section + '.' + id + ' is a book record; changing it is a redefine, not a new record');
              if (typeof from !== 'string' || !hasOwn(base[section], from)) return no('derive-base-unknown — ' + String(from) + ' is not a book ' + section + ' record here (a record is started only from a book record, R-EC2-2)');
              if (prior && !(prior._mode === 'derive' && isObj(prior._base) && prior._base.id === from)) return no('derive-on-existing — ' + section + '.' + id + ' already exists; the link to a book record is made when a record is created');
            }
            var derive = from !== undefined || !!(prior && prior._mode === 'derive' && isObj(prior._base) && typeof prior._base.id === 'string');
            rec._mode = derive ? 'derive' : (canonical || otherPack ? 'redefine' : 'add');
            if (derive) stripBookKeys(rec);          // R-EC2-A1-1: a derive carries none of its book record's bookkeeping
            var bookId = derive ? (from !== undefined ? from : prior._base.id) : id;
            var anchored = derive || canonical;
            if (anchored) delete rec.sources;       // R-FIEC-4: the live book's, supplied at view time — never stored
            var anchorMode = o.anchor === undefined ? 'keep' : o.anchor;
            var akey = ck + '\u0000' + section + '\u0000' + id;
            var reconciled = null;                  // the anchor a 'reconcile' replaces (kept for Undo)
            var fresh = function () {
              var a = {}; if (derive) a.id = bookId;
              a.ref = BR().baseRef(base[section][bookId]); a.editedAt = now();
              if (opts.build) a.tag = String(opts.build).slice(0, 64);
              a.fields = fieldHashes(base[section][bookId]);       // R-FIEC-3: taken with the anchor, re-taken on reconcile
              return a;
            };
            if (!anchored) {
              if (anchorMode !== 'keep') return no('nothing-to-reconcile — ' + section + '.' + id + ' is not based on a book record');
              delete rec._base;
            } else if (anchorMode === 'keep') {
              // the anchor is captured ONCE, at the first redefine/derive, and kept across later saves:
              // re-anchoring on every save would hide a book change the user has not reconciled (R-FPA-2).
              if (prior && isObj(prior._base)) rec._base = clone(prior._base);
              else if (isObj(base[section][bookId])) rec._base = fresh();
              else delete rec._base;
            } else if (anchorMode === 'reconcile') {
              var live = base[section][bookId];
              var moved = isObj(live) && prior && (!isObj(prior._base) || prior._base.ref !== BR().baseRef(live));
              if (!moved) return no('nothing-to-reconcile — ' + section + '.' + id + ' is not base-moved (the book record is unchanged, or not in this app)');
              reconciled = isObj(prior._base) ? clone(prior._base) : null;
              if (derive && bookId !== id) rekeyRows(section, rec, bookId, id);   // B-1748: an answer brings the book's rows; they follow the copy, as its first save's did
              rec._base = fresh();
            } else if (isObj(anchorMode)) {
              var held = priorAnchors[akey];
              if (!held || BR().jcs(held) !== BR().jcs(anchorMode)) return no('anchor-not-prior — only the anchor this record held before its last reconcile can be restored (Undo, R-EC2-4)');
              rec._base = clone(anchorMode);
            } else return no('bad-anchor — anchor is \'keep\', \'reconcile\' or the prior anchor object');
            delete rec._changes;
            if (!r) return no('rail-unavailable — the schemas could not be read (' + railError + '); nothing was saved');
            var env = { formatVersion: 1, packId: packId, name: p.pack.name, _provenance: 'custom', sections: {} };
            env.sections[section] = {}; env.sections[section][id] = rec;
            var ctx = ctxFor(ck, F); ctx.also = [p.pack.sections].concat(ctx.also);
            var a = r.authoring(sourcedPack(env), ctx);
            if (!a.ok) return { ok: false, reasons: a.reasons };
            var np = clone(p), t = now();
            np.pack.sections[section] = np.pack.sections[section] || {};
            np.pack.sections[section][id] = rec;
            np.pack.updatedAt = t; np.updatedAt = t;
            F.packs[ck] = np;
            return { ops: [{ store: 'collections', op: 'put', value: np }],
              value: { ok: true, packId: packId, ck: ck, section: section, id: id, mode: rec._mode, record: clone(rec) },
              after: function () {
                if (anchorMode === 'reconcile' && reconciled) priorAnchors[akey] = reconciled;
                else if (isObj(anchorMode)) delete priorAnchors[akey];
              } };
          });
        });
      });
    }
    // deleteRecord — Delete does NOT compare (C3.a, R-FILC-4): the intent to delete survives another tab's edit.
    function deleteRecord(x, section, id) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var ck = ckFor(F.packs, F.meta, x), p = F.packs[ck];
          if (!p) return no('no-such-pack — ' + x);
          if (p.origin !== 'own') return no('pack-read-only — ' + p.packId + ' is imported');
          if (!isObj(p.pack.sections[section]) || !hasOwn(p.pack.sections[section], id)) return no('no-such-record — ' + section + '.' + id);
          var np = clone(p), t = now();
          delete np.pack.sections[section][id];
          np.pack.updatedAt = t; np.updatedAt = t;
          F.packs[ck] = np;
          return { ops: [{ store: 'collections', op: 'put', value: np }], value: { ok: true, ck: ck } };
        });
      });
    }
    // removePack(ck) — HOME is unremovable (R-SII-4: the refusal moved from `packId === my_data` to `ck === home`); any
    // other row, another device's My Data included, is removed here. The sync lane writes its tombstone (R-HSC-13).
    // R-MSB-23 (FLAG-10): a row the account holds (an own row with a synced base, not device-local) leaves a mark — its
    // base, under its instance, in meta 'removed', in this same transaction — so a reload before the lane sends the
    // tombstone still sends it, and never receives the row back.
    function removePack(x) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var ck = ckFor(F.packs, F.meta, x);
          if (ck && ck === F.meta.home) return no('my-data-is-permanent — My Data cannot be removed');
          if (!F.packs[ck]) return no('no-such-pack — ' + x);
          var p = F.packs[ck], inst = isObj(p.pack) ? p.pack.instance : null;
          var mark = p.origin === 'own' && !p.local && isObj(p.synced) && INSTANCE_RE.test(inst || '');
          delete F.packs[ck];
          delete F.meta.active[ck]; F.meta.order = F.meta.order.filter(function (k) { return k !== ck; });
          // versions are NOT deleted (append-only, v1): a frozen character keeps resolving its version.
          var ops = [{ store: 'collections', op: 'delete', key: ck }, metaOpOf(F.meta)];
          if (mark) { F.removed.rows[inst] = { ver: p.synced.ver, h: p.synced.h }; ops.push(removedOpOf(F.removed)); }
          return { ops: ops, value: { ok: true, ck: ck } };
        });
      });
    }
    function setActive(x, on) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var ck = ckFor(F.packs, F.meta, x);
          if (!F.packs[ck]) return no('no-such-pack — ' + x);
          F.meta.active[ck] = !!on;
          return { ops: [metaOpOf(F.meta)], value: { ok: true, ck: ck } };
        });
      });
    }
    function setOrder(order) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          if (!Array.isArray(order)) return no('bad-order — an array of collection keys');
          var cks = [];
          order.forEach(function (x) { var ck = ckFor(F.packs, F.meta, x); if (F.packs[ck] && cks.indexOf(ck) === -1) cks.push(ck); });
          F.meta.order = cks.concat(F.meta.order.filter(function (k) { return cks.indexOf(k) === -1; }));
          return { ops: [metaOpOf(F.meta)], value: { ok: true } };
        });
      });
    }

    // ── R-SII-7's collapse, one rule for every arrival of an own My Data (a receipt and a restore): when this device's
    // HOME is EMPTY and no local character or draft carries home's stamp, the arriving row becomes home and the empty one
    // is removed, taking home's place in the order. Otherwise both are held and home stays. Mutates F; → the ops, or null.
    function collapseInto(F, ck, row, used) {
      var h = F.meta.home && F.packs[F.meta.home];
      if (row.packId !== MY || !h || h.ck === ck || hasRecords(h.pack)) return null;
      if ((used || []).indexOf(stampOf(h)) !== -1) return null;
      var old = h.ck;
      delete F.packs[old];
      F.packs[ck] = row;
      F.meta.active[ck] = hasOwn(F.meta.active, old) ? F.meta.active[old] : true;
      delete F.meta.active[old];
      var i = F.meta.order.indexOf(old);
      F.meta.order = F.meta.order.filter(function (k) { return k !== ck; });
      if (i === -1) F.meta.order.push(ck); else F.meta.order.splice(Math.min(i, F.meta.order.length), 1, ck);
      F.meta.home = ck;
      return [{ store: 'collections', op: 'delete', key: old }, { store: 'collections', op: 'put', value: row }, metaOpOf(F.meta)];
    }
    // an arriving own row replaces an IMPORTED row carrying the same instance (a FULL file imported before v2 — R-HSC-3's
    // reverse H8 case), taking its place in the order. Mutates F; → ops.
    function replaceImported(F, ck, row) {
      var ik = 'imp:' + row.packId, ip = F.packs[ik];
      if (!ip || !isObj(ip.pack) || ip.pack.instance !== row.pack.instance) return [];
      delete F.packs[ik];
      if (hasOwn(F.meta.active, ik)) { F.meta.active[ck] = F.meta.active[ik]; delete F.meta.active[ik]; }
      F.meta.order = F.meta.order.map(function (k) { return k === ik ? ck : k; });
      return [{ store: 'collections', op: 'delete', key: ik }];
    }
    function addOwnRow(F, ck, row, used) {
      var ops = replaceImported(F, ck, row);
      var c = collapseInto(F, ck, row, used);
      if (c) return { ops: ops.concat(c), collapsed: true };
      F.packs[ck] = row;
      if (!hasOwn(F.meta.active, ck)) F.meta.active[ck] = true;
      if (F.meta.order.indexOf(ck) === -1) F.meta.order.push(ck);
      return { ops: ops.concat([{ store: 'collections', op: 'put', value: row }, metaOpOf(F.meta)]), collapsed: false };
    }
    function usedNow() { try { return typeof opts.usedStamps === 'function' ? (opts.usedStamps() || []) : null; } catch (e) { return null; } }

    // importPack — stored AS RECEIVED (R-FUD-10); the load partition decides what applies, later.
    // THE FILE DECIDES (R-HSC-12): a pack with a valid `instance` and no `projection: 'share'` is a FULL own file and
    // RESTORES as own — packId and instance verbatim, never re-minted, its version written so an @v12 stamp of the same
    // file resolves; refused `already-here` when this device already holds that instance. Anything else imports as today.
    function importPack(input) {
      return ready().then(function () {
        if (!st.writable) return refuse(heldReason());
        var pack = input;
        if (typeof input === 'string') { try { pack = JSON.parse(input); } catch (e) { return refuse('not-json — the file is not JSON'); } }
        if (!isObj(pack)) return refuse('not-a-pack — a pack is a JSON object');
        var full = INSTANCE_RE.test(pack.instance || '') && pack.projection !== 'share' && typeof pack.packId === 'string' && PACK_ID_RE.test(pack.packId);
        var used = usedNow();
        return ensureRail().then(function (r) {
          if (!r) return refuse('rail-unavailable — the schemas could not be read (' + railError + '); nothing was imported');
          return commit(['collections', 'meta', 'versions'], function (F) {
            var id = pack.packId;
            var ck0 = full ? 'own:' + pack.instance : 'imp:' + id;
            var res = r.load(pack, ctxFor(ck0, F));
            if (res.status === 'rejected') return { ok: false, reasons: res.reasons };
            var v = packVersionOf(pack);
            if (!v) return no('no-version — the pack has no sections to version');
            var t = now(), k = vkey(id, v), fresh = !F.versionKeys[k], ops = [], add;
            var vrow = { packId: id, version: v, pack: pack, importedAt: t };
            if (full) {
              if (F.packs[ck0]) return no('already-here — this collection is already on this device; nothing was restored');
              var orow = { ck: ck0, packId: id, origin: 'own', pack: pack, addedAt: t, updatedAt: t };
              // unknown references (no usedStamps edge) never collapse: both are held, which loses nothing
              add = addOwnRow(F, ck0, orow, used === null ? [stampOf({ origin: 'own', packId: MY, pack: F.packs[F.meta.home] && F.packs[F.meta.home].pack })] : used);
              ops = add.ops;
              if (fresh) ops.push({ store: 'versions', op: 'put', value: vrow });
              F.versionKeys[k] = true;
              return { ops: ops,
                after: function () { versionPacks[k] = clone(pack); },
                value: { ok: true, restored: true, ck: ck0, packId: id, version: v, stamp: 'user:' + id + '#' + pack.instance, status: res.status,
                         collapsed: add.collapsed, kept: res.kept.length, unapplied: res.unapplied.length, warnings: res.warnings.length } };
            }
            var existing = F.packs[ck0];
            if (Object.keys(F.packs).some(function (x) { return F.packs[x].origin === 'own' && F.packs[x].packId === id; })) {
              return no('pack-id-taken — ' + id + ' is one of your own packs here (H8(b)); an import cannot replace it');
            }
            var rec = { ck: ck0, packId: id, origin: 'imported', pack: pack, addedAt: existing ? existing.addedAt : t, updatedAt: t };
            ops = [{ store: 'collections', op: 'put', value: rec }];
            if (fresh) ops.push({ store: 'versions', op: 'put', value: vrow });
            if (!existing) { F.meta.active[ck0] = true; if (F.meta.order.indexOf(ck0) === -1) F.meta.order.push(ck0); ops.push(metaOpOf(F.meta)); }  // H9: ON
            var prev = existing ? packVersionOf(existing.pack) : null;
            F.packs[ck0] = clone(rec); F.versionKeys[k] = true;
            return { ops: ops,
              after: function () {
                versionPacks[k] = clone(pack);
                if (existing && prev && prev !== v) { var pk = vkey(id, prev); if (!hasOwn(versionPacks, pk)) versionPacks[pk] = clone(existing.pack); }
              },
              value: { ok: true, packId: id, ck: ck0, version: v, stamp: 'user:' + id + '@' + v, status: res.status,
                       newVersion: !!existing && prev !== v, sameVersion: !!existing && prev === v,
                       kept: res.kept.length, unapplied: res.unapplied.length, warnings: res.warnings.length } };
          });
        });
      });
    }

    // ── the sync lane's verbs (f100-homebrew-sync-contract R-HSC-11..15; card f100-ms-build ADDENDUM 1 R-MSB-9). Each is a
    // store writer under C1/C2 like any other: one commit(), a refusal writes nothing, a committed write posts to the
    // other tabs. The lane decides WHAT to call; these decide nothing about the wire.
    //
    // THE SYNC BASE (R-MSB-9): an own row's `synced: {ver, h}` and local meta's `synced` — the server row version last
    // agreed, and syncHash() of the envelope exactly as last pushed or received. Written ONLY by a receipt that names
    // its version and by markSynced(); a local edit never moves it, which is how the lane tells "this side moved".
    function syncHashOf(v) { return hashOf(v); }
    function receiveOwn(pack, o) {
      o = o || {};
      return ready().then(function () {
        if (!isObj(pack) || typeof pack.packId !== 'string' || !PACK_ID_RE.test(pack.packId) || !INSTANCE_RE.test(pack.instance || '') || !isObj(pack.sections)) {
          return refuse('bad-pack — a received collection needs a packId, an instance and sections');
        }
        return commit(['collections', 'meta'], function (F) {
          var ck = 'own:' + pack.instance, ex = F.packs[ck], t = now();
          var base = o.ver != null ? { ver: o.ver, h: syncHashOf(pack) } : null;
          if (ex) {
            if (ex.origin !== 'own') return no('not-own — ' + ck);
            var np = clone(ex);
            np.pack = clone(pack); np.updatedAt = t;
            if (base) np.synced = base;
            F.packs[ck] = np;
            return { ops: [{ store: 'collections', op: 'put', value: np }], value: { ok: true, ck: ck, replaced: true, collapsed: false } };
          }
          var row = { ck: ck, packId: pack.packId, origin: 'own', pack: clone(pack), addedAt: t, updatedAt: t };
          if (base) row.synced = base;
          var add = addOwnRow(F, ck, row, o.used || []);
          return { ops: add.ops, value: { ok: true, ck: ck, replaced: false, collapsed: add.collapsed } };
        });
      });
    }
    // F-100 M10 B-1172 — "Sync this again" (ruling f100-m10-editor-card R-M10E-7; frame F7, D-141 K3 (a); the brief's K8c
    // mechanism, measured): the ONE act that lifts R-HSC-13's kept mark. It clears the row's `local` AND its sync base
    // `synced`, and writes nothing else (no new field, D-140). With no base, the lane reads the account's tombstone as a
    // restore (sync.js decideRow, R-HSC-12) and its next send rewrites the account, so the removing device receives the
    // collection back. Clearing the mark alone is not enough: the tombstone re-marks it on the next pull (K8a).
    function syncAgain(x) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var ck = ckFor(F.packs, F.meta, x), p = F.packs[ck];
          if (!p) return no('no-such-pack — ' + x);
          if (p.origin !== 'own') return no('pack-read-only — ' + p.packId + ' is imported; it was never synced from here');
          if (p.local !== 'removed-elsewhere') return no('not-kept — ' + p.packId + ' already syncs');
          var np = clone(p);
          delete np.local; delete np.synced;
          F.packs[ck] = np;
          return { ops: [{ store: 'collections', op: 'put', value: np }], value: { ok: true, ck: ck } };
        });
      });
    }
    // R-HSC-13: another device removed this collection. An unused copy is deleted; a copy a local character or draft
    // uses — or HOME (FLAG-3, raised at gate f100-ms-build#1), or one the lane says to keep (R-MSB-9: an unsynced edit
    // is never deleted) — is KEPT, device-local (`local: 'removed-elsewhere'`), and never synced again.
    function receiveTombstone(inst, o) {
      o = o || {};
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          var ck = 'own:' + inst, p = F.packs[ck];
          if (!p) return { ops: [], value: { ok: true, absent: true } };
          var keep = ck === F.meta.home || o.keep === true || (o.used || []).indexOf(stampOf(p)) !== -1;
          if (keep) {
            if (p.local === 'removed-elsewhere') return { ops: [], value: { ok: true, kept: true, ck: ck } };
            var np = clone(p); np.local = 'removed-elsewhere';
            F.packs[ck] = np;
            return { ops: [{ store: 'collections', op: 'put', value: np }], value: { ok: true, kept: true, ck: ck } };
          }
          delete F.packs[ck];
          delete F.meta.active[ck]; F.meta.order = F.meta.order.filter(function (k) { return k !== ck; });
          return { ops: [{ store: 'collections', op: 'delete', key: ck }, metaOpOf(F.meta)], value: { ok: true, deleted: true, ck: ck } };
        });
      });
    }
    // R-HSC-11: a pinned version another device synced. Stored in `versions` ONLY (no listed row, not active, not
    // editable — the state removePack already leaves), and only when its content IS that version: packVersion of its
    // sections equals the name's <v12>. Otherwise `version-mismatch`, nothing stored.
    function receiveVersion(packId, v, pack) {
      return ready().then(function () {
        if (typeof packId !== 'string' || !PACK_ID_RE.test(packId) || !isObj(pack) || packVersionOf(pack) !== v) {
          return refuse('version-mismatch — the received ' + packId + '@' + v + ' is not that version; nothing was stored');
        }
        var k = vkey(packId, v);
        return commit(['collections', 'meta', 'versions'], function (F) {
          if (F.versionKeys[k]) return { ops: [], value: { ok: true, already: true } };
          F.versionKeys[k] = true;
          return { ops: [{ store: 'versions', op: 'put', value: { packId: packId, version: v, pack: pack, importedAt: now() } }],
            after: function () { versionPacks[k] = clone(pack); }, value: { ok: true, stored: true } };
        });
      });
    }
    // R-HSC-4 / R-SII-3: the synced meta row speaks INSTANCES, own only. Received, each instance maps to `own:<instance>`
    // (rows this device holds and syncs); their active flags are taken and they are re-sequenced among themselves in the
    // account's order. Imported positions, home, and rows the account does not name stay as they are. o.ver → the base.
    function receiveMeta(m, o) {
      o = o || {};
      return ready().then(function () {
        if (!isObj(m)) return refuse('bad-meta');
        return commit(['collections', 'meta'], function (F) {
          var ok = function (ck) { var p = F.packs[ck]; return !!p && p.origin === 'own' && !p.local; };
          Object.keys(isObj(m.active) ? m.active : {}).forEach(function (i) { var ck = 'own:' + i; if (ok(ck)) F.meta.active[ck] = m.active[i] === true; });
          var seqd = (Array.isArray(m.order) ? m.order : []).map(function (i) { return 'own:' + i; }).filter(ok);
          var q = seqd.slice(), next = [];
          F.meta.order.forEach(function (k) { next.push(seqd.indexOf(k) !== -1 ? q.shift() : k); });
          q.forEach(function (k) { if (next.indexOf(k) === -1) next.push(k); });
          F.meta.order = next;
          if (o.ver != null) F.meta.synced = { ver: o.ver, h: syncHashOf(m) };
          return { ops: [metaOpOf(F.meta)], value: { ok: true } };
        });
      });
    }
    // markSynced(ck | 'meta', {ver, h}) — the base after a push returned 200, a 409 carried equal content, or an answered
    // conflict's write completed (R-MSB-9's "written when"). Moves nothing else.
    function markSynced(x, b) {
      return ready().then(function () {
        if (!isObj(b) || typeof b.ver !== 'number' || typeof b.h !== 'string') return refuse('bad-base — {ver, h}');
        return commit(['collections', 'meta'], function (F) {
          if (x === 'meta') { F.meta.synced = { ver: b.ver, h: b.h }; return { ops: [metaOpOf(F.meta)], value: { ok: true } }; }
          var ck = ckFor(F.packs, F.meta, x), p = F.packs[ck];
          if (!p || p.origin !== 'own') return no('no-such-pack — ' + x);
          var np = clone(p); np.synced = { ver: b.ver, h: b.h };
          F.packs[ck] = np;
          return { ops: [{ store: 'collections', op: 'put', value: np }], value: { ok: true, ck: ck } };
        });
      });
    }
    // clearRemoved(instance) — R-MSB-23: the lane clears a mark (a tombstone PUT returned 200; the account row is a
    // tombstone or absent; or the row was received because another device edited it). Only through commit().
    function clearRemoved(inst) {
      return ready().then(function () {
        return commit(['collections', 'meta'], function (F) {
          if (!hasOwn(F.removed.rows, inst)) return { ops: [], value: { ok: true, absent: true } };
          delete F.removed.rows[inst];
          return { ops: [removedOpOf(F.removed)], value: { ok: true } };
        });
      });
    }
    function recordCount(pack) {
      var n = 0; if (isObj(pack) && isObj(pack.sections)) Object.keys(pack.sections).forEach(function (s) { if (isObj(pack.sections[s])) n += Object.keys(pack.sections[s]).length; });
      return n;
    }
    // syncSnapshot() — what the lane reads, from the cache (read-only: the rows are this tab's adopted copies, never to be
    // mutated). own: every own row in the user's order, with its entry count, base, and device-local flag; meta: the
    // wire shape {v:1, active:{inst}, order:[inst]} over own rows that sync (not device-local); metaSynced: local meta's base.
    function syncSnapshot() {
      var own = MODS().orderLayers(Object.keys(packs).map(function (k) { return packs[k]; }).filter(function (p) { return p.origin === 'own'; }), meta.order);
      var wire = { v: 1, active: {}, order: [] };
      own.forEach(function (p) { if (p.local) return; var i = p.pack.instance; wire.active[i] = meta.active[p.ck] === true; });
      meta.order.forEach(function (ck) { var p = packs[ck]; if (p && p.origin === 'own' && !p.local) wire.order.push(p.pack.instance); });
      return {
        own: own.map(function (p) { return { ck: p.ck, instance: p.pack.instance, packId: p.packId, name: p.pack.name, pack: p.pack, entries: recordCount(p.pack),
                                              synced: p.synced || null, local: p.local || null, home: p.ck === meta.home, updatedAt: p.updatedAt }; }),
        meta: wire, metaSynced: meta.synced || null, home: meta.home,
        removed: clone(removed.rows),                  // R-MSB-23: instance → {ver, h}; device-only, never sent
      };
    }
    // versionPack(packId, v) → the stored pack of that version, or null (the lane's pinned-version send).
    function versionPack(packId, v) {
      return ready().then(function () {
        var k = vkey(packId, v);
        if (hasOwn(versionPacks, k) && versionPacks[k]) return versionPacks[k];
        if (!versionKeys[k]) return null;
        return adapter.get('versions', [packId, v]).then(function (row) { versionPacks[k] = (row && row.pack) || null; return versionPacks[k]; });
      });
    }

    // ── exports ──
    function exportFull(x) {
      return ready().then(function () {
        var ck = ckHere(x), p = packs[ck];
        if (!p) return { ok: false, reasons: ['no-such-pack — ' + x] };
        return { ok: true, packId: p.packId, ck: ck, text: JSON.stringify(p.pack, null, 2) };   // never refused (H7)
      });
    }
    function remapIds(v, from, to) {
      if (typeof v === 'string') return v.indexOf(from) === 0 ? to + v.slice(from.length) : v;
      if (Array.isArray(v)) return v.map(function (x) { return remapIds(x, from, to); });
      if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[remapIds(k, from, to)] = remapIds(v[k], from, to); }); return o; }
      return v;
    }
    // Is the record `id` that ANOTHER collection holds (the target of a foreign redefine) built on a book record?
    // Follows the chain through further foreign redefines; a plain add ends it (no book content). Keyed by ck.
    function bookRooted(sec, id, fromPack, seen) {
      seen = seen || {};
      var ids = Object.keys(packs).filter(function (k) { return k !== fromPack && !seen[k] && isObj(packs[k].pack.sections) && isObj(packs[k].pack.sections[sec]) && hasOwn(packs[k].pack.sections[sec], id); });
      return ids.some(function (k) {
        var F = packs[k].pack.sections[sec][id];
        if (!isObj(F)) return false;
        if (F._mode === 'derive' || hasOwn(F, '_changes') || isObj(F._base)) return true;
        if (isObj(base[sec]) && hasOwn(base[sec], id)) return true;
        var s2 = clone(seen); s2[fromPack] = true;
        return F._mode === 'redefine' && bookRooted(sec, id, k, s2);
      });
    }
    function exportShare(x, o) {
      o = o || {};
      return ready().then(function () {
        var ck = ckHere(x), p = packs[ck];
        if (!p) return { ok: false, reasons: ['no-such-pack — ' + x] };
        var packId = p.packId;
        return ensureRail().then(function (r) {
          if (!r) return { ok: false, reasons: ['rail-unavailable — the schemas could not be read (' + railError + ')'] };
          var a = r.authoring(sourcedPack(p.pack), ctxFor(ck));   // R-M12B-116: as read
          if (!a.ok) return { ok: false, reasons: a.reasons };                       // R-FPA-3
          var warnings = [], t = now();
          var out = { formatVersion: 1, packId: packId, name: p.pack.name, _provenance: 'custom' };
          if (p.pack.attribution) out.attribution = p.pack.attribution;
          if (p.pack.createdAt) out.createdAt = p.pack.createdAt;
          out.updatedAt = p.pack.updatedAt || t;
          out.projection = 'share';
          out.sections = {};
          var leftOut = 0;
          // A share never carries a book record's numbers or text (ruling f100-editor-drc-census-share-copy
          // R-SC-1; f100-editor-contracts-2 R-EC2-2/3): a record anchored to a book record ships as changes
          // plus its anchor, or not at all.
          Object.keys(p.pack.sections).forEach(function (sec) {
            var recs = p.pack.sections[sec];
            if (!isObj(recs) || !Object.keys(recs).length) return;
            out.sections[sec] = {};
            Object.keys(recs).forEach(function (id) {
              var U = recs[id];
              var mode = U._mode || (isObj(base[sec]) && hasOwn(base[sec], id) ? 'redefine' : 'add');
              var bid = baseIdOf(U, id);
              var B = isObj(base[sec]) ? base[sec][bid] : undefined;
              if (isObj(B) && (mode === 'redefine' || mode === 'derive')) {
                var liveRef = BR().baseRef(B);
                // M1's share warning lights only on a changed OWNED field (R-FIEC-3 Q2): a sources-only move is silent
                if (bookChangedOf(sec, id, U, B)) warnings.push(sec + '.' + id + ': base-moved — the book record changed since this edit; the share carries the older values');
                var anchor = {};
                if (mode === 'derive') anchor.id = bid;
                anchor.ref = liveRef; anchor.editedAt = t;
                if (opts.build) anchor.tag = String(opts.build).slice(0, 64);
                anchor.fields = fieldHashes(B);
                // R-FIEC-4: `sources` is never shipped for an anchored record — the receiver's own book supplies it
                out.sections[sec][id] = { _mode: mode, _base: anchor, _changes: diffShare(withoutSources(B), withoutSources(U), 0) };
              } else if (mode === 'derive' || (mode === 'redefine' && isObj(U._base))) {
                // R-EC2-3 / R-SC-3: its book record is not in this app — a whole copy would ship it
                leftOut++;
                warnings.push(sec + '.' + id + ': left-out-base-missing — it is based on a book record this app does not have; left out of the share (the full backup keeps it)');
              } else if (mode === 'redefine' && bookRooted(sec, id, ck)) {
                // R-EC2-3 (C2.3): a redefine of ANOTHER pack's record that is itself built on a book record
                leftOut++;
                warnings.push(sec + '.' + id + ': left-out-foreign-base — it changes another collection\'s record that is built on a book record; left out of the share (the full backup keeps it)');
              } else {
                var whole = {};
                Object.keys(U).forEach(function (k) { if (k.charAt(0) !== '_' || k === '_mode' || k === '_base') whole[k] = clone(U[k]); });
                out.sections[sec][id] = whole;
              }
            });
            if (!Object.keys(out.sections[sec]).length) delete out.sections[sec];
          });
          if (leftOut && !Object.keys(out.sections).length) {
            return { ok: false, reasons: ['nothing-to-share — every record in ' + packId + ' was left out (see warnings)'], warnings: warnings };
          }
          if (packId === MY) {                                                         // H8(a)
            var fresh = o.newPackId || ('shared_' + BR().sha256hex(BR().jcs(out.sections) + t).slice(0, 10));
            if (!PACK_ID_RE.test(fresh) || fresh === MY) return { ok: false, reasons: ['bad-pack-id — ' + fresh] };
            out.sections = remapIds(out.sections, 'custom_my_data_', 'custom_' + fresh + '_');
            out.packId = fresh;
          }
          var envErrs = r.validateEnvelope(out);
          if (envErrs.length) return { ok: false, reasons: envErrs.map(function (e) { return '<share>.' + e.path.join('.') + ': ' + e.message; }) };
          return { ok: true, packId: out.packId, pack: out, text: JSON.stringify(out, null, 2), warnings: warnings };
        });
      });
    }

    // ── reads ──
    function activeStamps() {
      return orderedActive().map(stampOf).filter(Boolean);
    }
    function missingFor(mods) {
      return (mods || []).filter(function (s) { return MODS().isUserStamp(s) && rawForStamp(s) === null; });
    }
    function conflicts() {
      var M = MODS();
      return M.tiesForStamps((M.active ? M.active() : []).concat(activeStamps()));
    }
    // resolveActive(section) — the section's records with every ACTIVE user pack folded over the known
    // pristine base, in layer order (the discovery records a pack manager lists; variants are the
    // funnels' own first layer). {} when that base is not loaded here.
    function resolveActive(section) {
      var M = MODS(), T = M.SECTION_TABLE[section];
      if (!T || !isObj(base[section])) return {};
      var view = {}; view[T.viewKey] = base[section];
      activeStamps().forEach(function (s) { var p = stampSync(s); if (p) view = M.applyOverlay(view, p); });
      return view[T.viewKey];
    }
    // list() — every held collection in layer order (R-SII-11): ck, stamp, packId, name, home, and createdAt (the start date
    // a same-name collision shows, R-MSMG-2), beside what it carried before v2. `local` names the device-local kept state.
    function list() {
      return MODS().orderLayers(Object.keys(packs).map(function (k) { return packs[k]; }), meta.order).map(function (p) {
        return { ck: p.ck, packId: p.packId, origin: p.origin, name: p.pack && p.pack.name, active: meta.active[p.ck] === true,
                 version: p.origin === 'imported' ? packVersionOf(p.pack) : null, records: recordCount(p.pack), stamp: stampOf(p),
                 home: p.ck === meta.home, createdAt: (p.pack && p.pack.createdAt) || p.addedAt || null, local: p.local || null };
      });
    }
    // baseState(section, id, rec) — the record's base state (UD-1 §1.4, extended by R-EC2-2 for a derive):
    // 'custom' | 'base-unchanged' | 'base-moved' | 'base-missing'. A derive is read against `_base.id`.
    function baseState(section, id, rec) {
      if (!isObj(rec)) return null;
      var bid = baseIdOf(rec, id), B = isObj(base[section]) ? base[section][bid] : undefined;
      var anchoredToBook = rec._mode === 'derive' || (isObj(base[section]) && hasOwn(base[section], id)) || isObj(rec._base);
      if (!anchoredToBook) return 'custom';
      if (!isObj(B)) return isObj(rec._base) ? 'base-missing' : 'custom';
      return (isObj(rec._base) && rec._base.ref === BR().baseRef(B)) ? 'base-unchanged' : 'base-moved';
    }
    // split(section, id, rec) → { book, yours, conflict } against the anchor's per-field hashes (R-FIEC-3), or
    // null when the record is not anchored to a book record or the book is not here. `yours` reads the copy as its book would say it.
    function split(section, id, rec) {
      if (!isObj(rec) || !isObj(rec._base)) return null;
      var bid = baseIdOf(rec, id), B = isObj(base[section]) ? base[section][bid] : undefined;
      if (!isObj(B)) return null;
      return anchorSplit(section, id, rec, B);
    }
    // bookChanged(section, id, rec) — THE user-facing "the book changed" signal (F8's mark, M1's share warning):
    // true only when the split finds a changed OWNED field (R-FIEC-3 Q2). An anchor without `fields`: anchorSplit's two cases
    // (ADDENDUM 546 E, replacing the ref test, whose mark had no plate to open). baseRef/baseState are unchanged.
    function bookChanged(section, id, rec) {
      var bid = baseIdOf(rec, id), B = isObj(base[section]) ? base[section][bid] : undefined;
      return isObj(B) ? bookChangedOf(section, id, rec, B) : false;
    }
    // liveOwnSupplier(mods) → (section, id) → the LIVE own-collection stamp in `mods` that this device HOLDS
    // and that supplies that record, or null. R-EC2-6 (i): only such a record is re-projectable; a frozen
    // import never is.
    function liveOwnSupplier(mods) {
      var held = (mods || []).filter(function (s) {
        var ps = MODS().parseUserStamp(s);
        return ps && ps.instance && !ps.version && rawForStamp(s);
      });
      return function (section, id) {
        for (var i = held.length - 1; i >= 0; i--) {
          var raw = rawForStamp(held[i]);
          if (raw && isObj(raw.sections) && isObj(raw.sections[section]) && hasOwn(raw.sections[section], id)) return held[i];
        }
        return null;
      };
    }
    function get(x) { var ck = ckHere(x); return packs[ck] ? clone(packs[ck]) : null; }
    function versions(packId) { return Object.keys(versionKeys).filter(function (k) { return k.split('\u0000')[0] === packId; }).map(function (k) { return k.split('\u0000')[1]; }); }

    var api = {
      ready: ready, reload: reload, status: function () {
        return { persistent: st.persistent, writable: st.writable, reason: st.reason,
                 rail: rail ? 'ok' : (railError ? 'unavailable: ' + railError : 'not-loaded') };
      },
      list: list, get: get, versions: versions, home: function () { return meta.home; },
      receiveOwn: receiveOwn, receiveTombstone: receiveTombstone, syncAgain: syncAgain, clearRemoved: clearRemoved, receiveVersion: receiveVersion, receiveMeta: receiveMeta,
      markSynced: markSynced, syncSnapshot: syncSnapshot, versionPack: versionPack, usedStamps: usedStamps, syncHash: syncHashOf, packVersion: packVersionOf,
      createPack: createPack, renamePack: renamePack, mintId: mintId, saveRecord: saveRecord, deleteRecord: deleteRecord, removePack: removePack,
      setActive: setActive, setOrder: setOrder, importPack: importPack,
      exportFull: exportFull, exportShare: exportShare,
      activeStamps: activeStamps, missingFor: missingFor, conflicts: conflicts, resolveActive: resolveActive,
      baseState: baseState, split: split, bookChanged: bookChanged, liveOwnSupplier: liveOwnSupplier,
      stampSync: stampSync, loadStamp: loadStamp, provideBase: provideBase, ensureRail: ensureRail,
      // F-100 M13 (R-M13L-1): the same rail for a character's own layer, read with every active collection beside it.
      authoringRail: function () { return ensureRail().then(function (r) { return r ? { authoring: r.authoring, ctx: ctxFor(null) } : null; }); },
    };
    return api;
  }

  var exported = {
    DB_NAME: DB_NAME, DB_VERSION: DB_VERSION, EVENT: EVENT, MY_DATA: MY,
    createStore: createStore, memoryAdapter: memoryAdapter, idbAdapter: idbAdapter, autoAdapter: autoAdapter,
    diffShare: function (B, U) { return diffShare(B, U, 0); }, mergePatch: mergePatch, rebuildShare: rebuildShare, p1v: p1v,
    resolveBaseRefs: function (B, P) { return resolveBaseRefs(B, P); },
    fieldHashes: fieldHashes, splitAgainst: splitAgainst, askedFields: askedFields,
    persistableCopy: persistableCopy,   // B-1161 (R-B1161-9): the one persistable copy of a view's record
    // MS (f100-ms-build): the sync base's hash over a WHOLE envelope (R-MSB-9; a rename moves it), the one "used here"
    // walk (R-HSC-13 / R-SII-7, roster + draft), and the v1 → v2 copy (R-SII-2), for the lane, the probes and the guards
    syncHash: function (v) { return hashOf(v); }, usedStamps: usedStamps, upgradeV1: upgradeV1, ckOf: ckOf,
  };

  // ── the browser's one store ──
  if (typeof window !== 'undefined' && root && root === window) {
    var fetchJson = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); }); };
    // C2: one channel per page, named for the database; absent BroadcastChannel → skipped (C1 still holds)
    var channel = null;
    try { if (typeof root.BroadcastChannel === 'function') channel = new root.BroadcastChannel(DB_NAME); } catch (e) { channel = null; }
    var store = createStore({
      adapter: autoAdapter(root.indexedDB || null),
      channel: channel,
      loadSchemas: function () { return PV().fetchSchemas('/schema/'); },
      loadVocab: function () {
        return Promise.all([fetchJson('/public/data/canonical/skills.vocab.json'), fetchJson('/public/data/canonical/qualities.vocab.json')]).then(function (r) {
          return { skills: (r[0].entries || []).map(function (e) { return e.id; }), qualities: (r[1].entries || []).map(function (e) { return e.id; }) };
        });
      },
      broadcast: function (name) { if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent(name)); },
      // R-SII-7: a restore collapses an empty home only when no character or draft here carries home's stamp
      usedStamps: function () { return usedStamps(function (k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }); },
    });
    Object.keys(exported).forEach(function (k) { store[k] = exported[k]; });
    // C2: a tab coming back into view re-reads — it may have missed a message while it was in the background
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'visible') store.reload(); });
    }
    root.SWRPGUserData = store;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
})(typeof window !== 'undefined' ? window : this);
