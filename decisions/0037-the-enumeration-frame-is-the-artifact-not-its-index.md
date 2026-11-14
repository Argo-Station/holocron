# 0037. The enumeration frame is the artifact, not its index

- **Date:** 2026-08-18
- **Status:** accepted

## Context

F-33a had to answer "what is in these two books?" We hold a searchable index of the corpus
(`Docs/swrpg_index.db`), so the obvious frame was that index: one row per page, already extracted,
already cleaned. The census walked it.

The index turned out to be lossy in two different ways at once, and only one of them announced
itself. **Loud:** half of each book had OCR'd to rotated-glyph garble, which is visible the moment
you read a page. **Silent:** the index simply had **no row at all** for three pages. A frame built
from rows cannot see a missing row — the census reported clean, full coverage of "144 pages" for a
146-page book and nothing anywhere said otherwise.

The gap surfaced only because the reviewing seat reconciled the ledger's page count against the
PDF's and asked about the difference. Chasing it found that one of the unread pages (`ships` p134)
held a real vehicle profile, the Golan I Space Defense Platform — a record the census had claimed,
by construction, could not exist. See ruling `f33a-gadgets-ships-census` §5 and its §7 erratum.

## Decision

**When enumerating a source, the frame is the source artifact's own extent — not any derived view
of it.** Concretely: iterate the PDF's page range, the directory's file list, the registry's record
set; then look up the derived view per item. A derived view (index, cache, manifest, extract) may be
consulted for its content, never trusted for its **membership**.

Corollary, and the part that makes it checkable: **where the derived view is missing an item, the
output must name it.** The F-33a ledger now prints which pages carried no index row, so the gap is a
visible line rather than an absence. An enumeration that silently substitutes what it *has* for what
*exists* is not a census; it is a census of the index.

## Alternatives considered

- **Walk the index, reconcile totals afterwards.** This is what happened, and it does eventually
  work — the mismatch was caught. But it was caught by a human noticing two numbers disagreed, one
  seat downstream, after the count had been published and ruled on. A frame that cannot be wrong
  about membership beats a frame that must be audited for it.
- **Repair the index first, then enumerate.** Correct in the long run and now scoped as F-77
  (`ingest-rotation-repair`), but it makes every consumer wait on another workstream's repair, and
  it does not generalise: the next lossy view will be a different one. The frame rule holds whether
  or not any particular index is healthy.
- **Treat the index as authoritative and call the difference a definition** ("covers and blanks
  excluded"). Tempting, cheap, and it was the first explanation reached for by both seats. It was
  false. A count that does not reconcile is a defect until someone shows it is a definition.

## Consequences

- Enumeration costs more: the artifact must be opened, and items the derived view lacks must be
  processed the slow way (F-33a re-OCRs those pages from the PDF).
- **Binding on the corpus work that follows** — F-33b, F-29's species audit, and any later sweep
  over `Docs/swrpg_index.db` inherit this: the books are the frame, the index is a lookup.
- This is the *design* half of a pair. The *review* half lives in the ruling's erratum — reconcile
  your counts, and do not explain a mismatch away in the comfortable direction. Either one alone
  would have caught this; the point of having both is that neither is always present.
- It does not say derived views are untrustworthy for content. The index remains the right tool for
  search and retrieval; R-F33A-7's separate caution about these two books' *content* is a different
  defect with a different fix.
