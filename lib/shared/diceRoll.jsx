/* lib/shared/diceRoll.jsx
 *
 * Lane B shared FLAT ROLL-PRESENTATION core. Extracted verbatim from
 * lib/dice/diceSurface.jsx (Sheet Lane B, Milestone 1) so the player
 * sheet's dice modal can reuse the SAME flat roll UI the Dice Tutor /
 * HoloDice uses — no parallel reimplementation.
 *
 * Scope: the FLAT (non-cinematic) presentation only —
 *   FlatDie · StepperRow · ResultSymbolRow · BasicResultPanel · RollInterpretation
 * plus the constants + helper web they depend on. The cinematic/shell
 * components (CinematicDie, RollOverlay, PoolStrip, FlatRollScreen, …)
 * STAY in diceSurface.jsx.
 *
 * Load contract:
 *   - Bundled into vendor.js by build.mjs (alongside diceUI.jsx), AFTER
 *     the React bundle so window.React is set, and after each page's
 *     lib/shared/diceEngine.js <script> (window.SWRPGDice) is defined.
 *   - Needs its CSS: lib/shared/diceRoll.css (the classes + keyframes
 *     the moved components render — dice-chrome, result-panel,
 *     collision-*, triumph/despair celebration, slideUpFade, …). Link
 *     it in every page that renders these components.
 *   - Publishes everything onto window.SWRPGDice (see Object.assign at
 *     the bottom): DICE_COLOR, QUICK_ADD_DICE, DICE_BY_KEY,
 *     FACE_SYMBOL_KEY, _diceAudio, the helpers, and the 5 components.
 *   - diceSurface.jsx aliases these back off SWRPG so its remaining
 *     cinematic/shell code is otherwise untouched.
 *
 * Engine refs: some components read SWRPG.SYMBOLS / SWRPG.formatResults
 * at RENDER time — those live in diceEngine.js and are NOT moved here;
 * the `SWRPG.` references are kept as-is on purpose.
 */

