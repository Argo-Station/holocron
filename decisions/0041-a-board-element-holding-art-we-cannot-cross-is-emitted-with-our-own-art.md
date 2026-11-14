# 0041. A board element holding art we cannot cross is EMITTED, carrying art we generate

- **Date:** 2026-09-01
- **Status:** accepted

## Context

The F-101 transplant makes each creator step emit the board's own DOM (R-TTP-1). Some board
elements hold **artwork the project cannot ship**: the game-line plates hold
`<img alt="… core rulebook cover">`, and the board's own CSS carries Jason's note that these are
"the title card, not the cover" — either way, FFG's artwork. The species plates hold per-species
washes under a separate, ruled provenance path.

This is a different question from the species backdrop washes (`sheet-lab-three-questions`), which
are algorithmic and cross under R-CBC-3. Cover and title-card art has no such path, and the
project's hardest standing line is about publisher artwork.

Three shapes were available and the choice is not obvious, because the instrument that would
normally arbitrate is blind to it.

## Decision

**Emit the element the board draws, and put art we OWN inside it.**

For the game line: `<span class="hp-line-plate"><img src={fcLinePlateArt(l)} alt=""></span>`, where
`fcLinePlateArt` builds an inline SVG gradient from the line's own accent colours — data the app has
shipped since B-108. Nothing is fetched, no asset crosses, and the board's tree is matched object
for object.

## Alternatives considered

- **Cross the art.** Refused: publisher artwork, and no provenance path exists for it. Jason's
  accepted-risk word covers the *washes*, which are a different asset class.
- **Drop the element.** Refused: it is a real DOM divergence, and the transplant's whole claim is
  that the render emits the board's tree.
- **Declare a `data-ruled-delta` on the plate.** Tried, and it is actively WRONG here — which is the
  part worth recording. The parity engine's exception excludes the marked node *and its subtree*
  from **the side that carries the attribute**, i.e. the APP. The board keeps its plate *and* its
  image. So declaring the delta made the two trees **less** alike, not more, and the divergence
  count went up. A ruled delta is for something the app draws that the board does not; it is not a
  way to excuse something the board draws that the app does not.

## Consequences

- Every remaining screen with an art plate takes this shape. The board's class travels; the image
  does not; the element is still emitted so the tree matches.
- **DOM parity cannot arbitrate this.** It compares named objects, and an `<img>` carries no
  `hp-*` class — so the substitution is invisible to it either way. What proved the delta approach
  wrong was the divergence COUNT rising, not a targeted assert. Related: R-GLG-2, where the same
  blindness hid two unclassed wrappers.
- The generated art must not introduce hardcoded colour. `test/ground_token_contract`'s surface
  ratchet caught exactly that in the first cut (1329 → 1331); every value now derives from the
  line's own record, so a palette change carries the plate with it.
- If a per-line asset ever clears provenance, it drops into the same `<img>` with no structural
  change — the slot is already correct.
