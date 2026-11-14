# UI_RULES.md
Star Wars FFG RPG Companion — UI Design Rules

---

## Document Hierarchy

This document defines implementation rules for
the Star Wars RPG Companion app UI.

**UI_UX_PHILOSOPHY.md is the governing document.**
When these rules conflict with the philosophy,
the philosophy takes precedence.

Before implementing any new feature, read
UI_UX_PHILOSOPHY.md. The rules in this document
serve the philosophy — they are not ends in
themselves.

**Two peer identity docs make the philosophy enforceable and carry gate riders:**
[DESIGN_IDENTITY.md](DESIGN_IDENTITY.md) (*Corpus & Instrument* — composition; the R-DI1
identity-conformance line + ban list) and [PROSE_VOICE.md](PROSE_VOICE.md) (per-surface authored-copy
registers; the R-PV1 prose-voice line). Read them before building a new surface or authoring in-world copy.

---

## Voice — mechanics speak plainly, moments speak in-universe

**Standing rule (Jason, 2026-07-07; source ruling `new-specialization-amendment-1` §5).** When the UI
discusses game rules and mechanics, say what they *are* — plainly, even if it sounds gamey. Never
business language ("surcharge", "transaction", "purchase" for a rules cost) and never decorative
metaphor ("paths", "journey") standing in for a mechanic.

- **Mechanics register (default):** "+10 XP — outside your career", "costs 10 × your total
  specializations", "these become career skills". Cite chips (e.g. `eote p.102`) are welcome.
- **In-universe register (reserved):** the deliberate voice is for BEATS — confirmation moments,
  arrivals, growth ("…and awaken to the Force"). Not the default; a spice, used where the feeling lands.

The failure mode this fixes: concept-ruling prose ("honest surcharge") transcribed verbatim into product
copy. Ruling vocabulary is not UI copy unless the ruling says so.

### The copy voice (D-259, D-260) — `R-CVS-1..7`, `R-CVS-12..14`

_Landed by the sweep build (`copy-voice-sweep-build` R-CVB-6), verbatim from ruling `copy-voice-sweep` §2, ADDENDUM 1 and ADDENDUM 2, with their ids (R-CVS-7). The ruling is the source; this is its product-doc copy. The guard `test/copy_voice_sweep.cjs` holds it (R-CVB-7)._

**§2 — the standard:**

- **R-CVS-1 · A self-describing control carries NO helper sentence.** If the label says what pressing it does (MARK AS MY SHIP, LOAD,
  OPEN THE PACK, ADD ITEMS FROM STORE), nothing is printed under or beside it to say it again. Jason's own example: "One ship can be yours.
  Marking it puts it first here and on the hangar floor." is CUT, and MARK AS MY SHIP stands alone.
- **R-CVS-2 · Helper text explains a GAME RULE, or it goes.** Kept only where a player needs a rule to act: one plain, gamey sentence or
  fragment, the mechanics voice ("costs 10 × your total specializations", "Over by 2: add 2 setback dice to Brawn and Agility checks").
  A cite chip is welcome.
- **R-CVS-3 · The app does not narrate itself.** Sentences that describe what the app does with your data, your list order, or your
  clicks ("This records what she carries.", "Each change is kept as you make it.", "Nothing is charged and no credits move.") are CUT.
  **One exception, from the never-lazy set:** a line that stops a player LOSING something (an unsaved draft, a delete, an overwrite)
  stays, as short as it can be.
- **R-CVS-4 · States and refusals stay, shortest form.** An empty state, a refusal with its reason (a HELD item), an error, an over-limit
  warning: each says the state or the reason in the fewest words. These are not helper text ("Just looking": a refused piece says
  why).
- **R-CVS-5 · Out of scope:** in-universe beats (UI_RULES' reserved register, "…and awaken to the Force"); source prose (book and corpus
  descriptions, OggDude text, talent and item prose); legal and attribution text; the GM's own notes and anything a user typed.
