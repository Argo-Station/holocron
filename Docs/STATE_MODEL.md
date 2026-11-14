# STATE_MODEL.md
Star Wars FFG Character Creator — State Model

> ⚠️ **ARCHIVED — first-generation design (UXQP-25).** This document describes the
> RETIRED first-gen architecture (`characterExport` / `computed` layers, rule-free
> "widgets", PDF-template export). The shipped app does **not** use this shape. The
> current state model is:
> - **Character / sheet record shape** — the live `sheetData` record and the
>   resolve-at-render projection, governed by [ADR 0004](../decisions/0004-pc-equipment-id-ref-resolution.md)
>   and the canonical-data architecture in [ADR 0003](../decisions/0003-canonical-data-architecture.md).
> - **Screens, pages, and routing** — [NAVIGATION.md](NAVIGATION.md) (living map).
> - **Source of truth** — the app state in `player/app.jsx` (`CharacterSheet`, `App`)
>   and `gm/app.jsx` (state was externalised out of the inline `index.html` blocks by
>   the babel-precompile lap).
>
> **The shipped `sheetData` shape (flat record, one `swrpg_saved_characters` entry per
> character; the record wraps it as
> `{id,name,species,career,book,accent,source,selectedChar,sheetData,savedAt,updatedAt,lastOpenedAt,order}`):**
> — **the picture is stored ONCE, at `sheetData.portrait`** (B-931, ruling `paper-b931` R-PB9-1..5). Records saved
> before B-931 may still carry `portrait` and `selectedChar.portrait` too; every reader goes through the one fold
> (`lib/shared/recordPortrait.js` `recordPortraitOf`), and a record drops its old copies on its owner's next write.
> — `lastOpenedAt` is stamped by the ONE sheet opener (`openSheetRecord`, B-407) and leads the roster's
> three-field sort (`lastOpenedAt || updatedAt || savedAt`); **`order` (optional integer) is the player's
> own ARRANGED position** — written on EVERY record, 0..n−1, when a row is moved in the paper landing's
> index, and honoured by that sort the moment any record carries one (records without one sort after, by
> the three fields). A new character appends (max+1) only on a roster that already carries the field, and
> a gap left by a deletion is harmless: the field is read as an ORDER, never as arithmetic. Ruling
> `landing-front-matter-concept` R-LFM-12 / Addendum 4, board B-649 — a durable-contract change surfaced
> on paper before the code (R-Y2-1); it rides the record on sync (LIST-merge by id).
> - *Identity* — `name · species · career · specialization · book · source · playerName · portrait`
> - *Stats* — `characteristics{brawn,agility,intellect,cunning,willpower,presence}`
> - *Derived* — `derived{soak,woundThreshold,strainThreshold,meleeDefense,rangedDefense,forceRating}`
>   — **snapshot at build time today; CS-2 moves this to resolve-at-render** (see
>   [sheet-derived-at-render-scope](rulings/sheet-derived-at-render-scope.md); until then, buying
>   armour in the Store does not update soak).
> - *Suffered/chosen session state* — `currentWounds · currentStrain · conditions · criticalInjuries[] ·
>   xp{total,spent,remaining} · skills{KEY:rank}`
> - *Reference/build* — `talents[] · speciesAbility · forcePowers[] · equipment{weapons[],armor,gear[],credits}`
> - *Narrative* — `appearance{age,gender,height,build,hair,eyes,notableFeatures} · playerName · backstory ·
>   motivations{desire,fear,strength,flaw} · obligation · duty · morality`
>
> **THE CAMPAIGN (BOOKS-1c, ruling `campaign-model-final`):** `book` is the **campaign frame**
> (the step-1 pick — eote/aor/fad; live semantics, unchanged), and it drives the primary narrative
> track: obligation (eote) · duty (aor) · morality (fad). The tracks are **usually mutually
> exclusive** (one of three non-null), with ONE exception — **mode-c Morality layering
> (fad p.341-342):** a Force character (`forceRatingBase ≥ 1`) in an Obligation/Duty campaign may
> ALSO carry `morality` (locked at 50, no credit/XP trade — one-tap declinable at creation). When
> kept, **two** of the three fields are non-null (populate-two-of-three); every reader (PROFILE
> card list, both PDF exporters) renders **all present tracks**, not just the first. No new persisted
> field, no version bump (R-Y2-1) — the layer reuses the existing `morality` field. The **campaign
> quartet** F-25 shares = `book` (frame) + primary track + typed summable `entries[]` + shelf off-set.
>
> **Persistence (UXQP-22 split-persistence):** `onSheetChange(patch)` always updates in-memory
> `sheetData`; VITALS (`currentWounds/currentStrain/conflict/criticalInjuries/conditions`) and IDENTITY
> (`name/portrait`) patches *also* write through to `swrpg_saved_characters` immediately; every other
> field (appearance, playerName, xp, skills, motivations…) persists on the explicit roster **SAVE**.
> **COMMERCE is the third write-through class (ITM-V1, ruling C1):** the store's FINALIZE and the
> LOADOUT sell write the roster record immediately — the top-level store can transact for a character
> whose sheet isn't open, so there is no save bookmark to press; a market run must survive reload.
>
> Kept for historical reference and for the still-sound design *principles* below
> (single source of truth, derived-not-authored, IDs-not-records). Do not treat the
> concrete `characterExport`/`computed`/PDF specifics as current.

