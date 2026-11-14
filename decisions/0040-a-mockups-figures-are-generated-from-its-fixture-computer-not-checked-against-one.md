# 0040. A mockup's figures are GENERATED from its fixture computer, not checked against one

- **Date:** 2026-08-27
- **Status:** accepted

## Context

R-MU1 Amendment 1 requires a mockup to use **real numbers read from
`public/data/canonical/`**, and says plainly that **invented numbers are a defect in a mockup**.
The practice that grew around it already goes further than most repos manage: ruling
`dice-hub-mockup` **C-DHM-3** puts the instruments themselves into the record (fixture computer,
structural sweep, contrast walker), and `dice-hub-range-band` **C-DHM-6** requires a check
asserting the page's figures **equal** the fixture computer's, with a red fixture that bites.

That leaves one gap, and it is the gap this decision closes. Under a compute-then-compare shape,
the page is still **hand-authored**: a human types `2P 2A` beside a script that also produces
`2P 2A`, and a check compares them. The two can drift, and the drift is invisible on inspection —
**a wrong stat in a mockup looks exactly like a right one.** The comparison catches drift only
for figures somebody remembered to compare; a figure typed into a frame nobody wrote an assert
for is unguarded, and reads as authoritative because everything around it is real.

This session built the HOLOTABLE slice-2 battlemap mockup (14 frames, 25 traced figures) and hit
the failure mode twice from different directions: the fixture computer silently defaulted a
skill's characteristic and printed a confident wrong dice pool (Melee resolved off Agility rather
than Brawn) with nothing complaining, and a checker leg swept the provenance table as though it
were a frame and reported orphan figures that did not exist. Both were caught because the numbers
had **one source that could be interrogated**, not because anyone re-read the page.

## Decision

**The mockup HTML is GENERATED from the fixture computer's emission.** Three files, and the split
is the point:

- **the fixture computer** reads the shipped registries, uses the **shipped cores** for any
  arithmetic (`diceEngine.buildPool`, `formatResults` — PRAXIS §5's one-core rule applies to a
  mockup's numbers as much as to the product's), and emits both the values **and a provenance row
  for each**;
- **the builder** consumes that emission and writes the page — including the source table, which
  is emitted from the same provenance list rather than maintained beside it;
- **the checker** verifies what generation cannot: structure, contrast, touch floors, vocabulary,
  and that no figure in the frames is an orphan.

The consequence is structural rather than procedural: **the page cannot carry a figure the
registries do not contain**, because there is no authoring step in which one could be typed. A
lookup that cannot resolve **refuses** rather than defaulting — the Melee/Brawn defect entered
through a silent fallback, not a typo, so refusing is the fix that matters.

This does not supersede C-DHM-3 or C-DHM-6. The instruments still enter the record, and the
equality checks still earn their place over everything generation does not cover.

## Alternatives considered

- **Hand-author the page, compute fixtures, assert equality** (the prior shape). Lost because it
  guards only the figures someone wrote an assert for, and because the failure it permits is the
  one that looks correct. It remains the right shape where a page is mostly prose with a few
  numbers; it is the wrong shape where the page IS numbers.
- **Hand-author and rely on review.** Lost outright: two of this lap's four caught defects were
  invisible to a careful read, and one of them (a dice pool off the wrong characteristic) is
  exactly the kind of thing a reviewer accepts because it is plausible.
- **Generate everything including layout from a spec.** Rejected as over-fitting. The generator
  should own FIGURES and the structures that repeat (rows, chips, result lists); layout is design
  work and belongs in readable markup where a human can argue with it.

## Consequences

- **A reviewer reads a generator, not a page.** This is the real cost. It is mitigated by the
  page being committed too (so it opens and renders like any artifact) and by the source table
  being generated — a reader who wants to know where a number came from has a row for it.
- **A registry change moves the mockup on rebuild.** Usually right; occasionally surprising, so a
  mockup quoted in a ruling is quoted with its commit, per ADAPTIVE_STANDARD's own amendment
  about snapshots that silently expire.
- **The generator must refuse, never default.** Any lookup that cannot resolve raises. A default
  is how an invented number gets in without anybody inventing one.
- **C-MU-4 still outranks the generator.** Where the shipped component being depicted violates a
  standard, the mockup renders the COMPLIANT form and the product defect is filed — this lap's
  B-315 (a picker meta line at 3.48:1 where normal text needs 4.5) is the worked example. A
  generated mockup makes copying a violation easy, which is exactly when the rule needs stating.
- **Layout defects remain a human's job.** Generation guarantees the numbers are real; it says
  nothing about whether they are readable. Three defects this lap — a pool drawn as text instead
  of dice, a glyph captured by a descendant selector, and every ledger name truncating in the
  rail — passed every instrument and were caught by looking. Generation raises the floor; it does
  not replace the eye.
