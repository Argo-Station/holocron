const { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } = React;
const h = React.createElement;

// Phase 1b — shared UI primitives from lib/shared/ui.jsx (window.SWRPGUI, in /vendor.js).
// Destructured here so existing call sites stay untouched. GmBehaviorRow stays LOCAL (gm's copy
// pipes text through renderDescription() for FFG dice glyphs — NPC-vet fix; → Phase 2, R-UI-B3).
const { SectionHeader, StatBox, PrimaryButton, SuiteBar, BottomNav, ModuleMenu, navIcon, useSwipeBack, useBackToClose, ffgDicePool, WIPE_DURATIONS, SWIPE_BACK_EDGE_PX, QualityChips, VersionBeacon } = window.SWRPGUI;
const _VersionBeacon = VersionBeacon || function () { return null; };  // F-48 G13 — honest update notice (shim if vendor lags)
// F-46 D3 — shared desktop layout hook/primitives (window.SWRPGDesktop; desktopLayout.js after vendor).
const { useLayoutMode, CenterColumn, SplitPane } = (window.SWRPGDesktop || {
  useLayoutMode: function () { return 'mobile'; },
  CenterColumn: function (p) { return p.children; },
  SplitPane: function (p) { return p.detail; },
});

// The NPC library is lib/library/npc/view.jsx (window.SWRPGLibrary.NPC, a /lib/ classic transform loaded
// before this bundle); the GM reads NPC_ACCENT and renderDescription (GmBehaviorRow's glyphs) from it and
// mounts its `Library`. GmDicePool, GmBehaviorRow and GmIconX are the GM's own (their NPC twins went with
// the library's dark face, B-871).
const { NPC_ACCENT, renderDescription } = window.SWRPGLibrary.NPC;

/* ══════════════════════════════════════════════════════
   GM HOLOCRON — constants
   Holocron cyan is the app-wide accent; each hub card
   carries its own subordinate accent for hub variety.
══════════════════════════════════════════════════════ */
const HOLOCRON_ACCENT = '#4EAAFF';
// SHIPYARD (R-SY6): the ONE Ship Yard accent — the scattered hex literals route here (C-Y1b:
// grep-zero for the hex in the yard region; this named constant is the single source).
const YARD_ACCENT = '#F4A460';

const WIPE_TYPES = ['wipeHorizontal', 'wipeDiagonal', 'wipeIris'];
// WIPE_DURATIONS → window.SWRPGUI (lib/shared/ui.jsx), destructured at top. [Phase 1b]

/* ══════════════════════════════════════════════════
   TILE DEFINITIONS — the GM toolbox (UXQP-27)
   The landing is a TOOLBOX, not a journey: workflow-agnostic, direct names,
   one tap to enter. Order is FIXED — never resorted (spatial stability
   beats recency tricks). NPC Library leads by frequency, not grouping.
   Ship Yard rides as a full-width tile below the grid (Jason 2026-06-12).
══════════════════════════════════════════════════ */
const CARDS = [
  { id: 'npc',       eyebrow: 'REFERENCE',  label: 'NPC LIBRARY' },
  { id: 'map',       eyebrow: 'NAVIGATION', label: 'UNIVERSE MAP' },
  { id: 'store',     eyebrow: 'COMMERCE',   label: 'THE STORE' },
  { id: 'yard',      eyebrow: 'FLEET',      label: 'SHIPYARD' },
];
// ENCOUNTERS E3 lap B (shape `encounters-e2-manager-shape` R-E2S-6; ruling `encounters-e3-screens` R-E3S-1): the fifth
// plate, after SHIPYARD, joins only while swrpg_encounters_door is on (lib/library/npc/encountersDoor.js); HOMEBREW
// stays the conditional sixth.
const ENCOUNTERS_CARD = { id: 'encounters', eyebrow: 'CONFLICT', label: 'ENCOUNTERS' };
function encountersOn() { return !!(window.SWRPGEncountersDoor && window.SWRPGEncountersDoor.on()); }
// ENCOUNTERS E6 frames (ruling `encounters-e6-frames` R-E6F-1/2, G1): the CAMPAIGNS plate (TABLE) joins after ENCOUNTERS
// when that door is on, else after SHIPYARD, only while swrpg_campaigns_door is on (lib/shared/campaignsDoor.js).
// OFF, /gm/campaigns[/<id>] parses as an unknown path does (the landing).
const CAMPAIGNS_CARD = { id: 'campaigns', eyebrow: 'TABLE', label: 'CAMPAIGNS' };
function campaignsOn() { return !!(window.SWRPGCampaignsDoor && window.SWRPGCampaignsDoor.on() && window.SWRPGCampaignsView); }

/* ══════════════════════════════════════════════════════
   SWIPE BACK HOOK — ported from player.html
══════════════════════════════════════════════════════ */
// UXQP-38: arm the back-gesture ONLY when the drag starts within the left
// edge zone (iOS convention, ~28px). Before this, any rightward drag >65px
// anywhere on screen exited — so panning the universe map (or the pregen
// carousel) leftward dragged the finger rightward to start and bounced the
// user out. Edge-zone arming kills that; header BACK stays for explicit nav.
// useSwipeBack + SWIPE_BACK_EDGE_PX → window.SWRPGUI (lib/shared/ui.jsx), destructured at top. [Phase 1b]

/* ══════════════════════════════════════════════════════
   LANDING — THE GM TOOLBOX, ON PAPER (UXQP-27's toolbox: workflow-agnostic, one tap to enter; PAPER N5 wave A,
   ruling `gm-own-screens-concept`, DECISIONS D-74) — the board's tree, frames A3 (390) · A7 (1440) of
   lab/holocron/gm.html @ lab 11c96675: ONE tree for both bands, laid out by lib/shared/gm.css's `@container gm`.
   The root is the paper ground (R-GOS-4): `data-doc-ground` fences the kit (paper.css) to it and `data-gm-shell`
   fences gm.css. B-1107 the shell; B-1108 the masthead (the wordmark alone — the warp dropped, D-74) and the doors
   (`CARDS` and `DOOR.gm`), the grid keeping `data-tour-id="g-landing-cards"` and the tiles `<button>`s (R-GOS-5).
   `data-see` is the board's own attribute, carried verbatim (nothing in the lab or the product reads it). The one
   face since the deletion lap (ruling `paper-n5-deletion` R-N5D-1/2): the dark body, its warp and the switch that
   chose between them are gone; this is the body under the mounted name.
══════════════════════════════════════════════════════ */
function GmLanding({ onEnter }) {
  // F-100 C2 · the fifth door (F10-GM) joins only while swrpg_homebrew_editor is on;
  // five tiles make the last one span the row (gm.css `.gm-tile:last-child:nth-child(odd)`).
  var doors = CARDS.concat(encountersOn() ? [ENCOUNTERS_CARD] : []).concat(campaignsOn() ? [CAMPAIGNS_CARD] : []).concat(window.SWRPGEditor && window.SWRPGEditor.on() && window.SWRPGEditorView
    ? [Object.assign({ id: 'homebrew' }, window.SWRPGEditorView.DOOR.gm)] : []);
  return (
    <main className="gm-main hp-sheet" data-doc-ground="creator" data-gm-shell="1">
      <div className="gm-land">
        <div className="gm-mast" data-warp="0">
          <h1 className="hp-desig gm-word">GAME MASTER HOLOCRON</h1>
          <div className="hp-desig-rule" />
          <div className="gm-tag">{'OPEN THE GALAXY MAP'}</div>
        </div>
        <div className="gm-land-doors">
          <div className="gm-tiles" data-tour-id="g-landing-cards">
            {doors.map(function (card) {
              return (
                <button key={card.id} type="button" className="hp-plate gm-tile" data-pad="data" data-see="1"
                  data-door={card.id} onClick={function () { onEnter(card.id); }}>
                  <span className="gm-tile-eye">{card.eyebrow}</span>
                  <span className="gm-tile-name">{card.label}</span>
                  <span className="gm-chev" aria-hidden="true">{'›'}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* B-1109 · THE FOOTER (LIVE-vs-DRAWN 3): the Ko-fi line rehomed from the deleted hub (D-72, R-WA-4) as the
            board's paper text link — the hub's words, href and aria; the image goes (D-74) — then the notice and the
            glyph credit. */}
        <footer className="gm-foot">
          {(window.SWRPGSiteSettings || {}).KOFI_URL ? (
            <div className="gm-kofi">
              <a className="hp-quiet gm-kofi-a" href={window.SWRPGSiteSettings.KOFI_URL} target="_blank" rel="noopener noreferrer"
                aria-label="Support on Ko-fi (opens in a new tab)">{'Support on Ko-fi ↗'}</a>
            </div>
          ) : null}
          <p className="gm-fine">A fan-made tool for FFG Star Wars Roleplaying. Not affiliated with or endorsed by Fantasy Flight Games or Lucasfilm Ltd.</p>
          {window.SWRPGGlyphs ? <p className="gm-fine">{window.SWRPGGlyphs.CREDIT_LINE}</p> : null}
        </footer>
      </div>
    </main>
  );
}

// GM SHARED PRIMITIVES — SectionHeader, StatBox, PrimaryButton → window.SWRPGUI (lib/shared/ui.jsx), destructured at
// top. [Phase 1b]

/* ══════════════════════════════════════════════════════
   ALLIES & ADVERSARIES (NPC Library) SCREEN
   Uses lib/npc/createEmptyNpc.js + lib/npc/NpcGeneratorController.js.
   GmLanding shows interleaved drawer + shelf cards; tapping a drawer
   opens a two-column master-detail; tapping a shelf opens a flat list.
══════════════════════════════════════════════════════ */
// NPC_ACCENT → window.SWRPGLibrary.NPC (lib/library/npc/view.jsx), destructured at top. [NPC Step 0]

// K9, the Ship Yard's switch, GM side, is RETIRED (the player's twin note sits in player/app.jsx): at the S5 flip (ruling
// `shipyard-s5-ready` R-S5R-18, R-S5R-20) the S4 Yard is the only Yard and nothing reads or writes the switch's key.
// The resolver's context (lib/shared/vesselResolve.js `ctx`). B-1067 · F2 (ruling `shipyard-s5-ready` R-S5R-2): the GM
// device's characters — the same `swrpg_saved_characters` read as `gmDeviceRoster` — through the ONE builder both hosts call
// (vesselView.jsx `deviceResolveCtx`), so a Signature Vehicle's Custom Loadout reaches a GM face when the GM's device holds the
// holder, and the GM's number is the player's. None on a GM-only device.
function yardResolveCtx() {
  var VV = window.SWRPGVesselView;
  return VV && VV.deviceResolveCtx ? VV.deviceResolveCtx([]) : { characters: [] };
}

// F-100 M5 C4 · THE SHEET'S STAMP VIEW, registered at boot (ruling `f100-m5-contracts` ADDENDUM 3, A3-2): the ONE wrapper
// both apps load (lib/shared/talentView.js). With it registered, a character's talent numbers and dice resolve through
// that character's own house rules here exactly as on the player's sheet — the no-compromise mirror. The base it reads
// arrives with the Yard's character core below (A3-3); until then, and for a stamped pack not on this device, the view
// is NULL and each consumer takes the player's own fallback (A3-4). This line is the GM's registration; player/app.jsx
// carries the player's.
window.SWRPGTalentView.register();
// R6 lane D (ruling release-r6-bases-registry Q7): the group record's engine reader — CharResolve reads a member's group
// grants (career skills, the Mentor's kind, the AoR base's credits) through it. Dark: nothing writes a group yet.
if (window.SWRPGParty && window.SWRPGParty.registerEngineReader) window.SWRPGParty.registerEngineReader(window.CharResolve);

// SHIP YARD S4 · THE YARD'S CHARACTER CORE, GM side (ruling `shipyard-s4-ship-pool-path` R-S4PP-3, R-S4PP-7, R-S4PP-8;
// `shipyard-s4-collection` R-S4CO-4, R-S4CO-7). A character's seat pool and portrait come from the SAME modules the
// player app loads — the sheet's dice path (lib/shared/sheetPool.js) and the portrait lookup (portraits.js) — never a
// GM copy. The GM app loads NONE of them at boot, so the boot pays nothing for the Yard: the Yard injects them, in the order
// their free names need (the one JSON fetch, the portrait lookup, the pool-mods assembler, the dice path; then the ONE
// picture helper a ship's picture is re-encoded by, R-S4G-16), the first
// time it mounts, then loads what the dice path reads (the charbuild view, the item registries, the
// portrait index). ONE promise; a failure is logged and the next mount tries again.
var _yardCharCore = null;
function ensureYardCharCore() {
  if (_yardCharCore) return _yardCharCore;
  function inject(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  _yardCharCore = ['/lib/shared/fetchJson.js', '/lib/shared/portraits.js', '/lib/shared/poolMods.js', '/lib/shared/sheetPool.js', '/lib/shared/picture.js']
    .reduce(function (p, src) { return p.then(function () { return inject(src); }); }, Promise.resolve())
    .then(function () { return Promise.all([window.SWRPGSheetPool.loadCanonicalCharacterBuild(), window.SWRPGItemRegistries.load(), window.SWRPGPortraits.ready]); })
    .then(function () { return true; })
    .catch(function (err) { console.warn('[yard] the character core did not load; seat pools and portraits wait:', err); _yardCharCore = null; return false; });
  return _yardCharCore;
}
// true once the core is in; the Yard's faces draw a character's pool and portrait only then (no poorer stand-in)
function useYardCharCore() {
  const [ready, setReady] = useState(!!(window.SWRPGSheetPool && window.SWRPGPortraits && window._canonicalCharbuild));
  useEffect(function () {
    var live = true;
    ensureYardCharCore().then(function (ok) { if (live && ok) setReady(true); });
    return function () { live = false; };
  }, []);
  return ready;
}

// ENCOUNTERS E3 lap B — the encounter manager's core, injected the first time a switch-on surface asks: the Yard's
// character core (the ONE sheet pool path and the pool-mods assembler a PC's pool and a crit's +10s come through), then
// the dice surface whose inlineSurface every dice plate opens. ONE promise, a failure retried on the next ask.
// THE GM's quality vocabulary, built ONE way (ruling `encounters-e3-npc-press` ADDENDUM 1 Q-D): the lower-cased label and
// alias map the store's chips read, on `window._qualitiesDb`. The store screen and the encounter core both call this, so a
// store visit and an NPC's roll read one shape. ONE fetch in flight; a failure is thrown to the caller and the next ask retries.
var _qualitiesLoad = null;
function loadQualitiesDb() {
  if (window._qualitiesDb) return Promise.resolve(window._qualitiesDb);
  if (_qualitiesLoad) return _qualitiesLoad;
  _qualitiesLoad = fetch('public/data/canonical/qualities.vocab.json')
    .then(function (r) { if (!r.ok) throw new Error('qualities.vocab.json ' + r.status); return r.json(); })
    .then(function (v) {
      var map = {};
      (v.entries || []).forEach(function (q) {
        map[q.label.toLowerCase()] = q;
        (q.aliases || []).forEach(function (a) { map[String(a).toLowerCase()] = q; });
      });
      window._qualitiesDb = map;
      return map;
    })
    .catch(function (err) { _qualitiesLoad = null; throw err; });
  return _qualitiesLoad;
}

var _encCore = null;
function ensureEncounterCore() {
  if (_encCore) return _encCore;
  // the NPC arm folds a weapon's qualities only with the vocabulary in (sheetPool.js weaponPoolOf), so it joins the one promise
  _encCore = ensureYardCharCore().then(function (ok) {
    if (!ok) throw new Error('the character core did not load');
    return loadQualitiesDb();
  }).then(function () {
    if (window.SWRPGDice && window.SWRPGDice.inlineSurface) return true;
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/lib/dice/diceSurface.js'; s.async = false;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('could not load /lib/dice/diceSurface.js')); };
      document.head.appendChild(s);
    });
  }).catch(function (err) { console.warn('[encounters] the core did not load; rolls wait:', err); _encCore = null; return false; });
  return _encCore;
}

// ENCOUNTERS E6 frames — THIN HOST for the shared CAMPAIGNS screens (lib/shared/campaignsView.jsx), GM face.
function GmCampaignsScreen({ campId, wipeType, onBack, go }) {
  return h(window.SWRPGCampaignsView.Campaigns, {
    role: 'gm', route: campId ? { id: campId } : {}, go: go, onBack: onBack,
    wipeType: wipeType,
    // the LOG's names (G3): a fight by its bench group (its label kept by the log if the group is gone: 'Encounter'),
    // a crit by the bench's own table (SWRPGLibrary.NPC's loader and reader, one copy)
    encounterName: function (gid) { var B = window.NpcBenchStore, g = B ? (B.load().groups || []).filter(function (x) { return x.id === gid; })[0] : null; return g ? g.name : ''; },
    critName: function (roll) { var N = window.SWRPGLibrary && window.SWRPGLibrary.NPC; return N && N.critNameOf ? N.critNameOf(roll) : ''; },
    loadCrits: function () { var N = window.SWRPGLibrary && window.SWRPGLibrary.NPC; return N && N.loadCritRows ? N.loadCritRows() : Promise.resolve(null); },
    // D8 (D-543): the CAST's rows and its add search, through the library's one pool loader
    loadCast: function () { var N = window.SWRPGLibrary && window.SWRPGLibrary.NPC; return N && N.loadCastPool ? N.loadCastPool() : Promise.resolve(null); },
    npcOf: function (k) { var N = window.SWRPGLibrary && window.SWRPGLibrary.NPC; return N && N.castNpcOf ? N.castNpcOf(k) : null; },
    npcSearch: function (q) { var N = window.SWRPGLibrary && window.SWRPGLibrary.NPC; return N && N.castSearch ? N.castSearch(q) : []; },
  });
}
function NpcGeneratorScreen({ onBack, wipeType, location, onLocation, encounters }) {
  // NPC exemplar Step 1 — THIN HOST. The orchestrator (state machine + handlers + refData) lives in
  // window.SWRPGLibrary.NPC.Library (the headless core); the GM mounts it. Since the flip's deletion ledger
  // (B-871) the library has ONE face, paper, and draws its own head, tabs and rail — no chrome is injected.
  return h(window.SWRPGLibrary.NPC.Library, {
    onBack: onBack,
    wipeType: wipeType,
    accent: NPC_ACCENT,
    actions: null,
    // NPC bench (D-NB3) + custom NPCs (Lap C1): GM-only in v1 — persistent groups + custom NPCs.
    // ENCOUNTERS E3 lap B (R-E3S-1): `encounters` is null while swrpg_encounters_door is off (today), 'door' on the library
    // (the ENCOUNTERS tab goes), 'screen' on the encounter manager's own screen.
    // B-1835 (encounters-e3-flip-gate ADDENDUM 6): the core goes to EVERY mount — the library's WEAPONS row draws its pool
    // through the same arm the encounter's plate does (weaponPoolOf opts.npc), which wants sheetPool and the qualities vocabulary.
    capabilities: { canManageGroups: true, canManageCast: true, encounters: encounters || null,
      encounterCore: ensureEncounterCore },
    location: location,             // B-863: the /gm/npc tail (R-NPC-4)
    onLocation: onLocation,
  });
}

/* ── NPC sub-views ─────────────────────────────────────── */

/* Walk the taxonomy tree to find a node by id and return its label.
   Returns the id itself if no match. */

/* ──────────────────────────────────────────────────────
   NpcLibraryDrillDownView — full-width sub-affiliation
   list for the selected drawer.
────────────────────────────────────────────────────── */
// Vet UI fix: shared breadcrumb. Renders "ALLIES > GALACTIC EMPIRE > Imperial Military"
// with each segment tappable (except current). Per-faction accent on the current segment.
function GmDicePool({ charValue, skillRank }) {
  const pool = ffgDicePool(charValue, skillRank);
  if (pool.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
      {pool.map((type, i) => {
        const color = type === 'proficiency' ? '#FFC107' : '#4CAF50';
        const gradId = type + i;
        return type === 'proficiency' ? (
          <svg key={i} width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <rect x="2.5" y="2.5" width="9" height="9" rx="1.5"
              transform="rotate(45 7 7)"
              fill={`url(#${gradId})`}
              stroke={color} strokeWidth="1" strokeOpacity="0.7"
            />
          </svg>
        ) : (
          <svg key={i} width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <circle cx="7" cy="7" r="5"
              fill={`url(#${gradId})`}
              stroke={color} strokeWidth="1" strokeOpacity="0.7"
            />
          </svg>
        );
      })}
    </span>
  );
}

/* ── SKILL GRID — full table with characteristic + rank + dice pool ── */
function GmBehaviorRow({ label, text, accent }) {
  // Pipe text through renderDescription so FFG tokens like :setback:, :boost:,
  // :threat:, :despair:, :triumph:, :advantage: render as Genesys glyphs.
  // Previously only weapon-quality text was rendered — talents/abilities
  // showed "blank spaces where Threat/Despair glyphs should be" (NPC-vet r1).
  const rendered = typeof text === 'string' ? renderDescription(text) : text;
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-xs)',
        letterSpacing: '0.18em', color: accent, opacity: 0.7,
        marginBottom: '3px',
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.55,
        color: 'rgba(255,255,255,0.7)',
      }}>{rendered || text}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   THE STORE (GM face) — STORE-UNIFY. Mounts the ONE shared store kernel
   (window.SWRPGStore.Store, lib/store/view.jsx) with face='gm': the same grid,
   item detail, art ladder + BYOA the player face has, plus the GM-only pieces —
   the location MASTHEAD (a world's circumstance drives every find-difficulty),
   per-card FIND lines, and THE SHELVES (named saved stock lists). The old random
   GENERATOR + its player-publish plumbing (SessionStoreScreen, lib/shopGenerator.js,
   swrpg_session_store_config, FindDifficultyChip, StoreNote) are RETIRED here —
   no-compromise-reimplementation law: the kernel is the single source. (R-SU1/2/3.)
══════════════════════════════════════════════════════ */
// Commerce gold — the store's own register (matches the kernel's GM accent default).
const STORE_ACCENT = '#F5C842';

// The contextual store bar reuses the kernel's own silhouette glyphs (so the GM bar reads exactly
// like the player's), with a count bubble on SHELVES. Mirrors player/app.jsx storeGlyph/navBadge.
function gmStoreGlyph(family) {
  var S = window.SWRPGStore;
  return S && S.glyph ? S.glyph(family, 20) : navIcon('shopping-cart');
}
// B-1123 — the player's `navBadge` device on paper (B-679): the paper tab draws its own positioned `.pb-mark`, so
// the badge comes WITHOUT a wrapper, as chrome.css's `.pb-badge`. The count and its 99 cap do not move.
function gmNavBadge(icon, count) {
  return <React.Fragment>{icon}{count > 0 ? <span aria-hidden="true" className="pb-badge">{count > 99 ? '99' : count}</span> : null}</React.Fragment>;
}

// The store section tab + counts live in GmApp (so the bottom bar can BE the store bar); this screen
// receives `tab` + `onCounts` and mounts the kernel. It renders NO section tabs of its own — the
// kernel's sub-category chips are the only in-surface pills.
function GMStoreScreen({ wipeType, tab, onCounts }) {
  const dur = WIPE_DURATIONS[wipeType] ?? 1.3;
  const [qualitiesDb, setQualitiesDb] = React.useState(null);

  // Quality-chip labels for the overlay (recon §G gap: the GM app had no _qualitiesDb
  // loader). Non-blocking — null just leaves chips unlabeled. Mirrors the player loader.
  React.useEffect(() => {
    let alive = true;
    loadQualitiesDb().then(map => { if (alive) setQualitiesDb(map); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // B-1123 (R-GOS-28 c) — the kernel draws its paper face over the store's own ground (no shell black), as the
  // toolbox's does (B-1107); the way back rides the SuiteBar's store context (GmApp, D-76 "Paper bars").
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: `${wipeType} ${dur}s ease forwards`,
    }}>
      {window.SWRPGStore ? React.createElement(window.SWRPGStore.Store, {
        face: 'gm',
        accent: STORE_ACCENT,
        tab: tab || 'weapons',
        qualitiesDb: qualitiesDb,
        onCounts: onCounts,
      }) : (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)',
        }}>STORE MODULE NOT LOADED</div>
      )}
    </div>
  );
}


