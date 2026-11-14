# Data Inventory — Star Wars RPG App

> **Maintenance rule:** Update this file whenever data files are added, removed, restructured, or significantly expanded. Check counts after bulk operations. This is the single source of truth for "what data exists in this project."
>
> **Last updated:** 2026-06-03 — baseline re-verified against disk @ `863654d`. Corrected drift: NPC data (deleted `npc-archetypes.json` → live `npc-library/`, 1,430 stoogoff entries), added the `vehicle-library/` (415), planets 79→108, factions 5→25 records, +12 undocumented OggDude categories, and removed references to the pre-migration `src/…` layout and the Windows iCloud PDF path. Earlier substantive update 2026-03-23 (Faction inference engine, McGuffin types, map components, alert vectors, session tracking).

---

## 1. Primary Game Dataset

### `data-sources/oggdude_merged.json` (5,523 KB)

> **RETIRED FROM THE SERVED PRODUCT (blob-retirement-3, 2026-06-10) — ADR 0003 END STATE.**
> Zero runtime fetches in any app (was 3; rewired onto the canonical vocabs/registries at
> blob-retirement-2, measured live). Moved out of `public/data/` to `data-sources/` —
> BUILD INPUT ONLY (canonical ingest, vehicle-library builder, vocab generators). The
> Cloudflare-serves-the-repo caveat is recorded in the blob-retirement-recon ruling
> (D-BR5: technically fetchable at the new path, referenced by nothing).

The canonical game mechanics database. Extracted from OggDude's Character Generator. Powers the entire character creation app.

| Category | Count | Key Fields | Used By |
|----------|-------|------------|---------|
| species | 1,157 | Key, Name, Description, StartingChars, SkillModifiers | Character creation (species step) |
| careers | 20 | Key, Name, Description, CareerSkills | Character creation (career step) |
| specializations | 120 | Key, Name, CareerSkills, TalentRows | Career selection, talent tree |
| talents | 583 | Key, Name, Description, Ranked, ActivationValue | Talent tree purchasing |
| skills | 36 | Key, Name, Description, CharKey | Skills allocation, dice pools |
| weapons | 480 | Key, Name, Description, SkillKey, Damage, Crit, Range | Weapons browser |
| armor | 106 | Key, Name, Description, Defense, Soak | Armor browser |
| gear | 606 | Key, Name, Description, Short | Equipment browser |
| itemattachments | 327 | Key, Name, Description, Type | Attachments browser |
| vehicles | 415 | Key, Name, Description, Type | Not surfaced in UI |
| force_powers | 21 | Key, Name, Description, AbilityRows | Not surfaced in UI |
| force_abilities | 186 | Key, Name, Description, Power | Not surfaced in UI |
| obligations | 41 | Key, Name, Description | Narrative mechanic (EotE) |
| duty | 49 | Key, Name, Description | Narrative mechanic (AoR) |
| moralities | 87 | Key, Name, Description, Type | Narrative mechanic (FaD) |
| motivations | 32 | Key, Name, Description, SpecificMotivations | Motivation picker |
| specificmotivations | 283 | Key, Name, Description, Motivation | Motivation detail |
| itemdescriptors | 186 | Key, Name, Description, Type, ModDesc | Item qualities |
| crafttemplates | 104 | Key, Name, Description, TempType, MaterialCost | Not surfaced |
| craftimprovements | 280 | Key, Name, Description, TempType | Not surfaced |
| hooks | 89 | Key, Name, Description | Not surfaced |
| sigabilities | 36 | Key, Name, Description, AbilityRows | Not surfaced |
| sigabilitynodes | 258 | Key, Name, Description, SigAbility | Not surfaced |
| rewards | 12 | Key, Name, Description | Not surfaced |
| characteristics | 6 | Key, Name, Abbrev, Description | Reference |
| classes | 11 | Key, Name, Description | Reference |
| coresources | 3 | Key, Name | Reference |

**Also present (verified 2026-06-03, previously undocumented):** `baseupgrades` (35), `vehactions` (24), `craftdroidtraits` (18), `basefoci` (15), `inquisitorabilities` (13), `vehpositions` (11), `inquisitorequipment` (9), `inquisitortalents` (9), `baseofoperations` (7), `inquisitorpackages` (7), `attitudes` (4), `reputations` (1). Total **39 categories** (excl. `_meta`).

