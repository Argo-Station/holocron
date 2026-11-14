/* lib/shared/holotableView.jsx — HOLOTABLE slice 1, Stage B: the APPROVED COMPONENTS.
 *
 * ONE definition mounted by BOTH apps (the GM's bench-side door and room code; the player's join
 * and refusal; the feed both of them read) — the no-compromise-mirror law, and the same
 * capability-flagged shape `vesselView.jsx` and `yardView.jsx` already use.
 * `window.SWRPGHolotableView`. Classic-script transform via build.mjs, loaded after vendor.js, so
 * React is global and nothing here executes React at load.
 *
 * ── WHAT MAY BE BUILT HERE, AND WHAT MAY NOT (R-MPA-2) ──────────────────────────────────────
 *
 * Jason gave a PARTIAL R-MU1 approval on `Docs/mockups/holotable-substrate.html` — verbatim, "I
 * want to approve the mock parts that arent contested" — and the ruling
 * `holotable-mockup-partial-approval` set the discipline. The split, and it governs every line
 * below:
 *
 *   APPROVED — the COMPONENTS. What each element IS: its content, its copy, its affordance.
 *   DEFERRED — the ARRANGEMENT. Proportions, what shares a screen with what, and specifically
 *              the feed's screen share once a battlemap exists.
 *
 * So every component here is SELF-CONTAINED and styles only ITSELF. None of them positions a
 * sibling, none sets a width on a parent, none assumes what is beside it. That is not tidiness —
 * it is what lets the slice-2 arrangement ruling RECOMPOSE these rather than rebuild them, and it
 * is the `desktopLayout` doctrine (composition only, no style welded into children) applied one
 * layer down.
 *
 * **NO COMPOSITION IS BUILT IN THIS FILE.** There is no screen, no split, no grid that allocates
 * one component a share against another. R-MPA-4 owes the arrangement ruling with revised frames
 * for Jason's approval before any surface settles a proportion; the direction is already set
 * (R-MPA-3: MAP-FIRST — the map owns the canvas, the feed is secondary and retractable, never a
 * standing co-equal split). Anything that composes these into a wide screen cites R-MPA-2 at the
 * composition site so the provisionality stays greppable.
 *
 * ── DARK ────────────────────────────────────────────────────────────────────────────────────
 *
 * Every component consults `SWRPGHolotableEnabled()` at RENDER time and returns null while the
 * flag is off — the F-34 affordance idiom, where the gate is proven by flipping the flag at
 * runtime rather than by reading the source. The flag ships false; nothing here is reachable.
 *
 * ── THE SIXTH APPROVED COMPONENT IS NOT HERE, ON PURPOSE ────────────────────────────────────
 *
 * The stamp lists "the bench ledger row" among the approved six. It is NOT rebuilt here: the
 * bench ledger ALREADY SHIPS in `lib/library/npc/view.jsx` (it is B-304's subject). The mockup
 * drew a simplified four-column version only to give the door somewhere to live; building a
 * second one would be the parallel reimplementation the no-compromise rule forbids. Disclosed in
 * the gate rather than silently skipped.
 */
