/**
 * mapPins.js — F-5 MAP PINS: the campaign's footprint on the Galaxy Map.
 *
 * Concept ruled on paper: `Docs/rulings/map-pins-concept.md` §3. The GM taps a planet, marks it
 * VISITED, optionally leaves one line of note, and the map keeps it. No new screen — the map IS
 * the travel log. This file owns the durable half of that: the save shape and the pure transforms.
 *
 * SAVE SHAPE — RULED, not chosen here (R-Y2-1 satisfied by the concept ruling):
 *
 *     localStorage['swrpg_map_pins'] = { version: 1, pins: { <planetId>: { note: '', when: 'YYYY-MM-DD' } } }
 *
 *   · PRESENCE OF THE KEY IS THE PIN. There is no `pinned: true` field to fall out of sync with the
 *     map — unpinning deletes the entry, so "is it pinned" and "does the entry exist" cannot disagree.
 *   · Additive and DROPPABLE. Losing this file costs a GM their notes, nothing else: no other store
 *     reads it, no character or encounter depends on it.
 *   · IDENTITY IS THE CANONICAL PLANET ID, never coordinates. §2 of the ruling rejected freeform
 *     lat/lng pins precisely because they drift the day the map is recalibrated. `planetKey()` below
 *     is THE identity function — the same one the planet-record fetch already used — and it is
 *     exported so the map view, the detail sheet and this store cannot drift into three copies
 *     (the eight-text-matchers defect, ADR 0025).
 *   · UNKNOWN PLANET IDS ARE PRESERVED, never pruned. A pin written against a planet this build no
 *     longer ships (a renamed id, a future dataset, a hand-edited save) renders NOTHING on the map
 *     and survives every read/write cycle untouched. The store has no planet registry and wants
 *     none: deciding an id is "wrong" is exactly the judgement that loses a GM's data.
 *
 * VERSION BRANCHING FROM DAY ONE (R-NBB1, standing practice). `normalize()` switches on the stored
 * version even though there is only one version today. The branch is here BEFORE it is needed
 * because the alternative — adding it at v2, against saves written without it — is how migrations
 * become archaeology.
 *
 * THE VERSION-AHEAD SENTINEL (F-54, via window.SWRPGVersionGuard). A save written by a NEWER build
 * is flagged `stale` and NEVER WRITTEN BACK, because `normalize()` re-emits at OUR SCHEMA_VERSION
 * and would silently drop every field this build does not understand. It still normalizes for
 * DISPLAY — a stale tab shows the pins read-only rather than blank, because blank looks exactly
 * like lost. Same rule, same one implementation, as benchStore / vesselStore / the roster.
 *
 * SYNCED — the TENTH key, added by ruling `f5-map-pins` §3 (R-F5-1). This file shipped device-local
 * because the concept predated accounts, and the envelope was deliberately built sync-SHAPED so
 * that lap would be cheap: a versioned object whose payload is a flat id→record map, the same
 * silhouette the merge already knows how to reason about. It was, and NOTHING IN THIS FILE CHANGED
 * — registration is four edits elsewhere (`syncMerge` WHOLE, the derived client key list,
 * `ui.jsx` CONFLICT_COPY, `worker/sync.js` SYNC_KEYS), guarded by `test/sync_pins_key.cjs`.
 *
 * WHAT "WHOLE" MEANS FOR A GM. Pins are merged as ONE value, not entry by entry: an entry has no id
 * of its own and no stamp, so there is nothing to key a per-record merge on. Two devices that both
 * have pins and disagree therefore raise ONE question naming the worlds that differ, and until it
 * is answered the local pins are what stays on screen. Adoption on a device with no pins takes the
 * account's silently; a device whose pins the account lacks keeps its own and pushes them.
 *
 * Node-testable: `test/map_pins_store.cjs` exercises the transforms AND the localStorage edge.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_map_pins';
  var SCHEMA_VERSION = 1;

  // A pin note is ONE LINE (§3). The cap is a storage guard, not a design statement — it stops a
  // pasted wall of text from becoming a localStorage problem; the input enforces the line.
  var NOTE_MAX = 140;

  // Fields v1 gives meaning to. Anything else found on a stored entry is passed through untouched
  // (forward-compat), so an additive v2 field is not destroyed by a v1 reader that never bumps.
  var KNOWN_FIELDS = ['note', 'when'];

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function emptyState() {
    return { version: SCHEMA_VERSION, pins: {} };
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /**
   * THE identity function. Canonical `planet_id` when the dataset has one (49 of 2,077 records
   * today); otherwise the name slug. Verified unique across the whole `gdr_planets_mapped` set —
   * 2,077 records, 2,077 distinct keys, zero collisions — which is what makes it safe as a store
   * key. Byte-identical to the rule the planet-record fetch already used, deliberately: this is
   * that rule's ONE home now, and both callers were re-pointed here.
   */
  function planetKey(planet) {
    if (!planet) return '';
    if (typeof planet === 'string') return planet;
    if (planet.planet_id) return String(planet.planet_id);
    return String(planet.name || '').toLowerCase().replace(/\s+/g, '_');
  }

  // Today, local time, as YYYY-MM-DD. Local (not UTC) on purpose: a GM pinning a world at 11pm
  // means tonight's session, and a UTC stamp would file half the world's evenings under tomorrow.
  function today(now) {
    var d = now instanceof Date ? now : new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // ONE LINE and no longer than NOTE_MAX — and NOTHING ELSE. In particular it does NOT trim.
  //
  // That is a scar, not an oversight: the note writes through to the store on every keystroke (no
  // save button to forget), so a store that trimmed would eat the space the moment you typed it and
  // "crashed the speeder" would land as "crashedthespeeder". A note that is nothing but whitespace
  // is still normalised to empty, which is the only trim that has no typing to interrupt.
  function shapeNote(note) {
    if (typeof note !== 'string') return '';
    var one = note.replace(/[\r\n\t\f\v]+/g, ' ').slice(0, NOTE_MAX);
    return /^\s*$/.test(one) ? '' : one;
  }

  // A malformed date becomes EMPTY, never a guessed one. Rendering no date is honest; inventing a
  // date the GM never set is the kind of quiet fiction this programme keeps out of saves.
  function shapeWhen(when) {
    return (typeof when === 'string' && DATE_RE.test(when)) ? when : '';
  }

  function shapeEntry(raw) {
    var out = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      // Unknown keys first, verbatim — then the v1 fields overwrite their own slots.
      Object.keys(raw).forEach(function (k) {
        if (KNOWN_FIELDS.indexOf(k) < 0) out[k] = clone(raw[k]);
      });
    }
    out.note = shapeNote(raw && raw.note);
    out.when = shapeWhen(raw && raw.when);
    return out;
  }

  // v1 body reader. Every well-formed id survives — INCLUDING ids this build cannot resolve to a
  // planet. An entry that is not an object at all is replaced with an empty one rather than
  // dropped: the GM's intent ("I pinned this world") is the durable fact; the note was the garbage.
  function readV1(raw) {
    var pins = {};
    var src = (raw && typeof raw.pins === 'object' && raw.pins && !Array.isArray(raw.pins)) ? raw.pins : {};
    Object.keys(src).forEach(function (id) {
      if (!id) return;
      pins[String(id)] = shapeEntry(src[id]);
    });
    return pins;
  }

  /**
   * normalize(raw) → { version, pins, stale? }
   *
   * Never throws. Garbage, a truncated write, a hand-edited file, an old shape — all degrade to
   * something renderable. BRANCHES ON VERSION (R-NBB1): the switch is the migration seam, present
   * from the first commit so v2 is a case, not an excavation.
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyState();

    var vRaw = typeof raw.version === 'number' ? raw.version : parseInt(raw.version, 10);
    var VG = (typeof root !== 'undefined' && root && root.SWRPGVersionGuard)
      || (typeof window !== 'undefined' && window.SWRPGVersionGuard) || null;
    var stale = VG ? VG.isAhead(vRaw, SCHEMA_VERSION) : (isFinite(vRaw) && vRaw > SCHEMA_VERSION);

    // An unversioned save reads as v1: there is no v0, so a missing field means "written by the
    // first build", not "unknown". Coercing it to v1 keeps a legacy/hand-written save's pins.
    var v = isFinite(vRaw) ? vRaw : SCHEMA_VERSION;

    var pins;
    switch (v) {
      case 1:
        pins = readV1(raw);
        break;
      default:
        // Ahead of us, or a version below 1 that never existed. Read what v1 understands so the
        // pins still DISPLAY; the `stale` flag above is what stops the write-back.
        pins = readV1(raw);
        break;
    }

    var out = { version: SCHEMA_VERSION, pins: pins };
    if (stale) out.stale = true;   // in-memory only — never persisted
    return out;
  }

  // ── reads ───────────────────────────────────────────────────────────────────────────────────

  function isPinned(state, planet) {
    var id = planetKey(planet);
    return !!(state && state.pins && Object.prototype.hasOwnProperty.call(state.pins, id));
  }

  function getPin(state, planet) {
    var id = planetKey(planet);
    if (!isPinned(state, id)) return null;
    return state.pins[id];
  }

  function pinnedIds(state) {
    return (state && state.pins) ? Object.keys(state.pins) : [];
  }

  function count(state) { return pinnedIds(state).length; }

  // ── pure transforms (new state out; the caller feeds React AND persist) ─────────────────────

  // Every transform starts from a normalize() so it cannot be handed a shape it did not expect —
  // and CARRIES THE STALE FLAG FORWARD. Without that carry a single edit would launder a
  // newer-than-us save into a writable one and the F-54 hold would silently stop holding.
  function working(state) {
    var s = normalize(state);
    if (state && state.stale) s.stale = true;
    return s;
  }

  function pin(state, planet, note, when) {
    var s = working(state);
    var id = planetKey(planet);
    if (!id) return s;
    s.pins[id] = shapeEntry({ note: note, when: shapeWhen(when) || today() });
    return s;
  }

  function unpin(state, planet) {
    var s = working(state);
    var id = planetKey(planet);
    delete s.pins[id];
    return s;
  }

  function togglePin(state, planet) {
    return isPinned(state, planet) ? unpin(state, planet) : pin(state, planet);
  }

  // Editing the note of an UNPINNED planet is a no-op, not an implicit pin: the toggle is the only
  // thing that creates a pin, so a stray keystroke can never mark a world visited.
  function setNote(state, planet, note) {
    var s = working(state);
    var id = planetKey(planet);
    if (!Object.prototype.hasOwnProperty.call(s.pins, id)) return s;
    s.pins[id] = shapeEntry(Object.assign({}, s.pins[id], { note: note }));
    return s;
  }

  // ── localStorage edge (thin; swallows quota/parse failures) ─────────────────────────────────

  function storage() {
    try { return (root && root.localStorage) || null; } catch (e) { return null; }
  }

  function load() {
    try {
      var ls = storage();
      if (!ls) return emptyState();
      return normalize(JSON.parse(ls.getItem(KEY)));
    } catch (e) { return emptyState(); }
  }

  // THE HOLD (F-54): a state read from a NEWER save is never written back. `normalize()` re-emits at
  // OUR version and drops what this build does not know — which is precisely how a GM's pins from a
  // newer tab would vanish. One seam, so no future control can forget it.
  function persist(state) {
    if (state && state.stale) return false;
    try {
      var ls = storage();
      if (!ls) return false;
      ls.setItem(KEY, JSON.stringify({ version: SCHEMA_VERSION, pins: normalize(state).pins }));
      return true;
    } catch (e) { return false; }   // quota / private mode — drop the write, keep the app alive
  }

  var api = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    NOTE_MAX: NOTE_MAX,
    emptyState: emptyState,
    normalize: normalize,
    planetKey: planetKey,
    today: today,
    isPinned: isPinned,
    getPin: getPin,
    pinnedIds: pinnedIds,
    count: count,
    pin: pin,
    unpin: unpin,
    togglePin: togglePin,
    setNote: setNote,
    load: load,
    persist: persist,
  };

  if (typeof root !== 'undefined' && root) root.GmMapPins = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
