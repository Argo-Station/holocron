# 0021. Crafting spend effects apply in CODE, by row id — not as a data encoding

- **Date:** 2026-07-29
- **Status:** accepted

## Context

F-56 crafting v1 ships two registries read from the printed book: six melee templates and 29 spend
rows (20 improvements the crafter buys with Advantage/Triumph, 9 flaws the GM imposes with
Threat/Despair). Each row's `effect` is prose — *"Increase the weapon's damage by 1"*, *"Reduce
encumbrance by 1, to a minimum of 1"*, *"gains Pierce 1, or increases its Pierce quality by 1"*.

Nothing in the app can execute prose. **23 of the 29 rows mutate the crafted item**; the other 6 touch
the character, the session, the crafter's tools, or the template. Something had to turn a chosen row
into an actual change.

The obvious move is a machine-readable effect encoding in the registry — a typed `{op, field, value,
cap}` object per row. The implementer deliberately did NOT invent one and raised it at the gate
instead, because §4.4's field list had been fixed as an R-SY4 durable contract *hours earlier* and
adding an unruled field to a fresh contract is the exact move the halt discipline exists to prevent.

## Decision

**For v1, spend effects apply in code, by row id, at ONE application point** —
`applyCraftingSpend` in `lib/shared/crafting.js`, over a closed map keyed by row id with a per-entry
cite. No effect encoding enters registry data.

The map is closed and loud: an unknown row id **throws** (crafting ids come from the closed spend
registry, so a miss is a code/data divergence). A validator arm compares the map's keys against the
registry's row ids as sets, both directions, so the two cannot drift silently.

Rows the app cannot yet execute are **enumerated, not skipped** — `applyCraftingSpend` returns
`{profile, unapplied[]}` with a reason per row, and the surface shows the prose and records the pick.

**R-CVS-1 sets the revisit point:** when a SECOND category's worksheet closes, the accumulated code map
is the census input for deciding a typed encoding, as its own R-SY4 halt. This decision is scaffolding
for that call, not a way to avoid it.

## Alternatives considered

**A typed effect object in the registry (the obvious answer) — rejected for now.** It is itself a
durable contract, and we have exactly ONE category's evidence of what effects must express. Melee alone
already targets five different things (the item, the character, the session, the tools, the template),
and five categories are unread. The architect's phrasing: *"A DSL designed from this sample would be
wrong by category three"* — and F-56 had just lived that failure, when §4.4's `cost {symbol, count}`
did not survive contact with the first real data and needed an amendment within hours.

**Parsing the effect prose — rejected outright.** The registry deliberately carries our own plain
mechanical text (R-CVS-2, born clean), not the book's. Parsing it would make that prose a load-bearing
API and re-couple wording to behaviour, which is the coupling F-EDS-6 spent a programme removing.

**Reusing the talent-effects pipeline — investigated and disqualified.** `derivedBonusesFromTalents`
sums `{bonus, amount}` pairs into a fixed seven-key CHARACTER-stat object. Three independent
mismatches: wrong target (character stats vs an item profile), wrong value shape (it cannot express
"or increment, to a maximum of 5" or "to a minimum of 1"), wrong operation (an idempotent accumulator
recomputed from a whole owned list, vs sequential order-sensitive spends where Integral Attachment adds
a hard point and then consumes one). What transferred was the *pattern*, not the module.

## Consequences

**Accepted cost, stated at the gate rather than discovered later:** category 2's spend rows will need
code additions for their ids. That is a bounded dent in "categories 2..N are data laps" (R-CRAFT-1),
taken deliberately.

**What this buys:** the shape of the eventual encoding gets designed from two categories' evidence
instead of one, and v1 ships without a contract we would have had to amend twice.

**A future session must keep in mind:**
- The code map and the registry are two halves of one thing. `L1.craftsp`'s closure arm is what keeps
  them honest — do not weaken it.
- `unapplied[]` is not a TODO list. Some rows are unapplied because the app models no tools and no item
  damage state; those are v2 *models*, not v1 gaps.
- The 18/11 applied/unapplied partition is load-bearing beyond application: it is also the partition
  that decides which rows survive a FAILED craft (RAW scopes improvements to "the item", and on a
  failure there is no item — so exactly the item-independent rows remain spendable, EotE p.23).
- Effect *application* being code does not make effect *legality* code. R-CA-1 keeps legality at the
  display; B-56 was the cost of forgetting that the display then actually has to enforce it.
