# 0027. A species name may belong to more than one record, and that is not an error

- **Date:** 2026-08-09
- **Status:** accepted

## Context

The Complete Species Guide import (F-67) put 284 community species into a catalogue that already
held 124. **104 species names now exist on more than one record** — our Barabel from *Unofficial
Species Menagerie* and CSG's Barabel; our Bith from *Fully Operational* and CSG's Bith.

Every instinct on seeing that says "de-duplicate the data." Three separate attempts to act on that
instinct went wrong before the shape settled, and each failed differently:

1. **Refuse to import the overlap.** The census ruling's first draft did this, reading D-PS3
   (*"no source may redefine an id another source owns"*) as an import filter. Jason's question —
   *"if the species menagerie is off then the CSG will populate?"* — exposed it: with the Menagerie
   off, our Barabel is hidden and CSG's was never imported, so a player who enabled **only** CSG got
   **no Barabel at all**, from a book that plainly contains one. Both sources are Community-group
   and therefore default OFF, so that was the *common* case, not an edge.
2. **Overwrite the incumbent.** Changes what an existing character's species means, retroactively,
   for 27 shipped Menagerie species and anyone who built on them.
3. **Collapse duplicates in the name index.** `buildNameIndex` already did something adjacent — it
   marked any duplicated name `false` so `lookupByName` returned `null` rather than guessing. That
   guard is *correct* for genuine ambiguity, but a deliberate cross-source duplicate is not
   ambiguity, and it poisoned the index: **104 legacy sheets' species names would have resolved to
   nothing, silently.**

## Decision

**A species name is not an identity. A record id is.** Three rules, together:

- **IMPORT UNDER YOUR OWN ID.** Every source's species enters as its own record (`csg_<slug>`).
  Nothing ever redefines an id another source owns. D-PS3 is then satisfied *by construction*
  rather than by a filter.
- **DEDUPE AT RENDER, ACROSS ACTIVE SOURCES ONLY.** Where two or more *active* records share a
  name, exactly one is offered, by precedence **official FFG book > earliest-shipped community
  source > later community source**. The dedupe sits immediately after the active-source filter, so
  it can only ever see records the player has switched on.
- **THE NAME INDEX RESOLVES TO THE INCUMBENT, NOT TO NOTHING.** A cross-source duplicate is not the
  ambiguity the collision guard exists for. The index answers with the record that was already in
  the catalogue — the same answer the app resolves a legacy sheet with.

**The sentence that makes the three cohere: discovery changes; ownership never does.** What a
player is *offered* depends on which books are on. What a character *is* was fixed the moment it
was built, because a character stores a record id.

## Alternatives considered

- **Refuse overlapping imports** — lost: makes a book lie about its own contents in its own common
  case (see Context 1).
- **Overwrite the incumbent** — lost: silently changes finished characters.
- **A `variants` field on one record** — a real option, and still the right shape if per-variant
  stat blocks arrive (CSG's Dathomirian has different characteristics, thresholds *and* XP per
  gender; that is deliberately **not** decided here, see `Docs/briefs/csg-refused-subprofiles.md`).
  Lost for the general case because it is a new schema shape *and* a persisted save-shape question:
  a character would have to remember which variant it is. Id-per-record needs neither.
- **Keep the collision guard blind and accept null** — lost on measurement: 104 species names, not
  the one the recon used as its example.

## Consequences

- **The species picker can offer a name whose record differs by which books are on.** That is
  intended. The shelf row says so plainly: *"Where a species you already have appears here too,
  your existing version is used."*
- **The match list is a shipped artefact, not an import report.** The same name-matching that
  classifies NEW / MATCHED / AMBIGUOUS at import is what the render dedupe keys on, so a wrong
  match shows a player two Barabels or none. AMBIGUOUS rows go to a human.
- **Precedence lives in exactly one place** (`lib/shared/sources.js`), and the name index derives
  from it. Four guards that kept private copies of a name-lookup rule were re-pointed at it; a
  fifth private copy would reintroduce the bug.
- **A future source with the same species is now cheap** — it imports under its own ids and takes
  its place in the precedence order. Nothing about this decision is CSG-specific.
- **Do not "fix" the duplicate records.** They are load-bearing. Collapsing them in the data
  destroys either a book's contents or an existing character's species — which is exactly the pair
  of failures this decision exists to avoid.
