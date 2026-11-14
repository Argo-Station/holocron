# 0043. An instrument is re-pointed at the fix you just made, not only at its founding case

- **Date:** 2026-09-03
- **Status:** accepted

## Context

R-CPR-39 says an instrument built to find a CLASS is first pointed at the INSTANCE that defined the
class, and decision 0042 says that instance is EMBEDDED rather than looked up. Both govern the moment
an instrument is BUILT.

Neither covers the moment it is USED to justify a change. Three times in one lap, a fix that made the
product measurement better silently made the INSTRUMENT wrong, and in each case the instrument would
have gone on reporting confidently:

- `smoke_short_path`'s vacuous green was paired with its sighting. Correct — and it left both sides
  of the pair red, a state the runtime harness had no name for. It fell through to `EARNED`, "the
  negative is meaningful", which is the opposite of what a red says.
- Capturing that sighting moved the literal one line up, out of the check's condition. The harness's
  parser reads conditions, so the pair it had flagged **VOID sixty seconds earlier** became
  `UNMEASURED`.
- The replacement label was written across implicit string concatenation. The pattern requires the
  label's closing quote to be followed by the comma, so the check stopped matching at all and the
  same pair went `UNMEASURED` a second time, for a second reason.

None of the three produced an error. Each produced a plausible verdict about a suite the instrument
could no longer see properly, and each was found only by asking a question that nothing in the
process required: *what does this instrument now say about the change I just made?*

## Decision

**After a fix that an instrument motivated, re-run that instrument against the fix and require its
verdict to be the one the fix intends.** A fix that silences the instrument that found it is not
finished. The check is the same shape as the founding case and costs the same seconds; the difference
is that the founding case is aimed backwards at the class, and this is aimed forwards at the change.

Concretely: if an instrument reported X, and the fix is meant to move X to Y, the instrument must be
made to report Y. `UNMEASURED`, a vanished row, or an unchanged verdict are all failures of the fix,
not neutral outcomes — because they are indistinguishable from a fix that did nothing.

## Alternatives considered

- **Trust the suite's own tally.** It moved in the right direction all three times (53/56 → 52/56 was
  exactly the intended honest red), so the product signal was correct while the instrument was
  quietly blinded. A tally cannot report on the thing that reads it.
- **Add a self-test to each instrument.** The founding case already is one, and all three defects
  survived it: the embedded case kept passing, because it does not travel through the file the fix
  edited. A backwards-aimed check cannot see a forwards-aimed break.
- **Leave it to review.** Two of the three were invisible in the diff — a label rewrapped across two
  string literals, and a variable extracted one line up. Both read as tidying.

## Consequences

- One extra instrument run per instrument-motivated fix. It is cheap and it caught three defects in a
  single lap that no other check in the process would have.
- **A fix may legitimately require an instrument change in the same commit** — the `CONSISTENT-RED`
  state exists only because the fix created a condition the harness could not name. That is not scope
  creep; it is the fix completing.
- The three limits this found are written into the harness header rather than the commit log, so the
  next reader meets them where they bite.
- Sibling of 0042 and R-CPR-39, and deliberately narrower than both: they govern building an
  instrument, this governs spending one.
