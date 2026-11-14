/**
 * castStore.js — the custom-NPC persistence core for GM-authored custom NPCs
 * (GM table-mode program, Lap C1; scope gm-lap-c1-cast-store-scope.md).
 *
 * Sibling of benchStore.js and built to the SAME contract discipline (R-NBS1, D-NB1): a versioned
 * envelope, a defensive normalize (garbage / old data → graceful, never throw), pure state-transforms
 * + a thin localStorage edge, dual-export exercised by a Node guard (test/npc_cast_store.cjs).
 *
 * WHERE IT DIFFERS FROM THE BENCH: the bench persists id-refs into the CANONICAL registry (stat block
 * resolves at render). A custom NPC has no canonical record to point at — it IS its own record — so the
 * cast store holds the FULL adversary record. Those records merge into the library pool as first-class
 * citizens (unique `_source_key`), so list / drill / reference / search / the bench all work for free.
 *
 * DURABLE RECORD CONTRACT (the "two-faces" shape, fixed NOW so C2 never migrates):
 *   <all canonical adversary fields, copied verbatim at clone time>
 *   + _provenance: 'custom'
 *   + key / _source_key: 'custom:' + uuid   (unique in the pool; overrides the source's identity)
 *   + card: null | { personality, wants, voice, appearance, secret, hooks }   // the MEET face — C1 is always null; C2 populates
 *   + attachedProfileKey: null | string     // MEET-attach seam — C2
 *   + createdAt / updatedAt
 *
 * Validation posture: normalize-on-read like the bench. Customs are user data — they are NOT run through
 * the canonical registry validator (loud/graceful rule: this is the old-data/user-data path, graceful).
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_npc_cast';
  var SCHEMA_VERSION = 1;

  // The MEET-face keys C2 will populate; C1 always writes card: null. Kept here so normalize can shape
  // a stored card defensively without inventing fields.
  var CARD_KEYS = ['personality', 'wants', 'voice', 'appearance', 'secret', 'hooks'];

  function emptyState() {
    return { version: SCHEMA_VERSION, npcs: [] };
  }

  function newUuid() {
    if (typeof root !== 'undefined' && root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'c' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  }

  function now() { return Date.now(); }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  // ponytail: JSON deep-clone — a GM has a handful of customs, not thousands.

  // Defensive read: any garbage / parse failure / wrong shape → empty (old-data path). A newer future
  // version is tolerated forward — we keep the npcs array if present; v1 has no migrations.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.npcs)) return emptyState();
    var npcs = raw.npcs.map(normalizeNpc).filter(Boolean);
    return { version: SCHEMA_VERSION, npcs: npcs };
  }

  // A custom with no id-ref can't resolve in the pool — drop it (matches the bench's ghost-member rule).
  // Otherwise the full record is preserved verbatim (user data); only the envelope fields are shaped.
  function normalizeNpc(n) {
    if (!n || typeof n !== 'object') return null;
    var sourceKey = n._source_key != null ? String(n._source_key) : (n.key != null ? String(n.key) : null);
    if (!sourceKey) return null;
    var rec = clone(n);
    rec._source_key = sourceKey;
    rec.key = sourceKey;                 // keep key + _source_key identical so key-based lookups are unique too
    rec._provenance = 'custom';
    rec.card = normalizeCard(n.card);
    rec.attachedProfileKey = (typeof n.attachedProfileKey === 'string') ? n.attachedProfileKey : null;
    rec.createdAt = toInt(n.createdAt) || now();
    rec.updatedAt = toInt(n.updatedAt) || rec.createdAt;
    return rec;
  }

  // card is null (C1) or an object of the six string faces; anything else → null. Unknown keys dropped.
  function normalizeCard(card) {
    if (!card || typeof card !== 'object') return null;
    var out = {};
    CARD_KEYS.forEach(function (k) { if (typeof card[k] === 'string') out[k] = card[k]; });
    return out;
  }

  function toInt(n) { n = parseInt(n, 10); return isNaN(n) || n < 0 ? 0 : n; }

  function findNpc(state, key) {
    var k = String(key);
    for (var i = 0; i < state.npcs.length; i++) if (state.npcs[i]._source_key === k) return state.npcs[i];
    return null;
  }

  // ── pure state-transforms (return a NEW state; callers feed it back to React + persist) ──

  // Clone a canonical (or any) NPC record into the cast: copy every field verbatim, then stamp the
  // custom envelope. `name` is the GM's clone-time name (falls back to "<source name> (custom)").
  function cloneFromRecord(state, record, name) {
    var s = clone(state);
    var rec = record ? clone(record) : {};
    var uuid = newUuid();
    var srcName = (record && typeof record.name === 'string' && record.name) || 'NPC';
    rec.name = (name && String(name).trim()) || (srcName + ' (custom)');
    rec._source_key = 'custom:' + uuid;
    rec.key = rec._source_key;
    rec._provenance = 'custom';
    rec.card = null;                     // C1: the MEET face is empty; C2 populates
    rec.attachedProfileKey = null;
    rec.createdAt = now();
    rec.updatedAt = rec.createdAt;
    s.npcs.push(rec);
    return { state: s, key: rec._source_key };
  }

  // Merge a patch onto one custom. C1 uses this only for the name; the general shape (card,
  // attachedProfileKey, any adversary field) is here so C2 needs no store change.
  function updateNpc(state, key, patch) {
    var s = clone(state);
    var rec = findNpc(s, key);
    if (rec && patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (k) {
        if (k === '_source_key' || k === 'key' || k === '_provenance' || k === 'createdAt') return; // identity is immutable
        if (k === 'card') { rec.card = normalizeCard(patch.card); return; }
        rec[k] = clone(patch[k]);
      });
      rec.updatedAt = now();
    }
    return s;
  }

  function deleteNpc(state, key) {
    var s = clone(state);
    var k = String(key);
    s.npcs = s.npcs.filter(function (n) { return n._source_key !== k; });
    return s;
  }

  function getNpc(state, key) { return findNpc(state, key); }

  // ── localStorage edge (browser only; thin, swallows quota/parse failures) ──

  function load() {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return emptyState();
      return normalize(JSON.parse(root.localStorage.getItem(KEY)));
    } catch (e) { return emptyState(); }
  }

  function persist(state) {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return;
      root.localStorage.setItem(KEY, JSON.stringify(normalize(state)));
    } catch (e) { /* quota / private mode — drop the write, keep the app alive */ }
  }

  // ── RECENT (ruling custom-npc-tab-space-triage Addendum 1 §C) ─────────────────────────────────
  //
  // The old HISTORY tab was a dead surface: its list lived in React state (never persisted, so it
  // emptied on every reload) and its ONLY writer was a SAVE control that renders on the phone
  // layout alone — so at desktop the tab could not be filled at all, while its own copy told you to
  // tap a button that was not there. It is repurposed to RECENT: viewing any NPC detail is the
  // write, so it fills itself on every band with no new affordance.
  //
  // SHAPE (papered in the ruling as R-SY4-LITE — deliberately NOT a save-shape): device-local
  // convenience data, `[{ key, viewedAt }]`, newest first, capped at CAP. Losing it costs nothing,
  // which is why it carries no schema version and no migration: a reader that does not recognise an
  // entry DROPS it rather than throwing, and an unknown key resolves to the placeholder idiom at
  // render (the same old-data path the bench takes for a retired _source_key).
  var RECENT_KEY = 'swrpg_npc_recent';
  var RECENT_CAP = 20;

  function normalizeRecent(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(function (e) { return e && typeof e.key === 'string' && e.key; })
      .map(function (e) { return { key: e.key, viewedAt: toInt(e.viewedAt) || 0 }; })
      .slice(0, RECENT_CAP);
  }

  // Most-recent-first, deduped by key: re-viewing an NPC MOVES it to the top rather than adding a
  // second row (a "recent" list that repeats itself is a log, not a shortcut).
  function touchRecent(list, key, at) {
    if (!key) return normalizeRecent(list);
    var rest = normalizeRecent(list).filter(function (e) { return e.key !== key; });
    return [{ key: String(key), viewedAt: toInt(at) || now() }].concat(rest).slice(0, RECENT_CAP);
  }

  function loadRecent() {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return [];
      return normalizeRecent(JSON.parse(root.localStorage.getItem(RECENT_KEY)));
    } catch (e) { return []; }
  }

  function persistRecent(list) {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return;
      root.localStorage.setItem(RECENT_KEY, JSON.stringify(normalizeRecent(list)));
    } catch (e) { /* quota / private mode — a lost convenience list is not worth an error */ }
  }

  function clearRecent() {
    try {
      if (typeof root !== 'undefined' && root.localStorage) root.localStorage.removeItem(RECENT_KEY);
    } catch (e) { /* same */ }
  }

  var api = {
    KEY: KEY,
    RECENT_KEY: RECENT_KEY,
    RECENT_CAP: RECENT_CAP,
    normalizeRecent: normalizeRecent,
    touchRecent: touchRecent,
    loadRecent: loadRecent,
    persistRecent: persistRecent,
    clearRecent: clearRecent,
    SCHEMA_VERSION: SCHEMA_VERSION,
    CARD_KEYS: CARD_KEYS,
    emptyState: emptyState,
    normalize: normalize,
    cloneFromRecord: cloneFromRecord,
    updateNpc: updateNpc,
    deleteNpc: deleteNpc,
    getNpc: getNpc,
    load: load,
    persist: persist,
  };

  if (typeof root !== 'undefined') root.NpcCastStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
