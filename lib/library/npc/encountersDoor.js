/* lib/library/npc/encountersDoor.js — THE ENCOUNTERS DOOR'S SWITCH (window.SWRPGEncountersDoor).
 *
 * Ruling `encounters-e3-screens` R-E3S-1 (the key vocabulary, on paper first, R-Y2-1), on `lib/editor/switch.js`'s
 * pattern. One localStorage key, read by the GM host only (gm/index.html loads this file; player/ never does).
 *
 * THE SWITCH. `swrpg_encounters_door`: the string '0' is OFF; anything else, or no key, is ON (an existing '1' stays ON;
 * a storage error reads ON). DEFAULT ON since the flip (ruling `encounters-e3-flip` CONTRACT 1, D-514). There is
 * no URL toggle; the smokes set the key by an init script. A preview lever, not save data: nothing in the bench or the
 * table store reads it, and no op writes it.
 *   OFF — today's app: four plates (plus HOMEBREW while its switch is on), the library's ENCOUNTERS tab, and
 *         /gm/npc/encounters[/<id>]. A cold load of /gm/encounters[/<id>] is replaced by /gm/npc/encounters[/<id>].
 *   ON  — the fifth plate, /gm/encounters[/<id>] (shape `encounters-e2-manager-shape` §4.5, §8), the library's strip
 *         BROWSE · CUSTOM NPC · RECENT, and /gm/npc/encounters[/<id>] replaced by /gm/encounters[/<id>].
 * THE FLIP (D-514 b3, Jason's "switch it on") made the default ON in `on()` below: one line, on a branch held unmerged
 * until his word. The switch and today's board code retire in a deletion lap after the flip, not here.
 *
 * `redirect(path)` is the ONE answer to "does this GM path belong to the other state": the replaced path, or null.
 * Pure over `on()`; the host calls it at cold load and on popstate and replaces the URL with what it answers.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_encounters_door';

  function on() {
    try { return !(root.localStorage && root.localStorage.getItem(KEY) === '0'); } catch (e) { return true; }
  }

  function redirect(path) {
    var p = String(path || '').replace(/\/+$/, '');
    var m;
    if (on()) {
      m = /^\/gm\/npc\/encounters(\/[^/]+)?(?:\/.*)?$/.exec(p);
      return m ? '/gm/encounters' + (m[1] || '') : null;
    }
    m = /^\/gm\/encounters(\/[^/]+)?(?:\/.*)?$/.exec(p);
    return m ? '/gm/npc/encounters' + (m[1] || '') : null;
  }

  var api = { KEY: KEY, on: on, redirect: redirect };
  if (typeof root !== 'undefined' && root) root.SWRPGEncountersDoor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
