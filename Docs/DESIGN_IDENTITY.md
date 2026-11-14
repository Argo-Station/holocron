# DESIGN_IDENTITY.md — *Corpus & Instrument*

Star Wars FFG RPG suite (Project Holocron) — the composition identity for reference surfaces.

## Position in the hierarchy

Subordinate to [`UI_UX_PHILOSOPHY.md`](UI_UX_PHILOSOPHY.md) — this doc is **Principle 1 ("if it looks
like a React app, revise it") made enforceable for composition.** Peer detail to
[`UI_RULES.md`](UI_RULES.md) (cross-linked from it). When this conflicts with the philosophy, the
philosophy wins; this makes it buildable.

Established 2026-07-10, co-designed by Jason + the architect (ruling
[`design-identity-and-y1-hero-handoff`](rulings/design-identity-and-y1-hero-handoff.md)), from the
diagnosis that the item store + Ship Yard drifted **generic** — the "AI-generated UI" look — because
they were anchored to a real-world web store (RSI) instead of an in-universe fiction. The app's
distinctive surfaces (ISB dossier, cave scene, galaxy map) all answered "what IS this in the Star Wars
universe?" first. This identity restores that question for reference surfaces.

## The frame

**Every significant reference surface is an entry in a published in-universe document, displayed on a
purpose-built instrument** (the phone IS the datapad). The *document* gives the surface its anatomy and
voice; the *instrument* gives it its materials. For the Ship Yard, the document is a **Starships and
Speeders catalog entry** — the FFG book's own voice and page anatomy. We don't invent a fiction; we
inherit the source material's.

### The ground clarification (amendment — ruling `visual-revision-concept` R-VR-1/R-VR-2, 2026-08-28)

**Nothing below is new law. This records what the frame above already said, because it was once
read as saying the opposite.** A reading circulated that F-101 required signing away a "§4.4
reversal" of this document. There is no §4.4 here, and no reversal was ever owed: the frame has
always described TWO layers — a *document* rendered on an *instrument* — and a surface painting
paper on the app's chrome is that frame made literal, not a departure from it.

What the frame did not spell out, and now does:

1. **A document ground is SURFACE-SCOPED.** Any surface may declare its own — one at a time, each
   by name, each citing the ruling that authorized it.
2. **No surface inherits another's.** A ground declared for one surface has no claim on the next.
   This is the clause that keeps "a little at a time" from ending as eleven grounds nobody chose,
   and it is why the mechanism declares grounds on a CONTAINER and never on `:root` — a `:root`
   paper would BE the global this forbids.
3. ~~**THE INSTRUMENT IS CONSTANT.** The app's own chrome is not a document ground and does not
   change when a document declares one. The paper is painted ON the instrument; the instrument is
   what stays put around it.~~
   **⚠ RETIRED 2026-09-21 — Jason: *"the black ground is the old screen, so the law is outdated and needs
   to be removed for the paper."* REPLACED BY: the chrome MATCHES THE SURFACE — on a paper surface the
   chrome takes that ground; on a surface still dark it stays `--pp-chrome`. Items 1 and 2 above are
   untouched and still govern HOW a ground is declared, so this is not a licence for a `:root` global.
   Ruling `chrome-ground-retirement` R-CGR-1; landed here as its named rider.

Mechanism: `lib/shared/tokens.css`'s `--doc-*` ground-set; enforced by
`test/ground_token_contract.cjs`. The ground-set deliberately carries NO palette — a ground's
colours arrive with the surface that declares it, after Jason approves its mockup (R-MU1).

> *The identity in one line: a page from the galaxy's reference corpus, rendered on your instrument.*
> Warm editorial prose over a cold ruled ledger; one strict field order repeated on every entry; flat,
> sparse, single-accent chrome; depth from document furniture (folios, plates, citations, revision
> marks), never from glow.

## The three laws

**Law 1 — two temperatures.** Every entry is **warm editorial over cold ledger**: opinionated prose
with a narrator's point of view above, a strict formal data block below. Never one uniform temperature;
"everything-medium" IS the generic look.

**Law 2 — the ruled ledger.** Data renders as **ONE ruled table per section** — quiet all-caps labels
(mono), tabular figures, hairline rules, and **a fixed field order repeated identically on every
entry**. The cross-entry repetition is what makes 415 ships read as a published corpus (the field liturgy
becomes muscle memory — "Price/Rarity is always line seven"). **Three type tiers only** — display
designation / quiet label / tabular value — plus humanist body prose as a fourth register; all from the
existing tokens (Orbitron / Share Tech Mono / Rajdhani). Spacing derives from the designation block's
measure (the one big type spend sets the grid), not a generic uniform scale.

**Law 3 — the sparse instrument.** Chrome is **flat, high-contrast, ONE accent per screen** (the
existing accent convention). Depth comes from **document furniture** — running heads, folios ("ENTRY
214 / 415 · STARFIGHTERS"), plate numbers + captions, source citations, registry revision marks,
hairline leader lines — **never from glow or translucency.** Weathering/wear is a MEANINGFUL state, not
a texture: catalog reference pages are clean; a Y2 owned vessel's live sheet may carry wear because dirt
is information (the used-future rule).

### The Warmth Package (amendment — Jason's pick **B**, 2026-07-11; ruling `shipyard-y1-design-review-handoff`)

The first Yard build read "worse than the rest of the app": the three laws overshot when they met real
materials. The direction HOLDS; these six calibrations amend it (live in `lib/shared/corpus.css`):

1. **Law 3 amended — the accent OWNS the furniture.** Document furniture (running heads, section rules,
   plate labels + registration ticks, ledger keys, back-chevrons) renders in the surface accent at DIM
   strength, constantly (`--ci-accent-furn`, `rgba(accent,.60)`); full strength is reserved for
   interaction + marked events. The page reads as "the amber book," not monochrome. Not tinted fills
   everywhere either (that stays banned — variant D).
2. **The mat law.** Every image sits on ONE uniform plate ground (`--ci-mat`, `#0c0f15`-class) inside the
   frame; the plate label is backed by the mat so it never collides with art. No ruled-paper texture
   behind plates. (For the square source art, the recognition-index plate is a square matching the image
   aspect — no crop, no letterbox.)
3. **Depth amended.** Plates + mats may carry honest layered shadow (`--depth-card`, one light source).
   Glow stays event-only. "Flat" governs gradients + glows, not honest shadow.
4. **Ground.** The document renders on the APP's own ground token (`--ci-ground` = `#02010a`) — same
   instrument, different document. The separate `#08090d` stock is retired.
5. **Display voice is UPPERCASE.** Designations + all display-font text render uppercase (the app's
   Orbitron voice). Mixed-case display is now banned (ban item 11).
6. **Truthful furniture.** Captions/labels state only what the artifact IS — a beauty render is
   "ARCHIVE IMAGE," the schematic is "RECOGNITION SCHEMATIC"; "PLAN VIEW" only over an actual plan view.

**R-DI4:** hero-surface design sign-off happens on IN-CONTEXT renders (the surface in its real app
chrome, beside its neighbors) — never a blank-ground mockup. **R-DI5:** `corpus.css` is the ONE home of
these classes; the store refit (R-DI2) inherits them.

## The ban list (enforceable — R-DI1)

Every new-surface or surface-rebuild gate carries an **IDENTITY CONFORMANCE** line checked against these.
A ban-list item present = the gate names why (a deliberate, ruled exception) or fixes it.

1. **No centered radial-glow hero bands.**
2. **No accent-tinted pill chips** as an information carrier.
3. **No boxed stat cells** (a label+value in its own bordered rounded box).
4. **No uniform auto-fit card grids** in the rounded-glowing-card costume (grids survive as
   **recognition-index plates** over hairlines).
5. **No glow-as-depth** — glow is a registered EVENT only (a reveal, a live/danger state, the launchpad
   hero). A gate using glow names its event (R-DI3).
6. **No glassmorphism / translucent panel stacks.**
7. **No generic icon standing in for a real technical drawing.**
8. **No abbreviated stat labels, ever** (the mechanics-voice rule, now structural — "Hull Trauma," never
   "HT").
9. **No purposeless motion** — blanket fade-ins and scattered micro-interactions are a named AI-UI tell.
   Motion is AUTHORED per event (same law as glow): an entrance that means something, a state change
   that earns it. Shipped animations on existing surfaces (hubcard-rise, slideUpBounce) stand until
   their surfaces refit.
10. **No fake precision** — placeholder/demo content never fakes data (invented stats, lorem specs). A
    surface renders the registry or an HONEST placeholder that says what it is.
11. **No mixed-case display font** — the display face (Orbitron) renders UPPERCASE (the app's display
    voice); lowercase Orbitron reads soft + foreign (Warmth Package §5).

**The generation-time self-critique pass:** before gating a new surface, the builder re-reads it against
this ban list with the "if it reads like a generic default for any similar page, revise it" test. R-DI1
is the review-time layer; this is the build-time one. (Ban items 9–10 fold in the architect's post-ruling
addendum from the anti-slop-UI ecosystem scan; item 11 is the Warmth Package.)

## Explicitly NOT banned

- The existing **token fonts + accent palette** — the identity is how they are *deployed*, not the tokens.
- The shipped **launchpad / landing** looks (they refit on their own laps, if ever).
- **Grids as such** (they become recognition-index plates, not product cards).
- The **schematic's flat accent fills** — flat ink, not glow.

## Rollout

The **Ship Yard is the proving ground** (ruling §2c) — the identity gets proven there first, codified
from the built exemplar, then the **item store gets its refit lap** (R-DI2, consuming the same shared
primitives). New shared primitives (ruled section head, ledger row/table, plate frame, furniture line,
running head/folio) live in `lib/shared/` — ONE definition each (§8 one-core law); both surfaces consume
the same ones.

_— Landed by the implementer from ruling §4 (Corpus & Instrument), 2026-07-10. Working name; rename at
will. The identity is a composition discipline, not a re-theme — the fonts and accents are the ones we
already ship._
