# OggDude interchange — the field map (OGG-0)

> **Ruling:** [`Docs/rulings/oggdude-interchange-architecture.md`](rulings/oggdude-interchange-architecture.md)
> (F-36). This is the OGG-0 deliverable: the field map + key-coverage numbers + the G1 size
> call + the F-32 census row. It is **inert** — no product code, no route, no UI.

## For Jason — the one-paragraph version

The bridge the data migration laid two months ago (`_source_key` on every one of our records)
**is** OggDude's import key, and it lands almost perfectly: **species 116/116, careers 20/20,
armor 111/111, force powers 20/20, specializations 123/123, talents 599/601, gear 583/585** all
join by key. The only real gap is **weapons** — and 69 of its 83 misses are vehicle-scale weapons
we deliberately don't carry, leaving **14 personal weapons** actually absent (10 of those are
lightsaber *hilts*, a modeling difference, so **4** are genuinely missing gear). That is the whole
gap. The character-file side of the map is drawn from the §12 research that read your four real
saves at the source **before your bb8 volume went offline** — so its element vocabulary is real,
but its leaf-level detail and the **AoR (Duty)** and **FaD (Morality)** and **vehicle** rows are
marked PROVISIONAL until you can export one save of each from your generator (§7-A). Good news the
research already banked: OggDude stores **per-source rank ledgers**, which means a save records the
same free-vs-purchased, base-vs-bought provenance our sheet needs — so import can rebuild your
actual choices, not just final numbers.

## Currency & provenance (what is grounded, what is provisional)

| Input | Reachable now? | Grounding |
|---|---|---|
| Staged base `Data/` (`data-sources/oggdude_current/2026-07-14/`) | ✅ yes | **GROUNDED** — census run read-only, this doc |
| Our canonical registries (`public/data/canonical/*.json`) | ✅ yes | **GROUNDED** — live |
| 4 real character saves (`Under a Black Sun/Stock Characters`, EotE) | ❌ **offline** (bb8 `R9P06QXN.096` unmounted; Jason has no access) | **PROVISIONAL** — element vocabulary from §12 research read at source; leaf schema awaits re-read |
| 802-file `DataCustom/` homebrew corpus | ❌ offline (same volume) | not needed for OGG-0 (OGG-3 corpus). Local `DataCustom/` = 23 base scaffold files only |
| Foundry importer (`characterImport()`, MIT) | reference (read in §12) | design fence, not schema |

**Version stamp: OggDude / SWCharGen v2.3** (the version the §12 research censused). Format
stability across generator versions is unverified — this map is true **as censused against v2.3**;
a newer save may drift.

---

## §A — Key-coverage census (GROUNDED)

Distinct `<Key>` in staged base `Data/` vs distinct `_source_key` in our registry. `match` = keys an
import join lands; `base-only` = their key we lack; `ours-only` = our key beyond base OggDude (TOR /
CotR / CSG / corpus additions).

| Section | base | ours | **match** | base-only | ours-only |
|---|---:|---:|---:|---:|---:|
| Talents | 601 | 633 | **599** | 2 | 34 |
| Species | 116 | 531 | **116 (100%)** | 0 | 415 |
| Careers | 20 | 20 | **20 (100%)** | 0 | 0 |
| Specializations | 123 | 129 | **123 (100%)** | 0 | 6 |
| Weapons | 469 | 397 | 386 | **83** | 11 |
| Armor | 111 | 112 | **111 (100%)** | 0 | 1 |
| Gear | 585 | 608 | **583** | 2 | 25 |
| Force Powers | 20 | 21 | **20 (100%)** | 0 | 1 |

**Reading:** the join is first-class. `ours-only` counts are expected and harmless (we carry far more
than base OggDude — 415 extra species, 34 extra talents — an imported character never references
them). `base-only` is the honesty surface: what import's match report must flag as unmapped.

### The weapons gap, decomposed (the only material `base-only`)

83 base-only weapons by their base `<Type>`:

| Type | count | disposition |
|---|---:|---|
| Vehicle | 69 | **expected** — our weapons scope is "personal-scale only (vehicle/ammo/shield filtered at ingest)". Vehicle weapons ride the Vehicles path, not gear. Not a loss. |
| Lightsaber | 10 | **modeling difference** — all 10 are lightsaber *hilts* (Basic Hilt, Double-Bladed Hilt, Crossguard, Shoto, Lightfoil, Pike…). FaD models a hilt as a weapon; we model the saber differently. Import maps to our lightsaber; the specific hilt variant is an adapt-not-map row. |
| Melee / Energy / Explosives | 4 | **genuinely absent** — `GUNGPES` Gungan Personal Energy Shield, `SPRAYRIF` Spray Rifle, `MKVIIIMORTAR` Mk VIII Gravitic Mortar, `SPRAYFOGREN` Spray-Foam Grenade. These are the only base weapons a normal PC could carry that would report **unmapped**. Candidate gear-registry additions; fixture material for OGG-1's match report. |

