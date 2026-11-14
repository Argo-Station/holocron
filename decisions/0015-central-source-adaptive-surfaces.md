# 0015. Central-source pattern for adaptive (mobile + desktop) surfaces

- **Date:** 2026-07-20
- **Status:** accepted

## Context

The dc3 desktop cockpit was built as a `useLayoutMode()` branch inside the same
component as the mobile sheet, but its premium look (panel style, section head, the
wounds/strain color ramp) lived as *local* helpers inside the cockpit. Building the
rest of the sheet's tabs — and, beyond it, the many other modules that need a real
desktop layout — against that would mean each tab re-copying the idiom and the two
layouts drifting apart. Jason named the requirement directly: *"how would a
professional site create it so that either is from a central shared thing — we're
going to have to do this for many of the modules in the site."*

## Decision

One source, adaptive layout. For any surface that needs distinct mobile and desktop
layouts:

1. **Content is defined once.** Each region of the surface is a local block built a
   single time (`weaponsBlock`, `armorBlock`, `gearBlock`, …), not re-authored per
   layout.
2. **Layout composes the blocks.** The mobile return arranges the blocks as the
   stack (byte-identical to before the split); a `useLayoutMode() === 'desktop'`
   branch arranges the SAME blocks into the desktop grid. The mode flip is a
   restyle/recompose, never a fork of the content or a remount.
3. **The shared visual idiom is a primitive, not a copy.** Cross-surface look-and-feel
   (panels, section heads, the color ramp) lives in `lib/shared/ui.jsx` and is
   exported on `window.SWRPGUI` (`SHEET_PANEL`, `LedgerHead`, `sheetRamp`). Every
   surface composes those; a change to the idiom is one edit that reaches all of them
   (proven: the section-head → display+accent restyle flipped the cockpit, the mobile
   sheet, and every other section header at once).

Proven on the sheet: Step 0 extracted the cockpit's idiom into the shared primitives
(byte-identical), and LOADOUT was the first tab built entirely from this pattern.

## Alternatives considered

- **Two components (mobile sheet + desktop sheet).** Rejected — the failure mode the
  whole session was reacting to. Guarantees drift; every fix must be made twice; the
  "no-compromise / one shared module" law (`feedback_no_compromise_reimplementation`)
  forbids it.
- **Idiom as per-tab local helpers (the pre-Step-0 state).** Rejected — N near-copies
  that drift; a look change is N edits.
- **A cross-cutting responsive CSS framework.** Rejected as over-built (ponytail): the
  surfaces differ structurally (master-detail vs grid vs cockpit), not just in
  breakpoints; `useLayoutMode()` + shared primitives + per-surface composition is the
  smaller, already-installed answer.

## Consequences

- Extraction must be **byte-identical on the incumbent layout** — the mobile return
  cannot move a pixel when a surface is split. Verify with the existing mobile smoke
  before adding the desktop branch. (LOADOUT's first extraction attempt used
  line-range boundaries and broke on a nested-ternary / two-arg region; a
  bracket-matching split of the return's top-level args was the reliable tool.)
- New shared idiom goes in `window.SWRPGUI`, not in a consumer. A primitive with one
  caller today is still correct here — it's the seam future tabs compose against.
- This is the template for the remaining sheet tabs (ADVANCEMENT, FORCE, PROFILE,
  ABILITIES, VESSELS) and for porting other modules to desktop. Ruling
  `desktop-sheet-tabs-brief` sequences the sheet application.
- Content that is genuinely desktop- or mobile-only (not just laid out differently)
  is still a single conditional block inside the one source, never a second component.
