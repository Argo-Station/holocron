# VEHICLE PLUMBING — the census of the vehicle module

**Commission.** Jason, 2026-09-23, verbatim: *"I want this expanded to a comprehensive document for another
agent to work on a vehicle module that will expand the current one. I need documentation as granular as was
done for the player creator."* Written by the ui_architect seat under Jason's grant for exactly this file and
the expanded [`Docs/RULES_FOUNDATION_VEHICLES.md`](RULES_FOUNDATION_VEHICLES.md) (its sibling: the rules).
Read-only recon. **This document MAPS; it does not fix, and it decides no design.**

**STATUS: UNRULED CENSUS.** No ruling adopts it yet. It is the entry point for whoever builds the expanded
vehicle module. It is a **living map**: whoever changes vehicle plumbing keeps it current (§12).

> **AMENDMENT — the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06).** The K9 switch is retired and its OFF faces are DELETED on both hosts: `VesselSheet`
> (dark and `paper`), `VesselsTab` and the 20 helpers only they reached (`StepRow`, `ProvenanceBlock`, `TrackRowP`,
> `crewRowP`, `WeaponToHitP`, `AttachmentsSectionP`, `ProvenanceBlockP`, `yardVehicle`, `attMods`, `WARN_AMBER`,
> `AttachmentDetail`, `AttachmentPicker`, `AttachmentsSection`, `CREW_MANEUVERS`, `CREW_ACTIONS`, `CrewActionsCard`,
> `DIFF_PURPLE`, `WeaponToHit`, `WeaponsSection`, `CritList`) in `vesselView.jsx`; `YardEntry` and `ViewBar` in
> `yardView.jsx`; `SheetVessels` (and the sheet's `'vessel'` room) and `PlayerYardScreen` in `player/app.jsx`;
> `ShipYardScreen`, `GM.YARD.SHIP` and its `vehicleKey` sub-route in `gm/app.jsx`; `yardVehicleKey` on both hosts.
> The S4 Yard (`YardHangar`, `YardShip`, `YardCatalogue`, the hosts `PlayerYardS4` / `GmYardS4`, the sheet's
> `SheetVesselsS4`) is the only vehicle face. `YardBrowse` and `useYardState` STAY (MATRIX, `GmYardMatrixS4`).
> **Sections that describe a deleted face are kept as the record of what was measured at `934c9d24`** and carry a
> RETIRED line (§0.1, §0.2, §3.1–§3.3, §8.1, §8.2); §6's rows on those faces are marked, never deleted (§12.3).

**Measured against** `carry/audit-2026-09-11` = **`934c9d24`**. The vehicle files are byte-identical on live:
`git diff 934c9d24 cf4143a0` (local `commercial` at writing) is empty for every vehicle path
(`lib/shared/{vesselStore.js,vesselView.jsx,yardView.jsx,shipSchematic.js,syncMerge.js,oggImport.js,oggExport.js}`,
`lib/vehicles/`, `lib/gm/`, `lib/game/`, `lib/library/npc/`, `gm/`, `public/data/vehicle-library/`,
`public/data/canonical/vehicle-attachments.json`, `Docs/NAVIGATION.md`, `Docs/SHIPYARD_Y2_SCHEMA.md`); the
only `player/app.jsx` delta is +11/−11 at five hunks outside `SheetVessels`/`PlayerYardScreen`, so **no line
below moves**. The lab census also diffed against `origin/commercial` `7edfa882` with the same result
(`4_plumbing.md` §6.0). **Every finding here is a finding about production.**

> **A NOTE ON CITES.** This map anchors on **symbols** (`VesselSheet`, `resolveShields`) because line numbers
> rot. Where a `file:line` appears it was **measured at `934c9d24`** and re-confirmed unmoved at `cf4143a0`
> for the vehicle files; trust the symbol first. The research this map assembles lives in the ui-lab worktree
> (branch `lab/ui-playground`), each file at its commit: `lab/vehicles/out/4_plumbing.md` @ `e887996c` (the app
> census, driven in a real browser) · `3_registry.md` @ `a70924e6` (data census) · `5_decisions.md` @
> `fb094897` (history and contracts) · `1_raw_core.md` @ `71091a85` and `2_raw_supplements.md` @ `ccf0233a`
> (the RAW registers, carried into RULES_FOUNDATION_VEHICLES) · `6a/6b/6c_corpus_*.md` @ `6b681241` /
> `b93d81f3` / `b7f38b10` (book catalogues). A finding carried from them names its section, e.g. `(4 §2.4)`.

---

## PLAIN SUMMARY (for Jason)

**What the module is today.** The app treats a ship as a *record that remembers*. You can browse 433 ships in
the Ship Yard on both apps, open any one (schematic, firing arcs, stats, art for 309 of them), and add it to
the party (GM) or to a character (player). That owned ship — a **vessel** — then keeps its own hull trauma,
system strain, per-zone shields, critical hits, installed attachments, name and history log. It shows on the
character sheet's VESSELS tab (dark and paper), and it syncs through accounts. Separately, the GM's ENCOUNTERS tab
can put **craft** into an encounter and seat NPCs aboard as crew and pilot. Around that sit a "what do I roll
to hit" helper (the book's silhouette table, exactly right on all 121 pairs), a crew-actions reference card,
a hyperspace route planner on the GM map, and a Hyperspace Run mini-game. I drove every control in a real
browser and reloaded: **on a single tab, every vessel edit survives.**

**What is broken — two of these lose people's data today, silently:**

1. **LIVE DATA LOSS — two tabs erase each other's ships (V-2).** Every screen keeps its own copy of the whole
   fleet and saves the whole list on every tap. Measured: a player adds an X-wing in one tab, the GM taps hull
   on the party ship in another, and the X-wing is gone — any owner's ships, not just your own.
2. **LIVE DATA LOSS — the "newer save" protection is switched off by the first tap (V-1).** A fleet saved by a
   newer app version is meant to be read-only on an older tab. One hull tap rewrote it in the older shape and
   threw the newer fields away. That protection exists precisely for the vehicle programme's planned save
   bumps, so the first expansion that bumps the vessel save would lose data on any stale tab.
3. **Ships get orphaned (V-3, V-4, V-5).** Buy a ship from the player Yard before opening any character and it
   is filed under an owner no sheet shows. Delete a character and its ships stay behind, listed nowhere.
   Decommission a ship and no deletion record is written, so signing in on a second device brings it back.
4. **An OggDude character file never brings a ship across (V-6)** — even one we have. The importer is never
   handed the ship list, so every ship reads "not in our vehicles registry"; export always writes none.

**Where the build and the books disagree (RAW decides, R-RRD-1):** hull and strain stop *at* the threshold,
but the book's crippled and systems-down states begin when you go *past* it (V-9); shield angling lets every
zone go up at once, where the book moves one point from one zone to another (§4.3); travel time is our own
distance formula, not the book's Table 7-14 (§4.8).

**What the expansion needs, measured rather than wished.** Nothing in the app runs a vehicle at the table:
no vehicle roll, no combat round, no crit table on screen (the data for it exists and nothing mounts it),
nothing happens at the thresholds, and **no attachment or vehicle talent changes any number** — all 120
attachments and 72 of 74 vehicle talents are prose only, and there is no vehicle-combat code for them to hook
into. The data has real holes too: fractional hyperdrive classes (0.5, 1.5) are dropped to blank at ingest,
and each ship's one-off custom weapons are dropped entirely (a Trident assault ship loses its tentacles and
boarding drill). And the biggest shape question comes first: **there are two unrelated kinds of "ship in
the app"** — a party/character *vessel* that can be damaged, and an NPC-encounter *craft* that is only a name
and a crew list — and neither knows the other exists (fork F-1). The vehicle programme Jason approved on
2026-08-04 (14 decisions, phases P1–P5) is entirely unbuilt and has no board row (§9.2).

Everything here is a fact with its evidence. The design questions are listed as forks in §11, not answered.
**V-1 and V-2 stay in these documents for the next production seat to file (Jason, 2026-09-23); this seat
did not write `Docs/BOARD.md`.**

---

## 0. THE DOORS — every entry that reaches a vehicle surface

### 0.1 The module, file by file

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** `window.SWRPGVesselView` no longer exports `VesselSheet`/`VesselsTab`, and `window.SWRPGYard` no longer exports `YardEntry`/`ViewBar` (see the AMENDMENT at the head).

| file | global it exposes | loaded by | role |
|---|---|---|---|
| `lib/vehicles/VehicleLibraryController.js` | `useVehicleLibraryController` (bare function) | `gm/index.html`, `player/index.html` | fetches the 9 shards + image manifest; `getVehicleByKey`; GM affiliation overrides (the image-manifest fetch and `getVehicleImagePath` retired 2026-10-15 by shipyard-schematic-build) |
| `lib/shared/vesselStore.js` | `window.SWRPGVessels` | both shells | the vessel record: normalize, ops, budget, fit, shields, save/load (15 exported keys) |
| `lib/shared/vesselView.jsx` | `window.SWRPGVesselView = {VesselSheet, VesselsTab}` | both shells | the living vessel sheet, dark and paper faces; "pure presentation over injected state" |
| `lib/shared/yardView.jsx` | `window.SWRPGYard = {YardBrowse, YardEntry, useYardState, ViewBar, YARD_AFFILIATION_LABELS}` | both shells | the one Yard browse + entry both apps mount |
| `lib/shared/shipSchematic.js` | `window.SWRPGShipSchematic` (+ `module.exports`) | both shells | schematic geometry, zones, arcs, `silhouetteDifficulty` (Table 7-4); since 2026-10-15 also THE SHIP IDENTIFIER (`Small`/`Large`, the SMALL/FULL forms; `formFor`) and its placement table `HOSTS` (shipyard-schematic-build); `hullGlyphFor` retired |
| `lib/shared/syncMerge.js` | `window.SWRPGSyncMerge` | all three shells | account-sync merge for the vehicle keys |
| `lib/library/npc/benchStore.js` | `SWRPGNpcBench` | GM + player shells | bench v6: `group.vehicles[]`, `member.vehicle` |
| `lib/library/npc/view.jsx` | NPC library view | GM + player shells | `BenchGroupCraft`, `BenchMemberCraft`, `VehiclePanel`, a second vehicle-library loader |
| `lib/gm/pathfinding.js` · `lib/gm/travelTime.js` | `GmPathfinding` · `GmTravelTime` | GM shell only | route graph, travel time, astrogation pool |
| `lib/game/hyperspaceRun/{data,rules}.js`, `ui.jsx` | `HyperRunData`, `HyperRun`, `HyperspaceRunGame` | GM shell only | the Hyperspace Run mini-game |
| `lib/shared/roomState.js` | `SWRPGRoomState` | GM + player shells | HOLOTABLE room state — **holds no vehicle state** by ruling (§8.3) |
| `lib/shared/ui.jsx` | `ManeuversCard`, `ResultsReference`, `CritTableRef` in `window.SWRPGUI` | all shells (in `vendor.js`) | reference overlays |
| `lib/shared/oggImport.js` · `oggExport.js` | `SWRPGOggImport` / export | player only | OggDude `<Vehicles>` paths |

Both shells carry `<base href="/">`, so the modules' relative `fetch('public/data/…')` calls resolve from the
root on nested routes such as `/gm/yard/T65BXWING` (4 §0.2).

### 0.2 The doors

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** every door below that lands on `ShipYardScreen`, `PlayerYardScreen`, `SheetVessels`, `GM.YARD.SHIP` or the sheet's vessel room now lands on the S4 Yard (NAVIGATION `PLAYER.YARD.*` / `GM.YARD.*`, U9).

Screen IDs are [`Docs/NAVIGATION.md`](NAVIGATION.md)'s; "not named" means NAVIGATION declares no ID for it.

| # | door | app | screen ID | route | host component |
|---|---|---|---|---|---|
| D1 | Ship Yard browse — INDEX · MATRIX · VESSELS | GM | `GM.YARD` | `/gm/yard` (+`?q,cat,affil,role,silMin,silMax,hd,hide,sort,dir,view`) | `ShipYardScreen` (`gm/app.jsx`) → `SWRPGYard.YardBrowse` |
| D2 | Ship entry + ＋ADD TO PARTY + GM Edit affiliation | GM | `GM.YARD.SHIP` | `/gm/yard/{vehicleKey}` | `ShipYardScreen` detail branch → `YardEntry` |
| D3 | Living vessel sheet (party) | GM | `GM.YARD.VESSEL` | **no route** — `openVesselId` state over `/gm/yard` | `VesselSheet` (dark, `capabilities:{gm:true}`) |
| D4 | Ship Yard browse — INDEX · VESSELS | Player | `PLAYER.YARD` | `/player/yard` (same query keys) | `PlayerYardScreen` (`player/app.jsx`); doors: landing `YARD_CARD`, bottom bar Yard, sheet VESSELS ＋ACQUIRE |
| D5 | Ship entry + ＋ADD TO YOUR VESSELS | Player | `PLAYER.YARD.ENTRY` | `/player/yard/{vehicleKey}` | `PlayerYardScreen` → `YardEntry` (`capabilities:{gm:false}`) |
| D6 | Vessel sheet right after acquisition | Player | not named | **no route** — `openVesselId` over `/player/yard/{key}` | `PlayerYardScreen` → `VesselSheet` (dark) |
| D7 | Sheet VESSELS tab (legacy dark sheet) | Player | `PLAYER.SHEET.VESSELS` | `/player/sheet/{id}` (the tab is state) | `SheetVessels`; the yard bar's VESSELS jump uses sessionStorage `_yard_jump_page` |
| D8 | Paper sheet VESSELS unit (recognition rows) | Player | not named (paper sheet, dark behind `swrpg_sheet_transplant`) | `/player/sheet/{id}` | `SheetVessels paper` |
| D9 | Paper **vessel room** | Player | not named | none — `room === 'vessel'` state | `SheetVessels paper initialOpenId` → `VesselSheet paper` |
| D10 | Landing yard figure ("N canon ships…") | Player | `PLAYER.LANDING` | `/player` | `PlayerLanding` (legacy, reads `index.json`) · `LandingPaper` roll-call (`rollcall.json`) |
| D11 | ENCOUNTERS **CRAFT IN THIS ENCOUNTER** + per-member ABOARD / PILOT | GM (player host mounts the library with `canSeedEncounter:false`, so no encounters) | inside `GM.NPC` (no own ID) | `/gm/npc` | `BenchGroupCraft`, `BenchMemberCraft` (`lib/library/npc/view.jsx`) |
| D12 | Phone-tier NPC cards' **+ ADD VEHICLE** (never saves — B-274) | GM + Player | inside `GM.NPC` / player npc | `/gm/npc`, `/player/npc` | `VehiclePanel` mounted by `MinionRefCard`, `RivalCard`, `NemesisCard` |
| D13 | Universe map route planner (hyperdrive-class chips) | GM | `GM.MAP` → Map controls → Route | `/gm/map` | `UniverseMapRoutePanel` |
| D14 | Hyperspace Run | GM | `GM.MAP` → Map controls | `/gm/map` (overlay) | `HyperspaceRunGame` |
| D15 | Maneuvers card **STARSHIP** tab | all | SuiteBar ⚙ "Maneuvers & actions" | overlay | `ManeuversCard` (`lib/shared/ui.jsx`) |
| D16 | Results Reference **starship** chip | all | `HOLODICE.RESULTS` | overlay / HoloDice tab | `ResultsReference` |
| D17 | Critical-hit table, **vehicle** variant | — | — | — | `CritTableRef` — **latent: no mount passes `variant:'vehicle'`** (§7 D-1) |
| D18 | OggDude import — `<Vehicles><CharVehicle>` | Player | `PLAYER.IMPORT` | `/player/import` | `oggImport.js` parser + manifest; **the host index carries no `vehicles`** (V-6) |
| D19 | OggDude export — `<Vehicles/>` | Player | `PLAYER.IMPORT` export lane | — | `oggExport.js` emits `Vehicles: []` unless `opts.rigger` makes the character its bonded ship's Signature Vehicle holder: then ONE `<CharVehicle>` plus `Rigger · VehicleKey` = its `Key` (lap `release-r5-rigger`, card ADDENDUM 2 C3; the files room's `runExport` hands it, with the vehicle library the room's boot loads: ruling `release-r5-rigger` CONDITION 2; the import's `settleRigger` call waits for F1) |
| D20 | Account adoption prompt ("Your changes to vehicles") | all | `ConflictPrompt` overlay | — | copy table in `lib/shared/ui.jsx` |

