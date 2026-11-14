# 0023. The creation draft persists its step BY NAME, with a frozen v1 order for migration

- **Date:** 2026-08-02
- **Status:** accepted

## Context

The creation draft (`swrpg_creation_draft`) stored the wizard step as a raw index into `FC_STEPS`,
and `loadCreationDraft` never read the `v` field it wrote itself. That made **any** insertion or
reorder of the creator's steps a silent data corruption: inserting `specialization` at index 3
shifts every later step by one, so a player who left off on Skills reopens on Characteristics — no
error, no signal, in every player's localStorage.

This surfaced while sizing the specialization step (B-72), before any code was written. It is an
R-SY4 durable-contract question — a persisted shape — so it went to paper first (R-Y2-1), and the
creator UI revision programme could not insert its step until it was answered.

A second instance proved the class was live rather than theoretical: F-45's re-entry writer stamped
`v: 1` on a **twelve-step** index (C-GLB-1). It landed on the review screen only because the index
fell outside the frozen order's range and the unresolvable fallback caught it — the right
destination reached through the failure path.

## Decision

**The draft persists the step by NAME at `v: 2`** (`step: 'skills'`, not `step: 5`).

- **`FC_STEPS_V1` is a FROZEN LITERAL** of the eleven-step v1-era order. Old integers migrate
  through *it*, never through the live `FC_STEPS`.
- `loadCreationDraft` **reads `v`** and normalises every draft to a name.
- An unresolvable step — an unknown name, an out-of-range index — lands on **`review`** with the
  draft intact (F-45's landing pattern), never at a silently wrong position.
- **The `FC_STEPS` ids are now load-bearing in persistence.** Adding, removing or REORDERING steps
  is safe by construction; **renaming one is itself an R-SY4 event.**
- QuickBuild keeps `v: 1` because it persists its own step over its **own** `STEPS` array — a
  different space. `loadCreationDraft` therefore resolves a step name only for `flow === 'custom'`,
  and both writers state which space they are in.

## Alternatives considered

- **Bump the version and discard v1 drafts.** Cheaper to implement and it loses a player's
  in-progress character. Rejected outright in the ruling.
- **Migrate old integers through the live `FC_STEPS`.** The obvious shortcut, and it is the bug
  reborn inside its own fix: the array it consults is the array that changed. The frozen literal
  exists precisely to make that impossible, and the guard checks *structurally* that it is still a
  literal — if it were ever re-pointed at `FC_STEPS`, every behavioural assert would still pass.
- **Fix only the writer that was wrong** (C-GLB-1's instance). Rejected in favour of a class-level
  guard over *every* `saveCreationDraft` call site writing `flow:'custom'`, so a writer added later
  is caught by the guard rather than by a reader noticing.

## Consequences

- **A future step RENAME strands every in-flight draft on `review`.** It is safe, but it is a
  contract change and must be treated as one. A comment at `FC_STEPS` says so.
- The guard (`test/draft_step_contract.cjs`) **arms itself**: when the live order grows past the
  frozen one it stops skipping and asserts that raw indices *would* land drafts wrong. It reported
  "8 of 11 steps would shift" the moment `specialization` went in — the ruling's named mutant
  demonstrating itself rather than being run by hand.
- Its mirror of the contract is written **from the ruling**, not imported from the app: an assert
  that imports the function it tests proves only self-consistency.
- Test fixtures must seed the **current** contract. AS-9's seeds wrote `v: 1` with *new* indices,
  so the migration correctly landed everything after `specialization` one step early — the fixture
  was lying about its version, not the app misbehaving.
- Two bugs surfaced in the implementation because the guard was written first: `Number(null)` is 0,
  so a null step resolved to `gameline` while `undefined` resolved to `review`; and the guard's own
  first mirror modelled only the name half and reported a **false failure**. The second is the more
  valuable catch — a guard that cries wolf gets disbelieved.

**Governing paper:** ruling [`b72-draft-step-contract`](../Docs/rulings/b72-draft-step-contract.md);
the C-GLB-1 discharge in [`creator-gameline-build`](../Docs/rulings/creator-gameline-build.md) and
its [addendum](../Docs/rulings/creator-gameline-build-discharge.md); gates
`creator-c5-specialization` and `creator-gameline-build`.