// P0 hotfix 2026-06-12: this constant lived inside the banner comment block the
// teardown above deleted (19f3253) — 8 surviving refs crashed the map on mount
// for ten days. Restored next to its consumer so it can't go collateral again.
const MAP_ACCENT = HOLOCRON_ACCENT;

// Error boundary for the Universe Map subtree. A render-time crash in the map
// (e.g. the MAP_ACCENT regression that white-screened the whole GM app, or a
// Leaflet mount failure) is contained here and shown as a recoverable panel
// instead of taking down the app. Its looks come from a stylesheet (map.css), never
// from the JS that broke. Class component because error boundaries require the lifecycle hooks.
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error };
  }
  componentDidCatch(error, info) {
    console.error('[UniverseMap] render crash contained by boundary', error, info);
  }
  render() {
    if (this.state.error) {
      const msg = (this.state.error && this.state.error.message) || 'Unknown error';
      // B-1154 (R-UMP-6; F3/F5) — the board's boundary, the same words and the same way back, at 44px. It stands
      // ABOVE the screen's shell (this class wraps it), so it carries its own `[data-map-shell]` for map.css's fence,
      // fixed over the whole screen. Its inks are the ground's tokens from a stylesheet — not the JS that broke.
      return (
        <div className="mp-app" data-map-shell="1" data-ground="A" style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="mp-boundary" data-paper-chrome="1" data-doc-ground="creator" role="alert">
            <div className="mp-bd-h">UNIVERSE MAP UNAVAILABLE</div>
            <div className="mp-bd-s">
              The star map hit a snag and couldn't render. The rest of the Holocron
              is unaffected — head back and try again.
            </div>
            <div className="mp-bd-m">{msg}</div>
            <button className="mp-bd-b" type="button" onClick={this.props.onBack}>← BACK TO HOLOCRON</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function UniverseMapScreen({ onBack, wipeType }) {
  const swipe = useSwipeBack(onBack);
  const dur = WIPE_DURATIONS[wipeType] ?? 1.3;

  const [planets, setPlanets]           = useState(null);
  const [routes, setRoutes]             = useState(null);
  const [loadError, setLoadError]       = useState(null);
  const [showGrid, setShowGrid]         = useState(false);
  const [selectedPlanet, setSelected]   = useState(null);

  // F-5 MAP PINS (concept `map-pins-concept.md`). The map remembers where the campaign has been:
  // pins live in `swrpg_map_pins` (window.GmMapPins), keyed by canonical planet id. Loaded once on
  // mount; every write goes through `writePins` so the React state and localStorage cannot diverge.
  const MapPins = window.GmMapPins;
  // B-1732: read at the act, a landing redraws (lib/shared/heldStore.js).
  const heldPins = window.SWRPGHeldStore.use({ key: MapPins ? MapPins.KEY : 'swrpg_map_pins',
    load: () => (MapPins ? MapPins.load() : { version: 1, pins: {} }), persist: (next) => { if (MapPins) MapPins.persist(next); } });
  const pins = heldPins.state;
  const [pinnedOnly, setPinnedOnly]     = useState(false);
  const writePins = heldPins.apply;
  // Era lore now lives in the planet drawer itself (per-planet era chips in
  // EnrichedPlanetDetailSheet) — the old global era switch was removed: each
  // planet shows only the eras it actually has era_variants for, instead of a
  // galaxy-wide toggle whose labels mostly had no data behind them.

  // Chunk 9: enriched sheet — lazy-loaded deep planet records.
  const planetRecordCache = useRef({});
  const [sheetRecord, setSheetRecord] = useState(null);
  const [sheetRecordStatus, setSheetRecordStatus] = useState('idle'); // idle | loading | ready | nav-only | error

  // Chunk 9: route planner — overlay visibility + current route result +
  // Leaflet layer refs + Dijkstra nav graph (built once).
  const [routeOpen, setRouteOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);   // Hyperspace Run mini-game overlay
  const mapRef = useRef(null);                    // live Leaflet instance from onMapReady
  const flyingRef = useRef(false);                // a search pick's flyTo is in flight (B-1153's desk pan waits)
  const shellRef = useRef(null);
  // B-1153 (R-UMP-5) — the desk: the GM store's own read (`useStoreBand` over `useLayoutMode()`, the 1024 seam), so
  // the GM's paper surfaces turn desk together.
  const layoutMode = useLayoutMode();
  const desk = layoutMode === 'desktop';
  const navGraphRef = useRef(null);               // built from buildNavGraph
  const routeLayerRef = useRef({});               // { glow, startMarker, endMarker, segments }

  // Load planet + route data on mount. Both files are ~25KB + ~619KB,
  // so we fetch them in parallel.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('public/data/gdr_planets_mapped.json').then(r => r.json()),
      fetch('public/data/gdr_routes_final.json').then(r => r.json()),
    ])
      .then(([p, r]) => {
        if (cancelled) return;
        setPlanets(p);
        setRoutes(r);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[UniverseMap] data load failed', err);
        setLoadError(err && err.message ? err.message : 'Unknown error');
      });
    return () => { cancelled = true; };
  }, []);

  // Chunk 9: build the Dijkstra nav graph once planets+routes both land.
  // ~10ms on modern browsers. Stored in a ref so findRoute calls don't
  // trigger re-renders.
  useEffect(() => {
    if (!planets || !routes) return;
    if (!window.GmPathfinding || !window.GmPathfinding.buildNavGraph) return;
    navGraphRef.current = window.GmPathfinding.buildNavGraph(planets, routes);
  }, [planets, routes]);

  // Leaflet occasionally miscomputes its container size when mounted inside
  // an animated (clip-path wipe) parent. Invalidate on ready + once after
  // the wipe settles so tiles redraw at the correct dimensions.
  // Chunk 9: also store the map ref for flyTo + route drawing.
  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
    const nudge = () => { try { map.invalidateSize(); } catch (e) {} };
    setTimeout(nudge, 50);
    setTimeout(nudge, dur * 1000 + 100);
  }, [dur]);

  // Chunk 9: lazy-load the deep planet record for the enriched sheet.
  // Cached per planet via useRef Map. Uses the Encounter Generator's
  // record_depth pre-filter to skip fetches for nav-only planets.
  const loadPlanetRecord = useCallback((planet) => {
    if (!planet) return;
    const shouldFetch = planet.record_depth === 'full' || planet.record_depth === 'identity';
    if (!shouldFetch) {
      setSheetRecord(null);
      setSheetRecordStatus('nav-only');
      return;
    }
    // ONE identity function (F-5; B-1131): GmMapPins.planetKey, so the record fetch and the pin store cannot drift
    // apart — no inline fallback restates it (mapPins.js loads before this bundle, gm/index.html).
    const pid = MapPins.planetKey(planet);
    const cached = planetRecordCache.current[pid];
    if (cached) {
      if (cached === 'error') { setSheetRecord(null); setSheetRecordStatus('error'); return; }
      setSheetRecord(cached); setSheetRecordStatus('ready'); return;
    }
    setSheetRecord(null);
    setSheetRecordStatus('loading');
    fetch(`public/data/planets/${pid}.json`)
      .then(r => { if (!r.ok) throw new Error('no_record'); return r.json(); })
      .then(rec => {
        planetRecordCache.current[pid] = rec;
        setSheetRecord(rec);
        setSheetRecordStatus('ready');
      })
      .catch(() => {
        planetRecordCache.current[pid] = 'error';
        setSheetRecord(null);
        setSheetRecordStatus('error');
      });
  }, [MapPins]);

  // Chunk 9: open the sheet for a planet. Used by both planet marker
  // taps (via onPlanetSelect) and the search bar's onPick.
  const handleSelectPlanet = useCallback((planet) => {
    setSelected(planet);
    loadPlanetRecord(planet);
  }, [loadPlanetRecord]);

  const handleCloseSheet = useCallback(() => {
    setSelected(null);
    setSheetRecord(null);
    setSheetRecordStatus('idle');
  }, []);

  // Chunk 9: search bar pick — open the sheet AND fly the Leaflet map
  // to the planet's coordinates. CRS.Simple uses [y, x] for latLng.
  const handleSearchPick = useCallback((planet) => {
    handleSelectPlanet(planet);
    const map = mapRef.current;
    if (map && typeof planet.x === 'number' && typeof planet.y === 'number') {
      // Use a moderate target zoom so the planet is clearly in view.
      // Fly animation is smooth enough to not feel jarring.
      // B-1143 (R-UMP-7 b, both faces, disclosed): a world without a full or identity record is a navigation dot,
      // and those draw from zoom 1 (GalaxyMapView's tier 4) — so it flies to 1, where it is drawn; the others keep 0.
      const z = (planet.record_depth === 'full' || planet.record_depth === 'identity') ? 0 : 1;
      try {
        flyingRef.current = true;
        map.once('moveend', () => { flyingRef.current = false; });
        map.flyTo([planet.y, planet.x], z, { duration: 0.8 });
      } catch (e) { flyingRef.current = false; }
    }
  }, [handleSelectPlanet]);

  // Chunk 9: route drawing helpers. The UniverseMapRoutePanel is a pure
  // UI component that tells us when the route changes via a callback;
  // the parent manages the actual Leaflet layer lifecycle.
  const ensureCustomRoutePane = useCallback((map) => {
    if (!map.getPane('customRoutesPane')) {
      map.createPane('customRoutesPane');
      const pane = map.getPane('customRoutesPane');
      pane.style.zIndex = 450;
      pane.style.pointerEvents = 'none';
    }
  }, []);

  const clearRouteOverlay = useCallback(() => {
    const map = mapRef.current;
    const layers = routeLayerRef.current;
    if (!map) { routeLayerRef.current = {}; return; }
    // Per-segment polylines (UXQP-42) live in layers.segments.
    if (Array.isArray(layers.segments)) {
      layers.segments.forEach(ln => { try { map.removeLayer(ln); } catch (e) {} });
      layers.segments = null;
    }
    ['glow', 'startMarker', 'endMarker'].forEach(k => {
      if (layers[k]) { try { map.removeLayer(layers[k]); } catch (e) {} layers[k] = null; }
    });
  }, []);

  // B-1728 (`release-r7-bug-burndown` ADDENDUM 617): Back closes Route and the Hyperspace Run and keeps the map — the same
  // close their ✕/× calls, one place each. The Run's Back ends the run exactly as its × does (no pause, no prompt; D-171).
  const closeRoute = useCallback(() => { setRouteOpen(false); clearRouteOverlay(); }, [clearRouteOverlay]);
  const closeGame = useCallback(() => setGameOpen(false), []);
  useBackToClose(routeOpen, closeRoute);
  useBackToClose(gameOpen && !!window.HyperspaceRunGame, closeGame);

  const drawRouteOverlay = useCallback((routeResult) => {
    const map = mapRef.current;
    if (!map || !routeResult || !planets || !window.L) return;
    clearRouteOverlay();
    ensureCustomRoutePane(map);

    // Resolve the path of planet names back to [y, x] coordinate pairs.
    const planetByName = {};
    planets.forEach(p => { planetByName[p.name] = p; });
    const xy = (name) => {
      const p = planetByName[name];
      return (p && typeof p.x === 'number' && typeof p.y === 'number') ? [p.y, p.x] : null;
    };
    const coords = (routeResult.path || []).map(name => planetByName[name])
      .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
      .map(p => [p.y, p.x]);
    if (coords.length < 2) return;

    // UXQP-42: draw per-segment so wild-space legs render DASHED and slightly
    // amber-tinted vs the solid violet lane spine.
    const extra = [];
    const segments = routeResult.segments || [];
    // Wide translucent glow under the whole path (both lane + wild-space).
    const glow = window.L.polyline(coords, {
      pane: 'customRoutesPane', color: '#B080FF', weight: 12, opacity: 0.22, interactive: false,
    }).addTo(map);
    segments.forEach(seg => {
      const a = xy(seg.from), b = xy(seg.to);
      if (!a || !b) return;
      extra.push(window.L.polyline([a, b], {
        pane: 'customRoutesPane',
        color: seg.offLane ? '#FFC857' : '#B080FF',
        weight: 3,
        opacity: seg.offLane ? 0.95 : 0.92,
        dashArray: seg.offLane ? '6 7' : null,
        interactive: false,
      }).addTo(map));
    });

    // Start + end diamond markers.
    const makeDiamond = (latlng) => {
      const icon = window.L.divIcon({
        html: '<div style="width:14px;height:14px;background:#B080FF;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 0 14px #B080FF"></div>',
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      return window.L.marker(latlng, { pane: 'customRoutesPane', icon: icon, interactive: false }).addTo(map);
    };
    const startMarker = makeDiamond(coords[0]);
    const endMarker = makeDiamond(coords[coords.length - 1]);

    routeLayerRef.current = { glow, startMarker, endMarker, segments: extra };
  }, [planets, ensureCustomRoutePane, clearRouteOverlay]);

  // Callback handed to the route panel — it emits the latest route result
  // (or null to clear) on every dependency change.
  const handleRouteChange = useCallback((routeResult) => {
    if (routeResult && Array.isArray(routeResult.path) && routeResult.path.length >= 2) {
      drawRouteOverlay(routeResult);
    } else {
      clearRouteOverlay();
    }
  }, [drawRouteOverlay, clearRouteOverlay]);

  // Safety cleanup: if the screen unmounts (back to hub), nuke any
  // stray overlay layers so they don't leak into a future mount.
  useEffect(() => {
    return () => {
      clearRouteOverlay();
    };
  }, [clearRouteOverlay]);

  const ready = planets && routes && !loadError;

  // F-5 derived pin values.
  //
  // The filter's count is the number of pins that RESOLVE TO A WORLD ON THIS MAP, not the raw store
  // size. Those differ exactly when the store holds an id this build no longer ships — and "PINNED
  // (4)" over a map showing three nodes is the kind of small lie that costs trust. The unresolved
  // entry is still there in the save; it just isn't claimed on screen.
  const pinnedPlanets = useMemo(() => {
    if (!ready || !MapPins) return [];
    return planets.filter(p => MapPins.isPinned(pins, MapPins.planetKey(p)));
  }, [ready, planets, pins, MapPins]);
  const pinnedIds = useMemo(() => (MapPins ? pinnedPlanets.map(p => MapPins.planetKey(p)) : []), [pinnedPlanets, MapPins]);
  const selectedKey = (MapPins && selectedPlanet) ? MapPins.planetKey(selectedPlanet) : '';
  const selectedPin = (MapPins && selectedPlanet) ? MapPins.getPin(pins, selectedKey) : null;

  const handleTogglePin = useCallback(() => {
    if (!MapPins || !selectedPlanet) return;
    writePins((cur) => MapPins.togglePin(cur, MapPins.planetKey(selectedPlanet)));
  }, [MapPins, selectedPlanet, writePins]);

  const handlePinNote = useCallback((note) => {
    if (!MapPins || !selectedPlanet) return;
    writePins((cur) => MapPins.setNote(cur, MapPins.planetKey(selectedPlanet), note));
  }, [MapPins, selectedPlanet, writePins]);

  // B-1153 (R-UMP-5) — THE DESK PAN: the panel lies over the chart's right 460px, so the picked world is kept in view
  // to its LEFT — if the world's point falls under (or within 32px of) the panel, the map pans it to the middle of the
  // free chart. A search pick's fly lands first (its `moveend`), then the pan. A behaviour of the desk panel only.
  useEffect(() => {
    if (!desk || !selectedPlanet) return;
    const map = mapRef.current;
    if (!map || typeof selectedPlanet.x !== 'number' || typeof selectedPlanet.y !== 'number') return;
    let live = true;
    const pan = () => {
      if (!live || !shellRef.current) return;
      const sheet = shellRef.current.querySelector('.mp-sheet');
      if (!sheet) return;
      const box = map.getContainer().getBoundingClientRect();
      const free = sheet.getBoundingClientRect().left - box.left;
      const pt = map.latLngToContainerPoint([selectedPlanet.y, selectedPlanet.x]);
      if (pt.x > free - 32 || pt.x < 0) {
        try { map.panBy([pt.x - free / 2, 0]); } catch (e) { /* ignore */ }
      }
    };
    if (flyingRef.current) map.once('moveend', pan); else pan();
    return () => { live = false; map.off('moveend', pan); };
  }, [desk, selectedPlanet]);

  // B-1149 (R-UMP-1) — the map's chrome is paper and the chart is not: the root carries the `[data-map-shell]`
  // fence (lib/shared/map.css) and the ground's tokens, and keeps the chart's dark gradient (`data-ground="A"`,
  // D-79 Q2 = A).
  const subtitle = ready ? `${planets.length.toLocaleString()} WORLDS · ${routes.length} ROUTES` : null;
  return (
    <div
      className="mp-app"
      data-map-shell="1"
      data-doc-ground="creator"
      data-ground="A"
      data-desk={desk ? '1' : undefined}
      ref={shellRef}
      style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #030a14 0%, #000205 100%)',
        animation: `${wipeType} ${dur}s cubic-bezier(0.42,0,0.18,1) forwards`,
        zIndex: 20,
        display: 'flex', flexDirection: 'column',
      }}
      {...swipe}
    >
      {/* The map's own head on paper (A1/A3 — BACK, the title, the count in the muted ink, the bars' raised
          stock). */}
      <header className="mp-head" data-paper-chrome="1">
        <div className="mp-head-row">
          <button className="mp-back" type="button" aria-label="Go back" onClick={onBack}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><polyline points="13,4 7,10 13,16" /></svg>
            <span>BACK</span>
          </button>
          <div className="mp-title">
            <div className="mp-title-t">UNIVERSE MAP</div>
            {subtitle && <div className="mp-title-s">{subtitle}</div>}
          </div>
          <div className="mp-spacer" />
        </div>
      </header>

      {/* Body: map fills remaining space */}
      <div style={{
        flex: 1, position: 'relative',
        // Hard-contain so the Leaflet root (inset:0) sizes against this box.
        overflow: 'hidden',
      }}>
        {/* B-1154 (R-UMP-6; F1/F2/F4) — the screen states on paper: the board's `.mp-state` lines over the kept chart
            ground (D-79 Q2 = A), the same words; the pill and the menu wait for the data. */}
        {loadError && (
          <div className="mp-state">
            <div>
              <div className="mp-state-k mp-state-err">STARCHART OFFLINE</div>
              <div className="mp-state-m">{loadError}</div>
            </div>
          </div>
        )}


        {!loadError && !ready && (
          <div className="mp-state" role="status" aria-live="polite">
            <div className="mp-state-k">LOADING STARCHART…</div>
          </div>
        )}


        {ready && (
          <GalaxyMapView
            accent={MAP_ACCENT}
            planets={planets}
            routes={routes}
            showGrid={showGrid}
            pinnedIds={pinnedIds}
            pinnedOnly={pinnedOnly}
            onPlanetSelect={handleSelectPlanet}
            onMapReady={handleMapReady}
          />
        )}

        {/* F-5: the PINNED filter on with nothing to show. An empty starfield with no explanation
            reads as a broken map; this says what happened and where the pin control lives. */}
        {/* B-1151 (R-UMP-3; C4/C5): on paper the notice is a card on the chart, the app's two lines. */}
        {ready && pinnedOnly && pinnedPlanets.length === 0 && (
          <div className="mp-state mp-state-over" role="status" aria-live="polite">
            <div className="mp-notice">
              <div className="mp-notice-k">NO PINNED WORLDS</div>
            </div>
          </div>
        )}

        {/* Chunk 9: search bar — top-left floating pill */}
        {ready && (
          <div className="mp-float mp-fl" data-paper-chrome="1">
            <UniverseMapSearchBar planets={planets} onPick={handleSearchPick} accent={MAP_ACCENT} />
          </div>
        )}

        {/* Map controls (nav 3b-ii) — the bespoke toolbar rolled into the shared ModuleMenu. Lives in the
            map's OWN chrome (top-right), which survives the immersive bar-hide; Back-closes like the dice menu. */}
        {ready && (() => {
          const mapControls = [
            { id: 'grid', label: 'Grid', kind: 'toggle', value: showGrid, onToggle: () => setShowGrid(v => !v) },
            // F-5: the campaign's travel log, as a view of the map it is already drawn on. Rides
            // the EXISTING Map controls menu — no new screen, no new route (concept §2/§3).
            { id: 'pinned', label: `PINNED (${pinnedPlanets.length})`, kind: 'toggle', value: pinnedOnly, onToggle: () => setPinnedOnly(v => !v) },
            { id: 'route', label: 'Route', kind: 'action', onSelect: () => setRouteOpen(true) },
            { id: 'hyperspace', label: 'Hyperspace Run', kind: 'action', onSelect: () => setGameOpen(true) },
          ];
          // B-1151 (R-UMP-3; C1/C2) — on paper the menu draws ITS OWN paper face (`paper`); `compact` with the word as
          // its icon keeps the trigger's inline style unset and its content the board's `<span>Map controls</span>`
          // (map.css dresses that trigger as the board's pill). Its toggles are switches (role + aria-checked).
          return (
            <div className="mp-float mp-fr" data-paper-chrome="1">
              <ModuleMenu paper compact label="Map controls" icon={<span>Map controls</span>} accent={MAP_ACCENT} items={mapControls} />
            </div>
          );
        })()}

        {/* Chunk 9: route planner overlay */}
        {ready && routeOpen && (
          <UniverseMapRoutePanel
            planets={planets}
            navGraph={navGraphRef.current}
            routes={routes}
            onClose={closeRoute}
            onRouteChange={handleRouteChange}
            accent={MAP_ACCENT}
          />
        )}

        {/* Chunk 9: enriched planet detail sheet */}
        {ready && selectedPlanet && (
          <EnrichedPlanetDetailSheet
            planet={selectedPlanet}
            record={sheetRecord}
            recordStatus={sheetRecordStatus}
            onClose={handleCloseSheet}
            accent={MAP_ACCENT}
            pin={selectedPin}
            onTogglePin={handleTogglePin}
            onPinNote={handlePinNote}
            noteMax={MapPins.NOTE_MAX}
            desk={desk}
          />
        )}

        {/* Hyperspace Run mini-game — overlay over the map (game mode) */}
        {ready && gameOpen && window.HyperspaceRunGame && (() => {
          const Game = window.HyperspaceRunGame;
          return (
            <Game
              planets={planets}
              routes={routes}
              graph={navGraphRef.current}
              onExit={closeGame}
            />
          );
        })()}
      </div>
    </div>
  );
}

