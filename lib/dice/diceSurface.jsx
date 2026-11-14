/* lib/dice/diceSurface.jsx
 *
 * Standalone narrative-dice landing surface — the /dice route on the
 * commercial deploy. See Docs/SPEC_dice_surface.md for the full design
 * brief. This file owns the component tree; lib/dice/scenarios.js
 * provides the canonical scenario data; lib/shared/{diceEngine,diceUI}
 * provide the engine + symbol primitives.
 *
 * Stage 3 commit 3 scope: PRACTICE MODE only, plus the surface shell
 * (header chrome placeholders + footer placeholder). Demo mode lands
 * in commit 4. Roll choreography lands in commit 5. Result-panel
 * teaching content lands in commit 6. DestinyBar lands in commit 7.
 * Auto-hide chrome lands in commit 8. Audio lands in commit 9.
 *
 * Practice-mode features in scope here:
 *   - Empty pool default with six-die quick-add row (per S3-Q8).
 *   - CLEAR button when pool is non-empty.
 *   - Recent pools (last 5 unique configs in localStorage; one-tap
 *     recall — real ergonomic win for tableside use).
 *   - ROLL button (instant resolve via window.SWRPGDice; no animation
 *     yet — choreography lands in commit 5).
 *   - Result panel with basic symbol-strip + net summary.
 *   - Force section (parallel cream-tinted column on desktop, stacked
 *     below the hero on mobile) with own ROLL THE FORCE button.
 *   - Header (☰ menu placeholder; full menu lands in commit 8).
 *   - Footer (PLAYER DATAPAD / GM HOLOCRON link placeholders; full
 *     conversion treatment lands in commit 10).
 *
 * Output: window.SWRPGDiceSurface = <DiceSurface /> for mount in dice.html.
 */

