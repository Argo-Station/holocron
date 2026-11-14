# 0035. Coverage is a property of the FIXTURE, not the assertion

- **Date:** 2026-08-12
- **Status:** accepted
- **Ratified as standing law the same day** by ruling `multi-source-picker-surface` §10 (ERRATUM 4 +
  **R-MSPB-R3**, the non-vacuity law), which adopts obligation 1 below — and the
  `assert_dossier()`-in-every-leg pattern specifically — as general. This ADR is the reasoning and the
  three empirical instances; R-MSPB-R3 is the rule. Where they differ, the ruling governs.

## Context

The three species surface laps produced **three independent instances of one failure**, in one
session, found by three different mechanisms — and not one of them was a product defect:

1. **Lap A — AS-9 reported 186/186 over a control it never drew.** The creator's seven-width sweep
   walks each step with a fixture species that carries no buyout, so `FCBuyoutBlock` never rendered
   inside it. The number was real and said nothing about the lap's own controls. Found by the
   implementer asking what the number actually covered; closed by the lap running its own proof-set
   sweep in BOTH states (the taken state has an UNDO that does not exist until you buy — B-119's
   shape exactly, which had already cost a lap once).
2. **Lap C — a node guard asserted the delta rule without executing it.** It re-derived the rule from
   the registry with its own helper and never called `optionDelta`, so a refactor of that function
   could run `node test/*.cjs`, see green, and learn nothing. Found by the architect at the gate;
   closed by C-SDS-2 naming the executing instrument in a comment.
3. **The merge — a leg asserted ABSENCE against the wrong screen.** Lap C's "species with no skills"
   leg used `Anx`, a two-source name; once lap B merged, tapping it opened the picker overlay, which
   has no skill rows either. **It kept passing while measuring nothing.** Found by rehearsing the
   merge in a throwaway worktree; closed by an `assert_dossier()` that every leg runs before its own
   asserts.

The common shape: **an assertion is only as good as the population its fixture produces.** Each of
these tests was correctly written and correctly passing. Each was silent about the thing its author
believed it covered. The failure is invisible by construction — a green suite reports health whether
it is testing the subject or an empty screen.

## Decision

**A test's coverage is bounded by its fixture, and that boundary is stated, not assumed.**

Three obligations, binding on every new or edited instrument:

1. **NON-VACUITY FIRST, at the level the leg asserts at.** A leg that asserts a property of a screen
   proves it is on that screen before believing anything. A leg asserting ABSENCE owes this most:
   absence is also what a broken, empty, or wrong screen looks like. (Extends C-CCM-1 from
   "population non-empty" to "population is the one you think it is".)
2. **AN INSTRUMENT NAMES WHAT IT DOES NOT COVER**, in a comment, where a future session will read it.
   "This re-derives the rule and does not execute `optionDelta`; the browser suite is what executes
   it." One comment retires an entire class of false confidence.
3. **A NUMBER CITED AS EVIDENCE NAMES THE POPULATION IT MEASURED.** A gate may not cite AS-9 — or any
   suite — as evidence for a conditionally-rendered control unless that control was in the fixture.
   Ratified as a standing rider by `creation-buyout-surface` §7 and reinforced by
   `species-detail-skill-surface` R-SDS-R2.

## Alternatives considered

- **Treat each instance as its own bug.** Rejected: three in one cluster is a class, and the third
  was found by luck of a merge rehearsal. Whatever finds the fourth should be structural.
- **Require every instrument to execute the product path.** Rejected as over-broad: the lap C guard's
  data-shape check is legitimately useful and node genuinely cannot reach a React component. The
  defect was never that it re-derived; it was that it did so silently.
- **Add a coverage tool.** Rejected for now: line coverage would have reported all three as covered.
  These are FIXTURE gaps, not unexecuted lines — the code ran, against the wrong subject.

## Consequences

- Every new suite costs a few extra asserts up front, and they are the cheapest asserts in the file.
- Some existing green instruments are certainly silent in ways nobody has asked about yet. This ADR
  does not commission a sweep; it binds the next lap that touches each one.
- **The mechanism that found instance 3 is worth keeping, and is now required.** Rehearsing a merge in
  a throwaway worktree runs the suites against a combination no lap ever tested alone: two laps can
  each be correct and their instruments still measure the wrong thing together. **C-MSP-B1 is amended
  (ERRATUM 4) to require every merged lap's BROWSER suites re-run on the merged tree** — the
  architect's own rehearsal was node-guards-only and structurally could not have seen this, which is
  the honest reason the amendment exists.
- Related: **0031** (a green count is not a delta) and **0034** (membership is a manifest, not a
  pattern) are the same family — a number that looks like evidence and is not.