## Purpose

This document defines the application state model for the static, data-driven character creator.

Goals:

- keep all character data in one predictable structure
- separate player choices from derived calculations
- prevent rule logic from leaking into UI widgets
- make PDF export straightforward
- keep the app compatible with static hosting and JSON-driven rendering

The application state is split into two major layers:

- `characterExport` — persistent player choices and resolved selections
- `computed` — derived values recalculated from `characterExport` and datasets

Widgets must read from these layers but must not implement rules internally.

---

## State Design Principles

### 1. Single source of truth
All player selections live in `characterExport`.

### 2. Derived data is not hand-authored
Anything that can be calculated should live in `computed`.

### 3. UI state stays separate
Transient interface values like open panels, search filters, or active tabs should live in a lightweight `ui` state object, not in `characterExport`.

### 4. Dataset records are referenced by ID
Store IDs in state, not duplicated full records.

### 5. Reducer-friendly updates
State changes should be represented as simple actions that update `characterExport`, then recompute `computed`.

---

## Top-Level State Shape

```json
{
  "characterExport": {},
  "computed": {},
  "ui": {}
}
```

---

## characterExport

`characterExport` stores all durable character choices and final exportable data.

Recommended structure:

```json
{
  "meta": {},
  "character": {},
  "narrative": {},
  "characteristics": {},
  "skills": {},
  "talents": {},
  "gear": {},
  "credits": {},
  "xp": {},
  "derived": {}
}
```

Note:
- `derived` may optionally store finalized snapshots for export convenience, but authoritative derived logic should still come from the computed layer.

---

## characterExport.meta

Metadata about the build session and selected line.

```json
{
  "gameLine": "eote",
  "sourceMode": "core-only",
  "appVersion": "1.0.0",
  "templateId": "EotE Character Sheet.pdf"
}
```

Suggested fields:

- `gameLine` — `eote | aor | fad`
- `sourceMode` — optional content filter mode
- `templateId` — selected PDF template
- `appVersion` — optional build version
- `createdAt` — optional timestamp
- `updatedAt` — optional timestamp

---

## characterExport.character

Identity and major selections.

```json
{
  "name": "",
  "backgroundId": null,
  "motivationId": null,
  "speciesId": null,
  "careerId": null,
  "specializationIds": []
}
```

Suggested fields:

> **Note (B-65, 2026-07-30):** `backgroundId` and `motivationId` below are a PROPOSED export shape and
> have never shipped. Do not confuse them with the working character's `narrative.backgroundId` /
> `narrative.motivationId`, which were different fields and were REMOVED by F-60 (0 writers, 0
> readers). Same names, different contract — a find-and-replace across docs would have "fixed" both.

- `name`
- `backgroundId`
- `motivationId`
- `speciesId`
- `careerId`
- `specializationIds[]`

Notes:
- Keep IDs only
- The first specialization is usually the starting specialization
- Additional specializations may be purchased later and appended

---

## characterExport.narrative

Narrative mechanic selection and tradeoff outcome.

```json
{
  "mechanic": null,
  "typeId": null,
  "conflictId": null,
  "pairId": null,
  "tradeoffId": null,
  "adjustments": {
    "obligationDelta": 0,
    "dutyDelta": 0,
    "moralityDelta": 0,
    "xpBonus": 0,
    "creditsBonus": 0
  }
}
```

Field guidance:

- `mechanic` — `obligation | duty | morality`
- `typeId` — obligation type or duty type
- `pairId` — morality pair if used
- `conflictId` — optional narrative conflict detail
- `tradeoffId` — selected tradeoff option
- `adjustments.*` — resolved mechanical results of that choice

