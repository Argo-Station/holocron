# 0003. Canonical, app-owned data architecture

- **Date:** 2026-06-04
- **Status:** accepted   <!-- proposed | accepted | superseded by NNNN -->
- **Supersedes:** 0002 (scope) — see "Relationship to 0002" below.

## Context

Nearly the entire game-content data layer is externally extracted (OggDude, stoogoff;
plus planets, factions, skill-check templates) with **no central structure** binding it.
Each dataset grew its own ad-hoc normalizer, reconciled at runtime — 6+ of them — and
there is no `lib/schema`, `lib/types`, or `lib/models`. Nothing defines "what is a Weapon /
NPC / Vehicle" once.

The cost is real and measured, not theoretical:

- Two divergent NPC shapes (library split `characteristics`/`derived` vs the encounter
  store's merged `stats`) reconciled field-by-field by `deriveNpc`.
- Two divergent weapon resolvers (`resolveNpcWeapon` in `gm/index.html`, `resolveWeapon` in
  `encounterStore.js`) emitting **different keys** for the same NPC.
- The "Weapon — / —" empty-profile bug, and a live melee bug: `SWItems.normalizeWeapon`
  drops `DamageAdd`, so catalog melee weapons render `Br+0`.
- Even `DATA_INVENTORY.md` drifted — the map of the data went out of sync with the data.

0002 scoped a *narrow* fix (drop OggDude + stoogoff for NPCs/vehicles). That scope is too
small: the problem is the absent center across the whole data layer, and the NPC combat
surface is simply the first *cross-dataset* feature to hit it.

Constraints shaping the solution: Cloudflare Pages **static-only** (no D1/R2/KV/functions);
**buildless** JS apps (CDN globals, no build step) — so they cannot host a validation step;
the **Python side has real tooling** (the ingest scripts; the `swrpg` rules index). The
driver is **technical control**, not IP/licensing. The break from upstream is **clean** —
a one-time ETL, no re-sync. And it is **not greenfield**: `ingest_stoogoff.py` and
`build_vehicle_library.py` already normalize on ingest into schema-versioned outputs;
OggDude is the runtime-normalized holdout; vehicles are *derived from* OggDude (extracted
twice). Each existing pipeline invented its **own** schema namespace — the missing piece is
a single shared schema they all target.

## End state (north star)

The end goal is the **complete** migration of every externally-brought-in dataset into ONE
app-owned, canonical dataset — and the deletion of the source blobs once nothing reads them.
In scope is **all** of it: OggDude (items, weapons, armor, gear, attachments, **and the
character-creation data — species, careers, specializations, talent trees, Force powers,
signature abilities**), stoogoff/sw-adversaries (NPCs), the vehicle extraction, planets,
factions, skill-check templates, and anything else lifted from an outside source.

"Canonical" means a **smart** shape designed for *this product's* purpose — display-ready,
explicit-keyed (no `wr*`/`RANG*`/coded fields), deduplicated, cross-linked by id, schema-
validated — **not** a 1:1 re-host of OggDude's render-time-decoded shapes. Each entity is
defined once.

It serves **both shipped apps uniformly**: the **Player Datapad** (character creator + sheet)
and the **GM Holocron** read the same canonical entities through one shape per entity. No app
parses raw OggDude/stoogoff at runtime; when an entity is migrated, both apps consume the
canonical form, and the source blob (`oggdude_merged.json`, the raw NPC library, the vehicle
re-extraction, …) is retired.

The clustered sequence in the Decision below is the **path** to this end state, ordered by
where cross-dataset features tear (combat first — shipped 2026-06-07). Notably, the
character-creation data the Player Datapad still reads straight from `oggdude_merged.json`
(species / careers / specializations / talents / Force powers) is squarely IN this end state
— a future "character-build" cluster — even though it is not yet scoped or started. Status
2026-06-07: combat cluster (Weapon + NPC) is the only slice migrated so far.

## Decision

1. **One shared canonical schema set** in `schema/` (+ `schema/vocab/`) defines each entity
   once (Weapon, NPC, Vehicle, Planet, Faction, Item, …), in language-neutral JSON Schema,
   replacing the 6+ ad-hoc normalizers. This is the "central structure."
2. **Normalize on ingest, not at runtime** — generalize the existing pipeline pattern to
   OggDude. **Enforce schemas in the Python ingest** (the only layer with tooling); the
   buildless JS apps consume pre-validated static JSON.
3. **Storage substrate is static JSON.** The buildless reality plus read-mostly reference
   data settle it; no D1/server for reference data. (If user-authored persistence ever
   arrives, that is a separate *user-data* store — never conflated with reference data.)
4. **Sequence by cross-dataset feature cluster, not by dataset, and not all at once.**
   Combat cluster first (Weapon + NPC + CastGroup), where the seams already tore. Then
   items-on-sheets, then planet→faction→NPC world-links. The canonical model grows
   monotonically; no entity is defined twice; every increment ships a working feature.
5. **The rules index (layer #2) stays out of the shipped product but is the migration's
   oracle** — verifier (it adjudicated the NPC defence array order), reconciler (unreliable
   `source` strings → real book provenance), and gap-filler (profiles for weapons absent
   from OggDude, e.g. "Vibrosword"). It is accessed via the project's **oracle agent** (the
   `rules-oracle` subagent), which retrieves canonical data from the rulebook text rather
   than via hand-rolled index queries.
6. **Durable vs throwaway is explicit.** Source parsers are throwaway. The schemas, vocab
   files, and human-adjudicated artifacts (the weapon-alias table, custom-Weapon
   registrations) are **durable and tracked** — they survive every re-run.
7. **Fail-loud at ingest plus ground-truth verification replace silent runtime
   reconciliation.** Redundant source signals (e.g. `DamageAdd` + `SkillKey` + `Type`)
   become integrity checks; unresolved values stop the pipeline rather than emitting a
   silent wrong value.

## Alternatives considered

- **Keep 0002's narrow scope** (drop OggDude+stoogoff for NPCs/vehicles only). Rejected as
  the standing decision: it fixes the symptom dataset, not the absent center, and would
  leave the next cross-dataset feature to re-hit the same seams. Its instinct is kept; its
  scope is subsumed (see Relationship to 0002).
- **A standalone runtime `resolveNpc()` / normalize-on-read layer.** Rejected (also 0002's
  own rejection): it entrenches the external shapes and is thrown away the moment the data
  is owned. Normalize once, on ingest, instead.
- **Keep depending on OggDude/stoogoff shapes at runtime.** Rejected for a commercial
  release: community-shaped data with inconsistent coded fields and no ownership — the 6+
  divergent normalizers are precisely the recurring cost.
- **D1 / R2 / KV as the storage substrate.** Rejected for *reference* data: the apps are
  buildless and static-only, and the data is read-mostly, so static JSON validated at
  ingest is sufficient and simpler. A server store is reserved only for any future
  *user-authored* persistence, never conflated with reference data.
- **Migrate per-dataset (or all datasets at once).** Rejected in favor of cross-dataset
  *feature clusters*: per-dataset repeats the isolation that caused the divergence, and
  big-bang carries unbounded risk. Cluster-by-cluster grows one canonical model
  monotonically while each increment ships a working feature.

## Consequences

**Positive**
- One shape per entity, read uniformly anywhere (vehicle loadouts, NPC management, shops).
- `deriveNpc`, both weapon resolvers, and `normalizeSkill` are deleted; SWItems' maps
  survive as shared vocabulary (forward at ingest, backward at render), its decode-at-render
  functions retire.
- Live bugs fixed by construction: "Weapon —", melee `Br+0`, the divergent crit keys.
- The inventory is generated from schema + data and cannot drift.
- New features populate a known schema instead of adding an Nth normalizer; cross-entity
  links are id references.

**Costs / risks**
- A one-time **human-in-the-loop** weapon-resolution pass (dirty library names across
  ~1,430 NPCs; some weapons absent from OggDude).
- A **v3→v4 encounter `localStorage` migration** — the first to touch cast-group shape, so
  net-new work, not templated by the additive-only v2→v3.
- Consumer rewiring is a follow-on, not part of the ingest.
- Delivered over multiple clusters, not a single change.

**Neutral**
- The rules index gains a migration role despite never shipping.

## Relationship to 0002

0002's instinct (normalize once, on ingest) is **kept**; its scope ("drop OggDude+stoogoff
for NPCs/vehicles") is **subsumed** by the whole-data-layer canonical model; and its framing
is **corrected** — vehicles are not a separate migration target, they are a derived view of
OggDude, so canonicalizing OggDude subsumes them. 0002 is marked superseded by this ADR.

## Status of related work

- Combat-cluster schemas: `weapon.schema.json` (locked), `npc.schema.json` (final),
  `castgroup.schema.json` (drafted) — plus `schema/vocab/{skills,ranges,qualities}`.
- Ingest pipeline specified: `Docs/INGEST_PIPELINE_COMBAT_CLUSTER.md`.
- This ADR records the decision the above execute against.
