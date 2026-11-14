/* lib/dice/scenarios.js
 *
 * Scripted demonstration scenarios for the /dice surface.
 *
 * Architecture: a SCENARIOS array exported on window.SWRPGScenarios. V1
 * ships with one scenario ("Sabotage at Drydock"); the picker UI in
 * dice.html is length-gated (no picker rendered when length === 1).
 * Adding scenario #2 is a pure content task — append a new object to
 * the array, ship.
 *
 * Per-beat schema (see SPEC §S2-3.1 + §S2-3.2 for full authoring guide):
 *
 *   {
 *     id:       string (kebab-case, unique within scenario)
 *     setup:    string (1-2 sentence narrative paragraph; in-universe,
 *               second-person where the protagonist acts)
 *     check:    string (one-line skill check description)
 *     pool:     {ability, proficiency, boost, difficulty, challenge,
 *                setback, force} integer counts. Engine pool shape.
 *     teaches:  array of mechanic ids that surface this beat for the
 *               first time. Drives one-time novel-mechanic callouts.
 *               Recognized: 'core-loop', 'boost', 'setback',
 *               'advantage-threat', 'triumph', 'despair', 'force-dice',
 *               'destiny-spend'.
 *     scriptedResult: optional {success, advantage, triumph, despair,
 *                     light, dark}. When present, the dice "roll"
 *                     choreography plays but lands on the scripted
 *                     outcome. `success` is a SIGNED integer; negative
 *                     values yield succeeded=false, netFailure=|success|
 *                     (Beat 2 uses success: -1).
 *     scriptedFaces: optional per-die face arrays that aggregate to
 *                    scriptedResult. Required when the visitor must see
 *                    a specific face on a specific die (e.g., the
 *                    triumph face on the proficiency die in Beat 4).
 *                    When omitted, synthesizeScriptedFaces() in
 *                    diceSurface.jsx fakes plausible faces from totals.
 *     interpretation: 8-key map keyed by result-type:
 *                     successClean, successAdvantage, successThreat,
 *                     failureClean, failureAdvantage, failureThreat,
 *                     triumph, despair. Each value is a one-line
 *                     in-universe sentence (no banned phrases:
 *                     let's, click here, you can, welcome, get
 *                     started, easy, simply, awesome, amazing).
 *                     scriptedResult beats use a single
 *                     `interpretation.scripted` field instead.
 *     destinyOffer: optional {available, copy, spentInterpretation,
 *                            unspentInterpretation}. Used on beats
 *                   that present a Destiny spend choice.
 *     invokeDestiny: optional {available, eyebrow, copy, subcopy}. The
 *                    single-tap INVOKE moment used by Beat 5.
 *     carryForward: OPTIONAL pure function (resolved) -> next-beat
 *                   pool/context modifier. Field stays in the schema
 *                   even when no current beat uses it; future
 *                   scenarios that mix scripted and random-roll beats
 *                   will need it. The sabotage-drydock scenario uses
 *                   it on no beats (all five are deterministic).
 *     settleOrder:  optional array of die-instance keys (e.g.,
 *                   'ability-0', 'challenge-0') controlling the
 *                   order dice settle in the cinematic. Last-settled
 *                   dice carry the most weight — push despair last
 *                   for max drama.
 *   }
 *
 * Reference Voice constraints: terse, in-universe, second-person
 * imperative for the protagonist's actions. Banned phrases per project
 * style. No em-dashes in user-facing copy (use periods or restructure).
 * No canonical Star Wars character names per licensing model — invent
 * generic operators or use X-Wing-novel-scale roles.
 */

