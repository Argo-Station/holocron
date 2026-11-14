# CREATOR PLUMBING — the census (R0)

**Scope ruling:** [`Docs/rulings/creator-plumbing-census-scope.md`](rulings/creator-plumbing-census-scope.md)
(Jason's directive, 2026-07-29). Read-only recon. **This document RANKS; it does not fix.**
Measured against `commercial` @ `e2c0dcc`.

**STATUS: ADOPTED.** Ruling [`creator-plumbing-census`](rulings/creator-plumbing-census.md) — **ACCEPT**
(architect, 2026-07-29; five spot-checks, five exact, N-1 independently reproduced). §5 is the standing
**R1 contract** (R-R0-1 discharged — R1's gate cites it field-for-field) and §6 is **F-45's round-trip
checklist**. §4.9 is the **shim retirement ledger** (R-R0-4). §8's nine items are boarded:
**B-57** (N-1) · **B-58** (`source`) · **B-59** · **B-60** · **B-61** · **B-62** · **F-60** (the
subtraction lap), plus census annotations on the rows that already existed — **B-39/B-44** (the pregen
family, now sized) and **F-59** (the armour silence). This is a **living map**: whoever changes creator
plumbing keeps it current.

---

## PLAIN SUMMARY (for Jason)

Your belief was right: every creator ends at the character sheet, and the sheet is the hub. But the
census turned up something the plan did not assume — **there are not three creators writing sheets.
There are two creators, one frozen file, and a dev tool.**

- **Custom Build** assembles a sheet through one function (`normalizeCreated`).
- **Guided Build** does *not* use that function. It re-writes the same 28 fields by hand in a
  132-line block, and the two lists have drifted.
- **Quick Start (the 30 pregens) has no assembly code at all.** It is a JSON file on disk — a
  photograph of what the build pipeline produced on the day it was generated. The pipeline has moved
  on eleven times since; the photograph hasn't.
- A fourth path, a **dev-only generator at `/player?testbed`**, is what took the photograph. It still
  ships in the production bundle.

That explains the week's defects in one line: **the pregens aren't a creator's output, they're a
creator's output from the past** — so every field the assembly has learned to write since (Force
rating, species id, spec ownership, health bases) is simply missing from them, and the sheet has been
growing repair shims to cover for it one field at a time.

**The new find, and it is live.** The same mechanism as B-49, one field over. **11 of the 30 pregens
silently change a health threshold the first time the player buys a talent.** Buying a talent writes
`derivedBonuses`, which flips the sheet from "read the baked snapshot" to "compute it live" — and the
live path needs `woundBase`/`strainBase`, which no pregen carries, so it falls back to a default of
10. Lowhhrick the Wookiee drops **18 wound → 14** and gains 2 strain. C1 put a floor under Force
rating for exactly this reason; wound and strain never got one. Full table in §4.1 (**N-1**).

Three other things worth your minute:

- **A dead 14-line table.** `QB_DEFAULT_GEAR` has one reference in the codebase: its own definition.
  Zero consumers. It was superseded by `QB_LOADOUT_OPTIONS` and never removed.
- **A second armour is silently thrown away.** The one equipment builder both creators share keeps
  the *first* armour and drops the rest without a word. That's F-59's root, and it fails quietly.
- **`source` is spelled three different ways** for the same fact ('FullCreator' / 'custom' /
  'Original'), and one of them silently decides whether a player may edit their own backstory.

Nothing here is fixed. Everything is classified and priced below, and §5 is the contract R1's shared
assembly core has to satisfy.

---

## 0. WHAT THE DOORS ACTUALLY ARE

The scope ruling's §2 read the two `normalizeCreated` call sites as "Custom and Quick-Build." Measured,
they are **Custom and the dev test-bed**; Guided reaches `normalizeCreated` at no point. Recorded here
per **R-R0-3** (conformance is measured, not asserted) — the correction does not change the plan, it
sharpens R1's target.

| Door (landing card) | Component | Assembly | Persisted `source` |
|---|---|---|---|
| **Quick Start** `pregen` (app.jsx:180) | *none* — a carousel | **NONE.** `handleSelectCharacter` (:15540) `fetch`es `public/data/pregen_sheets.json` and sets it as the sheet verbatim | `'Original'` ×18, `'EotE/AoR/FaD Beginner Game'` ×4 each |
| **Guided Build** `quickbuild` (:190) | `QuickBuild` (:12923), ctrl `useQuickBuildController` (:12898), 6 steps (:12908) | **inline literal** `qbSheetData`, `handleQuickBuildComplete` :15334–15465 (132 lines) | `'QuickBuild'` |
| **Custom Build** `custom` (:201) | `FullCreator` (:6130), ctrl `useFullCreatorController` (:1515), 11 steps `FC_STEPS` (:1480) | `normalizeCreated` (:5264), called from a `useMemo` **inside `FCReviewStep`** (:5844); `handleFullCreatorComplete` (:15490) persists that memo verbatim | `'FullCreator'` |
| *(not a door)* **dev test-bed** `/player?testbed` | `TestBedScreen` (:13785), `window.SWRPGTestBed` (:5704) | `buildTestPc` (:5471) → `normalizeCreated` (:5582) **+ post-patches** (`FORCE_CAREERS` :5586, `applyTierUpgrades`) | inherits `'FullCreator'` — never overridden |

Two structural notes:

- **The Custom creator's persisted sheet is produced by a render-time `useMemo` in a review
  component.** `handleFullCreatorComplete` receives that memo as `displayModel` and stores it
  unchanged. The "preview" *is* the write. There is no separate finalize step.
- **The test-bed inherits `source: 'FullCreator'`** because `normalizeCreated` hardcodes the string
  (:5402). The shipped pregen file does not carry that value, so the file was edited after
  generation — meaning `pregen_sheets.json` is not reproducible from the tool that made it.

---

## 1. Q1 — INPUTS, per door

`✔` = read. `—` = not read. Registry loaders are shared and cache on `window`.

| Input | Custom | Guided | Quick Start |
|---|---|---|---|
| `loadCanonicalCharacterBuild()` (:5051) → `species` `careers` `specializations` `talents` `force_powers` `skills.vocab` → `window._canonicalCharbuild` | ✔ | ✔ | — |
| `loadCanonicalRegistries()` (:5031) → `weapons` `armor` `gear` → `window._canonicalRegistries` | ✔ | ✔ | — |
| `loadQuickBuildData()` (**index.html:464**) → 7 narrative-mechanics JSONs | ✔ | ✔ | — |
| `SWRPGSources.ready()` — the ACTIVE SOURCES index (:6166); in a copy whose book text was removed it also loads `own_words.json`, S3's labels (`SWRPGSources.ownWords`, argo-a1-export R-AE-7; never fetched on holocron.work) | ✔ | **—** | — |
| `window.SWRPGMods` variant overlay (inside :5051) + `swrpg-mods-changed` invalidator (:5106) | ✔ | ✔ | — |
| Guided static tables (:12285–12490) | — | ✔ | — |
| `public/data/pregen_sheets.json` | — | — | ✔ |
| `resumeDraft` ← `swrpg_creation_draft` | ✔ (:1521) | ✔ (:12901) | — |
| `window._canonicalCharbuildBase` (pristine, for stamp resolution) | ✔ | ✔ | — |

### 1.1 Findings in the input layer

- **`loadQuickBuildData` is misnamed.** It loads nothing QuickBuild-specific — seven
  narrative-mechanics JSONs consumed by *all* creator paths (obligation/duty/morality types,
  conflicts, morality pairs). Cosmetic; it misleads every first reader of the boot block.
- **Only Custom respects ACTIVE SOURCES.** `fcFilterActive` (:2304) and `SWRPGSources` appear at
  :2302–:6214 and in `FCGearBrowser` (:4804/:4836) — all Custom surfaces. Guided's boot (:12968) has
  three promises, not four, and its species/role/loadout offers are static tables, so a GM who
  deactivates a source still sees Guided offering its content. Harmless in outcome today (the tables
  are core-book only) — but it is an unguarded divergence, not a decision. _Since F-102's creator
  slice, Custom also WRITES the shelf from its own game-line step — the sources box
  (`FCSourcesBox` / `FCSourcesOverlay` / `FCSourcesOffer`), a second view of `SWRPGSources`, never a
  second store; see §3._
- **Guided's whole curated layer is keyed by display NAME or by legacy OggDude key, never by
  registry id.** Measured against the shipped registries, **every one of them resolves today**:

  | Table | Keyed by | Entries | Unresolved today |
  |---|---|---|---|
  | `QB_ROLES` (:12285) | career + spec **display name** | 12 careers / 12 specs | **0 / 0** |
  | `QB_SPECIES` (:12306) | species **display name** | 13 (of **408** in registry) | **0** |
  | `QB_SPECIES_DESC` (:12312) | — (duplicates registry `description`) | 13 | n/a |
  | `QB_DEFAULT_SKILLS` (:12341) | OggDude short key (`CHARM`…) | 12 careers | **0** |
  | `QB_AUTO_BUILD` (:12360) | talent `_source_key` + spec `_source_key` | 12 | **0 / 0** |
  | `QB_LOADOUT_OPTIONS` (:12391) | OggDude item key → `canonicalRefForSourceKey` (:5130) | 12 careers × 3 | 0 |
  | `QB_DEFAULT_GEAR` (:12375) | item **display name** | 12 careers | **DEAD — 0 consumers** |

  **THE SPECIES HALF OF THAT IS NO LONGER TRUE — F-67 armed it (2026-08-09).** This read "no
  registry name collides today either (species 124, careers 20, specs 129 — zero duplicate names),
  so the name-keying is a **latent** coupling with no guard." The Complete Species Guide import
  (ruling `csg-species-import-census` Amendment 1) took species to **408 records carrying 104
  duplicate names verbatim — 106 once the typographic apostrophe is normalised, which is the key the
  render dedupe uses (Pau'an and Twi'lek differ only by `'` vs `’`)** — deliberately: CSG's Barabel and the Menagerie's Barabel are two records, by design, and
  D-PS3 is satisfied because neither redefines the other's id. Careers (20) and specs (129) are
  unchanged and still collision-free.
  What that means for the tables above, measured rather than assumed: **all three name-keyed species
  paths still resolve the incumbent, and they do so for ONE reason — the CSG records are APPENDED,
  and `.find` returns the first match in registry order.** That is now a load-bearing property of the
  registry's ORDER, so it has a guard: `test/csg_import.cjs` asserts the append AND re-runs Guided's
  13 names through the same `.find` idiom. The three paths are `QB_SPECIES`' list build
  (`player/app.jsx:14671`), Guided's completion fallback (`:17204`), and `buildTestPc` (`:6107`,
  which keys on `_source_key`/`id` and cannot reach a CSG record at all — they carry no
  `_source_key`).
  The RESOLVE-BY-NAME half of the coupling — legacy sheets with no `speciesId` — was the defect
  C-CSG-6 fixed: `charResolve.buildNameIndex` marked any duplicated name `false`, so importing a
  second "Barabel" would have silently un-resolved every such sheet. All five species-by-name sites
  in `lib/shared/charResolve.js` now go through `speciesNameIndex` (`{incumbentWins:true}`); the
  strict collision rule is untouched everywhere else, which is what keeps the live talent homonym
  ("Temple Training" ×2) refusing rather than guessing.
  The rest of the name-keying is still a latent coupling with no guard, and still fails *silently*
  when it breaks: `QB_LOADOUT_OPTIONS`' bridge does `if (!ref) return;` (:5555) and drops the item.
