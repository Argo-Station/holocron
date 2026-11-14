# 0011. One store kernel, two faces — the GM shop generator is retired

- **Date:** 2026-07-10
- **Status:** accepted

## Context

The suite shipped TWO stores. The **player** store (ITM-V1, `lib/store/view.jsx` →
`window.SWRPGStore.Store`) is a prop-driven kernel: catalog grid, item overlay, art ladder + BYOA,
cart/holds/finalize, find-difficulty. The **GM** store (`SessionStoreScreen` in `gm/app.jsx`, ~1,100
lines, + `lib/shopGenerator.js`) was a separate thing entirely: a random-shop GENERATOR (shop-type
presets, a region/planet rarity model, a merchant dice pool, `rarityToDifficulty` — a RAW-DIVERGENT
Table-5-3 math) plus the retired player-publish plumbing (`swrpg_session_store_config`).

Two problems compounded: (1) two independent implementations of "browse items + read find-difficulty"
— a no-compromise-reimplementation violation; (2) the generator's difficulty math diverged from the
RAW-correct shared `window.SWRPGRarity` (Table 5-1/5-2, EotE CRB p.150) the player kernel and ITM-B
already used. STORE-UNIFY resolved both by recon (`store-unify-recon.md`) + concept
(`store-unify-concept.md`); this ADR records the durable architecture.

## Decision

**There is ONE store. The kernel gains a `face: 'player' | 'gm'` prop; the GM app mounts the same
kernel with `face='gm'`.** The generator and its publish plumbing are DELETED, not ported.

- The kernel owns the shared surface (grid, overlay, art/BYOA, find-difficulty via `SWRPGRarity`).
  Player-only pieces (counter/holds/finalize, sell, credits, compare, SHOPPING-FOR) gate behind
  `face==='player'`; the player face is byte-stable (R-SU1).
- The GM face adds GM-only pieces: the **location masthead** (a world's Table 5-2 circumstance +
  primary trade lane → a find modifier that folds into every card live; tap → a planet-typeahead
  picker), per-card find-difficulty, and **THE SHELVES** (named saved stock lists — id-refs only,
  difficulty recomputed at render, `window.SWRPGShelves`, key `swrpg_store_shelves_v1`; one-time
  non-destructive import of the retired `savedShops`).
- Like the player, the GM store's section tabs live in the **contextual bottom bar** (ADR 0010),
  not an in-content tab row; the kernel renders only its sub-category chips.
- `lib/shopGenerator.js` (`window.SWShopGenerator`) is deleted. Its RAW-divergent `rarityToDifficulty`
  convergence work (D-RF3) is **resolved-by-deletion** — with the generator gone there is no divergent
  second source of difficulty left to converge; `SWRPGRarity` is the single source.

## Alternatives considered

- **Keep the generator, converge its math onto `SWRPGRarity` (the old D-RF3 plan).** Rejected: it
  preserves a second store surface and the no-compromise violation; the generator's whole reason
  (procedural stock + a player-publish channel) was already retired, so there was nothing worth
  keeping to converge.
- **A GM-bespoke store chrome reusing only the kernel's item components.** Rejected: that is a third
  partial reimplementation; the kernel is already prop-driven enough that a `face` gate + three
  GM-only additions cover it (the recon proved most of the ~1,100 lines just die).
- **Persist find-difficulty on shelves.** Rejected: id-refs only (§8) — difficulty recomputes at
  render from the item's rarity + the active location modifier, never stored.

## Consequences

- **Future item work lands once.** Both faces share the kernel; a change to the grid/overlay/art/
  find-difficulty is a single edit. New item features add to the kernel behind the `face` gate.
- **`SWRPGRarity` is the sole find-difficulty source** across both apps (Table 5-1/5-2, cited). No
  divergent math remains; D-RF3 is closed.
- **R-SU1 is a standing fence:** any kernel change must keep the player face byte-stable — its two
  smoke suites (`smoke_store` 28/28 + `smoke_byoa` 17/17) are the gate; the GM face has its own
  (`smoke_store_gm`).
- **The player-publish channel is forever dead** — no `swrpg_session_store_config`, no push plumbing.
  A future "send a shop to players" feature would be a new design, not a revival.
- A future session asking "where is the GM shop generator / the random-stock button?" should stop
  here: it was intentionally removed (recon-proven mostly-dead), not lost. The GM curates named
  Shelves by hand instead.
