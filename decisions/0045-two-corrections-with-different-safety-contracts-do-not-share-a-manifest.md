# 0045. Two corrections with different safety contracts do not share a manifest

_Renumbered from 0039 on 2026-09-03 (ruling `species-phone-band` A3). Two seats each took "the next number" the same day from a tree that did not yet hold the other's file; neither commit conflicted and the merge made the collision. This was the LATER of the pair, so it moved. Cited as 0045 from here on._

- **Date:** 2026-08-26
- **Status:** accepted

## Context

`scripts/canonical/apply_species_prose_correction.py` held one named correction (B-178: an Echani
sentence-run misfiled into Miraluka's `physiology`). Card `bug-batch-one` item 8 added a second
(B-310 / visual-inspection ledger E2: an OCR flow fragment glued onto the tail of Miraluka's
`society`).

The obvious move was a manifest list — `[{record, field, cut}, …]` — because this repo's standing
instinct is **one shape, not a second implementation of the same job**, and both corrections do
look like the same job: delete misfiled text from a species' prose.

They are not the same job, and the difference is in what makes each one *safe to perform*:

- **B-178** is safe because the removed text **provably survives elsewhere**. The script asserts
  `tor_echani.physiology` still carries the sentences before it removes the duplicate, so a
  correction can never quietly drop the only copy of something.
- **B-310** is safe because **a human read the printed page**. An OCR fragment has no correct home
  and no other record to check against; the only evidence is Jason's inspection, so the safety
  condition is *exactness* — refuse unless the shipped tail is the precise string the inspection
  described.

A shared manifest needs one verification predicate over both entries. There is no predicate that
expresses both conditions, so the unified one would be the weaker of the two — applied to the case
that deserved the stronger.

## Decision

**Corrections live in one script when they share a subject, and keep separate verification blocks
when they do not share a safety contract.** The "one shape, not two" rule governs *implementations
of the same job*; it does not oblige two different safety arguments to collapse into one predicate.

Concretely: `apply_species_prose_correction.py` is the single home for species-prose corrections,
and each named correction carries the refusal conditions its own evidence supports.

## Alternatives considered

- **A manifest list with a single predicate.** Rejected: the predicate would have to be the weaker
  of the two. In practice that means B-178's "the text survives elsewhere" assertion gets dropped,
  because B-310 cannot satisfy it — trading away the strongest safety property in the file to gain
  tidiness.
- **A second script for B-310.** Rejected: it splits the home for "species prose corrections" in
  two, so the next person has to find both, and a future third correction has no obvious home.
- **A manifest with per-entry predicate functions.** Rejected as premature: it is the right shape at
  four or five corrections, not two, and inventing the abstraction now fixes the wrong thing —
  there is no evidence yet about what the third correction's safety contract looks like.

## Consequences

- The file has two verification blocks, which **reads like duplication and is not**. A future
  session will be tempted to merge them; the docstring says why not, and this ADR is the record.
- Adding a third correction means asking the question again rather than filling in a row: *what
  makes THIS one safe?* That is the intended cost.
- The general form, which is the reusable part: **a safety check is not refactorable with the thing
  it checks.** Two operations that look identical can be safe for different reasons, and unifying
  them silently discards the reason that did not generalise. When collapsing verification, name the
  predicate each case needs first — if they differ, the collapse is a downgrade wearing a cleanup's
  clothes.