(function (global) {
  'use strict';

  // ── Canonical v1 scenario ─────────────────────────────────────────
  //
  // A 5-beat sabotage arc designed to demonstrate every major
  // narrative-dice mechanic in 60-90 seconds. ALL beats are scripted
  // (all five lock to deterministic outcomes) so first-time visitors
  // always see the iconic outcome shapes the demo evangelizes:
  //
  //   Beat 1 — Stealth: core loop. SUCCESS WITH THREAT.
  //   Beat 2 — Charm: failure-with-advantage. The "dice don't just
  //            say yes or no" teaching moment.
  //   Beat 3 — Discipline + Force: clean Force-assisted success with
  //            light pip used.
  //   Beat 4 — Ranged: TRIUMPH + DESPAIR simultaneous (~0.7% natural
  //            probability — must be guaranteed for evangelism).
  //   Beat 5 — Coordination + Destiny: INVOKE DESTINY moment landing
  //            3 success + 1 advantage + 1 triumph (the pure-glory
  //            destiny-triumph variant).
  //
  // Ship class is Gozanti-class cruiser (canonical TIE-carrier customs
  // vessel from Rebels) — fits the "smaller than Star Destroyer, has a
  // hangar" constraint while staying in X-Wing-novel scale.

  var SABOTAGE_DRYDOCK = {
    id: 'sabotage-drydock',
    title: 'Sabotage at Drydock',
    hook: 'A Rebel cell needs a customs cruiser\'s logistics network blinded. One charge on the right component takes the ship out of the convoy chain for months.',
    setting: 'An Imperial Gozanti-class cruiser, mid-refit at a remote drydock. Plant a thermal charge on the main hyperdrive coupling and slip out before sublight checks complete.',

    beats: [
      // ── Beat 1 — Slip the hangar perimeter ──────────────────────
      // Scripted: 1 net success + 1 threat (no advantage, no triumph,
      // no despair). The visitor's first dice cinematic — show that
      // success can carry consequence even at the simplest pool.
      {
        id: 'beat-1-perimeter',
        setup: 'The hangar deck is half-empty. Two TIE fighters racked for refit, three deckhands cycling oxygen lines. The patrol catwalk overhead. Time the catwalk\'s pass and move.',
        check: 'Stealth check, Average difficulty.',
        pool: { ability: 2, difficulty: 2 },
        // `advantage` is SIGNED — negative = net threat (matches the
        // engine's resolve() convention; see lib/shared/diceEngine.js).
        // -1 here renders as "1 THREAT" in the result panel.
        scriptedResult: { success: 1, advantage: -1, triumph: 0, despair: 0, light: 0, dark: 0 },
        // Per-die faces verified vs DIE_FACES.difficulty: BLANK, F, FF,
        // H, H, H, HH, FH. The H face (threat-only) is index 3-5; the F
        // face (failure-only) is index 1.
        scriptedFaces: {
          ability:    [{ s: 1 }, { s: 1 }],     // 2 success
          difficulty: [{ f: 1 }, { h: 1 }],     // 1 failure + 1 threat (RAW)
        },
        // Net: 2s − 1f = 1 net success ; 0a − 1h = 1 net threat
        // Settle order: ability dice first (positive outcome lands),
        // then difficulty dice (the threat surfaces last).
        // Sells "the success was real, but the room noticed."
        settleOrder: ['ability-0', 'ability-1', 'difficulty-0', 'difficulty-1'],
        teaches: ['core-loop'],
        interpretation: {
          scripted: 'You make it past the catwalk. But a deckhand looked up at the wrong moment and clocked your face. You have minutes, not hours.',
        },
      },

      // ── Beat 2 — Bluff a deck officer ──────────────────────────
      // Scripted: 1 net failure + 1 advantage. Iconic
      // "failure-with-advantage" shape — the dice don't just say yes
      // or no. This is the only beat in the demo that exercises the
      // negative-success scriptedResult path.
      {
        id: 'beat-2-officer',
        setup: 'A deck officer steps out of the auxiliary bay and into your path. His datapad is open to the engineering corridor schematic, already pulled up for whatever he was about to do. He hasn\'t sounded the alarm. Yet.',
        check: 'Deception check, Hard difficulty. Setback for the officer\'s sharp eyes.',
        pool: { ability: 2, proficiency: 1, difficulty: 3, setback: 1 },
        scriptedResult: { success: -1, advantage: 1, triumph: 0, despair: 0, light: 0, dark: 0 },
        // Engine reads success > 0 for `succeeded`. -1 here yields
        // succeeded=false, netFailure=1 — see contract comment in
        // lib/shared/diceEngine.js resolve().
        scriptedFaces: {
          ability:     [{ s: 1, a: 1 }, {}],            // 1 success + 1 advantage
          proficiency: [{ s: 1 }],                       // 1 success
          difficulty:  [{ f: 1 }, { f: 1 }, { f: 1 }],   // 3 failure
          setback:     [{}],                             // blank
        },
        // Net: 2s − 3f = 1 net failure, 1 advantage. No threat, triumph, despair.
        settleOrder: [
          'ability-0', 'ability-1',
          'proficiency-0',
          'difficulty-0', 'difficulty-1', 'difficulty-2',
          'setback-0',
        ],
        teaches: ['advantage-threat'],
        interpretation: {
          scripted: 'He calls your bluff. As his datapad pulls up your forged ID for the security log, the engineering schematic is right there on his screen. You note the route while he writes you up.',
        },
      },

      // ── Beat 3 — Steady the charge (Force beat) ────────────────
      // Scripted: 1 net success + 1 light pip. Force as steady-the-
      // hand discipline check rather than power-stunt. Light pip
      // demonstrates the clean side of the Force without any cost.
      {
        id: 'beat-3-charge',
        setup: 'The hyperdrive coupling is exposed. The charge needs to mount on a precise contact point or the blast vents into vacuum. Your hand has to be perfectly still. You close your eyes briefly. The Force can steady a hand.',
        check: 'Cool check, Average difficulty, with one Force die.',
        pool: { ability: 1, proficiency: 1, difficulty: 2, force: 1 },
        scriptedResult: { success: 1, advantage: 0, triumph: 0, despair: 0, light: 1, dark: 0 },
        scriptedFaces: {
          ability:     [{ s: 1 }],
          proficiency: [{ s: 1 }],
          difficulty:  [{ f: 1 }, {}],
          force:       [{ l: 1 }],     // single light pip
        },
        // Net: 2s − 1f = 1 net success, 1 light pip used.
        settleOrder: ['ability-0', 'proficiency-0', 'difficulty-0', 'difficulty-1', 'force-0'],
        teaches: ['force-dice'],
        interpretation: {
          scripted: 'Steady. The calm flows into your wrist. The charge clicks home with a magnetic snap. The Force confirms it set true.',
        },
      },

      // ── Beat 4 — Caught at the door ────────────────────────────
      // Scripted: 1 success + 1 triumph + 1 despair. FFG's iconic
      // simultaneous triumph/despair shape (~0.7% natural probability).
      // This beat owns the triumph-WITH-COST teaching variant; Beat 5
      // owns the destiny-triumph (pure-glory) variant.
      {
        id: 'beat-4-caught',
        setup: 'The device is set. You turn for the hangar. The deck officer from earlier crashes into you, comm already keyed. You react first.',
        check: 'Ranged (Light) check, Hard difficulty, one die upgraded for the officer\'s reflexes.',
        pool: { ability: 2, proficiency: 1, difficulty: 2, challenge: 1 },
        scriptedResult: { success: 1, advantage: 0, triumph: 1, despair: 1, light: 0, dark: 0 },
        scriptedFaces: {
          ability:     [{ s: 1 }, { s: 1 }],            // 2 success
          proficiency: [{ s: 1, t: 1 }],                 // triumph face: 1s + 1 triumph
          difficulty:  [{ f: 1 }, {}],                   // 1 failure + blank
          challenge:   [{ f: 1, d: 1 }],                 // despair face: 1f + 1 despair
        },
        // Math: raw_s = 2 + 1 = 3, raw_f = 1 + 1 = 2 → net = 1 success ✓
        //       triumph = 1 ✓ , despair = 1 ✓ , advantage = 0 ✓
        // Settle order: player-side first (the win lands), then GM-side
        // (despair arrives last for max drama). Triumph callout fires on
        // proficiency die settle; despair callout fires on challenge die.
        settleOrder: [
          'ability-0', 'ability-1',
          'proficiency-0',
          'difficulty-0', 'difficulty-1',
          'challenge-0',
        ],
        teaches: ['triumph', 'despair'],
        interpretation: {
          scripted: 'You drop the officer cleanly. The shot finds a gap in his armor no one would have aimed for. But his comm hits the deck open, and the channel stays live. The drydock just heard everything. Hangar lockdown is starting. The corridor between you and the bay just sealed.',
        },
      },

      // ── Beat 5 — Roll under the blast door (INVOKE DESTINY) ────
      // Scripted: 3 success + 1 advantage + 1 triumph. The pure-glory
      // destiny-triumph variant. INVOKE DESTINY is a single-tap moment
      // — the visitor commits a light-side point and the universe bends.
      {
        id: 'beat-5-extract',
        setup: 'One blast door between you and the hangar. Lockdown is rolling section by section. There is another way.',
        check: 'Coordination check, Hard difficulty. The Force gathers around you.',
        pool: { ability: 2, proficiency: 1, difficulty: 3 },
        scriptedResult: { success: 3, advantage: 1, triumph: 1, despair: 0, light: 0, dark: 0 },
        scriptedFaces: {
          ability:     [{ s: 1 }, { s: 1, a: 1 }],   // 2 success + 1 advantage
          proficiency: [{ s: 1, t: 1 }],              // triumph face: +1 success
          // All three difficulty dice land on BLANK. Natural
          // probability is (1/8)^3 ≈ 0.2% — wildly unusual. Intentional:
          // it IS the visual payoff of "the universe bent for you."
          difficulty:  [{}, {}, {}],
        },
        invokeDestiny: {
          available: true,
          eyebrow: 'A LIGHT-SIDE POINT BURNS',
          copy: 'INVOKE DESTINY',
          subcopy: 'Tap to spend it. The universe bends for the next breath.',
        },
        // Player-side dice settle first so the dramatic success lands
        // visibly before the difficulty dice reveal their (blank) faces.
        settleOrder: [
          'ability-0', 'ability-1',
          'proficiency-0',
          'difficulty-0', 'difficulty-1', 'difficulty-2',
        ],
        teaches: ['destiny-spend', 'triumph'],
        interpretation: {
          scripted: 'You spend the point. The blast door above you stutters mid-cycle, frozen in a glitched position long enough for you to roll under it. You hit the hangar deck running. The TIE fighter you steal isn\'t even one anyone knew was prepped for launch.',
        },
      },
    ],
  };

  // ── YouTube Shorts capture scenarios ──────────────────────────────
  //
  // Single-beat scenarios used to record vertical YouTube Shorts that
  // teach narrative-dice mechanics by direct contrast with d20. Each
  // is loadable via /dice?short=N URL param. The existing BeatStage
  // cinematic renders them identically to a canonical demo beat.
  //
  // The `interpretation.{type}` strings are the ON-SCREEN result-panel
  // copy (1-2 sentences max — they appear during the hold phase). The
  // full validated VOICEOVER narration lives in
  // Docs/YOUTUBE_SHORTS_SCENARIOS.md and is added in post-production
  // over the captured cinematic. Don't cram voiceover-length copy
  // into the interpretation fields.
  //
  // Each Short uses scriptedResult to guarantee the canonical
  // outcome — natural probability for these outcomes is often 1-5%,
  // so RNG would force many takes per recording without it.

  var SHORT_1_DISARM = {
    id: 'short-1',
    title: 'The shot that misses but disarms',
    hook: 'A stormtrooper blocks your path. You fire to drop him.',
    setting: 'A miss with Advantage can still help you.',
    beats: [{
      id: 'short-1-shot',
      setup: 'A stormtrooper blocks your path. You fire to drop him.',
      check: 'Ranged (Light) check, Easy difficulty.',
      pool: { ability: 1, proficiency: 2, difficulty: 1 },
      scriptedResult: { success: -1, advantage: 2, triumph: 0, despair: 0, light: 0, dark: 0 },
      scriptedFaces: {
        ability:     [{ a: 1 }],                      // 1 advantage
        proficiency: [{ a: 1 }, {}],                  // 1 advantage + blank
        difficulty:  [{ f: 1 }],                      // 1 failure
      },
      // Net: 0 success - 1 failure = 1 net failure ; 2 advantage
      settleOrder: ['ability-0', 'proficiency-0', 'proficiency-1', 'difficulty-0'],
      teaches: ['advantage-threat'],
      interpretation: {
        scripted: 'Your shot strikes wide and hits a power panel. The explosion staggers the trooper, causing him to drop his rifle. You\'re almost out of there.',
      },
    }],
  };

  var SHORT_2_SLICER = {
    id: 'short-2',
    title: 'The slicer spike that wins and burns',
    hook: 'You slice the seal on an Imperial cargo crate.',
    beats: [{
      id: 'short-2-spike',
      setup: 'You jack a slicer spike into the lockplate of a sealed Imperial cargo crate. The seal cycles, weighing your bypass against its protocols.',
      check: 'Computers check, Average difficulty.',
      pool: { ability: 1, proficiency: 2, difficulty: 1, challenge: 1 },
      scriptedResult: { success: 1, advantage: 0, triumph: 0, despair: 1, light: 0, dark: 0 },
      scriptedFaces: {
        ability:     [{ s: 1 }],                      // S face
        proficiency: [{ s: 1 }, { s: 1 }],            // 2 × S face (need 3 total successes to outpace failures)
        difficulty:  [{ f: 1 }],                      // F face
        challenge:   [{ f: 1, d: 1 }],                // D face: 1 failure + 1 despair (canonical despair face per RAW)
      },
      // Net: 3s - 1f (difficulty) - 1f (despair face) = 1 net success ; 1 despair
      settleOrder: ['ability-0', 'proficiency-0', 'proficiency-1', 'difficulty-0', 'challenge-0'],
      teaches: ['despair'],
      interpretation: {
        scripted: 'The seal disengages. But your slicer spike arcs out in the lockplate, smoke curling from the slot. The crate is yours. Your kit is fried.',
      },
    }],
  };

  var SHORT_3_PERSUASION = {
    id: 'short-3',
    title: 'The persuasion that turns a stranger',
    hook: 'You try to convince a Senate aide to leak Imperial cargo manifests.',
    setting: 'A failed roll with Triumph still creates an opening.',
    beats: [{
      id: 'short-3-aide',
      setup: 'You corner a senate aide in a Coruscant plaza alcove. You ask her to leak the Imperial cargo manifests. Her loyalty to the Empire is well known.',
      check: 'Charm check, Hard difficulty (upgraded for opposed-to-target interests).',
      pool: { ability: 1, proficiency: 2, difficulty: 2, challenge: 1 },
      scriptedResult: { success: -2, advantage: 0, triumph: 1, despair: 0, light: 0, dark: 0 },
      scriptedFaces: {
        ability:     [{}],                            // blank
        proficiency: [{ t: 1, s: 1 }, {}],            // triumph face: 1 triumph + 1 success
        difficulty:  [{ f: 1 }, { f: 1 }],            // 2 failure
        challenge:   [{ f: 1 }],                      // 1 failure
      },
      // Net: 1s (from triumph) - 3f = 2 net failure. Triumph fires its boon despite failure.
      settleOrder: ['ability-0', 'proficiency-0', 'proficiency-1', 'difficulty-0', 'difficulty-1', 'challenge-0'],
      teaches: ['triumph'],
      interpretation: {
        scripted: 'The aide refuses you flatly. But her assistant, standing in the doorway, overheard everything. As you leave, the assistant follows you out. "I think we should talk."',
      },
    }],
  };

  var SHORT_4_SNIPER = {
    id: 'short-4',
    title: 'The shot that succeeds and curses',
    hook: 'You take a sniper shot at a corrupt Imperial Moff from across a crowded plaza.',
    beats: [{
      id: 'short-4-shot',
      setup: 'You sight the Imperial Moff across a crowded plaza. The Empire has cleaned up after his crimes for too long. You take aim. You have one shot.',
      check: 'Ranged (Heavy) check, Hard difficulty (upgraded for the public-space mission constraint).',
      pool: { ability: 1, proficiency: 3, difficulty: 2, challenge: 1, setback: 1 },
      scriptedResult: { success: 2, advantage: 0, triumph: 1, despair: 1, light: 0, dark: 0 },
      scriptedFaces: {
        ability:     [{ s: 1 }],                      // S face
        proficiency: [{ s: 1, t: 1 }, { s: 1 }, { s: 1 }],  // T face (triumph) + 2 × S face
        difficulty:  [{ f: 1 }, {}],                  // F face + BLANK
        challenge:   [{ f: 1, d: 1 }],                // D face: 1 failure + 1 despair (canonical RAW)
        setback:     [{}],                            // BLANK
      },
      // Net: 4s - 1f (difficulty) - 1f (despair face) = 2 net success ; triumph 1 ; despair 1
      settleOrder: [
        'ability-0',
        'proficiency-0', 'proficiency-1', 'proficiency-2',
        'difficulty-0', 'difficulty-1',
        'setback-0',
        'challenge-0',  // despair settles last for max drama
      ],
      teaches: ['triumph', 'despair'],
      interpretation: {
        scripted: 'The shot is perfect. He is dead before he hits the stone pavement. You catch a glint through your scope. A child was birdwatching through some binocs. You\'ve been seen. By morning, your description is on every Imperial channel from Coruscant to the Outer Rim.',
      },
    }],
  };

  var SHORT_8_INTERROGATION = {
    id: 'short-8',
    title: 'The interrogation that breaks both of you',
    hook: 'You interrogate a captured Imperial Lieutenant for the location of a forward base.',
    beats: [{
      id: 'short-8-coercion',
      setup: 'A captured Imperial Lieutenant. Bound. Silent. He knows the coordinates of a forward base. You need them.',
      check: 'Coercion check, Hard difficulty (upgraded for core beliefs).',
      pool: { ability: 1, proficiency: 2, difficulty: 2, challenge: 1 },
      scriptedResult: { success: 1, advantage: -2, triumph: 0, despair: 1, light: 0, dark: 0 },
      scriptedFaces: {
        // Player-side dice produce only successes. Ability/proficiency dice
        // canonically have NO threat faces (per DIE_FACES in diceEngine.js):
        // ability faces are BLANK/S/SS/A/AA/SA only; threats come from
        // GM-side dice (difficulty/challenge/setback). The interrogation's
        // threats land on the difficulty dice as canonical FH/H faces.
        ability:     [{ s: 1 }],                      // S face
        proficiency: [{ s: 1 }, { s: 1 }],            // 2 × S face
        difficulty:  [{ f: 1, h: 1 }, { h: 1 }],      // FH face (1 failure + 1 threat) + H face (1 threat)
        challenge:   [{ f: 1, d: 1 }],                // D face: 1 failure + 1 despair (canonical RAW)
      },
      // Net: 3s - 1f (difficulty FH) - 1f (despair face) = 1 net success
      // Threats: 1 (difficulty FH) + 1 (difficulty H) = 2 ✓
      // Despair: 1 ✓
      settleOrder: [
        'ability-0',
        'proficiency-0', 'proficiency-1',
        'difficulty-0', 'difficulty-1',
        'challenge-0',
      ],
      teaches: ['despair', 'advantage-threat'],
      interpretation: {
        scripted: 'He talks. You have the location. The Empire lost a base today. But Conflict stirs within you, for the threats, for the cruelty, for the line you crossed without meaning to. More of this and you\'ll stop being the hero of this story.',
      },
    }],
  };

  var SHORT_9_FORCE = {
    id: 'short-9',
    title: 'The Force user\'s gambit',
    hook: 'A Padawan pushes a heavy munitions box to barricade a doorway, with Force assistance.',
    beats: [{
      id: 'short-9-move',
      setup: 'The munitions box is too heavy. The door is so close. The stormtroopers are seconds away. You reach out to the Force.',
      check: 'Athletics check. Hard difficulty. Force Enhance.',
      pool: { ability: 2, proficiency: 1, difficulty: 3, force: 1 },
      scriptedResult: { success: 1, advantage: 0, triumph: 0, despair: 0, light: 0, dark: 1 },
      // ── Force die shorthand reminder (lib/shared/diceEngine.js DIE_FACES) ──
      // Force die faces use TWO-LETTER keys to avoid collision with despair:
      //   { l: 1 }   = single light pip       (canonical L face)
      //   { l: 2 }   = double light pip       (canonical LL face)
      //   { dk: 1 }  = single DARK pip        (canonical DK face)
      //   { dk: 2 }  = double dark pip        (canonical DKDK face)
      // Do NOT use { d: 1 } on a Force die — `d` is the despair shorthand
      // (Challenge die's D face = { f:1, d:1 }) and would render as a
      // despair symbol with an inherent failure on the Force die. This was
      // the bug in the previous Short 9 cut: viewers saw a despair on the
      // Force die that shouldn't exist, and the dice math accordingly went
      // upside-down vs the scriptedResult headline.
      scriptedFaces: {
        ability:     [{ s: 1 }, { s: 1 }],            // 2 × S face
        proficiency: [{ s: 1 }],                      // 1 × S face
        difficulty:  [{ f: 1 }, { f: 1 }, {}],        // 2 × F face + 1 BLANK
        force:       [{ dk: 1 }],                     // DK face: 1 dark pip (NOT despair)
      },
      // Math: 3s (Athletics) - 2f (difficulty) = 1 net success ✓
      // Dark pip = 1 (the moral cost; per FaD p.324 the Padawan takes
      // 1 Conflict from using the dark side, plus 1 strain plus a flipped
      // Destiny Point per FaD p.283 — those costs live in the voiceover).
      // The Athletics check would have succeeded without the Force assist;
      // the Padawan reaches for the dark side under fear (per the revised
      // narration), and the Conflict is the consequence of that choice
      // regardless of necessity. RAW-aligned per the Enhance Force power
      // tree (combined Athletics + Force check).
      settleOrder: [
        'ability-0', 'ability-1',
        'proficiency-0',
        'difficulty-0', 'difficulty-1', 'difficulty-2',
        'force-0',  // Force die settles last — the moral choice lands at the end
      ],
      teaches: ['force-dice'],
      interpretation: {
        scripted: 'You feel it. Fear. You use it to impose your will on the Force. You feel the surge, the easy power, the tempting clarity. The box moves. The door is blocked. Conflict stirs within you.',
      },
    }],
  };

  var SHORT_10_NEGOTIATION = {
    id: 'short-10',
    title: 'The negotiation that surprises everyone',
    hook: 'You negotiate with a smuggler captain for passage off-world.',
    beats: [{
      id: 'short-10-deal',
      setup: 'A smuggler captain. A back-corridor cantina. You name a price for passage off-world. He studies you.',
      check: 'Negotiation check, Hard difficulty.',
      pool: { ability: 1, proficiency: 2, difficulty: 2, challenge: 1 },
      scriptedResult: { success: 1, advantage: 2, triumph: 1, despair: 0, light: 0, dark: 0 },
      scriptedFaces: {
        ability:     [{ s: 1 }],                      // success
        proficiency: [{ s: 1, t: 1 }, { a: 2 }],      // triumph + success ; 2 advantage
        difficulty:  [{ f: 1 }, {}],                  // failure + blank
        challenge:   [{ f: 1 }],                      // failure
      },
      // Net: 3s - 2f = 1 net success ; 2 advantage ; 1 triumph
      settleOrder: [
        'ability-0',
        'proficiency-0', 'proficiency-1',
        'difficulty-0', 'difficulty-1',
        'challenge-0',
      ],
      teaches: ['triumph', 'advantage-threat'],
      interpretation: {
        scripted: 'The captain agrees to your price. He tells you he hasn\'t enjoyed such heated negotiations for quite some time. By the time you stand to leave, you have a discount on every future trip, and a tip about a job that could fund your crew for months.',
      },
    }],
  };

  // ── Scenario registry ─────────────────────────────────────────────
  // V1 ships with one canonical scenario plus 7 single-beat YouTube
  // Shorts capture scenarios. Future Shorts are content-only additions
  // — append a new scenario object here, no code changes needed.
  var SCENARIOS = [
    SABOTAGE_DRYDOCK,
    SHORT_1_DISARM,
    SHORT_2_SLICER,
    SHORT_3_PERSUASION,
    SHORT_4_SNIPER,
    SHORT_8_INTERROGATION,
    SHORT_9_FORCE,
    SHORT_10_NEGOTIATION,
  ];

  // ── Public API ────────────────────────────────────────────────────
  global.SWRPGScenarios = {
    SCENARIOS: SCENARIOS,
    /** Look up a scenario by id; returns null if not found. */
    byId: function (id) {
      for (var i = 0; i < SCENARIOS.length; i++) {
        if (SCENARIOS[i].id === id) return SCENARIOS[i];
      }
      return null;
    },
    /** Default scenario (first in the array). */
    canonical: function () {
      return SCENARIOS[0] || null;
    },
  };

})(typeof window !== 'undefined' ? window : globalThis);
