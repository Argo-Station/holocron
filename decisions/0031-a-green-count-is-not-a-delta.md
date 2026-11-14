# 0031. A green count is not a delta: measure a change against ITSELF, on one frozen artefact

- **Date:** 2026-08-11
- **Status:** accepted

## Context

The smoke-suite latency conversion changed a helper that 63 suites and 268 call sites depend on, so
the ruling asked for the whole browser estate to be re-run. The obvious reading of "re-run the
estate" is: run it, count the greens, and if the number looks healthy the change is safe.

That reading does not work here, and the reason generalises. **The estate is not all-green and never
has been.** The nightly battery's own ledger records 44 non-zero exits and 2 timeouts out of 185.
Against a population that already fails, an absolute count cannot distinguish a red the change
*caused* from a red that was *already there* — and a single run of 166/184 is equally consistent with
"nothing broke" and "one thing broke while another was already broken".

Two further forces made this sharper:

- **The artefact was moving.** A concurrent lap rebuilt `player/app.js` mid-measurement, so an
  earlier attempt's numbers straddled two different builds and had to be discarded rather than
  reported.
- **A stale server was still listening.** The previous attempt's `serve.py` held the port with its
  working directory on a deleted worktree, answering with zero bytes while its `/__tree` probe still
  reported a plausible tree. "Is something listening" is not "is the right thing being served".

## Decision

**A change to shared test infrastructure is measured as a DELTA: two arms, before and after, run
against ONE artefact that is frozen and verified identical between them.** The verdict is the set of
suites whose result CHANGED — regressions and recoveries — not the count of suites that pass.

Three parts, all load-bearing:

1. **Freeze the artefact and prove it.** Run from a detached worktree pinned at a named commit, and
   verify the served bundle's hash *between every stage*, aborting if it moves. Prefer a pin that is
   **re-derivable** — rebuilt from source to a byte-identical hash — over one that is merely asserted.
2. **Freeze the change too.** The "after" arm installs the diff from a **snapshot taken before the
   run began**, never live from the working tree, because the second arm starts hours after the
   first and anything editing the tree in between silently swaps what is under measurement.
3. **Report the pre-existing failures as CONTEXT, explicitly labelled as not the result.** They are
   the reason the delta exists; presenting them as the outcome invites exactly the misreading this
   decision exists to prevent.

## Alternatives considered

- **Run the estate once and compare to the nightly battery's ledger.** Rejected: the nightly runs a
  different tree with a different runner. Two numbers from two worlds are not a comparison, and the
  difference would be attributed to the diff by default.
- **Run only the suites that touch the changed helper.** Rejected: it assumes you already know the
  blast radius, which is the thing the estate is being run to establish. It also cannot see a suite
  that breaks for a reason the change did not anticipate.
- **Accept a bare green count and eyeball the red list.** Rejected on cost, not principle: 184 suites
  is past the size where a human comparison is reliable, and the failure mode is silent agreement.

## Consequences

**It costs twice.** Two arms of 184 suites is ~3.2 hours of wall clock where one is ~1.6. That is the
price of an answer that means something, and it is affordable because it is unattended — but a lap
that budgets for one arm will discover this late.

**It found something a single arm could not have.** The delta surfaced one *recovery*:
`smoke_creator_as9` went from `exit 124` to `exit 0`, because it had been exceeding the runner's
300s per-suite cap at 628s and now finishes at 258s. That suite has been red in the real nightly
battery for at least two nights for this reason. A green-count reading would have recorded 166/184
and said nothing; the delta named the suite and the cause.

**The per-suite timeout is part of the instrument and must be stated.** `run_smokes.py` calls
`subprocess.run` with no timeout, so one hung suite eats an unattended night. The estate runner used
here caps each suite at 300s to match the nightly battery — which is also *why* the recovery is
visible, since the cap is what AS-9 was failing. A different cap is a different instrument and would
give a different answer.

**Scope, so this is not over-applied:** this is for changes to SHARED test infrastructure measured
against a large suite population with pre-existing failures. A change to one suite is verified by
running that suite. This is not a new default for ordinary work.

**Related:** [0028](0028-a-derived-artefact-must-be-rebuildable-from-tracked-source.md) — the same
instinct one layer down: an artefact you cannot rebuild is one you cannot verify.
[0030](0030-a-wait-condition-must-be-able-to-observe-the-transition-it-gates.md) came out of the same
lap and governs the conversion itself; this one governs how the conversion was *measured*.
