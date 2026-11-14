/* lib/shared/roomSession.jsx — THE REACT BINDING FOR THE ROOM CLIENT. One hook, both apps.
 *
 * `window.SWRPGRoomSession`. Classic-script transform via build.mjs, loaded after vendor.js.
 *
 * ── WHY THIS EXISTS AS A SHARED FILE ────────────────────────────────────────────────────────
 *
 * Because the alternative is each app writing its own `useState` glue around `createRoomClient`,
 * and two pieces of glue around one transport is the parallel reimplementation the
 * no-compromise-mirror law forbids — the same reason there is one `roomState`, one `roomFeed` and
 * one `roomClient`. The two apps enter a room from different doors and with different identities;
 * they do not need two ways of HOLDING one.
 *
 * It is deliberately NOT in `holotableCompose.jsx`. That file's whole discipline is that it
 * arranges and decides nothing else; a hook that owns a socket, a lifecycle and a retry policy
 * would be logic living in the composition layer, and the next reader would reasonably conclude
 * compositions may hold state.
 *
 * ── WHAT IT OWNS ────────────────────────────────────────────────────────────────────────────
 *
 * One client instance per session, its snapshot mirrored into React state, and the two doors:
 * `startTable()` (GM — mints a code) and `joinTable(typed)` (player — canonicalizes what was
 * typed). Everything else it forwards.
 *
 * ── IDENTITY IS PER-SESSION AND PERSISTED NOWHERE (R-HT-4) ──────────────────────────────────
 *
 * `memberId` is minted fresh when a session starts, from the same opaque generator event ids use.
 * It is NOT stored, and that is a choice rather than an omission: a device-stable id would be a
 * new persisted shape (an R-Y2-1 question nobody has asked), and it would buy nothing this slice
 * needs. Reloading mid-table re-joins as a new roster entry, and the old one drops when its socket
 * closes — which is exactly what `webSocketClose`'s roster removal already does. Nothing about a
 * participant survives the tab.
 *
 * ── DARK ────────────────────────────────────────────────────────────────────────────────────
 *
 * The hook itself is not flag-gated, and must not be: hooks cannot be called conditionally, so a
 * gate here would be a rules-of-hooks violation waiting for the first consumer that renders both
 * states. The GATE IS THE SURFACE'S — every composition already returns null while the flag is
 * off, so a session that is never started reaches no socket. `startTable`/`joinTable` refuse while
 * the flag is off as a second fence, so a stray caller cannot open a connection in the dark.
 */
(function () {
  'use strict';

  function holo() { return window.SWRPGHolotable || null; }
  function client() { return window.SWRPGRoomClient || null; }

  function enabled() {
    return !!(window.SWRPGHolotableEnabled && window.SWRPGHolotableEnabled());
  }

  function useRoomSession(opts) {
    opts = opts || {};
    var side = opts.side === 'npc' ? 'npc' : 'pc';
    var name = typeof opts.name === 'string' ? opts.name : '';

    var ref = React.useRef(null);
    var [snap, setSnap] = React.useState(null);
    var [typed, setTyped] = React.useState('');
    var [busy, setBusy] = React.useState(false);

    // The client calls back on every phase, state and feed change; mirroring the whole snapshot
    // rather than picking fields keeps this file from becoming a second place that knows the
    // session's shape.
    var mounted = React.useRef(true);
    React.useEffect(function () {
      return function () {
        mounted.current = false;
        if (ref.current) { try { ref.current.leave(); } catch (e) {} }
      };
    }, []);

    function begin(code) {
      var C = client(); var H = holo();
      if (!C || !H || !enabled() || !code) return false;
      if (ref.current) { try { ref.current.leave(); } catch (e) {} }
      setBusy(true);
      ref.current = C.createRoomClient({
        code: code,
        // Opaque, per-session, persisted nowhere — see the header.
        memberId: H.newEventId(),
        name: name,
        side: side,
        onChange: function (s) {
          if (!mounted.current) return;
          setSnap(s);
          if (s.phase !== 'joining' && s.phase !== 'reconnecting') setBusy(false);
        },
      });
      ref.current.open();
      return true;
    }

    return {
      // what the compositions read.
      //
      // TWO FORMS OF ONE CODE, and the split is deliberate. `code` is CANONICAL — six characters,
      // no separator — and is what logic compares and what the wire carries. `codeDisplay` is the
      // 3-3 grouped form R-WRC-1 permits and the ruling's own summary puts on screen ("K7W-Q4M"),
      // because reading the code out IS the ceremony `RoomCodePanel` was drawn for and grouping
      // serves speech. Formatting is done ONCE, here, rather than at each mount — two mounts
      // formatting the same string their own way is how two apps end up showing two codes.
      snap: snap,
      code: snap && snap.phase !== 'refused' && snap.phase !== 'closed' ? snap.code : '',
      codeDisplay: (function () {
        var H = holo();
        var c = snap && snap.phase !== 'refused' && snap.phase !== 'closed' ? snap.code : '';
        return (c && H) ? H.formatRoomCode(c) : '';
      })(),
      present: snap ? snap.present : 0,
      entries: snap ? snap.entries : [],
      refusal: snap ? snap.refusal : null,
      busy: busy,
      typed: typed,
      inRoom: function () { return !!(ref.current && ref.current.inRoom()); },

      // the GM's door: mint, then dial.
      startTable: function () {
        var H = holo();
        if (!H || !enabled()) return false;
        return begin(H.newRoomCode());
      },
      // the player's door: canonicalize what was typed, THEN validate — the ruled order (R-WRC-1).
      joinTable: function (raw) {
        var H = holo();
        if (!H || !enabled()) return false;
        var code = H.canonicalizeRoomCode(raw === undefined ? typed : raw);
        if (!H.isRoomCode(code)) return false;
        return begin(code);
      },
      onTyped: setTyped,
      // A retry re-dials the code the player already typed — R-NBC-5's "try again first".
      retry: function () { return ref.current ? (ref.current.open(), true) : false; },
      leave: function () {
        if (ref.current) { try { ref.current.leave(); } catch (e) {} }
        setSnap(null);
        setBusy(false);
      },
      emitRoll: function (o) { return ref.current ? ref.current.emitRoll(o) : false; },
      emitFeedEntry: function (t) { return ref.current ? ref.current.emitFeedEntry(t) : false; },
    };
  }

  window.SWRPGRoomSession = { useRoomSession: useRoomSession };
})();
