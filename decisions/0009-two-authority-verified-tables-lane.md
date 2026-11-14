# 0009. Two verification authorities for the verified-tables lane

- **Date:** 2026-07-06
- **Status:** accepted   <!-- ratified by Jason in-session; architect ruling `Docs/rulings/msp-m3-maneuvers.md` §2 -->

## Context
The verified-tables lane (`Docs/rules_tables/*.json`, ADR-adjacent; scope
`Docs/rulings/verified-tables-lane-scope.md`) originally admitted a table to the trusted overlay only under
`verified_by: "jason"` — Jason diffs the rendered page. That is the right bar for OCR-hostile content (d100
grids, glyph/icon columns, talent-cost trees the corpus renders garbled), but it makes Jason a bottleneck for
PROSE-shaped tables (rule lists, heading+effect menus) that the corpus reads cleanly and the read-only
rules-oracle can cite-check against the actual pages. The mid-session pack's M3 (maneuvers/actions) surfaced
this: those two tables are prose the oracle reads fine.

## Decision
The lane admits a table under **exactly one of two authorities**:

1. **`verified_by: "jason"` — REQUIRED for OCR-hostile content.** Jason diffs the render. Never downgrades to
   oracle.
2. **`verified_by: "oracle"` — PERMITTED for prose the corpus reads cleanly.** The read-only rules-oracle
   cite-checks it; requires a `verified_note` recording the cross-check + page cites.

Four guardrails:
- **Anti-circularity (load-bearing):** an oracle verification MUST read the RAW print pages (`read_pages` on
  the book PDF), NEVER the retrieval overlay or any `verified_table` chunk — otherwise the oracle cites the
  very table under review (the machine confirming its own homework; demonstrated live at the M3 gate). The
  `verified_note` states the raw-page basis.
- **No label dilution:** the index labels human-verified chunks `VERIFIED table`, oracle-verified chunks
  `oracle-verified table` (R-LANE1, `swrpg_index/ingest.py`).
- **Classification calls** (prose vs OCR-hostile) that aren't obvious go to the **architect**, not the drafter.
- **Contract changes route through the architect BEFORE shipping**, not inside a feature gate (the M3 change
  arrived post-hoc and survived on merits + Jason's ratification — recorded as not-a-precedent).

Codified in `scripts/validate_rules_tables.py` (accepts `jason|oracle`, requires `verified_note` for oracle),
`swrpg_index/ingest.py` (both authorities enter the cache; distinct labels), and
`Docs/rules_tables/README.md` (the §2 contract). `R-MSP1` amended: a build lap opens when its Lane-0 input is
**lane-verified under this contract** (was "Jason-verified").

## Alternatives considered
- **Jason-only forever.** Rejected: makes Jason a bottleneck for prose tables the oracle can verify reliably,
  and reserves his scarce attention where it adds no accuracy (the corpus reads the prose cleanly).
- **Oracle-for-everything.** Rejected: the corpus is too garbled for OCR-hostile grids/glyphs (the whole
  reason the lane exists), and the anti-circularity failure mode means an unconstrained oracle would rubber-
  stamp its own ingested tables.
- **A single blurred `verified` flag.** Rejected: a reader (and the oracle) must be able to tell which
  authority stands behind a cited chunk — hence the label split.

## Consequences
- Prose tables ship faster (oracle path) while OCR-hostile grids keep Jason's eyes — attention spent where it
  changes correctness.
- Every oracle verification carries the cost of a raw-page read (`read_pages`), by design — the anti-
  circularity guardrail is non-negotiable.
- The classification call (prose vs OCR-hostile) is a judgment; ambiguous cases escalate to the architect.
  Example held this session: the M6 healing tables (dice-glyph difficulty ladder) were correctly routed to
  Jason's eyes, not the oracle.
- A separate, later finding (R-CITE1) showed the **pre-lane** foundation docs cited PDF page indices, not
  printed pages; the lane's render step calibrates the page offset, so lane-verified tables were unaffected —
  a standing argument for routing citation work through the lane rather than hand-authored docs.