The 2 talent and 2 gear `base-only` keys are trace and named in the census script output; they are
not player-facing on a normal character and fold into the same "unmapped, reported" lane.

---

## §A′ — Collision register (GROUNDED — the (type, key) resolution rule) {#collisions}

**A key is not globally unique. `CLONE` is a career AND a species; `ATARU` a specialization AND a
talent; `SMUG` a career AND a vehicle attachment.** Resolving a character's key against *all*
registries would load the wrong record. The rule OGG-1 MUST follow (R-OGG-1): **a key resolves only
within the registry its OggDude element type designates** — a `<Career>` key-ref resolves against
`careers` and nowhere else. The census script honours this (each lookup is scoped to its section);
the resolution sentence in §F states it explicitly so the parser inherits the constraint.

Derived over **all 12 canonical containers carrying `_source_key`** (4,300 distinct keys);
re-runnable via `python3 scripts/canonical/ogg0_key_census.py`.

**(a) 16 cross-registry collisions** — one key, two registries:

| key | lives in |
|---|---|
| `ATARU` | specializations · talents |
| `BIND` | force_powers · gear |
| `CLONE` | careers · species |
| `RIDINGTACK` | armor · gear |
| `SMUG` | careers · vehicle_attachments |
| `STYANAX` | npcs · weapons |
| `DIPLOMAT` | careers · npcs |
| `JAWA`, `TUSKEN_RAIDER` | npcs · species |
| `MECHANIC`, `NIGHTSISTER`, `PILOT`, `QUARTERMASTER`, `SENATOR`, `SLICER` | npcs · specializations |
| `PHYSICIAN` | npcs · talents |

**R-OGG-12 — 10 of the 16 are `npcs.json` against career/spec/species/talent/weapon.** That is
expected and harmless: our NPC records are stoogoff-sourced and share vocabulary with FFG's role
names (a "Pilot" NPC, the Pilot specialization). They are harmless **only because import never
resolves a character's key against the NPC registry** — no character element points at `npcs`. State
that premise, don't assume it; it is why two-thirds of the list needs no action. The 6 that are NOT
npc-side (`ATARU`, `BIND`, `CLONE`, `RIDINGTACK`, `SMUG`, `STYANAX`) are the ones the (type, key) rule
actually defuses on a character import.

**(b) 1 same-registry duplicate** — `species.json` carries `_source_key` `'339'` **twice**. A lookup
by that key within its own registry is ambiguous; import must disambiguate by the other fields or
report it. (Data-hygiene candidate for a later species lap; recorded here as the collision surface.)

**(c) 7 base-side within-section duplicates** — `Weapons.xml` has **476** `<Weapon>` elements but
**469** distinct keys: `BERSERKERRIF`, `MODEL77`, `MOLSTILETTO`, `NIGHTBOW`, `SHISBLADE`, `STUNBATON`,
`THNDRBOLT` each appear twice on *their* side. §A's coverage table counts distinct keys (correct for a
ratio); this row is the catalogue-audit count that a `set()` would hide (R-OGG-11). An importer keying
a saved weapon by `<Key>` against a base catalogue with doubled keys must pick deterministically.

---

## §B — Character-shape field map (v2.3 — GROUNDED from five real saves 2026-08-15; only row 5 still PROVISIONAL)

OggDude saves a character as **per-source rank ledgers**: the same rank appears under the source that
granted it (`SpeciesRanks`, `CareerRanks`, `TalentRanks`, `ObligationRanks`, `PurchasedRanks`, …).
**This is structurally close to our creation model** — it records provenance, so free-vs-purchased and
base-vs-bought are recoverable, not lost to final-state flattening. That is the single most important
finding for OGG-1: **import can reconstruct choices, not just numbers.**

