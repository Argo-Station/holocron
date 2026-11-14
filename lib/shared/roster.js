/* lib/shared/roster.js — THE SAVED-CHARACTER ROSTER: its storage, its envelope, its tombstones, and its one write.
 *
 * Lifted WHOLE and VERBATIM from player/app.jsx's ROSTER PERSISTENCE block (ruling
 * `shipyard-cargo-build-gm-seam-census` R-SCGS-1, on the census brief of the same stem). Every body below
 * is the player's own at the lap's cut `f6974f35f`, re-indented for this wrapper and nothing else;
 * scripts/roster_lift_verbatim.py proves it. The player keeps its names as aliases of these.
 *
 * WHY A SHARED MODULE: the GM's LOAD FROM and UNLOAD (SHIP CARGO, R-SCW-1) write a character, and a
 * character has one write path. A copy in gm/ would be a second one, with its own F-54 hold, XP repair,
 * portrait fold, `order` and `lastOpenedAt` to keep in step. `_rosterStale` therefore has one home here.
 *
 * ONE ADDITION: `writeEquipment(charId, nextEquipment) → list | null`, the equipment write any host makes. It
 * reads the STORED record at write time, never a host's rendered copy, and answers null when the character
 * is not stored or the roster is stale (F-54: nothing was written). A SECOND, in its idiom: `addXp(charId, amount)`,
 * a campaign's XP award (ruling `encounters-e6-plumbing` ADDENDUM 1, P4.1).
 *
 * THE STORED BYTES DO NOT CHANGE (R-Y2-1): the keys, the `{ version, characters }` envelope and its version
 * are the player's. There is no new save shape.
 *
 * Classic script → window.SWRPGRoster. Globals (SWRPGVersionGuard, CharResolve, SWRPGRecordPortrait,
 * localStorage) are read at call time, so load order among the deferred scripts only needs it before the
 * app bundle. The wrapper takes no `window` parameter on purpose: the bodies name the real global, as they
 * did in app.jsx, and a compiler cannot rename it (esbuild renames a shadowing parameter, and a guard that
 * slices a body by name would then read `window2`). Node: run it in a vm context holding `window` and
 * `localStorage`; each run is a fresh module with its own `_rosterStale` (test/roster_store.cjs).
 */
