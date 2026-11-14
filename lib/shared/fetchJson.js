/**
 * fetchJson.js — `qbFetchJson`, the apps' one JSON fetch (R-S4PP-3; ruling `shipyard-s4-ship-pool-path`).
 *
 * Moved VERBATIM from player/index.html @ 766f215c (proved by scripts/check_sheet_pool_verbatim.cjs), because the
 * two loaders that moved to lib/shared call it by name: `loadCanonicalCharacterBuild` (sheetPool.js) and the
 * species portrait index (portraits.js). A CLASSIC top-level declaration on purpose: it stays the page global
 * every existing caller already uses.
 *
 * HOSTS. player — NOT deferred, in <head> before the inline script, which calls it while the page parses (the
 * species wash index). gm — injected with the Yard's character core only when the Yard mounts under K9.
 */
// ── BEGIN VERBATIM (player/index.html @ 766f215c) ──
function qbFetchJson(path) {
  return fetch(path).then(function(r) {
    if (!r.ok) throw new Error('Failed to load ' + path + ': ' + r.statusText);
    return r.json();
  });
}
// ── END VERBATIM ──

// B-139 (ruling release-r7-bug-burndown ADDENDUM 433 (d)) — ONE FETCH PER URL PER LOAD. At boot two loaders asked for the
// same canonical files — sheetPool.js `loadCanonicalCharacterBuild` (here) and the homebrew editor's `loadBooks`, which the
// landing's Homebrew tile asks for at mount — so species, careers, specializations, talents and force_powers each crossed
// the network twice. qbFetchJson now keeps ONE read per URL (resolved against the page's base, so 'public/…' and
// '/public/…' are one URL) through the verbatim function above, and hands every caller its OWN copy of the pristine
// result: callers mutate what they receive (the roll-options filter, the user-data base hand-off). A failed read is
// forgotten, so the next ask retries. This is the one cache; no loader keeps a second beside it.
(function () {
  var read = qbFetchJson, reads = {};
  var copy = typeof structuredClone === 'function' ? structuredClone : function (v) { return JSON.parse(JSON.stringify(v)); };
  qbFetchJson = function (path) {
    var key; try { key = new URL(path, document.baseURI).href; } catch (e) { key = String(path); }
    if (!reads[key]) reads[key] = read(path).catch(function (e) { delete reads[key]; throw e; });
    return reads[key].then(copy);
  };
})();
