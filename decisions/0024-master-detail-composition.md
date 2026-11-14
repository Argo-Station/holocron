# 0024. Master-detail composition: one tree at every band, geometry-only flips

- **Date:** 2026-08-03
- **Status:** accepted

## Context

Three creator steps now render a browse list beside its detail on desktop and swap between them on
a phone — species (C7), career (C8), and the mechanic step (C9) — and the store's host shares the
shape. The pattern was arrived at once, corrected once, and then reused; but it lived in code
comments and across two rulings, which is not where a future lap looks before building a step.

It is written down here because **a lap adopting it must load it FIRST**, as a constraint on what it
builds, not find it afterwards as history (R-ADR-1). Two things in particular are load-bearing and
non-obvious: the reason a naive composition breaks rotation, and the fact that the pattern has a
BOUNDARY — steps that must not adopt it.

**The correction that produced the pattern's final shape.** C7's first cut rendered `SplitPane` on
desktop and the bare browser on mobile. That put `FCSpeciesBrowser` at a *different tree position*
per band, so React remounted it on a flip and an in-flight species search was wiped. The
`desktop_layout` A4 legs caught it by typing "Zabrak" at 900px and crossing 1024. The fix is the
pattern: the step renders the two-pane structure at EVERY band and only the widths move.

## Decision

**Hosts may gate COMPOSITION per band; primitives stay always-mounted; a band flip moves widths,
never tree positions.**

1. **One tree at every band.** A master-detail step renders `SplitPane` unconditionally
   (`mode="desktop"`), and the bands change only geometry:
   - desktop → rail at `var(--desk-rail-w)`, detail beside it;
   - phone, list showing → rail `100%`, detail squeezed to nothing;
   - phone, detail showing → rail `0px`, detail full-width (the swap, preserved exactly).
   A component never moves between tree positions, so a rotation is a restyle and in-flight state
   survives it. This is A4's letter (`lib/shared/desktopLayout.jsx`).
2. **A host may still gate composition per band** where the two shapes are genuinely different
   trees — the shipped `mdRosterSheet` roster/sheet precedent does exactly that, and remains valid.
   What is forbidden is moving a stateful child between positions on a flip.
3. **The machinery:** `FC_MASTER_DETAIL_STEPS` names the participating steps, and the scroll-key
   exception follows from it — *while a step is master-detail at the current band, `subView` leaves
   the scroll container's key.* Without it, every pick changes `subView`, the pane remounts, and the
   reader is dumped to the top of a 97-item list.
4. **The remount distinction, stated because it is the whole of the reasoning:** A4 TOLERATES a
   remount on a **band flip** (rare, user-initiated, and the roster/sheet precedent accepts it). It
   does NOT tolerate a remount on **ordinary use** — a pick, a sort, a keystroke. Guard the second;
   the first is a design choice.
5. **A collapsed rail draws no border.** Callers collapse by passing `railWidth="0px"`; the divider
   must not paint a sliver on a pane that is meant to be gone. Fixed in the primitive because both
   the creator and the sheet's table mode do this.

**THE BOUNDARY — and it is as load-bearing as the pattern.** **Single-screen steps DO NOT join.**
Characteristics is the recorded counterexample: it has no catalogue, no list‖detail, and therefore
no scroll-key exception. Its wide-band answer is a prose aside beside a measure-holding control
group, not a triad. Two steps joined the table in consecutive laps, so the next reader will assume
a pattern — `FC_MASTER_DETAIL_STEPS` carries a comment pointing here for exactly that reason.

## Alternatives considered

- **Conditional mount (SplitPane on desktop, bare component on mobile).** Simplest to write, and
  what C7 wrote first. Rejected: it moves stateful children between tree positions, which remounts
  them on every rotation. Not a theoretical risk — it wiped a real in-flight search and was caught
  by a shipped guard.
- **A three-pane primitive (`WorkspaceGrid`) for the wide band.** Rejected twice over: it is
  reserved to the D-C1 GM workspace concept and carries a known ratio defect (`1fr:2fr:1fr` yields a
  50% stage). The need dissolved anyway once the build rail was recognised as the SHELL's rather
  than any step's — hoisted, it serves all eleven steps and no step needs a third pane.
- **Nesting two `SplitPane`s** to get three columns. Superseded by the same hoist; kept here because
  it was the implementer's lean before the rail's ownership was ruled, and a future three-column
  need should re-ask the ownership question first.
- **Per-step guards for the composition.** Rejected: the guard is about the COMPOSITION, not one
  step, so it is one suite (`smoke_creator_master_detail`) with a leg per adopter. A per-step name
  would have produced a second copy the first time a second step adopted the pattern — B-106 in
  miniature.

## Consequences

- **Adopting a step is small:** add it to `FC_MASTER_DETAIL_STEPS`, render `SplitPane` with the
  three width states, and add a leg to `smoke_creator_master_detail`. The scroll-key exception and
  the shell's build rail come for free.
- **Each adopter still needs its OWN guard leg**, not a parameterised sweep: the steps differ where
  it matters (species has a sort bar, career must NOT have one, the mechanic step keeps party size
  with the list). A shared driver would quietly assert one step's furniture on another.
- **The phone swap must be asserted by GEOMETRY, not by text absence.** A collapsed pane still
  contributes `innerText` while clipped to nothing; an assert reading "the list is gone" from body
  text fails on a screen that is behaving correctly.
- **The pattern does not travel to non-catalogue steps.** Forcing it produces a rail with nothing to
  browse; the boundary above is the answer, and characteristics is the worked example.
- **A4 remains the governing law** for primitives; this ADR is how hosts satisfy it.

**Origins, cited as history rather than restated:** `creator-species-split-composition` (the rail
hoist, the scroll-key exception, the reserved primitive left alone) · `creator-c7-species` (the A4
regression and its corrected shape) · `creator-c8-career` (the second adopter; the guard renamed to
the composition rather than copied) · `creator-c10-plan` (the boundary) · and A4's own text in
`lib/shared/desktopLayout.jsx`.