(function () {
  'use strict';

  const ROSTER_STORAGE_KEY = 'swrpg_saved_characters';

  // F-B3 (ruling `f34-phase-b-scope` §5) — THE ROSTER GAINS A VERSIONED ENVELOPE, and it had to
  // happen BEFORE sync ships. Until Phase B the roster was the one store with no way to tell which
  // era of the app wrote it: migrations were shape-sniffing (the legacy lift below). With one device
  // that was survivable. With two devices on different builds — the normal case once characters sync
  // — an older tab would pull a newer roster, render what it understood, and strip the rest on its
  // next write. Silently, on the single most important thing the product holds.
  //
  // Persisted shape is now `{ version, characters[] }`. A BARE ARRAY is still read forever (that is
  // every existing user's data, and C-B-5 requires the migration be non-destructive): it is treated
  // as version 0 and re-emitted as an envelope on the next write — in place, idempotent, no record
  // dropped, no write forced on load.
  const ROSTER_SCHEMA_VERSION = 1;
  const ROSTER_BACKUP = 'swrpg_saved_characters_pre3b';

  // F-54 sentinel state. The roster's API is "return an array" + "write an array", so unlike
  // vesselStore — which rides the flag on a state object it hands back — the hold lives at module
  // scope, set by the last read and consulted by every write. Same rule, same seam count: ONE.
  let _rosterStale = false;

  function loadSavedCharacters() {
    try {
      var raw = localStorage.getItem(ROSTER_STORAGE_KEY);
      if (!raw) { _rosterStale = false; return []; }
      var stored = JSON.parse(raw);
      // Accept BOTH shapes: the legacy bare array (version 0) and the envelope.
      var parsed, rawV;
      if (Array.isArray(stored)) { parsed = stored; rawV = 0; }
      else if (stored && Array.isArray(stored.characters)) { parsed = stored.characters; rawV = stored.version; }
      else { _rosterStale = false; return []; }
      // Compare the RAW stored version, before any migration below touches the records — the
      // comparison must be against what the file actually says (vesselStore's ratified semantics).
      _rosterStale = window.SWRPGVersionGuard
        ? window.SWRPGVersionGuard.isAhead(rawV, ROSTER_SCHEMA_VERSION)
        : false;
      // Self-heal legacy double-nested records (vet-r1 P0): older builds wrote
      // record.sheetData = the outer /api/party object, which itself carried a
      // .sheetData with the real sheet. The outer ALSO carries some stat fields
      // (characteristics/wounds/etc.) so we can't gate on !sd.characteristics —
      // any time we find sd.sheetData with its own characteristics, lift.
      var migrated = false;
      parsed.forEach(function(rec) { if (liftNested(rec)) migrated = true; });
      // B-250 / R-B250-1 — repair a NaN-poisoned XP budget HERE, at the one seam every reader passes
      // through, rather than at the six `setSheetData(rec.sheetData)` call sites. Patching those
      // would rebuild the "ever-growing list of places that must remember" that C-GFB-5's autosave
      // comment describes as the defect, not the fix.
      // Guarded like every other CharResolve read in this file: loadSavedCharacters is on the app's
      // critical path, and a throw here loses the whole roster — a worse failure than skipping a
      // repair for one load. If the core has not landed yet the next load repairs it.
      var _repair = window.CharResolve && window.CharResolve.repairPoisonedXp;
      if (_repair) parsed.forEach(function(rec) {
        var sd = rec && rec.sheetData;
        if (!sd) return;
        var fix = _repair(sd.xp);
        if (!fix.repaired) return;
        sd.xp = fix.xp;
        // The MARKER (R-B250-3). Its whole job is to let the notice survive past the repair moment —
        // the repair happens once, invisibly, and without this the player would never learn their
        // budget was zeroed. Dismissal DELETES the field (below), so the notice cannot become
        // permanent furniture on a character whose owner has read it.
        sd._xpRepairedAt = Date.now();
        migrated = true;              // `updatedAt` stays: a repair is not an edit (ADDENDUM 453)
      });
      if (migrated) writeSavedCharacters(parsed);
      return parsed;
    } catch (e) { _rosterStale = false; return []; }
  }

  function liftNested(rec) {
    var sd = rec && rec.sheetData;
    if (!(sd && sd.sheetData && sd.sheetData.characteristics)) return false;
    rec.sheetData = sd.sheetData;
    return true;   // A repair is not an edit: `updatedAt` stays (ADDENDUM 453, superseding C-B-8.1 here).
  }

  // B-1692 (ruling `release-r7-bug-burndown` ADDENDUM 484): a record as the load would leave it, on a COPY, for the sync merge's compare: the lift and
  // the migration, the deterministic seams. The B-250 repair is left out: its marker is a clock, and hiding a marker from a compare is a second rule.
  function canonRecord(rec, charbuild) {
    var copy = JSON.parse(JSON.stringify(rec));
    liftNested(copy);
    window.CharResolve.migrateRoster([copy], charbuild);
    return copy;
  }

  // D-3B4 condition 2's one-time snapshot, its one home (ADDENDUM 488 R1): before the first rewrite to the migrated form, so a wrong match is recoverable.
  // `raw` defaults to the roster as stored. → false: refused, and the caller must not write the migrated form. A snapshot already held is never updated.
  function backupRoster(raw) {
    try {
      if (!localStorage.getItem(ROSTER_BACKUP)) {
        var value = raw === undefined ? localStorage.getItem(ROSTER_STORAGE_KEY) : raw;
        if (value) localStorage.setItem(ROSTER_BACKUP, value);
      }
      return true;
    } catch (e) { return false; }
  }

  // B-1692: what sync's merge compares with. `backup(landing)`, before a write under this canon: `landing()` is the roster today's rule would leave, which is what the mount's
  // path would have snapshotted. No form changes in it: nothing to take. → false: refused, so that merge takes today's rule.
  function canonFor(charbuild) {
    return {
      key: ROSTER_STORAGE_KEY, ver: ROSTER_SCHEMA_VERSION,
      record: function (rec) { return canonRecord(rec, charbuild); },
      backup: function (landing) {
        try { if (localStorage.getItem(ROSTER_BACKUP)) return true; } catch (e) { return false; }
        var value = landing();
        var list = Array.isArray(value) ? value : (value && value.characters) || [];
        var changes = list.some(function (rec) {
          try { return rec && JSON.stringify(canonRecord(rec, charbuild)) !== JSON.stringify(rec); } catch (e) { return false; }   // one its migration cannot read stays as it is, as syncMerge's canonOf
        });
        return changes ? backupRoster(JSON.stringify(value)) : true;
      },
    };
  }

  function writeSavedCharacters(list) {
    // F-54: a stale roster is NEVER written back. Returning early here — at the one seam every
    // caller passes through — is what stops an older tab downgrading a newer save. There is no
    // second place to forget.
    if (_rosterStale) return;
    try {
      localStorage.setItem(ROSTER_STORAGE_KEY,
        JSON.stringify({ version: ROSTER_SCHEMA_VERSION, characters: list }));
    } catch (e) {
      // D-B5 / R-B-2: quota or private mode — drop the write and keep the app alive, the same
      // deliberate choice the shared stores document. It was a defensible trade while this data
      // lived only here; once the roster syncs, a device that believes it saved while the server
      // never hears is the failure mode, and Phase B's "not yet synced" exception is where that
      // gets a voice. Named here rather than left as a bare catch so the next reader knows it is
      // a choice and not an oversight.
    }
  }

  // ── Tombstones ────────────────────────────────────────────────────────
  // When a user deletes a character locally, we record the id here as a
  // client-side soft-delete so a stale record can't resurrect it on reload.
  // Re-creating a character with the same id clears the tombstone.
  const DELETED_IDS_KEY = 'swrpg_deleted_ids';
  function loadDeletedIds() {
    try {
      var raw = localStorage.getItem(DELETED_IDS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeDeletedIds(ids) {
    try { localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(ids)); } catch (e) {}
  }
  function addDeletedId(id) {
    if (!id) return;
    var ids = loadDeletedIds();
    if (ids.indexOf(id) === -1) {
      ids.push(id);
      writeDeletedIds(ids);
    }
  }
  function clearDeletedId(id) {
    if (!id) return;
    var ids = loadDeletedIds().filter(function(x) { return x !== id; });
    writeDeletedIds(ids);
  }

  function upsertSavedCharacter(selectedChar, sheetData, source) {
    var list = loadSavedCharacters();
    var now = Date.now();
    var id = selectedChar.id || ('char-' + now);
    // B-931 (ruling `paper-b931` R-PB9-1/5) — THE PICTURE IS STORED ONCE, at `sheetData.portrait`. Fold the copies
    // this write was HANDED first (SC, then SD — `recordPortraitOf`'s order), then write SD and drop
    // `selectedChar.portrait` and the record-level `portrait`, in this one upsert. Only what the caller hands in is
    // folded, never the stored record: a removal must not come back from a legacy copy the write is replacing.
    // Not in `writeSavedCharacters` and not at load (R-PB9-3/5) — a record shrinks on its owner's own write.
    var _pic = window.SWRPGRecordPortrait.foldRecordPortrait({ selectedChar: selectedChar, sheetData: sheetData });
    selectedChar = _pic.selectedChar || selectedChar;
    sheetData = _pic.sheetData;
    var existing = list.findIndex(function(c) { return c.id === id; });
    var record = {
      id: id,
      name: selectedChar.name || (sheetData && sheetData.name) || 'Unnamed',
      species: selectedChar.species || (sheetData && sheetData.species) || '',
      career: selectedChar.career || (sheetData && sheetData.career) || '',
      book: selectedChar.book || '',
      accent: selectedChar.accent || '#F5C842',
      source: source || 'unknown',
      selectedChar: selectedChar,
      sheetData: sheetData,
      savedAt: existing >= 0 ? (list[existing].savedAt || now) : now,
      updatedAt: now,
    };
    // B-649 / R-LFM-12 — `order`, THE ARRANGED POSITION, across a write that REBUILDS the record.
    // Two facts make this three lines instead of none: the record above is built fresh from
    // `selectedChar` + `sheetData` (it carries no unknown fields forward), and EVERY sheet edit passes
    // through here. Without the first branch a player's arrangement would be wiped by the next
    // autosave of the character they arranged.
    //   · an EXISTING record keeps the order it has;
    //   · a NEW character APPENDS (max + 1), and ONLY on a roster that already carries the field — a
    //     roster never arranged stays orderless, so `ldOrdered` keeps today's last-opened sort rather
    //     than switching every reader onto a field the player never set.
    var _ordMax = -1, _ordAny = false;
    list.forEach(function(c) {
      if (c && typeof c.order === 'number' && isFinite(c.order)) {
        _ordAny = true;
        if (c.order > _ordMax) _ordMax = c.order;
      }
    });
    if (existing >= 0) {
      if (typeof list[existing].order === 'number') record.order = list[existing].order;
      // B-407 / concept Addendum 18 — `lastOpenedAt` RIDES THE REBUILD for exactly the reason `order`
      // does. The record above is built fresh and carries no unknown field forward, so every sheet
      // edit dropped the stamp the openers write (`openSheetRecord`), and the landing's three-field
      // sort fell back to `updatedAt` — which a background autosave moves, so "last opened" started
      // meaning "last written". One line, the same shape as the line above it.
      if (list[existing].lastOpenedAt) record.lastOpenedAt = list[existing].lastOpenedAt;
    } else if (_ordAny) {
      record.order = _ordMax + 1;
    }
    if (existing >= 0) list[existing] = record; else list.push(record);
    writeSavedCharacters(list);
    // Clear any tombstone for this id — user is explicitly re-creating.
    clearDeletedId(id);
    return list;
  }

  // B-931 (ruling `paper-b931` R-PB9-4/5) — what an opener puts in STATE for a stored record: its `selectedChar` (or
  // one rebuilt from the record's top level when it has none, census W13) and its sheet, with the picture folded into
  // the sheet and taken off `selectedChar`. State only — opening writes nothing (R-PB9-3). Every sheet edit then
  // starts from the one-copy shape, so no write can carry a legacy copy forward or bring a removed picture back.
  function openedPairOf(rec) {
    var sc = rec.selectedChar || { id: rec.id, name: rec.name, species: rec.species, career: rec.career, book: rec.book, accent: rec.accent };
    return window.SWRPGRecordPortrait.foldRecordPortrait({ portrait: rec.portrait, selectedChar: sc, sheetData: rec.sheetData || null });
  }

  function removeSavedCharacter(id) {
    var list = loadSavedCharacters().filter(function(c) { return c.id !== id; });
    writeSavedCharacters(list);
    // Tombstone the id so a stale record can't resurrect it.
    addDeletedId(id);
    return list;
  }

  function findCharById(savedChars, id) {
    if (!savedChars || !id) return null;
    for (var i = 0; i < savedChars.length; i++) {
      if (savedChars[i].id === id) return savedChars[i];
    }
    return null;
  }

  // SHIP CARGO Part B (ruling `shipyard-cargo-build-gm-seam-census` R-SCGS-1) — THE EQUIPMENT WRITE, for any host.
  // `handleStoreFinalize`'s steps (find → open → upsert), with its base moved from the host's rendered `savedChars`
  // to the STORED record, read here at write time: a second tab's write since that render is the base, not undone.
  // Null when the character is not stored, or when the roster is stale (F-54 holds the write, so nothing changed).
  function writeEquipment(charId, nextEquipment) {
    var rec = findCharById(loadSavedCharacters(), charId);
    if (!rec || _rosterStale) return null;
    var opened = openedPairOf(rec);
    var nextSheet = Object.assign({}, opened.sheetData, { equipment: nextEquipment });
    return upsertSavedCharacter(opened.selectedChar, nextSheet, rec.source || 'unknown');
  }

  // E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, P4.1) — THE XP AWARD, for any host: what a campaign's ADD
  // writes when the player takes a GM's offer. writeEquipment's idiom (find → open → upsert on the STORED record) and the
  // sheet's own award arithmetic (`setAvailableXp`): `total` and `remaining` rise by `amount`, `spent` is untouched (an
  // absent `remaining` reads total − spent, as the sheet reads it). The write is READ BACK, as partyStore's writeSheetDuty
  // does. Null, with nothing written, when the amount is not a positive integer, the character is not stored, or the
  // roster is stale (F-54); null too when the read-back does not hold the award. Otherwise the list.
  function addXp(charId, amount) {
    var n = Number(amount);
    if (!isFinite(n) || n < 1 || Math.floor(n) !== n) return null;
    var rec = findCharById(loadSavedCharacters(), charId);
    if (_rosterStale || !rec) return null;
    var opened = openedPairOf(rec);
    var xp = (opened.sheetData && opened.sheetData.xp) || {};
    var total = Number(xp.total) || 0, spent = Number(xp.spent) || 0;
    var left = xp.remaining != null ? (Number(xp.remaining) || 0) : total - spent;
    var nextXp = Object.assign({}, xp, { total: total + n, spent: spent, remaining: left + n });
    var list = upsertSavedCharacter(opened.selectedChar, Object.assign({}, opened.sheetData, { xp: nextXp }), rec.source || 'unknown');
    var back = findCharById(loadSavedCharacters(), charId), bx = back && back.sheetData && back.sheetData.xp;
    return bx && bx.total === nextXp.total && bx.remaining === nextXp.remaining ? list : null;
  }

  window.SWRPGRoster = {
    ROSTER_STORAGE_KEY: ROSTER_STORAGE_KEY,
    ROSTER_SCHEMA_VERSION: ROSTER_SCHEMA_VERSION,
    DELETED_IDS_KEY: DELETED_IDS_KEY,
    loadSavedCharacters: loadSavedCharacters,
    writeSavedCharacters: writeSavedCharacters,
    canonRecord: canonRecord,
    canonFor: canonFor,
    backupRoster: backupRoster,
    upsertSavedCharacter: upsertSavedCharacter,
    removeSavedCharacter: removeSavedCharacter,
    openedPairOf: openedPairOf,
    findCharById: findCharById,
    loadDeletedIds: loadDeletedIds,
    writeDeletedIds: writeDeletedIds,
    addDeletedId: addDeletedId,
    clearDeletedId: clearDeletedId,
    writeEquipment: writeEquipment,
    addXp: addXp,
  };
})();
