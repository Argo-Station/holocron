/**
 * roomClient.js — THE ROOM CLIENT. The browser half of the sync substrate, and the thing Stage A's
 * gate named when it wrote "`holotableEnabled()` and `edges.inRoom` have no callers yet by design —
 * the room client that supplies them arrives with Stage B."
 *
 * ONE definition, both apps (the no-compromise-mirror law). `window.SWRPGRoomClient`.
 *
 * ── WHAT IT OWNS, AND WHAT IT REFUSES TO OWN ────────────────────────────────────────────────
 *
 * It owns the SOCKET: dialling, the membership hello, adopting the snapshot, applying deltas,
 * reconnecting, and leaving. It owns none of the following, on purpose:
 *
 *   the SHAPE      — `roomState.js`. Every transform goes through it, exactly as the Durable
 *                    Object does. If a transform appears in this file there are two shapes again.
 *   AUTHORIZATION  — `room-server/src/rights.js`, server-side, and NOT mirrored here. A client
 *                    that also enforced rights would be a second rulebook to keep in step, and the
 *                    one that matters is the one holding the state. The client sends; the server
 *                    refuses and says why, and the refusal comes back as a `refused` frame.
 *   the PROJECTION — `roomFeed.js`. One core for feed rows and tallies.
 *   the CODE       — `holotable.js` mints and canonicalizes it (R-WRC-1).
 *
 * ── THE ADDRESS (R-WRC-2) ───────────────────────────────────────────────────────────────────
 *
 * ONE named constant, and this is the whole of the client's knowledge of where the room server
 * lives. Ruled by `holotable-wiring-room-code-and-endpoint` R-WRC-2: the `workers.dev` host NOW —
 * it is live, needle-verified and invisible while everything is dark — with a route on
 * `holocron.work` RULED AS THE LAUNCH ANSWER and pinned to the launch checklist, batched into
 * Jason's go-live console pass. A user-visible `workers.dev` address is not this program's front
 * door; it is a fine one for a dark period.
 *
 * R-WRC-2 rejected an env-overridable endpoint (a seam with nothing on the other side). The public
 * copy is that other side: argo-a1-curation R-AAC-19 moved the host into lib/shared/siteSettings.js,
 * still ONE value with no override, so a fork points it at its own room server. When the launch flip
 * happens, that value changes and nothing else does.
 *
 * ── THE FINDING THIS FILE COULD NOT DESIGN AROUND (measured, not assumed) ────────────────────
 *
 * **A BROWSER CANNOT READ THE JOIN REFUSAL'S REASON ACROSS ORIGINS TODAY.** The version gate
 * refuses BEFORE the upgrade (R-V7S-3: "refused at the door, before it holds a socket"), as a
 * JSON 409/400. Two facts collide there:
 *
 *   1. A failed WebSocket HANDSHAKE gives the browser client a close code of 1006 and no body.
 *      The `error` and `close` events carry nothing about the HTTP status or the JSON reason.
 *   2. The room server sends NO `access-control-allow-origin` header, so a plain `fetch` of the
 *      same URL from `holocron.work` is CORS-blocked and its promise rejects unread.
 *
 * Measured against the live Worker on 2026-08-26 with `Origin: https://holocron.work`:
 * `/ping` -> 200 with no ACAO header; `/room?room=...&v=1` (plain GET) -> **426 "expected a
 * websocket upgrade"**, also with no ACAO. The 426 is the interesting half: it means a pre-flight
 * READ of the gate is possible in principle — the Worker answers a non-upgrade GET with a
 * distinguishable status — and only the missing CORS header stands between here and a legible
 * refusal.
 *
 * So `preflight()` below is written to do the right thing in BOTH worlds and to degrade honestly:
 * it attempts the read, and any failure (CORS, network, a non-JSON body) yields `null`, meaning
 * UNKNOWN rather than a guessed reason. `classifyJoinFailure` then maps a known
 * `room_schema_newer` to the approved version card and EVERYTHING ELSE — including unknown — to
 * R-NBC-5's second card, whose copy is true for an unknown failure by construction: the join did
 * not complete, it is not the out-of-date case, try again first. Nothing is invented and nothing
 * lies. The consequence — that the R-V7S-3 version card is unreachable from a cross-origin
 * browser until the room server is same-origin (R-WRC-2's launch answer) or grows CORS headers —
 * is a finding for the gate, not a thing this file may decide.
 */
