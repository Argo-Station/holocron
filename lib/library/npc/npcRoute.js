/**
 * npcRoute.js — THE LIBRARY'S POSITION IN THE ADDRESS BAR (B-863, NPC 2/9).
 *
 * Ruling `npc-library-paper-concept` R-NPC-4 — a DURABLE CONTRACT (R-Y2-1; B-765's third statement),
 * built exactly as ruled. The position is a PROJECTION of the library's state onto the path, one
 * vocabulary on both hosts (`/gm/npc…` and `/player/npc…`); this module owns only the TAIL after
 * `/<host>/npc`, and the host owns the router (`navTo` / `parsePathToScreen` / popstate):
 *
 *   ''                                   BROWSE — the front
 *   'recent'                             RECENT
 *   'encounters'                         ENCOUNTERS — the list                  (canManageGroups only)
 *   'encounters/<groupId>'               the OPEN encounter                     (canManageGroups only)
 *   'custom'                             CUSTOM NPC — and EVERY creator view    (canManageCast only)
 *                                        (c-fork · c-fight · c-armory · c-talk · c-profile); form state
 *                                        is not in the URL, a reload lands on the tab
 *   'custom/<key>'                       a custom's page                        (canManageCast only)
 *   '<drawer>'                           the drill-down
 *   '<drawer>/<affiliation>'             the roster (or the dossier on a faction_record node)
 *   '<drawer>/<affiliation>/<npcId>'     the reference (a canon record)
 *
 *   · <drawer> = a landing entry's `tree_node_id` (16); <affiliation> = an `affiliations.vocab.json` id;
 *     <npcId> = the registry's LOWERCASE `id` — THE ONE PLACE the lowercase id is used: the record it
 *     resolves to supplies `_source_key` for every store read (R-NPC-3's trap, closed at the boundary);
 *     <groupId> = benchStore's `group.id`; <key> = the cast record's `key`. Every segment passes through
 *     encodeURIComponent. The three RESERVED first segments (recent · encounters · custom) are disjoint
 *     from the drawer ids — `test/npc_route_grammar.cjs` asserts it against the shipped layout.
 *   · A canon record's path is derivable from the RECORD ALONE — `affiliation_path[0]` is its drawer,
 *     `affiliation` its node — so a search hit, a RECENT open and a drill-down land on one URL.
 *   · COLD LOAD resolves segment by segment; the first unresolvable segment TRUNCATES to its nearest
 *     resolvable ancestor (the caller replaces the URL, silently): a deleted group → 'encounters'; a
 *     deleted custom → 'custom'; an unknown NPC → its affiliation's roster; an unknown node → its
 *     drawer; an unknown drawer → the front. A host without the capability REFUSES 'encounters…' and
 *     'custom…' → the front.
 *   · NOT in the URL, by ruling: tier filters, the CARD/LIST preference, search text, creator form
 *     state, the pane's selected member.
 *
 * Pure functions; no DOM, no history, no storage — the module NEVER touches `history` (the host
 * does). Dual-export (window.NpcRoute / CommonJS) so the node guard runs the grammar over all 1,430
 * records.
 */
