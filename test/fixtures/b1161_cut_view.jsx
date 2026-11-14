/* lib/store/view.jsx — THE STORE (ITM-V1): the item-catalog kernel + player store surface.
 *
 * One shared kernel (R-ITM3): grid + rarity color language, the item overlay (art stage · spec
 * plate · quality chips · description · cite · find-difficulty), carried-vs-shelf COMPARE, the
 * COUNTER (cart with editable price tags, finalize = ONE equipment write, warn-never-block
 * R-ITM1), and persistent HOLDS. Compiled as a /lib/ classic transform (build.mjs) → loaded
 * after /vendor.js, before the app bundle. Exposes window.SWRPGStore.
 *
 * Host contract (player today; the GM store inherits this shell in ITM-B):
 *   Store({ accent, tab, shopFor, roster, qualitiesDb, onCounts, onPickCharacter, onFinalize,
 *           onOpenSheet })
 *   - tab: 'weapons'|'armor'|'gear'|'holds'|'counter' (the contextual bottom bar owns it, ADR 0010)
 *   - shopFor: saved-character record ({id,name,accent,sheetData,...}) or null ("just browsing")
 *   - onFinalize(charId, nextEquipment, summary) → host persists; module clears the counter
 *   - persistence stays HOST-owned: the module never writes a sheet; it builds nextEquipment
 *     from canonical id-refs (§8 id-ref law — the canonical record is never copied).
 *
 * RAW constants are cited at PRINTED pages (R-CITE1): Table 5-1 rarity→find difficulty +
 * Restricted→Streetwise (EotE CRB p.149-150); sell-back ¼/½/¾ tiers (EotE CRB p.150).
 * Band boundaries cross-checked against the table's own example items in our registries
 * (Glow Rod 0→Simple … Thermal Detonator 8→Daunting) — see RULES_FOUNDATION_ITEMS.md.
 *
 * Voice rule (R-ITM7): every string here is plain/gamey mechanics copy. No keeper persona
 * (struck by Jason, items-program-scope §7b).
 */
