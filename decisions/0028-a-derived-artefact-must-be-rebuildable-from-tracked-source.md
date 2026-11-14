# 0028. A derived artefact must be rebuildable from tracked source, and its self-description must be emitted rather than maintained

- **Date:** 2026-08-10
- **Status:** accepted
- **Ruled:** `Docs/rulings/npc-rebuild-from-source.md` (2026-08-10) — **ACCEPT**, with **C-PM-3**
  outstanding. Citation retrofitted at the architect's request (that ruling §7.2): this ADR was
  committed at `56eb2e3` marked accepted while the gate it ratifies was still open and unruled — a
  step ahead of the mechanism, recorded rather than quietly fixed.

## Context

`public/data/canonical/npcs.json` is a derived artefact. It was built once by `run_phase2b.py` into
`build/canonical/`, promoted into `public/` by a **hand copy** (commit `742d785`, 2026-06-06) that no
script performed, and then mutated in place by a growing set of `apply_*` / `refile_*` passes carrying
corrections the builder knows nothing about.

The consequence was not theoretical. **Three ingest laps in a row were told to "fix it at the
adjudication table and prove it by re-running the ingest" against a file nobody could re-run.**
Condition C-NID-2 was only half-satisfiable, and every lap paid the tax again.

Two further facts made it worse, and both were discovered rather than known:

- The artefact's own `applies` header named **4 passes when 8 had run**, and a second self-documenting
  source (`apply_talent_refs.py`'s docstring) named a **different** wrong set — it credited a script
  that never writes the file and omitted two that postdate it. A third, `generated_from`, named
  `public/data/npc-library/`, a directory deleted months earlier by ADR 0003's blob retirement.
  **Three self-descriptions, all wrong, none agreeing.**
- `validate_registries.py`'s Layer 0 was **green throughout**. It compares `build/` to `build/` —
  the builder's determinism, staging against staging. It never ran the promote step, never ran a
  single apply pass, and never looked at `public/` at all. *A green that was true, and about
  something else.*

A widely-held belief also turned out to be false: that a naive re-run "would destroy" the six later
corrections, implying the shipped file held untraceable hand edits. **Measured, the chain reproduced
1,429 of 1,430 records before this work changed anything.** The un-runnability was real; the
corruption it implied never existed. Nobody had checked.

## Decision

**A derived artefact that ships must be rebuildable, by one command, from tracked source — and a
guard must assert that the rebuild is byte-identical to the committed file.**

For `npcs.json` this is `scripts/canonical/promote_npcs.py` (the ordered chain, including the
promote step) and `scripts/canonical/check_npc_rebuild.py` (the assertion), which runs in the
standing battery as **L0s** and blocks promotion on failure.

Three properties are load-bearing and are the decision, not implementation detail:

1. **The chain starts at TRACKED inputs.** Beginning at a gitignored staging artefact makes the claim
   "rebuilds from source" false on any machine that has not already built the project. This was found
   by running the guard in a clean worktree, where it died before reaching a data comparison.
   **TRUE OF THE VERIFIER, NOT YET OF THE WRITER (C-PM-3).** The ruling re-ran the stroke on the
   committed tree: `check_npc_rebuild.py` passes clean. But `promote_npcs.py --apply` — the command a
   human runs to regenerate the file — still raises the original `FileNotFoundError` on a fresh clone,
   because `run_phase1.py` writes `build/canonical/weapons.json` with no `mkdir` and the only thing
   creating that directory is `isolated_tree()`, written for the *guard's* scratch path (R-PM-5: a
   guard's own scaffolding was load-bearing for the thing it guards). **This sentence is the one the
   code does not yet fully satisfy on both entry points**; C-PM-3 binds Phase 1's lap.
2. **The rebuild never writes the product file.** It runs in an isolated tree. A guard that mutates
   the artefact and restores it in a `finally` is acceptable for a watched manual run and wrong for
   anything routine, where a killed process leaves the product rebuilt-but-unverified.
3. **Self-descriptions are EMITTED, never maintained** — the `applies` manifest is computed from the
   chain it describes, so it cannot drift. A hand-written manifest is the defect, not a manifest that
   happens to be stale.

## Alternatives considered

**Keep the manual chain and document it more carefully.** Rejected on evidence: it *was* documented,
in three places, and all three were wrong in different ways. The failure mode of a hand-maintained
description is not carelessness — the first cut of the fix reintroduced it, and a mutation test
caught the author of the B-142 fix writing a hardcoded manifest into the script that fixes B-142.
Discipline is not a mechanism.

**Rely on the existing Layer 0.** Rejected: it proves a different claim. It is kept, because
builder determinism is worth asserting; L0s is added alongside it rather than replacing it.

**Regenerate from the builder and abandon the apply passes.** Rejected: the passes carry real, cited
corrections (allegiance fixes, an FFG errata, talent refs, refiled weapons). The answer is to make
the chain runnable, not to discard its steps.

**Scope the claim honestly instead of fixing it** ("rebuilds given the build artefacts already on
this machine"). Available and offered as a fallback by the ruling, but rejected once the root fix
proved cheap — one extra step at the head of the chain.

## Consequences

- **C-NID-2 is satisfiable in full.** "Fix it at the table and prove it survives a rebuild" is now a
  command, and the previous lap's M-300 and vornskr fixes were demonstrated to survive one.
- **Any new pass that writes `npcs.json` must be added to `CHAIN`**, or L0s fails. That is intended:
  the chain is the single authoritative manifest, and the guard enforces it. The failure names the
  diverging records, which is how a dropped pass announces itself (proven: removing one pass reddens
  3 records, removing another reddens 624).
- **A difference between source and shipped is not a defect until the chain has been read** (R-PM-1).
  Ten passes deliberately transform this file, several with citations. A condition was written — and
  retracted — on a bantha whose `Silhouette 2` is an applied FFG errata sitting at step 6 of the very
  chain the gate documented. `promote_npcs.py --list` is the list of everything allowed to change the
  data.
- **The pattern generalises and is not yet applied elsewhere.** `species.json`, `weapons.json` and
  the other canonical registries have the same shape and the same absent guarantee. This ADR decides
  the principle; extending it to the other registries is unscheduled work, and the CSG v7 re-import
  is the next lap that will want it.
- **Cost is negligible** — 1.44s, less than the validator it runs inside.
