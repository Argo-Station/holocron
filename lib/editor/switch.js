/* lib/editor/switch.js — THE HOMEBREW EDITOR'S SWITCH AND ROUTE GRAMMAR (window.SWRPGEditor).
 *
 * Ruling `f100-items-editor-contracts` R-FIEC-5 (the key, the flag, the reader; the route table) and
 * §5 step C2. Loaded by BOTH shells, always (C-4.4 Q2), before each app's bundle.
 *
 * THE SWITCH. One key, `swrpg_homebrew_editor`, read by both apps (one origin, one localStorage).
 * `?homebrew=1` / `?homebrew=0` is persisted HERE, at script load, before the SPA drops the query —
 * the mechanism the paper revision's rollback levers used (retired, B-1688). ON BY DEFAULT since the
 * paper revision's one-pass flip (R-PRS-8 step 4, HANDOFF `f100-editor-switch-on`, R-FILG-A1-2): the
 * string '0' is OFF and anything else, a missing key included, is ON. The key is KEPT as the explicit
 * OFF override (the rollback lever until N-post). It is a preview lever, not save data (R-CFP-2), and
 * it was never one of those levers: the editor's flip was Jason's own call
 * (R-FIEC-5), taken with the paper pass.
 * OFF means no route, no door and no storage write: `parse()` still answers (it is pure), but every
 * app-side reader goes through `screenFor()`, which answers null while the switch is off.
 *
 * THE ROUTES (identical under /player and /gm; a shelf is weapons, armor, gear, talents, specializations, species, force_powers or careers — M5,
 * ruling f100-m5-contracts U6/U13; M9, ruling f100-m9-build-card step 8; `specializations` and `species` have no /new, a
 * new specialization or species is always a copy, STOP-9 / R-M9S (F6 "new, from Human"); M10: `force_powers` has no /new either, R-M10E-2;
 * M12: nor `careers`, R-M12B-9 F1):
 *   /…/homebrew                           HOME             ….HOMEBREW
 *   /…/homebrew/collections               MY COLLECTIONS   ….HOMEBREW.COLLECTIONS
 *   /…/homebrew/<shelf>                   the shelf        ….HOMEBREW.SHELF
 *   /…/homebrew/<shelf>/<bookId>          a book record    ….HOMEBREW.RECORD  (the intent is on the form, R-FIEC-6)
 *   /…/homebrew/<shelf>/new               a blank draft    ….HOMEBREW.DRAFT
 *   /…/homebrew/<shelf>/in/<packId>/<id>  a pack record    ….HOMEBREW.RECORD
 *   /…/homebrew/<shelf>/in/<packId>~<instance>/<id>   the same, when an OWN packId is held more than once
 *                                         (f100-sync-instance-index R-SII-10; `~` is not in a packId, ^[a-z0-9_]+$)
 * M12 (f100-m12-build-card R-M12B-102): `signature_abilities` is a SHELF-LESS kind — the record form's grammar without a shelf:
 *   /…/homebrew/signature_abilities/<id>, /…/signature_abilities/in/<packId>[~<instance>]/<id>, /…/signature_abilities/new
 *   (its draft holds its career; the view sends a reload with no held draft to the Careers shelf). No rail entry; the bare
 *   /…/signature_abilities, and any level that is not a record or a draft, resolves to HOME, replaced (R-FIE-2).
 * `new`, `in` and `collections` are reserved segments. A shelf that does not open resolves to HOME with the URL
 * replaced (R-FIE-2); so does an unknown shelf. Since M9 every SHELVES kind opens (INERT_SHELVES is empty). Any segment
 * past a route's own is dropped to the nearest level, also replaced. Whether an id or a pack EXISTS
 * is the view's question (it holds the data); it falls back the same way, by `replaceState`. resolveIn(route, rows) is
 * the one answer to "which collection does this /in/ route name": an OLD link (no ~) lands on home for my_data, else
 * on the first own row of that packId in order, and the route it returns is the canonical one the view replaces to
 * (R-SII-10: never a dead end). inFor(row, rows) is the one builder of a link's packId/instance pair.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_homebrew_editor';
  var ITEM_SHELVES = ['weapons', 'armor', 'gear'];
  var INERT_SHELVES = [];
  // the shelves that OPEN (M5 lifts SOON off talents and specializations, U6; M9 off species, f100-m9-build-card step 8);
  // ITEM_SHELVES stays the three item kinds
  // M10: force_powers opens (f100-m10-editor-card R-M10E-2); M12: careers, the eighth, last (f100-m12-build-card R-M12B-9 F1)
  var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'force_powers', 'careers']);
  // STOP-9: a new specialization is always a copy — /specializations/new is its shelf; M9: so is a new species ("new, from Human");
  // M10 (D-141 K1, D-142): so is a new Force power ("A new Force power, from Move"); M12 (F1, D-157): so is a new career
  // ("A new career always starts as a copy")
  var NO_BLANK = ['specializations', 'species', 'force_powers', 'careers'];
  // M12 (R-M12B-102): kinds with a record form and no shelf — never in OPEN_SHELVES, so no rail entry and no shelf level
  var SHELFLESS = ['signature_abilities'];
  var RESERVED = ['new', 'in', 'collections'];
  var HOSTS = { player: '/player', gm: '/gm' };

  (function persistFlag() {
    try {
      var m = /[?&]homebrew=([01])\b/.exec(root.location && root.location.search || '');
      if (m && root.localStorage) root.localStorage.setItem(KEY, m[1]);
    } catch (e) {}
  })();

  function on() {
    try { return !(root.localStorage && root.localStorage.getItem(KEY) === '0'); } catch (e) { return true; }
  }

  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function enc(s) { return encodeURIComponent(String(s)); }

  // parse(path) → null when the path is not under /player/homebrew or /gm/homebrew; otherwise
  // { host, view, shelf?, id?, packId?, canonical } where `canonical` is the path this route owns
  // (differs from the input when a level was dropped — the caller replaces the URL with it).
  function parse(path) {
    var p = String(path || '').replace(/\/+$/, '');
    var m = /^\/(player|gm)\/homebrew(?:\/(.*))?$/.exec(p);
    if (!m) return null;
    var host = m[1];
    var seg = (m[2] || '').split('/').filter(Boolean).map(dec);
    var r;
    if (!seg.length) r = { host: host, view: 'home' };
    else if (seg[0] === 'collections') r = { host: host, view: 'collections' };
    else if (SHELFLESS.indexOf(seg[0]) !== -1) {
      var kind = seg[0];
      if (seg[1] === 'new') r = { host: host, view: 'draft', shelf: kind };
      else if (seg[1] === 'in' && seg.length >= 4) {
        var ki = splitIn(seg[2]);
        r = { host: host, view: 'record', shelf: kind, packId: ki.packId, id: seg[3] };
        if (ki.instance) r.instance = ki.instance;
      } else if (seg.length >= 2 && RESERVED.indexOf(seg[1]) === -1) r = { host: host, view: 'record', shelf: kind, id: seg[1] };
      else r = { host: host, view: 'home' };
    }
    else if (OPEN_SHELVES.indexOf(seg[0]) === -1) r = { host: host, view: 'home' };
    else {
      var shelf = seg[0];
      if (seg.length === 1) r = { host: host, view: 'shelf', shelf: shelf };
      else if (seg[1] === 'new') r = NO_BLANK.indexOf(shelf) === -1 ? { host: host, view: 'draft', shelf: shelf } : { host: host, view: 'shelf', shelf: shelf };
      else if (seg[1] === 'in') {
        if (seg.length >= 4) {
          var pi = splitIn(seg[2]);
          r = { host: host, view: 'record', shelf: shelf, packId: pi.packId, id: seg[3] };
          if (pi.instance) r.instance = pi.instance;
        } else r = { host: host, view: 'shelf', shelf: shelf };
      } else if (RESERVED.indexOf(seg[1]) === -1) r = { host: host, view: 'record', shelf: shelf, id: seg[1] };
      else r = { host: host, view: 'shelf', shelf: shelf };
    }
    r.canonical = pathFor(r);
    return r;
  }

  // `<packId>~<instance>` → { packId, instance? }; a tail that is not a 12-hex instance is dropped (the packId stands)
  var INSTANCE_RE = /^[0-9a-f]{12}$/;
  function splitIn(seg) {
    var i = String(seg).indexOf('~');
    if (i === -1) return { packId: seg };
    var inst = seg.slice(i + 1);
    return INSTANCE_RE.test(inst) ? { packId: seg.slice(0, i), instance: inst } : { packId: seg.slice(0, i) };
  }

  // pathFor(route) — the one builder; `route.host` defaults to 'player'.
  function pathFor(r) {
    var base = (HOSTS[r && r.host] || HOSTS.player) + '/homebrew';
    if (!r || r.view === 'home') return base;
    if (r.view === 'collections') return base + '/collections';
    var s = base + '/' + r.shelf;
    if (r.view === 'shelf') return SHELFLESS.indexOf(r.shelf) !== -1 ? base : s;
    if (r.view === 'draft') return s + '/new';
    if (r.view === 'record') return r.packId ? s + '/in/' + enc(r.packId) + (r.instance ? '~' + r.instance : '') + '/' + enc(r.id) : s + '/' + enc(r.id);
    return base;
  }

  // rows: the store's list() rows ({ ck, packId, origin, home }). How many OWN rows carry this packId.
  function ownOf(rows, packId) { return (rows || []).filter(function (c) { return c && c.origin === 'own' && c.packId === packId; }); }
  // inFor(row, rows) → { packId, instance? } — a link to `row` names its instance only when its own packId repeats here
  function inFor(row, rows) {
    var out = { packId: row.packId };
    if (row.origin === 'own' && ownOf(rows, row.packId).length > 1 && /^own:/.test(row.ck || '')) out.instance = row.ck.slice(4);
    return out;
  }
  // resolveIn(route, rows) → { ck, route } | null. `rows` in the store's layer order. The route returned is CANONICAL:
  // the ~ form exactly when the packId is held more than once (R-SII-10), else the plain form.
  function resolveIn(route, rows) {
    if (!route || !route.packId) return null;
    var own = ownOf(rows, route.packId), row = null;
    if (route.instance) row = own.filter(function (c) { return c.ck === 'own:' + route.instance; })[0] || null;
    else {
      row = (route.packId === 'my_data' ? own.filter(function (c) { return c.home; })[0] : null) || own[0] || null;
      if (!row) row = (rows || []).filter(function (c) { return c && c.origin === 'imported' && c.packId === route.packId; })[0] || null;
    }
    if (!row) return null;
    var r = {}; Object.keys(route).forEach(function (k) { if (k !== 'instance' && k !== 'canonical') r[k] = route[k]; });
    var f = inFor(row, rows);
    if (f.instance) r.instance = f.instance;
    r.canonical = pathFor(r);
    return { ck: row.ck, route: r };
  }

  // The screen id a route shows (Docs/NAVIGATION.md rows).
  function screenId(r) {
    var p = (r && r.host === 'gm') ? 'GM' : 'PLAYER';
    var v = r && r.view;
    return p + '.HOMEBREW' + (v === 'collections' ? '.COLLECTIONS' : v === 'shelf' ? '.SHELF'
      : v === 'record' ? '.RECORD' : v === 'draft' ? '.DRAFT' : '');
  }

  // THE OFF WRAPPER: an app asks this, never parse(), so while the
  // switch is off every /homebrew path answers null and falls to today's unknown-path default.
  function screenFor(path) { return on() ? parse(path) : null; }

  root.SWRPGEditor = {
    KEY: KEY, ITEM_SHELVES: ITEM_SHELVES.slice(), INERT_SHELVES: INERT_SHELVES.slice(), OPEN_SHELVES: OPEN_SHELVES.slice(), NO_BLANK: NO_BLANK.slice(), SHELFLESS: SHELFLESS.slice(),
    on: on, parse: parse, pathFor: pathFor, screenId: screenId, screenFor: screenFor, resolveIn: resolveIn, inFor: inFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SWRPGEditor;
})(typeof window !== 'undefined' ? window : globalThis);