**What there is NOT a door to** (grep over `player/`, `gm/`, `lib/` — 4 §0.3): a store or shelf that sells a
vehicle; a credits debit on acquisition (`vesselStore.js` header: "NO financing math / wallet", R-SY3); a
HOLOTABLE event that carries a vehicle; a URL for an open vessel sheet on either app; a ship-compare surface
(F-13, parked); a vehicle-combat tracker of any kind.

---

## 1. INPUTS — every data file the vehicle module fetches

Measured in the browser on `/gm/yard`, `/gm/yard/YT1300`, `/player/yard`, `/player/yard/T65BXWING` and the
paper vessel room at 1280×900 and 402×874: **every vehicle request 200, zero non-2xx, zero non-benign console
errors** across all four drives (4 §1).

| # | path | fetched by | consumed by | size · records | read? |
|---|---|---|---|---|---|
| 1 | `public/data/vehicle-library/{9 shards}.json?v=…` | `VehicleLibraryController` (`VEHICLE_SHARDS`, hard-coded) | `allVehicles` → `getVehicleByKey` → every Yard/vessel surface | 1,840,697 B · **433** (starfighters 69 · freighters 51 · capital_ships 54 · transports 56 · patrol_gunships 22 · airspeeders 37 · landspeeders 74 · walkers_tanks 31 · support 39) | ✓ |
| 2 | `vehicle-library/index.json` | controller | stored as `libraryIndex` — **no consumer** | 2,445 B | **✗ fetched, never read** |
| 3 | `vehicle-library/taxonomy.json` | controller | stored as `taxonomy` — **no consumer** (`yardView.jsx` keeps its labels inline) | 3,274 B | **✗ fetched, never read** |
| 4 | `vehicle-library/images/manifest.json` | controller | `getVehicleImagePath` → Plate 1 | 309 keys | ✓ — **124 of 433 ships unmapped** (the schematic stands in); **20 PNGs referenced by nothing** (18 `Default*.png`, `ATRT.png`, `YV545.png`, 1,380,085 B) · **RETIRED 2026-10-15 by shipyard-schematic-build** (card R-SSB-4/5; files deleted in `3fe817caa`); the manifest fetch and `getVehicleImagePath` left the controller in `39aa88c06` |
| 5 | `vehicle-library/images/<KEY>.png` | `<img>` in `YardEntry` | Plate 1 | 329 PNGs, 30 MB | ✓ per entry · **RETIRED 2026-10-15 by shipyard-schematic-build** (card R-SSB-4/5; files deleted in `3fe817caa`); the ship identifier draws Plate 1 (§1.1) |
| 6 | `public/data/canonical/vehicle-attachments.json` | `vesselView.jsx` `loadAttachments` (module-cached) | both faces' ATTACHMENTS sections, the picker, `resolveBudget`'s hp lookup | 150,045 B · **120** | ✓ — the ONLY reader of this registry |
| 7 | `vehicle-library/index.json` + 9 shards, **no cache-bust** | `lib/library/npc/view.jsx` | `refData.vehicles` → `VehiclePanel`, `benchVehicleRecord` | same 1.84 MB, a second copy | ✓ — **a second loader of the same registry**, outside the controller's `VEHICLE_CACHE_VERSION` bust |
| 8 | `vehicle-library/index.json` (no bust) | `PlayerLanding` | `total_entries` → the SHIP YARD tagline | 2,445 B | ✓ |
| 9 | `public/data/canonical/rollcall.json` | paper landing | `figs.yard` → "N vessels"; yard door names | `populations.yard = 433` | ✓ (paper landing only) |
| 10 | `public/data/canonical/maneuvers_actions.json` | `ManeuversCard` | STARSHIP tab | starship 10 rows; cite "eote p.232" | ✓ when the tab is chosen |
| 11 | `public/data/canonical/spend_tables.json` | `ResultsReference` | the `starship` chip | keys general/combat/starship | ✓ when chosen |
| 12 | `public/data/canonical/crit_tables.json` | `CritTableRef` | **the `vehicle` table (19 rows, Table 7-9) is read by no mount** | character 29 rows, vehicle 19 | **✗ vehicle half unread** |
| 13 | `public/data/gdr_planets_mapped.json` + `gdr_routes_final.json` | `gm/app.jsx` map | `buildNavGraph`, route panel, Hyperspace Run | 2,077 planets · 65 routes | ✓ (GM map only) |
| 14 | `lib/game/hyperspaceRun/data.js` (inline) | script tag | `HyperRun` rules | 5 hand-typed SHIPS | ✓ — **stat copies, not id-refs** (§4.7) |
| 15 | `/lib/shared/oggCsgMap.json`, `oggAttestation.json` | player import | OggDude import/export | — | ✓ — but no vehicle registry reaches the import index (V-6) |

### 1.1 The picture chain (shipyard-schematic-build, 2026-10-15)

Every ship picture slot draws through `vesselView.jsx`'s `Art` (plus `FitRing`, `FitPhoneRing`, `CatArcs`): **the owner's
own picture (`rec.image`) wins, else the ship identifier** from `shipSchematic.js` (D-196). The slot names its host id;
`HOSTS` in `shipSchematic.js` is D-212's placement table and decides SMALL or FULL (and, for "full when wide" hosts, the
width at which FULL starts). The archive step (rows 4–5, the manifest and its PNGs) is gone: there is no third source.
The workbench draws the FULL schematic above `FitHardPoints` when the ring is not drawn (`fit-list-head`, R-SSB-11).
Guards: `test/ship_identifier_fidelity.cjs` (markup identical to the approved lab drawing @ ui-lab `c5ba89356`),
`test/ship_identifier_placement.cjs` (every call site names a host; the table matches D-212; FOLD coverage over 433).

**Not fetched by any vehicle surface:** a vehicle-weapon registry (none exists — vehicle weapons are baked
into each shard row at build; `canonical/weapons.json` declares "personal-scale weapons only (vehicle … filtered
at ingest)", 3 §3); `data-sources/oggdude_current/…/cotr_vehicles.json` and `data-sources/oggdude_merged.json`
(build inputs only). **The vehicle library is not under `public/data/canonical/` and has no JSON schema and no
`validate_registries` layer** — its only shape guard is `test/vehicle_weapon_profiles.cjs` (R-VAR-2; 5 §3 C19).

### 1.1 The registry the module reads — what the data holds

Full census: 3 §1–§8. The facts a builder needs first:

- **433 records, 43 top-level fields**, shards sum to `index.json`'s `total_entries: 433` (`schema_version:
  "vehicle-library-1"`, `generated_from: oggdude_merged.json`). 432 `stats_complete`, 1 description-only.
- **Coverage of the RAW profile**: silhouette and system strain 100%; speed 99.1%; hull trauma 99.3%; armor
  94.0%; handling null on 41 (a genuine source gap — the OggDude source lacks it, 3 §6); defense always a
  dict (fore null 77, aft 97, port/starboard 139); `hyperdrive_primary` int or null (118 null); navicomputer
  `"yes"`/`"no"`/null; `massive` 0–4 (29 ships > 0).
- **Weapons**: 925 rows on 313 ships (120 unarmed), **60 distinct keys**, each row `{key, name, damage, crit,
  range_value, range_label, count, location, turret, retractable, qualities (always empty), skill,
  qualities_resolved[], firing_arcs{fore,aft,port,starboard,dorsal,ventral}}`. All 1,424 quality refs
  resolve against `qualities.vocab.json`. No `scale` field anywhere (B-216).
- **Attachments**: 120, schema `vehicle-attachment.schema.json` v1; `hp` null on 24 (the source lists none),
  constraints on 68 (`type_limit` 18 · `max_size` 16 · `item_limit` 15 · `category_limit` 10 ·
  `must_be_starship` 10 · `min_size` 7 · `must_have_hyperdrive` 1). **0 of 120 carry a machine-readable
  effect** — every `base_mods`/`added_mods` item is `{description, rank?}` (by contract C5: display prose only).
- **Vehicle talents**: 74 of 647 talents are true vehicle talents after hand classification of 192 keyword
  hits; **2 carry `pool_mods`** (Galaxy Mapper, Skilled Jockey), **0 carry `effects[]`**. `lib/shared/poolMods.js`
  and `mods.js` contain no vehicle reference (re-grepped at `cf4143a0`: 0 hits).
- **Force**: Manipulate carries the vehicle repair / system strain / hull trauma abilities (5 nodes); Move's
  Hurl (10 × silhouette) and Enhance's two Piloting control nodes are the other real hits. No F-100 data.
- **Skills**: the five vehicle skills are in `skills.vocab.json` with EotE cites (Astrogation p.104,
  Gunnery p.120, Piloting (Planetary) p.115, Piloting (Space) p.116, Mechanics p.111); only `ace` carries all five.
- **What is not in any registry**: signature abilities (none converted), a vehicle-weapon registry, vehicle
  component / repair price tables, hyperspace travel-time tables, a crew-role vocabulary (`crew` is free text on
  every record — and R-F54C-1 bars a role field without a new ruling), Signature Vehicle as a sheet concept.

---

## 2. SAVE KEYS AND SCHEMAS

### 2.1 The keys

| key | written by | envelope / version | migration | version-ahead hold | synced? |
|---|---|---|---|---|---|
| `swrpg_vessels_v1` | `vesselStore.save`; callers: GM `ShipYardScreen` (`applyVessels`, `acquireVehicle`), player `SheetVessels.apply`, `PlayerYardScreen.applyVessels` + its acquire | `{v: 2, vessels: VesselRecord[]}`; each record also carries `v: 2` | v1 → v2: `normalizeVessel` backfills `attachments: []` and stamps `v: 2` on read; legacy `YYYY-MM-DD` `updatedAt` strings tolerated on read, refused by the merge | **FIXED `ee87e353` (V-1, B-912)**: a MODULE-LEVEL flag, set when the raw envelope reads ahead of `SCHEMA_V` (any envelope, even one whose list this build cannot read); `save` and the page store's `apply` refuse while it is set, whatever object they are handed; the hosts render the ruled banner + held controls. _Was, at `934c9d24`: `load` flagged the state object, every op returned a fresh one, and the first edit defeated it (§2.4)._ | ✓ LIST key, merged by `vessels[].id`; **whole-list write per edit** |
| `swrpg_gm_vehicle_overrides` | `VehicleLibraryController.setAffiliationOverride`, through `heldOverrides.apply` (`lib/shared/heldStore.js`, B-1732: the act reads the store) | bare map `{[vehicleKey]: {affiliation}}` — **unversioned** | none | none | ✓ WHOLE-envelope key; any difference on adoption is one prompt |
| `swrpg_npc_bench` (v6 `vehicles[]`, `member.vehicle`) | `benchStore.persist` | `{version: 6, groups:[{…, vehicles:[{id,key}], members:[{…, vehicle?:{id, pilot?}}]}]}` | v6 is additive over v5; a member aboard a craft the group no longer carries is dropped on normalize | `isAhead` → `__stale` → `persist` refuses — **sound**, and STATE-CARRIED, not module-level: `normalize` sets `stale` on the state it returns, every bench op `clone`s its input (`JSON.parse(JSON.stringify(state))` keeps the flag), and `persist` refuses `state.stale` (re-read 2026-09-24 by SHIP YARD S0 at `benchStore.js` `clone` + `persist`; this cell's first cut, after `npc-library-foundations-census` §3, called it module-level — the claim "sound" is kept, the mechanism is corrected) | ✓ LIST key by `groups[].id`; **suspended while a HOLOTABLE room is live** (`ROOM_SUSPENDED_KEYS`) |
| `swrpg_last_sheet_id` | the one sheet opener (B-407) | bare string | — | — | ✗ — read by `PlayerYardScreen` as the acquisition **owner** |
| `swrpg_player_active_session` | player app | `{selectedCharId, screen, savedAt}` | — | — | ✗ — **not cleared by entering the Yard**, so it re-routes a Yard reload (V-7) |
| sessionStorage `_yard_jump_page` | player app (yard bar VESSELS) | `'VESSELS'` | — | — | ✗ — read once and removed by the legacy `CharacterSheet` |
| URL query `?q,cat,affil,role,silMin,silMax,hd,hide,sort,dir,view` | `useYardState` (`replaceState`) | — | — | — | — (the only yard UI state that survives a reload) |

**Never persisted, by design or by omission** (each confirmed by code and, where marked, by a drive): the
open vessel (no route on either app — measured: reload returns to the VESSELS list or the sheet OVERVIEW);
the TO HIT target silhouette; the focused weapon arc; the CREW ACTIONS sheet's open state; the attachment
picker's search; the route planner's endpoints and hyperdrive class; **the whole Hyperspace Run** (no storage
call anywhere under `lib/game/hyperspaceRun/`); the phone NPC cards' `activeVehicle` (measured, B-274); the
canonical stats of any ship (the id-ref law, `vesselStore.js` header).

### 2.2 The exact save shape, captured from a real drive

GM, `/gm/yard/YT1300` → ＋ADD TO PARTY → every control (4 §2.2):

```json
{"v":2,"vessels":[{"id":"v_muehh8nh_5gnvg5","vehicleKey":"YT1300","owner":"party","nickname":"CENSUS HAWK",
  "acquired":{"note":"Added to the party from the yard.","when":"2026-09-23"},
  "provenance":[{"note":"CENSUS LOG 1","when":"2026-09-23"},{"note":"CENSUS LOG 2","when":"2026-09-23"}],
  "hull_current":2,"strain_current":1,
  "crits":[{"sev":"hard","label":null},{"sev":"easy","label":null}],
  "shields_current":{"fore":3,"aft":6},
  "attachments":[{"key":"ad_1s_cargo_pod","when":null,"note":null}],
  "v":2,"createdAt":1790190964493,"updatedAt":1790190972347}]}
```

The player's (`/player/yard/T65BXWING` → ＋ADD TO YOUR VESSELS) is the identical shape with
`"owner":"char:census-p1"` and `"acquired":{"note":"Acquired.",…}`; the paper room's with `"shields_current":{"port":2}`.

**Id-ref vs overlay.** Id-refs: `vehicleKey` (→ vehicle-library `key`), `attachments[].key` (→ vehicle-attachments
**`id`**, not `_source_key`), `owner` (`'party'` or `'char:<saved-character id>'`). Everything else is overlay.
The stat block is never copied; `shields_current` holds only the zones a crew re-angled and falls back to the
registry per zone (`resolveShields`).

**Fields no control ever writes:** `crits[].label` (every add passes `label: null`; no edit control exists) and
`attachments[].when/.note` (install passes nulls). `acquired` is written once and never displayed as itself —
it duplicates the first provenance line, which can be deleted.

**The owner vocabulary in code** is `'party'` (GM, the constant `VESSEL_OWNER`) and `'char:' + id` (player),
with two fallbacks outside the ratified vocabulary: `'char:unknown'` (`SheetVessels`, no id) and
`'char:player'` (`PlayerYardScreen`, no last-opened sheet — V-3). No `npc:` owner is written anywhere (5 §2.1, C10).

### 2.3 Documentation drift in the schema contract

[`Docs/SHIPYARD_Y2_SCHEMA.md`](SHIPYARD_Y2_SCHEMA.md), the file `vesselStore.js` names as its contract, still says:
envelope `{ v:1, vessels }`; `createdAt / updatedAt: string|null // ISO … never Date.now() in pure code`; `owner`
"a free label ('The Crew', a character name/id, 'GM')". The code writes `v: 2`, **ms-epoch numbers from
`Date.now()`** (`msNow`, stamped in `acquire`, `updateVessel`, `appendProvenance`, `removeAttachment` — the
C-B-8.2 change), and `party` / `char:<id>`. The contract was not updated with the code (V-15). The bench's
own header comment in `benchStore.js` likewise still documents `{ version: 5, … }` with no `vehicles`/`vehicle`.