**Internal shape note:** the file is not uniform — 33 categories are `{root, items[]}` envelopes (e.g. `weapons.items`, `armor.items`), while 6 are bare top-level lists (`careers`, `force_powers`, `sigabilities`, `specializations`, `species`, `vehicles`). `_meta`: `{source: "SWDataSet-OggDudes-master", generated_at: 2026-03-05, ...}`. Normalized at **runtime** via `lib/items.js` (`window.SWItems`) + `normalizeOggdude()` (`player/index.html`) — OggDude has no build-time ingest pipeline (unlike NPCs/vehicles below).

**Not in oggdude:** Planet/location data, adversary stat blocks, encounter designs, faction information, hyperspace routes. OggDude is character mechanics only.

---

## 2. Character Creation Flow

> ⚠️ **RETIRED — first-generation data (UXQP-25).** The three flow/scene/widget files
> below drove the retired first-gen creator (the `characterExport`/widget design in the
> archived [STATE_MODEL.md](STATE_MODEL.md)). They are **runtime-dead** — grep confirms
> 0 references in `player/`, `gm/`, `dice/`, or `lib/`. The shipped creator is the inline
> React flow in `player/index.html` (QuickBuild / FullCreator). Kept as historical input
> only; deleting the on-disk files is a tracked follow-up (inert data change).

### `public/data/character-creation-flow.json` (34 KB) — RETIRED, runtime-dead
Step definitions for the character creation wizard. 7 steps (background, species, career, chars, talents, weapons, narrative-reveal, review), each with multiple views and widget layouts.

### `public/data/hub-scene.json` (3 KB) — RETIRED, runtime-dead
Cave safehouse scene definition — 13 hotspots with positions, images, step bindings, and lore entries. (Companion doc `Docs/HUB_SCENE_ARCHITECTURE.md` already deleted, 2026-06-10.)

### `public/data/datapad-view-layouts.json` (5 KB) — RETIRED, runtime-dead
14 widget layout definitions for the datapad overlay views.

### `public/data/narrative-mechanics.json` (5 KB)
Unified rules engine for obligation/duty/morality starting credit trades.

### `public/data/lore-overrides.json` (229 KB)
Curated descriptions for species, backgrounds, and motivations. Replaces auto-extracted OggDude text with in-universe narrative.

### Narrative Mechanic Types
| File | Count | Purpose |
|------|-------|---------|
| `obligation-types.json` | 41 | EotE obligation definitions |
| `duty-types.json` | 49 | AoR duty definitions |
| `morality-pairs.json` | 62 KB | FaD morality strength/weakness pairs |
| `obligation-conflicts.json` | 13 | Obligation conflict results |
| `duty-conflicts.json` | 13 | Duty conflict results |
| `morality-conflicts.json` | 13 | Morality conflict results |

---

## 3. NPC Generator

### `data-sources/npc-library/` (verified 2026-06-03 — **1,430 entries**)

> **RUNTIME-DEAD (world-links-3) and MOVED OUT of public/data/ (blob-retirement-3,
> 2026-06-10 — ADR 0003 end state).** No app code fetches these files —
> the NPC browser, encounter seeder, and all cards run on the canonical registry
> (`public/data/canonical/npcs.json`, 19-field records carrying the affiliation links).
> These files and `taxonomy.json` survive as **BUILD INPUT ONLY** (the canonical ingest
> `run_phase2b.py` + the affiliations-vocab generator read them). Deleting them outright
> is the ADR 0003 end-state call, gated on retiring `oggdude_merged.json`'s last three
> readers too. Drawer tree → `schema/vocab/affiliations.vocab.json` (served from
> `public/data/canonical/`); landing arrangement → `public/data/navigation/
> npc-landing-layout.json`; badge counts derived at runtime (D-WL6).

The NPC stat-block library. `schema_version: npc-library-2`, `generated_from:
stoogoff/sw-adversaries`, built by `scripts/ingest_stoogoff.py` (build-time ingest →
schema-versioned output). Sharded by tier:

| File | Entries |
|------|---------|
| `minion.json` | 328 |
| `rival.json` | 664 |
| `nemesis.json` | 438 |
| **Total** | **1,430** |

Plus `index.json` (manifest: `total_entries`, `tiers`, `book_codes` —
eote/aor/fad/dor/cotr/rots/sof/sor/etc., `affiliation_node_counts`) and `taxonomy.json`.

