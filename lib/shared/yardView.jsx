/* lib/shared/yardView.jsx — SHIPYARD R-Y2-2: the ONE shared Ship Yard browse + entry.
 *
 * The Y1 Corpus index apparatus (chapters / sort / filters / SHOWING / recognition index / MATRIX) and
 * the entry (detail) page, lifted out of gm/app.jsx so BOTH faces mount ONE definition (ruling
 * shipyard-y2 §5 R-Y2-2, fork ruling: overlay + entry-included). window.SWRPGYard = { YardBrowse, useYardState, … }.
 * The entry (YardEntry) and the old dark faces that mounted both were deleted at the S5 flip (R-S5R-18). Compiled classic-script transform (build.mjs) → loads after vendor.js; React is global.
 *
 * Pure presentation over injected data + callbacks: the host passes the vehicle controller, the accent,
 * capability flags, and render-SLOTS for the two GM-globals the census found in the entry (the acquire
 * control + the GM-Edit affiliation panel) — so the module carries NO GM concept. Its one host now: gm/app.jsx
 * GmYardMatrixS4 (MATRIX, R-S5C-4); the S4 catalogue (vesselView.jsx YardCatalogue) reads its state and vocabularies.
 */
(function () {
  'use strict';
  function el() { return React.createElement.apply(null, arguments); }

  // ── R3 Q2a: attachment descriptions render their dice tokens as REAL GLYPHS ──────────────────
  // Same hoist as the store's (lib/store/view.jsx): the ONE shared drawer is `glyphText` in
  // lib/shared/ui.jsx, exported on window.SWRPGUI (ruling r3-q1-item-glyph-restore §3). This module
  // had no SWRPGUI handle at all and rendered `att.description` raw, so a restored "[SE]" would
  // reach the reader as literal brackets. CONSUMED from its one home — not copied, not reimplemented.
  //
  // Read off `window` at CALL time (yardView.js is a classic script loaded after vendor.js, but a
  // call-time read keeps the absent-renderer path real and exercisable). DEGRADE RULE: no drawer →
  // the RAW STRING, never null. A missing renderer must not delete the description.
  function glyphs(text) {
    var U = window.SWRPGUI || {};
    return typeof U.glyphText === 'function' ? U.glyphText(text) : text;
  }

  // ═══ browse + entry helpers (moved verbatim from gm/app.jsx — pure, no external refs) ═══
var YARD_FILTERS_DEFAULT = {
  search: '',
  categories: [],     // ['starfighters', 'freighters', ...]
  affiliations: [],   // ['empire', 'rebellion', ...]
  roles: [],          // focus_secondary values: ['bomber', 'smuggler', ...]
  silMin: 0,
  silMax: 10,
  hasHyperdrive: false,
  hideRestricted: false,
};

// URL query-param ↔ filters state conversion. Tight schema — multi-select
// uses comma-separated values, ranges only serialize if non-default,
// booleans use '1'. Keeps shared URLs short. Sort state is also included.
function yardFiltersFromUrl(searchString) {
  var p = new URLSearchParams(searchString || '');
  return {
    search: p.get('q') || '',
    categories: p.get('cat') ? p.get('cat').split(',').filter(Boolean) : [],
    affiliations: p.get('affil') ? p.get('affil').split(',').filter(Boolean) : [],
    roles: p.get('role') ? p.get('role').split(',').filter(Boolean) : [],
    silMin: parseInt(p.get('silMin'), 10) || 0,
    silMax: p.get('silMax') ? (parseInt(p.get('silMax'), 10) || 10) : 10,
    hasHyperdrive: p.get('hd') === '1',
    hideRestricted: p.get('hide') === '1',
  };
}

function yardSortFromUrl(searchString) {
  var p = new URLSearchParams(searchString || '');
  return {
    sortColumn: p.get('sort') || 'name',
    sortDir: p.get('dir') === 'desc' ? 'desc' : 'asc',
    viewMode: p.get('view') === 'matrix' ? 'matrix' : (p.get('view') === 'vessels' ? 'vessels' : 'yard'),
  };
}

function yardStateToUrl(filters, sortColumn, sortDir, viewMode) {
  var p = new URLSearchParams();
  if (filters.search) p.set('q', filters.search);
  if (filters.categories.length) p.set('cat', filters.categories.join(','));
  if (filters.affiliations.length) p.set('affil', filters.affiliations.join(','));
  if (filters.roles.length) p.set('role', filters.roles.join(','));
  if (filters.silMin > 0) p.set('silMin', String(filters.silMin));
  if (filters.silMax < 10) p.set('silMax', String(filters.silMax));
  if (filters.hasHyperdrive) p.set('hd', '1');
  if (filters.hideRestricted) p.set('hide', '1');
  if (sortColumn && sortColumn !== 'name') p.set('sort', sortColumn);
  if (sortDir === 'desc') p.set('dir', 'desc');
  if (viewMode === 'matrix') p.set('view', 'matrix');
  else if (viewMode === 'vessels') p.set('view', 'vessels');
  var q = p.toString();
  return q ? '?' + q : '';
}

// Count active filters for the FILTER button label badge.
function countActiveYardFilters(f) {
  var n = 0;
  if (f.search) n++;
  if (f.categories.length) n++;
  if (f.affiliations.length) n++;
  if (f.roles.length) n++;
  if (f.silMin > 0 || f.silMax < 10) n++;
  if (f.hasHyperdrive) n++;
  if (f.hideRestricted) n++;
  return n;
}

// Oggdude Description strings use bracket pseudo-HTML: [H3]heading[h3]
// for section heads, [P] for paragraph breaks, \n\n between blocks.
// Strip the bracket tags and return clean paragraph strings.
function cleanVehicleDescription(desc) {
  if (!desc) return [];
  return String(desc)
    .replace(/\[H\d\]/gi, '\n\n')
    .replace(/\[h\d\]/gi, '\n\n')
    .replace(/\[P\]/gi, '\n\n')
    .replace(/\[BR\]/gi, '\n')
    .replace(/\[\/?[Ii]\]/g, '')          // strip italic tags (no semantic in our render)
    .replace(/\[\/?[Bb]\]/g, '')          // strip bold tags too
    .split(/\n\n+/)
    .map(function(p) { return p.trim(); })
    .filter(function(p) { return p.length > 0; });
}

// Normalize a string for fuzzy comparison: lowercase + strip everything
// except alphanumerics. Used by the first-paragraph-vs-name dedupe so
// that '[I]Venator[i] - Class Star Destroyer' matches the name field
// 'Venator-Class Star Destroyer' despite the tag remnants and spacing.
function fuzzyNormalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// A vessel's description as the reader gets it: cleaned (above), and a FIRST paragraph that only repeats
// the ship's name (an OggDude `[H3]Name[h3]` head) dropped, by the fuzzy form. ONE rule for every surface
// that prints a hull's prose — the catalogue entry and the player landing's Shipyard tile (ruling
// `player-landing-fixes` R-PLF-10).
function vehicleParagraphs(desc, name) {
  var fz = fuzzyNormalize(name);
  return cleanVehicleDescription(desc).filter(function (p, i) { return i > 0 || fuzzyNormalize(p).indexOf(fz) === -1; });
}

// Detect the OggDude "Please see page N of the [Source] Sourcebook for
// details." placeholder pattern (used for ~20 vehicles where prose was
// stripped for IP caution, mostly Rise of the Separatists + Knights of
// Fate). Returns { page, source } if matched, else null.
//
// Anchored on "Please see" prefix + " for details" suffix to avoid false
// positives on real prose that incidentally contains "see page".
function detectDescriptionPlaceholder(paragraphs) {
  if (!paragraphs || paragraphs.length === 0) return null;
  var text = paragraphs.join(' ').trim();
  var m = text.match(/^Please see (?:page|p\.)\s*(\d+) of the (.+?)(?:\s+Sourcebook| book| sourcebook|)\s+for details\.?\s*$/i);
  if (!m) return null;
  // Clean the captured source: some descriptions cite multiple supplements
  // ("Unlimited Power Sourcebook, or page 73 of the Rise of the Separatists
  // Sourcebook"). Trim at the first comma and strip a trailing "Sourcebook"
  // suffix so the display reads "Full description in <Source>, page <N>."
  var source = m[2].trim().split(',')[0].trim().replace(/\s+Sourcebook\s*$/i, '');
  return { page: m[1], source: source };
}

// Friendly affiliation labels (matches taxonomy.json but inline so we don't
// have to thread the taxonomy through to every callsite).
var YARD_AFFILIATION_LABELS = {
  empire: 'Galactic Empire',
  rebellion: 'Rebel Alliance',
  republic: 'Galactic Republic',
  cis: 'Confederacy of Independent Systems',
  hutt: 'Hutt Cartel',
  mandalorian: 'Mandalorian',
  independent: 'Independent / Scoundrel',
  multi_faction: 'Multi-faction',
};

// Category options used by the filter chip row — derived from the
// taxonomy but kept inline for the same reason as AFFILIATION_LABELS.
var YARD_CATEGORY_OPTIONS = [
  { slug: 'starfighters',    label: 'Starfighters' },
  { slug: 'freighters',      label: 'Freighters' },
  { slug: 'capital_ships',   label: 'Capital Ships' },
  { slug: 'transports',      label: 'Transports' },
  { slug: 'patrol_gunships', label: 'Patrol & Gunships' },
  { slug: 'airspeeders',     label: 'Airspeeders' },
  { slug: 'landspeeders',    label: 'Landspeeders' },
  { slug: 'walkers_tanks',   label: 'Walkers & Tanks' },
  { slug: 'support',         label: 'Stations & Other' },
];

// SHIPYARD browse §3.2: the index's SORT control — a small list, not the matrix's column headers.
var YARD_SORT_OPTIONS = [
  { key: 'name',          label: 'NAME' },
  { key: 'price_credits', label: 'PRICE' },
  { key: 'silhouette',    label: 'SILHOUETTE' },
  { key: 'rarity',        label: 'RARITY' },
];
function yardSortLabel(col) {
  for (var i = 0; i < YARD_SORT_OPTIONS.length; i++) {
    if (YARD_SORT_OPTIONS[i].key === col) return YARD_SORT_OPTIONS[i].label;
  }
  return String(col || 'name').toUpperCase();
}

// SHIPYARD browse §3.2: the SHOWING line is the document's honest state — the applied facets as
// tappable terms (each clears itself), NOT a chip row. Returns [{label, clear}]; search is its own field.
function yardShowingTerms(filters, setFilters) {
  var terms = [];
  function patch(field, value) {
    setFilters(function(prev) { var c = Object.assign({}, prev); c[field] = value; return c; });
  }
  // C-YE1: chapters retired — each applied category is its own tappable term (the FILTERS category facet
  // is their one home; the SHOWING line names them). No chapter grouping in bar OR state.
  filters.categories.forEach(function (slug) {
    var opt = YARD_CATEGORY_OPTIONS.filter(function (o) { return o.slug === slug; })[0];
    terms.push({ label: (opt ? opt.label : slug).toUpperCase(), clear: function () {
      patch('categories', filters.categories.filter(function (x) { return x !== slug; }));
    } });
  });
  filters.affiliations.forEach(function (slug) {
    terms.push({ label: (YARD_AFFILIATION_LABELS[slug] || slug).toUpperCase(), clear: function () {
      patch('affiliations', filters.affiliations.filter(function (x) { return x !== slug; }));
    } });
  });
  filters.roles.forEach(function (slug) {
    terms.push({ label: String(slug).toUpperCase(), clear: function () {
      patch('roles', filters.roles.filter(function (x) { return x !== slug; }));
    } });
  });
  if (filters.silMin > 0 || filters.silMax < 10) {
    var sl = filters.silMin > 0 && filters.silMax < 10 ? 'SILHOUETTE ' + filters.silMin + '–' + filters.silMax
      : filters.silMin > 0 ? 'SILHOUETTE ≥ ' + filters.silMin
      : 'SILHOUETTE ≤ ' + filters.silMax;
    terms.push({ label: sl, clear: function () { setFilters(function (p) {
      return Object.assign({}, p, { silMin: 0, silMax: 10 }); }); } });
  }
  if (filters.hasHyperdrive) terms.push({ label: 'HYPERDRIVE', clear: function () { patch('hasHyperdrive', false); } });
  if (filters.hideRestricted) terms.push({ label: 'NO RESTRICTED', clear: function () { patch('hideRestricted', false); } });
  return terms;
}

// (C-YE1: YARD_CHAPTERS + activeYardChapter deleted — the contextual bar is now a VIEW switch, not a
//  category grouping; category filtering lives only in the FILTERS sheet's facet.)

// Affiliation chips — same order as taxonomy.
var YARD_AFFILIATION_OPTIONS = [
  { slug: 'empire',        label: 'Empire' },
  { slug: 'rebellion',     label: 'Rebellion' },
  { slug: 'republic',      label: 'Republic' },
  { slug: 'cis',           label: 'CIS' },
  { slug: 'hutt',          label: 'Hutt' },
  { slug: 'mandalorian',   label: 'Mandalorian' },
  { slug: 'independent',   label: 'Independent' },
  { slug: 'multi_faction', label: 'Multi-faction' },
];

// Role chips — focus_secondary values surfaced by the ETL heuristics.
// Users see these as filter options without knowing they're a "secondary
// focus" stack behind the scenes.
var YARD_ROLE_OPTIONS = [
  { slug: 'bomber',     label: 'Bomber' },
  { slug: 'smuggler',   label: 'Smuggler' },
  { slug: 'cargo',      label: 'Cargo' },
  { slug: 'patrol',     label: 'Patrol' },
  { slug: 'long_range', label: 'Long-Range' },
  { slug: 'stealth',    label: 'Stealth' },
  { slug: 'racing',     label: 'Racing' },
  { slug: 'luxury',     label: 'Luxury' },
];

// B-1596 (DECISIONS D-411 bind 4; ruling `release-r7-bug-burndown` ADDENDUM 295): a category's and an affiliation's display
// words are the catalogue's own facet labels (the approved `Docs/mockups/shipyard-catalogue.html` @ 23c3ce85 draws them), read
// from the two option lists above — never a second table of names. A key with no option shows as itself, as before.
function yardOptionLabel(opts, slug) {
  for (var i = 0; i < opts.length; i++) { if (opts[i].slug === slug) return opts[i].label; }
  return slug;
}
function yardCategoryLabel(slug) { return yardOptionLabel(YARD_CATEGORY_OPTIONS, slug); }
function yardAffiliationLabel(slug) { return yardOptionLabel(YARD_AFFILIATION_OPTIONS, slug); }

// Matrix view columns — module-scoped so re-renders don't re-allocate.
// Each entry: key (used for sort + default value lookup), label, optional
// align ('left' default), optional value(vehicle, effectiveAffiliation)
// for derived/formatted cells, optional maxWidth (string CSS).
var MATRIX_COLUMNS = [
  { key: 'name',                 label: 'Name', maxWidth: '320px' },
  { key: 'type',                 label: 'Type', maxWidth: '180px' },
  { key: 'category',             label: 'Category', maxWidth: '120px',
    value: function(v) { return v.category ? yardCategoryLabel(v.category) : '—'; } },   // B-1596: the facet's words
  { key: 'affiliation',          label: 'Affiliation',
    value: function(v, eff) { return eff ? yardAffiliationLabel(eff) : '—'; } },
  { key: 'silhouette',           label: 'Sil',   align: 'center' },
  { key: 'speed',                label: 'Speed',   align: 'center' },
  { key: 'handling',             label: 'Handling',   align: 'center' },
  { key: 'armor',                label: 'Arm',   align: 'center' },
  { key: 'hull_trauma',          label: 'HT',    align: 'center' },
  { key: 'system_strain',        label: 'SS',    align: 'center' },
  { key: 'encumbrance_capacity', label: 'Enc',   align: 'center' },
  { key: 'passengers',           label: 'Passengers',   align: 'center' },
  { key: 'hyperdrive_primary',   label: 'HD',    align: 'center' },
  { key: 'price_credits',        label: 'Price', align: 'right',
    value: function(v) { return v.price_credits != null ? v.price_credits.toLocaleString() + ' cr' : '—'; } },
  { key: 'rarity',               label: 'Rarity',   align: 'center' },
];

  // ─── filter sheet subcomponents ───
// Filter drawer section + chip subcomponents — kept inline / file-local
// since they're only used by YardBrowse's filter drawer.
// The FILTERS sheet's facet groups render as ruled LEDGER sections (R-Y1-1): a section-rule head +
// full-width option ROWS over hairlines (Corpus voice), not accent-tinted pill chips (ban item 2).
function YardFilterSection({ label, children }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div className="ci-sechead" style={{ margin: '0 0 2px' }}><h2>{label}</h2></div>
      <div>{children}</div>
    </div>
  );
}

function YardFilterChip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="ci-facet-row" data-active={active ? '1' : '0'}
      role="checkbox" aria-checked={active}>
      <span>{children}</span>
      <span className="ci-facet-mark" aria-hidden="true">{active ? '▪' : ''}</span>
    </button>
  );
}

  // ─── useYardState: the browse state + logic (both hosts call this; shared so it isn't duplicated) ───
  function useYardState(opts) {
    opts = opts || {};
    var ctrl = opts.ctrl;
    var syncUrl = opts.syncUrl, urlBase = opts.urlBase || '/gm/yard', isDetail = opts.isDetail;
    var search = opts.initialSearch != null ? opts.initialSearch : (typeof window !== 'undefined' ? window.location.search : '');
    var _v = React.useState(function () { return yardSortFromUrl(search).viewMode; }), viewMode = _v[0], setViewMode = _v[1];
    var _sc = React.useState(function () { return yardSortFromUrl(search).sortColumn; }), sortColumn = _sc[0], setSortColumn = _sc[1];
    var _sd = React.useState(function () { return yardSortFromUrl(search).sortDir; }), sortDir = _sd[0], setSortDir = _sd[1];
    var _f = React.useState(function () { return yardFiltersFromUrl(search); }), filters = _f[0], setFilters = _f[1];
    var _dr = React.useState(false), filterDrawerOpen = _dr[0], setFilterDrawerOpen = _dr[1];
    var _sm = React.useState(false), sortMenuOpen = _sm[0], setSortMenuOpen = _sm[1];

    // B-342: the ONE shared ready-gate. `lib/shared/ui.jsx`'s `useActiveSources` already owned
    // this — it subscribes to the vocab load AND the swrpg-sources-changed broadcast, and returns
    // the resolved {ready, index, off} rather than a bare counter. This surface carried a private
    // re-implementation of the subscription half; a fifth copy anywhere is the defect by name
    // (R-RGC-2). vendor.js ships SWRPGUI before any per-app module, so the hook is present.
    // BOOKS-1b: re-render when the vocab loads / the ACTIVE SOURCES set changes, so the index
    // re-filters live. `srcTick` FED the filteredSortedVehicles memo below, so it is replaced by a
    // value that changes on exactly the same two events rather than dropped: `ready` flips when the
    // vocabulary lands, and the off-set key changes when a book is toggled. A bare counter also
    // ticked on events that changed neither; this is if anything tighter.
    var _src = (window.SWRPGUI || {}).useActiveSources();
    var srcTick = String(_src.ready) + '|' + Object.keys(_src.off || {}).sort().join(',');

    React.useEffect(function () {
      if (!syncUrl || isDetail) return;
      var query = yardStateToUrl(filters, sortColumn, sortDir, viewMode);
      var target = urlBase + query;
      var current = window.location.pathname + window.location.search;
      if (current !== target) history.replaceState({ screen: 'yard' }, '', target);
    }, [filters, sortColumn, sortDir, viewMode, isDetail]);

    // BOOKS-1b — ACTIVE SOURCES filter (discovery) + the aorbeta hide-list (ruling D2). Vehicles carry
    // `source`/`source_code` (not a `sources` array), so adapt to the predicate's shape; both fields
    // resolve to the same book id (D1a aliases). Ownership is untouched — owned vessels render from the
    // roster/vesselStore, not this browse list. SHIP YARD S4 · JOB 4: its own stage, so the catalogue's facet
    // counts and its foot read the same discovery list the index filters (no behaviour change).
    var discovery = React.useMemo(function () {
      var _src = window.SWRPGSources && window.SWRPGSources.current();
      var _idx = _src && _src.index;
      return ctrl.allVehicles.filter(function (v) {
        if (_idx && _idx.hiddenSourceCodes[v.source_code]) return false;   // D2: aorbeta ships never in discovery
        if (_idx && !window.SWRPGSources.isActiveWith({ sources: [v.source, v.source_code].filter(Boolean) }, _idx, _src.off)) return false;
        return true;
      });
    }, [ctrl.allVehicles, srcTick]);
    var filteredSortedVehicles = React.useMemo(function () {
      var q = (filters.search || '').toLowerCase().trim();
      var list = discovery.filter(function (v) {
        if (q && v.name.toLowerCase().indexOf(q) === -1) return false;
        if (filters.categories.length && filters.categories.indexOf(v.category) === -1) return false;
        if (filters.affiliations.length) {
          var eff = ctrl.getEffectiveAffiliation(v);
          if (filters.affiliations.indexOf(eff) === -1) return false;
        }
        if (filters.roles.length && filters.roles.indexOf(v.focus_secondary) === -1) return false;
        if (v.silhouette != null) { if (v.silhouette < filters.silMin || v.silhouette > filters.silMax) return false; }
        if (filters.hasHyperdrive) { if (!(v.hyperdrive_primary != null && v.hyperdrive_primary > 0)) return false; }
        if (filters.hideRestricted && v.restricted) return false;
        return true;
      });
      list.sort(function (a, b) {
        var va = a[sortColumn]; var vb = b[sortColumn];
        var nullA = va == null || va === ''; var nullB = vb == null || vb === '';
        if (nullA && nullB) return 0;
        if (nullA) return 1;
        if (nullB) return -1;
        if (typeof va === 'string' || typeof vb === 'string') { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      return list;
    }, [discovery, sortColumn, sortDir, filters, ctrl.getEffectiveAffiliation]);

    function handleSort(key) {
      if (sortColumn === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      else { setSortColumn(key); setSortDir('asc'); }
    }
    function toggleFilterArray(field, value) {
      setFilters(function (prev) {
        var current = prev[field] || [];
        var next = current.indexOf(value) === -1 ? current.concat([value]) : current.filter(function (x) { return x !== value; });
        var copy = Object.assign({}, prev); copy[field] = next; return copy;
      });
    }
    function patchFilter(field, value) { setFilters(function (prev) { var copy = Object.assign({}, prev); copy[field] = value; return copy; }); }
    function resetFilters() { setFilters(YARD_FILTERS_DEFAULT); }
    var activeFilterCount = countActiveYardFilters(filters);
    var showingTerms = yardShowingTerms(filters, setFilters);
    return { viewMode: viewMode, setViewMode: setViewMode, sortColumn: sortColumn, sortDir: sortDir,
      filters: filters, setFilters: setFilters, filterDrawerOpen: filterDrawerOpen, setFilterDrawerOpen: setFilterDrawerOpen,
      sortMenuOpen: sortMenuOpen, setSortMenuOpen: setSortMenuOpen, handleSort: handleSort, toggleFilterArray: toggleFilterArray,
      patchFilter: patchFilter, resetFilters: resetFilters,
      activeFilterCount: activeFilterCount, showingTerms: showingTerms, filteredSortedVehicles: filteredSortedVehicles, discovery: discovery };
  }

  // ═══ YardBrowse defined below (its entry page, YardEntry, and its bar, ViewBar, were deleted at the S5 flip, R-S5R-18) ═══
  // ─── YardBrowse: the Corpus index (browse) — apparatus + recognition grid + MATRIX + filters sheet.
  //     State comes from props.y (window.SWRPGYard.useYardState); GM-vessels tab arrives as a slot. ───
  function YardBrowse(props) {
    var y = props.y;
    var ctrl = props.ctrl, YARD_ACCENT = props.accent || '#F4A460';
    var filters = y.filters, patchFilter = y.patchFilter, sortColumn = y.sortColumn, sortDir = y.sortDir,
      sortMenuOpen = y.sortMenuOpen, setSortMenuOpen = y.setSortMenuOpen, handleSort = y.handleSort,
      viewMode = y.viewMode, setViewMode = y.setViewMode, showingTerms = y.showingTerms,
      activeFilterCount = y.activeFilterCount, filterDrawerOpen = y.filterDrawerOpen,
      setFilterDrawerOpen = y.setFilterDrawerOpen, resetFilters = y.resetFilters,
      toggleFilterArray = y.toggleFilterArray, filteredSortedVehicles = y.filteredSortedVehicles;
  return (
    // key forces remount on return from any ship detail page so the
    // landing always opens at the top (intentional, may revisit if a
    // "remember scroll position on back" feature gets requested).
    <div key="yard-landing" style={{
      position: 'fixed', inset: 0, background: '#02010a',
      color: 'var(--ci-ink)', overflow: 'auto', zIndex: 50, paddingBottom: '64px',
    }}>
      {/* Card hover + matrix row hover via injected stylesheet — inline style
          objects don't support :hover, so a scoped <style> block does the
          interactive states. Class names are gm-yard-* to avoid collisions. */}
      <style>{`
        .gm-yard-card {
          transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
        }
        .gm-yard-card:hover {
          transform: translateY(-2px);
          border-color: rgba(244,164,96,0.6) !important;
          box-shadow: 0 4px 16px rgba(244,164,96,0.18);
        }
        .gm-yard-card:hover .gm-yard-chevron {
          color: #FFD18E !important;
          text-shadow: 0 0 8px rgba(244,164,96,0.6);
        }
        .gm-matrix-row { transition: background 150ms ease; }
        .gm-matrix-row:hover { background: rgba(244,164,96,0.10); }
        .gm-matrix-header { cursor: pointer; user-select: none; }
        .gm-matrix-header:hover { color: ${YARD_ACCENT} !important; }
      `}</style>

      <div style={{ padding: '64px 24px 24px', maxWidth: '1280px', margin: '0 auto' }}>
        {props.onExit ? <button type="button" onClick={props.onExit} className="ci-backbar" style={{ background:'transparent', border:0, cursor:'pointer', padding:0, marginBottom:'10px' }}><span className="ci-chev">◀</span>&nbsp; CLOSE</button> : null}
        {/* Index apparatus (browse-ux §3.2) — the document's own head, search, SORT, and the honest
            SHOWING state line. The near-full-word REFINE control opens the facet sheet (§3.3). No
            BACK pill (the suite bar owns escape) and no white FILTER pill (§5 fix). Corpus voice. */}
        <div className="ci" style={{ '--ci-accent': YARD_ACCENT, marginBottom: '16px' }}>
          <div className="ci-runhead">
            <span>FLEET REGISTRY</span>
            <span className="ci-folio">{ctrl.allVehicles.length} ENTRIES</span>
          </div>
          <h1 className="ci-designation" style={{ fontSize: 'clamp(30px,9vw,46px)', margin: '6px 0 14px' }}>
            SHIPYARD
          </h1>

          {/* search + sort + view toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {viewMode !== 'vessels' && (
            <input
              type="search"
              placeholder="Search the index…"
              aria-label="Search the index"
              value={filters.search}
              onChange={(e) => patchFilter('search', e.target.value)}
              style={{
                flex: 1, minWidth: '150px',
                background: 'var(--ci-mat)', border: '1px solid var(--ci-hair)',
                color: 'var(--ci-ink)', padding: '9px 12px',
                fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.04em',
                minHeight: '40px', outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--ci-accent-rule)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--ci-hair)'; }}
            />
            )}

            {/* SORT control — a small list (browse-ux §3.2), not the matrix column headers */}
            {viewMode !== 'vessels' && (
            <div style={{ position: 'relative' }}>
              <button type="button" className="ci-index-ctrl"
                onClick={() => setSortMenuOpen(function (o) { return !o; })}
                aria-haspopup="listbox" aria-expanded={sortMenuOpen}>
                SORT: {yardSortLabel(sortColumn)} {sortDir === 'asc' ? '↑' : '↓'}
              </button>
              {sortMenuOpen && (
                <div className="ci-sort-menu" role="listbox">
                  {YARD_SORT_OPTIONS.map(function (opt) {
                    var active = sortColumn === opt.key;
                    return (
                      <button key={opt.key} type="button" className="ci-sort-item" role="option"
                        aria-selected={active} data-active={active ? '1' : '0'}
                        onClick={() => { handleSort(opt.key); setSortMenuOpen(false); }}>
                        {opt.label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            )}
            {viewMode === 'vessels' && (
              <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '11px',
                letterSpacing: '0.1em', color: 'var(--ci-accent-furn)', textTransform: 'uppercase' }}>
                {props.vesselsLabel || 'VESSELS'}
              </div>
            )}

            {/* C-YE1: the view switch moved OUT of the top apparatus into the contextual bottom bar
                (the S4 Yard's bar now). Filter/sort stay here — their one home. */}
          </div>

          {viewMode !== 'vessels' && (
          <React.Fragment>
          <hr className="ci-rule ci-heavy" style={{ margin: '12px 0 8px' }} />

          {/* SHOWING line — furniture-as-state: the applied facets as tappable terms, always present */}
          <div className="ci-showing">
            <span className="ci-showing-key">SHOWING:</span>{' '}
            {ctrl.loading ? (
              <span className="ci-showing-all">LOADING…</span>
            ) : showingTerms.length === 0 ? (
              <span className="ci-showing-all">ALL ENTRIES</span>
            ) : (
              showingTerms.map(function (t, i) {
                return (
                  <button key={i} type="button" className="ci-showing-term" onClick={t.clear}
                    aria-label={'Clear ' + t.label}>{t.label} <span className="ci-x">✕</span></button>
                );
              })
            )}
            {!ctrl.loading && (
              <span className="ci-showing-count"> — {
                // BOOKS-1b: honest whenever anything is filtered — a facet/search OR the ACTIVE SOURCES
                // filter / the aorbeta hide (which reduces the list even with no user facet active).
                (filteredSortedVehicles.length !== ctrl.allVehicles.length)
                  ? (filteredSortedVehicles.length + ' OF ' + ctrl.allVehicles.length)
                  : String(ctrl.allVehicles.length)
              }</span>
            )}
          </div>

          {/* REFINE control — opens the facet sheet (§3.3); near-full-word, accent-dim bordered, no pill */}
          <button type="button" data-testid="yard-filters" className="ci-refine" onClick={() => setFilterDrawerOpen(true)}>
            ☰ FILTERS{activeFilterCount > 0 ? ' · ' + activeFilterCount : ''}
          </button>
          </React.Fragment>
          )}
        </div>

        {viewMode === 'vessels' && props.vesselsSlot ? props.vesselsSlot() : null}

        {ctrl.error && (
          <p style={{ fontFamily: 'var(--font-body)', color: '#FF5555', marginTop: '8px' }}>
            Failed to load vehicle library: {String(ctrl.error)}
          </p>
        )}

        {!ctrl.loading && ctrl.allVehicles.length === 0 && (
          <p style={{ fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.55)', marginTop: '24px' }}>
            No vehicles loaded.
          </p>
        )}

        {/* Empty filtered result */}
        {!ctrl.loading && ctrl.allVehicles.length > 0 && filteredSortedVehicles.length === 0 && (
          <div style={{
            padding: '40px 24px', textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px', marginTop: '12px',
          }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px',
              color: 'rgba(255,255,255,0.7)', margin: '0 0 8px',
            }}>NO SHIPS MATCH</p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '13px',
              color: 'rgba(255,255,255,0.45)', margin: '0 0 16px',
            }}>
              Try widening your filters or clearing the search.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              style={{
                background: 'rgba(244,164,96,0.12)',
                border: '1px solid rgba(244,164,96,0.4)',
                color: YARD_ACCENT,
                padding: '8px 16px', borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px', letterSpacing: '0.1em',
                cursor: 'pointer', minHeight: '40px',
              }}
            >RESET FILTERS</button>
          </div>
        )}

        {/* YARD mode's recognition index (§5.2) is RETIRED with the archive art it drew (D-196, D-198, D-212; card
            `shipyard-schematic-build-card` R-SSB-5): its dark plates were the last archive-art consumer, unreachable
            since the view switch left YardBrowse (C-YE1). The Matrix table below is the browse's one view. */}
        {/* MATRIX mode — dense sortable spec table */}
        {!ctrl.loading && filteredSortedVehicles.length > 0 && viewMode === 'matrix' && (
          <div style={{
            overflowX: 'auto',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
          }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              color: 'rgba(255,255,255,0.85)',
            }}>
              <thead>
                <tr style={{
                  background: 'rgba(244,164,96,0.08)',
                  borderBottom: '1px solid rgba(244,164,96,0.3)',
                }}>
                  {MATRIX_COLUMNS.map(function(col) {
                    var active = sortColumn === col.key;
                    return (
                      <th
                        key={col.key}
                        className="gm-matrix-header"
                        onClick={() => handleSort(col.key)}
                        style={{
                          padding: '10px 12px',
                          textAlign: col.align || 'left',
                          fontWeight: 700, letterSpacing: '0.1em',
                          color: active ? YARD_ACCENT : 'rgba(255,255,255,0.75)',
                          whiteSpace: 'nowrap', textTransform: 'uppercase',
                          fontSize: '10px',
                        }}
                      >
                        {col.label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredSortedVehicles.map(function(v) {
                  var effectiveAffiliation = ctrl.getEffectiveAffiliation(v);
                  return (
                    <tr
                      key={v.key}
                      className="gm-matrix-row"
                      onClick={function(){ props.onOpenVehicle(v.key); }}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        opacity: v.stats_complete ? 1 : 0.5,
                      }}
                    >
                      {MATRIX_COLUMNS.map(function(col) {
                        var val = col.value ? col.value(v, effectiveAffiliation) : v[col.key];
                        if (val == null || val === '') val = '—';
                        return (
                          <td
                            key={col.key}
                            style={{
                              padding: '8px 12px',
                              textAlign: col.align || 'left',
                              whiteSpace: 'nowrap',
                              color: col.key === 'name' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)',
                              maxWidth: col.maxWidth,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filter drawer — slide-in from right with backdrop. Live-applied
          (no Apply button); changes propagate immediately into the
          filtered list above. Reset clears all filters at once. */}
      {filterDrawerOpen && (
        <div
          onClick={() => setFilterDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 100,
          }}
        />
      )}
      {filterDrawerOpen && (
        <div
          className="ci"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            maxHeight: '82vh',
            '--ci-accent': YARD_ACCENT,
            background: 'var(--ci-mat)',
            borderTop: '1px solid var(--ci-accent-rule)',
            padding: '20px 22px calc(24px + env(safe-area-inset-bottom))',
            zIndex: 101,
            overflowY: 'auto',
            boxShadow: '0 -12px 32px rgba(0,0,0,0.6)',
          }}
        >
          {/* Sheet header — Filters (browse-ux §3.3; Jason renamed from "Refine the Index" 2026-07-11) */}
          <div style={{
            display: 'flex', alignItems: 'center',
            marginBottom: '18px', gap: '12px',
          }}>
            <h2 className="ci-designation" style={{ fontSize: '20px', margin: 0 }}>FILTERS</h2>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--ci-label)', letterSpacing: '0.1em',
            }}>{filteredSortedVehicles.length} OF {ctrl.allVehicles.length}</span>
            <button
              type="button"
              onClick={() => setFilterDrawerOpen(false)}
              style={{
                marginLeft: 'auto',
                background: 'transparent', border: '1px solid var(--ci-hair)',
                color: 'var(--ci-ledger)', cursor: 'pointer',
                width: '34px', height: '34px',
                fontFamily: 'var(--font-mono)', fontSize: '14px',
              }}
              aria-label="Close refine sheet"
            >✕</button>
          </div>

          {/* CATEGORY chips */}
          <YardFilterSection label="CATEGORY">
            {YARD_CATEGORY_OPTIONS.map(function(opt) {
              var active = filters.categories.indexOf(opt.slug) !== -1;
              return (
                <YardFilterChip
                  key={opt.slug}
                  active={active}
                  onClick={() => toggleFilterArray('categories', opt.slug)}
                >{opt.label}</YardFilterChip>
              );
            })}
          </YardFilterSection>

          {/* AFFILIATION chips */}
          <YardFilterSection label="AFFILIATION">
            {YARD_AFFILIATION_OPTIONS.map(function(opt) {
              var active = filters.affiliations.indexOf(opt.slug) !== -1;
              return (
                <YardFilterChip
                  key={opt.slug}
                  active={active}
                  onClick={() => toggleFilterArray('affiliations', opt.slug)}
                >{opt.label}</YardFilterChip>
              );
            })}
          </YardFilterSection>

          {/* ROLE chips (focus_secondary heuristic) */}
          <YardFilterSection label="ROLE">
            {YARD_ROLE_OPTIONS.map(function(opt) {
              var active = filters.roles.indexOf(opt.slug) !== -1;
              return (
                <YardFilterChip
                  key={opt.slug}
                  active={active}
                  onClick={() => toggleFilterArray('roles', opt.slug)}
                >{opt.label}</YardFilterChip>
              );
            })}
          </YardFilterSection>

          {/* SILHOUETTE range */}
          <YardFilterSection label={'SILHOUETTE  ' + filters.silMin + ' — ' + filters.silMax}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-mono)',
                  fontSize: '9px', color: 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.1em', marginBottom: '4px',
                }}>MIN</label>
                <input
                  type="range" min="0" max="10" step="1"
                  value={filters.silMin}
                  onChange={(e) => patchFilter('silMin', Math.min(parseInt(e.target.value, 10), filters.silMax))}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-mono)',
                  fontSize: '9px', color: 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.1em', marginBottom: '4px',
                }}>MAX</label>
                <input
                  type="range" min="0" max="10" step="1"
                  value={filters.silMax}
                  onChange={(e) => patchFilter('silMax', Math.max(parseInt(e.target.value, 10), filters.silMin))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </YardFilterSection>

          {/* HYPERDRIVE + RESTRICTED toggles */}
          <YardFilterSection label="OTHER">
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', padding: '6px 0',
              fontFamily: 'var(--font-body)', fontSize: '13px',
              color: 'rgba(255,255,255,0.85)',
            }}>
              <input
                type="checkbox"
                checked={filters.hasHyperdrive}
                onChange={(e) => patchFilter('hasHyperdrive', e.target.checked)}
              />
              Hyperdrive-capable only
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', padding: '6px 0',
              fontFamily: 'var(--font-body)', fontSize: '13px',
              color: 'rgba(255,255,255,0.85)',
            }}>
              <input
                type="checkbox"
                checked={filters.hideRestricted}
                onChange={(e) => patchFilter('hideRestricted', e.target.checked)}
              />
              Hide restricted vehicles
            </label>
          </YardFilterSection>

          {/* Reset / done footer — Corpus identity (R-Y1-1): flat mono, accent-dim rule, no rounded pills */}
          <div style={{
            display: 'flex', gap: '10px', marginTop: '22px',
            paddingTop: '16px', borderTop: '1px solid var(--ci-accent-rule)',
          }}>
            <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0}
              className="ci-facet-btn" data-disabled={activeFilterCount === 0 ? '1' : '0'}
              style={{ flex: 1 }}>RESET</button>
            <button type="button" data-testid="yard-filters-done" onClick={() => setFilterDrawerOpen(false)}
              className="ci-facet-btn ci-facet-btn-go" style={{ flex: 1 }}>DONE</button>
          </div>
        </div>
      )}
      {props.contextBar}
    </div>
  );
  }

  window.SWRPGYard = { YardBrowse: YardBrowse, useYardState: useYardState, YARD_AFFILIATION_LABELS: YARD_AFFILIATION_LABELS,
    // SHIP YARD S4 · JOB 4: the catalogue's paper face (lib/shared/vesselView.jsx `YardCatalogue`) reads the same vocabularies
    // and the same record cleaning as this browse and entry — one copy of each, never a second
    YARD_CATEGORY_OPTIONS: YARD_CATEGORY_OPTIONS, YARD_ROLE_OPTIONS: YARD_ROLE_OPTIONS, YARD_AFFILIATION_OPTIONS: YARD_AFFILIATION_OPTIONS,
    YARD_SORT_OPTIONS: YARD_SORT_OPTIONS, yardSortLabel: yardSortLabel,
    // B-1255 (D-411 item 12): the Ship table's columns, drawn on paper by the catalogue (vesselView.jsx CatTable) — ONE list;
    // B-1596: the display words of a category and an affiliation key
    MATRIX_COLUMNS: MATRIX_COLUMNS, yardCategoryLabel: yardCategoryLabel, yardAffiliationLabel: yardAffiliationLabel,
    cleanVehicleDescription: cleanVehicleDescription, fuzzyNormalize: fuzzyNormalize, detectDescriptionPlaceholder: detectDescriptionPlaceholder,
    vehicleParagraphs: vehicleParagraphs };
})();
