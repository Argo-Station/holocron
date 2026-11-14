# 0008. Remove the encounter system; pivot to the NPC bench ("paper that remembers")

- **Date:** 2026-06-19
- **Status:** accepted

## Context
The repo carried a large GM-side combat apparatus — the Encounter Forge, a 16-screen Combat wizard
(Personal/Vehicle/Mass), the EncounterBoard live-play surface, a procedural encounter generator — plus
a player-side EncounterRoom and a "Combat Mode" reflow of the character sheet, joined by a LAN-only
`/api/encounter` transport. Months of work had gone into building and polishing this.

Jason applied first-principles thinking to **what a GM actually does at the table**, not what each module
was "for." A GM does not interact with a phone for an entire encounter — rules, stat references, and talent
descriptions come off a GM screen and books, across multiple surfaces. Paper is static; an encounter is pure
change (wounds, strain, conditions, minions falling). The only thing a screen can offer over paper mid-fight
is to **hold the part that moves**. A generator/wizard/board *adds* operation the GM must drive; that is the
opposite of useful at the table.

Two facts hardened the call. (1) RAW: adversaries are pre-built stat blocks (Minion/Rival/Nemesis) the GM
**picks and uses as-is**, come pre-equipped ("bonuses already added to the profile"); the system explicitly
disclaims PC-style building for adversaries — EotE CRB p.399-400, AoR CRB p.411. So a "builder" has no
rules-default basis. (2) The player encounter room's GM→player sync ran over a local `serve.py` (`lanFetch`)
absent from the Cloudflare deploy — it was non-functional in production already.

## Decision
**Remove the entire encounter system from both apps** and redirect the product to a **stateful NPC bench** —
"a glanceable, stateful NPC sheet (paper that remembers the fight), surfaced as a group you flip through."
The static reference stays at least as clean as a good stat block; the only thing the screen *adds* is memory
of what changed. The governing test for every future feature: **does it REMOVE bookkeeping the GM would
otherwise carry, or ADD a thing to operate? Keep only the first.** Combat Mode was removed entirely (vestigial
without an encounter), per Jason's principle-first call.

Removal shipped 2026-06-19 (commercial `21954ba`): ~16.8k lines / 18 files, both apps, prod-verified.

## Alternatives considered
- **Keep building the Combat wizard (Phases C/D/E).** Rejected — it was the most-operation, least-table-useful
  surface; sunk cost is not a reason to ship against the principle. (Supersedes the combat-wizard roadmap.)
- **Keep Combat Mode as a local sheet toggle** (sever only the JOIN wiring). Rejected by Jason — vestigial with
  no encounter to join; principle-first means delete it.
- **Keep the EncounterBoard as a live tracker** (the part that "remembers"). Rejected as a *surface* — the live
  state-tracking belongs on the NPC pages/groups, not a separate combat board. The board's tracking *ideas*
  (wounds/strain/conditions) inform the bench; the board itself does not.
- **A new "NPC builder."** Rejected on RAW — adversaries are picked, not built. The app is a picker/library +
  live tracker; reskin/customize is at most a one-field edit, never a wizard.

## Consequences
- The app is now a focused GM/player tool: NPC library, party overview, universe map, session store (shops),
  ship yard, character workshop, character creator + sheet. No combat console.
- **Do not rebuild the generator/wizard/board.** Future combat-tracking lives in the NPC bench. The
  superseded specs (ENCOUNTER_WIZARD_SPEC, ENCOUNTER_BOARD_*, MINIMAL_COMBAT_SURFACE_SPEC) were deleted; the
  combat-wizard / minimal-combat-surface memories are flagged superseded.
- Next build is the NPC bench: GM-authored groups (name/arrange/surface/flip) + per-group/per-character notes.
  It composes existing working pieces (NPC cards already track wounds/strain/disposition; the reference rail
  already flips between characters). Open scoping questions remain (group state persistence; minion pooled vs
  per-instance; player side's role) — to be settled at bench-scoping time, not here.
- Loose ends (non-blocking, R-ENCRM-fin-3): trim serve.py's now-dead encounter endpoints
  (`/api/encounter`, `/api/destiny`, `/encounter/{damage,slot-acted}`; keep `/api/party`) and light doc
  hygiene. Pre-existing NAVIGATION anchor drift (from the inline→app.jsx refactor) is a separate doc lap.
