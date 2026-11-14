# 0014. The ACTIVE SOURCES filter — one shared predicate; discovery not ownership; split from the era step

- **Date:** 2026-07-12
- **Status:** accepted

## Context

Players wanted to limit which source books the apps offer content from ("we don't own that
supplement — stop showing me its gear"). The data made it possible: every canonical registry record
already carries a `sources` array, reconciled to one book vocabulary in BOOKS-1a
(`schema/vocab/books.vocab.json`, its aliases ARE the mapping table). The feature was concepted in
`books-filter-scope` with an Amendment 1 folding in a multi-select "Choose Your Eras" creator step.

Two forces shaped the architecture. First, the filter must never break existing characters — a
character already using content from a book you turn off has to keep working. Second, the lap grew two
different kinds of work: a shippable FILTER (settings + catalog consumers) and an unstarted HERO
SURFACE (the era multi-select + a dual-mechanic Morality change that alters the saved-character
shape). Gluing them into one gate served neither.

## Decision

**One shared predicate, `window.SWRPGSources` (`lib/shared/sources.js`), consulted by every discovery
surface. Two laws:**

1. **Filters DISCOVERY, never OWNERSHIP.** Resolve-at-render never calls it; owned/held/installed
   content renders normally. The filter governs only what pickers and catalogs OFFER.
2. **Default is EVERYTHING ON — persist only the OFF set.** A book absent from storage (including a
   future ingest) is ON by construction; nobody's app changes uninvited. Turning off the last core is
   refused (an empty creator is a bug, not a choice).

Supporting rules:
- **Unknown book → always VISIBLE (Law 2 hardened).** A source string not in the vocab is never a
  reason to hide a record. Canonical registries can't hit this (validator `L1bk` guarantees
  resolution); it protects the vehicle library and future data.
- **The vehicle library reconciles into the vocab, not a second table** (ruling
  `books-1b-vehicle-vocab-handoff`, D1a): vehicles use `source`/`source_code` (not a `sources`
  array), so their spellings are folded in as **aliases** on the books they already name; the adapter
  passes `[source, source_code]`, both resolving to one id. `L1veh` + `L1bk.uniq` validators keep it
  honest. Intentionally-hidden content (D2, the two unique-canon AoR-Beta ships) uses an explicit
  `hidden_source_codes` list — NOT "unmapped," because unmapped is Law-2-visible.
- **The NPC library is EXCLUDED** — its community-compiled per-record sourcing isn't registry-grade;
  filtering it would be fake precision. Stated in-product.

**The lap is SPLIT (ruling `books-1b-lap-plan-handoff`):**
- **BOOKS-1b = the filter** — the predicate, the shared ⚙ ACTIVE SOURCES panel (player + GM
  identical), and the vocab-clean consumers: store catalog, vehicle-attachments, Ship Yard index.
- **BOOKS-1c = the era hero lap** — the "Choose Your Eras" multi-select step, the dual-mechanic
  Morality sub-step, and the creator picker wiring (each site touched ONCE with off-set + era-set).
  The era set persists as an **additive `eras` array** alongside the existing `book` field; absent
  `eras` reads as `[book]` (legacy = one-selected); no version bump.

## Alternatives considered

- **Per-surface bespoke filters.** Rejected — one shared predicate + one settings section is the
  subtraction; N surface-local filters drift and re-implement the same question.
- **Per-app (player vs GM) book sets.** Rejected — one table owns one shelf; a per-seat split is
  speculative complexity (`books-filter-scope` §2).
- **Filter the NPC library too.** Rejected — its sourcing isn't registry-grade (fake precision).
- **Give vehicles a canonical `sources` array at build time** (instead of vocab aliases). Deferred,
  not chosen — the right model only inside a full vehicle-library canonicalization, which is its own
  program, not this feature's freight (D1 option b).
- **Keep BOOKS-1b and the era step in one lap/gate.** Rejected — the era step is a hero surface (owed
  craft-up-front + an eyeball) AND a durable save-shape change; splitting lets the filter ship clean
  now and gives the hero surface a focused concept→build→gate lap.
- **Hide the two AoR-Beta ships by leaving them unmapped.** Rejected — Law 2 makes unmapped content
  visible; hiding needs an explicit list, and the ships stay (unique canon, ownership untouched).

## Consequences

- **New discovery surfaces filter in one line** — call `SWRPGSources.isActiveWith(record, index,
  off)` (adapt the record to `{sources:[…]}` if its shape differs) and subscribe to
  `swrpg-sources-changed` for live re-filter. The creator's 6 pickers are the remaining consumers
  (BOOKS-1c).
- **`books.vocab.json` is the single mapping home.** New book content that fails `L1bk`/`L1veh` is the
  signal to add an alias/row (via `apply_vehicle_vocab.py` for vehicle sources), not to special-case a
  consumer. `L1bk.uniq` forbids a short-code mapping to two books.
- **Ownership is structurally safe** — the filter lives only in the browse/catalog assembly, never in
  resolve-at-render. A future change must preserve that line: filter discovery lists, never the
  owned/held/installed render path.
- **The era save-shape is pre-committed** — BOOKS-1c persists `eras` additively; every existing reader
  of `book` keeps working. A future session must NOT introduce a new required field or a version bump
  for the era set.
- **The two AoR-Beta ships are hidden, not gone** (P-5 in `Docs/POLISH_BACKLOG.md`): a future session
  asking "where's the Immobilizer 418 Interdictor?" should stop here — it's in the library, hidden
  from discovery, awaiting a released-book re-source or retirement at the polish lap.

## Amendment 1 — G12 (F-48): default BY GROUP, not all-on (2026-07-18)

Ruling `community-default-off-recon.md` (Jason: "Community sources should default to off. Only
official content should be default on always.") flips this ADR's "everything on by default" for
**Community/UserData** groups only. Official groups (Core/Era/Supplement) stay on by default; a
book's default is now its GROUP. The persisted contract goes v1 `{off:{…}}` → **v2
`{version:2, override:{<bookId>:true|false}}`** — `override` records the user's flips against the
group default; a book absent from `override` sits at its group default. `load()` migrates v1
losslessly (each `off` id → `override[id]=false`); bad/unknown shapes degrade to **group defaults**,
not all-on. **Law 2 unchanged** — UNKNOWN books (not in the vocab) are still never hidden; the opt-in
default applies only to vocab-known Community/UserData. Last-active-Core guard, discovery-only scope,
and the additive era save-shape all hold. The migration is SILENT in-app (Jason override, ruling §3):
no in-app notice — the ⚙ panel marks opt-in groups "OFF BY DEFAULT · OPT IN" (standing furniture) and
the one-time transition line rides the Discord update channel. Forward-fit:
F-42 user-data packs join as groups with their own defaults (own pack on / imported off) — no
further contract change. Guard: `test/sources.cjs` §4 (derivation × overrides × migration ×
last-core × Law 2). Consumers unchanged — `current().off` still returns a RESOLVED off-set feeding
the untouched `isActiveWith`.
