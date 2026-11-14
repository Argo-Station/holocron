# 0020. Mod packs may EXTEND and RESTRICT a career's specialization roster — roster-only, never the record

- **Date:** 2026-07-29
- **Status:** accepted

## Context

A mod pack (the reSpecialized variant) could rebuild an existing specialization's talent tree, but
could not add a new specialization to the game, and could not express that a variant *replaces* one.
Both gaps were user-visible:

- A Reddit reporter went looking for Blockade Runner and it wasn't there. The v1 pack shipped 35
  rebuilt trees and **0 adds**.
- The resolver already supported adding a record (`mods.js` merges an unknown id onto `{}`), but
  nothing told a **career** about a new specialization, so an added spec would have existed and been
  reachable from nothing — not the creator's shelf, not `NewSpecJourney`, not `costForNewSpec`'s
  career-vs-other-career pricing.
- Slice 2 then shipped an APPEND-ONLY contract, which produced a seven-specialization Smuggler. The
  project's Smuggler is six: it swaps Pilot **out** for Blockade Runner. Append-only could not express
  what the variant means.

Jason's constraint framed both laps: *"Important it plugs into all the same plumbing as other
specializations."*

## Decision

`careers.overlay.json` in a pack carries, per career, `specializations_add` and
`specializations_remove`. Both are **view-level, roster-only** operations applied by `applyOverlay`:

- **Add** appends ids to the career's roster (after the base ids, so printed order survives) and
  de-dupes. An added specialization must carry the **complete** record shape, because it merges onto
  `{}` rather than onto a base record. Its id carries **no mod prefix** (`blockade_runner`, never
  `respec_blockade_runner`) — a prefix would leak the mod into every id-ref.
- **Remove** filters the roster only. It **never deletes, masks, or alters the specialization
  RECORD**, which stays resolvable in the resolved view.
- Removals are **derived** from the pack source's own career rosters, never hand-listed.
- `applyOverlay` stays pure: the base career record is copied, never mutated.

**The safety property the remove verb rests on:** a character who already OWNS a removed
specialization keeps it and its full talent tree, because a sheet renders an owned spec from the
registry and resolves against its own `sheet.mods` stamp. Roster membership governs only what a
career OFFERS for a NEW pick, and `costForNewSpec` pricing. Nothing a player owns can be taken away by
a pack. This is law (R-S2B-1): **if that assert ever fails, the remove verb is withdrawn.**

Four validator arms enforce the contract in both the node guard and the Python validator: a removed id
must exist on the base roster (a remove that hits nothing is a typo, not a no-op) · a pack may not
remove an id it also adds · a career's resolved roster may never end empty · unsupported keys are
rejected.

## Alternatives considered

- **Append-only (the slice-2 contract).** Safe, and it was the original decision — but it ships a
  roster no version of the game has, so it fails variant fidelity. Superseded by this ADR.
- **A remove verb that drops the RECORD.** Simpler to reason about, and catastrophic: an owned spec
  would stop resolving, silently breaking existing characters. Rejected on the never-destroy-owned-
  content line.
- **Prefixing added ids** (`respec_blockade_runner`) to keep mod content namespaced. Rejected: it
  leaks mod-ness into every id-ref and into save data, which is exactly the "plumbing knows it's a
  mod" failure the constraint forbids. Collisions are handled instead by rule — if canonical later
  claims an added id, canonical wins and the pack entry becomes a rebuild, which is just the merge
  path.

## Consequences

- The pack format has its first durable growth capability. The next slice adds specializations by
  **shipping data**, not by changing code.
- **No UI surface knows what a mod is.** `player/app.jsx` was byte-untouched across both laps; the
  resolver hands every consumer one uniform view. That is the check on any future extension: if a
  surface needs a "was this from a mod?" branch, the design is wrong.
- Classification of which career an added spec belongs to must come from the **pack source's career
  rosters** — a specialization XML carries no career reference at all. A spec no career points at is
  unreachable by construction (R-F9S2-1).
- **The reachability limit is real and currently unsolved:** the `sheet.mods` stamp is written only at
  creation finalize, so a pre-existing vanilla character can never adopt a variant. Today only
  characters *created* under the variant can reach an added specialization. That is designed stamp
  behaviour, not a defect — and it is the first question a variant user asks. Boarded as **F-9-S3**,
  a design fork owing its own concept ruling.
- Both validators must stay in step; the v1 rule "every overlay spec has a base record" is superseded,
  not relaxed — an add is held to a **stricter** bar than a rebuild.
