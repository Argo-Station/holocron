/**
 * journal.js — F-8 THE JOURNAL. The pure transforms behind `sheet.journal`.
 *
 * Jason's whole ask: *"we have a journal in the character sheet, would just like to be able to save
 * multiple over time."* Ruled in `Docs/rulings/reddit-cluster-f7-f8-f9s3.md` §3 as option (a):
 *
 *     sheet.journal = [ { id, at, text } ]        // NEW FIELD. `sheet.notes` IS UNTOUCHED.
 *
 * WHY A NEW FIELD AND NOT A MIGRATION. `sheet.notes` lives inside `sheetData` in
 * `swrpg_saved_characters` — one of the synced keys. Real people have text in it right now, on
 * more than one device, and in the production database. (b) "migrate the string into the first
 * entry" and (c) "stamp dated separators into the string" were both REFUSED: (b) spends migration
 * risk on a shape that has not proven itself, and (c) makes unparseable history that looks like a
 * feature while making the data worse. A separate field has NO path where a bug destroys text
 * somebody wrote at a table. The pad stays "what's happening now"; the journal is the saved history.
 *
 * THE ENTRY MODEL — RULED, not chosen here:
 *   · DATED, UNTITLED, APPEND-ONLY, NEWEST-FIRST. Titles are a field nobody fills at a table; the
 *     date and the first line are the identity.
 *   · DELETE YES, EDIT NO. A player must be able to remove something they regret writing — but a
 *     log whose past can be rewritten is a notes field with extra steps. So there is no `edit()`
 *     below, and there is no tombstone either: `remove()` is a real removal.
 *   · NO SESSIONS. The app does not know what a session is; that belongs to the campaign container
 *     (W-E1). If it ever gains meaning, an entry can grow an optional `sessionId` ADDITIVELY —
 *     which is why `normalize()` preserves unknown entry fields rather than re-emitting a fixed
 *     three-field record.
 *   · SAVE IS EXPLICIT. The pad's debounced write-through is right for the pad and wrong here: an
 *     append-only log must not accrete keystroke-debounced fragments. `append()` is called from a
 *     SAVE ENTRY action, never from an onChange.
 *
 * NO ENVELOPE, NO VERSION FIELD — deliberately, against this programme's usual R-NBB1 habit. The
 * ruled shape is a bare array, and this array is not a store: it is a FIELD inside the character
 * record, which already carries `swrpg_saved_characters`' own version. Adding a second version
 * counter inside a versioned record would be two authorities on one save. Forward compatibility is
 * bought instead by field preservation (above) — an entry written by a later build round-trips
 * through this reader with its unknown fields intact.
 *
 * MERGE (C-F8-2). Nothing here participates in sync directly. The journal rides inside
 * `characters[].sheetData`, so `syncMerge`'s EXISTING per-record policy for
 * `swrpg_saved_characters` governs it: no new key, no new class. Two devices that appended to the
 * SAME character present one record changed on both sides — recency (`updatedAt`) picks the newer
 * WHOLE record, or refuses and asks. Entries are NOT unioned across devices; that would be a new
 * merge class and was not ruled. Exercised for real in `test/journal_store.cjs`.
 *
 * NO STORAGE, NO DOM, NO NETWORK. Pure. Dual-export for `test/journal_store.cjs`.
 */
