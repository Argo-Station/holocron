/* lib/shared/holotableCompose.jsx — HOLOTABLE slice 1, Stage B: the NARROW COMPOSITIONS.
 *
 * ONE definition mounted by BOTH apps, like the components it arranges — the no-compromise-mirror
 * law. `window.SWRPGHolotableCompose`. Classic-script transform via build.mjs, loaded after
 * vendor.js and after `holotableView.js`, so React and the components are global.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM `holotableView.jsx` ────────────────────────────────────
 *
 * Because the sentence "NO COMPOSITION IS BUILT IN THIS FILE" is still TRUE over there, and it
 * is worth keeping true. Components and the thing that arranges them are separated in this repo
 * already — `lib/shared/ui.jsx` holds primitives and `lib/shared/desktopLayout.jsx` holds
 * composition ONLY, with no style injected into children (PRAXIS §5). This is that doctrine one
 * layer down: `holotableView.jsx` draws five cards that decide nothing about where they sit, and
 * THIS file is the only place that says what sits above what.
 *
 * It also keeps the components file's guard honest. `test/holotable_ui.cjs` leg 1b pins that
 * module at EXACTLY FIVE exports — the durable form of the refusal to rebuild the bench ledger
 * (ruling `holotable-stage-b-components` R-SBC-2). Adding compositions to that file would have
 * moved that count for a reason the pin was never about.
 *
 * ── WHAT IS APPROVED HERE, AND WHAT IS STILL DEFERRED (R-MPA-2, R-SBC-3) ────────────────────
 *
 * Jason gave a PARTIAL R-MU1 approval on `Docs/mockups/holotable-substrate.html` @ `1feb3d61`,
 * stamped @ `2b31836a`. He approved the COMPONENTS and withheld the ARRANGEMENT — in his words,
 * "things like the feed take up a lot of space for a battlemap product".
 *
 * R-MPA-2 then split the arrangement itself in two:
 *
 *   APPROVED — the NARROW single-column compositions, AS DRAWN. At 390 nothing shares the
 *              screen, so no contested proportion is asserted, and Jason saw exactly these
 *              frames. That is what this file builds.
 *   DEFERRED — any WIDE composition that allocates one thing a SHARE against another live
 *              thing. Specifically the mockup's own `336px 1fr` gm-live split. It is NOT built
 *              here, and R-MPA-4 owes the arrangement ruling with revised frames for Jason's
 *              approval before any surface settles a proportion. The direction is already set
 *              (R-MPA-3: MAP-FIRST — the map owns the canvas, the feed is secondary and
 *              retractable, never a standing co-equal split).
 *
 * ── HOW NEUTRALITY IS DEMONSTRATED, NOT ASSERTED (R-SBC-3) ──────────────────────────────────
 *
 * R-SBC-3 converted R-MPA-2's wide clause into a PER-SITE obligation: every composition site
 * owes a greppable citation and its neutrality shown at its gate. The demonstration this file
 * offers is the strongest one available — **THERE IS NOT A SINGLE WIDTH IN IT.** No grid
 * columns, no flex-basis, no max-width, no viewport units, no pixel width of any kind. Every
 * composition is one column that fills whatever it is put inside and decides nothing about how
 * much of the screen that is. At 390 it is the drawn frame; at 1440 it is a plain stack, which
 * R-MPA-2 names as fine. `test/holotable_compose.cjs` sweeps for all of it and proves the sweep
 * bites by welding the forbidden split in and watching itself catch it.
 *
 * The two numbers that ARE here are the drawn GAPS between stacked cards — 12px for a screen
 * column and 8px between feed entries, read off the mockup's own `.body` and `.feed` rules. A
 * gap between stacked things is not a share of anything.
 *
 * ── DARK ────────────────────────────────────────────────────────────────────────────────────
 *
 * Same render-time gate as the components. One difference matters and it is the whole reason
 * `BenchTable` is shaped the way it is: it is the ONLY composition here that wraps something
 * that ALREADY SHIPS (the bench ledger). While the flag is off it therefore returns its children
 * UNTOUCHED — no wrapper, no column, no DOM change at all. The flag adds the table affordance;
 * it must never be able to take the bench away.
 */
