# 0025. Instruments match rendered text through ONE transform-aware matcher — never case-insensitively

- **Date:** 2026-08-05
- **Status:** accepted

## Context

CSS `text-transform` changes what `innerText` reports. A card whose DOM text is "Custom Build" and
whose stylesheet uppercases it returns "CUSTOM BUILD" from `innerText` — so a driver searching for
the author-cased string finds nothing, clicks nothing, and **keeps reporting numbers**. That is the
whole defect: it does not raise, it does not redden, it makes a suite measure a screen it never
reached.

**One rule broke eight instruments across six laps, and instance-repair failed every time.** B-43
diagnosed it correctly on the FIRST encounter — *"a styling change silently blinded the driver with
no product change behind it"* — and wrote the diagnosis into `smoke_3a`'s docstring, where nothing
else could inherit it. The same bug then found `smoke_ux_p1`, `smoke_landing_onboarding`,
`smoke_creator_boot_failure` (twice over: a repair fixed the wait and missed the clicker eight lines
above), `smoke_batch_b`, `smoke_yard_player`, and `smoke_tutorial_lap2`. The last two were **crashes**,
so those files reported nothing at all, and one of them had been hiding a failing assert behind its
crash — a suite that dies is indistinguishable from a suite that is short.

Eight private copies of the same helper had drifted apart on **five** axes — scope (button-only vs
any element), match mode (includes / startsWith / exact / regex), case handling, chrome exclusion,
and whether they walked up to a clickable ancestor — plus a fourth and fifth way of matching text
entirely (Playwright's `has_text` and `get_by_role(name=)`). Five instances of one rule is not bad
luck; it is a missing seam.

## Decision

**One matcher, `_MATCH_JS` in `scripts/smoke_lib.py`. Every instrument that matches rendered text
goes through it, and it is TRANSFORM-AWARE, never case-insensitive.**

Three legs, each independently necessary and each independently falsifiable:

1. **Rendered text** (`innerText`) — reflects `text-transform`; inserts breaks at block boundaries,
   so a needle spanning two blocks can match.
2. **Source text** (`textContent`) — immune to `text-transform`; concatenates without separators,
   which is why leg 1 is kept.
3. **The needle under the element's own transform** — for `exact`/`firstline`, where leg 2 has no
   line breaks to take a first line from. **Gated:** it fires only when the source text already
   carries the needle in exactly that casing.

**Modes are named, never flattened:** `includes` · `exact` · `startswith` · `firstline` · `regex`,
plus `scope='button'`. An unknown mode raises. Suites that need a non-default mode keep a one-line
adapter that names it, so the suite's own promise stays visible where it is used.

`text_rect()` is the locator half of the same seam, for instruments that MEASURE a text-identified
element rather than click it — the same defect class one step removed.

**Standing constraint (R-OTM-1):** a new or edited smoke that matches rendered text does it through
the shared matcher. A private `includes`/`startsWith` on `innerText` in new code is a gate-bounceable
defect.

## Alternatives considered

**Case-insensitive matching — REJECTED, and this is the part most likely to be re-proposed.** It is
the obvious fix and it has now defeated two seats: the rider that commissioned this work offered
"case-insensitive or transform-aware" as equivalents, and the implementer's opening recommendation
was case-insensitivity. **`smoke_lib` had already refused it, in writing, with the reason:**
*"loosening the global matcher to case-insensitive would quietly change how every other click in
every other suite resolves, to fix one screen."* That refusal was right. Two needles differing only
in case must still resolve differently, or every existing suite's resolution silently shifts.

**The refusal nearly failed anyway.** The first cut of the transform-aware matcher applied the
element's transform to the needle unconditionally — which made `'cUsToM bUiLd'` match "CUSTOM BUILD",
i.e. case-blindness reintroduced by the fix for case-blindness, under a comment claiming otherwise.
Its own new guard caught it. Hence leg 3's casing gate.

**Per-file repair (the status quo) — REJECTED by evidence.** Five repairs, five recurrences. The
knowledge existed and was correct from the first encounter; what was missing was a place to put it
where the next file would inherit it.

**Flattening the eight copies onto one behaviour — REJECTED.** They disagreed on five axes across 67
call sites. A single behaviour would have silently changed how those sites resolve, trading a known
bug for an unknown one.

## Consequences

- **A future session writing or editing a smoke must load this first.** Reaching for
  `(el.innerText||'').includes(needle)` is the defect, not a shortcut around it.
- **Case sensitivity is a promise, and it is guarded, not asserted.** `smoke_text_matcher` (17 legs)
  holds a leg that fails if the matcher ever becomes case-blind; four of five mutants bite, and the
  survivor is an equivalent mutant, disclosed rather than chased (R-OTM-3).
- **Attribute matching is out of scope and immune.** `placeholder`, `aria-label` and friends are not
  rendered text; `text-transform` cannot reach them. Do not "fix" those.
- **The class is retired for NEW code, not yet for old.** A census measured **253 exposed sites in 93
  files**, of which **155 in 62 files are drivers** (a miss is silent) and 139 are assertions (a miss
  is loud). Ruling `os1-one-text-matcher` §4 approved a sweep of **the 155 drivers only**, as its own
  scheduled lap, method mandated: per-file baseline BEFORE the edit, adapter naming the mode, re-run,
  **diff failing legs, not counts**. Tracked as **B-131**.
- **Diffing counts is not verification.** Two suites in this programme changed *which* legs failed
  while the count held steady. Compare failing legs.
- **A crash is not a failure (R-D3-2).** Two of the eight instances were crashes reporting nothing.
  Any sweep of this class must treat a non-zero exit with no score line as a dead file, not a pass.

## Origins (history, not restatement)

- Ruling `omnibus-sweep` — **R-OS-1** (commissioned the seam), **R-OS-2** (a guard's threshold).
- Ruling `os1-one-text-matcher` — ACCEPT; **R-OTM-1** (no new private text-matching), **R-OTM-2**
  (the recorded-refusal pattern promoted — a written-down refusal outlived two seats' contrary
  instincts and was right both times), **R-OTM-3** (equivalent-mutant disclosure standard).
- Gate `Docs/gates/os1-one-text-matcher.md` + Amendment 1.
- **B-43** (the first correct diagnosis, stranded in one docstring) · **B-106** (one home for the
  creator walk; the exact-first-line match that keeps "Human" off Corellian Human) · **B-125** ·
  **B-128** · **B-129/B-130** (guards re-pointed by measurement) · **B-131** (the residue).
