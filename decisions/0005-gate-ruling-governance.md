# 0005. Gate→ruling governance: file-based two-seat workflow with an architect charter

- **Date:** 2026-06-09
- **Status:** accepted

**Plain summary (for Jason):** this records the new way of working — the builder writes a gate
report for every finished piece, a separate architect session verifies the work itself and writes
a ruling, and nothing merges without that ruling on file. You relay by pointing each side at the
other's newest file instead of copy-pasting walls of text.

## Context
The gate rhythm (verbatim evidence → architect sign-off → commit) lived in chat history and
machine-local auto-memory; the architect was an external chat relayed by hand. An agent audit
found the rhythm had no repo encoding: format fidelity rode on session memory, durable truth sat
in auto-memory that doesn't travel, one stale agent held a live autonomous-push grant, and model
authority was split across three sources.

## Decision
1. **Artifacts, not chat:** gates in `Docs/gates/` (HANDOFF_FORMAT: plain summary + one fenced
   architect block), rulings in `Docs/rulings/` (same name), commit/push at ruling sign-off.
   Nothing merges without a ruling file. Protocol: `Docs/gates/README.md`.
2. **The architect is a seat, not a person or agent:** `Docs/ARCHITECT_CHARTER.md` + the
   `/architect-boot` command make any fresh session the architect — read-everything,
   write-only-rulings, verify-independently (grep/diff/suites/oracle), plain-summary-first,
   amendments only via its own rulings (§11).
3. **Durable truth lives in repo files, never auto-memory:** decide-vs-halt lanes →
   HANDOFF_FORMAT.md; service ops → OPERATIONS.md; workstreams/branch-rule/model table →
   CLAUDE.md; migrated memories pruned.
4. **ONE model authority:** tracked `.claude/settings.json` (model + effortLevel) + tracked agent
   frontmatter, versioned together; allocation by error cost × distance-downstream (architect
   max-effort, implementer high, instrument agents sonnet-class).
5. **Standing rule:** every human-openable artifact leads with a plain-language summary.

## Alternatives considered
- Agent Teams as transport now — deferred (Phase 3) until the file protocol survives ≥1 full
  cluster; files first, automation second.
- Architect as a spawnable subagent — rejected: the seat reviews the implementer's work, so it
  must be a session the implementer cannot puppet.
- Keeping the audit supervisor live — rejected: its scoped autonomous-push grant was the only
  live one in the repo; archived to `Docs/audit_workflows/` with a scope banner.

## Consequences
Proven in one day: the seat's inaugural ruling falsified a gate claim (the `effortLevel` settings
key exists), the charter's oracle-placement rule caught a real OCR misread (Warde's Foresight,
U-CB4) before anything shipped, and the charbuild-3a lap ran recon→gate→ruling→build→gate→ruling
end-to-end. Costs: two seats to keep honest, ledger files to maintain, and Jason as the relay
until Phase 3.

## Refs
`Docs/rulings/team-restructure-phase0-1.md` (inaugural ruling), `Docs/gates/README.md`,
`Docs/ARCHITECT_CHARTER.md`, CLAUDE.md §Workstreams/§Gate rhythm/§Model authority.

---

## Amendment 1 — spawned-seat transport formalized (2026-06-10, Jason's directive)

