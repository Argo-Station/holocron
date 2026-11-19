/* lib/shared/vesselView.jsx — SHIPYARD Y2 "vessels that remember": the ONE shared vessel surface.
 *
 * R-SY5: a single definition mounted by BOTH apps (GM Yard + player mirror), capability-flagged — the
 * NPC-library-core pattern. window.SWRPGVesselView = the Yard's faces and parts (the export object at the foot). Compiled classic-script
 * transform (build.mjs) → loads after vendor.js, so React is global; nothing executes React at load.
 *
 * It renders on the Corpus & Instrument identity (window.SWRPGCorpus classes) + the ONE schematic module
 * in LIVE mode (window.SWRPGShipSchematic, R-SY1) + PROV-1 provenance ({note,when}). Canonical stats are
 * read from the injected `vehicle` (registry record) — never persisted. All state changes go out through
 * `actions` (the host owns the store write); this module is pure presentation over injected state.
 */
(function () {
  'use strict';

  function el() { return React.createElement.apply(null, arguments); }
  function V() { return window.SWRPGVessels; }
  function Schem() { return window.SWRPGShipSchematic; }

  // ── R3 Q2a — [XX] dice tokens draw as SYMBOLS on the attachment surfaces ────────────────────
  // The THIRD description surface, and the one that matters most: this module is the ONLY reader of
  // `public/data/canonical/vehicle-attachments.json`, the file Q1 restored 121 dice tokens into
  // (yardView renders attachments EMBEDDED in vehicle-library records, a different and nearly
  // token-free set). Rendering those descriptions raw put literal "[SE]" in front of a reader —
  // precisely what C-Q1-1 exists to prevent.
  //
  // CONSUMED from its ONE home — `glyphText` in lib/shared/ui.jsx, exported on window.SWRPGUI.
  // Not copied, not reimplemented: the repo holds exactly TWO [XX] splitters in hand-written source
  // and this adapter adds none. Read off `window` at CALL time (vesselView.js is a classic script
  // loaded after vendor.js, but a call-time read keeps the absent-renderer path real and
  // exercisable). DEGRADE RULE: no drawer → the RAW STRING, never null. A missing renderer must not
  // delete the description.
  //
  // glyphText returns an ARRAY of React children, so it can never be string-concatenated: a caller passes any
  // bullet or prefix as its own child instead.
  function glyphs(text) {
    var U = window.SWRPGUI || {};
    return typeof U.glyphText === 'function' ? U.glyphText(text) : text;
  }

  // the numeric reading ("3 / 5"); the '/ max' is a dim sub-span
  function Reading(props) {
    var max = props.max;
    return el('span', { style: { minWidth: 52, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 15,
      fontVariantNumeric: 'tabular-nums', color: 'var(--ci-ink)' } },
      String(props.value | 0),
      max != null ? el('span', { style: { color: 'var(--ci-label)' } }, ' / ' + max) : null);
  }

  // ── SHIPYARD Y3d: THE PARTS REGISTRY'S ONE LOAD — the canonical vehicle-attachments registry (loaded once,
  //    module-cached). The old ATTACHMENTS section it fed was deleted at the S5 flip (R-S5R-18); FIT reads it now. ──
  // A failed fetch, a non-ok answer or a file with no registry is NOT cached (found at JOB 3b: an empty registry cached here
  // read every fitted part as lost, for the rest of the page's life). Each waiting caller still receives ([], {}) as it did,
  // plus the failure's text as a third argument (the browser's own words, WB5's failed state), and the next caller asks again.
  // B-1025 (ruling `shipyard-s5-ready` R-S5R-3/16): the vehicle-weapon categories ride the parts list's own load — a price per
  // laser weapon cannot be read without them, so the list is not "loaded" until both are (and a failure of either is WB5's).
  var _attList = null, _attById = null, _attPending = null, _wcat = null;
  function loadAttachments(cb) {
    if (_attById) { cb(_attList, _attById, null); return; }
    if (_attPending) { _attPending.push(cb); return; }
    _attPending = [cb];
    function done(list, byId, err) { var q = _attPending || []; _attPending = null; q.forEach(function (f) { f(list, byId, err); }); }
    function getJson(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
    Promise.all([getJson('public/data/canonical/vehicle-attachments.json'), getJson('public/data/canonical/vehicle_weapon_categories.vocab.json')]).then(function (both) {
      var j = both[0], wc = both[1];
      if (!j || !j.vehicle_attachments) throw new Error('the file holds no parts list');
      if (!wc || !wc.categories) throw new Error('the weapon categories file holds no categories');
      _wcat = wc.categories;
      var byId = {}, list = [];
      Object.keys(j.vehicle_attachments).forEach(function (id) { var a = j.vehicle_attachments[id]; byId[id] = a; list.push(a); });
      list.sort(function (a, b) { return (a.name || '') < (b.name || '') ? -1 : 1; });
      _attList = list; _attById = byId;
      done(list, byId, null);
    }).catch(function (e) { done([], {}, String(e || 'failed')); });
  }
  // B-342: prints the attachment's BOOK, and it must resolve the stored value rather than echo it.
  // The registry stores vocabulary KEYS ('far_horizons'); the reader wants the title. Resolution is
  // `lib/shared/sources.js`'s job and this calls it — a private alias->id->label walk here would be
  // a second resolution path for a quantity that core owns (CLAUDE.md §5), which is the defect
  // B-339 deleted from the player sheet one lap ago. The `|| s` tail is the shared resolver's own:
  // a display title, a hidden source code (aorbeta/fadbeta) or an unmapped string comes back
  // unchanged rather than blank. The index it reads is built by ready(), which `useSourcesReady`
  // below makes this surface await — without that the resolver is handed null and echoes the key,
  // which is exactly how B-339 stayed invisible for as long as it did.
  function attCite(a) {
    var s = (a && a.sources && a.sources.length) ? a.sources[0] : null;
    if (!s) return null;
    var S = window.SWRPGSources;
    return (S && S.sourceLabel) ? S.sourceLabel(window._swrpgSourcesIndex || null, s) : s;
  }
  // B-342: this file's private `useSourcesReady` is DELETED. It was the fourth copy of a
  // subscription `lib/shared/ui.jsx`'s `useActiveSources` already owned — landed one lap ago as
  // the least-bad option when re-pointing three other modules was out of that lap's scope, and
  // flagged then as a smell rather than made quietly permanent. The shared hook does strictly
  // more (it returns the resolved {ready, index, off}); this surface only needs the re-render.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  // SHIP YARD S4 · THE YARD'S HOST AND ITS HANGAR (ruling `shipyard-s4-ground` §6 JOB 2, chunk A)
  // Built to the APPROVED frames `Docs/mockups/shipyard-hangar.html` (H1 by ship · H2 by unit · H3 history ·
  // H4 the GM's owner picker · H5 empty · U1 the unit page), whose readable source is
  // `Docs/mockups/assets/shipyard/frames_hangar.cjs`. ONE definition, mounted by BOTH hosts (R-SY5); the host
  // owns the router, the two bars (SuiteBar/BottomNav in their paper face, ADR 0010) and the interim rooms.
  // Numbers: the ONE resolver (`SWRPGVesselResolve.resolve` / `seatPool`); records: `SWRPGVessels`; the
  // ACQUIRED line: `SWRPGVessels.acquiredLine` (R-S4CC-2 — read, never written). Nothing here WRITES: the
  // units key (K5) is read only, and the controls whose flows no frame draws are inert and listed at the gate.
  // B-925's census (test/vessel_resolve.cjs §(j)) reads `vehicle.<number>` in this file: this block reads the
  // registry row as `vrow` and every number through the resolver, so it adds no site to that census.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  function VR() { return window.SWRPGVesselResolve; }

  // ── K6 · THE ROUTE GRAMMAR (R-S4G-3): one parser, both hosts. `tail` is the path after /<host>/yard. ──
  // '' | 'hangar' → HANGAR · 'catalogue' → CATALOGUE · 'catalogue/<KEY>' → ENTRY · 'ship/<id>[/<tab>]' → SHIP ·
  // 'unit/<id>' → UNIT · a lone '<KEY>' → ENTRY (today's /<host>/yard/<key> stays an alias). Anything else is
  // `notfound`, which the host renders IN PLACE (never the landing). Vehicle keys are upper-case; the four room
  // words are reserved lower-case (a guard row asserts no registry key collides).
  // `shipyard-s4-ship-room`: the workbench's six tabs in the drawn order, `trade` included (R-S4SR-2), and the
  // at-table DECK room at 'ship/<id>/room/deck' (R-S4SR-1). `room` is reserved: never a tab, never a lone key.
  var YARD_ROOMS = ['hangar', 'catalogue', 'ship', 'unit'];
  // S8 (card ADDENDUM 12 Q1): 'build' is BUILD A SHIP's own address, reserved as `room` is (never a lone key)
  var YARD_RESERVED = YARD_ROOMS.concat(['room', 'build']);
  var SHIP_TABS = ['fit', 'crew', 'dock', 'log', 'trade', 'deck'];
  // R-S4CC-2 (on paper, `shipyard-s4-catalogue-card` ADDENDUM 2): 'catalogue/<KEY>/plan' → P1, PLAN on that hull; its
  // `?part=<attachment id>` (the door from an owned ship's part row) is read from `search`, the host's location.search, so
  // the tail stays a path. An unknown KEY is the entry's not-found and an unknown or unfitting part plans nothing (YardPlan).
  // SHIP YARD S8 (card `shipyard-s8-build` ADDENDUM 12 Q1, on paper): 'ship/<id>/fit/convert' → the Convert room, a room of
  // THE SHIP under MODS (`at: 'convert'`, as the DECK room is `at: 'deck'`), so the browser's back returns to MODS; 'build' → BUILD A
  // SHIP (`room: 'build'`, the screen ids PLAYER.YARD.BUILD / GM.YARD.BUILD).
  function yardRoute(tail, search) {
    var segs = String(tail || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    if (!segs.length || (segs.length === 1 && segs[0] === 'hangar')) return { room: 'hangar' };
    if (segs.length === 1 && segs[0] === 'build') return { room: 'build' };
    if (segs[0] === 'catalogue') {
      if (segs.length === 1) return { room: 'catalogue' };
      if (segs.length === 2) return { room: 'entry', key: segs[1] };
      if (segs.length === 3 && segs[2] === 'plan') {
        var pm = /[?&]part=([^&#]*)/.exec(String(search == null ? '' : search)), part = null;
        if (pm && pm[1]) { try { part = decodeURIComponent(pm[1].replace(/\+/g, ' ')); } catch (e) { part = pm[1]; } }
        return { room: 'plan', key: segs[1], part: part };
      }
      return { room: 'notfound' };
    }
    if (segs[0] === 'ship') {
      if (segs.length === 2) return { room: 'ship', id: segs[1], tab: null };
      if (segs.length === 3 && SHIP_TABS.indexOf(segs[2]) !== -1) return { room: 'ship', id: segs[1], tab: segs[2] };
      if (segs.length === 4 && segs[2] === 'room' && segs[3] === 'deck') return { room: 'ship', id: segs[1], tab: null, at: 'deck' };
      if (segs.length === 4 && segs[2] === 'fit' && segs[3] === 'convert') return { room: 'ship', id: segs[1], tab: 'fit', at: 'convert' };
      return { room: 'notfound' };
    }
    if (segs[0] === 'unit') return segs.length === 2 ? { room: 'unit', id: segs[1] } : { room: 'notfound' };
    if (segs.length === 1 && YARD_RESERVED.indexOf(segs[0]) === -1) return { room: 'entry', key: segs[0], alias: true };
    return { room: 'notfound' };
  }
  function yardTail(route) {
    var r = route || {};
    var enc = function (s) { return encodeURIComponent(String(s)); };
    if (r.room === 'catalogue') return 'catalogue';
    if (r.room === 'entry') return 'catalogue/' + enc(r.key);
    if (r.room === 'plan') return 'catalogue/' + enc(r.key) + '/plan';
    if (r.room === 'ship') return 'ship/' + enc(r.id) + (r.at === 'deck' ? '/room/deck' : r.at === 'convert' ? '/fit/convert' : r.tab ? '/' + r.tab : '');
    if (r.room === 'unit') return 'unit/' + enc(r.id);
    if (r.room === 'build') return 'build';
    return 'hangar';
  }

  // a move's query (R-S4CC-2): P1's planned part is the Yard's ONE URL key. The walk's two lever keys (R-S4G-15) left
  // with Jason's picks (D-27; ruling `shipyard-s5-ready` P3): an old link carrying either is read nowhere, and the next move drops it.
  function yardQuery(route) {
    return route && route.room === 'plan' && route.part ? '?part=' + encodeURIComponent(String(route.part)) : '';
  }

  // ── the three registries the floor reads: Table 7-9 (crit names), the NPC library (names, tiers, the pool's
  // characteristic and rank) and the skills vocabulary (the skill's label and characteristic, and a character
  // record's sheet key). Fetched once, module-cached; `window._critTables` is ui.jsx's own cache, shared. ──
  var _ydReg = null, _ydPending = null;
  function ydLoad(cb) {
    if (_ydReg) { cb(_ydReg); return; }
    if (_ydPending) { _ydPending.push(cb); return; }
    _ydPending = [cb];
    function j(u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    Promise.all([
      window._critTables ? Promise.resolve(window._critTables) : j('/public/data/canonical/crit_tables.json'),
      j('/public/data/canonical/npcs.json'),
      j('/public/data/canonical/skills.vocab.json'),
      window._maneuversActions ? Promise.resolve(window._maneuversActions) : j('/public/data/canonical/maneuvers_actions.json'),
      j('/public/data/canonical/qualities.vocab.json'),
      j('/public/data/canonical/crew_roles.json'),
    ]).then(function (a) {
      if (a[0] && !window._critTables) window._critTables = a[0];
      if (a[3] && !window._maneuversActions) window._maneuversActions = a[3];
      var npcs = {}, bySource = {};
      var map = (a[1] && a[1].npcs) || {};
      Object.keys(map).forEach(function (k) { var n = map[k]; npcs[n.id || k] = n; if (n._source_key) bySource[n._source_key] = n; });
      var skills = {};
      ((a[2] && a[2].entries) || []).forEach(function (s) { if (s && s.id) skills[s.id] = s; });
      var quals = {};
      ((a[4] && a[4].entries) || []).forEach(function (q) { if (!q) return; quals[q.id] = q; (q.aliases || []).forEach(function (al) { quals[al] = q; }); });
      _ydReg = { critRows: (a[0] && a[0].vehicle && a[0].vehicle.rows) || [], npcs: npcs, npcsBySource: bySource, skills: skills,
        starship: (a[3] && a[3].starship) || null, qualities: quals, crewRoles: (a[5] && a[5].roles) || [] };
      var q = _ydPending; _ydPending = null; q.forEach(function (f) { f(_ydReg); });
    });
  }
  function useYdRegistries() {
    var st = React.useState(_ydReg), reg = st[0], setReg = st[1];
    React.useEffect(function () { if (!reg) ydLoad(setReg); }, []);
    return reg;
  }
  // → { by, err }: `by` null while the parts list loads or after it failed; `err` the failure's text (WB5), else null
  function useYdAttachmentsLoad() {
    var st = React.useState(_attById), by = st[0], setBy = st[1];
    var es = React.useState(null), err = es[0], setErr = es[1];
    React.useEffect(function () { if (!by) loadAttachments(function (_l, b, e) { if (e) setErr(e); else setBy(b); }); }, []);
    return { by: by, err: err };
  }
  function useYdAttachments() { return useYdAttachmentsLoad().by; }
  // SHIP YARD S4 · JOB 3b — the book's weapons (vehicle-weapons.json, R-S4WC-5): the resolver's rung (ctx.weapons) and K4's
  // list, in Table 7-17's order. Loaded once and cached. A failed fetch or a non-ok answer is NOT cached as an empty registry
  // (that reads every swap as ORPHANED — the fault loadAttachments carries): it answers null, the resolver decides nothing
  // about a swap, and the next mount asks again.
  var _wpList = null, _wpById = null, _wpPending = null;
  function loadWeapons(cb) {
    if (_wpById) { cb(_wpList, _wpById); return; }
    if (_wpPending) { _wpPending.push(cb); return; }
    _wpPending = [cb];
    function done(list, byId) { var q = _wpPending || []; _wpPending = null; q.forEach(function (f) { f(list, byId); }); }
    fetch('public/data/canonical/vehicle-weapons.json').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.vehicle_weapons) { done(null, null); return; }
        var byId = j.vehicle_weapons, list = Object.keys(byId).map(function (k) { return byId[k]; });
        _wpList = list; _wpById = byId;
        done(list, byId);
      }).catch(function () { done(null, null); });
  }
  function useYdWeapons() {
    var st = React.useState(_wpById), by = st[0], setBy = st[1];
    React.useEffect(function () { if (!by) loadWeapons(function (_l, b) { if (b) setBy(b); }); }, []);
    return by;
  }
  // W7 · the hold's items: the gear list through THE ONE items loader (SWRPGItemRegistries, F-100 UD-1f: the store's and
  // the creator's discovery view, the active packs folded in), never a fetch of the Yard's own. A cargo line's `ref` is a
  // gear id. Until the list arrives, or on a host without the loader, an item line reads its id and "—".
  function useYdGear() {
    var IR = window.SWRPGItemRegistries, got = window._canonicalRegistries;   // the loader's own cache key, read first
    var st = React.useState(got && got.gear ? got.gear : null), by = st[0], setBy = st[1];
    React.useEffect(function () {
      if (by || !IR || !IR.load) return undefined;
      var live = true;
      IR.load().then(function (v) { if (live && v && v.gear) setBy(v.gear); });
      return function () { live = false; };
    }, []);
    return by;
  }
  // the frames' three bands (build.cjs: wide ≥ 1367, mid ≥ 1024, narrow below)
  function useYdBand() {
    function band() { var w = (typeof window !== 'undefined' && window.innerWidth) || 390; return w >= 1367 ? 'wide' : w >= 1024 ? 'mid' : 'narrow'; }
    var st = React.useState(band), b = st[0], setB = st[1];
    React.useEffect(function () {
      function on() { setB(band()); }
      window.addEventListener('resize', on);
      return function () { window.removeEventListener('resize', on); };
    }, []);
    return b;
  }

  // ── K5 · THE FLEET UNITS — READ ONLY here. `swrpg_fleet_units_v1 = { v:1, units:[{ id, name, owner, flagship,
  // leader:{who,vessel}|null, members:[VesselId], createdAt, updatedAt }] }` (shipyard-s3-contracts K5). A unit
  // whose id is tombstoned (swrpg_deleted_ids) reads as absent; a member id with no vessel reads as absent. ──
  var UNITS_KEY = 'swrpg_fleet_units_v1', TOMBS_KEY = 'swrpg_deleted_ids';
  function readTombstones() {
    try { var t = JSON.parse(window.localStorage.getItem(TOMBS_KEY) || '[]'); return Array.isArray(t) ? t.map(String) : []; } catch (e) { return []; }
  }
  function readUnits() {
    var raw = null;
    try { raw = JSON.parse(window.localStorage.getItem(UNITS_KEY) || 'null'); } catch (e) { raw = null; }
    var list = raw && Array.isArray(raw.units) ? raw.units : [];
    var dead = readTombstones();
    return list.filter(function (u) { return u && u.id != null && dead.indexOf(String(u.id)) === -1; }).map(function (u) {
      return { id: String(u.id), name: u.name != null ? String(u.name) : '', owner: u.owner != null ? String(u.owner) : '',
        flagship: u.flagship != null ? String(u.flagship) : null,
        leader: u.leader && typeof u.leader === 'object' ? { who: u.leader.who != null ? String(u.leader.who) : null, vessel: u.leader.vessel != null ? String(u.leader.vessel) : null } : null,
        members: Array.isArray(u.members) ? u.members.map(String) : [] };
    });
  }
  function useYdUnits() {
    var st = React.useState(readUnits), units = st[0], setUnits = st[1];
    React.useEffect(function () {
      function on(e) { if (!e || !e.key || e.key === UNITS_KEY || e.key === TOMBS_KEY) setUnits(readUnits()); }
      window.addEventListener('storage', on);
      return function () { window.removeEventListener('storage', on); };
    }, []);
    return units;
  }

  // ── small readers over the record (each number from the resolver; words from the registries) ──
  function isActive(rec) { return !!rec && !rec.retired && !rec.destroyed; }
  // card ADDENDUM 19 (H-5 (b)): a row's crew as the faces print it — a frame's `crew_short` (the approved frames' words, from the
  // census), else the row's `crew` (a library row's, the page's words). The ONE read for every face that prints a hull's crew.
  // A5 (argo-dataset-import-draft ADDENDUM 5 F3): `crew_short` stays first; `crew` fills from the user's import by the row's key.
  function crewLine(vrow) { return vrow ? vrow.crew_short || vrow.crew || vvRuleText('vehicles', vrow.key, 'crew') || null : null; }
  // A5 (ruling argo-dataset-import-draft ADDENDUM 4 §A4.1 item 3): the user's imported rule text through the one accessor
  // (SWRPGSources.ruleText / ruleTextItem); null on holocron.work and wherever nothing was imported, so a face draws as before.
  // A library vehicle is addressed by its entry `key`.
  function vvRuleText(kind, id, path) {
    var S = window.SWRPGSources;
    return S && S.ruleText ? S.ruleText(kind, id, path) : null;
  }
  function vvField(v, f) { return v && v[f] != null && v[f] !== '' ? v[f] : (v ? vvRuleText('vehicles', v.key, f) : null); }
  function shipName(rec, vrow) { return rec.nickname || (vrow && vrow.name) || rec.vehicleKey; }
  // S8 (R-S8B-4): every face turns a ship into its row through the store's ONE lookup (a built ship's frame, else the library
  // row by key); `lib` is the host's library (`getVehicle`: key → row), never consulted for a built ship
  function vehicleOf(rec, lib) { var VS = V(); return VS && VS.vehicleFor ? VS.vehicleFor(rec, lib || null) : null; }
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function dayMonth(when) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(when || ''));
    if (!m) return null;
    return String(parseInt(m[3], 10)) + ' ' + MONTHS[parseInt(m[2], 10) - 1];
  }
  // B1 (D-27, R-S4CAT-3): an event is stamped with its own date ("12 SEP"); one that carries no date prints "—"
  // (never invented). SESSION n left with the walk's lever (ruling `shipyard-s5-ready`).
  function stampOf(when) {
    return dayMonth(when) || '—';
  }
  function critName(reg, c) {
    if (!c) return null;
    if (c.row && reg) {
      var row = (reg.critRows || []).filter(function (r) { return r && r[3] === c.row; })[0];
      if (row) return String(row[2] || '').split(':')[0];
    }
    return c.label || null;
  }
  function roleWord(role) { return ({ pilot: 'PILOT', copilot: 'CO-PILOT', gunner: 'GUNNER', engineer: 'ENGINEER', astrogator: 'ASTROGATOR', sensors: 'SENSORS', commander: 'COMMANDER', crew: 'CREW' })[role] || String(role || '').toUpperCase(); }
  function npcOf(reg, key) { return reg ? (reg.npcs[key] || reg.npcsBySource[key] || null) : null; }
  // R-BSBP-1/2: a campaign group's owner word is its swrpg_party_v1 id ('party_<uuid>'). → its name; with an empty name
  // the campaign's; with neither 'THE GROUP' (partyStore's rule); null when no group on this device carries it (NO OWNER)
  function groupName(owner) {
    var P = window.SWRPGParty, C = window.SWRPGCampaigns, g = /^party_/.test(owner || '') && P ? P.partyOf(P.load(), owner) : null;
    if (!g) return null;
    var c = C ? (C.load().campaigns || []).filter(function (x) { return x && x.partyId === owner && x.name; })[0] : null;
    return g.name || (c && c.name) || 'THE GROUP';
  }
  function whoOf(who, reg, roster) {
    var P = window.SWRPGVessels && window.SWRPGVessels.parseWho ? window.SWRPGVessels.parseWho(who) : null;
    if (!P) return null;
    if (P.kind === 'npc') { var n = npcOf(reg, P.id); return { kind: 'npc', id: P.id, name: n ? n.name : P.id, tier: n ? n.tier : null, src: n ? n.source : null, rec: n }; }
    if (P.kind === 'char') { var c = (roster || []).filter(function (x) { return x && String(x.id) === P.id; })[0]; return { kind: 'char', id: P.id, name: c ? c.name : null, rec: c || null }; }
    return { kind: 'name', name: P.text };
  }
  // A seat's pool: an NPC's from its registry row's characteristic and rank, composed by the ONE dice core
  // (`SWRPGDice.buildPool`); a character's from the sheet's own path (the host's `charPool`, lib/shared/sheetPool.js);
  // and the ship's upgrades from the ONE resolver's seat pool, for both.
  // `taken` (optional, R-M8C8-7): ONLY the open seat card passes its ticks, handed to the character branch's `charPool`
  // as its fourth argument; the collapsed rows, the commander's and the sensors' pools never pass one.
  function seatDice(who, role, rec, vrow, ctx, reg, taken) {
    var D = window.SWRPGDice, R = VR();
    if (!D || !D.buildPool || !R || !reg) return null;
    var skill = R.seatSkill(role, vrow);
    var sk = skill && reg.skills[skill];
    if (!sk) return null;
    var P = window.SWRPGVessels.parseWho(who), ch = null, rank = 0;
    if (P && P.kind === 'npc') {
      var n = npcOf(reg, P.id);
      if (!n) return null;
      ch = n.characteristics ? n.characteristics[sk.characteristic] : null;
      var s = (n.skills || []).filter(function (x) { return x && x.skill_ref === skill; })[0];
      rank = s && typeof s.rank === 'number' ? s.rank : 0;
    } else if (P && P.kind === 'char' && ctx && typeof ctx.charPool === 'function') {
      // a character's seat pool is the sheet's own, through ONE module both apps load (lib/shared/sheetPool.js
      // `charPool`, ruling `shipyard-s4-ship-pool-path` R-S4PP-1..3): the saved sheet, its items' and talents' dice,
      // `buildPool`. The ship's upgrade is still the resolver's. A host without it yet (the GM app before its lazy
      // core lands) draws no pool rather than a second, poorer one — the raw-sheet branch is deleted (R-S4CO-4).
      var cc = (ctx.roster || []).filter(function (x) { return x && String(x.id) === P.id; })[0];
      if (!cc) return null;
      var upc = R.seatPool(rec, vrow, Object.assign({}, ctx.resolve, { character: who }), role);
      // R-SYC-5 (card f100-surfacing-yard-concept ADDENDUM 8 Q1 (a)): the ship's granted talents are the sitter's for this roll,
      // read HERE from the record, so every face of one seat (the collapsed row, the open card, the fit plan) folds the same list
      var grants = (R.resolve(rec, vrow, ctx.resolve) || {}).seat_talents || [];
      var hp = ctx.charPool(cc, skill, upc ? upc.upgradeAbility : 0, taken || null, grants);
      return hp ? { pool: hp, label: sk.label, held: !!(upc && upc.held) } : null;   // held: B-1015, no part's upgrade is known
    } else return null;
    if (typeof ch !== 'number') return null;
    var up = R.seatPool(rec, vrow, Object.assign({}, ctx && ctx.resolve, { character: who }), role);
    var pool = D.buildPool({ characteristic: ch, skillRank: rank, upgradeAbility: up ? up.upgradeAbility : 0 });
    return { pool: pool, label: sk.label, held: !!(up && up.held) };
  }
  // THE YARD'S DICE SIZE IS yard.css's (B-1600; ruling release-r7-bug-burndown ADDENDA 251, 276): `.yd .hp-sym` 19px is
  // the hangar mockup's approved size, and an inline size beat it (16px). Every Yard pool passes `cssSized`, so the
  // renderer writes no inline box and the stylesheet draws it.
  function PoolRow(props) {
    var d = props.dice;
    if (!d || !window.SWRPGDice || !window.SWRPGDice.renderPool) return null;
    // the frames' own arrangement: the pool, a space, the skill's label — the parent row lays them out
    return el(React.Fragment, null,
      el('span', { className: 'y-pool', 'data-pool': props.id || '' }, window.SWRPGDice.renderPool({ proficiency: d.pool.proficiency || 0, ability: d.pool.ability || 0, boost: d.pool.boost || 0, setback: d.pool.setback || 0 }, { size: 1, cssSized: true })), ' ',
      el('span', { className: 'y-mono' }, d.label));
  }

  // ── B-1015 · HELD (ruling `shipyard-s4-catalogue-card` R-S4CC-1/6/7/8/19/20; the approved page @ 6aa1f830, frames_b1015.cjs).
  // While the parts list is missing, a ship with a part fitted resolves HELD (`res.held`, vesselResolve's `ctx.attachments ===
  // null`): its class values come back null and print the faces' existing "—". These three are the page's own additions:
  // WB5's words once per face, a seat's "UPGRADE —" beside its own pool (every seat, R-S4CC-19), and the bold "—" the page
  // draws where a number sat inside a line of text. ──
  function heldOf(res) { return !!(res && res.held); }
  function PartsWords(props) {
    if (!props.err) return el('p', { className: 'y-lead y-mt', 'data-face': 'loading', 'data-testid': 'parts-words' }, 'LOADING…');
    return el('div', { 'data-face': 'failed', 'data-testid': 'parts-words' },
      el('div', { className: 'y-plate y-mt' }, el('div', { style: { padding: '12px 14px' } }, el('p', { className: 'y-wb-fail' }, 'The parts list didn’t load: ' + props.err))),
      el('p', { className: 'y-wb-line', style: { marginTop: 10 } }, 'Nothing on the ship has changed. Reload the page to try again.'));
  }
  function HangarWords(props) { return props.held.any ? el(PartsWords, { err: props.err }) : null; }
  function UpHeld() { return el('span', { className: 'y-attr', style: { textAlign: 'left' }, 'data-testid': 'seat-upgrade-held' }, 'UPGRADE —'); }
  function DashB() { return el('b', { 'data-held': 1 }, '—'); }

  // ── the parts every floor draws (frames_hangar.cjs `stamp`, `cond`, `hullType`, `logline`, `sech`, `mast`) ──
  function Stamp(props) { return el('span', { className: 'y-stamp', 'data-k': props.k }, props.children); }
  function Sech(props) {
    return el('div', { className: 'y-sech' }, el('h2', null, props.h), props.x ? el('span', { className: 'y-sech-x' }, props.x) : null);
  }
  function Mast(props) {
    return el(React.Fragment, null,
      el('div', { className: 'y-mast' }, el('h1', { className: 'y-h1' }, props.title || 'HANGAR'), props.stamp || null, props.title ? null : props.door || null),
      props.lead ? el('p', { className: 'y-lead' }, props.lead) : null, props.after || null);
  }
  function Cond(props) {
    var rec = props.rec, r = props.res;
    var h = rec.hull_current || 0, s = rec.strain_current || 0, c = (rec.crits || []).length;
    if (!h && !s && !c && !props.both) return el('div', { className: 'y-cond', 'data-testid': 'yard-cond' }, el('span', { className: 'y-cond-ok' }, 'BATTLE-READY'));
    var parts = [];
    if (h || props.both) parts.push(el('span', { key: 'h', 'data-hurt': h ? 1 : 0 }, 'HULL ', el('b', null, h), ' OF ', el('b', null, r && r.hull_threshold != null ? r.hull_threshold : '—')));
    if (s || props.both) parts.push(el('span', { key: 's', 'data-hurt': s ? 1 : 0 }, 'STRAIN ', el('b', null, s), ' OF ', el('b', null, r && r.strain_threshold != null ? r.strain_threshold : '—')));
    if (c) parts.push(el('span', { key: 'c' }, el('b', null, c), ' CRIT'));
    return el('div', { className: 'y-cond', 'data-testid': 'yard-cond' }, parts);
  }
  function HullType(props) {
    var vrow = props.vrow, r = props.res;
    if (!vrow) return el('span', { className: 'y-ship-t' }, props.rec.vehicleKey);
    return el('span', { className: 'y-ship-t' }, (builtWord(props.rec, vrow) || vrow.name || props.rec.vehicleKey) + ' · SILHOUETTE ' + (r && r.silhouette != null ? r.silhouette : '—'));
  }
  function LastCrit(props) {
    var rec = props.rec, crits = rec.crits || [];
    if (!crits.length) return null;
    var c = crits[crits.length - 1], name = critName(props.reg, c);
    if (!name) return null;
    return el('p', { className: 'y-logline', 'data-testid': 'yard-logline' }, el('i', null, stampOf(c.when)), ' · Critical hit: ' + name);
  }
  // the ship's art — ONE chain (U20, `shipyard-s4-approvals` R-S4A-1, as D-196 amends it; card `shipyard-schematic-build-card`
  // R-SSB-4): the owner's own picture (K1.image) → the ship IDENTIFIER, drawn from the hull's record by the shared
  // SWRPGShipSchematic in the form its HOST takes (`host`, D-212's placement table in shipSchematic.js; `w`, the slot's width
  // for a host that turns FULL when wide). The archive art is retired (D-196). A hull the loaded books do not hold (U12: no
  // row) has no record to draw, so its plate stays the bare mat. Paper only (D-198).
  // `schem`: the identifier's box (px), unchanged from the schematic's (card §2: box sizes unchanged).
  function Ident(props) {   // the identifier in its box: SMALL by its own width, FULL fitted into the square box
    var S = Schem(), form = S.formFor(props.host, props.w);
    return el('span', { className: 'y-u20svg', 'data-host': props.host, 'data-form': form, style: form === 'full' ? Object.assign({ width: props.px, height: props.px }, props.style) : props.style },
      el(S.Schematic, { host: props.host, w: props.w, size: props.px, rec: props.rec, name: props.name }));
  }
  function Art(props) {
    var rec = props.rec, vrow = props.vrow, S = Schem();
    var cls = (props.cls || 'y-ship-art') + ' y-mat', form = S && S.formFor ? S.formFor(props.host, props.w) : null;
    if (rec.image) {
      return el('div', { className: cls, style: props.style, 'data-u20': 'own', 'data-host': props.host, 'data-form': form },
        el('span', { className: 'y-plateimg', role: 'img', 'aria-label': props.alt || '', 'data-plate': 'own',
          style: { backgroundImage: 'url("' + rec.image + '")', backgroundSize: 'cover' } }));
    }
    if (vrow && S && S.Schematic) {
      return el('div', { className: cls + ' y-u20mat', style: props.style, 'data-u20': 'schematic', 'data-host': props.host, 'data-form': form },
        el(Ident, { host: props.host, w: props.w, px: props.schem || 150, rec: vrow, name: props.alt }),
        props.bare ? null : el('span', { className: 'y-u20cap' }, 'Recognition schematic'));   // bare: no caption — Plate 1 (captioned below it), every catalogue slot and Plan a Fit's head (card ADDENDA 3–4)
    }
    return el('div', { className: cls, style: props.style, 'data-u20': 'none', 'data-host': props.host, 'data-form': form });
  }
  function Face(props) {
    var c = props.rec, url = props.portraitFor ? props.portraitFor(c) : null;
    if (url) return el('span', { className: 'y-face', role: 'img', 'aria-label': ((c && c.species) || 'character') + ' portrait', style: { backgroundImage: 'url("' + url + '")' } });
    // no portrait to show (the GM host has no species-portrait resolver; a character without one): the frame's
    // face box carries the name's initial in the document's own ink — the dark Monogram is white-on-cream here
    return el('span', { className: 'y-face y-face-init', 'aria-hidden': true }, String(((c && c.name) || '?').trim().charAt(0) || '?').toUpperCase());
  }
  function NpcMark() { return el('span', { className: 'y-npcmark', 'aria-hidden': true }, 'NPC'); }

  // the ship's log rows (H3): ACQUIRED from `acquiredLine`, then the record's own events and lines, the dup the
  // acquired line already prints left out (R-S4CC-2). App events print their KIND; the player's line prints YOUR LINE.
  // the reason an INSTALLED line carries, in the log's own words (K3's line, "Hyperdrive Generator — a reward."); the
  // five ADD chips and the counter's `bought` (StoryEvent.reason)
  var REASON_WORD = { bought: 'bought', reward: 'a reward', salvaged: 'salvaged', gift: 'a gift', built: 'built', aboard: 'already aboard' };
  // R-S4WC-6: where a REMOVED part or weapon went (the undrawn page's WB3/WB4: "— to the hold.", "— discarded.")
  var TO_WORD = { hold: 'to the hold', discarded: 'discarded' };
  function logRows(rec, reg, npcName, attById) {
    var VS = window.SWRPGVessels, rows = [];
    var acq = VS && VS.acquiredLine ? VS.acquiredLine(rec, { npcName: npcName }) : null;
    if (acq && acq.text) rows.push({ k: 'acquired', stamp: stampOf(acq.when), e: 'ACQUIRED', t: acq.text });
    (rec.provenance || []).forEach(function (p, i) {
      if (acq && acq.prov === i) return;
      if (!p.kind) { rows.push({ k: 'line', stamp: 'YOUR LINE', t: p.note, by: 'player', i: i, s: stampOf(p.when) }); return; }
      if (p.kind === 'acquired') return;   // a legacy event: the acquired line above already prints it
      var t = p.note;
      if (p.kind === 'retired') t = (rec.retired && rec.retired.note) || p.note;
      else if (p.kind === 'lost') t = (rec.destroyed && rec.destroyed.note) || p.note;
      else if (p.kind === 'installed' || p.kind === 'removed') {
        // B-1015 (R-S4CC-8): with the parts list missing (`attById === null`) the part's name is unknown and reads "—", never the
        // registry's key — a key is not a name. The line keeps its kind, its date and its reason.
        t = attById === null ? '—' : (attById && p.ref && attById[p.ref] && attById[p.ref].name) || p.ref || p.note;
        if (p.kind === 'installed' && REASON_WORD[p.reason]) t = t + ' — ' + REASON_WORD[p.reason] + '.';   // K3: "Hyperdrive Generator — a reward."
        if (p.kind === 'removed' && TO_WORD[p.to]) t = t + ' — ' + TO_WORD[p.to] + '.';   // WB3: "… — to the hold."
      }
      else if (p.kind === 'crit') t = critName(reg, { row: p.ref }) || p.note;
      rows.push({ k: p.kind, i: i, stamp: stampOf(p.when), e: ({ retired: 'RETIRED', lost: 'LOST', installed: 'INSTALLED', removed: 'REMOVED', crit: 'CRITICAL HIT', repaired: 'REPAIRED' })[p.kind] || String(p.kind).toUpperCase(), t: t });
    });
    return rows;
  }

  // ── THE FLOOR · the ship plates ──
  function HeroPlate(props) {
    var rec = props.rec, vrow = props.vrow, res = props.res, band = props.band;
    return el('article', { className: 'y-plate y-lift y-hero', 'aria-label': shipName(rec, vrow), 'data-testid': 'yard-hero', 'data-vessel': rec.id },
      el(Art, { rec: rec, vrow: vrow, host: 'hangar-hero', cls: 'y-hero-art', style: { height: band === 'wide' ? 320 : 206 }, schem: band === 'wide' ? 240 : 150, alt: shipName(rec, vrow) }),
      el('div', { className: 'y-hero-body' },
        el('div', { className: 'y-row' }, el('h3', { className: 'y-ship-n' }, String(shipName(rec, vrow)).toUpperCase()), props.bond ? el(Stamp, { k: 'bond' }, 'MY SHIP') : null),
        el(HullType, { rec: rec, vrow: vrow, res: res }),
        el(Cond, { rec: rec, res: res }),
        (props.seat || props.unit) ? el('div', { className: 'y-facts' },
          props.seat ? el('span', { className: 'y-seat' }, 'YOUR SEAT · ', el('b', null, roleWord(props.seat))) : null,
          props.unit ? el('span', { className: 'y-seat' }, 'UNIT · ', el('b', null, String(props.unit.name).toUpperCase())) : null) : null,
        el(LastCrit, { rec: rec, reg: props.reg }),
        el('div', { className: 'y-row' }, el('button', { type: 'button', className: 'y-sp y-link', 'data-testid': 'yard-open-sheet', onClick: props.onOpen }, 'OPEN THE SHEET ›'))));
  }
  function ShipRow(props) {
    var rec = props.rec, vrow = props.vrow, big = props.band === 'wide';
    return el('article', { className: 'y-ship y-sec', 'data-testid': 'yard-ship', 'data-vessel': rec.id, 'data-lost': rec.destroyed ? 1 : undefined,
        style: big ? { gridTemplateColumns: '260px minmax(0,1fr)' } : undefined },
      el('button', { type: 'button', className: 'y-ship-open', 'aria-label': 'Open ' + shipName(rec, vrow), onClick: props.onOpen, style: { display: 'contents' } },
        el(Art, { rec: rec, vrow: vrow, host: 'hangar-row', w: big ? 260 : 132, style: big ? { width: 260, height: 172 } : undefined, schem: big ? 130 : 60, alt: shipName(rec, vrow) })),
      el('div', { className: 'y-ship-body y-shipcols' },
        el('div', null,
          el('div', { className: 'y-row' }, el('h3', { className: 'y-ship-n' }, String(shipName(rec, vrow)).toUpperCase()), props.stamp || null),
          el(HullType, { rec: rec, vrow: vrow, res: props.res }),
          props.noCond ? null : el(Cond, { rec: rec, res: props.res }),
          props.left || null),
        el('div', null, props.right || null)));
  }
  function LogBlock(props) {
    var rows = props.rows || [];
    return el(React.Fragment, null,
      el('div', { className: 'y-log', 'data-testid': 'yard-log' }, rows.map(function (r, i) {
        return el('div', { key: i, className: 'y-log-r', 'data-by': r.by || undefined, 'data-kind': r.k },
          el('span', { className: 'y-log-s' }, r.stamp),
          el('span', { className: 'y-log-t' }, r.e ? el('span', { className: 'y-log-e' }, r.e) : null, r.t || ''));
      })),
      el('button', { type: 'button', className: 'y-link', 'data-testid': 'yard-read-log', onClick: props.onRead }, 'READ THE WHOLE LOG ›'));
  }

  function OrphanRow(props) {
    var rec = props.rec, vrow = props.vrow, wide = props.band === 'wide';
    return el('article', { className: 'y-ship y-sec', 'data-testid': 'yard-orphan', 'data-vessel': rec.id, style: wide ? { gridTemplateColumns: '260px minmax(0,1fr)' } : undefined },
      el(Art, { rec: rec, vrow: vrow, host: 'hangar-orphan', w: wide ? 260 : 132, style: wide ? { width: 260, height: 172 } : undefined, schem: wide ? 130 : 60, alt: shipName(rec, vrow) }),
      el('div', { className: 'y-ship-body y-shipcols' },
        el('div', null, el('div', { className: 'y-row' }, el('h3', { className: 'y-ship-n' }, shipName(rec, vrow))),
          el(HullType, { rec: rec, vrow: vrow, res: props.res }), el(Cond, { rec: rec, res: props.res })),
        el('div', null, el('button', { type: 'button', className: 'y-quiet', style: { alignSelf: 'flex-start' }, 'data-testid': 'yard-give', onClick: props.onGive }, 'GIVE TO…'))));
  }

  // ── the unit pieces (H2, U1) ──
  function unitStats(unit, byId) {
    var present = unit.members.map(function (id) { return byId[id]; }).filter(Boolean);
    var lost = present.filter(function (r) { return !!r.destroyed; });
    var inService = present.filter(isActive);
    return { present: present, lost: lost, inService: inService };
  }
  function Pilot(props) {
    var rec = props.rec, seat = (rec.crew || []).filter(function (c) { return c.role === 'pilot'; })[0];
    if (!seat) return el('div', { className: 'y-who' }, el('div', { className: 'y-who-m' }, 'NO PILOT'));
    var w = whoOf(seat.who, props.reg, props.roster) || {};
    var lead = props.unit && props.unit.leader && props.unit.leader.who === seat.who && (!props.unit.leader.vessel || props.unit.leader.vessel === rec.id);
    var meta = w.kind === 'char' ? 'PLAYER CHARACTER' : w.kind === 'npc' ? ('NPC · ' + (w.tier || '')) : '';
    var dice = props.withPool ? seatDice(seat.who, 'pilot', rec, props.vrow, props.ctx, props.reg) : null;
    return el('div', { className: 'y-who', 'data-testid': 'yard-pilot' },
      w.kind === 'char' ? el(Face, { rec: w.rec, portraitFor: props.portraitFor }) : el(NpcMark),
      el('div', null,
        el('div', { className: 'y-who-n' }, w.name || '—'),
        el('div', { className: 'y-who-m' }, meta + (lead ? ' · LEADER' : '') + (w.kind === 'char' && rec.owner === seat.who ? ' · OWNS THIS CRAFT' : '')),
        dice ? el('div', { className: 'y-mt', style: { marginTop: 6 } }, el(PoolRow, { dice: dice, id: 'pilot.' + rec.id }), dice.held ? el(UpHeld) : null) : null));
  }
  // PAPER N6 (ruling `paper-npc-vehicle-dossier-concept` R-NVD-C2): the Yard's CRIPPLED test and its words for a crippled
  // ship and a lost one, as PARTS — CraftCond, StateBox and SheetFace draw through them and the NPC card's CRAFT face
  // borrows them through YardParts, so each sentence is written once.
  function isCrippled(rec, res) { var ht = res ? res.hull_threshold : null; return ht != null && (rec.hull_current || 0) > ht; }
  // R-SECF-6 (card `shipyard-encounter-craft-build`): the ONE strain test, beside the hull one — system strain PAST the
  // threshold (EotE p.242–243). Condition's tracker, SheetFace's SYSTEMS DOWN stamp and the bench's craft track call it.
  function isSystemsDown(rec, res) { var st = res ? res.strain_threshold : null; return st != null && (rec.strain_current || 0) > st; }
  function CripLine(props) {
    return el('p', { className: 'y-e-t' }, 'Hull trauma is past ' + props.ht + ': the ship takes a Critical Hit, its systems shut down and it drifts. ', el(Cite, null, SHIP_RULE.crippled));
  }
  function LostLine(props) { return el('span', { className: 'y-mono' }, stampOf(props.when) + ' · RECORD KEPT'); }
  function CraftCond(props) {
    var rec = props.rec;
    if (rec.destroyed) return el('span', { className: 'y-row' }, el(Stamp, { k: 'lost' }, 'LOST'), el(LostLine, { when: rec.destroyed.when }));
    return el(Cond, { rec: rec, res: props.res });
  }
  function FleetList(props) {
    var p = props, rows = p.members;
    if (p.band === 'wide') {
      return el('div', { className: 'y-sec' }, p.lead || null,
        el('table', { className: 'y-tbl', 'data-testid': 'yard-fleet' },
          el('thead', null, el('tr', null, el('th', null, 'CRAFT'), el('th', null, 'CONDITION'), el('th', null, 'PILOT'))),
          el('tbody', { className: 'hp-bands' }, rows.map(function (m) {
            return el('tr', { key: m.rec.id, 'data-lost': m.rec.destroyed ? '1' : undefined, 'data-vessel': m.rec.id, 'data-testid': 'yard-craft' },
              el('td', null, el('button', { type: 'button', className: 'y-row', style: { flexWrap: 'nowrap', textAlign: 'left' }, onClick: function () { p.onOpenShip(m.rec.id); } },
                el(Art, { rec: m.rec, vrow: m.vrow, host: 'unit-fleet', cls: 'y-thumb', schem: 24, alt: shipName(m.rec, m.vrow) }),
                el('div', null, el('div', { className: 'y-e-n' }, String(shipName(m.rec, m.vrow)).toUpperCase()), el('div', { className: 'y-mono' }, m.vrow ? m.vrow.name : m.rec.vehicleKey)))),
              el('td', null, el(CraftCond, { rec: m.rec, res: m.res })),
              el('td', null, el(Pilot, { rec: m.rec, vrow: m.vrow, unit: p.unit, reg: p.reg, roster: p.roster, ctx: p.ctx, withPool: p.withPool, portraitFor: p.portraitFor })));
          }))));
    }
    return el('div', { className: 'y-sec', 'data-testid': 'yard-fleet' }, p.lead || null, el('div', { className: 'hp-bands', 'data-run': '1' }, rows.map(function (m) {
      var isLead = p.unit && p.unit.leader && p.unit.leader.vessel === m.rec.id;
      return el('article', { key: m.rec.id, className: 'y-ship', 'data-lost': m.rec.destroyed ? '1' : undefined, 'data-vessel': m.rec.id, 'data-testid': 'yard-craft',
          style: { gridTemplateColumns: '92px minmax(0,1fr)' } },
        el('button', { type: 'button', 'aria-label': 'Open ' + shipName(m.rec, m.vrow), onClick: function () { p.onOpenShip(m.rec.id); }, style: { display: 'contents' } },
          el(Art, { rec: m.rec, vrow: m.vrow, host: 'unit-fleet', cls: 'y-mat', style: { width: 92, height: 62 }, schem: 36, alt: shipName(m.rec, m.vrow) })),
        el('div', { className: 'y-ship-body' },
          el('div', { className: 'y-row' }, el('h3', { className: 'y-ship-n', style: { fontSize: 14 } }, String(shipName(m.rec, m.vrow)).toUpperCase()), isLead ? el(Stamp, { k: 'unit' }, 'LEADER') : null),
          el(CraftCond, { rec: m.rec, res: m.res }),
          el(Pilot, { rec: m.rec, vrow: m.vrow, unit: p.unit, reg: p.reg, roster: p.roster, ctx: p.ctx, withPool: p.withPool, portraitFor: p.portraitFor })));
    })));
  }
  function FlagshipPlate(props) {
    var rec = props.rec, vrow = props.vrow, res = props.res, wide = props.wide;
    var cmd = (rec.crew || []).filter(function (c) { return c.role === 'commander'; })[0];
    var cw = cmd ? whoOf(cmd.who, props.reg, props.roster) : null;
    var dice = cmd ? seatDice(cmd.who, 'commander', rec, vrow, props.ctx, props.reg) : null;
    return el('article', { className: 'y-plate y-lift', 'data-testid': 'yard-flagship', 'data-vessel': rec.id,
        style: { display: 'grid', gridTemplateColumns: wide ? '300px minmax(0,1fr)' : '1fr' } },
      el(Art, { rec: rec, vrow: vrow, host: 'unit-flagship', cls: 'y-mat', style: { height: wide ? 200 : 180 }, schem: wide ? 150 : 130, alt: shipName(rec, vrow) }),
      el('div', { className: 'y-hero-body' },
        el('div', { className: 'y-row' }, el('button', { type: 'button', onClick: props.onOpen, style: { textAlign: 'left' } }, el('h3', { className: 'y-ship-n', style: { fontSize: 19 } }, String(shipName(rec, vrow)).toUpperCase())), el(Stamp, { k: 'flag' }, 'FLAGSHIP')),
        el('span', { className: 'y-ship-t' }, 'SILHOUETTE ' + (res && res.silhouette != null ? res.silhouette : '—') + (props.unit ? ' · UNIT · ' + String(props.unit.name).toUpperCase() : '')),
        el(Cond, { rec: rec, res: res, both: true }),
        cmd ? el('div', { className: 'y-row' }, el('span', { className: 'y-seat' }, 'COMMANDER · ', el('b', null, (cw && cw.name) || '—')), dice ? el(PoolRow, { dice: dice, id: 'commander.' + rec.id }) : null, dice && dice.held ? el(UpHeld) : null) : null,
        crewLine(vrow) ? el('p', { className: 'y-canon' }, 'Crew of record: ', el('q', null, crewLine(vrow))) : null));
  }

  // ── H4 · the GM's owner picker (a panel under the chip at 1440, a bottom sheet at 390) ──
  // U7 (`shipyard-s4-approvals` R-S4A-1): the same picker on the player's host — `charsOnly`: this device's characters
  // alone, each with portrait, name and career, the current one marked; the phone sheet takes `title` ("WHOSE HANGAR"
  // from the chip, "Whose ship?" from GIVE TO… and the add doors), the desk panel has none, as H4's. F4-PARTY (CREW's
  // ＋ FROM THE PARTY) takes `titled` (the desk panel titled too, "<ROLE> · FROM THE PARTY"), `top` (its desk offset) and `tid`.
  function OwnerPicker(props) {
    var p = props, wide = p.band === 'wide';
    var cur = p.owner;
    function row(key, label, sub, face) {
      var on = cur === key;
      return el('button', { key: key, type: 'button', role: 'option', 'aria-selected': on, className: 'y-door', 'data-owner': key,
          onClick: function () { p.onPick(key); } },
        el('span', { className: 'y-who' }, face || null, el('span', null, el('span', { className: 'y-who-n' }, label), sub ? el('br') : null, sub ? el('span', { className: 'y-who-m' }, sub) : null)),
        on ? el('span', { className: 'y-mono y-inkstate' }, 'SHOWN') : null);
    }
    var npcKeys = [];
    (p.vessels || []).forEach(function (r) { if (/^npc:/.test(r.owner) && npcKeys.indexOf(r.owner) === -1) npcKeys.push(r.owner); });
    if (/^npc:/.test(cur) && npcKeys.indexOf(cur) === -1) npcKeys.push(cur);
    var list = p.charsOnly ? el('div', { role: 'listbox', 'aria-label': p.title || 'Whose hangar', 'data-testid': 'yard-owner-list' },
      (p.roster || []).map(function (c, i) {
        var r = row('char:' + c.id, c.name, c.career || null, el(Face, { rec: c, portraitFor: p.portraitFor }));
        return i ? r : React.cloneElement(r, { style: { borderTop: 0 } });
      }))
      : el('div', { role: 'listbox', 'aria-label': 'Owner', 'data-testid': 'yard-owner-list' },
      el('div', { className: 'y-br-g', style: { marginTop: 0 } }, 'PARTY'),
      el('div', { style: { borderTop: 0 } }, row('party', 'THE PARTY', null, null)),
      (p.roster || []).length ? el('div', { className: 'y-br-g' }, 'CHARACTERS') : null,
      (p.roster || []).map(function (c) { return row('char:' + c.id, c.name, c.career || null, el(Face, { rec: c, portraitFor: p.portraitFor })); }),
      el('div', { className: 'y-br-g' }, 'NPCS'),
      npcKeys.map(function (k) { var w = whoOf(k, p.reg, null) || {}; return row(k, w.name || k.slice(4), 'NPC' + (w.src ? ' · ' + w.src : ''), el(NpcMark)); }),
      // "＋ AN NPC FROM THE LIBRARY": drawn, but no frame draws where it goes — inert until one does (listed at the gate).
      el('div', { className: 'y-door' }, el('span', { className: 'y-link', 'aria-disabled': 'true', 'data-undrawn': '1' }, '＋ AN NPC FROM THE LIBRARY')),
      // U2: the ships whose owner this device does not know, counted after the owners H4 draws. F4-NOOWNER: a door —
      // choosing it scopes the GM's hangar to NO OWNER (the U2 group, each ship with GIVE TO…), the chip reading NO OWNER
      p.orphans ? el('button', { type: 'button', role: 'option', 'aria-selected': cur === NO_OWNER, className: 'y-door', style: { borderTop: '1px solid var(--doc-rule)' },
          'data-testid': 'yard-owner-orphans', 'data-owner': NO_OWNER, onClick: function () { p.onPick(NO_OWNER); } },
        el('span', { className: 'y-door-n' }, 'NO OWNER (' + p.orphans + ')'), cur === NO_OWNER ? el('span', { className: 'y-mono y-inkstate' }, 'SHOWN') : null) : null);
    var tid = p.tid || 'yard-owner-picker';
    if (wide) return el('div', { className: 'y-plate y-lift', 'data-testid': tid,
        style: { position: 'absolute', top: p.top != null ? p.top : 4, left: '50%', width: 420, transform: 'translateX(-50%)', zIndex: 6 } },
      el('div', { style: { padding: '14px 18px 10px' } }, p.titled ? el('div', { className: 'y-e-n', style: { marginBottom: 10 } }, p.title) : null, list));
    return el(YHeldWrap, { onClose: p.onClose, attrs: { 'data-testid': tid } },
      el('div', { className: 'y-scrim', onClick: p.onClose }),
      el('div', { className: 'y-sheet', style: { overflow: 'auto' } }, el('div', { className: 'y-grab' }), el('div', { className: 'y-e-n', style: { marginBottom: 10 } }, p.title || 'WHOSE HANGAR'), list));
  }
  // THE YARD'S SHEET OVER ITS SCRIM (the owner picker's phone face, the trade, fit and build sheets, the catalogue's sort and
  // filter sheets): the same `y-scrimwrap` they each drew. B-1825/B-1826 (ADDENDUM 631): it holds focus — in to its first
  // control, Tab kept inside, back to the door at close — and Escape is the close its scrim calls. Called as a component,
  // so a host that draws its sheet from a plain function (CatalogueIndex) still holds it.
  function YHeldWrap(props) {
    var ref = React.useRef(null), UI = window.SWRPGUI;
    UI.useHoldFocus(ref, true);
    UI.useEscape(true, props.onClose);
    return el('div', Object.assign({ className: 'y-scrimwrap', ref: ref }, props.attrs || {}), props.children);
  }
  // U7 on the player's host: the picker in a layer over whichever room shows (the hangar's floor or the catalogue),
  // a bottom sheet at the phone's band and a panel under the chip at the desk's; a tap outside the panel closes it.
  function PickerLayer(props) {
    var band = useYdBand(), wide = band === 'wide';
    var picker = el(OwnerPicker, Object.assign({}, props, { band: band, charsOnly: true }));
    return el('div', { className: 'yd yd-over', 'data-doc-ground': 'creator', 'data-testid': 'yard-picker-layer', onClick: wide ? props.onClose : undefined },
      wide ? el('div', { onClick: function (e) { e.stopPropagation(); } }, picker) : picker);
  }
  // F4-NOOWNER: the GM's hangar scope for NO OWNER — a scope only (the owner picker's and the chip's), never written to a record
  var NO_OWNER = 'noowner';
  // U2 · NO OWNER: a ship on this device whose owner the device does not know — saved before a character was chosen
  // (the legacy 'char:player'), or whose character is gone. The party's and the NPCs' ships always have an owner.
  function isOrphan(rec, roster) {
    var o = String((rec && rec.owner) || '');
    if (o === 'party' || /^npc:/.test(o)) return false;
    // R-SEC-3 (card `shipyard-encounter-craft-build`): an encounter's craft (`bench:<groupId>`, minted on its first mark) is
    // the bench's, not the GM's fleet — never NO OWNER. The one exclusion point: every forOwner list names its owner.
    if (/^bench:/.test(o)) return false;
    if (!/^char:/.test(o)) return true;   // no owner at all
    var id = o.slice(5);
    return !(roster || []).some(function (c) { return c && String(c.id) === id; });
  }

  // ── THE HANGAR ROOM (H1–H5) and THE UNIT PAGE (U1) ──
  // props: host 'player'|'gm' · route · owner (the scope: 'char:<id>' | 'party' | 'npc:<key>', null = none chosen)
  //        character (player: the scoped character's record) · roster (this device's characters) · ctx (the host's
  //        resolver context, the host's `yardResolveCtx`) · getVehicle(key) · portraitFor(char)
  //        · nav(route) · pickerOpen / onPickOwner / onClosePicker (GM, H4)
  function YardHangar(props) {
    var VS = window.SWRPGVessels, R = VR();
    var reg = useYdRegistries();
    var attLoad = useYdAttachmentsLoad(), attById = attLoad.by;
    var weaponsById = useYdWeapons();
    var units = useYdUnits();
    var band = useYdBand();
    var state = VS ? VS.useVessels() : { vessels: [] };
    if (VS && VS.useFrames) VS.useFrames();   // S8 (R-S8B-4): a built ship's card re-reads its frame once the registry arrives
    var TV = window.SWRPGTalentView;
    if (TV && TV.useTalentViewEpoch) TV.useTalentViewEpoch();   // A3-2: an own-pack edit re-renders the room, so a character's seat dice move (B-844)
    var segSt = React.useState(null), seg = segSt[0], setSeg = segSt[1];
    var giveSt = React.useState(null), giveId = giveSt[0], setGiveId = giveSt[1];   // U2: the ship GIVE TO… is choosing for
    var host = props.host, owner = props.owner;
    // B-1015: `attachments: null` while the parts list is missing, so a card whose ship has a part fitted HOLDS its thresholds
    // ("—", R-S4CC-6); a bare ship's card is as always. WB5's words sit once under the face's lead when any card on it holds:
    // `held.any` is filled by view() in this body and read by HangarWords, which renders after it (a child of the Mast).
    var ctx = { resolve: Object.assign({}, props.ctx || {}, { attachments: attById || null, weapons: weaponsById }), roster: props.roster || [], charPool: props.charPool || null };
    var byId = {}, held = { any: false };
    (state.vessels || []).forEach(function (r) { byId[r.id] = r; });
    function view(rec) {
      var vrow = vehicleOf(rec, props.getVehicle);
      var res = vrow && R ? R.resolve(rec, vrow, ctx.resolve) : null;
      if (heldOf(res)) held.any = true;
      return { rec: rec, vrow: vrow, res: res };
    }
    var hw = el(HangarWords, { held: held, err: attLoad.err });
    // S8 (R-S8B-9; frames v3 B-door): the Hangar header's door to BUILD A SHIP, on every hangar face but a unit's page
    var bdoor = el('button', { type: 'button', className: 'y-commit y8-door', 'data-testid': 'hangar-build', onClick: function () { props.nav({ room: 'build' }); } }, 'BUILD A SHIP');
    function openShip(id, tab) { props.nav({ room: 'ship', id: id, tab: tab || null }); }
    function openUnit(id) { props.nav({ room: 'unit', id: id }); }
    var common = { reg: reg, roster: props.roster, ctx: ctx, portraitFor: props.portraitFor };
    var wide = band === 'wide';
    var rootCls = 'yd y-' + band;
    var orphans = (state.vessels || []).filter(function (r) { return isActive(r) && isOrphan(r, props.roster); });
    var picker = host === 'gm' && props.pickerOpen ? el(OwnerPicker, { band: band, owner: owner, roster: props.roster, reg: reg, vessels: state.vessels,
      portraitFor: props.portraitFor, onPick: props.onPickOwner, onClose: props.onClosePicker, orphans: orphans.length }) : null;
    // the room scrolls inside `.yd-scroll`; the phone's owner sheet stands over it (never over the bars, which
    // live outside the screen layer), on the same ground with no second copy of the wear.
    // U2's GIVE TO…: U7's picker titled "Whose ship?"; choosing writes the owner (updateVessel), and the ship leaves NO OWNER
    var givePicker = giveId && (host === 'player' || owner === NO_OWNER) ? el(PickerLayer, { roster: props.roster, owner: null, portraitFor: props.portraitFor, title: 'Whose ship?',
      onClose: function () { setGiveId(null); },
      onPick: function (key) { var id = giveId; setGiveId(null); VS.apply(function (s) { return VS.updateVessel(s, id, { owner: key }, new Date().toISOString().slice(0, 10)); }); } }) : null;
    // R-S4CC-27 (ADDENDUM 14): a Yard face that offers a write carries S3's banner and REFRESH at its top while the store is
    // stale, placed as U4 places it (the V face's `hold`): the banner, then everything below held. The HANGAR (U2's GIVE TO…,
    // MARK, the add doors) and the unit page are such faces; not-found offers none.
    var stale = !!(VS && VS.isStale && VS.isStale()), UI = window.SWRPGUI;
    function root(children, testid) {
      if (stale && testid !== 'notfound' && UI && UI.StaleHold) {
        children = [el('div', { key: 'stale-banner', style: { marginBottom: 12 } }, el(UI.StaleTabBanner, { paper: true })),
          el('div', { key: 'stale-held', className: 'y-held' }, el(UI.StaleHold, { held: true }, children))];
      }
      return el('div', { className: 'yd-host', 'data-testid': 'yard-s4', 'data-yard-room': testid, 'data-band': band, 'data-stale': stale ? 1 : undefined },
        el('div', { className: 'yd-scroll' },
          el('div', { className: rootCls, 'data-doc-ground': 'creator' }, el('div', { className: 'y-main' }, children), wide ? picker : null)),
        !wide && picker ? el('div', { className: 'yd yd-over', 'data-doc-ground': 'creator' }, picker) : null,
        givePicker);
    }
    function unitOf(id) { return units.filter(function (u) { return u.members.indexOf(id) !== -1 || u.flagship === id; })[0] || null; }

    // ── U1 · THE UNIT PAGE ──
    if (props.route && props.route.room === 'unit') {
      var unit = units.filter(function (u) { return u.id === props.route.id; })[0];
      if (!unit) return root(el(YardNotFound, { what: 'unit', id: props.route.id }), 'notfound');
      var st = unitStats(unit, byId);
      var flag = unit.flagship && byId[unit.flagship] ? view(byId[unit.flagship]) : null;
      var members = st.present.map(view);
      var leadRec = unit.leader && unit.leader.vessel ? byId[unit.leader.vessel] : null;
      var leadWho = unit.leader ? whoOf(unit.leader.who, reg, props.roster) : null;
      var fleetWord = unit.owner === 'party' ? 'THE PARTY’S FLEET' : unit.owner;
      var head = el(React.Fragment, null,
        el('div', { className: 'y-runhead' }, el('span', null, 'UNIT'), el('span', null, fleetWord)),
        el(Mast, { door: bdoor, after: hw, title: String(unit.name).toUpperCase(), stamp: el(Stamp, { k: 'unit' }, 'UNIT') }),
        el('div', { className: 'y-facts y-mt' },
          flag ? el('span', { className: 'y-seat' }, 'FLAGSHIP · ', el('b', null, flag.vrow ? flag.vrow.name : flag.rec.vehicleKey)) : null,
          leadWho ? el('span', { className: 'y-seat' }, 'LEADER · ', el('b', null, leadWho.name || '—'), leadRec ? ' · ' + String(shipName(leadRec, null)).toUpperCase() : '') : null));
      var craft = el(React.Fragment, null,
        el(Sech, { h: 'CRAFT', x: st.inService.length + ' IN SERVICE · ' + st.lost.length + ' LOST' }),
        el(FleetList, Object.assign({ band: band, members: members, unit: unit, withPool: true, onOpenShip: openShip }, common)));
      var flagBlock = flag ? el(React.Fragment, null, el(Sech, { h: 'FLAGSHIP' }),
        el(FlagshipPlate, Object.assign({ rec: flag.rec, vrow: flag.vrow, res: flag.res, wide: false, onOpen: function () { openShip(flag.rec.id); } }, common))) : null;
      // AFTER THE LOSS — one block per lost craft. RE-FORM and ＋ A CRAFT write K5, and no frame draws either
      // flow: both are inert (aria-disabled) until one does (listed at the gate; U1's verbs are the frame's).
      var loss = st.lost.length ? el(React.Fragment, null, el(Sech, { h: 'AFTER THE LOSS' }),
        st.lost.map(function (r) {
          var nm = shipName(r, vehicleOf(r, props.getVehicle));
          return el('div', { key: r.id, className: 'y-plate', style: { padding: '14px 16px' }, 'data-testid': 'yard-after-loss' },
            el('div', { className: 'y-row' }, el('span', { className: 'y-e-n' }, String(nm).toUpperCase()), el(Stamp, { k: 'lost' }, 'LOST'), el('span', { className: 'y-mono' }, stampOf(r.destroyed.when))),
            el('div', { className: 'y-verbs' },
              el('button', { type: 'button', className: 'y-commit', 'aria-disabled': 'true', 'data-undrawn': '1' }, 'CHANGE THE UNIT'),
              el('button', { type: 'button', className: 'y-quiet', 'aria-disabled': 'true', 'data-undrawn': '1' }, '＋ A CRAFT FROM THE HANGAR')));
        })) : null;
      var main = wide
        ? el(React.Fragment, null, head, el('div', { className: 'y-grid2', style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' } },
            el('div', null, craft), el('div', null, flagBlock, loss)))
        : el(React.Fragment, null, head, craft, flagBlock, loss);
      return root(main, 'unit');
    }

    // ── THE FLOOR ──
    var all = state.vessels || [];
    var own = owner ? VS.forOwner(state, owner) : [];
    var partyRecs = host === 'player' ? VS.forOwner(state, 'party') : [];
    var charId = owner && /^char:/.test(owner) ? owner.slice(5) : null;
    var ownerUnits = units.filter(function (u) { return u.owner === owner; });
    var partyUnits = host === 'player' ? units.filter(function (u) { return u.owner === 'party'; }) : [];
    // B2 (D-27, R-S4CAT-3): on the player's device the party's ship shows where its record is here, and one honest line
    // (R-S3K-8) elsewhere. The line never makes the floor "something": on a device with nothing else here H5 stands, as
    // approved — each frame in the state Jason saw it in (ruling `shipyard-s5-ready` R-S5R-1).
    var nothing = !own.length && !partyRecs.length && !partyUnits.length && !((host === 'player' || owner === NO_OWNER) && orphans.length);   // U2: NO OWNER is something
    var partyLine = host === 'player' && !partyRecs.length && !nothing;

    // H5 · the empty floor — nothing is owned, and nothing of the party's is on this device
    if (nothing) {
      return root(el(React.Fragment, null, el(Mast, { door: bdoor, after: hw }),
        el('div', { className: 'y-empty y-sec', style: { marginTop: 22 }, 'data-testid': 'yard-empty' },
          el('div', { className: 'y-empty-h' }, 'NO SHIPS YET'),
          el('button', { type: 'button', className: 'y-commit', 'data-testid': 'yard-open-catalogue', onClick: function () { props.nav({ room: 'catalogue' }); } }, 'OPEN THE CATALOGUE'))), 'empty');
    }
    var defSeg = host === 'gm' && owner === 'party' ? 'unit' : 'ship';
    var cur = seg || defSeg;
    var segBar = el('div', { className: 'y-seg', role: 'tablist', 'data-testid': 'yard-seg' }, [['ship', 'BY SHIP'], ['unit', 'BY UNIT'], ['history', 'HISTORY']].map(function (s) {
      return el('button', { key: s[0], type: 'button', className: 'y-seg-b', role: 'tab', 'aria-selected': s[0] === cur, 'data-on': s[0] === cur ? 1 : 0, 'data-seg': s[0],
        onClick: function () { setSeg(s[0]); } }, s[1]);
    }));
    var ownerName = (function () {
      if (owner === 'party') return 'THE PARTY';
      if (groupName(owner)) return groupName(owner);
      var w = owner ? whoOf(owner, reg, props.roster) : null;
      return w && w.name ? w.name : '';
    })();
    var possessive = function (n) { return String(n) + '’s'; };
    // U2's group: the ships whose owner this device does not know, each with GIVE TO… (U7's picker, "Whose ship?")
    function noOwner() {
      return orphans.length ? el(React.Fragment, null, el(Sech, { h: 'NO OWNER' }),
        el('div', { className: 'y-shiprow', 'data-testid': 'yard-no-owner' }, orphans.map(view).map(function (v) {
          return el(OrphanRow, { key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band, onGive: function () { setGiveId(v.rec.id); } });
        }))) : null;
    }
    var partyLineEl = el('p', { className: 'y-logline', 'data-testid': 'yard-party-line' }, el('i', null, 'THE PARTY’S SHIP'), ' · The GM keeps it, and it isn’t on this device.');

    // H3 · HISTORY
    if (cur === 'history') {
      var gone = function (list) { return list.filter(function (r) { return !isActive(r); }).map(view); };
      var npcName = /^npc:/.test(owner || '') ? ownerName : null;
      var histCard = function (v) {
        var rows = logRows(v.rec, reg, npcName, attById);
        var pilot = (v.rec.crew || []).filter(function (c) { return c.role === 'pilot'; })[0];
        var pw = pilot && v.rec.destroyed ? whoOf(pilot.who, reg, props.roster) : null;
        // the frames draw three rows at most: the ACQUIRED line and the two most recent after it
        var shown = rows.length > 3 ? [rows[0]].concat(rows.slice(-2)) : rows;
        return el(ShipRow, Object.assign({ key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band, noCond: true,
          stamp: v.rec.destroyed ? el(Stamp, { k: 'lost' }, 'LOST') : el(Stamp, { k: 'retired' }, 'RETIRED'),
          left: pw ? el('span', { className: 'y-seat' }, 'PILOT · ', el('b', null, pw.name || '—')) : null,
          right: el(LogBlock, { rows: shown, onRead: function () { openShip(v.rec.id, 'log'); } }),
          onOpen: function () { openShip(v.rec.id); } }, common));
      };
      var mineGone = gone(own), partyGone = gone(partyRecs);
      return root(el(React.Fragment, null,
        el(Mast, { door: bdoor, after: hw }), segBar,
        mineGone.length ? el(React.Fragment, null, el(Sech, { h: host === 'gm' && owner === 'party' ? 'THE PARTY’S SHIPS' : 'YOUR SHIPS' }), el('div', { className: 'y-shiprow' }, mineGone.map(histCard))) : null,
        partyGone.length ? el(React.Fragment, null, el(Sech, { h: 'THE PARTY’S SHIPS' }), el('div', { className: 'y-shiprow' }, partyGone.map(histCard)))
          : (partyLine ? el(React.Fragment, null, el(Sech, { h: 'THE PARTY’S SHIPS' }), partyLineEl) : null)), 'history');
    }

    // H2 · BY UNIT (the fleet list)
    if (cur === 'unit') {
      var list = own.filter(isActive);
      var inUnit = {};
      var blocks = ownerUnits.map(function (u) {
        var st2 = unitStats(u, byId);
        u.members.forEach(function (id) { inUnit[id] = true; });
        if (u.flagship) inUnit[u.flagship] = true;
        var f = u.flagship && byId[u.flagship] ? view(byId[u.flagship]) : null;
        var lw = u.leader ? whoOf(u.leader.who, reg, props.roster) : null;
        var lr = u.leader && u.leader.vessel ? byId[u.leader.vessel] : null;
        var lead = el('div', { className: 'y-row', style: { margin: '0 0 8px' } },
          lw ? el('span', { className: 'y-seat' }, 'LEADER · ', el('b', null, lw.name || '—'), lr ? ' · ' + String(shipName(lr, null)).toUpperCase() : '') : null,
          el('button', { type: 'button', className: 'y-sp y-link', 'data-testid': 'yard-open-unit', onClick: function () { openUnit(u.id); } }, 'OPEN THE SHIP ›'));
        return el(React.Fragment, { key: u.id },
          f ? el(React.Fragment, null, el(Sech, { h: 'FLAGSHIP' }), el(FlagshipPlate, Object.assign({ rec: f.rec, vrow: f.vrow, res: f.res, wide: wide, unit: u, onOpen: function () { openShip(f.rec.id); } }, common))) : null,
          el(Sech, { h: 'UNIT · ' + String(u.name).toUpperCase(), x: st2.present.length + ' CRAFT · ' + st2.lost.length + ' LOST' }),
          el(FleetList, Object.assign({ band: band, members: st2.present.map(view), unit: u, withPool: false, lead: lead, onOpenShip: openShip }, common)));
      });
      var loose = list.filter(function (r) { return !inUnit[r.id]; }).map(view);
      var lead2 = owner === 'party' ? null : (ownerName ? possessive(ownerName) + ' ships.' : null);
      return root(el(React.Fragment, null, el(Mast, { door: bdoor, after: hw, lead: lead2 }), segBar, blocks,
        loose.length ? el(React.Fragment, null, el(Sech, { h: 'IN NO UNIT' }), loose.map(function (v) {
          var p = (v.rec.crew || []).filter(function (c) { return c.role === 'pilot'; })[0];
          var pw = p ? whoOf(p.who, reg, props.roster) : null;
          return el(ShipRow, Object.assign({ key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band,
            stamp: v.rec.owner === 'party' ? el(Stamp, { k: 'party' }, 'THE PARTY’S SHIP') : null,
            right: el(React.Fragment, null, pw ? el('span', { className: 'y-seat' }, 'PILOT · ', el('b', null, pw.name || '—')) : null, el(LastCrit, { rec: v.rec, reg: reg })),
            onOpen: function () { openShip(v.rec.id); } }, common));
        })) : null), 'unit-floor');
    }

    // H1 · BY SHIP (player) / H4 · BY SHIP under the GM's chosen owner
    var active = own.filter(isActive).map(view);
    if (host === 'player') {
      var charRec = props.character;
      var bond = charRec && R ? R.resolveBond(charRec, state) : null;
      var mineFirst = active.slice().sort(function (a, b) { return (bond && a.rec.id === bond.id ? -1 : 0) - (bond && b.rec.id === bond.id ? -1 : 0); });
      var seatOf = function (rec) { var s = (rec.crew || []).filter(function (c) { return c.who === 'char:' + charId; })[0]; return s ? s.role : null; };
      // a craft flying in one of the party's units is the fleet door's, not a party ship of its own (H1 draws the
      // Wayward Sun here and RED SQUADRON as one door)
      var inPartyUnit = {};
      partyUnits.forEach(function (u) { u.members.forEach(function (id) { inPartyUnit[id] = true; }); if (u.flagship) inPartyUnit[u.flagship] = true; });
      var partyActive = partyRecs.filter(function (r) { return isActive(r) && !inPartyUnit[r.id]; }).map(view);
      return root(el(React.Fragment, null,
        el(Mast, { door: bdoor, after: hw }), segBar,
        mineFirst.length ? el(React.Fragment, null, el(Sech, { h: 'YOUR SHIP' }), el('div', { className: 'y-shiprow' }, mineFirst.map(function (v) {
          if (bond && v.rec.id === bond.id) return el(HeroPlate, Object.assign({ key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band, bond: true,
            seat: seatOf(v.rec), unit: unitOf(v.rec.id), onOpen: function () { openShip(v.rec.id); } }, common));
          return el(ShipRow, Object.assign({ key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band,
            right: el(React.Fragment, null, seatOf(v.rec) ? el('span', { className: 'y-seat' }, 'YOUR SEAT · ', el('b', null, roleWord(seatOf(v.rec)))) : null, el(LastCrit, { rec: v.rec, reg: reg })),
            onOpen: function () { openShip(v.rec.id); } }, common));
        }))) : null,
        partyActive.length ? el(React.Fragment, null, el(Sech, { h: 'THE PARTY’S SHIP' }), el('div', { className: 'y-shiprow' }, partyActive.map(function (v) {
          return el(ShipRow, Object.assign({ key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band, stamp: el(Stamp, { k: 'party' }, 'THE PARTY’S SHIP'),
            right: el(React.Fragment, null,
              seatOf(v.rec) ? el('span', { className: 'y-seat' }, 'YOUR SEAT · ', el('b', null, roleWord(seatOf(v.rec)))) : null,
              el('span', { className: 'y-mono' }, 'KEPT BY THE GM · YOU READ IT AND USE YOUR SEAT'),
              el(LastCrit, { rec: v.rec, reg: reg })),
            onOpen: function () { openShip(v.rec.id); } }, common));
        }))) : (partyLine ? el(React.Fragment, null, el(Sech, { h: 'THE PARTY’S SHIP' }), partyLineEl) : null),
        (partyUnits.length && !partyLine) ? el(React.Fragment, null, el(Sech, { h: 'THE PARTY’S FLEET' }), el('div', { className: 'y-shiprow' }, partyUnits.map(function (u) {
          var s3 = unitStats(u, byId);
          var f = u.flagship && byId[u.flagship] ? view(byId[u.flagship]) : null;
          return el('button', { key: u.id, type: 'button', className: 'y-door y-sec', 'aria-label': 'Open the party’s fleet by unit', 'data-testid': 'yard-fleet-door', onClick: function () { openUnit(u.id); } },
            el('span', null, el('span', { className: 'y-door-n' }, String(u.name).toUpperCase()), ' ', el(Stamp, { k: 'unit' }, 'UNIT'), el('br'),
              el('span', { className: 'y-door-m' }, (f ? 'FLAGSHIP · ' + (f.vrow ? f.vrow.name : f.rec.vehicleKey) + ' · ' : '') + s3.present.length + ' CRAFT · ' + s3.lost.length + ' LOST')),
            el('span', { className: 'y-chev' }, '›'));
        }))) : null,
        noOwner()), 'ship-floor');
    }
    // F4-NOOWNER (H4 · GM host): NO OWNER chosen in the owner picker — the floor is U2's group, as the player's floor draws it
    if (owner === NO_OWNER) return root(el(React.Fragment, null, el(Mast, { door: bdoor, after: hw }), segBar, noOwner()), 'ship-floor');
    // GM · BY SHIP under the chosen owner (H4 draws an NPC owner; the other owners take the same arrangement)
    var npcOwner = /^npc:/.test(owner || '');
    var lead4 = npcOwner ? null
      : owner === 'party' ? null : (ownerName ? possessive(ownerName) + ' ships.' : null);
    return root(el(React.Fragment, null, el(Mast, { door: bdoor, after: hw, lead: lead4 }), segBar,
      active.length ? el(React.Fragment, null, el(Sech, { h: owner === 'party' ? 'THE PARTY’S SHIPS' : String(possessive(ownerName)).toUpperCase() + ' SHIPS' }),
        el('div', { className: 'y-shiprow' }, active.map(function (v) {
          var p = (v.rec.crew || []).filter(function (c) { return c.role === 'pilot'; })[0];
          var pw = p ? whoOf(p.who, reg, props.roster) : null;
          var acq = VS.acquiredLine ? VS.acquiredLine(v.rec, { npcName: npcOwner ? ownerName : null }) : null;
          return el(ShipRow, Object.assign({ key: v.rec.id, rec: v.rec, vrow: v.vrow, res: v.res, band: band,
            stamp: npcOwner ? el(Stamp, { k: 'party' }, 'NPC’S SHIP') : owner === 'party' ? el(Stamp, { k: 'party' }, 'THE PARTY’S SHIP') : null,
            right: el(React.Fragment, null,
              pw ? el('span', { className: 'y-seat' }, 'PILOT · ', el('b', null, pw.name || '—'), pw.kind === 'npc' ? ' · NPC · ' + (pw.tier || '') : '') : null,
              acq && acq.text ? el('p', { className: 'y-logline', 'data-testid': 'yard-acquired' }, el('i', null, 'ACQUIRED'), ' · ' + acq.text) : null),
            onOpen: function () { openShip(v.rec.id); } }, common));
        }))) : null), 'ship-floor');
  }

  // An unknown or tombstoned id renders HERE, in the room (K6), never the landing. Copy: the old YardEntry's
  // not-found (deleted at the S5 flip, R-S5R-18), kept as the one not-found the Yard speaks, on the paper plate.
  function YardNotFound(props) {
    var what = props.what === 'unit' ? 'unit' : props.what === 'ship' ? 'ship' : 'page';
    return el('div', { className: 'y-empty y-sec', style: { marginTop: 22 }, 'data-testid': 'yard-notfound', 'data-what': what },
      el('div', { className: 'y-empty-h' }, 'Entry not found'),
      el('p', null, props.id != null ? 'No ' + what + ' on this device for “' + props.id + '”.' : 'No page in the Shipyard at this address.'));
  }
  // the not-found room on its own (a route the grammar refuses, or a ship id the store does not hold)
  function YardNotFoundRoom(props) {
    return el('div', { className: 'yd-host', 'data-testid': 'yard-s4', 'data-yard-room': 'notfound' },
      el('div', { className: 'yd-scroll' },
        el('div', { className: 'yd y-narrow', 'data-doc-ground': 'creator' }, el('div', { className: 'y-main' }, el(YardNotFound, props)))));
  }

  // THE CHARACTERS SAVED ON THIS DEVICE, read only (`swrpg_saved_characters`, both of its shapes), for faces that
  // must name or weigh another character (H4's picker on the GM host; MARK's held refusal on the sheet). It never
  // migrates and never writes — the roster's owner is the player app's loader.
  function readDeviceRoster() {
    try {
      var raw = JSON.parse(window.localStorage.getItem('swrpg_saved_characters') || 'null');
      var list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.characters) ? raw.characters : []);
      return list.filter(function (c) { return c && c.id != null; });
    } catch (e) { return []; }
  }

  // B-1067 · F2 (ruling `shipyard-s5-ready` R-S5R-2): THE ONE RESOLVER-CONTEXT BUILDER, both hosts, every call site. The
  // resolver (lib/shared/vesselResolve.js `ctx.characters`) sees every character saved on THIS device — the roster read above,
  // the `swrpg_saved_characters` key both apps share on one origin — plus the scoped character(s) the face holds (a sheet's
  // live record, an unsaved one), de-duplicated by id with the scoped first: its live sheet beats its saved copy. So one ship
  // prints one number on every face of the device (the Yard on either host, the sheet's VESSELS). A holder saved only on
  // another device is not here, and every face then agrees without the holder's effect. Talent ranks come through the ONE
  // projection (CharResolve.talentsFromOwnedPositions, R-S3CR-1), read at call time; {} before the charbuild is loaded.
  // R-S5R-17 (ruling `shipyard-s5-ready` ADDENDUM 7; the B-984 class's third reader): the trees a character's positions are
  // read against are ITS OWN — its stamp view first (CR.talentViewFor(sheet), f100-m5 C4.1, as skillCharacteristicsOf and
  // collectPoolMods read), else the device's discovery view, else the pristine base (ADDENDUM 3's step: a pack save or a
  // toggle nulls the discovery view and nothing re-loads it under an open face). Disclosed (C4.4's own limit): a stamped
  // pack not on this device, with the discovery view nulled, reads the base's trees.
  // B-1084 (ruling `shipyard-s5-ready` R-S5R-23): the ONE chain, read once per character — its stamp view, else the device's
  // discovery view, else the pristine base — for both its trees (talentRanksOf) and its talent rows (deviceResolveCtx), so a
  // character's ranks and rows always come from the same view.
  function talentChainOf(c, key) {
    try {
      var CR = window.CharResolve, sheet = (c && c.sheetData) || {};
      if (!CR) return null;
      var view = CR.talentViewFor ? CR.talentViewFor(sheet) : null;
      return (view && view[key]) || (window._canonicalCharbuild && window._canonicalCharbuild[key])
        || (window._canonicalCharbuildBase && window._canonicalCharbuildBase[key]) || null;
    } catch (e) { return null; }
  }
  function talentRanksOf(c) {
    var out = {};
    try {
      var CR = window.CharResolve, sheet = (c && c.sheetData) || {};
      if (!CR) return out;
      var specs = talentChainOf(c, 'specializations');
      if (!specs) return out;
      CR.talentsFromOwnedPositions(sheet.specializations || [], specs, sheet.looseTalents)
        .forEach(function (o) { out[o.id] = o.rank; });
    } catch (e) {}
    return out;
  }
  // F-100 M8 (ruling `f100-m8-c8-signature-vehicle` R-M8C8-1, merged with B-1067 by `f100-m8-build` R-M8G-75): the ctx also
  // carries the talent registry (`talentRecords`), the holder's `vehicle_effects` rows, which the resolver HOLDS a holder
  // without. They are read down the same chain talentRanksOf falls back to (the device's discovery view, else the pristine
  // base), so ranks in hand mean rows in hand. B-1084 (R-S5R-23): each character also carries ITS OWN rows (talentChainOf,
  // its stamp view first), which the resolver prefers for the holder; the ctx-level registry stays as the fallback.
  function deviceResolveCtx(scoped) {
    var seen = {}, list = [];
    (scoped || []).concat(readDeviceRoster()).forEach(function (c) {
      if (!c || c.id == null || seen[String(c.id)]) return;
      seen[String(c.id)] = true; list.push(c);
    });
    var cb = window._canonicalCharbuild || window._canonicalCharbuildBase;
    return { characters: list.map(function (c) { return { id: c.id, sheetData: c.sheetData || {}, talents: talentRanksOf(c),
        talentRecords: talentChainOf(c, 'talents') }; }),
      talentRecords: (cb && cb.talents) || null };
  }

  // the scope chip's name for an owner word (the host's top bar): a character's saved name, an NPC's registry
  // name once the registries are here (the floor loads them), else the word itself
  function ownerLabel(owner, roster) {
    if (owner === 'party') return 'PARTY';
    if (groupName(owner)) return upper(groupName(owner));
    if (owner === NO_OWNER) return 'NO OWNER';   // F4-NOOWNER: the chip
    var w = whoOf(owner, _ydReg, roster);
    return String((w && w.name) || (owner ? String(owner).replace(/^(char|npc):/, '') : '')).toUpperCase();
  }

  // the Yard's bar glyphs (the frames' ICON set: build.cjs), one set for both hosts' BottomNav
  function barIcon(k) {
    var p = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true, width: 22, height: 22 };
    if (k === 'hangar') return el('svg', Object.assign({ strokeLinejoin: 'round' }, p), el('path', { d: 'M2 20V10l10-6 10 6v10' }), el('path', { d: 'M6 20v-6h12v6' }), el('path', { d: 'M9 17h6' }));
    if (k === 'catalogue') return el('svg', Object.assign({ strokeLinejoin: 'round' }, p), el('path', { d: 'M4 4h7v16H4z' }), el('path', { d: 'M13 4h7v16h-7z' }), el('path', { d: 'M6 8h3M6 11h3M15 8h3M15 11h3' }));
    return el('svg', p, el('path', { d: 'M3 5h18M3 10h18M3 15h18M3 20h18M8 3v19M15 3v19' }));
  }


  // ══ THE SHIP (SHIP YARD S4 · JOB 3a; ruling `shipyard-s4-collection` §7 order 2, `shipyard-s4-ship-room` R-S4SR-1..4) ══
  // One record, two arrangements (the Moment Split): the SHEET at the table (S1–S3) at `/…/ship/<id>`, with its DECK
  // room (S4–S6) at `/…/ship/<id>/room/deck`, and the WORKBENCH between sessions at `/…/ship/<id>/<tab>` — FIT · CREW ·
  // DOCK · LOG · TRADE · DECK. CREW, DOCK, LOG, TRADE and DECK are W4 W5 W6 W7 W8/W9, and FIT is W1–W3 (JOB 3b retired
  // R-S4SR-3's two interims); the switch opens on FIT (R-S4SR-4). Built to the approved
  // Docs/mockups/shipyard-ship.html (frames_ship.cjs) and the approved states U1 (the picture), U12 (a hull not in the
  // loaded books), U15 with U3 (the player's own ship) and G-10 (every seat the record holds) — `shipyard-s4-approvals`
  // R-S4A-1..3. Numbers from the ONE resolver, words from the registries, every write one of the store's ops.
  // Fixed copy with its printed page (the frames' `rule.*` rows, Docs/RULES_FOUNDATION_VEHICLES.md):
  var SHIP_RULE = {
    crippled: 'EotE p.243', sysdown: 'EotE p.243', angle: 'EotE p.233', angleCap: 4, tohit: 'EotE p.235', tohitTable: 'Table 7-4',
    emergency: 'EotE p.243', emergencyDice: 3, emergencySpeed: 1, emergencyHandling: -3, emergencyCritPlus: 30,
    strainDay: 1, strainDayCite: 'EotE p.243', hullCr: 500, hullCrCite: 'EotE p.245', hullQuarter: 4, sysdownDefense: 0, sysdownSpeed: 0,
    // FIT (E-S1C-2, read at the printed page): installing a part is "a few minutes of uninterrupted work", no check; a
    // MOD is a Hard Mechanics check, +1 difficulty per mod past the first (EotE p.187; R-S4WC-1 A5)
    install: 'EotE p.187', mod: 'EotE p.187', modDice: 3,
    // G-7 · A5: a mod's SUGGESTED price on a ship = modCost × N × modShipX — "each additional mod … costs an additional 100
    // credits" (EotE p.187, E-S1C-2), and ten times that on a starship or vehicle (EotE p.269, R-S2A-2; V-RAW-160)
    modCost: 100, modShipX: 10, modShipXCite: 'EotE p.269',
    // K4 (B2): Table 7-17's page and Table 7-1's — the weapons registry's `cite` and `profile.cite`, as the frames print them
    t717: 'EotE p.271', t71: 'EotE p.230',
    // W7: the Vehicle Sheet — its Cargo Hold's free lines, Passengers and Consumables (V-RAW-210; corpus 455, printed 446)
    sheet: 'EotE p.446',
  };
  // S8 (R-S8B-8, D-238): FIT is renamed MODS; the route keeps its segment `fit` (card ADDENDUM 12 Q1)
  var SHIP_TAB_WORDS = { fit: 'MODS', crew: 'CREW', dock: 'DOCK', log: 'LOG', trade: 'TRADE', deck: 'DECK' };
  function upper(s) { return String(s == null ? '' : s).toUpperCase(); }
  function slugName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  // Table 7-9's row for a crit entry (K8): name · range · severity word · its difficulty dice · the printed result.
  // A legacy entry (`row` null) keeps today's {sev, label}.
  function critParts(reg, c) {
    var row = c && c.row && reg ? (reg.critRows || []).filter(function (r) { return r && r[3] === c.row; })[0] : null;
    if (row) {
      var txt = String(row[2] || ''), k = txt.indexOf(':');
      var sevTxt = String(row[1] || '');
      return { name: k > 0 ? txt.slice(0, k) : txt, range: row[0], sev: sevTxt.split(' (')[0],
        dice: (sevTxt.match(/\[DI\]/g) || []).length, result: k > 0 ? txt.slice(k + 1).trim() : '' };
    }
    var SEV = { easy: ['Easy', 1], average: ['Average', 2], hard: ['Hard', 3], daunting: ['Daunting', 4] }[c && c.sev] || ['—', 0];
    return { name: (c && c.label) || 'Critical hit', range: '', sev: SEV[0], dice: SEV[1], result: '' };
  }
  function maRow(reg, slug) {
    var rows = reg && reg.starship && reg.starship.rows || [];
    return rows.filter(function (r) { return slugName(r.name) === slug; })[0] || null;
  }
  // RELEASE 1.0 R5 row 7 (card `release-r5-crew` R-R5C-1): the crew roles are crew_roles.json's, in its order — each
  // {id, label, line, actions, ogg_keys}. `actions` names starship rows by `id`; a display grouping, never a gate.
  function crewRoles(reg) { return (reg && reg.crewRoles) || []; }
  function crewRole(reg, id) { return crewRoles(reg).filter(function (r) { return r.id === id; })[0] || null; }
  function roleRows(reg, id) {
    var rows = (reg && reg.starship && reg.starship.rows) || [], role = crewRole(reg, id);
    return ((role && role.actions) || []).map(function (a) { return rows.filter(function (r) { return r.id === a; })[0]; }).filter(Boolean);
  }
  function diffDice(n, id) {
    var D = window.SWRPGDice;
    if (!D || !D.renderPool || !n) return null;
    return el('span', { className: 'y-dice', 'data-dice': id || '' }, D.renderPool({ difficulty: n }, { size: 1, cssSized: true }));
  }
  function Cite(props) { return el('span', { className: 'y-cite' }, props.children); }
  function SechC(props) {
    return el('div', { className: 'y-sech' }, el('h2', null, props.h), props.x ? el('span', { className: 'y-sech-x' }, props.x) : null,
      props.cite ? el('span', { className: 'y-cite' }, props.cite) : null);
  }
  function crewOf(rec, role) { return (rec.crew || []).map(function (c, i) { return { seat: c, i: i }; }).filter(function (x) { return x.seat.role === role; }); }
  function whoName(who, reg, roster) { var w = whoOf(who, reg, roster); return (w && w.name) || '—'; }
  function WhoFace(props) {
    var w = whoOf(props.who, props.reg, props.roster);
    if (w && w.kind === 'char') return el(Face, { rec: w.rec || { name: w.name }, portraitFor: props.portraitFor });
    if (w && w.kind === 'npc') return el(NpcMark);
    return el('span', { className: 'y-npcmark' }, 'NAME');
  }

  // ── the ship's head: YOUR IMAGE · run word · nickname · hull line; the SHEET · WORKBENCH switch ──
  // the run word: YOUR SHIP (the player's own, U15) · THE PARTY'S SHIP (THE PARTY'S FLAGSHIP when a unit flies under it)
  // · <NAME>'S SHIP for a character or an NPC the GM keeps
  function shipRun(p, rec, units) {
    if (p.host === 'player' && p.owner && rec.owner === p.owner) return 'YOUR SHIP';
    var gn = rec.owner === 'party' ? 'THE PARTY' : groupName(rec.owner);   // R-BSBP-2: the group's name in THE PARTY's place
    if (gn) return upper(gn) + ((units || []).some(function (u) { return u.flagship === rec.id; }) ? '’S FLAGSHIP' : '’S SHIP');
    var w = whoOf(rec.owner, p.reg, p.roster);
    return w && w.name ? upper(w.name) + '’S SHIP' : 'THE SHIP';
  }
  // S8 (R-S8B-10; frames v3 S-built · S-cell): a built ship's hull is its frame — "BUILT · STARFIGHTER FRAME", never a catalogue name
  function builtWord(rec, vrow) { return rec && rec.build && rec.build.frame && vrow ? 'BUILT · ' + upper(vrow.name) + ' FRAME' : null; }
  function hullLine(rec, vrow, res, unit) {
    if (!vrow) return rec.vehicleKey;                                                         // U12: the key alone
    var sil = 'SILHOUETTE ' + (res && res.silhouette != null ? res.silhouette : '—');
    var u = unit ? ' · UNIT · ' + upper(unit.name) : '';
    if (builtWord(rec, vrow)) return builtWord(rec, vrow) + ' · ' + sil + u;
    return rec.nickname ? (vrow.name || rec.vehicleKey) + ' · ' + sil + u : sil + u;            // W9: no nickname → the name is the h1
  }
  function ModeSwitch(props) {
    return el('div', { className: 'y-mode', role: 'tablist', 'aria-label': 'View', 'data-testid': 'ship-mode' },
      [['sheet', 'SHEET'], ['bench', 'WORKBENCH']].map(function (m) {
        var on = m[0] === props.mode;
        return el('button', { key: m[0], type: 'button', className: 'y-mode-b', role: 'tab', 'aria-selected': on, 'data-on': on ? 1 : 0,
          'data-mode': m[0], onClick: function () { if (!on) props.onMode(m[0]); } }, m[1]);
      }));
  }
  // U1 · THE PICTURE — one line under the plate: ADD A PICTURE, or REPLACE · REMOVE; REMOVE asks on the same line; a
  // refusal replaces the line until dismissed. The words are the approved page's (`shipyard-s4-approvals` R-S4A-1).
  var PIC_REFUSAL = {
    too_large: 'That picture is too big to keep, even made smaller. Try a smaller one.',
    not_picture: 'That file isn’t a picture this app can read.',
    fleet_full: 'Your ships’ pictures fill the room this device keeps for them. Remove one to add this one.',
  };
  function PicLine(props) {
    var st = React.useState(null), mode = st[0], setMode = st[1];      // null | 'confirm' | a refusal key
    var inputRef = React.useRef(null);
    var rec = props.rec, VS = window.SWRPGVessels, P = window.SWRPGPicture;
    function pick() { if (inputRef.current) inputRef.current.click(); }
    function onFile(e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f || !P || !VS) return;
      P.readFile(f).then(function (uri) {
        return P.reEncode(uri, { ladder: VS.IMAGE_LADDER, maxChars: VS.IMAGE_MAX_CHARS });
      }).then(function (r) {
        if (r.refused) { setMode(r.refused === 'too_large' ? 'too_large' : 'not_picture'); return; }
        var why = VS.imageRefusal(props.state, rec.id, r.dataUrl);
        if (why) { setMode(why === 'fleet_full' ? 'fleet_full' : why === 'too_large' ? 'too_large' : 'not_picture'); return; }
        props.apply(function (s) { return VS.setImage(s, rec.id, r.dataUrl, props.now()); });
        setMode(null);
      }).catch(function () { setMode('not_picture'); });
    }
    var input = el('input', { ref: inputRef, type: 'file', accept: 'image/*', hidden: true, onChange: onFile, 'data-testid': 'ship-pic-file' });
    var line;
    if (mode && PIC_REFUSAL[mode]) {
      line = [el('p', { key: 'n', className: 'y-pic-no', role: 'alert', 'data-refusal': mode }, PIC_REFUSAL[mode]),
        el('button', { key: 'x', type: 'button', className: 'y-x', 'aria-label': 'dismiss', onClick: function () { setMode(null); } }, '✕')];
    } else if (mode === 'confirm') {
      line = [el('span', { key: 'q', className: 'y-pic-q' }, 'Remove this picture?'),
        el('button', { key: 'r', type: 'button', className: 'y-link', 'data-testid': 'ship-pic-remove-yes',
          onClick: function () { props.apply(function (s) { return VS.setImage(s, rec.id, null, props.now()); }); setMode(null); } }, 'REMOVE'),
        el('span', { key: 's', className: 'y-picsep', 'aria-hidden': true }, '·'),
        el('button', { key: 'k', type: 'button', className: 'y-link', onClick: function () { setMode(null); } }, 'KEEP')];
    } else if (rec.image) {
      line = [el('button', { key: 'r', type: 'button', className: 'y-link', 'data-testid': 'ship-pic-replace', onClick: pick }, 'REPLACE'),
        el('span', { key: 's', className: 'y-picsep', 'aria-hidden': true }, '·'),
        el('button', { key: 'd', type: 'button', className: 'y-link', 'data-testid': 'ship-pic-remove', onClick: function () { setMode('confirm'); } }, 'REMOVE')];
    } else {
      line = [el('button', { key: 'a', type: 'button', className: 'y-link', 'data-testid': 'ship-pic-add', onClick: pick }, 'ADD A PICTURE')];
    }
    return el('div', { className: 'y-picline', 'data-u1': mode || (rec.image ? 'has' : 'none'), 'data-testid': 'ship-picline' }, line, input);
  }
  function ShipHead(props) {
    var rec = props.rec, vrow = props.vrow, band = props.band, mode = props.mode;
    var benchW = mode === 'bench' && band !== 'narrow';
    var nick = rec.nickname ? upper(rec.nickname) : (vrow ? upper(vrow.name) : rec.vehicleKey);
    var sw = el(ModeSwitch, { mode: mode, onMode: props.onMode });
    return el(React.Fragment, null,
      el('div', { className: 'y-shiphead', 'data-testid': 'ship-head', style: benchW ? { gridTemplateColumns: '120px minmax(0,1fr) auto' } : undefined },
        el(Art, { rec: rec, vrow: vrow, host: 'ship-head', w: benchW ? 120 : band === 'wide' ? 200 : 112, cls: 'y-shiphead-art', style: benchW ? { width: 120, height: 80 } : undefined, alt: nick, schem: benchW ? 52 : band === 'wide' ? 100 : 48 }),
        el('div', { style: { minWidth: 0 } },
          el('div', { className: 'y-runhead', style: { marginBottom: 4 } }, el('span', null, props.run)),
          el('h1', { className: 'y-ship-n', style: { fontSize: band === 'wide' ? (mode === 'bench' ? 24 : 28) : 19 } }, nick),
          el('span', { className: 'y-ship-t', 'data-testid': 'ship-hull' }, hullLine(rec, vrow, props.res, props.unit))),
        band !== 'narrow' ? el('div', { className: 'y-row' }, sw) : null),
      props.canPicture ? el(PicLine, { rec: rec, state: props.state, apply: props.apply, now: props.now }) : null,
      band !== 'narrow' ? null : el('div', { className: 'y-mt' }, sw));
  }

  // ── S1's parts ──
  function Tracker(props) {
    var v = props.value || 0;
    return el('div', { className: 'y-trk', 'data-state': props.down ? 'down' : undefined, 'data-testid': props.testid },
      el('div', { className: 'y-trk-k' }, props.label),
      el('div', { className: 'y-trk-c' },
        el('button', { type: 'button', className: 'y-trk-b', 'aria-label': 'decrease ' + props.label.toLowerCase(), disabled: v <= 0,
          onClick: function () { props.onChange(Math.max(0, v - 1)); } }, '−'),
        el('span', { className: 'y-trk-v' }, String(v), el('span', { className: 'y-of' }, ' / ' + (props.max != null ? props.max : '—'))),
        // no ceiling: past the threshold is RAW (EotE p.242–243; `shipyard-s2-hangar` Δ6 retires the stepper cap)
        el('button', { type: 'button', className: 'y-trk-b', 'aria-label': 'increase ' + props.label.toLowerCase(),
          onClick: function () { props.onChange(v + 1); } }, '+')));
  }
  function Condition(props) {
    var rec = props.rec, res = props.res, ht = res ? res.hull_threshold : null, st = res ? res.strain_threshold : null;
    var hull = rec.hull_current || 0, strain = rec.strain_current || 0;
    return el(React.Fragment, null,
      el(SechC, { h: 'CONDITION' }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-condition' },
        el(Tracker, { label: 'HULL TRAUMA', value: hull, max: ht, down: isCrippled(rec, res), testid: 'ship-hull-trk', onChange: function (n) { props.update({ hull_current: n }); } }),
        el(Tracker, { label: 'SYSTEM STRAIN', value: strain, max: st, down: isSystemsDown(rec, res), testid: 'ship-strain-trk', onChange: function (n) { props.update({ strain_current: n }); } }),
        el('p', { className: 'y-thr' }, 'CRIPPLED PAST ', el('b', null, ht != null ? ht : '—'), ' · SYSTEMS DOWN PAST ', el('b', null, st != null ? st : '—'), ' · ' + SHIP_RULE.crippled)));
  }
  // SHIELDS. The approved frames draw a two-zone hull (silhouette 4 and under): FORE · the angle controls · AFT. A hull
  // with four zones draws its four zones in the same idiom with the controls between each facing pair — a silent-frame
  // build, listed for the walk (R-S4CO-5). Past either threshold the zones read 0, OFFLINE (EotE p.243).
  function Shields(props) {
    var rec = props.rec, vrow = props.vrow, res = props.res, VS = window.SWRPGVessels, S = Schem();
    if (!vrow || !S || !VS) {
      return el(React.Fragment, null, el(SechC, { h: 'SHIELDS' }),
        el('div', { className: 'y-sec', 'data-testid': 'ship-shields' }, el('p', { className: 'y-thr', style: { marginTop: 0 } }, 'ZONES ', el('b', null, '—'), ' · DEFENSE ', el('b', null, '—'))));
    }
    var zones = S.deriveZones(res ? res.defense : vrow.defense, res ? res.silhouette : vrow.silhouette);
    var cur = VS.resolveShields(rec, res ? res.defense : vrow.defense);
    if (props.down) {
      return el(React.Fragment, null, el(SechC, { h: 'SHIELDS' }),
        el('div', { className: 'y-sec', 'data-testid': 'ship-shields' },
          el('div', { className: 'y-zones', 'data-off': 1 },
            el('div', { className: 'y-zone' }, el('span', { className: 'y-zone-k' }, upper(zones[0] && zones[0].label || 'FORE')), el('span', { className: 'y-zone-v' }, SHIP_RULE.sysdownDefense)),
            el('div', { className: 'y-zone-mid' }, el('span', { className: 'y-mono y-crit' }, 'OFFLINE · SYSTEMS DOWN')),
            el('div', { className: 'y-zone' }, el('span', { className: 'y-zone-k' }, upper(zones[zones.length - 1] && zones[zones.length - 1].label || 'AFT')), el('span', { className: 'y-zone-v' }, SHIP_RULE.sysdownDefense))),
          el('p', { className: 'y-small y-muted y-mt' }, 'Defense drops to ' + SHIP_RULE.sysdownDefense + ' while systems are down. ', el(Cite, null, SHIP_RULE.sysdown))));
    }
    // B-1015 (R-S4CC-20): HELD, each zone reads "—" and the angle controls are inert — nothing is written against an unknown defense
    var held = heldOf(res);
    function move(from, to) { if (held) return; props.apply(function (s) { return VS.angleShields(s, rec.id, from, to, res ? res.defense : vrow.defense, props.now()); }); }
    function pair(a, b, key) {
      return el('div', { key: key, className: 'y-zones', 'data-pair': a.id + '-' + b.id },
        el('div', { className: 'y-zone', 'data-zone': a.id }, el('span', { className: 'y-zone-k' }, upper(a.label)), el('span', { className: 'y-zone-v' }, held ? el(DashB) : cur[a.id] || 0)),
        el('div', { className: 'y-zone-mid' },
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-angle-' + a.id, disabled: held || undefined, onClick: function () { move(b.id, a.id); } }, '‹ A POINT ' + upper(a.label)),
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-angle-' + b.id, disabled: held || undefined, onClick: function () { move(a.id, b.id); } }, 'A POINT ' + upper(b.label) + ' ›')),
        el('div', { className: 'y-zone', 'data-zone': b.id }, el('span', { className: 'y-zone-k' }, upper(b.label)), el('span', { className: 'y-zone-v' }, held ? el(DashB) : cur[b.id] || 0)));
    }
    var byId = {}; zones.forEach(function (z) { byId[z.id] = z; });
    var rows = byId.port && byId.starboard ? [pair(byId.fore, byId.aft, 'fa'), pair(byId.port, byId.starboard, 'ps')] : [pair(zones[0], zones[zones.length - 1], 'fa')];
    var words = ['NO', 'ONE', 'TWO', 'THREE', 'FOUR'];
    return el(React.Fragment, null,
      el(SechC, { h: 'SHIELDS', x: (words[zones.length] || zones.length) + ' ZONES AT SILHOUETTE ' + (res ? res.silhouette : vrow.silhouette) }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-shields', 'data-zones': zones.length }, rows,
        el('p', { className: 'y-small y-muted y-mt' }, 'Angle Deflector Shields moves one point between zones; a zone holds at most ' + SHIP_RULE.angleCap + '. ', el(Cite, null, SHIP_RULE.angle))));
  }
  function CritRow(props) {
    var c = props.crit, p = critParts(props.reg, c);
    return el('article', { className: 'y-critrow', 'data-testid': 'ship-crit', 'data-row': c.row || '' },
      el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, p.name), el('span', { className: 'y-e-m' }, p.range)),
      el('div', { className: 'y-row', style: { marginTop: 4 } }, el('span', { className: 'y-sev' }, p.sev), diffDice(p.dice, 'crit'), el('span', { className: 'y-mono' }, 'THE REPAIR CHECK')),
      p.result ? el('p', { className: 'y-e-t' }, glyphs(p.result)) : null,
      el('div', { className: 'y-row', style: { marginTop: 6 } },
        el('span', { className: 'y-mono' }, stampOf(c.when)),
        props.onRemove ? el('button', { type: 'button', className: 'y-quiet y-sp', 'data-testid': 'ship-crit-remove', onClick: props.onRemove }, 'REMOVE') : null));
  }
  // ＋ A CRITICAL HIT FROM TABLE 7-9 (`shipyard-s2-hangar` rows 18/29: KEEP, EXTENDED — a row, its printed result, its
  // severity). The picker the frames name but do not draw lists Table 7-9's rows in the frame's own row idiom; choosing
  // one adds it through `addCrit` (K8). A silent-frame build, listed for the walk (R-S4CO-5).
  function CritPicker(props) {
    var rows = (props.reg && props.reg.critRows) || [];
    return el('div', { className: 'y-sec hp-bands', 'data-testid': 'ship-crit-picker', style: { marginTop: 8 } },
      rows.map(function (r) {
        var sevTxt = String(r[1] || ''), txt = String(r[2] || ''), k = txt.indexOf(':');
        return el('button', { key: r[3], type: 'button', className: 'y-critrow', 'data-row': r[3], style: { display: 'block', width: '100%', textAlign: 'left' },
            onClick: function () { props.onPick(r[3]); } },
          el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, k > 0 ? txt.slice(0, k) : txt), el('span', { className: 'y-e-m' }, r[0])),
          el('div', { className: 'y-row', style: { marginTop: 4 } }, el('span', { className: 'y-sev' }, sevTxt.split(' (')[0]), diffDice((sevTxt.match(/\[DI\]/g) || []).length)));
      }));
  }
  function Crits(props) {
    var rec = props.rec, reg = props.reg, crits = rec.crits || [], VS = window.SWRPGVessels;
    var st = React.useState(false), picking = st[0], setPicking = st[1];
    var table = (window._critTables && window._critTables.vehicle) || {};
    var tname = ((table.title || '').match(/Table \d+-\d+/) || ['Table 7-9'])[0];
    return el(React.Fragment, null,
      el(SechC, { h: 'CRITICAL HITS', x: crits.length + ' SUFFERED', cite: table.cite || null }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-crits' },
        el('div', { className: 'hp-bands', 'data-run': '1' }, crits.map(function (c, i) {
          return el(CritRow, { key: i, crit: c, reg: reg,
            onRemove: props.readOnly ? null : function () { props.update({ crits: crits.filter(function (_, j) { return j !== i; }) }); } });
        })),
        props.readOnly ? null : el('div', { className: 'y-verbs', style: { borderTop: 0, paddingTop: 4, marginTop: 6 } },
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-crit-add', 'aria-expanded': picking, onClick: function () { setPicking(!picking); } }, '＋ A CRITICAL HIT FROM ' + upper(tname))),
        picking ? el(CritPicker, { reg: reg, onPick: function (row) {
          props.apply(function (s) { return VS.addCrit(s, rec.id, { row: row }, props.now(), (reg && reg.critRows) || []); });
          setPicking(false);
        } }) : null));
  }
  // TO HIT (`shipyard-s2-hangar` rows 17/32: KEEP → S1): the target's silhouette sets the difficulty (Table 7-4, EotE
  // p.235); the stepper is the live paper TO HIT's (PP-6), opened in the frame's line. It informs, never decides.
  function ToHit(props) {
    var S = Schem(), firer = props.firerSil;
    var st = React.useState(null), target = st[0], setTarget = st[1];
    var open = target != null, t = open ? target : firer;
    var d = S && S.silhouetteDifficulty && firer != null ? S.silhouetteDifficulty(firer, t) : null;
    return el(React.Fragment, null,
      el('div', { className: 'y-row', style: { marginTop: 8 } },
        el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-tohit', 'aria-expanded': open, onClick: function () { setTarget(open ? null : firer); } }, 'TO HIT'),
        open ? el('span', { className: 'y-row', style: { gap: 6 } },
          el('button', { type: 'button', className: 'y-trk-b', 'aria-label': 'decrease target silhouette', disabled: t <= 0, onClick: function () { setTarget(Math.max(0, t - 1)); } }, '−'),
          el('span', { className: 'y-mono' }, 'TARGET SILHOUETTE ' + t),
          el('button', { type: 'button', className: 'y-trk-b', 'aria-label': 'increase target silhouette', disabled: t >= 10, onClick: function () { setTarget(Math.min(10, t + 1)); } }, '+'))
          : el('span', { className: 'y-mono' }, props.compact ? 'SILHOUETTE SETS IT · ' + SHIP_RULE.tohit : 'TARGET SILHOUETTE ' + t + (d ? ' · ' + upper(d.label) : '')),
        (open || !props.compact) && d ? diffDice(d.dice, 'tohit') : null,
        open && d ? el('span', { className: 'y-mono' }, upper(d.label)) : null),
      props.compact ? null : el('p', { className: 'y-small y-muted', style: { marginTop: 4 } }, 'Silhouette sets the difficulty; range does not. ' + SHIP_RULE.tohitTable + ' · ', el(Cite, null, SHIP_RULE.tohit)));
  }

  // ── S1's SEATS (G-10 B, `shipyard-s4-approvals` R-S4A-2.1): every seat the record holds, in its order. The gunner's
  // card is drawn open (frames_ship.cjs `seats`); any other seat opens the same card in place — a silent-frame build,
  // listed for the walk (R-S4CO-5). A seat's pool is the sitter's own (`seatDice`) with the ship's upgrade. ──
  var SEAT_ACTS = { pilot: ['gain_the_advantage'], copilot: ['additional_ship_vehicle_actions'],
    gunner: ['perform_a_combat_check_vehicle_weapons', 'angle_deflector_shields'], engineer: ['damage_control'],
    astrogator: ['additional_ship_vehicle_actions'], sensors: ['additional_ship_vehicle_actions'],
    commander: ['additional_ship_vehicle_actions'], crew: ['additional_ship_vehicle_actions'] };
  function poolDice(d, id) {
    if (!d || !window.SWRPGDice || !window.SWRPGDice.renderPool) return null;
    return el('span', { className: 'y-pool', 'data-pool': id || '' }, window.SWRPGDice.renderPool({ proficiency: d.pool.proficiency || 0,
      ability: d.pool.ability || 0, boost: d.pool.boost || 0, setback: d.pool.setback || 0 }, { size: 1, cssSized: true }));
  }
  function upWord(n) { return n === 1 ? 'UPGRADED ONCE' : n === 2 ? 'UPGRADED TWICE' : 'UPGRADED ' + n + ' TIMES'; }
  function seatD(p, c) { return seatDice(c.who, c.role, p.rec, p.vrow, p.ctx, p.reg); }
  function seatUp(p, c) {
    var R = VR();
    return R && p.vrow ? R.seatPool(p.rec, p.vrow, Object.assign({}, p.ctx.resolve, { character: c.who }), c.role) : null;
  }
  // R-SYC-5/-6: the ship's `seat_talents` with each grant's PART LINE — the words the registry prints for that option
  // ("Grants the Sniper Shot talent", added_mods index-aligned with added_options) — for the seat card's told line
  function seatGrantWords(p) {
    var gs = (p.res && p.res.seat_talents) || [], reg = (p.ctx && p.ctx.resolve && p.ctx.resolve.attachments) || {};
    return gs.map(function (g) {
      var a = (p.rec.attachments || [])[g.att], row = a && reg[a.key], m = a && (a.mods || [])[g.mod];
      var j = row && m ? (row.added_options || []).map(function (o) { return o.id; }).indexOf(m.option) : -1;
      var line = j >= 0 ? (row.added_mods || [])[j] : null;
      var S = window.SWRPGSources, words = (line && line.description) || (line && S && S.ruleTextItem ? S.ruleTextItem(row, ['added_mods', j, 'description']) : null) || '';   // A5
      // S2: a grant whose words were removed tells the part's book line in place of the quote (null on holocron)
      return Object.assign({}, g, { words: words, line: !words && row && S && S.removedLine ? S.removedLine(row) : null });
    });
  }
  function SeatCard(props) {
    // F-100 M8 step 3 (ruling f100-m8-c8-signature-vehicle R-M8C8-5, the GRANT): beneath the seat pool, M8's ONE offer row
    // and its applied lines (SWRPGUI), read from the ONE pool path (SWRPGSheetPool.yardSeatLines) for a character sitter.
    // A tick lives while this card is open, never in a record (R-M8B-12). R-M8C8-7: the ticks fold into the seat's own
    // dice through the one path — this card's call passes them to `charPool` (yardCharPool reads them from S5's R-S5R-13
    // move on) and to `yardSeatLines`, both through takeOffers → augment.
    var tk = React.useState({}), taken = tk[0], setTaken = tk[1];
    var gf = React.useState(false), gearOpen = gf[0], setGearOpen = gf[1];   // R-SYC-4: the carried-gear fold, open while the card is
    var tkn = Object.keys(taken).length ? taken : null;
    var p = props.p, c = props.seat, d = seatDice(c.who, c.role, p.rec, p.vrow, p.ctx, p.reg, tkn), up = seatUp(p, c);
    // the SITTER's roster record (both hosts pass ctx.roster): its sheet owns the offers (R-SYC-3)
    var cc = (function () {
      var V = window.SWRPGVessels, who = V && V.parseWho ? V.parseWho(c.who) : null;
      if (!who || who.kind !== 'char') return null;
      return ((p.ctx && p.ctx.roster) || []).filter(function (x) { return x && String(x.id) === who.id; })[0] || null;
    })();
    var UI = window.SWRPGUI || {}, lines = (function () {
      var SP = window.SWRPGSheetPool, R = VR();
      if (!d || !SP || !SP.yardSeatLines || !R || !cc) return null;
      return SP.yardSeatLines(cc, R.seatSkill(c.role, p.vrow), up ? up.upgradeAbility : 0, tkn, seatGrantWords(p));
    })();
    var applied = lines && UI.AppliedLine && UI.appliedLineText ? lines.changes.filter(function (x) { return !x.taken; }).map(function (x, k) {
      return el(UI.AppliedLine, { key: 'a' + k }, UI.appliedLineText(x, d && d.label)); }) : null;
    // R-SYC-3 (`b1205:yard-offers-not-owner-aware`): the offers read through the SITTER's own lookup — SWRPGUI.offerTalentsFor, the
    // ONE function the hub and the why-sheet read (the sheet's stamp view first, D-SYF2 (a)), never the device's discovery view.
    // R-SYC-4 (R-SYG-2; D-229 Q1 (b)): the sitter's CARRIED-GEAR offers fold behind one line (SWRPGUI.GearFold, the hub's own);
    // the talent and species offers stay listed.
    var offerEls = function (list, pre) {
      var tal = UI.offerTalentsFor ? UI.offerTalentsFor(cc && cc.sheetData, lines.reminders) : null;
      return list.map(function (m, k) {
        var o = UI.offerOf(m, tal);
        return el(UI.OfferRow, { key: pre + k, offerKey: o.key, name: o.name, text: o.text, s3: o.s3, tags: o.tags, on: !!taken[o.key],
          onToggle: function () { var n = Object.assign({}, taken); if (n[o.key]) delete n[o.key]; else n[o.key] = true; setTaken(n); } });
      });
    };
    var certified = lines ? lines.reminders.filter(function (m) { return m.reason !== 'uncertified'; }) : [];
    var offers = lines && UI.OfferRow && UI.offerOf ? offerEls(certified.filter(function (m) { return m.holder !== 'gear'; }), 'o')
      .concat(UI.GearFold ? UI.GearFold(c.role, offerEls(certified.filter(function (m) { return m.holder === 'gear'; }), 'g'), gearOpen,
        function () { setGearOpen(!gearOpen); }, 'seat-gear-fold') : []) : null;
    // R-SYC-5/-6: a fitted part's granted talent that TELLS a rule at this check follows the offers, in the part's own words
    var told = lines && UI.ToldLine ? (lines.told || []).map(function (t, k) { return el(UI.ToldLine, { key: 't' + k, name: t.name, words: t.words, line: t.line }); }) : [];
    if (offers || told.length) offers = (offers || []).concat(told);
    var who = el('div', { className: 'y-who' }, el(WhoFace, { who: c.who, reg: p.reg, roster: p.roster, portraitFor: p.portraitFor }),
      el('div', null, el('div', { className: 'y-who-n' }, whoName(c.who, p.reg, p.roster)),
        el('div', { className: 'y-who-m' }, 'SEAT · ', el('span', { className: 'y-inkstate' }, roleWord(c.role)))));
    return el('div', { className: 'y-seatcard', 'data-open': 1, 'data-testid': 'ship-seatcard', 'data-role': c.role },
      el('div', { className: 'y-seatcard-in' },
        props.onClose ? el('button', { type: 'button', 'aria-expanded': true, onClick: props.onClose }, who) : who,
        (SEAT_ACTS[c.role] || SEAT_ACTS.crew).map(function (slug, i) {
          var row = maRow(p.reg, slug);
          return el('div', { key: slug, className: 'y-act', 'data-act': slug },
            el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, row ? row.name : slug), el('span', { className: 'y-e-m' }, row ? row.type : '')),
            i === 0 && d ? el('div', { className: 'y-row', style: { marginTop: 6 } }, el(PoolRow, { dice: d, id: 'seat-' + c.role }), applied) : null,
            i === 0 && up && up.held ? el(UpHeld) : i === 0 && up && up.upgradeAbility > 0 ? el('span', { className: 'y-attr', style: { textAlign: 'left' } },
              upWord(up.upgradeAbility) + ' · ' + up.because.map(function (b) { return b.source; }).join(' · ')) : null,
            i === 0 && c.role === 'gunner' ? el(ToHit, { firerSil: p.res ? p.res.silhouette : null }) : null);
        }),
        offers && offers.length ? el('div', { 'data-testid': 'seat-offers' }, offers) : null));
  }
  function Seats(props) {
    var p = props.p, crew = p.rec.crew || [];
    var st = React.useState(null), open = st[0], setOpen = st[1];
    return el(React.Fragment, null,
      el(SechC, { h: 'SEATS', x: crew.length + ' ABOARD' }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-seats' },
        el('p', { className: 'y-canon', style: { margin: '0 0 6px' } }, 'Crew of record: ', crewLine(p.vrow) ? el('q', null, crewLine(p.vrow)) : '—'),
        el('div', { className: 'hp-bands', 'data-run': '1' }, crew.map(function (c, i) {
          if (c.role === 'gunner') return el(SeatCard, { key: i, p: p, seat: c });
          if (open === i) return el(SeatCard, { key: i, p: p, seat: c, onClose: function () { setOpen(null); } });
          return el('button', { key: i, type: 'button', className: 'y-seatrow', 'data-testid': 'ship-seat', 'data-role': c.role, 'aria-expanded': false,
              onClick: function () { setOpen(i); } },
            el('span', { className: 'y-who' }, el(WhoFace, { who: c.who, reg: p.reg, roster: p.roster, portraitFor: p.portraitFor }),
              el('span', null, el('span', { className: 'y-who-n' }, whoName(c.who, p.reg, p.roster)), el('br'),
                el('span', { className: 'y-who-m' }, 'SEAT · ', el('span', { className: 'y-inkstate' }, roleWord(c.role))))),
            el('span', { className: 'y-seatrow-p' }, poolDice(seatD(p, c), 'seat-' + c.role), heldOf(p.res) ? el(UpHeld) : null, el('span', { className: 'y-chev' }, '›')));
        })),
        crew.length ? null : el('p', { className: 'y-small y-muted' }, 'Nobody is seated yet. The workbench’s CREW tab puts people in roles.')));
  }
  // THE CREW ACTIONS door (the shipped fold, drawn open): maneuvers_actions.json's starship rows, by who may use them,
  // each with the sitter's own pool. The frames draw PILOT, ENGINEER and CO-PILOT AND ASTROGATOR (the gunner's card
  // carries its own); a ship with SENSORS AND COMMS or a COMMANDER seated shows their groups in the same idiom — a
  // silent-frame build, listed for the walk (R-S4CO-5). Informs, never rolls. Each group's rows and heading are
  // crew_roles.json's (R-R5C-1): its Maneuver rows as names, its Action rows as cards; a role with no Action row shows
  // its sitters' pools.
  function CrewActions(props) {
    var p = props.p, reg = p.reg, crew = p.rec.crew || [];
    function of(r) { return crew.filter(function (c) { return c.role === r; }); }
    function names(list) { return list.map(function (c) { return whoName(c.who, reg, p.roster); }).join(' · '); }
    function pools(list, key, style) {
      return list.map(function (c, i) {
        var d = seatD(p, c);
        return d ? el('div', { key: key + i, className: 'y-row', style: style || { marginTop: 6 } }, poolDice(d, key), heldOf(p.res) ? el(UpHeld) : null,
          el('span', { className: 'y-mono' }, whoName(c.who, reg, p.roster) + ' · ' + d.label)) : null;
      });
    }
    function act(row, list, key) {
      return el('div', { key: key, className: 'y-act', 'data-act': slugName(row.name) },
        el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, row.name), el('span', { className: 'y-e-m' }, row.type)),
        el('div', { className: 'y-mono', style: { marginTop: 3 } }, row.restrictions,
          // D2 (D-291; B-1424): the row's own cite, only when it differs from the group heading's
          row.cite && row.cite !== (reg && reg.starship && reg.starship.cite) ? el('span', { 'data-testid': 'row-cite' }, ' · ' + row.cite) : null),
        pools(list, key),
        el('p', { className: 'y-e-t y-small', style: { marginTop: 6 } }, row.effect));
    }
    function word(id) { var r = crewRole(reg, id); return r ? r.label : upper(id); }
    function sub(id, list) { return el('div', { className: 'y-sub' }, word(id) + ' · ' + names(list)); }
    function body(id, list, style) {
      var rows = roleRows(reg, id), mnv = rows.filter(function (r) { return r.type === 'Maneuver'; }), acts = rows.filter(function (r) { return r.type !== 'Maneuver'; });
      // B-1647 (D-419 item 4): the MANEUVERS · NO CHECK line leads the names, so they read as their own list, not the next card's title
      var out = mnv.length ? [el('p', { key: id + '-nc', className: 'y-mono', style: { margin: '0 0 6px' } }, 'MANEUVERS · NO CHECK'),
        el('div', { key: id + '-mnv', className: 'y-mnv' }, mnv.map(function (r) { return el('span', { key: r.id }, r.name); }))] : [];
      return acts.length ? out.concat(acts.map(function (r) { return act(r, list, 'acts-' + r.id); })) : out.concat(pools(list, 'acts-' + id, style));
    }
    var pil = of('pilot'), eng = of('engineer'), co = of('copilot'), ast = of('astrogator'), sen = of('sensors'), cmd = of('commander');
    var g = [];
    if (pil.length) g.push(el(React.Fragment, { key: 'pil' }, sub('pilot', pil), body('pilot', pil)));
    if (eng.length) g.push(el(React.Fragment, { key: 'eng' }, sub('engineer', eng), body('engineer', eng)));
    if (co.length || ast.length) g.push(el(React.Fragment, { key: 'co' },
      co.length && ast.length ? el('div', { className: 'y-sub' }, word('copilot') + ' AND ' + word('astrogator')) : co.length ? sub('copilot', co) : sub('astrogator', ast),
      body('copilot', co), body('astrogator', ast, { margin: '-2px 0 8px' })));
    if (sen.length) g.push(el(React.Fragment, { key: 'sen' }, sub('sensors', sen),
      body('sensors', sen), el('p', { className: 'y-small y-muted', style: { marginTop: 4 } }, 'Table 7-7 · ', el(Cite, null, 'EotE p.237'))));
    if (cmd.length) g.push(el(React.Fragment, { key: 'cmd' }, sub('commander', cmd), body('commander', cmd)));
    return el('details', { className: 'y-door-fold', open: true, 'data-testid': 'ship-crew-actions' },
      el('summary', { className: 'y-fold-h' }, el('span', { className: 'y-e-n' }, 'CREW ACTIONS'),
        el('span', { className: 'y-e-m' }, 'WHAT EACH SEAT CAN DO · ' + ((reg && reg.starship && reg.starship.cite) || '—'))),
      el('div', { className: 'y-fold-b y-sec' }, g.length ? g : el('p', { className: 'y-small y-muted' }, 'Nobody is seated yet.')));
  }
  // WEAPONS: the resolver's weapons (res.weapons), each with TO HIT; OFFLINE while systems are down (S2). S6 (frames F1–F2d,
  // D-103): under the stat line, QUALITIES in the one quality word, each quality whole; under it the talent's credit lines.
  // A weapon with none prints no line (never "NONE"); the qualities stay printed while systems are down.
  var ARC_IDS = ['fore', 'aft', 'port', 'starboard'];
  function arcsWord(w) {
    var fa = w.firing_arcs || {}, on = ARC_IDS.filter(function (a) { return fa[a]; });
    return on.length === ARC_IDS.length ? 'ALL' : on.length ? on.map(upper).join(' · ') : '—';
  }
  function Weapons(props) {
    if (!props.res) {   // U12: the mounts are the hull's, and the hull is not in the loaded books
      return el(React.Fragment, null, el(SechC, { h: 'WEAPONS' }),
        el('div', { className: 'y-sec', 'data-testid': 'ship-weapons' }, el('p', { className: 'y-thr', style: { marginTop: 0 } }, 'MOUNTED ', el('b', null, '—'))));
    }
    var ws = props.res.weapons || [];
    return el(React.Fragment, null,
      el(SechC, { h: 'WEAPONS', x: ws.length + ' MOUNTED' }),
      el('div', { className: 'y-sec hp-bands', 'data-testid': 'ship-weapons' }, ws.map(function (w, i) {
        return el(WeaponRow, { key: i, p: props.p, res: props.res, w: w, i: i, down: props.down, sil: props.sil });
      })));
  }
  // S7 (`shipyard-s7-build-card` R-S7B-7; D-220, board v3): ONE weapon row, drawn by THE SHIP's `Weapons` and by the sheet's
  // pilot card (`player/app.jsx` `SheetVesselsS4`, through `YardParts.WeaponRow`), so the two never print a weapon two ways.
  // `i` is the weapon's index in `res.weapons` (the resolver's `because.weapon_quality_<i>` join). The card passes `pool` (its
  // per-row pool line and "because" lines, R-S7P-1/-3, drawn after the qualities) and `noTohit` (D-220 Q3: the card's rows
  // carry no TO HIT; THE SHIP keeps it). Systems down prints the offline line on both.
  function WeaponRow(props) {
    var w = props.w, i = props.i;
    return el('div', { className: 'y-e', 'data-testid': 'ship-weapon' },
      el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' },
        (w.location ? w.location + (w.turret ? ' TURRET' : '') + ' · ' : '') + w.name + (w.count > 1 ? ' ×' + w.count : ''))),
      el('div', { className: 'y-e-l' },
        el('div', null, 'DAMAGE ', el('b', null, w.damage != null ? w.damage : '—')), el('div', null, 'CRITICAL ', el('b', null, w.crit != null ? w.crit : '—')),
        el('div', null, 'RANGE ', el('b', null, w.range_label || '—')), el('div', null, 'ARCS ', el('b', null, arcsWord(w)))),
      el(WeaponQuals, { p: props.p, w: w, credits: ((props.res && props.res.because) || {})['weapon_quality_' + i] }),
      w.added_by ? el('p', { className: 'y-attr', style: { textAlign: 'left', marginTop: 4 }, 'data-testid': 'ship-weapon-added' }, addedCredit(props.p, w)) : null,
      props.pool || null,
      props.down ? el('p', { className: 'y-mono y-crit', style: { marginTop: 6 } }, 'OFFLINE WHILE SYSTEMS ARE DOWN · ' + SHIP_RULE.sysdown)
        : props.noTohit ? null : el(ToHit, { firerSil: props.sil, compact: true }));
  }
  // S8 (R-S8FR-4, R-S8B-10; frames S-conv · M-conv): a gun the resolver ADDED (R-S8V-6's `added_by`, the template's name) is
  // credited under its row, "<TEMPLATE> · <its cite>". The cite is the parts list's own row of that name — the room's list, else
  // this module's loaded one (THE SHIP's pilot card passes no list) — and the name alone while neither is in hand.
  function addedCredit(p, w) {
    var by = (p && p.attById) || _attById || {}, row = null;
    Object.keys(by).some(function (k) { var r = by[k]; if (r && r.kind === 'conversion' && r.name === w.added_by) { row = r; return true; } return false; });
    return w.added_by + (row && row.cite ? ' · ' + row.cite : '');
  }
  function WeaponQuals(props) {
    var parts = qualParts(props.p, props.w.qualities_resolved);
    if (!parts.length) return null;
    return el(React.Fragment, null,
      el('div', { className: 'y-e-l', style: { marginTop: 4 }, 'data-testid': 'ship-weapon-quals' },
        el('div', { style: { flex: '1 1 100%', minWidth: 0 } }, 'QUALITIES ', el('b', null, qualRun(props.p, props.w.qualities_resolved)))),
      qualCredits(props.p, props.w, props.credits).map(function (t, k) {
        return el('p', { key: 'c' + k, className: 'y-attr', style: { textAlign: 'left', marginTop: 4 }, 'data-testid': 'ship-weapon-credit' }, t);
      }));
  }
  // THE LOG: `logRows` (H3's one reading of the record's story), newest first. The player's own line can be removed on
  // the workbench (W6, `removeLine`); an app-written event cannot.
  function shipLog(p) { return logRows(p.rec, p.reg, p.npcName, p.attById).slice().reverse(); }
  function LogLine(props) {
    var r = props.r;
    return el('div', { className: 'y-log-r', 'data-by': r.by ? 'player' : undefined, 'data-testid': 'ship-log-row', 'data-k': r.k },
      el('span', { className: 'y-log-s' }, r.s || r.stamp),
      el('span', { className: 'y-log-t' }, r.by ? el('span', { className: 'y-log-e', style: { color: 'var(--doc-accent)' } }, 'YOUR LINE') : el('span', { className: 'y-log-e' }, r.e), r.t,
        props.onRemove ? ' ' : null,
        props.onRemove ? el('button', { type: 'button', className: 'y-x', 'aria-label': 'remove your line', 'data-testid': 'ship-log-remove', onClick: props.onRemove }, '✕') : null));
  }
  function LogInput(props) {
    var p = props.p, st = React.useState(''), v = st[0], setV = st[1];
    function add() {
      var t = v.trim();
      if (!t) return;
      p.apply(function (s) { return V().appendProvenance(s, p.rec.id, { note: t, when: p.now() }, p.now()); });
      setV('');
    }
    return el('div', { className: 'y-row y-mt' },
      el('input', { className: 'y-in', style: { flex: 1, minWidth: 0 }, value: v, placeholder: 'Log a line for the ship…', 'aria-label': 'Log a line for the ship',
        'data-testid': 'ship-log-input', onChange: function (e) { setV(e.target.value); }, onKeyDown: function (e) { if (e.key === 'Enter') add(); } }),
      el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-log-add', onClick: add }, 'LOG'));
  }
  function LogTail(props) {
    var p = props.p;
    return el(React.Fragment, null, el(SechC, { h: 'LOG', x: 'THE LAST LINES' }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-log-tail' },
        el('div', { className: 'y-log' }, shipLog(p).slice(0, 3).map(function (r, k) { return el(LogLine, { key: k, r: r }); })),
        el(LogInput, { p: p })));
  }
  function DeckDoor(props) {
    var n = 0, decks = props.rec.decks || [];
    decks.forEach(function (d) { n += (d.areas || []).length; });
    return el('button', { type: 'button', className: 'y-door y-sec', style: { marginTop: 18 }, 'data-testid': 'ship-deck-door', onClick: props.onOpen },
      el('span', null, el('span', { className: 'y-door-n' }, 'DECK'), el('br'), el('span', { className: 'y-door-m' }, decks.length ? n + ' AREAS · WHO IS ABOARD' : 'NO PLAN YET')),
      el('span', { className: 'y-chev' }, '›'));
  }

  // ── S2 · past a threshold: the state words and what they mean at the table, and what the crew can still do ──
  function StateBox(props) {
    return el('div', { className: 'y-mt' }, el('div', { className: 'y-plate y-statebox', 'data-testid': 'ship-state' },
      el('div', { style: { padding: '14px 16px' } },
        el('div', { className: 'y-row' }, props.crip ? el(Stamp, { k: 'state' }, 'CRIPPLED') : null, props.sys ? el(Stamp, { k: 'state' }, 'SYSTEMS DOWN') : null),
        props.crip ? el(CripLine, { ht: props.ht }) : null,
        props.sys ? el('p', { className: 'y-e-t' }, 'System strain is past ' + props.st + ': speed ' + SHIP_RULE.sysdownSpeed + ', no weapons, no shields. ', el(Cite, null, SHIP_RULE.sysdown)) : null)));
  }
  // B-1015 · H1 (R-S4CC-22): a held ship with any damage sits in StateBox's place with a NEUTRAL plate. Parts move both
  // thresholds, so without the list any strain might be SYSTEMS DOWN and any hull trauma CRIPPLED: the damage prints against
  // "—" and one line says the verdict waits on the parts list. A silent frame from StateBox's own plate (R-S4CO-5), walked.
  function HeldStateBox(props) {
    var crip = props.hull > 0, sys = props.strain > 0;
    var what = crip && sys ? 'Whether the ship is crippled, or its systems are down, waits on the parts list.'
      : crip ? 'Whether the ship is crippled waits on the parts list.' : 'Whether systems are down waits on the parts list.';
    return el('div', { className: 'y-mt' }, el('div', { className: 'y-plate y-statebox', 'data-testid': 'ship-state-held' },
      el('div', { style: { padding: '14px 16px' } },
        el('div', { className: 'y-row' },
          crip ? el('span', { className: 'y-mono' }, 'HULL ' + props.hull + ' OF ', el(DashB)) : null,
          sys ? el('span', { className: 'y-mono' }, 'STRAIN ' + props.strain + ' OF ', el(DashB)) : null),
        el('p', { className: 'y-e-t' }, what))));
  }
  function StillDo(props) {
    var p = props.p, reg = p.reg, eng = (p.rec.crew || []).filter(function (c) { return c.role === 'engineer'; });
    var dc = maRow(reg, 'damage_control');
    function engRows(key, hard) {
      return eng.map(function (c, i) {
        var d = seatD(p, c);
        return d ? el('div', { key: key + i, className: 'y-row', style: { marginTop: 6 } }, poolDice(d, key), hard ? diffDice(SHIP_RULE.emergencyDice, 'emergency') : null,
          el('span', { className: 'y-mono' }, hard ? 'HARD · ' + (eng.length > 1 ? whoName(c.who, reg, p.roster) + ' · ' : '') + d.label : whoName(c.who, reg, p.roster) + ' · ' + d.label)) : null;
      });
    }
    return el(React.Fragment, null, el(SechC, { h: 'WHAT THE CREW CAN STILL DO' }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-still' },
        dc ? el('div', { className: 'y-act' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, dc.name), el('span', { className: 'y-e-m' }, dc.type)),
          engRows('dc'), el('p', { className: 'y-e-t y-small' }, dc.effect)) : null,
        props.crip ? el('div', { className: 'y-act', 'data-testid': 'ship-emergency' },
          el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'EMERGENCY REPAIRS'), el('span', { className: 'y-e-m' }, SHIP_RULE.emergency)),
          engRows('er', true),
          el('p', { className: 'y-e-t y-small' }, 'On a success hull trauma drops to ' + (props.ht != null ? props.ht - 1 : '—') + ' and the ship limps: speed ' + SHIP_RULE.emergencySpeed
            + ', handling ' + String(SHIP_RULE.emergencyHandling).replace('-', '−') + ', weapons out until the dock. Any hit that deals hull trauma then adds a Critical Hit at +' + SHIP_RULE.emergencyCritPlus + '.')) : null,
        el('div', { className: 'y-verbs' }, el('button', { type: 'button', className: 'y-commit', 'data-testid': 'ship-to-dock', onClick: function () { p.go({ tab: 'dock' }); } }, 'TO THE DOCK'))));
  }

  // ── S1 / S2 · THE SHEET (at the table, phone-first; three columns at the wide band, as the frames lay them) ──
  function SheetFace(props) {
    var p = props.p, rec = p.rec, res = p.res;
    var ht = res ? res.hull_threshold : null, sth = res ? res.strain_threshold : null;
    var crip = isCrippled(rec, res), sys = isSystemsDown(rec, res);
    var wide = p.band === 'wide';
    var cond = el(Condition, { key: 'cond', rec: rec, res: res, update: p.update });
    var shields = el(Shields, { key: 'sh', rec: rec, vrow: p.vrow, res: res, down: sys, apply: p.apply, now: p.now });
    var crits = el(Crits, { key: 'cr', rec: rec, reg: p.reg, apply: p.apply, update: p.update, now: p.now });
    var weapons = el(Weapons, { key: 'w', p: p, res: res, down: sys, sil: res ? res.silhouette : null });
    var log = el(LogTail, { key: 'log', p: p });
    if (crip || sys) {
      var box = el(StateBox, { key: 'box', crip: crip, sys: sys, ht: ht, st: sth });
      var still = el(StillDo, { key: 'still', p: p, crip: crip, ht: ht });
      if (wide) return el(React.Fragment, null, box, el('div', { className: 'y-grid3', style: { marginTop: 6 } },
        el('div', null, cond, shields, crits, log), el('div', null, weapons), el('div', null, still)));
      return el(React.Fragment, null, box, cond, still, shields, crits, weapons, log);
    }
    var seats = el(Seats, { key: 'seats', p: p }), acts = p.vrow ? el(CrewActions, { key: 'acts', p: p }) : null;   // U12: none without the hull
    var door = el(DeckDoor, { key: 'door', rec: rec, onOpen: function () { p.go({ at: 'deck' }); } });
    // B-1015: HELD, WB5's words sit once at the top of the face's body, before its first section head (S1 on the page). A held
    // ship is never CRIPPLED or SYSTEMS DOWN above: both thresholds are unknown, so neither is claimed or denied (R-S4CC-1).
    // A damaged one never reads as healthy either: the neutral plate takes StateBox's place above the face (R-S4CC-22).
    var words = heldOf(res) ? el(PartsWords, { key: 'words', err: p.attErr }) : null;
    var hurt = heldOf(res) && ((rec.hull_current || 0) > 0 || (rec.strain_current || 0) > 0)
      ? el(HeldStateBox, { key: 'held', hull: rec.hull_current || 0, strain: rec.strain_current || 0 }) : null;
    if (wide) return el(React.Fragment, null, hurt, el('div', { className: 'y-grid3', style: { marginTop: 6 } },
      el('div', null, words, cond, shields, crits, log), el('div', null, seats, weapons), el('div', null, acts, door)));
    return el(React.Fragment, null, hurt, words, cond, shields, crits, seats, acts, weapons, log, door);
  }

  // ── THE WORKBENCH (between sessions): the six tabs (R-S4SR-2), opening on FIT (R-S4SR-4) ──
  // U10: while a choice waits, FIT counts it — "FIT · 2" on the phone, "FIT · 2 TO CHOOSE" at the desk (R-S4CC-3 flag 2)
  function BenchTabs(props) {
    return el('div', { className: 'y-tabs', role: 'tablist', 'aria-label': 'Workbench', 'data-testid': 'ship-tabs' }, SHIP_TABS.map(function (t) {
      var on = t === props.tab, n = t === 'fit' ? props.toChoose || 0 : 0;
      return el('button', { key: t, type: 'button', className: 'y-tab', role: 'tab', 'aria-selected': on, 'data-on': on ? 1 : 0, 'data-tab': t,
        'data-choose': n || undefined, 'data-held': t === 'fit' && props.held ? 1 : undefined, onClick: function () { if (!on) props.onTab(t); } },
        // B-1015: HELD, the choices are unknown, so FIT is never bare (bare means "nothing to choose"): "FIT · — TO CHOOSE" at
        // every width, as the page draws it (R-S4CC-1, R-S4CC-20)
        t === 'fit' && props.held ? [SHIP_TAB_WORDS[t] + ' · ', el(DashB, { key: 'd' }), ' TO CHOOSE']
          : SHIP_TAB_WORDS[t] + (n ? ' · ' + n + (props.band === 'narrow' ? '' : ' TO CHOOSE') : ''));
    }));
  }
  // W4 · CREW: the eight roles (crew_roles.json, R-R5C-1), the people in them with their pools and places, the hull's crew
  // line as canon (shown, never enforced). The two ways in are drawn as doors; their flows are not drawn, so they are
  // inert here and listed at the gate. SENSORS AND COMMS rolls Computers (R-S4G-8, Table 7-7 · EotE p.237) and names Scan the Enemy's
  // Perception — a delta on the approved W4, listed for the walk.
  function placeOf(rec, where) {
    if (!where) return null;
    var d = (rec.decks || []).filter(function (x) { return x.id === where.deck; })[0];
    var a = d && where.area ? (d.areas || []).filter(function (x) { return x.id === where.area; })[0] : null;
    return a ? { deck: d, area: a } : null;
  }
  // F4-PARTY (GM host): ＋ FROM THE PARTY opens U7's picker over the roster, titled with the role; a tap seats that character
  // (assignCrew — one person may hold two seats). On the player's host the door stays inert (the frames are the GM's).
  // B-1381 (D-404 item 10, "Mute them for 1.0"): on the PLAYER'S host both doors — ＋ FROM THE PARTY and ＋ FROM THE NPC
  // LIBRARY — are drawn MUTED and are disabled, so they neither wear the live-link ink nor take focus as a live action
  // (`data-muted`, yard.css). The party picker comes after 1.0. The GM host's ＋ FROM THE PARTY is unchanged.
  // B-1579 (ADDENDUM 212): the NPC-library door has no handler on EITHER host, so it takes the same muted, disabled
  // shape on the GM's tab too.
  // B-1635 (D-417 item 1; ruling release-r7-bug-burndown ADDENDUM 354; mockup 5V2sMCF57uLY1iwJyJNtYt v1, D-418 item 1): on the
  // PLAYER'S host each role's door row opens with ＋ SEAT <NAME>, the Yard's character (`p.me`). One tap seats them there through
  // the GM door's own `assignCrew` call (the save is unchanged). No door under a role they already hold, none with no character
  // chosen, and none on the GM's host. The name stays on one line and ellipsizes (`.y-seat`, yard.css).
  function CrewTab(props) {
    var p = props.p, rec = p.rec, reg = p.reg, R = VR(), crew = rec.crew || [];
    var meName = p.me ? (whoOf(p.me, reg, p.roster) || {}).name : null;
    var pks = React.useState(null), pk = pks[0], setPk = pks[1];   // the role whose ＋ FROM THE PARTY is open
    var hs = React.useState(null), host = hs[0], setHost = hs[1], root = React.useRef(null);
    React.useEffect(function () { if (root.current && root.current.closest) setHost(root.current.closest('.yd-host')); }, []);
    var party = p.host === 'gm';
    function role(r) {
      var skill = R && r.id !== 'crew' ? R.seatSkill(r.id, p.vrow) : null, sk = skill && reg ? reg.skills[skill] : null;
      var mine = [];
      crew.forEach(function (c, i) { if (c.role === r.id) mine.push({ c: c, i: i }); });
      var perc = reg && reg.skills.perception;
      return el('div', { key: r.id, className: 'y-role', 'data-role': r.id, 'data-testid': 'ship-role' },
        el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, r.label), sk ? el('span', { className: 'y-e-m' }, sk.label) : null),
        el('p', { className: 'y-small y-muted', style: { marginTop: 2 } }, r.line, r.id === 'sensors' ? ' ' : null, r.id === 'sensors' ? el(Cite, null, 'Table 7-7 · EotE p.237') : null),
        r.id === 'sensors' ? el('p', { className: 'y-mono', style: { marginTop: 2 } }, 'SCAN THE ENEMY · ' + upper((perc && perc.label) || 'Perception')) : null,
        mine.map(function (x) {
          var w = whoOf(x.c.who, reg, p.roster), at = placeOf(rec, x.c.where);
          return el('div', { key: x.i, className: 'y-crewrow', 'data-testid': 'ship-crewrow' },
            el('span', { className: 'y-who' }, el(WhoFace, { who: x.c.who, reg: reg, roster: p.roster, portraitFor: p.portraitFor }),
              el('span', null, el('span', { className: 'y-who-n' }, (w && w.name) || '—'), el('br'),
                el('span', { className: 'y-who-m' }, (w && w.kind === 'char' ? 'THE PARTY' : w && w.kind === 'npc' ? 'NPC LIBRARY' : 'CREW') + (at ? ' · IN THE ' + upper(at.area.name) : ' · NO AREA SET')))),
            el('span', { className: 'y-row', style: { gap: 6 } }, poolDice(seatD(p, x.c), 'crew-' + r.id), heldOf(p.res) ? el(UpHeld) : null,
              el('button', { type: 'button', className: 'y-x', 'aria-label': 'remove from seat', 'data-testid': 'ship-crew-remove',
                onClick: function () { p.apply(function (s) { return V().unassignCrew(s, rec.id, x.i, p.now()); }); } }, '✕')));
        }),
        el('div', { className: 'y-row', style: { marginTop: 6 } },
          meName && !mine.some(function (x) { return x.c.who === p.me; }) ? el('button', { type: 'button', className: 'y-link y-seat',
            'data-testid': 'ship-crew-seat-own', 'aria-label': 'Seat ' + meName + ' as ' + r.label,
            onClick: function () { p.apply(function (s) { return V().assignCrew(s, rec.id, { who: p.me, role: r.id, where: null }, p.now()); }); } },
            '＋ SEAT ' + meName) : null,
          el('button', { type: 'button', className: 'y-link', 'data-inert': party ? undefined : 1, 'data-testid': 'ship-crew-add-party',
            'data-muted': party ? undefined : 1, disabled: !party,
            onClick: party ? function () { setPk(r.id); } : undefined }, '＋ FROM THE PARTY'),
          el('button', { type: 'button', className: 'y-link', 'data-inert': 1, 'data-testid': 'ship-crew-add-npc',
            'data-muted': 1, disabled: true }, '＋ FROM THE NPC LIBRARY')));
    }
    var canon = el('div', { className: 'y-plate', style: { padding: '12px 16px', marginTop: 14 } }, el('div', { className: 'y-row' },
      el('span', { className: 'y-mono' }, 'THE HULL’S CREW LINE'), crewLine(p.vrow) ? el('span', { className: 'y-canon' }, el('q', null, crewLine(p.vrow))) : null,
      el('span', { className: 'y-mono y-sp' }, crew.length + ' IN SEATS · NOTHING IS CAPPED')));
    var roles = crewRoles(reg), pr = pk ? crewRole(reg, pk) : null;
    var picker = pr && host && window.ReactDOM ? ReactDOM.createPortal(el(PickerLayer, { roster: p.roster, owner: null, portraitFor: p.portraitFor,
      title: pr.label + ' · FROM THE PARTY', titled: true, top: 58, tid: 'ship-crew-party-picker', onClose: function () { setPk(null); },
      onPick: function (k) { setPk(null); p.apply(function (s) { return V().assignCrew(s, rec.id, { who: k, role: pr.id, where: null }, p.now()); }); } }), host) : null;
    return el('div', { ref: root, 'data-testid': 'ship-crew' }, picker,
      canon,
      p.band === 'wide' ? el('div', { className: 'y-grid2', style: { marginTop: 10, gap: '0 18px', alignItems: 'start' } },
        el('div', { className: 'y-sec hp-bands' }, roles.slice(0, 4).map(role)), el('div', { className: 'y-sec hp-bands' }, roles.slice(4).map(role)))
        : el('div', { className: 'y-sec y-mt hp-bands' }, roles.map(role)));
  }
  // W5 · DOCK — repairs as the book prices them (V-RAW-110/111): ONE ledger, a row per item, each with what it takes
  // and its own REPAIRED, which writes the log. Shown, never deducted; nothing rolls.
  function fmtNum(n) { try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); } }
  function DockTab(props) {
    var p = props.p, rec = p.rec, res = p.res, reg = p.reg, VS = V();
    var ht = res ? res.hull_threshold : null, strain = rec.strain_current || 0, hull = rec.hull_current || 0, crits = rec.crits || [];
    var eng = (rec.crew || []).filter(function (c) { return c.role === 'engineer'; })[0] || null;
    var ed = eng ? seatD(p, eng) : null, en = eng ? whoName(eng.who, reg, p.roster) : null;
    var mech = (reg && reg.skills.mechanics && reg.skills.mechanics.label) || 'Mechanics';
    var critCite = (window._critTables && window._critTables.vehicle && window._critTables.vehicle.cite) || null;
    function run(fn) { p.apply(fn); }
    function row(key, item, takes, ctl) {
      return el('div', { key: key, className: 'y-rep', 'data-testid': 'ship-rep', 'data-rep': key }, item, el('div', { className: 'y-rep-t' }, takes), el('div', { className: 'y-rep-c' }, ctl));
    }
    function item(name, now, cite) { return el('div', { className: 'y-rep-i' }, el('span', { className: 'y-e-n' }, name), now, cite ? el(Cite, null, cite) : null); }
    var rows = [];
    if (strain > 0) rows.push(row('strain', item('SYSTEM STRAIN', el('span', { className: 'y-row' }, el('span', { className: 'y-big' }, strain), el('span', { className: 'y-mono' }, 'STRAIN NOW')), SHIP_RULE.strainDayCite),
      [el('span', { key: 'k', className: 'y-rep-k' }, 'DAYS'),
        el('div', { key: 'r', className: 'y-row' }, el('span', { className: 'y-big' }, '−' + SHIP_RULE.strainDay), el('span', { className: 'y-mono' }, 'A FULL DAY WITHOUT NEW STRAIN')),
        el('p', { key: 'p', className: 'y-e-t y-small' }, 'Clear in ' + Math.ceil(strain / SHIP_RULE.strainDay) + ' quiet days, or sooner with Damage Control.')],
      [el('button', { key: 'd', type: 'button', className: 'y-quiet', 'data-testid': 'ship-dock-day', onClick: function () { run(function (s) { return VS.passDay(s, rec.id, p.now()); }); } }, 'A DAY PASSES · −' + SHIP_RULE.strainDay),
        el('button', { key: 'r', type: 'button', className: 'y-quiet', 'data-testid': 'ship-dock-strain', onClick: function () { run(function (s) { return VS.repairStrain(s, rec.id, p.now(), null); }); } }, 'REPAIRED')]));
    crits.forEach(function (c, i) {
      var cp = critParts(reg, c);
      rows.push(row('crit' + i, item(cp.name, el('span', { className: 'y-mono' }, 'CRITICAL HIT · ' + upper(cp.sev)), critCite),
        [el('span', { key: 'k', className: 'y-rep-k' }, 'THE CHECK'),
          el('div', { key: 'r', className: 'y-row' }, poolDice(ed, 'dock-crit'), ed && ed.held ? el(UpHeld) : null, diffDice(cp.dice, 'dock-crit'), el('span', { className: 'y-mono' }, [upper(cp.sev), en, mech].filter(Boolean).join(' · '))),
          el('p', { key: 'p', className: 'y-e-t y-small' }, 'The repair check is a Mechanics check at the hit’s severity. Retry until it holds.')],
        el('button', { type: 'button', className: 'y-commit', 'data-testid': 'ship-dock-crit', onClick: function () { run(function (s) { return VS.repairCrit(s, rec.id, i, p.now(), null); }); } }, 'REPAIRED')));
    });
    if (hull > 0) {
      var quarter = ht != null ? ht / SHIP_RULE.hullQuarter : null;
      rows.push(row('hull', item('HULL TRAUMA', el('span', { className: 'y-row' }, el('span', { className: 'y-big' }, hull), el('span', { className: 'y-mono' }, 'POINTS TO REPAIR')), SHIP_RULE.hullCrCite),
        [el('span', { key: 'k', className: 'y-rep-k' }, 'CREDITS AND TIME'),
          el('div', { key: 'l', className: 'y-ledger-big', style: { marginTop: 2 } }, el('span', null, hull), el('small', null, 'POINTS'), el('em', null, '×'),
            el('span', null, fmtNum(SHIP_RULE.hullCr)), el('small', null, 'CR'), el('em', null, '='), el('span', null, fmtNum(hull * SHIP_RULE.hullCr)), el('small', null, 'CR')),
          el('p', { key: 'm', className: 'y-mono', style: { color: 'var(--doc-state)' } }, 'SHOWN, NEVER DEDUCTED · ' + (quarter != null && hull <= quarter ? 'DAYS' : 'WEEKS OR MONTHS')),
          el('p', { key: 'p', className: 'y-e-t y-small' }, 'In a slip or a dry dock, with the tools and the time. Damage up to a quarter of the threshold ('
            + (quarter != null ? quarter : '—') + ' points) takes days; more takes weeks or months. The price is the GM’s to set.')],
        el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-dock-hull', onClick: function () { run(function (s) { return VS.repairHull(s, rec.id, p.now(), null); }); } }, 'REPAIRED')));
    }
    var last = shipLog(p).filter(function (r) { return r.k === 'repaired'; }).slice(0, 1);
    return el('div', { 'data-testid': 'ship-dock' },
      el(SechC, { h: 'THE REPAIR LEDGER' }),
      el('div', { className: 'y-sec y-repl' }, p.band === 'wide' && rows.length ? el('div', { className: 'y-rep y-rep-h' }, el('span', null, 'WHAT NEEDS REPAIR'), el('span', null, 'WHAT IT TAKES'), el('span')) : null,
        rows.length ? rows : el('p', { className: 'y-small y-muted' }, 'Nothing needs repair.')),
      last.length ? el('div', { className: 'y-plate', style: { padding: '12px 16px', marginTop: 16 } },
        el('div', { className: 'y-log', style: { marginTop: 6 } }, last.map(function (r, k) { return el(LogLine, { key: k, r: r }); }))) : null);
  }
  // W6 · LOG — the ship's story, newest first; her name; RETIRE (not delete); DELETE, quieter, for a ship added by
  // mistake, with the shipped two-tap (the first tap arms it, a second within three seconds deletes).
  // DELETE THIS SHIP — the record, and every deck plan it kept on this device (K7: "vessel delete removes their blobs;
  // retire keeps them"; ruling `shipyard-s4-ship` R-S4SH-1). The ship's own picture lives in the record and goes with it.
  function removeShip(p) {
    var id = p.rec.id, UA = window.SWRPGUserArt;
    p.apply(function (s) { return V().removeVessel(s, id); });
    if (UA && UA.removePrefix && UA.vesselPrefix) UA.removePrefix(UA.vesselPrefix(id));
    p.nav({ room: 'hangar' });
  }
  function LogTab(props) {
    var p = props.p, rec = p.rec, VS = V();
    var nm = React.useState(rec.nickname || ''), name = nm[0], setName = nm[1];
    var ar = React.useState(false), armed = ar[0], setArmed = ar[1];
    React.useEffect(function () { if (!armed) return; var t = setTimeout(function () { setArmed(false); }, 3000); return function () { clearTimeout(t); }; }, [armed]);
    var called = rec.nickname || (p.vrow && p.vrow.name) || rec.vehicleKey;
    var nameBox = el(React.Fragment, { key: 'name' }, el(SechC, { h: 'HER NAME' }), el('div', { className: 'y-sec' }, el('div', { className: 'y-row' },
      el('input', { className: 'y-in', style: { flex: 1, minWidth: 0, fontWeight: 600 }, value: name, placeholder: (p.vrow && p.vrow.name) || rec.vehicleKey, 'aria-label': 'The ship’s name',
        'data-testid': 'ship-name-input', onChange: function (e) { setName(e.target.value); } }),
      el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-name-save',
        onClick: function () { p.update({ nickname: name.trim() || null }); } }, 'RENAME'))));
    var rows = shipLog(p);
    var list = el(React.Fragment, { key: 'list' }, el(SechC, { h: 'THE LOG', x: 'NEWEST FIRST' }), el('div', { className: 'y-sec', 'data-testid': 'ship-log' },
      el('div', { className: 'y-log' }, rows.map(function (r, k) {
        return el(LogLine, { key: k, r: r, onRemove: r.by && r.i != null ? function () { p.apply(function (s) { return VS.removeLine(s, rec.id, r.i, p.now()); }); } : null });
      })),
      el(LogInput, { p: p })));
    var retire = el(React.Fragment, { key: 'retire' }, el(SechC, { h: 'RETIRE' }), el('div', { className: 'y-sec' },
      el('div', { className: 'y-verbs' }, el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-retire',
        onClick: function () { p.apply(function (s) { return VS.retire(s, rec.id, null, p.now(), null); }); p.nav({ room: 'hangar' }); } }, 'RETIRE ' + upper(called))),
      el('div', { className: 'y-mistake' },
        el('p', { className: 'y-small y-muted' }, el('b', null, 'Added by mistake?'), ' Deleting erases ' + called + ' and her whole log for good. A ship that has flown belongs in the history: retire her instead.'),
        el('button', { type: 'button', className: 'y-del', 'data-armed': armed ? 1 : 0, 'data-testid': 'ship-delete',
          onClick: function () { if (!armed) { setArmed(true); return; } removeShip(p); } },
          armed ? 'TAP AGAIN TO DELETE' : 'DELETE THIS SHIP'))));
    return el('div', { 'data-testid': 'ship-logtab' }, p.band === 'wide'
      ? el('div', { className: 'y-grid2', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' } }, el('div', null, list), el('div', null, nameBox, retire))
      : [nameBox, list, retire]);
  }
  // W7 · TRADE — what she carries, who rides with her, how long the stores last and where she has been (frames_ship.cjs
  // W7; §14, R-S2M-9). The capacities, the hidden capacity and the part that gives it, the passengers and the hyperdrive
  // class are the ONE resolver's; an item's name, weight and (R) are the gear list's (useYdGear), a spare's name its
  // registry's; the rest is the record's own (CargoLine · Passenger · stores · RouteLine, SHIPYARD_Y2_SCHEMA §1). WB6
  // (Jason's page, `shipyard-s4-approvals` R-S4A-4) writes it: ＋ AN ITEM from the gear list, ＋ A LINE OF YOUR OWN, a line
  // opened in place (its count, where it rides, REMOVE; a line of your own also its words and its encumbrance), ＋ A NAME
  // and a passenger's ✕ — each one of the store's ops through `apply`, nothing charged and nothing logged. A spare's row is
  // FIT's to move (WB4). ＋ FROM THE NPC LIBRARY, RESUPPLY and PLOT A JUMP are inert for the walk (R-S4WC-7's inert four).
  // Not built, and listed at the gate: "+3 TO FIND" (the part prints it as prose, W1's precedent) and the next jump's days
  // (the route planner's composition lives inside the GM's universe map).
  function tradeLine(p, c) {
    var free = c.kind === 'free', spare = c.kind === 'part' || c.kind === 'weapon';
    var row = c.kind === 'item' ? (p.gear || {})[c.ref] : c.kind === 'part' ? (p.attById || {})[c.ref]
      : c.kind === 'weapon' ? (p.ctx.resolve.weapons || {})[c.ref] : null;
    var each = free || spare ? null : cargoEach(p, c);
    return { c: c, row: row || null, free: free, spare: spare, each: each,
      name: free ? (c.name || '—') : ((row && row.name) || c.ref || '—'),
      total: free ? (typeof c.enc === 'number' ? c.enc : null) : each == null ? null : each * c.qty };
  }
  // TRADE_NO_CHARGE ("Nothing is charged and no credits move. This records what she carries.") is CUT wherever TRADE printed it
  // (D-259; ruling `shipyard-cargo-build-gm-character-write` R-SCW-5: both add forms too)
  function tradeNum(v) { return v == null ? '—' : fmtNum(v); }
  function tradeEnc(t) { var s = String(t == null ? '' : t).trim(), v = Number(s); return s === '' || !isFinite(v) || v < 0 ? null : v; }
  // K2's stepper (− n +): each a 44px target; below 1 is refused
  function TradeStep(props) {
    return el('div', { className: 'y-ctqty', 'data-testid': props.tid },
      el('button', { type: 'button', className: 'y-ctb', 'aria-label': 'One less', 'data-testid': props.tid + '-less', disabled: props.n <= 1 ? true : undefined,
        onClick: function () { if (props.n > 1) props.set(props.n - 1); } }, '−'),
      el('b', null, props.n),
      el('button', { type: 'button', className: 'y-ctb', 'aria-label': 'One more', 'data-testid': props.tid + '-more', onClick: function () { props.set(props.n + 1); } }, '+'));
  }
  // WHERE it rides: THE HOLD, and HIDDEN on a ship with a hidden hold (the page: offered because this ship has a smuggling
  // compartment). The frame's segment draws 36px; the buttons keep AS-6's 44px floor.
  function TradeWhere(props) {
    var words = [[false, 'THE HOLD']].concat(props.hid ? [[true, 'HIDDEN']] : []);
    return el('div', { className: 'y-seg y-fh', role: 'tablist', 'data-testid': props.tid }, words.map(function (w) {
      var on = !!props.hidden === w[0];
      return el('button', { key: w[1], type: 'button', className: 'y-seg-b', 'data-on': on ? 1 : 0, 'aria-selected': on, 'data-where': w[0] ? 'hidden' : 'hold',
        onClick: function () { props.set(w[0]); } }, w[1]);
    }));
  }
  // the hold under a form: THE HOLD a → b OF cap, or HIDDEN, where the line would ride
  function tradeHoldTo(hold, add, hidden) {
    return hidden ? 'HIDDEN ' + tradeNum(hold.hidden) + ' → ' + tradeNum(hold.hidden + add) + ' OF ' + tradeNum(hold.hidCap)
      : 'THE HOLD ' + tradeNum(hold.open) + ' → ' + tradeNum(hold.open + add) + ' OF ' + tradeNum(hold.openCap);
  }
  // WB6 · ＋ AN ITEM: the gear list over the books switched on, searched by name — five rows at most, the count beside the
  // search. A row picked opens with its count and where it rides; INTO THE HOLD writes {kind:'item', ref, qty, hidden}.
  function TradeItemForm(props) {
    var p = props.p, hold = props.hold;
    var qs = React.useState(''), q = qs[0], setQ = qs[1];
    var ps = React.useState(null), pick = ps[0], setPick = ps[1];
    var ns = React.useState(1), qty = ns[0], setQty = ns[1];
    var hs = React.useState(false), hidden = hs[0], setHidden = hs[1];
    var SRC = window.SWRPGSources, cur = SRC && SRC.current ? SRC.current() : null, t = q.trim().toLowerCase(), hits = [];
    if (t && p.gear) Object.keys(p.gear).forEach(function (k) {
      var g = p.gear[k];
      if (g && String(g.name || '').toLowerCase().indexOf(t) !== -1 && (!(cur && cur.index) || SRC.isActiveWith(g, cur.index, cur.off))) hits.push({ k: k, g: g });
    });
    hits.sort(function (a, b) { return String(a.g.name) < String(b.g.name) ? -1 : String(a.g.name) > String(b.g.name) ? 1 : 0; });
    function commit(k) {
      p.apply(function (s) { return V().addCargo(s, p.rec.id, { kind: 'item', ref: k, qty: qty, hidden: hidden }, p.now()); });
      props.onDone();
    }
    return el('div', { 'data-testid': 'trade-item-form' },
      el('div', { className: 'y-row', style: { justifyContent: 'space-between', marginBottom: 10 } }, el('span', { className: 'y-e-n' }, '＋ FROM THE GEAR LIST')),   // the button's name is the form's heading (F11, R-SCW-5)
      el('div', { className: 'y-search' },
        el('input', { type: 'search', value: q, placeholder: 'Search the gear list…', 'aria-label': 'Search the gear list', 'data-testid': 'trade-item-search',
          style: { flex: 1, minWidth: 0, border: 0, background: 'transparent', font: 'inherit', color: 'var(--doc-ink)' },
          onChange: function (e) { setQ(e.target.value); setPick(null); } }),
        t ? el('b', { className: 'y-sp', 'data-testid': 'trade-item-count' }, hits.length + ' MATCH') : null),
      hits.slice(0, 5).map(function (h) {
        var g = h.g, e = typeof g.encumbrance === 'number' ? g.encumbrance : null;
        if (pick !== h.k) {
          var go = function () { setPick(h.k); setQty(1); };
          return el('div', { key: h.k, className: 'y-br-r', 'data-fit': 'fits', 'data-testid': 'trade-item-hit', 'data-key': h.k, role: 'button', tabIndex: 0,
            'aria-expanded': false, onClick: go, style: { cursor: 'pointer' }, onKeyDown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } } },
            el('div', { className: 'y-br-n' }, g.name, el(FitR, { a: g })), el('div', { className: 'y-br-m' }, el('span', null, 'ENCUMBRANCE ', el('b', null, tradeNum(e)))));
        }
        return el('div', { key: h.k, className: 'y-br-r y-br-open', 'data-fit': 'fits', 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'trade-item-pick', 'data-key': h.k },
          el('div', { className: 'y-br-n' }, g.name, el(FitR, { a: g })),
          el('div', { className: 'y-br-m' }, el('span', null, 'ENCUMBRANCE ', el('b', null, tradeNum(e)), ' EACH')),
          el('div', { className: 'y-row y-mt', style: { gap: 12 } }, el(TradeStep, { tid: 'trade-item-qty', n: qty, set: setQty }),
            el(TradeWhere, { tid: 'trade-item-where', hid: hold.hidCap > 0, hidden: hidden, set: setHidden })),
          el('p', { className: 'y-small', style: { marginTop: 8 }, 'data-testid': 'trade-item-hold' },
            'ENCUMBRANCE ' + tradeNum(e == null ? null : e * qty) + ' · ' + tradeHoldTo(hold, e == null ? 0 : e * qty, hidden)),
          el('div', { className: 'y-verbs y-brv' },
            el('button', { type: 'button', className: 'y-commit', 'data-testid': 'trade-item-commit', onClick: function () { commit(h.k); } }, 'INTO THE HOLD'),
            el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'trade-item-cancel', onClick: props.onDone }, 'CANCEL')));
      }));
  }
  // WB6 · ＋ A LINE OF YOUR OWN: its words, count, encumbrance (the whole line's) and where it rides → {kind:'free', …}
  function TradeLineForm(props) {
    var p = props.p, hold = props.hold;
    var ws = React.useState(''), words = ws[0], setWords = ws[1];
    var ns = React.useState(1), qty = ns[0], setQty = ns[1];
    var es = React.useState(''), enc = es[0], setEnc = es[1];
    var hs = React.useState(false), hidden = hs[0], setHidden = hs[1];
    var e = tradeEnc(enc);
    function commit() {
      if (!words.trim()) return;
      p.apply(function (s) { return V().addCargo(s, p.rec.id, { kind: 'free', name: words, qty: qty, enc: e, hidden: hidden }, p.now()); });
      props.onDone();
    }
    return el('div', { className: 'y-panel y-wb-form', 'data-testid': 'trade-line-form' }, el('div', { className: 'y-panel-h' }, '＋ OTHER CARGO'),
      el('div', { className: 'y-wb-fields' },
        el('label', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'NAME'),
          el('input', { className: 'y-in', value: words, 'aria-label': 'What it is', 'data-testid': 'trade-line-what', onChange: function (ev) { setWords(ev.target.value); } })),
        el('div', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'COUNT'), el(TradeStep, { tid: 'trade-line-qty', n: qty, set: setQty })),
        el('label', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'TOTAL ENCUMBRANCE'),
          el('input', { className: 'y-in', inputMode: 'decimal', style: { width: 88 }, value: enc, 'aria-label': 'Encumbrance for the whole line', 'data-testid': 'trade-line-enc',
            onChange: function (ev) { setEnc(ev.target.value); } })),
        el('div', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'WHERE'), el(TradeWhere, { tid: 'trade-line-where', hid: hold.hidCap > 0, hidden: hidden, set: setHidden })),
        el('p', { className: 'y-small', style: { margin: 0 }, 'data-testid': 'trade-line-hold' }, tradeHoldTo(hold, e || 0, hidden)),
        el('div', { className: 'y-verbs' },
          el('button', { type: 'button', className: 'y-commit', disabled: words.trim() ? undefined : true, 'data-testid': 'trade-line-commit', onClick: commit }, 'INTO THE HOLD'),
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'trade-line-cancel', onClick: props.onDone }, 'CANCEL'))));
  }
  // WB6 · a cargo line open in place: its count and where it rides, REMOVE and ✕, each change kept as it is made; a line of
  // your own also edits its name and its total encumbrance here; an item line also UNLOADs (SHIP CARGO)
  function TradeEdit(props) {
    var p = props.p, x = props.x, c = x.c, hold = props.hold;
    function ed(patch) { p.apply(function (s) { return V().editCargo(s, p.rec.id, c.id, patch, p.now()); }); }
    var ws = React.useState(c.name || ''), words = ws[0], setWords = ws[1];
    var es = React.useState(c.enc == null ? '' : String(c.enc)), enc = es[0], setEnc = es[1];
    return el('tr', { className: 'y-cg-edit', 'data-testid': 'trade-edit', 'data-key': c.id }, el('td', { colSpan: 4 },
      x.free ? el('div', { className: 'y-wb-fields', style: { padding: '0 0 10px' } },
        el('label', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'NAME'),
          el('input', { className: 'y-in', value: words, 'aria-label': 'What it is', 'data-testid': 'trade-edit-what', onChange: function (ev) { setWords(ev.target.value); },
            onBlur: function () { if (words.trim() && words.trim() !== c.name) ed({ name: words }); } })),
        el('label', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'TOTAL ENCUMBRANCE'),
          el('input', { className: 'y-in', inputMode: 'decimal', style: { width: 88 }, value: enc, 'aria-label': 'Encumbrance for the whole line', 'data-testid': 'trade-edit-enc',
            onChange: function (ev) { setEnc(ev.target.value); }, onBlur: function () { var v = tradeEnc(enc); if (v !== c.enc) ed({ enc: v }); } }))) : null,
      el('div', { className: 'y-row', style: { gap: 12, flexWrap: 'wrap' } },
        el('span', { className: 'y-wb-k' }, 'COUNT'), el(TradeStep, { tid: 'trade-edit-qty', n: c.qty, set: function (n) { ed({ qty: n }); } }),
        el(TradeWhere, { tid: 'trade-edit-where', hid: hold.hidCap > 0 || c.hidden, hidden: c.hidden, set: function (h) { ed({ hidden: h }); } }),
        el('button', { type: 'button', className: 'y-quiet', style: { marginLeft: 'auto' }, 'data-testid': 'trade-edit-remove',
          onClick: function () { p.apply(function (s) { return V().removeCargo(s, p.rec.id, c.id, p.now()); }); props.onClose(); } }, 'REMOVE'),
        el('button', { type: 'button', className: 'y-x', 'aria-label': 'close the line', 'data-testid': 'trade-edit-close', onClick: props.onClose }, '✕')),
      // SHIP CARGO · UNLOAD (F-1, R-SCF-2): an item line's own act, where the host can write a character (the GM's is owed, R-SCW-3);
      // "Each change is kept as you make it…" is CUT (D-259)
      c.kind === 'item' && p.write ? el(CargoUnload, { p: p, x: x, hold: hold, onDone: props.onClose }) : null));
  }
  // WB6 · ＋ A NAME: the name, and where aboard — the ship's own deck areas as chips (none chosen: NO AREA SET)
  function TradeNameForm(props) {
    var p = props.p, rec = p.rec;
    var ns = React.useState(''), name = ns[0], setName = ns[1];
    var ws = React.useState(null), where = ws[0], setWhere = ws[1];
    var areas = [];
    (rec.decks || []).forEach(function (d) { (d.areas || []).forEach(function (a) { areas.push({ deck: d.id, area: a.id, name: a.name }); }); });
    function commit() {
      if (!name.trim()) return;
      p.apply(function (s) { return V().addPassenger(s, rec.id, name, where, p.now()); });
      props.onDone();
    }
    return el('div', { className: 'y-panel y-wb-form', 'data-testid': 'trade-name-form' }, el('div', { className: 'y-panel-h' }, '＋ A NAME'),
      el('div', { className: 'y-wb-fields' },
        el('label', { className: 'y-wb-f' }, el('span', { className: 'y-wb-k' }, 'NAME'),
          el('input', { className: 'y-in', value: name, 'aria-label': 'The passenger’s name', 'data-testid': 'trade-name-name', onChange: function (ev) { setName(ev.target.value); } })),
        areas.length ? el(React.Fragment, null, el('div', { className: 'y-wb-k' }, 'WHERE ABOARD'),
          el('div', { className: 'y-fchips', style: { padding: 0 } }, areas.map(function (a) {
            var on = !!where && where.deck === a.deck && where.area === a.area;
            return el('button', { key: a.deck + '/' + a.area, type: 'button', className: 'y-chipb', 'data-on': on ? 1 : 0, 'aria-pressed': on, 'data-testid': 'trade-name-area',
              'data-area': a.area, onClick: function () { setWhere(on ? null : { deck: a.deck, area: a.area }); } }, upper(a.name));
          }))) : null,
        el('div', { className: 'y-verbs' },
          el('button', { type: 'button', className: 'y-commit', disabled: name.trim() ? undefined : true, 'data-testid': 'trade-name-commit', onClick: commit }, 'ADD THE PASSENGER'),
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'trade-name-cancel', onClick: props.onDone }, 'CANCEL'))));
  }
  // ── SHIP CARGO · TRADE's faces (card `shipyard-cargo-build` F-1; the approved frames v3 @ ui-lab 318935e2e, D-265, R-SCF-1..7) ──
  // The HELD reason (R-SCG-6): ONE string for the sheet's gear row and TRADE's LOAD FROM list.
  var CARGO_HELD = 'Homebrew item: it can’t go into a ship’s hold yet.';
  // The over line (R-SCG-5, s-c1): never a refusal; hard points' idiom ("… OVER THE BOOK’S BUDGET · YOUR TABLE’S CALL")
  function cargoOver(used, cap, key) {
    if (cap == null || !(used > cap)) return null;
    return el('span', { key: key || 'over', className: 'y-warn y-sc-warn', 'data-testid': 'cargo-over' }, (used - cap) + ' OVER THE BOOK’S CAPACITY · YOUR TABLE’S CALL');
  }
  function cargoOwnerId(rec) { return /^char:/.test(String((rec && rec.owner) || '')) ? String(rec.owner).slice(5) : null; }
  // R-SCG-4 WHO, as the act reads it (cargoInScope): the roster the host hands, owner first
  function cargoScope(p) {
    var own = cargoOwnerId(p.rec), all = (p.roster || []).filter(function (c) { return c && c.id != null && cargoInScope(p.host, p.rec, String(c.id)); });
    return all.filter(function (c) { return String(c.id) === own; }).concat(all.filter(function (c) { return String(c.id) !== own; }));
  }
  // a character's REGISTRY gear entries (R-SCG-1: a gear id the gear list holds); an inline copy is HELD (R-SCG-6)
  function cargoEntries(c, gear) {
    var eq = (c && c.sheetData && c.sheetData.equipment) || {};
    return (eq.gear || []).map(function (g, i) { return { g: g, i: i, row: g && g.id != null && !g._inline && gear ? gear[g.id] : null }; })
      .filter(function (x) { return !!x.row && !cargoMarked(x.g); });   // R-SCG0-3: a marked copy is not offered (absent, not greyed)
  }
  function cargoHeldOf(c) {
    var eq = (c && c.sheetData && c.sheetData.equipment) || {};
    return (eq.gear || []).filter(function (g) { return g && g._inline; });
  }
  function cargoChips(list, on, tid, set) {
    return el('div', { className: 'y-fchips y-sc-chips', 'data-testid': tid }, list.map(function (c) {
      var o = String(c.id) === String(on);
      return el('button', { key: c.id, type: 'button', className: 'y-chipb y-sc-chip', 'data-on': o ? 1 : 0, 'aria-pressed': o, 'data-id': c.id,
        onClick: function () { set(c.id); } }, upper(c.name));
    }));
  }
  // the act's context from a room's p: the host's write and roster, the gear list, the ship's name (R-SCB-2)
  function cargoOf(p) {
    return { host: p.host, write: p.write, roster: p.roster || [], now: p.now, shipName: function (r) { return shipName(r, r === p.rec ? p.vrow : null); },
      gearRow: function (ref) { return (p.gear && p.gear[ref]) || null; } };
  }
  // F-1 · LOAD FROM ‹character› (R-SCF-1): the character in scope · one of their registry gear entries (name, held count,
  // each one's encumbrance) · the count · where it rides · the preview THE HOLD a → b OF N, with the over line · LOAD
  function CargoLoadForm(props) {
    var p = props.p, hold = props.hold, scope = cargoScope(p);
    var fs = React.useState((scope[0] && scope[0].id) || null), from = fs[0], setFrom = fs[1];
    var ps = React.useState(null), pick = ps[0], setPick = ps[1];
    var ns = React.useState(1), qty = ns[0], setQty = ns[1];
    var hs = React.useState(false), hidden = hs[0], setHidden = hs[1];
    var who = scope.filter(function (c) { return String(c.id) === String(from); })[0] || null;
    var rows = cargoEntries(who, p.gear);
    function commit(x) {
      var got = cargoLoad(cargoOf(p), String(who.id), x.i, p.rec.id, qty, hidden);
      if (got.ok) props.onDone();
    }
    return el('div', { 'data-testid': 'cargo-load-form' },
      el('div', { className: 'y-row', style: { justifyContent: 'space-between', marginBottom: 10 } }, el('span', { className: 'y-e-n' }, who ? 'LOAD FROM ' + upper(who.name) : 'LOAD FROM A CHARACTER')),
      scope.length > 1 ? el('div', { style: { marginBottom: 10 } }, el('span', { className: 'y-wb-k' }, 'FROM'),
        cargoChips(scope, from, 'cargo-load-from', function (id) { setFrom(id); setPick(null); setQty(1); })) : null,
      rows.map(function (x) {
        var g = x.row, e = typeof g.encumbrance === 'number' ? g.encumbrance : null, n = Math.max(1, Number(x.g.qty) || 1);
        if (pick !== x.i) {
          var go = function () { setPick(x.i); setQty(1); };
          return el('div', { key: x.i, className: 'y-br-r', 'data-fit': 'fits', 'data-testid': 'cargo-load-hit', 'data-key': x.g.id, role: 'button', tabIndex: 0, 'aria-expanded': false,
            onClick: go, style: { cursor: 'pointer' }, onKeyDown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } } },
            el('div', { className: 'y-br-n' }, g.name + (n > 1 ? ' ×' + n : ''), el(FitR, { a: g })),
            el('div', { className: 'y-br-m' }, el('span', null, 'ENCUMBRANCE ', el('b', null, tradeNum(e)), ' EACH')));
        }
        var add = e == null ? 0 : e * qty, to = hidden ? hold.hidden + add : hold.open + add, cap = hidden ? hold.hidCap : hold.openCap;
        return el('div', { key: x.i, className: 'y-br-r y-br-open', 'data-fit': 'fits', 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'cargo-load-pick', 'data-key': x.g.id },
          el('div', { className: 'y-br-n' }, g.name + (n > 1 ? ' ×' + n : ''), el(FitR, { a: g })),
          el('div', { className: 'y-br-m' }, el('span', null, 'ENCUMBRANCE ', el('b', null, tradeNum(e)), ' EACH')),
          el('div', { className: 'y-row y-mt', style: { gap: 12, flexWrap: 'wrap' } }, el(TradeStep, { tid: 'cargo-load-qty', n: qty, set: function (v) { setQty(Math.min(n, v)); } }),
            el('span', { className: 'y-mono y-sc-of' }, 'OF ' + n),
            hold.hidCap > 0 ? el(TradeWhere, { tid: 'cargo-load-where', hid: true, hidden: hidden, set: setHidden }) : null),
          el('p', { className: 'y-small y-sc-read', style: { marginTop: 8 }, 'data-testid': 'cargo-load-hold' },
            'ENCUMBRANCE ' + tradeNum(e == null ? null : add) + ' · ' + tradeHoldTo(hold, add, hidden)),
          cargoOver(to, cap) ? el('p', { style: { margin: '8px 0 0' } }, cargoOver(to, cap)) : null,
          el('div', { className: 'y-verbs y-brv' },
            el('button', { type: 'button', className: 'y-commit', 'data-testid': 'cargo-load-commit', onClick: function () { commit(x); } }, 'LOAD'),
            el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'cargo-load-cancel', onClick: props.onDone }, 'CANCEL')));
      }),
      cargoHeldOf(who).map(function (g, i) {
        var n = Math.max(1, Number(g.qty) || 1);
        return el('div', { key: 'h' + i, className: 'y-br-r y-sc-held', 'data-testid': 'cargo-load-held', 'data-key': g._inline.id },
          el('div', { className: 'y-br-n' }, (g._inline.name || '') + (n > 1 ? ' ×' + n : '')),
          el('p', { className: 'y-small y-sc-read', style: { margin: '4px 0 0' } }, CARGO_HELD));
      }));
  }
  // F-1 · UNLOAD on an item line open in place (R-SCF-2): a count and a recipient — an owned ship's owner preselected, a
  // party ship the roster pick. The line's count drops, or the line goes at 0; the goods join the recipient's gear.
  function CargoUnload(props) {
    var p = props.p, x = props.x, c = x.c, hold = props.hold, scope = cargoScope(p), own = cargoOwnerId(p.rec);
    var ns = React.useState(1), qty = ns[0], setQty = ns[1];
    var ts = React.useState(own), to = ts[0], setTo = ts[1];
    var each = typeof x.each === 'number' ? x.each : null, off = each == null ? 0 : each * Math.min(qty, c.qty);
    var who = scope.filter(function (r) { return String(r.id) === String(to); })[0] || null;
    function commit() {
      if (!who) return;
      var got = cargoUnload(cargoOf(p), p.rec.id, c.id, String(who.id), Math.min(qty, c.qty));
      if (got.ok) props.onDone();
    }
    return el('div', { className: 'y-sc-un', 'data-testid': 'cargo-unload' },
      el('div', { className: 'y-row', style: { gap: 12, flexWrap: 'wrap' } },
        el('span', { className: 'y-wb-k' }, 'UNLOAD'), el(TradeStep, { tid: 'cargo-unload-qty', n: Math.min(qty, c.qty), set: function (v) { setQty(Math.min(c.qty, v)); } }),
        el('span', { className: 'y-mono y-sc-of' }, 'OF ' + c.qty)),
      el('div', { style: { marginTop: 8 } }, el('span', { className: 'y-wb-k' }, 'TO'), cargoChips(scope, to, 'cargo-unload-to', setTo)),
      el('p', { className: 'y-small y-sc-read', style: { margin: '8px 0 0' }, 'data-testid': 'cargo-unload-hold' }, tradeHoldTo(hold, -off, !!c.hidden)),
      el('div', { className: 'y-verbs' },
        el('button', { type: 'button', className: 'y-commit', 'data-testid': 'cargo-unload-commit', 'aria-disabled': who ? undefined : 'true', onClick: commit }, 'UNLOAD')));
  }
  function TradeTab(props) {
    var p = props.p, rec = p.rec, res = p.res, n = tradeNum;
    var fs = React.useState(null), form = fs[0], setForm = fs[1];      // WB6: 'item' · 'line' · 'name' — the form open
    var os = React.useState(null), open = os[0], setOpen = os[1];      // WB6: the cargo line open in place (its id)
    var hs = React.useState(null), host = hs[0], setHost = hs[1];      // the phone's item sheet stands over the room, in its host
    var root = React.useRef(null);
    React.useEffect(function () { if (root.current && root.current.closest) setHost(root.current.closest('.yd-host')); }, []);
    var phone = p.band === 'narrow';
    function row(x) {
      var mark = x.free ? 'OTHER CARGO' : x.spare ? 'SPARE' : null, isOpen = open === x.c.id, door = !x.spare;
      var name = el(React.Fragment, null, x.name, x.row ? el(FitR, { a: x.row }) : null, mark ? el('span', { className: 'y-mono', style: { display: 'block' } }, mark) : null);
      var tr = el('tr', { key: x.c.id, className: isOpen ? 'y-cg-open' : undefined, 'data-open': isOpen ? 1 : undefined, 'data-free': x.free ? 1 : undefined, 'data-kind': x.c.kind,
        'data-testid': 'trade-line', 'data-key': x.c.id, onClick: door ? function () { setOpen(isOpen ? null : x.c.id); } : undefined, style: door ? { cursor: 'pointer' } : undefined },
        // a line's door is its name, a button in the ink of the text (a row holds no role; a spare's doors are FIT's)
        el('td', { className: 'y-cg-n' }, door ? el('button', { type: 'button', className: 'y-cg-door', 'aria-expanded': isOpen, 'data-testid': 'trade-line-door' }, name) : name),
        el('td', { className: 'y-cg-q' }, x.c.qty), el('td', { className: 'y-cg-e' }, n(x.each)), el('td', { className: 'y-cg-t' }, n(x.total)));
      return isOpen ? [tr, el(TradeEdit, { key: x.c.id + ':e', p: p, x: x, hold: hold, onClose: function () { setOpen(null); } })] : tr;
    }
    var hold = holdOf(p), lines = (rec.cargo || []).map(function (c) { return tradeLine(p, c); });
    var shown = lines.filter(function (x) { return x.c.id === open; }).length ? open : null;
    if (open != null && shown == null) open = null;   // the line is gone (removed, or changed under us): nothing stays open
    var openL = lines.filter(function (x) { return !x.c.hidden; }), hid = lines.filter(function (x) { return x.c.hidden; });
    var gives = (res && res.because.hidden || []).map(function (b) { return b.source; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
    // B-1015: HELD, the hold's capacities and the hyperdrive class are unknown and read the page's bold "—"; the HIDDEN line keeps
    // its place (R-S4CC-1: an unknown capacity is not a zero one), and every load, name and line stays
    var held = heldOf(res);
    var hidOn = held || hid.length > 0 || hold.hidCap > 0;
    function done() { setForm(null); }
    var inlineItem = form === 'item' && !phone, inlineLine = form === 'line', inlineLoad = form === 'load' && !phone;
    // SHIP CARGO: LOAD FROM leads the row where the host can write a character (both hosts since Part B, R-SCGS-1), named for the
    // owner of an owned ship, else LOAD FROM A CHARACTER
    var cWho = p.write ? cargoScope(p) : [], cOne = cWho.length && cargoOwnerId(rec) && String(cWho[0].id) === cargoOwnerId(rec) ? cWho[0] : null;
    var busy = inlineItem || inlineLine || inlineLoad;
    var cargo = el(React.Fragment, { key: 'cargo' }, el(SechC, { h: 'CARGO', cite: SHIP_RULE.sheet }),
      el('div', { className: 'y-sec', 'data-testid': 'trade-cargo' },
        el('table', { className: 'y-cargo' },
          el('thead', null, el('tr', null, el('th', null, 'ITEM'), el('th', null, 'COUNT'), el('th', null, 'ENC EACH'), el('th', null, 'ENCUMBRANCE'))),
          el('tbody', null,
            el('tr', null, el('td', { colSpan: 4, className: 'y-cg-h', 'data-testid': 'trade-hold-h' }, held ? ['THE HOLD · ' + n(hold.open) + ' OF ', el(DashB, { key: 'd' })]
              : ['THE HOLD · ' + n(hold.open) + ' OF ' + n(hold.openCap), cargoOver(hold.open, hold.openCap) ? ' ' : null, cargoOver(hold.open, hold.openCap, 'o')])),
            ), el('tbody', { className: 'hp-bands' }, openL.map(row)), el('tbody', null,
            hidOn ? el('tr', null, el('td', { colSpan: 4, className: 'y-cg-h', 'data-testid': 'trade-hidden-h' }, held ? ['HIDDEN · ' + n(hold.hidden) + ' OF ', el(DashB, { key: 'd' })]
              : [['HIDDEN · ' + n(hold.hidden) + ' OF ' + n(res ? hold.hidCap : null)].concat(gives).join(' · '), cargoOver(hold.hidden, res ? hold.hidCap : null) ? ' ' : null,
                cargoOver(hold.hidden, res ? hold.hidCap : null, 'h')])) : null,
            ), el('tbody', { className: 'hp-bands' }, hid.map(row))),
        el('div', { className: 'y-row y-mt' },
          el('span', { className: 'y-mono', 'data-testid': 'trade-aboard' }, 'ABOARD ' + n(hold.open + hold.hidden) + ' · CAPACITY ' + n(res ? res.encumbrance : null)),
          cWho.length && !busy ? el('button', { type: 'button', className: 'y-link y-sp y-sc-load', 'data-testid': 'cargo-load', onClick: function () { setOpen(null); setForm('load'); } },
            cOne ? '＋ LOAD FROM ' + upper(cOne.name) : '＋ LOAD FROM A CHARACTER') : null,
          busy ? null : el('button', { type: 'button', className: cWho.length ? 'y-link' : 'y-link y-sp', 'data-testid': 'trade-add-item', onClick: function () { setOpen(null); setForm('item'); } }, '＋ FROM THE GEAR LIST'),
          busy ? null : el('button', { type: 'button', className: 'y-link', 'data-testid': 'trade-add-line', onClick: function () { setOpen(null); setForm('line'); } }, '＋ OTHER CARGO')),
        inlineItem ? el('div', { className: 'y-panel y-wb-form', style: { marginTop: 12 } }, el('div', { style: { padding: '12px 14px' } }, el(TradeItemForm, { p: p, hold: hold, onDone: done }))) : null,
        inlineLine ? el(TradeLineForm, { p: p, hold: hold, onDone: done }) : null,
        inlineLoad ? el('div', { className: 'y-panel y-wb-form', style: { marginTop: 12 } }, el('div', { style: { padding: '12px 14px' } }, el(CargoLoadForm, { p: p, hold: hold, onDone: done }))) : null));
    var aboard = rec.passengers || [];
    var pax = el(React.Fragment, { key: 'pax' }, el(SechC, { h: 'PASSENGERS', x: aboard.length + ' OF ' + n(res ? res.passengers : null) }),
      el('div', { className: 'y-sec', 'data-testid': 'trade-pax' },
        aboard.map(function (x) {
          var w = whoOf(x.who, p.reg, p.roster), at = placeOf(rec, x.where);
          return el('div', { key: x.id, className: 'y-crewrow', 'data-testid': 'trade-pax-row', 'data-key': x.id },
            el('span', { className: 'y-who' }, el(WhoFace, { who: x.who, reg: p.reg, roster: p.roster, portraitFor: p.portraitFor }),
              el('span', null, el('span', { className: 'y-who-n' }, (w && w.name) || '—'), el('br'),
                el('span', { className: 'y-who-m' }, at ? 'IN THE ' + upper(at.area.name) : 'NO AREA SET'))),
            // WB6: ✕ takes a name off at once, no ask
            el('button', { type: 'button', className: 'y-x', 'aria-label': 'remove passenger', 'data-testid': 'trade-pax-remove',
              onClick: function () { p.apply(function (s) { return V().removePassenger(s, rec.id, x.id, p.now()); }); } }, '✕'));
        }),
        el('div', { className: 'y-row', style: { marginTop: 6 } },
          el('button', { type: 'button', className: 'y-link', 'data-inert': 1, 'data-testid': 'trade-pax-npc' }, '＋ FROM THE NPC LIBRARY'),
          form === 'name' ? null : el('button', { type: 'button', className: 'y-link', 'data-testid': 'trade-pax-name', onClick: function () { setForm('name'); } }, '＋ A NAME')),
        form === 'name' ? el(TradeNameForm, { p: p, onDone: done }) : null));
    var st = rec.stores, days = st ? st.days_out : null, jump = st ? st.next_jump : null;
    var stores = el(React.Fragment, { key: 'stores' }, el(SechC, { h: 'STORES' }),
      el('div', { className: 'y-dock y-sec', 'data-testid': 'trade-stores' },
        el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'PRINTED'), el('span', { className: 'y-e-m' }, SHIP_RULE.sheet)),
        el('div', { className: 'y-row', style: { marginTop: 4 } },
          el('span', { className: 'y-big', style: { fontSize: 22 }, 'data-testid': 'trade-consumables' }, (p.vrow && p.vrow.consumables) || '—'),
          el('span', { className: 'y-mono' }, 'OF CONSUMABLES')),
        el('table', { className: 'y-led', style: { marginTop: 8 } }, el('tbody', null,
          el('tr', null, el('td', { className: 'y-lk' }, 'OUT SINCE RESUPPLY'),
            el('td', { className: 'y-lv', 'data-testid': 'trade-days' }, days == null ? '—' : days + (days === 1 ? ' DAY' : ' DAYS'))),
          el('tr', null, el('td', { className: 'y-lk' }, 'NEXT JUMP'),
            el('td', { className: 'y-lv', 'data-testid': 'trade-jump' }, jump ? jump.from + ' → ' + jump.to : '—')))),
        el('div', { className: 'y-verbs' }, el('button', { type: 'button', className: 'y-quiet', 'data-inert': 1, 'data-testid': 'trade-resupply' }, 'RESUPPLY'))));
    var cls = res ? res.hyperdrive.primary : null;
    var routes = el(React.Fragment, { key: 'routes' }, el(SechC, { h: 'ROUTES', x: 'YOUR ASTROGATOR’S LOG' }),
      el('div', { className: 'y-sec hp-bands', 'data-testid': 'trade-routes' },
        (rec.routes || []).map(function (r) {
          return el('div', { key: r.id, className: 'y-e', 'data-testid': 'trade-route', 'data-kind': r.kind },
            el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, upper(r.from) + ' → ' + upper(r.to)),
              el('span', { className: 'y-e-m' }, r.kind === 'shortcut' ? 'FOUND · YOURS TO SELL' : 'YOUR LINE')),
            r.note ? el('p', { className: 'y-e-t y-small', style: { marginTop: 3 } }, r.note) : null);
        }),
        el('button', { type: 'button', className: 'y-door', 'data-inert': 1, 'data-testid': 'trade-plot' },
          el('span', null, el('span', { className: 'y-door-n' }, 'PLOT A JUMP'), el('br'),
            el('span', { className: 'y-door-m' }, held && cls === null && p.vrow && p.vrow.hyperdrive_primary > 0 ? ['THE ROUTE PLANNER · HYPERDRIVE CLASS ', el(DashB, { key: 'd' }), ' FROM THIS SHIP']
              : 'THE ROUTE PLANNER' + (cls != null ? ' · HYPERDRIVE CLASS ' + cls + ' FROM THIS SHIP' : ''))),
          el('span', { className: 'y-chev' }, '›'))));
    // WB6 @390: ＋ FROM THE GEAR LIST rises as a sheet over the room (the W2@390 sheet), in the host; LOAD FROM's form too (F-1)
    var over = (form === 'item' || form === 'load') && phone && host && window.ReactDOM ? ReactDOM.createPortal(
      el('div', { className: 'yd yd-over y-' + p.band, 'data-doc-ground': 'creator', 'data-yard-page': 'ship', 'data-testid': 'trade-over' },
        el(YHeldWrap, { onClose: done }, el('div', { className: 'y-scrim', 'data-testid': 'trade-scrim', onClick: done }),
          el('div', { className: 'y-sheet', style: { overflow: 'auto' }, 'data-testid': 'trade-sheet' }, el('div', { className: 'y-grab' }),
            el(form === 'load' ? CargoLoadForm : TradeItemForm, { p: p, hold: hold, onDone: done })))), host) : null;
    return el('div', { ref: root, 'data-testid': 'ship-trade' }, p.band === 'wide'
      ? [el('div', { key: 'g', className: 'y-grid2', style: { alignItems: 'start' } }, el('div', null, cargo, pax), el('div', null, stores, routes))]
      : [cargo, pax, stores, routes], over);
  }

  // ── THE DECKS (K7): a deck's plan is a picture from the player's device, kept in `SWRPGUserArt` under
  // `vessel:<vesselId>:deck:<deckId>` and never synced; its name, areas and pins travel with the ship's record. ──
  function mintKey(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function usePlan(key) {
    var st = React.useState({ key: key, url: null, here: false, ready: !key }), s = st[0], set = st[1];
    React.useEffect(function () {
      var UA = window.SWRPGUserArt, alive = true, un = null;
      if (!UA || !key) { set({ key: key, url: null, here: false, ready: true }); return undefined; }
      function read() {
        UA.ready().then(function () {
          if (!UA.hasArt(key)) { if (alive) set({ key: key, url: null, here: false, ready: true }); return; }
          UA.getUrl(key).then(function (u) { if (alive) set({ key: key, url: u, here: !!u, ready: true }); });
        });
      }
      read();
      if (UA.subscribe) un = UA.subscribe(read);
      return function () { alive = false; if (typeof un === 'function') un(); };
    }, [key]);
    return s.key === key ? s : { key: key, url: null, here: false, ready: false };
  }
  // the plan with its pins: frames_ship.cjs `plan` / `deckPlan` (`.y-deck[data-deck-plan]`, `.y-pin`, YOUR PLAN)
  function Plan(props) {
    var deck = props.deck, z = props.zoom || 1;
    var pins = (deck.areas || []).filter(function (a) { return a.x != null && a.y != null; });
    function tap(e) {
      if (!props.onPin) return;
      var b = e.currentTarget.getBoundingClientRect();
      if (!b.width || !b.height) return;
      props.onPin(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)));
    }
    return el('div', { className: 'y-deck', 'data-deck-plan': 1, 'data-testid': 'ship-plan', 'data-zoom': z !== 1 ? z : undefined },
      el('div', { className: 'y-deck-in', style: { width: (z * 100) + '%' }, onClick: props.onPin ? tap : undefined, 'data-pinning': props.onPin ? 1 : undefined },
        el('img', { src: props.url, alt: 'Deck plan' + (deck.name ? ': ' + deck.name : '') }),
        pins.map(function (a) {
          return el('span', { key: a.id, className: 'y-pin', 'data-drop': props.dropId === a.id ? 1 : undefined, style: { left: (a.x * 100) + '%', top: (a.y * 100) + '%' } },
            el('b', null, upper(a.name)), el('i'));
        })),
      props.onZoom ? el('div', { className: 'y-zoom' },
        el('button', { type: 'button', 'aria-label': 'Zoom in', 'data-testid': 'ship-plan-zoom-in', onClick: function () { props.onZoom(Math.min(3, z + 0.5)); } }, el('span', null, '+')),
        el('button', { type: 'button', 'aria-label': 'Zoom out', 'data-testid': 'ship-plan-zoom-out', onClick: function () { props.onZoom(Math.max(1, z - 0.5)); } }, el('span', null, '−'))) : null,
      el('span', { className: 'y-yours-lab', style: { position: 'absolute', left: 0, top: 0, bottom: 'auto' } }, 'YOUR PLAN'));
  }
  function PlanFile(props) {   // the one way a plan comes in: a picture from this device, stored under K7's key
    var ref = React.useRef(null);
    // B-1258: the file passes the ONE image check (`SWRPGPicture.check`) before anything is kept; a file that is not a
    // picture is refused in the same notice, with U1's own `not_picture` words.
    function onFile(e) {
      var f = e.target.files && e.target.files[0], UA = window.SWRPGUserArt, P = window.SWRPGPicture;
      e.target.value = '';
      if (!f || !UA || !P) return;
      P.check(f).then(function (r) {
        if (r.ok) props.onFile(f);
        else if (props.onRefused) props.onRefused(r.refused);
      });
    }
    return el(React.Fragment, null,
      el('button', { type: 'button', className: props.cls || 'y-quiet', 'data-testid': props.testid, onClick: function () { if (ref.current) ref.current.click(); } }, props.label),
      el('input', { ref: ref, type: 'file', accept: 'image/*', hidden: true, onChange: onFile, 'data-testid': (props.testid || 'ship-plan') + '-file' }));
  }
  // B-1262 (R-SYT-5): a browser that refuses to keep the plan (Safari's private window refuses a Blob in IndexedDB) says
  // so in the picture's refusal notice (U1's `y-pic-no` line, role=alert, dismissed by ✕); the words are this one line.
  // B-1258: a file that is not a picture takes the same notice with U1's approved `not_picture` words (`PIC_REFUSAL`).
  var PLAN_REFUSED = 'That plan couldn’t be kept on this device. A private window keeps no plans: add it from a normal one.';
  function PlanRefused(props) {
    var why = props.why === 'not_picture' ? 'not_picture' : 'plan_not_kept';
    return el('div', { className: 'y-picline', style: { textAlign: 'left' } },
      el('p', { className: 'y-pic-no', role: 'alert', 'data-refusal': why, 'data-testid': 'ship-plan-refused' },
        why === 'not_picture' ? PIC_REFUSAL.not_picture : PLAN_REFUSED),
      el('button', { type: 'button', className: 'y-x', 'aria-label': 'dismiss', onClick: props.onDismiss }, '✕'));
  }
  // one writer for a deck's plan: the blob under K7's key, then the deck's `art` names it (a first deck is made here).
  // A refused store write writes nothing to the record and calls `onRefused` (B-1262); it resolves to the deck's id, or null.
  function putPlan(p, deckId, file, onRefused) {
    var UA = window.SWRPGUserArt, rec = p.rec;
    var decks = (rec.decks || []).slice(), id = deckId || (decks[0] && decks[0].id) || mintKey('deck'), kept = false;
    var key = UA.deckKey(rec.id, id);
    return UA.setOne(key, file).then(function () {
      kept = true;
      p.apply(function (s) {
        var r = (s.vessels || []).filter(function (x) { return x.id === rec.id; })[0];
        if (!r) return s;
        var ds = (r.decks || []).slice();
        if (!ds.some(function (d) { return d.id === id; })) ds.push({ id: id, name: 'DECK ' + (ds.length + 1), art: key, areas: [] });
        return V().updateVessel(s, rec.id, { decks: ds.map(function (d) { return d.id === id ? Object.assign({}, d, { art: key }) : d; }) }, p.now());
      });
      return id;
    }, function (e) {
      if (kept) throw e;
      if (onRefused) onRefused(e);
      return null;
    });
  }
  function aboardBy(rec, deckId, reg, roster) {   // who is placed where on a deck: crew (NAME · ROLE) and passengers
    var by = {};
    (rec.crew || []).forEach(function (c) {
      if (c.where && c.where.deck === deckId && c.where.area) (by[c.where.area] = by[c.where.area] || []).push(whoName(c.who, reg, roster) + ' · ' + roleWord(c.role));
    });
    (rec.passengers || []).forEach(function (x) {
      if (x.where && x.where.deck === deckId && x.where.area) (by[x.where.area] = by[x.where.area] || []).push(whoName(x.who, reg, roster) + ' · PASSENGER');
    });
    return by;
  }

  // ── S4 · S5 · S6 · THE DECK ROOM (at the table: an instrument; nothing editable but S5's one door to a first plan) ──
  function DeckRoom(props) {
    var p = props.p, rec = p.rec, decks = rec.decks || [], wide = p.band === 'wide';
    var sel = React.useState(decks[0] ? decks[0].id : null), selId = sel[0], setSel = sel[1];
    var zm = React.useState(1), zoom = zm[0], setZoom = zm[1];
    var rf = React.useState(false), refused = rf[0], setRefused = rf[1];
    var deck = decks.filter(function (d) { return d.id === selId; })[0] || decks[0] || null;
    var plan = usePlan(deck && deck.art);
    var name = rec.nickname ? upper(rec.nickname) : upper((p.vrow && p.vrow.name) || rec.vehicleKey) + ' · ' + p.run;
    var head = el(React.Fragment, null,
      el('button', { type: 'button', className: 'y-back', style: { margin: '-8px 0 6px' }, 'data-testid': 'ship-deck-back', onClick: function () { p.go({ at: null }); } }, '‹ THE SHEET'),
      el('div', { className: 'y-runhead' }, el('span', null, name), el('span', null, 'AT THE TABLE')),
      el('div', { className: 'y-mast' }, el('h1', { className: 'y-h1' }, 'DECK')),
      decks.length > 1 ? el('div', { className: 'y-seg y-decksw', role: 'tablist', 'aria-label': 'Deck', 'data-testid': 'ship-deck-switch' }, decks.map(function (d) {
        var on = deck && d.id === deck.id;
        return el('button', { key: d.id, type: 'button', className: 'y-seg-b', role: 'tab', 'aria-selected': on, 'data-on': on ? 1 : 0, onClick: function () { setSel(d.id); setZoom(1); } }, d.name || '—');
      })) : null);
    // S5 · no plan yet: the one door to add one, and no placeholder art
    if (!decks.length || (decks.length === 1 && !deck.art && !(deck.areas || []).length)) {
      return el('div', { 'data-testid': 'ship-deckroom', 'data-state': 'empty' }, head, el('div', { className: 'y-empty y-sec', style: { marginTop: 18 } },
        el('div', { className: 'y-empty-h' }, 'NO PLAN YET — ADD ONE'),
        refused ? el(PlanRefused, { why: refused, onDismiss: function () { setRefused(false); } })
          : el(PlanFile, { cls: 'y-commit', label: 'ADD A PLAN', testid: 'ship-plan-add', onRefused: setRefused, onFile: function (f) { putPlan(p, deck ? deck.id : null, f, function () { setRefused('plan_not_kept'); }); } })));
    }
    function aboard() {
      if (decks.length > 1) {
        return el(React.Fragment, null, el(SechC, { h: 'WHO IS ABOARD' }), el('div', { className: 'y-sec', 'data-testid': 'ship-aboard' }, decks.map(function (d) {
          var by = aboardBy(rec, d.id, p.reg, p.roster), areas = (d.areas || []).filter(function (a) { return by[a.id]; });
          return el('div', { key: d.id, className: 'y-deckgrp' },
            el(DeckGroupHead, { deck: d }),
            areas.length ? areas.map(function (a) {
              return el('div', { key: a.id, className: 'y-e' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'IN THE ' + upper(a.name))),
                el('div', { className: 'y-aboard' }, by[a.id].map(function (x, k) { return el('span', { key: k }, x); })));
            }) : el('p', { className: 'y-small y-muted' }, 'Nobody placed on this deck.'));
        })));
      }
      var by = aboardBy(rec, deck.id, p.reg, p.roster);
      var none = (rec.crew || []).filter(function (c) { return !placeOf(rec, c.where); });
      return el(React.Fragment, null, el(SechC, { h: 'WHO IS ABOARD' }), el('div', { className: 'y-sec', 'data-testid': 'ship-aboard' },
        (deck.areas || []).filter(function (a) { return by[a.id]; }).map(function (a) {
          return el('div', { key: a.id, className: 'y-e' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'IN THE ' + upper(a.name))),
            el('div', { className: 'y-aboard' }, by[a.id].map(function (x, k) { return el('span', { key: k }, x); })));
        }),
        none.length ? el('div', { className: 'y-e' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n y-muted' }, 'NO AREA SET')),
          el('div', { className: 'y-aboard' }, none.map(function (c, k) { return el('span', { key: k }, whoName(c.who, p.reg, p.roster) + ' · ' + roleWord(c.role)); }))) : null));
    }
    var areas = el(React.Fragment, null, el(SechC, { h: decks.length > 1 ? 'AREAS ON THIS DECK' : 'AREAS', x: 'THE CREW’S OWN NAMES' }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-areas' }, (deck.areas || []).map(function (a) {
        return el('div', { key: a.id, className: 'y-e' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, upper(a.name)),
          a.x != null && a.y != null ? el('span', { className: 'y-e-m' }, 'PINNED') : null),
          a.note ? el('p', { className: 'y-e-t y-small', style: { marginTop: 3 } }, a.note) : null);
      })));
    // S5 · the plan was added on another device: the areas and who is aboard still show (they travel with the ship)
    var planBox = plan.here ? el('div', { className: 'y-sec' + (wide ? '' : ' y-mt') }, el(Plan, { deck: deck, url: plan.url, zoom: zoom, onZoom: wide ? setZoom : null }))
      : plan.ready ? el('div', { className: 'y-empty y-sec', style: { marginTop: 18, padding: '22px 16px' }, 'data-testid': 'ship-plan-elsewhere' },
        el('div', { className: 'y-empty-h', style: { fontSize: 14 } }, deck.art ? 'THE PLAN IS ON ANOTHER DEVICE' : 'NO PLAN YET')) : null;
    return el('div', { 'data-testid': 'ship-deckroom', 'data-state': plan.here ? 'plan' : 'absent' }, head, wide && plan.here
      ? el('div', { className: 'y-grid2', style: { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', marginTop: 14, alignItems: 'start' } }, el('div', null, planBox), el('div', null, aboard(), areas))
      : el(React.Fragment, null, planBox, aboard(), areas));
  }
  function DeckGroupHead(props) {   // a deck's group head in WHO IS ABOARD, saying when its plan is on another device
    var d = props.deck, plan = usePlan(d.art), away = !!d.art && plan.ready && !plan.here;
    return el(React.Fragment, null,
      el('div', { className: 'y-deckgrp-h' }, d.name || '—', away ? el('span', { className: 'y-mono' }, 'THE PLAN IS ON ANOTHER DEVICE') : null));
  }

  // ── W8 · W9 · THE DECK TAB (between sessions): the plan replaced from this device, each area's name and note written,
  // pins dropped; with several decks, the decks list above (rename, order, remove with its consequence said). ──
  function DeckTab(props) {
    var p = props.p, rec = p.rec, decks = rec.decks || [], VS = V(), UA = window.SWRPGUserArt;
    var sel = React.useState(decks[0] ? decks[0].id : null), selId = sel[0], setSel = sel[1];
    var pin = React.useState(null), pinning = pin[0], setPinning = pin[1];
    var rn = React.useState(null), renaming = rn[0], setRenaming = rn[1];
    var rf = React.useState(false), refused = rf[0], setRefused = rf[1];
    var deck = decks.filter(function (d) { return d.id === selId; })[0] || decks[0] || null;
    var plan = usePlan(deck && deck.art);
    function writeDecks(fn, extra) {
      p.apply(function (s) {
        var r = (s.vessels || []).filter(function (x) { return x.id === rec.id; })[0];
        if (!r) return s;
        var patch = Object.assign({ decks: fn((r.decks || []).slice()) }, extra ? extra(r) : null);
        return VS.updateVessel(s, rec.id, patch, p.now());
      });
    }
    function ensureDeck() {   // a ship with no deck yet gets its first when the player first writes to one
      if (deck) return deck.id;
      var id = mintKey('deck');
      writeDecks(function (ds) { return ds.concat([{ id: id, name: 'DECK 1', art: null, areas: [] }]); });
      setSel(id);
      return id;
    }
    function patchArea(deckId, areaId, patch) {
      writeDecks(function (ds) { return ds.map(function (d) { return d.id !== deckId ? d : Object.assign({}, d, { areas: (d.areas || []).map(function (a) { return a.id === areaId ? Object.assign({}, a, patch) : a; }) }); }); });
    }
    function addArea() {
      var id = ensureDeck(), aid = mintKey('area');
      writeDecks(function (ds) { return ds.map(function (d) { return d.id !== id ? d : Object.assign({}, d, { areas: (d.areas || []).concat([{ id: aid, name: '', note: null, x: null, y: null }]) }); }); });
    }
    function removeArea(deckId, areaId) {   // its pin goes, and anyone placed there loses their place, never the person
      var off = function (x) { return x.where && x.where.deck === deckId && x.where.area === areaId ? Object.assign({}, x, { where: { deck: deckId, area: null } }) : x; };
      writeDecks(function (ds) { return ds.map(function (d) { return d.id !== deckId ? d : Object.assign({}, d, { areas: (d.areas || []).filter(function (a) { return a.id !== areaId; }) }); }); },
        function (r) { return { crew: (r.crew || []).map(off), passengers: (r.passengers || []).map(off) }; });
      if (pinning === areaId) setPinning(null);
    }
    function addDeck() {
      var id = mintKey('deck');
      writeDecks(function (ds) { return ds.concat([{ id: id, name: 'DECK ' + (ds.length + 1), art: null, areas: [] }]); });
      setSel(id);
    }
    function moveDeck(i, by) { writeDecks(function (ds) { var j = i + by; if (j < 0 || j >= ds.length) return ds; var t = ds[i]; ds[i] = ds[j]; ds[j] = t; return ds; }); }
    function removeDeck(d) {
      p.apply(function (s) { return VS.removeDeck(s, rec.id, d.id, p.now()); });
      if (d.art && UA) UA.removeOne(d.art);
      if (deck && deck.id === d.id) setSel(null);
    }
    var planWord = function (d, here) { return !d.art ? 'NO PLAN YET' : here ? 'PLAN ON THIS DEVICE' : 'THE PLAN IS ON ANOTHER DEVICE'; };
    var list = decks.length > 1 ? el(React.Fragment, { key: 'decks' }, el(SechC, { h: 'DECKS', x: 'THE CREW’S OWN NAMES' }), el('div', { className: 'y-sec', 'data-testid': 'ship-decks' },
      el('div', { className: 'hp-bands', 'data-run': '1' }, decks.map(function (d, i) {
        return el(DeckRow, { key: d.id, deck: d, i: i, n: decks.length, sel: deck && d.id === deck.id, renaming: renaming === d.id, planWord: planWord,
          onSelect: function () { setSel(d.id); setPinning(null); }, onRename: function () { setRenaming(d.id); },
          onName: function (v) { writeDecks(function (ds) { return ds.map(function (x) { return x.id === d.id ? Object.assign({}, x, { name: v }) : x; }); }); setRenaming(null); },
          onUp: function () { moveDeck(i, -1); }, onDown: function () { moveDeck(i, 1); }, onRemove: function () { removeDeck(d); } });
      })),
      el('p', { className: 'y-small y-muted', style: { marginTop: 10 } }, 'Removing a deck: its plan leaves this device, its areas go, and anyone placed there loses their place.'),
      el('div', { className: 'y-row y-mt' }, el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-deck-add', onClick: addDeck }, 'ADD A DECK')))) : null;
    var pinArea = pinning && deck ? (deck.areas || []).filter(function (a) { return a.id === pinning; })[0] : null;
    var planBox = el(React.Fragment, { key: 'plan' }, el(SechC, { h: 'THE PLAN', x: (decks.length > 1 && deck ? upper(deck.name || '—') + ' · ' : '') + 'ON THIS DEVICE' }),
      el('div', { className: 'y-sec', 'data-testid': 'ship-planbox' },
        plan.here ? el(Plan, { deck: deck, url: plan.url, dropId: pinning, onPin: pinArea ? function (x, y) { patchArea(deck.id, pinArea.id, { x: x, y: y }); setPinning(null); } : null })
          : el('div', { className: 'y-empty', style: { padding: '18px 16px' } }, el('div', { className: 'y-empty-h', style: { fontSize: 14 } }, deck && deck.art ? 'THE PLAN IS ON ANOTHER DEVICE' : 'NO PLAN YET — ADD ONE')),
        refused ? el(PlanRefused, { why: refused, onDismiss: function () { setRefused(false); } }) : el('div', { className: 'y-row y-mt' },
          el('span', { className: 'y-sp' }, el(PlanFile, { label: plan.here ? 'REPLACE THE PLAN' : 'ADD A PLAN', testid: 'ship-plan-replace', onRefused: setRefused, onFile: function (f) { putPlan(p, deck ? deck.id : null, f, function () { setRefused('plan_not_kept'); }).then(function (id) { if (id) setSel(id); }); } })))));
    var areas = deck ? deck.areas || [] : [];
    var edit = el(React.Fragment, { key: 'areas' }, el(SechC, { h: 'AREAS', x: String(areas.length) }), el('div', { className: 'y-sec', 'data-testid': 'ship-areaedit' },
      areas.map(function (a) {
        return el(AreaEdit, { key: a.id, area: a, pinning: pinning === a.id, canPin: plan.here,
          onName: function (v) { patchArea(deck.id, a.id, { name: v }); }, onNote: function (v) { patchArea(deck.id, a.id, { note: v || null }); },
          onPin: function () { setPinning(pinning === a.id ? null : a.id); }, onRemove: function () { removeArea(deck.id, a.id); } });
      }),
      el('div', { className: 'y-row y-mt' }, el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-area-add', onClick: addArea }, '＋ AN AREA'))));
    var addOne = decks.length > 1 ? null : el('div', { key: 'add', className: 'y-row y-mt' }, el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'ship-deck-add', onClick: addDeck }, 'ADD A DECK'));
    return el('div', { 'data-testid': 'ship-decktab', 'data-decks': decks.length }, list, p.band === 'wide'
      ? el('div', { className: 'y-grid2', style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' } }, el('div', null, planBox), el('div', null, edit, addOne))
      : [planBox, edit, addOne]);
  }
  function DeckRow(props) {
    var d = props.deck, plan = usePlan(d.art);
    var nm = React.useState(d.name || ''), name = nm[0], setName = nm[1];
    return el('div', { className: 'y-deckrow', 'data-sel': props.sel ? 1 : undefined, 'data-testid': 'ship-deckrow' },
      el('div', { className: 'y-deckrow-id' },
        props.renaming ? el('input', { className: 'y-in', value: name, autoFocus: true, 'aria-label': 'The deck’s name', onChange: function (e) { setName(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') props.onName(name.trim()); }, onBlur: function () { props.onName(name.trim()); } })
          : el('button', { type: 'button', className: 'y-deckname', onClick: props.onSelect, style: { textAlign: 'left' } }, d.name || '—'),
        el('span', { className: 'y-mono' }, props.planWord(d, plan.here) + ' · ' + (d.areas || []).length + ' AREAS')),
      el('div', { className: 'y-deckrow-c' },
        el('button', { type: 'button', className: 'y-link', onClick: props.onRename }, 'RENAME'),
        props.i > 0 ? el('button', { type: 'button', className: 'y-x', 'aria-label': 'move this deck up', onClick: props.onUp }, '↑') : null,
        props.i < props.n - 1 ? el('button', { type: 'button', className: 'y-x', 'aria-label': 'move this deck down', onClick: props.onDown }, '↓') : null,
        el('button', { type: 'button', className: 'y-del', onClick: props.onRemove }, 'REMOVE')));
  }
  function AreaEdit(props) {
    var a = props.area;
    var nm = React.useState(a.name || ''), name = nm[0], setName = nm[1];
    var nt = React.useState(a.note || ''), note = nt[0], setNote = nt[1];
    return el('div', { className: 'y-areaedit', 'data-testid': 'ship-area' },
      el('div', { className: 'y-row' },
        el('input', { className: 'y-in', style: { flex: 1, minWidth: 0, fontWeight: 600 }, value: name, placeholder: 'Area name', 'aria-label': 'Area name',
          onChange: function (e) { setName(e.target.value); }, onBlur: function () { if (name !== (a.name || '')) props.onName(name.trim()); } }),
        props.pinning ? el(Stamp, { k: 'bond' }, 'PINNING') : props.canPin ? el('button', { type: 'button', className: 'y-link', onClick: props.onPin }, 'MOVE PIN') : null,
        el('button', { type: 'button', className: 'y-x', 'aria-label': 'remove area', onClick: props.onRemove }, '✕')),
      el('textarea', { className: 'y-in y-small', style: { marginTop: 4, minHeight: 38, width: '100%', resize: 'vertical' }, value: note, placeholder: 'A note for this area', 'aria-label': 'Area note',
        onChange: function (e) { setNote(e.target.value); }, onBlur: function () { if (note !== (a.note || '')) props.onNote(note.trim()); } }));
  }

  // ══ FIT · W1 · W2 · W3 — the fitting window, element by element (frames_ship.cjs; K1's third door and K3,
  // frames_counter.cjs; U10 and U11, frames_undrawn.cjs — `shipyard-s2-approvals` §1–2, `shipyard-s4-approvals` R-S4A-1).
  // The parts browser groups by fit (E-S1C-3): installed, what fits this hull, what needs the GM, what does not fit. The
  // ring is the recognition schematic ringed by the hard points and the mounts; the panels are the ONE resolver's numbers,
  // each change credited to its part; the budget bar informs and never blocks. Fit is vesselStore's resolveFit over the
  // RESOLVED hull (asVehicle; B-925's census pins zero bare-row sites since the S5 flip, R-S5R-19); no roll fits a part (E-S1C-2). Writes, each one
  // of the store's ops through `apply`: ADD's install with its reason or a spare into the hold (K3), a choice (U10,
  // `chooseTarget`), REMOVE's choice (WB3, `removePart`), a spare fitted back or discarded (WB4). TO THE COUNTER is the
  // player host's only: the GM's app has no counter, so its row carries ADD · NO CHARGE and PLAN (WB1 · A — Jason's pick,
  // `shipyard-s4-approvals` R-S4A-5). FIT's own states — nothing to list, no match, loading, failed — are WB5's. PLAN from
  // an owned ship's row is JOB 4's, inert for the walk. The page: `Docs/mockups/shipyard-s4-workbench-undrawn.html` @
  // f948b022 (R-S4A-4). ══
  var FIT_REASONS = [['reward', 'REWARD'], ['salvaged', 'SALVAGED'], ['gift', 'GIFT'], ['built', 'BUILT'], ['aboard', 'ALREADY ABOARD']];
  // A1.6 (the brief's, RATIFIED as written): the Upgraded Weapons row is the RAW name of the act K4 performs, so FIT's parts
  // browser leaves it out of its groups (a second writer for the same act would change no weapon); K4's hard-point line reads
  // its hp_note. installAttachment refuses nothing: an old record holding it keeps it, and it prints under INSTALLED.
  var K4_ACT = 'upgraded_weapons';
  // SHIP YARD S8 (card `shipyard-s8-build` R-S8B-3): the offer paths' ONE rule is the store's `offerable` — a row with a `kind`
  // (an engine, a hull, a conversion: the 22 of S7's LEAVE_OUT, D-222) is never a part — plus K4's act. Read by fitModel's
  // groups and count, the plan's ?part=, the ITS MODS doors and the counter's fold (`counterSeam`'s `offered`). The records stay
  // in the registry, so a saved ship that holds one resolves, prints and comes off exactly as before (the full map, `_attById`).
  function offered(a) { var VS = V(); return !!a && a.id !== K4_ACT && !!VS && VS.offerable(a); }
  var FIT_ZONE_WORD = { fore: 'FORE', aft: 'AFT', port: 'PORT', starboard: 'STARBOARD' };
  var FIT_ZONE_ORDER = ['fore', 'aft', 'port', 'starboard'];   // the book's order (V-RAW-011), as the ruling's U10 line names them
  // the ring's box per band (frames_ship.cjs RING): the sockets on an ellipse round the schematic, the mounts on its edges
  var FIT_RING = { wide: { w: 560, h: 470, rx: 205, ry: 170, slot: 140, schem: 220 }, mid: { w: 420, h: 414, rx: 158, ry: 150, slot: 124, schem: 176 } };
  var FIT_RING_MAX = 10;   // past ten sockets the ellipse cannot hold them legibly: the hard points read as the phone's list
  function fitSign(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
  function fitMountWord(w) { return w.location ? w.location + (w.turret ? ' TURRET' : '') : (w.turret ? 'TURRET' : w.name); }
  // U10: the choices waiting — one per application (the part's base, then each mod rank) and kind (a zone, a weapon). A swap
  // waiting on a mount is not a choice and is not counted (the approved note).
  function fitChoices(res) {
    var seen = {}, out = [];
    ((res && res.pending) || []).forEach(function (e) {
      var k = e.att + '|' + (e.mod == null ? 'base' : e.mod) + '|' + e.op;
      if (e.target !== 'chosen' || e.att == null || seen[k]) return;
      seen[k] = 1;
      out.push(e);
    });
    return out;
  }
  // a part's mod line: its words, or (public copy, R-AE-10) the own_words label where the book-text scan blanked them
  function modLine(rec, field, i) {
    var S = window.SWRPGSources, m = rec && rec[field] && rec[field][i];
    return S && S.modWords ? S.modWords(rec, field, i) : (m && m.description) || '';
  }
  // W3's rule: a part whose rules name no number prints its text instead
  function fitPrints(row) {
    if (!row || (row.base_effects || []).length || (row.pool_mods || []).length) return [];   // pool_mods: R-M8C8-2's fold
    var said = (row.base_mods || []).map(function (m, i) { return modLine(row, 'base_mods', i); }).filter(Boolean);
    // S1 (argo-a1-curation ADDENDUM 4): a part whose printed rules were removed prints its book line once; null on holocron
    var S = window.SWRPGSources, s1 = !said.length && (row.base_mods || []).length && S && S.removedLine ? S.removedLine(row) : null;
    return s1 ? [s1] : said;
  }
  // every number a part can move, in the panels' order, printed as the panels print it; `key` names its `because`. The
  // list is the same for every record of one hull, so two readings compare row by row (W2's BEFORE → AFTER).
  function fitNums(res, zones) {
    var R = VR(), out = [];
    function n(id, label, v, key, o) { out.push(Object.assign({ id: id, label: label, v: v == null ? '—' : String(v), key: key }, o || {})); }
    n('hull', 'HULL TRAUMA THRESHOLD', res.hull_threshold, 'hull_threshold');
    n('strain', 'SYSTEM STRAIN THRESHOLD', res.strain_threshold, 'strain_threshold');
    n('massive', 'MASSIVE', res.massive, 'massive', { hide: !res.massive });   // W1 draws no MASSIVE for a hull without it
    zones.forEach(function (z) { n('def_' + z, FIT_ZONE_WORD[z], res.defense[z], 'defense_' + z); });
    n('armor', 'ARMOR', res.armor, 'armor');
    n('speed', 'SPEED', res.speed, 'speed');
    n('handling', 'HANDLING', res.handling == null ? null : fitSign(res.handling), 'handling');
    n('sensor', 'SENSOR RANGE', res.sensor_range ? (R.BAND_LABEL[res.sensor_range] || res.sensor_range) : null, 'sensor_range');
    n('hd', 'HYPERDRIVE CLASS', res.hyperdrive.primary || null, 'hyperdrive_primary');
    n('hdb', 'BACKUP CLASS', res.hyperdrive.backup || null, 'hyperdrive_backup');
    n('pass', 'PASSENGERS', res.passengers, 'passengers');
    n('enc', 'ENCUMBRANCE CAPACITY', res.encumbrance, 'encumbrance');
    n('hidden', 'HIDDEN', res.hidden || 0, 'hidden', { bare: true, hide: !res.hidden });
    (res.weapons || []).forEach(function (w, i) { n('w' + i, fitMountWord(w) + ' · DAMAGE', w.damage, 'weapon_' + i, { hide: true }); });
    var g = res.pools.gunnery;
    n('gun', 'GUNNERY', g && g.upgradeAbility ? upWord(g.upgradeAbility) : null, null, { bare: true, list: g ? g.because : [], hide: !(g && g.upgradeAbility) });
    return out;
  }
  // a number's credit, one line under it: "+1 · <part>", or the part alone where the number starts from nothing (HIDDEN, a
  // pool — W1's form); a floored hyperdrive says its floor ("−1, NOT BELOW 1 · Hyperdrive Generator", W3); a capped effect says
  // its ceiling in the same place ("+1, TO 6 · Single Ion Coil (mod)": R-S7V-4's words; shipyard-s7-build-card ADDENDUM 4, finding 8)
  function fitCredit(b, bare, noSource) {
    if (bare || typeof b.amount !== 'number') return b.source;   // a swap's credit names its act (Upgraded Weapons), no amount
    return fitSign(b.amount) + (typeof b.floor === 'number' ? ', NOT BELOW ' + b.floor : '')
      + (typeof b.ceiling === 'number' ? ', TO ' + b.ceiling : '') + (noSource ? '' : ' · ' + b.source);
  }
  // card ADDENDUM 15 H-2 (a), a view rule: a credit whose source is one of THIS ship's S8 records (its conversion template; the
  // build's frame, engine and hull at 6e/6g) prints "<NAME> · <cite>", the cite read from that record's own row, never typed;
  // the template's arc pick prints the same credit, without the resolver's " (chosen)". A part keeps the S4 idiom (no cite,
  // "(chosen)" kept): the sources are the ship's own S8 records by name, never a kind read across the list.
  function s8Sources(p) {
    var out = {}, c = convOn(p), b = p.rec && p.rec.build, by = p.attById || {};
    if (c) out[c.name] = s8Cite(c.cite);
    if (b) ['engine', 'hull'].forEach(function (k) { var row = b[k] && by[b[k].key]; if (row && row.kind === k) out[row.name] = s8Cite(row.cite); });
    return out;
  }
  // card ADDENDUM 17 (H-4 (a); R-Y2-1's print contract, on paper there): an S8 record's cite — a frame's `{book, page}`, or an
  // engine's, hull's or template's "<book> p.<page>" — printed "<LETTERS> p.<page>" (the chip's case is the stylesheet's, as
  // "DC p.71" always was). LETTERS = the upper-cased ONE alias of the book matching ^[a-z]{2,4}$ in books.vocab.json (`fo` →
  // FO, `dc` → DC), read through SWRPGSources' index. No such alias, two of them, or the vocabulary not in hand → the cite as
  // the row stores it: never blank, never guessed. CEILING: `aliases` are written for LOOKUP, not print (Special
  // Modifications' is `ss`), so this serves S8 records ONLY; every other cite keeps its print. B-1345 (a `short` column in the
  // vocabulary) is its upgrade path — this function's one read is where that column lands.
  function s8Cite(cite) {
    var book = null, page = null, stored = null, m;
    if (cite && typeof cite === 'object') { book = cite.book; page = cite.page; stored = window.SWRPGSources.pageCite(cite.book, cite.page); }
    else if (typeof cite === 'string') { stored = cite; m = /^(\S+) p\.(\S+)$/.exec(cite); if (m) { book = m[1]; page = m[2]; } }
    else return null;
    var ix = window._swrpgSourcesIndex, a2i = ix && ix.aliasToId;
    if (!a2i || book == null || page == null) return stored;
    var id = a2i[book] || a2i[String(book).toLowerCase()];
    if (!id) return stored;
    var short = Object.keys(a2i).filter(function (a) { return a2i[a] === id && /^[a-z]{2,4}$/.test(a); });
    return short.length === 1 ? window.SWRPGSources.pageCite(short[0].toUpperCase(), page) : stored;
  }
  function s8Credit(src, b) {
    var s = b && b.source, base = typeof s === 'string' ? s.replace(/ \(chosen\)$/, '') : s;
    if (typeof base !== 'string' || !Object.prototype.hasOwnProperty.call(src, base)) return b;
    return Object.assign({}, b, { source: base + (src[base] ? ' · ' + src[base] : '') });
  }
  // the hold's weight (§14.1, R-S2H-1: the bar reads the hold in W7's numbers): sumCargo over the record's lines. An item
  // weighs its gear row's encumbrance each (W7); a spare part or weapon adds none (the book prints no encumbrance for a
  // ship's weapon; the parts registry carries none); a free line carries its own `enc`, for the whole line.
  function cargoEach(p, c) {
    if (c.kind === 'part' || c.kind === 'weapon') return 0;
    var g = c.kind === 'item' && p.gear ? p.gear[c.ref] : null;
    return g && typeof g.encumbrance === 'number' ? g.encumbrance : null;
  }
  function holdOf(p) {
    var sum = V().sumCargo(p.rec, function (c) { return cargoEach(p, c); });
    var res = p.res, cap = res ? res.encumbrance : null, hid = res ? res.hidden || 0 : 0;
    return { open: sum.total - sum.hidden, openCap: cap == null ? null : cap - hid, hidden: sum.hidden, hidCap: hid };
  }
  // the FIT tab's reading of one ship: the resolved hull, the budget, the fit cost, the parts in their groups, the choices
  // waiting by part, the parts the list has lost. Nothing here writes.
  function fitModel(p) {
    var VS = V(), R = VR(), S = Schem(), rec = p.rec, res = p.res, by = p.attById || {};
    var live = res && R ? R.asVehicle(rec, p.vrow, p.ctx.resolve) : null;
    var budget = VS.resolveBudget(rec, live, function (k) { return by[k] ? by[k].hp : null; });
    var cost = VS.fitCost(rec, function (k) { return listPrice(by[k], p.vrow, shipOf(p)); });
    var installed = (rec.attachments || []).map(function (a, i) { return { a: a, i: i, row: by[a.key] || null }; });
    var mine = {};
    installed.forEach(function (x) { mine[x.a.key] = 1; });
    var SRC = window.SWRPGSources, cur = SRC && SRC.current ? SRC.current() : null;
    var rows = (_attList || []).filter(function (a) { return a.id !== K4_ACT && (!(cur && cur.index) || SRC.isActiveWith(a, cur.index, cur.off)); });
    // every row's verdict first (`verdict`, by id: an installed part's OFF-BOOK reads it, ADDENDUM 7 item 2); the offer —
    // the groups and the count — then drops the left-out (`offered`, by kind)
    var groups = { fits: [], check: [], nofit: [] }, verdict = {}, all = [];
    rows.forEach(function (a) {
      var f = live ? VS.resolveFit(live, a) : null;
      var g = !f ? 'check' : !f.ok ? 'nofit' : f.unevaluated.length ? 'check' : 'fits';
      var x = verdict[a.id] = { a: a, fit: f, g: g, mine: !!mine[a.id] };
      if (offered(a)) { all.push(a); groups[g].push(x); }
    });
    // S8 (R-S8B-8; frames M-conv): a converted ship's template takes every hard point ("…takes up all of the vehicle's hard
    // points", DC p.71). It stands in the installed list as one unit of the hull's capacity (i −1, `conv`, never removable here:
    // REMOVE CONVERSION is CONVERSION's act), and the parts list offers no part. A held core component (a legacy BUILD PIECE,
    // kind engine/hull) spends no hard point under it (R-S8FJ-2; frames v3 L-after: Combat Plating aboard, "6 OF 6 HARD POINTS");
    // only a kind-less part still held counts on top, over the budget.
    var conv = !p.plan && res ? convOn(p) : null;
    if (conv && typeof budget.capacity === 'number') {
      var held = installed.reduce(function (n, x) { return n + (x.row && offered(x.row) && typeof x.row.hp === 'number' ? x.row.hp : 0); }, 0);
      budget = Object.assign({}, budget, { used: budget.capacity + held, over: held > 0 });
      installed = [{ a: { key: conv.key, mods: [] }, i: -1, row: { id: conv.key, name: conv.name, hp: budget.capacity }, conv: true }].concat(installed);
      groups = { fits: [], check: [], nofit: [] };
      all = [];
    } else conv = null;
    var pend = {};
    fitChoices(res).forEach(function (e) { (pend[e.att] = pend[e.att] || []).push(e); });
    var hull = res && S ? S.deriveZones(res.defense, res.silhouette).map(function (z) { return z.id; }) : [];
    // U11 reads the resolver's own list (`orphaned.attachments`); with no hull there is no resolver, and a part the parts
    // list has lost is simply one with no row
    var lost = res ? res.orphaned.attachments.map(function (o) { return installed[o.index]; }).filter(Boolean) : installed.filter(function (x) { return !x.row; });
    return { conv: conv, live: live, budget: budget, cost: cost, installed: installed, all: all.length, groups: groups, verdict: verdict, pend: pend, orphans: lost,
      zones: FIT_ZONE_ORDER.filter(function (z) { return hull.indexOf(z) !== -1; }), hold: holdOf(p) };
  }
  // W2 · K1: what fitting this part would change — the resolver over the record with it added (never saved), compared
  // number by number with today's; the hard points and the fit cost ride along, information only
  function fitDiff(p, m, a) {
    var R = VR(), rec = Object.assign({}, p.rec, { attachments: (p.rec.attachments || []).concat([{ key: a.id, when: null, note: null, mods: [] }]) });
    var after = R.resolve(rec, p.vrow, p.ctx.resolve), before = fitNums(p.res, m.zones), rows = [], byId = {};
    fitNums(after, m.zones).forEach(function (n, k) {
      var o = before[k];
      if (!o || o.v === n.v) return;
      var r = { id: n.id, label: n.label, before: o.v, after: n.v, credit: n.key ? (after.because[n.key] || []).filter(function (c) { return c.source === a.name; }) : [] };
      rows.push(r);
      byId[n.id] = r;
    });
    var used = m.budget.used, hp = typeof a.hp === 'number' ? a.hp : 0, price = listPrice(a, p.vrow, shipOf(p)) || 0;
    return { name: a.name, rows: rows, byId: byId, hp: { before: used, after: used + hp, cap: after.hard_points == null ? '—' : after.hard_points },
      cost: { before: m.cost.total, after: m.cost.total + price }, prints: fitPrints(a),
      oneRule: (a.base_mods || []).length === 1 && (a.base_effects || []).length === 1 ? modLine(a, 'base_mods', 0) : null };
  }
  // the open row's verdict (W2): each test the part names, said against this hull — "FITS · IT NEEDS A HYPERDRIVE; THIS SHIP
  // HAS CLASS 2"; the phone's sheet reads "FITS THIS HULL · …, AND THIS SHIP HAS CLASS 2" (W2@390)
  function fitWhy(x, live, phone) {
    if (x.g === 'nofit') return 'DOES NOT FIT · ' + x.fit.reasons.join(' · ');
    if (x.g === 'check') return 'CHECK WITH YOUR GM · ' + x.fit.unevaluated.join(' · ');
    var c = x.a.constraints || {}, j = phone ? ', AND ' : '; ', said = [];
    if (typeof c.min_size === 'number') said.push('IT NEEDS SILHOUETTE ' + c.min_size + ' OR MORE' + j + 'THIS SHIP IS ' + live.silhouette);
    if (typeof c.max_size === 'number') said.push('SILHOUETTE ' + c.max_size + ' OR SMALLER' + j + 'THIS SHIP IS ' + live.silhouette);
    if (c.must_be_starship === true) said.push('STARSHIPS ONLY' + j + 'THIS IS ' + upper(V().withArticle(live.type)));
    if (c.must_have_hyperdrive === true) said.push('IT NEEDS A HYPERDRIVE' + j + 'THIS SHIP HAS CLASS ' + live.hyperdrive_primary);
    if (Array.isArray(c.type_limit) && c.type_limit.length) said.push('ONLY FOR ' + upper(c.type_limit.join(' / ')) + j + 'THIS IS ' + upper(V().withArticle(live.type)));
    return (phone ? 'FITS THIS HULL' : 'FITS') + (said.length ? ' · ' + said.join(' · ') : '');
  }
  function fitVerdict(x) {   // W1's words
    return x.g === 'installed' ? (x.plan ? 'IN THE PLAN' : 'INSTALLED') : x.g === 'fits' ? 'FITS' : x.g === 'check' ? 'CHECK WITH YOUR GM' : 'DOES NOT FIT · ' + ((x.fit && x.fit.reasons[0]) || '');
  }
  function FitLed(props) {   // one ledger row: key · value with its captions under it (the frames' `L`)
    return el('tr', { 'data-testid': props.tid || 'fit-led', 'data-k': props.k },
      el('td', { className: 'y-lk' }, props.label), el('td', { className: 'y-lv' }, props.value, props.children));
  }
  // G-7 · A2 — THE ONE LIST-PRICE READ: a registry row's list price (a part's or a book weapon's) on this hull, or null. FIT's
  // rows, K4's rows, the fit cost and the counter's seam (`counterSeam`) all print or charge through it, each passing the hull
  // (FIT: the ship being fitted, `p.vrow`; the counter: the line's `for.vessel`), so a vessel line on the counter costs what
  // its row on FIT says. R-S4WB-6: a part the books price per point of silhouette (`price_per_silhouette`, FaD p.269–270)
  // costs its printed base × the hull's silhouette; with no silhouette to read it has no price (FIT prints "—", the counter
  // refuses it: `hullUnpriced`). The K9-OFF faces' two raw price prints (B-925) were deleted with them at the S5 flip
  // (R-S5R-18/19): this is the one raw price reader, and test/vessel_resolve.cjs (j1) pins that no other appears.
  // R-S5R-3/4/16 (B-1025): a part priced PER PASSENGER (`price_per_passenger`, Desperate Allies p.65) costs its base × the
  // ship's passenger capacity, and one priced PER LASER WEAPON (`price_per_laser_weapon`, Special Modifications p.66; D-45) its
  // base × the count of the ship's weapons whose category is exactly "Laser" (`_wcat`; a null category is not a laser). Both
  // read the ship's RESOLVED numbers WITHOUT the part being priced (`ship` = { rec, ctx }: no self-reference), or the hull
  // row where there is no ship (the catalogue). Zero, or no number to read, is no price, no sale (`hullUnpriced`).
  function listPrice(row, hull, ship) {
    if (!row || typeof row.price !== 'number' || !isFinite(row.price)) return null;
    if (row.price_per_silhouette) {
      var sil = hull ? hull.silhouette : null;
      return typeof sil === 'number' && isFinite(sil) ? row.price * sil : null;
    }
    if (!row.price_per_passenger && !row.price_per_laser_weapon) return row.price;
    var n = perUnitCount(row, hull, ship);
    return typeof n === 'number' && isFinite(n) && n > 0 ? row.price * n : null;
  }
  function perUnitCount(row, hull, ship) {
    var R = VR(), v = hull;
    if (ship && ship.rec && R && R.resolve) {
      var rec = Object.assign({}, ship.rec, { attachments: (ship.rec.attachments || []).filter(function (a) { return !a || a.key !== row.id; }) });
      v = R.resolve(rec, hull, ship.ctx || {});
    }
    if (!v) return null;
    if (row.price_per_passenger) return v.passengers;
    if (!_wcat) return null;
    return (v.weapons || []).reduce(function (n, w) {
      return n + (w && _wcat[w.key] === 'Laser' ? (typeof w.count === 'number' ? w.count : 1) : 0);
    }, 0);
  }
  // the ship a FIT model prices on: its record and the resolver's ctx (null on a face with no record)
  function shipOf(p) { return p && p.rec ? { rec: p.rec, ctx: (p.ctx && p.ctx.resolve) || {} } : null; }
  // R-S4WB-6 + R-S5R-4 · no price, no sale: a part priced per unit (silhouette, passenger, laser) with nothing to multiply (A2, A3)
  function hullUnpriced(row, hull, ship) {
    return !!(row && (row.price_per_silhouette || row.price_per_passenger || row.price_per_laser_weapon)) && listPrice(row, hull, ship) == null;
  }
  function FitR(props) { return props.a.restricted ? el('span', { className: 'y-r', title: 'Restricted — Streetwise, not Negotiation' }, '(R)') : null; }
  // the row's meta (W1): list price on this hull (`props.hull`) · the store's find mark, read as the store's own row reads it
  // (R-SPC-4: pips and the word, never a hue; `rarityBand`, lib/store/view.jsx PaperFindRow) · hard points; a null reads "—"
  function FitMeta(props) {
    var a = props.a, F = window.SWRPGRarity && a.rarity != null ? window.SWRPGRarity.rarityBand(a.rarity) : null, pr = listPrice(a, props.hull, props.ship);
    return el('div', { className: 'y-br-m' },
      pr != null ? el('span', null, el('b', null, fmtNum(pr)), ' CR') : el('span', null, 'PRICE —'),
      F ? el('span', { className: 'y-find' }, el('span', { className: 'y-pips', 'aria-hidden': true }, new Array(F.dice + 1).join('◆')), el('b', null, upper(F.label)))
        : el('span', null, 'RARITY —'),
      a.hp != null ? el('span', null, 'HARD POINTS ', el('b', null, a.hp)) : el('span', null, 'HARD POINTS —'), props.children);
  }
  function FitRow(props) {
    var x = props.x, a = x.a, go = props.onOpen;
    return el('div', { className: 'y-br-r', 'data-fit': x.g, 'data-testid': 'fit-part', 'data-key': a.id, role: go ? 'button' : undefined,
      tabIndex: go ? 0 : undefined, 'aria-expanded': go ? false : undefined, onClick: go || undefined, style: go ? { cursor: 'pointer' } : undefined,
      onKeyDown: go ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } : undefined },
      el('div', { className: 'y-br-n' }, a.name, el(FitR, { a: a })),
      el(FitMeta, { a: a, hull: props.hull, ship: props.ship }, el('span', { className: 'y-verdict', 'data-fit': x.g }, fitVerdict(x)), offBookNote(x.off)), props.children);
  }
  // S8 6h's BUILD PIECE note (R-S8B-6, R-S8FR-5) is CUT by the copy sweep (DECISIONS D-289, census vesselView.jsx:2602:72);
  // the row keeps its ONE verdict, INSTALLED, and REMOVE only.
  // the OFF-BOOK note (R-S5F-10's y3e; S6 B5, frames F3/F4): one span, in DOES NOT FIT's ink, for the closed row and the open one
  function offBookNote(off) { return off ? el('span', { className: 'y-verdict', 'data-fit': 'nofit' }, 'OFF-BOOK · ' + off) : null; }
  // R-S5F-10 · y3e (D-63; the flip card's DRAWN frames @ df1d9cdf): an installed part FIT judges DOES NOT FIT keeps reading
  // INSTALLED and adds OFF-BOOK · <reason>, in DOES NOT FIT's ink. The reason is FIT's own verdict for that part, read from
  // the verdicts fitModel already built (S7: every row's, before the offer drops the left-out), never derived again or stored.
  // A plan prints none. S6 B5 (B-1091, frame F4): EVERY reason the part fails, joined " · " as the open row's verdict (`fitWhy`) joins them; the closed list's DOES NOT FIT words
  // (`fitVerdict`) still name the first (K2 (a), D-103).
  function fitOffBook(p, m, a) {
    if (p.plan) return null;
    var y = a ? m.verdict[a.id] : null;
    return (y && y.g === 'nofit' && y.fit && y.fit.reasons.length) ? y.fit.reasons.join(' · ') : null;
  }
  // ADDING A MOD TO IT LATER (EotE p.187): a Hard Mechanics check with the installer's pool — the ship's engineer, as DOCK
  // reads it — shown, never rolled. A part not yet aboard carries no mod, so its first is Hard (R-S4WC-1 A5: Hard + N − 1).
  function FitModNote(props) {
    // P1 (R-S4CC-3): a plan has no crew, so the check is the browsing character's (the frame's mod check, its pool)
    var p = props.p, eng = p.plan ? (p.planWho ? { who: p.planWho, role: 'engineer' } : null) : (p.rec.crew || []).filter(function (c) { return c.role === 'engineer'; })[0] || null;
    var ed = eng ? seatD(p, eng) : null, en = eng ? whoName(eng.who, p.reg, p.roster) : null;
    var mech = (p.reg && p.reg.skills.mechanics && p.reg.skills.mechanics.label) || 'Mechanics';
    return el('div', { className: props.cls == null ? 'y-br-x' : props.cls, 'data-testid': 'fit-mod', style: props.style },
      props.bare ? null : el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'ADDING A MOD TO IT LATER'), el(Cite, null, SHIP_RULE.mod)),
      el('div', { className: 'y-row', style: { marginTop: 6 } }, poolDice(ed, 'fit-mod'), diffDice(SHIP_RULE.modDice, 'fit-mod'), el('span', { className: 'y-mono' }, ['HARD', en, mech].filter(Boolean).join(' · '))),
      el('p', { className: 'y-small y-muted', style: { marginTop: 4 } }, 'Each mod past the first adds one to the difficulty.'));
  }
  // K1's doors: TO THE COUNTER (the store's one counter, on the player host — G-7: the line `props.line` goes on through the
  // store's own writer and the shopper lands on the counter, R-S4WC-2; not on the GM host until Jason's pick, R-S4WC-3) and
  // ADD · NO CHARGE (K3); PLAN rides the row's head
  function counterDoor(p, line) {
    var go = p.toCounter && line ? function () { p.toCounter(line); } : null;
    return el('button', { type: 'button', className: 'y-commit', 'data-inert': go ? undefined : 1, 'data-testid': 'fit-door-counter', onClick: go || undefined }, 'TO THE COUNTER');
  }
  // the lines the doors put on the counter (R-S4WC-1's text; A1.4): a part to fit on this ship; a book weapon onto mount i
  function partLine(p, a) { return { id: 'vpart:' + a.id, for: { vessel: p.rec.id, then: 'fit' } }; }
  function weaponLine(p, k, r) { return { id: 'vweap:' + r.id, for: { vessel: p.rec.id, then: 'fit', mount: k.i } }; }
  function FitDoors(props) {
    var p = props.p;
    // P1: the plan's one door for a part not in it — ADD TO THE PLAN, written to the plan alone. UNDRAWN (P1 draws only the
    // planned part open): a silent-frame build, listed for the walk packet.
    if (p.plan) return el('div', { className: 'y-verbs', style: props.style },
      el('button', { type: 'button', className: 'y-commit', 'data-testid': 'plan-add', onClick: function () { props.onAdd(props.a.id); } }, 'ADD TO THE PLAN'),
      props.onCancel ? el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-cancel', onClick: props.onCancel }, 'CANCEL') : null);
    return el('div', { className: 'y-verbs', style: props.style },
      p.host === 'player' ? counterDoor(p, props.line) : null,
      el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-door-add', onClick: function () { props.onAdd(props.a.id); } }, 'ADD · NO CHARGE'),
      props.onCancel ? el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-cancel', onClick: props.onCancel }, 'CANCEL') : null);
  }
  // W2 · K1: the part open in place — its list price, find mark and hard points, the fit verdict, the book's rule that
  // fitting takes no check, the check for modding it later, and its doors
  // R-S4WC-7 · R-S4CC-3: PLAN from an owned ship's row lands on P1, the ship's HULL as a catalogue hull with that row's
  // registry part planned (R-S4CC-2's ?part=); the ship rides the move so P1's back reads ‹ <SHIP NAME>. A book weapon (K4)
  // is not a registry part, so its door opens P1 with nothing planned. A BUILT ship (vehicleKey '') has no catalogue hull to
  // plan on, so its PLAN is inert (`data-inert`, today's idiom for a door with no destination: card ADDENDUM 12 Q3 (a), L-4).
  function planDoor(p, part, cls) {
    var go = p.nav && p.rec.vehicleKey ? function () { p.nav({ room: 'plan', key: p.rec.vehicleKey, part: part, from: 'ship', fromId: p.rec.id, fromName: shipName(p.rec, p.vrow) }); } : null;
    return el('button', { type: 'button', className: cls, 'data-inert': go ? undefined : 1, 'data-testid': 'fit-door-plan', onClick: go || undefined }, 'PLAN');
  }
  function FitOpen(props) {
    var p = props.p, x = props.x, a = x.a;
    return el('div', { className: 'y-br-r y-br-open', 'data-fit': x.g, 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'fit-open', 'data-key': a.id },
      el('div', { className: 'y-row', style: { flexWrap: 'nowrap', justifyContent: 'space-between' } }, el('div', { className: 'y-br-n' }, a.name, el(FitR, { a: a })),
        el('span', { className: 'y-row', style: { flexWrap: 'nowrap', gap: 6 } },
          p.plan ? null : planDoor(p, a.id, 'y-quiet y-hdoor'),
          el('button', { type: 'button', className: 'y-x', 'aria-label': 'close the part', 'data-testid': 'fit-close', onClick: props.onClose }, '✕'))),
      el(FitMeta, { a: a, hull: p.vrow, ship: shipOf(p) }),
      el('p', { className: 'y-verdict', 'data-fit': x.g, 'data-testid': 'fit-verdict', style: { marginTop: 6 } }, fitWhy(x, props.m.live, false)),
      el('div', { className: 'y-br-x' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'FITTING IT'), el(Cite, null, SHIP_RULE.install)),
        el('p', { className: 'y-small', style: { marginTop: 2 } }, el('b', null, 'No check.'), ' Installing a part takes a few minutes of uninterrupted work.')),
      el(FitModNote, { p: p }),
      el(FitDoors, { p: p, a: a, line: partLine(p, a), onAdd: props.onAdd, style: { marginTop: 10, flexWrap: 'nowrap' } }));
  }
  // U10: a line per waiting application — CHOOSE A ZONE (the hull's own zones, in the book's order) or CHOOSE A WEAPON (the
  // hull's weapons by name and arc) — then "Not applied until you choose". A tap is `chooseTarget`, handed the hull's zones.
  function FitChoose(props) {
    var p = props.p, zones = props.zones;
    return el('div', { className: 'y-choose', 'data-testid': 'fit-choose' }, props.lines.map(function (e, k) {
      var zone = e.op === 'defense_delta';
      var opts = zone ? zones.map(function (z) { return { id: z, t: FIT_ZONE_WORD[z], c: { zone: z } }; })
        : (p.res.weapons || []).map(function (w, i) { return { id: 'w' + i, t: w.name + ' · ' + (w.location || arcsWord(w)), c: { weapon: { i: i, key: w.key } } }; });
      var kids = [el('span', { key: 'k', className: 'y-choose-k' }, zone ? 'CHOOSE A ZONE' : 'CHOOSE A WEAPON')];
      opts.forEach(function (o) {
        kids.push(el('span', { key: 's' + o.id, className: 'y-picsep', 'aria-hidden': true }, '·'));
        kids.push(el('button', { key: o.id, type: 'button', className: 'y-choose-b', 'data-testid': 'fit-choose-' + o.id,
          onClick: function () { p.apply(function (s) { return V().chooseTarget(s, p.rec.id, e.att, e.mod, o.c, p.now(), zones); }); } }, o.t));
      });
      return el('div', { key: k, className: 'y-choose-l', 'data-testid': 'fit-choose-line', 'data-op': e.op, 'data-mod': e.mod == null ? 'base' : e.mod }, kids);
    }), el('p', { className: 'y-choose-n' }, 'Not applied until you choose'));
  }
  // WB3 · REMOVE asks where the part goes, on the same line (U1's ask): TO THE HOLD keeps it as a spare (`removePart`
  // to:'hold' — its mods travel with it, its choices do not, C1/C2), DISCARD throws it away (to:'discarded'), KEEP IT writes
  // nothing. Either write logs REMOVED (R-S4WC-6); no roll and no cost (C4). `inRow`: inside an open row (the desk's form);
  // else under a hard point, as U10's line sits (the phone's).
  function FitRemoveAsk(props) {
    var p = props.p;
    function go(to) {
      if (to !== 'keep') p.apply(function (s) { return V().removePart(s, p.rec.id, props.i, to, p.now(), null); });
      props.onDone(to);
    }
    var kids = [el('span', { key: 'q', className: 'y-pic-q' }, 'Take it off?')];
    [['hold', 'TO THE HOLD'], ['discarded', 'DISCARD'], ['keep', 'KEEP IT']].forEach(function (w, k) {
      if (k) kids.push(el('span', { key: 's' + k, className: 'y-picsep', 'aria-hidden': true }, '·'));
      kids.push(el('button', { key: w[0], type: 'button', className: 'y-link', 'data-testid': 'fit-remove-' + w[0], onClick: function () { go(w[0]); } }, w[1]));
    });
    return el('div', { className: (props.inRow ? 'y-br-x' : 'y-choose') + ' y-wb-ask', 'data-testid': 'fit-remove-ask' },
      el('div', { className: 'y-picline', 'data-ask': 1 }, kids));
  }
  // U11: a part the parts list has lost — the key the record kept (its only name), nothing applied, and REMOVE, whose ask is
  // every installed part's (WB3): to the hold, the key rides as a spare; discarded, it is gone
  function FitOrphan(props) {
    var x = props.x, asking = props.ask === x.i;
    return el('div', { className: (props.phone ? 'y-hprow' : 'y-br-r') + ' y-orphan' + (asking && props.phone ? ' y-hprow-choose' : ''), 'data-used': 1,
      'data-testid': 'fit-orphan', 'data-key': x.a.key, 'data-asking': asking ? 1 : undefined },
      el('span', { className: 'y-hprow-n' }, x.a.key, ' ', el('span', { className: 'y-orph-m' }, '· no longer in the parts list · kept on the ship, not applied ·')),
      asking ? el(FitRemoveAsk, { p: props.p, i: x.i, inRow: !props.phone, onDone: function () { props.setAsk(null); } })
        : el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-orphan-remove', onClick: function () { props.setAsk(x.i); } }, 'REMOVE'));
  }
  // F4-MOD (D-S4WB2; D-27's drawing f-S4-F4-MOD-{390,1440}-mods, `Docs/mockups/shipyard-s4-parts-missing.html`): ITS MODS
  // under an installed part, player host only (the GM's has no counter, the frame's own caption). One row per `added_options`
  // entry — its printed words (the index-aligned `added_mods` line) and TO THE COUNTER, a `vmod` line onto THIS install
  // (`for.att`), through the same door `fit-door-counter` uses (the store's writer, then the counter: R-S4WC-2). The
  // SUGGESTED line is the counter's own A5 rule (modCost × N × modShipX, N = the mods already on this part + 1), and the
  // check is FitModNote's, without its header, as drawn. The counter's fold decides what it delivers (a max, a refusal).
  // B-1326 (S-2; R-S8C-15): a part the parts list leaves out (`offered`) sells no mods — it draws what the GM host draws.
  // B-1388 (DECISIONS D-440; page post1-yard-rows-look.html @ eff7aabeb, LAW): on the GM host the same list, READ-ONLY — each
  // option's printed words and its "n of N", nothing to buy: no −, no TO THE COUNTER, no held reason, no SUGGESTED, no check.
  function FitItsMods(props) {
    var p = props.p, x = props.x, a = x.row, opts = (a && a.added_options) || [], ro = p.host !== 'player';
    if (p.plan || !opts.length || !p.rec || !offered(a)) return null;
    var n = ((x.a && x.a.mods) || []).length + 1, price = SHIP_RULE.modCost * n * SHIP_RULE.modShipX;
    return el('div', { className: 'y-br-x', 'data-testid': 'fit-mods', 'data-readonly': ro ? '1' : undefined },
      el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'ITS MODS'), el(Cite, null, SHIP_RULE.mod)),
      opts.map(function (o, oi) {
        var line = { id: 'vmod:' + a.id + '/' + o.id, for: { vessel: p.rec.id, then: 'fit', att: x.i } };
        var go = p.toCounter ? function () { p.toCounter(line); } : null;
        var words = modLine(a, 'added_mods', oi) || o.id;
        // D1 (D-291 D1-yard; ADDENDUM 18 + card release-r5-f1 ADDENDUM 4, R-R5F1-1): the option's installs on THIS part are one
        // SWRPGUI.CountStep reading "n of N" — N installs are N `mods` entries of its id (R-S1C-4). − is the store's removeMod
        // (the last install); its + is TO THE COUNTER (`plus`: the counter sells the install), held at the printed count with
        // the book's reason.
        var mine = ((x.a && x.a.mods) || []), n = 0, last = -1, max = Math.max(1, Number(o.max) || 1);
        mine.forEach(function (m, mi) { if (m && m.option === o.id) { n++; last = mi; } });
        var held = n >= max, U = window.SWRPGUI || {};
        return el('div', { key: o.id, className: 'y-row', 'data-testid': 'fit-mod-row', 'data-option': o.id, style: { marginTop: 6 } },
          U.CountStep ? ro ? el(U.CountStep, { label: words, count: n, testid: 'fit-mod-step-' + o.id, max: max, readOnly: true })
            : el(U.CountStep, { label: words, count: n, testid: 'fit-mod-step-' + o.id,
            reason: held ? 'The book allows ' + max + '.' : null, max: max, minusHeld: n < 1, minusLabel: 'Remove one install — ' + words,
            onMinus: function () { if (last >= 0) p.apply(function (s) { return V().removeMod(s, p.rec.id, x.i, last, p.now()); }); },
            plus: el('button', { type: 'button', className: 'y-commit', 'data-testid': 'fit-mod-counter', 'aria-disabled': held ? 'true' : undefined,
              'data-held': held ? '1' : undefined, 'data-inert': go && !held ? undefined : 1, onClick: go && !held ? go : undefined }, 'TO THE COUNTER') }) : null);
      }),
      ro ? null : el('p', { className: 'y-mono', 'data-testid': 'fit-mod-suggested', style: { marginTop: 8 } },
        'SUGGESTED · ' + fmtNum(price) + ' CR · ' + SHIP_RULE.modCost + ' CR × ' + (n > 1 ? n + ' × ' : '') + SHIP_RULE.modShipX + ' ON A SHIP ',
        el(Cite, null, SHIP_RULE.modShipXCite)),
      ro ? null : el(FitModNote, { p: p, bare: true, cls: '', style: { marginTop: 4 } }));
  }
  // WB3 · an installed part open in place (W2's open row, the desk's form): its meta and INSTALLED (with the closed row's
  // OFF-BOOK note, S6 B5 · frame F3), U10's lines, and REMOVE, its one door; tapped, the ask takes the door's place. The numbers column opens with IF IT COMES OFF (fitDiffOff).
  function FitInstOpen(props) {
    var p = props.p, x = props.x, a = x.row, lines = props.lines || [];
    if (p.plan) return el(PlanInstOpen, props);
    return el('div', { className: 'y-br-r y-br-open', 'data-fit': 'installed', 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'fit-inst-open', 'data-key': a.id },
      el('div', { className: 'y-row', style: { flexWrap: 'nowrap', justifyContent: 'space-between' } }, el('div', { className: 'y-br-n' }, a.name, el(FitR, { a: a })),
        el('button', { type: 'button', className: 'y-x', 'aria-label': 'close the part', 'data-testid': 'fit-inst-close', onClick: props.onClose }, '✕')),
      el(FitMeta, { a: a, hull: p.vrow, ship: shipOf(p) }, el('span', { className: 'y-verdict', 'data-fit': 'installed' }, 'INSTALLED'), offBookNote(props.off)),
      lines.length ? el(FitChoose, { p: p, lines: lines, zones: props.zones }) : null,
      el(FitItsMods, { p: p, x: x }),
      props.asking ? el(FitRemoveAsk, { p: p, i: x.i, inRow: true, onDone: props.onDone })
        : el('div', { className: 'y-verbs y-brv' }, el(MakeConversion, { p: p, x: x, onDone: props.onClose }),
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-remove', onClick: props.onRemove }, 'REMOVE')));
  }
  // S8 6h (card ADDENDUM 21, H-8 (a); frames v3 L-before → L-after): MAKE IT THIS SHIP'S CONVERSION on a template held as a part —
  // the store's ONE apply (makeConversion), then the row closes and CONVERSION (b) reads it, its arcs PENDING. Inert, with the
  // Convert door's words beside it (convertWhy, R-S8FJ-3), when the template's rule refuses this ship (legacyConversion's `why`);
  // absent on a ship already converted, or on a part that is not a template.
  function MakeConversion(props) {
    var p = props.p, x = props.x, VS = V(), lc = VS && VS.legacyConversion ? VS.legacyConversion(p.rec, x.i, p.vrow, p.attById) : null;
    if (!lc) return null;
    var go = lc.why ? null : function () {
      p.apply(function (s) { return VS.makeConversion(s, p.rec.id, x.i, p.now()); });
      if (props.onDone) props.onDone();
    };
    return el(React.Fragment, null,
      el('button', { type: 'button', className: 'y-commit', 'data-testid': 'fit-make-conversion', 'data-key': lc.key, 'aria-disabled': go ? undefined : 'true',
        'data-inert': go ? undefined : 1, onClick: go || undefined }, 'MAKE IT THIS SHIP’S CONVERSION'),
      lc.why ? el('span', { className: 'y-verdict', 'data-fit': 'nofit', 'data-testid': 'fit-make-why', 'data-why': lc.why }, convertWhy(lc.why, x.row)) : null);
  }
  // P1 · the planned part open in place (frames_catalogue.cjs `pOpen`): its meta, IN THE PLAN · <the verdict>, the book's
  // rule that fitting takes no check, the mod check with the browsing character's pool, and REMOVE FROM THE PLAN (no ask:
  // nothing is saved, so nothing is lost). U10's lines stay where a part waits on a choice.
  function PlanInstOpen(props) {
    var p = props.p, x = props.x, a = x.row, lines = props.lines || [];
    var f = p.res ? VS_fit(p, a) : null, g = !f ? 'check' : !f.ok ? 'nofit' : f.unevaluated.length ? 'check' : 'fits';
    var why = g === 'fits' ? 'FITS THIS HULL' : fitWhy({ a: a, fit: f, g: g }, null, true);
    return el('div', { className: 'y-br-r y-br-open', 'data-fit': 'installed', 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'fit-inst-open', 'data-key': a.id },
      el('div', { className: 'y-row', style: { flexWrap: 'nowrap', justifyContent: 'space-between' } }, el('div', { className: 'y-br-n' }, a.name, el(FitR, { a: a })),
        el('button', { type: 'button', className: 'y-x', 'aria-label': 'close the part', 'data-testid': 'fit-inst-close', onClick: props.onClose }, '✕')),
      el(FitMeta, { a: a, hull: p.vrow, ship: shipOf(p) }),
      el('p', { className: 'y-verdict', 'data-fit': 'installed', 'data-testid': 'fit-verdict', style: { marginTop: 6 } }, 'IN THE PLAN · ' + why),
      lines.length ? el(FitChoose, { p: p, lines: lines, zones: props.zones }) : null,
      el('div', { className: 'y-br-x' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'FITTING IT'), el(Cite, null, SHIP_RULE.install)),
        el('p', { className: 'y-small', style: { marginTop: 2 } }, el('b', null, 'No check.'), ' Installing a part takes a few minutes of uninterrupted work.')),
      el(FitModNote, { p: p }),
      el('div', { className: 'y-verbs y-brv' }, el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'plan-remove', onClick: function () { planDrop(p, x.i); props.onClose(); } }, 'REMOVE FROM THE PLAN')));
  }
  function VS_fit(p, a) { var R = VR(), live = R ? R.asVehicle(p.rec, p.vrow, p.ctx.resolve) : null; return live ? V().resolveFit(live, a) : null; }
  // P1: a part leaves the plan — the store's own reducer over the plan's local state (nothing saved)
  function planDrop(p, i) { p.apply(function (s) { return V().removePart(s, p.rec.id, i, 'discarded', p.now(), null); }); }
  // an installed part's row (INSTALLED): closed, a door that opens it in place; open, FitInstOpen. A row with a choice
  // waiting (U10) holds its own controls, so it is not a door (no control inside a control): its REMOVE sits in the row
  // after the choice, as on the phone's hard-point row (W1@390), and the ask opens there.
  function fitInstRow(p, m, x, o) {
    var lines = m.pend[x.i] || [];
    function done(to) { o.setAsk(null); if (to !== 'keep') o.setInst(null); }
    if (lines.length) {
      return el(FitRow, { key: 'i' + x.i, x: { a: x.row, g: 'installed', plan: p.plan, off: fitOffBook(p, m, x.row) }, hull: p.vrow, ship: shipOf(p) }, el(FitChoose, { p: p, lines: lines, zones: m.zones }),
        o.ask === x.i ? el(FitRemoveAsk, { p: p, i: x.i, inRow: true, onDone: done })
          : el('div', { className: 'y-verbs y-brv' }, p.plan
            ? el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'plan-remove', onClick: function () { planDrop(p, x.i); } }, 'REMOVE FROM THE PLAN')
            : el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-remove', onClick: function () { o.setAsk(x.i); } }, 'REMOVE')));
    }
    if (o.inst === x.i) return el(FitInstOpen, { key: 'i' + x.i, p: p, x: x, lines: lines, zones: m.zones, asking: o.ask === x.i, off: fitOffBook(p, m, x.row),
      onClose: function () { o.setInst(null); o.setAsk(null); }, onRemove: function () { o.setAsk(x.i); }, onDone: done });
    return el(FitRow, { key: 'i' + x.i, x: { a: x.row, g: 'installed', plan: p.plan, off: fitOffBook(p, m, x.row) }, hull: p.vrow, ship: shipOf(p), onOpen: function () { o.setAsk(null); o.setInst(x.i); } });
  }
  // the sockets a record fills, in fitting order: a part fills as many as it costs (U10: two for the Reinforced Shield
  // Generator); a part that costs none fills none
  function fitUnits(m) {
    var u = [];
    m.installed.forEach(function (x) {
      var n = x.row && typeof x.row.hp === 'number' ? x.row.hp : 0;
      for (var j = 0; j < n; j++) u.push({ x: x, first: j === 0 });
    });
    return u;
  }
  // the hull's hard-point capacity as FIT's shapes read it: its number, or null when the book lists none. An unknown
  // capacity is never 0 (R-S5R-24, B-1086): nothing reads OVER THE BUDGET, and the rows and the ring are the installed
  // units plus ONE free door, so an unknown budget never blocks a fit. A known capacity, 0 included, is unchanged
  function fitCap(m) { var c = m.budget.capacity; return typeof c === 'number' ? c : null; }
  // the phone's ring (W1@390): one row per hard point, over the budget in its own ink; U10's lines inside a part's first
  // row; U11's lost parts after the last free row
  function FitHardPoints(props) {
    var p = props.p, m = props.m, cap = fitCap(m), units = fitUnits(m), idx = [];
    for (var i = 0; i < (cap == null ? units.length + 1 : Math.max(cap, units.length)); i++) idx.push(i);
    return el('div', { className: 'hp-bands', 'data-testid': 'fit-hardpoints' }, idx.map(function (i) {
      var u = units[i], over = cap != null && i >= cap, lines = u && u.first ? m.pend[u.x.i] || [] : [], chosen = !u && props.sel === i;
      var asking = !!(u && u.first && props.ask === u.x.i);   // WB3: REMOVE tapped, the ask under the part's first row
      function free() { props.onFree(i); }
      return el('div', { key: i, className: 'y-hprow' + (lines.length || asking ? ' y-hprow-choose' : ''), 'data-used': u ? 1 : 0, 'data-sel': chosen ? 1 : undefined,
        'data-over': over ? 1 : undefined, 'data-asking': asking ? 1 : undefined, 'data-testid': 'fit-hprow', role: u ? undefined : 'button', tabIndex: u ? undefined : 0, onClick: u ? undefined : free,
        onKeyDown: u ? undefined : function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); free(); } } },
        el('span', { className: 'y-slot-k' }, over ? 'OVER THE BUDGET' : u && p.plan ? 'IN THE PLAN' : 'HARD POINT'),
        el('span', { className: 'y-hprow-n' }, u ? u.x.row.name : chosen ? 'CHOSEN' : 'FREE — TAP TO FIT'),
        u && u.first && !asking && !u.x.conv ? el('button', { type: 'button', className: 'y-quiet', 'data-testid': p.plan ? 'plan-remove' : 'fit-remove',
          onClick: function () { if (p.plan) planDrop(p, u.x.i); else props.setAsk(u.x.i); } }, 'REMOVE') : null,
        lines.length ? el(FitChoose, { p: p, lines: lines, zones: m.zones }) : null,
        asking ? el(FitRemoveAsk, { p: p, i: u.x.i, onDone: function () { props.setAsk(null); } }) : null);
    }), m.orphans.map(function (x) { return el(FitOrphan, { key: 'o' + x.i, p: p, x: x, phone: true, ask: props.ask, setAsk: props.setAsk }); }));
  }
  // the mounts, each K4's door when the book's weapons are loaded (`k4` = { base, onMount, sel, as }): tapped, its weapon list
  // opens. `as` = { i, name }: a bought spare's chosen mount (F4-MOUNT) reads selected, with the spare's name on it
  function fitMounts(ws, lane, k4) {
    return ws.map(function (w, j) {
      var i = (k4 ? k4.base : 0) + j, go = k4 && k4.onMount ? function () { k4.onMount(i); } : null, as = k4 && k4.as && k4.as.i === i ? k4.as : null;
      return el('span', { key: i, className: 'y-mount', 'data-testid': 'fit-mount', 'data-i': i, 'data-sel': k4 && k4.sel === i || as ? 1 : undefined,
        role: go ? 'button' : undefined, tabIndex: go ? 0 : undefined, 'aria-pressed': go ? k4.sel === i : undefined, onClick: go || undefined,
        onKeyDown: go ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } : undefined,
        style: lane ? { position: 'static', transform: 'none' } : { position: 'static', transform: 'none', margin: '3px auto', width: 'max-content' } },
        fitMountWord(w) + ' · ' + (as ? as.name : w.name));
    });
  }
  // W1's ring (desk): the recognition schematic in live mode, the hard points on an ellipse round it — a part fills as many
  // as it costs, a free one is a door (W2: tap a hard point to fit it); over the budget, a lane below (W3); the mounts on
  // the ring's top and bottom edges. R-S8B-11 (b) (finding 11): a lane that wraps grows AWAY from the hard points — the top
  // lane's rows past its first lift above the ring (which keeps the room for them), the bottom lane's push the caption and the
  // over-budget boxes down. Measured after paint; a lane that does not wrap moves nothing (TODAY's frames: `data-lift` "0/0")
  function laneRows(n) { return n && n.firstChild ? Math.max(0, Math.round(n.offsetHeight - n.firstChild.offsetHeight)) : 0; }
  function FitRing(props) {
    var p = props.p, m = props.m, res = p.res, S = Schem(), B = FIT_RING[p.band === 'wide' ? 'wide' : 'mid'];
    var cap = fitCap(m), units = fitUnits(m), over = cap == null ? [] : units.slice(cap), cx = B.w / 2, cy = B.h / 2, slots = [];
    var n = cap == null ? units.length + 1 : cap;   // R-S5R-24: an unknown capacity rings the installed units plus one door
    for (var i = 0; i < n; i++) slots.push(i);
    var ws = res.weapons || [], half = Math.ceil(ws.length / 2), extra = over.length ? 96 + (over.length - 1) * 70 : 18;
    var topRef = React.useRef(null), botRef = React.useRef(null), liftSt = React.useState({ t: 0, b: 0 }), lift = liftSt[0];
    React.useLayoutEffect(function () {
      var t = laneRows(topRef.current), b = laneRows(botRef.current);
      if (t !== lift.t || b !== lift.b) liftSt[1]({ t: t, b: b });
    });
    function lane(list, top, k, base, ref) { return list.length ? el('div', { key: k, ref: ref, 'data-lane': k, style: { position: 'absolute', left: 0, right: 0, top: top, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 } },
      fitMounts(list, true, { base: base, onMount: props.onMount, sel: props.mount, as: props.as })) : null; }
    return el('div', { className: 'y-ring', 'data-testid': 'fit-ring', 'data-lift': lift.t + '/' + lift.b, style: { width: B.w, height: B.h + extra + lift.b, marginTop: lift.t || undefined } },
      p.plan ? el('span', { className: 'y-caption', style: { position: 'absolute', left: 0, right: 0, top: B.h + 2 + lift.b, textAlign: 'center' } },
        cap == null ? 'RECOGNITION SCHEMATIC · HARD POINTS NOT LISTED ON THIS HULL' : 'RECOGNITION SCHEMATIC · ' + cap + (cap === 1 ? ' HARD POINT' : ' HARD POINTS') + ' ON THIS HULL') : null,
      // the FULL identifier, its ring's centre (48 of its 104 units down) on the sockets' centre
      S && S.Schematic ? el(Ident, { host: 'fit-ring', px: B.schem, rec: fitIdentRec(p, res, ws), name: shipName(p.rec, p.vrow),
        style: { position: 'absolute', left: cx - B.schem / 2, top: cy - B.schem * 48 / 104 } }) : null,
      slots.map(function (i) {
        var a = (330 + i * 360 / n) * Math.PI / 180, u = units[i], sel = !u && props.sel === i;
        return el('button', { key: i, type: 'button', className: 'y-slot', 'data-used': u ? 1 : 0, 'data-sel': sel ? 1 : undefined, 'data-testid': 'fit-slot',
          'data-inert': u ? 1 : undefined, onClick: u ? undefined : function () { props.onFree(i); },
          style: { left: (cx + B.rx * Math.sin(a)).toFixed(1) + 'px', top: (cy - B.ry * Math.cos(a)).toFixed(1) + 'px', width: B.slot } },
          el('span', { className: 'y-slot-k' }, sel && props.pickName ? 'CHOSEN' : 'HARD POINT'),
          el('span', { className: 'y-slot-n' }, u ? u.x.row.name : sel ? props.pickName || 'CHOSEN' : 'FREE'));
      }),
      over.map(function (u, k) {
        return el('button', { key: 'o' + k, type: 'button', className: 'y-slot', 'data-used': 1, 'data-over': 1, 'data-inert': 1, 'data-testid': 'fit-slot-over',
          style: { left: cx + 'px', top: (B.h + 52 + lift.b + k * 70) + 'px', width: B.slot + 90 } },
          el('span', { className: 'y-slot-k', style: { color: 'var(--doc-caution)' } }, 'OVER THE BUDGET'), el('span', { className: 'y-slot-n' }, u.x.row.name));
      }),
      lane(ws.slice(0, half), -lift.t, 'top', 0, topRef), lane(ws.slice(half), B.h - 24, 'bottom', half, botRef));
  }
  // R-SSB-11: where the desk's ring is not drawn (more hard points than FIT_RING_MAX), the middle column opens with the same FULL
  // identifier the phone's ring draws, at its size, under the same words — so a ship whose owner set a picture still shows its
  // arcs, family and class on its own pages
  function FitListHead(props) {
    var p = props.p, res = p.res, S = Schem();
    return S && S.Schematic ? el('div', { 'data-testid': 'fit-list-head', style: { marginBottom: 12 } },
      el(Ident, { host: 'fit-list-head', px: 260, rec: fitIdentRec(p, res, res.weapons || []), name: shipName(p.rec, p.vrow), style: { margin: '0 auto' } }),
      el('p', { className: 'y-caption', style: { textAlign: 'center', marginTop: 6 } }, 'RECOGNITION SCHEMATIC')) : null;
  }
  // the workbench's identifier reads the hull's record with the ship's CURRENT shields and its fitted weapons laid over it
  function fitIdentRec(p, res, ws) { return Object.assign({}, p.vrow, { silhouette: res.silhouette, defense: V().resolveShields(p.rec, res.defense), weapons: ws }); }
  function FitPhoneRing(props) {   // the phone's ring plate (W1@390): the mounts above and below the schematic, captioned
    var p = props.p, res = p.res, S = Schem(), ws = res.weapons || [], half = Math.ceil(ws.length / 2);
    function k4(base) { return { base: base, onMount: props.onMount, sel: props.mount }; }
    return el('div', { className: 'y-phring y-sec', 'data-testid': 'fit-ring' }, fitMounts(ws.slice(0, half), false, k4(0)),
      S && S.Schematic ? el(Ident, { host: 'fit-phone-ring', px: 260, rec: fitIdentRec(p, res, ws), name: shipName(p.rec, p.vrow), style: { margin: '0 auto' } }) : null,
      fitMounts(ws.slice(half), false, k4(half)), el('p', { className: 'y-caption', style: { textAlign: 'center', marginTop: 6 } }, 'RECOGNITION SCHEMATIC'));
  }
  // the live numbers (W1–W3): the panels, each changed number credited to its part; with a part open at the desk, each
  // number it would move reads BEFORE → AFTER "IF FITTED" (W2) under the delta panel; parts with no number print their text
  // 6g (R-S8B-10; frames v3 M-built, ADDENDUM 15 H-2 (a) — a VIEW rule, the resolver writes none of these): on a BUILT ship the
  // panels name where each number came from. A number the frame prints is credited "<FRAME> FRAME · <cite>" first (then any
  // piece's change to it); SYSTEM STRAIN THRESHOLD reads the frames' product before the engine ("4 × 3 = 12 · <ENGINE> ·
  // <cite>"); a Space Station's SPEED reads its line alone. Any other ship's credits are the resolver's, untouched.
  var BUILT_FRAME_KEYS = ['hull_threshold', 'passengers', 'encumbrance', 'sensor_range', 'massive'];
  function builtCredits(p, b, s8) {
    var f = p.rec && p.rec.build && p.rec.build.frame ? p.vrow : null, res = p.res;
    if (!f || !res || heldOf(res)) return b;
    var out = Object.assign({}, b), fc = { source: frameCredit(f), amount: null };
    BUILT_FRAME_KEYS.forEach(function (k) { if (k !== 'massive' || res.massive) out[k] = [fc].concat(b[k] || []); });
    var eng = p.rec.build.engine && p.attById ? p.attById[p.rec.build.engine.key] : null, ex = eng && eng.kind === 'engine' ? pieceSet(eng, 'strain_threshold_set') : null;
    if (ex && f.silhouette != null && (b.strain_threshold || []).length) {
      out.strain_threshold = b.strain_threshold.map(function (c, i) {
        return i === 0 && c.set != null ? { source: ex.amount + ' × ' + f.silhouette + ' = ' + c.set + ' · ' + s8Credit(s8, c).source, amount: null } : c;
      });
    }
    if ((b.speed || []).some(function (c) { return 'fixed' in c; }) && stationLine(f)) out.speed = [{ source: stationLine(f), amount: null }];
    return out;
  }
  function FitPanels(props) {
    var p = props.p, m = props.m, res = p.res, d = props.diff, byId = {}, s8 = s8Sources(p), b = builtCredits(p, res.because || {}, s8);
    fitNums(res, m.zones).forEach(function (n) { byId[n.id] = n; });
    function iff(ch) { return ch ? el('span', { className: 'y-attr', 'data-testid': 'fit-iffitted' }, 'IF FITTED · ' + d.name) : null; }
    function credits(list, bare) { return (list || []).map(function (c, k) { return el('span', { key: k, className: 'y-attr', 'data-testid': 'fit-credit' }, fitCredit(s8Credit(s8, c), bare)); }); }
    function row(id) {
      var n = byId[id], ch = d && d.byId[id];
      if (!n || (n.hide && !ch)) return null;
      return el(FitLed, { key: id, k: id, label: n.label, value: ch ? n.v + ' → ' + ch.after : n.v }, credits(n.list || (n.key && b[n.key]), n.bare), iff(ch));
    }
    function panel(h, rows, k) {
      rows = rows.filter(Boolean);
      return rows.length ? el('div', { key: k, className: 'y-panel', 'data-testid': 'fit-panel', 'data-panel': k },
        el('div', { className: 'y-panel-h' }, h), el('table', { className: 'y-led' }, el('tbody', null, rows))) : null;
    }
    var pend = swapsPending(p.rec.id);
    var weapons = (res.weapons || []).map(function (w, i) {
      var ch = d && d.byId['w' + i], sw = props.wd && props.wd.i === i ? props.wd.after : null;
      if (sw) {   // K4: the mount's weapon → the chosen one, and what it would print (the resolver's, never saved)
        var qw = qualWord(p, sw.qualities_resolved);
        return el(FitLed, { key: 'w' + i, k: 'w' + i, label: fitMountWord(w), value: w.name + ' → ' + sw.name },
          el('span', { className: 'y-attr', 'data-testid': 'fit-iffitted' }, 'IF FITTED · DAMAGE ' + (sw.damage != null ? sw.damage : '—') + ' · CRITICAL '
            + (sw.crit != null ? sw.crit : '—') + ' · ' + (sw.range_label || '—'), qw ? ' · ' : null, qualRun(p, sw.qualities_resolved)));   // B-1178: each "Label N" whole
      }
      var sp = pend[i];
      return el(FitLed, { key: 'w' + i, k: 'w' + i, label: fitMountWord(w), value: w.name + (w.count > 1 ? ' ×' + w.count : '') },
        el('span', { className: 'y-attr', 'data-k': 'note' }, 'DAMAGE ' + (w.damage != null ? w.damage : '—') + (ch ? ' → ' + ch.after : '') + ' · CRITICAL '
          + (w.crit != null ? w.crit : '—') + ' · ' + (w.range_label || '—'), qualWord(p, w.qualities_resolved) ? ' · ' : null, qualRun(p, w.qualities_resolved)),
        credits(b['weapon_' + i]),
        // U10 · a swap waiting on the COUNTER for this mount (B7: the store's reader, at render; the record gains nothing)
        sp ? el('span', { className: 'y-attr y-swap', 'data-testid': 'fit-swap' }, 'SWAP PENDING · ' + w.name + ' → ' + ((p.ctx.resolve.weapons && p.ctx.resolve.weapons[sp] && p.ctx.resolve.weapons[sp].name) || sp)) : null,
        iff(ch));
    });
    var printed = [];
    m.installed.forEach(function (x) {
      fitPrints(x.row).forEach(function (t, k) {
        printed.push(el(FitLed, { key: x.i + '-' + k, k: 'prints', label: '', value: x.row.name },
          el('span', { className: 'y-attr', 'data-k': 'note', 'data-testid': 'fit-prints' }, 'PRINTS · ', glyphs(t))));
      });
    });
    return el(React.Fragment, null, props.delta,
      panel('HULL & STRAIN', [row('hull'), row('strain'), row('massive')], 'hull'),
      panel('DEFENSE', m.zones.map(function (z) { return row('def_' + z); }), 'defense'),
      panel('ARMOR', [row('armor')], 'armor'),
      panel('SPEED & HANDLING', [row('speed'), row('handling')], 'speed'),
      panel('SENSORS & HYPERDRIVE', [row('sensor'), row('hd'), row('hdb')], 'sensors'),
      panel('WEAPONS', weapons.concat([row('gun')]), 'weapons'),
      // P1's panels (frames_catalogue.cjs pPanels): a plan holds no seats and no hold, so its CREW is the record's and it has
      // no CARGO (the budget bar keeps the hold's capacity)
      panel('CREW', [el(FitLed, { key: 'rec', k: 'crewrec', label: 'CREW OF RECORD', value: crewLine(p.vrow) || '—' }),
        p.plan ? null : el(FitLed, { key: 'seats', k: 'seats', label: 'SEATS HELD', value: String((p.rec.crew || []).length) }), row('pass')], 'crew'),
      p.plan ? null : panel('CARGO', [row('enc'), row('hidden')], 'cargo'),
      panel('PRINTED RULES', printed, 'prints'));
  }
  // IF IT IS FITTED · <part> (W2 · K1): each number before → after with the part's own credit, the hard points and the fit
  // cost. On the phone's sheet it is WHAT CHANGES, and a one-rule part's line prints the registry's own words (W2@390).
  function FitDelta(props) {
    var d = props.d, rows = d.rows.map(function (r) {
      var cap = props.phone && d.oneRule ? el('span', { className: 'y-attr' }, glyphs(d.oneRule))
        : r.credit.map(function (c, k) { return el('span', { key: k, className: 'y-attr' }, fitCredit(c, false, true)); });
      return el(FitLed, { key: r.id, k: r.id, tid: 'fit-delta-row', label: r.label, value: r.before + ' → ' + r.after }, cap);
    });
    rows.push(el(FitLed, { key: 'hp', k: 'hp', tid: 'fit-delta-row', label: 'HARD POINTS', value: d.hp.before + ' → ' + d.hp.after + ' OF ' + d.hp.cap }));
    rows.push(el(FitLed, { key: 'cost', k: 'cost', tid: 'fit-delta-row', label: 'FIT COST', value: fmtNum(d.cost.before) + ' → ' + fmtNum(d.cost.after) + ' CR' },
      el('span', { className: 'y-attr', 'data-k': 'note' }, 'INFORMATION ONLY')));
    d.prints.forEach(function (t, k) {
      rows.push(el(FitLed, { key: 'pr' + k, k: 'prints', tid: 'fit-delta-row', label: '', value: d.name }, el('span', { className: 'y-attr', 'data-k': 'note' }, 'PRINTS · ', glyphs(t))));
    });
    var table = el('table', { className: 'y-led', 'data-testid': props.phone ? 'fit-delta' : undefined }, el('tbody', null, rows));
    return props.phone ? table : el('div', { className: 'y-panel y-delta', 'data-testid': 'fit-delta', 'data-way': d.off ? 'off' : 'on' },
      el('div', { className: 'y-panel-h' }, (d.off ? 'IF IT COMES OFF · ' : 'IF IT IS FITTED · ') + d.name), table);
  }
  // P1 · WHAT THE PLAN CHANGES · <the planned parts> (frames_catalogue.cjs pPanels): the empty hull → the plan, number by
  // number, each with its part's credit; GUNNERY reads the browsing character's pool before → after with "<NAME> · UPGRADED
  // ONCE" (the frame's line; with no character here, the words alone); the hard points and the fit cost, information only.
  // Several parts name each one (the frame draws one: a silent-frame build); an empty plan has no panel.
  function PlanDelta(props) {
    var p = props.p, m = props.m, R = VR(), planned = m.installed.filter(function (x) { return x.row; });
    if (!planned.length || !p.res || !R) return null;
    var empty = Object.assign({}, p.rec, { attachments: [] }), before = R.resolve(empty, p.vrow, p.ctx.resolve), names = {}, list = [];
    planned.forEach(function (x) { if (!names[x.row.name]) list.push(x.row.name); names[x.row.name] = 1; });
    var was = fitNums(before, m.zones), rows = [];
    fitNums(p.res, m.zones).forEach(function (n, k) {
      var o = was[k];
      if (!o || o.id !== n.id || o.v === n.v) return;
      if (n.id === 'gun') {
        var who = p.planWho, d0 = who ? seatDice(who, 'gunner', empty, p.vrow, p.ctx, p.reg) : null, d1 = who ? seatDice(who, 'gunner', p.rec, p.vrow, p.ctx, p.reg) : null;
        rows.push(d0 && d1 ? el(FitLed, { key: n.id, k: n.id, tid: 'fit-delta-row', label: n.label,
          value: el('span', { className: 'y-row', style: { justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' } }, poolDice(d0, 'plan-before'), ' → ', poolDice(d1, 'plan-after')) },
          el('span', { className: 'y-attr', 'data-testid': 'plan-delta-who' }, upper(whoName(who, p.reg, p.roster)) + ' · ' + n.v))
          : el(FitLed, { key: n.id, k: n.id, tid: 'fit-delta-row', label: n.label, value: 'NOT UPGRADED → ' + n.v },
            (n.list || []).filter(function (c) { return names[c.source]; }).map(function (c, j) { return el('span', { key: j, className: 'y-attr' }, c.source); })));
        return;
      }
      var credit = n.key ? (p.res.because[n.key] || []).filter(function (c) { return names[c.source]; }) : [];
      rows.push(el(FitLed, { key: n.id, k: n.id, tid: 'fit-delta-row', label: n.label, value: o.v + ' → ' + n.v },
        credit.map(function (c, j) { return el('span', { key: j, className: 'y-attr' }, fitCredit(c, false, false)); })));
    });
    rows.push(el(FitLed, { key: 'hp', k: 'hp', tid: 'fit-delta-row', label: 'HARD POINTS', value: '0 → ' + m.budget.used + ' OF ' + (m.budget.capacity == null ? '—' : m.budget.capacity) }));
    rows.push(el(FitLed, { key: 'cost', k: 'cost', tid: 'fit-delta-row', label: 'FIT COST', value: '0 → ' + fmtNum(m.cost.total) + ' CR' },
      el('span', { className: 'y-attr', 'data-k': 'note' }, 'INFORMATION ONLY')));
    return el('div', { className: 'y-panel y-delta', 'data-testid': 'plan-delta', 'data-way': 'plan' },
      el('div', { className: 'y-panel-h' }, 'WHAT THE PLAN CHANGES · ' + list.join(' · ')), el('table', { className: 'y-led' }, el('tbody', null, rows)));
  }
  // WB3 · IF IT COMES OFF (W2's panel, the other way): the resolver over the record without part i (never saved), number by
  // number; a pool that loses its upgrade reads NOT UPGRADED; the hard points and the fit cost ride along, information only
  function fitDiffOff(p, m, x) {
    var R = VR(), rec = Object.assign({}, p.rec, { attachments: (p.rec.attachments || []).filter(function (_, k) { return k !== x.i; }) });
    var after = R.resolve(rec, p.vrow, p.ctx.resolve), before = fitNums(p.res, m.zones), rows = [];
    fitNums(after, m.zones).forEach(function (n, k) {
      var o = before[k];
      if (!o || o.id !== n.id || o.v === n.v) return;
      rows.push({ id: n.id, label: n.label, before: o.v, after: n.id === 'gun' && n.v === '—' ? 'NOT UPGRADED' : n.v, credit: [] });
    });
    var a = x.row, used = m.budget.used, hp = a && typeof a.hp === 'number' ? a.hp : 0, price = listPrice(a, p.vrow, shipOf(p)) || 0;
    return { off: true, name: a ? a.name : x.a.key, rows: rows, hp: { before: used, after: used - hp, cap: after.hard_points == null ? '—' : after.hard_points },
      cost: { before: m.cost.total, after: m.cost.total - price }, prints: [] };
  }
  // the budget bar (W1–W3): hard points (a part open at the desk hatches what it would take, W2; over the book's budget warns
  // in its own ink and refuses nothing, W3), the hold (W7's numbers), the fit cost — information only
  function FitBudget(props) {
    var m = props.m, d = props.diff, used = m.budget.used, cap = m.budget.capacity, after = d ? d.hp.after : used, h = m.hold, boxes = [];
    if (cap != null) for (var i = 0; i < Math.max(used, cap, after); i++) {
      boxes.push(el('i', { key: i, className: 'y-box', 'data-on': i < used ? 1 : 0, 'data-pend': i >= used && i < after ? 1 : undefined, 'data-over': i >= cap ? 1 : undefined }));
    }
    return el('div', { className: 'y-budget y-sec', 'data-testid': 'fit-budget' },
      el('div', { className: 'y-meter', 'data-testid': 'fit-hp', 'data-over': m.budget.over ? 1 : 0 }, el('span', { className: 'y-meter-k' }, 'HARD POINTS'),
        cap != null ? el('span', { className: 'y-boxes', 'aria-hidden': true }, boxes) : null,
        el('span', { className: 'y-meter-v' }, used + (d ? ' → ' + after : '') + ' OF ' + (cap == null ? '—' : cap)),
        m.budget.over ? el('span', { className: 'y-warn', 'data-testid': 'fit-over' }, (used - cap) + ' OVER THE BOOK’S BUDGET · YOUR TABLE’S CALL') : null),
      el('div', { className: 'y-meter', 'data-testid': 'fit-hold' }, el('span', { className: 'y-meter-k' }, 'ENCUMBRANCE · THE HOLD'),
        el('span', { className: 'y-meter-v' }, h.open + ' OF ' + (h.openCap == null ? '—' : h.openCap)),
        h.hidCap ? el('span', { className: 'y-meter-k' }, 'HIDDEN') : null, h.hidCap ? el('span', { className: 'y-meter-v' }, h.hidden + ' OF ' + h.hidCap) : null),
      el('div', { className: 'y-meter y-sp', 'data-testid': 'fit-cost' }, el('span', { className: 'y-meter-k' }, 'FIT COST'),
        el('span', { className: 'y-meter-v' }, fmtNum(m.cost.total) + (d ? ' → ' + fmtNum(d.cost.after) : '') + ' CR')));
  }
  // the parts browser (W1): PARTS · the live count · search · INSTALLED (with U10's lines, and U11's lost parts) · FITS THIS
  // HULL · CHECK WITH YOUR GM (the count and its sentence: W1 draws no rows) · DOES NOT FIT (full strength since D-223: its
  // red verdict words refuse it). A part aboard is drawn
  // under INSTALLED only; the counts are the registry's, over the books switched on. WB5: with no book switched on that
  // prints a part, or a search no part's name holds, the groups after INSTALLED give way to one block (U13's empty block).
  function FitBrowser(props) {
    var p = props.p, m = props.m, cap = m.budget.capacity, typed = String(props.q || '').trim(), q = typed.toLowerCase();
    function hit(x) { return !x.mine && (!q || String(x.a.name || '').toLowerCase().indexOf(q) !== -1); }
    var none = m.all === 0 && !m.conv;
    // B-1308: a part INSTALLED whose name holds the search is a hit too, so NO PARTS MATCH never prints under it
    function held(x) { return !!x.row && String(x.row.name || '').toLowerCase().indexOf(q) !== -1; }
    var miss = !none && !!q && !m.installed.some(held) && !['fits', 'check', 'nofit'].some(function (g) { return m.groups[g].some(hit); });
    function empty(h, t, btn) {
      return el('div', { className: 'y-empty y-sec', style: { marginTop: 14 }, 'data-testid': 'fit-empty', 'data-empty': none ? 'none' : 'nomatch' },
        el('div', { className: 'y-empty-h' }, h), el('p', null, t),
        btn ? el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-search-clear', onClick: function () { props.setQ(''); } }, btn) : null);
    }
    function row(x) {
      return props.open === x.a.id ? el(FitOpen, { key: x.a.id, p: p, m: m, x: x, onClose: props.onClose, onAdd: props.onAdd })
        : el(FitRow, { key: x.a.id, x: x, hull: p.vrow, ship: shipOf(p), onOpen: function () { props.onOpen(x.a.id); } });
    }
    function group(k, word, n) { return el('div', { className: 'y-br-g', 'data-testid': 'fit-group', 'data-group': k }, word, el('span', { 'data-testid': 'fit-count-' + k }, n)); }
    return el('div', { 'data-testid': 'fit-browser' },
      el('div', { className: 'y-row', style: { justifyContent: 'space-between', marginBottom: 10 } }, el('span', { className: 'y-e-n' }, 'PARTS'),
        el('span', { className: 'y-mono', 'data-testid': 'fit-count-all' }, m.conv ? 'THE CONVERSION TAKES EVERY HARD POINT · DC p.71' : m.all + (none ? ' IN YOUR BOOKS' : ' IN THE REGISTRY'))),
      el('div', { className: 'y-search' },
        el('input', { type: 'search', value: props.q, placeholder: 'Search the parts…', 'aria-label': 'Search the parts', 'data-testid': 'fit-search',
          style: { flex: 1, minWidth: 0, border: 0, background: 'transparent', font: 'inherit', color: 'var(--doc-ink)' }, onChange: function (e) { props.setQ(e.target.value); } }),
        el('b', { className: 'y-sp' }, 'FITS FIRST')),
      props.hold || null,   // WB4 off the desk: OWNED · THE HOLD heads the list (the desk's stands above the column)
      group('installed', p.plan ? 'IN THE PLAN' : 'INSTALLED', m.budget.used + ' OF ' + (cap == null ? '—' : cap) + ' HARD POINTS'),
      m.installed.filter(function (x) { return x.row && !x.conv; }).map(function (x) { return fitInstRow(p, m, x, props.o); }),
      m.orphans.map(function (x) { return el(FitOrphan, { key: 'o' + x.i, p: p, x: x, ask: props.o.ask, setAsk: props.o.setAsk }); }),
      none ? empty('NO PARTS IN YOUR BOOKS', 'None of the books you have switched on prints a ship part. Turn one on in ⚙ Sources to see its parts.')
        : m.conv ? null : miss ? empty('NO PARTS MATCH', 'No part’s name holds “' + typed + '”. Try another word, or clear the search.', 'CLEAR THE SEARCH')
        : el(React.Fragment, null,
          group('fits', 'FITS THIS HULL', m.groups.fits.length), m.groups.fits.filter(hit).map(row),
          group('check', 'CHECK WITH YOUR GM', m.groups.check.length),
          el('p', { className: 'y-small y-muted', style: { padding: '6px 0' } }, 'Parts limited to named models or classes the registry cannot test.'),
          group('nofit', 'DOES NOT FIT', m.groups.nofit.length), m.groups.nofit.filter(hit).map(row)));
  }
  // W2@390: a free hard point tapped, then a part — its install sheet: WHAT CHANGES, the rule, the mod check, the doors
  function FitInstallSheet(props) {
    var p = props.p, m = props.m, x = props.x, a = x.a, d = fitDiff(p, m, a);
    return el(React.Fragment, null, el('div', { className: 'y-grab' }),
      el('div', { className: 'y-runhead', style: { marginBottom: 6 } }, el('span', null, 'A FREE HARD POINT'), el('span', null, attCite(a) || '')),
      el('h2', { className: 'y-ship-n', style: { fontSize: 18 } }, a.name),
      el(FitMeta, { a: a, hull: p.vrow, ship: shipOf(p) }),
      el('p', { className: 'y-verdict', 'data-fit': x.g, 'data-testid': 'fit-verdict', style: { marginTop: 10, fontSize: 12 } }, fitWhy(x, m.live, true)),
      el('div', { className: 'y-sech', style: { marginTop: 16 } }, el('h2', null, 'WHAT CHANGES')),
      el(FitDelta, { d: d, phone: true }),
      el('div', { className: 'y-sech', style: { marginTop: 16 } }, el('h2', null, 'FITTING IT'), el('span', { className: 'y-cite' }, SHIP_RULE.install)),
      el('p', { className: 'y-e-t y-small', style: { marginTop: 0 } }, el('b', null, 'No check.'), ' Installing a part takes a few minutes of uninterrupted work.'),
      el(FitModNote, { p: p, cls: 'y-act', style: { marginTop: 8 } }),
      el(FitDoors, { p: p, a: a, line: partLine(p, a), onAdd: props.onAdd, onCancel: props.onCancel }));
  }
  // K3 · ADD, no charge: a reason instead of a price, and where it goes — fitted (`installAttachment`, an INSTALLED line with
  // its reason) or into the hold (a spare: CargoLine {kind:'part'}). The log line is shown before it is written.
  // K4's ADD · NO CHARGE is this sheet for a weapon (`props.wx` = { k, x }): FIT IT is the swap on the mount (swapMount, which
  // logs INSTALLED and REMOVED), INTO THE HOLD a spare CargoLine {kind:'weapon', from_mount: null} — A1.4's hold shape, no log line.
  function FitAddSheet(props) {
    var p = props.p, wx = props.wx, x = wx ? wx.x : props.x, a = wx ? wx.x.r : x.a;
    var rs = React.useState('reward'), reason = rs[0], setReason = rs[1];
    var ws = React.useState('fit'), where = ws[0], setWhere = ws[1];
    function commit() {
      var id = p.rec.id, kind = wx ? 'weapon' : 'part';
      if (where === 'fit' && wx) p.apply(function (s) { return V().swapMount(s, id, wx.k.i, a.id, reason, p.now(), null, k4Fit(p, wx.k)); });
      else if (where === 'fit') p.apply(function (s) { return V().installAttachment(s, id, { key: a.id, reason: reason }, p.now()); });
      else p.apply(function (s) { return V().holdSpare(s, id, { kind: kind, ref: a.id, qty: 1 }, p.now(), null); });   // the one hold writer
      props.onDone();
    }
    var hp = wx ? k4Hp(p) : a.hp;
    return el(React.Fragment, null, el('div', { className: 'y-grab' }),
      el('div', { className: 'y-runhead', style: { marginBottom: 6 } }, el('span', null, 'ADD · NO CHARGE'), el('span', null, wx ? SHIP_RULE.t717 : attCite(a) || '')),
      el('h2', { className: 'y-ship-n', style: { fontSize: 18 } }, a.name),
      el('div', { className: 'y-br-m', style: { marginTop: 6 } }, hp != null ? el('span', null, 'HARD POINTS ', el('b', null, hp)) : el('span', null, 'HARD POINTS —'),
        wx ? el('span', { className: 'y-verdict', 'data-fit': x.fits ? 'fits' : 'nofit' }, x.fits ? 'FITS THIS HULL' : 'DOES NOT FIT · THIS HULL IS SILHOUETTE ' + wx.k.sil)
          : el('span', { className: 'y-verdict', 'data-fit': x.g }, x.g === 'fits' ? 'FITS THIS HULL' : fitVerdict(x))),
      el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'WHY IT IS HERE')),
      el('div', { className: 'y-fchips' }, FIT_REASONS.map(function (r) {
        var on = reason === r[0];
        return el('button', { key: r[0], type: 'button', className: 'y-chipb', 'data-on': on ? 1 : 0, 'aria-pressed': on, 'data-testid': 'fit-reason-' + r[0],
          onClick: function () { setReason(r[0]); } }, r[1]);
      })),
      el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'WHERE IT GOES')),
      el('div', { className: 'y-seg', style: { marginTop: 0 } }, [['fit', 'FIT IT'], ['hold', 'INTO THE HOLD']].map(function (w) {
        var on = where === w[0];
        return el('button', { key: w[0], type: 'button', className: 'y-seg-b', 'data-on': on ? 1 : 0, 'aria-selected': on, 'data-testid': 'fit-where-' + w[0],
          onClick: function () { setWhere(w[0]); } }, w[1]);
      })),
      where === 'fit' ? el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'THE LOG WILL READ')) : null,
      where === 'fit' ? el('div', { className: 'y-log', 'data-testid': 'fit-log-preview' }, el('div', { className: 'y-log-r' },
        el('span', { className: 'y-log-s' }, stampOf(p.now())),
        el('span', { className: 'y-log-t' }, el('span', { className: 'y-log-e' }, 'INSTALLED'), a.name + ' — ' + REASON_WORD[reason] + '.')),
        // the swap's second line: the weapon coming off, as the LOG prints a REMOVED event (R-S4WC-6)
        wx ? el('div', { className: 'y-log-r' }, el('span', { className: 'y-log-s' }, stampOf(p.now())),
          el('span', { className: 'y-log-t' }, el('span', { className: 'y-log-e' }, 'REMOVED'), wx.k.w.name + ' — to the hold.')) : null)
        // no StoryEvent kind carries a spare: the hold's line writes no log, and its sentence is cut with its head (D-289)
        : null,
      el('div', { className: 'y-verbs' },
        el('button', { type: 'button', className: 'y-commit', 'data-testid': 'fit-add-commit', onClick: commit }, 'ADD TO ' + upper(shipName(p.rec, p.vrow))),
        el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-add-cancel', onClick: props.onCancel }, 'CANCEL')));
  }
  // ── K4 · A WEAPON FOR THIS MOUNT (Upgraded Weapons, EotE p.271; ruling `shipyard-s4-workbench-contracts` R-S4WC-4/5, the
  // brief's A1.3/A1.6; the approved frame `Docs/mockups/shipyard-counter-parts.html` K4). A mount tapped opens THE BOOK'S LIST:
  // the weapons registry's rows over the books switched on, fitting first (each group in the book's order), each with its
  // price, the store's find mark, the silhouettes Table 7-17 prints and this hull's verdict — information, never a gate (p.271:
  // "guidelines"). The mount's weapon now reads THE ONE COMING OFF. The chosen one opens in place: what it replaces, where the
  // old one goes, its doors; IF IT IS FITTED is the resolver over the record with the swap (never saved). ADD · NO CHARGE is
  // K3's sheet for a weapon; TO THE COUNTER waits on G-7; PLAN is inert.
  function k4Model(p, i) {
    var by = p.ctx && p.ctx.resolve && p.ctx.resolve.weapons, w = p.res && (p.res.weapons || [])[i];
    if (!by || !w) return null;
    var SRC = window.SWRPGSources, cur = SRC && SRC.current ? SRC.current() : null, sil = p.res.silhouette;
    var list = Object.keys(by).map(function (k) { return by[k]; })
      // S8 (ADDENDUM 4 H-2): Table 7-17's shelf only — a row with no printed price (the gun a conversion adds) is never offered
      .filter(function (r) { return V().onTheShelf(r) && (!(cur && cur.index) || SRC.isActiveWith(r, cur.index, cur.off)); })
      .map(function (r) { return { r: r, fits: typeof sil === 'number' && !!r.silhouette && sil >= r.silhouette.min && sil <= r.silhouette.max, off: r.id === w.key }; });
    return { i: i, w: w, word: fitMountWord(w), sil: sil, by: by,
      list: list.filter(function (x) { return x.fits; }).concat(list.filter(function (x) { return !x.fits; })) };
  }
  // what swapMount's refusal test is handed (B8): the hull row's keys and the book's weapons
  function k4Fit(p, k) { return { hull: ((p.vrow && p.vrow.weapons) || []).map(function (w) { return w.key; }), weapons: k.by }; }
  // U10 · B7 — the swaps waiting on the counter for this ship: mount i → the book weapon's key, from the store's ONE reader
  // (`SWRPGStore.counterVesselLines`, the writer's twin), read at render. The Yard never parses the counter's key itself.
  function swapsPending(vesselId) {
    var S = window.SWRPGStore, out = {};
    var lines = S && typeof S.counterVesselLines === 'function' ? S.counterVesselLines() : [];
    lines.forEach(function (l) {
      var f = l.for, L = V() && V().parseCounterId(l.id);
      if (L && L.sec === 'vweap' && f && f.vessel === vesselId && f.then === 'fit' && typeof f.mount === 'number') out[f.mount] = L.key;
    });
    return out;
  }
  // ══ G-7 · THE HOST'S SEAM ONTO THE STORE'S COUNTER (ruling `shipyard-s4-workbench-contracts` R-S4WC-1 A2–A5; A1.4 with
  // B8). lib/store asks what it cannot answer itself — it parses no vehicle data (A2) — and the host hands it this, built
  // from the same registries FIT reads: `o` = { k9: bool, getVehicle: key → hull row, attachments: {id: row}, weapons:
  // {id: row}, now: () → date, session }.
  //   plan(records) → { lines: [{ ok, why, price, name, ship }] }, aligned with the counter's vessel lines IN LINE ORDER:
  //     `ok`/`why` are the store's ONE fold (vesselStore.deliverCounter) run over the state and written nowhere (A3: decided
  //     before the debit; A4; B8's one predicate); `price` is the un-edited line's price — a part's or a weapon's through
  //     `listPrice`, the read FIT prints from (A2), and a mod's SUGGESTED modCost × N × modShipX, N = the mods already on
  //     that part + the same part's earlier mod lines on the counter + 1 (A5).
  //   deliver(records) → { ok, undo? }: the lines the store charged, delivered in ONE `apply` by the same fold — all of
  //     them or none (a line that no longer delivers leaves the state as it was: nothing written, so the host answers
  //     `false` and nothing is charged). `undo` puts the ships back if the sheet's write then fails (the same act).
  // G-7 · A3 — FINALIZE THROUGH THE SEAM: the host's sheet write (`write`, its `onFinalize`), with the ship lines delivered
  // FIRST. The charged ship lines (`summary.vessel`) are delivered in ONE apply before `write` runs; a delivery the fold
  // refuses (or a seam still loading) writes nothing and answers false, so the store keeps its slip and charges nothing; a
  // `write` that answers false puts the ships back (`undo`, the same act). With no ship line it is `write` unchanged.
  // ── SHIP CARGO · THE ACT (card `shipyard-cargo-build` R-SCB-2/-3; ruling `shipyard-cargo-concept` R-SCG-1..4) ──
  // LOAD and UNLOAD each move goods between ONE character's `eq.gear` and ONE ship's hold, as one act over two records, on
  // `finalizeThrough`'s precedent below. The ship's half is vesselStore's (loadCargo / unloadCargo); the character's half is
  // the HOST's write — the SAME function its store's onFinalize persists through, `write(charId, nextEquipment) → boolean`
  // — over the next equipment built here with the store's own stacking helper (`SWRPGStore.stackTargetOf`): no second
  // gear-writing path. Every refusal is decided first; then the destination is written and then the source, and a refused
  // second write puts the first back. Nothing is logged and nothing is charged (TRADE's rule).
  // The character half of LOAD: n of the gear entry at `gi` leave the pack — its count drops, or it goes at 0 (its story
  // stays with what remains). null (refused): no such entry, an inline copy (HELD, R-SCG-6), n not a whole 1..held.
  // R-SCG0-3 (ruling `shipyard-cargo-build-gate`): a gear entry carrying `talentMarks` has the mark ON that copy (R-M8G-12, the
  // store's stackTargetOf rule), and a cargo line has nowhere to keep it, so loading it would lose the mark: it never loads.
  function cargoMarked(g) { return !!(g && typeof g === 'object' && Array.isArray(g.talentMarks) && g.talentMarks.length); }
  function cargoLoadNext(equipment, gi, n) {
    var gear = (equipment && Array.isArray(equipment.gear)) ? equipment.gear : [], g = gear[gi], k = Number(n);
    if (!g || typeof g !== 'object' || g._inline || g.id == null || cargoMarked(g)) return null;
    var held = Math.max(1, Number(g.qty) || 1);
    if (!(k >= 1) || k !== Math.floor(k) || k > held) return null;
    var next = gear.map(function (x) { return (x && typeof x === 'object') ? Object.assign({}, x) : x; });
    if (k === held) next.splice(gi, 1); else next[gi].qty = held - k;
    return Object.assign({}, equipment, { gear: next });
  }
  // The character half of UNLOAD: n of the gear id `ref` join the pack — onto the stack the store would join
  // (stackTargetOf: never a marked copy, never an inline line), else a NEW entry {id, qty, provenance: [{note, when}]} in the
  // store's PROV shape (its `acquireStamp`); a stack bumped gains no note (R-SCG-2, F7). null: no store helper loaded.
  // B-1411 (ruling `release-r7-bug-burndown` ADDENDUM 55 (A)): `refOf(section, id)` — the store's `ownRefOf` for the
  // RECIPIENT — answers the entry to start from. When the recipient's own view cannot resolve the item (homebrew from a
  // collection it does not carry), that is D-82's `{ _inline: <copy> }`, so it never reads "(unknown gear)"; otherwise the
  // bare `{ id }`, exactly as R-SCG-2 wrote it. No refOf: the bare id, as before. An inline line stacks only onto its
  // deep-equal copy (`stackTargetOf`'s own rule).
  function cargoUnloadNext(equipment, ref, n, note, when, refOf) {
    var S = window.SWRPGStore;
    if (!S || typeof S.stackTargetOf !== 'function' || ref == null) return null;
    var eq = Object.assign({}, equipment || {});
    var gear = (Array.isArray(eq.gear) ? eq.gear : []).map(function (g) { return (g && typeof g === 'object') ? Object.assign({}, g) : g; });
    var entry = (typeof refOf === 'function' && refOf('gear', ref)) || { id: ref };
    var hit = S.stackTargetOf(gear, ref, entry._inline);
    if (hit) hit.qty = (Number(hit.qty) || 1) + n;
    else gear.push(Object.assign(entry, { qty: n, provenance: [{ note: note, when: when }] }));
    eq.gear = gear;
    return eq;
  }
  // R-SCG-4 WHO: the GM host, any character and any ship; the player host, a ship that character owns or the party owns
  function cargoInScope(host, rec, charId) {
    var o = String((rec && rec.owner) || '');
    return host === 'gm' || o === 'party' || o === 'char:' + charId;
  }
  // o = { host, write(charId, nextEquipment) → boolean, roster: [{id, sheetData}], gearRow(ref) → row|null,
  //       shipName(rec) → words, now() → the ship's stamp }. Each answers {ok} or {ok: false, why}.
  function cargoCtx(o, charId, vesselId) {
    var VS = V(), st = VS ? VS.getState() : null;
    var who = ((o && o.roster) || []).filter(function (c) { return c && String(c.id) === String(charId); })[0] || null;
    var rec = st ? (st.vessels || []).filter(function (r) { return r.id === vesselId; })[0] || null : null;
    var why = !VS ? 'no_store' : VS.isStale() ? 'held' : !o || typeof o.write !== 'function' ? 'no_write' : !who ? 'no_character'
      : !rec ? 'no_ship' : !cargoInScope(o.host, rec, String(charId)) ? 'scope' : null;
    return { VS: VS, who: who, rec: rec, eq: (who && who.sheetData && who.sheetData.equipment) || {}, why: why };
  }
  function cargoStamp() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return null; } }   // the store's own `when`
  // LOAD: the ship first, then the character; a refused character write puts the ship back. `hidden`: into the hidden hold.
  function cargoLoad(o, charId, gi, vesselId, n, hidden) {
    var x = cargoCtx(o, charId, vesselId);
    if (x.why) return { ok: false, why: x.why };
    var g = (x.eq.gear || [])[gi], next = cargoLoadNext(x.eq, gi, n);
    if (!next) return { ok: false, why: 'refused' };
    var VS = x.VS, before = VS.getState(), now = o.now ? o.now() : null, load = { ref: g.id, n: n, hidden: hidden === true };
    if (VS.loadCargo(before, vesselId, load, now, o.gearRow) === before) return { ok: false, why: 'refused' };
    var got = false;
    VS.apply(function (s) { var r = VS.loadCargo(s, vesselId, load, now, o.gearRow); got = r !== s; return r; });
    if (!got) return { ok: false, why: 'held' };
    if (o.write(String(charId), next) === false) { VS.apply(function () { return before; }); return { ok: false, why: 'write' }; }
    return { ok: true };
  }
  // B-1411: the recipient's own-copy judge — the store's ONE `ownRefOf`, over the discovery view's record of this one id
  // (the catalog it reads is only `recs`). No store, no discovery view: null, and the unload writes the bare id as before.
  // B-1162 (ruling release-r7-bug-burndown ADDENDUM 57): a hold carries spare SUITS too (a pack line holding an armour id);
  // the id's section is the discovery view's (gear first, as the sheet asks), and the entry is written by the store's ONE
  // writer function `packRefOf` — so an unresolvable suit lands as `{ _inline, as: 'armor' }`, never a bare id.
  function cargoRefOf(who) {
    var S = window.SWRPGStore, D = window._canonicalRegistries;
    if (!S || typeof S.ownRefOf !== 'function' || typeof S.packRefOf !== 'function' || !D || !who) return null;
    var own = function (sec, id) { return Object.prototype.hasOwnProperty.call(D[sec] || {}, id); };
    return function (section, id) {
      var sec = own('gear', id) ? 'gear' : own('armor', id) ? 'armor' : section;
      var recs = {}; if (own(sec, id)) recs[sec + ':' + id] = D[sec][id];
      return S.packRefOf(S.ownRefOf(who.sheetData || {}, { recs: recs }), sec, id);
    };
  }
  // UNLOAD: the character first, then the ship; a refused ship write puts the character back.
  function cargoUnload(o, vesselId, cargoId, charId, n) {
    var x = cargoCtx(o, charId, vesselId);
    if (x.why) return { ok: false, why: x.why };
    var VS = x.VS, before = VS.getState(), now = o.now ? o.now() : null;
    var line = (x.rec.cargo || []).filter(function (c) { return c.id === String(cargoId); })[0] || null;
    if (!line || VS.unloadCargo(before, vesselId, cargoId, n, now, o.gearRow) === before) return { ok: false, why: 'refused' };
    var next = cargoUnloadNext(x.eq, line.ref, Number(n), 'unloaded from ' + (o.shipName ? o.shipName(x.rec) : 'the ship'), cargoStamp(), cargoRefOf(x.who));
    if (!next) return { ok: false, why: 'refused' };
    if (o.write(String(charId), next) === false) return { ok: false, why: 'write' };
    var got = false;
    VS.apply(function (s) { var r = VS.unloadCargo(s, vesselId, cargoId, n, now, o.gearRow); got = r !== s; return r; });
    if (!got) { o.write(String(charId), x.eq); return { ok: false, why: 'held' }; }
    return { ok: true };
  }
  function finalizeThrough(seam, write) {
    return function (charId, next, summary) {
      var lines = summary && summary.vessel, got = null;
      if (lines && lines.length) {
        got = seam && !seam.loading && typeof seam.deliver === 'function' ? seam.deliver(lines) : null;
        if (!got || !got.ok) return false;
      }
      var ok = write(charId, next, summary);
      if (ok === false && got && got.undo) got.undo();
      return ok;
    };
  }
  // a part's mat on the counter, by what it is (the store's own way, `SWRPGGlyphs.familyFor`: a name read for its kind)
  function partGlyph(row) {
    var n = String((row && row.name) || '');
    return /plating|armou?r|hull/i.test(n) ? 'armor' : /generator|engine|drive|thruster|reactor|shield|power/i.test(n) ? 'generator' : 'chip';
  }
  // B-1644 (ruling `release-r7-bug-burndown` ADDENDUM 373, brief `release-r7-b1644-step0` A) — A VESSEL LINE'S NAME FOR A
  // HOST WITH NO SEAM (the creator's gear-step Store): the registry row's own `name`, read from the same two caches the seam
  // reads, so the store still parses no vehicle data (R-S4WC-1 A2) and there is one loader. `vmod:` names its part, as the
  // seam's plan does. null while the caches load, or for an id that is not a vessel line.
  function counterName(id) {
    var VS = V(), L = VS ? VS.parseCounterId(id) : null;
    if (!L || L.sec === 'gear') return null;
    var row = L.sec === 'vweap' ? (_wpById && _wpById[L.key]) : (_attById && _attById[L.key]);
    return row && row.name ? row.name : null;
  }
  // `on` false → null and nothing is fetched (373's CONDITION: the host turns it on only while its slip holds a vessel line)
  function useCounterNames(on) {
    var st = React.useState(0), bump = st[1];
    React.useEffect(function () {
      if (!on) return undefined;
      var live = true;
      function tick() { if (live) bump(function (x) { return x + 1; }); }
      if (!_attById) loadAttachments(tick);
      if (!_wpById) loadWeapons(tick);
      return function () { live = false; };
    }, [on]);
    return on ? counterName : null;
  }
  // G-7 · THE SEAM AS A HOOK, for the player's Store mount: it loads the two registries FIT reads, through their own
  // loaders and caches, and answers `counterSeam` over them. While they, or the host's vehicle library (`base.loading`),
  // load, it answers a seam that says so: its plan judges nothing (`why: 'loading'`) and its deliver refuses, so nothing is
  // charged. `on` false → null, and nothing is fetched.
  function useCounterSeam(on, base) {
    var st = React.useState(0), bump = st[1];
    React.useEffect(function () {
      if (!on) return undefined;
      var live = true;
      function tick() { if (live) bump(function (x) { return x + 1; }); }
      if (!_attById) loadAttachments(tick);
      if (!_wpById) loadWeapons(tick);
      return function () { live = false; };
    }, [on]);
    if (!on) return null;
    base = base || {};
    if (!_attById || !_wpById || base.loading) {
      return { loading: true, deliver: function () { return { ok: false }; }, ships: function () { return []; },
        plan: function (records) { return { lines: (records || []).map(function () { return { ok: false, why: 'loading', price: null, name: null, ship: null }; }) }; } };
    }
    return counterSeam({ k9: true, getVehicle: base.getVehicle, attachments: _attById, weapons: _wpById, now: base.now, session: base.session });
  }
  // B-1636 (ruling `release-r7-bug-burndown` ADDENDUM 355 Q2 A) — the gear registry a hold line is judged and loaded by: the
  // items loader's own cache (the store has loaded it before any line reaches the counter)
  function counterGear() { var g = window._canonicalRegistries || window._canonicalRegistriesBase; return (g && g.gear) || null; }
  function counterSeam(o) {
    o = o || {};
    function ctx() {
      var VS = V();
      function vesselOf(id) { return VS ? (VS.getState().vessels || []).filter(function (v) { return v.id === id; })[0] || null : null; }
      function hullRow(id) {
        var r = vesselOf(id);
        return r ? vehicleOf(r, o.getVehicle) : null;
      }
      return { k9: !!o.k9, writable: !!(VS && !VS.isStale()), attachments: o.attachments || null, weapons: o.weapons || null,
        hull: function (id) {
          var row = hullRow(id);
          return row && Array.isArray(row.weapons) ? row.weapons.map(function (w) { return w.key; }) : null;
        },
        // R-S4WB-6: a part priced per point of silhouette with no silhouette on that ship's hull, read as FIT reads it (U12)
        unpriced: function (id, row) { return hullUnpriced(row, inBooks(hullRow(id)), counterShip(vesselOf(id))); },
        // B-1636: a gear line's row (the fold's gear arm and loadCargo's test)
        gearRow: function (id) { var g = counterGear(); return g ? g[id] || null : null; },
        // B-1326 (S-1; R-S8C-15): the offer paths' one rule, so the fold refuses a left-out part ('left_out'), never delivers it
        offered: offered };
    }
    // R-S5R-3: the line's ship as FIT resolves it — its record, the device's characters (F2's one ctx) and the two registries
    function counterShip(r) {
      return r ? { rec: r, ctx: Object.assign({}, deviceResolveCtx([]), { attachments: o.attachments || null, weapons: o.weapons || null }) } : null;
    }
    function plan(records) {
      var VS = V(), c = ctx(), st = VS ? VS.getState() : { vessels: [] }, recs = records || [];
      var run = VS ? VS.deliverCounter(st, recs, c, null, null) : null, onPart = {};
      return { lines: recs.map(function (l, i) {
        var L = VS ? VS.parseCounterId(l.id) : null, f = l.for || {};
        var r = (st.vessels || []).filter(function (v) { return v.id === f.vessel; })[0] || null;
        var gearL = !!L && L.sec === 'gear';
        var row = L && L.sec === 'vweap' ? (c.weapons && c.weapons[L.key]) : gearL ? c.gearRow(L.key) : L ? (c.attachments && c.attachments[L.key]) : null;
        var hull = r ? vehicleOf(r, o.getVehicle) : null, mod = !!L && L.sec === 'vmod';
        // B-1636 (355 Q2 A; mockup HQvHzTZFtVsfFc7eEeythZ v2 frames 2–3): a gear line bound for a hold is priced by the STORE
        // (its list, as any gear line; o3: the hold line keeps no price), and carries the hold it rides into — TRADE's own
        // numbers (`holdOf`: the open hold and its room), so the counter can print THE HOLD a → b OF N
        if (gearL) {
          var gres = r && hull && VR() ? VR().resolve(r, hull, counterShip(r).ctx) : null;
          return { ok: !!run && run.delivered.indexOf(i) !== -1, why: run ? (run.refused[i] || null) : 'off', price: null,
            name: row ? row.name : L.key, ship: r ? shipName(r, hull) : null, sec: 'gear',
            owner: r ? (r.owner === 'party' ? 'party' : 'bond') : null, glyph: 'parcel',
            hold: r ? holdOf({ rec: r, res: gres, gear: counterGear() }) : null };
        }
        var price = null, n = null, detail = null;
        if (L && L.sec === 'vmod') {
          var at = r && typeof f.att === 'number' ? r.attachments[f.att] : null, k = f.vessel + '/' + f.att;
          onPart[k] = (onPart[k] || 0) + 1;
          n = at ? (at.mods || []).length + onPart[k] : null;
          price = n != null ? SHIP_RULE.modCost * n * SHIP_RULE.modShipX : null;
          var oi = row ? (row.added_options || []).map(function (x) { return x.id; }).indexOf(L.option) : -1;
          detail = oi !== -1 && row.added_mods && row.added_mods[oi] ? modLine(row, 'added_mods', oi) || null : null;
        } else price = listPrice(row, inBooks(hull), counterShip(r));   // R-S4WB-6: the line's `for.vessel`, its hull read as FIT reads it (U12)
        // K2's face, read at render (never saved): the words the counter prints for a ship line — the store parses no
        // vehicle data (A2), so the host names the glyph, the owner's stamp, a mod's own words and the tag's caption
        return { ok: !!run && run.delivered.indexOf(i) !== -1, why: run ? (run.refused[i] || null) : 'off', price: price,
          name: row ? row.name : (L ? L.key : String(l.id)), ship: r ? shipName(r, hull) : null,
          sec: L ? L.sec : null, owner: r ? (r.owner === 'party' ? 'party' : 'bond') : null, detail: detail,
          glyph: !L ? 'parcel' : L.sec === 'vweap' ? 'cannon' : mod ? 'chip' : partGlyph(row),
          list: mod ? 'SUGGESTED · ' + SHIP_RULE.modCost + ' CR × ' + (n > 1 ? n + ' × ' : '') + SHIP_RULE.modShipX + ' ON A SHIP' : 'CR EACH · WHAT THE TABLE CHARGED',
          cite: mod ? SHIP_RULE.modShipXCite : null,
          note: mod ? 'A first mod costs ' + SHIP_RULE.modCost + ' credits; on a starship or vehicle the book asks ten times that (' + SHIP_RULE.mod + ', '
            + SHIP_RULE.modShipXCite + '). Edit the tag to what the table charges.' : null };
      }) };
    }
    function deliver(records) {
      var VS = V(), recs = records || [], got = null;
      if (!VS || !recs.length) return { ok: false };
      var before = VS.getState(), c = ctx(), now = o.now ? o.now() : null;
      VS.apply(function (s) {
        var run = VS.deliverCounter(s, recs, c, now, o.session == null ? null : o.session);
        if (run.delivered.length !== recs.length) return s;   // all of them or none
        got = run;
        return run.state;
      });
      if (!got) return { ok: false };
      return { ok: true, undo: function () { VS.apply(function () { return before; }); } };
    }
    // B-1636 (355 Q2 A, 354 Q3 A; mockup v2 frame 1b) — the ships a hold door is offered for: every ship the player's Yard opens
    // for this character, in the hangar's order — its own, the party's, then NO OWNER (U2's group) — the active ones only
    function ships(charId) {
      var VS = V();
      if (!VS) return [];
      var st = VS.getState(), live = (st.vessels || []).filter(isActive), roster = readDeviceRoster();
      var own = charId != null ? live.filter(function (r) { return r.owner === 'char:' + charId; }) : [];
      var party = live.filter(function (r) { return r.owner === 'party'; });
      // each ship once: the shopper's own ship is never also NO OWNER (a shopper this device's saved list does not carry)
      var orphans = live.filter(function (r) { return isOrphan(r, roster) && own.indexOf(r) === -1; });
      return own.concat(party, orphans).map(function (r) { return { id: r.id, name: shipName(r, vehicleOf(r, o.getVehicle)) }; });
    }
    return { plan: plan, deliver: deliver, ships: ships };
  }
  // A1.6 · the swap's hard points, read from Upgraded Weapons' own hp_note ("0 if replacing an existing weapon system", p.271)
  function k4Hp(p) {
    var uw = p.attById && p.attById[K4_ACT], m = uw && /(\d+)\s+if replacing/i.exec(String(uw.hp_note || ''));
    return m ? +m[1] : null;
  }
  // "Accurate 1, Linked 3": the qualities vocabulary's labels (its aliases carry the hull rows' OggDude keys too). THE ONE
  // QUALITY WORD (S6 B1, card `shipyard-s6-build`): THE SHIP, FIT and the catalogue's COMPARE all print through it. A rating
  // the resolver HOLDS (`held`, vesselResolve.js heldOut: the holder's talent rows are not in hand) reads "<Label> —"; the
  // bare label is only a quality the book never rates (S6 B2, B-1090). `qualParts` is the same words one per quality, so a
  // face can keep each "Label N" whole and break only between them (the frames' finding 3).
  function qualLabel(p, key) {
    var e = ((p && p.reg && p.reg.qualities) || {})[key];
    return e ? e.label : key;
  }
  function qualParts(p, qs) {
    return (qs || []).map(function (q) { return qualLabel(p, q.key) + (q.count != null ? ' ' + q.count : q.held ? ' —' : ''); });
  }
  function qualWord(p, qs) { return qualParts(p, qs).join(', '); }
  // the same words as elements: each quality one nowrap span, ", " between — so a line breaks only between qualities
  function qualRun(p, qs) {
    return qualParts(p, qs).map(function (t, k) {
      return el(React.Fragment, { key: k }, k ? ', ' : null, el('span', { style: { whiteSpace: 'nowrap' } }, t));
    });
  }
  // the run, or K4's "NONE" (B-1178: K4Delta's QUALITIES row keeps each quality whole too)
  function qualOrNone(p, qs) { return (qs || []).length ? qualRun(p, qs) : 'NONE'; }
  // S6 B3 · THE SHIP's credit under the quality line (frame F1): one line per `because.weapon_quality_<i>` entry (the resolver's
  // R-M8C8-3 arm), naming the quality it moved and its resolved count, then the source and its signed amount —
  // "LIMITED AMMO 7 · OVERSTOCKED AMMO +1". The quality is joined to the entry by the resolver's own key join.
  function qualCredits(p, w, list) {
    return (list || []).map(function (c) {
      var q = ((w && w.qualities_resolved) || []).filter(function (x) { return VR().qualityKeyIs(x.key, c.quality); })[0];
      return upper(qualLabel(p, q ? q.key : c.quality)) + ' ' + (q && q.count != null ? q.count : '—') + ' · ' + upper(c.source) + ' ' + fitSign(c.amount);
    });
  }
  // K4's IF IT IS FITTED: the resolver over the record with the swap on mount i — one path for the numbers (PRAXIS §5)
  function k4Diff(p, k, W) {
    var hk = p.vrow.weapons[k.i].key, mounts = (p.rec.mounts || []).slice(), at = -1;
    mounts.forEach(function (m, j) { if (at === -1 && m.i === k.i && m.key === hk) at = j; });
    var m = { i: k.i, key: hk, replaced_by: W === hk ? null : W, note: at === -1 ? null : mounts[at].note };
    if (at === -1) mounts.push(m); else mounts[at] = m;
    var after = VR().resolve(Object.assign({}, p.rec, { mounts: mounts }), p.vrow, p.ctx.resolve).weapons[k.i];
    return { i: k.i, before: k.w, after: after, hp: k4Hp(p) };
  }
  function k4Verdict(x, k, chosen) {
    if (chosen) return 'CHOSEN';
    if (x.off) return (x.fits ? 'FITS' : 'DOES NOT FIT') + ' · THE ONE COMING OFF';
    return x.fits ? 'FITS' : 'DOES NOT FIT · THIS HULL IS SILHOUETTE ' + k.sil;
  }
  function K4Meta(props) {   // price on this hull · the store's find mark (rarityBand, as FitMeta reads it) · the silhouettes the book lists
    var r = props.r, F = window.SWRPGRarity && r.rarity != null ? window.SWRPGRarity.rarityBand(r.rarity) : null, pr = listPrice(r, props.hull);
    return el('div', { className: 'y-br-m' },
      pr != null ? el('span', null, el('b', null, fmtNum(pr)), ' CR') : el('span', null, 'PRICE —'),
      F ? el('span', { className: 'y-find' }, el('span', { className: 'y-pips', 'aria-hidden': true }, new Array(F.dice + 1).join('◆')), el('b', null, upper(F.label)))
        : el('span', null, 'RARITY —'),
      el('span', null, 'SILHOUETTE ', el('b', null, r.silhouette.min + '–' + r.silhouette.max)), props.children);
  }
  function K4Row(props) {
    var x = props.x, r = x.r, chosen = !!props.chosen, go = x.off ? null : props.onOpen;
    return el('div', { className: 'y-br-r', 'data-fit': x.fits ? 'fits' : 'nofit', 'data-sel': chosen ? 1 : undefined, 'data-testid': 'fit-weapon', 'data-key': r.id,
      role: go ? 'button' : undefined, tabIndex: go ? 0 : undefined, 'aria-pressed': go && props.pressable ? chosen : undefined,
      'aria-expanded': go && !props.pressable ? false : undefined, onClick: go || undefined, style: go ? { cursor: 'pointer' } : undefined,
      onKeyDown: go ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } : undefined },
      el('div', { className: 'y-br-n' }, r.name, el(FitR, { a: r })),
      el(K4Meta, { r: r, hull: props.hull }, el('span', { className: 'y-verdict', 'data-fit': chosen ? 'installed' : x.fits ? 'fits' : 'nofit', 'data-testid': 'fit-weapon-verdict' },
        k4Verdict(x, props.k, chosen))));
  }
  function K4Open(props) {   // the chosen weapon open in place (the desk): its verdict, what it replaces, where the old one goes, its doors
    var p = props.p, k = props.k, x = props.x, r = x.r, hp = k4Hp(p);
    return el('div', { className: 'y-br-r y-br-open', 'data-fit': x.fits ? 'fits' : 'nofit', 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'fit-weapon-open', 'data-key': r.id },
      el('div', { className: 'y-row', style: { flexWrap: 'nowrap', justifyContent: 'space-between' } }, el('div', { className: 'y-br-n' }, r.name, el(FitR, { a: r })),
        el('span', { className: 'y-row', style: { flexWrap: 'nowrap', gap: 6 } },
          planDoor(p, r.id, 'y-quiet y-hdoor'),
          el('button', { type: 'button', className: 'y-x', 'aria-label': 'close the weapon', 'data-testid': 'fit-weapon-close', onClick: props.onClose }, '✕'))),
      el(K4Meta, { r: r, hull: p.vrow }),
      el('p', { className: 'y-verdict', 'data-fit': x.fits ? 'installed' : 'nofit', 'data-testid': 'fit-verdict', style: { marginTop: 6 } },
        'CHOSEN · ' + (x.fits ? 'FITS' : 'DOES NOT FIT') + ' · THIS HULL IS SILHOUETTE ' + k.sil),
      el('div', { className: 'y-br-x' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'IT REPLACES A WEAPON'), el(Cite, null, SHIP_RULE.t717)),
        el('p', { className: 'y-small', style: { marginTop: 2 }, 'data-testid': 'fit-weapon-note' }, 'Hard points used: ', el('b', null, hp == null ? '—' : hp))),
      el(FitDoors, { p: p, a: r, line: weaponLine(p, k, r), onAdd: props.onAdd, style: { marginTop: 10, flexWrap: 'nowrap' } }));
  }
  function K4Browser(props) {   // the desk: the mount's weapons take the parts column (‹ ALL PARTS goes back)
    var k = props.k;
    return el('div', { 'data-testid': 'fit-k4' },
      el('div', { className: 'y-row', style: { justifyContent: 'space-between', marginBottom: 8 } },
        el('button', { type: 'button', className: 'y-link', 'data-testid': 'fit-k4-back', onClick: props.onBack }, '‹ ALL PARTS'),
        el('span', { className: 'y-mono' }, 'A WEAPON FOR THIS MOUNT')),
      el('div', { className: 'y-e-n', 'data-testid': 'fit-k4-mount' }, 'THE ' + upper(k.word)),
      el('p', { className: 'y-small y-muted', style: { marginTop: 2 } }, 'Upgraded Weapons: a weapon fits by the silhouettes the book lists for it.'),
      el('div', { className: 'y-br-g', 'data-testid': 'fit-group', 'data-group': 'book' }, 'THE BOOK’S LIST'),
      k.list.map(function (x) {
        return props.open === x.r.id ? el(K4Open, { key: x.r.id, p: props.p, k: k, x: x, onClose: props.onClose, onAdd: props.onAdd })
          : el(K4Row, { key: x.r.id, x: x, k: k, hull: props.p.vrow, onOpen: function () { props.onOpen(x.r.id); } });
      }));
  }
  // IF IT IS FITTED · <weapon> (the desk's delta panel) · WHAT CHANGES (the phone's sheet): the mount, damage, critical,
  // qualities, the hard points (Upgraded Weapons' own line), and on the phone where the old one goes. `full`: the phone's
  // table with the desk's rows — F4-MOUNT's WHAT CHANGES names the mount and reads the qualities before → after
  function K4Delta(props) {
    var p = props.p, d = props.d, k = props.k, b = d.before, a = d.after, phone = props.phone, brief = phone && !props.full;
    function dash(v) { return v != null ? v : '—'; }
    var rows = [
      el(FitLed, { key: 'm', k: 'mount', tid: 'fit-delta-row', label: brief ? 'THE MOUNT' : 'THE ' + upper(k.word), value: b.name + ' → ' + a.name }),
      el(FitLed, { key: 'd', k: 'damage', tid: 'fit-delta-row', label: 'DAMAGE', value: dash(b.damage) + ' → ' + dash(a.damage) }),
      el(FitLed, { key: 'c', k: 'crit', tid: 'fit-delta-row', label: 'CRITICAL', value: dash(b.crit) + ' → ' + dash(a.crit) }),
      el(FitLed, { key: 'q', k: 'qualities', tid: 'fit-delta-row', label: 'QUALITIES',
        value: brief ? qualOrNone(p, a.qualities_resolved) : el(React.Fragment, null, qualOrNone(p, b.qualities_resolved), ' → ', qualOrNone(p, a.qualities_resolved)) }),
      el(FitLed, { key: 'hp', k: 'hp', tid: 'fit-delta-row', label: 'HARD POINTS', value: d.hp == null ? '—' : String(d.hp) },
        el('span', { className: 'y-attr', 'data-k': 'note' }, 'IT REPLACES A WEAPON'))];
    if (phone || props.old) rows.push(el(FitLed, { key: 'old', k: 'old', tid: 'fit-delta-row', label: 'THE OLD ONE', value: 'TO THE HOLD' }));   // WB4: the desk's too
    var table = el('table', { className: 'y-led', 'data-testid': phone ? 'fit-delta' : undefined }, el('tbody', null, rows));
    return phone ? table : el('div', { className: 'y-panel y-delta', 'data-testid': 'fit-delta' }, el('div', { className: 'y-panel-h' }, 'IF IT IS FITTED · ' + a.name), table);
  }
  // OWNED · THE HOLD (K4's plate; WB4's list): each spare — a weapon by B4's reading (its own mount's row, else the book's
  // profile; a key nothing resolves prints as the record keeps it, U11), FROM THE <mount> it came off, its session (B1),
  // SPARE. `hw` is the hull weapon a spare came off (FIT IT BACK's mount), `row` a part's registry row.
  function k4Spares(p) {
    var R = VR(), by = p.attById || {};
    return (p.rec.cargo || []).filter(function (c) { return c.kind === 'weapon' || c.kind === 'part'; }).map(function (c) {
      var name = c.ref, from = null, hw = null;
      if (c.kind === 'weapon') {
        var sw = R.spareWeapon(c, p.vrow, p.ctx.resolve);
        if (sw) name = sw.weapon.name;
        hw = typeof c.from_mount === 'number' && p.vrow && p.vrow.weapons ? p.vrow.weapons[c.from_mount] || null : null;
        if (hw) from = 'FROM THE ' + upper(fitMountWord(hw));
        else if (typeof c.from_mount !== 'number') from = 'INTO THE HOLD';   // F4-MOUNT: bought, it came off no mount
      } else if (by[c.ref]) name = by[c.ref].name;
      return { c: c, name: name, from: from, hw: hw, row: c.kind === 'part' ? by[c.ref] || null : null };
    });
  }
  function spareMeta(p, x, phone) {
    return el('div', { className: 'y-br-m' }, x.from ? el('span', null, x.from) : null, el('span', null, stampOf(null)),
      el('span', { className: 'y-verdict', 'data-fit': 'installed' }, phone ? 'SPARE · IN CARGO' : 'SPARE'));
  }
  // WB4 · a spare's doors (R-S4WC-5/6; B5; C3). FIT IT BACK: a weapon that came off one of this hull's mounts goes back on it
  // — swapMount with the spare named, ONE apply: the swap and the line's removal together, and the mount's weapon now goes
  // to the hold. FIT IT: a part, through the one install path with its mods restored and its choices pending (fitPart,
  // C2/C3). Both log INSTALLED … already aboard. F4-MOUNT · FIT IT TO A MOUNT: a weapon bought into the hold (from_mount
  // null) goes on the mount chosen (`ch`, else the first it may go on) — the same swap, `mounts` one row per hull mount, each
  // FITS or DOES NOT FIT by the silhouettes the book lists (information, p.271), a door only where the refusal test passes.
  // → null where no fit is written: a weapon whose mount is not on this hull (DISCARD only), or a swap its refusal test
  // refuses (B8); a bought weapon no mount takes keeps its rows with `go` null.
  function spareFit(p, x, ch) {
    var c = x.c, VS = V(), id = p.rec.id;
    if (c.kind === 'part') return { word: 'FIT IT', go: function (s) { return VS.fitPart(s, id, c.id, 'aboard', p.now(), null); } };
    var hull = ((p.vrow && p.vrow.weapons) || []).map(function (w) { return w.key; }), i = c.from_mount;
    if (!p.res) return null;
    var fit = { hull: hull, weapons: (p.ctx.resolve && p.ctx.resolve.weapons) || {}, spare: c.id };
    if (!x.hw) {
      if (typeof i === 'number') return null;
      var row = fit.weapons[c.ref], sil = p.res.silhouette, fits = !!row && !!row.silhouette && typeof sil === 'number' && sil >= row.silhouette.min && sil <= row.silhouette.max;
      var ms = hull.map(function (k, j) {
        return { i: j, word: fitMountWord(p.vrow.weapons[j]).replace(/ TURRET$/, ' turret'), cur: (p.res.weapons || [])[j] || null, fits: fits,
          ok: VS.swapRefusal(VS.getState(), id, j, c.ref, fit) === null };
      });
      var at = ms.filter(function (mt) { return mt.ok && mt.i === ch; })[0] || ms.filter(function (mt) { return mt.ok; })[0] || null;
      return { word: 'FIT IT', mounts: ms, i: at ? at.i : null, cur: at ? at.cur : null,
        go: at ? function (s) { return VS.swapMount(s, id, at.i, c.ref, 'aboard', p.now(), null, fit); } : null };
    }
    if (VS.swapRefusal(VS.getState(), id, i, c.ref, fit) !== null) return null;
    return { word: 'FIT IT BACK', i: i, cur: (p.res.weapons || [])[i] || null,
      go: function (s) { return VS.swapMount(s, id, i, c.ref, 'aboard', p.now(), null, fit); } };
  }
  // WB4 · a spare open in place: its doors, and THE LOG WILL READ — the line each one writes. A weapon's FIT IT BACK carries
  // Upgraded Weapons' rule (p.271) and where the mount's weapon goes; a part off the desk carries IF YOU FIT IT (the
  // resolver with it fitted, never saved; at the desk the numbers column shows it instead). A weapon bought into the hold
  // carries FIT IT TO A MOUNT (F4-MOUNT): a row per mount, the chosen one's WHAT CHANGES off the desk (K4's, p.230).
  function FitSpareOpen(props) {
    var p = props.p, m = props.m, x = props.x, f = spareFit(p, x, props.ch), hp = k4Hp(p), now = stampOf(p.now());
    function logRow(k, e, t) {
      return el('div', { key: k, className: 'y-log-r' }, el('span', { className: 'y-log-s' }, now), el('span', { className: 'y-log-t' }, el('span', { className: 'y-log-e' }, e), t));
    }
    var fitRows = f && f.go ? [logRow('in', 'INSTALLED', x.name + ' — already aboard.')].concat(f.cur ? [logRow('off', 'REMOVED', f.cur.name + ' — to the hold.')] : []) : null;
    var d = props.phone && x.row && p.res ? fitDiff(p, m, x.row) : null;
    var kd = props.phone && f && f.mounts && f.cur ? k4Model(p, f.i) : null, dd = kd ? k4Diff(p, kd, x.c.ref) : null;
    function go(fn) { p.apply(fn); props.onDone(); }
    function mountRow(mt) {
      var chosen = mt.i === f.i, pick = mt.ok ? function () { props.setCh(mt.i); } : null, fw = mt.fits ? 'FITS' : 'DOES NOT FIT';
      return el('div', { key: mt.i, className: 'y-br-r', 'data-fit': chosen ? 'installed' : mt.fits ? 'fits' : 'nofit', 'data-sel': chosen ? 1 : undefined,
        'data-testid': 'fit-spare-mount', 'data-i': mt.i, role: pick ? 'button' : undefined, tabIndex: pick ? 0 : undefined, 'aria-pressed': pick ? chosen : undefined,
        onClick: pick || undefined, style: pick ? { cursor: 'pointer' } : undefined,
        onKeyDown: pick ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } : undefined },
        el('div', { className: 'y-br-n' }, mt.word),
        el('div', { className: 'y-br-m' }, el('span', null, 'NOW · ' + (mt.cur ? mt.cur.name : '—')),
          el('span', { className: 'y-verdict', 'data-fit': chosen ? 'installed' : mt.fits ? 'fits' : 'nofit', 'data-testid': 'fit-spare-mount-verdict' }, chosen ? 'CHOSEN · ' + fw : fw)));
    }
    return el('div', { className: 'y-br-r y-br-open', 'data-fit': 'installed', 'data-sel': 1, 'aria-expanded': true, 'data-testid': 'fit-spare-open', 'data-key': x.c.ref },
      el('div', { className: 'y-row', style: { flexWrap: 'nowrap', justifyContent: 'space-between' } }, el('div', { className: 'y-br-n' }, x.name),
        el('button', { type: 'button', className: 'y-x', 'aria-label': 'close the spare', 'data-testid': 'fit-spare-close', onClick: props.onClose }, '✕')),
      spareMeta(p, x, false),
      f && f.mounts ? el('div', { className: 'y-br-x', 'data-testid': 'fit-spare-mounts' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'FIT IT TO A MOUNT'), el(Cite, null, SHIP_RULE.t717)),
        el('p', { className: 'y-small y-muted', style: { marginTop: 2 } }, 'Upgraded Weapons: a weapon fits by the silhouettes the book lists for it. Choose the mount it goes on.'),
        f.mounts.map(mountRow)) : null,
      dd ? el('div', { 'data-testid': 'fit-spare-whatchanges' }, el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'WHAT CHANGES'), el('span', { className: 'y-cite' }, SHIP_RULE.t71)),
        el(K4Delta, { p: p, d: dd, k: kd, phone: true, full: true })) : null,
      f && f.cur && !f.mounts ? el('div', { className: 'y-br-x' }, el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'FIT IT BACK'), el(Cite, null, SHIP_RULE.t717))) : null,
      d ? el(React.Fragment, null, el('div', { className: 'y-sech', style: { marginTop: 12 } }, el('h2', null, 'IF YOU FIT IT')),
        el('table', { className: 'y-led', 'data-testid': 'fit-delta' }, el('tbody', null, d.rows.map(function (r) {
          return el(FitLed, { key: r.id, k: r.id, tid: 'fit-delta-row', label: r.label, value: r.before + ' → ' + r.after });
        }).concat([el(FitLed, { key: 'hp', k: 'hp', tid: 'fit-delta-row', label: 'HARD POINTS', value: d.hp.before + ' → ' + d.hp.after + ' OF ' + d.hp.cap })])))) : null,
      el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'THE LOG WILL READ')),
      el('div', { 'data-testid': 'fit-spare-log' },
        fitRows ? el(React.Fragment, null, el('p', { className: 'y-wb-if' }, f.word), el('div', { className: 'y-log' }, fitRows)) : null,
        el('p', { className: 'y-wb-if' }, 'DISCARD'), el('div', { className: 'y-log' }, logRow('dis', 'REMOVED', x.name + ' — discarded.'))),
      el('div', { className: 'y-verbs y-brv' },
        f && f.go ? el('button', { type: 'button', className: 'y-commit', 'data-testid': 'fit-spare-fit', onClick: function () { go(f.go); } }, f.word) : null,
        el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-spare-discard',
          onClick: function () { go(function (s) { return V().discardSpare(s, p.rec.id, x.c.id, p.now(), null); }); } }, 'DISCARD')));
  }
  // WB4 · OWNED · THE HOLD with its doors: at the desk the plate above the left column (`plate`), off it the group that heads
  // the parts list. A row opens in place (FitSpareOpen). Empty, it is not drawn.
  function FitHold(props) {
    var p = props.p, s = k4Spares(p);
    if (!s.length) return null;
    var rows = s.map(function (x) {
      if (props.open === x.c.id) return el(FitSpareOpen, { key: x.c.id, p: p, m: props.m, x: x, phone: !props.plate, ch: props.ch, setCh: props.setCh,
        onClose: function () { props.onOpen(null); }, onDone: function () { props.onOpen(null); } });
      function go() { props.onOpen(x.c.id); }
      return el('div', { key: x.c.id, className: 'y-br-r', 'data-fit': 'installed', 'data-testid': 'fit-spare', 'data-key': x.c.ref, role: 'button', tabIndex: 0,
        'aria-expanded': false, onClick: go, style: { cursor: 'pointer' }, onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } },
        el('div', { className: 'y-br-n' }, x.name), spareMeta(p, x, false));
    });
    var head = el('div', { className: 'y-br-g', style: props.plate ? { marginTop: 0 } : undefined, 'data-testid': 'fit-hold-g' }, 'OWNED · THE HOLD ', el('span', null, 'IN CARGO'));
    return props.plate ? el('section', { className: 'y-sec', 'data-testid': 'fit-hold-plate' }, head, rows) : el(React.Fragment, null, head, rows);
  }
  // K4@390's sheet: the hold read after the list (the approved K4 phone drawing); a spare's doors are the PARTS list's (WB4)
  function K4Hold(props) {
    var p = props.p, s = k4Spares(p);
    if (!s.length) return null;
    return el('div', { 'data-testid': 'fit-hold-plate' }, el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'OWNED · THE HOLD')),
      s.map(function (x) {
        return el('div', { key: x.c.id, className: 'y-br-r', 'data-fit': 'installed', 'data-testid': 'fit-spare', 'data-key': x.c.ref },
          el('div', { className: 'y-br-n' }, x.name), spareMeta(p, x, true));
      }));
  }
  function K4Sheet(props) {   // the phone's (and the iPad's) sheet: the list, WHAT CHANGES for the chosen one, the doors, the hold
    var p = props.p, k = props.k, wo = props.wo, x = wo ? k.list.filter(function (y) { return y.r.id === wo; })[0] : null, d = x ? k4Diff(p, k, wo) : null;
    return el(React.Fragment, null, el('div', { className: 'y-grab' }),
      el('div', { className: 'y-runhead', style: { marginBottom: 6 } }, el('span', null, 'A WEAPON FOR THIS MOUNT'), el(Cite, null, SHIP_RULE.t717)),
      el('h2', { className: 'y-ship-n', style: { fontSize: 18 }, 'data-testid': 'fit-k4-mount' }, 'THE ' + upper(k.word)),
      el('p', { className: 'y-small y-muted', style: { marginTop: 4 } }, 'Upgraded Weapons: a weapon fits by the silhouettes the book lists for it.'),
      el('div', { 'data-testid': 'fit-k4' }, k.list.map(function (y) {
        return el(K4Row, { key: y.r.id, x: y, k: k, hull: p.vrow, chosen: wo === y.r.id, pressable: true, onOpen: function () { props.setWo(wo === y.r.id ? null : y.r.id); } });
      })),
      d ? el(React.Fragment, null,
        el('div', { className: 'y-sech', style: { marginTop: 14 } }, el('h2', null, 'WHAT CHANGES'), el('span', { className: 'y-cite' }, SHIP_RULE.t71)),
        el(K4Delta, { p: p, d: d, k: k, phone: true }),
        el('div', { className: 'y-verbs' },
          p.host === 'player' ? counterDoor(p, weaponLine(p, k, x.r)) : null,
          el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-door-add', onClick: function () { props.onAdd(wo); } }, 'ADD · NO CHARGE'),
          planDoor(p, x.r.id, 'y-quiet'))) : null,
      el(K4Hold, { p: p, phone: true }));
  }
  function FitTab(props) {
    var p = props.p;
    var qs = React.useState(''), q = qs[0], setQ = qs[1];
    var os = React.useState(null), open = os[0], setOpen = os[1];      // the part open in place (W2, K1)
    var ss = React.useState(null), sel = ss[0], setSel = ss[1];        // the free hard point chosen (W2's CHOSEN)
    var sh = React.useState(null), sheet = sh[0], setSheet = sh[1];    // 'parts' (K1@390) · { install: key } (W2@390) · { add: key } (K3) · { mount: i } (K4@390) · { addw: key } (K3 for a weapon)
    var mt = React.useState(null), mount = mt[0], setMount = mt[1];    // K4: the mount tapped
    var wos = React.useState(null), wo = wos[0], setWo = wos[1];       // K4: the weapon chosen for it
    var ins = React.useState(props.openInst != null ? props.openInst : null), inst = ins[0], setInst = ins[1];   // WB3: an installed part open in place (its index); P1 opens its planned part
    var aks = React.useState(null), ask = aks[0], setAsk = aks[1];     // WB3: REMOVE tapped on part i — its ask
    var sps = React.useState(null), spare = sps[0], setSpare = sps[1]; // WB4: a spare open in place (its CargoLine id)
    var scs = React.useState(null), spm = scs[0], setSpm = scs[1];     // F4-MOUNT: the mount chosen for a bought spare (null: the first it may go on)
    var hs = React.useState(null), host = hs[0], setHost = hs[1];      // a sheet stands over the whole room, in its host
    var root = React.useRef(null);
    React.useEffect(function () { if (root.current && root.current.closest) setHost(root.current.closest('.yd-host')); }, []);
    // WB5 · loading and failed replace the tab's body: without the parts list every fitted part would read as lost, so no
    // ship number shows. The failure prints the browser's own words; nothing on the ship has changed.
    if (!p.attById) {
      return el('div', { ref: root, 'data-testid': 'ship-fit', 'data-face': p.attErr ? 'failed' : 'loading' }, p.attErr
        ? el(React.Fragment, null,
          el('div', { className: 'y-plate y-mt' }, el('div', { style: { padding: '12px 14px' } },
            el('p', { className: 'y-wb-fail', 'data-testid': 'fit-failed' }, 'The parts list didn’t load: ' + p.attErr))),
          el('p', { className: 'y-wb-line' }, 'Nothing on the ship has changed. Reload the page to try again.'))
        : el('p', { className: 'y-lead', style: { marginTop: 14 }, 'data-testid': 'fit-loading' }, 'LOADING…'));
    }
    var m = fitModel(p), band = p.band, wide = band === 'wide', phone = band === 'narrow';
    function find(k) { var x = null; ['fits', 'check', 'nofit'].forEach(function (g) { m.groups[g].forEach(function (y) { if (y.a.id === k) x = y; }); }); return x; }
    function close() { setSheet(null); setOpen(null); setSel(null); setMount(null); setWo(null); setInst(null); setAsk(null); setSpare(null); }
    function onOpen(k) {
      if (!wide && sel != null) { setSheet({ install: k }); return; }   // W2@390: a free hard point, then a part: its install sheet
      setInst(null); setAsk(null); setSpare(null);
      setOpen(open === k ? null : k);
    }
    // one thing open at a time: an installed part (WB3) or a spare (WB4) closes the part, the mount and each other
    var o = { inst: inst, ask: ask, setAsk: setAsk,
      setInst: function (i) { setInst(i); if (i != null) { setOpen(null); setSpare(null); setMount(null); setWo(null); } } };
    function onSpare(id) { setSpare(id); setSpm(null); setAsk(null); if (id != null) { setOpen(null); setInst(null); setMount(null); setWo(null); } }
    function onFree(i) {   // W2: a free hard point chosen; off the desk the parts rise to pick from
      if (wide) { setSel(sel === i ? null : i); return; }
      setSel(i);
      setOpen(null);
      setSheet('parts');
    }
    function onAdd(k) {
      // P1: ADD TO THE PLAN writes the part to the plan's local record through THE install path; nothing is saved
      if (p.plan) { p.apply(function (s) { return V().installAttachment(s, p.rec.id, { key: k }, p.now()); }); close(); return; }
      setSheet({ add: k });
    }
    // K4: a mount is a door once the book's weapons are loaded; at the desk its list takes the parts column, off it a sheet rises.
    // P1 draws its mounts as labels: a plan swaps no weapon.
    var k4on = !p.plan && !!(p.ctx && p.ctx.resolve && p.ctx.resolve.weapons && p.res);
    function onMount(i) {
      setOpen(null); setSel(null); setWo(null); setInst(null); setAsk(null); setSpare(null);
      if (wide) { setMount(mount === i ? null : i); return; }
      setMount(i);
      setSheet({ mount: i });
    }
    function onAddW(key) { setSheet({ addw: key }); }
    var k = mount != null && k4on ? k4Model(p, mount) : null;
    var wd = k && wo && !phone && wide ? k4Diff(p, k, wo) : null;
    var pick = open ? find(open) : null, diff = pick && p.res && !phone ? fitDiff(p, m, pick.a) : null;
    // WB3 · IF IT COMES OFF for the installed part open; WB4 · IF IT IS FITTED for the spare open at the desk (a weapon:
    // K4's panel with THE OLD ONE; a part: W2's)
    var instX = inst != null ? m.installed.filter(function (x) { return x.i === inst && x.row; })[0] : null;
    var offDiff = instX && p.res && !phone ? fitDiffOff(p, m, instX) : null;
    var spareDelta = null, swd = null;   // F4-MOUNT at the desk: the chosen mount's IF FITTED in the numbers, and on the ring
    if (spare != null && wide && p.res) {
      var sx = k4Spares(p).filter(function (x) { return x.c.id === spare; })[0], sf = sx ? spareFit(p, sx, spm) : null;
      var sk = sf && sf.cur && k4on ? k4Model(p, sf.i) : null, sd = sk ? k4Diff(p, sk, sx.c.ref) : null;
      if (sk && sf.mounts) swd = sd;
      if (sk) spareDelta = el(K4Delta, { p: p, d: sd, k: sk, old: !sf.mounts });
      else if (sx && sx.row) spareDelta = el(FitDelta, { d: fitDiff(p, m, sx.row) });
    }
    var browser = el(FitBrowser, { p: p, m: m, q: q, setQ: setQ, open: open, onOpen: onOpen, onClose: function () { setOpen(null); }, onAdd: onAdd, o: o,
      hold: wide ? null : el(FitHold, { p: p, m: m, open: spare, onOpen: onSpare, ch: spm, setCh: setSpm }) });
    var budget = el(FitBudget, { m: m, diff: diff });
    // the desk's left column: OWNED · THE HOLD above the list (WB4; K4's plate), the list alone when the hold is empty
    function leftCol(list) {
      var col = el('section', { className: 'y-sec y-colwrap' }, el('div', { className: 'y-col-scroll', 'data-testid': 'fit-col-parts' }, list));
      var hold = el(FitHold, { p: p, m: m, plate: true, open: spare, onOpen: onSpare, ch: spm, setCh: setSpm });
      return k4Spares(p).length ? el('div', { className: 'y-leftstack' }, hold, col) : col;
    }
    var body;
    if (!p.res) {   // U12: no hull, so no verdicts and no numbers; the record's own parts stay, each number "—"
      body = el('div', { className: 'y-sec y-mt', 'data-testid': 'fit-u12' },
        el('div', { className: 'y-br-g', style: { marginTop: 0 } }, 'INSTALLED', el('span', null, m.budget.used + ' OF — HARD POINTS')),
        m.installed.map(function (x) { return x.row ? el(FitRow, { key: x.i, x: { a: x.row, g: 'installed' }, hull: p.vrow, ship: shipOf(p) }) : el(FitOrphan, { key: x.i, p: p, x: x, ask: ask, setAsk: setAsk }); }));
    } else {
      var panels = el(FitPanels, { p: p, m: m, diff: diff, wd: wd || swd,
        // P1: with no part open the panels open with WHAT THE PLAN CHANGES (the planned part open included)
        delta: wd ? el(K4Delta, { p: p, d: wd, k: k }) : diff ? el(FitDelta, { d: diff }) : p.plan ? el(PlanDelta, { p: p, m: m })
          : offDiff ? el(FitDelta, { d: offDiff }) : spareDelta });
      var bigRing = m.budget.capacity != null && m.budget.capacity > FIT_RING_MAX;
      var hp = el(FitHardPoints, { p: p, m: m, sel: sel, onFree: onFree, ask: ask, setAsk: setAsk });
      var zero = m.installed.filter(function (x) { return x.row && !(typeof x.row.hp === 'number' && x.row.hp > 0); });
      var zeroSec = zero.length ? el(React.Fragment, null, el(SechC, { h: 'INSTALLED', x: m.budget.used + ' OF ' + (m.budget.capacity == null ? '—' : m.budget.capacity) + ' HARD POINTS' }),
        el('div', { className: 'y-sec', 'data-testid': 'fit-installed-free' }, zero.map(function (x) { return fitInstRow(p, m, x, o); }))) : null;   // U10 render C: a part that costs no hard point
      if (!phone) {
        body = el('div', { className: 'y-fitwrap' },
          wide ? null : el('div', { className: 'y-row', style: { marginBottom: 10 } },   // W1@1194: the browser folds behind PARTS
            el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-parts', onClick: function () { setSheet('parts'); } }, 'PARTS · ' + m.all + (m.conv ? '' : m.all === 0 ? ' IN YOUR BOOKS' : ' IN THE REGISTRY'))),
          // WB4: a spare open makes the hold's plate tall, so the grid grows by the frame's own 220px and the list still shows
          el('div', { className: 'y-fit', style: { gridTemplateColumns: wide ? '400px minmax(0,1fr) 350px' : 'minmax(0,1fr) 340px', height: wide && spare != null ? 740 : undefined } },
            wide ? leftCol(k ? el(K4Browser, { p: p, k: k, open: wo, onOpen: function (key) { setWo(wo === key ? null : key); }, onClose: function () { setWo(null); },
                onBack: function () { setMount(null); setWo(null); }, onAdd: onAddW }) : browser) : null,
            el('section', { className: 'y-fit-mid y-sec' }, bigRing ? el(React.Fragment, null, el(FitListHead, { p: p }), hp) : el(FitRing, { p: p, m: m, sel: sel, onFree: onFree, pickName: pick ? pick.a.name : null,
              onMount: k4on ? onMount : null, mount: mount, as: swd ? { i: swd.i, name: swd.after.name } : null })),
            el('section', { className: 'y-sec y-colwrap' }, el('div', { className: 'y-col-scroll', 'data-testid': 'fit-col-panels' }, panels))),
          budget);
      } else {
        body = el(React.Fragment, null,
          el('div', { className: 'y-row', style: { marginTop: 14, justifyContent: 'space-between' } },
            el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-parts', onClick: function () { setSheet('parts'); } }, 'PARTS · ' + m.all),
            el('span', { className: 'y-mono' }, 'FITS FIRST')),
          el(FitPhoneRing, { p: p, onMount: k4on ? onMount : null, mount: mount }), zeroSec,
          el(SechC, { h: 'HARD POINTS' }), el('div', { className: 'y-sec' }, hp),
          el('div', { style: { marginTop: 14 } }, budget),
          el(SechC, { h: 'THE NUMBERS' }), el('div', { className: 'y-sec' }, panels));
      }
    }
    var inSheet = null, kind = null, ix = null;
    if (sheet === 'parts') { kind = 'parts'; inSheet = el(React.Fragment, null, el('div', { className: 'y-grab' }), browser); }
    else if (sheet && sheet.install && (ix = find(sheet.install))) { kind = 'install'; inSheet = el(FitInstallSheet, { p: p, m: m, x: ix, onAdd: onAdd, onCancel: close }); }
    else if (sheet && sheet.add && (ix = find(sheet.add))) { kind = 'add'; inSheet = el(FitAddSheet, { key: sheet.add, p: p, x: ix, onDone: close, onCancel: function () { setSheet(null); } }); }
    else if (sheet && sheet.mount != null && k) { kind = 'mount'; inSheet = el(K4Sheet, { p: p, k: k, wo: wo, setWo: setWo, onAdd: onAddW }); }
    else if (sheet && sheet.addw && k && (ix = k.list.filter(function (y) { return y.r.id === sheet.addw; })[0])) {
      kind = 'add';
      inSheet = el(FitAddSheet, { key: 'w' + sheet.addw, p: p, wx: { k: k, x: ix }, onDone: close, onCancel: function () { setSheet(wide ? null : { mount: k.i }); } });
    }
    var over = inSheet && host && window.ReactDOM ? ReactDOM.createPortal(
      el('div', { className: 'yd yd-over y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': 'ship', 'data-testid': 'fit-over' },
        el(YHeldWrap, { onClose: close }, el('div', { className: 'y-scrim', 'data-testid': 'fit-scrim', onClick: close }),
          // the desk's sheet stands at the side (the Yard's side sheet); the phone's and the iPad's rise from below
          el('div', { className: 'y-sheet' + (wide ? ' y-sheet-side' : ''), style: { overflow: 'auto' }, 'data-testid': 'fit-sheet', 'data-sheet': kind }, inSheet))), host) : null;
    return el('div', { ref: root, 'data-testid': 'ship-fit', 'data-face': 'fit' }, body, over);
  }

  // ══ SHIP YARD S8 · MODS — SHIP MODIFICATIONS (card `shipyard-s8-build` R-S8B-8; frames v3 R-S8FR-1, APPROVED D-238) ══
  // The FIT tab's body becomes SHIP MODIFICATIONS: BUILD (a built ship), CONVERSION, PARTS. PARTS is today's FIT unchanged
  // (FitTab above, its testids and its WB5 states kept: ADDENDUM 12 L-3). The route keeps its segment `fit` (ADDENDUM 12 Q1).
  // A section on the phone collapses (its head is the door); at every other width it is a section head, one column.
  function ModsSec(props) {
    var st = React.useState(props.open !== false), on = st[0], set = st[1];
    if (props.band !== 'narrow') return el('section', { 'data-testid': 'mods-sec', 'data-sec': props.k }, el(SechC, { h: props.h, x: props.x, cite: props.cite }), props.children);
    return el('section', { 'data-testid': 'mods-sec', 'data-sec': props.k, 'data-open': on ? 1 : 0 },
      el('button', { type: 'button', className: 'y8-sechb', 'aria-expanded': on, 'data-testid': 'mods-sec-head', onClick: function () { set(!on); } },
        el('span', { className: 'y8-sechb-h' }, props.h), props.x ? el('span', { className: 'y-sech-x' }, props.x) : null,
        el('span', { className: 'y-chev', 'aria-hidden': true }, on ? '▾' : '▸')),
      on ? props.children : null);
  }
  // CONVERSION (b): the ship's conversion (R-S8B-8; frames M-conv) — the template and its cite, what it moved on THIS ship (the
  // resolver without it → today's reading), its guns as THE SHIP's own WeaponRow, credited, the arc picker over the saved picks
  // (a change saves at once), and REMOVE CONVERSION. The parts list missing: its words, the saved key, REMOVE (H-mods); a key the
  // list does not hold: FitOrphan's words, the key printed (ADDENDUM 12 L-7), its REMOVE the conversion's.
  function ModsConverted(props) {
    var p = props.p, R = VR(), c = p.rec.conversion, cv = convOn(p);
    function drop() { p.update({ conversion: null }); }
    var remove = el('div', { className: 'y-verbs y-brv' }, el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'mods-conv-remove', onClick: drop }, 'REMOVE CONVERSION'));
    if (!p.attById) return el('div', { 'data-testid': 'mods-conv', 'data-state': 'held' }, el(PartsWords, { err: p.attErr }),
      el('div', { className: 'y-e-h', style: { marginTop: 8 } }, el('span', { className: 'y-e-n' }, c.key)), remove);
    if (!cv) return el('div', { 'data-testid': 'mods-conv', 'data-state': 'orphan' },
      el('div', { className: 'y-br-r y-orphan', 'data-used': 1, 'data-testid': 'fit-orphan', 'data-key': c.key },
        el('span', { className: 'y-hprow-n' }, c.key, ' ', el('span', { className: 'y-orph-m' }, '· no longer in the parts list · kept on the ship, not applied ·')),
        el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'fit-orphan-remove', onClick: drop }, 'REMOVE')));
    var zones = p.res ? shipZones(p.res) : [], n = convertPicks(cv.row);
    var before = p.res ? R.resolve(Object.assign({}, p.rec, { conversion: null }), p.vrow, p.ctx.resolve) : null;
    var moves = before ? convertMoves(before, p.res, zones) : [];
    var guns = (p.res ? p.res.weapons || [] : []).map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return x.w.added_by === cv.name; });
    return el('div', { 'data-testid': 'mods-conv', 'data-state': 'converted', 'data-key': cv.key },
      el('div', { className: 'y-e-h', style: { marginTop: 4 } }, el('span', { className: 'y-e-n' }, cv.name), cv.cite ? el(Cite, null, cv.cite) : null),
      moves.length ? el('table', { className: 'y-led', 'data-testid': 'conv-diff' }, el('tbody', null,
        moves.map(function (r, i) { return el(FitLed, { key: i, k: 'conv', label: r.label, value: r.value }); }))) : null,
      guns.map(function (x) { return el(WeaponRow, { key: x.i, p: p, res: p.res, w: x.w, i: x.i, noTohit: true }); }),
      n && zones.length ? el(ConvertArcs, { picks: n, arcs: (c.arcs || []).filter(function (z) { return zones.indexOf(z) !== -1; }), zones: zones,
        onArcs: function (a) { p.update({ conversion: Object.assign({}, c, { arcs: a }) }); } }) : null,
      remove);
  }
  // CONVERSION (a): a ship with no conversion — the door to the Convert room (/yard/ship/{id}/fit/convert, ADDENDUM 12 Q1).
  // In the room the same row is the room's head, open (▾), and takes you back to MODS (frames v3 C-elig draw it so).
  function ModsConversion(props) {
    var p = props.p, open = !!props.open;
    return el('div', { 'data-testid': 'mods-conv', 'data-state': 'none' },
      el('button', { type: 'button', className: 'y8-row y8-doorrow', 'aria-expanded': open, 'data-testid': 'mods-convert',
        onClick: function () { p.go(open ? { tab: 'fit' } : { tab: 'fit', at: 'convert' }); } },
        el('span', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, 'CONVERT THIS SHIP'), el(Cite, null, 'DC p.71')),
        el('span', { className: 'y-chev', 'aria-hidden': true }, open ? '▾' : '›')),
      open ? el(ConvertRoom, { p: p }) : null);
  }

  // ── R-S8FR-3 · THE CONVERT ROOM (frames v3 C-elig · C-picked · C-parts · C-nohp, APPROVED D-238): the eleven templates of
  // DC p.71, the ones that fit THIS hull first with what each changes on it, then the rest with their one reason. ──
  // R-S8FJ-3 (`shipyard-s8-frames-card` ADDENDUM 2): the type refusals are a COPY TABLE, word for word, never a function — each
  // followed by " · DC p.71". Its order is the book's, and the room lists the templates in it (C-elig). A conversion row the
  // table does not name sorts after it by name; a guard (test/shipyard_s8_room.cjs) holds the table to the registry's kind
  // 'conversion' rows, so none reaches the room unworded.
  var CONVERT_ONLY_FOR = [
    ['paramilitary_airspeeder', 'ONLY FOR AIRSPEEDERS'], ['paramilitary_cloud_car', 'ONLY FOR CLOUD CARS'],
    ['paramilitary_landspeeder', 'ONLY FOR LANDSPEEDERS'], ['paramilitary_walker', 'ONLY FOR WALKERS'],
    ['paramilitary_wheeled_tracked', 'ONLY FOR WHEELED OR TRACKED VEHICLES'], ['paramilitary_speeder_bike_swoop', 'ONLY FOR SPEEDER BIKES AND SWOOPS'],
    ['paramilitary_bulk_transport', 'ONLY FOR BULK TRANSPORTS'], ['paramilitary_light_freighter', 'ONLY FOR LIGHT FREIGHTERS'],
    ['paramilitary_medium_transport', 'ONLY FOR MEDIUM TRANSPORTS'], ['paramilitary_shuttle', 'ONLY FOR SHUTTLES'],
    ['paramilitary_yacht', 'ONLY FOR YACHTS']];
  function convertOrder(id) { for (var i = 0; i < CONVERT_ONLY_FOR.length; i++) if (CONVERT_ONLY_FOR[i][0] === id) return i; return CONVERT_ONLY_FOR.length; }
  // the room's words for conversionRefusal's one reason (vesselStore, R-S8C-10 / R-S8G-1). 'held' never reaches here: the
  // room shows the parts list's own words (PartsWords) while it is missing, as H-mods does, and lists nothing.
  function convertWhy(why, t) {
    var cite = (t && t.cite) || 'DC p.71';
    if (why === 'has_parts') return 'TAKE OFF ITS PARTS FIRST — A CONVERSION GOES ON A SHIP WITH NONE FITTED · ' + cite;
    if (why === 'no_hard_points') return 'NO HARD POINTS TO TAKE';
    var i = convertOrder(t && t.id);
    return (i < CONVERT_ONLY_FOR.length ? CONVERT_ONLY_FOR[i][1] + ' · ' : '') + cite;
  }
  // the templates on offer: the parts list's kind 'conversion' rows over the books switched on (FIT's own source test)
  function convertTemplates() {
    var SRC = window.SWRPGSources, cur = SRC && SRC.current ? SRC.current() : null;
    return (_attList || []).filter(function (a) { return a.kind === 'conversion' && (!(cur && cur.index) || SRC.isActiveWith(a, cur.index, cur.off)); })
      .slice().sort(function (a, b) { var d = convertOrder(a.id) - convertOrder(b.id); return d || ((a.name || '') < (b.name || '') ? -1 : 1); });
  }
  // how many arcs the template's "+1 defense in the arc of the GM's choice" asks for — the resolver's own count (R-S8B-5)
  function convertPicks(t) {
    var chosen = (t.base_effects || []).some(function (e) { return e.op === 'defense_delta' && e.target === 'chosen'; });
    return !chosen ? 0 : typeof t.defense_picks === 'number' && t.defense_picks > 0 ? t.defense_picks : 1;
  }
  // the ship's own zones in the book's order — the arcs a pick can name (C-elig: FORE · AFT on a silhouette 4 hull)
  function shipZones(res) {
    var S = Schem(), hull = res && S ? S.deriveZones(res.defense, res.silhouette).map(function (z) { return z.id; }) : [];
    return FIT_ZONE_ORDER.filter(function (z) { return hull.indexOf(z) !== -1; });
  }
  // what the template changes on THIS ship: the ONE resolver over the record with the conversion on it (never saved), compared
  // with today's reading, in the frames' rows and words. The added guns are the rows the resolver credits to the template
  // (`added_by`, R-S8V-6 as amended: a turret's guns are a row each).
  function convertDiff(p, t, arcs, zones) {
    var R = VR(), rec = Object.assign({}, p.rec, { conversion: { key: t.id, arcs: arcs, note: null } });
    var a = R.resolve(rec, p.vrow, p.ctx.resolve), src = t.name || t.id;
    return { rows: convertMoves(p.res, a, zones), guns: (a.weapons || []).filter(function (w) { return w.added_by === src; }) };
  }
  // the numbers a conversion moves, BEFORE (`b`) → AFTER (`a`), in the frames' rows and words (C-elig, M-conv)
  function convertMoves(b, a, zones) {
    var rows = [];
    function row(label, x, y, signed) {
      if (x === y) return;
      rows.push({ label: label, value: (x == null ? '—' : signed ? fitSign(x) : String(x)) + ' → ' + (y == null ? '—' : signed ? fitSign(y) : String(y)) });
    }
    row('HANDLING', b.handling, a.handling, true);
    row('ARMOR', b.armor, a.armor);
    row('HULL TRAUMA', b.hull_threshold, a.hull_threshold);
    row('SYSTEM STRAIN', b.strain_threshold, a.strain_threshold);
    zones.forEach(function (z) { row('DEFENSE · ' + FIT_ZONE_WORD[z], b.defense[z], a.defense[z]); });
    return rows;
  }
  // the ship's conversion as its template row: {key, row, name, cite}, or null — none saved, the parts list not in hand, or a key
  // the list does not hold (an orphan, which CONVERSION prints by its key)
  function convOn(p) {
    var c = p.rec && p.rec.conversion, row = c && p.attById ? p.attById[c.key] : null;
    return row && row.kind === 'conversion' ? { key: c.key, row: row, name: row.name || c.key, cite: row.cite || null } : null;
  }
  // "PICK 1 ARC FOR +1 DEFENSE" (ADDENDUM 12 Q2: the approved board's LabArcs rule, the count from `defense_picks`): a picker over
  // the ship's zones; while a pick is owed the picker is marked and CONVERT waits. A tap past the count drops the oldest pick.
  function ConvertArcs(props) {
    var arcs = props.arcs || [], need = props.picks - arcs.length;
    return el('div', { className: 'y8-arcs', 'data-testid': 'conv-arcs', 'data-need': need > 0 ? 1 : 0 },
      el('div', { className: 'y8-k' + (need > 0 ? ' y8-need' : '') }, 'PICK ' + props.picks + (props.picks === 1 ? ' ARC' : ' ARCS') + ' FOR +1 DEFENSE'),
      el('div', { className: 'y8-pick' }, props.zones.map(function (z) {
        var on = arcs.indexOf(z) !== -1;
        return el('button', { key: z, type: 'button', className: 'y8-zone', 'aria-pressed': on, 'data-testid': 'conv-arc', 'data-zone': z,
          onClick: function () { props.onArcs(on ? arcs.filter(function (q) { return q !== z; }) : arcs.concat([z]).slice(-props.picks)); } }, FIT_ZONE_WORD[z]);
      })));
  }
  function ConvertRoom(props) {
    var p = props.p, VS = V();
    var ps = React.useState({}), picks = ps[0], setPicks = ps[1];
    if (!p.attById) return el('div', { 'data-testid': 'conv-door', 'data-state': 'held' }, el(PartsWords, { err: p.attErr }));
    if (!p.res) return el('div', { 'data-testid': 'conv-door', 'data-state': 'u12' });   // U12: no hull in the books, nothing to judge; the head says why
    var zones = shipZones(p.res);
    var list = convertTemplates().map(function (t) { return { t: t, why: VS.conversionRefusal(p.rec, p.vrow, t, p.attById) }; });
    var ok = list.filter(function (x) { return !x.why; }), no = list.filter(function (x) { return x.why; });
    function card(x) {
      var t = x.t, name = t.name || t.id, cite = t.cite || 'DC p.71';
      var head = el('div', { className: 'y-e-h' }, el('span', { className: 'y-br-n' }, name), el(Cite, null, cite));
      if (x.why) return el('div', { key: t.id, className: 'y-br-r', 'data-fit': 'nofit', 'data-testid': 'conv-tpl', 'data-key': t.id, 'data-ok': 0, 'data-why': x.why },
        head, el('p', { className: 'y-verdict', 'data-fit': 'nofit', 'data-testid': 'conv-why', style: { marginTop: 4 } }, convertWhy(x.why, t)));
      var n = convertPicks(t), arcs = picks[t.id] || [], need = n - arcs.length, d = convertDiff(p, t, arcs, zones);
      function go() {
        p.apply(function (s) { return VS.updateVessel(s, p.rec.id, { conversion: { key: t.id, arcs: arcs.slice(), note: null } }, p.now()); });
        p.go({ tab: 'fit' });
      }
      return el('div', { key: t.id, className: 'y-br-r y-br-open', 'data-fit': 'fits', 'data-testid': 'conv-tpl', 'data-key': t.id, 'data-ok': 1 },
        head,
        el('table', { className: 'y-led', 'data-testid': 'conv-diff' }, el('tbody', null,
          d.rows.map(function (r, i) { return el(FitLed, { key: 'n' + i, k: 'conv', label: r.label, value: r.value }); }),
          d.guns.map(function (w, i) {
            return el(FitLed, { key: 'g' + i, tid: 'conv-gun', k: 'gun', label: fitMountWord(w), value: w.name },
              el('span', { className: 'y-attr', 'data-k': 'note' }, 'DAMAGE ' + (w.damage != null ? w.damage : '—') + ' · CRITICAL ' + (w.crit != null ? w.crit : '—')
                + ' · ' + (w.range_label || '—') + ((w.qualities_resolved || []).length ? ' · ' : ''),
                // each quality whole (qualRun), so a narrow row breaks only between them, as C-elig@390 draws it
                (w.qualities_resolved || []).length ? qualRun(p, w.qualities_resolved) : null));
          }))),
        n ? el(ConvertArcs, { picks: n, arcs: arcs, zones: zones, onArcs: function (a) { var o = Object.assign({}, picks); o[t.id] = a; setPicks(o); } }) : null,
        el('div', { className: 'y-verbs y-brv' }, el('button', { type: 'button', className: 'y-commit', 'data-testid': 'conv-go',
          'aria-disabled': need > 0 ? 'true' : undefined, 'data-inert': need > 0 ? 1 : undefined, onClick: need > 0 ? undefined : go }, 'CONVERT')));
    }
    function group(k, word, c) { return el('div', { className: 'y-br-g', 'data-testid': 'conv-group', 'data-group': k }, word, el('span', null, c)); }
    return el('div', { 'data-testid': 'conv-door', 'data-state': 'open' },
      group('fits', 'FITS THIS HULL', ok.length), ok.map(card), group('nofit', 'DOES NOT FIT', no.length), no.map(card));
  }
  // ── R-S8B-8 · MODS' BUILD (frames v3 M-built · M-change · H-mods, APPROVED D-238; lab prototype.py LabBuild_ / LabPicker @
  // ui-lab 1fddaae94): a built ship's three pieces. FRAME has no CHANGE ("A DIFFERENT FRAME IS A DIFFERENT SHIP"); ENGINE and
  // HULL each open the ONE piece picker in place (BuildPicker, the builder room's too, 6f), which writes `build.<slot>` =
  // {key, mods: []} at a tap. HELD (the parts list missing): its words, the frame (its own registry), each piece by its saved
  // key with "—" (H-mods); a key the list does not hold: FitOrphan's words, the key printed (ADDENDUM 12 L-7). ──
  // the book's order for the pieces: FO pp.81–84 page by page, the table's own price order on a page (read through listPrice,
  // the Yard's one price read, R-S5R-19 — a piece is priced flat), then the name
  function pieceRows(by, slot) {
    function pg(r) { var m = /p\.(\d+)/.exec(String(r.cite || '')); return m ? Number(m[1]) : 999; }
    function pr(r) { var n = listPrice(r, null, null); return n == null ? 0 : n; }
    return Object.keys(by || {}).map(function (k) { return by[k]; }).filter(function (r) { return r && r.kind === slot; })
      .sort(function (x, y) { return pg(x) - pg(y) || pr(x) - pr(y) || String(x.name).localeCompare(String(y.name)); });
  }
  function pieceSet(row, op, zone) {
    var e = ((row && row.base_effects) || []).filter(function (x) { return x.op === op && (zone == null || x.target === zone); })[0];
    return e || null;
  }
  // the page's four, in its order (R-S8FJ-1: fore · port · starboard · aft), or the ship's own zones
  function pieceDef(row, zones) {
    return (zones || ['fore', 'port', 'starboard', 'aft']).map(function (z) { var e = pieceSet(row, 'defense_set', z); return e ? e.amount : 0; }).join('/');
  }
  function shipDef(res, zones) { return zones.map(function (z) { return res.defense[z] == null ? '—' : res.defense[z]; }).join('/'); }
  // the refusal and the station's line, each the frames' words with the record's own cite (R-S8B-9)
  function pieceRefusal(frame, row) {
    return row && row.constraints && row.constraints.must_not_be_starship && frame && frame.is_starship ? 'CAN’T GO ON A STARSHIP · ' + s8Cite(row.cite) : null;
  }
  function stationLine(frame) {
    var fx = frame && frame.fixed;
    return fx && typeof fx.speed === 'number' ? 'SPEED STAYS ' + fx.speed + ' ON A SPACE STATION · ' + s8Cite(frame.cite) : null;
  }
  function BuildKV(props) { return el('div', null, props.k + ' ', props.v == null ? el(DashB) : el('b', null, props.v)); }
  // a card's printed numbers: the piece's own page values
  function pieceNums(row, slot) {
    if (slot === 'engine') {
      var sp = pieceSet(row, 'speed_set'), st = pieceSet(row, 'strain_threshold_set');
      return [el(BuildKV, { key: 1, k: 'SPEED', v: sp ? sp.amount : null }), el(BuildKV, { key: 2, k: 'DEFENSE', v: pieceDef(row) }),
        el(BuildKV, { key: 3, k: 'SYSTEM STRAIN', v: st ? st.amount + ' × SIL' : null })];
    }
    var ar = pieceSet(row, 'armor_set'), ha = pieceSet(row, 'handling_set'), en = pieceSet(row, 'encumbrance_delta'), pa = pieceSet(row, 'passengers_delta');
    return [el(BuildKV, { key: 1, k: 'ARMOR', v: ar ? ar.amount : null }), el(BuildKV, { key: 2, k: 'HANDLING', v: ha ? fitSign(ha.amount) : null })]
      .concat(en ? [el(BuildKV, { key: 3, k: 'ENCUMBRANCE', v: '+' + en.amount })] : []).concat(pa ? [el(BuildKV, { key: 4, k: 'PASSENGERS', v: '+' + pa.amount })] : []);
  }
  // the numbers a piece can move, as the ship reads them (the before → after lines of M-change)
  function pieceMoves(res, zones) {
    return [['SPEED', res.speed], ['DEFENSE', shipDef(res, zones)], ['SYSTEM STRAIN', res.strain_threshold], ['ARMOR', res.armor],
      ['HANDLING', res.handling == null ? null : fitSign(res.handling)], ['ENCUMBRANCE', res.encumbrance], ['PASSENGERS', res.passengers]];
  }
  // THE PIECE PICKER, written once: MODS' CHANGE (`change`: a before → after line per number the piece would move on THIS
  // ship, by two resolver readings) and the builder room's (6f). Props: slot 'engine'|'hull', build, frame (its row), by (the
  // parts list), on (the saved key), onPick(key); with `change`: rec, ctx (the resolver's), res (today's reading), zones.
  function BuildPicker(props) {
    var R = VR(), b = props.build || {}, f = props.frame, st = props.slot === 'engine' ? stationLine(f) : null;
    var now = props.change && props.res ? pieceMoves(props.res, props.zones) : null;
    return el('div', { className: 'y8-grid y8-cards1', 'data-testid': 'build-picker', 'data-slot': props.slot }, pieceRows(props.by, props.slot).map(function (r) {
      var refused = props.slot === 'engine' ? pieceRefusal(f, r) : null, on = props.on === r.id, lines = [];
      if (refused) lines.push(el('span', { key: 'r', className: 'y-verdict', 'data-fit': 'nofit', 'data-testid': 'build-refused' }, refused));
      if (st) lines.push(el('span', { key: 's', className: 'y-verdict', 'data-fit': 'installed', 'data-testid': 'build-station' }, st));
      if (now && !on && !refused && R) {
        var bb = Object.assign({}, b); bb[props.slot] = { key: r.id, mods: [] };
        var nx = pieceMoves(R.resolve(Object.assign({}, props.rec, { build: bb }), f, props.ctx), props.zones);
        now.forEach(function (x, i) {
          var a = x[1] == null ? '—' : String(x[1]), c = nx[i][1] == null ? '—' : String(nx[i][1]);
          if (a !== c) lines.push(el('span', { key: 'm' + i, className: 'y-attr', style: { textAlign: 'left' }, 'data-testid': 'build-move' }, x[0] + ' ' + a + ' → ' + c));
        });
      }
      return el('button', { key: r.id, type: 'button', className: 'y8-card', 'data-on': on ? 1 : 0, 'data-refused': refused ? 1 : undefined, 'aria-pressed': on,
        'aria-disabled': refused ? 'true' : undefined, 'data-testid': 'build-' + props.slot, 'data-key': r.id, onClick: refused ? undefined : function () { props.onPick(r.id); } },
        el('span', { className: 'y8-card-b' }, el('span', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, r.name), el(Cite, null, s8Cite(r.cite))),
          el('span', { className: 'y-e-l' }, pieceNums(r, props.slot)), lines.length ? el('span', { className: 'y8-lines' }, lines) : null));
    }));
  }
  function BuildRow(props) {
    return el('div', { className: 'y8-row', 'data-testid': 'mods-build-row', 'data-slot': props.slot, 'data-state': props.state || undefined },
      el('div', { style: { minWidth: 0 } }, el('div', { className: 'y8-k' }, props.slot.toUpperCase()),
        el('div', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, props.name), props.cite ? el(Cite, null, props.cite) : null),
        props.orphan ? el('p', { className: 'y-orph-m', 'data-testid': 'fit-orphan', 'data-key': props.orphan }, '· no longer in the parts list · kept on the ship, not applied ·') : null,
        props.nums ? el('div', { className: 'y-e-l' }, props.nums) : null,
        props.line ? el('p', { className: 'y-mono', style: { marginTop: 6 } }, props.line) : null),
      props.act || null);
  }
  function ModsBuild(props) {
    var p = props.p, b = p.rec.build, f = p.vrow, res = p.res, by = p.attById, held = !by;
    var cs = React.useState(null), ch = cs[0], setCh = cs[1];
    var zones = res ? shipZones(res) : ['fore', 'aft'];
    function change(slot) {
      return el('button', { type: 'button', className: 'y-quiet', 'aria-expanded': ch === slot, 'data-testid': 'mods-change', 'data-slot': slot,
        'aria-disabled': held ? 'true' : undefined, 'data-inert': held ? 1 : undefined, onClick: held ? undefined : function () { setCh(ch === slot ? null : slot); } }, 'CHANGE');
    }
    function pickTo(slot, key) { var bb = Object.assign({}, b); bb[slot] = { key: key, mods: [] }; p.update({ build: bb }); setCh(null); }
    function piece(slot, nums) {
      var key = b[slot] && b[slot].key, row = key && by ? by[key] : null, ok = !!(row && row.kind === slot);
      var state = held ? 'held' : !key ? 'none' : ok ? 'set' : 'orphan';
      var rows = [el(BuildRow, { key: slot, slot: slot, state: state, name: ok ? row.name : key || '—', cite: ok ? s8Cite(row.cite) : null, orphan: state === 'orphan' ? key : null,
        nums: state === 'orphan' ? null : nums(ok && res), act: change(slot) })];
      if (ch === slot && !held) rows.push(el(BuildPicker, { key: slot + '-pick', slot: slot, build: b, frame: f, by: by, on: key, change: true, rec: p.rec,
        ctx: p.ctx.resolve, res: res, zones: zones, onPick: function (k) { pickTo(slot, k); } }));
      return rows;
    }
    var eng = b.engine && by ? by[b.engine.key] : null, ex = eng ? pieceSet(eng, 'strain_threshold_set') : null;
    return el('div', { 'data-testid': 'mods-build', 'data-state': held ? 'held' : 'open' },
      held ? el(PartsWords, { err: p.attErr }) : null,
      el(BuildRow, { slot: 'frame', name: f ? f.name : b.frame || '—', cite: f ? s8Cite(f.cite) : null, line: 'A DIFFERENT FRAME IS A DIFFERENT SHIP',
        nums: f ? [el(BuildKV, { key: 1, k: 'SILHOUETTE', v: f.silhouette }), el(BuildKV, { key: 2, k: 'HULL TRAUMA', v: f.hull_trauma }),
          el(BuildKV, { key: 3, k: 'HARD POINTS', v: f.hard_points_total }), el(BuildKV, { key: 4, k: 'CREW', v: crewLine(f) })] : null }),
      piece('engine', function (on) {
        return [el(BuildKV, { key: 1, k: 'SPEED', v: on ? res.speed : null }), el(BuildKV, { key: 2, k: 'DEFENSE', v: on ? shipDef(res, zones) : null }),
          el(BuildKV, { key: 3, k: 'SYSTEM STRAIN', v: on && ex && f ? ex.amount + ' × SIL = ' + ex.amount * f.silhouette : null })];
      }),
      piece('hull', function (on) {
        return [el(BuildKV, { key: 1, k: 'ARMOR', v: on ? res.armor : null }), el(BuildKV, { key: 2, k: 'HANDLING', v: on && res.handling != null ? fitSign(res.handling) : null })];
      }));
  }
  function ModsTab(props) {
    var p = props.p, band = p.band;
    // the Convert room (route `at: 'convert'`) is MODS with the CONVERSION door open and PARTS set aside; a ship already
    // converted has no door to open, so the room reads as MODS itself
    var room = props.convert && !(p.rec && p.rec.conversion);
    return el('div', { 'data-testid': 'ship-mods', 'data-built': p.rec && p.rec.build ? 1 : 0, 'data-converted': p.rec && p.rec.conversion ? 1 : 0, 'data-room': room ? 'convert' : undefined },
      el('h2', { className: 'y8-modsh', 'data-testid': 'mods-head' }, 'SHIP MODIFICATIONS'),
      p.rec && p.rec.build && !room ? el(ModsSec, { k: 'build', h: 'BUILD', band: band }, el(ModsBuild, { p: p })) : null,
      el(ModsSec, { k: 'conversion', h: 'CONVERSION', band: band }, p.rec && p.rec.conversion ? el(ModsConverted, { p: p }) : el(ModsConversion, { p: p, open: room })),
      room ? null : el(ModsSec, { k: 'parts', h: 'PARTS', band: band }, el(FitTab, props)));
  }

  // ══ SHIP YARD S8 · BUILD A SHIP (card `shipyard-s8-build` R-S8B-9; frames v3 B-empty · B-part · B-s1 · B-s2 · B-corvette ·
  // B-station · H-build · B-door · B-catdoor, APPROVED D-238; lab prototype.py LabBuild / LabYours / LabBuildDoor @ ui-lab
  // 1fddaae94). The route is `/yard/build` (card ADDENDUM 12 Q1). Three picks — a FRAME (its own registry), an ENGINE and a
  // HULL (the ONE piece picker, BuildPicker, with no `change`) — then YOUR SHIP: every number with its reason, NAME, and the
  // add, which writes ONE record {vehicleKey '', build: {frame, engine: {key, mods: []}, hull: {key, mods: []}, note: null}}
  // and opens THE SHIP. Nothing is saved before the add; the picks live in this room's state. ══
  // YOUR SHIP's reasons (a VIEW rule under ADDENDUM 15 H-2 (a); the resolver writes the pieces' credits, never the frame's): a
  // number the frame prints is credited "<FRAME> FRAME · <cite>", each piece's change to it by the resolver's own credit with
  // the piece's cite (s8Credit), a Space Station's fixed speed by its line; `arith` is the frames' sum or product.
  var BUILT_FRAME = ['silhouette', 'hull_trauma', 'hard_points', 'encumbrance', 'passengers', 'sensor', 'crew'];
  var BUILT_RES = { silhouette: 'silhouette', hull_trauma: 'hull_threshold', hard_points: 'hard_points', encumbrance: 'encumbrance', passengers: 'passengers',
    speed: 'speed', strain: 'strain_threshold', armor: 'armor', handling: 'handling' };
  var BUILT_ROW = { silhouette: 'silhouette', hull_trauma: 'hull_trauma', hard_points: 'hard_points_total', encumbrance: 'encumbrance_capacity', passengers: 'passengers' };
  function frameCredit(f) { return upper(f.name) + ' FRAME' + (f.cite ? ' · ' + s8Cite(f.cite) : ''); }
  // b = {frame, engine, hull}: the frame row and the two piece ROWS (null = not picked, or refused on this frame); res = the
  // ONE resolver's reading of the record (null or held while the parts list is missing: the frame's own numbers then)
  function builtWhy(b, res, src) {
    var f = b.frame, live = res && !heldOf(res), n = {}, why = {}, arith = {};
    function cred(c) { var x = s8Credit(src, c); return (typeof x.amount === 'number' ? fitSign(x.amount) + ' · ' : '') + x.source; }
    function because(k) { return ((live && res.because) || {})[k] || []; }
    if (!f) return { n: n, why: why, arith: arith };
    BUILT_FRAME.forEach(function (k) {
      why[k] = [frameCredit(f)];
      if (k === 'sensor') { n[k] = f.sensor_range_label ? upper(f.sensor_range_label) : null; return; }
      if (k === 'crew') { n[k] = crewLine(f); return; }
      n[k] = live ? res[BUILT_RES[k]] : f[BUILT_ROW[k]];
      var adds = because(BUILT_RES[k]).filter(function (c) { return typeof c.amount === 'number'; });
      adds.forEach(function (c) { why[k].push(cred(c)); });
      if (adds.length && live) arith[k] = [f[BUILT_ROW[k]]].concat(adds.map(function (c) { return c.amount; })).join(' + ').replace(/\+ -/g, '− ') + ' = ' + n[k];
    });
    if (b.engine && live) {
      var fixed = because('speed').filter(function (c) { return 'fixed' in c; })[0];
      n.speed = res.speed; why.speed = fixed ? [stationLine(f)] : because('speed').map(cred);
      var z = shipZones(res); n.defense = shipDef(res, z); why.defense = because('defense_' + z[0]).map(cred);
      var ex = pieceSet(b.engine, 'strain_threshold_set');
      n.strain = res.strain_threshold; why.strain = because('strain_threshold').map(cred);
      if (ex && f.silhouette != null) arith.strain = ex.amount + ' × ' + f.silhouette + ' = ' + res.strain_threshold;
    }
    if (b.hull && live) {
      n.armor = res.armor; why.armor = because('armor').map(cred);
      n.handling = res.handling == null ? null : fitSign(res.handling); why.handling = because('handling').map(cred);
    }
    return { n: n, why: why, arith: arith };
  }
  var YOURS_ROWS = [['silhouette', 'SILHOUETTE'], ['hull_trauma', 'HULL TRAUMA'], ['hard_points', 'HARD POINTS'], ['encumbrance', 'ENCUMBRANCE'],
    ['passengers', 'PASSENGERS'], ['sensor', 'SENSORS'], ['crew', 'CREW'], ['speed', 'SPEED'], ['defense', 'DEFENSE'], ['strain', 'SYSTEM STRAIN'],
    ['armor', 'ARMOR'], ['handling', 'HANDLING']];
  function BuildYours(props) {
    var d = props.d;
    return el('div', { className: 'y8-yours', 'data-testid': 'build-yours' },
      el('div', { className: 'y-panel-h' }, 'YOUR SHIP'), props.held ? el(PartsWords, { err: props.err }) : null,
      el('table', { className: 'y-led' }, el('tbody', null, YOURS_ROWS.map(function (r) {
        var v = d.n[r[0]];
        return el(FitLed, { key: r[0], k: r[0], tid: 'build-led', label: r[1], value: v == null ? el(DashB) : (d.arith[r[0]] || String(v)) },
          v == null ? null : (d.why[r[0]] || []).map(function (c, i) { return el('span', { key: i, className: 'y-attr', 'data-testid': 'build-why' }, c); }));
      }))),
      el('p', { className: 'y-small y8-told', 'data-testid': 'build-told' }, 'The book’s crafting check, cost and time are your GM’s call (FO pp.76–77).'),
      el('label', { className: 'y8-name' }, el('span', { className: 'y8-k' }, 'NAME'),
        el('input', { type: 'text', value: props.name, 'data-testid': 'build-name', 'aria-label': 'Name', onChange: function (e) { props.setName(e.target.value); } })),
      el('div', { className: 'y-verbs', style: { marginTop: 12 } }, props.door));
  }
  function frameCard(f, on, onPick) {
    return el('button', { key: f.id, type: 'button', className: 'y8-card', 'data-on': on ? 1 : 0, 'aria-pressed': on, 'data-testid': 'build-frame', 'data-key': f.id,
      onClick: function () { onPick(f.id); } },
      el('span', { className: 'y8-art', 'aria-hidden': true }, el(Ident, { host: 'cat-grid', w: 84, px: 84, rec: f, name: f.name })),
      el('span', { className: 'y8-card-b' }, el('span', { className: 'y-e-h' }, el('span', { className: 'y-e-n' }, f.name), el(Cite, null, s8Cite(f.cite))),
        el('span', { className: 'y-e-l' }, el(BuildKV, { k: 'SILHOUETTE', v: f.silhouette }), el(BuildKV, { k: 'HULL TRAUMA', v: f.hull_trauma }),
          el(BuildKV, { k: 'HARD POINTS', v: f.hard_points_total }), el(BuildKV, { k: 'CREW', v: crewLine(f) }))));
  }
  // props: host 'player'|'gm' · route · nav(route) · character / roster / portraitFor /
  //        onNewCharacter (player: the add's owner, as the catalogue entry's add reads them, U6/U7) · initial (a leg's picks)
  function YardBuildRoom(props) {
    var VS = V(), R = VR(), UI = window.SWRPGUI, band = useYdBand(), attLoad = useYdAttachmentsLoad(), by = attLoad.by, held = !by;
    var weaponsById = useYdWeapons(), frames = VS && VS.useFrames ? VS.useFrames() : null;
    // the books vocabulary arrives after the first paint: the cites (s8Cite) re-read then, as THE SHIP's do (U12)
    if (UI && UI.useActiveSources) UI.useActiveSources();
    var i0 = props.initial || {};
    var fs = React.useState(i0.frame || null), fk = fs[0], setFk = fs[1];
    var es = React.useState(i0.engine || null), ek = es[0], setEk = es[1];
    var hs = React.useState(i0.hull || null), hk = hs[0], setHk = hs[1];
    var ns = React.useState(i0.name || ''), name = ns[0], setName = ns[1];
    var ys = React.useState(!!i0.open), yours = ys[0], setYours = ys[1];
    var cs = React.useState(false), choosing = cs[0], setChoosing = cs[1];
    var hostRef = React.useRef(null), hst = React.useState(null), hostEl = hst[0], setHostEl = hst[1];
    React.useEffect(function () { if (hostRef.current) setHostEl(hostRef.current); }, []);
    var narrow = band === 'narrow', gm = props.host === 'gm', stale = !!(VS && VS.isStale && VS.isStale());
    var f = frames && fk ? frames[fk] || null : null;
    var er = by && ek ? by[ek] : null, hr = by && hk ? by[hk] : null;
    if (er && (er.kind !== 'engine' || pieceRefusal(f, er))) er = null;   // a refused engine is not on this frame (it stays marked, its numbers "—")
    if (hr && hr.kind !== 'hull') hr = null;
    var build = { frame: fk, engine: ek ? { key: ek, mods: [] } : null, hull: hk ? { key: hk, mods: [] } : null, note: null };
    // the ONE resolver context (B-1067 F2), read here: a ship not yet built has no crew, so no host's scope reaches its numbers
    var rctx = Object.assign({}, deviceResolveCtx([]), { attachments: by || null, weapons: weaponsById });
    var res = f && R ? R.resolve({ attachments: [], build: { frame: fk, engine: er ? build.engine : null, hull: hr ? build.hull : null, note: null } }, f, rctx) : null;
    var src = {}; [er, hr].forEach(function (r) { if (r) src[r.name] = s8Cite(r.cite); });
    var d = builtWhy({ frame: f, engine: er, hull: hr }, res, src);
    var ready = !!(f && er && hr) && !held && !!String(name).trim();
    function add(owner, note) {
      var now = new Date().toISOString().slice(0, 10), id = null;
      VS.apply(function (s) {
        var r = VS.acquire(s, '', { owner: owner, nickname: String(name).trim(), note: note, when: now }, now); id = r.id;
        return VS.updateVessel(r.state, r.id, { build: build }, now);
      });
      if (id != null) props.nav({ room: 'ship', id: id, tab: null });
    }
    // the add's owner, as the catalogue entry's add reads it (CatAcquire, U6/U7): the GM's ＋ ADD TO PARTY; the player's character,
    // else "Whose ship?" over this device's characters, else MAKE A CHARACTER ›
    var door, inert = !ready;
    function commit(word, fn, tid) {
      return el('button', { type: 'button', className: 'y-commit', 'data-testid': tid || 'build-add', 'aria-disabled': inert ? 'true' : undefined, 'data-inert': inert ? 1 : undefined,
        onClick: inert ? undefined : fn }, word);
    }
    if (gm) door = commit('＋ ADD TO PARTY', function () { add('party', 'Added to the party from the yard.'); });
    else if (props.character) door = commit('＋ ADD TO YOUR VESSELS', function () { add('char:' + props.character.id, 'Acquired.'); });
    else if (!(props.roster || []).length) door = el('button', { type: 'button', className: 'y-commit', 'data-testid': 'entry-make-character', onClick: props.onNewCharacter }, 'MAKE A CHARACTER ›');
    else door = commit('＋ ADD TO YOUR VESSELS', function () { setChoosing(true); });
    if (stale && UI && UI.StaleHold) door = el(UI.StaleHold, { held: true }, door);
    var list = frames ? Object.keys(frames).map(function (k) { return frames[k]; }) : [];
    var planet = list.filter(function (x) { return !x.is_starship; }), ships = list.filter(function (x) { return x.is_starship; });
    function group(word, rows) {
      return [el('div', { key: word, className: 'y-br-g', 'data-testid': 'build-group' }, word, el('span', null, rows.length)),
        el('div', { key: word + '-g', className: 'y8-grid y8-frames' }, rows.map(function (x) { return frameCard(x, fk === x.id, setFk); }))];
    }
    var engines = pieceRows(by, 'engine'), hulls = pieceRows(by, 'hull');
    var pickers = el('div', { 'data-testid': 'build-pickers' },
      el(SechC, { h: 'FRAME', x: frames ? String(list.length) : null }), group('PLANETARY', planet), group('STARSHIPS', ships),
      el(SechC, { h: 'ENGINE', x: held ? null : String(engines.length) }),
      held ? el(PartsWords, { err: attLoad.err }) : el(BuildPicker, { slot: 'engine', build: build, frame: f, by: by, on: ek, onPick: setEk }),
      el(SechC, { h: 'HULL', x: held ? null : String(hulls.length) }),
      held ? null : el(BuildPicker, { slot: 'hull', build: build, frame: f, by: by, on: hk, onPick: setHk }));
    var yp = el(BuildYours, { d: d, held: held, err: attLoad.err, name: name, setName: setName, door: door });
    function sum(v) { return v == null ? '—' : String(v); }
    var bar = narrow ? el('button', { type: 'button', className: 'y8-bar', 'data-testid': 'build-bar', 'aria-expanded': yours, onClick: function () { setYours(true); } },
      el('span', { className: 'y8-sum' }, 'SPEED ' + sum(d.n.speed) + ' · HANDLING ' + sum(d.n.handling) + ' · ARMOR ' + sum(d.n.armor) + ' · HULL ' + sum(d.n.hull_trauma)),
      el('span', { className: 'y8-bar-k' }, 'YOUR SHIP ›')) : null;
    var sheet = narrow && yours && hostEl && window.ReactDOM ? ReactDOM.createPortal(
      el('div', { className: 'yd yd-over y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': 'build', 'data-testid': 'build-over' },
        el(YHeldWrap, { onClose: function () { setYours(false); } }, el('div', { className: 'y-scrim', 'data-testid': 'build-scrim', onClick: function () { setYours(false); } }),
          el('div', { className: 'y-sheet', style: { overflow: 'auto' }, 'data-testid': 'build-sheet' }, el('div', { className: 'y-grab' }), yp))), hostEl) : null;
    var picker = choosing ? el(PickerLayer, { roster: props.roster, owner: null, portraitFor: props.portraitFor, title: 'Whose ship?',
      onClose: function () { setChoosing(false); }, onPick: function (key) { setChoosing(false); add(key, 'Acquired.'); } }) : null;
    var body = narrow ? el(React.Fragment, null, pickers, bar) : el('div', { className: 'y8-two' }, pickers, el('div', { className: 'y8-side' }, yp));
    return el('div', { ref: hostRef, className: 'yd-host', 'data-testid': 'yard-s4', 'data-yard-room': 'build', 'data-band': band, 'data-stale': stale ? 1 : undefined },
      el('div', { className: 'yd-scroll' }, el('div', { className: 'yd y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': 'build' },
        el('div', { className: 'y-main' }, stale && UI && UI.StaleTabBanner ? el('div', { style: { marginBottom: 12 } }, el(UI.StaleTabBanner, { paper: true })) : null,
          el('div', { className: 'y-mast' }, el('h1', { className: 'y-h1' }, 'BUILD A SHIP')), body))), sheet, picker);
  }

  // U12 · a hull not in the loaded books: the hull row, or null for a key the library does not hold or a hull whose book is
  // switched off in ⚙ Sources — the same test the catalogue applies (yardView.jsx, BOOKS-1b: SWRPGSources.isActiveWith over
  // the row's source and source_code). The ship room reads its hull through it (`vrow`), and so does the counter's price
  // (`counterSeam`, R-S4WB-6), so a part costs the same on FIT and on the counter.
  function inBooks(row) {
    var SRC = window.SWRPGSources, cur = SRC && SRC.current ? SRC.current() : null;
    return row && cur && cur.index && !SRC.isActiveWith({ sources: [row.source, row.source_code].filter(Boolean) }, cur.index, cur.off) ? null : row;
  }

  // ══ THE SHIP ROOM — one record, two arrangements (the Moment Split), mounted by BOTH hosts for K6's room 'ship' ══
  // `route` = { room:'ship', id, tab, at } (yardRoute). SHEET at /ship/<id>, its DECK room at /ship/<id>/room/deck,
  // the WORKBENCH at /ship/<id>/<tab>. An unknown or tombstoned id renders not-found in place. Stale (another tab saved
  // with a newer build): S3 — the shared paper banner above, everything below it held (StaleHold), only REFRESH live.
  function YardShip(props) {
    var VS = V(), R = VR();
    var reg = useYdRegistries(), attLoad = useYdAttachmentsLoad(), attById = attLoad.by, weaponsById = useYdWeapons(), gear = useYdGear(), units = useYdUnits(), band = useYdBand();
    var state = VS ? VS.useVessels() : { v: 1, vessels: [] };
    if (VS && VS.useFrames) VS.useFrames();   // S8 (R-S8B-4): the frames arrive after the first paint; a built ship's row re-reads then
    var UI = window.SWRPGUI;
    if (UI && UI.useActiveSources) UI.useActiveSources();   // a book switched in ⚙ Sources re-renders the room (U12)
    var TV = window.SWRPGTalentView;
    if (TV && TV.useTalentViewEpoch) TV.useTalentViewEpoch();   // A3-2: an own-pack edit re-renders the room, so a character's seat dice move (B-844)
    var stale = !!(VS && VS.isStale());
    var route = props.route || {};
    var rec = (state.vessels || []).filter(function (r) { return r.id === route.id; })[0] || null;
    if (!rec || !VS) return el(YardNotFoundRoom, { what: 'ship', id: route.id });
    if (props.loading) {   // the vehicle library is still loading: no face yet, never U12's box by mistake
      return el('div', { className: 'yd-host', 'data-testid': 'yard-s4-ship', 'data-yard-room': 'ship', 'data-band': band, 'data-face': 'loading' },
        el('div', { className: 'yd-scroll' }, el('div', { className: 'yd y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': 'ship' },
          el('div', { className: 'y-main' }, el('p', { className: 'y-lead', 'data-testid': 'ship-loading' }, 'LOADING…')))));
    }
    // B-1015: `attachments: null` while the parts list is missing (loading, or failed) — the resolver then HOLDS a ship with a part
    // fitted rather than reading it against an empty list (R-S4CC-6). FIT's own body is WB5's whole-body state meanwhile.
    var ctx = { resolve: Object.assign({}, props.ctx || {}, { attachments: attById || null, weapons: weaponsById }), roster: props.roster || [], charPool: props.charPool || null };
    // U12 · a hull not in the loaded books (`inBooks`): every number that needs the hull then reads "—"; the record's own
    // values stay
    var vrow = inBooks(vehicleOf(rec, props.getVehicle));
    var res = vrow && R ? R.resolve(rec, vrow, ctx.resolve) : null;
    var unit = units.filter(function (u) { return u.members.indexOf(rec.id) !== -1 || u.flagship === rec.id; })[0] || null;
    function now() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return null; } }
    function apply(fn) { VS.apply(fn); }
    var run = shipRun({ host: props.host, owner: props.owner, reg: reg, roster: props.roster }, rec, units);
    var p = { rec: rec, vrow: vrow, res: res, reg: reg, roster: props.roster || [], ctx: ctx, portraitFor: props.portraitFor,
      band: band, host: props.host, unit: unit, attById: attById, attErr: attLoad.err, gear: gear, run: run, now: now, apply: apply, nav: props.nav,
      toCounter: props.toCounter || null,   // G-7 · R-S4WC-2: the player host's TO THE COUNTER (the store's writer, then the counter)
      write: typeof props.writeCharacter === 'function' ? props.writeCharacter : null,   // SHIP CARGO R-SCB-2: the host's character write (both hosts: SWRPGRoster.writeEquipment, R-SCGS-1)
      npcName: /^npc:/.test(String(rec.owner || '')) ? whoName(rec.owner, reg, props.roster) : null,
      // B-1635 (D-417 item 1, D-418 item 1): the player's Yard character (the hangar's scope), whom CREW's ＋ SEAT <NAME> seats
      me: props.host === 'player' && /^char:/.test(String(props.owner || '')) ? String(props.owner) : null,
      update: function (patch) { apply(function (s) { return VS.updateVessel(s, rec.id, patch, now()); }); },
      go: function (r) { props.nav(Object.assign({ room: 'ship', id: rec.id, tab: null, at: null }, r)); } };
    var face, body;
    if (route.at === 'deck') { face = 'deckroom'; body = el(DeckRoom, { p: p }); }
    else {
      var mode = route.tab ? 'bench' : 'sheet';
      face = route.at === 'convert' && !rec.conversion ? 'bench-convert' : mode === 'bench' ? 'bench-' + route.tab : 'sheet';
      var head = el(ShipHead, { rec: rec, vrow: vrow, res: res, unit: unit, band: band, mode: mode, run: run,
        onMode: function (m) { p.go({ tab: m === 'bench' ? 'fit' : null }); },
        canPicture: props.host === 'player' && !!props.owner && rec.owner === props.owner, state: state, apply: apply, now: now });
      var u12 = vrow ? null : el('div', { className: 'y-plate y-statebox y-mt', 'data-testid': 'ship-u12' }, el('div', { style: { padding: '14px 16px' } },
        el('p', { className: 'y-e-t', style: { margin: 0 } }, 'This ship’s hull, ' + rec.vehicleKey + ', isn’t in the books you have switched on. Turn its book back on in ⚙ Sources to see its numbers.')));
      body = el(React.Fragment, null, head, u12, mode === 'bench'
        ? el(React.Fragment, null, el(BenchTabs, { tab: route.tab, band: band, toChoose: fitChoices(res).length, held: heldOf(res), onTab: function (t) { p.go({ tab: t }); } }),
          // B-1015: WB5's words once, under the tabs, on the bench faces a held ship's values sit on (CREW, DOCK, LOG, TRADE;
          // DOCK prints the engineer's pool a part can upgrade, R-S4CC-24 / E-S4CC-5; DECK moves nothing; FIT is WB5's own body)
          heldOf(res) && (route.tab === 'crew' || route.tab === 'dock' || route.tab === 'log' || route.tab === 'trade') ? el(PartsWords, { err: attLoad.err }) : null,
          route.tab === 'crew' ? el(CrewTab, { p: p }) : route.tab === 'dock' ? el(DockTab, { p: p }) : route.tab === 'log' ? el(LogTab, { p: p })
            : route.tab === 'deck' ? el(DeckTab, { p: p })
            // W7 (JOB 3b) retires R-S4SR-3's empty TRADE body. FIT is W1–W3; the interim paper attachments section was
            // deleted with the K9-OFF sheet at the S5 flip (R-S5R-18)
            : route.tab === 'trade' ? el(TradeTab, { p: p })
            : el(ModsTab, { p: p, convert: route.at === 'convert' }))
        : el(SheetFace, { p: p }));
    }
    var UI = window.SWRPGUI;
    var content = stale && UI && UI.StaleHold ? el(React.Fragment, null,
      el('div', { style: { marginBottom: 14 } }, el(UI.StaleTabBanner, { paper: true })),
      el('div', { className: 'y-held' }, el(UI.StaleHold, { held: true }, body))) : body;
    return el('div', { className: 'yd-host', 'data-testid': 'yard-s4-ship', 'data-yard-room': 'ship', 'data-band': band, 'data-face': face, 'data-stale': stale ? 1 : undefined },
      el('div', { className: 'yd-scroll' },
        el('div', { className: 'yd y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': 'ship' }, el('div', { className: 'y-main' }, content))));
  }

  // ══ P1 · PLAN — FIT's window on a catalogue hull, writing nothing (ruling `shipyard-s4-catalogue-card` R-S4CC-2/3, ADDENDUM 2;
  // frames_catalogue.cjs `P1f`, the approved page @ 23c3ce85). Mounted by BOTH hosts for K6's room 'plan'
  // ('catalogue/<KEY>/plan[?part=]'). The plan is a store-shaped LOCAL state — one normalized record of the hull — and FIT's
  // own pieces run over it with `p.apply` writing that state alone (`p.plan` turns their words to the frame's), so the
  // numbers are the ONE resolver's and the writes are the store's reducers: nothing reaches the vessels key until ACQUIRE
  // WITH THIS FIT, which is U6's add (the entry's owner rule) followed by THE install path for each planned part. An unknown
  // KEY (or a hull whose book is off) is the entry's not-found; an unknown or unfitting ?part= plans nothing. ══
  function PlanHead(props) {
    var v = props.v, wide = props.band !== 'narrow';
    var acts = el('div', { className: 'y-row', 'data-testid': 'plan-acts' }, props.acquire,
      el('button', { type: 'button', className: 'y-quiet', 'data-testid': 'plan-exit', onClick: props.onExit }, 'EXIT PLAN'));
    return el(React.Fragment, null,
      el('div', { className: 'y-planhead', 'data-n': wide ? undefined : 1, 'data-testid': 'plan-head' },
        el(Art, { rec: { vehicleKey: v.key }, vrow: v, host: 'plan-head', cls: 'y-planart', schem: wide ? 110 : 70, alt: v.name, bare: true }),
        el('div', { style: { minWidth: 0 } }, el('div', { className: 'y-runhead', style: { marginBottom: 4 } }, el('span', null, 'PLAN · A CATALOGUE HULL · NOTHING IS SAVED')),
          el('h1', { className: 'y-ship-n', style: { fontSize: wide ? 24 : 18 }, 'data-testid': 'plan-name' }, v.name),
          el('div', { className: 'y-row', style: { marginTop: 6 } }, el('span', { className: 'y-ship-t' }, upper(v.type) + ' · SILHOUETTE ' + (v.silhouette != null ? v.silhouette : '—')),
            el(Stamp, { k: 'plan' }, 'PLAN'))),
        wide ? acts : null),
      wide ? null : el('div', { className: 'y-mt' }, acts));
  }
  function YardPlan(props) {   // a new hull or a new ?part= is a new plan
    var r = props.route || {};
    return el(YardPlanRoom, Object.assign({ key: String(r.key) + '|' + (r.part || '') }, props));
  }
  function YardPlanRoom(props) {
    var VS = V(), R = VR(), route = props.route || {}, ctrl = props.ctrl, UI = window.SWRPGUI;
    var reg = useYdRegistries(), attLoad = useYdAttachmentsLoad(), attById = attLoad.by, weaponsById = useYdWeapons(), gear = useYdGear(), band = useYdBand();
    if (UI && UI.useActiveSources) UI.useActiveSources();   // a book switched in ⚙ Sources re-renders the plan
    var TV = window.SWRPGTalentView;
    if (TV && TV.useTalentViewEpoch) TV.useTalentViewEpoch();   // a character's pool follows an own-pack edit (B-844)
    var ls = React.useState(null), local = ls[0], setLocal = ls[1];
    var ch = React.useState(null), choosing = ch[0], setChoosing = ch[1];   // U7: ACQUIRE waiting on "Whose ship?"
    var loading = !ctrl || !!ctrl.loading;
    var vrow = loading ? null : inBooks(ctrl.getVehicleByKey(route.key));
    var ctx = { resolve: Object.assign({}, props.ctx || {}, { attachments: attById || {}, weapons: weaponsById }), roster: props.roster || [], charPool: props.charPool || null };
    function now() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return null; } }
    // the plan's seed, once the hull and the parts list are in: the empty hull, with ?part= planned when it fits this hull
    // (`resolveFit` ok: FITS, or CHECK WITH YOUR GM for a limit the registry cannot test)
    React.useEffect(function () {
      if (local || !vrow || !attById || !VS || !R) return;
      var st = { v: 3, vessels: [VS.normalizeVessel({ id: 'plan', vehicleKey: vrow.key }, null)] };
      var a = route.part ? attById[route.part] : null;
      if (offered(a)) {   // a part the list does not offer (K4's act, a `kind`) seeds no plan: the empty hull
        var live = R.asVehicle(st.vessels[0], vrow, ctx.resolve), f = live ? VS.resolveFit(live, a) : null;
        if (f && f.ok) st = VS.installAttachment(st, 'plan', { key: a.id }, now());
      }
      setLocal(st);
    }, [vrow, attById]);
    function room(face, page, kids, over) {
      return el('div', { className: 'yd-host', 'data-testid': 'yard-s4-plan', 'data-yard-room': 'plan', 'data-band': band, 'data-face': face },
        el('div', { className: 'yd-scroll' }, el('div', { className: 'yd y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': page }, el('div', { className: 'y-main' }, kids))), over || null);
    }
    // U13's states, as the entry has them (its words verbatim: CatalogueEntry)
    if (loading) return room('plan-loading', 'catalogue', el('p', { className: 'y-u13-body', 'data-testid': 'entry-loading' }, 'Loading vehicle registry…'));
    if (!vrow || !VS) {
      return room('plan-notfound', 'catalogue', el('div', { className: 'y-empty y-sec', style: { marginTop: 22, textAlign: 'left' }, 'data-testid': 'entry-notfound' },
        el('h1', { className: 'y-u13-h' }, 'Entry not found'), el('p', { style: { margin: '8px 0 0' } }, 'No entry in the registry for key “' + route.key + '”.')));
    }
    var rec = local ? local.vessels[0] : VS.normalizeVessel({ id: 'plan', vehicleKey: vrow.key }, null);
    var res = R ? R.resolve(rec, vrow, ctx.resolve) : null, host = props.host;
    var p = { rec: rec, vrow: vrow, res: res, reg: reg, roster: props.roster || [], ctx: ctx, band: band, host: host,
      unit: null, attById: local ? attById : null, attErr: attLoad.err, gear: gear, now: now, nav: props.go, toCounter: null,
      plan: true, planWho: host === 'player' && props.character ? 'char:' + props.character.id : null,
      apply: function (fn) { setLocal(function (st) { return fn(st); }); } };
    // ACQUIRE WITH THIS FIT: U6's add (the entry's owner rule, CatAcquire), then each planned part through THE install path
    // (installAttachment: its INSTALLED line), with its waiting choices as made; then the new ship's sheet, as the entry's add
    function acquireTo(owner, note) {
      var id = null, atts = (rec.attachments || []).slice();
      VS.apply(function (st) {
        var r0 = VS.acquire(st, vrow.key, { owner: owner, note: note }, now()), out = r0.state;
        id = r0.id;
        atts.forEach(function (a) {
          var att = { key: a.key };
          if (a.zone != null) att.zone = a.zone;
          if (a.weapon != null) att.weapon = a.weapon;
          out = VS.installAttachment(out, id, att, now());
        });
        return out;
      });
      if (id != null) props.go({ room: 'ship', id: id });
    }
    var door;
    function commit(go) { return el('button', { type: 'button', className: 'y-commit', 'data-testid': 'plan-acquire', onClick: go }, 'ACQUIRE WITH THIS FIT'); }
    if (host === 'gm') door = commit(function () { acquireTo('party', 'Added to the party from the yard.'); });
    else if (props.character) door = commit(function () { acquireTo('char:' + props.character.id, 'Acquired.'); });
    // U6 with no character on this device: the entry's door in ACQUIRE's place (a silent-frame build: P1 draws a character)
    else if (!(props.roster || []).length) door = el('button', { type: 'button', className: 'y-commit', 'data-testid': 'entry-make-character', onClick: props.onNewCharacter }, 'MAKE A CHARACTER ›');
    else door = commit(function () { setChoosing(function () { return function (owner) { acquireTo(owner, 'Acquired.'); }; }); });
    var stale = !!VS.isStale();
    var held = stale && UI && UI.StaleHold ? el(UI.StaleHold, { held: true }, door) : door;
    var picker = choosing && host === 'player' ? el(PickerLayer, { roster: props.roster, owner: null, portraitFor: props.portraitFor, title: 'Whose ship?',
      onClose: function () { setChoosing(null); }, onPick: function (k) { var then = choosing; setChoosing(null); then(k); } }) : null;
    var open = local && route.part && rec.attachments.length ? 0 : null;   // P1 opens with the planned part's row open in place
    return room('plan', 'ship', el(React.Fragment, null,
      stale && UI && UI.StaleTabBanner ? el('div', { style: { marginBottom: 14 } }, el(UI.StaleTabBanner, { paper: true })) : null,
      el(PlanHead, { v: vrow, band: band, acquire: held, onExit: props.onExit }),
      el('div', { style: band === 'narrow' ? undefined : { marginTop: 14 } }, el(FitTab, { key: local ? 'plan' : 'wait', p: p, openInst: open }))), picker);
  }

  // ══ THE CATALOGUE — C1–C5 (the index), E1–E3 (the entry). Ruling `shipyard-s4-catalogue-card` order 4, built
  // to `Docs/mockups/shipyard-catalogue.html` @ 23c3ce85 (APPROVED, `shipyard-s2-approvals` §2): `frames_catalogue.cjs`
  // and `doors_kit.cjs` are the spec, their classes yard.css's own. Both hosts mount this ONE component for K6's rooms
  // 'catalogue' and 'entry', and the GM's Ship table as `table` (B-1255; `YardBrowse` is no longer mounted). It retires the interim live browse and
  // entry's fixed root (`shipyard-s4-collection` §4): the room scrolls in `.yd-host > .yd-scroll`, as every S4 room does.
  // The filters, the sort and the URL are `useYardState`'s (D1: the index's four states and COMPARE's picks stay here). ══
  var CAT_PRICE_SENTINEL = 2147483647;   // the int32 the ingest wrote for an unpriced hull (Docs/VEHICLE_PLUMBING.md §6.1 V-17)
  var CAT_STATES = [['grid', 'GRID'], ['list', 'LIST'], ['compare', 'COMPARE'], ['sil', 'BY SILHOUETTE']];
  var CAT_NUM_WORDS = ['NONE', 'ONE', 'TWO', 'THREE', 'FOUR'];
  var CAT_SHELF_ROW = 5;   // C4: each shelf's first row, by the active sort
  var CAT_SIG_SIL = 3;     // a Signature Vehicle is "of silhouette 3 or lower" (Special Modifications p.34–35)
  // doors_kit GEAR: the frames' own active-sources mark
  function catGear() {
    return el('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true, width: 18, height: 18 },
      el('circle', { cx: 12, cy: 12, r: 3.2 }), el('path', { d: 'M12 2.8v2.6M12 18.6v2.6M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3' }),
      el('circle', { cx: 12, cy: 12, r: 7.2 }));
  }
  function catPriced(v) { var p = v && v.price_credits; return typeof p === 'number' && isFinite(p) && p < CAT_PRICE_SENTINEL; }
  function CatPrice(props) {
    return catPriced(props.v) ? el('span', { className: 'y-pr' }, el('b', null, fmtNum(props.v.price_credits)), ' CR')
      : el('span', { className: 'y-pr y-pnl' }, 'PRICE NOT LISTED');
  }
  function CatR(props) { return props.v && props.v.restricted ? el('span', { className: 'y-r', title: 'Restricted — Streetwise, not Negotiation' }, '(R)') : null; }
  function catFind(v) { var R = window.SWRPGRarity; return v && v.rarity != null && R ? R.findDifficulty(v.rarity, v.restricted) : null; }
  // the store's find MARK (R-SPC-4: pips + the printed word, never a hue) — lib/store/view.jsx PaperFindRow, doors_kit findV
  function CatFind(props) {
    var F = catFind(props.v);
    if (!F) return el('span', { className: 'y-find y-muted' }, 'RARITY —');
    return el('span', { className: 'y-find' }, el('span', { className: 'y-pips', 'aria-hidden': true }, new Array(F.dice + 1).join('◆')),
      el('b', null, upper(F.label) + (props.to ? ' · TO FIND' : '')));
  }
  function catNum(v, f) {
    var x = f.split('.').reduce(function (o, k) { return o == null ? null : o[k]; }, v);
    return x == null || x === '' ? '—' : typeof x === 'number' ? fmtNum(x) : String(x);
  }
  function catSigned(v, f) { var x = v ? v[f] : null; return x == null ? '—' : fitSign(x); }
  function catZones(v) { var S = Schem(); return v && S && S.deriveZones ? S.deriveZones(v.defense, v.silhouette).map(function (z) { return z.id; }) : []; }
  // the plate: the hull's identifier on the uniform mat — `Art`, the Yard's one chain (a catalogue hull has no owner picture)
  function CatPlate(props) {
    return el(Art, { rec: { vehicleKey: props.v.key }, vrow: props.v, host: props.host, cls: props.cls || 'y-cellart',
      style: props.h ? { height: props.h } : undefined, schem: props.s || 96, alt: props.v.name, bare: props.bare });
  }
  // a recognition-index cell (doors_kit `cell`): plate · name (R) · type · silhouette · price · find mark
  function CatCell(props) {
    var v = props.v, open = function () { props.onOpen(v.key); };
    var face = [el(CatPlate, { key: 'pl', v: v, host: props.host, h: props.h, s: props.s, bare: props.bare }),
      el('div', { key: 'n', className: 'y-cell-n' }, v.name, el(CatR, { v: v })),
      el('div', { key: 'm', className: 'y-cell-m' }, v.type, el('br'), 'SILHOUETTE ' + (v.silhouette != null ? v.silhouette : '—')),
      el('div', { key: 'p', className: 'y-cell-p' }, el(CatPrice, { v: v }), el(CatFind, { v: v }))];
    if (!props.pick) return el('button', { type: 'button', className: 'y-cell', 'data-key': v.key, 'data-testid': 'cat-cell', onClick: open }, face);
    // Q3: the cell holds two controls, so it is a box: the open door is its face (display:contents, ShipRow's idiom) and the
    // pick mark is its last line
    return el('div', { className: 'y-cell', 'data-key': v.key, 'data-testid': 'cat-cell' },
      el('button', { type: 'button', className: 'y-cell-open', 'aria-label': 'Open ' + v.name, onClick: open, style: { display: 'contents' } }, face),
      el(CatMark, { k: v.key, pick: props.pick }));
  }
  function CatGrid(props) {
    return el('div', { className: 'y-grid', 'data-testid': props.testid || 'cat-grid', style: props.flow ? { gridAutoFlow: 'column', gridAutoColumns: '152px', width: 'max-content' }
      : { gridTemplateColumns: 'repeat(' + props.cols + ',minmax(0,1fr))' } },
      props.list.map(function (v) { return el(CatCell, { key: v.key, v: v, host: props.host, h: props.h, s: props.s, onOpen: props.onOpen, pick: props.pick, bare: true }); }));   // grid, shelves, sister ships: no caption (ADDENDUM 3)
  }
  // ── R-S4CC-4 · Q3: COMPARE's pick (the approved page @ 6aa1f830, frames_b1015.cjs `mark`): ＋ COMPARE on every C1 cell and C2
  // row; pressed it reads ✓ COMPARING, and tapped again the hull comes out. Up to four (C3's shape, U13's words "Pick up to four
  // hulls"): with four picked, an unpicked mark is inert until one comes out. The mark is drawn 36px tall; its 44px hit area is
  // R-S4CC-13's, the button's own transparent box round the drawn mark (yard.css, Q3/Q4 block) ──
  var CAT_PICK_MAX = 4;
  function CatMark(props) {
    var k = props.k, pk = props.pick, picks = pk.picks, on = picks.indexOf(k) !== -1, full = !on && picks.length >= CAT_PICK_MAX;
    return el('button', { type: 'button', className: 'y-cmphit', 'aria-pressed': on, disabled: full || undefined, 'data-testid': 'cat-pick', 'data-key': k,
        onClick: function (e) { e.stopPropagation(); if (full) return; pk.setPicks(on ? picks.filter(function (x) { return x !== k; }) : picks.concat([k])); } },
      el('span', { className: 'y-quiet y-cmpadd', 'data-on': on ? 1 : undefined }, on ? '✓ COMPARING' : '＋ COMPARE'));
  }
  // ── the head (the paper store's masthead + search), the four states, SORT, FILTERS, SHOWING and the foot ──
  function CatHead(props) {
    return el('div', { className: 'y-cat-head' },
      el('div', { className: 'y-cat-ch' }, el('h1', null, props.table ? 'SHIP TABLE' : 'CATALOGUE'), props.loading ? null : el('em', null, fmtNum(props.total) + ' ENTRIES'),
        // S8 (R-S8B-9; frames v3 B-catdoor): the list's second door, to BUILD A SHIP
        props.onBuild ? el('button', { type: 'button', className: 'y-link y8-orbuild', 'data-testid': 'cat-build', onClick: props.onBuild }, 'or build one') : null),
      el('label', { className: 'y-cat-search' }, el('span', { className: 'k' }, 'FIND'),
        el('input', { className: 'y-cat-in', type: 'search', value: props.query, 'data-testid': 'cat-search', 'aria-label': 'Find a ship by name',
          placeholder: props.narrow ? 'A name' : 'A name — “X-wing”, “Firespray”', onChange: function (e) { props.onQuery(e.target.value); } }),
        el('span', { className: 'k' }, props.loading ? '' : fmtNum(props.shown) + ' SHOWN')));
  }
  function CatStates(props) {
    return el('div', { className: 'y-seg y-states', role: 'tablist', 'aria-label': 'Index' }, CAT_STATES.map(function (s) {
      var on = s[0] === props.on;
      return el('button', { key: s[0], type: 'button', className: 'y-seg-b', role: 'tab', 'aria-selected': on, 'data-on': on ? 1 : 0, 'data-testid': 'cat-state-' + s[0],
        onClick: function () { props.onState(s[0]); } }, s[1]);
    }));
  }
  // ── R-S4CC-4 · Q4: the SORT menu (the approved page @ 6aa1f830, frames_b1015.cjs `sortOpen`; E-S4CC-2: H4's picker form) —
  // the index's four sorts (YARD_SORT_OPTIONS), the chosen one marked with its direction and SORTED; choosing another sorts by
  // it, rising, and tapping the chosen one reverses it (useYardState's handleSort); either closes the menu. At the desk the list
  // opens in a lifted plate under the button; on the phone it rises as a sheet (CatalogueIndex's overlay). ──
  function catSortWord(y) { var Y = window.SWRPGYard; return (Y && Y.yardSortLabel ? Y.yardSortLabel(y.sortColumn) : upper(y.sortColumn)) + (y.sortDir === 'desc' ? ' ↓' : ' ↑'); }
  function CatSortList(props) {
    var y = props.y, Y = window.SWRPGYard, opts = (Y && Y.YARD_SORT_OPTIONS) || [];
    return el('div', { role: 'listbox', 'aria-label': 'Sort', 'data-testid': 'cat-sort-list' }, opts.map(function (o, i) {
      var on = o.key === y.sortColumn;
      return el('button', { key: o.key, type: 'button', className: 'y-door', role: 'option', 'aria-selected': on, 'data-testid': 'cat-sort-' + o.key,
          style: i === 0 ? { borderTop: 0 } : undefined,   // the chosen row's tint, inset and state rule are yard.css's .y-door[aria-selected]
          onClick: function () { y.handleSort(o.key); y.setSortMenuOpen(false); } },
        el('span', { className: 'y-door-n' }, on ? o.label + (y.sortDir === 'desc' ? ' ↓' : ' ↑') : o.label), on ? el('span', { className: 'y-mono y-inkstate' }, 'SORTED') : null);
    }));
  }
  function CatSort(props) {
    var y = props.y, open = !!y.sortMenuOpen, box = React.useRef(null);
    React.useEffect(function () {   // the desk's plate closes on a tap outside it or Escape (the phone's sheet has its scrim)
      if (!open || props.narrow) return undefined;
      function away(e) { if (box.current && !box.current.contains(e.target)) y.setSortMenuOpen(false); }
      function esc(e) { if (e.key === 'Escape') y.setSortMenuOpen(false); }
      document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
      return function () { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
    }, [open, props.narrow]);
    var btn = el('button', { type: 'button', className: 'y-sortb', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'data-on': open ? 1 : undefined, 'data-testid': 'cat-sort',
      onClick: function () { y.setSortMenuOpen(!open); } }, el('span', { className: 'k' }, 'SORT'), catSortWord(y));
    if (!open || props.narrow) return btn;
    return el('span', { ref: box, style: { position: 'relative', display: 'inline-flex' } }, btn,
      el('div', { className: 'y-plate y-lift', style: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 320, zIndex: 6 } },
        el('div', { style: { padding: '14px 18px 12px' } }, el(CatSortList, { y: y }))));
  }
  function CatFiltersDoor(props) {
    var terms = props.terms;
    return el('button', { type: 'button', className: 'y-summon', 'aria-expanded': !!props.open, 'data-testid': 'cat-filters', onClick: props.onClick },
      'FILTERS', el('span', { className: 'y-summon-n' }, terms.length ? terms.map(function (t) { return t.label; }).join(' · ') : 'NONE ON'));
  }
  // the SHOWING line — the yard's honest state (yardShowingTerms): each term clears itself; the count is the list's
  function CatShowing(props) {
    var y = props.y;
    return el('div', { className: 'y-showing', 'data-testid': 'cat-showing' }, el('span', { className: 'k' }, 'SHOWING'),
      props.loading ? el('span', { className: 'y-allterm' }, 'LOADING…')
        : y.showingTerms.length ? y.showingTerms.map(function (t, i) {
          return el('button', { key: i, type: 'button', className: 'y-term', 'aria-label': 'Clear ' + t.label, onClick: t.clear }, t.label + ' ', el('i', { 'aria-hidden': true }, '✕'));
        }) : el('span', { className: 'y-allterm' }, 'ALL ENTRIES'),
      props.loading ? null : el('span', { className: 'y-showing-n' }, '— ' + fmtNum(props.shown) + ' OF ' + fmtNum(props.total)));
  }
  function catBooks(disc) {   // the distinct books behind the discovery list (sources.js aliasToId, as the fixture's facet.books)
    var SRC = window.SWRPGSources, cur = SRC && SRC.current ? SRC.current() : null, a = (cur && cur.index && cur.index.aliasToId) || {}, seen = {};
    disc.forEach(function (v) { seen[a[v.source] || a[v.source_code] || v.source_code] = 1; });
    return Object.keys(seen).length;
  }
  function CatFoot(props) {
    var R = window.SWRPGRarity;
    return el('div', { className: 'y-cat-foot', 'data-testid': 'cat-foot' },
      el('span', null, 'FIND DIFFICULTY · Table 5-1 · ' + ((R && R.FIND_CITE) || '')),
      el('span', null, '(R) RESTRICTED · STREETWISE, NOT NEGOTIATION'),
      el('span', null, fmtNum(props.hidden) + ' HIDDEN BY THE SOURCE LIST · ' + props.books + ' BOOKS ON'));
  }
  // ── the facet rail (the paper store's rail, on its plate): each option's count is that option ALONE over discovery ──
  function CatRail(props) {
    var Y = window.SWRPGYard, y = props.y, f = y.filters, disc = props.disc, ctrl = props.ctrl;
    function count(pred) { return disc.filter(pred).length; }
    function eff(v) { return ctrl.getEffectiveAffiliation ? ctrl.getEffectiveAffiliation(v) : v.affiliation; }
    var sil = []; for (var i = 0; i <= 10; i++) sil.push(i);
    function rng(k, field) {
      return el('label', { className: 'y-rng' }, el('span', { className: 'k' }, k),
        el('select', { className: 'y-rng-sel', value: f[field], 'data-testid': 'cat-sil-' + field, 'aria-label': 'Silhouette ' + k.toLowerCase(),
          onChange: function (e) { y.patchFilter(field, parseInt(e.target.value, 10) || 0); } },
          sil.map(function (n) { return el('option', { key: n, value: n }, n); })));
    }
    function tog(on, label, n, field, tid) {
      return el('button', { type: 'button', className: 'y-tog', 'data-on': on ? 1 : undefined, 'aria-pressed': on, 'data-testid': tid, onClick: function () { y.patchFilter(field, !on); } },
        el('span', { className: 'y-tog-box', 'aria-hidden': true }, on ? '■' : ''), label, ' ', el('i', null, fmtNum(n)));
    }
    var UI = window.SWRPGUI;
    return el('nav', { className: 'y-frail ' + (props.inSheet ? 'y-frail-in' : 'y-sec'), 'aria-label': 'Filters', 'data-testid': 'cat-rail' },
      el('h4', null, 'Category'),
      el('button', { type: 'button', className: 'y-fcat', 'data-on': f.categories.length ? undefined : 1, onClick: function () { y.patchFilter('categories', []); } },
        'All hulls', el('b', null, fmtNum(disc.length))),
      Y.YARD_CATEGORY_OPTIONS.map(function (o) {
        return el('button', { key: o.slug, type: 'button', className: 'y-fcat', 'data-on': f.categories.indexOf(o.slug) !== -1 ? 1 : undefined, 'data-testid': 'cat-cat-' + o.slug,
          onClick: function () { y.toggleFilterArray('categories', o.slug); } }, o.label, el('b', null, fmtNum(count(function (v) { return v.category === o.slug; }))));
      }),
      el('h4', null, 'Role'), el('div', { className: 'y-fchips' }, Y.YARD_ROLE_OPTIONS.map(function (o) {
        var on = f.roles.indexOf(o.slug) !== -1;
        return el('button', { key: o.slug, type: 'button', className: 'y-chipb', 'data-on': on ? 1 : undefined, 'aria-pressed': on, 'data-testid': 'cat-role-' + o.slug,
          onClick: function () { y.toggleFilterArray('roles', o.slug); } }, o.label + ' ', el('i', null, fmtNum(count(function (v) { return v.focus_secondary === o.slug; }))));
      })),
      el('h4', null, 'Affiliation'), el('div', { className: 'y-fchips' }, Y.YARD_AFFILIATION_OPTIONS.map(function (o) {
        var on = f.affiliations.indexOf(o.slug) !== -1;
        return el('button', { key: o.slug, type: 'button', className: 'y-chipb', 'data-on': on ? 1 : undefined, 'aria-pressed': on,
          onClick: function () { y.toggleFilterArray('affiliations', o.slug); } }, o.label + ' ', el('i', null, fmtNum(count(function (v) { return eff(v) === o.slug; }))));
      })),
      el('h4', null, 'Silhouette'), el('div', { className: 'y-range' }, rng('FROM', 'silMin'), el('span', { className: 'y-rng-line', 'aria-hidden': true }), rng('TO', 'silMax')),
      el('h4', null, 'Hyperdrive'), tog(f.hasHyperdrive, 'Hyperdrive-capable only', count(function (v) { return v.hyperdrive_primary != null && v.hyperdrive_primary > 0; }), 'hasHyperdrive', 'cat-hd'),
      el('h4', null, 'Restricted'), tog(f.hideRestricted, 'Hide restricted', count(function (v) { return !!v.restricted; }), 'hideRestricted', 'cat-hide'),
      el('button', { type: 'button', className: 'y-fsrc', 'data-testid': 'cat-sources', onClick: function () { if (UI && UI.openActiveSources) UI.openActiveSources(); } },
        el('span', { className: 'y-ico', style: { width: 28, height: 28 }, 'aria-hidden': true }, catGear()), el('span', null, 'ACTIVE SOURCES · ' + props.books + ' BOOKS ON')));
  }
  // ── C2 · LIST: the store's dense table at wide, the handheld stacked row below ──
  function CatList(props) {
    var list = props.list, open = props.onOpen;
    function mat(v) { return el('div', { className: 'y-lmat' }, el(CatPlate, { v: v, host: 'cat-list', h: 40, s: props.wide ? 24 : 20, bare: true })); }   // R-SSB-12: the widest SMALL (2.3×s, BESIDE) inside the 56/46 px mat
    if (props.wide) {
      var th = function (t, n, k) { return el('th', { key: k, className: n ? 'num' : undefined }, t); };
      return el('div', { className: 'y-sec', style: { padding: '10px 12px 8px' } }, el('table', { className: 'y-ltab', 'data-testid': 'cat-list' },
        el('thead', null, el('tr', null, th('Hull', 0, 'h'), th('Silhou­ette', 1, 's'), th('Speed', 1, 'sp'), th('Hand­ling', 1, 'ha'), th('Armor', 1, 'a'),
          th(['Hull', el('br', { key: 'b' }), 'trauma'], 1, 'ht'), th(['System', el('br', { key: 'b' }), 'strain'], 1, 'ss'), th(['Defense', el('br', { key: 'b' }), 'fore · aft'], 1, 'd'),
          th(['Hard', el('br', { key: 'b' }), 'points'], 1, 'hp'), th('Price', 1, 'p'), th('To find', 0, 'f'),
          props.pick ? el('th', { key: 'c' }, el('span', { className: 'y-vh' }, 'Compare')) : null)),
        el('tbody', { className: 'hp-bands' }, list.map(function (v) {
          return el('tr', { key: v.key, 'data-key': v.key, 'data-testid': 'cat-row', onClick: function () { open(v.key); }, style: { cursor: 'pointer' } },
            el('td', { className: 'nm' }, el('div', { className: 'y-nmwrap' }, mat(v), el('div', null,
              el('button', { type: 'button', onClick: function (e) { e.stopPropagation(); open(v.key); } }, v.name), el(CatR, { v: v }), el('div', { className: 'y-lq' }, v.type)))),
            el('td', { className: 'num' }, catNum(v, 'silhouette')), el('td', { className: 'num' }, catNum(v, 'speed')), el('td', { className: 'num' }, catSigned(v, 'handling')),
            el('td', { className: 'num' }, catNum(v, 'armor')), el('td', { className: 'num' }, catNum(v, 'hull_trauma')), el('td', { className: 'num' }, catNum(v, 'system_strain')),
            el('td', { className: 'num' }, catNum(v, 'defense.fore') + ' · ' + catNum(v, 'defense.aft')), el('td', { className: 'num' }, catNum(v, 'hard_points_total')),
            el('td', { className: 'num' }, catPriced(v) ? fmtNum(v.price_credits) : el('span', { className: 'y-pnl', style: { fontSize: 10 } }, 'NOT LISTED')),
            el('td', null, el(CatFind, { v: v })),
            props.pick ? el('td', null, el(CatMark, { k: v.key, pick: props.pick })) : null);
        }))));
    }
    return el('div', { className: 'y-sec hp-bands', 'data-testid': 'cat-list' }, list.map(function (v) {
      return el('div', { key: v.key, className: 'y-lrow', 'data-key': v.key, 'data-testid': 'cat-row' },
        el('button', { type: 'button', className: 'y-lrow1', style: { width: '100%' }, onClick: function () { open(v.key); } },
          mat(v), el('div', { className: 'y-cell-n', style: { margin: 0 } }, v.name, el(CatR, { v: v })), el(CatPrice, { v: v })),
        el('div', { className: 'y-lspecs' }, [['SILHOUETTE', catNum(v, 'silhouette')], ['SPEED', catNum(v, 'speed')], ['HANDLING', catSigned(v, 'handling')], ['ARMOR', catNum(v, 'armor')],
          ['HULL', catNum(v, 'hull_trauma')], ['STRAIN', catNum(v, 'system_strain')], ['HARD POINTS', catNum(v, 'hard_points_total')]].map(function (x) {
          return el('span', { key: x[0] }, x[0] + ' ', el('b', null, x[1]));
        })),
        el('div', { className: 'y-lfind' }, el(CatFind, { v: v, to: true })),
        props.pick ? el('div', { className: 'y-lfind' }, el(CatMark, { k: v.key, pick: props.pick })) : null);
    }));
  }
  // ── B-1255 (DECISIONS D-411 item 12; ruling `release-r7-bug-burndown` ADDENDA 247, 293): THE GM's SHIP TABLE, drawn on paper
  // as the catalogue's own LIST (the table's shape only; page generator `scripts/r7_paper_sweep_leftovers_page.py` @ fa5981119):
  // at wide the list's `table.y-ltab` with the old matrix's columns (SWRPGYard.MATRIX_COLUMNS, one list), elsewhere the
  // list's stacked row — name and price, then every other column as a spec chip. Category and affiliation read their
  // display words through the columns' own `value` (B-1596). A row opens the entry, as the list's does. ──
  var CAT_TABLE_NUM = { silhouette: 1, speed: 1, handling: 1, armor: 1, hull_trauma: 1, system_strain: 1, encumbrance_capacity: 1, passengers: 1,
    hyperdrive_primary: 1, price_credits: 1, rarity: 1 };
  function catCol(col, v, aff) {
    var x = col.value ? col.value(v, aff) : v[col.key];
    return x == null || x === '' ? '—' : String(x);
  }
  function CatTable(props) {
    var list = props.list, open = props.onOpen, Y = window.SWRPGYard, cols = (Y && Y.MATRIX_COLUMNS) || [], aff = props.aff;
    if (props.wide) {
      return el('div', { className: 'y-sec', style: { padding: '10px 12px 8px' } }, el('table', { className: 'y-ltab', 'data-testid': 'cat-table' },
        el('thead', null, el('tr', null, cols.map(function (c) { return el('th', { key: c.key, className: CAT_TABLE_NUM[c.key] ? 'num' : undefined }, c.label); }))),
        el('tbody', { className: 'hp-bands' }, list.map(function (v) {
          return el('tr', { key: v.key, 'data-key': v.key, 'data-testid': 'cat-row', onClick: function () { open(v.key); }, style: { cursor: 'pointer' } },
            cols.map(function (c, i) {
              var t = catCol(c, v, aff(v));
              return el('td', { key: c.key, className: CAT_TABLE_NUM[c.key] ? 'num' : undefined, 'data-col': c.key },
                i === 0 ? el('button', { type: 'button', style: { font: 'inherit', fontWeight: 600, color: 'inherit', background: 'none', border: 0, padding: 0,
                  textAlign: 'left', cursor: 'pointer' }, onClick: function (e) { e.stopPropagation(); open(v.key); } }, t) : t);
            }));
        }))));
    }
    var rest = cols.filter(function (c) { return c.key !== 'name' && c.key !== 'price_credits'; });
    return el('div', { className: 'y-sec hp-bands', 'data-testid': 'cat-table' }, list.map(function (v) {
      return el('div', { key: v.key, className: 'y-lrow', 'data-key': v.key, 'data-testid': 'cat-row' },
        el('button', { type: 'button', className: 'y-lrow1', style: { width: '100%' }, onClick: function () { open(v.key); } },
          el('div', { className: 'y-cell-n', style: { margin: 0 } }, v.name), el(CatPrice, { v: v })),
        el('div', { className: 'y-lspecs' }, rest.map(function (c) {
          return el('span', { key: c.key, 'data-col': c.key }, c.label.toUpperCase() + ' ', el('b', null, catCol(c, v, aff(v))));
        })));
    }));
  }
  // ── C3 · COMPARE (ComparePanel's shape): up to four hulls, fifteen rows, nothing ranked or hued ──
  function catWeapons(v, reg, cls) {
    var ws = (v && v.weapons) || [];
    if (!ws.length) return el('span', { className: 'y-muted' }, 'UNARMED');
    return ws.map(function (w, i) {
      var q = qualWord({ reg: reg }, w.qualities_resolved);
      return el('span', { key: i, className: cls || 'y-wline' }, (w.count > 1 ? w.count + '× ' : '') + w.name + (w.turret ? ' (turret)' : ''),
        el('small', null, 'DAMAGE ' + (w.damage != null ? w.damage : '—') + ' · CRITICAL ' + (w.crit != null ? w.crit : '—') + ' · ' + (w.range_label || '—'), q ? ' · ' : null, qualRun({ reg: reg }, w.qualities_resolved)));   // B-1178
    });
  }
  function catHyper(v) {
    if (!(v.hyperdrive_primary > 0)) return 'NONE';
    return el(React.Fragment, null, 'CLASS ' + v.hyperdrive_primary, v.hyperdrive_backup > 0 ? el('small', { style: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10,
      letterSpacing: '.08em', color: 'var(--doc-ink-muted)', fontWeight: 400 } }, 'BACKUP ' + v.hyperdrive_backup) : null);
  }
  var CAT_CMP_ROWS = [
    ['SILHOUETTE', function (v) { return catNum(v, 'silhouette'); }], ['SPEED', function (v) { return catNum(v, 'speed'); }], ['HANDLING', function (v) { return catSigned(v, 'handling'); }],
    ['ARMOR', function (v) { return catNum(v, 'armor'); }], ['HULL TRAUMA', function (v) { return catNum(v, 'hull_trauma'); }], ['SYSTEM STRAIN', function (v) { return catNum(v, 'system_strain'); }],
    ['DEFENSE', function (v) { return 'FORE ' + catNum(v, 'defense.fore') + ' · AFT ' + catNum(v, 'defense.aft'); }], ['HARD POINTS', function (v) { return catNum(v, 'hard_points_total'); }],
    ['CREW', function (v) { return vvField(v, 'crew') || '—'; }, 't'], ['PASSENGERS', function (v) { return catNum(v, 'passengers'); }], ['ENCUMBRANCE', function (v) { return catNum(v, 'encumbrance_capacity'); }],
    ['HYPERDRIVE', catHyper], ['WEAPONS', function (v, reg) { return catWeapons(v, reg); }, 't'], ['PRICE', function (v) { return el(CatPrice, { v: v }); }],
    ['RARITY', function (v) { return el(React.Fragment, null, v.rarity != null ? String(v.rarity) : '—', el(CatR, { v: v }), el('span', { style: { display: 'block', marginTop: 3 } }, el(CatFind, { v: v }))); }],
  ];
  function CatCompare(props) {
    var picks = props.picks, reg = props.reg, wide = props.wide, word = CAT_NUM_WORDS[picks.length] || String(picks.length);
    function hd(v) {
      return el('div', { className: 'y-cmphd' }, el(CatPlate, { v: v, host: 'cat-compare', h: wide ? 96 : 50, s: wide ? 50 : 32, bare: true }),   // R-SSB-12
        el('span', { className: 'y-cmphd-n' }, v.name),
        el('button', { type: 'button', className: 'y-cmphd-x', 'data-testid': 'cat-cmp-remove', onClick: function () { props.onRemove(v.key); } }, '✕ REMOVE'));
    }
    if (wide) {
      return el('div', { 'data-testid': 'cat-compare' },
        el('div', { className: 'y-sec', style: { padding: '8px 10px' } }, el('table', { className: 'y-cmp' },
          el('thead', null, el('tr', null, el('th'), picks.map(function (v) { return el('th', { key: v.key, style: { width: '23%' } }, hd(v)); }))),
          el('tbody', null, CAT_CMP_ROWS.map(function (r) {
            return el('tr', { key: r[0] }, el('td', { className: 'k' }, r[0]), picks.map(function (v) { return el('td', { key: v.key, className: r[2] || 'v' }, r[1](v, reg)); }));
          })))));
    }
    return el('div', { 'data-testid': 'cat-compare' }, el('p', { className: 'y-mono', style: { margin: '0 0 8px' } }, 'COMPARING ' + word),
      el('div', { className: 'y-sec', style: { padding: '10px 8px' } },
        el('div', { className: 'y-cmpn-hd' }, picks.map(function (v) { return el(React.Fragment, { key: v.key }, hd(v)); })),
        CAT_CMP_ROWS.map(function (r) {
          return el('div', { key: r[0], className: 'y-cmpn-r' }, el('div', { className: 'y-cmpn-k' }, r[0]),
            el('div', { className: 'y-cmpn-v' + (r[2] ? ' y-cmpn-t' : '') }, picks.map(function (v) { return el('div', { key: v.key }, r[1](v, reg)); })));
        })));
  }
  // ── C4 · BY SILHOUETTE: shelves 0–10 over the list in view, smallest first; each head says what the size does at the
  // table, from three cited rules only: the defense zones (EotE p.226), Gain the Advantage (the starship maneuvers row, EotE
  // p.234) and a Signature Vehicle's size (Special Modifications p.34–35). A count opens the grid at that size. ──
  function catGta(reg) {
    var rows = (reg && reg.starship && reg.starship.rows) || [];
    var r = rows.filter(function (x) { return /gain the advantage/i.test(x.name || ''); })[0], t = r ? String(r.restrictions || '') : '';
    var m = t.match(/Sil (\d+)-(\d+)/), s = t.match(/Speed (\d+)\+/);
    return m && s ? { min: +m[1], max: +m[2], speed: +s[1] } : null;
  }
  function CatShelves(props) {
    var S = Schem(), wide = props.wide, gta = catGta(props.reg), out = [];
    function strip(list) {
      return wide ? el(CatGrid, { list: list, cols: 5, h: 88, s: 64, host: 'cat-shelf', onOpen: props.onOpen, testid: 'cat-shelf-row' })
        : el('div', { className: 'y-strip-clip' }, el(CatGrid, { list: list, flow: true, h: 78, s: 64, host: 'cat-shelf', onOpen: props.onOpen, testid: 'cat-shelf-row' }));
    }
    for (var s = 0; s <= 10; s++) {
      var L = props.list.filter(function (v) { return v.silhouette === s; });
      if (!L.length) continue;
      var st = L.filter(function (v) { return v.is_starship; }), pl = L.filter(function (v) { return !v.is_starship; });
      var two = S && S.zonesForSilhouette ? S.zonesForSilhouette(s) === 2 : s <= 4;
      var rules = [el('span', { key: 'z' }, two ? 'TWO DEFENSE ZONES · FORE · AFT' : 'FOUR DEFENSE ZONES · FORE · AFT · PORT · STARBOARD', el(Cite, null, 'EotE p.226'))];
      if (gta && s >= gta.min && s <= gta.max) rules.push(el('span', { key: 'g' }, 'PILOTS MAY GAIN THE ADVANTAGE AT SPEED ' + gta.speed + ' OR MORE', el(Cite, null, 'EotE p.234')));
      if (s <= CAT_SIG_SIL) rules.push(el('span', { key: 's' }, 'A SIGNATURE VEHICLE CAN BE THIS SIZE', el(Cite, null, 'Special Modifications p.34–35')));
      var n = s;
      out.push(el('section', { key: s, className: 'y-shelf', 'data-testid': 'cat-shelf', 'data-sil': s },
        el('div', { className: 'y-shelf-h' }, el('span', { className: 'y-shelf-t' }, 'SILHOUETTE ' + s),
          el('button', { type: 'button', className: 'y-shelf-c', 'data-testid': 'cat-shelf-all', onClick: (function (k) { return function () { props.onShowAll(k); }; })(n) }, 'SHOW ALL ' + fmtNum(L.length) + ' ›')),
        el('div', { className: 'y-shelf-r' }, rules),
        st.length && pl.length ? el(React.Fragment, null,
          el('div', { className: 'y-sub2' }, 'STARSHIPS ', el('b', null, fmtNum(st.length))), strip(st.slice(0, CAT_SHELF_ROW)),
          el('div', { className: 'y-sub2' }, 'PLANETARY VEHICLES ', el('b', null, fmtNum(pl.length))), strip(pl.slice(0, CAT_SHELF_ROW)))
          : el('div', { style: { marginTop: 10 } }, strip(L.slice(0, CAT_SHELF_ROW)))));
    }
    return el('div', { 'data-testid': 'cat-shelves' }, out);
  }
  // ── U13 · the live catalogue's own words for its states, on the paper plates (yardView.jsx YardBrowse's, and the deleted YardEntry's) ──
  function CatNoMatch(props) {
    return el('div', { className: 'y-empty y-sec', style: { marginTop: 14 }, 'data-testid': 'cat-nomatch' }, el('div', { className: 'y-empty-h' }, 'NO SHIPS MATCH'),
      el('p', null, 'Try widening your filters or clearing the search.'), el('button', { type: 'button', className: 'y-quiet', onClick: props.onReset }, 'RESET FILTERS'));
  }

  // ── THE INDEX (C1–C5) ──
  function CatalogueIndex(props) {
    var y = props.y, ctrl = props.ctrl, band = props.band, wide = band === 'wide', narrow = band === 'narrow';
    var state = props.ui.state, setState = props.ui.setState, picks = props.ui.picks, setPicks = props.ui.setPicks;
    var railOpen = props.ui.railOpen, setRailOpen = props.ui.setRailOpen;
    var loading = !!ctrl.loading, all = ctrl.allVehicles || [], disc = y.discovery || all, list = y.filteredSortedVehicles || [];
    // B-1312 · D-395 (card release-r7-bug-burndown ADDENDA 7, 13, 14 (b)): the total is the registry less the hide-list (D2) —
    // those ships can never be found, so they are not counted; a book the player turns off does NOT lower it (R-S4CC-26 C4)
    var _hid = window.SWRPGSources && window.SWRPGSources.current() && window.SWRPGSources.current().index;
    var listed = _hid ? all.filter(function (v) { return !_hid.hiddenSourceCodes[v.source_code]; }) : all;
    var books = catBooks(disc);
    var byKey = {}; all.forEach(function (v) { byKey[v.key] = v; });
    var picked = picks.map(function (k) { return byKey[k]; }).filter(Boolean);
    var view = state;   // Q3: COMPARE opens with nothing picked too — U13's empty block says so and where to pick (R-S4A-7)
    var pick = { picks: picks, setPicks: setPicks };
    var railed = wide && railOpen;
    var sheet = !wide && railOpen;
    function onState(s) { setState(s); }
    function showAll(n) { y.setFilters(function (p) { return Object.assign({}, p, { silMin: n, silMax: n }); }); setState('grid'); }
    var content = null;
    if (!loading && all.length && !list.length && view !== 'compare') content = el(CatNoMatch, { onReset: y.resetFilters });
    else if (!loading && all.length) {
      if (props.table) content = el(CatTable, { list: list, wide: wide, onOpen: props.onOpen,
        aff: function (v) { return ctrl.getEffectiveAffiliation ? ctrl.getEffectiveAffiliation(v) : v.affiliation; } });   // B-1255
      else if (view === 'list') content = el(CatList, { list: list, wide: wide, onOpen: props.onOpen, pick: pick });
      else if (view === 'compare') content = picked.length ? el(CatCompare, { picks: picked, wide: wide, reg: props.reg,
        onRemove: function (k) { setPicks(picks.filter(function (x) { return x !== k; })); } })
        : el('div', { className: 'y-empty y-sec', 'data-testid': 'cat-compare-empty' }, el('div', { className: 'y-empty-h' }, 'NOTHING TO COMPARE'));
      else if (view === 'sil') content = el(CatShelves, { list: list, wide: wide, reg: props.reg, onOpen: props.onOpen, onShowAll: showAll });
      else content = el(CatGrid, { list: list, cols: narrow ? 2 : 5, h: wide ? 112 : narrow ? 96 : 124, s: wide ? 92 : 80, host: 'cat-grid', onOpen: props.onOpen, pick: pick });
    }
    var failed = ctrl.error ? el('div', { className: 'y-plate y-mt' }, el('div', { style: { padding: '12px 14px' } },
      el('p', { className: 'y-u13-fail', 'data-testid': 'cat-failed' }, 'Failed to load vehicle library: ' + String(ctrl.error)))) : null;
    var none = !loading && !all.length ? el('p', { className: 'y-u13-line', 'data-testid': 'cat-empty' }, 'No vehicles loaded.') : null;
    var body = railed ? el('div', { className: 'y-catbody' }, el(CatRail, { y: y, disc: disc, ctrl: ctrl, books: books }), el('div', { className: 'y-catmain' }, content))
      : el('div', { className: 'y-catmain', style: { marginTop: 14 } }, content);
    var main = el(React.Fragment, null,
      el(CatHead, { total: listed.length, shown: list.length, loading: loading, narrow: narrow, query: y.filters.search, onQuery: function (q) { y.patchFilter('search', q); }, onBuild: props.onBuild,
        table: props.table }),
      // B-1255: the Ship table is one view, so it draws no view switch (the drawing hides GRID · LIST · …)
      el('div', { className: 'y-toolbar' }, props.table ? null : el(CatStates, { on: view, onState: onState }), el(CatSort, { y: y, narrow: narrow }),
        el(CatFiltersDoor, { terms: y.showingTerms, open: railOpen, onClick: function () { setRailOpen(!railOpen); } })),
      el(CatShowing, { y: y, loading: loading, shown: list.length, total: listed.length }),
      failed, none, body,
      loading ? null : el(CatFoot, { hidden: all.length - disc.length, books: books }));
    // Q4 on the phone: the SORT list rises as a sheet over the room (the approved sheets' idiom), in the room's own overlay
    var sortSheet = narrow && y.sortMenuOpen ? el('div', { className: 'yd yd-over', 'data-doc-ground': 'creator' }, el(YHeldWrap, { onClose: function () { y.setSortMenuOpen(false); }, attrs: { 'data-testid': 'cat-sort-sheet' } },
      el('div', { className: 'y-scrim', onClick: function () { y.setSortMenuOpen(false); } }),
      el('div', { className: 'y-sheet' }, el('div', { className: 'y-grab' }), el('div', { className: 'y-e-n', style: { marginBottom: 10 } }, 'SORT'), el(CatSortList, { y: y })))) : null;
    var over = sortSheet || (sheet ? el('div', { className: 'yd yd-over', 'data-doc-ground': 'creator' }, el(YHeldWrap, { onClose: function () { setRailOpen(false); }, attrs: { 'data-testid': 'cat-filter-sheet' } },
      el('div', { className: 'y-scrim', onClick: function () { setRailOpen(false); } }),
      el('div', { className: 'y-sheet y-fsheet', style: { overflow: 'auto' } }, el('div', { className: 'y-grab' }),
        el('div', { className: 'y-fsheet-h' }, el('span', { className: 'y-e-n' }, 'FILTERS'), el('span', { className: 'y-mono' }, fmtNum(list.length) + ' OF ' + fmtNum(listed.length)),
          el('button', { type: 'button', className: 'y-quiet', style: { marginLeft: 'auto' }, onClick: function () { setRailOpen(false); } }, 'DONE')),
        el(CatRail, { y: y, disc: disc, ctrl: ctrl, books: books, inSheet: true }),
        el('div', { className: 'y-verbs', style: { justifyContent: 'space-between' } }, el('button', { type: 'button', className: 'y-quiet', onClick: y.resetFilters }, 'RESET'),
          el('button', { type: 'button', className: 'y-commit', 'data-testid': 'cat-sheet-show', onClick: function () { setRailOpen(false); } }, 'SHOW ' + fmtNum(list.length)))))) : null);
    return { main: main, over: over, face: loading ? 'loading' : ctrl.error ? 'failed' : !all.length ? 'empty' : !list.length ? 'nomatch' : props.table ? 'table' : view };
  }

  // ── R-S4G-9 · VARIANTS AND FAMILY: the union of three name tests over discovery — PRINTINGS (the same printed name), SERIES2
  // (a letter stem of two or more letters) and SAME DESIGNATION (a one-letter stem, only with the same number: Z-95-AF4 joins
  // Z-95-AF4-H, the T-13 never the T-65B) — AND R-S4CC-9's one explicit link (a row's `family_of`, written only by the name
  // override). A group whose members' printed makers differ is split and its members stand alone (J3, ADDENDUM 2 F1):
  //   ARC — the ARC-170's "Manufacturer: Incom/Subpro", Collapse of the Republic p.70;
  //         the ARC-40b's "Manufacturer: Kuat Drive Yards", Savage Spirits p.57.
  //   MC  — the MC-2's "Manufacturer: Mekuun", Dangerous Covenants p.64;
  //         the MC-18's "Manufacturer: Mon Calamari Shipyards", Desperate Allies p.63 (the index's printed page; corpus 64).
  var CAT_FAMILY_SPLITS = { ARC: true, MC: true };
  function catFamilies(disc) {
    var up = {}, has = {};
    disc.forEach(function (v) { up[v.key] = v.key; has[v.key] = v; });
    function find(k) { while (up[k] !== k) { up[k] = up[up[k]]; k = up[k]; } return k; }
    function join(a, b) { up[find(a)] = find(b); }
    var by = {}, stemOf = {};
    function put(t, k) { (by[t] = by[t] || []).push(k); }
    disc.forEach(function (v) {
      put('PR|' + v.name, v.key);
      var m = /^([A-Za-z]+)-(\d+)/.exec(v.name || '');
      if (m) {
        var st = m[1].toUpperCase();
        if (st.length >= 2) { put('S2|' + st, v.key); stemOf[v.key] = { s2: st }; }
        else { put('SD|' + st + '-' + m[2], v.key); stemOf[v.key] = { sd: st + '-' + m[2] }; }
      }
      if (v.family_of && has[v.family_of]) join(v.key, v.family_of);
    });
    Object.keys(by).forEach(function (t) { var ks = by[t]; for (var i = 1; i < ks.length; i++) join(ks[0], ks[i]); });
    var groups = {};
    disc.forEach(function (v) { var r = find(v.key); (groups[r] = groups[r] || []).push(v); });
    var out = {};
    Object.keys(groups).forEach(function (r) {
      var g = groups[r];
      if (g.length < 2) return;
      var s2 = null, sd = null;
      g.forEach(function (v) { var s = stemOf[v.key]; if (s && s.s2 && !s2) s2 = s.s2; if (s && s.sd && !sd) sd = s.sd; });
      if (s2 && CAT_FAMILY_SPLITS[s2]) return;   // printed makers differ: its members stand alone
      var members = g.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
      var fam = { stem: s2 || sd || members[0].name, members: members };
      members.forEach(function (v) { out[v.key] = fam; });
    });
    return out;
  }
  // R-S4G-10 · LEGEND: rarity 10 and Restricted read as one status tag (`shipyard-s1-concept` R-S1C-5)
  function catLegend(v) { return !!v && v.rarity === 10 && !!v.restricted; }
  var CAT_NAVI = { astromech_socket: 'Astromech socket', yes: 'Yes', no: 'No' };

  // ── THE ENTRY (E1–E3): the store's read grown to a page ──
  function CatLedger(props) {
    var v = props.v, four = catZones(v).indexOf('port') !== -1, F = catFind(v);
    function has(f) { return vvField(v, f) != null; }   // A5: a field the user's import fills counts as present
    function L(k, val) { return el('tr', { key: k }, el('td', { className: 'y-lk' }, k), el('td', { className: 'y-lv' }, val)); }
    var rows = [
      L('VEHICLE TYPE / MODEL', (v.type || '—') + ' / ' + v.name),
      has('sensor_range_label') ? L('SENSOR RANGE', v.sensor_range_label) : null,
      has('crew') ? L('CREW', vvField(v, 'crew')) : null,
      has('encumbrance_capacity') ? L('ENCUMBRANCE CAPACITY', catNum(v, 'encumbrance_capacity')) : null,
      has('passengers') ? L('PASSENGER CAPACITY', catNum(v, 'passengers')) : null,
      L('PRICE / RARITY', el(React.Fragment, null, el(CatPrice, { v: v }), el(CatR, { v: v }), ' · RARITY ' + (v.rarity != null ? v.rarity : '—'),
        el('span', { className: 'y-attr', 'data-k': 'note', style: { marginTop: 4 } }, el(CatFind, { v: v }), F ? ' · ' + F.skill : null))),
      has('hard_points_total') ? L('CUSTOMIZATION HARD POINTS', catNum(v, 'hard_points_total')) : null,
      L('SILHOUETTE', catNum(v, 'silhouette')), L('SPEED', catNum(v, 'speed')), L('HANDLING', catSigned(v, 'handling')), L('ARMOR', catNum(v, 'armor')),
      L('HULL TRAUMA THRESHOLD', catNum(v, 'hull_trauma')), L('SYSTEM STRAIN THRESHOLD', catNum(v, 'system_strain')),
      L('DEFENSE · FORE / AFT', catNum(v, 'defense.fore') + ' / ' + catNum(v, 'defense.aft')),
      four ? L('DEFENSE · PORT / STARBOARD', catNum(v, 'defense.port') + ' / ' + catNum(v, 'defense.starboard')) : null,
      v.hyperdrive_primary > 0 ? L('HYPERDRIVE', 'PRIMARY: CLASS ' + v.hyperdrive_primary + (v.hyperdrive_backup > 0 ? ' · BACKUP: CLASS ' + v.hyperdrive_backup : '')) : null,
      has('navicomputer') ? L('NAVICOMPUTER', el('span', { style: { textTransform: 'capitalize' } }, CAT_NAVI[v.navicomputer] || v.navicomputer)) : null,
      has('consumables') ? L('CONSUMABLES', v.consumables) : null,
      has('starfighter_complement') ? L('STARFIGHTER COMPLEMENT', vvField(v, 'starfighter_complement')) : null,
    ];
    return el('table', { className: 'y-led y-spec', 'data-testid': 'entry-spec' }, el('tbody', null, rows));
  }
  function CatArcs(props) {
    var v = props.v, S = Schem();
    return el(React.Fragment, null, el(SechC, { h: 'ARCS AND SHIELDS' }),
      el('div', { className: 'y-sec', 'data-testid': 'entry-arcs' }, el('div', { className: 'y-arcs' },
        el('div', null, el('div', { className: 'y-mat', style: { padding: 10, border: '1px solid var(--doc-rule-fine)' } },
          S && S.Schematic ? el(Ident, { host: 'entry-plate2', px: 200, rec: v, style: { display: 'block', margin: '0 auto' } }) : null),
          el('div', { className: 'y-platecap' }, el('span', null, 'PLATE 2 · RECOGNITION SCHEMATIC'))),
        el('div', { className: 'y-arcs-w' }, catWeapons(v, props.reg, 'y-wline y-e')))));
  }
  function CatWhatFits(props) {
    var v = props.v, attLoad = props.attLoad, R = VR(), VS = V();
    var head = el(SechC, { h: 'HARD POINTS AND WHAT FITS', x: fmtNum(v.hard_points_total) + ' HARD POINTS' });
    // the parts list missing: WB5's own words (FIT's whole-body state, the nearest approved pattern), never counts over nothing
    if (!attLoad.by) {
      return el(React.Fragment, null, head, el('div', { className: 'y-sec', 'data-testid': 'entry-fits', 'data-parts': attLoad.err ? 'failed' : 'loading' },
        attLoad.err ? el('p', { className: 'y-e-t', style: { margin: 0 } }, 'The parts list didn’t load: ' + attLoad.err + '. Nothing on the ship has changed. Reload the page to try again.')
          : el('p', { className: 'y-mono', style: { margin: 0 } }, 'LOADING…')));
    }
    var rec = VS.normalizeVessel({ vehicleKey: v.key }), ctx = { resolve: { attachments: attLoad.by, weapons: props.weaponsById } };
    var m = fitModel({ rec: rec, vrow: v, res: R.resolve(rec, v, ctx.resolve), attById: attLoad.by, ctx: ctx });
    var clean = m.groups.fits.slice(0, 5);
    return el(React.Fragment, null, head, el('div', { className: 'y-sec', 'data-testid': 'entry-fits', 'data-parts': 'loaded' },
      el('div', { className: 'y-fitcounts' }, el('span', null, el('b', null, fmtNum(m.groups.fits.length)), ' FIT THIS HULL'),
        el('span', null, el('b', null, fmtNum(m.groups.check.length)), ' CHECK WITH YOUR GM'), el('span', null, el('b', null, fmtNum(m.groups.nofit.length)), ' DO NOT FIT')),
      el('div', { className: 'y-fitlist' }, clean.map(function (x) {
        var pr = listPrice(x.a, v);
        return el('div', { key: x.a.id, className: 'y-fitline' }, el('span', null, x.a.name, el(FitR, { a: x.a })),
          el('span', { className: 'y-mono' }, 'HARD POINTS ' + (x.a.hp != null ? x.a.hp : '—') + ' · ' + (pr != null ? fmtNum(pr) + ' CR' : 'PRICE —')));
      }))));
  }
  function CatFamily(props) {
    var fam = props.fam, v = props.v, wide = props.wide;
    return el(React.Fragment, null, el(SechC, { h: 'VARIANTS AND FAMILY', x: 'THE ' + upper(fam.stem) + ' SERIES IN THE REGISTRY' }),
      el('div', { className: 'y-sec', style: { padding: '10px 12px 12px' }, 'data-testid': 'entry-family' },
        el(CatGrid, { list: fam.members.filter(function (x) { return x.key !== v.key; }), cols: wide ? 5 : 2, h: 78, s: 60, host: 'entry-family', onOpen: props.onOpen, testid: 'entry-family-grid' })));
  }
  // the add door (U6 on the player's host), then PLAN A FIT (D2: every hull with hard points)
  function CatAcquire(props) {
    var v = props.v, host = props.host, VS = V(), UI = window.SWRPGUI, stale = !!(VS && VS.isStale());
    function now() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return null; } }
    function add(owner, note) {
      var id = null;
      VS.apply(function (s) { var r = VS.acquire(s, v.key, { owner: owner, note: note }, now()); id = r.id; return r.state; });
      if (id != null) props.go({ room: 'ship', id: id });
    }
    var door, line;
    if (host === 'gm') {
      door = el('button', { type: 'button', className: 'y-commit', 'data-testid': 'vessel-add', onClick: function () { add('party', 'Added to the party from the yard.'); } }, '＋ ADD TO PARTY');
      line = null;
    } else if (props.character) {
      door = el('button', { type: 'button', className: 'y-commit', 'data-testid': 'vessel-add', onClick: function () { add('char:' + props.character.id, 'Acquired.'); } }, '＋ ADD TO YOUR VESSELS');
      line = null;
    } else if (!(props.roster || []).length) {
      door = el('button', { type: 'button', className: 'y-commit', 'data-testid': 'entry-make-character', onClick: props.onNewCharacter }, 'MAKE A CHARACTER ›');
      line = 'Ships are kept on a character’s sheet. Make a character to keep this one.';
    } else {
      door = el('button', { type: 'button', className: 'y-commit', 'data-testid': 'vessel-add', onClick: function () { props.onChoose(function (owner) { add(owner, 'Acquired.'); }); } }, '＋ ADD TO YOUR VESSELS');
      line = null;
    }
    var held = stale && UI && UI.StaleHold ? el(UI.StaleHold, { held: true }, door) : door;
    return el('div', { className: 'y-sec y-acq', 'data-testid': 'entry-acquire' },
      stale && UI && UI.StaleTabBanner ? el(UI.StaleTabBanner, { paper: true }) : null, held,
      line ? el('p', { className: 'y-small y-muted', style: { margin: 0 } }, line) : null,
      v.hard_points_total > 0 ? el('button', { type: 'button', className: 'y-door', style: { borderTop: '1px solid var(--doc-rule-fine)' }, 'data-testid': 'entry-plan',
        onClick: function () { props.go({ room: 'plan', key: v.key }); } },
        el('span', null, el('span', { className: 'y-door-n' }, 'PLAN A FIT'), el('br'), el('span', { className: 'y-door-m' }, 'TRY PARTS ON THIS HULL · NOTHING IS SAVED')),
        el('span', { className: 'y-chev' }, '›')) : null);
  }
  function CatalogueEntry(props) {
    var Y = window.SWRPGYard, ctrl = props.ctrl, band = props.band, wide = band === 'wide', key = props.vehicleKey;
    if (ctrl.loading) return { face: 'entry-loading', main: el('p', { className: 'y-u13-body', 'data-testid': 'entry-loading' }, 'Loading vehicle registry…') };
    var v = ctrl.getVehicleByKey(key);
    if (!v) {
      return { face: 'entry-notfound', main: el('div', { className: 'y-empty y-sec', style: { marginTop: 22, textAlign: 'left' }, 'data-testid': 'entry-notfound' },
        el('h1', { className: 'y-u13-h' }, 'Entry not found'), el('p', { style: { margin: '8px 0 0' } }, 'No entry in the registry for key “' + key + '”.')) };
    }
    var all = ctrl.allVehicles || [], n = all.indexOf(v) + 1, legend = catLegend(v), fam = props.families[v.key] || null;
    var cat = (ctrl.taxonomy && ctrl.taxonomy.categories && ctrl.taxonomy.categories[v.category]) || null;
    var paras = Y.vehicleParagraphs(vvField(v, 'description') || '', v.name);   // R-PLF-10: the one rule, yardView's (A5: the import fills a blank)
    var ph = Y.detectDescriptionPlaceholder(paras);
    var s1 = window.SWRPGSources.removedLine ? window.SWRPGSources.removedLine(v) : null;   // S1: the book line where the words were removed
    var runhead = el('div', { className: 'y-runhead2' }, el('span', null, 'CATALOGUE · ' + upper(cat ? cat.label : v.category)),
      el('span', null, 'ENTRY ' + fmtNum(n) + ' / ' + fmtNum(all.length)));
    var id = el('div', null, el('div', { className: 'y-classline' }, upper(v.type) + ' · SILHOUETTE ' + (v.silhouette != null ? v.silhouette : '—')),
      el('h1', { className: 'y-desig', style: { marginTop: 8 }, 'data-testid': 'entry-name' }, v.name),
      legend ? el('div', { style: { marginTop: 12 } }, el('span', { className: 'y-legend', 'data-testid': 'entry-legend' }, 'LEGEND ', el('i', null, 'RARITY ' + v.rarity + ' · RESTRICTED'))) : null,
      el('div', { className: 'y-desig-rule' }));
    // Plate 1: the hull's FULL identifier with its key; its caption is retired with the archive art (R-SSB-4, D-212)
    var hero = el('div', null, el(CatPlate, { v: v, host: 'entry-plate1', cls: 'y-hero-plate', h: wide ? 400 : 220, s: wide ? 300 : 220, bare: true }));
    var acquire = el(CatAcquire, { v: v, host: props.host, character: props.character, roster: props.roster, go: props.go, onNewCharacter: props.onNewCharacter, onChoose: props.onChoose });
    var lore = el(React.Fragment, null, el(SechC, { h: legend ? 'THE STORY' : 'THE RECORD', cite: v.source }),
      el('div', { className: 'y-sec y-lore', 'data-testid': 'entry-lore' },
        ph ? el('p', null, 'Full record: ' + window.SWRPGSources.pageCite(ph.source, ph.page) + ' — not reproduced')
          : !paras.length && s1 ? el(window.SWRPGUI.BookLine, { as: 'p', line: s1 }) : paras.map(function (p, i) { return el('p', { key: i }, p); }),
        el('div', { className: 'y-srcline' }, 'THE BOOK · ' + (v.source || '—') + ' · REGISTRY ENTRY ' + fmtNum(n) + ' / ' + fmtNum(all.length))));
    var spec = el(React.Fragment, null, el(SechC, { h: 'SPECIFICATIONS', x: 'THE BOOK’S FIELD ORDER' }), el('div', { className: 'y-sec' }, el(CatLedger, { v: v })));
    var arcs = el(CatArcs, { v: v, reg: props.reg });
    var extras = el(React.Fragment, null,
      v.hard_points_total > 0 ? el(CatWhatFits, { v: v, attLoad: props.attLoad, weaponsById: props.weaponsById }) : null,
      fam ? el(CatFamily, { fam: fam, v: v, wide: wide, onOpen: props.onOpen }) : null);
    var gmEdit = props.host === 'gm' ? el(CatGmEdit, { v: v, ctrl: ctrl }) : null;
    var main = wide ? el(React.Fragment, null, runhead,
      el('div', { className: 'y-entry-hero' }, hero, el('div', { className: 'y-entry-id' }, id, el('div', { style: { marginTop: 18 } }, acquire))),
      el('div', { className: 'y-entry-cols' }, el('div', null, lore, arcs), el('div', null, spec)), extras, gmEdit)
      : el(React.Fragment, null, runhead, el('div', { style: { marginTop: 14 } }, id), el('div', { style: { marginTop: 14 } }, hero),
        el('div', { style: { marginTop: 14 } }, acquire), lore, spec, arcs, extras, gmEdit);
    return { face: legend ? 'entry-legend' : 'entry', main: main };
  }
  // E3's GM EDIT: the affiliation override (the live entry's control, the frame's shorter words)
  function CatGmEdit(props) {
    var Y = window.SWRPGYard, v = props.v, ctrl = props.ctrl, L = Y.YARD_AFFILIATION_LABELS || {};
    var ov = (ctrl.overrides && ctrl.overrides[v.key] && ctrl.overrides[v.key].affiliation) || '';
    return el(React.Fragment, null, el(SechC, { h: 'GM EDIT' }), el('div', { className: 'y-sec', 'data-testid': 'entry-gm-edit' },
      el('div', { className: 'y-row' }, el('span', { className: 'y-mono' }, 'AFFILIATION'),
        el('select', { className: 'y-in', style: { flex: 1, fontWeight: 700 }, value: ov, 'aria-label': 'Affiliation',
          onChange: function (e) { ctrl.setAffiliationOverride(v.key, e.target.value || null); } },
          el('option', { value: '' }, 'Auto — ' + (L[v.affiliation] || v.affiliation || 'Unaligned')),
          Y.YARD_AFFILIATION_OPTIONS.map(function (o) { return el('option', { key: o.slug, value: o.slug }, L[o.slug] || o.label); })))));
  }

  // ── THE CATALOGUE ROOM: K6's 'catalogue' and 'entry', both hosts ──
  // props: host 'player'|'gm' · route · ctrl (the vehicle library controller) · urlBase ('/<host>/yard/catalogue') · go(route)
  //        · character (player: the scoped character) · roster (this device's characters) · portraitFor
  //        · onNewCharacter (player: U6's MAKE A CHARACTER) · initialState / initialPicks (the index's component state, for legs)
  function YardCatalogue(props) {
    var Y = window.SWRPGYard, route = props.route || {}, ctrl = props.ctrl, band = useYdBand(), reg = useYdRegistries();
    var attLoad = useYdAttachmentsLoad(), weaponsById = useYdWeapons();
    var isIndex = route.room !== 'entry';
    var y = Y.useYardState({ ctrl: ctrl, syncUrl: true, urlBase: props.urlBase, isDetail: !isIndex });
    var families = React.useMemo(function () { return catFamilies(y.discovery || []); }, [y.discovery]);
    var ch = React.useState(null), choosing = ch[0], setChoosing = ch[1];   // U6/U7: the add waiting on "Whose ship?"
    // the index's own state (D1: in the component, never the URL), held here so a visit to an entry keeps it
    var st = React.useState(props.initialState || 'grid'), pk = React.useState(props.initialPicks || []), rl = React.useState(false);
    var ui = { state: st[0], setState: st[1], picks: pk[0], setPicks: pk[1], railOpen: rl[0], setRailOpen: rl[1] };
    function open(k) { props.go({ room: 'entry', key: k }); }
    // B-1255: `props.table` (the GM's Ship table) draws the index as one table of every hull; the entry is the catalogue's
    var out = isIndex ? CatalogueIndex({ y: y, ctrl: ctrl, band: band, reg: reg, onOpen: open, ui: ui, onBuild: function () { props.go({ room: 'build' }); }, table: !!props.table })
      : CatalogueEntry({ ctrl: ctrl, band: band, reg: reg, vehicleKey: route.key, families: families, host: props.host, character: props.character, roster: props.roster,
        go: props.go, onOpen: open, attLoad: attLoad, weaponsById: weaponsById, onNewCharacter: props.onNewCharacter,
        onChoose: function (then) { setChoosing(function () { return then; }); } });
    var picker = choosing && props.host === 'player' ? el(PickerLayer, { roster: props.roster, owner: null, portraitFor: props.portraitFor, title: 'Whose ship?',
      onClose: function () { setChoosing(null); }, onPick: function (key) { var then = choosing; setChoosing(null); then(key); } }) : null;
    return el('div', { className: 'yd-host', 'data-testid': 'yard-s4-catalogue', 'data-yard-room': isIndex ? 'catalogue' : 'entry', 'data-band': band, 'data-face': out.face },
      el('div', { className: 'yd-scroll', key: isIndex ? 'index' : 'entry-' + route.key },
        el('div', { className: 'yd y-' + band, 'data-doc-ground': 'creator', 'data-yard-page': 'catalogue' }, el('div', { className: 'y-main' }, out.main))),
      out.over || null, picker);
  }

  window.SWRPGVesselView = {
    // SHIP YARD S4: the Yard's host parts, one definition for both hosts (the old VesselSheet/VesselsTab faces were deleted at
    // the S5 flip, ruling `shipyard-s5-ready` R-S5R-18)
    YardHangar: YardHangar, YardShip: YardShip, YardCatalogue: YardCatalogue, YardPlan: YardPlan, PickerLayer: PickerLayer, YardNotFoundRoom: YardNotFoundRoom, yardRoute: yardRoute, yardTail: yardTail,
    yardQuery: yardQuery, barIcon: barIcon, ownerLabel: ownerLabel, YARD_ROOMS: YARD_ROOMS,
    // S8 (R-S8FR-3): the Convert room's reading — the copy table, its words, the arcs it asks, the ship's zones, the before → after
    YardConvert: { ONLY_FOR: CONVERT_ONLY_FOR, why: convertWhy, picks: convertPicks, zones: shipZones, diff: convertDiff, Room: ConvertRoom,
      Converted: ModsConverted, credit: addedCredit, on: convOn, Panels: FitPanels, model: fitModel },
    // S8 6e (R-S8B-8): MODS' BUILD, the one piece picker, and the S8 cite print (card ADDENDUM 17)
    YardBuild: { Build: ModsBuild, Picker: BuildPicker, cite: s8Cite, rows: pieceRows, refusal: pieceRefusal, station: stationLine, sources: s8Sources,
      // 6f (R-S8B-9): BUILD A SHIP, mounted by both hosts for K6's room 'build', and YOUR SHIP's reasons (the view rule)
      Room: YardBuildRoom, Yours: BuildYours, why: builtWhy,
      // 6g (R-S8B-10): the hull line's BUILT word (THE SHIP's header and the Hangar's cell) and the panels' built credits
      hullLine: hullLine, HullType: HullType, credits: builtCredits },
    YardBuildRoom: YardBuildRoom,
    // G-7: the host's seam onto the store's counter (R-S4WC-1 A2–A5; B8) and FIT's one list-price read
    counterSeam: counterSeam, useCounterSeam: useCounterSeam, finalizeThrough: finalizeThrough,
    counterName: counterName, useCounterNames: useCounterNames,   // B-1644 (ADDENDUM 373)
    cargoLoadNext: cargoLoadNext, cargoUnloadNext: cargoUnloadNext, cargoLoad: cargoLoad, cargoUnload: cargoUnload, cargoInScope: cargoInScope,   // SHIP CARGO (R-SCB-2/-3)
    // SHIP CARGO on the sheet (F-2, F-3): the SAME hold reading, preview and over line TRADE prints (one shared core)
    Cargo: { holdOf: function (rec, res, gear) { return holdOf({ rec: rec, res: res, gear: gear }); }, useGear: useYdGear, tradeHoldTo: tradeHoldTo, over: cargoOver, held: CARGO_HELD, marked: cargoMarked },
    listPrice: listPrice,
    hullUnpriced: hullUnpriced, loadAttachments: loadAttachments,   // B-1025 (R-S5R-3/4/16): the per-unit price's read, its no-sale twin, and the parts list's one load (with the weapon categories)
    // the floor's parts, for the sheet's VESSELS face (V1–V4, player host): ONE drawing of a ship's condition,
    // hull line, last log line and art, never a second copy in the host
    readDeviceRoster: readDeviceRoster,
    deviceResolveCtx: deviceResolveCtx,   // B-1067 · F2 (R-S5R-2): the one resolver context, both hosts
    YardParts: { Stamp: Stamp, Cond: Cond, HullType: HullType, LastCrit: LastCrit, Art: Art, stampOf: stampOf,
      roleWord: roleWord, useRegistries: useYdRegistries, useAttachments: useYdAttachments, isActive: isActive, shipName: shipName,
      // B-1047 (ruling `shipyard-s5-ready`, D-27's drawing B1047-VESSELS): the sheet's VESSELS face draws the parts list's
      // held state with the floor's own parts — the load with its failure text, WB5's words, a seat's "UPGRADE —"
      useAttachmentsLoad: useYdAttachmentsLoad, PartsWords: PartsWords, UpHeld: UpHeld,
      // S8 (card `shipyard-s8-build` ADDENDUM 24 H-9 (a), R-S8B-10): the book's weapons, so a conversion's weapon_add rows reach the pilot card
      useWeapons: useYdWeapons,
      // PAPER N6 (R-NVD-C2): the NPC card's CRAFT face draws a ship with these, never a copy — HANDLING's sign, the
      // CRIPPLED test and sentence (StateBox's), a lost ship's date line (CraftCond's)
      fitSign: fitSign, isCrippled: isCrippled, isSystemsDown: isSystemsDown, CripLine: CripLine, LostLine: LostLine, WeaponRow: WeaponRow } };
})();