- **R-CVS-6 · Fix the label, not the sentence.** Where a control is unclear WITHOUT its helper, the label is renamed. A rename is
  PROPOSED and goes to Jason on the before/after page. The sentence is never kept as a crutch.
- **R-CVS-7 · Where it lives.** This ruling is the standard until the sweep's build lands it in `UI_RULES.md` §Voice (a product doc, so the
  build lap carries it, verbatim with this ruling's ids). Cards and frames cite `R-CVS-n` by id.

**ADDENDUM 1 (D-260):**

- **R-CVS-12 · Today's copy is in scope.** The census (R-CVS-8) already reads the shipped sources; this states it: every sentence on a
  live screen is classed and, if it fails §2, cut or made plain on the before/after page. The same rule binds every drawn face, TODAY's
  words included (D-260: "today's helper text shown on those screens … is cut or made plain").
- **R-CVS-13 · The plain-words test for labels** (amends R-CVS-9's `LABEL` class, which said "counted, never classed further"; that
  was wrong, corrected at the source, charter §3a.6). A label (button, tab, heading, field key, chip) passes if a new player reads it
  and knows what pressing it does, or what the field holds, without a sentence beside it. One that fails is `RENAME`, with a PROPOSED
  plain label. Jason's example: "＋ A LINE OF YOUR OWN" (TRADE's button for typing in a cargo line that is not in the gear list) fails.
  Its rename is the lab's to propose and his to approve. Game terms the books print (SOAK, STRAIN, SILHOUETTE, SETBACK) pass by
  definition: they are the game's words.