(function (root) {
  'use strict';

  // Fields v1 gives meaning to. Anything else on a stored entry is passed through untouched.
  var KNOWN_FIELDS = ['id', 'at', 'text'];

  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  // Uniqueness has to hold for two appends inside the same millisecond (a double-tap, a test loop),
  // so the id is time + a per-load counter + randomness rather than a bare timestamp.
  var _seq = 0;
  function newId() {
    _seq += 1;
    return 'j-' + Date.now().toString(36) + '-' + _seq.toString(36) + '-'
      + Math.random().toString(36).slice(2, 8);
  }

  function nowStamp() { return new Date().toISOString(); }

  // Sort key. An unparseable/absent `at` sorts OLDEST rather than being dropped — a bad date is not
  // a reason to hide somebody's writing.
  function atMs(entry) {
    var t = entry && entry.at;
    if (typeof t === 'number' && isFinite(t)) return t;
    if (typeof t !== 'string' || !t) return -Infinity;
    var n = Date.parse(t);
    return isNaN(n) ? -Infinity : n;
  }

  function isBlank(text) {
    return typeof text !== 'string' || text.trim() === '';
  }

  /**
   * normalize(raw) → [{ id, at, text, …unknown }]  newest-first, ids unique.
   *
   * Degrades to `[]` for absent / null / a string / an object / anything that is not an array —
   * the ABSENT-FIELD path (C-F8-1 ii) is the common one: every character that exists today has no
   * `journal` key at all.
   *
   * An entry is KEPT when it is an object carrying a non-empty string `id`. It is dropped when it
   * has no id, because an entry the UI cannot delete is junk a person can never get rid of. `text`
   * and `at` are coerced, never a reason to drop — the app itself always writes all three, so the
   * only way here is corruption or a hand-edited save.
   */
  function normalize(raw) {
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var e = raw[i];
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      var id = (typeof e.id === 'string' && e.id) ? e.id
             : (typeof e.id === 'number' && isFinite(e.id)) ? String(e.id) : '';
      if (!id) continue;
      if (seen[id]) continue;                 // a duplicated id makes delete ambiguous — keep first
      seen[id] = true;
      var copy = {};
      for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) copy[k] = e[k]; }
      copy.id = id;
      copy.text = typeof e.text === 'string' ? e.text : (e.text == null ? '' : String(e.text));
      copy.at = (typeof e.at === 'string' || typeof e.at === 'number') ? e.at : '';
      out.push(copy);
    }
    // NEWEST-FIRST. Sorting on read (not trusting stored order) is what makes the order survive a
    // whole-record merge, a hand edit, or any future writer.
    out.sort(function (a, b) {
      var d = atMs(b) - atMs(a);
      if (d) return d;
      return 0;                               // stable: equal stamps keep their written order
    });
    return out;
  }

  /**
   * append(list, text, opts?) → new list, the new entry FIRST.
   *
   * Refuses blank text (returns the normalized list unchanged) — SAVE ENTRY on an empty box must
   * not put a dated nothing in the log. Immutable: `list` is never mutated.
   * `opts.at` / `opts.id` exist so tests can be deterministic; the app passes neither.
   */
  function append(list, text, opts) {
    var current = normalize(list);
    if (isBlank(text)) return current;
    opts = opts || {};
    var entry = {
      id: opts.id || newId(),
      at: opts.at || nowStamp(),
      text: String(text).trim(),
    };
    return [entry].concat(current);
  }

  /** remove(list, id) → new list without that entry. A REAL removal, not a hidden tombstone. */
  function remove(list, id) {
    var current = normalize(list);
    if (!id) return current;
    return current.filter(function (e) { return e.id !== String(id); });
  }

  function count(list) { return normalize(list).length; }

  /**
   * formatDate(at) → '5 AUG 2026', or '' when there is no usable date.
   * Plain and gamey (mechanics voice): a date, not "a memory from the fifth of August".
   * Built from Date parts rather than toLocaleDateString so the app reads the same everywhere.
   */
  function formatDate(at) {
    var ms = atMs({ at: at });
    if (ms === -Infinity) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  var api = {
    KNOWN_FIELDS: KNOWN_FIELDS,
    newId: newId,
    nowStamp: nowStamp,
    isBlank: isBlank,
    normalize: normalize,
    append: append,
    remove: remove,
    count: count,
    formatDate: formatDate,
  };

  if (typeof root !== 'undefined' && root) root.SWRPGJournal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
