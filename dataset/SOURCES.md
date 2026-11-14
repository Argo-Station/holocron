# Dataset sources

The data in `public/data/` and `schema/` comes from these sources. The project's own data and writing are CC BY 4.0
(`LICENSE` in this folder). Each third-party source keeps its own terms and is credited here. Where a source has no
recorded licence or permission, this page says so. To credit the dataset: "Project Holocron by Aroo'Meh,
https://github.com/Argo-Station/holocron, CC BY 4.0." Third-party sources are credited as this page lists them.

| source | what it gave | credit | permission on record |
|---|---|---|---|
| OggDude's Star Wars character generator dataset | record ids and structure for weapons, gear, armor, attachments, talents, careers, specializations, Force powers, signature abilities, vehicles, motivations and crafting | OggDude and the dataset's contributors | none recorded; community use is informal |
| stoogoff/sw-adversaries | adversary stat blocks (`npcs.json`) | stoogoff (github.com/stoogoff/sw-adversaries) | none recorded |
| The Complete Species Guide (community, v7) | species text and stats for 408 species | Yaccarus, with mrdollar11 and thedearth2 | permission granted for the art (not shipped here); none recorded for the text |
| The Old Republic: An Era Sourcebook (community, v0.8) | five species, talents and related data | BluSunrize | permission granted for the art (not shipped here); none recorded for the text |
| The reSpecialized Project | the optional reSpecialized rule packs in `public/data/mods/respecialized/` | Zrob and the reSpecialized contributors | none recorded beyond its own credit line |
| Unofficial Species Menagerie | about 27 species records | author unrecorded | none recorded |
| Septaris | the vehicle-library images, since retired (no Septaris material is in this repository) | Septaris | n/a |

Rulebook text from Fantasy Flight Games' books is not included. Where a record cites a book and page, that is a
pointer to the book you own.

Not included because no author can be credited: twelve community NPC compilations (410 adversaries), and the
galaxy map's planet coordinates.

## Releases

A dataset release packs `public/data/` and `schema/` into a versioned archive attached to a GitHub Release.
Each one is made by `.github/workflows/dataset-release.yml` when a tag `dataset-v<version>` is pushed, where the
version is `package.json`'s. It runs `git archive --format=zip --prefix=holocron-dataset-<version>/ <commit> --
public/data schema dataset` twice, checks the two digests match, and attaches the zip and its `SHA256SUMS`.