**Fields per entry:** key, name, tier, description, characteristics (6 stats), derived
(soak, wounds, strain, defence), skills (`[{name, rank}]`), plus talents/abilities/weapons
where present. **(Trued 2026-09-23, B-765 / ruling `npc-paper-rows-1-2` R2:** the encounter-instance
shape and its `deriveNpc` reconciliation in `gm/index.html` no longer exist — 0 hits repo-wide, retired with
the encounter system (ADR 0008). The one runtime consumer is the bench, which persists only the id-ref
`_source_key` plus its mutable overlay and resolves the stat block from the registry at render
(`lib/library/npc/benchStore.js` header). There is one NPC record shape.)

> **Superseded:** the earlier `public/data/npc-archetypes.json` (136 archetypes
> hand-extracted from EotE/AoR/FaD Core across 3 passes) was **replaced** by the
> stoogoff-sourced `npc-library/` and is no longer in the repo. The Mandalorian /
> career-sourcebook gaps noted for the old file are largely closed by the 1,430-entry set.

### `public/data/npc-generation-flow.json` (5 KB)
3-step NPC creation flow for the cantina scene generator.

### `public/data/npc-hub-scene.json` (1 KB)
Cantina scene hotspot definitions (placeholder — blocked on art assets).

---

## 3a. Vehicle Library (verified 2026-06-03 — **415 vehicles**)

`public/data/vehicle-library/` — `schema_version: vehicle-library-1`, **`generated_from:
oggdude_merged.json`** via `scripts/build_vehicle_library.py` (a *second-order* extraction:
the 415 OggDude `vehicles` entries re-shaped into display-ready shards; 414 stats-complete,
1 desc-only). Image manifest built by `scripts/build_vehicle_image_manifest.py`.

| Shard | Count | | Shard | Count |
|-------|-------|-|-------|-------|
| `landspeeders.json` | 73 | | `support.json` | 34 |
| `starfighters.json` | 64 | | `walkers_tanks.json` | 29 |
| `capital_ships.json` | 51 | | `patrol_gunships.json` | 22 |
| `freighters.json` | 51 | | `airspeeders.json` | 36 |
| `transports.json` | 55 | | **Total** | **415** |

Plus `index.json` (manifest: shards, `affiliation_counts`, `stats_complete_count`) and
`taxonomy.json`. Affiliations: independent 155, multi_faction 154, rebellion 38, empire 30,
hutt 17, republic 14, cis 5, mandalorian 2. Loaded by `lib/vehicles/VehicleLibraryController.js`.

---

## 4. GM Toolkit — Encounter Generator (Beat System)

### `public/data/locations.json` (35 KB)
40 location premises for the beat-based encounter generator.

| Field | Description |
|-------|-------------|
| location_id | Unique slug |
| name | Flavor name |
| type | interior_imperial / rebel / criminal / civilian / cave / spaceport / urban |
| faction | Controlling faction name |
| status | occupied_active / occupied_tense / recently_abandoned / etc. |
| inhabitants | Array of who's here |
| last_event | One-sentence story hook |
| mood | 2-3 mood tags |
| secrets | 1-3 discoverable details |
| threat_level | none / low / medium / high / extreme |
| tags | Searchable semantic tags |

**Distribution:** 8 civilian, 6 imperial, 8 criminal, 4 spaceport, 9 cave, 3 urban, 2 rebel.

**Note:** These are generic encounter premises for the beat generator. They are NOT the same depth as the Nar Shaddaa planet/district schema.

### `public/data/room_templates.json` (62 KB)
60 room templates with tags, size, shape, required/optional objects, faction variants, and connection rules.

### `public/data/story_clusters.json` (100 KB)
85 environmental micro-scenes with positioned objects, narrative fit tags, and faction filters.

### `public/data/object_states.json` (131 KB)
68 objects with 7 visual states each (pristine, worn, damaged, abandoned, improvised, ransacked, ceremonial), state triggers by location status/mood, size classification, and top_down_shape descriptor.

### `public/data/flow_rules.json` (2 KB)
Room graph constraints, size profiles (small/medium/large room counts), cluster placement density rules.

