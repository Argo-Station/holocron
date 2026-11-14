/**
 * portraits.js — a character's species portrait: ONE lookup both apps load (R-S4CO-7; ruling
 * `shipyard-s4-collection` ADDENDUM 3, and `shipyard-s4-ship-pool-path` R-S4PP-4 for the flag).
 *
 * `speciesImgPath(recOrName)` resolves a species to its portrait file or null, from the manifest of what is on
 * disk (never a guess); `charPortrait(char)` is the character-record adapter both hosts hand the Ship Yard as
 * `portraitFor`. A null draws the fallback the face owns (the Yard's ink initial, D-S4C5 B).
 *
 * Moved VERBATIM from player/index.html @ 766f215c (proved by scripts/check_sheet_pool_verbatim.cjs): the
 * suppression list, the manifest index and its loader, the stem rule and the resolver. CLASSIC top-level
 * declarations on purpose — they stay the page globals the player's callers use.
 *
 * FREE NAMES: `qbFetchJson` (lib/shared/fetchJson.js), read at LOAD (the manifest fetch starts here), and
 * `COMMERCIAL_MODE`, read at CALL time, which each host's index.html defines; test/commercial_mode_parity.cjs
 * pins the two literals equal (R-S4PP-4).
 *
 * HOSTS. player — DEFERRED, before app.js (R-S4PP-7: fetchJson.js is the one undeferred module of the three), so the
 * manifest fetch starts beside the build's own fetches; the boot still waits on the index, through sheetPool.js's join
 * (`speciesPortraitIndexReady` in loadCanonicalCharacterBuild's Promise.all), so no species flashes a placeholder.
 * gm — injected with the Yard's character core only when the Yard mounts under K9.
 */
// ── BEGIN VERBATIM (player/index.html @ 766f215c) ──
// REMOVED PORTRAITS — the suppression list. A name here renders the Monogram no matter what is on
// disk, so a portrait can be withdrawn in one place without hunting call sites.
//
// IT IS EMPTY, AND THAT IS A DECISION, NOT AN OVERSIGHT. It held `Hutt` and `Human`: both were
// proven — perceptual hash PLUS a side-by-side read — to be the printed illustrations from The Long
// Arm of the Hutt p.46 and Under a Black Sun p.15, and both were deleted on 2026-07-23 under the
// fan-posture hard line. The Complete Species Guide carries the same two illustrations, the C-ART-1
// screen caught them again on 2026-08-11 (12/256 and 20/256), and **Jason overrode the refusal in
// terms** — so they ship. The finding was never withdrawn; the decision about it changed.
//
// Docs/ART_PROVENANCE_LEDGER.md §2A records the override, what he was told before making it, and
// every fence opened to honour it. `test/art_ledger_wall.cjs` binds the two files to that record:
// serving them without it fails the build, and so does deleting it while they are served.
// The mechanism stays here for the next withdrawal.
var SPECIES_PORTRAITS_REMOVED = {};

// THE PORTRAIT INDEX — what is actually on disk, fetched once at boot.
//
// This function used to BUILD a path and return it unchecked, so a species with no file still got a
// truthy value back. Every caller reads that as "there is a portrait": the list row set it as a CSS
// background and skipped the Monogram, so ~190 of 304 species rendered an EMPTY GREY TILE rather
// than the designed placeholder. With the Complete Species Guide switched on the catalogue opens on
// a screenful of them, alphabetically — Abednedo, Abyssin, Adarian — which is exactly the "the
// species selector doesn't have any images" report.
//
// Ordering is by construction, not by luck: `loadCanonicalCharacterBuild` waits on this promise, and
// the species browser cannot render before that resolves. The promise NEVER rejects — a failed
// manifest leaves an empty index, so every species falls to the Monogram. Failing closed is right:
// the placeholder is a designed surface and a broken tile is not.
var SPECIES_PORTRAIT_DIR = 'public/SWDataSet-Master/species_portraits/';
var SPECIES_PORTRAIT_INDEX = null;
var SPECIES_PORTRAIT_BY_ID = null;   // C-ART-6: id -> filename, the rename-proof binding
var speciesPortraitIndexReady = qbFetchJson(SPECIES_PORTRAIT_DIR + 'manifest.json')
  .then(function(m) {
    SPECIES_PORTRAIT_INDEX = {};
    (m.files || []).forEach(function(f) { SPECIES_PORTRAIT_INDEX[f] = 1; });
    SPECIES_PORTRAIT_BY_ID = m.by_id || {};   // absent on a v1 manifest — the name path still works
    return SPECIES_PORTRAIT_INDEX;
  })
  .catch(function(err) {
    console.warn('[portraits] manifest load failed — every species falls to the Monogram:', err);
    SPECIES_PORTRAIT_INDEX = {};
    SPECIES_PORTRAIT_BY_ID = {};
    return SPECIES_PORTRAIT_INDEX;
  });