`their element` = v2.3 ledger vocabulary (element names from §12 research at source; leaf attributes
provisional). `our field` = `characterExport.*` (STATE_MODEL.md, GROUNDED). `status`: **JOIN** = key
coverage proven in §A · **LEDGER** = recoverable from a per-source ledger · **GAP** = needs a save we
don't have · **ADAPT** = no clean source, match report owns it. **Update 2026-08-15 (ruling
`ogg-0-saves-arrived`, handoff `ogg-0-field-map-trueup`):** the five §7-A saves arrived; the LEDGER
leaf schemas and the three GAP rows (Duty/Morality/vehicle) are now GROUNDED — schemas quoted from the
files in **§B.1**, never from the ruling.

| their element (v2.3) | our field | status |
|---|---|---|
| `<Character><Name>` / `<Key>` | `character.name` | LEDGER (trivial) |
| `<Species>` key-ref | `character.speciesId` | **JOIN** ✅ 116/116 |
| `<Career>` key-ref | `character.careerId` | **JOIN** ✅ 20/20 |
| `<Specializations>` key-refs | `character.specializationIds[]` | **JOIN** ✅ 123/123 |
| `SpeciesRanks` (characteristic) | `characteristics.base{6}` | LEDGER |
| `PurchasedRanks` (characteristic) | `characteristics.purchased{6}` | LEDGER |
| `CareerRanks` / spec-source skill ranks | `skills.freeCareerSkillIds[]`, `freeSpecializationSkillIds[]` | LEDGER |
| `PurchasedRanks` (skill) | `skills.purchasedRanks{}` | LEDGER |
| `TalentRanks` | `talents.selectedTalentIds[]` / `grantedTalentIds[]` | **JOIN** ✅ 599/601 · LEDGER split |
| `<Weapons>` key-refs + `Count` | `gear.items[]` (weapons) | **JOIN** ✅ minus §A's 14 |
| `<Armor>` key-refs | `gear.items[]` (armor) | **JOIN** ✅ 111/111 |
| `<Gear>` key-refs + `Count` | `gear.items[]` (gear) | **JOIN** ✅ 583/585 |
| `<ForcePowers>` key-refs + node purchases | (force-power state) | **JOIN** ✅ 20/20 · upgrade-nodes **GROUNDED** (§B.1) — `Col`/`Row`/`Span`/`Cost` + a `<Purchased>` flag per cell; read exactly which nodes were bought, no blanket-grant |
| `ObligationRanks` (type + magnitude) | `narrative.mechanic="obligation"`, `typeId`, `adjustments` | LEDGER (EotE-confirmed) |
| Duty ledger | `narrative.mechanic="duty"` | **GROUNDED** (§B.1 — `N4567` AoR: `DutKey`/`Size`/`Plus5XP`) |
| Morality block | `narrative.mechanic="morality"` | **GROUNDED** (§B.1 — `jihn` FaD: `MoralityPair` keys + `Plus20Morality`) |
| `<Credits>` / money | `credits.startingBase` / `spent` | LEDGER |
| `<Experience>` totals + `PurchasedRanks` | `xp.*` + `xp.purchases` | LEDGER (totals confirmed) |
| owned vehicle(s) | (equipment / vehicle state) | **GROUNDED** (§B.1 — `Levi` `<CharVehicle>`; carries `Name`/`Notes`, R-OGG-15) |
| custom-content key-refs (`DataCustom`) | resolve → homebrew module (F-24/OGG-3) | ADAPT — match report: "N items need the module this character was built with" |
| — (no line tag in OggDude) | `meta.gameLine` (`eote/aor/fad`) | **ADAPT** — OggDude does not tag a save's game line; inferred from career + narrative mechanic. Match report owns the inference. |
| — (no equivalent) | `gear[].nickname`, `gear[].provenance` | ours-only — absent on import, correct (R-ITM9 story starts blank) |

### §B.1 — GROUNDED from the §7-A saves (2026-08-15) — quoted from the files, not the ruling