### Generator Module: `mapGenerator.js` (~47 KB) — _pre-migration path `src/mapgen/`; no longer present under that path (Beat System shelved — see §10); current location unverified_
Beat-based encounter generator. Functions: buildEncounterFlow, assignNPCsForBeat, buildReadAloud, compileEncounterPrompt, compileRoomSummary. Constants: BEAT_TYPES, BEAT_SEQUENCES, MCGUFFIN_TEMPLATES (12), COMPLICATION_EVENTS (10), SKILL_CHECK_TEMPLATES (9 skills), ENCOUNTER_PRESETS (7 location types).

---

## 5. GM Toolkit — Planet/District Data (World Model Schema v2.0)

### Schema v2.0

All planet files follow a unified schema with `record_depth` field:
- **`full`** — All GM toolkit sections populated (factions, strategic_locations, encounter_population, campaign_state). Answers "what's happening here."
- **`identity`** — Identity + compendium blocks populated. GM toolkit sections empty. Answers "what is this place."
- **`navigation`** — Lightweight nav entries in `planets_nav.json` (separate file, not individual records).

Every file has: `id`, `schema_version: "2.0"`, `record_depth`, `identity`, `compendium`, `era_variants`, `geography`, `species`, `factions`, `strategic_locations`, `influences`, `navigation`, `encounter_population`, `campaign_state`, `source_refs`.

**Architectural rule:** The Rebel Alliance does NOT appear in planet `factions` arrays. The Alliance is a conspiracy, not a territorial faction. Rebel presence is encoded in `campaign_state` presets (AoR presets) and the galaxy faction file (`rebel_alliance.json`). The GM decides where cells exist for their campaign.

### Gap Management

Each promoted planet has a companion `*_gaps.json` file with standardized schema. Gap resolutions:
- **`not_applicable`** — Field not needed for GM toolkit (rarity modifiers, orbital metrics, travel times, post-Empire era variants)
- **`gm_determined`** — Story element the GM decides at the table (navigation anomalies, campaign presets without sourcebook grounding)
- **`needs_authoring`** — Genuinely missing, affects tool function (identity.essence, grid coordinates, faction detail)

Consolidated report: `public/data/planets/gap_report.json`

| Metric | Count |
|--------|-------|
| Total gaps before normalization | 349 |
| Closed as not_applicable | 190 |
| Closed as gm_determined | 42 |
| **Remaining needs_authoring** | **117** |
| Planets with gap files | 27 |

### Planet Records (`public/data/planets/`)

**108 total planet files** (verified on disk 2026-06-03; all parse as dict records). The full/identity-depth tables below were authored at the 79-file mark (27 full + 52 identity) and have **not** been re-verified for the +29 files added since — treat the breakdown as indicative, the 108 total as authoritative.

#### Full Depth (27 planets)

Faction counts exclude Rebel Alliance (see architectural rule above). Rebel presence is in campaign presets.

| Planet | Factions | Locations | Presets | Source |
|--------|----------|-----------|---------|--------|
| nar_shaddaa | 4 | 6 | 3 | Hand-authored reference |
| coruscant | 3 | 6 | 2 | Sourcebook extraction |
| tatooine | 5 | 5 | 2 | Sourcebook extraction |
| kashyyyk | 3 | 5 | 3 | Sourcebook extraction |
| mandalore | 3 | 5 | 2 | Sourcebook extraction |
| ord_mantell | 5 | 5 | 2 | Sourcebook extraction |
| lothal | 3 | 6 | 3 | Sourcebook extraction |
| corellia | 6 | 5 | 1 | Promoted (EotE + Suns of Fortune) |
| nal_hutta | 5 | 5 | 2 | Promoted (EotE + Lords of Nal Hutta) |
| rodia | 4 | 5 | 1 | Promoted (created from scratch) |
| ryloth | 4 | 5 | 2 | Promoted (EotE + AoR + Dawn) |
| bespin | 4 | 6 | 1 | Promoted (EotE + multiple sourcebooks) |
| yavin_iv | 4 | 5 | 3 | Promoted (AoR + Strongholds) |
| hoth | 1 | 4 | 2 | Promoted (AoR + Strongholds) |
| sullust | 5 | 8 | 1 | Promoted (AoR + Strongholds) |
| mon_calamari | 4 | 7 | 2 | Promoted (AoR + Strongholds) |
| bothawui | 5 | 4 | 1 | Promoted (EotE + AoR + Spy) |
| dagobah | 0 | 4 | 1 | Promoted (FaD + Nexus of Power) |
| ilum | 2 | 4 | 1 | Promoted (FaD + Nexus of Power) |
| jedha | 7 | 5 | 1 | Promoted (Dawn of the Rebellion) |
| moraband | 1 | 5 | 1 | Promoted (FaD + Guardian + Collapse) |
| ossus | 4 | 7 | 1 | Promoted (FaD + Nexus of Power) |
| naboo | 4 | 5 | 2 | Promoted (Nexus of Power + Separatists) |
| kessel | 4 | 4 | 1 | Promoted (EotE + Smuggler + Hutt Space) |
| geonosis | 3 | 5 | 1 | Promoted (created from scratch) |
| felucia | 6 | 6 | 2 | Promoted (created from scratch) |
| christophsis | 2 | 5 | 1 | Promoted (created from scratch) |

