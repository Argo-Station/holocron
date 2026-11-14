# 0007. Accept the iOS Safari bottom-toolbar accent tint (stop mitigating it)

- **Date:** 2026-06-16
- **Status:** accepted

## Context
On the Custom character creator, iOS Safari's bottom toolbar (the compact URL/tab bar) tints
itself to the game-line accent colour (gold on EotE, etc.). This is Safari's own "website
appearance" behaviour: with `viewport-fit=cover` set, Safari samples the page's rendered pixels
in a band at the very bottom of the layout and colours its toolbar to match — even though the
page sets `<meta name="theme-color" content="#000000">`. The bright element in that band is
sampled: the accent **action button** when it's showing (detail pages once scrolled), or the
**coloured skill cards** when the button is hidden (skills before completion). Species detail
looked fine only incidentally — dark content under a hidden button.

Three escalating mitigations were shipped and then backed out (commits 8605b38 take 1 / 7255b70
take 2 / c3f4a2a take 3; reverted in 26d195d):
1. Negate the spec-detail wrapper's 24px bottom padding so the bar sat flush (removed a gold
   page-bg strip below it). — toolbar still sampled the button.
2. Fold `env(safe-area-inset-bottom)` into the action bar's bottom padding to lift the button
   and backfill the strip dark. — only helped where the bar was visible.
3. An always-on dark "floor" element behind the toolbar strip. — only as tall as it was; Safari
   sampled a taller band, catching the bright skill cards above it.

The band's height is not measurable without a physical device, so each attempt was a blind
guess verified only by Jason device-checking a deploy — three round-trips, still tinting.

## Decision
**Accept the tint as browser chrome and stop mitigating it app-side.** All three attempts were
reverted; the creator returns to its pre-tint styling. No `theme-color` games, no dark floor,
no safe-area button lift.

## Alternatives considered
- **Tall permanent dark bottom band** (extend the dark zone + push the CTA up so nothing bright
  ever sits in Safari's sample band): the only reliable fix, but it imposes a visible dark strip
  (~a finger's height) on the bottom of *every* creator screen, with the CTA floating above dead
  space. Jason weighed this explicitly and declined the visual cost.
- **Iterative tuning** (bump the dark zone in steps, device-check each): rejected — more
  deploy/check round-trips for a cosmetic win, with no guarantee of a small final band.
- **Remove `viewport-fit=cover`**: would likely let `theme-color` control the bars, but it was
  added deliberately for header safe-area/notch handling; removing it regresses that.

## Consequences
- The iOS Safari bottom toolbar will tint to the active game-line accent on creator screens.
  This is cosmetic, device-/OS-dependent, and outside the page's DOM.
- **A future session should NOT re-attempt this** unless the product owner reverses the
  visual-cost call. If revisited, the tall-dark-band approach (above) is the only lever known to
  work — not another safe-area/flush/floor variant.
- Features developed alongside these attempts were KEPT and remain live: the scroll-reveal SELECT
  bar on the species/spec detail pages (`useRevealNearBottom`), the "CONTINUE WITHOUT …"
  two-state labels on RAW-bypassable steps, and the sticky CONTINUE action bar.