(function (root) {
  'use strict';

  var RESERVED = ['recent', 'encounters', 'custom'];
  var CREATOR_VIEWS = ['c-fork', 'c-fight', 'c-armory', 'c-talk', 'c-profile'];

  function enc(s) { return encodeURIComponent(String(s)); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return null; } }

  // The tail, split and decoded. Empty segments (a trailing or doubled slash) are dropped.
  function parse(tail) {
    return String(tail || '').split('/').filter(function (x) { return x !== ''; }).map(dec);
  }

  function isCustom(rec) { return !!(rec && rec._provenance === 'custom'); }

  // THE CANON PATH OF A RECORD, from the record alone.
  function recordPath(rec) {
    if (!rec || isCustom(rec)) return null;
    var p = Array.isArray(rec.affiliation_path) ? rec.affiliation_path : [];
    var drawer = p[0] || rec.affiliation;
    var node = rec.affiliation || p[p.length - 1];
    if (!drawer || !node || !rec.id) return null;
    return enc(drawer) + '/' + enc(node) + '/' + enc(rec.id);
  }

  // STATE → TAIL. `st` = { view, drawerId, affiliationId, npc (the pool record), groupId }.
  function positionOf(st) {
    var v = st && st.view;
    if (!v || v === 'library-landing') return '';
    if (v === 'history') return 'recent';
    if (v === 'groups') return st.groupId ? 'encounters/' + enc(st.groupId) : 'encounters';
    if (v === 'cast' || CREATOR_VIEWS.indexOf(v) !== -1) return 'custom';
    if (v === 'library-drilldown') return st.drawerId ? enc(st.drawerId) : '';
    if (v === 'npc-list') {
      if (!st.affiliationId) return st.drawerId ? enc(st.drawerId) : '';
      return enc(st.drawerId || st.affiliationId) + '/' + enc(st.affiliationId);
    }
    if (v === 'reference') {
      var rec = st.npc;
      if (isCustom(rec)) return 'custom/' + enc(rec._source_key || rec.key);
      var p = recordPath(rec);
      if (p) return p;
      return st.affiliationId ? enc(st.drawerId || st.affiliationId) + '/' + enc(st.affiliationId) : '';
    }
    return '';
  }

  // TAIL → the TARGET STATE, truncated to the nearest resolvable ancestor. `ctx`:
  //   drawers        array of the 16 drawer ids (landing layout order)
  //   isAffiliation  fn(id) → bool          (an affiliations vocab id)
  //   isFlatDrawer   fn(id) → bool          (a drawer with no populated child: handleSelectDrawer's skip)
  //   npcById        fn(lowercaseId) → canon record | null
  //   hasGroup       fn(groupId) → bool
  //   customByKey    fn(key) → custom record | null
  //   canGroups, canCast  the host's two capabilities
  // Returns { view, drawerId, affiliationId, npc, groupId, position } — `position` is the canonical
  // tail of the resolved state (≠ the input when something truncated or normalized).
  function resolve(tail, ctx) {
    var seg = parse(tail);
    var out = { view: 'library-landing', drawerId: null, affiliationId: null, npc: null, groupId: null };
    function done() { out.position = positionOf(out); return out; }
    if (!seg.length || seg[0] === null) return done();
    var head = seg[0];
    if (head === 'recent') { out.view = 'history'; return done(); }
    if (head === 'encounters') {
      if (!ctx.canGroups) return done();                               // refused → the front
      out.view = 'groups';
      if (seg[1] != null && ctx.hasGroup(seg[1])) out.groupId = seg[1];  // a deleted group → the list
      return done();
    }
    if (head === 'custom') {
      if (!ctx.canCast) return done();                                 // refused → the front
      out.view = 'cast';
      var c = seg[1] != null ? ctx.customByKey(seg[1]) : null;          // a deleted custom → the tab
      if (c) { out.view = 'reference'; out.npc = c; }
      return done();
    }
    if (ctx.drawers.indexOf(head) === -1) return done();               // an unknown drawer → the front
    out.drawerId = head;
    if (seg[1] == null || !ctx.isAffiliation(seg[1])) {
      // the drill-down — or, for a FLAT drawer, its roster (handleSelectDrawer's own skip)
      if (ctx.isFlatDrawer(head)) { out.view = 'npc-list'; out.affiliationId = head; }
      else out.view = 'library-drilldown';
      return done();
    }
    out.affiliationId = seg[1];
    out.view = 'npc-list';
    var rec = seg[2] != null ? ctx.npcById(seg[2]) : null;             // an unknown NPC → the roster
    if (rec) {
      out.view = 'reference';
      out.npc = rec;
      // The record's own path is canonical: a hand-typed path to the right id under the wrong node
      // NORMALIZES to it (the caller replaces the URL), so every route to one NPC is one URL.
      var p = Array.isArray(rec.affiliation_path) ? rec.affiliation_path : [];
      out.drawerId = p[0] || out.drawerId;
      out.affiliationId = rec.affiliation || out.affiliationId;
    }
    return done();
  }

  var api = {
    RESERVED: RESERVED.slice(),
    CREATOR_VIEWS: CREATOR_VIEWS.slice(),
    parse: parse,
    recordPath: recordPath,
    positionOf: positionOf,
    resolve: resolve,
  };
  if (typeof root !== 'undefined') root.NpcRoute = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