#### Identity Depth (52 planets)

Compendium-extracted from the Planet Compendium PDF (69 pages). Each has: background text (~2,000 chars avg), astronavigation data, government, population, terrain, cities, areas of interest, exports/imports, trade routes, rarity modifier, grid coordinates.

Includes: Alderaan, Alderaan (Destroyed), Aleen, Arbooine, Arda I, Atollon, Auratera, Aurea, Bardotta, Bothawui (now full), Byblos, Byss, Cato Neimoidia, Cerea, Chandrila, Cholganna, Corellia (now full), Corfai, Dagobah (now full), Dathomir, Devaron, Dorin, Drall, Duro, Empress Teta, Fondor, Froz, Hoth (now full), Iktotch, Ilum (now full), Jagomir, Jedha (now full), Kessel (now full), Kintan, Kinyen, Klatooine, Kowak, Kuat, Kwenn Space Station, Mon Calamari (now full), Moraband (now full), Naboo (now full), Nal Hutta (now full), Nubia, Ord Gimmel, Ord Radama, Ossus (now full), Raxus Prime, Ryloth (now full), Sacorria, Saki, Saleucami, Selonia, Sriluur, Sullust (now full), The Wheel, Thyferra, Toydaria, Tralus, Vagran, Varl, Vlemoth Port, Vodran, Weik, Xorrn, Xyquine II, Yavin IV (now full), Ylesia.

### District Records (`public/data/districts/`)

| District | Planet | Size | Zones | Events |
|----------|--------|------|-------|--------|
| nar_shaddaa_main_docking_platform | Nar Shaddaa | 22 KB | 4 | 7 |

Each encounter zone has: cast (NPCs with wants), ambient_facts, tensions, affordances, alert_shifts, **alert_vectors**.

**Alert vectors** (added 2026-03-23): 14 vectors across 4 zones modeling how information travels through faction communication networks when players are detected. Each vector has: trigger, method (radio/informant/witness/direct), speed (immediate/minutes/delayed), result_state, block_window, and block_methods. Faction distribution: Imperial 6, Hutt 7, Black Sun 1. Only 1 unblockable (ISB log).

**Note:** Only 1 district record exists. District authoring for promoted planets is a future task.

### Session Alert Tracking (`public/data/session/`)

Live session state for per-faction alert tracking. MGS V-inspired model:
- **4 states:** default → suspicious → targeted → cooldown (decay path reverses)
- **Per-faction tracking:** each faction has independent state, quiet_scenes counter, decay_threshold
- **Communication methods:** radio (immediate), informant (minutes/delayed), witness (delayed), direct (immediate)

| File | Purpose |
|------|---------|
| `nar_shaddaa_main_docking_platform_default.json` | Seed state — all factions at default, all counters zero |

Seed factions: imperial_military (decay: 2), hutt_cartel (decay: 2), black_sun (decay: 3).

Session files track: `faction_states`, `fired_vectors`, `blocked_vectors`, `state_history`, `gm_notes`. GM loads seed at session start, modifies during play.

### McGuffin Types (`public/data/mcguffin_types.json`)

Reference taxonomy for the faction inference engine. Powers the "who cares about this MacGuffin?" query.

| Section | Count |
|---------|-------|
| Types | 7 (data, artifact, weapon, resource, person, leverage, technology) |
| Origins | 5 (imperial, criminal, force, civilian, ancient) |
| Sensitivities | 4 (unknown, rumored, known, contested) |
| Galaxy faction interest | 2 (imperial_military dispatch, knights_of_ren dispatch) |

Each type maps to faction standing interest with reason text. Origins escalate interest. Sensitivities trigger galaxy-level alerts.