**TRUED `345981fb` (B-914):** `SHIPYARD_Y2_SCHEMA.md` now matches `vesselStore.js` field by field — envelope
`v: 2`, the store's ms stamps, the shipped owner vocabulary with its two fallbacks, the sentinel and the page-local
store in its §3. The `benchStore.js` header's `version: 5` is NOT that card's (the bench file is PAPER's) and stays
open under V-15's second half (B-915).

### 2.4 ⚠ V-1 — the version-ahead sentinel does not survive the first edit (LIVE DATA LOSS)

Designed (`vesselStore.js`, the `load`/`save` pair; ruling `f54-downgrade-prompt`, Jason 2026-08-04 "F-54 users
get a prompt"): a save written by a newer build is flagged `stale` on load and `save` refuses a stale state, so a
newer build's fields are never stripped. **The flag lives on the state object `load()` returns — and every
operation builds a NEW object without it**: `updateVessel`, `appendProvenance`, `removeVessel`,
`installAttachment`, `removeAttachment` and `acquire` each return `{ v: SCHEMA_V, vessels: next }`. Every host then
calls `save(next)` on that fresh object, and `save` sees no flag.

Driven (`drive_edge.py`): planted `{"v":3, "vessels":[{… "v":3, "future_field":{"keep":"me"}}], "future_env":1}`,
opened `/gm/yard?view=vessels`, tapped ＋ on HULL TRAUMA once. **Storage after ONE tap:**
`{"v":2,"vessels":[{"id":"fut1",…,"hull_current":1,…,"v":2,…}]}` — `future_field` and `future_env` gone, the
envelope downgraded. No banner or read-only state rendered: `grep stale` over `vesselView.jsx`, `yardView.jsx`,
`ShipYardScreen`, `SheetVessels`, `PlayerYardScreen` returns nothing — no vessel host reads the flag, so the ruled
`THIS TAB IS BEHIND` hold cannot render on a vessel surface even when the flag survives. The bench store does **not** have this defect: its hold is inside `persist`
against a module-level flag, not on the state object. The guard `test/vessel_store.cjs` passes because it saves
the loaded stale state directly, never `save(updateVessel(stale, …))` — the path every host takes (§5).

### 2.5 ⚠ V-2 — whole-list writes from an in-memory copy: a second tab erases the first tab's ships (LIVE DATA LOSS)

Every vessel host keeps its OWN `useState(VS.load())` copy (GM `ShipYardScreen`, `SheetVessels`,
`PlayerYardScreen`) and every write is `VS.save(<that whole copy with one change>)`. Nothing listens for the
`storage` event (grep: none in the vessel files). The last tab to write wins for **every owner's** records,
because the owner split is a filter on read (`forOwner`), not a partition on write.

Driven (`drive_edge.py`, two pages, one browser context): tab 1 opens a party vessel on `/gm/yard?view=vessels`;
tab 2 acquires a T-65B for a character → storage `[CR90/party, T65BXWING/char:census-race]`; tab 1 taps HULL ＋ →
storage **`[CR90/party]`**; tab 2 reloads → the character's X-wing is gone. The same holds between the paper
sheet and the GM app on one machine (same origin, same key). **UNMEASURED:** whether account sync later
restores the erased record from the server copy — the signed-in path was not driven (instrument norm 2).

---

## 3. THE PER-CONTROL WRITE TABLE — driven in a real browser

**The document's centre of gravity.** ✓ = the record carries the edit after a reload; ✗ = lost; "by design" = the
control is component state on purpose. Method (4 §3): the tree exported at `934c9d24`, built, served on its own
port; headless Chromium via the tree's `scripts/smoke_lib.py` (`browser()` asserts the bundle is fresh and the
served tree is the census's); each item set through its **real control**, then **reload**, then the RECORD read
from `localStorage` and the re-rendered DOM read back. Seeds use `once=True` so a reload measures the app, not
the fixture (the SHEET_PLUMBING §3 trap). Seven drives, one at a time, **0 non-benign console errors, 0
non-2xx**. Raw outputs: `lab/vehicles/out/4_evidence/drive_{gm,player,player2,paper,edge,bench,rest}.json`.

### 3.1 GM — `GM.YARD` / `GM.YARD.SHIP` / `GM.YARD.VESSEL` (dark face, `capabilities:{gm:true}`)

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** the dark GM face measured here is deleted; its writes live on in the S4 Yard's (FIT, CREW, LOG, TRADE).

| # | writable thing | control driven | key | survives reload? |
|---|---|---|---|---|
| G-1 | acquire a ship into the party | `＋ ADD TO PARTY` on `/gm/yard/YT1300` | vessels | **✓** record minted, `owner:"party"`, provenance seeded with the acquire note; the sheet opens at once (URL becomes `/gm/yard`) |
| G-2 | hull trauma | `increase Hull Trauma` ×2 (`StepRow`) | vessels | **✓** `hull_current: 2` → DOM `2 / 22` |
| G-3 | system strain | `increase System Strain` | vessels | **✓** `1` → `1 / 15` |
| G-4 | shield angling per zone | `increase FORE` ×2, `increase AFT` ×5 | vessels | **✓** `{"fore":3,"aft":6}`; past the cap of 4 the warning renders ("Above the defense cap of 4 (Table 7-6) — allowed, but off-book"), write not blocked |
| G-5 | add a critical hit | `+ Hard`, `+ Easy` (`CritList`) | vessels | **✓** `[{"sev":"hard"},{"sev":"easy"}]` |
| G-6 | remove a critical hit | `remove critical` | vessels | **✓** |
| G-7 | install an attachment | `＋ INSTALL ATTACHMENT` → picker (60 rows shown, `slice(0,60)`) → `install (AD-1S) Cargo Pod` | vessels | **✓** `attachments:[{"key":"ad_1s_cargo_pod"}]`; budget `2 of 6 used` after reload |
| G-8 | remove an attachment | `remove attachment` | vessels | **✓** (a planted unknown key renders as its raw key with `HP —` and removes cleanly) |
| G-9 | nickname | `◈ name her` → input → `Save` | vessels | **✓** in record, cell and designation |
| G-10 | provenance note | input → `Log` | vessels | **✓** two entries, dated |
| G-11 | remove a provenance entry | `remove entry` ✕ | vessels | **✓** (the acquire note itself is removable) |
| G-12 | decommission | `Decommission — remove from the party` | vessels | **✓ removed** — `{"v":2,"vessels":[]}`; **no tombstone written** (`swrpg_deleted_ids` stays `null`) → V-4 |
| G-13 | GM affiliation override | `#yard-affil-override` → `hutt` | overrides | **✓** `{"YT1300":{"affiliation":"hutt"}}`; `OVERRIDE ACTIVE` badge back after reload |
| G-14 | browse filters / sort / view | FILTERS sheet, SORT, view bar | URL | **✓ via the URL only** — reloads to `SHOWING: STARFIGHTERS ✕ HYPERDRIVE ✕ — 38 OF 433`, 38 matrix rows |
| G-15 | TO HIT target silhouette | `± target silhouette` | — | **✗ by design** (component state; "Informs; you roll") |
| G-16 | which vessel is open | — | — | **✗ lost** — after ＋ADD TO PARTY the URL is `/gm/yard` (not even `?view=vessels`); a reload lands on the INDEX |

### 3.2 Player — `PLAYER.YARD` / `PLAYER.YARD.ENTRY` / `PLAYER.SHEET.VESSELS` (dark face, `capabilities:{gm:false}`)

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** the dark player face measured here is deleted.

| # | writable thing | control driven | key | survives reload? |
|---|---|---|---|---|
| P-1 | acquire a ship | `vessel-add` ＋ ADD TO YOUR VESSELS on `/player/yard/T65BXWING` | vessels | **✓** `owner:"char:census-p1"` (from `swrpg_last_sheet_id`), `acquired.note:"Acquired."`; the dark sheet opens at once |
| P-2 | hull on the post-acquire sheet | `increase Hull Trauma` | vessels | **✓** |
| P-3 | strain + nickname on the sheet tab's living sheet | `.ci-vessel-cell` → strain; name → `RED FIVE` | vessels | **✓** |
| P-4 | the sheet tab you were on | VESSELS tab | — | **✗ lost** — reload renders OVERVIEW |
| P-5 | the yard bar's VESSELS jump | `yard-view-vessels` | sessionStorage | **✓** lands on the sheet with VESSELS showing |
| P-6 | acquire with **no** last-opened sheet | `/player/yard/AIRSPEEDER` → ＋ADD | vessels | **written as `owner:"char:player"`** — then **visible on no sheet**; the yard's VESSELS jump falls through to `/player/roster`. An orphan, kept in storage and in sync → V-3 |
| P-7 | owner isolation | acquire for A, open B | vessels | **✓** B shows none of A's ships; neither shows the GM's `party` ships |
| P-8 | where a reload on the Yard lands | reload `/player/yard/T65BXWING` after visiting a sheet | active-session | **✗ hijacked** — lands on the sheet (`swrpg_player_active_session`'s 30-minute F5-restore) → V-7 |
| P-9 | character deleted → its ships | `removeSavedCharacter` (**code-read, not driven**) | vessels | **✗ orphaned** — tombstones the character, never touches `swrpg_vessels_v1` → V-5 |

### 3.3 Player — the PAPER vessel surfaces (`swrpg_sheet_transplant=1`, the dark switch)

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** the paper vessel room and its recognition rows are deleted; the sheet's VESSELS is `SheetVesselsS4` (V1–V4).

Seeded one CR90 (`owner:"char:census-paper"`), opened the character from the roster (the real opener), the
`sheet-unit-vessels` unit, a `vessel-row` → `data-sheet-room="vessel"`, `VesselSheet data-paper="1"`.

| # | writable thing | control (testid / aria) | key | survives reload? |
|---|---|---|---|---|
| PP-1 | hull / strain | `increase hull trauma` ×3, `increase system strain` (`TrackRowP`) | vessels | **✓** `3`, `1` |
| PP-2 | shields (4 zones at silhouette 5) | `increase port` | vessels | **✓** `{"port":2}`; FORE 2 · STBD 1 · AFT 2 fall back to the registry |
| PP-3 | criticals | `vessel-crit-add-average`, `-daunting` | vessels | **✓** |
| PP-4 | attachment install | `vessel-att-install` → `vessel-cand-*` → `vessel-att-do-install` | vessels | **✓** `HARD POINTS 2 OF 4 USED` |
| PP-5 | name / log | `vessel-name` … `vessel-name-save`; `vessel-log-input` → `vessel-log-add` | vessels | **✓** row reads `PAPER TANTIVE · CR90 CORVETTE · … Hull 3 of 50 · Strain 1 of 25 · 2 crits` |
| PP-6 | TO HIT target | `vessel-tohit-door` → `decrease target silhouette` ×3 | — | **✗ by design** — resets to the firer's silhouette on reopen |
| PP-7 | decommission | `vessel-decommission` | vessels | **✓ removed**; the room shows the empty list (`vessel-empty`) |
| PP-8 | the room / unit you were in | — | — | **✗ lost** — reload returns to the board, room closed |
| PP-9 | the book cite on an installed attachment | (display) | — | **measured raw key on first render**: `2 HP · SPECIAL_MODIFICATIONS`; correct only after a later re-render. The dark `AttachmentsSection` subscribes to `useActiveSources` (B-342's fix); **`AttachmentsSectionP` does not** → V-8 |

### 3.4 Encounter craft (`GM.NPC`) and the phone reference cards

| # | writable thing | control | key | survives reload? |
|---|---|---|---|---|
| B-1 | add a craft to an encounter | `+ ADD VEHICLE` → pick (`BenchGroupCraft`) | encounter | **✓** — measured by `npc-library-foundations-census` §3 item 12 (`{"key":"TIESABINE"}`), not re-driven here |
| B-2 | put an NPC aboard / name the pilot | ABOARD `<select>`, `Set as pilot of …` | encounter | **✓ as a record** — a seeded `vehicle:{id, pilot:true}` survives reload with v6 kept (`drive_bench.json`). **The controls themselves were not driven by this census;** the census's cite to `smoke_f54_bench_craft` is to a suite §5.2 did not run |
| B-3 | remove a craft | `Remove Alliance T-47 Airspeeder from this encounter` | encounter | **✓** — gone after reload **and** the pilot's `vehicle` membership deleted with it (`drive_rest.json`) |
| B-4 | an unknown craft key | (planted `NOSUCHKEY`) | encounter | renders `NOSUCHKEY NOT IN LIBRARY NO CREW`, removable — honest degrade |
| B-5 | craft **damage** (hull / strain / shields / crits) | **no control exists** | — | **N/A** — a bench craft is `{id, key}` only; `normalizeGroupVehicles` constructs nothing else (fork F-1) |
| B-6 | phone NPC card `+ ADD VEHICLE` | Agent Kallus (nemesis) at 402×874 → pick `T-65B X-Wing` (`VehiclePanel` on `NemesisCard`) | — | **✗ SILENTLY LOST** — the `VEHICLE:` block renders; no storage key changes; gone after reload. Same local state on `MinionRefCard` and `RivalCard` (B-274) |

### 3.5 Everything else a user can set on a vehicle surface

| surface | control | persists? | evidence |
|---|---|---|---|
| Route planner | start/end, hyperdrive class chips 0.5 / 1 / 2 / 3 / 4 | **✗** component state; **not tied to any vessel's `hyperdrive_primary`** | code |
| Hyperspace Run | ship select, contract, cargo, route option, push | **✗** no storage call under `lib/game/hyperspaceRun/` | grep: 0 |
| Maneuvers card | PERSONAL / STARSHIP tab | **✗** `useState(props.initialTab \|\| 'personal')` | code |
| Results Reference | general / combat / starship chip | **✗** component state | code |
| Store / credits | buy a vehicle, pay for an acquisition | **N/A — no control exists** | `vesselStore.js` header; nothing in `lib/store/*` |
| Store's counter · ship lines (S4 G-7) | a part, mod or weapon bought FOR a ship (`vpart:` / `vmod:` / `vweap:` lines) | **✓ vessels**, delivered in ONE `apply` BEFORE the host's sheet write (`finalizeThrough` → `counterSeam(o).deliver` → `vesselStore.deliverCounter`, `lib/shared/vesselView.jsx`); all lines or none; a sheet write that answers `false` takes the delivery back (`undo`) | **KNOWN LIMIT AT THE FLIP (D-B5's interaction, R-S4WB-2; DECISIONS D-40, card `shipyard-s5-card` ADDENDUM 2):** when the browser refuses the sheet save (a full store, a private window), `writeSavedCharacters` (`player/app.jsx`) swallows the refusal by design (D-B5) and never answers `false`. The ship line stands on the ship and the credits debit is lost. Nothing is taken from the character. The fix is **B-1071**, owned by the saving code, not the Yard: a refused save reports back to its caller, and the counter takes the delivery back. |

---

## 4. DERIVATIONS — every computed number, run against the real registry

Instrument: `4_evidence/derive.cjs` loads the shipped `shipSchematic.js`, `vesselStore.js`, `pathfinding.js`,
`travelTime.js` and the Hyperspace Run `data.js`/`rules.js` into a Node `vm` sandbox and runs them over **all 433
vehicle records, all 120 attachments, all 925 weapon rows, and the 2,077-planet / 65-route galaxy**. Harvest is
stated per row. The RAW column cites the register in [`RULES_FOUNDATION_VEHICLES.md`](RULES_FOUNDATION_VEHICLES.md)
by stable id (`V-RAW-nnn`).

| # | number | formula (symbol) | run over real records | matches RAW? |
|---|---|---|---|---|
| 4.1 | **TO HIT difficulty** (both faces) | `silhouetteDifficulty(firer, target)`: d = firer − target; ≥4 Formidable 5 · 3 Daunting 4 · 2 Hard 3 · −1…+1 Average 2 · ≤−2 Easy 1; firer = the vessel's own silhouette, default target = firer | all 121 pairs 0…10; 0 null silhouettes | **✓ V-RAW-060 exactly.** Range correctly ignored (V-RAW-054) |
| 4.2 | **number of defense zones** | `zonesForSilhouette`: sil ≥ 5 → 4, else 2 | 326 two-zone · 107 four-zone; **0** sil ≤ 4 records with port/starboard defense; **0** zones above 4; 176 ships all-zero defense | **✓ V-RAW-011** |
| 4.3 | **current shields** | `resolveShields`: per zone `shields_current[z]` if a number, else registry `defense[z]`, else 0 | CR90 + `{port:2}` → `{fore:2, aft:2, port:2, starboard:1}` ✓; TIESABINE (defense all null) → all 0 | **✗ partly.** V-RAW-012/049: angling **moves one point from one zone to another**, max 4 a zone. The stepper (`StepRow max:9, warnAbove:4`; paper `TrackRowP`) raises any zone on its own: measured YT-1300 factory 1/1 → **3/6** (total 2 → 9). The cap is warned, not held (C-Y2b warn-never-block); **conservation is not modelled at all** |
| 4.4 | **hull trauma / system strain reading** | `set(n) = clamp(n, 0, max)`, max = `hull_trauma` / `system_strain` | code (not driven past the threshold) | **✗ the "exceeds threshold" state is unrepresentable** (V-9). V-RAW-090/092: crippled / systems-down fire when trauma/strain **exceeds** the threshold. No crippled or disabled state, no auto-crit, no speed-0 flag anywhere |
| 4.5 | **hard-point budget** | `resolveBudget`: capacity = `hard_points_total` (null → "not listed", no warning); used = Σ attachment `hp` (null → 0); over = used > capacity | 16 of 433 ships have no capacity; 24 of 120 attachments `hp: null` count 0; YT-1300 + 3 installs → `{capacity:6, used:4, over:false}` | **✓ as arithmetic** (V-RAW-008/160). `hp:null → 0` is a data default, not a rule. **Not modelled:** Upgraded Weapons' 0-HP-when-replacing rule (V-RAW-161), civilian-conversion added hard points (V-SUP-054) |
| 4.6 | **attachment fit** | `resolveFit`: computes min/max silhouette, starship-only, needs-hyperdrive, `type_limit` vs `vehicle.type`; **`category_limit` and `item_limit` are never computed**, only quoted as "Also check" | 51,960 ship×attachment pairs: **39,837 "ok"** (of which **10,523 ok only because their limit is unevaluated**) · 12,123 fail. **21 attachments read "✓ fits" on EVERY ship** (e.g. `ad_1s_cargo_pod`, `ad_1s_hyperdrive_class_4_module`, `astrogation_droid_brain`) | warn-never-block by ruling (`shipyard-y3d-picker-fit-scope` §3). Consequence: the picker sorts fitting-first then alphabetically, so the AD-1S model-only pods lead the list on every ship (V-11) |
| 4.7 | **Hyperspace Run ship stats** | hand-typed `SHIPS` in `data.js` ("STAT SHAPES are from public/data/vehicle-library") | YT1300 = registry ✓ · YV666 price 130,000 vs registry **132,000** · ACTIONVI cargo 800 vs **10,000** (flagged in-file as a retune) · **`HWK290` and `BARLOZ` are not registry keys** — the same craft are in the registry as `HWK290LTFREIGHT` and `BARLOZFREIGHT` (checked at assembly) | n/a (a game, "tuning knobs, not RAW gospel"). **A second copy of vehicle stats, not an id-ref** |
| 4.8 | **travel time** | Σ(segment distance / units-per-day by lane quality {150, 100, 60, 40}) × hyperdrive class, ±25% (well-travelled) or ±50% | Tatooine→Coruscant 1,087 u: class 1 **4–11 days** · Coruscant→Corellia 267 u: class 1 **1–2 days**. Map: 65 routes, 5 well-travelled, 60 minor, **0 uncharted** | **Class multiplier ✓** (V-RAW-142). **The base duration is a house distance model, not Table 7-14** (within a sector 10–24 h · region 10–72 h · between regions 3 d–1 wk · across the galaxy 1–3 wk) |
| 4.9 | **astrogation pool** | hardest leg: well-travelled Easy + 1 boost · minor Easy · uncharted Easy + 1 setback · wild space **Average** + 1 setback | 4 qualities computed; the uncharted branch is reachable only via a wild-space leg (no uncharted lane ships) | **Base Easy ✓** (V-RAW-141). **The lane-quality dice and the wild-space step are house modifiers**; RAW's are Table 7-13 (damaged navicomputer +3, duress +1, lightly/heavily damaged +1/+2, bad charts +1) and **none is modelled — the ship's own damage never reaches the pool** (the vessel store is not consulted). Cite drift: code cites "eote p.255-256"; the register reads the rule at **eote p.246-247**; a code comment says "Daunting", the code returns Average (V-14) |
| 4.10 | **Hyperspace Run leg pool** | `legPool` — a re-implementation of 4.9 plus route option and push | identical to 4.9 today on all four qualities | same as 4.9. **Two implementations of one quantity** (V-13) |
| 4.11 | **crew actions reference** | hand-typed `CREW_MANEUVERS` (6) + `CREW_ACTIONS` (4) in `vesselView.jsx` vs `maneuvers_actions.json` `starship` (10 rows, generated from `Docs/rules_tables/`) read by `ManeuversCard` | same 10 entries by meaning; names differ ("Fire Vehicle Weapons" vs "Perform a Combat Check (vehicle weapons)"); the sheet carries per-row cites, the card one table cite | both match the EotE set. **Two sources for one reference table** (V-13). **Table 7-7's nine crew actions and AoR's three barrages are on neither** |
| 4.12 | **vehicle weapon rows in ENCOUNTERS** | `resolveVehicleWeapons`: arcs = the true `firing_arcs` keys, or **`'All'` when none is true** | 925 rows · 1,424 quality refs, **0 unresolved** ✓ · **19 rows have no arc true** (7 not turrets, e.g. `TIESA` Concussion Missile Launcher, `DEATHSTAR1` ×5) → shown as **All** | V-RAW-021: a fixed weapon covers one arc. The 7 are data gaps this resolver renders as the opposite (V-10) |
| 4.13 | **turret vs arcs on the schematic** | `weaponArcs`: `turret` → full ring, arcs ignored; the weapon line prints the `firing_arcs` list | **308 turret rows; 146 list fewer than the four arcs** (e.g. `ILHKKCITADEL` Light Ion Cannon: turret + fore only) | V-RAW-021: turret is a MOUNT whose arc is All, limited only by a dorsal/ventral mount. **On one screen the ring and the line beside it disagree** for these 146 rows (measured on CR90); the dorsal/ventral mount limit is not drawn (V-10) |
| 4.14 | **Yard figures** | landing tagline = `index.json total_entries`; paper landing = `rollcall.populations.yard`; **GM landing tile `sub: '433 canon ships, speeders, and walkers'` — a typed literal**; browse SHOWING = filtered count after the `aorbeta` hide list | **433** on every landing vs **`SHOWING: ALL ENTRIES — 431 OF 433`** in both Yards; the two hidden are `YT1760`, `IMMOB418` | a figure split between two surfaces; the GM tile is B-402's class (V-12) |
| 4.15 | **price display** | `price_credits.toLocaleString() + ' cr'` in MATRIX, index row and entry; SORT by price | `BLADEWING`, `DEATHSTAR1` carry **2,147,483,647** (int32-max sentinel) and render it; `CONSSALONPOD` null; `E2ESCAPEBIKE`, `SPACESLUG` 0 | V-RAW-182: profiles carry Cost/Rarity; the sentinel is a data artefact shown as a real price (V-17) |

**Not computed anywhere in the module** (grep, 0 hits in any vehicle file): handling → boost/setback on a
Piloting pool (V-RAW-002); Table 7-2 Damage Control difficulty from current strain/trauma (reference text only);
the d100 Critical Hit roll with +10 per existing crit (the sheet records a severity word; the `CritTableRef`
vehicle variant that could show it is unmounted); Table 7-3 speed advantage; current speed; range bands;
Table 7-13 astrogation modifiers; Massive's crit-rating shift (the field is in the data, nothing reads it);
encumbrance of cargo aboard; repair cost (~500 cr per hull point, V-RAW-111); any attachment or talent effect.

---

## 5. GUARDS — every node guard and smoke touching vehicles

### 5.1 Node guards — 21 run, per file, in the exported tree

Selected by grepping `test/*.cjs` for vessel · vehicle · yard · shipSchematic · travelTime · pathfind · hyperspace ·
HyperRun · swrpg_vessels · addVehicle · setMemberVehicle; incidental hits (`book_alias_resolution`,
`shop_canonical`, `talent_choice_shape`, `journal_store`, `roster_envelope`, `ogg_import_skill_cost`,
`sheet_openers_routed`, `sync_contract`'s one mention) carry no vehicle assertion beyond a word (4 §5.1).

| guard | result (exit) | what it guards | what it CANNOT catch |
|---|---|---|---|
| `vessel_store` | **61/61 PASS** (0) | normalize, individuals, provenance, crits (4 tiers), shields merge, v1→v2, install/remove, budget, fit (all 7 constraint kinds), save/load, the sentinel on the loaded object | **V-1**: it saves the loaded stale state directly, never `save(updateVessel(stale,…))`. **V-2** (cross-tab). No host code is loaded |
| `ship_schematic` | **41 PASS** (0) | zone count 0…10, zones per silhouette, arcs, turret ring, badges, glyph by category, **Table 7-4 on 11 pairs** | turret-with-partial-arcs data (V-10); the dorsal/ventral mount limit; any rendered pixel |
| `vehicle_weapon_profiles` | **PASS — "4 known-bad pinned"** (0) | every weapon row's shape | green by pinning B-218's two rows; no `scale` field required (B-216). (5 §5 quotes BOARD saying it exits 1 on B-218's nulls; at `934c9d24` it exits 0 by the pin) |
| `vehicle_image_manifest` | **ALL PASS** (0) | manifest ↔ library keys, files exist | the 20 orphan PNGs (D-12) are not asked about · **RETIRED 2026-10-15 by shipyard-schematic-build** (guard deleted with its generator in `39aa88c06`); successors `ship_identifier_fidelity`, `ship_identifier_placement` (§1.1) |
| `npc_bench_store` | **ALL PASS** (0) | v6 craft + crew ops, one-pilot rule, removeVehicle takes crew off, migration, sentinel | the phone-card `VehiclePanel` (B-274) — a UI mount the store never sees; craft condition (none exists) |
| `map_routing` | **19 PASS** (0) | universal routing, wild-space leg → Average + setback, class multiplies time only, lanes resolve | whether the day bands match Table 7-14; it cites "eote p.256" for the class rule where the register says p.247 |
| `hyperspace_run` | **19 PASS** (0) | run terminates, deterministic, pools, payouts | SHIPS vs the registry (4.7); the duplicated pool (4.10) — it asserts the game's copy, not parity with `travelTime` |
| `sync_merge` | **31 passed, 0 failed** (0) | vessels union by id, tombstones after union | a vessel tombstone is never WRITTEN (V-4) |
| `recency` | **28 passed** (0) | ms stamps incl. the vessel `removeAttachment` stamp | it is a regex over source, not behaviour |
| `sync_contract` | **38 passed** (0) | the synced-key list | — |
| `suite_bar_clearance` | **all clear** (0) | the Yard entry / vessel sheets' 64px bar clearance (source) | geometry (`smoke_yard_backbar`'s job) |
| `decoder_family_parity` | **ALL PASS** (0) | yardView + vesselView consume `glyphText`, not a copy | — |
| `sources_ready_single_definition` | **4 pass** (0) | one ready-gate; yardView/vesselView read `useActiveSources` | **V-8**: file-level check — `vesselView.jsx` contains the hook (the dark section), so the paper sibling that lacks it passes |
| `sources` | **ALL PASS** (0) | vehicle source vocab; aorbeta hide-listed | the 433-vs-431 split (V-12) |
| `item_glyph_restoration` | **21 pass** (0) | vehicle-attachments dice tokens floor 121 | — |
| `attachment_fit` | **39/39 PASS** (0) | the PERSONAL `attachmentFit` (its header names the vessel core's deliberate divergence) | nothing vessel-side |
| `ogg_import_parse` | **27/27** (0) | parse incl. `<CharVehicle>` | the dropped fields (I-2…I-5) |
| `ogg_import_resolve` | **14/14** (0) | resolution against an index the TEST builds | **V-6**: the host's real index has no `vehicles` |
| `ogg_import_receipt` | **29/29** (0) | receipt rows | same |
| `ogg_export_scaffold` | **8 pass** (0) | the export skeleton incl. an empty `Vehicles` | that it is ALWAYS empty |
| `css_bare_var_tokens` | **VOID, exit 1** — *"git ls-files failed — the sweep has no subject; a FAILED run"* | B-549's two undefined `--ci-*` tokens | **environmental**: the exported tree has no `.git`; the guard correctly refuses a zero-harvest run (norm 5). Not a product red; owed a re-run in a real checkout |

**Tally: 20 of 21 green, 1 VOID (environmental, harvest zero, reported as failed per norm 5), 0 product reds.**
The structural finding: **every one of V-1, V-2, V-6 and V-8 sits in the seam between a green guard and the host
that calls the guarded code.** A new vehicle guard that loads only the store will be green over the same holes.

### 5.2 Browser smokes — 20 of 20 green, 748/748 asserts (run 2026-09-23, one at a time; lab `4_plumbing.md` §5.2)

Run after the coordinator's RESUME BROWSER, one at a time against this tree on :3147, each behind a **binding**
gate that refused to start while `vm_stat` "Pages free" < 60,000 **or** any `chrome-headless-shell` process existed
(`run1.sh` in the scratch dir; the pattern is written `[c]hrome-headless-shell` so the gate cannot match its own
shell's command line — the first attempt with the bare pattern waited on itself and was stopped). Every smoke's own
`assert_build_fresh` + `assert_served_tree_is_mine` passed. Logs: `smoke_logs/<suite>.log`. (`smoke_yard_y3d` was
interrupted once when the runner was moved to the foreground and was re-run whole; only the complete run counts.)

| suite | result | what it covers | what it CANNOT catch |
|---|---|---|---|
| `smoke_shipyard` | 24/24 | GM browse, entry, schematic, filters, URL | anything after acquisition |
| `smoke_shipyard_y2` | 21/21 | GM ＋ADD TO PARTY, live sheet edits persist | V-1 (no version-ahead plant), V-2 (one tab), V-4 (no tombstone assert) |
| `smoke_shipyard_y2_player` | 10/10 | legacy VESSELS tab lists/opens/persists | V-3/V-5 orphans; P-4 tab position |
| `smoke_yard_player` | 19/19 | player Yard front door, acquire owner `char:<last>` | V-3 (always seeds `swrpg_last_sheet_id`), V-7 (no reload after a sheet visit) |
| `smoke_yard_y3a` | 8/8 | TO HIT chip, Table 7-4 | V-10 turret/arc disagreement |
| `smoke_yard_y3b` | 10/10 | crew-actions card + cites (B-471/B-484 hold) | F-8: the card's copy vs `maneuvers_actions.json` |
| `smoke_yard_y3d` | 14/14 | attachments install/remove, budget | V-11 (never-evaluated limits read as fits) |
| `smoke_yard_y3e` | 10/10 | picker fit sort, detail, off-book | same |
| `smoke_yard_backbar` | 23/23 | 64px bar clearance geometry | — |
| `smoke_c2_yard_honesty` | 6/6 | plate captions honest (image vs schematic) | the 20 orphan PNGs (D-12) |
| `smoke_sources_yard` | 15/15 | active-sources filter on the Yard | V-12 (433 vs 431 across surfaces) |
| `smoke_b336_vessel_source_control` | 6/6 | dark attachment book cite resolves (B-342/B-336) | **V-8: dark face only** — the paper `AttachmentsSectionP` is not driven |
| `smoke_f54_bench_craft` | 14/14 | bench craft add · aboard · pilot · reload | craft condition (none exists); B-301 weapons row |
| `smoke_bench_crewing` | 17/17 | LIST-view crewing, PILOT chip | B-274 phone mounts |
| `smoke_f54_stale_tab` | 13/13 | version-ahead banner + refused write — **bench only** (no vessel mention in the suite) | **V-1**: no vessel stale leg exists |
| `smoke_hyperspace_run` | 8/8 | the game runs end-to-end, 0 console errors | §4.7 stat copies, §4.10 pool copy |
| `smoke_gm_map_controls` | 9/9 | Map controls menu (Route, Hyperspace Run) | travel-time vs Table 7-14 (§4.8) |
| `smoke_item_glyphs` | 187/187 | dice glyphs on vehicle attachments (and items) | — |
| `smoke_blobret_2` | 21/21 | baked vehicle-weapon rows via the phone `VehiclePanel` (B-274's note) | that this very mount never saves (B-274) |
| `smoke_sheet_transplant` | 313/313 | paper sheet incl. VESSELS unit empty/furnished, the vessel room, log + hull + shields + crits written to the yard's store, at 1920/1366/1194/390 | V-8 (it reads the store, not the attachment cite text on first render); PP-8 position after reload |

**Tally, both tiers: 21 node guards (20 green, 1 VOID-environmental) + 20 smokes (20 green) = 40 green, 1 void, 0
product reds.** No new red by suite. **Every census finding V-1…V-17 sits outside what these 41 instruments drive**
— each gap named in the right-hand column above.

### 5.3 Added by SHIP YARD S0 (`ee87e353`) — the store-to-host seam, instrumented

§5.1 and §5.2 are the census's measurement at `934c9d24` and stay as measured; their `vessel_store` and
`smoke_f54_stale_tab` rows describe the tree before S0. Card `shipyard-s0-vessel-store-reds` (ruling
`shipyard-s0-foundations-census` §5) put the seam that V-1 and V-2 lived in INSIDE the instruments:

| instrument | result (exit) | what it guards | bitten by (exit code) | what it CANNOT catch |
|---|---|---|---|---|
| `test/vessel_store.cjs` (+18) | **79/79** (0) | (i) the hold THROUGH an op — the page store's `apply(updateVessel)` / `apply(acquire)` and the pre-fix host path `save(updateVessel(load()))` leave a `v:99` save byte-identical; an ahead envelope with an unreadable list is held; the control writes · (ii) two module instances over one storage: B hears A's write through the `storage` event (another key's ignored) and B's write keeps both · (iii) no event delivered: the write re-reads first; a removal is not resurrected · the sync seam · the facade's bytes equal `save()`'s | module flag reverted → 6 red · storage listener removed → 2 · sync subscription removed → 3 · re-read removed → 2 (all exit 1) | anything rendered; a real browser's event timing |
| `scripts/smoke_vessel_store_reds.py` (new) | **64/64** (0) | V-1 on all three dark hosts (GM sheet at 402 and 1440, player sheet, player Yard): the ruled banner, held + recessed controls, byte-identical after a tap, the facade and the pre-fix path; the current-version control persists across a reload; V-2 — the census's two-page drive: the GM page hears the player page's acquire live, both records survive the GM's tap, the reloaded player page lists the X-wing from the record | module flag reverted → 38 red · listener removed → 1 (the live-hear leg; the write still keeps both, by the re-read) · listener AND re-read removed → 4: storage `[CR90/party]`, the X-wing erased (all exit 1) | the paper VESSELS unit's stale face (S2's frame); the signed-in sync path (UNMEASURED, §2.5) |

---

## 6. THE DEFECT LEDGER

The index of everything measured wrong, in four families: **V-** the app module (4 §10, plus one found at
assembly), **R-** the registry data and its ingest (3), **I-** the OggDude import/export path (3 §7, 4 V-6), and
the **existing board rows** re-verified at `934c9d24`. **None of the V-, R- or I- rows is on `Docs/BOARD.md`**:
Jason ruled 2026-09-23 that they stay in these documents for the next production seat to file. When a row is
filed or closed, mark it here with the commit — never delete it (§12).

### 6.1 V — the app module

| row | headline | evidence | status |
|---|---|---|---|
| **V-1** | **LIVE DATA LOSS.** The vessel version-ahead sentinel is defeated by the first edit: every store op returns a fresh state without `stale`, so `save` writes a downgraded `v:2` envelope and strips the newer build's fields. No vessel host shows the ruled `THIS TAB IS BEHIND` banner | §2.4; `drive_edge.json` | **FIXED `ee87e353`** — filed B-912; the hold module-level, the banner + held controls on the three dark hosts; `test/vessel_store.cjs` A1 (i) + `scripts/smoke_vessel_store_reds.py` (§5.3) |
| **V-2** | **LIVE DATA LOSS.** The three vessel hosts keep independent in-memory copies and write the whole list; a second tab (or the other app on the same machine) erases ships written since it loaded — any owner's | §2.5; `drive_edge.json` | **FIXED `ee87e353`** — filed B-913; one page-local store, refreshed by the `storage` event and `SWRPGSync.subscribe`, re-read before every write; A1 (ii)/(iii) + the browser race leg (§5.3). The sync question stays UNMEASURED (§2.5) |
| V-3 | A player Yard acquisition with no last-opened sheet writes `owner:"char:player"` — a ship listed on no surface (and `SheetVessels` has a second fallback, `char:unknown`) | §3.2 P-6; `drive_player2.json` | unfiled · **subject partly deleted: `SheetVessels`' `char:unknown` fallback went with it at the S5 flip** |
| V-4 | Decommission writes no tombstone, while the adoption merge applies tombstones to every LIST key — so a vessel decommissioned on one device and still held by another **comes back on adoption**. Measured in Node with the shipped `mergeAdoption`: local `[k1]` + remote `[k1, x1]`, no tombstone → `[k1, x1]`, 0 conflicts (silent); with `swrpg_deleted_ids:['x1']` → `[k1]`. The merge is right; the tombstone's producer is missing. The two-device sign-in itself was **not driven** | §3.1 G-12; `syncMerge.js` | unfiled |
| V-5 | Deleting a character leaves its `char:<id>` vessels in storage, listed nowhere, and synced | `removeSavedCharacter` (code-read) | unfiled |
| V-6 | OggDude import never resolves a vehicle: the player host's `setIndex` builds `species, careers, specializations, talents, force_powers, weapons, armor, gear` — **no `vehicles`** — so `resolveManifest` reports every `<CharVehicle>` absent ("not in our vehicles registry"), even `DUNELIZARD`, which is a library key; nothing writes a vessel. The parser's own comment says the host passes "the vehicle library". Export writes `Vehicles: []` always. Measured in Node on three fixtures (`test/fixtures/oggdude_saves/{B_AruNeh,C_N4567_Droid_Diplomat,D_N4567_Droid_Explorer}.xml`): with the host's index `DUNELIZARD` is absent; with `{vehicles: indexBy(library,'key')}` added it MATCHES | `4_evidence/ogg_vehicles.cjs` | unfiled |
| V-7 | A reload on `/player/yard` or `/player/yard/{key}` within 30 minutes of a sheet visit lands on the sheet (`swrpg_player_active_session` is not cleared by the Yard) | §3.2 P-8 | unfiled |
| V-8 | Paper `AttachmentsSectionP` does not subscribe to `useActiveSources`; the installed attachment's book prints as the vocabulary key (`SPECIAL_MODIFICATIONS`) until a re-render — **B-342's class, regressed on the paper face**; `sources_ready_single_definition` cannot see it (file-level check) | §3.3 PP-9 | unfiled · **subject DELETED at the S5 flip (`AttachmentsSectionP`)** |
| V-9 | Hull trauma and system strain clamp AT the threshold, so RAW's "exceeds threshold" states (crippled, systems down, V-RAW-090/092) cannot be recorded | §4.4 | unfiled; RAW fork F-6 |
| V-10 | 146 turret weapon rows list fewer than four arcs: the schematic draws a ring while the line names fewer arcs; 7 fixed weapons with no arc render as "All" in an encounter | §4.12–4.13 | unfiled; fork F-13 |
| V-11 | 21 vehicle attachments show "✓ fits" on every ship because their only limits (`item_limit`/`category_limit`) are never evaluated; the AD-1S model pods lead the picker on every ship | §4.6 | unfiled; fork F-14 |
| V-12 | Fleet figure split: player landing / paper roll-call / GM tile say 433, both Yards show 431 (aorbeta hidden); the GM tile's 433 is a typed literal — B-402's class on the GM face | §4.14 | unfiled; fork F-16 |
| V-13 | Second paths for one quantity: two sources for the starship crew reference (`vesselView.jsx` vs `maneuvers_actions.json`), two for the astrogation pool (`travelTime` vs `HyperRun.legPool`), two loaders of the vehicle library (`VehicleLibraryController` vs `view.jsx`, the latter outside the cache-bust) | §4.10–4.11, §1 #7 | unfiled; forks F-8, F-9 |
| V-14 | Cite disagreements: astrogation "eote p.255-256" in `travelTime.js` vs the register's p.246-247; class multiplier "p.256" in `test/map_routing.cjs` vs `travelTime.js`'s own p.247; a `travelTime.js` comment says Daunting, the code returns Average | §4.9, §5.1 | unfiled |
| V-15 | `Docs/SHIPYARD_Y2_SCHEMA.md` is behind the code (envelope `v:1`, ISO string stamps, free-label owner); `benchStore.js`'s header contract still says `version: 5` | §2.3 | **FIXED (the vessel half) `345981fb`** — filed B-914: `SHIPYARD_Y2_SCHEMA.md` trued; `VEHICLE_LIBRARY_SPEC.md` marked a fossil. The `benchStore.js` header half is open (PAPER's file; B-915) |
| V-16 | Dead/latent (extends B-247): `CritTableRef` vehicle variant unmounted; `calculateTravelTime` + `ASTROGATION_OUTCOMES` dead; `index.json`/`taxonomy.json` fetched unread; 20 unreferenced PNGs (1.38 MB); stale comments | §7 | unfiled |
| V-17 | Price sentinel `2147483647` renders as a real price on `BLADEWING` and `DEATHSTAR1` | §4.15 | unfiled |
| **V-18** | *(found at assembly, measured at `cf4143a0` = `934c9d24` for this file)* The shields' over-cap warning and header cite **"Table 7-6"** for the defense cap of 4 (`vesselView.jsx` — the `StepRow`/`TrackRowP` warning and the Shields section header). The cap is prose, V-RAW-011 (EotE p.226); EotE Table 7-6 is *Spending Threat and Despair*, AoR Table 7-6 is *Spending Advantage and Triumph* — neither is a cap | `grep -n 'Table 7-6' lib/shared/vesselView.jsx` → 3 hits | unfiled · **subject DELETED at the S5 flip: `grep -c 'Table 7-6' lib/shared/vesselView.jsx` → 0** |

### 6.2 R — the registry data and its ingest (3 §1–§8)

| row | headline | evidence | status |
|---|---|---|---|
| R-1 | **Fractional hyperdrive classes are dropped to `null` at ingest** — the library field is int-only, so Class 0.5 / 0.6 / 1.5 (RAW-legal; the Hyperdrive Generator reaches .5, V-RAW-164) vanish: `ARC170STAR` 1.5 → null, `ACCLAMATORASSAULT` 0.6 → null, `PROVIDENCEDREAD` 1.5 → null. Structural to the one ingest script | 3 §6 Finding 1 (`cotr_vehicles.json` vs library) | unfiled |
| R-2 | **`WeaponModifiers` (per-vehicle one-off weapons) are dropped wholesale at ingest.** In Collapse of the Republic 10 of 18 vehicles carry them (16 weapons); 13 vanish without trace, 3 survive only by a name coincidence and take the **generic** weapon's stats (`Heavy Mass Driver` → `MASSDRIVERHVY`, `Ion Pulse Weapon` ×2 → `IONPULSE`). `TRIDENTASSAULT` loses Articulated Tentacles (Brawl 4/4) and High-Speed Boarding Drill (Melee 10/2); `HYENADROIDBOMB` loses Walker Legs (Brawl 9/4). The same script feeds all 36 source books — **assume it recurs repo-wide; only CotR was measured** | 3 §6 Finding 2 | unfiled |
| R-3 | No weapon `scale` field on any of 925 rows or 433 records, though the OggDude source carries `Scale: "wsPersonal"/"wsPlanetary"` on WeaponModifiers; RAW has whole-profile personal scale (V-RAW-174) and range-only personal scale (V-SUP-084) | 3 §8; `derive.cjs` census | **= B-216 (open)** |
| R-4 | `base_mods` on vehicles: 58 records, `key` and `name` null on every item — prose only, not a reference | 3 §1 | unfiled (gap) |
| R-5 | Attachments: **0 of 120 carry a machine-readable effect** (every mod is `{description, rank?}`) | 3 §2 | **ruled** display-only by Contract 1 (C5) — a gap for the expansion, not a defect |
| R-6 | Two weapon rows carry null damage/crit: `TIEADVANCEDV1` XX-23 S-Thread Tracer, `DEATHSTAR1` Superlaser (the guard is green by pinning them) | 3 §1 | **= B-218 (open)** |
| R-7 | 19 weapon rows with no firing arc set (all six false), incl. the whole `DEATHSTAR1` armament | 3 §1 | feeds V-10 |
| R-8 | `hard_points_used` is 0 on all 433 (never populated); weapon `qualities` raw text is empty on 925/925 (superseded by `qualities_resolved`) | 3 §1 | unfiled (dead fields) |
| R-9 | `category_subtype` is a string on some records and a list on others (31 list combinations; 16 null) — a real shape split | 3 §1 | unfiled |
| R-10 | `is_starship` disagrees with the shard on 11+ records (`support` 13 true / 26 false; 5 `starfighters` false; 2 `transports`, 3 `patrol_gunships` false; 1 `landspeeders` true) — "worth a follow-up look, not resolved" | 3 §1 | unfiled (candidate) |
| R-11 | `SPACESLUG` is a creature filed as a vehicle (price 0); its "attachment" `space_slug_abilities` is a creature stat block | 3 §1–§2 | unfiled (candidate) |
| R-12 | Price sentinel `2147483647` on `BLADEWING`, `DEATHSTAR1`; `CONSSALONPOD` null; `E2ESCAPEBIKE`, `SPACESLUG` 0 | 3 §1 | feeds V-17 |
| R-13 | `AA70COMM`'s `source` reads "Keeping the Peace" but a corpus search of that book finds no "AA-70"; the stat block is in Lead by Example. **A retrieval negative, owed a human check** before any change | 6a §GUARDIAN, §COMMANDER (catalogue claim, not re-scripted — a source field, not a presence claim) | candidate; owed (RULES_FOUNDATION §H) |
| R-14 | The two `aorbeta` ships (`YT1760`, `IMMOB418`) are hidden from discovery by ruling; the polish item to re-source or retire them is open | 5 §4.3 P-5 | open (POLISH_BACKLOG P-5) |
| R-15 | `stats_complete` is true on 432/433 while 120 ships carry no weapons; R-HFC-4 rules it never gates combat readiness ("the vehicle cluster defines its own predicate") | 5 §1 | ruled; the predicate is unbuilt |
| R-16 | `WLO5TANK` classed GENUINE with no corpus source found; `KOSSAKFRIG` held by R-VAR-3 with no board row | 5 §4.1, §4.4 | **= B-217 (open)**; KOSSAKFRIG unboarded |
| R-17 | The vehicle library has **no JSON schema and no `validate_registries` layer**; the weapon shape is the only guard (R-VAR-2) | 5 §3 C19 | unfiled |
| R-18 | 108 of 433 vehicles carry a repeated weapon key in `weapons[]` (e.g. two `LASERLT` rows) — why the programme ruled per-weapon status keyed **by index** (C11) | 5 §2.3 | fact for the builder |
| R-19 | *(found at assembly)* The tractor beams, which Table 7-1 prints with damage and crit "—", are encoded damage 0 and crit **3** (`TRACTLT`) / 0 / 0 (`TRACTMED`, `TRACTHVY`) — `TRACTLT`'s crit 3 has no RAW basis on the page the register read | `weapons_check.py` over the shards at `cf4143a0`; V-RAW-024 | candidate; owed (RULES_FOUNDATION §H.4) |

### 6.3 I — the OggDude import / export path (3 §7; `lib/shared/oggImport.js`, `oggExport.js`)

| row | headline | status |
|---|---|---|
| I-1 | = V-6: the host index has no `vehicles`, so every `<CharVehicle>` reads absent; export writes `Vehicles: []`. **Amended by lap `release-r5-rigger`** (card ADDENDUM 2 C2/C3): the Signature Vehicle's ship travels both ways (`settleRigger` bonds the one bondable Yard vessel by `ItemKey`; the export writes the bonded ship), the rest stays as written here | unfiled |
| I-2 | **A custom vehicle's whole `<CustomVehicle>` stat block is unparsed.** `parseVehicleRef` reads only `ItemKey`, `Key`, `Count`, `Name`, `Description`; `field()` is an unscoped regex, so a custom vehicle's nested `Name`/`Description` come through **by accident**, and every mechanical field (Type, Categories, Silhouette, SensorRange, Passengers, DefRanged, Fortification, VehicleType — and Speed/Handling/HullTrauma/SystemStrain/Armor/Weapons on a fully statted one) is lost. Confirmed on `N4567__Droid_Diplomat.xml`'s "Trench" | = F-71's crafting row names it (open) |
| I-3 | **A registry vehicle's player note is dropped on every import**: OggDude writes `<Notes>`, the parser reads `Description` — confirmed on `Levi__1L_ImperialSeries_Repulsor_Tank.xml` (`name:'Levi'`, `notes: None` though `<Notes>Levitates to decimate.</Notes>` is present) | unfiled |
| I-4 | `guid` and `count` are parsed off `<CharVehicle>` and never forwarded to the manifest (the sibling gear/weapon/armor lines forward `count`) | unfiled |
| I-5 | Each `<CharVehicle>`'s embedded `<Portrait>` is read past (to keep it out of the character portrait) and discarded | unfiled |

### 6.4 Existing board rows on the vehicle surfaces (re-verified at `934c9d24`)

| row | subject | state at `934c9d24` |
|---|---|---|
| **F-54** | vehicle attach had no desktop door; "MOSTLY SHIPPED AND LIVE"; open remainder C-F54B-1 | shipped part holds (craft add / aboard / pilot / remove persist). The row text carries neither 2026-08-04 update (the "LIVE EXPOSURE AWAITING JASON'S WORD" was answered; C-F54B-1 was superseded into P3) |
| **B-274** | the three phone-tier `VehiclePanel` mounts attach through local state that never saves | **STILL TRUE**, re-measured (§3.4 B-6); the row's mount lines are 15 stale. Shape RULED 2026-08-25 (R-B274-1: delete, not rewire), unscheduled |
| **B-301** | a crewed vehicle's weapons are not listed in the encounter's crewed display | **STILL TRUE for the craft row** (code-read: name · SIL · crew count · ✕, no weapons); weapons DO fold into the aboard NPC's ARSENAL tab. A crewless craft's weapons appear nowhere. Render half UNMEASURED |
| **B-216** | no home for RAW's "personal scale" weapon marker | STILL TRUE (= R-3) |
| **B-218** | null damage/crit on 2 weapon rows | STILL TRUE, pinned (= R-6) |
| **B-217** | `WLO5TANK` GENUINE with no corpus source | not re-verifiable here (= R-16) |
| **B-138** | the dark attachment picker scrolls sideways (`flex:1` child without `min-width:0`) | STILL TRUE in code; not re-measured in a browser |
| **B-549** | the Yard names `--ci-accent-dim`, `--ci-hair-strong`, defined nowhere | STILL TRUE (5 uses, 0 definitions); DEFERRED behind the creator release |
| **B-316** | `--ci-accent-furn` below small-text AA (the Yard's furniture) | open, not re-measured |
| **B-247** | dead plumbing incl. `_pendingSheetPage`, vessel-store `installAttachment/removeAttachment/touch` | STILL TRUE (V-16 extends it) |
| **B-465** | `smoke_npc_bench_dup` still demands the literal `version 5` | STILL TRUE — **in the path of any bench bump** (owed before a build lap on this surface) |
| **B-342** (closed) | attachment cites echoed the key before the sources index loaded | holds on the dark face; **regressed on the paper face** (= V-8) |
| **B-402** (closed) | the player landing's typed "415" | holds on the player face; **the class survives on the GM tile** (= V-12) |
| **B-484 / B-471** (closed) | crew-action cites off by ten pages | the fix holds in code |
| **F-13** | Ship compare (Y3c) | parked, unbuilt |
| **F-70 / F-71 / F-44** | personal item attachments; crafting incl. OggDude `CustomVehicle`; the Workbench | open; F-71 confirms the importer drops custom vehicles by design today |
| **F-33b / F-77** | the ICONIC slice (Falcon, Slave I, Executor …) — UNAUTHORISED, Jason's pull; the `ships`/`gadgets` corpus half-unreadable | open; R-F33A-7: a retrieval negative over `ships`/`gadgets` must not be cited |
| **F-99** | HOLOTABLE battlemap | open; no vehicle event type exists (§8.3) |
| **B-498** | should the yard and vessel sheet draw the Force family told apart by fill? | open design question |

**Ledger count:** 18 V rows · 19 R rows · 5 I rows = **42 rows new to the board** (I-1 restates V-6; R-3, R-6 and
R-16 restate B-216, B-218, B-217), plus 20 existing rows re-verified.

---

## 7. DEAD AND LATENT CODE

Method: every exported name grepped over `player/`, `gm/`, `lib/`, `dice/` source (built `.js`/`.map` excluded);
"test-only" means the only callers are under `test/` (4 §7).

| # | thing | where | status |
|---|---|---|---|
| D-1 | `CritTableRef` **vehicle** variant (19-row Table 7-9) | `lib/shared/ui.jsx`; data `crit_tables.json .vehicle` | **latent — no mount**; all mounts pass `'character'`; the vessel sheet records a severity word instead |
| D-2 | `vesselStore.installAttachment` / `removeAttachment` | exported | **test-only** — the UI installs through `onUpdate({attachments})`; callers only `test/vessel_store.cjs`, a regex in `test/recency.cjs` (B-247) |
| D-3 | `vesselStore.touch` | — | **dead, unexported** (its own comment says so) |
| D-4 | `VehicleLibraryController` → `libraryIndex`, `taxonomy`, `vehiclesByShard`, `imageManifest` | exports | **unused**; `index.json` + `taxonomy.json` fetched and never read · `imageManifest` RETIRED 2026-10-15 by shipyard-schematic-build |
| D-5 | `GmTravelTime.calculateTravelTime` (the pre-UXQP-42 lane-only calculator) | `travelTime.js` | **dead** — 0 app callers, 0 test callers |
| D-6 | `GmTravelTime.ASTROGATION_OUTCOMES` ("Each additional success reduces travel time by ~10%" …) | `travelTime.js` | **dead**; uncited house outcomes |
| D-7 | `GmPathfinding.findRoute`, `snapToLane`, `isOnNetwork` | `pathfinding.js` | **test-only as exports**; used internally by `routeUniversal` |
| D-8 | `_pendingSheetPage` | `player/app.jsx` | **dead** (declared, never read; the live mechanism is `_yard_jump_page`) — B-247 |
| D-9 | `crits[].label`, `attachments[].when/.note` | schema fields | **written null by every control; no editor exists** |
| D-10 | `acquired {note, when}` | written by `acquire` | **never displayed** as itself |
| D-11 | the three phone-card `VehiclePanel` mounts | `view.jsx` | **live but inert** — B-274 |
| D-12 | 20 PNGs in `vehicle-library/images/` | 18 `Default*.png`, `ATRT.png`, `YV545.png` | **referenced by no manifest key** (1,380,085 B) · **RETIRED 2026-10-15 by shipyard-schematic-build** — the whole directory went in `3fe817caa`, these 20 with it |
| D-13 | stale comments | `gm/app.jsx` (filter defaults "live in ShipYardScreen useState" — moved to `useYardState`; a "filter drawer subcomponents" header over `GmApp`); `travelTime.js` ("Daunting", code says Average); `yardView.jsx` ("85 art-less entries", measured 124); `VehicleLibraryController.js` ("Future GM overrides (rename, hardpoint state)") | comment drift · **the `gm/app.jsx` half is gone at the S5 flip (both stale comments deleted with `ShipYardScreen`)** |
| D-14 | `openManeuversCard({initialTab:'starship'})` as a deep link | `ui.jsx` | **no caller passes it**; the vessel sheet keeps its own hand-typed copy instead (V-13) |
| D-15 | `oggImport` vehicle manifest records | `oggImport.js` | **parsed and always reported absent** in the only host (V-6) |
| D-16 | `Schematic` `mode:'live'` on the paper face | `vesselView.jsx` | **by design absent** — "the schematic stays in the yard (a dark SVG)"; 0 `svg` in the paper room |

**Unmounted components:** none in `vesselView.jsx` or `yardView.jsx` — every internal function is referenced at
least twice (definition + use) by an automated count over both files.

**Unbuilt-but-ruled (not dead code — there is no code):** `lib/shared/battleState.js`, vessel `SCHEMA_V = 3`,
bench `SCHEMA_VERSION = 7` (the vehicle meaning), `vesselId`, `hullDcSpent`, `weapon_status`, `ammo_spent`,
`pods_used`, `destroyed`, `swrpg_bench_view_state`, `NpcVesselsBlock`, `BenchCraftCard`, `DERELICT`, squadron,
mass combat, any `npc:` owner — **0 hits for every one at `934c9d24`** (5 §0).

---

## 8. THE SEAMS — where an expansion attaches

### 8.1 The shared cores, and who owns what

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** the "vessel presentation" row's `VesselSheet`/`VesselsTab` and their paper sibling tree are deleted; the presentation is the S4 Yard's (`YardShip`, `YardHangar`, `YardCatalogue`).

| quantity | the ONE home | consumers | second path? |
|---|---|---|---|
| registry vehicle record | `useVehicleLibraryController().getVehicleByKey` | Yard (both apps), vessel sheets | **yes** — `view.jsx` loads the same shards into `refData.vehicles` and `benchVehicleRecord` scans it; `PlayerLanding` reads only `index.json` |
| vessel record ops + budget + fit + shields | `window.SWRPGVessels` | 3 hosts | none |
| vessel presentation | `window.SWRPGVesselView` (`VesselSheet`, `VesselsTab`), faces by prop `paper` | GM, Player dark, Player paper | the paper face is a **sibling element tree inside the same file** (`TrackRowP`, `WeaponToHitP`, `AttachmentsSectionP`, `ProvenanceBlockP`) sharing the writers and pure helpers, not the elements |
| Yard browse state + filter/sort/URL | `SWRPGYard.useYardState` | both hosts | none |
| schematic geometry + Table 7-4 | `SWRPGShipSchematic` | Yard entry, dark vessel sheet, both TO HIT affordances | none |
| crew maneuvers/actions reference | **two** — `vesselView.jsx` hand-typed, and `maneuvers_actions.json` → `ManeuversCard` | vessel sheet vs ⚙ card | **yes** (V-13) |
| astrogation pool | **two** — `travelTime` and `HyperRun.legPool` | route planner vs Hyperspace Run | **yes** (V-13) |
| vehicle stats in the Hyperspace Run | `hyperspaceRun/data.js` SHIPS (copies) | the game | **yes** — not id-refs (§4.7) |
| **a vehicle instance** | **two unrelated shapes** — a *vessel* (`swrpg_vessels_v1`: hull/strain/crits/shields/attachments/provenance, owner party or char) and a *bench craft* (`swrpg_npc_bench` `group.vehicles[] {id,key}` + `member.vehicle {id,pilot?}`, no condition at all) | yard/sheets vs NPC bench | **yes** — neither knows the other; a party ship cannot sit in an encounter, and an encounter craft cannot take damage (fork F-1) |

### 8.2 Capability flags the two hosts pass

> **RETIRED in part at the SHIP YARD S5 flip (lap `shipyard-s5` step 2b; ruling `shipyard-s5-ready` R-S5R-18, 2026-10-06):** the `YardEntry` and `VesselSheet` rows below name deleted components.

| surface | flag | GM | Player | what it gates |
|---|---|---|---|---|
| `YardEntry` | `capabilities.gm` | `true` | `false` | the GM Edit affiliation panel |
| `YardEntry` | `acquireSlot(vehicle)` render-slot | ＋ADD TO PARTY | ＋ADD TO YOUR VESSELS | the whole acquisition control is host-owned |
| `YardBrowse` | `matrixEnabled` | `true` | `false` | MATRIX view |
| `YardBrowse` | `vesselsSlot` / `vesselsLabel` | party list | — (VESSELS jumps to the sheet) | the in-yard VESSELS view |
| `VesselSheet` | `capabilities.gm` | `true` | `false` | only the Decommission wording and the "no longer in the registry" remove button |
| `VesselSheet` | `paper` | — | `true` in the paper room | the whole element tree |
| `VesselSheet` | `actions.*` | host writers | host writers | every write — the module is "pure presentation over injected state" |
| NPC `Library` | `capabilities.canSeedEncounter` | default | `false` | encounters, and with them all craft |

### 8.3 Extension points already in the code

- **Owner vocabulary** — `owner` is a free string; two values in use (`'party'`, `'char:<id>'`). A new holder (a
  group, a base, an NPC faction — the ratified `npc:` kinds, C10) is a new string and a new `forOwner` filter.
- **Overlay pass-through — there is none.** `normalizeVessel` rebuilds the record from a fixed field list, so
  **an unknown field is dropped on the next write** (the bench's member-level pass-through has no vessel twin).
  Any new vessel field is therefore a `SCHEMA_V` bump — an **R-Y2-1 durable-contract halt** — and, until V-1 is
  fixed, a bump that a stale tab will strip.
- **GM overrides map** — `{[vehicleKey]: {affiliation}}` with the stated slot for "rename, hardpoint state";
  already synced as a WHOLE key (unversioned).
- **Attachment constraints** — `resolveFit` computes 5 constraint kinds and quotes 2; a mapping for
  `category_limit` (vs `category_subtype`) and `item_limit` (vs a model's `_source_key`) is where fit would tighten
  (F-14). **Effects** would need a new field on the attachments registry (Contract 1 today: prose only).
- **Schematic modes** — `mode:'reference' | 'live'`; `focusIndex`; a third mode extends the same component (R-SY1).
- **Sync** — adding a key to `syncMerge.LISTS`/`WHOLE` registers push/pull too; the vessel key is there already;
  the tombstone list is shared (V-4).
- **HOLOTABLE** — `roomState` enumerates 8 event types (`token_move, initiative_change, membership,
  destiny_change, roll, feed_entry, fx_trigger, wound_strain_delta`) and states that any new connected tool
  "requires a schema change … a durable-contract HALT". Vehicles are bench-owned and off the wire by ruling
  (R-V7S-1). Tokens key on bench **member** instance ids, so a craft has no token identity today; vehicle damage
  on the wire would be a new event type — the halt.
- **Route planner ↔ a vessel** — the hyperdrive-class chip is independent of every vessel's
  `hyperdrive_primary`; the Hyperspace Run's ship is independent of both (F-11, F-12).
- **Store** — `FindLine` (the Table 5-1 find difficulty) is the one store renderer the Yard reuses; there is no
  purchase path for a ship itself and the header rules out financing math (R-SY3). The counter's SHIP LINES (parts, mods
  and weapons bought for a ship) do deliver, through S4's G-7 seam; their known limit at the flip (B-1071) is in §3.5.
- **OggDude** — `parseVehicleRef` already yields `{itemKey, guid, count, name, notes}`; the missing pieces are an
  index entry (V-6), a writer to the vessel store, the dropped fields (I-2…I-5), and export's `Vehicles` slot.
- **Talents / Force / pool mods** — `lib/shared/poolMods.js` is "the ONE assembler that turns certified item
  effects into dice", scoped to personal checks; it has no vehicle input. The two vehicle talents with
  `pool_mods` (Galaxy Mapper, Skilled Jockey) have no vehicle-check consumer.

### 8.4 What the RAW needs that no seam provides

From the gap table in [`RULES_FOUNDATION_VEHICLES.md`](RULES_FOUNDATION_VEHICLES.md) §F — the state the books
imply and nothing in the app can hold: current speed; per-round Pilot Only counters; per-weapon fired /
Slow-Firing cooldown / Limited Ammo count; defense zones re-angled *within a conserved total*; crippled and
systems-down flags; crits with their result (not just severity) and the +10-per-crit roll modifier; component
damage (Tables 7-10/7-11); Gain-the-Advantage pairings; chase range bands; Massive on the attack; a signature
vehicle link on the character; squadrons and mass combat (a Jason-signed HOLOTABLE v1 exclusion, R-HRC-8).

---

## 9. DECISION HISTORY AND THE CONTRACTS ALREADY RULED

Source: `5_decisions.md` (every path read by blob at `934c9d24`; the stem is the ruling file under
`Docs/rulings/` unless a path is given). "In force" means no later document read at `934c9d24` supersedes it.

### 9.1 The decision log, in order

| date | record | what it decided | status |
|---|---|---|---|
| 2026-05-24 | `Docs/VEHICLE_LIBRARY_SPEC.md` (spec) | sharded `public/data/vehicle-library/` (9 buckets) from `oggdude_merged.json`; affiliation auto-derive + GM override; no commerce in v1; Yard + Matrix; filters in URL; damage tracking deferred to a future Vehicle Combat wizard | **partly superseded**; status line "Implementation pending" and "415" stale |
| 2026-06-13 | ADR `decisions/0006-universal-hyperspace-routing.md` | off-network planets route by wild-space legs; "No route found" removed; locked by `test/map_routing.cjs` | in force |
| 2026-06-19 | ADR `decisions/0008-remove-encounter-system-npc-bench.md` | the whole encounter system incl. the Vehicle combat wizard removed; "future combat-tracking lives in the NPC bench"; test "does it REMOVE bookkeeping or ADD a thing to operate?" | in force as history; "do not rebuild the board" partly reversed 2026-08-04/08 |
| 2026-06-22 | `Docs/FIRST_PRINCIPLES_CHARTER.md` §3.4 | Non-Goal "a virtual tabletop / live combat arena" | reversed/rewritten on the record (2026-08-04, -08-08, -08-26) but **the charter text is unchanged** (§9.4 #1) |
| 2026-07-10 | `shipyard-run-recon` | Y1 reference / Y2 vessels that remember / Y3 riders; FORK D the Yard gains VESSELS, a GM.PARTY screen rejected; FORK D2 player gets the full shared kernel; riders **R-SY1** one schematic · **R-SY2** geometry only from registry fields · **R-SY3** acquisition writes `{owner, acquired}`, no financing · **R-SY4** schema on paper first, one acquisition = one record · **R-SY5** player face = same module · **R-SY7** print-layer cites | in force |
| 2026-07-10 | `Docs/RULES_FOUNDATION_VEHICLES.md` (Y0) | the RAW base for the run | in force; expanded 2026-09-23 |
| 2026-07-11 | `shipyard-y1-design-review-handoff` | Jason picked the WARMTH PACKAGE board; **R-DI4** hero sign-off on in-context renders; **R-DI5** `corpus.css` sole home | in force |
| 2026-07-11 | `shipyard-y2` | ACCEPT with **C-Y2a** (4 crit severities, not 3 — landed) and **C-Y2b** warn-never-block over defense 4; **R-Y2-1** build autonomy never covers durable-contract halts (→ ADR 0012, standing law) | in force |
| 2026-07-11 | `yard-extraction-recon` Amendment 1 → `yard-player-mount-recon` | Jason: *"Is that good UX? Is it good to hide a premium app feature?"* → `/player/yard` front door; **Amendment 1 (Jason): the bar is VIEWS ONLY** (GM `INDEX · MATRIX · VESSELS`, player `INDEX · VESSELS`); **R-AR1** every shape ruling leads with MOMENTS (→ R-PL1) | in force |
| 2026-07-11 | `shipyard-y3-scope` … `shipyard-y3e` | Y3a TO-HIT (informs, never decides, no roll button) · Y3b EotE crew set only (**R-Y3b-1** the AoR pass parked for Jason) · Y3d attachments (Contracts 1–2, below) · Y3e picker fit (compute what's computable, quote the rest; **R-Y3e-1/2** polish open) · **Y3c compare NOT built** | built except Y3c |
| 2026-07-13 | `books-1b-vehicle-vocab-handoff` | vehicle source codes become book aliases; **the two `aorbeta` ships HIDDEN (Jason)**, records kept | in force; re-source-or-retire open |
| 2026-07-16/17 | `map-yard-lap`, `c2-yard-image-honesty` | image honesty: 309 real images, no default-art captions | closed |
| 2026-07-21 | ADR `decisions/0016-bench-member-instance-identity.md` | every bench member has an instance id; RAW minion pools are per group | in force |
| 2026-08-04 | `f54-bench-vehicle-schema-v6` → `f54-crew-direction-and-raw` → `f54-bench-v6-schema` | bench v6: group `vehicles:[{id,key}]`, member `vehicle?:{id, pilot?}`, one pilot per craft; **Jason: "crew modelling as suggested"**; **R-F54C-1** a second role field is bounced unbuilt; law **"TOLERANCE NEVER OUTRANKS THE ID-REF RULE"** | in force |
| 2026-08-04 | `f54-downgrade-prompt` | **Jason: "F-54 users get a prompt"** — version-ahead sentinel in both stores, write-hold at the hosts, `THIS TAB IS BEHIND` + `REFRESH` banner; purpose: protect "benchStore v7, vessel v3" | built in the stores; **defeated on the vessel side (V-1)**; the vessel-host banner absent |
| 2026-08-04 | `vehicle-integration-program` + `vehicle-integration-p1-p3-plan` | **fourteen decisions, all Jason's**; phases P1–P5; the VTT Non-Goal reversed "on the record"; Jason's scoping "P1–P3 in full … P4 and P5 get their own plans after P1–P3 land. Gate per phase" | **ratified; NOT BUILT** (§9.2) |
| 2026-08-05 | `f34-phase-b-scope` | the synced key set incl. `swrpg_vessels_v1`, `swrpg_npc_bench`, `swrpg_gm_vehicle_overrides`; list keys merge by record id, newest wins, tombstones after union | built; accounts live since 2026-08-06 |
| 2026-08-08 | `charter-amendment-encounter-thesis` | Jason, 8-question walkthrough: propose-and-dispose; rewrite the VTT Non-Goal; new Non-Goal "AUTOMATED RESOLUTION" | directed, **not landed** |
| 2026-08-18 | `f33a-gadgets-ships-census` | ICONIC slice priced, **R-F33A-5 F-33b UNAUTHORISED (Jason's pull)**; **R-F33A-7** `ships`/`gadgets` are unreliable corpus sources — a negative over them must not be cited | in force |
| 2026-08-21 | `vehicle-armament-triage` → `-repair` → `-repair-gate` | B-215 Hailfire repaired; **R-VAR-2** the library had "no schema, no validator coverage and no guard" → `test/vehicle_weapon_profiles.cjs`; R-VAR-3 `KOSSAKFRIG` held; R-VAR-5 `stats_complete` unchanged; spawned B-216/B-217/B-218 | closed; spawned rows open |
| 2026-08-21/26 | `bench-ledger-crewing` → `b296-b297-crewing-chip` | LIST-view crewing reuses `VehiclePanel`; the crewing chip **"approved" by Jason (R-MU1)** | built |
| 2026-08-25 | `blobret2-viewport-and-a-defect-that-was-not-there` **R-B274-1** | the three library-card `VehiclePanel` mounts are **DELETED, not wired**; scheduling Jason's | ruled, **not built** |
| 2026-08-26 | `holotable-concept` (F-99) | **R-HT-1** HOLOTABLE is the first signed exemption; **R-HT-5 THE FENCE** wire events enumerated, a new connected tool = halt + concept; **R-HT-6** geometry advises, table decides | in force; exemption not transcribed into the charter |
| 2026-08-26 | `holotable-raw-census` | **R-HRC-2: vehicles IN HOLOTABLE v1, "FULL SLICE, SIGNED BY JASON"** (hull, strain, crit table, silhouette difficulty, arcs, crew actions, starship maneuvers) as a LATE slice group; **R-HRC-8: MASS COMBAT a NAMED v1 EXCLUSION** (Jason: *"massive combat is excluded. Future update"*) | in force |
| 2026-08-26 | `holotable-foundations-census`, `holotable-benchstore-v7-schema` | **R-HFC-4** `stats_complete` never gates combat readiness; **R-V7S-1 "v7 IS CANCELLED. benchStore is not modified by this program"** — vehicles bench-owned, room state holds none | in force |
| 2026-08-26/27 | `token-ownership-edge` R-TOE-4; `holotable-slice2-concept` | one owner per token, many tokens per member; shared-vehicle co-ownership DEFERRED; "vehicles PLACE as tokens, vehicle COMBAT stays the late cluster" | in force |
| 2026-09-02 | `b336-vehicle-attachments-wave-gate` | 111 attachment `sources` entries converted to book keys | closed |
| 2026-09-09 | `creator-release-priority` R-CRP-1 | Jason: *"I want to release the desktop and phone creator revision as priority. All other and new work not associated can be deferred until they are complete."* | in force — **vehicle work is deferred under it** |
| 2026-09-21 | `paper-revision-scope-and-push` R-PRS-1/4 | Jason: *"… everything besides NPC and Vehicles in the player Datapad with a paper revision"*; the Yard index/entry stay legacy on flip day; the vessel SHEET is already paper (B-636) | in force; the landing seam is Jason's open queue item |
| 2026-09-21 | `npc-library-foundations-census` | bench ground sound; `group.vehicles[].key` id-ref confirmed; B-465's red is a stale literal | in force |

### 9.2 The vehicle integration programme (2026-08-04) — 14 decisions, measured

**None of P1–P5 has started.** No `Docs/gates/vip*`, no `lib/shared/battleState.js`, vessel schema still v2, bench
still v6. The directed board ids were never used: F-65 and F-66 are F-34 rows. **No board row tracks the programme.**

| # | decision (plan wording, abbreviated) | status at `934c9d24` |
|---|---|---|
| 1 | Encounter craft track damage — YES | NOT BUILT (`normalizeGroupVehicles` constructs `{id, key}` only) |
| 2 | ONE shared battle-state core; vesselStore = ownership overlay, benchStore = encounter overlay | NOT BUILT |
| 3 | Crew nesting + ABOARD marker; damage controls LIVE, visually recessed | PARTLY (the F-54 aboard section + PILOT chip); no nesting, no recession |
| 4 | Collapsible craft rows, default open, collapsed row summarises crew/hurt/hull | NOT BUILT |
| 5 | Fold persists in benchStore, optional, absent = expanded | NOT BUILT |
| 6 | View-state restoration; device-scoped pointer key; selector sort only when > 1 encounter | NOT BUILT |
| 7 | Tracked set: hull, strain, per-zone shields, crits, per-weapon status BY INDEX, ammo, pods, hull-DC flag; crippled/handling derived | owned-vessel side has hull/strain/crits/shields only |
| 8 | Encounter engine boarded as a row only | NOT BOARDED under the directed id; the idea moved to HOLOTABLE |
| 9 | Craft identity `{id, key}` XOR `{id, vesselId}` | NOT BUILT — a v6 build would **drop** a `{id, vesselId}` entry |
| 10 | Removal unlinks; repair = 3 affordances on the VESSEL (strain 1/day, per-crit difficulty, hull ledger 500 cr/pt shown never deducted) | PARTLY (steppers + crit list); no strain timer, no hull ledger |
| 11 | Deterministic crit effects APPLY to derived numbers; judgement effects DISPLAY | NOT BUILT (crits are `{sev, label}`) |
| 12 | Yard owner-aware; library DISPLAY-ONLY; the pickers close by REPLACEMENT | NOT BUILT (`VESSEL_OWNER = 'party'`; the three pickers remain) |
| 13 | Identical craft individual by default; squadron = declared unit (P4) | NOT BUILT |
| 14 | Sequence P1 → P2 → P3, gate per phase | NOT STARTED |

Also ruled in the programme: the **owner vocabulary** `party · char:<id> · npc:<_source_key> · npc:<custom id>`;
the **destroyed-craft rule** (the concept left it "Not yet ruled; Jason's if he wants it"; the plan applied the
architect's recommendation — `destroyed: true`, crew untouched, DERELICT badge — with no recorded Jason word);
the **P4 precondition** (the AoR GM's Kit, which owns squadrons, needs a `books.vocab.json` row — **still unmet**:
the vocab carries `lead_by_example` and `fad_gm_kit`, no AoR GM's Kit).

| phase | ruled content | status |
|---|---|---|
| **P1 · the core** | `battleState.js` dual-export; vesselStore refactored onto it (15-key API unchanged); owner namespace; vessel v2 → v3 (+`weapon_status`, `ammo_spent`, `pods_used`, `destroyed`) documented first in `SHIPYARD_Y2_SCHEMA.md` | NOT BUILT |
| **P2 · craft get state** | benchStore v7 (battle slice, `collapsed`, `hullDcSpent`, `vesselId`, `lastOpenedAt`), `BenchCraftCard`, crew nesting, view-state, ADD FROM A FLEET | NOT BUILT — and HOLOTABLE later **cancelled "v7"** in its own sense (§9.4 #4) |
| **P3 · ownership surfaces** | owner-aware GM yard, `NpcVesselsBlock`, a CRAFT tab, pickers retired; F-54 flips to SHIPPED | NOT BUILT |
| **P4 · squadrons** | minion-pool machinery; ≤ 11 minion craft under a leader; pooled damage; unit silhouette = largest + 1; formations | NOT PLANNED, NOT BUILT |
| **P5 · mass combat** | a wrapper above encounters, GM-declared, no threshold detection | NOT PLANNED; **a Jason-signed HOLOTABLE v1 exclusion** (R-HRC-8) |

### 9.3 The durable contracts (R-SY4 / R-Y2-1 class)

**Any change to a row below is a durable-contract HALT**: it surfaces on paper to the architect before the
dependent code, and a build-autonomy grant does not cover it unless the grant names it (ADR 0012; CLAUDE.md).

| # | contract | where specified | code | match? |
|---|---|---|---|---|
| C1 | **Vessel record** `{id, vehicleKey, owner, nickname, acquired{note,when}, provenance[{note,when}], hull_current, strain_current, crits[{sev,label}], shields_current{fore?,aft?,port?,starboard?}, attachments[], v, createdAt, updatedAt}`; id-ref + overlay; one acquisition = one record | `Docs/SHIPYARD_Y2_SCHEMA.md`; Contract 2 of `shipyard-y3d-census` | `vesselStore.js` | fields match; the doc trued `345981fb` (V-15, B-914) — envelope, stamps and `owner` now match |
| C2 | **Vessel envelope + key** `swrpg_vessels_v1 = {v, vessels[]}`, `SCHEMA_V = 2`, v1 → v2 branch-on-version | same | same | yes (the stale `{v:1}` example trued `345981fb`) |
| C3 | **Crit severity vocabulary** `easy · average · hard · daunting` (Table 7-9); unknown → `hard` | `SHIPYARD_Y2_SCHEMA.md`; C-Y2a | `CRIT_SEV` | yes |
| C4 | **Installed attachment** `{key, when, note}`, dups allowed; budget pure; over = warn, never block; unknown capacity = no warn | `shipyard-y3d-census` Contract 2 | `vesselStore.js`; `key` = the attachment registry **id** | yes |
| C5 | **Vehicle-attachments registry** (Contract 1): `hp|null` = source lists none; `base_mods` display prose only; Mount type excluded | `shipyard-y3d-census`; `schema/vehicle-attachment.schema.json` | `public/data/canonical/vehicle-attachments.json` | **path and names differ from the contract text** (contract: `public/data/vehicle-attachments/`, `key`, `source`; shipped: canonical/, `id` + `_source_key`, `sources`) — the contract defers naming to the canonical registries |
| C6 | **Bench save** `{version: 6, groups:[{id,name,arrangement,notes, vehicles:[{id,key}], members:[{…, vehicle?:{id, pilot?:true}}]}]}`; group level whitelisted; member level keeps unknown keys minus a stat-block deny list | `f54-bench-vehicle-schema-v6`, `f54-crew-direction-and-raw`, `f54-bench-v6-schema` | `benchStore.js` | code matches; its header comment is stale (v5) |
| C7 | **Pilot flag** — one optional boolean; ≤ 1 pilot per craft; **no second role field** without a new ruling (Jason: "crew modelling as suggested") | `f54-crew-direction-and-raw` | `normalizeMemberVehicle` | yes |
| C8 | **Vehicle key namespace** — craft reference the library by `key`, not `_source_key` | `f54-bench-vehicle-schema-v6` | both stores | yes |
| C9 | **Version-ahead sentinel** — newer save flagged in memory, never written back; hosts hold writes; banner, no dismiss | `f54-downgrade-prompt` | both stores; ONE banner, `window.SWRPGUI.StaleTabBanner` (`lib/shared/ui.jsx`, moved from `view.jsx` `f7be334b`) + `StaleHold` for the vessel hosts | **yes, both — the vessel hold module-level since `ee87e353`** (V-1 fixed); the vessel banner on the three dark hosts; the paper VESSELS unit's stale frame is S2's (R-SYC-3) |
| C10 | **Owner vocabulary** `party · char:<id> · npc:<_source_key> · npc:<custom id>`, transferable | `vehicle-integration-program` §4.4 | `party`, `char:<id>` + fallbacks `char:unknown`/`char:player`; no `npc:` | partly |
| C11 | **Per-weapon status keyed by INDEX** | programme; plan | nothing built | ratified, unbuilt |
| C12 | **Programme additions** (vessel v3 fields; bench v7 fields; `swrpg_bench_view_state`) | programme §5 ("R-SY4 satisfied by this ruling") | none built | a v6 build strips every craft field but `id,key` — the (bench) sentinel is what protects v7 |
| C13 | **Sync wire** — vessels LIST by `vessels[].id`, bench LIST by `groups[].id`, overrides WHOLE; tombstones after union; bench suspended in a HOLOTABLE room | `f34-phase-b-scope`; `holotable-room-state-contract` | `worker/sync.js`, `syncMerge.js`, `sync.js` | yes |
| C14 | **HOLOTABLE wire** — 8 enumerated events, unknown refused; a new type = halt + concept (+ exemption if simulator-class); vehicles bench-owned | `holotable-concept`; `holotable-benchstore-v7-schema`; R-RSC-3 | `roomState.js` | yes — **no vehicle event type exists** |
| C15 | **Room-state store** `swrpg_room_state` v1 never holds vehicles | R-V7S-1 | `roomState.js` | yes |
| C16 | **URL routes** `/gm/yard`, `/gm/yard/{vehicleKey}`, `/player/yard`, `/player/yard/{vehicleKey}` + the query keys | `Docs/NAVIGATION.md`; the spec | `yardView.jsx` | yes |
| C17 | **Yard view bar** GM `INDEX · MATRIX · VESSELS`, player `INDEX · VESSELS` (Jason's pick) | `yard-player-mount-recon` Amendment 1 | `ViewBar` | yes |
| C18 | **Hidden source codes** `aorbeta` (and `fadbeta`), records kept | `books-1b-vehicle-vocab-handoff` (Jason) | `books.vocab.json`, `sources.js`, `yardView.jsx` | yes |
| C19 | **Vehicle library registry** — 9 shards + `index.json` (`"vehicle-library-1"`, 433) + `taxonomy.json`; weapon shape pinned by `test/vehicle_weapon_profiles.cjs`; **no JSON schema, no validator** | the spec (stale index shape) | `public/data/vehicle-library/` | the spec is stale |
| C20 | **Affiliation overrides** — spec: `vehicle-overrides.json`; shipped: `localStorage['swrpg_gm_vehicle_overrides']`, synced WHOLE | spec vs code | controller | the spec is stale on the mechanism |

### 9.4 Contradictions between the records (both sides cited; no reconciliation offered)

1. **The VTT Non-Goal — three directed charter edits, none landed, in three forms:** STRIKE it (programme, Jason
   2026-08-04) · REWRITE it to "a REMOTE-FIRST virtual tabletop chasing the grid-VTT market" (encounter thesis,
   Jason 2026-08-08) · KEEP it with a case-by-case EXEMPTION (HOLOTABLE, Jason 2026-08-26). The charter still reads
   `- a virtual tabletop / live combat arena;`.
2. **What the programme may resolve vs what HOLOTABLE v1 includes:** the programme says "no initiative, no turn
   order, no attack resolution anywhere in this programme" and plans P5 mass combat; HOLOTABLE's R-HRC-2 puts the
   full vehicle slice (silhouette difficulty, arcs, crew actions, maneuvers) in v1 and R-HRC-8 excludes mass
   combat. The HOLOTABLE rulings do not name the programme.
3. **The three library-card pickers — three rulings, three shapes:** C-F54B-1 (thread persisted craft in, then
   retire) · programme §8 (replace with a read-only `NpcVesselsBlock` in P3) · R-B274-1 (delete, not wired; it
   cites neither). The P3 plan re-points the ARSENAL fold-in at the NPC's first owned vessel; R-B274-1 re-homes
   weapon-row coverage to encounters.
4. **"benchStore v7" means two things:** the programme's (craft battle state, `collapsed`, `hullDcSpent`,
   `vesselId`, `lastOpenedAt`) and HOLOTABLE's (initiative + tokens + Destiny) — then R-V7S-1 cancels "v7". The
   downgrade-prompt ruling and a live `benchStore.js` comment still expect "benchStore v7, vessel v3". No ruling
   addresses the vehicle v7 after the cancellation.
5. **Board ids:** the plan directs F-65 (engine) and F-66 (P1–P3); both ids are F-34 rows.
6. **The engine's gating premise:** the programme says accounts (F-34) are unbuilt and "no sync infrastructure
   exists"; accounts are live and both vehicle stores sync.
7. **Destroyed-craft crew fate:** concept "Jason's if he wants it" vs plan "resolved by the recommendation" — no
   Jason word in either.
8. **Contract 1 vs the shipped attachments registry** (path and field names — C5).
9. **Owner vocabulary:** free label (schema doc) vs a four-kind namespace (programme) vs two kinds + two
   fallbacks (code).
10. **RULES_FOUNDATION_VEHICLES header vs its own debt #3** on AoR/FaD offsets (corrected in the 2026-09-23
    expansion).
11. **Is P1–P3 live work?** "Jason-approved 2026-08-04 via plan review" and "awaiting its implementer pickup" vs
    R-CRP-1 (defer) and R-PRS-1 (vehicles out of the flip). No ruling cancels the plan.

**Stale documents** (5 §6.2): `Docs/VEHICLE_LIBRARY_SPEC.md` (415, "Implementation pending", FORGE/PARTY tiles,
index shape, `vehicle-overrides.json`, "doesn't model PC ownership"); `Docs/SHIPYARD_Y2_SCHEMA.md` (V-15);
`benchStore.js`'s header; `shipyard-y1-scope-recon` names `shipSchematic.jsx` (shipped `.js`); BOARD F-54 and
B-274 text; `Docs/JASON_QUEUE.md`'s flip line ("decide once the census reports" after the census reported); the
programme plan's line anchors and its "AoR p.259" (reads **258** per `raw-citation-erratum`). The historical "415"
in rulings is correct as history and stays (`f54-bench-vehicle-schema-v6`).

---

## 10. LAWS ANY EXPANSION MUST PASS — with the vehicle consequence of each

Law lives in [`CLAUDE.md`](../CLAUDE.md); this is the vehicle reading of it (5 §5).

| law | vehicle-specific consequence |
|---|---|
| **R-PL1** (product laws filter, process tie-breaks) | every user-visible vehicle shape enumerates the four-gate TEST, the Prime Directive, hero-features-get-front-doors, the just-looking moment, no-compromise-mirror, mechanics voice, DESIGN_IDENTITY/PROSE_VOICE, and carries a MOMENTS line. The repo's first R-PL1 ruling *was* a vehicle one (the Yard's buried player door) |
| **R-MU1 / R-MU2 / C-MU-2…4 / R-MIL-2** (mockup before UI; an approved mockup is law) | the P1–P3 plan predates R-MU1, so `BenchCraftCard`, an owner picker, `NpcVesselsBlock`, a CRAFT tab have **no approved mockup**; "zero-design" plan text is not a mockup. R-MU1 says real numbers come "from `public/data/canonical/`" — **the vehicle library is not there** (`public/data/vehicle-library/`); only the attachments are. HOLOTABLE's 14 frames are approval-DEFERRED. R-DI4: hero sign-off on in-context renders |
| **R-FCR-1 / R-DRC-1 / R-RLO-1…2** (foundations census; design-record census; new reds by suite) | this document is the foundations census for the vehicle surfaces; its reds (§6) are the "broken → rows BEFORE the concept" list. B-465 and `vehicle_weapon_profiles`' pin are known reds on the path |
| **R-Y2-1 / ADR 0012 / R-SY4** (durable-contract halts) | every row of §9.3: vessel v3, any bench field, the owner namespace, per-weapon index keys, a crit-effect key list, any HOLOTABLE event type, the synced key set, yard routes/params. **V-1 makes every vessel bump unsafe until fixed** |
| **Version-ahead sentinel** (`f54-downgrade-prompt`) | a vessel v3 or bench bump is the first protected bump — and the vessel half does not protect (V-1) |
| **R-RRD-1** RAW decides behaviour + **R-SY7 / R-EQW1 / R-F33A-7** | behaviour clashes (V-9 thresholds, §4.3 angling, §4.8 travel time, V-10 arcs) go to the books by printed page; cite the book that owns the rule; `ships` and `gadgets` negatives are never cited. The RAW register is [`RULES_FOUNDATION_VEHICLES.md`](RULES_FOUNDATION_VEHICLES.md) |
| **HOLOTABLE fence** R-HT-5 / R-HT-6 / R-HT-1 + **R-HRC-2 / R-HRC-8** | vehicle combat is IN HOLOTABLE v1 as a late cluster; mass combat is OUT ("Future update"); vehicles are never room state; vehicle damage on the wire is a new event type = the halt; vehicle range bands ride the vehicle cluster's own design |
| **One shared core / no compromise reimplementation** (ARCHITECT_CHARTER §8; R-SY1; R-SY5) | "a second resolution path for the same quantity is a defect": V-13's three pairs are defects by this law; the programme's rejected shape was "`benchStore` growing its own hull/strain fields" |
| **Id-refs + resolve-at-render; TOLERANCE NEVER OUTRANKS THE ID-REF RULE** | no vehicle stat is copied into a vessel or encounter; the Hyperspace Run's SHIPS are the one standing exception (a game) |
| **Inform, never gate / warn, never block** + **R-SY3 / no wallet** | controls stay live; over-cap shields and over-budget hard points warn; non-fitting attachments dim; RAW's 500 cr per hull point is "shown, never deducted". The one sanctioned disable is the stale-tab hold |
| **Rules-enforcement line** (programme §3) + **propose-and-dispose** (not landed) | "if the rule is a number, apply it; if the rule is a decision, show it"; no mass-combat threshold detector — "the mode is declared by the GM or it does not exist" |
| **R-F54C-1** crew tripwire | any squadron / crew-station / gunner feature goes back to Jason; a stations proposal must cite AoR's crew table and argue against the skill-keyed model (R-F54C-2) |
| **Seat isolation / player parity** (FORK D2) | the player gets the full shared surface; P3 kept the player yard unchanged and put NPC fleets on the shared face |
| **Priority rulings** R-CRP-1, R-PRS-1/4 | creator revision first; the paper flip covers everything "besides NPC and Vehicles"; **a vehicle expansion is outside the ruled work queue unless Jason re-ranks it**; pushes are his (R-PBD1) |
| **Sync semantics** | the server never parses payloads; a vessel or bench shape change changes the synced payload; per-record recency (ms `updatedAt`) must stay derivable |
| **Five instrument norms** | every citation carries its commit (this file's do); latent sites are rows (§5.2's UNMEASURED list); a harvest of zero is a failed run (`css_bare_var_tokens`' VOID) |

---

## 11. OPEN FORKS — facts, not decisions (the design is the architect's)

Each fork names the shapes the code or the record already implies and who it belongs to. **None is decided here.**

| # | fork | shapes already implied | belongs to |
|---|---|---|---|
| F-1 | **One vehicle instance or two?** A vessel carries condition; a bench craft carries only `{id,key}` + crew | (a) keep two — the encounter stays "what is in the scene"; (b) a craft becomes or points at a vessel (the programme's `{id, vesselId}`); (c) a vessel can be brought into an encounter | architect; R-Y2-1 on either store |
| F-2 | **Where the vessel version-ahead hold lives** (V-1) | (a) in `save` against a module-level flag (the bench's shape); (b) on every op's returned state; (c) at the hosts | implementer (RAW-free), but a persistence contract → names R-Y2-1 |
| F-3 | **Multi-tab / multi-surface writes** (V-2) | (a) re-read storage before every write (merge by id, like `syncMerge`); (b) listen to `storage` events; (c) one module-level store instead of three copies | architect |
| F-4 | **Who owns a player's ship when no sheet is active** (V-3) | refuse; ask which character; keep `char:player` and give it a home | architect (user-visible, R-PL1/R-MU1) |
| F-5 | **A deleted character's ships** (V-5) | delete with it; move to an unowned list; keep and surface as orphaned | architect |
| F-6 | **Hull / strain past the threshold** (V-9) | allow n > threshold and show crippled / systems-down; keep the clamp and say so | **RAW decides the behaviour** (R-RRD-1; V-RAW-090/092); the look is design |
| F-7 | **Shield angling** — free per-zone steppers vs "move one point from one zone to another" | conserve the total, cap 4; keep free steppers as a ledger with the warning | RAW for the behaviour (V-RAW-012/049) |
| F-8 | **Crew reference from one source** | the sheet reads `maneuvers_actions.json`; keep both | shared-core law |
| F-9 | **Astrogation pool from one source** | the game calls `travelTime`; keep the copy | shared-core law |
| F-10 | **Travel time: house distance model vs Table 7-14** | keep the calibrated model; derive from sector/region per RAW; show both | RAW (a number the GM reads) |
| F-11 | **The route planner's hyperdrive class** vs the party ship's `hyperdrive_primary` (and its damage for Table 7-13) | keep the chip; default it from a chosen vessel | architect |
| F-12 | **Hyperspace Run ships** — stat copies; 2 of 5 keys (`HWK290`, `BARLOZ`) are not registry keys, though the craft exist as `HWK290LTFREIGHT` / `BARLOZFREIGHT` | id-refs with game overrides; keep the game self-contained | architect ("tuning knobs") |
| F-13 | **Turret with partial arcs** (146 rows) — the schematic trusts `turret`, the text trusts `firing_arcs` | data repair to RAW's Fire Arc All + mount limit; render the listed arcs; render both | RAW for the data; the drawing is design |
| F-14 | **Attachment fit for `item_limit` / `category_limit`** (V-11) | map them and compute; keep quoting | architect (it changes what "✓ fits" means) |
| F-15 | **OggDude vehicles** (V-6, I-2…I-5) | index the library, write vessels on import, fill `<Vehicles>` on export; keep reporting absent | the F-36 programme's architect |
| F-16 | **Which count is "the fleet"** — 433 vs 431 shown | landing counts what discovery shows; the Yard shows all 433 | architect (a figure Jason reads) |
| F-17 | **The phone NPC cards' `VehiclePanel`** (B-274) | delete (R-B274-1); wire to encounters (C-F54B-1); replace with a read-only block (P3) | already ruled three ways (§9.4 #3) — the architect reconciles |
| F-18 | **Deep links for an open vessel** | `/gm/yard/vessel/{id}`, `/player/sheet/{id}/vessel/{id}`; none (today) | architect + NAVIGATION; a URL contract → R-Y2-1 |
| F-19 | **Is the 2026-08-04 programme still the plan?** (14 decisions, P1–P5, unbuilt, unboarded) vs HOLOTABLE's vehicle slice and v7 cancellation vs R-CRP-1's deferral | resume the programme as ruled; fold it into HOLOTABLE's late vehicle cluster; re-scope | **Jason** (scope), through the architect |
| F-20 | **Which book's rule applies** where the core books disagree (e.g. Damage Control strain: 1 per check in EotE/AoR vs 1 per Success in FaD — RULES_FOUNDATION §D, D1) | book-scoped by the character's game line; one house choice; show both | RAW records the disagreement; the pick is the architect's |
| F-21 | **Signature Vehicle** (Special Modifications / Stay on Target) — a per-character link to one owned vessel with stat-delta talents | a `signatureVehicleId` on the character; a flag on the vessel; not modelled | architect; R-Y2-1 on either store |
| F-22 | **The charter's VTT Non-Goal** — strike / rewrite / exempt, none landed (§9.4 #1) | — | Jason |
| F-23 | **Destroyed-craft crew fate** | the plan's recommendation (DERELICT, crew untouched); another rule | Jason ("if he wants it") |

---

## 12. HOW TO KEEP THIS CURRENT

Same rule as its creator and sheet siblings. When you change vehicle plumbing:

1. **A new write path** — add it to §2.1's key table and §3's write table, driven through its real control,
   reloaded, and read back from the RECORD with a one-time seed. A ✓ measured through a re-seeding fixture is
   not a ✓ (SHEET_PLUMBING §3).
2. **A save shape changes** — it is a durable-contract halt first (§9.3). Update C1/C2/C6 and
   `Docs/SHIPYARD_Y2_SCHEMA.md` in the same change; fix V-1 before the first vessel bump ships.
3. **A defect closes** — mark it in §6 with the commit; never delete the row.
4. **A core gains a second path** — that is a defect (V-13's class), not an update. File it.
5. **A RAW-bearing number changes** — cite the `V-RAW-nnn` id of [`RULES_FOUNDATION_VEHICLES.md`](RULES_FOUNDATION_VEHICLES.md)
   and update its gap table (§F) in the same change.
6. **§5.2 runs** — DONE 2026-09-23 (20/20 green, 748/748); re-run them when vehicle code moves, and keep the UNMEASURED list honest.
7. **The line cites** here are true at `934c9d24`/`cf4143a0`; when a vehicle file moves, re-anchor on the symbol,
   never on a nearest-line guess.
