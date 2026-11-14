# 0013. Free career-skill ranks at creation are RAW PER LINE (FaD = 3), not universal 4

- **Date:** 2026-07-11
- **Status:** accepted

## Context

CR-RAW #4 (ruling `creator-raw-defects-scope` §3.4) reported that `careers.json` carries `free_ranks` values
of both **3 and 4** and framed it as a data bug: "RAW says four free career ranks universally… the data is
corrected." The census found the split is not random — all **7 Force and Destiny careers** (Consular,
Guardian, Mystic, Seeker, Sentinel, Warrior, + Jedi/Rise of the Separatists) carry 3; all 13 EotE/AoR
careers carry 4. A systematic pattern like that is a signal to verify RAW before "fixing," not after.

The rules-oracle, confirmed against the printed page (rendered from the PDF for visual verification), settled
it: **Force and Destiny careers have SIX career skills and the player chooses THREE** at creation (FaD Core
Rulebook **p.46**); EotE/AoR careers have EIGHT and choose FOUR. The count is structural — half the
career-skill list. Across all 20 careers, `free_ranks == len(career_skills) // 2` holds with **zero
violations**.

## Decision

**The `free_ranks` data is correct and MUST NOT be "fixed" to a universal 4.** The rule is per line, derived
from the career-skill list size:

| Line | Career skills | Free ranks at creation |
|---|---|---|
| EotE / AoR | 8 | 4 |
| FaD | 6 | 3 |

The invariant `free_ranks == career_skills // 2` is now a standing validator gate (`L1cb.fr` in
`validate_registries.py`). The real defect was the UI: the creator's skills-step subtitle hardcoded "Choose 4
skills" over a correct `free_ranks`-driven "OF 3 SELECTED" counter — now reads `free_ranks` dynamically so
header and counter agree per line.

The ruling's §3.4 anticipated this outcome ("a legitimate exception must be **cited** or the data is
corrected") — the exception is cited (FaD p.46), so the data stands.

## Alternatives considered

- **Correct all 7 FaD careers to 4** (the ruling's stated instinct). Rejected — it would have introduced a
  7-record bug against RAW. The "universal 4" premise came from the EotE Droid ability's "instead of the usual
  four," which is the EotE/AoR baseline; FaD has its own "usual three."
- **Hardcode 3 vs 4 by gameline in the UI.** Rejected — the data already carries `free_ranks` correctly; read
  it. No second source of truth.

## Consequences

- **Do not re-open this.** A future session that "notices" FaD careers are 3 and tries to normalize them to 4
  will trip `L1cb.fr` — that failure is by design; the data is right.
- The invariant ties `free_ranks` to `career_skills` size. If a career's skill list is ever edited, `free_ranks`
  must move with it (the validator enforces this).
- Verification of RAW counts now uses the source PDF page directly (rendered to scratch, never committed —
  fan-project posture), on top of the oracle — this correction is why. The oracle's page numbers are the
  corpus/PDF index; the durable cite is the PRINTED page (FaD p.46, EotE p.48), re-derived at the printed layer
  per R-CITE1 / R-EQW1.
- General principle reinforced: on a systematic-looking data "error," verify the whole class against RAW
  before correcting the visible few (the scope-systemic instinct — here it flipped the fix entirely).
