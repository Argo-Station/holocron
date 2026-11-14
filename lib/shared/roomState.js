/**
 * roomState.js — the ROOM-STATE persistence core for HOLOTABLE (slice 1, the sync substrate).
 *
 * Ruled by `holotable-room-state-contract` R-RSC-1..4, over brief
 * `Docs/briefs/holotable-room-state-contract.md`. Sibling of benchStore.js and castStore.js, built
 * to the SAME contract discipline (R-NBS1, D-NB1): a versioned envelope, a defensive normalize
 * (garbage / old data -> graceful, never throw), pure state-transforms + a thin storage edge,
 * dual-export exercised by a Node guard (test/room_state_store.cjs).
 *
 * WHY IT IS NOT PART OF benchStore. The bench is ONE GM's local paper: wounds, strain, pools,
 * vehicles — meaningful solo, already persisted, already guarded. This store holds TABLE state that
 * every client must see move: initiative, token positions, the Destiny pool. R-V7S-1 split them
 * along exactly that line and CANCELLED the benchStore v7 bump; `benchStore.js` is not modified by
 * this program.
 *
 * ONE SHAPE, TWO BACKENDS, AND THE AUTHORITY IS NEVER DUAL (R-V7S-1, R-RSC-1):
 *   in a room  -> the Durable Object's storage, one DO per room code. THE DO IS AUTHORITATIVE.
 *   solo       -> localStorage under KEY, same shape, same code. THE LOCAL COPY IS AUTHORITATIVE.
 * Entering a room from a solo state is an explicit IMPORT, never a merge (`importAsRoomOpening`).
 * Joining an existing room ADOPTS its snapshot and discards local (`adoptSnapshot`). There is no
 * three-way reconciliation anywhere in this file, and that absence is the design.
 *
 * TWO ID SPACES, DELIBERATELY NAMED APART — read this before touching `tokens` or `members`:
 *   `members` is keyed by MEMBER ID    — an opaque per-PARTICIPANT identity (a human at the table),
 *                                        R-HT-4: no PII, no account reference, sized for a future
 *                                        account system to mint without migration.
 *   `tokens`  is keyed by BENCH MEMBER INSTANCE ID — `benchStore` member `id`, i.e. a COMBATANT on
 *                                        the map. This is the ONLY coupling between the two stores
 *                                        and it is a READ of an id, never a write (R-RSC-1).
 * They are different id spaces. The contract named both "member"; the code does not.
 *
 * WHAT THIS FILE DOES NOT HOLD: wounds, strain, conditions, pools, vehicles. Those stay bench-owned
 * and reach the wire only as R-HT-5's already-enumerated `wound_strain_delta`, which this store
 * knows as a type and deliberately does not persist.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_room_state';
  var SCHEMA_VERSION = 1;

  var SIDES = ['pc', 'npc'];

  // ── THE FENCE (R-HT-5, as extended by R-RSC-3) ──────────────────────────────
  //
  // The wire schema STRICTLY ENUMERATES its event types and AN UNKNOWN TYPE IS REFUSED LOUDLY.
  // The list lives HERE, once, so the Durable Object and every client validate against the same
  // array rather than two copies that drift — the same reason worker/sync.js keeps SYNC_KEYS
  // server-side as well as client-side: an allow-list that lives only in the caller is a suggestion.
  //
  // `destiny_change` is the EIGHTH type, granted by R-RSC-3 through the door R-HT-5 explicitly left
  // open for census-driven additions before design freeze. A pool nobody can flip over the wire is
  // not shared.
  //
  // ANY future connected tool — granted loot, granted XP, GM stores — requires a schema change,
  // which is a durable-contract HALT (R-Y2-1) plus its own concept ruling. Adding a string to this
  // array is NOT a patch; it is that halt. The thesis line, standing: connectivity existing is
  // never the argument for the next tool.
  var EVENT_TYPES = [
    'token_move',          // -> tokens
    'initiative_change',   // -> initiative
    'membership',          // -> members
    'destiny_change',      // -> destiny            (R-RSC-3, the eighth)
    'roll',                // feed only — nothing persisted in this store
    // R-REI-4: `feed_entry` and `fx_trigger` MAY carry the same optional `id` under R-REI-3.
    // No constructor for them ships yet — Stage B's include it from their FIRST commit, so the
    // anonymous-forever clock never starts ticking for them at all.
    'feed_entry',          // feed only — nothing persisted in this store
    'fx_trigger',          // feed only — nothing persisted in this store
    'wound_strain_delta',  // BENCH-owned — known here so it is not "unknown", never persisted here
  ];

  // The four that mutate this store. The other four are enumerated above so that a legal wire event
  // is never mistaken for an unknown one; applyDelta returns state UNCHANGED for them.
  var MUTATING_TYPES = ['token_move', 'initiative_change', 'membership', 'destiny_change'];

  function isKnownEventType(t) { return EVENT_TYPES.indexOf(t) !== -1; }

  // ── helpers ─────────────────────────────────────────────────────────────────

  function toInt(v) { var n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; }
  function toNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function isSide(s) { return SIDES.indexOf(s) !== -1; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      roomCode: null,
      destiny: { light: 0, dark: 0 },
      initiative: { round: 0, slots: [], active: 0 },
      tokens: {},
      members: {},
    };
  }

  // ── normalize: defensive read, the old-data path ────────────────────────────
  //
  // Any garbage, parse failure or wrong shape degrades to an empty room rather than throwing — the
  // same posture benchStore and castStore take. A room that cannot be read is a room you start
  // fresh, never a crash in front of a table.
  //
  // NO version-ahead sentinel here, and that is deliberate rather than forgotten: benchStore's F-54
  // sentinel solves a FILING-CABINET problem (an old tab silently shearing a newer local save).
  // The room's version skew is solved at a different layer and more honestly — R-RSC-1/R-V7S-3's
  // VERSION-GATED JOIN refuses an older client AT THE DOOR with copy it can read, rather than
  // admitting it as a spectator who cannot act. A newer-than-us blob reaching this function is
  // therefore an old-data path like any other: shape what we understand, invent nothing.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return emptyState();
    var out = emptyState();
    out.roomCode = typeof raw.roomCode === 'string' && raw.roomCode ? raw.roomCode : null;
    out.destiny = normalizeDestiny(raw.destiny);
    out.initiative = normalizeInitiative(raw.initiative);
    out.tokens = normalizeTokens(raw.tokens);
    out.members = normalizeMembers(raw.members);
    return out;
  }

  // R-V7S-2: SESSION scope, top level, RAW-correct, never per-encounter. Counts only — flip
  // direction and who may flip is R-HRC-3's, cited at the Destiny slice, not legislated here.
  function normalizeDestiny(d) {
    if (!d || typeof d !== 'object') return { light: 0, dark: 0 };
    return { light: toInt(d.light), dark: toInt(d.dark) };
  }

  // R-HRC-1's RAW slot model: slots belong to SIDES, not characters (eote p.207). Drawn without
  // replacement, rolled once in round one, the order repeating thereafter.
  //
  // `benchMemberId` IS NULLABLE BY DESIGN and dropping that would break a ruled write-right: an
  // unfilled slot belonging to a side is exactly what R-HRC-1's THIRD write lets a player claim.
  // A slot with an unrecognised side is dropped (old data); a slot with a missing id is KEPT as
  // unfilled, because unfilled is a legal, meaningful state and not an error.
  function normalizeInitiative(i) {
    if (!i || typeof i !== 'object') return { round: 0, slots: [], active: 0 };
    var slots = Array.isArray(i.slots) ? i.slots : [];
    var out = [];
    slots.forEach(function (s) {
      if (!s || typeof s !== 'object' || !isSide(s.side)) return;   // old data: drop
      out.push({
        side: s.side,
        benchMemberId: s.benchMemberId != null ? String(s.benchMemberId) : null,
      });
    });
    var active = toInt(i.active);
    return {
      round: toInt(i.round),
      slots: out,
      // An active index past the end of the order is meaningless — clamp rather than carry it.
      active: out.length ? Math.min(active, out.length - 1) : 0,
    };
  }

  // Keyed by BENCH MEMBER INSTANCE ID (see the header's two-id-spaces note). The coordinate space
  // itself is SLICE 2's and is NOT fixed here — these are numbers, and what they measure is that
  // slice's ruling. A non-finite coordinate normalizes to 0 rather than NaN, which would otherwise
  // reach a renderer and put a token nowhere at all.
  function normalizeTokens(t) {
    if (!t || typeof t !== 'object') return {};
    var out = {};
    Object.keys(t).forEach(function (k) {
      var p = t[k];
      if (!p || typeof p !== 'object') return;
      out[String(k)] = { x: toNum(p.x), y: toNum(p.y) };
    });
    return out;
  }

  // The room's roster of connected PARTICIPANTS, keyed by R-HT-4's opaque memberId. Present because
  // the write-rights check (R-HT-4 as amended by R-HRC-1) has to resolve "is this slot yours?"
  // against something. NO PII AND NO ACCOUNT REFERENCE — a display name and a side, nothing more.
  function normalizeMembers(m) {
    if (!m || typeof m !== 'object') return {};
    var out = {};
    Object.keys(m).forEach(function (k) {
      var v = m[k];
      if (!v || typeof v !== 'object' || !isSide(v.side)) return;
      out[String(k)] = {
        name: typeof v.name === 'string' ? v.name : '',
        side: v.side,
      };
    });
    return out;
  }

  // ── the delta application ───────────────────────────────────────────────────
  //
  // THE REFUSAL IS THE POINT (R-HT-5). An unknown event type does not fall through, does not
  // no-op, and does not get logged and ignored — it THROWS, so the Durable Object rejects the
  // message and says why. A fence that quietly tolerates what it does not recognise is a sign, not
  // a wall.
  //
  // Pure: never mutates `state`, always returns a new object. The DO persists what it returns.
  function applyDelta(state, delta) {
    var s = normalize(state);
    if (!delta || typeof delta !== 'object') throw refusal('malformed', delta);
    var type = delta.type;
    if (!isKnownEventType(type)) throw refusal('unknown_event_type', type);
    if (MUTATING_TYPES.indexOf(type) === -1) return s;   // legal, feed-only or bench-owned

    if (type === 'token_move') {
      if (delta.benchMemberId == null) throw refusal('token_move_needs_benchMemberId', delta);
      s.tokens[String(delta.benchMemberId)] = { x: toNum(delta.x), y: toNum(delta.y) };
      return s;
    }

    if (type === 'initiative_change') {
      s.initiative = normalizeInitiative(delta.initiative);
      return s;
    }

    if (type === 'membership') {
      if (delta.memberId == null) throw refusal('membership_needs_memberId', delta);
      var id = String(delta.memberId);
      if (delta.present === false) {
        delete s.members[id];
        return s;
      }
      if (!isSide(delta.side)) throw refusal('membership_needs_a_valid_side', delta.side);
      s.members[id] = { name: typeof delta.name === 'string' ? delta.name : '', side: delta.side };
      return s;
    }

    // destiny_change — R-RSC-3. One point moves from `from` to the other pool. Side-scoped write
    // rights (players flip light, GM dark) are R-HRC-3's and are enforced at the DO's rights check,
    // not here: this function is the STATE TRANSFORM, and mixing authorization into it would put
    // two rules in one place and let a future caller bypass either.
    if (!isSide2(delta.from)) throw refusal('destiny_change_needs_from', delta.from);
    var from = delta.from, to = from === 'light' ? 'dark' : 'light';
    // A flip with nothing to flip is a REFUSAL, not a silent floor at zero: the table needs to know
    // the pool was empty, and clamping would let a client believe a flip it never got.
    if (s.destiny[from] <= 0) throw refusal('destiny_pool_empty', from);
    s.destiny[from] -= 1;
    s.destiny[to] += 1;
    return s;
  }

  function isSide2(s) { return s === 'light' || s === 'dark'; }

  function refusal(reason, detail) {
    var e = new Error('room_state_refused: ' + reason);
    e.refused = reason;
    e.detail = detail;
    return e;
  }

  // ── backend switchover (R-V7S-1, R-RSC-1) ───────────────────────────────────

  // Solo -> creating a room. The local state becomes the room's OPENING SNAPSHOT and the DO is
  // authoritative from that instant. An IMPORT, never a merge.
  function importAsRoomOpening(localState, roomCode) {
    var s = normalize(localState);
    s.roomCode = typeof roomCode === 'string' && roomCode ? roomCode : null;
    // Nobody is connected yet — the roster is the room's to build from `membership` events.
    s.members = {};
    return s;
  }

  // Joining an EXISTING room. The client's local room-state is NOT consulted; it adopts the
  // snapshot whole. This is the other half of "the authority is never dual" — the half that is
  // easy to soften later into a merge, which is why it is one function that takes one argument.
  function adoptSnapshot(snapshot) { return normalize(snapshot); }

  // The snapshot a joining client receives IS the schema verbatim (R-RSC-1) — there is no separate
  // join shape to keep in step. This function exists to make that a stated contract with a name
  // rather than an implicit convention someone later "optimises".
  function snapshotOf(state) { return normalize(state); }

  // ── the localStorage edge (solo backend only) ───────────────────────────────

  function read(storage) {
    var st = storage || (typeof root !== 'undefined' && root.localStorage);
    if (!st) return emptyState();
    var raw;
    try { raw = JSON.parse(st.getItem(KEY)); } catch (e) { return emptyState(); }
    return normalize(raw);
  }

  function write(state, storage) {
    var st = storage || (typeof root !== 'undefined' && root.localStorage);
    var out = normalize(state);
    if (!st) return out;
    try { st.setItem(KEY, JSON.stringify(out)); } catch (e) { /* quota — caller's to surface */ }
    return out;
  }

  // ── THE VERSION-GATED JOIN, as a DECISION (R-V7S-3, R-RSC-1) ────────────────
  //
  // An older client is refused AT THE DOOR rather than admitted as a spectator who cannot act.
  // The decision lives HERE, pure, for one reason: in the Worker it sat inline in a `fetch`
  // handler that imports `cloudflare:workers`, which plain Node cannot load — so the single most
  // important refusal in the substrate had no executable guard. A rule that cannot be tested
  // outside a runtime nobody runs locally is a rule that drifts.
  //
  // IT RETURNS A MACHINE REASON, NEVER USER COPY. The sentence a refused player reads is Stage B
  // surface work and owes its R-MU1 mockup; inventing it here would be building that surface
  // through the back door.
  // `roomVersion` is INJECTABLE, defaulting to ours — the same pattern this file already uses for
  // clocks. It is not test scaffolding for its own sake: at SCHEMA_VERSION 1 there is no such
  // thing as an older client, so the 409 branch — the headline refusal of R-V7S-3 — is UNREACHABLE
  // in production today and would have shipped never having been executed once. Injecting the room
  // version is what lets the branch be exercised now, at v1, instead of being discovered broken on
  // the day v2 ships and every existing client is suddenly the old one.
  function joinDecision(claimedVersion, roomVersion) {
    var room = (roomVersion === undefined) ? SCHEMA_VERSION : Number(roomVersion);
    if (!isFinite(room) || room <= 0) room = SCHEMA_VERSION;
    var claimed = Number(claimedVersion);
    if (!isFinite(claimed) || claimed <= 0) {
      return { ok: false, status: 400, error: 'client_version_required' };
    }
    if (claimed < room) {
      return { ok: false, status: 409, error: 'room_schema_newer',
               roomSchema: room, clientSchema: claimed };
    }
    // A client NEWER than the room is admitted: the room's own schema is what the snapshot is
    // written in, and a newer client understands it by construction. Only the reverse is unsafe.
    return { ok: true, status: 101, roomSchema: room, clientSchema: claimed };
  }

  // ── DISPLAY FIELDS ON THE WIRE (R-NBC-3) ────────────────────────────────────
  //
  // A roll event MAY carry two plain strings for the feed's top two lines: `label` (the check's
  // name — "Melee check") and `as` (the actor's display line — "Gamorrean Guard"). Both optional,
  // both additive under R-REI-3: no version bump, and an event without them renders without them.
  //
  // COMPOSED AT THE EMITTER, AND THAT IS THE WHOLE POINT. The id-refs / resolve-at-render law
  // governs PERSISTED shapes (charter §8); the feed is an EPHEMERAL broadcast that is never stored,
  // and a receiver cannot resolve a bench-member id it does not hold. So the emitter — which alone
  // owns the bench data — resolves ONCE at emit and ships the string. No bench id crosses the wire
  // for display, and R-HT-4's no-PII posture is untouched: `as` names an NPC or a chosen table
  // name, never an account.
  //
  // ABSENT MEANS THE KEY IS NOT THERE, not `null`. That is a deliberate choice over this file's
  // usual null-when-absent idiom (`by`, `pool`), for one reason: R-REI-3 requires that an event
  // WITHOUT these fields still renders, and if the constructor always emitted the keys, the only
  // way to produce that shape would be to hand-build an event — so the tolerated shape would be
  // one the constructor never makes, and it would go untested in practice. Omitting means both
  // shapes come out of the same constructor and both get exercised. Same reasoning as
  // `joinDecision`'s injectable `roomVersion`: make the branch reachable rather than hope it works.
  //
  // A NON-STRING IS REFUSED rather than coerced. This constructor already refuses a seed and a
  // score; a number silently stringified onto the wire is the same class of quiet wrongness. An
  // EMPTY or whitespace-only string is treated as absent — an empty display line is not a display
  // line, and shipping one would put a blank row where the mockup drew a name.
  function displayField(name, v) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') {
      throw new Error('roomState: `' + name + '` must be a string — it is composed at the emitter (R-NBC-3)');
    }
    var t = v.trim();
    return t ? t : null;
  }

  // ── TRANSMIT-THE-FACES: the roll event's wire shape (R-HFC-3, R-V7S-4) ──────
  //
  // THE LAW THIS ENFORCES: **one client rolls, and `diceEngine.roll()` is the single entropy
  // site.** The wire carries the FACES that roll produced; every client then scores those faces
  // through the pure `diceEngine.resolve()`. Two clients therefore cannot disagree about a roll,
  // because only one of them ever consulted a random number generator.
  //
  // The two shapes that would break it are REFUSED here rather than documented as discouraged:
  //
  //   a SEED       — "send the seed, each client rolls it" is a SECOND ENTROPY SITE wearing a
  //                  determinism costume. It re-derives faces on every client, so any drift in
  //                  face data, die order or PRNG makes two tables disagree about what was
  //                  rolled, and the disagreement surfaces mid-session as an argument.
  //   a RESULT     — sending `{success: 2, advantage: 1}` makes the EMITTER authoritative over
  //                  scoring. Then a scoring fix ships and old feed entries keep their old
  //                  arithmetic forever, and no client can re-score history. Faces are the raw
  //                  observation; the score is a projection of them (PRAXIS §5, resolve-at-render
  //                  applied to the wire).
  //
  // So: faces travel, scores are computed, and this function throws on anything else. A fence
  // that only warns is a suggestion — the same reason `isKnownEventType` throws upstream.
  function makeRollEvent(opts) {
    opts = opts || {};
    // R-REI-1/2 — EVERY roll event carries an opaque id, and this function does NOT mint it.
    // It stays clock-free and RNG-free by design, so identity arrives from the roll site
    // (`holotable.newEventId`) alongside `at`. Refused loudly when absent rather than defaulted:
    // a roll that quietly went out anonymous is exactly what this rule exists to prevent, and a
    // silent fallback would reintroduce that on the one path nobody tests.
    if (typeof opts.id !== 'string' || !opts.id) {
      throw new Error('roomState.makeRollEvent: an `id` is required — mint it at the roll site (R-REI-2)');
    }
    if (opts.seed !== undefined) {
      throw new Error('roomState.makeRollEvent: a SEED is a second entropy site (R-V7S-4) — send faces');
    }
    if (opts.resolved !== undefined || opts.result !== undefined) {
      throw new Error('roomState.makeRollEvent: send FACES, not a score — every client resolves (R-HFC-3)');
    }
    var faces = opts.faces;
    if (!faces || typeof faces !== 'object' || Array.isArray(faces)) {
      throw new Error('roomState.makeRollEvent: `faces` must be the object diceEngine.roll() returned');
    }
    // Every value must be an ARRAY of face objects — roll()'s shape, keyed by die type. A caller
    // that hands us a single face, or a count, has not rolled; it has described a roll.
    var keys = Object.keys(faces);
    for (var i = 0; i < keys.length; i++) {
      if (!Array.isArray(faces[keys[i]])) {
        throw new Error('roomState.makeRollEvent: faces.' + keys[i] + ' must be an array of face objects');
      }
    }
    var evt = {
      type: 'roll',
      id: opts.id,                  // opaque, client-minted (R-REI-1/2)
      faces: clone(faces),          // cloned: the wire owns its copy, never the roller's live object
      pool: opts.pool ? clone(opts.pool) : null,   // carried for DISPLAY only; never re-rolled from
      by: opts.by || null,          // member id, opaque (R-HT-4)
      at: toNum(opts.at),           // caller-stamped; this module never reads a clock
    };
    // R-NBC-3's two display strings — attached only when they carry something. See displayField.
    var label = displayField('label', opts.label);
    if (label) evt.label = label;
    var as = displayField('as', opts.as);
    if (as) evt.as = as;
    return evt;
  }

  // ── THE FEED ENTRY'S WIRE SHAPE (R-NBC-4) ───────────────────────────────────
  //
  // v1 IS EXACTLY `{type:'feed_entry', id, by, at, text}` — five keys, and the ruling's word for
  // what else may ride is "nothing else". Richer feed kinds (damage lines, joins, arrivals) are
  // TEXT until a future slice rules structure for them.
  //
  // THIS CONSTRUCTOR IS WHY R-REI-4 DISCHARGES. `feed_entry` and `fx_trigger` were enumerated in
  // EVENT_TYPES with no constructor and no shape, and the fence's recorded sentence was that when
  // one ships, its constructor carries the id FROM ITS FIRST COMMIT — so the anonymous-forever
  // clock never starts ticking for feed entries at all. It is required, never defaulted, for the
  // same reason `makeRollEvent` refuses an id-less roll: a silent fallback reintroduces the exact
  // defect on the one path nobody tests.
  //
  // STRUCTURE IS REFUSED AT THE DOOR, not discouraged in a comment. `faces`, `pool` and `resolved`
  // are the three shapes a caller would reach for to smuggle a roll into a feed entry, and each
  // would fork the feed into two event types that mean the same thing. A roll is a `roll`.
  //
  // `text` IS EMITTER-COMPOSED, exactly as R-NBC-3's display fields are, and for the same reason:
  // the feed is ephemeral, never persisted, and a receiver cannot resolve ids it does not hold.
  // Trust is table-level — the same trust as saying it out loud (R-HT-4; rights.js PLAYER_WRITES
  // already carries `feed_entry`, so no rights change rides with this).
  function makeFeedEntry(opts) {
    opts = opts || {};
    if (typeof opts.id !== 'string' || !opts.id) {
      throw new Error('roomState.makeFeedEntry: an `id` is required — mint it at the emit site (R-REI-4)');
    }
    if (opts.faces !== undefined || opts.pool !== undefined || opts.resolved !== undefined) {
      throw new Error('roomState.makeFeedEntry: a feed entry carries TEXT, not dice — send a `roll` (R-NBC-4)');
    }
    var text = displayField('text', opts.text);
    if (!text) {
      throw new Error('roomState.makeFeedEntry: `text` must be a non-empty string composed at the emitter (R-NBC-4)');
    }
    return {
      type: 'feed_entry',
      id: opts.id,                  // opaque, minted at the emit site (R-REI-4)
      by: opts.by || null,          // member id, opaque (R-HT-4)
      at: toNum(opts.at),           // caller-stamped; this module never reads a clock
      text: text,
    };
  }

  // Read the faces back off a received roll event, for the receiver to hand to `resolve()`.
  // Returns null for anything that is not a roll event carrying faces, so a malformed wire
  // message degrades to "nothing to score" rather than a thrown error on the receiving path.
  function facesOf(evt) {
    if (!evt || evt.type !== 'roll' || !evt.faces || typeof evt.faces !== 'object') return null;
    return evt.faces;
  }

  var API = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    EVENT_TYPES: EVENT_TYPES,
    MUTATING_TYPES: MUTATING_TYPES,
    SIDES: SIDES,
    isKnownEventType: isKnownEventType,
    emptyState: emptyState,
    normalize: normalize,
    applyDelta: applyDelta,
    importAsRoomOpening: importAsRoomOpening,
    adoptSnapshot: adoptSnapshot,
    snapshotOf: snapshotOf,
    joinDecision: joinDecision,
    makeRollEvent: makeRollEvent,
    makeFeedEntry: makeFeedEntry,
    facesOf: facesOf,
    read: read,
    write: write,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.SWRPGRoomState = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