(function () {
  'use strict';

  var h = React.createElement;
  var D = window.SWRPGDice || null;

  // Render-time gate. Never captured at load — a captured boolean cannot be flipped, and flipping
  // it at runtime is how the suites prove the dark state is real.
  function enabled() {
    return !!(window.SWRPGHolotableEnabled && window.SWRPGHolotableEnabled());
  }

  var ACCENT = 'var(--accent, #7ec4ff)';
  var MUTED = 'var(--text-muted, #9a9a9a)';
  var PRIMARY = 'var(--text-primary, #f2f2f2)';
  var PANEL = 'var(--panel, #12141a)';
  var LINE = 'var(--line, rgba(255,255,255,.14))';
  var CAUTION = 'var(--text-caution, #ffc857)';
  var SUCCESS = 'var(--text-success, #4ecb71)';
  var DANGER = 'var(--text-danger, #ff6b6b)';

  var MONO = 'var(--font-mono), monospace';
  var DISPLAY = 'var(--font-display), sans-serif';

  // Shared leaf styles. Local to this module; no consumer is asked to supply them, and none of
  // them sets a width, a flex-basis or a position — see the arrangement fence above.
  var CARD = {
    border: '1px solid ' + LINE, borderRadius: '10px', background: PANEL, padding: '14px',
  };
  var KICKER = {
    fontFamily: MONO, fontSize: 'var(--fs-xs, 11px)', letterSpacing: '.12em',
    color: MUTED, textTransform: 'uppercase', marginBottom: '8px',
  };

  // AS-6 floor: 44px minimum touch target. Stated once here so no component can drift below it.
  function button(props, label) {
    var ghost = props.ghost;
    return h('button', {
      type: 'button',
      aria: undefined,
      onClick: props.onClick,
      'data-testid': props.testid,
      disabled: !!props.disabled,
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', minHeight: '48px', padding: '12px 16px',
        borderRadius: '9px',
        border: '1px solid ' + (ghost ? LINE : ACCENT),
        background: ghost ? 'transparent' : 'rgba(126,196,255,.12)',
        color: ghost ? MUTED : PRIMARY,
        fontFamily: DISPLAY, fontSize: 'var(--fs-sm, 13px)', letterSpacing: '.1em',
        cursor: props.disabled ? 'default' : 'pointer',
        opacity: props.disabled ? 0.55 : 1,
      },
    }, label);
  }

  // ── 1. THE START-TABLE DOOR ─────────────────────────────────────────────────
  // Lives WITH the bench (R-HT-2, the spine) — but "with" is the CONSUMER's placement, not this
  // component's business. It draws a card and nothing about where the card sits.
  function StartTableDoor(props) {
    if (!enabled()) return null;
    return h('div', { style: CARD, 'data-testid': 'holotable-door' },
      h('div', { style: KICKER }, 'This encounter'),
      button({ onClick: props.onStart, testid: 'holotable-start', disabled: props.busy },
             props.busy ? 'STARTING…' : 'START A TABLE'));
  }

  // ── 2. THE ROOM CODE — the whole ceremony (R-HT-4: no accounts, no PII) ─────
  function RoomCodePanel(props) {
    if (!enabled()) return null;
    var n = Number(props.present);
    if (!isFinite(n) || n < 0) n = 0;
    return h('div', { style: CARD, 'data-testid': 'holotable-roomcode' },
      h('div', { style: KICKER }, 'Table is up'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
        h('span', {
          'data-testid': 'holotable-code',
          style: {
            fontFamily: MONO, fontSize: 'var(--fs-2xl, 26px)', letterSpacing: '.22em',
            color: CAUTION, background: 'rgba(255,200,87,.09)',
            border: '1px solid rgba(255,200,87,.34)', borderRadius: '8px', padding: '8px 14px',
          },
        }, props.code || ''),
        h('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: MONO,
            fontSize: 'var(--fs-xs, 11px)', letterSpacing: '.1em', color: SUCCESS,
            textTransform: 'uppercase',
          },
        },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%',
                               background: SUCCESS, display: 'inline-block' } }),
          n + (n === 1 ? ' here' : ' here'))),
      h('div', { style: { marginTop: '10px' } },
        button({ onClick: props.onClose, ghost: true, testid: 'holotable-close' },
               'CLOSE THE TABLE')));
  }

  // ── 3. JOIN BY CODE ─────────────────────────────────────────────────────────
  function JoinByCode(props) {
    if (!enabled()) return null;
    var value = props.value == null ? '' : String(props.value);
    return h('div', { style: CARD, 'data-testid': 'holotable-join' },
      h('label', { style: KICKER, htmlFor: 'holotable-code-input' }, 'Join a table'),
      h('input', {
        id: 'holotable-code-input',
        'data-testid': 'holotable-code-input',
        value: value,
        onChange: function (e) { if (props.onChange) props.onChange(e.target.value); },
        autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'characters', spellCheck: false,
        'aria-label': 'Table code',
        style: {
          width: '100%', minHeight: '52px',
          // 16px FLOOR: iOS zooms the page when a focused input is under 16px.
          fontSize: 'var(--fs-lg, 20px)', fontFamily: MONO, letterSpacing: '.2em',
          textAlign: 'center', color: PRIMARY, background: 'var(--panel-2, #171a21)',
          border: '1px solid ' + LINE, borderRadius: '9px', padding: '12px',
        },
      }),
      h('div', { style: { marginTop: '10px' } },
        button({ onClick: props.onJoin, testid: 'holotable-join-go',
                 disabled: !value.trim() || props.busy },
               props.busy ? 'JOINING…' : 'JOIN')));
  }

  // ── 4. THE REFUSAL FRAME — ONE SHAPE, TWO REASONS (R-V7S-3, R-NBC-5) ────────
  //
  // The COPY lives here, and only here. The wire carries a machine reason and never a sentence —
  // inventing user copy in the substrate would be building this surface through the back door,
  // which is why the substrate deliberately did not.
  //
  // TWO REASONS NOW SHARE THIS FRAME, and it is one component rather than two on purpose.
  // R-NBC-5 ruled the second refusal gets "its own copy through the APPROVED refusal frame
  // (existing shape, new copy)" — the B-250 precedent. A SIXTH EXPORT would have moved
  // `holotable_ui` leg 1b's exactly-five count, which R-SBC-2 made the durable form of the
  // refusal to rebuild the bench ledger; moving it for a reason unrelated to that refusal is the
  // exact trade the compositions file was created to avoid. C-MU-3 line, stated: this is NEW COPY
  // IN AN APPROVED SHAPE, not a new surface, so no fresh mockup is owed for it.
  //
  //   'room_schema_newer'  the version-gated refusal Jason approved. Copy UNCHANGED, verbatim.
  //   'join_failed'        everything else: the join did not complete, and we do not know it was
  //                        a version problem. Often we CANNOT know — a failed WebSocket handshake
  //                        gives a browser 1006 and no body, and the room server is cross-origin
  //                        (roomClient.js records the measurement). So this copy promises NOTHING
  //                        about versions in EITHER direction: it does not say "reload to update"
  //                        (a false promise), and it does not say "you are up to date" either
  //                        (which we cannot vouch for). It says what happened, then what to try.
  var REFUSAL_KINDS = { VERSION: 'room_schema_newer', FAILED: 'join_failed' };

  function JoinRefused(props) {
    if (!enabled()) return null;
    var failed = props.kind === REFUSAL_KINDS.FAILED;
    return h('div', {
      'data-testid': 'holotable-refused',
      'data-refusal': failed ? REFUSAL_KINDS.FAILED : REFUSAL_KINDS.VERSION,
      style: {
        border: '1px solid rgba(255,107,107,.42)', background: 'rgba(255,107,107,.08)',
        borderRadius: '10px', padding: '16px',
      },
    },
      // The title is the FRAME's, and it is accurate for both — a reader never sees the two side
      // by side, and the body is what says which problem this is.
      h('div', { key: 'title', style: { fontFamily: DISPLAY, fontSize: 'var(--fs-sm, 14px)',
                          letterSpacing: '.07em', color: DANGER, marginBottom: '8px' } },
        'CAN’T JOIN THIS TABLE'),
      failed
        ? h('p', { key: 'body', style: { margin: '0 0 12px', fontSize: 'var(--fs-md, 15px)' } },
            'The join didn’t go through. Check the code with your GM and try again. If it '
            + 'keeps failing, reload the page.')
        : h('p', { key: 'body', style: { margin: '0 0 10px', fontSize: 'var(--fs-md, 15px)' } },
            'This table is running a newer version of the app than you are. Reload the page to '
            + 'update, then use the code again.'),
      // The version line is the version card's ALONE. Printing "table v? · you v?" on a failure
      // whose cause we could not read would be inventing a diagnosis.
      failed ? null
             : h('p', { key: 'vers', style: { margin: '0 0 12px', fontFamily: MONO,
                                              fontSize: 'var(--fs-xs, 12px)', color: MUTED } },
                 'table v' + props.roomSchema + ' · you v' + props.clientSchema),
      // R-NBC-5 (iii): TRY AGAIN FIRST, reload as the second resort. So on the failed card the
      // retry is the primary and reload is the ghost; on the version card reloading IS the fix,
      // and it stays the only button.
      failed
        ? h('div', { key: 'acts', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            button({ onClick: props.onRetry, testid: 'holotable-retry' }, 'TRY AGAIN'),
            button({ onClick: props.onReload, ghost: true, testid: 'holotable-reload' }, 'RELOAD'))
        : button({ onClick: props.onReload, testid: 'holotable-reload' }, 'RELOAD'));
  }

  // ── 5. THE FEED ENTRY ───────────────────────────────────────────────────────
  // ONE entry. NOT a feed: a list is an arrangement, and arrangement is deferred. The consumer
  // maps over its own entries and decides nothing about this card's insides.
  //
  // Glyphs render through the SHIPPED `SWRPGDice.renderPool` / `renderResults`, never a local
  // table. That is the one-core rule, and it also makes the mockup's own worst defect
  // structurally impossible here: those helpers read each symbol's font from `SYMBOLS`, so a
  // result glyph cannot be drawn in the die-shape font and render as an empty box.
  function FeedEntry(props) {
    if (!enabled()) return null;
    var e = props.entry || {};
    var newest = !!props.newest;
    return h('div', {
      'data-testid': 'holotable-feed-entry',
      'data-sym-fill': 'dark',   // D-447 (B-498): the card's dark ground draws the Force family by fill (tokens.css)
      style: {
        border: '1px solid ' + LINE,
        borderLeft: '3px solid ' + (newest ? CAUTION : ACCENT),
        borderRadius: '8px', background: PANEL, padding: '10px 12px',
      },
    },
      h('div', { style: { fontFamily: MONO, fontSize: 'var(--fs-xs, 10px)', letterSpacing: '.11em',
                          color: MUTED, textTransform: 'uppercase', marginBottom: '5px' } },
        e.who || ''),
      e.what ? h('div', { style: { fontSize: 'var(--fs-md, 15px)' } }, e.what) : null,
      (D && e.pool) ? h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap',
                                          alignItems: 'center', marginTop: '7px' } },
                        D.renderPool(e.pool, { size: 1.3, fill: true })) : null,
      (D && e.resolved) ? h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap',
                                              alignItems: 'center', marginTop: '7px' } },
                            D.renderResults(e.resolved, { size: 1.35, fill: D.FILL_WHITE })) : null,   // D-447 rider: light filled white
      e.tally ? h('div', { style: { fontFamily: MONO, fontSize: 'var(--fs-sm, 13px)',
                                    color: PRIMARY, marginTop: '7px' } }, e.tally) : null);
  }

  window.SWRPGHolotableView = {
    StartTableDoor: StartTableDoor,
    RoomCodePanel: RoomCodePanel,
    JoinByCode: JoinByCode,
    JoinRefused: JoinRefused,
    FeedEntry: FeedEntry,
  };
})();
