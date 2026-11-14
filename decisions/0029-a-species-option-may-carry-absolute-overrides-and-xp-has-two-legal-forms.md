# 0029. A species option may carry absolute stat overrides, and starting XP has two legal forms

- **Date:** 2026-08-11
- **Status:** accepted
- **Ruled:** `Docs/rulings/csg-v7-subspecies-and-sex.md` (FORK B) and
  `Docs/rulings/csg-v7-option-characteristics-schema.md` (Q1/Q2/Q3), executed by gates
  `csg-option-contract-inert`, `species-variant-resolver` (+ addendum) and `species-variant-ui`.
  Live at `commercial` `632c5207`.

## Context

The Complete Species Guide v7 encodes one concept two ways. 19 families ship as separate stat rows
because their characteristics differ by sex, subspecies, caste, age or condition; 23 more carry an
in-row "N genders available" menu because their characteristics do not and only the abilities change.
8 species offer a sex choice across BOTH encodings. Jason scoped it: only those 8, and only because
the species' own attributes differ — no character anywhere else gains a sex field.

The creator already had a pick-one affordance (`option_choices`, 129 groups across 128 species) that
persisted a choice as `sheet.speciesOptionPicks` and could already move starting XP by a delta
(Gand's "Has Lungs", +10, B-22). What it could not do was let an option change the six characteristics
or the two thresholds — the thing a variant is.

## Decision

**One species entry; the variant is chosen inside it** (FORK B). Not one picker row per variant.

**An option may carry `characteristics` (all six, absolute, a complete replacement of the base),
`wound_threshold_base` and `strain_threshold_base` (absolute), and `starting_xp` (absolute).**
Absolute rather than delta because the source prints whole stat blocks, and a delta would invent
arithmetic nobody printed.

**Starting XP has TWO legal forms and exactly one may appear on an option:** `starting_xp`
(absolute) or `xp_adjustment` (delta). Enforced by the schema's `not: {required: [...]}` and by
`L1cb.oc`. Resolution is
`effectiveXp = (option.starting_xp ?? species.starting_xp) + (option.xp_adjustment ?? 0)`.

**Two authored group-level fields, both absent-tolerant:** `display_name`, the heading a player
reads (`name` stays the persistence key forever); and `preselect`, which decides both the on-open
selection and the no-pick fallback. Absent means false, so all 129 shipped groups keep their existing
behaviour with no data written.

**One resolution point:** `charResolve.speciesEffective(record, picks)`. Seventeen consumer sites read
it; none re-implements it.

## Alternatives considered

**Variants as separate species entries (Fork A).** Refused on the product laws: the picker grows by
43 near-duplicate rows, the just-looking browse degrades, and presenting `Sith (Kissai)` and
`Sith (Massassi)` as peers teaches a novice that they are different species. It also still needed a
second affordance for the 23 in-row cases, so one concept would wear two shapes.

**Mirror the source's split/no-split line (Fork C).** Refused: it guarantees the inconsistency by
design. The author's decision to split a row is an *authoring* convenience, not a statement about
what a player is choosing.

**XP absolute-only.** Rejected: it would rewrite H'nemthe's printed "+15 XP" into an invented
absolute AND migrate Gand's shipped, ruled, prod-verified `xp_adjustment: 10` to solve a problem it
does not have.

**XP delta-only.** Rejected for the mirror-image reason: Togorian male would become
`xp_adjustment: -5`, which is exactly the invented arithmetic the absolute rule forbids elsewhere.

**Renaming groups so the heading reads well.** Refused as data loss: `_groupId` slugs `name` into
`sheet.speciesOptionPicks` and the reader returns early on an unknown key, so a rename silently
destroys every saved pick that keys off it. Hence `display_name` beside it.

**Locking the pick once a species is selected.** Ruled, then superseded by Jason: the pick stays
changeable and pressing SELECT opens a change review showing the cost, with Confirm and Go Back. That
matches the creator's existing inform-never-gate law (`player/app.jsx:6864`, where an overdrawn-XP
guard was deleted rather than bypassed) instead of making the species step the one screen that gates.

## Consequences

- **No save-shape change and no migration.** `speciesOptionPicks` already carried the pick; `sex`,
  `subspecies`, `caste`, `age` and `condition` were all free keys. Legacy sheets need nothing.
- **The pick is consequential, so CONFIRM applies it, not the chip.** A chip records and displays;
  the review states the cost; confirming seeds. This is guarded by watching
  `character.characteristics` in the draft, not by watching a predicate — the predicate moved once
  already and took the guard's grip with it.
- **The base record of a variant species becomes a fallback no live path prints.** Do not rewrite it
  to match the first option to satisfy a checker; an unrecognised pick id resolves to the first
  option rather than falling back to the base.
- **Absolute values mean group completeness matters.** If any option in a group carries a field,
  every option must — otherwise some numbers come from the base and some from the pick with no way to
  tell which. Asserted per field by `L1cb.oc`.
- **Two ways to express starting XP is a real cost, deliberately paid.** The alternative is a registry
  that prints numbers no book contains. A future reader should not "tidy" this into one form.
- **Still owed at the v7 import:** the re-seed action must cover everything the predicate detects
  (C-SVRA-2 — an option moving only a threshold or absolute XP would currently reset characteristics
  for no reason; latent at zero such shipped options); the teaching copy must state the overlay rather
  than promising a window that closes at selection (C-SVU-2); one persistence-key rule across both id
  writers (C-INERT-1); and ADR 0028's rebuildability extended to `species.json` (C-INERT-3).
- **Shipped inert.** No shipped species carries a variant (0 of 129 groups set `preselect`), so the
  block does not render and the review cannot fire until v7 lands. The user-visible change from this
  cluster is the group headings and the skills-preservation fix (B-147).
