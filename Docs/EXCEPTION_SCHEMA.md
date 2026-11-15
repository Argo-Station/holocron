# SPECIES EXCEPTION SCHEMA — generated from the live product

Measured at `181eb8d13` from `public/data/canonical/species.json` (537 species) and `lib/shared/charResolve.js`. **Do not edit; regenerate.**

- species carrying an option group: **198** · with more than one group: **10** · groups with min/max picks: **1**
- distinct group labels: **104** (label is presentation only — the resolver keys on the SLUG of the label: `skills`, `size`, `skill`, …)

## Group keys

| key | groups | exemplar |
|---|---:|---|
| `name` | 208 | Caamasi › Skills |
| `noun` | 207 | Caamasi › Skills |
| `display_name` | 176 | Drabatan › Skill |
| `preselect` | 21 | Arkanian › Subspecies |
| `min_picks` | 1 | Droid › Modifications |
| `max_picks` | 1 | Droid › Modifications |

## Option keys — the exception vocabulary

| key | options | resolver reads it | what it does (from the exemplar's resolution) | exemplar |
|---|---:|:---:|---|---|
| `id` | 450 | — | carries no mechanic (metadata) | Caamasi › Skills › One Rank in Charm |
| `name` | 450 | — | carries no mechanic (metadata) | Caamasi › Skills › One Rank in Charm |
| `skill_grants` | 354 | ✓ | skills {"charm":1} · abilities [Memnii] · answerable on the SHEET too | Caamasi › Skills › One Rank in Charm |
| `description` | 69 | — | carries no mechanic (metadata) | Caamasi › Skills › One Rank in Charm |
| `_source_key` | 65 | — | carries no mechanic (metadata) | Caamasi › Skills › One Rank in Charm |
| `special_abilities` | 51 | ✓ | skills {"resilience":1} · abilities [Immovable, Silhouette 1] · answerable on the SHEET too | Dowutin › Size › Average-Sized |
| `characteristics` | 48 | ✓ | characteristics: cunning 2→1, presence 1→2 · WT 10→9 · ST 10→11 · skills {"medicine":1} · abilities [Night Vision] · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Arkanian › Subspecies › Offshoot · off-by-default |
| `wound_threshold_base` | 48 | ✓ | characteristics: cunning 2→1, presence 1→2 · WT 10→9 · ST 10→11 · skills {"medicine":1} · abilities [Night Vision] · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Arkanian › Subspecies › Offshoot · off-by-default |
| `strain_threshold_base` | 43 | ✓ | characteristics: cunning 2→1, presence 1→2 · WT 10→9 · ST 10→11 · skills {"medicine":1} · abilities [Night Vision] · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Arkanian › Subspecies › Offshoot · off-by-default |
| `_default` | 19 | — | carries no mechanic (metadata) | Arkanian › Subspecies › Baseline · off-by-default |
| `starting_xp` | 19 | ✓ | characteristics: brawn 2→3, agility 3→2, cunning 3→2, willpower 2→3 · WT 10→11 · ST 11→12 · XP 90→80 · abilities [Fearsome Countenances] · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Dathomirian › Subspecies › Male · off-by-default |
| `xp_adjustment` | 13 | ✓ | XP 100→110 · skills {"discipline":1} · abilities [Ammonia Respirator] · answerable on the SHEET too | Gand › Breathing › Has Lungs |
| `_provenance` | 5 | — | carries no mechanic (metadata) | Gand › Breathing › Has Lungs |
| `skill_choice_grants` | 4 | ✓ | choose 1 of combat (6 skills offered) · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Mandalorian Human › Skills › Combat Skill |
| `wound_threshold_adjustment` | 3 | ✓ | WT 10→12 · abilities [Durasteel Plating, Mechanical Beings, Specialized, Silhouette 2] · talents [enduring] · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Droid › Modifications › Large · off-by-default |
| `starting_talents` | 2 | ✓ | skills {"mechanics":1} · abilities [Practiced Mechanic] · talents [gearhead] · answerable on the SHEET too | Sluissi › Talents › Gearhead · off-by-default |
| `characteristic_overrides` | 1 | ✓ | characteristics: presence 2→3 · WT 13→11 · XP 95→80 · skills {"negotiation":1} · abilities [Gifted Traders, Hardened Plates, Volcanic Home] · talents [wheel_and_deal, enduring] · stat-moving → CREATOR-ONLY (the sheet's SpeciesAsk routes it back) | Vaathkree › Variable Forms › Humanoid · off-by-default |

## The other axes — where each rule lives

The species option keys above all resolve in the shared core. The "home" column is MEASURED (a named core function → CORE; otherwise the file that dereferences the key). DISPLAY marks a key that is only rendered — it gates nothing and persists nowhere, so there is no rule to pin. Anything else not CORE is a rule a creator revision can break unseen.

| axis | key | carriers | exemplars | home | core function |
|---|---|---:|---|---|---|
| species (record) | `starting_skills` | 302 / 537 | Aleena, Aqualish, Arcona, Arkanian … (+298) | CORE | `speciesSkillGrants` |
| species (record) | `starting_talents` | 172 / 537 | Aleena, Anx, Bothan, Chagrian … (+168) | CORE | `speciesTalentGrants` |
| species (record) | `skill_choice_grants` | 18 / 537 | Geonosian, Human, Klatooinian, Lasat … (+14) | CORE | `speciesChoiceGrants` |
| species (record) | `bonus_free_ranks` | 2 / 537 | Arkanian Offshoot {"career":2,"spec":0}, Droid {"career":2,"spec":1} | CORE | `creationSkillAllowance` |
| species (record) | `career_skill_choice_grants` | 1 / 537 | Cerean [{"count":2,"pool":"knowledge"}] | CORE | `speciesChoiceSkillsFor` |
| species (record) | `force_rating` | 0 / 537 | — (no carrier: the clause is UNMEASURED) | CORE | `forceAccessAtCreation` |
| career | `force_rating` | 8 / 21 | Consular, Guardian, Jedi, Mystic … (+4) | CORE | `forceAccessAtCreation` |
| career | `free_ranks` | 21 / 21 | 4 (13), 3 (8) | CORE | `creationSkillAllowance` |
| career | `starting_entitlements` | 1 / 21 | Bounty Hunter: Imperial Peace-Keeping Certificate | DISPLAY | rendered on the career card only — gates nothing, persists nowhere (app.jsx FCCareerDetail); the IPKC is prose the book leaves to the table |
| specialization | `universal` | 21 / 137 | Death Watch Warrior, Force Adherent, Force Sensitive Emergent, Force Sensitive Exile … (+17) | CORE | `costForNewSpec` |
| specialization | `force_rating` | 4 / 137 | Force Sensitive Emergent, Force Sensitive Exile, Force-Sensitive Outcast, Padawan Survivor | CORE | `forceAccessAtCreation` |
| specialization | `min_force_rating` | 3 / 137 | General=2, Knight=2, Master=3 | CORE | `specGate` |
| specialization | `species_requirement` | 1 / 137 | Retired Clone Trooper→clone | CORE | `specGate` |
| specialization | `career_skill_choice_grants` | 1 / 137 | Republic Representative [{"count":1,"pool":"knowledge"}] | CORE | `specChoiceSkillsFor` |
| talent | `career_skill_choice_grants` | 2 / 647 | Well Read, Well Rounded | CORE | `talentChoiceGrantsOf` |
| talent | `force_rating (talent)` | 1 / 647 | Force Rating (+1 FR per rank) | CORE | `derivedBonusesFromTalents` |
| mechanic | `tradeOptions` | 3 / 3 | obligation: 4 trades, mode multi; duty: 4 trades, mode multi; morality: 5 trades, mode single_pick | CORE | `computeMechanic` |

**The Force-access rule at creation** (`gameLine === 'fad'` ∨ career FR ≥ 1 ∨ spec FR ≥ 1 ∨ species FR > 0) is implemented in: **CORE** — one place. Its species clause has 0 carriers.
**The mechanic engine** `computeMechanic` (Obligation/Duty/Morality trades from `narrative-mechanics.json`) is defined in **the core (the shell forwards to it)**; `oggImport.js` builds the record through the core's `mechanicRecord`.

## The shelf — sources are fluid, and what that changes

67 books (Core 3 · Supplement 45 · Era 3 · Community 15 · UserData 1). Default: official ON, community/user OFF → **16 off**, hiding species 440 · careers 1 · specializations 8 · talents 17. The shelf filters DISCOVERY only (Law 1 — owned content never consults it); resolver `lib/shared/sources.js` (CORE).

Books that, turned OFF from the default shelf, hide something (community books are already off):

| book | group | line | species | careers | specs | talents |
|---|---|---|---:|---:|---:|---:|
| `fad` | Core | fad | 6 | 6 | 18 | 66 |
| `dawn_of_rebellion` | Era | era | 4 | 0 | 6 | 32 |
| `lords_of_nal_hutta` | Supplement | eote | 4 | 0 | 0 | 0 |
| `forged_in_battle` | Supplement | aor | 4 | 0 | 2 | 5 |
| `allies_adversaries` | Supplement | — | 4 | 0 | 0 | 0 |
| `eote` | Core | eote | 3 | 6 | 15 | 2 |
| `rise_of_the_separatists` | Era | era | 3 | 2 | 9 | 47 |
| `collapse_of_the_republic` | Era | era | 3 | 0 | 9 | 50 |
| `dangerous_covenants` | Supplement | eote | 3 | 0 | 2 | 4 |
| `special_modifications` | Supplement | eote | 3 | 0 | 3 | 12 |
| `suns_of_fortune` | Supplement | eote | 3 | 0 | 0 | 0 |
| `stay_on_target` | Supplement | aor | 3 | 0 | 3 | 21 |
| `desperate_allies` | Supplement | aor | 3 | 0 | 3 | 15 |
| `cyphers_and_masks` | Supplement | aor | 3 | 0 | 3 | 16 |
| `disciples_of_harmony` | Supplement | fad | 3 | 0 | 3 | 15 |
| `unlimited_power` | Supplement | fad | 3 | 0 | 3 | 11 |
| `knights_of_fate` | Supplement | fad | 3 | 0 | 3 | 12 |
| `nexus_of_power` | Supplement | fad | 3 | 0 | 0 | 0 |
| `aor` | Core | aor | 2 | 6 | 15 | 22 |
| `enter_the_unknown` | Supplement | eote | 2 | 0 | 2 | 3 |
| `far_horizons` | Supplement | eote | 2 | 0 | 3 | 7 |
| `fly_casual` | Supplement | eote | 2 | 0 | 3 | 12 |
| `no_disintegrations` | Supplement | eote | 2 | 0 | 3 | 4 |
| `fully_operational` | Supplement | aor | 2 | 0 | 3 | 13 |
| `lead_by_example` | Supplement | aor | 2 | 0 | 3 | 10 |
| `strongholds_of_resistance` | Supplement | aor | 2 | 0 | 0 | 0 |
| `savage_spirits` | Supplement | fad | 2 | 0 | 3 | 12 |
| `endless_vigil` | Supplement | fad | 2 | 0 | 3 | 8 |
| `keeping_the_peace` | Supplement | fad | 2 | 0 | 3 | 6 |
| `friends_like_these` | Supplement | aor | 1 | 0 | 0 | 0 |
| `chronicles_of_the_gatekeeper` | Supplement | fad | 1 | 0 | 0 | 0 |
| `jewel_of_yavin` | Supplement | eote | 0 | 0 | 0 | 1 |

## Twins — one name, several records; the shelf decides which one the creator offers

**121** names are defined by more than one record (species 120 · specs 0 · careers 0 · talents 1); **103** species twins carry DIFFERENT creator-facing numbers. Winner = lowest `namePrecedenceOf` among the ACTIVE twins (official before community, earlier book before later) — so turning the official book off makes the same name mean a different character. Pinned per twin: the winner under the default shelf and under all-on.

| twin | records | default winner | all-on winner | numbers differ |
|---|---|---|---|:---:|
| species · Aleena | aleena ← nexus_of_power [p32]<br>csg_aleena ← the_complete_species_guide [p1064] | `aleena` | `aleena` | **yes** |
| species · Anx | anx ← savage_spirits [p27]<br>csg_anx ← the_complete_species_guide [p1064] | `anx` | `anx` | **yes** |
| species · Aqualish | aqualish ← dangerous_covenants [p9]<br>csg_aqualish ← the_complete_species_guide [p1064] | `aqualish` | `aqualish` | **yes** |
| species · Arkanian | arkanian ← disciples_of_harmony [p26]<br>csg_arkanian ← the_complete_species_guide [p1064] | `arkanian` | `arkanian` | **yes** |
| species · Balosar | balosar ← cyphers_and_masks [p23]<br>csg_balosar ← the_complete_species_guide [p1064] | `balosar` | `balosar` | **yes** |
| species · Barabel | barabel ← unofficial_species_menagerie [p1063]<br>csg_barabel ← the_complete_species_guide [p1064] | `null` | `barabel` | **yes** |
| species · Bardottan | bardottan ← nexus_of_power [p32]<br>csg_bardottan ← the_complete_species_guide [p1064] | `bardottan` | `bardottan` | **yes** |
| species · Bith | bith ← fully_operational [p21]<br>csg_bith ← the_complete_species_guide [p1064] | `bith` | `bith` | **yes** |
| species · Bothan | bothan ← eote/aor [p0]<br>csg_bothan ← the_complete_species_guide [p1064] | `bothan` | `bothan` | **yes** |
| species · Caamasi | caamasi ← desperate_allies [p19]<br>csg_caamasi ← the_complete_species_guide [p1064] | `caamasi` | `caamasi` | **yes** |
| species · Cathar | cathar ← unofficial_species_menagerie [p1063]<br>csg_cathar ← the_complete_species_guide [p1064] | `null` | `cathar` | **yes** |
| species · Cerean | cerean ← fad [p2]<br>csg_cerean ← the_complete_species_guide [p1064] | `cerean` | `cerean` | **yes** |
| … | +109 more, all in test/exceptions.golden.json | | | |

## Overlays — GAME VARIANTS (reSpecialized) and the talent→number table

Packs under `public/data/mods/`, applied by `lib/shared/mods.js` (CORE) when the toggle is on, stamped on the sheet so ownership survives the toggle. Pinned on the smoke's fixture: the overlay Scoundrel owns *Opportunist* and not *Side Step*.

| pack | line | specs rebuilt | talents added | careers | scoundrel: Opportunist / Side Step |
|---|---|---:|---:|---:|---|
| `respecialized@aor-v1` | aor | 41 | 240 | 4 | ✗ / present |
| `respecialized@aor-v2` | aor | 51 | 334 | 5 | ✗ / present |
| `respecialized@eote-v1` | eote | 36 | 202 | 1 | ✓ / absent |
| `respecialized@eote-v2` | eote | 46 | 286 | 2 | ✓ / absent |
| `respecialized@fad-v1` | fad | 51 | 171 | 8 | ✗ / present |

`TALENT_DERIVED_EFFECTS` — the core's hand-curated list of talents that change a derived number (code-resident data; keyed by CANONICAL id):

| talent | in talents.json | bonus per rank |
|---|:---:|---|
| `grit` | ✓ | strainThresholdBonus +1 |
| `toughened` | ✓ | woundThresholdBonus +2 |
| `enduring` | ✓ | soakBonus +1 |
| `sixth_sense` | ✓ | rangedDefenseBonus +1 |
| `superior_reflexes` | ✓ | meleeDefenseBonus +1 |
| `force_rating` | ✓ | forceRatingBonus +1 |
| `dedication` | ✓ | (characteristic / conditional) |
| `armor_master` | ✓ | (characteristic / conditional) |
| `armor_master_improved` | ✓ | (characteristic / conditional) |

## Group labels (104)

`Skills`×27 · `Subspecies`×27 · `Brawl or Melee`×6 · `Athletics or Coordination`×4 · `Knowledge-Education or Mechanics`×4 · `Genders`×4 · `Charm or Deception`×4 · `Castes`×4 · `Brawl or Survival`×3 · `Perception or Survival`×3 · `Deception or Negotiation`×3 · `Athletics or Resilience`×3 · `Computers or Mechanics`×3 · `Charm or Negotiation`×3 · `Perception or Vigilance`×3 · `Mechanics or Negotiation`×2 · `Brawl or Stealth`×2 · `Charm or Discipline`×2 · `Piloting-Planetary or Piloting-Space`×2 · `Discipline or Melee`×2 · `Resilience or Stealth`×2 · `Discipline or Knowledge-Education`×2 · `Discipline or Knowledge-Lore`×2 · `Astrogation or Piloting-Space`×2 · `Stealth or Survival`×2 · `Sizes`×2 · `Knowledge-Xenology or Medicine`×2 · `Coercion or Discipline`×2 · `Ranged-Heavy or Ranged-Light`×2 · `Ages`×2 · `Cool or Discipline`×2 · `Knowledge-Xenology or Survival`×2 · `Knowledge-Education or Knowledge-Lore`×2 · `Size`×1 · `Skill`×1 · `Technology`×1 · `Breathing`×1 · `Combat`×1 · `Vocal Cords`×1 · `Talents`×1 · `Mechanics or Piloting-Space`×1 · `Knowledge-Education or Negotiation`×1 · `Discipline or Vigilance`×1 · `Leadership or Survival`×1 · `Types`×1 · `Negotiation or Streetwise`×1 · `Cool or Knowledge-Lore`×1 · `Species`×1 · `Perception or Streetwise`×1 · `Mechanics or Medicine`×1 · `Brawl or Discipline`×1 · `Knowledge-Xenology or Leadership`×1 · `Knowledge-Lore or Perception`×1 · `Deception or Melee`×1 · `Astrogation or Negotiation`×1 · `Coordination or Perception`×1 · `Charm or Leadership`×1 · `Modifications`×1 · `Knowledge-Lore or Charm`×1 · `Knowledge-Education or Xenology`×1 · `Deception or Skulduggery`×1 · `Classes`×1 · `Cool or Survival`×1 · `Coordination or Deception`×1 · `Coercion or Vigilance`×1 · `Deception or Leadership`×1 · `Discipline or Survival`×1 · `Astrogation or Knowledge-Education`×1 · `Knowledge-Lore or Mechanics`×1 · `Deception or Knowledge-Warfare`×1 · `Piloting-Space or Resilience`×1 · `Athletics or Leadership`×1 · `Brawl or Ranged-Heavy`×1 · `Athletics or Cool`×1 · `Knowledge-Warfare or Streetwise`×1 · `Mechanics or Survival`×1 · `Brawl or Resilience`×1 · `Mechanics or Resilience`×1 · `Knowledge-Core Worlds or Knowledge-Education`×1 · `Survival or Knowledge-Xenology`×1 · `Discipline or Resilience`×1 · `Medicine or Survival`×1 · `Cool or Negotiation`×1 · `Skulduggery or Streetwise`×1 · `Coercion or Leadership`×1 · `Melee or Resilience`×1 · `Deception or Knowledge-Underworld`×1 · `Cultures`×1 · `Knowledge-Lore or Knowledge-Underworld`×1 · `Coercion or Medicine`×1 · `Skulduggery or Stealth`×1 · `Charm or Coercion`×1 · `Charm or Coordination`×1 · `Mechanics or Perception`×1 · `Brawl or Perception`×1 · `Melee or Ranged-Light`×1 · `Melee or Survival`×1 · `Variable Forms`×1 · `Knowledge-Education or Medicine`×1 · `Brawl or Mechanics`×1 · `Piloting-Planetary or Vigilance`×1 · `Astrogation or Computers`×1 · `Knowledge-Lore or Survival`×1 · `Mechanics or Piloting-Planetary`×1

## Findings

- UNMEASURED: the species `force_rating > 0` clause of the Force-access rule has no carrier in the registry