- **Guided re-resolves species by NAME at assembly time** (:15341,
  `Object.values(...).find(s => s.name === speciesName)`) even though `handleSpecies` (:13002) already
  put `sp.id` on `character.species.key`. An unnecessary name round-trip in the live path; on a miss it
  silently defaults `wound/strain` to 10 and `xpPool` to 100. Same at :13015 for the career.

---

## 2. Q2 — OUTPUTS: the three-way sheet-field diff

**The classification (R0 §3 Q2).** `ALL` = written by both creators and present on all 30 pregens ·
`SOME` = a producer omits it · `NONE→READ` = no producer writes it, a reader consumes it ·
`DEAD` = written, read by nothing · `DISPLAY` = persisted in display shape where the law says id-ref.

Reader counts are measured over `player/app.jsx`, `lib/shared/charResolve.js`, `itemResolve.js`,
`crafting.js`, `craftStore.js` on `sheet.` / `sheetData.` / `displayModel.` prefixes (method + limits: §7).

### 2.1 The matrix

| Field | Custom | Guided | Pregen | Reads | Class |
|---|---|---|---|---|---|
| `name` | ✔ | ✔ | 30/30 | 19 | ALL |
| `species` | ✔ | ✔ | 30/30 | 17 | ALL · **DISPLAY** (name string) |
| `speciesId` | ✔ | ✔ | **0/30** | 4 | **SOME** |
| `career` | ✔ | ✔ | 30/30 | 16 | ALL · **DISPLAY** |
| `careerId` | ✔ | ✔ | **0/30** | 10 | **SOME** |
| `specialization` | ✔ | ✔ | 30/30 | 13 | ALL · **DISPLAY** |
| `specializationIds` | ✔ | ✔ | 30/30 | 4 | ALL |
| `book` | ✔ | ✔ | 30/30 | 13 | ALL |
| `source` | `'FullCreator'` | `'QuickBuild'` | 4 other strings | 2 | ALL · **unenumerated vocabulary** (§4.4) |
| `portrait` | ✔ | ✔ (always `''`) | **0/30** | 9 | **SOME** — `QB_PORTRAITS` is `{}` (:12331), so Guided's is structurally empty |
| `backstory` | ✔ | **—** | 30/30 | 6 | **SOME** |
| `motivations` | ✔ | ✔ (all four `null`) | 30/30 | 6 | **SOME** in substance — Guided has no motivation step |
| `characteristics` | ✔ | ✔ | 30/30 | 14 | ALL |
| `derivedBonuses` | ✔ | ✔ | **0/30** | 1 | **SOME** → the N-1 defect |
| `derivedConditional` | ✔ | ✔ | **0/30** | 4 | **SOME** |
| `forceRatingBase` | ✔ | ✔ | **10/30** | 7 | **SOME** → B-49, healed by C1's floor |
| `characteristicsAtCreation` | ✔ | ✔ | **0/18 measured** | 3 | **SOME** — B-736, new. The six characteristics as they stood when creation ENDED, and the ONLY characteristic source the wound and strain THRESHOLDS read (RAW freezes both there: EotE p.94 · AoR p.104 · FaD p.104 — further Brawn/Willpower increases do not move them; Toughened and Grit do). Written by `normalizeCreated`, so both creators and the OggDude import carry it; **stamped** post-creation by `creationCharacteristicsStamp`, which `buyTalent`'s Dedication branch calls in the SAME patch BEFORE it applies the +1 — the only post-creation writer of a characteristic, and the only site that could invalidate the frozen value. ABSENT = **pre-ruling, never zero**: the thresholds fall back to the LIVE characteristic, which reproduces exactly the number such a record reads today (Jason, ruling `threshold-freezing-shape` Addendum 1: freeze at migration, nobody loses the point). No load-time migration sweep, by ruling. Readers: `computeDerived` (the two thresholds only — `soak` and both defences stay LIVE, `forceRating` stays live and floored), `creationCharacteristicsStamp` (never re-stamps, so the frozen value cannot drift upward), `sheetToCreatorState` (B-754 / R-RTD-5: reads this block against the live one and carries the DIFFERENCE as `characteristicGainsAfterCreation`, which `normalizeCreated` subtracts back out — so finishing an EDIT IN CREATOR does not re-stamp the creation point at a Dedication-inflated value and lift the threshold; absent here means the gain is unknown, and it is `mark()`ed rather than invented), `FCReviewSheet`'s before/after pair (overrides it alongside `characteristics` so the "before" column keeps meaning *no starting XP spent*). Coverage cell is **0/18 measured against `public/data/pregen_sheets.json` as it stands** — no pregen carries it and none needs to, since none has Dedication so live == creation and the fallback is exact; note this column's other rows read `/30` from the R0 census and the file now holds 18, a pre-existing discrepancy this row does not attempt to reconcile |
| `woundBase` | ✔ | ✔ | **0/30** | 2 | **SOME** → **N-1** |
| `strainBase` | ✔ | ✔ | **0/30** | 2 | **SOME** → **N-1** |
| `xp` | ✔ | ✔ | **0/30** | 5 | **SOME** — pregens default to `{0,0,0}` (:11085) |
| `encumbrance` | ✔ | ✔ | **0/30** | 4 | **SOME** |
| `skills` | ✔ | ✔ | 30/30 | 10 | ALL · **DISPLAY keyspace** (§4.3) |
| `talents` | ✔ id-ref | ✔ id-ref | 30/30 **display** | 6 | ALL · **DISPLAY** on pregens (§4.2) |
| `specializations` (positional ownership) | ✔ | ✔ | **0/30** | 4 | **SOME** → B-29, healed at read |
| `forcePowers` | ✔ id-ref | ✔ id-ref | **18/30** | 10 | **SOME** — `[{id, basic, upgrades, owned?}]`; `upgrades` = one ability key per bought cell (a ranked upgrade repeats). **R7 B-1536 (ruling `release-r7-bug-burndown` ADDENDUM 269, R-Y2-1):** `owned?: ['row-col', …]` beside it names each bought cell, one per `upgrades` element in order (the talent / signature-ability idiom); absent or mismatched (`CharResolve.forcePowerOwnedProblems`) prices in tree order; `forcePowerEntryXp` is the one pricer; `powersFromCreatorState`, `sheetToCreatorState` and `migrateSheetForcePowers` carry it whole (`_withOwned`); writers the OggDude import and the sheet's `buyForceUpgrade`; full contract in `SHEET_PLUMBING.md` (the bought cells). **F-100 M10 (`f100-m10-build-card` steps 9 + 11, `lap/f100-m10-build`):** `CharResolve.powersFromCreatorState` now carries a creator-map entry's `upgrades` (it wrote `[]`, so re-entry deleted advancement-bought upgrades — B-1222, measured 6 of 6 by `scripts/f100_b1222_probe.cjs`), and the OggDude import puts each purchased cell's lowercased Key there (`SWRPGOggImport.forceUpgradeCells`, the one carry/refuse decision; an unmapped key is refused by name in the receipt, R-M10S-10). Their XP: `CharResolve.forcePowersXp(map, charbuild)` — basic `cost` + each bought key's CELL cost from the view's tree — is the ONE summer, read by `normalizeCreated` and the creator bar (`useFullCreatorController`, handed FullCreator's view). Guards: `test/f100_m10_b1222_xp.cjs`, `test/f100_m10_ogg_upgrades.cjs`. **F-100 M12 THE GRANT MARKER (`f100-m12-build-card` ADDENDUM 25, R-M12B-78/79; B-1246; `lap/f100-m12-build`), SAVE SHAPE on paper before its readers:** a saved entry may carry `granted?: "career" \| "bonus" \| "both"` (the list or lists a FREE creation pick came from; a Padawan/Master CHOICE pick is `bonus`, and a CHOICE pick on a power the career grant already gave makes the entry `both`; Master's two picks are two entries) and `granted_upgrade?: <ability key>` (the double pick's one free upgrade). The creator-map entry is `{cost: 0, basic: true, granted, granted_upgrade?}`. CONTRACT: (i) `granted_upgrade` only with `granted === "both"` and present exactly once in `upgrades` (`CharResolve.forcePowerGrantProblems` refuses otherwise); `both` without it is an unclaimed free upgrade, read as none, not refused; (ii) readers key on `granted`, NEVER on `cost: 0` — a `cost: 0` without `granted` reads as before (10); (iii) `forcePowerEntryXp`: a granted basic costs 0 and the first `granted_upgrade` occurrence is uncharged; a second purchase of that key pays its next cell; (iv) `sheetToCreatorState` keeps both fields at cost 0, never re-priced from row 0; `powersFromCreatorState` carries both. KEY-INDEPENDENT readers (R-M12B-79: a saved grant is a fact; the key never re-prices a character). THE WRITER (R-M12B-80 → **F-100 surfacing, `lap/f100-surfacing-creator-build` step 5; R-SCC-2, D-229 Q2 (a)**): the Force step's Career Powers section (`FCCareerPowers` in `FCForceSheet` / `FCForceSheetPhone`) asks the career's pair and the STARTING tree's in the `fcSpeciesOptionGroups` idiom; `fcCareerPowerState` reads the picks BACK OFF the map's markers (so re-entry shows them) and holds the commit ("Pick your Career Powers to continue") while a group is owed; `fcCareerPowerWrite` rebuilds every granted entry from the picks (a swap drops the old entry; a power bought at its price and then picked becomes the free entry), passes each through `forcePowerGrantProblems` before the one `SET_FIELD forcePowers` dispatch (a refusal writes nothing). A TOLD double (two named lists) writes `both` with NO `granted_upgrade` (R4); a CHOICE row (`upgrade_if_owned`) doubled on the career's power opens "<Power> · one free upgrade" over row 1's linked non-Mastery cells and writes `granted_upgrade` once in `upgrades`. Dark with M12's key OFF or without the fad-v1 pairs (nothing asked, nothing written). The legacy (transplant-OFF) Force step carries no section. Guards: `test/f100_m12_career_powers.cjs` (GM legs) · `test/f100_career_powers_pick.cjs` (the writer, R4 and fail-closed bitten) |
| `equipment` | ✔ id-ref | ✔ id-ref | 30/30 **display** | 16 | ALL · **DISPLAY** on pregens (§4.2) |
| `obligation` / `duty` / `morality` | ✔ | ✔ | 10/30 each | 9/7/10 | ALL (one per game line) |
| `mods` (conditional) | ✔ | ✔ | — | 9 | ALL — absent = vanilla, by design (R-Y2-1) |
| `speciesOptionPicks` (conditional) | ✔ | **—** | — | 5 | **SOME** — Guided offers no option-choice species |
| `specSkillChoices` (conditional) | ✔ | **—** | — | 4 | **SOME** — deliberate, documented unreachable (:13022) |
| `speciesSkillChoices` (conditional) | ✔ | **—** | — | 3 | **SOME** — F-100 surfacing, ruling `f100-cerean-intellectuals-card` R-CI-2 as ruled by ADDENDUM 2 Q1 (b) @ `73dbf7718` (the pool-ID key), `lap/f100-cerean-intellectuals` step 2 @ `080974e56`: `{ <speciesId>: { <poolId>: [<skillId>, …] } }` — a species' `career_skill_choice_grants` picks (the Cerean's Intellectuals: two Knowledge skills as CAREER status, no rank), `poolId` exactly as the spec twin `specChoiceSkillsFor` computes it. Absent = no pick made = nothing granted (fail closed). **WRITTEN BY the species step's commit only** (Half B, card ADDENDA 6–7, `lap/f100-cerean-intellectuals` step 3 @ `159d9e942`): `handleSpeciesConfirm(sp, optionPicks, careerPicks)` → `fcSpeciesSkillChoicesFor` → `{ [sp.id]: { [poolId]: [ids] } }` for the committed species only (a re-species leaves no stale pick; `{}` with no pick, which the save drops); untouched for a species with no career pick and no saved map. The DRAFT is `fcCareerPicks` (FullCreator state, keyed `groupIdSlug(name)`, seeded from the record on species change), drawn by the species step's own renderers over `CharResolve.speciesCareerPickGroups` (never appended to `option_choices`, D-CI4) and held on both hosts while owed (`fcSpeciesOwedGroups`). Guided offers no pick (—). Readers: `careerSkillStatus` (through `speciesChoiceSkillsFor`, `because 'species-choice:<speciesId>'`), the creator's career-status view (`creatorCareerStatusIds` and its four callers), the sheet's ask (`speciesUnansweredGroups`, the career group DEFERRED until two are honoured), the why-sheet (`m7CareerLine`'s `species-choice` source), and the carry both ways — `normalizeCreated` and `sheetToCreatorState` (as `rules_seen` / `entitlements` are carried). **Re-entry (B-1392, fixed in this lap at card ADDENDUM 10 C1):** `sheetToCreatorState` holds the species' fixed grant where the species step does (`purchased`) and DERIVES `speciesGrantApplied` from the saved sheet (the fixed grants of its own species and picks that its ranks hold), so a re-commit keeps the ranks, a species change swaps the grant, and a legacy save without the rank is granted it once (guard G14, bite REGRANT) |
| `creationBuyouts` (conditional) | ✔ | **—** | — | 3 | **SOME** — Guided has no XP-spending step, so it can offer no buyout. Written only when a species-penalty buyout is TAKEN (R-SFC-2, lap `creation-buyout-surface`); `{ <ability-name-slug>: { xp } }`. Absent = nothing bought, which is every save made before it existed. Readers: `speciesAbilityGrants` (omits the bought-out ability), `normalizeCreated` (charges the XP audit), `sheetToCreatorState` (restores it on re-entry) |
| `signatureAbilities` (conditional) | ✔ (carried) | **—** | **0/30** | — | **SOME** — F-100 M12 B-1244 (`f100-m12-build-card` R-M12B-8, `f100-m12-census-card` R-M12C-39, `lap/f100-m12-build`): `[{id, tree, owned: ['row-col', …]}]`. The creator WRITES none (no creation purchase); `normalizeCreated` carries `character.signatureAbilities` through (deep copy, absent-tolerant) and `sheetToCreatorState` hands it back on re-entry. Written by the OggDude import: `SWRPGOggImport.sigAbilityCells` (the one carry/refuse decision per bought cell; the base's four cells fold to `0-0`; a named fill's `replaces` key maps to the fill), then `settleSigAbilities(out, sheet, charbuild)` on the made sheet — `CharResolve.sigAbilityChecks` (V1–V7), what fails left off and named on `oggSource.report.sigAbilities`. **CHARGED (D-229 Q1 (a); creator concept ADDENDUM 18 C1 (a)) — R-M12C-36's "never charged" superseded:** the sheet's ONE writer `buySigAbility(id, tree, cell)` (SheetAdvancement, beside `buyForceUpgrade`) writes the entry/cell from `CharResolve.sigBuyPlan` (V0–V7 in `SIG_WORDS`' words, an owned cell, an `inferred` cost held, the key OFF — all refused) with `xp` spent + the record's cost; `normalizeCreated`'s `xp.spent`/`remaining` and the creator's `xpRemaining` re-sum it through the ONE summer `CharResolve.sigAbilitiesSpend` (every OWNED cell, standing or not; 0 with M12's key OFF, so an imported sheet's spent never moves while it is OFF), so re-entry keeps it. Guards: `test/f100_m12_ogg_sig.cjs`, `test/f100_sig_abilities_spend.cjs`, `test/f100_sig_buy.cjs` |
| `entitlements` (conditional) | ✔ (written) | **—** | **0/30** | 3 | **SOME** — F-100 surfacing (`f100-surfacing-creator-concept` R-SCC-3; D-229 Q1 (a) ii, LIVE; brief §3.1, NEW member on paper; `lap/f100-surfacing-creator-build` step 6): `[{id, declined: true}]` — the starting entitlements a player DECLINED, written by the gear step's Decline tick (`FCEntitlementPlate`, `fcEntitlementToggle`) ONLY while ticked; unticked → the field goes (absent = granted). The words resolve at render from the career record's `starting_entitlements` through ONE reader `fcEntitlementLines` (the gear step, the review's repeat under Credits, and the sheet GEAR card's "<name> (starting entitlement)" — a granted entitlement only; nothing when declined, R6); an id the career does not carry is ignored. `normalizeCreated` carries it (deep copy, absent-tolerant, the `signatureAbilities` idiom) and `sheetToCreatorState` hands it back. Carriers by script: 21 careers, ONE (`bounty_hunter` → `ipkc`). Guided and the pregens write none. Guard: `test/f100_entitlement_roundtrip.cjs` (the carry bitten) |
| `treelessTalents` (conditional) | ✔ | **—** | — | 3 | **SOME** — a talent bought OUTSIDE any spec tree, which only the Short Path to Power does today (Collapse of the Republic: 30 XP → a Force Rating rank, before a spec exists — lap `short-path-to-power`, R-SPP-9). `[ { id, xp, source } ]`, ONE entry per rank (rank is the count, not a field). Absent = no treeless purchase, which is every save. Readers: `normalizeCreated` (emits it from `character.talents` entries by STRUCTURE — `specKey === '__treeless__'`, the sentinel both legs write — never by the `source` label; C-SPP-1/R-SPP-12), `sheetToCreatorState` (rebuilds the synthetic `character.talents` entry so the rank + its price survive re-entry — the round-trip failure the field exists to prevent). Force rating still DERIVES from the rebuilt talent; `source` is recorded provenance, read by no resolver and never deciding whether the fact is saved (a `source`-keyed emitter silently drops every entry a future writer / importer labels differently — the C-SPP-1 defect) |
| `derived` (legacy snapshot) | **—** | **—** | **30/30** | 3 | pregen-only; the R-DAR1 fallback branch |
| `speciesAbility` | **—** | **—** | **3/30** | 8 | legacy fallback only (B-47 Lap A) |
| `id` | **—** | **—** | 30/30 | 0 | pregen-only; the roster record owns identity elsewhere |

### 2.2 `NONE→READ` — the at-table fields (correctly sheet-owned)

No creator writes these; the sheet writes them after creation, and every one has a writer. Listed so
R1's core can show them as **deliberately external** (R-R0-1):

`playerName` · `appearance` (incl. `notableFeatures`) · `notes` · `currentWounds` · `currentStrain` ·
`criticalInjuries` · `conditions` · `aimStack` · `crafts` · `craft_notes` · `gameLine`

One shape divergence, inert: the working state nests `identity.playerName` while the sheet keeps
`playerName` top-level — no creator writes either, so nothing observes it.

**NOT A CREATOR'S TO CARRY, since F-100 M13 Lap C.** F-45's door, and with it `SHEET_OWNED_FIELDS` and `carrySheetOwned` (B-1408, D-271),
was deleted at R-M13B-103: nothing rebuilds a played character from a creator draft any more. Modify this Character edits the record in place, so these
fields are never dropped. `CharResolve.SHEET_OWNED_XP_FIELDS` and `sheetOwnedXpSpend` stay; `test/release_r6_rewards_ogg_io.cjs` holds them. `test/b1408_sheet_owned_fields.cjs`
keeps the writer census and R-M13B-8's pin of `attachPlan`.

### 2.3 `DEAD` — written and read by nothing

> **R-F60-1 — STANDING (ruling `f60-subtraction`, 2026-07-30): this table counted READERS. A deletion
> needs READERS, WRITERS and MENTIONS.** F-60 removed all four rows below and found that three carried
> dependents this table never recorded: `damageTotal` is named in **ADR 0004** as part of a ruled
> contract · `xpLedger` had **three writers** in the dev test-bed, so removing the field alone would
> have crashed it · the narrative ids had **three orphaned reducer branches** with zero dispatchers.
> The reader counts here were honest and their floor was stated (§7) — the floor was real. Before any
> future row here is called a one-line deletion, sweep writers, docs, ADRs and schemas too.

| Symbol | Where | Evidence |
|---|---|---|
| `QB_DEFAULT_GEAR` | app.jsx:12375, 14 lines | **1 reference in the repo: its own definition.** Superseded by `QB_LOADOUT_OPTIONS`. |
| `damageTotal` | set in `resolveSheetEquipment` :5196 | 3 mentions, all at the write site + its comment. Its stated consumer was the encounter POST; **the encounter system was removed** (`189e24e`). |
| `character.xpLedger` | `createEmptyCharacter` (index.html:294) | written only by the dev test-bed (:5566, :5698–5699); `sheet.xpLedger` has **0 readers**. Neither creator writes it. |
| `character.narrative.backgroundId` / `hookId` / `motivationId` | index.html:289 | declared in the working shape; **no creator writes them**, no assembly carries them. |
| `character.pocketMoney` | index.html:299 | *not* dead — folded into `credits` by both assemblies (:5297, :15366). The field itself never persists. |

### 2.4 The Custom↔Guided drift, isolated

Guided's 132-line literal reproduces Custom's field list with these differences, and only these:

1. **omits `backstory`** (no step) · 2. **omits `speciesOptionPicks`** · 3. **omits `specSkillChoices`** ·
4. `portrait` structurally `''` · 5. `motivations` always four `null`s · 6. `forceRatingBase` computed by
its own 8-line IIFE (:15419) that reads species abilities + `gameLine`, **not** the career — Custom's
B-20 career detection (:5389) has no Guided counterpart · 7. `forcePowers` from a **second hardcoded
career→power map** (`QB_FORCE_POWER_IDS` :15447) duplicating `FORCE_CAREERS` (:5586) in the test-bed ·
8. `xp`/`encumbrance`/credits arithmetic re-derived inline rather than shared · 9. `specSkillChoices`
absent means the third career-status derive site is knowingly incomplete (:13022, documented
unreachable).

**Career status since F-100 M7** (`lap/f100-m7-build` @ `1319c763`, R-M7K-7): the creator's four status sites (`fcCareerStatusIds`, the spec gate,
`FCSpecDetail`, QuickBuild) no longer union by hand. Each calls `creatorCareerStatusIds(cb, careerData, specId, st)`,
which builds a sheet-shaped view of the creator state and asks `CharResolve.careerSkillStatus` (the sheet's own union)
with that one spec. So C1's fixed grants and a species' `as_career` (B-1034) count in the creator as on the sheet. Item 9
is unchanged: the view is only as complete as the state it is handed. The creator's skill pickers print the vocab's BASE
characteristic (`CharResolve.skillBaseCharacteristic`, R-M7K-9); `SKILL_CHARS` is deleted.

Item 6 is the one with teeth: **a Force-granting career reached through Guided depends on
`gameLine === 'fad'`.** Custom fixed that under B-20 by reading the career's own `force_rating`.

---

## 3. Q3 — SIDE CHANNELS

| Channel | Key / global | Written by | Notes |
|---|---|---|---|
| Creation draft | `swrpg_creation_draft` (:13223) | both creators, on every state change | accepts `flow` `'custom'`\|`'quickbuild'` only. **Custom's draft embeds whole registry records** (`speciesData`, `careerData`, `specData` :1543) — a registry edit or a mod-toggle flip mid-draft resumes against **stale copies**. Guided stores only its own role/species records (:12913). |
| Roster | `swrpg_saved_characters` | `upsertSavedCharacter` (`lib/shared/roster.js`, both apps, R-SCGS-1) · `openSheetRecord` (`lastOpenedAt`) · `handleReorderRoster` (`order`) | record = `{id,name,species,career,book,accent,source,selectedChar,sheetData,savedAt,updatedAt,lastOpenedAt?,order?}` — **the picture is stored ONCE, at `sheetData.portrait`** (B-931, ruling `paper-b931` R-PB9-1..5): `upsertSavedCharacter` folds the copies it is handed (`SWRPGRecordPortrait.foldRecordPortrait`), writes SD and drops the record-level `portrait` and `selectedChar.portrait`; older records keep their copies until their owner's next write, and every reader goes through `recordPortraitOf`. **`source` here is a THIRD vocabulary**: `'custom'`\|`'quickbuild'`\|`'pregen'`. `lastOpenedAt` is stamped by the ONE sheet opener (B-407) and leads the roster's three-field sort. **`order` (optional integer) is the player's ARRANGED position** — the paper landing's index writes it on every record 0..n−1 on a move and the sort honours it whenever any record carries one; a new character appends (max+1) only on a roster that already carries the field, and `upsertSavedCharacter` CARRIES IT FORWARD on an existing record (the record is rebuilt on every sheet edit, so without that an arrangement would not survive the next autosave). Ruling `landing-front-matter-concept` R-LFM-12 / A4, B-649 |
| Roster pre-migration backup | `swrpg_saved_characters_pre3b` | `SWRPGRoster.backupRoster` (`lib/shared/roster.js`), its one home: the boot migration and sync's merge writers (`adopt`, `recheck`, the 409, `recompare`, through `canonFor`'s `backup`) | one-time, ruling condition 2 of D-3B4, never updated; refused, no migrated form is written. **A limit, accepted (`release-r7-bug-burndown` ADDENDUM 489 item 2):** a device already migrated with no backup, and the account legacy at the same stamp: the compare closes the question, no backup is taken since this write changes no local form, and the account takes id-refs. A question that stands leaves the account's copy |
| Boot self-heal | — | `CharResolve.migrateRoster`, called only by `migrateStoredRoster` (`player/app.jsx`) | name→id migration of `talents`/`forcePowers` across the whole roster, at mount AND when a record lands (sync's three events, the roster `storage` event: B-977, ruling `release-r7-bug-burndown` ADDENDUM 81). Warm-or-wait on the charbuild's promise; a no-op writes nothing. A migration is not an edit: it never moves `updatedAt`, stamped or not, and neither do `loadSavedCharacters`' two load repairs (the double-nest lift, the B-250 XP repair); only a user's edit moves the clock (ruling `release-r7-bug-burndown` ADDENDUM 453, superseding C-B-8.1 at these seams). **Sync compares migrated forms (B-1692, ADDENDA 484, 486):** the player app names this build to sync (`SWRPGSync.setCanon`), and the merge runs `SWRPGRoster.canonRecord` on a copy of each side, so a migration alone asks nothing. Cold, the merge takes today's rule; after this path's body `SWRPGSync.recompare` closes any question no longer standing and ends the sheet's hold. **The one-time backup (`swrpg_saved_characters_pre3b`) has one home, `SWRPGRoster.backupRoster`:** this path and sync's canon (`canonFor`'s `backup`) both take it before writing a migrated form; refused, neither writes one (ADDENDUM 488 R1) |
| Tombstones | `swrpg_deleted_ids` (:13248) | delete (`removeSavedCharacter` → `addDeletedId`, `lib/shared/roster.js`) | prevents resurrection from a stale record |
| Last sheet | `swrpg_last_sheet_id` | sheet nav | 7 refs |
| Active sources shelf + variants toggle | `swrpg_active_sources` · `swrpg_mods` | the SOURCES BOX on the game-line step (F-102 creator slice: `FCSourcesOverlay` rows through `SWRPGSources.setBook` + `save`; variant rows through `SWRPGMods.setActive`; the A6 offer's TURN ON through `setBook` per unofficial book + one `save`) | The creator's first WRITE to the shelf. Same store, same `setBook` refusal (last core), same broadcasts (`swrpg-sources-changed`, `swrpg-mods-changed`) as the Settings panel, so every catalog re-filters live. Every figure the box prints is derived at render (`SWRPGSources.attribution*`, `SWRPGMods.variantCounts`); `test/sources_box_no_typed_numbers.cjs` holds it so. |
| Sheet export | file download, schema `swrpg-character-sheet` v1 (:7406) | `downloadCharacterJSON` | **write-only — there is no importer anywhere in the repo.** This is F-45's gap in one line. |
| Mobile export stash | `window.__lastCharacterJson` (:7420) | same | mobile can't double-download; payload parked on `window` + a console line |
| Test-bed bundle | file download, schema `swrpg-test-bed-bundle` (:13840) | `TestBedScreen` | how the pregens were made |
| Registry globals | `window._canonicalRegistries`, `_canonicalCharbuild`, `_canonicalCharbuildBase`, `_canonicalRegistriesPromise`, `_canonicalCharbuildPromise`, `_canonSourceKeyMap`, `_qualitiesDb` | loaders | fetch-once/cache-on-window; `clearCanonicalLoadCaches` (:5116) exists because a cached *null* was a dead builder until reload (B-27) |
| Other player keys, not creator-touched | `swrpg_table_mode`, `swrpg_rail_module`, `swrpg_profile_v1`, `swrpg_player_active_session`, `swrpg_dice_odds`, `swrpg_dice_interpret` | — | listed for completeness |

**A dev route ships to production.** `/player?testbed` mounts `TestBedScreen`, which generates and
downloads 12 sheets. `window.SWRPGTestBed` is assigned unconditionally at module scope (:5704). Not a
security matter (it writes no storage), but it is a live producer of sheet-shaped JSON reachable by URL.

---

## 4. Q4 — THE CONFORMANCE LIST

Laws checked: **id-refs + resolve-at-render** · **one shared core (no-compromise-mirror)** ·
**loud/graceful** · **derived-never-persisted**.
Classes: `HEALED` (shim downstream — retirement condition given, R-R0-2) · `R1` (the assembly-core lap) ·
`OWN LAP` · `OK/REASON`.

### 4.1 N-1 — NEW, LIVE: 11 of 30 pregens change a health threshold on their first talent buy

**Class: OWN LAP (a board row).** Not a heal candidate — nothing heals it today.

`computeDerived` (charResolve.js:470) has two branches (R-DAR1). No `derivedBonuses` → return the
baked `derived` snapshot. With `derivedBonuses` → compute live, where
`woundBase = sheet.woundBase != null ? … : 10` (:502-503). All 30 pregens ship **without**
`derivedBonuses`, `woundBase` or `strainBase`; `buyTalent` (:11274) writes `derivedBonuses` +
`derivedConditional` and **not** the bases. So the first talent purchase flips the branch and the
character's species health bases are replaced by 10.

Reachable through the normal pregen progression: a pregen has no `xp`, so `availableXp` is 0 (:11085)
until XP is awarded — which the ADVANCEMENT XP hero offers (:11140). Award XP → buy a talent → the
thresholds move.

Measured (snapshot vs the post-flip value), 11 affected characters:

| Character | Species | Wound | Strain |
|---|---|---|---|
| **Lowhhrick** | Wookiee | **18 → 14 (−4)** | **10 → 12 (+2)** |
| Silas Venn | Falleen | 11 → 11 | **14 → 12 (−2)** |
| Dao Jodh | Zabrak | **14 → 13 (−1)** | **14 → 13 (−1)** |
| Vendri | Duros | **13 → 12 (−1)** | 12 → 12 |
| Tarak Nol | Duros | **12 → 11 (−1)** | 12 → 12 |
| Wicket | Ewok | **10 → 11 (+1)** | 12 → 12 |
| Orin Vael | Muun | **11 → 12 (+1)** | **10 → 11 (+1)** |
| Oskara | Twi'lek | 12 → 12 | **13 → 12 (−1)** |
| Kael Voss | Weequay | 13 → 13 | **11 → 12 (+1)** |
| Gron Torrek | Weequay | 14 → 14 | **12 → 13 (+1)** |
| Lyra Kess | Bothan | 11 → 11 | **13 → 12 (−1)** |

In every case the **snapshot is correct** — it equals `species.wound_threshold_base + brawn` from the
registry — and the default-10 path is the wrong number. Same remedy shape as B-49: write the bases at
source, or floor at read. **C1 floored `forceRating` for exactly this mechanism; wound and strain have
no floor.** (Recorded, not fixed — R0 §3 Q4.)

### 4.2 Pregen `talents` + `equipment` are persisted DISPLAY shapes

**Class: HEALED.** Law broken: id-refs + resolve-at-render.

- `talents[]` entries are `{name, description, descriptionRaw}` with verbatim FFG prose and no `id`.
  Shim: `resolveTalentEntry`'s non-canonical branch (charResolve.js:76-77) stamps `_legacy: true` and
  passes through. Boot's `migrateRoster` (:15051) can promote them by name once saved, but the shipped
  file itself is never rewritten.
- `equipment.weapons/armor/gear` entries are `{name, skill, damage, crit, range, qualities}`. Shim:
  `resolveSheetEquipment`'s `else if (entry && entry.name)` passthrough (:5199/:5210/:5221). Consequence:
  a pregen's gear never picks up a registry correction and never resolves attachments.
- **Sizing for the id-ref conversion** (this is what B-39/B-44 will need): of **50 pregen weapon
  entries, 14 are not name-resolvable** against the canonical registries — `Fists` ×8 (a RAW unarmed
  profile, not a catalogue item), plus `Light Blaster`, `Hvy Blaster Pistol`, `AV Grenade`, `AP Grenade`,
  `Walking Stick`. **Of 30 armour entries, 7 are not resolvable** — `Heavy Clothes` ×4 (the registry
  says *Heavy Clothing*), `Droid Chassis`, `Armored Vest`, `Flight Suit`. No Brawn-relative damage is
  mis-baked (checked: 0 cases).

**Retirement condition (R-R0-2):** these two shims die when `pregen_sheets.json` carries canonical
id-refs — i.e. when the **F-EDS-6 pregen family (B-39 + B-44)** lands (**DONE 2026-07-30**; the
"~21 unresolvable" estimate below was superseded by measurement — see §4.9 and §8 row 2), with the ~21 unresolvable
entries above either aliased or ruled out-of-catalogue.

### 4.3 Skills persist under the legacy OggDude keyspace

**Class: HEALED (a permanent "temporary" bridge).** `skills` is `{CHARM: 2, PILSP: 1, …}` on every
producer, not canonical skill ids. The bridge is `skillSheetKeys`, built in
`loadCanonicalCharacterBuild` (:5077-5081) from each vocab entry's ALL-CAPS alias, "verified 35/35",
with the in-code note *"3b migrates the save shape; until then this is the canonical-id → state-key
bridge."* 3b shipped; the migration did not.

**Retirement condition:** dies when the save shape moves to canonical skill ids — which is a
save-shape change and therefore **owes an R-SY4 halt before any code**. Not R1's business unless R1
is explicitly scoped to carry it.

### 4.4 `source` is three vocabularies, and one of them gates a user affordance

**Class: OWN LAP (small).** The same fact is spelled:

| Where | Values |
|---|---|
| `sheet.source` | `'FullCreator'` · `'QuickBuild'` · `'Original'` · `'EotE/AoR/FaD Beginner Game'` |
| roster record `source` | `'custom'` · `'quickbuild'` · `'pregen'` |
| `sheetSource` state | `'custom'` · `'quickbuild'` · `'pregen'` |

`normalizeCreated` **hardcodes** `'FullCreator'` (:5402), so the dev test-bed's output is mis-stamped by
construction. And at :10656:

```js
var isEditable = sheet.source === 'FullCreator' || sheet.source === 'QuickBuild' || !existingBackstory;
```

Every pregen carries a backstory and a `source` outside that pair, so **backstory is read-only on all
30 pregens.** It is implemented as an unenumerated string comparison, so any future producer that stamps
a new `source` silently inherits read-only. This is an enum's-legal-values question: **R-SY4 class** (a
vocabulary's semantics), per R-Y2-1.

**RESOLVED — board row B-58.** The contract half is ruled (`creator-plumbing-census` §3): `source`
becomes a declared vocabulary behind a named predicate. The product half is answered — **Jason,
2026-07-29: YES, a player can edit a pregen's backstory**, so the predicate is permissive and
`isEditable` stops keying on `source` for this purpose. (This census had leaned the other way; the
overrule is recorded because the reasoning matters: the roster copy is the player's own character.)
Verified while recording it: the shipped prose stays recoverable — `handleSelectCharacter` (:15542)
re-fetches `pregen_sheets.json` on every carousel pick and `autosavePregenIfNew` (:15529) early-returns
on an existing id, so an edited roster copy is never clobbered and the original is one re-pick away.

### 4.5 A second armour is silently discarded at assembly

**Class: R1** (and it is F-59's root). `buildCanonicalEquipment` (:5151), the ONE shared equipment
builder both creators use:

```js
if (section === 'armor') { if (!armorRef) { armorRef = { id: id }; … } }
```

The first armour wins; every later armour is dropped with no message, no marker, and no ledger entry —
the player paid credits for it. Law broken: **loud/graceful** (this is silent). Note the sheet's
`equipment.armor` is a single ref, so this is a save-shape question too: **F-59 already carries its
R-SY4**, and this census's contribution is that the current behaviour is a *silent loss*, not merely a
missing feature.

### 4.6 `mechanic.tradeIds` is computed and thrown away — G9

**Class: R1** (ratified, sequencing ruling item 3). `computeMechanic` returns `tradeIds: uniqueIds`
(index.html:523). Both assemblies persist only `mechDisplay` = `{type, value, description, entries}`
(:5302, :15375) — the *net effect* survives, the *picks* do not. Re-entry (F-45) cannot show a player
which trades they took.

Scoping note: **Guided passes `selectedTradeIds` as a hardcoded `[]`** (:13098) — it has no trade step.
So `sheet.mechanicTradeIds` is meaningful for Custom and always `[]` for Guided. Write it from both
anyway (absent vs empty is a distinction R1 should not have to guess).

**THE STARTING PURSE HAS ONE READER** (F-100 M9, `f100-m9-shapes-card` R-M9S-5/12, `f100-m9-build-card` R-M9B-3):
`CharResolve.startingCredits(adjust, speciesRec, picks, buyouts)` → `{ purse, after, rows }` (F-100 THE SURFACING
MISSION: ruling `f100-surfacing-creator-concept` ADDENDUM 4 FLAG 1 (ii), ADDENDUM 11 R2, ADDENDUM 18; B-1315's reader
half). `purse` = 500 + the creation adjustment + every species `starting_credits_delta` WITHOUT `timing` (spendable at
creation; a CSG Anomid's Vast Wealth +1,100); `after` = the deltas timed `"after_creation"` (the Muun's Deep Pockets
+1,000, Endless Vigil p.21 — "they may not spend these credits during character creation"); `rows` name each delta's
owner for the gear step's because line. **FIVE sites read it, and nothing else sums a purse:** `normalizeCreated` (adds
`purse + after` ONCE — the saved sheet's credits, unchanged for every species), `buildTestPc` (`gearLedger.startingCredits`
/ `.credits` ← `purse`), FullCreator's mechanic step and QuickBuild (`SET_CREDITS` ← `purse`), and the creator controller's `credits` memo (`total` ← `purse`, which the gear step's Starting line,
every `data-creator-purse` and the over-budget guards read). **Until 2026-10-20 the memo summed its own `500 + trade`
with no species term** — a second sum, which happened to give the Muun RAW's 500 and gave a CSG Anomid 500 instead of
1,600. The delta walk is the species record's (`speciesAbilitiesResolved` + the buyout drop), as is the gear step's
encumbrance delta (`speciesEncumbranceDeltaOf`, into `fcGearEncumbrance`). Both read live (the species key is
deleted, `release-r7-bug-burndown` ADDENDUM 638). Guard: `test/f100_purse_reader.cjs` (the split, the six
sites, the save, and 0 saved numbers moved over all 537 species). The three `startingCredits: 500` initializers are
R-M9S-12's, not code sites. **THE GROUP'S 1,000** (R6 lane D, `release-r6-party-c0` R-R6PC-2 read 3, ruling
`release-r6-bases-registry` Q6 (c)): an optional fifth argument `who` (the character) adds AoR Core p.111's 1,000
credits, one row `{ ability: 'Base of operations', species: <the group's name> }`, when `who` is a MEMBER (`char:<its
id>`) of a group whose `resource` is `{from: 'aor', pick: 'base'}` — read through `CharResolve.groupGrants`, never
stored. `normalizeCreated`, the controller's `credits` memo and the mechanic step pass the character; the pregen, Guided
and QuickBuild sites (new characters only) pass none. A new character's draft id is no group's member, so it reads 500
(the told cost of Q6 (c)). Guard: `test/group_reads.cjs` R5.
**THE BECAUSE LINES READ THE SAME WALKS** (F-100 surfacing step 8, R-SCC-6 as errata'd, ADDENDUM 18 Q4, D4): the gear
step prints each `startingCredits(...).rows` entry under Starting (desktop rail) or in the lead sentence (phone) —
"+1,000 after creation — Deep Pockets (Muun)", "+1,100 — Vast Wealth (Anomid)" — and each
`CharResolve.speciesEncumbranceRowsOf(rec, picks, buyouts)` entry under Carried ("−2 — No Hands (Fefze)"), one formatter
`fcBecauseLine`. `_speciesEffectSumOf` now SUMS `_speciesEffectRowsOf` (one walk, the rows its owners), so the limit and
its because cannot disagree. The sheet BUILD lap's sheet-side `speciesEncumbranceRows` names the same rows off a sheet;
whichever merges second rebases onto one walk. **THE MENTOR PRICE** (step 7,
R-SCC-5): `ForcePowerBuyList`'s paper row prints "Learn · N XP (Mentor −D)" and "A career power — Mentor discount (FaD
p.109)" where `forcePowerBasicCost(rec, careerPowerPriceCtx)` is below the printed row-0 price — the gap is the discount,
never a typed −5. Guard: `test/f100_creator_becauses.cjs`.

**B-744's reverse half (ruling `reentry-trade-deltas-shape`, R-RTD-1..7) ended with F-45's door at R-M13B-103.** The record at `db3da1a65` is the history: `sheetToCreatorState`'s third argument, `loadMechConfig`, and re-entry's stamp scope (R-M6G-2). What outlives it:
- `tradeDeltas` is `computeMechanic`'s one summation.
- `window._narrativeMechConfig` is stashed by `loadQuickBuildData`; `ModifyHost` calls that, and the page and `charModify.js` read it (R-M13B-102).
- `gameData.stampMods` has no writer in the app now. `creationStampsFor` still honours a caller that passes it, and `test/b1161_homebrew_copy.cjs` pins that; the gate flags this.
- `characteristicGainsAfterCreation` and `dedicationCarried` keep their readers, because a draft written before the deletion can still carry them (R-M13B-107).

### 4.7 The Custom assembly lives inside a render memo

**Class: R1.** `normalizeCreated` runs in a `useMemo` in `FCReviewStep` (:5844) and that object is what
persists. Law broken: **one shared core** — arguably satisfied (one function), but the *finalize* is a
render artefact, so the write path and the preview path cannot be separated, versioned, or tested apart.
R1 should give the assembly a home that is not a component.

### 4.8 Display strings persisted alongside id-refs (D-3B2's "until 3c")

**Class: OK/REASON, with a note.** `species`+`speciesId`, `career`+`careerId`,
`specialization`+`specializationIds` are all dual-written. The in-code rationale (:5369) is explicit:
additive by design, strings kept "for out-of-cluster readers until 3c," ids authoritative where both
exist. The strings are load-bearing today — they are what lets a pregen with **no `speciesId` at all**
resolve, via the name index in `speciesAbilityGrants` (charResolve.js:385) and `speciesTalentGrants`
(:404). Keep them; note that "until 3c" has no owner.

### 4.8.1 The one price core (F-100 M13, R-M13L-8)

`CharResolve.buildPrice(part, args)` prices every build change, by part: `characteristic`, `skill`, `talent`, `specialization`, `force_basic`, `force_entry`, `signature`. The creator's inline figures were lifted into it, and `SWRPGModify.price` prices only through it. The creator calls it for characteristics, skills and talents. For specializations and basic powers its wrappers `costForNewSpec` and `basicForcePowerCost` keep calling `CharResolve.costForNewSpec` and `CharResolve.forcePowerBasicCost` by name, because the creator's guards pin those lines; `buildPrice`'s two parts are those same functions. A second price path is a defect (guard `test/f100_m13_price_core.cjs`).

**`freeRanks` at finish (`f100-m13-reach-paper` §4).** `normalizeCreated` reads the creator's `freeCareer` and `freeSpec` skill labels and writes `sheet.freeRanks`, `{ career, specs: { <first spec>: [...] } }`, when any are labelled. `SWRPGModify` reads the record only through `CharResolve.freeRanksOf`. The ranks in `sheet.skills` don't change, and the creator's own state still holds the labels.

**`modifyWords`.** The creator's motivation step (`FCMotivationStep`) takes an optional `modifyWords: { back, use, none }`. When set, its back link and commit read those words. The Modify page also passes empty `steps` and `soFar` with `stepTotal: 1`, which with `modifyWords` turns off The Build, So Far, the step wave, the step count and FaD's "Edit on the Morality step." (R-M13B-27 item 4). When absent, the creator is unchanged.

### 4.9 The heal-at-render inventory, with retirement conditions (R-R0-2)

> **R-R0-4 — STANDING (ruling `creator-plumbing-census` §4, 2026-07-29): this table is the RETIREMENT
> LEDGER.** Any lap that fixes a shim's upstream cause **retires the shim in the same lap and cites its
> row here.** Shims that outlive their cause are how the next N-1 happens.

| Shim | Site | Covers | Dies when |
|---|---|---|---|
| Species-ability derivation | `speciesAbilityGrants` (charResolve.js:381), `speciesAbilitiesForDisplay` (:5253; through the sheet's stamp view since F-100 M9, B-1194) | 27/30 pregens carrying no `speciesAbility` | **never** — this is the correct posture (derive, don't persist). `sheet.speciesAbility` (3 pregens) is the fallback and dies when those 3 records drop the field. |
| Species-talent derivation | `speciesTalentGrants` (charResolve.js:400) | all producers (B-23) | **never** — correct by design |
| Force-rating floor (C1) | app.jsx:11114 `Math.max(resolvedForceRating(sheet), forceRating)` | 10 pregens whose FR lives only in `derived` | **SUPERSEDED, DELIBERATELY KEPT** (B-57 lap, 2026-07-29). The floor now lives in the shared core (`computeDerived`), so this consumer-local copy is redundant for the pregens — but C1's own ruling made it standing (*"it must stay that way: the gate may never refuse a purchase the app's own flag says is legal"*), and it reads `resolvedForceRating`, which counts Force Rating **talent ranks** the core's floor does not. Retired only by a ruling that releases C1. |
| Born-legacy spec heal (B-29) | `resolveSheetSpecs` via :11199 + :11248 | 0/30 pregens carry `specializations` | pregens carry positional spec ownership |
| Legacy `derived` snapshot branch (R-DAR1) | charResolve.js:473-484 | all 30 pregens + old saves | **STILL LIVE and now load-bearing in a second way** — as of the B-57 lap the snapshot is also the *source* of the legacy-shape floor. R-DAR1 stands; retiring this branch now needs the floor rehomed first. **F-100 M13 (R-R0-4, this row; B-1677):** a Modify Save RETIRES the record's `derived` (`SWRPGModify.save`), since a snapshot floor would hold the old species' thresholds; Undo restores it. Measured: 18 pregens carry it, and all 18 read the same thresholds and Force rating without it. The branch itself stands for every record not yet Saved. |
| `woundBase`/`strainBase` default 10 | charResolve.js (modern branch) | any sheet missing them | **PARTIALLY RETIRED (B-57 lap, 2026-07-29).** All 30 pregens now carry registry-matching bases at source, so the default is unreachable for shipped data, and where it is still reachable (uncountable legacy localStorage saves) the floor stops it lowering a number. The default survives only as the last-resort value for a record with neither a base nor a snapshot. **F-100 M13 (R-R0-4, this row; B-1676):** a Modify Save re-derives both from the resolved species, the layer included, so a change of species no longer leaves the old bases stored. The default itself stands. |
| Legacy talent/power display passthrough | charResolve.js:76,108,220,238 | pregen talents + old saves | **PARTIALLY RETIRED (B-39/B-44 lap, 2026-07-30).** All 30 pregens' talents are canonical id-refs, so the non-canonical branch is UNREACHABLE for shipped data — asserted in `narrative_prose.cjs` ("every entry is a canonical id-ref"). It survives only for uncountable pre-canonical localStorage saves, which is the same posture as the `woundBase` default. |
| Legacy equipment passthrough | app.jsx:5199/:5210/:5221 | pregen equipment + old saves | **PARTIALLY RETIRED (B-39/B-44 lap, 2026-07-30).** All 175 equipment entries are id-refs. NOTE: this shim was never actually reached for pregen GEAR — `isCanonicalEntry` returns true for a bare string, so the 96 name-string entries went down the CANONICAL branch, failed to resolve, and rendered **"(unknown gear)" on production**. The passthrough covered weapons/armour objects only. Live defect, found by this lap, fixed by it. |
| Skill keyspace bridge | `skillSheetKeys` (:5077) | every producer | the save shape moves to canonical ids (needs R-SY4) |
| Roster boot migration | `migrateRoster` (:15051) | saved rosters written pre-3b | when no pre-3b roster can exist — practically never; keep |
| `xp` default `{0,0,0}` | :11085 | 30 pregens with no `xp` | pregens carry an `xp` block |

**Nine of the eleven trace to one cause:** `pregen_sheets.json` is a frozen artefact of an older
pipeline. That is the single highest-leverage item on this list.

> **F-100 M13 Lap C (R-R0-4):** deleting F-45's door retires no row above: none names it as a cause or a cover. The `xp` default's row stands, though the note below on a pregen's first re-entry is now history: Modify's first Save is what writes that ledger.

> **CORRECTION TO THE ESTIMATE (B-39/B-44 lap, 2026-07-30).** §8 row 2 and the B-39 board row both
> predicted this lap would retire *nine of eleven*. It retired **two** — the talent/power and
> equipment passthroughs — because the other seven need field classes the ruling did not put in this
> lap's scope: an `xp` block (still absent — F-45's C-REE-1 records that a pregen's FIRST re-entry
> therefore MINTS a ledger), positional spec ownership (B-29's heal), and the R-DAR1 snapshot branch
> that the B-57 floor now depends on. The estimate counted "shims whose cause is the pregen file"
> rather than "shims this lap's scope reaches"; recorded here so the next lap sizes from the real
> number. The two remaining pregen-caused, in-reach items are the `xp` block and spec ownership.

---

## 5. THE R1 CONTRACT (R-R0-1)

R1's shared assembly core must **own** every field in §2.1 marked `ALL` or `SOME`, and must show as
**deliberately external** every field in §2.2. No silent omissions. Specifically, R1 inherits:

1. **One assembly, two callers.** Guided's 132-line literal (:15334–15465) collapses into
   `normalizeCreated`; the nine drift points in §2.4 are the acceptance list.
2. **Move the assembly out of `FCReviewStep`'s memo** (§4.7). Preview and finalize may share it; the
   finalize must not *be* a render.
3. **`forceRatingBase` from ONE derivation** — Custom's (species ∪ `gameLine` ∪ spec ∪ **career**,
   :5362-5391). Guided's IIFE (:15419) and the test-bed's `FORCE_CAREERS` map (:5586) and
   `QB_FORCE_POWER_IDS` (:15447) all fold in.
4. **`mechanicTradeIds` persisted** (G9, §4.6) — from both callers.
5. **Armour is not silently truncated** (§4.5) — either loud, or F-59's shape lands first.
6. **`source` stamped by the caller, not hardcoded** (§4.4).
7. **Explicitly out of R1's scope:** the skill keyspace (§4.3, needs R-SY4), the pregen file (§4.2 —
   its own family lap), and `pocketMoney`/`xpLedger`/`narrative.*` dead freight in the working shape
   (§2.3 — cheap deletions, but they are deletions and should be their own diff).

---

## 6. F-45'S ROUND-TRIP CHECKLIST

> **A RECORD. F-45's door and its reverse transform were deleted at F-100 M13 Lap C (R-M13B-103);** read this section at `db3da1a65`. The forward half (`normalizeCreated`, every pick map it carries) stands, with `test/f100_m8_picks.cjs` (iii). Modify this Character's own contract is `SHEET_PLUMBING.md`.

The reverse transform must account for **every row of §2.1** — 34 persisted fields plus the 11
at-table fields of §2.2 that a re-entered character must not lose. Three specifics the census can hand
over now:

- **There is no importer** for the `swrpg-character-sheet` export (§3). F-45 is building the first one.
- **The irreproducible bits** — what a re-entry genuinely cannot recompute — are exactly:
  `speciesOptionPicks`, `specSkillChoices`, `treelessTalents` (a talent bought outside any tree — the
  Short Path's Force Rating rank, R-SPP-9), `mechanic` trade picks (once G9 writes them),
  `specializations` positional ownership, the per-cell talent picks — `talentSkillChoices` (B-181) and
  `talentCharacteristicChoices` (Renegade Form's chosen characteristic, Dedication's record; both hand-overs
  carry it since B-1064, ruling `f100-dice-hotfix` R-FDH-11) — `motivations`, `backstory`, `appearance`,
  `notes`, `mods`, and the at-table trackers. Everything else derives.
- **A pregen cannot round-trip today.** It has no `speciesId`, `careerId`, `xp`, `derivedBonuses`,
  `woundBase`, `strainBase` or `specializations`, and its talents/equipment are display shapes — so any
  reverse transform over a pregen either guesses or refuses. F-45 should state which, on paper, before
  code.
- **THE TRANSFORM'S SIGNATURE IS NOW THREE ARGUMENTS** — `sheetToCreatorState(sheet, charbuild,
  mechConfig)` (R-RTD-2, §4.6). Two-argument callers keep working and get a DECLARED loss where a trade's
  amounts would have been, never a zero. Any new caller that hands a record to the creator owes the third
  argument, or it hands the player the untraded budget.
- **A CREATION-TIME FACT THE TRANSFORM FLATTENS MUST BE CARRIED AS THE DIFFERENCE, not preferred**
  (B-754, ruling ADDENDUM 1 R-RTD-5…R-RTD-7). The creator state holds ONE number per characteristic, so
  `brawn: 4` cannot say that 3 was creation and 1 was Dedication. `sheetToCreatorState` therefore carries
  `characteristicGainsAfterCreation` — live minus `characteristicsAtCreation`, per key — and
  `normalizeCreated` recovers the creation block by subtracting it from whatever the creator finishes
  with. **RE-ENTRY DOES NOT RE-ESTABLISH THE CREATION POINT** (R-RTD-5, on the no-compromise-mirror law):
  an untouched re-entry leaves the wound threshold where it was, and a player who legitimately RE-SPENDS
  starting XP on a characteristic moves the creation value with it — which is the case that
  carry-and-prefer gets wrong, and why prefer-the-incoming-block was rejected. A record with no creation
  block at all (pre-B-736, and all eighteen pregens) has no separable creation point, so the gain is
  unknown, `mark()`ed, and the assembly stamps from live — Jason's "freeze at migration", which moves no
  number a player already holds.
- **THE HAND-OVERS CARRY ALL THREE PICK MAPS** (F-100 M8, B-1064, `f100-m8-contracts` R-M8K-6 (d);
  `lap/f100-m8-build` @ `733f8943`). Both `sheetToCreatorState` (sheet → creator) and `normalizeCreated`
  (creator → sheet) copied `talentSkillChoices` only, so Edit in Creator dropped M7's characteristic
  picks (Renegade Form, Dedication). Both now also carry `talentCharacteristicChoices` and M8's
  `talentChoices`, deep-copied and absent-tolerant (a missing map stays missing; `normalizeCreated` also drops an empty one). A new pick map
  rides both hand-overs in the change that adds it. Guard `test/f100_m8_picks.cjs` (iii), both directions.

---

## 7. METHOD, AND WHAT THIS MEASUREMENT DOES NOT SEE

- **Producers/fields** were read from source, not inferred: `normalizeCreated` :5264-5463 and
  `handleQuickBuildComplete` :15334-15465 in full; the pregen field union computed over all 30 records.
- **Reader counts** were measured by matching `sheet.` / `sheetData.` / `displayModel.` prefixes across
  `player/app.jsx`, `charResolve.js`, `itemResolve.js`, `crafting.js`, `craftStore.js`. **Limit:** a
  reader that receives the sheet under another identifier (`c`, `rec`, a destructured prop) is not
  counted. So the counts are a **floor**, and "0 reads" is a prompt to look, not a verdict — the two
  zero-read cases (`id`, `pocketMoney`) were both checked by hand.
- **Name-resolution figures** were computed against the shipped `public/data/canonical/*.json`, so they
  describe today's registries. They are the reason the name-keying in §1.1 is classified *latent*
  rather than broken.
- **Not covered, deliberately:** the GM app (it does not read the player roster), the NPC creator
  (a different family), and anything downstream of the sheet that does not touch creation.

---

## 8. WHAT SHOULD BECOME BOARD ROWS

Ranked. None of these is fixed by this census.

| # | Item | Class | Note |
|---|---|---|---|
| 1 | **N-1** — 11 pregens change a health threshold on first talent buy (§4.1) | live defect | B-49's mechanism, one field over; C1's precedent gives the remedy shape |
| 2 | **The pregen family** (B-39/B-44) — id-refs + the 7 missing field classes (§4.2, §4.9) | **DONE 2026-07-30** (id-ref half) | **MEASURED, superseding this row's estimate (R-B39-3):** retired **2** shims, not 9 — see §4.9's correction block. 205 entries converted, **0 unresolved**; the "~21 unresolvable" figure counted weapons+armour only and dissolved once a quantity was stripped from the name string (23 entries) and the tail was classed. REMAINING from this row: the `xp` block + positional spec ownership — the next lap, and the two last pregen-caused in-reach shims. |
| 3 | **Armour silently discarded** (§4.5) | live data-loss | F-59's root; the *silence* is separable from the feature |
| 4 | **`source` enumeration** (§4.4) | R-SY4 class | three vocabularies; one gates backstory editing |
| 5 | `QB_DEFAULT_GEAR` dead (14 lines) · `damageTotal` dead · `xpLedger`/`narrative.*` dead in the working shape (§2.3) | subtraction | cheap, but a deletion lap with its own grep discipline |
| 6 | Guided ignores ACTIVE SOURCES (§1.1) | conformance | harmless today, unguarded |
| 7 | Guided's name-keyed static tables have no guard (§1.1) | conformance | all resolve today; a validator pin is the cheap answer |
| 8 | Custom's draft embeds registry records (§3) | staleness | resume-after-registry-change |
| 9 | `loadQuickBuildData` misnamed (§1.1) | hygiene | it serves all three doors |