Notes:
- Store the selected narrative choices and resolved adjustment values
- Do not recompute these from raw text in widgets

---

## characterExport.characteristics

Base and purchased characteristic state.

```json
{
  "base": {
    "brawn": 0,
    "agility": 0,
    "intellect": 0,
    "cunning": 0,
    "willpower": 0,
    "presence": 0
  },
  "purchased": {
    "brawn": 0,
    "agility": 0,
    "intellect": 0,
    "cunning": 0,
    "willpower": 0,
    "presence": 0
  }
}
```

Guidance:

- `base` should reflect species starting characteristics
- `purchased` should represent how many upgrades were bought during creation
- final values are computed later

---

## characterExport.skills

Skill state should separate free ranks from purchased ranks.

```json
{
  "freeCareerSkillIds": [],
  "freeSpecializationSkillIds": [],
  "purchasedRanks": {
    "piloting-space": 1,
    "cool": 1
  }
}
```

Suggested structure:

- `freeCareerSkillIds[]` — skills granted free by career selection flow
- `freeSpecializationSkillIds[]` — skills granted free by specialization picker
- `purchasedRanks` — map of skillId → additional paid ranks bought with XP

Notes:
- Store free skill picks as arrays
- Store paid skill ranks separately
- `computed` merges these into effective current ranks and cost floors

---

## characterExport.talents

Starting and purchased talents.

```json
{
  "selectedTalentIds": [],
  "grantedTalentIds": []
}
```

This may remain minimal during initial MVP if talents are not yet being actively purchased during creation.

---

## characterExport.gear

All selected inventory and starting equipment.

```json
{
  "items": [
    {
      "itemId": "blaster-pistol",
      "quantity": 1,
      "equipped": false,
      "notes": ""
    }
  ]
}
```

Suggested fields per entry:

- `itemId`
- `quantity`
- `equipped`
- `notes` (optional)

Notes:
- Store by ID and quantity
- Derive encumbrance, credits spent, and item detail displays in `computed`

### PROV-1 — provenance + nickname (live persisted equipment)

The live persisted equipment entries (`equipment.weapons[]`, `equipment.armor`, `equipment.gear[]` —
canonical id-refs + instance state, ADR 0003/0004) carry two OPTIONAL instance fields, "gear that
remembers" (R-ITM9). The canonical record is never touched (§8); display resolves name-with-nickname.

- `nickname` (string, optional) — the player's name for this specific item ("Kessel Kiss");
  rendered as `nickname · <real name>`.
- `provenance` (array, optional) — player-owned history: `[{ note, when }]`, `when` a plain
  `YYYY-MM-DD` date (D-ITM8). The store's finalize auto-stamps ONE first entry per newly-acquired
  item (`{ note: "bought — the store", when }`); a bumped gear stack gets no note; BYOA/manual/
  creator gear get none. Every later note is player-written (add/edit/delete).

Persistence class: the acquire stamp rides the store finalize (commerce write-through, C1); player
edits to nickname/provenance use the explicit-save (bookmark) model, like other gear edits. SELL
removes the whole entry — the story leaves with the item (no orphan archive).

---

## characterExport.credits

Credits tracked as choices, not duplicated calculations.

```json
{
  "startingBase": 500,
  "bonusFromNarrative": 0,
  "spent": 0
}
```

Guidance:

- `startingBase` should default to 500
- `bonusFromNarrative` comes from resolved narrative tradeoff
- `spent` may be maintained by reducer or derived from selected gear
- if possible, prefer deriving `spent` from gear cost totals to avoid drift

---

## characterExport.xp

XP tracked as available pool and player purchases.

```json
{
  "startingBase": 0,
  "bonusFromNarrative": 0,
  "spentOnCharacteristics": 0,
  "spentOnSkills": 0,
  "spentOnOther": 0
}
```

Guidance:

- `startingBase` usually comes from species
- `bonusFromNarrative` comes from tradeoff
- spend totals may either be stored directly or derived from purchase maps
- if possible, derive spend totals from purchase records

Recommended addition:

```json
{
  "purchases": {
    "characteristics": {
      "brawn": 1
    },
    "skills": {
      "piloting-space": 1
    },
    "other": []
  }
}
```

This gives you a clear audit trail for review and debugging.

---

## characterExport.derived

Optional persisted snapshot for export convenience.

```json
{
  "woundsThreshold": 0,
  "strainThreshold": 0,
  "soak": 0,
  "defense": {
    "melee": 0,
    "ranged": 0
  }
}
```