// BOTH apostrophes are stripped. `sources.js:dedupeName` already treats the typographic ’ and the
// ASCII ' as the same character when it decides that `Twi'lek` (ours) and `Twi’lek` (the guide's)
// are one species — so the two spellings must resolve to one FILE too, or whichever spelling the
// dedupe happens to surface decides whether the player sees art. Stripping only ' was the reason
// `Twi’lek` and `Pau’an` looked portrait-less while `Twilek.webp` sat on disk.
function speciesPortraitStem(name) {
  return String(name || '').replace(/\s+/g, '_').replace(/['’]/g, '');
}

// C-ART-6 — RESOLUTION KEYS OFF THE ID, NOT THE RENDERED NAME.
// This took a NAME and built a filename from it, so renaming a species silently detached its
// portrait. Not hypothetical: the v7 import expanded `Kowakian` to `Kowakian monkey-lizard` and
// `Terrelian Jango` to `Terrelian Jango Jumper`, and both have working art on the live site that
// stopped resolving the instant the name moved. An id is the save contract and never changes
// (charter §8); a name is a display field and is allowed to.
//
// ACCEPTS EITHER a record or a bare name, deliberately. Passing the record takes the id path;
// passing a string behaves exactly as before, so every caller not yet updated — and any caller
// that only ever has a name — keeps working unchanged. The name path is not removed but demoted
// to a FALLBACK, which is what lets this land without re-verifying all five call sites at once.
function speciesImgPath(recOrName) {
  if (COMMERCIAL_MODE) return null;
  var rec = (recOrName && typeof recOrName === 'object') ? recOrName : null;
  var name = rec ? rec.name : recOrName;
  if (rec && rec.id && SPECIES_PORTRAIT_BY_ID && SPECIES_PORTRAIT_BY_ID[rec.id]) {
    var byId = SPECIES_PORTRAIT_BY_ID[rec.id];
    if (!SPECIES_PORTRAITS_REMOVED[byId.replace(/\.webp$/, '')]) return SPECIES_PORTRAIT_DIR + byId;
  }
  var stem = speciesPortraitStem(name), f = stem + '.webp';
  if (SPECIES_PORTRAITS_REMOVED[stem]) return null;
  if (!SPECIES_PORTRAIT_INDEX) return null;                    // not booted yet — Monogram, not a guess
  if (SPECIES_PORTRAIT_INDEX[f]) return SPECIES_PORTRAIT_DIR + f;
  // A source-qualified name inherits its base species' portrait: `Ewok (Unofficial Species
  // Menagerie)` is an Ewok, and the suffix exists to disambiguate two RECORDS, not two creatures.
  // Only the parenthetical is dropped, so this can never reach across to a different species.
  var base = speciesPortraitStem(String(name || '').replace(/\s*\([^)]*\)\s*$/, '')) + '.webp';
  if (base !== f && SPECIES_PORTRAIT_INDEX[base]) return SPECIES_PORTRAIT_DIR + base;
  return null;
}
// ── END VERBATIM ──

// The character-record adapter (was the player host's inline `portraitFor`, player/app.jsx PlayerYardS4): a saved
// character's species, through the one resolver; any throw reads as "no portrait".
function charPortrait(c) { var sd = (c && c.sheetData) || {}; try { return speciesImgPath(sd.species || (c && c.species)); } catch (e) { return null; } }

window.SWRPGPortraits = { speciesImgPath: speciesImgPath, charPortrait: charPortrait, ready: speciesPortraitIndexReady };
