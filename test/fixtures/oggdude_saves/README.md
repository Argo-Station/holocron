# OggDude character saves — the project's import fixtures

**Plain summary (for Jason):** these are the four character files you sent, stored permanently so
every future piece of import work can be tested against real saves instead of guesses. They are
byte-for-byte what you supplied — nothing edited, nothing stripped.

**Why they are kept (R-OGG-17, ruling `oggdude-capability-map`):** *"It is the only artifact
exercising companions, rewards, schematics, fortification-crafting, custom vehicles and rigging
together… Losing it would cost more than any single doc here."* A catalogue census cannot see those
capabilities — they exist **only on a character** — so without these files the character side of the
capability map is unmeasurable.

## Provenance

| | |
|---|---|
| source | Jason, supplied 2026-08-13 in session |
| edits | **NONE** — verified byte-identical to the supplied files on copy |
| characters | fictional; the repeated description fields (male, 37, 5'10", brown/brown) were confirmed by Jason as a made-up character description, not personal data |
| labels | A/B/C/D match the letters used in ruling `oggdude-capability-map` §7a |

## What each one evidences

| file | bytes | why it matters |
|---|---|---|
| `A_ArooMeh_Human_Smuggler.xml` | 39,845 | the **baseline** — a plain character. 110 distinct element names against B's 172, so it is the control that shows which blocks are optional rather than universal |
| `B_AruNeh_Human_Smuggler.xml` | 298,899 | the **capability probe** — companions (`NPCs`), rewards, crafting schematics, the Trench fortification, a custom vehicle and rigging, together on one sheet |
| `C_N4567_Droid_Diplomat.xml` | 300,171 | first **droid**; first **`Duties`** (the AoR track, mutually exclusive with `Obligations`); and the **item-attachment system on a real character** (`ASCENGUN` on a `BLASTHOLDTT24`) |
| `D_N4567_Droid_Explorer.xml` | 303,558 | the same droid re-specced. First save with **`Gear` and `Armor` populated** — empty in all three others |
| `F_Jihn_Human_Sentinel_advanced.xml` | 102,903 | the **same character advanced** (655 XP used) — closes `SigAbilities` and opens three more systems: signature-ability trees (`CharSigAbilityNode` with Row/Col/**Span**), full **Morality** (`MoralityPairs`, `StrengthKey`/`WeaknessKey`, `ModifiedMorality`), and `CharKeyOverride` on a skill. Resolves at 93% — the 16-reference shortfall against E is the REAL signature-ability gap (we hold 0 of 38 abilities and 0 of 275 nodes), not a probe defect |
| `E_Jihn_Human_Sentinel.xml` | 100,935 | the **Force** character, and the one that closed the last gap: 7 purchased upgrades in the Alter power, mapping **7/7 by (Row, Col) AND 7/7 by cost** onto our tree. First Force-and-Destiny career (Sentinel), first non-droid/non-smuggler build. Resolves at **97%**, the highest of the five |

## What they still do NOT evidence

**Nothing. All 39 blocks are now evidenced** — `SigAbilities` was the last, closed by F.

**But that is NOT a completeness claim, and R-OGG-19 is why.** Six saves span three careers, two
species, one re-spec and one advancement — they do NOT span every axis the format has. F alone added
**17** new element names after E added 5, so the vocabulary was still growing at the sixth sample
(190 → **207**). "Every block seen" is a statement about blocks; it says nothing about the fields
inside them. Any future claim that the character surface is covered names the axis it varies along
and shows the sample spans it.

## THE SATURATION CLAIM WAS AN ARTIFACT OF THE SAMPLE — corrected here

Saves A–D held the element-name union at **185** across C and D, and that flat line was read as the
character-side vocabulary being near-covered. **Save E moved it to 190.** The five new names are
exactly the Force-power tree: `CharForcePower`, `ForceAbilities`, `CharForceAbility`, `Cost`, `Span`.

The vocabulary had not saturated; it had saturated *within a subset of four characters who all
happened to lack Force powers*. **A flat union across similar characters measures the similarity,
not the format** — which is R-OGG-12's own point ("name your sample") arriving from a direction
nobody had aimed at. Any future saturation claim states what KINDS of character the sample spans,
not just how many. **F then made the point twice:** it added 17 more names — signature abilities,
the full Morality track, characteristic overrides and bonus/option wrappers — none of which four
droids and a smuggler could have shown.

## Who reads them

- `scripts/canonical/oggdude_character_census.py` — the 39-block census and the element-name union
- `scripts/canonical/oggdude_capability_evidence.py` — the descriptor classification and both worked
  traces (attached weapon → final damage; `CharSchematic` → `CustomVehicle`)
- `Docs/OGGDUDE_CAPABILITY_MAP.md` — regenerated from both, and cites these paths

These are **read-only fixtures**. Nothing in the app loads them; no ingest runs against them
(R-OGG-13). If a future lap needs a modified variant, it copies rather than edits — an edited
fixture silently invalidates every measurement already published from it.

## CONSTRUCTED saves (not supplied by Jason — never copied into `data-sources/ogg-saves/`, C-OGG2B-6)

| file | source | the one edit | why |
|---|---|---|---|
| `H_SYNTH_left_out.xml` | `B_AruNeh_Human_Smuggler.xml`, byte copy | `<Rigger><WeaponIndex>` `-1` → `0` (298,898 bytes, one byte shorter) | a RAW-reachable value the import leaves LEFT IN THE FILE (D-273, `rigger_weapon`, B-1520) with no code change. Since `release-r6-companions-npcs` D1 no attested save leaves anything, so `smoke_ogg_import`'s B-1409 head legs draw on this file (ruling `release-r5-f1` ADDENDUM 1, C3) |