(function () {
  // F-102 A3: one call into the SHARED resolver (lib/shared/sources.js). Deliberately NOT a local
  // reimplementation — player/app.jsx already carries one over the same index, and a third would
  // be the second-resolution-path defect. Absent index (vocab still loading, or a bare harness)
  // returns the string unchanged, so the plate degrades to today's behaviour rather than blanking.
  function citeLabel(src) {
    var S = (typeof window !== 'undefined') && window.SWRPGSources;
    var idx = (typeof window !== 'undefined') && window._swrpgSourcesIndex;
    return (S && S.sourceLabel) ? S.sourceLabel(idx, src) : src;
  }

  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef,
      useMemo = React.useMemo, useCallback = React.useCallback;
  var UI = window.SWRPGUI || {};
  var QualityChips = UI.QualityChips;
  var useBackToClose = UI.useBackToClose;

  // ── R3 Q2a: item descriptions render their dice tokens as REAL GLYPHS ────────────────────────
  // Q1 restored 2,116 canonical [XX] tokens to the item catalogues; this surface rendered
  // `it.description` as a raw string, so a reader saw "adds [SE] to any check" — machine notation
  // where a die symbol belongs. The renderer already ships: `glyphText` in lib/shared/ui.jsx, now
  // exported on window.SWRPGUI (ruling r3-q1-item-glyph-restore §3). CONSUMED, never copied.
  //
  // Read off `window` at CALL time, not off the module-load `UI` snapshot, for two reasons: the
  // drawer is reachable even if vendor.js load order ever changes, and the absent-renderer path
  // stays exercisable at runtime. DEGRADE RULE: no drawer → the RAW STRING, never null. A missing
  // renderer must not delete the description.
  function glyphs(text) {
    var U = window.SWRPGUI || {};
    return typeof U.glyphText === 'function' ? U.glyphText(text) : text;
  }

  /* ── B-667 · THE BOOK'S COLUMN IS NOT THE AUTHOR'S LINE BREAK ───────────────────────────────────
     The registry's prose is HARD-WRAPPED AT THE PRINTED PAGE'S COLUMN — OggDude's extraction keeps
     the book's own line endings (the A280's 1,177-character description carries 22 of them), so
     rendering them as breaks gives a ragged half-width paragraph: "one of the galaxy's most /
     ubiquitous / service rifles". A SINGLE newline inside a paragraph is a COLUMN artefact and not an
     author's break; a BLANK line is a paragraph. So the paragraphs are rebuilt and only the blank
     lines survive, which is what `white-space:pre-line` on `.st-read .hp-prose` then renders.

     This is the board's own `prose()` (`store_build.py`, whose docstring carries the same reason),
     ported. THE DARK FACE IS NOT TOUCHED: it renders the raw string under `white-space:pre-wrap`, so
     the book's column has always been visible there. Paper's rule, on paper only, said in one place. */
  function paperProse(txt) {
    return String(txt || '').replace(/\r/g, '').split(/\n\s*\n/)
      .map(function (par) { return par.split(/\s+/).filter(Boolean).join(' '); })
      .filter(Boolean).join('\n\n');
  }

  // F-46 D2: the shared layout hook (one home). The store's desktop shape is GRID-N (the catalog
  // widens its columns) + a content-max cap — NOT a SplitPane rail: the store has no discrete
  // filter/cart column (categories live in the ADR-0010 bottom bar; a category rail would be the
  // EXCLUDED D-C2 side-nav concept). Spec-reality gap flagged in the D2 gate.
  var Desktop = window.SWRPGDesktop || {};
  var useLayoutMode = Desktop.useLayoutMode || function () { return 'mobile'; };

  // B-665 — THE BAND, for the paper face (ruling `store-paper-concept` R-SPC-1). The board draws its
  // handheld shape with a CLASS (`.st-hh`) and carries not one `@media` or `@container` in the whole
  // of `BOARD_CSS`, so the band has to arrive from JS.
  //
  // COMPOSED EXACTLY AS `useCreatorBand` IS (player/app.jsx) — `useLayoutMode`'s 1024 seam, which
  // honours the ⚙ LAYOUT preference, AND the 1367 matchMedia — and composed HERE rather than passed
  // in as a prop, because three hosts mount this kernel and a prop would make the band the host's
  // opinion of the same screen. The seams are read from `lib/shared/bands.js` (audit item B: one
  // home for the ladder), never typed.
  function useStoreBand() {
    var mode = useLayoutMode();
    var _w = useState(function () {
      try { return !!(window.matchMedia && window.matchMedia(window.SWRPGBands.MQ_WIDE).matches); } catch (e) { return false; }
    });
    var wide = _w[0], setWide = _w[1];
    useEffect(function () {
      try {
        var mq = window.matchMedia(window.SWRPGBands.MQ_WIDE);
        var on = function () { setWide(mq.matches); };
        mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
        return function () { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
      } catch (e) {}
    }, []);
    return mode !== 'desktop' ? 'mobile' : (wide ? 'wide' : 'mid');
  }

  /* ══════════════════════════════════════════════════════
     RAW CONSTANTS (cited) — the Table 5-1 rarity/find logic is the SHARED module
     window.SWRPGRarity (lib/store/rarity.js), consumed here and by the GM tool (ITM-B).
  ══════════════════════════════════════════════════════ */
  var Rarity = window.SWRPGRarity || {};
  var RARITY_BANDS = Rarity.RARITY_BANDS;
  var rarityBand = Rarity.rarityBand;
  var RESTRICTED_COLOR = '#FF8A3D';
  var FIND_CITE = Rarity.FIND_CITE || 'EotE CRB p.150';
  // Sell-back tiers — ¼ of list on a success, ½ / ¾ on better results (EotE CRB p.150).
  var SELL_TIERS = [
    { frac: 0.25, label: '¼' },
    { frac: 0.5,  label: '½' },
    { frac: 0.75, label: '¾' },
  ];
  var SELL_CITE = 'EotE CRB p.150';

  /* ══════════════════════════════════════════════════════
     SESSION STATE + THE COUNTER, PERSISTED (B-669; R-SPC-3) + HOLDS (persistent)
  ══════════════════════════════════════════════════════ */
  // WAS: `var session = { cart: [] }` — a module singleton, "session-local UI state" per the ITM-A
  // contract (D-ITM1), cleared by every reload. R-SPC-3 AMENDS THAT CONTRACT DELIBERATELY on Jason's
  // word ("save the counter", STORE_SHAPE §3): the counter is paper that remembers.
  //
  // THE DURABLE CONTRACT, verbatim from the ruling — this comment is the schema and the code below
  // is its only writer:
  //
  //   localStorage.swrpg_store_counter_v1
  //   { v: 1, lines: [ { id, qty, price? } ], shopFor?: id|null }
  //
  //   · `id` is the SECTION-QUALIFIED catalog key (row 2's `<section>:<id>`); a bare legacy id is
  //     resolved once against the catalog and rewritten, exactly as a hold is.
  //   · `price` is present ONLY WHEN EDITED — the list price is re-read from the registry at render,
  //     never stored (derived beats fixed). "Edited" is the BOARD'S own test (`slip_rows`:
  //     `paid is not None and paid != price`), so typing the list price back clears the key.
  //   · ONE GLOBAL COUNTER. The singleton was already global and the shop has one counter: the
  //     player's two doors and the creator's gear step read and write the SAME slip, which is what
  //     STORE_SHAPE §4 means by "the catalog is the same book at every door". The GM door has no
  //     slip at all (no `onFinalize`) and never touches it.
  //   · `shopFor` is a HINT, re-validated at load: an id that no longer matches a roster record
  //     degrades to JUST BROWSING, never to an error.
  //   · No expiry.
  //   · Unresolvable lines are KEPT AND SAID, never silently dropped (the law that governs holds).
  //   · Finalize clears the lines. Holds (`swrpg_store_holds_v1`) are untouched — a separate concept.
  //
  // THE IN-MEMORY LINE IS NOT THE RECORD, and the difference is one field: `{ itemId, section, qty,
  // priceEach, edited }`. `priceEach` is ALWAYS a resolved number so that `buildNextEquipment` and
  // every host that calls it are untouched; `edited` is what decides whether `price` is written. An
  // un-edited line's `priceEach` is re-read from the catalog the moment the catalog lands (the
  // migration effect in `Store`), which is where "re-read at render" actually happens.
  var COUNTER_KEY = 'swrpg_store_counter_v1';
  // SHIP YARD S4 · G-7 — A LINE TAGGED FOR A SHIP (ruling `shipyard-s4-workbench-contracts` R-S4WC-1, ratified with
  // A1–A7; its ADDENDUM 1's R-S4WC-16/17, the store's condition and note; the brief's A1.4 as ratified with B7/B8). The
  // record stays `v:1` and the change is ADDITIVE: a line may carry `for: { vessel, then: 'fit'|'hold', att?|mount? }`, and
  // its id names one of three sections — `vpart:<vehicle-attachments key>`, `vmod:<key>/<added_options id>`,
  // `vweap:<vehicle-weapons key>`. A version bump would make every older reader see an EMPTY counter; additive, an older
  // build keeps the line, which resolves to no shelf and is kept, said and charged nothing (B-687's posture).
  //   · A1 — a vessel line with no `for` is UNDELIVERABLE, like a line whose ship is gone. An OLDER build re-saving the
  //     counter drops `for`; THIS build's load → re-save keeps `for`, and any key it does not know, on every vessel line
  //     (R-S4WC-17): `extra` is that pass-through, and `counterRecordOf` writes it back.
  //   · A6 — a `vpart` line's `qty` is n copies: FIT installs n, HOLD writes one CargoLine of qty n. A `vmod` and a `vweap`
  //     line fix `qty` at 1: a mod is priced by its place in line order (A5), and a weapon fits one mount (A1.4).
  //   · A2 — lib/store parses NO vehicle data and holds no vehicle price table: a vessel line's name, price and whether it
  //     can be delivered come from the HOST, through `Store`'s `vessel` seam (its `plan`), never from here.
  var VESSEL_SECTIONS = { vpart: 1, vmod: 1, vweap: 1 };
  var COUNTER_KNOWN = { id: 1, qty: 1, price: 1, for: 1 };
  function counterLineOf(rec) {
    var id = String(rec.id);
    var i = id.indexOf(':');
    var edited = rec.price != null && isFinite(Number(rec.price));
    var line = {
      itemId: id,
      // The section rides in the key since row 2; a bare legacy line has none until the catalog
      // resolves it. `buildNextEquipment` reads `section`, so it is filled there and not guessed.
      section: i > 0 ? id.slice(0, i) : null,
      qty: Math.max(1, Number(rec.qty) || 1),
      priceEach: edited ? Math.max(0, Number(rec.price)) : 0,
      edited: edited,
    };
    if (VESSEL_SECTIONS[line.section]) {
      if (rec.for && typeof rec.for === 'object') line.for = Object.assign({}, rec.for);
      Object.keys(rec).forEach(function (k) { if (!COUNTER_KNOWN[k]) (line.extra = line.extra || {})[k] = rec[k]; });
      if (line.section !== 'vpart') line.qty = 1;
    }
    return line;
  }
  function counterRecordOf(l) {
    var rec = { id: l.itemId, qty: Math.max(1, Number(l.qty) || 1) };
    if (l.edited) rec.price = Math.max(0, Number(l.priceEach) || 0);
    if (VESSEL_SECTIONS[l.section]) {
      if (l.for) rec.for = Object.assign({}, l.for);
      if (l.extra) Object.keys(l.extra).forEach(function (k) { rec[k] = l.extra[k]; });
    }
    return rec;
  }
  // A LINE'S NAME ON THE SLIP. A gear line is its id — one line per id, and ADD bumps it, as ever. A vessel line is its id
  // AND whom it is for: the same part can sit on the counter for two ships, or for one ship's FIT and its HOLD. Every
  // writer that picks one line (the tag, the stepper, REMOVE, finalize's keep) picks by this.
  function lineKeyOf(l) {
    var f = l && l.for;
    if (!f) return l.itemId;
    return l.itemId + '→' + [f.vessel, f.then, f.att != null ? f.att : f.mount != null ? f.mount : ''].join('/');
  }
  function loadCounter() {
    var empty = { lines: [], shopFor: null };
    try {
      var raw = localStorage.getItem(COUNTER_KEY);
      if (!raw) return empty;
      var rec = JSON.parse(raw);
      // THE VERSION IS A GATE, not a decoration: a record written by a future shape is not read as
      // if it were this one. A line with no id at all is not a line and is the only thing dropped.
      if (!rec || typeof rec !== 'object' || Number(rec.v) !== 1) return empty;
      var lines = Array.isArray(rec.lines) ? rec.lines : [];
      return {
        lines: lines.filter(function (l) {
          return l && typeof l === 'object' && l.id != null && String(l.id) !== '';
        }).map(counterLineOf),
        shopFor: (rec.shopFor == null || rec.shopFor === '') ? null : String(rec.shopFor),
      };
    } catch (e) { return empty; }
  }
  function saveCounter(lines, shopForId) {
    try {
      localStorage.setItem(COUNTER_KEY, JSON.stringify({
        v: 1,
        lines: (lines || []).map(counterRecordOf),
        shopFor: shopForId == null ? null : String(shopForId),
      }));
    } catch (e) {}
  }
  var _counter0 = loadCounter();
  // The singleton stays — it is what `cartCount()` reads for the host bar's badge before the store
  // has rendered anything — but it now OPENS FROM THE RECORD rather than from nothing.
  var session = { cart: _counter0.lines, shopFor: _counter0.shopFor };

  // R-S4WC-16 — THE ONE WAY ONTO THE COUNTER. The store's ADD TO COUNTER (`Store`'s `addToCart`) and the Yard's TO THE
  // COUNTER (the exported `addToCounter`) run this same path: NORMALIZE (the record's own reader, `counterLineOf`) →
  // QUALIFY (`qualifyKey`, as a legacy bare id is qualified; a vessel id is qualified by its section) → PERSIST
  // (`commitCounter` → `saveCounter`). An add identical to a line already on the slip (the same `lineKeyOf`) bumps a gear
  // or `vpart` line's qty and leaves a `vmod` or `vweap` line as it is (A6: their qty is 1). `price`, when handed, is the
  // LIST price the tag opens with — never an edit, so the record keeps no `price` (R-SPC-3).
  function withLine(cart, add) {
    var line = counterLineOf({ id: add.id, qty: 1, for: add.for });
    var q = qualifyKey(line.itemId, (catalogCache && catalogCache.byId) || {});
    if (q !== line.itemId) line = counterLineOf({ id: q, qty: 1, for: add.for });
    if (add.section) line.section = add.section;
    if (add.price != null) line.priceEach = Math.max(0, Number(add.price) || 0);
    var key = lineKeyOf(line), hit = false;
    var next = (cart || []).map(function (l) {
      if (hit || lineKeyOf(l) !== key) return l;
      hit = true;
      return (VESSEL_SECTIONS[l.section] && l.section !== 'vpart') ? l : Object.assign({}, l, { qty: (Number(l.qty) || 1) + 1 });
    });
    return hit ? next : next.concat([line]);
  }
  // A mounted `Store` hands its state setter here, so a line put on the counter from outside it (the Yard's door) is the
  // line it draws. The store's own writes set their own state (`setCart`).
  var _counterSeen = null;
  function commitCounter(next) { session.cart = next; saveCounter(next, session.shopFor); }
  function addToCounter(add) {
    if (!add || add.id == null || String(add.id) === '') return false;
    var next = withLine(session.cart, add);
    commitCounter(next);
    if (_counterSeen) _counterSeen(next);
    return true;
  }
  // B7 — THE WRITER'S ONE-READER TWIN: the Yard reads the vessel lines on the counter AT RENDER (SWAP PENDING on FIT's
  // weapons row) and is handed the RECORD's shape (`counterRecordOf`), never the in-memory line: it never parses
  // `swrpg_store_counter_v1` itself.
  function counterVesselLines() {
    return (session.cart || []).filter(function (l) { return !!VESSEL_SECTIONS[l.section]; }).map(counterRecordOf);
  }

  /* ══════════════════════════════════════════════════════
     SECTION-QUALIFIED ITEM KEYS (R-SPC-3; B-663)
  ══════════════════════════════════════════════════════ */
  // `thermal_cutter` is a record in BOTH weapons.json and gear.json. `buildCatalog` used to write
  // `byId[bare id]` iterating weapons → armor → gear, so gear OVERWROTE the weapon and the WEAPONS
  // shelf opened the tool: no damage, no crit, no qualities. The catalog is now addressed by
  // `<section>:<id>` — the shape `smoke_b39_pregen_idrefs` already prints.
  //
  // THE FENCE, and it is the whole of the risk: a CATALOG address is not a REGISTRY id. Everything
  // that leaves this module for a sheet (id-refs, §8 law), an art file, IndexedDB user art, or a GM
  // shelf carries the BARE id — `it.regId`, or `bareId(key)` for a key that has already been stored.
  // The registries themselves are NOT touched (whether the two thermal cutters are one item is the
  // data half of B-663).
  function bareId(key) {
    if (key == null) return key;
    var i = String(key).indexOf(':');
    return i < 0 ? String(key) : String(key).slice(i + 1);
  }
  // F-100 M8 (ruling f100-m8-build R-M8G-14) — THE STACK TARGET, one rule for the store's two stacking writes
  // (buildNextEquipment, moveToInventoryFor): the gear entry a new copy of `refId` joins, or undefined (a new line). An
  // entry carrying `talentMarks` is never a target — the mark is ON that copy (R-M8G-12), so a copy bought or moved
  // later must not inherit its improvement.
  function stackTargetOf(gear, refId) {
    return (gear || []).find(function (g) { return g && typeof g === 'object' && g.id === refId && !(Array.isArray(g.talentMarks) && g.talentMarks.length); });
  }
  // A key persisted before this row (a hold, a counter line, a GM shelf entry) is BARE. It is
  // resolved ONCE, against the loaded catalog, by scanning the sections in the OLD ORDER —
  // weapons → armor → gear — and taking the first shelf that carries it. NOTE, for the one id where
  // it matters: the old `byId` map resolved `thermal_cutter` to the GEAR record (the later write
  // won), so a legacy hold on it now resolves to the WEAPON. That is the order the ruling names.
  var SECTION_ORDER = ['weapons', 'armor', 'gear'];
  function qualifyKey(key, byId) {
    if (key == null || String(key).indexOf(':') >= 0) return key;
    for (var i = 0; i < SECTION_ORDER.length; i++) {
      var q = SECTION_ORDER[i] + ':' + key;
      if (byId[q]) return q;
    }
    return key;   // unresolvable — kept as it is and said (never dropped, R-ITM5's posture)
  }

  // B-687 — THE ONE RESOLVABILITY PREDICATE, read by the SLIP and by the WRITE. A counter line
  // resolves to the catalog record under its own key, or under the key `qualifyKey` gives a bare
  // legacy line; anything else is NOT ON THE SHELF. The paper slip already drew that state (its
  // `gone` branch — the hatched mat and GONE_WHY) with exactly this expression, so naming it once is
  // what keeps the sentence the player reads and the decision the write takes from drifting apart.
  //
  // A BOOK SWITCHED OFF IS A DIFFERENT THING and is deliberately NOT unresolvable: that record
  // exists, resolves here, and is written like any other line (the slip hatches it and says which —
  // `data-off-book`). What this finds is a line whose id matches NO record in any loaded section: a
  // registry edit, a book's records pulled, a hand-edited record, an id that never existed. It is the
  // CATALOG's answer and not the registry's, which also means a `store_hidden` record (R-B39-1) reads
  // as not on the shelf — the same thing the slip has always said about it.
  function lineRecord(itemId, byId) {
    if (!byId) return null;
    return byId[itemId] || byId[qualifyKey(itemId, byId)] || null;
  }
  // B-707 — AND WHAT THE DEAL CHARGES, as a predicate over a LINE: the write's own refusal
  // (`buildNextEquipment`) and the slip's TOTAL / AFTER / FINALIZE both ask THIS, so the number the
  // player reads before the tap is the number the tap takes. A line the catalog cannot resolve keeps
  // its row, its hand-written tag and its sentence; it is counted in no sum. With NO catalog nothing can
  // be judged and every line is chargeable, which is the write's behaviour before B-687. A switched-off
  // book resolves here and is charged — frame G's drawn off-book line stays inside its TOTAL.
  // G-7 (R-S4WC-1 A3/A4; B8) — A VESSEL LINE IS JUDGED BY THE HOST'S PLAN, never by the catalog: `vplan` is the `vessel`
  // seam's answer over the slip (`plan(lines)` → `{ ok: {<line key>: true}, price: {<line key>: n|null}, … }`), taken
  // BEFORE the debit. No plan (a host that hands no seam) → nothing about a ship can be judged, so the line is kept, said
  // and charged nothing, exactly as an unresolvable line is. A vessel line's un-edited price is the plan's (A2).
  // G-7 — THE HOST'S SEAM, READ: `seam.plan(records)` answers each vessel line IN LINE ORDER (the Yard's `counterSeam`:
  // `{ lines: [{ ok, why, price, name, ship, … }] }`); the store keys that answer by its OWN line key, so the total, the
  // tag, the slip's face and the debit all read one map — `{ ok, price, row, loading }`. No seam → null (nothing about a
  // ship can be judged). The records are the counter's own (`counterRecordOf`): the seam reads what the counter saves.
  function vesselPlanOf(seam, lines) {
    if (!seam || typeof seam.plan !== 'function') return null;
    var vl = (lines || []).filter(function (l) { return !!VESSEL_SECTIONS[l.section]; });
    var ans = vl.length ? seam.plan(vl.map(counterRecordOf)) : null;
    var rows = ans && Array.isArray(ans.lines) ? ans.lines : [];
    var out = { ok: {}, price: {}, row: {}, loading: !!seam.loading };
    vl.forEach(function (l, i) {
      var r = rows[i] || {}, k = lineKeyOf(l);
      out.ok[k] = !!r.ok; out.price[k] = r.price; out.row[k] = r;
    });
    return out;
  }
  function lineCharged(line, byId, vplan) {
    if (VESSEL_SECTIONS[line.section]) return !!(vplan && vplan.ok && vplan.ok[lineKeyOf(line)]);
    return !byId || !!lineRecord(line.itemId, byId);
  }
  function lineEach(line, vplan) {
    if (VESSEL_SECTIONS[line.section] && !line.edited) {
      var p = vplan && vplan.price ? vplan.price[lineKeyOf(line)] : null;
      return typeof p === 'number' && isFinite(p) ? Math.max(0, p) : 0;
    }
    return Math.max(0, Number(line.priceEach) || 0);
  }

  var HOLDS_KEY = 'swrpg_store_holds_v1';
  function loadHolds() {
    try {
      var raw = localStorage.getItem(HOLDS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveHolds(ids) {
    try { localStorage.setItem(HOLDS_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════
     CATALOG (canonical registries → display shape, fetch-once)
  ══════════════════════════════════════════════════════ */
  // F-100 UD-1f (ruling f100-ud1-contracts H6): re-pointed to THE ONE items loader
  // (lib/shared/itemRegistries.js). It used to fetch the same cache key in a 3-file shape — "whoever
  // fetches first wins". Returns the DISCOVERY view (active user packs folded in), or null on failure.
  function loadRegistries() {
    return window.SWRPGItemRegistries.load();
  }

  var catalogCache = null;
  function buildCatalog(regs) {
    var S = window.SWItems;
    var bySection = { weapons: [], armor: [], gear: [] };
    var byId = {};
    ['weapons', 'armor', 'gear'].forEach(function (section) {
      Object.keys(regs[section] || {}).forEach(function (id) {
        var rec = regs[section][id];
        // R-B39-1 (ruling `b39-b44-pregen-idref-scope`): rows added for printed-folio items, our own
        // authored props, and the RAW unarmed profile are resolvable by id-ref on any sheet but never
        // appear in browse. The store's just-looking shelf stays curated; a pregen's loadout still
        // renders every one of them. One filter, at the one place the catalog is built.
        if (rec && rec.store_hidden) return;
        var it = S.canonicalToStore(rec, section);
        if (!it) return;
        it.sources = rec.sources || null;   // cite plate (canonicalToStore doesn't map it)
        bySection[section].push(it);
        byId[it.key] = it;
      });
      bySection[section].sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    });
    return { bySection: bySection, byId: byId };
  }

  /* ══════════════════════════════════════════════════════
     ART LADDER (R-ITM6) — manifest-gated WebP over SVG glyph, never a broken image
  ══════════════════════════════════════════════════════ */
  // art/items/manifest.json lists the ids that HAVE art (ART-1 pipeline output). Absent/empty
  // manifest → every item renders its silhouette glyph; zero per-item 404s by construction.
  var artSet = null, artPromise = null;
  function loadArtManifest() {
    if (artSet) return Promise.resolve(artSet);
    if (artPromise) return artPromise;
    artPromise = fetch('art/items/manifest.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { artSet = new Set((j && j.items) || []); return artSet; })
      .catch(function () { artSet = new Set(); return artSet; });
    return artPromise;
  }
  function artUrl(id, thumb) {
    return 'art/items/' + id + (thumb ? '.160' : '') + '.webp';
  }

  /* ══════════════════════════════════════════════════════
     ITEM GLYPHS — delegated to lib/store/glyphs.js (window.SWRPGGlyphs), the one library
     ══════════════════════════════════════════════════════ */
  // The 58 filled silhouettes Jason approved on 2026-09-22 (Docs/mockups/store-glyphs-v3.html), the
  // record→family rule, the fit that keeps every glyph the same optical size, and the CC BY credit line
  // all live in the shared module, so the store bars (player/gm storeGlyph) and this kernel draw the same
  // picture. glyphFamily / glyphSvg keep their names here for the exports and the node guard.
  function glyphFamily(item) {
    var G = window.SWRPGGlyphs;
    return G ? G.familyFor(item) : 'parcel';
  }
  function glyphSvg(family, size, color) {
    var G = window.SWRPGGlyphs;
    if (!G) return null;                       // the module is loaded before this file; null, never a broken frame
    return G.svg(family, size, color || 'currentColor');
  }

  // The art stage: WebP when the manifest has it, silhouette glyph otherwise (R-ITM6 — art
  // absence is never a broken image; <img> only renders for manifest-listed ids).
  function ArtStage(props) {
    var item = props.item, size = props.size || 64, big = !!props.big;
    // R-SPC-3: art files (`art/items/<id>.webp`) and the BYOA IndexedDB store are keyed by the BARE
    // registry id. `item.key` is the catalog address and would name a file that does not exist.
    var artId = item.regId || bareId(item.key);
    var _m = useState(artSet), manifest = _m[0], setManifest = _m[1];
    // BYOA top rung (R-BYOA1/2): a user image from IndexedDB wins over repo art. Loaded async
    // (the id-set gates a sync check, then the blob objectURL resolves); subscribed so an import
    // or a single-replace re-renders every open surface live.
    var _u = useState(null), userUrl = _u[0], setUserUrl = _u[1];
    useEffect(function () {
      if (!manifest) loadArtManifest().then(setManifest);
    }, []);
    useEffect(function () {
      var UA = window.SWRPGUserArt;
      if (!UA || !artId) return undefined;
      var alive = true;
      function refresh() {
        UA.ready().then(function () {
          if (!alive) return;
          if (UA.hasArt(artId)) UA.getUrl(artId).then(function (u) { if (alive) setUserUrl(u); });
          else setUserUrl(null);
        });
      }
      refresh();
      var unsub = UA.subscribe(refresh);
      return function () { alive = false; if (unsub) unsub(); };
    }, [artId]);
    var band = rarityBand(item.rarity);
    var tint = band ? band.color : 'rgba(255,255,255,0.5)';
    var repoArt = manifest && artId && manifest.has(artId);
    // ladder: userUrl → repo art → glyph
    var imgSrc = userUrl || (repoArt ? artUrl(artId, !big) : null);
    /* ── B-667 · THE MAT ON PAPER ──────────────────────────────────────────────────────────────────
       The board drew ONE generic glyph in every mat (a fixture's single SVG, and its own caption says
       so: `art/items/manifest.json` holds 0 items). The app has the LADDER (R-ITM6), and the item READ
       is the one surface where a user's own image is both WRITTEN and LOOKED AT — USE YOUR OWN IMAGE
       stands in this very read's door row. A paper mat that could not show what that door writes would
       be a door onto nothing, so the mat is the SAME component and the SAME ladder wearing the board's
       plate: `hp-plate st-mat`, whose size and ink are the stylesheet's (`.st-read .st-mat` 92px,
       `.st-mat svg` 48px in `--doc-ink-muted`).

       WHAT DOES NOT COME WITH IT IS THE RARITY TINT. The dark stage's gradient, border and glow are
       ALL band colour, and R-SPC-4 keeps Table 5-1's six colours off the paper. So the paper branch
       carries no `tint` at all — that is the whole difference between the two returns. */
    if (props.paper) {
      // B-1124 — `gm` adds the GM door's `gm-g` (frames G1–G26: the mat's glyph in the muted ink); nothing else moves.
      return h('div', { className: 'hp-plate st-mat' + (props.gm ? ' gm-g' : ''), 'aria-hidden': true },
        imgSrc
          ? h('img', {
              src: imgSrc, alt: '', key: imgSrc,
              style: { width: '100%', height: '100%', objectFit: userUrl ? 'cover' : 'contain' },
              onError: function (e) { e.target.style.display = 'none'; },
            })
          : glyphSvg(glyphFamily(item), 48));
    }
    return h('div', {
      'aria-hidden': true,
      style: {
        width: size, height: size, flexShrink: 0, borderRadius: big ? 10 : 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(70% 70% at 50% 42%, ' + tint + (big ? '2A' : '1E') + ', rgba(255,255,255,0.02) 75%)',
        border: '1px solid ' + tint + (big ? '44' : '2E'),
        boxShadow: big ? ('0 0 26px ' + tint + '22, inset 0 0 18px rgba(0,0,0,0.35)') : 'none',
        overflow: 'hidden',
      },
    },
      imgSrc
        ? h('img', {
            src: imgSrc, alt: '', key: imgSrc,
            style: { width: '100%', height: '100%', objectFit: userUrl ? 'cover' : 'contain' },
            onError: function (e) { e.target.style.display = 'none'; },  // ladder never shows a broken frame
          })
        : glyphSvg(glyphFamily(item), Math.round(size * 0.74), tint)
    );
  }

  /* ══════════════════════════════════════════════════════
     SMALL PARTS — price tag, rarity chip, find line
  ══════════════════════════════════════════════════════ */
  function fmtCr(n) {
    var v = Number(n);
    if (isNaN(v)) return '—';
    return v.toLocaleString('en-US') + ' cr';
  }

  // The price tag — paper layer (warm, tag-shaped). affordable → faint chit-glow, never a gate.
  function PriceTag(props) {
    var glow = !!props.affordable;
    return h('span', {
      style: {
        display: 'inline-block', padding: '2px 8px',
        fontFamily: 'var(--font-mono)', fontSize: props.big ? 13 : 10, letterSpacing: '0.06em',
        color: '#F5DFA8',
        background: 'rgba(245,200,66,0.07)',
        border: '1px ' + (props.edited ? 'dashed' : 'solid') + ' rgba(245,200,66,' + (glow ? '0.55' : '0.25') + ')',
        borderRadius: 3,
        boxShadow: glow ? '0 0 10px rgba(245,200,66,0.18)' : 'none',
        whiteSpace: 'nowrap',
      },
    }, props.children);
  }

  function RarityChip(props) {
    var band = rarityBand(props.rarity);
    if (!band) return h('span', {
      style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)' },
    }, 'RARITY —');
    return h('span', {
      style: {
        fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em',
        color: band.color, whiteSpace: 'nowrap',
      },
    }, 'R' + props.rarity + ' · ' + band.label);
  }

  // FIND: ◆◆◆ HARD · NEGOTIATION · cite — rarity IS find-difficulty data made legible (Table 5-1).
  // FIND line. `props.rarity` overrides item.rarity (the location-MODIFIED effective rarity, GM face);
  // `props.compact` trims it for grid cards (dice + band + skill, cite dropped).
  function FindLine(props) {
    var eff = props.rarity != null ? props.rarity : (props.item ? props.item.rarity : null);
    var band = rarityBand(eff);
    var restricted = !!(props.item ? props.item.restricted : props.restricted);
    if (!band) return null;   // R-ITM5: rarity-less records simply omit the line
    var compact = !!props.compact;
    var dice = [];
    for (var i = 0; i < band.dice; i++) dice.push(h('span', { key: i, style: { color: '#B478E0' } }, '◆'));
    return h('div', {
      style: {
        display: 'flex', alignItems: 'baseline', gap: compact ? 5 : 8, flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)', fontSize: compact ? 8 : 9, letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.55)',
      },
    },
      compact ? null : h('span', { style: { color: 'rgba(255,255,255,0.35)' } }, 'FIND'),
      h('span', { 'aria-label': band.dice + ' difficulty dice' },
        band.dice === 0 ? h('span', { style: { color: 'rgba(255,255,255,0.4)' } }, 'no check') : dice),
      h('span', { style: { color: band.color } }, band.label),
      h('span', null, restricted ? 'STREETWISE' : 'NEGOTIATION'),
      restricted ? h('span', { style: { color: RESTRICTED_COLOR } }, compact ? '(R)' : 'BLACK MARKET') : null,
      compact ? null : h('span', { style: { color: 'rgba(255,255,255,0.28)' } }, FIND_CITE)
    );
  }

  /* ── B-667 · THE FIND LINE ON PAPER (`find_row`) ────────────────────────────────────────────────
     R-SPC-4: the difficulty is a MARK — pips AND the printed word — and never a hue. `FindLine` above
     paints the band word in `band.color` and the pips in #B478E0; this line reads `band.dice` and
     `band.label` and never touches `band.color` at all, which is the difference the ruling names.
     `NO CHECK` for a SIMPLE find is the kernel's own word for a zero (`FindLine`'s 'no check', which
     `.st-findrow`'s text-transform uppercases). R-ITM5: a rarity-less record OMITS the line rather
     than guessing a band. No location modifier: the paper read is the PLAYER face (R-SPC-2), and the
     GM's location stamp keeps the dark `FindLine` it already re-reads. */
  // B-1124 — THE GM'S ARM (frames G23–G26): `props.rarity` is the location-MODIFIED rarity (`effRarity`), and where
  // the world moved the band the line carries L · M · N's `was …` mark (`gm-shift`). The player's read passes none.
  function PaperFindRow(props) {
    var it = props.item;
    var band = rarityBand(props.rarity != null ? props.rarity : it.rarity);
    if (!band) return null;
    var was = props.rarity != null ? bandShift(it.rarity, props.rarity) : null;
    return h('div', {
      className: 'st-findrow', 'data-find-band': band.label, 'data-find-dice': band.dice,
    },
      h('span', null, 'FIND'),
      band.dice
        ? h('span', { className: 'st-pips', 'aria-label': band.dice + ' difficulty dice' }, pipsOf(band.dice))
        : h('span', null, 'no check'),
      h('b', null, band.label),
      was ? h('span', { className: 'gm-shift', 'data-find-was': was }, 'was ' + was) : null,
      h('span', null, it.restricted ? 'STREETWISE' : 'NEGOTIATION'),
      it.restricted ? h('span', null, 'BLACK MARKET') : null,
      h('span', null, FIND_CITE));
  }

  /* ── B-667 · THE CITE, AND THE HONEST ABSENCE (`cite_row`) ──────────────────────────────────────
     R-ITM5's shape: AN ABSENCE PRINTED AS AN ABSENCE CANNOT BECOME A WRONG BOOK. The dark plate simply
     renders nothing when `sources` is empty; the board prints the sentence Jason approved instead, so
     a reader learns the record is thin rather than assuming the store forgot. The books resolve
     through the SHARED resolver (`citeLabel`, F-102 A3) exactly as the dark plate does — never
     `sources.join`, which would print `FORGED_IN_BATTLE` the day a registry holds key-form sources. */
  function PaperCiteRow(props) {
    var src = props.item.sources;
    if (!src || !src.length) {
      return h('p', { className: 'st-src', 'data-store-src': 'none' },
        'SOURCE — NOT ON THIS RECORD. ',
        h('span', { className: 'hp-none' }, 'still on the shelf'));
    }
    return h('p', { className: 'st-src', 'data-store-src': 'some' },
      'SOURCE · ' + src.map(citeLabel).join(' · '));
  }

  // effective (location-modified) rarity for the GM find chip — base rarity shifted by the active
  // location modifier, floored at 0 (Table 5-2: a modifier can't push find-difficulty below Simple).
  function effRarity(baseRarity, locMod) {
    if (baseRarity == null || isNaN(Number(baseRarity))) return baseRarity;
    return Math.max(0, Number(baseRarity) + (Number(locMod) || 0));
  }
  // B-1124 — the band the world MOVED the item from, or null when it did not move (L · M · N's `was …` mark; the
  // board's rule: "it only renders when the band actually moved"). A mark, not a colour.
  function bandShift(baseRarity, eff) {
    var a = rarityBand(baseRarity), b = rarityBand(eff);
    return (a && b && a.label !== b.label) ? a.label : null;
  }

  /* ══════════════════════════════════════════════════════
     GRID CELL
  ══════════════════════════════════════════════════════ */
  function ItemCard(props) {
    var it = props.item;
    var isGm = props.face === 'gm';
    var band = rarityBand(it.rarity);
    var edge = band ? band.color : 'rgba(255,255,255,0.25)';
    var inCart = props.cartQty > 0;
    var locMod = Number(props.locationMod) || 0;
    // GM cards carry a nested "+ SHELF" <button>, so the GM card outer is a div[role=button]
    // (a <button> can't legally contain a <button> — the browser reparents it and the handler
    // misfires). Player face stays a <button> (byte-stable, R-SU1).
    var cardProps = {
      onClick: props.onOpen,
      'aria-label': (it.name || 'item') + ', ' + fmtCr(it.price),
      style: {
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        padding: '12px 8px 10px', minHeight: 44, cursor: 'pointer', textAlign: 'center',
        background: 'linear-gradient(180deg, ' + edge + '0A 0%, rgba(255,255,255,0.02) 60%)',
        border: '1px solid ' + edge + '2E',
        borderTop: '2px solid ' + edge + (band ? '88' : '2E'),
        borderRadius: 8,
        boxShadow: band && band.dice >= 4 ? ('0 0 14px ' + edge + '14') : 'none',
        color: 'inherit', touchAction: 'manipulation',
      },
    };
    if (isGm) {
      cardProps.role = 'button';
      cardProps.tabIndex = 0;
      cardProps.onKeyDown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onOpen(); } };
    }
    return h(isGm ? 'div' : 'button', cardProps,
      // top-right markers: (player) held ◈ / in-counter count · (gm) on-active-shelf ✓ · restricted (R)
      h('div', { style: { position: 'absolute', top: 5, right: 7, display: 'flex', gap: 5, alignItems: 'center' } },
        (!isGm && inCart) ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 8, color: '#F5C842', border: '1px solid rgba(245,200,66,0.4)', borderRadius: 8, padding: '0 5px' } }, '×' + props.cartQty) : null,
        (!isGm && props.held) ? h('span', { 'aria-label': 'on hold', style: { fontSize: 9, color: '#4EAAFF' } }, '◈') : null,
        (isGm && props.inShelf) ? h('span', { 'aria-label': 'on the active shelf', style: { fontSize: 10, color: '#9BE8B2' } }, '✓') : null,
        it.restricted ? h('span', { 'aria-label': 'restricted', style: { fontFamily: 'var(--font-mono)', fontSize: 8, color: RESTRICTED_COLOR } }, '(R)') : null
      ),
      h(ArtStage, { item: it, size: isGm ? 48 : 58 }),
      h('div', { style: { minHeight: 28, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' } },
        h('div', {
          style: {
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11.5, lineHeight: 1.2,
            color: 'rgba(255,255,255,0.92)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          },
        }, it.name || 'Unnamed'),
        h(RarityChip, { rarity: it.rarity })
      ),
      // GM face: the cited find-difficulty at THIS location (effective rarity), + a quick add-to-shelf.
      // Player face: the price tag.
      isGm
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', width: '100%' } },
            h(FindLine, { item: it, rarity: effRarity(it.rarity, locMod), compact: true }),
            props.onAddToShelf ? h('button', {
              onClick: function (e) { e.stopPropagation(); props.onAddToShelf(); },
              'aria-label': (props.inShelf ? 'On the shelf: ' : 'Add to shelf: ') + (it.name || 'item'),
              style: {
                minHeight: 30, padding: '4px 10px', cursor: 'pointer', borderRadius: 14,
                background: props.inShelf ? 'rgba(155,232,178,0.12)' : 'rgba(245,200,66,0.08)',
                border: '1px solid ' + (props.inShelf ? 'rgba(155,232,178,0.4)' : 'rgba(245,200,66,0.35)'),
                fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.12em',
                color: props.inShelf ? '#9BE8B2' : '#F5DFA8',
              },
            }, props.inShelf ? '✓ ON SHELF' : '+ SHELF') : null
          )
        : h(PriceTag, { affordable: props.affordable }, fmtCr(it.price))
    );
  }

  /* ══════════════════════════════════════════════════════
     SPEC PLATE — plain/gamey stat rows per section (R-ITM7)
  ══════════════════════════════════════════════════════ */
  function specRows(it) {
    if (it.section === 'weapons') {
      return [
        { label: 'DMG', value: it.damage },
        { label: 'CRIT', value: it.crit },
        { label: 'RANGE', value: it.range },
        { label: 'SKILL', value: it.skill },
        it.encumbrance != null ? { label: 'ENC', value: it.encumbrance } : null,
        it.hp != null ? { label: 'HP', value: it.hp } : null,
      ].filter(Boolean);
    }
    if (it.section === 'armor') {
      return [
        { label: 'SOAK', value: it.soak },
        { label: 'DEFENSE', value: it.defense },
        it.encumbrance != null ? { label: 'ENC', value: it.encumbrance } : null,
        it.hp != null ? { label: 'HP', value: it.hp } : null,
      ].filter(Boolean);
    }
    return [
      it.type ? { label: 'TYPE', value: it.type } : null,
      it.encumbrance != null ? { label: 'ENC', value: it.encumbrance } : null,
    ].filter(Boolean);
  }

  function SpecPlate(props) {
    var rows = specRows(props.item);
    if (!rows.length) return null;
    return h('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap' } },
      rows.map(function (s) {
        return h('div', { key: s.label },
          h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#fff' } },
            s.value != null && s.value !== '' ? String(s.value) : '—'),
          h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', marginTop: 1 } }, s.label)
        );
      })
    );
  }

  /* ══════════════════════════════════════════════════════
     COMPARE — carried vs shelf (picker of same-class carried items, D-ITM7)
  ══════════════════════════════════════════════════════ */
  function carriedOfSection(shopFor, byId, section) {
    var eq = shopFor && shopFor.sheetData && shopFor.sheetData.equipment;
    if (!eq) return [];
    var out = [];
    if (section === 'weapons' && Array.isArray(eq.weapons)) {
      eq.weapons.forEach(function (w, i) {
        // R-SPC-3: a sheet's equipment carries BARE id-refs; the catalog is section-qualified.
        var it = w && w.id && byId['weapons:' + w.id];
        // PROV-1: carry the persisted entry's nickname + provenance so COMPARE can show the story.
        if (it) out.push({ idx: i, item: it, nickname: w.nickname, provenance: w.provenance });   // legacy snapshot entries (no id) can't resolve — skipped
      });
    }
    if (section === 'armor' && eq.armor && eq.armor.id && byId['armor:' + eq.armor.id]) {
      out.push({ idx: 0, item: byId['armor:' + eq.armor.id], equipped: true, nickname: eq.armor.nickname, provenance: eq.armor.provenance });
    }
    return out;
  }

  // numeric compare where honest; informs, never decides.
  /* B-668 — `d` and `better` are CARRIED OUT, and nothing else here moved. The paper face prints the
     direction IN WORDS ("+3 better") where the dark face prints a signed number in a hue, and the
     board's own `num()` is a transcription of THIS arithmetic (`compare_stage`: "`statDelta`'s rule,
     on paper"). Recomputing the sign or the sense in the paper branch would be a second opinion about
     which way is better; two renderings of one verdict is the whole point. `text`/`color` are
     untouched, so the DARK panel is element-identical. */
  function statDelta(label, shelfVal, mineVal, lowerBetter) {
    var s = Number(shelfVal), m = Number(mineVal);
    if (isNaN(s) || isNaN(m)) return null;
    var d = s - m;
    if (d === 0) return { text: 'same', color: 'rgba(255,255,255,0.4)', d: 0, better: null };
    var better = lowerBetter ? d < 0 : d > 0;
    return { text: (d > 0 ? '+' : '') + d, color: better ? '#4ECB71' : '#FF8A8A', d: d, better: better };
  }

  /* THE DELTA, IN WORDS — the board's `num()`, verbatim in its three parts: the arrow, the SIGNED
     magnitude (a true minus sign, `−`, not a hyphen — the board emits `&minus;`), and the word. A
     zero prints `same` and no arrow. `null` in means the numbers do not compare and the row draws no
     delta at all, which is the `sameDmgBase` branch's business below. */
  function paperDeltaWords(delta) {
    if (!delta) return null;
    if (delta.d === 0) return { same: true, word: 'same' };
    return { same: false, num: (delta.d > 0 ? '+' : '−') + Math.abs(delta.d),
             word: delta.better ? 'better' : 'worse' };
  }

  function ComparePanel(props) {
    var shelf = props.item, byId = props.byId, shopFor = props.shopFor;
    var _pick = useState(null), pickedIdx = _pick[0], setPickedIdx = _pick[1];
    var carried = carriedOfSection(shopFor, byId, shelf.section);
    /* ══════════════════════════════════════════════════════════════════════════════════════════════
       COMPARE — ON PAPER (B-668; ruling `store-paper-concept` R-SPC-7 row 4; the board's
       `compare_stage`, frames `item_read(a280_heavy_blaster_rifle, compare=blaster_pistol)` and
       `…compare=vibroknife)` at lab `cf33463e`, Jason 2026-09-18 "Approved.").

       THE SAME COMPONENT, the same `pickedIdx` state, the same `carriedOfSection` and the same
       `statDelta` — `SellSheet`'s pattern, and `ItemOverlay`'s one row above. THE ARITHMETIC IS NOT
       RE-DERIVED: `rows` below is built once and BOTH faces render it, so the paper face cannot
       disagree with the dark one about which way is better. What changes is the SENTENCE: the dark
       face prints a signed number in a hue (`delta.text`, `delta.color`), the paper face prints the
       direction in words through `paperDeltaWords` and carries no hue at all.

       ONLY WHAT MOVES IS A DELTA, and the one branch that must print NO delta is FFG's two damage
       conventions: a Brawn-based weapon prints `+1` because the base is the wielder's Brawn and a
       flat weapon prints `9`. Subtracting them is arithmetically fine and means nothing, so
       `sameDmgBase` (shipped, unchanged) suppresses it and the board's sentence stands in its place —
       UNDER the DMG row, where the question is asked, not at the foot of the panel.
    ══════════════════════════════════════════════════════════════════════════════════════════════ */
    var paperHead = function (right) {
      return h('div', { className: 'st-cmp-hd' },
        h('span', null, 'COMPARE WITH YOURS'), h('span', null, right));
    };
    if (!shopFor && props.paper) {
      // THE BOARD DREW NO JUST-BROWSING STATE — it is built from THE KERNEL'S OWN WORDS rather than
      // invented: the button's label and its writer (`onNeedCharacter`) are the shipped ones, wearing
      // the board's `hp-buy-btn` in the board's `.st-cmp-pick` row. Reported as an addition.
      return h('div', { className: 'st-cmp', 'data-store-compare': 'browsing' },
        paperHead('JUST BROWSING'),
        h('div', { className: 'st-cmp-pick' },
          h('button', {
            type: 'button', className: 'hp-buy-btn', onClick: props.onNeedCharacter,
          }, 'PICK WHO YOU’RE SHOPPING FOR TO COMPARE')));
    }
    if (!carried.length && props.paper && shopFor) {
      // THE KERNEL'S OWN CLAIM, cased for the paper's sentence voice (`.st-cmp-note` is body text and
      // is not uppercased by any rule — the dark face's string is a mono caps run). Reported.
      return h('div', { className: 'st-cmp', 'data-store-compare': 'nothing-carried' },
        paperHead((shopFor.name || 'This character').toUpperCase() + ' CARRIES 0'),
        h('p', { className: 'st-cmp-note' },
          (shopFor.name || 'This character') + ' carries no '
          + (shelf.section === 'armor' ? 'armor' : 'weapons') + ' to compare.'));
    }
    if (!shopFor) {
      return h('div', { style: { padding: '10px 0 2px' } },
        h('button', {
          onClick: props.onNeedCharacter,
          style: {
            width: '100%', minHeight: 44, padding: '10px 12px', cursor: 'pointer',
            background: 'rgba(78,170,255,0.06)', border: '1px dashed rgba(78,170,255,0.4)', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', color: '#4EAAFF',
          },
        }, 'PICK WHO YOU’RE SHOPPING FOR TO COMPARE')
      );
    }
    if (!carried.length) {
      return h('div', {
        style: { padding: '8px 0 2px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' },
      }, (shopFor.name || 'This character').toUpperCase() + ' CARRIES NO ' + (shelf.section === 'armor' ? 'ARMOR' : 'WEAPONS') + ' TO COMPARE');
    }
    // armor auto-selects the equipped suit (D-ITM7); weapons default to the first carried
    var sel = carried[pickedIdx != null ? pickedIdx : 0] || carried[0];
    var mine = sel.item;
    // Brawn-based damage prints "+N" (FFG convention) — a numeric delta against a flat-damage
    // weapon would lie, so the delta only renders when both are the same base type.
    var sameDmgBase = (String(shelf.damage || '')[0] === '+') === (String(mine.damage || '')[0] === '+');
    var rows = shelf.section === 'weapons'
      ? [
          { label: 'DMG', s: shelf.damage, m: mine.damage, delta: sameDmgBase ? statDelta('DMG', shelf.damage, mine.damage, false) : null },
          { label: 'CRIT', s: shelf.crit, m: mine.crit, delta: statDelta('CRIT', shelf.crit, mine.crit, true) },
          { label: 'RANGE', s: shelf.range, m: mine.range, delta: null },
          { label: 'ENC', s: shelf.encumbrance, m: mine.encumbrance, delta: statDelta('ENC', shelf.encumbrance, mine.encumbrance, true) },
        ]
      : [
          { label: 'SOAK', s: shelf.soak, m: mine.soak, delta: statDelta('SOAK', shelf.soak, mine.soak, false) },
          { label: 'DEFENSE', s: shelf.defense, m: mine.defense, delta: statDelta('DEFENSE', shelf.defense, mine.defense, false) },
          { label: 'ENC', s: shelf.encumbrance, m: mine.encumbrance, delta: statDelta('ENC', shelf.encumbrance, mine.encumbrance, true) },
        ];
    if (props.paper) {
      var has = function (v) { return v != null && v !== ''; };
      var cell = function (v) { return has(v) ? String(v) : '—'; };
      // ENC DRAWS ONLY WHEN BOTH RECORDS CARRY IT, and HP is the one ROW ADDED over the frame — both
      // under one rule and it is row 3's, applied: a comparison row with nothing on one side is a
      // dash pretending to be a finding. The board could not have drawn HP at all (its `CARRIED`
      // fixture carries no hard-point key), and the brief names it, so it is added HERE and on the
      // PAPER FACE ONLY — the dark `rows` array above is untouched, which is what keeps the OFF leg
      // element-identical. Reported both ways.
      var prows = rows.filter(function (r) { return r.label === 'ENC' ? has(r.s) && has(r.m) : true; });
      if (has(shelf.hp) && has(mine.hp)) {
        prows = prows.concat([{ label: 'HP', s: shelf.hp, m: mine.hp,
                                delta: statDelta('HP', shelf.hp, mine.hp, false) }]);
      }
      var sq = (shelf.qualities || []).filter(Boolean);
      var mq = (mine.qualities || []).filter(Boolean);
      return h('div', { className: 'st-cmp', 'data-store-compare': 'rows' },
        paperHead((shopFor.name || 'This character').toUpperCase() + ' CARRIES ' + carried.length),
        // THE PICKS ARE THE BOARD'S ROW OF CHIPS, always drawn — the board draws them at three carried
        // and the dark face hides them at one, and on paper the row is what says WHAT "yours" IS. The
        // label is the SHEET'S name for the thing (`sel.nickname || mine.name`, the dark face's own
        // YOURS rule) so a storied blade is identifiable; with no nickname it is the board's string.
        h('div', { className: 'st-cmp-pick' }, carried.map(function (c, i) {
          var active = i === (pickedIdx != null ? pickedIdx : 0);
          return h('button', {
            key: i, type: 'button', className: 'hp-buy-btn',
            'data-on': active ? '1' : null, 'aria-pressed': active ? 'true' : 'false',
            onClick: function () { setPickedIdx(i); },
          }, c.nickname || c.item.name);
        })),
        prows.map(function (r) {
          var w = paperDeltaWords(r.delta);
          return h('div', { className: 'st-cmp-row', key: r.label, 'data-cmp-row': r.label },
            h('span', { className: 'st-cmp-k' }, r.label),
            h('span', { className: 'st-cmp-v' },
              cell(r.s), ' ', h('i', null, 'vs yours'), ' ', cell(r.m), ' ',
              w ? (w.same ? h('i', null, w.word)
                          : [h('i', { key: 'a' }, '→'), w.num + ' ', h('i', { key: 'w' }, w.word)])
                : null),
            // THE REASON GOES UNDER THE ROW IT EXPLAINS (the board's own note): "why is there no arrow
            // on this line" is asked AT the line, and an answer at the foot of the panel is one the
            // reader has to go looking for. Jason's approved sentence, verbatim.
            (r.label === 'DMG' && !sameDmgBase) ? h('p', { className: 'st-cmp-note' },
              'Two different scales: yours adds to Brawn, this one is a flat value. There is '
              + 'nothing to subtract.') : null);
        }),
        // THE QUALITIES LINE — the board's words. Drawn when EITHER side carries qualities: the board
        // emits it unconditionally on frames that are all weapons, and an armour compare (which the
        // board never drew, and whose records carry no `qualities` field at all) would print
        // "none / none" — a line that says nothing about two records that have nothing to say.
        (sq.length || mq.length) ? h('p', { className: 'st-cmp-note', 'data-cmp-quals': '1' },
          'Qualities — this one: ' + (sq.length ? sq.join(', ') : 'none')
          + '. Yours: ' + (mq.length ? mq.join(', ') : 'none') + '.') : null);
    }
    return h('div', null,
      carried.length > 1 ? h('div', { style: { display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 10px', scrollbarWidth: 'none' } },
        carried.map(function (c, i) {
          var active = i === (pickedIdx != null ? pickedIdx : 0);
          return h('button', {
            key: i, onClick: function () { setPickedIdx(i); },
            style: {
              flexShrink: 0, minHeight: 34, padding: '5px 10px', borderRadius: 17, cursor: 'pointer',
              background: active ? 'rgba(78,170,255,0.14)' : 'rgba(255,255,255,0.03)',
              border: '1px solid ' + (active ? 'rgba(78,170,255,0.55)' : 'rgba(255,255,255,0.1)'),
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              color: active ? '#4EAAFF' : 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap',
            },
          }, c.item.name);
        })
      ) : null,
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '6px 10px', alignItems: 'center' } },
        // header row
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', textAlign: 'right' } }, 'THIS ONE'),
        h('div', null),
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          'YOURS · ' + (sel.nickname || mine.name || '').toUpperCase() + (sel.equipped ? ' (WORN)' : '')),
        rows.map(function (r) {
          return [
            h('div', { key: r.label + 's', style: { textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#fff' } },
              r.s != null && r.s !== '' ? String(r.s) : '—',
              r.delta ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 9, color: r.delta.color, marginLeft: 5 } }, r.delta.text) : null),
            h('div', { key: r.label + 'l', style: { fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', textAlign: 'center' } }, r.label),
            h('div', { key: r.label + 'm', style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'rgba(255,255,255,0.6)' } },
              r.m != null && r.m !== '' ? String(r.m) : '—'),
          ];
        })
      ),
      shelf.section === 'weapons' && shelf.qualities && shelf.qualities.length ? h('div', {
        style: { marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' },
      }, 'QUALITIES · THIS: ' + shelf.qualities.join(', ') + (mine.qualities && mine.qualities.length ? ' · YOURS: ' + mine.qualities.join(', ') : ' · YOURS: —')) : null,
      // PROV-1: the story line — a carried item's nickname + its latest note (the storied blade vs the
      // stranger on the shelf). Only renders when YOURS has a story; a fresh purchase has none yet.
      (function () {
        var prov = Array.isArray(sel.provenance) ? sel.provenance : [];
        var last = prov.length ? prov[prov.length - 1] : null;
        if (!sel.nickname && !last) return null;
        return h('div', { style: { marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5, color: 'rgba(235,228,215,0.6)' } },
          sel.nickname ? h('span', { style: { color: 'rgba(255,255,255,0.82)', fontWeight: 600 } }, '“' + sel.nickname + '” ') : null,
          last ? h('span', { style: { fontStyle: 'italic' } }, last.note + (last.when ? ' · ' + last.when : '')) : null
        );
      })()
    );
  }

  /* ══════════════════════════════════════════════════════
     ITEM OVERLAY — the shelf stays visible behind (design law)
  ══════════════════════════════════════════════════════ */
  function ItemOverlay(props) {
    var it = props.item;
    var band = rarityBand(it.rarity);
    var tint = band ? band.color : 'rgba(255,255,255,0.5)';
    var _cmp = useState(false), compareOpen = _cmp[0], setCompareOpen = _cmp[1];
    if (useBackToClose) useBackToClose(true, props.onClose);
    var isGm = props.face === 'gm';
    var credits = getCredits(props.shopFor);
    var canCompare = (it.section === 'weapons' || it.section === 'armor') && !isGm;
    /* ── B-667 · ESCAPE CLOSES THE READ, ON BOTH FACES ──────────────────────────────────────────────
       NEW, and stated as new: this overlay had the × and the scrim but NO keyboard exit —
       `useBackToClose` binds the Back button and nothing else. `SellSheet` in this same file carries
       the device and the reason with it ("three exits, on purpose: the × for the eye, the scrim for
       the thumb, Escape for the keyboard", B-233 / NAVIGATION conformance item 2), so this is the
       sibling pattern being applied, not a new one being invented.

       UNCONDITIONAL, NOT `if (paper)`. A second keyboard behaviour on one component would be the
       second-kernel defect the single-door law exists to prevent, and a paper-only Escape would mean
       the dark face keeps a gap the paper face closed. It renders NOTHING, so the OFF leg stays
       element-identical — which is what that leg is the positive control on.

       CAPTURE PHASE, for `SellSheet`'s reason: an ancestor Escape handler (the sheet page's own) would
       otherwise act on a key that belongs to the topmost surface. The topmost surface answers first. */
    var onClose = props.onClose;
    useEffect(function () {
      if (!onClose) return undefined;
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }
      document.addEventListener('keydown', onKey, true);
      return function () { document.removeEventListener('keydown', onKey, true); };
    }, [onClose]);

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
       THE ITEM, READ — ON PAPER (B-667; ruling `store-paper-concept` R-SPC-7 row 3; the board's
       `item_read`, frames Q · R · S · T at lab `cf33463e` and AC at lab `1e1e2f6a`, Jason 2026-09-18
       "Approved." — the pinned act row and the desk's two columns approved WITH the board).

       THE SAME COMPONENT, the same `compareOpen` state, the same writers and the same testids, with an
       `if (paper)` branch drawing the board's markup — `SellSheet`'s pattern twelve hundred lines down
       and `VesselSheet`'s for a bigger one (deleted at the Ship Yard's S5 flip). Never the dark tree restyled.

       ON THE PHONE IT IS A SHEET OVER THE SHELF and that is the kernel's own design law, which the
       board quotes back at it: "the shelf stays visible behind". `.st-read` is absolute to `.st` (the
       board's positioned parent, already there for the summoned drawer) with `.st-scrim` under it, so
       the runhead, the shelf and the foot all dim behind the read rather than being replaced by it —
       the difference between PICKING SOMETHING UP and BEING TAKEN SOMEWHERE.

       AT THE DESK IT IS A HELD CARD IN TWO COLUMNS: the stat block beside the prose, which is the gear
       book's own page. `.st-cols` / `.st-colL` / `.st-colR` are emitted at BOTH bands so the two are
       one drawing with one layout rule (`.st-read[data-desk="1"] .st-cols` is the only switch).
    ══════════════════════════════════════════════════════════════════════════════════════════════ */
    if (props.paper) {
      var rows = specRows(it);
      // THE LEDGER IS `hp-ledger`, and the class is here for the reason the CATALOG ROW refused it:
      // a ledger is key/value LINES on a 72px row budget, which a nine-column catalog row blew by
      // 111px the moment it wore the class. Six key/value lines are exactly what the budget was
      // written for. Reuse where the CONCEPT matches; refuse where it does not.
      //
      // AND THE ROWS ARE `specRows`, UNCHANGED — the board's `facts()` is a transcription of it, row
      // for row including the `.filter(Boolean)`: a weapon always prints DMG/CRIT/RANGE/SKILL and
      // prints ENC and HP ONLY when the record carries them, so an absent hard-point count is an
      // ABSENT ROW rather than a dash pretending to be a value. Armour prints SOAK/DEFENSE, gear
      // TYPE/ENC. One row-set, two faces; the paper read cannot disagree with the dark plate.
      var ledger = rows.length ? h('table', { className: 'hp-ledger' },
        h('tbody', null, rows.map(function (s) {
          return h('tr', { key: s.label },
            h('td', { className: 'hp-lkey' }, s.label),
            h('td', { className: 'hp-lval' }, s.value != null && s.value !== '' ? String(s.value) : '—'));
        }))) : null;
      var quals = (it.qualities || []).filter(Boolean);
      var sub = [(it.section || '').toUpperCase(), (it.type || '').toUpperCase()]
        .filter(Boolean).join(' · ');
      // B-668 TOOK THE `compare` ISLAND. The panel is the board's own `.st-cmp` block now, standing
      // where the board puts it — IN THE LEFT COLUMN, UNDER THE FIND LINE, against the stat block it
      // compares. The kernel's dark branch reaches the same panel by `scrollIntoView` for the same
      // reason: "compare opened" is never a state where the panel is 900px below the fold.
      var comparePanel = (canCompare && compareOpen) ? h(ComparePanel, {
        item: it, byId: props.byId, shopFor: props.shopFor, paper: true,
        onNeedCharacter: props.onNeedCharacter,
      }) : null;
      return [
        // THE SCRIM IS THE BOARD'S, and it is what dims the runhead: `.st-scrim` is absolute to `.st`
        // at z-index 1 while the head, the shelf and the foot are in the flow, so the whole page goes
        // behind the read. It keeps the dark face's own `aria-label` — the hook, and the thumb's exit.
        h('div', {
          key: 'scrim', className: 'st-scrim', onClick: props.onClose, 'aria-label': 'Close item detail',
        }),
        h('div', {
          key: 'read', className: 'st-read', 'data-desk': props.desk ? '1' : null,
          'data-store-zone': 'read', role: 'dialog', 'aria-label': it.name || 'Item detail',
        },
          h('div', { className: 'st-readhd' },
            h(ArtStage, { item: it, paper: true, gm: isGm }),
            h('div', { className: 'st-readid' },
              h('h2', { className: 'st-readnm' }, it.name || 'Unnamed',
                it.restricted ? h('span', { className: 'st-r' }, '(R)') : null),
              h('p', { className: 'st-readsub' }, sub),
              h('span', { className: 'st-readcr' }, fmtCr(it.price))),
            // THE ✕ IS NOT ON THE BOARD, AND IT IS BUILT ANYWAY — reported as a clash, not corrected
            // silently. The board's frames are drawings of a state and draw no close control on the
            // read; a `role="dialog"` with no visible dismiss fails the a11y floor (and the standards
            // outrank the mockup, C-MU-4), and ten shipped smokes reach this overlay by
            // `aria-label="Close"`. It wears the board's own `.st-close` (the drawer's DONE), so
            // nothing is invented but its presence.
            h('button', {
              type: 'button', className: 'hp-buy-btn st-close st-readx',
              'aria-label': 'Close', onClick: props.onClose,
            }, '✕')),
          h('div', { className: 'st-cols' },
            h('div', { className: 'st-colL' },
              ledger,
              quals.length ? h('div', { className: 'st-chips' }, quals.map(function (q) {
                // NEW CONCEPT — the QUALITY chip. `hp-cite` is a SOURCE chip and reads in red; a
                // quality is not a citation and must not borrow a citation's ink (the board's own
                // reason for growing `.st-chip` rather than reusing `hp-cite`). The dark face's
                // `QualityChips` is a tinted, db-backed control and stays on the dark face.
                return h('span', { key: q, className: 'st-chip' }, q);
              })) : null,
              // B-1124 — the GM's arm reads the find line at THIS world (G23–G26); the player's is the printed rarity.
              h(PaperFindRow, { item: it, rarity: isGm ? effRarity(it.rarity, props.locationMod) : undefined }),
              comparePanel),
            h('div', { className: 'st-colR' },
              it.description ? h('p', {
                className: 'hp-prose', 'data-item-description': true,
              }, glyphs(paperProse(it.description))) : null,
              h(PaperCiteRow, { item: it }))),
          /* THE ACT ROW IS PINNED AT THE FOOT — one of the board's two disclosed PROPOSALS, approved
             with it. Measured on the board: the Vibro-ax's read is 1,045px of content in a 710px
             sheet, so the shipped bottom-of-scroll placement leaves ADD TO COUNTER 335px below the
             fold in the state a player actually arrives in. `.st-acts` is `position:sticky; bottom:0`
             with a HAIRLINE and no shadow — the row is part of the page, not a bar floating over it.

             AND IT MEETS THE APP'S BOTTOM BAR AS SIBLINGS IN A COLUMN, not as layers (lab frame AC):
             `.st-read` is absolute to `.st`, which ends where the bar begins, so the act row sits on
             top of the bar's rule with nothing overlapping. Measured in the smoke, not argued here.

             ADD TO COUNTER, not ADD TO CART — R-SPC-3's rename. B-669 finished it: the DARK face reads
             the same two words now (:1263), so the kernel has ONE vocabulary and not one per face. The
             testid does not move with the word: `store-add-to-cart` is what three shipped smokes find,
             so it stays, and `data-read-add` is the paper row's own hook beside it. */
          /* B-1124 — THE GM'S ARM (frames G23–G26): ONE act where the player's two are pinned — the dark face's own
             words with the active shelf's name (ADD TO <SHELF> / ✓ ON <SHELF> · REMOVE), the maroon rule when on it
             (the row's pill's mark) — and the one side door the GM keeps, USE YOUR OWN IMAGE. No hold, no counter,
             no inventory, no compare: the GM arm has none (`canCompare … && !isGm`). */
          isGm ? h('div', { className: 'st-acts' },
            h('button', {
              type: 'button', className: 'hp-commit gm-shelfact', 'data-read-shelf': '1',
              'data-on': props.inShelf ? '1' : '0', 'aria-pressed': props.inShelf ? 'true' : 'false',
              onClick: props.onToggleShelf,
            }, props.inShelf
                ? ('✓ ON ' + (props.activeShelfName || 'SHELF').toUpperCase() + ' · REMOVE')
                : ('ADD TO ' + (props.activeShelfName || 'SHELF').toUpperCase())))
          : h('div', { className: 'st-acts' },
            h('button', {
              type: 'button', className: 'hp-commit',
              'data-testid': 'store-add-to-cart', 'data-read-add': '1',
              onClick: props.onAddToCart,
            }, props.cartQty > 0 ? 'ADD TO COUNTER · ' + props.cartQty + ' ON THE SLIP' : 'ADD TO COUNTER'),
            h('button', {
              type: 'button', className: 'hp-quiet st-hold', 'data-on': props.held ? '1' : '0',
              'aria-pressed': props.held ? 'true' : 'false',
              'aria-label': props.held ? 'Remove from holds' : 'Add to holds',
              onClick: props.onToggleHold,
            }, props.held ? '◆ HELD' : '◆ HOLD')),
          /* THE THREE SIDE DOORS STAY IN THE FLOW, which is the board's other measured decision: only
             the two acts that touch the counter are pinned, because MOVE TO INVENTORY, COMPARE WITH
             YOURS and USE YOUR OWN IMAGE are places to GO and not the decision this sheet is asking
             for — and pinning five buttons costs 150px of a 730px sheet. */
          h('div', { className: 'st-acts2' },
            isGm ? null : h('button', {
              type: 'button', className: 'hp-quiet', 'data-testid': 'store-move-to-inventory',
              onClick: props.onMoveToInventory,
            }, 'MOVE TO INVENTORY'),
            canCompare ? h('button', {
              type: 'button', className: 'hp-quiet', 'data-on': compareOpen ? '1' : null,
              'aria-expanded': compareOpen ? 'true' : 'false',
              onClick: function () { setCompareOpen(!compareOpen); },
            }, 'COMPARE WITH YOURS') : null,
            // USE YOUR OWN IMAGE is `ItemArtOwner`'s door and `ItemArtOwner` owns the hidden <input>,
            // the IndexedDB writer, the live subscription and the REMOVE affordance. The board drew
            // one button; the component IS that button plus what it needs, so it is mounted here with
            // `paper` rather than reimplemented as a bare button that writes nothing.
            h(ItemArtOwner, { itemId: it.regId || bareId(it.key), paper: true }))),
      ];
    }
    return h('div', {
      style: { position: 'absolute', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' },
    },
      // scrim — translucent on purpose: the shelf continues behind the held item
      h('div', {
        onClick: props.onClose, 'aria-label': 'Close item detail',
        style: { position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.62)', backdropFilter: 'blur(1.5px)' },
      }),
      h('div', {
        role: 'dialog', 'aria-label': it.name || 'Item detail',
        style: {
          position: 'relative', maxHeight: '88%', overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(14,18,28,0.99) 0%, rgba(8,10,16,0.99) 100%)',
          borderTop: '2px solid ' + tint + '77',
          borderRadius: '14px 14px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 30px ' + tint + '11',
          padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
          animation: 'slideUpBounce 0.32s cubic-bezier(0.32,1.2,0.5,1) forwards',
        },
      },
        // grab bar + hold toggle + close
        h('div', { style: { position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 2 } },
          !isGm ? h('button', {
            onClick: props.onToggleHold, 'aria-pressed': props.held,
            'aria-label': props.held ? 'Remove from holds' : 'Add to holds',
            style: { minWidth: 36, minHeight: 36, background: 'none', border: 'none', cursor: 'pointer', color: props.held ? '#4EAAFF' : 'rgba(255,255,255,0.3)', fontSize: 14 },
          }, '◈') : null,
          h('button', {
            onClick: props.onClose, 'aria-label': 'Close',
            style: { minWidth: 44, minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 18 },
          }, '×')
        ),
        // ── the item, held: art + identity ──
        h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 } },
          h(ArtStage, { item: it, size: 92, big: true }),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17, letterSpacing: '0.04em', color: '#fff', lineHeight: 1.15 } },
              it.name || 'Unnamed',
              it.restricted ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 10, color: RESTRICTED_COLOR, marginLeft: 7 } }, '(R)') : null),
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 5, flexWrap: 'wrap' } },
              h(RarityChip, { rarity: it.rarity }),
              h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)' } },
                (it.section || '').toUpperCase() + (it.type ? ' · ' + it.type.toUpperCase() : ''))
            ),
            h('div', { style: { marginTop: 8 } },
              h(PriceTag, { big: true, affordable: props.shopFor && credits != null && Number(it.price) <= credits }, fmtCr(it.price)))
          )
        ),
        // ── spec plate (cold tech: plain numbers) ──
        h('div', { style: { padding: '12px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 10 } },
          h(SpecPlate, { item: it }),
          it.section === 'weapons' && it.qualities && it.qualities.length && QualityChips ? h('div', { style: { marginTop: 10 } },
            h(QualityChips, { accent: tint, db: props.qualitiesDb, qualities: it.qualities, size: 'sm' })) : null
        ),
        // ── find difficulty (Table 5-1, cited) — GM face folds in the location modifier ──
        h('div', { style: { marginBottom: 12 } },
          h(FindLine, { item: it, rarity: isGm ? effRarity(it.rarity, props.locationMod) : undefined })),
        // ── description (the paper layer — warm, human; dice tokens render as glyphs — R3 Q2a) ──
        it.description ? h('div', {
          'data-item-description': true,
          style: {
            fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, color: 'rgba(235,228,215,0.78)',
            background: 'rgba(245,232,200,0.03)', borderLeft: '2px solid ' + tint + '3A',
            padding: '10px 12px', borderRadius: '0 6px 6px 0', marginBottom: 12,
            whiteSpace: 'pre-wrap',
          },
        }, glyphs(it.description)) : null,
        // ── cite plate ──
        // F-102 A3: the cite plate resolves through the SHARED resolver instead of printing the
        // raw array. It used to read `it.sources.join(' · ')`, which was invisible while every
        // registry held display titles — and would have started printing "SOURCE · FAR_HORIZONS"
        // the moment B-332 wrote key-form sources. The consumer check caught it before the write.
        // `sourceLabel` tolerates key, display title and hidden code alike, which is what lets
        // B-336 convert the registries one at a time without this plate going wrong in between.
        it.sources && it.sources.length ? h('div', {
          style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 },
        }, 'SOURCE · ' + it.sources.map(citeLabel).join(' · ').toUpperCase()) : null,
        // ── compare ──
        canCompare ? h('div', {
          style: { marginBottom: 14 },
          ref: function (el) { if (el && compareOpen) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
        },
          h('button', {
            onClick: function () { setCompareOpen(!compareOpen); },
            'aria-expanded': compareOpen,
            style: {
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#4EAAFF',
            },
          },
            h('span', { style: { transform: compareOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' } }, '›'),
            'COMPARE WITH YOURS'),
          compareOpen ? h(ComparePanel, {
            item: it, byId: props.byId, shopFor: props.shopFor,
            onNeedCharacter: props.onNeedCharacter,
          }) : null
        ) : null,
        // ── actions ── (GM face: one ADD-TO-SHELF; player face: ADD TO COUNTER + MOVE TO INVENTORY)
        isGm
          ? h('button', {
              onClick: props.onToggleShelf,
              'aria-pressed': props.inShelf,
              style: {
                width: '100%', minHeight: 48, cursor: 'pointer', borderRadius: 8,
                background: props.inShelf ? 'rgba(155,232,178,0.14)' : 'linear-gradient(180deg, rgba(245,200,66,0.2), rgba(245,200,66,0.1))',
                border: '1px solid ' + (props.inShelf ? 'rgba(155,232,178,0.6)' : 'rgba(245,200,66,0.55)'),
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
                color: props.inShelf ? '#9BE8B2' : '#F5DFA8',
              },
            }, props.inShelf
                ? ('✓ ON ' + (props.activeShelfName || 'SHELF').toUpperCase() + ' · REMOVE')
                : ('ADD TO ' + (props.activeShelfName || 'SHELF').toUpperCase()))
          : h('div', { style: { display: 'flex', gap: 8 } },
            h('button', {
              onClick: props.onAddToCart,
              'data-testid': 'store-add-to-cart',
              style: {
                flex: 1, minHeight: 48, cursor: 'pointer', borderRadius: 10,
                background: 'linear-gradient(180deg, rgba(245,200,66,0.18), rgba(245,200,66,0.06))',
                border: '1px solid rgba(245,200,66,0.4)',
                fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', color: '#F5C842',
              },
            // R-SPC-3, THE WORDS — the dark face converges on the COUNTER family. `ADD TO CART` and
            // `IN CART ×N · ADD MORE` were the single-door lap's outlier (STORE_SHAPE §3: "the surface
            // converges on the counter word family"), and row 3 had already put these two strings on
            // the paper face — so the kernel carried TWO vocabularies for one control. One now. The
            // testid does not move with the word.
            }, props.cartQty > 0 ? 'ADD TO COUNTER · ' + props.cartQty + ' ON THE SLIP' : 'ADD TO COUNTER'),
            h('button', {
              onClick: props.onMoveToInventory,
              'data-testid': 'store-move-to-inventory',
              style: {
                flex: 1, minHeight: 48, cursor: 'pointer', borderRadius: 10,
                background: 'rgba(69,173,72,0.12)',
                border: '1px solid rgba(69,173,72,0.35)',
                fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', color: '#45AD48',
              },
            }, 'MOVE TO INVENTORY')
          ),
        // ── BYOA owner affordance: use-your-own-image / remove (single replace, §2.4) ──
        h(ItemArtOwner, { itemId: it.regId || bareId(it.key) })   // R-SPC-3: BYOA is keyed bare
      )
    );
  }

  // Per-item art owner row on the overlay — "use your own image" (single replace) + "remove".
  // The store's grid/overlay/counter re-render live via ArtStage's SWRPGUserArt subscription.
  function ItemArtOwner(props) {
    var UA = window.SWRPGUserArt;
    var _h = useState(false), has = _h[0], setHas = _h[1];
    var fileRef = useRef(null);
    useEffect(function () {
      if (!UA || !props.itemId) return undefined;
      var alive = true;
      function refresh() { UA.ready().then(function () { if (alive) setHas(UA.hasArt(props.itemId)); }); }
      refresh();
      var unsub = UA.subscribe(refresh);
      return function () { alive = false; if (unsub) unsub(); };
    }, [props.itemId]);
    if (!UA) return null;
    var picker = h('input', {
      key: 'pick', ref: fileRef, type: 'file', accept: 'image/*',
      'aria-label': 'Use your own image for this item',
      style: { display: 'none' },
      onChange: function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) UA.setOne(props.itemId, f);
        e.target.value = '';
      },
    });
    /* ── B-667 · THE THIRD DOOR ON PAPER ───────────────────────────────────────────────────────────
       The board draws one `hp-quiet` button reading USE YOUR OWN IMAGE, standing beside MOVE TO
       INVENTORY and COMPARE WITH YOURS in the read's flow row. That button is THIS component's, so the
       component takes `paper` and returns the two buttons bare — no row wrapper and no dark hairline,
       because on paper the row is `.st-acts2` and the wrapper would be a second one inside it.
       Everything behind the button is unchanged: the hidden <input>, the IndexedDB writer, the live
       subscription that re-renders every open surface, the REMOVE affordance and both aria-labels. */
    if (props.paper) {
      return [
        picker,
        h('button', {
          key: 'use', type: 'button', className: 'hp-quiet',
          onClick: function () { if (fileRef.current) fileRef.current.click(); },
        }, has ? 'REPLACE IMAGE' : 'USE YOUR OWN IMAGE'),
        has ? h('button', {
          key: 'rm', type: 'button', className: 'hp-quiet',
          'aria-label': 'Remove your image for this item',
          onClick: function () { UA.removeOne(props.itemId); },
        }, 'REMOVE') : null,
      ];
    }
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' } },
      picker,
      h('button', {
        onClick: function () { if (fileRef.current) fileRef.current.click(); },
        style: {
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', minHeight: 32,
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.55)',
        },
      }, has ? '⧉ REPLACE IMAGE' : '⧉ USE YOUR OWN IMAGE'),
      has ? h('button', {
        onClick: function () { UA.removeOne(props.itemId); },
        'aria-label': 'Remove your image for this item',
        style: {
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', minHeight: 32,
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'rgba(255,120,120,0.65)',
        },
      }, 'REMOVE') : null
    );
  }

  /* ══════════════════════════════════════════════════════
     ROSTER PICKER — "shopping for" (chip tap, compare, finalize prompt)
  ══════════════════════════════════════════════════════ */
  function RosterPicker(props) {
    if (useBackToClose) useBackToClose(true, props.onClose);
    return h('div', { style: { position: 'fixed', inset: 0, zIndex: 240, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' } },
      h('div', { onClick: props.onClose, style: { position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.66)' } }),
      h('div', {
        role: 'dialog', 'aria-label': 'Who are you shopping for?',
        style: {
          position: 'relative', maxHeight: '70%', overflowY: 'auto',
          background: 'rgba(10,14,22,0.99)', borderTop: '1px solid rgba(78,170,255,0.35)',
          borderRadius: '14px 14px 0 0', padding: '16px 14px calc(16px + env(safe-area-inset-bottom))',
          animation: 'slideUpBounce 0.3s cubic-bezier(0.32,1.2,0.5,1) forwards',
        },
      },
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', color: '#4EAAFF', marginBottom: 12 } },
          props.title || 'SHOPPING FOR'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
          (props.roster || []).map(function (rec) {
            var active = props.currentId === rec.id;
            var accent = rec.accent || '#4EAAFF';
            var credits = getCredits(rec);
            return h('button', {
              key: rec.id, onClick: function () { props.onPick(rec.id); },
              'aria-current': active ? 'true' : undefined,
              style: {
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 12px',
                cursor: 'pointer', textAlign: 'left', borderRadius: 8,
                background: active ? accent + '14' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (active ? accent + '66' : 'rgba(255,255,255,0.08)'),
                borderLeft: '3px solid ' + accent,
              },
            },
              h('span', { style: { flex: 1, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.92)' } }, rec.name),
              credits != null ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 10, color: '#F5DFA8' } }, fmtCr(credits)) : null
            );
          }),
          props.allowBrowsing ? h('button', {
            onClick: function () { props.onPick(null); },
            style: {
              minHeight: 46, padding: '8px 12px', cursor: 'pointer', borderRadius: 8,
              background: 'none', border: '1px dashed rgba(255,255,255,0.22)',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.6)',
            },
          }, 'JUST BROWSING — NO CHARACTER') : null
        )
      )
    );
  }

  /* ══════════════════════════════════════════════════════
     COUNTER (cart) — editable paper tags, one finalize write, warn-never-block (R-ITM1)
  ══════════════════════════════════════════════════════ */
  function getCredits(rec) {
    var eq = rec && rec.sheetData && rec.sheetData.equipment;
    return eq && eq.credits != null ? Number(eq.credits) : (rec && rec.sheetData ? 0 : null);
  }

  // Build the ONE equipment write from the cart (canonical id-refs; §8 id-ref law).
  //
  // B-687 — `byId` IS THE CATALOG, AND IT IS WHAT LETS THE WRITE REFUSE. A counter line that matches
  // no record has no `section` either, so before this row it fell through to the gear branch and put
  // `{ id: '<the id nobody has>' }` on the sheet: a DANGLING ID-REF, the one thing §8's id-ref law
  // cannot survive — nothing downstream resolves it and the pack carries a blank entry forever.
  // Reachable only since B-669 made the counter persist, because a line can now outlive the registry
  // entry it names. Such a line is SKIPPED, charged nothing, and REPORTED back so the DONE note can
  // say so; `finalizeFor` leaves it on the counter, which is the keep-and-say posture the ruling
  // already gives the slip. Called WITHOUT a catalog — `test/store_kernel.cjs`'s arithmetic legs, or
  // any host with no catalog in hand — nothing CAN be judged and nothing is: the write then behaves
  // exactly as it did before this row.
  // G-7 (R-S4WC-1 A3; B8) — `vplan`, the host's plan over the slip taken BEFORE this debit, is the one judge of a VESSEL
  // line: a line the plan cannot deliver is skipped, kept and charged nothing (B-687's posture, the same `skipped` list);
  // a line it can is charged here, at the plan's price unless the table wrote one (A2), and adds NOTHING to the sheet —
  // it rides back in `vessel` as its record, for the HOST to deliver through the Yard's store in the same act (lib/store
  // never loads the Yard). No plan → every vessel line is kept (a host that hands no seam).
  function buildNextEquipment(equipment, cart, byId, vplan) {
    var eq = Object.assign({}, equipment || {});
    var total = 0, count = 0;
    var skipped = [], vessel = [];
    var weapons = Array.isArray(eq.weapons) ? eq.weapons.slice() : [];
    var gear = Array.isArray(eq.gear) ? eq.gear.slice().map(function (g) { return (g && typeof g === 'object') ? Object.assign({}, g) : g; }) : [];
    // PROV-1 (gear that remembers): each newly-ACQUIRED item gets one auto first-entry — a short,
    // factual acquire stamp (the player writes the poetry later). Plain date per D-ITM8. Only NEW
    // entries are stamped; bumping an existing gear stack adds no note (§3.2). id-refs only (§8).
    var acquireDate = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD, plain
    function acquireStamp(priceEach) { return [{ note: 'purchased — ' + priceEach + ' cr', when: acquireDate }]; }
    // B-692 · R-SPC-9 (Amendment 2 to `store-paper-concept`; Jason 2026-09-18: "If the character is
    // wearing nothing, wear it. If not, pack it.") — THE ONE-DEFAULT CLAUSE, read ONCE, BEFORE the slip
    // is walked: whether the character had a suit ON when the deal closed is a fact about the record
    // that arrived, and reading it per-line would let the suit this very deal puts on make the next
    // suit "already worn" for the wrong reason. `wornHere` is the separate latch for that (the FIRST
    // armour unit on the slip, in SLIP ORDER, and never a second).
    var wasWorn = !!(eq.armor && eq.armor.id);
    var wornHere = 0, packedSuits = 0;
    cart.forEach(function (line) {
      // B-687 — FIRST, AND BEFORE THE MONEY: a line the catalog cannot resolve is not bought. It is
      // counted nowhere and charged nothing — its hand-written `price` included, which is the half
      // that had to be said out loud: an unresolvable line CAN carry a number (`editPrice` marks any
      // typed price on it `edited`, precisely because it has no list price to compare against), and
      // debiting credits for an item that never reaches the sheet is the worse face of this defect.
      if (!lineCharged(line, byId, vplan)) { skipped.push(lineKeyOf(line)); return; }
      var qty = Math.max(1, Number(line.qty) || 1);
      var each = lineEach(line, vplan);
      // R-SPC-3: the counter line carries the SECTION-QUALIFIED catalog key; an id-ref on a sheet is
      // the BARE registry id (§8 id-ref law). This is the one conversion, at the one write. A line
      // persisted before this row is already bare and passes through unchanged.
      var refId = bareId(line.itemId);
      total += each * qty;
      count += qty;
      if (VESSEL_SECTIONS[line.section]) { vessel.push(counterRecordOf(line)); return; }   // charged; the host delivers it
      // The money and the item count are settled ABOVE, over the line's WHOLE quantity, so nothing
      // below can change what was charged — a suit that goes on the body is paid for exactly like a
      // suit that goes in the pack. `packQty` is the part of the line still looking for a home.
      var packQty = qty;
      if (line.section === 'weapons') {
        for (var i = 0; i < qty; i++) weapons.push({ id: refId, provenance: acquireStamp(each) });
        return;
      }
      if (line.section === 'armor' && !wasWorn && !wornHere) {
        // NOTHING ON → WEAR IT. `equipment.armor` is the WORN suit, singular (R-ASS-1, ruling
        // `armor-save-shape`), so this is the one place the store writes it and it writes it only
        // into an EMPTY slot: a worn suit is never REPLACED (R-SPC-8 stands for every other unit).
        // `state: 'worn'` is not decoration — `deriveItemState` (player/app.jsx) reads the entry's
        // own `state` and an armour entry without one derives 'carried', which is what the sheet's
        // PACK would then print for a suit the store just put on (B-686's F6 note). The sheet's own
        // WEAR act writes exactly this shape (`SheetPack`'s `wear`), so worn ↔ inventory stays one
        // shape whichever room performs it, and the encumbrance rule that reads it (a worn suit
        // counts 3 less — EotE p.168 / p.207) sees the truth.
        eq.armor = { id: refId, state: 'worn', provenance: acquireStamp(each) };
        wornHere = 1;
        packQty -= 1;
      }
      if (line.section === 'armor') packedSuits += packQty;
      if (!packQty) return;                                // the whole line went onto the body
      // B-686 · R-SPC-8 (Amendment 1; Jason 2026-09-18: "Append") — EVERY OTHER ARMOUR UNIT IS
      // WRITTEN LIKE A GEAR LINE: the rest of this line's qty, every later armour line, and every
      // unit at all when a suit was already worn. A bought suit is then an ordinary inventory entry
      // carrying the armour record's id-ref, which the sheet resolves from the armour registry and
      // lists under PROTECTION with WEAR (B-613 — the F-59 act). RAW: own many, benefit from one,
      // and a carried-not-worn suit counts full encumbrance (EotE p.168 / p.207). Two spare suits on
      // one line are one entry with `qty: 2`, and the stack bumps exactly as gear's does.
      var hit = stackTargetOf(gear, refId);                 // F-100 M8 R-M8G-14: never onto a marked copy
      if (hit) hit.qty = (Number(hit.qty) || 1) + packQty;   // bump the stack — keeps its existing story, no new note
      else gear.push({ id: refId, qty: packQty, provenance: acquireStamp(each) });
    });
    eq.weapons = weapons;
    eq.gear = gear;
    eq.credits = (Number(eq.credits) || 0) - total;
    // THE DONE NOTE IS DERIVED FROM THE WRITE, not recounted beside it (R-SPC-9: "the DONE note says
    // which happened"). The three numbers the note needs are facts only this function knows, so they
    // travel back with the record rather than being re-derived from the slip by a face — which is how
    // the note and the write came to disagree in the first place (B-669 → B-686).
    // B-687 — AND THE SKIPPED LINES RIDE BACK THE SAME WAY B-692's armour summary does: which lines
    // could not be written is a fact only this function knows, and the DONE note's sentence is
    // DERIVED from it rather than recounted beside it.
    return { next: eq, total: total, count: count,
             armor: { worn: wornHere, packed: packedSuits, wasWorn: wasWorn },
             skipped: { ids: skipped, count: skipped.length }, vessel: vessel };
  }

  function CounterView(props) {
    var cart = props.cart, byId = props.byId, shopFor = props.shopFor;
    var _warn = useState(false), warnArmed = _warn[0], setWarnArmed = _warn[1];
    var _done = useState(null), doneMsg = _done[0], setDoneMsg = _done[1];
    var credits = getCredits(shopFor);
    var total = cart.reduce(function (s, l) {   // B-707 — the write's own predicate: shown = charged
      return lineCharged(l, byId, props.vplan) ? s + lineEach(l, props.vplan) * Math.max(1, Number(l.qty) || 1) : s;
    }, 0);
    var cartEnc = cart.reduce(function (s, l) {
      var it = byId[l.itemId];
      return s + (Number(it && it.encumbrance) || 0) * Math.max(1, Number(l.qty) || 1);
    }, 0);
    var short = shopFor && credits != null && total > credits;
    // B-686 · R-SPC-8 — `currentArmorId` (the worn suit's id) went with the REPLACES note below, and it
    // stays gone under B-692 · R-SPC-9: the slip still has nothing to WARN about, because the store
    // never replaces a worn suit — it fills an empty slot or it packs. What the character has on is
    // read at the ONE WRITE (`buildNextEquipment`'s `wasWorn`) and said afterwards on the DONE note;
    // the swap itself is the SHEET's, where WEAR lives (R-ASS-1, B-613).

    function doFinalize(charId) {
      var ok = props.onFinalize(charId, cart);
      if (ok) {
        setWarnArmed(false);
        var sum = (ok && typeof ok === 'object') ? ok : null;
        setDoneMsg({
          // B-687 — THE COUNT AND THE MONEY NOW COME FROM THE WRITE'S OWN SUMMARY, for the same reason
          // B-692 moved the armour sentences there: with a line the write REFUSED, a slip-side recount
          // would print items that never landed and credits that were never spent. Identical on every
          // slip whose lines all resolve (that is what made the old recount look harmless), and the
          // slip-side numbers stay as the fallback for a host that answers a bare `true`.
          count: sum && sum.count != null ? sum.count
            : cart.reduce(function (s, l) { return s + (Number(l.qty) || 1); }, 0),
          total: sum && sum.total != null ? sum.total : total,
          // The lines the write could not take, named by the write (ids + count). No summary → no
          // claim: the note says nothing rather than guessing.
          skipped: (sum && sum.skipped && typeof sum.skipped === 'object') ? sum.skipped
            : { ids: [], count: 0 },
          // WB2 · the ship half of the note, from the write's own summary (none from a host that answers a bare `true`)
          vesselDone: (sum && Array.isArray(sum.vesselDone)) ? sum.vesselDone : [],
          gearDone: sum ? sum.gearDone !== false : true,
          charId: charId,
          // B-692 · R-SPC-9 — the armour sentences come from THE WRITE (`buildNextEquipment`'s own
          // summary, carried back by the host's `finalizeFor`), not from a second count over the slip:
          // which suit went on the body and which went in the pack is a fact about the record, and the
          // slip cannot tell you whether the character had anything on. B-669's slip-side count is
          // KEPT as the fallback for a host that answers a bare `true` — it is still the right total
          // of suits bought, and with no summary the note falls back to the pack sentence, which is
          // what R-SPC-8 says happens whenever the worn slot is not written.
          armor: (ok.armor && typeof ok.armor === 'object') ? ok.armor : {
            worn: 0, wasWorn: true,
            packed: cart.reduce(function (s, l) {
              return s + (l.section === 'armor' ? Math.max(1, Number(l.qty) || 1) : 0);
            }, 0),
          },
        });
      }
    }
    function handleFinalizeTap() {
      if (!cart.length) return;
      if (!shopFor) { props.onNeedCharacter(doFinalize); return; }   // context asked at the last moment
      if (short && !warnArmed) { setWarnArmed(true); return; }       // R-ITM1: warn, never block
      doFinalize(shopFor.id);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════════════
       B-669 · THE COUNTER ON PAPER (`store_build.py`'s `counter_board` + `slip_rows`; the frames
       `counter_board()` · `(state=reloaded)` · `(state=short)` · `(state=empty)` · `(state=done)` at
       lab `cf33463e`, and `bars(ctx=Kael Vro, active=counter)` at lab `1e1e2f6a`)

       THE SAME COMPONENT, the same state and the SAME WRITERS — `SellSheet`'s pattern, and row 3's and
       row 4's. What returns from here is the CONTENT of the board's `.ct-body`; `Store` owns that
       element (it has since row 1) exactly as it owns the holds tab's.

       WHAT THE BOARD DECIDES and this build takes verbatim: the head's two lines (row 1's already),
       every slip row's anatomy and order, the four summary rows, the warn's sentence, the button's two
       words, the empty state's teaching and the DONE block. WHAT THE KERNEL DECIDES and the board could
       not: the numbers, and the states the board never drew (just browsing; an unresolvable line with
       no record at all).
    ══════════════════════════════════════════════════════════════════════════════════════════════ */
    if (props.paper) {
      // ACTIVE SOURCES, asked to SAY "off" and never to remove — row 4's posture on the holds list,
      // and the counter's own case is the one the board actually drew (`slip_rows(unresolvable=True)`:
      // a line whose book is switched off is still a line, hatched, with its sentence).
      var srcNow = window.SWRPGSources && window.SWRPGSources.current();
      var offBook = function (it) {
        return !!(srcNow && srcNow.index && !window.SWRPGSources.isActiveWith(it, srcNow.index, srcNow.off));
      };
      // THE BOARD'S OWN SENTENCE, verbatim, for the case the board drew: the book is off.
      var OFF_BOOK_WHY = 'Not on the shelf today — the book it came from is switched off. '
        + 'Kept as you left it.';
      // AND THE HALF OF IT THAT IS TRUE for a line whose id matches NO record in any section — the
      // board never drew that state and it cannot claim a book, exactly as row 4's hold row cannot.
      var GONE_WHY = 'Not on the shelf today. Kept as you left it.';

      if (doneMsg) {
        var doneRec = (props.roster || []).find(function (r) { return r.id === doneMsg.charId; });
        // THE ARMOUR NOTE. Every number and every sentence in it is DERIVED from what the write did —
        // the board's frame says "Both suits" because its fixture had two, and a typed "Both" over one
        // suit would be an invented number in a sentence. Drawn only when armour was bought: with no
        // suit on the slip the note has nothing true to say.
        var arm = doneMsg.armor || {};
        var wornSuit = Number(arm.worn) || 0, packSuits = Number(arm.packed) || 0;
        // B-687 — how many lines the write refused. 0 draws nothing at all: a deal where everything
        // landed has nothing to say about lines that did not.
        var keptN = Number(doneMsg.skipped && doneMsg.skipped.count) || 0;
        var shipKeptN = ((doneMsg.skipped && doneMsg.skipped.ids) || []).filter(function (k) { return /^v(part|mod|weap):/.test(String(k)); }).length;
        var gearKeptN = Math.max(0, keptN - shipKeptN);
        var who = (doneRec && String(doneRec.name || '').trim().split(/\s+/)[0]) || 'this character';
        // WB2 · a deal of ship lines only, to one ship, all fitted or all to its hold, says where they went and who paid;
        // any other deal keeps the sheet's sentence
        var vd = doneMsg.vesselDone || [], shipsDone = vd.map(function (x) { return x.ship; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        var shipOnly = vd.length > 0 && !doneMsg.gearDone && shipsDone.length === 1;
        var allFit = vd.every(function (x) { return x.then === 'fit'; }), allHold = vd.every(function (x) { return x.then === 'hold'; });
        var shipIn = shipOnly ? String(shipsDone[0]).replace(/^The /, 'the ') : null;
        var doneTail = shipOnly && (allFit || allHold)
          ? ' — ' + (allFit ? 'fitted to ' + shipIn : 'into the hold of ' + shipIn) + (doneRec ? ', paid by ' + doneRec.name : '') + '.'
          : (doneRec ? ' — on ' + doneRec.name + '’s sheet.' : '.');
        return h('div', { className: 'ct-done', 'data-store-done': '1' },
          h('p', { className: 'ct-donehd' }, 'DEAL DONE'),
          h('p', null, doneMsg.count + (doneMsg.count === 1 ? ' item' : ' items') + ' · '
            + (Number(doneMsg.total) || 0).toLocaleString('en-US') + ' cr' + doneTail),
          // B-692 · R-SPC-9 (Amendment 2; Jason 2026-09-18: "If the character is wearing nothing, wear
          // it. If not, pack it.") — THE NOTE SAYS WHICH HAPPENED, in up to two sentences, and BOTH when
          // both (one suit went on, the rest went in). The worn sentence is the ruling's own words; the
          // frame never drew this state, so it takes no bold of its own and the approved pack sentence
          // keeps its `pack` in bold exactly as B-686 built it.
          //
          // AND THE STANDING LINE IS NOW CONDITIONAL. "Buying armour does not change what <name> is
          // wearing" is Jason's approved sentence and it is kept word for word — but it is only TRUE
          // when something was already on, so it is drawn only then. Printed beside a suit this very
          // deal put on the body, the sentence Jason approved to be reassuring would be a lie.
          (wornSuit || packSuits) ? h('p', { className: 'ct-owned' },
            wornSuit ? 'Worn — ' + who + ' had nothing on.' : null,
            (wornSuit && packSuits) ? ' ' : null,
            packSuits ? (packSuits === 1 ? '1 suit to the ' : packSuits + ' suits to the ') : null,
            packSuits ? h('b', null, 'pack') : null,
            packSuits ? (' — not worn. '
              + (arm.wasWorn ? 'Buying armour does not change what ' + who + ' is wearing. ' : '')
              + (packSuits === 1 ? 'Wear it' : 'Wear one') + ' from the sheet’s PACK.') : null) : null,
          // B-687 · THE LINES THE WRITE COULD NOT TAKE, said here because this is the block that says
          // what the deal did. DERIVED (the count is the write's own, never typed) and placed in the
          // frame's own muted-paragraph slot — `counter_board(state=done)` draws `.ct-donehd`, the
          // count/total line, one `.ct-owned` paragraph, then `.ct-acts`, and this is a second
          // paragraph in that same slot wearing that same class. THE SENTENCE IS THE ROW'S OWN plus
          // the slip's own second clause verbatim (`GONE_WHY`: "Kept as you left it."), so the note
          // and the line the player then finds still on the counter say the same thing.
          gearKeptN ? h('p', { className: 'ct-owned ct-kept', 'data-store-kept': String(gearKeptN) },
            (gearKeptN === 1 ? '1 line could not be written' : gearKeptN + ' lines could not be written')
            + ' — not on the shelf. Kept as you left it.') : null,
          // WB2 · a ship line the deal could not deliver: the same keep-and-say, in its own words
          shipKeptN ? h('p', { className: 'ct-owned ct-kept', 'data-store-kept': String(shipKeptN), 'data-kept-kind': 'ship' },
            (shipKeptN === 1 ? '1 line could not reach its ship.' : shipKeptN + ' lines could not reach their ships.')
            + ' Kept as you left it.') : null,
          h('div', { className: 'ct-acts' },
            (doneRec && props.onOpenSheet) ? h('button', {
              type: 'button', onClick: function () { props.onOpenSheet(doneMsg.charId); },
            }, 'OPEN THE SHEET') : null,
            h('button', {
              type: 'button', onClick: function () { setDoneMsg(null); props.onBrowse(); },
            }, 'KEEP SHOPPING')));
      }

      if (!cart.length) {
        // JASON'S APPROVED COPY (§189), and the board's own two paragraphs. The teaching STORE_SHAPE §3
        // protects — "set what the table charged" — is the bolded half.
        return h('div', { className: 'ct-empty hp-teach', 'data-store-empty': '1' },
          h('p', null, 'The counter is empty.'),
          h('p', { className: 'ct-teach' }, 'Add items here and ',
            h('b', null, 'set what the table charged'), '. Finalize writes them to the sheet once.'));
      }

      // G-7 · K2 — A SHIP LINE ON THE COUNTER (the approved frame `Docs/mockups/shipyard-counter-parts.html` K2; its kept
      // state WB2, `Docs/mockups/shipyard-s4-workbench-undrawn.html` @ f948b022, `shipyard-s4-approvals` R-S4A-4). Its words
      // are the HOST'S, from the `vessel` seam's plan read at render — lib/store parses no vehicle data (A2): the part (a
      // mod: its part and its own words), whose ship it is for, FIT | HOLD, the tag the table charges and what the list says.
      // A line the plan cannot deliver keeps its row, wears the hatched mat, says why in place of its tags, costs "—" and
      // counts in no total (A1, A3, A4; B-687's keep-and-say). No `for` is A1's line; no seam at all is a host without the
      // Ship Yard switched on. The three reasons are WB2's; any other the fold gives shares one plain sentence.
      var VESSEL_WHY = {
        away: 'Its ship isn’t on this device. Kept as you left it.',
        off: 'Ship parts go aboard only while the new Ship Yard is switched on. Kept as you left it.',
        none: 'This line has lost its ship: an older version of the app saved the counter without it. Kept as you left it.',
      };
      var VESSEL_WHY_ELSE = 'Its ship can’t take it as the line stands. Kept as you left it.';
      function vesselLine(line) {
        var key = lineKeyOf(line), vp = props.vplan, pr = vp && vp.row ? vp.row[key] || null : null;
        var loading = !!(vp && vp.loading) && !!line.for;
        var why = !line.for ? 'none' : !vp ? 'off' : (pr && pr.why) || null;
        var kept = !loading && !(vp && vp.ok && vp.ok[key]);
        var mod = line.section === 'vmod', one = line.section !== 'vpart';
        var nm = (pr && pr.name) || line.itemId, qty = Math.max(1, Number(line.qty) || 1), each = lineEach(line, vp);
        var then = line.for && line.for.then === 'hold' ? 'hold' : 'fit';
        function seg(w, label) {
          var on = then === w;
          return h('button', { key: w, type: 'button', className: 'ct-segb', 'data-on': on ? '1' : '0', 'aria-pressed': on,
            'data-store-vthen': w, onClick: function () { props.onFor(key, w); } }, label);
        }
        return h('div', {
          key: key, className: 'ct-line', 'data-counter-line': line.itemId, 'data-vessel-line': line.section,
          'data-deliverable': kept || loading ? '0' : '1', 'data-unresolved': kept ? '1' : null, 'data-store-vwhy': kept ? (why || 'else') : null,
        },
          h('div', { className: 'hp-plate st-mat' }, glyphSvg((pr && pr.glyph) || 'parcel', 26)),
          h('div', { className: 'ct-nm' }, mod
            ? h(React.Fragment, null, h('span', { className: 'ct-vmod' }, 'A MOD · ' + nm), pr && pr.detail ? h('br') : null, pr && pr.detail ? glyphs(pr.detail) : null)
            : nm),
          kept ? h('div', { className: 'hp-why st-why' }, VESSEL_WHY[why] || VESSEL_WHY_ELSE)
            : loading ? h('div', { className: 'hp-why st-why' }, 'LOADING…')
            : h(React.Fragment, null,
                h('div', { className: 'ct-tags' },
                  pr && pr.ship ? h('span', { className: 'ct-stamp', 'data-k': pr.owner || 'party' }, 'FOR ' + String(pr.ship).toUpperCase()) : null,
                  mod ? h('span', { className: 'ct-list' }, 'ON THE PART ABOARD')
                    : h('div', { className: 'ct-seg', role: 'group', 'aria-label': 'Where it goes' }, seg('fit', 'FIT'), seg('hold', 'HOLD'))),
                h('div', { className: 'ct-tagrow' },
                  h('input', {
                    type: 'text', inputMode: 'numeric', className: 'ct-tag', size: 7, 'data-edited': line.edited ? '1' : null,
                    value: String(each), 'aria-label': 'Price paid for ' + nm,
                    onChange: function (e) { props.onEditPrice(key, e.target.value.replace(/[^0-9]/g, '')); },
                  }),
                  h('span', { className: 'ct-list' }, line.edited && pr && typeof pr.price === 'number'
                    ? 'LIST ' + pr.price.toLocaleString('en-US') : ((pr && pr.list) || 'CR EACH'),
                    pr && pr.cite ? ' ' : null, pr && pr.cite ? h('span', { className: 'ct-cite' }, pr.cite) : null)),
                mod && pr && pr.note ? h('p', { className: 'hp-why st-why' }, pr.note) : null),
          h('div', { className: 'ct-foot' },
            h('div', { className: 'ct-qty' },
              // A6: a mod or a weapon line is one — its stepper is drawn (K2) and holds
              h('button', { type: 'button', className: 'hp-buy-btn', 'aria-label': 'One less ' + nm, disabled: one || qty <= 1 ? true : undefined,
                onClick: function () { props.onQty(key, -1); } }, '−'),
              h('b', { className: 'hp-buy-step' }, String(qty)),
              h('button', { type: 'button', className: 'hp-buy-btn', 'aria-label': 'One more ' + nm, disabled: one ? true : undefined,
                onClick: function () { props.onQty(key, 1); } }, '+')),
            h('div', { className: 'ct-tot' },
              h('span', { className: 'hp-buy-cost' }, fmtCr(kept || loading ? NaN : each * qty)),
              h('button', { type: 'button', className: 'hp-buy-btn ct-rm', 'aria-label': 'Take ' + nm + ' off the counter',
                onClick: function () { props.onRemove(key); } }, 'REMOVE'))));
      }

      var slip = h('div', { className: 'hp-index ct-lines' }, cart.map(function (line) {
        if (VESSEL_SECTIONS[line.section]) return vesselLine(line);
        var it = lineRecord(line.itemId, byId);   // B-687 — the ONE predicate, shared with the write
        var gone = !it;
        var off = !!(it && offBook(it));
        var each = Math.max(0, Number(line.priceEach) || 0);
        var qty = Math.max(1, Number(line.qty) || 1);
        // `edited` is the LINE'S OWN FLAG since this row (it decides the stored `price`); the old
        // comparison stays as the fallback for a line put on the slip before the flag existed.
        var edited = line.edited != null ? !!line.edited
          : (it ? Number(each) !== Number(it.price) : each > 0);
        var nm = it ? it.name : line.itemId;
        // A line with no record and no hand-written price has no total to print — `fmtCr` prints the
        // board's em-dash for that rather than a confident 0 cr.
        var cost = (it || line.edited) ? each * qty : NaN;
        return h('div', {
          key: lineKeyOf(line), className: 'ct-line', 'data-counter-line': line.itemId,
          // THE HATCHED MAT IS THE BOARD'S MARK for "not on the shelf today" and both cases wear it;
          // `data-off-book` is row 4's own attribute, so a reader (and a driver) can tell the two
          // apart — the book is off, or the catalog has no such record at all.
          'data-unresolved': (gone || off) ? '1' : null,
          'data-off-book': off ? '1' : null,
        },
          h('div', { className: 'hp-plate st-mat' }, it ? glyphSvg(glyphFamily(it), 26) : null),
          h('div', { className: 'ct-nm' }, nm),
          // THE BOARD DRAWS THE SENTENCE IN PLACE OF THE TAG ROW, and that is a decision and not a
          // gap: an item that is not on the shelf has no list price to write over.
          (gone || off) ? h('div', { className: 'hp-why st-why' }, gone ? GONE_WHY : OFF_BOOK_WHY)
            : h('div', { className: 'ct-tagrow' },
                // THE BOARD'S TAG IS A `<span>` and this is an `<input>`, because the board is drawing a
                // state and the brief asks for a press-to-edit field — the tag IS the one number a
                // player writes, which is the whole reason the surface is called a counter. The class,
                // its dashed-to-maroon rule and the `aria-label` three shipped smokes drive are all
                // unchanged. `size` is an HTML attribute rather than a new CSS rule: a text input's
                // intrinsic width is 20 characters, which made the tag four times the board's box; 7
                // is the digit count of the dearest thing on any shelf (1,000,000 cr), and `.ct-tag`'s own
                // 76px floor still governs the minimum.
                h('input', {
                  type: 'text', inputMode: 'numeric', className: 'ct-tag', size: 7,
                  'data-edited': edited ? '1' : null,
                  value: String(each), 'aria-label': 'Price paid for ' + nm,
                  onChange: function (e) { props.onEditPrice(lineKeyOf(line), e.target.value.replace(/[^0-9]/g, '')); },
                }),
                h('span', { className: 'ct-list' }, edited
                  ? 'LIST ' + (Number(it.price) || 0).toLocaleString('en-US') : 'CR EACH')),
          h('div', { className: 'ct-foot' },
            h('div', { className: 'ct-qty' },
              // B-686 · R-SPC-8 — EVERY LINE TAKES THE STEPPER, as frames F/J draw it. The armour pin
              // that suppressed the ± on an armour line is retired with the write it protected: a suit
              // is counted like anything else on the slip and two suits are one line at qty 2.
              h('button', {
                type: 'button', className: 'hp-buy-btn', 'aria-label': 'One less ' + nm,
                onClick: function () { props.onQty(lineKeyOf(line), -1); },
              }, '−'),
              h('b', { className: 'hp-buy-step' }, String(qty)),
              h('button', {
                type: 'button', className: 'hp-buy-btn', 'aria-label': 'One more ' + nm,
                onClick: function () { props.onQty(lineKeyOf(line), 1); },
              }, '+')),
            h('div', { className: 'ct-tot' },
              h('span', { className: 'hp-buy-cost' }, fmtCr(cost)),
              h('button', {
                type: 'button', className: 'hp-buy-btn ct-rm',
                'aria-label': 'Take ' + nm + ' off the counter',
                onClick: function () { props.onRemove(lineKeyOf(line)); },
              }, 'REMOVE'))));
      }));

      // THE WARN ARRIVES WITH THE SHORTFALL, as the board's `state=short` frame draws it (the frame
      // shows the sentence and the button together). THE TWO-STEP IS UNCHANGED: the first press arms,
      // the second confirms — a writer, and this row changes no writer. So the sentence is the board's
      // placement and the button word is the kernel's arming state.
      var warnLine = short ? h('p', { className: 'ct-warn', role: 'status' },
        'Total ' + (total).toLocaleString('en-US') + ' cr · ' + (shopFor ? shopFor.name : '')
        + ' has ' + (Number(credits) || 0).toLocaleString('en-US') + ' cr. Finalizing puts credits at '
        + (credits - total).toLocaleString('en-US') + ' — your table’s call.') : null;
      // K2 · with a ship line the deal will deliver, the button's own note: who pays, where it goes, and that a ship holds no
      // credits of its own (one ship, all fitted or all to its hold, as K2 draws it; any other deal names no ship)
      var vDel = cart.filter(function (l) { return VESSEL_SECTIONS[l.section] && props.vplan && props.vplan.ok && props.vplan.ok[lineKeyOf(l)]; });
      var vShips = vDel.map(function (l) { var r = props.vplan.row[lineKeyOf(l)]; return r && r.ship; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      var vParts = vDel.reduce(function (n, l) { return n + (l.section === 'vmod' ? 0 : Math.max(1, Number(l.qty) || 1)); }, 0);
      var vWhat = vParts ? (vParts === 1 ? 'the part' : 'the parts') : (vDel.length === 1 ? 'the mod' : 'the mods');
      var vTo = vShips.length === 1 ? String(vShips[0]).replace(/^The /, 'the ') : null;
      var vHow = !vTo ? 'delivers each ship line to its ship'
        : vDel.every(function (l) { return l.for.then === 'fit'; }) ? 'fits ' + vWhat + ' to ' + vTo
        : vDel.every(function (l) { return l.for.then === 'hold'; }) ? 'puts ' + vWhat + ' in the hold of ' + vTo : 'delivers each ship line to ' + vTo;
      var vNote = shopFor && vDel.length ? h('p', { className: 'ct-vfin', 'data-store-vfin': '1' },
        'Finalizing debits ' + shopFor.name + ', and ' + vHow + '. A ship holds no credits of its own.') : null;
      var sum = h('div', { className: 'ct-sum' },
        h('div', { className: 'ct-srow' },
          h('span', null, 'TOTAL'), h('b', null, total.toLocaleString('en-US') + ' cr')),
        // The purse row needs a purse: just browsing has no credits to read, and the board never drew
        // that state (STORE_SHAPE law 4 — who this is for is asked at finalize, not before).
        (shopFor && credits != null) ? h('div', { className: 'ct-srow ct-dim' },
          h('span', null, String(shopFor.name || '').toUpperCase() + ' HAS '
            + (Number(credits) || 0).toLocaleString('en-US') + ' CR'),
          h('span', null, 'AFTER · ' + (credits - total).toLocaleString('en-US') + ' CR')) : null,
        // Drawn whenever there are lines, as the board draws it. "ADDS 0 ENCUMBRANCE" is a true
        // sentence about a slip of weightless things; the dark face hides the row at zero.
        h('div', { className: 'ct-srow ct-dim' },
          h('span', null, 'ADDS ' + cartEnc + ' ENCUMBRANCE')),
        warnLine,
        h('button', {
          type: 'button', className: 'ct-fin', 'data-store-finalize': true,
          'data-warn': short ? '1' : '0', onClick: handleFinalizeTap,
        }, !shopFor ? 'FINALIZE — PICK A CHARACTER'
          : (short && warnArmed
              ? 'CONFIRM — GO ' + Math.abs(credits - total).toLocaleString('en-US') + ' CR UNDER'
              : 'FINALIZE · ' + total.toLocaleString('en-US') + ' CR')),
        vNote);

      return h(React.Fragment, null, slip, sum);
    }

    if (doneMsg) {
      var rec = (props.roster || []).find(function (r) { return r.id === doneMsg.charId; });
      return h('div', { style: { padding: '28px 18px', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' } },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, letterSpacing: '0.06em', color: '#4ECB71' } }, 'DEAL DONE'),
        h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' } },
          doneMsg.count + (doneMsg.count === 1 ? ' item' : ' items') + ' · ' + fmtCr(doneMsg.total)
          + (rec ? ' — on ' + rec.name + '’s sheet' : '')),
        rec && props.onOpenSheet ? h('button', {
          onClick: function () { props.onOpenSheet(doneMsg.charId); },
          style: {
            minHeight: 46, padding: '10px 22px', cursor: 'pointer', borderRadius: 8,
            background: 'rgba(78,170,255,0.1)', border: '1px solid rgba(78,170,255,0.5)',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#4EAAFF',
          },
        }, 'OPEN THE SHEET') : null,
        h('button', {
          onClick: function () { setDoneMsg(null); props.onBrowse(); },
          style: {
            minHeight: 44, padding: '8px 18px', cursor: 'pointer', borderRadius: 8,
            background: 'none', border: '1px solid rgba(255,255,255,0.16)',
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.6)',
          },
        }, 'KEEP SHOPPING')
      );
    }

    if (!cart.length) {
      return h('div', { style: { padding: '40px 24px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)' } },
        // R-SPC-3, THE WORDS — Jason's approved empty-state copy (§189), replacing the shipped
        // "pile your picks here … walk out once". The paper face draws the board's two paragraphs;
        // the dark face carries the ruling's replacement string as one line.
        'Add items here and set what the table charged. Finalize writes them to the sheet once.');
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 20px' } },
      cart.map(function (line) {
        // R-SPC-3: qualified today; a bare line written before this row still resolves.
        var it = byId[line.itemId] || byId[qualifyKey(line.itemId, byId)]
          || { name: line.itemId, price: line.priceEach };
        var edited = Number(line.priceEach) !== Number(it.price);
        var lineTotal = Math.max(0, Number(line.priceEach) || 0) * Math.max(1, Number(line.qty) || 1);
        return h('div', {
          key: lineKeyOf(line),
          style: {
            display: 'flex', gap: 10, alignItems: 'center', padding: '10px 10px',
            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
          },
        },
          h(ArtStage, { item: it, size: 42 }),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, it.name),
            // B-686 · R-SPC-8 — 'REPLACES THE WORN ARMOR ON FINALIZE' is GONE, on this face too: it
            // described the write that retired. Nothing takes its place on the line, because a bought
            // suit now behaves like every other line and there is nothing special left to warn about.
            // the editable tag — the table's price, not our list price (paper layer)
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 } },
              h('input', {
                type: 'text', inputMode: 'numeric', value: String(line.priceEach),
                'aria-label': 'Price paid for ' + it.name,
                onChange: function (e) { props.onEditPrice(lineKeyOf(line), e.target.value.replace(/[^0-9]/g, '')); },
                style: {
                  width: 76, padding: '4px 6px', boxSizing: 'border-box',
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5DFA8',
                  background: 'rgba(245,200,66,0.06)', borderRadius: 3, outline: 'none',
                  border: '1px dashed rgba(245,200,66,' + (edited ? '0.7' : '0.3') + ')',
                },
              }),
              h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' } },
                edited ? 'LIST ' + fmtCr(it.price) : 'CR EACH')
            )
          ),
          // qty stepper — B-686 · R-SPC-8: EVERY line, armour included (the pin retired with the write)
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
            h('button', {
              onClick: function () { props.onQty(lineKeyOf(line), -1); }, 'aria-label': 'One less ' + it.name,
              style: qtyBtnStyle,
            }, '−'),
            h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: '#fff', minWidth: 20, textAlign: 'center' } }, String(line.qty)),
            h('button', {
              onClick: function () { props.onQty(lineKeyOf(line), 1); }, 'aria-label': 'One more ' + it.name,
              style: qtyBtnStyle,
            }, '+')
          ),
          h('div', { style: { textAlign: 'right', minWidth: 64 } },
            h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5DFA8' } }, fmtCr(lineTotal)),
            h('button', {
              onClick: function () { props.onRemove(lineKeyOf(line)); }, 'aria-label': 'Take ' + it.name + ' off the counter',
              style: { marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', color: 'rgba(255,120,120,0.7)', padding: '4px 0', minHeight: 24 },
            }, 'REMOVE')
          )
        );
      }),
      // ── totals + finalize ──
      h('div', { style: { borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.75)' } },
          h('span', null, 'TOTAL'), h('span', { style: { color: '#F5DFA8', fontSize: 13 } }, fmtCr(total))),
        shopFor && credits != null ? h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', color: short ? '#FFC857' : 'rgba(255,255,255,0.45)' } },
          h('span', null, (shopFor.name || '').toUpperCase() + ' HAS ' + fmtCr(credits)),
          h('span', null, 'AFTER: ' + fmtCr(credits - total))) : null,
        cartEnc > 0 ? h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' } },
          'ADDS ' + cartEnc + ' ENCUMBRANCE') : null,
        // R-ITM1 warning state — information, never a wall. Credits may go negative (the honest ledger).
        short && warnArmed ? h('div', {
          role: 'status',
          style: {
            padding: '10px 12px', borderRadius: 6,
            background: 'rgba(255,200,87,0.07)', border: '1px solid rgba(255,200,87,0.4)',
            fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,224,160,0.9)',
          },
        }, 'Total ' + fmtCr(total) + ' · ' + (shopFor ? shopFor.name : '') + ' has ' + fmtCr(credits)
          + '. Finalizing puts credits at ' + fmtCr(credits - total) + ' — your table’s call.') : null,
        h('button', {
          onClick: handleFinalizeTap,
          'data-store-finalize': true,
          style: {
            minHeight: 52, cursor: 'pointer', borderRadius: 8,
            background: short && warnArmed
              ? 'linear-gradient(180deg, rgba(255,200,87,0.25), rgba(255,200,87,0.12))'
              : 'linear-gradient(180deg, rgba(78,203,113,0.22), rgba(78,203,113,0.1))',
            border: '1px solid ' + (short && warnArmed ? 'rgba(255,200,87,0.65)' : 'rgba(78,203,113,0.55)'),
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em',
            color: short && warnArmed ? '#FFE0A0' : '#9BE8B2',
          },
        }, !shopFor ? 'FINALIZE — PICK A CHARACTER'
          : (short ? (warnArmed ? 'CONFIRM — GO ' + fmtCr(Math.abs(credits - total)) + ' UNDER' : 'FINALIZE · ' + fmtCr(total)) : 'FINALIZE · ' + fmtCr(total)))
      )
    );
  }
  var qtyBtnStyle = {
    minWidth: 34, minHeight: 34, cursor: 'pointer', borderRadius: 6,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)',
    fontFamily: 'var(--font-display)', fontSize: 14, color: 'rgba(255,255,255,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
  };

  /* ══════════════════════════════════════════════════════
     SELL SHEET — cited ¼/½/¾ tiers + the table's free price (ITM-A §3.3)
     Hosted by the paper sheet's PACK (the sell affordance lives where the gear lives); the kernel owns
     the tiers + cite so the RAW numbers have ONE home. Selling is the host's write. (N-post: the dark
     bottom sheet went with the old GEAR tab, its only other host.)
  ══════════════════════════════════════════════════════ */
  function SellSheet(props) {
    var it = props.item || {};
    var list = Number(it.price);
    var hasList = isFinite(list) && list > 0;
    var _amt = useState(hasList ? Math.floor(list * 0.25) : 0), amount = _amt[0], setAmount = _amt[1];
    // B-233 — this sheet was a TRAP: three price tiers, a SELL confirm, and no way back out but
    // completing a sale you may not have wanted. NAVIGATION.md's conformance item 2 wants at least
    // one always-visible escape from every surface, and the sibling artwork sheet (:1766) already
    // carries the pattern, so this is standard chrome being restored, not new UI. Three exits, on
    // purpose: the × for the eye, the scrim for the thumb, Escape for the keyboard.
    var onClose = props.onClose;
    useEffect(function () {
      if (!onClose) return;
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }
      // CAPTURE phase: an ancestor Escape handler (the sheet page's own) would otherwise act on a
      // key that belongs to the topmost surface. The topmost surface answers first.
      document.addEventListener('keydown', onKey, true);
      return function () { document.removeEventListener('keydown', onKey, true); };
    }, [onClose]);
    // NO useBackToClose here (R-UBC1 hazard 1, now belt-and-suspenders). The SHEET-screen clobber
    // this dodged is FIXED at the root (player/app.jsx re-hydrates sheetData only on a real char
    // switch, not on an overlay-dismissal pop); this fence stays as defence-in-depth — the sale is a
    // commerce write-through anyway, so it needs no history entry.
    // B-632 — SELL ON PAPER: the same tiers, price, cite and writer, as an ENTRY beneath the panel's verbs
    // (the credits pad's lesson, B-630: a board's entry is not a sheet over the page). Escape still closes it.
    return h('div', { className: 'sb-e sb-sell', 'data-testid': 'sell-sheet', role: 'group', 'aria-label': 'Sell ' + (it.name || 'item') },
      h('div', { className: 'sb-e-h' }, h('span', { className: 'sb-e-n' }, 'Sell ' + (it.name || 'item')),
        h('span', { className: 'sb-e-m' }, hasList ? 'List ' + fmtCr(list) : 'No list price on record')),
      props.unitNote ? h('p', { className: 'sb-e-t' }, props.unitNote) : null,
      hasList ? h('div', { className: 'sb-sell-tiers' }, SELL_TIERS.map(function (t) {
        var v = Math.floor(list * t.frac); var active = amount === v;
        return h('button', { key: t.label, type: 'button', className: 'sb-sell-chip', 'data-testid': 'sell-tier-' + Math.round(t.frac * 100),
          'aria-pressed': active ? 'true' : 'false', onClick: function () { setAmount(v); } }, t.label + ' · ' + fmtCr(v));
      })) : h('p', { className: 'sb-e-t' }, 'No list price on record — enter what the table ruled.'),
      h('div', { className: 'sb-sell-price' },
        h('input', { type: 'text', inputMode: 'numeric', className: 'sb-fld-in', value: String(amount), 'aria-label': 'Sale price', 'data-testid': 'sell-price',
          onChange: function (e) { setAmount(Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)); } }),
        h('span', { className: 'sb-e-m' }, 'cr — the table’s price')),
      h('p', { className: 'sb-e-t' }, 'Sell-back: ¼ of list on a success, ½ or ¾ on better results (' + SELL_CITE + ').'
        + (it.restricted ? ' Restricted — it sells via Streetwise.' : '') + ' Removes it from the sheet and adds the credits.'),
      h('div', { className: 'sb-pk-verbs' },
        h('button', { type: 'button', className: 'hp-commit', 'data-store-sell-confirm': true, 'data-testid': 'sell-confirm', onClick: function () { props.onSell(amount); } }, 'Sell — ' + fmtCr(amount)),
        h('button', { type: 'button', className: 'hp-quiet', 'data-store-sell-close': true, 'data-testid': 'sell-cancel', onClick: props.onClose }, 'Cancel')));
  }

  /* ══════════════════════════════════════════════════════
     GM FACE — the location masthead, its picker, and THE SHELVES
     (STORE-UNIFY. Player face never renders these; face-gated in Store.)
  ══════════════════════════════════════════════════════ */

  // B-1124 (R-GOS-32, R-A2-5) — a negative prints a TRUE MINUS (U+2212), so the picker's rows, the stamp and the lane
  // toggle print one sign; `String(mod)` printed an ASCII hyphen beside the toggle's and the cite's −1. ONE shared
  // function, so the dark face's Masthead prints it too — the lap's one disclosed OFF-visible change (C-MU-3's class).
  function modText(mod) { return mod === 0 ? '±0' : (mod > 0 ? '+' + mod : '−' + Math.abs(mod)); }
  function modColor(mod) { return mod > 0 ? '#FF9E6B' : (mod < 0 ? '#9BE8B2' : 'rgba(255,255,255,0.45)'); }

  // The location as the shop's title block. Tap → the circumstance picker. Higher rarity = harder
  // to find (warm), a discount = easier (green). Drives every find chip on the page.
  function Masthead(props) {
    var loc = props.location;
    var mod = loc ? loc.mod : 0;
    return h('button', {
      onClick: props.onOpen,
      'aria-label': loc ? ('Market location: ' + loc.name + ', ' + loc.circumstance.label + '. Tap to change.') : 'Set the market location',
      style: {
        display: 'flex', alignItems: 'stretch', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '10px 12px', borderRadius: 10, marginBottom: 2,
        background: 'linear-gradient(180deg, rgba(245,200,66,0.06), rgba(255,255,255,0.015))',
        border: '1px solid rgba(245,200,66,0.22)',
      },
    },
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, letterSpacing: '0.05em', color: '#fff', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
          loc ? loc.name : 'SET A LOCATION'),
        h('div', { style: { marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
          loc ? (loc.circumstance.label.toUpperCase() + (loc.tradeLane ? (' · ' + (loc.routeName ? ('ON THE ' + loc.routeName.toUpperCase()) : 'PRIMARY TRADE LANE')) : '')) : 'TAP TO SET WHERE THIS MARKET IS'),
        loc ? h('div', { style: { marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.16em', color: 'rgba(245,200,66,0.55)' } }, 'TAP TO CHANGE') : null
      ),
      h('div', { style: { flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 52 } },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, lineHeight: 1, color: modColor(mod) } }, loc ? modText(mod) : '—'),
        h('div', { style: { marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)' } }, 'TO FIND')
      )
    );
  }

  // "WHERE IS THIS MARKET?" — search-first typeahead over the planet registry (auto-fills the RAW
  // world-circumstance + primary trade lane), with the manual Table 5-2 rows below as the GM override.
  function LocationPicker(props) {
    if (useBackToClose) useBackToClose(true, props.onClose);
    var SH = window.SWRPGShelves, RY = window.SWRPGRarity;
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _res = useState([]), results = _res[0], setResults = _res[1];
    var _ready = useState(false), ready = _ready[0], setReady = _ready[1];
    useEffect(function () {
      if (!SH) return undefined;
      var alive = true;
      SH.loadLocationData().then(function () { if (alive) setReady(true); });
      return function () { alive = false; };
    }, []);
    useEffect(function () {
      if (!SH || !ready || !q.trim()) { setResults([]); return; }
      setResults(SH.searchPlanets(q, 8));
    }, [q, ready]);
    var cur = props.current;
    var circumstances = RY ? [RY.NEUTRAL_CIRCUMSTANCE].concat(RY.LOCATION_MODIFIERS) : [];
    /* B-1125 — "WHERE IS THIS MARKET?" ON PAPER (frames G6–G9; ruling `gm-own-screens-concept` R-GOS-28 a). The SAME
       component, state and writers — `SellSheet`'s pattern — with the board's markup: the read's sheet on the phone and
       its held card at the desk (`.st-read` / `[data-desk]`, absolute to `.st` with `.st-scrim` under it), so the
       catalog it changes stays in view behind it. Every row is the dark picker's own: the typeahead's eight results
       (name · REGION · CIRCUMSTANCE · TRADE LANE · the modifier), the current world's lane toggle (only with a current
       world), the Table 5-2 rows from rarity.js, the cite. Difficulty is a SIGN, never a hue. The one paper-only
       difference: a circumstance picked DIRECTLY marks its row (`kind`, B-1125's) — the dark rule `!cur.name` can
       never hold, since a direct pick is named by its label. */
    if (props.paper) {
      var prow = function (key, on, onClick, nm, small, mod, extra) {
        return h('button', Object.assign({ key: key, type: 'button', className: 'gm-prow', 'data-on': on ? '1' : '0', onClick: onClick }, extra || {}),
          h('span', { className: 'gm-pnm' }, nm, small ? h('small', null, small) : null),
          h('b', { className: 'gm-pmod' }, mod));
      };
      return [
        h('div', { key: 'scrim', className: 'st-scrim', onClick: props.onClose, 'aria-label': 'Close location picker' }),
        h('div', {
          key: 'pick', className: 'st-read gm-pick', role: 'dialog', 'aria-label': 'Where is this market?',
          'data-desk': props.desk ? '1' : null, 'data-store-zone': 'picker',
        },
          h('div', { className: 'gm-pickhd' },
            h('h2', { className: 'st-readnm' }, 'WHERE IS THIS MARKET?'),
            h('button', { type: 'button', className: 'hp-buy-btn st-close', 'aria-label': 'Close', onClick: props.onClose }, '×')),
          h('label', { className: 'st-search gm-psearch' },
            h('input', {
              type: 'text', value: q, onChange: function (e) { setQ(e.target.value); },
              placeholder: ready ? 'Search a planet — e.g. Nar Shaddaa…' : 'Loading the galaxy…',
              'aria-label': 'Search for a planet',
            })),
          results.length ? h('div', { className: 'gm-plist', 'data-picker-results': results.length },
            results.map(function (p) {
              return prow(p.name, !!(cur && cur.kind !== 'circumstance' && cur.name === p.name), function () { props.onPick(p); },
                p.name, (p.region || 'Unknown region').toUpperCase() + ' · ' + p.circumstance.label.toUpperCase() + (p.tradeLane ? ' · TRADE LANE' : ''),
                modText(p.mod));
            })) : null,
          cur ? h('button', {
            type: 'button', className: 'gm-prow gm-lane', 'aria-pressed': cur.tradeLane ? 'true' : 'false', onClick: props.onToggleLane,
          },
            h('span', { className: 'gm-box', 'aria-hidden': true }, cur.tradeLane ? '☑' : '☐'),
            h('span', { className: 'gm-pnm' }, 'On a primary trade lane'),
            h('b', { className: 'gm-pmod' }, '−1')) : null,
          h('h4', { className: 'gm-pk' }, 'OR SET THE CIRCUMSTANCE DIRECTLY'),
          h('div', { className: 'gm-plist', 'data-picker-table': circumstances.length },
            circumstances.map(function (c) {
              return prow(c.id, !!(cur && cur.kind === 'circumstance' && cur.circumstance && cur.circumstance.id === c.id),
                function () { props.onPickCircumstance(c); }, c.label, null, modText(c.mod));
            })),
          h('p', { className: 'gm-pcite' }, 'EotE CRB p.150 · TABLE 5-2 · PRIMARY TRADE LANE −1')),
      ];
    }
    var rowStyle = function (active) {
      return {
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, textAlign: 'left',
        padding: '8px 12px', cursor: 'pointer', borderRadius: 8,
        background: active ? 'rgba(245,200,66,0.12)' : 'rgba(255,255,255,0.025)',
        border: '1px solid ' + (active ? 'rgba(245,200,66,0.5)' : 'rgba(255,255,255,0.08)'),
      };
    };
    return h('div', { style: { position: 'absolute', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' } },
      h('div', { onClick: props.onClose, 'aria-label': 'Close location picker', style: { position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.66)', backdropFilter: 'blur(1.5px)' } }),
      h('div', {
        role: 'dialog', 'aria-label': 'Where is this market?',
        style: {
          position: 'relative', maxHeight: '88%', overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(14,18,28,0.99), rgba(8,10,16,0.99))',
          borderTop: '2px solid rgba(245,200,66,0.5)', borderRadius: '14px 14px 0 0',
          padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
          animation: 'slideUpBounce 0.32s cubic-bezier(0.32,1.2,0.5,1) forwards',
          display: 'flex', flexDirection: 'column', gap: 12,
        },
      },
        h('button', { onClick: props.onClose, 'aria-label': 'Close', style: { position: 'absolute', top: 8, right: 10, minWidth: 44, minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 18 } }, '×'),
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, letterSpacing: '0.06em', color: '#fff' } }, 'WHERE IS THIS MARKET?'),
        // typeahead
        h('input', {
          value: q, onChange: function (e) { setQ(e.target.value); },
          placeholder: ready ? 'Search a planet — e.g. Nar Shaddaa…' : 'Loading the galaxy…',
          'aria-label': 'Search for a planet',
          style: { width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,200,66,0.28)', borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 14, color: '#fff', outline: 'none' },
        }),
        results.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          results.map(function (p) {
            return h('button', {
              key: p.name, onClick: function () { props.onPick(p); },
              style: rowStyle(cur && cur.name === p.name),
            },
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5, color: '#fff' } }, p.name),
                h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' } },
                  (p.region || 'Unknown region').toUpperCase() + ' · ' + p.circumstance.label.toUpperCase() + (p.tradeLane ? ' · TRADE LANE' : ''))),
              h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, color: modColor(p.mod) } }, modText(p.mod))
            );
          })
        ) : null,
        // trade-lane override (acts on the current location)
        cur ? h('button', {
          onClick: props.onToggleLane, 'aria-pressed': !!cur.tradeLane,
          style: {
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, cursor: 'pointer',
            padding: '8px 12px', borderRadius: 8,
            background: cur.tradeLane ? 'rgba(155,232,178,0.12)' : 'rgba(255,255,255,0.025)',
            border: '1px solid ' + (cur.tradeLane ? 'rgba(155,232,178,0.5)' : 'rgba(255,255,255,0.08)'),
          },
        },
          h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 13, color: cur.tradeLane ? '#9BE8B2' : 'rgba(255,255,255,0.4)' } }, cur.tradeLane ? '☑' : '☐'),
          h('span', { style: { flex: 1, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgba(255,255,255,0.75)' } }, 'On a primary trade lane'),
          h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, color: '#9BE8B2' } }, '−1')
        ) : null,
        // manual Table 5-2 rows
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginTop: 2 } }, 'OR SET THE CIRCUMSTANCE DIRECTLY'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          circumstances.map(function (c) {
            return h('button', {
              key: c.id, onClick: function () { props.onPickCircumstance(c); },
              style: rowStyle(cur && !cur.name && cur.circumstance && cur.circumstance.id === c.id),
            },
              h('span', { style: { flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(255,255,255,0.85)' } }, c.label),
              h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14, color: modColor(c.mod) } }, modText(c.mod))
            );
          })
        ),
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 4 } },
          'EotE CRB p.150 · TABLE 5-2 · PRIMARY TRADE LANE −1')
    ));
  }

  // THE SHELVES — the GM's named saved stock lists (the bar's 4th tab body). One active shelf; each
  // item shows its find-difficulty AT THIS LOCATION + price. Read at the table; nothing reaches players.
  function ShelfView(props) {
    var st = props.shelfState;
    var active = st.shelves.find(function (s) { return s.id === st.activeId; }) || null;
    var accent = '#F5C842';
    var shelfChip = function (s) {
      var on = active && s.id === active.id;
      return h('button', {
        key: s.id, onClick: function () { props.onSwitch(s.id); },
        style: {
          flexShrink: 0, minHeight: 34, padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
          background: on ? 'rgba(245,200,66,0.16)' : 'rgba(255,255,255,0.03)',
          border: '1px solid ' + (on ? 'rgba(245,200,66,0.5)' : 'rgba(255,255,255,0.1)'),
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap',
          color: on ? accent : 'rgba(255,255,255,0.55)',
        },
      }, s.name + ' · ' + s.items.length);
    };
    // R-SPC-3: `swrpg_store_shelves_v1` is NOT re-keyed (the ruling names holds and counter lines;
    // a GM shelf is the GM programme's contract), so a shelf entry is a BARE id and is qualified
    // on the way into the catalog by the same old-order scan.
    var items = active ? active.items.map(function (id) {
      return props.byId[id] || props.byId[props.qualify ? props.qualify(id) : id];
    }).filter(Boolean) : [];
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      // shelf switcher + new
      h('div', { style: { display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 } },
        st.shelves.map(shelfChip),
        h('button', {
          onClick: props.onCreate,
          style: { flexShrink: 0, minHeight: 34, padding: '6px 12px', borderRadius: 16, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(245,200,66,0.4)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: '#F5DFA8' },
        }, '+ NEW SHELF')
      ),
      active ? h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10 } },
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17, letterSpacing: '0.05em', color: '#fff' } }, active.name),
        h('button', { onClick: function () { props.onRename(active.id); }, style: { background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' } }, 'RENAME'),
        h('button', { onClick: function () { props.onDelete(active.id); }, style: { background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.12em', color: 'rgba(255,120,120,0.6)' } }, 'DELETE')
      ) : null,
      !active ? h('div', { style: { padding: '36px 20px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' } },
        'No shelves yet. A shelf is a named stock list — what a market carries. Make one, then add items from the grid with “+ SHELF”.') : null,
      active && items.length === 0 ? h('div', { style: { padding: '28px 20px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(255,255,255,0.45)' } },
        'This shelf is empty. Browse the categories and tap “+ SHELF” on any item.') : null,
      active && items.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        items.map(function (it) {
          return h('div', {
            key: it.key,
            style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' },
          },
            h('button', {
              onClick: function () { props.onOpenItem(it.key); }, 'aria-label': it.name,
              style: { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
            },
              h('div', { style: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, it.name || 'Unnamed'),
              h('div', { style: { marginTop: 3 } }, h(FindLine, { item: it, rarity: effRarity(it.rarity, props.locationMod), compact: true }))
            ),
            h('span', { style: { flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(245,200,66,0.85)' } }, fmtCr(it.price)),
            h('button', {
              onClick: function () { props.onRemoveItem(it.regId || bareId(it.key)); }, 'aria-label': 'Remove ' + (it.name || 'item') + ' from the shelf',
              style: { flexShrink: 0, minWidth: 34, minHeight: 34, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,120,120,0.6)', fontSize: 15 },
            }, '×')
          );
        })
      ) : null,
      // the honest prep footer
      h('div', { style: { marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', textAlign: 'center' } },
        'PREP SURFACE · NOTHING HERE IS SENT TO PLAYERS')
    );
  }

  /* ══════════════════════════════════════════════════════
     STORE ROOT
  ══════════════════════════════════════════════════════ */
  // Sub-category chips per bar tab (weapons/gear reuse the shared GEAR_CATEGORIES vocab).
  function subCatsFor(tab) {
    var cats = (window.SWItems && window.SWItems.GEAR_CATEGORIES) || [];
    if (tab === 'weapons') return cats.filter(function (c) { return c.section === 'weapons'; });
    if (tab === 'gear') return cats.filter(function (c) { return c.section === 'gear'; });
    return [];
  }

  /* ══════════════════════════════════════════════════════
     B-666 · THE PAPER SHELF — the board's catalog vocabulary
     (`store_build.py`: `cat_counts` · `NARROW_SETS` · `narrow_block` · `row_wide` · `row_hh` · `pips`)
  ══════════════════════════════════════════════════════ */
  // THE BOARD'S RULE, NOT THE BOARD'S NUMBERS. `cat_counts` tallies the registry's own `type` field —
  // "the first draft of this board hard-coded plausible-looking numbers; they were invented, and
  // invented numbers are a defect in a board". Every count below is tallied at render.
  //
  // THE BOARD DREW ONE SHELF (weapons) and named SIX categories over `type`: Energy weapons · Melee ·
  // Explosives/Other · Slugthrowers · Lightsabers · Brawling. The shipped `GEAR_CATEGORIES` groups the
  // same 397 into FOUR — Blasters(Energy Weapon) · Melee(Melee+Brawling+Lightsaber+Lightwhip) ·
  // Explosives(Explosives/Other+Thrown) · Slugs(Slugthrower). The board is LAW on the shelf it drew,
  // so the WEAPONS rail is the board's six; armor and gear — which the board never drew — keep the
  // shipped vocabulary. Both mappings, with their numbers, are in the gate.
  var BOARD_WEAPON_CATS = [
    { id: 'energy',       label: 'Energy weapons',   matchType: ['Energy Weapon'] },
    { id: 'melee',        label: 'Melee',            matchType: ['Melee'] },
    { id: 'explosives',   label: 'Explosives/Other', matchType: ['Explosives/Other'] },
    { id: 'slugthrowers', label: 'Slugthrowers',     matchType: ['Slugthrower'] },
    { id: 'lightsabers',  label: 'Lightsabers',      matchType: ['Lightsaber'] },
    { id: 'brawling',     label: 'Brawling',         matchType: ['Brawling'] },
  ];
  function paperCatsFor(tab) {
    return tab === 'weapons' ? BOARD_WEAPON_CATS : subCatsFor(tab);
  }

  // THE FOUR NARROWING SETS — the board's titles and options VERBATIM (`NARROW_SETS`), each carrying
  // the predicate that makes it filter. The board drew SKILL's first option MARKED ON over a shelf of
  // unfiltered rows (a fixture's selected state, not a filter); a build cannot open a 397-row shelf
  // pre-narrowed to one skill while its runhead counts all 397, so every set opens OFF. SKILL and
  // RANGE are weapon facts, so they stand on the weapons shelf only.
  var NARROW_SETS = [
    { id: 'skill', title: 'SKILL', sections: ['weapons'],
      options: ['Ranged (Heavy)', 'Ranged (Light)', 'Melee', 'Gunnery', 'Brawl'],
      test: function (it, o) { return it.skill === o; } },
    { id: 'range', title: 'RANGE', sections: ['weapons'],
      options: ['Engaged', 'Short', 'Medium', 'Long', 'Extreme'],
      test: function (it, o) { return it.range === o; } },
    { id: 'enc', title: 'ENCUMBRANCE', sections: ['weapons', 'armor', 'gear'],
      options: ['0–2', '3–5', '6+'],
      test: function (it, o) {
        var n = Number(it.encumbrance);
        if (it.encumbrance == null || isNaN(n)) return false;
        return o === '0–2' ? (n <= 2) : o === '3–5' ? (n >= 3 && n <= 5) : (n >= 6);
      } },
    { id: 'price', title: 'PRICE', sections: ['weapons', 'armor', 'gear'],
      options: ['Under 500', '500–2k', '2k+'],
      test: function (it, o) {
        var n = Number(it.price);
        if (it.price == null || isNaN(n)) return false;
        return o === 'Under 500' ? (n < 500) : o === '500–2k' ? (n >= 500 && n <= 2000) : (n > 2000);
      } },
  ];
  function narrowSetsFor(section) {
    return NARROW_SETS.filter(function (x) { return x.sections.indexOf(section) >= 0; });
  }
  function passesSets(it, sets, section) {
    var list = narrowSetsFor(section);
    for (var i = 0; i < list.length; i++) {
      var on = sets[list[i].id];
      if (on && !list[i].test(it, on)) return false;
    }
    return true;
  }

  /* ── B-670 · THE SEARCH PREDICATE: NAME · SKILL · QUALITY (R-SPC-3) ─────────────────────────────
     The board's `search_hits`, and it is ONE predicate for the whole store — the paper shelf, the dark
     shelf, and the holds list on both faces. A second predicate is the second-kernel defect the
     single-door law exists to prevent, and a search that answers differently depending on a preview
     switch is that defect at its most confusing. So the widening lands on the DARK face too, which is
     a deliberate product change on a face this lap otherwise leaves alone (R-SPC-3: "the kernel's
     name-only search — widened"; ruling §6).

     THE THREE TESTS, over the fields the store item ALREADY carries (`canonicalToStore`):
       NAME     — `it.name`
       SKILL    — `it.skill`, which is the registry's skill id already resolved through the app's own
                  `SKILL_REF_TO_NAME` ("ranged_light" → "Ranged (Light)") — the SAME string the row
                  prints in its Skill column and the read prints on its find line, so a row that
                  matched can always be seen to have matched. Armour and gear records carry no skill,
                  so this test is inert on those two shelves — a fact of the registries, not a rule.
       QUALITY  — the NAME of a quality, which is what the board matches. The store shape's
                  `qualities` are DISPLAY strings with the rank appended ("Stun 3"), so the rank is
                  stripped off the end to recover the name. Audited against all three registries at
                  this commit: 31 distinct quality names, NONE ending in a digit, and armour and gear
                  hold no qualities at all — so the strip cannot eat a name and the test is inert on
                  those two shelves for the same registry reason.

     THE COUNTING RULE IS THE BOARD'S, and it is FIRST-MATCH-WINS in that order: an item whose name
     and whose skill both carry the query counts once, BY NAME. (The Basic Lightsaber is the case —
     name "…Lightsaber", skill "Lightsaber".) The reason is the board's own: the reason travels with
     the row, so the three counts in the foot SUM to the tally and a reader can check the caption
     rather than believe it. `why` is the string the row prints: NAME · SKILL · QUALITY · <name>. */
  function qualityNameOf(s) { return String(s || '').replace(/\s+\d+$/, ''); }
  function searchWhy(it, q) {
    if (!q || !it) return null;
    if (String(it.name || '').toLowerCase().indexOf(q) >= 0) return 'NAME';
    if (String(it.skill || '').toLowerCase().indexOf(q) >= 0) return 'SKILL';
    var quals = it.qualities || [];
    for (var i = 0; i < quals.length; i++) {
      var nm = qualityNameOf(quals[i]);
      if (nm && nm.toLowerCase().indexOf(q) >= 0) return 'QUALITY · ' + nm;
    }
    return null;
  }
  function matchesQuery(it, q) { return !q ? true : !!searchWhy(it, q); }
  // The populations behind the count (`search_split`), so the foot's caption can be CHECKED. Keyed on
  // the `why` prefix exactly as the board keys it.
  function searchSplit(list, q) {
    var out = { NAME: 0, SKILL: 0, QUALITY: 0 };
    list.forEach(function (it) {
      var why = searchWhy(it, q);
      if (why) out[why.split(' ')[0]] += 1;
    });
    return out;
  }

  // The board's `pips`: a difficulty is a COUNT OF MARKS and a printed WORD, never a hue (R-SPC-4 —
  // the kernel's six rarity colours are tuned for a black ground and mean nothing on paper).
  function pipsOf(n) { return n ? new Array(n + 1).join('◆') : '—'; }

  // The row's spec columns, per section, off the kernel's OWN spec vocabulary (`specRows`): the board
  // drew the weapons row's nine columns, and those are exactly the weapons line below. Armor and gear
  // carry the columns their records HAVE — an em-dash column is a column that says nothing, which is
  // the defect the board's own HP note records.
  function paperCols(section) {
    if (section === 'weapons') {
      // the board's `row_hh` order: the four labelled specs, then the SKILL, then the range.
      return { pairs: [['DMG', 'damage'], ['CRIT', 'crit'], ['ENC', 'encumbrance'], ['HP', 'hp']],
               words: [['Skill', 'skill'], ['Range', 'range']] };
    }
    if (section === 'armor') {
      return { pairs: [['SOAK', 'soak'], ['DEFENSE', 'defense'], ['ENC', 'encumbrance'], ['HP', 'hp']],
               words: [] };
    }
    return { pairs: [['ENC', 'encumbrance'], ['HP', 'hp']], words: [['Type', 'type']] };
  }
  // The DESK table's ordered columns. The weapons line is the board's nine, in the board's order and
  // with the board's own header words ("Dmg · Crit · Range · Skill · Enc · HP · Price · To find").
  function paperDeskCols(section) {
    if (section === 'weapons') {
      return [['Dmg', 'damage', 'num'], ['Crit', 'crit', 'num'], ['Range', 'range', 'mono'],
              ['Skill', 'skill', 'mono'], ['Enc', 'encumbrance', 'num'], ['HP', 'hp', 'num']];
    }
    if (section === 'armor') {
      return [['Soak', 'soak', 'num'], ['Defense', 'defense', 'num'],
              ['Enc', 'encumbrance', 'num'], ['HP', 'hp', 'num']];
    }
    return [['Type', 'type', 'mono'], ['Enc', 'encumbrance', 'num'], ['HP', 'hp', 'num']];
  }
  function cellText(v) { return (v === null || v === undefined || v === '') ? '—' : String(v); }

  function Store(props) {
    var face = props.face || 'player';
    var isGm = face === 'gm';
    var accent = props.accent || (isGm ? '#F5C842' : '#4EAAFF');
    var tab = props.tab || 'weapons';
    var layoutMode = useLayoutMode();  // F-46 D2
    var isDesk = layoutMode === 'desktop';
    // B-665 — the paper face's band (mobile <1024 · mid 1024–1366 · wide ≥1367). Called
    // UNCONDITIONALLY, above the `props.paper` fork, because a hook inside a branch is a hook that
    // changes order the moment the switch flips.
    var band = useStoreBand();
    // The summoned rail (Jason 2026-09-01: "we can have the rail on handheld by using a contextual
    // button to bring it out"). Mobile only; the desk's rail stands.
    var _rail = useState(false), railOpen = _rail[0], setRailOpen = _rail[1];
    // Desktop: cap the store's header + body to a wide-but-bounded reading region, centered, so the
    // catalog doesn't sprawl edge-to-edge on a monitor (the store bg still fills the shell).
    var deskCap = isDesk ? { maxWidth: 'var(--desk-content-max)', width: '100%', margin: '0 auto', boxSizing: 'border-box' } : null;
    var _cat = useState(null), catalog = _cat[0], setCatalog = _cat[1];
    var _cart = useState(session.cart), cart = _cart[0], setCartState = _cart[1];
    // G-7 — the HOST's plan over the slip's vessel lines (the `vessel` seam, R-S4WC-1 A2/A4), read at render for the
    // total and the tag. No seam → null: every vessel line is kept, said and charged nothing.
    var vplan = vesselPlanOf(props.vessel, cart);
    var _holds = useState(loadHolds), holds = _holds[0], setHoldsState = _holds[1];
    var _q = useState(''), search = _q[0], setSearch = _q[1];
    var _sub = useState('all'), subCat = _sub[0], setSubCat = _sub[1];
    // B-666 — the rail's attribute narrowing: one chosen option per set, absent = the set is off.
    // Declared with the others, above the `props.paper` fork (the dark face has no such control, but
    // a hook inside a branch is a hook whose order changes the moment the switch flips).
    var _sets = useState({}), sets = _sets[0], setSets = _sets[1];
    var _open = useState(null), openId = _open[0], setOpenId = _open[1];
    var _pick = useState(null), pickReason = _pick[0], setPickReason = _pick[1];  // null | {onDone}
    var pendingFinalizeRef = useRef(null);
    // GM face: the location (masthead) + the shelves. Player face never touches these.
    // B-1125 (R-GOS-30, D-76 "Yes, remember") — THE MARKET IS REMEMBERED: the initialiser reads
    // `swrpg_store_market_v1` ONCE at mount (GM only; an unknown circumstance or a `v` ≠ 1 reads UNSET). The state sits
    // ABOVE the paper fork, so both faces remember — one kernel, one memory; a fresh context paints the door as before.
    var _loc = useState(function () {
      return (isGm && window.SWRPGShelves && window.SWRPGShelves.loadMarket) ? window.SWRPGShelves.loadMarket() : null;
    }), location = _loc[0], setLocation = _loc[1];
    var _locOpen = useState(false), locOpen = _locOpen[0], setLocOpen = _locOpen[1];
    var _shelf = useState(function () {
      return (isGm && window.SWRPGShelves) ? window.SWRPGShelves.loadState() : { shelves: [], activeId: null };
    }), shelfState = _shelf[0], setShelfState = _shelf[1];
    var locationMod = (isGm && location) ? location.mod : 0;
    // B-1126 (R-GOS-31) — the paper face's two drawn controls: the NAME LINE ({ mode: 'new' } | { mode: 'rename', id }
    // with its draft) and the DELETE LINE (the shelf's id). One line open at a time. Declared above the fork with the
    // others; the dark face never sets them (it keeps window.prompt and delete-at-once).
    var _naming = useState(null), naming = _naming[0], setNaming = _naming[1];
    var _draft = useState(''), nameDraft = _draft[0], setNameDraft = _draft[1];
    var _del = useState(null), deletingId = _del[0], setDeletingId = _del[1];

    // B-342: the ONE shared ready-gate. `lib/shared/ui.jsx`'s `useActiveSources` already owned
    // this — it subscribes to the vocab load AND the swrpg-sources-changed broadcast, and returns
    // the resolved {ready, index, off} rather than a bare counter. This surface carried a private
    // re-implementation of the subscription half; a fifth copy anywhere is the defect by name
    // (R-RGC-2). vendor.js ships SWRPGUI before any per-app module, so the hook is present.
    // BOOKS-1b: re-render when the vocab loads / the ACTIVE SOURCES set changes, so the catalog
    // re-filters live. Only the SETTER was ever bound here — the counter's value was unused — so
    // the hook's return is deliberately ignored; the re-render is the whole point.
    (window.SWRPGUI || {}).useActiveSources();

    useEffect(function () {
      var alive = true;
      loadRegistries().then(function (regs) {
        if (!alive || !regs) return;
        if (!catalogCache) catalogCache = buildCatalog(regs);
        setCatalog(catalogCache);
      });
      loadArtManifest();
      if (isGm && window.SWRPGShelves) {
        // B-1125 — the remembered world's route is RE-READ from the routes registry by name once it is in hand (the
        // record never stores it): the lanes load async, so the initialiser could not see them.
        var SH = window.SWRPGShelves;
        Promise.resolve(SH.loadLocationData()).then(function () {
          if (!alive) return;
          setLocation(function (cur) {
            if (!cur || cur.kind !== 'world' || cur.routeName) return cur;
            var r = SH.resolvePlanet({ name: cur.name, region: cur.region, sector: cur.sector });
            return r && r.routeName ? Object.assign({}, cur, { routeName: r.routeName }) : cur;
          });
        });
      }
      return function () { alive = false; };
    }, []);

    // R-SPC-3 — THE ONE-TIME MIGRATION, and it runs ONCE, when the catalog is first in hand. A hold
    // or a counter line written before this row carries a BARE id; it is resolved by the old section
    // order and REWRITTEN qualified. An id that resolves to no shelf is KEPT AS WRITTEN and said out
    // loud — a retired or off-book id is not a reason to lose a player's hold (Law 1: holds are never
    // filtered). Legacy shelves (`swrpg_store_shelves_v1`) are NOT rewritten: that key is the GM
    // programme's contract and the ruling names only holds and counter lines; ShelfView qualifies on
    // the way in instead.
    useEffect(function () {
      if (!catalog) return;
      var isBare = function (x) { return x != null && String(x).indexOf(':') < 0; };
      // THE TEST IS "DID ANYTHING CHANGE", NOT "IS ANYTHING BARE". An id that matches no shelf stays
      // bare forever by design, and testing for bareness would make this write and warn on EVERY
      // mount — the write loop the comment above promises it is not.
      var nextHolds = holds.map(function (x) { return qualifyKey(x, catalog.byId); });
      if (nextHolds.some(function (x, i) { return x !== holds[i]; })) {
        var lost = nextHolds.filter(isBare);
        if (lost.length) {
          console.warn('[store] R-SPC-3: ' + lost.length + ' legacy hold id(s) match no shelf and are '
            + 'kept as written — ' + lost.join(', '));
        }
        setHolds(nextHolds);
      }
      // B-669 — AND THE SAME PASS IS WHERE "THE LIST PRICE IS RE-READ FROM THE REGISTRY" HAPPENS
      // (R-SPC-3). A persisted line carries `price` only when the table's price was written by hand;
      // every other line arrives with `priceEach: 0` and gets the CATALOG'S price here, the moment the
      // catalog is in hand. So a list price that moved in the registry moves on the slip, and nothing
      // freezes yesterday's number into the record. `section` is filled from the resolved record for
      // the same reason — `buildNextEquipment` reads it, and a guessed section writes a weapon into
      // the gear list.
      var cartChanged = false;
      var nextCart = cart.map(function (l) {
        if (!l) return l;
        var out = l;
        if (isBare(l.itemId)) {
          var q = qualifyKey(l.itemId, catalog.byId);
          // unresolvable — the key is left exactly as it was; the line is still hydrated below if a
          // record somehow exists under the bare key, and drawn with its own sentence if not.
          if (q !== l.itemId) { out = Object.assign({}, out, { itemId: q }); cartChanged = true; }
        }
        var it = catalog.byId[out.itemId];
        if (it) {
          if (out.section !== it.section) {
            out = Object.assign({}, out, { section: it.section }); cartChanged = true;
          }
          if (!out.edited && Number(out.priceEach) !== (Number(it.price) || 0)) {
            out = Object.assign({}, out, { priceEach: Number(it.price) || 0 }); cartChanged = true;
          }
        }
        return out;
      });
      if (cartChanged) setCart(nextCart);
    }, [catalog]);

    /* ── B-669 · THE `shopFor` HINT (R-SPC-3) ──────────────────────────────────────────────────────
       The record carries WHO THE SLIP IS FOR, and it is a HINT, RE-VALIDATED AT LOAD: an id whose
       roster record is gone degrades to JUST BROWSING and the hint is cleared, never an error thrown
       and never a dangling context. The host owns the state (`shopForId` in `player/app.jsx`, seeded
       from `swrpg_last_sheet_id`), so restoring means asking the host to context itself —
       `props.onPickCharacter`, the writer the roster picker already uses.

       ONLY A DOOR THAT CAN ASK WHO THIS IS FOR WRITES THE HINT. `props.onPickCharacter` is exactly
       that test: the player's two doors have it, the creator's gear step does not (its character is
       the draft in the wizard, not a roster record) and the GM's door has no slip at all. A door that
       cannot re-context must not overwrite the answer another door gave.

       THE ROSTER IS SYNCHRONOUS — `savedChars` is `useState(loadSavedCharacters)` in the host, read
       from localStorage at mount — so the validation below is deciding on the real list and not on an
       empty one that has not arrived yet. */
    var hintDoneRef = useRef(false);
    useEffect(function () {
      if (isGm || !props.onPickCharacter) return;
      if (!hintDoneRef.current) {
        hintDoneRef.current = true;
        var hint = session.shopFor;
        if (hint && !(props.shopFor && props.shopFor.id)) {
          var alive = (props.roster || []).some(function (r) { return r && r.id === hint; });
          if (alive) { props.onPickCharacter(hint); return; }   // the host re-contexts; the write below follows it
          session.shopFor = null;                               // deleted → just browsing
          saveCounter(session.cart, null);
          return;
        }
      }
      var id = (props.shopFor && props.shopFor.id) || null;
      if (id === session.shopFor) return;
      session.shopFor = id;
      saveCounter(session.cart, id);
    }, [props.shopFor, props.roster]);

    // counts up to the host bar — GM: the active shelf's size (SHELVES badge); player: cart + holds.
    useEffect(function () {
      if (!props.onCounts) return;
      if (isGm) {
        var s = shelfState.shelves.find(function (x) { return x.id === shelfState.activeId; });
        props.onCounts({ shelves: s ? s.items.length : 0, shelfCount: shelfState.shelves.length });
      } else {
        props.onCounts({
          cart: cart.reduce(function (s, l) { return s + (Number(l.qty) || 1); }, 0),
          holds: holds.length,
        });
      }
    }, [cart, holds, shelfState]);

    // tab switches reset the in-tab chrome
    useEffect(function () { setSubCat('all'); setSearch(''); setOpenId(null); setRailOpen(false); setSets({}); setNaming(null); setDeletingId(null); }, [tab]);

    // B-669 — ONE WRITER, and the durable record is written THROUGH IT. Every path that changes the
    // slip (add · edit the price · qty · remove · finalize's clear · the migration pass above) already
    // went through `setCart`, so persistence costs exactly this line and there is no second door onto
    // the key. `session.shopFor` rides along so a lines-write cannot drop the hint.
    function setCart(next) { commitCounter(next); setCartState(next); }
    // R-S4WC-16 — a line put on the counter from outside the store (the Yard's door, `addToCounter`) is the one this
    // mounted store draws: it hands its setter to the writer for as long as it is mounted.
    useEffect(function () {
      _counterSeen = setCartState;
      return function () { if (_counterSeen === setCartState) _counterSeen = null; };
    }, []);
    function setHolds(next) { saveHolds(next); setHoldsState(next); }

    function cartQtyOf(id) {
      var line = cart.find(function (l) { return l.itemId === id; });
      return line ? (Number(line.qty) || 1) : 0;
    }
    // B-686 · R-SPC-8 — THE ENTRY GUARD IS GONE. It refused a second unit of a suit already on the
    // slip and swept any other armour line off when a new suit arrived; both existed to protect a
    // single-slot write that no longer exists (`buildNextEquipment` above). An armour line enters,
    // counts and stacks exactly as a gear line does. The three layers retire as a SET: removing this
    // guard without the append would double-charge and overwrite.
    // B-692 · R-SPC-9 does NOT bring the guard back. The write fills an empty worn slot with the
    // FIRST suit on the slip and packs the rest, so a second suit is a legitimate purchase (one on,
    // one spare) and a slip carrying two suits has two homes waiting for them.
    // R-S4WC-16 — ADD TO COUNTER runs THE counter's one path (`withLine`: normalize → qualify → persist), the same the
    // exported `addToCounter` runs: a line already on the slip is bumped, a new one arrives `edited: false` — it carries
    // the LIST price and no `price` key in the record (R-SPC-3). The number is only the value the tag opens with; the
    // record's authority is the registry until a hand is on it.
    function addToCart(it) {
      setCart(withLine(session.cart, { id: it.key, section: it.section, price: it.price }));
    }
    function editPrice(id, raw) {
      var v = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
      setCart(cart.map(function (l) {
        if (lineKeyOf(l) !== id) return l;
        // "EDITED" IS THE BOARD'S OWN TEST, not "was this field touched": `slip_rows` marks a line
        // edited when `paid != price`, so typing the list price back clears the maroon tag AND the
        // stored `price` key. A line whose record the catalog cannot resolve has no list to compare
        // against, so anything typed on it is an edit — otherwise the one number a player can give
        // that line would be the one number the record refuses to keep.
        var it = (catalog && catalog.byId) ? catalog.byId[l.itemId] : null;
        // A vessel line's list price is the host's plan (A2); with no plan there is no list to compare against.
        if (VESSEL_SECTIONS[l.section]) {
          var lp = vplan && vplan.price ? vplan.price[lineKeyOf(l)] : null;
          return Object.assign({}, l, { priceEach: v, edited: !(typeof lp === 'number') || v !== lp });
        }
        return Object.assign({}, l, { priceEach: v, edited: !it || v !== (Number(it.price) || 0) });
      }));
    }
    function bumpQty(id, d) {
      setCart(cart.map(function (l) {
        if (lineKeyOf(l) !== id) return l;
        if (VESSEL_SECTIONS[l.section] && l.section !== 'vpart') return l;   // A6: a mod or a weapon line is one
        return Object.assign({}, l, { qty: Math.max(1, (Number(l.qty) || 1) + d) });
      }));
    }
    function removeLine(id) { setCart(cart.filter(function (l) { return lineKeyOf(l) !== id; })); }
    // G-7 · K2 — FIT | HOLD on a ship line: where it goes when the deal is done (`for.then`). The line keeps its place, count
    // and tag. A line of the same part, ship and way already on the slip takes the count instead (one line per key); a mod
    // is only ever fitted, and two weapon lines never merge (A6: a weapon line is one).
    function setLineFor(id, then) {
      var line = cart.find(function (l) { return lineKeyOf(l) === id; });
      if (!line || !line.for || line.section === 'vmod' || line.for.then === then || (then !== 'fit' && then !== 'hold')) return;
      var next = Object.assign({}, line, { for: Object.assign({}, line.for, { then: then }) });
      var twin = cart.find(function (l) { return lineKeyOf(l) === lineKeyOf(next); });
      if (twin && line.section !== 'vpart') return;
      setCart(twin ? cart.filter(function (l) { return l !== line; }).map(function (l) {
        return l === twin ? Object.assign({}, l, { qty: (Number(l.qty) || 1) + (Number(line.qty) || 1) }) : l;
      }) : cart.map(function (l) { return l === line ? next : l; }));
    }
    function toggleHold(id) {
      setHolds(holds.indexOf(id) >= 0 ? holds.filter(function (x) { return x !== id; }) : holds.concat([id]));
    }

    // ── GM shelves ──
    function saveShelves(next) { if (window.SWRPGShelves) window.SWRPGShelves.saveState(next); setShelfState(next); }
    function activeShelf() { return shelfState.shelves.find(function (s) { return s.id === shelfState.activeId; }) || null; }
    function inActiveShelf(id) { var s = activeShelf(); return !!(s && s.items.indexOf(id) >= 0); }
    function newShelfId() { return 'shelf_' + (shelfState.shelves.length + 1) + '_' + shelfState.shelves.reduce(function (n, s) { return n + s.items.length; }, 0); }
    // B-1126 (R-GOS-31) — the writes are ONE path per act; only how the name is ASKED differs by face. The dark face
    // keeps `window.prompt` and delete-at-once (OFF unchanged); the paper face opens its drawn line in the prompt's own
    // words instead (there is no paper `window.prompt`). An empty or whitespace name commits nothing (today's rule).
    function commitNewShelf(raw) {
      var name = String(raw || '').trim();
      if (!name) return;
      var ns = { id: newShelfId(), name: name, items: [], note: '', createdAt: 0 };
      saveShelves({ shelves: shelfState.shelves.concat([ns]), activeId: ns.id });
    }
    function commitRename(id, raw) {
      var name = String(raw || '').trim();
      if (!name || !shelfState.shelves.some(function (x) { return x.id === id; })) return;
      saveShelves(Object.assign({}, shelfState, { shelves: shelfState.shelves.map(function (x) { return x.id === id ? Object.assign({}, x, { name: name }) : x; }) }));
    }
    function doDeleteShelf(id) {
      var next = shelfState.shelves.filter(function (x) { return x.id !== id; });
      saveShelves({ shelves: next, activeId: (shelfState.activeId === id) ? (next[0] ? next[0].id : null) : shelfState.activeId });
    }
    function createShelf() {
      if (props.paper) { setDeletingId(null); setNaming({ mode: 'new' }); setNameDraft('New shelf'); return; }
      commitNewShelf(window.prompt('Name this shelf', 'New shelf'));
    }
    function renameShelf(id) {
      var s = shelfState.shelves.find(function (x) { return x.id === id; });
      if (!s) return;
      if (props.paper) { setDeletingId(null); setNaming({ mode: 'rename', id: id }); setNameDraft(s.name); return; }
      commitRename(id, window.prompt('Rename this shelf', s.name));
    }
    function deleteShelf(id) {
      if (props.paper) { setNaming(null); setDeletingId(id); return; }
      doDeleteShelf(id);
    }
    function closeLines() { setNaming(null); setDeletingId(null); }
    function commitNameLine() {
      if (naming && naming.mode === 'new') commitNewShelf(nameDraft);
      else if (naming && naming.mode === 'rename') commitRename(naming.id, nameDraft);
      setNaming(null);
    }
    function switchShelf(id) { closeLines(); saveShelves(Object.assign({}, shelfState, { activeId: id })); }
    function toggleShelfItem(id) {
      var s = activeShelf();
      if (!s) {   // no active shelf → create one and drop the item on it
        var ns = { id: newShelfId(), name: 'New shelf', items: [id], note: '', createdAt: 0 };
        saveShelves({ shelves: shelfState.shelves.concat([ns]), activeId: ns.id });
        return;
      }
      var has = s.items.indexOf(id) >= 0;
      var items = has ? s.items.filter(function (x) { return x !== id; }) : s.items.concat([id]);
      saveShelves(Object.assign({}, shelfState, { shelves: shelfState.shelves.map(function (x) { return x.id === s.id ? Object.assign({}, x, { items: items }) : x; }) }));
    }

    // ── GM location (masthead + picker) ──
    // B-1125 (R-GOS-30) — EVERY write of the location saves the record (`setMarket`); there is no clear control (none
    // drawn, none today). `kind` says what was picked: a world from the registry, or a Table 5-2 row directly.
    function setMarket(next) {
      setLocation(next);
      if (isGm && window.SWRPGShelves && window.SWRPGShelves.saveMarket) window.SWRPGShelves.saveMarket(next);
    }
    function pickPlanet(p) { setMarket(Object.assign({ kind: 'world' }, p)); setLocOpen(false); }
    function pickCircumstance(c) {
      var RY = window.SWRPGRarity;
      setMarket({ kind: 'circumstance', name: c.label, region: null, sector: null, circumstance: c, tradeLane: false, routeName: null, mod: (RY && RY.locationModifier) ? RY.locationModifier(c, false) : c.mod });
      setLocOpen(false);
    }
    function toggleLane() {
      if (!location) return;
      var RY = window.SWRPGRarity;
      var next = !location.tradeLane;
      setMarket(Object.assign({}, location, { tradeLane: next, mod: (RY && RY.locationModifier) ? RY.locationModifier(location.circumstance, next) : location.mod }));
    }

    // finalize — the ONE sheet write, host-persisted
    function finalizeFor(charId, cartLines) {
      var rec = (props.roster || []).find(function (r) { return r.id === charId; });
      if (!rec) { console.error('[Store] finalizeFor: no roster record for "' + charId + '" — purchase dropped (B-203)'); return false; }
      if (!props.onFinalize) { console.error('[Store] finalizeFor: onFinalize not supplied — purchase dropped'); return false; }
      // B-687 — THE CATALOG GOES IN WITH THE SLIP: without it the write cannot tell a line that
      // matches no record from an ordinary one, and files the first kind under gear as a dangling
      // id-ref. `catalog` is non-null wherever a finalize can be reached (the store renders
      // 'OPENING THE STORE…' until it lands), so this is the catalog and never a fallback.
      // G-7 · A3 — EVERY VESSEL LINE'S DELIVERABILITY IS DECIDED BEFORE THE DEBIT: the host's plan is taken afresh at
      // the tap, the debit counts only what it can deliver, and those lines ride to the host in `vessel`, delivered in
      // the same act (the host's `onFinalize` answers `false` — nothing written, nothing charged — if it cannot).
      var plan = vesselPlanOf(props.vessel, cartLines || []);
      var built = buildNextEquipment(rec.sheetData && rec.sheetData.equipment, cartLines,
                                     catalog && catalog.byId, plan);
      var summary = { total: built.total, count: built.count };
      if (built.vessel.length) summary.vessel = built.vessel;
      // WB2 · the DONE note's ship half, from the write's own summary: which ships the charged lines went to, and how
      // (fit or hold), named by the plan the debit was judged by — never a recount of the slip
      built.vesselDone = built.vessel.map(function (r) {
        var pr = plan && plan.row ? plan.row[lineKeyOf(counterLineOf(r))] : null;
        return { ship: pr && pr.ship ? pr.ship : null, then: r.for ? r.for.then : null };
      });
      built.gearDone = (cartLines || []).some(function (l) {
        return !VESSEL_SECTIONS[l.section] && built.skipped.ids.indexOf(lineKeyOf(l)) === -1;
      });
      var ok = props.onFinalize(charId, built.next, summary);
      // B-692 · R-SPC-9 — the WRITE'S OWN SUMMARY rides back to the caller (`built`, truthy, in place
      // of the bare `true`): the DONE note's armour sentences are facts about what this write did with
      // the slip's suits, and the only thing that knows them is the write. Every caller tested this
      // for truthiness and still does; the host's `onFinalize` above is unchanged and still answers
      // `false` to veto.
      // B-687 — THE COUNTER KEEPS WHAT THE WRITE COULD NOT TAKE. `setCart([])` cleared the slip
      // whole, which was correct while every line was written; a line the write refused would have
      // been silently discarded by the very act that failed to buy it. Every WRITABLE line goes (the
      // deal is done), the refused ones stay exactly as they were, and the DONE note says how many —
      // keep-and-say, the law the ruling already gives this slip.
      if (ok !== false) {
        var refused = (built.skipped && built.skipped.ids) || [];
        setCart(refused.length
          ? (cartLines || []).filter(function (l) { return refused.indexOf(lineKeyOf(l)) >= 0; })
          : []);
        return built;
      }
      return false;
    }

    function moveToInventoryFor(charId, item) {
      var rec = (props.roster || []).find(function (r) { return r.id === charId; });
      if (!rec) return false;
      if (!props.onFinalize) return false;
      var eq = Object.assign({}, (rec.sheetData && rec.sheetData.equipment) || {});
      var acquireDate = new Date().toISOString().slice(0, 10);
      var stamp = [{ note: 'acquired — no cost', when: acquireDate }];
      var refId = item.regId || bareId(item.key);   // R-SPC-3: an id-ref on a sheet is BARE
      if (item.section === 'weapons') {
        eq.weapons = (eq.weapons || []).concat([{ id: refId, provenance: stamp }]);
      } else {
        // B-686 · R-SPC-8 — the SECOND site that set `equipment.armor`, and it went with the first:
        // "`equipment.armor` is not touched by the store". MOVE TO INVENTORY is the act R-ASS-1 names
        // ("the store writes spares as owned-not-worn"), so a suit moved without paying lands in the
        // pack like a suit bought at the counter — same entry, same stack rule, the worn suit alone.
        var gear = (eq.gear || []).slice().map(function (g) { return (g && typeof g === 'object') ? Object.assign({}, g) : g; });
        var hit = stackTargetOf(gear, refId);               // F-100 M8 R-M8G-14: never onto a marked copy
        if (hit) hit.qty = (Number(hit.qty) || 1) + 1;
        else gear.push({ id: refId, qty: 1, provenance: stamp });
        eq.gear = gear;
      }
      return props.onFinalize(charId, eq, { total: 0, count: 1 });
    }

    function moveToInventory(item) {
      if (!props.shopFor) {
        needCharacter(function (charId) { moveToInventoryFor(charId, item); });
        return;
      }
      moveToInventoryFor(props.shopFor.id, item);
    }

    function needCharacter(onDone) {
      pendingFinalizeRef.current = onDone || null;
      setPickReason({ title: onDone ? 'WHO IS THIS FOR?' : 'SHOPPING FOR' });
    }

    if (!catalog) {
      return h('div', {
        style: {
          position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)',
        },
      }, 'OPENING THE STORE…');
    }

    var byId = catalog.byId;
    var isCatalogTab = tab === 'weapons' || tab === 'armor' || tab === 'gear';
    // B-666 — the paper face's own category vocabulary (the board's six on the weapons shelf) and its
    // attribute narrowing. ONE filter chain serves both faces; `paperFace` selects which vocabulary.
    // B-1123 (R-GOS-28 a) — THE FENCE LIFTS: the GM's mount passes `paper` too (`gmPaper`, behind
    // `swrpg_gm_transplant`), and the GM door's frames G1–G5 draw the player's own rail, sets and read.
    var paperFace = !!props.paper;
    var catsVocab = isCatalogTab ? (paperFace ? paperCatsFor(tab) : subCatsFor(tab)) : [];
    var items = [];
    var itemsNarrowed = [];   // B-670 — the rows the CATEGORY and the SETS leave, before the query
    if (isCatalogTab) {
      items = catalog.bySection[tab] || [];
      // BOOKS-1b — ACTIVE SOURCES filter (discovery only; owned holds below are NOT filtered, Law 1).
      var _src = window.SWRPGSources && window.SWRPGSources.current();
      if (_src && _src.index) items = items.filter(function (it) { return window.SWRPGSources.isActiveWith(it, _src.index, _src.off); });
      if (subCat !== 'all') {
        var cat = catsVocab.find(function (c) { return c.id === subCat; });
        if (cat && cat.matchType) items = items.filter(function (it) { return cat.matchType.indexOf(it.type) !== -1; });
      }
      if (paperFace) items = items.filter(function (it) { return passesSets(it, sets, tab); });
      // B-670 — THE ROWS THE NARROWING LEAVES, kept as their own array BEFORE the query runs. The
      // foot's coverage line ("N of M in these categories") is counted over THESE (see the foot).
      itemsNarrowed = items;
      if (search.trim()) {
        var q = search.toLowerCase().trim();
        // B-670 (R-SPC-3) — name · skill · quality, the same predicate on both faces.
        items = items.filter(function (it) { return matchesQuery(it, q); });
      }
    } else if (tab === 'holds') {
      items = holds.map(function (id) { return byId[id]; }).filter(Boolean);
      if (search.trim()) {
        var q2 = search.toLowerCase().trim();
        items = items.filter(function (it) { return matchesQuery(it, q2); });
      }
    }

    var credits = getCredits(props.shopFor);
    var openItem = openId ? byId[openId] : null;
    var subCats = isCatalogTab ? subCatsFor(tab) : [];
    var titles = { weapons: 'WEAPONS', armor: 'ARMOR', gear: 'GEAR', holds: '◈ YOUR HOLDS', counter: 'THE COUNTER', shelves: 'THE SHELVES' };
    var activeS = isGm ? activeShelf() : null;

    /* ── THE BODIES, NAMED ONCE (B-665's device, and B-669 closes it) ─────────────────────────────
       The paper face (below) is the same component, the same state and the same writers as the dark
       one — `SellSheet`'s pattern. Row 1 stood the shelf, the read, the holds list and the counter as
       the SHIPPED components on dark `.st-legacy` islands inside the board's zones (the sheet's
       device, B-609); rows 2, 3, 4 and B-669 transplanted them in that order and the islands are gone.
       The bodies stay extracted to vars so there is ONE of each rather than a paper copy and a dark
       copy: two bodies that could drift apart is the second-kernel defect the single-door law exists
       to prevent. `legacyShelfBody` keeps its name because it IS legacy — the dark grid, drawn only
       when the switch is off, and the OFF leg of `smoke_store_transplant.py` is the positive control
       on its being element-for-element what shipped. */
    var legacyShelfBody = items.length === 0
      ? h('div', { style: { padding: '36px 20px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' } },
          tab === 'holds'
            ? 'Nothing on hold. ◈ on any item keeps it here between sessions.'
            : 'Nothing matches.')
      : h('div', {
          style: { display: 'grid', gridTemplateColumns: isDesk ? 'repeat(auto-fill, minmax(210px, 1fr))' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 },
        }, items.map(function (it) {
          return h(ItemCard, {
            key: it.key, item: it, face: face,
            held: holds.indexOf(it.key) >= 0,
            cartQty: cartQtyOf(it.key),
            affordable: props.shopFor && credits != null && Number(it.price) <= credits,
            locationMod: locationMod,
            inShelf: isGm ? inActiveShelf(it.regId || bareId(it.key)) : false,
            onAddToShelf: isGm ? function () { toggleShelfItem(it.regId || bareId(it.key)); } : null,
            onOpen: function () { setOpenId(it.key); },
          });
        }));
    /* B-669 — THE COUNTER IS ONE BODY FOR BOTH FACES, and `paper` is the only prop that arrives new.
       The name is no longer `legacyCounterBody`: nothing about it is legacy on the paper face and the
       last island in the store is gone with it.

       ONE GLOBAL COUNTER (R-SPC-3). Every door that mounts `Store` reads and writes the same slip
       through the same module state — the player's two doors and the creator's gear step. The GM's
       door is handed no `onFinalize` and therefore cannot finalize anything, and its bar has no Counter
       tab at all (`Docs/STORE_MAP.md` §3), so the GM face never reaches this body; the sharing is the
       contract's and not an accident of the singleton. */
    var counterBody = h(CounterView, {
      paper: paperFace,
      cart: cart, byId: byId, vplan: vplan, shopFor: props.shopFor, roster: props.roster,
      onEditPrice: editPrice, onQty: bumpQty, onRemove: removeLine, onFor: setLineFor,
      onFinalize: function (charId, cartLines) { return finalizeFor(charId, cartLines || cart); },
      onNeedCharacter: needCharacter,
      onOpenSheet: props.onOpenSheet,
      onBrowse: function () { if (props.onBrowse) props.onBrowse(); },
    });
    /* B-667 — THE READ IS ONE BODY FOR BOTH FACES. `paper` and `desk` are the only props that arrive
       new, and `desk` is the BAND rather than a width: the board's two-column read is the frame at
       1366 and the ladder's 1024 seam is what separates it from the phone's sheet (`useStoreBand`).
       The name `legacyReadBody` is kept for exactly one more row so B-668's diff reads as COMPARE and
       nothing else; it is no longer legacy on the paper face. */
    var legacyReadBody = openItem ? h(ItemOverlay, {
      item: openItem, byId: byId, shopFor: props.shopFor, qualitiesDb: props.qualitiesDb, face: face,
      paper: paperFace, desk: paperFace && band !== 'mobile',
      held: holds.indexOf(openItem.key) >= 0,
      cartQty: cartQtyOf(openItem.key),
      locationMod: locationMod,
      inShelf: isGm ? inActiveShelf(openItem.regId || bareId(openItem.key)) : false,
      activeShelfName: activeS ? activeS.name : null,
      onToggleShelf: function () { toggleShelfItem(openItem.regId || bareId(openItem.key)); },
      onToggleHold: function () { toggleHold(openItem.key); },
      onAddToCart: function () { addToCart(openItem); },
      onMoveToInventory: function () { moveToInventory(openItem); },
      onClose: function () { setOpenId(null); },
      onNeedCharacter: function () { needCharacter(null); },
    }) : null;
    var legacyPickerBody = pickReason ? h(RosterPicker, {
      roster: props.roster, currentId: props.shopFor && props.shopFor.id,
      title: pickReason.title, allowBrowsing: !pendingFinalizeRef.current,
      onPick: function (id) {
        setPickReason(null);
        if (props.onPickCharacter) props.onPickCharacter(id);
        var fn = pendingFinalizeRef.current;
        pendingFinalizeRef.current = null;
        if (fn && id) fn(id);
      },
      onClose: function () { pendingFinalizeRef.current = null; setPickReason(null); },
    }) : null;

    /* ══════════════════════════════════════════════════════════════════════════════════════════
       THE PAPER FACE (B-665; ruling `store-paper-concept` R-SPC-1/2, mockup `lab/holocron/store.html`
       @ lab `cf33463e`, Jason 2026-09-18 "Approved.")

       The SAME component, state, writers and testids with an `if (paper)` branch drawing the board's
       markup — `SellSheet`'s pattern in this very file, and `VesselSheet`'s for a bigger one (deleted at the
       Ship Yard's S5 flip). Never
       the dark tree restyled (`template-transplant-playbook`).

       ROW 1 WAS THE GROUND: the shell on the document ground, the runhead, the lede, the search field,
       the rail at the desk and the summoned drawer on the phone, the foot legends. The shelf rows
       (B-666), the item read (B-667), COMPARE and the holds board (B-668) and the counter (B-669) are
       all the board's own markup now — `[data-store-interim]`, the query row 1 left behind so "what is
       left to transplant" was never a memory, returns nothing.

       THE GM FACE IS THIS TOO, since PAPER N5 wave A2 (B-1123; ruling `gm-own-screens-concept`
       R-GOS-28, DECISIONS D-76, frames G1–G26 at lab `4b5b7663`). R-SPC-2's reservation ("the GM's
       mount passes no `paper`") lifted there: the GM host passes `paper: gmPaper` and links the layer.
       ONE kernel, the host writes — the GM's parts (the stamp, + SHELF, the stock book, the picker)
       join this branch, and the player's (holds, the counter, `shopFor`, the counter's teaching line)
       stay behind `!isGm`, as the dark tree keeps them.
    ══════════════════════════════════════════════════════════════════════════════════════════ */
    if (props.paper) {
      var hh = band === 'mobile';
      var sectionN = isCatalogTab ? (catalog.bySection[tab] || []).length : holds.length;
      /* ── B-668 · THE HOLDS, AS ROWS — and the list is the WHOLE list ───────────────────────────────
         THE DEFECT THIS CLOSES was measured by row 2 and left for this one: the head counts the ids
         KEPT (`holds.length`, 5) while the dark list could only draw the ones that resolve (4), so the
         board's own count disagreed with its own list. `items` above does `.filter(Boolean)` — correct
         for a GRID of cards, which has nothing to draw for an id with no record. A PAPER row does: the
         id itself, and the counter's own sentence for the same case. So the paper face walks `holds`
         and keeps EVERY entry, resolved or not, and the count and the rows agree by construction.

         LAW 1 (STORE_SHAPE §2, R-SPC-4's sibling): holds are NEVER filtered by Active Sources. The
         catalog above IS filtered; this list is not, and an entry whose book is switched off is drawn
         WITH THE BOARD'S SENTENCE saying why it is still here. The predicate is the shipped one
         (`SWRPGSources.isActiveWith`, the same call the catalog filter makes) — asked here to say
         "off", never to remove. */
      var srcNow = window.SWRPGSources && window.SWRPGSources.current();
      var offBook = function (it) {
        return !!(srcNow && srcNow.index && !window.SWRPGSources.isActiveWith(it, srcNow.index, srcNow.off));
      };
      var holdRows = tab !== 'holds' ? [] : holds.map(function (key) {
        var it = byId[key] || null;
        return { key: key, item: it, off: it ? offBook(it) : false };
      }).filter(function (r) {
        if (!search.trim()) return true;
        var q = search.toLowerCase().trim();
        // B-670 — the store's ONE predicate (name · skill · quality) plus the id, which is the only
        // thing an UNRESOLVABLE hold has to be found by (row 4's leg). A resolvable row is found by
        // its record; an unresolvable one by the key itself.
        return r.item ? matchesQuery(r.item, q)
                      : String(r.key).toLowerCase().indexOf(q) >= 0;
      });
      // The number the field's tally prints. For a catalog shelf it is the filtered `items`; for holds
      // it is the rows this face actually draws — which is now every kept id.
      var shownN = tab === 'holds' ? holdRows.length : items.length;
      // THE RAIL'S CATEGORIES, COUNTED FROM THE LOADED CATALOG — never typed. The board's own rule
      // (`cat_counts`: "The first draft of this board hard-coded plausible-looking numbers; they were
      // invented, and invented numbers are a defect in a board"), which is the same rule for a build.
      var shelfAll = catalog.bySection[tab] || [];
      var railCats = [{ id: 'all', label: 'All ' + tab, n: sectionN }].concat(
        (isCatalogTab ? catsVocab : []).map(function (c) {
          return { id: c.id, label: c.label, matchType: c.matchType,
                   n: shelfAll.filter(function (it) {
                     return c.matchType && c.matchType.indexOf(it.type) !== -1;
                   }).length };
        }).filter(function (c) { return c.n > 0; }));
      // THE FOOT'S COVERAGE LINE, and it FOLLOWS the narrowing. The board's sentence is "N of M in
      // these categories" — of the M on this shelf, N are covered by the categories in the rail. The
      // rail's own counts stay whole-shelf (a map that moved under the reader would be no map), but N
      // is counted over the rows the NARROWING leaves, so applying a set moves it. With nothing
      // narrowed the two readings are the same number, which is the board's frame.
      //
      // B-670 — AND IT DOES NOT FOLLOW THE QUERY, because the board's own search frames say so: frames
      // Y and Z (`board(railed=True[, handheld=True], query=lightsaber)`) print "22 OF 397 MATCH" in
      // the field and "375 OF 397 IN THESE CATEGORIES" in the foot at the same time — the coverage
      // line is a claim about the SHELF and its category vocabulary, not about the current view, and
      // the split span beside it is what reports the query. Row 2 counted it over the rows shown,
      // which no frame contradicted then and frames Y/Z contradict now; the set half of row 2's rule
      // is kept (its leg stands), the query half is the frame's. Reported both ways to the session.
      var namedTypes = {};
      railCats.slice(1).forEach(function (c) {
        (c.matchType || []).forEach(function (t) { namedTypes[t] = 1; });
      });
      var namedN = (isCatalogTab ? itemsNarrowed : items)
        .filter(function (it) { return namedTypes[it.type]; }).length;
      // THE FOOT'S SPLIT (`search_split`) — the populations behind the tally, in the board's words and
      // the board's order. First-match-wins, so the three numbers SUM to the tally.
      var split = (isCatalogTab && search.trim()) ? searchSplit(items, search.toLowerCase().trim()) : null;
      var catLinks = railCats.map(function (c) {
        // DRAWN AS THE BOARD DRAWS IT (`<a class="st-cat">`), which is why the press cancels the
        // navigation: `.st-cat` carries the board's 44px floor and its active inset, and a `<button>`
        // would arrive wearing the UA's own chrome that none of these rules turn off. Flagged for the
        // gate as an a11y question on the drawing, not settled here (C-MU-4: the standard outranks
        // the mockup — the session puts it to the architect with B-666's rail).
        return h('a', {
          key: c.id, className: 'st-cat', href: '#', 'data-on': subCat === c.id ? '1' : null,
          'aria-current': subCat === c.id ? 'true' : null,
          onClick: function (e) { e.preventDefault(); setSubCat(c.id); setRailOpen(false); },
        }, c.label, h('b', null, c.n.toLocaleString('en-US')));
      });
      // THE NARROWING SETS (`narrow_block`). The buttons are the board's: `hp-buy-btn` in a `.st-narrow`
      // row under a mono `<h4>`, carrying the board's own option words and nothing else — so each
      // option's LIVE POPULATION rides as `data-set-n` rather than being drawn into a button the board
      // drew without one. Pressing an option applies it; pressing it again clears the set.
      var narrowInner = [];
      (isCatalogTab ? narrowSetsFor(tab) : []).forEach(function (set) {
        narrowInner.push(h('h4', { key: set.id + '-h' }, set.title));
        narrowInner.push(h('div', {
          className: 'st-narrow', key: set.id, 'data-store-set': set.id,
        }, set.options.map(function (o) {
          var on = sets[set.id] === o;
          return h('button', {
            key: o, type: 'button', className: 'hp-buy-btn',
            'data-on': on ? '1' : null, 'aria-pressed': on ? 'true' : 'false',
            'data-set-n': shelfAll.filter(function (it) { return set.test(it, o); }).length,
            onClick: function () {
              var nx = {};
              for (var k in sets) if (k !== set.id) nx[k] = sets[k];
              if (!on) nx[set.id] = o;
              setSets(nx);
            },
          }, o);
        })));
      });
      var railInner = [h('h4', { key: 'h' }, 'Category')].concat(catLinks).concat(narrowInner);
      var head = h('div', { className: 'st-head', 'data-store-zone': 'head' },
        h('h1', { className: 'hp-desig st-ch' },
          tab === 'counter' ? 'The counter' : (tab === 'holds' ? 'Your holds' : titles[tab].charAt(0) + titles[tab].slice(1).toLowerCase()),
          tab === 'counter' ? null : h('em', null, sectionN.toLocaleString('en-US') + (tab === 'holds' ? ' kept' : ' on the shelf'))),
        tab === 'counter'
          ? h('p', { className: 'st-sub' }, 'Prices are list. ', h('b', null, 'Write what the table charged.'))
          : (tab === 'holds'
              // B-668 — THE GLYPH IS THE BOARD'S (`&#9670;`, ◆), not the dark face's ◈. Row 1 ported
              // this lede with the app's legacy ◈ and the board's own line reads ◆ — the same mark
              // the act row's HOLD button already carries on paper (row 3). One glyph for one act.
              ? h('p', { className: 'st-sub' }, '◆ on any item keeps it here. Ids only, kept between sessions. ',
                  h('b', null, 'Never filtered by your sources.'))
              // G1 — not on the GM door: the line is the player's counter teaching, the GM has no counter
              : (isGm ? null : h('p', { className: 'st-sub' }, 'Prices are list. At the counter, write what the table charged.'))),
        // THE SEARCH FIELD is the board's box over the SHIPPED `search` state, the shipped writer and
        // the shipped `aria-label` (the hook 10 smokes drive). B-670 — the placeholder's promise is now
        // KEPT: the predicate above is name · skill · quality on both faces (R-SPC-3), the tally reads
        // N OF M MATCH and the foot prints the three populations behind it.
        tab === 'counter' ? null : h('label', { className: 'st-search' },
          h('span', { className: 'k' }, 'FIND'),
          h('input', {
            type: 'text', value: search, onChange: function (e) { setSearch(e.target.value); },
            'aria-label': 'Search items',
            // ROW 1'S CLASH 6, RESOLVED INSIDE THE FRAME. The board's placeholder is one string and at
            // 390 it is 116px too long — the examples are cut off mid-word, so the phone reads a
            // promise it cannot finish. THE PROMISE IS THE LOAD-BEARING HALF ("name, skill, quality" is
            // what §1 makes the box do); the three examples teach it. So the phone keeps the promise
            // and drops the examples, and the desk keeps the board's line VERBATIM. Nothing about the
            // box, its type size or its 46px height moves.
            placeholder: tab === 'holds' ? 'Search your holds'
              : (hh ? 'Name, skill, quality' : 'Name, skill, quality — “stun”, “pierce”, “ranged light”'),
          }),
          h('span', { className: 'k' }, search.trim()
            ? shownN.toLocaleString('en-US') + ' OF ' + sectionN.toLocaleString('en-US') + ' MATCH'
            : shownN.toLocaleString('en-US') + (tab === 'holds' ? ' KEPT' : ' SHOWN'))),
        // THE SUMMON — the phone's door to the rail. Jason 2026-09-01: not a duplicate of the bottom
        // bar (the bar carries SECTIONS, the rail carries CATEGORY and the four attribute sets). Its
        // count is the board's own "N SETS", counted from the sets this shelf can answer — four on the
        // weapons shelf, which is the board's frame; two on armor and gear, which the board never drew.
        (hh && isCatalogTab) ? h('button', {
          type: 'button', className: 'hp-buy-btn st-summon', 'aria-expanded': railOpen ? 'true' : 'false',
          onClick: function () { setRailOpen(!railOpen); },
        }, 'CATEGORIES & FILTERS', h('span', { className: 'st-summon-n' },
             narrowSetsFor(tab).length + ' SETS')) : null);
      var foot = tab === 'counter' ? null : h('div', { className: 'st-foot', 'data-store-zone': 'foot' },
        h('span', null, 'FIND DIFFICULTY · TABLE 5-1 · ' + FIND_CITE),
        tab === 'holds'
          ? h('span', null, 'KEPT AS IDS · ', h('code', null, HOLDS_KEY))
          : h('span', null, '(R) RESTRICTED · STREETWISE, NOT NEGOTIATION'),
        split ? h('span', { 'data-search-split': '1' },
          split.NAME + ' BY NAME · ' + split.SKILL + ' BY SKILL · ' + split.QUALITY + ' BY QUALITY') : null,
        (tab === 'holds' || !namedN) ? null
          : h('span', null, namedN.toLocaleString('en-US') + ' OF ' + sectionN.toLocaleString('en-US') + ' IN THESE CATEGORIES'));
      /* ── B-671 · THE PURSE STRIP — the one thing the DOOR adds to the catalog ──────────────────────
         `store_build.py`'s `board(…, purse=N)` (frames O and P, the sheet's SHOP door) and
         `creator_board()` (frame K, the creator's gear step) draw the SAME strip as the last child of
         `.st`, and the board's own comment says why it is an ARGUMENT and not a second generator:
         "`ctx` and `purse` ARE THE DOOR … one kernel, four doors, and the door decides what paper is
         clipped to the same book." Nothing about the shelf changes, which is the claim.

         THE VALUE IS THE HOST'S, AND THAT IS THE WHOLE DIFFERENCE BETWEEN THE TWO DOORS. The sheet's
         door reads the CHARACTER'S OWN CREDITS (`340 CREDITS`); the creator's reads a STARTING
         ALLOWANCE against its base (`left / 500 CREDITS`) — and the denominator exists only in the
         wizard (`ctrl.credits.total`), so a kernel that derived it would have to invent it. One prop,
         one shape, and the door fills it: `{ value, total?, label, onAct }`. The GM's mount passes
         none, which is `gm_board()` — no character, no purse, no slip (R-SPC-2).

         WHY THE BUTTON IS THE HOST'S TOO: the word differs by door (COUNTER at the sheet's, DONE at
         the creator's) and so does the act — one changes `props.tab`, which the kernel does not own,
         and the other closes a sub-view the kernel has never heard of.

         `data-over` is `creator_board()`'s own rule (`1 if left < 0 else 0`) applied to both, which is
         inert at the sheet's door (a character's credits are what they have) and load-bearing at the
         creator's (an over-drawn re-entrant browses freely — F-45's standing edge, never blocked). */
      var purse = props.purse;
      var purseStrip = purse ? h('div', {
        className: 'cr-purse', 'data-store-zone': 'purse',
        'data-over': (Number(purse.value) || 0) < 0 ? '1' : '0',
      },
        h('span', { className: 'cr-lab' }, 'PURSE'),
        // `purse.hook` KEEPS A SHIPPED DRIVER HOOK ACROSS THE FACE CHANGE. The creator's dark strip
        // carries `data-creator-purse={remaining}` and three suites read it (`smoke_creator_as9`,
        // `smoke_gear_transplant`, `smoke_review_transplant`); the paper strip replaces that element,
        // so the host hands the attribute name down and nothing that drives the purse has to move.
        // Same discipline as every earlier row: the testids do not travel with the face.
        h('span', Object.assign({ className: 'cr-val' },
          purse.hook ? (function (o) { o[purse.hook] = purse.value; return o; })({}) : null),
          (Number(purse.value) || 0).toLocaleString('en-US')
          + (purse.total != null ? ' / ' + (Number(purse.total) || 0).toLocaleString('en-US') : '')
          + ' CREDITS'),
        purse.label ? h('button', {
          type: 'button', className: 'hp-buy-btn', 'data-store-purse-act': '1',
          onClick: function () { if (purse.onAct) purse.onAct(); },
        }, purse.label) : null) : null;
      /* ── THE SHELF (the board's `row_wide` at the desk, `row_hh` on the phone) ────────────────────
         ONE row builder per band, drawn as `store_build.py` draws it: the icon mat, the name with its
         (R) mark, the qualities line, the spec cells, the price, and the find MARK. The row OPENS the
         item — that is what a catalog row is for, and it is how the section-qualified key is proved:
         the weapons shelf's Thermal Cutter now opens the WEAPON. `<tr>` keeps its row semantics and
         gains a tabindex, a label and the Enter/Space handler `ItemCard` already uses; whether a
         catalog row should be a row-with-a-tabindex or carry a button is an a11y question ON THE
         DRAWING, flagged for the architect with the rail's `<a class="st-cat">` (C-MU-4). */
      var cols = paperDeskCols(tab);
      // B-1124 — THE GM DOOR READS EVERY FIND LINE AT ITS WORLD (frames G2/G5): the band is `effRarity`'s, and where
      // the world moved it L · M · N's `was …` mark says from what. The player's rows read the printed rarity.
      var rarOf = function (it) { return isGm ? effRarity(it.rarity, locationMod) : it.rarity; };
      var findMark = function (it, withWord, why) {
        var b = rarityBand(rarOf(it));
        var was = isGm ? bandShift(it.rarity, rarOf(it)) : null;
        // R-SPC-4: pips and the printed word. R-ITM5: a rarity-less record prints no band rather than
        // a guessed one — the pips fall to the board's own em-dash.
        return h('div', {
          className: 'st-find', 'data-find-band': b ? b.label : null, 'data-find-dice': b ? b.dice : null,
        }, h('span', { className: 'st-pips' }, pipsOf(b ? b.dice : 0)),
           b ? h('b', null, withWord ? b.label + ' · TO FIND' : b.label) : null,
           was ? h('span', { className: 'gm-shift', 'data-find-was': was }, 'was ' + was) : null,
           // B-670 — `row_hh`'s mark: WHY this row is in a searched list, inside the find line.
           why ? h('span', { className: 'st-mk', 'data-why': '1' }, why) : null);
      };
      var mat = function (it) {
        // The board drew ONE generic glyph in every mat (a fixture's single SVG). The shipped ladder
        // (R-ITM6) knows this item's own family, and `.st-mat svg` gives it the paper's ink, so the mat
        // carries the item's silhouette. Same plate, same size; the drawing gains nothing invented.
        return h('div', { className: 'hp-plate st-mat' + (isGm ? ' gm-g' : '') }, glyphSvg(glyphFamily(it), 26));
      };
      /* B-1124 — THE + SHELF TOGGLE (frames G1–G5), the dark card's pill on paper: `toggleShelfItem` unchanged (with no
         active shelf it makes one called "New shelf"). ON reads ✓ ON SHELF in the maroon rule — the dark card's corner ✓
         and its pill are one mark here, because the pill already says it. Its press and its Enter never reach the row. */
      var shelfIdOf = function (it) { return it.regId || bareId(it.key); };
      var shelfPill = function (it) {
        var on = inActiveShelf(shelfIdOf(it));
        return h('button', {
          type: 'button', className: 'hp-buy-btn gm-pill', 'data-store-pill': '1',
          'data-on': on ? '1' : '0', 'aria-pressed': on ? 'true' : 'false',
          'aria-label': (on ? 'On the shelf: ' : 'Add to shelf: ') + (it.name || 'item'),
          onClick: function (e) { e.stopPropagation(); toggleShelfItem(shelfIdOf(it)); },
          onKeyDown: function (e) { e.stopPropagation(); },
        }, on ? '✓ ON SHELF' : '+ SHELF');
      };
      var rowProps = function (it) {
        return {
          key: it.key, 'data-store-row': it.key, tabIndex: 0,
          'aria-label': it.name + ' · ' + fmtCr(it.price),
          onClick: function () { setOpenId(it.key); },
          onKeyDown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(it.key); }
          },
        };
      };
      /* B-670 — THE REASON A ROW IS HERE TRAVELS WITH THE ROW (frames Y and Z). The board's own rule:
         "a row that matches on a field the reader cannot see reads as a bug — prefer the rendering that
         cannot express the wrong thing." At the desk the why REPLACES the qualities line in the name
         cell (`row_wide(it, why)`); on the phone it is a mark inside the find line (`row_hh`'s
         `.st-mk`, the same chip the holds row's section stamp wears). `null` when the box is empty, so
         an unsearched shelf is the frame it was. */
      var qNow = search.trim() ? search.toLowerCase().trim() : '';
      var whyOf = function (it) { return qNow ? searchWhy(it, qNow) : null; };
      var rowWide = function (it) {
        var why = whyOf(it);
        var q = why || (it.qualities || []).slice(0, 3).join(' · ');
        return h('tr', rowProps(it),
          h('td', { className: 'nm' },
            h('div', { className: 'st-nmwrap' }, mat(it),
              h('div', null,
                h('div', null, it.name, it.restricted ? h('span', { className: 'st-r' }, '(R)') : null),
                q ? h('div', { className: 'st-q', 'data-why': why ? '1' : null }, q) : null))),
          cols.map(function (c) {
            return h('td', { key: c[0], className: c[2] }, cellText(it[c[1]]));
          }),
          h('td', { className: 'num st-cr' }, (Number(it.price) || 0).toLocaleString('en-US')),
          h('td', null, findMark(it, false)),
          // G4/G5 — the GM's one more column: + SHELF at the row's end, where the hand finishes reading a row.
          isGm ? h('td', { className: 'gm-pcell' }, shelfPill(it)) : null);
      };
      var rowHh = function (it) {
        var pc = paperCols(tab);
        return h('tr', rowProps(it),
          h('td', null,
            h('div', { className: 'st-row1' }, mat(it),
              h('div', { className: 'st-hh-nm' }, it.name,
                it.restricted ? h('span', { className: 'st-r' }, '(R)') : null),
              h('div', { className: 'st-cr' }, (Number(it.price) || 0).toLocaleString('en-US') + ' cr')),
            h('div', { className: 'st-specs' },
              pc.pairs.map(function (c) { return h('span', { key: c[0] }, c[0] + ' ' + cellText(it[c[1]])); }),
              pc.words.map(function (c) { return h('span', { key: c[0] }, cellText(it[c[1]])); })),
            // G1/G2 — the GM's find line and its + SHELF share one line under the specs (`gm-findrow`).
            isGm ? h('div', { className: 'gm-findrow' }, findMark(it, true, whyOf(it)), shelfPill(it))
              : findMark(it, true, whyOf(it))));
      };
      var shelf = !isCatalogTab ? null : (items.length === 0
        ? h('p', { className: 'st-sub', 'data-store-empty': '1' },
            search.trim() || subCat !== 'all' || Object.keys(sets).length
              ? 'Nothing matches. Clear a filter or widen the search.'
              : 'Nothing on this shelf.')
        : h('table', { className: 'st-tab' },
            hh ? null : h('thead', null, h('tr', null,
              h('th', null, 'Item'),
              cols.map(function (c) { return h('th', { key: c[0], className: c[2] === 'num' ? 'num' : null }, c[0]); }),
              h('th', { className: 'num' }, 'Price'),
              h('th', null, 'To find'),
              isGm ? h('th', null) : null)),
            h('tbody', null, items.map(hh ? rowHh : rowWide))));
      /* ── B-668 · THE HOLDS BOARD (`holds_board`) ───────────────────────────────────────────────────
         ONE ROW PER KEPT ID, drawn as `store_build.py` draws it: the mat, the name with its (R) mark
         and the SECTION stamp, the find MARK with the printed word, the off-book sentence where it
         applies, and the foot — the price with ADD TO COUNTER and ◆ RELEASE.

         THE ROW OPENS THE READ, which the board did not draw and the brief asks for: a list you can
         keep things on but not look at them from is a dead end, and the catalog row one screen away
         already carries exactly this device (`rowProps`). The two buttons inside the row stop the
         press from reaching it — a press on RELEASE is not a press on the row.

         ◆ RELEASE, NOT "REMOVE" — the board's word. The brief says REMOVE; the frame says RELEASE and
         the frame is law, so the word is the board's and the difference is reported. The writer is
         `toggleHold`, unchanged, and the durable list is unchanged (`swrpg_store_holds_v1`, values
         section-qualified since row 2). */
      var OFF_BOOK_WHY = 'The book this comes from is switched off. Holds are never filtered by your '
        + 'sources, so it stays on this list.';
      var stop = function (fn) { return function (e) { e.stopPropagation(); fn(); }; };
      var holdLine = function (r) {
        // THE UNRESOLVABLE HOLD IS A ROW, and it is the COUNTER'S OWN IDIOM for the same case
        // (`slip_rows(unresolvable=True)`: `data-unresolved="1"`, a bare mat, the id, and an
        // `hp-why st-why` sentence). The counter's sentence names the BOOK ("the book it came from is
        // switched off"); this row cannot make that claim — an id that matches no record in ANY
        // section is not an off-book item, it is an id the catalog no longer has — so it keeps the
        // half that is true and drops the half that would be a guess. Reported.
        if (!r.item) {
          return h('div', {
            key: r.key, className: 'st-hold-line', 'data-store-hold': r.key, 'data-unresolved': '1',
          },
            h('div', { className: 'hp-plate st-mat' }),
            h('div', { className: 'st-hold-nm' }, r.key),
            h('div', { className: 'hp-why st-why' }, 'Not on the shelf today. Kept as you left it.'),
            h('div', { className: 'st-holdfoot' },
              h('span', { className: 'st-cr' }, '—'),
              h('span', null, h('button', {
                type: 'button', className: 'hp-buy-btn ct-rm',
                'aria-label': 'Release ' + r.key,
                onClick: stop(function () { toggleHold(r.key); }),
              }, '◆ RELEASE'))));
        }
        var it = r.item;
        return h('div', {
          key: r.key, className: 'st-hold-line', 'data-store-hold': r.key,
          'data-off-book': r.off ? '1' : null, tabIndex: 0,
          'aria-label': it.name + ' · ' + fmtCr(it.price),
          onClick: function () { setOpenId(r.key); },
          onKeyDown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(r.key); }
          },
        },
          mat(it),
          h('div', { className: 'st-hold-nm' }, it.name,
            it.restricted ? h('span', { className: 'st-r' }, '(R)') : null,
            h('span', { className: 'st-mk' }, (it.section || '').toUpperCase())),
          findMark(it, true),
          r.off ? h('div', { className: 'hp-why st-why' }, OFF_BOOK_WHY) : null,
          h('div', { className: 'st-holdfoot' },
            h('span', { className: 'st-cr' }, fmtCr(it.price)),
            h('span', null,
              h('button', {
                type: 'button', className: 'hp-buy-btn',
                onClick: stop(function () { addToCart(it); }),
              }, 'ADD TO COUNTER'),
              h('button', {
                type: 'button', className: 'hp-buy-btn ct-rm',
                'aria-label': 'Release ' + it.name,
                onClick: stop(function () { toggleHold(r.key); }),
              }, '◆ RELEASE'))));
      };
      // THE EMPTY STATES — the board drew neither. The second is the kernel's own sentence with the
      // board's glyph; the first is the shelf's, re-pointed at a search over a list. Reported.
      var holdsBody = holdRows.length ? holdRows.map(holdLine)
        : h('p', { className: 'st-sub', 'data-store-empty': '1' },
            search.trim() ? 'Nothing matches. Clear the search.'
              : 'Nothing on hold. ◆ on any item keeps it here between sessions.');
      /* B-1124 — THE LOCATION STAMP (frames G1/G2/G4/G5; the §4 doors' `.gm-stamp`): the dark `Masthead`'s state and
         words on paper — SET A LOCATION · TAP TO SET WHERE THIS MARKET IS unset, the world · its circumstance (and the
         lane) · TAP TO CHANGE set, the modifier over TO FIND — and the button it is (its `aria-label` is Masthead's), which
         opens the picker. `book` is the stock book's approved form (R-GOS-29, G22): REGION — circumstance, no TAP TO
         CHANGE; the catalog keeps G2's. The difficulty is a SIGN here and never a hue. */
      var gmStamp = function (book) {
        var loc = location;
        // R-GOS-41 (ADDENDUM 11) — on the stock book, unset, frame L's approved line (L · M · N, cf33463e); the
        // catalog's unset stamp keeps G1's, the app's. Both render uppercase by store.css's own rule (R-DI1).
        var circ = !loc ? (book ? 'Until a world is named, every find line reads its printed rarity.' : 'TAP TO SET WHERE THIS MARKET IS')
          : book ? ((loc.region ? loc.region + ' — ' : '') + loc.circumstance.label)
          : (loc.circumstance.label.toUpperCase() + (loc.tradeLane
              ? (' · ' + (loc.routeName ? ('ON THE ' + loc.routeName.toUpperCase()) : 'PRIMARY TRADE LANE')) : ''));
        return h('button', {
          type: 'button', className: 'gm-stamp gm-loc', 'data-unset': loc ? null : '1', 'data-store-stamp': book ? 'book' : 'catalog',
          'aria-label': loc ? ('Market location: ' + loc.name + ', ' + loc.circumstance.label + '. Tap to change.') : 'Set the market location',
          onClick: function () { setLocOpen(true); },
        },
          h('div', null,
            h('div', { className: 'gm-world' }, loc ? loc.name : 'SET A LOCATION'),
            h('div', { className: 'gm-circ' }, circ),
            (loc && !book) ? h('div', { className: 'gm-tap' }, 'TAP TO CHANGE') : null),
          h('div', { className: 'gm-mod', 'data-unset': loc ? null : '1' }, loc ? modText(loc.mod) : '—', h('em', null, 'TO FIND')));
      };
      /* ── B-1126 · THE STOCK BOOK ON PAPER (frames G10–G21 for the controls, G22 for the words; ruling
         `gm-own-screens-concept` R-GOS-29, R-GOS-31; D-76 "A. THE STOCK BOOK") ─────────────────────────────────────
         THE WORDS ARE JASON'S 18 SEPTEMBER ONES (L · M · N, G22): the page heads "The stock book" with its teaching line,
         the stamp prints REGION — circumstance (the stamp is still the button it is), the active shelf heads NAME ·
         N items · ids only, and the foot cites Table 5-1 and Table 5-2. Two app lines leave this page: the prep foot
         and the stamp's TAP TO CHANGE. THE CONTROLS ARE THE APPROVED STATES' (G10–G21): the switcher (chips NAME · COUNT
         on the phone, the rail at the desk) with + NEW SHELF, RENAME · DELETE on the active shelf's head, × per row,
         the two empty copies verbatim, and the two drawn lines — the NAME LINE (G11/G14/G17/G20) in the prompt's own
         words (Name this shelf / Rename this shelf, New shelf, DONE, ✕) and the DELETE LINE (G15/G21) with D-76's
         sentence. ONE body for both bands; the band picks the switcher's form and the rows' form, as the catalog's.
         The rows resolve as the dark ShelfView's do (a bare id, qualified on the way in) and open the read. */
      var isBook = isGm && tab === 'shelves';
      var bookBody = null, bookHead = null, bookFoot = null;
      if (isBook) {
        var bSt = shelfState;
        var bActive = bSt.shelves.find(function (x) { return x.id === bSt.activeId; }) || null;
        var bItems = bActive ? bActive.items.map(function (id) {
          return byId[id] || byId[qualifyKey(id, byId)];
        }).filter(Boolean) : [];
        var findCell = function (it) {
          var eff = effRarity(it.rarity, locationMod), b = rarityBand(eff), was = bandShift(it.rarity, eff);
          return h('div', { className: 'st-find', 'data-find-band': b ? b.label : null, 'data-find-dice': b ? b.dice : null },
            h('span', { className: 'st-pips' }, pipsOf(b ? b.dice : 0)),
            b ? h('b', null, b.label + ' · ' + (it.restricted ? 'STREETWISE' : 'NEGOTIATION')) : null,
            was ? h('span', { className: 'gm-shift', 'data-find-was': was }, 'was ' + was) : null);
        };
        var rmBtn = function (it) {
          return h('button', {
            type: 'button', className: 'hp-buy-btn gm-x', 'data-store-remove': '1',
            'aria-label': 'Remove ' + (it.name || 'item') + ' from the shelf',
            onClick: function (e) { e.stopPropagation(); toggleShelfItem(shelfIdOf(it)); },
            onKeyDown: function (e) { e.stopPropagation(); },
          }, '×');
        };
        var openProps = function (it) {
          return { key: it.key, 'data-store-stock': it.key, tabIndex: 0, 'aria-label': (it.name || 'item') + ' · ' + fmtCr(it.price),
            onClick: function () { setOpenId(it.key); },
            onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(it.key); } } };
        };
        var nameLine = naming ? h('div', {
          className: 'gm-nameline', role: 'group', 'data-store-nameline': naming.mode,
          'aria-label': naming.mode === 'new' ? 'Name this shelf' : 'Rename this shelf',
        },
          h('label', { className: 'st-search gm-nameinput' },
            h('span', { className: 'k' }, naming.mode === 'new' ? 'Name this shelf' : 'Rename this shelf'),
            h('input', {
              type: 'text', value: nameDraft, autoFocus: true,
              onChange: function (e) { setNameDraft(e.target.value); },
              onKeyDown: function (e) {
                if (e.key === 'Enter') { e.preventDefault(); commitNameLine(); }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNaming(null); }
              },
            })),
          h('div', { className: 'gm-nameacts' },
            h('button', { type: 'button', className: 'hp-commit', onClick: commitNameLine }, 'DONE'),
            h('button', { type: 'button', className: 'hp-buy-btn st-close', 'aria-label': 'Cancel', onClick: function () { setNaming(null); } }, '✕'))) : null;
        var delShelf = deletingId ? bSt.shelves.find(function (x) { return x.id === deletingId; }) : null;
        var delLine = delShelf ? h('div', {
          className: 'gm-delline', role: 'alertdialog', 'aria-label': 'Delete ' + delShelf.name, 'data-store-delline': delShelf.id,
        },
          h('p', null, 'Delete ', h('b', null, delShelf.name), ' and the ' + delShelf.items.length + ' items on it? The catalog keeps them.'),
          h('div', { className: 'gm-nameacts' },
            h('button', { type: 'button', className: 'hp-commit gm-del', onClick: function () { var id = delShelf.id; setDeletingId(null); doDeleteShelf(id); } }, 'DELETE'),
            h('button', { type: 'button', className: 'hp-buy-btn st-close', 'aria-label': 'Keep the shelf', onClick: function () { setDeletingId(null); } }, '✕'))) : null;
        var actHead = bActive ? h('div', { className: 'gm-acthd' },
          h('h2', { className: 'gm-actnm' }, bActive.name),
          h('span', { className: 'gm-shelfhd' }, h('em', null, bActive.items.length + ' items · ids only')),
          h('button', { type: 'button', className: 'hp-quiet gm-act', onClick: function () { renameShelf(bActive.id); } }, 'RENAME'),
          h('button', { type: 'button', className: 'hp-quiet gm-act gm-actdel', onClick: function () { deleteShelf(bActive.id); } }, 'DELETE')) : null;
        var stockRows = !bItems.length ? null : (hh
          ? bItems.map(function (it) {
              return h('div', Object.assign({ className: 'gm-stockrow gm-rmrow' }, openProps(it)),
                h('div', { className: 'hp-plate st-mat gm-g' }, glyphSvg(glyphFamily(it), 26)),
                h('div', { className: 'gm-nm' }, it.name, it.restricted ? h('span', { className: 'st-r' }, '(R)') : null),
                findCell(it),
                h('div', { className: 'gm-cr' }, fmtCr(it.price)),
                rmBtn(it));
            })
          : h('table', { className: 'st-tab gm-stocktab' },
              h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', null, 'To find'), h('th', { className: 'num' }, 'Price'), h('th', null))),
              h('tbody', null, bItems.map(function (it) {
                return h('tr', openProps(it),
                  h('td', { className: 'nm' }, h('div', { className: 'st-nmwrap' },
                    h('div', { className: 'hp-plate st-mat gm-g' }, glyphSvg(glyphFamily(it), 26)),
                    h('div', null, it.name, it.restricted ? h('span', { className: 'st-r' }, '(R)') : null))),
                  h('td', null, findCell(it)),
                  h('td', { className: 'num st-cr' }, (Number(it.price) || 0).toLocaleString('en-US')),
                  h('td', { className: 'gm-pcell' }, rmBtn(it)));
              }))));
        // THE PAGE: a new shelf being named shows the line alone (G11/G17); a rename or a delete puts its line where
        // the head was and keeps the rows under it (G14/G15/G20/G21) — a rename is not a different page.
        var bookContent = (naming && naming.mode === 'new') ? nameLine
          : !bActive ? h('p', { className: 'gm-empty', 'data-store-empty': 'none' },
              'No shelves yet. A shelf is a named stock list — what a market carries. Make one, then add items from the grid with “+ SHELF”.')
          : h(React.Fragment, null,
              nameLine || delLine || actHead,
              bItems.length ? stockRows : h('p', { className: 'gm-empty', 'data-store-empty': 'shelf' },
                'This shelf is empty. Browse the categories and tap “+ SHELF” on any item.'));
        var newBtn = h('button', { type: 'button', className: 'hp-buy-btn gm-chip gm-new', onClick: createShelf }, '+ NEW SHELF');
        bookHead = h('div', { className: 'st-head', 'data-store-zone': 'head' },
          h('h1', { className: 'hp-desig st-ch' }, 'The stock book'),
          h('p', { className: 'st-sub' }, 'What this market carries. Build the list before the session, then read it at the table.'));
        bookBody = hh
          ? [/* R-GOS-39 (ADDENDUM 10) — the phone switcher is a STRIP, not a ZONE: no `hp-zone`, no `data-axis` (the
                  zone is the ONE self-scrolling filler, R-PN3-3); store.css holds it at its content height. */
             h('div', { key: 'sw', className: 'gm-shelves', 'data-store-zone': 'switcher' },
               bSt.shelves.map(function (x) {
                 var on = bActive && x.id === bActive.id;
                 return h('button', {
                   key: x.id, type: 'button', className: 'hp-buy-btn gm-chip', 'data-on': on ? '1' : '0',
                   'aria-pressed': on ? 'true' : 'false', onClick: function () { switchShelf(x.id); },
                 }, x.name + ' · ' + x.items.length);
               }), newBtn),
             h('div', { key: 'bd', className: 'ct-body gm-bookbody', 'data-store-zone': 'book' }, bookContent)]
          : h('div', { className: 'st-body' },
              h('nav', { className: 'hp-index st-rail gm-rail', 'aria-label': 'Shelves', 'data-store-zone': 'switcher' },
                bSt.shelves.map(function (x) {
                  var on = bActive && x.id === bActive.id;
                  return h('a', {
                    key: x.id, className: 'st-cat', href: '#', 'data-on': on ? '1' : null, 'aria-current': on ? 'true' : null,
                    onClick: function (e) { e.preventDefault(); switchShelf(x.id); },
                  }, x.name, h('b', null, String(x.items.length)));
                }), newBtn),
              h('div', { className: 'st-main' },
                h('div', { className: 'ct-body gm-bookbody', 'data-store-zone': 'book' }, bookContent)));
        bookFoot = h('div', { className: 'st-foot', 'data-store-zone': 'foot' },
          h('span', null, 'FIND DIFFICULTY · TABLE 5-1 · ' + FIND_CITE),
          h('span', null, 'WORLD CIRCUMSTANCE · TABLE 5-2'));
      }
      /* B-669 — `island()` IS GONE, and with it the whole interim device. Row 1 stood four islands
         (`catalog` · `read` · `holds` · `counter`) so that "what is left to transplant" was a query
         over the DOM and not a memory; rows 2, 3, 4 and this one took them in that order. The query
         still runs — `[data-store-interim]` — and now answers with nothing, which is the only form of
         "finished" this device can report. `.st-legacy` leaves `lib/shared/store.css` in the same
         commit rather than sitting there unreachable. */
      return h('div', {
        className: 'st-surface', 'data-doc-ground': 'creator', 'data-store-shell': '1',
        'data-band': band, 'data-store-face': face,
      },
        h('div', { className: 'st' + (isBook ? ' gm gm-book' + (hh ? ' gm-hh' : '') : (isGm ? ' gm gm-cat' : '') + (hh ? ' st-hh' : ''))
            + (tab === 'counter' ? ' ct' : '') },
          isBook ? bookHead : head,
          (isGm && (isCatalogTab || isBook)) ? gmStamp(isBook) : null,
          isBook ? bookBody
          : tab === 'counter' ? h('div', { className: 'ct-body', 'data-store-zone': 'counter' }, counterBody)
            : (tab === 'holds' ? h('div', { className: 'ct-body', 'data-store-zone': 'holds' }, holdsBody)
                : h('div', { className: 'st-body' },
                    hh ? null : h('nav', { className: 'hp-index st-rail', 'data-store-zone': 'rail' }, railInner),
                    h('div', { className: 'st-main', 'data-store-zone': 'catalog' }, shelf))),
          // The drawer is rendered AFTER the body, as the board renders it: `.st-scrim` and
          // `.st-drawer` are absolute to `.st`, so they lie over the shelf rather than beside it.
          (hh && isCatalogTab && railOpen) ? h('div', { className: 'st-scrim', onClick: function () { setRailOpen(false); } }) : null,
          (hh && isCatalogTab && railOpen) ? h('nav', {
            className: 'hp-index st-rail st-drawer', 'aria-label': 'Categories and filters', 'data-store-zone': 'drawer',
          }, h('div', { className: 'st-drawerhd' }, 'NARROW THE SHELF',
               h('button', { type: 'button', className: 'hp-buy-btn st-close', onClick: function () { setRailOpen(false); } }, 'DONE')),
             railInner) : null,
          isBook ? bookFoot : foot,
          // B-671 — THE PURSE, WHERE THE BOARD PUTS IT: the last child of `.st`, below the foot and
          // ABOVE the app's bottom bar, which is `.st-surface`'s next sibling. The board's own rule for
          // it, from the creator's frame, is "a strip ABOVE the bar, never in it" — navigation is
          // navigation and a purse is a reading — and with the bar built (B-679) the sentence is
          // measurable rather than a promise.
          purseStrip,
          // B-667 — THE READ IS THE BOARD'S NOW, so it is NOT on an island: `ItemOverlay`'s paper
          // branch returns the scrim and the sheet itself, both absolute to `.st` exactly as the
          // summoned drawer above is. The island `read` is gone from the enumeration, and the only
          // one left inside the read is `compare` (B-668).
          legacyReadBody,
          // B-1125 — the GM's picker on paper, absolute to `.st` as the read is (G6–G9).
          (isGm && locOpen) ? h(LocationPicker, {
            paper: true, desk: band !== 'mobile', current: location,
            onPick: pickPlanet, onPickCircumstance: pickCircumstance, onToggleLane: toggleLane,
            onClose: function () { setLocOpen(false); },
          }) : null),
        legacyPickerBody);
    }

    return h('div', { style: { position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#07090e' } },
      // ── in-surface header: (GM) location masthead + title + count + search ──
      h('div', { style: Object.assign({ flexShrink: 0, padding: '14px 14px 0' }, deskCap) },
        isGm ? h(Masthead, { location: location, onOpen: function () { setLocOpen(true); } }) : null,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginTop: isGm ? 10 : 0 } },
          h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, letterSpacing: '0.08em', color: '#fff', textShadow: isGm ? ('0 0 24px ' + accent + '4D') : '0 0 24px rgba(78,170,255,0.3)' } },
            titles[tab] || 'THE STORE'),
          isCatalogTab || tab === 'holds' ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.35)' } },
            items.length + (isCatalogTab ? ' / ' + (catalog.bySection[tab] || []).length : '')) : null
        ),
        subCats.length ? h('div', { style: { display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 0 0', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } },
          [{ id: 'all', label: 'All' }].concat(subCats).map(function (c) {
            var active = subCat === c.id;
            return h('button', {
              key: c.id, onClick: function () { setSubCat(c.id); },
              style: {
                // B-114 — AS-6's 44px tap floor. Was 36, and this is ONE render site serving
                // TWELVE rendered chips across five tab states, in EVERY host that mounts the
                // store: the creator's gear sub-view and the character sheet's own store. One
                // component, one fix, both surfaces — which is why the guard asserts on both hosts
                // rather than on the one that happened to find it.
                // The radius moves with the height (22 = half of 44) because these are PILLS: a
                // fixed 18 on a 44px control is a rounded rectangle, and the shape is the chip's
                // whole identity in the sort bars this app uses everywhere.
                // AND minWidth, because AS-6 is a 44x44 TARGET, not a 44px height. "All" is the
                // shortest label in the set and came out 39px wide once the height was fixed —
                // caught only because retiring the tolerance list made the floor absolute; while
                // the whole class was tolerated, the width dimension was invisible. The other
                // eleven chips are wider than 44 on their labels alone, so this binds on exactly
                // one of them and costs the layout nothing.
                flexShrink: 0, minHeight: 44, minWidth: 44, padding: '7px 13px', borderRadius: 22,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                background: active ? accent + '1E' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (active ? accent + '55' : 'rgba(255,255,255,0.08)'),
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
                color: active ? accent : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', touchAction: 'manipulation',
              },
            }, c.label);
          })
        ) : null,
        (isCatalogTab || tab === 'holds') ? h('input', {
          value: search, onChange: function (e) { setSearch(e.target.value); },
          placeholder: 'Search…', 'aria-label': 'Search items',
          style: {
            width: '100%', margin: '10px 0 0', padding: '9px 12px', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.03)', border: '1px solid ' + accent + '22', borderRadius: 6,
            fontFamily: 'var(--font-body)', fontSize: 13, color: '#fff', outline: 'none',
          },
        }) : null
      ),
      // ── body ──
      h('div', { style: Object.assign({ flex: 1, overflowY: 'auto', padding: '12px 14px 20px' }, deskCap) },
        tab === 'shelves'
          ? h(ShelfView, {
              shelfState: shelfState, byId: byId, locationMod: locationMod,
              qualify: function (id) { return qualifyKey(id, byId); },
              onSwitch: switchShelf, onCreate: createShelf, onRename: renameShelf, onDelete: deleteShelf,
              onRemoveItem: toggleShelfItem, onOpenItem: function (id) { setOpenId(id); },
            })
        : tab === 'counter'
          ? counterBody
          : legacyShelfBody
      ),
      // ── overlay ──
      legacyReadBody,
      // ── location picker (GM) ──
      (isGm && locOpen) ? h(LocationPicker, {
        current: location,
        onPick: pickPlanet,
        onPickCircumstance: pickCircumstance,
        onToggleLane: toggleLane,
        onClose: function () { setLocOpen(false); },
      }) : null,
      // ── roster picker (chip-driven picks come from the host; this one covers compare/finalize) ──
      legacyPickerBody
    );
  }

  /* ══════════════════════════════════════════════════════
     ARTWORK PANEL (BYOA) — the player ⚙ "ITEM ARTWORK" surface
     Batch import (folder picker), the honest match report, per-item count, clear-all.
     Kernel-owned so GM inherits it when ITM-B adopts the kernel views.
  ══════════════════════════════════════════════════════ */
  function ArtworkPanel(props) {
    var accent = props.accent || '#4EAAFF';
    var UA = window.SWRPGUserArt;
    var _c = useState(0), count = _c[0], setCount = _c[1];
    var _rep = useState(null), report = _rep[0], setReport = _rep[1];
    var _busy = useState(false), busy = _busy[0], setBusy = _busy[1];
    var _arm = useState(false), clearArmed = _arm[0], setClearArmed = _arm[1];
    var _showUnmatched = useState(false), showUnmatched = _showUnmatched[0], setShowUnmatched = _showUnmatched[1];
    var folderRef = useRef(null), filesRef = useRef(null);
    // NO useBackToClose here — this panel opens from the settings ModuleMenu, which closes itself
    // via history.back(); a useBackToClose here would catch that same pop and self-close instantly.
    // The X + scrim-click are the escapes (a settings modal needs no history entry).
    useEffect(function () {
      if (!UA) return undefined;
      var alive = true;
      function refresh() { UA.ready().then(function () { if (alive) setCount(UA.count()); }); }
      refresh();
      var unsub = UA.subscribe(refresh);
      return function () { alive = false; if (unsub) unsub(); };
    }, []);
    function doImport(fileList) {
      if (!UA || !fileList || !fileList.length) return;
      setBusy(true);
      UA.importFiles(fileList).then(function (r) { setReport(r); setBusy(false); });
    }
    var btn = function (label, onClick, primary) {
      return h('button', {
        onClick: onClick,
        style: {
          minHeight: 46, padding: '10px 16px', cursor: 'pointer', borderRadius: 8,
          background: primary ? (accent + '18') : 'rgba(255,255,255,0.03)',
          border: '1px solid ' + (primary ? (accent + '66') : 'rgba(255,255,255,0.14)'),
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em',
          color: primary ? accent : 'rgba(255,255,255,0.7)',
        },
      }, label);
    };
    return h('div', { style: { position: 'fixed', inset: 0, zIndex: 250, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' } },
      h('div', { onClick: props.onClose, style: { position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.68)' } }),
      h('div', {
        role: 'dialog', 'aria-label': 'Item artwork',
        style: {
          position: 'relative', maxHeight: '86%', overflowY: 'auto',
          background: 'rgba(10,14,22,0.99)', borderTop: '1px solid ' + accent + '55',
          borderRadius: '14px 14px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
          animation: 'slideUpBounce 0.3s cubic-bezier(0.32,1.2,0.5,1) forwards',
          display: 'flex', flexDirection: 'column', gap: 14,
        },
      },
        h('button', { onClick: props.onClose, 'aria-label': 'Close',
          style: { position: 'absolute', top: 8, right: 10, minWidth: 44, minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 18 } }, '×'),
        h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, letterSpacing: '0.08em', color: '#fff' } }, 'ITEM ARTWORK'),
        h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' } },
          'Bring your own item images. Drop in a folder of pictures named by item — the store shows them in place of the silhouettes. Files are matched by item id (', h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#9fd' } }, 'vibro_ax.webp'),
          ') or OggDude key (', h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#9fd' } }, 'Weapon12DEFEND.png'),
          '). Everything stays on this device — nothing is uploaded.'),
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: count > 0 ? '#9BE8B2' : 'rgba(255,255,255,0.4)' } },
          count > 0 ? ('YOU HAVE ART FOR ' + count + (count === 1 ? ' ITEM' : ' ITEMS')) : 'NO IMPORTED ART YET — THE STORE SHOWS SILHOUETTES'),
        // hidden pickers
        h('input', {
          ref: folderRef, type: 'file', multiple: true, style: { display: 'none' },
          'aria-label': 'Import a folder of item images',
          webkitdirectory: 'true', directory: 'true',
          onChange: function (e) { doImport(e.target.files); e.target.value = ''; },
        }),
        h('input', {
          ref: filesRef, type: 'file', multiple: true, accept: 'image/*', style: { display: 'none' },
          'aria-label': 'Import selected item images',
          onChange: function (e) { doImport(e.target.files); e.target.value = ''; },
        }),
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
          btn(busy ? 'IMPORTING…' : 'IMPORT A FOLDER', function () { if (!busy && folderRef.current) folderRef.current.click(); }, true),
          btn('PICK IMAGES', function () { if (!busy && filesRef.current) filesRef.current.click(); })
        ),
        // the honest report (R-BYOA1: unmatched are listed, never silently dropped)
        report ? h('div', { style: { padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' } },
          h('div', { style: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(255,255,255,0.85)' } },
            'Matched ' + report.matched + ' of ' + report.total + (report.total === 1 ? ' file' : ' files')
            + ' → ' + report.matched + (report.matched === 1 ? ' item now has art' : ' items now have art') + '.'),
          report.unmatched.length ? h('div', { style: { marginTop: 8 } },
            h('button', {
              onClick: function () { setShowUnmatched(!showUnmatched); }, 'aria-expanded': showUnmatched,
              style: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#FFC857' } },
              (showUnmatched ? '▾ ' : '▸ ') + report.unmatched.length + ' UNMATCHED (NO ITEM FOR THESE NAMES)'),
            showUnmatched ? h('div', { style: { marginTop: 6, maxHeight: 160, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7, color: 'rgba(255,255,255,0.5)' } },
              report.unmatched.map(function (n, i) { return h('div', { key: i }, n); })) : null
          ) : null
        ) : null,
        // clear all (two-tap arm)
        count > 0 ? h('div', { style: { paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' } },
          h('button', {
            onClick: function () {
              if (clearArmed) { UA.clearAll(); setClearArmed(false); setReport(null); }
              else setClearArmed(true);
            },
            style: {
              minHeight: 44, padding: '8px 16px', cursor: 'pointer', borderRadius: 8,
              background: clearArmed ? 'rgba(255,85,85,0.16)' : 'none',
              border: '1px solid ' + (clearArmed ? 'rgba(255,85,85,0.6)' : 'rgba(255,255,255,0.14)'),
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em',
              color: clearArmed ? '#FF7676' : 'rgba(255,255,255,0.55)',
            },
          }, clearArmed ? 'TAP AGAIN TO CLEAR ALL IMPORTED ART' : 'CLEAR ALL IMPORTED ART')
        ) : null
      )
    );
  }

  /* ══════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════ */
  window.SWRPGStore = {
    Store: Store,
    RosterPicker: RosterPicker,
    SellSheet: SellSheet,
    ArtworkPanel: ArtworkPanel,
    session: session,
    loadHolds: loadHolds,
    holdsCount: function () { return loadHolds().length; },
    cartCount: function () { return session.cart.reduce(function (s, l) { return s + (Number(l.qty) || 1); }, 0); },
    RARITY_BANDS: RARITY_BANDS,
    SELL_TIERS: SELL_TIERS,
    SELL_CITE: SELL_CITE,
    rarityBand: rarityBand,
    buildNextEquipment: buildNextEquipment,
    stackTargetOf: stackTargetOf,
    // SHIP YARD S4 · G-7: the counter's ONE writer (R-S4WC-16) and its one-reader twin (B7) — the Yard's only way in
    addToCounter: addToCounter,
    counterVesselLines: counterVesselLines,
    glyphFamily: glyphFamily,   // exposed for the node guard
    glyph: glyphSvg,            // the host bars reuse the same silhouettes (ADR 0010 store bar)
    FindLine: FindLine,         // the EXISTING shared find-difficulty renderer (Table 5-1); reused by the Ship Yard (SHIPYARD Y1, §3.5 fence — existing renderer, not a new one)
  };
})();