Five real saves preserved verbatim at **`data-sources/ogg-saves/`** (ruling `ogg-0-saves-arrived`;
handoff `ogg-0-save-fixtures`). Every fragment below was re-derived from those files — a doc citing a
ruling citing a file is two removes from it (ledger #53–#58).

**Per-source rank ledger — the load-bearing fact, read at source** (`ArooMeh__Human_Smuggler.xml`).
Free-vs-purchased is carried per rank; `isCareer` per skill:
```xml
<CharCharacteristic>
  <Key>BR</Key><Name>Brawn</Name>
  <Rank><SpeciesRanks>2</SpeciesRanks><PurchasedRanks>2</PurchasedRanks></Rank>
</CharCharacteristic>
<CharSkill><Key>ASTRO</Key><Rank /><isCareer>true</isCareer></CharSkill>
```
Ledger-tag counts, Aroo'Meh: `SpeciesRanks`×11 · `CareerRanks`×5 · `PurchasedRanks`×4 ·
`StartingRanks`×3 · `ExperienceRanks`×1 · `<Rank>`×41 · `isCareer`×15. Present in all four character
files (the vehicle file carries none). **"Import reconstructs choices, not numbers" is now read off a
real file, not a research transcript.**

**Duty** (`N4567__Droid_Diplomat.xml`, AoR):
```xml
<Duties><CharDuty><Key>0</Key><Name>Communications</Name><Size>5</Size><DutKey>COMM</DutKey></CharDuty></Duties>
<DutOptions><StartingSize>5</StartingSize><Plus5XP>true</Plus5XP></DutOptions>
```
`DutKey` = registry key; `Key` = index; `Size` = magnitude; `Plus5XP` = the duty-for-XP trade as a flag.

**Morality** (`jihn__Human_Sentinel.xml`, FaD):
```xml
<Morality>
  <Options><Option>Plus20Morality</Option></Options>
  <MoralityPairs><MoralityPair><StrengthKey>BRAVERY</StrengthKey><WeaknessKey>ANGER</WeaknessKey></MoralityPair></MoralityPairs>
  <ModifiedMorality>25</ModifiedMorality><MoralityValue>96</MoralityValue>
</Morality>
```
Strength/weakness are **keys** (they join, not prose); `Plus20Morality` is the FaD trade, same shape as
Duty's `Plus5XP`.

**Owned vehicle — two-part, carries irreproducible user content** (`Levi__1L_ImperialSeries_Repulsor_Tank.xml`).
A character lists `<Vehicles>`; a vehicle is ALSO its own file rooted `<CharVehicle>`:
```xml
<ItemKey>1LTANK</ItemKey>                          <!-- registry key -->
<Key>86d923d0-f2d0-4497-a7f3-1bae4140e535</Key>    <!-- GUID identity, distinct from ItemKey -->
<Count>1</Count>
<Name>Levi</Name>                                  <!-- user-named -->
<Notes>Levitates to decimate.</Notes>              <!-- user-authored; not in any registry -->
```
`Name`/`Notes` are not recoverable from the registry. **R-OGG-15 binds the build**: vehicle name +
notes are carried, or their loss is named in the receipt.

**Force-power nodes — per cell, better than hoped** (`jihn__Human_Sentinel.xml`, 309 `CharForceAbility`):
```xml
<CharForceAbility>
  <Key>ALTERBASIC</Key><Col>0</Col><Row>0</Row><Span>1</Span>
  <Cost>15</Cost><Purchased>true</Purchased>
</CharForceAbility>
```
Position (`Col`/`Row`/`Span`) plus a `<Purchased>` flag + `<Cost>` per cell — exactly which upgrade
nodes were bought is readable; no blanket-grant (the §B "read them, not grant" fence, now backed by data).

**Tag census (ACCEPTANCE), re-run across all five files** — distinct element local-names: Droid
Diplomat **181** · AruNeh **172** · Sentinel **119** · Aroo'Meh **110** · Levi (vehicle) **7** →
**union = 208**. The build card's "108-tag" figure was Aroo'Meh alone, now **110** measured. **Row 5
(custom-content) is §E's only survivor.**

---

## §C — G1 size call — CORRECTED 2026-08-15 (R-OGG-14): it was aimed at the wrong thing

The §12 research's "**400–800 KB per save**" was TOTAL file size. Measured on the five real files, the
**character body is small — 14–77 KB; the PORTRAIT is the weight, up to 273 KB**: Droid Diplomat
300 KB total / 273 KB portrait (**91%**) / ~26 KB data · Aroo'Meh 40 KB / 26 KB (65%) / ~14 KB · the
vehicle file 123 KB / 122 KB (**100%**) / ~0.3 KB. So carrying the character body inline was never the
problem the "400–800 KB" figure implied.

**The durable-contract question is therefore RE-AIMED (R-OGG-14): what happens to the PORTRAIT on
import** — carried, dropped, offered as an optional second step, or stored by reference. THAT is the
wire-shape decision owed to the architect on paper before parser code (R-SY4); the
persisted-vs-one-time-receipt fork (R-OGG1-6) is unchanged. `sheet.oggSource` as a POINTER
(`{ ref, version, importedAt, sourceHash }`) to the raw XML in a side store still stands for the body
(carry-through G1 tolerates absence, R-Y2-1 class); the newly-decisive axis is the image.

## §D — F-32 census row (shared visit — source composition, 2026-07-14 refresh)

The staged refresh (`data-sources/oggdude_current/2026-07-14/`) is the current base OggDude dataset.
Top-level element counts, for source-composition tracking:

Careers 20 · Species 116 · Specializations 123 · Force Powers 20 · SigAbilities 38 · Vehicles 416 ·
Talents 647 · Weapons 477 · Armor 111 · Gear 590 · Skills 35 · Force Abilities 177 ·
SigAbilityNodes 275 · Obligations 41 · Duty 46 · Moralities 87 · Motivations 32 ·
SpecificMotivations 283 · ItemAttachments 358 · ItemDescriptors 186 · Rewards 13 · plus `Imports_CotR`.
(`<Key>`-node totals run higher where records nest keyed children — e.g. Weapons.xml has 1656 `<Key>`
nodes across 477 weapons because qualities/attachments nest keys; the top-level count is the item
count.) **F-32's blocked human step is DONE** — the ingest lap can start off this same staged data.

## §E — The provisional boundary — TRUED UP 2026-08-15 (four of five closed)

Everything in §A / §A′ was already grounded. Of §B's five provisional content rows, the §7-A saves
(now at `data-sources/ogg-saves/`) closed **four**; schemas in §B.1, read at the files. **Only row 5
remains PROVISIONAL.**

1. ~~Leaf schema of every ledger~~ → **GROUNDED** (§B.1: `SpeciesRanks`/`PurchasedRanks`/`CareerRanks`/
   `StartingRanks`/`ExperienceRanks` inside `<Rank>`; `isCareer` per skill). The `.dll`-decompile
   fallback is moot.
2. ~~Duty ledger (AoR)~~ → **GROUNDED** (§B.1, from `N4567__Droid_Diplomat.xml`).
3. ~~Morality block (FaD)~~ → **GROUNDED** (§B.1, from `jihn__Human_Sentinel.xml`).
4. ~~Owned-vehicle shape~~ → **GROUNDED** (§B.1, from `Levi__1L_ImperialSeries_Repulsor_Tank.xml`;
   R-OGG-15 — it carries user-authored `Name`/`Notes`).
5. **Custom-content ref resolution** — **STILL PROVISIONAL.** Needs the offline 802-file `DataCustom`
   pack (OGG-3), not a save; these files cannot promote it. *The only survivor.*

Acceptance items (`ogg-0-first-character-census` §5), previously blocked by the offline volume:

6. **The tag census** → **DONE** (§B.1): Aroo'Meh **110** distinct tags (the card's "108" was this
   file alone), **208** across all five. Row 5 is the only survivor.
