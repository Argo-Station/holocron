# 0012. Build-autonomy grants exclude durable-contract halts (R-Y2-1)

- **Date:** 2026-07-11
- **Status:** accepted

## Context

Jason grants scoped "build autonomy" to let the implementer carry a feature through completion —
build, commit, deploy — without per-step approval (e.g. "build autonomy until Y2 is completed").
Separately, the two-seat discipline has an R-SY4-class rule: a **durable contract** (a persisted
schema / save shape, a vocabulary's semantics, a wire/URL contract) HALTS to the architect on paper
BEFORE the code that depends on it, because a contract error is cheap to fix before it is load-bearing
and expensive after.

These two collided on SHIPYARD Y2. Under the build-autonomy grant, the implementer self-signed the
R-SY4 vessel schema (the halt was inside the granted scope, so it was not surfaced pre-build). The
post-hoc architect review found one real defect: the critical-hit severity enum shipped THREE tiers
(Easy / Hard / Daunting) where RAW Table 7-9 has FOUR (Easy / **Average** / Hard / Daunting). No bad
data resulted (the missing tier was unrepresentable), and C-Y2a fixed it before merge — but the halt
existed precisely to catch this *before* the enum was load-bearing.

## Decision

A build-autonomy grant does **not** cover durable-contract halts (the R-SY4 class) unless the grant
**names that halt explicitly**. Schemas, save shapes, and vocabulary semantics still surface on paper
for the architect's sign-off before the dependent code, even while everything else in the granted
scope proceeds autonomously. Codified in `CLAUDE.md` (Design-authority section).

## Alternatives considered

- **Autonomy covers everything in scope (status quo that shipped the defect).** Rejected: it defeats
  the one check whose value is *pre-build* — a contract review after the contract is deployed is a
  patch lane, not a gate.
- **Retreat from build-autonomy grants entirely.** Rejected as an over-correction: everything else
  Y2 built under the grant survived review clean. The grant worked; only the durable-contract carve-out
  was missing. The narrow carve-out preserves the grant's value.

## Consequences

- Future grants that intend to include a schema/vocab decision must say so explicitly (e.g. "build
  autonomy including the save-shape").
- The implementer, under any grant, still prepares the durable-contract on paper (a schema doc like
  `Docs/SHIPYARD_Y2_SCHEMA.md`) and surfaces it for the architect before building the store/UI on it.
- Amends the autonomy/override mechanism in the global workflow discipline; sits alongside ADR 0005
  (gate→ruling governance). Origin ruling: `Docs/rulings/shipyard-y2.md` §5 (R-Y2-1).
