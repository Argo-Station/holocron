# 0042. A guard's founding case is embedded, not looked up

- **Date:** 2026-09-03
- **Status:** accepted

## Context

R-CPR-39 requires a guard to state the instance that defined its class, so a reader can hold the
guard against the thing it was built for rather than against its own description. The creator
re-census added three detector buckets under that rule, each with a named founding case.

The first cut resolved its founding case by LOOKUP — it opened the tree's own
`scripts/smoke_b18_stale_picker.py` and searched for the inline `'BACK'` click that had motivated
the bucket. It printed **FAIL**, and the detector was right: the shape was in neither copy it could
reach. The frozen branch tip had never had it (seat 1 had already re-pointed that file to press
`data-creator-back` by hook), and the census copy had just been re-pointed by tranche 1 hours
earlier. The defect existed in no file the check could read.

The force behind that is general and will recur: **a check that polices a class is almost always
built during the work that removes the class's instances.** The census wrote these buckets precisely
because tranche 1 was eliminating what they detect. So a founding case resolved by lookup rots at
exactly the moment its remedy succeeds — and it rots into a false FAIL, which is the reading most
likely to get the check deleted by whoever hits it next.

## Decision

**A guard's founding case is EMBEDDED in the guard as a literal fixture — the shape as it stood,
copied verbatim — and the check runs against that.** Whether the live tree still carries the shape
is reported too, separately and informationally, never as the pass/fail.

## Alternatives considered

- **Point at a live file.** What the first cut did. Rejected on measurement, not taste: it failed the
  same day it was written, for a reason that gets stronger over time rather than weaker.
- **Pin the file at a SHA.** Survives the remedy, but couples the guard to git history and, here, to
  frozen worktrees that exist to be thrown away and re-frozen (R-CPR-57). A guard that dies when a
  baseline is re-pinned has traded one rot for a quieter one.
- **Drop the founding case.** Rejected. It earned its keep in the same session: running it FIRST is
  what revealed the b18 target was wrong, before any total it printed could be trusted.

## Consequences

- The embedded literal can drift from how the shape appears in real code. The live-file report
  standing beside it is the mitigation — when the two disagree, a reader can see it.
- A guard's motivating instance becomes part of its source, which is where it belongs: the file now
  explains why it exists to whoever opens it, instead of pointing at a file that may no longer say so.
- **Run the founding case BEFORE trusting any number the guard prints.** Both times it mattered this
  session, it mattered first — once by failing honestly, once by catching a wrong target.
- This is not census-specific. It applies to any guard in this repo whose class is under active
  remediation, which is most guards worth writing.