(function () {
  'use strict';

  var h = React.createElement;

  function view() { return window.SWRPGHolotableView || null; }

  // Render-time gate, never captured at load — the components' own idiom, for the same reason:
  // a captured boolean cannot be flipped, and flipping it at runtime is how the suites prove the
  // dark state is real rather than asserted.
  function enabled() {
    return !!(window.SWRPGHolotableEnabled && window.SWRPGHolotableEnabled());
  }

  // The drawn gaps, and nothing else. No width lives in this file — see the header (R-MPA-2).
  var SCREEN_COLUMN = { display: 'flex', flexDirection: 'column', gap: '12px' };
  var FEED_COLUMN = { display: 'flex', flexDirection: 'column', gap: '8px' };

  // ── 1. THE GM BENCH SCREEN (frames "GM · bench, no table · 390" and "· table up · 390") ────
  //
  // R-MPA-2: NARROW AS DRAWN. One column — the table panel above the bench ledger, which is
  // passed in as children and never rebuilt here (it already ships in lib/library/npc/view.jsx).
  // No proportion is asserted: at any width this is a stack, never the mockup's 336px/1fr split.
  //
  // A table is "up" when there is a code to read out. That is the whole state — R-HT-4, no
  // accounts and no session object, so nothing else needs to be consulted to know.
  function BenchTable(props) {
    props = props || {};
    var kids = props.children;
    // DARK: the bench is untouched. Not null — null would delete the ledger.
    if (!enabled()) return kids === undefined ? null : h(React.Fragment, null, kids);
    var V = view();
    if (!V) return kids === undefined ? null : h(React.Fragment, null, kids);
    var code = typeof props.code === 'string' ? props.code.trim() : '';
    var panel = code
      ? h(V.RoomCodePanel, { key: 'panel', code: code, present: props.present,
                             onClose: props.onClose })
      : h(V.StartTableDoor, { key: 'panel', onStart: props.onStart, busy: props.busy });
    return h('div', { style: SCREEN_COLUMN, 'data-testid': 'holotable-bench' },
      panel,
      kids === undefined ? null : kids);
  }

  // ── 2. THE PLAYER JOIN SCREEN (frames "join by code · 390" and "refused · 390") ────────────
  //
  // R-MPA-2: NARROW AS DRAWN. One column holding exactly one card — the entry, or the refusal.
  //
  // BOTH REFUSALS NOW HAVE COPY, and the entry-form fallback is RETIRED (R-NBC-5).
  //
  // What it used to do, and why the change is a fix rather than a widening: `joinDecision` can
  // refuse two ways — a 409 `room_schema_newer` (the version-gated refusal Jason approved) and a
  // 400 `client_version_required` — and only the first had a sentence. Showing the approved card
  // for the other would have told someone to reload when reloading is not the problem, so the
  // increment that built this file fell back to the ENTRY FORM instead: a wrong sentence is worse
  // than no sentence. That fallback was always a placeholder, and it had a cost of its own — a
  // refused player saw a working-looking join box and no reason at all.
  //
  // R-NBC-5 ruled the second refusal its own copy through the APPROVED frame, so the fallback
  // retires here. ANY refusal carrying a reason now shows the frame; the reason selects which
  // copy. `join_failed` is roomClient's `UNKNOWN_REFUSAL` — the honest bucket for every failure
  // that is not the version one, INCLUDING the ones a cross-origin browser cannot read at all.
  //
  // The two tokens are the WIRE's, not this file's inventions, and the guard cross-reads both
  // against their source modules so a rename on either side reds rather than silently showing
  // the wrong card.
  var VERSION_REFUSAL = 'room_schema_newer';   // the wire token; see roomState.joinDecision
  var FAILED_REFUSAL = 'join_failed';          // roomClient.UNKNOWN_REFUSAL

  function JoinTable(props) {
    props = props || {};
    if (!enabled()) return null;
    var V = view();
    if (!V) return null;
    var r = props.refusal;
    var reason = (r && typeof r.error === 'string') ? r.error : '';
    var kind = reason === VERSION_REFUSAL ? VERSION_REFUSAL : FAILED_REFUSAL;
    return h('div', { style: SCREEN_COLUMN, 'data-testid': 'holotable-join-screen' },
      reason
        ? h(V.JoinRefused, { kind: kind, roomSchema: r.roomSchema, clientSchema: r.clientSchema,
                             onReload: props.onReload, onRetry: props.onRetry })
        : h(V.JoinByCode, { value: props.value, onChange: props.onChange,
                            onJoin: props.onJoin, busy: props.busy }));
  }

  // ── 3. THE SHARED FEED (frames "Shared feed · 390" and "· 1024") ───────────────────────────
  //
  // R-MPA-2: NARROW AS DRAWN, and the 1024 frame is the SAME column — it is the wide frames with
  // a 336px/1fr SPLIT that are deferred, not every frame that happens to be wide. This column
  // asserts no share against anything, because it holds no width.
  //
  // Newest first, and the newest entry is the marked one — that is what the frames draw, and the
  // marking is FeedEntry's own business; this only says which entry is first.
  //
  // NO EMPTY STATE. The mockup never drew one, so there is no approved copy for it and none is
  // invented: an empty feed renders nothing at all.
  function Feed(props) {
    props = props || {};
    if (!enabled()) return null;
    var V = view();
    if (!V) return null;
    var entries = Array.isArray(props.entries) ? props.entries : [];
    if (!entries.length) return null;
    return h('div', { style: FEED_COLUMN, 'data-testid': 'holotable-feed' },
      entries.map(function (e, i) {
        var key = (e && e.id != null) ? String(e.id) : ('i' + i);
        return h(V.FeedEntry, { key: key, entry: e, newest: i === 0 });
      }));
  }

  window.SWRPGHolotableCompose = {
    BenchTable: BenchTable,
    JoinTable: JoinTable,
    Feed: Feed,
  };
})();
