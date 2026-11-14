# 0050. A paper surface's measure lives on its content, not on its sheet

- **Date:** 2026-09-23
- **Status:** accepted

## Context

The paper revision transplants each surface from a lab board into the app. A lab board is a CONTACT
SHEET: it draws each page inside a frame so a reader can see where the page stops, and that frame is
painted in the board page's own near-black (`--pp-chrome`, named in `holocron.css` as *"Bezel, surround,
anything outside the page"*).

The landing carried that arrangement across literally. `.hp-sheet.ld` — the element that paints the
paper — was itself capped (`max-width` 1180 → 1340 → 1900 → 2500) and centred on a `.ld-surface` that
painted the bezel colour. On a real screen the bezel stops being an instrument's frame and becomes dead
space: measured at carry `d97b29b9`, **290px of near-black down each side at 1920**, and at 2560×1440 the
page was **1900×732 — 50.8% of the screen's height — with 354px above and below**.

Jason walked it and said: *"player landing doesn't take up the entire given screen."* Three shapes were
rendered for him (fill edge-to-edge · recolour the surround · raise the caps) and he chose none of them.
He answered: *"I approved the look, but the size is all wrong. Look to the creator and how that was
done."*

The creator, measured: its `div[data-doc-ground="creator"]` **and** its `.hp-sheet.hp-wide` are both the
full viewport with `max-width:none`. The paper is full-bleed and there is no surround at all. The measure
lives one level in, on `.hp-onecol`, centred inside the paper, and it RISES by band — `max-width:1500px`
(`paper.css`:982), `2000px` at `min-width:2300px` (:1606), `2900px` at `min-width:3000px` (:1614) — with
the type scaling alongside it.

## Decision

**A paper surface's sheet is never capped. The sheet fills its container in both axes; the reading
measure is carried by the content INSIDE it and steps up by band.**

Corollaries, in the order they bite:

1. **No surface paints a surround.** `[data-doc-ground]` already resolves
   `background: var(--doc-paper)` (`tokens.css`:451), so a surface that declares the ground and paints
   nothing IS paper. A bezel literal does not add a surround — it OVERRIDES the document's own ground and
   hides it.
2. **The measure is a custom property on the sheet, applied to the sheet's content children**, so the
   drawn tree is not restructured to introduce a wrapper where one does not already exist.
3. **The base rung is derived from the approved frame, never chosen.** It is whatever reproduces the
   approved content width at the band the frame was drawn at — for the landing, `1284px`, because the
   old page was 1340 wide *including* 28px of padding each side. A round number that merely looks right
   moves the approved arrangement.
4. **Above the base, reuse the creator's rungs** (2000 at 2300, 2900 at 3000) rather than inventing a
   ladder per surface, and let the surface's existing type ladder rise with them.
5. **A margin of paper is a margin. A margin of near-black was the old screen** (ruling
   `chrome-ground-retirement`, R-CGR-1 — Jason: *"the black ground is the old screen"*).

## Alternatives considered

- **Recolour the surround to paper, keep the caps.** One line, and it was this seat's recommendation.
  **It loses because it treats the symptom.** The cap stays on the sheet, so at 2560 it keeps 354px of
  surround top and bottom and merely makes it pale. Jason's objection was the SIZE, not the colour.
- **Raise the caps, keep the near-black.** Rendered as a `max(1340px, 93.06cqw)` expression holding the
  approved frame's own proportion. Fixes width, leaves the same vertical surround, and keeps a ground the
  R-CGR-1 ruling had already retired.
- **Add a wrapper element to carry the measure**, mirroring `.hp-onecol` exactly. Rejected as more
  invasive than the problem: the landing's `.ld` has four content children and a custom property reaches
  all of them without touching an approved tree.
- **Cap the sheet but let it grow vertically.** This is what the landing already did above 2300
  (`flex:0 1 auto` + `max-height:100%` + `overflow-y:hidden`) and it was a latent defect, not an option:
  a 1400px plant at 2560 was **clipped and lost with no scroller**.

## Consequences

- **Bands other than the one the frame was drawn at will gain room, and that is a walk item.** The
  landing's mid band went from 1124 to 1284 of content at 1366 (+160) and 1120 to 1138 at 1194 (+18).
  The arrangement is untouched and nothing re-wraps — 1284 clears the measured wrap floor of ~1264 — but
  a surface whose mid-band frames were approved owes Jason a look rather than an assurance.
- **The wrap floor becomes a real constraint on the base rung.** For the landing it is page 1320 →
  `colL` 584.0 / `colR` 654.0, measured by sweeping the page's own `max-width` at a fixed band (sweeping
  the viewport moves band, padding and type ladder at once and measures nothing). The approved 1340 sat
  only 20px above it, so the base can rise but must never fall.
- **Deleting a cap can delete a bug with it.** The landing's padding rungs (26/30/40/56px) had never
  executed — `.ld[data-fit="1"]` at (0,2,0) outranks `.ld` at (0,1,0) — and the un-bounded-page defect
  lived in the same block. Both died with the caps; neither needed a row of its own.
- **The bezel's token gap is closed by subtraction, not by naming.** `--pp-chrome` had no `--doc-*`
  equivalent *by design* — "every declared ground token names the PAGE, and the surround is the
  instrument's, not the document's" — and the transplant recorded that as an open naming question. There
  is nothing to name: a surface with no surround needs no token for one.
- **This applies to every surface still to come** — NPC library and the Yard — and to any future
  transplant off a lab board. A board draws a frame because a contact sheet needs one; an app has a
  screen instead.
