/**
 * roomFeed.js — THE FEED'S DISPLAY PROJECTION. One core, both apps, both event kinds.
 *
 * A wire event goes in; the shape `holotableView.FeedEntry` renders comes out. Nothing else in
 * the repo may compute a feed row, and in particular NOTHING ELSE MAY FORMAT A TALLY — the prior
 * gate (`holotable-stage-b-narrow-compositions` §8) wrote that down as the one thing the wiring
 * increment must not quietly grow one of per app, and PRAXIS §5's one-core rule is the law behind
 * it: a second resolution path for the same number is a defect whatever it is called.
 *
 * ── WHY THIS IS ITS OWN FILE, AND NOT PART OF `roomState.js` ────────────────────────────────
 *
 * Because `roomState.js` is imported by the ROOM SERVER (`room-server/src/room.js` and
 * `index.js`), and the Durable Object has no business scoring dice. Putting `resolve()` in the
 * store would drag `diceEngine.js` into the Worker bundle to serve a projection the Worker never
 * performs — the server is the AUTHORITY over table state, never a renderer of it. The split is
 * the same one `rights.js` already draws against `room.js`: keep the pure thing out of the
 * transport so it can be exercised without standing a server up.
 *
 * ── RESOLVE AT RENDER, WHICH IS WHY THE WIRE CARRIES FACES ──────────────────────────────────
 *
 * `makeRollEvent` refuses a seed and refuses a score, and ships the FACES (R-HFC-3, R-V7S-4). So
 * this is the only place those faces become a number, and it does it through the SHIPPED core:
 * `roomState.facesOf` -> `diceEngine.resolve` -> `diceEngine.formatResults`. Two clients cannot
 * disagree about a roll because only one of them ever consulted a random number generator, and
 * both of them run this same function over the same faces.
 *
 * `formatResults` JOINS WITH COMMAS where the mockup drew a middot. R-NBC-6 ruled that
 * explicitly: the shipped core wins over drawing fidelity (C-MU-4's ordering) and the drawing is
 * the thing that is out of date. If the middot is ever preferred, THE CORE changes for every
 * consumer — never a feed-local formatter, which is exactly what this file exists to prevent.
 *
 * ── THE TWO TOP LINES (R-NBC-3) ─────────────────────────────────────────────────────────────
 *
 * The mockup drew "GM · Gamorrean Guard" over "Melee check". Those are three different sources:
 *
 *   the PERSON half  <- the MEMBERSHIP roster's existing `name`, looked up from the event's
 *                       opaque `by` (R-HT-4: `by` is a member id and never a name on the wire).
 *   the ACTOR half   <- the event's optional `as`, composed at the EMITTER because a receiver
 *                       cannot resolve a bench-member id it does not hold.
 *   the CHECK        <- the event's optional `label`.
 *
 * Both optional halves may be absent — older events, or an emitter that had nothing to say — and
 * absence collapses rather than leaving a separator hanging. An event with neither half yields an
 * empty `who`, which `FeedEntry` already tolerates (`e.who || ''`).
 *
 * ── WHAT PROJECTS, AND WHAT DELIBERATELY DOES NOT ───────────────────────────────────────────
 *
 * `roll` and `feed_entry`. That is the whole list. The other six enumerated types are table
 * STATE, not feed rows: nobody drew a card for "a token moved" and R-NBC-4's word for richer feed
 * kinds is that they are TEXT until a future slice rules structure for them. An unrecognised or
 * unprojectable event returns `null` — the caller drops it — rather than a half-filled card,
 * because a feed row invented here would be surface built through the back door.
 */