(function (global) {
  'use strict';

  var React = global.React;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;
  var h = React.createElement;

  // Shared nav-router helpers (vendor.js / window.SWRPGUI, loaded before this bundle) — navigation Phase 2a.
  var useBackToClose = (global.SWRPGUI && global.SWRPGUI.useBackToClose) || function () {};
  var makeRouter = global.SWRPGUI && global.SWRPGUI.makeRouter;
  var navIcon = (global.SWRPGUI && global.SWRPGUI.navIcon) || function () { return null; };

  var SWRPG = global.SWRPGDice;             // engine + UI primitives
  var SCENARIOS_API = global.SWRPGScenarios; // canonical scenario data

  // Lane B: the flat roll-presentation core moved to lib/shared/diceRoll.jsx (window.SWRPGDice).
  // Alias the shared defs so the cinematic/shell code below is otherwise untouched.
  var COLOR = SWRPG.DICE_COLOR, QUICK_ADD_DICE = SWRPG.QUICK_ADD_DICE, DICE_BY_KEY = SWRPG.DICE_BY_KEY,
      FACE_SYMBOL_KEY = SWRPG.FACE_SYMBOL_KEY, _audio = SWRPG._diceAudio,
      stepperBtnStyle = SWRPG.stepperBtnStyle, symbolGlyph = SWRPG.symbolGlyph, symbolSide = SWRPG.symbolSide,
      resolveOutcome = SWRPG.resolveOutcome, buildResultSummary = SWRPG.buildResultSummary,
      INTERP_CAVEAT = SWRPG.INTERP_CAVEAT, interpSections = SWRPG.interpSections,
      FlatDie = SWRPG.FlatDie, StepperRow = SWRPG.StepperRow, ResultSymbolRow = SWRPG.ResultSymbolRow,
      BasicResultPanel = SWRPG.BasicResultPanel, RollInterpretation = SWRPG.RollInterpretation,
      OddsReadout = SWRPG.OddsReadout;

  // ── Constants ─────────────────────────────────────────────────────

  // Match the breakpoint used by player.html / gm.html for mobile vs
  // desktop layout switches (see gm.html:2018 — 768px threshold).
  var MOBILE_BREAKPOINT_PX = 768;

  // (COLOR moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.DICE_COLOR.)

  // Seven die types surfaced by the practice stepper. Force is a player-
  // side die — F&D Force-power checks roll N Force dice where N = the
  // character's Force Rating (typically 1–4 in real play, can climb to
  // 6 across long campaigns). Force renders with the player half in the
  // cinematic and as a dedicated stepper row in the build UI.
  // (QUICK_ADD_DICE — the ⭐ CANONICAL DIE-SHAPE ASSET — moved to lib/shared/diceRoll.jsx, aliased above as SWRPG.QUICK_ADD_DICE.)

  // Player vs GM split for cinematic + PoolStrip rendering. Force is a
  // player-side die (F&D Force-power checks are player rolls). Lookup
  // by key — robust to QUICK_ADD_DICE reordering.
  var PLAYER_DIE_KEYS = ['ability', 'proficiency', 'boost', 'force'];
  var GM_DIE_KEYS = ['difficulty', 'challenge', 'setback'];

  // (DICE_BY_KEY moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.DICE_BY_KEY.)

  var EMPTY_POOL = {
    ability: 0, proficiency: 0, boost: 0,
    difficulty: 0, challenge: 0, setback: 0,
    force: 0,
  };

  // Demo-mode persistence. First visit: shows the scenario; subsequent
  // visits skip straight to practice. Re-running the intro (the Intro bottom-tab / ?intro) clears
  // this flag.
  var INTRO_SEEN_KEY = 'swrpg_dice_intro_seen';

  // PIN UI override (spec §S2-7.3). When set, auto-hide is fully
  // disabled and all chrome stays at opacity 1 indefinitely. Persists
  // per-device. Reduced-motion auto-pins regardless (independent of
  // this flag), and the menu item is hidden when reduced-motion is on.
  var PIN_UI_KEY = 'swrpg_dice_pin_ui';

  // Novel-mechanic callout flags. Each fires exactly once per visitor
  // (cleared on an intro re-run via the Intro bottom-tab / ?intro). Spec §S2-5.2.
  var CALLOUT_FLAGS = {
    mixed:    'swrpg_dice_callout_mixed',
    triumph:  'swrpg_dice_callout_triumph',
    despair:  'swrpg_dice_callout_despair',
    forcePip: 'swrpg_dice_callout_force',
  };
  var CALLOUT_COPY = {
    forcePip: 'LIGHT PIPS FREE. DARK PIPS COST 1 STRAIN, 1 CONFLICT.',
  };
  var CALLOUT_ACCENT = {
    mixed:    '#F5C842',  // operator gold — the conversion moment
    triumph:  '#F5C842',  // operator gold
    despair:  '#FF5555',  // ISB red
    forcePip: '#F5ECD7',  // F&D cream
  };

  // ── localStorage helpers ─────────────────────────────────────────

  function safeRead(key) {
    try { return global.localStorage && global.localStorage.getItem(key); }
    catch (e) { return null; }
  }
  function safeWrite(key, value) {
    try { global.localStorage && global.localStorage.setItem(key, value); }
    catch (e) { /* private mode, quota, etc. — silent no-op */ }
  }

  // ── Novel-mechanic callouts ──────────────────────────────────────
  //
  // Spec §S2-5.2. Each callout fires exactly once per visitor, on the
  // first applicable result. localStorage flag set on display. Multiple
  // callouts may apply to the same roll; we surface the highest-
  // priority unseen one (triumph > despair > force > mixed) so a
  // single roll doesn't dump a tutorial wall.

  function detectApplicableCallouts(resolved) {
    if (!resolved) return [];
    var out = [];
    if (resolved.triumph > 0) out.push('triumph');
    if (resolved.despair > 0) out.push('despair');
    if ((resolved.dark || 0) > 0) out.push('forcePip');
    var isMixed = ((resolved.success > 0) && (resolved.netThreat > 0))
               || ((resolved.netFailure > 0) && (resolved.advantage > 0));
    if (isMixed) out.push('mixed');
    return out;
  }

  // Returns the first callout key that's both applicable AND not yet
  // seen in localStorage. Sets the flag as a side effect when chosen.
  // Pass `peek: true` to check without consuming the flag (used during
  // pre-render so the panel knows what to render before commit).
  function chooseUnseenCallout(resolved, opts) {
    opts = opts || {};
    var candidates = detectApplicableCallouts(resolved);
    for (var i = 0; i < candidates.length; i++) {
      var k = candidates[i];
      if (safeRead(CALLOUT_FLAGS[k]) !== '1') {
        if (!opts.peek) safeWrite(CALLOUT_FLAGS[k], '1');
        return k;
      }
    }
    return null;
  }

  function clearAllCalloutFlags() {
    Object.keys(CALLOUT_FLAGS).forEach(function (k) {
      try { global.localStorage && global.localStorage.removeItem(CALLOUT_FLAGS[k]); }
      catch (e) {}
    });
  }

  function poolKey(pool) {
    // Stable serialization for dedup. Skip force; Force dice are tracked
    // as a separate section, recent-pools is for the core six.
    return [
      pool.ability || 0, pool.proficiency || 0, pool.boost || 0,
      pool.difficulty || 0, pool.challenge || 0, pool.setback || 0,
    ].join('-');
  }
  function poolIsEmpty(pool) {
    return poolKey(pool) === '0-0-0-0-0-0' && (pool.force || 0) === 0;
  }
  function poolHasCore(pool) {
    return poolKey(pool) !== '0-0-0-0-0-0';
  }

  // ── Audio (sound effects for the cinematic) ──────────────────────
  //
  // Five trigger points:
  //   roll-start    — dice scroll begins (subtle whoosh, vol 0.35)
  //   roll-settle   — collision flash / result panel mounts (vol 0.40)
  //   triumph       — fires at +600ms after result mount (vol 0.70)
  //   despair       — fires at +600ms solo OR +2200ms paired (vol 0.70)
  //   destiny       — INVOKE DESTINY tap → light pip launch (vol 0.60)
  //
  // Browser autoplay policy: audio elements preload at page mount but
  // first play() requires a prior user gesture. The first BEGIN tap
  // (or trailer/transition advance) calls warmAudioContext() to wake
  // the audio pipeline; subsequent plays work normally.
  //
  // Default: ON for normal users, OFF for reduced-motion users.
  // localStorage override (AUDIO_ENABLED_KEY) wins over default.
  // Stored value '1' = forced on, '0' = forced off, null = use default.

  var AUDIO_ENABLED_KEY = 'swrpg_dice_audio_enabled';

  // Odds readout visibility (Dice Tutor Lap A, R-DTA-R2). Default OFF — the readout is
  // opt-in via the ☰ menu (research: default to the roller, utility is opt-in not forced).
  var ODDS_VISIBLE_KEY = 'swrpg_dice_odds';

  // RAW roll-interpretation visibility (Dice Tutor Lap B). Default OFF — opt-in via the ☰ menu,
  // sibling of ODDS. Surfaces the "what your roll lets you do" panel on a settled result.
  var INTERPRET_VISIBLE_KEY = 'swrpg_dice_interpret';

  // Absolute paths from site root — Cloudflare rewrites mean relative
  // paths can resolve inconsistently. Direct-fetch each URL during
  // smoke to confirm the file binary is returned (not an HTML page
  // from a wildcard rewrite).
  //
  // `maxDurationMs` caps each sound to its associated animation
  // window. Most user-provided MP3s are longer than the visual moment
  // (auditioned files often run 3-8s for a 1-2s cinematic beat) so we
  // fade-out + pause at maxDurationMs to avoid audio bleeding past
  // its visual cue. Fade duration is fixed at 150ms (the last 150ms
  // of the cap ramps volume to 0). null/undefined = play to natural
  // end (used for genuinely short cues like roll-settle).
  //
  // All caps are null — user has shaped each audio file to match its
  // animation window precisely. Code-side fade-out caps were a safety
  // net for the auditioning phase (when files were 4-8s long against
  // 1-2s animations); now that files are pre-trimmed to their visual
  // windows, applying a forced fade-out would double-fade the file's
  // intentional tail. The code path still handles missing files
  // (silent no-op) and rapid re-plays (cancellable rAF loops).
  //
  // File lengths confirmed 2026-05-06:
  //   roll-settle.mp3:      1.50s — settle + result-mount window for
  //                                  CLEAN SUCCESS rolls (no triumph
  //                                  and no despair). Positive-feeling
  //                                  anchor that matches the gold
  //                                  border treatment of a success
  //                                  result panel.
  //   roll-settle-fail.mp3: 0.94s — settle + result-mount window for
  //                                  CLEAN FAILURE rolls (no triumph
  //                                  and no despair). Negative-feeling
  //                                  anchor that matches the red
  //                                  border treatment of a failure
  //                                  result panel.
  //   triumph-burst.mp3:    1.11s — matches triumph-screen-pulse animation
  //   despair-suck.mp3:     1.81s — matches despair-screen-pulse animation
  //   invoke-destiny.mp3:   1.92s — covers 1400ms pip ascent + ~500ms
  //                                  tail into the dice roll for
  //                                  atmospheric overlap.
  //
  // Settle-sound selection (per BeatStage.handleDieSettle):
  //   - resolved.triumph > 0 OR resolved.despair > 0  → play nothing
  //     (celebration cues at +600ms own the audio space).
  //   - else if resolved.succeeded                    → rollSettle
  //   - else                                          → rollSettleFail
  //
  // rollStart restored 2026-05-08 with new audio file (1.20s,
  // shaped to the visual cinematic's tap → scroll → pre-settle
  // window). Cap of 1300ms is a safety net 100ms past file's
  // natural end; tail is shaped so it ends ~100ms before
  // rollSettle/rollSettleFail fires at ~1400ms post-tap.
  var SOUND_FILES = {
    rollStart:      { src: '/public/audio/dice/roll-start.mp3',       volume: 0.50, maxDurationMs: null },
    rollSettle:     { src: '/public/audio/dice/roll-settle.mp3',      volume: 0.60, maxDurationMs: null },
    rollSettleFail: { src: '/public/audio/dice/roll-settle-fail.mp3', volume: 0.60, maxDurationMs: null },
    triumph:        { src: '/public/audio/dice/triumph-burst.mp3',    volume: 0.70, maxDurationMs: null },
    despair:        { src: '/public/audio/dice/despair-suck.mp3',     volume: 0.88, maxDurationMs: null },
    destinyInvoke:  { src: '/public/audio/dice/invoke-destiny.mp3',   volume: 0.60, maxDurationMs: null },
  };

  // Module-scoped audio API. Only the SOUND ON/OFF toggle in
  // HeaderChrome needs `enabled` reactive state (hence the React hook
  // below). All other components — BeatStage, BasicResultPanel,
  // useRollChoreography, etc — call _audio.playSound() directly to
  // avoid prop-drilling the audio object through 4+ component layers.
  // The hook updates the module reference each render so playSound
  // always reflects the latest enabled state.
  // (The _audio OBJECT itself moved to lib/shared/diceRoll.jsx — aliased
  // above as SWRPG._diceAudio. useDiceAudio() below reassigns .playSound
  // / .warmAudioContext on that SAME object reference, so BasicResultPanel
  // there picks up the live state.)

  function useDiceAudio() {
    var reducedMotion = usePrefersReducedMotion();

    // Initial enabled: localStorage wins; otherwise default off for
    // reduced-motion, on for everyone else.
    var stored = safeRead(AUDIO_ENABLED_KEY);
    var defaultEnabled = !reducedMotion;
    var initialEnabled = stored === '1' ? true
                       : stored === '0' ? false
                       : defaultEnabled;

    var _enabled = useState(initialEnabled);
    var enabled = _enabled[0], setEnabled = _enabled[1];

    // Audio elements preload at first hook mount. File fetches happen
    // immediately; play() is gated by user gesture per browser policy.
    var audioRefs = React.useRef({});
    // Per-key fade-out cancellers. Each playSound() call cancels any
    // prior pending fade for that key so a rapid re-play doesn't
    // result in stale fades muting the new playback.
    var fadeCancellersRef = React.useRef({});
    useEffect(function () {
      if (typeof Audio === 'undefined') return;
      var keys = Object.keys(SOUND_FILES);
      for (var i = 0; i < keys.length; i++) {
        var spec = SOUND_FILES[keys[i]];
        try {
          var a = new Audio(spec.src);
          a.preload = 'auto';
          a.volume = spec.volume;
          audioRefs.current[keys[i]] = a;
        } catch (e) { /* Audio unavailable — silent no-op */ }
      }
    }, []);

    function playSound(key) {
      if (!enabled) return;
      var a = audioRefs.current[key];
      if (!a) return;
      var spec = SOUND_FILES[key];
      // Cancel any prior fade for this key (e.g., rapid re-roll fires
      // rollStart twice within 1500ms — the prior fade loop must abort
      // so it doesn't fight the new play()).
      var priorCanceller = fadeCancellersRef.current[key];
      if (priorCanceller) priorCanceller();
      try {
        a.currentTime = 0;
        a.volume = spec.volume;
        var p = a.play();
        // play() may reject if user-gesture not given yet, or if the
        // file is missing/corrupt. Silently swallow — first user tap
        // unlocks subsequent plays, and a missing file shouldn't
        // break the cinematic.
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }

      // Fade-out + pause if the sound has a maxDurationMs cap.
      // requestAnimationFrame loop runs every frame; once elapsed
      // crosses (maxDurationMs - 150ms) we ramp volume to 0, then
      // pause at maxDurationMs. Cancellable via the closure flag.
      if (typeof spec.maxDurationMs === 'number' && spec.maxDurationMs > 0) {
        scheduleFadeAndPause(key, a, spec.volume, spec.maxDurationMs);
      }
    }

    function scheduleFadeAndPause(key, audio, baseVolume, maxDurationMs) {
      var cancelled = false;
      var startTime = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      var fadeWindowMs = 150;
      var fadeStartMs = Math.max(0, maxDurationMs - fadeWindowMs);

      function step() {
        if (cancelled) return;
        var now = (typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now();
        var elapsed = now - startTime;
        if (elapsed >= maxDurationMs) {
          try {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = baseVolume;
          } catch (e) {}
          fadeCancellersRef.current[key] = null;
          return;
        }
        if (elapsed >= fadeStartMs) {
          var t = (elapsed - fadeStartMs) / fadeWindowMs;
          audio.volume = baseVolume * (1 - t);
        }
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(step);
        } else {
          setTimeout(step, 16);
        }
      }
      fadeCancellersRef.current[key] = function () { cancelled = true; };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(step);
      } else {
        setTimeout(step, 16);
      }
    }

    function toggle() {
      var next = !enabled;
      setEnabled(next);
      safeWrite(AUDIO_ENABLED_KEY, next ? '1' : '0');
      // On mute: cancel any pending fade-out loops (so they don't
      // continue running and reset volume after we pause), then stop
      // any currently-playing audio. Object.keys() iteration matches
      // the established codebase style.
      if (!next) {
        var fadeKeys = Object.keys(fadeCancellersRef.current);
        for (var fi = 0; fi < fadeKeys.length; fi++) {
          var canceller = fadeCancellersRef.current[fadeKeys[fi]];
          if (canceller) canceller();
        }
        fadeCancellersRef.current = {};
        var keys = Object.keys(audioRefs.current);
        for (var i = 0; i < keys.length; i++) {
          var a = audioRefs.current[keys[i]];
          var spec = SOUND_FILES[keys[i]];
          try {
            a.pause();
            a.currentTime = 0;
            // Restore base volume so future re-enables don't start
            // mid-fade-out.
            if (spec) a.volume = spec.volume;
          } catch (e) {}
        }
      }
    }

    // iOS Safari audio-context warmer. Fire a single silent play
    // on the first user gesture (BEGIN tap, trailer advance, etc.) to
    // "wake" the audio pipeline. iOS Safari requires a play() inside a
    // user gesture before subsequent setTimeout-driven plays (triumph,
    // despair, etc.) will succeed.
    //
    // Implementation: play a single tiny silent MP3 instead of
    // touching the real audio files. The previous version called
    // play() on every real Audio element at vol=0 then paused them on
    // promise resolution; that produced audible transients on some
    // browsers (the audio decoder's startup click is briefly audible
    // even at vol=0) which the user perceived as a "roll start"
    // sound. The silent-MP3 approach unlocks the audio context for
    // iOS Safari without ever touching the real sound files, so no
    // transients leak into the cinematic.
    //
    // SILENT_MP3 is a base64-encoded ~0.05s silent MP3 frame (~250
    // bytes). Smaller than fetching a separate file from disk, and
    // self-contained so there's no extra network round-trip.
    var SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

    var warmedRef = React.useRef(false);
    function warmAudioContext() {
      if (warmedRef.current) return;
      warmedRef.current = true;
      if (!enabled) return;
      try {
        var silent = new Audio(SILENT_MP3);
        silent.volume = 0;
        var p = silent.play();
        if (p && p.catch) p.catch(function () {});
        // No need to pause — the silent file ends naturally in ~50ms
        // and gets garbage collected when the local var goes out of
        // scope. Touching it once during the gesture is sufficient
        // for iOS Safari to consider the audio context unlocked.
      } catch (e) {}
    }

    // Update module-scoped API every render so non-prop-drilled
    // callers always invoke the latest closures (which capture the
    // latest `enabled` state). Cheap — function reference assignment.
    _audio.playSound = playSound;
    _audio.warmAudioContext = warmAudioContext;

    return {
      enabled: enabled,
      toggle: toggle,
    };
  }

  // ── Reduced-motion hook ──────────────────────────────────────────

  // Re-pointed to the shared hook (IA lap extraction — SWRPGUI.usePrefersReducedMotion, lib/shared/ui.jsx).
  var usePrefersReducedMotion = window.SWRPGUI.usePrefersReducedMotion;

  // ── Roll choreography hook ───────────────────────────────────────
  // State machine for the cinematic roll cycle:
  //   IDLE → TRANSITIONING_OUT (250ms) → ROLLING (event-driven) →
  //   SETTLING (160ms) → HOLDING → TRANSITIONING_IN (250ms) → IDLE
  //
  // ROLLING duration is no longer fixed — the parent component renders
  // ReelDie components per pool die, each of which scrolls + settles
  // independently. The parent calls notifyAllSettled() once every reel
  // has signaled completion, which advances the choreography to
  // SETTLING (a brief overshoot/glow window), then HOLDING. A safety
  // timer caps the maximum ROLLING duration (3000ms) so a stuck reel
  // never blocks the cycle indefinitely.
  //
  // During TRANSITIONING_OUT/ROLLING/SETTLING/HOLDING, body.dice-rolling
  // is set so chrome dims via CSS. SETTLING also adds body.dice-settling
  // for the brief overshoot glow window.
  //
  // Result panel renders only during HOLDING and TRANSITIONING_IN —
  // the CSS handles fade-in via the panel's slideUpFade keyframe.
  //
  // Reduced-motion mode short-circuits to instant: idle → holding,
  // result renders immediately, ReelDie renders final faces statically,
  // no body class transitions.

  var ROLLING_PHASES = { 'transitioning-out': 1, 'rolling': 1, 'settling': 1, 'holding': 1 };
  var ROLLING_MAX_MS = 3000;
  var SETTLE_HOLD_MS = 160;

  function useRollChoreography() {
    var reducedMotion = usePrefersReducedMotion();
    var _phase = useState('idle');
    var phase = _phase[0], setPhase = _phase[1];
    var timersRef = React.useRef([]);

    function clearTimers() {
      timersRef.current.forEach(function (id) { clearTimeout(id); });
      timersRef.current = [];
    }

    // Body class side effects.
    useEffect(function () {
      var rolling = !!ROLLING_PHASES[phase];
      var settling = phase === 'settling';
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('dice-rolling', rolling);
        document.body.classList.toggle('dice-settling', settling);
      }
    }, [phase]);

    // Cleanup timers + body classes on unmount.
    useEffect(function () {
      return function () {
        clearTimers();
        if (typeof document !== 'undefined') {
          document.body.classList.remove('dice-rolling');
          document.body.classList.remove('dice-settling');
        }
      };
    }, []);

    function startRoll(performRoll) {
      clearTimers();
      // Roll-start sound. Fires at the moment of commitment (the user
      // has just tapped to roll) for both reduced-motion and full-
      // motion paths so the audio cue lands regardless of visual mode.
      // The 1.2s file decays to silence ~100ms before rollSettle would
      // fire at ~1400ms post-tap, avoiding any audio overlap.
      _audio.playSound('rollStart');
      if (reducedMotion) {
        if (typeof performRoll === 'function') performRoll();
        setPhase('holding');
        return;
      }
      setPhase('transitioning-out');
      if (typeof performRoll === 'function') performRoll();
      timersRef.current.push(setTimeout(function () {
        setPhase('rolling');
        // Safety timer — if no notifyAllSettled() within ROLLING_MAX_MS,
        // force-advance so the cycle never deadlocks.
        timersRef.current.push(setTimeout(function () {
          notifyAllSettled();
        }, ROLLING_MAX_MS));
      }, 250));
    }

    // Called by the parent component when every reel has fired its
    // settle callback. Advances ROLLING → SETTLING → HOLDING. Idempotent:
    // a second call (or the safety timer firing late) is a no-op.
    // Functional setter form so a stale closure (e.g., the safety
    // timer firing after a fast all-settled) doesn't double-advance.
    function notifyAllSettled() {
      setPhase(function (prev) {
        if (prev !== 'rolling') return prev;
        // (rollSettle sound moved out of useRollChoreography 2026-05-06.
        // The audio is now gated on the resolved object having NO
        // triumph and NO despair — those celebrations have their own
        // sound cues that should not compete. The choreography hook
        // can't see the resolved state directly, so the gated
        // playSound call lives in BeatStage's handleDieSettle, which
        // is where this notifyAllSettled gets called from.)
        clearTimers();
        timersRef.current.push(setTimeout(function () {
          setPhase('holding');
        }, SETTLE_HOLD_MS));
        return 'settling';
      });
    }

    function endHold(then) {
      clearTimers();
      if (reducedMotion) {
        setPhase('idle');
        if (typeof then === 'function') then();
        return;
      }
      setPhase('transitioning-in');
      timersRef.current.push(setTimeout(function () {
        setPhase('idle');
        if (typeof then === 'function') then();
      }, 250));
    }

    function reset() {
      clearTimers();
      setPhase('idle');
    }

    return {
      phase: phase,
      isRolling: !!ROLLING_PHASES[phase],
      isHolding: phase === 'holding',
      isResultVisible: phase === 'holding' || phase === 'transitioning-in',
      isReelMounted: phase === 'rolling' || phase === 'settling' || phase === 'holding',
      reducedMotion: reducedMotion,
      startRoll: startRoll,
      notifyAllSettled: notifyAllSettled,
      endHold: endHold,
      reset: reset,
    };
  }

  // ── Viewport hook ────────────────────────────────────────────────

  function useIsMobile() {
    var _m = useState(function () {
      return typeof global.matchMedia === 'function'
        ? global.matchMedia('(max-width: ' + (MOBILE_BREAKPOINT_PX - 1) + 'px)').matches
        : false;
    });
    var isMobile = _m[0], setIsMobile = _m[1];
    useEffect(function () {
      if (typeof global.matchMedia !== 'function') return;
      var mq = global.matchMedia('(max-width: ' + (MOBILE_BREAKPOINT_PX - 1) + 'px)');
      function handle(e) { setIsMobile(e.matches); }
      // Both signatures supported (Safari < 14 uses addListener).
      if (mq.addEventListener) mq.addEventListener('change', handle);
      else mq.addListener(handle);
      return function () {
        if (mq.removeEventListener) mq.removeEventListener('change', handle);
        else mq.removeListener(handle);
      };
    }, []);
    return isMobile;
  }

  // ── Auto-hide chrome hook ────────────────────────────────────────
  //
  // Spec §S2-7. Idle (3000ms with no interaction) → fade chrome out.
  // Any interaction (mousemove, pointerdown, keydown, focus) → fade in
  // and reset timer. PIN UI flag in localStorage forces always-visible.
  // Reduced-motion auto-pins (auto-hide disabled regardless of flag).
  // Pause when body.dice-rolling is set (overlay handles its own chrome).
  //
  // Side effect: toggles `body.chrome-hidden`. Elements with class
  // `autohide-chrome` fade based on that body class via shared tokens.css.

  var IDLE_HIDE_MS = 3000;

  // Re-pointed to the shared hook (IA lap extraction — SWRPGUI.useAutoHideChrome, lib/shared/ui.jsx; ONE home).
  // PIN_UI_KEY stays dice-local (the dice PIN-UI toggle); the NPC library passes no pin key.
  function useAutoHideChrome() { return window.SWRPGUI.useAutoHideChrome({ pinKey: PIN_UI_KEY, idleMs: IDLE_HIDE_MS }); }

  // ── Pool icon strip (read-only) ──────────────────────────────────
  // Light wrapper around SWRPGDice.SYMBOLS so the surface renders pool
  // counts inline. SWRPGDice.renderPool exists but is more verbose —
  // ours is tighter for the cinematic hero treatment.
  //
  // Two render modes:
  //   1. Static (no `dieResults` prop) — colored die-shape glyphs from
  //      the Genesys font, used for IDLE pool display + builder.
  //   2. Reel (`dieResults` provided) — each die becomes a viewing
  //      window showing a vertically scrolling strip of result symbols
  //      from the die's actual face distribution. Final cell holds the
  //      rolled face. Drives the cinematic ROLLING/SETTLING/HOLDING
  //      cycle.

  // ── Reel helpers ─────────────────────────────────────────────────

  // (FACE_SYMBOL_KEY moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.FACE_SYMBOL_KEY.)

  // Render one face from the engine's per-die roll output as React
  // children. Multi-symbol faces (success+advantage, threat+threat,
  // etc.) stack their glyphs side-by-side via flex. Blank faces show
  // a dim bullet so the cell isn't visually empty.
  function renderFace(face, glyphSize) {
    glyphSize = glyphSize || 24;
    // Blank face: render nothing. The die silhouette is enough; a placeholder
    // dot read as a symbol the visitor was meant to interpret.
    if (!face || Object.keys(face).length === 0) {
      return null;
    }
    var nodes = [];
    Object.keys(face).forEach(function (key) {
      var count = face[key];
      var symKey = FACE_SYMBOL_KEY[key];
      if (!symKey) return;
      for (var i = 0; i < count; i++) {
        nodes.push(symbolGlyph(symKey, nodes.length, glyphSize));
      }
    });
    return h('div', {
      style: {
        display: 'flex', gap: '1px',
        justifyContent: 'center', alignItems: 'center',
        flexWrap: 'nowrap',
      },
    }, nodes);
  }

  // (FlatDie moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.FlatDie.)

  // CinematicDie — the flat-glyph ROLLING die (dice-unify Phase 2). A FlatDie that TUMBLES (cycles random
  // faces + a subtle transform wobble) then SETTLES to finalFace after `delay`, firing onSettle ONCE — the
  // same contract ReelDie had (the strip's stagger + settle-counter drive the choreography). Reduced-motion
  // (Jason §7.2): a CROSS-FADE reveal — blank silhouette → settled face, NO cycling/translation. Replaces
  // ReelDie. Remount per roll via a `key` that includes rollNonce (state resets, fresh tumble).
  var CDIE_RUN_MS = 540, CDIE_CYCLE_MS = 70;
  function CinematicDie(props) {
    var dieKey = props.dieType;
    var finalFace = props.finalFace || {};
    var delay = props.delay || 0;
    var onSettle = props.onSettle;
    var reducedMotion = !!props.reducedMotion;
    var size = props.size || 34;
    var _face = useState(reducedMotion ? null : pickRandomFace(dieKey));
    var face = _face[0], setFace = _face[1];
    var _settled = useState(false);
    var settled = _settled[0], setSettled = _settled[1];
    useEffect(function () {
      var iv = null, timers = [];
      function land() {
        if (iv) clearInterval(iv);
        setFace(finalFace); setSettled(true);
        if (onSettle) onSettle();
      }
      if (reducedMotion) {
        timers.push(setTimeout(land, delay + 220));   // cross-fade in (opacity via CSS)
      } else {
        iv = setInterval(function () { setFace(pickRandomFace(dieKey)); }, CDIE_CYCLE_MS);
        timers.push(setTimeout(land, delay + CDIE_RUN_MS));
      }
      return function () { if (iv) clearInterval(iv); timers.forEach(clearTimeout); };
    }, []);   // mount-once; the strip remounts via key on a new roll
    return h('span', {
      className: settled ? 'cdie cdie-settled' : 'cdie cdie-rolling',
      style: { display: 'inline-flex', transition: 'opacity .22s ease', opacity: (reducedMotion && !settled) ? 0.15 : 1 },
    }, h(FlatDie, { dieKey: dieKey, face: face, size: size }));
  }

  // Pick a random face from a die type's full face distribution. Used
  // to populate the upper cells of the reel strip — gives the visitor
  // a representative sample of "what this die can do" while it scrolls.
  //
  // ── FENCE: THIS IS COSMETIC ENTROPY AND MUST NEVER SCORE (R-V7S-4) ──────────
  //
  // HOLOTABLE's one-entropy-site law says `diceEngine.roll()` is the ONLY place a scored face
  // comes from, so that one client rolls and every other client scores the SAME faces through
  // the pure `resolve()`. This function also calls Math.random, which makes it look like a
  // second entropy site. It is not, and the distinction is load-bearing:
  //
  //   what this produces  — the blurred faces flickering past WHILE a die is still spinning.
  //                         Frames of an animation. Nothing reads them, nothing adds them up.
  //   what roll() produces— the face the die LANDS on. Scored, fed, and put on the wire.
  //
  // Every caller honours that split, and the third one states it outright:
  //   line ~727   initial pre-settle frame          (`reducedMotion ? null : pickRandomFace(...)`)
  //   line ~741   the scroll interval, pre-settle   (cleared the moment the die settles)
  //   line ~1244  `settled ? die.face : pickRandomFace(die.key)`  ← settled wins, always
  //
  // THE RULE FOR ANYONE EDITING THIS: if a value from here can ever reach `resolve()`, a feed
  // entry, or a wire event, that is the bug — not a style question. Two tables would then see
  // different results for one roll and each would be certain it was right. The executable
  // half of this fence is `test/room_roll_faces.cjs`, which stubs Math.random to THROW across
  // the entire receive-and-score path: the scoring side must never consult a die at all.
  function pickRandomFace(dieType) {
    var faces = SWRPG.DIE_FACES && SWRPG.DIE_FACES[dieType];
    if (!faces || faces.length === 0) return {};
    return faces[Math.floor(Math.random() * faces.length)];
  }

  // Compute per-die start delays for staggered settling. Each die's
  // reel begins scrolling at a per-die offset so they land one at a
  // time. Earlier in `settleOrder` → earlier landing.
  //
  // dieIds: array of '{dieType}-{index}' strings in render order.
  // settleOrder: optional explicit landing order (same id format). If
  //   omitted, falls back to render order (leftmost-first).
  // gapMs: stagger between consecutive landings.
  function computeStaggerDelays(dieIds, settleOrder, gapMs) {
    gapMs = gapMs || 120;
    var indexInOrder = {};
    if (Array.isArray(settleOrder) && settleOrder.length > 0) {
      settleOrder.forEach(function (id, idx) { indexInOrder[id] = idx; });
    }
    var delays = {};
    dieIds.forEach(function (id, idx) {
      var orderIdx = (id in indexInOrder) ? indexInOrder[id] : idx;
      delays[id] = orderIdx * gapMs;
    });
    return delays;
  }

  // Build a player-first settle order from a pool. Player dice (ability,
  // proficiency, boost) settle first; GM dice (difficulty, challenge,
  // setback) settle last. Cinematic framing for the practice-mode roll
  // overlay: the verdict from the opposition lands last. Returns an
  // array of dieIds suitable for the `settleOrder` slot above.
  function buildPlayerFirstSettleOrder(pool) {
    var order = [];
    var playerKeys = ['ability', 'proficiency', 'boost'];
    var gmKeys = ['difficulty', 'challenge', 'setback'];
    playerKeys.forEach(function (k) {
      var n = (pool && pool[k]) || 0;
      for (var i = 0; i < n; i++) order.push(k + '-' + i);
    });
    gmKeys.forEach(function (k) {
      var n = (pool && pool[k]) || 0;
      for (var i = 0; i < n; i++) order.push(k + '-' + i);
    });
    return order;
  }

  // Synthesize per-die faces matching a scripted result. Used when a
  // beat declares scriptedResult but no explicit scriptedFaces — keeps
  // the visual reels consistent with the scripted outcome. Returns an
  // object shaped like the engine's roll() output: `{ ability: [...],
  // proficiency: [...], ... }`.
  //
  // Distribution rules:
  //   - triumph → proficiency die (T face = {s:1, t:1})
  //   - despair → challenge die (D face = {f:1, d:1})
  //   - remaining successes spread across ability dice
  //   - remaining failures spread across difficulty dice
  //   - light/dark pips → force dice
  //   - leftovers fill with blanks
  //
  // Caller is responsible for ensuring the pool has enough dice of each
  // type to absorb the scripted symbols.
  function synthesizeScriptedFaces(pool, scriptedResult) {
    pool = pool || {};
    var sr = scriptedResult || {};
    var out = {};
    ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback', 'force'].forEach(function (t) {
      var n = pool[t] || 0;
      out[t] = [];
      for (var i = 0; i < n; i++) out[t].push({});
    });

    var sNeeded = sr.success || 0;
    var fNeeded = 0;  // computed via raw_s - raw_f = success
    var aNeeded = sr.advantage || 0;
    var hNeeded = 0;
    var tNeeded = sr.triumph || 0;
    var dNeeded = sr.despair || 0;
    var lNeeded = sr.light || 0;
    var dkNeeded = sr.dark || 0;

    // Triumph faces — assign to proficiency dice.
    for (var i = 0; i < tNeeded && i < out.proficiency.length; i++) {
      out.proficiency[i] = { s: 1, t: 1 };
      sNeeded -= 1;  // triumph face contributes 1 success
    }
    // Despair faces — assign to challenge dice.
    for (var j = 0; j < dNeeded && j < out.challenge.length; j++) {
      out.challenge[j] = { f: 1, d: 1 };
      fNeeded += 1;  // despair face contributes 1 failure
    }
    // Net success = raw_s - raw_f. Account for despair-induced failures.
    sNeeded += fNeeded;

    // Spread remaining successes across ability dice (first), then
    // remaining proficiency dice.
    var abilityIdx = 0;
    while (sNeeded > 0 && abilityIdx < out.ability.length) {
      if (sNeeded >= 2) { out.ability[abilityIdx] = { s: 2 }; sNeeded -= 2; }
      else { out.ability[abilityIdx] = { s: 1 }; sNeeded -= 1; }
      abilityIdx += 1;
    }
    var profIdx = tNeeded;  // skip triumph-assigned slots
    while (sNeeded > 0 && profIdx < out.proficiency.length) {
      if (sNeeded >= 2) { out.proficiency[profIdx] = { s: 2 }; sNeeded -= 2; }
      else { out.proficiency[profIdx] = { s: 1 }; sNeeded -= 1; }
      profIdx += 1;
    }

    // Spread advantage across boost dice (first), then remaining ability.
    var boostIdx = 0;
    while (aNeeded > 0 && boostIdx < out.boost.length) {
      out.boost[boostIdx] = { a: 1 }; aNeeded -= 1; boostIdx += 1;
    }
    while (aNeeded > 0 && abilityIdx < out.ability.length) {
      out.ability[abilityIdx] = { a: 1 }; aNeeded -= 1; abilityIdx += 1;
    }

    // Threat across setback (first), then remaining difficulty.
    var setbackIdx = 0;
    while (hNeeded > 0 && setbackIdx < out.setback.length) {
      out.setback[setbackIdx] = { h: 1 }; hNeeded -= 1; setbackIdx += 1;
    }

    // Force pips.
    var forceIdx = 0;
    while ((lNeeded > 0 || dkNeeded > 0) && forceIdx < out.force.length) {
      if (lNeeded > 0) { out.force[forceIdx] = { l: 1 }; lNeeded -= 1; }
      else { out.force[forceIdx] = { dk: 1 }; dkNeeded -= 1; }
      forceIdx += 1;
    }

    return out;
  }

  // ── Trailer slideshow data + helpers ─────────────────────────────
  //
  // Per-slide trailer copy. Order: player-side dice first (the
  // visitor's tools), Force as the conceptual bridge in the middle
  // (neutral, "the current beneath everything"), GM-side dice last
  // (the resistance). This puts Force *between* what the visitor
  // controls and what opposes them, mirroring the Force's RAW
  // position as a player-rolled die that nonetheless represents an
  // external system.
  //
  // Force-at-end is also defensible as a cinematic climax (the "and
  // one more thing" reveal). Don't reorder casually — the player-
  // first / Force-bridge / GM-last sequence is a deliberate design
  // call. See plan for full rationale.
  //
  // Trailer slides — restructured 2026-05-04 from 7 single-die slides
  // to 3 paired counterpart slides + 1 Force solo slide. Pairing
  // matches FFG's canonical mental model (AoR p.19: "Difficulty dice
  // oppose Ability dice"; Beginner Game groups them under POSITIVE
  // DICE / NEGATIVE DICE headers). The vertical-stack layout (player
  // die top, GM die bottom) also mirrors the demo's split-screen, so
  // the trailer doubles as a structural primer for what's about to
  // happen. Force is solo because it's the only die with no
  // counterpart — its asymmetry on slide 4 is the "and one more
  // thing" cinematic reveal.
  //
  // Per pair: shared `image` lede (one cinematic line) + per-die
  // mechanical line under each. Solo Force keeps the original line1
  // (cinematic) + line2 (mechanical) format.
  var DIE_TRAILER_COPY = [
    {
      type: 'pair',
      image: 'Your aptitude meets the obstacle.',
      player: {
        key: 'ability', name: 'ABILITY',
        mech: 'Successes and advantages. Some blank.',
      },
      gm: {
        key: 'difficulty', name: 'DIFFICULTY',
        mech: 'Failures and threats. Some blank.',
      },
    },
    {
      type: 'pair',
      image: 'Training sharpened, opposition trained.',
      player: {
        key: 'proficiency', name: 'PROFICIENCY',
        mech: 'Adds triumph faces. Success that shifts the story.',
      },
      gm: {
        key: 'challenge', name: 'CHALLENGE',
        mech: 'Adds despair faces. Failure that breaks the plan.',
      },
    },
    {
      type: 'pair',
      image: 'Small edges and small frictions.',
      player: {
        key: 'boost', name: 'BOOST',
        mech: 'Only success and advantage. Never a failure.',
      },
      gm: {
        key: 'setback', name: 'SETBACK',
        mech: 'Only failure and threat. Often blank.',
      },
    },
    {
      type: 'solo',
      key: 'force', name: 'FORCE',
      line1: 'The current beneath everything. Serenity on one side, hunger on the other.',
      line2: 'Light pips and dark pips. No success, no failure.',
    },
  ];

  // Returns the unique faces of a die, in render order. Force has no
  // blank so its first unique is a pip face (DK). JSON.stringify is
  // fine for dedupe — face objects are flat {symbol: count} maps.
  // Edge case: Force returns exactly 4 unique faces (DK, DKDK, L, LL)
  // given its [DK, DK, DK, DK, DK, DK, DKDK, L, L, LL, LL, LL]
  // distribution from diceEngine.js DIE_FACES.
  function uniqueDieFaces(dieType) {
    var faces = (SWRPG.DIE_FACES && SWRPG.DIE_FACES[dieType]) || [];
    var seen = {}, unique = [];
    faces.forEach(function (f) {
      var k = JSON.stringify(f);
      if (!seen[k]) { seen[k] = true; unique.push(f); }
    });
    return unique;
  }

  function PoolStrip(props) {
    var pool = props.pool;
    var size = props.size || 28;
    var divider = props.divider !== false;
    // New props for reel mode (commit 5.7).
    var dieResults = props.dieResults;       // raw per-die faces from engine
    var settleOrder = props.settleOrder;     // optional landing order
    var onSettle = props.onSettle;           // per-die settle callback
    var reducedMotion = !!props.reducedMotion;
    var rollNonce = props.rollNonce || 0;    // bump to force reel remount
    // 'both' (default): full pool with VS separator.
    // 'player': ability/proficiency/boost only, no separator.
    // 'gm':     difficulty/challenge/setback only, no separator.
    var side = props.side || 'both';
    // emptyMode controls what to render when there are no dieResults
    // (pre-roll state):
    //   'glyphs' (default): small font-glyph dice — used by PracticeRoller
    //                       build UI to preview the pool the user is
    //                       composing.
    //   'hidden'          : layout-preserving empty placeholder — used by
    //                       BeatStage so the demo's read phase shows ONLY
    //                       narrative text in the center, with empty dice
    //                       slots above and below. The cinematic ReelDie
    //                       variant becomes the sole dice visual when the
    //                       roll begins. See spec §8.7.
    var emptyMode = props.emptyMode || 'glyphs';

    var rolling = !!dieResults;

    // Build a flat list of die instance ids in render order — across the
    // FULL pool, so stagger calc + settle counter line up consistently
    // even when this PoolStrip instance only renders one half (the
    // overlay's player/gm halves both share the same parent counter).
    var allDieIds = [];
    QUICK_ADD_DICE.forEach(function (d) {
      var count = pool[d.key] || 0;
      for (var i = 0; i < count; i++) allDieIds.push(d.key + '-' + i);
    });
    var delays = rolling ? computeStaggerDelays(allDieIds, settleOrder, 130) : {};

    function renderGroup(spec) {
      var nodes = [];
      var words = !rolling && emptyMode !== 'hidden' && SWRPG.fontAbsent && SWRPG.fontAbsent();   // T3 (ADDENDUM 6)
      spec.forEach(function (d) {
        var count = pool[d.key] || 0;
        if (words) {   // without the dice font: the count, then the die, as one word tag
          if (count > 0) nodes.push(SWRPG.dieTag(d.key, count, d.key + '-tag', { ink: d.color, lift: true, className: 'die-glyph' }));
          return;
        }
        for (var i = 0; i < count; i++) {
          var dieId = d.key + '-' + i;
          if (rolling) {
            var faceArr = (dieResults && dieResults[d.key]) || [];
            var finalFace = faceArr[i] || {};
            nodes.push(h(CinematicDie, {
              key: dieId + '-' + rollNonce,
              dieType: d.key,
              finalFace: finalFace,
              delay: delays[dieId] || 0,
              size: size,
              onSettle: onSettle ? function (id) {
                return function () { onSettle(id); };
              }(dieId) : null,
              reducedMotion: reducedMotion,
            }));
          } else if (emptyMode === 'hidden') {
            // Demo's pre-roll state. Render nothing per die — the
            // empty placeholder for the strip as a whole is returned
            // below. The visitor sees only the narrative text in the
            // center slot.
          } else if (d.key === 'force' && SWRPG.symbolSpan) {
            // D-447 rider (ADDENDUM 443): the pool's Force die is drawn by the ONE renderer in the white register
            // (ADDENDUM 441 item 2) — its own cream ink as the stroke, its name and its size kept. No fill is drawn here.
            nodes.push(SWRPG.symbolSpan('force', dieId, null, { fill: SWRPG.FILL_WHITE, cssSized: true, ink: d.color,
              label: d.aria.replace('Add 1 ', ''), className: 'die-glyph',
              style: { fontFamily: d.font, fontSize: size + 'px', lineHeight: 1, padding: '0 2px' } }));
          } else {
            nodes.push(h('span', {
              key: dieId,
              className: 'die-glyph',
              'aria-label': d.aria.replace('Add 1 ', ''),
              style: {
                fontFamily: d.font,
                fontSize: size + 'px',
                color: d.color,
                lineHeight: 1,
                padding: '0 2px',
                display: 'inline-block',
              },
            }, d.glyph));
          }
        }
      });
      return nodes;
    }

    // Lookup by PLAYER_DIE_KEYS / GM_DIE_KEYS (declared near
    // QUICK_ADD_DICE) so reordering the source array doesn't break
    // the split. Force is included in the player half.
    var attackDice = QUICK_ADD_DICE.filter(function (d) { return PLAYER_DIE_KEYS.indexOf(d.key) !== -1; });
    var oppositionDice = QUICK_ADD_DICE.filter(function (d) { return GM_DIE_KEYS.indexOf(d.key) !== -1; });

    var attack = (side === 'gm') ? [] : renderGroup(attackDice);
    var opposition = (side === 'player') ? [] : renderGroup(oppositionDice);

    if (attack.length === 0 && opposition.length === 0) {
      // For half-strip modes the empty case is normal (the other half
      // owns the dice). Render an empty placeholder so layout stays
      // consistent with the populated case.
      if (side !== 'both') {
        return h('div', { className: 'dice-pool-strip', style: { padding: '8px 0' } });
      }
      return h('div', {
        style: {
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
          letterSpacing: '0.18em', color: COLOR.mutedText,
          padding: '8px 0',
        },
      }, 'EMPTY POOL · BUILD ONE BELOW');
    }

    return h('div', {
      className: 'dice-pool-strip',
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', gap: rolling ? '6px' : '4px',
        padding: '8px 0',
      },
    },
      attack,
      // VS separator only in 'both' mode and only when both halves have content.
      (side === 'both' && divider && attack.length > 0 && opposition.length > 0)
        ? h('span', {
            key: 'vs',
            style: {
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
              letterSpacing: '0.22em', color: COLOR.mutedText,
              padding: '0 6px',
            },
          }, 'VS')
        : null,
      opposition
    );
  }

  // ── Quick-add row ────────────────────────────────────────────────

  // (StepperRow + stepperBtnStyle moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.StepperRow / SWRPG.stepperBtnStyle.)


  // ── Result panel (basic — teaching content lands in commit 6) ────

  // (symbolGlyph + symbolSide + ResultSymbolRow moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.symbolGlyph / SWRPG.symbolSide / SWRPG.ResultSymbolRow.)

  // (BasicResultPanel moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.BasicResultPanel.)

  // (resolveOutcome + buildResultSummary moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.resolveOutcome / SWRPG.buildResultSummary. netResultGlyphKeys moved with them.)

  // Odds readout toggle (R-DTA-R2). Module-scoped + localStorage-persisted, default OFF —
  // same shape as useDiceAudio's SOUND toggle.
  function useOddsToggle() {
    var _on = useState(safeRead(ODDS_VISIBLE_KEY) === '1');   // null/'0' → off
    var on = _on[0], setOn = _on[1];
    function toggle() {
      setOn(function (v) { var nv = !v; safeWrite(ODDS_VISIBLE_KEY, nv ? '1' : '0'); return nv; });
    }
    return { enabled: on, toggle: toggle };
  }

  // Roll-interpretation toggle (Lap B) — same shape, default off.
  function useInterpretToggle() {
    var _on = useState(safeRead(INTERPRET_VISIBLE_KEY) === '1');
    var on = _on[0], setOn = _on[1];
    function toggle() {
      setOn(function (v) { var nv = !v; safeWrite(INTERPRET_VISIBLE_KEY, nv ? '1' : '0'); return nv; });
    }
    return { enabled: on, toggle: toggle };
  }

  function DiceSplitLayout(props) {
    return h('div', {
      'aria-label': props.ariaLabel || 'Dice split layout',
      style: Object.assign({
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', alignItems: 'center',
        width: '100%',
        padding: 'clamp(16px, 4vh, 32px) clamp(12px, 4vw, 24px)',
      }, props.style || {}),
    },
      h('section', {
        'aria-label': props.topAriaLabel || 'Player dice',
        style: {
          flex: '1 1 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%',
        },
      }, props.top),
      h('section', {
        'aria-label': props.centerAriaLabel || 'Center',
        style: {
          flex: '0 0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: '100%', maxWidth: 'min(520px, 96vw)',
          minHeight: '60px',
        },
      }, props.center),
      h('section', {
        'aria-label': props.bottomAriaLabel || 'GM dice',
        style: {
          flex: '1 1 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%',
        },
      }, props.bottom)
    );
  }

  // ── Dice Tutor C1: shareable branded result card ─────────────────
  // Composes the roll result on a small offscreen canvas → PNG blob for the native share
  // sheet (the growth loop). Recon dice-tutor-lap-c1-recon. Same-origin fonts only (no
  // canvas taint → toBlob safe). FONT-LOAD GATE is load-bearing: the FFG symbols are an
  // icon font, so we MUST await the fonts before fillText or glyphs draw blank.

  // (netResultGlyphKeys moved to lib/shared/diceRoll.jsx with resolveOutcome.)

  // (SHARE / C1 result-card REMOVED — dice-unify-flatglyph Phase 1: the live flat-glyph result is
  // screenshot-worthy on its own; composeResultCard/drawGlyphRow/GLYPH_SCALE/handleShare/shareFile deleted,
  // smoke_dice_tutor_c1 retired. resolveOutcome stays the single outcome source for the live result.)

  // (INTERP_CAVEAT + interpSections + RollInterpretation moved to lib/shared/diceRoll.jsx — aliased above as SWRPG.INTERP_CAVEAT / SWRPG.interpSections / SWRPG.RollInterpretation.)

  // FlatRollScreen — Phase 1 unified flat-glyph roll result (replaces the practice reels + boxed panel).
  // The rolled dice as FlatDie (backlit silhouettes showing their faces) + the resolveOutcome composition
  // (eyebrow → dice → big word + tally → net symbols), minimal: no box, no reels, no share, no brand.
  // While ROLLING the dice tumble random faces; settled → faces + the composition reveal. Reduced-motion:
  // no tumble → an opacity cross-fade to the result (no vestibular motion).
  function FlatRollScreen(props) {
    var pool = props.pool, dieResults = props.dieResults, resolved = props.resolved;
    var settled = props.settled, reducedMotion = props.reducedMotion, interpretVisible = props.interpretVisible;
    var _tick = useState(0), setTick = _tick[1];
    useEffect(function () {
      if (settled || reducedMotion) return;
      var iv = setInterval(function () { setTick(function (x) { return x + 1; }); }, 90);
      return function () { clearInterval(iv); };
    }, [settled, reducedMotion]);

    var dice = [];
    QUICK_ADD_DICE.forEach(function (d) {
      var n = pool[d.key] || 0;
      var faces = (dieResults && dieResults[d.key]) || [];
      for (var i = 0; i < n; i++) dice.push({ key: d.key, face: faces[i] || null, id: d.key + i });
    });
    var outcome = settled ? resolveOutcome(resolved) : null;
    var diceRevealAnim = reducedMotion ? 'fadeIn .5s ease both' : 'slideUpFade .5s cubic-bezier(.2,.7,.3,1) both';

    return h('div', {
      role: 'status', 'aria-live': 'polite',
      style: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: 'max(64px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom))',
      },
    },
      settled ? h('div', { style: {
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.30em',
        color: COLOR.fadPurple + 'CC', marginBottom: '20px', animation: 'fadeIn .4s ease both',
      } }, 'NARRATIVE DICE') : null,
      h('div', { style: {
        display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', alignItems: 'center',
        maxWidth: '92vw', marginBottom: settled ? '26px' : '0',
        animation: settled ? diceRevealAnim : 'none',
      } },
        dice.map(function (die) {
          var f = settled ? die.face : (reducedMotion ? null : pickRandomFace(die.key));
          return h(FlatDie, { key: die.id, dieKey: die.key, face: f, size: 58 });
        })
      ),
      settled ? h('div', { style: { animation: 'fadeIn .5s ease .12s both' } },
        h('div', { style: {
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(30px, 12vw, 54px)',
          letterSpacing: '0.04em', color: outcome.color, lineHeight: 1.04, maxWidth: '100%',
        } }, outcome.word),
        h('div', { style: {
          fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 'var(--fs-lg)',
          color: 'rgba(255,255,255,.85)', marginTop: '6px',
        } }, outcome.tally),
        h('div', { style: { marginTop: '16px', display: 'flex', justifyContent: 'center' } },
          // D-447 + D-451: the roll draws the Force family by fill, its light side in the white register the Dice Key and
          // the feed card use (one register, chosen by the caller; dark stays solid)
          h(ResultSymbolRow, { resolved: resolved, size: 'clamp(28px, 6vw, 38px)', collision: false, fill: SWRPG.FILL_WHITE })),
        interpretVisible ? h(RollInterpretation, { resolved: resolved }) : null
      ) : null
    );
  }

  function RollOverlay(props) {
    var pool = props.pool;
    var dieResults = props.dieResults;
    var resolved = props.resolved;
    var reducedMotion = !!props.reducedMotion;
    var onDismiss = props.onDismiss;

    var choreo = useRollChoreography();
    var _dismissing = useState(false);
    var dismissing = _dismissing[0], setDismissing = _dismissing[1];

    // Drive the choreography on mount; settle on a TIMER (the flat-glyph roll has no per-reel settle
    // callbacks). startRoll → ROLLING → (after the tumble) notifyAllSettled → HOLDING. Reduced-motion
    // tumble is brief (cross-fade reveal, not a long animation).
    useEffect(function () {
      choreo.startRoll(function () { /* roll already computed by the parent */ });
      var tumbleMs = reducedMotion ? 280 : 1050;
      var t = setTimeout(function () { choreo.notifyAllSettled(); }, tumbleMs);
      return function () { clearTimeout(t); };
    // eslint-disable-next-line
    }, []);

    function handleDismiss() {
      if (dismissing) return;
      setDismissing(true);
      setTimeout(function () { if (typeof onDismiss === 'function') onDismiss(); }, 220);
    }

    return h('div', {
      className: 'roll-overlay' + (dismissing ? ' dismissing' : ''),
      role: 'dialog', 'aria-label': 'Dice roll in progress',
      style: {
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        overflowY: 'auto',
      },
    },
      // NEXT ROLL (top-right, visible once HOLDING). The only chrome — no SHARE.
      h('button', {
        type: 'button', onClick: handleDismiss,
        'aria-label': 'Dismiss roll and return to build',
        className: 'next-roll-btn' + (choreo.isHolding ? ' visible' : ''),
        style: {
          position: 'absolute', top: 'clamp(12px, 2vh, 24px)', right: 'clamp(12px, 3vw, 24px)', zIndex: 2,
          // B-1572 (ADDENDUM 283): the same purple, more solid (was AA→55, painted min 1.69) so the black ink reads >= 4.5:1.
          background: 'linear-gradient(135deg, ' + COLOR.fadPurple + 'E6, ' + COLOR.fadPurple + 'CC)',
          border: '1px solid ' + COLOR.fadPurple + 'CC', borderRadius: '8px', color: '#000',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.20em',
          padding: '10px 18px', minHeight: '44px', cursor: 'pointer', touchAction: 'manipulation',
          boxShadow: '0 0 12px ' + COLOR.fadPurple + '44',
        },
      }, 'NEXT ROLL →'),
      h(FlatRollScreen, {
        pool: pool, dieResults: dieResults, resolved: resolved,
        settled: choreo.isResultVisible, reducedMotion: reducedMotion,
        interpretVisible: props.interpretVisible,
      })
    );
  }

  // ── Dice Tutor Lap A: odds readout + reference legend ────────────
  // Both are mechanical (no RAW interpretation — that's Lap B). The readout
  // reads exact odds from SWRPG.probabilities(pool); the legend reuses the
  // existing SWRPGIcons glyphs (symbolGlyph) — no net-new art.

  var DIE_META = {};   // key -> {name, color} from QUICK_ADD_DICE
  QUICK_ADD_DICE.forEach(function (d) {
    var names = { ability: 'Ability', proficiency: 'Proficiency', boost: 'Boost',
      difficulty: 'Difficulty', challenge: 'Challenge', setback: 'Setback', force: 'Force' };
    DIE_META[d.key] = { name: names[d.key] || d.key, color: d.color };
  });


  // Symbol literacy + which die rolls what. Mechanical only (Lap A fence).
  var SYM_MEANINGS = [
    ['success', 'counts toward passing the check'],
    ['failure', 'counts against passing'],
    ['advantage', 'a positive side-effect'],
    ['threat', 'a negative side-effect'],
    ['triumph', 'extraordinary success (also counts as a success)'],
    ['despair', 'dire failure (also counts as a failure)'],
    ['light', 'a Light Side Force pip'],
    ['dark', 'a Dark Side Force pip'],
  ];
  function dieSymbolKeys(dieType) {
    var faces = (SWRPG.DIE_FACES && SWRPG.DIE_FACES[dieType]) || [];
    var seen = {}, order = [];
    faces.forEach(function (f) {
      Object.keys(f).forEach(function (k) {
        var sk = FACE_SYMBOL_KEY[k];
        if (sk && !seen[sk]) { seen[sk] = 1; order.push(sk); }
      });
    });
    return order;
  }

  // Summon-and-hide reference overlay. Tap the backdrop or CLOSE to dismiss.
  function DiceReference(props) {
    var onClose = props.onClose;
    var stop = function (e) { e.stopPropagation(); };
    var row = function (children, key) {
      return h('div', {
        key: key,
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)' },
      }, children);
    };
    return h('div', {
      onClick: onClose, role: 'dialog', 'aria-label': 'Dice reference',
      'data-testid': 'dice-reference',
      style: {
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      },
    },
      h('div', {
        onClick: stop,
        style: {
          // D4: a vertical, scrollable modal keeps its scroll cue (a11y floor) — `scrollbarWidth:
          // 'none'` removed below. A panel that can scroll past 86vh and shows no bar reads as
          // complete when it is not.
          maxWidth: '440px', width: '100%', maxHeight: '86vh', overflowY: 'auto',
          background: 'radial-gradient(110% 80% at 0% 0%, ' + COLOR.fadPurple + '12, transparent 55%), #0A0A0C',
          border: '1px solid ' + COLOR.fadPurple + '45',
          borderRadius: '14px', padding: '18px 18px 14px',
          boxShadow: 'var(--depth-card, 0 1px 0 rgba(255,255,255,.07) inset, 0 10px 24px rgba(0,0,0,.40))',
        },
      },
        h('div', {
          style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)',
            letterSpacing: '0.10em', color: '#fff', marginBottom: '12px' },
        }, 'DICE KEY'),

        h('div', {
          style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.20em',
            color: COLOR.mutedText, margin: '4px 0 6px' },
        }, 'SYMBOLS'),
        SYM_MEANINGS.map(function (m, i) {
          return row([
            h('span', { key: 'g', style: { width: '24px', textAlign: 'center', flex: '0 0 auto' } }, symbolGlyph(m[0], 0, 18, { fill: SWRPG.FILL_WHITE })),   // D-447 rider: the Dice Key's light side, filled white
            h('span', { key: 't', style: { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)', color: COLOR.bodyText } },
              h('strong', { style: { color: '#fff', textTransform: 'capitalize' } }, m[0]), ' — ' + m[1]),
          ], 's' + i);
        }),

        h('div', {
          style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.20em',
            color: COLOR.mutedText, margin: '14px 0 6px' },
        }, 'DICE'),
        QUICK_ADD_DICE.map(function (d, i) {
          var meta = DIE_META[d.key];
          // R-DTA-R1 (refined): the swatch is the SAME font-glyph die icon the pool-builder +
          // pool-strip render (QUICK_ADD_DICE d.glyph/d.font) — so the reference matches exactly
          // what the user builds with. (The builder uses Genesys glyphs, NOT REEL_SHAPE clip-paths;
          // reusing the builder's own icon source keeps one representation, no second table.)
          var noFont = SWRPG.fontAbsent && SWRPG.fontAbsent();   // T3 (ADDENDUM 6): the tag names the die
          return row([
            noFont ? h('span', { key: 'sw', style: { flex: '0 0 auto', minWidth: '114px' } }, SWRPG.dieTag(d.key, null, 'tag', { ink: meta.color, lift: true })) : h('span', {
              key: 'sw', 'aria-hidden': 'true',
              style: {
                fontFamily: d.font, fontSize: 'var(--fs-2xl)', color: meta.color,
                flex: '0 0 auto', width: '26px', textAlign: 'center', lineHeight: 1,
              },
            }, d.glyph),
            noFont ? null : h('span', { key: 'nm', style: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-lg)',
              color: '#fff', flex: '0 0 auto', minWidth: '88px' } }, meta.name),
            h('span', { key: 'gl', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              dieSymbolKeys(d.key).map(function (sk, j) { return symbolGlyph(sk, j, 16, { fill: SWRPG.FILL_WHITE }); })),
          ], 'd' + i);
        }),

        h('button', {
          type: 'button', onClick: onClose,
          style: {
            marginTop: '14px', width: '100%', minHeight: '48px',
            background: COLOR.fadPurple + '14', border: '1px solid ' + COLOR.fadPurple + '55',
            borderRadius: '8px', color: COLOR.fadPurple,
            fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', letterSpacing: '0.18em',
            cursor: 'pointer', touchAction: 'manipulation',
          },
        }, 'CLOSE')
      )
    );
  }

  // ── Practice mode ────────────────────────────────────────────────

  function PracticeRoller(props) {
    var isMobile = useIsMobile();

    var _pool = useState(EMPTY_POOL);
    var pool = _pool[0], setPool = _pool[1];

    // overlayState non-null while the roll overlay is mounted. Set when
    // user taps ROLL; cleared when overlay calls onDismiss.
    var _overlay = useState(null);
    var overlayState = _overlay[0], setOverlayState = _overlay[1];
    // Back closes the roll overlay instead of exiting HoloDice (nav Phase 2a).
    useBackToClose(!!overlayState, function () { setOverlayState(null); });

    // DICE KEY reference is LIFTED to DiceSurface (app-level) so the bottom bar can open it (nav 2c);
    // PracticeRoller's in-content DICE KEY button calls props.onOpenReference.

    var reducedMotion = usePrefersReducedMotion();

    function patchPool(key, count) {
      setPool(function (prev) {
        var n = Math.max(0, Math.min(20, count | 0));
        var next = Object.assign({}, prev);
        next[key] = n;
        return next;
      });
    }

    function clearPool() {
      setPool(EMPTY_POOL);
    }

    function rollPool() {
      if (poolIsEmpty(pool)) return;
      if (overlayState) return;  // debounce — overlay already up
      var both = SWRPG.rollAndResolve(pool);
      setOverlayState({
        pool: Object.assign({}, pool),
        dieResults: both.results,
        resolved: Object.assign({ pool: pool }, both.resolved),
      });
    }

    var hasPool = !poolIsEmpty(pool);
    var canRoll = (poolHasCore(pool) || (pool.force || 0) > 0) && !overlayState;

    // T2-A (ruling tester2-scope Amendment 1 — FIT, don't scroll): body scroll is locked on this
    // surface (dice-demo-active), so USER scrolling does not exist — everything must fit the
    // viewport above the bottom bar. The strip BOUNDS ITSELF: chips scale down as the pool grows
    // so the tray never exceeds its height budget. 10px floor covers the builder's maximum
    // (20 per type × 7 = 140 dice) at the smallest supported width; the fit invariant is
    // machine-asserted by smoke_dice_fit at both smoke viewports (worst case included).
    function fitChipSize(count, width, budget, startSize) {
      var sizes = [46, 38, 30, 24, 18, 14, 10];
      for (var i = 0; i < sizes.length; i++) {
        var s = sizes[i];
        if (s > startSize) continue;
        var perRow = Math.max(1, Math.floor((width - 40) / (s + 4)));
        if (Math.ceil(Math.max(1, count) / perRow) * (s + 8) <= budget) return s;
      }
      return 10;
    }
    var poolCount = QUICK_ADD_DICE.reduce(function (n, d) { return n + (pool[d.key] || 0); }, 0);
    var stripWidth = Math.min(typeof global.innerWidth === 'number' ? global.innerWidth : 520, 520);
    // odds panel shares the hero's height budget when visible — chips give way one notch sooner
    var stripBudget = isMobile ? ((props.oddsVisible && hasPool) ? 66 : 112) : 150;
    var chipSize = fitChipSize(poolCount, stripWidth, stripBudget, isMobile ? 38 : 46);

    var hero = h('section', {
      'aria-label': 'Practice dice pool',
      style: {
        // pull the band up under the <main> 60px header-clearance so its violet bg covers the top
        // (no black strip); the top padding keeps the strip at the same visual position.
        // T2-A: mobile trims — the fit budget at 390×664 leaves no room for decorative spacing.
        flexShrink: 0, marginTop: '-60px',
        padding: isMobile ? '84px 12px 10px' : '108px 16px 18px', textAlign: 'center',
        // violet hero band — premium chrome glow (static; dice canon colours untouched)
        background: 'radial-gradient(120% 90% at 50% 0%, ' + COLOR.fadPurple + '1F, transparent 62%)',
      },
    },
      // (Hero text — the "NARRATIVE DICE" eyebrow + the "Build a Dice Pool. Tell Your Story." / "Roll. See
      //  What Changes." headline — REMOVED per Jason: the surface leads with the pool, not marketing copy.)

      // Static pool strip (no reels, no choreography). The overlay owns
      // the cinematic roll display.
      h(PoolStrip, { pool: pool, size: chipSize }),

      // Live odds for the built pool (Lap A) — updates as the pool changes.
      // Off by default; opt-in via the ☰ ODDS toggle (R-DTA-R2).
      (hasPool && props.oddsVisible) ? h(OddsReadout, { pool: pool }) : null,

      h('div', {
        style: {
          display: 'flex', justifyContent: 'center',
          marginTop: isMobile ? '10px' : '18px',
        },
      },
        h('button', {
          type: 'button',
          onClick: rollPool,
          disabled: !canRoll,
          'aria-label': canRoll ? 'Roll the pool' : 'Pool is empty',
          style: {
            // HoloDice, lap `holotable-reskin` (Jason): ROLL is the PRIMARY action → violet (app accent). CLEAR +
            // DICE KEY stay neutral so ROLL leads. (Supersedes R-DTA-R3's gold-neutralization — the
            // reskin gives the surface a real identity colour; ROLL carries it.)
            background: canRoll
              ? 'linear-gradient(135deg, ' + COLOR.fadPurple + '3A, ' + COLOR.fadPurple + '1A)'
              : 'rgba(255,255,255,0.04)',
            border: '1px solid ' + (canRoll ? COLOR.fadPurple + '99' : 'rgba(255,255,255,0.14)'),
            borderRadius: '8px',
            color: canRoll ? COLOR.fadPurple : 'rgba(255,255,255,0.32)',
            fontFamily: 'var(--font-mono)', fontWeight: 700,   /* §2: caps action button → mono (matches cockpit ROLL) */
            fontSize: 'var(--fs-lg)', letterSpacing: '0.20em',
            padding: '0 28px',
            minHeight: '52px', minWidth: '120px',
            cursor: canRoll ? 'pointer' : 'not-allowed',
            touchAction: 'manipulation',
            boxShadow: canRoll ? '0 0 18px ' + COLOR.fadPurple + '2E' : 'none',
          },
        }, 'ROLL')
        // HoloDice, lap `holotable-refinements`: ROLL is the sole primary action, centered. CLEAR removed (the pool
        // auto-empties after each roll now) + DICE KEY removed (it's a bottom-bar tab).
      )
    );

    // Build / adjust controls. StepperRow is the sole build affordance
    // and renders all seven die types (six core + force) so the user
    // can build any pool from empty via the +/- controls.
    var controls = h('section', {
      'aria-label': 'Pool controls',
      style: {
        // HoloDice, lap `holotable-refinements`: 'safe center' centers the builder when it fits but top-aligns when it
        // doesn't. T2-A (fit-don't-scroll): body scroll is LOCKED on this surface, so "scrollable when
        // tall" was never reachable on touch devices — the builder now FITS instead (compact two-column
        // grid on mobile via StepperRow's compact prop; the trimmed bottom padding is the bottom-bar
        // clearance, not scroll headroom).
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'safe center',
        padding: isMobile ? '4px 12px calc(78px + env(safe-area-inset-bottom))'
                          : '8px 16px calc(96px + env(safe-area-inset-bottom))',
        width: '100%', maxWidth: '520px', margin: '0 auto', boxSizing: 'border-box',
      },
    },
      h(StepperRow, { pool: pool, onChange: patchPool, compact: isMobile })
    );

    var overlay = overlayState ? h(RollOverlay, {
      pool: overlayState.pool,
      dieResults: overlayState.dieResults,
      resolved: overlayState.resolved,
      reducedMotion: reducedMotion,
      interpretVisible: props.interpretVisible,   // Lap B — WHAT IT MEANS panel
      // HoloDice, lap `holotable-refinements`: auto-empty the pool on dismiss (NEXT ROLL / close) — every roll starts from a
      // fresh pool, which is what makes the CLEAR button redundant.
      onDismiss: function () { setOverlayState(null); clearPool(); },
    }) : null;

    return h('div', {
      style: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
    }, hero, controls, overlay);
  }

  // ── Demo mode ────────────────────────────────────────────────────

  // Maps a resolved roll to one of the 8 interpretation keys used by
  // the per-beat interpretation map. Triumph/despair OVERRIDE
  // success/advantage categorization — they're the rare-outcome story
  // beat regardless of net pass/fail.
  function interpretationKey(resolved) {
    if (resolved.triumph > 0) return 'triumph';
    if (resolved.despair > 0) return 'despair';
    var passing = resolved.success > 0;
    var hasAdvantage = resolved.advantage > 0;
    var hasThreat = resolved.netThreat > 0;
    if (passing) {
      if (hasAdvantage) return 'successAdvantage';
      if (hasThreat) return 'successThreat';
      return 'successClean';
    }
    if (hasAdvantage) return 'failureAdvantage';
    if (hasThreat) return 'failureThreat';
    return 'failureClean';
  }

  // Cold-start hero card. Shown before BEGIN tap on the very first
  // visit (or on an intro re-run via ?intro). Replaced by the active BeatStage
  // once the scenario starts.
  function IntroHero(props) {
    var onBegin = props.onBegin;
    var onSkipOnboarding = props.onSkipOnboarding;
    var beatCount = props.beatCount;
    return h('section', {
      'aria-label': 'Dice surface intro',
      style: {
        padding: '40px 16px 24px',
        textAlign: 'center',
        animation: 'slideUpFade 0.4s ease both',
      },
    },
      // Eyebrow "NARRATIVE DICE" removed (per user direction). The
      // hero headline carries the framing now.
      h('h1', {
        style: {
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-3xl)',
          letterSpacing: '0.04em', color: '#fff',
          margin: '0 0 14px', lineHeight: 1.2,
        },
      }, 'Learn how to use Narrative Dice'),
      // Subtitle: "Narrative Dice" emphasized in operator gold so the
      // term stands out as the thing the visitor is about to meet.
      h('div', {
        style: {
          fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)',
          color: COLOR.mutedText, maxWidth: '420px', margin: '0 auto 28px',
        },
      },
        'A ',
        h('span', {
          style: {
            color: COLOR.operatorGold,
            fontWeight: 600,
            letterSpacing: '0.02em',
          },
        }, 'Narrative Dice'),
        ' Demonstration.'
      ),
      h('button', {
        type: 'button',
        onClick: onBegin,
        'aria-label': 'Begin the demonstration',
        style: {
          background: 'linear-gradient(135deg, ' + COLOR.operatorGold + ', #C9A02E)',
          border: '1px solid ' + COLOR.operatorGold,
          borderRadius: '8px',
          color: '#000',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 'var(--fs-lg)', letterSpacing: '0.22em',
          padding: '0 32px', minHeight: '56px', minWidth: '140px',
          cursor: 'pointer',
          touchAction: 'manipulation',
          boxShadow: '0 0 18px ' + COLOR.operatorGold + '55',
        },
      }, 'BEGIN'),
      // SKIP DEMO — secondary action below BEGIN. Lower visual weight
      // (outlined, no glow). Shares the onSkipOnboarding handler with
      // the trailer's SKIP button — single semantic, two surfaces.
      onSkipOnboarding ? h('div', {
        style: { marginTop: '14px' },
      },
        h('button', {
          type: 'button',
          onClick: onSkipOnboarding,
          'aria-label': 'Skip onboarding and go to practice mode',
          style: {
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '6px',
            color: COLOR.mutedText,
            fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
            letterSpacing: '0.20em',
            padding: '0 22px', minHeight: '44px', minWidth: '120px',
            cursor: 'pointer',
            touchAction: 'manipulation',
          },
        }, 'SKIP DEMO')
      ) : null
    );
  }

  // ── Dice trailer (pre-scenario slideshow) ────────────────────────
  //
  // Brief cinematic primer that introduces each die type one at a
  // time before the canonical scenario begins. 7 slides, ~5s each
  // with auto-advance + tap-to-skip-ahead. SKIP button (revealed on
  // tap, top-right) exits onboarding entirely → practice mode.
  //
  // Single die-shape window per slide using REEL_SHAPE clip-paths.
  // Faces cross-fade continuously while the slide is up.

  function TrailerDie(props) {
    var dieType = props.dieType;
    var color = props.color;
    var reducedMotion = !!props.reducedMotion;
    // Optional external cycle index — when present, used instead of
    // the internal timer. Lets paired-counterpart slides drive both
    // dice from a single shared timer so they flip in opposition
    // (green Success face same instant purple Failure face). When
    // absent, internal timer drives the cycle (used by solo slides).
    var externalCycleIdx = props.cycleIdx;
    var faces = useMemo(function () { return uniqueDieFaces(dieType); }, [dieType]);

    var _idx = useState(0);
    var idx = _idx[0], setIdx = _idx[1];

    useEffect(function () {
      if (reducedMotion) return;
      if (typeof externalCycleIdx === 'number') return;  // parent drives the cycle
      if (faces.length <= 1) return;
      var t = setInterval(function () {
        setIdx(function (n) { return (n + 1) % faces.length; });
      }, 2000);
      return function () { clearInterval(t); };
    }, [faces.length, reducedMotion, externalCycleIdx]);

    var effectiveIdx = (typeof externalCycleIdx === 'number')
      ? (externalCycleIdx % Math.max(1, faces.length))
      : idx;
    var face = faces[effectiveIdx] || {};

    // Flat-glyph showcase (dice-unify Phase 2): the die as FlatDie (silhouette + cycling face),
    // cross-fading each face change (keyed by effectiveIdx). Replaces the REEL_SHAPE clip-path window.
    return h('div', {
      style: {
        margin: 'clamp(40px, 8vh, 80px) 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      },
    },
      h('div', {
        key: effectiveIdx,
        className: reducedMotion ? null : 'collision-headline',
        'aria-label': dieType + ' die showcase', role: 'img',
      }, h(FlatDie, { dieKey: dieType, face: face, size: 104 }))
    );
  }

  // Helper: resolve a die-key to its visual color from QUICK_ADD_DICE.
  function dieColor(key) {
    var d = QUICK_ADD_DICE.filter(function (c) { return c.key === key; })[0];
    return d ? d.color : COLOR.fadCream;
  }

  // Per-die name + cycling silhouette + mechanical line. Used as the
  // building block for both the player half and the GM half of paired
  // slides. cycleIdx is the SHARED face-cycle index from the parent
  // slideshow so opposing dice flip in lockstep.
  function PairDieBlock(props) {
    var dieKey = props.dieKey;
    var name = props.name;
    var mech = props.mech;
    var cycleIdx = props.cycleIdx;
    var reducedMotion = !!props.reducedMotion;
    var enterDelay = props.enterDelay || '0s';
    return h('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '10px',
      },
    },
      h('div', {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(10px, 1.4vh, 12px)',
          letterSpacing: '0.30em',
          color: COLOR.operatorGold,
          animation: reducedMotion ? 'none' : 'slideUpFade 0.4s ease ' + enterDelay + ' both',
        },
      }, name),
      h(TrailerDie, {
        dieType: dieKey,
        color: dieColor(dieKey),
        reducedMotion: reducedMotion,
        cycleIdx: cycleIdx,
      }),
      h('div', {
        style: {
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(13px, 1.9vh, 15px)',
          lineHeight: 1.5,
          color: COLOR.mutedText,
          fontStyle: 'italic',
          textAlign: 'center',
          maxWidth: '34ch',
          animation: reducedMotion ? 'none' : 'slideUpFade 0.4s ease ' + enterDelay + ' both',
        },
      }, mech)
    );
  }

  function TrailerSlide(props) {
    var slide = props.slide;
    var color = props.color;
    var reducedMotion = !!props.reducedMotion;
    var cycleIdx = props.cycleIdx;

    var wrapStyle = {
      height: '100%', width: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'clamp(24px, 6vh, 60px) clamp(16px, 5vw, 32px)',
      animation: reducedMotion ? 'none' : 'slideUpFade 0.5s ease both',
    };

    // Paired layout: vertical stack — player die (top) + shared
    // image lede (middle) + GM die (bottom). Mirrors the demo's
    // split-screen so the trailer is also a structural primer.
    if (slide.type === 'pair') {
      return h('div', { style: wrapStyle },
        h(PairDieBlock, {
          dieKey: slide.player.key,
          name: slide.player.name,
          mech: slide.player.mech,
          cycleIdx: cycleIdx,
          reducedMotion: reducedMotion,
          enterDelay: '0.0s',
        }),
        h('div', {
          style: {
            margin: 'clamp(20px, 3.5vh, 32px) 0',
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(15px, 2.2vh, 18px)',
            lineHeight: 1.4,
            color: COLOR.bodyText,
            textAlign: 'center',
            maxWidth: '36ch',
            animation: reducedMotion ? 'none' : 'slideUpFade 0.5s ease 0.2s both',
          },
        }, slide.image),
        h(PairDieBlock, {
          dieKey: slide.gm.key,
          name: slide.gm.name,
          mech: slide.gm.mech,
          cycleIdx: cycleIdx,
          reducedMotion: reducedMotion,
          enterDelay: '0.4s',
        })
      );
    }

    // Solo layout (Force) — keep the centered single-die treatment.
    // The 'force-solo' className adds a halo pulse so the slide
    // visually earns its asymmetry instead of looking like a
    // missing-die error.
    return h('div', { style: wrapStyle },
      h('div', {
        className: reducedMotion ? null : 'collision-headline',
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(11px, 1.6vh, 13px)',
          letterSpacing: '0.30em',
          color: COLOR.operatorGold,
          marginBottom: 'clamp(20px, 4vh, 40px)',
        },
      }, slide.name),
      h('div', {
        className: reducedMotion ? null : 'force-solo-halo',
      },
        h(TrailerDie, {
          dieType: slide.key,
          color: color,
          reducedMotion: reducedMotion,
        })
      ),
      h('div', {
        style: {
          maxWidth: '36ch', textAlign: 'center',
          marginTop: 'clamp(20px, 4vh, 40px)',
        },
      },
        h('div', {
          style: {
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(15px, 2.2vh, 18px)',
            lineHeight: 1.55,
            color: COLOR.bodyText,
            marginBottom: '10px',
            animation: reducedMotion ? 'none' : 'slideUpFade 0.4s ease 0.4s both',
          },
        }, slide.line1),
        h('div', {
          style: {
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(13px, 1.9vh, 15px)',
            lineHeight: 1.5,
            color: COLOR.mutedText,
            fontStyle: 'italic',
            animation: reducedMotion ? 'none' : 'slideUpFade 0.4s ease 0.6s both',
          },
        }, slide.line2)
      )
    );
  }

  function TrailerSlideshow(props) {
    var onComplete = props.onComplete;
    var onSkip = props.onSkip;
    var reducedMotion = !!props.reducedMotion;

    var _idx = useState(0);
    var idx = _idx[0], setIdx = _idx[1];

    // SKIP button visibility — hidden by default, revealed for ~3.5s
    // after any tap on the slide. Auto-hides if not used.
    var _skipVis = useState(false);
    var skipVisible = _skipVis[0], setSkipVisible = _skipVis[1];
    var skipHideRef = React.useRef(null);
    function pulseSkipReveal() {
      setSkipVisible(true);
      if (skipHideRef.current) clearTimeout(skipHideRef.current);
      skipHideRef.current = setTimeout(function () {
        setSkipVisible(false);
        skipHideRef.current = null;
      }, 3500);
    }

    // Slide-1-only "TAP TO CONTINUE" affordance. Cold visitors land
    // on a black screen with a die and no chrome and may not realize
    // the surface is interactive (cold-visitor smoke confirmed this:
    // tester nearly tapped SKIP before discovering tap-to-advance).
    // Hint fades in after 3s of inactivity on slide 1, dies on first
    // interaction, never re-shows.
    var _tapHint = useState(false);
    var tapHintVisible = _tapHint[0], setTapHintVisible = _tapHint[1];
    var interactedRef = React.useRef(false);
    var hintTimerRef = React.useRef(null);

    useEffect(function () {
      if (idx !== 0) return;
      if (interactedRef.current) return;
      hintTimerRef.current = setTimeout(function () {
        if (!interactedRef.current) setTapHintVisible(true);
        hintTimerRef.current = null;
      }, 3000);
      return function () {
        if (hintTimerRef.current) {
          clearTimeout(hintTimerRef.current);
          hintTimerRef.current = null;
        }
      };
    }, [idx]);

    function noteInteraction() {
      if (interactedRef.current) return;
      interactedRef.current = true;
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
      setTapHintVisible(false);
    }

    function advance() {
      noteInteraction();
      if (idx >= DIE_TRAILER_COPY.length - 1) {
        // Last slide — fire onComplete OUTSIDE a setIdx updater so React
        // doesn't see a parent setState during a child setIdx render.
        onComplete();
      } else {
        setIdx(idx + 1);
      }
    }

    function goBack() {
      noteInteraction();
      setIdx(Math.max(0, idx - 1));
    }

    // Swipe support. Touch devices fire a synthetic click after touchend,
    // so when a swipe is recognized we set a ref the click handler reads
    // to no-op once. Without this, swiping would advance twice (swipe +
    // synthetic click). Threshold is 40px — anything less is a tap.
    var touchStartXRef = React.useRef(null);
    var swipeJustHandledRef = React.useRef(false);
    var SWIPE_THRESHOLD = 40;

    function handleTouchStart(e) {
      if (e.touches && e.touches.length === 1) {
        touchStartXRef.current = e.touches[0].clientX;
      }
    }

    function handleTouchEnd(e) {
      var startX = touchStartXRef.current;
      touchStartXRef.current = null;
      if (startX == null) return;
      var endX = (e.changedTouches && e.changedTouches[0])
        ? e.changedTouches[0].clientX : null;
      if (endX == null) return;
      var dx = endX - startX;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;  // tap, not swipe
      swipeJustHandledRef.current = true;
      pulseSkipReveal();
      if (dx < 0) advance(); else goBack();
    }

    function handleSlideTap() {
      // Suppress the synthetic click that fires after a recognized swipe.
      if (swipeJustHandledRef.current) {
        swipeJustHandledRef.current = false;
        return;
      }
      pulseSkipReveal();
      advance();
    }

    // No auto-advance — visitor controls pacing via tap or swipe.
    // Faces cycle continuously inside TrailerDie (1.6s per face) so the
    // slide stays alive while the visitor reads. Final advance from
    // slide 7 calls onComplete → demo mounts. Swipe-back works to
    // re-read an earlier slide.

    var slide = DIE_TRAILER_COPY[idx];
    // For solo slides, derive die color from the top-level key. Paired
    // slides have no top-level key (player and gm each have their own);
    // PairDieBlock looks up its own color via dieColor() helper.
    var color = (slide.type === 'solo')
      ? (function () {
          var d = QUICK_ADD_DICE.filter(function (c) { return c.key === slide.key; })[0];
          return d ? d.color : COLOR.fadCream;
        })()
      : COLOR.fadCream;

    // Shared face-cycle index for paired slides — both dies on a pair
    // slide receive this and tick together so green-Success and purple-
    // Failure flip in opposition (synced cycling is the pedagogical
    // payoff per GM Vet audit). Solo slides also use it (harmless;
    // the solo TrailerDie ignores it via its own internal timer
    // fallback for back-compat — actually no, we always pass it; the
    // solo block's TrailerDie just uses it too).
    var _cycleIdx = useState(0);
    var cycleIdx = _cycleIdx[0], setCycleIdx = _cycleIdx[1];
    useEffect(function () {
      if (reducedMotion) return;
      var t = setInterval(function () {
        setCycleIdx(function (n) { return n + 1; });
      }, 2400);  // bumped from 2000 to 2400 so paired faces hold long enough to be parsed
      return function () { clearInterval(t); };
    }, [reducedMotion]);

    return h('div', {
      role: 'dialog',
      'aria-label': 'Dice introduction trailer',
      onClick: handleSlideTap,
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      style: {
        position: 'fixed', inset: 0, zIndex: 40,
        background: '#000',
        cursor: 'pointer',
        touchAction: 'pan-y',  // allow vertical scroll, claim horizontal for swipe
        animation: reducedMotion ? 'none' : 'overlay-enter 220ms cubic-bezier(0.2, 0.8, 0.4, 1.0) both',
      },
    },
      // Progress dots (top-center). UI audit recommendation: visitors
      // see a finite runway and stop tapping past slides because they
      // know how many remain.
      h('div', {
        'aria-hidden': true,
        style: {
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 18px)',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '6px',
          zIndex: 3,
          pointerEvents: 'none',
        },
      },
        DIE_TRAILER_COPY.map(function (_, i) {
          var active = i === idx;
          return h('span', {
            key: 'dot-' + i,
            style: {
              width: active ? '14px' : '6px',
              height: '6px',
              borderRadius: '999px',
              background: active ? COLOR.operatorGold : 'rgba(255, 255, 255, 0.22)',
              transition: 'width 240ms ease, background 240ms ease',
            },
          });
        })
      ),
      h(TrailerSlide, {
        slide: slide,
        color: color,
        reducedMotion: reducedMotion,
        cycleIdx: cycleIdx,
        key: idx,
      }),
      h('div', {
        'aria-hidden': true,
        className: 'trailer-tap-hint' + (tapHintVisible ? ' visible' : ''),
        style: {
          position: 'absolute',
          bottom: 'clamp(36px, 7vh, 72px)',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-xs)',
          letterSpacing: '0.30em',
          color: 'rgba(255,255,255,0.50)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        },
      }, 'TAP TO CONTINUE  ›'),
      h('button', {
        type: 'button',
        onClick: function (e) { e.stopPropagation(); onSkip(); },
        'aria-label': 'Skip onboarding and go to practice mode',
        className: 'trailer-skip-btn' + (skipVisible ? ' visible' : ''),
        style: {
          position: 'absolute',
          top: 'clamp(12px, 2vh, 24px)',
          right: 'clamp(12px, 3vw, 24px)',
          zIndex: 2,
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(255,255,255,0.30)',
          borderRadius: '6px',
          color: COLOR.mutedText,
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
          letterSpacing: '0.20em',
          padding: '0 18px', minHeight: '44px', minWidth: '88px',
          cursor: 'pointer',
          touchAction: 'manipulation',
        },
      }, 'SKIP')
    );
  }

  // Order in which the TransitionSlide morphs through die types. Same
  // ordering as the trailer slides (player-side first, Force as
  // conceptual bridge, GM-side last).
  var DIE_MORPH_ORDER = [
    'ability', 'proficiency', 'boost', 'force', 'difficulty', 'challenge', 'setback',
  ];

  // ── TransitionSlide ────────────────────────────────────────────────
  // Cinematic 5.5s bridge between the TrailerSlideshow (vocabulary
  // preview) and the scenario's first beat. A single die centered on
  // black morphs through all 7 types (~700ms each); eyebrow + subtitle
  // text fade in. Tap-anywhere-to-skip exits early. No SKIP button —
  // the 5.5s duration doesn't justify a persistent affordance (the
  // trailer's tap-reveals-SKIP pattern is for sustained ~35s content).
  // See Docs/SPEC_dice_surface.md §8 for the interaction-asymmetry
  // rationale.
  function TransitionSlide(props) {
    var onComplete = props.onComplete;
    var reducedMotion = !!props.reducedMotion;

    var _morphIdx = useState(0);
    var morphIdx = _morphIdx[0], setMorphIdx = _morphIdx[1];

    var _exiting = useState(false);
    var exiting = _exiting[0], setExiting = _exiting[1];

    var completedRef = React.useRef(false);
    function finish() {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete && onComplete();
    }

    // 1300ms per morph: slowed from 1000ms for more cinematic absorption.
    // Note: with the auto-advance timer removed (visitor taps to skip),
    // this is purely the visual rhythm — visitor controls when to leave.
    var MORPH_MS = reducedMotion ? 800 : 1300;
    var EXIT_MS = reducedMotion ? 0 : 300;
    var TOTAL_MS = MORPH_MS * DIE_MORPH_ORDER.length + EXIT_MS;

    // Morph timer: advance the die-type index every MORPH_MS.
    useEffect(function () {
      var t = setInterval(function () {
        setMorphIdx(function (n) {
          if (n + 1 >= DIE_MORPH_ORDER.length) {
            clearInterval(t);
            return n;
          }
          return n + 1;
        });
      }, MORPH_MS);
      return function () { clearInterval(t); };
    }, []);

    // No auto-complete timer — visitor taps to advance to the demo.
    // The morph cycle still runs (visual rhythm) but the slide stays
    // up until the visitor taps. Consistent with trailer + demo
    // tap-to-advance pattern.

    function handleTap() {
      setExiting(true);
      setTimeout(finish, EXIT_MS);
    }

    var dieType = DIE_MORPH_ORDER[morphIdx];
    var dieConfig = QUICK_ADD_DICE.filter(function (d) { return d.key === dieType; })[0];
    var color = dieConfig ? dieConfig.color : COLOR.fadCream;

    // Show one representative face per die-type (the second unique
    // face, which is typically the most visually distinctive — for
    // ability that's success-only, for force it's a 2-pip face).
    var faces = uniqueDieFaces(dieType);
    var face = faces[Math.min(1, faces.length - 1)] || {};

    return h('div', {
      role: 'dialog',
      'aria-label': 'Transition to scenario',
      onClick: handleTap,
      style: {
        position: 'fixed', inset: 0, zIndex: 40,
        background: '#000',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(24px, 6vh, 60px) clamp(16px, 5vw, 32px)',
        opacity: exiting ? 0 : 1,
        transition: 'opacity ' + EXIT_MS + 'ms ease-out',
        animation: reducedMotion ? 'none' : 'overlay-enter 220ms cubic-bezier(0.2, 0.8, 0.4, 1.0) both',
      },
    },
      // Eyebrow — fades in at ~400ms via slideUpFade
      h('div', {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(13px, 2.0vh, 16px)',
          letterSpacing: '0.30em',
          color: COLOR.operatorGold,
          marginBottom: 'clamp(36px, 6vh, 60px)',
          animation: reducedMotion ? 'none' : 'slideUpFade 800ms ease 400ms both',
        },
      }, 'FIVE ROLLS. ONE MISSION.'),

      // Center die — re-keyed on morphIdx so headline-resolve fires per
      // morph. Wrapped in a fixed-size 64x64 layout container so the
      // varying die shapes (48x48 to 60x56) don't shift the eyebrow
      // up or subtitle down as the morph cycles. The inner die is
      // centered in the wrapper; transform: scale(2) is visual-only
      // and doesn't expand the layout box.
      // Flat-glyph morphing die (dice-unify Phase 2): FlatDie re-keyed on morphIdx so each morph
      // cross-fades. Replaces the REEL_SHAPE clip-path window.
      h('div', {
        style: {
          margin: 'clamp(20px, 5vh, 50px) 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      },
        h('div', {
          key: morphIdx,
          className: reducedMotion ? null : 'collision-headline',
          'aria-label': dieType + ' die', role: 'img',
        }, h(FlatDie, { dieKey: dieType, face: face, size: 104 }))
      ),

      // Subtitle — fades in at ~2000ms via slideUpFade. Trimmed from
      // the literal scenario setting (full Gozanti-class jargon) to a
      // lay-friendly version that reads cleanly for non-Star-Wars-fan
      // first-time visitors. Cold-visitor audit flagged the original
      // as the biggest comprehension blocker in the entire flow.
      h('div', {
        style: {
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(14px, 2.0vh, 16px)',
          color: 'rgba(255, 255, 255, 0.85)',
          lineHeight: 1.55,
          marginTop: 'clamp(36px, 6vh, 60px)',
          textAlign: 'center',
          maxWidth: '48ch',
          animation: reducedMotion ? 'none' : 'slideUpFade 800ms ease 2000ms both',
        },
      }, 'An Imperial cruiser at drydock. Plant a charge. Slip out before they notice.')
    );
  }

  // One-of-a-handful number-word helper for the IntroHero subtitle.
  // Keeps the headline copy human ("A five-roll demonstration").
  function numberWord(n) {
    var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    return WORDS[n] || String(n);
  }

  // Renders one beat: counter + check description + setup paragraph +
  // pool strip + auto-rolled result + interpretation + NEXT button.
  // Choreography lands in commit 5 (this commit instant-rolls on
  // mount). Result-panel teaching content + novel-mechanic callouts
  // land in commit 6 (this commit uses the existing BasicResultPanel +
  // beat-scripted interpretations).
  function BeatStage(props) {
    var beat = props.beat;
    var beatIndex = props.beatIndex;
    var beatCount = props.beatCount;
    var carryContext = props.carryContext || {};
    var onAdvance = props.onAdvance;
    var isLast = props.isLast;

    // Effective pool: base pool + carry-forward boost. Applied here
    // (vs. baked into scenarios.js) so beats stay declarative.
    var effectivePool = useMemo(function () {
      var base = Object.assign({}, beat.pool);
      if (carryContext.boostNextBeat) {
        base.boost = (base.boost || 0) + carryContext.boostNextBeat;
      }
      return base;
    }, [beat, carryContext]);

    // INVOKE DESTINY state (Beat 5). Single button — when tapped, the
    // visual sequence (token-fly + gold-pulse) plays for ~700ms and the
    // dice scroll begins. invokeOrigin captures the tap coordinates so
    // the light-token glyph spawns at the button position. The old
    // SPEND/SKIP fork was retired in this commit; Beat 5 now uses
    // scriptedResult + scriptedFaces for a guaranteed dramatic outcome.
    var _invoked = useState(false);
    var invokedDestiny = _invoked[0], setInvokedDestiny = _invoked[1];
    var _invokeOrigin = useState(null);
    var invokeOrigin = _invokeOrigin[0], setInvokeOrigin = _invokeOrigin[1];

    // Active pool — Beat 5 no longer has a destiny-spend pool fork; the
    // base pool stands.
    var activePool = effectivePool;

    // Resolved roll + raw per-die results. For scriptedResult beats,
    // use the scripted result verbatim (engine bypassed — the iconic
    // Triumph + Despair beat must land its outcome every viewing). For
    // Destiny beats, the user must explicitly tap SPEND or NEXT to
    // roll, so resolved stays null until that interaction. For all
    // other beats, auto-roll on mount via the choreography hook.
    var _resolved = useState(null);
    var resolved = _resolved[0], setResolved = _resolved[1];
    var _dieResults = useState(null);
    var dieResults = _dieResults[0], setDieResults = _dieResults[1];
    var _rollNonce = useState(0);
    var rollNonce = _rollNonce[0], setRollNonce = _rollNonce[1];
    var choreo = useRollChoreography();

    // Settle counter for staggered reels. Each ReelDie fires onSettle
    // exactly once when its bounce completes; when count === total dice,
    // we notify the choreography to advance ROLLING → SETTLING → HOLDING.
    var settledRef = React.useRef({ ids: {}, total: 0 });

    function publishResolved(r) {
      setResolved(r);
      if (typeof props.onResolved === 'function') props.onResolved(r);
    }

    function performRoll() {
      var pool;
      var raw;
      var resolvedObj;
      if (beat.scriptedResult) {
        pool = beat.pool;
        var s = beat.scriptedResult;
        raw = beat.scriptedFaces || synthesizeScriptedFaces(pool, s);
        var success = s.success || 0;
        var advantage = s.advantage || 0;
        // Signed-integer convention (see lib/shared/diceEngine.js resolve()):
        //   success < 0  → succeeded=false, netFailure=|success|
        //   advantage < 0 → netThreat=|advantage|
        resolvedObj = {
          pool: pool,
          success: success,
          advantage: advantage,
          triumph: s.triumph || 0,
          despair: s.despair || 0,
          light: s.light || 0,
          dark: s.dark || 0,
          succeeded: success > 0,
          netFailure: success > 0 ? 0 : -success,
          netThreat: advantage < 0 ? -advantage : 0,
        };
      } else {
        pool = activePool;
        var both = SWRPG.rollAndResolve(pool);
        raw = both.results;
        resolvedObj = Object.assign({ pool: pool }, both.resolved);
      }
      // Compute total reel count for the settle counter.
      var total = 0;
      ['ability','proficiency','boost','force','difficulty','challenge','setback'].forEach(function (t) {
        total += (pool[t] || 0);
      });
      settledRef.current = { ids: {}, total: total };
      setRollNonce(function (n) { return n + 1; });
      setDieResults(raw);
      publishResolved(resolvedObj);
    }

    function handleDieSettle(dieId) {
      var s = settledRef.current;
      if (s.ids[dieId]) return;            // dedupe
      s.ids[dieId] = true;
      var settledCount = Object.keys(s.ids).length;
      if (settledCount >= s.total) {
        // Roll-settle sound — only fires for CLEAN rolls (no triumph,
        // no despair). On triumph/despair rolls the celebration sounds
        // (firing at +600ms after panel mount) take over the audio
        // space; rollSettle variants would compete with them.
        //
        // Two variants by outcome:
        //   - succeeded → rollSettle      (positive-feeling anchor)
        //   - failed    → rollSettleFail  (negative-feeling anchor)
        //
        // The resolved object was published via publishResolved()
        // during performRoll BEFORE the dice began scrolling, so it's
        // reliably populated here. Falls through to silent on the
        // unlikely race where resolved is null (e.g., mid-cleanup).
        if (resolved && !(resolved.triumph > 0) && !(resolved.despair > 0)) {
          var settleKey = resolved.succeeded ? 'rollSettle' : 'rollSettleFail';
          _audio.playSound(settleKey);
        }
        choreo.notifyAllSettled();
      }
    }

    // Auto-roll on mount for non-INVOKE beats, after a 3s reading
    // pause so the visitor can take in the narrative before dice fly.
    // Reduced-motion skips the delay (dice resolve instantly anyway).
    //
    // INVOKE beats (where invokeDestiny.available === true) suppress
    // BOTH the auto-roll timer AND the tap-to-skip-read interaction —
    // the visitor controls pace via INVOKE DESTINY, and there's no
    // timer to skip. Generalized rule (NOT hardcoded to Beat 5) so
    // future INVOKE beats inherit the correct behavior.
    var isInvokeBeat = !!(beat.invokeDestiny && beat.invokeDestiny.available);

    // No auto-roll timer. Visitor taps to advance from read → roll
    // (tap-to-advance pattern established in the trailer + transition,
    // extended throughout the demo per user direction). INVOKE beats
    // still wait for the explicit INVOKE button. choreo.reset() puts
    // the choreography in idle on every beat mount so the visitor
    // controls when the dice fly.
    useEffect(function () {
      choreo.reset();
      return function () {
        setResolved(null);
        setDieResults(null);
        settledRef.current = { ids: {}, total: 0 };
        setInvokedDestiny(false);
        setInvokeOrigin(null);
      };
    // eslint-disable-next-line
    }, [beat.id]);

    // readyToTap gate: tap-anywhere actions (skip-read, advance-from-
    // hold) ignore taps for the first 600ms after a new "thing" enters
    // the screen, so an early/accidental tap doesn't skip past content
    // that hasn't finished animating in yet. Resets on:
    //   - new beat mount (narrative entering)
    //   - choreo.isResultVisible flips true (result panel entering)
    var _ready = useState(false);
    var readyToTap = _ready[0], setReadyToTap = _ready[1];
    useEffect(function () {
      setReadyToTap(false);
      var t = setTimeout(function () { setReadyToTap(true); }, 600);
      return function () { clearTimeout(t); };
    }, [beat.id, choreo.isResultVisible]);

    // Tap-to-advance from read phase. The trailer + transition
    // trained the visitor on tap-to-advance; the demo extends the
    // pattern. Tap on the section (during read) starts the roll.
    // Content interaction (advance pacing within the beat), NOT a
    // control interaction (the demo has no in-flight SKIP).
    // Suppressed on INVOKE beats — those wait for the INVOKE button.
    // readyToTap is the 600ms gate after mount so accidental fast
    // taps don't skip past unread text.
    var canAdvanceFromRead = !isInvokeBeat
      && choreo.phase === 'idle'
      && readyToTap;
    function advanceFromRead() {
      if (!canAdvanceFromRead) return;
      // Warm the audio context here too — covers `?short=N` entry
      // points where the visitor never sees IntroHero's BEGIN button
      // (skipIntro=true boots straight to the scenario phase). The
      // warmer is idempotent so calling on every read-phase tap is
      // safe; only the first call does work.
      _audio.warmAudioContext();
      choreo.startRoll(performRoll);
    }

    // Beat 1 tap hint — first solo encounter with tap-to-advance in
    // the demo phase. Trailer trained the gesture on slide 1; this
    // mirrors that pattern for the demo's first beat. Fades in after
    // 3s of inactivity on Beat 1 only, dies on first interaction,
    // never re-shows on subsequent beats. Suppressed on INVOKE beats
    // (Beat 5; not applicable since this only runs on beatIndex===0).
    var _showBeatHint = useState(false);
    var showBeatHint = _showBeatHint[0], setShowBeatHint = _showBeatHint[1];
    var beatHintTimerRef = React.useRef(null);
    useEffect(function () {
      if (beatIndex !== 0 || isInvokeBeat) return;
      beatHintTimerRef.current = setTimeout(function () {
        setShowBeatHint(true);
      }, 3000);
      return function () {
        if (beatHintTimerRef.current) {
          clearTimeout(beatHintTimerRef.current);
          beatHintTimerRef.current = null;
        }
        setShowBeatHint(false);
      };
    // eslint-disable-next-line
    }, [beatIndex]);
    function killBeatHint() {
      if (beatHintTimerRef.current) {
        clearTimeout(beatHintTimerRef.current);
        beatHintTimerRef.current = null;
      }
      if (showBeatHint) setShowBeatHint(false);
    }

    // Tap-anywhere advance during HOLD phase. Unifies the demo with
    // the trailer/transition's tap-to-advance pattern. The NEXT button
    // remains as the visible affordance; this just lets a tap anywhere
    // on the result area fire the same action. Gated by readyToTap so
    // an early tap during the result's collision animation doesn't
    // skip past unread interpretation copy. Button clicks bubble here
    // too — closest('button') check prevents double-firing.
    function handleSectionTap(e) {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      killBeatHint();
      if (canAdvanceFromRead) { advanceFromRead(); return; }
      if (choreo.isHolding && readyToTap) {
        // handleAdvance is defined further below; call it directly via
        // closure — it triggers the inter-beat fade and beat swap.
        handleAdvance();
        return;
      }
      // Roll / settle / INVOKE-pending: ignore taps.
    }
    var sectionCursor = (canAdvanceFromRead || (choreo.isHolding && readyToTap)) ? 'pointer' : 'default';

    // INVOKE DESTINY tap — capture origin coordinates for the token-fly
    // animation, set state so DestinyInvokeSequence mounts, then fire
    // the choreography after the visual sequence (~700ms total). For
    // reduced-motion, skip the visual delay and roll immediately.
    function handleInvoke(event) {
      if (invokedDestiny) return;
      var rect = event.currentTarget.getBoundingClientRect();
      setInvokeOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      setInvokedDestiny(true);
      // INVOKE DESTINY sound. Fires immediately at the tap moment so
      // the audio cue lands as the light pip launches. The pip ascends
      // for 1400ms; the sound's tail typically overlaps that window so
      // pip arrival, sound finish, and dice-roll start all converge.
      _audio.playSound('destinyInvoke');
      // 1400ms matches the new .destiny-token-fly animation duration
      // (was 700ms). The dice roll starts as the pip completes its
      // ascent, preserving the "token completes → dice scroll" cadence.
      var delay = choreo.reducedMotion ? 0 : 1400;
      setTimeout(function () {
        choreo.startRoll(performRoll);
      }, delay);
    }

    // Advance with choreography exit — fast-forward through the
    // transition-in phase so the next beat can mount cleanly.
    function handleAdvance() {
      choreo.endHold(function () {
        if (typeof onAdvance === 'function') onAdvance();
      });
    }

    // Interpretation lookup. Scripted beats (Beat 4 + Beat 5) have a
    // single string under beat.interpretation.scripted. All other beats
    // use the standard 8-key map.
    var interpretation = useMemo(function () {
      if (!resolved) return null;
      if (beat.scriptedResult && beat.interpretation && beat.interpretation.scripted) {
        return beat.interpretation.scripted;
      }
      var k = interpretationKey(resolved);
      return (beat.interpretation && beat.interpretation[k]) || null;
    }, [beat, resolved]);

    // Novel-mechanic callout — choose at HOLDING entry so the flag is
    // consumed once per beat at most. Stored in local state so the
    // CalloutPanel keeps showing through the HOLD even if HOLDING
    // re-renders for other reasons. Reset on beat change (when the
    // result panel hides).
    var _callout = useState(null);
    var calloutKey = _callout[0], setCalloutKey = _callout[1];
    useEffect(function () {
      if (choreo.isHolding && resolved && calloutKey === null) {
        var ck = chooseUnseenCallout(resolved);
        if (ck) setCalloutKey(ck);
      }
      if (!choreo.isHolding && calloutKey !== null && !choreo.isResultVisible) {
        setCalloutKey(null);
      }
    }, [choreo.isHolding, choreo.isResultVisible, resolved]);

    var sharedPoolStripProps = {
      pool: activePool,
      size: 32,
      dieResults: choreo.isReelMounted ? dieResults : null,
      settleOrder: beat.settleOrder,
      onSettle: handleDieSettle,
      reducedMotion: choreo.reducedMotion,
      rollNonce: rollNonce,
      // Demo cohesion: when no roll is in flight, render NOTHING in
      // the dice slots (no font-glyph dice). The cinematic ReelDie
      // variant becomes the sole dice visual in the demo. The empty
      // placeholder preserves layout so the result panel and dice
      // arrival don't shift the page. See spec §8.7.
      emptyMode: 'hidden',
    };

    // Center panel: narrative pre-roll → result panel post-settle. The
    // narrative content stays at full opacity throughout (no dice-chrome
    // dim) because in the new split layout it IS the centerpiece, not
    // ambient chrome.
    var centerNarrative = h('div', {
      style: { textAlign: 'center', width: '100%' },
    },
      // No `autohide-chrome` — the BEAT N OF 5 counter is content
      // (orientation), not chrome that should fade under idle. UI
      // audit found the autohide system was suppressing this label
      // permanently.
      //
      // Suppress entirely on single-beat scenarios (YouTube Shorts
      // capture loads — see scenarios.js short-N entries). "BEAT 1
      // OF 1" is informational noise: it tells the visitor they
      // are on the only beat of one beat. The label is meaningful
      // only when the visitor needs to track progress through a
      // multi-beat scenario.
      beatCount > 1 ? h('div', {
        style: {
          marginBottom: '8px',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
          letterSpacing: '0.30em', color: COLOR.mutedText,
        },
      }, 'BEAT ' + (beatIndex + 1) + ' OF ' + beatCount) : null,
      // Setup paragraph FIRST — the GM gives the narrative situation.
      // Typography matched to BasicResultPanel's interpretation copy
      // (Rajdhani italic, clamp 13-15px, 1.55 line-height) so the
      // cross-fade reads as the SAME prose stream changing words.
      h('div', {
        style: {
          maxWidth: '560px', margin: '0 auto 14px',
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(13px, 2vh, 15px)',
          lineHeight: 1.55,
          color: COLOR.bodyText,
          fontStyle: 'italic',
          textAlign: 'center',
        },
      }, beat.setup),
      // Check description AFTER setup — what the player commits to doing
      // about the situation. Rajdhani regular (not italic, not mono) at
      // 14px sits as a caption beneath the narrative, like a film
      // script's stage direction below the dialogue. Gold preserves the
      // operator/chrome semantic without the mono spacing that made
      // longer check strings hard to read at 11px.
      h('div', {
        style: {
          maxWidth: '560px', margin: '0 auto 14px',
          fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)',
          color: COLOR.operatorGold,
          textAlign: 'center',
        },
      }, beat.check),
      // Beat 5 INVOKE DESTINY panel — single button. Visible until the
      // user invokes; replaced by the visual sequence + dice scroll.
      (beat.invokeDestiny && !invokedDestiny) ? h(DestinyInvokePanel, {
        eyebrow: beat.invokeDestiny.eyebrow,
        copy: beat.invokeDestiny.copy,
        subcopy: beat.invokeDestiny.subcopy,
        onInvoke: handleInvoke,
      }) : null
    );

    // Result panel wrapped in destiny-result-glow when the dramatic
    // moment landed (per spec §8.6 — opacity-only filter, vestibular-safe).
    var dramaticDestinyMoment = !!(beat.invokeDestiny && invokedDestiny && resolved && (resolved.triumph > 0));
    var centerResult = h('div', {
      className: dramaticDestinyMoment ? 'destiny-result-glow' : null,
      style: { width: '100%' },
    },
      h(BasicResultPanel, {
        resolved: resolved,
        interpretation: interpretation,
        collision: true,
      })
      // CalloutPanel removed (per user direction). The new universal
      // triumph/despair celebration animation in BasicResultPanel
      // handles the rare-outcome emphasis the callouts previously did.
    );

    // Center cross-fade. Synchronized with BasicResultPanel's collision
    // sequence (gold-flash + symbol-fly-in + headline-resolve). Trigger
    // is `choreo.isResultVisible` flipping true — same flag that
    // previously hard-swapped narrative ↔ result. Now narrative fades
    // OUT (600ms opacity) at the same instant the result panel mounts
    // and runs its collision animation. Both children are absolute-
    // positioned within the wrapper so the dice slots above and below
    // don't shift when content changes.
    var showResult = choreo.isResultVisible;
    var fadeMs = choreo.reducedMotion ? 0 : 600;
    var centerContent = h('div', {
      style: {
        position: 'relative',
        width: '100%',
        minHeight: 'clamp(220px, 36vh, 320px)',
      },
    },
      // Narrative — absolute, opacity-controlled. The single section-
      // level handleSectionTap owns both read-skip and hold-advance,
      // so the narrative div doesn't need its own onClick. pointerEvents
      // none when the result has taken over so taps go through to the
      // result panel beneath.
      h('div', {
        style: {
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: showResult ? 0 : 1,
          transition: 'opacity ' + fadeMs + 'ms ease',
          pointerEvents: showResult ? 'none' : 'auto',
        },
      }, centerNarrative),
      // Result panel — mounts only when showResult flips true so the
      // collision animations fire on mount. Absolute-positioned to
      // share the wrapper's space with narrative without layout shift.
      showResult ? h('div', {
        style: {
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, centerResult) : null
    );

    // Mount the INVOKE visual sequence briefly after the user taps
    // INVOKE — until the result panel appears (which has its own
    // collision animation). Both child elements have `pointer-events:
    // none` so they don't intercept anything.
    var invokeSequence = (invokedDestiny && !choreo.isResultVisible && invokeOrigin)
      ? h(DestinyInvokeSequence, { origin: invokeOrigin })
      : null;

    return h('section', {
      'aria-label': 'Beat ' + (beatIndex + 1) + ' of ' + beatCount,
      onClick: handleSectionTap,
      style: {
        animation: 'slideUpFade 0.32s ease both',
        minHeight: 'calc(100vh - 72px)',
        display: 'flex', flexDirection: 'column',
        cursor: sectionCursor,
        position: 'relative',  // anchors the absolute beat-1 hint below
      },
    },
      invokeSequence,
      h(DiceSplitLayout, {
        ariaLabel: 'Beat ' + (beatIndex + 1),
        centerAriaLabel: 'Beat narrative or result',
        style: { flex: '1 1 auto' },
        top: h(PoolStrip, Object.assign({}, sharedPoolStripProps, { side: 'player' })),
        center: centerContent,
        bottom: h(PoolStrip, Object.assign({}, sharedPoolStripProps, { side: 'gm' })),
      }),
      // Beat 1 tap hint — fades in after 3s of inactivity on Beat 1
      // only, dies on first interaction. Reuses the trailer's
      // .trailer-tap-hint visual treatment for consistency.
      (beatIndex === 0 && !isInvokeBeat) ? h('div', {
        'aria-hidden': true,
        className: 'trailer-tap-hint' + (showBeatHint ? ' visible' : ''),
        style: {
          position: 'absolute',
          bottom: 'clamp(36px, 7vh, 72px)',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-xs)',
          letterSpacing: '0.30em',
          color: 'rgba(255,255,255,0.50)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        },
      }, 'TAP TO CONTINUE  ›') : null
      // NEXT / BUILD YOUR OWN POOL button removed — tap-anywhere on the
      // section during hold phase advances. handleSectionTap → handleAdvance
      // covers both Beats 1-4 (next beat) and Beat 5 (DemoCompletePanel
      // → practice mode). Pattern matches the trailer/transition's tap-
      // to-advance throughout the onboarding flow.
    );
  }

  // ── Novel-mechanic callout panel ─────────────────────────────────
  // Surfaces below the result panel, before the NEXT button. One-time
  // teaching moment that fires on first applicable result (mixed,
  // triumph, despair, force-pip) and never fires again unless the
  // visitor re-runs the intro (the Intro bottom-tab / ?intro). Spec §S2-5.2.

  function CalloutPanel(props) {
    var key = props.calloutKey;
    if (!key) return null;
    var copy = CALLOUT_COPY[key];
    var accent = CALLOUT_ACCENT[key];
    var collision = !!props.collision;
    return h('div', {
      role: 'note',
      className: collision ? 'collision-callout' : null,
      style: {
        margin: '14px auto 0',
        maxWidth: collision ? 'min(440px, 92vw)' : '440px',
        padding: collision ? 'clamp(8px, 1.6vh, 12px) clamp(12px, 3vw, 16px)' : '12px 16px',
        background: 'linear-gradient(135deg, ' + accent + '14, ' + accent + '04)',
        border: '1px solid ' + accent + '88',
        borderRadius: '6px',
        animation: collision ? 'none' : 'slideUpFade 0.4s ease 0.2s both',
        textAlign: 'center',
      },
    },
      h('div', {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: collision ? 'clamp(10px, 1.8vh, 12px)' : '11px',
          letterSpacing: '0.18em', color: accent,
          fontWeight: 700, lineHeight: 1.5,
        },
      }, copy)
    );
  }

  // ── DestinyInvokePanel — single-affordance INVOKE for demo Beat 5 ─
  //
  // Reframes the old SPEND/SKIP fork into a narrative invocation moment.
  // One button. Tapping it always proceeds to the scripted dramatic
  // success — the demo simplifies for evangelism (the *feeling* of a
  // canon Destiny moment), not for strategic teaching. The full
  // strategic mechanic stays in practice-mode's DestinyBar (commit 7).
  //
  // The previous DestinyOfferPanel (two-button SPEND/SKIP) was deleted
  // in this commit. DestinyBar's spend menu uses its own closure-scoped
  // styling helpers; nothing reused from DestinyOfferPanel, so the
  // deletion is clean.

  function DestinyInvokePanel(props) {
    var eyebrow = props.eyebrow || 'A LIGHT-SIDE POINT BURNS';
    var copy = props.copy || 'INVOKE DESTINY';
    var subcopy = props.subcopy;
    return h('div', {
      ref: props.panelRef,
      'aria-label': 'Destiny invocation',
      style: {
        margin: '20px auto 0', maxWidth: '480px',
        padding: '16px 18px',
        background: 'linear-gradient(135deg, rgba(245,236,215,0.10), rgba(245,236,215,0.02))',
        border: '1px solid ' + COLOR.fadCream + '66',
        borderLeft: '3px solid ' + COLOR.fadCream,
        borderRadius: '6px',
        textAlign: 'center',
      },
    },
      h('div', {
        style: {
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
          letterSpacing: '0.22em', color: COLOR.fadCream,
          marginBottom: '12px',
        },
      }, eyebrow),
      subcopy ? h('div', {
        style: {
          fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.55,
          color: COLOR.bodyText, marginBottom: '16px',
          fontStyle: 'italic',
        },
      }, subcopy) : null,
      h('button', {
        type: 'button',
        onClick: props.onInvoke,
        'aria-label': 'Invoke destiny',
        style: {
          background: 'linear-gradient(135deg, ' + COLOR.fadCream + '44, ' + COLOR.fadCream + '11)',
          border: '1px solid ' + COLOR.fadCream + 'CC',
          borderRadius: '6px',
          color: COLOR.fadCream,
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 'var(--fs-sm)', letterSpacing: '0.22em',
          padding: '0 28px', minHeight: '52px', minWidth: '180px',
          cursor: 'pointer',
          touchAction: 'manipulation',
          boxShadow: '0 0 14px ' + COLOR.fadCream + '55',
        },
      }, copy)
    );
  }

  // Plays the INVOKE visual sequence: light-token glyph flying from the
  // INVOKE button position toward the dice strip + a gold pulse across
  // the surface. CSS keyframes do the actual motion; this component
  // mounts the elements briefly and unmounts them after ~700ms. The
  // origin point is passed in via the `origin` prop ({x, y}) so the
  // token starts where the button was tapped.
  function DestinyInvokeSequence(props) {
    var origin = props.origin || { x: 0, y: 0 };
    var tokenChar = (SWRPG.SYMBOLS && SWRPG.SYMBOLS.light && SWRPG.SYMBOLS.light.char) || '';
    // Compute the fly target — toward viewport center, slightly above
    // (where the dice strip's top section sits). CSS variables give
    // the keyframe a per-mount destination.
    var dx = (typeof window !== 'undefined' ? window.innerWidth / 2 : 200) - origin.x;
    var dy = (typeof window !== 'undefined' ? window.innerHeight * 0.25 : 200) - origin.y;
    return h(React.Fragment, null,
      h('div', {
        className: 'destiny-token-fly',
        'aria-hidden': 'true',
        style: {
          left: origin.x + 'px',
          top: origin.y + 'px',
          // Center the glyph on the tap point. Token is 32px font-size;
          // negative half-width/height shifts the element so its CENTER
          // sits at (origin.x, origin.y) rather than its top-left.
          marginLeft: '-16px',
          marginTop: '-16px',
          '--token-dx': dx + 'px',
          '--token-dy': dy + 'px',
        },
      }, SWRPG.fontAbsent && SWRPG.fontAbsent() ? SWRPG.dieTag('light', null, 'tag') : tokenChar),   // T3 (ADDENDUM 6)
      h('div', {
        className: 'destiny-gold-pulse',
        'aria-hidden': 'true',
      })
    );
  }

  function ScenarioPlayer(props) {
    var scenario = props.scenario;
    var onComplete = props.onComplete;
    var onSkipOnboarding = props.onSkipOnboarding;

    // Phase: 'intro' (IntroHero) → 'trailer' (TrailerSlideshow) →
    // 'transition' (TransitionSlide) → 'scenario' (BeatStage). Trailer
    // + transition + scenario are one onboarding unit; SKIP from
    // intro/trailer jumps to practice mode via onSkipOnboarding. The
    // transition is a 5.5s one-shot bridge (no SKIP — tap-anywhere
    // exits to scenario early).
    //
    // skipIntro=true (used by ?short=N URL routing for YouTube Shorts
    // capture) boots the phase machine straight to 'scenario', bypassing
    // intro/trailer/transition. The visitor (= the recording user)
    // lands on the BeatStage cinematic immediately.
    var _phase = useState(props.skipIntro ? 'scenario' : 'intro');
    var phase = _phase[0], setPhase = _phase[1];

    var _idx = useState(0);  // 0..N-1 = beats (only valid in 'scenario' phase)
    var beatIndex = _idx[0], setBeatIndex = _idx[1];

    var reducedMotion = usePrefersReducedMotion();

    // Carry-forward context accumulator. Schema retained for future
    // scenarios that mix scripted/random beats; sabotage-drydock
    // (current scenario) uses no carryForward functions.
    var _ctx = useState({});
    var carryContext = _ctx[0], setCarryContext = _ctx[1];

    // Inter-beat fade orchestration. Tap NEXT triggers a 300ms opacity
    // fade-out on the current beat, then setBeatIndex (which mounts the
    // next beat with its own slideUpFade entrance keyframe). Without
    // this, the hard mount/unmount flashes between beats. The fade is
    // a `beatFadingOut` boolean that wraps the beat container at
    // opacity 0 / transition 300ms.
    var _fadingOut = useState(false);
    var beatFadingOut = _fadingOut[0], setBeatFadingOut = _fadingOut[1];
    var BEAT_FADE_MS = 300;

    // begin() fires on BEGIN tap from IntroHero. This is the canonical
    // first user-gesture for the cinematic, so we use it to warm the
    // audio context (iOS Safari quirk — see useDiceAudio comment block).
    // The warmer is idempotent; calling it on every begin() is safe.
    function begin() {
      _audio.warmAudioContext();
      setPhase('trailer');
    }
    function trailerComplete() { setPhase('transition'); }
    function transitionComplete() { setPhase('scenario'); setBeatIndex(0); }
    function advance() {
      var current = scenario.beats[beatIndex];
      // Apply carry-forward from the just-finished beat. Each beat's
      // carryForward output REPLACES the context entirely (rather than
      // merging with prior context) so flags don't bleed across beats.
      var nextCtx = {};
      if (current && typeof current.carryForward === 'function') {
        var carry = computeCarryForward(current);
        if (carry) nextCtx = carry;
      }

      // Begin the inter-beat fade-out. After BEAT_FADE_MS, swap the
      // beat index (which unmounts the old BeatStage and mounts the
      // new one with its own slideUpFade entrance), then clear the
      // fade so the new beat is fully visible.
      setBeatFadingOut(true);
      setTimeout(function () {
        setCarryContext(nextCtx);
        var next = beatIndex + 1;
        if (next >= scenario.beats.length) {
          onComplete && onComplete();
        } else {
          setBeatIndex(next);
        }
        setBeatFadingOut(false);
      }, BEAT_FADE_MS);
    }

    // Resolved-result carry-forward bookkeeping. BeatStage publishes
    // its resolved object to a parent-owned ref via the onResolved
    // prop so advance() can run the carryForward function with the
    // actual roll outcome. (Lift-state-up alternative would be
    // heavier; this stays scoped.)
    var resolvedRef = global.React.useRef(null);
    function publishResolved(r) { resolvedRef.current = r; }
    function computeCarryForward(beat) {
      var r = resolvedRef.current;
      if (!r) return null;
      try { return beat.carryForward(r); }
      catch (e) { return null; }
    }

    // Body-class management lifted to DiceSurface (parent) so the
    // pure-black cinematic look applies across the entire dice
    // surface — including practice mode, which renders PracticeRoller
    // instead of ScenarioPlayer.

    if (phase === 'intro') {
      return h(IntroHero, {
        beatCount: scenario.beats.length,
        onBegin: begin,
        onSkipOnboarding: onSkipOnboarding,
      });
    }

    if (phase === 'trailer') {
      return h(TrailerSlideshow, {
        reducedMotion: reducedMotion,
        onComplete: trailerComplete,
        onSkip: onSkipOnboarding,
      });
    }

    if (phase === 'transition') {
      return h(TransitionSlide, {
        reducedMotion: reducedMotion,
        onComplete: transitionComplete,
      });
    }

    var beat = scenario.beats[beatIndex];
    var isLast = beatIndex === scenario.beats.length - 1;

    // Beat counter pill removed (per user direction). The inline
    // "BEAT N OF 5" label inside centerNarrative remains as the sole
    // progress indicator — visible during the read phase, fades with
    // the rest of the narrative during the cross-fade to result.
    return h(global.React.Fragment, null,
      // Inter-beat fade wrapper. opacity-only transition so the beat
      // content fades out cleanly before the next beat mounts. The
      // child's BeatStage runs its own slideUpFade on mount, so the
      // visitor sees: old beat fades to 0 → swap → new beat fades from 0.
      h('div', {
        style: {
          opacity: beatFadingOut ? 0 : 1,
          transition: 'opacity ' + BEAT_FADE_MS + 'ms ease',
        },
      },
        h(BeatStage, {
          key: beat.id,
          beat: beat,
          beatIndex: beatIndex,
          beatCount: scenario.beats.length,
          carryContext: carryContext,
          onAdvance: advance,
          onResolved: publishResolved,
          isLast: isLast,
        })
      )
    );
  }

  function DemoCompletePanel(props) {
    return h('section', {
      'aria-label': 'Demo complete',
      style: {
        padding: '40px 16px 24px',
        textAlign: 'center',
        animation: 'slideUpFade 0.4s ease both',
      },
    },
      h('div', {
        style: {
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
          letterSpacing: '0.30em', color: COLOR.operatorGold,
          marginBottom: '14px',
        },
      }, 'DEMO COMPLETE'),
      h('button', {
        type: 'button',
        onClick: props.onContinue,
        'aria-label': 'Switch to practice mode and build your own pool',
        style: {
          background: 'linear-gradient(135deg, ' + COLOR.operatorGold + ', #C9A02E)',
          border: '1px solid ' + COLOR.operatorGold,
          borderRadius: '8px',
          color: '#000',
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 'var(--fs-sm)', letterSpacing: '0.18em',
          padding: '0 28px', minHeight: '56px', minWidth: '220px',
          cursor: 'pointer',
          touchAction: 'manipulation',
          boxShadow: '0 0 18px ' + COLOR.operatorGold + '55',
        },
      }, 'BUILD YOUR OWN POOL')
    );
  }

  // ── Top-level surface ────────────────────────────────────────────

  function initialMode() {
    // DE-GATED (Lap L2): HoloDice opens to the ROLLER for everyone. The cinematic intro is now an
    // OPT-IN offer, not a first-visit gate — reached via HoloDice's Intro bottom-tab (/dice/?intro)
    // or a ?short=N capture URL. (Research/HIG: the launch screen isn't a branding gate; the launchpad is
    // the suite front door, and the intro is HoloDice-hosted now.)
    //   ?intro   → play the cinematic (the launchpad offer + any direct intro link)
    //   ?short=N → play a Shorts capture scenario (marketing); DiceSurface reads the same param
    if (typeof global !== 'undefined' && global.location && global.location.search) {
      try {
        var params = new URLSearchParams(global.location.search);
        if (params.has('short') || params.has('intro')) return 'demo';
      } catch (e) {}
    }
    return 'practice';
  }

  function DiceSurface() {
    var _mode = useState(initialMode);
    var mode = _mode[0], setMode = _mode[1];
    // F-46 D4: layout mode (G10) for the desktop stage-centering pass. Distinct from the dice `mode`
    // (practice/demo) above. Subscribe to the layout event so a resize/rotation restyles in place (A4).
    var _lm = useState(function () { return (global.SWRPGLayout && global.SWRPGLayout.mode()) || 'mobile'; });
    var layoutMode = _lm[0], setLayoutMode = _lm[1];
    useEffect(function () {
      function on() { setLayoutMode((global.SWRPGLayout && global.SWRPGLayout.mode()) || 'mobile'); }
      global.addEventListener('swrpg-layout-changed', on);
      return function () { global.removeEventListener('swrpg-layout-changed', on); };
    }, []);
    // HoloDice URL-as-state (nav Phase 2a): mode practice/demo ↔ /dice/ vs /dice/?intro. start() seeds the
    // entry from the CURRENT url (so ?short capture links are preserved), restores mode on Back/reload, and
    // Back from a replay-entered demo returns to practice (not a site-exit). The dice engine is untouched.
    var routerRef = React.useRef(null);
    useEffect(function () {
      if (!makeRouter) return undefined;
      var r = makeRouter({
        parsePath: function (path, search) {
          var q; try { q = new URLSearchParams(search || ''); } catch (e) { q = null; }
          return { mode: (q && (q.has('intro') || q.has('short'))) ? 'demo' : 'practice' };
        },
        pathFor: function (route) { return route.mode === 'demo' ? '/dice/?intro' : '/dice/'; },
        apply: function (route) { setMode(route.mode); },
      });
      routerRef.current = r;
      return r.start();
    }, []);
    // DICE KEY reference, lifted here (nav 2c) so the bottom bar + PracticeRoller both open it.
    var _ref = useState(false);
    var refOpen = _ref[0], setRefOpen = _ref[1];
    useBackToClose(refOpen, function () { setRefOpen(false); });
    // M2 — Results Reference (the cited symbol-spend menu), a co-equal HoloDice reference beside the roller.
    var _res = useState(false);
    var resultsOpen = _res[0], setResultsOpen = _res[1];
    useBackToClose(resultsOpen, function () { setResultsOpen(false); });
    var ResultsReference = window.SWRPGUI && window.SWRPGUI.ResultsReference;
    var _done = useState(false);
    var demoDone = _done[0], setDemoDone = _done[1];

    var autoHide = useAutoHideChrome();
    var audio = useDiceAudio();
    var odds = useOddsToggle();   // R-DTA-R2 — readout visibility, default off
    var interpret = useInterpretToggle();   // Lap B — roll-interpretation visibility, default off

    // Body-class effect for "dice surface active": locks body scroll,
    // hides FooterChrome route cards, and suppresses the body::before
    // gold inner-edge glow so the entire /dice surface reads as a
    // pure-black cinematic across intro/trailer/transition/scenario
    // AND practice mode. Lifted up from ScenarioPlayer so practice
    // mode (which renders PracticeRoller, not ScenarioPlayer) gets
    // the same treatment.
    useEffect(function () {
      if (typeof document === 'undefined') return;
      document.body.classList.add('dice-demo-active');
      return function () {
        document.body.classList.remove('dice-demo-active');
      };
    }, []);

    // Scenario selection. Default = canonical 5-beat sabotage demo.
    // Override via ?short=N URL param to load a Shorts capture
    // scenario by id ('short-1' through 'short-10'). Unknown ids
    // log a warning and fall back to canonical so a mistyped URL
    // during recording sessions doesn't blank the screen.
    var requestedScenarioId = useMemo(function () {
      if (typeof global === 'undefined' || !global.location || !global.location.search) return null;
      try {
        var params = new URLSearchParams(global.location.search);
        var n = params.get('short');
        return n ? ('short-' + n) : null;
      } catch (e) { return null; }
    }, []);

    var scenario = useMemo(function () {
      if (!SCENARIOS_API || !SCENARIOS_API.canonical) return null;
      if (!requestedScenarioId) return SCENARIOS_API.canonical();
      var found = SCENARIOS_API.byId && SCENARIOS_API.byId(requestedScenarioId);
      if (!found) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[dice] No Short with id:', requestedScenarioId, '— falling back to canonical demo');
        }
        return SCENARIOS_API.canonical();
      }
      return found;
    }, [requestedScenarioId]);

    function finishDemo() {
      setDemoDone(true);
    }
    function enterPractice() {
      safeWrite(INTRO_SEEN_KEY, '1');
      setDemoDone(false);
      // replace (not push): the visitor skipped/finished the demo — Back shouldn't return into it.
      if (routerRef.current) routerRef.current.replace({ mode: 'practice' }); else setMode('practice');
    }
    function replayIntro() {
      // Clear all visitor flags + state and bounce back to demo from the
      // top. localStorage scrub: intro_seen, callout_*, destiny, recents.
      //
      // C-B-4 (ruling `f34-phase-b-scope` §4) asked whether `swrpg_dice_destiny` and
      // `swrpg_dice_recent_pools` are dead, since NOTHING in the tree writes them — and the
      // standing invariant is delete, don't stub. THE ANSWER IS NO, and the evidence is in history
      // rather than in the tree, which is why a grep alone would have got this wrong:
      //   · `swrpg_dice_destiny`      shipped in 13b5cf3 (destiny pool bar), removed in 9b571b9
      //   · `swrpg_dice_recent_pools` shipped in e41437d, removed in 0127948 (RecentPoolsPanel)
      // Both were real features in builds real people used, so their keys can still be sitting in
      // those browsers. This line is not a reference to dead code — it is the CLEANUP that clears
      // their orphans, and deleting it would strand that data permanently. It stays, and neither
      // key joins the sync set.
      ['swrpg_dice_intro_seen', 'swrpg_dice_destiny', 'swrpg_dice_recent_pools'].forEach(function (k) {
        try { global.localStorage && global.localStorage.removeItem(k); } catch (e) {}
      });
      clearAllCalloutFlags();
      setDemoDone(false);
      // push (not replace): entered demo from practice → Back returns to practice.
      if (routerRef.current) routerRef.current.navTo({ mode: 'demo' }); else setMode('demo');
    }

    // skipOnboarding is enterPractice with explicit naming — used by
    // both IntroHero's SKIP DEMO button and the trailer's SKIP button.
    // Same semantic ("exit onboarding entirely → practice mode"); two
    // surfaces.
    var skipOnboarding = enterPractice;

    var body;
    if (mode === 'demo' && scenario) {
      body = demoDone
        ? h(DemoCompletePanel, { onContinue: enterPractice })
        : h(ScenarioPlayer, {
            scenario: scenario,
            onComplete: finishDemo,
            onSkipOnboarding: skipOnboarding,
            // Skip intro/trailer/transition when loading a Shorts
            // capture scenario via ?short=N — boot straight into the
            // BeatStage cinematic. Organic /dice visitors (no param)
            // get the full intro flow as today.
            skipIntro: !!requestedScenarioId,
          });
    } else {
      body = h(PracticeRoller, { oddsVisible: odds.enabled, interpretVisible: interpret.enabled,
        onOpenReference: function () { setRefOpen(true); } });
    }

    var SB = window.SWRPGUI && window.SWRPGUI.SuiteBar;
    var BN = window.SWRPGUI && window.SWRPGUI.BottomNav;
    var bnActive = mode === 'demo' ? 'intro' : (resultsOpen ? 'results' : (refOpen ? 'dicekey' : 'roller'));
    var bnItems = [
      { id: 'roller', label: 'Roller', icon: navIcon('dices'), onSelect: function () { setRefOpen(false); setResultsOpen(false); if (routerRef.current) routerRef.current.replace({ mode: 'practice' }); else setMode('practice'); } },
      { id: 'dicekey', label: 'Dice Key', icon: navIcon('key-round'), onSelect: function () { setResultsOpen(false); setRefOpen(true); } },
      { id: 'results', label: 'Results', icon: navIcon('table'), onSelect: function () { setRefOpen(false); setResultsOpen(true); } },
      { id: 'intro', label: 'Intro', icon: navIcon('tv-minimal-play'), onSelect: replayIntro },
    ];
    // HoloDice, lap `holotable-refinements`: the separate "Dice controls" ModuleMenu is DISSOLVED. View Odds / Interpret
    // Roll are view-PREFERENCES (not module actions like the Map's Grid/Route), so they live in the suite ⚙
    // settings alongside Sound / Auto-hide. Dice Key + Intro were dropped — they're bottom-bar tabs.
    var suiteSettings = [
      { label: 'Sound', kind: 'toggle', value: audio.enabled, onToggle: audio.toggle },
      { label: 'Auto-hide UI', kind: 'toggle', value: !autoHide.pinned, onToggle: autoHide.togglePinned },
      { label: 'View Odds', kind: 'toggle', value: odds.enabled, onToggle: odds.toggle },
      { label: 'Interpret Roll', kind: 'toggle', value: interpret.enabled, onToggle: interpret.toggle },
    ];
    return h('div', {
      style: { position: 'relative', minHeight: '100vh' },
    },
      // Suite bar (navigation Phase 1) — fixed top; carries the ⚙ app-settings (Sound / Auto-hide, nav 3a).
      SB ? h('div', { className: 'autohide-chrome', style: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 31 } },
        h(SB, { app: 'dice', accent: '#B080FF', appName: 'HOLODICE', autohide: true, settings: suiteSettings })) : null,
      // Bottom nav (navigation Phase 2c) — fixed bottom, .autohide-chrome so it hides with the cinematic.
      BN ? h('div', { className: 'autohide-chrome', style: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 31 } },
        h(BN, { app: 'dice', label: 'HoloDice', accent: '#B080FF', items: bnItems, activeId: bnActive })) : null,
      // DICE KEY reference (lifted to app level) — opened by the bottom bar or PracticeRoller's button.
      refOpen ? h(DiceReference, { onClose: function () { setRefOpen(false); } }) : null,
      // M2 — Results Reference overlay (co-equal to the Dice Key; characterless by construction — D-RR1).
      resultsOpen && ResultsReference ? h('div', {
        onClick: function () { setResultsOpen(false); }, role: 'dialog', 'aria-label': 'Results reference',
        'data-testid': 'results-reference',
        style: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto' },
      },
        h('div', {
          onClick: function (e) { e.stopPropagation(); },
          style: { maxWidth: '440px', width: '100%', margin: '54px 0 24px',
            background: 'radial-gradient(110% 80% at 0% 0%, ' + COLOR.fadPurple + '12, transparent 55%), #0A0A0C',
            border: '1px solid ' + COLOR.fadPurple + '45', borderRadius: '14px', padding: '18px' },
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
            h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '0.10em', color: '#fff' } }, 'RESULTS REFERENCE'),
            h('button', { type: 'button', 'aria-label': 'Close', onClick: function () { setResultsOpen(false); },
              style: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1,
                minWidth: '44px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' } }, '✕')),
          h(ResultsReference, { accent: COLOR.fadPurple })
        )
      ) : null,
      // (The separate "Dice controls" ModuleMenu is gone — HoloDice, lap `holotable-refinements`; its View Odds / Interpret
      //  Roll toggles moved into the suite ⚙ settings, and Dice Key + Intro are bottom-bar tabs.)
      h('main', {
        style: {
          paddingBottom: '70px',  // make room for the fixed bottom nav (nav 2c)
          paddingTop: '64px',  // suite bar (54px) + a touch (the Dice-controls strip is gone)
          // No position/z-index here — would create a stacking context
          // and trap full-screen overlays (TrailerSlideshow, RollOverlay)
          // beneath the FooterChrome's z-index 2.
          // F-46 D4: on desktop, center the in-flow stage (demo 900 / practice-tutor drills 720) instead
          // of full-bleeding a 620→∞ column. Fixed cinematic overlays (RollOverlay/TrailerSlideshow) are
          // position:fixed → they escape this cap and still take the full screen. maxWidth+margin create
          // NO stacking context / containing block, so the overlay-trap warning above still holds.
          maxWidth: layoutMode === 'desktop' ? (mode === 'practice' ? '720px' : '900px') : undefined,
          margin: layoutMode === 'desktop' ? '0 auto' : undefined,
        },
      }, body),
    );
  }

  // ── inlineSurface — imperative cinematic-roll entry point ──────────────
  // The GM PLAYING surface (ENCOUNTER_WIZARD_SPEC.md §4 "Dice surface") fires
  // a cinematic RollOverlay from an event handler and gets the result back on
  // a callback, so the result can persist to the active actor card as a "Last
  // roll" pill — replacing the stateless imperative roll-modal pattern. Mirrors
  // PracticeRoller.rollNow (resolve immediately; the overlay animates the
  // already-known result) plus that modal's imperative mount (host div +
  // ReactDOM root). The modal itself is gone (B-1209 retire, D-172): the
  // player sheet rolls in its paper dice hub, so this is the one imperative
  // roll mount left.
  //
  //   SWRPGDice.inlineSurface({
  //     pool,         // pre-built dice-count pool ({ability, difficulty, …})
  //     spec,         // OR a PoolSpec → buildPool() (pool takes precedence)
  //     reducedMotion,
  //     context,      // opaque caller data echoed back (actor/target/weapon…)
  //     onResolved,   // (resolved, { dieResults, pool, context, close }) => …
  //     onDismiss,    // () => overlay closed
  //   }) → { close, resolved, dieResults }
  function inlineSurface(opts) {
    opts = opts || {};
    var ReactDOM = global.ReactDOM;
    if (!ReactDOM || !ReactDOM.createRoot) {
      if (global.console) global.console.error('[inlineSurface] ReactDOM.createRoot unavailable');
      return { close: function () {} };
    }
    // Accept a pre-built pool, or derive one from a spec via the engine's
    // buildPool (the same path diceUI uses); fall back to the spec as-is.
    var pool = opts.pool || (opts.spec && SWRPG.buildPool ? SWRPG.buildPool(opts.spec) : opts.spec) || null;
    if (!pool) {
      if (global.console) global.console.error('[inlineSurface] no pool/spec provided');
      return { close: function () {} };
    }
    // Resolve immediately; RollOverlay animates the already-known result.
    // Mirror PracticeRoller.rollPool exactly: rollAndResolve → { results,
    // resolved }, with the pool attached onto resolved (the result panel
    // reads resolved.pool).
    var both = SWRPG.rollAndResolve(pool);
    var dieResults = both.results;
    var resolved = Object.assign({ pool: pool }, both.resolved);

    var host = document.createElement('div');
    host.setAttribute('data-swrpg-inline-surface', '1');
    document.body.appendChild(host);
    var root = ReactDOM.createRoot(host);
    var closed = false;
    var notified = false;

    function cleanup() {
      if (closed) return;
      closed = true;
      if (root) root.unmount();
      if (host && host.parentNode) host.parentNode.removeChild(host);
      if (typeof opts.onDismiss === 'function') opts.onDismiss();
    }
    function fireResolved() {
      if (notified) return;
      notified = true;
      if (typeof opts.onResolved === 'function') {
        opts.onResolved(resolved, { dieResults: dieResults, pool: pool, context: opts.context, close: cleanup });
      }
    }
    function handleDismiss() {
      // Result lands on the caller (actor-card pill) when the cinematic
      // overlay is dismissed — the spec's "result persistence" behavior.
      fireResolved();
      cleanup();
    }

    root.render(h(RollOverlay, {
      pool: pool,
      dieResults: dieResults,
      resolved: resolved,
      reducedMotion: !!opts.reducedMotion,
      onDismiss: handleDismiss,
    }));
    return { close: cleanup, resolved: resolved, dieResults: dieResults };
  }

  global.SWRPGDiceSurface = DiceSurface;
  // Foundational-template reuse: expose the cinematic primitives + the
  // imperative inline-roll entry point (ENCOUNTER_WIZARD_SPEC §4) so the GM
  // PLAYING surface can fire context-carrying rolls without re-rendering the
  // whole surface. Defining these does not mount anything.
  global.SWRPGDiceSurface_Kit = {
    RollOverlay: RollOverlay,
    BasicResultPanel: BasicResultPanel,
    StepperRow: StepperRow,
    PoolStrip: PoolStrip,
    DiceSplitLayout: DiceSplitLayout,
    inlineSurface: inlineSurface,
  };
  // Spec calls it as SWRPGDice.inlineSurface(...) — attach there too
  // (diceEngine owns SWRPGDice and loads first; this just adds the entry point).
  if (global.SWRPGDice) { global.SWRPGDice.inlineSurface = inlineSurface; }

})(typeof window !== 'undefined' ? window : globalThis);
