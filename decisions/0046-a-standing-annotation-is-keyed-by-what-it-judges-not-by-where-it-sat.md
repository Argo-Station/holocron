# 0046. A standing annotation is keyed by what it judges, not by where it sat

_Renumbered from 0041 on 2026-09-03 (ruling `species-phone-band` A3). Two seats each took "the next number" the same day from a tree that did not yet hold the other's file; neither commit conflicted and the merge made the collision. This was the LATER of the pair, so it moved. Cited as 0046 from here on._

- **Date:** 2026-09-01
- **Status:** accepted

## Context

Several instruments built this session carry HAND-ADJUDICATED verdicts alongside a mechanical scan:
`scripts/census_sources_consumers.py` classifies each reader of a registry's `sources` (LOGIC /
DISPLAY / AGGREGATE / PASSTHROUGH), `scripts/census_vacuous_asserts.py` records which cannot-fail
assert shapes are legitimate, and `scripts/motivation_introduction_check.py` records the five
citations a human read inside their own TOC fence. In each case a person read something a scanner
cannot judge, and the judgement has to survive so a re-run does not re-ask a settled question.

The consumer census keyed those verdicts by `(file, line)`. That worked for exactly one lap. The
next lap fixed five sites in `player/app.jsx`, every line below them shifted, and NINE correctly
classified sites came back as `UNCLASSIFIED` — from an instrument written to watch that same file.

A standing check that goes stale on the first edit to its own subject is not standing. It re-asks
its question on every touch, the reader learns the output is mostly noise, and the one row that
genuinely needs a second look is lost in the fourteen that do not. That is how a check stops being
read, which is the same end-state as a check that cannot fail.

## Decision

**A hand-adjudicated verdict inside a standing instrument is keyed by the CONTENT it judges — the
normalised source text — never by a line number, an index, or an ordinal position.**

The corollary is the point, not a side effect: **the key must change exactly when the judgement
should be revisited.** A shifted line keeps its verdict because nothing about it changed. An EDITED
line loses its verdict and returns as `UNCLASSIFIED`, which is precisely when a human should look
again. Position keys fail both halves — they invalidate on irrelevant edits and, worse, would
silently carry a stale verdict onto whatever moved into that line number.

Two riders follow from the same principle:

- **Re-key by derivation, never by transcription.** When the consumer census was re-keyed, the new
  keys were generated from its own live output rather than hand-copied from the old table. Copying
  fifteen code fragments by hand is exactly the step that introduces one subtly-wrong key that then
  silently never matches — the failure B-331 had just been closed for, one file over.
- **A report's verdict line reads its own counts.** The census hard-coded "the LOGIC sites must land
  first"; they landed, and it kept saying so. A summary that cannot notice its subject changed is a
  smaller version of the same defect.

## Alternatives considered

**Key by line number (what was written first).** Simplest to produce and the obvious first choice —
the scanner already has the line number in hand. Rejected on measurement: it broke on the very next
edit, and its failure mode is noise, which is corrosive rather than loud.

**Re-run the adjudication every time.** Honest, and unaffordable. The consumer census took a read of
25 sites; the vacuous sweep took 23. Re-reading them on every lap guarantees they stop being read.

**Store verdicts in a sidecar keyed by an id in the source (a comment marker).** Robust, and it
requires editing the watched files to carry markers — which means the instrument mutates its own
subject, and a lap that reformats those files breaks it anyway.

**Fuzzy-match the line back to its verdict.** Rejected outright: a near-match carrying a verdict
across an edited line is the stale-verdict failure with extra steps, and it would be invisible.

## Consequences

- A re-run after a pure refactor is quiet, which is what makes the output worth reading.
- A genuinely edited site surfaces as `UNCLASSIFIED`, and the instruments treat that as a **STOP**
  rather than a default class — an unclassified consumer blocks the conversion that depends on it.
- Whitespace-only reformatting of a watched line WILL invalidate its verdict, because normalisation
  collapses runs of whitespace but not a rewrap. Accepted: a false re-ask is cheap, a false carry is
  not, and the asymmetry should always be resolved that way.
- These verdicts are records of a human read. They belong in the instrument, next to the scan that
  found the site, rather than in a gate that scrolls away — the gate says what was decided once, the
  instrument keeps it true.

_Recorded from `b336-logic-sites` and the R-BSS-2 sweep. No ruling records this; the rulings record
the findings those instruments produced, not how the instruments keep their judgements._