Use only as a convenience cache if needed.
The authoritative derived values should still originate from selector logic.

---

## computed

`computed` contains all values derived from `characterExport` and datasets.

This object should be regenerated whenever relevant state changes.

Recommended shape:

```json
{
  "selectedRecords": {},
  "characteristics": {},
  "skills": {},
  "xp": {},
  "credits": {},
  "gear": {},
  "narrative": {},
  "validation": {}
}
```

---

## computed.selectedRecords

Resolved dataset records for current selections.

```json
{
  "species": {},
  "career": {},
  "specializations": []
}
```

Purpose:
- let widgets render detail views without repeatedly looking up records
- keep render code simple

These are convenience records, not persistent user-authored state.

---

## computed.characteristics

Final characteristic values and related derived stats.

```json
{
  "final": {
    "brawn": 2,
    "agility": 3,
    "intellect": 2,
    "cunning": 2,
    "willpower": 2,
    "presence": 2
  },
  "woundsThreshold": 12,
  "strainThreshold": 11,
  "soak": 2,
  "defense": {
    "melee": 0,
    "ranged": 0
  }
}
```

Rules this layer may handle:

- final characteristic scores
- wounds threshold
- strain threshold
- soak
- defenses

---

## computed.skills

Effective skill ranks and free-rank floors.

```json
{
  "effectiveRanks": {
    "cool": 1,
    "piloting-space": 2
  },
  "freeRankFloor": {
    "cool": 1,
    "piloting-space": 1
  },
  "careerSkillIds": [],
  "specializationSkillIds": []
}
```

Purpose:

- provide widgets with the effective current rank
- provide XPSpender with free-rank floor data
- expose skill classification for display

---

## computed.xp

All XP pool and pricing data.

```json
{
  "starting": 100,
  "bonus": 10,
  "totalAvailable": 110,
  "spent": 25,
  "remaining": 85,
  "characteristicCosts": {
    "brawn": 30
  },
  "skillNextCost": {
    "cool": 10
  }
}
```

Suggested contents:

- `starting`
- `bonus`
- `totalAvailable`
- `spent`
- `remaining`
- `characteristicCosts`
- `skillNextCost`

This is where the free-rank floor rule should be reflected.

Example interpretation:
- 1 free rank in a skill means the first paid rank starts at rank-2 cost
- XPSpender reads cost values from here instead of calculating them internally

---

## computed.credits

All credit totals.

```json
{
  "starting": 500,
  "bonus": 1000,
  "totalAvailable": 1500,
  "spent": 650,
  "remaining": 850
}
```

This layer should drive:
- budget displays
- affordability checks
- cart summaries

---

## computed.gear

Inventory totals and convenience information.

```json
{
  "totalEncumbrance": 3,
  "encumbranceThreshold": 8,
  "remainingEncumbrance": 5,
  "cartCount": 3
}
```

Optional additions:

- `itemDetails[]` resolved with names/costs/stats
- `restrictedCount`
- `armorEquipped`
- `weaponSummaries[]`

---

## computed.narrative

Resolved narrative labels and summaries.

```json
{
  "mechanicLabel": "Obligation",
  "typeLabel": "Debt",
  "tradeoffLabel": "+5 Obligation",
  "summary": "You accepted help when you needed it most. Someone expects something in return."
}
```

Purpose:
- keep review UI simple
- support dossier and summary widgets
- provide display-ready text without making widgets perform lookups

---

## computed.validation

Validation state for current step and final review.

```json
{
  "currentStep": {
    "valid": true,
    "errors": []
  },
  "review": {
    "valid": false,
    "errors": [
      "Character name is required",
      "One specialization must be selected"
    ]
  }
}
```

Suggested responsibilities:

- required-field checks
- step gating
- final review checks
- optional warnings for overspending or missing selections

---

## ui

`ui` stores temporary interface state only.

Example:

```json
{
  "currentStepId": "species",
  "currentViewId": "detail",
  "search": {
    "species": "",
    "gear": ""
  },
  "activeTab": {
    "gear": "weapons"
  },
  "detailPanel": {
    "open": false,
    "entityId": null
  }
}
```

Rules:

- UI state must never be required for PDF export
- UI state must never store core rules
- UI state may be safely reset without losing the character build

---

## Event and Recompute Flow

Recommended update cycle:

1. Widget emits action
2. Reducer updates `characterExport`
3. Selector registry recomputes `computed`
4. UI re-renders from state

Example:

```text
CardList.onSelect("twi-lek")
→ dispatch({ type: "SET_SPECIES", payload: "twi-lek" })
→ characterExport.character.speciesId updates
→ computed.selectedRecords.species updates
→ computed.characteristics.final updates
→ species detail UI re-renders
```

This keeps widgets simple and predictable.

---

## Recommended Action Types

Examples:

- `SET_NAME`
- `SET_BACKGROUND`
- `SET_MOTIVATION`
- `SET_NARRATIVE_MECHANIC`
- `SET_NARRATIVE_TYPE`
- `SET_NARRATIVE_TRADEOFF`
- `SET_SPECIES`
- `SET_CAREER`
- `ADD_SPECIALIZATION`
- `SET_FREE_CAREER_SKILLS`
- `SET_FREE_SPECIALIZATION_SKILLS`
- `BUY_CHARACTERISTIC_UPGRADE`
- `BUY_SKILL_RANK`
- `ADD_GEAR_ITEM`
- `REMOVE_GEAR_ITEM`
- `SET_GEAR_QUANTITY`
- `GO_TO_STEP`
- `GO_TO_VIEW`

Keep actions descriptive and domain-based.

---

## What Must Not Live in Widgets

Do not place these inside widget code:

- XP price calculations
- credit affordability rules
- narrative tradeoff math
- wounds/strain/soak calculations
- free skill rank floor logic
- PDF field mapping logic

Widgets should only display values and emit events.

---

## What Must Be Derived in computed

Strongly recommended derived selectors:

- selected species record
- selected career record
- selected specialization records
- final characteristics
- wounds threshold
- strain threshold
- soak
- defenses
- effective skill ranks
- free-rank floors
- next skill cost
- XP spent and remaining
- credits spent and remaining
- total encumbrance
- narrative summary labels
- current-step validation
- final review validation

---

## PDF Export Relationship

PDF export should read from:

- `characterExport` for authored selections
- `computed` for derived totals
- mapping JSON for field bindings

Do not force widgets to prepare export-specific state.

The export system should be able to run from state alone.

---

## Summary

The state model should follow this rule:

- `characterExport` = what the player chose
- `computed` = what those choices mean
- `ui` = what the interface is doing right now

This separation keeps the project:

- predictable
- testable
- data-driven
- easy for Claude Code to extend
- safe for static hosting

The guiding principle is:

> Persistent choices in `characterExport`, all rule meaning in `computed`, and all temporary display state in `ui`.

---

## Persisted-shape deltas (consolidated 2026-07-22)

Shapes that changed or were papered since this document's last pass. Each names its source ruling
for provenance; the entry itself is self-contained.

### Bench member identity — schema v5

Every encounter group member carries a globally-unique **instance `id`**. Deduplication is REMOVED: the
same NPC may appear N times in a group, each instance independent (two stormtroopers take wounds
separately). All member operations key on `id`, never on `_source_key` — `_source_key` remains the
id-ref used to RESOLVE the stat block at render, which is a different job.

Storage: `swrpg_npc_bench`. Migration was one-way and shipped; readers should not expect
pre-v5 member records.

_Source: ruling `bench-report-r1-dup-v5-build` + `decisions/0016-bench-member-instance-identity`
(2026-07-21)._

### Conditions vocabulary

Member conditions persist as **free-form lowercase tokens**. Three RAW tokens are canonical
(the rulebook's own states); anything else the table invents is legal and stored verbatim.

**Readers must be tolerant**: an unknown token renders as its own word rather than being dropped,
coerced, or treated as an error. There is no enum to validate against — that is the design, not an
omission.

_Source: ruling `bench-conditions-triage` (2026-07-21)._

### Negative resource ranges (inform-never-gate)

`xp.remaining` and `credits` may legally persist **NEGATIVE** values. Same fields, same schema —
the value RANGE widens.

Every reader of these fields must tolerate negatives: no `Math.max(0, …)` clamps, no unsigned
assumptions, no display formatter that hides a minus sign. No migration is required (all pre-law
saves are ≥ 0), but a reader written against the old range will silently misreport.

_Source: ruling `inform-never-gate-law` §3.5 — this is that law's R-SY4 paper (2026-07-21)._

### Papered but NOT built

Shapes that have been ruled on paper and are **not yet implemented**. They are recorded here so a
future lap does not re-decide them, and so nobody mistakes paper for product:

- **Member `crits[]`** — per-member critical injuries on an encounter member.
- **The native ENVELOPE** — the import/export container shape.

Neither exists in shipped storage. Check the source ruling before building against them.
