/**
 * versionGuard.js — THE VERSION-AHEAD SENTINEL, in one place (F-54; ruling `f54-downgrade-prompt`,
 * lifted here by `f34-phase-b-scope` C-B-6).
 *
 * THE HAZARD, stated once so no consumer has to re-derive it: a tab running an OLD build opens a
 * save written by a NEWER build. It renders what it understands — and the moment it writes, every
 * field it did not understand is gone. Silently. A GM loses the ships and crew they just assigned
 * and nothing anywhere reports an error.
 *
 * THE RULE: a save whose version is AHEAD of the running build is FLAGGED, never silently accepted,
 * and is NEVER WRITTEN BACK. Records still normalize for DISPLAY — a stale tab shows the data
 * read-only rather than blank, because blanking it looks exactly like losing it.
 *
 * WHY THIS FILE EXISTS. `vesselStore` and `benchStore` each implemented this correctly and
 * independently. Phase B adds a third consumer (the character roster), and cross-device sync is
 * precisely when the hazard stops being theoretical: two devices on different builds is the normal
 * case, not the edge case. Three divergent copies of a rule this sharp is the defect class this
 * repo has already paid for more than once (ADR 0025's eight text matchers), so the comparison and
 * the write-hold live here and the stores keep only their own shapes.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: own the envelope. Each store keeps its own field names
 * (`{v, vessels}`, `{version, groups}`, `{version, characters}`) and its own migrations. This is
 * the *decision*, not the storage.
 */
(function (root) {
  'use strict';

  // Coerce defensively and treat anything that is not a finite number as NOT AHEAD.
  //
  // That default matters and it is deliberate: an unversioned legacy save (no field at all) must
  // read as "older or equal", never as ahead — otherwise the sentinel would lock every legacy user
  // out of writing, which is the opposite of the protection. It also preserves both existing
  // callers' behaviour exactly: benchStore coerced a missing version toward 0, vesselStore
  // defaulted it to its own SCHEMA_V, and both therefore concluded "not stale".
  function isAhead(rawVersion, schemaVersion) {
    var v = typeof rawVersion === 'number' ? rawVersion : parseInt(rawVersion, 10);
    if (!isFinite(v)) return false;
    return v > schemaVersion;
  }

  // The write-hold, as a named predicate rather than an inline `if` in each store. Callers return
  // their state untouched when this is true — the hold belongs at the ONE seam every write passes
  // through, not scattered across the controls that call it.
  function blocked(state) {
    return !!(state && state.stale);
  }

  // ── B-263 — THE CHARACTER-SAVE ENVELOPE, READ AT LAST ──────────────────────────────────────
  //
  // `player/app.jsx` stamps every exported character with
  //     { schema: 'swrpg-character-sheet', schema_version: 1, ... }
  // and NOTHING has ever read either field back. The one version field whose whole job is to
  // protect a USER'S OWN FILE was inert: a save written by a future build would be accepted and
  // rendered by whatever the running build happened to understand.
  //
  // This is the reader. It reuses `isAhead` rather than comparing versions a second time — the
  // same no-compromise-mirror reason this file exists at all.
  //
  // WHAT IT REFUSES, and why each is a refusal rather than a shrug:
  //   wrong/absent `schema`  — this is not one of our saves; guessing at a stranger's file is how
  //                            you overwrite someone's roster with a parse of their tax return.
  //   version AHEAD          — the F-54 hazard exactly: render what you understand, write back,
  //                            and everything you did not understand is gone.
  //   version older/equal    — ACCEPTED. Old saves must keep opening; that is the point.
  //   version missing        — ACCEPTED as legacy, consistent with `isAhead`'s deliberate default.
  //
  // NO CONSUMER YET, and that is stated rather than implied: the app exports these files and has
  // no import path at all. This exists so the FIRST import cannot be written without a gate, and
  // so the refusal is decided once, here, rather than improvised at the call site.
  var CHARACTER_SAVE_SCHEMA = 'swrpg-character-sheet';
  var CHARACTER_SAVE_VERSION = 1;

  function readCharacterSave(payload, buildVersion) {
    var want = typeof buildVersion === 'number' ? buildVersion : CHARACTER_SAVE_VERSION;
    if (!payload || typeof payload !== 'object') {
      return { ok: false, reason: 'not-a-save', message: 'This file is not a character save.' };
    }
    if (payload.schema !== CHARACTER_SAVE_SCHEMA) {
      return {
        ok: false, reason: 'wrong-schema', schema: payload.schema || null,
        message: 'This file is not a Holocron character save.',
      };
    }
    if (isAhead(payload.schema_version, want)) {
      return {
        ok: false, reason: 'version-ahead',
        version: payload.schema_version, expected: want,
        message: 'This character was saved by a newer version of Holocron. Update, then open it — '
               + 'opening it here would drop anything this version does not understand.',
      };
    }
    return { ok: true, version: payload.schema_version, expected: want };
  }

  var API = {
    isAhead: isAhead,
    blocked: blocked,
    readCharacterSave: readCharacterSave,
    CHARACTER_SAVE_SCHEMA: CHARACTER_SAVE_SCHEMA,
    CHARACTER_SAVE_VERSION: CHARACTER_SAVE_VERSION,
  };

  if (typeof window !== 'undefined') root.SWRPGVersionGuard = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
