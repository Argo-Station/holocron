# 0032. A derived binding is FROZEN once made — re-deriving it from a mutable key is the bug

- **Date:** 2026-08-12
- **Status:** accepted

## Context

Species portraits resolved by building a filename out of the species' **rendered name**:
`speciesImgPath(name)` → `stem(name) + '.webp'` → look it up in a manifest of files on disk.

That works until a name changes. The v7 re-import expanded `Kowakian` to `Kowakian monkey-lizard` and
`Terrelian Jango` to `Terrelian Jango Jumper` — both legitimate corrections from the source author,
both records keeping their ids so no saved character lost its pointer. **Both silently lost their
art.** Nothing errored. The record still looked complete and the tile simply went blank, which is the
failure mode this whole cluster has been paying for: an instrument that cannot observe a thing
reports its absence.

Ruling `csg-v7-art-completion` fixed the CONTRACT — *"resolution keys off something stable, not the
rendered name"* — and explicitly left the MECHANISM open, having not read the consumer (five call
sites, a boot-time index, a parenthetical-stripping fallback). This ADR records the mechanism chosen
and, more importantly, **the property that makes it work**, because the obvious "simplification"
silently reintroduces the original bug.

## Decision

**The manifest carries an `id → file` map that is FROZEN once made. A binding is dropped only when
its TARGET disappears — never when a key it was derived from changes.**

Three derivations, in order, and the order is the design:

1. **an existing binding whose file is still on disk** — kept verbatim, no re-derivation;
2. the record's **current name**, through the app's own stem rule;
3. **the id itself**, `csg_` stripped, matched case-insensitively.

Rule 3 is why this needs **no hand-maintained alias table** — which mattered, because
`csg-v7-option-abilities-schema` had just ruled (C-OAB-5) that the two-entry rename map should be the
last one. Ids are slugged from the name a record carried when first imported, so a renamed record
still carries its own history: `csg_kowakian` finds `Kowakian.webp` because it *is* "kowakian".

**Rule 1 is the load-bearing one.** Rules 2 and 3 seed; rule 1 is what makes a binding survive.

Consumers accept **either a record or a bare name**: the id path first, the name path demoted to a
fallback rather than removed.

## Alternatives considered

- **Rebuild the map from names on every run.** The obvious implementation, and it is the original bug
  wearing a map. A rebuild after a rename finds no file for the new name and drops the binding —
  exactly what we set out to prevent. *This is the one a future reader is most likely to "clean up"
  into, which is why this ADR exists.*
- **A hand-written alias table** (`old name → file`). Works, and was rejected: it is the artifact
  C-OAB-5 had just given an expiry date, it grows with every rename, and it must be maintained by
  someone who remembers why.
- **Rename the files to match the new names.** Fixes two records and leaves the coupling intact, so
  the next rename breaks the next portrait. The ruling asked for the root, not the instance.
- **Key the manifest by id only, dropping the name path.** Cleaner in the abstract; rejected on blast
  radius — it would have forced all five call sites and any consumer holding only a name to change in
  one step, with no fallback if one was missed.

## Consequences

**Do not "simplify" the builder into a pure function of the current registry.** It is deliberately
stateful: it reads the previous manifest and preserves bindings. That is not an oversight to be
tidied away — it is the entire mechanism. A binding whose file still exists is never recomputed.

**Bindings can go stale in one direction, on purpose.** If a file is replaced by one with a different
name for the same species, the old binding is dropped (its target is gone) and rules 2–3 re-seed. If
a *record* is renamed, nothing happens. That asymmetry is the point.

**The guard proves the mutant in both directions** (`test/species_portrait_rename_proof.cjs`):
renaming every record detaches **0** portraits, and without the id map the same rename would detach
**all 419** — so the green is demonstrably not vacuous.

**Scope:** this is for a derived mapping between two things that both persist, where the derivation
key is a *display* field. It is not a general licence to cache. The test is whether the key can
legitimately change while the relationship it encodes does not.

**Related:** charter §8 (id-refs, never persist display shapes) and
`source-modification-is-permitted` §15 (an id never changes meaning) already say the id is the
contract — this ADR is what happens when a *derived artefact* forgets that.
[0028](0028-a-derived-artefact-must-be-rebuildable-from-tracked-source.md) is the tension worth
naming: a derived artefact must be rebuildable, and this one is — but rebuilding it must **carry
forward what it already knew**, not recompute it from a key that moved.