### Faction Inference Engine (`lib/gm/factionInference.js`) <!-- moved from pre-migration src/gmtoolkit/ -->

Pure JS function: `inferFactionInterest(mcguffin, planetData, mcguffinTypesData, sessionState)`.

5-pass logic: direct type interest → origin escalation → sensitivity alert → incoming threats → rebel cell check. Returns prioritized `interested_factions` array sorted by interest level, `incoming_threats` for off-planet dispatch, and optional `rebel_cell` from AoR presets.

### Map Components

Each encounter zone now includes a `map_components` array — flat list of spatial elements the GM can arrange on a map. Checkpoint: 8, Cantina: 7, Supply Depot: 6, Loading Docks: 7.

### Navigation Layer (`public/data/navigation/`)

| File | Entries | Purpose |
|------|---------|---------|
| `planets_nav.json` | 1,981 | Lightweight planet entries (id, name, system, grid, region, sector) |
| `grid_index.json` | 236 squares | Grid-square-to-planet lookup for blind jump destinations |

Imported from CSV spreadsheet. 1,972 planets with grid coordinates, 9 without. Region distribution: Outer Rim 780, Mid Rim 469, Inner Rim 205, Expansion Region 161, Core Worlds 148, Colonies 97, Wild Space 49, Unknown Regions 37, Deep Core 31.

---

## 5a. GM Toolkit — Galaxy-Level Faction Records (`public/data/factions/`)

**Verified 2026-06-03: 27 files = 25 galaxy-level faction records + `faction_index.json` + `isb_dossier_content.json`** (up from the 5 documented below). Extracted from FFG sourcebooks; standalone files separate from planet-local faction data. The 25 records: black_sun, bothan_spynet, bounty_hunters_guild, broken_horn_syndicate, corellian_government, corporate_sector_authority, crimson_dawn, free_ryloth_movement, gerreras_partisans, guardians_of_the_whills, hutt_cartel, imperial_bureaucracy, imperial_military, imperial_security_bureau, inquisitorius, knights_of_ren, mandalorian_clans, mon_calamari, pyke_syndicate, rebel_alliance, separatist_remnants, sorosuub_corporation, trandoshan_slavers, wookiee_clans, zann_consortium. The table below details only the original 5 and has not been expanded to the full 25.

| Faction | Size | Source Refs | Prominent Figures | Notes |
|---------|------|------------|-------------------|-------|
| hutt_cartel | 13 KB | 12 | 5 | 4 sourcebooks (EotE, AoR, Suns of Fortune, Holocron) |
| imperial_military | 20 KB | 35 | 5 | Most comprehensive — 9 branches detailed |
| black_sun | 13 KB | 3 | 11 | All 9 Vigos named with species |
| rebel_alliance | 18 KB | 10 | 6 | Full civil government + military org from AoR |
| knights_of_ren | 27 KB | 28 | 0 | Not in FFG; Inquisitorius analog with full FaD chapter data, 7-step creation system, campaign guidance |

Each file has: id, name, type, overview, history, how_they_operate, territory, prominent_figures, enemies, allies, motivations, mcguffin_interest, regional_presence, source_refs.

---

## 5b. GM Toolkit — Skill Check Templates

### `public/data/skill_check_templates.json`
9 skills with tiered results (easy, moderate, hard). Extracted from mapGenerator.js. Skills: Perception, Streetwise, Skulduggery, Computers, Vigilance, Stealth, Charm, Coercion, Mechanics.

---

## 6. Visual Assets

### Species Portraits
`public/SWDataSet-Master/species_portraits/` — **117 PNGs** from OggDude dataset.

### Equipment SVGs
`public/SWDataSet-Master/EquipmentSVGs/` — **434 SVGs** converted from OggDude PNGs via vtracer. Black silhouettes using `currentColor` fill. Category fallbacks: `_fallback_weapon.svg`, `_fallback_armor.svg`, `_fallback_gear.svg`.

### Scene Assets
`public/Assets/` — Cave safehouse background (1536×1024), hotspot character art, datapad frame, narrative overlays. ~12 files across subdirectories.

### PDF Character Sheet Templates
`public/pdf/templates/` — 3 form-fillable PDFs (EotE, AoR, FaD) used for character export.

---

## 7. Species Visual Definitions

