# 0018. Compliance strips are pipeline data; validation targets the shipped file

- **Date:** 2026-07-28
- **Status:** accepted

## Context

F-EDS-6 found verbatim FFG rulebook prose shipping inside our canonical registries. The first two
families (force_powers, careers) were remediated by editing `public/data/canonical/*.json` directly —
the shipped files — because that is what serves the site and the fix was urgent.

That inverted a standing pipeline invariant. The data flow was designed as *OggDude source →
`run_phase4` → `build/canonical/` (staging) → validated → promoted to `public/`*. Editing the shipped
end left staging as a time capsule of every description we had removed: `build/canonical/careers.json`
still held the 1,591-character verbatim Ace description while the shipped file held our 426-character
original, and `build/canonical/force_powers.json` still opened *"By opening his mind, a Force user can
commune with the world…"* — text stripped, deployed, and prod-verified as gone laps earlier.

Two consequences, both real, neither leaking: `build/canonical/` is gitignored and unserved, and no
build→public copy step exists. But **the schema arm validated staging**, so it reported "0 invalid"
while the shipped file carried a field its schema rejected; and **one re-run of the promotion step
would have silently undone the entire compliance programme.**

## Decision

**1. The generator learns the strips.** `data-sources/prose_replacements/<entity>.json` holds our
original text as tracked data, applied by `run_phase4` in `write_registry` as the last step before
emit. Regenerating staging now reproduces the shipped state, and a future OggDude re-ingest inherits
the compliance work rather than reverting it.

The file stores **only text we wrote**: whole-field `description` replacements, and sentence-0
`opener` swaps for force-power ability rows — never whole ability descriptions, because the other 282
sentences there are D3-class FFG mechanics the programme deliberately keeps.

**2. Validation targets the shipped file.** A new `L1cb.4` arm schema-validates
`public/data/canonical/` as primary; the staging arm stays as a pipeline-health check. What ships is
what must be valid.

**3. The promotion-path invariant is asserted where it protects, and reported where it doesn't.**
`test/prose_replacements_pipeline.cjs` asserts that staging and shipped agree on every *replaced*
field and that staging carries no removed prose. Whole-file `build ≡ public` is **not** asserted — see
Alternatives.

**4. Mechanism follows lineage.** Generator-owned families get replacements-file coverage.
Hand-curated files with no generator and no staging copy (`duty-types`, `obligation-types`,
`morality-pairs`, `morality-conflicts`) have no divergence to guard and are protected in place by
`narrative_prose.cjs` fingerprints. A family that changes lineage reopens the question.

**5. Promotion is per-family and deliberate, never wholesale** (R-EDS6-9).

## Alternatives considered

**Regenerate `public/` from `build/`.** Rejected: staging is the contaminated side. That direction is
precisely the undo we were trying to prevent, mechanised.

**Re-point validation and leave the generator ignorant.** Rejected: it treats the symptom and makes
the divergence permanent, leaving the promotion path a landmine forever.

**Assert whole-file `build ≡ public`,** as the ruling originally ordered. Rejected on measurement:
`public/` legitimately carries later-ingest and post-pass content the phase-4 generator does not
produce — species +7 ids and 38 field diffs (A&A ingest), talents +50 ids and 3 field diffs
(`apply_talent_desc_overrides`), specializations +9, careers 2 (later-ingest spec lists). A guard
failing on 38 legitimate differences is a guard someone switches off within a lap — the project's own
fixture-defect principle. The narrowing was surfaced with its evidence and accepted; the wider drift
is printed in the guard's header so a future reader sees numbers rather than inheriting a silent
narrowing.

**A permanently-red `L1cb.4`.** Switching the arm on surfaced 37 pre-existing violations. Blocking
promotion on debt the arm had just revealed would be disproportionate, and a red gate gets ignored.
Landed as a **ratchet** keyed on an ID set (not a count, so fixing one and adding one cannot hide),
then zeroed by the schema-teaching lap with the mechanism retained.

## Consequences

- **A re-ingest is now safe** and inherits the strips. This was the point.
- **Two files must move together** where a schema enum mirrors a vocabulary; `L1cb.5` machine-checks
  that pair rather than trusting a comment (R-ENUM-1).
- **Wholesale promotion is now a content-LOSS hazard** rather than a prose-restoration one: 66
  public-only ids would vanish. Hence per-family, drift-report-first (R-EDS6-9).
- **The replacements file is CONTENT** under the same laws as any authored prose — original,
  fingerprint-guarded, mechanics-voice — and is the single place C-2 voice upgrades land. One file to
  improve; both folders inherit (R-EDS6-7).
- **Future strips are born in the replacements file**, not applied as hand-edits. Specializations and
  species must follow this path.
- The schemas gained several properties describing features that had shipped without them. Each cites
  the ruling that shipped it, and `additionalProperties: false` was retained everywhere — that
  strictness is what surfaced the gap, and relaxing it would have hidden the next one.
