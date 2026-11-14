# 0033. A proof rule's REQUIREMENT survives a source change; its MECHANISM does not — re-instrument it against the failure the new source can actually have

- **Date:** 2026-08-12
- **Status:** accepted

## Context

The CSG v6 art import lifted one illustration off each PDF entry page. Its safety rule, **W3**, was
*"the page's own decoded text must begin with the entry name"*, and its stated basis was explicit:
a one-page drift *"would silently file every following portrait under its neighbour."* That is a
failure mode of **position** — the importer walks pages in order, so an off-by-one poisons every
record after it, silently and permanently.

The v7 art is not in a PDF. It is a directory of 409 PNG files named after the species, already cut
out on transparency. The ruling that ordered the v7 landing nonetheless carried W3 forward as an
unamendable CONTRACT item, and reinforced it: the one docx-sourced image was confined to a disclosed
one-off precisely so that filename-only evidence *"stays a one-off"* and W3 stays *"meaningful for the
other 114."*

**W3 cannot run on a directory of named files.** There is no page to decode. The implementer halted
and filed a brief rather than choose between the rule and the facts.

Two readings were available and both are wrong in the same way. Treat all 111 as the same degraded
filename-only class — which converts a carefully-drawn exception into the norm one ruling later. Or
force a page-shaped proof onto a source that has no pages — which manufactures ceremony that proves
nothing about the actual risk.

## Decision

**When a source changes shape, carry forward what the proof rule was PROTECTING AGAINST, not the
procedure it used. Enumerate the new source's failure modes and instrument those.**

Applied here: a filename→name binding has **no ordinal**, so it cannot drift. The failure W3 exists
to catch is not available to this source. What a nominal route *can* do is **collide**, and collisions
are measurable exactly, with no threshold:

- two species claiming one source file — **0**
- two species landing on one output filename — **0**
- a species' normalised key hitting more than one distinct source stem — **1**, resolved by a stated
  precedence rule rather than a per-species pick
- deliberately misspelled names reaching anything — **0 of 5**

This proves *more* than W3 did, and two of the four properties are global (they are statements about
the whole set; W3 was only ever a statement about one item at a time).

**Second half of the decision, and the part with teeth: an instrument with a known false negative is
EVIDENCE, never a gate.** An independent corroboration was built — does each image appear on the v7
PDF page whose own text names that species, more than on its neighbours' pages? It scores 110 of 111
correct, median margin 0.427. The 111th, `Ab'Ugartte`, is **correctly filed**, confirmed by rendering
it: our file and its own-page fragment are the same pink-robed figure, and the higher-scoring
"neighbour" is a bearded Abednedo carrying a staff. Colour at higher resolution did not fix it.

So it ships as **complete published evidence with its limit stated in the same breath** — all 111
rows, the loser named and rendered — and explicitly **not** as a pass/fail gate.

## Alternatives considered

- **Filename evidence for all 112, disclosed as one degraded class.** Rejected: it discards proof
  that is actually available, and it dissolves the reasoning that made the docx one-off a one-off.
- **Make the page-correspondence check binding.** Rejected on its own measurement. It has a known
  false negative on a verified-correct image and a soft tail (margins to 0.058 against a 0.427
  median). Making it a gate would either refuse a correct portrait or invite tuning the threshold
  until it passed — and tuning an instrument until it returns the answer you wanted is the exact
  failure this cluster spent five rulings catching.
- **Extract from the v7 PDF so W3 runs literally.** Rejected on measurement: its entry pages carry
  25–30 image fragments each, so "the one image on the page" no longer identifies anything — the
  identification problem returns unsolved — and the page copy is a flattened JPEG where the pack file
  is pre-cut RGBA at higher fidelity. Strictly worse on both quality and proof.

## Consequences

**A convenience rule may be relaxed by measurement; a proof rule may not — but a proof rule may be
RE-INSTRUMENTED.** That distinction is the whole decision. W1 (name matching) was earlier relaxed
because its cost/benefit moved. W3 was not relaxed: its requirement was satisfied by a stronger
mechanism chosen for the new source's actual failure modes.

**The same shape recurred in the pipeline half of the same lap**, which is evidence this generalises
rather than a one-off: the background-knockout step was also carried forward as an unamendable
contract, and applied literally to already-cut-out sources it *destroys* them — 74–98% canvas opacity,
a green slab behind Sith — violating a sibling contract in the same ruling. The resolution was
identical in form: keep what the step was for (surface parity, produced by the 600×1000
fit-and-centre), and select the step by a **computed predicate** — does the source's border ring carry
transparency? — which picked out exactly the two non-pack sources without naming any species.

**A contract cannot require what a sibling contract forbids.** When a ruling demands both, the
implementer must halt rather than pick one. That halt is what produced this decision, and the
architect's ruling on it filed an erratum against its own parent — the parent's §2.5 had already
*named the PNG source files*, so it contained the disproof of its own premise.

**Cost:** one lap paused for a brief and a ruling before any file landed. That is the intended price.
The alternative was discovering a mis-instrumented proof after 112 images were load-bearing.

**Related:** [0031](0031-a-green-count-is-not-a-delta.md) — the same instinct about instruments:
match the measurement to the question, and state what it cannot show.
[0032](0032-a-derived-binding-is-frozen-once-made.md) — the id-keyed portrait binding this lap
depends on, and which made the filename an implementation detail (so two path-character species names
became landable instead of refused).
