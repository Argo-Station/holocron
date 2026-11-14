# 0036. Widening an additive importer's input does not make it a replacing one

- **Date:** 2026-08-12
- **Status:** accepted

## Context

The species-art re-point (`csg-new-images-reimport`) had to swap ~400 shipped portraits for the
guide artists' own files. The obvious mechanism was the one the commissioning ruling named: keep the
existing v7 importer, keep its pack-precedence rule, and widen only the CANDIDATE SET — "the rule
already expresses 'New Images wins', so what changes is the candidate set, not the rule."

That is true of the *matching* rule and false of the *writing* rule, and the difference is invisible.

The v7 importer was ADDITIVE: it ran over records with no portrait, so it derived each output
filename from the record's name and nothing was ever at that filename already. A re-point runs over
records that DO have a portrait — and `build_species_portrait_manifest.py`'s first derivation keeps
an existing id→file binding verbatim **while its file exists** (ADR 0032: a binding is never dropped
because a name moved, only because its FILE is gone).

So for the two species v7 had renamed — `csg_kowakian` ("Kowakian monkey-lizard", bound to
`Kowakian.webp`) and `csg_terrelian_jango` — deriving from the name would have written
`Kowakian_monkey-lizard.webp` BESIDE the old file. The manifest rebuild would have kept the old
binding, the app would have gone on serving the old picture, and nothing would have errored. Every
guard in the repo stayed green under a faithful reproduction of this: `species_portrait_manifest`
reported **ALL PASS (413 portraits)**. The failure mode is a silent no-op wearing the costume of a
successful import.

## Decision

**A replacement writes into the destination the consumer already resolves, not one it re-derives.**

Concretely, in `import_csg_art_v7.py::destination()`: under `--full-catalogue`, a record already
bound to a file on disk lands into THAT file; only an unbound record derives a filename from its
name. Matching is untouched — C-ART-5a still normalises the RECORD NAME to find the SOURCE. Only the
destination moved, and only where a binding already existed.

Generally: **when an additive pipeline is widened into a replacing one, its output-naming rule is a
second thing that must change, and it will not announce itself.** Ask what the consumer resolves
today before deciding where to write.

The corollary instrument: `test/species_portrait_coverage.cjs` asserts that **every shipped asset is
reached by at least one record**. That is the leg that turns this class red, and it is the leg no
manifest-versus-directory check can contain, because both files are legitimately on disk and in the
manifest — the defect is that nothing points at one of them.

## Alternatives considered

- **Derive the filename from the record name, then delete the superseded originals.** Works, but it
  fights ADR 0032 rather than honouring it, changes filenames the app already resolves for no user
  benefit, orphans two files that must then be reasoned about, and falsifies
  `species_portrait_rename_proof.cjs`'s C-ART-6b fixture — which would have sent a correct guard to
  the architect for re-pointing under `failing-guard-routes-to-architect`. A ruled change to a guard
  is expensive; not needing one is free.
- **An alias table mapping short stems to the guide's longer filenames.** Rejected: this is exactly
  the matching-by-cleverness W1/C-ART-5a forbids, and it solves a problem that dissolves once the
  destination is taken from the binding. The census had PROPOSED four aliases; two of the four were
  traps (`Arkanian` for `Arkanian_Offshoot`, `Mandalorian` for `Mandalorian_Human` — different
  species), which is its own argument against automating the class.
- **A second importer for the replacing case.** Rejected by the commissioning ruling and correctly:
  a second route is a second place for the precedence rule to drift.

## Consequences

- The acceptance shape changed and had to be reported as a departure rather than quietly hit: the
  card's "403 re-imported · 9 retained" became **406 · 0 new · 6 retained**, because `Kowakian`,
  `Terrelian_Jango` and `Tarnab` moved from the retained column into the re-pointed one. The
  architect adopted the new numbers as the better measurement. **Flag a number that moves; do not
  reconcile it silently.**
- Filenames in `species_portraits/` are now deliberately allowed to lag record names (`Kowakian.webp`
  holds a Kowakian monkey-lizard). This is correct under C-ART-6 — the id binding is the contract and
  the filename is an import-time concern — but it will look like a defect to someone reading the
  directory. It is not.
- `manifest.json` came out **byte-identical** across the whole re-point. That is the structural proof
  that resolution could not have moved and only pixels differ; it is a stronger post-condition than
  any count, and an asset lap should look for it.
- The same shape is waiting in every other id-bound asset set — vehicle images
  (`build_vehicle_image_manifest.py`) have the identical structure. Any future "re-point the whole
  set" lap there inherits this decision.
