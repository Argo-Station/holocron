# 0016. NPC bench members carry an instance identity (schema v5)

- **Date:** 2026-07-21
- **Status:** accepted

## Context

The GM NPC bench ("paper that remembers") persisted each group member AS its catalog reference: a
member was `{ _source_key, currentWounds, ... }`, and `addMember` deduped by `_source_key`. This made
member identity == the id-ref into the canonical NPC registry, which had one hard consequence: **the
same NPC could not appear twice in a group.** A community report surfaced it — a GM couldn't field two
rival Wookiee Warriors (each a distinct individual with its own wound track), and the bench silently
refused the second add.

The minion `×N` line count (v3) covered pooled minions correctly, but that is the wrong model for
rivals/nemeses (individuals, not a pool) and even for *two separate* minion squads (RAW minion pools are
per-group — two ×4 stormtrooper squads are two pools with independent fallen counts and initiative slots,
never one ×8). So the missing capability spanned every tier.

Supporting duplicates requires each member to have an identity independent of its catalog reference —
a **persisted save-shape change** (R-SY4 durable contract). The shape surfaced on paper (ruling
`bench-reports-triage` §4) and Jason directed the resolution (Amendment 1 / G-BENCH-DUP): duplicates for
ANY tier, universally.

## Decision

**Bench schema v5: every member gains a generated, globally-unique instance `id`.** `_source_key` stays
as the stat catalog reference (the resolve-at-render id-ref rule is unchanged — stats never persist).

- **Identity split:** `id` = the member instance (mutable-state owner); `_source_key` = the stat source.
  A member is now `{ id, _source_key, currentWounds, currentStrain, conditions, notes, count, poolWounds }`.
- **Dedup removed:** `addMember` always creates a NEW member. Adding the same source twice yields two
  rival/nemesis instances (independent wound tracks) or two minion `×N` lines (independent pools, never
  merged).
- **All member ops key by `id`:** `removeMember` / `setMember` / `setPoolWounds` / `getMember` in
  `benchStore.js`, and every call site in the `view.jsx` group drill (flip selection, strip chips,
  pool frames, arrangement). Stat resolution (`resolveBySourceKey`) still keys by `_source_key`.
- **Migration v4→v5 is additive + migrate-on-read:** `normalizeMember` mints an `id` for any pre-v5
  member on load (the same pattern group ids already use); `arrangement` remaps `_source_key`→`id`
  (1:1 for pre-v5 data, which had no duplicates). No data loss.
- **Ids are globally unique** (UUID / timestamp+rand), not merely unique-within-group.
- **Disambiguation:** same-source members render a `· A / · B` suffix; the add list shows "ADD ANOTHER"
  when the source is already present.

## Alternatives considered

- **A `count` on rivals (pool-style), like minions.** RAW-wrong: rivals/nemeses don't pool wounds —
  each is an individual with its own track. Rejected.
- **"Clone to a renamed custom NPC" as the duplicate path.** A workaround: it duplicates catalog data
  and loses the id-ref (the bench's whole design is id-refs + a mutable overlay, no cloned stats).
  Rejected.
- **Tier-scoped duplicates (rivals/nemeses only; minions keep ×N merge).** The architect's original §4
  concept. Superseded by Amendment 1: two ×4 minion lines are MORE RAW-correct than one ×8 (per-group
  pools), and universal instances are more on-thesis (the bench is paper — the GM's story, including a
  cloned nemesis, is recorded not resisted).
- **Do nothing.** Leaves a GM unable to field the single most common encounter shape (two of the same).

## Consequences

- **Positive — the encounter tracker's prerequisite is now in place.** A future combat/initiative
  tracker must reference individual combatants ("squad B acts", "clone #2 at 12 wounds"). Under v4
  (identity = `_source_key`) duplicates were indistinguishable; v5's globally-unique `id` is the stable
  handle it will point at. Two forward-compat pins are load-bearing and MUST be preserved: (1) instance
  ids are globally unique so a tracker pulling members from multiple groups can't collide; (2) readers
  are tolerant of a dangling member id (the existing dropped-id-ref placeholder idiom). The tracker
  carries its OWN save-shape (encounter state referencing member ids) — its own R-SY4 on paper at its
  own time; v5 is the foundation, not the tracker.
- **Re-keying discipline is now permanent:** any new bench member operation MUST key by `id`, never
  `_source_key`. Stat/registry lookups still key by `_source_key`. The node guard `npc_bench_store.cjs`
  pins both (dup-independence + id-keying); it will fail loudly if a future edit reintroduces
  `_source_key`-keyed mutation.
- **No going back cleanly:** v5 is a durable save-shape. A rollback would strand v5 saves' instance ids
  (though the tolerant reader would degrade rather than throw). Treat v5 as the floor.
- **Deploy caution for save-shape changes (observed this deploy):** `benchStore.js` and its consumer
  `view.js` are separate same-`max-age` (300s) bundles; CF edge cache can serve them one revalidation
  cycle apart, so a live user mid-deploy can briefly load a new consumer against a stale store (writes
  no-op, no corruption; self-heals ≤5 min). Not blocking, but a cache-purge-on-deploy or filename-hashed
  bundles would remove the window — an ops follow-up when a save-shape change next ships.
