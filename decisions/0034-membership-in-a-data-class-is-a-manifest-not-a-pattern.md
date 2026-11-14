# 0034. Membership in a data class is a manifest, not a pattern

- **Date:** 2026-08-12
- **Status:** accepted

## Context

The creation-buyout work needed to know which species abilities carry the book's offer to spend XP
removing a penalty. Three consecutive censuses answered that question and **all three were wrong**,
each by anchoring on one phrasing:

| census | method | answer |
|---|---|---|
| architect, ruling `species-followups-creator-moments` R-SFC-1 | matched the sentence containing "10" | **33** |
| implementer, first `apply_creation_buyouts.py` | price-agnostic, still `remove this penalty` | **34** |
| architect, ruling `creation-buyout-count-and-price` §2 | five-rung ladder widening to `\d+ XP`, proven closed | **36** |

The 34th was `csg_roonan`, whose offer costs **5 XP** — invisible to a search anchored on "10". The
35th was `csg_toong`, whose window is "during **or after** character creation" — invisible to a
search for the exact closing sentence. The 36th was `ewok_aaa`, which says the ability "may be
**bought off** for 10 XP with GM approval" — a third phrasing that shares almost no words with the
other two. Final shape: **four ability names, three phrasings, two prices, two windows, one carrier
at option level, one from an official book.**

Each census was a correct search for the thing it searched for, and silent about everything else.
The failure was not carelessness — it was that a regex was being asked to *define* a set rather than
*find* candidates for one. The same shape appeared twice more the same day in unrelated work
(a `skillDescs` "zero readers" claim from grepping one symbol in one file; a B-164 "carries nothing"
claim from reading one level of a nested record), which is what made it a pattern worth writing down
rather than an incident.

## Decision

**When a data class becomes a durable contract — a stamped field, a validator literal, a surface's
population — its membership is an ENUMERATED MANIFEST reviewed by a human, not a pattern evaluated at
runtime. Patterns discover candidates; the manifest is what ships.**

Concretely, as implemented for the buyout class:

1. The apply script carries the explicit list (species id · ability · level · price · window), each
   row derived from a probe set **proven closed** under a deliberately over-wide pattern.
2. The validator asserts the manifest exactly — no more, no fewer — and imports it from the script
   rather than restating it, so there is one list and one home.
3. Every value the manifest asserts is checked against its own source, not against a constant: each
   carrier's stamped price must equal the number printed in that ability's own prose.
4. **A DISCOVERY GUARD fails the build loudly** on any record matching the over-wide pattern that is
   neither manifested nor named as an exclusion. New data cannot enter the class silently; it arrives
   as a red check naming the record.
5. **Exclusions are named with reasons, never silent** — two lookalikes (a Force-sight purchase, a
   per-body enhancement) and one deferral (the Ewok) are listed in the script by name.

## Alternatives considered

- **A better regex.** Rejected on evidence: three attempts, each better than the last, each still
  wrong. A fourth would be a guess about phrasings not yet seen. The over-wide pattern survives —
  demoted to a tripwire, where being over-wide is a virtue rather than a defect.
- **A flat count assert (`== N`).** Rejected because it fails to discriminate: it catches a carrier
  gained or lost but says nothing about whether each carrier's *value* is right. It would have passed
  a hard-coded price of 10 stamped on the 5-XP records — the exact defect the class exists to prevent.
- **Deriving membership at runtime from the pattern.** Rejected as the same failure with extra steps:
  the set would silently change shape on every import, which is precisely what a durable contract must
  not do.
- **Excluding the awkward members** (the 5-XP ones, the wider-window one). Rejected firmly: it would
  ship a surface that silently refuses printed offers, which is the silent-partial class this whole
  programme exists to eliminate.

## Consequences

**Accepted cost: the manifest must be maintained.** A ruled import that adds a carrier requires a
manifest edit, and that edit is a ruling rather than a keystroke. This is deliberate — the cost buys
the property that no one can change the class by accident, and the discovery guard means forgetting
is loud rather than silent.

**A future session will be tempted to "simplify" the manifest back into the regex sitting a few lines
above it.** Do not. The regex is there to guard the manifest, and the manifest is there because the
regex was wrong three times. If the list feels redundant, that is the guard working.

**Generalizes beyond this class.** The same shape is owed anywhere a count enters a durable contract.
The two open members of the family today are B-163 (146 records whose prose promises a talent grant
nothing structures) and B-167 (a credit-priced variant of this very offer) — both will need a
manifest, not a pattern.

**The corollary for negatives, which is where all three failures started:** a load-bearing negative —
"nothing else matches", "this has no readers", "this record carries none" — requires a second,
differently-aimed pass before it is stated as fact. One query establishes a candidate set; it never
establishes an empty one.

**Related:** ruling `creation-buyout-count-and-price` (R-CBC-2/3, error ledger #44) ·
`species-followups-creator-moments` (R-SFC-3 — promises move from prose into structured fields) ·
ADR 0031 (a green count is not a delta) · ADR 0029 (a species option may carry absolute overrides).