(function (root) {
  'use strict';

  // Resolved AT CALL TIME, not captured at load. `sync.js` captures its `syncMerge` dependency at
  // module scope and that is fine there; here it would be a load-order trap — this file is a plain
  // classic script and a page that happens to place it above `diceEngine.js` would capture null
  // once and render every feed row without dice, silently, forever. The same reasoning the flag
  // uses for reading `SWRPGHolotableEnabled` at render time.
  function nodeRequire(name) {
    if (typeof require !== 'function' || typeof module === 'undefined') return null;
    try { return require(name); } catch (e) { return null; }
  }
  function dice() { return nodeRequire('./diceEngine.js') || root.SWRPGDice || null; }
  function store() { return nodeRequire('./roomState.js') || root.SWRPGRoomState || null; }

  var PERSON_ACTOR_SEPARATOR = ' · ';   // "GM · Gamorrean Guard", as drawn

  // How many rows the feed keeps. A table that runs for four hours emits a lot of dice, and an
  // unbounded array is a memory leak with a nice name. 200 is generous for "scroll back and see
  // what just happened" and cheap; the feed is EPHEMERAL and never persisted, so nothing is lost
  // that was ever promised to be kept.
  var FEED_CAP = 200;

  function nameOf(members, id) {
    if (!members || typeof members !== 'object' || id == null) return '';
    var m = members[String(id)];
    return (m && typeof m.name === 'string') ? m.name : '';
  }

  function joinWho(person, actor) {
    var parts = [];
    if (person) parts.push(person);
    if (actor) parts.push(actor);
    return parts.join(PERSON_ACTOR_SEPARATOR);
  }

  /**
   * project(evt, members) -> the FeedEntry shape, or null when this event is not a feed row.
   *
   * `members` is the room state's roster (`state.members`), used only to turn the opaque `by`
   * into a display name. Omitted or unknown -> the person half is simply absent.
   */
  function project(evt, members) {
    if (!evt || typeof evt !== 'object') return null;
    var S = store();

    if (evt.type === 'feed_entry') {
      // R-NBC-4's v1 shape is `{type, id, by, at, text}` — text and nothing else. There is no
      // `as` on a feed entry, so `who` is the person half alone.
      if (typeof evt.text !== 'string' || !evt.text) return null;
      return {
        id: evt.id != null ? String(evt.id) : null,
        at: evt.at,
        who: nameOf(members, evt.by),
        what: evt.text,
        pool: null,
        resolved: null,
        tally: '',
      };
    }

    if (evt.type !== 'roll') return null;

    var faces = S ? S.facesOf(evt) : null;
    // `facesOf` returns null for a roll that carries no faces — a malformed wire message degrades
    // to "nothing to score". A roll with nothing to score is not a row: it would render as a name
    // over an empty card, which is worse than not rendering it.
    if (!faces) return null;

    var D = dice();
    var resolved = D ? D.resolve(faces) : null;
    var tally = (D && resolved) ? D.formatResults(resolved) : '';

    return {
      id: evt.id != null ? String(evt.id) : null,
      at: evt.at,
      who: joinWho(nameOf(members, evt.by), typeof evt.as === 'string' ? evt.as : ''),
      what: typeof evt.label === 'string' ? evt.label : '',
      pool: evt.pool || null,
      resolved: resolved,
      tally: tally,
    };
  }

  /**
   * prepend(list, entry, cap) -> a NEW newest-first list, capped.
   *
   * The cap lives here rather than at each call site for the same reason the projection does:
   * two callers with two caps is two feeds. Pure — the caller's array is never mutated, so a
   * React consumer holding the old list in state sees an actual change of identity.
   */
  function prepend(list, entry, cap) {
    var out = Array.isArray(list) ? list.slice() : [];
    if (!entry) return out;
    var n = (typeof cap === 'number' && cap > 0) ? Math.floor(cap) : FEED_CAP;
    out.unshift(entry);
    return out.length > n ? out.slice(0, n) : out;
  }

  var API = {
    FEED_CAP: FEED_CAP,
    PERSON_ACTOR_SEPARATOR: PERSON_ACTOR_SEPARATOR,
    project: project,
    prepend: prepend,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.SWRPGRoomFeed = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
