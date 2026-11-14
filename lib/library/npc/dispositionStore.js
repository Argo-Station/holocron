/**
 * dispositionStore.js — THE DISPOSITION, REMEMBERED: one word per NPC (B-863, NPC 2/9).
 *
 * Ruling `npc-library-paper-concept` R-NPC-3 — a DURABLE CONTRACT (R-Y2-1), built exactly as ruled:
 *
 *   localStorage.swrpg_npc_disposition = { "version": 1, "byKey": { "<KEY>": "<disposition>" } }
 *
 *   · <KEY> is the key `npcByKey` uses — `record._source_key || record.key` (the registry's UPPERCASE
 *     `_source_key` for a canon record; a custom's `key`, which castStore keeps equal to its
 *     `_source_key`). NEVER the registry's lowercase `id`: `id ≠ _source_key` on 1,429 of 1,430
 *     records (census §2d's join trap) — `keyOf()` below is the only way a caller should name one.
 *   · The vocabulary is CLOSED: allied · friendly · neutral · suspicious · hostile · enemy — the six ids
 *     of `DISPOSITIONS` (`lib/library/npc/view.jsx`), in that order (`test/npc_disposition_store.cjs`
 *     holds the two lists equal). `neutral` is the DEFAULT and is NOT WRITTEN: setting it deletes the
 *     entry, absence reads as neutral, and a value outside the six is dropped on read.
 *   · No timestamps, no history, no reason — nothing the surface reads is persisted, and nothing it does
 *     not read is. The board draws six pills and the current sentence; that is the whole record.
 *   · Version handling is benchStore's posture, not castStore's: a version-AHEAD file is flagged
 *     `stale` (in memory only), every write is REFUSED at `persist`, and the surface recedes its pills
 *     (opacity .4 / pointer-events none) as the bench's stale board does. Garbage → empty.
 *
 * ONE READER, ONE WRITER, and it is written by BOTH hosts (as `swrpg_npc_recent` is): the stat block on
 * either face reads `read()`, and a pill press on either face writes through `set()` + `persist()`.
 * A legacy cast record that still carries a `disposition` field is INERT — this store is the only
 * reader — and is not migrated.
 *
 * Pure state-transforms + a thin localStorage edge. Dual-export (window.NpcDispositionStore / CommonJS)
 * so the node guard exercises the contract without a browser — benchStore's pattern.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_npc_disposition';
  var SCHEMA_VERSION = 1;
  var VALUES = ['allied', 'friendly', 'neutral', 'suspicious', 'hostile', 'enemy'];
  var DEFAULT = 'neutral';

  function toInt(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
  function isValue(v) { return typeof v === 'string' && VALUES.indexOf(v) !== -1; }

  function emptyState() { return { version: SCHEMA_VERSION, byKey: {} }; }

  // Read tolerance: anything that is not `{ byKey: { string: one-of-the-six } }` degrades to empty,
  // entry by entry. `neutral` entries are dropped (the default is never stored), so a file written by
  // a looser writer still reads as the contract says.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.byKey || typeof raw.byKey !== 'object' || Array.isArray(raw.byKey)) {
      return emptyState();
    }
    var VG = (typeof window !== 'undefined' && window.SWRPGVersionGuard)
      || (typeof root !== 'undefined' && root && root.SWRPGVersionGuard);
    var stale = VG ? VG.isAhead(toInt(raw.version), SCHEMA_VERSION) : toInt(raw.version) > SCHEMA_VERSION;
    var out = emptyState();
    Object.keys(raw.byKey).forEach(function (k) {
      var v = raw.byKey[k];
      if (k && isValue(v) && v !== DEFAULT) out.byKey[k] = v;
    });
    if (stale) out.stale = true;   // in memory only — never written (see persist)
    return out;
  }

  // The key a caller names an NPC by: the one `npcByKey` uses. Never `id`.
  function keyOf(record) {
    if (!record || typeof record !== 'object') return null;
    return record._source_key || record.key || null;
  }

  function read(state, key) {
    var v = state && state.byKey && key ? state.byKey[key] : undefined;
    return isValue(v) ? v : DEFAULT;
  }

  // A pure transform. Refuses (returns the SAME state) on a stale state, an empty key or a value
  // outside the six; `neutral` deletes the entry.
  function set(state, key, value) {
    var s = state && state.byKey ? state : emptyState();
    if (s.stale || !key || !isValue(value)) return s;
    var byKey = {};
    Object.keys(s.byKey).forEach(function (k) { byKey[k] = s.byKey[k]; });
    if (value === DEFAULT) delete byKey[key];
    else byKey[key] = value;
    return { version: SCHEMA_VERSION, byKey: byKey };
  }

  function load() {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return emptyState();
      return normalize(JSON.parse(root.localStorage.getItem(KEY)));
    } catch (e) { return emptyState(); }
  }

  // THE HOLD (benchStore's F-54 posture): a state loaded from a NEWER file is never written back.
  function persist(state) {
    if (!state || state.stale) return false;
    try {
      if (typeof root === 'undefined' || !root.localStorage) return false;
      var n = normalize(state);
      root.localStorage.setItem(KEY, JSON.stringify({ version: SCHEMA_VERSION, byKey: n.byKey }));
      return true;
    } catch (e) { return false; /* quota / private mode — drop the write, keep the app alive */ }
  }

  var api = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    VALUES: VALUES.slice(),
    DEFAULT: DEFAULT,
    emptyState: emptyState,
    normalize: normalize,
    keyOf: keyOf,
    read: read,
    set: set,
    load: load,
    persist: persist,
  };
  if (typeof root !== 'undefined') root.NpcDispositionStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