7. **The Aroo'Meh fixture** → **IN HAND and parsing.** Committed verbatim at
   `data-sources/ogg-saves/ArooMeh__Human_Smuggler.xml` (Jason's call, ruling `ogg-0-saves-arrived`
   §4 — all five kept, portraits included).

**Net: OGG-1's map gaps are closed except row 5** (offline pack) and the **portrait wire-shape
decision** (§C / R-OGG-14), which is the architect's to rule on paper before parser code. Nothing else
about the build waits on these files.

## §F — What OGG-1 inherits from this map

- **The join works, resolved by (type, key)** — OGG-1's parser resolves each key-ref against **the one
  registry its OggDude element type designates** (a `<Career>` key → `careers`, a `<Species>` key →
  `species`, never key-alone across all registries), because 16 keys live in two registries and one
  lives twice in `species` — see §A′. Scoped that way, §A says the hit rate is ~100% except the named
  weapon gap. Resolving by key alone is the one method that breaks; §A′ is the constraint that prevents
  it.
- **The match report has its content** — the 4 absent weapons, the 10 saber hilts, the game-line
  inference, and the custom-content-needs-a-module message are its honest rows, known before a line
  of parser is written. (The Foundry importer died because it hid exactly these — issue #1988.)
- **The choice-ledger is recoverable** — because OggDude stores per-source ranks, import populates our
  free/purchased split rather than dumping final numbers. This is the design's foundation and it was
  the open worry the research retired.
- **Front-door placement** ("bring your OggDude character") is an onboarding-hero MOMENT and a CONCEPT
  decision owed at OGG-1's scope (R-PL1 / R-MU1) — **architect's, not decided here.**