(function (global) {
  'use strict';

  var React = global.React;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useCallback = React.useCallback;
  var SWRPG = global.SWRPGDice;
  if (!React || !SWRPG) { if (global.console) console.warn('[diceRoll] React/SWRPGDice missing'); return; }

  // ── Constants ─────────────────────────────────────────────────────

  // Palette (mirrors PROJECT_SNAPSHOT.md visual identity):
  var COLOR = {
    bg: '#000',
    operatorGold: '#F5C842',
    datapadBlue: '#4EAAFF',
    encounterCyan: '#00C8FF',
    fadCream: '#F5ECD7',
    isbRed: '#FF5555',
    strainAmber: '#FFC857',
    fadPurple: '#B080FF',
    mutedText: 'rgba(255, 255, 255, 0.55)',
    bodyText: 'rgba(255, 255, 255, 0.85)',
  };

  // ⭐ CANONICAL DIE-SHAPE ASSET (Jason, 2026-06-24). The `glyph`+`font` here are the
  // BASE shapes for every die across the app — the source of truth the pool builder,
  // pool strip, and DICE KEY legend all render directly. Any other surface that draws a
  // die SHAPE references THESE proportions. `REEL_SHAPE` (the reel) is a *dressed-up*
  // presentation of these same shapes for the prominent rolling animation — it must
  // track this base, not diverge from it.
  var QUICK_ADD_DICE = [
    { key: 'ability',     label: '+1A', color: '#45AD48', glyph: 'k',      font: 'Genesys',     aria: 'Add 1 ability die' },
    { key: 'proficiency', label: '+1P', color: '#FDE600', glyph: 'l',      font: 'Genesys',     aria: 'Add 1 proficiency die' },
    { key: 'boost',       label: '+1B', color: '#80CEC4', glyph: 'j',      font: 'Genesys',     aria: 'Add 1 boost die' },
    { key: 'force',       label: '+1F', color: '#F5ECD7', glyph: '', font: 'SWRPGIcons',  aria: 'Add 1 force die' },
    { key: 'difficulty',  label: '+1D', color: '#A47BC7', glyph: 'k',      font: 'Genesys',     aria: 'Add 1 difficulty die' },
    { key: 'challenge',   label: '+1C', color: '#CC3333', glyph: 'l',      font: 'Genesys',     aria: 'Add 1 challenge die' },
    { key: 'setback',     label: '+1S', color: '#AAAAAA', glyph: 'j',      font: 'Genesys',     aria: 'Add 1 setback die' },
  ];

  // key → the canonical flat-glyph die spec (glyph/font/color). Used by FlatDie.
  var DICE_BY_KEY = {};
  QUICK_ADD_DICE.forEach(function (d) { DICE_BY_KEY[d.key] = d; });

  // Map face shorthand (from diceEngine DIE_FACES) to canonical SYMBOLS
  // table key. s/f/a/h/t/d/l/dk → success/failure/advantage/threat/
  // triumph/despair/light/dark.
  var FACE_SYMBOL_KEY = {
    s:  'success', f:  'failure',
    a:  'advantage', h:  'threat',
    t:  'triumph',   d:  'despair',
    l:  'light',     dk: 'dark',
  };

  // MANDATORY non-exhaustive caveat (charter SOURCE gate) — always on-screen, not buried.
  var INTERP_CAVEAT = 'These aren’t the only options.';

  // Audio bridge. This placeholder object is replaced in-place by
  // diceSurface's useDiceAudio() hook (which reassigns .playSound /
  // .warmAudioContext on this SAME object reference — exported as
  // SWRPG._diceAudio — so BasicResultPanel's celebration sounds pick up
  // the latest enabled state without prop-drilling). Default no-ops so
  // any surface that renders these components without wiring audio (e.g.
  // the sheet modal, later) simply plays no sound.
  var _audio = {
    playSound: function () {},
    warmAudioContext: function () {},
  };

  // ── Helpers ───────────────────────────────────────────────────────

  // Violet chrome steppers, ≥44px touch targets (recon §4a). Die GLYPH colour stays canon (above).
  function stepperBtnStyle() {
    var v = COLOR.fadPurple;
    return {
      background: v + '14',
      border: '1px solid ' + v + '66',
      borderRadius: '8px',
      color: v,
      fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700,
      minWidth: '48px', minHeight: '48px',
      cursor: 'pointer',
      touchAction: 'manipulation',
    };
  }

  // Single SWRPGIcons / Genesys glyph at hero scale. Used by the result
  // panel symbol row so cold visitors actually SEE what they rolled.
  // Reuses the canonical SYMBOLS table from window.SWRPGDice.SYMBOLS.
  //
  // `opts.fill` (D-447; ruling release-r7-bug-burndown ADDENDA 441 item 2, 443): the caller asks for the Force family
  // drawn BY FILL — `true` for the map's own registers, 'white' for the white register. The mark is then drawn by
  // the ONE renderer, `symbolSpan` (lib/shared/diceUI.jsx), at this glyph's own size and glow; this function draws no
  // fill of its own. A key outside the family (and every caller that asks nothing, the reel's die faces among them)
  // keeps the span below, unchanged.
  function symbolGlyph(key, idx, size, opts) {
    var sym = SWRPG.SYMBOLS && SWRPG.SYMBOLS[key];
    if (!sym) return null;
    // size accepts either a number (interpreted as px) or a CSS-value
    // string (e.g., "clamp(28px, 5vh, 40px)") — don't auto-append 'px'
    // when the caller already gave us units.
    var fontSize = (typeof size === 'number') ? (size + 'px') : size;
    if (SWRPG.fontAbsent && SWRPG.fontAbsent()) return SWRPG.dieTag(key, null, key + '-' + idx);   // T3 (ADDENDUM 6)
    if (opts && opts.fill && SWRPG.symbolSpan && SWRPG.FILL_FAMILY && SWRPG.FILL_FAMILY[key]) {
      return SWRPG.symbolSpan(key, key + '-' + idx, null, { fill: opts.fill, cssSized: true,
        style: { fontSize: fontSize, lineHeight: 1, filter: 'drop-shadow(0 0 8px ' + sym.color + '55)' } });
    }
    return h('span', {
      key: key + '-' + idx,
      role: 'img',
      'aria-label': sym.label,
      style: {
        fontFamily: '"' + sym.font + '"',
        fontSize: fontSize,
        color: sym.color,
        lineHeight: 1,
        display: 'inline-block',
        // Subtle drop-shadow keys the symbols off the dark backdrop.
        filter: 'drop-shadow(0 0 8px ' + sym.color + '55)',
      },
    }, sym.char);
  }

  // Per-symbol fly-in side for the cinematic collision moment.
  // Player-side outcomes (success, advantage, triumph) drop in from
  // above where the player dice settled. GM-side (failure, threat,
  // despair) rise up from below where the opposition dice settled.
  // Force pips treat as bottom-origin (cost-side energy from below).
  function symbolSide(key) {
    if (key === 'success' || key === 'advantage' || key === 'triumph') return 'top';
    return 'bottom';
  }

  function netResultGlyphKeys(r) {
    var out = [];
    var push = function (key, n) { for (var i = 0; i < n; i++) out.push(key); };
    if (r.success > 0) push('success', r.success); else if (r.success < 0) push('failure', -r.success);
    if (r.advantage > 0) push('advantage', r.advantage); else if (r.advantage < 0) push('threat', -r.advantage);
    push('triumph', r.triumph || 0);
    push('despair', r.despair || 0);
    push('light', r.light || 0);
    push('dark', r.dark || 0);
    return out;
  }

  // Shared outcome resolution (results-screen-v2 recon §4): ONE source of the headline WORD + colour +
  // result symbols + plain tally, consumed by BOTH the live result panel AND the share card so they
  // always match (no parallel reimpl). Design (recon §3 + Jason's §6 calls):
  //   • big word = pass/fail; 0-net success counts as FAILURE (Jason: RAW-strict, no "A WASH").
  //   • elevate to TRIUMPH / DESPAIR only when the potent symbol AGREES with pass/fail; a potent symbol
  //     on the OPPOSITE outcome stays a flag (shown in the symbol row), not the headline.
  //   • the TALLY (under the word) is the compound qualifier — Success+Threat = SUCCESS / "…, N threat".
  function resolveOutcome(r) {
    var hasCore = false;
    if (r.pool) { ['ability','proficiency','boost','difficulty','challenge','setback'].forEach(function (k) { if ((r.pool[k] || 0) > 0) hasCore = true; }); }
    var hasCtx = hasCore || r.success !== 0 || r.netFailure !== 0 || r.advantage !== 0 || r.netThreat !== 0 || r.triumph > 0 || r.despair > 0;
    var tally = (SWRPG.formatResults && SWRPG.formatResults(r)) || '—';
    var symbols = netResultGlyphKeys(r);
    if (!hasCtx) return { word: 'FORCE', color: COLOR.fadCream, symbols: symbols, tally: tally, force: true };
    var passed = r.success > 0;   // 0-net = failed (Jason)
    var word, color;
    if (r.triumph > 0 && passed)       { word = 'TRIUMPH'; color = '#FDE600'; }
    else if (r.despair > 0 && !passed) { word = 'DESPAIR'; color = '#CC3333'; }
    else if (passed)                   { word = 'SUCCESS'; color = '#45AD48'; }
    else                               { word = 'FAILURE'; color = '#CC3333'; }
    return { word: word, color: color, symbols: symbols, tally: tally, passed: passed, hasTriumph: r.triumph > 0, hasDespair: r.despair > 0 };
  }

  function buildResultSummary(r) {
    // A roll with at least one success/failure-generating die rolled
    // produces a pass/fail verdict per FFG RAW: "if your check generates
    // one or more failure symbols and no successes, the check fails."
    // A pure-Force roll (or empty pool) gets its own treatment — pip
    // counts in the headline, no spurious FAILURE label.
    //
    // Detect "pool had core dice" via r.pool (callers stamp the pool
    // onto the resolved object) rather than tally counts. An all-blanks
    // roll on a real pool produces success=0/netFailure=0 but should
    // still display FAILURE (per RAW), not "NO RESULT".
    var hasCoreContext = false;
    if (r.pool) {
      var coreKeys = ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback'];
      for (var i = 0; i < coreKeys.length; i++) {
        if ((r.pool[coreKeys[i]] || 0) > 0) { hasCoreContext = true; break; }
      }
    }
    var hasSuccessFailureContext = hasCoreContext
      || (r.success !== 0)
      || (r.netFailure !== 0)
      || (r.advantage !== 0)
      || (r.netThreat !== 0)
      || (r.triumph > 0)
      || (r.despair > 0);

    // Per-clause color palette so each part of the headline reads as
    // its own valence — fixes the previous "1 FAILURE · 1 ADVANTAGE"
    // bug where ADVANTAGE got painted ISB-red because the WHOLE string
    // followed the dominant pass/fail color. Now each clause inherits
    // its symbol's canonical color (success/triumph gold-family,
    // failure/despair red-family, advantage canonical green, threat
    // amber). The `color` field at the bottom is kept for legacy
    // callers but `parts` is the source of truth.
    var CLAUSE_COLOR = {
      success:   COLOR.operatorGold,   // #F5C842 — operator gold for primary success
      failure:   COLOR.isbRed,         // #FF5555 — ISB red for primary failure
      advantage: '#45AD48',            // FFG canonical advantage green
      threat:    COLOR.strainAmber,    // #FFC857 — amber for non-failure cost
      triumph:   '#FDE600',            // FFG canonical triumph yellow
      despair:   '#CC3333',            // FFG canonical despair red
      light:     COLOR.fadCream,
      dark:      COLOR.fadPurple,
    };

    var parts = [];
    var color;  // legacy single-color fallback (header border, etc.)

    if (!hasSuccessFailureContext) {
      // Pure-Force roll. Force die never blanks, so light + dark > 0.
      color = COLOR.fadCream;
      if (r.light > 0) parts.push({ text: r.light + ' LIGHT', color: CLAUSE_COLOR.light });
      if (r.dark > 0)  parts.push({ text: r.dark  + ' DARK',  color: CLAUSE_COLOR.dark });
      if (parts.length === 0) parts.push({ text: 'NO RESULT', color: COLOR.mutedText });
      return { parts: parts, detail: null, color: color };
    }

    if (r.success > 0) {
      color = COLOR.operatorGold;
      parts.push({ text: r.success + ' SUCCESS', color: CLAUSE_COLOR.success });
    } else {
      color = COLOR.isbRed;
      if (r.netFailure > 0) parts.push({ text: r.netFailure + ' FAILURE', color: CLAUSE_COLOR.failure });
      else parts.push({ text: 'FAILURE', color: CLAUSE_COLOR.failure });
    }
    if (r.advantage > 0) parts.push({ text: r.advantage + ' ADVANTAGE', color: CLAUSE_COLOR.advantage });
    if (r.netThreat > 0) parts.push({ text: r.netThreat + ' THREAT',    color: CLAUSE_COLOR.threat });
    if (r.triumph > 0)   parts.push({ text: r.triumph   + ' TRIUMPH',   color: CLAUSE_COLOR.triumph });
    if (r.despair > 0)   parts.push({ text: r.despair   + ' DESPAIR',   color: CLAUSE_COLOR.despair });

    var detailBits = [];
    if (r.light > 0) detailBits.push(r.light + ' LIGHT PIP');
    if (r.dark > 0) detailBits.push(r.dark + ' DARK PIP');

    return {
      parts: parts,
      detail: detailBits.length > 0 ? detailBits.join(' · ') : null,
      color: color,
    };
  }

  // Build the applicable interpretation sections from an already-resolved result. No new math.
  function interpSections(r) {
    var out = [];
    var ns = r.success;
    out.push({
      head: ns > 0 ? 'YOU SUCCEEDED' : ns < 0 ? 'YOU FAILED' : 'NO NET SUCCESS',
      color: ns > 0 ? '#45AD48' : ns < 0 ? '#CC3333' : '#AAAAAA',
      lines: [ ns > 0 ? 'Each extra success makes it bigger, in combat +1 damage each.'
        : ns < 0 ? 'The check fails. Extra failures don’t stack.'
        : 'All your successes were canceled — the check fails.' ],
      cite: 'EotE p.23',
    });
    if (r.advantage > 0) out.push({
      head: 'ADVANTAGE — good side-effects', color: '#45AD48',
      anyRoll: ['Recover 1 strain (1 Adv)', 'Add a boost die to an ally’s next check (1–2 Adv)', 'Take an immediate free maneuver (2 Adv)'],
      inFight: ['Inflict a Critical Injury (costs the weapon’s Crit Rating)', 'Activate a weapon quality (cost varies)'],
      cite: 'EotE p.205–215',
    });
    if (r.triumph > 0) out.push({
      head: 'TRIUMPH — a success AND something big', color: '#FDE600',
      lines: ['Trigger any weapon quality, or a Critical Injury regardless of rating.',
        'Or upgrade an ally’s next check (1 Triumph).'],
      cite: 'EotE p.13, p.206',
    });
    if (r.advantage < 0) out.push({
      head: 'THREAT — the GM’s side', color: '#E0A03A',
      anyRoll: ['You suffer 1 strain (1 Threat)', 'A boost die to the enemy, or a setback (2 Threat).'],
      inFight: ['Lose the benefit of a prior maneuver like cover (1 Threat)', 'Fall prone, or an enemy acts (3 Threat)'],
      cite: 'EotE p.207',
    });
    if (r.despair > 0) out.push({
      head: 'DESPAIR — a failure AND something bad', color: '#CC3333',
      lines: ['A weapon jams or runs out of ammo, gear breaks.'],
      cite: 'EotE p.24, p.207',
    });
    if (r.light > 0 || r.dark > 0) out.push({
      head: 'FORCE PIPS', color: '#EEEEEE',
      lines: [
        (r.light > 0 ? ('Light: ' + r.light + ' Force point' + (r.light > 1 ? 's' : '') + ' to spend on your power’s effects. ') : '') +
        (r.dark > 0 ? ('Dark: each pip costs 1 strain + 1 Conflict.') : ''),
      ],
      cite: 'FaD p.279',
    });
    return out;
  }

  // ── Components ─────────────────────────────────────────────────────

  // FlatDie — the unified dice asset (dice-unify-flatglyph): the flat die-SHAPE glyph rendered as a
  // backlit SILHOUETTE (dark body + a colored glow from behind in the die's colour) with the rolled
  // FACE symbols overlaid in front, WHITE (spike: best contrast; shape+colour identity kept by the glow).
  // face = the engine's per-die face object ({s:1,a:1}…) or null/blank = silhouette only. Replaces ReelDie.
  function FlatDie(props) {
    var d = DICE_BY_KEY[props.dieKey];
    if (!d) return null;
    var size = props.size || 60;
    var col = d.color;
    var face = props.face;
    // face symbols (white, a touch bigger; multi-symbol faces shrink to fit).
    // B-11: light/dark is the ONE pair distinguished by ink alone (same glyph) — those two
    // carry the SYMBOLS-table ink; every shape-distinguished symbol keeps the spike's white
    // (contrast call stands where shape carries the meaning). Ruling b11-dark-pip-ink.
    var FACE_INK = '#fff';   // the spike's white, for glyphs and (T3) face words alike
    var symNodes = [];
    if (face) {
      Object.keys(face).forEach(function (key) {
        var symKey = FACE_SYMBOL_KEY[key]; if (!symKey) return;
        var sym = (SWRPG.SYMBOLS && SWRPG.SYMBOLS[symKey]) || null; if (!sym) return;
        var ink = (symKey === 'light' || symKey === 'dark') ? sym.color : FACE_INK;
        for (var i = 0; i < face[key]; i++) symNodes.push({ font: sym.font, char: sym.char, ink: ink });
      });
    }
    if (SWRPG.fontAbsent && SWRPG.fontAbsent()) {
      // T3 (ADDENDUM 6, D-510): without the dice font the die is its word tag, and its face reads as words
      var faceWords = [];
      if (face) Object.keys(face).forEach(function (key) {
        var symKey = FACE_SYMBOL_KEY[key];
        if (symKey && face[key] > 0) faceWords.push(SWRPG.dieWord(symKey, face[key] > 1 ? face[key] : null));
      });
      return h('span', { style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flex: '0 0 auto' } },
        SWRPG.dieTag(props.dieKey, null, 'die', { ink: col, lift: true }),
        faceWords.length ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: '10px', color: FACE_INK, textAlign: 'center' } },
          faceWords.join(' · ')) : null);
    }
    var glyphPx = Math.round(size * (symNodes.length > 1 ? 0.40 : 0.50));   // "a touch bigger" (Jason)
    var g = Math.round(size * 0.13), g2 = Math.round(size * 0.27), g3 = Math.round(size * 0.52);
    return h('span', {
      style: { position: 'relative', display: 'inline-flex', width: size + 'px', height: size + 'px',
        alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' },
    },
      h('span', { 'aria-hidden': 'true', style: {
        fontFamily: '"' + d.font + '"', fontSize: size + 'px', color: '#0c1019', lineHeight: 1,
        textShadow: '0 0 ' + g + 'px ' + col + ', 0 0 ' + g2 + 'px ' + col + ', 0 0 ' + g3 + 'px ' + col + 'CC',
      } }, d.glyph),
      symNodes.length ? h('span', {
        style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' },
      }, symNodes.map(function (s, i) {
        return h('span', { key: i, style: { fontFamily: '"' + s.font + '"', fontSize: glyphPx + 'px', color: s.ink || '#fff', lineHeight: 1 } }, s.char);
      })) : null
    );
  }

  function StepperRow(props) {
    var pool = props.pool;
    var onChange = props.onChange;
    // T2-A (ruling tester2-scope Amendment 1 — fit, don't scroll): `compact` renders the SAME
    // seven steppers as a two-column grid (attack dice | opposition dice — the pool strip's own
    // split) so the whole builder fits a phone viewport above the bottom bar. Die names move to
    // the buttons' aria-labels + the DICE KEY tab (the glyph is the canonical identity —
    // canonical-die-shape-asset); the −/+ buttons KEEP the 48px touch floor. Default (the sheet
    // dice modal + desktop) is unchanged.
    var compact = !!props.compact;

    var words = !!(SWRPG.fontAbsent && SWRPG.fontAbsent());   // T3 (ADDENDUM 6): the die's word tag in place of its glyph

    function stepRow(d, isCompact) {
      var count = pool[d.key] || 0;
      // compact: the die NAME rides as a micro-label under the row (full column width — even
      // PROFICIENCY fits) — permanent, like calculator keys (Jason 2026-07-12: newcomers need
      // the names; no auto-hide training-wheel state, no scrolling).
      var rowCore = h('div', {
        key: isCompact ? 'row' : d.key,
        style: {
          display: 'flex', alignItems: 'center',
          gap: isCompact ? '4px' : '12px', minHeight: '48px',
          justifyContent: isCompact ? 'center' : undefined,
        },
      },
        words ? (isCompact ? null : h('span', { style: { flex: 1, minWidth: 0 } }, SWRPG.dieTag(d.key, null, 'tag', { ink: d.color, lift: true }))) : h('span', {
          style: {
            fontFamily: d.font, fontSize: isCompact ? '22px' : '28px', color: d.color,
            minWidth: isCompact ? '24px' : '32px', textAlign: 'center', lineHeight: 1,
          },
        }, d.glyph),
        isCompact || words ? null : h('span', {
          style: {
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            letterSpacing: '0.16em', color: COLOR.mutedText,
            flex: 1, textTransform: 'uppercase',
          },
        }, d.key),
        h('button', {
          type: 'button',
          onClick: function () { onChange(d.key, count - 1); },
          'aria-label': 'Remove one ' + d.key + ' die',
          style: stepperBtnStyle(),
        }, '−'),
        h('span', {
          style: {
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: isCompact ? '15px' : '18px',
            color: '#fff', minWidth: isCompact ? '22px' : '26px', textAlign: 'center',
          },
        }, String(count)),
        h('button', {
          type: 'button',
          onClick: function () { onChange(d.key, count + 1); },
          'aria-label': 'Add one ' + d.key + ' die',
          style: stepperBtnStyle(),
        }, '+')
      );
      if (!isCompact) return rowCore;
      // T3: compact, the tag stands where the micro-label stands (under the row), so it never sits under a button
      if (words) return h('div', { key: d.key, style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
        rowCore, h('div', { style: { marginTop: '4px' } }, SWRPG.dieTag(d.key, null, 'tag', { ink: d.color, lift: true })));
      return h('div', { key: d.key, style: { display: 'flex', flexDirection: 'column' } },
        rowCore,
        h('div', {
          'aria-hidden': 'true',   // the buttons already carry the name for screen readers
          style: {
            fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.22em',
            color: COLOR.mutedText, textAlign: 'center', textTransform: 'uppercase',
            marginTop: '4px',      // sits centered in the gap between this row's and the next row's buttons
            paddingLeft: '28px',   // glyph cell (24) + gap (4): centers the name on the COUNT
          },
        }, d.key)
      );
    }

    var cardStyle = {
      // violet-premium chrome: accent corner-glow + layered depth (dice glyphs keep canon colour)
      background: 'radial-gradient(120% 150% at 0% 0%, ' + COLOR.fadPurple + '14, transparent 60%), ' +
                  'linear-gradient(160deg, rgba(255,255,255,.045), rgba(255,255,255,.015))',
      border: '1px solid ' + COLOR.fadPurple + '4D',
      borderRadius: '14px',
      boxShadow: 'var(--depth-card, 0 1px 0 rgba(255,255,255,.07) inset, 0 10px 24px rgba(0,0,0,.40))',
      width: '100%', maxWidth: '480px', margin: '0 auto', boxSizing: 'border-box',
    };

    if (compact) {
      var OPPOSITION = { difficulty: true, challenge: true, setback: true };
      var attack = QUICK_ADD_DICE.filter(function (d) { return !OPPOSITION[d.key] && d.key !== 'force'; });
      var opposition = QUICK_ADD_DICE.filter(function (d) { return OPPOSITION[d.key]; });
      var force = QUICK_ADD_DICE.filter(function (d) { return d.key === 'force'; });
      return h('div', {
        role: 'group', 'aria-label': 'Adjust pool',
        className: 'dice-chrome',
        style: Object.assign({}, cardStyle, {
          display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px',
        }),
      },
        h('div', { key: 'cols', style: { display: 'flex', gap: '8px' } },
          h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
            attack.map(function (d) { return stepRow(d, true); })),
          h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
            opposition.map(function (d) { return stepRow(d, true); }))
        ),
        // FORCE centered on its own row — its own die category (neither attack nor opposition),
        // and the two columns stay symmetric 3|3 (Jason 2026-07-12).
        h('div', { key: 'force', style: { display: 'flex', justifyContent: 'center' } },
          force.map(function (d) { return stepRow(d, true); }))
      );
    }

    return h('div', {
      role: 'group', 'aria-label': 'Adjust pool',
      className: 'dice-chrome',
      style: Object.assign({}, cardStyle, {
        display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px',
      }),
    }, QUICK_ADD_DICE.map(function (d) { return stepRow(d, false); }));
  }

  function ResultSymbolRow(props) {
    var r = props.resolved;
    if (!r) return null;
    var size = props.size || 32;
    var collision = !!props.collision;     // opt-in fly-in animation
    var collisionStartMs = props.collisionStartMs || 80;
    var perSymbolStaggerMs = 60;

    var groups = [];
    if (r.success > 0)         groups.push({ key: 'success',   count: r.success });
    else if (r.netFailure > 0) groups.push({ key: 'failure',   count: r.netFailure });
    if (r.advantage > 0)       groups.push({ key: 'advantage', count: r.advantage });
    else if (r.netThreat > 0)  groups.push({ key: 'threat',    count: r.netThreat });
    if (r.triumph > 0)         groups.push({ key: 'triumph',   count: r.triumph });
    if (r.despair > 0)         groups.push({ key: 'despair',   count: r.despair });
    if (r.light > 0)           groups.push({ key: 'light',     count: r.light });
    if (r.dark > 0)            groups.push({ key: 'dark',      count: r.dark });

    if (groups.length === 0) return null;

    var nodes = [];
    groups.forEach(function (g, i) {
      if (i > 0) {
        nodes.push(h('span', {
          key: 'sep-' + i,
          'aria-hidden': 'true',
          style: {
            fontFamily: 'var(--font-mono)', fontSize: '18px',
            color: 'rgba(255,255,255,0.5)', lineHeight: 1,   // B-1572 (ADDENDUM 281): .35 read 3.00:1 on the overlay's black
            margin: '0 2px',
          },
        }, '·'));
      }
      var sym = SWRPG.SYMBOLS && SWRPG.SYMBOLS[g.key];
      var pair = [];
      if (g.count > 1) {
        pair.push(h('span', {
          key: 'n',
          style: {
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '22px', color: sym ? sym.color : '#fff',
            lineHeight: 1,
          },
        }, g.count));
      }
      pair.push(symbolGlyph(g.key, i, size, props.fill ? { fill: props.fill } : null));   // D-447: the roll, by fill
      // Wrapper carries the collision class + per-symbol stagger delay.
      // The pair (count + glyph) flies in together so the number rides
      // with its symbol. Triumph and despair get an additional class
      // hook (triumph-burst / despair-suck) that fires the universal
      // celebration / ominous animations defined in dice.html. Those
      // celebration animations override the collision shorthand, so
      // we deliberately DO NOT apply the inline collision stagger
      // delay to triumph/despair wrappers — otherwise the inline
      // animationDelay (e.g., 200ms) would override the CSS class's
      // celebration delay (e.g., 3200ms for despair) and the
      // animation would fire too early. Triumph/despair symbols
      // appear statically (no fly-in) which is acceptable since their
      // celebration animations are the load-bearing emphasis.
      var wrapStyle = { display: 'flex', alignItems: 'center', gap: '5px' };
      var wrapClass = '';
      var isCelebrationSym = (g.key === 'triumph' || g.key === 'despair');
      if (collision && !isCelebrationSym) {
        var side = symbolSide(g.key);
        wrapClass = (side === 'top') ? 'collision-sym-top' : 'collision-sym-bottom';
        wrapStyle.animationDelay = (collisionStartMs + i * perSymbolStaggerMs) + 'ms';
      }
      if (g.key === 'triumph') wrapClass += ' triumph-burst';
      if (g.key === 'despair') wrapClass += ' despair-suck';
      nodes.push(h('div', {
        key: g.key,
        className: wrapClass.trim(),
        style: wrapStyle,
      }, pair));
    });

    return h('div', {
      'aria-label': 'Rolled symbols',
      style: {
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: '6px', flexWrap: 'wrap',
        padding: '6px 0 12px',
      },
    }, nodes);
  }

  function BasicResultPanel(props) {
    var resolved = props.resolved;
    if (!resolved) return null;

    var summary = buildResultSummary(resolved);
    var outcome = resolveOutcome(resolved);      // shared headline (matches the share card)
    var interpretation = props.interpretation;  // optional string (demo mode)
    var collision = !!props.collision;          // opt-in cinematic collision sequence

    // Border + inset-glow semantics:
    //   • Pure success           → gold border
    //   • Pure failure           → red border (was gold-by-default; fixed)
    //   • Success + despair (B4) → gold border + red inset glow (the win
    //                              survives, but a cost was paid)
    //   • Failure + advantage (B2) → red border + gold inset glow (the
    //                              roll failed, but you still gained
    //                              something — inverse of B4)
    //   • Pure failure + despair  → red border (no positive to highlight)
    //
    // The previous logic only checked despair, so failure-only rolls
    // wrongly got gold borders. Fixed by checking succeeded directly.
    var hasTriumph = resolved.triumph > 0;
    var hasDespair = resolved.despair > 0;
    var hasAdvantage = (resolved.advantage || 0) > 0;
    var succeeded = (resolved.success || 0) > 0;
    var mixedDespair = hasDespair && succeeded;          // Beat 4
    var mixedFailureAdvantage = !succeeded && hasAdvantage && !hasDespair;  // Beat 2
    var borderAccent = succeeded ? COLOR.operatorGold : COLOR.isbRed;
    var bgTint = mixedDespair          ? 'rgba(245, 200, 66, 0.06)'
               : mixedFailureAdvantage ? 'rgba(255, 85, 85, 0.06)'
               : succeeded             ? 'rgba(245, 200, 66, 0.06)'
                                       : 'rgba(255, 85, 85, 0.06)';
    var insetGlow = mixedDespair          ? 'inset 0 0 28px rgba(255, 85, 85, 0.22)'
                  : mixedFailureAdvantage ? 'inset 0 0 28px rgba(245, 200, 66, 0.22)'
                                          : 'none';

    var className = 'result-panel'
      + (hasTriumph ? ' has-triumph' : '')
      + (hasDespair ? ' has-despair' : '');

    // Position the screen-wide triumph/despair overlays so the radial-
    // gradient emanates from the actual symbol's location, not a
    // hardcoded center. In the demo the symbol lands roughly at
    // viewport center, but practice mode's result panel sits in
    // different positions depending on RollOverlay layout. Measure
    // each symbol's rect after mount and write CSS variables to its
    // overlay; the gradient's `circle at var(--source-x) var(--source-y)`
    // anchors to the actual position. Falls back to (50%, 38%) if
    // measurement fails.
    React.useEffect(function () {
      if (!resolved || !collision) return;
      function anchor(overlayCls, symbolCls) {
        var overlay = document.querySelector('.' + overlayCls);
        var symbol  = document.querySelector('.' + symbolCls);
        if (!overlay || !symbol || typeof window === 'undefined') return;
        var r = symbol.getBoundingClientRect();
        var cx = ((r.left + r.right) / 2 / window.innerWidth  * 100).toFixed(1) + '%';
        var cy = ((r.top  + r.bottom) / 2 / window.innerHeight * 100).toFixed(1) + '%';
        overlay.style.setProperty('--source-x', cx);
        overlay.style.setProperty('--source-y', cy);
      }
      if (hasTriumph) anchor('triumph-screen-burst', 'triumph-burst');
      if (hasDespair) anchor('despair-screen-suck',  'despair-suck');

      // Celebration sound triggers. Delays match the CSS animation-delay
      // values in dice.html so audio + visual stay in lockstep:
      //   - Solo despair: +600ms (same as solo triumph)
      //   - Despair paired with triumph: +2200ms (after triumph + 500ms
      //     breath gap)
      // Triumph always fires at +600ms regardless of despair presence.
      // Cleanup clears any pending timers if `resolved` or `collision`
      // changes before the timeout fires (rapid re-roll, beat advance,
      // unmount) — without it, fast successive rolls could queue stale
      // celebration sounds that fire after the panel has moved on.
      var triumphTimer = null;
      var despairTimer = null;
      if (hasTriumph) {
        triumphTimer = setTimeout(function () {
          _audio.playSound('triumph');
        }, 600);
      }
      if (hasDespair) {
        var paired = hasTriumph;
        var delay = paired ? 2200 : 600;
        despairTimer = setTimeout(function () {
          _audio.playSound('despair');
        }, delay);
      }
      return function () {
        if (triumphTimer !== null) clearTimeout(triumphTimer);
        if (despairTimer !== null) clearTimeout(despairTimer);
      };
    // eslint-disable-next-line
    }, [resolved, collision]);

    // In collision mode the symbol row uses larger glyphs scaled to
    // viewport height, the headline + detail + interpretation each
    // animate in via their own keyframes (defined in dice.html), and
    // the panel itself doesn't need a slideUpFade entrance.
    var symbolSize = collision ? 'clamp(28px, 5vh, 40px)' : 36;
    var headlineSize = collision ? 'clamp(16px, 3.5vh, 22px)' : '20px';
    var interpFontSize = collision ? 'clamp(13px, 2vh, 15px)' : '14px';
    var detailFontSize = collision ? 'clamp(10px, 1.6vh, 12px)' : '11px';

    // Screen-wide triumph + despair overlays. Mount as Fragment siblings
    // of the result panel so they're position:fixed at viewport scope.
    // Only render when the corresponding outcome lands. Re-key per
    // resolved value so a fresh roll re-runs the animation.
    return h(React.Fragment, null,
      hasTriumph ? h('div', {
        className: 'triumph-screen-burst',
        'aria-hidden': 'true',
        key: 'triumph-screen',
      }) : null,
      hasDespair ? h('div', {
        className: 'despair-screen-suck',
        'aria-hidden': 'true',
        key: 'despair-screen',
      }) : null,
    h('div', {
      role: 'status', 'aria-live': 'polite',
      className: className,
      style: {
        margin: '20px auto 0',
        maxWidth: collision ? 'min(480px, 92vw)' : '480px',
        padding: collision ? 'clamp(12px, 2vh, 18px) clamp(14px, 3vw, 22px)' : '16px 20px',
        background: bgTint,
        border: '1px solid ' + borderAccent + '44',
        borderLeft: '3px solid ' + borderAccent,
        borderRadius: '6px',
        boxShadow: insetGlow,
        animation: collision ? 'none' : 'slideUpFade 0.32s ease both',
        position: 'relative',
      },
    },
      // Collision flash line at the top edge of the panel — only in
      // collision mode. Anchored to the panel's top so it visually
      // sits at the meeting point between the player and GM dice.
      collision ? h('div', {
        'aria-hidden': 'true',
        className: 'collision-flash',
        style: {
          position: 'absolute',
          top: '-1px', left: '50%',
          width: 'min(420px, 92vw)', height: '2px',
          background: 'linear-gradient(90deg, transparent, ' + COLOR.operatorGold + ', transparent)',
          filter: 'drop-shadow(0 0 8px ' + COLOR.operatorGold + 'AA)',
          transform: 'translate(-50%, 0)',
        },
      }) : null,
      // Share-card composition (results-screen-v2): BIG outcome word → tally directly under (the
      // compound qualifier — Success+Threat reads SUCCESS / "…, N threat" as ONE block, no overflow)
      // → result symbols below. Replaces the old multi-clause flex-wrap headline.
      h('div', {
        className: collision ? 'collision-headline' : null,
        style: {
          fontFamily: 'var(--font-display)', fontWeight: 900,
          // width-based clamp → the big word can never overflow the panel (the old-headline bug)
          fontSize: collision ? 'clamp(28px, 12vw, 54px)' : 'clamp(30px, 11vw, 44px)',
          letterSpacing: '0.04em', color: outcome.color, lineHeight: 1.04,
          textAlign: 'center', maxWidth: '100%',
        },
      }, outcome.word),
      h('div', {
        className: collision ? 'collision-detail' : null,
        style: {
          fontFamily: 'var(--font-body)', fontWeight: 500,
          fontSize: collision ? 'clamp(13px, 2.2vh, 17px)' : '15px',
          color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: '6px',
        },
      }, outcome.tally),
      h('div', { style: { marginTop: collision ? 'clamp(10px, 2vh, 18px)' : '14px' } },
        h(ResultSymbolRow, {
          resolved: resolved,
          size: symbolSize,
          collision: collision,
          collisionStartMs: 80,
        })
      ),
      interpretation ? h('div', {
        className: collision ? 'collision-interpretation' : null,
        style: {
          fontFamily: 'var(--font-body)', fontSize: interpFontSize, lineHeight: 1.55,
          color: COLOR.bodyText, textAlign: 'center',
          marginTop: '14px',
          padding: '12px 0 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontStyle: 'italic',
        },
      }, interpretation) : null
    )
    );  // close React.Fragment
  }

  function RollInterpretation(props) {
    var resolved = props.resolved;
    var _exp = useState(true);   // opted in via the ☰ toggle → default expanded
    var expanded = _exp[0], setExpanded = _exp[1];
    if (!resolved) return null;
    var sections = interpSections(resolved);

    var bullet = function (txt, i) {
      return h('div', { key: i, style: { fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.4,
        color: 'rgba(255,255,255,0.82)', paddingLeft: '12px', textIndent: '-10px' } }, '• ' + txt);
    };
    var subLabel = function (txt) {
      return h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em',
        color: 'rgba(255,255,255,0.4)', margin: '5px 0 2px' } }, txt);
    };

    return h('div', {
      'data-testid': 'roll-interpretation',
      style: {
        maxWidth: 'min(520px, 94vw)', margin: '14px auto 0', textAlign: 'left',
        background: 'radial-gradient(120% 120% at 0% 0%, ' + COLOR.fadPurple + '10, transparent 60%), rgba(255,255,255,0.025)',
        border: '1px solid ' + COLOR.fadPurple + '3D',
        borderRadius: '12px', overflow: 'hidden',
        boxShadow: 'var(--depth-card, 0 1px 0 rgba(255,255,255,.07) inset, 0 10px 24px rgba(0,0,0,.40))',
      },
    },
      h('button', {
        type: 'button',
        onClick: function () { setExpanded(!expanded); },
        'aria-expanded': expanded ? 'true' : 'false',
        style: {
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: COLOR.fadPurple + '14', border: 'none',
          padding: '12px 14px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.16em',
          color: COLOR.fadPurple, touchAction: 'manipulation',
        },
      }, 'WHAT IT MEANS', h('span', { style: { fontSize: '11px' } }, expanded ? '▾' : '▸')),

      expanded ? h('div', { style: { padding: '12px 14px 14px' } },
        sections.map(function (s, i) {
          return h('div', { key: i, style: { marginBottom: '12px' } },
            h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px',
              letterSpacing: '0.06em', color: s.color, marginBottom: '4px' } }, s.head),
            s.lines ? s.lines.map(function (l, j) { return bullet(l, 'l' + j); }) : null,
            s.anyRoll ? h('div', null, subLabel('ON ANY ROLL'), s.anyRoll.map(function (l, j) { return bullet(l, 'a' + j); })) : null,
            s.inFight ? h('div', null, subLabel('IN A FIGHT'), s.inFight.map(function (l, j) { return bullet(l, 'f' + j); })) : null,
            h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.32)', marginTop: '4px' } }, s.cite)
          );
        }),
        // MANDATORY non-exhaustive caveat (charter SOURCE gate) — always on-screen, not buried.
        h('div', {
          'data-testid': 'interp-caveat',
          style: {
            marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.10)',
            fontFamily: 'var(--font-body)', fontSize: '12px', fontStyle: 'italic', lineHeight: 1.4,
            color: 'rgba(255,255,255,0.55)',
          },
        }, INTERP_CAVEAT),
        // M2 demotion (§6.1) — this post-roll panel points INTO the cited spend menu, pre-filled from the
        // roll's net symbols; the reference is the authority (D-RR3), this is just a pre-filled door.
        (function () {
          var UI = window.SWRPGUI;
          var ad = Math.max(0, resolved.advantage || 0);
          var th = Math.max(0, -(resolved.advantage || 0));
          var tr = resolved.triumph || 0, de = resolved.despair || 0;
          if (!UI || !UI.openResultsReference || (ad + th + tr + de) === 0) return null;
          return h('button', {
            type: 'button', 'data-testid': 'spend-this-roll',
            onClick: function () { UI.openResultsReference({ accent: COLOR.fadPurple, initialScene: 'combat', initialTally: { ad: ad, tr: tr, th: th, de: de } }); },
            style: {
              marginTop: '10px', width: '100%', padding: '10px', borderRadius: '10px', cursor: 'pointer',
              background: COLOR.fadPurple + '1A', border: '1px solid ' + COLOR.fadPurple + '66',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.14em', color: COLOR.fadPurple,
            },
          }, 'SPEND THIS ROLL →');
        })()
      ) : null
    );
  }

  // ── Publish onto window.SWRPGDice (diceSurface aliases these back) ──
  // Net-distribution odds for the built pool. Headline %success + a 3-segment
  // bar (success / tie / fail) + triumph/despair badges + net-force when present.
  function OddsReadout(props) {
    var p = SWRPG.probabilities(props.pool);
    if (!p) return null;
    var pct = function (x) { return Math.round(x * 100); };
    var sucW = p.success.chance * 100, failW = p.success.fail * 100;
    var tieW = Math.max(0, 100 - sucW - failW);

    function seg(w, color) {
      if (w <= 0) return null;
      return h('div', { style: { width: w + '%', background: color, height: '100%' } });
    }
    function badge(symKey, chance, color, label) {
      if (!chance) return null;
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 8px', borderRadius: '12px',
          background: color + '1A', border: '1px solid ' + color + '55',
        },
        title: label,
      }, symbolGlyph(symKey, 0, 14), h('span', {
        style: { fontFamily: 'var(--font-mono)', fontSize: '11px', color: color, letterSpacing: '0.06em' },
      }, pct(chance) + '%'));
    }

    return h('div', {
      'data-testid': 'dice-odds', 'aria-label': 'Pool odds',
      style: {
        maxWidth: '380px', margin: '18px auto 0', padding: '14px 16px',
        background: 'radial-gradient(120% 150% at 0% 0%, ' + COLOR.fadPurple + '12, transparent 60%), ' +
                    'linear-gradient(160deg, rgba(255,255,255,.04), rgba(255,255,255,.015))',
        border: '1px solid ' + COLOR.fadPurple + '40',
        borderRadius: '12px',
        boxShadow: 'var(--depth-card, 0 1px 0 rgba(255,255,255,.07) inset, 0 10px 24px rgba(0,0,0,.40))',
      },
    },
      h('div', {
        style: {
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '26px',
          color: COLOR.fadPurple, lineHeight: 1,
        },
      }, pct(p.success.chance) + '%'),
      h('div', {
        style: {
          fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.22em',
          color: COLOR.mutedText, margin: '4px 0 10px',
        },
      }, 'CHANCE OF SUCCESS'),
      // success / tie / fail bar
      h('div', {
        style: {
          display: 'flex', width: '100%', height: '8px', borderRadius: '4px',
          overflow: 'hidden', background: 'rgba(255,255,255,0.06)',
        },
        'aria-hidden': 'true',
      }, seg(sucW, COLOR.operatorGold), seg(tieW, 'rgba(255,255,255,0.18)'), seg(failW, COLOR.isbRed)),
      // badges
      h('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '10px' },
      },
        badge('triumph', p.triumph.chance, COLOR.operatorGold, 'Chance of at least one Triumph'),
        badge('despair', p.despair.chance, COLOR.isbRed, 'Chance of at least one Despair'),
        p.force.hasForce ? badge('light', p.force.lightChance, COLOR.fadCream, 'Chance of net Light pips') : null,
        p.force.hasForce ? badge('dark', p.force.darkChance, COLOR.fadPurple, 'Chance of net Dark pips') : null
      )
    );
  }

  Object.assign(SWRPG, {
    DICE_COLOR: COLOR, QUICK_ADD_DICE: QUICK_ADD_DICE, DICE_BY_KEY: DICE_BY_KEY,
    FACE_SYMBOL_KEY: FACE_SYMBOL_KEY, _diceAudio: _audio,
    stepperBtnStyle: stepperBtnStyle, symbolGlyph: symbolGlyph, symbolSide: symbolSide,
    resolveOutcome: resolveOutcome, buildResultSummary: buildResultSummary,
    INTERP_CAVEAT: INTERP_CAVEAT, interpSections: interpSections,
    FlatDie: FlatDie, StepperRow: StepperRow, ResultSymbolRow: ResultSymbolRow,
    BasicResultPanel: BasicResultPanel, RollInterpretation: RollInterpretation,
    OddsReadout: OddsReadout,
  });

})(typeof window !== 'undefined' ? window : globalThis);
