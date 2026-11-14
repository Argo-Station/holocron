# 0044. A second band consumes LIFTED objects, never its own copy — and the lift is proved by parity output that does not move

- **Date:** 2026-09-03
- **Status:** accepted
- **Renumbered:** filed as 0043, renumbered to 0044 under `species-phone-band` R-SPBG-A2-1 — `commercial` had committed a different 0043 first and merged history wins. Second ID collision of 2026-09-03 (B-378 was the first); both had the same cause, which the BOARD's ID COLLISIONS note records.

## Context

The creator's visual revision transplants each step's screen from the lab board, and the board draws
most steps TWICE — a wide arrangement and a 390 phone one. The two are different trees: different
section order, different wrappers, and objects the other band has no use for. What they are NOT is
different CONTENT. The phone's rail is the wide sheet's rail; its ledger table is the same six rows;
its ability plates are the same plates.

Building the phone band therefore had two available shapes. Write the phone's markup fresh from its
fixture — fast, self-contained, and each band then owns its own spelling of the same objects. Or lift
the objects the wide band already emits into shared builders FIRST, and let the phone compose them.

This decision was forced by evidence rather than taste. `R-SPB-9` required the phone SHELL to be one
shared function; it did not speak to the objects INSIDE the sheet, and the inner objects are where
the content lives. Meanwhile B-372 was open on the ledger's free-skill row: the board draws
`<span class="hp-sep"> · </span>` between a grant and its rank limit, and the app emitted `<br>`,
which names no board object.

## Decision

**Before a second band's consumer is written, the objects it will draw are lifted out of the first
band's component into shared builders. The second consumer is then a COMPOSITION — arrangement and
order only. Nothing an existing band already emits is re-authored for a new band.**

**A lift is proved by measurement, not by reading the diff: the parity sweep's output before and
after must be identical.** Not "the tallies match" — the whole report, every frame, every divergence
point, every object count. A lift that moves any of them is not a lift.

Applied here in two steps, both proved that way:
- `FCPhoneShell` — sheet, body, runhead, step wave, rule, status container, act footer.
- `fcSpeciesRailPlate` / `fcSpeciesLedgerTable` / `fcSpeciesAbilityPlates` — the entry's inner objects.

## Alternatives considered

**Write the phone markup fresh from its fixture.** Rejected, and B-372 is the reason it can be
rejected on evidence rather than principle. The fix for that row was one line in
`fcSpeciesLedgerTable` AFTER the extraction, and it closed the defect at **every** width at once:
`board_species_1920` and `board_species_1366` each went 1 PASS/1 FAIL to 2 PASS/0 FAIL, and the phone
ENTRY frame reached zero divergence, from the same edit. Written fresh, the phone copy would have
been authored from the same misreading and carried the same `<br>` — and B-372 would have closed on
the desktop and stayed open, unnoticed, at 390. That is precisely R-SPB-7's "fixed once for both",
and it is only true because the lift came first.

**Lift lazily — extract an object the first time both bands need to change it.** Rejected: the moment
both bands need the change is the moment you have already written the second copy, and the lazy path
is indistinguishable from the fresh-markup path until a defect arrives to tell them apart.

**Prove the lift by review rather than by re-running parity.** Rejected. A pure move is exactly the
change a diff makes look obvious and a renderer can still alter — indentation, a dropped attribute, a
fragment that adds a node. The byte-identical report is cheap and it is the only thing that actually
excludes those.

## Consequences

- A band's component is arrangement. If it contains markup that names a board object, that markup is
  in the wrong file.
- A builder gains callers, and **a builder with two callers cannot inherit one caller's
  preconditions**. `fcSpeciesLedgerTable` read `sp.special_abilities` bare — safe under the wide
  sheet's guard, and a white screen at 390 on the phone's first render, which is a state that guard
  never covered. Lifting an object means auditing what it assumed about being called.
- The parity sweep becomes the lift's instrument as well as the screen's, so it must be run on
  refactors that "cannot change anything" — which is when it is most tempting to skip.
- The cost is real and is accepted: two extra commits before any new screen appears, and a diff that
  reads as churn. The B-372 result is what that buys.
- This generalises to every remaining phone band in the programme (career, specialization, game line,
  mechanic, and the rest of the walk). Each of them draws objects the wide band already emits.
