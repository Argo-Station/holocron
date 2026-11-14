# 0019. Species lore is structured sections, authored at full length, batched with no stub phase

- **Date:** 2026-07-28
- **Status:** accepted

## Context

F-EDS-6's compliance programme reached species, the largest family in it: **124 records, 509.5 KB of
verbatim FFG prose** — twelve times the careers family and nearly twice specializations. The median
entry ran 4,022 characters and the longest 10,163, and **116 of 124 already followed the rulebook's
own four-part structure** (`Physiology` / `Society` / `Homeworld` / `Language`) as plain text inside
one `description` blob.

The classification lap established, on whole-record evidence rather than analogy, that the
descriptions were **pure narrative** — 4,232 sentences scanned, all 111 flagged candidates read by
hand and every one a false positive, plus 149 unmarked sentences sampled across 31 records. Every
mechanical fact already lived in structured fields (`characteristics`, thresholds, `starting_skills`,
`special_abilities`, `option_choices`). **Nothing mechanical was at risk under any shape**, which is
what made this purely a product-shape decision rather than a compliance one.

The previous two families had each been replaced with a 2–4 sentence paragraph. Applied here that
would have been an **87% cut** to the species encyclopedia — on the surface where a new player
browses and decides who to be.

## Decision

Species descriptions become **structured, authored sections**: the schema gains optional
`physiology` · `society` · `homeworld` · `language`, and `description` remains as a short lead
paragraph (the picker's teaser). Every record is authored **at full length** — no stubs, ever.

Three properties make it work:

- **Tolerant by construction.** A record with no sections renders its `description` blob exactly as
  before. This is what allowed the family to ship in **seven batches** with no migration and no
  half-finished surface, and it was asserted in the guard and on screen, not assumed.
- **Batched, exposure-first.** Core rulebooks first, the default-OFF community source last. The
  official tier closed at batch 5, meaning nothing a default-settings player could browse carried
  FFG prose from that point on — five batches before the family finished.
- **No stub phase.** A record was either untouched or fully written. The interim state was never a
  degraded product.

Final: **117 records authored, 206.8 KB written, 509.5 KB retired, zero records carrying book text**
(asserted directly by `test/narrative_prose.cjs`, not counted).

## Alternatives considered

- **(a) Short-paragraph stubs, as careers and specializations got.** Cheapest — ~50 KB of authoring
  against ~500 KB. **Rejected as a terminal state:** it fails the just-looking moment and the
  baseline law (OggDude ships a full species encyclopedia; the one surface where the comparison is
  most visible must not be the one we gut). As an "interim" it had no bounded restoration path, so
  the interim would have *been* the product for an unknown period. Careers' ~80% cut of a 2.2 KB
  blurb was proportionate; a 90% cut of a four-section encyclopedia is a different perceptual class.
- **(b) Author at full length as one blob.** Passes the product laws identically — same authoring
  volume, none of the structural gain. Lost on process, not principle.
- **(d) Corpus-sourced rewrite.** Not a shape but a *source*; it may feed future authoring under the
  standing corpus-driven directive. Gates nothing.

## Consequences

**Accepted cost.** Roughly eight laps of careers-sized authoring (it came in at seven), with the
book's text live on unreached species throughout. Jason chose that tempo explicitly over a
stub-everything-now alternative that would have killed the exposure faster at the cost of the
surface. The duration was made explicit on paper before the work began rather than discovered.

**The surface is now improvable per section** — rendering, ordering and future authoring can act on
`society` without touching `homeworld`. The blob is gone as a concept, not just as content.

**The tolerant render is a standing contract**, not a migration artifact: absent sections must always
fall back to `description`. The 7 hand-authored `_provenance: authored` controls still have no
sections and render correctly through that path today.

**A future family facing the same fork should note what actually decided it:** not the volume, and
not the compliance risk (which was nil under every option), but *what the surface deserves to be*.
The product laws filtered the shapes first; process criteria only chose among the survivors.

**Related durable rules,** minted from failures during the lane and binding future multi-batch
families: **R-EDS6-2b** (fingerprint sweeps scope to replaced records only), **R-EDS6-6b** (test
fixtures drawn from a shrinking pool must be derived at run time, never hardcoded, and must declare
their end-state), **R-EDS6-2c** (the in-loop check refuses out-of-boundary records rather than
passing them meaninglessly). All three are enforced in `scripts/f_eds_6_batch_authoring.py`, which
self-checks. Rulings: `f-eds-6-species-classification`, `f-eds-6-species-lap-plan`, and
`f-eds-6-species-batch-1` … `-7`.
