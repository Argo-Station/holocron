/**
 * sync.js — the client seam: pull at load, push debounced, and resolve the case where the other
 * device got there first. Ruling `accounts-sync-architecture` §3.3 + `f34-phase-b-scope` F-B1.
 *
 * ONE MODULE, ALL THREE APPS + the launchpad, in the `account.js` idiom — the no-compromise-mirror
 * law. Nothing else in the product talks to `/api/v1/sync`.
 *
 * SHAPE OF THE THING:
 *   adopt()         the first sign-in on a device. Reads local, pulls remote, merges (syncMerge),
 *                   writes the result to localStorage, pushes it up. Returns the conflicts the
 *                   prompt is built from. Runs ONCE per sign-in, not per load.
 *   pull()          fetch every key + version. Steady state, and after any conflict.
 *   push(key)       debounced ~2s, conditional on the version we last saw.
 *
 * IT IS INERT UNTIL SIGNED IN. Logged-out is byte-identical to today: no requests, no writes, no
 * listeners doing anything. That is not a nicety — it is the standing law this whole feature ships
 * under, and the regression battery is the assert.
 *
 * Pure logic + injected edges (fetch / storage / clock), factory-exported for test/sync_seam.cjs,
 * exactly like account.js and sources.js.
 */
(function (root) {
  'use strict';

  var MERGE = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./syncMerge.js') : (root.SWRPGSyncMerge || null);

  // The synced keys, from the merge module so there is ONE list rather than a second copy that
  // drifts. Deliberately not written as a number here: it was "the nine keys" until R-F5-1 made it
  // ten, and a count in a comment is a second copy of the list wearing a disguise.
  function syncedKeys() {
    if (!MERGE) return [];
    return Object.keys(MERGE.LISTS).concat(MERGE.WHOLE).concat([MERGE.TOMBSTONES]);
  }

  // ── THE HOMEBREW PACK LANE's keys (contract `f100-homebrew-sync-contract` R-HSC-1, -4, -11, -15). They are NOT in
  // syncedKeys(): a pack row lives in IndexedDB (lib/shared/userData.js), never in localStorage, so readLocal/writeLocal
  // and the WHOLE/LIST merge never see one. The patterns are the server's (worker/sync.js PACK_KEY_RES).
  var PACK_PREFIX = 'swrpg_user_pack:';
  var PACK_META = 'swrpg_user_pack_meta';
  var PACK_V_PREFIX = 'swrpg_user_pack_v:';
  var PACK_ROW_RE = /^swrpg_user_pack:([0-9a-f]{12})$/;
  var PACK_V_RE = /^swrpg_user_pack_v:([a-z0-9_]{1,64})@([0-9a-f]{12})$/;
  function isPackKey(k) { return PACK_ROW_RE.test(k) || k === PACK_META || PACK_V_RE.test(k); }
  var TOMBSTONE_VALUE = '{"enc":"gone"}';
  // R-HSC-7 / R-MSB-8: the 1,000-entry cap, walked by the client in the user's order, skip-and-continue.
  var PACK_ENTRY_CAP = 1000;

  // makeCompress(g) → { gzip(text) → Promise<base64>, gunzip(base64) → Promise<text> } over the platform's
  // CompressionStream, or null where it is missing — R-MSB-4's browser floor (Safari < 16.4): the lane then sends and
  // receives nothing and every own collection says so. Base64 is built in chunks (a whole collection is megabytes).
  function makeCompress(g) {
    if (!g || typeof g.CompressionStream !== 'function' || typeof g.DecompressionStream !== 'function' || typeof g.Response !== 'function'
      || typeof g.Blob !== 'function' || typeof g.TextEncoder !== 'function' || typeof g.btoa !== 'function' || typeof g.atob !== 'function') return null;
    function b64(bytes) { var out = '', CH = 0x8000; for (var i = 0; i < bytes.length; i += CH) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return g.btoa(out); }
    function unb64(t) { var bin = g.atob(t), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
    return {
      gzip: function (text) {
        var st = new g.Blob([new g.TextEncoder().encode(text)]).stream().pipeThrough(new g.CompressionStream('gzip'));
        return new g.Response(st).arrayBuffer().then(function (ab) { return b64(new Uint8Array(ab)); });
      },
      gunzip: function (t) {
        var st = new g.Blob([unb64(t)]).stream().pipeThrough(new g.DecompressionStream('gzip'));
        return new g.Response(st).text();
      },
    };
  }

  var DEBOUNCE_MS = 2000;
  // C-SC-1: how many times one push may re-merge against a moving server before it gives up and
  // becomes an unsent write. Three, not one: the common case is a single stale version and
  // resolves on the first retry, so a bound of one would surrender the moment two devices merely
  // overlapped. Three tolerates ordinary contention and still terminates.
  var MAX_CONFLICT_PUSHES = 3;

  function createSync(edges) {
    var doFetch = edges.fetch;
    var store = edges.storage;                 // { get(key), set(key, value) } over raw strings
    var now = edges.now || function () { return Date.now(); };
    var schedule = edges.schedule || function (fn, ms) { return setTimeout(fn, ms); };

    // ── ROOM SUSPENSION (HOLOTABLE slice 1, R-RSC-2) ──────────────────────────
    //
    // While this client is IN A ROOM, the Durable Object is authoritative over table state and
    // the bench must not also be pushed to the account: two authorities for one quantity is the
    // defect R-V7S-1 split the stores to avoid. So bench pushes SUSPEND for the duration.
    //
    // DERIVED FROM CONNECTION STATE, NEVER A PERSISTED FLAG — this is a CONTRACT item, not a
    // preference. `inRoom` is a PREDICATE the caller supplies over its live socket; nothing here
    // is written to storage, so there is no flag to be left set by a crash, a closed laptop or a
    // killed tab. A persisted "I am in a room" bit would eventually strand someone's bench
    // offline forever with no way to notice, and the only cure would be a second flag to detect
    // the first one being stale.
    //
    // Absent edge -> never suspended, so every existing caller behaves exactly as before.
    var inRoom = edges.inRoom || function () { return false; };

    // ONLY the bench. The other synced keys are a player's own paper — characters, sources,
    // settings — and a room has no opinion about them, so suspending them would be a bigger
    // outage than the problem. Named as a list because "the bench key" is exactly the kind of
    // thing that becomes two keys later.
    var ROOM_SUSPENDED_KEYS = ['swrpg_npc_bench'];

    function isRoomSuspended(key) {
      if (ROOM_SUSPENDED_KEYS.indexOf(key) === -1) return false;
      // A caller's predicate that throws must not take sync down with it: an unreadable
      // connection state means "not in a room", which fails toward syncing rather than toward
      // silent data loss.
      try { return !!inRoom(); } catch (e) { return false; }
    }

    // THE PACK LANE's edges (R-HSC-15). `packs` is the user-pack store (lib/shared/userData.js) or a getter for it, read
    // LAZILY at call time (the browser's store loads after this file). `compress` is makeCompress()'s pair, or null for
    // R-MSB-4's floor. No `packs` edge → the lane does not exist and this seam is byte-for-byte what it was.
    var packsEdge = edges.packs || null;
    var compress = edges.compress === undefined ? null : edges.compress;
    function packStore() { try { return typeof packsEdge === 'function' ? (packsEdge() || null) : packsEdge; } catch (e) { return null; } }

    var versions = {};        // key -> the server version we last saw
    var lastSent = {};        // key -> the stored string of the value pushNow last PUT
    var adoptSent = null;     // key -> what adopt() pushed, for watch()'s first snapshot (R-B1173C-2)
    var timers = {};          // key -> pending debounce handle
    var unsent = {};          // key -> true while its last push failed to reach the account
    var listeners = [];
    var lastConflicts = [];

    function emit(type, detail) {
      listeners.forEach(function (fn) { try { fn(type, detail); } catch (e) { /* a bad listener cannot break sync */ } });
    }
    function subscribe(fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    }

    function readLocal() {
      var out = {};
      syncedKeys().forEach(function (k) {
        var raw = store.get(k);
        if (raw == null) return;
        try { out[k] = JSON.parse(raw); } catch (e) { /* unreadable local value: leave it out rather than send garbage up */ }
      });
      return out;
    }

    // R-2 (b) (ruling `release-r7-bug-burndown` ADDENDUM 389): THE BASE YIELDS TO THE DATA. A primary write that meets a
    // full store clears the sync base and tries once more; the base is a copy this device can do without (absent = the
    // adoption rule of today), the person's record is not.
    function writeLocal(map) {
      Object.keys(map).forEach(function (k) {
        var raw = JSON.stringify(map[k]);
        try { store.set(k, raw); } catch (e) {
          clearBase();
          try { store.set(k, raw); } catch (e2) { /* quota — see D-B5; the push still carries it up */ }
        }
      });
    }

    // ── THE SYNC BASE (B-1650; brief `release-r7-sync-base-step0` §C, ruled ADDENDUM 389 with R-1 and R-2) ──────────
    //
    // What THIS device last agreed with the account, per record: `swrpg_sync_base_v1` =
    //   { v: 1, uid, keys: { <LIST key>: { <record id>: record }, <WHOLE key>: { '': value } } }
    // Never synced (it is in neither LISTS nor WHOLE, so syncedKeys() never names it), never in a backup (the store
    // class table's CACHE row), never read by the server. The merge reads it to tell a change made on ONE side from a
    // change made on both; without it, a device holding an older copy wins whole and erases the other's edit.
    //
    // Written at two moments only (CONTRACT 3):
    //   W-a  an ADOPTED PULL (adopt, recheck, a 409's body): once the key's local write READS BACK, base := the remote
    //        value for every record not held by an open question (R-1) — the device has seen the account's state, and
    //        its own unpushed changes still read as changed-here against it. Local first, base second: a base advanced
    //        over a failed local write would make the stale copy look like this device's edit.
    //   W-b  an ACCEPTED PUT (200): base := every record of the value that PUT SENT, never the store's current value —
    //        and only when this device's store held that value as it went (pushNow's `heldHere`).
    // Pruned by those writes (a key's map is replaced, a tombstoned id dropped); it SURVIVES sign-out (ADDENDUM 531); refused at a
    // different account (the `uid`), cleared at account deletion (account.js) and on a full store (R-2 (b), above). Off entirely until adopt() names the
    // account (`opts.uid`): with no uid nothing reads or writes it, byte for byte what this seam did before.
    var BASE_KEY = 'swrpg_sync_base_v1';
    var BASE_V = 1;
    // R-2 (a): the base is skipped once the origin's localStorage use would pass this many UTF-16 code units (keys plus
    // values; the unit browsers count the ~5 MB quota in). Measured headroom in the gate.
    var BASE_CEILING = edges.baseCeiling || 3500000;
    var usedUnits = edges.usedUnits || null;   // () -> current localStorage use in code units; absent → no ceiling read
    var uid = null;

    function baseKeys() { return Object.keys(MERGE.LISTS).concat(MERGE.WHOLE); }

    // → { k: { id: record } } for the signed-in account, or null when the base is absent, unreadable, another
    // account's, or a version this build does not know. Null is CONTRACT 4's path: today's adoption rule.
    function readBase() {
      if (uid == null) return null;
      var o = null;
      try { o = JSON.parse(store.get(BASE_KEY)); } catch (e) { o = null; }
      if (!o || typeof o !== 'object' || o.v !== BASE_V || o.uid !== uid || !o.keys || typeof o.keys !== 'object') return null;
      return o.keys;
    }
    function clearBase() {
      try { if (store.remove) store.remove(BASE_KEY); else if (store.get(BASE_KEY) != null) store.set(BASE_KEY, null); }
      catch (e) { /* nothing to free */ }
    }
    // a key's value as { id: record }; a WHOLE key is the one record ''
    function recordsOf(key, value) {
      var out = {};
      var d = MERGE.LISTS[key];
      if (!d) { if (value !== undefined) out[''] = value; return out; }
      d.read(value).forEach(function (rec) {
        var id = rec && rec[d.id];
        if (id != null) out[String(id)] = rec;
      });
      return out;
    }
    // Writes `next` (k -> {id: record} | undefined to drop the key) over the stored base, under R-2 (a)'s ceiling.
    function writeBase(next) {
      if (uid == null) return;
      var keys = readBase() || {};
      var dead = tombstonedIds();
      Object.keys(next).forEach(function (k) {
        if (next[k] === undefined) { delete keys[k]; return; }
        var m = {};
        Object.keys(next[k]).forEach(function (id) { if (!(id && dead[id])) m[id] = next[k][id]; });
        keys[k] = m;
      });
      var env = { v: BASE_V, uid: uid, keys: keys };
      var raw = JSON.stringify(env);
      if (usedUnits) {
        var old = store.get(BASE_KEY);
        var used = 0;
        try { used = usedUnits() - (old == null ? 0 : BASE_KEY.length + old.length); } catch (e) { used = 0; }
        if (used + BASE_KEY.length + raw.length > BASE_CEILING) {
          // past the ceiling the keys just written are absent instead (today's rule for them); the rest stays if it fits
          Object.keys(next).forEach(function (k) { delete keys[k]; });
          raw = JSON.stringify(env);
          if (used + BASE_KEY.length + raw.length > BASE_CEILING) { clearBase(); return; }
        }
      }
      try { store.set(BASE_KEY, raw); } catch (e) { clearBase(); }
    }
    // W-a. `remoteValues` the pulled values; `written` the map just written locally; `held` [{key, id?}] the open
    // questions. A key whose local write did not read back (quota, a room-suspended bench) keeps its old base.
    function baseFromPull(remoteValues, written, held) {
      if (uid == null) return;
      var old = readBase() || {};
      var next = {};
      Object.keys(written).forEach(function (k) {
        if (baseKeys().indexOf(k) === -1) return;
        if (store.get(k) !== JSON.stringify(written[k])) return;
        var heldIds = {}, heldWhole = false;
        (held || []).forEach(function (c) {
          if (!c || c.key !== k) return;
          if (c.kind === 'record' && c.id != null) heldIds[String(c.id)] = true; else heldWhole = true;
        });
        var has = Object.prototype.hasOwnProperty.call(remoteValues, k);
        var m = has ? recordsOf(k, remoteValues[k]) : {};
        var was = old[k] || {};
        if (heldWhole) { next[k] = was; return; }
        Object.keys(heldIds).forEach(function (id) {
          if (Object.prototype.hasOwnProperty.call(was, id)) m[id] = was[id]; else delete m[id];
        });
        next[k] = m;
      });
      if (Object.keys(next).length) writeBase(next);
    }
    // W-b: the value a 200 accepted, exactly as sent
    function baseFromPush(key, sentRaw) {
      if (uid == null || baseKeys().indexOf(key) === -1) return;
      var v;
      try { v = JSON.parse(sentRaw); } catch (e) { return; }
      var next = {};
      next[key] = recordsOf(key, v);
      writeBase(next);
    }

    // R-HSA-2 — THE INBOUND HALF OF THE ROOM SUSPENSION, in ONE place.
    //
    // The outbound half (push / sweep / adopt's push loop) stops us overwriting the ACCOUNT while
    // the Durable Object is authoritative. This is the same defect arriving from the other
    // direction: writing the account's bench INTO local mid-session overwrites the copy the DO is
    // mirroring, and a GM would watch the table change under them because they happened to sign
    // in during a game.
    //
    // It lives here rather than in a caller because there are TWO inbound writers — `adopt()` at
    // first sign-in and `recheck()` on conflict re-entry — and a rule that lives in one caller is
    // a rule the other caller does not have. (The ruling names adopt(); recheck() re-derives from
    // a FRESH pull and writes local, so the rationale covers it identically. Disclosed as a
    // within-contract extension rather than left as a knowing gap.)
    //
    // NOTHING IS STASHED. On room exit `flushRoomSuspension()` pushes local, and if the account
    // moved meanwhile the ordinary version-conditional 409 path re-pulls and re-merges — the same
    // reconciliation every other conflict gets, just later.
    function writeLocalRespectingRoom(map) {
      var allowed = {};
      Object.keys(map).forEach(function (k) {
        if (!isRoomSuspended(k)) allowed[k] = map[k];
      });
      writeLocal(allowed);
    }

    // ── C-CP-1: THE HOLD (ruling f34-conflict-prompt §3a) ─────────────────────
    // A key with an unanswered conflict is NOT pushed. This is a correction, not a feature: the
    // seam used to upload the merge's provisional "kept local" answer immediately, which
    // overwrote the account's copy — so by the time anything could ask a person which version
    // they wanted, the other one was gone from every place a client can reach. Holding the push
    // leaves the account's version intact and pullable, which is what gives the prompt its second
    // option at all.
    //
    // Both paths are held, and the second is the one that is easy to forget: a background sweep
    // seconds later would destroy the alternative just as thoroughly as the adoption push did.
    // ── C-CP-5: DELETION MOOTS THE QUESTION (ruling f34-conflict-prompt-build §3) ────────────
    // The tombstone list is a UNION THAT ONLY GROWS — that is what makes deletions survive
    // adoption (C-B-1), and it means un-deletion cannot be expressed in it at all. So the earlier
    // "choosing your account's copy restores a record you had deleted" was true for exactly one
    // render: the restore landed, and the next merge unioned the tombstone and killed it again.
    // An answer given out loud, undone in silence — the precise failure this whole feature exists
    // to prevent. Reproduced before it was fixed: restore → next sync → the character is gone.
    //
    // Ruled fix, and it SUBTRACTS rather than adds: a deletion closes the question. Deletion is
    // already the most deliberate answer a person can give, and the sheet must not offer to
    // overrule it with a copy that cannot survive. Real un-delete needs tombstone stamps, a
    // fresh-id restore, or the history read path (F-66) — priced as its own feature, not smuggled
    // in behind a prompt button.
    function tombstonedIds() {
      var set = {};
      try {
        var list = JSON.parse(store.get(MERGE.TOMBSTONES));
        (Array.isArray(list) ? list : []).forEach(function (id) { if (id) set[String(id)] = true; });
      } catch (e) { /* unreadable or absent: nothing is tombstoned */ }
      return set;
    }

    // Dropping a question whose record has since been deleted. Runs at the READ points, so a
    // deletion made in another tab or by any code path closes the question without the prompt
    // needing to be told about it.
    function pruneTombstoned() {
      if (!lastConflicts.length) return;
      var dead = tombstonedIds();
      lastConflicts = lastConflicts.filter(function (c) {
        return !(c && c.kind === 'record' && c.id != null && dead[String(c.id)]);
      });
    }

    function isHeld(key) {
      pruneTombstoned();
      for (var i = 0; i < lastConflicts.length; i += 1) {
        if (lastConflicts[i] && lastConflicts[i].key === key) return true;
      }
      return false;
    }

    // ── pull ──────────────────────────────────────────────────────────────────
    // Returns { values, versions }. Never throws: a dead API leaves the app exactly as it was,
    // which is the availability law this feature inherits from the account seam.
    function pull() {
      return Promise.resolve()
        .then(function () { return doFetch('/api/v1/sync', { credentials: 'include' }); })
        .then(function (res) { if (!res || !res.ok) throw new Error('pull_failed'); return res.json(); })
        .then(function (body) {
          var values = {}, vers = {}, packRows = {};
          var keys = (body && body.keys) || {};
          Object.keys(keys).forEach(function (k) {
            // R-HSC-15: a homebrew row is handed to the pack lane as it came (still encoded), never JSON-merged here
            if (isPackKey(k)) { packRows[k] = { value: keys[k].value, version: keys[k].version }; return; }
            vers[k] = keys[k].version;
            try { values[k] = JSON.parse(keys[k].value); } catch (e) { /* skip a payload we cannot read */ }
          });
          versions = vers;
          return { ok: true, values: values, versions: vers, packRows: packRows };
        })
        .catch(function () { return { ok: false, values: {}, versions: {}, packRows: {} }; });
    }

    // ── adopt: the first sign-in on this device ───────────────────────────────
    // B-1183 F2 (R-B1173C-1): local is read AFTER the pull lands, in the same turn that merges and writes it. Read
    // before the pull, a write made while the pull was in flight was left out of the merge and then overwritten by it.
    // `opts.uid` names the signed-in account (account.js); it switches the sync base on (B-1650, §C).
    function adopt(opts) {
      if (opts && opts.uid != null) uid = String(opts.uid);
      return pull().then(function (remote) {
        if (!remote.ok) return { ok: false, conflicts: [] };
        var local = readLocal();
        var result = MERGE.mergeCanon(local, remote.values, readBase(), canonToWrite(local, remote.values));   // B-1650: the base, read in this turn; B-1692: the migrated compare
        // B-1649 (ruling `release-r7-bug-burndown` ADDENDUM 387): the keys this write CHANGES, read before it lands
        var changed = Object.keys(result.merged).filter(function (k) {
          return !isRoomSuspended(k) && store.get(k) !== JSON.stringify(result.merged[k]);
        });
        writeLocalRespectingRoom(result.merged);
        // ...announced AT the write, so an open surface redraws now rather than after the push loop and the pack lane
        // below (measured 1.2 s at fast 3G, 4.1 s at slow 3G, with the store already holding the pulled value).
        // `adopted` keeps its meaning and its time, after the pushes, for every other subscriber.
        if (changed.length) emit('adopt_written', { keys: changed });
        baseFromPull(remote.values, result.merged, result.conflicts);     // W-a, after the write and its redraw (R-1, §E)
        lastConflicts = result.conflicts;
        // Push everything the merge produced, so the account ends up holding the union too —
        // EXCEPT the keys carrying an unanswered question (C-CP-1). Those wait: pushing a
        // provisional answer is what used to destroy the alternative before anyone was asked.
        // R-RSC-2: a suspended key is not pushed here either. NOTE for the gate — `writeLocal`
        // above is the INBOUND half and is deliberately untouched: adopt() is first-sign-in, and
        // signing in for the first time WHILE in a room is a case the room-state contract did
        // not enumerate. Flagged rather than decided here.
        var keys = Object.keys(result.merged).filter(function (k) {
          return !isHeld(k) && !isRoomSuspended(k);
        });
        // B-1183 F1 (R-B1173C-2): what each key's push SENT is what watch() will count as seen. Priming from the store
        // instead recorded a write made during this loop as already sent, so it waited for the key's next change.
        var sent = {};
        return keys.reduce(function (chain, k) {
          return chain.then(function () { return pushNow(k, result.merged[k]); })
            .then(function () { sent[k] = lastSent[k]; });
        }, Promise.resolve()).then(function () {
          adoptSent = sent;
          // the pack lane, after the localStorage half: receive what the account holds, then send (R-HSC-15). Adoption
          // runs on every page load (account.js), which is what R-MSB-9's base is for: a stale device catches up silently.
          return lane(function () { return packReceive(remote.packRows).then(packSend); });
        }).then(function () {
          emit('adopted', { conflicts: lastConflicts });
          return { ok: true, conflicts: lastConflicts };
        });
      });
    }

    // ── push ──────────────────────────────────────────────────────────────────
    // Debounced per key: a burst of edits to one character becomes one request.
    function push(key) {
      if (syncedKeys().indexOf(key) === -1) return;
      if (isHeld(key)) return;                  // C-CP-1, the debounced path
      if (isRoomSuspended(key)) return;         // R-RSC-2 — the DO is authoritative in a room
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = schedule(function () {
        timers[key] = null;
        var raw = store.get(key);
        if (raw == null) return;
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return; }
        pushNow(key, parsed);
      }, DEBOUNCE_MS);
    }

    // THE CONFLICT PATH, and the one place this seam goes beyond what §3.3 spells out.
    //
    // The ruling says a stale writer "loses cleanly, then re-pulls". Read strictly, the refused
    // write is simply discarded — which means a character you created on THIS device in the last
    // two seconds disappears when the pull lands, with nothing in server history (the loser never
    // reached the server, so there is nothing to have replaced). The same ruling's §4 says "no
    // silent merges ever ... and the loser is in history", which that outcome cannot satisfy.
    //
    // So on 409 this re-pulls and re-runs THE SAME adoption merge — the ruled one, with the ruled
    // refusals — then pushes the result. It is not a new policy and not a silent merge: an
    // unresolvable record still surfaces as a conflict, exactly as at adoption. Raised as a gate
    // decision rather than taken quietly, because it is an interpretation, not an instruction.
    // C-SC-1 (ruling f34-phase-b-sync-core §3): the retry is BOUNDED. The line below used to read
    // "retry once with the reconciled value" while recursing without any limit — the comment
    // described a bound that did not exist. In practice each cycle reconciles against the server's
    // current version and converges, but under sustained contention (two devices both writing the
    // same key faster than a round trip) nothing stopped it. Now it gives up after
    // MAX_CONFLICT_PUSHES attempts and hands over to F-B4's "not yet synced" exception, which is
    // the honest state: the merged result is already written LOCALLY, so no work is lost — it
    // simply has not reached the server yet, and the chip says so.
    // B-1167 (ruling b1167-sync-tombstone-hotfix R-B1167-1..4) — THE 409 MERGE SEES BOTH DELETION
    // LISTS. It used to merge the pushed key alone: neither side carried tombstones, so the union
    // put back a character this device had deleted, and writing the whole merged map then replaced
    // this device's deletion list with the merge's empty one. A character ANOTHER device deleted
    // came back too, because the 409 body carries only the pushed key and the server's deletions
    // were never read. Now a LIST key's merge is given this device's stored deletions and the
    // server's (one read of the same GET `pull()` uses — but `versions` is left alone, so the retry
    // stays at the 409's version). An unreadable server read falls back to none: this device's
    // own deletions still hold. A WHOLE key takes no part in deletion, so its 409 neither reads nor
    // writes the list; a 409 on the list itself stays a union, now including what is stored.
    function localTombstones() {
      try {
        var list = JSON.parse(store.get(MERGE.TOMBSTONES));
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    }
    function remoteTombstones() {
      return Promise.resolve()
        .then(function () { return doFetch('/api/v1/sync', { credentials: 'include' }); })
        .then(function (res) { if (!res || !res.ok) throw new Error('pull_failed'); return res.json(); })
        .then(function (body) {
          var row = body && body.keys && body.keys[MERGE.TOMBSTONES];
          var list = row ? JSON.parse(row.value) : [];
          return Array.isArray(list) ? list : [];
        })
        .catch(function () { return []; });
    }
    // The 409's LOCAL side is what the store holds in the turn that merges and writes, as `adopt` and `recheck` read it (R-B1173C-1, -9; ruling
    // `release-r7-bug-burndown` ADDENDUM 518): what the PUT sent is an older copy by then, and merging that steps back whatever was entered while the
    // PUT, or the tombstones' GET below, was out. Nothing stored, or nothing parsable, falls back to what was sent. A refused local write leaves the
    // store older than the send, and the union still holds: every record the send added came from the store or from the account, and both are read here.
    function localAtMerge(key, sent) {
      try {
        var raw = store.get(key);
        var held = raw == null ? null : JSON.parse(raw);
        return held == null ? sent : held;
      } catch (e) { return sent; }
    }
    function conflictSides(key, value, theirs) {
      var r = {};
      r[key] = theirs;
      var isList = Object.prototype.hasOwnProperty.call(MERGE.LISTS, key);
      function sides() {
        var l = {};
        l[key] = localAtMerge(key, value);
        if (isList || key === MERGE.TOMBSTONES) l[MERGE.TOMBSTONES] = localTombstones().concat(key === MERGE.TOMBSTONES && Array.isArray(value) ? value : []);
        return { local: l, remote: r };
      }
      if (!isList) return Promise.resolve(sides());
      return remoteTombstones().then(function (rt) {
        r[MERGE.TOMBSTONES] = rt;
        return sides();
      });
    }
    // Only the pushed key, plus the deletion list when the merge was given one.
    function conflictWrites(key, merged) {
      var out = {};
      out[key] = merged[key];
      if (Object.prototype.hasOwnProperty.call(MERGE.LISTS, key)) out[MERGE.TOMBSTONES] = merged[MERGE.TOMBSTONES];
      return out;
    }

    // `keepalive` is the page-hide's flag (R-B1173C-3): the same PUT, allowed to outlive the page. A 409 re-push is
    // ordinary — by the time its answer arrives the page is either alive (only hidden) or gone.
    function pushNow(key, value, attempt, keepalive) {
      var tries = attempt || 0;
      var raw = JSON.stringify(value);
      lastSent[key] = raw;
      // W-b's condition: the value goes up from THIS DEVICE'S STORE. adopt() pushes the merge even where the local
      // write failed (quota), and a base advanced to a value this device does not hold would read its stale copy as
      // its own edit at the next merge.
      var heldHere = store.get(key) === raw;
      var body = JSON.stringify({ value: raw, version: versions[key] || 0 });
      var init = { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: body };
      if (keepalive) init.keepalive = true;
      return Promise.resolve()
        .then(function () {
          return doFetch('/api/v1/sync/' + encodeURIComponent(key), init);
        })
        .then(function (res) {
          if (!res) throw new Error('no_response');
          if (res.status === 409) {
            return res.json().then(function (b) {
              var theirs;
              try { theirs = JSON.parse(b.current.value); } catch (e) { theirs = null; }
              versions[key] = b.current.version;
              if (theirs == null) return { ok: false, conflict: true };
              return conflictSides(key, value, theirs).then(function (sides) {
                var merged = MERGE.mergeCanon(sides.local, sides.remote, readBase(), canonToWrite(sides.local, sides.remote));   // B-1650, the 409's merge; B-1692
                var writes = conflictWrites(key, merged.merged);
                var before = {};
                Object.keys(writes).forEach(function (k) { before[k] = store.get(k); });
                writeLocal(writes);
                var pulled = {}; pulled[key] = theirs;
                baseFromPull(pulled, writes, merged.conflicts);                 // W-a: the 409's body is an adopted pull
                // B-1650 (ruling release-r7-bug-burndown ADDENDUM 391): a 409 merge now lands the OTHER device's one-sided
                // units in the record this device is editing, so an open surface must redraw BEFORE its next edit — or that
                // edit writes the pre-merge copy back and the push erases the other device's change. The load's signal,
                // `adopt_written` (B-1649), is the one landing signal: emitted here when the merge changed local, before the
                // re-push below.
                var changed = Object.keys(writes).filter(function (k) { return store.get(k) !== before[k]; });
                if (changed.length) emit('adopt_written', { keys: changed, conflict: true });
                if (merged.conflicts.length) {
                  lastConflicts = lastConflicts.concat(merged.conflicts);
                  emit('conflict', { conflicts: merged.conflicts });
                  return { ok: false, conflict: true };
                }
                if (tries + 1 >= MAX_CONFLICT_PUSHES) {
                  // Bound reached. The merge already landed locally above, so this is "unsent",
                  // not "lost" — and it takes the same voice any unsent write takes.
                  unsent[key] = true;
                  emit('push_failed', { key: key, error: 'conflict_retry_exhausted' });
                  return { ok: false, error: 'conflict_retry_exhausted' };
                }
                return pushNow(key, merged.merged[key], tries + 1);
              });
            });
          }
          if (!res.ok) throw new Error('push_failed_' + res.status);
          return res.json().then(function (b) {
            versions[key] = b.version;
            delete unsent[key];
            if (heldHere) baseFromPush(key, raw);                              // W-b: what this PUT sent, accepted
            emit('pushed', { key: key, version: b.version });
            return { ok: true, version: b.version };
          });
        })
        .catch(function (e) {
          // The availability law: a failed push never breaks the app. It DOES get a voice — F-B4's
          // "not yet synced" exception exists for exactly this state, and swallowing it silently is
          // the failure that rule was written against. The page-hide sends it again (R-B1173C-3).
          unsent[key] = true;
          emit('push_failed', { key: key, error: String((e && e.message) || e) });
          return { ok: false, error: String((e && e.message) || e) };
        });
    }

    // ── watch: what actually triggers a push ──────────────────────────────────
    // A SNAPSHOT DIFF, not a hook in every store, and the choice is deliberate.
    //
    // The obvious wiring is to make each store notify sync when it writes. That means editing seven
    // stores plus every ad-hoc `localStorage.setItem` in two 17k-line app files, and the failure
    // mode is silent: one missed call site is one key that stops syncing, with nothing to show for
    // it. This compares every synced key's raw string against what was last pushed, so a write
    // CANNOT be missed no matter who made it or how — and a key registered in syncMerge is swept
    // from that moment with nothing wired here, which is how the map pins joined (R-F5-1).
    //
    // The cost is one string comparison per key on a timer. That is cheaper than being wrong.
    var snapshot = {};
    var watching = null;

    // A key adoption pushed is primed with the value it PUT, not the store's: a write that landed during the push loop
    // then differs from the snapshot and the first sweep sends it (R-B1173C-2). Every other key is primed as before.
    function primeSnapshot() {
      var seen = adoptSent || {};
      adoptSent = null;
      syncedKeys().forEach(function (k) {
        snapshot[k] = Object.prototype.hasOwnProperty.call(seen, k) ? seen[k] : store.get(k);
      });
    }

    function sweep() {
      syncedKeys().forEach(function (k) {
        // C-CP-1, the sweep path — and note it returns BEFORE touching the snapshot. Updating the
        // snapshot here would record the change as "seen" while refusing to send it, so once the
        // question was answered the key would sit unsynced until it happened to change again.
        // Leaving the snapshot stale means the very next sweep after the hold lifts pushes it.
        if (isHeld(k)) return;
        // R-RSC-2, and it returns before the snapshot for the SAME reason the line above does:
        // recording the change as "seen" while refusing to send it would leave the bench
        // unsynced until it happened to change again. A stale snapshot means the first sweep
        // after the room ends carries everything that accumulated during it.
        if (isRoomSuspended(k)) return;
        var raw = store.get(k);
        if (raw === snapshot[k]) return;
        snapshot[k] = raw;
        if (raw != null) push(k);
      });
      // the pack lane rides the same timer: its own diff is each collection against its sync base (R-MSB-9)
      if (packsEdge) lane(packSend);
    }

    // ── the ONE push R-RSC-2 grants at room exit / final close ────────────────
    //
    // Called by the room client when the connection ends — either the user leaves or the last
    // socket closes. Rides `pushNow`, so it is the SAME version-conditional PUT with the SAME
    // 409 re-merge path F-34 already ships (D-SC1 / C-SC-1); this adds no second write path.
    //
    // EXACTLY ONCE, and that takes two deliberate acts: a pending debounce timer from before the
    // room is cleared so it cannot fire a duplicate, and the snapshot is advanced to the value
    // just sent so the next sweep sees no change. Without the second, the stale snapshot that
    // makes suspension safe would immediately re-push everything this call already sent.
    //
    // An unanswered conflict question still outranks it (C-CP-1): a key with an open question
    // waits for the human, room or no room.
    function flushRoomSuspension() {
      return ROOM_SUSPENDED_KEYS.reduce(function (chain, k) {
        return chain.then(function () {
          if (isHeld(k)) return null;
          if (timers[k]) { clearTimeout(timers[k]); timers[k] = null; }
          var raw = store.get(k);
          if (raw == null) return null;
          var parsed;
          try { parsed = JSON.parse(raw); } catch (e) { return null; }
          snapshot[k] = raw;
          return pushNow(k, parsed);
        });
      }, Promise.resolve());
    }

    // ── B-1173 (a): what is pending goes when the page hides (R-B1173C-3) ─────
    //
    // A change waits up to two debounces (the sweep tick, then the key's own) before it is sent, and a reload inside
    // that window dropped it: the next load's adoption then found this device and the account apart with nothing to
    // order them by, and asked "which one do you keep?" about a change that was only ever made here. So on `pagehide`,
    // and on `visibilitychange` to hidden (the edge `onHide` maps both; the last event a phone reliably gives), one
    // sweep catches what changed since the tick, and every key with a pending debounce or a failed push goes AT ONCE.
    //
    // The SAME write path: `pushNow`'s version-conditional PUT, with `keepalive` so the request outlives the page.
    // Each sent key's timer is cleared and its snapshot already holds the sent value, so a second hide event (a
    // reload fires both) or the old timer cannot send it twice. Held keys (C-CP-1) and room-suspended keys (R-RSC-2)
    // stay where they are. Inert signed out: the listener exists only between watch() and unwatch().
    //
    // THE KEEPALIVE BUDGET. Browsers refuse a keepalive request once the page's in-flight keepalive bodies would pass
    // 64 KiB (the Fetch standard's limit; Chromium and Firefox enforce it). The keys are sent smallest first and ride
    // keepalive while their sum stays inside KEEPALIVE_BUDGET — 60 KiB, the 4 KiB under the limit left for anything
    // else on the page that sends at unload. A key past it still goes, by the ordinary fetch, which a closing page
    // may cancel: that is the case the gate measures, not a second path.
    var KEEPALIVE_BUDGET = 60 * 1024;
    var onHide = edges.onHide || null;     // (fn) -> unsubscribe; the browser's pagehide + visibilitychange→hidden
    var hideOff = null;

    function utf8Bytes(s) {
      var n = 0;
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { n += 4; i += 1; }
        else n += 3;
      }
      return n;
    }

    function flushOnHide() {
      sweep();                               // reached only through the listener watch() adds and unwatch() removes
      var out = [];
      syncedKeys().forEach(function (k) {
        if (!timers[k] && !unsent[k]) return;
        if (isHeld(k) || isRoomSuspended(k)) return;
        var raw = store.get(k);
        if (raw == null) return;
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return; }
        if (timers[k]) { clearTimeout(timers[k]); timers[k] = null; }
        delete unsent[k];                    // the sweep above already moved its snapshot to `raw`
        out.push({ key: k, value: parsed, bytes: utf8Bytes(JSON.stringify({ value: raw, version: versions[k] || 0 })) });
      });
      out.sort(function (a, b) { return a.bytes - b.bytes; });
      var spent = 0;
      return Promise.all(out.map(function (s) {
        var keep = spent + s.bytes <= KEEPALIVE_BUDGET;
        if (keep) spent += s.bytes;
        return pushNow(s.key, s.value, 0, keep);
      }));
    }

    function watch(intervalMs) {
      if (watching) return;
      primeSnapshot();
      watching = schedule(function tick() {
        sweep();
        watching = schedule(tick, intervalMs || DEBOUNCE_MS);
      }, intervalMs || DEBOUNCE_MS);
      if (onHide && !hideOff) hideOff = onHide(function () { flushOnHide(); });
    }
    function unwatch() {
      if (watching) { clearTimeout(watching); watching = null; }
      if (hideOff) { try { hideOff(); } catch (e) { /* a bad edge cannot keep sync alive */ } hideOff = null; }
    }

    function conflicts() { pruneTombstoned(); return lastConflicts.slice(); }
    function clearConflicts() { lastConflicts = []; }

    // ── C-CP-3: answering a question ──────────────────────────────────────────
    // The prompt has NO private write path. A resolution is an ordinary local write plus an
    // ordinary push, so every rule that already governs pushes governs this too: version-
    // conditional, re-merging on a 409 per D-SC1, bounded per C-SC-1. Nothing here talks to the
    // server directly and nothing here writes a store the seam does not already write.
    function resolve(conflict, side) {
      if (!conflict || !conflict.key || (side !== 'local' && side !== 'remote')) {
        return Promise.resolve({ ok: false, error: 'bad_choice' });
      }
      var key = conflict.key;
      // R-HSC-14/-15: a collection's answer is written to the store through its commit(), never to localStorage
      if (isPackKey(key)) return resolvePack(conflict, side);
      var chosen = conflict[side];
      var next;
      if (conflict.kind === 'envelope') {
        next = chosen;
      } else {
        var d = MERGE.LISTS[key];
        if (!d) return Promise.resolve({ ok: false, error: 'unknown_key' });
        var raw = store.get(key);
        var env = null;
        try { env = raw == null ? null : JSON.parse(raw); } catch (e) { env = null; }
        // C-CP-5.2 — refuse rather than perform a restore the next merge will undo. A record the
        // person DELETED cannot be brought back by answering "your account": the tombstone union
        // would re-kill it on the next sync, silently. The deletion is itself the answer, so the
        // question closes here instead of being offered a choice it cannot honour.
        if (tombstonedIds()[String(conflict.id)]) {
          lastConflicts = lastConflicts.filter(function (c) {
            return !(c && c.key === conflict.key && c.kind === conflict.kind
                     && String(c.id) === String(conflict.id));
          });
          emit('resolved', { key: key, id: conflict.id, side: 'deleted',
                             remaining: lastConflicts.length });
          return Promise.resolve({ ok: false, error: 'record_deleted',
                                   remaining: lastConflicts.length });
        }
        var list = d.read(env).slice();
        var found = false;
        for (var i = 0; i < list.length; i += 1) {
          if (list[i] && String(list[i][d.id]) === String(conflict.id)) { list[i] = chosen; found = true; break; }
        }
        // Absent-but-not-deleted is still legitimate — e.g. a record this device never had.
        if (!found) list.push(chosen);
        next = d.emit(env, list);
      }
      var m = {}; m[key] = next;
      writeLocal(m);
      // Drop THIS question by identity-of-content, not object identity, so a caller that rebuilt
      // the object still resolves it. A key with two open records stays HELD until both are
      // answered — the hold is per key, the question is per record.
      lastConflicts = lastConflicts.filter(function (c) {
        return !(c && c.key === conflict.key && c.kind === conflict.kind
                 && String(c.id) === String(conflict.id));
      });
      emit('resolved', { key: key, id: conflict.id == null ? null : conflict.id, side: side,
                         remaining: lastConflicts.length });
      if (isHeld(key)) return Promise.resolve({ ok: true, held: true, remaining: lastConflicts.length });
      snapshot[key] = store.get(key);        // this exact value is what we are about to send
      return pushNow(key, next);
    }

    // C-CP-2's re-entry half. On re-open the two sides are re-derived from a FRESH pull rather
    // than replayed from the snapshot taken when the question first arose: the other device may
    // have moved on, and a prompt showing yesterday's versions of today's question is a new lie
    // rather than a fix for the old one. Deliberately does NOT push — this is a look, not an act.
    // R-B1173C-9: adopt()'s order — local is read after the pull lands, in the turn that merges and writes it.
    function recheck() {
      return pull().then(function (remote) {
        if (!remote.ok) return { ok: false, conflicts: conflicts() };
        var local = readLocal();
        var result = MERGE.mergeCanon(local, remote.values, readBase(), canonToWrite(local, remote.values));   // B-1650: the base, read in this turn; B-1692
        writeLocalRespectingRoom(result.merged);
        baseFromPull(remote.values, result.merged, result.conflicts);     // W-a (R-1)
        lastConflicts = result.conflicts;
        return lane(function () { return packReceive(remote.packRows); }).then(function () {
          emit('rechecked', { conflicts: lastConflicts });
          return { ok: true, conflicts: conflicts() };
        });
      });
    }

    // ── B-1692: THE MIGRATED COMPARE, the host's half (ruling `release-r7-bug-burndown` ADDENDUM 484) ─────────────────
    // A host holding a build names its migration here; `fn()` → syncMerge's `canon`, or null while the build is cold. No host, or cold: today's rule.
    // The player app is the one host that names it. GM and dice keep today's rule.
    var canonFn = null;
    function setCanon(fn) { canonFn = typeof fn === 'function' ? fn : null; }
    function canonNow() { try { return canonFn ? canonFn() : null; } catch (e) { return null; } }
    // The canon a merge that writes may use (ADDENDUM 488 R1): the host's one-time backup comes first, of what today's rule would leave. Refused: no canon, so today's rule.
    function canonToWrite(local, remote) {
      var canon = canonNow();
      if (!canon || !canon.backup || !MERGE.canonApplies(local, remote, canon)) return canon;
      return canon.backup(function () { return MERGE.mergeAdoption(local, remote, readBase()).merged[canon.key]; }) ? canon : null;
    }

    // THE HOLD (ADDENDUM 486): the merge never waits, but the sheet does while the host's build is on its way, since the re-compare may close the question.
    // It ends once, three ways: the re-compare ran (the host calls it when the build lands AND when it fails), or the ceiling, since a fetch can hang. `hold_ended` tells the chip.
    var HOLD_CEILING_MS = 30000, holdOver = false, holdArmed = false;
    function endHold() {
      if (holdOver) return;
      holdOver = true;
      emit('hold_ended');
    }
    function promptHeld() {
      if (!canonFn || holdOver || canonNow()) return false;
      if (!holdArmed) { holdArmed = true; schedule(endHold, HOLD_CEILING_MS); }
      return true;
    }

    // Q2 (a), NO WAIT: a merge that ran cold took today's rule, so when the build warms each open question is compared again, and one that no longer
    // stands closes, by C-CP-5's pattern. What is stored NOW is this device's side (syncMerge `mootOf`), so an edit made while it stood is kept or
    // still asks. No new base write: W-b takes the base from the push below. Returns how many closed.
    function recompare() {
      var closed = recompareOpen();
      endHold();
      return closed;
    }
    function recompareOpen() {
      pruneTombstoned();
      var canon = canonNow();
      var d = canon && MERGE.LISTS[canon.key];
      if (!d || isRoomSuspended(canon.key)) return 0;
      var open = lastConflicts.filter(function (c) { return c && c.key === canon.key && c.kind === 'record' && c.id != null; });
      if (!open.length) return 0;
      var env = null;
      try { env = JSON.parse(store.get(canon.key)); } catch (e) { return 0; }
      var list = d.read(env).slice(), base = readBase(), closed = [];
      open.forEach(function (c) {
        for (var i = 0; i < list.length; i += 1) {
          if (!list[i] || String(list[i][d.id]) !== String(c.id)) continue;
          var keep = MERGE.mootOf(c, list[i], base, canon);
          if (keep) { list[i] = keep; closed.push(c); }
          return;
        }
      });
      if (!closed.length) return 0;
      if (canon.backup && !canon.backup(function () { return env; })) return 0;   // ADDENDUM 488 R1: refused, so nothing closes and the questions stand
      var next = d.emit(env, list), m = {};
      m[canon.key] = next;
      writeLocal(m);
      lastConflicts = lastConflicts.filter(function (c) { return closed.indexOf(c) === -1; });
      closed.forEach(function (c) { emit('resolved', { key: canon.key, id: c.id, side: 'moot', remaining: lastConflicts.length }); });
      if (!isHeld(canon.key)) {
        snapshot[canon.key] = store.get(canon.key);
        pushNow(canon.key, next);
      }
      return closed.length;
    }

    // ══ THE PACK LANE (f100-homebrew-sync-contract R-HSC-1..15; card f100-ms-build R-MSB-4, ADDENDUM 1 R-MSB-8/-9) ══
    //
    // ONE ROW PER OWN COLLECTION, `swrpg_user_pack:<instance>`, WHOLE (R-HSC-1), its value the gzip-b64 envelope
    // (R-HSC-2) or the tombstone `{"enc":"gone"}` (R-HSC-13); ONE meta row (R-HSC-4, instances); create-only rows for the
    // versions a character pins (R-HSC-11). The lane reads and writes the store through its own verbs (each a commit(),
    // C1/C2), and a HELD store (status().writable === false) neither receives nor sends (R-HSC-15).
    //
    // HOW A CONFLICT IS TOLD (R-MSB-9): each own row carries the base {ver, h} it last agreed with the server. Local moved
    // = its hash differs from h; remote moved = the row's version differs from ver. Only BOTH moving to different content
    // asks (an `envelope` conflict, the existing prompt, R-HSC-14); a merely stale device receives silently.
    //
    // REFUSALS ARE DATA (gate #1 draws nothing): packState() → { floor, paused: {cause, until?} | null, refused: {ck or
    // version key → 'too_large' | 'over_cap' | 'cap' | 'no-compression' | 'version-mismatch'} }. A 413 is never retried
    // until the content changes; a refusal writes nothing to the store.
    var L = { refused: {}, refusedH: {}, paused: null, floor: false, remote: {}, seen: {}, hmemo: {}, verDone: {}, known: {} };
    var laneChain = Promise.resolve();
    // every lane pass runs one at a time; a failure is a voice (push_failed), never an exception into the app
    function lane(fn) {
      if (!packsEdge) return Promise.resolve();
      laneChain = laneChain.then(fn).catch(function (e) { emit('push_failed', { key: 'swrpg_user_pack', error: String((e && e.message) || e) }); })
        .then(announce);
      return laneChain;
    }
    function packState() {
      var r = {}; Object.keys(L.refused).forEach(function (k) { r[k] = L.refused[k]; });
      return { floor: L.floor, paused: L.paused ? { cause: L.paused.cause, until: L.paused.until || null } : null, refused: r };
    }
    // a lane pass that MOVED packState() says so once (`pack_state`, its new value), so a screen showing F1/F2 re-reads it
    // (stage 2, gate PART 3 §5.3); a pass that moved nothing is silent. The chip reads none of this event.
    var lastPackState = JSON.stringify(packState());
    function announce() {
      var s = packState(), j = JSON.stringify(s);
      if (j === lastPackState) return;
      lastPackState = j;
      emit('pack_state', s);
    }
    function writableStore(S) { try { return !!S && (!S.status || S.status().writable !== false); } catch (e) { return false; } }
    function usedHere(S) { try { return S.usedStamps ? S.usedStamps(function (k) { return store.get(k); }) : []; } catch (e) { return []; } }
    function hashOf(S, v) { return S.syncHash ? S.syncHash(v) : JSON.stringify(v); }
    // the local hash of an own row, remembered while the row is the same object version (a sweep runs every 2 s)
    function localHash(S, o) {
      var at = o.ck + '|' + o.updatedAt + '|' + (o.pack && o.pack.updatedAt) + '|' + o.entries + '|' + (o.pack && o.pack.name);
      var m = L.hmemo[o.ck];
      if (m && m.at === at) return m.h;
      var h = hashOf(S, o.pack);
      L.hmemo[o.ck] = { at: at, h: h };
      return h;
    }
    function flagFloor(S) {
      L.floor = true;
      var snap = S.syncSnapshot ? S.syncSnapshot() : { own: [] };
      (snap.own || []).forEach(function (o) { L.refused[o.ck] = 'no-compression'; });
    }
    function encodePack(pack) {
      return compress.gzip(JSON.stringify(pack)).then(function (b64) { return JSON.stringify({ enc: 'gzip-b64', v: b64 }); });
    }
    // → Promise<{gone:true} | {pack} | null>; an unreadable row is skipped, never thrown
    function decodePack(value) {
      var o = null;
      try { o = JSON.parse(value); } catch (e) { return Promise.resolve(null); }
      if (o && o.enc === 'gone') return Promise.resolve({ gone: true });
      if (!o || o.enc !== 'gzip-b64' || typeof o.v !== 'string') return Promise.resolve(null);
      return Promise.resolve().then(function () { return compress.gunzip(o.v); })
        .then(function (t) { var p = JSON.parse(t); return p && typeof p === 'object' ? { pack: p } : null; })
        .catch(function () { return null; });
    }
    function putPack(key, value, version, entries) {
      return Promise.resolve().then(function () {
        return doFetch('/api/v1/sync/' + encodeURIComponent(key), {
          method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: value, version: version || 0, entries: entries || 0 }),
        });
      }).then(function (res) {
        if (!res) throw new Error('no_response');
        return res.json().catch(function () { return {}; }).then(function (b) {
          var ra = null; try { ra = res.headers && res.headers.get ? res.headers.get('retry-after') : null; } catch (e) { ra = null; }
          return { status: res.status, body: b || {}, retryAfter: ra };
        });
      });
    }
    function findOwn(S, ck) { var snap = S.syncSnapshot(); for (var i = 0; i < snap.own.length; i++) if (snap.own[i].ck === ck) return snap.own[i]; return null; }
    function raisePack(key, o, remotePack, ver) {
      if (isHeld(key)) return;
      var c = { key: key, kind: 'envelope', local: o.pack, remote: remotePack, ck: o.ck, name: o.name, collection: true, remoteVersion: ver };
      lastConflicts = lastConflicts.concat([c]);
      emit('conflict', { conflicts: [c] });
    }

    // ── receive: what the account holds, decided per row by R-MSB-9's table ──
    function decideRow(S, key, row, used) {
      var inst = PACK_ROW_RE.exec(key)[1], ck = 'own:' + inst;
      return decodePack(row.value).then(function (d) {
        if (!d) return null;
        if (isHeld(key)) return null;                                   // an open question keeps both sides as they are
        var o = findOwn(S, ck);
        L.known[key] = { version: row.version, gone: !!d.gone, entries: d.pack ? entriesOf(d.pack) : 0 };
        if (!o) {
          if (d.gone) return S.receiveTombstone(inst, { used: used });    // nothing here to delete; the store says so
          return S.receiveOwn(d.pack, { used: used, ver: row.version });   // only the account has it → receive (R-SII-7 inside)
        }
        if (o.local) return null;                                       // device-local: never synced again (R-HSC-13)
        var base = o.synced, lh = localHash(S, o);
        if (d.gone) {
          if (!base) return null;                                       // a restore (R-HSC-12): the send rewrites the row
          return S.receiveTombstone(inst, { used: used, keep: lh !== base.h });   // an unsynced edit is never deleted
        }
        var rh = hashOf(S, d.pack);
        if (!base) return lh === rh ? S.markSynced(ck, { ver: row.version, h: rh }) : raisePack(key, o, d.pack, row.version);
        var lMoved = lh !== base.h, rMoved = row.version !== base.ver;
        if (!rMoved) return null;                                       // unchanged/unchanged → nothing; moved/unchanged → the send
        if (!lMoved) return S.receiveOwn(d.pack, { used: used, ver: row.version });   // the stale device catches up, silently
        if (lh === rh) return S.markSynced(ck, { ver: row.version, h: rh });          // both moved to the same content
        return raisePack(key, o, d.pack, row.version);                              // both moved, differently → ask (F6)
      });
    }
    // ── R-MSB-23 (FLAG-10): a collection removed HERE, not yet sent — the store's mark (meta 'removed', its synced base
    // {ver, h} at removal), read on every pull BEFORE decideRow, so a reload between the removal and its tombstone never
    // brings it back. For a marked instance's account row:
    //   live at version === ver (nobody moved it) → send the tombstone, conditional on ver, whatever L.seen says; never receive
    //   live at another version (another device edited it after this base) → RECEIVE it and clear: an edit elsewhere is
    //     never deleted by an unsent removal (R-MSB-9's mirror)
    //   a tombstone, or absent → clear
    // The mark is cleared ONLY through the store (clearRemoved, a commit); a failed send keeps it for the next pull.
    function clearMark(S, inst) { return S.clearRemoved ? S.clearRemoved(inst) : Promise.resolve(null); }
    function decideMarked(S, key, row, used, mark) {
      var inst = PACK_ROW_RE.exec(key)[1];
      if (!row || row.value == null) return clearMark(S, inst);                      // absent on the account
      return decodePack(row.value).then(function (d) {
        if (!d) return null;                                            // unreadable: decide nothing, keep the mark
        if (isHeld(key)) return null;                                   // an open question keeps both sides as they are
        if (d.gone) { L.known[key] = { version: row.version, gone: true, entries: 0 }; return clearMark(S, inst); }
        if (row.version !== mark.ver) return decideRow(S, key, row, used).then(function () { return clearMark(S, inst); });
        L.known[key] = { version: row.version, gone: false, entries: entriesOf(d.pack) };
        return putPack(key, TOMBSTONE_VALUE, mark.ver, 0).then(function (r) {
          if (r.status === 200) { L.known[key] = { version: r.body.version, gone: true, entries: 0 }; delete L.seen[inst]; return clearMark(S, inst); }
          if (r.status === 409 && r.body.current) return decideMarked(S, key, r.body.current, used, mark);   // it moved meanwhile: the same rule
          return null;                                                  // not sent: the mark stays
        });
      });
    }
    function entriesOf(pack) {
      var n = 0; var s0 = pack && pack.sections;
      if (s0 && typeof s0 === 'object') Object.keys(s0).forEach(function (k) { if (s0[k] && typeof s0[k] === 'object') n += Object.keys(s0[k]).length; });
      return n;
    }
    function versionMatches(S, pack, v) { try { return !!S.packVersion && S.packVersion(pack) === v; } catch (e) { return false; } }
    function decideVersion(S, key, row) {
      var m = PACK_V_RE.exec(key), packId = m[1], v = m[2];
      L.known[key] = { version: row.version };
      return decodePack(row.value).then(function (d) {
        if (!d || !d.pack) return null;
        var held = (S.versions ? S.versions(packId) : []).indexOf(v) !== -1;
        if (held) {                                                     // R-HSC-11: the row exists — compare, never merge
          if (versionMatches(S, d.pack, v)) { L.verDone[key] = true; delete L.refused[key]; }
          else L.refused[key] = 'version-mismatch';
          return null;
        }
        // the store checks the same equality before storing; its refusal is this lane's to say (R-MSB-17), as above
        return S.receiveVersion(packId, v, d.pack).then(function (r) {
          if (r && r.ok === false && /^version-mismatch/.test(String((r.reasons || [])[0] || ''))) L.refused[key] = 'version-mismatch';
          return r;
        });
      });
    }
    function wireOf(S, snap) {
      // the meta row names only collections the account holds a row for (a base), so a skipped or never-sent one cannot
      // make two devices push meta back and forth
      var synced = {}; snap.own.forEach(function (o) { if (!o.local && o.synced) synced[o.instance] = true; });
      var w = { v: 1, active: {}, order: [] };
      Object.keys(snap.meta.active || {}).forEach(function (i) { if (synced[i]) w.active[i] = snap.meta.active[i]; });
      (snap.meta.order || []).forEach(function (i) { if (synced[i]) w.order.push(i); });
      return w;
    }
    function decideMeta(S, row) {
      L.known[PACK_META] = { version: row.version };
      var m = null; try { m = JSON.parse(row.value); } catch (e) { m = null; }
      if (!m || typeof m !== 'object') return Promise.resolve(null);
      var snap = S.syncSnapshot(), base = snap.metaSynced;
      if (!base) return S.receiveMeta(m, { ver: row.version });        // first meeting: take the account's, the send re-merges
      if (row.version === base.ver) return Promise.resolve(null);
      var lh = hashOf(S, wireOf(S, snap));
      if (lh === base.h) return S.receiveMeta(m, { ver: row.version });
      // both moved: meta is order and switches, not anyone's records — it re-merges without a question (the account's
      // positions for the collections it names; this device's for the rest), and the send pushes the result
      if (lh === hashOf(S, m)) return S.markSynced('meta', { ver: row.version, h: lh });
      return S.receiveMeta(m, { ver: row.version });
    }
    function packReceive(rows) {
      var S = packStore();
      if (!S) return Promise.resolve();
      rows = rows || {};
      return Promise.resolve(S.ready ? S.ready() : null).then(function () {
        if (!compress) { flagFloor(S); return null; }                     // R-MSB-4: receives nothing
        if (!writableStore(S)) return null;                               // R-HSC-15
        L.floor = false;
        var used = usedHere(S);
        var keys = Object.keys(rows);
        var chain = Promise.resolve();
        var marks = (S.syncSnapshot ? S.syncSnapshot().removed : null) || {};     // R-MSB-23: read before decideRow
        keys.filter(function (k) { return PACK_ROW_RE.test(k); }).forEach(function (k) {
          var m = marks[PACK_ROW_RE.exec(k)[1]];
          chain = chain.then(function () { return m ? decideMarked(S, k, rows[k], used, m) : decideRow(S, k, rows[k], used); });
        });
        Object.keys(marks).forEach(function (inst) {                          // the account holds no row for it: nothing to send
          if (!Object.prototype.hasOwnProperty.call(rows, PACK_PREFIX + inst)) chain = chain.then(function () { return clearMark(S, inst); });
        });
        keys.filter(function (k) { return PACK_V_RE.test(k); }).forEach(function (k) { chain = chain.then(function () { return decideVersion(S, k, rows[k]); }); });
        if (rows[PACK_META]) chain = chain.then(function () { return decideMeta(S, rows[PACK_META]); });
        return chain.then(function () { markSeen(S); });
      });
    }
    // the own collections the account holds a live row for: a later absence here means it was REMOVED here (R-HSC-13)
    function markSeen(S) {
      var snap = S.syncSnapshot(), now0 = {};
      snap.own.forEach(function (o) { if (!o.local && L.known[PACK_PREFIX + o.instance] && !L.known[PACK_PREFIX + o.instance].gone) now0[o.instance] = true; });
      L.seen = now0;
    }

    // ── send: every own collection that moved since its base, in order, under the cap; then removals, pins, meta ──
    function pausedFor(growth) {
      if (!L.paused || !growth) return false;
      if (L.paused.cause === 'daily_writes' && L.paused.until && now() >= L.paused.until) { L.paused = null; return false; }
      return true;
    }
    function onRefusal(key, refKey, r, h) {
      if (r.status === 413) { L.refused[refKey] = r.body.error === 'over_cap' ? 'over_cap' : 'too_large'; if (h) L.refusedH[refKey] = h; return true; }
      if (r.status === 503) {
        L.paused = { cause: r.body.cause === 'daily_writes' ? 'daily_writes' : 'storage' };
        if (r.retryAfter && !isNaN(Number(r.retryAfter))) L.paused.until = now() + Number(r.retryAfter) * 1000;
        return true;
      }
      return false;
    }
    function sendRow(S, o, used, walk) {
      var key = PACK_PREFIX + o.instance;
      if (o.local) { delete L.refused[o.ck]; return Promise.resolve(); }      // device-local: never sent (R-HSC-13)
      if (walk.n + o.entries > PACK_ENTRY_CAP) { L.refused[o.ck] = 'cap'; return Promise.resolve(); }   // R-MSB-8: skip, continue
      walk.n += o.entries;
      if (L.refused[o.ck] === 'cap' || L.refused[o.ck] === 'no-compression') delete L.refused[o.ck];
      if (isHeld(key)) return Promise.resolve();
      if (o.home && o.entries === 0 && !o.synced) return Promise.resolve();  // an empty home that never synced has nothing to say
      var h = localHash(S, o);
      if (o.synced && h === o.synced.h) { if (L.refused[o.ck] !== 'cap') delete L.refused[o.ck]; return Promise.resolve(); }
      if (L.refusedH[o.ck] === h) return Promise.resolve();                 // a 413 is not retried until the content changes
      var known = L.known[key];
      var growth = o.entries > (known && !known.gone ? (known.entries || 0) : 0);
      if (pausedFor(growth)) return Promise.resolve();
      var version = o.synced ? o.synced.ver : (known ? known.version : 0);
      return encodePack(o.pack).then(function (value) { return putPack(key, value, version, o.entries); }).then(function (r) {
        if (r.status === 200) {
          delete L.refused[o.ck]; delete L.refusedH[o.ck];
          if (growth && L.paused) L.paused = null;
          L.known[key] = { version: r.body.version, gone: false, entries: o.entries };
          return S.markSynced(o.ck, { ver: r.body.version, h: h });
        }
        if (r.status === 409 && r.body.current) {
          var cur = { value: r.body.current.value, version: r.body.current.version };
          if (cur.value == null) { L.known[key] = { version: cur.version }; return null; }
          return decideRow(S, key, cur, used);                           // the same table, on the row the 409 handed back
        }
        if (!onRefusal(key, o.ck, r, h)) emit('push_failed', { key: key, error: 'push_failed_' + r.status });
        return null;
      });
    }
    function sendTombstones(S) {
      var snap = S.syncSnapshot(), here = {};
      snap.own.forEach(function (o) { here[o.instance] = true; });
      var chain = Promise.resolve();
      Object.keys(L.seen).forEach(function (inst) {
        if (here[inst]) return;
        var key = PACK_PREFIX + inst, known = L.known[key];
        if (!known || known.gone) return;
        chain = chain.then(function () {
          return putPack(key, TOMBSTONE_VALUE, known.version, 0).then(function (r) {
            if (r.status === 200) { L.known[key] = { version: r.body.version, gone: true, entries: 0 }; delete L.seen[inst]; return clearMark(S, inst); }
            else if (r.status === 409 && r.body.current) L.known[key] = { version: r.body.current.version, gone: r.body.current.value === TOMBSTONE_VALUE };
          });
        });
      });
      return chain;
    }
    function sendVersions(S, used, walk) {
      var chain = Promise.resolve();
      used.forEach(function (stamp) {
        var m = /^user:([a-z0-9_]+)@([0-9a-f]{12})$/.exec(stamp);
        if (!m) return;
        var packId = m[1], v = m[2], key = PACK_V_PREFIX + packId + '@' + v;
        if (!PACK_V_RE.test(key) || L.verDone[key] || L.refused[key] === 'version-mismatch') return;
        if ((S.versions ? S.versions(packId) : []).indexOf(v) === -1) return;   // only a version this device holds
        chain = chain.then(function () { return S.versionPack ? S.versionPack(packId, v) : null; }).then(function (pack) {
          if (!pack) return null;
          var n = entriesOf(pack);
          if (walk.n + n > PACK_ENTRY_CAP) { L.refused[key] = 'cap'; return null; }
          walk.n += n;
          if (L.known[key]) { L.verDone[key] = true; return null; }        // already on the account (compared at receipt)
          if (pausedFor(n > 0)) return null;
          return encodePack(pack).then(function (value) { return putPack(key, value, 0, n); }).then(function (r) {
            if (r.status === 200) { L.verDone[key] = true; delete L.refused[key]; L.known[key] = { version: r.body.version }; return null; }
            if (r.status === 409 && r.body.current) {
              return decodePack(r.body.current.value).then(function (d) {
                if (d && d.pack && versionMatches(S, d.pack, v)) { L.verDone[key] = true; delete L.refused[key]; }
                else L.refused[key] = 'version-mismatch';
              });
            }
            if (!onRefusal(key, key, r, null)) emit('push_failed', { key: key, error: 'push_failed_' + r.status });
            return null;
          });
        });
      });
      return chain;
    }
    function sendMeta(S) {
      var snap = S.syncSnapshot(), w = wireOf(S, snap), base = snap.metaSynced, known = L.known[PACK_META];
      if (!w.order.length && !known && !base) return Promise.resolve();
      var h = hashOf(S, w);
      if (base && base.h === h) return Promise.resolve();
      var version = base ? base.ver : (known ? known.version : 0);
      return putPack(PACK_META, JSON.stringify(w), version, 0).then(function (r) {
        if (r.status === 200) { L.known[PACK_META] = { version: r.body.version }; return S.markSynced('meta', { ver: r.body.version, h: h }); }
        if (r.status === 409 && r.body.current && r.body.current.value != null) return decideMeta(S, { value: r.body.current.value, version: r.body.current.version });
        return null;
      });
    }
    var sendAgain = false, sending = false;
    function packSend() {
      var S = packStore();
      if (!S) return Promise.resolve();
      if (sending) { sendAgain = true; return Promise.resolve(); }
      sending = true;
      return Promise.resolve(S.ready ? S.ready() : null).then(function () {
        if (!compress) { flagFloor(S); return null; }                    // R-MSB-4: sends nothing
        if (!writableStore(S)) return null;                              // R-HSC-15
        var used = usedHere(S), walk = { n: 0 }, snap = S.syncSnapshot();
        var chain = Promise.resolve();
        snap.own.forEach(function (o) { chain = chain.then(function () { return sendRow(S, o, used, walk); }); });
        return chain
          .then(function () { return sendTombstones(S); })
          .then(function () { return sendVersions(S, used, walk); })
          .then(function () { return sendMeta(S); })
          .then(function () { markSeen(S); });
      }).then(function () {
        sending = false;
        if (sendAgain) { sendAgain = false; return packSend(); }
        return null;
      }, function (e) { sending = false; throw e; });
    }
    // an answer to a collection's question (R-HSC-14): 'local' pushes this device's copy over the account's version;
    // 'remote' takes the account's copy into the store. Either way the base is written when the write completes.
    function resolvePack(conflict, side) {
      var S = packStore();
      if (!S || !compress) return Promise.resolve({ ok: false, error: 'no_pack_store' });
      var key = conflict.key, drop = function () {
        lastConflicts = lastConflicts.filter(function (c) { return !(c && c.key === key && c.kind === conflict.kind); });
        emit('resolved', { key: key, id: null, side: side, remaining: lastConflicts.length });
      };
      if (side === 'remote') {
        return S.receiveOwn(conflict.remote, { used: usedHere(S), ver: conflict.remoteVersion }).then(function (r) {
          if (r && r.ok === false) return { ok: false, error: 'receive_refused', reasons: r.reasons };
          drop(); return { ok: true, remaining: lastConflicts.length };
        });
      }
      var o = findOwn(S, conflict.ck);
      if (!o) { drop(); return Promise.resolve({ ok: false, error: 'collection_gone' }); }
      var h = localHash(S, o), known = L.known[key];
      var version = known ? known.version : conflict.remoteVersion;
      return encodePack(o.pack).then(function (value) { return putPack(key, value, version, o.entries); }).then(function (r) {
        if (r.status === 200) {
          L.known[key] = { version: r.body.version, gone: false, entries: o.entries };
          drop();
          return S.markSynced(o.ck, { ver: r.body.version, h: h }).then(function () { return { ok: true, remaining: lastConflicts.length }; });
        }
        if (r.status === 409 && r.body.current) { L.known[key] = { version: r.body.current.version }; return { ok: false, conflict: true }; }
        onRefusal(key, o.ck, r, h);
        return { ok: false, error: 'push_failed_' + r.status };
      });
    }

    return {
      adopt: adopt, pull: pull, push: push, pushNow: pushNow,
      watch: watch, unwatch: unwatch, sweep: sweep, primeSnapshot: primeSnapshot,
      subscribe: subscribe, conflicts: conflicts, clearConflicts: clearConflicts,
      resolve: resolve, recheck: recheck, isHeld: isHeld,
      isRoomSuspended: isRoomSuspended, flushRoomSuspension: flushRoomSuspension,
      ROOM_SUSPENDED_KEYS: ROOM_SUSPENDED_KEYS,
      syncedKeys: syncedKeys, DEBOUNCE_MS: DEBOUNCE_MS,
      KEEPALIVE_BUDGET: KEEPALIVE_BUDGET,
      packSend: function () { return lane(packSend); }, packState: packState, isPackKey: isPackKey,
      _versions: function () { return versions; },
      clearBase: clearBase, readBase: readBase, BASE_KEY: BASE_KEY,
      setCanon: setCanon, recompare: recompare, promptHeld: promptHeld, HOLD_CEILING_MS: HOLD_CEILING_MS,
    };
  }

  if (typeof window !== 'undefined') {
    root.SWRPGSync = createSync({
      // HOLOTABLE Stage B wiring — the edge this module was built with a hole for. Stage A's gate
      // recorded it as "no callers yet by design; the room client that supplies them arrives with
      // Stage B", and this is that arrival.
      //
      // READ LAZILY, at CALL time. `roomClient.js` loads AFTER this file in both shells, so a
      // direct reference captured here would be `undefined` forever. Asking the global on each
      // call also means the predicate follows the LIVE session rather than whichever one existed
      // when sync was constructed — which is the connection-scoped derivation R-V7S-1 requires.
      // Absent module -> false, so every existing caller behaves exactly as it did before.
      inRoom: function () {
        var C = root.SWRPGRoomClient;
        return !!(C && C.inRoomNow && C.inRoomNow());
      },
      fetch: function (u, o) { return window.fetch(u, o); },
      // B-1173 (a), R-B1173C-3: the page-hide edge. `pagehide` is the reload and the close; `visibilitychange` to
      // hidden is the tab switch and the phone's app switch, after which a mobile page may be killed with no
      // further event. A reload fires both: the second finds nothing pending.
      onHide: function (fn) {
        var doc = root.document;
        function onPageHide() { fn(); }
        function onVisibility() { if (doc && doc.visibilityState === 'hidden') fn(); }
        root.addEventListener('pagehide', onPageHide);
        if (doc) doc.addEventListener('visibilitychange', onVisibility);
        return function () {
          root.removeEventListener('pagehide', onPageHide);
          if (doc) doc.removeEventListener('visibilitychange', onVisibility);
        };
      },
      // the pack lane (R-HSC-15): the user-pack store, read lazily (userData.js loads after this file), and the
      // platform's gzip — null on a browser without CompressionStream, R-MSB-4's floor
      packs: function () { return root.SWRPGUserData || null; },
      compress: makeCompress(root),
      storage: {
        get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
        // a full store THROWS to the caller (R-2 (b)): sync's writeLocal clears the base and retries once
        set: function (k, v) { window.localStorage.setItem(k, v); },
        remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* nothing to free */ } },
      },
      // R-2 (a): the origin's localStorage use, in the UTF-16 code units the quota counts (keys plus values)
      usedUnits: function () {
        var ls = window.localStorage, n = 0;
        for (var i = 0; i < ls.length; i += 1) { var k = ls.key(i); var v = ls.getItem(k); n += k.length + (v == null ? 0 : v.length); }
        return n;
      },
    });
    root.SWRPGSync.createSync = createSync;
    root.SWRPGSync.makeCompress = makeCompress;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSync: createSync, makeCompress: makeCompress, isPackKey: isPackKey };
})(typeof window !== 'undefined' ? window : this);
