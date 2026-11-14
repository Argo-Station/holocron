/* lib/shared/ui.jsx — shared UI primitives (Phase 1b, reference-layer step 1, layer B).
 *
 * IIFE extending window.SWRPGUI, compiled into /vendor.js by build.mjs (alongside diceUI.jsx),
 * loaded by all three app shells before their app bundle. Components use h = React.createElement
 * and consume the 1a font tokens (var(--font-*) from lib/shared/tokens.css). React is read off the
 * global (set by the vendor React bundle, which precedes this IIFE in vendor.js).
 *
 * Canonical bodies = the seat-verified clean-merge winners (ruling phase1b-scope, 7 of 8). StatBox
 * is the player superset (optional onClick); the rest are byte-/render-identical between the apps.
 * BehaviorRow is DELIBERATELY NOT here — gm's copy pipes text through renderDescription() for FFG
 * dice-glyph rendering (NPC-vet fix), so it is a divergent design call → Phase 2 (R-UI-B3). DicePool
 * is likewise app-local (divergent renderer); only its pure helper ffgDicePool is shared.
 *
 * Radii (4/6px) ride along as literals — radii/colour tokens are deferred (D-UI3); when added they go
 * in tokens.css consumed via var(), never hardcoded here (R-UI-A2).
 */
(function () {
  var h = React.createElement;

  // F-9/F-96 one-shot: warm the variant packs' manifests once per page so the GAME VARIANTS
  // card's DERIVED "Covers …" sentence has something true to say. MODULE SCOPE on purpose — the
  // card sits inside a conditional IIFE where a hook would be an ordering violation.
  var _respecWarmed = false;
  var useRef = React.useRef, useCallback = React.useCallback, useState = React.useState, useEffect = React.useEffect;

  // AS-6's tap floor, as ONE number. The four mid-session reference cards (CritTableRef,
  // ResultsReference, ManeuversCard, RecoveryCard) render in the player sheet's rail, the Dice app
  // and the GM's NPC view, and every control in them sat under the floor — 24px to 31px — because
  // each card set its own padding and nothing ever measured them. Named so the next card copies a
  // constant instead of a number that happened to look right. (`ADAPTIVE_STANDARD.md` AS-6; ruling
  // `sheet-rail-reference-overlap`.)
  var TAP = 44;

  // The narrowest a symbol-stepper cell may be and still hold what it must: two TAP-sized buttons, the
  // counter between them (12px), the two 7px gaps, and the cell's own 3px side padding. Derived, not
  // guessed — if TAP moves, this moves with it.
  var STEP_CELL_MIN = 2 * TAP + 12 + 2 * 7 + 2 * 3;   // 120

  // UXQP-38: arm the back-gesture ONLY when the drag starts within the left edge
  // zone (~28px, iOS convention) so mid-screen leftward panning no longer exits.
  var SWIPE_BACK_EDGE_PX = 28;
  function useSwipeBack(onBack) {
    const startX = useRef(null);
    const startY = useRef(null);
    const armed = useRef(false);
    const onTouchStart = useCallback(e => {
      const x = e.touches[0].clientX;
      startX.current = x;
      startY.current = e.touches[0].clientY;
      armed.current = x <= SWIPE_BACK_EDGE_PX;
    }, []);
    const onTouchEnd = useCallback(e => {
      if (startX.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (armed.current && dx > 65 && Math.abs(dy) < Math.abs(dx) * 0.65) onBack();
      startX.current = null;
      armed.current = false;
    }, [onBack]);
    return { onTouchStart, onTouchEnd };
  }

  var WIPE_DURATIONS = { wipeHorizontal: 1.3, wipeDiagonal: 1.3, wipeIris: 1.1 };

  // Scan-line section header.
  // `count` is OPTIONAL and additive (F-86 face conformance): Mock 2's band heads carry a count on
  // the right ("2 carried"). Every existing caller omits it and renders exactly as before — this
  // is a widened shared component rather than a second header implementation on one surface.
  function SectionHeader({ label, accent, count }) {
    return h('div', { style: {
      fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-xs)',   /* Jason 2026-07-20: section head display + accent (matches cockpit LedgerHead) */
      letterSpacing: '0.18em', color: accent,
      textShadow: '0 0 12px ' + accent + '55',
      borderLeft: '2px solid ' + accent,
      background: 'linear-gradient(90deg, ' + accent + '0F 0%, transparent 70%)',
      padding: '6px 10px', margin: '14px 0 10px',
      display: count ? 'flex' : 'block', alignItems: 'center', gap: 10,
    }}, label,
      count ? h('span', { style: {
        marginLeft: 'auto', fontFamily: 'var(--font-body)', fontWeight: 400,
        fontSize: 'var(--fs-xs)', letterSpacing: '0.04em', textShadow: 'none',
        color: 'rgba(255,255,255,0.45)',
      } }, count) : null);
  }

  // Label + value tile. Optional onClick makes it tappable (player superset).
  function StatBox({ label, value, accent, color, onClick }) {
    return h('div', {
      onClick: onClick,
      style: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 4px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid ' + accent + '1F',
        borderRadius: 4, minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
      }},
      h('div', { style: {
        fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--fs-xs)',   /* §2: caps stat label → mono */
        letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)',
        marginBottom: 3,
      }}, label),
      h('div', { style: {
        /* F-52 over-promotion fix (ruling loadout-credits-enc-clip-triage §3): the original 18px value
           fell into the coarse "xl" bucket (20–26px) and spilled the longest-label tile (ENCUMBRANCE) in
           the LOADOUT credits row. --fs-lg (17.5–22px) is 18px's true home; fixes all 13 StatBox tiles. */
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)',
        color: color || '#fff', lineHeight: 1,
      }}, value)
    );
  }

  function PrimaryButton({ label, onClick, accent, disabled }) {
    return h('button', {
      onClick: disabled ? undefined : onClick,
      style: {
        width: '100%', padding: '14px 18px',
        background: disabled ? 'rgba(255,255,255,0.04)' : accent + '22',
        border: '1px solid ' + (disabled ? 'rgba(255,255,255,0.08)' : accent + '55'),
        borderRadius: 6,
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: 'var(--fs-xs)', letterSpacing: '0.16em',
        color: disabled ? 'rgba(255,255,255,0.25)' : accent,
        cursor: disabled ? 'default' : 'pointer',
        textShadow: disabled ? 'none' : '0 0 12px ' + accent + '66',
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}, label);
  }

  // Premium hub card — the launchpad's card treatment, generalized + accent-parameterized so
  // GM/Player/Dice all consume ONE card (no per-app reimpl). ONE accent as punctuation
  // (border + corner-glow + optional eyebrow + chevron); WHITE title; layered depth; <100ms :active.
  // Props: { eyebrow?, label, sub?, accent, onClick, wide?, ariaLabel?, minHeight?, index?, glass?, compact? }
  // index → staggered entrance delay (the .hubcard-enter cascade, lib/shared/tokens.css).
  // glass → translucent dark fill (intro-pill opacity) so an animated backdrop shows around it; the
  //   accent corner-glow + border stay. Default = the solid premium gradient (launchpad/Player).
  // compact → GROUP the text (eyebrow→title→sub, no marginTop:auto spread) + content-height (no min
  //   stretch). For short grid cells. Default = the tall spread layout (launchpad/Player), UNCHANGED.
  // expandable + bgImage → the Player-landing ACCORDION variant: a full-bleed art card that expands on
  //   tap (collapsed shows eyebrow→title→sub→tap-cue; open shows title + description + tap-to-begin),
  //   using HubCard's premium type. Opt-in — the flat default (launchpad/GM/Dice) is UNCHANGED.
  //   Extra props: { expandable, bgImage?, isOpen, anyOpen, onExpand, description?, detail?, tapCue?,
  //                  kenBurns?, collapsedH? }
  //   detail → OPTIONAL node rendered in the OPEN state, under the description and above the tap cue.
  //     Added for D3 (the creator's game-line step), whose open card carries a structured block —
  //     CAREERS / CAMPAIGN MECHANIC / THE FORCE — that `description` (a prose slot capped at 320px)
  //     cannot hold. The caller owns its content and its styling; this slot adds no styling of its
  //     own beyond the spacing that separates it from the cue. UNSTYLED AND OPTIONAL, so the Landing
  //     — which passes no `detail` — renders byte-identically to what shipped.
  //     Extending the shared primitive rather than forking it is AS-1: two arrangements of the same
  //     content are legal, two implementations are not, and the ruling names a bespoke accordion as
  //     a REJECTED SHAPE rather than a build detail.
  function HubCard({ eyebrow, label, sub, accent, onClick, wide, ariaLabel, minHeight, index, glass, compact,
                     expandable, bgImage, isOpen, anyOpen, onExpand, description, detail, tapCue, kenBurns, collapsedH, tourId, staticOpen, flat, door }) {
    var a = accent || '#3AB5FF';
    // `flat` — R-DI1 conformance for a surface that has come under DESIGN_IDENTITY (the Player landing).
    // It takes OFF the four AI-UI tells this card was carrying and nothing else: the accent corner-glow
    // and the accent gradient wash (#5 glow-as-depth), the title's glow halo (#5), and the accent-tinted
    // border that made every card look lit (#4's rounded-glowing-card costume). Structure, spacing, copy
    // and behaviour are untouched — depth becomes a hairline + the honest plate shadow the card already
    // had. Opt-in, so the GM and dice surfaces that also render HubCard are unaffected.
    var line = 'rgba(255,255,255,0.13)';
    const [pressed, setPressed] = useState(false);

    // ── Expandable + art variant (Player landing) — accordion shell, HubCard type ──
    if (expandable) {
      var open = !!isOpen;
      // strip: a SIBLING is open, so this card compresses to a slim eyebrow/title-only strip (collapsedH,
      // ~56px) — freeing real height for the open card's description + art (player-landing-accordion fix).
      var strip = !open && anyOpen;
      var press = {
        onPointerDown: function () { setPressed(true); },
        onPointerUp: function () { setPressed(false); },
        onPointerLeave: function () { setPressed(false); },
        onPointerCancel: function () { setPressed(false); },
      };
      var arrow = function (sz) {
        return h('svg', { width: sz, height: sz, viewBox: '0 0 14 14', fill: 'none', style: { color: a } },
          h('line', { x1: 1, y1: 7, x2: 13, y2: 7, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
          h('polyline', { points: '8,2 13,7 8,12', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      };
      return h('div', Object.assign({
        'data-tour-id': tourId,
        'data-landing-door': door,   // B-645: the landing's driver hook (the door's id), stamped by the caller
        onClick: function () { if (open) { if (onClick) onClick(); } else if (onExpand) onExpand(); },
        style: {
          // launchpad-style distinct tile (player-landing-cards-v2): bordered + rounded + layered depth,
          // dimmed-image bg, chevron. Expands on tap (flex grow). Replaces the flush image-accordion.
          position: 'relative', overflow: 'hidden', cursor: 'pointer', touchAction: 'manipulation',
          flex: open ? '1 1 0' : (anyOpen ? ('0 0 ' + (collapsedH || 96) + 'px') : '1 1 0'),
          transition: 'flex .55s cubic-bezier(.4,0,.2,1), border-color .2s ease',
          borderRadius: '16px',
          // flat (landing) cards are SOLID: the translucent scrim over an OPAQUE black base composites to
          // exactly the near-black plate it always was over the #000 body — but now it stops the drifting
          // starfield behind it from showing THROUGH the card (Jason 2026-08-18). GM/Dice never pass flat.
          background: flat ? '#000' : undefined,
          border: '1px solid ' + (flat ? line : a + (open ? '7A' : '52')),
          boxShadow: pressed ? 'none' : 'var(--depth-card, 0 1px 0 rgba(255,255,255,.07) inset, 0 10px 24px rgba(0,0,0,.40))',
        },
      }, press),
        bgImage ? h('div', { 'aria-hidden': true, style: {
          position: 'absolute', inset: '-10%', zIndex: 0,
          backgroundImage: 'url(' + bgImage + ')', backgroundSize: 'cover', backgroundPosition: 'center center',
          animation: (open && kenBurns) ? (kenBurns + ' 8s ease-in-out infinite alternate') : 'none',
          willChange: open ? 'transform' : 'auto',
        }}) : null,
        h('div', { 'aria-hidden': true, style: {
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', transition: 'background .55s ease',
          background: open
            ? 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,.15) 40%, rgba(0,0,0,.75) 100%)'
            : (flat ? '' : 'radial-gradient(120% 140% at 0% 0%, ' + a + '1A, transparent 60%), ')   // accent corner-glow — off when flat (#5)
              + 'linear-gradient(180deg, rgba(2,8,16,.72) 0%, rgba(2,8,16,.66) 45%, rgba(2,8,16,.84) 100%)',  // DIMMED image scrim
        }}),
        h('div', { 'aria-hidden': true, style: {
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '120px', zIndex: 2, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 0%, ' + a + ' 100%)',
          opacity: flat ? 0 : (open ? 0.16 : 0.05), transition: 'opacity .55s ease',
        }}),
        // Open-state text-zone scrim: the open gradient is at its WEAKEST (.15) mid-card,
        // exactly where the expanded copy sits over bright art — unreadable. This darkens the
        // lower ~70% so body text clears WCAG 4.5:1; art stays visible in the upper card.
        open ? h('div', { 'aria-hidden': true, style: {
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%', zIndex: 3, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,.82) 62%)',
        }}) : null,
        h('div', { style: {
          position: 'absolute', inset: 0, zIndex: 4, display: 'flex', flexDirection: 'column',
          // BOTTOM-ALIGNED BY MARGIN, NOT BY JUSTIFICATION — and that difference is a bug fix, not a
          // preference. With `justifyContent:'flex-end'` on a scroll container, content taller than
          // the box overflows the TOP and the start of it is UNREACHABLE: you cannot scroll to it.
          // The card is `overflow:hidden`, so the eyebrow and title were simply cut off.
          // FOUND AT A RULED GEOMETRY, not a hypothetical one: D3 requires three cards without page
          // scroll at 1366x768, and there the open card gets 365px for 414px of content — clipped by
          // 69px (55px at 1024x768, 118px on a 667-tall phone). `marginTop:auto` keeps the content
          // bottom-aligned whenever there IS room and lets it scroll from the top when there is not.
          // AS-4's own words: a zone either shows its content or scrolls it, never truncates it.
          justifyContent: open ? 'flex-start' : 'center',
          overflowY: open ? 'auto' : 'hidden',
          padding: open ? '0 18px 20px' : (strip ? '8px 18px' : '14px 18px'),
        }},
          open
            // staticOpen: a PERMANENT hero (Player landing Custom-hero re-weight, R-OGG1-9) — its content
            // is present from first paint, NOT faded-in. The fadeUp is right for a card the user just
            // expanded; on an always-open hero it would flash the title in on every landing load (and hide
            // it from immediate interaction). opacity 1, no animation.
            ? h('div', { style: Object.assign({ marginTop: 'auto', flexShrink: 0 },
                staticOpen ? { opacity: 1 } : { animation: 'fadeUp .45s ease forwards .2s', opacity: 0 }) },
                h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '.22em', textTransform: 'uppercase', color: a, opacity: .7, marginBottom: '6px' } }, eyebrow),
                h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-2xl)', lineHeight: 1, color: '#fff', letterSpacing: '.02em', textTransform: 'uppercase', marginBottom: '10px', textShadow: flat ? 'none' : '0 0 40px ' + a + '55' } }, label),   /* §2: card title → display UPPERCASE (ban 11) */
                h('div', { style: { height: '1px', width: '60px', background: a, opacity: .5, marginBottom: flat ? '8px' : '12px' } }),
                description ? h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)', lineHeight: 1.6, color: 'rgba(255,255,255,.7)', marginBottom: flat ? '8px' : '18px', maxWidth: '320px' } }, description) : null,
                detail ? h('div', { 'data-hubcard-detail': '1', style: { marginBottom: '18px' } }, detail) : null,
                /* B-437's THIRD site, and the brief that carded this class found only two — it
                   grepped the apps' jsx and the css, not the SHARED jsx, so the one instance that
                   ships on BOTH apps was the one it missed. Same declaration, same unguardable
                   inline form. Its 2.2s rhythm is kept through `--breathe-dur`. */
                // `tapCue={false}` draws no cue: a caller whose cue is cut (copy-voice-sweep player/app.jsx:31693:20, D-289) is never refilled.
                tapCue === false ? null : h('div', { className: 'breathing-text', style: { display: 'flex', alignItems: 'center', gap: '8px', '--breathe-dur': '2.2s' } },
                  h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '.22em', color: a } }, tapCue || 'TAP TO BEGIN'), arrow(14)))
            : h(React.Fragment, null,
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 } },
                  h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '.22em', textTransform: 'uppercase', color: a } }, eyebrow),
                  h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xl)', letterSpacing: '.02em', textTransform: 'uppercase', color: '#fff', textShadow: flat ? 'none' : '0 0 18px ' + a + '33' } }, label),   /* §2: card title → display UPPERCASE (ban 11) */
                  (sub && !strip) ? h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', letterSpacing: '.02em', color: 'rgba(255,255,255,.55)' } }, sub) : null),
                // launchpad corner chevron (›)
                h('span', { 'aria-hidden': true, style: {
                  position: 'absolute', top: '16px', right: '18px', width: '9px', height: '9px',
                  borderTop: '2px solid ' + a + 'A6', borderRight: '2px solid ' + a + 'A6', transform: 'rotate(45deg)',
                }}))
        )
      );
    }

    var fill = glass
      ? 'linear-gradient(160deg, rgba(2,11,20,.75), rgba(2,11,20,.66))'   // translucent dark glass (start .75)
      : 'linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.02))';
    return h('button', {
      type: 'button', onClick: onClick, 'aria-label': ariaLabel || label, 'data-landing-door': door,
      className: 'hubcard-enter',
      onPointerDown: () => setPressed(true),
      onPointerUp: () => setPressed(false),
      onPointerLeave: () => setPressed(false),
      onPointerCancel: () => setPressed(false),
      style: {
        gridColumn: wide ? '1 / -1' : 'auto',
        animationDelay: ((index || 0) * 55) + 'ms',
        position: 'relative', display: 'flex', flexDirection: 'column', gap: compact ? '3px' : '4px',
        minHeight: minHeight || (compact ? 'auto' : (wide ? '60px' : '92px')),
        textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        color: '#fff', borderRadius: '16px', padding: '16px 18px',
        border: '1px solid ' + (flat ? 'rgba(255,255,255,0.13)' : a + '7A'),
        // flat (landing): append an opaque black base so the near-transparent fill stops transmitting the
        // drifting starfield — same plate look over #000, now genuinely solid (Jason 2026-08-18).
        background: (flat ? '' : 'radial-gradient(130% 170% at 0% 0%, ' + a + '4D, transparent 62%), ') + fill + (flat ? ', #000' : ''),
        boxShadow: 'var(--depth-card, 0 1px 0 rgba(255,255,255,.07) inset, 0 10px 24px rgba(0,0,0,.40))',
        transform: pressed ? 'scale(.99)' : 'none',
        transition: 'transform 120ms ease, border-color 120ms ease',
      }},
      eyebrow ? h('div', { style: {
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.22em',
        textTransform: 'uppercase', color: a,
      }}, eyebrow) : null,
      h('div', { style: {
        marginTop: (eyebrow && !compact) ? 'auto' : 0,   // compact groups the text; default spreads it
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)',
        letterSpacing: '0.04em', color: '#fff',          // WHITE title (the premium tell)
      }}, label),
      sub ? h('div', { style: {
        fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', letterSpacing: '0.02em',
        lineHeight: 1.3, color: 'rgba(255,255,255,.58)',
      }}, sub) : null,
      h('span', { 'aria-hidden': true, style: {     // angular chevron (corner of a square)
        position: 'absolute', top: '16px', right: '18px', width: '9px', height: '9px',
        borderTop: '2px solid ' + a + 'A6', borderRight: '2px solid ' + a + 'A6',
        transform: 'rotate(45deg)',
      }})
    );
  }

  // Compute FFG dice pool: higher of char/rank = total dice, lower = upgrades to proficiency.
  function ffgDicePool(charValue, skillRank) {
    var total = Math.max(charValue || 0, skillRank || 0);
    var upgrade = Math.min(charValue || 0, skillRank || 0);
    var pool = [];
    var i;
    for (i = 0; i < upgrade; i++) pool.push('proficiency');
    for (i = upgrade; i < total; i++) pool.push('ability');
    return pool;
  }

  // The three suite apps (Tier-1 launchpad is the ⌂ home, not a switcher app). Accents pre-cleared to
  // WCAG on the dark base (navigation-phase1-recon §10: blue 7.73:1 / gold 12.01:1 / violet 6.70:1).
  var SUITE_APPS = [
    { id: 'player', name: 'PLAYER DATAPAD', href: '/player/', accent: '#4EAAFF' },
    { id: 'gm',     name: 'GM HOLOCRON',    href: '/gm/',     accent: '#F5C842' },
    { id: 'dice',   name: 'HOLODICE',       href: '/dice/',   accent: '#B080FF' },
  ];

  // ── THE CONFLICT PROMPT (ruling f34-conflict-prompt §4) ────────────────────────────────────
  // The question the merge asks when it genuinely cannot decide. ONE sheet listing every open
  // question as a binary choice, dismissible without penalty, re-openable from the account chip.
  // Not a merge wizard: no diff viewer, no per-field editor, no "keep both" — those are simulators
  // of a tool, and the four-gate Subtraction test rejects them. This REMOVES a silent decision.
  //
  // R-CP-1 says the copy is written per key CLASS, mundane case first — the ordinary question is
  // "your two devices have different books switched on", not "two versions of one character".
  //
  // ONE PREMISE IN THE RULING DID NOT SURVIVE CONTACT WITH THE DATA, and is built to intent rather
  // than to letter (the mechanism-premise law's counterpart duty). The ruling's illustrative copy
  // is "This device has 12 books on. Your account has 9." That number is not derivable from what
  // is stored: `swrpg_active_sources` is `{version, override:{bookId:true|false}}`, where a book
  // ABSENT from `override` sits at its group's default — so "how many are on" needs the whole book
  // vocabulary, which the bar does not have. What IS derivable from the two stored values, exactly
  // and cheaply, is WHICH BOOKS DIFFER — which is also more useful than either total. So the copy
  // names the difference rather than counting the sides.
  // A book's real title if the vocabulary happens to be loaded in this app, otherwise the id made
  // readable. The prompt must not DEPEND on the index — it is raised by the bar, which has no
  // guarantee the book registry is present — but when the registry is there, a person should see
  // the title they know rather than a slug.
  // ── CONFLICT-COPY REGION START ────────────────────────────────────────────────────────────
  // Everything down to REGION END is plain JS with no JSX and no React reference, and
  // test/sync_pins_key.cjs slices exactly this span out and evaluates it so its asserts run the
  // SHIPPED text rather than a copy of it (ui.jsx cannot be required — it is a browser IIFE).
  // Keep it that way: a JSX expression or a React call in here turns that guard into a crash, and
  // the guard fails loudly on a missing marker rather than silently asserting nothing.

  // THE readable-slug transform, used by every conflict line that has an id and no vocabulary.
  // Title-case, but leave the joining words alone — a blunt \b\w upper produced "Ghosts Of
  // Dathomir", which is the kind of small wrongness that reads as carelessness about the books.
  // Hoisted out of bookTitle when the pins copy needed the same rule (R-F5-1): two callers is where
  // a transform gets its own name, not eight (ADR 0025).
  var SMALL_WORDS = { of: 1, the: 1, and: 1, a: 1, an: 1, to: 1, in: 1, on: 1, for: 1 };
  // Ordinals, because planet slugs carry them constantly ("althir_iii", "andelm_iv") and plain
  // title-case renders "Althir Iii" — the same carelessness as "Ghosts Of Dathomir", one aisle over.
  // A WHITELIST, not a roman-numeral regex: a general matcher upper-cased "di" in "Cmaoli Di" to
  // "DI" (a legal roman 501) and would do the same to any word spelled from i/v/x/l/c/d/m. Measured
  // over the whole shipping planet set: 19 names fixed, 0 broken, and 0 of the 64 book ids change.
  var ORDINALS = { ii: 1, iii: 1, iv: 1, vi: 1, vii: 1, viii: 1, ix: 1, xi: 1, xii: 1, xiii: 1, xiv: 1, xv: 1 };
  function readableId(id) {
    return String(id == null ? '' : id).replace(/_/g, ' ').split(' ').map(function (w, i) {
      if (i > 0 && SMALL_WORDS[w]) return w;
      if (i > 0 && ORDINALS[w]) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  // B-1514 (card f100-surfacing-roll-options-card ADDENDUM 58 ITEM 1, ruled at 62): through the ONE source-string → label
  // resolver, SWRPGSources.sourceLabel (F-102 A3), over the loaded index. It read `SWRPGSources.index()`, which sources.js
  // never exported, so every title fell to the readable id ("Eote on").
  function bookTitle(id) {
    try {
      var src = typeof window !== 'undefined' && window.SWRPGSources;
      var lab = src && src.sourceLabel ? src.sourceLabel(window._swrpgSourcesIndex || null, id) : null;
      if (lab && lab !== id) return lab;
    } catch (e) { /* the readable id below is always good enough */ }
    return readableId(id);
  }

  // B-134: a stored variant stamp ("respecialized@eote-v1") as a person reads it — the loaded pack's own manifest label
  // ("reSpecialized — Edge of the Empire"); when the pack is not loaded (the bar has no guarantee it is), the mod's
  // plain name and the line's book title, the way bookTitle degrades. A value with no "@" is not a stamp: unchanged.
  function modTitle(stamp) {
    var s = String(stamp == null ? '' : stamp), at = s.indexOf('@');
    if (at < 0) return s;
    var M = null;
    try {
      M = typeof window !== 'undefined' && window.SWRPGMods;
      var v = M && M.variantOf && M.variantOf(s);
      if (v && v.label) return v.label;
    } catch (e) { /* the fallback below is always readable */ }
    var mod = s.slice(0, at), line = s.slice(at + 1).replace(/-v\d+$/, '');
    var name = (M && M.PLAIN_LABELS && M.PLAIN_LABELS[mod]) || readableId(mod);
    return line ? name + ' \u2014 ' + bookTitle(line) : name;
  }

  var CONFLICT_COPY = {
    swrpg_active_sources: {
      title: 'Which books are switched on',
      // B-1735 (ADDENDUM 560): a book differs when its RESOLVED setting differs, by SWRPGSources' one derivation. The stored
      // maps alone cannot say: setBook keeps an official book as `false` or absent, and `!!` read those two alike, so no
      // official book was ever named. With no vocabulary (it failed, or this is a bare slice with no window) absent reads as
      // the opposite of the side that holds the book, which is true of everything setBook writes.
      describe: function (v, other) {
        var S = typeof window !== 'undefined' && window ? window.SWRPGSources : null;
        var index = S ? window._swrpgSourcesIndex : null;
        var known = !!(index && index.byId && Object.keys(index.byId).length);
        var stateOf = function (x) { return S ? S.normalize(x) : { override: (x && x.override) || {} }; };
        var a = stateOf(v), b = stateOf(other);
        var has = function (m, k) { return Object.prototype.hasOwnProperty.call(m, k); };
        var isOn = function (mineSide, theirSide, k) {
          if (known) return S.isBookActive(index, mineSide, k);
          return has(mineSide.override, k) ? !!mineSide.override[k] : !theirSide.override[k];
        };
        var names = {};
        Object.keys(a.override).forEach(function (k) { names[k] = true; });
        Object.keys(b.override).forEach(function (k) { names[k] = true; });
        // sorted, so both sides of the question list their books in one order
        var differing = Object.keys(names).sort().filter(function (k) { return isOn(a, b, k) !== isOn(b, a, k); });
        if (!differing.length) return 'the same books, stored differently';
        // NAME the books and say how THIS side has each. The first cut counted them instead — "1
        // switched on that the other side has the other way" — which is accurate and nearly
        // unreadable; seeing it on a phone was what settled it. A person choosing between two
        // sides needs to know WHICH books, not how many.
        if (differing.length <= 3) {
          return differing.map(function (k) {
            return bookTitle(k) + (isOn(a, b, k) ? ' on' : ' off');
          }).join(', ');
        }
        var on = differing.filter(function (k) { return isOn(a, b, k); }).length;
        return differing.length + ' books differ — ' + on + ' on here, ' + (differing.length - on) + ' off';
      },
    },
    swrpg_mods: {
      title: 'Your game variants',
      describe: function (v) {
        var list = Array.isArray(v) ? v : ((v && v.mods) || []);
        return list.length ? list.length + ' on: ' + list.map(modTitle).join(', ') : 'none on';
      },
    },
    swrpg_creation_draft: {
      title: 'The character you are part-way through building',
      describe: function (v) {
        if (!v) return 'nothing in progress';
        // B-408 — the draft's REAL name, per shape. The two fields read before were the ROSTER
        // record's, which a draft never carries, so every draft read "unnamed" on the sync prompt.
        // Custom keeps `character.identity.name` and its registry records (speciesData/careerData);
        // guided (quickbuild) keeps `species.name` and `role.career` — the landing's own derivation.
        var isQB = v.flow === 'quickbuild';
        var name = (v.character && v.character.identity && v.character.identity.name)
          || [isQB ? (v.species && v.species.name) : (v.speciesData && v.speciesData.name),
              isQB ? (v.role && v.role.career) : (v.careerData && v.careerData.name)].filter(Boolean).join(' ')
          || 'unnamed';
        return v.step ? name + ', at the ' + String(v.step) + ' step' : name;
      },
    },
    swrpg_gm_vehicle_overrides: {
      title: 'Your changes to vehicles',
      describe: function (v) {
        var n = v && typeof v === 'object' ? Object.keys(v).length : 0;
        return n === 1 ? '1 vehicle changed' : n + ' vehicles changed';
      },
    },
    // THE TENTH KEY (R-F5-1, ruling `f5-map-pins` §3). Written the way the books copy had to LEARN
    // to be written, and able to go further than it could.
    //
    // The books entry's own comment records the limit it hit: its ruling wanted "12 books on here,
    // 9 on your account" and the number was not derivable, because a book absent from the override
    // map sits at its group's default and the count needs the whole book vocabulary. PINS HAVE NO
    // SUCH PROBLEM. Both sides are `{version, pins:{planetId:{note,when}}}` and presence of the key
    // IS the pin, so which worlds differ — and how each side has each one — come out of the two
    // stored values with nothing else consulted. No registry, no lookup, no index that might not be
    // loaded when the account bar raises this.
    //
    // And it NAMES rather than counts, which is the books entry's hard-won lesson: its first cut
    // said "1 switched on that the other side has the other way", which its own comment calls
    // "accurate and nearly useless". A GM choosing between two sides needs to know WHICH worlds.
    //
    // Planet ids are slugs (`tatooine`, `nal_hutta`), and readableId() renders them from the stored
    // value alone. HOW WELL, exactly — measured over the whole shipping set rather than asserted:
    // of 2,077 planet records only 49 carry a canonical `planet_id`; the other 2,028 get a
    // name-derived key from planetKey()'s `name.toLowerCase().replace(/\s+/g,'_')` fallback. After
    // the ordinal rule above, 2,030 of 2,077 render as the planet's real name and 47 do not.
    //
    // Those 47 are ACCEPTED, not overlooked, and a uniform rule was tried and REJECTED on evidence:
    // 25 are hyphenated, 12 have apostrophes, 10 lost internal capitals to the lowercase (Ahch-To →
    // "Ahch-to", D'Qar → "D'qar", ThonBoka → "Thonboka"). Capitalising after every hyphen and
    // apostrophe was measured and made things WORSE — 66 wrong became 72 — because the dataset is
    // genuinely inconsistent: it holds "Ahch-To" beside "Abregado-rae" and "D'Qar" beside "D'ian".
    // The casing was destroyed by the slug and is not recoverable from the stored value, so the
    // ruling's instruction applies literally: say so rather than invent a lookup. A GM reading
    // "Ahch-to" still knows exactly which world it is; a wrong name from a stale registry would be
    // worse, and a registry read at conflict time is the thing the next paragraph forbids.
    // There is no planet-name lookup here on purpose:
    // the store itself holds no planet registry (that is what lets it keep pins for worlds this
    // build cannot resolve), and inventing one for a conflict line would be a second source of
    // truth for planet names raised at the worst possible moment.
    swrpg_map_pins: {
      title: 'The worlds pinned on your map',
      describe: function (v, other) {
        var mine = pinsOf(v);
        var theirs = pinsOf(other);
        var ids = {};
        Object.keys(mine).forEach(function (k) { ids[k] = true; });
        Object.keys(theirs).forEach(function (k) { ids[k] = true; });
        var differing = Object.keys(ids).filter(function (k) {
          return !samePin(mine[k], theirs[k]);
        });

        if (!differing.length) return 'the same pins, stored differently';

        // A side with nothing pinned says so once. The alternative is reciting every world the
        // other side has as "not pinned", which is longer, and says less, the emptier this side is.
        if (!Object.keys(mine).length) return 'no worlds pinned';

        // Three named, then counted — the same cap the books line uses, for the same reason: past
        // three, a phone shows a wall of text instead of a choice.
        if (differing.length <= 3) return differing.map(function (k) { return pinPhrase(k, mine, theirs); }).join(', ');
        var here = differing.filter(function (k) {
          return Object.prototype.hasOwnProperty.call(mine, k);
        }).length;
        return differing.length + ' worlds differ — ' + here + ' pinned here, '
          + (differing.length - here) + ' not';
      },
    },
  };

  // The pins map out of whatever was stored, without trusting any of it: this runs on two values
  // that came from localStorage and a server, either of which may be a truncated write or an older
  // shape. A bad value reads as "no pins" rather than throwing, because a conflict sheet that
  // crashes takes the person's only route to their data with it.
  function pinsOf(v) {
    var p = v && typeof v === 'object' && !Array.isArray(v) ? v.pins : null;
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
  }
  function pinField(entry, name) {
    var val = entry && typeof entry === 'object' ? entry[name] : '';
    return typeof val === 'string' ? val : '';
  }
  // Two entries are the same pin when the fields a person can SEE are the same. Compared field by
  // field rather than by stringifying: the store passes unknown fields through untouched for
  // forward-compat, so a v2 field arriving from a newer device would otherwise make every shared
  // world "differ" and turn the sheet into noise about something it cannot describe.
  function samePin(x, y) {
    if (!x || !y) return !x && !y;
    return pinField(x, 'note') === pinField(y, 'note') && pinField(x, 'when') === pinField(y, 'when');
  }
  // One differing world, from THIS side's point of view.
  function pinPhrase(id, mine, theirs) {
    var name = readableId(id);
    var a = mine[id], b = theirs[id];
    if (!a) return name + ' not pinned';
    if (!b) return name + ' pinned';
    // Pinned on both sides, so the difference is inside the entry — show the part that differs,
    // which is the only thing that helps a person tell the two sides apart.
    var noteA = pinField(a, 'note'), noteB = pinField(b, 'note');
    if (noteA !== noteB) return name + (noteA ? ' "' + noteA + '"' : ' with no note');
    var whenA = pinField(a, 'when');
    if (whenA !== pinField(b, 'when')) return name + (whenA ? ' ' + whenA : ' with no date');
    return name + ' changed';   // unreachable while samePin reads these two fields; not a crash if it changes
  }

  var RECORD_NOUN = {
    swrpg_saved_characters: 'character',
    swrpg_npc_cast: 'NPC',
    swrpg_npc_bench: 'group',
    swrpg_vessels_v1: 'ship',
  };

  function whenPhrase(rec) {
    var ms = rec && rec.updatedAt;
    if (typeof ms !== 'number' || ms < 1000000000000) return 'no date saved';
    var days = Math.floor((Date.now() - ms) / 86400000);
    if (days <= 0) return 'edited today';
    if (days === 1) return 'edited yesterday';
    return 'edited ' + days + ' days ago';
  }

  // describeConflict — one line per side, in mechanics voice. Never a payload dump.
  function describeConflict(c) {
    // F6 (ruling f100-ms-mockup R-MSMG-5; card f100-ms-build R-HSC-14): a collection asks in the record idiom with ONE new
    // noun. Its sides are whenPhrase over the envelope's own updatedAt, an ISO string where a list record keeps ms.
    if (c.collection) {
      var cn = c.name || (c.local && c.local.name) || (c.remote && c.remote.name) || 'collection';
      var ms = function (p) { var t = p && Date.parse(p.updatedAt); return { updatedAt: typeof t === 'number' && !isNaN(t) ? t : null }; };
      return { title: 'The collection "' + cn + '" changed in both places', here: whenPhrase(ms(c.local)), there: whenPhrase(ms(c.remote)) };
    }
    if (c.kind === 'envelope') {
      var spec = CONFLICT_COPY[c.key];
      if (!spec) return { title: c.key, here: 'this version', there: 'the other version' };
      return {
        title: spec.title,
        here: spec.describe(c.local, c.remote),
        there: spec.describe(c.remote, c.local),
      };
    }
    var noun = RECORD_NOUN[c.key] || 'item';
    var nm = (c.local && (c.local.name || c.local.title))
      || (c.remote && (c.remote.name || c.remote.title)) || String(c.id);
    return {
      title: 'The ' + noun + ' "' + nm + '" changed in both places',
      here: whenPhrase(c.stamps ? { updatedAt: c.stamps.local } : c.local),     // a base question's own times (ADDENDUM 531 item 3)
      there: whenPhrase(c.stamps ? { updatedAt: c.stamps.remote } : c.remote),
    };
  }
  // ── CONFLICT-COPY REGION END ──────────────────────────────────────────────────────────────

  // Does another surface currently own the screen? Expressed as "is a MODAL dialog open" rather
  // than "is the tutorial running", because that is the semantic fact underneath the ruling's
  // example: `aria-modal="true"` is a claim to the whole screen, and anything making that claim
  // has the same right to it that the first-run tutorial does. Generalising it means a future
  // first-run surface inherits the rule instead of needing to be remembered here — and this sheet
  // is deliberately NOT aria-modal (it is dismissible and traps nothing), so it never sees itself.
  function screenIsClaimed() {
    try { return !!document.querySelector('[role="dialog"][aria-modal="true"]'); }
    catch (e) { return false; }
  }

  // B-1213 — THE SHEET ON PAPER (card `paper-n7-b1213-seams-card` R-B1213-12; frames lab `170870f46` `seams/sheet/…`,
  // APPROVED D-169). Raised when the chip's bar is paper (`paper` through AccountChip); a dark host keeps the dark face
  // below byte for byte. Today's shape is kept — a bottom sheet at most 560 wide and 82vh, the same words in the same
  // order — in the paper's stock: the kit's `.hp-scrim` (paper.css, B-1210 R-B1210-2; H1's value, as drawn), the page with its lift
  // and rule ring, the raised head, `.sb-e-n` / `.sb-e-t` letters, and the two equal answers and Not now as `.hp-quiet`.
  // It declares its own ground and `--u` because it is portalled to <body>, outside every paper scope.
  // D-R3NA2 (ruling release-r3-backup-mockup): ONE copy prop for a second caller — `lead`, `sides` {local, remote} and
  // `foot`. Absent, f34's own words are drawn byte for byte; the whole-save restore passes the backup file's (D-258).
  // `foot: null` draws no foot line at all (DECISIONS D-262: the restore's "Not now keeps…" line is cut to rule text).
  // CONFLICT_WORDS, never CONFLICT_COPY: that name is the per-key map above (describeConflict reads it), and a second
  // `var` of it in this scope overwrote the map at load, so every whole-key question read as its raw key (found by the
  // backup walk, release-r3-no-loss acceptance 7).
  var CONFLICT_WORDS = { lead: 'This device and your account disagree. Nothing has been thrown away — pick which one to keep.',
    sides: { local: 'This device', remote: 'Your account' },
    foot: null };
  function conflictCopy(props) {
    return { lead: props.lead || CONFLICT_WORDS.lead, foot: props.foot === null ? null : (props.foot || CONFLICT_WORDS.foot),
      sides: Object.assign({}, CONFLICT_WORDS.sides, props.sides || {}) };
  }
  function ConflictPaper(props) {
    var list = props.list;
    var cc = conflictCopy(props);
    var MONO = { fontFamily: 'var(--font-mono,monospace)', letterSpacing: '.14em', textTransform: 'uppercase' };
    function side(c, s, label, sub) {
      return h('button', { type: 'button', className: 'hp-quiet', disabled: !!props.busy, 'data-role': 'side-' + s,
        onClick: function () { props.onResolve(c, s); },
        style: { flex: '1 1 0', minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 3,
          padding: '8px 14px', textAlign: 'left', color: 'var(--doc-ink)', textTransform: 'none', letterSpacing: 0 } },
        h('span', { style: Object.assign({ fontSize: 'calc(11 * var(--u))', color: 'var(--doc-ink)' }, MONO) }, label),
        h('span', { style: { fontFamily: 'var(--font-body,sans-serif)', fontSize: 'calc(15 * var(--u))', color: 'var(--doc-ink-muted)', lineHeight: 1.3 } }, sub));
    }
    return h(React.Fragment, null,
      h('div', { 'data-role': 'conflict-scrim', className: 'hp-scrim', onClick: props.onDismiss, style: { zIndex: 4000 } }),
      h('div', { role: 'dialog', 'aria-label': 'Choices waiting', 'data-doc-ground': 'creator', ref: props.holdRef,
        style: { '--u': '1px', position: 'fixed', zIndex: 4001, left: '50%', bottom: 0, transform: 'translateX(-50%)',
          width: '100%', maxWidth: 560, maxHeight: '82vh', display: 'flex', flexDirection: 'column', minHeight: 0,
          background: 'var(--doc-paper)', color: 'var(--doc-ink)', boxShadow: '0 18px 44px rgba(0,0,0,.45), 0 0 0 1px var(--doc-rule)',
          paddingBottom: 'env(safe-area-inset-bottom)' } },
        h('div', { style: { flex: 'none', display: 'flex', alignItems: 'center', minHeight: 44, padding: '10px 16px', borderBottom: '1px solid var(--doc-rule)', background: 'var(--doc-paper-raised)' } },
          h('div', { className: 'sb-e-n', style: { flex: 1, minWidth: 0, fontSize: 'calc(15 * var(--u))', letterSpacing: '.06em', lineHeight: 1.35 } },
            list.length === 1 ? '1 choice waiting' : list.length + ' choices waiting')),
        h('div', { 'data-scroll': '1', style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '6px 16px 18px', display: 'flex', flexDirection: 'column', gap: 16 } },
          h('p', { className: 'sb-e-t', style: { maxWidth: 'none', margin: '8px 0 0' } },
            cc.lead),
          list.map(function (c) {
            var d = describeConflict(c);
            return h('div', { key: (c.key + ':' + (c.id || '')), style: { paddingTop: 12, borderTop: '1px solid var(--doc-rule)' } },
              h('div', { style: { fontFamily: 'var(--font-body,sans-serif)', fontWeight: 600, fontSize: 'calc(16 * var(--u))', lineHeight: 1.4, color: 'var(--doc-ink)', marginBottom: 8 } }, d.title),
              h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                side(c, 'local', cc.sides.local, d.here),
                side(c, 'remote', cc.sides.remote, d.there)));
          }),
          h('div', { style: { paddingTop: 12, borderTop: '1px solid var(--doc-rule)' } },
            h('button', { type: 'button', className: 'hp-quiet', 'data-role': 'not-now', onClick: props.onDismiss,
              style: { width: '100%', justifyContent: 'center', color: 'var(--doc-ink)' } }, 'Not now'),
            cc.foot ? h('p', { className: 'sb-e-t', style: { maxWidth: 'none', margin: '8px 0 0', fontSize: 'calc(14 * var(--u))', color: 'var(--doc-ink-muted)' } },
              cc.foot) : null))));
  }

  // ConflictPrompt — props: { conflicts, onResolve(conflict, side), onDismiss, busy, paper?, lead?, sides?, foot? } (the copy: D-R3NA2)
  function ConflictPrompt(props) {
    // F6 (the approved record, f100-ms-mockup R-MSMG-5): a collection's question sits above the records' — the lane raises
    // it after the adoption merge, so the list arrives in the other order. Stable otherwise; nothing else moves.
    var all = props.conflicts || [];
    var list = all.filter(function (c) { return c && c.collection; }).concat(all.filter(function (c) { return !(c && c.collection); }));
    // Esc closes, per the ModuleMenu standard — the no-trap law applies to this sheet exactly as
    // it applies to every other overlay in the suite. Deliberately NOT useBackToClose: this can be
    // raised over any screen in any app, including sheet-routed ones, and that hook's two hazards
    // (the R-UBC1 clobber and the nested self-close) are precisely what an overlay with no screen
    // of its own must not walk into. Dismissal here is state, not history.
    //
    // The listener attaches ONCE and reads the current callback through a ref. Keying the effect
    // on `onDismiss` looked equivalent and was not: that prop is a fresh closure every render, so
    // the listener detached and re-attached on each one — and re-entry re-renders twice as its
    // fresh pull resolves. The observed symptom was the first Esc after re-opening doing nothing
    // and the second working, which is exactly what a listener that is briefly absent looks like.
    var dismissRef = useRef(props.onDismiss);
    dismissRef.current = props.onDismiss;
    // B-1735 (ADDENDUM 560): a books question reads resolved settings, and a host may not have the vocabulary yet (the GM's
    // landing does not). Ask for it when one is raised, and redraw when it lands, or fails.
    var _bk = useState(0), setBooksTick = _bk[1];
    var asksBooks = all.some(function (c) { return c && c.key === 'swrpg_active_sources'; });
    useEffect(function () {
      if (!asksBooks || !window.SWRPGSources || !window.SWRPGSources.ready) return undefined;
      var live = true;
      window.SWRPGSources.ready().then(function () { if (live) setBooksTick(function (t) { return t + 1; }); });
      return function () { live = false; };
    }, [asksBooks]);
    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape') dismissRef.current(); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, []);
    // B-1825 (ADDENDUM 631): the sheet holds focus, both faces — in at open, Tab kept inside, back to the door at close
    var holdRef = useRef(null);
    useHoldFocus(holdRef, list.length > 0);
    if (!list.length) return null;
    if (props.paper) return h(ConflictPaper, Object.assign({}, props, { list: list, holdRef: holdRef }));
    var cc = conflictCopy(props);
    var a = props.accent || '#4EAAFF';
    var mono = { fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' };

    function choice(c, side, label, sub) {
      return h('button', { type: 'button', disabled: !!props.busy,
        onClick: function () { props.onResolve(c, side); },
        style: {
          flex: '1 1 0', minWidth: 0, minHeight: '44px', padding: '8px 12px', cursor: 'pointer',
          textAlign: 'left', borderRadius: '8px', color: '#fff',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)',
        } },
        h('div', { style: Object.assign({}, mono, { fontSize: 'var(--fs-2xs)', color: a }) }, label),
        h('div', { style: { fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,0.78)', marginTop: '3px' } }, sub));
    }

    return h('div', { role: 'dialog', 'aria-label': 'Choices waiting', ref: holdRef,
      style: { position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(3,6,12,0.62)' },
      onClick: function (e) { if (e.target === e.currentTarget) props.onDismiss(); } },
      h('div', { style: {
        width: '100%', maxWidth: '560px', maxHeight: '82vh', overflowY: 'auto',
        background: 'rgba(10,14,22,0.99)', borderTop: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '14px 14px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
      } },
        h('div', { style: Object.assign({}, mono, { fontSize: 'var(--fs-xs)', color: a }) },
          list.length === 1 ? '1 choice waiting' : list.length + ' choices waiting'),
        h('p', { style: { fontSize: 'var(--fs-sm)', color: 'rgba(255,255,255,0.72)', margin: '8px 0 14px' } },
          cc.lead),
        list.map(function (c, i) {
          var d = describeConflict(c);
          return h('div', { key: (c.key + ':' + (c.id || '')) , style: { marginBottom: '14px' } },
            h('div', { style: { fontSize: 'var(--fs-sm)', color: '#fff', marginBottom: '7px' } }, d.title),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              choice(c, 'local', cc.sides.local, d.here),
              choice(c, 'remote', cc.sides.remote, d.there)));
        }),
        h('button', { type: 'button', onClick: props.onDismiss,
          style: Object.assign({}, mono, {
            minHeight: '44px', width: '100%', marginTop: '4px', cursor: 'pointer',
            fontSize: 'var(--fs-2xs)', color: 'rgba(255,255,255,0.55)',
            background: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px',
          }) }, 'Not now'),
        cc.foot ? h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'rgba(255,255,255,0.38)', marginTop: '8px', textTransform: 'none' } },
          cc.foot) : null));
  }

  // AccountChip — the SuiteBar's session state (F-34 Phase A; ruling f34-login-build-scope).
  // THE RENDER RULES, each one a law:
  //   - window.SWRPGAccount absent (a page that doesn't load account.js) → null. The bar never
  //     depends on the account seam existing — login may fail, the game tools may not.
  //   - signed OUT → null. Zero new operation for logged-out users (R-PL1 four-gate: Load);
  //     the sign-in door lives on the launchpad, not in every app's chrome.
  //   - signed IN → the chip: your name, and a menu with the only two account operations that
  //     exist (privacy & account page, sign out). Mechanics voice — it says what it does.
  // Refreshes only from 'unknown' (first mount per page); afterwards the seam's broadcast keeps
  // every tab current without re-fetch storms.
  function AccountChip(props) {
    var acct = (typeof window !== 'undefined' && window.SWRPGAccount) || null;
    var st = useState(acct ? acct.state() : null), account = st[0], setAccount = st[1];
    // F-B4: SILENT WHEN HEALTHY. There is no "synced ✓" state and there will not be one — a
    // permanent badge adds a thing to watch and removes nothing, which is what the four-gate
    // Subtraction test rejects, and paper has no spinner. Exactly two exceptions exist, and both
    // are moments where staying quiet would leave someone holding a false belief about their work.
    var sy = useState(null), syncIssue = sy[0], setSyncIssue = sy[1];
    // C-CP: the open questions and the sheet that answers them. `open` is the sheet; `pending` is
    // the count the menu shows. Both driven by the seam — the chip owns no conflict state of its
    // own, so a second tab answering a question is reflected here without a reload.
    var cf = useState([]), pending = cf[0], setPending = cf[1];
    var op = useState(false), open = op[0], setOpen = op[1];
    var bz = useState(false), busy = bz[0], setBusy = bz[1];
    var seenRef = useRef(false);
    var SY = (typeof window !== 'undefined' && window.SWRPGSync) || null;
    useEffect(function () {
      if (!acct) return undefined;
      var un = acct.subscribe(setAccount);
      if (acct.state().status === 'unknown') acct.refresh();
      var unSync = SY
        ? SY.subscribe(function (type) {
          if (type === 'push_failed') setSyncIssue('unsent');
          if (type === 'pushed') setSyncIssue(null);
          // Every event that can change the open questions re-reads them from the seam rather
          // than tracking them here — one source of truth, and 'resolved' fires per answer.
          if (type === 'adopted' || type === 'conflict' || type === 'resolved' || type === 'rechecked' || type === 'hold_ended') {
            var live = SY.conflicts();
            setPending(live);
            // SURFACE, never gate: questions arriving raise the sheet once, and it is dismissible
            // in one tap (at-table — a GM signing in mid-session gets straight back to the table,
            // with the questions waiting in the chip). Only on ARRIVAL: 'resolved' must not
            // re-raise a sheet the person just dismissed.
            //
            // ...and NOT while another surface owns the screen (ruling f34-conflict-prompt-build
            // §4). A first-run tutorial stacked with a sync question is two voices talking at once
            // to someone who has consented to neither. The sheet was given a patient door — the
            // chip's "N choices waiting" — precisely so it never has to compete; this makes it use
            // its own design. Nothing is queued and nothing is lost: the questions sit in the chip
            // and the sheet surfaces on the next arrival once the screen is clear.
            // B-1692 (ADDENDUM 486): and not while the build that may close the question is on its way. The chip has it meanwhile; `hold_ended` is its arrival,
            // unless the player has already been to the sheet through the chip.
            var arrival = type === 'adopted' || type === 'conflict' || (type === 'hold_ended' && !seenRef.current);
            if (live.length && arrival && !screenIsClaimed() && !(SY.promptHeld && SY.promptHeld())) {
              setOpen(true);
            }
          }
        })
        : null;
      if (SY) setPending(SY.conflicts());
      return function () { un(); if (unSync) unSync(); };
    }, []);
    // R-PA-1 / C-PA-1: while the product is dark the chip renders NOTHING — including for a
    // signed-in session, which is the state C-PA-5's live drive creates on production. Read at
    // render time (never captured at load) so this surface and the launchpad door can never
    // disagree. The subscription above still runs: the seam stays exercisable, only silent.
    if (!window.SWRPGAccountUIEnabled || !window.SWRPGAccountUIEnabled()) return null;
    if (!acct || !account || !account.user) return null;
    var a = props.accent || '#4EAAFF';
    var name = account.user.name || 'Signed in';
    // The two exceptions, in mechanics voice: say what happened, not "sync status: degraded".
    // `offline` is the state the seam already models — reusing it rather than inventing a second
    // vocabulary for the same fact.
    // ONE exception, not two (D-LU1, ruling f34-light-up §4). There used to be a second here, for
    // the unreachable-API state, and it could never render: the seam sets status offline and user
    // null on the same breath — deliberately, because a client that cannot reach /me does not know
    // who you are — and this chip does not exist without a user. So the state that would have
    // shown it is the state that removes the thing showing it.
    //
    // Deleted rather than made reachable. Holding a last-known identity through an outage would
    // have this chip assert something it can no longer verify, which is the same quiet-lie class
    // as the privacy page's old "that is the whole table". The state still gets its honest voice:
    // "not yet synced" persists until a push actually SUCCEEDS, so unsent work speaks the moment
    // the connection returns. During an outage the apps read as signed-out, which is the truthful
    // rendering of "we cannot verify who you are right now".
    var note = syncIssue === 'unsent' ? 'Not yet synced. Your work is safe on this device.' : null;
    var userGlyph = h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }), h('circle', { cx: 12, cy: 7, r: 4 }));
    // C-CP §4.4 — the re-entry line. NOT a third exception class: it is the not-yet-synced state
    // given its count and its door, and it follows the exceptions' existing idiom exactly —
    // present only while true, gone the moment the last question is answered.
    var waiting = pending.length
      ? (pending.length === 1 ? '1 choice waiting' : pending.length + ' choices waiting')
      : null;

    function answer(c, side) {
      if (!SY) return;
      setBusy(true);
      SY.resolve(c, side).then(function () {
        var left = SY.conflicts();
        setPending(left);
        setBusy(false);
        if (!left.length) setOpen(false);      // the last answer closes the sheet
      });
    }
    // C-CP-2's re-entry half: re-opening RE-DERIVES both sides from a fresh pull rather than
    // replaying the snapshot taken when the question first arose. The other device may have moved
    // on, and showing yesterday's versions of today's question is a new lie, not a fix for the old.
    function reopen() {
      seenRef.current = true;
      setOpen(true);
      if (SY && SY.recheck) {
        setBusy(true);
        SY.recheck().then(function (r) { setPending((r && r.conflicts) || SY.conflicts()); setBusy(false); });
      }
    }

    // B-1213 seam 1 (card `paper-n7-b1213-seams-card` R-B1213-1): the menu takes its bar's face, as ⚙ and ? beside it
    // do — frame C1 (lab `16eb5206`, D-79) extended to Account by `paper-n5-flip` R-N5F-2. THE CUE (D-165, R-B1213-12;
    // frames lab `170870f46` `seams/chip/…`, APPROVED D-169): on paper the closed button carries the bar's own count
    // bubble — the waiting COUNT, or "!" when only the sync note exists; a shape and a word, never a hue alone; waiting
    // wins when both. NEW on paper only: the dark face is unchanged (its `accent` tints the trigger only while open,
    // erratum E-B1213-1).
    var cue = !props.paper ? null
      : waiting ? { kind: 'count', text: pending.length > 99 ? '99' : String(pending.length) }
      : note ? { kind: 'note', text: '!' } : null;
    return h('span', null,
      h(ModuleMenu, {
        label: 'Account — signed in as ' + name + (note ? '. ' + note : '') + (waiting ? '. ' + waiting : ''),
        labelText: name.toUpperCase(), accent: (note || waiting) ? '#F5C842' : a,
        compact: !!props.compact, paper: !!props.paper, cue: cue, icon: userGlyph,
        items: [
          { kind: 'header', label: note ? 'SIGNED IN' : 'SIGNED IN' },
          // The exception, when there is one, sits at the top of the menu where a person looking for
          // it will find it — and is absent entirely the rest of the time.
        ].concat(note ? [{ kind: 'action', label: note, onSelect: function () {} }] : [])
          .concat(waiting ? [{ kind: 'action', label: waiting, onSelect: reopen }] : [])
          .concat([
            { kind: 'action', label: 'Privacy & account', onSelect: function () { window.location.href = '/account/'; } },
            { kind: 'action', label: 'Sign out', onSelect: function () { acct.logout(); } },
          ]),
      }),
      open ? toBody(h(ConflictPrompt, {
        conflicts: pending, accent: a, busy: busy, paper: !!props.paper,
        onResolve: answer, onDismiss: function () { setOpen(false); },
      })) : null);
  }

  // B-1168 (ruling b1168-conflict-prompt-hotfix R-B1168-3): the prompt is a whole-screen sheet, but the chip
  // lives inside the SuiteBar, and every way a screen hides that bar reaches the prompt too — the edge
  // chrome's transform makes the bar its containing block (the sheet sat above the screen), the idle fade
  // gives it opacity 0 and pointer-events none, the immersive screens' display:none removes it, and the
  // bar's own stacking context (z 140, or HoloDice's z-31 wrapper) puts it under the bottom nav. Rendered
  // into document.body it is none of the bar's business. A portal keeps the React tree, so props, state
  // and context are exactly as they were.
  // B-1382 (ruling b1382-store-picker-card R-B1382-2): the store's pickers are the same class — a fixed
  // layer inside `#suite-main` (z 1) paints under the bottom nav — so this is exported on window.SWRPGUI
  // below as the ONE portal helper; lib/store consumes it, never copies it.
  function toBody(node) {
    var RD = (typeof window !== 'undefined') && window.ReactDOM;
    return RD && RD.createPortal && typeof document !== 'undefined' && document.body
      ? RD.createPortal(node, document.body) : node;
  }

  // The kit's ONE layout-mode hook (`lib/shared/desktopLayout.jsx` `useLayoutMode`), read at render because
  // desktopLayout.js loads after this bundle. A page that does not load it (HoloDice, never on paper) reads null on
  // every render, so the hooks called never change within a page.
  function useSuiteLayoutMode() {
    var D = (typeof window !== 'undefined') && window.SWRPGDesktop;
    return D && D.useLayoutMode ? D.useLayoutMode() : null;
  }

  // SuiteBar — shared Tier-2 "return door" (navigation-phase1-recon). Mounted on every screen of all
  // three apps: ⌂ home → launchpad · you-are-here identity (accent dot + app name) · ⊞ app switcher
  // (a Disclosure popover of the 3 apps + Launchpad). One component, per-app accent — no parallel reimpl.
  // Props: { app:'player'|'gm'|'dice', accent, appName, autohide? }
  //   autohide → adds .autohide-chrome so the bar hides over the dice cinematic/roll (body.chrome-hidden).
  // a11y (recon §7): switcher = Disclosure (button aria-expanded/aria-controls → <nav> of links), Esc
  //   closes + returns focus, no trap; aria-current on the active app; skip-link; 44–48px; reduced-motion.
  function SuiteBar(props) {
    var app = props.app, appName = props.appName, autohide = props.autohide, settings = props.settings;
    var a = props.accent || '#4EAAFF';
    // B-679 — THE PAPER FACE (lab frames AA–AF @ `1e1e2f6a`; Jason "Approved" 2026-09-18, LAB_NOTES
    // §193). ONE bar, two faces. Everything the bar SAYS and everything about WHERE it says it —
    // the 54px header, the `0 6px 0 4px` padding, the 44px tap floor, the words, their order, the
    // glyphs — is untouched: those are the numbers the board's own generator READ out of this
    // function, so the paper frames cannot disagree with it. `paper` swaps only the GROUND and the
    // INKS, by handing the bar the board's classes (`st-ctx pb-top` and its children) plus the
    // `[data-paper-chrome]` scope that lets `lib/shared/store.css` reach chrome standing OUTSIDE
    // the store's own paper root.
    //
    // B-689 · R-CGR-1 (ruling `chrome-ground-retirement`, Jason 2026-09-21: "the black ground is the
    // old screen, so the law is outdated and needs to be removed for the paper") — THE CHROME MATCHES
    // THE SURFACE, so the store stops being the only host. The prop is unchanged and nothing is
    // re-architected: every paper host passes `paper` when ITS OWN switch is on, and a host still dark
    // passes nothing, so a player crossing from a paper sheet to a dark NPC library crosses a bar that
    // changes ground with them. The scope attribute was `data-store-chrome` until this row and is now
    // `data-paper-chrome` — it was never about the store, it is the chrome's paper FACE (39 sites).
    //
    // THE NO-CONTEXT BAR TAKES THE SAME DRAWING (and this is the one judgement B-689 owed). The six
    // approved frames draw the bar in its STORE context — BACK · the SHOPPING FOR chip · ⚙ · ? — and
    // the sheet's and the landing's bar has no context: its left is the ⌂ HUB door and its centre the
    // app's own identity. B-679's own record says the summoned bars "follow the same drawing", so the
    // undrawn anatomy takes the drawn vocabulary for the SAME anatomy rather than a new treatment:
    // the left glyph-and-word button is `.pb-back` (the drawn class for exactly that button in exactly
    // that corner) and the centre identity is `.pb-browsing` (the drawn class for a bar's plain centred
    // word). NOTHING NEW IS DECLARED and no rule is added to the stylesheet. Leaving them unpapered was
    // not available: their inks are inline `rgba(255,255,255,…)` and `#fff`, which on the paper ground
    // is white on cream — the a11y floor and C-MU-4 ("the standards outrank the mockup") forbid it.
    // The accent DOT beside the identity is ABSENT on the paper face, the way `AccountChip`'s absence
    // and JUST BROWSING's non-`.st-shopfor` were drawn as absences: it is the instrument's glowing
    // punctuation and the paper drawing has no hue for it. Reported to the lab, not decided here.
    var paper = !!props.paper;
    // ADR 0010 (contextual nav bars): a surface may transform the bar while inside it.
    // context = { exitLabel, onExit, chip:{label, onClick, active?, ariaLabel?} } swaps the
    // left home link for a back-to-app button and the centre identity for the surface's chip;
    // the right side (settings ⚙ + app switcher) stays — the no-trap escape is always present.
    var ctx = props.context || null;
    // B-1260 + B-1280 (D-188; card `paper-n7-b1260-build` C-1) — ON A PHONE, THE PAPER BAR'S RIGHT SIDE IS THE STORE'S:
    // Account, Settings and Help as their 44px glyphs, each word kept as the trigger's `aria-label`. One expression for
    // all three: a context rides the bar (the store's form, D-76), or the bar is on paper in the kit's phone layout.
    // The phone layout is the kit's own read (`useSuiteLayoutMode` below: bands.js's 1024 seam through SWRPGLayout), so
    // a resize or a rotation across the seam re-renders the bar. The dark face and every bar at the desk are as before.
    var layoutMode = useSuiteLayoutMode();
    var compact = !!ctx || (paper && layoutMode === 'mobile');
    var st = useState(false), open = st[0], setOpen = st[1];
    var btnRef = useRef(null), popRef = useRef(null);
    // C-DP-2 (ruling f34-door-placement §4) — the ONE signed-out route to sign-in from inside the
    // apps. Before this, AccountChip returned null when signed out and the launchpad door was the
    // only entry in the entire product: anyone who bookmarked the app they actually use could
    // never discover that accounts exist. One row, in the menu every app already has, gone the
    // moment the chip appears. It lives HERE, in the one shared bar, so all three apps get it from
    // the same lines (no-compromise-mirror) — a per-app copy would be the compromise.
    var acct = (typeof window !== 'undefined' && window.SWRPGAccount) || null;
    var acs = useState(acct ? acct.state() : null), acctState = acs[0], setAcctState = acs[1];
    useEffect(function () {
      if (!acct) return undefined;
      var un = acct.subscribe(setAcctState);
      if (acct.state().status === 'unknown') acct.refresh();
      return un;
    }, []);
    useEffect(function () {
      if (!open) return;
      function onKey(e) { if (e.key === 'Escape') { setOpen(false); if (btnRef.current) btnRef.current.focus(); } }
      function onDown(e) {
        if (popRef.current && !popRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onDown);
      return function () { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
    }, [open]);
    // Back closes the switcher popover instead of leaving the app (nav-phase2a §6 footnote).
    useBackToClose(open, function () { setOpen(false); });

    var homeGlyph = h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M3 11l9-8 9 8' }), h('path', { d: 'M5 10v10h14V10' }));
    // (R-SB1: the retired ⊞ four-tile switcher glyph is gone — the switcher moved into the ⌂ nav door.)
    var gearGlyph = h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }),
      h('circle', { cx: 12, cy: 12, r: 3 }));
    // Help "?" glyph (the four-tile slot becomes Help per suitebar-contextual-settings-concept §3).
    var helpGlyph = h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('circle', { cx: 12, cy: 12, r: 10 }), h('path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }), h('path', { d: 'M12 17h.01' }));
    var tap = { minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' };
    // The ⚙ settings shape is EITHER a flat array (back-compat — renders as a plain list) OR
    // { screen:[...], suite:[...], screenLabel? } — the SCREEN-AWARE two-group form (concept §3).
    // Empty-group rule: a screen with no scoped items shows the suite alone, no header.
    var settingsItems = (function () {
      var s = settings;
      if (Array.isArray(s)) return s;
      if (!s || typeof s !== 'object') return [];
      var scr = s.screen || [], sui = s.suite || [];
      if (!scr.length) return sui;
      if (!sui.length) return scr;
      return [{ kind: 'header', label: s.screenLabel || 'THIS SCREEN' }].concat(scr, [{ kind: 'header', label: 'GENERAL' }], sui);
    })();
    // Help = the three at-table reference cards, out of ⚙ entirely, one door on every screen (concept §3).
    // Built into the bar (suite-wide chrome, like the switcher was) — no per-host wiring, no parallel reimpl.
    // B-1208 (D-180): the bar's own `paper` goes to the card it opens — a paper bar opens the paper window,
    // a dark bar today's dark card.
    var helpItems = [
      { kind: 'action', label: 'Spend results', onSelect: function () { openResultsReference({ accent: a, paper: paper }); } },
      { kind: 'action', label: 'Maneuvers & actions', onSelect: function () { openManeuversCard({ accent: a, paper: paper }); } },
      { kind: 'action', label: 'Healing & recovery', onSelect: function () { openRecoveryCard({ accent: a, paper: paper }); } },
    ];

    // B-679 — THE CONTEXT CHIP ON PAPER, and B-514's cure built as the frame draws it. The host
    // composes the chip's label in ONE ternary (`'SHOPPING FOR · ' + NAME` or the bare no-character
    // word — player/app.jsx), which is the single source the board's generator read for both states;
    // so the paper chip SPLITS that one string at its own separator rather than being handed the two
    // halves a second time, and a word can never drift between the faces.
    //   · WITH A NAME the shape is stacked — the label is furniture and goes above, the name takes
    //     the whole column and wraps (`.st-shopfor-n` carries `overflow-wrap:anywhere`). The app's
    //     one-line ellipsised pill is the shape PHONE_CENSUS measured CLIPPING by 13px at 390, and
    //     the standard outranks the app (C-MU-4): the frame draws the fix and this builds it.
    //   · WITHOUT ONE it is plain text and NOT a `.st-shopfor` — B-514 is about a name being cut and
    //     there is no name here to cut, so the element that carries one is absent rather than empty.
    function paperChip(chip) {
      var parts = String(chip.label || '').split(' · ');
      if (!chip.active || parts.length < 2) return h('span', { className: 'pb-browsing' }, chip.label);
      return h('button', { type: 'button', onClick: chip.onClick, className: 'pb-chip',
        'aria-label': chip.ariaLabel || chip.label },
        h('div', { className: 'st-shopfor' },
          h('span', { className: 'st-shopfor-l' }, parts[0]),
          h('b', { className: 'st-shopfor-n' }, parts.slice(1).join(' · '))),
        h('span', { 'aria-hidden': true, className: 'pb-caret' }, '▾'));
    }

    return h(React.Fragment, null,
      h('a', { href: '#suite-main', className: 'suite-skip' }, 'Skip to content'),
      h('header', {
        className: 'suite-bar' + (autohide ? ' autohide-chrome' : '') + (paper ? ' st-ctx pb-top' : ''),
        'data-paper-chrome': paper ? '1' : undefined,
        'data-doc-ground': paper ? 'creator' : undefined,
        style: Object.assign({
          position: 'sticky', top: 0, left: 0, right: 0, zIndex: 120, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: '54px', padding: '0 6px 0 4px', boxSizing: 'border-box',
          background: 'rgba(7,10,16,0.94)', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }, paper ? {
          // The four the paper face takes OFF the inline object so the stylesheet can answer for
          // them: the dark ground, its hairline, and the two numbers `.pb-top` re-states from this
          // same source (54px and `0 6px 0 4px`). React omits an `undefined` style value, so the
          // dark face's object is byte-identical to what it was.
          background: undefined, borderBottom: undefined, height: undefined, padding: undefined,
        } : null),
      },
        // Left — home → launchpad (or the surface's back-to-app escape when a context rides the bar)
        ctx ? h('button', { type: 'button', onClick: ctx.onExit, 'aria-label': 'Back to ' + (appName || 'app'),
          // B-679: the SAME button, the same glyph, the same `exitLabel` and the same destination —
          // `.pb-back` carries the tap floor, the padding and the gap the inline object carried, in
          // the document's own muted ink.
          className: paper ? 'pb-back' : undefined,
          style: paper ? undefined : Object.assign({}, tap, { gap: '6px', padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.82)' }) },
          h('svg', { width: 16, height: 16, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
            h('polyline', { points: '12,4 6,10 12,16', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })),
          h('span', { style: paper ? undefined : { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em' } }, ctx.exitLabel || 'BACK'))
        : h('div', { style: { position: 'relative' } },
          h('button', { ref: btnRef, type: 'button', 'aria-haspopup': true, 'aria-expanded': open, 'aria-controls': 'suite-nav',
            'aria-label': 'Menu — launchpad and apps', onClick: function () { setOpen(!open); },
            // B-689 — THE SAME BUTTON, the same glyph, the same word, the same destination. `.pb-back`
            // is the drawing's own class for the bar's left glyph-and-word button (the store's BACK, in
            // this same corner) and it carries the tap floor, the padding, the gap and the document's
            // muted ink; `homeGlyph` is already stroke-on-currentColor, which is what `.pb-back svg`
            // expects. The open state loses its accent tint on paper — the frames draw no open state
            // and `aria-expanded` is what actually carries it; reported, not invented.
            className: paper ? 'pb-back' : undefined,
            style: paper ? undefined : Object.assign({}, tap, { gap: '7px', padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', color: open ? a : 'rgba(255,255,255,0.88)', borderRadius: '8px' }) },
            homeGlyph,
            h('span', { style: paper ? undefined : { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em' } }, 'HUB')),
          open ? h('nav', { id: 'suite-nav', ref: popRef, 'aria-label': 'Launchpad and apps',
            className: 'suite-pop panel-enter' + (paper ? ' pb-pop' : ''),
            style: Object.assign({ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200, minWidth: '232px',
              display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px',
              background: 'rgba(10,14,22,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.55)' },
              // B-793 — the four the paper face takes OFF so the stylesheet answers for them. The
              // place, the measure, the gap and the padding are the APP's and do not move.
              paper ? { background: undefined, border: undefined, borderRadius: undefined, boxShadow: undefined } : null) },
            // Launchpad FIRST — the headline row (it was the one-tap home; stays prominent, concept §3)
            h('a', { href: '/', 'aria-label': 'Project Holocron launchpad', className: paper ? 'pb-pop-lead' : undefined,
              style: Object.assign({}, tap, { justifyContent: 'flex-start', gap: '10px', padding: '0 12px', minHeight: '46px', textDecoration: 'none', borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' },
                paper ? { background: undefined, border: undefined, borderRadius: undefined } : null) },
              homeGlyph,
              h('span', { className: paper ? 'pb-pop-lab' : undefined,
                style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: '#fff' },
                  paper ? { color: undefined } : null) }, 'LAUNCHPAD')),
            h('div', { 'aria-hidden': true, className: paper ? 'pb-pop-sep' : undefined,
              style: Object.assign({ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '2px 4px' },
                paper ? { background: undefined } : null) }),
            SUITE_APPS.map(function (s) {
              var cur = s.id === app;
              return h('a', { key: s.id, href: s.href, 'aria-current': cur ? 'page' : undefined,
                // B-793 — WHERE YOU ARE is the chrome's own claim, and the chrome already marks it:
                // `.pb-tab[data-on="1"]` prints the current tab in `--doc-action` with an inset rule
                // (store.css). The row takes the same mark, `data-on` and all, so the bottom bar and
                // this list say "here" the same way. The WORD `HERE` and `aria-current` are unmoved.
                className: paper ? 'pb-pop-app' : undefined, 'data-on': (paper && cur) ? '1' : undefined,
                style: Object.assign({}, tap, {
                  justifyContent: 'flex-start', gap: '10px', padding: '0 12px', minHeight: '46px', textDecoration: 'none', borderRadius: '8px',
                  background: cur ? (s.accent + '22') : 'rgba(255,255,255,0.02)',
                  border: '1px solid ' + (cur ? (s.accent + '66') : 'rgba(255,255,255,0.06)'),
                }, paper ? { background: undefined, border: undefined, borderRadius: undefined } : null) },
                // the glowing per-app dot is ABSENT on paper, which is B-689's own decision for this
                // same punctuation in this same bar: "the paper drawing has no hue for it, and the
                // word it punctuated is still there in full". `.pb-pop-dot` is display:none there.
                h('span', { 'aria-hidden': true, className: paper ? 'pb-pop-dot' : undefined,
                  style: Object.assign({ width: '9px', height: '9px', borderRadius: '50%', background: s.accent, boxShadow: '0 0 8px ' + s.accent + '88', flexShrink: 0 },
                    paper ? { background: undefined, boxShadow: undefined } : null) }),
                h('span', { className: paper ? 'pb-pop-lab' : undefined,
                  style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: '#fff', flex: 1 },
                    paper ? { color: undefined } : null) }, s.name),
                cur ? h('span', { className: paper ? 'pb-pop-here' : undefined,
                  style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.18em', color: s.accent },
                    paper ? { color: undefined } : null) }, 'HERE') : null);
            }),
            // C-DP-2 — sign-in, LAST in the menu (the apps are what this menu is for; an account is
            // the quieter product-level thing under them). Flag-on AND signed-out only: this row
            // and the AccountChip are two states of one concept and are never visible together.
            // Destination is /account/, which already carries the buttons and the privacy copy —
            // one row, one destination, nothing new built. Copy is mechanics voice: it says what
            // it does. No badge, no dot, no cloud language, and nothing here nags — the row is
            // reachable only by someone who deliberately opened the menu.
            (window.SWRPGAccountUIEnabled && window.SWRPGAccountUIEnabled() && acct && acctState && !acctState.user) ? [
              h('div', { key: 'signin-sep', 'aria-hidden': true, className: paper ? 'pb-pop-sep' : undefined,
                style: Object.assign({ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '2px 4px' },
                  paper ? { background: undefined } : null) }),
              h('a', { key: 'signin', href: '/account/', 'aria-label': 'Sign in — keep your characters on all your devices',
                className: paper ? 'pb-pop-row pb-pop-quiet' : undefined,
                style: Object.assign({}, tap, { justifyContent: 'flex-start', gap: '10px', padding: '0 12px', minHeight: '46px', textDecoration: 'none', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' },
                  paper ? { background: undefined, border: undefined, borderRadius: undefined } : null) },
                h('span', { className: paper ? 'pb-pop-lab' : undefined,
                  style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.72)' },
                    paper ? { color: undefined } : null) }, 'SIGN IN')),
            ] : null
          ) : null),
        // Centre — you-are-here identity (accent + name, never colour alone) — or the context chip
        // (B-679: on paper the chip is the stacked B-514 shape / the plain no-character word; the
        // dark pill below is untouched.)
        ctx && ctx.chip && paper ? paperChip(ctx.chip)
        : ctx && ctx.chip ? h('button', { type: 'button', onClick: ctx.chip.onClick,
          'aria-label': ctx.chip.ariaLabel || ctx.chip.label,
          style: Object.assign({}, tap, {
            gap: '7px', padding: '0 12px', minWidth: 0, maxWidth: '62vw', cursor: 'pointer',
            background: ctx.chip.active ? (a + '14') : 'rgba(255,255,255,0.03)',
            border: '1px solid ' + (ctx.chip.active ? (a + '66') : 'rgba(255,255,255,0.14)'),
            borderRadius: '17px', minHeight: '34px', color: ctx.chip.active ? a : 'rgba(255,255,255,0.65)',
          }) },
          h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.16em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, ctx.chip.label),
          h('span', { 'aria-hidden': true, style: { fontSize: 'var(--fs-2xs)', opacity: 0.7 } }, '▾'))
        // B-689 — THE IDENTITY ON PAPER. `.pb-browsing` is the drawing's own class for a bar's plain
        // centred word (the store's JUST BROWSING), so the identity takes it rather than a new rule.
        // The accent DOT is absent on this face: it is the instrument's glowing punctuation, the paper
        // drawing has no hue for it, and the word it punctuated is still there in full.
        : paper ? h('span', { className: 'pb-browsing' }, appName)
        : h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
          h('span', { 'aria-hidden': true, style: { width: '8px', height: '8px', borderRadius: '50%', background: a, boxShadow: '0 0 10px ' + a + '88', flexShrink: 0 } }),
          // white name + accent dot (the suite "white titles, accent as punctuation" principle; ruling §3)
          h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, appName)),
        // Right — SCREEN-AWARE settings ⚙ (concept §3) + HELP (the three reference cards). The app
        // switcher moved LEFT into the ⌂ nav door; no switcher here.
        // B-679: `AccountChip` is LEFT AS THE APP HAS IT — it renders nothing while signed out, which
        // is the state the board drew, and the frame says so in words ("an absence drawn as an
        // absence"). The ⚙ and ? buttons become `.pb-icon`; B-793 PAPERS THEIR POPOVERS TOO —
        // Jason's walk answered B-689's open question ("Settings and help in the bar have legacy ui
        // under them", 2026-09-22) — and so does the HUB launchpad below, which opens from the same
        // bar and is the same idiom. NOT BUILT TO A FRAME: no approved frame draws an open menu, so
        // the face is derived from this kit and from the bars' own paper rules (store.css §THE BARS,
        // ON PAPER) and goes to Jason in the walk packet for his word.
        h('div', { className: paper ? 'pb-right' : undefined,
          style: paper ? undefined : { display: 'flex', alignItems: 'center', gap: '2px' } },
          h(AccountChip, { accent: a, compact: compact, paper: paper }),
          settingsItems.length ? h(ModuleMenu, { label: 'Settings', labelText: 'SETTINGS', accent: a, compact: compact, paper: paper, icon: gearGlyph, items: settingsItems }) : null,
          h(ModuleMenu, { label: 'Help', labelText: 'HELP', accent: a, compact: compact, paper: paper, icon: helpGlyph, items: helpItems }))
      )
    );
  }

  // Lucide bottom-bar icons (navigation-bottombar-icons-recon) — inlined SVG paths (ISC; no runtime dep).
  // Shape descriptors: ['p', d] path · ['c', cx,cy,r,fill?] circle · ['r', x,y,w,h,rx] rect · ['l', x1,y1,x2,y2] line.
  var NAV_ICONS = {
    'dices': [['r',2,10,12,12,2],['p','m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6'],['p','M6 18h.01'],['p','M10 14h.01'],['p','M15 6h.01'],['p','M18 9h.01']],
    'key-round': [['p','M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'],['c',16.5,7.5,.5,'currentColor']],
    'tv-minimal-play': [['p','M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z'],['p','M7 21h10'],['r',2,3,20,14,2]],
    'table': [['p','M12 3v18'],['r',3,3,18,18,2],['p','M3 9h18'],['p','M3 15h18']],
    'users': [['p','M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'],['p','M16 3.128a4 4 0 0 1 0 7.744'],['p','M22 21v-2a4 4 0 0 0-3-3.87'],['c',9,7,4]],
    'rocket': [['p','M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'],['p','M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09'],['p','M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z'],['p','M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05']],
    'map': [['p','M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z'],['p','M15 5.764v15'],['p','M9 3.236v15']],
    'shopping-cart': [['c',8,21,1],['c',19,21,1],['p','M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12']],
    'user-star': [['p','M16.051 12.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z'],['p','M8 15H7a4 4 0 0 0-4 4v2'],['c',10,7,4]],
    'user-plus': [['p','M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'],['c',9,7,4],['l',19,8,19,14],['l',22,11,16,11]],
  };
  function navIcon(name, size) {
    var defs = NAV_ICONS[name] || [];
    var shapes = defs.map(function (d, i) {
      if (d[0] === 'p') return h('path', { key: i, d: d[1] });
      if (d[0] === 'c') return h('circle', { key: i, cx: d[1], cy: d[2], r: d[3], fill: d[4] || 'none' });
      if (d[0] === 'r') return h('rect', { key: i, x: d[1], y: d[2], width: d[3], height: d[4], rx: d[5] });
      if (d[0] === 'l') return h('line', { key: i, x1: d[1], y1: d[2], x2: d[3], y2: d[4] });
      return null;
    });
    return h('svg', { width: size || 20, height: size || 20, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, shapes);
  }

  // BottomNav — shared per-app bottom tab bar (navigation Phase 2c). Sticky-bottom, thumb-zone, flat,
  // navigation-ONLY (no actions — Apple HIG), 3–5 items; active item in the app accent + aria-current;
  // ≥44px targets; a uniquely-labelled <nav> landmark (distinct from the suite bar's). One component, all
  // three apps, per-app config — the build-once pattern the SuiteBar proved.
  // Props: { app, accent, label?, items: [{id, label, icon?, onSelect}], activeId }
  //   icon? = an inline SVG/element (optional). Hides with the suite bar on immersive modules via the
  //   shared `body.holo-immersive` / `.autohide-chrome` CSS (lib/shared/tokens.css) — no prop needed.
  function BottomNav(props) {
    var a = props.accent || '#4EAAFF';
    var items = props.items || [];
    var activeId = props.activeId;
    // B-679 — the same two-faced bar as the SuiteBar: `paper` swaps the ground and the inks, nothing
    // else. The 54px tab floor, the 3px glyph/label gap, the 20px silhouette and the 1px top rule are
    // the numbers the board READ out of this function, so `.pb-bot` / `.pb-tab` re-state them rather
    // than change them — the bar is 55px tall on both faces. `paddingBottom: env(safe-area-inset-
    // bottom)` is the app's own and stays on both: the board's frame is a 390×844 cell with no notch.
    //
    // B-689 · R-CGR-1 — the drawn face is the STORE's five sections, and this bar's paper branch is
    // already item-AGNOSTIC: `.pb-tab` / `.pb-mark` / `.pb-lab` read the array the host hands them, so
    // the player's global five (CHARACTERS · CREATE · NPCS · YARD · STORE) take the same face with no
    // rule added. Nothing here is per-host; the HOST decides, by its own switch, which face to ask for.
    var paper = !!props.paper;
    return h('nav', {
      'aria-label': (props.label || props.app || 'App') + ' sections',
      className: 'bottom-nav' + (props.autohide ? ' autohide-chrome' : '') + (paper ? ' pb-bot' : ''),
      'data-paper-chrome': paper ? '1' : undefined,
      'data-doc-ground': paper ? 'creator' : undefined,
      style: Object.assign({
        position: 'sticky', bottom: 0, left: 0, right: 0, zIndex: 119, flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        background: 'rgba(7,10,16,0.94)', borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }, paper ? { background: undefined, borderTop: undefined } : null),
    }, items.map(function (it) {
      var active = it.id === activeId;
      return h('button', {
        key: it.id, type: 'button', onClick: it.onSelect,
        'aria-current': active ? 'page' : undefined, 'aria-label': it.label,
        className: paper ? 'pb-tab' : undefined,
        // `data-on` is the board's own attribute for the live section; `aria-current="page"` above is
        // the app's and is what a screen reader answers on — the mark and the semantics are separate
        // and BOTH are present, on both faces.
        'data-on': paper ? (active ? '1' : '0') : undefined,
        style: Object.assign({
          flex: 1, minHeight: '54px', minWidth: '44px', padding: '7px 4px 6px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
          background: 'none', border: 'none', cursor: 'pointer', touchAction: 'manipulation',
          color: active ? a : 'rgba(255,255,255,0.55)',
        }, paper ? {
          // `.pb-tab` answers for these four. Two are the SAME number arriving from the stylesheet
          // instead of from here (54px, 3px — the board read them off this object); the padding is
          // the board's `6px 3px`; and the COLOUR is the whole point — the app accent becomes the
          // document's action ink AND an inset rule, because state is a mark and not a hue.
          minHeight: undefined, padding: undefined, gap: undefined, color: undefined,
        } : null),
      },
        it.icon ? h('span', { 'aria-hidden': true, className: paper ? 'pb-mark' : undefined,
          style: paper ? undefined : { display: 'flex', lineHeight: 0 } }, it.icon) : null,
        h('span', { className: paper ? 'pb-lab' : undefined,
          style: paper ? undefined : { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.16em', textTransform: 'uppercase' } }, it.label)
      );
    }));
  }

  // useBackToClose — make the browser Back button CLOSE a transient overlay instead of leaving the app
  // (navigation Phase 2a, recon §3 routed-overlay rule). While `isOpen`, push one history entry; Back pops
  // it → onClose(). A normal close (isOpen→false by other means) pops our entry so history stays clean.
  // Used by the roll overlay, the DICE KEY modal, and the suite-bar switcher. onClose read via a ref so
  // it never goes stale; the effect re-arms only on isOpen change.
  //
  // ONE HAZARD (R-UBC1 audit). A close here pops history, and an app's popstate handler hears every pop:
  //   SHEET-ROUTED (data-loss) — an app whose popstate handler re-hydrates state from a saved
  //   record on every pop would discard unsaved edits when this close pops. FIXED at the root in
  //   player/app.jsx: its handler re-hydrates sheetData ONLY on a real character switch, not on a
  //   same-char overlay-dismissal pop. Any consumer app must apply the same guard, or fence.
  //   Live fence: store SellSheet (belt-and-suspenders).
  // THE NESTED-OVERLAY HAZARD IS CURED (B-1702, `release-r7-bug-burndown` ADDENDUM 506; it was `byoa.md` §4's fence). A pop
  // this code caused to drop an entry (`cleanupBack`) is heard by no overlay, so a panel a menu opens keeps its place, and
  // a parent stays when its child closes. Only those backs count: the NPC path's and the editor's are a user's Back.
  // A cleanup back that never lands must not silence the next real Back or strand a panel waiting to arm, so the count
  // gives up after CLEANUP_BACK_WAIT_MS. A pop later than that is heard as Back: the panel closes, and nothing is stuck.
  var CLEANUP_BACK_WAIT_MS = 1000;
  var cleanupBacks = 0, cleanupPop = false, cleanupTimer = null, armsWaiting = [], popsWatched = false;
  function cleanupsDone() {
    cleanupBacks = 0;
    clearTimeout(cleanupTimer);
    var w = armsWaiting;
    armsWaiting = [];
    w.forEach(function (arm) { arm(); });
  }
  function watchPops() {
    if (popsWatched) return;
    popsWatched = true;
    // Capture: on the window itself it runs before every overlay's listener, which then read cleanupPop.
    window.addEventListener('popstate', function () {
      cleanupPop = cleanupBacks > 0;
      if (cleanupPop && --cleanupBacks === 0) cleanupsDone();
    }, true);
  }
  function cleanupBack() {
    cleanupBacks++;
    clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(cleanupsDone, CLEANUP_BACK_WAIT_MS);
    history.back();
  }
  // armBack — the hook's body, for a mount outside React's effects too. Returns the disarm, which every close calls.
  // `nextTask`: a mount made during the menu row's own click, before the menu's cleanup has run, arms after it.
  function armBack(onClose, nextTask) {
    var byBack = false, gone = false, pushedHref = null;
    watchPops();
    function onPop() { if (cleanupPop) return; byBack = true; onClose(); }
    function arm() {
      if (gone) return;
      if (cleanupBacks) { armsWaiting.push(arm); return; }   // on top of the entry that back lands on, never under it
      history.pushState({ swrpgOverlay: true }, '');
      pushedHref = location.pathname + location.search;
      window.addEventListener('popstate', onPop);
    }
    if (nextTask) setTimeout(arm, 0); else arm();
    return function () {
      gone = true;
      if (pushedHref === null) return;
      window.removeEventListener('popstate', onPop);
      // Closed NOT via Back → drop our pushed entry. BUT only when the URL is still the one we
      // pushed over: a menu ACTION that navigated (⚙ → Import from OggDude) pushes its own entry
      // first, and popping here would undo that navigation and bounce the user straight back —
      // the surface opened and vanished. When the URL moved, we leave our entry buried instead,
      // which also makes Back from the new surface land on the screen the menu was opened from.
      if (!byBack && (location.pathname + location.search) === pushedHref) cleanupBack();
    };
  }
  function useBackToClose(isOpen, onClose) {
    var closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(function () {
      if (!isOpen) return undefined;
      return armBack(function () { closeRef.current(); });
    }, [isOpen]);
  }

  // usePopover — THE ONE open/close machinery of a trigger + its popover (5h, card f100-surfacing-roll-options-card ADDENDUM
  // 53 F1 as ruled at 62 F1 (b); brief §3): while `open`, Escape (the ONE stack, pushEscape: the newest layer only) closes
  // it and returns focus to the trigger; a pointerdown outside both the trigger and the popover closes it; and while
  // `backOpen` (default `open`) Back closes it (useBackToClose). ModuleMenu and the roll options' info box read it.
  // A CHILD popover — one whose trigger sits inside this popover (a talent's box opened from the reroll choice, ADDENDUM 69)
  // — counts as INSIDE: it is portalled to <body>, so DOM containment alone reads a press in it as outside. `openPopovers`
  // holds every open one's refs; popoverHolds walks the children (DOM nesting is acyclic, so the walk ends).
  var openPopovers = [];
  function popoverHolds(entry, t) {
    var p = entry.popRef.current, b = entry.btnRef.current;
    if ((p && p.contains(t)) || (b && b.contains(t))) return true;
    return !!p && openPopovers.some(function (c) {
      var cb = c.btnRef.current;
      return c !== entry && cb && cb !== p && p.contains(cb) && popoverHolds(c, t);
    });
  }
  function usePopover(open, close, btnRef, popRef, backOpen) {
    var closeRef = useRef(close);
    closeRef.current = close;
    useEffect(function () {
      if (!open) return undefined;
      var pop = pushEscape(function () { closeRef.current(); if (btnRef.current) btnRef.current.focus(); });
      var entry = { btnRef: btnRef, popRef: popRef };
      openPopovers.push(entry);
      function onDown(e) {
        if (popRef.current && btnRef.current && !popoverHolds(entry, e.target)) closeRef.current();
      }
      document.addEventListener('pointerdown', onDown);
      return function () {
        pop(); document.removeEventListener('pointerdown', onDown);
        var i = openPopovers.indexOf(entry); if (i >= 0) openPopovers.splice(i, 1);
      };
    }, [open]);
    useBackToClose(backOpen === undefined ? open : !!backOpen, function () { closeRef.current(); });
  }

  // holdFocus — THE ONE focus hold of a card that stands over the page (B-1730; ruling release-r7-bug-burndown ADDENDUM
  // 625 Q1 (a)), lifted from B-1576's `openActiveSources` (ADDENDUM 276). While a card is held: focus moves in to its
  // first control (or the one `opts.first` names), Tab and Shift+Tab cycle inside it and never reach the page behind the
  // scrim, and at release focus goes back to the door that opened it. No new face: each control's own focus ring shows.
  // `getPanel` is a function, because a card mounted through its own root (`mountRefWindow`, `openActiveSources`) draws
  // on React's schedule: focus moves in once the panel has drawn its controls, and is moved back in while the opening
  // settles (about 0.6s), stopping after it has held inside for five checks in a row.
  // THE DOOR is the element that had focus when the hold began. A bar card's door is a menu row that unmounts as its
  // menu closes, so the fallback, read while the row still stands, is the trigger that controls that menu (B-1277).
  // A STACK, as `pushEscape` keeps one: only the newest hold traps. Releasing it hands focus back to the card under it:
  // to its door when that door sits inside that card, else to the control that card last held.
  // THE POPOVER RULE: a popover opened from inside a held card counts as inside it, by `popoverHolds`' reading (it is
  // portalled to <body>, so DOM containment alone reads it as outside). While one is open, Tab walks the card and its
  // popovers in one order, each popover's controls after its trigger. `summary` is a stop, as the browser makes it (the
  // Help cards fold their full tables in one).
  var HOLD_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  var focusHolds = [];
  function holdTabbables(root) {
    return root ? Array.prototype.filter.call(root.querySelectorAll(HOLD_FOCUSABLE), function (el) { return el.getClientRects().length > 0; }) : [];
  }
  function holdPopovers(panel) {   // the open popovers whose trigger sits in this card (their children ride popoverHolds)
    return openPopovers.filter(function (e) { var b = e.btnRef.current; return b && e.popRef.current && panel.contains(b); });
  }
  function holdContains(hold, t) {
    var p = hold.getPanel();
    if (!p || !t) return false;
    return p.contains(t) || holdPopovers(p).some(function (e) { return popoverHolds(e, t); });
  }
  function holdOrder(panel, pops) {   // the card's controls, each open popover's spliced in after its trigger
    var out = [];
    holdTabbables(panel).forEach(function (el) {
      out.push(el);
      pops.forEach(function (e) { if (e.btnRef.current === el) out = out.concat(holdTabbables(e.popRef.current)); });
    });
    return out;
  }
  function holdKeepTab(e) {
    if (e.key !== 'Tab' || !focusHolds.length) return;
    var hold = focusHolds[focusHolds.length - 1], panel = hold.getPanel();
    if (!panel) return;
    var pops = holdPopovers(panel), a = document.activeElement;
    var f = pops.length ? holdOrder(panel, pops) : holdTabbables(panel);
    if (!f.length) return;
    var i = f.indexOf(a);
    // Every Tab is moved here, in DOM order (Chromium's own order inside the card), not only the edges as B-1576's keepTab
    // did: WebKit does not stop on a button, so its own next stop from the card's ✕ is a field on the page behind.
    e.preventDefault();
    f[i === -1 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
  }
  function holdNoteFocus(e) {
    for (var k = focusHolds.length - 1; k >= 0; k--) if (holdContains(focusHolds[k], e.target)) { focusHolds[k].last = e.target; return; }
  }
  function holdDoor(opener) {
    var menu = opener && opener.closest ? opener.closest('[id]') : null;
    var trigger = menu ? document.querySelector('[aria-controls="' + menu.id + '"]') : null;
    return { door: opener && opener !== document.body ? opener : null, trigger: trigger };
  }
  function holdFocus(getPanel, opts) {
    opts = opts || {};
    var door = opts.door || holdDoor(document.activeElement);
    var hold = { getPanel: getPanel, last: null, door: door };
    if (!focusHolds.length) {
      document.addEventListener('keydown', holdKeepTab, true);
      document.addEventListener('focusin', holdNoteFocus, true);
    }
    focusHolds.push(hold);
    var held = true;
    function firstIn() {
      var p = getPanel(); if (!p) return null;
      var named = opts.first ? p.querySelector(opts.first) : null;
      return (named && named.getClientRects().length) ? named : holdTabbables(p)[0] || null;
    }
    (function focusIn(tries, stood) {
      if (!held) return;
      if (focusHolds[focusHolds.length - 1] === hold) {   // a card opened over this one owns focus now
        if (!holdContains(hold, document.activeElement)) { var f = firstIn(); if (f) { f.focus(); stood = 0; } } else stood++;
      }
      if (tries > 0 && stood < 5) setTimeout(function () { focusIn(tries - 1, stood); }, 30);
    })(20, 0);
    return function release() {
      if (!held) return;
      held = false;
      var wasTop = focusHolds[focusHolds.length - 1] === hold;
      focusHolds = focusHolds.filter(function (x) { return x !== hold; });
      if (!focusHolds.length) {
        document.removeEventListener('keydown', holdKeepTab, true);
        document.removeEventListener('focusin', holdNoteFocus, true);
      }
      if (!wasTop) return;
      var under = focusHolds[focusHolds.length - 1];
      var back = [door.door, door.trigger].filter(function (el) { return el && el.isConnected && el.focus; })[0] || null;
      if (under && !(back && holdContains(under, back))) {
        back = (under.last && under.last.isConnected) ? under.last : holdTabbables(under.getPanel())[0] || back;
      }
      if (back) back.focus();
    };
  }
  // useHoldFocus — holdFocus for a card that is a component: held while `open`. The door is read at the FIRST render,
  // while the row that opened it still stands (a menu row is gone by the time an effect runs).
  function useHoldFocus(ref, open, opts) {
    var doorRef = useRef(null);
    if (open && !doorRef.current) doorRef.current = holdDoor(document.activeElement);
    if (!open) doorRef.current = null;
    useEffect(function () {
      if (!open) return undefined;
      return holdFocus(function () { return ref.current; }, Object.assign({}, opts, { door: doorRef.current }));
    }, [open]);
  }

  // makeRouter — shared URL-as-state mechanism (navigation Phase 2a), History API. Each app passes its OWN
  // path<->route mappers + apply(route, viaPop); the wiring (seed + pushState-on-nav + one popstate) is
  // shared. Contract (recon §3): replaceState seeds the initial entry; pushState on entry; popstate
  // re-applies. (Routed OVERLAYS use useBackToClose, above — a cleaner fit for React state-driven overlays.)
  //   opts: { pathFor(route)->pathname(+search), parsePath(pathname,search)->route, apply(route,viaPop) }
  // Returns { navTo(route), replace(route), start() }. HoloDice is its first adopter (mode practice/demo);
  // Player/GM converge onto it opportunistically (nav-phase2a-findings — not a forced refactor).
  function makeRouter(opts) {
    var pathFor = opts.pathFor, parsePath = opts.parsePath, apply = opts.apply;
    function curr() { return window.location.pathname + window.location.search; }
    function navTo(route) {
      apply(route, false);
      var path = pathFor(route);
      if (curr() !== path) history.pushState({ route: route }, '', path);
    }
    function replace(route) {
      apply(route, false);
      history.replaceState({ route: route }, '', pathFor(route));
    }
    function start() {
      var route = parsePath(window.location.pathname, window.location.search);
      history.replaceState({ route: route }, '', curr());
      apply(route, false);
      function onPop() { apply(parsePath(window.location.pathname, window.location.search), true); }
      window.addEventListener('popstate', onPop);
      return function () { window.removeEventListener('popstate', onPop); };
    }
    return { navTo: navTo, replace: replace, start: start };
  }

  // SubTabs — the ONE shared in-app tab idiom (navigation Phase 3b): rounded pills, accent active-state +
  // aria-current, ≥44px, labelled <nav> (distinct from the suite/bottom nav), navigation-only. Promoted
  // from GM's PillNav. CONDITIONAL tabs via an optional `when` on an item (when===false → hidden); the
  // index math lives here, not the callers (retires the array-splice/index-shift fragility).
  // Props: { items:[{id, label, disabled?, when?, testid?}], activeId, onSelect, accent, label? }
  function SubTabs(props) {
    var a = props.accent || '#4EAAFF';
    var items = (props.items || []).filter(function (it) { return it && it.when !== false; });
    var activeId = props.activeId, onSelect = props.onSelect;
    return h('nav', {
      'aria-label': props.label || 'Sub-sections', className: 'subtabs',
      style: {
        display: 'flex', gap: '8px', padding: '12px 16px 14px', overflowX: 'auto', flexShrink: 0,
        borderBottom: '1px solid ' + a + '10', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        maskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 18px), rgba(0,0,0,0.25) 100%)',
        WebkitMaskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 18px), rgba(0,0,0,0.25) 100%)',
      },
    }, items.map(function (it) {
      var isActive = it.id === activeId, isDisabled = it.disabled;
      return h('button', {
        key: it.id, type: 'button', 'aria-current': isActive ? 'page' : undefined,
        'data-testid': it.testid || undefined,
        onClick: isDisabled ? undefined : function () { onSelect(it.id); },
        style: {
          flexShrink: 0, minHeight: '44px', padding: '12px 16px', borderRadius: '22px',
          border: '1px solid ' + (isActive ? a + '60' : 'rgba(255,255,255,0.08)'),
          background: isActive ? a + '22' : 'rgba(255,255,255,0.03)',
          color: isDisabled ? 'rgba(255,255,255,0.18)' : (isActive ? a : 'rgba(255,255,255,0.5)'),
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.16em',
          cursor: isDisabled ? 'default' : 'pointer', touchAction: 'manipulation',
          transition: 'background .2s ease, color .2s ease, border-color .2s ease', opacity: isDisabled ? 0.55 : 1,
        },
      }, it.label,
        isDisabled ? h('span', { style: { marginLeft: '6px', fontSize: 'var(--fs-2xs)', opacity: 0.55, letterSpacing: '0.18em' } }, 'SOON') : null);
    }));
  }

  // ModuleMenu — a labelled Disclosure popover of a module's OWN actions/toggles (navigation Phase 3a;
  // also backs the suite-bar ⚙ settings). Reuses the switcher pattern: button aria-expanded/aria-controls
  // → a labelled popover; useBackToClose (Back closes); Esc closes + returns focus; no trap; ≥44px rows.
  // Props: { label, accent, items:[{label, kind:'toggle'|'action', value?, onToggle?, onSelect?}], icon?,
  //   compact?, paper?, cue? } compact → icon-only trigger button (label still the aria-label); cue → {kind, text}, the
  //   paper trigger's count bubble (B-1213).
  function ModuleMenu(props) {
    var a = props.accent || '#4EAAFF';
    var items = props.items || [];
    var st = useState(false), open = st[0], setOpen = st[1];
    var btnRef = useRef(null), popRef = useRef(null);
    // 5h (card ADDENDUM 62 F1 (b), F4 (a)): Esc, an outside press and Back through the ONE popover hook — Esc on the one
    // stack now closes this menu ONLY (one press, one layer); focus returns to the trigger as before
    usePopover(open, function () { setOpen(false); }, btnRef, popRef);
    // B-1171 — THE VIEWPORT CLAMP (ruling `b1171-account-menu-clamp` R-B1171-2). The popover hangs
    // `right: 0` from its trigger, so a trigger standing left of the bar's other chips (the Account
    // chip on the paper bars) ran a 236px menu 33px off a phone's left edge. On open, and on resize
    // while open, measure the box where it naturally stands; if it leaves the viewport, shift it back
    // to an 8px gutter, never past its own trigger's far edge. A box that is inside where it stands is
    // not moved — Help stands 6px from the right edge and stays there — so its style is unchanged.
    // `right`, not `transform`: `.panel-enter`'s animation owns `transform` and would override it.
    var sh = useState(0), shift = sh[0], setShift = sh[1];
    React.useLayoutEffect(function () {
      if (!open) { setShift(0); return undefined; }
      function clamp() {
        var p = popRef.current, b = btnRef.current;
        if (!p || !b) return;
        var r = p.getBoundingClientRect(), t = b.getBoundingClientRect();
        var cur = -(parseFloat(p.style.right) || 0);            // the shift the box carries now
        var L = r.left - cur, R = r.right - cur, W = document.documentElement.clientWidth || window.innerWidth, G = 8;
        var d = L < 0 ? G - L : (R > W ? (W - G) - R : 0);
        d = Math.max(t.left - R, Math.min(t.right - L, d));
        if (Math.abs(d - cur) > 0.5) setShift(d);
      }
      clamp();
      window.addEventListener('resize', clamp);
      return function () { window.removeEventListener('resize', clamp); };
    }, [open]);
    var id = 'modmenu-' + (props.label || 'menu').replace(/\W+/g, '').toLowerCase();
    var tap = { minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' };
    // B-679 — the TRIGGER takes the paper face (`.pb-icon`: the same 44px floor, the document's muted
    // ink) when its host bar does. B-793 — AND SO DOES THE POPOVER BELOW, on Jason's walk line
    // ("Settings and help in the bar have legacy ui under them", 2026-09-22), which answered the
    // question B-689 left open. NOT BUILT TO A FRAME: no approved frame draws an open menu, so the
    // face is derived from the kit and from the bars' own paper rules (`store.css` §THE BARS, ON
    // PAPER) and goes to Jason for his word. The device throughout is B-689's: the paper branch sets
    // the GROUND and INK declarations to `undefined` — React omits them, so the dark object is
    // byte-identical — and `[data-paper-chrome]` rules answer for them instead. Every layout number,
    // every word and every aria attribute below is the app's and does not move.
    var paper = !!props.paper;
    // D-95(3) (ruling `paper-n5-flip` R-N5F-2): on paper the ROWS take the body letters approved frame C1 draws — the
    // label of a switch or segment row and the plain action row drop the dark face's inline mono family, size and
    // tracking (and its ink, as before), and chrome.css's `.pb-pop:not(.suite-pop)` rule answers at C1's computed
    // values. The pills keep their inline mono (B-793's pill), the group head its display face; the dark object is
    // byte-identical, as B-689's device always left it.
    var PAPER_ROW_LETTERS = { fontFamily: undefined, fontSize: undefined, letterSpacing: undefined, color: undefined };
    return h('div', { style: { position: 'relative' } },
      h('button', { ref: btnRef, type: 'button', 'aria-haspopup': true, 'aria-expanded': open, 'aria-controls': id,
        'aria-label': props.label, onClick: function () { setOpen(!open); },
        className: paper ? 'pb-icon' : undefined,
        // B-689 — THE APP'S TWO SPACING NUMBERS SURVIVE THE PAPER FACE when the trigger carries its
        // WORD. The store's bar is `compact` (a context rides it), so its trigger is the 44px glyph
        // the six frames draw and its paper style stays `undefined`, byte-identical to B-679. The
        // sheet's and the landing's bar is NOT compact — SETTINGS and HELP are spelled out beside the
        // glyphs, which is the app's own copy and B-679's rule is that the words never move — and
        // `.pb-icon` carries no gap or padding, because the drawn form has no word to space. Without
        // these two the labels ran into the glyphs and into each other. They are the APP'S numbers
        // (the same `6px` / `0 10px` the dark face uses), not a new treatment: the ground and the inks
        // are still the only thing `paper` swaps.
        style: paper ? (props.compact ? undefined : { gap: '6px', padding: '0 10px' })
          : Object.assign({}, tap, { gap: '6px', padding: props.compact ? '0' : '0 10px', background: 'none', border: 'none', cursor: 'pointer', color: open ? a : 'rgba(255,255,255,0.88)', borderRadius: '8px' }) },
        // B-1213 THE CUE (R-B1213-12): `cue` = { kind, text } draws the bar's `.pb-badge` in `.pb-mark` on the glyph, paper
        // only. On a trigger that carries its WORD the bubble hangs 6px past the glyph, not the part's 10, to clear the word
        // (frames lab `170870f46`, measured there).
        (paper && props.cue) ? h('span', { className: 'pb-mark', 'data-cue': props.cue.kind },
          props.icon, h('span', { 'aria-hidden': true, className: 'pb-badge', style: props.compact ? undefined : { right: -6 } }, props.cue.text))
          : (props.icon || null),
        props.compact ? null : h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em' } }, props.labelText || props.label)),
      open ? h('nav', { id: id, ref: popRef, 'aria-label': props.label,
        className: 'panel-enter' + (paper ? ' pb-pop' : ''),
        style: Object.assign({ position: 'absolute', top: 'calc(100% + 8px)', right: shift ? -shift : 0, zIndex: 200, minWidth: '236px',
          display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px',
          background: 'rgba(14,19,29,0.98)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: '12px', boxShadow: '0 20px 44px rgba(0,0,0,0.6)' },
          paper ? { background: undefined, border: undefined, borderRadius: undefined, boxShadow: undefined } : null) },
        items.map(function (it, i) {
          if (it.kind === 'header') {
            // ledger group head (premium idiom §3: accent name + hairline rule) — concept §3/C1: [screen]/GENERAL
            return h('div', { key: i, 'aria-hidden': true, className: paper ? 'pb-pop-head' : undefined,
                style: { padding: (i === 0 ? '4px' : '12px') + ' 10px 5px' } },
              h('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 4 } },
                // A GROUP HEAD, so on paper it takes the ground's own section-head INK
                // (`--doc-sechead-ink`) and keeps the dark face's 1px hairline rather than the
                // section-head contract's 2px action rule — reported as a deviation, with its reason.
                h('span', { className: paper ? 'pb-pop-headn' : undefined,
                  style: Object.assign({ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.16em', color: a },
                    paper ? { color: undefined } : null) }, it.label)),
              h('div', { className: paper ? 'pb-pop-rule' : undefined,
                style: Object.assign({ height: 1, background: 'linear-gradient(90deg,' + hexA(a, 0.3) + ',transparent)' },
                  paper ? { background: undefined } : null) }));
          }
          if (it.kind === 'toggle') {
            return h('button', { key: i, type: 'button', role: 'switch', 'aria-checked': !!it.value, onClick: it.onToggle,
              className: paper ? 'pb-pop-row' : undefined,
              style: Object.assign({}, tap, { justifyContent: 'space-between', gap: '12px', padding: '0 12px', minHeight: '46px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px' },
                paper ? { borderRadius: undefined } : null) },
              h('span', { className: paper ? 'pb-pop-lab' : undefined,
                style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: '#fff' },
                  paper ? PAPER_ROW_LETTERS : null) }, it.label),
              // THE PILL IS A SETTING'S VALUE — a thing that simply IS — so on paper it is the
              // ground's STATE fill (`--doc-state`, its own parchment ink read back on it at 14.3:1)
              // and not the action red, which the ground's own docstring reserves for a thing the
              // character DOES. The WORD is what carries it either way: state is never a hue alone.
              h('span', { 'aria-hidden': true, className: paper ? 'pb-pill' : undefined,
                'data-on': (paper && it.value) ? '1' : undefined,
                style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.16em', padding: '3px 8px', borderRadius: '5px',
                  color: it.value ? '#08121f' : 'rgba(255,255,255,0.5)', background: it.value ? a : 'rgba(255,255,255,0.06)', border: '1px solid ' + (it.value ? a : 'rgba(255,255,255,0.12)') },
                  paper ? { color: undefined, background: undefined, border: undefined, borderRadius: undefined } : null) }, it.value ? 'ON' : 'OFF'));
          }
          if (it.kind === 'segment') {
            // F-46 D4: a 3-option row (label + inline option pills). it.value = active; it.options =
            // [{value,label}]; it.onSelect(value). Used for the ⚙ GENERAL LAYOUT row (AUTO·MOBILE·DESKTOP).
            return h('div', { key: i, className: paper ? 'pb-pop-seg' : undefined,
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '6px 12px', minHeight: '46px', width: '100%' } },
              h('span', { className: paper ? 'pb-pop-lab' : undefined,
                style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: '#fff' },
                  paper ? PAPER_ROW_LETTERS : null) }, it.label),
              h('div', { role: 'group', 'aria-label': it.label, style: { display: 'flex', gap: '3px' } },
                (it.options || []).map(function (opt) {
                  var on = opt.value === it.value;
                  return h('button', { key: opt.value, type: 'button', 'aria-pressed': on, onClick: function () { if (it.onSelect) it.onSelect(opt.value); },
                    className: paper ? 'pb-pill' : undefined, 'data-on': (paper && on) ? '1' : undefined,
                    style: Object.assign({ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.14em', padding: '4px 8px', borderRadius: '5px',
                      color: on ? '#08121f' : 'rgba(255,255,255,0.5)', background: on ? a : 'rgba(255,255,255,0.06)', border: '1px solid ' + (on ? a : 'rgba(255,255,255,0.12)') },
                      paper ? { color: undefined, background: undefined, border: undefined, borderRadius: undefined } : null) }, opt.label);
                })));
          }
          return h('button', { key: i, type: 'button', onClick: function () { setOpen(false); if (it.onSelect) it.onSelect(); },
            className: paper ? 'pb-pop-row' : undefined,
            style: Object.assign({}, tap, { justifyContent: 'flex-start', gap: '10px', padding: '0 12px', minHeight: '46px', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.88)' },
              paper ? Object.assign({ borderRadius: undefined }, PAPER_ROW_LETTERS) : null) }, it.label);
        })
      ) : null
    );
  }

  // ── Auto-hide chrome (SHARED; extracted from diceSurface for the IA lap — ONE home) ─────────────
  // Idle → adds `body.chrome-hidden`; elements with class `autohide-chrome` fade (CSS in tokens.css).
  // Reduced-motion or an optional pin key disable it (chrome stays visible). options: {idleMs?, pinKey?}.
  // Behavior is byte-faithful to the dice original (incl. the body.dice-rolling pause).
  function usePrefersReducedMotion() {
    var _s = React.useState(function () {
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    });
    var val = _s[0], set = _s[1];
    React.useEffect(function () {
      try {
        var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        var on = function () { set(mq.matches); };
        mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
        return function () { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
      } catch (e) {}
    }, []);
    return val;
  }
  function useAutoHideChrome(options) {
    options = options || {};
    var idleMs = options.idleMs || 3000;
    var pinKey = options.pinKey || null;
    var active = options.active !== false;   // opt-out per screen (e.g. off on focus editors); default on
    function readPin() { try { return !!(pinKey && window.localStorage.getItem(pinKey) === '1'); } catch (e) { return false; } }
    var reducedMotion = usePrefersReducedMotion();
    var _p = React.useState(readPin); var pinned = _p[0], setPinnedState = _p[1];
    var timerRef = React.useRef(null);
    // The idle state lives in a REF + a direct body-class toggle — NEVER React state. So the 3s idle timer
    // never re-renders the host component. This removes, BY CONSTRUCTION, the save/fork re-render race that
    // deferred the NPC-library fade (ruling npc-library-ia-idle-fade-wiring, option A): a fade indicator has
    // no business re-drawing the screen it dims. `pinned` stays React state — it's user-initiated (the dice
    // PIN-UI toggle reflects it) and off the idle path, so it can't race.
    var hiddenRef = React.useRef(false);
    function applyHidden(next) {
      hiddenRef.current = next;
      if (typeof document !== 'undefined') document.body.classList.toggle('chrome-hidden', next);
    }
    function setPinned(v) {
      var next = !!v; setPinnedState(next);
      try { if (pinKey) window.localStorage.setItem(pinKey, next ? '1' : ''); } catch (e) {}
      if (next) applyHidden(false);   // pinning forces the chrome visible
    }
    function togglePinned() { setPinned(!pinned); }
    React.useEffect(function () {
      if (typeof document === 'undefined') return;
      // Inactive (focus editor), reduced-motion, or pinned → never arm; force + keep the chrome visible.
      if (!active || reducedMotion || pinned) {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        applyHidden(false);
        return;
      }
      function arm() {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(function () {
          if (document.body.classList.contains('dice-rolling')) { arm(); return; }  // pause during a roll cycle
          applyHidden(true);
        }, idleMs);
      }
      function wake() { if (hiddenRef.current) applyHidden(false); arm(); }
      arm();
      var opts = { passive: true };
      window.addEventListener('mousemove', wake, opts);
      window.addEventListener('pointerdown', wake, opts);
      window.addEventListener('keydown', wake, opts);
      window.addEventListener('focus', wake, opts);
      return function () {
        window.removeEventListener('mousemove', wake, opts);
        window.removeEventListener('pointerdown', wake, opts);
        window.removeEventListener('keydown', wake, opts);
        window.removeEventListener('focus', wake, opts);
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        applyHidden(false);   // clear on unmount so leaving never leaves the class stuck
      };
    }, [reducedMotion, pinned, active]);   // NO `hidden` dep — it's a ref, off the render path
    return { hidden: hiddenRef.current, pinned: pinned, reducedMotion: reducedMotion, togglePinned: togglePinned };
  }

  // ── Edge-summoned chrome (SHARED; B-629, Jason 2026-09-16) ─────────────────────────────────────
  // "I want the top and bottom navigation bars to be called from a contextual button or be called from
  // contextual movements like the mouse moving to the edge of the screen." While `active`, the app sets
  // body.sheet-table: the two bars leave the flow (fixed, slid off-screen — tokens.css) and the surface
  // takes the whole screen. They come back when the POINTER reaches the top or bottom 14px of the viewport
  // and stay while it is over a bar, leaving 900ms after it goes; KEYBOARD FOCUS inside a bar calls them the
  // same way (B-1494/B-1497); a CONTEXTUAL BUTTON pins them (a press again, Escape, or a tap on the surface
  // lets them go). Summoned state is a body class set directly, like
  // useAutoHideChrome's — the mousemove path never re-renders the host. options: { active }.
  function useEdgeChrome(options) {
    options = options || {};
    var active = !!options.active;
    var _p = React.useState(false); var pinned = _p[0], setPinned = _p[1];
    var timerRef = React.useRef(null), shownRef = React.useRef(false), pinnedRef = React.useRef(false);
    var surfaceFocusRef = React.useRef(null);   // C1 (ii): the last surface control that held focus, Escape's way out of a bar
    pinnedRef.current = pinned;
    function apply(next) {
      shownRef.current = next;
      if (typeof document !== 'undefined') document.body.classList.toggle('chrome-summoned', next);
    }
    React.useEffect(function () {
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('sheet-table', active);
      if (!active) { apply(false); setPinned(false); return function () { document.body.classList.remove('sheet-table'); }; }
      var EDGE = 14;
      function overBar(el) { return !!(el && el.closest && el.closest('.suite-bar, .bottom-nav')); }
      // C1 (ruling `release-r7-bug-burndown` ADDENDUM 156) — A CONTROL HOLDING FOCUS INSIDE A BAR IS NEVER OFF-SCREEN.
      // (i) no pointer release hides a bar while focus is inside it: the timer asks at the moment it fires.
      function release(ms) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(function () {
          timerRef.current = null;
          if (!pinnedRef.current && !overBar(document.activeElement)) apply(false);
        }, ms);
      }
      // (ii) Escape still releases the bar (B-629's Escape) and takes focus OUT of it, to a visible place on the
      // surface: the last surface control that held focus, else the page's main region (`#suite-main`, the skip
      // link's own target, made focusable by script only).
      function focusOutOfBar() {
        var back = surfaceFocusRef.current, r = back && back.isConnected && !back.closest('[inert]') && back.getBoundingClientRect();
        if (r && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) { back.focus({ preventScroll: true }); if (document.activeElement === back) return; }
        var main = document.getElementById('suite-main');
        if (!main) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return; }
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
      function onMove(e) {
        if (pinnedRef.current) return;
        var y = e.clientY, atEdge = y <= EDGE || y >= window.innerHeight - EDGE;
        if (atEdge || (shownRef.current && overBar(e.target))) { if (!shownRef.current) apply(true); if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }
        else if (shownRef.current && !timerRef.current) release(900);
      }
      function onLeave() { if (!pinnedRef.current && shownRef.current) release(600); }
      function onKey(e) {
        if (e.key !== 'Escape') return;
        var inBar = overBar(document.activeElement);
        if (pinnedRef.current || shownRef.current || inBar) { setPinned(false); apply(false); }
        if (inBar) focusOutOfBar();
      }
      function onDown(e) { if (pinnedRef.current && !overBar(e.target) && !(e.target.closest && e.target.closest('[data-chrome-summon]'))) { setPinned(false); apply(false); } }
      // B-1494 / B-1497 (ruling `release-r7-bug-burndown` ADDENDUM 146, ASK 1 (a)) — FOCUS IS A CONTEXTUAL CALL TOO.
      // A control on a hidden bar is still in the Tab order, and a keyboard landed on it with the bar off-screen.
      // Focus inside a bar summons it; focus leaving the bars releases it on the pointer's 900ms, unless pinned.
      function onFocusIn(e) {
        if (!overBar(e.target)) { if (e.target !== document.getElementById('suite-main')) surfaceFocusRef.current = e.target; return; }
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        if (!shownRef.current) apply(true);
      }
      function onFocusOut(e) { if (overBar(e.target) && !overBar(e.relatedTarget) && shownRef.current && !pinnedRef.current) release(900); }
      var opts = { passive: true };
      window.addEventListener('mousemove', onMove, opts);
      document.documentElement.addEventListener('mouseleave', onLeave, opts);
      window.addEventListener('keydown', onKey);
      window.addEventListener('pointerdown', onDown, opts);
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('focusout', onFocusOut);
      return function () {
        window.removeEventListener('mousemove', onMove, opts);
        document.documentElement.removeEventListener('mouseleave', onLeave, opts);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('pointerdown', onDown, opts);
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('focusout', onFocusOut);
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        apply(false); document.body.classList.remove('sheet-table');
      };
    }, [active]);
    React.useEffect(function () { if (active) apply(pinned || shownRef.current); }, [pinned, active]);
    function togglePinned() { setPinned(function (p) { return !p; }); }
    return { pinned: pinned, togglePinned: togglePinned, summon: function () { setPinned(true); }, dismiss: function () { setPinned(false); apply(false); } };
  }

  // ── glyphText — shared [XX]-token → FFG-glyph renderer for M1 crit tables + M2 spend menu (MC1 dedupe) ──
  // symbolSpan + BRACKET_TOKENS on window.SWRPGDice.
  //
  // R3 Q2a: the upgrade path this comment used to promise ("hoist when a second consumer appears") is
  // TAKEN — it is exported on window.SWRPGUI below, and the two item-description surfaces
  // (lib/store/view.jsx, lib/shared/yardView.jsx) consume it from HERE. It stays ONE definition: no
  // copy, no reimplementation. Q1 restored 2,116 canonical [XX] tokens to the item catalogues, and a
  // surface that renders them raw shows the reader machine notation where a die symbol belongs.
  //
  // THE UNKNOWN-TOKEN BRANCH IS LOAD-BEARING (`return mm ? '' : p`): a bracket-shaped token this
  // cannot resolve renders as NOTHING, never as visible brackets. C-Q1-2 requires that behaviour —
  // do not "fix" it into a passthrough.
  // `opts.cssSized` (B-1600; ruling release-r7-bug-burndown ADDENDA 251, 276): the caller's stylesheet draws the glyph's
  // box (the creator ground's `.hp-sym` 1.02em), so `symbolSpan` writes no inline size. Every caller that passes nothing
  // draws as before.
  function glyphText(text, size, opts) {
    var D = window.SWRPGDice || {};
    var so = (opts && opts.cssSized) ? { fill: true, cssSized: true } : { fill: true };
    var bridge = D.BRACKET_TOKENS || {};
    if (D.fontAbsent && D.fontAbsent() && D.dieWordSpan) {
      // T3 (ADDENDUM 6, D-510): without the dice font a token reads as a word, a run of the same token as its count
      // ("[AD][AD]" -> "2 advantage"); an unknown token still draws nothing (C-Q1-2)
      var parts = String(text || '').split(/(\[[A-Z]{2}\])/g), out = [];
      for (var j = 0; j < parts.length; j++) {
        var mt = parts[j].match(/^\[([A-Z]{2})\]$/);
        if (!mt) { if (parts[j]) out.push(parts[j]); continue; }
        if (!bridge[mt[1]]) continue;
        var c = 1;
        while (parts[j + 1] === '' && parts[j + 2] === parts[j]) { c++; j += 2; }
        out.push(D.dieWordSpan(bridge[mt[1]], c > 1 ? c : null, j));
      }
      return out;
    }
    return String(text || '').split(/(\[[A-Z]{2}\])/g).map(function (p, i) {
      var mm = p.match(/^\[([A-Z]{2})\]$/);
      // PROSE OPTS INTO THE FILL FAMILY (ruling `tree-cell-force-pip-fill` R-FPF-2/3). This is the
      // only caller that does: `renderPool` — the pool and the Force RATING ROW — passes nothing
      // and keeps the plain mark, which is exactly how the board draws the two (135 filled marks
      // in prose, 11 plain inside `hp-frrow`, measured at pin 5763dc2c). The markup is emitted on
      // every surface and neutralised off the paper ground by the base rule in `tokens.css`, so
      // the dark surfaces are pixel-identical until B-498 rules the house style.
      if (mm && bridge[mm[1]] && D.symbolSpan) return D.symbolSpan(bridge[mm[1]], i, size || 1.1, so);
      return mm ? '' : p;
    });
  }

  // ── CritTableRef — shared cited d100 Critical-Hit/Injury reference (mid-session pack M1) ──────
  // One surface for "find and read the d100 crit table," consumed by the player sheet (roll + browse +
  // ATTACH) and the GM bench (read-only browse). variant: 'character' (eote p.217) | 'vehicle' (p.244).
  // critCount adds the RAW +10-per-existing-crit modifier. onAttach(entry) present → rows get an ADD
  // action; absent → browse-only. Data: public/data/canonical/crit_tables.json (fetch-once, cached on
  // window._critTables — promoted from the VERIFIED rules_tables by scripts/canonical/build_crit_tables.py).
  function critInRange(range, n) {
    range = String(range).trim();
    if (/\+$/.test(range)) return n >= parseInt(range, 10);
    var m = range.split('-');
    var lo = parseInt(m[0], 10), hi = parseInt(m.length > 1 ? m[1] : m[0], 10);
    return n >= lo && n <= hi;
  }
  function CritTableRef(props) {
    var variant = props.variant || 'character';
    var accent = props.accent || '#FF6B6B';
    var onAttach = props.onAttach;
    var critCount = props.critCount || 0;
    var _d = useState(window._critTables || null), data = _d[0], setData = _d[1];
    var _r = useState(null), rolled = _r[0], setRolled = _r[1];
    var _rd = useState(null), rolledD = _rd[0], setRolledD = _rd[1];   // F-100 M8 step 3: the d100 itself, for the printed steps
    useEffect(function () {
      if (window._critTables) { setData(window._critTables); return; }
      fetch('public/data/canonical/crit_tables.json').then(function (r) { return r.json(); })
        .then(function (j) { window._critTables = j; setData(j); })
        .catch(function () {});
    }, []);
    if (!data || !data[variant]) return null;
    var table = data[variant];
    var rows = table.rows || [];
    // F-100 M8 C11 (R-M8K-18/19): the owner's crit_roll_delta rows (Durable) apply to the injury THEY suffer, in N6's
    // order — the d100, every +10, then the reductions, then the floor — through the one core (SWRPGPoolMods.critRoll).
    // `rollSources` (the player's sheet passes SWRPGSheetPool.collectRollNumbers(sheet)) absent → the bare +10s, as before.
    // The result's `lines` are the roll's printed steps; the approved frame draws them (step 3, F4).
    function roll() {
      var d = 1 + Math.floor(Math.random() * 100), P = window.SWRPGPoolMods;
      if (P && P.critRoll && P.rollNumbersAt && props.rollSources) {
        var r = P.critRoll(d, critCount, P.rollNumbersAt(props.rollSources, 'crit_roll_delta', { moment: 'critical_injury', sheet: props.sheet }));
        setRolledD(d); setRolled(r.total); return;
      }
      setRolledD(d); setRolled(d + critCount * 10);
    }
    // F-100 M8 step 3 (frame R2): the roll's printed steps BEFORE it is rolled — the button's words and one line per step
    // ("+10 — 1 injury already", "−10 — Durable (never below 1)") — from the same critRoll the roll uses, so the button,
    // the lines and the sheet's "Next crit roll" agree.
    var Pm = window.SWRPGPoolMods;
    var steps = (Pm && Pm.critRoll && Pm.rollNumbersAt && props.rollSources)
      ? Pm.critRoll(0, critCount, Pm.rollNumbersAt(props.rollSources, 'crit_roll_delta', { moment: 'critical_injury', sheet: props.sheet })).lines
      : (critCount ? [{ label: critCount + (critCount === 1 ? ' injury' : ' injuries') + ' already suffered', amount: critCount * 10 }] : []);
    var stepWords = steps.map(function (l) { return (l.amount < 0 ? '−' : '+') + Math.abs(l.amount); }).join(' ');
    var stepLine = function (l) {
      var lab = /already suffered$/.test(l.label) ? l.label.replace(/ suffered$/, '') : l.label + (l.amount < 0 ? ' (never below ' + (l.floor != null ? l.floor : 1) + ')' : '');
      return '▸ ' + (l.amount < 0 ? '−' : '+') + Math.abs(l.amount) + ' — ' + lab;
    };
    var matchIdx = rolled == null ? -1 : rows.findIndex(function (row) { return critInRange(row[0], rolled); });
    function attach(row) {
      if (!onAttach) return;
      var sevWord = String(row[1] || '').split(' ')[0];                       // "Easy ([DI])" -> "Easy"
      var diceN = (String(row[1]).match(/\[DI\]/g) || []).length;
      var result = String(row[2] || '');
      var colon = result.indexOf(':');
      onAttach({
        id: 'crit_' + Date.now(),
        severity: sevWord || row[0],
        severityTier: sevWord,
        difficulty_dice: diceN,
        name: colon > -1 ? result.slice(0, colon).trim() : result.slice(0, 40),
        effect: colon > -1 ? result.slice(colon + 1).trim() : result,
        d100: rolled,
        source: 'table',
      });
    }
    // B-626 (the paper order): the table on the paper sheet — the head line with the cite and ROLL d100 as the
    // kit's chip, the rolled line as a status, the rows as entries (range · severity · the result · Add), the hit
    // row marked; a bounded list. Same data, same roll, same attach payload, on the board's own objects.
    if (props.paper) {
      return h('div', { className: 'sb-crit-table', 'data-testid': 'crit-table' },
        h('div', { className: 'sb-grp', style: { paddingTop: 0 } }, (table.title || 'Critical hit') + (table.cite ? ' · ' + table.cite : ''),
          h('button', { type: 'button', className: 'hp-quiet', 'data-testid': 'crit-roll', onClick: roll, style: { marginLeft: 'auto' } }, 'Roll d100' + (stepWords ? ' ' + stepWords : ''))),
        // F-100 M8 (frame R2): the roll's printed steps; their type grows by the sheet's unit `--u-k` with the table around
        // them (item 23, AS-9 SCALE at 2560/3840) — absent outside the sheet's .sbwrap, where it reads 1
        steps.some(function (l) { return l.amount < 0; }) ? h('div', { 'data-m8': 'injury', style: { display: 'grid', gap: 4, margin: '8px 0 4px' } },
          steps.map(function (l, i) { return h('div', { key: i, className: 'm8-cap', style: { fontFamily: 'var(--font-body)', fontSize: 'calc(14px * var(--u-k, 1))', color: 'var(--doc-ink-muted)', margin: 0 } }, stepLine(l)); })) : null,
        rolled != null ? h('p', { className: 'sb-e-t', role: 'status', 'aria-live': 'polite', 'data-testid': 'crit-rolled' },
          h('b', null, 'Rolled ' + (rolledD != null && stepWords ? rolledD + ' ' + stepWords + ' = ' + rolled : rolled)), matchIdx > -1 ? ' — ' + String(rows[matchIdx][2]).split(':')[0] : '') : null,
        h('div', { className: 'sb-crit-rows hp-bands', 'data-testid': 'crit-rows' },
          rows.map(function (row, i) {
            var hit = i === matchIdx; var name = String(row[2] || '').split(':')[0];
            return h('div', { key: i, className: 'sb-att sb-crit-row', 'data-hit': hit ? '1' : '0', 'data-testid': 'crit-table-row' },
              h('div', { className: 'sb-e-h' },
                h('span', { className: 'sb-e-m', style: { minWidth: 52 } }, row[0]),
                h('span', { className: 'sb-e-n' }, name),
                h('span', { className: 'sb-e-m' }, glyphText(row[1])),
                onAttach ? h('button', { type: 'button', className: hit ? 'hp-commit' : 'hp-quiet', 'data-testid': 'crit-table-add', 'aria-label': 'Attach ' + name, onClick: function () { attach(row); } }, 'Add') : null),
              h('p', { className: 'sb-e-t' }, glyphText(String(row[2] || '').indexOf(':') > -1 ? String(row[2]).slice(String(row[2]).indexOf(':') + 1).trim() : String(row[2]))));
          })));
    }
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } },
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' } },
          (table.title || 'CRITICAL HIT') + ' · ' + (table.cite || '')),
        h('button', {
          type: 'button', onClick: roll,
          style: {
            padding: '6px 12px', minHeight: TAP, borderRadius: 14, cursor: 'pointer',
            background: accent + '18', border: '1px solid ' + accent + '55',
            fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', color: accent,
          },
        }, '⚄ ROLL d100' + (critCount ? ' +' + (critCount * 10) : ''))
      ),
      rolled != null ? h('div', {
        role: 'status', 'aria-live': 'polite',
        style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: accent },
      }, 'Rolled ' + rolled + (matchIdx > -1 ? ' → ' + String(rows[matchIdx][2]).split(':')[0] : '')) : null,
      h('div', { style: { maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 4 } },
        rows.map(function (row, i) {
          var hit = i === matchIdx;
          return h('div', {
            key: i,
            style: {
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 4,
              background: hit ? accent + '22' : 'transparent',
              border: '1px solid ' + (hit ? accent + '66' : 'transparent'),
            },
          },
            h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,0.5)', minWidth: 52 } }, row[0]),
            h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,0.7)', minWidth: 70 } }, glyphText(row[1])),
            h('div', { style: { flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: 'rgba(255,255,255,0.82)' } }, glyphText(row[2])),
            onAttach ? h('button', {
              type: 'button', onClick: function () { attach(row); },
              'aria-label': 'Attach ' + String(row[2]).split(':')[0],
              style: {
                padding: '3px 8px', minHeight: TAP, borderRadius: 12, cursor: 'pointer', alignSelf: 'center',
                background: hit ? accent + '33' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (hit ? accent + '88' : 'rgba(255,255,255,0.12)'),
                fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.1em',
                color: hit ? accent : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap',
              },
            }, '+ ADD') : null
          );
        })
      )
    );
  }


  // ── ResultsReference — the symbol-first cited spend menu (mid-session pack M2) ────────────────
  // Tap the symbols your REAL dice show (+/- steppers, no pool/roll) → the cited spend menu filters to
  // what you can afford (dim-not-hide: whole table shown, affordable lit, rest muted-but-readable). Scene
  // chips (general/combat/starship); BROWSE mode = full tables as printed. Characterless by construction
  // (D-RR1); every row shows its book-page cite (D-RR3). Data: public/data/canonical/spend_tables.json
  // (promoted from VERIFIED sources by scripts/canonical/build_spend_tables.py). initialTally pre-fills the
  // steppers (the "SPEND THIS ROLL →" demotion from a digital roll). ponytail: inline glyph tokenizer
  // (shares nothing with M1's copy across branches — dedupe at the M1+M2 merge).
  function spendAfford(req, tally) {
    return (req || []).some(function (clause) {
      return Object.keys(clause).every(function (k) { return (tally[k] || 0) >= clause[k]; });
    });
  }
  // F-56 (ruling `crafting-journey-shape-and-save-shapes` §6) — the symbol registry, so a consumer can
  // ask for a DIFFERENT set of counters. `su`/`fa` exist because CRAFTING needs the success count for two
  // things the sheet never does: the pass/fail verdict, and the −2h-per-extra-success build-time
  // reduction. They are OPT-IN: every existing mount omits `symbols`, gets DEFAULT_SPEND_SYMS, and renders
  // byte-for-byte as before. Order within DEFAULT_SPEND_SYMS is the shipped order and must not change.
  var SYM_DEF = {
    su: ['su', 'SUCCESS',   '#7EC4FF'], fa: ['fa', 'FAILURE', '#8F98A8'],
    ad: ['ad', 'ADVANTAGE', '#45AD48'], tr: ['tr', 'TRIUMPH', '#FDE600'],
    th: ['th', 'THREAT',    '#B9B9B9'], de: ['de', 'DESPAIR', '#D86464'],   // B-1572: the despair red lightened in its family (#CC3333 read 3.49:1 on the stepper cell)
  };
  var DEFAULT_SPEND_SYMS = ['ad', 'tr', 'th', 'de'];
  function symsFor(keys) {
    return (Array.isArray(keys) && keys.length ? keys : DEFAULT_SPEND_SYMS)
      .map(function (k) { return SYM_DEF[k]; }).filter(Boolean);
  }
  function zeroTally(syms) {
    var t = {}; syms.forEach(function (s) { t[s[0]] = 0; }); return t;
  }
  // M6 — resolve the OWNER's equipped weapons into concrete spend rows: the generic "activate a weapon
  // quality" / "inflict a Critical Injury" rows become "Vicious 2 — your Vibro-ax (cited effect)". Uses the
  // SAME window._qualitiesDb the sheet/NPC use (no second resolution path). A pure LAYER (D-RR2: adds resolved
  // rows, never gates/degrades the characterless base). character = { weapons: [{name, crit, qualities}] }.
  function m6NormQual(q) {
    if (typeof q === 'string') { var m = q.match(/^(.*?)(?:\s+(\d+))?$/); return { name: (m && m[1] || q).trim(), rank: m && m[2] ? parseInt(m[2], 10) : null }; }
    if (!q) return { name: '', rank: null };
    return { name: q.name || q.Name || q.key || q.Key || q.label || '', rank: (q.rank != null ? q.rank : (q.ranked && q.value != null ? q.value : null)) };
  }
  function m6QualityEffect(name) {
    var db = window._qualitiesDb || {};
    var key = String(name).toLowerCase().replace(/\s*\d+$/, '').trim();
    var e = db[key] || db[key + ' quality'];
    return e ? (e.description || e.Description || '') : '';
  }
  // R-AE-5 (argo-a1-export ADDENDUM 3): the two cites are data, a book KEY plus a printed page (a range allowed), drawn
  // through S1's one formatter in its key form: 'eote p.205', 'eote p.154-157', as before, in both copies. Pointers, not
  // removed text, so not switched on BOOK_CONTENT.
  var M6_CRIT_CITE = { book: 'eote', page: '205' }, M6_QUALITY_CITE = { book: 'eote', page: '154-157' };
  function m6Cite(c) { return window.SWRPGSources.pageCite(c.book, c.page); }
  function m6ResolveGear(character) {
    if (!character || !Array.isArray(character.weapons)) return [];
    var rows = [];
    character.weapons.forEach(function (w) {
      if (!w || !w.name || w._unresolved) return;
      if (w.crit != null && w.crit !== '' && String(w.crit) !== '-') {
        rows.push({ name: 'Inflict a Critical Injury — ' + w.name,
          text: "Spend [AD] equal to the weapon's Critical Rating (" + w.crit + ") on a successful hit to inflict a Critical Injury (or 1 [TR]).",
          cite: m6Cite(M6_CRIT_CITE) });
      }
      (Array.isArray(w.qualities) ? w.qualities : []).forEach(function (q) {
        var nq = m6NormQual(q);
        if (!nq.name) return;
        var desc = m6QualityEffect(nq.name);
        rows.push({ name: nq.name + (nq.rank != null ? ' ' + nq.rank : '') + ' — ' + w.name,
          text: desc || '', cite: m6Cite(M6_QUALITY_CITE) });
      });
    });
    return rows;
  }
  function ResultsReference(props) {
    var accent = props.accent || '#4EAAFF';
    var character = props.character || null;   // M6
    // F-56 §6 — an OPTIONAL caller-supplied source. `{ pos, neg, posLabel?, negLabel?, tallyLabel? }`.
    // When absent (every shipped mount) the component fetches and scene-switches exactly as before.
    var source = props.source || null;
    var SYMS = symsFor(props.symbols);
    var _d = useState(window._spendTables || null), data = _d[0], setData = _d[1];
    var _mode = useState('spend'), mode = _mode[0], setMode = _mode[1];
    var _scene = useState(props.initialScene || (character ? 'combat' : 'general')), scene = _scene[0], setScene = _scene[1];
    var _t = useState(props.initialTally || zeroTally(SYMS)), tally = _t[0], setTally = _t[1];
    useEffect(function () {
      if (source) return;                                   // caller owns the data; never fetch
      if (window._spendTables) { setData(window._spendTables); return; }
      fetch('public/data/canonical/spend_tables.json').then(function (r) { return r.json(); })
        .then(function (j) { window._spendTables = j; setData(j); }).catch(function () {});
    }, []);
    var d = source || (data && data[scene]);
    if (!d) return null;
    var anySym = SYMS.some(function (s) { return tally[s[0]]; });
    function bump(k, delta) { var n = Object.assign({}, tally); n[k] = Math.max(0, (n[k] || 0) + delta); setTally(n); }

    // S3 (argo-a1-curation ADDENDUM 4; mockup F5): a row whose words the public copy removed reads its short label
    // (own_words.json at spend_tables / <scene> / pos[i]|neg[i], R-AE-7), else its book line (S1); its cite line prints
    // the book's title. On holocron (words on file) the row's own words and cite, exactly as before. A caller's own table
    // (`source`) has no labels. ONE reader for both faces and the paper face's full table.
    function spendWords(o, neg, at) {
      var body = o.text || o.effect || '';
      var SSr = typeof window !== 'undefined' ? window.SWRPGSources : null;
      var s1 = !body && SSr && SSr.removedLine ? SSr.removedLine(null, [o.cite]) : null;
      if (s1 != null) body = (!source && SSr.ownWords ? SSr.ownWords('spend_table:' + scene, (neg ? 'neg' : 'pos') + '[' + at + ']') : '') || s1;
      return { body: body, cite: s1 ? s1 : o.cite };
    }
    function optRow(o, neg, at) {
      var aff = anySym && spendAfford(o.req, tally);
      var lit = aff ? (neg ? '#CC3333' : '#45AD48') : 'rgba(255,255,255,0.12)';
      // F-56 §6 — field tolerance, NOT a second renderer. The combat tables carry {text}; crafting rows
      // carry {id, name, effect}. Both render here.
      // R-MEL-2 TWIN: the crafting journey's spend PICKER (`spendRow` in player/app.jsx) renders this
      // same row shape as an INPUT — tap-to-take plus a once_only TAKEN state. It exists because this
      // component is a REFERENCE with no selection concept and R-RR-3 bars widening it from a journey
      // diff. COLLAPSE PLAN: add `onSelect` + a taken set here in a shared-control sub-step, then
      // delete the picker. Until then the two are deliberately identical — change them together.
      var sw = spendWords(o, neg, at), body = sw.body, cite = sw.cite;   // S3 / S1 (spendWords)
      return h('div', {
        key: o.id || o.text || o.name,
        style: {
          borderLeft: '2px solid ' + lit, borderRadius: '0 7px 7px 0', padding: '7px 10px', marginBottom: 5,
          background: aff ? (neg ? 'rgba(204,51,51,0.06)' : 'rgba(69,173,72,0.06)') : 'rgba(255,255,255,0.015)',
        },
      },
        // A named row leads with its NAME and carries the effect as a subtitle (Jason 2026-07-29); an
        // unnamed row is unchanged from today — the combat tables have no names and gain no heading.
        o.name ? h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', marginBottom: 2, color: (anySym && !aff) ? 'rgba(255,255,255,0.62)' : '#f2f2f2' } }, o.name) : null,
        // dim = READABLE muted text (0.55), never sub-legible; affordable = full white. (C3)
        h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: (anySym && !aff) ? 'rgba(255,255,255,0.55)' : '#f2f2f2' } }, glyphText(body)),
        // B-1572 (ruling release-r7-bug-burndown ADDENDUM 281): the cite line's white raised from .40 (3.81:1) to .5, its own
        // family, so it clears 4.5:1 on the row's grounds; likewise the scene chips, the tally label and the PAY THREAT head.
        h('div', { style: { marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)' } },
          glyphText(o.cost), ' · ', cite)
      );
    }
    var grp = function (label, color) {
      return h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.12em', color: color, margin: '12px 0 6px' } }, label);
    };

    // AS-6 · the ±  steppers were 24x24 — a little over a QUARTER of the 44px a finger is owed, in a
    // panel whose whole job is to be poked mid-round. The tap target is the BUTTON (44x44, invisible);
    // the 26px ring inside it is only the picture. Inflating the visible circle to 44 would have
    // dominated a 133px cell and changed a design nobody asked me to change — the standard asks for a
    // target a finger can hit, not a bigger drawing. (`ADAPTIVE_STANDARD.md` AS-6.)
    var stepBtn = function (label, glyph, onClick) {
      return h('button', {
        type: 'button', 'aria-label': label, onClick: onClick,
        style: { width: TAP, height: TAP, padding: 0, border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
      }, h('span', {
        'aria-hidden': 'true',
        style: { width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-lg)', lineHeight: 1 },
      }, glyph));
    };

    // B-637 (Jason 2026-09-16: the tally in crafting "is using legacy ui"): the reference on PAPER — the tally as
    // a ledger of the six symbols, each with − n + as the kit's chips (the box keeps its shape: remove · the number ·
    // add, so a host that READS the tally off the DOM still can); CLEAR when anything is counted; the two lists as
    // entries with the affordable ones marked; the scene as chips when the caller owns no source; the full table
    // folded. Same state, same data, same affordability.
    // B-1208 (D-180 "At the floor"; frames `results.sheet.*.fs.*`, lab `4b29e1c42`): − / + and CLEAR at 44, every control
    // a role, the triumph mark in its own ink (sheet.css) — wherever the face mounts, the craft tally included. Inside the
    // reference window (`windowed`) the WINDOW carries `results-reference`, so the face does not repeat it (one testid
    // per window); mounted bare (the craft tally) the face keeps it.
    if (props.paper) {
      var stepP = function (label, glyph, onClick) { return h('button', { type: 'button', className: 'hp-quiet rr-step', 'aria-label': label, onClick: onClick,
        'data-role': 'step-' + label.toLowerCase().replace(' ', '-') }, glyph); };
      var rowP = function (o, neg, at) {
        var aff = anySym && spendAfford(o.req, tally), sw = spendWords(o, neg, at);   // S3 / S1, the dark face's one reader
        return h('div', { key: o.id || o.text || o.name, className: 'sb-att rr-row', 'data-afford': aff ? '1' : '0', 'data-dim': (anySym && !aff) ? '1' : '0' },
          h('div', { className: 'sb-e-h' }, o.name ? h('span', { className: 'sb-e-n' }, o.name) : null, h('span', { className: 'sb-e-m' }, glyphText(o.cost), sw.cite ? ' · ' + sw.cite : '')),
          h('p', { className: 'sb-e-t' }, glyphText(sw.body)));
      };
      var refLineP = function (o) {
        var sw = spendWords(o, false, 0), body = sw.body;   // a caller's table: S1 only (spendWords gives it no label)
        return h('div', { key: o.id || o.text || o.name, className: 'sb-fld', 'data-role': 'ref-line' }, h('span', null, glyphText(o.cost)),
          h('b', null, o.name ? o.name + ' — ' : '', glyphText(body), sw.cite ? h('span', { className: 'sb-e-m', style: { display: 'block' } }, sw.cite) : null));
      };
      var headWord = function (lbl, dflt) { return String(lbl || dflt).replace(/^[▲▼]\s*/, '').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }); };
      return h('div', { className: 'sb-rr', 'data-testid': props.windowed ? undefined : 'results-reference' },
        source ? null : h('div', { className: 'sb-critchips', role: 'group', 'aria-label': 'Scene', style: { marginBottom: 8 } },
          ['general', 'combat', 'starship'].map(function (s) { var on = scene === s; return h('button', { key: s, type: 'button', className: 'hp-quiet', 'data-role': 'scene-' + s, 'data-on': on ? '1' : '0', 'aria-pressed': on ? 'true' : 'false', onClick: function () { setScene(s); } }, s.charAt(0).toUpperCase() + s.slice(1)); })),
        h('div', { className: 'sb-grp', style: { paddingTop: 0 } }, headWord(source && source.tallyLabel, 'What did your dice show?'),
          anySym ? h('button', { type: 'button', className: 'hp-quiet', style: { marginLeft: 'auto', minHeight: TAP, padding: '0 10px' }, 'data-testid': 'rr-clear', onClick: function () { setTally(zeroTally(SYMS)); } }, 'Clear') : null),
        h('div', { className: 'sb-rr-tally', 'data-testid': 'rr-tally' },
          SYMS.map(function (s) {
            return h('div', { key: s[0], className: 'sb-rr-sym', 'data-sym': s[0], 'data-n': tally[s[0]] || 0 },
              h('span', { className: 'sb-rr-lab' }, s[1]),
              h('div', { className: 'sb-rr-box' },
                stepP('remove ' + s[1], '−', function () { bump(s[0], -1); }),
                h('div', { className: 'sb-rr-n' }, tally[s[0]] || 0),
                stepP('add ' + s[1], '+', function () { bump(s[0], 1); })));
          })),
        // B-1652 (D-427 item 1, page @ 8a97d5207): a caller's control directly under the counters (the craft walk's "Report the
        // table's result", so the commit follows what it commits). No caller but the craft tally passes one: the rest render as before.
        props.afterTally || null,
        (character && scene === 'combat') ? (function () {
          var gear = m6ResolveGear(character); if (!gear.length) return null;
          return h('div', { className: 'sb-e' }, h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, 'Your gear, resolved')),
            h('div', { className: 'hp-bands', 'data-run': '1' }, gear.map(function (o, i) { return h('div', { key: 'g' + i, className: 'sb-att' }, h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, o.name), h('span', { className: 'sb-e-m' }, o.cite)), h('p', { className: 'sb-e-t' }, glyphText(o.text))); })));
        })() : null,
        h('div', { className: 'sb-e' }, h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, headWord(source && source.posLabel, 'Spend advantage / triumph'))),
          // D-406 item 7 (B-1496; Docs/mockups/release-r7-small-clusters-look.html L2 @ 4ec53a8b3): a caller-owned source's
          // advantage list (the craft walk's "What advantage could buy", before the roll) is a REFERENCE, so it reads as plain
          // lines in the "Full table" fold's ink — the cost, then the name and effect, the cite under it; no entry card, no
          // affordable or dim mark. The spend reference's own lists (no source) keep their entries.
          h('div', { className: 'hp-bands', 'data-run': '1' }, d.pos.map(function (o, i) { return source ? refLineP(o) : rowP(o, false, i); }))),
        h('div', { className: 'sb-e' }, h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, headWord(source && source.negLabel, 'Pay threat / despair'))),
          h('div', { className: 'hp-bands', 'data-run': '1' }, d.neg.map(function (o, i) { return rowP(o, true, i); }))),
        h('details', { className: 'sb-fold' }, h('summary', { className: 'sb-e-h', 'data-role': 'fold-table' }, h('span', { className: 'sb-e-n' }, 'Full table'), h('span', { className: 'sb-e-m sb-fold-teaser' }, 'As printed'), h('i', { className: 'sb-grp-glyph', 'aria-hidden': 'true' }, '▾')),
          h('div', { className: 'hp-bands', 'data-run': '1' }, d.pos.concat(d.neg).map(function (o, i) { var neg = i >= d.pos.length, sw = spendWords({ text: o.text, cite: o.cite }, neg, neg ? i - d.pos.length : i);   /* the table prints `text` only, as before */ return h('div', { key: i, className: 'sb-fld' }, h('span', null, glyphText(o.cost)), h('b', null, glyphText(sw.body), h('span', { className: 'sb-e-m', style: { display: 'block' } }, sw.cite))); }))));
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column' } },
      // mode flip
      h('div', { style: { display: 'flex', gap: 6, marginBottom: 10 } },
        [['spend', '◆ SPEND'], ['browse', '▤ BROWSE']].map(function (m) {
          var on = mode === m[0];
          return h('button', {
            key: m[0], type: 'button', onClick: function () { setMode(m[0]); },
            style: { flex: 1, minWidth: 0, padding: '7px 0', minHeight: TAP, borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em',
              background: on ? accent + '1F' : 'transparent', border: '1px solid ' + (on ? accent : 'rgba(255,255,255,0.12)'), color: on ? accent : 'rgba(255,255,255,0.5)' },
          }, m[1]);
        })
      ),
      // scene chips — a caller-supplied source IS the scene, so they'd be lying (F-56 §6)
      source ? null : h('div', { style: { display: 'flex', gap: 6, marginBottom: 12 } },
        ['general', 'combat', 'starship'].map(function (s) {
          var on = scene === s;
          return h('button', {
            key: s, type: 'button', onClick: function () { setScene(s); },
            style: { flex: 1, minWidth: 0, padding: '6px 0', minHeight: TAP, borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', textTransform: 'uppercase',
              background: on ? '#F5C84214' : 'transparent', border: '1px solid ' + (on ? '#F5C842' : 'rgba(255,255,255,0.12)'), color: on ? '#F5C842' : 'rgba(255,255,255,0.5)' },
          }, s);
        })
      ),
      mode === 'spend' ? h('div', null,
        // symbol steppers
        h('div', { style: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 10px 8px', marginBottom: 12 } },
          h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', marginBottom: 9 } }, (source && source.tallyLabel) || 'WHAT DID YOUR DICE SHOW?'),
          // ALWAYS A GRID, AND THE CELL FLOOR IS THE TAP FLOOR. This row WAS `display:flex` with
          // `flex:1` cells, and `flex:1` carries `min-width:auto` — a cell cannot shrink below its own
          // min-content (measured: 87.2px, set by the "ADVANTAGE" label). Four of those plus three 8px
          // gaps need 372.8px; the sheet's reference rail gives this panel 275px. So the fourth symbol
          // — DESPAIR, both its buttons — rendered 84–89px PAST the rail's right edge at every band the
          // rail exists in (1367/1440/1920, measured). That is what Jason reported as "buttons that are
          // overlapping": not a z-order collision, a column that could not hold its own contents.
          //
          // The track sizing reads: give me COLS columns, but never a cell narrower than the two 44px
          // targets + counter it has to carry — wrap instead. `max()` inside `minmax()` is what makes
          // that one rule instead of a breakpoint: where the natural 1/COLS share is roomy the layout
          // is EXACTLY what shipped (crafting keeps its 3-wide row at 768 and 1440); where it is not,
          // auto-fit drops a column rather than spilling. THE NARROW CASE IS NOT HYPOTHETICAL — with a
          // fixed 3-wide grid, crafting's six counters at 44px overflowed a 390px phone by 9px. That
          // regression was introduced by this very repair and caught by measuring the other consumers
          // (R-RAIL-3), which is the whole reason that rider exists.
          h('div', { style: { display: 'grid', gap: 8,
              gridTemplateColumns: 'repeat(auto-fit, minmax(max(' + STEP_CELL_MIN + 'px, (100% - '
                + ((SYMS.length > 4 ? 3 : 2) - 1) * 8 + 'px)/' + (SYMS.length > 4 ? 3 : 2) + '), 1fr))' } },
            SYMS.map(function (s) {
              return h('div', { key: s[0], style: { minWidth: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '7px 3px', textAlign: 'center', background: 'rgba(255,255,255,0.02)' } },
                h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.06em', color: s[2], marginBottom: 6 } }, s[1]),
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 } },
                  stepBtn('remove ' + s[1], '−', function () { bump(s[0], -1); }),
                  h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', minWidth: 12, color: tally[s[0]] ? s[2] : 'rgba(255,255,255,0.5)' } }, tally[s[0]] || 0),
                  stepBtn('add ' + s[1], '+', function () { bump(s[0], 1); })
                )
              );
            })
          ),
          anySym ? h('button', { type: 'button', onClick: function () { setTally(zeroTally(SYMS)); }, style: { marginTop: 9, width: '100%', padding: 6, minHeight: TAP, borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.14em', cursor: 'pointer' } }, 'CLEAR') : null
        ),
        // M6 — YOUR GEAR: the owner's weapons resolved (combat scene; ADDS resolved rows, never gates — D-RR2).
        (character && scene === 'combat') ? (function () {
          var gear = m6ResolveGear(character);
          if (!gear.length) return null;
          return h('div', null,
            grp('★ YOUR GEAR — RESOLVED', accent),
            gear.map(function (o, i) {
              return h('div', { key: 'g' + i, style: { borderLeft: '2px solid ' + accent + '88', borderRadius: '0 7px 7px 0', padding: '7px 10px', marginBottom: 5, background: accent + '0C' } },
                h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#fff' } }, o.name),
                h('div', { style: { marginTop: 2, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.4, color: 'rgba(255,255,255,0.72)' } }, glyphText(o.text)),
                h('div', { style: { marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', color: 'rgba(255,255,255,0.5)' } }, o.cite));
            })
          );
        })() : null,
        grp((source && source.posLabel) || '▲ SPEND ADVANTAGE / TRIUMPH', '#45AD48'),
        d.pos.map(function (o, i) { return optRow(o, false, i); }),
        grp((source && source.negLabel) || '▼ PAY THREAT / DESPAIR', '#D86464'),
        d.neg.map(function (o, i) { return optRow(o, true, i); })
      ) : h('div', null,
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', margin: '2px 0 8px' } }, 'FULL TABLE — as printed'),
        d.pos.concat(d.neg).map(function (o, i) {
          return h('div', { key: i, style: { display: 'flex', gap: 9, padding: '7px 2px', borderTop: '1px solid rgba(255,255,255,0.08)' } },
            h('div', { style: { width: 92, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,0.6)' } }, glyphText(o.cost)),
            h('div', { style: { flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: 'rgba(255,255,255,0.8)' } }, glyphText(o.text),
              h('span', { style: { display: 'block', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', color: 'rgba(255,255,255,0.5)' } }, o.cite))
          );
        })
      )
    );
  }

  // ── B-1208 · THE REFERENCE WINDOW — the three at-table cards' one mount, and their paper window ─────────────
  // mountRefWindow: the host on <body>, the root, close, and ESCAPE (R-RC-3 (7): Escape closes every reference
  // window, both faces, with no visual change). One listener for all of them, in the capture phase, closes the
  // NEWEST window only and keeps the key from the screen underneath (a sheet room would read it as "back").
  // THE ONE ESC STACK (F-100 THE SURFACING MISSION 5h, card f100-surfacing-roll-options-card ADDENDUM 62 F1 (b); brief
  // f100-surfacing-roll-options-f §3): that listener generalized — every layer that Escape closes (a reference window, a
  // usePopover menu or info box) pushes its closer here, and ONE press closes the NEWEST layer only. `pushEscape(closer)`
  // → `pop()`. The listener is on `window` in the capture phase while any layer is open, and stops the key.
  var escLayers = [];
  function escapeTop(e) {
    if (e.key !== 'Escape' || !escLayers.length) return;
    e.stopPropagation();
    escLayers[escLayers.length - 1]();
  }
  function pushEscape(closer) {
    if (!escLayers.length) window.addEventListener('keydown', escapeTop, true);
    escLayers.push(closer);
    return function popEscape() {
      if (escLayers.indexOf(closer) === -1) return;
      escLayers = escLayers.filter(function (c) { return c !== closer; });
      if (!escLayers.length) window.removeEventListener('keydown', escapeTop, true);
    };
  }
  // useEscape — pushEscape for a card that is a component: while `open`, Escape calls `close`, the same close its own ✕ or
  // scrim calls (B-1826; ruling release-r7-bug-burndown ADDENDUM 631 step 3). The layer is pushed when the card opens, so
  // a card opened over it later sits above it on the one stack. `close` is read through a ref, so a fresh closure each
  // render does not drop and re-push the layer (ConflictPrompt's lesson).
  function useEscape(open, close) {
    var closeRef = useRef(close);
    closeRef.current = close;
    useEffect(function () {
      if (!open) return undefined;
      return pushEscape(function () { closeRef.current(); });
    }, [open]);
  }
  function mountRefWindow(hostAttr, render) {
    var ReactDOM = window.ReactDOM;
    if (!ReactDOM || !ReactDOM.createRoot) return { close: function () {} };
    var host = document.createElement('div');
    host.setAttribute(hostAttr, '1');
    document.body.appendChild(host);
    var root = ReactDOM.createRoot(host);
    var open = true, popEsc = null, disarm = null, release = null;
    function close() {
      if (!open) return;
      open = false;
      popEsc();
      disarm();
      root.unmount(); if (host.parentNode) host.parentNode.removeChild(host);
      release();
    }
    popEsc = pushEscape(close);
    disarm = armBack(close, true);   // B-1702: Back closes it
    // B-1730 (ADDENDUM 625): the card holds focus — in at open, Tab kept inside, back to the Help trigger at close
    release = holdFocus(function () { return host.querySelector('[role="dialog"]'); });
    root.render(render(close));
    return { close: close };
  }
  // RefPaperWindow — the window the three cards open in on a paper host (D-180; frames `maneuvers.*.paper.*`,
  // `recovery.*.l2.*`, `results.sheet.*.fs.*` on lab `4b29e1c42`'s board `refcards.html`). The page, its lift and keyline,
  // the raised head with the title in `.sb-e-n`'s face and the ✕ as `.hp-quiet` at 44 (R-RC-3 (8)), the body scrolling
  // under it as the `surface` container the tally's columns query. The dim is the kit's ONE paper dim, `.hp-scrim`,
  // an EMPTY SIBLING of the window that closes it on a press (D-174). The panel takes role=dialog, its name and testid.
  // It is portalled to <body>, outside every paper scope, so it declares its own ground and unit, and its OWN scope:
  // `.sb-ref`, which the sheet's kit rules name beside `[data-sheet-shell]` (sheet.css) — it never borrows the sheet's
  // shell (R-RC-3 (3)). Below 1024 a bottom sheet; from 1024 centred, at most 560 wide (sheet.css, `.sb-ref`).
  function RefPaperWindow(o) {
    return h(React.Fragment, null,
      h('div', { className: 'hp-scrim', onClick: o.close, style: { zIndex: 9000 } }),
      h('div', { role: 'dialog', 'aria-label': o.label, 'data-testid': o.testid, 'data-ref-card': o.card, 'data-doc-ground': 'creator', className: 'sb-ref',
          style: { '--u': '1px', position: 'fixed', zIndex: 9001, display: 'flex', flexDirection: 'column', minHeight: 0,
            background: 'var(--doc-paper)', color: 'var(--doc-ink)' } },   // its lift and keyline: sheet.css `.sb-ref` (no colour literal here, ground_token_contract)
        h('div', { className: 'sb-ref-head', style: { flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 16px',
            borderBottom: '1px solid var(--doc-rule)', background: 'var(--doc-paper-raised)' } },
          h('div', { className: 'sb-e-n', style: { flex: 1, minWidth: 0, fontSize: 'calc(15 * var(--u, 1px))', letterSpacing: '.06em', lineHeight: 1.35 } }, o.title),
          h('button', { type: 'button', className: 'hp-quiet', 'aria-label': 'Close', 'data-role': 'close', onClick: o.close,
            style: { minWidth: TAP, minHeight: TAP, padding: 0, justifyContent: 'center' } }, '✕')),
        h('div', { className: 'sb-ref-body', style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '14px 16px 18px',
            containerType: 'inline-size', containerName: 'surface' } }, o.body)));
  }

  // Imperative opener — mounts ResultsReference in an overlay from any surface (sheet + GM deep links, and
  // the digital-roll "SPEND THIS ROLL →" demotion pre-fills via initialTally). The HoloDice home keeps its
  // own state-driven overlay (tied to its bottom-tab + back-safety); this is the imperative door for the
  // other two surfaces. ponytail: small overlay markup repeat, not worth unifying across state/imperative.
  // B-1208: `opts.paper` (the caller's bar is paper) opens the paper window, titled SPEND RESULTS as the Help item
  // that opens it (D-180); without it, today's dark card byte for byte.
  function openResultsReference(opts) {
    opts = opts || {};
    var accent = opts.accent || '#4EAAFF';
    if (opts.paper) return mountRefWindow('data-swrpg-results-host', function (close) {
      return h(RefPaperWindow, { card: 'results', label: 'Spend results', testid: 'results-reference', title: 'SPEND RESULTS', close: close,
        body: h(ResultsReference, { paper: true, windowed: true, accent: accent, initialTally: opts.initialTally, initialScene: opts.initialScene, character: opts.character }) });
    });
    return mountRefWindow('data-swrpg-results-host', function (close) { return h('div', {
      onClick: close, role: 'dialog', 'aria-label': 'Results reference', 'data-testid': 'results-reference',
      style: { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto' },
    },
      h('div', {
        onClick: function (e) { e.stopPropagation(); },
        style: { maxWidth: '440px', width: '100%', margin: '40px 0 24px', background: '#0A0A0C',
          border: '1px solid ' + accent + '45', borderRadius: '14px', padding: '18px' },
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
          h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '0.10em', color: '#fff' } }, 'RESULTS REFERENCE'),
          h('button', { type: 'button', 'aria-label': 'Close', onClick: close, style: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1 } }, '✕')),
        h(ResultsReference, { accent: accent, initialTally: opts.initialTally, initialScene: opts.initialScene, character: opts.character })
      )
    ); });
  }

  // ── QualityChips — shared tap-to-explain weapon-quality chips (mid-session pack M4) ───────────
  // Each quality name is a chip; tap → its cited description expands below (glyphText renders any dice
  // tokens). ONE resolution path — window._qualitiesDb (the canonical vocab), matching SheetLoadout / the
  // NPC card lookupQuality EXACTLY (lowercase, strip trailing rating, `key` / `key + " quality"`). Consumed
  // by the store gear card, GM inventory + vehicle weapons, and the NPC cards. size:'sm' for dense rows.
  function qualityLookupShared(qName, db) {
    var key = String(qName).toLowerCase().replace(/\s*\d+$/, '').trim();
    db = db || window._qualitiesDb || {};
    return db[key] || db[key + ' quality'] || null;
  }
  function QualityChips(props) {
    var accent = props.accent || '#4EAAFF';
    var db = props.db;
    var _e = useState(null), expanded = _e[0], setExpanded = _e[1];
    var list = (Array.isArray(props.qualities) ? props.qualities : (props.qualities ? [props.qualities] : []))
      .map(function (q) { return typeof q === 'string' ? q : ((q && (q.Key || q.Name || q.name || q.label)) || String(q)); })
      .filter(function (q) { return q && q !== 'undefined'; });
    if (!list.length) return null;
    var small = props.size === 'sm';
    var qData = expanded ? qualityLookupShared(expanded, db) : null;
    return h('div', null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
        list.map(function (q, i) {
          var on = expanded === q;
          // span[role=button], NOT <button> — the chips render INSIDE clickable <button> cards (the armory
          // catalog card is a button); button-in-button is invalid. stopPropagation so a chip tap doesn't
          // trigger the card's expand/buy/select handler.
          function toggle(e) { if (e && e.stopPropagation) e.stopPropagation(); setExpanded(on ? null : q); }
          return h('span', {
            key: i, role: 'button', tabIndex: 0, 'aria-expanded': on ? 'true' : 'false',
            onClick: toggle,
            onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } },
            style: {
              display: 'inline-block', padding: small ? '2px 7px' : '3px 9px', cursor: 'pointer', borderRadius: 999,
              background: accent + (on ? '22' : '0D'), border: '1px solid ' + accent + (on ? '66' : '22'),
              fontFamily: 'var(--font-body)', fontSize: small ? 10 : 11, color: accent, lineHeight: 1.3,
            },
          }, q);
        })
      ),
      expanded ? h('div', {
        style: { padding: '8px 10px', marginTop: 5, background: accent + '08', borderLeft: '2px solid ' + accent + '44', borderRadius: '0 5px 5px 0' },
      },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.04em', color: accent, marginBottom: 3 } }, String(expanded).toUpperCase()),
        h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.55, color: 'rgba(255,255,255,0.68)' } },
          qData ? ((qData.description || qData.Description) ? glyphText(qData.description || qData.Description) : (qualityS3(qData) || glyphText(''))) : 'No description available.')
      ) : null
    );
  }

  // S3 (argo-a1-curation ADDENDUM 4; mockup F5): an open chip whose quality text the public copy removed shows its short label
  // (own_words.json at qualities / <id> / description, R-AE-7) and the book line under it (else the book line alone, S1).
  // null on holocron and with words on file.
  function qualityS3(q) {
    var SS = typeof window !== 'undefined' ? window.SWRPGSources : null;
    var line = q && !(q.description || q.Description) && SS && SS.removedLine ? SS.removedLine(q) : null;
    if (line == null) return null;
    var label = SS.ownWords ? SS.ownWords('quality:' + (q.id || q.key), 'description') : '';
    return h(React.Fragment, null, label ? h('span', { 'data-s3': 'quality' }, glyphText(label)) : null,
      line ? h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.04em', color: 'rgba(255,255,255,0.62)', marginTop: label ? 3 : 0 } }, line) : null);
  }

  // ── ManeuversCard — shared cited maneuvers/actions reference (mid-session pack M3) ────────────
  // "What can I do on my turn?" — personal / starship tabs, rows grouped by the load-bearing tag
  // (Maneuver / Action / Incidental), each with its effect (glyphText renders dice tokens) + restrictions
  // (starship). Characterless. Data: public/data/canonical/maneuvers_actions.json (promoted from the VERIFIED
  // rules_tables by scripts/canonical/build_maneuvers_actions.py).
  var MA_TYPE_ORDER = ['Maneuver', 'Action', 'Incidental'];
  var MA_TYPE_COLOR = { Maneuver: '#4EAAFF', Action: '#F5C842', Incidental: '#80CEC4' };
  // D2 (D-291; B-1424): a row's own cite beside its restrictions, only when it differs from the heading's
  function rowCite(r, head) {
    if (!r || !r.cite || r.cite === head) return null;
    return h('span', { 'data-testid': 'row-cite' }, ' · ' + r.cite);
  }
  function ManeuversCard(props) {
    var accent = props.accent || '#4EAAFF';
    var _d = useState(window._maneuversActions || null), data = _d[0], setData = _d[1];
    var _tab = useState(props.initialTab || 'personal'), tab = _tab[0], setTab = _tab[1];
    useEffect(function () {
      if (window._maneuversActions) { setData(window._maneuversActions); return; }
      fetch('public/data/canonical/maneuvers_actions.json').then(function (r) { return r.json(); })
        .then(function (j) { window._maneuversActions = j; setData(j); }).catch(function () {});
    }, []);
    if (!data || !data[tab]) return null;
    var d = data[tab];
    var groups = {};
    d.rows.forEach(function (r) { (groups[r.type] = groups[r.type] || []).push(r); });
    // B-1208 (D-180 "Approve as drawn"; frames `maneuvers.*.paper.*`): ON PAPER, in B-637's family — the tabs as the kit's
    // chips, the cite in `.sb-e-m`, each type a list under its head, each row an entry (name · restrictions · effect).
    // The type colours are not drawn: on paper an accent is a fill, never ink, and the type is already the head.
    if (props.paper) {
      return h('div', { className: 'sb-ma' },
        h('div', { className: 'sb-critchips', style: { marginBottom: 8 } },
          [['personal', 'PERSONAL'], ['starship', 'STARSHIP']].map(function (t) {
            var on = tab === t[0];
            return h('button', { key: t[0], type: 'button', className: 'hp-quiet', 'data-role': 'tab-' + t[0], 'data-on': on ? '1' : '0',
              'aria-pressed': on ? 'true' : 'false', onClick: function () { setTab(t[0]); } }, t[1]);
          })),
        h('div', { className: 'sb-e-m', style: { display: 'block', margin: '0 0 6px' } }, d.cite),
        MA_TYPE_ORDER.filter(function (ty) { return groups[ty]; }).map(function (ty) {
          return h('div', { key: ty, className: 'sb-e' },
            h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, ty.toUpperCase() + 'S')),
            h('div', { className: 'hp-bands', 'data-run': '1' }, groups[ty].map(function (r, i) {
              return h('div', { key: i, className: 'sb-att' },
                h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, r.name),
                  r.restrictions ? h('span', { className: 'sb-e-m' }, r.restrictions, rowCite(r, d.cite)) : null),
                h('p', { className: 'sb-e-t' }, glyphText(r.effect)));
            })));
        }));
    }
    return h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', { style: { display: 'flex', gap: 6, marginBottom: 12 } },
        [['personal', 'PERSONAL'], ['starship', 'STARSHIP']].map(function (t) {
          var on = tab === t[0];
          return h('button', {
            key: t[0], type: 'button', onClick: function () { setTab(t[0]); },
            style: { flex: 1, minWidth: 0, padding: '7px 0', minHeight: TAP, borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em',
              background: on ? accent + '1F' : 'transparent', border: '1px solid ' + (on ? accent : 'rgba(255,255,255,0.12)'), color: on ? accent : 'rgba(255,255,255,0.5)' },
          }, t[1]);
        })
      ),
      h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', margin: '0 0 10px' } }, d.cite),
      MA_TYPE_ORDER.filter(function (ty) { return groups[ty]; }).map(function (ty) {
        var col = MA_TYPE_COLOR[ty] || accent;
        return h('div', { key: ty, style: { marginBottom: 12 } },
          h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.16em', color: col, margin: '6px 0 6px', borderBottom: '1px solid ' + col + '33', paddingBottom: 3 } }, ty.toUpperCase() + 'S'),
          groups[ty].map(function (r, i) {
            return h('div', { key: i, style: { marginBottom: 8, paddingLeft: 8, borderLeft: '2px solid ' + col + '44' } },
              h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
                h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#fff' } }, r.name),
                r.restrictions ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.42)' } }, r.restrictions, rowCite(r, d.cite)) : null
              ),
              h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: 'rgba(255,255,255,0.7)', marginTop: 2 } }, glyphText(r.effect))
            );
          })
        );
      })
    );
  }
  // Imperative opener (sheet + GM ⚙ deep links) — mirrors openResultsReference (B-1208: `opts.paper` too).
  function openManeuversCard(opts) {
    opts = opts || {};
    var accent = opts.accent || '#4EAAFF';
    if (opts.paper) return mountRefWindow('data-swrpg-maneuvers-host', function (close) {
      return h(RefPaperWindow, { card: 'maneuvers', label: 'Maneuvers and actions', testid: 'maneuvers-card', title: 'MANEUVERS & ACTIONS', close: close,
        body: h(ManeuversCard, { paper: true, accent: accent, initialTab: opts.initialTab }) });
    });
    return mountRefWindow('data-swrpg-maneuvers-host', function (close) { return h('div', {
      onClick: close, role: 'dialog', 'aria-label': 'Maneuvers and actions', 'data-testid': 'maneuvers-card',
      style: { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto' },
    },
      h('div', {
        onClick: function (e) { e.stopPropagation(); },
        style: { maxWidth: '440px', width: '100%', margin: '40px 0 24px', background: '#0A0A0C',
          border: '1px solid ' + accent + '45', borderRadius: '14px', padding: '18px' },
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
          h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '0.10em', color: '#fff' } }, 'MANEUVERS & ACTIONS'),
          h('button', { type: 'button', 'aria-label': 'Close', onClick: close, style: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1 } }, '✕')),
        h(ManeuversCard, { accent: accent, initialTab: opts.initialTab })
      )
    ); });
  }

  // ── RecoveryCard — shared cited healing/recovery reference (mid-session pack M5) ──────────────
  // The most-forgotten mid-session cluster: the Medicine-check difficulty ladder + the recovery methods
  // (stimpacks, bacta, strain recovery, crit persistence, droids). Characterless. Data:
  // public/data/canonical/healing_recovery.json (promoted from the VERIFIED rules_tables by
  // scripts/canonical/build_healing_recovery.py). glyphText renders the [DI] difficulty tokens.
  function RecoveryCard(props) {
    var accent = props.accent || '#4ECB71';   // healing green
    var _d = useState(window._healingRecovery || null), data = _d[0], setData = _d[1];
    useEffect(function () {
      if (window._healingRecovery) { setData(window._healingRecovery); return; }
      fetch('public/data/canonical/healing_recovery.json').then(function (r) { return r.json(); })
        .then(function (j) { window._healingRecovery = j; setData(j); }).catch(function () {});
    }, []);
    if (!data) return null;
    // B-1208 (D-180 "L2 Rule first" + "Approve as drawn"; frames `recovery.*.l2.*`): ON PAPER, the same family — each section
    // a list under its head with its cite; the ladder's rungs as entries, the state the line and the check in bold under
    // it (never a caps label: the kit's mono labels uppercase, and the die marks are the letters j/k/l); the methods as entries.
    if (props.paper) {
      var headP = function (label, cite) {
        return h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, label), cite ? h('span', { className: 'sb-e-m' }, cite) : null);
      };
      return h('div', { className: 'sb-hr' },
        data.difficulty ? h('div', { className: 'sb-e' },
          headP('MEDICINE CHECK DIFFICULTY', data.difficulty.cite),
          h('div', { className: 'hp-bands', 'data-run': '1' }, data.difficulty.rows.map(function (r, i) {
            return h('div', { key: i, className: 'sb-att' }, h('p', { className: 'sb-e-t' }, r[0]),
              h('p', { className: 'sb-e-t' }, h('b', null, glyphText(r[1]))));
          }))) : null,
        data.methods ? h('div', { className: 'sb-e' },
          headP('HEALING & RECOVERY', data.methods.cite),
          h('div', { className: 'hp-bands', 'data-run': '1' }, data.methods.rows.map(function (r, i) {
            return h('div', { key: i, className: 'sb-att' }, h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, r[0])),
              h('p', { className: 'sb-e-t' }, glyphText(r[1])));
          }))) : null);
    }
    var head = function (label, cite) {
      return h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '4px 0 8px', borderBottom: '1px solid ' + accent + '33', paddingBottom: 3 } },
        h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.16em', color: accent } }, label),
        cite ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', color: 'rgba(255,255,255,0.35)' } }, cite) : null);
    };
    return h('div', { style: { display: 'flex', flexDirection: 'column' } },
      // Difficulty ladder
      data.difficulty ? h('div', { style: { marginBottom: 14 } },
        head('MEDICINE CHECK DIFFICULTY', data.difficulty.cite),
        data.difficulty.rows.map(function (r, i) {
          // The value column was `flex:'none'`, i.e. flex-shrink 0 — so it took its MAX-content width
          // and its text never wrapped. Most rows are a short difficulty like "[DI][DI]"; the crit
          // row's value is a whole sentence, and it pushed this block to 341px inside a 297px rail
          // (measured). `0 1 auto` lets that one wrap instead of shipping the row off the edge.
          // `maxWidth:55%` is the second half of the same fix and is NOT decoration: with only
          // `minWidth:0` on the label, the sentence took the whole row and squeezed "Recover a
          // Critical Injury" to SIX pixels — a spill traded for an erasure. The cap keeps the ladder
          // readable as a ladder: value never past 55%, label never below the rest.
          return h('div', { key: i, style: { display: 'flex', gap: 10, padding: '5px 0', borderTop: i ? '1px solid rgba(255,255,255,0.06)' : 'none' } },
            h('div', { style: { flex: '1 1 0', minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', color: 'rgba(255,255,255,0.75)' } }, r[0]),
            h('div', { style: { flex: '0 1 auto', minWidth: 96, maxWidth: '55%', textAlign: 'right', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff' } }, glyphText(r[1])));
        })
      ) : null,
      // Methods
      data.methods ? h('div', null,
        head('HEALING & RECOVERY', data.methods.cite),
        data.methods.rows.map(function (r, i) {
          return h('div', { key: i, style: { marginBottom: 9, paddingLeft: 8, borderLeft: '2px solid ' + accent + '44' } },
            h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#fff', marginBottom: 2 } }, r[0]),
            h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: 'rgba(255,255,255,0.7)' } }, glyphText(r[1])));
        })
      ) : null
    );
  }
  // B-1208: `opts.paper` opens the paper window — the Help item on a paper bar, and the sheet's crit section (paper).
  function openRecoveryCard(opts) {
    opts = opts || {};
    var accent = opts.accent || '#4ECB71';
    if (opts.paper) return mountRefWindow('data-swrpg-recovery-host', function (close) {
      return h(RefPaperWindow, { card: 'recovery', label: 'Healing and recovery', testid: 'recovery-card', title: 'HEALING & RECOVERY', close: close,
        body: h(RecoveryCard, { paper: true, accent: accent }) });
    });
    return mountRefWindow('data-swrpg-recovery-host', function (close) { return h('div', {
      onClick: close, role: 'dialog', 'aria-label': 'Healing and recovery', 'data-testid': 'recovery-card',
      style: { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto' },
    },
      h('div', {
        onClick: function (e) { e.stopPropagation(); },
        style: { maxWidth: '440px', width: '100%', margin: '40px 0 24px', background: '#0A0A0C',
          border: '1px solid ' + accent + '45', borderRadius: '14px', padding: '18px' },
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
          h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '0.10em', color: '#fff' } }, 'HEALING & RECOVERY'),
          h('button', { type: 'button', 'aria-label': 'Close', onClick: close, style: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1 } }, '✕')),
        h(RecoveryCard, { accent: accent })
      )
    ); });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  ACTIVE SOURCES (BOOKS-1b) — the books filter's ⚙ settings surface + a consumer hook.
  //  The predicate + storage live in lib/shared/sources.js (window.SWRPGSources); this is the
  //  React edge shared by both apps.
  // ══════════════════════════════════════════════════════════════════════════════

  // useActiveSources — subscribe a discovery surface to the filter. Returns {ready, index, off};
  // re-renders when the vocab loads and when the OFF set changes (a settings toggle).
  function useActiveSources() {
    var _s = useState(0), setTick = _s[1];
    useEffect(function () {
      var on = function () { setTick(function (t) { return t + 1; }); };
      if (window.SWRPGSources) window.SWRPGSources.ready().then(on);
      window.addEventListener('swrpg-sources-changed', on);
      return function () { window.removeEventListener('swrpg-sources-changed', on); };
    }, []);
    var cur = window.SWRPGSources && window.SWRPGSources.current();
    return { ready: !!cur, index: cur && cur.index, off: (cur && cur.off) || {} };
  }

  // ActiveSourcesPanel — grouped book toggles (Core / Era / Supplement / Community / Your content).
  // Default all-on; persists only the OFF set; setBook refuses the last active Core; save() broadcasts
  // so open catalogs re-filter live.
  // ── THE PREMIUM PANEL IDIOM (ruling panel-premium-presentation-concept; Jason picked B · Premium) ──
  // Our own signature (ledger furniture + holo accent), calibrated to RSI's confidence: named header +
  // funnel, accent section rule-heads WITH live counts, PLATED chunky rows, add-on cards, an action
  // FOOTER with the live count + RESET/DONE. Motion = one fast fade (.panel-enter; reduced-motion → none).
  // hexA(accent, 0..1) → an #RRGGBBAA suffix so the accent can own the furniture at graded strength.
  function hexA(hex, a) { var n = Math.round(a * 255).toString(16); return hex + (n.length < 2 ? '0' + n : n); }
  // B-1711 (ruling release-r7-bug-burndown ADDENDA 607, 608): the panel has ONE face, paper. Its dark face (the navy card, R8a's
  // floorA and its ground) reached no user and is deleted; what each element wore on paper is now all it wears. The paper
  // classes name every element for `[data-paper-chrome]` rules (chrome.css §ACTIVE SOURCES ON PAPER, B-838's device), and
  // the inline style keeps the layout numbers only. Guarded by test/b1711_active_sources_paper.cjs.
  // ledgerSectionHead — name + optional count + hairline rule. When opts.onToggle is passed the
  // whole head is a collapse control (chevron rotates; aria-expanded) — the RSI accordion pattern.
  // `accent` and `opts.paper` are taken and unused (lib/editor/view.jsx `HomebrewSourcesPanel` still passes both).
  function ledgerSectionHead(accent, name, count, opts) {
    opts = opts || {};
    var inner = [
      h('div', { key: 'r', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 } },
        h('span', { className: 'pb-pop-headn',
          style: { fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.16em', fontSize: 'var(--fs-sm)' } }, name),
        h('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          count != null ? h('span', { className: 'pb-src-count',
            style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums' } }, count) : null,
          opts.onToggle ? h('span', { 'aria-hidden': true, className: 'pb-src-count',
            style: { display: 'inline-block', fontSize: 'var(--fs-xs)', lineHeight: 1, transition: 'transform .16s ease', transform: opts.collapsed ? 'rotate(-90deg)' : 'none' } }, '▾') : null)),
      h('div', { key: 'l', 'aria-hidden': true, className: 'pb-pop-rule', style: { height: 1 } }),
    ];
    if (opts.onToggle) {
      // R8a: a collapse control at the 44px floor (was 38 — B-917)
      return h('button', { type: 'button', 'aria-expanded': !opts.collapsed, onClick: opts.onToggle,
        style: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: '0 0 8px', minHeight: 44 } }, inner);
    }
    return h('div', { style: { margin: '0 0 8px' } }, inner);
  }
  // platedRow — a chunky ≥46px toggle row on its own plate; the pill sits at the row's end. The row is `.pb-src-row` and
  // the pill B-793's own `.pb-pill` (a setting's value is a thing that simply IS — the ⚙ menu's ON/OFF, one vocabulary);
  // every layout number and the WORD are inline. `opts.accent` and `opts.paper` are taken and unused (see above).
  function platedRow(opts) {
    return h('button', { key: opts.key, type: 'button', role: 'switch', 'aria-checked': !!opts.on, 'data-testid': opts.testid,
      onClick: opts.onClick, disabled: opts.disabled ? true : undefined,
      className: 'pb-src-row', 'data-addon': opts.addon ? '1' : undefined,
      style: { display: 'flex', alignItems: opts.tall ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, width: '100%',
        minHeight: 50, padding: opts.tall ? '13px 13px' : '0 13px', marginBottom: 7, cursor: opts.disabled ? 'default' : 'pointer', textAlign: 'left' } },
      opts.body,
      h('span', { 'aria-hidden': true, className: 'pb-pill', 'data-on': opts.on ? '1' : undefined,
        style: { flex: '0 0 auto', marginTop: opts.tall ? 1 : 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.16em', padding: '4px 10px' } }, opts.on ? 'ON' : 'OFF'));
  }

  // ActiveSourcesPanel — the flagship premium panel (self-contained: header + scroll body + action footer).
  // props: { accent, onClose } — onClose renders the header ✕ + footer DONE (modal mode).
  // `variants: false` withholds the GAME VARIANTS card (the GM face; ruling f100-ud1-gm-variants-card); absent = shown.
  // B-1711: one face, paper (see ledgerSectionHead above). Each element names its paper class; the ground, ink, borders and
  // shadow are the `[data-paper-chrome]` rules' (chrome.css), never inline.
  function ActiveSourcesPanel(props) {
    var accent = props.accent || '#4EAAFF';
    var onClose = props.onClose;
    var SS = window.SWRPGSources;
    var _t = useState(0), setTick = _t[1];
    var _i = useState(null), index = _i[0], setIndex = _i[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _c = useState({}), collapsed = _c[0], setCollapsed = _c[1];  // { sectionKey: true } — collapse the accordion sections
    function toggleSection(key) { setCollapsed(function (c) { var n = Object.assign({}, c); n[key] = !n[key]; return n; }); }
    useEffect(function () { if (SS) SS.ready().then(function (c) { setIndex(c && c.index); }); }, []);
    useEffect(function () {   // B-1732: a landing redraws (lib/shared/heldStore.js)
      return SS && window.SWRPGHeldStore ? window.SWRPGHeldStore.listen(SS.KEY, function () { setTick(function (t) { return t + 1; }); }) : undefined;
    }, []);
    if (!SS || !index) {
      return h('div', { className: 'pb-src-note',
        style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.08em', padding: '28px 18px' } }, 'Loading source books…');
    }
    var state = SS.load();
    var grouped = SS.groupedBooks(index, state);   // G12: derivation from group defaults + overrides
    // THE FOLD (ruling f100-items-live-card R-FIL-5, unconditional): the `UserData` group's books — three community talents, none of
    // them the player's — sit last under COMMUNITY, and the "YOUR CONTENT" heading is gone; "yours" is kept for the player's own
    // homebrew (the group below the books, while the editor's switch is on). Each book keeps its own group's default (opt in).
    grouped = Object.assign({}, grouped, { Community: (grouped.Community || []).concat(grouped.UserData || []) });
    var GROUP_ORDER = ['Core', 'Era', 'Supplement', 'Community'];
    var GROUP_LABEL = { Core: 'CORE RULEBOOKS', Era: 'ERA BOOKS', Supplement: 'SUPPLEMENTS', Community: 'COMMUNITY' };
    var GROUP_OPTIN = { Community: true };   // G12: OFF BY DEFAULT · OPT IN
    // C-CSG-2 (ruling `csg-species-import-census` §3 + Amendment 1 A-5) — SAY WHAT THE BOOK DOES
    // NOT CHANGE, on the row itself. The Species Guide carries ~100 species we already have from
    // another book; switching it on does not replace them, and a player who is not told that will
    // read "no Barabel appeared" as a bug. Inform-never-gate applied to an import. Kept as verbatim
    // panel copy for the same reason the reSpecialized card's copy is: the words were ruled, and
    // a vocabulary row is a data contract, not a place to put UI sentences.
    var BOOK_ROW_NOTE = {
      the_complete_species_guide:
        'Where a species you already have appears here too, your existing version is used.',
    };
    var totalBooks = 0, activeBooks = 0;
    GROUP_ORDER.forEach(function (g) { (grouped[g] || []).forEach(function (b) { totalBooks++; if (b.active) activeBooks++; }); });
    function toggle(b) {
      var res = SS.setBook(SS.load(), index, b.id, !b.active);   // B-1732: the store at the act, never the last draw's copy
      if (res.refused) { setMsg('Keep at least one core rulebook on — the creator needs one.'); return; }
      setMsg(''); SS.save(res.state); setTick(function (t) { return t + 1; });
    }
    // G12: RESET returns to the group defaults (official on, community/homebrew off), not all-on.
    function resetAll() { SS.save({ version: 2, override: {} }); setMsg(''); setTick(function (t) { return t + 1; }); }
    var funnel = h('svg', { 'aria-hidden': true, className: 'pb-src-mark', width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: accent, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flex: '0 0 auto' } },
      h('path', { d: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' }));

    return h('div', { className: 'panel-enter', style: { display: 'flex', flexDirection: 'column', maxHeight: '82vh', minHeight: 0 } },
      // ── HEADER (funnel + name + close) ──
      h('div', { className: 'pb-src-head',
        style: { display: 'flex', alignItems: 'center', gap: 11, padding: '4px 2px 14px' } },
        funnel,
        h('div', { className: 'pb-src-title',
          style: { flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '0.11em' } }, 'ACTIVE SOURCES'),
        // R8a: the ✕ at 44×44 (was 32×32 — B-917)
        onClose ? h('button', { type: 'button', 'aria-label': 'Close', onClick: onClose, className: 'pb-src-x',
          style: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'none', border: 'none', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1 } }, '✕') : null),
      // ── BODY (scroll) ──
      h('div', { style: { flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 2px 6px', minHeight: 0 } },
        // era-pref (opt-in "limit to campaign era", DEFAULT OFF) — a lead plated toggle
        (function () {
          var on = SS.lineFilterOn();
          return platedRow({ key: 'linefilter', on: on, accent: accent, tall: true, testid: 'line-filter-toggle',
            onClick: function () { SS.setLineFilter(!on); setTick(function (t) { return t + 1; }); },
            body: h('span', { style: { flex: 1 } },
              h('span', { className: 'pb-src-lab',
                style: { display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)' } }, 'Limit the creator to my campaign era'),
              h('span', { className: 'pb-src-note',
                style: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.03em', lineHeight: 1.5, marginTop: 5 } }, 'Off by default — the game encourages mixing eras. On restricts the creator’s species, careers, specializations, and powers to your campaign’s line.')) });
        })(),
        msg ? h('div', { role: 'status', className: 'pb-src-refused',
          style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.03em', lineHeight: 1.5, margin: '2px 0 10px' } }, msg) : null,
        // ── LEDGER SECTIONS (book groups) ──
        GROUP_ORDER.filter(function (g) { return grouped[g] && grouped[g].length; }).map(function (g) {
          var on = grouped[g].filter(function (b) { return b.active; }).length;
          var col = !!collapsed[g];
          return h('div', { key: g, style: { marginTop: 18 } },
            ledgerSectionHead(accent, GROUP_LABEL[g] || g.toUpperCase(), on + '/' + grouped[g].length, { onToggle: function () { toggleSection(g); }, collapsed: col }),
            col ? null : grouped[g].map(function (b) {
              var note = BOOK_ROW_NOTE[b.id];
              return platedRow({ key: b.id, on: b.active, accent: accent, tall: !!note, onClick: function () { toggle(b); },
                body: h('span', { style: { flex: 1 } },
                  h('span', { className: 'pb-src-lab', 'data-off': !b.active ? '1' : undefined,
                    style: { display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)' } }, b.label),
                  note ? h('span', { 'data-testid': 'book-row-note-' + b.id, className: 'pb-src-note',
                    style: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.03em', lineHeight: 1.5, marginTop: 5 } }, note) : null) });
            }));
        }),
        // ── "YOUR HOMEBREW" (ruling f100-items-live-card R-FIL-5 as amended by f100-items-live-contracts R-FILC-7): while the editor's
        //    switch is on, the player's own collections follow the books — ONE module (lib/editor/view.jsx: HomebrewSources' rows,
        //    switching, order and ties) rendered in THIS panel's idiom, in both apps. Off: absent. `paper: true` is that module's own
        //    face switch (lib/editor/view.jsx); this panel has no other face to hand it (B-1711). ──
        (function () {
          var E = window.SWRPGEditor, V = window.SWRPGEditorView;
          if (!E || !E.on || !E.on() || !V || !V.HomebrewSourcesPanel) return null;
          return h(V.HomebrewSourcesPanel, { key: 'homebrew', accent: accent, paper: true, collapsed: !!collapsed.__homebrew, onToggle: function () { toggleSection('__homebrew'); } });
        })(),
  // ── GAME VARIANTS add-on card (F-9; NOT a book — it REPLACES tree internals. Copy verbatim per
        //    respec-architecture §5 / R-F9-2. Default OFF = vanilla; the stamp owns each sheet forever). ──
        (function () {
          if (props.variants === false) return null;
          var MODS = window.SWRPGMods;
          if (!MODS) return null;
          // EVERY OFFERED PACK, oldest line first (= mods.js SHIPPED_STAMPS; a superseded pack is read as
          // its successor by MODS.active(), so a stored old pair reads ON — F-100 M6, R-M6K-5).
          // `resolveForStamp` already folds a LIST (its `mods.reduce`), so multi-pack needed no resolver
          // change — the toggle simply stopped naming one. A slice that emits a pack and forgets to list
          // it here does not ship: a visible, guarded omission (test/respec_pack_stamps.cjs) rather than
          // a silent lie.
          var RESPEC_STAMPS = ['respecialized@eote-v2', 'respecialized@aor-v2', 'respecialized@fad-v1'];
          // B-401 (R-HYG-6, ruling `hygiene-seat-card`): ON when ANY offered stamp is on — the sources box toggles each
          // variant row as its own stamp (R-FSA-A5-2), and `every()` read one-on as OFF, so the card and the box disagreed.
          // Pressed while ON it turns every variant off; while OFF, every offered stamp on (the onClick below, unchanged).
          var on = RESPEC_STAMPS.some(function (st) { return (MODS.active() || []).indexOf(st) !== -1; });
          // R-F96-3's built sentence (the game lines a pack covers) was cut by the copy sweep (DECISIONS D-289,
          // census row ui.jsx:2711:30); the one-shot warm below is unchanged.
          // NOT a hook. This card lives inside a conditional IIFE (`if (!MODS) return null` above),
          // so a useEffect here would be a hook whose call order depends on a runtime condition —
          // the classic violation, and latent even on renders where it happens not to throw. A
          // module-scoped one-shot does the same job with no ordering claim at all.
          if (!_respecWarmed) {
            _respecWarmed = true;
            MODS.warm(RESPEC_STAMPS).then(function () { setTick(function (t) { return t + 1; }); });
          }
          var col = !!collapsed['__variants'];
          return h('div', { style: { marginTop: 18 } },
            ledgerSectionHead(accent, 'GAME VARIANTS', null, { onToggle: function () { toggleSection('__variants'); }, collapsed: col }),
            col ? null : platedRow({ key: 'respec', on: on, accent: accent, tall: true, addon: true, testid: 'respec-variant-toggle',
              onClick: function () { MODS.setActive(on ? [] : RESPEC_STAMPS.slice()); setTick(function (t) { return t + 1; }); },
              body: h('span', { style: { flex: 1 } },
                h('span', { className: 'pb-src-lab',
                  style: { display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)', fontWeight: 600 } }, 'reSpecialized'),
                h('span', { className: 'pb-src-note',
                  style: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.03em', lineHeight: 1.5, marginTop: 5 } },
                  'A fan rebalance by the reSpecialized Project community. Used with credit.')) }));
        })()),
      // ── ACTION FOOTER (reset · live count · done) ──
      h('div', { className: 'pb-src-foot',
        style: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 2px 2px' } },
        h('button', { type: 'button', onClick: resetAll, className: 'pb-src-reset',   // R8a: 44 tall (was ~34, B-917)
          style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.14em', background: 'none', padding: '0 13px', minHeight: 44, cursor: 'pointer' } }, 'RESET ALL'),
        h('span', { className: 'pb-src-tally',
          style: { flex: 1, textAlign: 'center', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' } },
          h('b', { style: { fontWeight: 600 } }, totalBooks + ' BOOKS'), ' · ' + activeBooks + ' ACTIVE'),
        onClose ? h('button', { type: 'button', onClick: onClose, className: 'pb-src-done',   // R8a: 44 tall (was ~38, B-917)
          style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', letterSpacing: '0.14em', border: 'none', padding: '0 22px', minHeight: 44, cursor: 'pointer' } }, 'DONE') : null));
  }

  // openActiveSources — self-mounting modal (⚙ deep link). The panel owns header/body/footer; the opener
  // is just the scrim + the premium container. Scrim/✕/DONE/Escape close (B-1277), and focus returns to the opener.
  // B-1711 (ADDENDA 607, 608): ONE face, paper, from every caller; `opts.paper` is retired and read by nothing (B-838 took
  // it from the bar the ⚙ sat in, and every bar a user can reach is paper). The host is portalled to the body, which has
  // no ground, so the PANEL (the dialog; B-1210) carries the scope itself: `data-paper-chrome` (what every rule in
  // chrome.css §ACTIVE SOURCES ON PAPER is fenced by) and `data-doc-ground="creator"` (what the tokens resolve on).
  // `opts.variants` is carried to the panel only when set (the GM passes false: no GAME VARIANTS card, no overlay warm).
  function openActiveSources(opts) {
    opts = opts || {};
    var ReactDOM = window.ReactDOM;
    if (!ReactDOM || !ReactDOM.createRoot) return { close: function () {} };
    var accent = opts.accent || '#4EAAFF';
    var host = document.createElement('div');
    host.setAttribute('data-swrpg-sources-host', '1');
    document.body.appendChild(host);
    var root = ReactDOM.createRoot(host);
    // B-1277: Escape closes it through the ONE Esc stack (no caller wired one), and every close returns focus to the
    // opener. A ⚙ menu row unmounts as its menu closes, so the opener is then the trigger that controls that menu.
    // B-1576 (ruling release-r7-bug-burndown ADDENDUM 276): the dialog floor's other half — focus in at open, Tab and
    // Shift+Tab kept inside the panel. Both now ride the ONE shared hold, `holdFocus`, lifted from here (B-1730,
    // ADDENDUM 625 Q1 (a)): the door, the retry while the opening settles and the Tab edges are its, unchanged.
    var open = true, popEsc = null;
    var release = holdFocus(function () { return host.querySelector('[data-testid="active-sources"]'); });
    function close() {
      if (!open) return;
      open = false;
      popEsc();
      disarm();
      root.unmount(); if (host.parentNode) host.parentNode.removeChild(host);
      release();
    }
    popEsc = pushEscape(close);
    var disarm = armBack(close, true);   // B-1702: Back closes it
    var panel = h(ActiveSourcesPanel, Object.assign({ accent: accent, onClose: close }, opts.variants !== undefined ? { variants: opts.variants } : null));
    // B-1210 (card `paper-n7-b1210-scrim-font-card` R-B1210-1/3/12; DECISIONS D-174): the scrim is an EMPTY
    // SIBLING of the panel, the structure of every approved paper window; the PANEL is the dialog and carries the scope.
    // The scrim is the kit's `.hp-scrim` (paper.css; D-174 retires P4's own grey) and keeps click-to-close, its blur and
    // its z. The panel keeps today's box: 16px gutter + 38px top margin = top 54, at most 448 wide and centred, its
    // height its own (`.panel-enter`'s 82vh), so nothing moves.
    // B-1278 / C-4 (card `paper-n7-followon-seams-card` ADDENDUM 3): fixed at top 54, the panel ran off a short screen
    // (844×390: bottom 406). Its height is capped at the viewport less that top and the 16px gutter, and the panel's own
    // column (header · scrolling body · RESET/DONE foot) shrinks into it, so the body scrolls and the foot stays on
    // screen. The cap binds only below ~556 tall; at 390×844 and 1440×900 the box is B-1210's.
    root.render(h(React.Fragment, null,
      h('div', { onClick: close, className: 'hp-scrim', 'data-src-scrim': '1',
        style: { zIndex: 9000, backdropFilter: 'blur(4px)' } }),
      h('div', { role: 'dialog', 'aria-label': 'Active sources', 'data-testid': 'active-sources',
        'data-paper-chrome': '1', 'data-doc-ground': 'creator', className: 'pb-src',
        style: { position: 'fixed', zIndex: 9001, top: 54, left: 16, right: 16, marginLeft: 'auto', marginRight: 'auto',
          maxWidth: '448px', padding: '16px 18px 14px', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 70px)',
          display: 'flex', flexDirection: 'column' } },
        panel)));
    return { close: close };
  }

  // G12 (F-48): the migration is silent in-app by Jason's override (ruling §3) — the panel's standing
  // "OFF BY DEFAULT · OPT IN" group hint is the honest furniture; the one-time transition line rides
  // the Discord update channel, not transient UI. No in-app migration-notice component.

  // ── VersionBeacon (F-48 G13, ruling f48-cache-correctness §3) — the honest update notice ──────────
  // build.mjs stamps __HOLOCRON_BUILD__ into this bundle and writes the same id to /version.json
  // (served max-age=0). This beacon polls version.json on load + when the tab regains focus; when the
  // DEPLOYED id differs from what the user has acknowledged, it shows a one-tap "UPDATED VERSION
  // AVAILABLE — RELOAD" line (B-27 amber idiom, role=status). It NEVER auto-reloads — a forced reload
  // could eat a half-built character (creator drafts autosave, but the user still owns the moment).
  // Dismiss re-arms at the next navigation (popstate). swrpg_seen_build records the acknowledged id
  // (R-Y2-1 additive); first-ever load acknowledges the running build so a fresh visitor sees nothing.
  var SEEN_BUILD_KEY = 'swrpg_seen_build';
  // B-1213 (R-B1213-12; frames lab `170870f46` `seams/beacon/…`, APPROVED D-169): `paper` is the host's — each app
  // passes its `paperChrome` at the one mount — so the bar follows the screen's bars. On paper it is the kit's NOTICE
  // (`.sb-notice`, "the app speaking about itself"), RELOAD and ✕ as `.hp-quiet` at 44, standing 12px clear of the
  // bottom bar (today it sits on its tabs). A dark host keeps the dark face below byte for byte.
  function VersionBeacon(props) {
    var paper = !!(props && props.paper);
    var _mine = (typeof __HOLOCRON_BUILD__ !== 'undefined') ? __HOLOCRON_BUILD__ : null;
    var _s = useState(false); var show = _s[0], setShow = _s[1];
    var latestRef = useRef(null);
    var suppressedRef = useRef(false);
    useEffect(function () {
      if (!_mine || typeof fetch !== 'function') return;   // no stamp (unbuilt/dev) → beacon inert
      var alive = true;
      try { if (window.localStorage && !window.localStorage.getItem(SEEN_BUILD_KEY)) window.localStorage.setItem(SEEN_BUILD_KEY, _mine); } catch (e) {}
      function seen() { try { return (window.localStorage && window.localStorage.getItem(SEEN_BUILD_KEY)) || _mine; } catch (e) { return _mine; } }
      var debounceTimer = null;
      function check() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          debounceTimer = null;
          fetch('/version.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
            if (!alive || !v || !v.build) return;
            latestRef.current = v.build;
            if (v.build !== seen() && !suppressedRef.current) setShow(true);
          }).catch(function () { /* offline / not deployed yet — stay silent */ });
        }, 100);
      }
      function onVisible() { if (document.visibilityState === 'visible') check(); }
      function onFocus() { check(); }
      function onNav() { suppressedRef.current = false; check(); }   // re-arm on navigation
      check();
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onFocus);
      window.addEventListener('popstate', onNav);
      return function () {
        alive = false;
        if (debounceTimer) clearTimeout(debounceTimer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('popstate', onNav);
      };
    }, []);
    // THE LIFT (paper only): the bottom bar's top, read while the bar shows and again on resize, so it stands clear of
    // the tabs; with no bottom bar on screen it keeps today's 16px.
    // B-1261 / C-3 (card `paper-n7-followon-seams-card` ADDENDUM 1, R-FS-7): the edge chrome (useEdgeChrome) SLIDES the
    // bottom bar in and out after the bar opened, so the lift is read again when that slide ENDS (`transitionend` on the
    // bar — read at the class flip it is still where it was), and when body's class flips with no slide to end
    // (reduced motion). No timer. The auto-hide's fade keeps the bar's box, so it needs neither.
    var _l = useState(16); var lift = _l[0], setLift = _l[1];
    React.useLayoutEffect(function () {
      if (!show || !paper) return undefined;
      function measure() {
        var nav = document.querySelector('nav.bottom-nav');
        var r = nav && nav.getBoundingClientRect();
        setLift((r && r.height > 0 && r.top < window.innerHeight) ? Math.round(window.innerHeight - r.top) + 12 : 16);
      }
      function onSlid(e) { if (e.target && e.target.matches && e.target.matches('nav.bottom-nav')) measure(); }
      measure();
      window.addEventListener('resize', measure);
      document.addEventListener('transitionend', onSlid, true);
      document.addEventListener('transitioncancel', onSlid, true);
      var classes = typeof MutationObserver === 'function' ? new MutationObserver(measure) : null;
      if (classes) classes.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      return function () {
        window.removeEventListener('resize', measure);
        document.removeEventListener('transitionend', onSlid, true);
        document.removeEventListener('transitioncancel', onSlid, true);
        if (classes) classes.disconnect();
      };
    }, [show, paper]);
    if (!show) return null;
    function dismiss() { suppressedRef.current = true; setShow(false); }   // re-arms at next navigation
    function reload() {
      try { if (window.localStorage && latestRef.current) window.localStorage.setItem(SEEN_BUILD_KEY, latestRef.current); } catch (e) {}
      try { window.location.reload(); } catch (e) {}
    }
    if (paper) {
      return h('div', { role: 'status', 'aria-live': 'polite', 'data-testid': 'version-beacon', 'data-doc-ground': 'creator',
        className: 'sb-notice',
        style: { '--u': '1px', position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 9000,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + ' + lift + 'px)', width: 'max-content', maxWidth: 'min(calc(100vw - 32px), 460px)',
          margin: 0, flexWrap: 'nowrap', gap: 10, padding: '6px 6px 6px 14px', boxShadow: 'var(--doc-lift)' } },
        h('span', { className: 'sb-notice-t', style: { minWidth: 0, fontFamily: 'var(--font-mono,monospace)', fontSize: 'calc(12 * var(--u))', letterSpacing: '.12em', lineHeight: 1.5 } }, 'UPDATED VERSION AVAILABLE'),
        h('span', { className: 'sb-notice-a', style: { flexWrap: 'nowrap', gap: 4 } },
          h('button', { type: 'button', className: 'hp-quiet', 'data-role': 'reload', onClick: reload, style: { color: 'var(--doc-ink)' } }, 'RELOAD'),
          h('button', { type: 'button', className: 'hp-quiet', 'aria-label': 'Dismiss', 'data-role': 'dismiss', onClick: dismiss,
            style: { minWidth: 44, padding: 0, justifyContent: 'center', fontSize: 16, color: 'var(--doc-ink)', border: 0 } }, '✕')));
    }
    return h('div', { role: 'status', 'aria-live': 'polite', 'data-testid': 'version-beacon', style: {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', zIndex: 9000,
      display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'min(92vw, 460px)',
      padding: '10px 12px 10px 16px', borderRadius: 8,
      background: 'rgba(30,24,10,0.96)', border: '1px solid rgba(245,166,35,0.5)',
      boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
    } },
      h('span', { style: { flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', lineHeight: 1.5, color: '#F5A623' } }, 'UPDATED VERSION AVAILABLE'),
      h('button', { type: 'button', onClick: reload, style: {
        flexShrink: 0, minHeight: 34, padding: '6px 14px', cursor: 'pointer', borderRadius: 5,
        border: '1px solid rgba(245,166,35,0.6)', background: 'rgba(245,166,35,0.16)', color: '#F5A623',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.14em', fontWeight: 700,
      } }, 'RELOAD'),
      h('button', { type: 'button', 'aria-label': 'Dismiss', onClick: dismiss, style: {
        flexShrink: 0, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 'var(--fs-lg)', cursor: 'pointer', lineHeight: 1,
      } }, '✕'));
  }

  // dc3 sheet-tabs Step 0 (ruling desktop-sheet-tabs-brief §3, R-DST-0): the cockpit's premium idiom,
  // promoted to shared primitives so every sheet tab (cockpit included) composes ONE look — no per-tab
  // copies. BYTE-IDENTICAL to the cockpit's former local ledgerHead/PANEL/ramp (a pure refactor).
  // formatActivation — the ONE display name for a talent/ability activation token (ruling
  // sheet-abilities-profile-revision-concept Addendum 1: "a display formatter sourced from the
  // activation VOCABULARY, applied in the SHARED entry/label path"). The registry stores
  // `incidental_out_of_turn`; four separate surfaces used to render that four ways —
  // `.toUpperCase()` (raw enum leaked on the sheet's ABILITIES tab AND the cockpit),
  // `.replace(/_/g,' ')` (the NPC card), and a correct-but-LOCAL actMap trapped inside the talent
  // tree's cell builder. One table, one home; unknown tokens degrade to a de-underscored word
  // rather than an enum (tolerant reader — the vocabulary may grow).
  var ACTIVATION_LABELS = {
    passive: 'Passive', action: 'Action', maneuver: 'Maneuver', incidental: 'Incidental',
    incidental_out_of_turn: 'Incidental (Out of Turn)', action_out_of_turn: 'Action (Out of Turn)',
    active: 'Active',   // F-100 M8 M3 (R-M8BG-225): the print's bare "Activation: Active"
  };
  function formatActivation(a) {
    if (!a) return '';
    var k = String(a).toLowerCase();
    if (ACTIVATION_LABELS[k]) return ACTIVATION_LABELS[k];
    return k.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  var SHEET_PANEL = { background: 'linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.014))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '13px 14px', boxShadow: '0 1px 0 rgba(255,255,255,.03) inset,0 10px 26px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column', minHeight: 0 };
  function LedgerHead(accent, name, count) {
    return h('div', { style: { flex: '0 0 auto' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 } },
        h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', letterSpacing: '0.15em', color: accent } }, name),   /* Jason 2026-07-20: section head back to display + accent */
        count != null ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', color: hexA(accent, 0.6) } }, count) : null),
      h('div', { 'aria-hidden': true, style: { height: 1, background: 'linear-gradient(90deg,' + hexA(accent, 0.3) + ',transparent)', marginBottom: 10 } }));
  }
  // ── THE DISCLOSURE SECTION (R-SL3-2, ruling `sheet-lab-three-questions`) ──────────────────────
  //
  // Jason's 2026-07-20 expandable-section idiom, promoted to ONE implementation. Tap a section's
  // header and it grows to fill its column while its siblings collapse to their headers; tap again
  // to restore the shared split. The header carries the section name in the LedgerHead face, an
  // optional count, and the expand/restore affordance.
  //
  // WHY IT IS HERE. It shipped as TWO hand-copies in `player/app.jsx` — `rSec` in the OVERVIEW
  // cockpit's right column and `lSec` in ADVANCEMENT's left — and the second copy's own comment
  // records what a copy costs: "TWO sites render this exact aria-label … my first pass patched the
  // other by matching first." That is the no-compromise-mirror law being paid for in debugging
  // time. The sheet board leans on this idiom eleven more times, which made a THIRD copy a matter
  // of when, so R-SL3-2 cut the promotion before any sheet-surface build.
  //
  // ZERO BEHAVIOUR CHANGE IS THE CONTRACT, and it is enforced rather than asserted:
  // `test/disclosure_section.cjs` holds both pre-promotion implementations VERBATIM and renders
  // them against this one with identical props, comparing the element trees key-for-key INCLUDING
  // style key ORDER. That last part is why the three call-site differences are threaded through as
  // options in the positions they already occupied, rather than appended:
  //
  //   minHeight   50 (cockpit) vs 46 (advancement)
  //   buttonStyle advancement alone carries `touchAction: 'manipulation'`
  //   bodyStyle   cockpit is a flex column whose children scroll; advancement's body scrolls itself
  //
  // The first two look like drift between two hand-copies rather than design, and the third is a
  // real difference. NONE of them is normalised here — harmonising even the 4px would be a
  // behaviour change, and this card is not authorised to make one. They are reported for a ruling
  // instead (gate `rsec-promotion`), which is the whole reason the promotion could be verified
  // this strictly: a lift that changes nothing can be PROVEN to change nothing.
  function DisclosureSection(opts) {
    opts = opts || {};
    var accent = opts.accent;
    var label = opts.label;
    var isExp = !!opts.expanded;
    var anyExpanded = !!opts.anyExpanded;
    return h('div', { key: opts.sectionKey, style: Object.assign({}, SHEET_PANEL, {
        flexGrow: anyExpanded ? (isExp ? 1 : 0) : opts.grow, flexShrink: 1, flexBasis: 0,
        minHeight: opts.minHeight, overflow: 'hidden',
        transition: 'flex-grow .35s cubic-bezier(.4,0,.2,1)' }) },
      h('button', { type: 'button', 'aria-expanded': isExp,
        'aria-label': (isExp ? 'Restore ' : 'Expand ') + label + ' section',
        // B-248: addressable without scanning aria-labels by regex. Both call sites render the
        // SAME aria-label text, which is exactly why the testid — derived from the label — is the
        // thing suites should select on.
        'data-testid': 'section-toggle-' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        onClick: opts.onToggle,
        style: Object.assign({ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6, flex: '0 0 auto' }, opts.buttonStyle) },
        h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', letterSpacing: '0.15em', color: accent } }, label),
        opts.count != null ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', color: hexA(accent, 0.6) } }, String(opts.count)) : null,
        h('span', { 'aria-hidden': true, style: { marginLeft: 'auto', color: hexA(accent, 0.75), fontSize: 'var(--fs-sm)', lineHeight: 1 } }, isExp ? '\u2921' : '\u2922')),
      // the LedgerHead gradient rule, so these sections match the other panels' headers exactly
      h('div', { 'aria-hidden': true, style: { height: 1, background: 'linear-gradient(90deg,' + hexA(accent, 0.3) + ',transparent)', marginBottom: 10, flex: '0 0 auto' } }),
      h('div', { style: Object.assign({ flex: '1 1 auto', minHeight: 0 }, opts.bodyStyle, {
          opacity: (anyExpanded && !isExp) ? 0 : 1, transition: 'opacity .25s ease' }) }, opts.body));
  }

  function sheetRamp(cur, max, accent) {
    var r = max > 0 ? cur / max : 0;
    return r >= 1 ? 'var(--text-danger)' : r >= 0.7 ? 'var(--text-warning)' : r >= 0.4 ? 'var(--text-caution)' : accent;
  }

  // THE DESIGNED PLACEHOLDER, promoted (ruling custom-npc-tab-space-triage Addendum 1 §B7): the
  // sheet's portrait-less monogram — an initial in the display face inside concentric hairline
  // rings — is now a shared primitive with three consumers (the NPC cast rail, the custom-NPC panel
  // header, and the PROFILE portrait box it came from). ONE definition (0015 central-source); the
  // geometry scales off `size` so every consumer keeps the original proportions by construction.
  // No glow — the rings ARE the treatment (the sheet spends its one glow on the XP numerals).
  function Monogram(props) {
    var size = props.size || 44;
    var accent = props.accent || '#4EAAFF';
    var name = String(props.name || '?').trim();
    return h('div', { 'aria-hidden': true, style: Object.assign({
      position: 'relative', width: size, height: size, flex: '0 0 ' + size + 'px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }, props.style || {}) },
      h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid ' + hexA(accent, 0.14) } }),
      h('div', { style: { position: 'absolute', inset: Math.max(2, Math.round(size * 0.1)), borderRadius: '50%', border: '1px solid ' + hexA(accent, 0.23) } }),
      h('div', { style: {
        fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: Math.round(size * 0.4), lineHeight: 1,
        letterSpacing: '0.06em', color: 'rgba(255,255,255,0.90)',
      } }, String(name.charAt(0) || '?').toUpperCase())
    );
  }

  // ── MOVED here from lib/library/npc/view.jsx (`BenchStaleBanner`) by SHIP YARD S0 — ruling
  // `shipyard-s0-foundations-census` §5 M3: ONE banner idiom for both versioned stores (the bench and
  // the vessels), as `f54-downgrade-prompt` §3 ruled. A move, not a change: the markup below is the
  // bench's element for element, written with `h` because this file is JSX-free on purpose (guards load
  // it raw into node — test/disclosure_section.cjs), and the paper flag arrives as a prop: the NPC
  // library has ONE face since the flip's deletion ledger (B-871), so the bench passes `paper` always.
  // Vessel hosts pass no `paper` (dark only; the vessel sheet's paper stale frame is S2's, R-SYC-3).
  /* ── F-54 — THE VERSION-AHEAD BANNER (ruling `f54-downgrade-prompt`; Jason: "users get a prompt")
     ONE idiom, mounted on the AFFECTED SURFACE (the bench board / the yard), never app-global chrome —
     a warning belongs where the data it protects is.

     WHY THERE IS NO DISMISS. Dismissal's only power would be to enable the loss this exists to
     prevent, so the choice offered is WHEN to refresh, not WHETHER. Reading is never blocked: the
     encounter still renders, read-only, so a GM mid-scene can still see their board.

     WHY THE HOLD IS NOT MERELY A WARNING. The stores refuse the write while stale (benchStore.persist,
     vesselStore.save). A warning you can ignore into data loss is ceremony, not protection — the
     banner informs, the hold protects, and they ship together or not at all.

     Distinguished from INFORM-NEVER-GATE, which protects RAW-legal play from app opinion: this gates
     an action with NO legitimate outcome. An old tab's save of newer data can only strip it. */
  function StaleTabBanner(props) {
    var accent = props.accent, paper = props.paper;   // `paper`: the caller's flag (the bench: its B-866 frame B12 context)
    if (paper) {
      return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-stale': '1', 'data-stale-banner': '1', role: 'status' },
        h('div', { className: 'nl-stale' }, h('b', null, 'THIS TAB IS BEHIND'),
          h('p', { className: 'nl-note', style: { margin: '4px 0 0' } }, 'This data was saved by a newer version of the app than this tab is running. Refresh to pick it up — editing from this tab would lose the newer data.')),
        h('button', { type: 'button', className: 'hp-commit', 'data-stale-refresh': '1',
          onClick: function () { if (typeof window !== 'undefined') window.location.reload(); } }, 'REFRESH'));
    }
    return h('div', { 'data-stale-banner': '1', role: 'status', style: {
      border: '1px solid ' + accent + '66', background: accent + '14', borderRadius: '10px',
      padding: '12px 14px', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
    } },
      h('div', { style: { minWidth: 0, flex: '1 1 260px' } },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', letterSpacing: '0.08em', color: accent, marginBottom: '4px' } },
          'THIS TAB IS BEHIND'),
        h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.5, color: 'rgba(255,255,255,0.78)' } },
          'This data was saved by a newer version of the app than this tab is running. Refresh to pick it up — editing from this tab would lose the newer data.')),
      h('button', { type: 'button', 'data-stale-refresh': '1',
        onClick: function () { if (typeof window !== 'undefined') window.location.reload(); },
        style: {
          flex: '0 0 auto', minHeight: '44px', minWidth: '44px', padding: '0 20px',
          borderRadius: '8px', cursor: 'pointer', touchAction: 'manipulation',
          background: accent + '26', border: '1px solid ' + accent + '88', color: accent,
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.14em',
        } }, 'REFRESH'));
  }

  // F-54 · THE HOLD, RENDERED, for a region whose controls another module draws (the vessel sheet —
  // ruling `shipyard-s0-foundations-census` §5 C2). NEW with SHIP YARD S0, not moved: the bench recedes
  // each of its own controls inline; a host cannot reach inside `VesselSheet` (deleted at the Ship Yard's S5 flip; the S4
  // faces wrap theirs the same way), so it wraps it. A
  // DISABLED <fieldset> disables every control it holds — click and keyboard alike — while the content
  // still reads and stays in the accessibility tree; the scoped rule recedes those controls exactly as
  // the bench does (opacity .4, no pointer). Layout-neutral: the fieldset's own chrome is reset, and a
  // region that is not held renders its children bare, so the everyday DOM does not change at all.
  // The banner goes OUTSIDE the hold — its REFRESH must stay live.
  var STALE_HOLD_CSS = '[data-stale-hold] button,[data-stale-hold] input,[data-stale-hold] select,'
    + '[data-stale-hold] textarea{opacity:.4;pointer-events:none;cursor:not-allowed}';
  function StaleHold(props) {
    if (!props.held) return props.children;
    return h('fieldset', { disabled: true, 'data-stale-hold': '1', 'aria-disabled': 'true',
      style: { border: 0, padding: 0, margin: 0, minWidth: 0 } },
      h('style', null, STALE_HOLD_CSS), props.children);
  }

  // ── F-100 M8 step 3 · THE OFFER ROW (f100-m8-build-card R-M8B-11..15; the frames `Docs/mockups/f100-m8-offers.html`,
  // approved D-26, way 1 of every fork). ONE implementation, used by every face that shows an offer (R-M8B-15: the hub's
  // rows, the Ship Yard's seat card). A 44px tick (aria-pressed), the talent's name and what it does, its cost and limit
  // as tags — SHOWN, never charged or tracked (R-M8B-12 (b)). The tick is the caller's state for ONE roll (R-M8B-12 (a))
  // and opens unticked (c). Paper tokens only; PAPER's CSS is not this row's, so the frame's kit styles ride inline.
  var OFFER_DIE = { boost: 'boost', setback: 'setback', ability: 'ability', proficiency: 'proficiency',
    difficulty: 'difficulty', challenge: 'challenge', force: 'Force' };
  function offerTimes(n) { return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'; }
  // what the offer does, in the mechanics voice: "+1 boost", "1 fewer difficulty die", "upgrade this check once",
  // "downgrade the difficulty twice", "+1 success". `m` is a pool-mod reminder (SWRPGPoolMods.reminders).
  function offerEffect(m) {
    var n = Number(m && m.count) || 0, d = m && m.die, dir = m && m.direction;
    // F-100 M9 (R-M9S-6/13): `count: 'all'` reads "remove all", never a number — it was "0 fewer setback dice"
    if (m && m.count === 'all') return 'remove all ' + (OFFER_DIE[d] || d) + ' dice';
    // the surfacing hub (`b1205:offered-crit-sets`): an offered species crit SET reads its new rating, "Crit → 3"
    if (m && m.op === 'crit_rating_set') return 'Crit → ' + m.amount;
    // B-1455 (D-406 item 10): an offered damage roll number reads "+1 damage to one hit", and offerOf quotes its condition after it
    if (m && m.op === 'damage_delta') return (m.amount < 0 ? '−' : '+') + Math.abs(Number(m.amount) || 0) + ' damage to one hit';
    // F-100 THE SURFACING MISSION (D-294 L3; card f100-surfacing-roll-options-card R-SRO-5): a reroll row's drawn words
    if (dir === 'reroll') return 'reroll this check';
    if (m && m.symbol) return '+' + n + ' ' + m.symbol;
    if (dir === 'upgrade') return (d === 'difficulty' || d === 'challenge' ? 'upgrade the difficulty ' : 'upgrade this check ') + offerTimes(n);
    if (dir === 'downgrade') return (d === 'difficulty' || d === 'challenge' ? 'downgrade the difficulty ' : 'downgrade this check ') + offerTimes(n);
    if (dir === 'remove') return n + ' fewer ' + (OFFER_DIE[d] || d) + (n === 1 ? ' die' : ' dice');
    return '+' + n + ' ' + (OFFER_DIE[d] || d);
  }
  // a condition is the stored string, or (an M8 span, R-M8K-17 (b)) the talent's own words at that span
  function offerCondition(m, talents) {
    var c = m && m.condition;
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object' && m.talentId && talents && talents[m.talentId]) {
      var desc = String(talents[m.talentId].description || '');
      var w = desc.slice(c.start, c.end).trim();
      return w ? '“' + w + '”' : '';
    }
    return '';
  }
  // `strain_per_rank` (f100-m8-batches ADDENDUM 53, R-M8BG-208): the strain scales by the SAME multiplier as the count
  // offerEffect reads — the reminder's count over the talent's own row's count (poolMods.collect's ranks). `talents` is
  // the registry offerOf's caller holds (charbuild.talents, the pack's records included); absent, the hub's own. A row
  // the registry cannot place says "per rank" rather than guess a number.
  function offerTags(m, talents) {
    var out = [], c = (m && m.cost) || {}, times = 0;
    if (c.strain_per_rank) {
      var T = talents || ((typeof window !== 'undefined' && window._canonicalCharbuild) || {}).talents;
      var rec = T && m.talentId ? T[m.talentId] : null;
      var row = rec ? (rec.pool_mods || []).filter(function (r) { return r && r.id === m.id; })[0] : null;
      times = row && Number(row.count) > 0 && Number(m.count) > 0 ? Number(m.count) / Number(row.count) : 0;
    }
    if (c.strain && c.strain_per_rank) out.push(times ? (c.strain * times) + ' strain' : c.strain + ' strain per rank');
    else if (c.strain) out.push(c.strain + ' strain');
    if (c.destiny) out.push(c.destiny + (c.destiny === 1 ? ' Destiny Point' : ' Destiny Points'));
    // F-100 THE SURFACING MISSION (roll-options card ADDENDUM 14 F9): the Conflict a use takes, shown and never charged, per
    // unit under the row's multiplier when `strain_per_rank` is set (Questionable Ethics: strain AND conflict up to ranks)
    if (c.conflict) out.push(c.strain_per_rank ? (times ? (c.conflict * times) + ' conflict' : c.conflict + ' conflict per rank') : c.conflict + ' conflict');
    if (c.commit_force) out.push('commit ' + c.commit_force + ' Force');
    if (c.wounds) out.push(c.wounds + (c.wounds === 1 ? ' wound' : ' wounds'));
    if (m && m.limit) out.push(String(m.limit).replace(/_/g, ' '));
    return out;
  }
  // a pool-mod reminder → the row's { name, text, tags } (+ `s3` in a copy without the book's words)
  function offerOf(m, talents) {
    var cond = offerCondition(m, talents);
    var o = { key: m.key, name: m.source || '', text: offerEffect(m) + (cond ? ' ' + cond : ''), tags: offerTags(m) };
    var s3 = typeof offerS3 === 'function' ? offerS3(m, talents) : null;   // guarded: suites slice offerOf alone
    if (s3) o.s3 = s3;
    return o;
  }
  // S3 (argo-a1-curation ADDENDUM 4; mockup F3): an offer whose condition words the public copy removed → { label, line }:
  // its short label (own_words.json, R-AE-7: SWRPGSources.ownWordsOfRow; '' when none is authored) and the book line beside it (the row's own cite, else its
  // owner's). null on holocron (bookTextRemoved false), for a row with no condition, and where the words still ship.
  function offerS3(m, talents) {
    var SS = typeof window !== 'undefined' ? window.SWRPGSources : null;
    if (!SS || !SS.bookTextRemoved || !SS.bookTextRemoved() || !m) return null;
    if ((m.condition === null || m.condition === undefined) && m.reason !== 'condition') return null;
    if (offerCondition(m, talents)) return null;
    var rec = m.talentId && talents ? talents[m.talentId] : null, cite = null;
    if (rec) ['pool_mods', 'roll_numbers', 'target'].some(function (f) {
      return (rec[f] || []).some(function (r) { if (r && r.id === m.id) { cite = r.cite || null; return true; } return false; });
    });
    return { label: String((SS.ownWordsOfRow && SS.ownWordsOfRow(m)) || '').trim(), line: SS.removedLine(rec || (m.item && (m.item.rec || m.item)) || null, [cite]) || '' };
  }
  // the S3 line under an offer: the label, then " · <book line>" in the source-line style; the line alone without a label
  function OfferS3Line(props) {
    var s = props.s3;
    if (!s || (!s.label && !s.line)) return null;
    return h('div', { 'data-s3': 'condition', style: { marginTop: 3 } }, s.label ? glyphText(s.label) : null,
      s.line ? h('span', { style: BOOK_LINE_STYLE }, (s.label ? ' \u00b7 ' : '') + s.line) : null);
  }
  // THE OWNER'S LOOKUP offerOf reads (F-100 THE SURFACING MISSION, card `f100-surfacing-yard-concept` R-SYC-3 as ADDENDUM 4
  // D-SYF2 (a) changed it): ONE function for every reader of a character's offers — the dice hub's rows, the sheet's why-sheet
  // and the Ship Yard's seat card (both hosts, the SITTER's sheet). The talents come from the sheet's STAMP VIEW first
  // (CharResolve.talentViewFor), so a talent present only in a pack the sheet carries — switched off on this device — still
  // reads its condition words; then the discovery view for an id the stamp view lacks. A species ability's owner
  // ('species:<id>:<slug>', R-SRC-11, F-100 M9 R-M9S-1) resolves through the same view. An owner that resolves to nothing
  // leaves the row its own effect words (offerEffect), never blank. → { <talentId>: record }.
  function offerTalentsFor(sheet, rows) {
    var CR = typeof window !== 'undefined' ? window.CharResolve : null;
    var disc = (typeof window !== 'undefined' && window._canonicalCharbuild) || null;
    var cb = (sheet && CR && CR.talentViewFor ? CR.talentViewFor(sheet) : null) || disc;
    var own = (cb && cb.talents) || null, base = (disc && disc.talents) || null;
    var tal = own && base && own !== base ? Object.assign({}, base, own) : (own || base);
    (rows || []).forEach(function (m) {
      if (!m || !/^species:/.test(String(m.talentId || '')) || !CR || !CR.speciesAbilityOwner) return;
      var so = CR.speciesAbilityOwner(m.talentId, cb);
      if (so) { tal = Object.assign({}, tal); tal[m.talentId] = so; }
    });
    return tal;
  }
  // a TOLD line (frame F6's .m8-told, the approved record D-26; moved from player/app.jsx's DiceHubTold by card
  // `f100-surfacing-yard-concept` ADDENDUM 8 Q2 (a)): body type in the muted ink, the rule's own words in the ink, and the
  // ONE M8 tag for "not applied" — never the reminder row's dark-theme tokens, which the paper does not remap. A row carrying
  // a ruled `limit` draws it as a SECOND tag (R-M8BG-38/40); an unknown value prints nothing. Read by the dice hub, the
  // sheet's VESSELS gun rows (Auto-fire, R-SYC-2) and the Yard's seat card (a part's granted talent, R-SYC-5), both hosts.
  var TOLD_LIMIT_TAG = { once_per_round: 'once per round', once_per_encounter: 'once per encounter', once_per_session: 'once per session' };
  function ToldLine(props) {
    var lim = Object.prototype.hasOwnProperty.call(TOLD_LIMIT_TAG, props.limit) ? TOLD_LIMIT_TAG[props.limit] : null;
    // B-1451 (D-406 item 14): a told row whose owner is known (`talentId`, `rowId`) opens its talent's words — the (i)
    var UIw = (typeof window !== 'undefined' && window.SWRPGUI) || {};
    var info = props.info || (props.talentId && UIw.offerInfo ? UIw.offerInfo(props.talentId, props.rowId, props.tal) : null);
    return h('div', { className: 'dh-rem', 'data-m8': 'told', role: 'presentation', style: {
      display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.4, color: 'var(--doc-ink-muted)' } },
      h('span', { 'aria-hidden': 'true' }, '▫'),
      // S2 (argo-a1-curation ADDENDUM 4; mockup F2): where the book's words were removed, `line` (the told row's book line) and
      // `at` ("at the Medicine check") stand in place of the quote; absent (holocron), the quote as before
      props.line != null ? h('span', null, h('b', null, props.name), props.line ? ' \u00b7 ' + props.line : '', props.at ? ' \u00b7 ' + props.at : '',
        h('span', { className: 'm8-tag', style: Object.assign({}, OFFER_TAG, { marginLeft: 6 }) }, 'not applied'),
        lim ? h('span', { className: 'm8-tag', style: Object.assign({}, OFFER_TAG, { marginLeft: 6 }) }, lim) : null) :
      h('span', null, h('b', null, props.name + ' '),
        // R-M8BG-129: the words draw their dice tokens through the ONE shared renderer
        h('q', { style: { fontStyle: 'italic', color: 'var(--doc-ink)' } }, typeof glyphText === 'function' ? glyphText(props.words) : props.words),
        h('span', { className: 'm8-tag', style: Object.assign({}, OFFER_TAG, { marginLeft: 6 }) }, 'not applied'),
        lim ? h('span', { className: 'm8-tag', style: Object.assign({}, OFFER_TAG, { marginLeft: 6 }) }, lim) : null),
      // B-1451 (D-406 item 14): the source's (i), the roll options' own (offerInfo's box); absent, the line as before
      info ? h('span', { style: INFO_SLOT }, h(OfferInfo, { info: info, offerKey: props.infoKey || (props.talentId + ':' + props.rowId) })) : null);
  }
  // where a line's (i) sits (B-1451): its trailing edge, centred on the line, never squeezed
  var INFO_SLOT = { marginLeft: 'auto', flexShrink: 0, alignSelf: 'center', display: 'inline-flex' };
  // THE CARRIED-GEAR FOLD (the surfacing hub's H3, D-229 Q1 (b) as ADDENDUM 7 Q3 (a) ruled; moved from player/app.jsx's
  // diceHubGearFold by card `f100-surfacing-yard-concept` ADDENDUM 8 Q2 (a)): a row's offers OWNED by carried gear (holder
  // 'gear') behind ONE line — "<n> more from carried gear ▸" — that opens them (▾). Its ONE style (B-1389) is this inline
  // style, the approved hub record's H3 (b): at least 44 px tall, a ruled edge, body type — so the hub and the Yard's seat
  // card (both hosts, no stylesheet needed) draw one look. → [] with no gear, else [the button].concat(open ? els : []).
  // `testid` names the reader's button (the hub's `dice-hub-gear-fold`, the seat card's `seat-gear-fold`).
  var GEAR_FOLD_STYLE = { minHeight: 44, marginTop: 8, display: 'flex', gap: 7, alignItems: 'center', fontFamily: 'var(--font-body)', fontSize: 15,
    color: 'var(--doc-ink)', background: 'transparent', border: '1px solid var(--doc-rule)', padding: '0 12px', cursor: 'pointer', textAlign: 'left' };
  // B-1453 (D-406 item 12): `words` names what the fold holds — absent, carried gear; the hub's situation fold passes
  // ' more for a situation' (an offer anchored to every check with a condition), the same button in every other respect
  function GearFold(rowKey, els, open, onToggle, testid, words) {
    if (!els || !els.length) return [];
    return [h('button', { key: words ? 'sf' : 'gf', type: 'button', 'data-testid': testid || 'dice-hub-gear-fold', className: 'dh-gear-fold', 'aria-expanded': open ? 'true' : 'false',
      style: GEAR_FOLD_STYLE, onClick: function () { onToggle(rowKey); } }, els.length + (words || ' more from carried gear') + ' ' + (open ? '▾' : '▸'))].concat(open ? els : []);
  }
  // an APPLIED change's words (a core computed it): "−1 setback — Skilled Jockey", "+1 advantage on every Coercion check —
  // Fearsome Rep". `c` is one of augment's change records (`_poolModChanges`); the hub's status lines and the Ship Yard's
  // seat card both read them here, so one change has one sentence.
  function appliedLineText(c, checkName) {
    if (c.symbol) return '+' + (c.to - c.from) + ' ' + c.symbol + (checkName ? ' on every ' + checkName + ' check' : '') + ' — ' + (c.source || 'carried item');
    return (c.direction === 'remove' ? '−' : '+') + Math.abs(c.to - c.from) + ' ' + c.die + ' — ' + (c.source || 'carried item');
  }
  // the line as paper draws the hub's (DiceHubStatusLine's markup, sheet.css `.sb-dh .dh-sl`'s ink), for a face without the hub
  function AppliedLine(props) {
    return h('div', { className: 'dh-sl', 'data-m8': 'applied', style: { display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 5,
      fontSize: 'var(--fs-sm)', lineHeight: 1.35, fontFamily: 'var(--font-body)', color: 'var(--doc-ink-muted)' } },
      h('span', { 'aria-hidden': 'true', style: { fontSize: 11, lineHeight: 1.5, flexShrink: 0 } }, '▸'), h('span', null, props.children),
      props.info ? h('span', { style: INFO_SLOT }, h(OfferInfo, { info: props.info, offerKey: props.infoKey })) : null);   // B-1451
  }
  // THE + / − COUNT CONTROL (DECISIONS D-291's D1, the approved install-count idiom; ruling `f100-surfacing-force-flip-card`
  // ADDENDUM 12 F3 (b) D1 LITERAL + F6 (a) ONE shared component): the label on the left, `[−] ×n [+]` on the right — two
  // square 44 px quiet buttons with the count between them — and the reason under the label. A held `+` (`plusHeld`: no
  // die free, the cap) is `disabled` with its edge DASHED, never an opacity (UI_RULES R5); a held `−` (`minusHeld`) the same.
  // props = { label, count, onMinus, onPlus, plusHeld, minusHeld, reason, testid, minusLabel, plusLabel }. The first build of
  // D1: Farsight's stacking commit reads it (player/app.jsx, the power unit); the attachments' D1 build REUSES it.
  // R-R5F1-1 (card release-r5-f1 ADDENDUM 4, additive): `max`, when given, reads the count "n of N" (an install count has a
  // printed maximum; D-291 D1); `plus`, a node, takes the + button's place (the Yard's TO THE COUNTER). Absent, both are
  // exactly today's: "×n" and the + button (Force's consumer passes neither).
  // B-1388 (D-440, additive): `readOnly` draws the count alone, with no − and no + (the GM's ITS MODS: told, never sold).
  function CountStep(props) {
    var btn = function (glyph, held, onClick, label, tid) {
      return h('button', { type: 'button', className: 'hp-quiet', disabled: held || undefined, 'aria-disabled': held ? 'true' : undefined,
        'aria-label': label, 'data-testid': tid, onClick: held ? undefined : onClick,
        style: { width: 44, height: 44, minWidth: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          font: '600 20px/1 var(--font-mono)', borderStyle: held ? 'dashed' : undefined, cursor: held ? 'not-allowed' : 'pointer' } }, glyph);
    };
    var tid = props.testid || 'count-step';
    return h('div', { className: 'hp-countstep', 'data-testid': tid, 'data-count': props.count,
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%' } },
      h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
        h('div', { 'data-testid': tid + '-label', style: { fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.3, color: 'var(--doc-ink)' } }, props.label),
        props.reason ? h('div', { 'data-testid': tid + '-reason', style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.35,
          color: 'var(--doc-ink-muted)', marginTop: 2 } }, props.reason) : null),
      h('div', { style: { display: 'inline-flex', alignItems: 'center', gap: 10, flex: '0 0 auto' } },
        props.readOnly ? null : btn('−', !!props.minusHeld, props.onMinus, props.minusLabel || ('One less — ' + props.label), tid + '-minus'),
        h('span', { 'data-testid': tid + '-count', 'aria-live': 'polite', style: { font: '600 16px/1 var(--font-mono)', color: 'var(--doc-ink)', minWidth: 28, textAlign: 'center' } },
          props.max != null ? (Number(props.count) || 0) + ' of ' + props.max : '×' + (Number(props.count) || 0)),
        props.readOnly ? null : props.plus != null ? props.plus : btn('+', !!props.plusHeld, props.onPlus, props.plusLabel || ('One more — ' + props.label), tid + '-plus')));
  }
  var OFFER_TAG = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
    color: 'var(--doc-ink-muted)', border: '1px solid var(--doc-rule, rgba(0,0,0,.3))', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' };
  // the WHO tag's look (D-348; brief §5): the chip's outline, in sentence case in the body face — words, not a code
  var OFFER_WHO = Object.assign({}, OFFER_TAG, { fontFamily: 'var(--font-body)', fontSize: 13, letterSpacing: 0, textTransform: 'none', lineHeight: 1.35 });
  // ── THE ROLL OPTIONS' INFO BOX AND WHO TAG (F-100 THE SURFACING MISSION 5h; Jason's version A, D-348 @ dd89f06c7 — LAW
  // but its tag TEXT; brief f100-surfacing-roll-options-f §4/§5 as ruled at card ADDENDUM 62) ───────────────────────────
  // offerWho(row) → the who tag's words, or null: ITS ONE READER of `who.label` (brief §5). An empty label draws no tag.
  function offerWho(row) {
    var w = row && (row.who || (row.row && row.row.who));
    return w && typeof w.label === 'string' && w.label ? w.label : null;
  }
  // what the app checks itself, in plain words (the words census's plain_checked, from the row's own anchors and `when`)
  function offerChecked(row) {
    var cb = (typeof window !== 'undefined' && window._canonicalCharbuild) || {}, names = cb.skillNames || {};
    var checks = [], other = [];
    (row.applies_to || []).forEach(function (a) {
      if (!a) return;
      if (a.scope === 'skill') checks.push(names[a.value] || readableId(a.value));
      else if (a.scope === 'group') checks.push(String(a.value));
      else if (a.scope === 'weapon_record' && a.value === 'unarmed') other.push('only on the Unarmed row');
    });
    if (row.when === 'hit') other.push('only on a hit');
    else if (row.when === 'miss') other.push('only on a miss');
    var parts = [];
    if (checks.length) {
      var sk = checks.length === 1 ? checks[0] : checks.slice(0, -1).join(', ') + ' or ' + checks[checks.length - 1];
      parts.push('only on ' + (/^[aeiou]/i.test(sk) ? 'an ' : 'a ') + sk + ' check');
    }
    parts = parts.concat(other);
    return parts.length ? 'the app checks this itself: ' + parts.join('; ') : '';
  }
  // offerInfo(talentId, rowId, talents, extra) → the box's words, or null: THE ONE BUILDER of the box (brief §4), the only
  // code that reads a row's description, cite and `who.span` for it. Order (ADDENDUM 52): name · the whole description ·
  // THIS row's cost (`extra.cost` words, or `extra.price` tokens with `extra.priceWords`) · limits (how often, who/where:
  // the plain words beside the book's phrase, what the app checks itself) · the source. `talents` absent: the discovery view.
  function offerInfo(talentId, rowId, talents, extra) {
    if (!talentId) return null;
    var T = talents || (((typeof window !== 'undefined' && window._canonicalCharbuild) || {}).talents) || {};
    var rec = T[talentId];
    // S1 (F3): in a copy without the book's words the box still opens; its source line is the book line.
    var SS = typeof window !== 'undefined' ? window.SWRPGSources : null, removed = !!(SS && SS.bookTextRemoved && SS.bookTextRemoved());
    if (!rec || (!rec.description && !removed)) return null;
    var row = null;
    ['pool_mods', 'roll_numbers', 'spend', 'target', 'effects', 'told'].some(function (a) {
      return (rec[a] || []).some(function (r) { if (r && r.id === rowId) { row = r; return true; } return false; });
    });
    row = row || {};
    var told = (rec.told || [])[0] || {}, cite = row.cite || told.cite || null, lim = row.limit || told.limit || null;
    var how = lim ? (TOLD_LIMIT_TAG[lim] || String(lim).replace(/_/g, ' ')) : null;
    var limits = how ? [how] : [], w = row.who;
    var phrase = w && w.span ? String(rec.description || '').slice(w.span.start, w.span.end).trim() : '';
    if (phrase) {
      limits.push(w.label ? w.label + ' (“' + phrase + '”)' : '“' + phrase + '”');
    }
    var chk = offerChecked(row);
    if (chk) limits.push(chk);
    extra = extra || {};
    return { id: talentId, row: rowId, name: rec.name || talentId, text: String(rec.description || ''), cost: extra.cost || offerTags({ cost: row.cost }, T),
             price: extra.price || null, priceWords: extra.priceWords || null, howOften: how, limits: limits,
             book: cite ? cite.book : null, page: cite ? cite.page : null };
  }
  // offerItemInfo(item) → the box for a line an ITEM owns (B-1590, DECISIONS D-411 item 1; page
  // Docs/mockups/release-r7-d406-b1590-look.html @ 38a0acde2): the item's name and its record's description, and nothing the
  // item does not hold — no cost, limits or page. `item` = the pool row's `item` (SWRPGPoolMods.collect: the record as the
  // character resolved it). Null with the key OFF, or an item with no words; then the line draws as before.
  function offerItemInfo(item) {
    if (!item) return null;
    if (!item.text || !String(item.text).trim()) return s1InfoBox('item:' + (item.id || item.name), item.name || item.id, item);
    return { id: 'item:' + (item.id || item.name), row: null, name: item.name || item.id, text: String(item.text), cost: [], price: null, priceWords: null,
             howOften: null, limits: [], book: null, page: null };
  }
  // S1 (argo-a1-curation ADDENDUM 4): in a copy without the book's words, a box whose words were removed still opens, its
  // source line the record's first cite (SWRPGSources.recordCites). null on holocron.work, and for a record citing nothing.
  function s1InfoBox(id, name, rec) {
    var SS = typeof window !== 'undefined' ? window.SWRPGSources : null;
    if (!SS || !SS.bookTextRemoved || !SS.bookTextRemoved() || !rec) return null;
    var c = SS.recordCites(window._swrpgSourcesIndex || null, rec)[0];
    return c ? { id: id, row: null, name: name, text: '', cost: [], price: null, priceWords: null, howOften: null, limits: [], book: c.book, page: c.page } : null;
  }
  // offerQualityInfo(qualityId) → the box for a line a WEAPON QUALITY owns (B-1609, DECISIONS D-412 item 5; page
  // scripts/r7_d411_pictures_page.py): the quality's registry name and description (qualities.vocab.json, as the host holds it
  // on `window._qualitiesDb`), and nothing the entry does not hold — no cost, limits or page. Null with the key OFF, the
  // vocabulary not yet loaded, or an entry with no words; then the line draws as before.
  function offerQualityInfo(qualityId) {
    var db = qualityId && typeof window !== 'undefined' ? window._qualitiesDb : null, rec = null;
    if (db) Object.keys(db).some(function (k) { var e = db[k]; if (e && e.id === qualityId) { rec = e; return true; } return false; });
    if (!rec) return null;
    if (!rec.description || !String(rec.description).trim()) return s1InfoBox('quality:' + rec.id, rec.label || rec.id, rec);
    return { id: 'quality:' + rec.id, row: null, name: rec.label || rec.id, text: String(rec.description), cost: [], price: null, priceWords: null,
             howOften: null, limits: [], book: null, page: null };
  }
  // the ONE choice of a line's box (B-1590, B-1609): its talent's (offerInfo), else its item's (offerItemInfo), else its weapon
  // quality's (offerQualityInfo), else none
  function offerInfoOf(talentId, rowId, item, talents, extra, quality) {
    return talentId ? offerInfo(talentId, rowId, talents, extra) : item ? offerItemInfo(item) : offerQualityInfo(quality);
  }
  // THE PREVIEW / PIN LOGIC, pure (brief §4: node drives it with a fake clock). state {phase, due}: closed · pending (a
  // dwell is running) · preview · grace (the pointer left; 150 ms to come back) · pinned. Events: enter / leave (a hover-
  // capable pointer over the trigger or the box), click (the (i)), timer (a `due` reached), close. The three traps
  // (ADDENDUM 58 ITEM 4): (a) a click cancels a pending dwell (it pins; nothing is left due); (b) a timer fires only for
  // the state that set it (OfferInfo clears it on every move and on unmount); (c) Back is pushed only while PINNED.
  var POP_DWELL = 300, POP_GRACE = 150, POP_CLOSED = { phase: 'closed', due: 0 };
  function popoverStep(s, ev) {
    s = s || POP_CLOSED;
    var t = (ev && ev.t) || 0;
    switch (ev && ev.type) {
      case 'click': return s.phase === 'pinned' ? POP_CLOSED : { phase: 'pinned', due: 0 };
      case 'enter':
        if (!ev.hover) return s;
        if (s.phase === 'closed') return { phase: 'pending', due: t + POP_DWELL };
        if (s.phase === 'grace') return { phase: 'preview', due: 0 };
        return s;
      case 'leave':
        if (s.phase === 'pending') return POP_CLOSED;
        if (s.phase === 'preview') return { phase: 'grace', due: t + POP_GRACE };
        return s;
      case 'timer':
        if (!s.due || t < s.due) return s;
        if (s.phase === 'pending') return { phase: 'preview', due: 0 };
        if (s.phase === 'grace') return POP_CLOSED;
        return s;
      case 'close': return POP_CLOSED;
      default: return s;
    }
  }
  function canHover() {
    try { return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) { return false; }
  }
  var IB_LABEL = { fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 10.5, lineHeight: 1.3, letterSpacing: '.12em', textTransform: 'uppercase',
    color: 'var(--doc-ink-muted)', margin: '8px 0 3px' };
  var IB_LINE = { fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.45, color: 'var(--doc-ink)' };
  // THE SOURCE LINE'S LOOK (the box's `data-words="source"` line below), shared as S1's book line (argo-a1-curation ADDENDUM 4
  // S1: "the existing source-line style, not a new one"). BookLine draws a line from SWRPGSources.removedLine / bookLine;
  // an empty line draws nothing (the slot collapses, F9).
  var BOOK_LINE_STYLE = { fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.4, letterSpacing: '.04em', color: 'var(--doc-ink-muted)' };
  function BookLine(props) {
    if (!props.line) return null;
    return h(props.as || 'div', { 'data-words': 'book-line', className: props.className, style: Object.assign({}, BOOK_LINE_STYLE, props.style) }, props.line);
  }
  // the box's body as drawn (A): the text through the sheet card's cleanMarkup + glyphText, the cost, the limits, the source
  function OfferInfoBody(props) {
    var b = props.info, SI = typeof window !== 'undefined' ? window.SWItems : null;
    var text = (SI && SI.cleanMarkup ? SI.cleanMarkup(b.text) : b.text).replace(/\s+/g, ' ').trim();
    var src = b.book ? window.SWRPGSources.pageCite(bookTitle(b.book), b.page) : null;   // S1's formatter (B-1809)
    return h('div', null,
      text ? h('div', { 'data-words': 'text', style: { fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.5, color: 'var(--doc-ink)', margin: '0 0 10px' } }, glyphText(text)) : null,   // S1 (F3): no words, no slot
      b.price || (b.cost && b.cost.length) ? h(React.Fragment, null, h('div', { style: IB_LABEL }, 'Cost'),
        b.price ? h('div', { 'data-words': 'cost', role: 'img', 'aria-label': b.priceWords || b.price, style: IB_LINE }, glyphText(b.price))
          : h('div', { 'data-words': 'cost', style: IB_LINE }, b.cost.join(' · '))) : null,
      b.limits && b.limits.length ? h(React.Fragment, null, h('div', { style: IB_LABEL }, 'Limits'),
        b.limits.map(function (l, i) { return h('div', { key: i, 'data-words': 'limit', style: IB_LINE }, l); })) : null,
      src ? h('div', { 'data-words': 'source', style: Object.assign({}, BOOK_LINE_STYLE, { marginTop: 10 }) }, src) : null);
  }
  // THE (i) AND ITS BOX (A; ADDENDUM 52, F2/F3/F7–F10): the (i) at the row's trailing edge, 44 × 44, a drawn "i" in a 1 px
  // circle; a tap pins the box (Back, Esc, an outside press or the (i) again close it); a fine pointer previews it after a
  // 300 ms dwell on the row's name or the (i), with 150 ms of grace across trigger and box. The box is a labelled
  // non-modal dialog portalled to <body>: at 1024 and wider below the row's name (flipped above at the viewport's foot,
  // ≤ 360 px, held on screen); narrower, above the row when it fits between the hub's top and the row, else the paper
  // bottom sheet (RefPaperWindow). Its Esc is the ONE stack's (usePopover).
  function OfferInfo(props) {
    var info = props.info;
    var st = useState(POP_CLOSED), s = st[0], setS = st[1];
    var pl = useState(null), place = pl[0], setPlace = pl[1];
    var btnRef = useRef(null), boxRef = useRef(null);
    var step = function (type) { setS(function (p) { return popoverStep(p, { type: type, t: Date.now(), hover: canHover() }); }); };
    useEffect(function () {   // trap (b): one timer per state, cleared when the state moves or the row unmounts
      if (!s.due) return undefined;
      var id = setTimeout(function () { step('timer'); }, Math.max(0, s.due - Date.now()));
      return function () { clearTimeout(id); };
    }, [s.phase, s.due]);
    useEffect(function () {   // the row's name previews too (a fine pointer only; popoverStep ignores a coarse one)
      var row = btnRef.current && btnRef.current.closest('[data-offer-key]'), nm = row && row.querySelector('b');
      if (!nm) return undefined;
      var en = function () { step('enter'); }, lv = function () { step('leave'); };
      nm.addEventListener('mouseenter', en); nm.addEventListener('mouseleave', lv);
      return function () { nm.removeEventListener('mouseenter', en); nm.removeEventListener('mouseleave', lv); };
    }, []);
    var open = s.phase === 'preview' || s.phase === 'grace' || s.phase === 'pinned', pinned = s.phase === 'pinned';
    // trap (c): Back only while pinned — and never for a box inside another popover (`noBack`: the reroll choice, D-352's Back
    // fence). Its close no longer closes the choice (B-1702). It holds because a real Back is heard by every open overlay: with
    // an entry of its own the box and the choice would both close on one Back, and the choice's entry would be left, a dead press.
    usePopover(open, function () { setS(POP_CLOSED); }, btnRef, boxRef, pinned && !props.noBack);
    // B-1825 (ADDENDUM 631): the paper bottom sheet face stands over a scrim, so it holds focus; the box face is a non-modal
    // popover (aria-modal false) and does not
    useHoldFocus(boxRef, !!(open && place && place.rule === 'sheet'));
    var id = 'offer-info-' + String(props.offerKey || info.id + '-' + info.row).replace(/[^A-Za-z0-9_-]+/g, '-');
    React.useLayoutEffect(function () {
      if (!open) { setPlace(null); return; }
      if (place) return;
      // the line the (i) sits on: an offer row, else (B-1451) an applied, told, reminder or why-sheet line — without one the box
      // was never placed and stayed hidden ("measuring")
      var b = btnRef.current, box = document.getElementById(id), row = b && (b.closest('[data-offer-key]') || b.closest('[data-m8], .dh-rem') || b.parentElement);
      if (!b || !box || !row) return;
      var W = document.documentElement.clientWidth || window.innerWidth, H = window.innerHeight, G = 8, vw = Math.min(360, W - 2 * G);
      var hubEl = row.closest('[data-testid=dice-hub]'), hubTop = hubEl ? Math.max(hubEl.getBoundingClientRect().top, 0) : 0;
      var rr = row.getBoundingClientRect(), nr = (row.querySelector('b') || row).getBoundingClientRect(), bh = box.getBoundingClientRect().height;
      if (W < 1024) {
        if (rr.top - hubTop - G >= bh && rr.top - G <= H - G) setPlace({ rule: 'above', left: Math.max(G, Math.min(W - G - vw, rr.left)), top: rr.top - G - bh, w: vw });
        else setPlace({ rule: 'sheet' });
        return;
      }
      var top = nr.bottom + 6, rule = 'below';
      if (top + bh > H - G) { top = nr.top - 6 - bh; rule = 'above'; }
      if (top < G || top + bh > H - G) top = Math.max(G, Math.min(top, H - G - bh));
      setPlace({ rule: rule, left: Math.max(G, Math.min(W - G - vw, nr.left)), top: top, w: vw });
    });
    var RD = typeof window !== 'undefined' ? window.ReactDOM : null;
    var portal = function (node) { return RD && RD.createPortal && document.body ? RD.createPortal(node, document.body) : node; };
    var closeFocus = function () { setS(POP_CLOSED); if (btnRef.current) btnRef.current.focus(); };
    var box = null;
    if (open && place && place.rule === 'sheet') {
      box = portal(h('div', { ref: boxRef, style: { display: 'contents' }, 'data-offer-info': id },
        h(RefPaperWindow, { card: 'offer-info', label: info.name, testid: 'offer-info', title: info.name, close: closeFocus, body: h(OfferInfoBody, { info: info }) })));
    } else if (open) {
      box = portal(h('div', { id: id, ref: boxRef, role: 'dialog', 'aria-modal': 'false', 'aria-label': info.name, 'data-testid': 'offer-info',
        'data-doc-ground': 'creator', 'data-place': place ? place.rule : 'measuring',
        onMouseEnter: function () { step('enter'); }, onMouseLeave: function () { step('leave'); },
        style: { position: 'fixed', zIndex: 9500, visibility: place ? 'visible' : 'hidden', left: place ? place.left : 0, top: place ? place.top : 0,
          width: place ? place.w : Math.min(360, (document.documentElement.clientWidth || 390) - 16), boxSizing: 'border-box', padding: '12px 14px 12px',
          background: 'var(--doc-paper-raised)', color: 'var(--doc-ink)', border: '1px solid var(--doc-rule)', borderRadius: 8, boxShadow: '0 10px 28px rgba(0,0,0,.22)' } },
        h('div', { 'data-words': 'name', style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, lineHeight: 1.3, letterSpacing: '.04em',
          color: 'var(--doc-ink)', margin: '0 0 6px' } }, info.name),
        h(OfferInfoBody, { info: info })));
    }
    return h(React.Fragment, null,
      h('button', { ref: btnRef, type: 'button', className: 'ib-i', 'data-testid': 'offer-info-i', 'aria-label': 'About ' + info.name,
        'aria-expanded': open ? 'true' : 'false', 'aria-controls': open && !(place && place.rule === 'sheet') ? id : undefined, 'data-pinned': pinned ? '1' : '0',
        onClick: function (e) { e.stopPropagation(); step('click'); }, onMouseEnter: function () { step('enter'); }, onMouseLeave: function () { step('leave'); },
        style: { flex: '0 0 auto', width: 44, height: 44, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 0, padding: 0, cursor: 'pointer', color: pinned ? 'var(--doc-action)' : 'var(--doc-ink-muted)' } },
        h('span', { 'aria-hidden': 'true', style: { width: 22, height: 22, border: '1px solid currentColor', borderRadius: '50%', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', font: 'italic 600 14px/1 var(--font-body)' } }, 'i')),
      box);
  }

  // `inert` (the surfacing hub's spend menu, R-SHC-2 / rider R5): a row the roll cannot afford — the tick is `disabled` +
  // `aria-disabled`, its edge dashed and its words in the muted ink (≥ 4.5:1 on paper), NEVER an opacity (UI_RULES R5).
  // `action` (F-100 THE SURFACING MISSION, D-294 L3 as drawn; ADDENDUM 8 F10): {label, onPress, testid} — a press, not a
  // tick: M7HubLine's hp-quiet button stands in the tick's place ("Reroll", aria "Reroll — <name>"); absent, the tick.
  // `who` / `info` (5h, brief §4/§5): the who tag after the cost chips, and the (i) + its box at the trailing edge — each only
  // where passed (offerWho / offerInfo, null with the key OFF: the row is then byte-identical). A row with a box drops its
  // how-often tag, which the box carries (D-348: "once per …" moves into the box).
  function OfferRow(props) {
    var on = !!props.on, tags = props.tags || [], inert = !!props.inert, act = props.action, info = props.info || null, who = props.who || null;
    if (info && info.howOften) tags = tags.filter(function (t) { return t !== info.howOften; });
    return h('div', { className: 'm8-offer', 'data-m8': 'offer', 'data-offer-key': props.offerKey || '', 'data-inert': inert ? '1' : undefined,
      style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 8 } },
      act ? h('button', { type: 'button', className: 'hp-quiet', 'data-testid': act.testid || undefined, 'aria-label': act.label + ' — ' + props.name,
        onClick: act.onPress, style: { flex: '0 0 auto' } }, act.label) :
      // B-1274: the tick is a CHECKBOX (role + aria-checked), and its EMPTY edge is the ground's structural ink — the kit's
      // own non-text token (creator ground #7A766D: 4.0:1 on the tick's plate, 3.3:1 on the page) where `--doc-rule` read 1.84:1
      h('button', { type: 'button', role: 'checkbox', className: 'm8-tick', 'aria-checked': on ? 'true' : 'false', 'aria-label': (on ? 'Untick ' : 'Tick ') + props.name,
        'data-testid': 'offer-tick', onClick: inert ? undefined : props.onToggle, disabled: inert || undefined, 'aria-disabled': inert ? 'true' : undefined,
        style: { flex: '0 0 auto', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: inert ? 'not-allowed' : 'pointer',
          border: '1px ' + (inert ? 'dashed' : 'solid') + ' ' + (on ? 'var(--doc-action)' : 'var(--doc-ink-structural, var(--doc-rule, rgba(0,0,0,.35)))'),
          background: on ? 'var(--doc-action)' : 'var(--doc-paper-raised)', font: '600 20px/1 var(--font-mono)',
          color: on ? 'var(--doc-paper-raised)' : 'transparent' } }, '✓'),
      h('div', { className: 'm8-ot', style: Object.assign({ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.4, color: inert ? 'var(--doc-ink-muted)' : 'var(--doc-ink)', paddingTop: 2 },
          info ? { flex: '1 1 auto', minWidth: 0 } : null) },
        h('b', { style: { fontWeight: 600 } }, props.name), ' — ', glyphText(props.text),   // R-M8BG-129: a span condition's tokens ("add [BO] or remove [SE]") draw as dice
        props.s3 ? h(OfferS3Line, { s3: props.s3 }) : null,   // S3: the public copy's label and book line
        tags.length || who ? h('div', { className: 'm8-tags', style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 } },
          tags.map(function (t, i) { return h('span', { key: i, className: 'm8-tag', style: OFFER_TAG }, t); }),
          who ? h('span', { key: 'who', className: 'm8-tag', 'data-m8': 'who', style: OFFER_WHO }, who) : null) : null,
        props.cap ? h('div', { className: 'm8-cap', style: { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--doc-ink-muted)', marginTop: 6 } },
          props.capTokens ? h('span', { role: 'img', 'aria-label': props.cap }, glyphText(props.capTokens)) : props.cap) : null),
      info ? h(OfferInfo, { info: info, offerKey: props.offerKey }) : null);
  }

  // ── BACK UP EVERYTHING (card release-r3-no-loss-card §4; the drawing APPROVED in D-258, record 3ae8c4aeb — LAW) ─────
  // ONE screen for both apps (the no-compromise mirror), at /player/backup and /gm/backup, drawn inside the paper
  // Character files shell (B-770's kit: paper.css + files.css; the only new styling is backup.css's .bk-*). The store
  // side is lib/shared/backup.js (window.SWRPGBackup): counts are read live from this device; S3 is computed from the
  // file before anything is written; S4 is the f34 sheet with the restore's words (D-R3NA2); the write is all or nothing.
  // The helper lines are cut to rule text (DECISIONS D-262 @ dd722e20e, under D-259; ruling ADDENDUM 4, R-R3NG-8): no lead
  // line; one rule line under each button; no S4 foot and no S5 sync line. Everything else stands as drawn.
  // props: { maker, band ('mobile'|'tablet'|'desktop'), onBack, backLabel? }
  var BACKUP_COPY = {
    title: 'Back up everything', folio: 'Back up everything',
    here: 'What’s on this device', save: 'Save backup file', empty: 'Nothing to back up yet.',
    small: 'No sign-in or settings.',
    restoreHead: 'Restore from a file', restoreLead: 'Adds what’s missing. Deletes nothing.',
    choose: 'Choose backup file', restore: 'Restore', cancel: 'Cancel',
    saveFailed: 'Couldn’t save the file. Nothing on this device changed.',
    notBackup: 'This file isn’t a Holocron backup.',
    newer: 'This backup was made by a newer version of Holocron. Update this page, then try again.',
    conflictLead: 'This device and the backup file disagree. Nothing has been thrown away — pick which one to keep.',
    conflictRemote: 'The backup file',
  };
  var BACKUP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function backupDate(ms) { var d = new Date(ms); return d.getDate() + ' ' + BACKUP_MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  function BackupScreen(props) {
    var B = window.SWRPGBackup;
    var _d = useState(null), device = _d[0], setDevice = _d[1];
    var _p = useState({ phase: 'idle' }), st = _p[0], setSt = _p[1];
    var fileRef = useRef(null);
    function reread() { return B.readDevice().then(function (d) { setDevice(d); return d; }); }
    useEffect(function () { reread(); }, []);
    var counts = device ? B.counts(device) : null;
    var empty = device ? B.isEmpty(device) : false;

    function save() {
      setSt({ phase: 'busy' });
      B.save().then(function (r) { setSt(r.ok ? { phase: 'saved', name: r.name } : { phase: 'save-failed' }); });
    }
    function choose() { if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); } }
    function picked(e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var r = B.readFile(text);
        if (!r.ok) { setSt({ phase: 'refused', why: r.why }); return; }
        return reread().then(function (d) { setSt({ phase: 'read', plan: B.plan(r.file, d) }); });
      }).catch(function () { setSt({ phase: 'refused', why: 'not-backup' }); });
    }
    function run(plan) {
      setSt({ phase: 'busy', plan: plan });
      B.restore(plan).then(function (r) {
        return reread().then(function () {
          setSt(r.ok ? { phase: 'done', totals: r.totals } : { phase: 'restore-failed' });
        });
      });
    }
    function restore() {
      var plan = st.plan;
      if (plan.conflicts.length) setSt({ phase: 'conflict', plan: plan }); else run(plan);
    }
    function resolve(c, side) {
      var next = B.answer(st.plan, c, side);
      if (next.conflicts.length) setSt({ phase: 'conflict', plan: next }); else run(next);
    }
    function notNow() {
      var plan = st.plan;
      plan.conflicts.slice().forEach(function (c) { plan = B.answer(plan, c, 'local'); });
      run(plan);
    }

    // S3 and S5 show THIS device: before the restore, and after it (re-read live)
    var countsEl = h('div', { className: 'bk-counts' }, B.KINDS.map(function (k) {
      var n = counts ? counts[k[0]] : 0;
      return h('div', { key: k[0], className: 'bk-count', 'data-kind': k[0], 'data-zero': n === 0 ? '1' : undefined }, h('b', null, n), h('span', null, k[1]));
    }));
    var reading = st.phase === 'read' || st.phase === 'conflict' || (st.phase === 'busy' && st.plan);
    var saveDisabled = empty || st.phase === 'busy' || !device;
    var saveBlock = h('div', { className: 'bk-act', 'data-bk': 'save' },
      h('button', { type: 'button', className: 'hp-commit', 'data-role': 'backup-save', disabled: saveDisabled, onClick: save,
        style: empty ? { opacity: 0.45 } : undefined }, BACKUP_COPY.save),
      empty ? h('p', { className: 'bk-said' }, BACKUP_COPY.empty) : null,
      h('p', { className: 'bk-small' }, BACKUP_COPY.small),
      st.phase === 'saved' ? h('p', { className: 'bk-said', 'data-role': 'backup-said' }, 'Saved ' + st.name) : null,
      st.phase === 'save-failed' ? h('p', { className: 'bk-refuse', 'data-role': 'backup-said' }, BACKUP_COPY.saveFailed) : null);

    var restoreBlock;
    if (reading) {
      var plan = st.plan;
      var rowsEl = B.KINDS.filter(function (k) { var r = plan.kinds[k[0]]; return r.adds || r.keeps; }).map(function (k) {
        var r = plan.kinds[k[0]], bits = [];
        if (r.adds) bits.push('adds ' + r.adds);
        if (r.keeps) bits.push('keeps ' + r.keeps + ' as ' + (r.keeps === 1 ? 'it is' : 'they are') + ' here');
        return h('tr', { key: k[0] }, h('td', { className: 'hp-lkey' }, k[1]), h('td', { className: 'hp-lval' }, bits.join(' · ')));
      });
      restoreBlock = h('div', { 'data-bk': 'read' },
        h('p', { className: 'bk-said' }, 'This backup is from ' + backupDate(plan.fileDate)),
        h('table', { className: 'hp-ledger bk-sum' }, h('tbody', { className: 'hp-bands' }, rowsEl)),
        plan.deleted ? h('p', { className: 'bk-small', style: { marginTop: 10 } }, plan.deleted + ' you deleted on this device since the backup won’t come back') : null,
        plan.skipped.length ? h('p', { className: 'bk-small' }, plan.skipped.length + (plan.skipped.length === 1 ? ' part' : ' parts') + ' from a newer version of Holocron will be skipped') : null,
        h('div', { className: 'bk-act bk-pair' },
          h('button', { type: 'button', className: 'hp-commit', 'data-role': 'backup-restore', disabled: st.phase !== 'read', onClick: restore }, BACKUP_COPY.restore),
          h('button', { type: 'button', className: 'hp-quiet', 'data-role': 'backup-cancel', disabled: st.phase !== 'read', onClick: function () { setSt({ phase: 'idle' }); } }, BACKUP_COPY.cancel)));
    } else {
      restoreBlock = h('div', null,
        h('p', { className: 'hp-lead', style: { marginTop: 0 } }, BACKUP_COPY.restoreLead),
        h('div', { className: 'bk-act', 'data-bk': 'restore' },
          st.phase === 'done' ? h('p', { className: 'bk-said', 'data-role': 'backup-said' }, 'Restored. Added ' + st.totals.adds + ', kept ' + st.totals.keeps + ' as they were.') : null,
          st.phase === 'refused' ? h('p', { className: 'bk-refuse', 'data-role': 'backup-said' }, st.why === 'newer' ? BACKUP_COPY.newer : BACKUP_COPY.notBackup) : null,
          st.phase === 'restore-failed' ? h('p', { className: 'bk-refuse', 'data-role': 'backup-said' }, 'Couldn’t restore the file. Nothing on this device changed.') : null,
          h('button', { type: 'button', className: 'hp-quiet', 'data-role': 'backup-choose', onClick: choose }, BACKUP_COPY.choose)));
    }

    var drawn = h(React.Fragment, null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        h('span', { className: 'hp-slash' }, h('i'), h('i'), h('i')), h('div', { className: 'hp-maker' }, props.maker)),
      h('h1', { className: 'hp-desig' }, BACKUP_COPY.title), h('div', { className: 'hp-desig-rule' }),
      h('div', { className: 'hp-sechead' }, h('h2', null, BACKUP_COPY.here)),
      countsEl, saveBlock,
      h('hr', { className: 'hp-hr', style: { marginTop: 26 } }),
      h('div', { className: 'hp-sechead' }, h('h2', null, BACKUP_COPY.restoreHead)),
      restoreBlock,
      h('input', { ref: fileRef, type: 'file', accept: '.json,application/json', 'data-role': 'backup-file', style: { display: 'none' }, onChange: picked }));

    var runhead = h('div', { className: 'hp-runhead' },
      h('button', { type: 'button', 'data-creator-back': '1', 'data-role': 'backup-back', onClick: props.onBack, 'aria-label': 'Back from ' + BACKUP_COPY.title,
        style: { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' } }, h('span', null, props.backLabel || '‹ Back')),
      h('span', { className: 'hp-folio' }, BACKUP_COPY.folio));
    var prompt = st.phase === 'conflict' ? h(ConflictPrompt, { conflicts: st.plan.conflicts, paper: true, onResolve: resolve, onDismiss: notNow,
      lead: BACKUP_COPY.conflictLead, sides: { remote: BACKUP_COPY.conflictRemote }, foot: null }) : null;
    var band = props.band || 'mobile';
    if (band !== 'desktop') {
      return h('div', { className: 'cf-surface', 'data-doc-ground': 'creator', 'data-files-shell': '1', 'data-backup-screen': '1', 'data-band': band },
        h('div', { className: 'hp-sheet hp-phonesheet cf', 'data-doc-ground': 'creator' },
          h('div', { className: 'hp-phonebody' }, runhead, h('hr', { className: 'hp-hr' }), drawn)), prompt);
    }
    return h('div', { className: 'cf-surface', 'data-doc-ground': 'creator', 'data-files-shell': '1', 'data-backup-screen': '1', 'data-band': band },
      h('div', { className: 'hpw-shell' },
        h('div', { className: 'hp-sheet hp-wide', 'data-doc-ground': 'creator' },
          h('div', { className: 'hpw-bar' }, runhead),
          h('div', { className: 'hp-onecol' }, h('div', { className: 'cf-scroll' }, h('div', { className: 'cf-col' }, drawn))))), prompt);
  }

  // ─── THE WHY-SHEET (ruling release-r6-companions-lifts Q2 (a); R-R4D-3) ─────────────────────────────────────────────────
  // Lifted from player/app.jsx as h(...), one definition each, for both hosts; the player binds every name, so its call sites
  // are unchanged. R-M7G-27's "one use, not a shared module" line is retired by that ruling. whySheetLines (the skill reader)
  // stays in the player.
  //
  // F-100 M7 · THE PAPER TAP SHEET (ruling f100-m7-build R-M7G-27: the frames' geometry). Below 1024 px the tree's paper
  // bottom sheet (a scrim, the raised paper rising from the foot, the action rule along its top); at 1024 and up a 420 px
  // panel beside its anchor — below it, so the thing it explains stays in view, above it when it would not fit below. ✕ and
  // Escape close it (capture phase, one press one layer — B-544's rule), the scrim too below 1024; focus goes to ✕ on open
  // and back to the anchor on close (R-M7G-19). Portalled to document.body, as the tree's sheet is (B-557).
  var M7_LINE_STYLE = { fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.5, color: 'var(--doc-ink)', margin: '0 0 8px' };
  var M7_META_STYLE = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '.14em', color: 'var(--doc-ink-muted)', marginBottom: 10, textTransform: 'uppercase' };
  function M7PaperSheet(p) {
    var closeRef = React.useRef(null), panelRef = React.useRef(null);
    var onClose = p.onClose, anchor = p.anchor;
    // at 1024 and up: below the anchor when the panel's MEASURED height fits, else above it, else clamped inside the
    // viewport (the maker's 300 px guess under-reached a picker at 1920×1080 — AS-9, c0489345)
    var _at = React.useState(null), at = _at[0], setAt = _at[1];
    React.useLayoutEffect(function () {
      if (window.innerWidth < 1024 || !panelRef.current) return;
      var a = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { top: 200, bottom: 240 };
      var hgt = panelRef.current.getBoundingClientRect().height, vh = window.innerHeight;
      var top = a.bottom + 8 + hgt <= vh - 8 ? a.bottom + 8 : (a.top - 8 - hgt >= 8 ? a.top - 8 - hgt : Math.max(8, vh - hgt - 8));
      if (!at || Math.abs(at.top - top) > 0.5) setAt({ top: top });
    });
    // B-1825 (ADDENDUM 631): below 1024 the sheet stands over its scrim and holds focus — in to ✕ (its own focus-in,
    // named), Tab kept inside. Declared before the Escape effect, so at close the hold's release runs first and the anchor
    // (R-M7G-19's own target) is focused last. The effect's own ✕ focus stays: it re-runs when `onClose` changes, and its
    // cleanup has just focused the anchor. At 1024 and up there is no scrim and the pointer reaches the page behind
    // (ADDENDUM 633's probe), so no hold: the effect's own focus-in, anchor and Escape are what it keeps.
    var phone = window.innerWidth < 1024;
    useHoldFocus(panelRef, phone, { first: '[data-testid="m7-sheet-close"]' });
    React.useEffect(function () {
      var onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
      document.addEventListener('keydown', onKey, true);
      if (closeRef.current) closeRef.current.focus();
      return function () {
        document.removeEventListener('keydown', onKey, true);
        if (anchor && anchor.isConnected && anchor.focus) anchor.focus();
      };
    }, [onClose, anchor]);
    var panel = { background: 'var(--doc-paper-raised)', borderTop: '3px solid var(--doc-action)', padding: '16px 16px 22px', boxShadow: 'var(--doc-lift)' };
    // `z` (additive, post1-one-number-hub-build C1): the layer, for a sheet raised over a host that stands higher than the
    // page (the dice hub's backdrop is 4000); absent, today's 300 / 301
    var z = p.z != null ? p.z : 300;
    if (phone) Object.assign(panel, { position: 'fixed', zIndex: z + 1, left: 0, bottom: 0, width: '100%', maxHeight: '70vh', overflowY: 'auto' });
    else {
      var a = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 400, top: 200, bottom: 240 };
      Object.assign(panel, { position: 'fixed', zIndex: z, width: 420, left: Math.max(16, Math.min(window.innerWidth - 436, a.left)),
        maxHeight: window.innerHeight - 16, overflowY: 'auto', top: at ? at.top : a.bottom + 8 });
    }
    var body = h('div', { role: 'dialog', ref: panelRef, 'aria-label': p.title, 'data-m7-sheet': p.kind || '1', 'data-testid': p.testid,
        'data-doc-ground': 'creator', onClick: function (e) { e.stopPropagation(); }, style: panel },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 } },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--doc-ink)' } }, p.title),
        h('button', { type: 'button', ref: closeRef, onClick: onClose, 'aria-label': 'Close', 'data-testid': 'm7-sheet-close',
          style: { background: 'none', border: 'none', color: 'var(--doc-ink-muted)', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1, minHeight: 44, minWidth: 44 } }, '✕')),
      p.meta ? h('div', { style: p.metaStyle || M7_META_STYLE, 'data-m7-meta': '1' }, p.meta) : null,
      p.children);
    // B-1210 (card `paper-n7-b1210-scrim-font-card` R-B1210-1/11; DECISIONS D-174): below 1024 the scrim is the kit's
    // `.hp-scrim`, an EMPTY SIBLING of the sheet (route (A)), and the sheet keeps today's box at the bottom edge. The
    // dim is the one paper dim; D-174 amends D-10/D-13's near-black for this sheet.
    return window.ReactDOM.createPortal(phone
      ? h(React.Fragment, null, h('div', { onClick: onClose, className: 'hp-scrim', 'data-m7-scrim': '1', style: { zIndex: z } }), body)
      : body, document.body);
  }

  // THE ONE-NUMBER SHEET (D-248, D-257 · ruling f100-surfacing-sheet-concept ADDENDUM 24/27, R-SSC-1′ (a)–(f); the record
  // Docs/mockups/f100-surfacing-sheet-redraw.html @ 6e95cbfd2). Every derived number stands alone; when the rules moved it,
  // ONE mark after it, ↑ raised / ↓ lowered (D-256 Q1 (a)) — the sign of the printed number less its base (Q-B3 (a): rows
  // that net to 0, or a capped 4 → 4, mark nothing). Pressing the number opens M7PaperSheet with what the number is made of
  // (derivedBecause's `_baseParts`), "What changes it" and its rows in becauseNoteText's words, and the total; no rows →
  // parts and total; no parts → the total alone (D-256).
  function sheetWhyDir(total, base) { var d = (Number(total) || 0) - (Number(base) || 0); return d > 0 ? 'up' : (d < 0 ? 'down' : null); }
  // the mark: in the value's own ink (inherited), hidden from the reader — the press's label carries ", raised"/", lowered"
  function SheetWhyMark(p) {
    return p.dir ? h('span', { 'data-sf-mark': p.dir, 'aria-hidden': 'true', style: { marginLeft: 4, fontSize: '.78em', verticalAlign: '.08em' } }, p.dir === 'up' ? '↑' : '↓') : null;
  }
  // a card stat's mark (Q-B4/Q-B6 (a)): the net of the amounts its why-sheet lists — a talent's change plus each item change
  // ({ from, to }, m8ItemChanges' records) — so the mark sums exactly the lines behind the press, never a second walk
  function sheetWhyNet(extra, changes) { return (Number(extra) || 0) + (changes || []).reduce(function (a, f) { return a + ((Number(f.to) || 0) - (Number(f.from) || 0)); }, 0); }
  function sheetWhyLabel(name, value, dir) { return name + ' ' + value + (dir === 'up' ? ', raised' : (dir === 'down' ? ', lowered' : '')) + ' — show why'; }
  // the press, ON the element that already is the row (role=button, so every data-track / testid stays on its node), ≥ 44 px
  function sheetWhyPress(label, open, isOpen) {
    return { role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog', 'aria-expanded': isOpen ? 'true' : 'false', 'aria-label': label,
      onClick: function (e) { open(e.currentTarget); },
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.currentTarget); } } };
  }
  var SHEET_WHY_PRESS_STYLE = { cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' };
  // the breakdown: `before` [{ head, key, lines }] (the Encumbrance sheet's "Carried"), `partsHead` (its "Limit"), the parts, the
  // head "What changes it" with one line per row when any, "Total N". `whyKey` names the key on the body (data-why-key).
  // `nodes` (additive, post1-one-number-hub-build C2): rows a host already drew (the dice hub's own lines — "Hit: …" in its
  // weight, "(printed)" in its mono), each kept as drawn after the text rows; absent, today's body exactly.
  function SheetWhyBody(p) {
    var head = Object.assign({}, M7_META_STYLE, { marginTop: 14 });
    var parts = p.parts || [], rows = p.rows || [], nodes = p.nodes || [];
    return h('div', { 'data-why-body': '1', 'data-why-key': p.whyKey || undefined },
      (p.before || []).map(function (s, i) { return h(React.Fragment, { key: 'b' + i },
        h('div', { style: head, 'data-why-head': s.key }, s.head),
        s.lines.map(function (t, k) { return h('p', { key: k, style: M7_LINE_STYLE, 'data-why-line': s.key }, t); })); }),
      p.partsHead && parts.length ? h('div', { style: head, 'data-why-head': 'limit' }, p.partsHead) : null,
      parts.map(function (x, i) { return h('p', { key: 'p' + i, style: M7_LINE_STYLE, 'data-why-part': '1' }, x.text); }),
      rows.length || nodes.length ? h('div', { style: head, 'data-why-head': 'changes' }, 'What changes it') : null,
      rows.map(function (t, i) { return h('div', { key: 'r' + i, 'data-why-row': '1' }, h(AppliedLine, null, t)); }),
      nodes.map(function (n, i) { return h('div', { key: 'n' + i, 'data-why-row': '1' }, n); }),
      p.total != null ? h('p', { style: Object.assign({}, M7_LINE_STYLE, { fontWeight: 700, borderTop: '1px solid var(--doc-rule-fine, rgba(0,0,0,.2))', paddingTop: 8, marginTop: 12, marginBottom: 0 }), 'data-why-total': '1' }, p.total) : null);
  }

  // ── THE ONE "WHY THESE NUMBERS" PRESS (post1-one-number-hub-build C1, ruling release-r7-bug-burndown ADDENDUM 642; D-521) ──
  // Lifted from the sheet's SheetStack (`whyButton` + `stackWhy`, R-SSC-1′ (d), D-257) so the sheet and the dice hub draw
  // ONE press (the no-compromise mirror). `useWhyPress()` is a host's open state — ONE sheet open at a time, keyed by the
  // host's own key, with the press that opened it as the sheet's anchor (where focus returns, R-M7G-19). `WhyPress` is the
  // press: the sheet's markup, word for word (hp-quiet, aria-haspopup dialog, aria-expanded, ≥ 44 px, "Why these numbers").
  // `WhySheet` is M7PaperSheet kind "why" for that key, drawn only while open; its body is the caller's (SheetWhyBody).
  // The focus hold (B-1730/B-1825) is M7PaperSheet's own, unchanged.
  function useWhyPress() {
    var _s = React.useState(null), cur = _s[0], set = _s[1];
    var close = React.useCallback(function () { set(null); }, []);
    return { key: cur ? cur.key : null, anchor: cur ? cur.el : null, close: close,
      isOpen: function (k) { return !!cur && cur.key === k; }, open: function (k, el) { set({ key: k, el: el }); } };
  }
  function WhyPress(p) {
    var g = p.group;
    return h('button', { type: 'button', className: 'hp-quiet', 'data-testid': p.testid, 'aria-haspopup': 'dialog',
      'aria-expanded': g.isOpen(p.whyKey) ? 'true' : 'false', style: { minHeight: 44 },
      onClick: function (e) { g.open(p.whyKey, e.currentTarget); } }, 'Why these numbers');
  }
  function WhySheet(p) {
    var g = p.group;
    return g.isOpen(p.whyKey) ? h(M7PaperSheet, { anchor: g.anchor, title: p.title, meta: p.meta, onClose: g.close, kind: 'why', testid: p.testid, z: p.z }, p.children) : null;
  }

  // D-406 item 28 (B-1119): a self-scrolling paper sheet's wash and grain (paper.css, [data-doc-ground="creator"].hp-sheet
  // ::before/::after) follow its whole scroll height. ONE capture-phase scroll listener for both hosts: when such a sheet
  // scrolls, its content's bottom (its children's, so the layers' own height never feeds back) is written to --hp-wash-h.
  function hpWashFollowsScroll(e) {
    var el = e && e.target;
    if (!el || el.nodeType !== 1 || !el.classList || !el.classList.contains('hp-sheet') || el.getAttribute('data-doc-ground') !== 'creator') return;
    var bottom = 0;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) { var b = c.offsetTop + c.offsetHeight; if (b > bottom) bottom = b; }
    var v = Math.max(el.clientHeight, bottom + (parseFloat(getComputedStyle(el).paddingBottom) || 0)) + 'px';
    if (el.style.getPropertyValue('--hp-wash-h') !== v) el.style.setProperty('--hp-wash-h', v);
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('scroll', hpWashFollowsScroll, true);

  window.SWRPGUI = Object.assign(window.SWRPGUI || {}, {
    // ruling release-r6-companions-lifts Q2 (a): the why-sheet, for both hosts
    M7PaperSheet: M7PaperSheet, M7_LINE_STYLE: M7_LINE_STYLE, M7_META_STYLE: M7_META_STYLE,
    SheetWhyMark: SheetWhyMark, SheetWhyBody: SheetWhyBody, sheetWhyDir: sheetWhyDir, sheetWhyNet: sheetWhyNet,
    sheetWhyLabel: sheetWhyLabel, sheetWhyPress: sheetWhyPress, SHEET_WHY_PRESS_STYLE: SHEET_WHY_PRESS_STYLE,
    useWhyPress: useWhyPress, WhyPress: WhyPress, WhySheet: WhySheet,   // post1-one-number-hub-build C1: the ONE press, sheet + hub
    BackupScreen: BackupScreen, BACKUP_COPY: BACKUP_COPY,   // RELEASE R3: the ONE whole-save backup screen, both apps (D-258)
    BookLine: BookLine, BOOK_LINE_STYLE: BOOK_LINE_STYLE,   // S1 (argo-a1-curation ADDENDUM 4): the book line's one look
    OfferRow: OfferRow, offerOf: offerOf, offerEffect: offerEffect, offerTags: offerTags, OfferS3Line: OfferS3Line,
    offerWho: offerWho, offerInfo: offerInfo, offerItemInfo: offerItemInfo, offerInfoOf: offerInfoOf, popoverStep: popoverStep,   // 5h: the who tag, the box, its pure step
    usePopover: usePopover, pushEscape: pushEscape, useEscape: useEscape, holdFocus: holdFocus, useHoldFocus: useHoldFocus, OfferInfo: OfferInfo,   // D-352: the reroll slot draws a talent's (i) by name   // 5h (ADDENDUM 62 F1 (b)): the ONE popover hook and the ONE Esc stack   // F-100 M8 step 3: the ONE offer row
    offerTalentsFor: offerTalentsFor,   // …and the ONE owner's lookup it reads (R-SYC-3, D-SYF2 (a)): hub, why-sheet, Yard seat card
    ToldLine: ToldLine, GearFold: GearFold,   // the told line and the carried-gear fold (yard ADDENDUM 8 Q2 (a)): hub, sheet, Yard
    spendAfford: spendAfford,   // the surfacing hub's spend menu (R-SHC-2): the ONE affordability test ResultsReference reads
    M8_TAG: OFFER_TAG,   // …and its ONE tag look (a cost, a limit, the TOLD row's "not applied": frame F1/F6's .m8-tag)
    appliedLineText: appliedLineText, AppliedLine: AppliedLine, InfoSlot: INFO_SLOT,   // …and the one applied-line sentence (hub + Yard seat card)
    CountStep: CountStep,   // D-291's D1 + / − count (f100-surfacing-force-flip-card ADDENDUM 12 F6 (a)): ONE shared control — Farsight's stacking commit, then the attachments' install count
    glyphText: glyphText,   // R3 Q2a hoist — the ONE [XX]→glyph drawer; consumers never copy it
    Monogram: Monogram,
    toBody: toBody,   // B-1382 (R-B1382-2): the ONE whole-screen portal into document.body (ConflictPrompt, the store's sheets)
    StaleTabBanner: StaleTabBanner,   // F-54 · THIS TAB IS BEHIND (bench + vessels)
    StaleHold: StaleHold,             // F-54 · a held region's controls, recessed + inert (vessel hosts)
    SHEET_PANEL: SHEET_PANEL, LedgerHead: LedgerHead, sheetRamp: sheetRamp,
    DisclosureSection: DisclosureSection,   // R-SL3-2: the ONE expandable-section idiom
    formatActivation: formatActivation, ACTIVATION_LABELS: ACTIVATION_LABELS,
    VersionBeacon: VersionBeacon,
    useActiveSources: useActiveSources,
    ActiveSourcesPanel: ActiveSourcesPanel,
    openActiveSources: openActiveSources,
    // the panel's own idiom, for a group another module renders inside it (the editor's "Your homebrew", R-FILC-7)
    ledgerSectionHead: ledgerSectionHead, platedRow: platedRow, hexA: hexA,
    ManeuversCard: ManeuversCard,
    openManeuversCard: openManeuversCard,
    RecoveryCard: RecoveryCard,
    openRecoveryCard: openRecoveryCard,
    QualityChips: QualityChips,
    CritTableRef: CritTableRef,
    ResultsReference: ResultsReference,
    openResultsReference: openResultsReference,
    SectionHeader: SectionHeader,
    SuiteBar: SuiteBar,
    BottomNav: BottomNav,
    useAutoHideChrome: useAutoHideChrome,
    useEdgeChrome: useEdgeChrome,
    usePrefersReducedMotion: usePrefersReducedMotion,
    SubTabs: SubTabs,
    ModuleMenu: ModuleMenu,
    navIcon: navIcon,
    useBackToClose: useBackToClose,
    makeRouter: makeRouter,
    StatBox: StatBox,
    PrimaryButton: PrimaryButton,
    HubCard: HubCard,
    useSwipeBack: useSwipeBack,
    ffgDicePool: ffgDicePool,
    WIPE_DURATIONS: WIPE_DURATIONS,
    SWIPE_BACK_EDGE_PX: SWIPE_BACK_EDGE_PX,
  });
})();