> **⚠️ SPAWN TRANSPORT SUPERSEDED (2026-06-22, R-A05R1)** by the no-cross-spawn bright line
> (ruling `Docs/rulings/adr0005-amendment1-reconciliation.md`; rulings `seat-handoff-discipline`
> R-SHD1/SHD3). The *transport* this amendment formalized — the implementer spawning an architect/judge
> seat to render a ruling — is **RETIRED**. The Jason-run `/architect-boot` separate-session relay (this
> amendment's own "gold standard", point 6) is now the **only** ruling-delivery mode. Amendment 1's
> **principles STAND, seat-agnostic**: no-commit (a reviewer writes only its ruling; commits belong to
> the implementer under supervisor discipline), verifiability (citation-bearing rulings re-checked by the
> seat's own runs/reads), and disclosure (the arrangement stated on the ruling's face). Read points 1–6
> below as the historical transport, not current policy. (Read-only subagents — smoke-runner, Explore,
> rules-oracle, research — are untouched; the bright line is about cross-role spawning, not all delegation.)

**Plain summary (for Jason):** the original rule said the reviewer must be a separate session
you open yourself, relayed by hand; in practice you've been telling the builder session to
launch the reviewer directly, under a recorded exception, and it has worked — including
catching the builder's own mistakes five gates running. This amendment makes that mode
official, with its guardrails written down — and adds the one you asked for: every time the
builder launches a reviewer, it shows you the exact launch instructions it used, so you can
see for yourself that it passed only file pointers and no conclusions.

This decision originally REJECTED the architect as a spawnable subagent ("the seat reviews
the implementer's work, so it must be a session the implementer cannot puppet"). Practice
since (the per-instance caveat of `Docs/rulings/charbuild-3b-recon.md` §5, exercised on five
ruled gates) has shown the spawned transport workable WHEN fenced — and shown the risk is
real (the inaugural spawned seat committed/pushed without authority and misreported it;
recorded in `7cd8276`). The fence, now standing rather than per-instance:

1. **Jason's explicit instruction triggers every spawn.** The implementer never launches a
   seat on its own initiative. "Send the ruling" / "get approval" per gate suffices.
2. **Pointer-only handoff, SURFACED VERBATIM.** The spawn prompt may carry file pointers,
   the boot sequence, and verification expectations — never conclusions, leans, or claims.
   The implementer surfaces the exact prompt text to Jason every time it spawns a seat (in
   the message reporting the spawn), so the pointer-only property is inspectable, not
   trusted.
3. **Mandatory disclosure.** Every spawned-seat ruling states the arrangement on its face.
4. **No-commit rule.** The seat writes ONLY its ruling file; commits/pushes belong to the
   implementer session under supervisor discipline. (The `7cd8276` incident is the standing
   reason.)
5. **Verifiability over trust.** The seat re-establishes verdict-bearing claims with its own
   runs/reads and writes citation-bearing rulings — anyone (incl. a genuinely separate
   session later) can re-check every number from the ruling file alone.
6. **Separate-session relay remains available and remains the gold standard** — Jason may
   run any gate through a fresh session of his own (`/architect-boot`) at any time, and is
   encouraged to for the highest-stakes calls (production merges, governance changes).

Supersedes: the "Architect as a spawnable subagent — rejected" alternative above, to the
extent of this fence; the rejection's REASONING stands and is why the fence exists.

## Amendment 2 — commit cadence + the no-cross-spawn bright line (2026-06-22, Jason's directive)

Two governance rulings this session amend the team protocol (riders R-PBD2, R-SHD3; landed by the
implementer per the handoff channel):

**A. Commit cadence — commit always, push in batches** (ruling `push-batching-discipline`, R-PBD2).
A COMMIT is the default unit of progress: local, free, reversible — commit at every gate sign-off,
ruling, and checkpoint. A PUSH is a deliberate DEPLOY (`commercial` push == Cloudflare build + live)
and happens ONLY for (1) a verified user-facing change wanted live now, (2) a prod-down hotfix (push
immediately — emergencies don't batch), or (3) a finished batch. Docs / rulings / gates / STATUS
**never push on their own** — they ride the next code deploy. Pushing is a thing Jason calls (or a
hotfix forces), never an agent reflex. Verification rigor is unchanged (a batch push still gets its
prod_check). Lives in `CLAUDE.md` "Gate rhythm & branch rule".

**B. Two-seat bright line — neither seat spawns the other** (ruling `seat-handoff-discipline`, R-SHD3).
The architect and implementer are separate sessions that communicate ONLY through gate files
(implementer → architect) and ruling files (architect → implementer), with **Jason as the carrier**.
The architect may spawn agents ONLY for read-only fact-finding it summarizes for Jason; it MUST NOT
spawn anything that edits product code, commits, merges, or deploys. The implementer builds in its own
session and MUST NOT spawn a judge to rule its own work. The test: *does the spawned agent WRITE to the
product?* If yes → handoff (Jason carries it), not spawn. The committed rulings are the durable
architect→implementer worklist; `/preflight` surfaces open implementer riders (ruling
`handoff-channel-preflight-scan`, R-HCP1/HCP2). Lives in `CLAUDE.md` Workstreams/team section +
`Docs/HANDOFF_FORMAT.md`.

**Conflict with Amendment 1 — RESOLVED (2026-06-22).** Amendment 1 (2026-06-10) permitted the
*implementer to spawn an architect seat* to render a ruling; the R-SHD3 bright line ("seats never spawn
each other") forbids exactly that transport. The implementer routed the conflict via gate
`adr0005-amendment1-reconciliation`; the architect ruled it (`Docs/rulings/adr0005-amendment1-reconciliation.md`,
R-A05R1): **R-SHD3 SUPERSEDES Amendment 1's spawn transport in full** — the implementer no longer spawns an
architect/judge seat at all; the Jason-carried `/architect-boot` separate-session relay (Amendment 1's own
"gold standard") is the sole ruling-delivery mode. Amendment 1's no-commit / verifiability / disclosure
*principles* stand, seat-agnostic; only the spawn *transport* is retired (annotated in place at Amendment 1
above). R-A05R1 discharged here.
