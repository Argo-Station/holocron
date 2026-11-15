/* lib/library/npc/view.jsx — NPC library section module (reference-layer; NPC exemplar Step 0).
 * Branch-by-Abstraction relocation of the NPC-specific cluster OUT of gm/app.jsx, GM-behavior-neutral.
 * Compiled as a /lib/ classic transform (build.mjs, like diceSurface) → loaded after /vendor.js, before
 * each app bundle. Exposes window.SWRPGLibrary.NPC. NO gm scope: reads React + window.SWRPGUI +
 * window.SWRPGDice off globals. Step 0 = relocation only; the headless boundary + capability slot is
 * Step 1; the player host mirror is Step 2. B-871's deletion ledger retired the dark face, so the
 * library has one face, paper (ruling `npc-flip-ledger-switch`).
 */
(function () {
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef,
      useCallback = React.useCallback, useMemo = React.useMemo;
  // F-46 D2: the shared layout hook (one home). The NPC library is a deep view state-machine
  // (landing → drilldown → npc → combat forks), NOT a list+detail pair — a persistent list-RAIL
  // SplitPane would mean reworking its drill-down navigation (a design change; closer to the
  // EXCLUDED D-C2 side-nav concept). So its desktop shape is a content-max CAP on the scroll body:
  // every view centers at a bounded reading width instead of stretching to a phone strip. Gap flagged
  // in the D2 gate.
  var _NpcDesktop = window.SWRPGDesktop || {};
  var useNpcLayoutMode = _NpcDesktop.useLayoutMode || function () { return 'mobile'; };

  // Lane A tracking board: wide desktop (≥1367) gets a PERSISTENT reference pane beside the board;
  // mid-tier (1024–1366) gets the board full-width + a summon-overlay reference (AS-2). One matchMedia
  // hook; SSR-safe default false.
  function useMinWidth(px) {
    var q = '(min-width: ' + px + 'px)';
    var _m = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia(q).matches : false;
    var s = React.useState(_m); var on = s[0], set = s[1];
    React.useEffect(function () {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      var mq = window.matchMedia(q); var h = function () { set(mq.matches); }; h();
      mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
      return function () { mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h); };
    }, [q]);
    return on;
  }
  // Board-view device pref (CARD · LIST) — NOT a save-shape (ruling bench-board-viewtoggle-brief §2).
  // B-764: its localStorage edge is benchStore's (the store owns the bench's storage); the view calls it.
  function readBoardView() { return BenchStore && BenchStore.readBoardView ? BenchStore.readBoardView() : 'card'; }
  function writeBoardView(v) { if (BenchStore && BenchStore.writeBoardView) BenchStore.writeBoardView(v); }
  var StatBox = window.SWRPGUI.StatBox, useSwipeBack = window.SWRPGUI.useSwipeBack,
      useAutoHideChrome = window.SWRPGUI.useAutoHideChrome,
      ffgDicePool = window.SWRPGUI.ffgDicePool, WIPE_DURATIONS = window.SWRPGUI.WIPE_DURATIONS,
      StaleTabBanner = window.SWRPGUI.StaleTabBanner;   // F-54 banner: lib/shared/ui.jsx

  // NPC bench persistence core (loaded as a /lib/ classic script before this module).
  var BenchStore = window.NpcBenchStore;
  var CastStore = window.NpcCastStore;
  // B-863 (ruling npc-library-paper-concept) — the two durable contracts, each ONE module both hosts
  // load as a hard/defer tag BEFORE this file: R-NPC-3's disposition store and R-NPC-4's URL grammar.
  var DispositionStore = window.NpcDispositionStore;
  var NpcRoute = window.NpcRoute;

  // ── HOLOTABLE Stage B wiring — the table door lives WITH the bench (R-HT-2, the spine) ──
  //
  // Captured ONCE at module load, deliberately. `useRoomSession` is a HOOK, so the number of
  // hooks it calls must not vary between renders of NpcLibrary; a per-render `window.X ? hook() :
  // null` would make the count depend on load order and break the rules of hooks the first time
  // it lost that race. Both scripts are hard tags ahead of this module in each shell, so the real
  // objects are what get captured; the no-op fallbacks exist so a load-order regression degrades
  // to "no table door" instead of taking the whole NPC library down with it — for a feature that
  // is DARK, a crash here would be a real outage in exchange for nothing.
  var RoomSession = (window.SWRPGRoomSession)
    || { useRoomSession: function () { return null; } };
  var HoloCompose = (window.SWRPGHolotableCompose)
    || { BenchTable: function (p) { return p && p.children !== undefined ? p.children : null; },
         Feed: function () { return null; } };


const NPC_ACCENT = '#4EAAFF';  // = gm HOLOCRON_ACCENT (inlined; module has no gm scope)  // Holocron cyan for the whole NPC screen
// GM NPC Creator (Lap C2) palette — the "two faces". FIGHT/threat uses NPC_ACCENT cyan; the TALK/person
// face uses violet; SAVE bars use gold. Mirrors the frozen mockup tokens
// (Docs/mockups/gm-c2-npc-creator.html: --violet / --gold / --red).
const MEET_ACCENT = '#C6A0FF';   // violet — the TALK/person card face
const CREATOR_GOLD = '#F5C842';  // SAVE-bar gold
const CREATOR_VIEWS = ['c-fork', 'c-fight', 'c-armory', 'c-talk', 'c-profile'];

// ══ THE PAPER FACE — B-862 (NPC 1/9), ruling `npc-library-paper-concept` R-NPC-6 ══════════════
// ONE KERNEL, ONE CARRIER. `NpcLibrary` takes `paper` exactly as `Store`, `SellSheet`, `VesselSheet`
// (until the Ship Yard's S5 flip deleted it) and `ImportOgg` do — the SAME state machine, stores, handlers and testids. Until B-871 a context
// carried the face and every drawing component branched at its top; the ledger deleted the dark
// branch, the context and the switch, so each component now draws the board's tree unconditionally.
// B-863 · R-NPC-3 — a version-AHEAD disposition file is read-only: the pills RECEDE (opacity .4 /
// pointer-events none), as the bench's stale board recedes its trackers. Carried by context from the
// kernel to every DispositionSelector (the desk's tabbed card and the phone's three tier cards) so no
// card grows a prop for it; a Provider adds no DOM.
const NpcDispositionCtx = React.createContext({ stale: false });
// B-1835 (ruling `encounters-e3-flip-gate` ADDENDUM 6): the host's loader for the ONE weapon pool path's core (the GM's
// `capabilities.encounterCore`: sheetPool, poolMods, the qualities vocabulary). Null = the host loads it itself (the player
// brings sheetPool and the vocabulary at boot). Carried by context so no card grows a prop for it.
const NpcPoolCoreCtx = React.createContext(null);

// The library's name, printed by BOTH faces' heads — one string, never two (the dark face hands the
// same two constants to the host's `chrome.Header`, which is why its DOM does not move).
const NPC_LIB_TITLE = 'ALLIES & ADVERSARIES';
const NPC_LIB_SUBTITLE = 'DRAMATIS PERSONAE';
// The loading word, printed by both faces (A22). The dark face's inline element keeps its own pixels.
const NPC_LOADING_WORD = 'LOADING LIBRARY…';
// A25 — THE ONLY NEW COPY ON THE BOARD (R-NPC-1: "231 strings read from source; the ONLY new copy on
// the board is A25's three strings"). Verbatim from `FAIL_NEW_COPY` in `lab/holocron/npc_build.py`
// @ 7fd7b29d, where the board holds them "in one place"; `smoke_npc_transplant` reads the pinned blob
// at run time and asserts the DOM prints these three strings exactly. Paper face only: the dark face
// keeps its one state for both (R-NPC-6 — the OFF face is DOM-identical).
const NPC_FAIL_COPY = {
  title: "LIBRARY DIDN'T LOAD",
  body: "The NPC records couldn't be fetched, so there is nothing to show yet. Check your connection, then try again.",
  control: 'TRY AGAIN',
};

// THE INTERIM ZONES, DECLARED ONCE — the files/QSG precedent. While a view's paper drawing is not built, its dark body stands on an ISLAND
// inside the paper shell, `[data-npc-interim="<zone>"]`; that DOM query is what "what is left to
// transplant" MEANS, and R-NPC-8's last measurement counts it. Each zone names the ROW that retires
// it, and the table SHRINKS as the rows land rather than a status line being edited to say so. A
// name cannot be invented at a call site: `npcInterimZone` answers only from this table.
//   · `armory` / `profile` RETIRED at B-869: C13 · C14 (Amendment 1, R-NPC-12) built as drawn.
//   · `register` RETIRED at B-864 (row 3): its four views are drawn (the table shrinks; nothing is edited
//     to say so).
//   · `reference` RETIRED at B-865 (row 4): a CANON record's reference is drawn; a CUSTOM's page (C12)
//     is drawn since B-869 (the kernel's `custom-reference` routing deleted).
//   · `custom` RETIRED at B-869: the cast (C1–C5), the fork (C6), FIGHT (C7/C8) and TALK (C9/C10) are drawn.
//   · `bench` RETIRED: B-866 drew the list and the desk board, B-868 the phone flip.
// EMPTY since B-869: every view of this surface is drawn; B-893 retired the last NAMED island (the vehicle
// picker) — no `[data-npc-interim]` is drawn anywhere on the surface.
const NPC_INTERIM_ZONES = {};
// The DRAWN views, by the zone the body names (`data-npc-zone`): the register at B-864, the canon
// reference at B-865. A view is drawn OR zoned, never both (test/npc_css_port.cjs).
const NPC_DRAWN_ZONES = {
  register:  ['library-landing', 'library-drilldown', 'npc-list', 'history'],
  reference: ['reference'],
  bench:     ['groups'],
  custom:    ['cast', 'c-fork', 'c-fight', 'c-talk', 'c-armory', 'c-profile'],
};
function npcDrawnZone(view) {
  for (var z in NPC_DRAWN_ZONES) { if (NPC_DRAWN_ZONES[z].indexOf(view) !== -1) return z; }
  return null;
}
function npcInterimZone(view) {
  for (var z in NPC_INTERIM_ZONES) {
    if (NPC_INTERIM_ZONES[z].views.indexOf(view) !== -1) return z;
  }
  return null;
}

// The six characteristic steppers, in RAW display order (BR/AG/INT/CUN/WIL/PR).
const CREATOR_CHARS = [
  { key: 'brawn', label: 'BR' }, { key: 'agility', label: 'AG' }, { key: 'intellect', label: 'INT' },
  { key: 'cunning', label: 'CUN' }, { key: 'willpower', label: 'WIL' }, { key: 'presence', label: 'PR' },
];

// Vet UI fix: per-faction color identity. Same idea as per-rulebook accents on
// the Player Datapad — eyes parse a faction by hue 2× faster than by reading
// the label. Map keyed to taxonomy/tree node ids. Fallback to NPC_ACCENT cyan.

const FACTION_ACCENTS = {
  galactic_empire:     '#9FA8B5',  // Imperial ash-gray
  rebel_alliance:      '#E84545',  // Rebellion red
  galactic_republic:   '#4A8FE8',  // Republic blue
  high_republic:       '#FFC857',  // High Republic gold
  separatist_alliance: '#D67238',  // Trade Federation copper
  shadow_collective:   '#8B3A9C',  // Maul violet
  mandalorian_clans:   '#5A7A9C',  // Mandalore steel blue
  dathomir_witches:    '#3FA86F',  // Nightsister green
  criminal_underworld: '#E8A33E',  // Underworld amber
  local_powers:        '#7A8A9C',  // Neutral steel
  force_traditions:    '#9B6FC7',  // Force violet
  sequel_era:          '#C13838',  // First Order red
  civilians_unaligned: '#A89476',  // Beige
  sapient_natives:     '#6FA866',  // Earth-green
  wildlife_creatures:  '#4F7A4A',  // Forest green
  droids_standalone:   '#A8B5C0',  // Chrome silver
};

function getFactionAccent(id, fallback) {
  return FACTION_ACCENTS[id] || fallback || NPC_ACCENT;
}


// Disposition spectrum used by DispositionSelector. Six states from
// allied (cool cyan) -> enemy (hot red), with neutral grey in the middle.
// Each state is a discrete color so the GM can read the current disposition
// at a glance from across the table.

const DISPOSITIONS = [
  { id: 'allied',     label: 'ALLIED',     color: '#3AB5FF', },
  { id: 'friendly',   label: 'FRIENDLY',   color: '#4ECB71', },
  { id: 'neutral',    label: 'NEUTRAL',    color: '#9FBBD3', },
  { id: 'suspicious', label: 'SUSPICIOUS', color: '#FFC857', },
  { id: 'hostile',    label: 'HOSTILE',    color: '#FF8A3D', },
  { id: 'enemy',      label: 'ENEMY',      color: '#FF5C5C', },
];

function resolveAffiliationLabel(taxonomy, nodeId) {
  if (!taxonomy || !nodeId) return nodeId || '';
  const stack = (taxonomy.tree || []).slice();
  while (stack.length) {
    const n = stack.pop();
    if (n.id === nodeId) return n.label || n.id;
    if (Array.isArray(n.children)) stack.push.apply(stack, n.children);
  }
  return nodeId;
}

/* ──────────────────────────────────────────────────────
   NpcAffiliationPickerView — accordion picker over the
   taxonomy tree. Top-level categories are collapsible
   sections; child nodes render as clickable rows with
   their NPC count. Empty nodes are hidden entirely.
────────────────────────────────────────────────────── */
/* ── Library helpers ──────────────────────────────────── */

// Count NPCs per taxonomy node id for a given tier.

function computeTierCountByNode(libraryByTier, tier) {
  const pool = (libraryByTier && libraryByTier[tier]) || [];
  const m = {};
  pool.forEach(n => {
    (n.affiliation_path || []).forEach(id => { m[id] = (m[id] || 0) + 1; });
    if (n.affiliation && !(n.affiliation_path || []).includes(n.affiliation)) {
      m[n.affiliation] = (m[n.affiliation] || 0) + 1;
    }
  });
  return m;
}

// Resolve a shelf's rule to an array of library NPC entries. Always scans
// all three tiers. Featured keys sort to the top.

function resolveShelfMembers(shelf, libraryByTier, _tier, taxonomy) {
  if (!shelf) return [];
  const rule = shelf.rule || { kind: 'static', keys: [] };

  // Always collect all tiers (respects_tier removed; _tier param kept for
  // call-site compatibility but is unused).
  const pool = [];
  ['minion', 'rival', 'nemesis'].forEach(t => {
    const arr = (libraryByTier && libraryByTier[t]) || [];
    arr.forEach(n => pool.push(n));
  });

  let matched = [];
  if (rule.kind === 'static') {
    // shelf configs key members by stoogoff key — canonical records carry it as _source_key
    const wanted = new Set(rule.keys || []);
    matched = pool.filter(n => wanted.has(n._source_key || n.key));
  } else if (rule.kind === 'affiliation_in') {
    const wanted = new Set(rule.affiliations || []);
    matched = pool.filter(n => {
      if (wanted.has(n.affiliation)) return true;
      return (n.affiliation_path || []).some(id => wanted.has(id));
    });
  } else if (rule.kind === 'tier_and_affiliation_subtree') {
    const t = rule.tier;
    const root = rule.subtree_root;
    matched = pool.filter(n => {
      if (t && n.tier !== t) return false;
      return (n.affiliation_path || []).indexOf(root) !== -1;
    });
  } else if (rule.kind === 'match_any') {
    const tags = (rule.source_tag_includes || []).map(s => s.toLowerCase());
    const rx   = rule.name_regex ? new RegExp(rule.name_regex, 'i') : null;
    matched = pool.filter(n => {
      const tagHit = tags.length > 0 && (n.source_tags || []).some(t =>
        tags.indexOf((t || '').toLowerCase()) !== -1
      );
      const nameHit = rx && rx.test(n.name || '');
      return tagHit || nameHit;
    });
  }

  // Sort: featured first (in order), then alphabetical.
  const featured = shelf.featured_keys || [];
  const featuredIdx = {};
  featured.forEach((k, i) => { featuredIdx[k] = i; });
  matched.sort((a, b) => {
    const ak = a._source_key || a.key, bk = b._source_key || b.key;
    const ai = (ak in featuredIdx) ? featuredIdx[ak] : 10000;
    const bi = (bk in featuredIdx) ? featuredIdx[bk] : 10000;
    if (ai !== bi) return ai - bi;
    return (a.name || '').localeCompare(b.name || '');
  });
  return matched;
}

// Build the ordered landing list: drawer entries (with tree node lookup)
// (the shelf lane is deleted, B-769). No tier filter — shows all drawers
// that have ANY NPCs across all tiers.

function buildLandingEntries(taxonomy, libraryByTier) {
  if (!taxonomy || !taxonomy.landing_layout) return [];
  const layout = taxonomy.landing_layout;

  // Compute total counts across all three tiers per node
  const allTierCounts = {};
  ['minion', 'rival', 'nemesis'].forEach(t => {
    const tCounts = computeTierCountByNode(libraryByTier, t);
    Object.keys(tCounts).forEach(nodeId => {
      allTierCounts[nodeId] = (allTierCounts[nodeId] || 0) + tCounts[nodeId];
    });
  });

  // Tree node lookup
  const treeById = {};
  (function walk(nodes) {
    (nodes || []).forEach(n => { treeById[n.id] = n; if (n.children) walk(n.children); });
  })(taxonomy.tree || []);

  const entries = (layout.entries || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const built = [];
  entries.forEach(e => {
    if (e.kind === 'drawer') {
      const node = treeById[e.tree_node_id];
      if (!node) return;
      const count = allTierCounts[node.id] || 0;
      if (count === 0) return;
      built.push({
        kind: 'drawer',
        id: node.id,
        label: node.label || node.id,
        // flavor from the taxonomy entry (if present); otherwise fall back to child labels
        flavor: e.flavor || null,
        children: (node.children || []).filter(c => (allTierCounts[c.id] || 0) > 0),
        npcCount: count,
      });
    }
  });
  return built;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE REGISTER ON PAPER (B-864 · NPC 3/9) — frames A1–A6 · A8 · A16–A21 · A23 · A24 (A7 is a
   before-frame and is not built), lab `lab/holocron/npc.html` @ `5b3fff79`, ruling
   `npc-library-paper-concept` R-NPC-1/-2/-5c/-8. Each register component below hands its
   ALREADY-COMPUTED data to one of these (R-NPC-6: the same
   module, state, handlers and testids; the paper face never re-derives a number). The words are the
   dark tree's own, read from source by the board (`npc_build.py`'s S(...) readers) — none is new.
   Every state carries a `data-npc-state` anchor (B-762: the drill-down had none).
══════════════════════════════════════════════════════════════════════════════════════════════ */
const NPC_SEARCH_PH = 'Search NPCs by name or affiliation…';
const NPC_LANDING_HEAD = 'ALLIES & ADVERSARIES';
const NPC_RECENT_EMPTY = 'Nothing yet. The NPCs you open turn up here, newest first — so the ones you keep reaching for during a session are always one tap away.';
const NPC_TIER_GROUP = (t) => (t === 'nemesis' ? 'NEMESES' : t.toUpperCase() + 'S');

function NpcPaperSechead({ head, cite }) {
  return (
    <div className="hp-sechead" data-stack="1"><h2>{head}</h2>{cite != null ? <span className="hp-cite">{cite}</span> : null}</div>
  );
}
function NpcPaperCount({ n, unit }) {
  return <span className="nl-count">{n}<i>{unit}</i></span>;
}
// The desc under a drawer: its flavor, else its first three divisions (the product's rule, both arms).
function npcDrawerDesc(e, more) {
  return e.flavor || (e.children.slice(0, 3).map(c => c.label).join(' · ') + (e.children.length > 3 ? more : ''));
}
// The monogram — `Monogram`'s initial (lib/shared/ui.jsx), in the board's hairline box (B-874 is the kit's).
function NpcPaperMono({ name }) {
  const ch = ((name || '').replace(/[^A-Za-z]/g, '')[0] || '?').toUpperCase();
  return <span className="nl-mono" aria-hidden="true">{ch}</span>;
}

// ── THE RAILS (D1–D3; D-NPC2 → built with the register) ─────────────────────────────────────────
// Below 1367 the chip strip under the tabs, on BOTH hosts — the GM's tablet slide-out (which nothing
// opened) is replaced by D1's strip, Jason's D3b (ruling npc-paper-rows-3-4 A1, R-NPR34-6). At ≥1367 the
// desk rail (F6, `NpcPaperDeskRail`). The chips print the labels as authored.
function NpcPaperChips({ items, selectedId, onSelect }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="nl-chips" data-npc-rail="chips">
      {items.map(it => (
        <button key={it.id} type="button" className="hp-quiet nl-chip" data-on={it.id === selectedId ? '1' : '0'}
          aria-current={it.id === selectedId ? 'true' : undefined}
          onClick={() => onSelect(it.id, it.label)}>{it.label}</button>
      ))}
    </div>
  );
}
function NpcPaperDeskRail({ items, selectedId, onSelect, title }) {
  return (
    <nav className="nl-rail" data-testid="lib-desk-rail" data-npc-rail="desk" aria-label={title || 'Rail'}
      style={{ maxHeight: 'calc(100vh - 16px)' }}>
      {title ? <b>{title}</b> : null}
      {(items || []).map(it => (
        <button key={it.id} type="button" className="nl-railrow" data-on={it.id === selectedId ? '1' : '0'}
          aria-current={it.id === selectedId ? 'true' : undefined}
          onClick={() => onSelect(it.id, it.label)}>{it.label}</button>
      ))}
    </nav>
  );
}
// ── BREADCRUMB (A3–A6 · A16–A19) ──────────────────────────────────────────────────────────────────
function NpcPaperCrumbs({ crumbs }) {
  return (
    <nav className="nl-crumbs" aria-label="Breadcrumb" data-npc-crumbs="1">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={i}>
            <button type="button" className="nl-crumb" data-last={last ? '1' : '0'}
              aria-current={last ? 'page' : undefined}
              onClick={!last && c.onTap ? c.onTap : undefined}>{c.label}</button>
            {last ? null : <i>›</i>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ── THE SEARCH (A1 · A2 · A8) — the input, plated; hits sorted by name then capped (R-NPC-5c) ────
function NpcPaperSearch({ query, setQuery }) {
  return (
    <div className="hp-plate" data-pad="snug" data-input="1">
      <label className="nl-search">
        <i aria-hidden="true">⌕</i>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={NPC_SEARCH_PH} aria-label="Search NPCs" data-npc-search="1" />
      </label>
    </div>
  );
}

// ── THE FRONT (A1 phone rows with the live count · A2 desk tiles, no faction hue) + SEARCH (A8) ──
function NpcPaperFront({ entries, desk, query, setQuery, trimmedQuery, searchHits, onSelectDrawer, onSelectNpc }) {
  if (trimmedQuery) {
    return (
      <div data-npc-state="search">
        <NpcPaperSearch query={query} setQuery={setQuery} />
        <NpcPaperSechead head={searchHits.length === 0
          ? `NO MATCHES FOR "${query}"`
          : `${searchHits.length} MATCH${searchHits.length === 1 ? '' : 'ES'}`} />
        {searchHits.length > 0 && (
          <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands">
            {searchHits.map(n => (
              <button key={n._source_key || n.key} type="button" className="hp-row" data-npc-hit={n._source_key || n.key}
                onClick={() => onSelectNpc && onSelectNpc(n)}>
                <span className="hp-row-body">
                  <span className="hp-row-desig">{n.name}</span>
                  {n.affiliation ? <span className="nl-tier">{(n.affiliation || '').toString().toUpperCase()}</span> : null}
                </span>
                <span className="hp-row-tab"><span className="nl-tier">{(n._tier || '').toUpperCase()}</span></span>
              </button>
            ))}
          </div></div>
        )}
      </div>
    );
  }
  return (
    <div data-npc-state="front">
      <NpcPaperSearch query={query} setQuery={setQuery} />
      <NpcPaperSechead head={NPC_LANDING_HEAD} />
      {desk ? (
        <div className="nl-tiles" data-testid="landing-tile-grid">
          {entries.map(e => (
            <button key={e.id} type="button" className="hp-plate nl-tile" data-pad="read" data-npc-drawer={e.id}
              onClick={() => onSelectDrawer(e.id)}>
              <span className="nl-tile-t">{e.label}</span>
              <span className="nl-sub">{npcDrawerDesc(e, ' · …')}</span>
              <span className="nl-tile-f"><NpcPaperCount n={e.npcCount} unit="NPCs" /><span className="nl-enter">ENTER ›</span></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands" data-testid="landing-tile-grid">
          {entries.map(e => (
            <button key={e.id} type="button" className="hp-row" data-npc-drawer={e.id} onClick={() => onSelectDrawer(e.id)}>
              <span className="hp-row-body">
                <span className="hp-row-desig">{e.label}</span>
                <span className="nl-sub">{npcDrawerDesc(e, ' · ...')}</span>
              </span>
              <span className="hp-row-tab"><NpcPaperCount n={e.npcCount} unit="NPCs" /></span>
            </button>
          ))}
        </div></div>
      )}
    </div>
  );
}

// ── THE DRILL-DOWN (A3 · A4; A24 is the kernel's own `return null`) ──────────────────────────────
function NpcPaperDrill({ selected, counts, drawerFlavor, featured, getChildFlavor, onBackToLanding, onSelectAffiliation, onSelectNpc }) {
  const divisions = (selected.children || []).filter(c => (counts[c.id] || 0) > 0);
  const TIER_LABEL = { nemesis: 'NEMESIS', rival: 'RIVAL', minion: 'MINION' };
  return (
    <div data-npc-state="drill" data-npc-drill={selected.id}>
      <NpcPaperCrumbs crumbs={[{ label: 'Allies', onTap: onBackToLanding }, { label: selected.label || selected.id }]} />
      <div className="hp-maker" data-npc-drill-count="1">{counts[selected.id] || 0} NPCs · {divisions.length} DIVISIONS</div>
      <h1 className="hp-desig nl-d2">{selected.label || selected.id}</h1>
      <div className="hp-desig-rule" />
      {drawerFlavor ? (
        <div className="hp-plate" data-pad="read" style={{ marginTop: '14px' }}>
          <p className="hp-prose" style={{ margin: 0 }} data-npc-drill-flavor="1">{drawerFlavor}</p>
        </div>
      ) : null}
      {featured.length > 0 ? (
        <React.Fragment>
          <NpcPaperSechead head="PROMINENT FIGURES" />
          <div className="nl-figs" data-npc-figures="1">
            {featured.map((f, i) => (
              <button key={f._source_key || f.key || f.name || i} type="button" className="hp-plate nl-fig" data-pad="snug"
                data-npc-figure={f._source_key || f.key || ''} onClick={() => onSelectNpc && onSelectNpc(f)}>
                <b>{f.name}</b>
                <span className="nl-tier">{TIER_LABEL[f.tier] || (f.tier || '').toUpperCase()}</span>
              </button>
            ))}
          </div>
        </React.Fragment>
      ) : null}
      <NpcPaperSechead head="DIVISIONS" />
      <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands" data-npc-divisions="1">
        <button type="button" className="hp-row" data-npc-division={selected.id} data-npc-all="1"
          onClick={() => onSelectAffiliation(selected.id, selected.label)}>
          <span className="hp-row-body"><span className="hp-row-desig">All {selected.label}<span className="nl-tag">ALL</span></span></span>
          <span className="hp-row-tab"><NpcPaperCount n={counts[selected.id] || 0} unit="" /></span>
        </button>
        {divisions.map(child => {
          const fl = getChildFlavor(child.id);
          return (
            <button key={child.id} type="button" className="hp-row" data-npc-division={child.id}
              onClick={() => onSelectAffiliation(child.id, child.label)}>
              <span className="hp-row-body">
                <span className="hp-row-desig">{child.label}</span>
                {fl ? <span className="nl-sub">{fl.length > 120 ? fl.substring(0, 120) + '…' : fl}</span> : null}
              </span>
              <span className="hp-row-tab"><NpcPaperCount n={counts[child.id] || 0} unit="" /></span>
            </button>
          );
        })}
      </div></div>
    </div>
  );
}

// ── THE ROSTER (A5 · A6 · A23) — by tier, sorted by name, every row naming its book ────────────────
function NpcPaperRoster({ allNpcs, tierFilters, onToggleTier, onSelect, breadcrumbs, groups, allOff, desk }) {
  return (
    <div data-npc-state="roster">
      {breadcrumbs && breadcrumbs.length > 0 ? <NpcPaperCrumbs crumbs={breadcrumbs} /> : null}
      <div className="nl-pills" data-npc-tier-pills="1">
        {['minion', 'rival', 'nemesis'].map(t => {
          const n = (allNpcs || []).filter(x => x.tier === t).length;
          return (
            <button key={t} type="button" className="hp-quiet nl-pill" data-on={tierFilters[t] ? '1' : '0'}
              aria-pressed={tierFilters[t] ? 'true' : 'false'} data-npc-tier={t} onClick={() => onToggleTier(t)}>
              {NPC_TIER_GROUP(t)}{n > 0 ? <b>{n}</b> : null}
            </button>
          );
        })}
      </div>
      {allOff ? (
        <div className="hp-plate" data-pad="read" data-npc-state="no-tiers"><p className="hp-none" style={{ margin: '6px 0' }}>No tiers selected.</p></div>
      ) : groups.length === 0 ? (
        <div className="hp-plate" data-pad="read" data-npc-state="empty-tier"><p className="hp-none" style={{ margin: '6px 0' }}>No NPCs in selected tiers for this affiliation.</p></div>
      ) : null}
      {groups.map(g => {
        const rows = g.npcs.map(n => (
          <button key={n._source_key || n.key} type="button" className="hp-row" data-npc-roster-row={n._source_key || n.key}
            onClick={() => onSelect(n)}>
            <span className="hp-row-body">
              <span className="hp-row-desig">{n.name}</span>
              <span className="hp-rowsrc">{(n.source || '').toUpperCase()}</span>
            </span>
          </button>
        ));
        return (
          <React.Fragment key={g.tier}>
            <NpcPaperSechead head={`${g.label} (${g.npcs.length})`} />
            {desk ? (
              <div className="nl-grid" data-npc-group={g.tier}>
                {rows.map((r, i) => <div key={i} className="hp-plate" data-pad="data">{r}</div>)}
              </div>
            ) : (
              <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands" data-npc-group={g.tier}>{rows}</div></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── THE DOSSIER (A16–A19) — the one tab idiom; the companion at ≥1367; the read cap between seams ──
function NpcPaperLoreUnits({ field }) {
  const { titled, units } = chunkLongform(field);
  if (!units.length) return null;
  return units.map((u, i) => {
    if (!titled && i === 0) return <p key={i} className="hp-prose nl-lp" data-testid="faction-lore-unit">{u.text}</p>;
    const t = u.text;
    const label = u.heading || (t.length > 54 ? t.slice(0, 52).replace(/\s+\S*$/, '') + '…' : t);
    return (
      <details key={i} className="hp-unit" data-testid="faction-lore-unit" open={titled && i === 0}>
        <summary><span className="hp-head"><span className="hp-name">{label}</span><span className="hp-glyph">▾</span></span></summary>
        <p className="hp-prose nl-lp">{t}</p>
      </details>
    );
  });
}
function NpcPaperDossier({ fp, tab, setTab, wide, readCap, breadcrumbs, eyebrow, displayName, quote, branches, allFactions,
  onSelectBranch, vitalRows, strengths, weaknesses, figures, figureNpc, onSelect, rosterEl }) {
  const TABS = [{ id: 'forces', label: 'FORCES' }, { id: 'intel', label: 'INTEL' }, { id: 'lore', label: 'LORE' }];
  const BADGE = { nemesis: 'NEMESIS', rival: 'RIVAL', minion: 'MINION' };
  const vital = vitalRows.length > 0 ? (
    <div className="hp-plate" data-pad="data" data-testid="faction-vital">
      <div className="nl-kvhead">⬡ VITAL INFORMATION</div>
      {vitalRows.map(r => <div key={r.k} className="nl-kv"><span>{r.k}</span><span>{r.v}</span></div>)}
    </div>
  ) : null;
  const figs = figures.length > 0 ? (
    <React.Fragment>
      <NpcPaperSechead head="Prominent figures" />
      <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands">
        {figures.map((f, i) => {
          const target = figureNpc(f);
          const badge = BADGE[f.suggested_tier] || null;
          const inner = (
            <React.Fragment>
              <span className="hp-row-body">
                <span className="hp-row-desig">{f.name}</span>
                {f.role ? <span className="nl-sub">{f.role}</span> : null}
              </span>
              {badge ? <span className="hp-row-tab"><span className="nl-tier">{badge}</span></span> : null}
            </React.Fragment>
          );
          return target
            ? <button key={'fig' + i} type="button" className="hp-row" data-testid="faction-figure" onClick={() => onSelect && onSelect(target)}>{inner}</button>
            : <div key={'fig' + i} className="hp-row nl-inert" data-testid="faction-figure">{inner}</div>;
        })}
      </div></div>
    </React.Fragment>
  ) : null;
  const sw = [['Strengths', strengths], ['Weaknesses', weaknesses]].map(([h, items]) => items.length > 0 ? (
    <React.Fragment key={h}>
      <NpcPaperSechead head={h} cite={String(items.length)} />
      <div className="hp-plate" data-pad="read"><ul className="nl-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
    </React.Fragment>
  ) : null);
  const lead = (
    <React.Fragment>
      {quote ? <div className="hp-plate" data-pad="read"><p className="hp-lead nl-quote">{'“'}{quote}{'”'}</p></div> : null}
      {fp.overview ? (
        <div className="hp-plate" data-pad="read">
          {String(fp.overview).split(/\n\s*\n/).filter(p => p.trim()).map((p, i) => <p key={i} className="hp-prose nl-lp">{p}</p>)}
        </div>
      ) : null}
      {branches && branches.length > 0 ? (
        <React.Fragment>
          <NpcPaperSechead head="Branches" />
          <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands">
            {branches.map(b => {
              const bp = (allFactions && allFactions[b.id]) || {};
              return (
                <button key={b.id} type="button" className="hp-row" data-npc-branch={b.id}
                  onClick={() => onSelectBranch && onSelectBranch(b.id, b.label)}>
                  <span className="hp-row-body">
                    <span className="hp-row-desig">{(b.label || '').toUpperCase()}</span>
                    {bp.short_descriptor ? <span className="nl-sub">{bp.short_descriptor}</span> : null}
                  </span>
                </button>
              );
            })}
          </div></div>
        </React.Fragment>
      ) : null}
    </React.Fragment>
  );
  const lore = (
    <React.Fragment>
      {fp.history ? <React.Fragment><NpcPaperSechead head="Recent history" /><div className="hp-plate" data-pad="read"><NpcPaperLoreUnits field={fp.history} /></div></React.Fragment> : null}
      {fp.how_they_operate ? <React.Fragment><NpcPaperSechead head="How they operate" /><div className="hp-plate" data-pad="read"><NpcPaperLoreUnits field={fp.how_they_operate} /></div></React.Fragment> : null}
      {(!fp.history && !fp.how_they_operate) ? <div className="hp-plate" data-pad="read"><p className="hp-none" style={{ margin: 0 }}>No deep lore recorded for this faction yet.</p></div> : null}
    </React.Fragment>
  );
  const companion = (vital || figs) ? <div className="nl-companion" data-testid="faction-companion">{vital}{figs}</div> : null;
  let body = null;
  if (tab === 'intel') {
    body = wide
      ? <div className="nl-dossier" data-testid="faction-intel"><div className="nl-dmain">{lead}{sw}</div>{companion}</div>
      : <div data-testid="faction-intel">{lead}{vital}{sw}{figs}</div>;
  } else if (tab === 'lore') {
    body = wide
      ? <div className="nl-dossier" data-testid="faction-lore"><div className="nl-dmain">{lore}</div>{companion}</div>
      : <div data-testid="faction-lore">{lore}</div>;
  } else {
    body = <div data-testid="faction-forces">{rosterEl}</div>;
  }
  return (
    <div data-testid="faction-surface" data-npc-state={'dossier-' + tab}>
      {breadcrumbs && breadcrumbs.length > 0 ? <NpcPaperCrumbs crumbs={breadcrumbs} /> : null}
      {eyebrow ? <div className="hp-maker">{eyebrow}</div> : null}
      <h1 className="hp-desig nl-d2">{displayName}</h1>
      {fp.formal_name ? <div className="nl-tier">{String(fp.formal_name).toUpperCase()}</div> : null}
      <div className="nl-tabrow" role="tablist" aria-label="Faction sections">
        {TABS.map(t => (
          <button key={t.id} type="button" className="nl-tab" role="tab" data-on={t.id === tab ? '1' : '0'}
            aria-selected={t.id === tab ? 'true' : 'false'} data-testid={'faction-tab-' + t.id}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {readCap && tab !== 'forces' ? <div className="nl-readcap">{body}</div> : body}
    </div>
  );
}

// ── RECENT (A20 · A21) ─────────────────────────────────────────────────────────────────────────────
function NpcPaperRecent({ npcs, onOpenEntry, confirmClear, onClearPress }) {
  if (!npcs || npcs.length === 0) {
    return (
      <div data-npc-state="recent-empty">
        <NpcPaperSechead head="RECENT" />
        <div className="hp-plate" data-pad="read"><p className="hp-none" style={{ margin: 0 }}>{NPC_RECENT_EMPTY}</p></div>
      </div>
    );
  }
  return (
    <div data-npc-state="recent" data-testid="recent-view">
      <NpcPaperSechead head={`RECENT · ${npcs.length}`} />
      <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands">
        {npcs.map((npc, idx) => {
          const key = npc._source_key || npc.key || String(idx);
          const isCustom = npc._provenance === 'custom';
          const faction = (npc.faction || npc.affiliation || '').toString().toUpperCase().replace(/_/g, ' ');
          return (
            <button key={key} type="button" className="hp-row" data-testid="recent-entry" onClick={() => onOpenEntry(npc)}>
              <NpcPaperMono name={npc.name || '?'} />
              <span className="hp-row-body">
                <span className="hp-row-desig">{npc.name || '(Unnamed)'}</span>
                <span className="nl-tier">{isCustom ? 'CUSTOM' : (npc.tier || '').toUpperCase()}{faction ? ' · ' + faction : ''}</span>
              </span>
            </button>
          );
        })}
      </div></div>
      <button type="button" className="hp-quiet nl-wide nl-dashed" data-testid="recent-clear" onClick={onClearPress}>
        {confirmClear ? 'TAP AGAIN TO CONFIRM' : 'CLEAR RECENT'}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   NpcLibraryLandingView — single scrollable column of
   drawer cards (the shelf lane is deleted, B-769). This is the first
   screen a GM sees after picking a tier.
────────────────────────────────────────────────────── */

function NpcLibraryLandingView({ taxonomy, libraryByTier, onSelectDrawer, onSelectNpc, accent }) {
  // R-D2-1 (A1): on desktop the faction description paragraphs cap to a readable line length (66ch)
  // instead of filling the content-max width the D2 body cap allows.
  var _deskProse = useNpcLayoutMode() === 'desktop';
  // Vet UI fix: library was missing a search input despite 200+ NPCs.
  // Sticky-top search filters live across all tiers as the GM types.
  const [query, setQuery] = React.useState('');
  const trimmedQuery = query.trim().toLowerCase();

  // Flatten all NPCs from libraryByTier for search.
  const allNpcs = React.useMemo(() => {
    if (!libraryByTier) return [];
    const out = [];
    ['minion', 'rival', 'nemesis'].forEach(t => {
      (libraryByTier[t] || []).forEach(n => out.push({ ...n, _tier: t }));
    });
    return out;
  }, [libraryByTier]);

  const searchHits = React.useMemo(() => {
    if (!trimmedQuery) return [];
    return allNpcs
      .filter(n => {
        const name = (n.name || '').toLowerCase();
        const aff = (n.affiliation || '').toLowerCase();
        return name.indexOf(trimmedQuery) !== -1 || aff.indexOf(trimmedQuery) !== -1;
      })
      // B-426 / R-NPC-5c (frame A8): sort ALL the matches by name, THEN cap. The other order — cap the
      // import-ordered hits, then sort — keeps the defect under a sorted surface. Both faces.
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 30);
  }, [allNpcs, trimmedQuery]);

  if (!taxonomy || !taxonomy.landing_layout) {
    return (
      <div style={{
        textAlign: 'center', padding: '40px 16px',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
        letterSpacing: '0.2em', color: `${accent}99`,
      }}>LOADING LIBRARY…</div>
    );
  }

  // Build entries across ALL tiers (no tier filter here)
  const entries = React.useMemo(
    () => buildLandingEntries(taxonomy, libraryByTier),
    [taxonomy, libraryByTier]
  );

  return (
    <NpcPaperFront entries={entries} desk={_deskProse} query={query} setQuery={setQuery} trimmedQuery={trimmedQuery}
      searchHits={searchHits} onSelectDrawer={onSelectDrawer} onSelectNpc={onSelectNpc} />
  );
}


function NpcLibraryDrillDownView({
  taxonomy, libraryByTier,
  selectedDrawerId, onSelectAffiliation, onSelectNpc,
  accent, factionProfiles,
  onBackToLanding,
}) {
  // UXQP-29: per-faction PROMINENT FIGURES — hand-curated featured_keys from the
  // landing layout (faction_features), keys override affiliation (the most_wanted
  // cross-tag pattern). Resolved via resolveShelfMembers (a static-key pseudo-shelf).
  const featured = React.useMemo(() => {
    const ff = taxonomy && taxonomy.landing_layout && taxonomy.landing_layout.faction_features;
    const keys = ff && ff[selectedDrawerId];
    if (!keys || !keys.length) return [];
    const resolved = resolveShelfMembers({ rule: { kind: 'static', keys: keys } }, libraryByTier, null, taxonomy);
    // resolveShelfMembers returns pool-order; re-order to the CURATED featured_keys order
    // so the rail leads with the most iconic picks (Thrawn/Tarkin first, not data order).
    const order = {};
    keys.forEach((k, i) => { order[k] = i; });
    return resolved.slice().sort((a, b) => {
      const ia = order[a._source_key || a.key]; const ib = order[b._source_key || b.key];
      return (ia == null ? 999 : ia) - (ib == null ? 999 : ib);
    });
  }, [taxonomy, selectedDrawerId, libraryByTier]);
  const counts = React.useMemo(() => {
    const totals = {};
    ['minion', 'rival', 'nemesis'].forEach(t => {
      const tCounts = computeTierCountByNode(libraryByTier, t);
      Object.keys(tCounts).forEach(nodeId => {
        totals[nodeId] = (totals[nodeId] || 0) + tCounts[nodeId];
      });
    });
    return totals;
  }, [libraryByTier]);

  const selected = React.useMemo(() => {
    if (!taxonomy || !selectedDrawerId) return null;
    const treeById = {};
    (function walk(nodes) {
      (nodes || []).forEach(n => { treeById[n.id] = n; if (n.children) walk(n.children); });
    })(taxonomy.tree || []);
    return treeById[selectedDrawerId] || null;
  }, [taxonomy, selectedDrawerId]);

  // Resolve flavor text for the drawer from the taxonomy landing layout
  const drawerFlavor = React.useMemo(() => {
    if (!taxonomy || !taxonomy.landing_layout || !selectedDrawerId) return null;
    const entry = (taxonomy.landing_layout.entries || []).find(
      e => e.kind === 'drawer' && e.tree_node_id === selectedDrawerId
    );
    return entry && entry.flavor ? entry.flavor : null;
  }, [taxonomy, selectedDrawerId]);

  // Resolve flavor for a child node — try dossier short_descriptor first, then parent dossier
  const getChildFlavor = (childId) => {
    if (factionProfiles && factionProfiles[childId] && factionProfiles[childId].short_descriptor) {
      return factionProfiles[childId].short_descriptor;
    }
    return null;
  };

  if (!selected) return null;   // A24 — the blank return, on both faces

  return (
    <NpcPaperDrill selected={selected} counts={counts} drawerFlavor={drawerFlavor} featured={featured}
      getChildFlavor={getChildFlavor} onBackToLanding={onBackToLanding}
      onSelectAffiliation={onSelectAffiliation} onSelectNpc={onSelectNpc} />
  );
}

/* ══════════════════════════════════════════════════════
   LONGFORM CHUNKING — the walls rule made mechanical.
   The books never present a slab; their unit is a header
   + a few sentences. chunkLongform normalizes a dossier
   longform field into display units (the (a)/(b) branch):
   - Array of {heading,text} → titled units (the future
     content-pass shape; heading is the authored section).
   - String                 → paragraph units split on
     blank lines (no titles — today's shape, the (a) render).
   Any unit over the wall ceiling is re-split on sentence
   boundaries so no rendered block breaches ~700 chars.
══════════════════════════════════════════════════════ */
var WALL_MAX = 680;  // display ceiling, headroom under the ~700-char UI_RULES limit

function splitToCeiling(text, max) {
  var t = String(text || '').trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  // Greedy sentence-boundary re-chunk so an oversized paragraph still obeys the ceiling.
  var sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [t];
  var out = [], buf = '';
  sentences.forEach(function (s) {
    if ((buf + s).length > max && buf) { out.push(buf.trim()); buf = s; }
    else { buf += s; }
  });
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function chunkLongform(field) {
  // (b) titled sections — the books' way (content-pass shape [{heading,text}]).
  if (Array.isArray(field)) {
    var titled = [];
    field.forEach(function (u) {
      if (!u) return;
      splitToCeiling(u.text != null ? u.text : '', WALL_MAX).forEach(function (chunk, i) {
        titled.push({ heading: i === 0 ? (u.heading || '') : '', text: chunk });
      });
    });
    return { titled: true, units: titled };
  }
  // (a) plain string — split on blank lines, then to the ceiling. No titles.
  var units = [];
  String(field || '').split(/\n\s*\n/).forEach(function (p) {
    splitToCeiling(p, WALL_MAX).forEach(function (chunk) { units.push({ text: chunk }); });
  });
  return { titled: false, units: units };
}

/* ══════════════════════════════════════════════════════
   NpcFactionSurface — the ONE consolidated faction surface.
   SubTabs INTEL / LORE / FORCES replace the two dossiers
   that used to render one faction twice (the FACTION INTEL
   block in the list view + the dead NpcFactionLoreView).
   - INTEL: descriptor → witness quote → overview → the
     VITAL INFORMATION card (structured facts assembled from
     EXISTING fields) → strengths/weaknesses pills →
     prominent figures (tap → the NPC reference).
   - LORE : history + how_they_operate as collapsible units
     (no slab).
   - FORCES: the faction's NPC list (generic tiers first,
     named last) — the existing NpcLibraryListView list.
══════════════════════════════════════════════════════ */
var REGION_LABELS = {
  deep_core: 'Deep Core', core_worlds: 'Core Worlds', colonies: 'Colonies',
  inner_rim: 'Inner Rim', expansion_region: 'Expansion Region', mid_rim: 'Mid Rim',
  outer_rim: 'Outer Rim', hutt_space: 'Hutt Space', wild_space: 'Wild Space',
  unknown_regions: 'Unknown Regions',
};
// Presence-strength ranking (covers both the enum + legacy qualifier vocab).
var PRESENCE_RANK = {
  dominant: 6, fortified: 5, strongest: 5, significant: 4, strong: 4,
  moderate: 3, covert: 3, patrol: 2, 'safe worlds': 2, minimal: 1, skeleton: 1, none: 0,
};
var SEEKS_LABELS = {
  data: 'Intel', contraband: 'Contraband', weapon: 'Weapons', person: 'Recruits',
  artifact: 'Artifacts', technology: 'Technology', resource: 'Resources',
};

function NpcFactionSurface({
  faction, allNpcs, npcPool, tierFilters, onToggleTier, onSelect,
  accent, allFactions, breadcrumbs, branches, onSelectBranch, affiliationLabel,
}) {
  const [tab, setTab] = React.useState('forces');   // FORCES first + default — open on the people, not the prose (Jason 2026-07-21)
  const fp = faction || {};
  // Library desktop: the body cap retired for BROWSE, so the faction PROSE tabs (INTEL/LORE) cap
  // themselves to a READING MEASURE here (--desk-prose-max, the 66ch measure the landing flavor uses);
  // FORCES (the NPC grid) stays full-width.
  const _readCap = useNpcLayoutMode() === 'desktop' ? { maxWidth: 'var(--desk-prose-max)' } : null;
  // Inc 3 (library Lap 2) — the DOSSIER COMPANION (ruling library-desktop-negative-space-brief).
  // At the ≥1367 rail band, INTEL/LORE stop being a 543px column beside 609px of void: the prose
  // keeps its 66ch measure and the gutter becomes a pinned companion holding the EXISTING structured
  // blocks (vital card + prominent figures). Below the band + mobile: the current stack, byte-behavior.
  // One shell, both tabs (AS-1 · one source, two arrangements). PROFILE's proven identity-rail shape.
  const dossier = useMinWidth(1367);
  const strengths  = Array.isArray(fp.strengths) ? fp.strengths : [];
  const weaknesses = Array.isArray(fp.weaknesses) ? fp.weaknesses : [];
  const figures    = Array.isArray(fp.prominent_figures) ? fp.prominent_figures : [];

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Resolve a prominent figure to a live library NPC (name first, then stat_block_ref).
  const figureNpc = (f) => {
    const pool = (npcPool && npcPool.length) ? npcPool : (allNpcs || []);
    const fn = norm(f.name);
    let hit = pool.find(n => norm(n.name) === fn);
    if (!hit && f.stat_block_ref) {
      const ref = norm(f.stat_block_ref);
      hit = pool.find(n => norm(n._source_key || n.key || '') === ref || norm(n.name) === ref);
    }
    return hit || null;
  };

  // ── VITAL INFORMATION — structured facts pulled from EXISTING fields only ──
  const vitalRows = [];
  const leader = figures.find(f => (f.suggested_tier || '') === 'nemesis') || figures[0];
  if (leader) vitalRows.push({ k: 'LEADER', v: leader.role ? `${leader.name} — ${leader.role}` : leader.name });
  if (branches && branches.length) {
    vitalRows.push({ k: 'BRANCHES', v: branches.map(b => b.label).join(' · ') });
  }
  const rp = (fp.regional_presence && typeof fp.regional_presence === 'object') ? fp.regional_presence : null;
  if (rp) {
    const spheres = Object.keys(rp)
      .map(k => ({ label: REGION_LABELS[k] || k.replace(/_/g, ' '), v: rp[k], rank: PRESENCE_RANK[String(rp[k]).toLowerCase()] || 0 }))
      .filter(r => r.rank >= 3)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 4);
    if (spheres.length) vitalRows.push({ k: 'INFLUENCE', v: spheres.map((s, i) => i === 0 ? `${s.label} (${s.v})` : s.label).join(' · ') });
  }
  const mi = (fp.mcguffin_interest && typeof fp.mcguffin_interest === 'object') ? fp.mcguffin_interest : null;
  if (mi) {
    const seeks = Object.keys(mi)
      .filter(k => k !== 'notes' && ['high', 'medium'].indexOf(String(mi[k]).toLowerCase()) !== -1)
      .sort((a, b) => (String(mi[b]).toLowerCase() === 'high' ? 1 : 0) - (String(mi[a]).toLowerCase() === 'high' ? 1 : 0))
      .map(k => SEEKS_LABELS[k] || k.replace(/_/g, ' '));
    if (seeks.length) vitalRows.push({ k: 'SEEKS', v: seeks.join(' · ') });
  }

  const quote = fp.short_descriptor || (fp.witness_statement && fp.witness_statement.text) || '';
  const eyebrow = [
    (fp.type || '').toString().replace(/_/g, ' '),
    Array.isArray(fp.era_active) && fp.era_active.length ? fp.era_active.join(' / ') + ' era' : '',
  ].filter(Boolean).join(' · ').toUpperCase();
  const displayName = fp.name || affiliationLabel || 'FACTION';

  return (
    <NpcPaperDossier fp={fp} tab={tab} setTab={setTab} wide={dossier} readCap={!!_readCap} breadcrumbs={breadcrumbs}
      eyebrow={eyebrow} displayName={displayName} quote={quote} branches={branches} allFactions={allFactions}
      onSelectBranch={onSelectBranch} vitalRows={vitalRows} strengths={strengths} weaknesses={weaknesses}
      figures={figures} figureNpc={figureNpc} onSelect={onSelect}
      rosterEl={<NpcLibraryListView allNpcs={allNpcs} affiliationLabel={affiliationLabel} tierFilters={tierFilters}
        onToggleTier={onToggleTier} onSelect={onSelect} accent={accent} />} />
  );
}

/* ──────────────────────────────────────────────────────
   NpcLibraryListView — tier-filtered grouped list of
   library NPCs. Shows MINION / RIVAL / NEMESIS sections
   with toggleable pill filters at the top. Tap any NPC
   row to open the reference view. (The faction INTEL/LORE
   dossier that used to lead this view now lives in
   NpcFactionSurface; this is the pure roster — shared by
   the FORCES tab, shelves, and profile-less affiliations.)
────────────────────────────────────────────────────── */

function NpcLibraryListView({ allNpcs, affiliationLabel, tierFilters, onToggleTier, onSelect, accent, breadcrumbs }) {
  // Library desktop (FORK 1c): a shelf's NPCs render as a CARD GRID on desktop (each tier group flows to
  // width), the single-column rows on mobile (byte-invariant).
  const _deskGrid = useNpcLayoutMode() === 'desktop';
  // Tier color accents so each section header is visually distinct
  const TIER_COLORS = {
    minion:  '#7EC8E3',
    rival:   accent,
    nemesis: '#FF8A3D',
  };

  // Build grouped + filtered list
  const groups = ['minion', 'rival', 'nemesis']
    .filter(t => tierFilters[t])
    .map(t => ({
      tier: t,
      label: t === 'nemesis' ? 'NEMESES' : t.toUpperCase() + 'S',
      color: TIER_COLORS[t],
      npcs: (allNpcs || []).filter(n => n.tier === t).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .filter(g => g.npcs.length > 0);

  const allOff = !tierFilters.minion && !tierFilters.rival && !tierFilters.nemesis;

  return (
    <NpcPaperRoster allNpcs={allNpcs} tierFilters={tierFilters} onToggleTier={onToggleTier} onSelect={onSelect}
      breadcrumbs={breadcrumbs} groups={groups} allOff={allOff} desk={_deskGrid} />
  );
}

/* ══════════════════════════════════════════════════════
   TIER-SPECIFIC NPC REFERENCE CARDS
   Three distinct card types based on NPC tier:
   - Minion: Group management tool (stepper, wound pool)
   - Rival:  Tactical reference (explicit NO STRAIN)
   - Nemesis: PC-equivalent double-sided card (stats + dossier)
══════════════════════════════════════════════════════ */

/* ── FFG DICE SYMBOL RENDERER ── */
// Uses sw-rpg-icons font (from stoogoff/sw-adversaries) for Star Wars-specific symbols
// Unicode code points from the font:
//   \e900=d6, \e902=d8, \e904=d12
//   \e936=advantage, \e93a=despair, \e93b=failure
//   \e93e=force pip, \e941=success, \e943=threat, \e945=triumph
// ── Shared symbol table (ADR 0003 charbuild 3c, D-3C1) ──────────────────
// gm's private FFG_SYMBOLS (21 keys) + BRACKET_MAP (15 entries) are RETIRED onto the ONE
// app-wide table (SWRPGDice.SYMBOLS + BRACKET_TOKENS in lib/shared/diceUI.jsx — the D-3A2
// contract; dice colors converge to the shared palette). What stays gm-local is NPC-prose
// vocabulary only: the :colon: token syntax and the difficulty-NAME pseudo-glyphs
// (":average:" -> 2 difficulty dice) — neither exists in canonical descriptions app-wide.

const GM_SYMBOL_ALIASES = { lightside: 'light', darkside: 'dark' };  // pure renames (same char + color)

const DIFFICULTY_NAMES = { easy: 1, average: 2, hard: 3, daunting: 4, formidable: 5 };

// rawKey (:colon: name or shared-table key) -> { sym, repeat } from the shared table, or null.

function gmResolveSymbol(rawKey) {
  const k = String(rawKey).toLowerCase();
  const shared = (window.SWRPGDice && window.SWRPGDice.SYMBOLS) || {};
  if (DIFFICULTY_NAMES[k] && shared.difficulty) {
    return {
      sym: Object.assign({}, shared.difficulty, { label: k.charAt(0).toUpperCase() + k.slice(1) }),
      repeat: DIFFICULTY_NAMES[k],
    };
  }
  const sym = shared[GM_SYMBOL_ALIASES[k] || k];
  return sym ? { sym: sym, repeat: 1 } : null;
}


function renderFFGSymbol(key, idx) {
  const hit = gmResolveSymbol(key);
  if (!hit) return ':' + key + ':';
  const D = window.SWRPGDice || {};
  if (D.fontAbsent && D.fontAbsent()) {   // T3 (argo-a1-export ADDENDUM 6): without the dice font the symbol reads as a word
    const k = String(key).toLowerCase();
    return D.dieWordSpan(DIFFICULTY_NAMES[k] ? 'difficulty' : (GM_SYMBOL_ALIASES[k] || k), hit.repeat > 1 ? hit.repeat : null, 'sym' + idx);
  }
  const text = hit.sym.char.repeat(hit.repeat);
  return React.createElement('span', {
    key: 'sym' + idx,
    style: {
      fontFamily: hit.sym.font || 'SWRPGIcons',
      fontSize: '1.1em',
      color: hit.sym.color,
      padding: '0 1px',
      verticalAlign: 'middle',
    },
    title: hit.sym.label || key,
    'aria-label': hit.sym.label || key,
  }, text);
}


function renderDescription(text) {
  if (!text) return null;
  // Strip oggdude HTML-like markup before dice-token matching. Matches the
  // player/index.html renderDescription cleanup pass so talent/quality/
  // ability descriptions don't leak literal [H1]header[h1] / [B]bold[b] /
  // [P] / [BR] tags into the UI (task #22 humanization audit, 2026-05-27).
  const cleaned = text
    .replace(/\[H\d\].*?\[h\d\]\s*/gi, '')
    .replace(/\[p\]/gi, '\n')
    .replace(/\[br\]/gi, '\n')
    .replace(/\[B\](.*?)\[b\]/gi, '$1')
    .replace(/\[I\](.*?)\[i\]/gi, '$1')
    .replace(/^\s+/, '').trim();
  const parts = [];
  const regex = /:(\w+):|(?:\[([A-Z]{2})\])/g;
  let match;
  let lastIndex = 0;
  let symIdx = 0;

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleaned.substring(lastIndex, match.index));
    }
    const tokenKey = match[1] || ((window.SWRPGDice && window.SWRPGDice.BRACKET_TOKENS) || {})[match[2]];
    if (tokenKey && gmResolveSymbol(tokenKey)) {
      parts.push(renderFFGSymbol(tokenKey, symIdx++));
    } else {
      parts.push(match[0]);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < cleaned.length) {
    parts.push(cleaned.substring(lastIndex));
  }
  return parts;
}

// rawKey (:colon: name or shared-table key) -> { sym, repeat } from the shared table, or null.


// ── Canonical talents registry (ADR 0003 charbuild 3c) ──────────────────
// Fetch-once/cache-on-window, same pattern as the player's loaders. Serves BOTH gm talent
// consumers: PC party chips (id-refs via the shared CharResolve) and the NPC stat-block
// description lookup (collision-aware name index below).

// ruling release-r6-companions-lifts Q1 (a): the loader and its index live in lib/library/npc/refData.js
// (window.SWRPGNpcRefData), loaded by both hosts; these are its names, never a copy.
var loadCanonicalTalents = function () { return window.SWRPGNpcRefData.loadCanonicalTalents(); };
var canonicalTalentNameIndex = function (reg) { return window.SWRPGNpcRefData.canonicalTalentNameIndex(reg); };


/* Parse weapon strings like "Blaster rifle (Dmg 9; Long; Stun Setting)" */

function parseWeaponString(str) {
  if (!str || typeof str !== 'string') return { name: str || '', parsed: false };
  const match = str.match(/^(.+?)\s*\(Dmg\s+(\d+);\s*([\w:\s]+?);\s*(.*)\)$/);
  if (match) return { name: match[1].trim(), damage: match[2], range: match[3].trim(), qualities: match[4].trim(), parsed: true };
  const simple = str.match(/^(.+?)\s*\(Dmg\s+(\d+);\s*([\w:\s]+?)\)$/);
  if (simple) return { name: simple[1].trim(), damage: simple[2], range: simple[3].trim(), qualities: null, parsed: true };
  return { name: str, parsed: false };
}

/* Shared header: eyebrow + name + accent rule + description */

/* Shared footer: source. (SAVE TO HISTORY retired — ruling custom-npc-tab-space-triage
   Addendum 1 §C: RECENT's writer is opening a detail, so the tab needs no control of its own.
   This one only ever rendered on the phone branch, which is why HISTORY could not be filled at
   desktop at all.) `onSave` is gone from the signature so a caller cannot resurrect it silently. */

/* Shared: render characteristics 6-box grid */

/* ── RANGE VALUE LABELS ── */

const RANGE_LABELS = {
  wrEngaged: 'Engaged', wrClose: 'Close', wrShort: 'Short', wrMedium: 'Medium', wrLong: 'Long', wrExtreme: 'Extreme',
  srClose: 'Close', srShort: 'Short', srMedium: 'Medium', srLong: 'Long', srExtreme: 'Extreme',
};

// ffgDicePool → window.SWRPGUI (lib/shared/ui.jsx), destructured at top. [Phase 1b]

/* Render dice pool as minimalist SVG outlines with color gradient fill */

/* ── SKILL GRID — full table with characteristic + rank + dice pool ── */

function NpcSkillGrid({ skills, characteristics, isGroup, accent, refData, groupSkillRank, paperHead, paperNote }) {
  const [showAll, setShowAll] = React.useState(false);

  // Vet rules fix: JSON stores subskills as "Ranged: Heavy" (colon) while the
  // oggdude skills reference uses "Ranged - Heavy" (dash). Previous lookup on
  // `trained[s.Name.toLowerCase()]` silently dropped every Ranged/Knowledge/
  // Piloting subskill across ~1,430 NPCs — Stormtrooper lost Ranged (Heavy),
  // Bothan Spy lost Knowledge (Outer Rim), etc.
  // Fix: key both sides on alpha-only normalization so separators don't matter.
  const normSkillName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Build trained skills map: { normalizedName: rank }. Canonical records carry
  // skill_ref ids ('ranged_heavy') — alpha-only normalization makes them collide
  // with the reference names ('Ranged - Heavy') by construction (world-links-3).
  const trained = {};
  (Array.isArray(skills) ? skills : []).forEach(s => {
    const rawName = typeof s === 'string' ? s : (s && (s.name || s.skill_ref));
    if (!rawName) return;
    const key = normSkillName(rawName);
    trained[key] = typeof s === 'string' ? 0 : (s.rank ?? 0);
  });

  // Build full skills list from refData (oggdude skills database)
  const chars = characteristics || {};
  const allSkills = React.useMemo(() => {
    // blob-retirement-2: the full list comes from the canonical skills VOCAB (exactly
    // the 35 RAW skills; characteristic landed at sub-step 1 with cited foundation —
    // Docs/RULES_FOUNDATION_SKILLS.md). The community CYBERNETICS skill leaves the grid
    // here, as ruled (D-BR1 condition 3, escalated FYI).
    if (!refData || !refData.skillsVocab) return null;
    const VOCAB_ABBREV = { brawn: 'BR', agility: 'AG', intellect: 'INT', cunning: 'CUN', willpower: 'WIL', presence: 'PR' };
    return refData.skillsVocab
      .map(s => {
        const charValue = chars[s.characteristic] || 0;
        const key = normSkillName(s.label);
        const rank = trained[key] ?? null;
        return {
          name: s.label,
          charKey: VOCAB_ABBREV[s.characteristic] || '',
          charValue: charValue,
          rank: rank,
          isTrained: key in trained,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [refData, trained, chars]);

  // For minion groups: override skill ranks with the group skill rank.
  // B-863: this hook sits ABOVE the pills fallback's early return. It sat below it, so a grid that
  // mounted while the reference data was still loading (the pills) and then received it rendered ONE
  // MORE HOOK than before and threw React #310 — latent while every route into a stat block was a
  // click (the data had landed), live the moment a reload lands on a reference by URL (R-NPC-4 claim 2).
  const effectiveSkills = React.useMemo(() => {
    if (!allSkills) return [];
    if (isGroup && groupSkillRank != null) {
      return allSkills.map(s => s.isTrained ? { ...s, rank: groupSkillRank } : s);
    }
    return allSkills;
  }, [allSkills, isGroup, groupSkillRank]);

  // Fallback: just show trained skills as pills if no refData at all.
  // A15 (B-865, rolled in; both faces): a pill prints the skill's NAME — the record's own name, else
  // `SWItems.skillRefLabel(skill_ref)`, the one table that needs no registry (the vocab that labels a
  // ref is one of the registries that did not load). It printed the trained map's NORMALISED key
  // through a capitaliser ("Rangedheavy") — the name was thrown away before it reached the pill.
  if (!allSkills) {
    const SWI = window.SWItems;
    const seen = {};
    const labels = [];
    (Array.isArray(skills) ? skills : []).forEach(s => {
      const lab = typeof s === 'string' ? s
        : (s && (s.name || (s.skill_ref ? (SWI && SWI.skillRefLabel ? SWI.skillRefLabel(s.skill_ref) : s.skill_ref) : null)));
      if (lab && !seen[lab]) { seen[lab] = 1; labels.push(lab); }
    });
    return (
      <React.Fragment>
        <NpcPaperSechead head={paperHead || 'SKILLS'} />
        <div className="hp-plate" data-pad="data" data-npc-skills="pills">
          {labels.length === 0 ? <p className="hp-none" style={{ margin: 0 }}>None.</p>
            : <div className="nl-pillset">{labels.map(l => <span key={l} className="sb-qual">{l}</span>)}</div>}
        </div>
      </React.Fragment>
    );
  }

  const displaySkills = showAll ? effectiveSkills : effectiveSkills.filter(s => s.isTrained);

  const CHAR_FULL_P = { BR: 'Brawn', AG: 'Agility', INT: 'Intellect', CUN: 'Cunning', WIL: 'Willpower', PR: 'Presence' };
  const trainedN = effectiveSkills.filter(s => s.isTrained).length;
  return (
    <React.Fragment>
      <NpcPaperSechead head={paperHead || 'SKILLS'} cite={trainedN + ' of ' + effectiveSkills.length} />
      <div className="hp-plate" data-pad="data" data-npc-skills="grid">
        <div className="nl-tog">
          <button type="button" className="hp-quiet" aria-pressed={showAll ? 'true' : 'false'} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'TRAINED ONLY' : 'SHOW ALL'}</button>
        </div>
        <div className="hp-bands" data-run="1">{displaySkills.map(sk => {
          const rk = sk.isTrained ? (sk.rank || 0) : 0;
          return (
            <div key={sk.name} className="sb-sk" data-compact="1" data-trained={sk.isTrained ? '1' : '0'}
              style={sk.isTrained ? undefined : { opacity: 0.35 }}>
              <div className="sb-sk-n"><div className="sb-sk-name">{sk.name}</div>
                <div className="sb-sk-char">{(CHAR_FULL_P[sk.charKey] || sk.charKey).toUpperCase()}</div></div>
              <div className="sb-sk-boxes" aria-label={'rank ' + rk}>
                {Array.from({ length: Math.max(5, rk) }, (_, i) => <span key={i} className="hp-box" data-on={i < rk ? '1' : '0'} />)}
              </div>
              <NpcPaperPool charValue={sk.charValue} skillRank={rk} />
            </div>
          );
        })}</div>
        {paperNote ? <p className="nl-note">{paperNote}</p> : null}
      </div>
    </React.Fragment>
  );
}

/* Resolve vehicle weapons to structured weapon data */

function resolveVehicleWeapons(vehicle, refData) {
  // blob-retirement-2 (D-BR3): vehicle-library shard rows are BAKED at build (name /
  // damage / crit / range_label / skill / qualities_resolved) — the runtime oggdude
  // weaponsByKey join is DELETED. Quality + skill display via the canonical vocabs.
  if (!vehicle || !Array.isArray(vehicle.weapons)) return [];
  return vehicle.weapons.map(w => {
    const arcsObj = w.firing_arcs || {};
    const arcLabels = Object.entries(arcsObj).filter(([k, v]) => v === true).map(([k]) => k);
    const quals = (w.qualities_resolved || []).map(q => {
      const entry = refData && refData.qualities ? refData.qualities[String(q.key || '').toLowerCase()] : null;
      const label = entry ? entry.label : (q.key || '');
      return q.count ? label + ' ' + q.count : label;
    });
    return {
      name: w.name || w.key || 'Unknown',
      damage: w.damage != null ? w.damage : '-',
      crit: w.crit != null ? w.crit : '-',
      range: w.range_label || '-',
      skill: (window.SWItems && window.SWItems.skillName) ? (window.SWItems.skillName(w.skill) || '') : (w.skill || ''),
      qualities: quals,
      arcs: arcLabels.join(', ') || 'All',
      isVehicleWeapon: true,
      found: true,
    };
  });
}

/* ── WEAPON TABLE — structured display with database lookup ── */

function WeaponTable({ weaponNames, equipmentDesc, gear, accent, refData, vehicleWeapons, characteristics, npcSkills, groupSkillRank }) {

  const weapons = React.useMemo(() => {
    const personal = (!weaponNames || weaponNames.length === 0) ? [] : weaponNames.map(wName => {
      // CANONICAL NPC weapon (world-links-3): an id-ref string into the canonical
      // weapons registry, or an inline canonical profile ({damage:{value,base},...}).
      // Both project through the SHARED canonicalToStore — the same display core the
      // shop and player sheet use (one projection, no drift).
      const SWc = window.SWItems;
      if (SWc && refData && refData.canonWeapons && typeof wName === 'string' && refData.canonWeapons[wName]) {
        const d = SWc.canonicalToStore(refData.canonWeapons[wName], 'weapons');
        return { name: d.name, damage: d.damage != null ? d.damage : '–', crit: d.crit != null ? d.crit : '–',
                 range: d.range || '–', skill: d.skill || '', skillKey: d.skillKey || null, qualities: d.qualities || [], found: true,
                 raw: refData.canonWeapons[wName] };
      }
      // Ruling npc-weapons-misfiled-triage §1.2 — THE RENDER HALF of the misfiled-weapons bug.
      // The old condition also required `wName.damage`, so an inline weapon the compilation printed
      // WITHOUT damage numbers fell through to the prose-string lane below, resolved found:false, and
      // rendered NOTHING — the GM saw an NPC whose own equipment line named an ax and whose arsenal
      // was empty. An inline weapon object is a WEAPON whether or not it carries stats: the card
      // always renders, and the cells the source doesn't carry say '—' honestly.
      // (canonicalToStore is null-tolerant — `rec.damage || {}` — so a stats-less record is safe here.)
      if (SWc && wName && typeof wName === 'object' && wName.name) {
        const d = SWc.canonicalToStore(wName, 'weapons');
        return { name: d.name, damage: d.damage != null ? d.damage : '—', crit: d.crit != null ? d.crit : '—',
                 range: d.range || '—', skill: d.skill || '', skillKey: d.skillKey || null, qualities: d.qualities || [], found: true,
                 raw: wName };
      }
      // Legacy prose string (D-BR4): the oggdude name-catalog lookup is DELETED — live
      // records are canonical; pre-canonical history prose degrades READABLE through
      // parseWeaponString below (the ruled graceful lane), never crashes.
      const parsed = parseWeaponString(wName);
      if (parsed.parsed) {
        // Vet rules fix: embedded-format string doesn't carry Crit. For
        // lightsabers we default to Crit 1 (F&D CRB p.180) so Vader/Inquisitor
        // etc. don't render an em-dash where a real crit rating belongs.
        const isSaber = /lightsaber|shoto|lightwhip/i.test(parsed.name);
        return { name: parsed.name, damage: parsed.damage, crit: isSaber ? '1' : '–', range: parsed.range, skill: '', qualities: parsed.qualities ? parsed.qualities.split(', ') : [], found: true };
      }
      return { name: wName, damage: null, crit: null, range: null, skill: '', qualities: [], found: false };
    });
    // Append vehicle weapons if provided
    if (vehicleWeapons && vehicleWeapons.length > 0) {
      return personal.concat(vehicleWeapons);
    }
    return personal;
  }, [weaponNames, refData, vehicleWeapons]);
  const poolCoreIn = useNpcPoolCore();

  // B-31: gear can be the ONLY equipment (a custom minion with no weapons) — don't bail if it's present.
  const gearItems = Array.isArray(gear) ? gear.filter(g => g != null && String(g).trim() !== '') : [];
  if (weapons.length === 0 && !equipmentDesc && gearItems.length === 0) return null;

  // B-865 — the sheet's entry parts: name · skill, Damage / Critical / Range, the pool the weapon rolls
  // (its skill's characteristic at the record's rank — a minion line's group rank on the bench), the
  // qualities as marks. A weapon that resolves nowhere prints its name alone (the dark lane's rule).
  const vocab = (refData && refData.skillsVocab) || [];
  const chars = characteristics || {};
  const charOf = (sid) => { const v = vocab.find(x => x.id === sid); return v ? v.characteristic : null; };
  const hasSkill = (sid) => (Array.isArray(npcSkills) ? npcSkills : []).find(x => x && typeof x === 'object' && x.skill_ref === sid) || null;
  const found = weapons.filter(w => w.found);
  // B-34 (f100-triage-census-card ADDENDUM 8 Q1 (a)): an `equipmentDesc` that is the "Gear:" restatement of `gear[]` (138 of
  // the 139 weaponless NPCs that carry one) is the gear, printed once under GEAR — it opens no WEAPONS head. Any other
  // equipmentDesc (the Nardithi Nightsister's "Weapons: Unleash …") is weapon prose and keeps it.
  const descIsGear = /^\s*Gear:/i.test(equipmentDesc || '') && gearItems.length > 0;
  const weaponDesc = descIsGear ? null : equipmentDesc;
  return (
    <React.Fragment>
      {(weapons.length > 0 || weaponDesc) ? (
        <React.Fragment>
          <NpcPaperSechead head="WEAPONS" cite={String(weapons.length)} />
          <div className="hp-plate hp-bands" data-pad="data" data-npc-weapons="1">
            {weapons.map((w, i) => {
              if (!w.found) return <div key={i} className="sb-e"><div className="sb-e-h"><span className="sb-e-n">{w.name}</span></div></div>;
              const sk = hasSkill(w.skillKey);
              const ch = w.skillKey ? chars[charOf(w.skillKey) || ''] : null;
              const rk = sk ? (groupSkillRank != null ? groupSkillRank : (sk.rank || 0)) : 0;
              const meta = [w.skill || '', w.isVehicleWeapon && w.arcs ? w.arcs : ''].filter(Boolean).join(' · ');
              // B-1835: the encounter's plate's pool, through the same arm (encWeaponSpec → weaponPoolOf opts.npc) — the
              // weapon's Accurate/Inaccurate/Cumbersome folded; none until the core is in (Q-E), never a quality-blind stand-in
              const plate = w.skillKey && !w.isVehicleWeapon && ch != null && w.raw && poolCoreIn
                ? encPlatePool(encWeaponSpec({ skills: npcSkills, characteristics: chars }, { raw: w.raw, skillKey: w.skillKey, characteristic: charOf(w.skillKey) }, groupSkillRank, null))
                : null;
              return (
                <div key={i} className="sb-e" data-npc-weapon={w.name}>
                  <div className="sb-e-h"><span className="sb-e-n">{w.name}</span>{meta ? <span className="sb-e-m">{meta}</span> : null}</div>
                  <div className="sb-e-l">
                    <div>{NPC_SB_W.dmg} <b>{w.damage}</b></div><div>{NPC_SB_W.crit} <b>{w.crit}</b></div><div>{NPC_SB_W.range} <b>{w.range}</b></div>
                  </div>
                  {plate ? <NpcPaperPool pool={plate} /> : null}
                  {(w.qualities || []).length ? (
                    <div className="nl-pillset" style={{ marginTop: '8px' }}>{w.qualities.map((q, j) => <span key={j} className="sb-qual">{q}</span>)}</div>
                  ) : null}
                </div>
              );
            })}
            {/* B-946: the prose goes through the shared glyph pass the ability text uses (":boost:" draws as the die) */}
            {found.length === 0 && weaponDesc ? <p className="sb-e-t" style={{ margin: 0 }}>{npcPaperDesc(weaponDesc)}</p> : null}
          </div>
        </React.Fragment>
      ) : null}
      {gearItems.length > 0 ? (
        <React.Fragment>
          <NpcPaperSechead head="GEAR" cite={String(gearItems.length)} />
          <div className="hp-plate" data-pad="data"><p className="sb-e-t" style={{ margin: 0 }}>{npcPaperDesc(gearItems.join(' • '))}</p></div>
        </React.Fragment>
      ) : null}
    </React.Fragment>
  );
}

/* ── TALENT BLOCK — with description lookup ── */

// S1 (argo-a1-curation ADDENDUM 4; F7): the book line where an NPC's words were, in a copy without them. null on
// holocron.work; an NPC cites its `source` title, with no page.
function npcBookLine(rec) {
  const S = window.SWRPGSources;
  return S && S.removedLine && rec ? S.removedLine(rec) : null;
}
function TalentBlock({ talents, label, accent, refData, owner }) {
  if (!talents || talents.length === 0) return null;

  const lookupTalent = (nameStr) => {
    if (!refData || !refData.talents) return null;
    // Strip rank number and normalize curly apostrophes: "Nobody\u2019s Fool 2" → "nobody's fool"
    const baseName = nameStr.replace(/\s+\d+$/, '').toLowerCase().trim().replace(/[\u2018\u2019\u201A\u201B]/g, "'");
    if (refData.talents[baseName]) return refData.talents[baseName];
    // Strip parenthetical: "Parry (Improved) 5" → "parry (improved)" → try "parry"
    const noParens = baseName.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (noParens !== baseName && refData.talents[noParens]) return refData.talents[noParens];
    // Try with "improved" variant: "parry" → look for "parry (improved)" as a separate entry
    const improved = baseName.replace(/\s*\(improved\)\s*/gi, '').trim();
    if (improved !== baseName && refData.talents[improved]) return refData.talents[improved];
    // Partial match: try prefix matching for compound names like "Force Power: Enhance"
    const colonBase = baseName.split(':')[0].trim();
    if (colonBase !== baseName && refData.talents[colonBase]) return refData.talents[colonBase];
    // Suffix match: "Starship Adversary" → try each word as a potential talent name
    const words = baseName.split(/\s+/);
    for (let w = 1; w < words.length; w++) {
      const suffix = words.slice(w).join(' ');
      if (refData.talents[suffix]) return refData.talents[suffix];
    }
    return null;
  };

  // One reading of each row, printed by whichever face is up (the dark map below keeps its own copy of
  // these lines unchanged so its DOM does not move).
  const rowOf = (t) => {
    let nameStr = typeof t === 'string' ? t : (t.name || 'Unnamed');
    if (typeof t === 'object' && t && t.rank != null && t.rank > 0) nameStr += ' ' + t.rank;
    const inlineDesc = typeof t === 'string' ? '' : (t.description || '');
    const byRef = (typeof t === 'object' && t && t.talent_ref && refData && refData.talentsById) ? refData.talentsById[t.talent_ref] : null;
    const dbEntry = byRef || lookupTalent(nameStr);
    const act = dbEntry && dbEntry.activation
      ? (window.SWRPGUI.formatActivation ? window.SWRPGUI.formatActivation(dbEntry.activation) : String(dbEntry.activation)).toUpperCase() : null;
    return { nameStr: nameStr, act: act, description: inlineDesc || (dbEntry ? dbEntry.description : ''),
      book: npcBookLine(dbEntry || owner) };   // S1 (F7): the talent's own line, or the NPC's book for its own ability
  };
  return (
    <React.Fragment>
      <NpcPaperSechead head={label} cite={String(talents.length)} />
      <div className="hp-plate hp-bands" data-pad="data" data-npc-talents={label}>
        {talents.map((t, i) => {
          const r = rowOf(t);
          return (
            <div key={i} className="sb-e">
              <div className="sb-e-h"><span className="sb-e-n">{r.nameStr}</span>{r.act ? <span className="sb-e-m">{r.act}</span> : null}</div>
              {r.description ? <p className="sb-e-t">{npcPaperDesc(r.description)}</p>
                : r.book ? React.createElement(window.SWRPGUI.BookLine, { as: 'p', className: 'sb-e-t', line: r.book }) : null}
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

/* ── WOUND / STRAIN TRACKER ── */

/* ── VEHICLE PANEL — add/remove a vehicle with stats + weapons ── */

const VEHICLE_CATEGORIES = [
  { label: 'Starfighters', match: ['Starfighter', 'Cloud Car', 'Variable Geometry Self-Propelled Battle Droid'] },
  { label: 'Freighters', match: ['Freighter', 'Light Freighter', 'Bulk Freighter', 'Bulk Transport', 'Heavy Transport', 'Cargo Shuttle'] },
  { label: 'Capital Ships', match: ['Frigate', 'Corvette', 'Light Cruiser', 'Heavy Cruiser', 'Cruiser', 'Star Destroyer', 'Heavy Star Cruiser', 'Battleship', 'Battlecruiser', 'Carrier', 'Destroyer', 'Dreadnought', 'Star Battlecruiser', 'Bulk Cruiser', 'Patrol Cruiser'] },
  { label: 'Shuttles & Transports', match: ['Shuttle', 'Transport', 'Yacht', 'Courier', 'Scout Ship', 'Survey Vessel', 'Salon Pod', 'Boarding Vessel', 'Sloop', 'Cargo Skiff', 'Pursuit Craft', 'Troop Transport', 'Landing Ship', 'Assault Ship'] },
  { label: 'Gunships & Patrol', match: ['Gunship', 'Patrol Boat', 'Light Assault Transport', 'Armored Transport'] },
  { label: 'Airspeeders', match: ['Airspeeder', 'Heavy Assault Airspeeder', 'Recon Airspeeder', 'Transport Airspeeder', 'Combat Speeder', 'Air Skiff/Hauler', 'Swamp Speeder'] },
  { label: 'Landspeeders', match: ['Landspeeder', 'Heavy Landspeeder', 'Speeder Truck', 'Speeder Bike', 'Swoop', 'Groundcar', 'Repulsorsled', 'Cargo Floater', 'Personal Speeder', 'Foot Speeder', 'Wheel Bike', 'Podracer', 'Barge', 'Sail Barge', 'Heavy Cargo Loader', 'Aquaspeeder'] },
  { label: 'Walkers & Tanks', match: ['Walker', 'Heavy Assault Walker', 'Repulsor Tank', 'Armored Personnel Carrier', 'Personal Scout Walker', 'Tunneling Vehicle'] },
  { label: 'Stations & Other', match: ['Space Station', 'Mobile Space Dock', 'Mobile Refinery', 'Herd Ship', 'Field Equipment', 'Droid-Operated Vehicle', 'Submersible', 'Jet Pack', 'Jump Boots', 'Drop Suit', 'Rocket Boots', 'Drone', 'Orbital Assault Pod', 'Hyperdrive Sled', 'Hyperdrive Docking Ring', 'Racing Vessel', 'Science Vessel', 'Space-dwelling Creature'] },
];

// B-893 · B14 fix (1), BEHAVIOUR on both faces (ruling npc-paper-rows-5-7 A1 R-NPR57-11): every vehicle type
// reaches a pill — the catch-all pill ALSO takes every type no pill names (the five live orphans: Armored
// Fighting Vehicle, Droid Fighter, Droid Gunship, Droid Tank, Planetary Assault Ship; 33 → 38 records).
const VEHICLE_CATCHALL = 'Stations & Other';
const VEHICLE_NAMED_TYPES = new Set(VEHICLE_CATEGORIES.reduce((a, c) => a.concat(c.match.map(m => m.toLowerCase())), []));
function vehicleInCategory(cat, type) {
  const t = String(type || '').toLowerCase();
  return cat.match.some(m => m.toLowerCase() === t) || (cat.label === VEHICLE_CATCHALL && !VEHICLE_NAMED_TYPES.has(t));
}
const VEHICLE_PICK_CAP = 20;

// `aboardByKey` (the bench's craft block, B-893 fix (3) / R-NPR57-12): { <key>: N } for every key with an
// instance on the board, N the crew summed over its instances — DERIVED at render, never stored.
function VehiclePanel({ accent, refData, vehicle, onVehicleChange, aboardByKey }) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);
  const setVehicle = onVehicleChange || (() => {});

  const matchedVehicles = React.useMemo(() => {
    if (!refData || !refData.vehicles) return [];
    let pool = refData.vehicles;
    // Filter by category if selected (B-893 (1): the catch-all takes every type no pill names)
    if (selectedCategory) {
      const cat = VEHICLE_CATEGORIES.find(c => c.label === selectedCategory);
      if (cat) pool = pool.filter(v => vehicleInCategory(cat, v.type || v.Type));
    }
    // Filter by search text
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      pool = pool.filter(v => (v.name || v.Name || '').toLowerCase().includes(q));
    }
    // If neither filter is active, return empty (don't dump all 415)
    if (!selectedCategory && !searchText.trim()) return [];
    // stats_complete guard (D-BR3 cond 2): the library's 1 desc-only record is filtered
    // here explicitly — a card without stats can't render a stat block.
    pool = pool.filter(v => v.stats_complete !== false);
    return pool.slice().sort((a, b) => (a.name || a.Name || '').localeCompare(b.name || b.Name || ''));
  }, [refData, searchText, selectedCategory]);
  const filteredVehicles = matchedVehicles.slice(0, VEHICLE_PICK_CAP);   // sorted THEN capped (R-NPC-5c's order)

  if (!refData || !refData.vehicles) return null;

  // B-866 the door (+ ADD VEHICLE, the dashed quiet control); B-893 the ROOM it opens, B14a–d as drawn — the
  // vehicle island retired. The live rules kept: nothing listed until a pill or a
  // query; stats_complete; sorted then capped at 20; the 200px scroller; CANCEL; a row press adds and closes.
  // (2) the count in the search's words; (3) a key already on the board is marked (`data-selected`, and its
  // crew word `N ABOARD` when N > 0) and choosing it adds ANOTHER instance — the store's existing v6 shape.
  if (!vehicle) {
    if (!searchOpen) {
      return <button type="button" className="hp-quiet nl-wide nl-dashed" data-npc-add-vehicle="1" onClick={() => setSearchOpen(true)}>+ ADD VEHICLE</button>;
    }
    const aboard = aboardByKey || {};
    const listing = !!(selectedCategory || searchText.trim());
    const n = matchedVehicles.length;
    return (
      <div data-npc-vehicle-picker="1">
        <div className="nl-gap" />
        <input type="text" className="nl-in" value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="Search vehicles..." aria-label="Search vehicles..." autoFocus data-npc-vehicle-search="1" />
        <div className="nl-pills" style={{ marginTop: '8px' }}>
          {VEHICLE_CATEGORIES.map(cat => {
            const on = selectedCategory === cat.label;
            return <button key={cat.label} type="button" className="hp-quiet nl-pill" data-on={on ? '1' : '0'} aria-pressed={on ? 'true' : 'false'}
              data-npc-vehicle-cat={cat.label} onClick={() => setSelectedCategory(on ? null : cat.label)}>{cat.label}</button>;
          })}
        </div>
        {listing && n > 0 ? (
          <React.Fragment>
            <p className="nl-tier" style={{ margin: '10px 0 0' }} data-npc-count={n}>
              {(n > filteredVehicles.length ? filteredVehicles.length + ' of ' + n : n) + ' MATCH' + (n === 1 ? '' : 'ES')}</p>
            <div className="hp-index hp-bands" style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
              {filteredVehicles.map(v => {
                const key = v.key || v.name || v.Name;
                const has = Object.prototype.hasOwnProperty.call(aboard, key);
                const word = has && aboard[key] > 0 ? ' \u00B7 ' + aboard[key] + ' ABOARD' : '';
                const src = v.source || v.Source;
                return (
                  <button key={key} type="button" className="hp-row" data-selected={has ? '1' : '0'} data-npc-vehicle={key}
                    onClick={() => { setVehicle(v); setSearchOpen(false); setSearchText(''); }}>
                    <span className="hp-row-body"><span className="hp-row-desig">{v.name || v.Name}</span>
                      <span className="nl-tier">{(v.type || v.Type || '') + (src ? ' \u00B7 ' + src : '') + word}</span></span>
                    {v.silhouette != null ? <span className="hp-row-tab"><span className="nl-tier">{'SIL ' + v.silhouette}</span></span> : null}
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        ) : null}
        {searchText.trim() && n === 0 ? <p className="hp-none" style={{ margin: '8px 0 0' }}>No vehicles found.</p> : null}
        <div className="nl-acts">
          <button type="button" className="hp-quiet" onClick={() => { setSearchOpen(false); setSearchText(''); }}>CANCEL</button>
        </div>
      </div>
    );
  }
  const _vpTree = (
    <div style={{ marginTop: '14px' }}>
      {!vehicle && !searchOpen && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          style={{
            width: '100%', padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px dashed ${accent}33`,
            borderRadius: '6px', minHeight: '44px',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-sm)',
            letterSpacing: '0.1em', color: `${accent}77`,
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${accent}0A`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        >+ ADD VEHICLE</button>
      )}

      {/* Search picker */}
      {searchOpen && !vehicle && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${accent}22`,
          borderRadius: '6px',
        }}>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search vehicles..."
            autoFocus
            style={{
              width: '100%', padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${accent}33`,
              borderRadius: '4px',
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)',
              color: 'rgba(255,255,255,0.8)',
              outline: 'none', marginBottom: '8px',
              boxSizing: 'border-box',
            }}
          />
          {/* Category filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {VEHICLE_CATEGORIES.map(cat => {
              const isActive = selectedCategory === cat.label;
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setSelectedCategory(isActive ? null : cat.label)}
                  style={{
                    padding: '3px 8px',
                    background: isActive ? `${accent}20` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? accent + '55' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '12px',
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-xs)',
                    color: isActive ? accent : 'var(--text-faint)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >{cat.label}</button>
              );
            })}
          </div>
          {filteredVehicles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
              {filteredVehicles.map(v => (
                <button
                  key={v.key || v.name || v.Name}
                  type="button"
                  onClick={() => { setVehicle(v); setSearchOpen(false); setSearchText(''); }}
                  style={{
                    textAlign: 'left', padding: '8px 10px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${accent}15`,
                    borderRadius: '4px', cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${accent}10`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', color: 'rgba(255,255,255,0.85)' }}>
                    {v.name || v.Name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    {v.type || v.Type || ''}{(v.source || v.Source) ? ' \u00B7 ' + (v.source || v.Source) : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchText.trim() && filteredVehicles.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', padding: '8px 0' }}>
              No vehicles found.
            </div>
          )}
          <button
            type="button"
            onClick={() => { setSearchOpen(false); setSearchText(''); }}
            style={{
              marginTop: '6px', padding: '4px 10px',
              background: 'none', border: `1px solid ${accent}22`,
              borderRadius: '10px', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-xs)',
              color: `${accent}66`,
            }}
          >CANCEL</button>
        </div>
      )}

      {/* Vehicle display */}
      {vehicle && (
        <div style={{
          padding: '12px',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${accent}22`,
          borderRadius: '6px',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: '10px',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)',
                color: '#fff', letterSpacing: '0.03em',
              }}>{vehicle.name || vehicle.Name}</div>
              {(vehicle.type || vehicle.Type) && (
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                }}>{vehicle.type || vehicle.Type}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setVehicle(null); setExpanded(false); }}
              style={{
                padding: '4px 10px',
                background: 'rgba(255,100,100,0.1)',
                border: '1px solid rgba(255,100,100,0.3)',
                borderRadius: '10px', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-xs)',
                color: '#FF8A8A',
              }}
            >REMOVE</button>
          </div>

          {/* Key stats row */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {/* blob-retirement-2 C1: shard fields (attach state is ephemeral — no old-shape records exist) */}
            <StatBox label="SIL" value={vehicle.silhouette || 0} accent={accent} color={accent} />
            <StatBox label="SPEED" value={vehicle.speed || 0} accent={accent} color={accent} />
            <StatBox label="HANDLING" value={(vehicle.handling > 0 ? '+' : '') + (vehicle.handling || 0)} accent={accent} color={accent} />
          </div>

          {/* Expand info toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: '8px', padding: '4px 10px',
              background: 'none', border: `1px solid ${accent}22`,
              borderRadius: '10px', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-xs)',
              color: `${accent}66`,
            }}
          >{expanded ? 'COLLAPSE' : 'EXPAND DETAILS'}</button>

          {expanded && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                ['Crew', vehicle.crew],
                ['Passengers', vehicle.passengers],
                ['Encumbrance', vehicle.encumbrance_capacity],
                ['Sensor Range', vehicle.sensor_range_label],
                ['Consumables', vehicle.consumables],
                ['Hyperdrive', vehicle.hyperdrive_primary ? `Class ${vehicle.hyperdrive_primary}${vehicle.hyperdrive_backup ? ' / Backup Class ' + vehicle.hyperdrive_backup : ''}` : null],
                ['Hard Points', vehicle.hard_points_total],
                ['Source', vehicle.source],
              ].filter(([, v]) => v != null && v !== '' && v !== 0 && v !== '0').map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '3px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', color: 'rgba(255,255,255,0.6)' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
  return _vpTree;
}

/* ── NPC STAT RESOLVERS — ONE HOME (R-PFR-4, charter §8) ────────────────────────
 *
 * These two facts were each resolved by duplicated inline expressions across this file, and BOTH
 * duplications had shipped a defect.
 *
 * WOUND THRESHOLD — five copies, with DEFAULT DRIFT: `|| 5` at the two MINION sites and `|| 0` at
 * the three individual-card sites. The drift is not random (a minion's typical threshold is ~5),
 * but an invented 5 is indistinguishable from a real 5, so a data gap would have rendered as a
 * plausible number rather than a visible one. Verified against the shipped registry before
 * choosing: **1430 of 1430 NPCs carry a threshold and none is 0**, so the default is unreachable
 * on real data and its only job is to be honest when something is wrong. One default, and it is 0.
 *
 * DEFENSE — the unreported defect, and the worse one. `NpcStatsBlock` read `d.defense`, which
 * **0 of 1430** records carry; the real keys are `melee_defense` / `ranged_defense` (1430/1430).
 * So the desktop card's DEFENSE box rendered **0 for every NPC in the product** — a wrong number
 * shown with authority, which is worse than a blank. The phone tier cards already had the
 * correct fallback chain; this lifts THEIR implementation rather than writing a third (R-B106-1),
 * and the legacy `defence` array and flat `defense` scalar stay in the chain so older shapes read.
 */
function npcWoundThreshold(derived) {
  const d = derived || {};
  return (d.wounds != null ? d.wounds : d.woundThreshold) || 0;
}

// C-PFR34-2 — THE PAIR IS THE RESOLVER NOW, and that is a defect fix, not a tidy-up.
// `npcDefense` returned MELEE ONLY, and the two DESKTOP surfaces rendered it under a single box
// labelled "DEFENSE" — so at >=1024 a GM saw `DEFENSE 2` for an NPC whose ranged defence is 1, with
// the ranged value **not shown at all** and the melee value **mislabelled**. The phone had it right
// the whole time (`M.DEF 2 · R.DEF 1`), which is the shape the no-compromise-mirror law forbids:
// the same content composing WORSE at the bigger band.
// FOUND BY C-PFR34-2's BROWSER LEG — the condition the original lap skipped as "the ruling did not
// require it". A node test over the registry could not see it: the numbers were right, the RENDER
// dropped one of them. That is the entire argument for the condition.
// The fallback chain is the PHONE's, verbatim — it was the best implementation, so it becomes the
// shared one rather than a fourth variant (R-B106-1).
function npcDefensePair(derived) {
  const d = derived || {};
  if (d.melee_defense != null || d.ranged_defense != null) {
    return [d.melee_defense || 0, d.ranged_defense || 0];
  }
  if (Array.isArray(d.defence)) return [d.defence[0] || 0, d.defence[1] || 0];
  return [d.defense || 0, d.defense || 0];
}

/* ── MINION GROUP CARD ─────────────────────────────── */

/* ── RIVAL CARD ────────────────────────────────────── */

/* ── NEMESIS CARD (double-sided) ───────────────────── */

/* ── NPC TIER CARD ROUTER ──────────────────────────── */

/* ──────────────────────────────────────────────────────
   The stat block guts, extracted so the
   Encounter Generator could reuse per-cast-member rendering
   without duplicating ~200 lines. (That generator and its NpcReferenceView
   wrapper are both retired; the wrapper was DELETED in the talent-block
   restoration lap after a full sweep found no live mount.)

   Optional flags let the Encounter Generator hide sections
   it shows elsewhere (hooks are pooled + deduped across cast
   members and rendered in a single HOOKS section).
────────────────────────────────────────────────────── */

// ── F4 (ruling bench-board-followups-triage): the stat-block sections EXTRACTED as reusable BLOCKS so
//    the bench tabbed reference and the library long card compose ONE content source in two arrangements
//    (bench-tabbed · library-stacked) — 0015 central-source, not a re-authored card.
//    STATS: characteristics + combat + skills. `showVitals` shows the WOUNDS/STRAIN thresholds (library
//    card); the bench reference hides them (showVitals=false) — the BOARD tracks vitals, the reference teaches.
// SKILL CHART RESTORED (ruling npc-skill-chart-restoration §3). This block used to re-implement
// skills as bare name pills — no characteristic, no dice, and minion ranks SUPPRESSED because a
// pill could not know the group's count. `NpcSkillGrid` (:2059) always did all three jobs correctly
// for whoever called it; the F4 decomposition simply left it behind. Three findings (blank pills,
// rank suppression, the missing chart) had one root, closed by putting the component back.
// `groupStanding` is how many members are STILL UP — not the line's original size. The bench passes
// it; the library does not (a canon minion has no group, so it gets the plain rule instead of an
// invented rank).
//
// THE PROP IS NAMED FOR STANDING BECAUSE IT WAS ONCE NAMED FOR COUNT, and the name invited the bug:
// this component was fed `m.count` (the squad's ORIGINAL size), so the tabbed reference card's dice
// never changed as minions fell. A GM reading it at desktop saw four troopers' dice with one trooper
// left. Reported from a real table (ruling `bench-minion-skill-standing-triage`).
function NpcStatsBlock({ statBlock, tier, accent, showVitals, refData, groupStanding, paperTrack }) {
  const c = statBlock.characteristics || {};
  const d = statBlock.derived || {};
  const rawSkills = statBlock.skills;
  // The pill renderer that used to live here is DELETED (npc-skill-chart-restoration §3) along with
  // its label resolution — NpcSkillGrid does that itself, from the skills vocab, for both shapes. All
  // this block needs now is "are there any skills at all", which both shapes answer the same way.
  // (The blank-pill bug that prompted npc-skills-blank-triage was a symptom of this re-parse; the
  // chart never had it, because it never re-parsed.)
  const skillCount = Array.isArray(rawSkills) ? rawSkills.length : Object.keys(rawSkills || {}).length;
  const wounds = npcWoundThreshold(d);   // R-PFR-4: one home
  const strain = (d.strain != null ? d.strain : d.strainThreshold) || 0;
  const [meleeDef, rangedDef] = npcDefensePair(d);   // C-PFR34-2: was ONE box labelled DEFENSE
  const hasStrain = strain > 0 || tier === 'nemesis';
  const isMinion = tier === 'minion';
  // B-865 — the characteristic rail, the vitals as REFERENCE figures (no current, no control), the
  // Adversary mark under the defences, the skills (A9–A14).
  const adv = (Array.isArray(statBlock.talents) ? statBlock.talents : [])
    .find(t => t && typeof t === 'object' && t.talent_ref === NPC_ADVERSARY_REF && (t.rank || 0) > 0);
  const D = window.SWRPGDice;
  const thr = <span className="sb-of"> threshold</span>;
  const skillHead = isMinion ? 'SKILLS (GROUP)' : 'SKILLS';
  return (
    <React.Fragment>
      <NpcPaperSechead head="COMBAT PROFILE" />
      <div className="hp-railwrap"><div className="hp-plate" data-pad="snug"><div className="hp-rail" data-npc-chars="1">
        {NPC_SB_ORDER.map(k => (
          <div key={k} className="hp-char"><span className="hp-char-val"><span className="hp-char-bead">{c[k] ?? 2}</span></span>
            <span className="hp-char-lab">{k.toUpperCase()}</span></div>
        ))}
      </div></div></div>
      <div className="nl-gap" />
      <div className="hp-plate" data-pad="data" data-npc-vitals="1">
        <div className="sb-vit">
          {paperTrack ? (
            /* B7 — the flip card is where a phone GM marks wounds: the LIVE tracker, first, current / threshold. */
            <React.Fragment>
              {(() => {
                const wt = <NpcPaperTrack label={NPC_SB_W.wounds} track="wounds" cur={paperTrack.cur} max={wounds} stale={paperTrack.stale}
                  onDec={() => paperTrack.onW(paperTrack.cur - 1)} onInc={() => paperTrack.onW(paperTrack.cur + 1)}
                  decLabel={'Remove one wound from ' + paperTrack.who} incLabel={'Add one wound to ' + paperTrack.who} />;
                /* ENCOUNTERS E3 lap B (D-504): in an encounter the DAMAGE box sits in the wounds row; absent, today's row */
                return paperTrack.woundsExtra ? <div className="enc-wrow">{wt}{paperTrack.woundsExtra}</div> : wt;
              })()}
              {hasStrain ? (
                <NpcPaperTrack label={NPC_SB_W.strain} track="strain" cur={paperTrack.st} max={strain} stale={paperTrack.stale}
                  onDec={() => paperTrack.onS(paperTrack.st - 1)} onInc={() => paperTrack.onS(paperTrack.st + 1)}
                  decLabel={'Remove one strain from ' + paperTrack.who} incLabel={'Add one strain to ' + paperTrack.who} />
              ) : null}
            </React.Fragment>
          ) : null}
          <NpcPaperVitRow k={NPC_SB_W.soak}>{d.soak ?? 0}</NpcPaperVitRow>
          {showVitals && !paperTrack ? <NpcPaperVitRow k={NPC_SB_W.wounds}>{wounds}{thr}</NpcPaperVitRow> : null}
          {showVitals && !paperTrack && hasStrain ? <NpcPaperVitRow k={NPC_SB_W.strain}>{strain}{thr}</NpcPaperVitRow> : null}
          {showVitals && !paperTrack && !hasStrain && tier === 'rival' ? <NpcPaperVitRow k={NPC_SB_W.strain}><span className="hp-none">N/A</span></NpcPaperVitRow> : null}
          <NpcPaperVitRow k={NPC_SB_W.mdef}>{meleeDef}</NpcPaperVitRow>
          <NpcPaperVitRow k={NPC_SB_W.rdef}>{rangedDef}</NpcPaperVitRow>
          {adv ? (
            <NpcPaperVitRow k={(adv.name || 'Adversary') + ' ' + adv.rank}
              extra={{ className: 'sb-vitrow nl-adv', 'data-npc-adversary': String(adv.rank),
                       title: npcAdversarySentence(adv.rank), 'aria-label': npcAdversarySentence(adv.rank) }}>
              {D && D.symbolSpan ? Array.from({ length: adv.rank }, (_, i) => D.symbolSpan('challenge', 'adv' + i, 1)) : null}
            </NpcPaperVitRow>
          ) : null}
        </div>
        {/* B-1653 (R7 ADDENDUM 399): RAW — a rival's strain is suffered as wounds (EotE p.390; AoR p.410; F&D p.400). Q-1 (401):
            a rival whose record prints a strain threshold is one the GM tracks strain on (EotE p.390), so the note is not drawn */}
        {showVitals && !paperTrack && tier === 'rival' && !hasStrain ? <p className="nl-note">Rivals don't track strain. Strain they would suffer is taken as wounds instead.</p> : null}
      </div>
      {paperTrack && paperTrack.after ? <div className="enc-after">{paperTrack.after}</div> : null}{/* E3 lap B: the roll row and crits under the plate (F8) */}
      {skillCount === 0 ? (
        <React.Fragment>
          <NpcPaperSechead head={skillHead} />
          <div className="hp-plate" data-pad="data"><p className="hp-none" style={{ margin: 0 }}>None.</p></div>
        </React.Fragment>
      ) : (
        <NpcSkillGrid skills={statBlock.skills} characteristics={statBlock.characteristics} isGroup={isMinion}
          groupSkillRank={isMinion && groupStanding != null ? BenchStore.minionGroupRanks(groupStanding) : null}
          accent={accent} refData={refData} paperHead={skillHead}
          paperNote={isMinion && groupStanding == null ? 'Group skills: ranks = members − 1. Add this group to an encounter to see its actual dice.' : null} />
      )}
    </React.Fragment>
  );
}

// ARSENAL: weapons · gear · talents · abilities. T2 (ruling bench-refinements-triage): weapons render
// via the SHARED WeaponTable — the SAME structured presentation the sheet + tier cards use (name · damage ·
// crit · range + quality chips, via canonicalToStore), prose only as WeaponTable's own fallback. No-
// compromise-mirror: one weapon-display core, not a bench-local paragraph. (WeaponTable renders gear too.)
function NpcArsenalBlock({ statBlock, accent, refData, vehicleWeapons, groupSkillRank }) {
  const talents = Array.isArray(statBlock.talents) ? statBlock.talents : [];
  const abilities = Array.isArray(statBlock.abilities) ? statBlock.abilities : [];
  const hasArms = (statBlock.weapons && statBlock.weapons.length) || statBlock.equipmentDesc || (statBlock.gear && statBlock.gear.length);
  const empty = !hasArms && talents.length === 0 && abilities.length === 0;
  if (empty) return <div className="hp-plate" data-pad="data"><p className="hp-none" style={{ margin: 0 }}>No gear, weapons, or talents listed.</p></div>;
  return (
    <React.Fragment>
      <WeaponTable weaponNames={statBlock.weapons} equipmentDesc={statBlock.equipmentDesc} gear={statBlock.gear} accent={accent}
        refData={refData} vehicleWeapons={vehicleWeapons} characteristics={statBlock.characteristics} npcSkills={statBlock.skills}
        groupSkillRank={groupSkillRank} />
      <TalentBlock talents={statBlock.talents} label="TALENTS" accent={accent} refData={refData} owner={statBlock} />
      <TalentBlock talents={statBlock.abilities} label="ABILITIES" accent={accent} refData={refData} owner={statBlock} />
    </React.Fragment>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE STAT BLOCK ON PAPER (B-865 · NPC 4/9) — frames A9–A15 · A26 · C11, lab `5b3fff79`, ruling
   `npc-library-paper-concept` R-NPC-2/-3/-5b/-8/-11. ONE TREE over the union of the phone tier cards
   and the desk's tabbed card (F11): SOURCE on the head at every width, the thresholds as reference
   figures with NO tracker (Jason 2026-09-23: "Wound tracking happens in the encounter page"), the
   Adversary row under the defences, DISPOSITION in LORE on the store. Stacked below 1024; three panels
   at 1024 and up (A26 — the tablist arm is not reached on the paper reference, R-NPC-11). The drawing
   components below are the ones the dark faces called until B-871; every number comes from the
   helpers the dark tree used (npcWoundThreshold,
   npcDefensePair, ffgDicePool, canonicalToStore through WeaponTable, the skills vocab).
══════════════════════════════════════════════════════════════════════════════════════════════ */
// The SHEET's words for the parts it lends (the board reads them from the approved sheet's generator).
const NPC_SB_W = { soak: 'Soak', wounds: 'Wounds', strain: 'Strain', mdef: 'Melee Defence', rdef: 'Ranged Defence',
  dmg: 'Damage', crit: 'Critical', range: 'Range' };
const NPC_SB_ORDER = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
// The phone card header's tier words (the dark card header's tierLabel, read by the board from source).
const NPC_CARD_TIER = { minion: 'MINION GROUP', rival: 'RIVAL', nemesis: 'NEMESIS' };
// R-NPC-5b — the Adversary row is a MARK: its glyphs are one challenge die per rank (the board's law),
// its words are the book's: each rank upgrades the difficulty of combat checks aimed at this character
// once (Edge of the Empire Core Rulebook p.132, read at the ruling). ffgDicePool is
// NOT extended — nothing on this surface builds a check.
const NPC_ADVERSARY_REF = 'adversary';
function npcAdversarySentence(rank) {
  return 'Upgrade the difficulty of combat checks against this NPC ' + rank + ' time' + (rank === 1 ? '' : 's')
    + ' (Adversary — Edge of the Empire Core Rulebook p.132)';
}

// A skill's proficiency/ability pool in the app's own glyphs (the sheet's `sheetPoolFor` renderer), its counts
// from the NPC's own `ffgDicePool` — one resolution path for the number. A WEAPON row hands `pool` instead: the plate
// projection of `SWRPGSheetPool.weaponPoolOf`'s NPC arm (B-1835; `ffgDicePool` is not a pool path for a weapon roll, R-E3NP-R2).
function npcPoolCoreIn() {
  const SP = window.SWRPGSheetPool;
  return !!(SP && SP.weaponPoolOf && window.SWRPGPoolMods && window.SWRPGQualityRows && window._qualitiesDb);
}
// true once the weapon pool path's core is in; asks the host's loader (NpcPoolCoreCtx) once if it is not. R-B1835-R1: the
// state OR a LIVE read each render — the player has no loader and lands its vocabulary late (fetchQualities), so the host's
// own re-render must find it in
function useNpcPoolCore() {
  const load = React.useContext(NpcPoolCoreCtx);
  const [ready, setReady] = useState(npcPoolCoreIn);
  const live = ready || npcPoolCoreIn();
  useEffect(() => {
    if (live || !load) return undefined;
    let alive = true;
    Promise.resolve(load()).then(ok => { if (alive && ok) setReady(npcPoolCoreIn()); });
    return () => { alive = false; };
  }, [live, load]);
  return live;
}
function NpcPaperPool({ charValue, skillRank, pool: given }) {
  const D = window.SWRPGDice;
  if (given) return D && D.renderPool ? <div className="sb-pool">{D.renderPool(given, { size: 1 })}</div> : null;
  const pool = ffgDicePool(charValue, skillRank);
  if (!pool.length || !D || !D.renderPool) return null;
  const p = pool.filter(t => t === 'proficiency').length;
  return <div className="sb-pool">{D.renderPool({ proficiency: p, ability: pool.length - p }, { size: 1 })}</div>;
}

// renderDescription's glyph tokens as the paper's `hp-sym` marks (the shared SYMBOLS table), the same
// cleaning and the same token grammar; unknown tokens print as written.
function npcPaperDesc(text) {
  if (!text) return null;
  const D = window.SWRPGDice;
  const cleaned = String(text)
    .replace(/\[H\d\].*?\[h\d\]\s*/gi, '')
    .replace(/\[p\]/gi, '\n')
    .replace(/\[br\]/gi, '\n')
    .replace(/\[B\](.*?)\[b\]/gi, '$1')
    .replace(/\[I\](.*?)\[i\]/gi, '$1')
    .replace(/^\s+/, '').trim();
  const parts = [];
  const regex = /:(\w+):|(?:\[([A-Z]{2})\])/g;
  let m, last = 0, idx = 0;
  while ((m = regex.exec(cleaned)) !== null) {
    if (m.index > last) parts.push(cleaned.substring(last, m.index));
    const tk = m[1] || ((D && D.BRACKET_TOKENS) || {})[m[2]];
    const k = tk ? String(tk).toLowerCase() : null;
    const symKey = k ? (DIFFICULTY_NAMES[k] ? 'difficulty' : (GM_SYMBOL_ALIASES[k] || k)) : null;
    const times = k && DIFFICULTY_NAMES[k] ? DIFFICULTY_NAMES[k] : 1;
    if (symKey && D && D.symbolSpan && D.SYMBOLS && D.SYMBOLS[symKey]) {
      // D-447 (ADDENDUM 441 item 3): the stat block's Force family by fill, through this ONE symbolSpan call — no second parser
      for (let r = 0; r < times; r++) parts.push(D.symbolSpan(symKey, 'g' + (idx++), 1, { fill: true }));
    } else {
      parts.push(m[0]);
    }
    last = regex.lastIndex;
  }
  if (last < cleaned.length) parts.push(cleaned.substring(last));
  return parts;
}

function NpcPaperVitRow({ k, children, extra }) {
  return <div className="sb-vitrow" {...(extra || {})}><div className="sb-vitkey">{k}</div><div className="sb-vitval">{children}</div></div>;
}

// The LORE face: the dossier prose, and — for a nemesis — the faction's descriptor and the
// intelligence file (the phone nemesis card's DOSSIER page, now part of the one tree), then the
// disposition (the library's; the bench and a custom's threat face carry none).
function NpcPaperLore({ statBlock, tier, factionProfiles, name, dispositionEl }) {
  const fp = factionProfiles && statBlock.affiliation ? factionProfiles[statBlock.affiliation] || null : null;
  const nm = (name || statBlock.name || '').toLowerCase();
  const intel = fp && Array.isArray(fp.prominent_figures)
    ? fp.prominent_figures.find(f => (f.name || '').toLowerCase() === nm) || null : null;
  const nemesis = tier === 'nemesis';
  return (
    <React.Fragment>
      {statBlock.description ? (
        <React.Fragment>
          <NpcPaperSechead head="DOSSIER" />
          <div className="hp-plate" data-pad="read"><NpcPaperLoreUnits field={statBlock.description} /></div>
        </React.Fragment>
      ) : npcBookLine(statBlock) ? (
        <React.Fragment>
          <NpcPaperSechead head="DOSSIER" />
          <div className="hp-plate" data-pad="read">{React.createElement(window.SWRPGUI.BookLine, { as: 'p', className: 'hp-prose', style: { margin: 0 }, line: npcBookLine(statBlock) })}</div>
        </React.Fragment>
      ) : null}
      {nemesis && fp && fp.short_descriptor ? (
        <React.Fragment>
          <NpcPaperSechead head={'FACTION: ' + (fp.name || '').toUpperCase()} />
          <div className="hp-plate" data-pad="read"><p className="hp-prose" style={{ margin: 0 }}>{fp.short_descriptor}</p></div>
        </React.Fragment>
      ) : null}
      {nemesis && intel ? (
        <React.Fragment>
          <NpcPaperSechead head="INTELLIGENCE FILE" />
          <div className="hp-plate" data-pad="read" data-npc-intel="1">
            {intel.role ? <div className="nl-tier" style={{ marginBottom: '8px' }}>{intel.role}{intel.suggested_tier ? ' · ' + String(intel.suggested_tier).toUpperCase() : ''}</div> : null}
            {intel.network_assessment ? <p className="hp-prose" style={{ margin: '0 0 10px' }}>{intel.network_assessment}</p> : null}
            {intel.notes ? <p className="hp-prose" style={{ margin: 0 }}>{intel.notes}</p> : null}
          </div>
        </React.Fragment>
      ) : null}
      {dispositionEl || null}
    </React.Fragment>
  );
}

// ── PAPER N6 · THE NPC VEHICLE DOSSIER (ruling `paper-npc-vehicle-dossier-concept` R-NVD-C2; the board
// `lab/holocron/npc_vessel.html` @ b0d578e1, LAW by D-107). READ-ONLY: the ships the Yard's store holds under
// `npc:<owner>`, drawn with the Yard's own parts (`SWRPGVesselView.YardParts`) inside the sheet VESSELS face's
// wrapper (`yd yd-in`), on the NPC face's plate, and numbered by the one resolver. Nothing in it can be pressed,
// and nothing is re-implemented here: a part the export lacks is added TO the export (vesselView.jsx).
function npcCraftOwned(state, owner) {
  const VS = window.SWRPGVessels;
  return VS && state && owner ? VS.forOwner(state, 'npc:' + owner) : [];
}
function NpcCraftBlock({ owner, refData, withHead }) {
  const VV = window.SWRPGVesselView, VS = window.SWRPGVessels, R = window.SWRPGVesselResolve;
  const P = VV && VV.YardParts;
  // both hosts load the Yard's scripts before they mount (index.html), so these hooks run on every render or on none
  const reg = P ? P.useRegistries() : null;
  const att = P ? P.useAttachmentsLoad() : null;
  const state = VS ? VS.useVessels() : null;
  const own = npcCraftOwned(state, owner);
  if (!P || !R || !own.length) return null;
  const rctx = Object.assign({}, VV.deviceResolveCtx([]), { attachments: (att && att.by) || null });
  return (
    <React.Fragment>
      {withHead ? <NpcPaperSechead head="CRAFT" /> : null}
      <div className="hp-plate nl-craft" data-pad="data">
        <div className="yd yd-in" data-testid="npc-craft" role="region" aria-label="Craft, read only">
          {own.map((rec) => {
            const vrow = craftVehicle(refData, rec);
            const res = vrow ? R.resolve(rec, vrow, rctx) : null;
            const lost = !!rec.destroyed;
            const crip = !lost && P.isCrippled(rec, res);
            const name = P.shipName(rec, vrow);
            return (
              <article className="y-vship" key={rec.id} data-vessel={rec.id} data-testid="npc-craft-ship">
                <P.Art rec={rec} vrow={vrow} host="npc-craft" cls="y-vship-art" schem={38} alt={name} />
                <div className="y-vship-b">
                  <div className="y-row">
                    <h3 className="y-ship-n">{String(name).toUpperCase()}</h3>
                    {lost ? <P.Stamp k="lost">LOST</P.Stamp> : null}
                    {crip ? <P.Stamp k="state">CRIPPLED</P.Stamp> : null}
                  </div>
                  <P.HullType rec={rec} vrow={vrow} res={res} />
                  {res ? (
                    <div className="y-cond" data-testid="npc-craft-moves">
                      <span>SPEED <b>{res.speed != null ? res.speed : '—'}</b></span>
                      <span>HANDLING <b>{res.handling != null ? P.fitSign(res.handling) : '—'}</b></span>
                    </div>
                  ) : null}
                  {lost ? <P.LostLine when={rec.destroyed.when} /> : <P.Cond rec={rec} res={res} both />}
                  {crip ? <div data-testid="npc-craft-crippled"><P.CripLine ht={res.hull_threshold} /></div> : null}
                  <P.LastCrit rec={rec} reg={reg} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </React.Fragment>
  );
}

// THE ONE TREE. `arrange`: 'stack' | 'panels'. `ctx`: 'library' (the reference) today; the bench pane
// and the flip card (rows 5 and 7) mount the same faces.
function NpcPaperStatBlock({ rend, tier, refData, factionProfiles, name, arrange, ctx, dispositionEl, foot, groupStanding, vehicleWeapons, track, owner }) {
  const [tab, setTab] = React.useState('stats');   // the 'tabs' arrangement (the bench pane / overlay): STATS first
  // PAPER N6 (R-NVD-C2): the Yard's store, read once and unconditionally — above the early return, so hook order holds.
  // `owner` is the NPC's `_source_key`, passed by the library mount alone (the rendered `rend` does not carry it).
  const _vessels = window.SWRPGVessels, vesselState = _vessels ? _vessels.useVessels() : null;
  if (!rend) return null;
  tier = (tier || rend.tier || 'rival').toLowerCase();
  if (tier !== 'minion' && tier !== 'nemesis') tier = 'rival';
  const library = (ctx || 'library') === 'library';
  const hasLore = tier === 'minion' ? !!rend.description : (library || !!rend.description);
  const ownsCraft = library && npcCraftOwned(vesselState, owner).length > 0;   // N6: CRAFT only when the NPC owns a ship
  const faces = [['stats', 'STATS'], ['arsenal', 'ARSENAL']].concat(ownsCraft ? [['craft', 'CRAFT']] : []).concat(hasLore ? [['lore', 'LORE']] : []);
  const path = Array.isArray(rend.affiliation_path) ? rend.affiliation_path : [];
  const aff = String((path.length ? path[path.length - 1] : rend.affiliation) || '').replace(/_/g, ' ').toUpperCase();
  const src = String(rend.source || '').trim();
  const body = {
    stats: <NpcStatsBlock statBlock={rend} tier={tier} showVitals={ctx !== 'bench'} refData={refData} groupStanding={groupStanding} paperTrack={track} />,
    arsenal: <NpcArsenalBlock statBlock={rend} refData={refData} vehicleWeapons={vehicleWeapons}
      groupSkillRank={tier === 'minion' && groupStanding != null ? BenchStore.minionGroupRanks(groupStanding) : null} />,
    lore: <NpcPaperLore statBlock={rend} tier={tier} factionProfiles={factionProfiles} name={name} dispositionEl={library ? dispositionEl : null} />,
    craft: ownsCraft ? <NpcCraftBlock owner={owner} refData={refData} /> : null,
  };
  return (
    <div className="sb-surface nl-sbs" data-npc-statblock={tier} data-npc-arrange={arrange} data-npc-craft={ownsCraft ? '1' : undefined}>
      <div className="sbwrap">
        <div className="hp-maker">{[aff, NPC_CARD_TIER[tier]].filter(Boolean).join(' · ')}</div>
        <h1 className="hp-desig nl-d2">{name || rend.name || ''}</h1>
        <div className="hp-desig-rule" />
        {src ? <div className="nl-srcline" data-npc-source="1"><span className="hp-cite">{'SOURCE · '}{src.toUpperCase()}</span></div> : null}
        {arrange === 'panels' ? (
          <div className="nl-panels" data-n={faces.length} data-testid="npc-panels" role="group" aria-label="Reference panels">
            {faces.map(([id, label]) => (
              <section key={id} data-testid={'npc-panel-' + id} aria-label={label}><h3>{label}</h3>{body[id]}</section>
            ))}
          </div>
        ) : arrange === 'tabs' ? (
          <React.Fragment>
            <div className="nl-tabrow" role="tablist" aria-label="Reference sections">
              {faces.map(([id, label]) => {
                const on = (faces.some(f => f[0] === tab) ? tab : 'stats') === id;
                return (
                  <button key={id} type="button" className="nl-tab" role="tab" data-on={on ? '1' : '0'} aria-selected={on ? 'true' : 'false'}
                    data-testid={'bench-ref-tab-' + id} onClick={() => setTab(id)}>{label}</button>
                );
              })}
            </div>
            <div data-testid="bench-ref-tabbody">{body[faces.some(f => f[0] === tab) ? tab : 'stats']}</div>
          </React.Fragment>
        ) : (
          <div className="nl-stack" data-testid="npc-stack">
            {faces.map(([id, label]) => (
              <section key={id} data-testid={'npc-panel-' + id} aria-label={label}><h3>{label}</h3>{body[id]}</section>
            ))}
          </div>
        )}
        {foot || null}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   DispositionSelector — Chunk 8; B-863 (ruling npc-library-paper-concept R-NPC-3)
   Six-pill row for the FFG disposition spectrum (allied → enemy) and the current sentence — and
   nothing else. A press on a pill (other than the current one) SETS the word, which the kernel
   writes through `NpcDispositionStore` (one word per NPC, under the store's own KEY). The reason
   input, CONFIRM / CANCEL and the rendered history list are RETIRED: none of them was ever saved
   (census §3 item 17), and the approved board draws the pills and the sentence alone (R-NPC-2).
   A stale (version-ahead) file recedes the pills, read from `NpcDispositionCtx`.
────────────────────────────────────────────────────── */

function DispositionSelector({ disposition, onChange, accent, readOnly }) {
  const dispCtx = React.useContext(NpcDispositionCtx);
  const current = DISPOSITIONS.find(d => d.id === disposition) || DISPOSITIONS[2];  // default neutral

  const handlePillClick = (id) => {
    if (readOnly) return;            // R6 PICK (ruling release-r6-ui-c0 U10, L31): a player's pick never writes the GM's record
    if (id === disposition) return;  // tapping the current one is a no-op
    onChange(id);
  };

  // B-865 / R-NPC-3 — the six pills and the current sentence, on the store; a stale file recedes the
  // pills' row exactly as the dark face's does.
  const stale = !!(dispCtx && dispCtx.stale);
  return (
    <React.Fragment>
      <NpcPaperSechead head="DISPOSITION" />
      <div className="hp-plate" data-pad="data" data-npc-disposition={current.id}>
        <p className="nl-note" style={{ margin: '0 0 10px' }}>
          <b>{current.label.charAt(0) + current.label.slice(1).toLowerCase()}</b>
        </p>
        <div className="nl-pills" style={stale ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
          {DISPOSITIONS.map(d => (
            <button key={d.id} type="button" className="hp-quiet nl-pill" data-on={d.id === current.id ? '1' : '0'}
              aria-pressed={d.id === current.id ? 'true' : 'false'} aria-disabled={readOnly ? 'true' : undefined}
              onClick={() => handlePillClick(d.id)}>{d.label}</button>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   NpcRecentView — the repurposed HISTORY tab (ruling custom-npc-tab-space-triage Addendum 1 §C)

   WAS: a saved-NPC list held in React state, written by ONE control that renders on the phone
   layout alone. So at desktop the tab could not be filled at all — and its own empty copy told you
   to tap SAVE TO HISTORY ✓, a button that is not on that band. It also emptied on every reload.

   IS: RECENT. Opening any NPC detail — canon or custom, on any band — is the write. The tab fills
   itself with no new affordance, which is the whole reason this repurpose beat "persist the old
   one": it needs no door of its own. Entries are id-refs resolved live by the host, so a renamed or
   deleted NPC drops out instead of rendering a stale snapshot (the old view rendered snapshots,
   which is why a saved NPC could disagree with the library it came from).

   CLEAR survives as the one operation; the per-row delete does NOT — a recents list you have to
   groom is a chore, and the cap already evicts. (Subtraction, disclosed at the gate.)
   ═══════════════════════════════════════════════════════════════════════════ */
function NpcRecentView({ npcs, onOpenEntry, onClearAll, accent }) {
  const [confirmClear, setConfirmClear] = useState(false);
  // Clear is two taps (the one operation the tab keeps) — one handler, both faces.
  const onClearPress = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
    } else {
      onClearAll();
      setConfirmClear(false);
    }
  };

  return <NpcPaperRecent npcs={npcs} onOpenEntry={onOpenEntry} confirmClear={confirmClear} onClearPress={onClearPress} />;
}


/* UXQP-37: backend-honesty note. PARTY (forever-wait), WORKSHOP (silent no-op
   server edits) and the published-store sync all depend on the LAN/backend that
   is dormant in prod. One consistent adjudicated line names that, replacing silent
   emptiness — and marks the seam where the lobby/backend work (LOBBY_ROADMAP)
   plugs in. The lead line is identical everywhere; `children` adds surface context. */

/* ──────────────────────────────────────────────────────
   NpcBenchGroupsView — the NPC bench ("paper that remembers").
   GM-authored groups of library NPCs whose wound/strain state PERSISTS
   (localStorage via window.NpcBenchStore). Browse → save a group → flip
   between members at the table; each member's tracker remembers across
   navigation + reload. Ruling npc-bench-scope: D-NB1 (persist live state),
   R-NBS3 (state core in this shared module).
   v1 = persistence + groups + flip + heal-all reset + graceful stale refs.
   Fast-follow (deferred): minion shared-pool UI (D-NB2), per-member/group notes.
────────────────────────────────────────────────────── */

// Tap-to-edit notes row (blur-saves). Used for group notes + per-member notes on the bench.
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE BENCH ON PAPER (B-866 · NPC 5/9) — frames B1–B6 · B12 · B13, lab `5b3fff79`, ruling
   `npc-library-paper-concept` R-NPC-5d/-8. The store, the one-core ops (`poolView`, `wsRead`,
   `setW`/`setS`, `bumpLine`, `bumpCount`) and every testid were the dark face's, kept whole when it was
   deleted (B-871). Wounds read CURRENT / THRESHOLD everywhere
   (R-NPC-5d). The phone FLIP (B7–B9) is row 7's and stays on its island until then.
══════════════════════════════════════════════════════════════════════════════════════════════ */
const NPC_DOWN_WORD = 'Incapacitated';   // the sheet's DOWN word (the board reads it from the sheet's generator)
const NPC_DANGER = [1, 0.7, 0.4];        // the dark tracker's bands, the product's own (the board pins them)

// A band from a current value against a threshold, and the RAW edge (PAST the threshold — EotE p.216).
function npcBandOf(cur, max) {
  const r = max ? cur / max : 0;
  const band = r >= NPC_DANGER[0] ? 3 : r >= NPC_DANGER[1] ? 2 : r >= NPC_DANGER[2] ? 1 : 0;
  return { band: band, down: max > 0 && cur > max };
}

// THE SHEET'S TRACKER (`sb-vitrow` + `sb-meter` + `sb-trk`), in the law's order: current / threshold.
// Card `shipyard-encounter-craft-build` (PAPER's grant, ADDENDUM 1 G1/G2): three opt-in props for the bench's craft row, and
// no NPC caller passes any of them, so every NPC track draws as before. `down` is the caller's own DOWN test (the Yard's
// isCrippled / isSystemsDown) and `downWord` its word; `uncapped` prints the stored value past 2 × threshold (R-SECF-5: a
// craft's hull has no ceiling in the Yard, Δ6, so the bench prints the same one number). The default keeps R-NFST-1's clamp.
function NpcPaperTrack({ label, cur, max, compact, stale, onDec, onInc, decLabel, incLabel, track, down, downWord, uncapped }) {
  // R-NFST-1 (ruling `npc-flip-ledger-stops`; R-NBS2's canon-drift guard): EVERY paper tracker (the ledger's and the
  // card's BenchWSBar, the flip card's stat-block track, the minion pool) renders the persisted current clamped to the
  // freshly-resolved threshold through the ONE core, as the dark tracker did — a record whose threshold dropped under
  // a saved value never prints "999 / 12". The render does not rewrite the store; the next write clamps.
  cur = uncapped ? Math.max(0, cur || 0) : BenchStore.clampCurrent(cur, max);
  const b = npcBandOf(cur, max);
  if (down != null) b.down = !!down;
  const pct = max ? Math.max(0, Math.min(100, Math.round(cur * 100 / max))) : 0;
  const dis = stale ? { disabled: true, 'aria-disabled': 'true', style: { opacity: 0.4, pointerEvents: 'none' } } : {};
  return (
    <div className="sb-vitrow" data-state={b.down ? 'down' : (b.band >= 2 ? 'pressed' : 'clear')} data-band={b.down ? 3 : b.band}
      data-track={track || (label || '').toLowerCase()}>
      <div>
        {compact ? null : <div className="sb-vitkey">{label}</div>}
        <div className="sb-meter"><i style={{ width: pct + '%' }} /></div>
        {b.down ? <div className="sb-vitword">{downWord || NPC_DOWN_WORD}</div> : null}
      </div>
      <div className="sb-trk">
        <button type="button" className="sb-trk-btn" aria-label={decLabel} onClick={(e) => { e.stopPropagation(); onDec(); }} {...dis}>−</button>
        <span className="sb-vitval sb-trk-val">{cur}<span className="sb-of"> / {max}</span></span>
        <button type="button" className="sb-trk-btn" aria-label={incLabel} onClick={(e) => { e.stopPropagation(); onInc(); }} {...dis}>+</button>
      </div>
    </div>
  );
}

// The row actions, ranked below the steppers: bare glyphs, each a 44×44 hit area (▲ ▼ ×).
function NpcPaperRowGlyphs({ label, onUp, onDown, upDisabled, downDisabled, onRemove, cls }) {
  return (
    <span className={cls || 'nl-glyphs'}>
      <button type="button" className="nl-glyph" aria-label={'Move up: ' + label} disabled={upDisabled}
        onClick={(e) => { e.stopPropagation(); onUp(); }}>▲</button>
      <button type="button" className="nl-glyph" aria-label={'Move down: ' + label} disabled={downDisabled}
        onClick={(e) => { e.stopPropagation(); onDown(); }}>▼</button>
      <button type="button" className="nl-glyph" data-g="x" aria-label={'Remove ' + label}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
    </span>
  );
}

function NotesRow({ value, onSave, accent, label, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  const commit = () => { setEditing(false); if ((draft || '') !== (value || '')) onSave(draft); };
  return editing ? (
    <textarea className="nl-in" autoFocus value={draft} aria-label={label || 'Notes'} placeholder={placeholder || 'Notes…'}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); }} style={{ width: '100%', minHeight: '54px' }} />
  ) : (
    <button type="button" className="nl-notes" onClick={() => setEditing(true)}
      aria-label={(label || 'Notes') + (value ? ': ' + value : ' — add')}>
      <span aria-hidden="true">✎</span><span>{value ? value : (placeholder || 'Add notes…')}</span>
    </button>
  );
}

// ── F2 (ruling bench-board-followups-triage): the bench's input-hosting pieces live at MODULE SCOPE,
//    NOT inside NpcBenchGroupsView's render. Defining a component inside a render gives it a NEW identity
//    every keystroke → React remounts the subtree → the <input> loses focus after each letter (the
//    one-letter-typing bug). Hoisted here with a `ctx` bundle: a fresh ctx object per render is a
//    re-render (props update, focus KEPT), never a remount. ── the textbook fix, done once.
var BENCH_COND_SET = [['staggered', 'STAGGERED'], ['disoriented', 'DISORIENTED'], ['immobilized', 'IMMOBILIZED']];

function BenchConditionsChips({ conditions, accent, onToggle, dense, adding, onAddOpen, onAddClose }) {
  // T3 (ruling bench-refinements-triage): "+ ADD" a custom condition. The vocabulary was RULED free-form
  // for exactly this — the token persists like any other and renders tolerantly (as an `extra` chip/dot).
  // The `adding` flag lives in NpcBenchGroupsView (stable) so a board-cell remount can't drop the input;
  // the input is UNCONTROLLED (value read on commit) so no value-state is lost on a re-render.
  const commit = (raw) => { const v = (raw || '').trim().toLowerCase(); if (v) onToggle(v); onAddClose && onAddClose(); };
  const cur = Array.isArray(conditions) ? conditions : [];
  const known = BENCH_COND_SET.map(c => c[0]);
  const extra = cur.filter(t => known.indexOf(t) === -1);
  // U4 (bench-custom-usability-triage §3 — Jason's call, AMENDING this seat's own C2 density ruling):
  // the LEDGER used single-letter dots (S · D · I) and they read as cipher — a GM should not decode
  // an initial mid-fight. Conditions now spell their names in LIST too: compact FULL-WORD chips.
  // The tap law is satisfied by a padded HIT AREA rather than a tall pill (the law constrains taps,
  // not typography — AS-6), so the words go WIDE on a full-width board instead of tall and the
  // large-fight glance survives at the relaxed ≤72px row budget.
  const chipP = (key, label, on) => (
    <button key={key} type="button" className="hp-quiet nl-cond" data-on={on ? '1' : '0'} aria-pressed={on ? 'true' : 'false'}
      aria-label={label + (on ? ' (on)' : '')} onClick={(e) => { e.stopPropagation(); onToggle(key); }}>{label}</button>
  );
  return (
    <div className="nl-conds" data-dense={dense ? '1' : '0'} role="group" aria-label="Conditions">
      {BENCH_COND_SET.map(c => chipP(c[0], c[1], cur.indexOf(c[0]) !== -1))}
      {extra.map(t => chipP(t, t, true))}
      {adding ? (
        <input className="nl-in nl-condin" autoFocus placeholder="condition…" aria-label="Add a custom condition"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(e.target.value); } else if (e.key === 'Escape') { onAddClose && onAddClose(); } }}
          onBlur={e => commit(e.target.value)} />
      ) : (
        <button type="button" className="hp-quiet nl-add" aria-label="Add a custom condition"
          onClick={(e) => { e.stopPropagation(); onAddOpen && onAddOpen(); }}>{dense ? '+' : '+ ADD'}</button>
      )}
    </div>
  );
}

// Group notes + add-member search (shared by the phone flip AND the desktop board). MODULE SCOPE (F2).
function BenchAddMemberBlock({ ctx }) {
  const { openGroup, actions, accent, addSearch, setAddSearch, addResults, inGroupSrc } = ctx;
  return (
    <React.Fragment>
      <NotesRow value={openGroup.notes} onSave={(v) => actions.setNotes(openGroup.id, v)} accent={accent}
        label="Encounter notes" placeholder="Add encounter notes…" />
      <input type="text" className="nl-in" value={addSearch} placeholder="Add an NPC — search by name…" aria-label="Add an NPC"
        data-npc-add="1" onChange={e => setAddSearch(e.target.value)} />
      {addResults.length > 0 ? (
        <div className="hp-plate" data-pad="data"><div className="hp-index hp-bands" data-npc-add-results="1">
          {addResults.map(n => (
            <button key={n._source_key || n.key} type="button" className="hp-row"
              onClick={() => { actions.addMember(openGroup.id, n._source_key || n.key); setAddSearch(''); }}>
              <span className="hp-row-body"><span className="hp-row-desig">{n.name}</span>
                <span className="nl-tier" data-npc-add-meta="1">{(n.tier || '').toUpperCase()}{inGroupSrc[n._source_key || n.key] ? ' · ADD ANOTHER' : ''}</span></span>
            </button>
          ))}
        </div></div>
      ) : null}
    </React.Fragment>
  );
}

// The full statblock + tracker + conditions + notes for one member — phone FLIP, wide REFERENCE pane, and
// mid-tier overlay all render THIS. MODULE SCOPE (F2): hosts the member NOTES input, so its identity must
// be stable. (F4 replaces the wide/overlay usages with the tabbed reference; the phone flip keeps this.)
// ── F-54: THE CRAFT IN THIS ENCOUNTER, AND WHO IS ABOARD ─────────────────────────────────────
//
// HOME IS THE BOARD (§4.1), and that placement is the whole fix. `VehiclePanel` already existed on
// three phone-tier reference cards driven by LOCAL state — so it went dark at desktop when the
// detail switched to the tabbed card, and it never saved anywhere. The board tracks; the reference
// teaches. A ship a GM assigns is tracked table state, so it belongs here.
//
// MOVED, NOT REBUILT (§4.4). `VehiclePanel` is already a CONTROLLED component — `vehicle` in,
// `onVehicleChange` out — so the move is a rewiring, not a reimplementation: the same picker, the
// same category pills, the same `resolveVehicleWeapons` fold-in, now handed store-backed state
// instead of a `useState` that died on unmount. Nothing about the panel itself is reimplemented.
// SHIP YARD S8 (card `shipyard-s8-build` R-S8B-4): an encounter craft (`{id, key}`) or an owned ship turns into its row through
// the Yard store's ONE lookup (`SWRPGVessels.vehicleFor`: a built ship's frame, else the library row by key), over this view's
// library (`refData.vehicles`). It replaced the bench's own key filter.
function craftVehicle(refData, ref) {
  const VS = window.SWRPGVessels;
  return VS && VS.vehicleFor ? VS.vehicleFor(ref, refData && Array.isArray(refData.vehicles) ? refData.vehicles : null) : null;
}

// Card `shipyard-encounter-craft-build` (D-268, frames v1 @ ui-lab 38ae96e59; R-SECB-1..3): each craft row's two tracks,
// in the bench's own tracker, inline under the row (one tap per mark). The record is the vessel the craft's `vessel`
// points at, else none: a fresh craft reads zeros over its library row (R-SEC-2). The thresholds come from the Yard's
// resolver and the two DOWN tests from YardParts (R-SECB-3) — this face computes neither. A craft's hull prints its
// stored value past 2× (R-SECF-5). Each step is the bench's markCraft (it mints on the first mark).
function BenchCraftTracks({ v, vrow, rec, name, gid, actions, refData, stale }) {
  const R = window.SWRPGVesselResolve, VV = window.SWRPGVesselView, P = VV && VV.YardParts;
  const cur = rec || { vehicleKey: v.key, hull_current: 0, strain_current: 0 };
  const res = vrow && R ? R.resolve(cur, vrow, null) : null;
  const row = (key) => craftVehicle(refData, { key: key });
  const mark = (track, delta) => () => actions.markCraft(gid, v.id, { track: track, delta: delta }, row);
  return (
    <div className="sb-vit nl-craft-trks" data-bench-craft-trks={v.id} data-minted={rec ? '1' : '0'}>
      <NpcPaperTrack label="Hull trauma" track="hull" cur={cur.hull_current || 0} max={res ? res.hull_threshold : null} uncapped
        down={!!(P && P.isCrippled(cur, res))} downWord="Crippled" stale={stale}
        onDec={mark('hull', -1)} onInc={mark('hull', 1)} decLabel={'Remove one hull trauma from ' + name} incLabel={'Add one hull trauma to ' + name} />
      <NpcPaperTrack label="System strain" track="strain" cur={cur.strain_current || 0} max={res ? res.strain_threshold : null} uncapped
        down={!!(P && P.isSystemsDown(cur, res))} downWord="Systems down" stale={stale}
        onDec={mark('strain', -1)} onInc={mark('strain', 1)} decLabel={'Remove one system strain from ' + name} incLabel={'Add one system strain to ' + name} />
    </div>
  );
}

function BenchGroupCraft({ ctx }) {
  const { openGroup, actions, accent, refData, craftLabel, benchStale } = ctx;
  const VS = window.SWRPGVessels;
  const fleet = VS && VS.useVessels ? VS.useVessels() : null;   // a mark re-renders the row (the Yard store notifies)
  if (!openGroup || !refData || !Array.isArray(refData.vehicles)) return null;
  const craft = openGroup.vehicles || [];
  const label = craftLabel || ((v, base) => base);
  return (
    <div data-bench-craft="1">
      <NpcPaperSechead head="CRAFT IN THIS ENCOUNTER" />
      <div className="hp-plate" data-pad="data">
        {craft.length === 0 ? <p className="hp-none" style={{ margin: 0 }}>No craft yet. Add one, then say who is aboard it.</p> : null}
        <div className="hp-bands" data-run="1">{craft.map(function (v) {
          const rec = craftVehicle(refData, v);
          const crew = (openGroup.members || []).filter(function (m) { return m.vehicle && m.vehicle.id === v.id; });
          const pilot = crew.filter(function (m) { return m.vehicle.pilot; })[0];
          const name = label(v, rec ? rec.name : v.key);
          return (
            <div key={v.id} className="nl-craftrow" data-bench-craft-row={v.id}>
              <b>{name}</b>
              {rec && rec.silhouette != null ? <span className="nl-tier">{'SIL ' + rec.silhouette}</span> : null}
              {!rec ? <span className="nl-tier">{'NOT IN LIBRARY'}</span> : null}
              <span className="nl-sp" />
              <span className="nl-tier">{crew.length === 0 ? 'NO CREW' : (crew.length + ' ABOARD' + (pilot ? '' : ' · NO PILOT'))}</span>
              <button type="button" className="nl-glyph" data-g="x" aria-label={'Remove ' + name + ' from this encounter'}
                onClick={() => actions.removeVehicle(openGroup.id, v.id)}>×</button>
              {rec ? <BenchCraftTracks v={v} vrow={rec} name={name} gid={openGroup.id} actions={actions} refData={refData} stale={benchStale}
                rec={v.vessel && fleet ? (fleet.vessels || []).filter(function (r) { return r.id === v.vessel; })[0] || null : null} /> : null}
            </div>
          );
        })}</div>
        <VehiclePanel accent={accent} refData={refData} vehicle={null}
          aboardByKey={craft.reduce(function (acc, v) {
            const n = (openGroup.members || []).filter(function (m) { return m.vehicle && m.vehicle.id === v.id; }).length;
            acc[v.key] = (acc[v.key] || 0) + n; return acc;
          }, {})}
          onVehicleChange={(v) => { if (v && v.key) actions.addVehicle(openGroup.id, v.key); }} />
      </div>
    </div>
  );
}

// Who this NPC is aboard, on their own board card — the assignment lives beside the member it is
// about. Renders nothing when the encounter carries no craft: a control for a choice that does not
// exist yet is noise.
function BenchMemberCraft({ m, ctx }) {
  const { openGroup, actions, refData, craftLabel } = ctx;
  const craft = (openGroup && openGroup.vehicles) || [];
  if (!craft.length) return null;
  const label = craftLabel || ((v, base) => base);
  const aboard = m.vehicle ? craft.filter(function (v) { return v.id === m.vehicle.id; })[0] : null;
  const rec = aboard ? craftVehicle(refData, aboard) : null;
  const isPilot = !!(m.vehicle && m.vehicle.pilot);
  return (
    <div data-bench-member-craft={m.id} onClick={(e) => e.stopPropagation()}>
      <NpcPaperSechead head="ABOARD" />
      <div className="nl-acts">
        <select className="nl-sel" aria-label="Which craft is this NPC aboard" value={aboard ? aboard.id : ''}
          onChange={(e) => actions.setMemberVehicle(openGroup.id, m.id, e.target.value || null, isPilot)}>
          <option value="">{'— not aboard —'}</option>
          {craft.map(function (v) { const r = craftVehicle(refData, v); return <option key={v.id} value={v.id}>{label(v, r ? r.name : v.key)}</option>; })}
        </select>
        {aboard ? (
          <button type="button" className="hp-quiet nl-cond" data-on={isPilot ? '1' : '0'} aria-pressed={isPilot ? 'true' : 'false'}
            aria-label={(isPilot ? 'Unset' : 'Set') + ' as pilot of ' + (rec ? rec.name : aboard.key)}
            onClick={() => actions.setMemberVehicle(openGroup.id, m.id, aboard.id, !isPilot)}>PILOT</button>
        ) : null}
      </div>
    </div>
  );
}

function BenchMemberCard({ m, ctx }) {
  if (!m) return null;
  const { openGroup, actions, accent, resolveBySourceKey, factionProfiles, refData, poolView, setW, setS, setFlipKey, setRefOverlay, condChips } = ctx;
  const rr = resolveBySourceKey(m._source_key);
  const rend = rr ? npcFromLibrary(rr) : null;
  const remove = (   // a done encounter's record (F8) draws × REMOVE inert: disabled + aria-disabled (rider R3)
    <div className="nl-acts" style={{ margin: '0 0 8px', justifyContent: 'flex-end' }}>
      <button type="button" className="hp-quiet" aria-label="Remove this member from the encounter" disabled={!!ctx.encReadOnly} aria-disabled={ctx.encReadOnly ? 'true' : undefined}
        onClick={() => { actions.removeMember(openGroup.id, m.id); setFlipKey(null); setRefOverlay(false); }}>{'× REMOVE'}</button>
    </div>
  );
  if (!rend) {
    return (
      <div data-npc-flipcard={m.id} data-npc-dangling="1">
        {remove}
        <div className="hp-plate" data-pad="read">
          <p className="hp-why" data-standalone="1" style={{ margin: '0 0 10px' }}>This NPC's stat block is no longer in the library. Its tracked state is kept — remove it from the group, or restore the source.</p>
          {condChips(m)}
        </div>
      </div>
    );
  }
  const pv = poolView(m);
  const minion = (rr.tier || '') === 'minion';
  // C-F54B-1's phone-card half: the craft the member is PERSISTENTLY aboard folds its weapons into the arsenal.
  const aboard = m.vehicle ? (openGroup.vehicles || []).filter(function (v) { return v.id === m.vehicle.id; })[0] : null;
  const craftWeapons = aboard ? resolveVehicleWeapons(craftVehicle(refData, aboard), refData) : null;
  const who = rend.name;
  return (
    <div data-npc-flipcard={m.id}>
      {remove}
      <NpcPaperStatBlock rend={rend} tier={rr.tier} refData={refData} factionProfiles={factionProfiles} name={rend.name}
        arrange="stack" ctx="flip" groupStanding={pv ? pv.standing : null} vehicleWeapons={craftWeapons}
        track={minion ? null : Object.assign({ cur: m.currentWounds || 0, st: m.currentStrain || 0, stale: ctx.benchStale,
          onW: (v) => setW(m, v), onS: (v) => setS(m, v), who: who }, ctx.encTrack || {})} />
      {!minion ? condChips(m) : null}
      <NotesRow value={m.notes} onSave={(v) => actions.setMember(openGroup.id, m.id, { notes: v })}
        accent={accent} label={'Notes for ' + rend.name} placeholder={'Notes for ' + rend.name + '…'} />
      <BenchMemberCraft m={m} ctx={ctx} />
    </div>
  );
}

// B-908 · R-PN3-2/-3/-4 (ruling `paper-n3-bench`) — ONE scrolling zone of the desk board: the paper kit's `.hp-zone`,
// its cue (`data-more` / `data-more-above`) kept by the ONE shared driver, which also watches the zone's content so a
// picker opening or a note growing updates the cue without a scroll. MODULE SCOPE (F2): it hosts the add input and the
// notes, so its identity must never churn with the board's render.
function BenchZone({ zone, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const cue = window.SWRPGScrollCue;
    return (cue && ref.current) ? cue.watch(ref.current) : undefined;
  }, []);
  return <div ref={ref} className="hp-zone" data-bench-zone={zone}>{children}</div>;
}

// ── F4 (ruling bench-board-followups-triage): the BENCH tabbed reference — the tabbed card with the
//    bench chrome (REMOVE + member notes), STATS-first, fixed-height. Wounds/strain/conditions stay ON
//    THE BOARD (the board tracks; the reference teaches — no duplicate editors). MODULE SCOPE (F2).
function BenchTabbedReference({ m, ctx, chrome = true }) {
  // `poolView` added for the live standing count — it was absent from this destructure, which is
  // structurally why the tabbed card reached for `m.count` instead.
  const { resolveBySourceKey, accent, actions, openGroup, setFlipKey, setRefOverlay, refData, poolView } = ctx;
  const rr = m ? resolveBySourceKey(m._source_key) : null;
  const rend = rr ? npcFromLibrary(rr) : null;
  // F-54 §4.4: the craft this NPC is PERSISTENTLY aboard feeds the arsenal's weapon fold-in.
  // Resolved at render from the id-ref — the stat block is never persisted, so a registry edit or
  // a retired craft is handled the same way an unresolvable `_source_key` is: nothing folds in.
  const _aboard = (m && m.vehicle && openGroup)
    ? (openGroup.vehicles || []).filter(function (v) { return v.id === m.vehicle.id; })[0] : null;
  const _craftWeapons = _aboard
    ? resolveVehicleWeapons(craftVehicle(refData, _aboard), refData) : null;
  if (!m) return null;
  if (!rend) {
    return (
      <div className="hp-plate" data-pad="read"><p className="hp-why" data-standalone="1" style={{ margin: 0 }}>This NPC's stat block is no longer in the library. Its tracked state is kept — remove it from the group, or restore the source.</p></div>
    );
  }
  // THE FIX (ruling `bench-minion-skill-standing-triage`): the rank source is LIVE STANDING, never
  // the line's original size. `poolView` already derives it — and already calls
  // `BenchStore.minionGroupRanks` — so this card and the phone-tier card now read one number from
  // one place. Null for a non-minion line, which makes the library's state-the-rule branch fire
  // rather than inventing a rank.
  const standing = (poolView(m) || {}).standing ?? null;
  return (
    <React.Fragment>
      {chrome ? (   // the manager's desk carries × REMOVE in its head row instead (D-504's frame); today's board keeps it here
        <div className="nl-acts" style={{ margin: '0 0 8px', justifyContent: 'flex-end' }}>
          <button type="button" className="hp-quiet" aria-label="Remove this member from the encounter"
            onClick={() => { actions.removeMember(openGroup.id, m.id); setFlipKey(null); setRefOverlay(false); }}>{'× REMOVE'}</button>
        </div>
      ) : null}
      <NotesRow value={m.notes} onSave={(v) => actions.setMember(openGroup.id, m.id, { notes: v })}
        accent={accent} label={'Notes for ' + rend.name} placeholder={'Notes for ' + rend.name + '…'} />
      <NpcPaperStatBlock rend={rend} tier={rr.tier} refData={refData} factionProfiles={ctx.factionProfiles} name={rend.name}
        arrange="tabs" ctx="bench" groupStanding={standing} vehicleWeapons={_craftWeapons} />
    </React.Fragment>
  );
}

// E2 (remount sweep) — the tracking-board render family, hoisted from inside NpcBenchGroupsView to
// stable module identities (was `function X(){}`-inside-render → the whole board remounted on every
// wound/strain/condition tap). They take a `ctx` bundle (boardCtx, recreated each render = a props
// update, never identity churn — the F2 pattern) carrying the one-core ops + helpers they close over.
function BenchWSBar({ m, kind, variant, ctx }) {
  const { wsRead, setW, setS, memberLabel } = ctx;
  const isW = kind === 'w';
  const ws = wsRead(m);
  const max = isW ? ws.wt : ws.st;
  const cur = isW ? (m.currentWounds || 0) : (m.currentStrain || 0);
  const set = isW ? setW : setS;
  const dmg = max > 0 ? Math.min(100, Math.round((cur / max) * 100)) : 0;
  const who = memberLabel(m, (ws.r && ws.r.name) || '');
  return (
    <NpcPaperTrack label={isW ? 'Wounds' : 'Strain'} track={isW ? 'wounds' : 'strain'} cur={cur} max={max} compact={variant === 'row'}
      stale={ctx.benchStale} onDec={() => set(m, cur - 1)} onInc={() => set(m, cur + 1)}
      decLabel={'Remove one ' + (isW ? 'wound' : 'strain') + ' from ' + who} incLabel={'Add one ' + (isW ? 'wound' : 'strain') + ' to ' + who} />
  );
}
function BenchMinionPoolFrame({ m, ctx }) {
  const { poolView, memberLabel, bumpLine, critLine, bumpCount, condChips } = ctx;
  const pv = poolView(m); if (!pv) return null;
  const name = memberLabel(m, pv.r.name || m._source_key);   // v5: "· A / · B" for duplicate minion lines
  const b = npcBandOf(pv.wounds, pv.poolMax);
  const pct = pv.poolMax ? Math.max(0, Math.min(100, Math.round(pv.wounds * 100 / pv.poolMax))) : 0;
  const dis = ctx.benchStale ? { disabled: true, 'aria-disabled': 'true', style: { opacity: 0.4, pointerEvents: 'none' } } : {};
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <div className="hp-plate" data-pad="data" role="group" aria-label={name + ' minion pool'} data-npc-pool={m.id}>
      <div className="nl-poolh"><span className="nl-tier">{name.toUpperCase()}</span>
        <span className="nl-step">
          <button type="button" className="sb-trk-btn" data-testid="pool-count-minus" aria-label={'One fewer ' + name} onClick={stop(() => bumpCount(m, -1))} {...dis}>−</button>
          <b>×{pv.count}</b>
          <button type="button" className="sb-trk-btn" data-testid="pool-count-plus" aria-label={'One more ' + name} onClick={stop(() => bumpCount(m, 1))} {...dis}>+</button>
        </span></div>
      <div className="sb-vitrow nl-poolrow" data-state={b.down ? 'down' : (b.band >= 2 ? 'pressed' : 'clear')} data-band={b.down ? 3 : b.band}>
        <div>
          <div className="sb-vitkey" aria-live="polite"><b>{pv.standing}</b> of {pv.count} standing · {pv.wounds}/{pv.poolMax} wounds</div>
          <div className="sb-meter"><i style={{ width: pct + '%' }} /></div>
          {pv.standing === 0 ? <div className="sb-vitword">{NPC_DOWN_WORD}</div> : null}
        </div>
      </div>
      <div className="nl-pips" aria-hidden="true">{Array.from({ length: pv.count }).map((_, i) => <i key={i} data-on={i < pv.standing ? '1' : '0'} />)}</div>
      <div className="nl-poolacts">
        <button type="button" className="sb-trk-btn" aria-label={'Remove one wound from ' + name} onClick={stop(() => bumpLine(m, -1))} {...dis}>−</button>
        <button type="button" className="sb-trk-btn" aria-label={'Add one wound to ' + name} onClick={stop(() => bumpLine(m, 1))} {...dis}>+</button>
        <button type="button" className="hp-quiet nl-crit" aria-label={'Critical hit — drop one ' + name} onClick={stop(() => critLine(m))} {...dis}>CRIT</button>
        <span className="nl-sp" />
        <span className="nl-tier">GROUP SKILLS: <b>{pv.ranks}</b> {pv.ranks === 1 ? 'rank' : 'ranks'}</span>
      </div>
      <div className="nl-cite"><span className="hp-cite">SAME-TYPE POOL · EotE p.390</span></div>
      {condChips(m)}
    </div>
  );
}
function BenchStripChip({ m, ctx }) {
  const { resolveBySourceKey, flipKey, memberLabel, poolView, wtOf, setFlipKey } = ctx;
  const r = resolveBySourceKey(m._source_key);
  const active = m.id === flipKey;
  const name = memberLabel(m, r ? (r.name || m._source_key) : (m._source_key + ' (missing)'));
  const pv = poolView(m);
  // C-PFR34-1 — THE STRIP CHIP KEEPS ITS MINION READOUT, AND THAT IS A DECISION, NOT AN OVERSIGHT.
  // The condition offered two outcomes: carry the threshold here too, or continue to show none BY
  // DECISION and say why. This is the second, and the why is that the chip already carries the
  // minion-native answer to the question it is asked.
  // A chip is an at-a-glance SELECTOR, and the number a GM acts on for a minion group is how many
  // are still STANDING — it sets the group's dice pool and says whether the squad is spent. The
  // wound pool is the mechanism BEHIND that number, and it is printed wherever the GM actually
  // moves it (the ledger row, as of this lap, and the board card). Adding `12/20 W` here would
  // duplicate the ledger inside a 44px control without adding a decision anyone makes from it.
  // A non-minion chip shows `W` remaining for the same reason in reverse: an individual has no
  // standing count, so wounds ARE its at-a-glance state.
  let status = null;
  if (pv) status = `×${pv.count} · ${pv.standing} STANDING`;
  // R-NPC-5d — the chip reads CURRENT / THRESHOLD (the dark chip's remaining-wounds convention goes).
  // R-NFLL-1 (ruling `npc-flip-ledger`, D-FLL3 (b)): the chip prints the persisted current through the ONE clamp core
  // (R-NBS2), as every paper tracker does (R-NFST-1).
  const st = pv ? status : (r ? `${BenchStore.clampCurrent(m.currentWounds || 0, wtOf(r))}/${wtOf(r)} WOUNDS` : null);
  return (
    <button type="button" className="nl-sc" data-on={active ? '1' : '0'} data-miss={r ? '0' : '1'} aria-pressed={active}
      aria-label={'Show ' + name} data-npc-member={m.id} onClick={() => setFlipKey(m.id)}>
      <b>{name}</b>{st ? <span>{st}</span> : null}
    </button>
  );
}
// B-1831 (ruling release-r7-bug-burndown ADDENDUM 679): a member card is `role="button"` but holds its own controls (the
// row glyphs, the card menu, the W/S bars, the roll row), so it cannot be a real <button> (B-1710's pattern, 589). It takes
// Enter and Space on the handler its press calls instead — only when the CARD is the key's target, so a key pressed in a
// control or an input inside it never also selects the card.
const cardPressKeys = (press) => (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); }
};
function BenchBoardCard({ m, ctx }) {
  const { wsRead, memberLabel, memberParts, flipKey, tierStripe, selectMember, actions, openGroup, condChips } = ctx;
  const ws = wsRead(m); const r = ws.r; const ok = !!r;
  const name = memberLabel(m, ok ? (r.name || m._source_key) : (m._source_key + ' (missing)'));
  const parts = memberParts(m, ok ? (r.name || m._source_key) : (m._source_key + ' (missing)'));
  const sel = m.id === flipKey;
  const stripe = tierStripe(ws.tier, ok);
  const ids = ctx.orderedMembers.map(x => x.id), i = ids.indexOf(m.id), last = ids.length - 1;
  return (
    <div className="hp-plate nl-bcard" data-pad="snug" data-sel={sel ? '1' : '0'} data-npc-member={m.id}
      role="button" tabIndex={0} aria-pressed={sel} aria-label={'Select ' + name} onClick={() => selectMember(m)} onKeyDown={cardPressKeys(() => selectMember(m))}>
      <div className="nl-card-h">
        <NpcPaperMono name={parts.base} />
        <div className="nl-cn"><b data-miss={ok ? '0' : '1'}>{parts.base}{parts.suffix}</b><span className="nl-tier">{ws.tier || 'unknown'}</span></div>
        <NpcPaperRowGlyphs cls="nl-glyphs nl-arrows" label={name} upDisabled={i <= 0} downDisabled={i < 0 || i >= last}
          onUp={() => ctx.reorderMember(m, -1)} onDown={() => ctx.reorderMember(m, 1)}
          onRemove={() => actions.removeMember(openGroup.id, m.id)} />
      </div>
      {ws.isMinion ? <BenchMinionPoolFrame m={m} ctx={ctx} /> : (
        <React.Fragment>
          <div className="hp-plate" data-pad="data"><div className="sb-vit">
            <BenchWSBar m={m} kind="w" variant="card" ctx={ctx} />
            {ws.hasStrain ? <BenchWSBar m={m} kind="s" variant="card" ctx={ctx} /> : null}
          </div></div>
          {condChips(m)}
          <BenchMemberCraft m={m} ctx={ctx} />
        </React.Fragment>
      )}
    </div>
  );
}
function BenchCardBoard({ ctx }) {
  const { orderedMembers } = ctx;
  return <div className="nl-cards" data-testid="board-card-grid">{orderedMembers.map(m => <BenchBoardCard key={m.id} m={m} ctx={ctx} />)}</div>;
}
function BenchLedgerRow({ m, ctx }) {
  const { wsRead, memberLabel, memberParts, flipKey, tierStripe, poolView, selectMember, bumpLine, critLine, bumpCount, condChips, actions, openGroup, crewingFor, setCrewingFor, refData } = ctx;
  const ws = wsRead(m); const r = ws.r; const ok = !!r;
  // B-296/B-297 (mockup `bench-ledger-crewing-chip.html`, approved by Jason 2026-08-26): the chip
  // shows the craft's NAME when crewed, so it needs the same lookup BenchMemberCraft does (:4220).
  // Derived exactly as there — craft list off the group, matched by the member's vehicle id — so
  // the two surfaces cannot disagree about what a member is aboard.
  const _craft = (openGroup && openGroup.vehicles) || [];
  const _aboard = m.vehicle ? _craft.filter(function (v) { return v.id === m.vehicle.id; })[0] : null;
  const _vrec = _aboard ? craftVehicle(refData, _aboard) : null;
  const _vname = _vrec ? (_vrec.name || _aboard.key) : (_aboard ? _aboard.key : null);
  const _isPilot = !!(m.vehicle && m.vehicle.pilot);
  const name = memberLabel(m, ok ? (r.name || m._source_key) : (m._source_key + ' (missing)'));
  const parts = memberParts(m, ok ? (r.name || m._source_key) : (m._source_key + ' (missing)'));
  const sel = m.id === flipKey;
  const stripe = tierStripe(ws.tier, ok);
  const pv = ws.isMinion ? poolView(m) : null;
  const ids = ctx.orderedMembers.map(x => x.id), i = ids.indexOf(m.id), last = ids.length - 1;
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const dis = ctx.benchStale ? { disabled: true, 'aria-disabled': 'true', style: { opacity: 0.4, pointerEvents: 'none' } } : {};
  const tierWord = ws.isMinion ? (ws.tier + ' ×' + (pv ? pv.count : 1)) : (ws.tier || 'unknown');
  if (ctx.narrowLedger) {
    // B9 — the unit stacked: name and actions, the trackers, the pool, the conditions (the table's order).
    return (
      <div className="nl-lrow" data-sel={sel ? '1' : '0'} data-npc-member={m.id} onClick={() => selectMember(m)}>
        <div className="nl-lrow-h"><div className="nl-lname"><NpcPaperMono name={parts.base} /><div className="nl-cn"><b data-miss={ok ? '0' : '1'}>{parts.base}{parts.suffix}</b><span className="nl-tier">{tierWord}</span></div></div></div>
        <div className="nl-lrow-t">
          {ws.isMinion ? (
            <NpcPaperTrack label="Wounds" track="wounds" cur={pv ? pv.wounds : 0} max={pv ? pv.poolMax : 0} stale={ctx.benchStale}
              onDec={() => bumpLine(m, -1)} onInc={() => bumpLine(m, 1)} decLabel={'Remove one wound from ' + name} incLabel={'Add one wound to ' + name} />
          ) : (
            <React.Fragment>
              <BenchWSBar m={m} kind="w" variant="card" ctx={ctx} />
              {ws.hasStrain ? <BenchWSBar m={m} kind="s" variant="card" ctx={ctx} /> : null}
            </React.Fragment>
          )}
        </div>
        {ws.isMinion ? (
          <div className="nl-lrow-p"><span className="nl-tier">POOL</span><span className="nl-step">
            <button type="button" className="sb-trk-btn" data-testid="ledger-count-minus" aria-label={'One fewer ' + name} onClick={stop(() => bumpCount(m, -1))} {...dis}>−</button>
            <b>{pv ? pv.standing : 1}<span className="sb-of"> /{pv ? pv.count : 1}</span></b>
            <button type="button" className="sb-trk-btn" data-testid="ledger-count-plus" aria-label={'One more ' + name} onClick={stop(() => bumpCount(m, 1))} {...dis}>+</button>
          </span>
          {/* B-894 · B9 — the card's CRIT after the count stepper: critLine, the one handler (B-905) */}
          <button type="button" className="hp-quiet nl-crit" aria-label={'Critical hit — drop one ' + name} onClick={stop(() => critLine(m))} {...dis}>CRIT</button></div>
        ) : null}
        {condChips(m, true)}
        <div className="nl-lrow-a"><span className="nl-lacts">
          {_aboard ? (
            <button type="button" className="nl-vname" aria-pressed={crewingFor === m.id}
              aria-label={'Change vehicle for ' + name + ' — ' + (_vname || 'assigned') + (_isPilot ? ', pilot' : '')}
              onClick={stop(() => setCrewingFor(crewingFor === m.id ? null : m.id))}>
              <span>{_vname}</span>{_isPilot ? <span className="nl-tag">PILOT</span> : null}</button>
          ) : (
            <button type="button" className="nl-vadd" aria-pressed={crewingFor === m.id} aria-label={'Assign vehicle to ' + name}
              onClick={stop(() => setCrewingFor(crewingFor === m.id ? null : m.id))}>+ VEHICLE</button>
          )}
          <NpcPaperRowGlyphs label={name} upDisabled={i <= 0} downDisabled={i < 0 || i >= last}
            onUp={() => ctx.reorderMember(m, -1)} onDown={() => ctx.reorderMember(m, 1)}
            onRemove={() => actions.removeMember(openGroup.id, m.id)} />
        </span></div>
      </div>
    );
  }
  return (
    <tr data-sel={sel ? '1' : '0'} data-npc-member={m.id} onClick={() => selectMember(m)}>
      <td><div className="nl-lname"><NpcPaperMono name={parts.base} /><div className="nl-cn"><b data-miss={ok ? '0' : '1'}>{parts.base}{parts.suffix}</b><span className="nl-tier">{tierWord}</span></div></div></td>
      {ws.isMinion ? (
        <React.Fragment>
          <td><NpcPaperTrack label="Wounds" track="wounds" compact cur={pv ? pv.wounds : 0} max={pv ? pv.poolMax : 0} stale={ctx.benchStale}
            onDec={() => bumpLine(m, -1)} onInc={() => bumpLine(m, 1)} decLabel={'Remove one wound from ' + name} incLabel={'Add one wound to ' + name} /></td>
          <td><span className="nl-tier">shared pool</span></td>
          <td>{condChips(m, true)}</td>
          <td className="nl-c"><span className="nl-step">
            <button type="button" className="sb-trk-btn" data-testid="ledger-count-minus" aria-label={'One fewer ' + name} onClick={stop(() => bumpCount(m, -1))} {...dis}>−</button>
            <b>{pv ? pv.standing : 1}<span className="sb-of"> /{pv ? pv.count : 1}</span></b>
            <button type="button" className="sb-trk-btn" data-testid="ledger-count-plus" aria-label={'One more ' + name} onClick={stop(() => bumpCount(m, 1))} {...dis}>+</button>
          </span>
          {/* B-894 · B5 — the card's CRIT after the count stepper (R-NPR57-3): critLine, one handler (B-905) */}
          <button type="button" className="hp-quiet nl-crit" aria-label={'Critical hit — drop one ' + name} onClick={stop(() => critLine(m))} {...dis}>CRIT</button></td>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <td><BenchWSBar m={m} kind="w" variant="row" ctx={ctx} /></td>
          <td>{ws.hasStrain ? <BenchWSBar m={m} kind="s" variant="row" ctx={ctx} /> : <span className="nl-tier">—</span>}</td>
          <td>{condChips(m, true)}</td>
          <td className="nl-c"><span className="nl-tier">—</span></td>
        </React.Fragment>
      )}
      <td className="nl-c"><span className="nl-lacts">
        {_aboard ? (
          <button type="button" className="nl-vname" aria-pressed={crewingFor === m.id}
            aria-label={'Change vehicle for ' + name + ' — ' + (_vname || 'assigned') + (_isPilot ? ', pilot' : '')}
            onClick={stop(() => setCrewingFor(crewingFor === m.id ? null : m.id))}>
            <span>{_vname}</span>{_isPilot ? <span className="nl-tag">PILOT</span> : null}</button>
        ) : (
          <button type="button" className="nl-vadd" aria-pressed={crewingFor === m.id} aria-label={'Assign vehicle to ' + name}
            onClick={stop(() => setCrewingFor(crewingFor === m.id ? null : m.id))}>+ VEHICLE</button>
        )}
        <NpcPaperRowGlyphs label={name} upDisabled={i <= 0} downDisabled={i < 0 || i >= last}
          onUp={() => ctx.reorderMember(m, -1)} onDown={() => ctx.reorderMember(m, 1)}
          onRemove={() => actions.removeMember(openGroup.id, m.id)} />
      </span></td>
    </tr>
  );
}
function BenchLedgerBoard({ ctx }) {
  const { accent, orderedMembers, crewingFor, openGroup, refData, actions } = ctx;
  const th = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.14em', color: 'var(--text-faint)', textTransform: 'uppercase', textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${accent}22` };
  if (ctx.narrowLedger) {
    return (
      <div className="nl-lstack hp-bands" data-testid="board-ledger" data-narrow="1">
        {orderedMembers.map(m => <BenchLedgerRow key={m.id} m={m} ctx={ctx} />)}
      </div>
    );
  }
  return (
    <table className="nl-led" data-testid="board-ledger">
      <thead><tr><th>UNIT</th><th>WOUNDS</th><th>STRAIN</th><th>CONDITIONS</th><th>POOL</th><th></th></tr></thead>
      <tbody className="hp-bands">{orderedMembers.flatMap(m => {
        const rows = [<BenchLedgerRow key={m.id} m={m} ctx={ctx} />];
        if (crewingFor === m.id) {
          const aboard = m.vehicle ? (openGroup.vehicles || []).filter(function (v) { return v.id === m.vehicle.id; })[0] : null;
          const vehicleRecord = aboard ? craftVehicle(refData, aboard) : null;
          const isPilot = !!(m.vehicle && m.vehicle.pilot);
          rows.push(
            <tr key={m.id + '-crew'} onClick={(e) => e.stopPropagation()}>
              <td colSpan={6}>
                <VehiclePanel accent={accent} refData={refData} vehicle={vehicleRecord}
                  onVehicleChange={function (v) {
                    if (v === null) actions.setMemberVehicle(openGroup.id, m.id, null, false);
                    else if (v && v.key) actions.addVehicleAndAssign(openGroup.id, m.id, v.key);
                  }} />
                {aboard ? (
                  <div className="nl-acts">
                    <button type="button" className="hp-quiet nl-cond" data-on={isPilot ? '1' : '0'} aria-pressed={isPilot ? 'true' : 'false'}
                      aria-label={(isPilot ? 'Unset' : 'Set') + ' as pilot of ' + (vehicleRecord ? vehicleRecord.name : aboard.key)}
                      onClick={function (e) { e.stopPropagation(); actions.setMemberVehicle(openGroup.id, m.id, aboard.id, !isPilot); }}>PILOT</button>
                    <span className="nl-note">{isPilot ? 'Flying this craft.' : 'Mark as the pilot of this craft.'}</span>
                  </div>
                ) : null}
              </td>
            </tr>
          );
        }
        return rows;
      })}</tbody>
    </table>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE ENCOUNTER MANAGER (ENCOUNTERS E3 lap B) — ruling `encounters-e3-screens` §3, the frames of
   `Docs/mockups/encounter-manager.html` (D-490) and, for the member card, `Docs/mockups/encounter-density.html` (D-504).
   Mounted only on the GM host's ENCOUNTERS screen, behind swrpg_encounters_door (R-E3S-1): `NpcBenchGroupsView` takes
   these branches only when its `manager` prop is set, so with the switch off the bench is today's, node for node.
   PROPOSE AND DISPOSE (FIRST_PRINCIPLES_CHARTER §3.1 Amendment 1; shape §10): every write is one of lap A's ops —
   `encounterLife.js` (NpcEncounter), `benchStore.js`'s setters, `roomState`'s applyDelta through them — called on the GM's
   tap. Nothing here auto-applies, advances on a timer, or writes a PC's wounds or strain or any sheet.
══════════════════════════════════════════════════════════════════════════════════════════════ */
const ENC_STATE_WORD = { prepped: 'PREPPED', running: 'RUNNING', done: 'DONE' };
const ENC_SIDE = { pc: 'PC', npc: 'NPC' };
function EL() { return window.NpcEncounter; }
function encRoom(t) { const R = window.SWRPGRoomState; return R ? R.normalize(t || null) : { initiative: { round: 0, slots: [], active: 0 }, destiny: { light: 0, dark: 0 } }; }


// A pool as F4 draws it, a plate and not a button (ruling `encounters-e3-screens` ADDENDUM 4 item 2). The initiative rows keep
// it (`encounters-e3-npc-press` CONTRACT 8); the weapon's plate is the press below.
function EncPlate({ pool, label, cls }) {
  const D = window.SWRPGDice;
  if (!pool || !D || !D.renderPool) return null;
  return <span className={'sb-pool' + (cls ? ' ' + cls : '')} role="img" aria-label={label + ' pool'} data-enc-plate="1">{D.renderPool(pool, { size: 1 })}</span>;
}
function encSym(key) { return renderFFGSymbol(key, 0); }

// THE PRESS (ruling `encounters-e3-npc-press`, D-507): the weapon's dice are the button that opens the paper dice window on
// that weapon. The house plate button's markup and looks (`.sb-pool-btn`, sheet.css, D-468); its name carries the weapon and
// the dice it draws, because an aria-label hides a button's children.
function encPoolWords(pool) {
  const n = ['proficiency', 'ability', 'boost', 'setback'].filter(k => pool[k] > 0).map(k => pool[k] + ' ' + k.charAt(0).toUpperCase() + k.slice(1));
  return n.length ? n.join(', ') : 'no dice';
}
function EncPress({ pool, label, open, onPress }) {
  const D = window.SWRPGDice;
  if (!pool || !D || !D.renderPool) return null;
  return (
    <button type="button" className="sb-pool sb-pool-btn" aria-label={'Roll ' + label + ': ' + encPoolWords(pool)} aria-haspopup="dialog"
      aria-expanded={open ? 'true' : 'false'} data-enc-plate="1" data-enc-press="1" data-pool={JSON.stringify(pool)}
      onClick={(e) => { e.stopPropagation(); onPress(); }}>{D.renderPool(pool, { size: 1 })}</button>
  );
}

// The crit tables (Table 6-10), read once from the registry; the name of a crit resolves from its roll at render (§4.2).
let _encCritRows = null, _encCritCite = 'EOTE P.217';
let _encCritLoad = null;
// ENCOUNTERS E6 frames D8 (D-543): a campaign's CAST reads the library's pool outside the library — npcs.json as
// NpcGeneratorController reads it, keyed by _source_key, plus this device's customs (CastStore; a custom wins its key,
// as mergedLibraryByTier's map does). One loader, cached; the reads below are synchronous once it has resolved.
let _castPool = null, _castPoolLoad = null;
function loadCastPool() {
  if (_castPool) return Promise.resolve(_castPool);
  if (!_castPoolLoad) _castPoolLoad = fetch('/public/data/canonical/npcs.json').then(r => r.json()).then(j => {
    const reg = (j && j.npcs) || {}, byKey = {};
    Object.keys(reg).forEach(id => { const n = reg[id], k = n._source_key || n.key; if (k) byKey[k] = n; });
    _castPool = byKey; return byKey;
  }).catch(() => { _castPoolLoad = null; return null; });
  return _castPoolLoad;
}
function castPoolMap() {
  const out = Object.assign({}, _castPool || {});
  const CS = window.NpcCastStore, cs = CS ? (CS.load().npcs || []) : [];
  cs.forEach(n => { const k = n._source_key || n.key; if (k) out[k] = n; });
  return out;
}
function castNpcOf(k) { const n = castPoolMap()[k]; return n ? { key: k, name: n.name || k, tier: n.tier || '' } : null; }
// the plain name filter (ruled (a)), in name order by code point as D8 is drawn (a name opening with a quote mark sorts
// after the letters), the first 12 — the bench's add search's cap
function castSearch(q) {
  const m = castPoolMap(), s = String(q || '').toLowerCase();
  return Object.keys(m).filter(k => (m[k].name || '').toLowerCase().indexOf(s) !== -1)
    .map(k => ({ key: k, name: m[k].name || k, tier: m[k].tier || '' })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, 12);
}
function loadEncCritRows() {   // the one loader: the bench's hook and the campaigns LOG (E6 frames) both read through it
  if (_encCritRows) return Promise.resolve(_encCritRows);
  if (!_encCritLoad) _encCritLoad = fetch('/public/data/canonical/crit_tables.json').then(r => r.json()).then(j => {
    _encCritRows = (j && j.character && j.character.rows) || [];
    _encCritCite = String((j && j.character && j.character.cite) || 'eote p.217').toUpperCase();
    return _encCritRows;
  }).catch(() => { _encCritLoad = null; return null; });
  return _encCritLoad;
}
function useEncCritRows() {
  const [rows, setRows] = useState(_encCritRows);
  useEffect(() => {
    if (_encCritRows) return;
    loadEncCritRows().then(r => { if (r) setRows(r); });
  }, []);
  return rows;
}
function encCritName(rows, c) {
  if (c && c.label) return c.label;
  const row = rows && EL() ? EL().critRowOf(rows, c.roll) : null;
  return row ? String(row[2]).split(':')[0] : '';
}

// A member's display identity: an NPC from the registry; a PC through the table session's ONE reader, pcOf (ruling
// `encounters-e6-walk` §4, B-1851): this device's saved character (`char:`), else the open table's summary for it (F6-a,
// G8; the name kept while dropped), else nothing — a `name:` member reads BY NAME. `line` is '' when there is nothing.
function encPcOf(m) {
  const T = window.SWRPGTableSession, p = T && T.pcOf ? T.pcOf(m.who) : { name: null, line: '', rec: null };
  return Object.assign({}, p, { name: p.name || 'Character not on this device' });
}
// The card's tier line: PC · the line, or PC once when there is no line (B-1847: never "PC · PC").
function encPcTier(pc) { return pc.line ? 'PC · ' + pc.line : 'PC'; }
// The reader beside encPcVitals (F6-a): the same {w, wt, s, st} from the table's summary (join / char_update), for a
// PC the roster misses; null with no summary. LIVE while the player is `here`; dropped keeps the last numbers.
function encPcTable(m, pc) {
  const T = window.SWRPGTableSession, who = String((m && m.who) || '');
  if (!pc || pc.rec || !pc.table || !T) return null;
  const v = T.vitalsFor(who);
  return v ? { v: v, live: T.presenceFor(who) === 'here' } : null;
}
function EncLiveTag({ t }) {   // G6: FROM THE SHEET · READ ONLY, and LIVE beside it while the player is here (D-504's card, nothing else)
  if (!t || !t.live) return <div className="enc-tag" style={{ padding: '4px 0 0' }}>FROM THE SHEET · READ ONLY</div>;
  return (
    <div className="enc-tag" style={{ padding: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>FROM THE SHEET · READ ONLY
      <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--doc-action,#7E1414)' }}>
        <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', flex: 'none', marginRight: 8, background: 'var(--doc-action,#7E1414)' }} />LIVE</span>
    </div>
  );
}
function encPcVitals(rec) {
  if (!rec) return null;
  const sh = rec.sheetData || rec, d = sh.derived || rec.derived || {};
  if (d.woundThreshold == null) return null;
  return { w: sh.currentWounds || 0, wt: d.woundThreshold, s: sh.currentStrain || 0, st: d.strainThreshold || 0 };
}

// The member's first weapon the library can print (the WeaponTable's projection, `SWItems.canonicalToStore`): its line, and
// the library's own weapon record (`raw`) the one reader takes. No pool is composed here (CONTRACT 1, R-E3S-R1).
function encFirstWeapon(rec, refData) {
  const SWc = window.SWItems;
  if (!rec || !SWc) return null;
  const vocab = (refData && refData.skillsVocab) || [];
  for (const w of (rec.weapons || [])) {
    let raw = null;
    if (typeof w === 'string' && refData && refData.canonWeapons && refData.canonWeapons[w]) raw = refData.canonWeapons[w];
    else if (w && typeof w === 'object' && w.name) raw = w;
    const d = raw ? SWc.canonicalToStore(raw, 'weapons') : null;
    if (!d || !d.skillKey) continue;
    const v = vocab.find(x => x.id === d.skillKey); if (!v) continue;
    return { name: d.name, skill: d.skill || v.name || '', dmg: d.damage, crit: d.crit, range: String(d.range || '').toUpperCase(),
             raw: raw, skillKey: d.skillKey, characteristic: v.characteristic };
  }
  return null;
}
// THE ONE POOL PATH (CONTRACT 1): the NPC arm of `SWRPGSheetPool.weaponPoolOf`, with what the record holds — the skill's
// characteristic, its rank (a minion line's group rank, `BenchStore.minionGroupRanks(standing)`, for a LISTED skill, else 0)
// and the Brawn. `difficultySet` is the window's DIFFICULTY chip (null = unmoved). Null before the core is in (R-E3DM-R1).
function encWeaponSpec(rec, w, groupRank, difficultySet) {
  const SP = window.SWRPGSheetPool;
  if (!rec || !w || !SP || !SP.weaponPoolOf) return null;
  const sk = (rec.skills || []).find(x => x && x.skill_ref === w.skillKey);
  const rank = sk ? (groupRank != null ? groupRank : (sk.rank || 0)) : 0;
  const chars = rec.characteristics || {};
  return SP.weaponPoolOf(null, w.raw, { npc: { characteristic: chars[w.characteristic] || 0, rank: rank, brawn: chars.brawn || 0 },
    difficultySet: difficultySet != null ? difficultySet : null });
}
// What the plate draws (ADDENDUM 1 Q-A): the same spec's pool without its difficulty and challenge dice — the DIFFICULTY is
// the window's. A projection of the one spec, not a second composition.
function encPlatePool(spec) {
  const D = window.SWRPGDice;
  if (!spec || !D || !D.buildPool) return null;
  return Object.assign({}, D.buildPool(spec), { difficulty: 0, challenge: 0 });
}
// D-E3RH2: the shell's chrome hidden while the window is open. The library's idle fade (useAutoHideChrome) wakes the chrome on
// any pointer or key, so the class is set again after each wake while open, and cleared on every way the window goes.
function useEncChromeHidden() {
  useEffect(() => {
    const b = document.body, o = { passive: true }, evs = ['mousemove', 'pointerdown', 'keydown', 'focus'];
    let alive = true;
    const hold = () => { Promise.resolve().then(() => { if (alive) b.classList.add('chrome-hidden'); }); };
    b.classList.add('chrome-hidden');
    evs.forEach(e => window.addEventListener(e, hold, o));
    return () => { alive = false; evs.forEach(e => window.removeEventListener(e, hold, o)); b.classList.remove('chrome-hidden'); };
  }, []);
}
// THE WINDOW (D-507): the shared paper dice window in `given` mode on the member's weapon, with NO sheet for its whole life
// (R-E3S-4, R-E3DM-R3); `specAt` re-folds through the arm on a DIFFICULTY change (R-E3DM-R2); the head names the NPC (Q-B).
function EncRollWindow({ m, ctx, onClose }) {
  useEncChromeHidden();
  const H = window.SWRPGDiceHub, rec = ctx.wsRead(m).r, pv = ctx.poolView(m);
  const w = encFirstWeapon(rec, ctx.refData), ranks = pv ? pv.ranks : null;
  const spec = encWeaponSpec(rec, w, ranks, null);
  if (!H || !H.DiceHub || !spec) return null;
  return <H.DiceHub accent={ctx.accent} onClose={onClose}
    given={{ spec: spec, specAt: (d) => encWeaponSpec(rec, w, ranks, d), label: w.name, title: ctx.nameOf(m) }} />;
}

// ── THE SHEET: a scrim and a paper plate over the shell (desk: centred; phone: full width under the head) ──
function EncSheet({ title, tag, onClose, children, foot, row, alert, cover, testid }) {
  const zone = useRef(null);
  const [top, setTop] = useState(0);
  const shell = typeof document !== 'undefined' ? document.querySelector('[data-npc-shell]') : null;
  React.useLayoutEffect(() => {
    if (!shell) { setTop(0); return; }   // the scrim starts under the ENCOUNTERS head at every width (F5, F6 at 1440)
    const hd = (cover || alert || window.innerWidth >= 1024 ? null : shell.querySelector('.enc-drow')) || shell.querySelector('.nl-head');   // a confirm dims Destiny too (F7c)
    if (hd) setTop(Math.max(0, hd.getBoundingClientRect().bottom - shell.getBoundingClientRect().top));
  }, [shell, cover, alert]);
  useEffect(() => { const cue = window.SWRPGScrollCue; return (cue && zone.current) ? cue.watch(zone.current) : undefined; }, []);
  // B-1825/B-1826 (ADDENDUM 631): the sheet holds focus (the sheet, not the shell it portals into), and Escape is the
  // close its × and its scrim call; a sheet with no close (none is drawn today) gains no Escape
  const held = useRef(null);
  window.SWRPGUI.useHoldFocus(held, true);
  window.SWRPGUI.useEscape(!!onClose, () => { if (onClose) onClose(); });
  if (!shell || !window.ReactDOM || !ReactDOM.createPortal) return null;
  return ReactDOM.createPortal(
    <div className="enc-scrim" style={{ top: top + 'px' }} data-enc-sheet={testid || 'sheet'}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="enc-sheet" role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} ref={held}>
        <div className="enc-sh"><h2>{title}</h2>{tag || null}
          {onClose && !alert ? <button type="button" className="nl-glyph" aria-label="Close" onClick={onClose}>×</button> : null}</div>
        {row || null}
        <div className="enc-sb" ref={zone}>{children}</div>
        {foot ? <div className="enc-sf">{foot}</div> : null}
      </div>
    </div>, shell);
}
function EncCite({ t }) { return <span className="hp-cite">{t}</span>; }

// ── THE HEAD (F2–F8): ‹ back · ENCOUNTERS / CONFLICT · the Destiny strip ──
function EncDestiny({ table, applyTable }) {
  const [setting, setSetting] = useState(null);
  const d = encRoom(table).destiny;
  const flip = (from) => applyTable(prev => { const r = EL().flipDestiny(prev, from); return r.refused ? prev : r.room; });
  const pips = (side, n) => Array.from({ length: n }).map((_, i) => (
    <button key={side + i} type="button" className="enc-pip" data-side={side} aria-label={side === 'light' ? 'Flip a light side point' : 'Flip a dark side point'}
      onClick={() => flip(side)}>{encSym(side === 'light' ? 'lightside' : 'darkside')}</button>));
  return (
    <div className="enc-destiny" role="group" aria-label="Destiny pool" data-enc-destiny="1">
      <span className="enc-dlab">LIGHT <b data-enc-light="1">{d.light}</b></span>{pips('light', d.light)}
      <span className="enc-dlab">DARK <b data-enc-dark="1">{d.dark}</b></span>{pips('dark', d.dark)}
      <button type="button" className="hp-quiet" style={{ marginLeft: '8px' }} onClick={() => setSetting({ light: d.light, dark: d.dark })}>SET</button>
      {setting ? (
        <EncSheet title="SET DESTINY" testid="destiny" onClose={() => setSetting(null)}
          foot={<React.Fragment><button type="button" className="hp-commit" onClick={() => {
            applyTable(prev => EL().setDestiny(prev, setting.light, setting.dark)); setSetting(null); }}>SET</button>
            <span style={{ flex: 1 }} /><button type="button" className="hp-quiet" onClick={() => setSetting(null)}>CANCEL</button></React.Fragment>}>
          {[['light', 'LIGHT'], ['dark', 'DARK']].map(([k, w]) => (
            <div key={k} className="enc-row"><span className="enc-rn">{w}</span>
              <span className="nl-step">
                <button type="button" className="sb-trk-btn" aria-label={'One fewer ' + k + ' side point'} disabled={setting[k] <= 0}
                  onClick={() => setSetting(Object.assign({}, setting, { [k]: Math.max(0, setting[k] - 1) }))}>−</button>
                <b data-enc-set={k}>{setting[k]}</b>
                <button type="button" className="sb-trk-btn" aria-label={'One more ' + k + ' side point'}
                  onClick={() => setSetting(Object.assign({}, setting, { [k]: setting[k] + 1 }))}>+</button>
              </span></div>))}
        </EncSheet>
      ) : null}
    </div>
  );
}
function EncounterHead({ back, onBack, table, applyTable, desk }) {
  const strip = <EncDestiny table={table} applyTable={applyTable} />;
  return (
    <React.Fragment>
      <div className="nl-head" data-enc-head="1">
        <button type="button" className="nl-back" aria-label={'Back to ' + (back === 'ENCOUNTERS' ? 'the encounters' : 'GM Holocron')} onClick={onBack}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><polyline points="13,4 7,10 13,16" /></svg>{back}
        </button>
        <div className="nl-title"><b>ENCOUNTERS</b><span>CONFLICT</span></div>
        {desk ? <div className="enc-dslot">{strip}</div> : <span />}
      </div>
      {desk ? null : <div className="enc-drow">{strip}</div>}
    </React.Fragment>
  );
}

// The state word (F2, F3–F8): RUNNING · ROUND n · PREPPED · DONE · n ROUNDS
function encStateWord(g, table) {
  const st = g.state || 'prepped';
  if (st === 'running') return 'RUNNING · ROUND ' + (encRoom(table).initiative.round || 1);
  if (st === 'done') return 'DONE · ' + (g.rounds || 0) + ' ' + ((g.rounds || 0) === 1 ? 'ROUND' : 'ROUNDS');
  return ENC_STATE_WORD.prepped;
}

// ── DELETE, confirmed (B-1794; F7c's idiom) ──
function EncDeleteConfirm({ g, onCancel, onDelete }) {
  const n = g.members.length;
  return (
    <EncSheet alert title={'DELETE ' + String(g.name).toUpperCase() + '?'} testid="confirm-delete" onClose={onCancel}
      foot={<React.Fragment><button type="button" className="hp-commit" data-enc-confirm="delete" onClick={onDelete}>DELETE</button>
        <span style={{ flex: 1 }} /><button type="button" className="hp-quiet" onClick={onCancel}>CANCEL</button></React.Fragment>}>
      <p className="enc-read" style={{ boxShadow: 'none', padding: 0 }}>
        {g.name + ' and its ' + n + ' ' + (n === 1 ? 'member' : 'members') + ' are deleted, with every mark on them' + (g.state === 'running' ? ', and the initiative order is cleared.' : '.')}
      </p>
    </EncSheet>
  );
}

// ── F2 · THE LIST ──
function EncList({ groups, actions, resolveBySourceKey, tierOf, onOpen, manager }) {
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState(null);
  const create = () => { if (newName.trim()) { actions.create(newName); setNewName(''); } };
  const num = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; };
  const del = groups.filter(g => g.id === deleting)[0] || null;
  return (
    <div data-npc-state={groups.length ? 'encounters' : 'encounters-empty'} data-enc="list">
      <div className="nl-newrow">
        <input type="text" className="nl-in" value={newName} placeholder="New encounter name…" aria-label="New encounter name"
          onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} />
        <button type="button" className="hp-quiet" disabled={!newName.trim()} onClick={create}>+ NEW ENCOUNTER</button>
      </div>
      {groups.length === 0 ? null : (
        <div className="hp-plate" data-pad="snug"><div className="nl-glist hp-bands">
          {groups.map(g => {
            const pcs = g.members.filter(m => m.kind === 'pc').length, npcs = g.members.length - pcs;
            return (
              <div key={g.id} className="nl-grow" data-npc-group={g.id} data-enc-state={g.state || 'prepped'}>
                <div className="nl-gn enc-gn"><b>{g.name}</b>
                  <span>{npcs + ' ' + (npcs === 1 ? 'NPC' : 'NPCs') + (pcs ? ' · ' + pcs + ' ' + (pcs === 1 ? 'PC' : 'PCs') : '')}</span>
                  <span className="enc-state" data-s={g.state || 'prepped'} data-enc-word="1">{encStateWord(g, manager.table)}</span></div>
                <div className="nl-mstrip" data-testid="encounter-member-strip">
                  {g.members.slice(0, 6).map(m => {
                    if (m.kind === 'pc') {
                      // a PC's chip: its wounds from the saved sheet, or PC (its attributes ordered so the minion chip stays the
                      // first nl-mchip that test/pfr34_npc_display.cjs lifts and runs)
                      const pc = encPcOf(m), tv = encPcTable(m, pc), v = encPcVitals(pc.rec) || (tv && tv.v);
                      return (<span key={m.id} data-enc-pc="1" data-hurt={v && v.w > 0 ? '1' : '0'} className="nl-mchip"><NpcPaperMono name={pc.name} /><b>{pc.name}</b>
                        <span data-enc-pc="1" data-npc-chip-val="1">{v ? v.w + '/' + v.wt : 'PC'}</span></span>);
                    }
                    const rend = resolveBySourceKey(m._source_key);
                    const nm = rend ? rend.name : 'unknown';
                    const wt = npcWoundThreshold(rend && rend.derived);
                    const minion = tierOf(m) === 'minion';
                    const count = Math.max(1, num(m.count));
                    const mx = minion ? BenchStore.minionPoolMax(wt, count) : wt;
                    const cur = minion ? num(m.poolWounds) : BenchStore.clampCurrent(num(m.currentWounds), wt);
                    return (
                      <span key={m.id} className="nl-mchip" data-hurt={cur > 0 ? '1' : '0'}>
                        <NpcPaperMono name={nm} /><b>{nm}{count > 1 ? ' ×' + count : ''}</b>
                        <span data-npc-chip-val="1">{mx ? cur + '/' + mx : (cur ? String(cur) : '—')}</span>
                      </span>
                    );
                  })}
                  {g.members.length > 6 ? <span className="nl-more">+{g.members.length - 6}</span> : null}
                </div>
                <div className="nl-gacts">
                  <button type="button" className="hp-quiet" onClick={() => onOpen(g.id)}>OPEN</button>
                  <button type="button" className="hp-quiet" onClick={() => setDeleting(g.id)}>DELETE</button>
                </div>
              </div>
            );
          })}
        </div></div>
      )}
      {del ? <EncDeleteConfirm g={del} onCancel={() => setDeleting(null)}
        onDelete={() => { manager.applyBoth((b, r) => EL().deleteEncounter(b, r, del.id)); setDeleting(null); }} /> : null}
    </div>
  );
}

// ── ADD PLAYER CHARACTER (§6, F3): THE GROUP · ADD ALL, then this device's saved characters, then By name… ──
// ENCOUNTERS E6 frames (F7-a, ADDENDUM 2): a fight in a campaign takes THAT campaign's party; with none (today, or a
// campaign gone) the implicit 'party' as before.
function encCampaignOf(g) {
  const Cs = window.SWRPGCampaigns;
  const c = Cs && g && g.campaignId ? Cs.campaignOf(Cs.load(), g.campaignId) : null;
  return c && c.role === 'gm' ? c : null;
}
function encCampaignsOn() { return !!(window.SWRPGCampaignsDoor && window.SWRPGCampaignsDoor.on() && window.SWRPGCampaigns); }
function EncAddPc({ g, manager }) {
  const [byName, setByName] = useState(null);
  const P = window.SWRPGParty, R = window.SWRPGRoster;
  const camp = encCampaignOf(g);
  const party = P ? P.partyOf(P.load(), camp && camp.partyId ? camp.partyId : null) : null;
  const inEnc = {}; g.members.forEach(m => { if (m.kind === 'pc') inEnc[m.who] = true; });
  const saved = R ? (R.loadSavedCharacters() || []).filter(c => c && c.id != null) : [];
  const nameOf = (who) => encPcOf({ who: who });
  const groupWhos = ((party && party.members) || []).map(m => m.who).filter(Boolean);
  const add = (whos) => manager.applyBench(prev => whos.reduce((s, w) => (inEnc[w] ? s : BenchStore.addPcMember(s, g.id, w)), prev));
  const row = (who, name, line) => (
    <div key={who} className="enc-row"><span className="enc-rn">{name}<small>{line}</small></span>
      {inEnc[who] ? <span className="enc-tag">ADDED</span>
        : <button type="button" className="hp-quiet" aria-label={'Add ' + name} onClick={() => add([who])}>+ ADD</button>}</div>);
  return (
    <div role="group" aria-label="Add a player character" data-enc-addpc="1">
      {/* ADDENDUM 17 Q2: with no group there is nothing to head, so THE GROUP and its line are not drawn */}
      {groupWhos.length ? (
        <React.Fragment>
          <div className="enc-sub" style={{ display: 'flex', alignItems: 'center', marginTop: 0 }}><span style={{ marginRight: 'auto' }}>THE GROUP</span>
            <button type="button" className="hp-quiet" onClick={() => add(groupWhos)}>ADD ALL</button></div>
          {groupWhos.map(w => { const pc = nameOf(w); return row(w, pc.name, pc.line || 'PC'); })}
        </React.Fragment>) : null}
      <div className="enc-sub" style={groupWhos.length ? null : { marginTop: 0 }}>ON THIS DEVICE</div>
      {saved.filter(c => groupWhos.indexOf('char:' + c.id) === -1).map(c => row('char:' + c.id, c.name || 'Unnamed', [c.species, c.career].filter(Boolean).join(' ')))}
      <div className="enc-row" style={{ borderBottom: 0 }}>
        {byName == null ? <button type="button" className="hp-quiet nl-dashed" style={{ width: '100%' }} onClick={() => setByName('')}>BY NAME…</button> : (
          <React.Fragment>
            <input className="nl-in" autoFocus value={byName} aria-label="A player character by name"
              onChange={e => setByName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && byName.trim()) { add(['name:' + byName.trim()]); setByName(null); } }} style={{ flex: 1 }} />
            <button type="button" className="hp-quiet" disabled={!byName.trim()} onClick={() => { add(['name:' + byName.trim()]); setByName(null); }}>+ ADD</button>
          </React.Fragment>)}
      </div>
    </div>
  );
}

// ── D1 · THE FIGHT'S CAMPAIGN (D-540; concept §12 "PREP: a CAMPAIGN line naming the encounter's campaign, or NONE,
// with a pick"): the block above ADD PLAYER CHARACTER, and its sheet of the GM's campaigns and NONE. Writes bench v7
// `group.campaignId` through its one writer, BenchStore.setGroupCampaign. Drawn only while swrpg_campaigns_door is on.
function encBook(c) { const V = window.SWRPGCampaignsView; return c && c.frame && V && V.bookName ? V.bookName(c.frame.book) : ''; }
function EncCampaignBlock({ g, onPick }) {
  const c = encCampaignOf(g);
  return (
    <div data-camp-pick="1">
      <div className="hp-sechead"><h2>CAMPAIGN</h2></div>
      <div className="enc-row"><span className="enc-rn">{c ? c.name : 'NONE'}{c ? <small>{encBook(c)}</small> : null}</span>
        <button type="button" className="hp-quiet" aria-label={c ? 'Change the campaign' : 'Pick a campaign'} onClick={onPick}>{c ? 'CHANGE' : 'PICK'}</button></div>
    </div>
  );
}
function EncCampaignPick({ g, manager, onClose }) {
  const Cs = window.SWRPGCampaigns;
  const list = Cs ? Cs.load().campaigns.filter(c => c && c.role === 'gm') : [];
  const cur = encCampaignOf(g);
  const choose = (id) => { manager.applyBench(prev => BenchStore.setGroupCampaign(prev, g.id, id)); onClose(); };
  const pick = (on, label, sub, id) => (
    <button key={id || 'none'} type="button" className="enc-row hp-quiet" aria-pressed={on ? 'true' : 'false'} aria-label={label} onClick={() => choose(id)}
      style={Object.assign({ width: '100%', textAlign: 'left', letterSpacing: 0, textTransform: 'none', padding: '4px 10px', justifyContent: 'flex-start' },
        on ? { outline: '2px solid var(--doc-action,#7E1414)', outlineOffset: -2 } : {})}>
      <span className="enc-rn">{label}{sub ? <small>{sub}</small> : null}</span>{on ? <span className="enc-tag" data-side="PC">✓</span> : null}
    </button>);
  return (
    <EncSheet title="CAMPAIGN" testid="camp" onClose={onClose}>
      {list.map(c => pick(!!cur && cur.id === c.id, c.name, encBook(c), c.id))}
      {pick(!cur, 'NONE', null, null)}
    </EncSheet>
  );
}

// ── THE CONDITIONS, ONE ROW (D-504's card): the chips in their order; what does not fit goes behind +n; a chip the
// timer proposes ends is dimmed with ENDS and carries KEEP · CLEAR (shape §3 row 7, §10) ──
function EncConds({ m, ctx, dense }) {
  const { condsOf, toggleCond, condAddFor, setCondAddFor, ends, keepEnds, clearEnds, readOnly } = ctx;
  const row = useRef(null);
  const [hidden, setHidden] = useState(0);
  const [open, setOpen] = useState(false);
  const cur = condsOf(m);
  const known = BENCH_COND_SET.map(c => c[0]);
  const extra = cur.filter(t => known.indexOf(t) === -1);
  const ending = (ends || []).filter(x => x.memberId === m.id).map(x => x.condition);
  const chips = BENCH_COND_SET.map(c => [c[0], c[1], cur.indexOf(c[0]) !== -1]).concat(extra.map(t => [t, t, true]));
  React.useLayoutEffect(() => {
    const el = row.current; if (!el || open) { setHidden(0); return; }
    const kids = Array.prototype.slice.call(el.querySelectorAll(':scope > [data-enc-c]'));
    kids.forEach(k => { k.style.display = ''; });
    const more = el.querySelector(':scope > [data-enc-more]');
    const room = el.clientWidth, gap = parseFloat(getComputedStyle(el).columnGap) || 6;
    let used = 0, n = 0, full = false;
    const pinned = (k) => k.getAttribute('data-on') === '1' || k.hasAttribute('data-enc-pin');
    kids.filter(pinned).forEach(k => { used += k.getBoundingClientRect().width + gap; });
    const moreW = (more ? more.getBoundingClientRect().width : 48) + gap;
    kids.forEach(k => { if (pinned(k)) return; const w = k.getBoundingClientRect().width + gap;
      if (!full && used + w + moreW <= room + gap) used += w; else { full = true; n++; k.style.display = 'none'; } });
    setHidden(n);
  });
  const dis = readOnly ? { disabled: true, 'aria-disabled': 'true' } : {};
  return (
    <div className="nl-conds enc-conds" data-open={open ? '1' : '0'} data-dense={dense ? '1' : '0'} role="group" aria-label="Conditions" ref={row}>
      {chips.map(([key, label, on]) => {
        const end = on && ending.indexOf(key) !== -1;
        const chip = (
          <button key={key} type="button" className={'hp-quiet nl-cond' + (end ? ' enc-ends' : '')} data-on={on ? '1' : '0'} data-enc-c={key}
            data-enc-pin={end ? '1' : undefined} aria-pressed={on ? 'true' : 'false'} aria-label={label + (on ? ' (on)' : '') + (end ? ', ends' : '')}
            onClick={(e) => { e.stopPropagation(); toggleCond(m, key); }} {...dis}>{label}{end ? <span className="enc-endtag">ENDS</span> : null}</button>);
        if (!end) return chip;
        return (<React.Fragment key={key}>{chip}
          <button type="button" className="hp-quiet nl-cond" data-enc-c={key + '-keep'} data-enc-pin="1" onClick={(e) => { e.stopPropagation(); keepEnds(m, key); }}>KEEP</button>
          <button type="button" className="hp-quiet nl-cond" data-enc-c={key + '-clear'} data-enc-pin="1" onClick={(e) => { e.stopPropagation(); clearEnds(m, key); }}>CLEAR</button>
        </React.Fragment>);
      })}
      {readOnly ? null : (condAddFor === m.id ? (
        <input className="nl-in nl-condin" autoFocus placeholder="condition…" aria-label="Add a custom condition" data-enc-c="add" data-enc-pin="1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim().toLowerCase(); if (v) toggleCond(m, v); setCondAddFor(null); } else if (e.key === 'Escape') setCondAddFor(null); }}
          onBlur={e => { const v = e.target.value.trim().toLowerCase(); if (v) toggleCond(m, v); setCondAddFor(null); }} />
      ) : (
        <button type="button" className="hp-quiet nl-add" data-enc-c="add" aria-label="Add a custom condition"
          onClick={(e) => { e.stopPropagation(); setCondAddFor(m.id); }}>{dense ? '+' : '+ ADD'}</button>
      ))}
      {hidden > 0 || open ? (
        <button type="button" className="hp-quiet nl-cond enc-more" data-enc-more="1" data-on="0" aria-expanded={open ? 'true' : 'false'}
          aria-label={open ? 'Show fewer conditions' : 'Show all conditions'} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? '−' : '+' + hidden}</button>
      ) : null}
    </div>
  );
}

// ── THE DAMAGE BOX (B-1801, D-504): type the hit, the card proposes damage − soak, the GM edits it and APPLIES ──
function EncDamage({ m, ctx, soak, name, minion }) {
  const [dmg, setDmg] = useState('');
  const [edit, setEdit] = useState(null);
  const n = parseInt(dmg, 10);
  const prop = isNaN(n) ? null : Math.max(0, n - (soak || 0));
  const val = edit != null ? edit : (prop == null ? '' : String(prop));
  const apply = () => {
    const v = parseInt(val, 10); if (isNaN(v) || v < 0) return;
    if (minion) ctx.applyPool(m, v); else ctx.setW(m, (m.currentWounds || 0) + v);
    setDmg(''); setEdit(null);
  };
  const field = (
    <label className="enc-dmg" onClick={(e) => e.stopPropagation()}><span>DAMAGE</span>
      <input className="enc-in" type="text" inputMode="numeric" pattern="[0-9]*" aria-label={'Damage to ' + name} value={dmg}
        data-enc-dmg={m.id} onChange={e => { setDmg(e.target.value.replace(/[^0-9]/g, '')); setEdit(null); }}
        onKeyDown={e => { if (e.key === 'Enter') apply(); }} /></label>);
  const proposal = prop == null ? null : (
    <div className="enc-prop" role="group" aria-label={'Damage to ' + name} onClick={(e) => e.stopPropagation()} data-enc-prop={m.id}>
      <span className="enc-psum">{n + ' − SOAK ' + (soak || 0) + ' ='}{edit != null && String(prop) !== val ? <s aria-label={'proposed ' + prop}>{prop}</s> : null}</span>
      <input className="enc-in enc-res" type="text" inputMode="numeric" pattern="[0-9]*" aria-label={'Wounds to apply to ' + name} value={val}
        data-edited={edit != null && String(prop) !== val ? '1' : '0'} data-enc-res={m.id}
        onChange={e => setEdit(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') apply(); }} />
      <button type="button" className="enc-apply" data-enc-apply={m.id} onClick={apply}>APPLY</button>
    </div>);
  return { field: field, proposal: proposal };
}
function EncDamageSlot({ m, ctx, soak, name, minion, children }) {
  const d = EncDamage({ m, ctx, soak, name, minion });
  return children(d.field, d.proposal);
}

// ── THE CARD'S ONE MENU (D-504 ADDENDUM 1 Q2): MOVE UP · MOVE DOWN · REMOVE (REMOVE does what × did) ──
function EncCardMenu({ m, name, i, last, ctx }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (btn.current && !btn.current.parentNode.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [open]);
  const act = (fn) => (e) => { e.stopPropagation(); setOpen(false); fn(); };
  return (
    <span className="enc-menuwrap">
      <button type="button" ref={btn} className="enc-menu" aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} aria-label={'Card menu: ' + name}
        data-enc-menu={m.id} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} disabled={ctx.readOnly} aria-disabled={ctx.readOnly ? 'true' : undefined}>⋮</button>
      {open ? (
        <span className="enc-pop" role="menu" aria-label={'Card menu: ' + name}>
          <button type="button" role="menuitem" disabled={i <= 0} onClick={act(() => ctx.reorderMember(m, -1))}>MOVE UP</button>
          <button type="button" role="menuitem" disabled={i < 0 || i >= last} onClick={act(() => ctx.reorderMember(m, 1))}>MOVE DOWN</button>
          <button type="button" role="menuitem" onClick={act(() => ctx.actions.removeMember(ctx.openGroup.id, m.id))}>REMOVE</button>
        </span>
      ) : null}
    </span>
  );
}

// The roll row (F4): the member's first weapon as a dice plate; rivals and nemeses carry CRIT and their crit chips.
function EncRollRow({ m, rec, tier, ctx, phone }) {
  const pv = ctx.poolView(m);
  const w = ctx.readOnly ? null : encFirstWeapon(rec, ctx.refData);   // F8: the done record draws no dice plate
  const plate = w && ctx.coreReady ? encPlatePool(encWeaponSpec(rec, w, pv ? pv.ranks : null, null)) : null;   // Q-E: none until the core
  const canCrit = tier === 'rival' || tier === 'nemesis';
  if (!w && !canCrit) return null;
  const rows = ctx.critRows;
  return (
    <React.Fragment>
      {w ? (
        <div className="enc-roll" data-enc-roll={m.id}>
          <span className="enc-wn">{w.name}<small>{[String(w.skill).toUpperCase(), 'DMG ' + w.dmg, 'CRIT ' + w.crit, w.range].filter(Boolean).join(' · ')}</small></span>
          <EncPress pool={plate} label={w.name} open={ctx.rollId === m.id} onPress={() => ctx.openRoll(m)} />
          {canCrit && !ctx.readOnly ? <button type="button" className="hp-quiet nl-crit" aria-label={'Critical injury — roll for ' + ctx.nameOf(m)}
            onClick={(e) => { e.stopPropagation(); ctx.openCrit(m); }}>CRIT</button> : null}
        </div>
      ) : null}
      {(m.crits || []).length ? (
        <div className="enc-chips" data-enc-crits={m.id}>
          {m.crits.map((c, j) => (
            <button key={j} type="button" className="enc-chip" aria-label={'Critical injury ' + c.roll + ', ' + encCritName(rows, c)}
              onClick={(e) => { e.stopPropagation(); if (!ctx.readOnly) ctx.openCrit(m); }}><b>{String(c.roll)}</b>{'· ' + encCritName(rows, c)}</button>))}
        </div>
      ) : null}
    </React.Fragment>
  );
}

// ── THE MEMBER CARD (F3/F4 as D-504 draws it) ──
function EncCard({ m, ctx }) {
  const { wsRead, memberParts, flipKey, selectMember, orderedMembers } = ctx;
  const ids = orderedMembers.map(x => x.id), i = ids.indexOf(m.id), last = ids.length - 1;
  const sel = m.id === flipKey;
  if (m.kind === 'pc') {
    const pc = encPcOf(m), tv = encPcTable(m, pc), v = encPcVitals(pc.rec) || (tv && tv.v);
    return (
      <div className="hp-plate nl-bcard" data-pad="snug" data-sel={sel ? '1' : '0'} data-npc-member={m.id} data-enc-pc="1"
        role="button" tabIndex={0} aria-pressed={sel} aria-label={'Select ' + pc.name} onClick={() => selectMember(m)} onKeyDown={cardPressKeys(() => selectMember(m))}>
        <div className="nl-card-h"><NpcPaperMono name={pc.name} /><div className="nl-cn"><b>{pc.name}</b><span className="nl-tier">{encPcTier(pc)}</span></div>
          <EncCardMenu m={m} name={pc.name} i={i} last={last} ctx={ctx} /></div>
        {v ? (
          <div className="hp-plate" data-pad="data"><div className="sb-vit">
            {[['Wounds', v.w, v.wt], ['Strain', v.s, v.st]].map(([k, c, mx]) => (
              <div key={k} className="sb-vitrow" data-track={k.toLowerCase()}><div><div className="sb-vitkey">{k}</div>
                <div className="sb-meter"><i style={{ width: (mx ? Math.min(100, Math.round(c * 100 / mx)) : 0) + '%' }} /></div></div>
                <div className="sb-trk"><span className="sb-vitval sb-trk-val">{c}<span className="sb-of"> / {mx}</span></span></div></div>))}
            <EncLiveTag t={tv} />
          </div></div>
        ) : null}
        <EncConds m={m} ctx={ctx} />
      </div>
    );
  }
  const ws = wsRead(m); const r = ws.r; const ok = !!r;
  const parts = memberParts(m, ok ? (r.name || m._source_key) : (m._source_key + ' (missing)'));
  const name = parts.base + parts.suffix;
  const aboard = m.vehicle ? (ctx.openGroup.vehicles || []).filter(v => v.id === m.vehicle.id)[0] : null;
  const vrec = aboard ? craftVehicle(ctx.refData, aboard) : null;
  const soak = r && r.derived ? r.derived.soak || 0 : 0;
  const rolls = ctx.mode !== 'prepped' && ok ? <EncRollRow m={m} rec={r} tier={ws.tier} ctx={ctx} /> : null;
  return (
    <div className="hp-plate nl-bcard" data-pad="snug" data-sel={sel ? '1' : '0'} data-npc-member={m.id}
      role="button" tabIndex={0} aria-pressed={sel} aria-label={'Select ' + name} onClick={() => selectMember(m)} onKeyDown={cardPressKeys(() => selectMember(m))}>
      <div className="nl-card-h">
        <NpcPaperMono name={parts.base} />
        <div className="nl-cn"><b data-miss={ok ? '0' : '1'}>{parts.base}{parts.suffix}</b>
          {aboard ? <span className="enc-aboard">{'ABOARD · ' + ctx.craftLabel(aboard, vrec ? vrec.name : aboard.key) + (m.vehicle.pilot ? ' · PILOT' : '')}</span> : null}
          <span className="nl-tier">{ws.tier || 'unknown'}</span></div>
        <EncCardMenu m={m} name={name} i={i} last={last} ctx={ctx} />
      </div>
      {ws.isMinion ? <EncMinionFrame m={m} ctx={ctx} soak={soak} rolls={rolls} /> : (
        <React.Fragment>
          <EncDamageSlot m={m} ctx={ctx} soak={soak} name={name}>{(field, proposal) => (
            <div className="hp-plate" data-pad="data"><div className="sb-vit">
              <div className="enc-wrow">
                <BenchWSBar m={m} kind="w" variant="card" ctx={ctx} />
                {ctx.readOnly ? null : field}
                {proposal}
              </div>
              {ws.hasStrain ? <BenchWSBar m={m} kind="s" variant="card" ctx={ctx} /> : null}
            </div></div>
          )}</EncDamageSlot>
          {rolls}
          <EncConds m={m} ctx={ctx} />
        </React.Fragment>
      )}
    </div>
  );
}
// The minion plate (D-504 ADDENDUM 1 Q1): the pips beside the standing line; GROUP SKILLS and the cite on one line; the
// DAMAGE field beside the line's steppers (APPLY writes poolWounds).
function EncMinionFrame({ m, ctx, soak, rolls }) {
  const { poolView, memberLabel, bumpLine, critLine, bumpCount } = ctx;
  const pv = poolView(m); if (!pv) return null;
  const name = memberLabel(m, pv.r.name || m._source_key);
  const b = npcBandOf(pv.wounds, pv.poolMax);
  const pct = pv.poolMax ? Math.max(0, Math.min(100, Math.round(pv.wounds * 100 / pv.poolMax))) : 0;
  const dis = ctx.benchStale || ctx.readOnly ? { disabled: true, 'aria-disabled': 'true', style: { opacity: 0.4, pointerEvents: 'none' } } : {};
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <EncDamageSlot m={m} ctx={ctx} soak={soak} name={'the ' + name + ' line'} minion>{(field, proposal) => (
      <div className="hp-plate" data-pad="data" role="group" aria-label={name + ' minion pool'} data-npc-pool={m.id}>
        <div className="nl-poolh"><span className="nl-tier">{name.toUpperCase()}</span>
          <span className="nl-step">
            <button type="button" className="sb-trk-btn" data-testid="pool-count-minus" aria-label={'One fewer ' + name} onClick={stop(() => bumpCount(m, -1))} {...dis}>−</button>
            <b>×{pv.count}</b>
            <button type="button" className="sb-trk-btn" data-testid="pool-count-plus" aria-label={'One more ' + name} onClick={stop(() => bumpCount(m, 1))} {...dis}>+</button>
          </span></div>
        <div className="sb-vitrow nl-poolrow enc-standing" data-state={b.down ? 'down' : (b.band >= 2 ? 'pressed' : 'clear')} data-band={b.down ? 3 : b.band}>
          <div>
            <div className="sb-vitkey" aria-live="polite"><b>{pv.standing}</b> of {pv.count} standing · {pv.wounds}/{pv.poolMax} wounds</div>
            <div className="sb-meter"><i style={{ width: pct + '%' }} /></div>
            {pv.standing === 0 ? <div className="sb-vitword">{NPC_DOWN_WORD}</div> : null}
          </div>
          <div className="nl-pips" aria-hidden="true">{Array.from({ length: pv.count }).map((_, i) => <i key={i} data-on={i < pv.standing ? '1' : '0'} />)}</div>
        </div>
        <div className="nl-poolacts">
          <button type="button" className="sb-trk-btn" aria-label={'Remove one wound from ' + name} onClick={stop(() => bumpLine(m, -1))} {...dis}>−</button>
          <button type="button" className="sb-trk-btn" aria-label={'Add one wound to ' + name} onClick={stop(() => bumpLine(m, 1))} {...dis}>+</button>
          <button type="button" className="hp-quiet nl-crit" aria-label={'Critical hit — drop one ' + name} onClick={stop(() => critLine(m))} {...dis}>CRIT</button>
          {ctx.readOnly ? null : field}
          <span className="nl-sp" />
        </div>
        {proposal}
        <div className="enc-skcite"><span className="nl-tier">GROUP SKILLS: <b>{pv.ranks}</b> {pv.ranks === 1 ? 'rank' : 'ranks'}</span>
          <div className="nl-cite"><span className="hp-cite">SAME-TYPE POOL · EotE p.390</span></div></div>
        {rolls}
        <EncConds m={m} ctx={ctx} />
      </div>
    )}</EncDamageSlot>
  );
}

// ── THE ORDER RAIL (F4): slot plates in order, side-marked; the active plate raised and named; ROUND n · BACK · NEXT ──
function EncRail({ ctx, phone }) {
  const { slots, ini, nameOf, byId, onNext, onBackSlot, onSlot, readOnly } = ctx.rail;
  const ss = useRef(null);
  useEffect(() => {
    if (!phone || !ss.current) return;
    const act = ss.current.querySelector('[data-active="1"]');
    if (act) ss.current.scrollLeft = Math.max(0, act.offsetLeft - ss.current.offsetLeft - 140);
  }, [phone, ini.active, ini.round]);
  return (
    <div className="enc-rail" role="navigation" aria-label="Initiative order" data-enc-rail="1">
      <div className="enc-railh"><span className="enc-round" data-enc-round="1">{'ROUND ' + ini.round}</span>
        <button type="button" className="hp-quiet" onClick={onBackSlot} disabled={readOnly || ini.active <= 0}>BACK</button>
        <button type="button" className="hp-quiet" onClick={onNext} disabled={readOnly}>NEXT</button></div>
      <div className="enc-slots" ref={ss}>
        {slots.map((s, i) => {
          const open = !s.member;
          const side = ENC_SIDE[s.side];
          return (
            <button key={i} type="button" className="enc-slot" data-side={side} data-open={open ? '1' : '0'}
              data-active={i === ini.active ? '1' : '0'} data-acted={i < ini.active ? '1' : '0'} data-enc-slot={i}
              aria-label={'Slot ' + (i + 1) + ', ' + side + (open ? ' slot, open' : ', ' + nameOf(s.member)) + (i === ini.active ? ', now' : '')}
              onClick={() => onSlot(i)} disabled={readOnly}>
              <span className="enc-n">{String(i + 1)}</span>
              <span className="enc-who"><span className="enc-side">{side}</span><span className="enc-nm">{open ? side + ' SLOT' : nameOf(s.member)}</span></span>
              {i === ini.active ? <span className="enc-now">NOW</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
// F4c · a slot tapped: its side's members who have not acted first, the rest dimmed, all tappable.
function EncClaim({ ctx, index, onClose }) {
  const { slots, ini, nameOf, byId, claimSlot } = ctx.rail;
  const c = EL().candidates(ctx.bench, ctx.table, index);
  const s = slots[index];
  return (
    <EncSheet title={ENC_SIDE[s.side] + ' SLOT · ' + (index + 1) + ' OF ' + slots.length} testid="claim" onClose={onClose}
      tag={<span className="enc-tag">{'ROUND ' + ini.round}</span>}>
      {c.fresh.concat(c.acted).map(id => {
        const done = c.acted.indexOf(id) !== -1;
        return (
          <button key={id} type="button" className="enc-row enc-pick" data-acted={done ? '1' : '0'} data-enc-claim={id}
            onClick={() => { claimSlot(index, id); onClose(); }}>
            <span className="enc-rn">{nameOf(byId[id])}<small>{done ? 'ACTED THIS ROUND' : 'NOT ACTED'}</small></span></button>);
      })}
    </EncSheet>
  );
}

// ── F5 · START — the initiative roll (§3 rows 1–2; §4.3). The results never persist; START writes the order. ──
function EncStart({ ctx, onClose }) {
  const g = ctx.openGroup, L = EL();
  const [skills, setSkills] = useState({ npc: 'cool', pc: 'vigilance' });   // EotE p.198: the side's situation sets the skill
  const pcxt = () => ({ resolve: ctx.resolveBySourceKey, charRecord: (id) => (encPcOf({ who: 'char:' + id }).rec),
    skills: g.members.reduce((o, m) => { o[m.id] = skills[m.kind === 'pc' ? 'pc' : 'npc']; return o; }, {}) });
  const [rows, setRows] = useState(() => ((L.proposeStart(ctx.bench, g.id, pcxt()) || {}).slots || []));
  const [order, setOrder] = useState(() => rows.map(r => r.memberId));
  const [dragged, setDragged] = useState(false);
  const [refused, setRefused] = useState(null);
  const byMid = {}; rows.forEach(r => { byMid[r.memberId] = r; });
  const resort = (next) => { if (!dragged) setOrder(L.sortSlots(next).map(r => r.memberId)); };
  const rollAll = () => {
    const fresh = (L.proposeStart(ctx.bench, g.id, pcxt()) || {}).slots || [];
    const next = rows.map(r => (r.side === 'npc' ? (fresh.filter(f => f.memberId === r.memberId)[0] || r) : r));
    setRows(next); setDragged(false); setOrder(L.sortSlots(next).map(r => r.memberId));
  };
  const setSkill = (side, k) => {
    setSkills(Object.assign({}, skills, { [side]: k }));
  };
  useEffect(() => {   // a side's skill changed: its pools are re-read and re-rolled (nothing written)
    const fresh = (L.proposeStart(ctx.bench, g.id, pcxt()) || {}).slots || [];
    const next = rows.map(r => fresh.filter(f => f.memberId === r.memberId)[0] || r);
    setRows(next); resort(next);
  }, [skills.npc, skills.pc]);
  const type = (mid, k, v) => {
    const n = parseInt(v, 10);
    const next = rows.map(r => r.memberId !== mid ? r : Object.assign({}, r, { result: Object.assign({ success: 0, advantage: 0 }, r.result || {}, { [k]: isNaN(n) ? 0 : n }) }));
    setRows(next); resort(next);
  };
  const move = (from, to) => {
    if (to < 0 || to >= order.length || from === to) return;
    const o = order.slice(); const [x] = o.splice(from, 1); o.splice(to, 0, x); setOrder(o); setDragged(true);
  };
  const drag = useRef(null);
  const onGripDown = (i) => (e) => {
    e.preventDefault(); const list = e.currentTarget.closest('[data-enc-order]');
    drag.current = { i: i, list: list };
    const mv = (ev) => {
      const d = drag.current; if (!d) return;
      const kids = Array.prototype.slice.call(d.list.children);
      let to = kids.findIndex(k => { const b = k.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (to === -1) to = kids.length - 1; else if (to > d.i) to -= 1;
      if (to !== d.i) { move(d.i, to); d.i = to; }
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const nameOf = (mid) => { const m = ctx.byId[mid]; const n = ctx.nameOf(m);   // F5 names a minion line with its size
    return m && m.kind !== 'pc' && ctx.wsRead(m).isMinion && (m.count || 1) > 1 ? n + ' ×' + m.count : n; };
  const sideOf = (r) => ENC_SIDE[r.side];
  const res = (r, ro) => (
    <span className="enc-res">
      {ro ? <React.Fragment>{String((r.result || {}).success || 0)}{encSym('success')}{String((r.result || {}).advantage || 0)}{encSym('advantage')}</React.Fragment> : (
        <React.Fragment>
          <input aria-label={nameOf(r.memberId) + ' successes'} inputMode="numeric" value={r.result ? String(r.result.success || 0) : ''}
            onChange={e => type(r.memberId, 'success', e.target.value.replace(/[^0-9]/g, ''))} />{encSym('success')}
          <input aria-label={nameOf(r.memberId) + ' advantages'} inputMode="numeric" value={r.result ? String(r.result.advantage || 0) : ''}
            onChange={e => type(r.memberId, 'advantage', e.target.value.replace(/[^0-9]/g, ''))} />{encSym('advantage')}
        </React.Fragment>)}
    </span>);
  const every = (
    <div>{rows.map(r => (
      <div key={r.memberId} className="enc-row" data-enc-start-row={r.memberId}>
        <span className="enc-rn">{nameOf(r.memberId)}<small>{sideOf(r) + ' · ' + (r.skill === 'cool' ? 'Cool' : 'Vigilance')}</small></span>
        {r.pool ? <EncPlate pool={r.pool} label={nameOf(r.memberId) + ' ' + r.skill} /> : <span className="enc-tag" style={{ minWidth: '44px', textAlign: 'center' }}>TYPED</span>}
        {res(r, false)}
      </div>))}</div>);
  const ord = (
    <div data-enc-order="1">{order.map((mid, i) => { const r = byMid[mid]; if (!r) return null; return (
      <div key={mid} className="enc-ord" data-side={sideOf(r)} data-enc-ord={mid}>
        <span className="enc-n">{String(i + 1)}</span>
        <button type="button" className="enc-grip" aria-label={'Drag ' + nameOf(mid) + ' — arrow keys move it'} onPointerDown={onGripDown(i)}
          onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); } else if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); } }}>⋮⋮</button>
        <span><span className="enc-tag" data-side={sideOf(r)} style={{ marginRight: '10px' }}>{sideOf(r) + ' SLOT'}</span><b>{nameOf(mid)}</b></span>
        <span style={{ paddingRight: '8px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{res(r, true)}</span>
      </div>); })}</div>);
  const seg = (side, word) => (
    <div className="enc-side2"><span>{word}</span>
      <div className="nl-seg" role="group" aria-label={word + ' initiative skill'}>
        {['cool', 'vigilance'].map(k => <button key={k} type="button" className="nl-tab" data-on={skills[side] === k ? '1' : '0'} aria-pressed={skills[side] === k ? 'true' : 'false'}
          onClick={() => setSkill(side, k)}>{k.toUpperCase()}</button>)}</div></div>);
  const start = () => {
    const slots = order.map(mid => byMid[mid]).filter(Boolean);
    const out = ctx.applyBoth((b, r) => L.start(b, r, g.id, slots));
    if (out && out.refused) { setRefused(out); return; }
    onClose();
  };
  const other = refused && refused.runningId ? (ctx.bench.groups.filter(x => x.id === refused.runningId)[0] || {}).name : null;
  const desk = window.innerWidth >= 1024;
  return (
    <EncSheet title="START ENCOUNTER" testid="start" cover onClose={onClose} tag={<EncCite t="INITIATIVE · EOTE P.198" />}
      row={<div className="enc-sides">{seg('npc', 'NPCS')}{seg('pc', 'PCS')}</div>}
      foot={<React.Fragment>
        <button type="button" className="hp-quiet" onClick={rollAll}>ROLL ALL NPCS</button><span style={{ flex: 1 }} />
        {other ? <span className="enc-tag" data-enc-refused="1">{'RUNNING · ' + other.toUpperCase()}</span> : null}
        <button type="button" className="hp-commit" data-enc-start="1" onClick={start}>START</button></React.Fragment>}>
      {desk ? (
        <div className="enc-two"><div><div className="enc-sub" style={{ marginTop: 0 }}>EVERY COMBATANT</div>{every}</div>
          <div><div className="enc-sub" style={{ marginTop: 0 }}>PROPOSED ORDER</div>{ord}</div></div>
      ) : (<React.Fragment><div className="enc-sub" style={{ marginTop: 0 }}>EVERY COMBATANT</div>{every}<div className="enc-sub">PROPOSED ORDER</div>{ord}</React.Fragment>)}
    </EncSheet>
  );
}

// ── F6 · CRIT — d100 + 10 per existing crit → the row lit (§3 row 6): TAKE · PICK ANOTHER · TYPE OWN · nothing ──
function EncCrit({ m, ctx, onClose }) {
  const L = EL(), rows = ctx.critRows || [];
  const tier = ctx.wsRead(m).tier;
  const [roll, setRoll] = useState(() => L.rollCrit(m, tier, rows));
  const [picking, setPicking] = useState(false);
  const [own, setOwn] = useState(null);
  if (!roll) return null;
  const lit = roll.row ? roll.row[0] : null;
  const held = (m.crits || []).length;
  const take = (total, label) => { ctx.applyBoth((b, r) => ({ bench: L.takeCrit(b, r, ctx.openGroup.id, m.id, tier, total, label), room: r })); onClose(); };
  const i0 = Math.max(0, rows.findIndex(r => r[0] === lit));
  const shown = picking ? rows : rows.slice(Math.max(0, i0 - 2), i0 + 3);
  const lo = (range) => parseInt(String(range), 10);
  return (
    <EncSheet title={'CRIT · ' + ctx.nameOf(m).toUpperCase()} testid="crit" onClose={onClose} tag={<EncCite t={_encCritCite} />}
      foot={<React.Fragment>
        <button type="button" className="hp-commit" data-enc-take="1" disabled={own != null && !own.trim()}
          onClick={() => (own != null ? take(roll.roll, own.trim()) : take(roll.roll))}>TAKE</button>
        <button type="button" className="hp-quiet" aria-pressed={picking ? 'true' : 'false'} onClick={() => { setPicking(!picking); setOwn(null); }}>PICK ANOTHER</button>
        <button type="button" className="hp-quiet" aria-pressed={own != null ? 'true' : 'false'} onClick={() => { setOwn(own == null ? '' : null); setPicking(false); }}>TYPE OWN</button>
      </React.Fragment>}>
      <div className="enc-big">
        <button type="button" className="enc-d100" aria-label={'Roll d100, rolled ' + roll.d100} onClick={() => setRoll(L.rollCrit(m, tier, rows))}>{'d100 · ' + roll.d100}</button>
        <span className="enc-tag" style={{ fontSize: '13px' }}>{'+10 · ' + held + ' EXISTING'}</span>
        <span className="enc-tag" style={{ fontSize: '13px' }}>=</span><span className="enc-num" data-enc-total="1">{String(roll.roll)}</span>
      </div>
      {held ? <div className="enc-chips" style={{ padding: '0 0 10px' }}>{m.crits.map((c, j) => (
        <span key={j} className="enc-chip" aria-label={'Existing: ' + c.roll + ', ' + encCritName(rows, c)}><b>{String(c.roll)}</b>{'· ' + encCritName(rows, c)}</span>))}</div> : null}
      {own != null ? (
        <label className="enc-row"><span className="enc-rn">YOUR OWN</span>
          <input className="nl-in" autoFocus value={own} aria-label="Your own critical injury" onChange={e => setOwn(e.target.value)} style={{ flex: 2 }} /></label>
      ) : null}
      <table className="enc-ctab"><tbody>{shown.map(r => {
        const name = String(r[2]).split(': ')[0], eff = String(r[2]).slice(name.length + 2), isLit = r[0] === lit;
        const n = (String(r[1]).match(/\[DI\]/g) || []).length;
        return (
          <tr key={r[0]} data-lit={isLit ? '1' : '0'} onClick={picking ? () => setRoll(Object.assign({}, roll, { roll: lo(r[0]), row: r })) : undefined}
            style={picking ? { cursor: 'pointer' } : undefined} data-enc-crow={r[0]}>
            <td className="enc-rg">{r[0]}</td>
            <td><b>{name}</b>{isLit ? <div style={{ marginTop: '4px' }}>{eff}</div> : null}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{String(r[1]).split(' ')[0] + ' '}{window.SWRPGDice && window.SWRPGDice.renderPool ? window.SWRPGDice.renderPool({ difficulty: n }, { size: 1 }) : null}</td>
          </tr>);
      })}</tbody></table>
    </EncSheet>
  );
}

// ── F7 · END — the summary and the book's read lines; nothing writes to a sheet. F7c · HEAL & REPAIR ALL, confirmed. ──
function EncHealConfirm({ ctx, onCancel, onDone }) {
  const g = ctx.openGroup;
  const craft = (g.vehicles || []).map(v => { const r = craftVehicle(ctx.refData, v); return ctx.craftLabel(v, r ? r.name : v.key); });
  return (
    <EncSheet alert title="HEAL & REPAIR ALL?" testid="confirm-heal" onClose={onCancel}
      foot={<React.Fragment><button type="button" className="hp-commit" data-enc-confirm="heal" onClick={() => {
        ctx.applyBench(prev => EL().healAndRepairAll(prev, g.id)); onDone(); }}>HEAL & REPAIR ALL</button>
        <span style={{ flex: 1 }} /><button type="button" className="hp-quiet" onClick={onCancel}>CANCEL</button></React.Fragment>}>
      <p className="enc-read" style={{ boxShadow: 'none', padding: 0 }}>
        {'Every wound, strain, condition and minion pool in ' + g.name + ' returns to zero' + (craft.length ? ', and the ' + craft.join(', the ') + '’s hull and strain.' : '.')}
      </p>
    </EncSheet>
  );
}
function EncEnd({ ctx, onClose, onHeal }) {
  const g = ctx.openGroup, L = EL(), rows = ctx.critRows || [];
  const sum = L.summary(ctx.bench, g.id);
  const rounds = encRoom(ctx.table).initiative.round || 0;
  const fallen = [], crits = [], conds = [];
  // D2 (D-540): each line's LOG items, in the entry shape on paper (`encounters-e4-campaign-concept` §5 Item:
  // {type, ref, label, roll?, condition?, hull?, text?}); `label` is the name as the GM sees it at the tap
  const items = { FALLEN: [], 'CRITS DEALT': [], 'CONDITIONS STANDING': [], CRAFT: [] };
  const refOf = (m) => m.kind === 'pc' ? String(m.who || '') : String(m._source_key || '');
  g.members.forEach(m => {
    const nm = ctx.nameOf(m);
    if (m.kind !== 'pc') {
      const pv = ctx.poolView(m), ws = ctx.wsRead(m);
      if (pv && pv.fallen > 0) { fallen.push(pv.r.name + ' ×' + pv.fallen); items.FALLEN.push({ type: 'fell', ref: refOf(m), label: pv.r.name + ' ×' + pv.fallen }); }
      else if (!pv && ws.wt && (m.currentWounds || 0) > ws.wt) { fallen.push(nm); items.FALLEN.push({ type: 'fell', ref: refOf(m), label: nm }); }
    }
    if ((m.crits || []).length) {
      crits.push(nm + ' · ' + m.crits.map(c => c.roll + ' ' + encCritName(rows, c)).join(', '));
      m.crits.forEach(c => items['CRITS DEALT'].push(Object.assign({ type: 'crit', ref: refOf(m), label: nm, roll: c.roll }, c.label ? { text: String(c.label) } : {})));
    }
    if ((m.conditions || []).length) {
      conds.push(nm + ' · ' + m.conditions.map(c => c.toUpperCase()).join(', '));
      m.conditions.forEach(c => items['CONDITIONS STANDING'].push({ type: 'condition', ref: refOf(m), label: nm, condition: String(c) }));
    }
  });
  const fleet = window.SWRPGVessels ? (window.SWRPGVessels.getState().vessels || []) : [];
  const craft = (g.vehicles || []).map(v => {
    const row = craftVehicle(ctx.refData, v), rec = v.vessel ? fleet.filter(x => x.id === v.vessel)[0] : null;
    const R = window.SWRPGVesselResolve, res = row && R ? R.resolve(rec || { vehicleKey: v.key, hull_current: 0, strain_current: 0 }, row, null) : null;
    items.CRAFT.push({ type: 'craft', ref: String(v.vessel || v.key || ''), label: ctx.craftLabel(v, row ? row.name : v.key), hull: (rec && rec.hull_current) || 0 });
    return ctx.craftLabel(v, row ? row.name : v.key) + ' · hull ' + ((rec && rec.hull_current) || 0) + ' / ' + (res ? res.hull_threshold : '—');
  });
  // D2: LOG writes to the fight's campaign (D1) — one `encounter` entry per tap, append-only; a line reads LOGGED once an
  // entry for this fight holds its kind of item (ROUNDS: any entry for this fight). No campaign, no LOG.
  const Cs = window.SWRPGCampaigns, camp = encCampaignsOn() ? encCampaignOf(g) : null;
  const [, setLogTick] = useState(0);
  const mine = camp ? (Cs.campaignOf(Cs.load(), camp.id).log || []).filter(e => e.kind === 'encounter' && e.groupId === g.id) : [];
  const TYPE = { FALLEN: 'fell', 'CRITS DEALT': 'crit', 'CONDITIONS STANDING': 'condition', CRAFT: 'craft' };
  const logged = (k) => k === 'ROUNDS' ? mine.length > 0 : mine.some(e => (e.items || []).some(it => it.type === TYPE[k]));
  const canLog = (k) => k === 'ROUNDS' || (items[k] || []).length > 0;
  const logLine = (keys) => {
    const todo = keys.filter(k => canLog(k) && !logged(k));
    if (!camp || !todo.length) return;
    const its = todo.reduce((a, k) => a.concat(items[k] || []), []);
    Cs.apply(st => Cs.appendLog(st, camp.id, { kind: 'encounter', groupId: g.id, rounds: rounds, items: its }));
    setLogTick(n => n + 1);
  };
  const cite = (k) => ((sum.recovery || []).filter(r => r.key === k)[0] || {}).cite || '';
  const dl = [['ROUNDS', <b>{rounds + ' ' + (rounds === 1 ? 'ROUND' : 'ROUNDS')}</b>], ['FALLEN', fallen.join(' · ') || '—'], ['CRITS DEALT', crits.join(' · ') || '—'],
    ['CONDITIONS STANDING', conds.join(' · ') || '—']].concat(craft.length ? [['CRAFT', craft.join(' · ')]] : []);
  return (
    <EncSheet title="END ENCOUNTER" testid="end" cover onClose={onClose}
      foot={<React.Fragment>
        {camp ? <button type="button" className="hp-quiet" data-enc-logall="1" onClick={() => logLine(dl.map(([k]) => k))}>LOG ALL</button> : null}
        <button type="button" className="hp-commit" data-enc-markdone="1" onClick={() => { ctx.applyBoth((b, r) => L.end(b, r, g.id)); onClose(); }}>MARK DONE</button>
        <button type="button" className="hp-quiet" onClick={onHeal}>HEAL & REPAIR ALL</button>
        <span style={{ flex: 1 }} /><button type="button" className="hp-quiet" onClick={onClose}>BACK TO THE FIGHT</button></React.Fragment>}>
      <dl className="enc-sum">{dl.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt>{camp
        ? <dd style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ flex: 1, minWidth: 0 }}>{v}</span>
            {logged(k) ? <span className="enc-tag" aria-label={k + ' logged'}>LOGGED</span>
              : <button type="button" className="hp-quiet" aria-label={'Log ' + k} disabled={!canLog(k)} onClick={() => logLine([k])}>LOG</button>}</dd>
        : <dd>{v}</dd>}</React.Fragment>)}</dl>
      <div className="enc-sub">AFTER THE FIGHT</div>
      <p className="enc-read">{'Strain recovery: one Simple (–) check, Cool or Discipline; 1 strain back per Success — '}<EncCite t={cite('strain').toUpperCase()} /></p>
      <p className="enc-read">{'Wounds heal one per full night’s rest — '}<EncCite t={cite('wounds_rest').toUpperCase()} /></p>
      <p className="enc-read">{'One Medicine check per encounter (Table 6-11) — '}<EncCite t={cite('medicine').toUpperCase()} /></p>
    </EncSheet>
  );
}

// ABOARD, in the PREP drawer (D-504: the select leaves the card; the card keeps the ABOARD tag)
function EncAboard({ ctx }) {
  const g = ctx.openGroup, craft = g.vehicles || [];
  if (!craft.length) return null;
  const npcs = ctx.orderedMembers.filter(m => m.kind !== 'pc');
  return (
    <React.Fragment>
      <NpcPaperSechead head="ABOARD" />
      <div className="enc-crew">{npcs.map(m => {
        const aboard = m.vehicle ? craft.filter(v => v.id === m.vehicle.id)[0] : null;
        return (
          <label key={m.id} className="enc-crewl">{ctx.nameOf(m)}
            <select className="nl-sel" aria-label={'Which craft is ' + ctx.nameOf(m) + ' aboard'} value={aboard ? aboard.id : ''}
              onChange={(e) => ctx.actions.setMemberVehicle(g.id, m.id, e.target.value || null, !!(m.vehicle && m.vehicle.pilot))}>
              <option value="">{'— not aboard —'}</option>
              {craft.map(v => { const r = craftVehicle(ctx.refData, v); return <option key={v.id} value={v.id}>{ctx.craftLabel(v, r ? r.name : v.key)}</option>; })}
            </select></label>);
      })}</div>
    </React.Fragment>
  );
}

// The phone's one card (B-1797: directly under the strip): today's flip card with, in an encounter, the DAMAGE box in
// the wounds row and the roll row under the tracks; a PC's card reads its sheet.
function EncPhoneCard({ m, ctx, benchCtx }) {
  if (!m) return null;
  if (m.kind === 'pc') {
    const pc = encPcOf(m), tv = encPcTable(m, pc), v = encPcVitals(pc.rec) || (tv && tv.v);
    return (
      <div data-npc-flipcard={m.id} data-enc-pc="1">
        <div className="nl-acts" style={{ margin: '0 0 8px', justifyContent: 'flex-end' }}>
          {ctx.readOnly ? null : <button type="button" className="hp-quiet" aria-label="Remove this member from the encounter"
            onClick={() => { ctx.actions.removeMember(ctx.openGroup.id, m.id); ctx.setFlipKey(null); }}>{'× REMOVE'}</button>}
        </div>
        <div className="hp-plate" data-pad="data"><div className="nl-cn"><b>{pc.name}</b><span className="nl-tier">{encPcTier(pc)}</span></div>
          {v ? <div className="sb-vit">{[['Wounds', v.w, v.wt], ['Strain', v.s, v.st]].map(([k, c, mx]) => (
            <div key={k} className="sb-vitrow" data-track={k.toLowerCase()}><div><div className="sb-vitkey">{k}</div>
              <div className="sb-meter"><i style={{ width: (mx ? Math.min(100, Math.round(c * 100 / mx)) : 0) + '%' }} /></div></div>
              <div className="sb-trk"><span className="sb-vitval sb-trk-val">{c}<span className="sb-of"> / {mx}</span></span></div></div>))}
            <EncLiveTag t={tv} /></div> : null}
        </div>
        <EncConds m={m} ctx={ctx} />
      </div>
    );
  }
  const ws = ctx.wsRead(m);
  const extra = ws.isMinion ? null : { soak: ws.r && ws.r.derived ? ws.r.derived.soak || 0 : 0 };
  return <EncDamageSlot m={m} ctx={ctx} soak={extra ? extra.soak : 0} name={ctx.nameOf(m)}>{(field, proposal) => (
    <BenchMemberCard m={m} ctx={Object.assign({}, benchCtx, {
      benchStale: benchCtx.benchStale || ctx.readOnly, encReadOnly: ctx.readOnly,
      condChips: (mm) => <EncConds m={mm} ctx={ctx} />,
      encTrack: ws.isMinion ? null : { woundsExtra: <React.Fragment>{ctx.readOnly ? null : field}{proposal}</React.Fragment>,
        after: ctx.mode !== 'prepped' && ws.r ? <EncRollRow m={m} rec={ws.r} tier={ws.tier} ctx={ctx} phone /> : null } })} />
  )}</EncDamageSlot>;
}

// ── THE OPEN ENCOUNTER (F3 PREPPED · F4 RUNNING · F8 DONE), desk and phone ──
function EncOpen({ bc, benchCtx, manager, view, bench }) {
  const g = bc.openGroup, L = EL(), B = BenchStore;
  const mode = g.state || 'prepped', readOnly = mode === 'done';
  const critRows = useEncCritRows();
  const [, setTableTick] = useState(0);   // G6: a linked PC's numbers re-draw on the table session's news (it holds them in memory)
  useEffect(() => { const T = window.SWRPGTableSession; return T ? T.subscribe(() => setTableTick(n => n + 1)) : undefined; }, []);
  const [sheet, setSheet] = useState(null);
  const [prep, setPrep] = useState(false);
  // THE PRESS (encounters-e3-npc-press): the core's arrival (R-E3DM-R1, Q-E) and the member whose window is open
  const [coreReady, setCoreReady] = useState(() => !!(window.SWRPGSheetPool && window._qualitiesDb && window.SWRPGDice && window.SWRPGDice.inlineSurface));
  const [rollId, setRollId] = useState(null);
  const table = manager.table;
  const ini = encRoom(table).initiative;
  const isRun = mode === 'running';
  const byId = {}; g.members.forEach(m => { byId[m.id] = m; });
  const nameOf = (m) => (!m ? '' : m.kind === 'pc' ? encPcOf(m).name : bc.memberLabel(m, (bc.resolveBySourceKey(m._source_key) || {}).name || m._source_key));
  const ended = isRun && ini.active > 0 && ini.slots[ini.active - 1] ? { round: ini.round, index: ini.active - 1, benchMemberId: ini.slots[ini.active - 1].benchMemberId } : null;
  const ends = ended ? L.endsProposals(bench, g.id, ended) : [];
  const condsOf = (m) => (Array.isArray(m.conditions) ? m.conditions : []);
  const toggleCond = (m, token) => manager.applyBench(prev => {
    const cur = condsOf(B.getMember(prev, g.id, m.id) || m), on = cur.indexOf(token) === -1;
    let s = B.setMember(prev, g.id, m.id, { conditions: on ? cur.concat(token) : cur.filter(t => t !== token) });
    s = on ? L.noteCondition(s, manager.readTable(), g.id, m.id, token) : B.dropTimer(s, g.id, m.id, token);   // a clock only while running
    return s;
  });
  const keepEnds = (m, c) => manager.applyBench(prev => B.dropTimer(prev, g.id, m.id, c));
  const clearEnds = (m, c) => manager.applyBench(prev => B.dropTimer(B.setMember(prev, g.id, m.id, { conditions: condsOf(m).filter(t => t !== c) }), g.id, m.id, c));
  const applyPool = (m, v) => { const pv = bc.poolView(m); if (pv) bc.actions.setPool(g.id, m.id, Math.max(0, Math.min(pv.ceiling, pv.wounds + v))); };
  const ctx = Object.assign({}, bc, {
    manager, mode, readOnly, critRows, bench, table, nameOf, byId, ends, condsOf, toggleCond, keepEnds, clearEnds, applyPool,
    condAddFor: view.condAddFor, setCondAddFor: view.setCondAddFor,
    applyBench: manager.applyBench, applyBoth: manager.applyBoth,
    openCrit: (m) => setSheet({ kind: 'crit', id: m.id }),
    coreReady, rollId,
    // CONTRACT 3: the window mounts only once the one loader has answered; a second tap on the same plate closes it
    openRoll: (m) => { Promise.resolve(manager.core ? manager.core() : true).then(ok => { if (ok) setRollId(cur => (cur === m.id ? null : m.id)); }); },
    benchStale: bc.benchStale || readOnly,
    rail: { slots: isRun ? L.slotView(bench, table) : [], ini, nameOf, byId, readOnly,
      onNext: () => manager.applyTable(prev => L.next(prev).room), onBackSlot: () => manager.applyTable(prev => L.back(prev)),
      onSlot: (i) => setSheet({ kind: 'claim', index: i }), claimSlot: (i, id) => manager.applyTable(prev => L.claim(prev, i, id)) },
  });
  useEffect(() => {   // the pool paths, the qualities and the dice surface, injected once; the plates draw when they answer
    let alive = true;
    if (manager.core) Promise.resolve(manager.core()).then(ok => { if (alive && ok) setCoreReady(true); });
    return () => { alive = false; };
  }, []);
  const memberCount = g.members.length, craftCount = (g.vehicles || []).length;
  const act = mode === 'prepped'
    ? <button type="button" className="hp-commit" data-enc-act="start" disabled={!memberCount} onClick={() => setSheet({ kind: 'start' })}>START ENCOUNTER</button>
    : mode === 'running' ? <button type="button" className="hp-quiet" data-enc-act="end" onClick={() => setSheet({ kind: 'end' })}>END ENCOUNTER</button>
    : <button type="button" className="hp-quiet" data-enc-act="reopen" onClick={() => manager.applyBench(prev => L.reopen(prev, g.id))}>REOPEN</button>;
  const heal = !readOnly && memberCount + craftCount > 0
    ? <button type="button" className="hp-quiet" onClick={() => setSheet({ kind: 'heal' })}>{'HEAL & REPAIR ALL'}</button> : null;
  const del = <button type="button" className="hp-quiet" onClick={() => setSheet({ kind: 'delete' })}>DELETE</button>;
  const word = <span className="enc-state" data-s={mode} data-enc-word="1">{encStateWord(g, table)}</span>;
  const doneBanner = readOnly ? <div className="hp-plate" data-pad="snug" role="status" data-enc-done="1"><span className="enc-done-tag">{encStateWord(g, table) + ' · READ ONLY'}</span></div> : null;
  const stale = bc.benchStale ? <StaleTabBanner accent={bc.accent} paper /> : null;
  const sm = sheet && sheet.id ? byId[sheet.id] : null;
  const rm = rollId && !readOnly && coreReady ? byId[rollId] : null;
  const rollWin = rm && rm.kind !== 'pc' ? <EncRollWindow key={rm.id} m={rm} ctx={ctx} onClose={() => setRollId(null)} /> : null;
  const sheets = !sheet ? null
    : sheet.kind === 'start' ? <EncStart ctx={ctx} onClose={() => setSheet(null)} />
    : sheet.kind === 'end' ? <EncEnd ctx={ctx} onClose={() => setSheet(null)} onHeal={() => setSheet({ kind: 'heal', from: 'end' })} />
    : sheet.kind === 'heal' ? <EncHealConfirm ctx={ctx} onCancel={() => setSheet(sheet.from === 'end' ? { kind: 'end' } : null)} onDone={() => setSheet(null)} />
    : sheet.kind === 'delete' ? <EncDeleteConfirm g={g} onCancel={() => setSheet(null)}
        onDelete={() => { manager.applyBoth((b, r) => L.deleteEncounter(b, r, g.id)); setSheet(null); view.setOpenGroupId(null); }} />
    : sheet.kind === 'claim' ? <EncClaim ctx={ctx} index={sheet.index} onClose={() => setSheet(null)} />
    : sheet.kind === 'crit' && sm ? <EncCrit m={sm} ctx={ctx} onClose={() => setSheet(null)} />
    : sheet.kind === 'addpc' ? <EncSheet title="ADD PLAYER CHARACTER" testid="addpc" onClose={() => setSheet(null)}><EncAddPc g={g} manager={manager} /></EncSheet>
    : sheet.kind === 'campaign' ? <EncCampaignPick g={g} manager={manager} onClose={() => setSheet(null)} />
    : null;
  const empty = <div className="hp-plate" data-pad="read"><p className="hp-none" style={{ margin: 0 }}>Empty group. Search above to add NPCs.</p></div>;

  if (!view.deskBoard) {
    // B-1797 · THE PHONE FLIP, re-ordered: head · strip · THE CARD · pools · add · craft (the rail sticky above, running)
    const minionLines = bc.orderedMembers.filter(m => m.kind !== 'pc' && bc.wsRead(m).isMinion);
    return (
      <React.Fragment>
        <div data-npc-state="flip" data-enc="open" data-enc-mode={mode}>
          {isRun ? <EncRail ctx={ctx} phone /> : null}
          <div className="nl-bar"><span className="nl-sp" />{heal}{del}</div>
          <h2 className="enc-tphone">{view.renameTitle()}{word}</h2>
          <div className="enc-actrow">{act}</div>
          {stale}{doneBanner}
          {memberCount > 0 ? (
            <div className="nl-strip" role="tablist" aria-label="Encounter members">
              {bc.orderedMembers.map(m => m.kind === 'pc'
                ? <EncPcChip key={m.id} m={m} ctx={ctx} />
                : <BenchStripChip key={m.id} m={m} ctx={bc} />)}
            </div>
          ) : null}
          {memberCount === 0 ? empty : <EncPhoneCard m={view.member} ctx={ctx} benchCtx={benchCtx} />}
          {minionLines.map(m => <div key={m.id} className="enc-pline"><EncMinionFrame m={m} ctx={ctx} soak={(bc.wsRead(m).r.derived || {}).soak || 0}
            rolls={mode !== 'prepped' ? <EncRollRow m={m} rec={bc.wsRead(m).r} tier="minion" ctx={ctx} phone /> : null} /></div>)}
          {(() => {   // F8 keeps the record's page whole, every control inert (rider R3); PREPPED and RUNNING edit it
            const pc = readOnly ? Object.assign({}, benchCtx, { benchStale: true }) : benchCtx;
            return (
              <React.Fragment>
                <div className="nl-gap" />
                <BenchAddMemberBlock ctx={pc} />
                {!readOnly && encCampaignsOn() ? <EncCampaignBlock g={g} onPick={() => setSheet({ kind: 'campaign' })} /> : null}
                <button type="button" className="hp-quiet nl-wide enc-addpc" disabled={readOnly} aria-disabled={readOnly ? 'true' : undefined}
                  onClick={() => setSheet({ kind: 'addpc' })}>+ ADD PLAYER CHARACTER</button>
                <BenchGroupCraft ctx={pc} />
                {readOnly ? null : <EncAboard ctx={ctx} />}
              </React.Fragment>
            );
          })()}
          {sheets}{rollWin}
        </div>
      </React.Fragment>
    );
  }
  // B-1798 · THE DESK: ONE HEAD ROW (title · state word · the toolbar); notes, add and craft fold into PREP.
  const ledgerCtx = Object.assign({}, bc, { orderedMembers: bc.orderedMembers.filter(m => m.kind !== 'pc'), condChips: (m, dense) => <EncConds m={m} ctx={ctx} dense={dense} /> });
  const body = memberCount === 0 ? empty : view.boardView === 'list' ? <BenchLedgerBoard ctx={ledgerCtx} />
    : <div className="nl-cards" data-testid="board-card-grid">{bc.orderedMembers.map(m => <EncCard key={m.id} m={m} ctx={ctx} />)}</div>;
  const paneArm = view.wideBoard && memberCount > 0;
  const member = view.member && view.member.kind !== 'pc' ? view.member : null;
  return (
    <React.Fragment>
      <div className="nl-board" data-npc-state="board" data-board-arm={paneArm ? 'pane' : 'overlay'} data-enc="open" data-enc-mode={mode}>
        <div className="nl-bar enc-bar">
          <div className="enc-tb">{view.renameTitle()}{word}</div>
          <span className="nl-sp" />
          {readOnly ? null : <button type="button" className="hp-quiet" aria-expanded={prep ? 'true' : 'false'} data-enc-prep="1" onClick={() => setPrep(!prep)}>{prep ? 'PREP ▴' : 'PREP ▾'}</button>}
          {memberCount > 0 ? view.seg : null}
          {heal}{del}{act}
          {paneArm && member && !readOnly ? (
            <React.Fragment><span className="nl-sp" />
              <button type="button" className="hp-quiet" aria-label="Remove this member from the encounter"
                onClick={() => { ctx.actions.removeMember(g.id, member.id); ctx.setFlipKey(null); }}>{'× REMOVE'}</button></React.Fragment>
          ) : null}
        </div>
        <div className="nl-main">
          {stale}{doneBanner}
          <div className="enc-row2">
            {isRun ? <EncRail ctx={ctx} /> : null}
            <BenchZone zone="main">
              {prep && !readOnly ? (
                <div className="enc-drawer" role="region" aria-label="Prep">
                  <div className="enc-dcols">
                    <div><BenchAddMemberBlock ctx={benchCtx} /><BenchGroupCraft ctx={benchCtx} /><EncAboard ctx={ctx} /></div>
                    <div>{encCampaignsOn() ? <EncCampaignBlock g={g} onPick={() => setSheet({ kind: 'campaign' })} /> : null}
                      <NpcPaperSechead head="ADD PLAYER CHARACTER" /><EncAddPc g={g} manager={manager} /></div>
                  </div>
                </div>
              ) : null}
              <div data-testid="bench-board">{body}</div>
            </BenchZone>
          </div>
        </div>
        {paneArm ? (
          <div className="nl-pane" data-testid="bench-ref-pane">
            <BenchZone zone="pane">{member ? <BenchTabbedReference m={member} ctx={benchCtx} chrome={false} /> : null}</BenchZone>
          </div>
        ) : null}
        {!view.wideBoard && view.refOverlay && member ? (
          <BenchRefOverlay onClose={() => view.setRefOverlay(false)}>
            <BenchZone zone="overlay"><BenchTabbedReference m={member} ctx={benchCtx} /></BenchZone>
          </BenchRefOverlay>
        ) : null}
        {sheets}{rollWin}
      </div>
    </React.Fragment>
  );
}
// THE STATBLOCK OVERLAY below the wide board (both benches): the scrim and the lifted plate, drawn as before. B-1825/B-1826
// (ADDENDUM 631): it holds focus, and Escape is its × CLOSE, the scrim's close too. One component, so the two benches
// cannot drift apart.
function BenchRefOverlay({ onClose, children }) {
  const held = useRef(null);
  window.SWRPGUI.useHoldFocus(held, true);
  window.SWRPGUI.useEscape(true, onClose);
  return (
    <React.Fragment>
      <div className="nl-scrim" onClick={onClose} />
      <div className="nl-overlay" data-testid="bench-ref-overlay" ref={held}>
        <div className="nl-acts" style={{ margin: '0 0 6px', justifyContent: 'flex-end' }}>
          <button type="button" className="hp-quiet" aria-label="Close statblock" onClick={onClose}>× CLOSE</button>
        </div>
        {children}
      </div>
    </React.Fragment>
  );
}
function EncPcChip({ m, ctx }) {
  const pc = encPcOf(m), tv = encPcTable(m, pc), v = encPcVitals(pc.rec) || (tv && tv.v), active = m.id === ctx.flipKey;
  return (
    <button type="button" className="nl-sc" data-on={active ? '1' : '0'} aria-pressed={active} aria-label={'Show ' + pc.name}
      data-npc-member={m.id} onClick={() => ctx.setFlipKey(m.id)}><b>{pc.name}</b><span>{v ? v.w + '/' + v.wt + ' WOUNDS' : 'PC'}</span></button>
  );
}

function NpcBenchGroupsView({ bench, actions, npcPool, resolveBySourceKey, refData, factionProfiles, accent, openGroupId: openGroupIdProp, onOpenGroup, manager }) {
  // B-863 · R-NPC-4 — WHICH encounter is open is part of the library's position, so the kernel may hold
  // it (and project it into the URL). Controlled when the kernel passes `onOpenGroup`; the local state
  // stays for any caller that does not, so the view keeps its own contract.
  const [openLocal, setOpenLocal] = useState(null);
  const openControlled = typeof onOpenGroup === 'function';
  const openGroupId = openControlled ? (openGroupIdProp || null) : openLocal;
  const setOpenGroupId = openControlled ? onOpenGroup : setOpenLocal;
  const [flipKey, setFlipKey] = useState(null);
  const [newName, setNewName] = useState('');
  const [addSearch, setAddSearch] = useState('');

  // ── Lane A tracking board (ruling gm-bench-library-desktop-concept + bench-board-viewtoggle-brief).
  //    Desktop/mid-tier open a group as the BOARD (all members' paper at once); phones keep the flip.
  //    boardView = CARD grid · LIST ledger, remembered per device (default card). refOverlay = the
  //    mid-tier summon-reference (wide desktop uses a persistent pane instead).
  const deskBoard = useNpcLayoutMode() === 'desktop';
  const wideBoard = useMinWidth(1367);
  const deskWide = useMinWidth(1024);   // B9: the viewport's own desk seam (the layout pref can force the desk arm below it)
  const [boardView, setBoardView] = useState(readBoardView);
  const setBoardViewPref = (v) => { setBoardView(v); writeBoardView(v); };
  const [refOverlay, setRefOverlay] = useState(false);
  // T3: which member is currently typing a custom condition. Lifted to this STABLE parent (not the
  // remounting board cells) so the "+ ADD" input survives a board re-render (the cell-remount class).
  const [condAddFor, setCondAddFor] = useState(null);
  // B-214: which member's vehicle panel is open in the LIST view (null = none, member id = open).
  // One panel at a time — clicking another row closes the current and opens that one.
  const [crewingFor, setCrewingFor] = useState(null);
  const [renaming, setRenaming] = useState(false);   // B-761 / B13 — the title is its own field, in place

  const groups = bench.groups || [];
  const openGroup = groups.filter(g => g.id === openGroupId)[0] || null;
  const memberCount = openGroup ? openGroup.members.length : 0;
  // R-SECG-2: HEAL & REPAIR ALL also clears craft, so an encounter of craft alone still has it (the other gates stay members-only)
  const craftCount = openGroup && Array.isArray(openGroup.vehicles) ? openGroup.vehicles.length : 0;

  // Default the flip to the first member when a group opens or membership changes. v5: flipKey is a
  // member INSTANCE id (duplicates share a _source_key, so the id is the only stable per-member handle).
  useEffect(() => {
    if (!openGroup) { setFlipKey(null); return; }
    const ids = openGroup.members.map(m => m.id);
    if (!flipKey || ids.indexOf(flipKey) === -1) setFlipKey(ids[0] || null);
  }, [openGroupId, memberCount]);

  // v5 (G-BENCH-DUP): who's already in the group — used to LABEL "ADD ANOTHER", NOT to hide (duplicates
  // are allowed now: two rival Wookiees, two ×4 minion lines). Keyed by _source_key (the catalog ref).
  const inGroupSrc = useMemo(() => {
    const s = {}; (openGroup ? openGroup.members : []).forEach(m => { s[m._source_key] = true; });
    return s;
  }, [openGroup, memberCount]);

  // Add-picker: name search over the loaded library, empty until typed, capped (don't dump 1400).
  const addResults = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q || !openGroup) return [];
    return (npcPool || [])
      .filter(n => (n.name || '').toLowerCase().indexOf(q) !== -1)
      .slice(0, 12);
  }, [addSearch, npcPool, openGroup, memberCount]);


  // A member's TIER, resolved through the catalog. Hoisted ABOVE the group-list early return because
  // BOTH halves of this component need it: the ENCOUNTERS strip below decides minion-vs-individual
  // damage with it, and the group detail (poolView, threat ordering, minionLines) has always used it.
  // It lived below the early return and was therefore in the temporal dead zone for the strip — which
  // is the mechanical reason the strip reached for `m.count` as a tier proxy instead (MINION-DMG).
  const tierOf = (m) => { const r = resolveBySourceKey(m._source_key); return r ? (r.tier || '') : ''; };

  // ── GROUP LIST ──
  // ENCOUNTERS E3 lap B: on the manager's own screen the list is F2's (the switch-off list below is today's, untouched)
  if (!openGroup && manager) return <EncList groups={groups} actions={actions} resolveBySourceKey={resolveBySourceKey} tierOf={tierOf} onOpen={setOpenGroupId} manager={manager} />;
  if (!openGroup) {
    // B1 · B2 · B3 — the list: every encounter, its first six members as chips reading CURRENT / THRESHOLD.
    const create = () => { if (newName.trim()) { actions.create(newName); setNewName(''); } };
    return (
      <div data-npc-state={groups.length ? 'encounters' : 'encounters-empty'}>
        <NpcPaperSechead head="ENCOUNTERS" />
        <div className="nl-newrow">
          <input type="text" className="nl-in" value={newName} placeholder="New encounter name…" aria-label="New encounter name"
            onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} />
          <button type="button" className="hp-quiet" disabled={!newName.trim()} onClick={create}>+ NEW</button>
        </div>
        {groups.length === 0 ? null : (
          <div className="hp-plate" data-pad="snug"><div className="nl-glist hp-bands">
            {groups.map(g => (
              <div key={g.id} className="nl-grow" data-npc-group={g.id}>
                <div className="nl-gn"><b>{g.name}</b><span>{g.members.length} {g.members.length === 1 ? 'NPC' : 'NPCs'}</span></div>
                <div className="nl-mstrip" data-testid="encounter-member-strip">
                  {g.members.slice(0, 6).map(m => {
                    const rend = resolveBySourceKey(m._source_key);
                    const nm = rend ? rend.name : 'unknown';
                    const num = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; };
                    const wt = npcWoundThreshold(rend && rend.derived);
                    const minion = tierOf(m) === 'minion';
                    const count = Math.max(1, num(m.count));
                    const mx = minion ? BenchStore.minionPoolMax(wt, count) : wt;
                    const cur = minion ? num(m.poolWounds) : BenchStore.clampCurrent(num(m.currentWounds), wt);   // R-NFLL-1
                    return (
                      <span key={m.id} className="nl-mchip" data-hurt={cur > 0 ? '1' : '0'}>
                        <NpcPaperMono name={nm} /><b>{nm}{count > 1 ? ' ×' + count : ''}</b>
                        <span data-npc-chip-val="1">{mx ? cur + '/' + mx : (cur ? String(cur) : '—')}</span>
                      </span>
                    );
                  })}
                  {g.members.length > 6 ? <span className="nl-more">+{g.members.length - 6}</span> : null}
                </div>
                <div className="nl-gacts">
                  <button type="button" className="hp-quiet" onClick={() => setOpenGroupId(g.id)}>OPEN</button>
                  <button type="button" className="hp-quiet" onClick={() => actions.del(g.id)}>DELETE</button>
                </div>
              </div>
            ))}
          </div></div>
        )}
      </div>
    );
  }


  // ── GROUP DETAIL + FLIP ── (v5: members keyed by instance id; stats still resolve by _source_key)
  const member = openGroup.members.filter(m => m.id === flipKey)[0] || null;   // MemberCard resolves its own stat block

  // ── BENCH-E1 (ruling bench-encounter-concept): per-LINE minion pools. Each minion member is
  //    its own same-type group (RAW EotE p.390 — same type only, WT = sum of THAT line). The old
  //    group-wide `isMinionPool` purity conditional (which hid the whole tracker the moment one
  //    rival joined, and summed different WTs into one wrong pool) is GONE. `poolView(m)` gives a
  //    line's live numbers; non-minion lines return null (they keep their individual trackers).
  // (`tierOf` now lives above the group-list early return — ONE definition serving both halves.)
  const wtOf = (r) => npcWoundThreshold(r && r.derived);   // R-PFR-4: was `|| 5`
  function poolView(m) {
    const r = resolveBySourceKey(m._source_key);
    if (!r || r.tier !== 'minion') return null;
    const count = Math.max(1, m.count || 1);
    const wt = wtOf(r);
    const poolMax = BenchStore.minionPoolMax(wt, count);
    // B-867 / R-NPC-5a (both faces): the ceiling is poolMax + 1 — the WIPED state, where the last one falls.
    const ceiling = BenchStore.minionPoolCeiling(wt, count);
    const wounds = Math.min(ceiling, Math.max(0, m.poolWounds || 0));
    const fallen = BenchStore.minionFallen(wounds, wt, count);
    const standing = count - fallen;
    return { r, count, wt, poolMax, ceiling, wounds, fallen, standing, ranks: BenchStore.minionGroupRanks(standing) };
  }
  const bumpLine = (m, delta) => {
    const pv = poolView(m); if (!pv) return;
    actions.setPool(openGroup.id, m.id, Math.max(0, Math.min(pv.ceiling, pv.wounds + delta)));   // v5: per-instance line; B-867 ceiling
  };
  // B-905 · R-NPR8B-2 — THE CRIT, one handler for every arm (card, flip pool frame, ledger table and stack, the
  // dark card): exactly one more member down, by BenchStore.minionCritPool (RAW), never a bare `+ WT`.
  const critLine = (m) => {
    const pv = poolView(m); if (!pv) return;
    actions.setPool(openGroup.id, m.id, BenchStore.minionCritPool(pv.wounds, pv.wt, pv.count));
  };
  // U2 (bench-custom-usability-triage §3): the minion COUNT stepper. The store op and the per-line
  // pools have existed since v3 and the retired flip card had this control — the board's op
  // enumeration simply missed it, so a squad could never shrink. Both board styles write through
  // THIS one function. The pool max follows the count (N minions x WT), and the current pool wounds
  // clamp down with it so shrinking a squad can never leave more wounds than the pool can hold.
  const bumpCount = (m, delta) => {
    const pv = poolView(m); if (!pv) return;
    const next = Math.max(1, Math.min(99, (pv.count || 1) + delta));
    if (next === pv.count) return;
    actions.setMember(openGroup.id, m.id, { count: next });
    const nextMax = BenchStore.minionPoolCeiling(pv.wt || 0, next);   // B-867: the new line's ceiling (poolMax + 1)
    if (pv.wounds > nextMax) actions.setPool(openGroup.id, m.id, nextMax);
  };

  // Member order (T1, ruling bench-refinements-triage): the GM's saved `arrangement` is now PRIMARY — a
  // reordered group holds the GM's exact order (drag the acting squad to the top). A group never reordered
  // has an empty arrangement → falls back to threat order (nemesis → rival → minion), the default encounter
  // face. Just-added members (not yet in arrangement) sort after the arranged ones by threat order.
  const TIER_RANK = { nemesis: 0, rival: 1, minion: 2 };
  const arrIdx = (m) => (openGroup.arrangement || []).indexOf(m.id);   // v5: instance ids; -1 = unarranged
  const orderedMembers = openGroup.members.slice().sort((a, b) => {
    const ia = arrIdx(a), ib = arrIdx(b);
    if (ia !== -1 && ib !== -1) return ia - ib;         // both arranged → the GM's order
    if (ia !== -1) return -1;                            // arranged before unarranged
    if (ib !== -1) return 1;
    const ta = TIER_RANK[tierOf(a)] ?? 3, tb = TIER_RANK[tierOf(b)] ?? 3;   // default: threat order
    return ta - tb;
  });
  // Move a member up/down one slot: swap in the current ordered sequence, persist the full id order.
  const reorderMember = (m, dir) => {
    const ids = orderedMembers.map(x => x.id);
    const i = ids.indexOf(m.id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids[i] = ids[j]; ids[j] = m.id;
    actions.setArrangement(openGroup.id, ids);
  };

  // v5 disambiguation (G-BENCH-DUP): same-source members render with a "· A / · B" suffix so two Wookiee
  // Warriors (or two Stormtrooper ×4 lines) are tellable apart. The GM's per-member notes still show below.
  const dupSuffix = {};
  const _bySrc = {};
  openGroup.members.forEach(m => { (_bySrc[m._source_key] = _bySrc[m._source_key] || []).push(m.id); });
  Object.keys(_bySrc).forEach(src => { const ids = _bySrc[src]; if (ids.length > 1) ids.forEach((id, i) => { dupSuffix[id] = ' · ' + String.fromCharCode(65 + (i % 26)); }); });
  const memberLabel = (m, base) => (base || '') + (m ? (dupSuffix[m.id] || '') : '');
  // D-268 (card `shipyard-encounter-craft-build`): two craft of one key take the same suffix, by the same rule, on their rows
  // and on the ABOARD picker's options — each keeps its own damage now, so the GM must tell them apart.
  const _byKey = {};
  (openGroup.vehicles || []).forEach(v => { (_byKey[v.key] = _byKey[v.key] || []).push(v.id); });
  Object.keys(_byKey).forEach(k => { const ids = _byKey[k]; if (ids.length > 1) ids.forEach((id, i) => { dupSuffix[id] = ' · ' + String.fromCharCode(65 + (i % 26)); }); });
  const craftLabel = (v, base) => (base || '') + (v ? (dupSuffix[v.id] || '') : '');
  // U3 (bench-custom-usability-triage §3): the duplicate suffix (· A / · B) is the ONLY thing telling
  // two Wookiees apart, so it may never be the part that truncates. `memberLabel` concatenates it onto
  // the END of the string — exactly what a line-clamp eats first — so surfaces that clamp render the
  // parts SEPARATELY: base name clamps, suffix never shrinks.
  const memberParts = (m, base) => ({ base: base || '', suffix: (m && dupSuffix[m.id]) || '' });

  // ── THE ONE-CORE OP LAYER (bench-board-viewtoggle-brief guard 1). Every member operation is a
  //    store call that exists ONCE here; the phone flip, the CARD board, and the LIST ledger all
  //    call these — no per-style fork of an op. Conditions, wounds, strain, pool, remove.
  const condsOf = (m) => (Array.isArray(m.conditions) ? m.conditions : []);
  const toggleCond = (m, token) => {
    const cur = condsOf(m);
    const next = cur.indexOf(token) === -1 ? cur.concat(token) : cur.filter(t => t !== token);
    actions.setMember(openGroup.id, m.id, { conditions: next });
  };
  const stOf = (r) => (r && r.derived && (r.derived.strain != null ? r.derived.strain : r.derived.strainThreshold)) || 0;
  const wsRead = (m) => {
    const r = resolveBySourceKey(m._source_key);
    const tier = r ? (r.tier || '') : '';
    const wt = wtOf(r), st = stOf(r);
    return { r, tier, wt, st, hasStrain: st > 0 || tier === 'nemesis', isMinion: tier === 'minion' };
  };
  // B-767 (both faces) — the `|| 50` fallthrough is GONE: a record with no threshold (a dangling member's,
  // or a TALK-only custom's 0) has a ceiling of 0, so it can never read "WOUNDS 4 / 0" (B8 draws 0 / 0).
  const setW = (m, v) => actions.setMember(openGroup.id, m.id, { currentWounds: Math.max(0, Math.min((wsRead(m).wt || 0) * 2, v)) });
  const setS = (m, v) => actions.setMember(openGroup.id, m.id, { currentStrain: Math.max(0, Math.min((wsRead(m).st || 0) * 2, v)) });
  const selectMember = (m) => { setFlipKey(m.id); if (deskBoard && !wideBoard) setRefOverlay(true); };

  // Conditions chips — the ONE shared piece (bench-conditions-triage §3): three RAW status chips on
  // every member/line, every tier, tap-to-toggle (≥44px), persisted via toggleCond. Unknown tokens
  // render as plain lit chips (tolerant reader — homebrew/future vocabulary is old-data-safe).
  // Thin render-helper (F2): the shared BenchConditionsChips (module scope) fed this member's conditions +
  // a toggle callback. Called ({condChips(m)}), never rendered as a component, so no remount hazard.
  const condChips = (m, dense) => <BenchConditionsChips conditions={condsOf(m)} accent={accent} onToggle={(t) => toggleCond(m, t)} dense={dense}
    adding={condAddFor === m.id} onAddOpen={() => setCondAddFor(m.id)} onAddClose={() => setCondAddFor(null)} />;


  const TIER_LABEL = { nemesis: 'NEMESES', rival: 'RIVALS', minion: 'MINION LINES' };

  // F2: the ctx bundle handed to the module-scope BenchAddMemberBlock / BenchMemberCard. Recreated each
  // render — that's a re-render (props update, input focus KEPT), never the identity-churn remount.
  // F-54: declared BEFORE `benchCtx`, which reads it — a `const` used above its declaration is a
  // temporal-dead-zone ReferenceError, and it took the whole board down (both stale AND normal)
  // rather than degrading. Caught because the probe's control case went dark too: a change that
  // breaks the case it was not aiming at is a construction error, not a behaviour one.
  const benchStale = !!(bench && bench.stale);
  const benchCtx = {
    openGroup, actions, accent, addSearch, setAddSearch, addResults, inGroupSrc,
    resolveBySourceKey, factionProfiles, refData, poolView, setW, setS, setFlipKey, setRefOverlay, condChips,
    benchStale,   // F-54: the surface's read-only state, for pieces that draw their own controls
    craftLabel,   // D-268: a craft's name with its duplicate suffix
  };

  const tierStripe = (tier, ok) => (!ok ? '#FF7676' : ({ nemesis: '#F5C842', rival: '#FF9E5A', minion: '#8FB6D8' }[tier] || accent));
  // E2 (remount sweep) — the board render family is hoisted to module scope
  // (BenchWSBar / BenchMinionPoolFrame / BenchStripChip / BenchBoardCard / BenchCardBoard /
  // BenchLedgerRow / BenchLedgerBoard). This is the ctx they close over — recreated each render
  // = a props update (no identity churn, no remount), the F2 pattern. Defined AFTER the helpers
  // (reorderArrows / tierStripe / initialOf / wsStepBtn) so it can carry them.
  const boardCtx = {
    accent, actions, openGroup, orderedMembers, refData,
    resolveBySourceKey, flipKey, setFlipKey,
    poolView, memberLabel, memberParts, wtOf, wsRead, setW, setS, bumpLine, critLine, bumpCount,
    tierStripe, selectMember, condChips,
    crewingFor, setCrewingFor, benchStale, reorderMember, craftLabel,
  };

  // ── DESKTOP / MID-TIER: the board replaces the flip (phones fall through to the flip return below). ──
  // B-761 / B13 — the title is its own field, in place (desk and flip draw the same part).
  const renameTitle = () => {
    const commitRename = (v) => { setRenaming(false); if (v && v.trim() && v.trim() !== openGroup.name) actions.rename(openGroup.id, v); };
    return renaming ? (
      <label className="nl-rename">
        <input className="nl-in nl-gname-in" autoFocus defaultValue={openGroup.name} aria-label="Encounter name" data-npc-rename-input="1"
          onBlur={e => commitRename(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target.value); } else if (e.key === 'Escape') setRenaming(false); }} />
      </label>
    ) : (
      /* R-NPR8B-3 (R1): the ✎ is THE accessible control (name + keyboard); the title keeps only the pointer press */
      <h2 className="nl-gname" data-npc-rename="1" onClick={() => setRenaming(true)}>{openGroup.name}{' '}
        {/* B-895 · B4 / B7 — NotesRow's ✎ INLINE after the name (it follows the last word where the name wraps), opening
            B13's field; the title press stays the second path (R-NPR57-4). One title part: every board arm reaches it. */}
        <button type="button" className="nl-glyph" data-npc-rename-glyph="1" style={{ verticalAlign: 'middle', margin: '-12px 0' }}
          aria-label={'Rename ' + openGroup.name} onClick={e => { e.stopPropagation(); setRenaming(true); }}>✎</button></h2>
    );
  };
  // B9 / B-304 — below the desk seam (a phone the layout pref forces to the desktop arm) the LIST arm
  // cannot be a six-column table: it stacks each unit, keeping the table's order and parts.
  boardCtx.narrowLedger = !deskWide;

  // ENCOUNTERS E3 lap B — the manager's open encounter (F3/F4/F8). It shares this view's one-core ops, its board
  // components and its zone; with the switch off `manager` is null and the board below is today's.
  if (manager) {
    const seg = (
      <span className="nl-seg" role="group" aria-label="Board view">
        {[['card', 'CARD'], ['list', 'LIST']].map(v => (
          <button key={v[0]} type="button" className="nl-tab" data-on={boardView === v[0] ? '1' : '0'} aria-pressed={boardView === v[0]}
            data-testid={'board-view-' + v[0]} onClick={() => setBoardViewPref(v[0])}>{v[1]}</button>
        ))}
      </span>
    );
    return <EncOpen bc={boardCtx} benchCtx={benchCtx} manager={manager} bench={bench}
      view={{ deskBoard, wideBoard, boardView, seg, refOverlay, setRefOverlay, member, renameTitle, setOpenGroupId, condAddFor, setCondAddFor }} />;
  }

  if (!deskBoard) {
    // B7 · B8 · B13 — THE PHONE FLIP: the toolbar, the title, the sticky member strip, every minion line's
    // pool frame, the add block, and ONE member's card (the live tracker is the flip card's).
    const minionLinesP = orderedMembers.filter(m => tierOf(m) === 'minion');
    return (
      <div data-npc-state="flip">
        <div className="nl-bar">
          <button type="button" className="hp-quiet" onClick={() => setOpenGroupId(null)}>← ENCOUNTERS</button>
          <span className="nl-sp" />
          {memberCount + craftCount > 0 ? <button type="button" className="hp-quiet" onClick={() => actions.reset(openGroup.id)}>{'HEAL & REPAIR ALL'}</button> : null}
          <button type="button" className="hp-quiet" onClick={() => { actions.del(openGroup.id); setOpenGroupId(null); }}>DELETE</button>
        </div>
        {renameTitle()}
        {benchStale ? <StaleTabBanner accent={accent} paper /> : null}
        {memberCount > 0 ? (
          <div className="nl-strip" role="tablist" aria-label="Encounter members">
            {orderedMembers.map(m => <BenchStripChip key={m.id} m={m} ctx={boardCtx} />)}
          </div>
        ) : null}
        {minionLinesP.map(m => <BenchMinionPoolFrame key={m.id} m={m} ctx={boardCtx} />)}
        <BenchAddMemberBlock ctx={benchCtx} />
        {/* B-893 · B7's door — the desk's craft block (its rows and + ADD VEHICLE) after the add block; B14c/d open from it */}
        <BenchGroupCraft ctx={benchCtx} />
        {memberCount === 0 ? (
          <div className="hp-plate" data-pad="read"><p className="hp-none" style={{ margin: 0 }}>Empty group. Search above to add NPCs.</p></div>
        ) : (
          <React.Fragment>
            <div className="nl-gap" />
            <BenchMemberCard m={member} ctx={benchCtx} />
          </React.Fragment>
        )}
      </div>
    );
  }

  // B4 · B5 · B6 · B12 · B13 — the toolbar, the title (rename in place), the stale banner, the add
  // block, the craft, then the card grid or the ledger; the pane at ≥1367, the summoned overlay below.
  const boardBodyP = memberCount === 0
    ? <div className="hp-plate" data-pad="read"><p className="hp-none" style={{ margin: 0 }}>Empty group. Search above to add NPCs.</p></div>
    : (boardView === 'list' ? <BenchLedgerBoard ctx={boardCtx} /> : <BenchCardBoard ctx={boardCtx} />);
  const title = renameTitle();
  // B-908 · AS-4 (ruling `paper-n3-bench` R-PN3-1/-2; frames B4 · B5 · B6 · B12 · B16b · B17 at lab `8bf1f3a3`): the
  // page never scrolls. The HEAD stays put — the toolbar, the title, and while stale the banner (fixed-height parts
  // only); ONE main ZONE under it scrolls the add block, the craft, the gap and the grid or ledger, in today's order.
  // BOTH ARMS RENDER `div.nl-main` AS THE BOARD'S FIRST CHILD, so crossing the 1367 seam re-renders the main column
  // instead of remounting it (AS-8: the picker's search and an open note's draft survive the seam). The pane (>=1367)
  // and the summoned overlay (1024-1366) each scroll their reference in their own zone; × CLOSE stays above it.
  const paneArm = wideBoard && memberCount > 0;
  const main = (
    <React.Fragment>
      <div className="nl-bar">
        <button type="button" className="hp-quiet" onClick={() => setOpenGroupId(null)}>← ENCOUNTERS</button>
        <span className="nl-sp" />
        {memberCount > 0 ? (
          <span className="nl-seg" role="group" aria-label="Board view">
            {[['card', 'CARD'], ['list', 'LIST']].map(v => (
              <button key={v[0]} type="button" className="nl-tab" data-on={boardView === v[0] ? '1' : '0'} aria-pressed={boardView === v[0]}
                data-testid={'board-view-' + v[0]} onClick={() => setBoardViewPref(v[0])}>{v[1]}</button>
            ))}
          </span>
        ) : null}
        {memberCount + craftCount > 0 ? <button type="button" className="hp-quiet" onClick={() => actions.reset(openGroup.id)}>{'HEAL & REPAIR ALL'}</button> : null}
        <button type="button" className="hp-quiet" onClick={() => { actions.del(openGroup.id); setOpenGroupId(null); }}>DELETE</button>
      </div>
      {title}
      {benchStale ? <StaleTabBanner accent={accent} paper /> : null}
      <BenchZone zone="main">
        <BenchAddMemberBlock ctx={benchCtx} />
        <BenchGroupCraft ctx={benchCtx} />
        <div className="nl-gap" />
        <div data-testid="bench-board">{boardBodyP}</div>
      </BenchZone>
    </React.Fragment>
  );
  return (
    <div className="nl-board" data-npc-state="board" data-board-arm={paneArm ? 'pane' : 'overlay'}>
      <div className="nl-main">{main}</div>
      {paneArm ? (
        <div className="nl-pane" data-testid="bench-ref-pane">
          <BenchZone zone="pane">{member ? <BenchTabbedReference m={member} ctx={benchCtx} /> : null}</BenchZone>
        </div>
      ) : null}
      {!wideBoard && refOverlay && member ? (
        <BenchRefOverlay onClose={() => setRefOverlay(false)}>
          <BenchZone zone="overlay"><BenchTabbedReference m={member} ctx={benchCtx} /></BenchZone>
        </BenchRefOverlay>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   GM NPC CREATOR — Lap C2 (scope gm-lap-c2-creator-scope). The "two faces"
   author flow, matching Docs/mockups/gm-c2-npc-creator.html (frozen).
   Mounts as NpcLibrary `view` states: c-fork → c-fight (+ c-armory) | c-talk
   (+ c-profile). Records persist through castActions (CastStore). GM-only
   (capabilities.canManageCast). This module owns the AUTHOR surfaces ONLY —
   the finished two-faced page (reference view) + attach-resolution render live
   in NpcCustomFinishedPage.
   ────────────────────────────────────────────────────────────────────────── */

function creatorCharAbbrev(c) {
  return ({ brawn: 'Br', agility: 'Ag', intellect: 'Int', cunning: 'Cun', willpower: 'Will', presence: 'Pr' })[c] || '';
}
function prettifyCreatorSkill(s) {
  if (!s) return '';
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}
function creatorSkillGroup(skillRaw) {
  const s = String(skillRaw || '').toLowerCase();
  if (s.indexOf('gunnery') !== -1) return 'gunnery';
  if (s.indexOf('ranged') !== -1) return 'ranged';
  if (s.indexOf('melee') !== -1 || s.indexOf('brawl') !== -1 || s.indexOf('lightsaber') !== -1) return 'melee';
  return 'other';
}
// Normalize a weapon (canon-inline object OR legacy prose string) into display fields for the armory.
// The ORIGINAL object is kept by the caller and stored verbatim on attach so the finished page renders
// it through the same WeaponTable path as its source NPC (no projection drift).
function creatorNormWeapon(w) {
  if (!w) return { name: '', skill: '', skillLabel: '', damage: '–', crit: '–', range: '–', qualities: [] };
  if (typeof w === 'string') {
    const p = parseWeaponString(w);
    return { name: p.name || w, skill: '', skillLabel: '', damage: p.damage || '–', crit: '–',
      range: p.range || '–', qualities: p.qualities ? String(p.qualities).split(/,\s*/) : [] };
  }
  // B-1833: an object damage prints through the finished page's projection (WeaponTable → SWItems.canonicalToStore), so a
  // Brawn weapon reads "+3" here as it does there; `damageBase` keeps the base the old `.value` read dropped.
  const dmgObj = (w.damage && typeof w.damage === 'object') ? w.damage : null;
  const SWc = window.SWItems;
  const dmg = dmgObj ? ((SWc && SWc.canonicalToStore) ? SWc.canonicalToStore(w, 'weapons').damage : dmgObj.value) : w.damage;
  const quals = Array.isArray(w.qualities)
    ? w.qualities.map(function (q) { return typeof q === 'string' ? q : ((q.name || '') + (q.ranked && q.rank != null ? ' ' + q.rank : '')); })
    : [];
  const skillRaw = w.skill || '';
  const nm = (window.SWItems && window.SWItems.skillName) ? (window.SWItems.skillName(skillRaw) || skillRaw) : skillRaw;
  return {
    name: w.name || 'Weapon', skill: skillRaw, skillLabel: prettifyCreatorSkill(nm || skillRaw),
    damage: (dmg != null && dmg !== '') ? dmg : '–',
    damageBase: (dmgObj && dmgObj.base) || null,
    crit: (w.crit != null && w.crit !== '') ? w.crit : '–',
    range: prettifyCreatorSkill(w.range || '–'),
    qualities: quals,
  };
}
// Suggested derived stats — the archetype median for this tier if loaded, else a plain
// characteristic-based fallback. Always overridable (the mockup's SUGGESTED framing).
function creatorSuggestDerived(chars, tier, archetypes) {
  const a = (archetypes && archetypes[tier]) || null;
  const ad = (a && a.derived) || {};
  const br = (chars && chars.brawn) || 0;
  const wil = (chars && chars.willpower) || 0;
  return {
    soak: ad.soak != null ? ad.soak : br,
    wounds: ad.wounds != null ? ad.wounds : (10 + br),
    strain: ad.strain != null ? ad.strain : (10 + wil),
    melee_defense: ad.melee_defense != null ? ad.melee_defense : 0,
    ranged_defense: ad.ranged_defense != null ? ad.ranged_defense : 0,
  };
}

// ‹ BACK affordance, resident on every creator screen (in addition to the injected header BACK).
function CreatorBackRow({ onBack, label, accent }) {
  // B-869 — the creator's parts on paper (C6–C10, C13, C14): each branches here, so every editor that
  // mounts them draws the board's part with the same testid, aria-label and write.
  return <button type="button" className="hp-quiet nl-back2" data-testid="creator-back" onClick={onBack}>{'\u2039 ' + (label || 'BACK')}</button>;
}

// Resident sticky SAVE bar, pinned to the TOP of a creator screen under the back row (E3 — a long form
// should never hide its save below the fold; same actions-above-the-prose rule the DETAILS pane adopted).
function CreatorSaveBar({ label, onSave, accent, textColor }) {
  return <button type="button" className="hp-commit nl-wide" data-testid="creator-save" onClick={onSave}>{label}</button>;
}

// U1 (bench-custom-usability-triage §3): the custom NPC's NAME field. The record always had a
// `name` (a clone carries the canon one) and `CastStore.updateNpc` always let it through — its
// immutability guard covers the KEY, not the label. There was simply no door: neither creator face
// offered an input, so every clone was stuck as "Stormtrooper". Editable at CREATE and on every
// revisit; persists through the existing save path (no schema change).
function CreatorNameField({ value, onChange, accent }) {
  return (
    <label className="nl-field"><b>Name</b>
      <input type="text" className="nl-in nl-namein" value={value || ''} data-testid="creator-name"
        onChange={(e) => onChange(e.target.value)} placeholder="Name this NPC…" aria-label="NPC name" />
    </label>
  );
}

// Horizontal − value + stepper (skill/talent/derived ranks). 44px touch targets, aria-labelled.
function CreatorStepper({ value, min, max, onChange, ariaLabel, accent }) {
  const v = (typeof value === 'number') ? value : (parseInt(value, 10) || 0);
  const lo = (min == null ? 0 : min), hi = (max == null ? 9 : max);
  // the board's stepper (C7/C8 `nl-step`): the sheet's tracker buttons around the value
  const pb = (d, sym) => (
    <button type="button" className="sb-trk-btn" aria-label={(ariaLabel || 'value') + (d > 0 ? ' increase' : ' decrease')}
      onClick={() => onChange(Math.max(lo, Math.min(hi, v + d)))}>{sym}</button>
  );
  return <span className="nl-step">{pb(-1, '\u2212')}<b>{v}</b>{pb(1, '+')}</span>;
}

// Compact characteristic tile: BR/AG/… label, big number, −/+ underneath (mockup .stat cell).
function CreatorCharCell({ label, name, value, onChange, accent }) {
  const v = (typeof value === 'number') ? value : (parseInt(value, 10) || 0);
  const step = (d) => onChange(Math.max(0, Math.min(9, v + d)));
  // C7/C8 `nl-cc`: the sheet's characteristic bead over its label, the two presses under it
  return (
    <div className="nl-cc">
      <div className="hp-char"><span className="hp-char-val"><span className="hp-char-bead">{v}</span></span><span className="hp-char-lab">{label}</span></div>
      <div>
        <button type="button" aria-label={name + ' decrease'} data-testid={'creator-char-' + name} onClick={() => step(-1)}>{'\u2212'}</button>
        <button type="button" aria-label={name + ' increase'} data-testid={'creator-char-' + name} onClick={() => step(1)}>+</button>
      </div>
    </div>
  );
}

// Plain text/textarea styled to the mockup .inp. Controlled — commits every keystroke to the store.
function CreatorText({ value, onChange, placeholder, area, ariaLabel, testid, grow }) {
  // `grow` (B-898 fix 4, C15/C16): the field grows to its text, inline as the frame draws it — no kit rule
  return area
    ? <textarea className="nl-in" data-testid={testid} aria-label={ariaLabel} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        style={grow ? { fieldSizing: 'content' } : undefined} />
    : <input className="nl-in" data-testid={testid} aria-label={ariaLabel} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/* 1 · THE CREATE FORK — "Who are you making?" fight-or-talk, verbatim from the mockup. */
function NpcCreateForkView({ onPickFight, onPickTalk, onBack, accent }) {
  // B-869 · C6 — the fork: two plates, the choice, the clone hint.
  const pick = (eyebrow, title, onTap, testid) => (
    <button type="button" className="hp-plate nl-pick" data-pad="read" data-testid={testid} onClick={onTap}>
      <span className="nl-pick-h"><span className="nl-tier">{eyebrow}</span><span aria-hidden="true">›</span></span>
      <span className="nl-tile-t">{title}</span>
    </button>
  );
  return (
    <div data-testid="creator-fork" data-npc-state="fork">
      <CreatorBackRow onBack={onBack} label="CUSTOM NPC" accent={accent} />
      <div className="hp-maker">CUSTOM NPC · NEW NPC</div>
      <h1 className="hp-desig nl-d2">Who are you making?</h1>
      <div className="hp-desig-rule" />
      {pick('A THREAT', 'Do they FIGHT?', onPickFight, 'creator-fork-fight')}
      {pick('A PERSON', 'Do they TALK?', onPickTalk, 'creator-fork-talk')}
    </div>
  );
}

/* Searchable skill adder (list, NOT a dropdown) — commits {skill_ref,name,rank:1}. */
function CreatorSkillAdder({ vocab, existingRefs, onAdd, accent }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const matches = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return (vocab || [])
      .filter((s) => !existingRefs.has(s.id))
      .filter((s) => !query || s.label.toLowerCase().indexOf(query) !== -1)
      .slice(0, 8);
  }, [vocab, q, existingRefs]);
  // C7's closed door is drawn (`＋ add skill`); the open list is not — the same quiet controls (reported)
  if (!open) return <button type="button" className="hp-quiet nl-add" data-testid="creator-add-skill" onClick={() => setOpen(true)}>＋ add skill</button>;
  return (
    <div data-npc-adder="skill">
      <CreatorText value={q} onChange={setQ} placeholder="Search skills…" ariaLabel="Search skills" testid="creator-skill-search" />
      <div className="nl-acts">
        {matches.map((s) => (
          <button key={s.id} type="button" className="hp-quiet" onClick={() => { onAdd(s); setQ(''); setOpen(false); }}>
            {s.label} <span className="nl-tier">{creatorCharAbbrev(s.characteristic)}</span></button>
        ))}
        {matches.length === 0 && <span className="hp-none">No matches.</span>}
      </div>
      <button type="button" className="hp-quiet" onClick={() => { setOpen(false); setQ(''); }}>✕ cancel</button>
    </div>
  );
}

/* Talent adder — autocomplete over canon talent names when available, free text otherwise.
   Adversary is just a talent here (inline, unranked-by-UI per Jason / RAW A1): no special row. */
function CreatorTalentAdder({ names, onAdd, accent }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const matches = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return (names || []).filter((n) => n.toLowerCase().indexOf(query) !== -1).slice(0, 6);
  }, [names, q]);
  const commitP = (name) => { const v = (name || '').trim(); if (!v) return; onAdd(v); setQ(''); setOpen(false); };
  if (!open) return <button type="button" className="hp-quiet nl-add" data-testid="creator-add-talent" onClick={() => setOpen(true)}>＋ talent (autocomplete)</button>;
  return (
    <div data-npc-adder="talent">
      <div className="nl-acts" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
        <CreatorText value={q} onChange={setQ} placeholder="Talent name…" ariaLabel="Talent name" testid="creator-talent-search" />
        <button type="button" className="hp-quiet" onClick={() => commitP(q)}>add</button>
      </div>
      {matches.length > 0 && (
        <div className="nl-acts">{matches.map((n) => <button key={n} type="button" className="hp-quiet" onClick={() => commitP(n)}>{n}</button>)}</div>
      )}
      <button type="button" className="hp-quiet" onClick={() => { setOpen(false); setQ(''); }}>✕ cancel</button>
    </div>
  );
}

/* 2 · THE FIGHT EDITOR — one scrolling screen + resident SAVE bar. */
// ── CreatorShell (ruling npc-creator-revision-concept §1 + Addendum 1) ────────────────────────
// The creator forms were the GM side's last phone-column-at-every-width surfaces: zero adaptive
// branches on fight / talk / armory / fork (verified by grep before this lap). The shell gives every
// editor ONE capability — "check what I am building" — with the geometry the device deserves:
//   >=1367   form | LIVE PREVIEW side by side; the preview is NpcCustomFinishedPage read-only, so
//            the stat card assembles as you type (no save-and-check round trip).
//   <1367    the form as it was, plus a PREVIEW affordance in the action row that summons the SAME
//            card full-screen; back returns with form state intact (AS-8 — the form never unmounts).
// One capability, per-platform arrangement — the tabbed-card / table-mode precedent.
function CreatorShell({ draft, resolveBySourceKey, refData, factionProfiles, accent, leadFace, children }) {
  const wide = useMinWidth(1367);
  const [summon, setSummon] = React.useState(false);
  // B-1825/B-1826 (ADDENDUM 631): the summoned preview covers the form, so it holds focus, and Escape is its
  // ‹ BACK TO THE FORM. At >=1367 the preview is a column beside the form and holds nothing.
  const previewRef = useRef(null), summoned = summon && !wide;
  window.SWRPGUI.useHoldFocus(previewRef, summoned);
  window.SWRPGUI.useEscape(summoned, () => setSummon(false));
  // its door, PREVIEW THIS NPC, is not drawn while the preview stands, so at close focus goes to the one drawn again
  const doorRef = useRef(null), wasSummoned = useRef(false);
  useEffect(() => {
    if (wasSummoned.current && !summoned && doorRef.current) doorRef.current.focus();
    wasSummoned.current = summoned;
  }, [summoned]);
  // The preview is for LOOKING, not operating. The shared card ships real controls (wound steppers,
  // SHOW ALL, ADD VEHICLE) and they have no business acting on an unsaved draft — a half-live control
  // on a preview is worse than none. Non-interactive and out of the tab order; it also settles the
  // tap-floor question honestly (a preview has no tap targets to hold a floor).
  const previewCard = (
    <div aria-label="Preview — read only" style={{ pointerEvents: 'none', userSelect: 'text' }}>
      <NpcCustomFinishedPage
        npc={draft || {}} resolveBySourceKey={resolveBySourceKey} refData={refData}
        factionProfiles={factionProfiles} accent={accent} preview leadFace={leadFace}
      />
    </div>
  );
  // C8 / C10 — at >=1367 the form beside the 340px LIVE PREVIEW (`nl-form` · `nl-prev`); below it the
  // form and the PREVIEW door (C7 / C9). The summoned preview is drawn by no frame: the finished page on
  // the page's own ground over the form, which stays mounted (AS-8) — reported at the gate.
  if (wide) {
    return (
      <div className="nl-form" data-testid="creator-shell-wide">
        <div className="nl-main">{children}</div>
        <div className="nl-prev" data-testid="creator-preview"><div className="nl-kvhead">Live preview</div>{previewCard}</div>
      </div>
    );
  }
  return (
    <div>
      {children}
      {summon && (
        <div data-testid="creator-preview" role="dialog" aria-label="NPC preview" ref={previewRef}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--doc-paper)', overflowY: 'auto', padding: '16px 18px 40px' }}>
          <button type="button" className="hp-quiet nl-back2" data-testid="creator-preview-back" onClick={() => setSummon(false)}>{'\u2039 BACK TO THE FORM'}</button>
          {previewCard}
        </div>
      )}
      {!summon && <button type="button" className="hp-quiet nl-wide" data-testid="creator-preview-open" ref={doorRef} onClick={() => setSummon(true)}>PREVIEW THIS NPC</button>}
    </div>
  );
}

function NpcFightEditorView({ draft, castKey, actions, archetypes, refData, onOpenArmory, onSave, onBack, accent, resolveBySourceKey, factionProfiles }) {
  const tier = (draft && draft.tier) || 'rival';
  const chars = (draft && draft.characteristics) || {};
  const der = (draft && draft.derived) || {};
  const skills = (draft && draft.skills) || [];
  const talents = (draft && draft.talents) || [];
  const abilities = (draft && draft.abilities) || [];
  const gear = (draft && draft.gear) || [];
  const weapons = (draft && draft.weapons) || [];
  const upd = (p) => actions.update(castKey, p);

  const vocab = (refData && refData.skillsVocab) || [];
  const vocabById = React.useMemo(() => { const m = {}; vocab.forEach((s) => { m[s.id] = s; }); return m; }, [vocab]);
  const talentNames = React.useMemo(() => {
    const t = (refData && refData.talents) || {};
    return Object.keys(t).map((k) => (t[k] && t[k].name) || k).sort((a, b) => a.localeCompare(b));
  }, [refData]);
  const existingSkillRefs = React.useMemo(() => new Set(skills.map((s) => s.skill_ref || s.id)), [skills]);
  const sugg = creatorSuggestDerived(chars, tier, archetypes);

  const TYPE_HINT = {
    minion: { lead: 'MINION', body: 'group-only skills; strain is taken as wounds (no strain track).', others: 'Rival = one full profile, no strain track; Nemesis = full track + Adversary.' },
    rival: { lead: 'RIVAL', body: 'no strain track; one full profile.', others: 'Minion = group-only skills + strain→wounds; Nemesis = full track + Adversary.' },
    nemesis: { lead: 'NEMESIS', body: 'full wound + strain track; PC-equivalent.', others: 'Minion = group-only skills + strain→wounds; Rival = no strain track.' },
  };
  const hint = TYPE_HINT[tier] || TYPE_HINT.rival;

  const seedArchetype = () => {
    const a = archetypes && archetypes[tier];
    if (!a) return;
    const d = Object.assign({}, a.derived);
    if (tier !== 'nemesis') delete d.strain;
    upd({ characteristics: Object.assign({}, a.characteristics), derived: d });
  };

  const setDer = (k, v) => upd({ derived: Object.assign({}, der, { [k]: v }) });

  const derivedTiles = [
    { k: 'soak', label: 'SOAK' },
    { k: 'wounds', label: 'WOUND' },
    ...(tier === 'nemesis' ? [{ k: 'strain', label: 'STRAIN' }] : []),
    { k: 'melee_defense', label: 'M-DEF' },
    { k: 'ranged_defense', label: 'R-DEF' },
  ];


  // R-NPC-13 — a canon weapon is stored as its registry ID and RESOLVED at render (both faces): the row
  // prints the registry's name and figures, never the raw id.
  const canonW = (refData && refData.canonWeapons) || {};
  const shownWeapon = (w) => creatorNormWeapon((typeof w === 'string' && canonW[w]) ? canonW[w] : w);
  // B-869 · C7 (390) · C8 (1440, beside the live preview) — the board's FIGHT page. The frames draw the
  // form EMPTY; a filled row (a skill, a talent, a weapon, an ability, a gear line) is not drawn, so each
  // is the kit's name · its control · a quiet × on one line (reported at the gate).
  const sec = (label, cite) => <div className="hp-sechead" data-stack="1"><h2>{label}</h2>{cite ? <span className="hp-cite">{cite}</span> : null}</div>;
  const line = (key, name, sub, control, removeLabel, onRemove) => (
    <div key={key} className="nl-acts" data-npc-row={removeLabel} style={{ margin: '0 0 6px', flexWrap: 'nowrap', alignItems: 'center' }}>
      <span className="nl-cn" style={{ flex: 1, minWidth: 0 }}><b>{name}</b>{sub ? <span className="nl-tier">{sub}</span> : null}</span>
      {control}
      <span className="nl-glyphs"><button type="button" className="nl-glyph" data-g="x" aria-label={removeLabel} onClick={onRemove}>×</button></span>
    </div>
  );
  const arch = !!(archetypes && archetypes[tier]);
  return (
    <div data-testid="creator-fight-editor" data-npc-state="fight">
      <CreatorBackRow onBack={onBack} label="CHOOSE HOW TO START" accent={accent} />
      <CreatorSaveBar label="SAVE TO CUSTOM NPC" onSave={onSave} accent={CREATOR_GOLD} />
      <CreatorNameField value={draft && draft.name} onChange={(v) => upd({ name: v })} accent={accent} />
      <CreatorShell draft={draft} resolveBySourceKey={resolveBySourceKey} refData={refData}
        factionProfiles={factionProfiles} accent={accent} leadFace="threat">
        <div className="nl-pills">
          {['minion', 'rival', 'nemesis'].map((t) => (
            <button key={t} type="button" className="hp-quiet nl-pill" data-on={tier === t ? '1' : '0'} data-testid={'creator-type-' + t}
              aria-pressed={tier === t ? 'true' : 'false'} onClick={() => upd({ tier: t })}>{t.toUpperCase()}</button>
          ))}
        </div>
        <p className="hp-why" data-standalone="1"><b>{hint.lead}</b> — {hint.body} ({hint.others})</p>
        <button type="button" className="hp-quiet nl-wide" data-testid="creator-archetype-btn" onClick={seedArchetype} disabled={!arch}>
          {'\u2726 Start from a ' + tier.toUpperCase() + ' archetype (optional)'}</button>
        {sec('IDENTITY')}
        <div className="hp-plate" data-pad="data">
          <label className="nl-field"><b>LINE</b>
            <CreatorText value={draft.description} onChange={(v) => upd({ description: v })} placeholder="One-line descriptor" ariaLabel="Descriptor" testid="creator-line" />
          </label>
        </div>
        {sec('CHARACTERISTICS')}
        <div className="nl-charcells">
          {CREATOR_CHARS.map((c) => (
            <CreatorCharCell key={c.key} label={c.label} name={c.key} value={chars[c.key] ?? 0}
              onChange={(v) => upd({ characteristics: Object.assign({}, chars, { [c.key]: v }) })} accent={accent} />
          ))}
        </div>
        {sec('DERIVED', 'SUGGESTED')}
        <div className="hp-plate" data-pad="data">
          <div className="nl-dtiles">
            {derivedTiles.map((t) => (
              <div key={t.k} className="nl-dt"><span className="nl-tier">{t.label}</span>
                <CreatorStepper value={der[t.k] ?? sugg[t.k]} min={0} max={99} onChange={(v) => setDer(t.k, v)} ariaLabel={t.label} accent={accent} /></div>
            ))}
          </div>
        </div>
        {sec('SKILLS')}
        <div className="hp-plate" data-pad="data">
          {skills.map((sk, i) => {
            const ref = sk.skill_ref || sk.id;
            const voc = vocabById[ref];
            const label = (voc && voc.label) || sk.name || ref;
            return line(ref + i, label, voc ? creatorCharAbbrev(voc.characteristic) : '',
              <CreatorStepper value={sk.rank ?? 0} min={0} max={6} ariaLabel={label + ' rank'} accent={accent}
                onChange={(v) => upd({ skills: skills.map((x, j) => j === i ? Object.assign({}, x, { rank: v }) : x) })} />,
              'Remove ' + label, () => upd({ skills: skills.filter((_, j) => j !== i) }));
          })}
          <CreatorSkillAdder vocab={vocab} existingRefs={existingSkillRefs} accent={accent}
            onAdd={(sk) => upd({ skills: skills.concat([{ skill_ref: sk.id, name: sk.label, rank: 1 }]) })} />
        </div>
        {sec('TALENTS', 'flat — RAW NPC shape')}
        <div className="hp-plate" data-pad="data">
          {talents.map((t, i) => line((t.name || '') + i, t.name, '',
            <CreatorStepper value={t.rank ?? 1} min={1} max={5} ariaLabel={(t.name || 'talent') + ' rank'} accent={accent}
              onChange={(v) => upd({ talents: talents.map((x, j) => j === i ? Object.assign({}, x, { rank: v }) : x) })} />,
            'Remove ' + (t.name || 'talent'), () => upd({ talents: talents.filter((_, j) => j !== i) })))}
          <CreatorTalentAdder names={talentNames} accent={accent} onAdd={(name) => upd({ talents: talents.concat([{ name: name, rank: 1 }]) })} />
        </div>
        {sec('WEAPONS')}
        <div className="hp-plate" data-pad="data">
          {weapons.map((w, i) => {
            const n = shownWeapon(w);
            // B-898 fix 2 (C15/C16): skill · Damage · Critical · Range — the range was dropped for any weapon with a skill
            return line((n.name || '') + i, n.name, [n.skillLabel, 'Damage ' + n.damage, 'Critical ' + n.crit, 'Range ' + n.range].filter(Boolean).join(' \u00B7 '), null,
              'Remove ' + n.name, () => upd({ weapons: weapons.filter((_, j) => j !== i) }));
          })}
          <button type="button" className="hp-commit nl-wide" data-testid="creator-open-armory" onClick={onOpenArmory}>⛨ PICK FROM THE ARMORY →</button>
        </div>
        {sec('ABILITIES & GEAR')}
        <div className="hp-plate" data-pad="data">
          {abilities.map((a, i) => (
            <div key={'ab' + i} data-npc-row="ability" style={{ marginBottom: '8px' }}>
              <div className="nl-acts" style={{ margin: 0, flexWrap: 'nowrap', alignItems: 'center' }}>
                <CreatorText value={a.name} onChange={(v) => upd({ abilities: abilities.map((x, j) => j === i ? Object.assign({}, x, { name: v }) : x) })} placeholder="Ability name" ariaLabel="Ability name" />
                <span className="nl-glyphs"><button type="button" className="nl-glyph" data-g="x" aria-label={'Remove ability'} onClick={() => upd({ abilities: abilities.filter((_, j) => j !== i) })}>×</button></span>
              </div>
              <CreatorText value={a.description} onChange={(v) => upd({ abilities: abilities.map((x, j) => j === i ? Object.assign({}, x, { description: v }) : x) })} placeholder="What it does…" ariaLabel="Ability description" area grow />
            </div>
          ))}
          {gear.map((g, i) => (
            <div key={'ge' + i} className="nl-acts" data-npc-row="gear" style={{ margin: '0 0 6px', flexWrap: 'nowrap', alignItems: 'center' }}>
              <CreatorText value={g} onChange={(v) => upd({ gear: gear.map((x, j) => j === i ? v : x) })} placeholder="Gear" ariaLabel="Gear item" />
              <span className="nl-glyphs"><button type="button" className="nl-glyph" data-g="x" aria-label={'Remove gear'} onClick={() => upd({ gear: gear.filter((_, j) => j !== i) })}>×</button></span>
            </div>
          ))}
          <div className="nl-acts" style={{ margin: 0 }}>
            <button type="button" className="hp-quiet nl-add" data-testid="creator-add-ability" onClick={() => upd({ abilities: abilities.concat([{ name: '', description: '' }]) })}>＋ ability</button>
            <button type="button" className="hp-quiet nl-add" data-testid="creator-add-gear" onClick={() => upd({ gear: gear.concat(['']) })}>＋ gear</button>
          </div>
        </div>
      </CreatorShell>
    </div>
  );
}

// R-NPC-13 (durable contract, R-Y2-1): what ATTACH stores on the cast record — a canon weapon as its
// registry ID STRING (resolved at render), anything the registry does not hold as the object it is.
function armoryStoredWeapon(c) { return (c && c.canonId) ? c.canonId : (c && c.orig); }

/* 2b · THE ARMORY PICKER — its own surface. Flatten every carrier's weapons, dedup, search + filter. */
function NpcArmoryPickerView({ npcPool, draft, onAttach, onBack, refData, accent }) {
  const _armDesk = useNpcLayoutMode() === 'desktop';
  const [q, setQ] = React.useState('');
  const [skillFilter, setSkillFilter] = React.useState(null);   // ranged | melee | gunnery | null
  const [rangeFilter, setRangeFilter] = React.useState(null);   // short | medium | long | null
  const [selected, setSelected] = React.useState(null);         // catalog entry
  const [manual, setManual] = React.useState(false);
  const [mName, setMName] = React.useState(''); const [mDmg, setMDmg] = React.useState(''); const [mCrit, setMCrit] = React.useState(''); const [mRange, setMRange] = React.useState('medium');

  const [mSkill, setMSkill] = React.useState(null);              // B-869 · C13 (4): the hand entry's SKILL (paper)
  const catalog = React.useMemo(() => {
    // B-869 · C13, ruling npc-library-paper-concept AMENDMENT 1 (behaviour, BOTH faces):
    //  (1) a weapon carried as a registry id RESOLVES through the registry before it is keyed, so it
    //      merges with its named twin — one card, the registry's name and figures (1,064 → 981 cards,
    //      0 raw ids, 0 figure-less cards);
    //  (2) "Carried by N canon NPCs" counts CANON records only (a custom in the pool adds no carrier);
    //  (3) the chips therefore act on the resolved weapon (skill group and range are the registry's).
    // `canonId` is the card's registry id — the id ATTACH stores (R-NPC-13); null for a weapon the
    // registry does not hold, which is stored as the object.
    const canon = (refData && refData.canonWeapons) || {};
    const idByName = {};
    Object.keys(canon).forEach((k) => { const w = canon[k]; if (w && w.name) idByName[String(w.name).toLowerCase()] = k; });
    const byName = {};
    (npcPool || []).forEach((n) => {
      const custom = n._provenance === 'custom';
      (n.weapons || []).forEach((w0) => {
        if (!w0) return;
        const w = (typeof w0 === 'string' && canon[w0]) ? canon[w0] : w0;
        const name = (typeof w === 'string') ? w : (w.name || '');
        if (!name) return;
        const key = name.toLowerCase();
        if (!byName[key]) byName[key] = { name: name, orig: w0, norm: creatorNormWeapon(w), carriers: 0,
          canonId: (typeof w0 === 'string' && canon[w0]) ? w0 : (idByName[key] || null) };
        if (!custom) byName[key].carriers++;
      });
    });
    // R2 (ruling bench-reports-triage §3): merge the FULL canonical weapons registry — the SAME source
    // the store sells from — so every canon weapon is pickable, not just ones a canon NPC happens to
    // carry (Needle Gloves had no carrier → was invisible). Carried weapons keep their orig + carrier
    // count (float to the top); registry-only weapons list with carriers=0, sorted after, fully pickable.
    Object.keys(canon).forEach((k) => {
      const w = canon[k];
      if (!w || !w.name) return;
      const key = String(w.name).toLowerCase();
      if (!byName[key]) byName[key] = { name: w.name, orig: w, norm: creatorNormWeapon(w), carriers: 0, canonId: k };
    });
    return Object.keys(byName).map((k) => byName[k]).sort((a, b) => (b.carriers - a.carriers) || a.name.localeCompare(b.name));
  }, [npcPool, refData]);

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return catalog.filter((c) => {
      if (query && c.name.toLowerCase().indexOf(query) === -1) return false;
      if (skillFilter && creatorSkillGroup(c.norm.skill) !== skillFilter) return false;
      if (rangeFilter && String(c.norm.range || '').toLowerCase() !== rangeFilter) return false;
      return true;
    });
  }, [catalog, q, skillFilter, rangeFilter]);

  const toggle = (cur, val, set) => set(cur === val ? null : val);

  // C13 (3)/(4) — the vocabularies the paper controls draw, READ: the range chips are the weapon range
  // table's own labels (SWItems.RANGE_LABELS' wr* rows) less Close, a planetary band — the five personal
  // bands; the hand entry's skills are the skills vocab's `combat` group, in its order, the one the
  // registry's weapons use most pre-chosen.
  const rangeBands = React.useMemo(() => {
    const RL = (window.SWItems && window.SWItems.RANGE_LABELS) || {};
    return Object.keys(RL).filter((k) => /^wr/.test(k) && RL[k] !== 'Close').map((k) => RL[k]);
  }, []);
  const combatSkills = React.useMemo(() => ((refData && refData.skillsVocab) || []).filter((sk) => sk.group === 'combat'), [refData]);
  const defaultSkill = React.useMemo(() => {
    const use = {}; const canon = (refData && refData.canonWeapons) || {};
    Object.keys(canon).forEach((k) => { const sk = canon[k] && canon[k].skill; if (sk) use[sk] = (use[sk] || 0) + 1; });
    return combatSkills.reduce((best, sk) => (!best || (use[sk.id] || 0) > (use[best.id] || 0) ? sk : best), null);
  }, [refData, combatSkills]);

  // B-869 · C13 — the armory AS FIXED, on the board's parts: the search (its glyph the kit's own mark),
  // skill · range chips, the count, the cards (the sheet's candidate entry; a press SELECTS, ATTACH
  // commits), the hand entry with RANGE, SKILL and the pool it rolls for this draft. One column below the
  // layout hook's desktop arm (stated, not drawn).
  const hSkill = combatSkills.find((sk) => sk.id === mSkill) || defaultSkill;
  const chars = (draft && draft.characteristics) || {};
  const hRank = hSkill ? (((draft && draft.skills) || []).find((sk) => (sk.skill_ref || sk.id) === hSkill.id) || {}).rank || 0 : 0;
  const attachHand = () => {
    if (!mName.trim()) return;
    onAttach({ name: mName.trim(), damage: { value: Number(mDmg) || 0, base: 'flat' }, crit: mCrit ? Number(mCrit) : undefined,
      range: mRange, skill: hSkill ? hSkill.id : '', qualities: [] });
  };
  const pill = (label, on, onTap, extra) => (
    <button key={label} type="button" className="hp-quiet nl-pill" data-on={on ? '1' : '0'} aria-pressed={on ? 'true' : 'false'} onClick={onTap} {...(extra || {})}>{label}</button>
  );
  return (
    <div data-testid="creator-armory" data-npc-state="armory">
      <CreatorBackRow onBack={onBack} label="THE THREAT" accent={accent} />
      <div className="hp-maker">THE ARMORY</div>
      <div className="hp-plate" data-pad="snug" data-input="1">
        <label className="nl-search"><i aria-hidden="true">⌕</i>
          <input data-testid="creator-armory-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search weapons…" aria-label="Search weapons" />
        </label>
      </div>
      <div className="nl-pills" style={{ marginTop: '10px' }}>
        {[['RANGED', 'ranged'], ['MELEE', 'melee'], ['GUNNERY', 'gunnery']].map(([l, v]) => pill(l, skillFilter === v, () => toggle(skillFilter, v, setSkillFilter), { 'data-npc-chip': 'skill' }))}
        <span className="nl-tier" aria-hidden="true">·</span>
        {rangeBands.map((b) => pill(b.toUpperCase(), rangeFilter === b.toLowerCase(), () => toggle(rangeFilter, b.toLowerCase(), setRangeFilter), { 'data-npc-chip': 'range' }))}
      </div>
      <div className="hp-sechead" data-stack="1"><h2 data-npc-count={filtered.length}>{filtered.length} weapon{filtered.length === 1 ? '' : 's'} match{(skillFilter || rangeFilter) ? ' · filtered' : ''}</h2></div>
      <div style={_armDesk
        ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px', alignItems: 'start' }
        : { display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.slice(0, 120).map((c, i) => {
          const isSel = selected && selected.name.toLowerCase() === c.name.toLowerCase();
          return (
            <button key={c.name + i} type="button" className="hp-plate nl-pick" data-pad="snug" data-testid="creator-weapon-card"
              data-npc-weapon={c.canonId || ''} aria-pressed={isSel ? 'true' : 'false'} style={{ margin: 0 }} onClick={() => setSelected(c)}>
              <div className="sb-cand" data-focus={isSel ? '1' : '0'} style={{ width: '100%' }}>
                <div className="sb-e-h"><span className="sb-e-n">{c.name}</span><span className="sb-e-m">{isSel ? 'SELECTED ✓' : '＋'}</span></div>
                <div className="sb-e-l">
                  <div>{(c.norm.skillLabel || '—').toUpperCase()}</div>
                  <div>Damage <b>{c.norm.damage}</b></div>
                  <div>Critical <b>{c.norm.crit}</b></div>
                  <div>Range <b>{c.norm.range}</b></div>
                </div>
                {c.norm.qualities.length > 0 && (
                  <div className="nl-pillset" style={{ marginTop: '8px' }}>{c.norm.qualities.map((qn, qi) => <span key={qi} className="sb-qual">{qn}</span>)}</div>
                )}
                <div className="sb-mod-cite" data-npc-carriers={c.carriers}>Carried by {c.carriers} canon NPC{c.carriers === 1 ? '' : 's'}.</div>
              </div>
            </button>
          );
        })}
      </div>
      <button type="button" className="hp-quiet nl-wide" data-testid="creator-armory-manual" aria-expanded={manual ? 'true' : 'false'}
        onClick={() => setManual((m) => !m)}>✎ …or enter a weapon by hand</button>
      {manual && (
        <div className="hp-plate" data-pad="data" style={{ marginTop: '8px' }} data-npc-hand="1">
          <CreatorText value={mName} onChange={setMName} placeholder="Weapon name" ariaLabel="Manual weapon name" />
          <div className="nl-acts" style={{ flexWrap: 'nowrap' }}>
            <CreatorText value={mDmg} onChange={setMDmg} placeholder="Damage" ariaLabel="Manual weapon damage" />
            <CreatorText value={mCrit} onChange={setMCrit} placeholder="Crit" ariaLabel="Manual weapon crit" />
          </div>
          <div className="nl-field"><b>Range</b>
            <div className="nl-pills" role="group" aria-label="Range">{rangeBands.map((b) => pill(b.toUpperCase(), mRange === b.toLowerCase(), () => setMRange(b.toLowerCase()), { 'data-npc-hand-range': b.toLowerCase() }))}</div>
          </div>
          <div className="nl-field"><b>SKILL</b>
            <div className="nl-pills" role="group" aria-label="Skill">{combatSkills.map((sk) => pill(sk.label.toUpperCase(), hSkill && hSkill.id === sk.id, () => setMSkill(sk.id), { 'data-npc-hand-skill': sk.id }))}</div>
          </div>
          {hSkill && (
            <div className="nl-sbs" style={{ marginTop: '10px' }} data-npc-hand-pool={hSkill.id}>
              <div className="sb-sk" data-compact="1">
                <div className="sb-sk-n"><div className="sb-sk-name">{hSkill.label}</div><div className="sb-sk-char">{String(hSkill.characteristic || '').toUpperCase()}</div></div>
                <div />
                <NpcPaperPool charValue={chars[hSkill.characteristic] || 0} skillRank={hRank} />
              </div>
            </div>
          )}
          <button type="button" className="hp-quiet nl-wide" onClick={attachHand}>ADD THIS WEAPON</button>
        </div>
      )}
      <button type="button" className="hp-commit nl-wide" data-testid="creator-armory-confirm" disabled={!selected}
        onClick={() => selected && onAttach(armoryStoredWeapon(selected))}>{'ATTACH TO ' + (draft.name || 'CUSTOM NPC').toUpperCase()}</button>
    </div>
  );
}

/* 3 · THE TALK CARD — six fields, NO stat boxes. Writes card{}. */
function NpcTalkCardView({ draft, castKey, actions, resolveBySourceKey, onOpenProfile, onSave, onBack, accent, refData, factionProfiles }) {
  const card = (draft && draft.card) || {};
  const setField = (k, v) => actions.update(castKey, { card: Object.assign({}, card, { [k]: v }) });
  const attached = draft.attachedProfileKey ? resolveBySourceKey(draft.attachedProfileKey) : null;
  const FIELDS = [
    { k: 'personality', label: 'PERSONALITY' }, { k: 'wants', label: 'WANTS' }, { k: 'voice', label: 'VOICE' },
    { k: 'appearance', label: 'APPEARANCE' }, { k: 'secret', label: 'SECRET' }, { k: 'hooks', label: 'HOOKS' },
  ];
  // B-869 · C9 (390) · C10 (1440, beside the live preview) — the card: six plates, each a field.
  return (
    <div data-testid="creator-talk-card" data-npc-state="talk">
      <CreatorBackRow onBack={onBack} label="CHOOSE HOW TO START" accent={accent} />
      <CreatorSaveBar label="SAVE TO CUSTOM NPC" onSave={onSave} accent={accent} />
      <CreatorNameField value={draft && draft.name} onChange={(v) => actions.update(castKey, { name: v })} accent={accent} />
      <CreatorShell draft={draft} resolveBySourceKey={resolveBySourceKey} refData={refData}
        factionProfiles={factionProfiles} accent={accent} leadFace="person">
        <div className="hp-maker">{'THE PERSON \u00B7 ' + (draft.name || 'NEW PERSON').toUpperCase()}</div>
        <h2 className="nl-gname">The card</h2>
        {FIELDS.map((f) => (
          <div key={f.k} className="hp-plate" data-pad="data">
            <label className="nl-field"><b>{f.label}</b>
              <CreatorText value={card[f.k]} onChange={(v) => setField(f.k, v)} placeholder="…" ariaLabel={f.label} testid={'creator-card-' + f.k} area />
            </label>
          </div>
        ))}
        <button type="button" className="hp-quiet nl-wide" data-testid="creator-open-profile" onClick={onOpenProfile}>
          {'\u2687 ' + (attached ? 'Stat profile: ' + attached.name : 'Attach a stat profile')}</button>
      </CreatorShell>
    </div>
  );
}

/* 3b · THE STAT-PROFILE PICKER — attach a FIGHT block to a talker (id-ref, not a copy). */
function NpcProfilePickerView({ npcPool, draft, castKey, actions, onDone, onBack, accent, taxonomy }) {
  const [q, setQ] = React.useState('');
  // B-869 · C14 (1) — R-NPC-5c's contract on the second list (BOTH faces): ALL matches sorted by name, THEN
  // the cap of 40 (it was pool order, the first 40 of ~1,434 all minions); `matched` is the whole count.
  const matchedAll = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    const selfKey = castKey;
    return (npcPool || [])
      .filter((n) => (n._source_key || n.key) !== selfKey)
      // a fight block = has characteristics (canon NPCs always do; talk-only customs don't)
      .filter((n) => n.characteristics && Object.keys(n.characteristics).length > 0)
      .filter((n) => !query || (n.name || '').toLowerCase().indexOf(query) !== -1)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [npcPool, q, castKey]);
  const results = matchedAll.slice(0, 40);
  const attach = (n) => { actions.update(castKey, { attachedProfileKey: n._source_key || n.key }); onDone(); };
  // C14 — one column at every width: the search, `N MATCHES`, the rows (name; tier · the affiliation's
  // VOCAB label, C14 (3)), the attached one selected; (2) REMOVE STAT PROFILE — the one new string —
  // writes the key empty through the same update and returns to the card.
  const attachedKey = draft && draft.attachedProfileKey;
  const n = matchedAll.length;
  return (
    <div data-testid="creator-profile-picker" data-npc-state="profile">
      <CreatorBackRow onBack={onBack} label="THE CARD" accent={accent} />
      <div className="hp-maker">ATTACH A STAT PROFILE</div>
      <div className="hp-plate" data-pad="snug" data-input="1">
        <label className="nl-search"><i aria-hidden="true">⌕</i>
          <input data-testid="creator-profile-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fight blocks…" aria-label="Search stat profiles" />
        </label>
      </div>
      {results.length ? (
        <React.Fragment>
          <div className="hp-sechead" data-stack="1"><h2 data-npc-count={n}>{n + ' MATCH' + (n === 1 ? '' : 'ES')}</h2></div>
          <div className="hp-plate" data-pad="data">
            <div className="hp-index hp-bands">
              {results.map((r) => {
                const k = r._source_key || r.key;
                return (
                  <button key={k} type="button" className="hp-row" data-selected={attachedKey === k ? '1' : '0'} data-npc-profile={k} onClick={() => attach(r)}>
                    <span className="hp-row-body"><span className="hp-row-desig">{r.name}</span>
                      <span className="nl-tier">{(r.tier || '').toUpperCase()}{r.affiliation ? ' · ' + String(resolveAffiliationLabel(taxonomy, r.affiliation)).toUpperCase() : ''}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        </React.Fragment>
      ) : (
        <div className="hp-plate" data-pad="read"><p className="hp-none" style={{ margin: 0 }}>No matching fight blocks.</p></div>
      )}
      {attachedKey ? (
        <button type="button" className="hp-quiet nl-wide" data-npc-profile-remove="1"
          onClick={() => { actions.update(castKey, { attachedProfileKey: null }); onDone(); }}>REMOVE STAT PROFILE</button>
      ) : null}
    </div>
  );
}

// The finished two-faced custom page (Lap C2): THE PERSON (card) + THE THREAT (stat block), each a
// collapsed-past-the-first disclosure with a scene-flip. Leads with the face the NPC actually has. The
// FIGHT face resolves from `attachedProfileKey` (an id-ref) when the custom has no own stat block —
// resolved live at render, NEVER copied. Card face is a glanceable summary (walls rule); the full six
// fields live in the editor.
// `preview` renders the SAME page read-only — the creator's live preview is this component minus its
// transaction affordances (edit/add buttons), the same omission the ABILITIES reading pane makes of the
// teaching entry. One card implementation, two contexts (ruling npc-creator-revision-concept §3: grep
// must find no second card). `leadFace` opens on the face the caller is editing.
function NpcCustomFinishedPage({ npc, resolveBySourceKey, refData, factionProfiles, accent, onEditFight, onEditTalk, preview, leadFace }) {
  const CARD_FIELDS = [['personality', 'Personality'], ['wants', 'Wants'], ['voice', 'Voice'], ['appearance', 'Appearance'], ['secret', 'Secret'], ['hooks', 'Hooks']];
  const card = (npc.card && typeof npc.card === 'object') ? npc.card : null;
  const hasCard = !!card && CARD_FIELDS.some(([k]) => ((card[k] || '') + '').trim());
  const hasOwnStats = !!(npc.characteristics && Object.keys(npc.characteristics).length > 0);
  const attached = npc.attachedProfileKey ? resolveBySourceKey(npc.attachedProfileKey) : null;
  const fightBlock = hasOwnStats ? npc : (attached || null);   // own stats, else the attached profile (never copied)
  const [openFace, setOpenFace] = React.useState(leadFace || (hasCard ? 'person' : 'threat'));   // lead with what the NPC HAS
  // B-869 · C12 (and the cast panel's reading, C3; the creator's LIVE PREVIEW, C8/C10) — the SAME page:
  // CUSTOM · TIER, the name, then the faces the record HAS as the board's disclosures (`nl-face`), THE
  // THREAT holding the ONE stat block stacked in the `custom` context (LORE only with a description, no
  // disposition — the generator's `has_lore`), and a dashed door to the face it lacks. The board draws a
  // fight-only record; THE PERSON's disclosure is the same part (reported at the gate as undrawn), and
  // one face opens at a time, as today. The dark face's "Scene face" tablist is not drawn.
  const face = (id, label, body) => (
    <React.Fragment>
      <button type="button" className="nl-face" aria-expanded={openFace === id ? 'true' : 'false'} data-npc-face={id}
        onClick={() => setOpenFace(id)}><span>{label}</span><span aria-hidden="true">{openFace === id ? '\u25BE' : '\u25B8'}</span></button>
      {openFace === id ? body : null}
    </React.Fragment>
  );
  return (
    <div data-testid="creator-finished-page" data-npc-state={preview ? 'custom-preview' : 'custom-page'}>
      {/* B-899 fix 3 (C17): a record that mints no tier reads CUSTOM — never a dangling "·" */}
      <div className="hp-maker">{'CUSTOM' + (npc.tier ? ' \u00B7 ' + String(npc.tier).toUpperCase() : '')}</div>
      <h1 className="hp-desig nl-d2">{npc.name}</h1>
      <div className="hp-desig-rule" />
      {hasCard && face('person', '\u25C6 THE PERSON', (
        <div className="hp-plate" data-pad="read" data-npc-card="1">
          {CARD_FIELDS.map(([k, label]) => ((card[k] || '') + '').trim() ? (
            <div key={k}>
              <div className="nl-tier">{label.toUpperCase()}</div>
              <p className="nl-note" style={{ margin: '2px 0 8px' }}>{((card[k] || '') + '').slice(0, 240)}</p>
            </div>
          ) : null)}
          {attached && <div className="nl-tier" data-npc-attached="1">{'\u2687 fights as ' + attached.name}</div>}
          {!preview && <button type="button" className="hp-quiet nl-wide" onClick={onEditTalk}>EDIT THE PERSON</button>}
        </div>
      ))}
      {fightBlock ? face('threat', '\u25B2 THE THREAT', (
        <React.Fragment>
          <NpcPaperStatBlock rend={fightBlock} tier={fightBlock.tier} refData={refData} factionProfiles={factionProfiles}
            name={fightBlock.name} arrange="stack" ctx="custom" />
          {hasOwnStats && !preview && <button type="button" className="hp-quiet nl-wide" onClick={onEditFight}>EDIT THE THREAT</button>}
        </React.Fragment>
      )) : (preview
        ? null
        : <button type="button" className="hp-quiet nl-wide nl-dashed" onClick={onEditFight}>＋ Add the FIGHT face</button>)}
      {!hasCard && !preview && <button type="button" className="hp-quiet nl-wide nl-dashed" onClick={onEditTalk}>＋ Add the TALK face</button>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   THE CUSTOM NPC TAB — option C (ruling custom-npc-tab-space-triage Addendum 1 §B; Jason's mockup pick)

   The tab used to render `NpcLibraryListView` — BROWSE's arrangement, built for a library of
   hundreds. Measured: tier grouping caps every grid row at the group's size, so a 3/3/3 cast left
   40% of each row empty at 1440 and 57% at 1920 — the grid could not fill at ANY cast size with
   unevenly-split tiers. Filter chips narrowed nine items; a shelf label distinguished one shelf
   from nothing; the cards were two-line stubs on the surface about the NPCs the GM MADE.

   Now, by band (§B1):
     >=1367   RAIL | PANEL — the roster left, the selected custom's detail right. The width does
              work instead of being filled. Selection is IN-PANEL state: no view hop, no URL change
              (§B4 — the bench-reference precedent).
     <1367    fork A as the sub-wide arrangement: ONE auto-fill grid, de-chromed (no tier grouping,
              no chips, no shelf label — all library-scale devices), tap → the existing detail hop.
     mobile   the same de-chromed single column.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

// Which faces a custom has. Mirrors NpcCustomFinishedPage's own test exactly — ONE rule, two
// readers (the page decides what to render; the rail decides what glyph to show).
const CAST_CARD_FIELDS = ['personality', 'wants', 'voice', 'appearance', 'secret', 'hooks'];
function castFaces(npc, resolveBySourceKey) {
  const card = (npc && npc.card && typeof npc.card === 'object') ? npc.card : null;
  const hasTalk = !!card && CAST_CARD_FIELDS.some(k => ((card[k] || '') + '').trim());
  const hasOwnStats = !!(npc && npc.characteristics && Object.keys(npc.characteristics).length > 0);
  const attached = (npc && npc.attachedProfileKey && resolveBySourceKey) ? resolveBySourceKey(npc.attachedProfileKey) : null;
  return { hasTalk: hasTalk, hasFight: hasOwnStats || !!attached };
}

const CAST_TIER_COLOR = { minion: '#4EAAFF', rival: '#C6A0FF', nemesis: '#FF8A3D' };
function castTierColor(npc) { return CAST_TIER_COLOR[(npc && npc.tier || 'rival').toLowerCase()] || '#C6A0FF'; }

/* The rail/grid entry. GRAIN IS RECOGNITION, NOT STATS (§B5): monogram · name · tier · face glyph.
   Fork B's fuller grain stays off deliberately — the panel carries the numbers, and a rail that
   repeats them is a second stat block competing with the first. */
function CastRosterItem({ npc, selected, onSelect, resolveBySourceKey, accent }) {
  const faces = castFaces(npc, resolveBySourceKey);
  const tc = castTierColor(npc);
  // B-869 · C1–C3 — the board's cast entry: monogram · name · tier · the face glyphs (◆ talks, ▲ fights).
  return (
    <button type="button" className="nl-ci" data-testid="cast-roster-item" data-selected={selected ? '1' : '0'}
      data-on={selected ? '1' : '0'} onClick={() => onSelect(npc)}>
      <NpcPaperMono name={npc.name || '?'} />
      <span className="nl-cn"><b>{npc.name || '(Unnamed)'}</b><span className="nl-tier">{(npc.tier || 'rival').toUpperCase()}</span></span>
      <em aria-hidden="true">{faces.hasTalk ? '\u25C6' : ''}{faces.hasFight ? '\u25B2' : ''}</em>
    </button>
  );
}

/* ＋ CREATE as a TILE, not a full-width banner (§3 survivor — the roster's dashed-tile idiom).
   `variant`: 'rail' (the rail's first item) · 'grid' (the sub-wide grid's first cell) · 'hero'
   (the empty state's centered door). The affordance lives WHERE the results live. */
function CastCreateTile({ onClick, variant, gold }) {
  return (
    <button type="button" className="nl-create" data-v={variant} data-testid="creator-create-npc" onClick={onClick}>
      <span aria-hidden="true">＋</span><span>CREATE NPC</span>
    </button>
  );
}

/* THE OWNER ACTION ROW (§B3 — the genuine new law, drawn narrow).
   Reading surfaces stay inert for CANON; an OWNED record carries its owner's actions. That is the
   whole distinction: the creator's preview stays inert (an unsaved draft), canon detail cards stay
   reading (not yours), and a custom — the one NPC the GM owns — gets EDIT · ADD TO ENCOUNTER ·
   DELETE. Mechanics voice: plain verbs, no metaphor. */
function CastOwnerActions({ npc, encounters, onEdit, onAddToEncounter, onDelete, deleteArmed, setDeleteArmed, accent, gold }) {
  const [picking, setPicking] = useState(false);
  // B-869 · C3 — EDIT · ADD TO ENCOUNTER · DELETE as the board's quiet row. The encounter list ADD opens is
  // drawn by no frame: its rows are the same quiet controls on a snug plate (reported at the gate).
  return (
    <div data-testid="cast-owner-actions">
      <div className="nl-acts" style={{ margin: 0 }}>
        <button type="button" className="hp-quiet" data-testid="cast-action-edit" onClick={onEdit}>EDIT</button>
        <button type="button" className="hp-quiet" data-testid="cast-action-add" aria-expanded={picking ? 'true' : 'false'}
          onClick={() => setPicking(p => !p)}>ADD TO ENCOUNTER</button>
        <button type="button" className="hp-quiet" data-testid="cast-action-delete" data-armed={deleteArmed ? '1' : '0'}
          onClick={() => { if (deleteArmed) onDelete(); else setDeleteArmed(true); }}>{deleteArmed ? 'TAP AGAIN TO DELETE' : 'DELETE'}</button>
      </div>
      {picking && (
        <div className="hp-plate" data-pad="snug" data-testid="cast-add-picker" style={{ marginTop: '8px' }}>
          <div className="nl-acts" style={{ margin: 0 }}>
            {encounters.map(g => (
              <button key={g.id} type="button" className="hp-quiet" onClick={() => { onAddToEncounter(g.id); setPicking(false); }}>
                {g.name}{' \u00B7 ' + (g.members || []).length + ' NPC' + ((g.members || []).length === 1 ? '' : 's')}
              </button>
            ))}
            <button type="button" className="hp-quiet nl-dashed" data-testid="cast-add-new-encounter"
              onClick={() => { onAddToEncounter(null); setPicking(false); }}>＋ NEW ENCOUNTER</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* THE EMPTY STATE AS A DESIGNED MOMENT (§B2 — fork D lands in C's panel).
   Day one is the tab's worst measurement (72% void at 1440) and the first thing a new GM sees. The
   two real doors get equal weight as CHOICES; the width teaches them instead of being abandoned.
   No new capability — the same create, the same clone, arranged. */
function CastEmptyState({ onCreate, onBrowse, accent, gold, wide }) {
  // B-869 · C4 (390, one column) · C5 (the desk, two routes side by side and the four ghosts).
  const route = (glyph, head, control, testid, onTap) => (
    <div className="hp-plate" data-pad="read">
      <span className="nl-rg" aria-hidden="true">{glyph}</span>
      <h3 className="nl-rh">{head}</h3>
      <button type="button" className="hp-quiet nl-wide" data-testid={testid} onClick={onTap}>{control}</button>
    </div>
  );
  return (
    <div data-testid="cast-empty-state" data-npc-state="cast-empty">
      <div className="nl-cehead">
        <h2 className="nl-gname">Nothing here yet — and there are two ways to change that.</h2>
      </div>
      <div className="nl-routes" data-col={wide ? '0' : '1'}>
        {route('✎', 'BUILD ONE FROM SCRATCH', '＋ CREATE NPC', 'creator-create-npc', onCreate)}
        {route('⧉', 'CLONE A CANON NPC', 'BROWSE THE LIBRARY →', 'cast-empty-browse', onBrowse)}
      </div>
      {wide && <div className="nl-ghosts" aria-hidden="true" data-testid="cast-empty-ghosts"><i /><i /><i /><i /></div>}
    </div>
  );
}

  // ── Step 1: headless library core ───────────────────────────────────────
  // NPC exemplar Step 1 — the HEADLESS CORE. Orchestrator (view state machine + handlers + refData)
  // moved here from gm/app.jsx. Chrome is INJECTED by the host via the `chrome` prop
  // ({ Header, Nav, Rail }); the module owns the behavior, the host owns the look (D-S1a). The
  // `actions` render-slot + `capabilities` carry host encounter-context affordances (D-S1b) — empty
  // in the GM host today (browse-only). `accent` defaults to NPC_ACCENT (gm host passes the same).
  function NpcLibrary({ onBack, wipeType, accent, actions, capabilities, location, onLocation }) {
    // B-871 — ONE FACE. The paper face was B-862's switch-selected sibling of the dark one; the flip's deletion
    // ledger retired the dark face and the switch with it (ruling `npc-flip-ledger-switch` R-NFLS-1).
    accent = accent || NPC_ACCENT;
    capabilities = capabilities || {};
    const ctrl = useNpcGeneratorController();
    const _npcDesk = useNpcLayoutMode() === 'desktop';  // F-46 D2: cap the body to a reading column
    const _npcWide = useMinWidth(1367);                 // AS-2 WIDE band — the three-panel detail (§Q1/Q2)
    const _encDesk = useMinWidth(1024);                 // ENCOUNTERS E3 lap B: the Destiny strip's seat (head ≥ 1024, a row below)
  
    // ── Reference databases from oggdude_merged.json ──────────────────────
    // Loaded once on mount for weapon lookups, talent descriptions, skill grids.
    const [refData, setRefData] = useState(null);
    // ruling release-r6-companions-lifts Q1 (a): one shared loader (lib/library/npc/refData.js), memoized for both hosts.
    useEffect(() => {
      window.SWRPGNpcRefData.load()
        .then(setRefData)
        .catch(err => console.warn('[NpcScreen] Failed to load reference data:', err));
    }, []);
  
    const dur = WIPE_DURATIONS[wipeType] ?? 1.3;
    // swipe gesture is wired to handleScreenBack (defined below via ref) so
    // swiping right returns one step in the library flow instead of exiting
    // the whole screen. Uses a ref indirection because handleScreenBack
    // closes over state that changes on every render.
    const backRef = useRef(null);
    const swipe = useSwipeBack(useCallback(() => {
      if (backRef.current) backRef.current();
      else onBack();
    }, [onBack]));
  
    // Inner view state — every value is a drawn view (NPC_DRAWN_ZONES): the register
    //   library-landing -> library-drilldown -> npc-list (tier-filtered) -> reference, 'history' (RECENT),
    // the bench 'groups', and the custom NPC views (cast · c-fork · c-fight · c-talk · c-armory · c-profile).
    const [view, setView] = useState('library-landing');
    // IA lap: the creator EDITOR sub-views (fork + editors + pickers) own the full screen with their own
    // BACK + SAVE/CONFIRM bars, so the app chrome hides (immersive) — otherwise the resident bottom SAVE
    // bar collides with the app BottomNav, and its idle listeners steal the editor's clicks. Browse /
    // faction / reference / bench stay bars-resident + auto-hide (the host no longer marks the NPC screen
    // immersive; the library owns it per inner view).
    var isCreatorView = { 'c-fork': 1, 'c-fight': 1, 'c-talk': 1, 'c-armory': 1, 'c-profile': 1 }[view] === 1;
    useEffect(function () {
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('holo-immersive', isCreatorView);
      return function () { document.body.classList.remove('holo-immersive'); };
    }, [isCreatorView]);
    // Bars-resident auto-hide (IA lap R-IA1): the resident suite + bottom bars fade on idle, returning on
    // any interaction. The shared hook is now REF-DRIVEN (no React state on the idle path → no re-render →
    // no save/fork race), so it's safe to run here. `active` is off on the creator editor views (they're
    // immersive anyway, and a working GM should never watch the chrome fade mid-edit).
    useAutoHideChrome({ active: !isCreatorView });
    // C2 creator: the custom being authored (created on fork-pick; read via resolveBySourceKey).
    const [castDraftKey, setCastDraftKey] = useState(null);

    // A2 (gold-standard Lap A): land at the TOP of every screen — reset the scroll
    // container on each view change (screens that opened mid-page now open at top).
    const scrollRef = useRef(null);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; setCastDeleteArmed(false); }, [view]);

    // Tier filter pills active on the NPC list screen. All tiers on by default.
    const [tierFilters, setTierFilters] = useState({ minion: true, rival: true, nemesis: true });
  
    // Derived tier — used by sections that still need a single tier value
    // (encounter generator, reference view, history open). If exactly one tier
    // filter is active use that; otherwise default to 'rival'.
    const activeTiers = Object.keys(tierFilters).filter(t => tierFilters[t]);
    const tier = activeTiers.length === 1 ? activeTiers[0] : 'rival';
  
    // Drill-down state
    const [selectedDrawerId, setSelectedDrawerId] = useState(null);     // top-level drawer currently expanded in two-column drill-down
    const [selectedAffiliationId, setSelectedAffiliationId] = useState(null);
    const [selectedAffiliationLabel, setSelectedAffiliationLabel] = useState('');
  
    // For the Faction Dossier entrypoint (FACTION tier) we still need a faction id.
  
    // Currently-selected library NPC (the instance shown in the reference view).
    const [selectedLibraryNpc, setSelectedLibraryNpc] = useState(null);
  
    // Overlay rail state for each level. Hidden by default at every level.
    // First swipe reveals the rail as an overlay; second swipe navigates back.
    const [drilldownRailOpen, setDrilldownRailOpen] = useState(false);
    const [npcListRailOpen, setNpcListRailOpen] = useState(false);
    const [refRailOpen, setRefRailOpen] = useState(false);
    // Inc 2 — ≥1367 promotes the swipe-in overlay rail to a persistent left column.
    // Same items/onSelect; below it the chip strip (NpcPaperChips), at it a flex row
    // (NpcPaperDeskRail left · content right).
    const wideRail = useMinWidth(1367);
    // B-864 · D-NPC2 — THE RAILS ON PAPER. A drawn view's rail is the paper one; an island keeps the dark
    // wrapper it stands in. Below 1367 it is the chip strip (both hosts, D3b), which the shell draws UNDER
    // THE TABS (frames A3 · A5 · D1) — so it is handed out of the body here, not rendered inside it.
    // A custom's reference page (C12) is drawn since B-869, rail and all.
    let paperChipRail = null;
    const railWrap = (railProps, content) => wideRail ? (
      <div className="nl-desk"><NpcPaperDeskRail {...railProps} /><div className="nl-main">{content}</div></div>
    ) : ((paperChipRail = railProps), content);
    const [castDeleteArmed, setCastDeleteArmed] = useState(false);   // two-tap delete confirm (UXQP-23 idiom), Lap C1
  
    // Track how we arrived at the lore view so back can retrace.
  
    // Library data comes from the controller now; no local fetches.
    const libraryReady = Boolean(
      ctrl.taxonomy
      && ctrl.libraryByTier
      && (ctrl.libraryByTier.minion.length + ctrl.libraryByTier.rival.length + ctrl.libraryByTier.nemesis.length) > 0
    );
    const dataReady = libraryReady;

    // ── NPC bench (GM-only via capabilities.canManageGroups) ──
    // Persisted groups of NPCs whose wound/strain state remembers across nav + reload.
    // applyBench takes a transform (prev -> next) so rapid tracker taps never read a stale closure.
    // B-1732 moved this onto the one cure (lib/shared/heldStore.js): the act reads the store, a landing or another tab's write redraws. It keeps what
    // R-SECB-6 and B-1650 (ADDENDUM 391) put here: every op runs outside React's updater, so two quick taps read each other and a craft op mints once.
    const heldBench = window.SWRPGHeldStore.use({ key: BenchStore ? BenchStore.KEY : 'swrpg_npc_bench',
      load: () => (BenchStore ? BenchStore.load() : { version: 1, groups: [] }), persist: (next) => { if (BenchStore) BenchStore.persist(next); } });
    const bench = heldBench.state;
    const applyBench = heldBench.apply;
    // D14 (ruling `encounters-e6-walk` §3): a player's LEAVE TABLE takes its PC card out of the bench in the table session,
    // a same-tab write no `storage` event reports. Every act here already reads the store first; this redraws on the news
    // (read() hands back the held state, and React keeps the draw, while the stored string has not moved).
    useEffect(() => { const T = window.SWRPGTableSession; return T ? T.subscribe(() => heldBench.adopt(heldBench.read())) : undefined; }, []);
    // ── HOLOTABLE: the GM's table session (R-HT-2 — the door lives with the bench) ──
    // Unconditional, for the reason recorded at the module-level capture. Dark until the flag
    // flips: `startTable` refuses while it is off, and every composition renders null anyway.
    // The GM is the `npc` side — an inference from the ruled shape, not a field (rights.js
    // records why the next reader will look for a `role` and not find one).
    const room = RoomSession.useRoomSession({ side: 'npc', name: 'GM' });

    const benchActions = useMemo(() => ({
      create: (name) => applyBench(prev => BenchStore.createGroup(prev, name).state),
      del: (id) => applyBench(prev => BenchStore.deleteGroup(prev, id)),
      addMember: (gid, key) => applyBench(prev => BenchStore.addMember(prev, gid, key)),
      removeMember: (gid, key) => applyBench(prev => BenchStore.removeMember(prev, gid, key)),
      rename: (id, name) => applyBench(prev => BenchStore.renameGroup(prev, id, name)),   // B-761 — the op had 0 call sites
      reset: (gid) => applyBench(prev => BenchStore.resetGroup(prev, gid)),
      setMember: (gid, key, patch) => applyBench(prev => BenchStore.setMember(prev, gid, key, patch)),
      setPool: (gid, sourceKey, value) => applyBench(prev => BenchStore.setPoolWounds(prev, gid, sourceKey, value)),
      setNotes: (gid, notes) => applyBench(prev => BenchStore.setGroupNotes(prev, gid, notes)),
      setArrangement: (gid, orderedIds) => applyBench(prev => BenchStore.setArrangement(prev, gid, orderedIds)),   // T1 reorder
      // F-54 (v6): the craft in this encounter, and who is aboard. Thin pass-throughs — every
      // invariant (one craft per member, one pilot per craft, never invent a craft) lives in the
      // store, so a second caller cannot reach an illegal state by not knowing the rules.
      addVehicle: (gid, key) => applyBench(prev => BenchStore.addVehicle(prev, gid, key)),
      // R-SECB-1: a craft's hull or strain mark. markCraft persists its own first-mark write (and undoes the mint when that
      // write is refused), so the act only carries the answer into the ref and React; a refusal changes nothing.
      markCraft: (gid, vid, mark, vehicleRow) => {
        const cur = heldBench.read();
        const r = BenchStore.markCraft(cur, gid, vid, mark, new Date().toISOString().slice(0, 10), vehicleRow);
        if (!r.refused && r.state !== cur) heldBench.adopt(r.state);
        return r;
      },
      removeVehicle: (gid, vid) => applyBench(prev => BenchStore.removeVehicle(prev, gid, vid)),
      setMemberVehicle: (gid, mid, vid, pilot) => applyBench(prev => BenchStore.setMemberVehicle(prev, gid, mid, vid, pilot)),
      addVehicleAndAssign: (gid, mid, key) => applyBench(prev => {
        var s1 = BenchStore.addVehicle(prev, gid, key);
        var g = (s1.groups || []).filter(function(x) { return x.id === gid; })[0];
        if (!g || !g.vehicles || !g.vehicles.length) return s1;
        var newVid = g.vehicles[g.vehicles.length - 1].id;
        return BenchStore.setMemberVehicle(s1, gid, mid, newVid, false);
      }),
    }), [applyBench]);

    // ── Custom NPCs (GM-only via capabilities.canManageCast) — the GM's custom NPCs (Lap C1). ──
    // A custom IS its own record (full stat block, not an id-ref), so it joins the library pool as a
    // first-class citizen with a unique _source_key and every seam — list / drill / reference / search /
    // bench — works for free. Persistence + shape mirror the bench (CastStore, same contract discipline).
    // B-1732: read at the act, a landing redraws (lib/shared/heldStore.js).
    const heldCast = window.SWRPGHeldStore.use({ key: CastStore ? CastStore.KEY : 'swrpg_npc_cast',
      load: () => (CastStore ? CastStore.load() : { version: 1, npcs: [] }), persist: (next) => { if (CastStore) CastStore.persist(next); } });
    const cast = heldCast.state;
    const applyCast = heldCast.apply;
    // C2 "start from archetype": per-tier median skeletons derived from the registry (guard-pinned).
    const [castArchetypes, setCastArchetypes] = useState(null);
    useEffect(() => {
      if (!capabilities.canManageCast) return;
      fetch('public/data/canonical/npc-archetypes.json').then(r => r.json())
        .then(j => setCastArchetypes(j && j.archetypes)).catch(() => {});
    }, [capabilities.canManageCast]);
    const castActions = useMemo(() => ({
      clone: (record, name) => { var key; applyCast(prev => { const r = CastStore.cloneFromRecord(prev, record, name); key = r.key; return r.state; }); return key; },
      // C2: CREATE from a seed (blank record, or an archetype skeleton) — same store path as clone, just a
      // synthetic seed rather than a canon record. Returns the new custom key.
      create: (seed, name) => { var key; applyCast(prev => { const r = CastStore.cloneFromRecord(prev, seed || {}, name); key = r.key; return r.state; }); return key; },
      // C2: edit a custom — the FIGHT editor / TALK card patch whole fields (characteristics, skills,
      // talents, weapons, gear, abilities, card, attachedProfileKey). Identity is immutable in the store.
      update: (key, patch) => applyCast(prev => CastStore.updateNpc(prev, key, patch)),
      del: (key) => applyCast(prev => CastStore.deleteNpc(prev, key)),
    }), [applyCast]);

    // Customs merge into the canonical pool, bucketed by their tier (default rival). GM-host only —
    // the player host (canManageCast falsy) never sees a custom even if localStorage somehow held one.
    // Everything downstream (landing / drill / list / shelf / search / bench resolution) reads THIS.
    const mergedLibraryByTier = useMemo(() => {
      const base = ctrl.libraryByTier || { minion: [], rival: [], nemesis: [] };
      if (!capabilities.canManageCast || !cast.npcs.length) return base;
      const out = { minion: (base.minion || []).slice(), rival: (base.rival || []).slice(), nemesis: (base.nemesis || []).slice() };
      cast.npcs.forEach(n => { const t = (n.tier === 'minion' || n.tier === 'nemesis') ? n.tier : 'rival'; out[t].push(n); });
      return out;
    }, [ctrl.libraryByTier, cast, capabilities.canManageCast]);

    // ── RECENT (ruling custom-npc-tab-space-triage Addendum 1 §C) ──
    // The old HISTORY tab held a React-state list written by a phone-only SAVE control — so at
    // desktop it could never be filled, and it emptied on reload everywhere. Repurposed: VIEWING an
    // NPC detail is the write, so the tab fills itself on every band with no new affordance.
    // Device-local convenience data (CastStore.RECENT_KEY), not a save-shape — see the store.
    const [recent, setRecent] = useState(() => (CastStore ? CastStore.loadRecent() : []));
    const touchRecent = useCallback((key) => {
      if (!key || !CastStore) return;
      setRecent(prev => { const next = CastStore.touchRecent(prev, key); CastStore.persistRecent(next); return next; });
    }, []);
    // (recentNpcs resolves below — it needs resolveBySourceKey, which is declared after the pool.)

    // E3: the customs roster is a first-class TAB (CUSTOM NPC), not an injected landing shelf — the
    // taxonomy is the canon taxonomy again, and BROWSE is canon-only. Sorted by name for the tab grid.
    const castNpcs = useMemo(
      () => (capabilities.canManageCast ? cast.npcs.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []),
      [cast, capabilities.canManageCast]
    );

    // Resolve a persisted member id-ref back to its live library entry (null = dropped → graceful
    // placeholder). The bench persists ONLY the id-ref; the stat block resolves here at render — and a
    // custom resolves the same way (it's in mergedLibraryByTier), so a deleted custom degrades exactly
    // like a renamed canon key: graceful placeholder, never throw.
    const npcByKey = useMemo(() => {
      const map = {};
      ['minion', 'rival', 'nemesis'].forEach(t => {
        (mergedLibraryByTier[t] || []).forEach(n => { const k = n._source_key || n.key; if (k) map[k] = n; });
      });
      return map;
    }, [mergedLibraryByTier]);
    const resolveBySourceKey = useCallback((k) => npcByKey[k] || null, [npcByKey]);
    const npcPool = useMemo(() => Object.keys(npcByKey).map(k => npcByKey[k]), [npcByKey]);

    // RECENT, resolved for render (declared here, not with the other cast state, because it needs
    // resolveBySourceKey above). An entry whose key no longer resolves — a deleted custom, a retired
    // canon key — DROPS rather than rendering a ghost row: the tolerant-reader half of the contract.
    const recentNpcs = useMemo(
      () => recent.map(e => resolveBySourceKey(e.key)).filter(Boolean),
      [recent, resolveBySourceKey]
    );

    // ══ B-863 · R-NPC-3 — THE DISPOSITION, ONE WORD PER NPC (the store owns the key) ═══════════════
    // One reader, one writer: the store. Read for the SHOWN NPC by the key `npcByKey` uses
    // (`keyOf` = `_source_key || key`, never the lowercase id), written on a pill press on EITHER face,
    // on EITHER host. A version-ahead file loads read-only (`stale`) and the pills recede.
    const [dispState, setDispState] = useState(() => (DispositionStore ? DispositionStore.load() : { version: 1, byKey: {} }));
    const dispKey = (DispositionStore && selectedLibraryNpc) ? DispositionStore.keyOf(selectedLibraryNpc) : null;
    const dispWord = DispositionStore ? DispositionStore.read(dispState, dispKey) : 'neutral';
    const setDisposition = useCallback((key, value) => {
      if (!DispositionStore || !key) return;
      setDispState(prev => {
        const next = DispositionStore.set(prev, key, value);
        if (next !== prev) DispositionStore.persist(next);
        return next;
      });
    }, []);
    const dispCtxValue = useMemo(() => ({ stale: !!(dispState && dispState.stale) }), [dispState]);

    // ══ B-863 · R-NPC-4 — THE POSITION IN THE ADDRESS BAR ═══════════════════════════════════════
    // The open encounter joins the kernel's state (it is part of the position); it closes when the view
    // leaves ENCOUNTERS, exactly as the view's own local state did on unmount.
    const [benchOpenGroupId, setBenchOpenGroupId] = useState(null);
    const encScreen = capabilities.encounters === 'screen';   // ENCOUNTERS E3 lap B: the manager's own screen
    // the table store (`swrpg_room_state`: the order and the session's Destiny), held as the bench is (one cure, B-1732);
    // read only on the manager's screen, written only through encounterLife's ops (R-V7S-1)
    const RS = window.SWRPGRoomState;
    const heldTable = window.SWRPGHeldStore.use({ key: RS ? RS.KEY : 'swrpg_room_state',
      load: () => (RS && encScreen ? RS.read() : null), persist: (next) => { if (RS && encScreen && next) RS.write(next); } });
    // the manager's writes: the bench through its held store, the table through its; a two-store op (start, end, delete)
    // reads both at the act and writes each one it changed (encounterLife returns { bench, room, refused })
    const encManager = encScreen ? {
      table: heldTable.state, applyTable: heldTable.apply, readTable: heldTable.read, applyBench: applyBench,
      applyBoth: (fn) => {
        const b = heldBench.read(), r = heldTable.read(), out = fn(b, r) || {};
        if (out.refused) return out;
        if (out.bench && out.bench !== b) heldBench.apply(() => out.bench);
        if (out.room && out.room !== r) heldTable.apply(() => out.room);
        return out;
      },
      core: capabilities.encounterCore,
    } : null;
    useEffect(() => { if (view !== 'groups' && benchOpenGroupId) setBenchOpenGroupId(null); }, [view]);

    // THE POSITION — a projection of the view machine, never stored. `npcRoute.js` owns the grammar.
    const position = NpcRoute ? NpcRoute.positionOf({
      view: view,
      drawerId: selectedDrawerId,
      affiliationId: selectedAffiliationId,
      npc: selectedLibraryNpc,
      groupId: benchOpenGroupId,
    }) : '';
    // The resolver's view of the shipped data (every set is DERIVED from what the controller loaded).
    const routeCtx = useMemo(() => {
      if (!NpcRoute || !ctrl.taxonomy) return null;
      const layout = ctrl.taxonomy.landing_layout || {};
      const drawers = (layout.entries || []).map(e => e.tree_node_id).filter(Boolean);
      const affIds = {};
      (function walk(nodes) { (nodes || []).forEach(n => { affIds[n.id] = n; if (n.children) walk(n.children); }); })(ctrl.taxonomy.tree || []);
      const byId = {};
      ['minion', 'rival', 'nemesis'].forEach(t => { ((ctrl.libraryByTier || {})[t] || []).forEach(n => { if (n && n.id) byId[n.id] = n; }); });
      const count = (id) => ['minion', 'rival', 'nemesis'].reduce((c, t) => c + ctrl.getNpcsByTierAndNode(t, id).length, 0);
      return {
        drawers: drawers,
        isAffiliation: (id) => !!affIds[id],
        isFlatDrawer: (id) => { const d = affIds[id]; return !!d && (d.children || []).every(ch => count(ch.id) === 0); },
        npcById: (id) => byId[id] || null,
        hasGroup: (id) => (bench.groups || []).some(g => g.id === id),
        customByKey: (k) => (capabilities.canManageCast ? (cast.npcs.find(n => (n._source_key || n.key) === k) || null) : null),
        canGroups: !!capabilities.canManageGroups,
        canCast: !!capabilities.canManageCast,
        labelOf: (id) => (affIds[id] && affIds[id].label) || '',
      };
    }, [ctrl.taxonomy, ctrl.libraryByTier, ctrl.getNpcsByTierAndNode, bench, cast, capabilities.canManageGroups, capabilities.canManageCast]);

    // THE SYNC. `reportedRef` = the tail the address bar shows, as far as the kernel knows. A position
    // change the address bar does not show is a MOVE → `onLocation(tail)` (the host pushes a history
    // entry through its own navTo). A NEW `location` the kernel is not at is a COLD LOAD or a popstate
    // → resolve it against the data and APPLY it; when resolving truncated or normalized it, the kernel
    // reports the corrected tail with `{ replace: true }` (silently — no toast is drawn or owed).
    // A move made by the library's own BACK (the ladder, or the swipe) is flagged `{ back: true }`, so
    // the host can POP to the previous entry when that is where the ladder lands — the module's BACK
    // and the browser's back then walk one list (R-NPC-4). The kernel never touches `history`.
    const hosted = typeof onLocation === 'function' && typeof location === 'string' && !!NpcRoute;
    const reportedRef = useRef(null);
    const lastLocRef = useRef(undefined);
    const pendingRef = useRef(false);
    const syncedRef = useRef(!hosted);
    const backMoveRef = useRef(false);
    // An APPLY in flight: the tail the kernel is moving to because the URL said so. Until the view
    // machine arrives there, the report effect stays silent — otherwise its run in the SAME pass (the
    // state not yet rendered) reports the OLD position as a move, and the two effects ping-pong.
    const applyingRef = useRef(null);
    const applyFromRef = useRef(null);   // the position the apply started from (not yet rendered away)
    const needsData = (tail) => {
      const head = (NpcRoute.parse(tail)[0]) || '';
      return head !== '' && NpcRoute.RESERVED.indexOf(head) === -1;
    };
    const applyTarget = (t) => {
      setBenchOpenGroupId(t.groupId || null);
      if (t.view === 'reference' && t.npc) {
        ctrl.loadFromLibrary(t.npc);
        setSelectedLibraryNpc(t.npc);
        setRefRailOpen(false);
      }
      if (t.view === 'npc-list' || t.view === 'reference' || t.view === 'library-drilldown') {
        setSelectedDrawerId(t.drawerId || null);
        if (t.view !== 'library-drilldown') {
          if (t.affiliationId !== selectedAffiliationId) setTierFilters({ minion: true, rival: true, nemesis: true });
          setSelectedAffiliationId(t.affiliationId || null);
          setSelectedAffiliationLabel((routeCtx && t.affiliationId) ? routeCtx.labelOf(t.affiliationId) : '');
        }
        }
      if (t.view === 'reference' && t.npc && t.npc._provenance === 'custom') {
        setSelectedDrawerId(null); setSelectedAffiliationId(null); setSelectedAffiliationLabel('');
      }
      setView(t.view);
    };
    useEffect(() => {
      if (!hosted) return;
      const fresh = location !== lastLocRef.current;
      if (!fresh && !pendingRef.current) return;       // a data change alone never re-applies an old tail
      if (fresh) { lastLocRef.current = location; reportedRef.current = location; }
      if (location === position && syncedRef.current) { pendingRef.current = false; return; }   // our own push
      if (needsData(location) && !(dataReady && routeCtx)) { pendingRef.current = true; return; }  // wait for the registry
      pendingRef.current = false;
      const ctxNow = routeCtx || { drawers: [], isAffiliation: () => false, isFlatDrawer: () => false,
        npcById: () => null, hasGroup: (id) => (bench.groups || []).some(g => g.id === id),
        customByKey: (k) => (capabilities.canManageCast ? (cast.npcs.find(n => (n._source_key || n.key) === k) || null) : null),
        canGroups: !!capabilities.canManageGroups, canCast: !!capabilities.canManageCast, labelOf: () => '' };
      const t = NpcRoute.resolve(location, ctxNow);
      syncedRef.current = true;
      if (t.position !== location) {
        reportedRef.current = t.position;
        onLocation(t.position, { replace: true });     // truncated / normalized / refused
      }
      if (t.position !== position) { applyingRef.current = t.position; applyFromRef.current = position; applyTarget(t); }
    }, [location, dataReady, routeCtx]);
    useEffect(() => {
      if (!hosted || !syncedRef.current) return;
      if (applyingRef.current !== null) {
        // The URL drove this change. A run that still shows the pre-apply position is this effect's
        // pass running BEFORE the applied state rendered (its mount run, or the same commit) — skip it.
        // The first position change AFTER that IS the apply's (applyTarget's batch lands as one render):
        // consume it silently, even on a near miss, so a resolver and a view machine that disagree can
        // never mute the kernel's later moves.
        if (position === applyFromRef.current) return;
        const landed = applyingRef.current;
        applyingRef.current = null;
        if (position !== landed) { reportedRef.current = position; onLocation(position, { replace: true }); }
        return;
      }
      if (position === reportedRef.current) return;
      reportedRef.current = position;
      const back = backMoveRef.current;
      backMoveRef.current = false;
      onLocation(position, back ? { back: true } : undefined);   // a MOVE → one history entry (or a pop)
    }, [position]);
    // A BACK that did not move the position (c-fork → cast are both 'custom') must not flag the next move.
    useEffect(() => { backMoveRef.current = false; }, [view, position]);

    // "IN N ENCOUNTERS" (Addendum 1 §B6 — granted as a feature, by name). A reverse lookup over the
    // bench the row's own store already holds: no new data, and it answers the one question the
    // custom-NPC surface could not — where is this NPC actually used. Reads LIVE from `bench`, so
    // adding a custom to an encounter updates the panel without a reload.
    const encountersUsing = useCallback((key) => {
      if (!key || !bench || !Array.isArray(bench.groups)) return [];
      return bench.groups.filter(g => (g.members || []).some(m => m._source_key === key));
    }, [bench]);
  
    // Resolve the best-matching faction profile for a given affiliation ID.
    // First tries exact match, then walks up the taxonomy tree to find a parent dossier.
    const resolveFactionProfile = React.useCallback((affiliationId) => {
      if (!affiliationId || !ctrl.factionProfiles) return null;
      // Exact match
      if (ctrl.factionProfiles[affiliationId]) return ctrl.factionProfiles[affiliationId];
      // Walk up: find which top-level drawer this affiliation belongs to
      if (ctrl.taxonomy && ctrl.taxonomy.tree) {
        for (const drawer of ctrl.taxonomy.tree) {
          if (drawer.id === affiliationId) break; // already tried exact
          const children = drawer.children || [];
          if (children.some(ch => ch.id === affiliationId)) {
            // This affiliation is a child of this drawer — try the drawer's ID
            if (ctrl.factionProfiles[drawer.id]) return ctrl.factionProfiles[drawer.id];
            break;
          }
        }
      }
      return null;
    }, [ctrl.factionProfiles, ctrl.taxonomy]);
  
    // sortedFactions removed — dossier picker replaced by inline Intel Header
  
    // Library NPCs filtered by the current selection (the affiliation drill-down). Populated when
    // view is 'npc-list'. (The shelf lane that also fed this is deleted, B-769.)
    const libraryNpcsForSelection = React.useMemo(() => {
      if (!libraryReady) return [];
      if (selectedAffiliationId) {
        // Collect NPCs across ALL tiers for this affiliation
        const all = [];
        ['minion', 'rival', 'nemesis'].forEach(t => {
          const pool = ctrl.getNpcsByTierAndNode(t, selectedAffiliationId);
          all.push(...pool);
        });
        return all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
      return [];
    }, [libraryReady, ctrl, selectedAffiliationId]);

    // A4 (gold-standard Lap A): the reference-view rail shows the DISPLAYED NPC's OWN
    // faction-mates — derived from the selected NPC, NOT the browse-state
    // selectedAffiliationId. This kills the "browse droids → back → featured Thrawn →
    // pill shows droids" leak WITHOUT touching back-nav (handleScreenBack still keys off
    // selectedAffiliationId, so search→reference→BACK still returns to search).
    const referenceSiblings = React.useMemo(() => {
      const npc = selectedLibraryNpc;
      if (!libraryReady || !npc) return [];
      const path = npc.affiliation_path;
      const node = npc.affiliation || ((Array.isArray(path) && path.length) ? path[path.length - 1] : null);
      if (!node) return [];
      const all = [];
      ['minion', 'rival', 'nemesis'].forEach(t => { all.push(...ctrl.getNpcsByTierAndNode(t, node)); });
      return all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [libraryReady, ctrl, selectedLibraryNpc]);

    const handleSelectDrawer = (drawerId) => {
      // If this drawer has no populated children, skip drill-down and go straight to NPC list
      if (ctrl.taxonomy && ctrl.taxonomy.tree) {
        const drawer = ctrl.taxonomy.tree.find(n => n.id === drawerId);
        if (drawer) {
          const populatedChildren = (drawer.children || []).filter(ch => {
            let count = 0;
            ['minion', 'rival', 'nemesis'].forEach(t => {
              count += ctrl.getNpcsByTierAndNode(t, ch.id).length;
            });
            return count > 0;
          });
          if (populatedChildren.length === 0) {
            // Flat faction — skip to NPC list directly
            setSelectedDrawerId(drawerId);
            handleSelectAffiliation(drawerId, drawer.label);
            return;
          }
        }
      }
      setSelectedDrawerId(drawerId);
      setDrilldownRailOpen(false);
      setView('library-drilldown');
    };
  
    const handleSelectAffiliation = (nodeId, label) => {
      setSelectedAffiliationId(nodeId);
      setSelectedAffiliationLabel(label || '');
      setTierFilters({ minion: true, rival: true, nemesis: true });
      setNpcListRailOpen(false);
      setView('npc-list');
    };
  
    // Switch drawer from the drill-down overlay rail. Rail stays open.
    const handleSwitchDrawer = (drawerId) => {
      setSelectedDrawerId(drawerId);
    };
  
    // Switch sub-affiliation from the NPC list overlay rail. Rail stays open.
    const handleSwitchSubAffiliation = (nodeId, label) => {
      setSelectedAffiliationId(nodeId);
      setSelectedAffiliationLabel(label || '');
    };
  
    // Drawer list for the drill-down overlay rail (all top-level drawers with NPCs).
    const drawerRailItems = React.useMemo(() => {
      if (!ctrl.taxonomy || !ctrl.taxonomy.landing_layout) return [];
      const layout = ctrl.taxonomy.landing_layout;
      const treeById = {};
      (function walk(nodes) {
        (nodes || []).forEach(n => { treeById[n.id] = n; if (n.children) walk(n.children); });
      })(ctrl.taxonomy.tree || []);
      // Compute total counts across all tiers
      const totals = {};
      ['minion', 'rival', 'nemesis'].forEach(t => {
        const tc = computeTierCountByNode(ctrl.libraryByTier, t);
        Object.keys(tc).forEach(id => { totals[id] = (totals[id] || 0) + tc[id]; });
      });
      return (layout.entries || [])
        .filter(e => e.kind === 'drawer')
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(e => {
          const node = treeById[e.tree_node_id];
          if (!node || !(totals[node.id] > 0)) return null;
          return { id: node.id, label: node.label || node.id };
        })
        .filter(Boolean);
    }, [ctrl.taxonomy, ctrl.libraryByTier]);
  
    // Siblings of the current sub-affiliation (all children of the current drawer
    // that have NPCs). Used by the NPC list overlay rail. Includes the "All"
    // entry for the drawer's full pool.
    const npcListSiblings = React.useMemo(() => {
      if (!selectedDrawerId || !ctrl.taxonomy) return [];
      const treeById = {};
      (function walk(nodes) {
        (nodes || []).forEach(n => { treeById[n.id] = n; if (n.children) walk(n.children); });
      })(ctrl.taxonomy.tree || []);
      const drawer = treeById[selectedDrawerId];
      if (!drawer) return [];
      const children = (drawer.children || []);
      // Compute total NPC count per child across all tiers
      const countAll = (nodeId) => {
        let c = 0;
        ['minion', 'rival', 'nemesis'].forEach(t => {
          c += ctrl.getNpcsByTierAndNode(t, nodeId).length;
        });
        return c;
      };
      const result = [];
      // "All [drawer]" entry first
      result.push({ id: drawer.id, label: 'All ' + (drawer.label || drawer.id) });
      children.forEach(ch => {
        if (countAll(ch.id) > 0) {
          result.push({ id: ch.id, label: ch.label || ch.id });
        }
      });
      return result;
    }, [selectedDrawerId, ctrl]);

    // Sub-faction branches of the CURRENT affiliation (Lap B B-1 Branches list).
    // A child is listed if it has its own dossier profile OR any NPCs — so the
    // Empire shows Military / ISB / Bureaucracy as navigable branches. Inquisitorius
    // is excluded structurally (re-parented out of the Empire in taxonomy, R-MIL-4.4),
    // so no filter is needed here.
    const currentBranches = React.useMemo(() => {
      if (!selectedAffiliationId || !ctrl.taxonomy) return [];
      const treeById = {};
      (function walk(nodes) {
        (nodes || []).forEach(n => { treeById[n.id] = n; if (n.children) walk(n.children); });
      })(ctrl.taxonomy.tree || []);
      const node = treeById[selectedAffiliationId];
      if (!node || !Array.isArray(node.children)) return [];
      const countAll = (id) => ['minion', 'rival', 'nemesis']
        .reduce((c, t) => c + ctrl.getNpcsByTierAndNode(t, id).length, 0);
      return node.children
        .filter(ch => (ctrl.factionProfiles && ctrl.factionProfiles[ch.id]) || countAll(ch.id) > 0)
        .map(ch => ({ id: ch.id, label: ch.label || ch.id }));
    }, [selectedAffiliationId, ctrl]);

    const handleSelectLibraryNpc = (libraryEntry) => {
      if (!libraryEntry) return;
      ctrl.loadFromLibrary(libraryEntry);
      setSelectedLibraryNpc(libraryEntry);
      setRefRailOpen(false);
      // RECENT's only writer: opening a detail IS the record (canon or custom, every band).
      touchRecent(libraryEntry._source_key || libraryEntry.key);
      setView('reference');
    };
  
    // Switch NPC from the reference view's rail — keeps the rail open.
    const handleSwitchNpcFromRail = (libraryEntry) => {
      if (!libraryEntry) return;
      ctrl.loadFromLibrary(libraryEntry);
      setSelectedLibraryNpc(libraryEntry);
      touchRecent(libraryEntry._source_key || libraryEntry.key);   // same write: a view is a view
      // Don't close rail — GM is browsing from it
    };
  
    // FACTION-tier legacy entrypoint: still opens the Faction Dossier view
    // using public/data/factions/<file>.json. Library taxonomy is unrelated to
    // that lore surface.

    // ── Lap C1: clone the shown NPC into the custom cast, then land on the CUSTOM NPC tab (E3) so the
    // copy is visible. B-1256: no browser prompt — the approved C2 flow (Docs/mockups/gm-c2-npc-creator.html, FROZEN
    // @ ca5186796) drops the copy straight onto its finished page, already fightable; its NAME is renamed there (EDIT).
    const handleCloneToCast = () => {
      const rec = ctrl.npc;
      if (!rec) return;
      castActions.clone(rec, (rec.name || 'NPC') + ' (custom)');
      setView('cast');
    };
    // Delete a custom (two-tap confirm). Bench refs to it then degrade to the graceful placeholder.
    // Keys off selectedLibraryNpc (the pool record — it retains _provenance / _source_key; ctrl.npc is
    // reshaped by loadFromLibrary and drops the custom envelope).
    const handleDeleteCustom = () => {
      const rec = selectedLibraryNpc;
      if (!rec || rec._provenance !== 'custom') return;
      castActions.del(rec._source_key || rec.key);
      setSelectedLibraryNpc(null);
      setView('cast');
    };

    // ── Option C's in-panel seam (ruling custom-npc-tab-space-triage Addendum 1 §B) ──
    // At >=1367 the cast tab holds its OWN selection: no view hop, no URL change (§B4). Below the
    // band, selection still routes through handleSelectLibraryNpc to the detail view, byte-identical.
    const [castSelectedKey, setCastSelectedKey] = useState(null);
    // §B2 — the pane is never blank: auto-select the FIRST custom, and follow the roster when the
    // current selection is deleted or the cast loads late. Derived, so it cannot go stale.
    const castSelected = useMemo(() => {
      if (!castNpcs.length) return null;
      const hit = castNpcs.find(n => (n._source_key || n.key) === castSelectedKey);
      return hit || castNpcs[0];
    }, [castNpcs, castSelectedKey]);
    const handleSelectCastInPanel = useCallback((npc) => {
      if (!npc) return;
      setCastSelectedKey(npc._source_key || npc.key);
      setCastDeleteArmed(false);                          // arming never survives a selection change
      touchRecent(npc._source_key || npc.key);            // an in-panel open is still an open (RECENT)
    }, [touchRecent]);
    const handleDeleteCustomKey = (key) => {
      if (!key) return;
      castActions.del(key);
      setCastDeleteArmed(false);
      setCastSelectedKey(null);                           // the memo falls back to the first survivor
    };
    // §B3's ADD TO ENCOUNTER. `gid` null = the ＋ NEW ENCOUNTER row: create and add in ONE transform,
    // so the new group can never be persisted empty if the add throws.
    const handleAddCastToEncounter = (npc, gid) => {
      const key = npc && (npc._source_key || npc.key);
      if (!key || !BenchStore) return;
      applyBench(prev => {
        if (gid) return BenchStore.addMember(prev, gid, key);
        const made = BenchStore.createGroup(prev, npc.name ? `${npc.name}'s scene` : 'New encounter');
        return BenchStore.addMember(made.state, made.id, key);
      });
    };

    // ── Lap C2: the creator flow. CREATE opens the fork; the fork-pick CREATES the record up front
    // (so every edit autosaves through castActions.update) and holds its key in castDraftKey. The
    // finished two-faced page is the reference view — SAVE routes there via handleSelectLibraryNpc.
    const castDraft = castDraftKey ? resolveBySourceKey(castDraftKey) : null;
    const handleForkFight = () => {
      // A fighter always has a THREAT face — seed a starting stat block (the rival archetype if loaded,
      // else a plain 2s block) so the finished page renders THE THREAT immediately; the editor's
      // "start from archetype" re-seeds per the chosen type.
      const arch = (castArchetypes && castArchetypes.rival) || {};
      const seed = {
        tier: 'rival',
        characteristics: (arch.characteristics && Object.assign({}, arch.characteristics)) || { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        derived: (arch.derived && Object.assign({}, arch.derived)) || { soak: 3, wounds: 10 },
        skills: [], talents: [], abilities: [], weapons: [], gear: [],
      };
      const k = castActions.create(seed, 'New threat'); setCastDraftKey(k); setView('c-fight');
    };
    const handleForkTalk = () => { const k = castActions.create({}, 'New person'); setCastDraftKey(k); setView('c-talk'); };
    const handleCreatorSave = () => { const rec = resolveBySourceKey(castDraftKey); if (rec) handleSelectLibraryNpc(rec); };
    const handleAttachWeapon = (w) => {
      const rec = resolveBySourceKey(castDraftKey);
      const cur = (rec && rec.weapons) || [];
      castActions.update(castDraftKey, { weapons: cur.concat([w]) });
      setView('c-fight');
    };

    // Tier pill = single-select for fast isolation (NPC-vet r1 P1: the old
    // multi-deselect toggle made "show only Rivals" a 3-tap sequence).
    // Behavior:
    //   - All three on (default) → tap X → only X
    //   - Only X on → tap X → back to all three (reset)
    //   - Only X on → tap Y → only Y (switch)
    const handleToggleTier = (t) => {
      setTierFilters(prev => {
        var count = (prev.minion ? 1 : 0) + (prev.rival ? 1 : 0) + (prev.nemesis ? 1 : 0);
        var onlyThis = prev[t] && count === 1;
        if (onlyThis) return { minion: true, rival: true, nemesis: true };
        return { minion: false, rival: false, nemesis: false, [t]: true };
      });
    };
  
    // Deep-link from the reference view to the Faction Dossier. Only works
    // when the library NPC's affiliation coincides with an existing dossier
    // faction id. Otherwise the button is hidden at render time.
    // Chunk 8: open a saved NPC from the history viewer.
    // Loads it into ctrl.npc via SET_NPC and routes to the reference view.
    // Disposition + history persist because they're part of the NPC snapshot.
  
    // Smart back: each sub-view returns one step in the library flow.
    // Vet UI fix: BACK now navigates back in a single tap. The previous 2-tap
    // pattern (1st tap opens slide-out rail to pick siblings, 2nd tap actually
    // navigates) was a workaround for missing in-page sibling navigation.
    // On phone, the sticky chip strip already exposes sibling factions; on tablet
    // the slide-out rail can be opened via its own gesture/affordance. BACK
    // shouldn't be overloaded as a "show me siblings first" gesture — that
    // surprised users.
    // Vet rules fix: BACK from reference view was landing on `npc-list` even
    // when the user came via direct search (no selectedAffiliationId), which
    // rendered a blank screen. Now we check whether we have the context to
    // render the intermediate view and fall back to library-landing otherwise.
    const handleScreenBack = () => {
      // ENCOUNTERS E3 lap B (shape §4.5): on the manager's own screen BACK from an open encounter is the list, and from
      // the list it is the landing, in one press (HOMEBREW's runhead).
      if (encScreen) {
        if (benchOpenGroupId) { backMoveRef.current = true; return setBenchOpenGroupId(null); }
        return onBack();
      }
      if (view === 'library-landing')   return onBack();               // exit screen
      backMoveRef.current = true;        // B-863: the ladder's move is a BACK (the host may pop to it)
      if (view === 'history')           return setView('library-landing');
      if (view === 'groups')            return setView('library-landing');
      if (view === 'cast')              return setView('library-landing');
      // C2 creator flow: fork ← CUSTOM NPC tab; fight/talk ← fork; armory ← fight; profile ← talk.
      if (view === 'c-fork')            return setView('cast');
      if (view === 'c-fight')           return setView('c-fork');
      if (view === 'c-talk')            return setView('c-fork');
      if (view === 'c-armory')          return setView('c-fight');
      if (view === 'c-profile')         return setView('c-talk');
      if (view === 'reference') {
        if (refRailOpen) setRefRailOpen(false);
        if (selectedAffiliationId) return setView('npc-list');
        // ponytail: a custom with no browse context was reached from the CUSTOM NPC tab — return there
        // rather than the landing. No extra state; the affiliation context still wins above.
        if (capabilities.canManageCast && selectedLibraryNpc && selectedLibraryNpc._provenance === 'custom') return setView('cast');
        // Came via search (no affiliation context) → back to library-landing.
        return setView('library-landing');
      }
      if (view === 'npc-list') {
        if (npcListRailOpen) setNpcListRailOpen(false);
        if (selectedDrawerId) return setView('library-drilldown');
        return setView('library-landing');
      }
      if (view === 'library-drilldown') {
        if (drilldownRailOpen) setDrilldownRailOpen(false);
        return setView('library-landing');
      }
      return setView('library-landing');
    };
    // Keep the swipe hook's closure pointing at the latest handleScreenBack
    backRef.current = handleScreenBack;
  
    // ── THE TWO FACES' SHARED PARTS (B-862) — computed ONCE, printed by whichever face is up. ──
    // The tab items. Declarative conditional tab (nav 3b): GROUPS carries `when` instead of
    // a hand-spliced array, filtered here in the SHARED core for the library's own tab strip.
    const navItems = [
      { id: 'library-landing', label: 'BROWSE' },
      // ENCOUNTERS E3 lap B (R-E3S-1; shape §4.5): while swrpg_encounters_door is on, ENCOUNTERS is its own GM screen and
      // the strip reads BROWSE · CUSTOM NPC · RECENT (`capabilities.encounters` is the host's 'door' | 'screen'; absent = today).
      { id: 'groups', label: `ENCOUNTERS${bench.groups.length > 0 ? ' (' + bench.groups.length + ')' : ''}`, when: !!capabilities.canManageGroups && !capabilities.encounters },
      // E3: authoring is a top-level door, not a shelf inside BROWSE. Same `when` mechanism as
      // GROUPS, so the Player mount (no cast capability) never renders it.
      { id: 'cast', label: `CUSTOM NPC${castNpcs.length > 0 ? ' (' + castNpcs.length + ')' : ''}`, when: !!capabilities.canManageCast },
      // RECENT (was HISTORY — Addendum 1 §C). Count-chipped like its siblings. The inner view
      // id stays 'history': an internal id is not user copy (the ENCOUNTERS-rename precedent),
      // and renaming it would churn the back-nav + URL story for nothing.
      { id: 'history', label: `RECENT${recentNpcs.length > 0 ? ' (' + recentNpcs.length + ')' : ''}` },
    ].filter(it => it.when !== false);
    // B-869 — every creator page marks CUSTOM NPC (C6–C10 · C13 · C14 draw it so); the fallthrough marked
    // BROWSE. B-899 fix 7 (C17, R-NPR8-8): a custom's own page (/custom/<key>, R-NPC-4) marks it too — C12's
    // BROWSE mark was the same defect. Both faces: a wrong mark is a defect, not a look.
    const _customPage = view === 'reference' && !!selectedLibraryNpc && selectedLibraryNpc._provenance === 'custom';
    const navActiveId = view === 'history' ? 'history' : view === 'groups' ? 'groups'
      : (view === 'cast' || CREATOR_VIEWS.indexOf(view) !== -1 || _customPage) ? 'cast' : 'library-landing';
    // The views that need the registry (every view but RECENT, the two GM tabs and the creator). While
    // it is in flight they show LOADING; when it FAILED the paper face shows A25 (the dark face keeps
    // its one state for both — R-NPC-6's DOM-identical OFF face).
    const needsLibrary = view !== 'history' && view !== 'groups' && view !== 'cast' && CREATOR_VIEWS.indexOf(view) === -1;
    const wipeAnimation = `${wipeType} ${dur}s cubic-bezier(0.42,0,0.18,1) forwards`;

    // THE DARK BODY'S CHILDREN, named once (B-862). The dark face prints them inside its own scroller,
    // exactly as before (a Fragment adds no DOM); the paper face prints them on an interim island
    // until each view's row draws it. One tree of views, never two.
    const legacyBody = (
        <React.Fragment>
          {/* RECENT bypasses the dataReady gate: id-refs resolve against whatever pool is loaded,
              and an unresolved entry drops rather than blocking the tab. */}
          {view === 'history' && (
            <NpcRecentView
              npcs={recentNpcs}
              onOpenEntry={handleSelectLibraryNpc}
              onClearAll={() => { setRecent([]); if (CastStore) CastStore.clearRecent(); }}
              accent={NPC_ACCENT}
            />
          )}
  
          {/* NPC bench — GM-only groups with persistent tracked state (D-NB1). Manages its own
              loading-tolerance: a dropped/loading member resolves to a graceful placeholder. */}
          {view === 'groups' && capabilities.canManageGroups && (
            /* HOLOTABLE Stage B wiring. `BenchTable` is the ONE composition that wraps something
               that already ships, and while the flag is off it returns these children UNTOUCHED —
               no wrapper, no column, no DOM change at all. The flag ADDS the table affordance; it
               must never be able to take the bench away, and test/holotable_compose.cjs pins that.
               The feed sits after it in the same column: the mockup drew "Shared feed · 390" as
               its own frame, and the WIDE arrangement that would sit them side by side is exactly
               what R-MPA-4 still owes. It renders nothing until a table is running. */
            <HoloCompose.BenchTable
              code={room ? room.codeDisplay : ''}   /* 3-3 grouped for reading aloud (R-WRC-1) */
              present={room ? room.present : 0}
              busy={room ? room.busy : false}
              onStart={room ? room.startTable : undefined}
              onClose={room ? room.leave : undefined}
            >
              <NpcBenchGroupsView
                bench={bench}
                openGroupId={benchOpenGroupId}
                onOpenGroup={setBenchOpenGroupId}
                actions={benchActions}
                manager={encScreen ? encManager : null}
                npcPool={npcPool}
                resolveBySourceKey={resolveBySourceKey}
                refData={refData}
                factionProfiles={ctrl.factionProfiles}
                accent={NPC_ACCENT}
              />
              <HoloCompose.Feed entries={room ? room.entries : []} />
            </HoloCompose.BenchTable>
          )}

          {/* B-869 · C1–C5 — THE CAST on paper, the same store, handlers and testids: the empty state (C4/C5);
              at >=1367 the rail (create tile + entries) beside the reading column — owner actions, the usage
              plate, the finished page (C3); below it ONE grid, the create tile tall only at the desk (C1/C2). */}
          {view === 'cast' && capabilities.canManageCast && (
            castNpcs.length === 0 ? (
              <CastEmptyState onCreate={() => { setCastDraftKey(null); setView('c-fork'); }}
                onBrowse={() => setView('library-landing')} accent={NPC_ACCENT} gold={CREATOR_GOLD} wide={_npcDesk} />
            ) : _npcWide ? (
              <div className="nl-desk" data-testid="cast-panels" data-npc-state="cast">
                <div className="nl-cast-rail">
                  <CastCreateTile variant="rail" gold={CREATOR_GOLD} onClick={() => { setCastDraftKey(null); setView('c-fork'); }} />
                  {castNpcs.map(n => (
                    <CastRosterItem key={n._source_key || n.key} npc={n}
                      selected={castSelected && (castSelected._source_key || castSelected.key) === (n._source_key || n.key)}
                      onSelect={handleSelectCastInPanel} resolveBySourceKey={resolveBySourceKey} accent={NPC_ACCENT} />
                  ))}
                </div>
                <div className="nl-main">
                  {castSelected && (() => {
                    const used = encountersUsing(castSelected._source_key || castSelected.key);
                    return (
                      <div className="nl-readcap" data-testid="cast-panel-detail">
                        <CastOwnerActions npc={castSelected} encounters={bench.groups || []}
                          onEdit={() => { setCastDraftKey(castSelected._source_key); setView(castFaces(castSelected, resolveBySourceKey).hasFight ? 'c-fight' : 'c-talk'); }}
                          onAddToEncounter={(gid) => handleAddCastToEncounter(castSelected, gid)}
                          onDelete={() => handleDeleteCustomKey(castSelected._source_key || castSelected.key)}
                          deleteArmed={castDeleteArmed} setDeleteArmed={setCastDeleteArmed} accent={NPC_ACCENT} gold={CREATOR_GOLD} />
                        <div className="hp-plate" data-pad="snug" data-testid="cast-encounter-usage">
                          <div className="nl-tier" style={{ marginBottom: used.length ? '8px' : 0 }}>
                            {used.length ? `IN ${used.length} ENCOUNTER${used.length === 1 ? '' : 'S'}` : 'IN NO ENCOUNTERS YET'}</div>
                          {used.length > 0 && (
                            <div className="nl-acts" style={{ margin: 0 }}>
                              {used.map(g => <button key={g.id} type="button" className="hp-quiet" onClick={() => setView('groups')}>{g.name}</button>)}
                            </div>
                          )}
                        </div>
                        <NpcCustomFinishedPage npc={castSelected} resolveBySourceKey={resolveBySourceKey} refData={refData}
                          factionProfiles={ctrl.factionProfiles} accent={NPC_ACCENT}
                          onEditFight={() => { setCastDraftKey(castSelected._source_key); setView('c-fight'); }}
                          onEditTalk={() => { setCastDraftKey(castSelected._source_key); setView('c-talk'); }} />
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="nl-castgrid" data-testid="cast-grid" data-npc-state="cast">
                <CastCreateTile variant={_npcDesk ? 'grid' : 'rail'} gold={CREATOR_GOLD} onClick={() => { setCastDraftKey(null); setView('c-fork'); }} />
                {castNpcs.map(n => (
                  <CastRosterItem key={n._source_key || n.key} npc={n} selected={false} onSelect={handleSelectLibraryNpc}
                    resolveBySourceKey={resolveBySourceKey} accent={NPC_ACCENT} />
                ))}
              </div>
            )
          )}

          {/* CUSTOM NPC — option C (ruling custom-npc-tab-space-triage Addendum 1 §B). Reads the cast
              store, so it needs no library fetch — ungated like ENCOUNTERS. */}

          {view !== 'history' && view !== 'groups' && view !== 'cast' && CREATOR_VIEWS.indexOf(view) === -1 && !dataReady && (
            <div style={{
              textAlign: 'center', marginTop: '40px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
              letterSpacing: '0.2em', color: `${NPC_ACCENT}99`,
            }}>
              {NPC_LOADING_WORD}
            </div>
          )}
  
          {/* Library landing: first screen, no tier gate */}
          {view === 'library-landing' && dataReady && (
            <NpcLibraryLandingView
              taxonomy={ctrl.taxonomy}
              libraryByTier={mergedLibraryByTier}
              onSelectDrawer={handleSelectDrawer}
              onSelectNpc={handleSelectLibraryNpc}
              accent={NPC_ACCENT}
            />
          )}
  
          {/* Drawer drill-down: two-column master-detail */}
          {view === 'library-drilldown' && dataReady && railWrap(
            {
              isOpen: drilldownRailOpen,
              onDismiss: () => setDrilldownRailOpen(false),
              items: drawerRailItems,
              selectedId: selectedDrawerId,
              onSelect: (id) => handleSwitchDrawer(id),
              accent: NPC_ACCENT,
              title: 'SECTIONS',
            },
            <NpcLibraryDrillDownView
              taxonomy={ctrl.taxonomy}
              libraryByTier={mergedLibraryByTier}
              selectedDrawerId={selectedDrawerId}
              onSelectAffiliation={handleSelectAffiliation}
              onSelectNpc={handleSelectLibraryNpc}
              accent={NPC_ACCENT}
              factionProfiles={ctrl.factionProfiles}
              onBackToLanding={() => setView('library-landing')}
            />
          )}
  
          {view === 'npc-list' && dataReady && selectedAffiliationId && (() => {
            const fp = resolveFactionProfile(selectedAffiliationId);
            const affLabel = selectedAffiliationLabel || resolveAffiliationLabel(ctrl.taxonomy, selectedAffiliationId);
            const crumbs = [
              { label: 'Allies', onTap: () => setView('library-landing') },
              selectedDrawerId && selectedDrawerId !== selectedAffiliationId
                ? { label: resolveAffiliationLabel(ctrl.taxonomy, selectedDrawerId), onTap: () => setView('library-drilldown'), accent: getFactionAccent(selectedDrawerId, NPC_ACCENT) }
                : null,
              { label: affLabel, accent: getFactionAccent(selectedDrawerId, NPC_ACCENT) },
            ].filter(Boolean);
            // A faction with a dossier profile → the consolidated tabbed surface
            // (INTEL / LORE / FORCES). A profile-less affiliation → the plain roster.
            const content = fp ? (
              <NpcFactionSurface
                key={selectedAffiliationId}
                faction={fp}
                allNpcs={libraryNpcsForSelection}
                npcPool={npcPool}
                affiliationLabel={affLabel}
                tierFilters={tierFilters}
                onToggleTier={handleToggleTier}
                onSelect={handleSelectLibraryNpc}
                accent={NPC_ACCENT}
                allFactions={ctrl.factionProfiles}
                branches={currentBranches}
                onSelectBranch={handleSwitchSubAffiliation}
                breadcrumbs={crumbs}
              />
            ) : (
              <NpcLibraryListView
                allNpcs={libraryNpcsForSelection}
                affiliationLabel={affLabel}
                tierFilters={tierFilters}
                onToggleTier={handleToggleTier}
                onSelect={handleSelectLibraryNpc}
                accent={NPC_ACCENT}
                breadcrumbs={crumbs}
              />
            );
            // A lone sub-affiliation has no siblings to switch — no rail; content runs full-width.
            return npcListSiblings.length > 1
              ? railWrap(
                  {
                    isOpen: npcListRailOpen,
                    onDismiss: () => setNpcListRailOpen(false),
                    items: npcListSiblings,
                    selectedId: selectedAffiliationId,
                    onSelect: (id, label) => handleSwitchSubAffiliation(id, label),
                    accent: NPC_ACCENT,
                    title: 'Branches',
                  },
                  content
                )
              : <div style={{ position: 'relative' }}>{content}</div>;
          })()}
  
  
          {/* ── Lap C2: the GM NPC creator screens (GM-only; guarded by canManageCast). ──
              Author surfaces only — the finished two-faced page renders in the reference view below. */}
          {capabilities.canManageCast && view === 'c-fork' && (
            <NpcCreateForkView
              onPickFight={handleForkFight}
              onPickTalk={handleForkTalk}
              onBack={() => setView('cast')}
              accent={NPC_ACCENT}
            />
          )}
          {capabilities.canManageCast && view === 'c-fight' && castDraft && (
            <NpcFightEditorView
              draft={castDraft}
              castKey={castDraftKey}
              actions={castActions}
              archetypes={castArchetypes}
              refData={refData}
              onOpenArmory={() => setView('c-armory')}
              onSave={handleCreatorSave}
              onBack={() => setView('c-fork')}
              accent={NPC_ACCENT}
              resolveBySourceKey={resolveBySourceKey}
              factionProfiles={ctrl.factionProfiles}
            />
          )}
          {capabilities.canManageCast && view === 'c-armory' && castDraft && (
            <NpcArmoryPickerView
              npcPool={npcPool}
              draft={castDraft}
              onAttach={handleAttachWeapon}
              onBack={() => setView('c-fight')}
              refData={refData}
              accent={NPC_ACCENT}
            />
          )}
          {capabilities.canManageCast && view === 'c-talk' && castDraft && (
            <NpcTalkCardView
              draft={castDraft}
              castKey={castDraftKey}
              actions={castActions}
              resolveBySourceKey={resolveBySourceKey}
              onOpenProfile={() => setView('c-profile')}
              onSave={handleCreatorSave}
              onBack={() => setView('c-fork')}
              accent={MEET_ACCENT}
              refData={refData}
              factionProfiles={ctrl.factionProfiles}
            />
          )}
          {capabilities.canManageCast && view === 'c-profile' && castDraft && (
            <NpcProfilePickerView
              npcPool={npcPool}
              draft={castDraft}
              castKey={castDraftKey}
              actions={castActions}
              onDone={() => setView('c-talk')}
              onBack={() => setView('c-talk')}
              accent={MEET_ACCENT}
              taxonomy={ctrl.taxonomy}
            />
          )}

          {dataReady && view === 'reference' && ctrl.npc && (ctrl.npc.name || ctrl.npc.libraryKey) && railWrap(
            {
              isOpen: refRailOpen,
              onDismiss: () => setRefRailOpen(false),
              items: referenceSiblings
                .filter(n => tierFilters[n.tier])
                .map(n => ({ id: n._source_key || n.key, label: n.name, _npc: n })),
              selectedId: selectedLibraryNpc && (selectedLibraryNpc._source_key || selectedLibraryNpc.key),
              onSelect: (id, label) => {
                const npc = referenceSiblings.find(n => (n._source_key || n.key) === id);
                if (npc) handleSwitchNpcFromRail(npc);
              },
              accent: NPC_ACCENT,
              title: 'IN THIS SECTION',
            },
            <React.Fragment>
              {/* Lap C2 — a custom NPC gets the two-faced finished page; canon NPCs keep the plain card. */}
              {selectedLibraryNpc && selectedLibraryNpc._provenance === 'custom' ? (
                /* B-869 · C12 — the custom's page on paper, DELETE CUSTOM NPC under it (two taps, the product's words). */
                <div data-npc-state="custom-reference" data-npc-record={selectedLibraryNpc._source_key || ''}>
                  <NpcCustomFinishedPage npc={selectedLibraryNpc} resolveBySourceKey={resolveBySourceKey} refData={refData}
                    factionProfiles={ctrl.factionProfiles} accent={NPC_ACCENT}
                    onEditFight={() => { setCastDraftKey(selectedLibraryNpc._source_key); setView('c-fight'); }}
                    onEditTalk={() => { setCastDraftKey(selectedLibraryNpc._source_key); setView('c-talk'); }} />
                  {capabilities.canManageCast && (
                    <div className="nl-acts">
                      <button type="button" className="hp-quiet nl-wide" data-npc-delete-custom="1" data-armed={castDeleteArmed ? '1' : '0'}
                        onClick={() => { if (castDeleteArmed) handleDeleteCustom(); else setCastDeleteArmed(true); }}>
                        {castDeleteArmed ? 'TAP AGAIN TO DELETE' : 'DELETE CUSTOM NPC'}</button>
                    </div>
                  )}
                </div>
              ) : (() => {
                // B-863 · R-NPC-3 — a press writes ONE word for the SHOWN NPC, through the store, on
                // either face (the dark face stops losing the word; its DOM does not move).
                const dispositionHandler = (nextDisposition) => setDisposition(dispKey, nextDisposition);
                // B-865 — THE ONE TREE (A9–A14 · A26): stacked below 1024, three panels from 1024; CLONE
                // under the block on the GM host (C11).
                return (
                  <div data-npc-state="reference" data-npc-record={dispKey || ''}>
                    <NpcPaperStatBlock rend={ctrl.npc} tier={(selectedLibraryNpc && selectedLibraryNpc.tier) || ctrl.npc.tier}
                      refData={refData} factionProfiles={ctrl.factionProfiles}
                      name={(selectedLibraryNpc && selectedLibraryNpc.name) || ctrl.npc.name}
                      arrange={_npcDesk ? 'panels' : 'stack'} ctx="library" owner={selectedLibraryNpc ? selectedLibraryNpc._source_key : null}
                      dispositionEl={<DispositionSelector disposition={dispWord} onChange={dispositionHandler} accent={NPC_ACCENT} readOnly={!!capabilities.pick} />}
                      foot={capabilities.pick && selectedLibraryNpc ? (
                        /* R6 S1-pick (card release-r6-ui §2.3; ruling release-r6-ui-c0 U10): the host's PICK mode — PICK writes the
                           shown record as a `ref` row, MAKE YOUR OWN a copy as an `own` row; the host decides what each writes */
                        <div className="nl-acts" data-npc-pick-foot="1">
                          <button type="button" className="hp-commit nl-wide" data-npc-pick="1" onClick={() => capabilities.pick.onPick(selectedLibraryNpc)}>PICK</button>
                          <button type="button" className="hp-quiet nl-wide" data-npc-own="1" onClick={() => capabilities.pick.onOwn(selectedLibraryNpc)}>MAKE YOUR OWN</button>
                        </div>
                      ) : capabilities.canManageCast && selectedLibraryNpc && selectedLibraryNpc._provenance !== 'custom' ? (
                        <div className="nl-acts">
                          <button type="button" className="hp-quiet nl-wide" data-npc-clone="1" onClick={handleCloneToCast}>CLONE TO CUSTOM NPC</button>
                        </div>
                      ) : null} />
                  </div>
                );
              })()}
              {/* Step 1 capability seam — host encounter-context affordances (empty in GM host) */}
              {actions ? actions({ npc: ctrl.npc, tier: tier, capabilities: capabilities }) : null}

              {/* Lap C1 — custom-NPC affordances (GM-only). CLONE on any canon NPC; DELETE on a custom.
                  Provenance comes from selectedLibraryNpc (the pool record); ctrl.npc loses it. */}
            </React.Fragment>
          )}
        </React.Fragment>
    );

    // ══ THE PAPER FACE (B-862) — frames A22 · A25, the shell of every frame ════════════════════════
    // The head, the tab strip and the body scroller are the board's (`nl-head` / `nl-tabs` /
    // `nl-body`), drawn by the module for BOTH hosts — the approved frames draw one head and one strip
    // on both, so a host `chrome.Header` / `chrome.Nav` paper arm would be the same drawing twice.
    // Every view whose drawing is not built yet stands on an ISLAND (`NPC_INTERIM_ZONES`), which IS
    // the body scroller: a BODY swap, never a screen swap, so no dark head is drawn under the paper one.
    const zone = npcInterimZone(view);
    const drawn = zone ? null : npcDrawnZone(view);
    let paperBody;
    if (needsLibrary && !dataReady) {
      paperBody = (
        <div className="nl-body" ref={scrollRef} data-npc-zone={ctrl.loadError ? 'load-failure' : 'loading'}>
          {ctrl.loadError ? (
            /* A25 — the load failure: what went wrong, what to do, ONE control. TRY AGAIN re-runs the
               controller's same three fetches (`ctrl.retryLoad`); nothing else is retried. */
            <React.Fragment>
              <p className="hp-none nl-loading">{NPC_FAIL_COPY.title}</p>
              <div className="hp-plate" data-pad="read" style={{ marginTop: '18px' }}>
                <p className="nl-note" style={{ margin: 0 }}>{NPC_FAIL_COPY.body}</p>
                <button type="button" className="hp-commit nl-wide" data-npc-retry="1"
                  onClick={ctrl.retryLoad}>{NPC_FAIL_COPY.control}</button>
              </div>
            </React.Fragment>
          ) : (
            /* A22 — loading, and ONLY loading (split from the failure by A25). */
            <p className="hp-none nl-loading">{NPC_LOADING_WORD}</p>
          )}
        </div>
      );
    } else if (drawn) {
      // B-864 THE REGISTER · B-865 THE REFERENCE, drawn: the same kernel body, every component on its
      // paper branch; the body names its zone.
      paperBody = (
        <div className="nl-body" ref={scrollRef} data-npc-zone={drawn}>
          {legacyBody}
        </div>
      );
    } else {
      paperBody = (
        <div className="nl-body nl-legacy" ref={scrollRef} data-npc-interim={zone || 'unzoned'}>
          {/* An island is a DARK body: its components draw their dark branches (a shared stat part
              inside a custom's page must not draw paper inside the island). */}
          {legacyBody}
        </div>
      );
    }
    return (
      <NpcPoolCoreCtx.Provider value={capabilities.encounterCore || null}>
      <NpcDispositionCtx.Provider value={dispCtxValue}>
        <div
          data-tour-id="g-npc-faction"
          className="hp-sheet nl-scr nl"
          data-npc-shell="1"
          data-npc-zone="shell"
          data-doc-ground="creator"
          data-desk={_npcDesk ? '1' : '0'}
          data-npc-view={view}
          style={{ position: 'absolute', inset: 0, zIndex: 20, animation: wipeAnimation }}
          {...swipe}
        >
          {encScreen ? (
            /* ENCOUNTERS E3 lap B — the manager's own head (F2–F8): ‹ GM HOLOCRON from the list, ‹ ENCOUNTERS from an
               open encounter; the title; the Destiny strip in the head's third slot at the desk, its own row below 1024. */
            <EncounterHead back={benchOpenGroupId ? 'ENCOUNTERS' : 'GM HOLOCRON'} onBack={handleScreenBack}
              table={heldTable.state} applyTable={heldTable.apply} desk={_encDesk} />
          ) : (
          <div className="nl-head">
            <button type="button" className="nl-back" aria-label="Go back" onClick={handleScreenBack}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><polyline points="13,4 7,10 13,16" /></svg>BACK
            </button>
            <div className="nl-title"><b>{NPC_LIB_TITLE}</b><span>{NPC_LIB_SUBTITLE}</span></div>
            <span />
          </div>
          )}
          {encScreen ? null : <nav className="nl-tabs" aria-label="Sub-sections">
            {navItems.map(it => (
              <button key={it.id} type="button" className="nl-tab" data-on={it.id === navActiveId ? '1' : '0'}
                aria-current={it.id === navActiveId ? 'page' : undefined}
                data-npc-tab={it.id} onClick={() => setView(it.id)}>{it.label}</button>
            ))}
          </nav>}
          {capabilities.pick && capabilities.pick.head ? <div className="nl-pickhead" data-npc-pickhead="1">{capabilities.pick.head}</div> : null}
          {paperChipRail ? <NpcPaperChips {...paperChipRail} /> : null}
          {paperBody}
        </div>
      </NpcDispositionCtx.Provider>
      </NpcPoolCoreCtx.Provider>
    );
  }

  window.SWRPGLibrary = window.SWRPGLibrary || {};
  window.SWRPGLibrary.NPC = {
    Library: NpcLibrary,
    // PAPER N6: the reference card and its CRAFT block, for test/npc_craft_block.cjs (rendered from the built bundle)
    NpcPaperStatBlock: NpcPaperStatBlock,
    NpcCraftBlock: NpcCraftBlock,
    // card `shipyard-encounter-craft-build`: the bench's tracker and craft row, for test/shipyard_encounter_craft_*.cjs
    NpcPaperTrack: NpcPaperTrack,
    BenchGroupCraft: BenchGroupCraft,
    // ENCOUNTERS E6 frames (G3's LOG, D2): a logged crit's name from its roll, through the bench's own table and reader
    loadCritRows: loadEncCritRows,
    critNameOf: (roll) => encCritName(_encCritRows || [], { roll: roll }),
    // ENCOUNTERS E6 frames D8: a campaign's CAST (its rows and its add search) through the library's pool
    loadCastPool: loadCastPool, castNpcOf: castNpcOf, castSearch: castSearch,
    Landing: NpcLibraryLandingView,
    List: NpcLibraryListView,
    Recent: NpcRecentView,
    NPC_ACCENT: NPC_ACCENT,
    FACTION_ACCENTS: FACTION_ACCENTS,
    getFactionAccent: getFactionAccent,
    DISPOSITIONS: DISPOSITIONS,
    resolveAffiliationLabel: resolveAffiliationLabel,
    computeTierCountByNode: computeTierCountByNode,
    resolveShelfMembers: resolveShelfMembers,
    buildLandingEntries: buildLandingEntries,
    NpcLibraryLandingView: NpcLibraryLandingView,
    NpcLibraryDrillDownView: NpcLibraryDrillDownView,
    NpcLibraryListView: NpcLibraryListView,
    NpcFactionSurface: NpcFactionSurface,
    GM_SYMBOL_ALIASES: GM_SYMBOL_ALIASES,
    DIFFICULTY_NAMES: DIFFICULTY_NAMES,
    renderDescription: renderDescription,   // the GM's GmBehaviorRow reads it (a live consumer, R-NFLS-3)
    loadCanonicalTalents: loadCanonicalTalents,
    canonicalTalentNameIndex: canonicalTalentNameIndex,
    parseWeaponString: parseWeaponString,
    RANGE_LABELS: RANGE_LABELS,
    NpcSkillGrid: NpcSkillGrid,
    resolveVehicleWeapons: resolveVehicleWeapons,
    WeaponTable: WeaponTable,
    TalentBlock: TalentBlock,
    VEHICLE_CATEGORIES: VEHICLE_CATEGORIES,
    VehiclePanel: VehiclePanel,
    DispositionSelector: DispositionSelector,
    NpcRecentView: NpcRecentView,
  };
})();