// (MapToolbarButton REMOVED — nav 3b-ii: the map toolbar is now the shared ModuleMenu "Map controls".)

/* ══════════════════════════════════════════════════════
   Chunk 9 — Universe Map polish components

   Four components powering the enriched planet sheet, the
   search bar, and the A→B route planner. All composed out
   of primitives (SearchInput, SectionHeader, GmBehaviorRow)
   defined earlier in the file.
══════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────
   PlanetAutocompleteInput — shared primitive used by both
   UniverseMapSearchBar and both endpoint fields of
   UniverseMapRoutePanel. Case-insensitive startsWith-then-
   includes match, 12 result cap, keyboard Enter selects
   first match, Escape clears, click-outside collapses.
────────────────────────────────────────────────────── */
function PlanetAutocompleteInput({
  planets, value, onChange, onPick, placeholder, accent,
  autoFocus,
  listId, ariaLabel, labelledBy,
}) {
  const [query, setQuery] = useState(value || '');
  const [focused, setFocused] = useState(false);
  const ownListId = React.useId();
  const wrapRef = useRef(null);

  // Keep the internal query in sync with the external value (e.g. after
  // a flyTo result). Only update when `value` actually changes.
  useEffect(() => {
    if (value !== undefined && value !== null) setQuery(value);
  }, [value]);

  // Click-outside to collapse the dropdown.
  useEffect(() => {
    if (!focused) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [focused]);

  const matches = React.useMemo(() => {
    if (!planets || !query) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    const starts = [];
    const includes = [];
    for (const p of planets) {
      const n = (p.name || '').toLowerCase();
      if (!n) continue;
      if (n.startsWith(q)) starts.push(p);
      else if (n.includes(q)) includes.push(p);
      if (starts.length + includes.length >= 40) break;
    }
    return starts.concat(includes).slice(0, 12);
  }, [planets, query]);

  const handleChange = (next) => {
    setQuery(next);
    setFocused(true);
    if (onChange) onChange(next);
  };

  const handlePick = (planet) => {
    setQuery(planet.name);
    setFocused(false);
    if (onChange) onChange(planet.name);
    if (onPick) onPick(planet);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && matches.length > 0) {
      // B-1825 (ADDENDUM 631): the pick opens the planet sheet, which takes focus inside this same key event, so the Enter
      // is consumed here — else its activation lands on the sheet's first control (the handle, which closes it)
      e.preventDefault();
      handlePick(matches[0]);
    } else if (e.key === 'Escape') {
      setFocused(false);
      setQuery('');
      if (onChange) onChange('');
    }
  };

  // B-1150 / B-1152 (R-UMP-2, R-UMP-4; B-1133) — the paper face: a named COMBOBOX over a LISTBOX of OPTIONS (B1, D2).
  // The list stands IN FLOW under its field (the search card's, the planner's), never absolute; the first row is
  // the ACTIVE one because Enter picks it (as today). `autoFocus` is wired here (B-1130), on this face only.
  const lid = listId || ownListId;
  const open = focused && matches.length > 0;
  return (
    <div ref={wrapRef}>
      <div onFocus={() => setFocused(true)} onKeyDown={handleKeyDown}>
        <SearchInput
          value={query}
          onChange={handleChange}
          placeholder={placeholder || 'Search planets…'}
          accent={accent}
          inputProps={{
            role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': open ? 'true' : 'false',
            'aria-controls': open ? lid : undefined, 'aria-activedescendant': open ? `${lid}-0` : undefined,
            'aria-label': ariaLabel, 'aria-labelledby': labelledBy, autoFocus: !!autoFocus,
          }}
        />
      </div>
      {open && (
        <div className="mp-list hp-bands" role="listbox" id={lid}>
          {matches.map((p, i) => (
            <div
              key={p.planet_id || p.name}
              className="mp-opt"
              role="option"
              id={`${lid}-${i}`}
              aria-selected={i === 0 ? 'true' : 'false'}
              onMouseDown={(e) => { e.preventDefault(); handlePick(p); }}
            >
              <span className="mp-opt-n">{p.name}</span>
              <span className="mp-opt-m">
                {(p.region || '?').toUpperCase()}
                {p.sector ? ` · ${p.sector.toUpperCase()}` : ''}
                {(p.record_depth === 'full' || p.record_depth === 'identity') && (
                  <span className="mp-mk" data-d={p.record_depth}>{p.record_depth === 'full' ? '● FULL' : '● IDENTITY'}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   UniverseMapSearchBar — collapsible pill button + input.
   Tap to expand. Pick a planet → parent's onPick fires,
   which opens the planet sheet and flies the map.
────────────────────────────────────────────────────── */
function UniverseMapSearchBar({ planets, onPick, accent }) {
  const [expanded, setExpanded] = useState(false);
  // B-1129 (R-UMP-2, both faces, disclosed): the count is the loaded registry's, printed — never typed.
  const placeholder = `Search ${(planets ? planets.length : 0).toLocaleString()} planets…`;
  const listId = React.useId();
  const pillRef = useRef(null);
  const refocus = useRef(false);
  // A collapse the GM asked for (SEARCH, Escape) hands the focus back to the closed pill; a pick does not.
  useEffect(() => {
    if (!expanded && refocus.current && pillRef.current) { refocus.current = false; pillRef.current.focus(); }
  }, [expanded]);
  const collapse = () => { refocus.current = true; setExpanded(false); };
  useBackToClose(expanded, collapse);   // B-1728: Back collapses an open search, exactly as Escape does

  // B-1150 (R-UMP-2; B1, B2) — the paper face: the closed pill is a card on the chart; open, the pill stays as the
  // card's own collapse (SEARCH, aria-expanded) over the combobox and its list. Escape collapses it (B-1133).
  const mag = (
    <svg className="mp-mag" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" /><line x1="9.5" y1="9.5" x2="13" y2="13" />
    </svg>
  );
  if (!expanded) {
    return (
      <button ref={pillRef} className="mp-pill" type="button" aria-label="Search planets" aria-expanded="false"
        onClick={() => setExpanded(true)}>
        {mag}<span>SEARCH</span>
      </button>
    );
  }
  return (
    <div className="mp-search" onKeyDown={(e) => { if (e.key === 'Escape') collapse(); }}>
      <button className="mp-pill" type="button" aria-label="Search planets" aria-expanded="true" aria-controls={listId}
        onClick={collapse}>
        {mag}<span>SEARCH</span>
      </button>
      <PlanetAutocompleteInput
        listId={listId}
        ariaLabel="Search planets"
        planets={planets}
        placeholder={placeholder}
        accent={accent}
        autoFocus
        onPick={(p) => {
          setExpanded(false);
          if (onPick) onPick(p);
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   UniverseMapRoutePanel — A→B route planner overlay.
   Pure presentation: reports its current route result to
   the parent via onRouteChange. Parent handles the actual
   Leaflet polyline drawing.
────────────────────────────────────────────────────── */
// The planner's sentences, ONE spelling each for both faces (R-UMP-8: the app's words, verbatim).
const ROUTE_SAME_LINE = 'Start and end are the same planet.';
const ROUTE_WILD_NOTE = 'Part of this route runs off the mapped lanes (dashed) — slower, and it upgrades the astrogation check (difficulty to Average, +1 setback).';
const routeClassFoot = (c) => (c === 1 ? 'Class 1 baseline.' : '×' + c + ' the Class-1 time.') + ' Times scale by hyperdrive class (eote p.247).';
// F-40 (C-1, ruling map-yard-lap): the legs a route rides — consecutive same-lane segments collapse into one run;
// wild-space legs carry offLane. One reader for both faces.
const routeLegRuns = (segs) => {
  const runs = [];
  (segs || []).forEach(function (s) {
    var lane = s.offLane ? null : (s.lane || null);
    var last = runs[runs.length - 1];
    if (last && last.lane === lane && last.offLane === !!s.offLane) {
      last.to = s.to;
    } else {
      runs.push({ from: s.from, to: s.to, lane: lane, offLane: !!s.offLane });
    }
  });
  return runs;
};

function UniverseMapRoutePanel({
  planets, navGraph, routes,
  onClose,
  onRouteChange,   // (routeObj | null) => void
  accent,
}) {
  const ids = React.useId();   // the START / END / class labels' ids (paper face); above the fork
  const [startName, setStartName] = useState('');
  const [endName, setEndName] = useState('');
  // Hyperdrive class scales the travel-time bands (RAW: x Class, eote p.247).
  // Class 1 is the baseline the tables assume; the chips cover elite (0.5) through
  // common civilian (2-3) to clunkers (4). Does NOT touch the astrogation pool.
  const [hyperClass, setHyperClass] = useState(1);
  const HYPER_CLASSES = [0.5, 1, 2, 3, 4];

  // Compute the route whenever both fields resolve to valid planet names.
  // UXQP-42: routeUniversal always returns a path for two valid planets —
  // off-network endpoints get wild-space legs to/from the lane network, so
  // 'unreachable' no longer exists. Only an unknown name (can't happen via the
  // autocomplete, but guarded) yields an error.
  const routeResult = React.useMemo(() => {
    if (!navGraph || !startName || !endName) return null;
    if (!navGraph.has(startName) || !navGraph.has(endName)) return { error: 'unknown_planet' };
    const result = window.GmPathfinding.routeUniversal(navGraph, planets || [], routes || [], startName, endName);
    if (!result) return { error: 'unknown_planet' };
    if (result.samePlanet || result.path.length <= 1) {
      return { ok: true, result, travel: window.GmTravelTime.calculateUniversalTravelTime([], hyperClass), samePlanet: true };
    }
    const travel = window.GmTravelTime.calculateUniversalTravelTime(result.segments, hyperClass);
    return { ok: true, result, travel, samePlanet: false };
  }, [navGraph, planets, routes, startName, endName, hyperClass]);

  // Tell the parent when the drawable route changes.
  useEffect(() => {
    if (!onRouteChange) return;
    if (routeResult && routeResult.ok && !routeResult.samePlanet) {
      onRouteChange(routeResult.result);
    } else {
      onRouteChange(null);
    }
  }, [routeResult, onRouteChange]);

  // Clear the parent's route overlay when the panel unmounts.
  useEffect(() => {
    return () => {
      if (onRouteChange) onRouteChange(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFields = () => {
    setStartName('');
    setEndName('');
    if (onRouteChange) onRouteChange(null);
  };

  // B-1152 (R-UMP-4; D1–D7) — the paper face: a raised card with the app's words; the START/END lists stand IN FLOW
  // under their fields inside the card (B-1142 — the card scrolls as today, the list is never cut at its foot); the
  // class chips are 44px PRESSED buttons in a group named by their label (B-1133); the pips are the dice face's.
  const SYM = (window.SWRPGDice && window.SWRPGDice.SYMBOLS) || {};
  const pips = (key, n) => {
    // T3 (argo-a1-export ADDENDUM 6): without the dice font the pips are one word tag, the count, then the die
    const D = window.SWRPGDice || {};
    if (D.fontAbsent && D.fontAbsent()) return [D.dieTag(key, n, key + '-tag')];
    const sy = SYM[key]; const out = [];
    for (let i = 0; i < n; i++) out.push(
      <span key={key + i} className="mp-pip" data-die={key} aria-hidden="true">{(sy && sy.char) || '•'}</span>
    );
    return out;
  };
  const ok = routeResult && routeResult.ok;
  const jumps = ok && !routeResult.samePlanet ? routeResult.result.path.length - 1 : 0;
  const runs = ok && !routeResult.samePlanet ? routeLegRuns(routeResult.result.segments) : [];
  const astro = ok && !routeResult.samePlanet ? routeResult.travel.astrogation : null;
  return (
    <section className="mp-route" data-paper-chrome="1">
      <div className="mp-route-h">
        <div className="mp-route-t">HYPERSPACE ROUTE</div>
        <button className="mp-x" type="button" onClick={onClose} aria-label="Close route planner">
          <svg viewBox="0 0 14 14" aria-hidden="true"><line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" /></svg>
        </button>
      </div>
      <div className="mp-fld">
        <div className="mp-fl-l" id={`${ids}-start`}>START</div>
        <PlanetAutocompleteInput labelledBy={`${ids}-start`} planets={planets} value={startName} placeholder="From…"
          accent={accent} onChange={(v) => setStartName(v)} onPick={(p) => setStartName(p.name)} />
      </div>
      <div className="mp-fld mp-fld-end">
        <div className="mp-fl-l" id={`${ids}-end`}>END</div>
        <PlanetAutocompleteInput labelledBy={`${ids}-end`} planets={planets} value={endName} placeholder="To…"
          accent={accent} onChange={(v) => setEndName(v)} onPick={(p) => setEndName(p.name)} />
      </div>
      {routeResult && (
        <div role="status" aria-live="polite" aria-atomic="true">
          {ok && routeResult.samePlanet && (
            <div className="mp-res mp-res-same"><strong className="mp-k">SAME SYSTEM · </strong>{ROUTE_SAME_LINE}</div>
          )}
          {ok && !routeResult.samePlanet && (
            <div className="mp-res">
              <div className="mp-via">VIA {jumps} JUMP{jumps === 1 ? '' : 'S'}</div>
              <div className="mp-path">{routeResult.result.path.join(' \u2192 ')}</div>
              {runs.length > 0 && (
                <div className="mp-legs hp-bands">
                  {runs.map((r, i) => (
                    <div key={i} className="mp-leg">
                      <span className="mp-leg-ft">{r.from} {'\u2192'} {r.to}</span>
                      <span className="mp-dot">{' \u00b7 '}</span>
                      {r.offLane ? <span className="mp-leg-w">WILD SPACE</span>
                        : r.lane ? <span className="mp-leg-l">via {r.lane}</span>
                          : <span className="mp-leg-d">direct</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="mp-rule" />
              <div className="mp-days">{routeResult.travel.label}</div>
              {astro && (
                <div>
                  <div className="mp-astro">
                    <span>{(astro.difficulty || 'Easy').toUpperCase()} ASTROGATION</span>
                    <span className="mp-pips">{pips('difficulty', astro.difficultyDice || 1)}</span>
                    {astro.boost > 0 && <span className="mp-am">+{astro.boost} BOOST {pips('boost', astro.boost)}</span>}
                    {astro.setback > 0 && <span className="mp-am">+{astro.setback} SETBACK {pips('setback', astro.setback)}</span>}
                  </div>
                  <div className="mp-why">{astro.reason}</div>
                </div>
              )}
              <div className="mp-hc">
                <div className="mp-hc-l" id={`${ids}-hc`}>HYPERDRIVE CLASS <span>· LOWER = FASTER</span></div>
                <div className="mp-chips" role="group" aria-labelledby={`${ids}-hc`}>
                  {HYPER_CLASSES.map((c) => (
                    <button key={c} className="mp-chip" type="button" aria-pressed={c === hyperClass ? 'true' : 'false'}
                      onClick={() => setHyperClass(c)}>{c}</button>
                  ))}
                </div>
                <div className="mp-foot">{routeClassFoot(hyperClass)}</div>
              </div>
              {routeResult.result.offLane && (
                <div className="mp-wnote"><strong className="mp-k mp-k-w">WILD-SPACE LEG · </strong>{ROUTE_WILD_NOTE}</div>
              )}
            </div>
          )}
          <button className="mp-clearr" type="button" onClick={clearFields}>CLEAR ROUTE</button>
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────
   EnrichedPlanetDetailSheet — Chunk 9 replacement for the
   Chunk 5 minimal sheet. Lazy-loads deep planet records
   via the parent (`record` + `recordStatus` props are the
   parent's cache state). Renders conditional sections.
────────────────────────────────────────────────────── */
// Display names + chronological order for the planet drawer's era-lore chips.
// Keys are the era_variants labels actually used in the deep records (each kept
// distinct so a planet with two near-Yavin entries gets two readable chips).
const ERA_DISPLAY = {
  old_republic:         'Old Republic',
  clone_wars:           'Clone Wars',
  pre_battle_of_yavin:  'Pre-Yavin',
  imperial_occupation:  'Imperial Era',
  galactic_civil_war:   'Galactic Civil War',
  post_yavin:           'After Yavin',
  post_battle_of_yavin: 'After Yavin',
  post_empire:          'New Republic',
};
const ERA_CHRON = ['old_republic', 'clone_wars', 'pre_battle_of_yavin', 'imperial_occupation',
  'galactic_civil_war', 'post_yavin', 'post_battle_of_yavin', 'post_empire'];
function eraDisplayName(era) {
  return ERA_DISPLAY[era] || String(era || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function eraChronIdx(era) {
  const i = ERA_CHRON.indexOf(era);
  return i < 0 ? ERA_CHRON.length : i;
}

/* ──────────────────────────────────────────────────────
   PlanetPinControl — F-5 MAP PINS, the pin half of the shape
   (concept `map-pins-concept.md` §3).

   Lives ON the planet sheet the GM already opens; there is no
   pin screen and no travel-log screen (§2 rejected both). One
   toggle, one optional line of note, one plain date.

   Mechanics voice, per §2: "MARK VISITED" / "VISITED", a plain
   ISO-ish date, no metaphor about journeys or footprints.
────────────────────────────────────────────────────── */
function PlanetPinControl({ pin, onToggle, onNote, accent, noteMax }) {
  const on = !!pin;
  // The note is a controlled field over store state: every keystroke writes through, so a GM who
  // closes the sheet mid-word has still saved the word. No save button to forget.
  // B-1153 (R-UMP-5) — the paper face: the board's `.mp-pinc` (E1–E5); the same words, aria, date, note and NOTE_MAX,
  // the ring kept as the badge's idiom. The store and its key are untouched (R-F5-1, R-Y2-1).
  return (
    <div className="mp-pinc">
      <div className="mp-pin-row">
        <button className="mp-pin" type="button" role="switch" aria-checked={on}
          aria-label={on ? 'Visited — tap to unmark' : 'Mark visited'} onClick={onToggle}>
          <span className="mp-ring" aria-hidden="true" />{on ? 'VISITED' : 'MARK VISITED'}
        </button>
        {on && pin.when && <span className="mp-when">{pin.when}</span>}
      </div>
      {on && (
        <input className="mp-note" type="text" value={pin.note || ''} maxLength={noteMax}
          onChange={(e) => onNote(e.target.value)} placeholder="Note (optional)" aria-label="Note for this world" />
      )}
    </div>
  );
}

function EnrichedPlanetDetailSheet({ planet, record, recordStatus, onClose, accent, pin, onTogglePin, onPinNote, noteMax, desk }) {
  const gridRef = planet.grid_ref || '';
  const region  = planet.region || '';
  const sector  = planet.sector || '';
  const eyebrow = [region, sector].filter(Boolean).join(' · ').toUpperCase();
  // Era lore — the drawer owns era selection (the global era switch was removed).
  // Show one chip per era this planet actually has lore for, chronologically;
  // tapping a chip swaps the delta. Reset to the first era when the record (i.e.
  // the planet) changes.
  const eraVariants = (record && Array.isArray(record.era_variants) ? record.era_variants : [])
    .filter(v => v && v.era && v.delta)
    .slice()
    .sort((a, b) => eraChronIdx(a.era) - eraChronIdx(b.era));
  const [selectedEraIdx, setSelectedEraIdx] = useState(0);
  useEffect(() => { setSelectedEraIdx(0); }, [record]);
  const activeIdx = Math.min(selectedEraIdx, Math.max(0, eraVariants.length - 1));
  const activeEraVariant = eraVariants[activeIdx] || null;

  // Exit animation gate. Any close trigger (backdrop, X, drag, gesture)
  // goes through beginClose — it plays the slideDown animation, then
  // calls the parent's onClose once the animation completes so the
  // unmount doesn't happen mid-frame.
  const EXIT_MS = 260;
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  const beginClose = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => { onClose(); }, EXIT_MS);
  };
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  // B-1728: Back leaves the way ✕ does, through the exit animation. A swapped planet keeps this mount, so one entry.
  useBackToClose(true, beginClose);
  // B-1825/B-1826 (ADDENDUM 631): the sheet holds focus, and Escape leaves the way ✕ does, through beginClose.
  const sheetRef = useRef(null);
  window.SWRPGUI.useHoldFocus(sheetRef, true);
  window.SWRPGUI.useEscape(true, beginClose);
  // its door is often gone by the close (the search field folds away on a pick), so when the hold finds no door, focus goes
  // to the nearest stable control, the map's Search planets pill. Declared after the hold, so this cleanup runs after it.
  useEffect(() => () => {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const pill = document.querySelector('[data-map-shell] .mp-fl > button.mp-pill');
    if (pill) pill.focus();
  }, []);

  // Close on drag-down from the grab handle only. The sheet body is
  // scrollable; attaching the dismiss gesture to the whole wrapper ate
  // legitimate scroll-back gestures (UI 2026-04-23 audit).
  const dragStart = useRef(null);
  const dragLast  = useRef(null);
  const handleDragStart = (e) => {
    const t = e.touches[0];
    dragStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    dragLast.current  = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const handleDragMove = (e) => {
    if (!dragStart.current) return;
    const t = e.touches[0];
    dragLast.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const handleDragEnd = () => {
    const s = dragStart.current, l = dragLast.current;
    dragStart.current = null; dragLast.current = null;
    if (!s || !l) return;
    const dx = l.x - s.x;
    const dy = l.y - s.y;
    const dt = Math.max(1, l.t - s.t);
    const vy = dy / dt; // px per ms
    // Downward, dominant Y, and either big pull OR quick flick.
    if (dy > 60 && Math.abs(dy) > Math.abs(dx) && (dy > 120 || vy > 0.5)) {
      beginClose();
    }
  };

  // Extract conditional sections from the deep record.
  const identity = record && record.identity ? record.identity : null;
  const essence     = identity && identity.essence;
  const atmosphere  = identity && identity.atmosphere;
  const reputation  = identity && identity.reputation;
  const hasIdentity = !!(essence || atmosphere || reputation);
  // B-1145 (DECISIONS D-415, the approved page @ c060303a7): a record with no authored lore shows its Planet Compendium
  // text under LORE, the book named from the record's own ref with its page dropped (the book is uncalibrated).
  const comp = (record && record.compendium) || {};
  const compRef = ((record && record.source_refs) || []).find(s => typeof s === 'string' && /^Planet Compendium\b/.test(s));
  const compPairs = hasIdentity || !compRef ? []
    : [['OVERVIEW', comp.background], ['GOVERNMENT', comp.government], ['MAJOR CITIES', comp.major_cities]].filter(x => x[1]);
  const compSource = compPairs.length > 0 ? compRef.replace(/\s*p\.?\s*\d.*$/, '') : null;
  const hasLore = hasIdentity || compPairs.length > 0;

  const factions = record && Array.isArray(record.factions) ? record.factions : [];
  const districts = record && record.geography && Array.isArray(record.geography.districts)
    ? record.geography.districts : [];
  const strategicLocations = record && Array.isArray(record.strategic_locations)
    ? record.strategic_locations : [];
  const influences = record && Array.isArray(record.influences) ? record.influences : [];
  // Common species at-a-glance (vet-GM fix 2026-04-23).
  const species = record && Array.isArray(record.species) ? record.species : [];
  const hasAnyRichSection = hasLore || factions.length > 0 || districts.length > 0
    || strategicLocations.length > 0 || influences.length > 0 || species.length > 0;

  // Jump-pill nav anchors — one ref per section. Pills only render if 2+
  // sections are populated (otherwise the nav is noise).
  const factionsRef  = useRef(null);
  const speciesRef   = useRef(null);
  const locationsRef = useRef(null);
  const loreRef      = useRef(null);
  const jumpTo = (r) => {
    if (r && r.current) r.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const jumpSections = [
    { key: 'factions',  label: 'FACTIONS',  ref: factionsRef,  show: factions.length > 0 },
    { key: 'species',   label: 'SPECIES',   ref: speciesRef,   show: species.length > 0 },
    { key: 'locations', label: 'LOCATIONS', ref: locationsRef, show: (districts.length + strategicLocations.length) > 0 },
    { key: 'lore',      label: 'LORE',      ref: loreRef,      show: hasLore },
  ].filter(s => s.show);

  // B-1153 — the record's labels, hoisted so the two faces print one spelling (the dark JSX reads them too).
  const factionLine = (f) => (f.type || '').toString().replace(/_/g, ' ').toUpperCase()
    + (f.type && f.control_strength ? ' · ' : '') + (f.control_strength || '').toString().toUpperCase();
  const locationTypes = (loc) => loc.type.map(t => (t || '').toString().replace(/_/g, ' ').toUpperCase()).join(' · ');
  const influenceLabel = (inf) => ((inf.type || 'INFLUENCE') + (inf.strength ? ' · ' + inf.strength : '')).toUpperCase().replace(/_/g, ' ');
  const influenceText = (inf) => inf.source_description || inf.description || '';
  const speciesName = (sp) => (typeof sp === 'string' ? sp : (sp.name || sp.id || 'Unknown'));
  const speciesPct = (sp) => (typeof sp === 'object' && sp.percentage ? sp.percentage : null);
  const lorePairs = [['OVERVIEW', essence], ['REPUTATION', reputation], ['MOOD', atmosphere]].filter(x => x[1]);
  const hasXY = typeof planet.x === 'number' && typeof planet.y === 'number';

  // B-1153 (R-UMP-5; E1–E8) — THE PAPER FACE: the board's sheet markup over the same state, the same close path
  // (`beginClose`: the scrim, ×, the handle and its drag), the same sections in the same order. The handle is a
  // BUTTON (Enter/Space close; the drag stays on it); the jump pills WRAP (finding 12); the era chips are PRESSED
  // buttons at 44px. At the desk map.css turns the same markup into the 460px right panel (`[data-desk="1"]`).
  const scrollPad = { scrollMarginTop: '56px' };
  return (
    <>
      <div className="mp-scrim" aria-hidden="true" onClick={beginClose}
        style={{ animation: closing ? `fadeOut ${EXIT_MS}ms ease forwards` : 'fadeIn 0.2s ease forwards' }} />
      <div className="mp-sheet" role="dialog" aria-modal="true" aria-labelledby="planet-sheet-name" ref={sheetRef}
        data-doc-ground="creator"
        style={{ animation: closing
          ? `slideDown ${EXIT_MS}ms cubic-bezier(0.7,0,0.84,0) forwards`
          : 'slideUp 0.3s cubic-bezier(0.2,0.9,0.3,1) forwards' }}>
        <button className="mp-handle" type="button" aria-label="Drag down to close" onClick={beginClose}
          onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
          onTouchCancel={() => { dragStart.current = null; dragLast.current = null; }}
          style={{ touchAction: 'none' }}>
          <span aria-hidden="true" />
        </button>
        <button className="mp-x mp-sheet-x" type="button" aria-label="Close planet details" onClick={beginClose}>{'\u00D7'}</button>
        {eyebrow && <div className="mp-eye">{eyebrow}</div>}
        <h2 className="mp-name" id="planet-sheet-name">{planet.name}</h2>
        {gridRef && (
          <div className="mp-gridref">GRID {gridRef}
            {hasXY && <span>· {Math.round(planet.x)}, {Math.round(planet.y)}</span>}
          </div>
        )}
        <div className="mp-div" />
        {onTogglePin && (
          <PlanetPinControl pin={pin} onToggle={onTogglePin} onNote={onPinNote} accent={accent} noteMax={noteMax} />
        )}
        {recordStatus === 'loading' && <div className="mp-loadrec" role="status" aria-live="polite">LOADING PLANET RECORD…</div>}
        {recordStatus === 'error' && <div className="mp-failed">Planet record failed to load.</div>}
        {recordStatus === 'nav-only' && <p className="mp-quiet-p">No Holocron entry. Navigation data only.</p>}
        {recordStatus === 'ready' && record && (
          <>
            {jumpSections.length >= 2 && (
              <div className="mp-jumps mp-wrap">
                {jumpSections.map(s => (
                  <button key={s.key} className="mp-jump" type="button" aria-label={'Jump to ' + s.label.toLowerCase()}
                    onClick={() => jumpTo(s.ref)}>{s.label}</button>
                ))}
              </div>
            )}
            {eraVariants.length > 0 && (
              <div className="mp-erab">
                {eraVariants.length > 1 && (
                  <div className="mp-eras">
                    {eraVariants.map((v, i) => (
                      <button key={v.era + '-' + i} className="mp-era" type="button" aria-pressed={i === activeIdx}
                        onClick={() => setSelectedEraIdx(i)}>{eraDisplayName(v.era).toUpperCase()}</button>
                    ))}
                  </div>
                )}
                {activeEraVariant && activeEraVariant.delta && (
                  <div className="mp-shift">
                    <div className="mp-shift-t">{eraDisplayName(activeEraVariant.era).toUpperCase()} · TIMELINE SHIFT</div>
                    <div className="mp-shift-b">{activeEraVariant.delta}</div>
                  </div>
                )}
              </div>
            )}
            {factions.length > 0 && (
              <>
                <h3 className="mp-sec" ref={factionsRef} style={scrollPad}>FACTION CONTROL</h3>
                <div className="mp-cards">
                  {factions.map((f, i) => (
                    <div key={'f' + i} className="mp-card">
                      <div className="mp-card-n">{f.name || f.id || 'Unknown Faction'}</div>
                      {(f.type || f.control_strength) && <div className="mp-card-l">{factionLine(f)}</div>}
                      {Array.isArray(f.control_type) && f.control_type.length > 0 && (
                        <div className="mp-tags">
                          {f.control_type.map((ct, j) => (
                            <span key={'ct' + j} className="mp-tag" data-k="ct">{(ct || '').toString().toUpperCase()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {species.length > 0 && (
              <>
                <h3 className="mp-sec" ref={speciesRef} style={scrollPad}>COMMON SPECIES</h3>
                <div className="mp-spp">
                  {species.slice(0, 8).map((sp, i) => {
                    const pct = speciesPct(sp);
                    return (
                      <span key={'sp' + i} className="mp-sp">{speciesName(sp)}{pct && <span className="mp-pct">{pct}%</span>}</span>
                    );
                  })}
                </div>
              </>
            )}
            {districts.length > 0 && (
              <>
                <h3 className="mp-sec" ref={locationsRef} style={scrollPad}>DISTRICTS</h3>
                <div className="mp-cards">
                  {districts.map((d, i) => (
                    <div key={'d' + i} className="mp-card">
                      <div className="mp-card-n">{d.name || 'Unknown District'}</div>
                      {d.authority && <div className="mp-card-l">AUTHORITY · {d.authority.toUpperCase()}</div>}
                      {d.character && <div className="mp-card-b">{d.character}</div>}
                      {(d.crime_index || (Array.isArray(d.strategic_value) && d.strategic_value.length > 0)) && (
                        <div className="mp-tags">
                          {d.crime_index && <span className="mp-tag" data-k="crime">CRIME · {String(d.crime_index).toUpperCase()}</span>}
                          {Array.isArray(d.strategic_value) && d.strategic_value.map((sv, j) => (
                            <span key={'sv' + j} className="mp-tag" data-k="sv">{String(sv).toUpperCase()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {strategicLocations.length > 0 && (
              <>
                <h3 className="mp-sec" ref={districts.length > 0 ? undefined : locationsRef} style={scrollPad}>STRATEGIC LOCATIONS</h3>
                <div className="mp-cards">
                  {strategicLocations.map((loc, i) => (
                    <div key={'loc' + i} className="mp-card">
                      <div className="mp-card-n">{loc.name || 'Unknown Location'}</div>
                      {Array.isArray(loc.type) && loc.type.length > 0 && <div className="mp-card-l">{locationTypes(loc)}</div>}
                      {loc.strategic_value && <div className="mp-card-b">{loc.strategic_value}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {hasLore && (
              <>
                <h3 className="mp-sec" ref={loreRef} style={scrollPad}>LORE</h3>
                <div className="hp-bands" data-run="1">
                {lorePairs.concat(compPairs).map(([l, t]) => (
                  <div key={l} className="mp-lore"><div className="mp-lore-l">{l}</div><div className="mp-lore-t">{t}</div></div>
                ))}
                {compSource && (
                  <div className="mp-lore"><div className="mp-lore-l">SOURCE</div><div className="mp-lore-t">{compSource}</div></div>
                )}
                </div>
              </>
            )}
            {influences.length > 0 && (
              <>
                <h3 className="mp-sec">INFLUENCES</h3>
                <div className="hp-bands" data-run="1">{influences.map((inf, i) => (
                  <div key={'inf' + i} className="mp-lore">
                    <div className="mp-lore-l">{influenceLabel(inf)}</div>
                    <div className="mp-lore-t">{influenceText(inf) || '—'}</div>
                  </div>
                ))}</div>
              </>
            )}
            {!hasAnyRichSection && (
              <p className="mp-quiet-p">Planet record is thin. No identity, factions, districts, or strategic locations recorded yet.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SearchInput({ value, onChange, placeholder, accent, inputProps }) {
  const inputRef = useRef(null);
  // B-1150 (R-UMP-2; B-1133) — the paper field: the board's `.mp-field`; the caller names the input (a combobox,
  // labelled by its aria-label or its START/END line) through `inputProps`. × clears, as today, and hands the focus
  // back to the field (the × unmounts as the value empties, which would otherwise drop the focus on <body>).
  return (
    <div className="mp-field">
      <svg className="mp-mag" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" /><line x1="9.5" y1="9.5" x2="13" y2="13" />
      </svg>
      <input ref={inputRef} type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Search…'} {...inputProps} />
      {value && (
        <button className="mp-clear" type="button" aria-label="Clear search"
          onClick={() => { onChange(''); if (inputRef.current) inputRef.current.focus(); }}>×</button>
      )}
    </div>
  );
}

function SegmentedControl({ items, activeId, onSelect, accent }) {
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent}22`,
      borderRadius: '6px',
      padding: '3px',
      gap: '3px',
    }}>
      {items.map(it => {
        const isActive = it.id === activeId;
        return (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            style={{
              flex: 1,
              minHeight: '44px', minWidth: '44px',
              padding: '0 10px',
              border: 'none', borderRadius: '4px',
              background: isActive ? `${accent}28` : 'transparent',
              color: isActive ? accent : 'rgba(255,255,255,0.5)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
              letterSpacing: '0.16em',
              cursor: 'pointer',
              transition: 'background 0.2s ease, color 0.2s ease',
              textShadow: isActive ? `0 0 12px ${accent}66` : 'none',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function RangeSlider({ label, min, max, step, value, onChange, accent, suffix }) {
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: '6px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)',
          letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)',
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)',
          color: accent,
          textShadow: `0 0 14px ${accent}55`,
        }}>
          {value}{suffix || ''}
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step || 1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: accent,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

function RadioPillGroup({ items, activeId, onSelect, accent }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '6px',
    }}>
      {items.map(it => {
        const isActive = it.id === activeId;
        const isDisabled = !!it.disabled;
        return (
          <button
            key={it.id}
            onClick={isDisabled ? undefined : () => onSelect(it.id)}
            style={{
              flex: '1 1 auto',
              minHeight: '44px', minWidth: '44px',
              padding: '0 14px',
              borderRadius: '18px',
              border: `1px solid ${isActive ? accent + '66' : 'rgba(255,255,255,0.08)'}`,
              background: isActive ? `${accent}22` : 'rgba(255,255,255,0.03)',
              color: isDisabled ? 'rgba(255,255,255,0.18)' : (isActive ? accent : 'rgba(255,255,255,0.55)'),
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
              letterSpacing: '0.16em',
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: isDisabled ? 0.55 : 1,
              transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
              textShadow: isActive ? `0 0 12px ${accent}66` : 'none',
            }}
          >
            {it.label}
            {isDisabled && (
              <span style={{
                marginLeft: '6px', fontSize: 'var(--fs-2xs)', opacity: 0.55,
                letterSpacing: '0.18em',
              }}>SOON</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Small SVG icons for the Encounter Generator's edit mode ── */
function IconReroll({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M13 6a5 5 0 1 1-1.5-3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <polyline points="13,1 13,6 8,6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function GmIconX({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <line x1="3" y1="3" x2="13" y2="13" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconPlus({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <line x1="8" y1="3" x2="8" y2="13" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconMinus({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <line x1="3" y1="8" x2="13" y2="8" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconEditCast({ size = 14, color = 'currentColor' }) {
  // Four small stacked bars with an overlaid pencil — signals "edit cast list"
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <line x1="2" y1="4"  x2="10" y2="4"  stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="8"  x2="8"  y2="8"  stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="12" x2="6"  y2="12" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 7 L14 10 L10 14 L7 14 L7 11 Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function IconCheck({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <polyline points="3,8 7,12 13,4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function IconEye({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M1 8 C3 4 13 4 15 8 C13 12 3 12 1 8Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <circle cx="8" cy="8" r="2.2" stroke={color} strokeWidth="1.4" fill="none" />
    </svg>
  );
}

/* ── Nav-only planet fallback: procedural district synthesis ── */
function generateFallbackDistricts(planet) {
  const name = planet.name || 'this world';
  return [
    {
      id: 'fallback_spaceport',
      name: `${name} Main Spaceport`,
      character: `The primary orbital access point for ${name}. Where traffic lands and where eyes watch.`,
      authority: 'whoever pays the landing fees',
      crime_index: 'moderate',
      strategic_value: ['economic', 'informational'],
      _generated: true,
    },
    {
      id: 'fallback_outskirts',
      name: `${name} Outskirts`,
      character: 'The edge of the populated zone. Fewer witnesses, fewer laws.',
      authority: 'contested',
      crime_index: 'high',
      strategic_value: ['covert'],
      _generated: true,
    },
    {
      id: 'fallback_wilderness',
      name: `${name} Wilderness`,
      character: 'Beyond the settlements. Environmental hazards, predators, abandoned ruins.',
      authority: 'none',
      crime_index: 'n/a',
      strategic_value: ['hidden'],
      _generated: true,
    },
  ];
}

/* ══════════════════════════════════════════════════════
   URL ROUTING (pushState-based for analytics + bookmarks)
   See Docs/PLAN_URL_ROUTING.md for full scheme. v1 scope is
   top-level sections only — nested setView calls in the NPC
   Library, Encounter Forge, and Workshop stay as in-app state
   (matches the plan's v1 decision for workshop tabs).
══════════════════════════════════════════════════════ */

/* F-100 C2 · THE HOMEBREW EDITOR'S ROUTES (R-FIEC-5) — the same OFF wrapper the player uses. `parsePathToScreen`
   below stays pure (a /gm/homebrew path is `{screen: null}` to it); ON, this names the `homebrew` screen and the
   editor reads the rest of the path; OFF, it answers null and today's fallback stands. [mirrors player/app.jsx] */
function homebrewScreenFor(path) {
  return (window.SWRPGEditor && window.SWRPGEditor.screenFor(path)) ? 'homebrew' : null;
}

// RELEASE R3 (D-258) — the GM's host for the shared backup screen: its band (the 1024 seam) and its maker.
function GmBackup({ onBack }) {
  const band = useLayoutMode();
  const UI = window.SWRPGUI;
  if (!UI || !UI.BackupScreen || !window.SWRPGBackup) return null;
  return React.createElement(UI.BackupScreen, { maker: 'GM Holocron', band: band, onBack: onBack });
}

function pathForScreen(screenId, params) {
  switch (screenId) {
    case 'landing':       return '/gm';
    case 'npc':           return '/gm/npc' + ((params && params.npcPath) ? '/' + params.npcPath : '');   // B-863
    case 'map':           return '/gm/map';
    case 'store':         return '/gm/store';
    case 'homebrew':      return '/gm/homebrew';   // F-100 C2 (R-FIEC-5); reached only while swrpg_homebrew_editor is on
    case 'backup':        return '/gm/backup';   // RELEASE R3 (D-258): the whole-save backup
    case 'yard':          return '/gm/yard';   // the Yard's own rooms ride its tail (gmYardTail); navTo writes it
    case 'encounters':    return '/gm/encounters' + ((params && params.groupId) ? '/' + encodeURIComponent(params.groupId) : '');   // R-E3S-1 (on only)
    case 'campaigns':     return '/gm/campaigns' + ((params && params.campId) ? '/' + encodeURIComponent(params.campId) : '');   // R-E6F-1 (on only)
    default:              return '/gm';
  }
}

/* SHIP YARD S4 · K6 (R-S4G-3): the Yard's tail (the path after /gm/yard), read by the shared grammar
   (SWRPGVesselView.yardRoute). The parser below sends every /gm/yard path to the `yard` screen. */
function gmYardTail(path) {
  var m = /^\/gm\/yard(?:\/(.*))?$/.exec(String(path || '').replace(/\/$/, ''));
  return m ? (m[1] || '') : null;
}
function parsePathToScreen(path) {
  var p = (path || '').replace(/\/$/, '');
  if (p === '' || p === '/' || p === '/gm' || p === '/gm.html') {
    return { screen: 'landing' };
  }
  // B-863 · R-NPC-4: /gm/npc/<tail> — the library's position; the module's grammar reads the tail.
  var npcMatch = p.match(/^\/gm\/npc\/(.+)$/);
  if (npcMatch) return { screen: 'npc', npcPath: npcMatch[1] };
  // GM.YARD: every /gm/yard/<tail> is the Yard (must precede the generic switch); the tail is gmYardTail's. The old
  // GM.YARD.SHIP sub-route (/gm/yard/<vehicleKey> → a vehicleKey) was deleted at the S5 flip (R-S5R-18).
  if (/^\/gm\/yard\/.+$/.test(p)) return { screen: 'yard' };
  // ENCOUNTERS E3 lap B (shape §4.5): /gm/encounters[/<groupId>]. Pure: the host's switch read (encountersRedirect,
  // below) replaces this path before it is parsed while swrpg_encounters_door is off.
  var encMatch = p.match(/^\/gm\/encounters(?:\/([^/]+))?$/);
  if (encMatch) return { screen: 'encounters', groupId: encMatch[1] ? decodeURIComponent(encMatch[1]) : '' };
  // ENCOUNTERS E6 frames (R-E6F-1): /gm/campaigns[/<campaignId>], only while swrpg_campaigns_door is on
  var campMatch = campaignsOn() ? p.match(/^\/gm\/campaigns(?:\/([^/]+))?$/) : null;
  if (campMatch) return { screen: 'campaigns', campId: campMatch[1] ? decodeURIComponent(campMatch[1]) : '' };
  switch (p) {
    case '/gm/npc':       return { screen: 'npc' };
    case '/gm/map':       return { screen: 'map' };
    case '/gm/store':     return { screen: 'store' };
    case '/gm/yard':      return { screen: 'yard' };
    case '/gm/backup':    return { screen: 'backup' };   // RELEASE R3 (D-258)
    default:              return { screen: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SHIP YARD S4 · THE YARD'S HOST, GM SIDE (ruling `shipyard-s4-ground` §6 JOB 2, chunk A; switch map G1–G3, G5, G6).
// HANGAR is the shared `YardHangar` (lib/shared/vesselView.jsx: H2 by unit, H4 the owner picker, U1 the unit page);
// CATALOGUE/ENTRY are `YardCatalogue` (JOB 4), MATRIX (the Ship table, R-S5C-4) is `YardCatalogue` drawn as one table (B-1255),
// and SHIP is `YardShip`. The bars are the app's own (GmApp). It is the only Yard since the S5 flip (R-S5R-18).
// THE GM HOLOCRON HOLDS NO ROSTER. H4 draws characters in the owner picker, so this reads the characters
// saved ON THIS DEVICE, read-only, for their names and careers — the one source there is (listed at the gate).
function gmDeviceRoster() {
  var VV = window.SWRPGVesselView;
  return VV && VV.readDeviceRoster ? VV.readDeviceRoster() : [];
}
// The ship room's roster (R-SCG1-1): the roster's own load, lifted, with readDeviceRoster's null-id filter.
function gmShipRoster() {
  var R = window.SWRPGRoster;
  return R ? R.loadSavedCharacters().filter(function (c) { return c && c.id != null; }) : gmDeviceRoster();
}
function GmYardS4({ route, owner, roster, go, pickerOpen, onPickOwner, onClosePicker, catalogueView, onPlanExit }) {
  const ctrl = useVehicleLibraryController();
  var charCore = useYardCharCore();   // R-S4PP-3 / R-S4CO-7: a character's pool and portrait, lazily, from the shared modules
  var VV = window.SWRPGVesselView, VS = window.SWRPGVessels;
  var vesselState = VS ? VS.useVessels() : { v: 1, vessels: [] };
  var vesselsStale = !!(VS && VS.isStale());
  var staleBanner = vesselsStale ? h(window.SWRPGUI.StaleTabBanner, { accent: YARD_ACCENT }) : null;
  function applyVessels(fn) { if (VS) VS.apply(fn); }
  function nowStamp() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return null; } }
  if (!VV || !VV.YardHangar || !VS) return null;
  var room = route.room;
  if (room === 'hangar' || room === 'unit') {
    return h(VV.YardHangar, {
      host: 'gm', route: route, owner: owner, character: null, roster: roster,
      ctx: yardResolveCtx(),
      getVehicle: function (k) { return ctrl.getVehicleByKey(k); },
      portraitFor: charCore ? window.SWRPGPortraits.charPortrait : null,   // R-S4CO-7: the one lookup both apps load
      charPool: charCore ? window.SWRPGSheetPool.charPool : null,           // R-S4CO-4: a PC's seat pool = the sheet's own (one path)
      nav: go,
      pickerOpen: pickerOpen, onPickOwner: onPickOwner, onClosePicker: onClosePicker,
    });
  }
  if (room === 'build') {
    // SHIP YARD S8 · BUILD A SHIP (card `shipyard-s8-build` R-S8B-9, ADDENDUM 12 Q1): the shared room (`YardBuildRoom`), the same
    // one the player mounts; its ＋ ADD TO PARTY adds to the party, as E3's does
    return h(VV.YardBuildRoom, { host: 'gm', route: route, nav: go, roster: roster });
  }
  if (room === 'catalogue' && catalogueView === 'matrix') {
    // B-1255 (DECISIONS D-411 item 12, ruling `release-r7-bug-burndown` ADDENDA 247, 293): the GM's third tab, SHIP TABLE, is
    // the shared catalogue drawn as one paper table (`YardCatalogue` with `table`), no longer the old dark matrix
    return h(VV.YardCatalogue, {
      key: 'table', host: 'gm', route: route, ctrl: ctrl, urlBase: '/gm/yard/catalogue', go: go,
      roster: roster, table: true,
    });
  }
  if (room === 'catalogue' || room === 'entry') {
    // THE CATALOGUE (JOB 4, ruling `shipyard-s4-catalogue-card` order 4): the shared room, C1–C5 and E1–E3 (lib/shared/
    // vesselView.jsx `YardCatalogue`), the same component the player mounts; E3's ＋ ADD TO PARTY and GM EDIT
    return h(VV.YardCatalogue, {
      host: 'gm', route: route, ctrl: ctrl, urlBase: '/gm/yard/catalogue', go: go,
      roster: roster,
    });
  }
  if (room === 'plan') {
    // P1 · PLAN (ruling `shipyard-s4-catalogue-card` R-S4CC-2/3): the shared room (`YardPlan`); ACQUIRE WITH THIS FIT adds
    // to the party, as E3's ＋ ADD TO PARTY does
    return h(VV.YardPlan, {
      host: 'gm', route: route, ctrl: ctrl, go: go, onExit: onPlanExit, roster: roster,
      ctx: yardResolveCtx(), charPool: charCore ? window.SWRPGSheetPool.charPool : null,
    });
  }
  if (room === 'ship') {
    // THE SHIP (JOB 3a, ruling `shipyard-s4-collection` §7 order 2): the shared room — the SHEET, its DECK room and the
    // WORKBENCH (lib/shared/vesselView.jsx `YardShip`); its stale hold (S3) is its own. The interim sheet is retired here.
    // SHIP CARGO Part B: the roster is read HERE, at this render, not GmApp's. A cargo act writes the vessels (which re-render
    // this room, `useVessels`) and a character (which re-renders nothing on the GM), and the act's base is the roster it is
    // handed (`cargoCtx`): GmApp's copy would be the page's first read, so a second LOAD made goods (A7L, measured).
    // And it is the LIFTED roster (R-SCG1-1): the player's own load (`SWRPGRoster.loadSavedCharacters`), which un-nests a
    // legacy double-nested record (and repairs a poisoned XP budget) and writes that back once, as the player app does on
    // every load. A raw parse saw such a record's equipment as {}, and a GM UNLOAD then replaced all of it (A10, measured).
    return h(VV.YardShip, {
      host: 'gm', route: route, owner: owner, roster: gmShipRoster(), loading: ctrl.loading,
      ctx: yardResolveCtx(),
      getVehicle: function (k) { return ctrl.getVehicleByKey(k); },
      portraitFor: charCore ? window.SWRPGPortraits.charPortrait : null,
      charPool: charCore ? window.SWRPGSheetPool.charPool : null,
      nav: go,
      // SHIP CARGO Part B (R-SCW-1, R-SCGS-1): the GM writes a character through the player's own roster write, lifted whole
      // into lib/shared/roster.js. LOAD FROM and UNLOAD render where a write is handed. False when nothing was written.
      writeCharacter: function (id, eq) { return !!(window.SWRPGRoster && window.SWRPGRoster.writeEquipment(id, eq)); },
    });
  }
  return h(VV.YardNotFoundRoom, { what: 'page' });
}
// R-E3S-1 — a GM path that belongs to the other switch state is REPLACED, never a dead end: OFF, /gm/encounters[/<id>]
// → /gm/npc/encounters[/<id>]; ON, the reverse. The answer is the switch module's; this applies it to the address bar.
function encountersRedirect() {
  var D = window.SWRPGEncountersDoor, to = D ? D.redirect(window.location.pathname) : null;
  if (to && to !== window.location.pathname) {
    try { window.history.replaceState(window.history.state, '', to + window.location.search); } catch (e) {}
  }
  return to;
}
// The library's tail for the ENCOUNTERS screen: the host translates /gm/encounters[/<id>] to the library's own grammar
// (`npcRoute.js`, 'encounters[/<id>]', unchanged) and back, so the library's position sync runs as it does under /gm/npc.
function encountersTail(groupId) { return 'encounters' + (groupId ? '/' + encodeURIComponent(groupId) : ''); }
function GmApp() {
  // F-46 D4: the ⚙ GENERAL LAYOUT pref (auto/mobile/desktop), G10 setPref. Tracked so the segment
  // re-renders even when the pref changes without flipping the resolved mode.
  var _lp = useState(function () { return (window.SWRPGLayout && window.SWRPGLayout.pref()) || 'auto'; });
  var layoutPref = _lp[0], setLayoutPref = _lp[1];
  function chooseLayout(v) { if (window.SWRPGLayout) window.SWRPGLayout.setPref(v); setLayoutPref(v); }
  // Initial screen: cold-load URL parse. If the visitor is deep-linking to /gm/npc, /gm/map, etc. —
  // honor that path; anything else is the landing (B-1106, D-72: no onboarding comes first).
  const [screen, setScreen] = useState(function() {
    encountersRedirect();   // R-E3S-1: before any parse, the address bar is the switch state's
    if (homebrewScreenFor(window.location.pathname)) return 'homebrew';   // F-100 C2 (null while the switch is off)
    return parsePathToScreen(window.location.pathname).screen || 'landing';
  });
  // SHIP YARD S4: the Yard's position is its URL tail (K6), read by SWRPGVesselView.yardRoute.
  const [yardTailPath, setYardTailPath] = useState(function() { return gmYardTail(window.location.pathname) || ''; });
  // R-S4CC-2 · where P1 was opened FROM — { kind:'ship', id, name } from an owned ship's part row (its back reads
  // ‹ <SHIP NAME>). Kept in the history entry, never in the URL, as the player's U3 origin is.
  const [yardFrom, setYardFrom] = useState(function() { try { return (window.history.state && window.history.state.yardFrom) || null; } catch (e) { return null; } });
  // H4 · whose hangar the GM is looking at (PARTY by default; the picker is the chip's). Not persisted.
  const [yardOwner, setYardOwner] = useState('party');
  const [yardPickerOpen, setYardPickerOpen] = useState(false);
  const [yardView, setYardView] = useState(function() { return /[?&]view=matrix\b/.test(window.location.search) ? 'matrix' : 'index'; });
  const [wipeType, setWipeType] = useState('wipeHorizontal');
  // A5 (ruling argo-dataset-import-draft ADDENDUM 4 item 6; mockup argo-a5-import.html M1 @ ad8cb3ac2, D-589): the ⚙
  // "Fill in rule text…" panel, open copy only, the player's shared module; an import or a remove re-renders the app.
  const [ruleTextOpen, setRuleTextOpen] = useState(false);
  const [, setRuleTextTick] = useState(0);
  useEffect(function() {
    function on() { setRuleTextTick(function(n) { return n + 1; }); }
    window.addEventListener('swrpg-rule-text-changed', on);
    return function() { window.removeEventListener('swrpg-rule-text-changed', on); };
  }, []);
// B-863 · R-NPC-4 (ruling npc-library-paper-concept) — THE LIBRARY'S POSITION IS IN THE URL. This host
// owns the router: it parses `/gm/npc/<tail>`, holds the tail, hands it to the shared module as
// `location`, and answers the module's `onLocation(tail, opts)` — a MOVE pushes one history entry, a
// correction (`replace`) replaces it silently, and a BACK whose target is the previous entry POPS to
// it, so the library's BACK and the browser's back walk one list. The grammar is `lib/library/npc/
// npcRoute.js`'s; this code never interprets a segment.
  const [npcPath, setNpcPath] = useState(function() {
    return parsePathToScreen(window.location.pathname).npcPath || '';
  });
  // ENCOUNTERS E3 lap B: the open encounter's id on /gm/encounters/<groupId> ('' = the list).
  const [encGroupId, setEncGroupId] = useState(function() {
    return parsePathToScreen(window.location.pathname).groupId || '';
  });
  // ENCOUNTERS E6 frames: the open campaign's id on /gm/campaigns/<campaignId> ('' = the list).
  const [campId, setCampId] = useState(function() {
    return parsePathToScreen(window.location.pathname).campId || '';
  });
  // STORE-UNIFY: the store's section tab lives here (like the player), so the bottom bar can BECOME
  // the store's contextual bar (Weapons · Armor · Gear · Shelves(n)) — the kernel renders only its
  // sub-category chips, never a second section row. `storeCounts.shelves` = the active shelf's size.
  const [storeTab, setStoreTab] = useState('weapons');
  const [storeCounts, setStoreCounts] = useState({ shelves: 0, shelfCount: 0 });
  const handleStoreCounts = useCallback(function(c) { setStoreCounts(c); }, []);

  // ── In-app navigation helper ────────────────────────────────────
  // navTo updates React state AND pushes a new URL to browser history.
  // ALL in-app navigation should go through navTo — never call setScreen
  // directly. The exception is COLD-LOAD: the useState initializer above
  // uses setScreen directly because the URL is already correct on
  // initial mount and pushing it again would create a duplicate
  // history entry.
  //
  // Cloudflare Web Analytics auto-tracks pushState navigations as
  // separate page views per their SPA docs. No manual beacon calls.
  // F-100 C2: the editor's own path (its levels live under /gm/homebrew; the editor parses it).
  const [homebrewPath, setHomebrewPath] = useState(function() { return window.location.pathname; });
  const navTo = useCallback(function(screenId, params) {
    setScreen(screenId);
    if (screenId === 'homebrew') setHomebrewPath(pathForScreen('homebrew'));
    if (screenId === 'npc') setNpcPath((params && params.npcPath) || '');   // B-863: the NPCs door lands on the front
    if (screenId === 'encounters') setEncGroupId((params && params.groupId) || '');   // the plate lands on the list
    if (screenId === 'campaigns') setCampId((params && params.campId) || '');   // the plate lands on the list
    var path = pathForScreen(screenId, params);
    // SHIP YARD S4 · U9: every door to the Yard (the bar's YARD, the hub's card) opens the HANGAR floor; a door that
    // names a hull opens its ENTRY.
    if (screenId === 'yard') {
      var ytail = (params && params.vehicleKey) ? 'catalogue/' + encodeURIComponent(params.vehicleKey) : 'hangar';
      setYardTailPath(ytail);
      path = '/gm/yard/' + ytail;
    }
    if (window.location.pathname !== path) {
      history.pushState({ screen: screenId, params: params || null }, '', path);
    }
  }, []);

  // ── Popstate handling: refs-mirror pattern ──────────────────────
  // Browser back/forward triggers popstate. The handler updates state
  // from the URL. Empty deps + refs-mirror convention — never add deps,
  // never call pushState from within the handler. (See Docs/
  // PLAN_URL_ROUTING.md for the full pattern + extension instructions.)
  // v1 scope: no IDs to resolve (NPC drilldown URLs deferred), so no
  // refs needed yet. When NPC nested URLs land in v2, add taxonomy ref
  // here.
  useEffect(function() {
    function handlePopState(_event) {
      encountersRedirect();   // R-E3S-1: a history entry from the other switch state is replaced, then read
      var path = window.location.pathname;
      var parsed = parsePathToScreen(path);
      if (homebrewScreenFor(path)) { setScreen('homebrew'); setHomebrewPath(path); return; }   // F-100 C2 (off: never)
      setScreen(parsed.screen || 'landing');
      setYardTailPath(gmYardTail(path) || '');   // SHIP YARD S4: the Yard's tail
      setYardFrom((_event && _event.state && _event.state.yardFrom) || null);   // R-S4CC-2: P1's origin rides its entry
      setNpcPath(parsed.npcPath || '');   // B-863: back/forward inside the library feeds the module its tail
      setEncGroupId(parsed.groupId || '');   // ENCOUNTERS: back/forward between the list and an open encounter
      setCampId(parsed.campId || '');   // CAMPAIGNS: back/forward between the list and one campaign
    }
    window.addEventListener('popstate', handlePopState);
    return function() { window.removeEventListener('popstate', handlePopState); };
  }, []);  // EMPTY DEPS — handler reads URL only. Do not add deps.

  // Immersive-hide (navigation Phase 2b): the galaxy map slides both bars away (body.holo-immersive).
  // IA lap: the NPC library is NO LONGER immersive — it's bars-resident + auto-hide (the bars ride and
  // fade on idle via the shared useAutoHideChrome the library calls + the `autohide` prop below).
  useEffect(function() {
    // F-100 C2 (R-FISF-1): the homebrew editor is a full paper page with its own way out (the runhead's
    // "‹ GM Holocron"), so it takes the GM's one bar-hiding idiom too. Unreachable while its switch is off.
    var immersive = screen === 'map' || screen === 'homebrew' || screen === 'backup';   // RELEASE R3: the backup is drawn bar-less (D-258), as the player's
    document.body.classList.toggle('holo-immersive', immersive);
    return function() { document.body.classList.remove('holo-immersive'); };
  }, [screen]);


  // B-863 · R-NPC-4 — the module reports its position; the host writes the history. `npcPrev` rides on
  // each pushed entry so a BACK can recognise "the entry before this one" and pop to it.
  const handleNpcLocation = useCallback(function(tail, opts) {
    var path = '/gm/npc' + (tail ? '/' + tail : '');
    var cur = window.location.pathname;
    var st = window.history.state || null;
    setNpcPath(tail);
    if (opts && opts.replace) {
      window.history.replaceState(Object.assign({}, st || {}, { screen: 'npc', params: { npcPath: tail } }), '', path);
      return;
    }
    if (opts && opts.back && st && st.screen === 'npc' && st.npcPrev === tail) { window.history.back(); return; }
    if (cur !== path) {
      var prev = cur.indexOf('/gm/npc') === 0 ? cur.slice('/gm/npc'.length).replace(/^\//, '') : null;
      window.history.pushState({ screen: 'npc', params: { npcPath: tail }, npcPrev: prev }, '', path);
    }
  }, []);

  // ENCOUNTERS E3 lap B — the library reports its tail ('encounters[/<id>]'); the host writes /gm/encounters[/<id>],
  // with handleNpcLocation's three moves (replace, back-pop, push).
  const handleEncountersLocation = useCallback(function(tail, opts) {
    var m = /^encounters(?:\/(.+))?$/.exec(tail || '');
    if (!m) return;   // the screen's library never leaves ENCOUNTERS; a stray tail is not a move
    var gid = m[1] ? decodeURIComponent(m[1]) : '';
    var path = pathForScreen('encounters', { groupId: gid });
    var st = window.history.state || null;
    setEncGroupId(gid);
    if (opts && opts.replace) {
      window.history.replaceState(Object.assign({}, st || {}, { screen: 'encounters', params: { groupId: gid } }), '', path);
      return;
    }
    if (opts && opts.back && st && st.screen === 'encounters' && st.encPrev === gid) { window.history.back(); return; }
    if (window.location.pathname !== path) {
      var cur = parsePathToScreen(window.location.pathname);
      var prev = cur.screen === 'encounters' ? (cur.groupId || '') : null;
      window.history.pushState({ screen: 'encounters', params: { groupId: gid }, encPrev: prev }, '', path);
    }
  }, []);

  const handleEnter = useCallback(sectionId => {
    const wipe = WIPE_TYPES[Math.floor(Math.random() * WIPE_TYPES.length)];
    setWipeType(wipe);
    navTo(sectionId);
  }, [navTo]);

  const handleBack = useCallback(() => {
    navTo('landing');
  }, [navTo]);
  // SHIP YARD S4 — a move between the Yard's rooms: one history entry.
  const yardGo = useCallback(function(route) {
    var VV = window.SWRPGVesselView;
    var tail = VV.yardTail(route);
    var from = route && route.from ? { kind: route.from, id: route.fromId != null ? route.fromId : route.id, name: route.fromName || null } : null;
    setScreen('yard'); setYardTailPath(tail); setYardPickerOpen(false); setYardFrom(from);
    if (route.room === 'catalogue') setYardView(route.view === 'matrix' ? 'matrix' : 'index');
    // R-S4CC-2: P1's ?part=, the Yard's one URL key (yardQuery)
    var path = '/gm/yard/' + tail + (route.room === 'catalogue' && route.view === 'matrix' ? '?view=matrix' : VV.yardQuery(route));
    if (window.location.pathname + window.location.search !== path) history.pushState({ screen: 'yard', params: null, yardTail: tail, yardFrom: from }, '', path);
  }, []);
  const yardS4 = screen === 'yard' && !!(window.SWRPGVesselView && window.SWRPGVesselView.yardRoute);
  const yardRouteNow = yardS4 ? window.SWRPGVesselView.yardRoute(yardTailPath, window.location.search) : null;
  // R-S4CC-2 · P1's back (U15's rule): to the owned ship's FIT tab it was opened from, ‹ <SHIP NAME>; else ‹ THE ENTRY.
  // EXIT PLAN is the same move.
  const yardPlanFromShip = !!(yardRouteNow && yardRouteNow.room === 'plan' && yardFrom && yardFrom.kind === 'ship');
  function yardPlanBack() {
    if (yardPlanFromShip) yardGo({ room: 'ship', id: yardFrom.id, tab: 'fit' });
    else yardGo({ room: 'entry', key: yardRouteNow.key });
  }
  function yardShipOwnerName() {   // the ship room's OWNER chip: the ship's own owner, in ownerLabel's words
    var VS = window.SWRPGVessels, VV = window.SWRPGVesselView;
    var r = VS && yardRouteNow ? (VS.getState().vessels || []).filter(function(v) { return v.id === yardRouteNow.id; })[0] : null;
    return r ? VV.ownerLabel(r.owner, yardRoster) : yardOwnerName;   // not held here: the scope's own name
  }
  const yardRoster = yardS4 ? gmDeviceRoster() : [];
  const yardOwnerName = yardS4 ? window.SWRPGVesselView.ownerLabel(yardOwner, yardRoster) : '';

  // F-100 C2: the editor walks its own levels through this history (a save's replaceState included).
  const homebrewNavigate = useCallback(function(path, o) {
    setScreen('homebrew'); setHomebrewPath(path);
    if (window.location.pathname === path) return;
    if (o && o.replace) history.replaceState({ screen: 'homebrew' }, '', path);
    else history.pushState({ screen: 'homebrew' }, '', path);
  }, []);

  // B-881 (ruling npc-paper-rows-1-2 R-NPR-2) — THE BARS TAKE THE NPC LIBRARY'S GROUND, as the player's do
  // (frames D1–D3): paper on the NPC screen (one face since B-871); everywhere else `false` and the bars are
  // what they were. The rules are lib/shared/chrome.css's (the GM links the store's layer too since B-1123).
  const paperChrome = screen === 'npc'
    || screen === 'encounters'   // ENCOUNTERS E3 lap B: the manager is the bench's paper face on its own screen
    || screen === 'campaigns'    // ENCOUNTERS E6 frames (F5-a): the campaigns screen wears the library shell's paper
    || screen === 'landing'   // B-1110 (R-GOS-6): the toolbox on paper wears the paper bars (D-74 "B")
    || screen === 'store'     // B-1123 (R-GOS-28 d): the store's paper face wears them too (D-76 "Paper bars")
    || screen === 'yard';   // SHIP YARD S4 · m1 (G2): the Yard declares the paper ground by name

  return (
    // B-896: under the paper bars (which auto-hide on this screen) the ground is the page, not the black —
    // the rule is lib/shared/chrome.css's `[data-paper-ground]`; the inline black steps aside for it.
    <div data-paper-ground={paperChrome ? '1' : undefined}
      style={{ position: 'relative', width: '100%', height: '100%', background: paperChrome ? undefined : '#000', display: 'flex', flexDirection: 'column' }}>
      {/* F-48 G13: honest update beacon — fixed toast, self-gating (renders null unless a newer deploy exists). */}
      <_VersionBeacon paper={paperChrome} />{/* B-1213 (R-B1213-12): the update bar follows the screen's bars */}

      {/* Suite bar (navigation Phase 1) — persistent home + switcher + identity, above every screen.
          IA lap: the NPC library is bars-resident (the bars ride; no longer immersive). */}
      {/* M2 — GM deep-link into the shared Results Reference (same module HoloDice homes). */}
      {/* Screen-aware ⚙ (ruling suitebar-contextual-settings-concept §3): the three reference cards
          moved to the bar's Help menu; GM ⚙ is Active sources only (one item until GM-scoped settings
          exist — a flat array renders as a plain suite-wide list). */}
      <SuiteBar app="gm" accent="#F5C842" appName="GM HOLOCRON" autohide={screen === 'npc' || screen === 'encounters'} paper={paperChrome}
        /* SHIP YARD S4 — the Yard's top bar (frames H2/H4/U1): ‹ BACK (U8: the GM landing) or U1's ‹ HANGAR, and the
           OWNER chip that opens H4's picker on the hangar. */
        /* B-1123 (R-GOS-28 d, R-A2-2) — the store on paper: ‹ BACK · GM HOLOCRON · ⚙ · ?, BACK bound to the app's
           handleBack, the Yard's idiom on this host; no store chip. */
        context={screen === 'store' ? { exitLabel: 'BACK', onExit: handleBack, chip: null } : yardS4 ? {
          exitLabel: yardRouteNow.room === 'plan' ? (yardPlanFromShip ? String(yardFrom.name || 'THE SHIP').toUpperCase() : 'THE ENTRY')
            : yardRouteNow.room === 'build' ? 'HANGAR'   // S8 · BUILD A SHIP goes back to the HANGAR, as U1 and the ship do
            : (yardRouteNow.room === 'unit' || yardRouteNow.room === 'ship') ? 'HANGAR' : yardRouteNow.room === 'entry' ? 'CATALOGUE' : 'BACK',
          onExit: yardRouteNow.room === 'plan' ? yardPlanBack
            : yardRouteNow.room === 'build' ? function() { yardGo({ room: 'hangar' }); }
            : (yardRouteNow.room === 'unit' || yardRouteNow.room === 'ship') ? function() { yardGo({ room: 'hangar' }); }
            : yardRouteNow.room === 'entry' ? function() { yardGo({ room: 'catalogue' }); } : handleBack,
          // THE SHIP (S1, D-S4C1 B): the ship room's chip names the SHIP's owner; choosing another opens that hangar (H4)
          // JOB 4 · E3: the catalogue's rooms carry the same OWNER chip (GM_TOP); its picker lives on the hangar floor. B-1255: the
          // Ship table is the catalogue drawn as a table and opens the same entry, so it carries the chip too (the drawing @ fa5981119)
          chip: yardRouteNow.room === 'hangar' || yardRouteNow.room === 'unit' || yardRouteNow.room === 'ship' || yardRouteNow.room === 'build'
            || yardRouteNow.room === 'catalogue' || yardRouteNow.room === 'entry' || yardRouteNow.room === 'plan' ? {
            label: 'OWNER · ' + (yardRouteNow.room === 'ship' ? yardShipOwnerName() : yardOwnerName), active: true,
            // the picker (H4) lives on the hangar floor: from a ship, the chip takes the GM there with it open
            onClick: yardRouteNow.room === 'hangar' || yardRouteNow.room === 'unit' ? function() { setYardPickerOpen(!yardPickerOpen); }
              : function() { yardGo({ room: 'hangar' }); setYardPickerOpen(true); },
          } : null,
        } : null}
        settings={[
        // RELEASE R3 (card release-r3-no-loss-card §4, D-258): the whole-save backup, FIRST in ⚙, above "Active sources" —
        // the GM app's first export.
        { label: 'Back up everything…', onSelect: () => handleEnter('backup') },
        // A5 (D-589, mockup M1): the open copy's rule-text import, after "Back up everything…"; holocron.work draws no row
        window.SWRPGSources && window.SWRPGSources.bookTextRemoved && window.SWRPGSources.bookTextRemoved()
          ? { label: 'Fill in rule text…', onSelect: () => setRuleTextOpen(true) } : null,
        // BOOKS-1b — the ACTIVE SOURCES filter (shared with the player; one table, one shelf).
        // B-1711 (ADDENDA 607, 608): one face, paper; B-881's `paper: paperChrome` is retired with the dark face.
        { label: 'Active sources', onSelect: () => window.SWRPGUI && window.SWRPGUI.openActiveSources && window.SWRPGUI.openActiveSources({ accent: '#F5C842', variants: false }) },
        // F-46 D4 — LAYOUT pref (AUTO·MOBILE·DESKTOP), G10 setPref. Desktop engages ≥1024 on AUTO.
        { label: 'LAYOUT', kind: 'segment', value: layoutPref, onSelect: chooseLayout,
          options: [{ value: 'auto', label: 'AUTO' }, { value: 'mobile', label: 'MOBILE' }, { value: 'desktop', label: 'DESKTOP' }] },
      ].filter(Boolean)} />

      {/* Screen layer — flex:1 below the suite bar; the absolute-inset:0 screens resolve against this. */}
      <div id="suite-main" style={{ flex: 1, position: 'relative', minHeight: 0, zIndex: 1 }}>

      {/* A5 — the ⚙ RULE TEXT panel, the player's shared module; the Yard's character core brings the records' loaders */}
      {ruleTextOpen && window.SWRPGRuleTextPanel ? React.createElement(window.SWRPGRuleTextPanel.Panel, {
        prepare: ensureYardCharCore,
        onClose: function() { setRuleTextOpen(false); },
      }) : null}
      <GmLanding onEnter={handleEnter} />
      {screen === 'npc' && (
        <NpcGeneratorScreen onBack={handleBack} wipeType={wipeType} location={npcPath} onLocation={handleNpcLocation}
          encounters={encountersOn() ? 'door' : null} />
      )}
      {/* ENCOUNTERS E3 lap B (shape §4.5, §8): the encounter manager as its own screen, behind swrpg_encounters_door.
          The library's kernel mounts with the bench as its one view (`encounters: 'screen'`): its own head, no tabs. */}
      {screen === 'encounters' && encountersOn() && (
        <NpcGeneratorScreen onBack={handleBack} wipeType={wipeType} location={encountersTail(encGroupId)}
          onLocation={handleEncountersLocation} encounters="screen" />
      )}
      {/* ENCOUNTERS E6 frames (F5-a, R-E6F-1): CAMPAIGNS as its own host screen — G2 the list, G3 one campaign. */}
      {screen === 'campaigns' && campaignsOn() && (
        <GmCampaignsScreen campId={campId} wipeType={wipeType} onBack={handleBack}
          go={function(r) { navTo('campaigns', { campId: (r && r.id) || '' }); }} />
      )}
      {screen === 'map' && (
        <MapErrorBoundary onBack={handleBack}>
          <UniverseMapScreen onBack={handleBack} wipeType={wipeType} />
        </MapErrorBoundary>
      )}
      {screen === 'store' && (
        <GMStoreScreen wipeType={wipeType} tab={storeTab} onCounts={handleStoreCounts} />
      )}
      {yardS4 && (
        /* SHIP YARD S4: the Yard's host — its rooms by K6's route; the bars are the SuiteBar/BottomNav */
        <div style={{ position: 'absolute', inset: 0, zIndex: 20 }} data-screen="yard-s4">
          {React.createElement(GmYardS4, { route: yardRouteNow, owner: yardOwner, roster: yardRoster, go: yardGo,
            pickerOpen: yardPickerOpen,
            onPickOwner: function(k) { setYardOwner(k); setYardPickerOpen(false); if (yardRouteNow.room !== 'hangar') yardGo({ room: 'hangar' }); },
            onClosePicker: function() { setYardPickerOpen(false); },
            catalogueView: yardView, onPlanExit: yardPlanBack })}
        </div>
      )}
      {/* RELEASE R3 (D-258) — the whole-save backup: the ONE screen both apps draw (SWRPGUI.BackupScreen). */}
      {screen === 'backup' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20 }} data-screen="backup">
          <GmBackup onBack={handleBack} />
        </div>
      )}
      {/* F-100 C2 · THE HOMEBREW EDITOR (lib/editor/; the GM face is the approved paper frames, R-FISF-2). */}
      {screen === 'homebrew' && window.SWRPGEditorView && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20 }} data-screen="homebrew">
          {React.createElement(window.SWRPGEditorView.Editor, {
            host: 'gm', appName: 'GM Holocron', path: homebrewPath, navigate: homebrewNavigate, exit: handleBack })}
        </div>
      )}

      </div>{/* /#suite-main */}

      {/* Bottom nav (navigation Phase 2c) — GM sections.
          Hides with the suite bar on the immersive screens (map, homebrew) via body.holo-immersive (2b); on the NPC
          library the bars stay resident and auto-hide on idle instead (`autohide`, useAutoHideChrome). */}
      {screen === 'store' ? (
        /* Contextual bar (mirrors the player store, ADR 0010): inside the store the bottom bar
           BECOMES the store's bar — WEAPONS · ARMOR · GEAR · SHELVES(n). Reuses the kernel's own
           silhouette glyphs (window.SWRPGStore.glyph) so the two faces read identically. Exiting
           restores the global GM bar. */
        /* B-1123 (R-GOS-28 d) — the bar wears the paper chrome (chrome.css), its four items and the
           SHELVES badge in --pp-gold (`.pb-badge`, frames G1–G26). */
        <BottomNav app="gm" label="The Store" accent="#F5C842"
          paper={true}
          activeId={storeTab}
          items={[
            { id: 'weapons', label: 'Weapons', icon: gmStoreGlyph('pistol'), onSelect: function() { setStoreTab('weapons'); } },
            { id: 'armor', label: 'Armor', icon: gmStoreGlyph('armor'), onSelect: function() { setStoreTab('armor'); } },
            { id: 'gear', label: 'Gear', icon: gmStoreGlyph('storage'), onSelect: function() { setStoreTab('gear'); } },
            /* B-1403 (D-279; ruling `b1403-store-attachments-owns` R-B1403-12) — PARTS, before STOCK BOOK as frame GM draws it */
            { id: 'attachments', label: 'Parts', icon: gmStoreGlyph('toolkit'), onSelect: function() { setStoreTab('attachments'); } },
            /* B-1126 (R-GOS-29, D-76 "A. THE STOCK BOOK") — the fourth tab reads STOCK BOOK (`.pb-lab` sets the case). */
            { id: 'shelves', label: 'Shelves', icon: gmNavBadge(navIcon('table'), storeCounts.shelves), onSelect: function() { setStoreTab('shelves'); } },
          ]} />
      ) : yardS4 ? (
        /* SHIP YARD S4: the Yard's own bar — HANGAR · CATALOGUE · MATRIX on the GM host (R-S2M-16.1), paper face */
        <BottomNav app="gm" label="Shipyard" accent="#F5C842" paper={true}
          activeId={(yardRouteNow.room === 'catalogue' || yardRouteNow.room === 'entry' || yardRouteNow.room === 'plan') ? (yardView === 'matrix' && yardRouteNow.room === 'catalogue' ? 'matrix' : 'catalogue') : 'hangar'}
          items={[
            { id: 'hangar', label: 'Hangar', icon: window.SWRPGVesselView.barIcon('hangar'), onSelect: function() { yardGo({ room: 'hangar' }); } },
            { id: 'catalogue', label: 'Catalogue', icon: window.SWRPGVesselView.barIcon('catalogue'), onSelect: function() { yardGo({ room: 'catalogue' }); } },
            { id: 'matrix', label: 'Ship table', icon: window.SWRPGVesselView.barIcon('matrix'), onSelect: function() { yardGo({ room: 'catalogue', view: 'matrix' }); } },
          ]} />
      ) : (
        <BottomNav app="gm" label="GM Holocron" accent="#F5C842" autohide={screen === 'npc' || screen === 'encounters'}
          paper={paperChrome}
          activeId={({ landing: 'hub', npc: 'npcs', yard: 'shipyard', map: 'map', store: 'store' })[screen] || null}
          items={[
            { id: 'hub', label: 'Hub', icon: navIcon('table'), onSelect: function() { navTo('landing'); } },
            { id: 'npcs', label: 'NPCs', icon: navIcon('users'), onSelect: function() { navTo('npc'); } },
            { id: 'shipyard', label: 'Shipyard', icon: navIcon('rocket'), onSelect: function() { navTo('yard'); } },
            { id: 'map', label: 'Map', icon: navIcon('map'), onSelect: function() { navTo('map'); } },
            { id: 'store', label: 'Store', icon: navIcon('shopping-cart'), onSelect: function() { navTo('store'); } },
          ]} />
      )}
    </div>
  );
}

// D-AE6 (a) (argo-a1-export ADDENDUM 5): in a copy whose book text was removed, the book line's titles come from the
// sources index, so the GM loads it (SWRPGSources.ready(): the book vocabulary and the short labels) before the first
// paint. holocron.work ('included') renders at once, exactly as before; ready() never rejects (a failed load is inert).
(function () {
  // B-1874 (ADDENDUM 721): with swrpg_campaigns_door on, the campaign files (and the QR library) run first; load never rejects.
  var SS = window.SWRPGSources, D = window.SWRPGCampaignsDoor;
  function mount() { ReactDOM.createRoot(document.getElementById('root')).render(<GmApp />); }
  function boot() {
    if (SS && SS.bookTextRemoved && SS.bookTextRemoved()) SS.ready().then(mount, mount);
    else mount();
  }
  if (D && D.on()) D.load({ qr: true }).then(boot); else boot();
})();
