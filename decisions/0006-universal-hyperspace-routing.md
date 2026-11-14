# 0006. Universal hyperspace routing via geometric off-network legs

- **Date:** 2026-06-13
- **Status:** accepted

## Context

The Universe Map route planner offered an autocomplete over all 2,054 planets but
the Dijkstra engine only knew the 65 lanes / ~730 waypoint planets — **35.5%
coverage**. The other 64.5% of selectable destinations returned "NO ROUTE FOUND"
— a promise the UI made (every planet is pickable) that the engine couldn't keep.
The headline failure case Jason hit was Coruscant → Mandalore (UXQP-42).

A `snapToLane()` projection helper already existed in `lib/gm/pathfinding.js`
with **zero callers**. The question was how to make any two valid planets always
route, and specifically how to attach off-network worlds to the lane graph.

## Decision

**Off-network endpoints route via geometric wild-space legs to their nearest
network entry node** — `routeUniversal()` wires the existing `snapToLane`, fed
ONLY the set of network planets (those with ≥1 lane edge), so it can never snap
to another stranded world. The shape is: off-lane leg → lane network → off-lane
leg. Disconnected lane components bridge with a direct wild-space jump. **"No
route found" is removed as a possible outcome.**

Off-lane legs are classified `wild_space` quality; `calculateUniversalTravelTime()`
sums per-segment days at each segment's own speed and sets the dominant
astrogation difficulty to the **hardest leg on the path** (one wild-space hop ⇒
Daunting). Off-lane segments render **dashed amber** vs the solid violet lane
spine.

Canon alignment is automatic from geometry where the map is right: Coruscant →
Mandalore yields a lane spine + one wild-space leg into Mandalore, matching FFG's
"no major galactic routes" for Mandalore (collapse p.116) — **no per-planet
override needed**.

## Alternatives considered

- **Cited entry-node override table (canonical connections per planet).** A
  hand-curated map of off-network planet → its canonical lane entry, sourced from
  FFG prose. Rejected as the *primary* mechanism: it can't scale to 1,324
  off-network worlds, and inventing connections the books don't state would
  violate the oracle-boundary doctrine (map-derived placements stay inferred).
  **Retained as a deferred Tier 2**, layered ONLY where FFG prose explicitly
  names a connection (e.g. the Atlas Mandalorian Road corridor) — an override on
  top of the geometric default, never a replacement for it.
- **Leave "no route found" for off-network worlds.** Rejected — the autocomplete
  already offers all 2,054 planets, so the UI promises routability it must honor.

## Consequences

- A future session must NOT rip out geometric snapping in favor of a curated
  entry-node table — the table is an *additive override layer*, and the geometric
  default is what guarantees universal coverage. (If Tier 2 overrides land, they
  set the entry node for specific planets; the off-lane leg machinery still draws
  and times the segment.)
- Travel time / astrogation for off-network worlds is an *approximation* from
  straight-line geometry at wild-space speed — intentionally coarse, and harder
  than any lane, which reads correctly at the table.
- The first `wild_space`-quality usage in the app: no route in `gdr_routes_final.json`
  carries it (only `well_traveled` / `minor`), so off-lane legs are the sole
  source. `travelTime.js` already defined the `wild_space` speed + Daunting tier.
- Locked by `test/map_routing.cjs` (universal-coverage + the Mandalore case +
  segment integrity, against shipped data). Keep it green.
- Part of the in-flight MAP LANE (branch `map-lane`, checkpoint `9befddd`); ships
  with the rest of that lap's single gate.
