# 0030. A wait condition must be able to observe the transition it gates

- **Date:** 2026-08-11
- **Status:** accepted

## Context

Ruling `smoke-instrument-latency` established that the browser suites' cost is unconditional sleep
in the shared core: `js_click` slept a fixed `wait` after every click, and `seed_draft` slept 800ms
+ 1400ms, whether the UI settled in 3ms or never. The handoff was to convert those to condition
waits keeping each number as a ceiling.

Converting a *sleep* into a *condition* replaces "wait long enough" with "wait for the thing". That
is strictly better only if the condition can actually see the thing. Three ways it cannot, all met
in one lap:

1. **Vacuously true.** A condition already true before the transition never waits. The architect's
   own first proposal (`>3 buttons`) was true on the landing, so it would have converted a 1400ms
   sleep into a 0ms no-op and measured a surface that had not rendered.
2. **Structurally blind.** DOM-mutation quiescence cannot see a CSS transition or a
   `setTimeout`-driven mount, because neither mutates the DOM. This app carries five
   `width 0.3s ease` declarations.
3. **Vacuous in one direction only.** `document.getAnimations()` returns an empty list both *before*
   animations start and *after* they finish. As a gate it is indistinguishable from "done" at the
   exact moment it is wrong.

The lap also produced the counter-example that makes the rule concrete: `smoke_creator_as9` exists to
measure pixel geometry across seven widths. Converting its per-iteration 600ms to quiescence made a
control read 243px on 2 of 6 runs where the settled value is 244px — the suite did not get faster,
it got *inconsistent*, which is the failure a fixed sleep is supposed to prevent.

## Decision

**A wait condition is only admissible if it can be shown FALSE before the transition and TRUE after
it.** Demonstrated, not asserted — the reading in both states is recorded.

**And a suite that measures GEOMETRY may not settle on DOM quiescence.** Geometry is what animations
move, and quiescence is blind to animation by construction. Such a suite keeps an explicit wait, and
that wait says at the line why it is there.

Concretely, in `scripts/smoke_lib.py`:
- `settle()` is DOM-mutation quiescence with the caller's number as a ceiling; a ceiling hit never
  raises, because the sleep it replaces would have proceeded at that instant too.
- `ceiling <= 0` waits not at all — load-bearing, since Playwright reads `timeout=0` as *wait
  forever*, the exact inversion of intent.
- `smoke_creator_as9`'s two 600ms sleeps STAY FIXED, with the refusal and its measurements committed
  as a comment at the site.

## Alternatives considered

- **Convert everything, including the geometry suite.** Rejected on measurement, twice. Plain
  quiescence produced the 243/244 flake; adding `getAnimations()` was worse, exiting ~60ms in and
  measuring toasts mid-flight. It buys ~88s of a 254s run, and a geometry suite that reports two
  answers is worth less than the time saved.
- **Raise the quiet window until it covers animations.** Rejected: no window works, because a
  transition produces zero mutations at any duration. The blindness is structural, not a tuning.
- **Wait on `getAnimations()` alone.** Rejected — case 3 above. If a future lap needs to wait out an
  animation, gate on the animation having STARTED first, or wait on the settled VALUE rather than on
  the absence of motion.
- **Keep the fixed sleeps everywhere.** Rejected: the shared-core conversion alone took AS-9 from
  627.22s to 253.85s with a byte-identical 163-row control census, and every browser suite in the
  repo gets that for free.

## Consequences

- **~88 seconds of AS-9 is deliberately not reclaimed.** A future session WILL find that number and
  try again. It has been tried twice; the evidence is at the site and in
  `Docs/gates/smoke-instrument-latency-conversion.md`. Re-open it only with a condition that
  observes geometry settling, not motion stopping.
- **The non-vacuity demonstration is a cost on every future conversion**, and it is the point. Five
  instruments in this one session reported green while unable to see the failure they were aimed at
  — including a completion-watcher that matched the first line of output instead of the last, and a
  check that measured alpha inside a mask the code sets to 1 by construction.
- **`settle()` is deliberately narrow.** It does not wait for animations, network, or fonts. Widening
  it would silently change 268 call sites across 63 suites; a caller that needs more asks for more at
  its own line.
- The general form, which is the part worth carrying beyond the test harness: **before trusting a
  green, show the instrument failing on a case known to be bad.**