### `speciesVisualDefs.js` (~23 KB) — _pre-migration path `src/data/`; not present under that path post-migration; current location unverified_
21 species entries (10 detailed, 11 brief) for DALL-E 3 portrait generation. Each has: canonicalName, tier, silhouette, anatomy, distinguishing features, face, avoid rules.

---

## 8. External Reference Library

### PDF Library
223 PDFs total. 108 with OCR text, 115 image-only.

| Category | Count | Text | Key Contents |
|----------|-------|------|-------------|
| Core Rulebooks | 3 | EotE ✓, AoR ✓, FaD ✓ (partial OCR — most pages readable, some gaps) | Rules, adversaries, equipment, Force powers |
| Career Sourcebooks | 18 | All ✓ | Career-specific adversaries, gear, locations |
| Era Sourcebooks | 4 | All ✓ | Clone Wars, Dawn of Rebellion, Rise of Separatists, Collapse of Republic |
| Equipment Sourcebooks | 2 | All ✓ | Gadgets and Gear, Starships and Speeders |
| Adventures | 20+ | ~15 ✓ | Full encounter designs, NPC stat blocks, maps |
| Beginner Games | 3 sets | Mixed | Complete starter adventures with maps |
| GM Kits | 3 | All ✓ | GM screens, additional rules, short adventures |
| Talent Trees | 14 | All ✓ | Complete talent tree index (185p compiled) |
| Holocron | 1 | ✓ | 111p compiled rules from all 3 core books |
| Reference/Fan | 15+ | ~12 ✓ | Adversary cards, unofficial sourcebooks |

Accessed via `python3 pdf_ref.py` — search, read, render commands. Registered aliases in `Docs/pdf_sources.json`.

### PDF Inventory: `Docs/pdf_inventory.json`
Machine-readable index of all 223 PDFs with page counts, text availability, and file sizes.

---

## 9. Documentation

| File | Purpose |
|------|---------|
| `Docs/ENCOUNTER_GENERATOR.md` | Beat system architecture, data flow, output schema |
| `Docs/FFG_ENCOUNTER_RULES.md` | Compiled encounter design rules from all 3 core books + Holocron |
| `Docs/DATA_CONTRACTS.md` | readBind/writeBind namespace contract for character data |
| `Docs/STATE_MODEL.md` | Character domain model (identity, species, career, skills, gear) |
| `Docs/UI_RULES.md` | Blue digital palette, spacing tokens, touch targets |
| `Docs/PROJECT_ARCHITECTURE.md` | Module load order, component hierarchy |
| `Docs/VISUAL_DESIGN_BRIEF.md` | Cave visual language, LucasArts-modern hybrid |
| `Docs/CHARACTER_IMAGE_PROMPT.md` | DALL-E 3 portrait prompt design spec |
| `Docs/FUTURE_FEATURES.md` | Planned GM toolkit, encounter builder, dice calculator |
| `Docs/LIBRARY_INDEX.md` | Quick-reference for PDF library by topic |
| `Docs/NAVIGATION.md` | All screens/views in all three apps (Player, GM, Dice) — stable IDs, source anchors, Mermaid sitemaps. Supersedes the former `APP_SCREENS.txt`. |

---

## 10. Gaps — What Doesn't Exist Yet

### Structured Data — Completed
- [x] Galaxy-level faction definitions — 5 factions extracted
- [x] Planet records beyond Nar Shaddaa — 79 total planet files (69 compendium + 7 sourcebook + 3 new)
- [x] Schema v2.0 migration — all 79 files reconciled with record_depth field
- [x] 20 planets promoted to full GM toolkit depth
- [x] AoR + FaD adversary stat blocks — 136 total archetypes
- [x] FaD Core Rulebook OCR — partial OCR, most pages searchable
- [x] Navigation layer — 1,981 planets with grid coordinates + grid index
- [x] Planet Compendium PDF — all 77 pages extracted

### Structured Data — Remaining
- [ ] District records beyond Main Docking Platform (only 1 of potentially 27+ districts for full-depth planets)
- [ ] Promote remaining 52 identity-depth planets to full depth (prioritize by campaign relevance)
- [ ] Resolve 117 `needs_authoring` gaps across 27 promoted planets (see `gap_report.json`)
- [ ] Career sourcebook adversaries (5-15 per book × 18 books)
- [ ] Adversary Cards PDF parsing (61p, ~20 unique NPCs not yet in archetypes)
- [ ] Adventure module encounter data (15+ modules unextracted)
- [ ] Beginner game encounter structures
- [ ] Vehicle stat blocks surfaced for GM use (415 exist in oggdude but unused)
- [ ] Force power trees surfaced for GM reference (21 exist in oggdude)
- [ ] Structured loot/reward tables from gear data
- [ ] Mandalorian NPC archetypes (0 entries)