- **R-CVS-14 · Claimed strings are written once.** A string that a ruled build already owns is classed `CLAIMED <stem>` in the census,
  and the sweep does not rewrite it. First claim: the cargo build owns TRADE's strings on the drawn cargo faces
  (`shipyard-cargo-frames-card` ADDENDUM 4 @ `f5b9a54c1`, R-SCF-7: "＋ A LINE OF YOUR OWN", "Each change is kept as you make it…",
  "Nothing is charged…", the column heads, ＋ AN ITEM, HIDDEN, and the form's words). The census reads them from the cargo board's words
  table.

**ADDENDUM 2 — R-CVS-14 widened:**

The cargo lab's finding 10 (`shipyard-cargo-frames-lab-card` ADDENDUM 10) showed that a drawn face can change today's strings outside a
build's named list (the GEAR unit's "Encumbrance, resolved"; the pack Story's two placeholders). **R-CVS-14 now reads:** a TODAY string
is `CLAIMED <stem>` when an APPROVED frames board's words table changes it; that board's build writes it, and the sweep does not. Before
approval the claim is PENDING, and the census marks it so. That keeps every string to one writer. First claims: the 13 changes on the
cargo board v3 (`XwpJ2vB7NqgJtWoyHCCEVr`), PENDING Jason's approval.

## New Feature Checklist

When implementing any new feature, follow
this decision tree in order.

**STEP 1 — Read UI_UX_PHILOSOPHY.md**
Every feature starts there. No exceptions.

**STEP 2 — Establish the fiction**
What is this in the Star Wars universe?
Who made it? Who uses it?
What does it feel like to access it?

**STEP 3 — Determine the visual system**

Is this feature accessed through the character
creation or NPC cantina datapad?

  YES — Use the datapad frame (Data_UI.png)
        and standard color palette below.

  NO  — Define a feature-specific visual language
        grounded in the fiction established in
        Step 2. Document it in the handoff.
        Reference examples: GM Toolkit (full-screen
        galaxy map).

**STEP 4 — Apply universal rules regardless**

These rules apply to every feature in every
visual system without exception:

  · Touch targets: 48px minimum, 56-64px preferred
  · Typography hierarchy: Orbitron for headers
    and labels, Inter for body text
  · Single scroll container per screen
  · Mobile-first interaction (tap + vertical scroll)
  · No gesture-only interactions
  · Widget logic-agnosticism (see Widget Rules)
  · Performance guidelines (see Performance)

**STEP 5 — Document the visual system**

If a new visual system is established, document
its color palette, typography choices, and key
components in the handoff. Future sessions must
maintain consistency with what was established.

---

## Visual Systems — Defined

### System 1 — Datapad (Character Creation + NPC Generator + ISB Dossier)

Applies to: Character Creation, NPC cantina scene,
NPC generator flows, ISB Faction Intelligence
dossier, and any feature accessed through the
cantina or character creation scenes.

The datapad is a physical object the GM holds.
The user's phone IS the datapad. The datapad
frame makes the user's phone feel like an
in-universe device. Leaving the frame breaks
the immersion.

**Frame asset:** `Assets/Data_UI.png`
All interactive UI renders inside the screen
area of this frame.

Frame rendering:
  Mobile — fills 92-96% of viewport height,
           width scales to maintain aspect ratio
  Desktop — largest comfortable size, centered,
            cinematic margins

Outside the frame: pure black (#000000).
No UI elements outside the datapad.

**Screen aesthetic:**
  · Deep digital blue background
  · Subtle gradient center glow
  · Horizontal scan lines
  · Faint cyan holographic glow
  · Implemented with CSS overlays, not baked images

Different software running on the datapad changes
the screen content, not the device frame:
  · Character creation: standard blue digital palette
  · NPC generator: same palette with faction-specific
    accents during Faction Reveal
  · ISB dossier: cold ISB palette (see ISB section),
    still inside the datapad frame — the device has
    been sliced into a different network

**Standard color palette:**
  Deep UI Blue:    #071C2F
  Panel Blue:      #0E2A47
  Highlight Cyan:  #3AB5FF
  Primary Text:    #E6F7FF
  Secondary Text:  #9FBBD3
  Success:         #3AFFA0
  Warning:         #FFC857
  Error:           #FF5C5C

**ISB dossier palette (within datapad frame):**
  Background:      #030810
  Text Primary:    #B8D4E8
  Text Secondary:  #7A9BB5
  Text Dim:        #3D5A72
  Warning:         #FF5C5C
  Amber:           #FFC857
  Green:           #3AFFA0
  Border:          rgba(184,212,232,0.15)

---

### System 2 — GM Toolkit (Full-Screen)

Applies to: Galaxy map, planet cards, encounter
builder, district view, navigation panel, and
all GM session management features.

The fiction for this system is not yet fully
defined. It functions as an information-dense
planning and navigation tool. A future session
may establish an in-universe fiction that
changes this system's visual language.

  · No datapad frame
  · Background: #050810 (near-black, space)
  · 44px persistent header bar
  · 56px bottom navigation tab bar
  · Content fills remaining viewport
  · Leaflet map fills full content area

Color palette inherits the standard WS tokens
(cyan #3AB5FF, amber #FFC857, success #3AFFA0,
error #FF5C5C) but on a darker, colder base
than the datapad system.

---

### System 3 — Future Features

When a new feature is implemented that does
not fit Systems 1-2, a new visual system
must be defined following the New Feature
Checklist above.

The visual system must be grounded in the
fiction of that feature — what device or
interface does the GM interact with in the
Star Wars universe?

Document the new system in the feature handoff
and add it to this section.

---

## Universal Rules (All Systems)

These apply regardless of which visual system
is in use.

### Touch Target Size

Minimum interactive height: 48px
Preferred: 56-64px

Applies to:
  · buttons
  · cards
  · list rows
  · gear items
  · radio options
  · any tappable element

### Mobile-First Interaction

Primary interaction model: tap + vertical scroll.
Swipe gestures may be added but must never
be required for core functionality.

### Screen Structure

Each screen contains three logical zones:
  1. Header (fixed)
  2. Scrollable content area
  3. Bottom navigation bar (fixed)

Only one vertical scroll container per screen.

### Navigation

Bottom navigation remains fixed and visible
during scrolling.

Standard layouts:
  Back | Next
  Cancel | Confirm
  [feature-specific tabs]

Navigation must never be hidden by content.

### Typography (Universal)

Primary font:   Orbitron
Secondary font: Inter

Usage — applies across all visual systems:
  Titles —    Orbitron, larger size, Medium weight
  Headers —   Orbitron, Medium weight
  Labels —    Orbitron, small size, letter-spacing
  Buttons —   Orbitron, Medium weight
  Body text — Inter, Regular weight
  Monospaced — Share Tech Mono or Courier New
               (ISB dossier screens only)

Aurebesh: decorative UI accents only.
Never for readable content.

**Typography tokens (WidgetRenderer):**
  T.xs = 7px, T.sm = 8.5px, T.body = 9.5px,
  T.md = 10px, T.lg = 12px, T.reading = 13px,
  T.xl = 14px, T.intro = 15px, T.title = 16px,
  T.display = 17px, T.value = 22px

**Spacing tokens:**
  SP.xs = 4, SP.sm = 8, SP.md = 12,
  SP.lg = 16, SP.xl = 24

### Legibility floor — sentence copy (STANDING LAW, ruling `suitebar-legibility-recon`, 2026-07-15)

Sentence-length copy (a phrase or longer that a user READS, not a single-word label) never ships
**below 11px** and never **below 60% white** (≈ 7:1 on the near-black grounds — AA with margin), with
**letter-spacing ≤ 0.05em** (wide tracking on small type destroys word-shapes). Single-word **labels
and pills** may be smaller ONLY if their contrast passes AA (≥ 4.5:1) at that size — a faint 9px label
is still a bug. Origin: the ⚙ ACTIVE SOURCES panel shipped descriptions at 9.5px / 42% white (≈ 4.0:1,
an AA FAIL) — this floor is the class fix so the next tiny-text row can't ship. Contrast is in the
never-lazy set: MEASURE it on any new/changed copy, don't eyeball.

### Panel motion law (STANDING LAW, ruling `panel-premium-presentation-concept`, 2026-07-16)

Panels and menus enter with **ONE fast fade** (0.2–0.25s ease), optionally +4–6px rise — **no slides,
no springs, no stagger**; `prefers-reduced-motion` → instant. Premium is the composed still FRAME, not
the transition (independently confirmed by two references: our launchpad still-frame finding + RSI's
production panel, a pure 0.25s opacity fade). Use `.panel-enter` (lib/shared/tokens.css).

### Premium panel idiom (ruling `panel-premium-presentation-concept`; Jason picked B · Premium, 2026-07-16)

ONE panel idiom, OUR signature (the Ship Yard ledger language + holo accent — NOT RSI's notched corners):
**named header** (title + funnel/icon + close) → **ledger sections** (accent rule-head at 13–14px WITH a
live count, e.g. "3/3" — not a 9.5px whisper) → **plated chunky rows** (≥46–50px, 13.5–14px labels, the
toggle/pill at the row's end) → **ACTION FOOTER** (a visually distinct strip: reset-class action left,
primary DONE right, live count between — "38 BOOKS · 33 ACTIVE"). Counts are furniture, not chrome. First
built surface: ⚙ ACTIVE SOURCES (`ActiveSourcesPanel`, lib/shared/ui.jsx); the ⌂/Help/⚙ popovers carry the
same material at popover scale. Store + Ship Yard FILTERS sheets AUDIT against this — harmonize deltas only.

### Card-Based UI

Selection screens use large stacked cards.

Applies to: species, careers, specializations,
faction selection, archetype selection,
narrative mechanics, and any browsable list
where the GM makes a single choice.

Cards must:
  · Fill most of the available width
  · Clearly highlight selected state
  · Be easy to tap on mobile
  · Show enough information to make the choice
    without requiring expansion

### Data Presentation

Avoid dense tables.
Prefer label → value rows.

Example:
  Brawn →     3
  Agility →   2
  Intellect → 2

### Longform text — the walls rule (IA lap, 2026-07-03)

Longform lore/description renders in **units of one header + ≤ ~6 sentences**; **no single displayed
text block exceeds ~700 characters**; deeper units **collapse by default** (first unit open, the rest
expandable). This mirrors the sourcebooks' own chunking (a header + a few sentences; structured facts ride
in callout boxes, not prose). Applies to faction dossiers, NPC descriptions, and any authored longform.
A structured `[{heading, text}]` shape renders as titled disclosures; a plain string falls back to a
paragraph-break split. Verified by a DOM-measured ceiling assert in the surface's smoke.

---

## Datapad Frame — Technical Implementation

### DeviceShell + Geo Positioning

The DeviceShell provides a `geo` object with the
calculated safe screen area. All content inside
the datapad MUST position itself within this area.

**Required positioning pattern:**
```
position: absolute
left:     geo.contentRelX
top:      geo.contentRelY
width:    geo.contentW
height:   geo.contentH
zIndex:   4
overflow: hidden
```

### Geo Object Reference

| Field              | Description                                    |
|--------------------|------------------------------------------------|
| geo.contentRelX    | Left offset of screen area relative to shell   |
| geo.contentRelY    | Top offset of screen area relative to shell    |
| geo.contentW       | Width of usable screen area (px)               |
| geo.contentH       | Height of usable screen area (px)              |
| geo.stageLeft      | Left edge of full stage area                   |
| geo.stageTop       | Top edge of full stage area                    |
| geo.stageW         | Width of full stage (includes frame)           |
| geo.stageH         | Height of full stage (includes frame)          |
| geo.saRelX         | Safe area X offset                             |
| geo.saRelY         | Safe area Y offset                             |
| geo.safeW          | Safe area width                                |
| geo.safeH          | Safe area height                               |

### DeviceShell Layer Stack (z-index order)

1. z-index 1: Datapad_UI.png frame image (background)
2. z-index 2: dp-glow — radial gradient glow effect
3. z-index 3: dp-scanlines — horizontal scan lines
4. z-index 4: Content area — where widgets render
5. z-index 5: Datapad_UI.png frame overlay (covers edges)

Content MUST use zIndex: 4. Layers 2, 3, and 5
have pointer-events: none.

### Slot Container Overflow Rule

Every slot rendered by WidgetRenderer is wrapped
in a container div with:
  overflow-y: auto
  overflow-x: hidden
  -webkit-overflow-scrolling: touch

Content scrolls within the slot boundary.
Content NEVER bleeds past the datapad frame.

### Color Tokens (WidgetRenderer)

```
WS.bg0   = rgba(3,9,20,0.98)     — deepest background
WS.bg1   = rgba(5,14,26,0.96)    — panel background
WS.bg2   = rgba(7,28,47,0.72)    — card/input background
WS.cyan  = #3AB5FF               — primary accent
WS.text1 = #E6F7FF               — primary text
WS.text2 = #9FBBD3               — secondary text
WS.text3 = rgba(159,187,211,0.42) — dim text
WS.f1    = 'Orbitron', monospace  — headings/buttons
WS.f2    = 'Inter', sans-serif   — body text
```

---

## Surface Patterns

Concrete, reusable shapes produced by the philosophy's laws and
[`ADAPTIVE_STANDARD.md`](ADAPTIVE_STANDARD.md). Each stands on its own; the
source pointer is provenance.

### The tabbed card, and its three contexts

ONE card component holds a subject's faces (e.g. STATS · ARSENAL · LORE). It
renders in three contexts, and the context — not the tier or the data — picks
the arrangement:

  · **Narrow panes** (an encounter reference column, any rail-width host) — TABS.
  · **Mid-tier and mobile** (< 1367) — TABS.
    _(Exception, Jason 2026-09-15 by approval of the tab-less frames — ruling
    `sheet-paper-concept` R-PSC-7: the CHARACTER SHEET's stage carries no tab
    strip at any band; its skills are one grouped, filtered list, two-up where
    the stage is at least 800px wide, one-up below. Queued as "law or mock"
    and decided: mock, for that surface only.)_
  · **Wide instrument pages** (≥ 1367) — SIDE-BY-SIDE PANELS, all faces at
    once, each panel scrolling internally (AS-4).

One content definition, arrangements by context (AS-1). A second copy of any
face is the defect this pattern exists to prevent.

_Source: `library-revision-scope` E1 (2026-07-21); wide panels ruled in
`npc-page-three-panel-brief` §Q1 (2026-07-22)._

### Pinned-top action bars

**Primary actions live ABOVE long content, everywhere.** A save bar sticks to
the TOP of a form, under the back row — never the bottom. A long form must
never hide its save below the fold.

_Source: `custom-npc-tab-amendment` (2026-07-21); generalized from the DETAILS
pane's actions-above-the-prose rule._

### The dossier pattern (reading measure + pinned companion)

When a **reading measure** meets a **wide canvas**, the answer is never to break
the measure and never to shrug at the void: keep the prose at its measure and
give the gutter a **pinned structured companion** carrying the facts that
already exist — vitals, figures, ranks, activation, cost, source.

Applied on: PROFILE (identity rail + reading), faction INTEL/LORE, the NPC
detail page, the sheet's ABILITIES reading pane. If the companion fits at a
width, it stays side-by-side; if it does not, it stacks below the prose.

The failure this prevents is measurable: a 66ch column alone in a 1070px pane
leaves ~550px of nothing, and the waste GROWS with the monitor.

_Source: `library-desktop-negative-space-brief` (2026-07-21); re-applied at
`npc-page-three-panel-brief` (2026-07-22)._

### The designed placeholder

**No empty rings, boxes, or grey voids where content is optional.** A
portrait-less character gets a DESIGNED placeholder — an accent-lit monogram on
the surface's own panel material — so the absence reads as intentional rather
than broken. Original geometry by construction (fan-work posture).

The just-looking law enforced at the source: the empty state is the state a new
user sees first, and on a phone it can be the first third of the screen.

_Source: `sheet-abilities-profile-revision-concept` §3 (2026-07-22)._

### TABLE MODE mechanics

The product's ONE chrome-recession pattern (AS-7):

  · an explicit LABELED toggle on the surviving strip — it must ENTER and EXIT
  · `holo-immersive` reuse — freed space is given to the surface, not dimmed
  · default OFF; the preference persists in localStorage
  · the no-trap property is ASSERTED at the gate, never assumed

Per-surface adoption is its own lap. Idle-fade is cosmetic and is not recession.

_Source: `sheet-immersive-table-mode-brief` + `table-mode-build` (2026-07-20)._

### The CARD · LIST view toggle contract

Where a collection supports two presentations: **one core, two presentations**,
selected by an explicit toggle, with the choice persisted **per device**. Both
presentations read the same data source and support the same operations — a
presentation that silently drops an action is a fork, not a view.

_Source: `bench-board-viewtoggle-brief` (2026-07-21)._

### Condition chips

Conditions render as **compact word-chips**: the three RAW tokens plus
free-form entries, **full words in ledgers** (never abbreviations — the
mechanics-voice rule is structural here). One chip ROW inside a ledger row;
the row budget is ≤72px (AS-6).

_Source: `bench-conditions-triage` (2026-07-21)._

### Inert rows (an option the moment cannot take)

A row the user may read but not take right now — a spend-menu option the roll cannot afford — stays
listed and says so in its build, never by fading: the control is `disabled` **and** `aria-disabled="true"`,
its tick edge is **dashed**, its words take the muted ink token (`--doc-ink-muted`) measured **≥ 4.5:1**
on the rendered ground, and **no `opacity`** touches the row (opacity drops the words below the floor and
hides the reason). The price stays printed. One idiom: `SWRPGUI.OfferRow`'s `inert` prop.

_Source: `f100-surfacing-hub-concept` ADDENDUM 5 rider R5, law with the approved hub frames (D-229, R-MIL-1)._

---

## Widget Rules

Widgets must remain logic-agnostic across
all visual systems.

Widgets may:
  · display data
  · accept input
  · emit events

Widgets must NOT:
  · calculate XP costs
  · calculate credits
  · modify game rules
  · contain business logic

Game rules belong in reducers and computed
selectors, not in widget components.

### Widget Event Flow

1. Widget emits event (onSelect, onChange, etc.)
2. Application reducer updates state
3. Computed selectors recalculate derived values
4. UI re-renders

### Widget Rendering (WidgetRenderer)

The WidgetRenderer resolves widgets by type name
from two registries:
  · widgetRegistry — character creation widgets
  · npcWidgetRegistry — NPC generator widgets

Widgets receive:
  · widgetDef — the flow JSON definition
  · slotStyle — geo-computed position/size
  · ctx — readBind, writeBind, navigate, confirm,
           close, ctrl, npc, factionProfiles,
           factionArchetypes, statBlocks

### Layout System (datapad-view-layouts.json)

Layouts define named slots with relative positions:
```
"content-nav": {
  "content": { x: 0.04, y: 0.05, w: 0.92, h: 0.79 },
  "nav":     { x: 0.05, y: 0.87, w: 0.9,  h: 0.09 }
}
```

Multiple widgets in the same slot are grouped
in a scrollable container automatically.

---

## Animation

Allowed:
  · subtle fade transitions
  · card highlight glow
  · minimal panel slide
  · terminal text reveal (ISB dossier)
  · CSS keyframe animations for atmospheric
    effects (pulse, blink, scanlines)

Avoid heavy animations.
Performance must remain high on mobile.

Wrap all non-essential animations in:
  @media (prefers-reduced-motion: no-preference)

---

## Accessibility

  · Readable text at all sizes
  · Large touch targets (see above)
  · Strong color contrast
  · Scrollable layouts without horizontal scroll
  · No gesture-only interactions
  · All interactive elements reachable by tap

---

## Performance

The app is a static web application served
via Python http.server. No build step.

Avoid:
  · large animation libraries
  · heavy UI frameworks
  · unnecessary DOM layers
  · blocking renders
  · synchronous data loading on mount

Keep rendering lightweight.
Load data asynchronously.
Pre-build layers where possible (Leaflet tiers).

---

## Cave Scene Assets (Character Creation)

**Background.png** sets the visual law.

Setting: Underground stone chamber, organically
carved, rough sedimentary walls.

Lighting: Four hanging cage lanterns emit warm
amber-orange glow (#e08c22 core). Teal-green
monitor on central workbench provides cool
counterpoint. Diffuse, pooled light with deep
brown shadows.

Color palette: Background #080503 near-black.
Stone #6e542c mid-brown ochre. Lantern glow
amber. Dust/dirt floor warm grey-brown.

Mood: Clandestine, lived-in, operational.
A real working safehouse.

---

## Reference Implementations

These features demonstrate specific rules at
their best. Reference them when uncertain.

**Datapad system — Character Creation**
Physical frame, cave scene, hotspot interaction,
Andor-inspired warm aesthetic.

**Full-screen system — GM Toolkit Galaxy Map**
Leaflet CRS.Simple, planet markers, zoom tiers,
bottom tab navigation, planet card bottom sheet.

**ISB dossier (inside datapad) — Faction Intelligence**
Cold palette within datapad frame, intrusion
sequence, classification stamps, three-layer
content, redaction, access log.
See CLAUDE_CODE_ISB_DOSSIER.md.

**Atmospheric UI — NPC Faction Reveal**
Discovery moment before data, short_descriptor
in cantina voice, ambient faction color tint.

---

## Visual Identity

The app has multiple visual identities —
each grounded in its fiction, all running on
the same device.

Character Creation feels like a physical device
passed around a table in a safe house.

The NPC Generator and ISB Dossier feel like
different software running on the same device —
the screen changes, the frame stays.

The GM Toolkit feels like a ship's navigation
and mission planning system — full-screen,
information-dense, fiction TBD.

The unifying thread is not a color or a frame.
It is the commitment to placing the GM inside
the fiction rather than outside it, describing it.
