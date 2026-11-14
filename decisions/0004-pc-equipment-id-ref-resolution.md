# 0004. PC equipment is a canonical id-ref, resolved at render via the shared item core

- **Date:** 2026-06-09
- **Status:** accepted

## Context
The items cluster (ADR 0003) had to unify how a player character carries weapons / armor / gear.
Two paths persisted equipment in **divergent** shapes: the creator (`normalizeCreated`) baked a
display object (melee damage as raw `"0"`, qualities as a comma-string, armor's Defense dropped),
while the in-game shop's `buyItem` persisted the canonical-display copy (damage already a `"+N"`
string). The finalized `sheet.equipment` is the **persisted** sheet — read by five render surfaces
(creation summary, two PDF exports, the two sheet tabs) plus the store and the encounter room.

This is also where the project's founding bug class lives: **double-brawn**. A melee weapon's
canonical damage is `{value, base:'brawn'}`; if a damage value that already includes Brawn is
persisted and a consumer adds Brawn again, the number doubles. The combat cluster killed this for
NPCs with one shared resolver; the PC side still had the landmine armed (the shop persisting `"+N"`,
the encounter POST under-counting melee).

## Decision
A PC equipment entry is a **canonical id-ref + instance state**, resolved to a display shape **at
render**, through the **same** weapon core NPCs use (`lib/shared/itemResolve.js`):

- **Catalog item** → `{ id, qty?, currentAmmo?, equipped? }` (the canonical id + per-instance state).
- **Custom/homebrew item** → `{ _inline: <full canonical record, schema-valid>, qty?, equipped? }`
  carrying `_provenance:'custom'` and a namespaced, collision-resistant id (`custom_<ts>_<rand>`).
- `resolveSheetEquipment(equipment, character)` resolves each entry against the registries (or its
  `_inline`), **overlays** instance state (`qty`/`currentAmmo`/`equipped`) onto the registry record,
  and is **map-preserve** (index-stable, so edit-by-index on the persisted entries stays aligned).
- The resolved shape exposes **distinct** fields: `damage` (FFG display: `"+N"` brawn / `"N"` flat)
  and `damageTotal` (arithmetic: base **+ Brawn**, from the one `weaponDamage`). Render shows
  `damage`; the encounter attack POST sends `damageTotal`. **Brawn lands exactly once.**
  > **⚠️ `damageTotal` REMOVED 2026-07-30 (F-60, the subtraction lap; ruling `creator-plumbing-census`
  > D-R0-3).** Its only consumer was the encounter attack POST, and the encounter system was removed in
  > `189e24e`; the R0 census measured **0 readers** afterwards. `resolveSheetEquipment` no longer emits
  > it. **The decision itself stands** — `damage` is still the display field, and **`weaponDamage` is
  > still the ONE place Brawn is added** (itemResolve's public API, pinned by `test/item_resolve.cjs`),
  > so "Brawn lands exactly once" remains true and re-exposing the arithmetic is a one-line call away.
  > Marked here rather than left implicit: an ADR that names a field the code no longer has misinforms
  > whoever reads it first (the ADR 0017 Amendment 1 lesson).
- Resolution discipline is split: **loud** for canonical-integrity paths (NPC id-refs throw on a
  dangling ref — a code bug), **graceful** for PC (`pcResolveEntry` returns null/marker on an
  unresolvable old-shape entry — old saved characters degrade, never crash).
- Edits operate on the **persisted** entries (id/`_inline` + instance), never the resolved display.
- The build-time `derived.soak` snapshot is **preserved** (re-keyed to canonical armor soak) — it is
  a pre-existing computation, NOT live armor→soak re-derivation (which stays the deferred feature).

## Alternatives considered
- **Persist the full canonical record (denormalized) on the sheet.** Rejected: re-introduces the
  display-string / double-brawn landmine, goes stale when the registry changes, bloats saved
  characters, and violates the single-source goal. The id-ref re-resolves fresh every render.
- **Keep display-shape persistence, fix only the encounter arithmetic.** Rejected: lossy and
  fragile (can't recover base/Brawn from a `"+N"` string), and leaves two divergent shapes.
- **A PC-specific resolver.** Rejected: two brawn-math implementations is exactly the drift the
  combat cluster's shared core exists to prevent. The core was extracted to a neutral
  `lib/shared/` module so both apps import it rather than the sheet reaching into `lib/gm/`.

## Consequences
- **Double-brawn is dead on PC and NPC** — one `weaponDamage`, verified end-to-end including the
  encounter POST boundary (the GM server applies the posted number minus soak, never touches Brawn).
- Old saved characters (pre-canonical shape) **degrade gracefully** (skip/marker), not crash — we
  accept losing their equipment data, not throwing.
- **Instance state lives on the entry** (`currentAmmo`/`equipped`/`qty`) and is overlaid at resolve —
  this is the agreed extension to the persisted entry schema; catalog stats are never persisted.
- Custom gear is a first-class `{_inline}` record, so it resolves identically to catalog.
- Any future equipment feature (attachments, new render surface, the character-build cluster) builds
  on `resolveSheetEquipment` + `itemResolve` — do not re-introduce display-shape persistence.
- Verified by `test/item_resolve.cjs` (resolvability + brawn-lands-once) and the browser smokes
  `scripts/smoke_3b.py` (creation/sheet/round-trip) + `scripts/smoke_3c.py` (buy), plus the prod
  deploy check `scripts/prod_check.py`.