### Raw Data Available But Unstructured
- 223 PDFs searchable via `swrpg_index.py` (see `Docs/PDF_LIBRARY.md`) but not extracted into JSON
- FaD Core Rulebook has partial OCR (most pages readable, some image-only gaps)
- Talent tree compiled index (185p, has text) — not yet parsed
- Corellian Sector Sourcebook — partially used (Corellia promotion), more data available
- Hutt Space Sourcebook — partially used (Nal Hutta promotion), more data available
- Alliance Worlds Sourcebook — partially used (Mon Cal, Hoth, Sullust), more data available
- Nexus of Power — partially used (Dagobah, Ilum, Ossus, Naboo), more vergences available

### Character Creation App Gaps
- [x] ~~Rebel NPC archetype pool~~ — expanded to 13 entries
- [ ] No Mandalorian archetypes
- [ ] Force power browsing/purchasing not implemented
- [ ] Vehicle selection not implemented
- [ ] Cantina NPC generator blocked on art assets

### Beat System (Shelved)
The following files are from the retired beat-based encounter generator. Not deleted but not being built on:
- `public/data/locations.json` (40 generic location premises)
- `public/data/room_templates.json` (60 room templates)
- `public/data/story_clusters.json` (85 micro-scenes)
- `public/data/object_states.json` (68 objects with states)
- `public/data/flow_rules.json` (graph constraints)
- `mapGenerator.js` (beat generator + encounter prompts) <!-- pre-migration src/mapgen/ -->

The district schema replaces this system for GM toolkit purposes.

---

## 11. Migration Notes

### Browser cache contract for `/public/data/**`

Data files under `/public/data/` are mutated in place by ETL scripts at stable URLs. The `_headers` policy was updated 2026-05-25 from `max-age=31536000, immutable` to `max-age=300, must-revalidate` so etag re-validation keeps returning users in sync with the latest ETL output. **All future data work must honor this contract**: never re-introduce immutable headers on these paths unless the URLs themselves become content-addressed (hash-suffixed filenames).

### Cache-bust query params on stale-cached libraries (task #22, oggdude migration)

The 2026-05-25 `_headers` fix protects all *future* visitors and any user whose browser cache has expired the old immutable response. It does **not** unstick users whose browsers are still holding the year-long immutable JSON they cached before the fix shipped. For those browsers, the only way to force a re-fetch is a URL change.

`VehicleLibraryController.js` was bumped with a one-shot `?v=2026-05-25a` query string when the acute symptom surfaced (raw `srLong` + abbreviated weapon keys on `/gm/yard/ASSERTOR`). The other `/public/data/**` consumers — NPC library, encounter store, GM toolkit config, character-creation flow, narrative mechanics — have the same latent risk: any returning user who visited before 2026-05-25 sees frozen versions of those files indefinitely. We deliberately deferred bumping them now because they overlap with the unscheduled task #22 migration.

**When task #22 begins, each migration step that touches files under `/public/data/**` at stable paths MUST also do one of the following at the corresponding fetch site:**

1. Bump (or introduce) a `?v=<date>` query-string constant in the controller that consumes those files (matches the `VEHICLE_CACHE_VERSION` pattern in `lib/vehicles/VehicleLibraryController.js`).
2. Migrate the files to new paths — natural URL change handles cache-bust without a version param.
3. (Optional, larger lift) Adopt build-time content-hash suffixing for data filenames; the `_headers` policy can then mark hashed paths as immutable safely. This is the durable end-state; deferred until after task #22 reduces the surface area.

Fetch sites currently affected:
- `lib/vehicles/VehicleLibraryController.js` — bumped 2026-05-25
- `lib/npc/NpcGeneratorController.js`
- `lib/npc/createEmptyNpc.js`
- `lib/gm/encounterStore.js`
- `lib/gm/GmToolkitController.js`
- `gm/index.html` (inline fetches)
- `player/index.html` (inline fetches)

If a migration step has reason to keep paths stable AND knows it has not changed the data shape since the last deploy, the bump can be skipped — but the default should be: bump on every shape change to keep returning users honest.
