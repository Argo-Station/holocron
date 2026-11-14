/**
 * sources.js — THE shared ACTIVE SOURCES predicate (BOOKS-1b; rulings books-filter-go +
 * books-filter-scope §3 + books-1a).
 *
 * ONE home for "is this record's book turned on?" — consumed by every discovery surface
 * (creator pickers, the universal shelf, the force-powers pool, the store catalog, the Ship
 * Yard index/acquire, the vehicle-attachments picker). The NPC library is EXCLUDED v1 by name
 * (its per-record sourcing isn't registry-grade — filtering it would be fake precision).
 *
 * TWO LAWS (ruling §1):
 *   1. Filters DISCOVERY, never OWNERSHIP. resolve-at-render NEVER calls this; a character /
 *      vessel / shelf already using content from a disabled book keeps working untouched.
 *   2. DEFAULT BY GROUP (G12 / F-48, ruling community-default-off — supersedes BOOKS-1b's original
 *      "everything on"): OFFICIAL books (Core / Era / Supplement) are ON by default; COMMUNITY +
 *      homebrew (Community / UserData) are OFF by default (opt-in). An UNKNOWN book (not in the
 *      vocab) is still never hidden (Law 2 hardening). The persisted state is v2
 *      { override: {bookId: bool} } — per-book flips over the group defaults; v1 { off } migrates
 *      losslessly (each off → override=false). The migration is SILENT in-app (Jason override,
 *      ruling §3): no notice component; the panel's "OFF BY DEFAULT · OPT IN" group hint is the
 *      standing furniture and the transition line rides the Discord update channel.
 *
 * The book vocabulary (alias → book id, id → {label, group, line}) is books.vocab.json. A
 * record is ACTIVE if ANY of its `sources` maps to a book NOT in the resolved OFF set (group
 * defaults + overrides; see resolvedOff/current). A record with no sources is always active.
 *
 * Cores compose with the creator's ERA step (Amendment 1): the global filter is the table's
 * SHELF (all books incl. cores); the era step picks among the globally-active cores for one
 * character. `isActive` takes an optional `eraLines` set — when present, a record whose ONLY
 * active books are cores must have at least one of those cores' lines in eraLines. Supplements/
 * era-books/community are unaffected by the era set.
 *
 * SEPARATELY (W2, ruling provenance-w1-w2-handoff): `contentEraOf` reads the vocabulary's `era`
 * column — which period of the saga a book's content depicts. That is a DIFFERENT axis from the
 * `line`/`eraLines` gate described above, shares none of its machinery, and has no consumer yet
 * (W4's GM facets are the first). Nothing in this module's filtering behaviour changed for it.
 *
 * Pure logic + a thin localStorage edge. Dual-export (browser window.SWRPGSources / CommonJS)
 * so test/sources.cjs exercises the predicate in Node with an injected vocab.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_active_sources';
  var STORE_VERSION = 2;   // G12 (F-48): v2 = { override: {bookId: true|false} } over per-group defaults

  // G12 (ruling community-default-off, §2): a book's DEFAULT active state is its GROUP —
  // official (Core / Era / Supplement) ON; community + homebrew (Community / UserData) OFF (opt-in).
  // Jason 2026-07-18: "official on by default; community/homebrew off, opt-in." An `override` entry
  // flips any individual book either way; a book absent from override sits at its group default.
  var OFFICIAL_GROUPS = { Core: true, Era: true, Supplement: true };
  function groupDefaultOn(group) { return !!OFFICIAL_GROUPS[group]; }
  // isBookActive(index, state, id) — the ONE derivation: group default, flipped by any override.
  function isBookActive(index, state, id) {
    var s = normalize(state);
    if (Object.prototype.hasOwnProperty.call(s.override, id)) return !!s.override[id];
    var meta = index && index.byId && index.byId[id];
    return groupDefaultOn(meta && meta.group);   // unknown group → off; but unknown BOOKS never reach here (Law 2 is in isActiveWith)
  }
  // resolvedOff(index, state) → { id: true } for every vocab book that is effectively OFF. This is the
  // set the (unchanged) isActiveWith predicate consumes, so consumers keep passing `current().off`.
  function resolvedOff(index, state) {
    var s = normalize(state), off = {};
    Object.keys((index && index.byId) || {}).forEach(function (id) {
      if (!isBookActive(index, s, id)) off[id] = true;
    });
    return off;
  }

  // ── vocabulary (injected in Node; fetched in the browser) ──────────────
  // buildIndex(vocab) → { aliasToId, byId }. aliasToId maps every registry `sources` string to
  // a book id; byId maps id → {label, group, line}.
  function buildIndex(vocab) {
    var aliasToId = {}, byId = {}, hiddenSourceCodes = {};
    ((vocab && vocab.entries) || []).forEach(function (e, i) {
      // `era` (W2) is carried alongside `line` because they are two INDEPENDENT axes of the same
      // row — see contentEraOf below. Nothing in the active-sources predicate reads it; it rides
      // here so the vocabulary is fetched and parsed exactly once for both axes.
      // `order` (F-67) is the row's POSITION in the vocabulary, which is its SHIP ORDER — the
      // vocabulary is append-only, so an earlier row is an earlier-shipped book. namePrecedenceOf
      // reads it for Amendment 1 A-2's "earliest-shipped community source" tiebreak and nothing
      // else does. Carried here for the same reason `era` is: one parse, two axes.
      byId[e.id] = { id: e.id, label: e.label, group: e.group, line: e.line, era: e.era, order: i };
      (e.aliases || []).forEach(function (a) { aliasToId[a] = e.id; });
      // THE IDENTITY MAPPING (F-102 A3). An id must resolve ITSELF, and until now it did not:
      // this loop mapped only the alias list, so `aliasToId['far_horizons']` was undefined and
      // every consumer that resolves a source string fell through to printing the raw key. It
      // looked fine because THREE of the 67 entries happen to list their own id among their
      // aliases (eote, aor, fad) — the three a spot-check would reach for. Measured through this
      // module in node: sourceLabel('eote') gave the title, sourceLabel('far_horizons') gave
      // 'far_horizons'. B-332 would have written key-form sources into weapons and shipped raw
      // keys onto the store's cite plate; the consumer check caught it before any write.
      aliasToId[e.id] = e.id;
    });
    // hidden_source_codes (BOOKS-1b D2): source codes intentionally kept OUT of discovery with NO
    // vocab row (e.g. aorbeta — the two unique-canon AoR-beta ships). Distinct from unmapped: the
    // vehicle-sweep validator treats these as known-hidden, not a loud missing-alias. Ownership is
    // never touched — an owned/acquired instance still resolves; only discovery drops them.
    ((vocab && vocab.hidden_source_codes) || []).forEach(function (c) { hiddenSourceCodes[c] = true; });
    return { aliasToId: aliasToId, byId: byId, hiddenSourceCodes: hiddenSourceCodes };
  }

  // ── display ────────────────────────────────────────────────────────────
  // sourceLabel(index, src) → what a surface should PRINT for one `sources` entry.
  //
  // ONE resolver, because there were about to be two: player/app.jsx carries a local
  // `sourceLabel` over the same index, and the store's cite plate had none at all and printed the
  // raw array. A second resolution path for a shared quantity is the defect PRAXIS §5 names,
  // whatever it is called, so this is the shared one and consumers call it.
  //
  // IT MUST TOLERATE BOTH FORMS AT ONCE. B-336 normalises 2,473 display-title entries to keys
  // registry by registry, so for the whole of that transition a `sources` array can hold a vocab
  // KEY, a display TITLE, or both — and every one of them has to render. A resolver that only
  // understood keys would blank the fourteen registries that have not been converted yet.
  //
  // A HIDDEN SOURCE CODE (BOOKS-1b D2: aorbeta, fadbeta) has no vocab row ON PURPOSE — beta
  // content is invisible to the active-sources filter by design. It is returned AS-IS rather than
  // blanked or mapped to a release book: mapping it would falsify the record's provenance, and
  // blanking it would hide a citation the data legitimately carries.
  // sourceMeta(index, src) → the vocabulary ROW behind one `sources` entry, or null.
  //
  // WHY THIS EXISTS (B-336's LOGIC class). Several consumers do not print the source — they
  // interrogate it, by string-matching a hard-coded TITLE:
  //     glMap = { eote: 'Edge of the Empire', ... };  src.indexOf(glStr) >= 0     // "my game line?"
  //     coreSources = ['Force and Destiny Core Rulebook', ...];  indexOf(s) >= 0  // "a core book?"
  // Those are asking questions the VOCABULARY already answers — `line` and `group` are columns on
  // the row. String-matching the title was always an indirection; it merely happened to work while
  // every registry stored titles, and it would have broken SILENTLY the moment B-336 stored keys:
  // no error, no key visible on screen, just careers and Force powers coming back in a worse order
  // with nobody the wiser.
  //
  // So the fix is not "compare keys instead of titles" — it is to ask the question directly. That
  // is correct on its own terms AND form-agnostic: a title and its key resolve to the same row, so
  // these consumers stop caring which form the registry holds, which is what actually unblocks
  // B-336's per-registry conversion rather than merely surviving it.
  function sourceMeta(index, src) {
    if (!src || typeof src !== 'string' || !index) return null;
    var id = index.aliasToId && index.aliasToId[src];
    return (id && index.byId && index.byId[id]) || null;
  }

  // The two questions B-336's LOGIC sites were asking the hard way, answered here ONCE so they can
  // be TESTED. They lived inline in player/app.jsx as title string-matching, where a 22k-line React
  // file made them unreachable by any guard — which is a large part of why they were wrong for so
  // long and why nothing noticed. A predicate that cannot be called by a test is a predicate that
  // gets verified by eye, once, on the day it is written.
  //
  // Both take the record, not the string, because both are asking about a RECORD ("is this career
  // from my line", "does this power come from a core book") and a record can carry several sources.

  // isFromLine(index, rec, line) — does any of the record's sources belong to that game line?
  // `line` is the vocabulary's own column ('eote' | 'aor' | 'fad' | 'era' | null).
  function isFromLine(index, rec, line) {
    if (!index || !line || !rec) return false;
    return (rec.sources || []).some(function (s) {
      var m = sourceMeta(index, s);
      return !!(m && m.line === line);
    });
  }

  // hasCoreSource(index, rec) — is any of the record's sources a CORE rulebook? `group` is the
  // vocabulary's column, so this stays true when a fourth core book ships and no list is edited.
  function hasCoreSource(index, rec) {
    if (!index || !rec) return false;
    return (rec.sources || []).some(function (s) {
      var m = sourceMeta(index, s);
      return !!(m && m.group === 'Core');
    });
  }

  function sourceLabel(index, src) {
    if (!src || typeof src !== 'string') return '';
    if (!index) return src;
    var id = index.aliasToId && index.aliasToId[src];
    var meta = id && index.byId && index.byId[id];
    if (meta && meta.label) return meta.label;
    return src;   // display title (pre-B-336), hidden code, or an unmapped string — never blank
  }

  // ── the predicate (pure) ───────────────────────────────────────────────
  // record: any registry record ({ sources: [...] }). offSet: Set/obj of book ids turned OFF.
  // index: from buildIndex. eraLines (optional): Set/obj of campaign lines. Only the OPT-IN
  // "limit to campaign era" preference passes eraLines (BOOKS-1c); default creation + the store/
  // yard/attachment consumers pass none, so the era branch never runs for them.
  function isActiveWith(record, index, offSet, eraLines) {
    var srcs = (record && record.sources) || [];
    if (!srcs.length) return true;                 // unsourced app content is never hidden
    var off = asSet(offSet), eras = eraLines ? asSet(eraLines) : null;
    var anyActive = false, anyEraAgnostic = false, lineBoundLines = [];
    for (var i = 0; i < srcs.length; i++) {
      var id = index.aliasToId[srcs[i]];
      if (!id) { anyActive = true; anyEraAgnostic = true; continue; }  // unknown book → ON (Law 2), era-agnostic. Canonical registries can't hit this (L1bk); the vehicle library / future data can.
      if (off[id]) continue;                       // this book is turned OFF
      anyActive = true;
      var meta = index.byId[id];
      var line = meta && meta.line;
      // A LINE-BOUND book (a core OR a supplement of that line) gates by its line against the era
      // set. Era-books (line 'era', e.g. Rise of the Separatists), community (line null), and unknown
      // books are ERA-AGNOSTIC — they ignore the era set (so a strict-era table still keeps its
      // cross-era Clone-Wars / community content).
      if (line === 'eote' || line === 'aor' || line === 'fad') lineBoundLines.push(line);
      else anyEraAgnostic = true;
    }
    if (!anyActive) return false;
    // Era composition (opt-in): a record gated ONLY by lines shows iff at least one of those lines is
    // the campaign; any era-agnostic active source lets it through. resolve-at-render passes no era
    // set, so ownership is never touched — only the creator's pickers, and only when the pref is on.
    if (eras && !anyEraAgnostic) {
      return lineBoundLines.some(function (ln) { return eras[ln]; });
    }
    return true;
  }

  // ── DISCOVERY PRECEDENCE + THE RENDER DEDUPE (F-67; ruling `csg-species-import-census`
  //    AMENDMENT 1 A-2) ──────────────────────────────────────────────────────────────────────
  //
  // WHY THIS EXISTS. The Complete Species Guide imports all 284 of its readable species under
  // their OWN ids (`csg_barabel`), because D-PS3 forbids redefining an id another source owns and
  // says nothing about importing. That is ADDING, which is legal — but it means two active records
  // can now claim the same species by name, and a picker that offers both is a picker that lies.
  // So DISCOVERY picks exactly one, by the ruled order:
  //
  //     official FFG book  >  earliest-shipped community source  >  later community source
  //
  // THIS IS DISCOVERY, NEVER OWNERSHIP (Law 1, restated because this is the function most likely
  // to be mistaken for a resolver). A character stores the specific record id it was built with;
  // resolve-at-render never calls this, so a character built on the Menagerie's `barabel` keeps
  // the Menagerie's stats forever no matter which shelf switches move. Amendment 1 A-3.
  //
  // namePrecedenceOf(record, index) → a number; LOWER WINS.
  //   official (Core/Era/Supplement) → 0 + the book's vocabulary position
  //   an UNKNOWN book               → 500 (never hidden by Law 2, and never outranks a known book)
  //   community / user data         → 1000 + the book's vocabulary position
  // A record's rank is its BEST source's rank. An unsourced record ranks as official-first (0):
  // unsourced app content is never hidden anywhere else either.
  var OFFICIAL_RANK = 0, UNKNOWN_RANK = 500, COMMUNITY_RANK = 1000;
  function namePrecedenceOf(record, index) {
    var srcs = (record && record.sources) || [];
    if (!srcs.length) return OFFICIAL_RANK;
    var best = Infinity;
    for (var i = 0; i < srcs.length; i++) {
      var id = index && index.aliasToId ? index.aliasToId[srcs[i]] : null;
      var meta = id && index.byId ? index.byId[id] : null;
      var r = !meta ? UNKNOWN_RANK
            : (OFFICIAL_GROUPS[meta.group] ? OFFICIAL_RANK : COMMUNITY_RANK) + (meta.order || 0);
      if (r < best) best = r;
    }
    return best === Infinity ? UNKNOWN_RANK : best;
  }

  // dedupeName — the comparison key. TRIM + CASE + the TYPOGRAPHIC APOSTROPHE, and nothing else.
  // Deliberately narrow: `’` and `'` are the same character in two encodings (CSG prints "Pau’an",
  // we ship "Pau'an"), so collapsing them is a decoding fact, not a guess. It does NOT strip a
  // parenthetical — "Jawa (Unofficial Species Menagerie)" is a DELIBERATE distinct offering (F-47
  // renamed it so both could stand), and quietly folding it away would retire a shipped decision
  // without a ruling. Two independent censuses of the Species Guide disagreed by ten species purely
  // on name normalisation; this is why the rule is one line long and says what it refuses.
  function dedupeName(name) {
    return String(name || '').replace(/’/g, "'").trim().toLowerCase();
  }

  // dedupeByName(list, index) — one record per species name, best precedence wins, input order
  // preserved. Ties (equal rank) break on id so the result is TOTAL and stable rather than
  // dependent on registry position. Runs AFTER the active filter and only ever sees active records,
  // which is what makes "Menagerie off, CSG on → CSG's Barabel" fall out rather than be coded.
  function dedupeByName(list, index) {
    var arr = Array.isArray(list) ? list : [];
    var best = {};
    arr.forEach(function (rec) {
      var k = dedupeName(rec && rec.name);
      if (!k) return;
      var r = namePrecedenceOf(rec, index);
      var cur = best[k];
      if (!cur || r < cur.rank || (r === cur.rank && String(rec.id) < String(cur.rec.id))) {
        best[k] = { rank: r, rec: rec };
      }
    });
    return arr.filter(function (rec) {
      var k = dedupeName(rec && rec.name);
      return !k || best[k].rec === rec;
    });
  }

  // groupByName(list) — the SAME key `dedupeByName` collapses on, but keeping every member instead
  // of the winner. `{ <dedupeName>: [rec, …] }`, members in input order.
  //
  // THIS IS THE WHOLE MECHANISM OF THE MULTI-SOURCE PICKER (ruling `multi-source-picker`): the
  // information the picker needs — that this name is supplied by more than one active source, and
  // by WHICH records — exists for exactly as long as it takes `dedupeByName` to throw it away. So
  // it is captured BEFORE the collapse, from the same input, by the same key. A second key here
  // would mean the chip could count a group the list does not actually collapse, which is the one
  // way this feature could lie.
  //
  // REGISTRY-AGNOSTIC (R-SCP-5): it takes a list of `{name}` and knows nothing about species. The
  // collision census has only been run for species, so V1 uses it there — but nothing in this
  // function would need changing to mark a duplicated career or talent.
  function groupByName(list) {
    var out = {};
    (Array.isArray(list) ? list : []).forEach(function (rec) {
      var k = dedupeName(rec && rec.name);
      if (!k) return;
      (out[k] = out[k] || []).push(rec);
    });
    return out;
  }

  function asSet(x) {
    if (!x) return {};
    if (x instanceof Object && typeof x.has === 'function') {   // a real Set
      var o = {}; x.forEach(function (v) { o[v] = true; }); return o;
    }
    if (Array.isArray(x)) { var a = {}; x.forEach(function (v) { a[v] = true; }); return a; }
    return x;   // already a plain {id:true} map
  }

  // Books grouped for the settings UI: {Core:[...], Era:[...], Supplement:[...], Community:[...],
  // UserData:[...]} — each entry {id, label, active}. Order within group = vocab order.
  function groupedBooks(index, state) {
    var s = normalize(state), groups = {};
    Object.keys(index.byId).forEach(function (id) {
      var m = index.byId[id];
      (groups[m.group] = groups[m.group] || []).push({
        id: id, label: m.label, line: m.line,
        active: isBookActive(index, s, id),
        defaultOff: !groupDefaultOn(m.group),   // G12: opt-in groups (Community/UserData) — the panel hints
      });
    });
    return groups;
  }

  // ── the CONTENT-ERA axis (W2, ruling provenance-w1-w2-handoff §W2) ─────
  // A PURE READ of books.vocab.json's `era` column, and the ONLY reader of it. This is a SECOND,
  // INDEPENDENT axis from the line/era gate in isActiveWith above: `line` answers "which product
  // line published this book?" and gates the opt-in campaign-line preference; `era` answers "which
  // period of the saga is this book's own frame set in?", which is a property of the CONTENT and
  // says nothing about which line shipped it (Heroes on Both Sides is line-less and Clone Wars;
  // Allies and Adversaries is line-less and era-agnostic). The two never compose here — W4's GM
  // facets will decide how they meet, and until then this export has ZERO consumers by design, so
  // that when a facet lands there is one derivation to point it at instead of four.
  //
  // D-PS1 (binding): `agnostic` is the DEFAULT — a book carries an era ONLY where its own frame
  // states one, because a wrong era is worse than none. That makes the three "I don't know" cases
  // deliberately indistinguishable: an unknown book id, a vocab row written before the column
  // existed, and a row explicitly marked agnostic all answer 'agnostic'. A caller that needs to
  // tell them apart is asking a question this column was ruled not to answer.
  //
  // 'old_republic' WAS reserved and is now LEGAL (ruling `tor-p3-app-ingest-scope` R-P3A-1). The
  // reservation's own release condition — "do not add it until Old Republic content actually
  // enters" — was met by the lap that added it: `the_old_republic_era_sourcebook` carries the
  // book's five species and QUOTES the frame it claims (that row's `_note` holds the p6 quote),
  // because R-P3A-1 binds the era to what a book states about itself, never to an assumption.
  // Everything else about this column is unchanged: D-PS1's `agnostic` default still governs, and
  // 'high_republic' is still NOT legal — a different period with contrary corpus evidence, held
  // open deliberately (see the `light_and_life` row's protest note).
  var CONTENT_ERAS = { clone_wars: true, galactic_civil_war: true, sequel_era: true, agnostic: true, old_republic: true };
  function contentEraOf(index, bookId) {
    var meta = index && index.byId && index.byId[bookId];
    var era = meta && meta.era;
    return CONTENT_ERAS[era] ? era : 'agnostic';
  }

  // ── localStorage edge (browser only) ───────────────────────────────────
  function load() {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return { version: STORE_VERSION, override: {} };
      return normalize(JSON.parse(root.localStorage.getItem(KEY)));
    } catch (e) { return { version: STORE_VERSION, override: {} }; }
  }
  // normalize → the canonical v2 state { version:2, override:{bookId:bool} }. Accepts:
  //   · v2  { version:2, override:{...} } — pass through.
  //   · v1  { off:{bookId:true} } (or { version:1, off } / { off:[...] }) — MIGRATE LOSSLESSLY: each
  //     off entry becomes override[id]=false; community books (no v1 on-record) fall to their group
  //     default (off) — the policy taking effect (silent in-app per ruling §3; transition on Discord).
  //   · a plain (already-normalized) state — pass through.
  //   · anything else / bad shape → { override:{} } → GROUP DEFAULTS apply (official on, community off),
  //     NOT all-on (R-SY4 §2: bad shape degrades to the new default, not the old law).
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return { version: STORE_VERSION, override: {} };
    if (raw.override && typeof raw.override === 'object') {
      var ov = {};
      Object.keys(raw.override).forEach(function (id) { ov[id] = !!raw.override[id]; });
      return { version: STORE_VERSION, override: ov };
    }
    // v1 → v2 migration
    var override = {};
    if (Array.isArray(raw.off)) raw.off.forEach(function (id) { override[String(id)] = false; });
    else if (raw.off && typeof raw.off === 'object') Object.keys(raw.off).forEach(function (id) { if (raw.off[id]) override[id] = false; });
    return { version: STORE_VERSION, override: override };
  }
  function persist(state) {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return;
      root.localStorage.setItem(KEY, JSON.stringify(normalize(state)));
    } catch (e) { /* quota / private mode — drop the write, keep the app alive */ }
  }
  // setBook(state, id, on) → new state. Guarded: refuse to turn OFF the LAST active Core — an
  // empty creator is a broken app, not a choice (ruling §3). Returns {state, refused}.
  function setBook(state, index, id, on, coreCount) {
    var s = normalize(state);
    // turning OFF a Core: block if no OTHER core would remain active (derivation-aware).
    if (!on) {
      var meta = index.byId[id];
      if (meta && meta.group === 'Core') {
        var otherActiveCores = 0;
        Object.keys(index.byId).forEach(function (bid) {
          if (bid !== id && index.byId[bid].group === 'Core' && isBookActive(index, s, bid)) otherActiveCores++;
        });
        if (otherActiveCores < 1) return { state: s, refused: true };   // last active core — refuse
      }
    }
    // Record the override; drop it when it matches the group default (keep the map minimal).
    var m = index.byId[id];
    var def = groupDefaultOn(m && m.group);
    if (on === def) delete s.override[id];
    else s.override[id] = on;
    return { state: s, refused: false };
  }

  // ── browser loader + change broadcast (browser only; the Node guard uses buildIndex directly) ──
  // ready() fetches the vocab ONCE, builds the index, caches it on the root; resolves {index, off}.
  // Consumers filter synchronously via current() and re-render on the 'swrpg-sources-changed' event.
  function ready() {
    if (typeof root === 'undefined') return Promise.resolve(null);
    if (root._swrpgSourcesReady) return root._swrpgSourcesReady;
    root._swrpgSourcesReady = Promise.all([fetch('public/data/canonical/books.vocab.json')
      .then(function (r) { if (!r.ok) throw new Error('books.vocab ' + r.status); return r.json(); }), ownWordsLoad(), diceFontProbe()])
      .then(function (r) { root._swrpgSourcesIndex = buildIndex(r[0]); return current(); })
      .catch(function (e) {
        console.warn('[sources] vocab load failed — filter inert (all-on):', e);
        root._swrpgSourcesIndex = buildIndex({ entries: [] });   // empty index → nothing maps → everything visible
        return current();
      });
    return root._swrpgSourcesReady;
  }
  // current() → {index, off, state} synchronously (re-read live from storage), or null before ready().
  // `off` is the RESOLVED off-set (group defaults + overrides) so the (unchanged) isActiveWith
  // predicate + every consumer keep working without change; `state` is the raw v2 for the ⚙ panel.
  function current() {
    if (typeof root === 'undefined' || !root._swrpgSourcesIndex) return null;
    var idx = root._swrpgSourcesIndex, st = load();
    return { index: idx, off: resolvedOff(idx, st), state: st };
  }
  // save(state): persist the OFF set + broadcast so any open catalog/picker re-filters live.
  function save(state) {
    persist(state);
    broadcast();
  }
  function broadcast() {
    try { if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('swrpg-sources-changed')); } catch (e) { /* non-DOM host */ }
  }

  // ── S1 · THE BOOK LINE (ruling argo-a1-curation ADDENDUM 4 S1, approved as drawn D-504; answers B-1809) ──────────
  // The ONE "book + printed page" formatter for the player, GM and dice apps. A cite is `<book title> p.<printed page>`;
  // a book with no page is its title alone; several cites join with ' · '; a record with neither collapses to ''
  // (the caller draws no slot). The public copy prints it where the book's words were removed; holocron's sites that
  // print a cite already use the same two words through pageWord / pageCite, so their text is unchanged.
  //
  // pageWord(page): 'p.<page>', or '' with no page. pageCite(title, page): the title with its page word, or ''.
  function pageWord(page) { return page != null && page !== '' ? 'p.' + page : ''; }
  function pageCite(title, page) {
    var t = title == null ? '' : String(title), w = pageWord(page);
    return t ? (w ? t + ' ' + w : t) : '';
  }
  // A stored cite as {book, page}: the object form as it is, a "<book> p.<page>" string split, any other string a book.
  function citeParts(c) {
    if (!c) return null;
    if (typeof c === 'object') return c.book ? { book: c.book, page: c.page } : null;
    var m = /^(.+?) p\.(\S+)$/.exec(String(c).trim());
    return m ? { book: m[1], page: m[2] } : (String(c).trim() ? { book: String(c).trim(), page: null } : null);
  }
  // recordCites(index, rec): [{book, page}] in the record's `sources` order (or its `source` title). A book's page is
  // the first the record stores: `_book_page`, `cite`, `description_cite`, `tree_page` (with `cite`'s book), then the
  // lowest page among the cites its top-level rows carry (pool_mods, told, effects, …; a Force power's, its
  // abilities' rows). Cited books the sources do not
  // name follow. Books match through the vocabulary's aliases, so `eote` and its title are one book.
  function recordCites(index, rec) {
    if (!rec || typeof rec !== 'object') return [];
    var a2i = index && index.aliasToId, key = function (b) { var s = String(b); return (a2i && (a2i[s] || a2i[s.toLowerCase()])) || s; };
    var order = [], pages = {}, firstOf = {};
    function add(book, page, first) {
      if (book == null || book === '') return;
      var k = key(book);
      if (!(k in pages)) { order.push({ k: k, book: book }); pages[k] = null; }
      if (page == null || page === '') return;
      if (first) { if (!(k in firstOf)) firstOf[k] = page; return; }
      var n = parseInt(page, 10), cur = pages[k];
      if (cur == null || (!isNaN(n) && n < parseInt(cur, 10))) pages[k] = page;
    }
    (Array.isArray(rec.sources) ? rec.sources : []).forEach(function (s) { add(s, null); });
    if (!order.length && typeof rec.source === 'string') add(rec.source, null);
    [rec._book_page, rec.cite, rec.description_cite].forEach(function (c) { var p = citeParts(c); if (p) add(p.book, p.page, true); });
    if (rec.tree_page != null) { var tc = citeParts(rec.cite); if (tc) add(tc.book, rec.tree_page, true); }
    function rows(node) {
      Object.keys(node).forEach(function (f) {
        if (!Array.isArray(node[f]) || f === 'sources') return;
        node[f].forEach(function (row) { var p = row && typeof row === 'object' ? citeParts(row.cite) : null; if (p) add(p.book, p.page); });
      });
    }
    rows(rec);
    // a Force power's rows live on its abilities (`abilities.<key>`): their cites count as the power's
    if (rec.abilities && typeof rec.abilities === 'object' && !Array.isArray(rec.abilities)) {
      Object.keys(rec.abilities).forEach(function (k) { var ab = rec.abilities[k]; if (ab && typeof ab === 'object') { var c = citeParts(ab.cite); if (c) add(c.book, c.page); rows(ab); } });
    }
    return order.map(function (o) { return { book: o.book, page: o.k in firstOf ? firstOf[o.k] : pages[o.k] }; });
  }
  // bookLine(index, recOrCites): the S1 line. A record's cites (recordCites) or a list of cites, each titled through
  // sourceLabel, duplicates dropped, joined ' · '. '' when there is nothing to cite.
  function bookLine(index, x) {
    var cites = Array.isArray(x) ? x.map(citeParts).filter(Boolean) : recordCites(index, x), seen = {}, out = [];
    cites.forEach(function (c) {
      var t = pageCite(sourceLabel(index, String(c.book)), c.page);
      if (t && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    return out.join(' \u00b7 ');
  }

  // removedLine(rec): the S1 line a surface draws IN PLACE of a record's book words — only in a copy whose book text was
  // removed (BOOK_CONTENT 'removed', read through SWRPGTextHash.bookContent, its one reader; S6). null on holocron.work,
  // so its surfaces draw exactly as before; '' when the record cites nothing (the slot collapses, F9).
  function bookTextRemoved() {
    var T = root && root.SWRPGTextHash;
    return !!(T && typeof T.bookContent === 'function' && T.bookContent() === 'removed');
  }
  // removedLine(rec, cites): `cites` (a list, e.g. a told row's own cite) answers first when it names a book; else the record's.
  function removedLine(rec, cites) {
    if (!bookTextRemoved()) return null;
    var idx = root._swrpgSourcesIndex || null, own = Array.isArray(cites) ? bookLine(idx, cites.filter(Boolean)) : '';
    return own || (rec ? bookLine(idx, rec) : '');
  }

  // removedCellLine(rec): T1 (argo-a1-export ADDENDUM 6, D-510; mockup T1 @ d6b9f3286) — a narrow cell's ONE book: the
  // first of the record's cites that carries a page, as "<title> p.<page>"; with no page anywhere, the first book's title;
  // '' when it cites nothing (the plate stays empty, F9). null on holocron.work, so the cell draws its rule as before.
  function removedCellLine(rec) {
    if (!bookTextRemoved()) return null;
    var idx = root._swrpgSourcesIndex || null, cites = rec ? recordCites(idx, rec) : [];
    var paged = cites.filter(function (c) { return pageWord(c.page); })[0];
    if (paged) return pageCite(sourceLabel(idx, String(paged.book)), paged.page);
    return cites.length ? pageCite(sourceLabel(idx, String(cites[0].book)), null) : '';
  }

  // S3's short labels (argo-a1-export ADDENDUM 4 R-AE-7 (b)): ONE shipped file, public/data/canonical/own_words.json
  // {version, labels: {<section>: {<record id>: {<row key>: {slot, text, src}}}}}, written by apply_text_encodings.py and
  // fetched ONLY in a copy whose book text was removed (ready() loads it beside the book vocabulary, so a reader's label
  // and its book line arrive together). Never fetched on holocron.work: ownWords is null there and its surfaces draw as
  // before. Indexed by the owner id the app's rows carry: a talent's id; 'species:<id>:<ability slug>',
  // 'force:<id>:<ability>', 'sig:<id>:<ability>' (charResolve's row sources); 'item:<section>:<id>'; 'quality:<id>';
  // 'spend_table:<id>'. The row key is the file's less its owner part ('pool_mods/<row id>', 'pool_mods[0]', 'pos[1]').
  function ownWordsIndex(doc) {
    var out = {}, labels = (doc && doc.labels) || {};
    function put(owner, key, ent) { if (ent && ent.text) (out[owner] = out[owner] || {})[key] = String(ent.text); }
    function slug(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }   // CharResolve.abilitySlug
    Object.keys(labels).forEach(function (sec) {
      var recs = labels[sec] || {};
      Object.keys(recs).forEach(function (rid) {
        Object.keys(recs[rid] || {}).forEach(function (key) {
          var ent = recs[rid][key], parts = key.split('/');
          if (sec === 'species' || sec === 'force_powers' || sec === 'signature_abilities') {
            if (parts.length < 3) return;
            var head = parts.slice(0, -2).join('/'), tail = parts.slice(-2).join('/');   // an ability name may hold a '/'
            put(sec === 'species' ? 'species:' + rid + ':' + slug(head) : (sec === 'force_powers' ? 'force:' : 'sig:') + rid + ':' + head, tail, ent);
          } else if (sec === 'qualities') put('quality:' + rid, key, ent);
          else if (sec === 'spend_tables') put('spend_table:' + rid, key, ent);
          else if (sec === 'talents') put(rid, key, ent);
          else put('item:' + sec + ':' + rid, key, ent);
        });
      });
    });
    return out;
  }
  function ownWordsLoad() {
    if (!bookTextRemoved() || typeof fetch !== 'function') return Promise.resolve(null);
    if (root._swrpgOwnWordsReady) return root._swrpgOwnWordsReady;
    root._swrpgOwnWordsReady = fetch('public/data/canonical/own_words.json')
      .then(function (r) { if (!r.ok) throw new Error('own_words ' + r.status); return r.json(); })
      .then(function (doc) { root._swrpgOwnWords = ownWordsIndex(doc); return root._swrpgOwnWords; })
      .catch(function (e) { console.warn('[sources] own_words load failed — labels fall back to the book line:', e); root._swrpgOwnWords = {}; return null; });
    return root._swrpgOwnWordsReady;
  }
  // T3 (argo-a1-export ADDENDUM 6, D-510; mockup argo-public-step4.html T3 @ d6b9f3286): THE ONE FONT-ABSENT PROBE. The public
  // copy ships no dice font (a contributor brings it, BRING_YOUR_OWN_ART.md), and without it every die draws as the font's
  // raw letter ("lllk") and the PDF stops. Asked ONLY in a copy whose book text was removed, once per page, inside ready()
  // so a surface that waits for its sources has the answer at its first paint: each font file the shells' @font-face loads
  // is fetched once; a 404 (the file is not there) turns the fallback ON. A network error or abort, any other status, or a
  // present font (200) leaves it OFF, so a real connection failure keeps the PDF's connection notice. Never fetched on
  // holocron.work: diceFontAbsent() is false there and every die draws as before. The fallback itself is drawn by the
  // shared dice renderer (lib/shared/diceUI.jsx symbolSpan / renderPool, window.SWRPGDice.dieTag) and pdfSymbolKit.
  var DICE_FONT_FILES = ['public/fonts/sw-rpg-icons.woff', 'public/fonts/genesysglyphsanddice.woff2'];
  function diceFontProbe() {
    if (!bookTextRemoved() || typeof fetch !== 'function') return Promise.resolve(false);
    if (root._swrpgDiceFontProbe) return root._swrpgDiceFontProbe;
    root._swrpgDiceFontProbe = Promise.all(DICE_FONT_FILES.map(function (u) {
      return fetch(u).then(function (r) { return r.status === 404; }, function () { return false; });
    })).then(function (missing) {
      root._swrpgDiceFontAbsent = missing.some(Boolean);
      if (root._swrpgDiceFontAbsent) console.warn('[sources] dice font not found (404) — dice draw as word tags');
      return root._swrpgDiceFontAbsent;
    });
    return root._swrpgDiceFontProbe;
  }
  // diceFontAbsent(): true only in the public copy, after ready(), when a dice font file answered 404.
  function diceFontAbsent() { return !!(root && root._swrpgDiceFontAbsent) && bookTextRemoved(); }

  // ownWords(owner, keys): the label at the first of `keys` (a row key or a list of them) the owner has; '' when none
  // (the reader falls back to its S1 line, never to ""), null on holocron (no book text removed).
  function ownWords(owner, keys) {
    if (!bookTextRemoved()) return null;
    var by = owner != null && root._swrpgOwnWords ? root._swrpgOwnWords[owner] : null;
    if (!by) return '';
    var ks = Array.isArray(keys) ? keys : [keys];
    for (var i = 0; i < ks.length; i++) if (ks[i] != null && Object.prototype.hasOwnProperty.call(by, ks[i])) return by[ks[i]];
    return '';
  }
  // ownWordsOfRow(m): an offer row's label — an item row by the slot its owner stamped (`own_slot`, [owner, key]), a
  // talent-like owner's row by its id in the arrays a condition rides
  function ownWordsOfRow(m) {
    if (!m) return null;
    if (Array.isArray(m.own_slot)) return ownWords(m.own_slot[0], m.own_slot[1]);
    if (m.talentId == null || m.id == null) return bookTextRemoved() ? '' : null;
    return ownWords(m.talentId, ['pool_mods', 'roll_numbers', 'target'].map(function (f) { return f + '/' + m.id; }));
  }

  // modWords(rec, field, i): an item's built-in or optional mod line (`base_mods` / `added_mods`, R-AE-10). The record's
  // own words when it has them (holocron.work: always, unchanged); in the public copy, where the book-text scan blanked
  // the line, its own_words label (owner item:<section>:<id>, key "<field>[i]"), so a slot never shows a key; else ''.
  var ITEM_SECTIONS = ['weapons', 'armor', 'gear', 'attachments', 'vehicle_attachments'];
  function modWords(rec, field, i) {
    var m = rec && Array.isArray(rec[field]) ? rec[field][i] : null;
    if (m && m.description) return m.description;
    if (!m || rec.id == null || !bookTextRemoved() || !root._swrpgOwnWords) return '';
    for (var s = 0; s < ITEM_SECTIONS.length; s++) {
      var by = root._swrpgOwnWords['item:' + ITEM_SECTIONS[s] + ':' + rec.id];
      if (by && by[field + '[' + i + ']']) return by[field + '[' + i + ']'];
    }
    return '';
  }

  // ── the "limit to campaign era" preference (BOOKS-1c, opt-in, DEFAULT OFF) ──────────────
  // Off (default): the creator offers everything the shelf allows, cross-era (the game's own
  // posture — mixing "encouraged", fad p.341 / aor p.343). On: the creator's pickers gate content
  // to the campaign's era (for a strict single-era table). Only the creator reads this; nothing
  // else does. Stored as swrpg_line_filter ('1'/'0').
  var LINE_KEY = 'swrpg_line_filter';
  function lineFilterOn() {
    try { return (typeof root !== 'undefined' && root.localStorage) ? root.localStorage.getItem(LINE_KEY) === '1' : false; }
    catch (e) { return false; }
  }
  function setLineFilter(on) {
    try { if (typeof root !== 'undefined' && root.localStorage) root.localStorage.setItem(LINE_KEY, on ? '1' : '0'); } catch (e) {}
    broadcast();
  }


  // ── THE DERIVED ATTRIBUTION (F-102; R-FSA-1, R-FSA-A3-1, R-FSA-A5-1) ───────────────────────
  // "What does this book buy me", in numbers, RESOLVED AT RENDER over the registries — never a
  // typed field and never a generated blob. A book's row says `+8 species · +6 careers · +19
  // specs`; the head says the same summed over the books that are ON.
  //
  // THE ORDER IS THE RULED PRIORITY, NOT THE FILESYSTEM'S (R-FSA-A5-1). A narrow row keeps
  // categories in THIS order until its width is spent and sends the rest to "+N more", so what
  // survives on a phone is what a character creator is for. Sizing by COUNT does the opposite:
  // species, careers and specs are the smallest numbers in almost every book, so a largest-first
  // rule drops exactly the three a reader opens this box to check.
  var ATTR_ORDER = [
    { key: 'species',         label: 'species' },
    { key: 'careers',         label: 'careers' },
    { key: 'specializations', label: 'specs' },
    { key: 'talents',         label: 'talents' },
    { key: 'force_powers',    label: 'Force powers' },
    // ── items, below the priority line ──
    { key: 'weapons',         label: 'weapons' },
    { key: 'armour',          label: 'armour' },
    { key: 'gear',            label: 'gear' }
  ];

  // A registry arrives as a LIST or as a MAP keyed by id, depending on the file; both are real
  // shapes in `public/data/canonical/` and neither is worth normalising upstream for this.
  function _records(reg) {
    if (!reg) return [];
    if (Object.prototype.toString.call(reg) === '[object Array]') return reg;
    if (typeof reg !== 'object') return [];
    var out = [], k;
    for (k in reg) { if (Object.prototype.hasOwnProperty.call(reg, k)) out.push(reg[k]); }
    return out;
  }

  // attribution(index, sets) -> { byId, counted, missing, unmapped }
  //   sets     { species: <records>, careers: <records>, … } — whatever the caller has loaded.
  //   byId     { bookId: { registryKey: n } } — keyed by BOOK ID, so a book whose display label
  //            is edited cannot silently zero its own row.
  //   missing  registries the caller did not pass. An ABSENCE IS NOT A ZERO: a box that printed
  //            "+0 vehicles" would assert a measurement nobody made (SHOWS-vs-PRODUCES, R-DRC-1).
  //   unmapped source strings that resolve to no vocabulary row — reported, never counted, so a
  //            new book's records cannot vanish into a total silently.
  function attribution(index, sets) {
    sets = sets || {};
    var byId = {}, counted = [], missing = [], unmapped = {};
    ATTR_ORDER.forEach(function (r) {
      if (!Object.prototype.hasOwnProperty.call(sets, r.key) || sets[r.key] == null) {
        missing.push(r.key); return;
      }
      counted.push(r.key);
      _records(sets[r.key]).forEach(function (rec) {
        if (!rec || typeof rec !== 'object') return;
        var srcs = rec.sources || (rec.source ? [rec.source] : []);
        if (Object.prototype.toString.call(srcs) !== '[object Array]') return;
        // ONE ROW PER BOOK PER RECORD. A record naming the same book twice (an alias and its id)
        // is one offering, not two — the counts are what a reader is being told they gain.
        var seen = {};
        srcs.forEach(function (src) {
          var id = index && index.aliasToId ? index.aliasToId[src] : null;
          if (!id) {
            if (src && !(index && index.hiddenSourceCodes && index.hiddenSourceCodes[src])) {
              unmapped[src] = (unmapped[src] || 0) + 1;
            }
            return;
          }
          if (seen[id]) return;
          seen[id] = true;
          if (!byId[id]) byId[id] = {};
          byId[id][r.key] = (byId[id][r.key] || 0) + 1;
        });
      });
    });
    return { byId: byId, counted: counted, missing: missing, unmapped: unmapped };
  }

  // The parts of ONE book's line, in priority order, zeros omitted.
  function attributionParts(attr, bookId) {
    var got = (attr && attr.byId && attr.byId[bookId]) || {};
    var out = [];
    ATTR_ORDER.forEach(function (r) {
      if (got[r.key]) out.push({ key: r.key, label: r.label, n: got[r.key] });
    });
    return out;
  }

  // The same over MANY books — the head's total, and each group's own line.
  function attributionSum(attr, bookIds) {
    var tot = {};
    (bookIds || []).forEach(function (id) {
      var got = (attr && attr.byId && attr.byId[id]) || {}, k;
      for (k in got) { if (Object.prototype.hasOwnProperty.call(got, k)) tot[k] = (tot[k] || 0) + got[k]; }
    });
    var out = [];
    ATTR_ORDER.forEach(function (r) { if (tot[r.key]) out.push({ key: r.key, label: r.label, n: tot[r.key] }); });
    return out;
  }

  // `+8 species · +6 careers · +19 specs`. With a cap, the OVERFLOW becomes "+N more" rather than
  // an ellipsis: a reader can act on "+3 more", and an ellipsis only says something was hidden.
  function attributionText(parts, cap) {
    parts = parts || [];
    if (!parts.length) return '';
    var kept = parts, dropped = 0;
    if (cap != null && parts.length > cap) { kept = parts.slice(0, cap); dropped = parts.length - cap; }
    var line = kept.map(function (p) { return '+' + p.n + ' ' + p.label; }).join(' · ');
    return dropped ? line + ' · +' + dropped + ' more' : line;
  }

  var api = {
    KEY: KEY, STORE_VERSION: STORE_VERSION,
    buildIndex: buildIndex,
    isActiveWith: isActiveWith,
    groupedBooks: groupedBooks,
    setBook: setBook,
    load: load, normalize: normalize, persist: persist,
    ready: ready, current: current, save: save,
    lineFilterOn: lineFilterOn, setLineFilter: setLineFilter,
    // G12 (F-48): the group-default derivation (official on / community-homebrew opt-in).
    isBookActive: isBookActive, resolvedOff: resolvedOff, groupDefaultOn: groupDefaultOn,
    // W2: the content-era axis. Pure read, no consumers yet (W4's GM facets are the first).
    contentEraOf: contentEraOf, CONTENT_ERAS: CONTENT_ERAS,
    // F-67 (Amendment 1 A-2): DISCOVERY precedence + the one-per-name render dedupe.
    namePrecedenceOf: namePrecedenceOf, dedupeByName: dedupeByName, dedupeName: dedupeName,
    groupByName: groupByName,
    // F-102 A3: the ONE source-string → display-label resolver.
    sourceLabel: sourceLabel,
    // S1 (argo-a1-curation ADDENDUM 4; B-1809): the ONE book + printed page formatter.
    pageWord: pageWord, pageCite: pageCite, citeParts: citeParts, recordCites: recordCites, bookLine: bookLine,
    bookTextRemoved: bookTextRemoved, removedLine: removedLine, removedCellLine: removedCellLine,
    // S3 (R-AE-7 (b)): the public copy's short labels, read from own_words.json at 'removed' only
    ownWords: ownWords, ownWordsOfRow: ownWordsOfRow, ownWordsIndex: ownWordsIndex,
    modWords: modWords,
    // T3 (ADDENDUM 6, D-510): the one font-absent probe's answer, at 'removed' only
    diceFontProbe: diceFontProbe, diceFontAbsent: diceFontAbsent,
    // B-336: the row behind a source string — `line` and `group` answered directly, plus the
    // two record-level questions the LOGIC sites were string-matching for.
    sourceMeta: sourceMeta, isFromLine: isFromLine, hasCoreSource: hasCoreSource,
    // F-102 (R-FSA-A9-1): the sources box's derived line — counts resolved at render, never typed.
    ATTR_ORDER: ATTR_ORDER, attribution: attribution, attributionParts: attributionParts,
    attributionSum: attributionSum, attributionText: attributionText,
  };
  if (typeof root !== 'undefined') root.SWRPGSources = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
