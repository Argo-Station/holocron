# 0048. A shared gate takes the caller's continuation, never a copy of its check

- **Date:** 2026-09-08
- **Status:** accepted

## Context

B-436: tapping a species on the phone stopped asking which book's version to use. One function,
`handleSpeciesSelect`, owns that question. The register rebuilt in August navigates differently per
band — the phone swaps its own screen (`setFcPhoneScreen('entry')`), the wide bands open a sub-view
— so the phone's pick grew its own handler to do its own navigation, and in growing one it stopped
calling the shared one. The chip kept promising a choice the tap no longer offered.

The ruling (`multi-source-picker-regression` R-MSPR-2) fixed the CONSTRAINT: route through the one
handler, "never a second copy of the check". It did not fix the MECHANISM, which the build card left
to the implementer. That mechanism is worth recording, because the constraint alone does not rule
out the shape that caused the bug.

This is the third instance of one failure class. B-124: the species picker keyed picks by array
index while the sheet keyed by slug — "two vocabularies for one fact". B-409: a predicate written
twice, once per band, so the two entries could drift. Now B-436: a decision point one band simply
routed around. **The common cause is not duplication of code; it is duplication of the BRANCH.**

## Decision

**A function that owns a decision takes a continuation for what happens after it, and callers pass
their own.** Concretely:

```js
handleSpeciesSelect(sp, proceed)   // whether to ask lives here; where to go afterwards does not
```

The candidates test stays in one place. `proceed` carries the caller's navigation, is stashed while
the question is in flight, runs when the question is answered, and is cleared when it is cancelled.
A band that wants different navigation supplies a different continuation — it never supplies a
different decision.

## Alternatives considered

- **Duplicate the check per caller.** Forbidden by the ruling and by PRAXIS §5, and it is what the
  bug was.
- **Extract the check as a predicate both callers call** (`speciesNeedsSourceQuestion(sp)`). This is
  the tempting one, and it is why this ADR exists: it satisfies "one check" while leaving the
  BRANCH at each call site, so a caller can still call the predicate and forget to act on it — or
  never call it, which is exactly B-436. One copy of the question, two copies of the decision to
  ask it, is not one decision point.
- **Push navigation into the shared handler behind a band test.** Puts a band conditional inside a
  function whose subject is not bands, and every new surface adds a branch to it. The continuation
  inverts that: the caller already knows where it is.

## Consequences

- The continuation must be cleared on cancel as well as on use. A cancelled question that left it
  armed fires the previous band's navigation on the next thing tapped — a real defect, guarded
  against in `handleSourceCancel`.
- A continuation is invisible to a reader of the callee, so the "where does this go next?" answer
  now lives at the call site. Acceptable: that is where the band already is.
- **Test at every band that renders a different component, and say the band in the leg's name.**
  `smoke_multi_source_picker`'s overlay legs ran at 430 only, which is precisely why a phone-only
  regression survived three weeks: a single-band leg cannot tell two components apart. They run at
  both bands now.
- This does not license a continuation everywhere. It applies where ONE decision is shared by
  callers whose AFTERWARDS legitimately differs. Where the afterwards is the same, the plain shared
  handler is still right.
