# 0022. Guided may ELECT a purchase for the player, but it always PAYS for it

- **Date:** 2026-07-30
- **Status:** accepted

## Context

The Guided Build's whole promise is that it decides for you: it picks a career and specialization from
a role, auto-buys two characteristic bumps and a starting talent, and hands you a curated loadout. Every
one of those elections was charged against the XP or credit budget — **except one.**

For an F&D career it also handed the character a starting Force power from a hardcoded map
(`Mystic → Heal/Harm`, `Guardian → Enhance`, …), and that one pick skipped the register entirely.
`xpRemaining` was computed as `pool − chars − talents` with no power term, so **a Guided Mystic
finished 5–20 XP richer than a Custom Mystic built identically.** The map carried a comment asserting
this was RAW ("F&D careers grant a basic Force power at creation").

Two things came out of checking that claim during R1, the lap that folds both creators' assemblies into
one function:

1. **The comment was false.** An F&D career confers a Force **rating** of 1 (Force and Destiny Core
   Rulebook p.282 — which the app cites correctly elsewhere). Powers are a **purchase**: a new
   character starts with no Force powers and buys them with starting XP (p.106; the purchase sits in
   the starting-XP table, p.105). The free grant
   contradicted printed text.
2. **A second copy of the map lived in the dev test-bed**, and R1's contract ordered both "folded in"
   to one derivation — which would have carved an invented mechanic into the one function both
   creators read.

The question was not merely "is this cited" but "are we entitled to keep it at all", and it was
escalated rather than resolved inside a refactor (brief `r1-assembly-core-blockers`).

## Decision

**Guided keeps electing, and pays the printed price for everything it elects.**

- The career → power pairing **survives as editorial content**, in the same class as Guided's curated
  loadouts, sited beside the other QB static tables as `QB_FORCE_POWER_PICKS`. It is our choice, not a
  rule, and it is labelled as such.
- The pick is **seeded into the working character with its printed row-0 cost** before the shared
  assembly runs, so the one XP derivation charges for it beside the characteristics and the talent.
  A power whose registry record has no row-0 cost yields **no power at all** rather than a free one —
  a missing cost is a registry bug that already reports itself loudly.
- The false RAW comment is **deleted and replaced with both citations** (p.282 for the rating,
  p.105–106 for the purchase), so the next reader inherits the truth rather than the claim.
- The consequence is surfaced, not absorbed: **new** Guided F&D characters finish with 5–20 XP less
  than before. Existing saved characters are untouched.

Ruled at `r1-assembly-core-blockers` Q1 as option (e) — an option the brief had not listed.

## Alternatives considered

- **Keep the free grant and cite it.** Rejected: there is nothing to cite. It contradicts p.106.
- **Drop the grant; Guided characters buy powers like Custom's.** Faithful, but a Guided Force
  character would finish with no power and no step in which to have chosen one — it breaks the path's
  own promise to produce a playable character.
- **Give Guided a "pick your first power" step.** Faithful and complete, but that is a new surface and
  a concept call, not something a structural refactor gets to add.
- **Leave both maps where they were and collapse everything else.** The implementer's lean. Rejected
  because it would have left exactly the seam R1 exists to remove, and would have preserved an
  unpriced purchase indefinitely.

## Consequences

**Accepted:** two of the 52 reachable Guided combinations are now **overdrawn** — Wookiee/Mystic at
−10 XP and Wookiee/Sentinel at −5 — because the Wookiee starts from the lowest pool Guided offers (90).
Three more land at exactly 0. This is the direct cost of honest pricing and it was anticipated by the
ruling's own condition C-R1-1, which forbade both a silent clamp and a silently-negative newborn. The
remedy (which pick yields) is a **product question**, open at `Docs/briefs/r1-guided-xp-solvency.md`,
and `test/r1_guided_xp_solvency.cjs` is deliberately RED until it is answered.

**A future session must keep in mind:**

- **Do not restore the free power.** It is not a bug that Guided charges for it; that is this decision.
  If the overdraw needs fixing, fix what yields — the pick, the talent, a characteristic bump, or the
  species/role offering — never the pricing.
- **Do not "fix" the red matrix guard by clamping XP to zero.** A clamp hides the overdraw instead of
  resolving it, and C-R1-1 named that failure mode explicitly.
- **The pairing is editorial, so it may change freely** — a cheaper power for a tight career is a
  legitimate edit, and does not need a rules citation. What needs care is the *claim* attached to it:
  never re-describe an editorial pick as RAW.
- **The general rule this instantiates:** any surface that elects a purchase on the player's behalf
  registers that purchase. If it cannot afford it, that is a product question about the election, not
  a licence to make the purchase free.
