# 0010. Nav bars are contextual — they transform per surface, not just app-switch

- **Date:** 2026-07-08
- **Status:** accepted

## Context

The nav layer (top `SuiteBar`, per-app `BottomNav`) was designed as app-switching chrome: fixed tabs
that move you between screens (Player: Characters · Create · Library). Promoting the item store to a
top-level surface (`ITM-V1`) surfaced the question — should the bottom bar stay a global app-switcher
everywhere, or can a rich surface (the store, with WEAPONS/ARMOR/GEAR categories + a cart) re-purpose it?
Jason ruled on it directly (2026-07-08) while resolving the store's placement (`items-program-scope` §7c).
The earlier 3-icon-bar rulings assumed a static, app-switch-only bar; that premise no longer holds.

## Decision

**The nav bars are CONTEXTUAL.** Once inside a surface, the top and/or bottom bar MAY transform to serve
that surface's needs; they are NOT restricted to app-switching. The global bar restores on exit.

- Player global bar goes 3→4: **CHARACTERS · CREATE · STORE · LIBRARY** (`/player/store`) — which also makes
  the two apps rhyme (the GM bar already carries five tabs incl. STORE).
- Inside the store, the bottom bar BECOMES the store's bar (seat's composition, mockup-review-overridable):
  **WEAPONS · ARMOR · GEAR · ◈ HOLDS · COUNTER(n)** — category tabs + the two store destinations, cart badged;
  the top bar carries back-to-app + the SHOPPING-FOR chip. Exiting restores the global player bar.
- `NAVIGATION.md` documents bar STATES per surface from this point on (a "bar context" note where a screen
  re-purposes the bar).

## Alternatives considered

- **Static global bar + in-content sub-tabs for the store** (the store's categories live as `SubTabs` inside
  the content, bar stays app-switching). Rejected by Jason: for a hero, full-screen shopping surface the bar
  is prime real estate; a second row of in-content tabs above the grid wastes it and reads as less immersive.
- **A bespoke store chrome that hides the bar entirely** (like the creation wizards / dice cinematic focus
  mode). Rejected: the store isn't a linear focus flow — you want persistent category switching + the cart
  count always visible; the bar is the right home for those.

## Consequences

- Nav-bar smokes that assert icon count/composition must be re-anchored whenever a bar transforms (the
  Player global bar 3→4 lands in the ITM-V1 lap; the store's contextual bar is asserted in its own state).
- Tutorial coach-marks that anchor to bar items need a check when the bar's composition changes per surface.
- `NAVIGATION.md` gains a bar-context dimension — a screen's entry now may include "what the bar becomes."
- The no-trap rule still holds: a transformed bar must always offer an escape back to the app/global bar.
- Future rich surfaces (a GM equivalent, a future map/codex) may re-purpose the bar under this same law
  rather than inventing bespoke chrome — one idiom, contextual.
