# 0002. Migrate off OggDude + stoogoff to an app-owned schema; normalize on ingest

- **Date:** 2026-06-03
- **Status:** superseded by 0003   <!-- instinct (normalize-on-ingest) kept; narrow scope subsumed by the whole-data-layer canonical model. See 0003 "Relationship to 0002". -->

## Context
App data has two external community sources, both runtime-normalized from coded/
inconsistent shapes:
- **OggDude** — `public/data/oggdude_merged.json` → items/mechanics via `lib/items.js`
  (`window.SWItems`), decoding `wrShort` / `RANGLT` / quality-key misspellings.
- **stoogoff/sw-adversaries** — `public/data/npc-library/*.json` (`generated_from`),
  the NPC stat blocks; vehicles follow the same external-source pattern.

Building the `EncounterBoard` combat surface repeatedly surfaced a "two NPC shapes"
problem — encounter-instance (`g.stats`, object weapons) vs library record
(`characteristics`, name-string weapons) — papered over ad hoc by `deriveNpc`.
`EncounterBoard` is now the canonical combat-surface template; Vehicle/Mass combat
will build on it and would otherwise re-wire the same external dependencies.

## Decision
Plan to migrate **off OggDude + stoogoff** (and align vehicles) onto an **app-owned,
display-ready native schema**. **Normalization is folded into the migration's
build-time ingest** (normalize-on-ingest → one clean shape), rather than building a
standalone runtime `resolveNpc()` first. Implementation is deferred to a dedicated
next session; the placeholder/scope lives in `Docs/DATA_MIGRATION_PLAN.md`.

## Alternatives considered
- **Standalone `resolveNpc()` normalize-on-read layer now** (the earlier backlog
  plan): deferred — it entrenches the external shapes and gets thrown away once data
  is owned. Normalize once, on ingest, instead.
- **Keep depending on OggDude/stoogoff at runtime:** rejected for the commercial
  release — community-shaped data, no ownership/control, inconsistent coded fields.
- **Normalize-on-write into stored encounters:** rejected — bloats/stales stored
  state; a native source-of-truth + on-ingest conversion is cleaner.

## Consequences
- Vehicle & Mass combat must consume the **native schema**, not re-wire OggDude/stoogoff.
- The two-shape NPC problem disappears once records are ingested into one shape;
  `deriveNpc` shrinks and `SWItems` coded-translation thins toward pass-through.
- The **driver** (commercial ownership vs. licensing vs. offline bundling) is still to
  be confirmed next session — it affects how clean-room the conversion must be.
- Until this lands, runtime keeps `SWItems` + `deriveNpc` as-is; do not invest in
  expanding them. Memory: `project_data_migration_plan`, `project_npc_data_normalization`.