(function (root) {
  'use strict';

  function nodeRequire(name) {
    if (typeof require !== 'function' || typeof module === 'undefined') return null;
    try { return require(name); } catch (e) { return null; }
  }
  // Resolved at CALL time, never captured at load — this is a classic script and a page that
  // places it above its dependencies would otherwise capture null once and stay broken silently.
  function store() { return nodeRequire('./roomState.js') || root.SWRPGRoomState || null; }
  function feed() { return nodeRequire('./roomFeed.js') || root.SWRPGRoomFeed || null; }
  function holo() { return nodeRequire('./holotable.js') || root.SWRPGHolotable || null; }

  // R-WRC-2, as re-homed by R-AAC-19: the host is an account value read from lib/shared/siteSettings.js,
  // the one place the client learns where a room lives. Blank (the public copy's template) means there is no
  // server, and open() refuses with `no_room_server` instead of dialling nowhere.
  function siteSettings() { return nodeRequire('./siteSettings.js') || root.SWRPGSiteSettings || {}; }
  var ROOM_SERVER_HOST = siteSettings().ROOM_SERVER_HOST || '';
  var ROOM_PATH = '/room';

  function wsUrl(host, code, version) {
    return 'wss://' + host + ROOM_PATH + '?room=' + encodeURIComponent(code)
         + '&v=' + encodeURIComponent(String(version));
  }
  function httpUrl(host, code, version) {
    return 'https://' + host + ROOM_PATH + '?room=' + encodeURIComponent(code)
         + '&v=' + encodeURIComponent(String(version));
  }

  // The phases a client can be in. `inRoom` is derived from these and from nothing persisted.
  var PHASE = {
    IDLE: 'idle',
    JOINING: 'joining',
    OPEN: 'open',
    RECONNECTING: 'reconnecting',
    REFUSED: 'refused',
    CLOSED: 'closed',
  };

  // ── THE ONE LIVE SESSION IN THIS TAB ────────────────────────────────────────────────────────
  //
  // `sync.js` takes `edges.inRoom` as a PREDICATE and calls it on every bench write; it has no way
  // to reach a React hook's closure, and threading one down through two 20k-line apps would put a
  // prop on every component between here and there. So the CURRENT session registers itself here
  // when it dials and deregisters when it leaves.
  //
  // THIS IS NOT THE PERSISTED FLAG R-V7S-1 FORBIDS, and the distinction is worth stating because
  // it is exactly the shape that rule warns about. What is held is a REFERENCE TO A LIVE CLIENT,
  // in memory, for as long as that client exists — the predicate still asks the SOCKET. Nothing is
  // written anywhere, so there is no bit for a crash, a closed laptop or a killed tab to leave
  // set; a reload starts with `current === null` unconditionally.
  //
  // One per tab is not a simplification: you cannot be at two tables at once, and a second
  // `open()` replaces the first rather than accumulating.
  var current = null;

  function inRoomNow() {
    try { return !!(current && current.inRoom()); } catch (e) { return false; }
  }

  // The refusal the entry form falls back to when the wire could not tell us why. R-NBC-5's card
  // is written for exactly this: it promises nothing about versions and asks for a retry first.
  var UNKNOWN_REFUSAL = 'join_failed';

  /**
   * classifyJoinFailure(reason) -> the `refusal` object `holotableCompose.JoinTable` reads.
   *
   * ONE mapping, so the two apps cannot disagree about which card a failure earns. Only the
   * machine reason the SERVER produced may select the version card; anything else — a bad code,
   * an unreadable response, a dead network, a 1006 handshake close — selects the second card.
   * Erring the other way would put "reload to update" in front of someone whose wifi dropped.
   */
  function classifyJoinFailure(detail) {
    var d = detail || {};
    if (d.error === 'room_schema_newer') {
      return { error: 'room_schema_newer', roomSchema: d.roomSchema, clientSchema: d.clientSchema };
    }
    return { error: UNKNOWN_REFUSAL, cause: d.error || d.cause || null };
  }

  /**
   * preflight(fetchImpl, host, code, version) -> Promise<refusal-detail | null>
   *
   * Resolves to the server's machine reason when it can be READ, and to `null` when it cannot —
   * never to a guess. A 426 means the gate PASSED (the DO answered a non-upgrade GET), which is
   * the success signal here rather than an error. See the header for why `null` is common today.
   */
  function preflight(fetchImpl, host, code, version) {
    if (typeof fetchImpl !== 'function') return Promise.resolve(null);
    var url = httpUrl(host, code, version);
    return fetchImpl(url, { method: 'GET', cache: 'no-store' }).then(function (res) {
      if (!res || typeof res.status !== 'number') return null;
      if (res.status === 426 || res.status === 101) return null;   // the gate passed
      if (typeof res.json !== 'function') return null;
      return res.json().then(function (body) {
        return (body && body.error) ? body : null;
      }, function () { return null; });
    }, function () {
      // CORS, DNS, offline — all indistinguishable from here, and all honestly "unknown".
      return null;
    });
  }

  /**
   * createRoomClient(opts) -> the client.
   *
   * EVERY dependency is injectable, and that is not test scaffolding for its own sake: without it
   * this file could only ever be exercised by standing up a browser AND a Worker, which is the
   * same trap `rights.js` was split out of `room.js` to avoid. A guard hands it a fake socket and
   * drives the whole lifecycle — join, snapshot, delta, refusal, drop, reconnect, leave — in Node.
   *
   *   code        the room code, CANONICAL (6 chars). Canonicalize before you get here.
   *   memberId    this participant's opaque id (R-HT-4 — never an account, never PII)
   *   name        this participant's display name, roster-visible
   *   side        'pc' or 'npc'; the GM is the npc side (rights.js records why)
   *   host        defaults to R-WRC-2's constant
   *   WebSocketImpl / fetchImpl / setTimeoutImpl / clearTimeoutImpl / rand / now — injectable
   *   onChange    called after every state, feed or phase change
   */
  function createRoomClient(opts) {
    opts = opts || {};
    var S = store();
    var F = feed();
    var H = holo();
    if (!S) throw new Error('roomClient: roomState is not loaded');

    var host = opts.host || ROOM_SERVER_HOST;
    var code = typeof opts.code === 'string' ? opts.code : '';
    var memberId = opts.memberId != null ? String(opts.memberId) : null;
    var name = typeof opts.name === 'string' ? opts.name : '';
    var side = opts.side === 'npc' ? 'npc' : 'pc';

    var WS = opts.WebSocketImpl || root.WebSocket || null;
    var fetchImpl = opts.fetchImpl || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    var setT = opts.setTimeoutImpl || root.setTimeout;
    var clearT = opts.clearTimeoutImpl || root.clearTimeout;
    var rand = typeof opts.rand === 'function' ? opts.rand : null;
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    var phase = PHASE.IDLE;
    var state = S.emptyState();
    var entries = [];
    var refusal = null;          // the JoinTable-shaped object, or null
    var lastRefusedFrame = null; // the server's most recent `refused` frame, for the gate/logs
    var sock = null;
    var timer = null;
    var attempt = 0;
    // Distinguishes "the door never opened" from "we were in and got dropped". They earn
    // OPPOSITE treatment: a failed JOIN surfaces a refusal the user can act on, while a drop from
    // an established table reconnects forever (RECONNECT.maxAttempts === 0 — "a table left alone
    // should still be connected later"). Retrying a failed join forever would leave someone
    // watching a spinner that will never resolve, with nothing to read and nothing to press.
    var everOpened = false;
    var leaving = false;

    function emit() { try { onChange(snapshot()); } catch (e) { /* a listener must not kill sync */ } }

    function setPhase(p) { if (phase !== p) { phase = p; emit(); } }

    function snapshot() {
      return {
        phase: phase, code: code, memberId: memberId,
        state: state, entries: entries, refusal: refusal,
        present: Object.keys(state.members || {}).length,
        inRoom: inRoom(),
      };
    }

    // ── R-V7S-1: DERIVED FROM CONNECTION STATE, NEVER A PERSISTED FLAG ──
    //
    // True while a session is live, INCLUDING while reconnecting: the Durable Object is still the
    // authority over this table and we have not left it, so resuming bench pushes on a two-second
    // blip would put a second authority on the same quantity for exactly as long as the blip. The
    // suspension is connection-SCOPED, and a reconnect is the same connection intent, not a new
    // one. Nothing here is written to storage, so a reload ends it unconditionally — the failure
    // mode `sync.js` warns about (a bench stranded offline forever with no way to notice) needs a
    // PERSISTED bit, and there isn't one.
    function inRoom() { return phase === PHASE.OPEN || phase === PHASE.RECONNECTING; }

    function clearTimer() { if (timer != null) { try { clearT(timer); } catch (e) {} timer = null; } }

    function open() {
      if (phase === PHASE.OPEN || phase === PHASE.JOINING) return;
      leaving = false;
      refusal = null;
      current = api;                 // this tab's live session — see the registry above
      if (!S.SCHEMA_VERSION) return;
      if (!host) { fail({ cause: 'no_room_server' }); return; }
      if (!WS) { fail({ cause: 'no_websocket' }); return; }
      setPhase(everOpened ? PHASE.RECONNECTING : PHASE.JOINING);
      dial();
    }

    function dial() {
      var s;
      try {
        s = new WS(wsUrl(host, code, S.SCHEMA_VERSION));
      } catch (e) {
        return onSocketGone({ cause: 'dial_threw' });
      }
      sock = s;
      s.onopen = function () {
        everOpened = true;
        attempt = 0;
        setPhase(PHASE.OPEN);
        // The membership hello binds this socket's identity for the rest of its life (room.js
        // stores it with serializeAttachment so it survives hibernation). Until it lands, the
        // server's rights check admits exactly one kind of message: `identify_first`.
        rawSend({ type: 'membership', memberId: memberId, name: name, side: side, present: true });
      };
      s.onmessage = function (ev) { receive(ev && ev.data); };
      s.onerror = function () { /* close always follows; handled there */ };
      s.onclose = function (ev) {
        onSocketGone({ cause: 'closed', code: ev && ev.code, reason: ev && ev.reason });
      };
    }

    function onSocketGone(detail) {
      sock = null;
      if (leaving) { setPhase(PHASE.CLOSED); return; }

      if (!everOpened) {
        // The door never opened. Ask the server WHY, over plain HTTP, and take `null` for an
        // answer if that is all we can get (see the header's finding).
        return preflight(fetchImpl, host, code, S.SCHEMA_VERSION).then(function (why) {
          fail(why || detail || {});
        }, function () { fail(detail || {}); });
      }

      // We were in. Reconnect, forever, with equal jitter — the policy `holotable.js` designed in
      // Stage A rather than deferring it to the first outage.
      setPhase(PHASE.RECONNECTING);
      var delay = H && typeof H.reconnectDelay === 'function' ? H.reconnectDelay(attempt, rand) : 500;
      attempt += 1;
      clearTimer();
      timer = setT(function () { timer = null; if (!leaving) dial(); }, delay);
    }

    function fail(detail) {
      refusal = classifyJoinFailure(detail);
      // `setPhase` only emits when the phase actually MOVES, and a second failed retry lands on
      // REFUSED while already REFUSED — with a different reason. Emitting explicitly in that case
      // is what stops the card showing a stale cause after a retry.
      if (phase === PHASE.REFUSED) emit(); else setPhase(PHASE.REFUSED);
    }

    function receive(raw) {
      var msg;
      try { msg = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'snapshot') {
        // ADOPT, NEVER MERGE (R-V7S-1's authority-is-never-dual). The client's local room state is
        // not consulted; `adoptSnapshot` takes one argument for exactly that reason.
        state = S.adoptSnapshot(msg.state);
        if (!state.roomCode) state.roomCode = code;
        return emit();
      }

      if (msg.type === 'refused') {
        // The server said no to something WE sent. It is not a join refusal and must not become
        // one: the join already succeeded or we would not be holding a socket.
        lastRefusedFrame = { reason: msg.reason || null, refusedType: msg.refusedType || null };
        return emit();
      }

      // Anything else is an enumerated delta, broadcast by the DO — INCLUDING our own, echoed
      // back to us. That echo is why nothing is appended locally at emit time: one path in, one
      // ordering, and the roll a table sees is the roll the room recorded.
      var projected = F ? F.project(msg, state.members) : null;
      try {
        state = S.applyDelta(state, msg);
      } catch (e) {
        // The store refused a frame the server accepted — a real disagreement, and the honest
        // answer is to drop the frame rather than to half-apply it. Kept visible for the gate.
        lastRefusedFrame = { reason: e.refused || 'local_refused', refusedType: msg.type || null };
        return emit();
      }
      if (projected && F) entries = F.prepend(entries, projected);
      emit();
    }

    function rawSend(obj) {
      if (!sock || phase !== PHASE.OPEN) return false;
      try { sock.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    }

    /**
     * send(delta) — the ONE door out. Refuses an unknown type LOCALLY, through the store's own
     * enumeration, so the eight-type fence is the same list on both ends of the wire (R-HT-5).
     * This is the fence, NOT authorization: who may send what stays server-side in rights.js.
     */
    function send(delta) {
      if (!delta || typeof delta !== 'object') return false;
      if (!S.isKnownEventType(delta.type)) {
        throw new Error('roomClient.send: unknown event type `' + delta.type + '` (R-HT-5)');
      }
      return rawSend(delta);
    }

    // ── the two emitters ──
    //
    // Both mint their id HERE, at the emit site, because `roomState`'s constructors are
    // deliberately clock-free and RNG-free (R-REI-2). `makeFeedEntry` carrying its id from its
    // first commit is what discharges R-REI-4.
    function emitRoll(o) {
      o = o || {};
      var id = H && H.newEventId ? H.newEventId(rand) : null;
      return send(S.makeRollEvent({
        id: id, faces: o.faces, pool: o.pool, by: memberId, at: now(),
        label: o.label, as: o.as,
      }));
    }

    function emitFeedEntry(text) {
      var id = H && H.newEventId ? H.newEventId(rand) : null;
      return send(S.makeFeedEntry({ id: id, by: memberId, at: now(), text: text }));
    }

    /**
     * leave() — the deliberate exit. Sets `leaving` FIRST so the close handler does not read the
     * socket going away as a drop and start reconnecting against a room nobody is in.
     */
    function leave() {
      leaving = true;
      clearTimer();
      if (current === api) current = null;   // deregister BEFORE the close, so a listener that
                                             // fires synchronously already reads "not in a room"

      var s = sock;
      sock = null;
      if (s) { try { s.close(1000, 'leaving'); } catch (e) {} }
      setPhase(PHASE.CLOSED);
    }

    var api = {
      PHASE: PHASE,
      open: open,
      leave: leave,
      send: send,
      emitRoll: emitRoll,
      emitFeedEntry: emitFeedEntry,
      inRoom: inRoom,
      snapshot: snapshot,
      get: function () { return snapshot(); },
      lastRefused: function () { return lastRefusedFrame; },
      url: function () { return wsUrl(host, code, S.SCHEMA_VERSION); },
    };
    return api;
  }

  var API = {
    inRoomNow: inRoomNow,
    ROOM_SERVER_HOST: ROOM_SERVER_HOST,
    ROOM_PATH: ROOM_PATH,
    PHASE: PHASE,
    UNKNOWN_REFUSAL: UNKNOWN_REFUSAL,
    wsUrl: wsUrl,
    httpUrl: httpUrl,
    preflight: preflight,
    classifyJoinFailure: classifyJoinFailure,
    createRoomClient: createRoomClient,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.SWRPGRoomClient = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
