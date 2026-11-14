# 0047. A page check reads the whole page, not its subject

- **Date:** 2026-09-05
- **Status:** accepted

## Context

`f102-sources-box-summary-and-attribution` A8 commissioned a FONTS leg for the sources-box mockup's
instrument: after `document.fonts.ready`, confirm every family the page uses is loaded, and check
the resolved face per column rather than only the declared size. The ruling named the columns
because the columns are the design; the mockup's frames are what Jason reviews.

Written that way — scoped to `.wf-in`, the frames — the leg reported **five faces, all embedded,
all drawing, no fallback, no synthetic**. It was green and it was wrong. Widening the same selector
to `body *` and changing nothing else turned up three live faults:

- the instrument's OWN report table asked Share Tech Mono for weight 700 on 18 header cells, and
  that family ships one weight, so the browser drew synthetic bold;
- the page heading asked Orbitron 700 when only 900 was embedded, so it drew a synthesised bold;
- `<code>` inherited the browser's generic `monospace` — an unembedded face on a page whose entire
  premise is that it carries its own type.

None of the three is in a frame. All three are on the page a reviewer opens, and two of them were
in furniture the instrument itself had emitted. The widened run also surfaced a stale **"v3"** in
the heading of what was by then a v5 page.

The generalisation is not about fonts. A page-level property — type, contrast, overflow, theme,
locale, print behaviour — is a property of the PAGE. Scoping its check to the artefact under review
measures the half you were already thinking about and certifies the half you were not, and when the
checker emits furniture of its own it is grading its own homework.

## Decision

**A check for a page-level property enumerates the whole document, and reports per-region rather
than filtering by region.** Where a region matters — "which column is this face in" — that is a
COLUMN on the report, never a filter on the query. Anything the check itself renders onto the page
is in scope on the same terms as the subject, with no exemption for being furniture.

Where a fault is legitimately expected outside the subject (a deliberate generic, a synthesised
weight that the shipped app also has), it is REPORTED with its state named — `synthetic`,
`FALLBACK` — rather than excluded from the query, so the reader sees it and the exclusion cannot
silently widen.

## Alternatives considered

- **Keep the leg scoped to the frames; check furniture by eye.** Rejected — the whole reason the
  leg exists is that this class of fault is invisible by eye: the declared size is honoured and only
  the face changes. Two of the three faults were emitted by the checker, so the reviewer most likely
  to look past them is the one who wrote it.
- **Scope to the frames and add a second, separate furniture check.** Rejected as the same mistake
  with more machinery: two scoped checks have two blind spots between them, and the boundary needs
  maintaining forever. One query over the document has none.
- **Exclude known-acceptable faces (the generic `monospace` in `<code>`) from the query.** Rejected
  — an exclusion list is invisible in the output, so it grows. Naming the state on the report keeps
  the fact on screen; the reader can weigh it and the count cannot quietly drift.
- **Treat it as specific to fonts and note it in the font entry.** Rejected: the same shape has
  already been paid here in a different currency (`scripts/board_frame_census.py`'s own truncation
  manufacturing a false absence, `Docs/OPERATIONS.md`), and it will be paid again by any page-level
  check that reasons about "the part I care about".

## Consequences

- The FONTS leg reads `body *`. It costs nothing measurable and it found three faults on its first
  widened run.
- A widened check will report faults in furniture that are not product defects. That is the intended
  cost: the report says what state each face is in, and a `synthetic` row is information, not noise.
  Two of the three found here were worth fixing anyway; the third was the shipped app's own
  behaviour and stayed, named.
- Related and NOT superseded: `0043-an-instrument-is-re-pointed-at-the-fix-you-just-made` (aim it at
  what you just changed) and R-CPR-39 (aim it at the instance that defined the class) are about
  WHERE a check is pointed. This is about HOW WIDE it looks once pointed — a check can satisfy both
  of those and still be scoped to a subject that excludes the fault.
- The instrument-first rule stands and is what made this visible: the leg existed before anyone
  looked at the page, so widening it was a one-line change rather than a re-review.
