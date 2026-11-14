# 0049. A shared renderer varies by GROUND through CSS, not through a flag at the call site

- **Date:** 2026-09-09
- **Status:** accepted

## Context

`glyphText`/`symbolSpan` is the ONE renderer for FFG `[XX]` glyph tokens, consumed by the creator,
the sheet, the dice surface, the holotable, the store, the yard and the vessel view. Ruling
`tree-cell-force-pip-fill` (R-FPF-1) made the FILL FAMILY — hollow for a Force die, half for a Force
pip — law for the PAPER ground only: the creator draws it now, every dark-ground surface keeps
today's pixels until B-498 rules the house style against a mockup Jason approves.

So one renderer had to produce two appearances, chosen by the ground it renders on, without
becoming two implementations (the no-compromise-mirror law) and without changing a pixel on five
approved surfaces (R-MU1). R-FPF-2 (ii) left the mechanism to the implementer, named two candidates,
and required only that the choice be reported.

Two facts decided it, both measured rather than assumed:

- **The call sites cannot separate the grounds.** `glyphs()` in `player/app.jsx` has 20 call sites
  spanning the creator AND the sheet. "Pass the option from the creator's wrapper" does not identify
  a ground, because the wrapper serves both.
- **An inline `style.color` cannot be neutralised by a stylesheet.** The lab's own generator writes
  the fill colours inline. Copying that technique would have made the appearance unreachable from
  CSS, so the dark surfaces would have inherited the paper ground's white-on-stroke marks.

## Decision

**The markup is universal; the GROUND decides the appearance, in CSS.**

1. `symbolSpan` emits the fill markup for the family on every surface, from ONE definition. The
   switch it does take is `prose` vs `pool` — `glyphText` opts in, `renderPool` does not — because
   that is a distinction the BOARD draws (135 filled marks in prose, 11 plain in the rating row),
   not a distinction between surfaces.
2. **The ink travels as a CSS custom property (`--sym-ink`), never as an inline `color`.** This is
   what keeps the appearance reachable from a stylesheet.
3. **The neutraliser lives in the one stylesheet every surface loads** — `lib/shared/tokens.css`,
   loaded by `player/`, `gm/` and `dice/`. It reads the ink back (`color: var(--sym-ink)`) and
   collapses the markup to a single visible glyph. That is the DEFAULT.
4. The paper ground overrides it in `lib/shared/paper.css`, scoped `[data-doc-ground="creator"]`.

## Alternatives considered

- **A `fill` option threaded from the paper-ground call sites.** Rejected on the measurement above:
  the creator's own wrapper also serves the sheet, so the flag would have to be decided at 20 call
  sites and would be wrong at any one that was missed — a silent, per-site failure mode. It also
  builds the split the no-compromise-mirror law dislikes into the CALL GRAPH, where it is invisible;
  and R-FPF-R2 says that if B-498 answers "everywhere", such a flag is deleted rather than built on.
- **Copying the lab's inline-style technique verbatim.** Rejected: it is precisely what makes the
  appearance un-neutralisable, and it would have changed five approved surfaces.
- **Emitting the fill markup only where the board draws it, by hardcoding the token list per
  surface.** Rejected as a second implementation by another name.

## Consequences

- The app's markup deliberately DIVERGES from the board's technique — colours in CSS, not inline —
  while the rendered result on the paper ground matches. Both parity layers are blind to it: they
  compare the NAMED skeleton and the named object's computed style, and the `<i>` children carry no
  board class. A future reader comparing our markup to the board's byte-for-byte will find this
  difference and should not "fix" it.
- **Off the paper ground the substitution must stay inert, and that is a measurable claim, so
  measure it.** Proven here on four grounds (player · dice · gm · store) by rendering the old and
  new markup side by side on the real served page: identical width, height, computed colour and
  stroke, and exactly ONE visible glyph box, with `dark` — deliberately outside the family — as the
  control. Re-run that probe if the base rule or the emitted markup changes.
- Any future per-ground appearance in a shared renderer should take this shape: universal markup,
  ink as a custom property, default neutraliser in `tokens.css`, ground override in the ground's own
  stylesheet. It is cheaper than threading state and it fails loudly (one stylesheet) rather than
  silently (one missed call site).
- If B-498 rules the family app-wide, the change is to DELETE the neutraliser in `tokens.css` — one
  rule, one place — not to unpick a flag from the call graph. That asymmetry is the point.
